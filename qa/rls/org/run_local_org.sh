#!/usr/bin/env bash
# QA PR #1 (model multi-pemilik / organisasi) — tes RLS di Postgres lokal (bukan Supabase).
# Pakai: ./qa/rls/org/run_local_org.sh   (butuh psql + Postgres lokal; user = superuser)
# Fixture memakai baseline LIVE (docs/reference/live_schema_public.sql) + kondisi
# policy/grant live (05_live_legacy_state.sql). Setiap migration dijalankan dengan
# `psql -1` (satu transaksi), sama seperti SQL Editor / supabase db push.
# Keluar dengan kode 1 bila ada tes yang gagal.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../../.."
MIG="$ROOT/supabase/migrations"
RB="$ROOT/supabase/rollback"
SCHEMA="$ROOT/docs/reference/live_schema_public.sql"
PSQL="psql -X -q -v ON_ERROR_STOP=1 --set=client_min_messages=warning"
export PGDATABASE="${PGDATABASE:-postgres}"
FAILS=0
pg_isready -q || { echo "Postgres lokal tidak jalan. Jalankan: sudo pg_ctlcluster 17 main start"; exit 2; }

fresh_db() { dropdb --if-exists "$1" >/dev/null 2>&1; createdb "$1" || exit 2; $PSQL -d "$1" -f "$HERE/00_supabase_stub.sql" >/dev/null; }
apply() { local db=$1; shift; for f in "$@"; do $PSQL -1 -d "$db" -f "$f" >/dev/null 2>"$HERE/.last_err" || { echo "  GAGAL apply $(basename "$f"):"; cat "$HERE/.last_err"; FAILS=$((FAILS+1)); return 1; }; done; }
report() {
  local db=$1 title=$2
  echo; echo "=== $title ==="
  psql -X -d "$db" -tA -F ' | ' -c "select case when pass then 'PASS' else 'FAIL' end, test_id, descr, 'harap=' || expected, 'aktual=' || actual from qa.results order by seq"
  local n t; n=$(psql -X -d "$db" -tAc "select count(*) from qa.results where not pass"); t=$(psql -X -d "$db" -tAc "select count(*) from qa.results")
  echo "--- $title: $((t-n))/$t lulus"
  FAILS=$((FAILS+n))
}
expect_reject() {  # $1=db $2=file $3=id $4=pola error yang diharapkan
  local db=$1 f=$2 id=$3 pat=$4
  if $PSQL -1 -d "$db" -f "$f" >/dev/null 2>"$HERE/.last_err"; then
    echo "FAIL | $id | $(basename "$f") seharusnya menolak apply, tapi lolos"; FAILS=$((FAILS+1))
  elif grep -q -- "$pat" "$HERE/.last_err"; then
    echo "PASS | $id | $(basename "$f") menolak apply: $(grep -m1 -o 'ERROR:.*' "$HERE/.last_err" | cut -c1-150)"
  else
    echo "FAIL | $id | ditolak dengan error tak terduga: $(grep -m1 -o 'ERROR:.*' "$HERE/.last_err")"; FAILS=$((FAILS+1))
  fi
}
check() {  # $1=db $2=id $3=deskripsi $4=sql yang harus mengembalikan 't'
  local r; r=$(psql -X -q -d "$1" -tAc "$4" 2>&1 | tail -n1)
  if [ "$r" = "t" ]; then echo "PASS | $2 | $3"; else echo "FAIL | $2 | $3 (hasil: $r)"; FAILS=$((FAILS+1)); fi
}
live_base() {  # DB baru = kondisi live + data contoh 2 user
  fresh_db "$1"
  apply "$1" "$SCHEMA" "$HERE/05_live_legacy_state.sql" "$HERE/15_harness.sql" "$HERE/06_live_data.sql"
}

