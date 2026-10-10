-- QA independen: migration 400 (kolom inventories) — dijalankan setelah 20_tests.sql.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}', false);
select qa.expect('INV-POS-01', 'Rhesal bisa simpan aset lengkap dengan nota (dulu gagal di production)',
  $q$insert into public.inventories (location_id, room_id, nama_barang, kondisi, tanggal_pembelian, harga, tipe_fasilitas, receipt_url)
     values ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'AC', 'Baik', current_date, 3500000, 'kamar', (select org_a from qa.ids) || '/nota_ac.jpg')$q$, 'rows:1');
select qa.expect('INV-POS-02', 'Aset umum tanpa kamar, tanpa harga, tanpa nota', $q$insert into public.inventories (location_id, nama_barang, kondisi, tipe_fasilitas) values ('a0000000-0000-0000-0000-000000000001', 'Dispenser', 'Baik', 'umum')$q$, 'rows:1');
select qa.expect('INV-POS-03', 'Harga 0 diterima', $q$insert into public.inventories (location_id, nama_barang, kondisi, harga) values ('a0000000-0000-0000-0000-000000000001', 'Hibah', 'Baik', 0)$q$, 'rows:1');
select qa.expect('INV-POS-04', 'Ubah aset lama tanpa menyentuh nota tetap jalan', $q$update public.inventories set kondisi = 'Rusak' where id = 'a0000000-0000-0000-0000-000000000007'$q$, 'rows:1');
select qa.expect('INV-NEG-01', 'Harga negatif ditolak', $q$insert into public.inventories (location_id, nama_barang, kondisi, harga) values ('a0000000-0000-0000-0000-000000000001', 'X', 'Baik', -1)$q$, 'error:23514 new row for relation "inventories" violates check constraint "inventories_harga_nonnegative"');
select qa.expect('INV-NEG-02', 'tipe_fasilitas di luar kamar/umum ditolak', $q$insert into public.inventories (location_id, nama_barang, kondisi, tipe_fasilitas) values ('a0000000-0000-0000-0000-000000000001', 'X', 'Baik', 'Kamar')$q$, 'error:23514 new row for relation "inventories" violates check constraint "inventories_tipe_fasilitas_check"');
select qa.expect('INV-NEG-03', 'receipt_url di root ditolak', $q$update public.inventories set receipt_url = 'nota_1700000000003.jpg' where id = 'a0000000-0000-0000-0000-000000000007'$q$, 'denied');
select qa.expect('INV-NEG-04', 'receipt_url folder uid lama ditolak', $q$update public.inventories set receipt_url = '11111111-0000-0000-0000-000000000001/x.jpg' where id = 'a0000000-0000-0000-0000-000000000007'$q$, 'denied');
reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-0000-0000-0000-000000000003","role":"authenticated"}', false);
select qa.expect('INV-NEG-05', 'Org B tidak bisa isi receipt_url dengan nota org A', $q$insert into public.inventories (location_id, nama_barang, kondisi, receipt_url) values ('b0000000-0000-0000-0000-000000000001', 'X', 'Baik', (select org_a from qa.ids) || '/nota_1700000000003.jpg')$q$, 'denied');
select qa.expect('INV-NEG-06', 'Org B: receipt_url dengan ../ ditolak', $q$insert into public.inventories (location_id, nama_barang, kondisi, receipt_url) values ('b0000000-0000-0000-0000-000000000001', 'X', 'Baik', 'b0000000-0000-0000-0000-00000000000b/../' || (select org_a from qa.ids) || '/x.jpg')$q$, 'denied');
select qa.expect('INV-NEG-07', 'Org B tidak melihat aset org A', $q$select * from public.inventories where org_id = (select org_a from qa.ids)$q$, 'rows:0');
select qa.expect('INV-NEG-08', 'Org B tidak bisa ubah harga aset org A', $q$update public.inventories set harga = 1 where org_id = (select org_a from qa.ids)$q$, 'rows:0');
select qa.expect('INV-POS-05', 'Org B bisa simpan aset dengan nota di folder sendiri', $q$insert into public.inventories (location_id, nama_barang, kondisi, receipt_url) values ('b0000000-0000-0000-0000-000000000001', 'Kipas', 'Baik', 'b0000000-0000-0000-0000-00000000000b/nota_kipas.jpg')$q$, 'rows:1');
reset role;
-- Hapus kamar tanpa sewa: aset tipe 'kamar' tidak boleh menggagalkan hapus kamar (room_id ON DELETE SET NULL)
insert into public.rooms (id, location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar, org_id) select 'a0000000-0000-0000-0000-000000000099','a0000000-0000-0000-0000-000000000001','9',1,1,'Kosong', org_a from qa.ids;
insert into public.inventories (id, location_id, room_id, nama_barang, kondisi, tipe_fasilitas, org_id) select 'a0000000-0000-0000-0000-000000000098','a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000099','Lemari','Baik','kamar', org_a from qa.ids;
select qa.expect('INV-DEL-01', 'Hapus kamar berisi aset tipe kamar berhasil', $q$delete from public.rooms where id = 'a0000000-0000-0000-0000-000000000099'$q$, 'rows:1');
delete from public.inventories where id = 'a0000000-0000-0000-0000-000000000098';
delete from public.rooms where id = 'a0000000-0000-0000-0000-000000000099';
-- Tambahan setelah b2ca3cd: harga NULL vs 0, tipe_fasilitas NULL (harness me-rollback tiap expect, jadi data disiapkan dulu)
reset role;
insert into public.inventories (id, location_id, nama_barang, kondisi, harga, tipe_fasilitas, org_id) select 'a0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-000000000001','Rak','Baik',null,'umum', org_a from qa.ids;
insert into public.inventories (id, location_id, nama_barang, kondisi, harga, tipe_fasilitas, org_id) select 'a0000000-0000-0000-0000-0000000000a3','a0000000-0000-0000-0000-000000000001','Hibah','Baik',0,'umum', org_a from qa.ids;
insert into public.inventories (id, location_id, nama_barang, kondisi, org_id) select 'a0000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-000000000001','Lama','Baik', org_a from qa.ids;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}', false);
select qa.expect('INV-H-01', 'Anggota org melihat aset harga NULL sebagai NULL', $q$select 1 from public.inventories where id='a0000000-0000-0000-0000-0000000000a1' and harga is null$q$, 'rows:1');
select qa.expect('INV-H-02', 'Harga 0 tetap 0, bukan NULL', $q$select 1 from public.inventories where id='a0000000-0000-0000-0000-0000000000a3' and harga = 0$q$, 'rows:1');
select qa.expect('INV-H-03', 'Edit dengan payload harga NULL diterima', $q$update public.inventories set kondisi='Rusak', harga=null where id='a0000000-0000-0000-0000-0000000000a1'$q$, 'rows:1');
select qa.expect('INV-T-01', 'Aset tipe_fasilitas NULL terlihat anggota org', $q$select 1 from public.inventories where id='a0000000-0000-0000-0000-0000000000a2' and tipe_fasilitas is null$q$, 'rows:1');
select qa.expect('INV-T-02', 'Edit aset NULL -> umum berhasil', $q$update public.inventories set tipe_fasilitas='umum' where id='a0000000-0000-0000-0000-0000000000a2'$q$, 'rows:1');
reset role;
delete from public.inventories where id in ('a0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-0000000000a3');
