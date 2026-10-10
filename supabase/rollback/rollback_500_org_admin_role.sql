-- =====================================================================
-- ROLLBACK migration 20261010000500 (peran admin). Satu transaksi.
-- Admin dikembalikan jadi 'owner', policy & grant organization_members
-- kembali ke versi migration 200 (owner boleh mengubah anggota lain).
-- PERINGATAN: setelah rollback, sesama owner kembali bisa saling
-- mengeluarkan / menurunkan peran lewat API.
-- =====================================================================
drop trigger if exists organization_members_last_admin_guard on public.organization_members;
drop function if exists public.guard_last_org_admin();

update public.organization_members set role = 'owner' where role = 'admin';

drop policy if exists organization_members_insert_admin on public.organization_members;
drop policy if exists organization_members_update_admin on public.organization_members;
drop policy if exists organization_members_delete_admin on public.organization_members;
drop policy if exists organizations_update_admin_owner on public.organizations;
drop policy if exists organization_members_insert_owner on public.organization_members;
drop policy if exists organization_members_update_owner on public.organization_members;
drop policy if exists organization_members_delete_owner on public.organization_members;
drop policy if exists organizations_update_owner on public.organizations;

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
create policy organizations_update_owner on public.organizations
  for update to authenticated
  using (public.is_org_owner(id)) with check (public.is_org_owner(id));

revoke update, insert on public.organization_members from authenticated;
grant update, insert on public.organization_members to authenticated;
alter table public.organization_members alter column role set default 'owner';

drop function if exists public.is_org_admin(uuid);

alter table public.organization_members drop constraint if exists organization_members_role_check;
alter table public.organization_members
  add constraint organization_members_role_check check (role in ('owner', 'staff'));

notify pgrst, 'reload schema';
