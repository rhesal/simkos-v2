-- =====================================================================
-- SimKos v2 — migration 600: pindah kamar + pendaftaran penghuni atomik.
--
-- Keputusan Rhesal + tim (2026-10-18, grup simkos-v2):
--   - Pindah kamar = sewa lama DITUTUP, sewa BARU dibuat untuk penghuni yang
--     sama di kamar tujuan. Data & KTP penghuni tidak diinput ulang.
--   - Jatuh tempo ikut sewa lama (tidak dihitung ulang).
--   - Harga kamar baru berlaku mulai tagihan berikutnya; tidak ada prorata
--     atau selisih otomatis.
--   - Boleh pindah ke lokasi kos lain (dalam organisasi yang sama).
--   - Pemasukan lama tetap di rental_id lama (tidak disentuh).
--
-- Yang berubah:
--   1. rentals: kolom baru `tanggal_keluar date` dan `catatan text` (nullable).
--   2. Unique index parsial: maksimal SATU sewa aktif per kamar dan per
--      penghuni (`where status_aktif`). Guard: migration gagal dengan pesan
--      jelas bila data yang ada sudah melanggar.
--   3. RPC public.pindah_kamar(rental, kamar_baru, tanggal, catatan)
--      -> uuid sewa baru.
--   4. RPC public.daftar_penghuni(...) -> uuid penghuni baru. Menggantikan
--      3 request terpisah di TambahPenghuniView (tenant, rental, status kamar).
--      tipe_sewa hanya 'bulanan' / 'harian' (nilai yang dikirim form).
--   5. RPC public.checkout_sewa(rental, tanggal, reputasi, catatan_reputasi)
--      -> uuid sewa. Menggantikan 3 request terpisah checkout di
--      DaftarPenghuniView (sewa, status kamar, reputasi penghuni).
--      Reputasi hanya 'Bersih' / 'Peringatan' / 'Blacklist'.
--   6. rooms.status_kamar dibatasi PERSIS ('Kosong','Terisi') lewat check
--      constraint rooms_status_kamar_check. Guard: migration gagal dengan
--      pesan jelas bila ada baris lain (mis. 'kosong' huruf kecil dari form
--      Tambah Kamar lama). RPC membandingkan persis = 'Kosong'.
--
-- Ketiga RPC: SECURITY INVOKER (RLS migration 210 tetap berlaku), search_path
-- kosong, satu transaksi. Baris kamar dikunci `for update` sebelum dicek,
-- jadi dua admin/owner yang memakai kamar yang sama bersamaan diserialkan:
-- satu berhasil, yang lain mendapat "Kamar tujuan sudah terisi". Unique index
-- di (2) adalah pengaman terakhir.
-- Error yang disengaja: errcode P0001, message Bahasa Indonesia untuk
-- pengguna, detail = kode stabil 'SIMKOS_...' (dipetakan di src/lib/sewa.js).
-- Hak eksekusi: hanya authenticated (anon & public dicabut).
--
-- Idempotent: aman dijalankan ulang (if not exists / create or replace).
-- TIDAK berubah: policy RLS, storage, data yang sudah ada (guard menolak,
-- tidak menormalkan data diam-diam).
--
-- Urutan deploy: terapkan file ini DULU (SQL Editor / psql -1), baru
-- deploy frontend PR ini (daftar, pindah & checkout memanggil RPC di atas;
-- Tambah Kamar menulis 'Kosong').
-- Prasyarat: migration 200, 210 (dan 300 untuk trigger path KTP).
-- Rollback: supabase/rollback/rollback_600_pindah_kamar.sql
-- =====================================================================

