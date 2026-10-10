-- =====================================================================
-- SimKos v2 — Kepemilikan data (owner_id) + Row Level Security
-- =====================================================================
-- Desain:
--   Kode saat ini TIDAK punya kolom pemilik (user_id/owner_id) di tabel mana
--   pun. Tanpa RLS, siapa pun yang memegang anon key (ada di bundle JS
--   publik) berpotensi membaca/mengubah semua data.
--
--   Migration ini:
--   1. Menambah kolom `owner_id uuid default auth.uid()` ke SEMUA tabel.
--      Default auth.uid() membuat kode frontend tidak perlu diubah: setiap
--      insert dari user yang login otomatis terisi pemiliknya.
--      (owner_id ada di setiap tabel — bukan hanya di locations — karena
--      tenants bisa berdiri sendiri tanpa rental, mis. daftar blacklist,
--      dan agar policy sederhana & cepat tanpa join berlapis.)
--   2. BACKFILL baris lama: bila di auth.users hanya ada TEPAT SATU user,
--      semua baris lama otomatis diberikan ke user tersebut, lalu kolom
--      dibuat NOT NULL. Bila ada 0 atau >1 user, backfill DILEWATI (muncul
--      WARNING) — jalankan supabase/scripts/backfill_owner.sql secara manual.
--      Baris dengan owner_id NULL TIDAK AKAN TERLIHAT oleh siapa pun lewat
--      API (fail-closed) sampai di-backfill.
--   3. Menghapus SEMUA policy lama di 7 tabel ini (mis. policy "allow all"
--      untuk anon) lalu mengaktifkan RLS dengan policy baru: hanya role
--      `authenticated` dan hanya baris dengan owner_id = auth.uid().
--      Insert/update juga mengecek bahwa baris induk (lokasi/kamar/penghuni/
--      sewa) milik user yang sama, supaya user tidak bisa menautkan data ke
--      id milik orang lain.
--   Role `anon` tidak mendapat policy apa pun => tidak bisa akses data.
--   service_role (server/dashboard) tetap bypass RLS seperti biasa.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kolom owner_id
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['locations','rooms','tenants','rentals','incomes','expenses','inventories'] loop
    execute format(
      'alter table public.%I add column if not exists owner_id uuid references auth.users(id) default auth.uid()',
      t);
    execute format('alter table public.%I alter column owner_id set default auth.uid()', t);
    execute format('create index if not exists %I on public.%I(owner_id)', t || '_owner_id_idx', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Backfill otomatis (hanya bila tepat 1 user)
-- ---------------------------------------------------------------------
do $$
declare
  n_users int;
  the_user uuid;
  t text;
  n_null bigint;
begin
  select count(*) into n_users from auth.users;
  if n_users = 1 then
    select id into the_user from auth.users limit 1;
    foreach t in array array['locations','rooms','tenants','rentals','incomes','expenses','inventories'] loop
      execute format('update public.%I set owner_id = $1 where owner_id is null', t) using the_user;
    end loop;
    raise notice 'owner_id backfill: semua baris lama diberikan ke user %', the_user;
  else
    raise warning 'owner_id backfill DILEWATI: ditemukan % user di auth.users. Jalankan supabase/scripts/backfill_owner.sql secara manual.', n_users;
  end if;

  -- Jadikan NOT NULL hanya bila sudah tidak ada baris NULL
  foreach t in array array['locations','rooms','tenants','rentals','incomes','expenses','inventories'] loop
    execute format('select count(*) from public.%I where owner_id is null', t) into n_null;
    if n_null = 0 then
      execute format('alter table public.%I alter column owner_id set not null', t);
    else
      raise warning 'Tabel % masih punya % baris tanpa owner_id (tidak terlihat via API sampai di-backfill).', t, n_null;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Hapus policy lama di tabel aplikasi
-- ---------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('locations','rooms','tenants','rentals','incomes','expenses','inventories')
  loop
    raise notice 'Menghapus policy lama: %.% -> %', p.schemaname, p.tablename, p.policyname;
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Aktifkan RLS
-- ---------------------------------------------------------------------
alter table public.locations   enable row level security;
alter table public.rooms       enable row level security;
alter table public.tenants     enable row level security;
alter table public.rentals     enable row level security;
alter table public.incomes     enable row level security;
alter table public.expenses    enable row level security;
alter table public.inventories enable row level security;

-- Anon tidak boleh menyentuh tabel aplikasi sama sekali
revoke all on public.locations, public.rooms, public.tenants, public.rentals,
              public.incomes, public.expenses, public.inventories from anon;
grant select, insert, update, delete on public.locations, public.rooms, public.tenants,
              public.rentals, public.incomes, public.expenses, public.inventories to authenticated;

-- ---------------------------------------------------------------------
-- 5. Policy per tabel
--    Catatan: (select auth.uid()) dipakai agar dievaluasi sekali per query.
-- ---------------------------------------------------------------------

-- locations
create policy locations_select_own on public.locations
  for select to authenticated using (owner_id = (select auth.uid()));
create policy locations_insert_own on public.locations
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy locations_update_own on public.locations
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy locations_delete_own on public.locations
  for delete to authenticated using (owner_id = (select auth.uid()));

-- rooms (lokasi induk harus milik user)
create policy rooms_select_own on public.rooms
  for select to authenticated using (owner_id = (select auth.uid()));
create policy rooms_insert_own on public.rooms
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.locations l
                where l.id = location_id and l.owner_id = (select auth.uid()))
  );
