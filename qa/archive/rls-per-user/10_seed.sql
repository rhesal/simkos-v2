-- QA seed: dua pemilik kos (User A dan User B), masing-masing punya satu
-- rangkaian data lengkap + file KTP/nota di storage. Dijalankan sebagai
-- superuser setelah semua migration.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'qa-user-a@example.test'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'qa-user-b@example.test')
on conflict do nothing;

-- User A
insert into public.locations (id, nama_lokasi, owner_id) values ('0a000000-0000-0000-0000-000000000001', 'Kos A', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into public.rooms (id, location_id, nomor_kamar, owner_id) values ('0a000000-0000-0000-0000-000000000002', '0a000000-0000-0000-0000-000000000001', 'A1', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into public.tenants (id, nama_lengkap, foto_ktp_url, owner_id) values ('0a000000-0000-0000-0000-000000000003', 'Penghuni A', 'aaaaaaaa-0000-0000-0000-00000000000a/ktp_a.jpg', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into public.rentals (id, tenant_id, room_id, owner_id) values ('0a000000-0000-0000-0000-000000000004', '0a000000-0000-0000-0000-000000000003', '0a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into public.incomes (id, rental_id, tanggal_bayar, owner_id) values ('0a000000-0000-0000-0000-000000000005', '0a000000-0000-0000-0000-000000000004', current_date, 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into public.expenses (id, location_id, tanggal_pengeluaran, owner_id) values ('0a000000-0000-0000-0000-000000000006', '0a000000-0000-0000-0000-000000000001', current_date, 'aaaaaaaa-0000-0000-0000-00000000000a');
insert into public.inventories (id, nama_barang, location_id, room_id, owner_id) values ('0a000000-0000-0000-0000-000000000007', 'Kasur A', '0a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a');

-- User B
insert into public.locations (id, nama_lokasi, owner_id) values ('0b000000-0000-0000-0000-000000000001', 'Kos B', 'bbbbbbbb-0000-0000-0000-00000000000b');
insert into public.rooms (id, location_id, nomor_kamar, owner_id) values ('0b000000-0000-0000-0000-000000000002', '0b000000-0000-0000-0000-000000000001', 'B1', 'bbbbbbbb-0000-0000-0000-00000000000b');
insert into public.tenants (id, nama_lengkap, foto_ktp_url, owner_id) values ('0b000000-0000-0000-0000-000000000003', 'Penghuni B', 'bbbbbbbb-0000-0000-0000-00000000000b/ktp_b.jpg', 'bbbbbbbb-0000-0000-0000-00000000000b');
insert into public.rentals (id, tenant_id, room_id, owner_id) values ('0b000000-0000-0000-0000-000000000004', '0b000000-0000-0000-0000-000000000003', '0b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b');
insert into public.incomes (id, rental_id, tanggal_bayar, owner_id) values ('0b000000-0000-0000-0000-000000000005', '0b000000-0000-0000-0000-000000000004', current_date, 'bbbbbbbb-0000-0000-0000-00000000000b');
insert into public.expenses (id, location_id, tanggal_pengeluaran, owner_id) values ('0b000000-0000-0000-0000-000000000006', '0b000000-0000-0000-0000-000000000001', current_date, 'bbbbbbbb-0000-0000-0000-00000000000b');
insert into public.inventories (id, nama_barang, location_id, room_id, owner_id) values ('0b000000-0000-0000-0000-000000000007', 'Kasur B', '0b000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b');

-- Storage: file baru (folder <uid>/) dan file lama (path datar, owner_id terisi)
-- Supabase Storage mengisi owner (uuid) dan owner_id (text) saat upload oleh user login.
insert into storage.objects (bucket_id, name, owner_id, owner) select bucket_id, name, owner_id, owner_id::uuid from (values
  ('ktp_images',     'aaaaaaaa-0000-0000-0000-00000000000a/ktp_a.jpg',  'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('ktp_images',     'bbbbbbbb-0000-0000-0000-00000000000b/ktp_b.jpg',  'bbbbbbbb-0000-0000-0000-00000000000b'),
  ('ktp_images',     'ktp_legacy_b.jpg',                                'bbbbbbbb-0000-0000-0000-00000000000b'),
  ('ktp_images',     'ktp_legacy_orphan.jpg',                           null),
  ('receipt_images', 'bbbbbbbb-0000-0000-0000-00000000000b/nota_b.jpg', 'bbbbbbbb-0000-0000-0000-00000000000b')) v(bucket_id, name, owner_id);
