-- =====================================================================
-- Migration 800: Modul Aset & Inventaris (Fase 2 - Pencatatan & Draf)
-- Aditif dan non-destruktif terhadap tabel inventories eksisting.
-- =====================================================================

-- 1. Tambah kolom threshold kapitalisasi di tabel organizations
alter table public.organizations
  add column if not null capitalization_threshold numeric check (capitalization_threshold >= 0);

-- 2. Buat tabel public.assets
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  kode_aset text,
  nama_aset text not null check (length(btrim(nama_aset)) > 0),
  kategori_aset text not null check (kategori_aset in (
    'tanah', 'gedung', 'fasilitas_kamar', 'fasilitas_umum', 'kendaraan', 'elektronik_kantor', 'lainnya'
  )),
  dasar_penggunaan text not null default 'milik_sendiri' check (dasar_penggunaan in (
    'milik_sendiri', 'sewa', 'pinjam_pakai', 'dikelola_pihak_lain'
  )),
  nama_pemilik text,
  kondisi_fisik text not null default 'baik' check (kondisi_fisik in (
    'sangat_baik', 'baik', 'rusak_ringan', 'rusak_berat', 'hilang'
  )),
  status_penggunaan text not null default 'aktif' check (status_penggunaan in (
    'aktif', 'dalam_perbaikan', 'tidak_aktif', 'dilepas', 'dihapuskan'
  )),
  status_pencatatan text not null default 'draft' check (status_pencatatan in (
    'draft', 'terverifikasi', 'dibukukan', 'diarsipkan'
  )),
  catatan text,
  legacy_inventory_id uuid references public.inventories(id) on delete set null,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_assets_legacy_inventory unique (legacy_inventory_id)
);

create index if not exists idx_assets_org_kategori on public.assets(org_id, kategori_aset);
create index if not exists idx_assets_location on public.assets(location_id);
create index if not exists idx_assets_room on public.assets(room_id);

