-- =====================================================================
-- SimKos v2 — migration 500: peran 'admin' di atas 'owner' (per organisasi).
--
-- Keputusan Rhesal (2026-10-10): Rhesal = admin org SimKos, partner = owner.
--   - admin  : semua yang bisa owner + SATU-SATUNYA yang boleh menambah,
--              mengeluarkan, atau mengubah peran anggota.
--   - owner  : kelola semua data kos (penghuni, keuangan, inventaris, nota,
--              KTP) seperti sekarang, TIDAK bisa mengubah keanggotaan.
--   - staff  : tetap seperti sekarang.
--
-- Yang berubah:
--   1. Constraint role: ('admin','owner','staff').
--   2. Helper public.is_org_admin(org) (SECURITY DEFINER, search_path '').
--   3. Policy organization_members INSERT/UPDATE/DELETE: hanya admin, tidak
--      untuk barisnya sendiri, dan tidak untuk baris admin lain. Peran yang
--      boleh diberikan lewat API hanya 'owner'/'staff'. Peran 'admin' HANYA
--      lewat migration / SQL Editor / service role.
--   4. Kolom yang boleh di-UPDATE oleh authenticated: hanya `role`
--      (user_id/org_id tidak bisa dipindah lewat API).
--   5. Trigger guard: admin terakhir sebuah org tidak bisa dihapus,
--      diturunkan, atau dipindah org, oleh siapa pun (termasuk service role),
--      kecuali org-nya sendiri sedang dihapus.
--   6. organizations UPDATE (ganti nama org): admin atau owner (tetap).
--   7. Data: user `simkos.admin_user_id` (default: Rhesal di live) jadi admin.
--
-- TIDAK berubah: policy data kos (is_org_member), storage, frontend.
-- is_org_owner() tetap ada (dipakai rollback & kompatibilitas), tidak lagi
-- dipakai policy organization_members.
--
-- Prasyarat: migration 200 & 210. Jalankan dalam SATU transaksi.
-- Rollback: supabase/rollback/rollback_500_org_admin_role.sql
-- =====================================================================

-- 0. Pre-check ---------------------------------------------------------------
do $$
declare
  admin_uid uuid := coalesce(nullif(current_setting('simkos.admin_user_id', true), ''),
                             '60a57117-71f1-46e1-87cb-f328f1911fcf')::uuid;
  n int;
begin
  if to_regclass('public.organization_members') is null then
    raise exception 'organization_members tidak ada. Terapkan migration 200 dulu.';
  end if;
  select count(*) into n from public.organization_members where user_id = admin_uid;
  if n <> 1 then
    raise exception using
      message = format('Calon admin %s bukan anggota organisasi mana pun.', admin_uid),
      hint    = 'Set `simkos.admin_user_id` ke user_id yang benar sebelum migration ini.';
  end if;
  select count(*) into n from public.organization_members where role not in ('owner', 'staff');
  if n > 0 then
    raise exception 'Ada % anggota dengan role di luar owner/staff. Periksa manual.', n;
  end if;
end $$;

-- 1. Constraint role ---------------------------------------------------------
alter table public.organization_members drop constraint organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check check (role in ('admin', 'owner', 'staff'));

-- 2. Helper ------------------------------------------------------------------
create function public.is_org_admin(org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = org and m.user_id = (select auth.uid()) and m.role = 'admin'
  )
$$;
revoke all on function public.is_org_admin(uuid) from public;
grant execute on function public.is_org_admin(uuid) to anon, authenticated, service_role;

-- 3. Policy organization_members --------------------------------------------
drop policy organization_members_insert_owner on public.organization_members;
drop policy organization_members_update_owner on public.organization_members;
drop policy organization_members_delete_owner on public.organization_members;

-- Admin menambah anggota baru sebagai owner/staff (bukan admin, bukan dirinya).
create policy organization_members_insert_admin on public.organization_members
  for insert to authenticated
  with check (public.is_org_admin(org_id)
              and user_id <> (select auth.uid())
              and role in ('owner', 'staff'));

-- Admin mengubah peran anggota lain yang bukan admin, hanya ke owner/staff.
create policy organization_members_update_admin on public.organization_members
  for update to authenticated
  using (public.is_org_admin(org_id)
         and user_id <> (select auth.uid())
         and role <> 'admin')
  with check (public.is_org_admin(org_id)
              and user_id <> (select auth.uid())
              and role in ('owner', 'staff'));

-- Admin mengeluarkan anggota lain yang bukan admin.
create policy organization_members_delete_admin on public.organization_members
  for delete to authenticated
  using (public.is_org_admin(org_id)
         and user_id <> (select auth.uid())
         and role <> 'admin');

-- 4. Hanya kolom role yang bisa di-UPDATE lewat API --------------------------
revoke update on public.organization_members from authenticated;
grant update (role) on public.organization_members to authenticated;

-- 5. Guard admin terakhir (berlaku juga untuk service role / dashboard) -------
create function public.guard_last_org_admin()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if old.role <> 'admin' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'admin' and new.org_id = old.org_id then
    return new;
  end if;
  -- Org-nya sendiri sedang dihapus (cascade): biarkan.
  if not exists (select 1 from public.organizations o where o.id = old.org_id) then
    return coalesce(new, old);
  end if;
  if not exists (select 1 from public.organization_members m
                 where m.org_id = old.org_id and m.role = 'admin' and m.user_id <> old.user_id) then
    raise exception using errcode = '42501',
      message = 'Admin terakhir organisasi tidak bisa dihapus atau diturunkan.',
      hint    = 'Jadikan anggota lain admin dulu (SQL Editor), baru ubah admin ini.';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.guard_last_org_admin() from public;

create trigger organization_members_last_admin_guard
  before update or delete on public.organization_members
  for each row execute function public.guard_last_org_admin();

-- 6. Ganti nama org: admin atau owner ---------------------------------------
drop policy organizations_update_owner on public.organizations;
create policy organizations_update_admin_owner on public.organizations
  for update to authenticated
  using (public.is_org_admin(id) or public.is_org_owner(id))
  with check (public.is_org_admin(id) or public.is_org_owner(id));

-- 7. Data: tetapkan admin -----------------------------------------------------
do $$
declare
  admin_uid uuid := coalesce(nullif(current_setting('simkos.admin_user_id', true), ''),
                             '60a57117-71f1-46e1-87cb-f328f1911fcf')::uuid;
  n int;
begin
  update public.organization_members set role = 'admin' where user_id = admin_uid;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Gagal menetapkan admin (% baris).', n;
  end if;
  raise notice 'Admin ditetapkan: %', admin_uid;
end $$;

notify pgrst, 'reload schema';
