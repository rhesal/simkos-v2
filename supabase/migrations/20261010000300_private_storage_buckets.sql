-- =====================================================================
-- SimKos v2 — Bucket storage privat untuk foto KTP & nota
-- =====================================================================
-- Sebelumnya bucket 'ktp_images' dan 'receipt_images' bersifat PUBLIC:
-- siapa pun yang tahu/menebak URL bisa melihat foto KTP penghuni.
--
-- Migration ini:
--   1. Menjadikan kedua bucket private (public = false), batas 5 MB, hanya
--      gambar. Bucket dibuat bila belum ada.
--   2. Menghapus policy lama di storage.objects yang menyebut kedua bucket
--      ini (mis. "public read" / "anon upload").
--   3. Menambah policy baru untuk role `authenticated`:
--        - INSERT : hanya ke folder milik sendiri -> nama objek harus
--                   diawali "<auth.uid()>/" (kode baru mengunggah ke
--                   "<user_id>/ktp_....jpg").
--        - SELECT / UPDATE / DELETE : objek di folder "<auth.uid()>/" ATAU
--                   objek lama (path datar, mis. "ktp_123.jpg") yang
--                   kolom owner_id-nya = auth.uid(). Supabase Storage
--                   mengisi owner_id otomatis dengan user yang mengunggah,
--                   jadi file lama yang diunggah saat login tetap bisa
--                   diakses pemiliknya (backward compatible).
--      Signed URL (createSignedUrl) membutuhkan izin SELECT ini.
--   Role `anon` tidak mendapat akses apa pun.
--
-- Cek setelah migrasi: file lama dengan owner_id NULL tidak akan bisa
-- diakses lewat aplikasi — lihat docs/security-ktp.md bagian verifikasi.
-- =====================================================================

-- 1. Bucket private
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('ktp_images',     'ktp_images',     false, 5242880, array['image/*']),
  ('receipt_images', 'receipt_images', false, 5242880, array['image/*'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Hapus policy lama yang terkait kedua bucket
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and (
        coalesce(qual, '')       ~ '(ktp_images|receipt_images)'
        or coalesce(with_check, '') ~ '(ktp_images|receipt_images)'
      )
  loop
    raise notice 'Menghapus policy storage lama: %', p.policyname;
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

-- 3. Policy baru
create policy simkos_private_images_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('ktp_images', 'receipt_images')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy simkos_private_images_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id in ('ktp_images', 'receipt_images')
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or owner_id = (select auth.uid())::text
    )
  );

create policy simkos_private_images_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id in ('ktp_images', 'receipt_images')
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or owner_id = (select auth.uid())::text
    )
  )
  with check (
    bucket_id in ('ktp_images', 'receipt_images')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy simkos_private_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('ktp_images', 'receipt_images')
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or owner_id = (select auth.uid())::text
    )
  );
