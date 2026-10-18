-- QA independen: migration 600 (pindah_kamar, daftar_penghuni). Ditulis QA, terpisah dari tes Coding Buddy.
-- Aktor: 1111 admin org A, 2222 owner org A, 3333 owner org B, 5555 login tanpa org.
create or replace function qa.as_user(uid text) returns void language plpgsql as $f$
begin perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false); end $f$;
grant execute on function qa.as_user(text) to authenticated;
create or replace function qa.expect_like(test_id text, descr text, sql text, pat text) returns void language plpgsql as $$
declare actual text;
begin
  actual := qa.try(sql);
  insert into qa.results (test_id, descr, actor, expected, actual, pass)
  values (test_id, descr, current_user || coalesce(' sub=' || auth.uid()::text, ''), 'like ' || pat, actual, actual like pat);
end $$;
grant execute on function qa.expect_like(text, text, text, text) to anon, authenticated;
create or replace function qa.check(test_id text, descr text, cond boolean) returns void language sql as $$
  insert into qa.results (test_id, descr, actor, expected, actual, pass) values ($1, $2, current_user, 'true', coalesce($3::text,'null'), coalesce($3,false)) $$;
grant execute on function qa.check(text, text, boolean) to anon, authenticated;

-- Data uji org A: lokasi kedua + kamar. Kamar '1' (a..02) Terisi oleh rental a..04 (jatuh tempo current_date+30).
insert into public.locations (id, nama_lokasi, org_id) select 'a0000000-0000-0000-0000-000000000021', 'Kos Dua', org_a from qa.ids;
insert into public.rooms (id, location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar, org_id) select v.id::uuid, v.loc::uuid, v.no, 1, v.harga, v.st, org_a from qa.ids,
 (values ('a0000000-0000-0000-0000-000000000022','a0000000-0000-0000-0000-000000000001','2',1000000,'Kosong'),
         ('a0000000-0000-0000-0000-000000000023','a0000000-0000-0000-0000-000000000021','7',1500000,'Kosong'),
         ('a0000000-0000-0000-0000-000000000024','a0000000-0000-0000-0000-000000000001','3',1000000,'Terisi'),
         ('a0000000-0000-0000-0000-000000000025','a0000000-0000-0000-0000-000000000001','4',1000000,'Kosong'),
         ('a0000000-0000-0000-0000-000000000026','a0000000-0000-0000-0000-000000000001','5',1000000,'Kosong'),
         ('a0000000-0000-0000-0000-000000000027','a0000000-0000-0000-0000-000000000001','6',1000000,'Kosong')) v(id,loc,no,harga,st);
-- penghuni kamar 3 (untuk tes 'kamar terisi' dan race)
insert into public.tenants (id, nama_lengkap, org_id) select 'a0000000-0000-0000-0000-000000000033', 'Penghuni Tiga', org_a from qa.ids;
insert into public.rentals (id, room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo, org_id)
  select 'a0000000-0000-0000-0000-000000000034', 'a0000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000033', 'harian', current_date - 3, current_date + 4, org_a from qa.ids;
update public.rentals set org_id = (select org_a from qa.ids) where org_id is null;

-- ===== Otorisasi / RLS =====
set role anon; select set_config('request.jwt.claims', '{"role":"anon"}', false);
select qa.expect('PK-ANON', 'Anon tidak bisa execute pindah_kamar', $q$select public.pindah_kamar('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000022',current_date,null)$q$, 'denied');
select qa.expect('DP-ANON', 'Anon tidak bisa execute daftar_penghuni', $q$select public.daftar_penghuni('a0000000-0000-0000-0000-000000000022','X','1',null,null,'bulanan',current_date,current_date+30)$q$, 'denied');
reset role;

