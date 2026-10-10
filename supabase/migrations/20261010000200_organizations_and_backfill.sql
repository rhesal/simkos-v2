-- =====================================================================
-- SimKos v2 — Organisasi (multi-pemilik) + kolom org_id + BACKFILL
-- =====================================================================
-- Model: satu organisasi = satu usaha kos. Semua anggota organisasi melihat
-- dan mengelola SEMUA data organisasinya. Saat ini:
--   - org 'SimKos' dengan 2 anggota role 'owner' (Rhesal + partner).
--   - Satu user hanya boleh anggota satu organisasi (unique(user_id)).
--
-- File ini (satu transaksi; Supabase CLI & SQL Editor menjalankan satu file
-- sebagai satu transaksi, psql: pakai `psql -1 -f`):
--   1. Tabel organizations & organization_members (+ RLS & policy-nya).
--   2. Helper SECURITY DEFINER (search_path = ''):
--        is_org_member(org), is_org_owner(org), current_org_id().
--   3. Kolom org_id di 7 tabel aplikasi (TANPA default dulu, supaya default
--      tidak dievaluasi untuk baris lama), index org_id.
--   4. BACKFILL eksplisit & deterministik:
--        - buat organisasi 'SimKos',
--        - masukkan SEMUA user di auth.users sebagai 'owner'
--          (GAGAL bila jumlahnya bukan 2, kecuali override, lihat di bawah),
--        - isi org_id semua baris lama, GAGAL bila masih ada NULL,
--        - org_id NOT NULL + default public.current_org_id() (frontend tidak
--          perlu mengirim org_id saat insert).
--   Policy RLS tabel aplikasi ada di migration 210 (sesudah backfill).
--   Policy tabel lama ("Hanya user login ...") TIDAK diubah di sini, jadi
--   aplikasi tetap jalan normal bila hanya file ini yang sudah diterapkan.
--
-- OVERRIDE jumlah user (hanya bila memang disengaja, mis. ada user ke-3 yang
-- juga harus jadi owner). Jalankan di sesi/skrip yang sama SEBELUM file ini:
--     set simkos.backfill_expected_users = '3';
-- Semua user di auth.users tetap dimasukkan sebagai owner.
-- =====================================================================

-- 1. Tabel organisasi ----------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id),
  -- Untuk saat ini satu user = satu organisasi (current_org_id() bergantung pada ini).
  constraint organization_members_user_id_key unique (user_id)
);

-- 2. Helper (SECURITY DEFINER: membaca organization_members tanpa terkena
--    RLS, sehingga policy di organization_members tidak rekursif) ---------
create function public.is_org_member(org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = org and m.user_id = (select auth.uid())
  )
$$;

create function public.is_org_owner(org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = org and m.user_id = (select auth.uid()) and m.role = 'owner'
  )
$$;

-- Organisasi user yang sedang login. ERROR bila tidak login, bukan anggota,
-- atau (seharusnya tidak mungkin karena unique(user_id)) anggota >1 org.
create function public.current_org_id()
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n   int;
  org uuid;
begin
  if uid is null then
    raise exception using errcode = '42501',
      message = 'current_org_id(): tidak ada user login. Isi kolom org_id secara eksplisit.';
  end if;
  select count(*), (array_agg(m.org_id))[1] into n, org
  from public.organization_members m where m.user_id = uid;
  if n = 0 then
    raise exception using errcode = '42501',
      message = 'Akun ini belum terdaftar sebagai anggota organisasi SimKos.';
  elsif n > 1 then
    raise exception using errcode = '42501',
      message = 'Akun ini anggota lebih dari satu organisasi; isi org_id secara eksplisit.';
  end if;
  return org;
end $$;

revoke all on function public.is_org_member(uuid), public.is_org_owner(uuid), public.current_org_id() from public;
-- anon perlu EXECUTE karena guard storage (migration 300) berlaku untuk role public;
-- untuk anon fungsinya selalu false / error (auth.uid() NULL).
grant execute on function public.is_org_member(uuid), public.is_org_owner(uuid) to anon, authenticated, service_role;
grant execute on function public.current_org_id() to authenticated, service_role;