# S1: alur deploy lengkap: 200 -> 210 -> (move script) -> 300, lalu org2 + tes
DB=qa_org_s1; live_base $DB
apply $DB "$MIG/20261010000200_organizations_and_backfill.sql" "$MIG/20261010000210_org_rls_policies.sql" \
  "$HERE/07_simulated_move.sql" "$MIG/20261010000300_private_storage_buckets.sql" \
  "$HERE/10_seed_org2.sql" "$HERE/20_org_tests.sql" && report $DB "S1 Deploy normal (2 owner, org kedua, user tanpa org, anon)"

# S2: jumlah user != 2 -> migration 200 menolak; dengan override -> semua user jadi owner
echo; echo "=== S2 Backfill: jumlah user di auth.users ==="
DB=qa_org_s2; live_base $DB
$PSQL -d $DB -c "insert into auth.users(id,email) values ('33333333-0000-0000-0000-000000000003','ketiga@example.test')" >/dev/null
expect_reject $DB "$MIG/20261010000200_organizations_and_backfill.sql" S2-01 "Backfill dibatalkan: auth.users berisi 3 user"
check $DB S2-02 "setelah ditolak tidak ada sisa (transaksi di-rollback)" "select to_regclass('public.organizations') is null and not exists (select 1 from information_schema.columns where column_name='org_id')"
{ echo "set simkos.backfill_expected_users = '3';"; cat "$MIG/20261010000200_organizations_and_backfill.sql"; } > "$HERE/.override.sql"
apply $DB "$HERE/.override.sql" && \
  check $DB S2-03 "override: 3 user jadi owner org SimKos, semua baris punya org_id" \
  "select (select count(*) from public.organization_members where role='owner') = 3 and (select count(*) from public.organizations) = 1 and not exists (select 1 from public.tenants where org_id is null)"
rm -f "$HERE/.override.sql"
DB=qa_org_s2b; live_base $DB
apply $DB "$MIG/20261010000200_organizations_and_backfill.sql" && {
  check $DB S2-04 "2 user (seperti live) -> keduanya owner org 'SimKos', org_id NOT NULL di 7 tabel" \
    "select (select count(*) from public.organization_members m join public.organizations o on o.id=m.org_id where o.name='SimKos' and m.role='owner') = 2 and (select count(*) from information_schema.columns where table_schema='public' and column_name='org_id' and is_nullable='NO' and table_name <> 'organization_members') = 7"
  check $DB S2-05 "hanya migration 200: policy lama masih ada (app lama tetap jalan)" "select count(*) = 7 from pg_policies where policyname like 'Hanya user login%'"
  expect_reject $DB "$MIG/20261010000200_organizations_and_backfill.sql" S2-06 "already exists"
}

# S3: migration 300 sebelum move script -> menolak (tidak ada jendela file tak terbaca)
echo; echo "=== S3 Migration 300 sebelum file dipindah ==="
DB=qa_org_s3; live_base $DB
apply $DB "$MIG/20261010000200_organizations_and_backfill.sql" "$MIG/20261010000210_org_rls_policies.sql" && \
  expect_reject $DB "$MIG/20261010000300_private_storage_buckets.sql" S3-01 "masih menunjuk file di luar folder"
check $DB S3-02 "policy storage lama masih utuh setelah penolakan" "select count(*) = 2 from pg_policies where policyname like 'Izinkan%KTP'"

# S4: policy storage generik using(true) -> step 0 menolak
echo; echo "=== S4 Policy storage generik 'using (true)' ==="
DB=qa_org_s4; live_base $DB
apply $DB "$HERE/06_legacy_generic_storage_policy.sql" "$MIG/20261010000200_organizations_and_backfill.sql" \
  "$MIG/20261010000210_org_rls_policies.sql" "$HERE/07_simulated_move.sql" && \
  expect_reject $DB "$MIG/20261010000300_private_storage_buckets.sql" S4-01 "policy storage.objects permisif"