-- 3. Buat tabel public.asset_components
create table if not exists public.asset_components (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  org_id uuid not null default public.current_org_id() references public.organizations(id) on delete cascade,
  nama_komponen text not null check (length(btrim(nama_komponen)) > 0),
  jenis_pekerjaan text not null default 'perolehan_baru' check (jenis_pekerjaan in (
    'bangunan_awal', 'penambahan_kapasitas', 'penggantian_komponen', 'pemeliharaan_rutin', 'perolehan_baru', 'lainnya'
  )),
  tanggal_perolehan date,
  tanggal_siap_guna date,
  tahun_perolehan int check (tahun_perolehan between 1800 and 2100),
  biaya_perolehan numeric check (biaya_perolehan >= 0),
  nilai_sisa numeric default 0 check (nilai_sisa >= 0 and (biaya_perolehan is null or nilai_sisa <= biaya_perolehan)),
  masa_manfaat_bulan int check (masa_manfaat_bulan > 0),
  metode_penyusutan text not null default 'belum_ditentukan' check (metode_penyusutan in (
    'garis_lurus', 'tidak_disusutkan', 'belum_ditentukan'
  )),
  pola_penggunaan text not null default 'seluruhnya_usaha' check (pola_penggunaan in (
    'seluruhnya_usaha', 'campuran'
  )),
  luas_khusus_usaha numeric default 0 check (luas_khusus_usaha >= 0),
  luas_nonusaha numeric default 0 check (luas_nonusaha >= 0),
  luas_bersama numeric default 0 check (luas_bersama >= 0),
  porsi_usaha_persen numeric check (porsi_usaha_persen >= 0 and porsi_usaha_persen <= 100),
  expense_id uuid references public.expenses(id) on delete set null,
  allocated_cost numeric check (allocated_cost >= 0),
  bukti_dokumen_url text,
  status_kapitalisasi text not null default 'kapitalisasi' check (status_kapitalisasi in (
    'kapitalisasi', 'beban_langsung', 'perlu_telaah'
  )),
  catatan_telaah text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_asset_components_asset on public.asset_components(asset_id);
create index if not exists idx_asset_components_org on public.asset_components(org_id);
create index if not exists idx_asset_components_expense on public.asset_components(expense_id);

-- 4. Validasi Cross-Tenant & Integritas Relasi (Triggers)
create or replace function public.validate_asset_relations()
returns trigger
language plpgsql
as $$
declare
  v_loc_org uuid;
  v_room_org uuid;
begin
  if new.location_id is not null then
    select org_id into v_loc_org from public.locations where id = new.location_id;
    if v_loc_org is not null and v_loc_org <> new.org_id then
      raise exception 'SIMKOS_CROSS_TENANT_LOCATION: Lokasi (%) bukan milik organisasi (%)', new.location_id, new.org_id;
    end if;
  end if;

  if new.room_id is not null then
    select org_id into v_room_org from public.rooms where id = new.room_id;
    if v_room_org is not null and v_room_org <> new.org_id then
      raise exception 'SIMKOS_CROSS_TENANT_ROOM: Kamar (%) bukan milik organisasi (%)', new.room_id, new.org_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_asset_relations on public.assets;
create trigger trg_validate_asset_relations
before insert or update on public.assets
for each row execute function public.validate_asset_relations();

create or replace function public.validate_component_relations()
returns trigger
language plpgsql
as $$
declare
  v_asset_org uuid;
  v_exp_org uuid;
  v_exp_nominal numeric;
  v_total_allocated numeric;
begin
  select org_id into v_asset_org from public.assets where id = new.asset_id;
  if v_asset_org is not null and v_asset_org <> new.org_id then
    raise exception 'SIMKOS_CROSS_TENANT_ASSET: Aset induk (%) bukan milik organisasi (%)', new.asset_id, new.org_id;
  end if;

  if new.expense_id is not null then
    select org_id, nominal into v_exp_org, v_exp_nominal from public.expenses where id = new.expense_id;
    if v_exp_org is not null and v_exp_org <> new.org_id then
      raise exception 'SIMKOS_CROSS_TENANT_EXPENSE: Transaksi pengeluaran (%) bukan milik organisasi (%)', new.expense_id, new.org_id;
    end if;

    if new.allocated_cost is not null then
      select coalesce(sum(allocated_cost), 0) into v_total_allocated
      from public.asset_components
      where expense_id = new.expense_id and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

      if (v_total_allocated + new.allocated_cost) > coalesce(v_exp_nominal, 0) then
        raise exception 'SIMKOS_OVERALLOCATED_EXPENSE: Total alokasi aset (%) melebihi nominal transaksi sumber (%)',
          (v_total_allocated + new.allocated_cost), v_exp_nominal;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_component_relations on public.asset_components;
create trigger trg_validate_component_relations
before insert or update on public.asset_components
for each row execute function public.validate_component_relations();

-- 5. RLS Policies
alter table public.assets enable row level security;
alter table public.asset_components enable row level security;

drop policy if exists assets_org_access on public.assets;
create policy assets_org_access on public.assets
for all using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

drop policy if exists asset_components_org_access on public.asset_components;
create policy asset_components_org_access on public.asset_components
for all using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

-- 6. Trigger Path Storage Bukti Dokumen
drop trigger if exists asset_components_doc_path_org on public.asset_components;
create trigger asset_components_doc_path_org
before insert or update of bukti_dokumen_url on public.asset_components
for each row execute function public.enforce_org_storage_path('bukti_dokumen_url');

-- 7. Prosedur Backfill Idempoten dari Inventaris Lama
create or replace function public.backfill_inventories_to_assets()
returns table(inserted_assets int, inserted_components int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assets_count int := 0;
  v_components_count int := 0;
begin
  -- 1. Insert ke assets untuk inventories yang belum pernah dibackfill
  with new_assets as (
    insert into public.assets (
      org_id,
      location_id,
      room_id,
      nama_aset,
      kategori_aset,
      dasar_penggunaan,
      kondisi_fisik,
      status_penggunaan,
      status_pencatatan,
      catatan,
      legacy_inventory_id,
      created_at,
      updated_at
    )
    select
      i.org_id,
      i.location_id,
      i.room_id,
      i.nama_barang,
      case 
        when i.tipe_fasilitas = 'kamar' or i.room_id is not null then 'fasilitas_kamar'
        else 'fasilitas_umum'
      end as kategori_aset,
      'milik_sendiri' as dasar_penggunaan,
      case 
        when lower(coalesce(i.kondisi, '')) like '%rusak%' then 'rusak_ringan'
        else 'baik'
      end as kondisi_fisik,
      'aktif' as status_penggunaan,
      'draft' as status_pencatatan,
      i.catatan,
      i.id as legacy_inventory_id,
      i.created_at,
      now()
    from public.inventories i
    where not exists (
      select 1 from public.assets a where a.legacy_inventory_id = i.id
    )
    returning id, org_id, nama_aset, legacy_inventory_id
  ),
  new_comps as (
    -- 2. Insert ke asset_components
    insert into public.asset_components (
      asset_id,
      org_id,
      nama_komponen,
      jenis_pekerjaan,
      tanggal_perolehan,
      tanggal_siap_guna,
      biaya_perolehan,
      nilai_sisa,
      metode_penyusutan,
      pola_penggunaan,
      porsi_usaha_persen,
      bukti_dokumen_url,
      status_kapitalisasi
    )
    select
      na.id as asset_id,
      na.org_id,
      na.nama_aset as nama_komponen,
      'perolehan_baru' as jenis_pekerjaan,
      i.tanggal_pembelian as tanggal_perolehan,
      i.tanggal_pembelian as tanggal_siap_guna,
      i.harga as biaya_perolehan,
      0 as nilai_sisa,
      'belum_ditentukan' as metode_penyusutan,
      'seluruhnya_usaha' as pola_penggunaan,
      100 as porsi_usaha_persen,
      i.receipt_url as bukti_dokumen_url,
      case
        when i.harga is not null and i.harga > 0 then 'perlu_telaah'
        else 'beban_langsung'
      end as status_kapitalisasi
    from new_assets na
    join public.inventories i on i.id = na.legacy_inventory_id
    returning id
  )
  select count(*) into v_assets_count from new_assets;

  select count(*) into v_components_count
  from public.asset_components ac
  join public.assets a on a.id = ac.asset_id
  where a.legacy_inventory_id is not null;

  return query select v_assets_count, v_components_count;
end;
$$;
