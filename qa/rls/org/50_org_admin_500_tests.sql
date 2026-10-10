-- QA migration 500 (peran admin). Dijalankan SETELAH 200 -> 210 -> move -> 300 -> 10_seed_org2 -> 500
-- dengan simkos.admin_user_id = u1. org1: u1 admin, u2 owner. org2: c owner, s staff (tanpa admin).
-- Setup tambahan (superuser): org3 berisi satu admin saja, untuk tes hapus org (cascade).
insert into auth.users (id, email) values ('eeeeeeee-0000-0000-0000-00000000000e', 'admin-org3@example.test');
insert into public.organizations (id, name) values ('b0000000-0000-0000-0000-0000000000b3', 'Org3');
insert into public.organization_members (org_id, user_id, role)
  values ('b0000000-0000-0000-0000-0000000000b3', 'eeeeeeee-0000-0000-0000-00000000000e', 'admin');

-- Admin org1 (u1) --------------------------------------------------------------
set role authenticated;
select qa.as_user('u1');
select qa.expect('ADM-01', 'admin menurunkan owner (u2) jadi staff',
  format($q$update public.organization_members set role = 'staff' where user_id = '%s'$q$, qa.id('u2')), 'rows:1');
select qa.expect('ADM-02', 'admin TIDAK bisa menaikkan anggota jadi admin',
  format($q$update public.organization_members set role = 'admin' where user_id = '%s'$q$, qa.id('u2')), 'denied');
select qa.expect('ADM-03', 'admin tidak bisa mengubah perannya sendiri',
  format($q$update public.organization_members set role = 'owner' where user_id = '%s'$q$, qa.id('u1')), 'rows:0');
select qa.expect('ADM-04', 'admin tidak bisa memindah org_id anggota (hanya kolom role yang boleh)',
  format($q$update public.organization_members set org_id = '%s' where user_id = '%s'$q$, qa.id('org2'), qa.id('u2')), 'denied');
select qa.expect('ADM-05', 'admin tidak bisa mengganti user_id anggota',
  format($q$update public.organization_members set user_id = '%s' where user_id = '%s'$q$, qa.id('d'), qa.id('u2')), 'denied');
select qa.expect('ADM-06', 'admin mengeluarkan owner (u2)',
  format($q$delete from public.organization_members where user_id = '%s'$q$, qa.id('u2')), 'rows:1');
select qa.expect('ADM-07', 'admin tidak bisa keluar sendiri',
  format($q$delete from public.organization_members where user_id = '%s'$q$, qa.id('u1')), 'rows:0');
select qa.expect('ADM-08', 'admin menambah user baru sebagai owner',
  format($q$insert into public.organization_members (org_id, user_id, role) values ('%s','%s','owner')$q$, qa.id('org1'), qa.id('d')), 'rows:1');
select qa.expect('ADM-09', 'admin menambah user baru sebagai staff',
  format($q$insert into public.organization_members (org_id, user_id, role) values ('%s','%s','staff')$q$, qa.id('org1'), qa.id('d')), 'rows:1');
select qa.expect('ADM-10', 'admin TIDAK bisa menambah user sebagai admin',
  format($q$insert into public.organization_members (org_id, user_id, role) values ('%s','%s','admin')$q$, qa.id('org1'), qa.id('d')), 'denied');
select qa.expect('ADM-11', 'insert tanpa role (default owner) tetap boleh',
  format($q$insert into public.organization_members (org_id, user_id) values ('%s','%s')$q$, qa.id('org1'), qa.id('d')), 'rows:1');
select qa.expect('ADM-12', 'admin org1 tidak bisa menambah anggota ke org2',
  format($q$insert into public.organization_members (org_id, user_id, role) values ('%s','%s','owner')$q$, qa.id('org2'), qa.id('d')), 'denied');
select qa.expect('ADM-13', 'admin org1 tidak bisa mengubah/menghapus anggota org2',
  format($q$delete from public.organization_members where org_id = '%s'$q$, qa.id('org2')), 'rows:0');
select qa.expect('ADM-14', 'admin tetap bisa membaca data kos (penghuni org1)',
  'select 1 from public.tenants limit 1', 'rows:1');
select qa.expect('ADM-15', 'admin boleh ganti nama org',
  format($q$update public.organizations set name = 'SimKos' where id = '%s'$q$, qa.id('org1')), 'rows:1');
select qa.expect('ADM-16', 'admin membaca daftar anggota org1',
  'select * from public.organization_members', 'rows:2');

