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

- **Lihat:** buka Buku Besar (`/riwayat-transaksi`), lalu ketuk baris pengeluaran. Modal detail menampilkan tanggal, kategori, lokasi, keterangan, dan foto nota (lewat signed URL).
- **Ubah:** di modal detail, tombol "✏️ Ubah" membuka `/pengeluaran/:id/edit`. Form-nya memakai ulang `TambahPengeluaranView.vue`, dan semua field bisa diubah, termasuk lokasi kos atau tagihan bersama.
  - **Ganti nota:** file baru di-upload ke `<org_id>/receipt_...` dulu, lalu baris diperbarui. Nota lama baru dihapus setelah update DB berhasil. Kalau update gagal, file baru yang sudah ter-upload dihapus lagi.
  - **Hapus nota:** file dihapus dulu, lalu kolom `bukti_nota_url` dikosongkan hanya kalau penghapusan file berhasil. Polanya sama dengan `clearKtpDocument`.
  - Validasi file sama dengan saat input: JPG/PNG/WEBP, maksimal 5 MB.
- **Hapus:** tombol "🗑️ Hapus" di modal detail memunculkan konfirmasi berisi nominal, tanggal, dan peringatan bahwa nota ikut terhapus permanen.
  - **Baris dihapus dulu, baru file nota.** Dengan urutan ini, tidak akan pernah ada baris yang menunjuk ke file yang sudah hilang.
  - Kalau file gagal dihapus, error dicatat di console (file jadi yatim) dan user diberi tahu.
  - Total di layar langsung dihitung ulang.
- **RLS:** tidak perlu migration.
  - Policy `expenses_org_access` (migration 210) berlaku `for all` dengan `is_org_member(org_id)`, jadi update dan delete diizinkan untuk anggota org. `location_id` NULL juga lolos `with check`.
  - Trigger `expenses_nota_path_org` mengizinkan nilai yang tidak berubah, `NULL`, dan path baru berprefiks `<org_id>/`.
  - Policy storage `simkos_private_images_delete_org` mengizinkan anggota org menghapus file di folder org-nya.
  - Update dan delete memakai `.select('id')`, supaya penolakan RLS yang tidak memunculkan error (0 baris) tetap terdeteksi sebagai gagal.

## Opsi ke depan

Kalau nanti muncul jalur input lain yang bisa membuat `location_id` NULL secara tidak sengaja, misalnya impor atau pengeluaran yang lokasinya belum diketahui, makna NULL jadi ambigu. Saat itu, pertimbangkan kolom eksplisit, contohnya:

```sql
alter table public.expenses add column is_shared boolean not null default false;
alter table public.expenses add constraint expenses_shared_location_check
  check ((is_shared and location_id is null) or (not is_shared and location_id is not null));
```

Ini butuh backfill (`is_shared = true` untuk baris dengan `location_id` NULL), dan **belum** diterapkan.
