-- ==============================================================================
-- Migrasi: 20261111001000_assets_phase5_financial_report.sql
-- Modul: Aset, Inventaris & Integrasi Laporan Keuangan Internal SimKos (Fase 5B)
-- Deskripsi:
--   1. Penambahan kolom location_id (ON DELETE RESTRICT) & location_recorded pada
--      asset_activation_snapshots untuk membekukan lokasi aset saat disahkan.
--   2. Pembaruan activate_asset untuk membekukan location_id, expense_id,
--      allocated_cost, dan status_kapitalisasi di dalam snapshot resmi.
--   3. Pembaruan revise_component_parameters dengan dukungan revisi expense_id
--      dan allocated_cost secara kompatibel terhadap Fase 4.
--   4. Penguatan trigger validate_asset_relations, validate_component_relations,
--      dan validate_expense_asset_allocations (tanpa memperluas kunci periode
--      penyusutan ke transaksi kas umum).
--   5. Implementasi RPC get_period_financial_report sesuai kontrak Fase 5A
--      (b63380a): pemisahan arus kas vs hasil usaha internal bulan penuh,
--      preservasi alokasi referensi selama pengesahan ulang, pemisahan usulan
--      revisi agar tidak dihitung ganda, deteksi masalah tertunda termasuk
--      allocated_cost IS NULL & perpindahan expense_id lintas periode lama/baru,
--      penanganan eksplisit snapshot lama tanpa data lokasi/alokasi, serta
--      pemisahan ketiadaan batch (null) vs batch nol / lokasi tanpa ledger (0).
-- ==============================================================================

-- 1. Penambahan Kolom Lokasi Snapshot dengan ON DELETE RESTRICT & Penanda Metadata
alter table public.asset_activation_snapshots
  add column if not exists location_id uuid references public.locations(id) on delete restrict,
  add column if not exists location_recorded boolean not null default false;

alter table public.asset_activation_snapshots
  drop constraint if exists asset_activation_snapshots_kategori_aset_check;
alter table public.asset_activation_snapshots
  add constraint asset_activation_snapshots_kategori_aset_check check (
    kategori_aset in (
      'tanah', 'gedung', 'peralatan', 'kendaraan', 'elektronik_kantor', 'komponen_gedung',
      'fasilitas_kamar', 'fasilitas_umum', 'lainnya'
    )
  );

create index if not exists idx_snapshots_org_asset_ver
  on public.asset_activation_snapshots (org_id, asset_id, version desc);

create index if not exists idx_snapshots_location
  on public.asset_activation_snapshots (location_id);

-- 1b. Helper Function: get_expense_effective_allocated_cost
--     Menghitung total alokasi yang sah dan terikat pada suatu pengeluaran kas:
--     Memadukan snapshot aktif terakhir per aset (resmi berlaku) dan perubahan pada master komponen
--     (usulan revisi/penambahan), sehingga selama revisi belum disahkan via activate_asset,
--     kapasitas yang dirujuk snapshot tetap terlindungi (Rp4,8jt) dan usulan baru tetap divalidasi.
--     Mendukung parameter p_exclude_comp_id untuk mengecualikan komponen yang sedang divalidasi.
create or replace function public.get_expense_effective_allocated_cost(
  p_expense_id uuid,
  p_exclude_comp_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(comp_reserved), 0)
  from (
    select
      c_id,
      greatest(coalesce(max(snap_cost), 0), coalesce(max(master_cost), 0)) as comp_reserved
    from (
      -- Komitmen resmi dari snapshot aktif terakhir per aset
      select
        (elem->>'id')::uuid as c_id,
        nullif(elem->>'expense_id', '')::uuid as exp_id,
        (elem->>'allocated_cost')::numeric as snap_cost,
        null::numeric as master_cost
      from (
        select distinct on (asset_id) *
        from public.asset_activation_snapshots
        order by asset_id, version desc
      ) s,
      lateral jsonb_array_elements(s.snapshot_params) elem
      union all
      -- Usulan / keadaan master komponen saat ini
      select
        c.id as c_id,
        c.expense_id as exp_id,
        null::numeric as snap_cost,
        c.allocated_cost as master_cost
      from public.asset_components c
    ) u
    where exp_id = p_expense_id
      and (p_exclude_comp_id is null or c_id <> p_exclude_comp_id)
    group by c_id
  ) r;
$$;

-- 2. Perbarui Trigger validate_asset_relations:
--    Pertahankan seluruh guard Fase 4 + kunci perubahan location_id/room_id pada aset berriwayat
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

  -- Perketat transisi status aset yang sudah memiliki snapshot atau riwayat pembukuan
  if tg_op = 'UPDATE' and new.status_pencatatan <> old.status_pencatatan then
    if exists (select 1 from public.asset_activation_snapshots where asset_id = old.id) or
       exists (select 1 from public.asset_opening_balances where asset_id = old.id and status = 'approved') or
       exists (select 1 from public.asset_depreciation_ledger where asset_id = old.id) then
      
      if new.status_pencatatan = 'perlu_pengesahan_ulang' then
        if coalesce(current_setting('simkos.in_rpc_revise_component', true), 'false') <> 'true' then
          raise exception 'SIMKOS_DIRECT_STATUS_CHANGE_FORBIDDEN: Perubahan status ke perlu_pengesahan_ulang hanya diizinkan melalui RPC revise_component_parameters';
        end if;
      elsif new.status_pencatatan = 'aktif' then
        if coalesce(current_setting('simkos.in_rpc_activate_asset', true), 'false') <> 'true' then
          raise exception 'SIMKOS_DIRECT_ACTIVATION_FORBIDDEN: Perubahan status aset menjadi aktif dilarang melalui direct update; wajib melalui RPC activate_asset';
        end if;
      elsif new.status_pencatatan = 'draft' then
        raise exception 'SIMKOS_CANNOT_REVERT_ACTIVE_ASSET: Aset yang memiliki riwayat pembukuan/snapshot tidak dapat dikembalikan menjadi status draft';
      else
        raise exception 'SIMKOS_LOCKED_STATUS_TRANSITION: Aset yang memiliki riwayat pembukuan/snapshot tidak dapat dipindahkan langsung ke status %; hanya transisi resmi via RPC yang diizinkan', new.status_pencatatan;
      end if;
    else
      if new.status_pencatatan = 'aktif' then
        if coalesce(current_setting('simkos.in_rpc_activate_asset', true), 'false') <> 'true' then
          raise exception 'SIMKOS_DIRECT_ACTIVATION_FORBIDDEN: Perubahan status aset menjadi aktif dilarang melalui direct update; wajib melalui RPC activate_asset';
        end if;
      elsif new.status_pencatatan = 'perlu_pengesahan_ulang' then
        if coalesce(current_setting('simkos.in_rpc_revise_component', true), 'false') <> 'true' then
          raise exception 'SIMKOS_DIRECT_STATUS_CHANGE_FORBIDDEN: Perubahan status ke perlu_pengesahan_ulang hanya diizinkan melalui RPC revise_component_parameters';
        end if;
      end if;
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

  -- Tolak perubahan lokasi atau kamar aset setelah memiliki snapshot, saldo awal, atau ledger
  if tg_op = 'UPDATE' and (old.location_id is distinct from new.location_id or old.room_id is distinct from new.room_id) then
    if exists (select 1 from public.asset_activation_snapshots where asset_id = old.id) or
       exists (select 1 from public.asset_opening_balances where asset_id = old.id and status = 'approved') or
       exists (select 1 from public.asset_depreciation_ledger where asset_id = old.id) then
      raise exception 'SIMKOS_LOCKED_ASSET_LOCATION: Lokasi atau kamar aset yang telah memiliki snapshot atau riwayat pembukuan tidak dapat diubah langsung';
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

