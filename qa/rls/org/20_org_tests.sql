-- =====================================================================
-- QA: tes RLS model multi-pemilik (organisasi). Jalankan lewat run_local_org.sh.
--   u1 = Rhesal (owner org1 'SimKos'), u2 = partner (owner org1)
--   c  = owner org2, s = staff org2, d = user login tanpa organisasi
-- Setiap tes negatif punya kontrol positif.
-- =====================================================================

-- ---------------- ANON ----------------
set role anon;
select set_config('request.jwt.claims', '', false);
select qa.expect('ANON-T-' || t, 'anon tidak bisa baca tabel ' || t, format('select * from public.%I', t), 'denied')
from unnest(array['locations','rooms','tenants','rentals','incomes','expenses','inventories','organizations','organization_members']) t;
select qa.expect('ANON-T-INS', 'anon tidak bisa insert inventories (dulu RLS mati)',
  $q$insert into public.inventories (nama_barang, kondisi, org_id) values ('x','x', qa.id('org1'))$q$, 'denied');
select qa.expect('ANON-S-01', 'anon tidak bisa lihat objek ktp_images', $q$select * from storage.objects where bucket_id = 'ktp_images'$q$, 'rows:0');
select qa.expect('ANON-S-02', 'anon tidak bisa lihat objek receipt_images', $q$select * from storage.objects where bucket_id = 'receipt_images'$q$, 'rows:0');
select qa.expect('ANON-S-03', 'anon tidak bisa upload ke folder org1',
  format($q$insert into storage.objects (bucket_id, name) values ('ktp_images', '%s/evil.jpg')$q$, qa.id('org1')), 'denied');
reset role;

-- ---------------- KEDUA OWNER org1 melihat & mengelola SEMUA data ----------------
-- Dijalankan dua kali (u1 & u2) dengan blok yang sama.
create or replace function qa.owner_tests(who text) returns void language plpgsql as $f$
declare
  o1 text := qa.id('org1');
  o2 text := qa.id('org2');
  other text := case who when 'u1' then 'u2' else 'u1' end;
  p text := upper(who) || '-';
