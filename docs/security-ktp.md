# Pengamanan Data KTP & Nota (SimKos v2)

Dokumen ini menjelaskan perubahan keamanan untuk foto KTP penghuni dan foto nota,
serta langkah **manual** yang harus dilakukan di Supabase. Perubahan kode saja
**belum** mengamankan data — bucket dan RLS harus diubah di Supabase.

## 1. Masalah sebelumnya

- Bucket `ktp_images` dan `receipt_images` bersifat **public**. Siapa pun yang tahu
  URL file bisa melihat foto KTP tanpa login.
- Inventaris menyimpan **URL publik penuh** di kolom `inventories.receipt_url`.
- Skema database dan aturan RLS tidak ada di repo, dan tidak ada kolom pemilik data.
  Anon key Supabase ada di bundle JS publik, jadi tanpa RLS yang benar data
  berpotensi bisa dibaca/diubah siapa saja.

## 2. Yang berubah

### Kode frontend
| File | Perubahan |
|---|---|
| `src/lib/storage.js` (baru) | Helper: `uploadPrivateFile`, `getSignedUrl(s)`, `toStoragePath` (ekstrak path dari URL lama), `removeStorageFile` (best effort), `deleteStorageFile` (melempar error), `validateImageFile`. Signed URL per bucket: **`ktp_images` 5 menit, tanpa cache**; **`receipt_images` 1 jam**, di-cache dan dibuang saat sisa umurnya < 20% TTL. Cache dikosongkan saat `SIGNED_OUT` / user berganti (`initStorageAuthListener`, dipasang di `main.js`) dan saat tombol logout. |
| Validasi file (semua form upload) | Hanya `image/jpeg`, `image/png`, `image/webp`, maks 5 MB (SVG ditolak). Atribut `accept` ikut dibatasi. Nama file `<user_id>/<prefix>_<UUID acak>.<ext>`, ekstensi dari MIME type — nama file asli tidak dipakai. |
| `src/views/TambahPenghuniView.vue` | Upload KTP ke path `<user_id>/ktp_<uuid>.<ext>`. |
| `src/views/DaftarPenghuniView.vue` | Tidak lagi `getPublicUrl`. "Lihat Foto" membuat signed URL saat diklik. **Hapus/Ganti KTP:** file dihapus dari storage dulu; kolom `foto_ktp_url` baru dikosongkan bila penghapusan berhasil, kalau gagal user mendapat pesan error dan data tidak diubah. **Unggah KTP pengganti:** file lama dihapus setelah path baru tersimpan (user diberi tahu bila gagal). |
| `src/views/InventarisView.vue` | Menyimpan **path** (bukan URL publik). Pratinjau & tombol 📷 memakai signed URL. Nota lama dihapus saat diganti / aset dihapus. |
| `src/views/TambahPengeluaranView.vue` | Upload nota ke path ber-prefix user id. |

**Kompatibel dengan data lama:** baris yang masih berisi URL publik penuh
(`https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<file>`) tetap bisa
dibuka — path diekstrak otomatis. File lama berpath datar (`ktp_123.jpg`) tetap bisa
diakses pemiliknya lewat kolom `owner_id` di `storage.objects`.

### Migration (`supabase/migrations/`)
1. `20261010000200_owner_id_and_rls.sql` — tambah kolom `owner_id` (default
   `auth.uid()`) ke semua tabel, backfill otomatis bila hanya ada 1 user, hapus semua
   policy lama di 7 tabel, aktifkan RLS: hanya user login dan hanya baris miliknya.
2. `20261010000300_private_storage_buckets.sql` — **gagal dengan sengaja** bila ada
   policy storage generik yang permisif (lihat bagian "Policy storage generik"),
   bucket jadi private (maks 5 MB, hanya JPEG/PNG/WEBP), hapus policy storage lama
   untuk kedua bucket, policy baru: upload hanya ke folder `<user_id>/`;
   baca/ubah/hapus folder sendiri atau file lama yang `owner_id`-nya milik user.

### Referensi skema (`docs/reference/`)
- `inferred_schema.sql` — skema 7 tabel **disimpulkan dari kode**, bukan dump DB live.
  **Bukan migration** (sengaja tidak di `supabase/migrations/`, karena
  `create table if not exists` akan no-op diam-diam di DB live dan menyembunyikan
  perbedaan). Dipakai sebagai dokumentasi dan untuk tes lokal. Baseline skema yang sah
  harus dari `supabase db pull`.

### Script opsional (`supabase/scripts/`)
- `backfill_owner.sql` — backfill manual bila ada lebih dari 1 user.
- `convert_public_urls_to_paths.sql` — merapikan baris lama dari URL publik ke path.

## 3. Urutan penerapan (PENTING)

> Kode baru tetap jalan dengan bucket public **dan** private. Kode lama **rusak**
> jika bucket sudah private (foto tidak tampil, upload KTP penghuni baru gagal).
> Jadi: **deploy kode dulu, baru ubah Supabase.**

