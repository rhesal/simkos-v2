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

## Opsi ke depan

Kalau nanti muncul jalur input lain yang bisa membuat `location_id` NULL secara tidak sengaja, misalnya impor atau pengeluaran yang lokasinya belum diketahui, makna NULL jadi ambigu. Saat itu, pertimbangkan kolom eksplisit, contohnya:

```sql
alter table public.expenses add column is_shared boolean not null default false;
alter table public.expenses add constraint expenses_shared_location_check
  check ((is_shared and location_id is null) or (not is_shared and location_id is not null));
```

Ini butuh backfill (`is_shared = true` untuk baris dengan `location_id` NULL), dan **belum** diterapkan.
