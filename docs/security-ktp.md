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
| `src/lib/storage.js` (baru) | Helper: `uploadPrivateFile`, `getSignedUrl(s)` (signed URL 1 jam + cache), `toStoragePath` (ekstrak path dari URL lama), `removeStorageFile`. |
| `src/views/TambahPenghuniView.vue` | Upload KTP ke path `<user_id>/ktp_<waktu>_<acak>.<ext>`. |
| `src/views/DaftarPenghuniView.vue` | Tidak lagi `getPublicUrl`. "Lihat Foto" membuat signed URL saat diklik. Saat KTP "Ganti", file lama ikut dihapus dari storage. Upload ulang memakai path ber-prefix user id. |
| `src/views/InventarisView.vue` | Menyimpan **path** (bukan URL publik). Pratinjau & tombol 📷 memakai signed URL. Nota lama dihapus saat diganti / aset dihapus. |
| `src/views/TambahPengeluaranView.vue` | Upload nota ke path ber-prefix user id. |

**Kompatibel dengan data lama:** baris yang masih berisi URL publik penuh
(`https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<file>`) tetap bisa
dibuka — path diekstrak otomatis. File lama berpath datar (`ktp_123.jpg`) tetap bisa
diakses pemiliknya lewat kolom `owner_id` di `storage.objects`.

### Migration (`supabase/migrations/`)
1. `20261010000100_inferred_schema.sql` — skema 7 tabel **disimpulkan dari kode**
   (`create table if not exists`, jadi no-op di DB live). **Harus diverifikasi**
   dengan `supabase db pull`.
2. `20261010000200_owner_id_and_rls.sql` — tambah kolom `owner_id` (default
   `auth.uid()`) ke semua tabel, backfill otomatis bila hanya ada 1 user, hapus semua
   policy lama di 7 tabel, aktifkan RLS: hanya user login dan hanya baris miliknya.
3. `20261010000300_private_storage_buckets.sql` — bucket jadi private (maks 5 MB,
   hanya gambar), hapus policy storage lama untuk kedua bucket, policy baru:
   upload hanya ke folder `<user_id>/`; baca/ubah/hapus folder sendiri atau file lama
   yang `owner_id`-nya milik user.

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
Bandingkan hasilnya dengan `20261010000100_inferred_schema.sql`. Bila berbeda
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
Catatan CLI: bila `db pull` membuat migration baseline sendiri, tandai file
inferred sebagai sudah diterapkan agar tidak bentrok:
`supabase migration repair --status applied 20261010000100`.

Urutan: `...100_inferred_schema` → `...200_owner_id_and_rls` → **tes (Langkah 4)** →
`...300_private_storage_buckets` → **tes lagi**.

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
- Skema hasil inferensi (tipe uuid, nullability, ON DELETE) belum dicocokkan dengan DB live.
- Asumsi: setiap akun login adalah pemilik kos yang datanya terpisah. Bila beberapa
  akun (mis. staf) harus melihat data yang sama, desain owner perlu diubah
  (mis. tabel anggota per lokasi) — kabari tim sebelum menerapkan migration 200.
- Kolom `storage.objects.owner_id` diasumsikan ada (proyek Supabase modern). Di proyek
  sangat lama kolomnya bernama `owner` (uuid).
- File storage lama yang `owner_id`-nya NULL tidak bisa dibuka lewat app setelah
  bucket private — isi lewat `backfill_owner.sql`.
- Migration 200 & 300 **menghapus** policy lama di 7 tabel aplikasi dan policy storage
  yang menyebut kedua bucket. Policy untuk bucket/tabel lain tidak disentuh.
- Batas file bucket diset 5 MB & `image/*`, sama dengan validasi di aplikasi.
- Kode belum memakai transaksi DB untuk pendaftaran/checkout (di luar cakupan PR ini).