-- Owner org1 (u2) ------------------------------------------------------------------
select qa.as_user('u2');
select qa.expect('OWN-01', 'owner TIDAK bisa menurunkan admin',
  format($q$update public.organization_members set role = 'staff' where user_id = '%s'$q$, qa.id('u1')), 'rows:0');
select qa.expect('OWN-02', 'owner TIDAK bisa mengeluarkan admin',
  format($q$delete from public.organization_members where user_id = '%s'$q$, qa.id('u1')), 'rows:0');
select qa.expect('OWN-03', 'owner TIDAK bisa menaikkan dirinya jadi admin',
  format($q$update public.organization_members set role = 'admin' where user_id = '%s'$q$, qa.id('u2')), 'rows:0');
select qa.expect('OWN-04', 'owner TIDAK bisa menambah anggota',
  format($q$insert into public.organization_members (org_id, user_id, role) values ('%s','%s','staff')$q$, qa.id('org1'), qa.id('d')), 'denied');
select qa.expect('OWN-05', 'owner TIDAK bisa keluar sendiri',
  format($q$delete from public.organization_members where user_id = '%s'$q$, qa.id('u2')), 'rows:0');
select qa.expect('OWN-06', 'owner tetap bisa membaca & mengubah data kos',
  $q$update public.tenants set nama_lengkap = nama_lengkap where id = 'a2000000-0000-0000-0000-000000000001'$q$, 'rows:1');
select qa.expect('OWN-07', 'owner tetap boleh ganti nama org',
  format($q$update public.organizations set name = 'SimKos' where id = '%s'$q$, qa.id('org1')), 'rows:1');

-- org2 (tanpa admin) ----------------------------------------------------------------
select qa.as_user('c');
select qa.expect('ORG2-01', 'owner org2 (tanpa admin) tidak bisa menambah anggota',
  format($q$insert into public.organization_members (org_id, user_id, role) values ('%s','%s','staff')$q$, qa.id('org2'), qa.id('d')), 'denied');
select qa.expect('ORG2-02', 'owner org2 tidak bisa menurunkan staff/ menaikkan diri',
  format($q$update public.organization_members set role = 'admin' where user_id = '%s'$q$, qa.id('c')), 'rows:0');
select qa.as_user('s');
select qa.expect('ORG2-03', 'staff tidak bisa menaikkan dirinya jadi owner/admin',
  format($q$update public.organization_members set role = 'owner' where user_id = '%s'$q$, qa.id('s')), 'rows:0');

set role anon;
select set_config('request.jwt.claims', '', false);
select qa.expect('ANON-01', 'anon tidak bisa membaca anggota',
  'select * from public.organization_members', 'denied');
reset role;
select set_config('request.jwt.claims', '', false);

-- Guard admin terakhir (superuser / service role) --------------------------------------
select qa.expect('GRD-01', 'service role tidak bisa menghapus admin terakhir org1',
  format($q$delete from public.organization_members where user_id = '%s'$q$, qa.id('u1')), 'denied');
select qa.expect('GRD-02', 'service role tidak bisa menurunkan admin terakhir',
  format($q$update public.organization_members set role = 'owner' where user_id = '%s'$q$, qa.id('u1')), 'denied');
select qa.expect('GRD-03', 'service role tidak bisa memindah admin terakhir ke org lain',
  format($q$update public.organization_members set org_id = '%s' where user_id = '%s'$q$, qa.id('org2'), qa.id('u1')), 'denied');
select qa.expect('GRD-04', 'hapus auth user admin terakhir (cascade) juga ditahan',
  format($q$delete from auth.users where id = '%s'$q$, qa.id('u1')), 'denied');
select qa.expect('GRD-05', 'ganti admin lewat SQL: naikkan u2 dulu, lalu turunkan u1 -> boleh',
  format($q$do $d$ begin
     update public.organization_members set role = 'admin' where user_id = '%s';
     update public.organization_members set role = 'owner' where user_id = '%s';
   end $d$$q$, qa.id('u2'), qa.id('u1')), 'rows:0');
select qa.expect('GRD-06', 'hapus org yang hanya berisi admin (cascade) tidak ditahan guard',
  $q$delete from public.organizations where id = 'b0000000-0000-0000-0000-0000000000b3'$q$, 'rows:1');
select qa.expect('GRD-07', 'role di luar admin/owner/staff ditolak constraint',
  format($q$update public.organization_members set role = 'superadmin' where user_id = '%s'$q$, qa.id('u2')),
  'error:23514 new row for relation "organization_members" violates check constraint "organization_members_role_check"');