-- 0. Pre-check ---------------------------------------------------------------
do $$
declare
  n int;
  sample text;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'rentals' and column_name = 'org_id') then
    raise exception 'rentals.org_id tidak ada. Terapkan migration 200 & 210 dulu.';
  end if;
  if to_regprocedure('public.is_org_member(uuid)') is null then
    raise exception 'public.is_org_member(uuid) tidak ada. Terapkan migration 200 dulu.';
  end if;

  select count(*), min(room_id::text) into n, sample from (
    select room_id from public.rentals
    where status_aktif and room_id is not null
    group by room_id having count(*) > 1) d;
  if n > 0 then
    raise exception using
      message = format('Migration dibatalkan: %s kamar punya lebih dari satu sewa aktif (contoh room_id %s).', n, sample),
      hint    = 'Checkout / nonaktifkan sewa ganda dulu, lalu jalankan ulang migration ini.';
  end if;

  select count(*), min(tenant_id::text) into n, sample from (
    select tenant_id from public.rentals
    where status_aktif and tenant_id is not null
    group by tenant_id having count(*) > 1) d;
  if n > 0 then
    raise exception using
      message = format('Migration dibatalkan: %s penghuni punya lebih dari satu sewa aktif (contoh tenant_id %s).', n, sample),
      hint    = 'Checkout / nonaktifkan sewa ganda dulu, lalu jalankan ulang migration ini.';
  end if;

  select count(*), string_agg(distinct coalesce(quote_literal(status_kamar), 'NULL'), ', ')
    into n, sample
    from public.rooms
   where status_kamar is null or status_kamar not in ('Kosong', 'Terisi');
  if n > 0 then
    raise exception using
      message = format('Migration dibatalkan: %s kamar punya status_kamar di luar ''Kosong''/''Terisi'' (nilai: %s).', n, sample),
      hint    = 'Perbaiki manual dulu, mis. update public.rooms set status_kamar = ''Kosong'' where status_kamar = ''kosong''; lalu jalankan ulang migration ini.';
  end if;
end $$;

-- 1. Kolom baru --------------------------------------------------------------
alter table public.rentals add column if not exists tanggal_keluar date;
alter table public.rentals add column if not exists catatan text;
comment on column public.rentals.tanggal_keluar is 'Tanggal sewa ditutup (checkout / pindah kamar). NULL = belum ditutup.';
comment on column public.rentals.catatan is 'Catatan sewa, mis. alasan pindah kamar.';

-- 2. Satu sewa aktif per kamar & per penghuni ---------------------------------
create unique index if not exists rentals_one_active_per_room
  on public.rentals (room_id) where status_aktif;
create unique index if not exists rentals_one_active_per_tenant
  on public.rentals (tenant_id) where status_aktif;

-- 2b. Status kamar persis 'Kosong' / 'Terisi' -----------------------------------
alter table public.rooms drop constraint if exists rooms_status_kamar_check;
alter table public.rooms
  add constraint rooms_status_kamar_check check (status_kamar in ('Kosong', 'Terisi'));

