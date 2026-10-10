# QA independen — PR #1 model organisasi
Jalankan: `./qa/independent/run.sh` (Postgres lokal). Fixture: baseline live + kondisi live sebelum PR.
Skenario M (urutan deploy), G (policy storage licin + guard), B (3 user saat 200), R (rollback).
Hasil terakhir: head 8896537, 199/199 lulus (`results_latest.txt`).
Tidak dicakup: skrip .mjs, Storage API, signed URL, modal KTP, PWA (butuh staging / tes di app).
