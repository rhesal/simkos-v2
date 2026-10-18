-- QA migration 600: pindah_kamar & daftar_penghuni (RLS aktif, security invoker).
-- Setiap tes jalan di subtransaksi yang selalu di-rollback (tidak saling memengaruhi).

-- Helper (superuser) ----------------------------------------------------------
-- qa.after: jalankan statement-statement `actions`, lalu `chk` (harus true).
create or replace function qa.after(test_id text, descr text, actions text[], chk text) returns void
language plpgsql as $$
declare actual text; ok_ boolean; s text;
begin
  begin
    foreach s in array actions loop execute s; end loop;
    execute chk into ok_;
    raise exception using errcode = 'QA002', message = coalesce(ok_::text, 'null');
  exception
    when sqlstate 'QA002' then actual := case when sqlerrm = 'true' then 'ok' else 'check:' || sqlerrm end;
    when insufficient_privilege then actual := 'denied';
    when others then actual := 'error:' || sqlstate || ' ' || sqlerrm;
  end;
  insert into qa.results (test_id, descr, actor, expected, actual, pass)
  values (test_id, descr, current_user || coalesce(' sub=' || auth.uid()::text, ''), 'ok', actual, actual = 'ok');
end $$;
-- qa.expect_err: statement terakhir harus gagal; hasil = detail 'SIMKOS_*' atau sqlstate.
create or replace function qa.expect_err(test_id text, descr text, actions text[], expected text) returns void
language plpgsql as $$
declare actual text; s text; st text; det text;
begin
  begin
    foreach s in array actions loop execute s; end loop;
    raise exception using errcode = 'QA003', message = 'lolos';
  exception
    when sqlstate 'QA003' then actual := 'lolos (tidak ditolak)';
    when others then
      get stacked diagnostics st = returned_sqlstate, det = pg_exception_detail;
      actual := case when det like 'SIMKOS_%' then det else st end;
  end;
  insert into qa.results (test_id, descr, actor, expected, actual, pass)
  values (test_id, descr, current_user || coalesce(' sub=' || auth.uid()::text, ''), expected, actual, actual = expected);
end $$;
grant execute on function qa.after(text, text, text[], text), qa.expect_err(text, text, text[], text) to anon, authenticated;

-- Trigger uji atomik: insert rentals dengan tipe_sewa 'GAGAL' selalu error
-- (gagal SETELAH tenant ter-insert di daftar_penghuni).
create or replace function qa.fail_rental() returns trigger language plpgsql as $$
begin raise exception 'qa: gagal buatan setelah tenant ter-insert'; end $$;
create trigger qa_fail_rental before insert on public.rentals
  for each row when (new.tipe_sewa = 'GAGAL') execute function qa.fail_rental();

