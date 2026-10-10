-- QA independen: migration 500 (peran admin). A=1111 admin, B=2222 owner, S=4444 staff (org A); X=3333 owner org B.
create or replace function qa.as_user(uid text) returns void language plpgsql as $f$
begin perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false); end $f$;
grant execute on function qa.as_user(text) to authenticated;
select qa.expect('ADM-00', 'Rhesal (1111) jadi admin, owner/staff lain tetap', $q$select 1 from public.organization_members where (user_id='11111111-0000-0000-0000-000000000001' and role='admin') or (user_id='22222222-0000-0000-0000-000000000002' and role='owner') or (user_id='44444444-0000-0000-0000-000000000004' and role='staff')$q$, 'rows:3');

set role authenticated; select qa.as_user('11111111-0000-0000-0000-000000000001');
select qa.expect('ADM-01', 'Admin turunkan owner jadi staff', $q$update public.organization_members set role='staff' where user_id='22222222-0000-0000-0000-000000000002'$q$, 'rows:1');
select qa.expect('ADM-02', 'Admin naikkan staff jadi owner', $q$update public.organization_members set role='owner' where user_id='44444444-0000-0000-0000-000000000004'$q$, 'rows:1');
select qa.expect('ADM-03', 'Admin TIDAK bisa menjadikan orang lain admin lewat API', $q$update public.organization_members set role='admin' where user_id='22222222-0000-0000-0000-000000000002'$q$, 'denied');
select qa.expect('ADM-04', 'Admin keluarkan owner', $q$delete from public.organization_members where user_id='22222222-0000-0000-0000-000000000002'$q$, 'rows:1');
select qa.expect('ADM-05', 'Admin tidak bisa hapus dirinya', $q$delete from public.organization_members where user_id='11111111-0000-0000-0000-000000000001'$q$, 'rows:0');
select qa.expect('ADM-06', 'Admin tidak bisa turunkan dirinya', $q$update public.organization_members set role='owner' where user_id='11111111-0000-0000-0000-000000000001'$q$, 'rows:0');
select qa.expect('ADM-07', 'Admin tidak bisa ubah user_id baris anggota (grant kolom)', $q$update public.organization_members set user_id='33333333-0000-0000-0000-000000000003' where user_id='22222222-0000-0000-0000-000000000002'$q$, 'denied');
select qa.expect('ADM-08', 'Admin tidak bisa pindahkan anggota ke org lain (grant kolom)', $q$update public.organization_members set org_id='b0000000-0000-0000-0000-00000000000b' where user_id='22222222-0000-0000-0000-000000000002'$q$, 'denied');
select qa.expect('ADM-09', 'Admin org A tidak bisa ubah anggota org B', $q$update public.organization_members set role='staff' where user_id='33333333-0000-0000-0000-000000000003'$q$, 'rows:0');
select qa.expect('ADM-10', 'Admin org A tidak bisa hapus anggota org B', $q$delete from public.organization_members where user_id='33333333-0000-0000-0000-000000000003'$q$, 'rows:0');
select qa.expect('ADM-11', 'Admin tidak bisa insert anggota ke org B', $q$insert into public.organization_members (org_id, user_id, role) values ('b0000000-0000-0000-0000-00000000000b', '22222222-0000-0000-0000-000000000002', 'owner')$q$, 'denied');
select qa.expect('ADM-12', 'Admin tidak bisa insert anggota baru sebagai admin', $q$insert into public.organization_members (org_id, user_id, role) select org_a, '55555555-0000-0000-0000-000000000005', 'admin' from qa.ids$q$, 'denied');
select qa.expect('ADM-13', 'Admin tetap akses data kos org A', $q$select 1 from public.locations where org_id=(select org_a from qa.ids) limit 1$q$, 'rows:1');
select qa.expect('ADM-14', 'Admin ganti nama org', $q$update public.organizations set name='SimKos' where id=(select org_a from qa.ids)$q$, 'rows:1');
select qa.expect('ADM-15', 'is_org_admin(org B) = false bagi admin org A', $q$select 1 where public.is_org_admin('b0000000-0000-0000-0000-00000000000b')$q$, 'rows:0');

