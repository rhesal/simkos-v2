-- =====================================================================
-- Baseline skema LIVE schema public — project "SimKos App" (opuiruumaagtudqnrlhv)
-- Disusun dari katalog Postgres live (read-only, 2026-10-10). TANPA data.
-- BUKAN migration: tabel ini sudah ada di DB live. Dipakai sebagai referensi
-- dan sebagai fixture tes lokal (qa/rls/org/). Urutan tabel disusun sesuai
-- dependensi FK supaya file ini bisa dijalankan di Postgres kosong.
--
-- Kondisi live SEBELUM PR #1 (dicatat di komentar, tidak dibuat di file ini):
--   - RLS aktif di 6 tabel, MATI di inventories.
--   - Setiap tabel punya 1 policy PERMISSIVE FOR ALL TO public
--       "Hanya user login yang bisa akses <tabel>" using (auth.role() = 'authenticated')
--     (lihat supabase/rollback/ untuk teks persisnya).
--   - Role anon punya grant SELECT/INSERT di semua tabel.
--   - Tidak ada function, trigger, view, atau enum di schema public.
-- =====================================================================

create table public.locations (
  id uuid not null default extensions.uuid_generate_v4(),
  nama_lokasi text not null,
  alamat text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint locations_pkey primary key (id)
);

create table public.rooms (
  id uuid not null default extensions.uuid_generate_v4(),
  location_id uuid,
  nomor_kamar text not null,
  harga_harian numeric not null,
  harga_bulanan numeric not null,
  status_kamar text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint rooms_pkey primary key (id),
  constraint rooms_location_id_fkey foreign key (location_id) references public.locations(id) on delete cascade
);

create table public.tenants (
  id uuid not null default extensions.uuid_generate_v4(),
  nama_lengkap text not null,
  nomor_hp text,
  kontak_darurat text,
  info_asal text,
  foto_ktp_url text,
  pelat_kendaraan text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  status_reputasi text default 'Bersih'::text,
  catatan_reputasi text,
  alamat text,
  catatan text,
  constraint tenants_pkey primary key (id)
);

create table public.rentals (
  id uuid not null default extensions.uuid_generate_v4(),
  room_id uuid,
  tenant_id uuid,
  tipe_sewa text not null,
  tanggal_masuk date not null,
  tanggal_jatuh_tempo date not null,
  status_aktif bool default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint rentals_pkey primary key (id),
  constraint rentals_room_id_fkey foreign key (room_id) references public.rooms(id) on delete restrict,
  constraint rentals_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete restrict
);

create table public.incomes (
  id uuid not null default extensions.uuid_generate_v4(),
  rental_id uuid,
  tanggal_bayar date not null,
  nominal numeric not null,
  keterangan text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  periode_bayar date,
  metode_bayar text default 'Transfer'::text,
  status_bayar text default 'Lunas'::text,
  kategori text default 'Sewa Kamar'::text,
  constraint incomes_pkey primary key (id),
  constraint incomes_rental_id_fkey foreign key (rental_id) references public.rentals(id) on delete restrict,
  constraint incomes_metode_bayar_check check (metode_bayar = any (array['Transfer'::text, 'Tunai'::text])),
  constraint incomes_nominal_positif_check check (nominal > (0)::numeric),
  constraint incomes_periode_awal_bulan_check check ((periode_bayar is null) or (extract(day from periode_bayar) = (1)::numeric)),
  constraint incomes_status_bayar_check check (status_bayar = any (array['Lunas'::text, 'DP'::text, 'Kurang'::text]))
);

create table public.expenses (
  id uuid not null default extensions.uuid_generate_v4(),
  location_id uuid,
  tanggal_pengeluaran date not null,
  kategori text not null,
  nominal numeric not null,
  keterangan text,
  bukti_nota_url text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint expenses_pkey primary key (id),
  constraint expenses_location_id_fkey foreign key (location_id) references public.locations(id) on delete cascade
);

-- CATATAN: kode (src/views/InventarisView.vue) juga memakai kolom
-- tanggal_pembelian, harga, tipe_fasilitas, receipt_url yang TIDAK ADA di live.
-- Di luar scope PR #1 (fitur inventaris kemungkinan sudah rusak di production).
create table public.inventories (
  id uuid not null default extensions.uuid_generate_v4(),
  location_id uuid,
  room_id uuid,
  nama_barang text not null,
  kondisi text not null,
  catatan text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint inventories_pkey primary key (id),
  constraint inventories_location_id_fkey foreign key (location_id) references public.locations(id) on delete cascade,
  constraint inventories_room_id_fkey foreign key (room_id) references public.rooms(id) on delete set null
);

-- Index live: hanya index primary key (dibuat otomatis oleh constraint di atas).
