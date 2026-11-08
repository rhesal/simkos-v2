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

// Helper: buat koneksi client baru dengan batas timeout ketat
async function createClient(dbName = 'qa_concurrency_test') {
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
  let orgA, adminA, ownerA, locA
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

    const orgARes = await setupClient.query("SELECT id FROM public.organizations WHERE name = 'SimKos'")
    orgA = orgARes.rows[0].id
    adminA = '11111111-0000-0000-0000-000000000001'
    ownerA = '22222222-0000-0000-0000-000000000002'
    locA = (await setupClient.query(`SELECT id FROM public.locations WHERE org_id = '${orgA}' LIMIT 1`)).rows[0].id
  } finally {
    await setupClient.end()
  }

  await t.test('2.1 Dua Backfill Organisasi yang Sama Berjalan Bersamaan (Concurrent Backfill)', async () => {
    let expectedUnbackfilled = 0
    const adminInitClient = await createClient(DB_NAME)
    try {
      // Siapkan 5 inventaris yang belum di-backfill
      for (let i = 1; i <= 5; i++) {
        await adminInitClient.query(`
          INSERT INTO public.inventories (org_id, location_id, nama_barang, kondisi, harga, tanggal_pembelian)
          VALUES ('${orgA}', '${locA}', 'Barang Konkuren ${i}', 'Baik', ${i * 100000}, '2026-04-01');
        `)
      }

      expectedUnbackfilled = Number((await adminInitClient.query(`
        SELECT count(*) as count FROM public.inventories i
        WHERE i.org_id = '${orgA}' AND NOT EXISTS (SELECT 1 FROM public.assets a WHERE a.legacy_inventory_id = i.id);
      `)).rows[0].count)
    } finally {
      await adminInitClient.end()
    }

    // Buka dua koneksi independen ke database dengan timeout dan penutupan via finally
    const conn1 = await createClient(DB_NAME)
    const conn2 = await createClient(DB_NAME)

    try {
      await setClientAuth(conn1, { userId: adminA, role: 'authenticated' })
      await setClientAuth(conn2, { userId: ownerA, role: 'authenticated' })

      // Koordinasi eksplisit transaksi antarkoneksi:
      // Conn 1 membuka transaksi eksplisit dan memanggil backfill (memegang FOR UPDATE lock pada organisasi).
      // Conn 2 secara bersamaan membuka transaksi eksplisit dan memanggil backfill.
      // Conn 1 menunda COMMIT selama 120ms sehingga Conn 2 terbukti bersaing (contention) dan tertahan pada lock.
      const task1 = (async () => {
        await conn1.query('BEGIN;')
        const res = await conn1.query(`SELECT * FROM public.backfill_inventories_to_assets('${orgA}');`)
        await new Promise(r => setTimeout(r, 120))
        await conn1.query('COMMIT;')
        return res.rows[0]
      })()

      // Tunggu 30ms agar Conn 1 telah mengeksekusi backfill dan memegang lock organisasi
      await new Promise(r => setTimeout(r, 30))

      const task2 = (async () => {
        await conn2.query('BEGIN;')
        // Ini akan menunggu (blocked) sampai Conn 1 melepaskan lock saat COMMIT
        const res = await conn2.query(`SELECT * FROM public.backfill_inventories_to_assets('${orgA}');`)
        await conn2.query('COMMIT;')
        return res.rows[0]
      })()

      const [res1, res2] = await Promise.all([task1, task2])

      const totalInsertedAssets = Number(res1.inserted_assets) + Number(res2.inserted_assets)
      const totalInsertedComponents = Number(res1.inserted_components) + Number(res2.inserted_components)

      // Conn 1 memproses seluruh inventaris yang belum di-backfill, Conn 2 mendapati 0 inventaris tersisa
      assert.equal(totalInsertedAssets, expectedUnbackfilled, `Total aset baru yang terbentuk harus persis ${expectedUnbackfilled}`)
      assert.equal(totalInsertedComponents, expectedUnbackfilled, `Total komponen asal yang terbentuk harus persis ${expectedUnbackfilled}`)
      assert.equal(Number(res2.inserted_assets), 0, 'Koneksi yang mengantre lock harus memperoleh 0 aset baru')
      assert.equal(Number(res2.inserted_components), 0, 'Koneksi yang mengantre lock harus memperoleh 0 komponen baru')

      // Verifikasi konsistensi fisik di database
      const verifClient = await createClient(DB_NAME)
      try {
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
      } finally {
        await verifClient.end()
      }
    } finally {
      await conn1.end()
      await conn2.end()
    }
  })

  await t.test('2.2 Dua Alokasi Bersamaan yang Totalnya Melampaui Nominal Pengeluaran (Over-allocation Race)', async () => {
    let expId, a1, a2
    const adminInitClient = await createClient(DB_NAME)
    try {
      // Buat pengeluaran bernilai 1.000.000
      const expRes = await adminInitClient.query(`
        INSERT INTO public.expenses (org_id, location_id, tanggal_pengeluaran, kategori, nominal, keterangan)
        VALUES ('${orgA}', '${locA}', CURRENT_DATE, 'Peralatan', 1000000, 'Nota Pengeluaran Bersama')
        RETURNING id;
      `)
      expId = expRes.rows[0].id

      // Buat 2 aset draf penerima alokasi
      a1 = (await adminInitClient.query(`
        INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan)
        VALUES ('${orgA}', 'Aset Alokasi Bersamaan 1', 'elektronik_kantor', 'draft') RETURNING id;
      `)).rows[0].id
      a2 = (await adminInitClient.query(`
        INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan)
        VALUES ('${orgA}', 'Aset Alokasi Bersamaan 2', 'elektronik_kantor', 'draft') RETURNING id;
      `)).rows[0].id
    } finally {
      await adminInitClient.end()
    }

    // Buka dua koneksi independen
    const connA = await createClient(DB_NAME)
    const connB = await createClient(DB_NAME)

    try {
      await setClientAuth(connA, { userId: adminA, role: 'authenticated' })
      await setClientAuth(connB, { userId: ownerA, role: 'authenticated' })

      // Koordinasi transaksi eksplisit antarkoneksi:
      // Conn A membuka transaksi eksplisit, memasukkan alokasi 600.000 (trigger memegang FOR UPDATE lock pada expenses)
      // Conn A menahan transaksi selama 120ms sebelum COMMIT.
      // Conn B membuka transaksi eksplisit dan mencoba memasukkan alokasi 600.000 (total 1.2M > 1M).
      // Conn B terblokir pada lock baris expenses sampai Conn A commit.
      const taskA = (async () => {
        await connA.query('BEGIN;')
        await connA.query(`
          INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, expense_id, allocated_cost)
          VALUES ('${orgA}', '${a1}', 'Komponen A', 'perolehan_baru', 800000, '${expId}', 600000);
        `)
        await new Promise(r => setTimeout(r, 120))
        await connA.query('COMMIT;')
        return { success: true }
      })().catch(async (err) => {
        try { await connA.query('ROLLBACK;') } catch {}
        return { success: false, error: err.message }
      })

      await new Promise(r => setTimeout(r, 30))

      const taskB = (async () => {
        await connB.query('BEGIN;')
        // Akan terblokir menunggu lock baris expenses yang dipegang Conn A
        await connB.query(`
          INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, expense_id, allocated_cost)
          VALUES ('${orgA}', '${a2}', 'Komponen B', 'perolehan_baru', 800000, '${expId}', 600000);
        `)
        await connB.query('COMMIT;')
        return { success: true }
      })().catch(async (err) => {
        try { await connB.query('ROLLBACK;') } catch {}
        return { success: false, error: err.message }
      })

      const [outA, outB] = await Promise.all([taskA, taskB])

      // Serialisasi row lock memastikan tepat satu transaksi berhasil dan transaksi kedua gagal
      const successCount = (outA.success ? 1 : 0) + (outB.success ? 1 : 0)
      assert.equal(successCount, 1, 'Tepat satu transaksi alokasi harus berhasil, transaksi kedua harus ditolak')

      const failed = !outA.success ? outA : outB
      assert.ok(
        failed.error.includes('SIMKOS_OVERALLOCATED_EXPENSE'),
        `Transaksi yang kalah harus ditolak dengan kode SIMKOS_OVERALLOCATED_EXPENSE (actual: ${failed.error})`
      )

      // Buktikan total alokasi akhir di database tetap konsisten dan tidak ada alokasi melebihi nominal
      const verifClient = await createClient(DB_NAME)
      try {
        const sumAlloc = await verifClient.query(`
          SELECT coalesce(sum(allocated_cost), 0) as total_allocated 
          FROM public.asset_components 
          WHERE expense_id = '${expId}';
        `)
        assert.equal(Number(sumAlloc.rows[0].total_allocated), 600000, 'Total alokasi tersimpan harus persis 600.000 (<= 1.000.000)')
      } finally {
        await verifClient.end()
      }
    } finally {
      await connA.end()
      await connB.end()
    }
  })

  await t.test('2.3 Perubahan Nominal Pengeluaran Bersamaan dengan Penambahan Alokasi (Expense Mutation vs Allocation)', async () => {
    let expId, assetId
    const adminInitClient = await createClient(DB_NAME)
    try {
      // Pengeluaran nominal 1.000.000 dengan alokasi eksisting 400.000
      const expRes = await adminInitClient.query(`
        INSERT INTO public.expenses (org_id, location_id, tanggal_pengeluaran, kategori, nominal, keterangan)
        VALUES ('${orgA}', '${locA}', CURRENT_DATE, 'Renovasi', 1000000, 'Renovasi Bersama')
        RETURNING id;
      `)
      expId = expRes.rows[0].id

      const assetRes = await adminInitClient.query(`
        INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan)
        VALUES ('${orgA}', 'Aset Uji Race Nominal', 'gedung', 'draft') RETURNING id;
      `)
      assetId = assetRes.rows[0].id

      // Alokasi awal: 400.000
      await adminInitClient.query(`
        INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, expense_id, allocated_cost)
        VALUES ('${orgA}', '${assetId}', 'Komponen Awal', 'perolehan_baru', 500000, '${expId}', 400000);
      `)
    } finally {
      await adminInitClient.end()
    }

    // Dua koneksi independen
    const conn1 = await createClient(DB_NAME)
    const conn2 = await createClient(DB_NAME)

    try {
      await setClientAuth(conn1, { userId: adminA, role: 'authenticated' })
      await setClientAuth(conn2, { userId: ownerA, role: 'authenticated' })

      // Koordinasi transaksi eksplisit antarkoneksi:
      // Sesi 1: Membuka transaksi eksplisit, menurunkan nominal pengeluaran menjadi 500.000 (mengunci baris expenses)
      // Sesi 1 menunda COMMIT selama 120ms.
      // Sesi 2: Membuka transaksi eksplisit, mencoba menambah alokasi baru 300.000 (total alokasi akan jadi 400k + 300k = 700k > 500k).
      // Sesi 2 terblokir menunggu lock dari Sesi 1.
      const taskReduceExpense = (async () => {
        await conn1.query('BEGIN;')
        await conn1.query(`UPDATE public.expenses SET nominal = 500000 WHERE id = '${expId}';`)
        await new Promise(r => setTimeout(r, 120))
        await conn1.query('COMMIT;')
        return { action: 'reduce', success: true }
      })().catch(async (err) => {
        try { await conn1.query('ROLLBACK;') } catch {}
        return { action: 'reduce', success: false, error: err.message }
      })

      await new Promise(r => setTimeout(r, 30))

      const taskAddAllocation = (async () => {
        await conn2.query('BEGIN;')
        // Terblokir pada lock baris expenses sampai Sesi 1 commit
        await conn2.query(`
          INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, expense_id, allocated_cost)
          VALUES ('${orgA}', '${assetId}', 'Komponen Baru Konkuren', 'perolehan_baru', 400000, '${expId}', 300000);
        `)
        await conn2.query('COMMIT;')
        return { action: 'allocate', success: true }
      })().catch(async (err) => {
        try { await conn2.query('ROLLBACK;') } catch {}
        return { action: 'allocate', success: false, error: err.message }
      })

      const [resReduce, resAllocate] = await Promise.all([taskReduceExpense, taskAddAllocation])

      // Verifikasi eksplisit sesuai instruksi:
      // Tepat satu transaksi berhasil dan tepat satu transaksi ditolak
      const successCount = (resReduce.success ? 1 : 0) + (resAllocate.success ? 1 : 0)
      const failCount = (!resReduce.success ? 1 : 0) + (!resAllocate.success ? 1 : 0)
      assert.equal(successCount, 1, 'Tepat satu transaksi harus berhasil')
      assert.equal(failCount, 1, 'Tepat satu transaksi harus ditolak')

      // Transaksi yang kalah ditolak dengan pesan kesalahan yang sesuai
      if (!resAllocate.success) {
        assert.ok(
          resAllocate.error.includes('SIMKOS_OVERALLOCATED_EXPENSE'),
          `Bila alokasi kalah, harus ditolak SIMKOS_OVERALLOCATED_EXPENSE (actual: ${resAllocate.error})`
        )
      } else {
        assert.ok(
          resReduce.error.includes('SIMKOS_EXPENSE_BELOW_ALLOCATIONS'),
          `Bila reduksi kalah, harus ditolak SIMKOS_EXPENSE_BELOW_ALLOCATIONS (actual: ${resReduce.error})`
        )
      }

      // Verifikasi konsistensi akhir di database
      const verifClient = await createClient(DB_NAME)
      try {
        const finalExp = (await verifClient.query(`SELECT nominal FROM public.expenses WHERE id = '${expId}';`)).rows[0]
        const finalSum = (await verifClient.query(`SELECT coalesce(sum(allocated_cost), 0) as total FROM public.asset_components WHERE expense_id = '${expId}';`)).rows[0]

        assert.ok(
          Number(finalExp.nominal) >= Number(finalSum.total),
          `Integritas terjamin: Nominal (${finalExp.nominal}) harus >= Total Alokasi (${finalSum.total})`
        )
        assert.equal(Number(finalExp.nominal), 500000, 'Nominal pengeluaran berhasil diperbarui menjadi 500.000')
        assert.equal(Number(finalSum.total), 400000, 'Total alokasi tetap 400.000 karena alokasi konkuren kedua digagalkan')
      } finally {
        await verifClient.end()
      }
    } finally {
      await conn1.end()
      await conn2.end()
    }
  })
})
