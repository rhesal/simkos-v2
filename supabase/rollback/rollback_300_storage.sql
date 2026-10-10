-- =====================================================================
-- ROLLBACK migration 20261010000300 (storage) -> policy storage live lama.
-- Satu transaksi (SQL Editor / `psql -1 -f`).
--
-- Mengembalikan PERSIS policy live sebelum PR #1 (dari pg_policies 2026-10-10):
--   "Izinkan lihat KTP"   SELECT to authenticated using (bucket_id = 'ktp_images')
--   "Izinkan upload KTP"  INSERT to authenticated with check (bucket_id = 'ktp_images')
-- Bucket TETAP PRIVATE (public = false tidak disentuh). Batas 5 MB & tipe
-- JPEG/PNG/WEBP dibiarkan (tidak mengganggu aplikasi lama).
-- File yang sudah dipindah ke "<org_id>/..." tetap terbaca lewat policy lama
-- (policy lama membuka seluruh bucket ktp_images untuk user login; signup
-- publik sudah dimatikan). CATATAN: policy lama TIDAK punya akses ke
-- receipt_images, sama seperti kondisi live sebelumnya.
-- =====================================================================
drop policy if exists simkos_private_images_guard       on storage.objects;
drop policy if exists simkos_private_images_select_org  on storage.objects;
drop policy if exists simkos_private_images_insert_org  on storage.objects;
drop policy if exists simkos_private_images_update_org  on storage.objects;
drop policy if exists simkos_private_images_delete_org  on storage.objects;

drop trigger if exists tenants_ktp_path_org on public.tenants;
drop trigger if exists expenses_nota_path_org on public.expenses;
drop trigger if exists inventories_receipt_path_org on public.inventories;
drop function if exists public.enforce_org_storage_path();
drop function if exists public.storage_object_org_member(text);

drop policy if exists "Izinkan lihat KTP"  on storage.objects;
drop policy if exists "Izinkan upload KTP" on storage.objects;
create policy "Izinkan lihat KTP" on storage.objects
  for select to authenticated using (bucket_id = 'ktp_images'::text);
create policy "Izinkan upload KTP" on storage.objects
  for insert to authenticated with check (bucket_id = 'ktp_images'::text);

-- Sanity: jangan pernah membuka bucket.
do $$
begin
  if exists (select 1 from storage.buckets where id in ('ktp_images','receipt_images') and public) then
    raise exception 'Bucket KTP/nota public — rollback dibatalkan, periksa manual.';
  end if;
end $$;
