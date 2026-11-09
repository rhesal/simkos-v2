-- ==============================================================================
-- Migrasi: 20261109000900_assets_phase4_bookkeeping.sql
-- Modul: Aset & Inventaris SimKos (Fase 4B-1)
-- Deskripsi: Skema Buku Pembantu Penyusutan Aset, Pengesahan Saldo Awal Multi-Versi,
--            Snapshot Parameter Aktivasi, Penguncian Periode, Batch Posting Atomik
--            Idempoten, Pembatalan Bertahap (Storno), Audit Append-Only,
--            dan Perlindungan Riwayat (ON DELETE RESTRICT pada organisasi & aset).
-- ==============================================================================

-- 1. Penyesuaian Check Constraint status_pencatatan & Trigger Validasi Status Aset
do $$
begin
  alter table public.assets drop constraint if exists assets_status_pencatatan_check;
  alter table public.assets add constraint assets_status_pencatatan_check check (
    status_pencatatan in ('draft', 'aktif', 'terverifikasi', 'dibukukan', 'diarsipkan')
  );
exception when others then
  null;
end $$;

-- Perbarui fungsi trigger validate_asset_relations agar mengizinkan status 'aktif' pada Fase 4
create or replace function public.validate_asset_relations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loc_org uuid;
  v_room_org uuid;
  v_room_loc uuid;
  v_inv_org uuid;
begin
  -- Cegah perubahan org_id setelah dibuat
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then
    raise exception 'SIMKOS_IMMUTABLE_ORG: Organisasi aset tidak dapat dipindahkan';
  end if;

  -- Pada Fase 4, status yang diizinkan adalah 'draft' atau 'aktif'
  if new.status_pencatatan not in ('draft', 'aktif', 'terverifikasi', 'dibukukan', 'diarsipkan') then
    raise exception 'SIMKOS_INVALID_STATUS: Status pencatatan aset tidak valid';
  end if;

  -- Validasi lokasi satu organisasi
  if new.location_id is not null then
    select org_id into v_loc_org from public.locations where id = new.location_id;
    if v_loc_org is null or v_loc_org <> new.org_id then
      raise exception 'SIMKOS_CROSS_TENANT_LOCATION: Lokasi (%) bukan milik organisasi (%)', new.location_id, new.org_id;
    end if;
  end if;

  -- Validasi kamar satu organisasi & kesesuaian lokasi kamar
  if new.room_id is not null then
    select org_id, location_id into v_room_org, v_room_loc from public.rooms where id = new.room_id;
    if v_room_org is null or v_room_org <> new.org_id then
      raise exception 'SIMKOS_CROSS_TENANT_ROOM: Kamar (%) bukan milik organisasi (%)', new.room_id, new.org_id;
    end if;

    if new.location_id is not null and v_room_loc <> new.location_id then
      raise exception 'SIMKOS_ROOM_LOCATION_MISMATCH: Kamar (%) berada di lokasi (%), tidak sesuai dengan lokasi aset (%)',
        new.room_id, v_room_loc, new.location_id;
    end if;
  end if;

  -- Validasi legacy inventory id (jika ada) harus satu organisasi
  if new.legacy_inventory_id is not null then
    select org_id into v_inv_org from public.inventories where id = new.legacy_inventory_id;
    if v_inv_org is null or v_inv_org <> new.org_id then
      raise exception 'SIMKOS_CROSS_TENANT_INVENTORY: Inventaris asal (%) bukan milik organisasi (%)',
        new.legacy_inventory_id, new.org_id;
    end if;
  end if;

  return new;
end;
$$;

-- 2. Tabel Pengaturan Tanggal Mulai Pembukuan Organisasi
create table if not exists public.asset_bookkeeping_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations(id) on delete restrict,
  tanggal_mulai_pembukuan date not null check (extract(day from tanggal_mulai_pembukuan) = 1),
  is_locked boolean not null default false,
  locked_reason text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Tabel Snapshot Parameter Aktivasi Aset
create table if not exists public.asset_activation_snapshots (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete restrict,
  version int not null default 1,
  algorithm_version text not null default 'v3.1-bresenham',
  snapshot_params jsonb not null,
  activated_by uuid references auth.users(id),
  activation_notes text,
  created_at timestamptz not null default now(),
  constraint uq_asset_activation_version unique (asset_id, version)
);