-- 1b. RLS tabel organisasi -----------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
revoke all on public.organizations, public.organization_members from anon;
revoke all on public.organizations, public.organization_members from authenticated;
grant select, update (name) on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;

-- Anggota melihat organisasinya; hanya owner yang boleh ganti nama.
-- Membuat/menghapus organisasi: lewat SQL/dashboard (service role) saja.
create policy organizations_select_member on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy organizations_update_owner on public.organizations
  for update to authenticated
  using (public.is_org_owner(id)) with check (public.is_org_owner(id));

-- Anggota melihat daftar anggota organisasinya.
-- Tambah/ubah/hapus anggota: hanya owner organisasi itu, dan TIDAK untuk
-- barisnya sendiri (tidak bisa join sendiri ke org lain, tidak bisa
-- mengubah org/role sendiri, tidak bisa keluar sendiri -> org tidak
-- kehilangan owner terakhir tanpa sengaja). Semua pengecekan lewat helper,
-- tidak ada query langsung ke organization_members di policy.
create policy organization_members_select_member on public.organization_members
  for select to authenticated using (public.is_org_member(org_id));
create policy organization_members_insert_owner on public.organization_members
  for insert to authenticated
  with check (public.is_org_owner(org_id) and user_id <> (select auth.uid()));
create policy organization_members_update_owner on public.organization_members
  for update to authenticated
  using (public.is_org_owner(org_id) and user_id <> (select auth.uid()))
  with check (public.is_org_owner(org_id) and user_id <> (select auth.uid()));
create policy organization_members_delete_owner on public.organization_members
  for delete to authenticated
  using (public.is_org_owner(org_id) and user_id <> (select auth.uid()));

-- 3. Kolom org_id (tanpa default dulu) -----------------------------------
do $$
declare t text;
begin
  foreach t in array array['locations','rooms','tenants','rentals','incomes','expenses','inventories'] loop
    execute format('alter table public.%I add column org_id uuid references public.organizations(id) on delete restrict', t);
    execute format('create index %I on public.%I (org_id)', t || '_org_id_idx', t);
  end loop;
end $$;

-- 4. Backfill -----------------------------------------------------------
do $$
declare
  expected int := coalesce(nullif(current_setting('simkos.backfill_expected_users', true), ''), '2')::int;
  n_users  int;
  org      uuid;
  t        text;
  n        bigint;
begin
  select count(*) into n_users from auth.users;
  if n_users <> expected then
    raise exception using
      message = format('Backfill dibatalkan: auth.users berisi %s user, diharapkan %s.', n_users, expected),
      hint    = 'Periksa daftar user. Bila semua user memang harus jadi owner org SimKos, jalankan '
                '`set simkos.backfill_expected_users = ''<jumlah>'';` sebelum migration ini.';
  end if;

  insert into public.organizations (name) values ('SimKos') returning id into org;

  insert into public.organization_members (org_id, user_id, role)
  select org, u.id, 'owner' from auth.users u order by u.created_at, u.id;

  foreach t in array array['locations','rooms','tenants','rentals','incomes','expenses','inventories'] loop
    execute format('update public.%I set org_id = $1 where org_id is null', t) using org;
    get diagnostics n = row_count;
    raise notice 'backfill org_id: % baris di %', n, t;
  end loop;

  foreach t in array array['locations','rooms','tenants','rentals','incomes','expenses','inventories'] loop
    execute format('select count(*) from public.%I where org_id is null', t) into n;
    if n > 0 then
      raise exception 'Backfill gagal: % baris di % masih org_id NULL', n, t;
    end if;
    execute format('alter table public.%I alter column org_id set not null', t);
    execute format('alter table public.%I alter column org_id set default public.current_org_id()', t);
  end loop;

  raise notice 'Organisasi SimKos % dibuat dengan % owner.', org, n_users;
end $$;
