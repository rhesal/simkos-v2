-- ==============================================================================
-- Migrasi: 20261109000900_assets_phase4_bookkeeping.sql
-- Modul: Aset & Inventaris SimKos (Fase 4B-1R)
-- Deskripsi: Skema Buku Pembantu Penyusutan Aset, Pengesahan Saldo Awal Multi-Versi,
--            Snapshot Parameter Aktivasi sebagai Sumber Kebenaran Pembukuan,
--            Guard Aktivasi Komponen Terlambat (Wajib Unwind), Penolakan Direct Mutasi,
--            Server-Side Canonical Payload Hash, Penguncian Periode, Batch Posting
--            Atomik Idempoten, Pembatalan Bertahap (Storno), Audit Append-Only,
--            dan Perlindungan Riwayat (ON DELETE RESTRICT pada organisasi & aset).
-- ==============================================================================

-- 1. Penyesuaian Check Constraint status_pencatatan pada Tabel assets
alter table public.assets drop constraint if exists assets_status_pencatatan_check;
alter table public.assets add constraint assets_status_pencatatan_check check (
  status_pencatatan in ('draft', 'aktif', 'perlu_pengesahan_ulang', 'terverifikasi', 'dibukukan', 'diarsipkan')
);

-- Kolom pelacak pengesahan ulang pada komponen
alter table public.asset_components add column if not exists requires_reapproval boolean not null default false;

-- Perbarui fungsi trigger validate_asset_relations:
-- Menolak direct aktivasi ke status 'aktif' di luar RPC activate_asset
-- Menolak perubahan kembali dari 'aktif' ke 'draft' jika aset telah memiliki snapshot / pembukuan
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

  -- Pada INSERT, status aset baru wajib 'draft'
  if tg_op = 'INSERT' and new.status_pencatatan <> 'draft' then
    raise exception 'SIMKOS_INSERT_DRAFT_ONLY: Aset baru wajib dibuat dengan status draft';
  end if;

  -- Pada UPDATE, status yang diizinkan
  if new.status_pencatatan not in ('draft', 'aktif', 'perlu_pengesahan_ulang', 'terverifikasi', 'dibukukan', 'diarsipkan') then
    raise exception 'SIMKOS_INVALID_STATUS: Status pencatatan aset tidak valid';
  end if;

  -- Larang direct UPDATE status menjadi 'aktif' di luar RPC activate_asset
  if tg_op = 'UPDATE' and new.status_pencatatan = 'aktif' and old.status_pencatatan <> 'aktif' then
    if coalesce(current_setting('simkos.in_rpc_activate_asset', true), 'false') <> 'true' then
      raise exception 'SIMKOS_DIRECT_ACTIVATION_FORBIDDEN: Perubahan status aset menjadi aktif dilarang melalui direct update; wajib melalui RPC activate_asset';
    end if;
  end if;

  -- Larang direct UPDATE status menjadi 'perlu_pengesahan_ulang' di luar RPC revise_component_parameters
  if tg_op = 'UPDATE' and new.status_pencatatan = 'perlu_pengesahan_ulang' and old.status_pencatatan <> 'perlu_pengesahan_ulang' then
    if coalesce(current_setting('simkos.in_rpc_revise_component', true), 'false') <> 'true' then
      raise exception 'SIMKOS_DIRECT_STATUS_CHANGE_FORBIDDEN: Perubahan status ke perlu_pengesahan_ulang hanya diizinkan melalui RPC revise_component_parameters';
    end if;
  end if;

  -- Larang perubahan kembali dari 'aktif' atau 'perlu_pengesahan_ulang' ke 'draft' jika aset telah memiliki snapshot / pembukuan
  if tg_op = 'UPDATE' and old.status_pencatatan in ('aktif', 'perlu_pengesahan_ulang') and new.status_pencatatan = 'draft' then
    if exists (select 1 from public.asset_activation_snapshots where asset_id = old.id) or
       exists (select 1 from public.asset_opening_balances where asset_id = old.id and status = 'approved') or
       exists (select 1 from public.asset_depreciation_ledger where asset_id = old.id) then
      raise exception 'SIMKOS_CANNOT_REVERT_ACTIVE_ASSET: Aset yang memiliki riwayat pembukuan/snapshot tidak dapat dikembalikan menjadi status draft';
    end if;
  end if;

  -- Tolak perubahan kategori aset langsung setelah pengesahan / memiliki snapshot
  if tg_op = 'UPDATE' and old.kategori_aset is distinct from new.kategori_aset then
    if exists (select 1 from public.asset_activation_snapshots where asset_id = old.id) or
       exists (select 1 from public.asset_opening_balances where asset_id = old.id and status = 'approved') or
       exists (select 1 from public.asset_depreciation_ledger where asset_id = old.id) then
      raise exception 'SIMKOS_LOCKED_ASSET_CATEGORY: Kategori aset yang telah disahkan atau memiliki riwayat snapshot tidak dapat diubah langsung dari % menjadi %', old.kategori_aset, new.kategori_aset;
    end if;
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

-- Perbarui fungsi trigger validate_component_relations:
-- Menolak perubahan parameter finansial master komponen yang telah disahkan saldo awalnya atau dibukukan
create or replace function public.validate_component_relations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset_org uuid;
  v_exp_org uuid;
  v_exp_nominal numeric;
  v_total_allocated numeric;