begin
  perform qa.as_user(who);
  -- semua data org1 terlihat (jumlah sama dengan data live contoh)
  perform qa.expect(p || 'SEE-' || t, who || ' melihat semua baris org1 di ' || t, format('select * from public.%I', t), 'rows:' || n)
  from (values ('locations',2),('rooms',2),('tenants',3),('rentals',2),('incomes',2),('expenses',1),('inventories',1)) v(t,n);
  perform qa.expect(p || 'ORG-01', who || ' melihat organisasinya (hanya 1)', 'select * from public.organizations', 'rows:1');
  perform qa.expect(p || 'ORG-02', who || ' melihat daftar anggota org1 (2 owner)', 'select * from public.organization_members', 'rows:2');
  perform qa.expect(p || 'ORG-03', who || ': is_org_member(org2) = false',
    format('select 1 where public.is_org_member(%L)', o2), 'rows:0');

  -- file lama yang sudah dipindah ke <org1>/ terbaca kedua owner (termasuk unggahan partner)
  perform qa.expect(p || 'S-READ-01', who || ' bisa baca KTP lama unggahan u2 (dipindah ke folder org1)',
    format($q$select * from storage.objects where bucket_id='ktp_images' and name = '%s/ktp_1.jpg'$q$, o1), 'rows:1');
  perform qa.expect(p || 'S-READ-02', who || ' bisa baca KTP lama unggahan u1 (dipindah ke folder org1)',
    format($q$select * from storage.objects where bucket_id='ktp_images' and name = '%s/ktp_2.jpg'$q$, o1), 'rows:1');
  perform qa.expect(p || 'S-READ-03', who || ' bisa baca nota lama (dipindah ke folder org1)',
    format($q$select * from storage.objects where bucket_id='receipt_images' and name = '%s/nota_1.jpg'$q$, o1), 'rows:1');
  perform qa.expect(p || 'S-READ-04', who || ' TIDAK melihat file root yang tidak dipindah (ktp_orphan.jpg)',
    $q$select * from storage.objects where name = 'ktp_orphan.jpg'$q$, 'rows:0');
  perform qa.expect(p || 'S-READ-05', who || ' tidak melihat KTP org2',
    format($q$select * from storage.objects where name like '%s/%%'$q$, o2), 'rows:0');

  -- tulis di org sendiri (default org_id dari current_org_id())
  perform qa.expect(p || 'INS-01', who || ' bisa tambah lokasi tanpa mengirim org_id',
    $q$insert into public.locations (nama_lokasi) values ('Baru')$q$, 'rows:1');
  perform qa.expect(p || 'INS-02', who || ' bisa tambah kamar di lokasi org1',
    $q$insert into public.rooms (location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar) values ('a0000000-0000-0000-0000-000000000002','9',1,1,'Kosong')$q$, 'rows:1');
  perform qa.expect(p || 'INS-03', who || ' bisa catat pemasukan tanpa rental (FK nullable)',
    $q$insert into public.incomes (tanggal_bayar, nominal) values ('2026-09-01', 10)$q$, 'rows:1');
  perform qa.expect(p || 'INS-04', who || ' CHECK incomes tetap berlaku (nominal 0 ditolak)',
    $q$insert into public.incomes (tanggal_bayar, nominal) values ('2026-09-01', 0)$q$, 'error:23514 new row for relation "incomes" violates check constraint "incomes_nominal_positif_check"');
  perform qa.expect(p || 'UPD-01', who || ' bisa ubah data yang dibuat owner lain',
    $q$update public.tenants set catatan = 'ok' where id = 'a2000000-0000-0000-0000-000000000001'$q$, 'rows:1');
  perform qa.expect(p || 'DEL-01', who || ' bisa hapus pemasukan',
    $q$delete from public.incomes where id = 'a4000000-0000-0000-0000-000000000002'$q$, 'rows:1');

  -- trigger path file
  perform qa.expect(p || 'PATH-01', who || ' bisa set foto_ktp_url ke <org1>/...',
    format($q$update public.tenants set foto_ktp_url = '%s/ktp_new.jpg' where id = 'a2000000-0000-0000-0000-000000000003'$q$, o1), 'rows:1');
  perform qa.expect(p || 'PATH-02', who || ' tidak bisa set foto_ktp_url ke path root',
    $q$update public.tenants set foto_ktp_url = 'ktp_orphan.jpg' where id = 'a2000000-0000-0000-0000-000000000003'$q$, 'denied');
  perform qa.expect(p || 'PATH-03', who || ' tidak bisa menautkan KTP org2 ke penghuni org1',
    format($q$update public.tenants set foto_ktp_url = '%s/ktp_c.jpg' where id = 'a2000000-0000-0000-0000-000000000003'$q$, o2), 'denied');
  perform qa.expect(p || 'PATH-04', who || ' tidak bisa insert penghuni dengan KTP folder user (bukan org)',
    format($q$insert into public.tenants (nama_lengkap, foto_ktp_url) values ('x', '%s/ktp.jpg')$q$, qa.id(who)), 'denied');
  perform qa.expect(p || 'PATH-05', who || ' tidak bisa pakai path dengan ..',
    format($q$update public.tenants set foto_ktp_url = '%s/../%s/ktp_c.jpg' where id = 'a2000000-0000-0000-0000-000000000003'$q$, o1, o2), 'denied');
  perform qa.expect(p || 'PATH-06', who || ' tidak bisa set bukti_nota_url ke path root',
    $q$update public.expenses set bukti_nota_url = 'nota_x.jpg' where id = 'a5000000-0000-0000-0000-000000000001'$q$, 'denied');
  perform qa.expect(p || 'PATH-07', who || ' update kolom lain tetap boleh walau path tidak diubah',
    $q$update public.expenses set keterangan = 'x' where id = 'a5000000-0000-0000-0000-000000000001'$q$, 'rows:1');

  -- storage tulis
  perform qa.expect(p || 'S-UP-01', who || ' bisa upload ke folder org1',
    format($q$insert into storage.objects (bucket_id, name) values ('ktp_images', '%s/ktp_up.jpg')$q$, o1), 'rows:1');
  perform qa.expect(p || 'S-UP-02', who || ' tidak bisa upload ke root bucket',
    $q$insert into storage.objects (bucket_id, name) values ('ktp_images', 'ktp_root.jpg')$q$, 'denied');
  perform qa.expect(p || 'S-UP-03', who || ' tidak bisa upload ke folder <user_id>/ (skema lama)',
    format($q$insert into storage.objects (bucket_id, name) values ('ktp_images', '%s/ktp.jpg')$q$, qa.id(who)), 'denied');
  perform qa.expect(p || 'S-UP-04', who || ' tidak bisa upload ke folder org2',
    format($q$insert into storage.objects (bucket_id, name) values ('ktp_images', '%s/evil.jpg')$q$, o2), 'denied');
  perform qa.expect(p || 'S-DEL-01', who || ' bisa hapus KTP yang diunggah owner lain (co-owner)',
    format($q$delete from storage.objects where name = '%s/%s'$q$, o1, case who when 'u1' then 'ktp_1.jpg' else 'ktp_2.jpg' end), 'rows:1');
  perform qa.expect(p || 'S-MOV-01', who || ' tidak bisa memindah file org1 ke folder org2',
    format($q$update storage.objects set name = '%s/moved.jpg' where name = '%s/ktp_1.jpg'$q$, o2, o1), 'denied');
  perform qa.expect(p || 'S-MOV-02', who || ' tidak bisa memindah file org1 ke root',
    format($q$update storage.objects set name = 'moved.jpg' where name = '%s/ktp_1.jpg'$q$, o1), 'denied');
  perform qa.expect(p || 'S-DEL-02', who || ' tidak bisa hapus KTP org2',
    format($q$delete from storage.objects where name like '%s/%%'$q$, o2), 'rows:0');

  -- lintas org: baca / ubah / hapus / tautkan
  perform qa.expect(p || 'X-SEL-' || t, who || ' tidak bisa baca baris org2 di ' || t,
    format($q$select * from public.%I where org_id = '%s'$q$, t, o2), 'rows:0')
  from unnest(array['locations','rooms','tenants','rentals','incomes','expenses','inventories']) t;
  perform qa.expect(p || 'X-UPD-' || t, who || ' tidak bisa ubah baris org2 di ' || t,
    format($q$update public.%I set created_at = now() where id = '%s'$q$, t, id), 'rows:0')
  from (values ('locations','b0000000-0000-0000-0000-000000000001'),('rooms','b1000000-0000-0000-0000-000000000001'),
               ('tenants','b2000000-0000-0000-0000-000000000001'),('rentals','b3000000-0000-0000-0000-000000000001'),
               ('incomes','b4000000-0000-0000-0000-000000000001'),('expenses','b5000000-0000-0000-0000-000000000001'),
               ('inventories','b6000000-0000-0000-0000-000000000001')) v(t,id);
  perform qa.expect(p || 'X-DEL-' || t, who || ' tidak bisa hapus baris org2 di ' || t,
    format($q$delete from public.%I where id = '%s'$q$, t, id), 'rows:0')
  from (values ('locations','b0000000-0000-0000-0000-000000000001'),('rooms','b1000000-0000-0000-0000-000000000001'),
               ('tenants','b2000000-0000-0000-0000-000000000001'),('rentals','b3000000-0000-0000-0000-000000000001'),
               ('incomes','b4000000-0000-0000-0000-000000000001'),('expenses','b5000000-0000-0000-0000-000000000001'),
               ('inventories','b6000000-0000-0000-0000-000000000001')) v(t,id);
  perform qa.expect(p || 'X-INS-01', who || ' tidak bisa insert lokasi dengan org_id org2',
    format($q$insert into public.locations (nama_lokasi, org_id) values ('x', '%s')$q$, o2), 'denied');
  perform qa.expect(p || 'X-INS-02', who || ' tidak bisa tambah kamar ke lokasi org2',
    $q$insert into public.rooms (location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar) values ('b0000000-0000-0000-0000-000000000001','x',1,1,'x')$q$, 'denied');
  perform qa.expect(p || 'X-INS-03', who || ' tidak bisa buat sewa dengan penghuni org2',
    $q$insert into public.rentals (room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo) values ('a1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','x','2026-01-01','2026-02-01')$q$, 'denied');
  perform qa.expect(p || 'X-INS-04', who || ' tidak bisa buat sewa di kamar org2',
    $q$insert into public.rentals (room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo) values ('b1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000003','x','2026-01-01','2026-02-01')$q$, 'denied');
  perform qa.expect(p || 'X-INS-05', who || ' tidak bisa catat pemasukan ke sewa org2',
    $q$insert into public.incomes (rental_id, tanggal_bayar, nominal) values ('b3000000-0000-0000-0000-000000000001','2026-09-01',1)$q$, 'denied');
  perform qa.expect(p || 'X-INS-06', who || ' tidak bisa catat pengeluaran ke lokasi org2',
    $q$insert into public.expenses (location_id, tanggal_pengeluaran, kategori, nominal) values ('b0000000-0000-0000-0000-000000000001','2026-09-01','x',1)$q$, 'denied');
  perform qa.expect(p || 'X-INS-07', who || ' tidak bisa tambah inventaris ke kamar org2 (lokasi sendiri)',
    $q$insert into public.inventories (location_id, room_id, nama_barang, kondisi) values ('a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','x','x')$q$, 'denied');
  perform qa.expect(p || 'X-MOV-01', who || ' tidak bisa memindah baris org1 ke org2',
    format($q$update public.tenants set org_id = '%s' where id = 'a2000000-0000-0000-0000-000000000003'$q$, o2), 'denied');
  perform qa.expect(p || 'X-MOV-02', who || ' tidak bisa memindah kamar org1 ke lokasi org2',
    $q$update public.rooms set location_id = 'b0000000-0000-0000-0000-000000000001' where id = 'a1000000-0000-0000-0000-000000000001'$q$, 'denied');

  -- keanggotaan
  perform qa.expect(p || 'M-01', who || ' tidak bisa join sendiri ke org2',
    format($q$insert into public.organization_members (org_id, user_id) values ('%s', '%s')$q$, o2, qa.id(who)), 'denied');
  perform qa.expect(p || 'M-02', who || ' tidak bisa mengubah role sendiri',
    format($q$update public.organization_members set role = 'staff' where user_id = '%s'$q$, qa.id(who)), 'rows:0');
  perform qa.expect(p || 'M-03', who || ' tidak bisa memindah keanggotaan sendiri ke org2',
    format($q$update public.organization_members set org_id = '%s' where user_id = '%s'$q$, o2, qa.id(who)), 'rows:0');
  perform qa.expect(p || 'M-04', who || ' (owner) bisa menambah user tanpa org sebagai staff org1',
    format($q$insert into public.organization_members (org_id, user_id, role) values ('%s', '%s', 'staff')$q$, o1, qa.id('d')), 'rows:1');
  perform qa.expect(p || 'M-05', who || ' tidak bisa menambah anggota ke org2',
    format($q$insert into public.organization_members (org_id, user_id, role) values ('%s', '%s', 'owner')$q$, o2, qa.id('d')), 'denied');
  perform qa.expect(p || 'M-06', who || ' tidak bisa menghapus anggota org2',
    format($q$delete from public.organization_members where org_id = '%s'$q$, o2), 'rows:0');
  perform qa.expect(p || 'M-07', who || ' tidak bisa mengeluarkan diri sendiri',
    format($q$delete from public.organization_members where user_id = '%s'$q$, qa.id(who)), 'rows:0');
  perform qa.expect(p || 'M-08', who || ' tidak bisa membuat organisasi baru',
    $q$insert into public.organizations (name) values ('palsu')$q$, 'denied');
  perform qa.expect(p || 'M-09', who || ' (owner) bisa ganti nama organisasinya', 
    format($q$update public.organizations set name = 'SimKos 2' where id = '%s'$q$, o1), 'rows:1');
  perform qa.expect(p || 'M-10', who || ' tidak bisa ganti nama org2',
    format($q$update public.organizations set name = 'x' where id = '%s'$q$, o2), 'rows:0');
