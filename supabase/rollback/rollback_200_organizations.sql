-- =====================================================================
-- ROLLBACK migration 20261010000200 (OPSIONAL, setelah rollback_210).
-- Menghapus kolom org_id, tabel organisasi, dan helper -> skema kembali
-- persis seperti baseline live (docs/reference/live_schema_public.sql).
-- Data baris aplikasi TIDAK dihapus. Isi organization_members hilang
-- (bisa dibuat ulang dengan menjalankan migration 200 lagi).
--
-- Gagal bila trigger/policy storage dari migration 300 masih ada
-- (jalankan rollback_300 dulu). File yang sudah dipindah ke "<org_id>/..."
-- TIDAK dipindah balik; path di tabel tetap valid dan policy storage lama
-- (bucket-wide) tetap bisa membacanya.
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and policyname like 'simkos_private_images_%') then
    raise exception 'Policy storage migration 300 masih ada. Jalankan rollback_300_storage.sql dulu.';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public'
             and tablename in ('locations','rooms','tenants','rentals','incomes','expenses','inventories')
             and policyname like '%_org_access') then
    raise exception 'Policy RLS org (migration 210) masih ada. Jalankan rollback_210_org_rls.sql dulu.';
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['locations','rooms','tenants','rentals','incomes','expenses','inventories'] loop
    execute format('alter table public.%I drop column if exists org_id', t);
  end loop;
end $$;

drop table if exists public.organization_members;
drop table if exists public.organizations;
drop function if exists public.current_org_id();
drop function if exists public.is_org_owner(uuid);
drop function if exists public.is_org_member(uuid);