-- 3. Perbarui Trigger validate_component_relations:
--    Kunci perubahan langsung parameter finansial & alokasi (expense_id, allocated_cost, status_kapitalisasi)
--    ketika komponen/aset telah memiliki snapshot, saldo awal, atau riwayat pembukuan.
--    Validasi batas alokasi pengeluaran secara konsisten terhadap komitmen snapshot aktif + master.
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
  v_other_allocated numeric;
  v_snap_exp_id uuid;
  v_dummy record;
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

  -- Perlindungan integritas: jika komponen telah masuk snapshot aktivasi, disahkan saldo awalnya, atau dibukukan,
  -- parameter finansial & alokasi tidak boleh diubah langsung di luar RPC revise_component_parameters
  if tg_op = 'UPDATE' then
    if (new.biaya_perolehan is distinct from old.biaya_perolehan
        or new.nilai_sisa is distinct from old.nilai_sisa
        or new.masa_manfaat_bulan is distinct from old.masa_manfaat_bulan
        or new.tanggal_siap_guna is distinct from old.tanggal_siap_guna
        or new.porsi_usaha_persen is distinct from old.porsi_usaha_persen
        or new.status_kapitalisasi is distinct from old.status_kapitalisasi
        or new.metode_penyusutan is distinct from old.metode_penyusutan
        or new.expense_id is distinct from old.expense_id
        or new.allocated_cost is distinct from old.allocated_cost) then
      if exists (
           select 1
           from public.asset_activation_snapshots s,
           lateral jsonb_array_elements(s.snapshot_params) elem
           where s.asset_id = old.asset_id
             and (elem->>'id')::uuid = old.id
         ) or
         exists (select 1 from public.asset_opening_balances where component_id = old.id and status = 'approved') or
         exists (select 1 from public.asset_depreciation_ledger where component_id = old.id) then
        if coalesce(current_setting('simkos.in_rpc_revise_component', true), 'false') <> 'true' then
          raise exception 'SIMKOS_LOCKED_FINANCIAL_PARAMETERS: Parameter finansial dan alokasi komponen yang telah disahkan atau dibukukan tidak dapat diubah langsung. Gunakan RPC revise_component_parameters setelah membatalkan posting aktif.';
        end if;
      end if;
    end if;
  end if;

  -- Perlindungan penanda pengesahan ulang (requires_reapproval) dari direct INSERT / UPDATE
  if tg_op = 'INSERT' and new.requires_reapproval = true then
    raise exception 'SIMKOS_DIRECT_REAPPROVAL_FLAG_UPDATE_FORBIDDEN: Komponen baru tidak dapat langsung dibuat dengan requires_reapproval = true';
  end if;

  if tg_op = 'UPDATE' and new.requires_reapproval is distinct from old.requires_reapproval then
    if coalesce(current_setting('simkos.in_rpc_revise_component', true), 'false') <> 'true'
       and coalesce(current_setting('simkos.in_rpc_activate_asset', true), 'false') <> 'true' then
      raise exception 'SIMKOS_DIRECT_REAPPROVAL_FLAG_UPDATE_FORBIDDEN: Penanda pengesahan ulang (requires_reapproval) tidak dapat diubah langsung; hanya RPC revise_component_parameters dan activate_asset yang diizinkan';
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

  -- Deteksi apakah komponen ini memiliki pengeluaran yang terikat pada snapshot aktif terakhir
  if tg_op = 'UPDATE' and old.id is not null then
    select nullif(elem->>'expense_id', '')::uuid into v_snap_exp_id
    from (
      select snapshot_params
      from public.asset_activation_snapshots
      where asset_id = old.asset_id
      order by version desc
      limit 1
    ) s,
    lateral jsonb_array_elements(s.snapshot_params) elem
    where (elem->>'id')::uuid = old.id;
  end if;

  -- Kunci seluruh pengeluaran yang terlibat (termasuk snapshot lama dan pengeluaran baru)
  -- dalam urutan id terurut untuk mencegah deadlock konkurensi
  if new.expense_id is not null or v_snap_exp_id is not null then
    for v_dummy in
      select id from public.expenses
      where id in (select distinct exp_id from unnest(array[new.expense_id, v_snap_exp_id]) as exp_id where exp_id is not null)
      order by id
      for update
    loop
      null;
    end loop;
  end if;

  -- Validasi relasi pengeluaran & penguncian baris untuk konkurensi aman
  if new.expense_id is not null then
    select org_id, nominal into v_exp_org, v_exp_nominal
    from public.expenses
    where id = new.expense_id;

    if v_exp_org is null or v_exp_org <> new.org_id then
      raise exception 'SIMKOS_CROSS_TENANT_EXPENSE: Transaksi pengeluaran (%) bukan milik organisasi (%)', new.expense_id, new.org_id;
    end if;

    if new.allocated_cost is not null then
      if new.biaya_perolehan is not null and new.allocated_cost > new.biaya_perolehan then
        raise exception 'SIMKOS_ALLOCATION_EXCEEDS_ASSET_COST: Alokasi biaya (%) melebihi biaya perolehan komponen (%)',
          new.allocated_cost, new.biaya_perolehan;
      end if;

      -- Hitung alokasi efektif komponen LAIN pada pengeluaran ini (termasuk snapshot aktif + master mereka)
      v_other_allocated := public.get_expense_effective_allocated_cost(new.expense_id, new.id);

      if (v_other_allocated + new.allocated_cost) > coalesce(v_exp_nominal, 0) then
        raise exception 'SIMKOS_OVERALLOCATED_EXPENSE: Total alokasi aset (%) melebihi nominal transaksi sumber (%)',
          (v_other_allocated + new.allocated_cost), v_exp_nominal;
      end if;
    end if;
  else
    if new.allocated_cost is not null then
      raise exception 'SIMKOS_ALLOCATED_COST_WITHOUT_EXPENSE: Alokasi biaya membutuhkan tautan expense_id';
    end if;
  end if;

  return new;
end;
$$;

