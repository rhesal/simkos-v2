-- Di sela migration 210 dan 300: R masih pakai bundle PWA lama, upload ke "<uid>/..." lalu simpan path.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}', false);
insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('ktp_images', '11111111-0000-0000-0000-000000000001/ktp_baru.jpg', '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001');
insert into public.tenants (id, nama_lengkap, foto_ktp_url) values
  ('a0000000-0000-0000-0000-000000000023', 'Penghuni Bundle Lama', '11111111-0000-0000-0000-000000000001/ktp_baru.jpg');
reset role;