end $f$;
grant execute on function qa.owner_tests(text) to authenticated;

set role authenticated;
select qa.owner_tests('u1');
select qa.owner_tests('u2');

-- ---------------- Owner org2 (c) ----------------
select qa.as_user('c');
select qa.expect('C-SEE-' || t, 'owner org2 hanya melihat 1 baris org2 di ' || t, format('select * from public.%I', t), 'rows:1')
from unnest(array['locations','rooms','tenants','rentals','incomes','expenses','inventories']) t;
select qa.expect('C-S-01', 'owner org2 tidak melihat KTP org1 (termasuk file lama yang dipindah)',
  format($q$select * from storage.objects where name like '%s/%%'$q$, qa.id('org1')), 'rows:0');
select qa.expect('C-S-02', 'owner org2 melihat KTP org2', $q$select * from storage.objects where bucket_id='ktp_images'$q$, 'rows:1');
select qa.expect('C-M-01', 'owner org2 bisa menambah user tanpa org ke org2 (kontrol positif utk staff)',
  format($q$insert into public.organization_members (org_id, user_id, role) values ('%s', '%s', 'staff')$q$, qa.id('org2'), qa.id('d')), 'rows:1');
select qa.expect('C-M-02', 'owner org2 tidak bisa memindah owner org1 ke org2',
  format($q$update public.organization_members set org_id = '%s' where user_id = '%s'$q$, qa.id('org2'), qa.id('u1')), 'rows:0');

