-- =====================================================================
-- SimKos v2 — Storage privat berbasis organisasi (foto KTP & nota)
-- =====================================================================
-- Kondisi live sebelum migration ini: bucket ktp_images & receipt_images
-- SUDAH private, tanpa batas ukuran/tipe. Policy lama:
--   "Izinkan lihat KTP"   SELECT to authenticated using (bucket_id = 'ktp_images')
--   "Izinkan upload KTP"  INSERT to authenticated with check (bucket_id = 'ktp_images')
-- -> SEMUA user yang bisa login melihat SEMUA foto KTP.
--
-- PRASYARAT (urutan deploy, lihat docs/security-ktp.md):
--   migration 200 + 210  ->  deploy frontend baru  ->
--   supabase/scripts/move_root_files_to_org.mjs  ->  migration INI.
-- Migration ini GAGAL dengan sengaja (langkah 0b) bila masih ada baris
-- tenants/expenses/inventories yang menunjuk file di luar folder "<org_id>/",
-- supaya tidak ada jendela waktu di mana pemilik tidak bisa membuka fotonya.
--
-- Langkah:
--   0.  Tolak policy storage permisif generik (peringatan dini, berbasis teks).
--   0b. Tolak bila masih ada referensi file di luar folder org (move script
--       belum dijalankan / belum tuntas). File root yang TIDAK direferensikan
--       hanya dilaporkan (NOTICE); setelah migration ini hanya bisa diakses
--       lewat dashboard / service role.
--   1.  Kedua bucket private, maks 5 MB, hanya JPEG/PNG/WEBP (tanpa SVG).
--   2.  Hapus policy lama yang menyebut kedua bucket.
--   3.  Policy baru (authenticated): SELECT/INSERT/UPDATE/DELETE hanya untuk
--       objek "<org_id>/..." di mana user anggota org tersebut
--       (public.storage_object_org_member). Tidak ada akses ke objek di root.
--   4.  Guard RESTRICTIVE simkos_private_images_guard (to public): digabung AND
--       dengan semua policy permisif lain, jadi apa pun policy lain yang ada,
--       objek di kedua bucket hanya bisa diakses anggota org pemilik folder.
--       anon selalu tertolak. Bucket lain tidak terpengaruh.
--   5.  Trigger di tenants/expenses/(inventories bila kolomnya ada): nilai
--       foto_ktp_url / bukti_nota_url / receipt_url yang BARU/BERUBAH wajib
--       diawali "<org_id baris itu>/" (mencegah menautkan file org lain).
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
-- `bucket_id = 'x' or true` atau `owner is not null and auth.uid() is not null`
-- tidak terdeteksi. Perlindungan sebenarnya ada di guard RESTRICTIVE langkah 4;
-- langkah ini hanya peringatan dini. Tetap tinjau dump pg_policies
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

-- 0b. Semua referensi file harus sudah di folder "<org_id>/" -------------------
do $$
declare
  n_bad   bigint := 0;
  n       bigint;
  sample  text;
  n_root  bigint;
begin
  select count(*), min(foto_ktp_url) into n, sample from public.tenants
  where coalesce(foto_ktp_url, '') <> '' and left(foto_ktp_url, length(org_id::text) + 1) <> org_id::text || '/';
  n_bad := n_bad + n;
  if n > 0 then raise warning 'tenants.foto_ktp_url di luar folder org: % baris (contoh: %)', n, sample; end if;

  select count(*), min(bukti_nota_url) into n, sample from public.expenses
  where coalesce(bukti_nota_url, '') <> '' and left(bukti_nota_url, length(org_id::text) + 1) <> org_id::text || '/';
  n_bad := n_bad + n;
  if n > 0 then raise warning 'expenses.bukti_nota_url di luar folder org: % baris (contoh: %)', n, sample; end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'inventories' and column_name = 'receipt_url') then
    execute $q$select count(*), min(receipt_url) from public.inventories
               where coalesce(receipt_url, '') <> '' and left(receipt_url, length(org_id::text) + 1) <> org_id::text || '/'$q$
      into n, sample;
    n_bad := n_bad + n;
    if n > 0 then raise warning 'inventories.receipt_url di luar folder org: % baris (contoh: %)', n, sample; end if;
  end if;

  if n_bad > 0 then
    raise exception using
      message = format('Migration dibatalkan: %s baris masih menunjuk file di luar folder "<org_id>/". Setelah migration ini file tsb tidak bisa dibuka.', n_bad),
      hint    = 'Jalankan dulu: node supabase/scripts/move_root_files_to_org.mjs (lihat docs/security-ktp.md), lalu ulangi migration ini.';
  end if;

  select count(*) into n_root from storage.objects
  where bucket_id in ('ktp_images', 'receipt_images') and position('/' in name) = 0;
  if n_root > 0 then
    raise notice '% file di root bucket tidak direferensikan baris mana pun; setelah migration ini hanya bisa diakses lewat dashboard/service role.', n_root;
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

