-- =====================================================================
-- ROLLBACK migration 20261010000400 (kolom inventories).
-- Satu transaksi (SQL Editor / `psql -1 -f`).
--
-- PERINGATAN: rollback ini MENGHAPUS kolom tanggal_pembelian, harga,
-- tipe_fasilitas, receipt_url beserta isinya. Hanya aman selama kolom-kolom
-- itu masih KOSONG (belum ada data inventaris yang diisi lewat app).
-- Guard di bawah menolak rollback bila ada nilai non-NULL. File nota yang
-- dirujuk receipt_url TIDAK dihapus dari storage (akan muncul di laporan
-- supabase/scripts/report_orphan_files.mjs).
-- =====================================================================
do $$
declare
  n int;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'inventories'
               and column_name in ('tanggal_pembelian','harga','tipe_fasilitas','receipt_url')) then
    execute $q$
      select count(*) from public.inventories
      where tanggal_pembelian is not null or harga is not null
         or tipe_fasilitas is not null or receipt_url is not null
    $q$ into n;
    if n > 0 then
      raise exception 'Rollback dibatalkan: % baris inventories sudah berisi data di kolom baru. Backup dulu, lalu hapus guard ini secara sadar bila tetap ingin rollback.', n;
    end if;
  end if;
end $$;

drop trigger if exists inventories_receipt_path_org on public.inventories;
alter table public.inventories drop constraint if exists inventories_tipe_fasilitas_check;
alter table public.inventories drop constraint if exists inventories_harga_nonnegative;
alter table public.inventories
  drop column if exists receipt_url,
  drop column if exists tipe_fasilitas,
  drop column if exists harga,
  drop column if exists tanggal_pembelian;

notify pgrst, 'reload schema';
