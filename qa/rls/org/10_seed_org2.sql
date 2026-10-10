-- =====================================================================
-- QA: organisasi KEDUA + user di luar organisasi (setelah semua migration).
--   c = owner org2, s = staff org2, d = user login tanpa organisasi.
-- =====================================================================
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-00000000000c', 'owner-org2@example.test'),
  ('5555aaaa-0000-0000-0000-000000000005', 'staff-org2@example.test'),
  ('dddddddd-0000-0000-0000-00000000000d', 'no-org@example.test');
insert into public.organizations (id, name) values ('b0000000-0000-0000-0000-0000000000b2', 'Kos Lain');
insert into qa.ids values
  ('org2', 'b0000000-0000-0000-0000-0000000000b2'),
  ('c', 'cccccccc-0000-0000-0000-00000000000c'),
  ('s', '5555aaaa-0000-0000-0000-000000000005'),
  ('d', 'dddddddd-0000-0000-0000-00000000000d');
insert into public.organization_members (org_id, user_id, role) values
  ('b0000000-0000-0000-0000-0000000000b2', 'cccccccc-0000-0000-0000-00000000000c', 'owner'),
  ('b0000000-0000-0000-0000-0000000000b2', '5555aaaa-0000-0000-0000-000000000005', 'staff');

insert into public.locations (id, nama_lokasi, org_id) values ('b0000000-0000-0000-0000-000000000001', 'Kos Org2', qa.id('org2'));
insert into public.rooms (id, location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar, org_id) values
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'X1', 1, 1, 'Kosong', qa.id('org2'));
insert into public.tenants (id, nama_lengkap, foto_ktp_url, org_id) values
  ('b2000000-0000-0000-0000-000000000001', 'Penghuni Org2', 'b0000000-0000-0000-0000-0000000000b2/ktp_c.jpg', qa.id('org2'));
insert into public.rentals (id, room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo, org_id) values
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'Bulanan', '2026-08-01', '2026-09-01', qa.id('org2'));
insert into public.incomes (id, rental_id, tanggal_bayar, nominal, org_id) values
  ('b4000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', '2026-08-01', 1, qa.id('org2'));
insert into public.expenses (id, location_id, tanggal_pengeluaran, kategori, nominal, org_id) values
  ('b5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2026-08-01', 'Air', 1, qa.id('org2'));
insert into public.inventories (id, location_id, nama_barang, kondisi, org_id) values
  ('b6000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Lemari', 'Baik', qa.id('org2'));
insert into storage.objects (bucket_id, name, owner_id) values
  ('ktp_images', 'b0000000-0000-0000-0000-0000000000b2/ktp_c.jpg', 'cccccccc-0000-0000-0000-00000000000c');
