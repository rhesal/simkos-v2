-- =====================================================================
-- Backfill owner_id MANUAL (jalankan hanya bila migration
-- 20261010000200 menampilkan WARNING "backfill DILEWATI").
-- =====================================================================
-- 1. Cari user id pemilik kos:
--      select id, email, created_at from auth.users order by created_at;
-- 2. Ganti '<OWNER_USER_ID>' di bawah dengan id tersebut, lalu jalankan.
--    Bila data perlu dibagi ke beberapa user, sesuaikan WHERE per tabel.
-- =====================================================================
begin;

update public.locations   set owner_id = '<OWNER_USER_ID>' where owner_id is null;
update public.rooms       set owner_id = '<OWNER_USER_ID>' where owner_id is null;
update public.tenants     set owner_id = '<OWNER_USER_ID>' where owner_id is null;
update public.rentals     set owner_id = '<OWNER_USER_ID>' where owner_id is null;
update public.incomes     set owner_id = '<OWNER_USER_ID>' where owner_id is null;
update public.expenses    set owner_id = '<OWNER_USER_ID>' where owner_id is null;
update public.inventories set owner_id = '<OWNER_USER_ID>' where owner_id is null;

-- File storage lama tanpa owner_id (mis. diunggah tanpa login)
update storage.objects set owner_id = '<OWNER_USER_ID>'
where bucket_id in ('ktp_images', 'receipt_images') and owner_id is null;

-- Setelah tidak ada NULL, kunci kolomnya:
alter table public.locations   alter column owner_id set not null;
alter table public.rooms       alter column owner_id set not null;
alter table public.tenants     alter column owner_id set not null;
alter table public.rentals     alter column owner_id set not null;
alter table public.incomes     alter column owner_id set not null;
alter table public.expenses    alter column owner_id set not null;
alter table public.inventories alter column owner_id set not null;

commit;