set role authenticated;
select qa.as_user('33333333-0000-0000-0000-000000000003');
select qa.expect_like('PK-XORG-1', 'Owner org B tidak bisa memindah sewa org A', $q$select public.pindah_kamar('a0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000002',current_date,null)$q$, 'error:P0001 Data sewa tidak ditemukan%');
select qa.expect_like('DP-XORG', 'Owner org B tidak bisa daftar ke kamar org A', $q$select public.daftar_penghuni('a0000000-0000-0000-0000-000000000022','X','1',null,null,'bulanan',current_date,current_date+30)$q$, 'error:P0001 Kamar tidak ditemukan%');
select qa.as_user('55555555-0000-0000-0000-000000000005');
select qa.expect_like('PK-NOORG', 'User tanpa org tidak bisa memindah', $q$select public.pindah_kamar('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000022',current_date,null)$q$, 'error:P0001 Data sewa tidak ditemukan%');

select qa.as_user('11111111-0000-0000-0000-000000000001');
select qa.expect_like('PK-XORG-2', 'Admin org A tidak bisa memindah ke kamar org B (tak terlihat)', $q$select public.pindah_kamar('a0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000002',current_date,null)$q$, 'error:P0001 Kamar tujuan tidak ditemukan%');
select qa.expect_like('PK-TERISI', 'Tolak kamar tujuan Terisi', $q$select public.pindah_kamar('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000024',current_date,null)$q$, 'error:P0001 Kamar tujuan sudah terisi%');
select qa.expect_like('CK-LOWER', 'Constraint: kamar baru status ''kosong'' huruf kecil (form lama) ditolak', $q$insert into public.rooms (location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar, org_id) select 'a0000000-0000-0000-0000-000000000001','X',1,1,'kosong',org_a from qa.ids$q$, 'error:23514%rooms_status_kamar_check%');
select qa.expect_like('CK-LAIN', 'Constraint: status ''lunas''/''Perbaikan'' ditolak', $q$update public.rooms set status_kamar='lunas' where id='a0000000-0000-0000-0000-000000000025'$q$, 'error:23514%rooms_status_kamar_check%');
select qa.expect('NEWROOM', 'Kamar baru (payload Tambah Kamar baru: Kosong) langsung bisa didaftari penghuni', $q$with k as (insert into public.rooms (location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar, org_id) select 'a0000000-0000-0000-0000-000000000001','Baru',0,900000,'Kosong',org_a from qa.ids returning id) select public.daftar_penghuni((select id from k),'Tamu Baru','08',null,null,'bulanan',current_date,current_date+30)$q$, 'rows:1');
select qa.expect_like('PK-SAMA', 'Tolak kamar tujuan = kamar sekarang', $q$select public.pindah_kamar('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000002',current_date,null)$q$, 'error:P0001 Kamar tujuan sama%');
select qa.expect_like('PK-TGL', 'Tolak tanggal pindah sebelum tanggal masuk', $q$select public.pindah_kamar('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000022',current_date-1,null)$q$, 'error:P0001 Tanggal pindah tidak boleh%');
select qa.expect_like('PK-NULL', 'Tolak input kosong', $q$select public.pindah_kamar('a0000000-0000-0000-0000-000000000004',null,current_date,null)$q$, 'error:P0001 Data pindah kamar belum lengkap%');
select qa.expect_like('PK-NOROOM', 'Tolak kamar yang tidak ada', $q$select public.pindah_kamar('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-0000000000ff',current_date,null)$q$, 'error:P0001 Kamar tujuan tidak ditemukan%');
reset role;
select qa.expect_like('PK-BEDAORG-SU', 'Service role/SQL Editor (lihat semua org): tetap tolak kamar org lain', $q$select public.pindah_kamar('a0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000002',current_date,null)$q$, 'error:P0001 Kamar tujuan bukan milik organisasi%');
select qa.check('PK-NOCHANGE', 'Semua penolakan di atas tidak mengubah data', (select status_aktif from public.rentals where id='a0000000-0000-0000-0000-000000000004') and (select count(*) from public.rentals)=2);

