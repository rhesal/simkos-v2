import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { execSync } from 'node:child_process'

const ROOT = path.resolve()
const DB_NAME = 'simkos_qa_staging'
const PG_PORT = 54322
const PG_USER = process.env.USER || 'disnak'
export const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'

function runBash(cmd) {
  if (process.platform === 'win32') {
    return execSync(`wsl bash -c "${cmd.replace(/"/g, '\\"')}"`, { stdio: 'pipe' }).toString()
  }
  return execSync(cmd, { shell: '/bin/bash', stdio: 'pipe' }).toString()
}

async function execSqlFile(client, relPath) {
  const sql = fs.readFileSync(path.join(ROOT, relPath), 'utf8')
  await client.query(sql)
}

export async function setupQaDatabase() {
  console.log(`[QA-DB] Menyiapkan database uji terisolasi: ${DB_NAME}...`)
  
  // 1. Buat database bersih
  const rootClient = new pg.Client({ host: 'localhost', port: PG_PORT, user: PG_USER, database: 'postgres' })
  await rootClient.connect()
  try {
    await rootClient.query(`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
      WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
    `)
    await rootClient.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);`)
    await rootClient.query(`CREATE DATABASE ${DB_NAME};`)
  } finally {
    await rootClient.end()
  }

  // 2. Hubungkan ke simkos_qa_staging dan siapkan role postgres jika belum ada
  const client = new pg.Client({ host: 'localhost', port: PG_PORT, user: PG_USER, database: DB_NAME })
  await client.connect()
  try {
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
          CREATE ROLE postgres SUPERUSER LOGIN;
        END IF;
      END $$;
      CREATE SCHEMA IF NOT EXISTS auth;
    `)

    // 3. Jalankan migrasi Supabase Auth (GoTrue) resmi
    console.log('[QA-DB] Menjalankan migrasi resmi Supabase Auth (GoTrue v2.197.0)...')
    const authMigrateCmd = `GOTRUE_JWT_SECRET='${JWT_SECRET}' GOTRUE_SITE_URL='http://127.0.0.1:5175' GOTRUE_DB_DRIVER='postgres' API_EXTERNAL_URL='http://127.0.0.1:8432' GOTRUE_DB_DATABASE_URL='postgres://disnak@localhost:${PG_PORT}/${DB_NAME}?sslmode=disable&search_path=auth,public' GOTRUE_DB_MIGRATIONS_PATH='/home/disnak/.local/bin/migrations' /home/disnak/.local/bin/auth migrate`
    runBash(authMigrateCmd)

    // 4. Terapkan skema pendukung storage & extensions
    console.log('[QA-DB] Menerapkan skema storage & extensions...')
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE OR REPLACE FUNCTION extensions.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
      GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE TABLE IF NOT EXISTS storage.buckets (
        id text PRIMARY KEY,
        name text NOT NULL,
        owner uuid,
        public boolean DEFAULT false,
        file_size_limit bigint,
        allowed_mime_types text[],
        created_at timestamptz DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS storage.objects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id text REFERENCES storage.buckets(id),
        name text NOT NULL,
        owner uuid,
        owner_id text,
        metadata jsonb,
        created_at timestamptz DEFAULT now(),
        UNIQUE (bucket_id, name)
      );
      CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$
      DECLARE _parts text[];
      BEGIN
        SELECT string_to_array(name, '/') INTO _parts;
        RETURN _parts[1:array_length(_parts, 1) - 1];
      END $$;
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
      GRANT ALL ON storage.objects, storage.buckets TO anon, authenticated, service_role;
    `)

    // 5. Terapkan skema aplikasi SimKos (sebelum pengguna tambahan didaftarkan)
    console.log('[QA-DB] Menerapkan skema dan migrasi SimKos...')
    await execSqlFile(client, 'docs/reference/live_schema_public.sql')
    await execSqlFile(client, 'qa/independent/05_live_state.sql')
    await execSqlFile(client, 'supabase/migrations/20261010000200_organizations_and_backfill.sql')
    await execSqlFile(client, 'supabase/migrations/20261010000210_org_rls_policies.sql')
    await execSqlFile(client, 'qa/independent/13_simulated_move.sql')
    await execSqlFile(client, 'supabase/migrations/20261010000300_private_storage_buckets.sql')
    await execSqlFile(client, 'supabase/migrations/20261010000400_inventories_missing_columns.sql')
    await execSqlFile(client, 'qa/independent/14_org_b_and_users.sql')

    // 6. Buat akun uji resmi menggunakan GoTrue admin CLI
    console.log('[QA-DB] Mendaftarkan pengguna uji resmi melalui GoTrue...')
    const testUsers = [
      { email: 'owner@simkos.test', pass: 'testpass123' },
      { email: 'admin@simkos.test', pass: 'testpass123' },
      { email: 'staff@simkos.test', pass: 'testpass123' },
      { email: 'ownerb@simkos.test', pass: 'testpass123' },
    ]
    for (const u of testUsers) {
      const createCmd = `GOTRUE_JWT_SECRET='${JWT_SECRET}' GOTRUE_SITE_URL='http://127.0.0.1:5175' GOTRUE_DB_DRIVER='postgres' API_EXTERNAL_URL='http://127.0.0.1:8432' GOTRUE_DB_DATABASE_URL='postgres://disnak@localhost:${PG_PORT}/${DB_NAME}?sslmode=disable&search_path=auth,public' GOTRUE_DB_MIGRATIONS_PATH='/home/disnak/.local/bin/migrations' /home/disnak/.local/bin/auth admin createuser ${u.email} ${u.pass} --confirm`
      runBash(createCmd)
    }

    // Pastikan seluruh pengguna memiliki role 'authenticated' agar klaim JWT memuat role tersebut untuk PostgREST RLS
    await client.query(`
      UPDATE auth.users
      SET role = 'authenticated';
    `)

    // Ambil UUID pengguna yang baru dibuat
    const userRes = await client.query(`
      SELECT id, email FROM auth.users 
      WHERE email IN ('owner@simkos.test', 'admin@simkos.test', 'staff@simkos.test', 'ownerb@simkos.test');
    `)
    const userMap = Object.fromEntries(userRes.rows.map(r => [r.email, r.id]))

    // Tautkan akun GoTrue ke organization_members
    await client.query(`
      INSERT INTO public.organization_members (org_id, user_id, role)
      VALUES
        ((SELECT id FROM public.organizations WHERE name = 'SimKos'), '${userMap['owner@simkos.test']}', 'owner'),
        ((SELECT id FROM public.organizations WHERE name = 'SimKos'), '${userMap['admin@simkos.test']}', 'owner'),
        ((SELECT id FROM public.organizations WHERE name = 'SimKos'), '${userMap['staff@simkos.test']}', 'staff'),
        ((SELECT id FROM public.organizations WHERE name = 'Kos Lain'), '${userMap['ownerb@simkos.test']}', 'owner')
      ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    `)

    await client.query(`SET simkos.admin_user_id = '${userMap['admin@simkos.test']}';`)
    await execSqlFile(client, 'supabase/migrations/20261010000500_org_admin_role.sql')
    await execSqlFile(client, 'supabase/migrations/20261018000600_pindah_kamar.sql')
    await execSqlFile(client, 'supabase/migrations/20261107000700_tenant_alamat.sql')
    await execSqlFile(client, 'supabase/migrations/20261108000800_assets_phase2.sql')
    await execSqlFile(client, 'supabase/migrations/20261109000900_assets_phase4_bookkeeping.sql')

    // 7. Izin hak akses PostgREST / Supabase
    await client.query(`
      GRANT USAGE ON SCHEMA public, auth, storage, extensions TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public, auth, storage TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public, auth, storage TO anon, authenticated, service_role;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public, auth, storage, extensions TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
    `)

    console.log('[QA-DB] Database skema migrasi & akun resmi Supabase Auth berhasil disiapkan!')
    return userMap
  } finally {
    await client.end()
  }
}

if (process.argv[1] && process.argv[1].endsWith('setup_qa_database.mjs')) {
  setupQaDatabase()
    .then((map) => {
      console.log('User Map:', map)
      process.exit(0)
    })
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
}
