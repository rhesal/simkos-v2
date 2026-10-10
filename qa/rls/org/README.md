# QA RLS — model multi-pemilik (organisasi), PR #1

`./qa/rls/org/run_local_org.sh` menjalankan tes di Postgres lokal dengan stub
`auth`/`storage` (bukan Supabase asli). Fixture memakai baseline live
(`docs/reference/live_schema_public.sql`) dan kondisi policy/grant live
(`05_live_legacy_state.sql`). Setiap migration dijalankan dengan `psql -1`.

| Skenario | Isi |
|---|---|
| S1 | Deploy normal 200 → 210 → (simulasi move) → 300, plus org kedua (owner + staff), user tanpa org, dan anon. |
| S2 | Jumlah user ≠ 2 → 200 menolak dan di-rollback bersih; override `simkos.backfill_expected_users`; 2 user → 2 owner; re-run ditolak. |
| S3 | Migration 300 sebelum file dipindah → ditolak, policy lama utuh. |
| S4 | Policy storage `using (true)` → 300 menolak. |
| S5 | Policy `bucket_id='x' or true` + `owner is not null and auth.uid() is not null` + bucket `avatars` → guard menahan (seluruh tes S1 + bucket lain). |
| S6 | Kontrol: tanpa guard, policy `x or true` membocorkan KTP org1 ke org2. |
| S7 | Rollback 300 → 210 → 200: policy live kembali persis, bucket tetap private. |

File `00_supabase_stub.sql`, `15_harness.sql`, dan `06–09_*` adalah salinan dari
`qa/rls/` milik QA, dengan tambahan (extensions/uuid-ossp, `auth.role()`, `qa.ids`,
`qa.as_user`). File QA lama di `qa/rls/` (model `owner_id`) tidak diubah. Runner lama
`qa/rls/run_local.sh` sudah usang, karena merujuk migration `owner_id` dan skema
tebakan yang sudah dihapus dari branch.

Move script dites terpisah dengan stub Storage: `node --test qa/move-script/`.
Tes yang butuh Supabase asli (header Cache-Control `download()`, UX 403 "Muat ulang
aplikasi", move script terhadap Storage API asli) perlu project staging.
