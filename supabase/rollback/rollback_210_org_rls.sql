-- =====================================================================
-- ROLLBACK migration 20261010000210 (RLS org) -> policy tabel live lama.
-- Satu transaksi (SQL Editor / `psql -1 -f`). Jalankan rollback_300 dulu
-- bila migration 300 sudah diterapkan.
--
-- Mengembalikan PERSIS 7 policy live sebelum PR #1:
--   "Hanya user login yang bisa akses <tabel>" PERMISSIVE FOR ALL TO public
--   using (auth.role() = 'authenticated')
-- Pengecualian yang SENGAJA tidak dikembalikan (celah, bukan fitur):
--   - RLS inventories tetap AKTIF (di live dulu mati -> anon bisa tulis).
--   - Grant anon tidak dikembalikan (aplikasi selalu login, anon tak perlu).
-- Kolom org_id, tabel organisasi, dan default current_org_id() DIBIARKAN
-- (data tidak berubah; insert dari app tetap terisi org_id). Untuk
-- menghapusnya juga, jalankan rollback_200_organizations.sql sesudah ini.
-- =====================================================================
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['locations','rooms','tenants','rentals','incomes','expenses','inventories'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format(
      'create policy %I on public.%I as permissive for all to public using (auth.role() = ''authenticated''::text)',
      'Hanya user login yang bisa akses ' || t, t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
