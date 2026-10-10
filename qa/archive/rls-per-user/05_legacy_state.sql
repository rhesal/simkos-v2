-- =====================================================================
-- QA: kondisi "sebelum migration" yang meniru DB live lama:
--   - bucket ktp_images/receipt_images PUBLIC
--   - policy allow-all di tabel aplikasi (untuk anon)
-- Dijalankan SETELAH migration 100 (skema) dan SEBELUM migration 200/300.
-- =====================================================================
insert into storage.buckets (id, name, public) values
  ('ktp_images', 'ktp_images', true), ('receipt_images', 'receipt_images', true)
on conflict (id) do nothing;

do $$
declare t text;
begin
  foreach t in array array['locations','rooms','tenants','rentals','incomes','expenses','inventories'] loop
    execute format('grant all on public.%I to anon, authenticated', t);
    execute format('create policy %I on public.%I for all to anon using (true) with check (true)', 'legacy_allow_all_' || t, t);
  end loop;
end $$;

create policy legacy_ktp_public_read on storage.objects
  for select to public using (bucket_id = 'ktp_images');
