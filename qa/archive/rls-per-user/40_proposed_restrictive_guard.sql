-- QA: usulan System Architect (BELUM ada di PR). Dipakai di skenario S6
-- untuk membuktikan guard RESTRICTIVE menutup celah S4/S5.
create policy simkos_private_images_guard on storage.objects
  as restrictive for all to public
  using (
    bucket_id not in ('ktp_images','receipt_images')
    or (storage.foldername(name))[1] = (select auth.uid())::text
    or owner_id = (select auth.uid())::text
  )
  with check (
    bucket_id not in ('ktp_images','receipt_images')
    or (storage.foldername(name))[1] = (select auth.uid())::text
  );