# S5: policy permisif yang lolos cek teks ('x or true', 'owner not null') + bucket lain -> guard menahan
DB=qa_org_s5; live_base $DB
apply $DB "$HERE/07_legacy_or_true_policy.sql" "$HERE/08_legacy_owner_not_null_policy.sql" \
  "$MIG/20261010000200_organizations_and_backfill.sql" "$MIG/20261010000210_org_rls_policies.sql" \
  "$HERE/07_simulated_move.sql" "$MIG/20261010000300_private_storage_buckets.sql" \
  "$HERE/09_other_bucket.sql" "$HERE/10_seed_org2.sql" "$HERE/20_org_tests.sql" "$HERE/25_other_bucket_tests.sql" && \
  report $DB "S5 Policy permisif 'x or true' + 'owner not null' + guard RESTRICTIVE (dengan user org lain)"

# S6: S5 TANPA guard -> membuktikan guard yang menahan kebocoran (kontrol)
DB=qa_org_s6; live_base $DB
apply $DB "$HERE/07_legacy_or_true_policy.sql" "$MIG/20261010000200_organizations_and_backfill.sql" \
  "$MIG/20261010000210_org_rls_policies.sql" "$HERE/07_simulated_move.sql" "$MIG/20261010000300_private_storage_buckets.sql" \
  "$HERE/10_seed_org2.sql" && {
  psql -X -q -d $DB -c "drop policy simkos_private_images_guard on storage.objects" >/dev/null
  echo; echo "=== S6 Kontrol: tanpa guard, policy 'x or true' membocorkan ==="
  check $DB S6-01 "tanpa guard, owner org2 melihat KTP org1 (bukti guard diperlukan)" \
    "begin; set local role authenticated; select qa.as_user('c'); select count(*) > 0 from storage.objects where name like (select qa.id('org1'))::text || '/%'" 2>/dev/null
}

# S7: rollback 300 -> 210 -> 200 mengembalikan policy live, bucket tetap private
echo; echo "=== S7 Rollback ==="
DB=qa_org_s7; live_base $DB
apply $DB "$MIG/20261010000200_organizations_and_backfill.sql" "$MIG/20261010000210_org_rls_policies.sql" \
  "$HERE/07_simulated_move.sql" "$MIG/20261010000300_private_storage_buckets.sql" && {
  expect_reject $DB "$RB/rollback_200_organizations.sql" S7-01 "Jalankan rollback_300_storage.sql dulu"
  apply $DB "$RB/rollback_300_storage.sql" "$RB/rollback_210_org_rls.sql" && {
    check $DB S7-02 "policy storage live lama kembali persis, tanpa policy simkos" \
      "select (select count(*) from pg_policies where schemaname='storage' and policyname in ('Izinkan lihat KTP','Izinkan upload KTP')) = 2 and not exists (select 1 from pg_policies where policyname like 'simkos_%')"
    check $DB S7-03 "bucket tetap private" "select bool_and(not public) from storage.buckets where id in ('ktp_images','receipt_images')"
    check $DB S7-04 "7 policy tabel live lama kembali (auth.role() = 'authenticated')" \
      "select count(*) = 7 from pg_policies where schemaname='public' and policyname like 'Hanya user login%' and qual = '(auth.role() = ''authenticated''::text)'"
    check $DB S7-05 "file yang sudah dipindah tetap terbaca u2 lewat policy lama" \
      "begin; set local role authenticated; select qa.as_user('u2'); select count(*) = 2 from storage.objects where bucket_id='ktp_images' and name like '%/ktp_%'"
    apply $DB "$RB/rollback_200_organizations.sql" && \
      check $DB S7-06 "rollback 200: kolom org_id & tabel organisasi hilang" \
        "select to_regclass('public.organizations') is null and not exists (select 1 from information_schema.columns where table_schema='public' and column_name='org_id')"
  }
}

