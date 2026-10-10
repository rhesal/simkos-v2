-- =====================================================================
-- OPSIONAL: ubah baris lama yang menyimpan URL publik penuh menjadi path
-- objek. Aplikasi sudah kompatibel dengan kedua format, jadi script ini
-- hanya untuk merapikan data. Idempotent (aman dijalankan ulang).
--
-- Contoh: https://<ref>.supabase.co/storage/v1/object/public/ktp_images/ktp_1.jpg
--      -> ktp_1.jpg
-- =====================================================================

-- Pratinjau dulu (tidak mengubah apa pun):
select 'tenants' as tbl, id, foto_ktp_url as nilai from public.tenants where foto_ktp_url ~* '^https?://'
union all
select 'inventories', id, receipt_url from public.inventories where receipt_url ~* '^https?://'
union all
select 'expenses', id, bukti_nota_url from public.expenses where bukti_nota_url ~* '^https?://';

begin;

update public.tenants
set foto_ktp_url = split_part(
      regexp_replace(foto_ktp_url, '^https?://[^/]+/storage/v1/object/(public|sign|authenticated)/ktp_images/', ''),
      '?', 1)
where foto_ktp_url ~* '^https?://[^/]+/storage/v1/object/(public|sign|authenticated)/ktp_images/';

update public.inventories
set receipt_url = split_part(
      regexp_replace(receipt_url, '^https?://[^/]+/storage/v1/object/(public|sign|authenticated)/receipt_images/', ''),
      '?', 1)
where receipt_url ~* '^https?://[^/]+/storage/v1/object/(public|sign|authenticated)/receipt_images/';

update public.expenses
set bukti_nota_url = split_part(
      regexp_replace(bukti_nota_url, '^https?://[^/]+/storage/v1/object/(public|sign|authenticated)/receipt_images/', ''),
      '?', 1)
where bukti_nota_url ~* '^https?://[^/]+/storage/v1/object/(public|sign|authenticated)/receipt_images/';

-- Catatan: path yang mengandung karakter ter-encode (%20 dll) perlu di-decode
-- manual. Upload SimKos selama ini memakai nama aman (ktp_<angka>.<ext>).

commit;