### Langkah 0 — Deploy kode
1. Review & merge PR ini ke `main` (Vercel akan deploy production).
2. Buka aplikasi, pastikan login, daftar penghuni, lihat KTP, dan inventaris masih jalan
   (bucket masih public pada tahap ini).

### Langkah 1 — Backup
1. Supabase Dashboard → **Database → Backups**: pastikan ada backup terbaru
   (paket Free: backup harian tidak bisa di-restore mandiri, jadi lakukan juga dump):
   ```bash
   supabase link --project-ref <PROJECT_REF>
   supabase db dump -f backup_schema.sql
   supabase db dump --data-only -f backup_data.sql
   ```
2. Catat policy yang ada sekarang (untuk rollback):
   ```sql
   select schemaname, tablename, policyname, cmd, roles, qual, with_check
   from pg_policies
   where schemaname in ('public','storage');
   ```

### Langkah 2 — Verifikasi skema
```bash
supabase db pull
```
Bandingkan hasilnya dengan `docs/reference/inferred_schema.sql`. Bila berbeda
(tipe id bukan uuid, nama kolom lain, dsb.), **beri tahu tim** sebelum lanjut — policy
di migration 200 mengacu ke nama kolom tersebut.

Cek juga jumlah user:
```sql
select id, email, created_at from auth.users order by created_at;
```
- **1 user** → backfill `owner_id` otomatis.
- **>1 user** → migration 200 akan menampilkan WARNING; jalankan
  `supabase/scripts/backfill_owner.sql` (isi `<OWNER_USER_ID>`) sebelum memakai app.

### Langkah 3 — Jalankan migration (berurutan)
Lewat **SQL Editor** (tempel isi file satu per satu, urut nama file), atau CLI:
```bash
supabase db push
```
Catatan CLI: migration baseline hasil `db pull` (Langkah 2) harus bertimestamp
lebih awal dari `20261010000200` dan ditandai sudah diterapkan
(`supabase migration repair --status applied <timestamp_baseline>`), karena tabelnya
sudah ada di DB live.

Urutan: `...200_owner_id_and_rls` → **tes (Langkah 4)** →
cek **policy storage generik** (bagian di bawah) → `...300_private_storage_buckets` →
**tes lagi**.

