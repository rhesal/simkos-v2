# Test Plan: SimKos v2 — Pengamanan Data KTP Tahap 1 (PR #1)
Versi: 0.1 | Tanggal: 2026-10-10 | QA: QA Engineer
Sumber: https://github.com/rhesal/simkos-v2/pull/1 (branch `fix/secure-ktp-storage`), `docs/security-ktp.md`,
review System Architect (chat tim) dan `reviews/pr1-code-review.md`.

## 1. Ruang Lingkup
- Dites: kolom `owner_id` + RLS di 7 tabel, policy `storage.objects` untuk `ktp_images`/`receipt_images`,
  konfigurasi bucket (private, 5 MB, tipe file), perilaku migration saat deploy, signed URL di `src/lib/storage.js`.
- Tidak dites (tahap 2, menunggu keputusan Rhesal): validasi file di server, audit log, masking NIK, retensi/penghapusan otomatis.

## 2. Acceptance Criteria yang Dicakup
| ID AC | Deskripsi | Test Case |
|---|---|---|
| AC-01 | Bucket KTP dan nota private, tidak bisa diakses tanpa login | CFG-01, ANON-S-01/02, TC-API-01 |
| AC-02 | User hanya bisa baca/ubah/hapus data miliknya di 7 tabel | NEG-SEL/UPD/DEL-*, ANON-T-* |
| AC-03 | User tidak bisa menautkan data ke induk milik user lain | NEG-INS-01..08, NEG-MOV-01..02 |
| AC-04 | User tidak bisa baca, upload, menimpa, atau menghapus file user lain | NEG-S-01..12, NEG-MOV-03 |
| AC-05 | Signed URL berumur pendek dan tidak bocor antar sesi | TC-API-02..04 |
| AC-06 | Migration aman dijalankan di DB live (data lama tetap terlihat pemiliknya) | S2-*, CFG-06 |
| AC-07 | Migration bisa di-rollback tanpa membuka bucket jadi publik | TC-MIG-01 (manual, belum ada skrip down) |
| AC-08 (usulan QA) | Hanya JPEG/PNG/WebP yang diterima, SVG ditolak | CFG-03, TC-API-05 |

## 3. Pendekatan Testing
- **Tes RLS otomatis (SQL)** di Postgres lokal dengan stub `auth`/`storage`: `qa/archive/rls-per-user/run_local.sh`. Setiap tes negatif
  punya kontrol positif (POS-*) supaya tidak lulus palsu. Bisa dipindah ke `supabase test db`/pgTAP untuk CI.
- **Tes API (manual dulu, nanti skrip supabase-js)** di project Supabase staging dengan dua akun uji: membuktikan
  perilaku Storage API dan signed URL yang tidak bisa disimulasikan di Postgres lokal.
- **Uji skenario deploy**: S1 deploy normal, S2 lebih dari satu user saat migration, S3 ada policy storage generik lama.

## 4. Lingkungan & Data Uji
- Lokal: PostgreSQL 17, stub di `qa/archive/rls-per-user/00_supabase_stub.sql` (bukan skema Supabase asli; `auth.uid()` membaca `request.jwt.claims`).
- Staging (dibutuhkan untuk TC-API): project Supabase terpisah dari production, dua akun `qa-user-a` dan `qa-user-b`,
  data seed setara `qa/archive/rls-per-user/10_seed.sql`. Belum tersedia.
- Data uji: User A `aaaaaaaa-…0a`, User B `bbbbbbbb-…0b`, masing-masing 1 lokasi, kamar, penghuni, sewa, pemasukan,
  pengeluaran, inventaris, file KTP baru (`<uid>/…`), plus file lama berpath datar dan file tanpa `owner_id`.

## 5. Test Case
Tes SQL otomatis: lihat `qa/archive/rls-per-user/20_rls_negative_tests.sql` (68 kasus) dan `30_scenario_two_users_backfill.sql`.

