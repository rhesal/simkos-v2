-- =====================================================================
-- QA independen: tes RLS org untuk PR #1 (head 896d31b).
-- R = 1111… owner org A (SimKos), P = 2222… owner org A (partner),
-- T = 4444… staff org A, X = 3333… owner org B, U = 5555… login tanpa org.
-- Org A id dinamis: (select org_a from qa.ids). Org B = b000…0b.
-- =====================================================================
\set A '(select org_a from qa.ids)'

-- ---------------- ANON ----------------
set role anon; select set_config('request.jwt.claims', '', false);
select qa.expect('AN-T-' || t, 'anon tidak bisa baca ' || t, format('select * from public.%I', t), 'denied')
from unnest(array['locations','rooms','tenants','rentals','incomes','expenses','inventories','organizations','organization_members']) t;
select qa.expect('AN-S-01', 'anon tidak lihat objek KTP/nota', $q$select * from storage.objects where bucket_id in ('ktp_images','receipt_images')$q$, 'rows:0');
select qa.expect('AN-S-02', 'anon tidak bisa upload ke folder org A',
  $q$insert into storage.objects (bucket_id, name) values ('ktp_images', (select org_a from qa.ids) || '/evil.jpg')$q$, 'denied');
reset role;

-- ---------------- X (owner org B) ----------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-0000-0000-0000-000000000003","role":"authenticated"}', false);
select qa.expect('X-POS-01', 'X melihat penghuni org B', $q$select * from public.tenants$q$, 'rows:1');
select qa.expect('X-POS-02', 'X bisa tambah lokasi (org_id default org B)', $q$insert into public.locations (nama_lokasi) values ('baru')$q$, 'rows:1');
select qa.expect('X-POS-03', 'X bisa upload ke folder org B', $q$insert into storage.objects (bucket_id, name) values ('ktp_images', 'b0000000-0000-0000-0000-00000000000b/x2.jpg')$q$, 'rows:1');
select qa.expect('X-SEL-' || t, 'X tidak melihat baris org A di ' || t,
  format('select * from public.%I where org_id = (select org_a from qa.ids)', t), 'rows:0')
from unnest(array['locations','rooms','tenants','rentals','incomes','expenses','inventories']) t;
select qa.expect('X-UPD-' || t, 'X tidak bisa ubah baris org A di ' || t,
  format('update public.%I set created_at = now() where org_id = (select org_a from qa.ids)', t), 'rows:0')
from unnest(array['locations','rooms','tenants','rentals','incomes','expenses','inventories']) t;
select qa.expect('X-DEL-' || t, 'X tidak bisa hapus baris org A di ' || t,
  format('delete from public.%I where org_id = (select org_a from qa.ids)', t), 'rows:0')
