# Arsip tes QA

`rls-per-user/` berisi tes RLS untuk model kepemilikan **per user** (`owner_id`)
dari versi awal PR #1. Model itu diganti model **organisasi** sebelum merge
(migration 200/210/300), jadi tes di sini **tidak valid lagi** untuk skema saat ini
dan disimpan hanya sebagai riwayat (bukti BUG-001..003).

Tes yang berlaku sekarang:
- `qa/rls/org/run_local_org.sh` — tes RLS model organisasi.
- `qa/independent/run.sh` — verifikasi independen QA (memakai
  `qa/rls/07_legacy_or_true_policy.sql` dan `qa/rls/08_legacy_owner_not_null_policy.sql`,
  karena itu kedua file tersebut tetap di `qa/rls/`).
- `node --test qa/move-script/` — tes skrip pindah file.

`rls-per-user/run_local.sh` merujuk file 07/08 di folder yang sama; kalau suatu saat
perlu dijalankan ulang, salin kedua file itu ke sini dulu.