-- ---------------- Staff org2 (s) ----------------
select qa.as_user('s');
select qa.expect('S-SEE-01', 'staff org2 melihat data org2', 'select * from public.tenants', 'rows:1');
select qa.expect('S-SEE-02', 'staff org2 melihat anggota org2', 'select * from public.organization_members', 'rows:2');
select qa.expect('S-M-01', 'staff TIDAK bisa menambah anggota',
  format($q$insert into public.organization_members (org_id, user_id, role) values ('%s', '%s', 'staff')$q$, qa.id('org2'), qa.id('d')), 'denied');
select qa.expect('S-M-02', 'staff tidak bisa menaikkan role sendiri',
  format($q$update public.organization_members set role = 'owner' where user_id = '%s'$q$, qa.id('s')), 'rows:0');
select qa.expect('S-M-03', 'staff tidak bisa menghapus owner',
  format($q$delete from public.organization_members where user_id = '%s'$q$, qa.id('c')), 'rows:0');

-- ---------------- User login tanpa organisasi (d) ----------------
select qa.as_user('d');
select qa.expect('D-SEE-' || t, 'user tanpa org tidak melihat apa pun di ' || t, format('select * from public.%I', t), 'rows:0')
from unnest(array['locations','rooms','tenants','rentals','incomes','expenses','inventories','organizations','organization_members']) t;
select qa.expect('D-INS-01', 'user tanpa org tidak bisa insert (current_org_id menolak)',
  $q$insert into public.locations (nama_lokasi) values ('x')$q$, 'denied');
