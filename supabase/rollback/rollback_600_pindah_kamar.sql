-- =====================================================================
-- ROLLBACK migration 20261018000600 (pindah kamar, daftar penghuni & checkout
-- atomik, constraint status_kamar).
-- Satu transaksi (SQL Editor / `psql -1 -f`).
--
-- URUTAN: kembalikan frontend ke versi sebelum PR ini DULU. Frontend PR ini
-- memanggil RPC pindah_kamar/daftar_penghuni/checkout_sewa/hapus_sewa; setelah
-- rollback semuanya gagal. Constraint rooms_status_kamar_check ikut dihapus (data
-- status_kamar tidak diubah).
--
-- PERINGATAN: rollback ini MENGHAPUS kolom rentals.tanggal_keluar dan
-- rentals.catatan beserta isinya. Guard di bawah menolak rollback bila ada
-- nilai non-NULL. Sewa hasil pindah kamar TIDAK dihapus (tetap sewa biasa).
-- =====================================================================
do $$
declare
  n int;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'rentals'
               and column_name in ('tanggal_keluar', 'catatan')) then
    execute $q$
      select count(*) from public.rentals
      where tanggal_keluar is not null or catatan is not null
    $q$ into n;
    if n > 0 then
      raise exception 'Rollback dibatalkan: % baris rentals sudah berisi data di kolom tanggal_keluar/catatan. Backup dulu, lalu hapus guard ini secara sadar bila tetap ingin rollback.', n;
    end if;
  end if;
end $$;

drop function if exists public.pindah_kamar(uuid, uuid, date, text);
drop function if exists public.daftar_penghuni(uuid, text, text, text, text, text, date, date);
drop function if exists public.checkout_sewa(uuid, date, text, text);
drop function if exists public.hapus_sewa(uuid);
alter table public.rooms drop constraint if exists rooms_status_kamar_check;
drop index if exists public.rentals_one_active_per_room;
drop index if exists public.rentals_one_active_per_tenant;
alter table public.rentals
  drop column if exists catatan,
  drop column if exists tanggal_keluar;

notify pgrst, 'reload schema';
