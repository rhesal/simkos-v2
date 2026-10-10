# QA SimKos v2

Semua tes jalan lokal tanpa akses ke Supabase live. Data uji sintetis (`@example.test`, UUID dummy).

| Folder | Isi | Cara jalan |
|---|---|---|
| `independent/` | Suite RLS independen QA untuk model organisasi (migration 200-500): akses lintas org, storage, path nota/KTP, inventaris, peran admin, guard admin terakhir, rollback | `./qa/independent/run.sh` |
| `rls/org/` | Suite RLS dari tim dev (Project Lead / System Architect) | `./qa/rls/org/run_local_org.sh` |
| `csv/`, `date/`, `inventaris/`, `move-script/` | Unit test JavaScript | `node --test qa/` |
| `archive/rls-per-user/` | Riwayat tes model per-user (sudah diganti model organisasi) | tidak perlu dijalankan |
| `test-plan-ktp-tahap1.md` | Test plan KTP + ringkasan hasil per tahap | - |

Postgres lokal harus jalan (`pg_isready`). Laporan bug dan langkah reproduksi celah disimpan di luar repo.