begin
  -- Cegah perubahan org_id atau pemindahan asset_id
  if tg_op = 'UPDATE' and (new.org_id <> old.org_id or new.asset_id <> old.asset_id) then
    raise exception 'SIMKOS_IMMUTABLE_RELATION: Relasi asset_id dan org_id komponen tidak dapat diubah';
  end if;

  -- Validasi aset induk satu organisasi
  select org_id into v_asset_org from public.assets where id = new.asset_id;
  if v_asset_org is null or v_asset_org <> new.org_id then
    raise exception 'SIMKOS_CROSS_TENANT_ASSET: Aset induk (%) bukan milik organisasi (%)', new.asset_id, new.org_id;
  end if;

  -- Perlindungan integritas: jika komponen telah disahkan saldo awalnya atau telah dibukukan, parameter finansial tidak boleh diubah langsung
  if tg_op = 'UPDATE' then
    if (new.biaya_perolehan is distinct from old.biaya_perolehan
        or new.nilai_sisa is distinct from old.nilai_sisa
        or new.masa_manfaat_bulan is distinct from old.masa_manfaat_bulan
        or new.tanggal_siap_guna is distinct from old.tanggal_siap_guna
        or new.porsi_usaha_persen is distinct from old.porsi_usaha_persen
        or new.status_kapitalisasi is distinct from old.status_kapitalisasi
        or new.metode_penyusutan is distinct from old.metode_penyusutan) then
      if exists (select 1 from public.asset_opening_balances where component_id = old.id and status = 'approved') or
         exists (select 1 from public.asset_depreciation_ledger where component_id = old.id) then
        if coalesce(current_setting('simkos.in_rpc_revise_component', true), 'false') <> 'true' then
          raise exception 'SIMKOS_LOCKED_FINANCIAL_PARAMETERS: Parameter finansial komponen yang telah disahkan saldo awal atau dibukukan tidak dapat diubah langsung. Gunakan RPC revise_component_parameters setelah membatalkan posting aktif.';
        end if;
      end if;
    end if;
  end if;

  -- Pengawasan penanda perubahan finansial berbasis server
  if tg_op = 'UPDATE' then
    if old.financials_customized_in_asset = true and new.financials_customized_in_asset = false then
      raise exception 'SIMKOS_CANNOT_RESET_CUSTOMIZED_FINANCIALS: Penanda kustomisasi finansial aset tidak dapat direset manual oleh client';
    end if;

    if (new.biaya_perolehan is distinct from old.biaya_perolehan 
        or new.tanggal_perolehan is distinct from old.tanggal_perolehan 
        or new.bukti_dokumen_url is distinct from old.bukti_dokumen_url) then
      if coalesce(current_setting('simkos.in_inventory_sync', true), 'false') <> 'true' then
        new.financials_customized_in_asset := true;
      end if;
    end if;
  end if;

  -- Validasi relasi pengeluaran & penguncian baris untuk konkurensi aman
  if new.expense_id is not null then
    select org_id, nominal into v_exp_org, v_exp_nominal
    from public.expenses
    where id = new.expense_id
    for update;

    if v_exp_org is null or v_exp_org <> new.org_id then
      raise exception 'SIMKOS_CROSS_TENANT_EXPENSE: Transaksi pengeluaran (%) bukan milik organisasi (%)', new.expense_id, new.org_id;
    end if;

    if new.allocated_cost is not null then
      if new.biaya_perolehan is not null and new.allocated_cost > new.biaya_perolehan then
        raise exception 'SIMKOS_ALLOCATION_EXCEEDS_ASSET_COST: Alokasi biaya (%) melebihi biaya perolehan komponen (%)',
          new.allocated_cost, new.biaya_perolehan;
      end if;

      select coalesce(sum(allocated_cost), 0) into v_total_allocated
      from public.asset_components
      where expense_id = new.expense_id
        and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

      if (v_total_allocated + new.allocated_cost) > coalesce(v_exp_nominal, 0) then
        raise exception 'SIMKOS_OVERALLOCATED_EXPENSE: Total alokasi aset (%) melebihi nominal transaksi sumber (%)',
          (v_total_allocated + new.allocated_cost), v_exp_nominal;
      end if;
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
  kategori_aset text not null check (kategori_aset in ('tanah', 'gedung', 'peralatan', 'kendaraan', 'elektronik_kantor', 'komponen_gedung')),
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

-- 6. Tabel Batch Posting Penyusutan (Dukungan Multi-Versi Reversal & Rantai Pengganti)
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
    'period_unlocked',
    'component_parameters_revised'
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
  v_existing public.asset_bookkeeping_settings%rowtype;
  v_result public.asset_bookkeeping_settings%rowtype;
begin
  if p_org_id is null then
    raise exception 'SIMKOS_INVALID_PARAM: org_id wajib diisi';
  end if;
  if p_start_date is null then
    raise exception 'SIMKOS_INVALID_PARAM: start_date wajib diisi';
  end if;
  if extract(day from p_start_date) != 1 then
    raise exception 'SIMKOS_INVALID_START_DATE: Tanggal mulai pembukuan harus tanggal 1 suatu bulan';
  end if;

  if not (public.is_org_owner(p_org_id) or public.is_org_admin(p_org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat mengatur tanggal mulai pembukuan';
  end if;

  -- 1. Ambil penguncian transaksi
  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || p_org_id::text));

  -- 2. Baca ulang data setelah lock
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
  v_prev_snap public.asset_activation_snapshots%rowtype;
  v_latest_posted_period text;
  v_latest_posted_end_date date;
  v_late_comp record;
