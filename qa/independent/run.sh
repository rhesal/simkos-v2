#!/usr/bin/env bash
# QA independen model organisasi (migration 200-500). Postgres lokal + stub Supabase.
# Migration 400/500 dan tesnya hanya dipasang bila file migration-nya ada di repo.
# Pakai: ./qa/independent/run.sh   (keluar 1 bila ada yang gagal)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."
MIG="$ROOT/supabase/migrations"; RB="$ROOT/supabase/rollback"; LIVE="$ROOT/docs/reference/live_schema_public.sql"
PSQL="psql -X -q -v ON_ERROR_STOP=1 --set=client_min_messages=warning"
FAILS=0; TOTAL=0
pg_isready -q || { echo "Postgres lokal tidak jalan"; exit 2; }
ok()   { echo "PASS | $1 | $2"; TOTAL=$((TOTAL+1)); }
bad()  { echo "FAIL | $1 | $2"; TOTAL=$((TOTAL+1)); FAILS=$((FAILS+1)); }
fresh(){ dropdb --if-exists "$1" >/dev/null 2>&1; createdb "$1"; $PSQL -d "$1" -f "$HERE/00_stub.sql" >/dev/null; }
ap()   { local db=$1; shift; for f in "$@"; do $PSQL -1 -d "$db" -f "$f" >/dev/null 2>"$HERE/.err" || { bad SETUP "gagal apply $(basename "$f"): $(grep -m1 ERROR "$HERE/.err")"; return 1; }; done; }
rej()  { if $PSQL -1 -d "$1" -f "$2" >/dev/null 2>"$HERE/.err"; then bad "$3" "$(basename "$2") seharusnya ditolak"; return 1; else ok "$3" "$(basename "$2") ditolak: $(grep -m1 -o 'ERROR:.*' "$HERE/.err" | cut -c1-140)"; fi; }
q()    { psql -X -d "$1" -tA "${@:2}" | tail -1; }
report(){ echo "=== $2 ==="; psql -X -d "$1" -tA -F ' | ' -c "select case when pass then 'PASS' else 'FAIL' end, test_id, descr, 'harap=' || expected, 'aktual=' || actual from qa.results order by seq"
  local n t; n=$(q "$1" -c "select count(*) from qa.results where not pass"); t=$(q "$1" -c "select count(*) from qa.results")
  FAILS=$((FAILS+n)); TOTAL=$((TOTAL+t)); echo "--- $2: $((t-n))/$t"; }
M400="$MIG/20261010000400_inventories_missing_columns.sql"; M500="$MIG/20261010000500_org_admin_role.sql"
PRE=(); POST=(); RBX=()
[ -f "$M400" ] && { PRE+=("$M400"); POST+=("$HERE/45_inventories_400_tests.sql"); RBX=("$RB/rollback_400_inventories_columns.sql" "${RBX[@]}"); }
# Admin awal di data uji = user sintetis 1111... (bukan akun live).
[ -f "$M500" ] && { export PGOPTIONS="${PGOPTIONS:-} -c simkos.admin_user_id=11111111-0000-0000-0000-000000000001"; MID=("$M500"); POST+=("$HERE/55_admin_500_tests.sql"); RBX=("$RB/rollback_500_org_admin_role.sql" "${RBX[@]}"); } || MID=()
base(){ fresh "$1"; ap "$1" "$LIVE" "$HERE/05_live_state.sql" "$MIG/20261010000200_organizations_and_backfill.sql" "$MIG/20261010000210_org_rls_policies.sql" "$HERE/12_old_bundle_upload.sql"; }

echo "=== M: 200 -> 210 -> upload bundle lama -> 300 sebelum pindah -> pindah -> 300 ==="
base qa_ind_m && rej qa_ind_m "$MIG/20261010000300_private_storage_buckets.sql" D-01 && \
  ap qa_ind_m "$HERE/13_simulated_move.sql" "$MIG/20261010000300_private_storage_buckets.sql" "${PRE[@]}" "$HERE/14_org_b_and_users.sql" "${MID[@]}" "$HERE/15_harness.sql" "$HERE/20_tests.sql" "${POST[@]}" && report qa_ind_m "M tes RLS org"