select qa.expect('D-INS-02', 'user tanpa org tidak bisa insert dengan org_id org1',
  format($q$insert into public.locations (nama_lokasi, org_id) values ('x', '%s')$q$, qa.id('org1')), 'denied');
select qa.expect('D-M-01', 'user tanpa org tidak bisa join sendiri ke org1',
  format($q$insert into public.organization_members (org_id, user_id, role) values ('%s', '%s', 'owner')$q$, qa.id('org1'), qa.id('d')), 'denied');
select qa.expect('D-S-01', 'user tanpa org tidak melihat file apa pun', $q$select * from storage.objects where bucket_id in ('ktp_images','receipt_images')$q$, 'rows:0');
select qa.expect('D-S-02', 'user tanpa org tidak bisa upload ke folder org1',
  format($q$insert into storage.objects (bucket_id, name) values ('ktp_images', '%s/x.jpg')$q$, qa.id('org1')), 'denied');
reset role;

-- ---------------- Konfigurasi (superuser) ----------------
select qa.expect('CFG-01', 'Bucket ktp_images & receipt_images private, 5 MB, hanya jpeg/png/webp',
  $q$select * from storage.buckets where id in ('ktp_images','receipt_images') and not public and file_size_limit = 5242880
     and allowed_mime_types @> array['image/jpeg','image/png','image/webp'] and array_length(allowed_mime_types,1) = 3$q$, 'rows:2');