-- 4. Perbarui Trigger validate_expense_asset_allocations pada tabel expenses:
--    Selain mencegah hapus dan penurunan nominal di bawah alokasi efektif (snapshot + master),
--    cegah perubahan lokasi atau tanggal pengeluaran yang sudah diikat oleh snapshot aset.
create or replace function public.validate_expense_asset_allocations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_allocated numeric;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.asset_components where expense_id = old.id) or
       exists (
         select 1
         from public.asset_activation_snapshots s,
         lateral jsonb_array_elements(s.snapshot_params) elem
         where s.org_id = old.org_id
           and nullif(elem->>'expense_id', '')::uuid = old.id
       ) then
      raise exception 'SIMKOS_EXPENSE_HAS_ALLOCATED_ASSET: Pengeluaran ini telah dialokasikan ke komponen/snapshot aset dan tidak dapat dihapus sebelum relasi dilepas';
    end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if new.nominal <> old.nominal then
      -- Gunakan alokasi efektif yang melindungi komitmen snapshot resmi yang sedang berlaku
      -- maupun usulan revisi master komponen
      v_total_allocated := public.get_expense_effective_allocated_cost(new.id);

      if new.nominal < v_total_allocated then
        raise exception 'SIMKOS_EXPENSE_BELOW_ALLOCATIONS: Nominal pengeluaran baru (%) tidak boleh lebih rendah dari total alokasi aset terkait (%)',
          new.nominal, v_total_allocated;
      end if;
    end if;

    if (new.location_id is distinct from old.location_id or new.tanggal_pengeluaran is distinct from old.tanggal_pengeluaran) then
      if exists (
        select 1
        from public.asset_components c
        join public.asset_activation_snapshots s on s.asset_id = c.asset_id
        where c.expense_id = old.id
      ) or exists (
        select 1
        from public.asset_activation_snapshots s,
        lateral jsonb_array_elements(s.snapshot_params) elem
        where s.org_id = old.org_id
          and nullif(elem->>'expense_id', '')::uuid = old.id
      ) then
        raise exception 'SIMKOS_EXPENSE_LOCKED_BY_ACTIVE_ASSET: Lokasi atau tanggal pengeluaran yang telah teralokasi pada snapshot aset tidak dapat diubah langsung';
      end if;
    end if;
    return new;
  end if;
  return new;
end;
$$;

-- 5. Perbarui RPC activate_asset:
--    Simpan location_id (location_recorded = true) pada asset_activation_snapshots
--    serta bekukan location_id, expense_id, allocated_cost, dan status_kapitalisasi
--    di dalam setiap elemen snapshot_params.
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
  v_dummy record;
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
    null;
  else
    raise exception 'SIMKOS_INVALID_STATUS: Hanya aset berstatus draft, aktif, atau perlu_pengesahan_ulang yang dapat diaktivasi';
  end if;

  -- 3. Validasi minimal 1 komponen
  if not exists (select 1 from public.asset_components where asset_id = p_asset_id) then
    raise exception 'SIMKOS_NO_COMPONENTS: Aset wajib memiliki minimal satu komponen sebelum diaktivasi';
  end if;

  -- 3b. Validasi tidak ada tautan pengeluaran dengan allocated_cost bernilai NULL
  select count(*) into v_invalid_count
  from public.asset_components
  where asset_id = p_asset_id
    and expense_id is not null
    and allocated_cost is null;

  if v_invalid_count > 0 then
    raise exception 'SIMKOS_INCOMPLETE_ALLOCATION: Terdapat % komponen dengan tautan pengeluaran (expense_id) yang belum memiliki nilai allocated_cost', v_invalid_count;
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

    select * into v_prev_snap
    from public.asset_activation_snapshots
    where asset_id = p_asset_id
    order by version desc limit 1;

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

  -- 6. Validasi konsistensi kapasitas pengeluaran dan kunci baris pengeluaran terkait
  --    Kunci seluruh expenses yang terlibat dalam urutan id terurut untuk menghindari deadlock
  for v_dummy in
    select id, nominal from public.expenses
    where id in (
      select distinct c.expense_id
      from public.asset_components c
      where c.asset_id = p_asset_id
        and c.expense_id is not null
    )
    order by id
    for update
  loop
    null;
  end loop;

  -- 7. Tentukan versi snapshot berikutnya
  select coalesce(max(version), 0) + 1 into v_next_version
  from public.asset_activation_snapshots
  where asset_id = p_asset_id;

  -- 7. Kumpulkan parameter kanonis seluruh komponen ke dalam snapshot_params
  --    (Termasuk location_id, expense_id, allocated_cost, dan status_kapitalisasi)
  select jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'component_id', c.id,
      'asset_id', c.asset_id,
      'org_id', c.org_id,
      'location_id', v_asset.location_id,
      'nama_komponen', c.nama_komponen,
      'biaya_perolehan', c.biaya_perolehan,
      'nilai_sisa', c.nilai_sisa,
      'masa_manfaat_bulan', c.masa_manfaat_bulan,
      'tanggal_siap_guna', c.tanggal_siap_guna,
      'porsi_usaha_persen', c.porsi_usaha_persen,
      'status_kapitalisasi', c.status_kapitalisasi,
      'metode_penyusutan', c.metode_penyusutan,
      'expense_id', c.expense_id,
      'allocated_cost', c.allocated_cost
    ) order by c.created_at asc
  ) into v_components
  from public.asset_components c
  where c.asset_id = p_asset_id;

  insert into public.asset_activation_snapshots (
    asset_id, org_id, location_id, location_recorded, kategori_aset, version, algorithm_version, snapshot_params, activated_by, activation_notes
  ) values (
    p_asset_id, v_asset.org_id, v_asset.location_id, true, v_asset.kategori_aset, v_next_version, 'v3.1-bresenham', v_components, auth.uid(), p_activation_notes
  ) returning * into v_snapshot;

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

-- 6. Perbarui RPC revise_component_parameters:
--    Hapus tanda tangan 9-argumen lama agar tidak menimbulkan overload ambigu di PostgREST,
--    lalu definisikan dengan parameter opsional p_expense_id, p_allocated_cost, dan p_update_expense_allocation.
drop function if exists public.revise_component_parameters(uuid, numeric, numeric, int, date, numeric, text, text, text);

