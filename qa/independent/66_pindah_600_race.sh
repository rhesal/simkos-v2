#!/usr/bin/env bash
# Race nyata: 2 sesi psql bersamaan. $1 = nama db. Cetak PASS/FAIL.
DB=$1; P="psql -X -q -tA -d $DB"
AS="set role authenticated; select set_config('request.jwt.claims','{\"sub\":\"11111111-0000-0000-0000-000000000001\",\"role\":\"authenticated\"}',false);"
AS2="set role authenticated; select set_config('request.jwt.claims','{\"sub\":\"22222222-0000-0000-0000-000000000002\",\"role\":\"authenticated\"}',false);"
res(){ if [ "$2" = "$3" ]; then echo "PASS | $1 | aktual=$2"; else echo "FAIL | $1 | harap=$3 aktual=$2"; fi; }
# R1: admin memindah Penghuni Tiga (kamar 3) ke kamar 5, partner memindah Penghuni Rhesal (kamar 7) ke kamar 5, bersamaan.
$P -c "$AS begin; select public.pindah_kamar('a0000000-0000-0000-0000-000000000034','a0000000-0000-0000-0000-000000000026',current_date,null); select pg_sleep(1.5); commit;" >/tmp/r1a.out 2>&1 &
sleep 0.4
R=$(psql -X -q -tA -d $DB -c "set role postgres" -c "select id from public.rentals where tenant_id='a0000000-0000-0000-0000-000000000003' and status_aktif")
$P -c "$AS2 select public.pindah_kamar('$R','a0000000-0000-0000-0000-000000000026',current_date+7,null);" >/tmp/r1b.out 2>&1
wait
res R1-SESI2 "$(grep -o 'Kamar tujuan sudah terisi' /tmp/r1b.out)" "Kamar tujuan sudah terisi"
res R1-SATU "$($P -c "select count(*) from public.rentals where room_id='a0000000-0000-0000-0000-000000000026' and status_aktif")" 1
res R1-ASAL "$($P -c "select status_kamar from public.rooms where id='a0000000-0000-0000-0000-000000000023'")" Terisi
# R2: pindah vs daftar ke kamar 6 bersamaan
$P -c "$AS begin; select public.daftar_penghuni('a0000000-0000-0000-0000-000000000027','Race','08',null,null,'bulanan',current_date,current_date+30); select pg_sleep(1.5); commit;" >/tmp/r2a.out 2>&1 &
sleep 0.4
$P -c "$AS2 select public.pindah_kamar('$R','a0000000-0000-0000-0000-000000000027',current_date+7,null);" >/tmp/r2b.out 2>&1
wait
res R2-SESI2 "$(grep -o 'Kamar tujuan sudah terisi' /tmp/r2b.out)" "Kamar tujuan sudah terisi"
res R2-SATU "$($P -c "select count(*) from public.rentals where room_id='a0000000-0000-0000-0000-000000000027' and status_aktif")" 1
# R3: dua sesi memindah PENGHUNI YANG SAMA ke dua kamar berbeda bersamaan -> hanya satu, tidak ada sewa aktif ganda.
$P -c "$AS update public.rooms set status_kamar='Kosong' where id='a0000000-0000-0000-0000-000000000025';" >/dev/null
$P -c "$AS begin; select public.pindah_kamar('$R','a0000000-0000-0000-0000-000000000025',current_date+7,null); select pg_sleep(1.5); commit;" >/tmp/r3a.out 2>&1 &
sleep 0.4
$P -c "$AS2 select public.pindah_kamar('$R','a0000000-0000-0000-0000-000000000023',current_date+7,null);" >/tmp/r3b.out 2>&1
wait
res R3-SESI2 "$(grep -o 'Sewa ini sudah tidak aktif' /tmp/r3b.out)" "Sewa ini sudah tidak aktif"
res R3-AKTIF "$($P -c "select count(*) from public.rentals where tenant_id='a0000000-0000-0000-0000-000000000003' and status_aktif")" 1
res R3-KAMAR7 "$($P -c "select status_kamar from public.rooms where id='a0000000-0000-0000-0000-000000000023'")" Kosong
# R5: checkout vs pindah sewa yang sama bersamaan -> satu menang, sisi lain ditolak, data konsisten
R5=$($P -c "select id from public.rentals where tenant_id='a0000000-0000-0000-0000-000000000033' and status_aktif")
$P -c "$AS begin; select public.checkout_sewa('$R5',current_date,'Bersih',null); select pg_sleep(1.5); commit;" >/tmp/r5a.out 2>&1 &
sleep 0.4
$P -c "$AS2 select public.pindah_kamar('$R5','a0000000-0000-0000-0000-000000000023',current_date,null);" >/tmp/r5b.out 2>&1
wait
res R5-SESI2 "$(grep -o 'Sewa ini sudah tidak aktif' /tmp/r5b.out)" "Sewa ini sudah tidak aktif"
res R5-AKTIF "$($P -c "select count(*) from public.rentals where tenant_id='a0000000-0000-0000-0000-000000000033' and status_aktif")" 0
# R6: hapus_sewa vs tambah pemasukan bersamaan -> hapus ditolak ATAU pemasukan gagal FK; tidak ada pemasukan yatim
$P -c "$AS select public.daftar_penghuni('a0000000-0000-0000-0000-000000000022','R6','08',null,null,'bulanan',current_date,current_date+30)" >/dev/null 2>&1
R6=$($P -c "select r.id from public.rentals r join public.tenants t on t.id=r.tenant_id where t.nama_lengkap='R6' and r.status_aktif")
$P -c "$AS begin; insert into public.incomes (rental_id, tanggal_bayar, nominal, org_id) select id, current_date, 1000, org_id from public.rentals where id='$R6'; select pg_sleep(1.5); commit;" >/tmp/r6a.out 2>&1 &
sleep 0.4
$P -c "$AS2 select public.hapus_sewa('$R6');" >/tmp/r6b.out 2>&1
wait
res R6-HAPUS-DITOLAK "$(grep -o 'punya riwayat' /tmp/r6b.out)" "punya riwayat"
res R6-UTUH "$($P -c "select count(*) from public.incomes i join public.rentals r on r.id=i.rental_id where r.id='$R6'")" 1
# R7: hapus_sewa vs pindah_kamar sewa yang sama bersamaan (hapus duluan) -> pindah ditolak, tidak ada sewa aktif tersisa
$P -c "insert into public.rooms (id, location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar, org_id) select 'a0000000-0000-0000-0000-000000000028','a0000000-0000-0000-0000-000000000001','8',1,1,'Kosong',org_id from public.locations where id='a0000000-0000-0000-0000-000000000001'" >/dev/null
$P -c "$AS select public.daftar_penghuni('a0000000-0000-0000-0000-000000000028','R7','08',null,null,'bulanan',current_date,current_date+30)" >/dev/null 2>&1
R7=$($P -c "select r.id from public.rentals r join public.tenants t on t.id=r.tenant_id where t.nama_lengkap='R7' and r.status_aktif")
$P -c "$AS begin; select public.hapus_sewa('$R7'); select pg_sleep(1.5); commit;" >/tmp/r7a.out 2>&1 &
sleep 0.4
$P -c "$AS2 select public.pindah_kamar('$R7','a0000000-0000-0000-0000-000000000023',current_date,null);" >/tmp/r7b.out 2>&1
wait
res R7-PINDAH-DITOLAK "$(grep -o 'Data sewa tidak ditemukan' /tmp/r7b.out)" "Data sewa tidak ditemukan"
res R7-KAMAR "$($P -c "select status_kamar from public.rooms where id='a0000000-0000-0000-0000-000000000028'")||$($P -c "select status_kamar from public.rooms where id='a0000000-0000-0000-0000-000000000023'")" "Kosong||Kosong"
# R4: konsistensi akhir: setiap kamar Terisi punya tepat 1 sewa aktif, setiap kamar Kosong 0 (org A)
res R4-KONSISTEN "$($P -c "select count(*) from public.rooms r where r.org_id is not null and r.location_id <> 'b0000000-0000-0000-0000-000000000001' and ((r.status_kamar='Terisi') <> exists(select 1 from public.rentals x where x.room_id=r.id and x.status_aktif))")" 0
