# Tagihan bersama (semua kos)

Pengeluaran yang berlaku untuk semua kos, misalnya internet, dicatat **sekali** sebagai satu baris di `public.expenses` dengan **`location_id IS NULL`**. Nominalnya tidak dibagi ke tiap kos.

- **Konvensi:** `expenses.location_id IS NULL` berarti tagihan bersama. Saat ini satu-satunya jalur input yang bisa menyimpan nilai itu adalah opsi "🌐 Tagihan bersama (semua kos)" di `TambahPengeluaranView.vue`.
- **DB:** tidak perlu migration. Kolomnya sudah nullable dan policy `expenses_org_access` (migration 210) mengizinkan `location_id is null`. `org_id` tetap terisi dari default `current_org_id()`, dan trigger `expenses_nota_path_org` tetap memeriksa path nota `<org_id>/...`.
- **Perhitungan:**
  - Tagihan bersama dihitung di total gabungan ("Semua Lokasi").
  - Tagihan bersama tidak termasuk total per kos, supaya tidak terhitung dobel.
  - Di Buku Besar, baris tagihan bersama tetap tampil saat filter satu kos, dengan badge "🌐 Tagihan bersama".
  - Export CSV punya kolom `Dihitung di total kos ini`.
- **Hapus lokasi:** FK `ON DELETE CASCADE` tidak menyentuh baris dengan `location_id` NULL, jadi tagihan bersama tidak ikut terhapus.

## Ubah & hapus pengeluaran (CRUD)

Ini berlaku untuk semua pengeluaran, baik per kos maupun tagihan bersama.

**Aturan umum file dan baris: BARIS dulu, FILE belakangan.**
- Perubahan di DB selalu dilakukan lebih dulu. File di Storage baru dihapus setelah DB berhasil berubah, supaya tidak pernah ada baris yang menunjuk ke file yang sudah hilang.
- Kalau penghapusan file gagal, itu bukan error yang memblokir. Kegagalannya dicatat di console sebagai file yatim, dan user mendapat pesan bergaya sukses: "... Sisa file nota akan dibersihkan saat perawatan berkala."
- File yatim aman, karena bucket-nya private dan hanya bisa diakses anggota org.

**Alur per aksi:**
- **Lihat:** buka Buku Besar (`/riwayat-transaksi`), lalu ketuk baris pengeluaran. Baris yang bisa diketuk ditandai `›`, dan juga bisa dibuka lewat Enter atau Spasi. Modal detail menampilkan tanggal, kategori, lokasi, keterangan, dan foto nota (lewat signed URL). Saat modal terbuka, fokus pindah ke dialog sehingga Esc bisa menutupnya. Setelah ditutup, fokus kembali ke baris asal.
- **Ubah:** buka `/pengeluaran/:id/edit`. Form-nya memakai ulang `TambahPengeluaranView.vue`. Kalau `:id` bukan UUID, atau barisnya tidak ada atau tidak bisa diakses, yang tampil adalah "Pengeluaran tidak ditemukan".
  - **Nota tidak diubah:** `bukti_nota_url` **tidak ikut** dikirim di payload update, supaya nota yang baru ditambahkan partner tidak tertimpa.
  - **Ganti nota:**
    1. File baru di-upload ke `<org_id>/...`.
    2. Baris diperbarui dengan **compare-and-set** terhadap nilai nota yang terakhir diketahui: `.is('bukti_nota_url', null)` atau `.eq('bukti_nota_url', known)`. Nilai `known` adalah nilai setelah penghapusan nota di sesi yang sama, kalau ada.
    3. Kalau 0 baris berubah, muncul pesan "Data sudah diubah oleh pengguna lain, muat ulang halaman.", atau "tidak ditemukan" kalau barisnya sudah dihapus. File baru lalu dihapus lagi.
    4. Kalau berhasil, file nota lama dihapus (non-blocking).
  - **Hapus nota:** kolom dikosongkan dulu dengan compare-and-set yang sama, baru file-nya dihapus (non-blocking).
  - Validasi file: JPG/PNG/WEBP, maksimal 5 MB.
- **Hapus pengeluaran:**
  - Ada konfirmasi berisi nominal dan tanggal, plus peringatan bahwa nota ikut terhapus permanen.
  - Baris dihapus dulu, baru file nota (non-blocking).
  - Total di layar langsung dihitung ulang.

**RLS:** tidak perlu migration.
- Policy `expenses_org_access` (migration 210) berlaku `for all` dengan `is_org_member(org_id)`, jadi update dan delete diizinkan untuk anggota org. `location_id` NULL juga lolos `with check`.
- Trigger `expenses_nota_path_org` mengizinkan nilai yang tidak berubah, `NULL`, dan path baru berprefiks `<org_id>/`.
- Policy storage `simkos_private_images_delete_org` mengizinkan anggota org menghapus file di folder org-nya.
- Update dan delete memakai `.select('id')`, supaya penolakan RLS atau konflik yang menghasilkan 0 baris tetap terdeteksi.

## Opsi ke depan

Kalau nanti muncul jalur input lain yang bisa membuat `location_id` NULL secara tidak sengaja, misalnya impor atau pengeluaran yang lokasinya belum diketahui, makna NULL jadi ambigu. Saat itu, pertimbangkan kolom eksplisit, contohnya:

```sql
alter table public.expenses add column is_shared boolean not null default false;
alter table public.expenses add constraint expenses_shared_location_check
  check ((is_shared and location_id is null) or (not is_shared and location_id is not null));
```

Ini butuh backfill (`is_shared = true` untuk baris dengan `location_id` NULL), dan **belum** diterapkan.