M600="$MIG/20261018000600_pindah_kamar.sql"
if [ -f "$M600" ]; then
echo "=== P: migration 600 (pindah kamar + daftar atomik) ==="
base qa_ind_p && ap qa_ind_p "$HERE/13_simulated_move.sql" "$MIG/20261010000300_private_storage_buckets.sql" "${PRE[@]}" "$HERE/14_org_b_and_users.sql" "${MID[@]}" "$M600" "$M600" "$HERE/15_harness.sql" "$HERE/65_pindah_600_tests.sql" && ok P-IDEMP "migration 600 diterapkan 2x tanpa error" && report qa_ind_p "P tes 600"
  out=$("$HERE/66_pindah_600_race.sh" qa_ind_p); echo "$out"
  TOTAL=$((TOTAL+$(grep -c '^\(PASS\|FAIL\)' <<<"$out"))); FAILS=$((FAILS+$(grep -c '^FAIL' <<<"$out")))
  rej qa_ind_p "$RB/rollback_600_pindah_kamar.sql" P-RB-GUARD
  fresh qa_ind_p2; ap qa_ind_p2 "$LIVE" "$HERE/05_live_state.sql" "$MIG/20261010000200_organizations_and_backfill.sql" "$MIG/20261010000210_org_rls_policies.sql" "$M600" "$RB/rollback_600_pindah_kamar.sql" "$M600" && ok P-RB "600 -> rollback (data kosong) -> 600 lagi berjalan"
  $PSQL -d qa_ind_p2 -c "insert into public.rentals (room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo, org_id) select 'a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000013','bulanan',current_date,current_date,org_id from public.rooms where id='a0000000-0000-0000-0000-000000000002'" >/dev/null 2>&1 && bad P-DUP "sewa aktif ganda bisa dibuat" || ok P-DUP "sewa aktif ganda per kamar ditolak index"
  $PSQL -d qa_ind_p2 -f "$RB/rollback_600_pindah_kamar.sql" >/dev/null 2>&1; $PSQL -d qa_ind_p2 -c "insert into public.rentals (room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo, org_id) select 'a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000013','bulanan',current_date,current_date,org_id from public.rooms where id='a0000000-0000-0000-0000-000000000002'" >/dev/null
  rej qa_ind_p2 "$M600" P-PRECHECK
  fresh qa_ind_p3; ap qa_ind_p3 "$LIVE" "$HERE/05_live_state.sql" "$MIG/20261010000200_organizations_and_backfill.sql" "$MIG/20261010000210_org_rls_policies.sql" && $PSQL -d qa_ind_p3 -c "update public.rooms set status_kamar='kosong'" >/dev/null && rej qa_ind_p3 "$M600" P-PRECHECK-STATUS
fi

echo "=== G: policy storage 'or true' + 'owner is not null' sebelum 300 ==="
base qa_ind_g && ap qa_ind_g "$HERE/../rls/07_legacy_or_true_policy.sql" "$HERE/../rls/08_legacy_owner_not_null_policy.sql" "$HERE/13_simulated_move.sql" \
  "$MIG/20261010000300_private_storage_buckets.sql" "${PRE[@]}" "$HERE/14_org_b_and_users.sql" "${MID[@]}" "$HERE/15_harness.sql" "$HERE/20_tests.sql" "${POST[@]}" && report qa_ind_g "G guard RESTRICTIVE"

echo "=== B: 3 user saat migration 200 ==="
fresh qa_ind_b; ap qa_ind_b "$LIVE" "$HERE/05_live_state.sql"
$PSQL -d qa_ind_b -c "insert into auth.users(id,email) values ('99999999-0000-0000-0000-000000000009','extra@example.test')" >/dev/null
rej qa_ind_b "$MIG/20261010000200_organizations_and_backfill.sql" B-01
[ "$(q qa_ind_b -c "select count(*) from information_schema.tables where table_name='organizations'")" = 0 ] && ok B-02 "tidak ada sisa tabel organizations" || bad B-02 "migration 200 meninggalkan sisa"

echo "=== R: rollback 300 -> 210 -> 200 ==="
if ap qa_ind_m "${RBX[@]}" "$RB/rollback_300_storage.sql" "$RB/rollback_210_org_rls.sql" "$RB/rollback_200_organizations.sql"; then
  ok R-01 "rollback berjalan"
  [ "$(q qa_ind_m -c "select count(*) from storage.buckets where id in ('ktp_images','receipt_images') and not public")" = 2 ] && ok R-02 "bucket tetap private" || bad R-02 "bucket jadi public"
  n=$(q qa_ind_m -c "set role anon" -c "select count(*) from storage.objects where bucket_id in ('ktp_images','receipt_images')"); [ "$n" = 0 ] && ok R-03 "anon tidak melihat file" || bad R-03 "anon melihat $n file"
  n=$(q qa_ind_m -c "set role authenticated" -c "select set_config('request.jwt.claims','{\"sub\":\"22222222-0000-0000-0000-000000000002\",\"role\":\"authenticated\"}',false)" -c "select count(*) from storage.objects where bucket_id='ktp_images' and name like '%/ktp_1700000000001.jpg'")
  [ "$n" = 1 ] && ok R-04 "partner masih bisa membuka KTP setelah rollback" || bad R-04 "KTP tidak terbaca setelah rollback ($n)"
fi
rm -f "$HERE/.err"
echo; echo "TOTAL: $((TOTAL-FAILS))/$TOTAL lulus, $FAILS gagal"
[ "$FAILS" -eq 0 ]
