-- =====================================================================
-- QA: stub minimal Supabase (auth + storage + roles) untuk Postgres lokal.
-- BUKAN skema Supabase asli. Cukup untuk menguji policy RLS di migration.
-- auth.uid() membaca claim 'sub' dari setting request.jwt.claims, sama
-- seperti PostgREST/Supabase.
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(current_setting('request.jwt.claim.sub', true),
             (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')),
    '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  owner_id text,
  metadata jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
create or replace function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- Tambahan untuk baseline live
create schema if not exists extensions;
create or replace function extensions.uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
grant usage on schema extensions to anon, authenticated, service_role;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'anon')
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;
