-- =====================================================================
-- SimKos v2 — Bucket storage privat untuk foto KTP & nota
-- =====================================================================
-- Sebelumnya bucket 'ktp_images' dan 'receipt_images' bersifat PUBLIC:
-- siapa pun yang tahu/menebak URL bisa melihat foto KTP penghuni.
--
-- Migration ini:
--   0. PEMERIKSAAN AWAL: gagal (RAISE EXCEPTION) bila di storage.objects ada
--      policy lain yang permisif tanpa membatasi bucket/pemilik (mis.
--      `using (true)` untuk public/anon). Policy seperti itu digabung OR
--      dengan policy baru sehingga bucket private tetap terbuka. Lebih baik
--      migration gagal keras daripada KTP diam-diam tetap terekspos.
--      Cara memeriksa & menghapusnya: docs/security-ktp.md bagian
--      "Policy storage generik".
--   1. Menjadikan kedua bucket private (public = false), batas 5 MB, hanya
--      JPEG/PNG/WEBP (SVG ditolak karena bisa memuat skrip). Bucket dibuat
--      bila belum ada.
--   2. Menghapus policy lama di storage.objects yang menyebut kedua bucket
--      ini (mis. "public read" / "anon upload").
--   3. Menambah policy baru untuk role `authenticated`:
--        - INSERT : hanya ke folder milik sendiri -> nama objek harus
--                   diawali "<auth.uid()>/" (kode baru mengunggah ke
--                   "<user_id>/ktp_....jpg").
--        - SELECT / UPDATE / DELETE : objek di folder "<auth.uid()>/" ATAU
--                   objek lama (path datar, mis. "ktp_123.jpg") yang
--                   kolom owner_id-nya = auth.uid(). Supabase Storage
--                   mengisi owner_id otomatis dengan user yang mengunggah,
--                   jadi file lama yang diunggah saat login tetap bisa
--                   diakses pemiliknya (backward compatible).
--      Signed URL (createSignedUrl) membutuhkan izin SELECT ini.
--   Role `anon` tidak mendapat akses apa pun.
--
-- Cek setelah migrasi: file lama dengan owner_id NULL tidak akan bisa
-- diakses lewat aplikasi — lihat docs/security-ktp.md bagian verifikasi.
-- =====================================================================

-- 0. Pemeriksaan awal: tolak policy storage generik yang membuka bucket private.
--
-- Sebuah policy PERMISSIVE di storage.objects dianggap BERBAHAYA bila
-- ekspresinya (USING untuk SELECT/UPDATE/DELETE/ALL, WITH CHECK untuk
-- INSERT/UPDATE/ALL):
--   a. kosong atau hanya `true`, ATAU
--   b. tidak membatasi bucket secara positif (`bucket_id = '<nama>'` atau
--      `bucket_id = ANY (...)`) DAN tidak membatasi pemilik (owner / owner_id /
--      storage.foldername dibandingkan dengan auth.uid()).
--      Contoh yang ditolak: `bucket_id <> 'avatars'`, `auth.role() = 'authenticated'`.
-- Policy yang menyebut 'ktp_images' / 'receipt_images' dilewati di sini karena
-- akan dihapus di langkah 2.
--
-- Pengecualian sadar (policy yang SUDAH dicek manual dan memang harus ada)
-- bisa ditambahkan by name ke array `allowed` di bawah.
--
-- Keterbatasan: pemeriksaan berbasis teks, bukan parser SQL. Ekspresi seperti
-- `bucket_id = 'x' or true` tidak terdeteksi — tetap tinjau dump pg_policies
-- (docs/security-ktp.md, Langkah 1).
do $$
declare
  allowed  text[] := array[]::text[];   -- mis. array['nama policy yang sudah dicek']
  p        record;
  expr     text;
  norm     text;
  bad      text[] := array[]::text[];
  has_bucket boolean;
  has_owner  boolean;
begin
  if not exists (
    select 1 from pg_class
    where oid = 'storage.objects'::regclass and relrowsecurity
  ) then
    raise exception 'RLS tidak aktif di storage.objects — bucket private tidak akan terlindungi. Aktifkan RLS dulu.';
  end if;

  for p in
    select policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and upper(permissive) = 'PERMISSIVE'
      and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL')
      and not (policyname = any (allowed))
      and not (
        coalesce(qual, '')          ~ '(ktp_images|receipt_images)'
        or coalesce(with_check, '') ~ '(ktp_images|receipt_images)'
      )
  loop
    foreach expr in array array[
      case when p.cmd in ('SELECT', 'UPDATE', 'DELETE', 'ALL') then coalesce(p.qual, '') end,
      case when p.cmd in ('INSERT', 'UPDATE', 'ALL')           then coalesce(p.with_check, p.qual, '') end
    ]
    loop
      continue when expr is null;
      norm := lower(regexp_replace(expr, '[\s()]', '', 'g'));
      has_bucket := expr ~* 'bucket_id\s*\)?\s*=\s*(''|any\s*\()';
      -- pemilik: kolom owner/owner_id atau folder dibandingkan dengan auth.uid()
      has_owner  := expr ~* '(\mowner(_id)?\M|storage\.foldername)' and expr ~* 'auth\.uid\(\)';
      if norm in ('', 'true') or not (has_bucket or has_owner) then
        bad := bad || format('%s [%s, roles=%s, expr=%s]', p.policyname, p.cmd, p.roles::text, expr);
        exit;
      end if;
    end loop;
  end loop;

  if array_length(bad, 1) > 0 then
    raise exception using
      message = 'Migration dibatalkan: ada policy storage.objects permisif yang tidak membatasi bucket/pemilik, sehingga ktp_images/receipt_images tetap bisa diakses walau private.',
      detail  = array_to_string(bad, E'\n'),
      hint    = 'Tinjau lalu hapus policy tersebut (drop policy "<nama>" on storage.objects;) atau batasi ke bucket tertentu. Lihat docs/security-ktp.md bagian "Policy storage generik".';
  end if;
end $$;

-- 1. Bucket private (hanya JPEG/PNG/WEBP — tanpa SVG)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('ktp_images',     'ktp_images',     false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('receipt_images', 'receipt_images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Hapus policy lama yang terkait kedua bucket
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename  = 'objects'
      and (
        coalesce(qual, '')       ~ '(ktp_images|receipt_images)'
        or coalesce(with_check, '') ~ '(ktp_images|receipt_images)'
      )
  loop
    raise notice 'Menghapus policy storage lama: %', p.policyname;
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

-- 3. Policy baru
create policy simkos_private_images_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('ktp_images', 'receipt_images')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy simkos_private_images_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id in ('ktp_images', 'receipt_images')
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or owner_id = (select auth.uid())::text
    )
  );

create policy simkos_private_images_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id in ('ktp_images', 'receipt_images')
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or owner_id = (select auth.uid())::text
    )
  )
  with check (
    bucket_id in ('ktp_images', 'receipt_images')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy simkos_private_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('ktp_images', 'receipt_images')
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or owner_id = (select auth.uid())::text
    )
  );
