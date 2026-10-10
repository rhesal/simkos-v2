-- QA skenario S5: menyebut owner dan auth.uid() tetapi tidak membandingkannya.
create policy "legacy any logged in" on storage.objects
  for select to public using (owner is not null and auth.uid() is not null);