-- ===== Happy path: pindah antar lokasi, kamar 1 (Kos Lama) -> kamar 7 (Kos Dua), harga beda =====
set role authenticated; select qa.as_user('11111111-0000-0000-0000-000000000001');
select set_config('qa.new_rental', public.pindah_kamar('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000023',current_date+5,'  AC rusak  ')::text, false);
reset role;
select qa.check('PK-01', 'Sewa lama ditutup: status_aktif=false, tanggal_keluar=tanggal pindah', (select not status_aktif and tanggal_keluar = current_date+5 from public.rentals where id='a0000000-0000-0000-0000-000000000004'));
select qa.check('PK-02', 'Jatuh tempo sewa baru = jatuh tempo lama (tidak bergeser ke tanggal pindah)', (select n.tanggal_jatuh_tempo = o.tanggal_jatuh_tempo and n.tanggal_jatuh_tempo = current_date+30 from public.rentals n, public.rentals o where n.id=current_setting('qa.new_rental')::uuid and o.id='a0000000-0000-0000-0000-000000000004'));
select qa.check('PK-03', 'Sewa baru: penghuni, tipe sewa, org sama; tanggal_masuk=tanggal pindah; aktif; kamar 7', (select n.tenant_id=o.tenant_id and n.tipe_sewa=o.tipe_sewa and n.org_id=o.org_id and n.tanggal_masuk=current_date+5 and n.status_aktif and n.room_id='a0000000-0000-0000-0000-000000000023' from public.rentals n, public.rentals o where n.id=current_setting('qa.new_rental')::uuid and o.id='a0000000-0000-0000-0000-000000000004'));
select qa.check('PK-04', 'Kamar lama Kosong, kamar baru Terisi', (select status_kamar from public.rooms where id='a0000000-0000-0000-0000-000000000002')='Kosong' and (select status_kamar from public.rooms where id='a0000000-0000-0000-0000-000000000023')='Terisi');
select qa.check('PK-05', 'Pemasukan lama tetap di sewa lama', (select rental_id from public.incomes where id='a0000000-0000-0000-0000-000000000005')='a0000000-0000-0000-0000-000000000004');
select qa.check('PK-06', 'Data penghuni & KTP tidak berubah, tidak ada penghuni baru', (select foto_ktp_url from public.tenants where id='a0000000-0000-0000-0000-000000000003') like '%ktp_1700000000001.jpg' and (select count(*) from public.tenants where nama_lengkap='Penghuni Rhesal')=1);
select qa.check('PK-07', 'Catatan: "Pindah ke kamar 7: AC rusak" & "Pindah dari kamar 1: AC rusak" (alasan di-trim)', (select catatan from public.rentals where id='a0000000-0000-0000-0000-000000000004')='Pindah ke kamar 7: AC rusak' and (select catatan from public.rentals where id=current_setting('qa.new_rental')::uuid)='Pindah dari kamar 1: AC rusak');
select qa.check('PK-08', 'Harga sewa tidak diprorata: tidak ada pemasukan/tagihan baru dibuat', (select count(*) from public.incomes)=1);

set role authenticated; select qa.as_user('22222222-0000-0000-0000-000000000002');
select qa.expect_like('PK-STALE', 'Pindah ulang memakai id sewa lama (layar basi) ditolak', $q$select public.pindah_kamar('a0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000022',current_date+5,null)$q$, 'error:P0001 Sewa ini sudah tidak aktif%');
select qa.expect('PK-BACK', 'Partner bisa memindah lagi (7 -> 1, kembali ke kamar semula)', format($q$select public.pindah_kamar(%L,'a0000000-0000-0000-0000-000000000002',current_date+6,null)$q$, current_setting('qa.new_rental')), 'rows:1');
-- Bypass RPC lewat REST tetap dijaga unique index
select qa.expect_like('IDX-ROOM', 'Insert sewa aktif kedua ke kamar terisi lewat REST ditolak index', $q$insert into public.rentals (room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo, org_id) select 'a0000000-0000-0000-0000-000000000023','a0000000-0000-0000-0000-000000000013','bulanan',current_date,current_date+30,org_a from qa.ids$q$, 'error:23505%rentals_one_active_per_room%');
select qa.expect_like('IDX-TENANT', 'Aktifkan lagi sewa lama penghuni yang sudah pindah lewat REST ditolak index', $q$update public.rentals set status_aktif=true where id='a0000000-0000-0000-0000-000000000004'$q$, 'error:23505%rentals_one_active_per_tenant%');