from unnest(array['locations','rooms','tenants','rentals','incomes','expenses','inventories']) t;
select qa.expect('X-INS-01', 'X tidak bisa insert dengan org_id A', $q$insert into public.tenants (nama_lengkap, org_id) values ('x', (select org_a from qa.ids))$q$, 'denied');
select qa.expect('X-INS-02', 'X tidak bisa tambah kamar ke lokasi org A', $q$insert into public.rooms (location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar) values ('a0000000-0000-0000-0000-000000000001','x',1,1,'Kosong')$q$, 'denied');
select qa.expect('X-INS-03', 'X tidak bisa buat sewa dengan penghuni org A', $q$insert into public.rentals (room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo) values ('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','bulanan',current_date,current_date)$q$, 'denied');
select qa.expect('X-INS-04', 'X tidak bisa catat pemasukan ke sewa org A', $q$insert into public.incomes (rental_id, tanggal_bayar, nominal) values ('a0000000-0000-0000-0000-000000000004', current_date, 1)$q$, 'denied');
select qa.expect('X-INS-05', 'X tidak bisa catat pengeluaran ke lokasi org A', $q$insert into public.expenses (location_id, tanggal_pengeluaran, kategori, nominal) values ('a0000000-0000-0000-0000-000000000001', current_date, 'x', 1)$q$, 'denied');
select qa.expect('X-INS-06', 'X tidak bisa tambah inventaris ke kamar org A', $q$insert into public.inventories (location_id, room_id, nama_barang, kondisi) values ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002','x','Baik')$q$, 'denied');
select qa.expect('X-MOV-01', 'X tidak bisa memindah penghuninya ke org A', $q$update public.tenants set org_id = (select org_a from qa.ids) where id = 'b0000000-0000-0000-0000-000000000003'$q$, 'denied');
select qa.expect('X-PATH-01', 'X tidak bisa set foto_ktp_url ke file org A', $q$update public.tenants set foto_ktp_url = (select org_a from qa.ids) || '/ktp_1700000000001.jpg' where id = 'b0000000-0000-0000-0000-000000000003'$q$, 'denied');
select qa.expect('X-PATH-02', 'X tidak bisa set foto_ktp_url ke path root', $q$update public.tenants set foto_ktp_url = 'ktp_yatim_1600000000000.jpg' where id = 'b0000000-0000-0000-0000-000000000003'$q$, 'denied');
select qa.expect('X-PATH-03', 'X tidak bisa set foto_ktp_url dengan ../', $q$update public.tenants set foto_ktp_url = 'b0000000-0000-0000-0000-00000000000b/../' || (select org_a from qa.ids) || '/ktp_1700000000001.jpg' where id = 'b0000000-0000-0000-0000-000000000003'$q$, 'denied');
select qa.expect('X-PATH-04', 'X tidak bisa insert penghuni baru dengan path org A', $q$insert into public.tenants (nama_lengkap, foto_ktp_url) values ('x', (select org_a from qa.ids) || '/ktp_1700000000001.jpg')$q$, 'denied');
select qa.expect('X-PATH-05', 'X tidak bisa set bukti_nota_url ke nota org A', $q$insert into public.expenses (tanggal_pengeluaran, kategori, nominal, bukti_nota_url) values (current_date, 'x', 1, (select org_a from qa.ids) || '/nota_1700000000003.jpg')$q$, 'denied');
select qa.expect('X-PATH-06', 'X boleh simpan ulang baris tanpa mengubah path', $q$update public.tenants set nama_lengkap = 'Penghuni B2' where id = 'b0000000-0000-0000-0000-000000000003'$q$, 'rows:1');
-- Keanggotaan
select qa.expect('X-MEM-01', 'X tidak bisa memasukkan dirinya ke org A', $q$insert into public.organization_members (org_id, user_id, role) values ((select org_a from qa.ids), '33333333-0000-0000-0000-000000000003', 'owner')$q$, 'denied');
select qa.expect('X-MEM-02', 'X tidak bisa memindah keanggotaannya ke org A', $q$update public.organization_members set org_id = (select org_a from qa.ids) where user_id = '33333333-0000-0000-0000-000000000003'$q$, (case when to_regprocedure('public.is_org_admin(uuid)') is null then 'rows:0' else 'denied' end));
select qa.expect('X-MEM-03', 'X tidak bisa menambah U ke org A', $q$insert into public.organization_members (org_id, user_id, role) values ((select org_a from qa.ids), '55555555-0000-0000-0000-000000000005', 'staff')$q$, 'denied');
select qa.expect('X-MEM-04', 'X tidak melihat anggota org A', $q$select * from public.organization_members where org_id = (select org_a from qa.ids)$q$, 'rows:0');
select qa.expect('X-MEM-05', 'X tidak bisa hapus anggota org A', $q$delete from public.organization_members where org_id = (select org_a from qa.ids)$q$, 'rows:0');
select qa.expect('X-MEM-06', 'X tidak bisa memindah anggota org B ke org A', $q$update public.organization_members set org_id = (select org_a from qa.ids) where org_id = 'b0000000-0000-0000-0000-00000000000b'$q$, (case when to_regprocedure('public.is_org_admin(uuid)') is null then 'rows:0' else 'denied' end));
select qa.expect('X-ORG-01', 'X tidak melihat organisasi A', $q$select * from public.organizations where id = (select org_a from qa.ids)$q$, 'rows:0');
select qa.expect('X-ORG-02', 'X tidak bisa ganti nama org A', $q$update public.organizations set name = 'hacked' where id = (select org_a from qa.ids)$q$, 'rows:0');
select qa.expect('X-ORG-03', 'X tidak bisa membuat organisasi', $q$insert into public.organizations (name) values ('baru')$q$, 'denied');
select qa.expect('X-ORG-04', 'X tidak bisa hapus organisasi', $q$delete from public.organizations$q$, 'denied');
-- Storage
select qa.expect('X-S-01', 'X tidak melihat KTP/nota org A', $q$select * from storage.objects where name like (select org_a from qa.ids)::text || '/%'$q$, 'rows:0');
select qa.expect('X-S-02', 'X tidak melihat file yatim di root', $q$select * from storage.objects where position('/' in name) = 0$q$, 'rows:0');
select qa.expect('X-S-03', 'X tidak bisa upload ke folder org A', $q$insert into storage.objects (bucket_id, name) values ('ktp_images', (select org_a from qa.ids) || '/evil.jpg')$q$, 'denied');
select qa.expect('X-S-04', 'X tidak bisa upload ke root', $q$insert into storage.objects (bucket_id, name) values ('ktp_images', 'evil.jpg')$q$, 'denied');
select qa.expect('X-S-05', 'X tidak bisa upload ke folder uid sendiri (pola bundle lama)', $q$insert into storage.objects (bucket_id, name) values ('ktp_images', '33333333-0000-0000-0000-000000000003/evil.jpg')$q$, 'denied');
select qa.expect('X-S-06', 'X tidak bisa upload ke folder org A huruf besar', $q$insert into storage.objects (bucket_id, name) values ('ktp_images', upper((select org_a from qa.ids)::text) || '/evil.jpg')$q$, 'denied');
select qa.expect('X-S-07', 'X tidak bisa menimpa file org A', $q$update storage.objects set metadata = '{}' where name like (select org_a from qa.ids)::text || '/%'$q$, 'rows:0');
select qa.expect('X-S-08', 'X tidak bisa memindah file org B ke folder org A', $q$update storage.objects set name = (select org_a from qa.ids) || '/moved.jpg' where name = 'b0000000-0000-0000-0000-00000000000b/ktp_b.jpg'$q$, 'denied');
select qa.expect('X-S-09', 'X tidak bisa hapus file org A', $q$delete from storage.objects where name like (select org_a from qa.ids)::text || '/%'$q$, 'rows:0');
reset role;

-- ---------------- P (partner, owner org A) ----------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}', false);
select qa.expect('P-POS-01', 'Partner melihat semua penghuni org A (termasuk yang diinput Rhesal)', $q$select * from public.tenants$q$, 'rows:3');
select qa.expect('P-POS-02', 'Partner melihat KTP yang diupload Rhesal (sudah dipindah)', $q$select * from storage.objects where name = (select org_a from qa.ids) || '/ktp_1700000000001.jpg'$q$, 'rows:1');
select qa.expect('P-POS-03', 'Partner melihat KTP dari bundle lama yang ikut dipindah', $q$select * from storage.objects where name = (select org_a from qa.ids) || '/ktp_baru.jpg'$q$, 'rows:1');
select qa.expect('P-POS-04', 'Partner melihat nota org A', $q$select * from storage.objects where bucket_id = 'receipt_images'$q$, 'rows:1');
select qa.expect('P-POS-05', 'Partner bisa hapus file KTP org A', $q$delete from storage.objects where name = (select org_a from qa.ids) || '/ktp_1700000000002.jpg'$q$, 'rows:1');
select qa.expect('P-NEG-01', 'Partner tidak melihat file yatim di root', $q$select * from storage.objects where name = 'ktp_yatim_1600000000000.jpg'$q$, 'rows:0');
select qa.expect('P-NEG-02', 'Partner tidak bisa hapus dirinya sendiri', $q$delete from public.organization_members where user_id = '22222222-0000-0000-0000-000000000002'$q$, 'rows:0');
select qa.expect('P-INFO-01', 'Partner menghapus Rhesal: bisa sebelum migration 500, ditolak sesudahnya', $q$delete from public.organization_members where user_id = '11111111-0000-0000-0000-000000000001'$q$, (case when to_regprocedure('public.is_org_admin(uuid)') is null then 'rows:1' else 'rows:0' end));
reset role;