select qa.as_user('22222222-0000-0000-0000-000000000002');
select qa.expect('OWN-01', 'Owner tidak bisa turunkan admin', $q$update public.organization_members set role='staff' where user_id='11111111-0000-0000-0000-000000000001'$q$, 'rows:0');
select qa.expect('OWN-02', 'Owner tidak bisa hapus admin', $q$delete from public.organization_members where user_id='11111111-0000-0000-0000-000000000001'$q$, 'rows:0');
select qa.expect('OWN-03', 'Owner tidak bisa naikkan dirinya jadi admin', $q$update public.organization_members set role='admin' where user_id='22222222-0000-0000-0000-000000000002'$q$, 'rows:0');
select qa.expect('OWN-04', 'Owner tidak bisa naikkan staff jadi admin/owner', $q$update public.organization_members set role='admin' where user_id='44444444-0000-0000-0000-000000000004'$q$, 'rows:0');
select qa.expect('OWN-05', 'Owner tidak bisa hapus staff', $q$delete from public.organization_members where user_id='44444444-0000-0000-0000-000000000004'$q$, 'rows:0');
select qa.expect('OWN-06', 'Owner tidak bisa tambah anggota', $q$insert into public.organization_members (org_id, user_id, role) select org_a, '55555555-0000-0000-0000-000000000005', 'staff' from qa.ids$q$, 'denied');
select qa.expect('OWN-07', 'Owner tetap bisa ganti nama org', $q$update public.organizations set name='SimKos' where id=(select org_a from qa.ids)$q$, 'rows:1');
select qa.expect('OWN-08', 'Owner tetap akses data kos', $q$select 1 from public.locations where org_id=(select org_a from qa.ids) limit 1$q$, 'rows:1');
select qa.expect('OWN-09', 'Owner tetap lihat daftar anggota org', $q$select 1 from public.organization_members where org_id=(select org_a from qa.ids)$q$, 'rows:3');

select qa.as_user('44444444-0000-0000-0000-000000000004');
select qa.expect('STF-01', 'Staff tidak bisa naikkan dirinya jadi admin', $q$update public.organization_members set role='admin' where user_id='44444444-0000-0000-0000-000000000004'$q$, 'rows:0');
select qa.expect('STF-02', 'Staff tidak bisa naikkan dirinya jadi owner', $q$update public.organization_members set role='owner' where user_id='44444444-0000-0000-0000-000000000004'$q$, 'rows:0');
select qa.expect('STF-03', 'Staff tidak bisa hapus owner', $q$delete from public.organization_members where user_id='22222222-0000-0000-0000-000000000002'$q$, 'rows:0');
select qa.expect('STF-04', 'Staff tidak bisa ganti nama org', $q$update public.organizations set name='x' where id=(select org_a from qa.ids)$q$, 'rows:0');

select qa.as_user('33333333-0000-0000-0000-000000000003');
select qa.expect('X-01', 'Owner org B tidak melihat anggota org A', $q$select 1 from public.organization_members where org_id=(select org_a from qa.ids)$q$, 'rows:0');
select qa.expect('X-02', 'Owner org B (tanpa admin) tidak bisa ubah anggota org B', $q$update public.organization_members set role='staff' where user_id='33333333-0000-0000-0000-000000000003'$q$, 'rows:0');
reset role;

set role anon; select set_config('request.jwt.claims', '{"role":"anon"}', false);
select qa.expect('ANON-01', 'Anon tidak bisa ubah anggota', $q$update public.organization_members set role='owner'$q$, 'denied');
reset role;

-- Guard admin terakhir (superuser / SQL Editor)
select qa.expect('GRD-01', 'SQL Editor: turunkan admin terakhir ditolak', $q$update public.organization_members set role='owner' where user_id='11111111-0000-0000-0000-000000000001'$q$, 'denied');
select qa.expect('GRD-02', 'SQL Editor: hapus admin terakhir ditolak', $q$delete from public.organization_members where user_id='11111111-0000-0000-0000-000000000001'$q$, 'denied');
select qa.expect('GRD-03', 'Hapus akun auth admin terakhir ditolak', $q$delete from auth.users where id='11111111-0000-0000-0000-000000000001'$q$, 'denied');
select qa.expect('GRD-04', 'Pindah admin terakhir ke org lain ditolak', $q$update public.organization_members set org_id='b0000000-0000-0000-0000-00000000000b' where user_id='11111111-0000-0000-0000-000000000001'$q$, 'denied');
select qa.expect('GRD-05', 'Dengan admin kedua, admin pertama boleh diturunkan', $q$with x as (update public.organization_members set role='admin' where user_id='22222222-0000-0000-0000-000000000002' returning 1) select 1$q$, 'rows:1');
insert into public.organizations (id, name) values ('c0000000-0000-0000-0000-00000000000c', 'QA kosong');
update public.organization_members set org_id='c0000000-0000-0000-0000-00000000000c', role='owner' where user_id='44444444-0000-0000-0000-000000000004';
update public.organization_members set role='admin' where user_id='44444444-0000-0000-0000-000000000004';
select qa.expect('GRD-06', 'Hapus org (cascade) tidak diblok guard admin terakhir', $q$delete from public.organizations where id='c0000000-0000-0000-0000-00000000000c'$q$, 'rows:1');
delete from public.organizations where id='c0000000-0000-0000-0000-00000000000c';
insert into public.organization_members (org_id, user_id, role) select org_a, '44444444-0000-0000-0000-000000000004', 'staff' from qa.ids;
