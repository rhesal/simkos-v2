# Inventaris: kolom yang hilang di live (migration 400)

`src/views/InventarisView.vue` memakai kolom `tanggal_pembelian`, `harga`, `tipe_fasilitas`, `receipt_url` yang belum ada di tabel live `public.inventories` (lihat `docs/reference/live_schema_public.sql`). Akibatnya simpan barang dari app gagal di production.

**Migration:** `supabase/migrations/20261010000400_inventories_missing_columns.sql` (BELUM diterapkan ke live).

| Kolom | Tipe | Null | Alasan |
| --- | --- | --- | --- |
| `tanggal_pembelian` | `date` | ya | `<input type="date">` → `YYYY-MM-DD` |
| `harga` | `numeric`, check `>= 0` | ya | sama dengan `expenses.nominal` |
| `tipe_fasilitas` | `text`, check `in ('kamar','umum')` | ya | nilai yang dipakai tab & form |
| `receipt_url` | `text` | ya | path nota `<org_id>/...` di bucket privat `receipt_images` |

- Aditif saja: tanpa rename/drop/default. Pre-check menolak bila migration 200/300 belum ada, bila kolom sudah ada dengan tipe lain, atau bila data lama melanggar constraint.
- Trigger `inventories_receipt_path_org` memakai `public.enforce_org_storage_path('receipt_url')` dari migration 300 (sama seperti `expenses_nota_path_org`).
- RLS tidak berubah: `inventories_org_access` (migration 210) sudah `for all` per org; policy storage `simkos_private_images_*` sudah mencakup `receipt_images/<org_id>/`.
- Diuji di Postgres lokal: `qa/rls/org/run_local_org.sh` skenario S8 (`40_inventories_400_tests.sql`).

**Rollback:** `supabase/rollback/rollback_400_inventories_columns.sql` menghapus trigger, constraint, dan keempat kolom. ⚠️ Hanya aman selama kolom baru masih kosong; ada guard yang menolak rollback bila sudah ada nilai non-NULL. File nota tidak ikut terhapus (muncul di laporan file yatim).

**Alur nota di app** (BARIS dulu, FILE belakangan):
- Tambah: upload nota → insert baris; insert gagal → file baru dihapus lagi.
- Ubah: nota tidak diubah → `receipt_url` tidak dikirim. Nota diganti/dihapus → update dengan compare-and-set terhadap nilai saat form dibuka (`.is(null)` / `.eq(nilai)`); 0 baris → pesan konflik/tidak ditemukan dan file baru dihapus; sukses → file lama dihapus (non-blocking). Menghapus nota di form baru berlaku saat **Simpan**.
- Hapus barang: konfirmasi terpisah (menyebut nota ikut terhapus permanen) → hapus baris → hapus file (non-blocking).
- Gagal hapus file → pesan sukses + "Sisa file nota akan dibersihkan saat perawatan berkala."
