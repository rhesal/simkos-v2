-- =====================================================================
-- QA: kondisi LIVE sebelum PR #1 (dari /workspace/simkos-v2-live, 2026-10-10)
-- Dijalankan setelah docs/reference/live_schema_public.sql.
--   - 7 policy "Hanya user login ..." (auth.role() = 'authenticated') FOR ALL TO public
--   - RLS MATI di inventories
--   - anon punya grant SELECT/INSERT (di sini: all)
--   - bucket ktp_images & receipt_images PRIVATE, tanpa batas ukuran/tipe
--   - policy storage "Izinkan lihat KTP" / "Izinkan upload KTP"
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['locations','rooms','tenants','rentals','incomes','expenses','inventories'] loop
    execute format('grant all on public.%I to anon, authenticated, service_role', t);
    execute format(
      'create policy %I on public.%I as permissive for all to public using (auth.role() = ''authenticated''::text)',
      'Hanya user login yang bisa akses ' || t, t);
    if t <> 'inventories' then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

insert into storage.buckets (id, name, public) values
  ('ktp_images', 'ktp_images', false), ('receipt_images', 'receipt_images', false);

create policy "Izinkan lihat KTP" on storage.objects
  for select to authenticated using (bucket_id = 'ktp_images'::text);
create policy "Izinkan upload KTP" on storage.objects
  for insert to authenticated with check (bucket_id = 'ktp_images'::text);