-- 3. Policy baru -----------------------------------------------------------
-- Helper: true bila segmen folder pertama nama objek adalah UUID organisasi
-- yang beranggotakan user login. Objek di root (tanpa folder) -> false.
create or replace function public.storage_object_org_member(object_name text)
returns boolean
language plpgsql stable
set search_path = ''
as $$
declare
  seg text;
begin
  if object_name is null or position('/' in object_name) = 0 then
    return false;
  end if;
  seg := split_part(object_name, '/', 1);
  if seg !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_org_member(seg::uuid);
end $$;
revoke all on function public.storage_object_org_member(text) from public;
grant execute on function public.storage_object_org_member(text) to anon, authenticated, service_role;

drop policy if exists simkos_private_images_select_org on storage.objects;
drop policy if exists simkos_private_images_insert_org on storage.objects;
drop policy if exists simkos_private_images_update_org on storage.objects;
drop policy if exists simkos_private_images_delete_org on storage.objects;

create policy simkos_private_images_select_org on storage.objects
  for select to authenticated
  using (bucket_id in ('ktp_images', 'receipt_images')
         and public.storage_object_org_member(name));

create policy simkos_private_images_insert_org on storage.objects
  for insert to authenticated
  with check (bucket_id in ('ktp_images', 'receipt_images')
              and public.storage_object_org_member(name));

create policy simkos_private_images_update_org on storage.objects
  for update to authenticated
  using (bucket_id in ('ktp_images', 'receipt_images')
         and public.storage_object_org_member(name))
  with check (bucket_id in ('ktp_images', 'receipt_images')
              and public.storage_object_org_member(name));

create policy simkos_private_images_delete_org on storage.objects
  for delete to authenticated
  using (bucket_id in ('ktp_images', 'receipt_images')
         and public.storage_object_org_member(name));

-- 4. Guard RESTRICTIVE ------------------------------------------------------
drop policy if exists simkos_private_images_guard on storage.objects;
create policy simkos_private_images_guard on storage.objects
  as restrictive
  for all
  to public
  using (
    bucket_id not in ('ktp_images', 'receipt_images')
    or public.storage_object_org_member(name)
  )
  with check (
    bucket_id not in ('ktp_images', 'receipt_images')
    or public.storage_object_org_member(name)
  );

-- 5. Trigger path file wajib di folder org baris itu -------------------------
create or replace function public.enforce_org_storage_path()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col    text := tg_argv[0];
  new_v  text := to_jsonb(new) ->> col;
  old_v  text;
begin
  if tg_op = 'UPDATE' then
    old_v := to_jsonb(old) ->> col;
    if new_v is not distinct from old_v and new.org_id is not distinct from old.org_id then
      return new;   -- nilai tidak berubah (mis. update kolom lain)
    end if;
  end if;
  if new_v is null or new_v = '' then
    return new;
  end if;
  if new.org_id is null
     or left(new_v, length(new.org_id::text) + 1) <> new.org_id::text || '/'
     or new_v ~ '(^|/)\.\.(/|$)' then
    raise exception using errcode = '42501',
      message = format('%s.%s harus berupa path "<org_id>/..." milik organisasi baris ini.', tg_table_name, col),
      detail  = format('nilai: %s', new_v);
  end if;
  return new;
end $$;

drop trigger if exists tenants_ktp_path_org on public.tenants;
create trigger tenants_ktp_path_org
  before insert or update on public.tenants
  for each row execute function public.enforce_org_storage_path('foto_ktp_url');

drop trigger if exists expenses_nota_path_org on public.expenses;
create trigger expenses_nota_path_org
  before insert or update on public.expenses
  for each row execute function public.enforce_org_storage_path('bukti_nota_url');

do $$
begin
  -- Kolom inventories.receipt_url dipakai kode tetapi belum ada di live.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'inventories' and column_name = 'receipt_url') then
    execute 'drop trigger if exists inventories_receipt_path_org on public.inventories';
    execute 'create trigger inventories_receipt_path_org before insert or update on public.inventories '
            'for each row execute function public.enforce_org_storage_path(''receipt_url'')';
  else
    raise notice 'inventories.receipt_url tidak ada: trigger path untuk inventories dilewati (buat ulang setelah kolomnya ditambahkan).';
  end if;
end $$;