begin
  if p_asset_id is null then
    raise exception 'SIMKOS_INVALID_PARAM: asset_id wajib diisi';
  end if;

  select * into v_asset from public.assets where id = p_asset_id;
  if not found then
    raise exception 'SIMKOS_ASSET_NOT_FOUND: Aset dengan ID % tidak ditemukan', p_asset_id;
  end if;

  if not (public.is_org_owner(v_asset.org_id) or public.is_org_admin(v_asset.org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat mengaktivasi aset';
  end if;

  -- 1. Kunci transaksi advisory lock
  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || v_asset.org_id::text));

  -- 2. Baca ulang data aset setelah lock
  select * into v_asset from public.assets where id = p_asset_id;

  if v_asset.status_pencatatan in ('draft', 'aktif', 'perlu_pengesahan_ulang') then
    -- Aset draft, aktif, atau perlu_pengesahan_ulang boleh diaktivasi / diaktivasi ulang
    null;
  else
    raise exception 'SIMKOS_INVALID_STATUS: Hanya aset berstatus draft, aktif, atau perlu_pengesahan_ulang yang dapat diaktivasi';
  end if;

  -- 3. Validasi minimal 1 komponen
  if not exists (select 1 from public.asset_components where asset_id = p_asset_id) then
    raise exception 'SIMKOS_NO_COMPONENTS: Aset wajib memiliki minimal satu komponen sebelum diaktivasi';
  end if;

  -- 4. Validasi komponen kapitalisasi
  if v_asset.kategori_aset != 'tanah' then
    select count(*) into v_invalid_count 
    from public.asset_components 
    where asset_id = p_asset_id and status_kapitalisasi = 'perlu_telaah';

    if v_invalid_count > 0 then
      raise exception 'SIMKOS_COMPONENT_UNRESOLVED: Terdapat % komponen berstatus perlu_telaah. Wajib diputuskan kapitalisasi atau beban langsung', v_invalid_count;
    end if;

    -- Validasi kelengkapan ketat (tidak ada data kosong yang diam-diam jadi nol)
    select count(*) into v_invalid_count
    from public.asset_components
    where asset_id = p_asset_id 
      and status_kapitalisasi = 'kapitalisasi'
      and (biaya_perolehan is null or biaya_perolehan < 0
           or tanggal_siap_guna is null 
           or masa_manfaat_bulan is null or masa_manfaat_bulan <= 0
           or porsi_usaha_persen is null or porsi_usaha_persen < 0 or porsi_usaha_persen > 100
           or metode_penyusutan is null or metode_penyusutan != 'garis_lurus');

    if v_invalid_count > 0 then
      raise exception 'SIMKOS_INCOMPLETE_PARAMETERS: Terdapat % komponen kapitalisasi dengan parameter belum lengkap (metode, porsi usaha, biaya, tanggal, atau masa manfaat)', v_invalid_count;
    end if;
  end if;

  -- 5. Pengecekan Komponen Terlambat terhadap Periode Posting Aktif (Hanya perbedaan terhadap snapshot terakhir):
  select period_key into v_latest_posted_period
  from public.asset_depreciation_batches
  where org_id = v_asset.org_id and batch_status = 'posted'
  order by period_key desc limit 1;

  if v_latest_posted_period is not null then
    v_latest_posted_end_date := (make_date(substring(v_latest_posted_period from 1 for 4)::int, substring(v_latest_posted_period from 6 for 2)::int, 1) + interval '1 month' - interval '1 day')::date;

    -- Ambil snapshot terakhir jika ada untuk membandingkan perbedaan
    select * into v_prev_snap
    from public.asset_activation_snapshots
    where asset_id = p_asset_id
    order by version desc limit 1;

    -- Periksa hanya komponen baru atau yang berubah parameter siap guna/kapitalisasinya
    select c.* into v_late_comp
    from public.asset_components c
    where c.asset_id = p_asset_id
      and c.status_kapitalisasi = 'kapitalisasi'
      and c.metode_penyusutan = 'garis_lurus'
      and c.tanggal_siap_guna <= v_latest_posted_end_date
      and (
        v_prev_snap.id is null
        or not exists (
          select 1 from jsonb_array_elements(v_prev_snap.snapshot_params) elem
          where (elem->>'id')::uuid = c.id
            and (elem->>'status_kapitalisasi') = 'kapitalisasi'
            and (elem->>'tanggal_siap_guna')::date = c.tanggal_siap_guna
            and (elem->>'biaya_perolehan')::numeric = c.biaya_perolehan
        )
      )
    limit 1;

    if v_late_comp.id is not null then
      raise exception 'SIMKOS_LATE_COMPONENT_REQUIRES_UNWIND: Komponen % memiliki tanggal siap guna (%) pada periode yang telah diposting aktif (%). Batalkan mundur posting hingga periode sebelum tanggal siap guna komponen terlebih dahulu',
        v_late_comp.nama_komponen, v_late_comp.tanggal_siap_guna, v_latest_posted_period;
    end if;
  end if;

  -- 6. Tentukan versi snapshot berikutnya
  select coalesce(max(version), 0) + 1 into v_next_version
  from public.asset_activation_snapshots
  where asset_id = p_asset_id;

  -- 7. Kumpulkan parameter kanonis seluruh komponen ke dalam snapshot_params
  select jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'component_id', c.id,
      'asset_id', c.asset_id,
      'org_id', c.org_id,
      'nama_komponen', c.nama_komponen,
      'biaya_perolehan', c.biaya_perolehan,
      'nilai_sisa', c.nilai_sisa,
      'masa_manfaat_bulan', c.masa_manfaat_bulan,
      'tanggal_siap_guna', c.tanggal_siap_guna,
      'porsi_usaha_persen', c.porsi_usaha_persen,
      'status_kapitalisasi', c.status_kapitalisasi,
      'metode_penyusutan', c.metode_penyusutan
    ) order by c.created_at asc
  ) into v_components
  from public.asset_components c
  where c.asset_id = p_asset_id;

  insert into public.asset_activation_snapshots (
    asset_id, org_id, kategori_aset, version, algorithm_version, snapshot_params, activated_by, activation_notes
  ) values (
    p_asset_id, v_asset.org_id, v_asset.kategori_aset, v_next_version, 'v3.1-bresenham', v_components, auth.uid(), p_activation_notes
  ) returning * into v_snapshot;

  -- Set session variable agar trigger validate_asset_relations mengizinkan transisi status ke 'aktif'
  perform set_config('simkos.in_rpc_activate_asset', 'true', true);

  update public.assets set
    status_pencatatan = 'aktif',
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_asset_id;

  update public.asset_components set
    requires_reapproval = false
  where asset_id = p_asset_id;

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
  v_snap public.asset_activation_snapshots%rowtype;
  v_snap_comp jsonb;
  v_result public.asset_opening_balances%rowtype;
