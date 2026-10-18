-- =====================================================================
-- QA migration 600 (pindah kamar + daftar penghuni). Data tambahan (superuser),
-- dijalankan SETELAH 200 -> 210 -> move -> 300 -> 10_seed_org2 -> 500 -> 600.
--   org1 "Kos Satu": kamar 1 (Terisi, sewa a3..01 Penghuni Satu, 1 pemasukan)
--                    kamar 3 (Kosong, c1..01), kamar 5 (status Terisi tanpa sewa, c1..03)
--   org1 "Kos Dua" : kamar 2 (Terisi, sewa a3..02 Penghuni Dua), kamar 4 (Kosong, c1..02)
--   org2 "Kos Org2": kamar X1 (sewa b3..01), kamar X2 (Kosong, b1..02)
-- =====================================================================
update public.rooms set status_kamar = 'Terisi' where id = 'a1000000-0000-0000-0000-000000000002';
update public.rooms set status_kamar = 'Terisi' where id = 'b1000000-0000-0000-0000-000000000001';
insert into public.rooms (id, location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar, org_id) values
  ('c1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '3', 100000, 1200000, 'Kosong', qa.id('org1')),
  ('c1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '4', 150000, 1500000, 'Kosong', qa.id('org1')),
  ('c1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '5', 100000, 1000000, 'Terisi', qa.id('org1')),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'X2', 1, 1, 'Kosong', qa.id('org2'));