create policy rooms_update_own on public.rooms
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.locations l
                where l.id = location_id and l.owner_id = (select auth.uid()))
  );
create policy rooms_delete_own on public.rooms
  for delete to authenticated using (owner_id = (select auth.uid()));

-- tenants
create policy tenants_select_own on public.tenants
  for select to authenticated using (owner_id = (select auth.uid()));
create policy tenants_insert_own on public.tenants
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy tenants_update_own on public.tenants
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy tenants_delete_own on public.tenants
  for delete to authenticated using (owner_id = (select auth.uid()));

-- rentals (kamar & penghuni induk harus milik user)
create policy rentals_select_own on public.rentals
  for select to authenticated using (owner_id = (select auth.uid()));
create policy rentals_insert_own on public.rentals
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.rooms r
                where r.id = room_id and r.owner_id = (select auth.uid()))
    and exists (select 1 from public.tenants t
                where t.id = tenant_id and t.owner_id = (select auth.uid()))
  );
create policy rentals_update_own on public.rentals
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.rooms r
                where r.id = room_id and r.owner_id = (select auth.uid()))
    and exists (select 1 from public.tenants t
                where t.id = tenant_id and t.owner_id = (select auth.uid()))
  );
create policy rentals_delete_own on public.rentals
  for delete to authenticated using (owner_id = (select auth.uid()));

-- incomes (sewa induk harus milik user)
create policy incomes_select_own on public.incomes
  for select to authenticated using (owner_id = (select auth.uid()));
create policy incomes_insert_own on public.incomes
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.rentals r
                where r.id = rental_id and r.owner_id = (select auth.uid()))
  );
create policy incomes_update_own on public.incomes
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.rentals r
                where r.id = rental_id and r.owner_id = (select auth.uid()))
  );
create policy incomes_delete_own on public.incomes
  for delete to authenticated using (owner_id = (select auth.uid()));

-- expenses (lokasi induk harus milik user)
create policy expenses_select_own on public.expenses
  for select to authenticated using (owner_id = (select auth.uid()));
create policy expenses_insert_own on public.expenses
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.locations l
                where l.id = location_id and l.owner_id = (select auth.uid()))
  );
create policy expenses_update_own on public.expenses
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.locations l
                where l.id = location_id and l.owner_id = (select auth.uid()))
  );
create policy expenses_delete_own on public.expenses
  for delete to authenticated using (owner_id = (select auth.uid()));

-- inventories (lokasi & kamar opsional harus milik user)
create policy inventories_select_own on public.inventories
  for select to authenticated using (owner_id = (select auth.uid()));
create policy inventories_insert_own on public.inventories
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.locations l
                where l.id = location_id and l.owner_id = (select auth.uid()))
    and (room_id is null or exists (select 1 from public.rooms r
                where r.id = room_id and r.owner_id = (select auth.uid())))
  );
create policy inventories_update_own on public.inventories
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.locations l
                where l.id = location_id and l.owner_id = (select auth.uid()))
    and (room_id is null or exists (select 1 from public.rooms r
                where r.id = room_id and r.owner_id = (select auth.uid())))
  );
create policy inventories_delete_own on public.inventories
  for delete to authenticated using (owner_id = (select auth.uid()));