Tes API / manual (staging):
| ID | Judul | Langkah | Hasil yang Diharapkan | Prioritas |
|---|---|---|---|---|
| TC-API-01 | URL publik lama mati | Buka `…/storage/v1/object/public/ktp_images/<path>` tanpa login | 400/404, gambar tidak tampil | Tinggi |
| TC-API-02 | Signed URL milik orang lain | Login A, `createSignedUrl('ktp_images', '<path milik B>')` | Error, tidak ada URL | Tinggi |
| TC-API-03 | TTL signed URL | Buat signed URL KTP, tunggu lewat TTL, buka lagi | Ditolak setelah TTL (target 5 menit untuk KTP) | Tinggi |
| TC-API-04 | Cache URL saat ganti akun | Login A, buka KTP, logout, login B di tab yang sama | Tidak ada URL/gambar KTP A yang muncul untuk B | Tinggi |
| TC-API-05 | Upload SVG / file palsu | Upload `.svg`, dan skrip/PDF yang di-rename jadi `.jpg` | Ditolak | Tinggi |
| TC-API-06 | Upload > 5 MB | Upload gambar 5,1 MB | Ditolak dengan pesan jelas | Sedang |
| TC-API-07 | Key dengan `../` | Login A, upload ke `<uidA>/../<uidB>/x.jpg` | Ditolak atau tetap tersimpan di folder A, bukan di folder B | Sedang |
| TC-API-08 | Ganti foto KTP | Upload KTP, ganti dengan foto baru | File lama terhapus dari bucket | Sedang |
| TC-API-09 | Hapus foto KTP gagal | Simulasikan delete file gagal (offline) | User melihat pesan gagal, kolom tidak dikosongkan diam-diam | Sedang |
| TC-UI-01 | KTP lewat modal + `download()` (bila disetujui) | Login A, buka KTP penghuni di modal | Gambar tampil dari `blob:` URL, tidak ada tab baru, tidak ada entri riwayat browser | Tinggi |
| TC-UI-02 | Modal milik orang lain | Login A, panggil `download()` path KTP B (DevTools) | Error, tidak ada blob | Tinggi |
| TC-UI-03 | Blob dibuang saat modal ditutup | Buka lalu tutup modal, buka ulang `blob:` URL lama | Gagal dimuat (`revokeObjectURL` jalan) | Sedang |
| TC-UI-04 | Logout saat modal terbuka | Buka modal KTP, logout, login B di tab sama | Modal tertutup, tidak ada gambar KTP A tersisa | Tinggi |
| TC-UI-05 | Header cache KTP | Cek response `download()` di tab Network | `Cache-Control` = `no-store` atau `max-age=0`, tidak tersimpan di disk cache | Sedang |
| TC-MIG-01 | Rollback | Apply migration lalu jalankan skrip down | Policy tabel kembali, bucket tetap private | Tinggi |

## 6. Edge Case & Skenario Negatif
- Insert dengan `owner_id` palsu, memindah baris sendiri ke user lain, menautkan ke induk milik orang lain.
- File lama berpath datar dan file tanpa `owner_id` (diunggah tanpa login).
- DB live punya >1 user saat migration (backfill dilewati).
- Policy storage lama yang tidak menyebut nama bucket (`using (true)`).
- Kolom induk nullable di skema asli (`incomes.rental_id`, `expenses.location_id`) membuat insert sah ditolak — perlu dicek setelah `supabase db pull`.

## 7. Kriteria Masuk & Keluar
- Masuk: skema baseline dari `supabase db pull`, staging + dua akun uji tersedia.
- Keluar: semua tes SQL lulus di S1 dan S3, S2 punya prosedur deploy yang lulus, TC-API prioritas Tinggi lulus,
  tidak ada bug Kritis/Tinggi terbuka.

## 8. Risiko & Catatan
- Hasil lokal memakai skema tebakan (`20261010000100_inferred_schema.sql`) dan stub Supabase; harus diulang terhadap skema asli.
- Policy storage yang ada di DB live belum diketahui; skenario S3 hanya simulasi pola yang umum.

## 9. Ringkasan Hasil (lokal, tes ulang 2026-10-10 setelah commit 4d20aed)
Lihat `qa/archive/rls-per-user/results_latest.txt`.
- S1 deploy normal: 68/68 | S2 dua user saat migrasi: 0/3 (menunggu data live)
- S3 `using (true)`: migration menolak apply (lulus)
- S4 `bucket_id = 'x' or true`: 61/68 (bocor) | S5 `owner is not null and auth.uid() is not null`: 63/68 (bocor)
- S6 S4+S5 + guard RESTRICTIVE usulan: 71/71
Catatan: angka di bagian ini adalah riwayat model per-user dan sudah digantikan oleh bagian 10.

## 10. Tes ulang model organisasi (PR #1, head 8896537, 2026-10-10)
`./qa/independent/run.sh`: 199/199 lulus.
- M (urutan deploy 200 -> 210 -> pindah file -> 300): 96/96
- G (policy storage `or true` / `owner is not null` + guard RESTRICTIVE): 96/96
- B (jumlah user tidak sesuai saat migration 200, gagal utuh): 2/2
- R (rollback 300 -> 210 -> 200, bucket tetap private): 4/4
Uji mutasi: tanpa guard RESTRICTIVE dan trigger path, 10 tes gagal (tes benar-benar mendeteksi regresi).
Semua temuan dari tahap per-user sudah ditutup oleh PR #1. Laporan bug disimpan di luar repo.
Belum dicakup (butuh staging / tes di app): Storage API, signed URL, modal KTP, PWA.

## 11. Pembaruan suite independen (2026-10-10, setelah PR #4-#10)
`./qa/independent/run.sh` di `main` (sampai migration 400): 237/237 lulus. Dengan migration 500 (PR #11): 313/313 lulus.
- Inventaris (migration 400): simpan aset dengan nota, path nota di luar folder org ditolak, constraint harga/tipe, hapus kamar, guard rollback.
- Peran admin (migration 500): hanya admin yang mengelola anggota; owner/staff tidak bisa menaikkan diri; peran admin tidak bisa diberikan lewat API; guard admin terakhir (termasuk race dua sesi, dicek manual).
- Uji manual alur nota Inventaris (TC6-N1 sampai N7) sudah dicoba Rhesal di live.

