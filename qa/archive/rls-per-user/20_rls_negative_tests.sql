-- =====================================================================
-- QA: tes RLS negatif KTP tahap 1 (PR #1). Jalankan lewat run_local.sh.
-- User A = aaaaaaaa-...0a, User B = bbbbbbbb-...0b.
-- Setiap tes negatif punya kontrol positif supaya tidak "lulus palsu".
-- =====================================================================

-- ---------- Sebagai ANON (tanpa login) ----------
set role anon;
select set_config('request.jwt.claims', '', false);
select qa.expect('ANON-T-' || t, 'anon tidak bisa baca tabel ' || t,
                 format('select * from public.%I', t), 'denied')
from unnest(array['locations','rooms','tenants','rentals','incomes','expenses','inventories']) t;
select qa.expect('ANON-S-01', 'anon tidak bisa lihat objek di ktp_images',
                 $q$select * from storage.objects where bucket_id = 'ktp_images'$q$, 'rows:0');
select qa.expect('ANON-S-02', 'anon tidak bisa upload ke ktp_images',
                 $q$insert into storage.objects (bucket_id, name) values ('ktp_images', 'x/evil.jpg')$q$, 'denied');
reset role;

-- ---------- Sebagai USER A ----------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', false);

-- Kontrol positif
select qa.expect('POS-T-' || t, 'A bisa baca baris miliknya di ' || t,
                 format('select * from public.%I', t), 'rows:1')
from unnest(array['locations','rooms','tenants','rentals','incomes','expenses','inventories']) t;
select qa.expect('POS-T-INS', 'A bisa tambah kamar di lokasinya sendiri',
                 $q$insert into public.rooms (location_id, nomor_kamar) values ('0a000000-0000-0000-0000-000000000001', 'A2')$q$, 'rows:1');
select qa.expect('POS-S-01', 'A bisa lihat file KTP miliknya',
                 $q$select * from storage.objects where bucket_id = 'ktp_images'$q$, 'rows:1');
select qa.expect('POS-S-02', 'A bisa upload ke folder miliknya',
                 $q$insert into storage.objects (bucket_id, name) values ('ktp_images', 'aaaaaaaa-0000-0000-0000-00000000000a/ktp_new.jpg')$q$, 'rows:1');

-- Baca / ubah / hapus baris milik B (id ditebak langsung)
select qa.expect('NEG-SEL-' || t, 'A tidak bisa baca baris B di ' || t,
                 format($q$select * from public.%I where id = '0b000000-0000-0000-0000-00000000000%s'$q$, t, n), 'rows:0')
from (values ('locations',1),('rooms',2),('tenants',3),('rentals',4),('incomes',5),('expenses',6),('inventories',7)) v(t,n);
select qa.expect('NEG-UPD-' || t, 'A tidak bisa ubah baris B di ' || t,
                 format($q$update public.%I set created_at = now() where id = '0b000000-0000-0000-0000-00000000000%s'$q$, t, n), 'rows:0')
from (values ('locations',1),('rooms',2),('tenants',3),('rentals',4),('incomes',5),('expenses',6),('inventories',7)) v(t,n);
select qa.expect('NEG-DEL-' || t, 'A tidak bisa hapus baris B di ' || t,
                 format($q$delete from public.%I where id = '0b000000-0000-0000-0000-00000000000%s'$q$, t, n), 'rows:0')
from (values ('locations',1),('rooms',2),('tenants',3),('rentals',4),('incomes',5),('expenses',6),('inventories',7)) v(t,n);

-- Insert atas nama B / menautkan ke induk milik B
select qa.expect('NEG-INS-01', 'A tidak bisa insert lokasi dengan owner_id B',
  $q$insert into public.locations (nama_lokasi, owner_id) values ('palsu', 'bbbbbbbb-0000-0000-0000-00000000000b')$q$, 'denied');
select qa.expect('NEG-INS-02', 'A tidak bisa tambah kamar ke lokasi B',
  $q$insert into public.rooms (location_id, nomor_kamar) values ('0b000000-0000-0000-0000-000000000001', 'X')$q$, 'denied');
select qa.expect('NEG-INS-03', 'A tidak bisa buat sewa dengan penghuni B',
  $q$insert into public.rentals (tenant_id, room_id) values ('0b000000-0000-0000-0000-000000000003', '0a000000-0000-0000-0000-000000000002')$q$, 'denied');
select qa.expect('NEG-INS-04', 'A tidak bisa buat sewa di kamar B',
  $q$insert into public.rentals (tenant_id, room_id) values ('0a000000-0000-0000-0000-000000000003', '0b000000-0000-0000-0000-000000000002')$q$, 'denied');
select qa.expect('NEG-INS-05', 'A tidak bisa catat pemasukan ke sewa B',
  $q$insert into public.incomes (rental_id, tanggal_bayar) values ('0b000000-0000-0000-0000-000000000004', current_date)$q$, 'denied');
select qa.expect('NEG-INS-06', 'A tidak bisa catat pengeluaran ke lokasi B',
  $q$insert into public.expenses (location_id, tanggal_pengeluaran) values ('0b000000-0000-0000-0000-000000000001', current_date)$q$, 'denied');
select qa.expect('NEG-INS-07', 'A tidak bisa tambah inventaris ke kamar B (lokasi sendiri)',
  $q$insert into public.inventories (nama_barang, location_id, room_id) values ('X', '0a000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000002')$q$, 'denied');
select qa.expect('NEG-INS-08', 'A tidak bisa insert penghuni dengan owner_id B (data KTP)',
  $q$insert into public.tenants (nama_lengkap, owner_id) values ('X', 'bbbbbbbb-0000-0000-0000-00000000000b')$q$, 'denied');

-- Memindahkan baris sendiri ke B / ke induk B
select qa.expect('NEG-MOV-01', 'A tidak bisa menyerahkan baris miliknya ke B (owner_id)',
  $q$update public.tenants set owner_id = 'bbbbbbbb-0000-0000-0000-00000000000b' where id = '0a000000-0000-0000-0000-000000000003'$q$, 'denied');
select qa.expect('NEG-MOV-02', 'A tidak bisa memindah kamarnya ke lokasi B',
  $q$update public.rooms set location_id = '0b000000-0000-0000-0000-000000000001' where id = '0a000000-0000-0000-0000-000000000002'$q$, 'denied');
select qa.expect('NEG-MOV-03', 'A tidak bisa mengarahkan foto_ktp_url ke file B lalu membukanya',
  $q$select * from storage.objects where bucket_id = 'ktp_images' and name = 'bbbbbbbb-0000-0000-0000-00000000000b/ktp_b.jpg'$q$, 'rows:0');

-- Storage
select qa.expect('NEG-S-01', 'A tidak bisa lihat (=> tidak bisa createSignedUrl) KTP B di folder B',
  $q$select * from storage.objects where bucket_id = 'ktp_images' and name like 'bbbbbbbb%'$q$, 'rows:0');
select qa.expect('NEG-S-02', 'A tidak bisa lihat KTP lama B (path datar, owner_id B)',
  $q$select * from storage.objects where name = 'ktp_legacy_b.jpg'$q$, 'rows:0');
select qa.expect('NEG-S-03', 'A tidak bisa lihat file lama tanpa owner_id',
  $q$select * from storage.objects where name = 'ktp_legacy_orphan.jpg'$q$, 'rows:0');
select qa.expect('NEG-S-04', 'A tidak bisa lihat nota B',
  $q$select * from storage.objects where bucket_id = 'receipt_images'$q$, 'rows:0');
select qa.expect('NEG-S-05', 'A tidak bisa upload ke folder B',
  $q$insert into storage.objects (bucket_id, name) values ('ktp_images', 'bbbbbbbb-0000-0000-0000-00000000000b/evil.jpg')$q$, 'denied');
select qa.expect('NEG-S-06', 'A tidak bisa upload ke path datar (tanpa folder uid)',
  $q$insert into storage.objects (bucket_id, name) values ('ktp_images', 'evil.jpg')$q$, 'denied');
-- Catatan: nama objek berisi '../' hanya string biasa di storage.objects (folder[1] tetap uid A),
-- jadi bukan celah di level DB. Validasi key '..' dicek di tes API (TC-API), bukan di sini.
select qa.expect('NEG-S-08', 'A tidak bisa menimpa (update) file B',
  $q$update storage.objects set metadata = '{}' where name like 'bbbbbbbb%'$q$, 'rows:0');
select qa.expect('NEG-S-09', 'A tidak bisa menimpa file lama B',
  $q$update storage.objects set metadata = '{}' where name = 'ktp_legacy_b.jpg'$q$, 'rows:0');
select qa.expect('NEG-S-10', 'A tidak bisa memindah file miliknya ke folder B',
  $q$update storage.objects set name = 'bbbbbbbb-0000-0000-0000-00000000000b/moved.jpg' where name = 'aaaaaaaa-0000-0000-0000-00000000000a/ktp_a.jpg'$q$, 'denied');
select qa.expect('NEG-S-11', 'A tidak bisa hapus file B',
  $q$delete from storage.objects where name like 'bbbbbbbb%' or name = 'ktp_legacy_b.jpg'$q$, 'rows:0');
select qa.expect('NEG-S-12', 'A tidak bisa upload ke bucket lain di luar dua bucket ini via policy ini',
  $q$insert into storage.objects (bucket_id, name) values ('ktp_images_public', 'aaaaaaaa-0000-0000-0000-00000000000a/x.jpg')$q$, 'denied');
reset role;

-- ---------- Konfigurasi bucket (dicek sebagai superuser) ----------
select qa.expect('CFG-01', 'Bucket ktp_images & receipt_images private',
  $q$select * from storage.buckets where id in ('ktp_images','receipt_images') and public = false$q$, 'rows:2');
select qa.expect('CFG-02', 'Batas ukuran 5 MB di kedua bucket',
  $q$select * from storage.buckets where id in ('ktp_images','receipt_images') and file_size_limit = 5242880$q$, 'rows:2');
select qa.expect('CFG-03', 'SVG tidak diizinkan (allowed_mime_types tidak berupa image/* atau image/svg+xml)',
  $q$select * from storage.buckets where id in ('ktp_images','receipt_images') and allowed_mime_types && array['image/*','image/svg+xml']$q$, 'rows:0');
select qa.expect('CFG-04', 'Tidak ada policy storage.objects permisif (using true) yang tersisa',
  $q$select * from pg_policies where schemaname='storage' and tablename='objects' and cmd in ('SELECT','ALL') and coalesce(qual,'') in ('true','(true)')$q$, 'rows:0');
select qa.expect('CFG-05', 'RLS aktif di 7 tabel aplikasi',
  $q$select * from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('locations','rooms','tenants','rentals','incomes','expenses','inventories') and c.relrowsecurity$q$, 'rows:7');
select qa.expect('CFG-06', 'owner_id NOT NULL di 7 tabel (backfill sudah jalan)',
  $q$select * from information_schema.columns where table_schema='public' and column_name='owner_id' and is_nullable='NO' and table_name in ('locations','rooms','tenants','rentals','incomes','expenses','inventories')$q$, 'rows:7');
