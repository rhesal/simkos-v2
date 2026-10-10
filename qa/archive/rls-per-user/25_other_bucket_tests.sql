-- Tes tambahan: bucket lain tidak terpengaruh guard (dipakai di S6).
set role anon;
select set_config('request.jwt.claims', '', false);
select qa.expect('OTH-01', 'anon tetap bisa baca bucket publik lain (avatars)',
  $q$select * from storage.objects where bucket_id = 'avatars'$q$, 'rows:1');
reset role;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', false);
select qa.expect('OTH-02', 'A tetap bisa baca bucket publik lain (avatars) milik B',
  $q$select * from storage.objects where bucket_id = 'avatars'$q$, 'rows:1');
select qa.expect('POS-S-03', 'A bisa hapus file KTP miliknya',
  $q$delete from storage.objects where name = 'aaaaaaaa-0000-0000-0000-00000000000a/ktp_a.jpg'$q$, 'rows:1');
reset role;
