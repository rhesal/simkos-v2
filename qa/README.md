# QA SimKos v2

- `test-plan-ktp-tahap1.md` — test plan KTP tahap 1 (PR #1)
- `archive/rls-per-user/run_local.sh` — tes RLS negatif otomatis di Postgres lokal (3 skenario). Keluar kode 1 bila ada yang gagal.
- `rls/results_latest.txt` — hasil terakhir
- `bugs/` — laporan bug

Menjalankan: `sudo pg_ctlcluster 17 main start` lalu `./qa/archive/rls-per-user/run_local.sh` dari root repo.
Catatan: belum di-commit ke branch PR (sesuai arahan Project Lead).
