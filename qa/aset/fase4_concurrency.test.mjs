import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import pg from 'pg'

const ROOT = path.resolve()
const PG_PORT = 54322
const PG_USER = process.env.USER || 'disnak'

function getCanonicalHash(orgId, periodKey, notes = '') {
  return crypto.createHash('md5').update(`${orgId}|${periodKey}|${notes ? notes.trim() : ''}`).digest('hex')
}

function ensurePostgresRunning() {
  try {
    execSync(
      `LD_LIBRARY_PATH=/home/${PG_USER}/.local/postgres/usr/lib/x86_64-linux-gnu /home/${PG_USER}/.local/postgres/usr/lib/postgresql/16/bin/pg_isready -h localhost -p ${PG_PORT}`,
      { stdio: 'ignore' }
    )
  } catch {
    console.log('[Postgres] Memulai server PostgreSQL lokal di port ' + PG_PORT + '...')
    execSync(`bash ${path.join(ROOT, 'scripts/start_userspace_pg.sh')}`, { stdio: 'inherit' })
  }
}

async function createClient(dbName = 'qa_fase4_concurrency') {
  const client = new pg.Client({
    host: 'localhost',
    port: PG_PORT,
    user: PG_USER,
    database: dbName,
    statement_timeout: 8000,
    query_timeout: 8000,
    connectionTimeoutMillis: 5000,
  })
  await client.connect()
  await client.query("SET statement_timeout = '8000';")
  return client
}

async function setClientAuth(client, { userId = null, role = 'anon' } = {}) {
  if (!userId) {
    await client.query(`
      SET ROLE ${role};
      SELECT set_config('request.jwt.claims', '', false);
      SELECT set_config('request.jwt.claim.sub', '', false);
      SELECT set_config('request.jwt.claim.role', '${role}', false);
    `)
  } else {
    await client.query(`
      SET ROLE ${role};
      SELECT set_config('request.jwt.claims', '{"sub":"${userId}","role":"${role}"}', false);
      SELECT set_config('request.jwt.claim.sub', '${userId}', false);
      SELECT set_config('request.jwt.claim.role', '${role}', false);
    `)
  }
}

async function execSqlFile(client, relPath) {
  const sql = fs.readFileSync(path.join(ROOT, relPath), 'utf8')
  await client.query(sql)
}