-- ===== daftar_penghuni =====
select qa.expect_like('DP-TERISI', 'Daftar ke kamar Terisi ditolak', $q$select public.daftar_penghuni('a0000000-0000-0000-0000-000000000024','Baru','08',null,null,'bulanan',current_date,current_date+30)$q$, 'error:P0001 Kamar ini sudah terisi%');
select qa.expect_like('DP-TEMPO', 'Jatuh tempo < tanggal masuk ditolak', $q$select public.daftar_penghuni('a0000000-0000-0000-0000-000000000022','Baru','08',null,null,'bulanan',current_date,current_date-1)$q$, 'error:P0001 Tanggal jatuh tempo%');
select qa.expect_like('DP-NAMA', 'Nama hanya spasi ditolak', $q$select public.daftar_penghuni('a0000000-0000-0000-0000-000000000022','   ','08',null,null,'bulanan',current_date,current_date+30)$q$, 'error:P0001 Data pendaftaran belum lengkap%');
select qa.expect('DP-KTP-XORG', 'Path KTP milik org B ditolak trigger storage, tidak ada yang tersimpan', $q$select public.daftar_penghuni('a0000000-0000-0000-0000-000000000022','Baru','08',null,'b0000000-0000-0000-0000-00000000000b/ktp_b.jpg','bulanan',current_date,current_date+30)$q$, 'denied');
select qa.expect_like('DP-TIPE', 'tipe_sewa di luar bulanan/harian ditolak', $q$select public.daftar_penghuni('a0000000-0000-0000-0000-000000000022','Baru','08',null,null,'mingguan',current_date,current_date+30)$q$, 'error:P0001 Tipe sewa harus%');
select set_config('qa.new_tenant', public.daftar_penghuni('a0000000-0000-0000-0000-000000000022',' Budi ',' 0812 ','',(select org_a::text from qa.ids)||'/ktp_budi.jpg','bulanan',current_date,current_date+30)::text, false);
reset role;
select qa.check('DP-01', 'Daftar sukses: penghuni (nama trim, kontak kosong->null, org A), sewa aktif, kamar 2 Terisi', (select t.nama_lengkap='Budi' and t.nomor_hp='0812' and t.kontak_darurat is null and t.org_id=(select org_a from qa.ids) from public.tenants t where id=current_setting('qa.new_tenant')::uuid) and (select count(*) from public.rentals where tenant_id=current_setting('qa.new_tenant')::uuid and status_aktif and room_id='a0000000-0000-0000-0000-000000000022')=1 and (select status_kamar from public.rooms where id='a0000000-0000-0000-0000-000000000022')='Terisi');
select qa.check('DP-ATOMIC', 'Pendaftaran yang ditolak tidak meninggalkan penghuni setengah jadi', (select count(*) from public.tenants where nama_lengkap='Baru')=0);

