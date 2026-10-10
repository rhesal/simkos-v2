-- =====================================================================
-- SimKos v2 — RLS berbasis organisasi untuk 7 tabel aplikasi
-- =====================================================================
-- Prasyarat: migration 200 (org_id sudah terisi & NOT NULL).
--
-- Sebelumnya (live): setiap tabel punya policy "Hanya user login yang bisa
-- akses <tabel>" = auth.role() = 'authenticated' -> SIAPA PUN yang bisa
-- login melihat SEMUA data. RLS inventories bahkan mati, dan anon punya
-- grant SELECT/INSERT.
--
-- File ini:
--   1. Menghapus SEMUA policy lama di 7 tabel.
--   2. Mengaktifkan RLS di 7 tabel (termasuk inventories).
--   3. REVOKE semua hak anon; authenticated mendapat CRUD (dibatasi RLS).
--   4. Satu policy per tabel untuk authenticated:
--        USING      : is_org_member(org_id)
--        WITH CHECK : is_org_member(org_id) DAN setiap induk yang diisi
--                     (FK tidak NULL) ada di organisasi yang SAMA.
--      FK induk yang nullable di live (semua FK) boleh NULL.
--   service_role (dashboard / skrip server) tetap bypass RLS.
-- =====================================================================

-- 1. Hapus policy lama
do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('locations','rooms','tenants','rentals','incomes','expenses','inventories')
  loop
    raise notice 'Menghapus policy lama: public.% -> %', p.tablename, p.policyname;
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 2 & 3. RLS + grant
alter table public.locations   enable row level security;
alter table public.rooms       enable row level security;
alter table public.tenants     enable row level security;
alter table public.rentals     enable row level security;
alter table public.incomes     enable row level security;
alter table public.expenses    enable row level security;
alter table public.inventories enable row level security;

revoke all on public.locations, public.rooms, public.tenants, public.rentals,
              public.incomes, public.expenses, public.inventories from anon;
grant select, insert, update, delete on public.locations, public.rooms, public.tenants,
              public.rentals, public.incomes, public.expenses, public.inventories to authenticated;

-- 4. Policy
create policy locations_org_access on public.locations
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy tenants_org_access on public.tenants
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy rooms_org_access on public.rooms
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (
    public.is_org_member(org_id)
    and (location_id is null or exists (
      select 1 from public.locations l
      where l.id = rooms.location_id and l.org_id = rooms.org_id))
  );

create policy rentals_org_access on public.rentals
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (
    public.is_org_member(org_id)
    and (room_id is null or exists (
      select 1 from public.rooms r
      where r.id = rentals.room_id and r.org_id = rentals.org_id))
    and (tenant_id is null or exists (
      select 1 from public.tenants t
      where t.id = rentals.tenant_id and t.org_id = rentals.org_id))
  );

create policy incomes_org_access on public.incomes
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (
    public.is_org_member(org_id)
    and (rental_id is null or exists (
      select 1 from public.rentals r
      where r.id = incomes.rental_id and r.org_id = incomes.org_id))
  );

create policy expenses_org_access on public.expenses
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (
    public.is_org_member(org_id)
    and (location_id is null or exists (
      select 1 from public.locations l
      where l.id = expenses.location_id and l.org_id = expenses.org_id))
  );

create policy inventories_org_access on public.inventories
  for all to authenticated
  using (public.is_org_member(org_id))
  with check (
    public.is_org_member(org_id)
    and (location_id is null or exists (
      select 1 from public.locations l
      where l.id = inventories.location_id and l.org_id = inventories.org_id))
    and (room_id is null or exists (
      select 1 from public.rooms r
      where r.id = inventories.room_id and r.org_id = inventories.org_id))
  );
