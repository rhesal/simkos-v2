-- Tes tambahan (dipakai di skenario policy permisif + guard): bucket lain tidak terpengaruh guard.
set role anon;
select set_config('request.jwt.claims', '', false);
select qa.expect('OTH-01', 'anon tetap bisa baca bucket publik lain (avatars)',
  $q$select * from storage.objects where bucket_id = 'avatars'$q$, 'rows:1');
reset role;
set role authenticated;
select qa.as_user('c');
select qa.expect('OTH-02', 'owner org2 tetap bisa baca bucket publik lain (avatars)',
  $q$select * from storage.objects where bucket_id = 'avatars'$q$, 'rows:1');
reset role;