-- ---------------- R (owner org A) ----------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}', false);
select qa.expect('R-POS-01', 'Rhesal bisa menambah U sebagai staff', $q$insert into public.organization_members (org_id, user_id, role) values ((select org_a from qa.ids), '55555555-0000-0000-0000-000000000005', 'staff')$q$, 'rows:1');
select qa.expect('R-NEG-01', 'Rhesal tidak bisa menarik X (anggota org B)', $q$insert into public.organization_members (org_id, user_id, role) values ((select org_a from qa.ids), '33333333-0000-0000-0000-000000000003', 'staff')$q$, 'error:23505 duplicate key value violates unique constraint "organization_members_user_id_key"');
select qa.expect('R-NEG-02', 'Rhesal tidak bisa memindah T ke org B', $q$update public.organization_members set org_id = 'b0000000-0000-0000-0000-00000000000b' where user_id = '44444444-0000-0000-0000-000000000004'$q$, 'denied');
select qa.expect('R-NEG-03', 'Rhesal tidak bisa upload dengan path uid lama setelah 300', $q$insert into storage.objects (bucket_id, name) values ('ktp_images', '11111111-0000-0000-0000-000000000001/lama.jpg')$q$, 'denied');
select qa.expect('R-NEG-05', 'Rhesal tidak bisa upload ke folder org sendiri huruf besar (f4a44d4)', $q$insert into storage.objects (bucket_id, name) values ('ktp_images', upper((select org_a from qa.ids)::text) || '/up.jpg')$q$, 'denied');
select qa.expect('R-NEG-04', 'Rhesal tidak bisa simpan path uid lama di tenants setelah 300', $q$insert into public.tenants (nama_lengkap, foto_ktp_url) values ('x', '11111111-0000-0000-0000-000000000001/lama.jpg')$q$, 'denied');
reset role;