-- 4. Tabel Saldo Awal Resmi per Komponen (Multi-Versi)
create table if not exists public.asset_opening_balances (
  id uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.asset_components(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete restrict,
  version int not null default 1,
  status text not null default 'approved' check (status in ('approved', 'cancelled')),
  cutoff_date date not null,
  jalur_saldo text not null check (jalur_saldo in ('simulasi_historis', 'catatan_terdahulu')),
  biaya_perolehan numeric not null check (biaya_perolehan >= 0),
  nilai_sisa numeric not null default 0 check (nilai_sisa >= 0 and nilai_sisa <= biaya_perolehan),
  akumulasi_penyusutan_awal numeric not null check (
    akumulasi_penyusutan_awal >= 0 and akumulasi_penyusutan_awal <= (biaya_perolehan - nilai_sisa)
  ),
  nilai_buku_awal numeric not null check (
    nilai_buku_awal = (biaya_perolehan - akumulasi_penyusutan_awal) and nilai_buku_awal >= nilai_sisa
  ),
  akumulasi_usaha_awal numeric not null default 0 check (
    akumulasi_usaha_awal >= 0 and akumulasi_usaha_awal <= akumulasi_penyusutan_awal
  ),
  akumulasi_non_usaha_awal numeric not null default 0 check (
    akumulasi_non_usaha_awal >= 0 and akumulasi_non_usaha_awal <= akumulasi_penyusutan_awal
  ),
  sisa_dasar_penyusutan numeric not null check (sisa_dasar_penyusutan >= 0),
  sisa_target_usaha numeric not null default 0 check (sisa_target_usaha >= 0),
  sisa_bobot_manfaat numeric check (sisa_bobot_manfaat is null or sisa_bobot_manfaat >= 0),
  sisa_periode_kalender int check (sisa_periode_kalender is null or sisa_periode_kalender >= 0),
  status_estimasi text not null default 'valid' check (status_estimasi in ('valid', 'perlu_tinjauan_estimasi')),
  catatan_sumber text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz not null default now(),
  cancelled_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  constraint chk_opening_balance_portions check (
    akumulasi_penyusutan_awal = akumulasi_usaha_awal + akumulasi_non_usaha_awal
  ),
  constraint chk_opening_sisa_dasar check (
    sisa_dasar_penyusutan = (biaya_perolehan - akumulasi_penyusutan_awal) - nilai_sisa
  )
);

create unique index if not exists uq_active_component_opening_balance 
  on public.asset_opening_balances (component_id) 
  where status = 'approved';

-- 5. Tabel Status Periode Akuntansi Aset
create table if not exists public.asset_accounting_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  period_key text not null check (period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'open' check (status in ('open', 'locked')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  unlocked_at timestamptz,
  unlocked_by uuid references auth.users(id),
  unlock_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_org_accounting_period unique (org_id, period_key)
);

-- 6. Tabel Batch Posting Penyusutan (Dukungan Multi-Versi Reversal)
create table if not exists public.asset_depreciation_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  period_id uuid not null references public.asset_accounting_periods(id) on delete restrict,
  period_key text not null check (period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  batch_number text not null,
  idempotency_key text not null,
  payload_hash text not null,
  batch_status text not null default 'posted' check (batch_status in ('posted', 'reversed')),
  reversed_batch_id uuid references public.asset_depreciation_batches(id),
  replaces_batch_id uuid references public.asset_depreciation_batches(id),
  total_depreciation numeric not null check (total_depreciation >= 0),
  total_business_portion numeric not null check (total_business_portion >= 0),
  total_non_business_portion numeric not null check (total_non_business_portion >= 0),
  component_count int not null check (component_count >= 0),
  algorithm_version text not null default 'v3.1-bresenham',
  snapshot_version_map jsonb not null default '{}'::jsonb,
  preview_token text not null,
  posted_by uuid references auth.users(id),
  posted_at timestamptz not null default now(),
  reversed_by uuid references auth.users(id),
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  constraint uq_batch_org_idempotency unique (org_id, idempotency_key),
  constraint chk_batch_totals check (
    total_depreciation = total_business_portion + total_non_business_portion
  )
);

create unique index if not exists uq_active_posted_batch 
  on public.asset_depreciation_batches (org_id, period_key) 
  where batch_status = 'posted';

create unique index if not exists uq_batch_reversal_single 
  on public.asset_depreciation_batches (reversed_batch_id) 
  where batch_status = 'reversed';

-- 7. Tabel Buku Pembantu Penyusutan Aset (Sub-Ledger)
create table if not exists public.asset_depreciation_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  batch_id uuid not null references public.asset_depreciation_batches(id) on delete restrict,
  period_id uuid not null references public.asset_accounting_periods(id) on delete restrict,
  period_key text not null check (period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  asset_id uuid not null references public.assets(id) on delete restrict,
  component_id uuid not null references public.asset_components(id) on delete restrict,
  snapshot_id uuid references public.asset_activation_snapshots(id) on delete restrict,
  opening_balance_id uuid references public.asset_opening_balances(id) on delete restrict,
  entry_type text not null default 'regular' check (entry_type in ('regular', 'reversal', 'replacement')),
  reversed_ledger_id uuid references public.asset_depreciation_ledger(id),
  depreciation_amount numeric not null,
  business_portion_amount numeric not null,
  non_business_portion_amount numeric not null,
  porsi_usaha_persen numeric check (porsi_usaha_persen is null or (porsi_usaha_persen >= 0 and porsi_usaha_persen <= 100)),
  cumulative_depreciation numeric not null check (cumulative_depreciation >= 0),
  book_value_ending numeric not null check (book_value_ending >= 0),
  posted_by uuid references auth.users(id),
  posted_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  constraint chk_depreciation_balance check (
    depreciation_amount = business_portion_amount + non_business_portion_amount
  )
);

create unique index if not exists uq_regular_ledger_posting 
  on public.asset_depreciation_ledger (batch_id, component_id) 
  where entry_type in ('regular', 'replacement');

create unique index if not exists uq_ledger_reversal_single 
  on public.asset_depreciation_ledger (reversed_ledger_id) 
  where entry_type = 'reversal';

create index if not exists idx_ledger_org_period on public.asset_depreciation_ledger (org_id, period_key);
create index if not exists idx_ledger_component on public.asset_depreciation_ledger (component_id);
create index if not exists idx_ledger_asset on public.asset_depreciation_ledger (asset_id);

-- 8. Tabel Jejak Audit Pembukuan (Append-Only)
create table if not exists public.asset_accounting_audit_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  event_type text not null check (event_type in (
    'start_date_configured',
    'asset_activated',
    'opening_balance_approved',
    'opening_balance_cancelled',
    'batch_posted',
    'batch_reversed',
    'period_locked',
    'period_unlocked'
  )),
  entity_type text not null check (entity_type in ('settings', 'asset', 'component', 'batch', 'period')),
  entity_id uuid not null,
  actor_id uuid references auth.users(id),
  actor_role text,
  notes_reason text,
  payload_before jsonb,
  payload_after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_asset_audit_org on public.asset_accounting_audit_logs (org_id, created_at desc);

-- 9. Keamanan RLS & Hak Akses
alter table public.asset_bookkeeping_settings enable row level security;
alter table public.asset_activation_snapshots enable row level security;
alter table public.asset_opening_balances enable row level security;
alter table public.asset_accounting_periods enable row level security;
alter table public.asset_depreciation_batches enable row level security;
alter table public.asset_depreciation_ledger enable row level security;
alter table public.asset_accounting_audit_logs enable row level security;

-- Cabut izin tulis langsung dari publik dan authenticated (hanya RPC yang boleh menulis)
revoke insert, update, delete on public.asset_bookkeeping_settings from anon, authenticated;
revoke insert, update, delete on public.asset_activation_snapshots from anon, authenticated;
revoke insert, update, delete on public.asset_opening_balances from anon, authenticated;
revoke insert, update, delete on public.asset_accounting_periods from anon, authenticated;
revoke insert, update, delete on public.asset_depreciation_batches from anon, authenticated;
revoke insert, update, delete on public.asset_depreciation_ledger from anon, authenticated;
revoke insert, update, delete on public.asset_accounting_audit_logs from anon, authenticated;

-- Policy SELECT untuk anggota organisasi
drop policy if exists select_asset_bookkeeping_settings on public.asset_bookkeeping_settings;
create policy select_asset_bookkeeping_settings on public.asset_bookkeeping_settings
  for select using (public.is_org_member(org_id));

drop policy if exists select_asset_activation_snapshots on public.asset_activation_snapshots;
create policy select_asset_activation_snapshots on public.asset_activation_snapshots
  for select using (public.is_org_member(org_id));

drop policy if exists select_asset_opening_balances on public.asset_opening_balances;
create policy select_asset_opening_balances on public.asset_opening_balances
  for select using (public.is_org_member(org_id));

drop policy if exists select_asset_accounting_periods on public.asset_accounting_periods;
create policy select_asset_accounting_periods on public.asset_accounting_periods
  for select using (public.is_org_member(org_id));

drop policy if exists select_asset_depreciation_batches on public.asset_depreciation_batches;
create policy select_asset_depreciation_batches on public.asset_depreciation_batches
  for select using (public.is_org_member(org_id));

drop policy if exists select_asset_depreciation_ledger on public.asset_depreciation_ledger;
create policy select_asset_depreciation_ledger on public.asset_depreciation_ledger
  for select using (public.is_org_member(org_id));

drop policy if exists select_asset_accounting_audit_logs on public.asset_accounting_audit_logs;
create policy select_asset_accounting_audit_logs on public.asset_accounting_audit_logs
  for select using (public.is_org_member(org_id));

-- ==============================================================================
-- 10. FUNGSI PERHITUNGAN DAN RPC PEMBUKUAN PENYUSUTAN
-- ==============================================================================

-- Helper 1: Jadwal Kumulatif Integer Fase 3-R (Jalur Historis & Aset Baru)
create or replace function public.calc_component_depreciation_schedule(
  p_biaya numeric,
  p_nilai_sisa numeric,
  p_masa_bulan int,
  p_tanggal_siap_guna date,
  p_porsi_usaha numeric default null
)
returns table (
  periode_idx int,
  period_key text,
  beban numeric,
  beban_usaha numeric,
  beban_non_usaha numeric,
  akumulasi numeric,
  akumulasi_usaha numeric,
  akumulasi_non_usaha numeric,
  nilai_buku numeric
)
language plpgsql
immutable
as $$
declare
  v_dasar numeric;
  v_start_year int;
  v_start_month int;
  v_start_day int;
  v_days_in_first_month int;
  v_fraksi_awal numeric;
  v_total_periods int;
  v_target_usaha_total numeric;
  v_prev_akumulasi numeric := 0;
  v_prev_akumulasi_usaha numeric := 0;
  v_w numeric;
  v_target_akumulasi numeric;
  v_target_akumulasi_usaha numeric;
  v_beban numeric;
  v_beban_usaha numeric;
  v_beban_non_usaha numeric;
  v_nilai_buku numeric;
  v_cur_date date;
  v_period_key text;
begin
  v_dasar := p_biaya - coalesce(p_nilai_sisa, 0);
  v_start_year := extract(year from p_tanggal_siap_guna)::int;
  v_start_month := extract(month from p_tanggal_siap_guna)::int;
  v_start_day := extract(day from p_tanggal_siap_guna)::int;
  
  v_days_in_first_month := extract(day from (make_date(v_start_year, v_start_month, 1) + interval '1 month' - interval '1 day'))::int;
  v_fraksi_awal := (v_days_in_first_month - v_start_day + 1)::numeric / v_days_in_first_month::numeric;
  
  if v_start_day = 1 then
    v_total_periods := p_masa_bulan;
  else
    v_total_periods := p_masa_bulan + 1;
  end if;

  if p_porsi_usaha is not null and v_dasar > 0 then
    v_target_usaha_total := round(v_dasar * (p_porsi_usaha / 100.0));
  else
    v_target_usaha_total := 0;
  end if;

  for i in 1..v_total_periods loop
    v_cur_date := make_date(v_start_year, v_start_month, 1) + ((i - 1) || ' months')::interval;
    v_period_key := to_char(v_cur_date, 'YYYY-MM');

    if v_start_day = 1 then
      v_w := i::numeric;
    else
      if i = 1 then
        v_w := v_fraksi_awal;
      elsif i <= p_masa_bulan then
        v_w := v_fraksi_awal + (i - 1)::numeric;
      else
        v_w := p_masa_bulan::numeric;
      end if;
    end if;

    if v_dasar = 0 then
      v_target_akumulasi := 0;
    else
      v_target_akumulasi := round(v_dasar * (v_w / p_masa_bulan::numeric));
    end if;

    v_beban := v_target_akumulasi - v_prev_akumulasi;
    v_prev_akumulasi := v_target_akumulasi;

    if p_porsi_usaha is not null and v_dasar > 0 and v_target_usaha_total > 0 then
      v_target_akumulasi_usaha := round(v_target_usaha_total * (v_target_akumulasi / v_dasar));
      v_beban_usaha := v_target_akumulasi_usaha - v_prev_akumulasi_usaha;
      v_prev_akumulasi_usaha := v_target_akumulasi_usaha;
    else
      v_target_akumulasi_usaha := 0;
      v_beban_usaha := 0;
    end if;

    v_beban_non_usaha := v_beban - v_beban_usaha;
    v_nilai_buku := p_biaya - v_target_akumulasi;

    periode_idx := i;
    period_key := v_period_key;
    beban := v_beban;
    beban_usaha := v_beban_usaha;
    beban_non_usaha := v_beban_non_usaha;
    akumulasi := v_target_akumulasi;
    akumulasi_usaha := v_target_akumulasi_usaha;
    akumulasi_non_usaha := v_target_akumulasi - v_target_akumulasi_usaha;
    nilai_buku := v_nilai_buku;

    return next;
  end loop;
end;
$$;

-- Helper 2: Jadwal Kumulatif Integer Jalur Manual (Catatan Terdahulu)
create or replace function public.calc_component_manual_schedule(
  p_biaya numeric,
  p_nilai_sisa numeric,
  p_akumulasi_awal numeric,
  p_akumulasi_usaha_awal numeric,
  p_sisa_dasar numeric,
  p_sisa_target_usaha numeric,
  p_sisa_bobot numeric,
  p_sisa_periode_kalender int,
  p_start_date date
)
returns table (
  periode_idx int,
  period_key text,
  beban numeric,
  beban_usaha numeric,
  beban_non_usaha numeric,
  akumulasi numeric,
  akumulasi_usaha numeric,
  akumulasi_non_usaha numeric,
  nilai_buku numeric
)
language plpgsql
immutable
as $$
declare
  v_start_year int;
  v_start_month int;
  v_prev_akumulasi numeric := 0;
  v_prev_akumulasi_usaha numeric := 0;
  v_w numeric;
  v_target_akumulasi numeric;
  v_target_akumulasi_usaha numeric;
  v_beban numeric;
  v_beban_usaha numeric;
  v_beban_non_usaha numeric;
  v_cur_date date;
  v_period_key text;
begin
  v_start_year := extract(year from p_start_date)::int;
  v_start_month := extract(month from p_start_date)::int;

  for j in 1..p_sisa_periode_kalender loop
    v_cur_date := make_date(v_start_year, v_start_month, 1) + ((j - 1) || ' months')::interval;
    v_period_key := to_char(v_cur_date, 'YYYY-MM');

    if j < p_sisa_periode_kalender then
      v_w := least(j::numeric, p_sisa_bobot);
    else
      v_w := p_sisa_bobot;
    end if;

    if p_sisa_dasar = 0 or p_sisa_bobot = 0 then
      v_target_akumulasi := 0;
    else
      v_target_akumulasi := round(p_sisa_dasar * (v_w / p_sisa_bobot));
    end if;

    v_beban := v_target_akumulasi - v_prev_akumulasi;
    v_prev_akumulasi := v_target_akumulasi;

    if p_sisa_dasar > 0 and p_sisa_target_usaha > 0 then
      v_target_akumulasi_usaha := round(p_sisa_target_usaha * (v_target_akumulasi / p_sisa_dasar));
      v_beban_usaha := v_target_akumulasi_usaha - v_prev_akumulasi_usaha;
      v_prev_akumulasi_usaha := v_target_akumulasi_usaha;
    else
      v_target_akumulasi_usaha := 0;
      v_beban_usaha := 0;
    end if;

    v_beban_non_usaha := v_beban - v_beban_usaha;

    periode_idx := j;
    period_key := v_period_key;
    beban := v_beban;
    beban_usaha := v_beban_usaha;
    beban_non_usaha := v_beban_non_usaha;
    akumulasi := p_akumulasi_awal + v_target_akumulasi;
    akumulasi_usaha := p_akumulasi_usaha_awal + v_target_akumulasi_usaha;
    akumulasi_non_usaha := (p_akumulasi_awal - p_akumulasi_usaha_awal) + (v_target_akumulasi - v_target_akumulasi_usaha);
    nilai_buku := p_biaya - akumulasi;

    return next;
  end loop;
end;
$$;

-- RPC 1: Konfigurasi Tanggal Mulai Pembukuan Organisasi
create or replace function public.set_bookkeeping_start_date(
  p_org_id uuid,
  p_start_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller_role text;
  v_existing public.asset_bookkeeping_settings%rowtype;
  v_result public.asset_bookkeeping_settings%rowtype;
begin
  if not (public.is_org_owner(p_org_id) or public.is_org_admin(p_org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat mengatur tanggal mulai pembukuan';
  end if;

  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || p_org_id::text));

  if extract(day from p_start_date) != 1 then
    raise exception 'SIMKOS_INVALID_START_DATE: Tanggal mulai pembukuan harus tanggal 1 suatu bulan';
  end if;

  select * into v_existing from public.asset_bookkeeping_settings where org_id = p_org_id;
  if found and v_existing.is_locked then
    raise exception 'SIMKOS_SETTINGS_LOCKED: Pengaturan tanggal mulai pembukuan telah dikunci dan tidak dapat diubah';
  end if;

  insert into public.asset_bookkeeping_settings (
    org_id, tanggal_mulai_pembukuan, created_by, updated_by
  ) values (
    p_org_id, p_start_date, auth.uid(), auth.uid()
  )
  on conflict (org_id) do update set
    tanggal_mulai_pembukuan = excluded.tanggal_mulai_pembukuan,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_result;

  insert into public.asset_accounting_audit_logs (
    org_id, event_type, entity_type, entity_id, actor_id, actor_role, notes_reason, payload_after
  ) values (
    p_org_id, 'start_date_configured', 'settings', v_result.id, auth.uid(),
    case when public.is_org_owner(p_org_id) then 'owner' else 'admin' end,
    'Pengaturan tanggal mulai pembukuan aset ditetapkan: ' || p_start_date::text,
    to_jsonb(v_result)
  );

  return to_jsonb(v_result);
end;
$$;

-- RPC 2: Aktivasi Aset Eksplisit & Snapshot Parameter
create or replace function public.activate_asset(
  p_asset_id uuid,
  p_activation_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_asset public.assets%rowtype;
  v_next_version int;
  v_components jsonb;
  v_invalid_count int;
  v_snapshot public.asset_activation_snapshots%rowtype;
begin
  select * into v_asset from public.assets where id = p_asset_id;
  if not found then
    raise exception 'SIMKOS_ASSET_NOT_FOUND: Aset dengan ID % tidak ditemukan', p_asset_id;
  end if;

  if not (public.is_org_owner(v_asset.org_id) or public.is_org_admin(v_asset.org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat mengaktivasi aset';
  end if;

  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || v_asset.org_id::text));

  if v_asset.status_pencatatan = 'aktif' then
    -- Aset sudah aktif, periksa apakah ini snapshot komponen pengembangan baru
    null;
  elsif v_asset.status_pencatatan != 'draft' then
    raise exception 'SIMKOS_INVALID_STATUS: Hanya aset berstatus draft yang dapat diaktivasi';
  end if;

  -- Validasi komponen: harus ada minimal 1 komponen
  if not exists (select 1 from public.asset_components where asset_id = p_asset_id) then
    raise exception 'SIMKOS_NO_COMPONENTS: Aset wajib memiliki minimal satu komponen sebelum diaktivasi';
  end if;

  -- Kategori bukan tanah wajib tidak memiliki komponen 'perlu_telaah'
  if v_asset.kategori_aset != 'tanah' then
    select count(*) into v_invalid_count 
    from public.asset_components 
    where asset_id = p_asset_id and status_kapitalisasi = 'perlu_telaah';

    if v_invalid_count > 0 then
      raise exception 'SIMKOS_COMPONENT_UNRESOLVED: Terdapat % komponen berstatus perlu_telaah. Wajib diputuskan kapitalisasi atau beban langsung', v_invalid_count;
    end if;

    -- Komponen kapitalisasi wajib memiliki parameter lengkap
    select count(*) into v_invalid_count
    from public.asset_components
    where asset_id = p_asset_id 
      and status_kapitalisasi = 'kapitalisasi'
      and (biaya_perolehan is null or tanggal_siap_guna is null or masa_manfaat_bulan is null or masa_manfaat_bulan <= 0);

    if v_invalid_count > 0 then
      raise exception 'SIMKOS_INCOMPLETE_PARAMETERS: Terdapat % komponen kapitalisasi dengan parameter belum lengkap', v_invalid_count;
    end if;
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
  from public.asset_activation_snapshots
  where asset_id = p_asset_id;

  select jsonb_agg(to_jsonb(c)) into v_components
  from public.asset_components c
  where c.asset_id = p_asset_id;

  insert into public.asset_activation_snapshots (
    asset_id, org_id, version, algorithm_version, snapshot_params, activated_by, activation_notes
  ) values (
    p_asset_id, v_asset.org_id, v_next_version, 'v3.1-bresenham', v_components, auth.uid(), p_activation_notes
  ) returning * into v_snapshot;

  update public.assets set
    status_pencatatan = 'aktif',
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_asset_id;

  insert into public.asset_accounting_audit_logs (
    org_id, event_type, entity_type, entity_id, actor_id, actor_role, notes_reason, payload_after
  ) values (
    v_asset.org_id, 'asset_activated', 'asset', p_asset_id, auth.uid(),
    case when public.is_org_owner(v_asset.org_id) then 'owner' else 'admin' end,
    'Aset diaktivasi (Snapshot Versi ' || v_next_version::text || ')',
    to_jsonb(v_snapshot)
  );

  return to_jsonb(v_snapshot);
end;
$$;

-- RPC 3: Pengesahan Saldo Awal Komponen (Jalur Historis & Catatan Terdahulu)
create or replace function public.approve_component_opening_balance(
  p_component_id uuid,
  p_jalur text,
  p_manual_akumulasi numeric default null,
  p_manual_usaha numeric default null,
  p_revisi_sisa_bulan int default null,
  p_catatan text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_comp public.asset_components%rowtype;
  v_asset public.assets%rowtype;
  v_settings public.asset_bookkeeping_settings%rowtype;
  v_cutoff_date date;
  v_cutoff_key text;
  v_next_version int;
  v_biaya numeric;
  v_sisa numeric;
  v_dasar numeric;
  v_akum_awal numeric;
  v_akum_usaha_awal numeric;
  v_akum_non_usaha_awal numeric;
  v_nilai_buku_awal numeric;
  v_sisa_dasar numeric;
  v_sisa_target_usaha numeric;
  v_sisa_bobot numeric;
  v_sisa_periode_kalender int;
  v_status_estimasi text := 'valid';
  v_last_sched record;
  v_months_past int;
  v_bobot_lalu numeric;
  v_start_day int;
  v_days_first_month int;
  v_end_period_date date;
  v_result public.asset_opening_balances%rowtype;
begin
  select * into v_comp from public.asset_components where id = p_component_id;
  if not found then
    raise exception 'SIMKOS_COMPONENT_NOT_FOUND: Komponen dengan ID % tidak ditemukan', p_component_id;
  end if;

  select * into v_asset from public.assets where id = v_comp.asset_id;
  if not found or v_asset.status_pencatatan != 'aktif' then
    raise exception 'SIMKOS_ASSET_NOT_ACTIVE: Saldo awal hanya dapat disahkan untuk aset yang telah berstatus aktif';
  end if;

  if not (public.is_org_owner(v_comp.org_id) or public.is_org_admin(v_comp.org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat mengesahkan saldo awal';
  end if;

  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || v_comp.org_id::text));

  select * into v_settings from public.asset_bookkeeping_settings where org_id = v_comp.org_id;
  if not found then
    raise exception 'SIMKOS_NO_SETTINGS: Organisasi belum mengatur tanggal mulai pembukuan';
  end if;

  v_cutoff_date := v_settings.tanggal_mulai_pembukuan - interval '1 day';
  v_cutoff_key := to_char(v_cutoff_date, 'YYYY-MM');

  if v_comp.tanggal_siap_guna >= v_settings.tanggal_mulai_pembukuan then
    raise exception 'SIMKOS_ACQUISITION_NOT_HISTORICAL: Komponen siap guna pada atau setelah tanggal mulai pembukuan, tidak memerlukan saldo awal historis';
  end if;

  v_biaya := coalesce(v_comp.biaya_perolehan, 0);
  v_sisa := coalesce(v_comp.nilai_sisa, 0);
  v_dasar := v_biaya - v_sisa;

  if p_jalur = 'simulasi_historis' then
    -- Ambil jadwal dari formula Bresenham sampai cutoff date
    select * into v_last_sched 
    from public.calc_component_depreciation_schedule(
      v_biaya, v_sisa, v_comp.masa_manfaat_bulan, v_comp.tanggal_siap_guna, v_comp.porsi_usaha_persen
    )
    where period_key <= v_cutoff_key
    order by periode_idx desc
    limit 1;

    if found then
      v_akum_awal := v_last_sched.akumulasi;
      v_akum_usaha_awal := v_last_sched.akumulasi_usaha;
    else
      v_akum_awal := 0;
      v_akum_usaha_awal := 0;
    end if;

    v_akum_non_usaha_awal := v_akum_awal - v_akum_usaha_awal;
    v_nilai_buku_awal := v_biaya - v_akum_awal;
    v_sisa_dasar := v_nilai_buku_awal - v_sisa;
    
    if v_comp.porsi_usaha_persen is not null and v_sisa_dasar > 0 then
      v_sisa_target_usaha := round(v_sisa_dasar * (v_comp.porsi_usaha_persen / 100.0));
    else
      v_sisa_target_usaha := 0;
    end if;

    -- Hitung sisa periode kalender
    select count(*) into v_sisa_periode_kalender
    from public.calc_component_depreciation_schedule(
      v_biaya, v_sisa, v_comp.masa_manfaat_bulan, v_comp.tanggal_siap_guna, v_comp.porsi_usaha_persen
    )
    where period_key > v_cutoff_key;

    v_sisa_bobot := v_sisa_periode_kalender::numeric;

  elsif p_jalur = 'catatan_terdahulu' then
    if p_manual_akumulasi is null or p_manual_akumulasi < 0 or p_manual_akumulasi > v_dasar then
      raise exception 'SIMKOS_INVALID_MANUAL_ACCUMULATION: Akumulasi manual harus antara 0 dan dasar penyusutan (%)', v_dasar;
    end if;

    v_akum_awal := p_manual_akumulasi;
    v_akum_usaha_awal := coalesce(p_manual_usaha, 0);
    if v_akum_usaha_awal < 0 or v_akum_usaha_awal > v_akum_awal then
      raise exception 'SIMKOS_INVALID_MANUAL_BUSINESS: Akumulasi usaha harus antara 0 dan akumulasi penyusutan awal';
    end if;

    v_akum_non_usaha_awal := v_akum_awal - v_akum_usaha_awal;
    v_nilai_buku_awal := v_biaya - v_akum_awal;
    v_sisa_dasar := v_nilai_buku_awal - v_sisa;

    if v_comp.porsi_usaha_persen is not null and v_sisa_dasar > 0 then
      v_sisa_target_usaha := round(v_sisa_dasar * (v_comp.porsi_usaha_persen / 100.0));
    else
      v_sisa_target_usaha := 0;
    end if;

    -- Hitung bobot masa lalu
    v_start_day := extract(day from v_comp.tanggal_siap_guna)::int;
    v_days_first_month := extract(day from (make_date(extract(year from v_comp.tanggal_siap_guna)::int, extract(month from v_comp.tanggal_siap_guna)::int, 1) + interval '1 month' - interval '1 day'))::int;
    
    -- Jumlah bulan kalender terlewati dari siap guna ke cutoff
    v_months_past := (extract(year from v_cutoff_date)::int - extract(year from v_comp.tanggal_siap_guna)::int) * 12 
      + (extract(month from v_cutoff_date)::int - extract(month from v_comp.tanggal_siap_guna)::int) + 1;

    if v_start_day = 1 then
      v_bobot_lalu := v_months_past::numeric;
    else
      v_bobot_lalu := ((v_days_first_month - v_start_day + 1)::numeric / v_days_first_month::numeric) + (v_months_past - 1)::numeric;
    end if;

    v_sisa_bobot := v_comp.masa_manfaat_bulan::numeric - v_bobot_lalu;

    -- Edge case: sisa dasar > 0 namun sisa masa manfaat <= 0
    if v_sisa_dasar > 0 and v_sisa_bobot <= 0 then
      if p_revisi_sisa_bulan is null or p_revisi_sisa_bulan <= 0 then
        raise exception 'SIMKOS_REVISION_REQUIRED: Sisa dasar penyusutan positif (%) namun masa manfaat telah habis. Wajib mengisi revisi estimasi sisa bulan', v_sisa_dasar;
      else
        v_status_estimasi := 'valid';
        v_sisa_bobot := p_revisi_sisa_bulan::numeric;
        v_sisa_periode_kalender := p_revisi_sisa_bulan;
      end if;
    else
      v_sisa_periode_kalender := ceil(greatest(v_sisa_bobot, 0))::int;
    end if;
  else
    raise exception 'SIMKOS_INVALID_PATH: Jalur saldo tidak valid. Gunakan simulasi_historis atau catatan_terdahulu';
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
  from public.asset_opening_balances
  where component_id = p_component_id;

  -- Nonaktifkan versi approved sebelumnya jika ada
  update public.asset_opening_balances set
    status = 'cancelled',
    cancelled_by = auth.uid(),
    cancelled_at = now(),
    cancellation_reason = 'Digantikan oleh pengesahan saldo awal versi ' || v_next_version::text
  where component_id = p_component_id and status = 'approved';

  insert into public.asset_opening_balances (
    component_id, asset_id, org_id, version, status, cutoff_date, jalur_saldo,
    biaya_perolehan, nilai_sisa, akumulasi_penyusutan_awal, nilai_buku_awal,
    akumulasi_usaha_awal, akumulasi_non_usaha_awal, sisa_dasar_penyusutan,
    sisa_target_usaha, sisa_bobot_manfaat, sisa_periode_kalender, status_estimasi,
    catatan_sumber, approved_by, approved_at
  ) values (
    p_component_id, v_comp.asset_id, v_comp.org_id, v_next_version, 'approved', v_cutoff_date, p_jalur,
    v_biaya, v_sisa, v_akum_awal, v_nilai_buku_awal,
    v_akum_usaha_awal, v_akum_non_usaha_awal, v_sisa_dasar,
    v_sisa_target_usaha, v_sisa_bobot, v_sisa_periode_kalender, v_status_estimasi,
    p_catatan, auth.uid(), now()
  ) returning * into v_result;

  -- Kunci pengaturan tanggal mulai pembukuan
  update public.asset_bookkeeping_settings set
    is_locked = true,
    locked_reason = 'Saldo awal komponen ' || v_comp.nama_komponen || ' telah disahkan',
    updated_at = now()
  where org_id = v_comp.org_id;

  insert into public.asset_accounting_audit_logs (
    org_id, event_type, entity_type, entity_id, actor_id, actor_role, notes_reason, payload_after
  ) values (
    v_comp.org_id, 'opening_balance_approved', 'component', p_component_id, auth.uid(),
    case when public.is_org_owner(v_comp.org_id) then 'owner' else 'admin' end,
    'Saldo awal disahkan (Versi ' || v_next_version::text || ', Jalur ' || p_jalur || ')',
    to_jsonb(v_result)
  );

  return to_jsonb(v_result);
end;
$$;

-- RPC 4: Pembatalan Saldo Awal Komponen
create or replace function public.cancel_component_opening_balance(
  p_component_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_ob public.asset_opening_balances%rowtype;
begin
  select * into v_ob from public.asset_opening_balances 
  where component_id = p_component_id and status = 'approved';
  
  if not found then
    raise exception 'SIMKOS_OB_NOT_FOUND: Tidak ditemukan saldo awal approved untuk komponen ID %', p_component_id;
  end if;

  if not (public.is_org_owner(v_ob.org_id) or public.is_org_admin(v_ob.org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat membatalkan saldo awal';
  end if;

  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || v_ob.org_id::text));

  -- Wajib: tidak boleh ada batch posting aktif
  if exists (
    select 1 from public.asset_depreciation_batches
    where org_id = v_ob.org_id and batch_status = 'posted'
  ) then
    raise exception 'SIMKOS_POSTED_BATCH_EXISTS: Tidak dapat membatalkan saldo awal karena terdapat batch posting yang aktif. Batalkan seluruh batch posting aktif terlebih dahulu';
  end if;

  update public.asset_opening_balances set
    status = 'cancelled',
    cancelled_by = auth.uid(),
    cancelled_at = now(),
    cancellation_reason = p_reason
  where id = v_ob.id
  returning * into v_ob;

  insert into public.asset_accounting_audit_logs (
    org_id, event_type, entity_type, entity_id, actor_id, actor_role, notes_reason, payload_after
  ) values (
    v_ob.org_id, 'opening_balance_cancelled', 'component', p_component_id, auth.uid(),
    case when public.is_org_owner(v_ob.org_id) then 'owner' else 'admin' end,
    'Saldo awal dibatalkan: ' || coalesce(p_reason, 'Tanpa alasan'),
    to_jsonb(v_ob)
  );

  return to_jsonb(v_ob);
end;
$$;

-- RPC 5: Pratinjau Server Posting Penyusutan Bulanan
create or replace function public.preview_depreciation_posting(
  p_org_id uuid,
  p_period_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_settings public.asset_bookkeeping_settings%rowtype;
  v_last_posted public.asset_depreciation_batches%rowtype;
  v_expected_key text;
  v_period_date date;
  v_period_end_date date;
  v_eligible jsonb := '[]'::jsonb;
  v_ineligible jsonb := '[]'::jsonb;
  v_snapshot_map jsonb := '{}'::jsonb;
  v_total_depr numeric := 0;
  v_total_bus numeric := 0;
  v_total_non_bus numeric := 0;
  v_count int := 0;
  v_comp record;
  v_ob public.asset_opening_balances%rowtype;
  v_snap public.asset_activation_snapshots%rowtype;
  v_sched record;
  v_snapshot_hash text;
  v_ob_hash text;
  v_preview_token text;
  v_item jsonb;
begin
  if not (public.is_org_owner(p_org_id) or public.is_org_admin(p_org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat membuat pratinjau posting';
  end if;

  select * into v_settings from public.asset_bookkeeping_settings where org_id = p_org_id;
  if not found then
    raise exception 'SIMKOS_NO_SETTINGS: Organisasi belum mengatur tanggal mulai pembukuan';
  end if;

  if p_period_key < to_char(v_settings.tanggal_mulai_pembukuan, 'YYYY-MM') then
    raise exception 'SIMKOS_PERIOD_BEFORE_START: Periode % sebelum tanggal mulai pembukuan (%)', p_period_key, v_settings.tanggal_mulai_pembukuan;
  end if;

  -- Cek periode terkunci
  if exists (
    select 1 from public.asset_accounting_periods
    where org_id = p_org_id and period_key = p_period_key and status = 'locked'
  ) then
    raise exception 'SIMKOS_PERIOD_LOCKED: Periode % dalam keadaan terkunci (locked)', p_period_key;
  end if;

  -- Validasi urutan kronologis tanpa celah
  select * into v_last_posted from public.asset_depreciation_batches
  where org_id = p_org_id and batch_status = 'posted'
  order by period_key desc limit 1;

  if not found then
    v_expected_key := to_char(v_settings.tanggal_mulai_pembukuan, 'YYYY-MM');
  else
    v_expected_key := to_char(make_date(substring(v_last_posted.period_key from 1 for 4)::int, substring(v_last_posted.period_key from 6 for 2)::int, 1) + interval '1 month', 'YYYY-MM');
  end if;

  if p_period_key != v_expected_key then
    raise exception 'SIMKOS_GAP_DETECTED: Urutan periode tidak valid. Periode yang diharapkan berikutnya adalah %', v_expected_key;
  end if;

  v_period_date := make_date(substring(p_period_key from 1 for 4)::int, substring(p_period_key from 6 for 2)::int, 1);
  v_period_end_date := v_period_date + interval '1 month' - interval '1 day';

  -- Evaluasi setiap komponen aktif
  for v_comp in (
    select c.*, a.nama_aset, a.kategori_aset
    from public.asset_components c
    join public.assets a on a.id = c.asset_id
    where c.org_id = p_org_id and a.status_pencatatan = 'aktif'
    order by c.created_at asc
  ) loop
    -- Ambil snapshot aset terbaru
    select * into v_snap from public.asset_activation_snapshots
    where asset_id = v_comp.asset_id order by version desc limit 1;
    if found then
      v_snapshot_map := jsonb_set(v_snapshot_map, array[v_comp.asset_id::text], to_jsonb(v_snap.version));
    end if;

    -- Pengecekan kelayakan dasar
    if v_comp.kategori_aset = 'tanah' or v_comp.status_kapitalisasi = 'beban_langsung' or v_comp.metode_penyusutan = 'tidak_disusutkan' then
      v_ineligible := v_ineligible || jsonb_build_object(
        'component_id', v_comp.id, 'nama_komponen', v_comp.nama_komponen, 'alasan', 'Tidak disusutkan'
      );
      continue;
    end if;

    if v_comp.tanggal_siap_guna > v_period_end_date then
      v_ineligible := v_ineligible || jsonb_build_object(
        'component_id', v_comp.id, 'nama_komponen', v_comp.nama_komponen, 'alasan', 'Belum siap guna pada periode ini'
      );
      continue;
    end if;

    -- Jika perolehan historis (< tanggal mulai), wajib ada saldo awal approved
    if v_comp.tanggal_siap_guna < v_settings.tanggal_mulai_pembukuan then
      select * into v_ob from public.asset_opening_balances
      where component_id = v_comp.id and status = 'approved';
      if not found then
        v_ineligible := v_ineligible || jsonb_build_object(
          'component_id', v_comp.id, 'nama_komponen', v_comp.nama_komponen, 'alasan', 'Saldo awal historis belum disahkan'
        );
        continue;
      end if;

      if v_ob.jalur_saldo = 'simulasi_historis' then
        select * into v_sched from public.calc_component_depreciation_schedule(
          v_comp.biaya_perolehan, v_comp.nilai_sisa, v_comp.masa_manfaat_bulan, v_comp.tanggal_siap_guna, v_comp.porsi_usaha_persen
        ) where period_key = p_period_key;
      else
        -- Jalur catatan terdahulu
        select * into v_sched from public.calc_component_manual_schedule(
          v_ob.biaya_perolehan, v_ob.nilai_sisa, v_ob.akumulasi_penyusutan_awal, v_ob.akumulasi_usaha_awal,
          v_ob.sisa_dasar_penyusutan, v_ob.sisa_target_usaha, v_ob.sisa_bobot_manfaat, v_ob.sisa_periode_kalender,
          v_settings.tanggal_mulai_pembukuan
        ) where period_key = p_period_key;
      end if;
    else
      -- Perolehan baru pada masa pembukuan
      v_ob := null;
      select * into v_sched from public.calc_component_depreciation_schedule(
        v_comp.biaya_perolehan, v_comp.nilai_sisa, v_comp.masa_manfaat_bulan, v_comp.tanggal_siap_guna, v_comp.porsi_usaha_persen
      ) where period_key = p_period_key;
    end if;

    if not found or v_sched is null then
      v_ineligible := v_ineligible || jsonb_build_object(
        'component_id', v_comp.id, 'nama_komponen', v_comp.nama_komponen, 'alasan', 'Masa manfaat telah berakhir'
      );
      continue;
    end if;

    v_item := jsonb_build_object(
      'component_id', v_comp.id,
      'asset_id', v_comp.asset_id,
      'nama_komponen', v_comp.nama_komponen,
      'snapshot_id', v_snap.id,
      'opening_balance_id', v_ob.id,
      'beban', v_sched.beban,
      'beban_usaha', v_sched.beban_usaha,
      'beban_non_usaha', v_sched.beban_non_usaha,
      'porsi_usaha_persen', v_comp.porsi_usaha_persen,
      'akumulasi', v_sched.akumulasi,
      'nilai_buku', v_sched.nilai_buku
    );

    v_eligible := v_eligible || v_item;
    v_total_depr := v_total_depr + v_sched.beban;
    v_total_bus := v_total_bus + v_sched.beban_usaha;
    v_total_non_bus := v_total_non_bus + v_sched.beban_non_usaha;
    v_count := v_count + 1;
  end loop;

  -- Hitung token pratinjau yang memuat versi algoritma
  select md5(coalesce(string_agg(asset_id::text || '=' || version::text, ',' order by asset_id), 'NO_SNAP'))
  into v_snapshot_hash
  from public.asset_activation_snapshots
  where org_id = p_org_id;

  select md5(coalesce(string_agg(component_id::text || '=' || version::text || '=' || akumulasi_penyusutan_awal::text, ',' order by component_id), 'NO_OB'))
  into v_ob_hash
  from public.asset_opening_balances
  where org_id = p_org_id and status = 'approved';

  v_preview_token := 'pv_' || md5(
    p_org_id::text || ':' || p_period_key || ':v3.1-bresenham:' || 
    coalesce(v_snapshot_hash, 'S0') || ':' || 
    coalesce(v_ob_hash, 'O0') || ':' || 
    coalesce(v_last_posted.id::text, 'INITIAL')
  );

  return jsonb_build_object(
    'period_key', p_period_key,
    'algorithm_version', 'v3.1-bresenham',
    'total_depreciation', v_total_depr,
    'total_business_portion', v_total_bus,
    'total_non_business_portion', v_total_non_bus,
    'component_count', v_count,
    'eligible_components', v_eligible,
    'ineligible_components', v_ineligible,
    'snapshot_version_map', v_snapshot_map,
    'preview_token', v_preview_token
  );
end;
$$;

-- RPC 6: Posting Batch Penyusutan (Atomik & Idempoten)
create or replace function public.post_depreciation_batch(
  p_org_id uuid,
  p_period_key text,
  p_idempotency_key text,
  p_payload_hash text,
  p_preview_token text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_existing public.asset_depreciation_batches%rowtype;
  v_preview jsonb;
  v_server_preview_token text;
  v_period_rec public.asset_accounting_periods%rowtype;
  v_replaces_batch_id uuid;
  v_entry_type text;
  v_new_batch public.asset_depreciation_batches%rowtype;
  v_elem jsonb;
begin
  if not (public.is_org_owner(p_org_id) or public.is_org_admin(p_org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat memposting penyusutan';
  end if;

  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || p_org_id::text));

  -- 1. Pengecekan Idempotensi
  select * into v_existing from public.asset_depreciation_batches
  where org_id = p_org_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.payload_hash != p_payload_hash then
      raise exception 'SIMKOS_IDEMPOTENCY_PAYLOAD_MISMATCH: Kunci idempotensi sama digunakan dengan payload berbeda';
    end if;
    return to_jsonb(v_existing);
  end if;

  -- 2. Cek apakah sudah ada batch aktif untuk periode ini
  if exists (
    select 1 from public.asset_depreciation_batches
    where org_id = p_org_id and period_key = p_period_key and batch_status = 'posted'
  ) then
    raise exception 'SIMKOS_BATCH_ALREADY_POSTED: Periode % telah memiliki batch posting aktif', p_period_key;
  end if;

  -- 3. Deteksi apakah ini posting pengganti
  select id into v_replaces_batch_id
  from public.asset_depreciation_batches
  where org_id = p_org_id and period_key = p_period_key and batch_status = 'reversed'
  order by created_at desc limit 1;

  if v_replaces_batch_id is not null then
    v_entry_type := 'replacement';
  else
    v_entry_type := 'regular';
  end if;

  -- 4. Status periode akuntansi
  insert into public.asset_accounting_periods (org_id, period_key, status)
  values (p_org_id, p_period_key, 'open')
  on conflict (org_id, period_key) do nothing;

  select * into v_period_rec from public.asset_accounting_periods 
  where org_id = p_org_id and period_key = p_period_key;

  if v_period_rec.status = 'locked' then
    raise exception 'SIMKOS_PERIOD_LOCKED: Periode % dalam keadaan terkunci (locked)', p_period_key;
  end if;

  -- 5. Hitung ulang preview di dalam lock
  v_preview := public.preview_depreciation_posting(p_org_id, p_period_key);
  v_server_preview_token := v_preview->>'preview_token';

  if v_server_preview_token != p_preview_token then
    raise exception 'SIMKOS_STALE_PREVIEW: Pratinjau kedaluwarsa. Parameter aset, komponen, atau saldo awal telah berubah sejak pratinjau dibuat';
  end if;

  -- 6. Insert batch
  insert into public.asset_depreciation_batches (
    org_id, period_id, period_key, batch_number, idempotency_key, payload_hash,
    batch_status, reversed_batch_id, replaces_batch_id,
    total_depreciation, total_business_portion, total_non_business_portion,
    component_count, algorithm_version, snapshot_version_map, preview_token,
    posted_by, posted_at
  ) values (
    p_org_id, v_period_rec.id, p_period_key,
    'BATCH-' || replace(p_period_key, '-', '') || '-' || substr(gen_random_uuid()::text, 1, 8),
    p_idempotency_key, p_payload_hash,
    'posted', null, v_replaces_batch_id,
    (v_preview->>'total_depreciation')::numeric,
    (v_preview->>'total_business_portion')::numeric,
    (v_preview->>'total_non_business_portion')::numeric,
    (v_preview->>'component_count')::int,
    'v3.1-bresenham',
    v_preview->'snapshot_version_map',
    p_preview_token,
    auth.uid(), now()
  ) returning * into v_new_batch;

  -- 7. Insert rincian ledger
  for v_elem in select * from jsonb_array_elements(v_preview->'eligible_components') loop
    insert into public.asset_depreciation_ledger (
      org_id, batch_id, period_id, period_key, asset_id, component_id,
      snapshot_id, opening_balance_id, entry_type,
      depreciation_amount, business_portion_amount, non_business_portion_amount,
      porsi_usaha_persen, cumulative_depreciation, book_value_ending,
      posted_by, notes
    ) values (
      p_org_id, v_new_batch.id, v_period_rec.id, p_period_key,
      (v_elem->>'asset_id')::uuid,
      (v_elem->>'component_id')::uuid,
      (v_elem->>'snapshot_id')::uuid,
      (v_elem->>'opening_balance_id')::uuid,
      v_entry_type,
      (v_elem->>'beban')::numeric,
      (v_elem->>'beban_usaha')::numeric,
      (v_elem->>'beban_non_usaha')::numeric,
      (v_elem->>'porsi_usaha_persen')::numeric,
      (v_elem->>'akumulasi')::numeric,
      (v_elem->>'nilai_buku')::numeric,
      auth.uid(), p_notes
    );
  end loop;

  -- 8. Catat audit log
  insert into public.asset_accounting_audit_logs (
    org_id, event_type, entity_type, entity_id, actor_id, actor_role, notes_reason, payload_after
  ) values (
    p_org_id, 'batch_posted', 'batch', v_new_batch.id, auth.uid(),
    case when public.is_org_owner(p_org_id) then 'owner' else 'admin' end,
    'Batch penyusutan diposting untuk periode ' || p_period_key || ' (Tipe: ' || v_entry_type || ')',
    to_jsonb(v_new_batch)
  );

  return to_jsonb(v_new_batch);
end;
$$;

-- RPC 7: Pembatalan Batch Penyusutan (Storno / Reversal)
create or replace function public.reverse_depreciation_batch(
  p_batch_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_batch public.asset_depreciation_batches%rowtype;
  v_row record;
begin
  select * into v_batch from public.asset_depreciation_batches where id = p_batch_id;
  if not found then
    raise exception 'SIMKOS_BATCH_NOT_FOUND: Batch dengan ID % tidak ditemukan', p_batch_id;
  end if;

  if not (public.is_org_owner(v_batch.org_id) or public.is_org_admin(v_batch.org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat membatalkan batch penyusutan';
  end if;

  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || v_batch.org_id::text));

  if v_batch.batch_status != 'posted' then
    raise exception 'SIMKOS_BATCH_NOT_POSTED: Batch % telah dibatalkan sebelumnya', v_batch.batch_number;
  end if;

  -- Validasi status periode akuntansi
  if exists (
    select 1 from public.asset_accounting_periods
    where id = v_batch.period_id and status = 'locked'
  ) then
    raise exception 'SIMKOS_PERIOD_LOCKED: Periode % dalam keadaan terkunci (locked)', v_batch.period_key;
  end if;

  -- Validasi hanya batch aktif pada periode terakhir yang boleh dibatalkan
  if exists (
    select 1 from public.asset_depreciation_batches
    where org_id = v_batch.org_id and batch_status = 'posted' and period_key > v_batch.period_key
  ) then
    raise exception 'SIMKOS_NON_CHRONOLOGICAL_REVERSAL: Hanya batch aktif pada periode terakhir yang dapat dibatalkan. Batalkan batch periode yang lebih baru terlebih dahulu';
  end if;

  -- Update batch awal
  update public.asset_depreciation_batches set
    batch_status = 'reversed',
    reversed_by = auth.uid(),
    reversed_at = now(),
    reversal_reason = p_reason
  where id = p_batch_id
  returning * into v_batch;

  -- Buat baris storno di ledger
  for v_row in (
    select * from public.asset_depreciation_ledger
    where batch_id = p_batch_id and entry_type in ('regular', 'replacement')
  ) loop
    insert into public.asset_depreciation_ledger (
      org_id, batch_id, period_id, period_key, asset_id, component_id,
      snapshot_id, opening_balance_id, entry_type, reversed_ledger_id,
      depreciation_amount, business_portion_amount, non_business_portion_amount,
      porsi_usaha_persen, cumulative_depreciation, book_value_ending,
      posted_by, notes
    ) values (
      v_row.org_id, v_row.batch_id, v_row.period_id, v_row.period_key, v_row.asset_id, v_row.component_id,
      v_row.snapshot_id, v_row.opening_balance_id, 'reversal', v_row.id,
      -v_row.depreciation_amount, -v_row.business_portion_amount, -v_row.non_business_portion_amount,
      v_row.porsi_usaha_persen, v_row.cumulative_depreciation - v_row.depreciation_amount, v_row.book_value_ending + v_row.depreciation_amount,
      auth.uid(), 'Storno pembatalan: ' || coalesce(p_reason, 'Tanpa alasan')
    );
  end loop;

  insert into public.asset_accounting_audit_logs (
    org_id, event_type, entity_type, entity_id, actor_id, actor_role, notes_reason, payload_after
  ) values (
    v_batch.org_id, 'batch_reversed', 'batch', v_batch.id, auth.uid(),
    case when public.is_org_owner(v_batch.org_id) then 'owner' else 'admin' end,
    'Batch penyusutan dibatalkan (storno): ' || coalesce(p_reason, 'Tanpa alasan'),
    to_jsonb(v_batch)
  );

  return to_jsonb(v_batch);
end;
$$;

-- RPC 8: Penguncian Periode Akuntansi
create or replace function public.lock_accounting_period(
  p_org_id uuid,
  p_period_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rec public.asset_accounting_periods%rowtype;
begin
  if not (public.is_org_owner(p_org_id) or public.is_org_admin(p_org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat mengunci periode';
  end if;

  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || p_org_id::text));

  insert into public.asset_accounting_periods (
    org_id, period_key, status, closed_at, closed_by
  ) values (
    p_org_id, p_period_key, 'locked', now(), auth.uid()
  )
  on conflict (org_id, period_key) do update set
    status = 'locked',
    closed_at = now(),
    closed_by = auth.uid(),
    updated_at = now()
  returning * into v_rec;

  insert into public.asset_accounting_audit_logs (
    org_id, event_type, entity_type, entity_id, actor_id, actor_role, notes_reason, payload_after
  ) values (
    p_org_id, 'period_locked', 'period', v_rec.id, auth.uid(),
    case when public.is_org_owner(p_org_id) then 'owner' else 'admin' end,
    'Periode akuntansi aset ' || p_period_key || ' dikunci',
    to_jsonb(v_rec)
  );

  return to_jsonb(v_rec);
end;
$$;

-- RPC 9: Pembukaan Kunci Periode Akuntansi
create or replace function public.unlock_accounting_period(
  p_org_id uuid,
  p_period_key text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rec public.asset_accounting_periods%rowtype;
begin
  if not (public.is_org_owner(p_org_id) or public.is_org_admin(p_org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat membuka kunci periode';
  end if;

  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'SIMKOS_REASON_REQUIRED: Wajib mencantumkan alasan tertulis untuk membuka kunci periode';
  end if;

  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || p_org_id::text));

  select * into v_rec from public.asset_accounting_periods 
  where org_id = p_org_id and period_key = p_period_key;

  if not found or v_rec.status != 'locked' then
    raise exception 'SIMKOS_PERIOD_NOT_LOCKED: Periode % tidak dalam keadaan terkunci', p_period_key;
  end if;

  update public.asset_accounting_periods set
    status = 'open',
    unlocked_at = now(),
    unlocked_by = auth.uid(),
    unlock_reason = p_reason,
    updated_at = now()
  where id = v_rec.id
  returning * into v_rec;

  insert into public.asset_accounting_audit_logs (
    org_id, event_type, entity_type, entity_id, actor_id, actor_role, notes_reason, payload_after
  ) values (
    p_org_id, 'period_unlocked', 'period', v_rec.id, auth.uid(),
    case when public.is_org_owner(p_org_id) then 'owner' else 'admin' end,
    'Kunci periode dibuka kembali: ' || p_reason,
    to_jsonb(v_rec)
  );

  return to_jsonb(v_rec);
end;
$$;

-- Hak eksekusi RPC untuk anon & authenticated
grant execute on function public.calc_component_depreciation_schedule(numeric, numeric, int, date, numeric) to anon, authenticated;
grant execute on function public.calc_component_manual_schedule(numeric, numeric, numeric, numeric, numeric, numeric, numeric, int, date) to anon, authenticated;
grant execute on function public.set_bookkeeping_start_date(uuid, date) to anon, authenticated;
grant execute on function public.activate_asset(uuid, text) to anon, authenticated;
grant execute on function public.approve_component_opening_balance(uuid, text, numeric, numeric, int, text) to anon, authenticated;
grant execute on function public.cancel_component_opening_balance(uuid, text) to anon, authenticated;
grant execute on function public.preview_depreciation_posting(uuid, text) to anon, authenticated;
grant execute on function public.post_depreciation_batch(uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.reverse_depreciation_batch(uuid, text) to anon, authenticated;
grant execute on function public.lock_accounting_period(uuid, text) to anon, authenticated;
grant execute on function public.unlock_accounting_period(uuid, text, text) to anon, authenticated;
