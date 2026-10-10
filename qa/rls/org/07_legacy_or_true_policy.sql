-- QA skenario S4: policy permisif yang lolos pemeriksaan teks migration 300.
create policy "legacy x or true" on storage.objects
  for select to public using (bucket_id = 'x' or true);