create or replace function public.revise_component_parameters(
  p_component_id uuid,
  p_biaya_perolehan numeric,
  p_nilai_sisa numeric default 0,
  p_masa_manfaat_bulan int default null,
  p_tanggal_siap_guna date default null,
  p_porsi_usaha_persen numeric default null,
  p_metode_penyusutan text default 'garis_lurus',
  p_status_kapitalisasi text default 'kapitalisasi',
  p_revision_notes text default null,
  p_expense_id uuid default null,
  p_allocated_cost numeric default null,
  p_update_expense_allocation boolean default false
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
  v_new_expense_id uuid;
  v_new_allocated_cost numeric;
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
  select * into v_comp from public.asset_components where id = p_component_id;
  select * into v_asset from public.assets where id = v_comp.asset_id;

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

  -- Tentukan nilai expense_id dan allocated_cost yang akan disimpan
  if p_update_expense_allocation then
    v_new_expense_id := p_expense_id;
    v_new_allocated_cost := p_allocated_cost;
  elsif p_expense_id is not null then
    v_new_expense_id := p_expense_id;
    v_new_allocated_cost := coalesce(p_allocated_cost, v_comp.allocated_cost);
  elsif p_allocated_cost is not null then
    v_new_expense_id := v_comp.expense_id;
    v_new_allocated_cost := p_allocated_cost;
  else
    v_new_expense_id := v_comp.expense_id;
    v_new_allocated_cost := v_comp.allocated_cost;
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
    expense_id = v_new_expense_id,
    allocated_cost = v_new_allocated_cost,
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

-- 7. RPC Utama Laporan Keuangan Internal: get_period_financial_report
--    Menghitung Laporan Arus Kas & Laporan Hasil Usaha Internal untuk bulan penuh (YYYY-MM).
create or replace function public.get_period_financial_report(
  p_org_id uuid,
  p_period_key text,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_loc_org uuid;
  v_loc_name text := 'Semua Lokasi (Konsolidasi Organisasi)';
  v_settings public.asset_bookkeeping_settings%rowtype;
  v_has_settings boolean := false;
  v_posted_batch public.asset_depreciation_batches%rowtype;
  v_has_posted_batch boolean := false;
  v_period_lock_status text := 'open';

  -- Cash flow & Gross expenses
  v_cash_inflow numeric := 0;
  v_gross_cash_expenses numeric := 0;

  -- Reference allocations from latest approved snapshots
  v_approved_capitalized_deduction numeric := 0;
  v_approved_direct_expense_allocation numeric := 0;

  -- Pending classification issues & separated reapproval proposals
  v_pending_classification_issue_count int := 0;
  v_null_allocated_cost_issue_count int := 0;
  v_legacy_allocation_issue_count int := 0;
  v_unapproved_new_count int := 0;
  v_unapproved_new_amount numeric := 0;
  v_reapproval_count int := 0;
  v_reapproval_reference_amount numeric := 0;
  v_reapproval_proposed_amount numeric := 0;
  v_reapproval_proposed_delta numeric := 0;

  -- Depreciation completeness & legacy snapshot checks
  v_reapproval_asset_count int := 0;
  v_legacy_location_issue_count int := 0;
  v_pending_depreciation_issue_count int := 0;
  v_depreciation_complete boolean := false;
  v_classification_complete boolean := false;
  v_is_complete boolean := false;
  v_status_code text;
  v_status_label text;
  v_reasons jsonb := '[]'::jsonb;

  -- Reference vs Final Operating Expense & Surplus
  v_operating_cash_expense_reference numeric := 0;
  v_operating_cash_expense numeric := null;
  v_surplus_before_depr_reference numeric := 0;
  v_surplus_before_depr numeric := null;

  -- Depreciation figures (NULL when batch missing / incomplete; 0 when batch 0 or location has 0 ledger rows)
  v_depr_total numeric := null;
  v_depr_business numeric := null;
  v_depr_non_business numeric := null;
  v_depr_component_count int := null;

  -- Net Operating Income
  v_net_operating_income numeric := null;

  -- Shared Costs (expenses.location_id IS NULL & snapshot s.location_id IS NULL with s.location_recorded = true)
  v_shared_cash_outflow_total numeric := 0;
  v_shared_capitalized_deduction numeric := 0;
  v_shared_operating_cash_expense numeric := 0;
  v_shared_depr_total numeric := null;
  v_shared_depr_business numeric := null;
  v_shared_depr_non_business numeric := null;
  v_shared_depr_component_count int := null;

  -- Revision history array
  v_revision_history jsonb := '[]'::jsonb;
begin
  -- 1. Validasi parameter & otorisasi anggota organisasi
  if p_org_id is null then
    raise exception 'SIMKOS_INVALID_PARAM: org_id wajib diisi';
  end if;

  if p_period_key is null or p_period_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'SIMKOS_FULL_MONTH_REQUIRED: Laporan Hasil Usaha Internal hanya tersedia untuk periode bulan kalender penuh (YYYY-MM)';
  end if;

  if not public.is_org_member(p_org_id) then
    raise exception 'SIMKOS_FORBIDDEN: Akses ditolak. Anda bukan anggota organisasi ini';
  end if;

  if p_location_id is not null then
    select org_id, nama_lokasi into v_loc_org, v_loc_name from public.locations where id = p_location_id;
    if v_loc_org is null or v_loc_org <> p_org_id then
      raise exception 'SIMKOS_CROSS_TENANT_LOCATION: Lokasi (%) bukan milik organisasi (%)', p_location_id, p_org_id;
    end if;
  end if;

  -- 2. Ambil pengaturan pembukuan & status kunci periode penyusutan
  select * into v_settings from public.asset_bookkeeping_settings where org_id = p_org_id;
  v_has_settings := found;

  select status into v_period_lock_status
  from public.asset_accounting_periods
  where org_id = p_org_id and period_key = p_period_key;
  if not found then
    v_period_lock_status := 'open';
  end if;

  -- 3. Agregasi Penerimaan Kas Usaha (incomes.tanggal_bayar)
  select coalesce(sum(i.nominal), 0)
  into v_cash_inflow
  from public.incomes i
  join public.rentals r on r.id = i.rental_id
  join public.rooms rm on rm.id = r.room_id
  where i.org_id = p_org_id
    and to_char(i.tanggal_bayar, 'YYYY-MM') = p_period_key
    and (p_location_id is null or rm.location_id = p_location_id);

  -- 4. Agregasi Pengeluaran Kas Bruto (expenses.tanggal_pengeluaran)
  select coalesce(sum(e.nominal), 0)
  into v_gross_cash_expenses
  from public.expenses e
  where e.org_id = p_org_id
    and to_char(e.tanggal_pengeluaran, 'YYYY-MM') = p_period_key
    and (p_location_id is null or e.location_id = p_location_id);

  -- 5. Evaluasi Alokasi Referensi (Snapshot Terakhir Disahkan) & Masalah Klasifikasi Tertunda
  --    Catatan:
  --    - Alokasi referensi tetap dipertahankan selama perlu_pengesahan_ulang sampai snapshot baru terbit.
  --    - Snapshot lama yang belum memiliki kunci 'expense_id' atau 'allocated_cost' TIDAK dianggap 0,
  --      melainkan ditandai sebagai masalah tertunda (legacy_allocation_issue_count > 0).
  --    - Jika expense_id dipindahkan, baik periode transaksi lama (e_ref) maupun baru (e_cur) dievaluasi.
  with latest_snapshots as (
    select distinct on (s.asset_id)
      s.id as snapshot_id,
      s.asset_id,
      s.org_id,
      s.location_id as snapshot_location_id,
      s.location_recorded,
      s.version as snapshot_version,
      s.snapshot_params
    from public.asset_activation_snapshots s
    where s.org_id = p_org_id
    order by s.asset_id, s.version desc
  ),
  snapshot_components as (
    select
      ls.snapshot_id,
      ls.asset_id,
      ls.snapshot_version,
      ls.snapshot_location_id,
      ls.location_recorded,
      ((elem ? 'expense_id') and (elem ? 'allocated_cost')) as has_allocation_metadata,
      (elem->>'id')::uuid as component_id,
      nullif(elem->>'expense_id', '')::uuid as ref_expense_id,
      (elem->>'allocated_cost')::numeric as ref_allocated_cost,
      elem->>'status_kapitalisasi' as ref_status_kapitalisasi
    from latest_snapshots ls
    cross join lateral jsonb_array_elements(ls.snapshot_params) as elem
  ),
  reference_allocations as (
    select
      coalesce(sum(sc.ref_allocated_cost) filter (
        where sc.has_allocation_metadata and sc.ref_status_kapitalisasi = 'kapitalisasi'
      ), 0) as approved_cap,
      coalesce(sum(sc.ref_allocated_cost) filter (
        where sc.has_allocation_metadata and sc.ref_status_kapitalisasi = 'beban_langsung'
      ), 0) as approved_dir
    from snapshot_components sc
    join public.expenses e_ref on e_ref.id = sc.ref_expense_id
    where e_ref.org_id = p_org_id
      and to_char(e_ref.tanggal_pengeluaran, 'YYYY-MM') = p_period_key
      and (p_location_id is null or e_ref.location_id = p_location_id)
      and sc.ref_allocated_cost is not null
  ),
  pending_evaluation as (
    select
      count(*) filter (where issue.is_pending_issue)::int as issue_count,
      count(*) filter (
        where issue.is_pending_issue
          and scope.cur_expense_in_period
          and c.allocated_cost is null
      )::int as null_cost_count,
      count(*) filter (
        where issue.is_pending_issue
          and sc.component_id is not null
          and not sc.has_allocation_metadata
      )::int as legacy_alloc_count,
      count(*) filter (
        where issue.is_pending_issue
          and sc.component_id is null
          and scope.cur_expense_in_period
      )::int as new_count,
      coalesce(sum(c.allocated_cost) filter (
        where issue.is_pending_issue
          and sc.component_id is null
          and scope.cur_expense_in_period
      ), 0) as new_amount,
      count(*) filter (
        where issue.is_pending_issue
          and sc.component_id is not null
      )::int as reapp_count,
      coalesce(sum(case when scope.ref_expense_in_period and sc.has_allocation_metadata then coalesce(sc.ref_allocated_cost, 0) else 0 end) filter (
        where issue.is_pending_issue
          and sc.component_id is not null
      ), 0) as reapp_ref_amount,
      coalesce(sum(case when scope.cur_expense_in_period then coalesce(c.allocated_cost, 0) else 0 end) filter (
        where issue.is_pending_issue
          and sc.component_id is not null
      ), 0) as reapp_prop_amount,
      coalesce(sum(
        (case when scope.cur_expense_in_period and c.status_kapitalisasi = 'kapitalisasi' then coalesce(c.allocated_cost, 0) else 0 end)
        -
        (case when scope.ref_expense_in_period and sc.has_allocation_metadata and sc.ref_status_kapitalisasi = 'kapitalisasi' then coalesce(sc.ref_allocated_cost, 0) else 0 end)
      ) filter (
        where issue.is_pending_issue
          and sc.component_id is not null
      ), 0) as reapp_prop_delta
    from public.asset_components c
    join public.assets a on a.id = c.asset_id
    left join snapshot_components sc on sc.component_id = c.id
    left join public.expenses e_cur on e_cur.id = c.expense_id
    left join public.expenses e_ref on e_ref.id = sc.ref_expense_id
    cross join lateral (
      select
        (e_cur.id is not null
         and to_char(e_cur.tanggal_pengeluaran, 'YYYY-MM') = p_period_key
         and (p_location_id is null or e_cur.location_id = p_location_id)) as cur_expense_in_period,
        (e_ref.id is not null
         and to_char(e_ref.tanggal_pengeluaran, 'YYYY-MM') = p_period_key
         and (p_location_id is null or e_ref.location_id = p_location_id)) as ref_expense_in_period
    ) scope
    cross join lateral (
      select (
        a.status_pencatatan = 'draft'
        or c.requires_reapproval = true
        or c.status_kapitalisasi = 'perlu_telaah'
        or (c.expense_id is not null and c.allocated_cost is null)
        or sc.component_id is null
        or not sc.has_allocation_metadata
        or c.expense_id is distinct from sc.ref_expense_id
        or c.allocated_cost is distinct from sc.ref_allocated_cost
        or c.status_kapitalisasi is distinct from sc.ref_status_kapitalisasi
        or (
          a.status_pencatatan = 'perlu_pengesahan_ulang'
          and not exists (
            select 1 from public.asset_components c_req
            where c_req.asset_id = a.id and c_req.requires_reapproval = true
          )
        )
      ) as is_pending_issue
    ) issue
    where c.org_id = p_org_id
      and (scope.cur_expense_in_period or scope.ref_expense_in_period)
  )
  select
    ra.approved_cap,
    ra.approved_dir,
    pe.issue_count,
    pe.null_cost_count,
    pe.legacy_alloc_count,
    pe.new_count,
    pe.new_amount,
    pe.reapp_count,
    pe.reapp_ref_amount,
    pe.reapp_prop_amount,
    pe.reapp_prop_delta
  into
    v_approved_capitalized_deduction,
    v_approved_direct_expense_allocation,
    v_pending_classification_issue_count,
    v_null_allocated_cost_issue_count,
    v_legacy_allocation_issue_count,
    v_unapproved_new_count,
    v_unapproved_new_amount,
    v_reapproval_count,
    v_reapproval_reference_amount,
    v_reapproval_proposed_amount,
    v_reapproval_proposed_delta
  from reference_allocations ra, pending_evaluation pe;

  v_classification_complete := (v_pending_classification_issue_count = 0);

  -- 6. Hitung Nilai Referensi vs Nilai Final Pengeluaran Kas Operasional & Surplus Sebelum Penyusutan
  v_operating_cash_expense_reference := v_gross_cash_expenses - v_approved_capitalized_deduction;
  v_surplus_before_depr_reference := v_cash_inflow - v_operating_cash_expense_reference;

  if v_classification_complete then
    v_operating_cash_expense := v_operating_cash_expense_reference;
    v_surplus_before_depr := v_surplus_before_depr_reference;
  else
    v_operating_cash_expense := null;
    v_surplus_before_depr := null;
  end if;

  -- 7. LANGKAH 1 PENYUSUTAN: Cek Keberadaan Batch Posted Tingkat Organisasi & Masalah Penyusutan
  select * into v_posted_batch
  from public.asset_depreciation_batches b
  where b.org_id = p_org_id
    and b.period_key = p_period_key
    and b.batch_status = 'posted';
  v_has_posted_batch := found;

  -- Cek apakah ada aset di organisasi yang sedang perlu_pengesahan_ulang
  select count(*)::int into v_reapproval_asset_count
  from public.assets a
  where a.org_id = p_org_id
    and (
      a.status_pencatatan = 'perlu_pengesahan_ulang'
      or exists (
        select 1 from public.asset_components c
        where c.asset_id = a.id and c.requires_reapproval = true
      )
    );

  -- Cek apakah ada snapshot lama (location_recorded = false) pada ledger batch aktif atau snapshot terakhir aset aktif
  if v_has_posted_batch then
    select count(*)::int into v_legacy_location_issue_count
    from public.asset_depreciation_ledger l
    join public.asset_activation_snapshots s on s.id = l.snapshot_id
    where l.batch_id = v_posted_batch.id
      and l.entry_type in ('regular', 'replacement')
      and (s.location_recorded = false or not (coalesce(s.snapshot_params->0, '{}'::jsonb) ? 'location_id'));
  else
    select count(*)::int into v_legacy_location_issue_count
    from (
      select distinct on (s.asset_id) s.id, s.location_recorded, s.snapshot_params
      from public.asset_activation_snapshots s
      join public.assets a on a.id = s.asset_id
      where s.org_id = p_org_id and a.status_pencatatan = 'aktif'
      order by s.asset_id, s.version desc
    ) ls
    where ls.location_recorded = false or not (coalesce(ls.snapshot_params->0, '{}'::jsonb) ? 'location_id');
  end if;

  v_pending_depreciation_issue_count :=
    (case when v_has_posted_batch then 0 else 1 end)
    + v_reapproval_asset_count
    + v_legacy_location_issue_count;

  v_depreciation_complete := (
    v_has_posted_batch
    and v_reapproval_asset_count = 0
    and v_legacy_location_issue_count = 0
  );

  -- 8. LANGKAH 2 PENYUSUTAN: Hanya jalankan agregasi COALESCE(..., 0) jika v_depreciation_complete = true!
  --    Jika ketiadaan batch atau ada masalah reapproval/legacy snapshot, biarkan tetap NULL.
  if v_depreciation_complete then
    select
      coalesce(sum(l.depreciation_amount), 0),
      coalesce(sum(l.business_portion_amount), 0),
      coalesce(sum(l.non_business_portion_amount), 0),
      count(l.id)::int
    into
      v_depr_total,
      v_depr_business,
      v_depr_non_business,
      v_depr_component_count
    from public.asset_depreciation_ledger l
    join public.asset_activation_snapshots s on s.id = l.snapshot_id
    where l.batch_id = v_posted_batch.id
      and l.entry_type in ('regular', 'replacement')
      and s.location_recorded = true
      and (p_location_id is null or s.location_id = p_location_id);

    -- Agregasi khusus Penyusutan Aset Bersama (HANYA s.location_recorded = true AND s.location_id IS NULL)
    select
      coalesce(sum(l.depreciation_amount), 0),
      coalesce(sum(l.business_portion_amount), 0),
      coalesce(sum(l.non_business_portion_amount), 0),
      count(l.id)::int
    into
      v_shared_depr_total,
      v_shared_depr_business,
      v_shared_depr_non_business,
      v_shared_depr_component_count
    from public.asset_depreciation_ledger l
    join public.asset_activation_snapshots s on s.id = l.snapshot_id
    where l.batch_id = v_posted_batch.id
      and l.entry_type in ('regular', 'replacement')
      and s.location_recorded = true
      and s.location_id is null;
  end if;

  -- 9. Biaya Kas Bersama (expenses.location_id IS NULL)
  select coalesce(sum(e.nominal), 0)
  into v_shared_cash_outflow_total
  from public.expenses e
  where e.org_id = p_org_id
    and to_char(e.tanggal_pengeluaran, 'YYYY-MM') = p_period_key
    and e.location_id is null;

  with latest_snapshots as (
    select distinct on (s.asset_id)
      s.id as snapshot_id,
      s.snapshot_params
    from public.asset_activation_snapshots s
    where s.org_id = p_org_id
    order by s.asset_id, s.version desc
  ),
  snapshot_components as (
    select
      ((elem ? 'expense_id') and (elem ? 'allocated_cost')) as has_allocation_metadata,
      nullif(elem->>'expense_id', '')::uuid as ref_expense_id,
      (elem->>'allocated_cost')::numeric as ref_allocated_cost,
      elem->>'status_kapitalisasi' as ref_status_kapitalisasi
    from latest_snapshots ls
    cross join lateral jsonb_array_elements(ls.snapshot_params) as elem
  )
  select coalesce(sum(sc.ref_allocated_cost), 0)
  into v_shared_capitalized_deduction
  from snapshot_components sc
  join public.expenses e_ref on e_ref.id = sc.ref_expense_id
  where e_ref.org_id = p_org_id
    and to_char(e_ref.tanggal_pengeluaran, 'YYYY-MM') = p_period_key
    and e_ref.location_id is null
    and sc.has_allocation_metadata = true
    and sc.ref_status_kapitalisasi = 'kapitalisasi'
    and sc.ref_allocated_cost is not null;

  v_shared_operating_cash_expense := v_shared_cash_outflow_total - v_shared_capitalized_deduction;

  -- 10. Status Kelengkapan Gabungan & Hasil Usaha Internal Bersih
  v_is_complete := (v_depreciation_complete and v_classification_complete);

  if v_is_complete then
    v_net_operating_income := v_surplus_before_depr - v_depr_business;
    if v_period_lock_status = 'locked' then
      v_status_code := 'LENGKAP_TERKUNCI';
      v_status_label := 'Lengkap — Periode Penyusutan Terkunci';
    else
      v_status_code := 'LENGKAP_DIBUKUKAN';
      v_status_label := 'Lengkap — Sudah Dibukukan';
    end if;
  else
    v_net_operating_income := null;

    if not v_depreciation_complete and not v_classification_complete then
      v_status_code := 'BELUM_LENGKAP_KEDUANYA';
      v_status_label := 'Belum Lengkap — Klasifikasi Alokasi & Penyusutan Belum Disahkan';
    elsif not v_classification_complete then
      v_status_code := 'BELUM_LENGKAP_KLASIFIKASI';
      v_status_label := 'Belum Lengkap — Klasifikasi Alokasi Belanja Belum Disahkan';
    else
      v_status_code := 'BELUM_LENGKAP_PENYUSUTAN';
      v_status_label := 'Belum Lengkap — Penyusutan Belum Dibukukan';
    end if;

    if not v_has_settings then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'PENGATURAN_PEMBUKUAN_BELUM_DIATUR',
        'message', 'Tanggal mulai pembukuan penyusutan organisasi belum diatur.'
      );
    elsif p_period_key < to_char(v_settings.tanggal_mulai_pembukuan, 'YYYY-MM') then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'PERIODE_PRA_CUTOFF',
        'message', 'Periode berada sebelum tanggal mulai pembukuan organisasi (' || to_char(v_settings.tanggal_mulai_pembukuan, 'YYYY-MM') || ').'
      );
    elsif not v_has_posted_batch then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'PENYUSUTAN_BELUM_DIPOSTING',
        'message', 'Beban penyusutan periode ' || p_period_key || ' belum diposting pada Buku Pembantu Penyusutan.'
      );
    end if;

    if v_reapproval_asset_count > 0 then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'PERLU_PENGESAHAN_ULANG',
        'message', 'Terdapat ' || v_reapproval_asset_count::text || ' aset yang telah direvisi parameternya dan memerlukan pengesahan ulang (aktivasi ulang).'
      );
    end if;

    if v_legacy_location_issue_count > 0 or v_legacy_allocation_issue_count > 0 then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'SNAPSHOT_LAMA_BELUM_MEMUAT_METADATA',
        'message', 'Terdapat snapshot aktivasi versi lama yang belum memuat data lokasi/alokasi; lakukan pengesahan ulang (activate_asset) agar tidak dianggap nol atau aset bersama.'
      );
    end if;

    if v_null_allocated_cost_issue_count > 0 then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'ALOKASI_NOMINAL_NULL',
        'message', 'Terdapat ' || v_null_allocated_cost_issue_count::text || ' komponen tertaut pengeluaran yang nominal alokasinya (allocated_cost) masih kosong/NULL.'
      );
    end if;

    if v_unapproved_new_count > 0 then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'ALOKASI_DRAF_BELUM_DISAHKAN',
        'message', 'Terdapat ' || v_unapproved_new_count::text || ' alokasi komponen baru/draf yang belum disahkan ke snapshot aktivasi.'
      );
    end if;

    if v_reapproval_count > 0 then
      v_reasons := v_reasons || jsonb_build_object(
        'code', 'USULAN_REVISI_ALOKASI_MENUNGGU_PENGESAHAN',
        'message', 'Terdapat ' || v_reapproval_count::text || ' usulan revisi alokasi komponen yang menunggu pengesahan ulang (nilai referensi terakhir tetap dipertahankan).'
      );
    end if;
  end if;

  -- 11. Riwayat Revisi Alokasi Antar-Snapshot (Mengevaluasi Periode Transaksi Lama maupun Baru)
  select coalesce(jsonb_agg(rev_item order by rev_item->>'revised_at' asc, (rev_item->>'to_snapshot_version')::int asc), '[]'::jsonb)
  into v_revision_history
  from (
    select jsonb_build_object(
      'asset_id', a.id,
      'nama_aset', a.nama_aset,
      'component_id', (elem_curr->>'id')::uuid,
      'nama_komponen', elem_curr->>'nama_komponen',
      'from_snapshot_version', s_prev.version,
      'to_snapshot_version', s_curr.version,
      'previous_version', s_prev.version,
      'current_version', s_curr.version,
      'previous_expense_id', nullif(elem_prev->>'expense_id', '')::uuid,
      'previous_expense_period', case when e_prev.id is not null then to_char(e_prev.tanggal_pengeluaran, 'YYYY-MM') else null end,
      'current_expense_id', nullif(elem_curr->>'expense_id', '')::uuid,
      'current_expense_period', case when e_curr.id is not null then to_char(e_curr.tanggal_pengeluaran, 'YYYY-MM') else null end,
      'previous_status_kapitalisasi', elem_prev->>'status_kapitalisasi',
      'current_status_kapitalisasi', elem_curr->>'status_kapitalisasi',
      'previous_allocated_cost', (elem_prev->>'allocated_cost')::numeric,
      'current_allocated_cost', (elem_curr->>'allocated_cost')::numeric,
      'period_capitalized_deduction_before', cap_calc.cap_before,
      'period_capitalized_deduction_after', cap_calc.cap_after,
      'allocated_cost_delta', (coalesce((elem_curr->>'allocated_cost')::numeric, 0) - coalesce((elem_prev->>'allocated_cost')::numeric, 0)),
      'operating_expense_delta', (cap_calc.cap_before - cap_calc.cap_after),
      'revision_notes', s_curr.activation_notes,
      'revised_at', s_curr.created_at
    ) as rev_item
    from public.asset_activation_snapshots s_curr
    join public.asset_activation_snapshots s_prev
      on s_prev.asset_id = s_curr.asset_id
     and s_prev.version = s_curr.version - 1
    join public.assets a on a.id = s_curr.asset_id
    cross join lateral jsonb_array_elements(s_curr.snapshot_params) as elem_curr
    join lateral jsonb_array_elements(s_prev.snapshot_params) as elem_prev
      on (elem_prev->>'id')::uuid = (elem_curr->>'id')::uuid
    left join public.expenses e_prev on e_prev.id = nullif(elem_prev->>'expense_id', '')::uuid
    left join public.expenses e_curr on e_curr.id = nullif(elem_curr->>'expense_id', '')::uuid
    cross join lateral (
      select
        (e_prev.id is not null
         and to_char(e_prev.tanggal_pengeluaran, 'YYYY-MM') = p_period_key
         and (p_location_id is null or e_prev.location_id = p_location_id)) as prev_in_scope,
        (e_curr.id is not null
         and to_char(e_curr.tanggal_pengeluaran, 'YYYY-MM') = p_period_key
         and (p_location_id is null or e_curr.location_id = p_location_id)) as curr_in_scope
    ) scope
    cross join lateral (
      select
        case
          when scope.prev_in_scope and (elem_prev->>'status_kapitalisasi') = 'kapitalisasi'
          then coalesce((elem_prev->>'allocated_cost')::numeric, 0)
          else 0
        end as cap_before,
        case
          when scope.curr_in_scope and (elem_curr->>'status_kapitalisasi') = 'kapitalisasi'
          then coalesce((elem_curr->>'allocated_cost')::numeric, 0)
          else 0
        end as cap_after
    ) cap_calc
    where s_curr.org_id = p_org_id
      and (scope.prev_in_scope or scope.curr_in_scope)
      and (
        nullif(elem_prev->>'expense_id', '')::uuid is distinct from nullif(elem_curr->>'expense_id', '')::uuid
        or (elem_prev->>'allocated_cost')::numeric is distinct from (elem_curr->>'allocated_cost')::numeric
        or (elem_prev->>'status_kapitalisasi') is distinct from (elem_curr->>'status_kapitalisasi')
      )
  ) rev_sub;

  -- 12. Kembalikan Kontrak JSON Lengkap
  return jsonb_build_object(
    'org_id', p_org_id,
    'period_key', p_period_key,
    'is_full_month_period', true,
    'location_id', p_location_id,
    'location_name', v_loc_name,
    'report_basis_label', 'Laporan Internal — Berbasis Penerimaan/Pengeluaran Kas dengan Penyesuaian Kapitalisasi & Penyusutan (Bukan Akrual Penuh)',
    'scope_disclaimer_label', case
      when p_location_id is not null then 'Hasil per lokasi ini belum mencakup alokasi biaya bersama lintas lokasi (Tagihan Bersama & Penyusutan Aset Bersama).'
      else 'Seluruh biaya bersama lintas lokasi (Tagihan Bersama & Penyusutan Aset Bersama) telah termasuk di dalam total Semua Lokasi.'
    end,
    'completeness', jsonb_build_object(
      'is_complete', v_is_complete,
      'depreciation_complete', v_depreciation_complete,
      'classification_complete', v_classification_complete,
      'has_posted_batch', v_has_posted_batch,
      'pending_depreciation_issue_count', v_pending_depreciation_issue_count,
      'reapproval_asset_issue_count', v_reapproval_asset_count,
      'pending_classification_issue_count', v_pending_classification_issue_count,
      'null_allocated_cost_issue_count', v_null_allocated_cost_issue_count,
      'legacy_snapshot_issue_count', (v_legacy_location_issue_count + v_legacy_allocation_issue_count),
      'unapproved_new_allocation_count', v_unapproved_new_count,
      'pending_reapproval_count', v_reapproval_count,
      'status_code', v_status_code,
      'status_label', v_status_label,
      'reasons', v_reasons,
      'posted_batch_id', v_posted_batch.id,
      'posted_batch_number', v_posted_batch.batch_number,
      'period_status', v_period_lock_status,
      'period_lock_status', v_period_lock_status
    ),
    'cash_flow', jsonb_build_object(
      'basis', 'cash',
      'cash_in', v_cash_inflow,
      'cash_inflow', v_cash_inflow,
      'cash_out', v_gross_cash_expenses,
      'cash_outflow_total', v_gross_cash_expenses,
      'cash_outflow_operating_reference', v_operating_cash_expense_reference,
      'cash_outflow_capitalized_approved', v_approved_capitalized_deduction,
      'net_cash_flow', (v_cash_inflow - v_gross_cash_expenses)
    ),
    'operating_report', jsonb_build_object(
      'basis', 'internal_modified_cash_with_depreciation',
      'report_basis', 'cash_adjusted_internal',
      'operating_cash_income', v_cash_inflow,
      'operating_cash_revenue', v_cash_inflow,
      'gross_cash_expense', v_gross_cash_expenses,
      'gross_cash_expenses', v_gross_cash_expenses,
      'approved_capitalized_deduction', v_approved_capitalized_deduction,
      'approved_direct_expense_allocation', v_approved_direct_expense_allocation,
      'pending_allocations', jsonb_build_object(
        'issue_count', v_pending_classification_issue_count,
        'null_allocated_cost_count', v_null_allocated_cost_issue_count,
        'legacy_snapshot_issue_count', v_legacy_allocation_issue_count,
        'unapproved_new_count', v_unapproved_new_count,
        'unapproved_new_amount', v_unapproved_new_amount,
        'pending_draft_or_review_allocation', v_unapproved_new_amount,
        'reapproval_count', v_reapproval_count,
        'reapproval_reference_amount', v_reapproval_reference_amount,
        'reapproval_proposed_amount', v_reapproval_proposed_amount,
        'pending_capitalization_reapproval_allocation', v_reapproval_proposed_amount,
        'total_proposed_revision_allocation', (v_unapproved_new_amount + v_reapproval_proposed_amount),
        'reapproval_proposed_delta', v_reapproval_proposed_delta,
        'proposed_vs_approved_delta', v_reapproval_proposed_delta
      ),
      'reference_operating_cash_expense', v_operating_cash_expense_reference,
      'operating_cash_expense_reference', v_operating_cash_expense_reference,
      'operating_cash_expense', v_operating_cash_expense,
      'reference_operating_surplus_before_depreciation', v_surplus_before_depr_reference,
      'surplus_deficit_before_depreciation_reference', v_surplus_before_depr_reference,
      'operating_surplus_before_depreciation', v_surplus_before_depr,
      'surplus_deficit_before_depreciation', v_surplus_before_depr,
      'depreciation_total_posted', v_depr_total,
      'depreciation_total', v_depr_total,
      'depreciation_business_portion', v_depr_business,
      'depreciation_non_business_portion', v_depr_non_business,
      'depreciation_component_count', v_depr_component_count,
      'net_operating_income', v_net_operating_income
    ),
    'income_statement', jsonb_build_object(
      'report_basis', 'cash_adjusted_internal',
      'operating_cash_revenue', v_cash_inflow,
      'gross_cash_expenses', v_gross_cash_expenses,
      'approved_capitalized_deduction', v_approved_capitalized_deduction,
      'approved_direct_expense_allocation', v_approved_direct_expense_allocation,
      'pending_allocations', jsonb_build_object(
        'issue_count', v_pending_classification_issue_count,
        'null_allocated_cost_count', v_null_allocated_cost_issue_count,
        'legacy_snapshot_issue_count', v_legacy_allocation_issue_count,
        'unapproved_new_count', v_unapproved_new_count,
        'unapproved_new_amount', v_unapproved_new_amount,
        'reapproval_count', v_reapproval_count,
        'reapproval_reference_amount', v_reapproval_reference_amount,
        'reapproval_proposed_amount', v_reapproval_proposed_amount,
        'reapproval_proposed_delta', v_reapproval_proposed_delta
      ),
      'operating_cash_expense_reference', v_operating_cash_expense_reference,
      'operating_cash_expense', v_operating_cash_expense,
      'surplus_deficit_before_depreciation_reference', v_surplus_before_depr_reference,
      'surplus_deficit_before_depreciation', v_surplus_before_depr,
      'depreciation_business_portion', v_depr_business,
      'depreciation_non_business_portion', v_depr_non_business,
      'depreciation_total', v_depr_total,
      'depreciation_component_count', v_depr_component_count,
      'net_operating_income', v_net_operating_income
    ),
    'shared_costs', jsonb_build_object(
      'included_in_operating_report', (p_location_id is null),
      'included_in_report_totals', (p_location_id is null),
      'scope_disclaimer_label', case
        when p_location_id is not null then 'Hasil per lokasi ini belum mencakup alokasi biaya bersama lintas lokasi (Tagihan Bersama & Penyusutan Aset Bersama).'
        else 'Seluruh biaya bersama lintas lokasi (Tagihan Bersama & Penyusutan Aset Bersama) telah termasuk di dalam total Semua Lokasi.'
      end,
      'shared_cash_expense_total', v_shared_cash_outflow_total,
      'shared_cash_outflow_total', v_shared_cash_outflow_total,
      'shared_operating_cash_expense', v_shared_operating_cash_expense,
      'shared_capitalized_deduction', v_shared_capitalized_deduction,
      'shared_depreciation_total_posted', v_shared_depr_total,
      'shared_depreciation_total', v_shared_depr_total,
      'shared_depreciation_business_portion', v_shared_depr_business,
      'shared_depreciation_non_business_portion', v_shared_depr_non_business,
      'shared_depreciation_component_count', v_shared_depr_component_count
    ),
    'allocation_revision_history', v_revision_history,
    'reconciliation', jsonb_build_object(
      'is_reconciled', case
        when v_is_complete then ((v_cash_inflow - v_gross_cash_expenses) + v_approved_capitalized_deduction - v_depr_business = v_net_operating_income)
        else false
      end,
      'net_cash_flow', (v_cash_inflow - v_gross_cash_expenses),
      'add_back_approved_capitalized_purchases', v_approved_capitalized_deduction,
      'plus_approved_capitalized_purchases', v_approved_capitalized_deduction,
      'less_posted_business_depreciation', v_depr_business,
      'minus_posted_business_depreciation', v_depr_business,
      'net_operating_income', v_net_operating_income,
      'equals_net_operating_income', v_net_operating_income,
      'excluded_non_business_depreciation', v_depr_non_business
    )
  );
end;
$$;

grant execute on function public.activate_asset(uuid, text) to anon, authenticated;
grant execute on function public.revise_component_parameters(uuid, numeric, numeric, int, date, numeric, text, text, text, uuid, numeric, boolean) to anon, authenticated;
grant execute on function public.get_period_financial_report(uuid, text, uuid) to anon, authenticated;
