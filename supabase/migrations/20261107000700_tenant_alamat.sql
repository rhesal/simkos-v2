-- Migration: 20261107000700_tenant_alamat.sql
-- Menambahkan kolom 'alamat' pada tabel public.tenants
-- dan memperbarui RPC public.daftar_penghuni agar menerima parameter p_alamat.

-- 1. Tambah kolom alamat pada tabel tenants
alter table public.tenants
  add column if not exists alamat text;

comment on column public.tenants.alamat is
  'Alamat asal / domisili KTP penyewa.';

-- 2. Hapus versi lama RPC daftar_penghuni (8 parameter) jika ada
drop function if exists public.daftar_penghuni(uuid, text, text, text, text, text, date, date);

-- 3. Definisikan RPC daftar_penghuni baru dengan parameter p_alamat (default null)
create or replace function public.daftar_penghuni(
  p_room_id             uuid,
  p_nama_lengkap        text,
  p_nomor_hp            text,
  p_kontak_darurat      text,
  p_foto_ktp_url        text,
  p_tipe_sewa           text,
  p_tanggal_masuk       date,
  p_tanggal_jatuh_tempo date,
  p_alamat              text default null
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

  insert into public.tenants (nama_lengkap, nomor_hp, kontak_darurat, foto_ktp_url, alamat, org_id)
  values (v_nama, nullif(btrim(p_nomor_hp), ''), nullif(btrim(p_kontak_darurat), ''),
          nullif(btrim(p_foto_ktp_url), ''), nullif(btrim(p_alamat), ''), v_room.org_id)
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
end;
$$;

comment on function public.daftar_penghuni(uuid, text, text, text, text, text, date, date, text) is
  'Pendaftaran penghuni atomik: buat tenant baru (dengan alamat), rental aktif, dan status kamar jadi Terisi.';

revoke all on function public.daftar_penghuni(uuid, text, text, text, text, text, date, date, text) from public, anon;
grant execute on function public.daftar_penghuni(uuid, text, text, text, text, text, date, date, text) to authenticated;