-- 3. RPC pindah_kamar ---------------------------------------------------------
create or replace function public.pindah_kamar(
  p_rental_id uuid,
  p_room_baru uuid,
  p_tanggal   date,
  p_catatan   text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rental   public.rentals%rowtype;
  v_lama     public.rooms%rowtype;
  v_baru     public.rooms%rowtype;
  v_catatan  text := nullif(btrim(p_catatan), '');
  v_new_id   uuid;
  n          int;
begin
  if p_rental_id is null or p_room_baru is null or p_tanggal is null then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_INPUT_KOSONG',
      message = 'Data pindah kamar belum lengkap (sewa, kamar tujuan, tanggal).';
  end if;

  -- Kunci sewa lama. RLS: sewa org lain tidak terlihat -> "tidak ditemukan".
  select * into v_rental from public.rentals where id = p_rental_id for update;
  if not found then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_SEWA_TIDAK_ADA',
      message = 'Data sewa tidak ditemukan. Muat ulang halaman lalu coba lagi.';
  end if;
  if v_rental.status_aktif is not true then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_SEWA_TIDAK_AKTIF',
      message = 'Sewa ini sudah tidak aktif (sudah checkout atau sudah dipindah).';
  end if;
  if v_rental.room_id is not distinct from p_room_baru then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_KAMAR_SAMA',
      message = 'Kamar tujuan sama dengan kamar sekarang.';
  end if;
  if p_tanggal < v_rental.tanggal_masuk then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_TANGGAL_SEBELUM_MASUK',
      message = 'Tanggal pindah tidak boleh sebelum tanggal masuk sewa sekarang.';
  end if;

  -- Kunci kedua kamar dalam urutan id (hindari deadlock antar-transaksi).
  perform 1 from public.rooms
   where id in (p_room_baru, v_rental.room_id)
   order by id
   for update;

  select * into v_baru from public.rooms where id = p_room_baru;
  if not found then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_KAMAR_TIDAK_ADA',
      message = 'Kamar tujuan tidak ditemukan.';
  end if;
  if v_baru.org_id is distinct from v_rental.org_id then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_BEDA_ORG',
      message = 'Kamar tujuan bukan milik organisasi yang sama.';
  end if;
  if v_baru.status_kamar is distinct from 'Kosong'
     or exists (select 1 from public.rentals r where r.room_id = p_room_baru and r.status_aktif) then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_KAMAR_TERISI',
      message = 'Kamar tujuan sudah terisi. Pilih kamar lain yang kosong.';
  end if;

  if v_rental.room_id is not null then
    select * into v_lama from public.rooms where id = v_rental.room_id;
  end if;

  -- Tutup sewa lama (hanya status, tanggal keluar, catatan; tidak dihapus).
  update public.rentals
     set status_aktif   = false,
         tanggal_keluar = p_tanggal,
         catatan        = concat_ws(': ', 'Pindah ke kamar ' || v_baru.nomor_kamar, v_catatan)
   where id = v_rental.id;

  -- Sewa baru: penghuni & tipe sewa sama, jatuh tempo TETAP dari sewa lama.
  insert into public.rentals
    (room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo, status_aktif, org_id, catatan)
  values
    (p_room_baru, v_rental.tenant_id, v_rental.tipe_sewa, p_tanggal, v_rental.tanggal_jatuh_tempo,
     true, v_rental.org_id,
     concat_ws(': ', 'Pindah dari kamar ' || coalesce(v_lama.nomor_kamar, '?'), v_catatan))
  returning id into v_new_id;

  if v_rental.room_id is not null then
    update public.rooms set status_kamar = 'Kosong' where id = v_rental.room_id;
  end if;
  update public.rooms set status_kamar = 'Terisi' where id = p_room_baru;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_GAGAL_UPDATE_KAMAR',
      message = 'Status kamar tujuan gagal diperbarui. Tidak ada data yang berubah.';
  end if;

  return v_new_id;
end $$;

comment on function public.pindah_kamar(uuid, uuid, date, text) is
  'Pindah kamar atomik: tutup sewa lama, buat sewa baru (penghuni, tipe sewa & jatuh tempo sama), status kedua kamar. Migration 600.';

-- 4. RPC daftar_penghuni -------------------------------------------------------
create or replace function public.daftar_penghuni(
  p_room_id             uuid,
  p_nama_lengkap        text,
  p_nomor_hp            text,
  p_kontak_darurat      text,
  p_foto_ktp_url        text,
  p_tipe_sewa           text,
  p_tanggal_masuk       date,
  p_tanggal_jatuh_tempo date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room      public.rooms%rowtype;
  v_tenant_id uuid;
  v_nama      text := nullif(btrim(p_nama_lengkap), '');
  v_tipe      text := nullif(btrim(p_tipe_sewa), '');
  n           int;
begin
  if p_room_id is null or v_nama is null or v_tipe is null
     or p_tanggal_masuk is null or p_tanggal_jatuh_tempo is null then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_INPUT_KOSONG',
      message = 'Data pendaftaran belum lengkap (kamar, nama, tipe sewa, tanggal).';
  end if;
  if v_tipe not in ('bulanan', 'harian') then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_TIPE_SEWA',
      message = 'Tipe sewa harus bulanan atau harian.';
  end if;
  if p_tanggal_jatuh_tempo < p_tanggal_masuk then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_TANGGAL_TEMPO',
      message = 'Tanggal jatuh tempo tidak boleh sebelum tanggal masuk.';
  end if;

  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_KAMAR_TIDAK_ADA',
      message = 'Kamar tidak ditemukan.';
  end if;
  if v_room.status_kamar is distinct from 'Kosong'
     or exists (select 1 from public.rentals r where r.room_id = p_room_id and r.status_aktif) then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_KAMAR_TERISI',
      message = 'Kamar ini sudah terisi. Pilih kamar lain yang kosong.';
  end if;

  insert into public.tenants (nama_lengkap, nomor_hp, kontak_darurat, foto_ktp_url, org_id)
  values (v_nama, nullif(btrim(p_nomor_hp), ''), nullif(btrim(p_kontak_darurat), ''),
          nullif(btrim(p_foto_ktp_url), ''), v_room.org_id)
  returning id into v_tenant_id;

  insert into public.rentals
    (room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo, status_aktif, org_id)
  values
    (p_room_id, v_tenant_id, v_tipe, p_tanggal_masuk, p_tanggal_jatuh_tempo, true, v_room.org_id);

  update public.rooms set status_kamar = 'Terisi' where id = p_room_id;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_GAGAL_UPDATE_KAMAR',
      message = 'Status kamar gagal diperbarui. Tidak ada data yang tersimpan.';
  end if;

  return v_tenant_id;
end $$;

comment on function public.daftar_penghuni(uuid, text, text, text, text, text, date, date) is
  'Pendaftaran penghuni atomik: tenant + sewa + status kamar Terisi. Migration 600.';

-- 5. RPC checkout_sewa -----------------------------------------------------------
create or replace function public.checkout_sewa(
  p_rental_id        uuid,
  p_tanggal          date,
  p_status_reputasi  text,
  p_catatan_reputasi text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rental public.rentals%rowtype;
  n        int;
begin
  if p_rental_id is null or p_tanggal is null or p_status_reputasi is null then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_INPUT_KOSONG',
      message = 'Data checkout belum lengkap (sewa, tanggal, reputasi).';
  end if;
  if p_status_reputasi not in ('Bersih', 'Peringatan', 'Blacklist') then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_REPUTASI',
      message = 'Status reputasi harus Bersih, Peringatan, atau Blacklist.';
  end if;

  -- Urutan kunci sama dengan pindah_kamar: sewa dulu, lalu kamar.
  select * into v_rental from public.rentals where id = p_rental_id for update;
  if not found then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_SEWA_TIDAK_ADA',
      message = 'Data sewa tidak ditemukan. Muat ulang halaman lalu coba lagi.';
  end if;
  if v_rental.status_aktif is not true then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_SEWA_TIDAK_AKTIF',
      message = 'Sewa ini sudah tidak aktif (sudah checkout atau sudah dipindah).';
  end if;
  if p_tanggal < v_rental.tanggal_masuk then
    raise exception using errcode = 'P0001', detail = 'SIMKOS_TANGGAL_KELUAR',
      message = 'Tanggal checkout tidak boleh sebelum tanggal masuk sewa.';
  end if;

  if v_rental.room_id is not null then
    perform 1 from public.rooms where id = v_rental.room_id for update;
  end if;

  update public.rentals
     set status_aktif = false, tanggal_keluar = p_tanggal
   where id = v_rental.id;

  if v_rental.room_id is not null then
    update public.rooms set status_kamar = 'Kosong' where id = v_rental.room_id;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception using errcode = 'P0001', detail = 'SIMKOS_GAGAL_UPDATE_KAMAR',
        message = 'Status kamar gagal diperbarui. Tidak ada data yang berubah.';
    end if;
  end if;

  if v_rental.tenant_id is not null then
    update public.tenants
       set status_reputasi  = p_status_reputasi,
           catatan_reputasi = nullif(btrim(p_catatan_reputasi), '')
     where id = v_rental.tenant_id;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception using errcode = 'P0001', detail = 'SIMKOS_GAGAL_UPDATE_PENGHUNI',
        message = 'Reputasi penghuni gagal diperbarui. Tidak ada data yang berubah.';
    end if;
  end if;

  return v_rental.id;
end $$;

comment on function public.checkout_sewa(uuid, date, text, text) is
  'Checkout atomik: sewa nonaktif + tanggal_keluar, kamar Kosong, reputasi penghuni. Migration 600.';

-- 6. Hak eksekusi: hanya authenticated --------------------------------------
revoke all on function public.pindah_kamar(uuid, uuid, date, text) from public, anon;
revoke all on function public.daftar_penghuni(uuid, text, text, text, text, text, date, date) from public, anon;
revoke all on function public.checkout_sewa(uuid, date, text, text) from public, anon;
grant execute on function public.pindah_kamar(uuid, uuid, date, text) to authenticated;
grant execute on function public.daftar_penghuni(uuid, text, text, text, text, text, date, date) to authenticated;
grant execute on function public.checkout_sewa(uuid, date, text, text) to authenticated;

notify pgrst, 'reload schema';
