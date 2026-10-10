-- =====================================================================
-- SimKos v2 — Skema database (DISIMPULKAN / INFERRED)
-- =====================================================================
-- PERHATIAN:
--   File ini DISUSUN DARI QUERY DI KODE FRONTEND (src/views/*.vue), BUKAN
--   hasil dump dari database live. Tipe data, nullability, default, dan
--   aksi ON DELETE adalah tebakan terbaik.
--
--   WAJIB diverifikasi terhadap database live sebelum dipakai sebagai
--   sumber kebenaran, misalnya dengan:
--       supabase link --project-ref <ref>
--       supabase db pull          -- menghasilkan migration dari skema live
--   lalu bandingkan dan GANTI file ini dengan hasil `db pull` bila berbeda.
--
--   Semua statement memakai IF NOT EXISTS sehingga aman (no-op) bila
--   dijalankan pada database live yang tabelnya sudah ada. File ini TIDAK
--   mengubah kolom pada tabel yang sudah ada.
--
-- Asumsi utama:
--   - Semua primary key bertipe uuid (kode membandingkan route.query.room_id
--     yang berupa string dengan rooms.id).
--   - Nama constraint FK mengikuti default Postgres (kode mendeteksi
--     'incomes_rental_id_fkey').
--   - Kolom `rentals.tanggal_keluar` dibaca di UI (riwayat) tetapi tidak
--     pernah ditulis; mungkin tidak ada di DB live.
--   - `rentals.hide_in_history` dipakai dengan fallback bila kolom tidak ada.
-- =====================================================================

create extension if not exists pgcrypto;

-- Lokasi / properti kos
create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  nama_lokasi text not null,
  alamat      text,
  created_at  timestamptz not null default now()
);

-- Kamar per lokasi
create table if not exists public.rooms (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id),
  nomor_kamar   text not null,
  harga_harian  numeric not null default 0,
  harga_bulanan numeric not null default 0,
  status_kamar  text not null default 'Kosong',   -- 'Kosong' | 'Terisi'
  created_at    timestamptz not null default now()
);

-- Penghuni (data pribadi, termasuk foto KTP)
create table if not exists public.tenants (
  id               uuid primary key default gen_random_uuid(),
  nama_lengkap     text not null,
  nomor_hp         text,
  kontak_darurat   text,
  foto_ktp_url     text,   -- PATH objek di bucket 'ktp_images' (baris lama: URL publik)
  status_reputasi  text default 'Bersih',   -- 'Bersih' | 'Peringatan' | 'Blacklist'
  catatan_reputasi text,
  created_at       timestamptz not null default now()
);

-- Sewa (relasi penghuni <-> kamar)
create table if not exists public.rentals (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id),
  room_id             uuid not null references public.rooms(id),
  tipe_sewa           text not null default 'bulanan',
  tanggal_masuk       date,
  tanggal_jatuh_tempo date,
  tanggal_keluar      date,
  status_aktif        boolean not null default true,
  hide_in_history     boolean not null default false,
  created_at          timestamptz not null default now()
);

-- Pemasukan (pembayaran sewa dll)
create table if not exists public.incomes (
  id            uuid primary key default gen_random_uuid(),
  rental_id     uuid not null references public.rentals(id),
  tanggal_bayar date not null,
  nominal       numeric not null default 0,
  keterangan    text,
  created_at    timestamptz not null default now()
);

-- Pengeluaran per lokasi
create table if not exists public.expenses (
  id                  uuid primary key default gen_random_uuid(),
  location_id         uuid not null references public.locations(id),
  tanggal_pengeluaran date not null,
  kategori            text,
  nominal             numeric not null default 0,
  keterangan          text,
  bukti_nota_url      text,   -- PATH objek di bucket 'receipt_images'
  created_at          timestamptz not null default now()
);

-- Inventaris / aset
create table if not exists public.inventories (
  id                uuid primary key default gen_random_uuid(),
  nama_barang       text not null,
  location_id       uuid not null references public.locations(id),
  room_id           uuid references public.rooms(id),
  kondisi           text default 'Baik',
  tanggal_pembelian date,
  harga             numeric not null default 0,
  tipe_fasilitas    text not null default 'kamar',   -- 'kamar' | 'umum'
  receipt_url       text,   -- PATH objek di bucket 'receipt_images' (baris lama: URL publik)
  created_at        timestamptz not null default now()
);

create index if not exists rooms_location_id_idx       on public.rooms(location_id);
create index if not exists rentals_room_id_idx         on public.rentals(room_id);
create index if not exists rentals_tenant_id_idx       on public.rentals(tenant_id);
create index if not exists incomes_rental_id_idx       on public.incomes(rental_id);
create index if not exists expenses_location_id_idx    on public.expenses(location_id);
create index if not exists inventories_location_id_idx on public.inventories(location_id);