# S8: migration 400 (kolom inventories) -> tes, idempotent, rollback, guard rollback
DB=qa_org_s8; live_base $DB
apply $DB "$MIG/20261010000200_organizations_and_backfill.sql" "$MIG/20261010000210_org_rls_policies.sql" \
  "$HERE/07_simulated_move.sql" "$MIG/20261010000300_private_storage_buckets.sql" "$HERE/10_seed_org2.sql" && {
  echo; echo "=== S8 Migration 400 inventories ==="
  apply $DB "$MIG/20261010000400_inventories_missing_columns.sql" && {
    check $DB S8-01 "4 kolom baru ada, nullable, tipe benar" \
      "select count(*) = 4 from information_schema.columns where table_schema='public' and table_name='inventories' and is_nullable='YES' and (column_name, data_type) in (('tanggal_pembelian','date'),('harga','numeric'),('tipe_fasilitas','text'),('receipt_url','text'))"
    check $DB S8-02 "trigger inventories_receipt_path_org terpasang" \
      "select exists (select 1 from pg_trigger where tgname='inventories_receipt_path_org' and tgrelid='public.inventories'::regclass)"
    check $DB S8-03 "policy inventories tidak berubah (tetap 1: inventories_org_access)" \
      "select array_agg(policyname::text) = array['inventories_org_access'] from pg_policies where schemaname='public' and tablename='inventories'"
    apply $DB "$MIG/20261010000400_inventories_missing_columns.sql" && echo "PASS | S8-04 | migration 400 idempotent (apply kedua lolos)"
    apply $DB "$HERE/40_inventories_400_tests.sql" && report $DB "S8 Inventaris setelah migration 400"
    $PSQL -d $DB -c "update public.inventories set harga = 1 where id = 'a6000000-0000-0000-0000-000000000001'" >/dev/null
    expect_reject $DB "$RB/rollback_400_inventories_columns.sql" S8-05 "Rollback dibatalkan"
    $PSQL -d $DB -c "update public.inventories set tanggal_pembelian=null, harga=null, tipe_fasilitas=null, receipt_url=null" >/dev/null
    apply $DB "$RB/rollback_400_inventories_columns.sql" && check $DB S8-06 "rollback 400: kolom & trigger hilang, data lama utuh" \
      "select not exists (select 1 from information_schema.columns where table_schema='public' and table_name='inventories' and column_name in ('tanggal_pembelian','harga','tipe_fasilitas','receipt_url')) and not exists (select 1 from pg_trigger where tgname='inventories_receipt_path_org') and (select count(*) from public.inventories) > 0"
    apply $DB "$MIG/20261010000400_inventories_missing_columns.sql" && echo "PASS | S8-07 | migration 400 bisa diterapkan ulang setelah rollback"
  }
}
# S8b: migration 400 di DB tanpa migration 200 -> ditolak
DB=qa_org_s8b; live_base $DB
expect_reject $DB "$MIG/20261010000400_inventories_missing_columns.sql" S8-08 "Terapkan migration 200 dulu"