-- ---------------- T (staff org A) ----------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-0000-0000-0000-000000000004","role":"authenticated"}', false);
select qa.expect('T-POS-01', 'Staff melihat data org A', $q$select * from public.locations$q$, 'rows:1');
select qa.expect('T-NEG-01', 'Staff tidak bisa menambah anggota', $q$insert into public.organization_members (org_id, user_id, role) values ((select org_a from qa.ids), '55555555-0000-0000-0000-000000000005', 'owner')$q$, 'denied');
select qa.expect('T-NEG-02', 'Staff tidak bisa menaikkan dirinya jadi owner', $q$update public.organization_members set role = 'owner' where user_id = '44444444-0000-0000-0000-000000000004'$q$, 'rows:0');
select qa.expect('T-NEG-03', 'Staff tidak bisa menghapus owner', $q$delete from public.organization_members where role = 'owner'$q$, 'rows:0');
select qa.expect('T-NEG-04', 'Staff tidak bisa ganti nama org', $q$update public.organizations set name = 'x'$q$, 'rows:0');
reset role;

-- ---------------- U (login, belum anggota org) ----------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-0000-0000-0000-000000000005","role":"authenticated"}', false);
select qa.expect('U-NEG-01', 'Akun tanpa org tidak melihat penghuni', $q$select * from public.tenants$q$, 'rows:0');
select qa.expect('U-NEG-02', 'Akun tanpa org tidak bisa insert lokasi', $q$insert into public.locations (nama_lokasi) values ('x')$q$, 'denied');
select qa.expect('U-NEG-03', 'Akun tanpa org tidak melihat file', $q$select * from storage.objects$q$, 'rows:0');
select qa.expect('U-NEG-04', 'Akun tanpa org tidak bisa menjadikan dirinya anggota', $q$insert into public.organization_members (org_id, user_id) values ((select org_a from qa.ids), '55555555-0000-0000-0000-000000000005')$q$, 'denied');
reset role;

-- ---------------- Konfigurasi ----------------
select qa.expect('CFG-01', 'Bucket private, 5 MB, JPEG/PNG/WEBP',
  $q$select * from storage.buckets where id in ('ktp_images','receipt_images') and not public and file_size_limit = 5242880 and allowed_mime_types = array['image/jpeg','image/png','image/webp']$q$, 'rows:2');
select qa.expect('CFG-02', 'RLS aktif di 7 tabel + 2 tabel org',
  $q$select * from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relrowsecurity and c.relname in ('locations','rooms','tenants','rentals','incomes','expenses','inventories','organizations','organization_members')$q$, 'rows:9');
select qa.expect('CFG-03', 'Policy live lama "Hanya user login..." & "Izinkan ... KTP" sudah hilang',
  $q$select * from pg_policies where policyname like 'Hanya user login%' or policyname like 'Izinkan%'$q$, 'rows:0');
select qa.expect('CFG-04', 'Kedua akun live anggota pengelola org SimKos (admin+owner)', $q$select * from public.organization_members where role in ('admin','owner') and org_id = (select org_a from qa.ids) and user_id in ('11111111-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000002')$q$, 'rows:2');
select qa.expect('CFG-05', 'Tidak ada referensi file di luar folder org', $q$select * from public.tenants where foto_ktp_url is not null and foto_ktp_url not like org_id::text || '/%'$q$, 'rows:0');
select qa.expect('CFG-06', 'Fungsi helper SECURITY DEFINER pakai search_path kosong',
  $q$select * from pg_proc where proname in ('is_org_member','is_org_owner','current_org_id') and prosecdef and proconfig @> array['search_path=""']$q$, 'rows:3');