test('Fase 4B-1R Konkurensi: Dua Koneksi Independen pada Server PostgreSQL Nyata', async (t) => {
  ensurePostgresRunning()

  const DB_NAME = 'qa_fase4_concurrency'

  const rootClient = await createClient('postgres')
  try {
    await rootClient.query(`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
      WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
    `)
    await rootClient.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`)
    await rootClient.query(`CREATE DATABASE ${DB_NAME}`)
  } finally {
    await rootClient.end()
  }

  // Setup skema migrasi
  const setupClient = await createClient(DB_NAME)
  let orgA, ownerA, assetId, compId, previewToken
  try {
    await execSqlFile(setupClient, 'qa/independent/00_stub.sql')
    await execSqlFile(setupClient, 'docs/reference/live_schema_public.sql')
    await execSqlFile(setupClient, 'qa/independent/05_live_state.sql')
    await execSqlFile(setupClient, 'supabase/migrations/20261010000200_organizations_and_backfill.sql')
    await execSqlFile(setupClient, 'supabase/migrations/20261010000210_org_rls_policies.sql')
    await execSqlFile(setupClient, 'qa/independent/13_simulated_move.sql')
    await execSqlFile(setupClient, 'supabase/migrations/20261010000300_private_storage_buckets.sql')
    await execSqlFile(setupClient, 'supabase/migrations/20261010000400_inventories_missing_columns.sql')
    await execSqlFile(setupClient, 'qa/independent/14_org_b_and_users.sql')

    await setupClient.query("SET simkos.admin_user_id = '11111111-0000-0000-0000-000000000001';")
    await execSqlFile(setupClient, 'supabase/migrations/20261010000500_org_admin_role.sql')
    await execSqlFile(setupClient, 'supabase/migrations/20261018000600_pindah_kamar.sql')
    await execSqlFile(setupClient, 'supabase/migrations/20261107000700_tenant_alamat.sql')
    await execSqlFile(setupClient, 'supabase/migrations/20261108000800_assets_phase2.sql')
    await execSqlFile(setupClient, 'supabase/migrations/20261109000900_assets_phase4_bookkeeping.sql')

    const orgARes = await setupClient.query("SELECT id FROM public.organizations WHERE name = 'SimKos'")
    orgA = orgARes.rows[0].id
    ownerA = '22222222-0000-0000-0000-000000000002'

    // Atur tanggal pembukuan
    await setClientAuth(setupClient, { userId: ownerA, role: 'authenticated' })
    await setupClient.query("SELECT public.set_bookkeeping_start_date($1, '2027-01-01');", [orgA])

    // Buat aset & komponen
    const aRes = await setupClient.query(`
      INSERT INTO public.assets (org_id, nama_aset, kategori_aset, dasar_penggunaan, status_pencatatan)
      VALUES ($1, 'Kulkas Bersama', 'elektronik_kantor', 'milik_sendiri', 'draft') RETURNING id;
    `, [orgA])
    assetId = aRes.rows[0].id

    const cRes = await setupClient.query(`
      INSERT INTO public.asset_components (
        asset_id, org_id, nama_komponen, biaya_perolehan, nilai_sisa, masa_manfaat_bulan,
        tanggal_siap_guna, porsi_usaha_persen, status_kapitalisasi, metode_penyusutan
      ) VALUES ($1, $2, 'Kulkas 2 Pintu', 3600000, 0, 36, '2027-01-01', 100, 'kapitalisasi', 'garis_lurus')
      RETURNING id;
    `, [assetId, orgA])
    compId = cRes.rows[0].id

    // Aktivasi
    await setupClient.query("SELECT public.activate_asset($1, 'Aktivasi Kulkas');", [assetId])

    // Dapatkan preview token
    const pRes = await setupClient.query("SELECT public.preview_depreciation_posting($1, '2027-01') as val;", [orgA])
    const pVal = typeof pRes.rows[0].val === 'string' ? JSON.parse(pRes.rows[0].val) : pRes.rows[0].val
    previewToken = pVal.preview_token
  } finally {
    await setupClient.end()
  }

  let postedBatchId

  // --------------------------------------------------------------------------
  // Uji 1: Dua Permintaan Bersamaan Memposting Periode yang Sama
  // --------------------------------------------------------------------------
  await t.test('1. Dua Permintaan Bersamaan Memposting Periode yang Sama (Advisory Lock & Race Condition Guard)', async () => {
    const client1 = await createClient(DB_NAME)
    const client2 = await createClient(DB_NAME)

    try {
      await setClientAuth(client1, { userId: ownerA, role: 'authenticated' })
      await setClientAuth(client2, { userId: ownerA, role: 'authenticated' })

      const notes1 = 'Posting K1'
      const notes2 = 'Posting K2'
      const hash1 = getCanonicalHash(orgA, '2027-01', notes1)
      const hash2 = getCanonicalHash(orgA, '2027-01', notes2)

      // Dua koneksi menembak post_depreciation_batch secara konkuren dengan hash kanonis
      const results = await Promise.allSettled([
        client1.query(`
          SELECT public.post_depreciation_batch(
            $1, '2027-01', 'idemp-concurrent-1', $2, $3, $4
          );
        `, [orgA, hash1, previewToken, notes1]),
        client2.query(`
          SELECT public.post_depreciation_batch(
            $1, '2027-01', 'idemp-concurrent-2', $2, $3, $4
          );
        `, [orgA, hash2, previewToken, notes2]),
      ])

      const fulfilled = results.filter(r => r.status === 'fulfilled')
      const rejected = results.filter(r => r.status === 'rejected')

      assert.equal(fulfilled.length, 1, 'Tepat satu permintaan posting yang berhasil')
      assert.equal(rejected.length, 1, 'Permintaan konkuren kedua harus ditolak')
      assert.ok(
        rejected[0].reason.message.includes('SIMKOS_BATCH_ALREADY_POSTED'),
        'Pesan error penolakan harus SIMKOS_BATCH_ALREADY_POSTED'
      )

      // Verifikasi di database: hanya ada tepat 1 batch aktif
      const countRes = await client1.query(
        "SELECT id, count(*) over() as cnt FROM public.asset_depreciation_batches WHERE org_id = $1 AND period_key = '2027-01';",
        [orgA]
      )
      assert.equal(Number(countRes.rows[0].cnt), 1, 'Database harus tetap konsisten dengan tepat 1 batch')
      postedBatchId = countRes.rows[0].id
    } finally {
      await client1.end()
      await client2.end()
    }
  })

  // --------------------------------------------------------------------------
  // Uji 2: Dua Permintaan Bersamaan Membatalkan Batch yang Sama
  // --------------------------------------------------------------------------
  await t.test('2. Dua Pembatalan Bersamaan pada Batch yang Sama (Re-read After Lock & Storno Idempotency)', async () => {
    const client1 = await createClient(DB_NAME)
    const client2 = await createClient(DB_NAME)

    try {
      await setClientAuth(client1, { userId: ownerA, role: 'authenticated' })
      await setClientAuth(client2, { userId: ownerA, role: 'authenticated' })

      // Dua koneksi menembak reverse_depreciation_batch secara serentak
      const results = await Promise.allSettled([
        client1.query("SELECT public.reverse_depreciation_batch($1, 'Pembatalan Konkuren 1');", [postedBatchId]),
        client2.query("SELECT public.reverse_depreciation_batch($1, 'Pembatalan Konkuren 2');", [postedBatchId]),
      ])

      const fulfilled = results.filter(r => r.status === 'fulfilled')
      const rejected = results.filter(r => r.status === 'rejected')

      assert.equal(fulfilled.length, 1, 'Tepat satu pembatalan yang berhasil')
      assert.equal(rejected.length, 1, 'Pembatalan kedua wajib ditolak karena batch sudah tidak posted')
      assert.ok(
        rejected[0].reason.message.includes('SIMKOS_BATCH_NOT_POSTED'),
        'Pesan error penolakan harus SIMKOS_BATCH_NOT_POSTED'
      )

      // Verifikasi batch berstatus reversed dan storno line hanya ada 1 set
      const checkRes = await client1.query(
        "SELECT batch_status FROM public.asset_depreciation_batches WHERE id = $1;",
        [postedBatchId]
      )
      assert.equal(checkRes.rows[0].batch_status, 'reversed')

      const ledgerStorno = await client1.query(
        "SELECT count(*) as cnt FROM public.asset_depreciation_ledger WHERE batch_id = $1 AND entry_type = 'reversal';",
        [postedBatchId]
      )
      assert.equal(Number(ledgerStorno.rows[0].cnt), 1, 'Hanya ada 1 baris reversal storno, tidak terduplikasi')
    } finally {
      await client1.end()
      await client2.end()
    }
  })

  // --------------------------------------------------------------------------
  // Uji 3: Dua Pembatalan Bersamaan pada Batch Bernilai Nol
  // --------------------------------------------------------------------------
  await t.test('3. Dua Pembatalan Bersamaan pada Batch Bernilai Nol (Zero Depreciation Batch)', async () => {
    const setupClient = await createClient(DB_NAME)
    let zeroBatchId
    try {
      await setClientAuth(setupClient, { userId: ownerA, role: 'authenticated' })

      // Buat komponen dasar nol (biaya = sisa)
      const insZero = await setupClient.query(`
        INSERT INTO public.asset_components (
          asset_id, org_id, nama_komponen, biaya_perolehan, nilai_sisa, masa_manfaat_bulan,
          tanggal_siap_guna, porsi_usaha_persen, status_kapitalisasi, metode_penyusutan
        ) VALUES ($1, $2, 'Komponen Dasar Nol', 1000000, 1000000, 12, '2027-01-01', 100, 'kapitalisasi', 'garis_lurus')
        RETURNING id;
      `, [assetId, orgA])

      // Aktivasi snapshot baru aset
      await setupClient.query("SELECT public.activate_asset($1, 'Snapshot Dasar Nol');", [assetId])

      // Posting pengganti untuk 2027-01 dengan total biaya kulkas
      const prevRes = await setupClient.query("SELECT public.preview_depreciation_posting($1, '2027-01') as val;", [orgA])
      const prev = typeof prevRes.rows[0].val === 'string' ? JSON.parse(prevRes.rows[0].val) : prevRes.rows[0].val
      const notesRep = 'Posting Pengganti Jan'
      const hashRep = getCanonicalHash(orgA, '2027-01', notesRep)
      const repRes = await setupClient.query(`
        SELECT public.post_depreciation_batch($1, '2027-01', 'idemp-rep-jan', $2, $3, $4) as val;
      `, [orgA, hashRep, prev.preview_token, notesRep])
      const repBatch = typeof repRes.rows[0].val === 'string' ? JSON.parse(repRes.rows[0].val) : repRes.rows[0].val
      zeroBatchId = repBatch.id
    } finally {
      await setupClient.end()
    }

    const client1 = await createClient(DB_NAME)
    const client2 = await createClient(DB_NAME)

    try {
      await setClientAuth(client1, { userId: ownerA, role: 'authenticated' })
      await setClientAuth(client2, { userId: ownerA, role: 'authenticated' })

      const results = await Promise.allSettled([
        client1.query("SELECT public.reverse_depreciation_batch($1, 'Batal Zero 1');", [zeroBatchId]),
        client2.query("SELECT public.reverse_depreciation_batch($1, 'Batal Zero 2');", [zeroBatchId]),
      ])

      const fulfilled = results.filter(r => r.status === 'fulfilled')
      const rejected = results.filter(r => r.status === 'rejected')

      assert.equal(fulfilled.length, 1, 'Tepat satu pembatalan yang berhasil')
      assert.equal(rejected.length, 1, 'Pembatalan kedua wajib ditolak')
      assert.ok(
        rejected[0].reason.message.includes('SIMKOS_BATCH_NOT_POSTED'),
        'Pesan error penolakan harus SIMKOS_BATCH_NOT_POSTED'
      )
    } finally {
      await client1.end()
      await client2.end()
    }
  })

  // --------------------------------------------------------------------------
  // Uji 4: Konkurensi Posting vs Penguncian Periode (Advisory Lock Serialization)
  // --------------------------------------------------------------------------
  await t.test('4. Konkurensi Posting vs Penguncian Periode (Serialisasi Terjamin)', async () => {
    const setupClient = await createClient(DB_NAME)
    let pFebToken
    try {
      await setClientAuth(setupClient, { userId: ownerA, role: 'authenticated' })

      // Pastikan batch Jan 2027 aktif diposting terlebih dahulu
      const pJanRes = await setupClient.query("SELECT public.preview_depreciation_posting($1, '2027-01') as val;", [orgA])
      const pJan = typeof pJanRes.rows[0].val === 'string' ? JSON.parse(pJanRes.rows[0].val) : pJanRes.rows[0].val
      const nJan = 'Posting Jan Baseline'
      const hJan = getCanonicalHash(orgA, '2027-01', nJan)
      await setupClient.query(
        "SELECT public.post_depreciation_batch($1, '2027-01', 'idemp-concurr-jan', $2, $3, $4);",
        [orgA, hJan, pJan.preview_token, nJan]
      )

      // Ambil token pratinjau untuk Feb 2027
      const pFebRes = await setupClient.query("SELECT public.preview_depreciation_posting($1, '2027-02') as val;", [orgA])
      const pFeb = typeof pFebRes.rows[0].val === 'string' ? JSON.parse(pFebRes.rows[0].val) : pFebRes.rows[0].val
      pFebToken = pFeb.preview_token
    } finally {
      await setupClient.end()
    }

    const client1 = await createClient(DB_NAME)
    const client2 = await createClient(DB_NAME)

    try {
      await setClientAuth(client1, { userId: ownerA, role: 'authenticated' })
      await setClientAuth(client2, { userId: ownerA, role: 'authenticated' })

      const notesFeb = 'Posting Konkuren Feb'
      const hashFeb = getCanonicalHash(orgA, '2027-02', notesFeb)

      // Client 1 mencoba post Feb 2027, sementara Client 2 serentak mengunci periode Feb 2027
      const results = await Promise.allSettled([
        client1.query(`
          SELECT public.post_depreciation_batch(
            $1, '2027-02', 'idemp-concurr-feb', $2, $3, $4
          );
        `, [orgA, hashFeb, pFebToken, notesFeb]),
        client2.query("SELECT public.lock_accounting_period($1, '2027-02');", [orgA]),
      ])

      const [postRes, lockRes] = results

      // Lock harus selalu fulfilled
      assert.equal(lockRes.status, 'fulfilled', 'Penguncian periode harus berhasil')

      // Jika posting dijalankan sebelum lock, posting fulfilled. Jika lock dijalankan lebih dulu, posting rejected dengan SIMKOS_PERIOD_LOCKED
      if (postRes.status === 'rejected') {
        assert.ok(
          postRes.reason.message.includes('SIMKOS_PERIOD_LOCKED'),
          `Jika lock mendahului post, error harus SIMKOS_PERIOD_LOCKED, got: ${postRes.reason.message}`
        )
      } else {
        assert.equal(postRes.status, 'fulfilled', 'Posting berhasil karena memperoleh advisory lock sebelum penguncian')
      }

      // Verifikasi konsistensi periode: periode Feb 2027 wajib berstatus terkunci
      const periodCheck = await client1.query(
        "SELECT status FROM public.asset_accounting_periods WHERE org_id = $1 AND period_key = '2027-02';",
        [orgA]
      )
      assert.equal(periodCheck.rows[0].status, 'locked', "Periode 2027-02 harus berstatus 'locked'")
    } finally {
      await client1.end()
      await client2.end()
    }
  })

  // --------------------------------------------------------------------------
  // Uji 5: Konkurensi Posting vs Revisi Parameter Komponen (Race Guard & State Verification)
  // --------------------------------------------------------------------------
  await t.test('5. Konkurensi Posting vs Revisi Parameter Komponen (Advisory Lock Mutual Exclusion)', async () => {
    const setupClient = await createClient(DB_NAME)
    let pMarToken
    try {
      await setClientAuth(setupClient, { userId: ownerA, role: 'authenticated' })

      // Buka kunci periode Feb jika terkunci dan pastikan Feb diposting jika belum
      await setupClient.query("SELECT public.unlock_accounting_period($1, '2027-02', 'Buka untuk uji konkurensi');", [orgA])

      const febCheck = await setupClient.query(
        "SELECT id FROM public.asset_depreciation_batches WHERE org_id = $1 AND period_key = '2027-02' AND batch_status = 'posted';",
        [orgA]
      )
      if (febCheck.rows.length === 0) {
        const pFebRes = await setupClient.query("SELECT public.preview_depreciation_posting($1, '2027-02') as val;", [orgA])
        const pFeb = typeof pFebRes.rows[0].val === 'string' ? JSON.parse(pFebRes.rows[0].val) : pFebRes.rows[0].val
        const nFeb = 'Posting Feb Prerequisite'
        const hFeb = getCanonicalHash(orgA, '2027-02', nFeb)
        await setupClient.query(
          "SELECT public.post_depreciation_batch($1, '2027-02', 'idemp-concurr-feb-fix', $2, $3, $4);",
          [orgA, hFeb, pFeb.preview_token, nFeb]
        )
      }

      // Ambil token pratinjau untuk Mar 2027
      const pMarRes = await setupClient.query("SELECT public.preview_depreciation_posting($1, '2027-03') as val;", [orgA])
      const pMar = typeof pMarRes.rows[0].val === 'string' ? JSON.parse(pMarRes.rows[0].val) : pMarRes.rows[0].val
      pMarToken = pMar.preview_token
    } finally {
      await setupClient.end()
    }

    const client1 = await createClient(DB_NAME)
    const client2 = await createClient(DB_NAME)

    try {
      await setClientAuth(client1, { userId: ownerA, role: 'authenticated' })
      await setClientAuth(client2, { userId: ownerA, role: 'authenticated' })

      const notesMar = 'Posting Konkuren Mar'
      const hashMar = getCanonicalHash(orgA, '2027-03', notesMar)

      // Client 1 memposting Mar 2027 sementara Client 2 serentak mencoba merevisi parameter komponen kulkas
      const results = await Promise.allSettled([
        client1.query(`
          SELECT public.post_depreciation_batch(
            $1, '2027-03', 'idemp-concurr-mar', $2, $3, $4
          );
        `, [orgA, hashMar, pMarToken, notesMar]),
        client2.query(`
          SELECT public.revise_component_parameters(
            $1, 4800000, 0, 36, '2027-01-01', 100, 'garis_lurus', 'kapitalisasi', 'Revisi biaya serentak'
          );
        `, [compId]),
      ])

      const [postRes, revRes] = results

      // Karena batch 2027-01 & 2027-02 sudah posted, revise_component_parameters PASTI ditolak dengan SIMKOS_POSTED_BATCH_EXISTS
      // baik dieksekusi sebelum Mar maupun sesudah Mar karena advisory lock memastikan atomisitas!
      assert.equal(revRes.status, 'rejected', 'Revisi parameter wajib ditolak saat ada batch aktif')
      assert.ok(
        revRes.reason.message.includes('SIMKOS_POSTED_BATCH_EXISTS'),
        `Error harus SIMKOS_POSTED_BATCH_EXISTS, got: ${revRes.reason.message}`
      )

      assert.equal(postRes.status, 'fulfilled', 'Posting batch Maret harus berhasil tanpa terganggu TOCTOU')
    } finally {
      await client1.end()
      await client2.end()
    }
  })
})
