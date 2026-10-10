-- =====================================================================
-- QA: data contoh meniru live: 2 akun (Rhesal & partner) yang memakai data
-- yang sama, file KTP di ROOT bucket (ktp_<n>.jpg) dengan owner_id = pengunggah.
-- Dijalankan SEBELUM migration 200.
-- =====================================================================
insert into auth.users (id, email, created_at) values
  ('11111111-0000-0000-0000-000000000001', 'rhesal@example.test',  '2026-07-01'),
  ('22222222-0000-0000-0000-000000000002', 'partner@example.test', '2026-07-02');
insert into qa.ids values
  ('u1', '11111111-0000-0000-0000-000000000001'),
  ('u2', '22222222-0000-0000-0000-000000000002');

insert into public.locations (id, nama_lokasi) values
  ('a0000000-0000-0000-0000-000000000001', 'Kos Satu'),
  ('a0000000-0000-0000-0000-000000000002', 'Kos Dua');
insert into public.rooms (id, location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '1', 100000, 1000000, 'Terisi'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '2', 100000, 1000000, 'Kosong');
insert into public.tenants (id, nama_lengkap, foto_ktp_url) values
  ('a2000000-0000-0000-0000-000000000001', 'Penghuni Satu', 'ktp_1.jpg'),   -- diunggah partner (u2)
  ('a2000000-0000-0000-0000-000000000002', 'Penghuni Dua',  'ktp_2.jpg'),   -- diunggah Rhesal (u1)
  ('a2000000-0000-0000-0000-000000000003', 'Penghuni Tanpa KTP', null);
insert into public.rentals (id, room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo) values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Bulanan', '2026-08-01', '2026-09-01'),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000002', 'Bulanan', '2026-08-01', '2026-09-01');
insert into public.incomes (id, rental_id, tanggal_bayar, nominal) values
  ('a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', '2026-08-01', 1000000),
  ('a4000000-0000-0000-0000-000000000002', null, '2026-08-02', 50000);   -- rental_id nullable di live
insert into public.expenses (id, location_id, tanggal_pengeluaran, kategori, nominal, bukti_nota_url) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-08-03', 'Listrik', 200000, 'nota_1.jpg');
insert into public.inventories (id, location_id, room_id, nama_barang, kondisi) values
  ('a6000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Kasur', 'Baik');

insert into storage.objects (bucket_id, name, owner_id, owner) values
  ('ktp_images', 'ktp_1.jpg', '22222222-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002'),
  ('ktp_images', 'ktp_2.jpg', '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  ('ktp_images', 'ktp_orphan.jpg', '22222222-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002'),
  ('receipt_images', 'nota_1.jpg', '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001');