# S9: migration 500 (peran admin) -> tes, rollback
admin500() {  # $1=db : terapkan 500 dengan u1 sebagai admin
  { echo "set simkos.admin_user_id = '11111111-0000-0000-0000-000000000001';"; cat "$MIG/20261010000500_org_admin_role.sql"; } > "$HERE/.m500.sql"
  apply "$1" "$HERE/.m500.sql"; local rc=$?; rm -f "$HERE/.m500.sql"; return $rc
}
DB=qa_org_s9; live_base $DB
apply $DB "$MIG/20261010000200_organizations_and_backfill.sql" "$MIG/20261010000210_org_rls_policies.sql" \
  "$HERE/07_simulated_move.sql" "$MIG/20261010000300_private_storage_buckets.sql" "$HERE/10_seed_org2.sql" && \
  admin500 $DB && {
    check $DB S9-01 "u1 jadi admin, u2 tetap owner, org2 tidak berubah" \
      "select (select role from public.organization_members where user_id='11111111-0000-0000-0000-000000000001')='admin' and (select role from public.organization_members where user_id='22222222-0000-0000-0000-000000000002')='owner' and (select count(*) from public.organization_members where role='admin')=1"
    apply $DB "$HERE/50_org_admin_500_tests.sql" && report $DB "S9 Migration 500 peran admin"
    admin500 $DB && check $DB S9-02 "500 dijalankan ulang (idempotent): org1 tetap 1 admin, policy tidak dobel" \
      "select (select count(*) from public.organization_members where role='admin' and user_id in ('11111111-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000002'))=1 and (select count(*) from pg_policies where tablename='organization_members')=4 and (select count(*) from pg_trigger where tgname='organization_members_last_admin_guard')=1"
    apply $DB "$RB/rollback_500_org_admin_role.sql" && {
      echo; echo "=== S9 Rollback 500 ==="
      check $DB S9-R1 "rollback: semua admin kembali owner, constraint & policy lama kembali" \
        "select not exists (select 1 from public.organization_members where role='admin') and to_regprocedure('public.is_org_admin(uuid)') is null and (select count(*) from pg_policies where tablename='organization_members' and policyname like '%_owner')=3 and exists (select 1 from pg_policies where policyname='organizations_update_owner')"
      check $DB S9-R2 "rollback: owner kembali bisa menurunkan owner lain (perilaku lama)" \
        "begin; set local role authenticated; select qa.as_user('u2'); with x as (update public.organization_members set role='staff' where user_id='11111111-0000-0000-0000-000000000001' returning 1) select count(*)=1 from x"
      admin500 $DB && check $DB S9-R3 "500 bisa diterapkan ulang setelah rollback" \
        "select count(*)=1 from public.organization_members where role='admin'"
    }
  }
# S9r: race guard admin terakhir -> dua sesi bersamaan tidak boleh menghabiskan admin
race500() {  # $1=db $2=id $3=deskripsi $4=sql sesi A (ditahan 2 dtk) $5=sql sesi B
  local db=$1
  psql -X -q -d $db -c "update public.organization_members set role='admin' where user_id in ('11111111-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000002')" >/dev/null
  ( psql -X -q -d $db -c "begin; $4; select pg_sleep(2); commit;" >/dev/null 2>"$HERE/.raceA" ) &
  sleep 0.7
  psql -X -q -d $db -c "begin; $5; commit;" >/dev/null 2>"$HERE/.raceB"
  wait
  check $db "$2" "$3" "select count(*) >= 1 from public.organization_members where role='admin' and org_id = (select id from public.organizations where name='SimKos')"
  rm -f "$HERE/.raceA" "$HERE/.raceB"
}
DB=qa_org_s9r; live_base $DB
apply $DB "$MIG/20261010000200_organizations_and_backfill.sql" "$MIG/20261010000210_org_rls_policies.sql" && admin500 $DB && {
  echo; echo "=== S9r Race guard admin terakhir (2 sesi) ==="
  race500 $DB S9r-01 "dua admin diturunkan bersamaan -> minimal 1 admin tersisa" \
    "update public.organization_members set role='owner' where user_id='11111111-0000-0000-0000-000000000001'" \
    "update public.organization_members set role='owner' where user_id='22222222-0000-0000-0000-000000000002'"
  race500 $DB S9r-02 "hapus akun auth admin A sambil admin B diturunkan -> minimal 1 admin tersisa" \
    "delete from auth.users where id='11111111-0000-0000-0000-000000000001'" \
    "update public.organization_members set role='owner' where user_id='22222222-0000-0000-0000-000000000002'"
}
# S9b: 500 tanpa admin_user_id yang valid -> ditolak, tanpa sisa
DB=qa_org_s9b; live_base $DB
apply $DB "$MIG/20261010000200_organizations_and_backfill.sql" "$MIG/20261010000210_org_rls_policies.sql" && {
  echo; echo "=== S9b Migration 500: calon admin tidak ada ==="
  expect_reject $DB "$MIG/20261010000500_org_admin_role.sql" S9b-01 "simkos.admin_user_id belum di-set"
  { echo "set simkos.admin_user_id = 'dddddddd-0000-0000-0000-00000000000d';"; cat "$MIG/20261010000500_org_admin_role.sql"; } > "$HERE/.m500bad.sql"
  expect_reject $DB "$HERE/.m500bad.sql" S9b-03 "bukan anggota organisasi"
  rm -f "$HERE/.m500bad.sql"
  check $DB S9b-02 "setelah ditolak tidak ada sisa" "select to_regprocedure('public.is_org_admin(uuid)') is null and exists (select 1 from pg_policies where policyname='organization_members_delete_owner')"
}

