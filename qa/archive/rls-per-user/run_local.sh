#!/usr/bin/env bash
# QA KTP tahap 1 — jalankan tes RLS negatif di Postgres lokal (bukan Supabase).
# Pakai: ./qa/rls/run_local.sh   (butuh psql + server Postgres lokal yang bisa diakses user ini)
# Keluar dengan kode 1 bila ada tes yang gagal.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../../supabase/migrations"
SCHEMA="$HERE/../../docs/reference/inferred_schema.sql"   # skema tebakan; ganti dengan baseline db pull bila sudah ada
PSQL="psql -X -q -v ON_ERROR_STOP=1 --set=client_min_messages=warning"
FAILS=0
pg_isready -q || { echo "Postgres lokal tidak jalan. Jalankan: sudo pg_ctlcluster 17 main start"; exit 2; }

fresh_db() { dropdb --if-exists "$1" >/dev/null 2>&1; createdb "$1"; $PSQL -d "$1" -f "$HERE/00_supabase_stub.sql" >/dev/null; }
apply() { local db=$1; shift; for f in "$@"; do $PSQL -d "$db" -f "$f" >/dev/null 2>"$HERE/.last_err" || { echo "  GAGAL apply $(basename "$f"):"; cat "$HERE/.last_err"; FAILS=$((FAILS+1)); return 1; }; done; }
report() {
  local db=$1 title=$2
  echo; echo "=== $title ==="
  psql -X -d "$db" -tA -F ' | ' -c "select case when pass then 'PASS' else 'FAIL' end, test_id, descr, 'harap=' || expected, 'aktual=' || actual from qa.results order by seq"
  local n; n=$(psql -X -d "$db" -tAc "select count(*) from qa.results where not pass")
  local t; t=$(psql -X -d "$db" -tAc "select count(*) from qa.results")
  echo "--- $title: $((t-n))/$t lulus"
  FAILS=$((FAILS+n))
}

# S1: alur deploy normal (DB live lama dengan 1 user, bucket publik, policy allow-all)
DB=qa_ktp_s1; fresh_db $DB
$PSQL -d $DB -c "insert into auth.users(id,email) values ('aaaaaaaa-0000-0000-0000-00000000000a','qa-user-a@example.test')" >/dev/null
apply $DB "$SCHEMA" "$HERE/05_legacy_state.sql" \
  "$MIG/20261010000200_owner_id_and_rls.sql" "$MIG/20261010000300_private_storage_buckets.sql" \
  "$HERE/10_seed.sql" "$HERE/15_harness.sql" "$HERE/20_rls_negative_tests.sql" && report $DB "S1 Deploy normal + tes RLS negatif"

# S2: >1 user + data lama saat migration 200 (backfill dilewati)
DB=qa_ktp_s2; fresh_db $DB
apply $DB "$SCHEMA" "$HERE/05_legacy_state.sql"
$PSQL -d $DB >/dev/null <<'SQL'
insert into auth.users(id,email) values ('aaaaaaaa-0000-0000-0000-00000000000a','qa-user-a@example.test'),('bbbbbbbb-0000-0000-0000-00000000000b','qa-user-b@example.test');
insert into public.locations(nama_lokasi) values ('Kos Lama');
insert into public.tenants(nama_lengkap, foto_ktp_url) values ('Penghuni Lama', 'ktp_lama.jpg');
SQL
apply $DB "$MIG/20261010000200_owner_id_and_rls.sql" "$MIG/20261010000300_private_storage_buckets.sql" \
  "$HERE/15_harness.sql" "$HERE/30_scenario_two_users_backfill.sql" && report $DB "S2 Dua user saat migrasi (backfill)"

expect_reject() {  # apply harus GAGAL (migration menolak)
  local db=$1 f=$2 id=$3
  if $PSQL -d "$db" -f "$f" >/dev/null 2>"$HERE/.last_err"; then
    echo "FAIL | $id | $(basename "$f") seharusnya menolak apply, tapi lolos"; FAILS=$((FAILS+1)); return 1
  else
    echo "PASS | $id | $(basename "$f") menolak apply: $(grep -m1 -o 'ERROR:.*' "$HERE/.last_err" | cut -c1-160)"
  fi
}
base_with_policy() {  # $1=db, $2..=file policy lama tambahan
  local db=$1; shift; fresh_db $db
  $PSQL -d $db -c "insert into auth.users(id,email) values ('aaaaaaaa-0000-0000-0000-00000000000a','qa-user-a@example.test')" >/dev/null
  apply $db "$SCHEMA" "$HERE/05_legacy_state.sql" "$@" "$MIG/20261010000200_owner_id_and_rls.sql"
}

# S3: policy generik 'using (true)' -> migration 300 harus menolak apply
echo; echo "=== S3 Policy storage generik 'using (true)' ==="
base_with_policy qa_ktp_s3 "$HERE/06_legacy_generic_storage_policy.sql" && \
  expect_reject qa_ktp_s3 "$MIG/20261010000300_private_storage_buckets.sql" S3-01

# S4/S5: policy permisif yang lolos cek teks -> apply lolos, lalu tes kebocoran
for sc in "S4:07_legacy_or_true_policy.sql:policy 'bucket_id = x or true'" "S5:08_legacy_owner_not_null_policy.sql:policy 'owner is not null and auth.uid() is not null'"; do
  IFS=: read -r id file title <<<"$sc"; DB=qa_ktp_$(echo $id | tr A-Z a-z)
  if base_with_policy $DB "$HERE/$file" && $PSQL -d $DB -f "$MIG/20261010000300_private_storage_buckets.sql" >/dev/null 2>"$HERE/.last_err"; then
    apply $DB "$HERE/10_seed.sql" "$HERE/15_harness.sql" "$HERE/20_rls_negative_tests.sql" && report $DB "$id $title (lolos migration 300)"
  else
    echo; echo "=== $id $title ==="; grep -q 'ERROR' "$HERE/.last_err" || { echo "FAIL | $id-00 | setup gagal"; FAILS=$((FAILS+1)); continue; }; echo "PASS | $id-00 | migration 300 menolak apply: $(grep -m1 -o 'ERROR:.*' "$HERE/.last_err" | cut -c1-160)"
  fi
done

# S6: S4 + S5 + bucket lain + guard RESTRICTIVE usulan (belum di PR)
DB=qa_ktp_s6
base_with_policy $DB "$HERE/07_legacy_or_true_policy.sql" "$HERE/08_legacy_owner_not_null_policy.sql" && \
GUARD="$HERE/40_proposed_restrictive_guard.sql"; grep -qi 'as restrictive' "$MIG/20261010000300_private_storage_buckets.sql" && GUARD=""
apply $DB "$MIG/20261010000300_private_storage_buckets.sql" $GUARD \
  "$HERE/10_seed.sql" "$HERE/09_other_bucket.sql" "$HERE/15_harness.sql" "$HERE/20_rls_negative_tests.sql" "$HERE/25_other_bucket_tests.sql" && \
  report $DB "S6 S4+S5 + guard RESTRICTIVE ${GUARD:+(usulan QA)}${GUARD:-(dari migration 300)}"

rm -f "$HERE/.last_err"
echo; echo "TOTAL GAGAL: $FAILS"
[ "$FAILS" -eq 0 ]