-- ===== checkout_sewa =====
set role anon; select set_config('request.jwt.claims', '{"role":"anon"}', false);
select qa.expect('CO-ANON', 'Anon tidak bisa execute checkout_sewa', $q$select public.checkout_sewa('a0000000-0000-0000-0000-000000000034',current_date,'Bersih',null)$q$, 'denied');
reset role; set role authenticated; select qa.as_user('33333333-0000-0000-0000-000000000003');
select qa.expect_like('CO-XORG', 'Owner org B tidak bisa checkout sewa org A', $q$select public.checkout_sewa('a0000000-0000-0000-0000-000000000034',current_date,'Bersih',null)$q$, 'error:P0001 Data sewa tidak ditemukan%');
select qa.as_user('11111111-0000-0000-0000-000000000001');
select qa.expect_like('CO-REP', 'Reputasi di luar whitelist ditolak', $q$select public.checkout_sewa('a0000000-0000-0000-0000-000000000034',current_date,'Jelek',null)$q$, 'error:P0001 Status reputasi harus%');
select qa.expect_like('CO-TGL', 'Tanggal checkout sebelum tanggal masuk ditolak', $q$select public.checkout_sewa('a0000000-0000-0000-0000-000000000034',current_date-10,'Bersih',null)$q$, 'error:P0001 Tanggal checkout%');
select qa.expect('CO-OK-RB', 'Checkout sukses (dicek di subtransaksi)', $q$select public.checkout_sewa('a0000000-0000-0000-0000-000000000034',current_date,'Peringatan',' telat bayar ')$q$, 'rows:1');
-- jalankan sungguhan pada penghuni Budi (kamar 2)
select public.checkout_sewa((select id from public.rentals where tenant_id=current_setting('qa.new_tenant')::uuid and status_aktif),current_date,'Peringatan',' telat bayar ');
reset role;
select qa.check('CO-01', 'Checkout: sewa nonaktif + tanggal_keluar, kamar 2 Kosong, reputasi Peringatan + catatan di-trim', (select not status_aktif and tanggal_keluar=current_date from public.rentals where tenant_id=current_setting('qa.new_tenant')::uuid) and (select status_kamar from public.rooms where id='a0000000-0000-0000-0000-000000000022')='Kosong' and (select status_reputasi='Peringatan' and catatan_reputasi='telat bayar' from public.tenants where id=current_setting('qa.new_tenant')::uuid));
set role authenticated; select qa.as_user('22222222-0000-0000-0000-000000000002');
select qa.expect_like('CO-STALE', 'Checkout dua kali (layar basi) ditolak', $q$select public.checkout_sewa((select id from public.rentals where tenant_id=current_setting('qa.new_tenant')::uuid),current_date,'Bersih',null)$q$, 'error:P0001 Sewa ini sudah tidak aktif%');
select qa.expect('CO-REUSE', 'Kamar hasil checkout langsung bisa didaftari lagi', $q$select public.daftar_penghuni('a0000000-0000-0000-0000-000000000022','Lagi','08',null,null,'harian',current_date,current_date+1)$q$, 'rows:1');
reset role;