# S10: migration 600 (pindah kamar + daftar penghuni atomik) -> tes, race, rollback
M600="$MIG/20261018000600_pindah_kamar.sql"
base600() {  # $1=db : semua migration sampai 500 + org2
  live_base "$1"
  apply "$1" "$MIG/20261010000200_organizations_and_backfill.sql" "$MIG/20261010000210_org_rls_policies.sql" \
    "$HERE/07_simulated_move.sql" "$MIG/20261010000300_private_storage_buckets.sql" "$HERE/10_seed_org2.sql" && admin500 "$1"
}
as_user_sql() { echo "set role authenticated; select qa.as_user('$1');"; }
race600() {  # $1=db $2=id $3=deskripsi $4=sql sesi A (ditahan 2 dtk) $5=sql sesi B $6=sql cek (harus 't')
  local db=$1
  ( psql -X -q -v ON_ERROR_STOP=1 -d $db -c "begin; $4; select pg_sleep(2); commit;" >/dev/null 2>"$HERE/.raceA" ) &
  sleep 0.7
  psql -X -q -v ON_ERROR_STOP=1 -d $db -c "begin; $5; commit;" >/dev/null 2>"$HERE/.raceB"
  wait
  local errs; errs=$(cat "$HERE/.raceA" "$HERE/.raceB" | grep -c 'sudah terisi')
  check $db "$2" "$3 [ditolak: $errs sesi]" "select ($6) and $errs = 1"
  rm -f "$HERE/.raceA" "$HERE/.raceB"
}
DB=qa_org_s10; base600 $DB && {
  echo; echo "=== S10 Migration 600 pindah kamar ==="
  apply $DB "$M600" && {
    check $DB S10-01 "kolom tanggal_keluar (date) & catatan (text) nullable, 2 unique index parsial" \
      "select (select count(*) from information_schema.columns where table_schema='public' and table_name='rentals' and is_nullable='YES' and (column_name, data_type) in (('tanggal_keluar','date'),('catatan','text'))) = 2 and (select count(*) from pg_indexes where indexname in ('rentals_one_active_per_room','rentals_one_active_per_tenant') and indexdef like '%UNIQUE%WHERE status_aktif%') = 2"
    apply $DB "$M600" && echo "PASS | S10-02 | migration 600 idempotent (apply kedua lolos)"
    check $DB S10-03 "policy rentals tidak berubah (tetap 1: rentals_org_access)" \
      "select array_agg(policyname::text) = array['rentals_org_access'] from pg_policies where schemaname='public' and tablename='rentals'"
    apply $DB "$HERE/60_pindah_kamar_600_seed.sql" "$HERE/61_pindah_kamar_600_tests.sql" && report $DB "S10 RPC pindah_kamar & daftar_penghuni"
  }
}
# S10r: race -> dua sesi memakai kamar kosong yang sama bersamaan, hanya satu yang berhasil
DB=qa_org_s10r; base600 $DB && apply $DB "$M600" "$HERE/60_pindah_kamar_600_seed.sql" && {
  echo; echo "=== S10r Race kamar tujuan yang sama (2 sesi) ==="
  ROOM=c1000000-0000-0000-0000-000000000001
  ONE="(select count(*) from public.rentals where room_id='$ROOM' and status_aktif) = 1 and (select status_kamar from public.rooms where id='$ROOM') = 'Terisi'"
  race600 $DB S10r-01 "admin & owner memindah 2 penghuni berbeda ke kamar 3 bersamaan -> 1 berhasil" \
    "$(as_user_sql u1) select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','$ROOM','2026-10-18')" \
    "$(as_user_sql u2) select public.pindah_kamar('a3000000-0000-0000-0000-000000000002','$ROOM','2026-10-18')" \
    "$ONE and (select count(*) from public.rentals where status_aktif and tenant_id in ('a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002')) = 2"
  psql -X -q -d $DB -c "update public.rentals set status_aktif=false where room_id='$ROOM'; update public.rooms set status_kamar='Kosong' where id='$ROOM'" >/dev/null
  race600 $DB S10r-02 "pindah kamar & daftar penghuni baru ke kamar 3 bersamaan -> 1 berhasil" \
    "$(as_user_sql u2) select public.daftar_penghuni('$ROOM','Race Baru','1',null,null,'bulanan','2026-10-18','2026-11-18')" \
    "$(as_user_sql u1) select public.pindah_kamar((select id from public.rentals where status_aktif and tenant_id in ('a2000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002') limit 1),'$ROOM','2026-10-18')" \
    "$ONE"
}
# S10b: rollback 600 + guard data ganda
DB=qa_org_s10b; base600 $DB && apply $DB "$M600" "$HERE/60_pindah_kamar_600_seed.sql" && {
  echo; echo "=== S10b Rollback 600 & guard ==="
  $PSQL -d $DB -c "select public.pindah_kamar('a3000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','2026-10-18')" >/dev/null
  expect_reject $DB "$RB/rollback_600_pindah_kamar.sql" S10b-01 "Rollback dibatalkan"
  $PSQL -d $DB -c "update public.rentals set tanggal_keluar=null, catatan=null" >/dev/null
  apply $DB "$RB/rollback_600_pindah_kamar.sql" && check $DB S10b-02 "rollback: fungsi, index, kolom hilang; sewa & pemasukan tetap" \
    "select to_regprocedure('public.pindah_kamar(uuid,uuid,date,text)') is null and to_regprocedure('public.daftar_penghuni(uuid,text,text,text,text,text,date,date)') is null and to_regclass('public.rentals_one_active_per_room') is null and to_regclass('public.rentals_one_active_per_tenant') is null and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='rentals' and column_name in ('tanggal_keluar','catatan')) and (select count(*) from public.rentals where tenant_id='a2000000-0000-0000-0000-000000000001') = 2 and (select count(*) from public.incomes where rental_id='a3000000-0000-0000-0000-000000000001') = 1"
  apply $DB "$M600" && echo "PASS | S10b-03 | migration 600 bisa diterapkan ulang setelah rollback"
  $PSQL -d $DB -c "insert into public.rentals (room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo, org_id) values ('c1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000003','Bulanan','2026-10-18','2026-11-18', qa.id('org1'))" >/dev/null
  apply $DB "$RB/rollback_600_pindah_kamar.sql"
  $PSQL -d $DB -c "insert into public.rentals (room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo, org_id) values ('c1000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','Bulanan','2026-10-18','2026-11-18', qa.id('org1'))" >/dev/null
  expect_reject $DB "$M600" S10b-04 "kamar punya lebih dari satu sewa aktif"
  check $DB S10b-05 "setelah ditolak tidak ada sisa (kolom & fungsi tidak dibuat)" \
    "select to_regprocedure('public.pindah_kamar(uuid,uuid,date,text)') is null and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='rentals' and column_name='tanggal_keluar')"
}
# S10c: 600 tanpa migration 200 -> ditolak
DB=qa_org_s10c; live_base $DB
expect_reject $DB "$M600" S10c-01 "Terapkan migration 200"

rm -f "$HERE/.last_err"
echo; echo "TOTAL GAGAL: $FAILS"
[ "$FAILS" -eq 0 ]