### Policy storage generik (WAJIB dicek sebelum migration 300)
Policy di Postgres digabung dengan OR. Kalau di `storage.objects` ada policy lama
seperti `for select to public using (true)` (sering dibuat dari template Dashboard),
bucket private tetap bisa dibaca siapa pun lewat `createSignedUrl` / `download`.
Migration 300 karena itu **berhenti dengan ERROR** ("Migration dibatalkan: ada policy
storage.objects permisif ...") bila menemukan policy PERMISSIVE untuk
SELECT/INSERT/UPDATE/DELETE/ALL yang:
- ekspresinya kosong atau `true`, atau
- tidak membatasi bucket secara positif (`bucket_id = '...'` / `bucket_id = ANY(...)`)
  **dan** tidak membatasi pemilik (`owner`/`owner_id`/`storage.foldername(name)`
  dibandingkan dengan `auth.uid()`). Contoh: `bucket_id <> 'avatars'`,
  `auth.role() = 'authenticated'`.

Policy yang menyebut `ktp_images`/`receipt_images` tidak dicek karena memang dihapus
oleh migration. Pemeriksaannya berbasis teks: ekspresi seperti
`bucket_id = 'x' OR true` tidak terdeteksi, jadi tetap baca hasil query di bawah.

1. Lihat semua policy storage:
   ```sql
   select policyname, permissive, roles, cmd, qual, with_check
   from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
   order by policyname;
   ```
2. Untuk tiap policy yang permisif tanpa filter bucket/pemilik, putuskan:
   - **Tidak dipakai** → hapus:
     ```sql
     drop policy "Nama Policy" on storage.objects;
     ```
   - **Dipakai bucket lain** (mis. `avatars`) → ganti dengan versi yang dibatasi:
     ```sql
     drop policy "Nama Policy" on storage.objects;
     create policy "avatars public read" on storage.objects
       for select to public using (bucket_id = 'avatars');
     ```
   - **Sudah dicek dan memang harus tetap ada** → tambahkan namanya ke array
     `allowed` di langkah 0 migration 300 (dan jelaskan alasannya di PR).
   Alternatif lewat Dashboard: **Storage → Policies** → hapus/edit policy terkait.
3. Jalankan ulang migration 300. Pesan error-nya mencantumkan nama, perintah, role,
   dan ekspresi policy yang bermasalah (bagian DETAIL).

Bila SQL Editor menolak membuat policy di `storage.objects` (permission), buat policy
yang sama lewat **Storage → Policies** di Dashboard, dan ubah bucket ke private lewat
**Storage → bucket → Edit → Public: off**.

### Langkah 4 — Verifikasi
SQL:
```sql
-- RLS aktif di semua tabel
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('locations','rooms','tenants','rentals','incomes','expenses','inventories');

-- Tidak ada baris tanpa pemilik
select 'tenants', count(*) from tenants where owner_id is null
union all select 'locations', count(*) from locations where owner_id is null;

-- Bucket private
select id, public from storage.buckets where id in ('ktp_images','receipt_images');

-- File lama tanpa pemilik (tidak akan bisa dibuka lewat app)
select bucket_id, count(*) from storage.objects
where bucket_id in ('ktp_images','receipt_images') and owner_id is null
group by bucket_id;
```

Aplikasi (login sebagai pemilik):
- [ ] Beranda, Keuangan, Riwayat, Inventaris, Daftar Penghuni menampilkan data seperti sebelumnya.
- [ ] Detail kamar → Edit → "Lihat Foto" KTP membuka foto (URL berisi `/object/sign/` dan `token=`).
- [ ] Daftar penghuni baru dengan foto KTP berhasil.
- [ ] Ganti KTP → unggah ulang berhasil.
- [ ] Tambah pengeluaran dengan nota, tambah/edit aset dengan nota, tombol 📷 menampilkan foto.

Tes keamanan:
- [ ] Buka URL publik lama foto KTP di jendela incognito → harus **gagal** (400/404).
- [ ] Panggil REST tanpa login:
      `curl "https://<ref>.supabase.co/rest/v1/tenants?select=*" -H "apikey: <ANON_KEY>"`
      → harus `[]` atau error permission, **bukan** data penghuni.

### Langkah 5 (opsional) — Rapikan data lama
Jalankan `supabase/scripts/convert_public_urls_to_paths.sql` (bagian SELECT pratinjau
dulu). Aplikasi tetap jalan tanpa langkah ini.

## 4. Rollback darurat
- Bucket: `update storage.buckets set public = true where id in ('ktp_images','receipt_images');`
  (membuka kembali foto KTP ke publik — hanya sementara!).
- RLS: buat ulang policy lama dari catatan Langkah 1, atau restore dari backup.
  Jangan `disable row level security` kecuali benar-benar darurat.

## 5. Yang harus dicek manual / asumsi
- Skema hasil inferensi (`docs/reference/inferred_schema.sql`: tipe uuid, nullability,
  ON DELETE) belum dicocokkan dengan DB live.
- Asumsi: setiap akun login adalah pemilik kos yang datanya terpisah. Bila beberapa
  akun (mis. staf) harus melihat data yang sama, desain owner perlu diubah
  (mis. tabel anggota per lokasi) — kabari tim sebelum menerapkan migration 200.
- Kolom `storage.objects.owner_id` diasumsikan ada (proyek Supabase modern). Di proyek
  sangat lama kolomnya bernama `owner` (uuid).
- File storage lama yang `owner_id`-nya NULL tidak bisa dibuka lewat app setelah
  bucket private — isi lewat `backfill_owner.sql`.
- Migration 200 & 300 **menghapus** policy lama di 7 tabel aplikasi dan policy storage
  yang menyebut kedua bucket. Policy untuk bucket/tabel lain tidak disentuh.
- Batas file bucket diset 5 MB & `image/jpeg`, `image/png`, `image/webp` (tanpa SVG),
  sama dengan validasi di aplikasi (`validateImageFile` di `src/lib/storage.js`).
- Kode belum memakai transaksi DB untuk pendaftaran/checkout (di luar cakupan PR ini).

## 6. TODO — menunggu akses baca DB live

Butuh hasil `supabase db pull`, dump `pg_policies` (schema `public` & `storage`), dan
jumlah user di `auth.users` sebelum dikerjakan:

- [ ] **Migration rollback (down)** yang mengembalikan policy tabel dari dump
      `pg_policies` **tanpa** membuat bucket kembali publik. Bagian 4 di atas hanya
      langkah darurat manual.
- [ ] **Backfill `owner_id`** dijalankan sebelum/bersamaan dengan migration 200 bila
      ada >1 user (sekarang dilewati otomatis, data lama jadi tak terlihat sampai
      `backfill_owner.sql` dijalankan manual).
- [ ] **Policy insert dengan induk nullable** (`incomes_insert_own` → `rental_id`,
      `expenses_insert_own` → `location_id`): bila kolomnya nullable di DB live, pakai
      pola `(kolom is null or exists (...))`.
- [ ] **`owner_id` ON DELETE** (perilaku FK ke `auth.users` saat akun dihapus)
      disesuaikan dengan skema dan kebijakan retensi.
- [ ] Ganti `docs/reference/inferred_schema.sql` sebagai acuan tes dengan baseline
      `db pull`, lalu ulangi tes QA (`qa/rls`).
