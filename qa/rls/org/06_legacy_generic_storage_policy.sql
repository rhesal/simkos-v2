-- QA skenario S3: policy storage generik yang TIDAK menyebut nama bucket
-- (pola umum dari template/dashboard Supabase). Migration 300 tidak
-- menghapusnya karena filternya hanya mencari nama bucket.
create policy "Give users access to all objects" on storage.objects
  for select to public using (true);
