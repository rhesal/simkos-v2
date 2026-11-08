import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const ROOT = path.resolve()
const DB_NAME = 'simkos_qa_staging'
const PG_PORT = 54322
const PG_USER = process.env.USER || 'disnak'

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

  // 2. Hubungkan ke simkos_qa_staging dan terapkan skema
  const client = new pg.Client({ host: 'localhost', port: PG_PORT, user: PG_USER, database: DB_NAME })
  await client.connect()
  try {
    await execSqlFile(client, 'qa/independent/00_stub.sql')
    await execSqlFile(client, 'docs/reference/live_schema_public.sql')
    await execSqlFile(client, 'qa/independent/05_live_state.sql')
    await execSqlFile(client, 'supabase/migrations/20261010000200_organizations_and_backfill.sql')
    await execSqlFile(client, 'supabase/migrations/20261010000210_org_rls_policies.sql')
    await execSqlFile(client, 'qa/independent/13_simulated_move.sql')
    await execSqlFile(client, 'supabase/migrations/20261010000300_private_storage_buckets.sql')
    await execSqlFile(client, 'supabase/migrations/20261010000400_inventories_missing_columns.sql')
    await execSqlFile(client, 'qa/independent/14_org_b_and_users.sql')

    await client.query("SET simkos.admin_user_id = '11111111-0000-0000-0000-000000000001';")
    await execSqlFile(client, 'supabase/migrations/20261010000500_org_admin_role.sql')
    await execSqlFile(client, 'supabase/migrations/20261018000600_pindah_kamar.sql')
    await execSqlFile(client, 'supabase/migrations/20261107000700_tenant_alamat.sql')
    await execSqlFile(client, 'supabase/migrations/20261108000800_assets_phase2.sql')

    // 3. Izin hak akses PostgREST / Supabase
    await client.query(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
    `)

    console.log('[QA-DB] Database skema migrasi berhasil diterapkan!')
  } finally {
    await client.end()
  }
}

if (process.argv[1] && process.argv[1].endsWith('setup_qa_database.mjs')) {
  setupQaDatabase()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
}