begin
  if p_component_id is null then
    raise exception 'SIMKOS_INVALID_PARAM: component_id wajib diisi';
  end if;
  if p_jalur is null or p_jalur not in ('simulasi_historis', 'catatan_terdahulu') then
    raise exception 'SIMKOS_INVALID_PATH: Jalur saldo tidak valid. Gunakan simulasi_historis atau catatan_terdahulu';
  end if;

  select * into v_comp from public.asset_components where id = p_component_id;
  if not found then
    raise exception 'SIMKOS_COMPONENT_NOT_FOUND: Komponen dengan ID % tidak ditemukan', p_component_id;
  end if;

  if not (public.is_org_owner(v_comp.org_id) or public.is_org_admin(v_comp.org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat mengesahkan saldo awal';
  end if;

  -- 1. Kunci transaksi advisory lock
  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || v_comp.org_id::text));

  -- 2. BACA ULANG seluruh keadaan setelah lock
  select * into v_comp from public.asset_components where id = p_component_id;
  select * into v_asset from public.assets where id = v_comp.asset_id;
  if not found or v_asset.status_pencatatan not in ('aktif', 'perlu_pengesahan_ulang') then
    raise exception 'SIMKOS_ASSET_NOT_ACTIVE: Saldo awal hanya dapat disahkan untuk aset yang telah diaktivasi';
  end if;

  if v_asset.status_pencatatan = 'perlu_pengesahan_ulang' or coalesce(v_comp.requires_reapproval, false) = true then
    raise exception 'SIMKOS_REAPPROVAL_REQUIRED: Parameter komponen atau aset telah direvisi; lakukan aktivasi ulang aset terlebih dahulu untuk menerbitkan snapshot baru sebelum mengesahkan saldo awal';
  end if;

  -- Ambil snapshot aktivasi terbaru
  select * into v_snap from public.asset_activation_snapshots
  where asset_id = v_comp.asset_id order by version desc limit 1;
  if not found then
    raise exception 'SIMKOS_NO_SNAPSHOT: Aset belum memiliki snapshot aktivasi resmi';
  end if;

  -- Ambil parameter komponen dari elemen SNAPSHOT
  select elem into v_snap_comp
  from jsonb_array_elements(v_snap.snapshot_params) elem
  where (elem->>'id')::uuid = p_component_id;
  if v_snap_comp is null then
    raise exception 'SIMKOS_COMPONENT_NOT_IN_SNAPSHOT: Komponen belum disahkan dalam snapshot aktivasi aset';
  end if;

  -- Tolak jika parameter snapshot masih memuat angka lama yang berbeda dengan master (stale snapshot guard)
  if (v_snap_comp->>'biaya_perolehan')::numeric is distinct from v_comp.biaya_perolehan or
     (v_snap_comp->>'nilai_sisa')::numeric is distinct from v_comp.nilai_sisa or
     (v_snap_comp->>'masa_manfaat_bulan')::int is distinct from v_comp.masa_manfaat_bulan or
     (v_snap_comp->>'tanggal_siap_guna')::date is distinct from v_comp.tanggal_siap_guna or
     (v_snap_comp->>'porsi_usaha_persen')::numeric is distinct from v_comp.porsi_usaha_persen then
    raise exception 'SIMKOS_REAPPROVAL_REQUIRED: Snapshot aktivasi masih memuat parameter lama; lakukan aktivasi ulang aset terlebih dahulu';
  end if;

  -- 3. PERIKSA BATCH AKTIF DI ORGANISASI: Menolak keras pengesahan jika masih ada batch aktif
  if exists (
    select 1 from public.asset_depreciation_batches
    where org_id = v_comp.org_id and batch_status = 'posted'
  ) then
    raise exception 'SIMKOS_POSTED_BATCH_EXISTS: Tidak dapat mengesahkan saldo awal baru karena terdapat batch posting yang aktif. Batalkan seluruh batch posting aktif terlebih dahulu';
  end if;

  select * into v_settings from public.asset_bookkeeping_settings where org_id = v_comp.org_id;
  if not found then
    raise exception 'SIMKOS_NO_SETTINGS: Organisasi belum mengatur tanggal mulai pembukuan';
  end if;

  v_cutoff_date := v_settings.tanggal_mulai_pembukuan - interval '1 day';
  v_cutoff_key := to_char(v_cutoff_date, 'YYYY-MM');

  -- Gunakan parameter dari SNAPSHOT (bukan data master mutable)
  v_biaya := (v_snap_comp->>'biaya_perolehan')::numeric;
  v_sisa := coalesce((v_snap_comp->>'nilai_sisa')::numeric, 0);
  v_dasar := v_biaya - v_sisa;

  if (v_snap_comp->>'tanggal_siap_guna')::date >= v_settings.tanggal_mulai_pembukuan then
    raise exception 'SIMKOS_ACQUISITION_NOT_HISTORICAL: Komponen siap guna pada atau setelah tanggal mulai pembukuan, tidak memerlukan saldo awal historis';
  end if;

  if p_jalur = 'simulasi_historis' then
    select * into v_last_sched 
    from public.calc_component_depreciation_schedule(
      v_biaya, v_sisa, (v_snap_comp->>'masa_manfaat_bulan')::int, 
      (v_snap_comp->>'tanggal_siap_guna')::date, (v_snap_comp->>'porsi_usaha_persen')::numeric
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
    
    if (v_snap_comp->>'porsi_usaha_persen') is not null and v_sisa_dasar > 0 then
      v_sisa_target_usaha := round(v_sisa_dasar * ((v_snap_comp->>'porsi_usaha_persen')::numeric / 100.0));
    else
      v_sisa_target_usaha := 0;
    end if;

    select count(*) into v_sisa_periode_kalender
    from public.calc_component_depreciation_schedule(
      v_biaya, v_sisa, (v_snap_comp->>'masa_manfaat_bulan')::int, 
      (v_snap_comp->>'tanggal_siap_guna')::date, (v_snap_comp->>'porsi_usaha_persen')::numeric
    )
    where period_key > v_cutoff_key;

    v_sisa_bobot := v_sisa_periode_kalender::numeric;

  elsif p_jalur = 'catatan_terdahulu' then
    if p_manual_akumulasi is null then
      raise exception 'SIMKOS_INVALID_MANUAL_ACCUMULATION: Akumulasi manual wajib diisi';
    end if;
    if round(p_manual_akumulasi) != p_manual_akumulasi then
      raise exception 'SIMKOS_INVALID_MANUAL_ACCUMULATION: Akumulasi manual harus berupa bilangan bulat rupiah tanpa pecahan desimal';
    end if;
    if p_manual_akumulasi < 0 or p_manual_akumulasi > v_dasar then
      raise exception 'SIMKOS_INVALID_MANUAL_ACCUMULATION: Akumulasi manual harus antara 0 dan dasar penyusutan (%)', v_dasar;
    end if;

    v_akum_awal := p_manual_akumulasi;
    v_akum_usaha_awal := coalesce(p_manual_usaha, 0);
    if round(v_akum_usaha_awal) != v_akum_usaha_awal then
      raise exception 'SIMKOS_INVALID_MANUAL_BUSINESS: Akumulasi usaha harus berupa bilangan bulat rupiah tanpa pecahan desimal';
    end if;
    if v_akum_usaha_awal < 0 or v_akum_usaha_awal > v_akum_awal then
      raise exception 'SIMKOS_INVALID_MANUAL_BUSINESS: Akumulasi usaha harus antara 0 dan akumulasi penyusutan awal';
    end if;

    v_akum_non_usaha_awal := v_akum_awal - v_akum_usaha_awal;
    v_nilai_buku_awal := v_biaya - v_akum_awal;
    v_sisa_dasar := v_nilai_buku_awal - v_sisa;

    if (v_snap_comp->>'porsi_usaha_persen') is not null and v_sisa_dasar > 0 then
      v_sisa_target_usaha := round(v_sisa_dasar * ((v_snap_comp->>'porsi_usaha_persen')::numeric / 100.0));
    else
      v_sisa_target_usaha := 0;
    end if;

    v_start_day := extract(day from (v_snap_comp->>'tanggal_siap_guna')::date)::int;
    v_days_first_month := extract(day from (make_date(extract(year from (v_snap_comp->>'tanggal_siap_guna')::date)::int, extract(month from (v_snap_comp->>'tanggal_siap_guna')::date)::int, 1) + interval '1 month' - interval '1 day'))::int;
    
    v_months_past := (extract(year from v_cutoff_date)::int - extract(year from (v_snap_comp->>'tanggal_siap_guna')::date)::int) * 12 
      + (extract(month from v_cutoff_date)::int - extract(month from (v_snap_comp->>'tanggal_siap_guna')::date)::int) + 1;

    if v_start_day = 1 then
      v_bobot_lalu := v_months_past::numeric;
    else
      v_bobot_lalu := ((v_days_first_month - v_start_day + 1)::numeric / v_days_first_month::numeric) + (v_months_past - 1)::numeric;
    end if;

    v_sisa_bobot := (v_snap_comp->>'masa_manfaat_bulan')::numeric - v_bobot_lalu;

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
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
  from public.asset_opening_balances
  where component_id = p_component_id;

  -- Batalkan versi approved lama jika ada
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
  if p_component_id is null then
    raise exception 'SIMKOS_INVALID_PARAM: component_id wajib diisi';
  end if;

  select * into v_ob from public.asset_opening_balances 
  where component_id = p_component_id and status = 'approved';
  
  if not found then
    raise exception 'SIMKOS_OB_NOT_FOUND: Tidak ditemukan saldo awal approved untuk komponen ID %', p_component_id;
  end if;

  if not (public.is_org_owner(v_ob.org_id) or public.is_org_admin(v_ob.org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat membatalkan saldo awal';
  end if;

  -- 1. Kunci transaksi
  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || v_ob.org_id::text));

  -- 2. Baca ulang status setelah lock
  select * into v_ob from public.asset_opening_balances 
  where component_id = p_component_id and status = 'approved';
  if not found then
    raise exception 'SIMKOS_OB_NOT_FOUND: Tidak ditemukan saldo awal approved untuk komponen ID %', p_component_id;
  end if;

  -- 3. Wajib: tidak boleh ada batch posting aktif
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

-- RPC 5: Pratinjau Server Posting Penyusutan Bulanan (Menggunakan Sumber Snapshot Resmi)
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
  v_asset record;
  v_snap public.asset_activation_snapshots%rowtype;
  v_comp_json jsonb;
  v_comp_id uuid;
  v_nama_komponen text;
  v_biaya numeric;
  v_sisa numeric;
  v_masa int;
  v_tgl_siap_guna date;
  v_porsi numeric;
  v_status_kap text;
  v_metode text;
  v_ob public.asset_opening_balances%rowtype;
  v_sched record;
  v_snapshot_hash text;
  v_ob_hash text;
  v_master_hash text;
  v_preview_token text;
  v_item jsonb;
  v_revised_asset_name text;
begin
  if p_org_id is null then
    raise exception 'SIMKOS_INVALID_PARAM: org_id wajib diisi';
  end if;
  if p_period_key is null or p_period_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'SIMKOS_INVALID_PARAM: period_key tidak valid (harus YYYY-MM)';
  end if;

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

  -- Tolak pratinjau jika terdapat aset atau komponen yang memerlukan pengesahan ulang (aktivasi ulang)
  select a.nama_aset into v_revised_asset_name
  from public.assets a
  where a.org_id = p_org_id and (
    a.status_pencatatan = 'perlu_pengesahan_ulang' or
    exists (select 1 from public.asset_components c where c.asset_id = a.id and c.requires_reapproval = true)
  )
  limit 1;

  if v_revised_asset_name is not null then
    raise exception 'SIMKOS_REAPPROVAL_REQUIRED: Aset % memiliki parameter yang telah direvisi dan memerlukan pengesahan ulang (aktivasi ulang) sebelum pratinjau atau posting dapat dilakukan', v_revised_asset_name;
  end if;

  v_period_date := make_date(substring(p_period_key from 1 for 4)::int, substring(p_period_key from 6 for 2)::int, 1);
  v_period_end_date := v_period_date + interval '1 month' - interval '1 day';

  -- Evaluasi seluruh aset aktif berdasarkan SNAPSHOT AKTIVASI RESMI
  for v_asset in (
    select id, nama_aset, kategori_aset
    from public.assets
    where org_id = p_org_id and status_pencatatan = 'aktif'
    order by created_at asc
  ) loop
    select * into v_snap from public.asset_activation_snapshots
    where asset_id = v_asset.id order by version desc limit 1;

    if not found then
      continue;
    end if;

    v_snapshot_map := jsonb_set(v_snapshot_map, array[v_asset.id::text], to_jsonb(v_snap.version));

    -- Evaluasi setiap komponen yang tersimpan resmi di dalam SNAPSHOT
    for v_comp_json in select * from jsonb_array_elements(v_snap.snapshot_params) loop
      v_comp_id := (v_comp_json->>'id')::uuid;
      v_nama_komponen := v_comp_json->>'nama_komponen';
      v_biaya := (v_comp_json->>'biaya_perolehan')::numeric;
      v_sisa := coalesce((v_comp_json->>'nilai_sisa')::numeric, 0);
      v_masa := (v_comp_json->>'masa_manfaat_bulan')::int;
      v_tgl_siap_guna := (v_comp_json->>'tanggal_siap_guna')::date;
      v_porsi := (v_comp_json->>'porsi_usaha_persen')::numeric;
      v_status_kap := v_comp_json->>'status_kapitalisasi';
      v_metode := v_comp_json->>'metode_penyusutan';

      -- Pengecekan kelayakan dasar menggunakan kategori aset yang dibekukan di snapshot
      if v_snap.kategori_aset = 'tanah' or v_status_kap = 'beban_langsung' or v_metode = 'tidak_disusutkan' then
        v_ineligible := v_ineligible || jsonb_build_object(
          'component_id', v_comp_id, 'nama_komponen', v_nama_komponen, 'alasan', 'Tidak disusutkan'
        );
        continue;
      end if;

      if v_tgl_siap_guna > v_period_end_date then
        v_ineligible := v_ineligible || jsonb_build_object(
          'component_id', v_comp_id, 'nama_komponen', v_nama_komponen, 'alasan', 'Belum siap guna pada periode ini'
        );
        continue;
      end if;

      -- Komponen historis (< tanggal mulai) wajib memiliki saldo awal approved
      if v_tgl_siap_guna < v_settings.tanggal_mulai_pembukuan then
        select * into v_ob from public.asset_opening_balances
        where component_id = v_comp_id and status = 'approved';
        if not found then
          v_ineligible := v_ineligible || jsonb_build_object(
            'component_id', v_comp_id, 'nama_komponen', v_nama_komponen, 'alasan', 'Saldo awal historis belum disahkan'
          );
          continue;
        end if;

        if v_ob.jalur_saldo = 'simulasi_historis' then
          select * into v_sched from public.calc_component_depreciation_schedule(
            v_biaya, v_sisa, v_masa, v_tgl_siap_guna, v_porsi
          ) where period_key = p_period_key;
        else
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
          v_biaya, v_sisa, v_masa, v_tgl_siap_guna, v_porsi
        ) where period_key = p_period_key;
      end if;

      if not found or v_sched is null then
        v_ineligible := v_ineligible || jsonb_build_object(
          'component_id', v_comp_id, 'nama_komponen', v_nama_komponen, 'alasan', 'Masa manfaat telah berakhir'
        );
        continue;
      end if;

      v_item := jsonb_build_object(
        'component_id', v_comp_id,
        'asset_id', v_asset.id,
        'nama_komponen', v_nama_komponen,
        'snapshot_id', v_snap.id,
        'opening_balance_id', v_ob.id,
        'beban', v_sched.beban,
        'beban_usaha', v_sched.beban_usaha,
        'beban_non_usaha', v_sched.beban_non_usaha,
        'porsi_usaha_persen', v_porsi,
        'akumulasi', v_sched.akumulasi,
        'nilai_buku', v_sched.nilai_buku
      );

      v_eligible := v_eligible || v_item;
      v_total_depr := v_total_depr + v_sched.beban;
      v_total_bus := v_total_bus + v_sched.beban_usaha;
      v_total_non_bus := v_total_non_bus + v_sched.beban_non_usaha;
      v_count := v_count + 1;
    end loop;
  end loop;

  -- Token pratinjau: mengunci versi snapshot, saldo awal approved, dan master aset/komponen aktif
  select md5(coalesce(string_agg(asset_id::text || '=' || version::text || '=' || snapshot_params::text, ',' order by asset_id), 'NO_SNAP'))
  into v_snapshot_hash
  from public.asset_activation_snapshots
  where org_id = p_org_id;

  select md5(coalesce(string_agg(component_id::text || '=' || version::text || '=' || akumulasi_penyusutan_awal::text || '=' || sisa_dasar_penyusutan::text, ',' order by component_id), 'NO_OB'))
  into v_ob_hash
  from public.asset_opening_balances
  where org_id = p_org_id and status = 'approved';

  select md5(coalesce(string_agg(c.id::text || '=' || coalesce(c.biaya_perolehan::text, '') || '=' || coalesce(c.porsi_usaha_persen::text, '') || '=' || coalesce(c.tanggal_siap_guna::text, ''), ',' order by c.id), 'NO_MASTER'))
  into v_master_hash
  from public.asset_components c
  join public.assets a on a.id = c.asset_id
  where c.org_id = p_org_id and a.status_pencatatan = 'aktif';

  v_preview_token := 'pv_' || md5(
    p_org_id::text || ':' || p_period_key || ':v3.1-bresenham:' || 
    coalesce(v_snapshot_hash, 'S0') || ':' || 
    coalesce(v_ob_hash, 'O0') || ':' || 
    coalesce(v_master_hash, 'M0') || ':' || 
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

-- RPC 6: Posting Batch Penyusutan (Server-Side Canonical Payload Hash & Re-read After Lock)
create or replace function public.post_depreciation_batch(
  p_org_id uuid,
  p_period_key text,
  p_idempotency_key text,
  p_payload_hash text default null,
  p_preview_token text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_computed_payload_hash text;
  v_existing public.asset_depreciation_batches%rowtype;
  v_preview jsonb;
  v_server_preview_token text;
  v_period_rec public.asset_accounting_periods%rowtype;
  v_replaces_batch_id uuid;
  v_entry_type text;
  v_new_batch public.asset_depreciation_batches%rowtype;
  v_elem jsonb;
  v_revised_asset_name text;
begin
  -- 1. Validasi parameter wajib non-null secara ketat
  if p_org_id is null then
    raise exception 'SIMKOS_INVALID_PARAM: org_id wajib diisi';
  end if;
  if p_period_key is null or p_period_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'SIMKOS_INVALID_PARAM: period_key tidak valid (harus YYYY-MM)';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) = 0 then
    raise exception 'SIMKOS_INVALID_PARAM: idempotency_key wajib diisi';
  end if;
  if p_preview_token is null or length(btrim(p_preview_token)) = 0 then
    raise exception 'SIMKOS_INVALID_PARAM: preview_token wajib diisi';
  end if;

  if not (public.is_org_owner(p_org_id) or public.is_org_admin(p_org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat memposting penyusutan';
  end if;

  -- 2. Hitung payload hash kanonis di server
  v_computed_payload_hash := md5(p_org_id::text || '|' || p_period_key || '|' || coalesce(trim(p_notes), ''));

  if p_payload_hash is not null and p_payload_hash != v_computed_payload_hash then
    raise exception 'SIMKOS_IDEMPOTENCY_PAYLOAD_MISMATCH: Payload hash klien tidak sesuai dengan kalkulasi kanonis server';
  end if;

  -- 3. Ambil penguncian transaksi advisory lock
  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || p_org_id::text));

  -- 4. BACA ULANG status idempotensi setelah lock
  select * into v_existing from public.asset_depreciation_batches
  where org_id = p_org_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.payload_hash != v_computed_payload_hash then
      raise exception 'SIMKOS_IDEMPOTENCY_PAYLOAD_MISMATCH: Kunci idempotensi sama digunakan dengan payload berbeda';
    end if;
    return to_jsonb(v_existing);
  end if;

  -- 5. Cek apakah sudah ada batch aktif untuk periode ini
  if exists (
    select 1 from public.asset_depreciation_batches
    where org_id = p_org_id and period_key = p_period_key and batch_status = 'posted'
  ) then
    raise exception 'SIMKOS_BATCH_ALREADY_POSTED: Periode % telah memiliki batch posting aktif', p_period_key;
  end if;

  -- Tolak posting jika terdapat aset atau komponen yang memerlukan pengesahan ulang (aktivasi ulang)
  select a.nama_aset into v_revised_asset_name
  from public.assets a
  where a.org_id = p_org_id and (
    a.status_pencatatan = 'perlu_pengesahan_ulang' or
    exists (select 1 from public.asset_components c where c.asset_id = a.id and c.requires_reapproval = true)
  )
  limit 1;

  if v_revised_asset_name is not null then
    raise exception 'SIMKOS_REAPPROVAL_REQUIRED: Aset % memiliki parameter yang telah direvisi dan memerlukan pengesahan ulang (aktivasi ulang) sebelum posting dapat dilakukan', v_revised_asset_name;
  end if;

  -- 6. Deteksi posting pengganti
  select id into v_replaces_batch_id
  from public.asset_depreciation_batches
  where org_id = p_org_id and period_key = p_period_key and batch_status = 'reversed'
  order by created_at desc limit 1;

  if v_replaces_batch_id is not null then
    v_entry_type := 'replacement';
  else
    v_entry_type := 'regular';
  end if;

  -- 7. Status periode akuntansi
  insert into public.asset_accounting_periods (org_id, period_key, status)
  values (p_org_id, p_period_key, 'open')
  on conflict (org_id, period_key) do nothing;

  select * into v_period_rec from public.asset_accounting_periods 
  where org_id = p_org_id and period_key = p_period_key;

  if v_period_rec.status = 'locked' then
    raise exception 'SIMKOS_PERIOD_LOCKED: Periode % dalam keadaan terkunci (locked)', p_period_key;
  end if;

  -- 8. Hitung ulang preview di dalam lock
  v_preview := public.preview_depreciation_posting(p_org_id, p_period_key);
  v_server_preview_token := v_preview->>'preview_token';

  if v_server_preview_token != p_preview_token then
    raise exception 'SIMKOS_STALE_PREVIEW: Pratinjau kedaluwarsa. Parameter aset, komponen, atau saldo awal telah berubah sejak pratinjau dibuat';
  end if;

  -- 9. Insert batch
  insert into public.asset_depreciation_batches (
    org_id, period_id, period_key, batch_number, idempotency_key, payload_hash,
    batch_status, reversed_batch_id, replaces_batch_id,
    total_depreciation, total_business_portion, total_non_business_portion,
    component_count, algorithm_version, snapshot_version_map, preview_token,
    posted_by, posted_at
  ) values (
    p_org_id, v_period_rec.id, p_period_key,
    'BATCH-' || replace(p_period_key, '-', '') || '-' || substr(gen_random_uuid()::text, 1, 8),
    p_idempotency_key, v_computed_payload_hash,
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

  -- 10. Insert rincian ledger
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

  -- 11. Catat audit log
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

-- RPC 7: Pembatalan Batch Penyusutan (Storno / Reversal dengan Re-read After Lock)
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
  v_org_id uuid;
  v_row record;
begin
  if p_batch_id is null then
    raise exception 'SIMKOS_INVALID_PARAM: batch_id wajib diisi';
  end if;

  select org_id into v_org_id from public.asset_depreciation_batches where id = p_batch_id;
  if not found then
    raise exception 'SIMKOS_BATCH_NOT_FOUND: Batch dengan ID % tidak ditemukan', p_batch_id;
  end if;

  if not (public.is_org_owner(v_org_id) or public.is_org_admin(v_org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat membatalkan batch penyusutan';
  end if;

  -- 1. Ambil advisory lock
  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || v_org_id::text));

  -- 2. BACA ULANG status batch setelah lock
  select * into v_batch from public.asset_depreciation_batches where id = p_batch_id;
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

  -- Update batch awal menjadi reversed
  update public.asset_depreciation_batches set
    batch_status = 'reversed',
    reversed_by = auth.uid(),
    reversed_at = now(),
    reversal_reason = p_reason
  where id = p_batch_id
  returning * into v_batch;

  -- Buat baris storno di ledger (jika batch nol, loop 0 iterasi tanpa error)
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
  if p_org_id is null then
    raise exception 'SIMKOS_INVALID_PARAM: org_id wajib diisi';
  end if;
  if p_period_key is null or p_period_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'SIMKOS_INVALID_PARAM: period_key tidak valid';
  end if;

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
  if p_org_id is null then
    raise exception 'SIMKOS_INVALID_PARAM: org_id wajib diisi';
  end if;
  if p_period_key is null or p_period_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'SIMKOS_INVALID_PARAM: period_key tidak valid';
  end if;

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

-- RPC 10: Revisi Parameter Finansial Komponen Resmi (Setelah Pembatalan Unwind Selesai)
create or replace function public.revise_component_parameters(
  p_component_id uuid,
  p_biaya_perolehan numeric,
  p_nilai_sisa numeric default 0,
  p_masa_manfaat_bulan int default null,
  p_tanggal_siap_guna date default null,
  p_porsi_usaha_persen numeric default null,
  p_metode_penyusutan text default 'garis_lurus',
  p_status_kapitalisasi text default 'kapitalisasi',
  p_revision_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_comp public.asset_components%rowtype;
  v_asset public.assets%rowtype;
  v_updated_comp public.asset_components%rowtype;
begin
  if p_component_id is null then
    raise exception 'SIMKOS_INVALID_PARAM: component_id wajib diisi';
  end if;

  select * into v_comp from public.asset_components where id = p_component_id;
  if not found then
    raise exception 'SIMKOS_COMPONENT_NOT_FOUND: Komponen tidak ditemukan';
  end if;

  select * into v_asset from public.assets where id = v_comp.asset_id;
  if not found then
    raise exception 'SIMKOS_ASSET_NOT_FOUND: Aset tidak ditemukan';
  end if;

  if not (public.is_org_owner(v_asset.org_id) or public.is_org_admin(v_asset.org_id)) then
    raise exception 'SIMKOS_FORBIDDEN: Hanya owner atau admin yang dapat merevisi parameter komponen';
  end if;

  -- 1. Kunci transaksi advisory lock pada organisasi
  perform pg_advisory_xact_lock(hashtext('simkos:depreciation:' || v_asset.org_id::text));

  -- 2. BACA ULANG status setelah lock: pastikan tidak ada batch aktif di organisasi
  if exists (
    select 1 from public.asset_depreciation_batches
    where org_id = v_asset.org_id and batch_status = 'posted'
  ) then
    raise exception 'SIMKOS_POSTED_BATCH_EXISTS: Tidak dapat merevisi parameter komponen karena terdapat batch posting aktif. Batalkan seluruh batch posting aktif terlebih dahulu';
  end if;

  -- 3. Validasi parameter numerik
  if p_biaya_perolehan is null or p_biaya_perolehan < 0 then
    raise exception 'SIMKOS_INVALID_PARAM: biaya_perolehan wajib diisi dan non-negatif';
  end if;
  if p_nilai_sisa is null or p_nilai_sisa < 0 or p_nilai_sisa > p_biaya_perolehan then
    raise exception 'SIMKOS_INVALID_PARAM: nilai_sisa tidak valid (harus 0 s/d biaya_perolehan)';
  end if;
  if p_status_kapitalisasi not in ('kapitalisasi', 'beban_langsung', 'perlu_telaah') then
    raise exception 'SIMKOS_INVALID_PARAM: status_kapitalisasi tidak valid';
  end if;

  if p_status_kapitalisasi = 'kapitalisasi' then
    if p_masa_manfaat_bulan is null or p_masa_manfaat_bulan <= 0 then
      raise exception 'SIMKOS_INVALID_PARAM: masa_manfaat_bulan wajib positif untuk komponen kapitalisasi';
    end if;
    if p_tanggal_siap_guna is null then
      raise exception 'SIMKOS_INVALID_PARAM: tanggal_siap_guna wajib diisi';
    end if;
    if p_porsi_usaha_persen is not null and (p_porsi_usaha_persen < 0 or p_porsi_usaha_persen > 100) then
      raise exception 'SIMKOS_INVALID_PARAM: porsi_usaha_persen harus antara 0 dan 100';
    end if;
    if p_metode_penyusutan is null or p_metode_penyusutan != 'garis_lurus' then
      raise exception 'SIMKOS_INVALID_PARAM: metode_penyusutan hanya mendukung garis_lurus';
    end if;
  end if;

  -- 4. Batalkan saldo awal aktif komponen ini jika ada (karena parameter finansial berubah)
  update public.asset_opening_balances set
    status = 'cancelled',
    cancelled_by = auth.uid(),
    cancelled_at = now(),
    cancellation_reason = 'Dibatalkan otomatis akibat revisi parameter komponen'
  where component_id = p_component_id and status = 'approved';

  -- 5. Lakukan update pada asset_components dengan flag session simkos.in_rpc_revise_component
  perform set_config('simkos.in_rpc_revise_component', 'true', true);

  update public.asset_components set
    biaya_perolehan = p_biaya_perolehan,
    nilai_sisa = coalesce(p_nilai_sisa, 0),
    masa_manfaat_bulan = p_masa_manfaat_bulan,
    tanggal_siap_guna = p_tanggal_siap_guna,
    porsi_usaha_persen = p_porsi_usaha_persen,
    metode_penyusutan = p_metode_penyusutan,
    status_kapitalisasi = p_status_kapitalisasi,
    requires_reapproval = true,
    updated_at = now()
  where id = p_component_id
  returning * into v_updated_comp;

  -- 6. Tandai aset induk sebagai memerlukan pengesahan ulang (perlu_pengesahan_ulang)
  update public.assets set
    status_pencatatan = 'perlu_pengesahan_ulang',
    updated_at = now()
  where id = v_asset.id;

  -- 7. Catat audit log
  insert into public.asset_accounting_audit_logs (
    org_id, event_type, entity_type, entity_id, actor_id, actor_role, notes_reason, payload_before, payload_after
  ) values (
    v_asset.org_id, 'component_parameters_revised', 'component', p_component_id, auth.uid(),
    case when public.is_org_owner(v_asset.org_id) then 'owner' else 'admin' end,
    coalesce(p_revision_notes, 'Parameter komponen direvisi melalui RPC resmi'),
    to_jsonb(v_comp),
    to_jsonb(v_updated_comp)
  );

  return to_jsonb(v_updated_comp);
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
grant execute on function public.revise_component_parameters(uuid, numeric, numeric, int, date, numeric, text, text, text) to anon, authenticated;