-- ===== hapus_sewa (head c2e77a7) =====
set role authenticated; select qa.as_user('22222222-0000-0000-0000-000000000002');
select public.daftar_penghuni('a0000000-0000-0000-0000-000000000022','Lagi','08',null,null,'harian',current_date,current_date+1);
reset role;
-- Penghuni Rhesal: sudah pindah (punya sewa lama + pemasukan). Penghuni "Lagi": daftar baru di kamar 2, tanpa pemasukan.
set role anon; select set_config('request.jwt.claims', '{"role":"anon"}', false);
select qa.expect('HS-ANON', 'Anon tidak bisa execute hapus_sewa', $q$select public.hapus_sewa((select id from public.rentals limit 1))$q$, 'denied');
reset role; set role authenticated; select qa.as_user('33333333-0000-0000-0000-000000000003');
select qa.expect_like('HS-XORG', 'Owner org B tidak melihat sewa org A (subquery RLS -> null -> ditolak)', $q$select public.hapus_sewa((select id from public.rentals where room_id='a0000000-0000-0000-0000-000000000022' and status_aktif))$q$, 'error:P0001 Data sewa yang akan dihapus belum dipilih%');
select qa.expect_like('HS-XORG2', 'Owner org B, id sewa org A ditulis langsung: tidak ditemukan', format($q$select public.hapus_sewa(%L)$q$, current_setting('qa.new_rental')), 'error:P0001 Data sewa tidak ditemukan%');
select qa.as_user('11111111-0000-0000-0000-000000000001');
select qa.expect_like('HS-REPRO', 'REPRO QA: Hapus sewa hasil pindah (sewa baru tanpa pemasukan) ditolak', format($q$select public.hapus_sewa(%L)$q$, current_setting('qa.new_rental')), 'error:P0001 Penghuni ini punya riwayat%');
select qa.expect_like('HS-NONAKTIF', 'Hapus sewa lama yang sudah nonaktif ditolak', $q$select public.hapus_sewa('a0000000-0000-0000-0000-000000000004')$q$, 'error:P0001 Sewa ini sudah tidak aktif%');
select qa.expect_like('HS-NULL', 'Input kosong ditolak', $q$select public.hapus_sewa(null)$q$, 'error:P0001 Data sewa yang akan dihapus belum dipilih%');
select qa.expect_like('HS-INCOME', 'Sewa sendiri punya pemasukan -> ditolak', $q$with i as (insert into public.incomes (rental_id, tanggal_bayar, nominal, org_id) select id, current_date, 10, org_id from public.rentals where room_id='a0000000-0000-0000-0000-000000000022' and status_aktif returning rental_id) select public.hapus_sewa((select rental_id from i))$q$, 'error:P0001 Penghuni ini punya riwayat%');
reset role;
select qa.check('HS-NOCHANGE', 'Penolakan tidak mengubah data: sewa pindah masih aktif, penghuni & kamar utuh', (select status_aktif from public.rentals where id=current_setting('qa.new_rental')::uuid) is not null and exists(select 1 from public.tenants where id='a0000000-0000-0000-0000-000000000003'));
set role authenticated; select qa.as_user('22222222-0000-0000-0000-000000000002');
select set_config('qa.hs_ktp', coalesce(public.hapus_sewa((select id from public.rentals where room_id='a0000000-0000-0000-0000-000000000022' and status_aktif)),'<null>'), false);
reset role;
select qa.check('HS-01', 'Hapus salah input: sewa & penghuni "Lagi" terhapus, kamar 2 Kosong, KTP null dikembalikan null', not exists(select 1 from public.tenants where nama_lengkap='Lagi') and (select status_kamar from public.rooms where id='a0000000-0000-0000-0000-000000000022')='Kosong' and current_setting('qa.hs_ktp')='<null>');
set role authenticated; select qa.as_user('22222222-0000-0000-0000-000000000002');
select public.daftar_penghuni('a0000000-0000-0000-0000-000000000022','K','08',null,(select org_a::text from qa.ids)||'/ktp_k.jpg','bulanan',current_date,current_date+30);
select qa.expect('HS-KTP', 'Penghuni dengan KTP: hapus mengembalikan path KTP (untuk dihapus dari storage)', $q$select 1 where public.hapus_sewa((select r.id from public.rentals r join public.tenants t on t.id=r.tenant_id where r.status_aktif and t.nama_lengkap='K')) = (select org_a::text from qa.ids)||'/ktp_k.jpg'$q$, 'rows:1');
select qa.expect('HS-REUSE2', 'Kamar yang dipakai K tidak bisa didaftari selama sewa K aktif', $q$select public.daftar_penghuni('a0000000-0000-0000-0000-000000000022','Ulang','08',null,null,'bulanan',current_date,current_date+30)$q$, 'error:P0001 Kamar ini sudah terisi. Pilih kamar lain yang kosong.');
select public.hapus_sewa((select r.id from public.rentals r join public.tenants t on t.id=r.tenant_id where r.status_aktif and t.nama_lengkap='K'));
select qa.expect('HS-REUSE', 'Kamar hasil hapus langsung bisa didaftari lagi', $q$select public.daftar_penghuni('a0000000-0000-0000-0000-000000000022','Ulang','08',null,null,'bulanan',current_date,current_date+30)$q$, 'rows:1');
reset role;
