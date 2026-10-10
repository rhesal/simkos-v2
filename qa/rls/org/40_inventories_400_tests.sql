-- QA migration 400 (kolom inventories). Dijalankan SETELAH 200 -> 210 -> move -> 300 -> 10_seed_org2 -> 400.
-- Alur sama dengan InventarisView.vue: insert/update/delete sebagai owner org1 (u1),
-- nota harus "<org_id>/...", compare-and-set receipt_url, dan isolasi org2 (c).
set role authenticated;
select qa.as_user('u1');
select qa.expect('INV-01', 'u1 insert barang lengkap (kolom baru) dgn nota di folder org1',
  format($q$insert into public.inventories (location_id, room_id, nama_barang, kondisi, tanggal_pembelian, harga, tipe_fasilitas, receipt_url)
            values ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','AC','Baik','2026-10-10',3500000,'kamar','%s/receipt_x.jpg') returning id$q$, qa.id('org1')), 'rows:1');
select qa.expect('INV-02', 'u1 insert tanpa nota & tanpa harga (semua kolom baru nullable)',
  $q$insert into public.inventories (location_id, nama_barang, kondisi, tipe_fasilitas) values ('a0000000-0000-0000-0000-000000000001','Kursi','Baik','umum')$q$, 'rows:1');
select qa.expect('INV-03', 'nota di root bucket ditolak trigger',
  $q$insert into public.inventories (location_id, nama_barang, kondisi, tipe_fasilitas, receipt_url) values ('a0000000-0000-0000-0000-000000000001','x','Baik','umum','receipt_root.jpg')$q$, 'denied');
select qa.expect('INV-04', 'nota di folder org2 ditolak trigger',
  format($q$insert into public.inventories (location_id, nama_barang, kondisi, tipe_fasilitas, receipt_url) values ('a0000000-0000-0000-0000-000000000001','x','Baik','umum','%s/r.jpg')$q$, qa.id('org2')), 'denied');
select qa.expect('INV-05', 'path traversal ditolak',
  format($q$insert into public.inventories (location_id, nama_barang, kondisi, tipe_fasilitas, receipt_url) values ('a0000000-0000-0000-0000-000000000001','x','Baik','umum','%s/../r.jpg')$q$, qa.id('org1')), 'denied');
select qa.expect('INV-06', 'harga negatif ditolak constraint',
  $q$insert into public.inventories (location_id, nama_barang, kondisi, tipe_fasilitas, harga) values ('a0000000-0000-0000-0000-000000000001','x','Baik','umum',-1)$q$,
  'error:23514 new row for relation "inventories" violates check constraint "inventories_harga_nonnegative"');
select qa.expect('INV-07', 'tipe_fasilitas di luar kamar/umum ditolak',
  $q$insert into public.inventories (location_id, nama_barang, kondisi, tipe_fasilitas) values ('a0000000-0000-0000-0000-000000000001','x','Baik','gudang')$q$,
  'error:23514 new row for relation "inventories" violates check constraint "inventories_tipe_fasilitas_check"');
-- Baris fixture lama (kolom baru NULL): update kolom lain lolos (trigger: nilai tidak berubah)
select qa.expect('INV-08', 'update kolom lain tanpa mengirim receipt_url lolos',
  $q$update public.inventories set kondisi = 'Rusak', harga = 100000 where id = 'a6000000-0000-0000-0000-000000000001'$q$, 'rows:1');
-- Compare-and-set seperti app: cabang null pakai IS NULL
select qa.expect('INV-09', 'CAS ganti nota: receipt_url IS NULL cocok -> 1 baris',
  format($q$update public.inventories set receipt_url = '%s/n1.jpg' where id = 'a6000000-0000-0000-0000-000000000001' and receipt_url is null$q$, qa.id('org1')), 'rows:1');
select qa.expect('INV-10', 'CAS dgn "= NULL" tidak pernah cocok (alasan cabang .is())',
  format($q$update public.inventories set receipt_url = '%s/n1.jpg' where id = 'a6000000-0000-0000-0000-000000000001' and receipt_url = null$q$, qa.id('org1')), 'rows:0');
select qa.expect('INV-11', 'u1 hapus barang org1',
  $q$delete from public.inventories where id = 'a6000000-0000-0000-0000-000000000001'$q$, 'rows:1');

select qa.as_user('c');
select qa.expect('INV-12', 'owner org2 tidak melihat barang org1 (kolom baru tidak membuka akses)',
  $q$select * from public.inventories where location_id = 'a0000000-0000-0000-0000-000000000001'$q$, 'rows:0');
select qa.expect('INV-13', 'owner org2 tidak bisa update receipt_url barang org1',
  format($q$update public.inventories set receipt_url = '%s/r.jpg' where id = 'a6000000-0000-0000-0000-000000000001'$q$, qa.id('org2')), 'rows:0');
select qa.expect('INV-14', 'owner org2 insert barang di lokasi org2 dgn nota org2',
  format($q$insert into public.inventories (location_id, nama_barang, kondisi, tipe_fasilitas, receipt_url) values ('b0000000-0000-0000-0000-000000000001','Meja','Baik','umum','%s/r.jpg')$q$, qa.id('org2')), 'rows:1');

set role anon;
select set_config('request.jwt.claims', '', false);
select qa.expect('INV-15', 'anon tidak bisa insert inventories',
  $q$insert into public.inventories (nama_barang, kondisi, tipe_fasilitas) values ('x','x','umum')$q$, 'denied');
reset role;
