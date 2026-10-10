# QA independen — model organisasi (migration 200-500)

Jalankan: `./qa/independent/run.sh` (Postgres lokal, keluar 1 bila ada yang gagal).
Fixture: baseline skema live (`docs/reference/live_schema_public.sql`) + kondisi live sebelum migration, semua data sintetis.
Migration 400 dan 500 beserta tesnya (`45_*`, `55_*`) hanya dipasang bila file migration-nya ada di repo.

Skenario: M (urutan deploy), G (policy storage licin + guard RESTRICTIVE), B (jumlah user tidak sesuai saat 200), R (rollback berurutan).

Hasil:
- `results_latest.txt` — `main` sampai migration 400: 237/237 lulus.
- `results_with_500.txt` — ditambah migration 500 (PR #11, peran admin): 313/313 lulus.

Tidak dicakup: Storage API, signed URL, komponen Vue, PWA (perlu tes di app).
