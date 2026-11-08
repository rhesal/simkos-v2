import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import pg from 'pg'

const ROOT = path.resolve()
const PG_PORT = 54322
const PG_USER = process.env.USER || 'disnak'

// Helper: memastikan server PostgreSQL lokal berjalan di port 54322
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

// Helper: buat koneksi client baru
async function createClient(dbName = 'qa_concurrency_test') {
  const client = new pg.Client({
    host: 'localhost',
    port: PG_PORT,
    user: PG_USER,
    database: dbName,
  })
  await client.connect()
  return client
}

// Helper: switch auth context pada sesi client
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

// Helper: baca file SQL dan eksekusi
async function execSqlFile(client, relPath) {
  const sql = fs.readFileSync(path.join(ROOT, relPath), 'utf8')
  await client.query(sql)
}

test('Pengujian Konkurensi Database: Koneksi Independen pada Database yang Sama', async (t) => {
  ensurePostgresRunning()

  const DB_NAME = 'qa_concurrency_test'

  // Siapkan database uji bersih
  const rootClient = await createClient('postgres')
  await rootClient.query(`
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
    WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
  `)
  await rootClient.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`)
  await rootClient.query(`CREATE DATABASE ${DB_NAME}`)
  await rootClient.end()

  // Setup skema migrasi
  const setupClient = await createClient(DB_NAME)
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

  const orgARes = await setupClient.query("SELECT id FROM public.organizations WHERE name = 'SimKos'")
  const orgA = orgARes.rows[0].id
  const adminA = '11111111-0000-0000-0000-000000000001'
  const ownerA = '22222222-0000-0000-0000-000000000002'
  const locA = (await setupClient.query(`SELECT id FROM public.locations WHERE org_id = '${orgA}' LIMIT 1`)).rows[0].id

  await setupClient.end()

  await t.test('2.1 Dua Backfill Organisasi yang Sama Berjalan Bersamaan (Concurrent Backfill)', async () => {
    // Siapkan 5 inventaris yang belum di-backfill
    const adminInitClient = await createClient(DB_NAME)
    for (let i = 1; i <= 5; i++) {
      await adminInitClient.query(`
        INSERT INTO public.inventories (org_id, location_id, nama_barang, kondisi, harga, tanggal_pembelian)
        VALUES ('${orgA}', '${locA}', 'Barang Konkuren ${i}', 'Baik', ${i * 100000}, '2026-04-01');
      `)
    }

    const expectedUnbackfilled = Number((await adminInitClient.query(`
      SELECT count(*) as count FROM public.inventories i
      WHERE i.org_id = '${orgA}' AND NOT EXISTS (SELECT 1 FROM public.assets a WHERE a.legacy_inventory_id = i.id);
    `)).rows[0].count)

    await adminInitClient.end()

    // Buka dua koneksi independen ke database
    const conn1 = await createClient(DB_NAME)
    const conn2 = await createClient(DB_NAME)

    await setClientAuth(conn1, { userId: adminA, role: 'authenticated' })
    await setClientAuth(conn2, { userId: ownerA, role: 'authenticated' })

    // Eksekusi backfill pada saat yang sama
    const [res1, res2] = await Promise.all([
      conn1.query(`SELECT * FROM public.backfill_inventories_to_assets('${orgA}');`),
      conn2.query(`SELECT * FROM public.backfill_inventories_to_assets('${orgA}');`),
    ])

    const totalInsertedAssets = Number(res1.rows[0].inserted_assets) + Number(res2.rows[0].inserted_assets)
    const totalInsertedComponents = Number(res1.rows[0].inserted_components) + Number(res2.rows[0].inserted_components)

    // Salah satu koneksi mendapatkan kunci baris organisasi dan memproses baris,
    // koneksi kedua menunggu kunci lalu mendapati 0 inventaris tersisa
    assert.equal(totalInsertedAssets, expectedUnbackfilled, `Total aset baru yang terbentuk dari dua panggilan konkuren harus persis ${expectedUnbackfilled}`)
    assert.equal(totalInsertedComponents, expectedUnbackfilled, `Total komponen asal yang terbentuk harus persis ${expectedUnbackfilled}`)

    // Verifikasi konsistensi fisik di database
    const verifClient = await createClient(DB_NAME)
    const countAssets = await verifClient.query(`
      SELECT count(*) as total FROM public.assets 
      WHERE nama_aset LIKE 'Barang Konkuren %';
    `)
    assert.equal(Number(countAssets.rows[0].total), 5, 'Tidak boleh ada aset duplikat')

    const countComponents = await verifClient.query(`
      SELECT count(*) as total FROM public.asset_components 
      WHERE nama_komponen LIKE 'Barang Konkuren %' AND is_origin_inventory = true;
    `)
    assert.equal(Number(countComponents.rows[0].total), 5, 'Setiap aset memiliki tepat 1 komponen asal')

    await conn1.end()
    await conn2.end()
    await verifClient.end()
  })

  await t.test('2.2 Dua Alokasi Bersamaan yang Totalnya Melampaui Nominal Pengeluaran (Over-allocation Race)', async () => {
    const adminInitClient = await createClient(DB_NAME)
    // Buat pengeluaran bernilai 1.000.000
    const expRes = await adminInitClient.query(`
      INSERT INTO public.expenses (org_id, location_id, tanggal_pengeluaran, kategori, nominal, keterangan)
      VALUES ('${orgA}', '${locA}', CURRENT_DATE, 'Peralatan', 1000000, 'Nota Pengeluaran Bersama')
      RETURNING id;
    `)
    const expId = expRes.rows[0].id

    // Buat 2 aset draf penerima alokasi
    const a1 = (await adminInitClient.query(`
      INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan)
      VALUES ('${orgA}', 'Aset Alokasi Bersamaan 1', 'elektronik_kantor', 'draft') RETURNING id;
    `)).rows[0].id
    const a2 = (await adminInitClient.query(`
      INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan)
      VALUES ('${orgA}', 'Aset Alokasi Bersamaan 2', 'elektronik_kantor', 'draft') RETURNING id;
    `)).rows[0].id
    await adminInitClient.end()

    // Buka dua koneksi independen
    const connA = await createClient(DB_NAME)
    const connB = await createClient(DB_NAME)

    await setClientAuth(connA, { userId: adminA, role: 'authenticated' })
    await setClientAuth(connB, { userId: ownerA, role: 'authenticated' })

    // Conn A mencoba mengalokasikan 600.000, Conn B bersamaan mencoba mengalokasikan 600.000 (total 1.2jt > 1jt)
    const taskA = connA.query(`
      INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, expense_id, allocated_cost)
      VALUES ('${orgA}', '${a1}', 'Komponen A', 'perolehan_baru', 800000, '${expId}', 600000);
    `).then(() => ({ success: true })).catch(err => ({ success: false, error: err.message }))

    const taskB = connB.query(`
      INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, expense_id, allocated_cost)
      VALUES ('${orgA}', '${a2}', 'Komponen B', 'perolehan_baru', 800000, '${expId}', 600000);
    `).then(() => ({ success: true })).catch(err => ({ success: false, error: err.message }))

    const [outA, outB] = await Promise.all([taskA, taskB])

    // Karena FOR UPDATE pada baris expenses, satu transaksi berhasil dan yang lain WAJIB gagal
    const successCount = (outA.success ? 1 : 0) + (outB.success ? 1 : 0)
    assert.equal(successCount, 1, 'Tepat satu transaksi alokasi harus berhasil, transaksi kedua harus ditolak')

    const failed = !outA.success ? outA : outB
    assert.ok(
      failed.error.includes('SIMKOS_OVERALLOCATED_EXPENSE'),
      'Transaksi yang kalah harus ditolak dengan kode SIMKOS_OVERALLOCATED_EXPENSE'
    )

    // Buktikan total alokasi akhir di database tetap konsisten dan tidak ada alokasi melebihi nominal
    const verifClient = await createClient(DB_NAME)
    const sumAlloc = await verifClient.query(`
      SELECT coalesce(sum(allocated_cost), 0) as total_allocated 
      FROM public.asset_components 
      WHERE expense_id = '${expId}';
    `)
    assert.equal(Number(sumAlloc.rows[0].total_allocated), 600000, 'Total alokasi tersimpan harus persis 600.000 (<= 1.000.000)')

    await connA.end()
    await connB.end()
    await verifClient.end()
  })

  await t.test('2.3 Perubahan Nominal Pengeluaran Bersamaan dengan Penambahan Alokasi (Expense Mutation vs Allocation)', async () => {
    const adminInitClient = await createClient(DB_NAME)
    // Pengeluaran nominal 1.000.000 dengan alokasi eksisting 400.000
    const expRes = await adminInitClient.query(`
      INSERT INTO public.expenses (org_id, location_id, tanggal_pengeluaran, kategori, nominal, keterangan)
      VALUES ('${orgA}', '${locA}', CURRENT_DATE, 'Renovasi', 1000000, 'Renovasi Bersama')
      RETURNING id;
    `)
    const expId = expRes.rows[0].id

    const assetRes = await adminInitClient.query(`
      INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan)
      VALUES ('${orgA}', 'Aset Uji Race Nominal', 'gedung', 'draft') RETURNING id;
    `)
    const assetId = assetRes.rows[0].id

    // Alokasi awal: 400.000
    await adminInitClient.query(`
      INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, expense_id, allocated_cost)
      VALUES ('${orgA}', '${assetId}', 'Komponen Awal', 'perolehan_baru', 500000, '${expId}', 400000);
    `)
    await adminInitClient.end()

    // Dua koneksi independen
    const conn1 = await createClient(DB_NAME)
    const conn2 = await createClient(DB_NAME)

    await setClientAuth(conn1, { userId: adminA, role: 'authenticated' })
    await setClientAuth(conn2, { userId: ownerA, role: 'authenticated' })

    // Sesi 1: Menurunkan nominal pengeluaran menjadi 500.000
    const taskReduceExpense = conn1.query(`
      UPDATE public.expenses SET nominal = 500000 WHERE id = '${expId}';
    `).then(() => ({ action: 'reduce', success: true })).catch(err => ({ action: 'reduce', success: false, error: err.message }))

    // Sesi 2: Bersamaan menambah alokasi baru 300.000 (total alokasi akan jadi 400k + 300k = 700k > 500k)
    const taskAddAllocation = conn2.query(`
      INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, expense_id, allocated_cost)
      VALUES ('${orgA}', '${assetId}', 'Komponen Baru Konkuren', 'perolehan_baru', 400000, '${expId}', 300000);
    `).then(() => ({ action: 'allocate', success: true })).catch(err => ({ action: 'allocate', success: false, error: err.message }))

    const [resReduce, resAllocate] = await Promise.all([taskReduceExpense, taskAddAllocation])

    // Serialisasi row lock memastikan kedua aksi tidak bisa saling memecahkan batas:
    // Jika reduce menang (500k) -> allocate ditolak (700k > 500k).
    // Jika allocate menang (700k) -> reduce ditolak (500k < 700k).
    const anyFailed = !resReduce.success || !resAllocate.success
    assert.ok(anyFailed, 'Salah satu operasi konkuren harus ditolak untuk mencegah pelanggaran integritas')

    // Verifikasi konsistensi akhir di database
    const verifClient = await createClient(DB_NAME)
    const finalExp = (await verifClient.query(`SELECT nominal FROM public.expenses WHERE id = '${expId}';`)).rows[0]
    const finalSum = (await verifClient.query(`SELECT coalesce(sum(allocated_cost), 0) as total FROM public.asset_components WHERE expense_id = '${expId}';`)).rows[0]

    assert.ok(
      Number(finalExp.nominal) >= Number(finalSum.total),
      `Integritas terjamin: Nominal (${finalExp.nominal}) harus >= Total Alokasi (${finalSum.total})`
    )

    await conn1.end()
    await conn2.end()
    await verifClient.end()
  })
})
