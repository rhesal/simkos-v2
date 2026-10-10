-- =====================================================================
-- SimKos v2 — migration 400: kolom inventories yang dipakai kode tapi
-- belum ada di live.
--
-- src/views/InventarisView.vue membaca/menulis:
--   tanggal_pembelian  -> <input type="date">, string "YYYY-MM-DD"   => date
--   harga              -> v-model.number, Rupiah tanpa desimal        => numeric (sama dg expenses.nominal)
--   tipe_fasilitas     -> 'kamar' | 'umum' (tab & toggle di form)     => text + check
--   receipt_url        -> path nota "<org_id>/receipt_<uuid>.<ext>"   => text
--
-- Sifat: ADITIF saja. Semua kolom nullable, tanpa rename/drop, tanpa default.
-- Constraint ringan: harga >= 0, tipe_fasilitas ∈ {'kamar','umum'} (NULL boleh).
-- Trigger inventories_receipt_path_org (fungsi dari migration 300) memastikan
-- receipt_url berupa path di folder org baris itu.
-- RLS TIDAK diubah: policy inventories_org_access (migration 210) berlaku
-- `for all` per org, dan policy storage simkos_private_images_* (migration 300)
-- sudah mencakup bucket receipt_images per folder org.
--
-- Prasyarat: migration 200, 210, 300 sudah diterapkan.
-- Jalankan dalam SATU transaksi (SQL Editor / `psql -1 -f`).
-- Rollback: supabase/rollback/rollback_400_inventories_columns.sql
-- =====================================================================

-- 0. Pre-check ---------------------------------------------------------------
do $$
declare
  r record;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'inventories' and column_name = 'org_id') then
    raise exception 'inventories.org_id tidak ada. Terapkan migration 200 dulu.';
  end if;
  if to_regprocedure('public.enforce_org_storage_path()') is null then
    raise exception 'Fungsi public.enforce_org_storage_path() tidak ada. Terapkan migration 300 dulu.';
  end if;
  -- Kalau kolom sudah ada (mis. dibuat manual di dashboard), tipenya harus cocok.
  for r in
    select c.column_name, c.data_type, x.expected
    from information_schema.columns c
    join (values ('tanggal_pembelian','date'), ('harga','numeric'),
                 ('tipe_fasilitas','text'), ('receipt_url','text')) as x(col, expected)
      on x.col = c.column_name
    where c.table_schema = 'public' and c.table_name = 'inventories'
      and c.data_type <> x.expected
  loop
    raise exception 'inventories.% sudah ada dengan tipe % (diharapkan %). Periksa manual.',
      r.column_name, r.data_type, r.expected;
  end loop;
end $$;

-- 1. Kolom (aditif, nullable) ------------------------------------------------
alter table public.inventories
  add column if not exists tanggal_pembelian date,
  add column if not exists harga numeric,
  add column if not exists tipe_fasilitas text,
  add column if not exists receipt_url text;

comment on column public.inventories.tanggal_pembelian is 'Tanggal pembelian barang (opsional).';
comment on column public.inventories.harga is 'Harga beli dalam Rupiah, >= 0 (opsional).';
comment on column public.inventories.tipe_fasilitas is '''kamar'' (fasilitas kamar, room_id terisi) atau ''umum'' (fasilitas umum).';
comment on column public.inventories.receipt_url is 'Path nota di bucket privat receipt_images: "<org_id>/...". Dijaga trigger inventories_receipt_path_org.';

-- 2. Pre-check data sebelum constraint (live: 0 baris, tapi tetap dicek) ------
do $$
declare
  n int;
begin
  select count(*) into n from public.inventories where harga < 0;
  if n > 0 then
    raise exception 'Ada % baris inventories dengan harga < 0. Perbaiki dulu sebelum menambah constraint.', n;
  end if;
  select count(*) into n from public.inventories
   where tipe_fasilitas is not null and tipe_fasilitas not in ('kamar', 'umum');
  if n > 0 then
    raise exception 'Ada % baris inventories dengan tipe_fasilitas di luar (kamar, umum).', n;
  end if;
  select count(*) into n from public.inventories
   where receipt_url is not null and receipt_url <> ''
     and (org_id is null or left(receipt_url, length(org_id::text) + 1) <> org_id::text || '/');
  if n > 0 then
    raise exception 'Ada % baris inventories dengan receipt_url di luar folder org. Jalankan move_root_files_to_org.mjs dulu.', n;
  end if;
end $$;

-- 3. Constraint ringan -------------------------------------------------------
alter table public.inventories drop constraint if exists inventories_harga_nonnegative;
alter table public.inventories
  add constraint inventories_harga_nonnegative check (harga is null or harga >= 0);

alter table public.inventories drop constraint if exists inventories_tipe_fasilitas_check;
alter table public.inventories
  add constraint inventories_tipe_fasilitas_check
  check (tipe_fasilitas is null or tipe_fasilitas in ('kamar', 'umum'));

-- 4. Trigger path nota (sama dengan expenses_nota_path_org) ------------------
drop trigger if exists inventories_receipt_path_org on public.inventories;
create trigger inventories_receipt_path_org
  before insert or update on public.inventories
  for each row execute function public.enforce_org_storage_path('receipt_url');

-- 5. Minta PostgREST memuat ulang skema (kolom baru langsung terlihat API) ----
notify pgrst, 'reload schema';
