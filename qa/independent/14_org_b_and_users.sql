-- Setelah deploy: organisasi kedua (dibuat lewat service role) + user tambahan.
-- X = owner org B, T = staff org A (ditambah owner), U = akun login tanpa org.
insert into auth.users (id, email) values
  ('33333333-0000-0000-0000-000000000003', 'x@example.test'),
  ('44444444-0000-0000-0000-000000000004', 't@example.test'),
  ('55555555-0000-0000-0000-000000000005', 'u@example.test');
insert into public.organizations (id, name) values ('b0000000-0000-0000-0000-00000000000b', 'Kos Lain');
insert into public.organization_members (org_id, user_id, role) values
  ('b0000000-0000-0000-0000-00000000000b', '33333333-0000-0000-0000-000000000003', 'owner'),
  ((select id from public.organizations where name = 'SimKos'), '44444444-0000-0000-0000-000000000004', 'staff');
insert into public.locations (id, nama_lokasi, org_id) values ('b0000000-0000-0000-0000-000000000001', 'Kos B', 'b0000000-0000-0000-0000-00000000000b');
insert into public.rooms (id, location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar, org_id)
  values ('b0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'B1', 1, 1, 'Kosong', 'b0000000-0000-0000-0000-00000000000b');
insert into public.tenants (id, nama_lengkap, foto_ktp_url, org_id)
  values ('b0000000-0000-0000-0000-000000000003', 'Penghuni B', 'b0000000-0000-0000-0000-00000000000b/ktp_b.jpg', 'b0000000-0000-0000-0000-00000000000b');
insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('ktp_images', 'b0000000-0000-0000-0000-00000000000b/ktp_b.jpg', '33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000003');
-- Catat id org A untuk tes
create schema if not exists qa;
create table qa.ids as select id as org_a from public.organizations where name = 'SimKos';
grant usage on schema qa to anon, authenticated;
grant select on qa.ids to anon, authenticated;
