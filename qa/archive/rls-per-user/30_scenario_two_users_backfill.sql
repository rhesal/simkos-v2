-- QA skenario S2: DB live sudah punya >1 user dan data lama tanpa owner_id
-- saat migration 200 dijalankan. Diharapkan (AC usulan QA): data lama tetap
-- terlihat oleh pemiliknya setelah deploy, tanpa langkah manual terlupa.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', false);
select qa.expect('S2-01', 'Pemilik (A) masih melihat lokasi lama setelah migration',
  $q$select * from public.locations where nama_lokasi = 'Kos Lama'$q$, 'rows:1');
select qa.expect('S2-02', 'Pemilik (A) masih melihat penghuni lama (dengan KTP) setelah migration',
  $q$select * from public.tenants where nama_lengkap = 'Penghuni Lama'$q$, 'rows:1');
reset role;
select qa.expect('S2-03', 'owner_id NOT NULL di 7 tabel setelah migration',
  $q$select * from information_schema.columns where table_schema='public' and column_name='owner_id' and is_nullable='NO' and table_name in ('locations','rooms','tenants','rentals','incomes','expenses','inventories')$q$, 'rows:7');
