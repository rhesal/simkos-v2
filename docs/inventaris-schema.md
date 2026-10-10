# Inventaris: kolom yang hilang di live (migration 400)

`src/views/InventarisView.vue` memakai kolom `tanggal_pembelian`, `harga`, `tipe_fasilitas`, `receipt_url` yang belum ada di tabel live `public.inventories` (lihat `docs/reference/live_schema_public.sql`). Akibatnya simpan barang dari app gagal di production.

**Migration:** `supabase/migrations/20261010000400_inventories_missing_columns.sql` (BELUM diterapkan ke live).

| Kolom | Tipe | Null | Alasan |
| --- | --- | --- | --- |
| `tanggal_pembelian` | `date` | ya | `<input type="date">` → `YYYY-MM-DD` |
| `harga` | `numeric`, check `>= 0` | ya | sama dengan `expenses.nominal`. **NULL = harga tidak diketahui** (form dikosongkan), beda dengan `0` yang diisi sengaja. Tampil "–" untuk NULL, "Rp 0" untuk 0. |
| `tipe_fasilitas` | `text`, check `in ('kamar','umum')` | ya | nilai yang dipakai tab & form. NULL (baris lama/jalur lain) tampil di tab **Umum**; bila diedit lalu disimpan, tersimpan sebagai `umum`. |
| `receipt_url` | `text` | ya | path nota `<org_id>/...` di bucket privat `receipt_images` |

- Aditif saja: tanpa rename/drop/default. Pre-check menolak bila migration 200/300 belum ada, bila kolom sudah ada dengan tipe lain, atau bila data lama melanggar constraint.
- Trigger `inventories_receipt_path_org` memakai `public.enforce_org_storage_path('receipt_url')` dari migration 300 (sama seperti `expenses_nota_path_org`).
- RLS tidak berubah: `inventories_org_access` (migration 210) sudah `for all` per org; policy storage `simkos_private_images_*` sudah mencakup `receipt_images/<org_id>/`.
- Diuji di Postgres lokal: `qa/rls/org/run_local_org.sh` skenario S8 (`40_inventories_400_tests.sql`).

**`room_id` dan `tipe_fasilitas = 'kamar'`:** `room_id` biasanya terisi untuk barang bertipe `kamar`, tapi **bisa NULL**: FK `inventories_room_id_fkey` memakai `ON DELETE SET NULL`, jadi menghapus kamar mengosongkan `room_id`. Sengaja **tidak** ada constraint "kamar ⇒ room_id not null", karena constraint itu akan membuat hapus kamar gagal. Kartu inventaris menampilkan "Kmr" bila kamar sudah tidak ada.

**File nota yatim saat kos dihapus:** `inventories.location_id` memakai `ON DELETE CASCADE`, jadi menghapus kos ikut menghapus baris inventarisnya, tapi file nota di `receipt_images/<org_id>/...` tertinggal. File ini tertangkap oleh `supabase/scripts/report_orphan_files.mjs` (membaca `inventories.receipt_url` bila kolomnya ada). Tidak ada penghapusan otomatis.

**Urutan deploy:** terapkan migration 400 ke live **dulu**, baru deploy app dari PR #6. Kalau terbalik, simpan barang tetap gagal sampai migration masuk.

**Rollback:** `supabase/rollback/rollback_400_inventories_columns.sql` menghapus trigger, constraint, dan keempat kolom. ⚠️ Hanya aman selama kolom baru masih kosong; ada guard yang menolak rollback bila sudah ada nilai non-NULL. File nota tidak ikut terhapus (muncul di laporan file yatim).

**Alur nota di app** (BARIS dulu, FILE belakangan):
- Tambah: upload nota → insert baris; insert gagal → file baru dihapus lagi.
- Ubah: nota tidak diubah → `receipt_url` tidak dikirim. Nota diganti/dihapus → update dengan compare-and-set terhadap nilai saat form dibuka (`.is(null)` / `.eq(nilai)`); 0 baris → pesan konflik/tidak ditemukan dan file baru dihapus; sukses → file lama dihapus (non-blocking).
- Form nota (tidak ada yang menyentuh DB/storage sebelum **Simpan**):
  - ✕ pada **file baru** hanya membatalkan file itu; nota lama tampil lagi.
  - ✕ pada **nota lama** (tanpa file baru) menandainya hapus: muncul "Nota akan dihapus saat Simpan" + tombol **Batal hapus**. Tutup form tanpa Simpan → nota tetap utuh.
  - Pratinjau nota lama punya status memuat / gagal dimuat (+ Coba lagi); ✕ tetap tersedia. Blob URL pratinjau file baru di-`revokeObjectURL` saat diganti, dibatalkan, form ditutup, atau halaman ditinggalkan.
  - Beda dengan pengeluaran (hapus nota langsung) — sengaja, karena lebih aman dan bisa dibatalkan.
- Hapus barang: konfirmasi terpisah (menyebut nota ikut terhapus permanen) → hapus baris dengan `.delete().select('id, receipt_url')` → hapus file dari `receipt_url` **hasil delete** (bukan dari daftar yang mungkin basi) (non-blocking). Hapus pengeluaran memakai pola sama (`bukti_nota_url`).
- Gagal hapus file → pesan sukses + "Sisa file nota akan dibersihkan saat perawatan berkala."