-- Superuser (bypass RLS): guard beda organisasi di dalam fungsi -----------------
select qa.expect_err('PK-ORG-SU', 'service/superuser: pindah sewa org1 ke kamar org2 ditolak guard org',
  array[$q$select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002','2026-10-18')$q$],
  'SIMKOS_BEDA_ORG');

-- Owner org1 (u2) ---------------------------------------------------------------
set role authenticated;
select qa.as_user('u2');

select qa.after('PK-01', 'pindah lintas lokasi (Kos Satu kamar 1 -> Kos Dua kamar 4): sewa lama ditutup, sewa baru dibuat',
  array[$q$create temp table pk_out as select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000002','2026-10-18','AC rusak') as new_id$q$],
  $q$select
       (select status_aktif = false and tanggal_keluar = '2026-10-18' and catatan = 'Pindah ke kamar 4: AC rusak'
          and room_id = 'a1000000-0000-0000-0000-000000000001' and tanggal_jatuh_tempo = '2026-09-01'
          from public.rentals where id = 'a3000000-0000-0000-0000-000000000001')
   and (select status_aktif and room_id = 'c1000000-0000-0000-0000-000000000002'
          and tenant_id = 'a2000000-0000-0000-0000-000000000001' and tipe_sewa = 'Bulanan'
          and tanggal_masuk = '2026-10-18' and tanggal_jatuh_tempo = '2026-09-01' and org_id = qa.id('org1')
          and tanggal_keluar is null and catatan = 'Pindah dari kamar 1: AC rusak'
          from public.rentals where id = (select new_id from pk_out))
   and (select count(*) = 1 from public.rentals where tenant_id = 'a2000000-0000-0000-0000-000000000001' and status_aktif)
   and (select status_kamar from public.rooms where id = 'a1000000-0000-0000-0000-000000000001') = 'Kosong'
   and (select status_kamar from public.rooms where id = 'c1000000-0000-0000-0000-000000000002') = 'Terisi'$q$);

select qa.after('PK-02', 'pemasukan lama tetap di rental_id lama, tidak ada yang pindah ke sewa baru',
  array[$q$create temp table pk_out as select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','2026-10-18') as new_id$q$],
  $q$select (select count(*) = 1 and min(nominal) = 1000000 and min(tanggal_bayar) = '2026-08-01'
               from public.incomes where rental_id = 'a3000000-0000-0000-0000-000000000001')
        and not exists (select 1 from public.incomes where rental_id = (select new_id from pk_out))$q$);

select qa.after('PK-03', 'data & KTP penghuni tidak berubah; catatan tanpa alasan = "Pindah ke kamar 3"',
  array[$q$select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','2026-10-18', '  ')$q$],
  $q$select (select nama_lengkap = 'Penghuni Satu' and foto_ktp_url = qa.id('org1')::text || '/ktp_1.jpg'
               from public.tenants where id = 'a2000000-0000-0000-0000-000000000001')
        and (select catatan = 'Pindah ke kamar 3' from public.rentals where id = 'a3000000-0000-0000-0000-000000000001')$q$);

select qa.after('PK-04', 'pindah dua kali berturut-turut (1 -> 3 -> 4): kamar 3 kosong lagi, 1 sewa aktif',
  array[$q$create temp table pk_out as select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','2026-10-18') as new_id$q$,
        $q$select public.pindah_kamar((select new_id from pk_out),'c1000000-0000-0000-0000-000000000002','2026-10-20')$q$],
  $q$select (select status_kamar from public.rooms where id = 'c1000000-0000-0000-0000-000000000001') = 'Kosong'
        and (select count(*) = 1 from public.rentals where tenant_id = 'a2000000-0000-0000-0000-000000000001' and status_aktif and room_id = 'c1000000-0000-0000-0000-000000000002')
        and (select count(*) = 3 from public.rentals where tenant_id = 'a2000000-0000-0000-0000-000000000001')$q$);

select qa.expect_err('PK-05', 'kamar tujuan sudah terisi (ada sewa aktif) ditolak',
  array[$q$select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','2026-10-18')$q$],
  'SIMKOS_KAMAR_TERISI');
select qa.expect_err('PK-06', 'kamar tujuan berstatus Terisi (tanpa sewa) ditolak',
  array[$q$select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000003','2026-10-18')$q$],
  'SIMKOS_KAMAR_TERISI');
select qa.expect_err('PK-07', 'kamar tujuan milik org lain tidak terlihat (RLS) -> ditolak',
  array[$q$select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002','2026-10-18')$q$],
  'SIMKOS_KAMAR_TIDAK_ADA');
select qa.expect_err('PK-08', 'sewa milik org lain tidak bisa dipindah (RLS)',
  array[$q$select public.pindah_kamar('b3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','2026-10-18')$q$],
  'SIMKOS_SEWA_TIDAK_ADA');
select qa.expect_err('PK-09', 'pindah ke kamar yang sama ditolak',
  array[$q$select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','2026-10-18')$q$],
  'SIMKOS_KAMAR_SAMA');
select qa.expect_err('PK-10', 'sewa yang sudah checkout tidak bisa dipindah',
  array[$q$update public.rentals set status_aktif = false where id = 'a3000000-0000-0000-0000-000000000001'$q$,
        $q$select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','2026-10-18')$q$],
  'SIMKOS_SEWA_TIDAK_AKTIF');
select qa.expect_err('PK-11', 'tanggal pindah sebelum tanggal masuk ditolak',
  array[$q$select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','2026-07-01')$q$],
  'SIMKOS_TANGGAL_SEBELUM_MASUK');
select qa.expect_err('PK-12', 'input kosong ditolak',
  array[$q$select public.pindah_kamar('a3000000-0000-0000-0000-000000000001', null, '2026-10-18')$q$],
  'SIMKOS_INPUT_KOSONG');
select qa.expect_err('PK-13', 'pengaman terakhir: unique index menolak sewa aktif kedua di kamar yang sama (insert langsung)',
  array[$q$insert into public.rentals (room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo) values ('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000003','Bulanan','2026-10-18','2026-11-18')$q$],
  '23505');
select qa.expect_err('PK-14', 'unique index menolak sewa aktif kedua untuk penghuni yang sama',
  array[$q$insert into public.rentals (room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo) values ('c1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','Bulanan','2026-10-18','2026-11-18')$q$],
  '23505');

-- daftar_penghuni ---------------------------------------------------------------
select qa.after('DP-01', 'daftar penghuni ke kamar kosong: tenant + sewa aktif + kamar Terisi, org_id org1',
  array[format($q$create temp table dp_out as select public.daftar_penghuni('c1000000-0000-0000-0000-000000000001',' Budi ','0812',' ','%s/ktp_budi.jpg','bulanan','2026-10-18','2026-11-18') as tid$q$, qa.id('org1'))],
  $q$select (select nama_lengkap = 'Budi' and nomor_hp = '0812' and kontak_darurat is null and org_id = qa.id('org1')
               from public.tenants where id = (select tid from dp_out))
        and (select count(*) = 1 from public.rentals where tenant_id = (select tid from dp_out) and status_aktif
               and room_id = 'c1000000-0000-0000-0000-000000000001' and tipe_sewa = 'bulanan'
               and tanggal_jatuh_tempo = '2026-11-18' and org_id = qa.id('org1'))
        and (select status_kamar from public.rooms where id = 'c1000000-0000-0000-0000-000000000001') = 'Terisi'$q$);
select qa.expect_err('DP-02', 'daftar ke kamar yang sudah terisi ditolak',
  array[format($q$select public.daftar_penghuni('a1000000-0000-0000-0000-000000000001','X','1',null,'%s/ktp_x.jpg','bulanan','2026-10-18','2026-11-18')$q$, qa.id('org1'))],
  'SIMKOS_KAMAR_TERISI');
select qa.after('DP-03', 'atomik: gagal setelah tenant ter-insert -> tenant TIDAK tersisa, kamar tetap Kosong',
  array[format($q$do $d$ begin perform public.daftar_penghuni('c1000000-0000-0000-0000-000000000001','Gagal Tengah','1',null,'%s/ktp_g.jpg','GAGAL','2026-10-18','2026-11-18'); exception when others then null; end $d$$q$, qa.id('org1'))],
  $q$select not exists (select 1 from public.tenants where nama_lengkap = 'Gagal Tengah')
        and (select status_kamar from public.rooms where id = 'c1000000-0000-0000-0000-000000000001') = 'Kosong'$q$);
select qa.expect_err('DP-04', 'path KTP di folder org lain ditolak trigger migration 300',
  array[format($q$select public.daftar_penghuni('c1000000-0000-0000-0000-000000000001','X','1',null,'%s/ktp_x.jpg','bulanan','2026-10-18','2026-11-18')$q$, qa.id('org2'))],
  '42501');
select qa.expect_err('DP-05', 'kamar org lain tidak terlihat (RLS) -> ditolak',
  array[$q$select public.daftar_penghuni('b1000000-0000-0000-0000-000000000002','X','1',null,null,'bulanan','2026-10-18','2026-11-18')$q$],
  'SIMKOS_KAMAR_TIDAK_ADA');
select qa.expect_err('DP-06', 'jatuh tempo sebelum tanggal masuk ditolak',
  array[$q$select public.daftar_penghuni('c1000000-0000-0000-0000-000000000001','X','1',null,null,'bulanan','2026-10-18','2026-10-17')$q$],
  'SIMKOS_TANGGAL_TEMPO');
select qa.expect_err('DP-07', 'nama kosong ditolak',
  array[$q$select public.daftar_penghuni('c1000000-0000-0000-0000-000000000001','  ','1',null,null,'bulanan','2026-10-18','2026-11-18')$q$],
  'SIMKOS_INPUT_KOSONG');
select qa.expect_err('DP-08', 'kamar berstatus Terisi tanpa sewa ditolak',
  array[$q$select public.daftar_penghuni('c1000000-0000-0000-0000-000000000003','X','1',null,null,'bulanan','2026-10-18','2026-11-18')$q$],
  'SIMKOS_KAMAR_TERISI');

-- Admin org1 (u1) juga boleh ---------------------------------------------------
select qa.as_user('u1');
select qa.after('PK-15', 'admin org1 juga bisa memindah penghuni',
  array[$q$select public.pindah_kamar('a3000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','2026-10-18')$q$],
  $q$select (select status_kamar from public.rooms where id = 'a1000000-0000-0000-0000-000000000002') = 'Kosong'$q$);

-- Staff org2 (s): bisa di org sendiri, tidak bisa ke org1 -------------------------
select qa.as_user('s');
select qa.after('PK-16', 'staff org2 memindah penghuni org2 di org-nya sendiri',
  array[$q$select public.pindah_kamar('b3000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002','2026-10-18')$q$],
  $q$select (select status_kamar from public.rooms where id = 'b1000000-0000-0000-0000-000000000002') = 'Terisi'$q$);
select qa.expect_err('PK-17', 'staff org2 tidak bisa memindah ke kamar org1',
  array[$q$select public.pindah_kamar('b3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','2026-10-18')$q$],
  'SIMKOS_KAMAR_TIDAK_ADA');

-- User login tanpa org (d) ------------------------------------------------------
select qa.as_user('d');
select qa.expect_err('PK-18', 'user tanpa organisasi: sewa org1 tidak terlihat',
  array[$q$select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','2026-10-18')$q$],
  'SIMKOS_SEWA_TIDAK_ADA');

-- anon: tidak punya hak execute -------------------------------------------------
reset role;
set role anon;
select set_config('request.jwt.claims', '', false);
select qa.expect_err('ANON-PK', 'anon tidak bisa memanggil pindah_kamar',
  array[$q$select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','2026-10-18')$q$],
  '42501');
select qa.expect_err('ANON-DP', 'anon tidak bisa memanggil daftar_penghuni',
  array[$q$select public.daftar_penghuni('c1000000-0000-0000-0000-000000000001','X','1',null,null,'bulanan','2026-10-18','2026-11-18')$q$],
  '42501');
reset role;

-- Metadata ------------------------------------------------------------------------
select qa.after('META-01', 'kedua fungsi SECURITY INVOKER, search_path kosong, public tidak punya EXECUTE',
  array[]::text[],
  $q$select bool_and(not p.prosecdef and p.proconfig @> array['search_path=""'])
        and bool_and(not has_function_privilege('anon', p.oid, 'execute'))
        and bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
        and count(*) = 2
       from pg_proc p where p.oid in ('public.pindah_kamar(uuid,uuid,date,text)'::regprocedure,
                                      'public.daftar_penghuni(uuid,text,text,text,text,text,date,date)'::regprocedure)$q$);

drop trigger qa_fail_rental on public.rentals;