select qa.expect('CFG-02', 'RLS aktif di 9 tabel (7 aplikasi + 2 organisasi)',
  $q$select * from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity
     and c.relname in ('locations','rooms','tenants','rentals','incomes','expenses','inventories','organizations','organization_members')$q$, 'rows:9');
select qa.expect('CFG-03', 'org_id NOT NULL + default current_org_id() di 7 tabel',
  $q$select * from information_schema.columns where table_schema='public' and column_name='org_id' and is_nullable='NO'
     and column_default like '%current_org_id()%'$q$, 'rows:7');
select qa.expect('CFG-04', 'anon tidak punya hak apa pun di 9 tabel',
  $q$select * from unnest(array['locations','rooms','tenants','rentals','incomes','expenses','inventories','organizations','organization_members']) t
     where has_table_privilege('anon', 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE')$q$, 'rows:0');
select qa.expect('CFG-05', 'Policy lama "Hanya user login ..." & "Izinkan ... KTP" sudah tidak ada',
  $q$select * from pg_policies where policyname like 'Hanya user login%' or policyname like 'Izinkan%KTP'$q$, 'rows:0');
select qa.expect('CFG-06', 'Helper SECURITY DEFINER dengan search_path kosong',
  $q$select * from pg_proc where pronamespace = 'public'::regnamespace and proname in ('is_org_member','is_org_owner','current_org_id')
     and prosecdef and proconfig @> array['search_path=""']$q$, 'rows:3');
select qa.expect('CFG-07', 'Tidak ada referensi file di luar folder org',
  $q$select 1 from public.tenants where foto_ktp_url is not null and foto_ktp_url not like org_id || '/%'
     union all select 1 from public.expenses where bukti_nota_url is not null and bukti_nota_url not like org_id || '/%'$q$, 'rows:0');
select qa.expect('CFG-08', 'unique(user_id): user tidak bisa jadi anggota 2 org (dicek sebagai superuser)',
  format($q$insert into public.organization_members (org_id, user_id) values ('%s', '%s')$q$, qa.id('org2'), qa.id('u1')),
  'error:23505 duplicate key value violates unique constraint "organization_members_user_id_key"');
select qa.expect('CFG-09', 'Guard RESTRICTIVE terpasang', $q$select * from pg_policies where schemaname='storage' and policyname='simkos_private_images_guard' and permissive='RESTRICTIVE'$q$, 'rows:1');
