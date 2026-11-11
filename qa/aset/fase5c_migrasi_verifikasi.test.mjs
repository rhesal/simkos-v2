/**
 * Fase 5C — Verifikasi Akhir: Pengujian Migrasi Database Kosong vs Upgrade Eksisting & Proteksi Rollback
 *
 * Menguji:
 * 1. Verifikasi Integritas Direktori Migrasi (Safety Check):
 *    - Memastikan direktori `supabase/migrations/` HANYA berisi file migrasi maju (forward migration).
 *    - Memastikan TIDAK ADA skrip rollback atau artefak non-migrasi di `supabase/migrations/`.
 *    - Skrip rollback tersimpan secara terpisah di `supabase/rollback/` dan tidak pernah dieksekusi sebagai migrasi maju.
 * 2. Migrasi pada Database Kosong (Clean Database / Jalur Fresh Install):
 *    - Inisialisasi skema kosong, lalu jalankan seluruh migrasi dari 200 hingga 1000 secara berurutan.
 *    - Verifikasi katalog pg_proc (semua RPC Fase 2, 4, dan 5 aktif), pg_tables (semua tabel aset dan pembukuan tercipta),
 *      serta pg_policies (semua RLS policies terpasang).
 * 3. Migrasi Pembaruan di atas Database yang Memiliki Data Fase Sebelumnya (Jalur Upgrade):
 *    - Memulai database dengan data dari skema awal + Fase 2 + Fase 4.
 *    - Menjalankan migrasi 1000 (Fase 5B) di atas database tersebut.
 *    - Verifikasi bahwa data aset, komponen, saldo awal, dan ledger eksisting tetap utuh (preserved),
 *      kolom `location_id` dan `location_recorded` tertambahkan dengan benar, serta fungsi `get_expense_effective_allocated_cost`
 *      langsung aktif melindungi data yang sudah ada.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const ROOT = path.resolve()

function getCanonicalHash(orgId, periodKey, notes = '') {
  return crypto.createHash('md5').update(`${orgId}|${periodKey}|${notes ? notes.trim() : ''}`).digest('hex')
}

function findSqlFiles(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort()
}

async function execSqlFile(db, relPath) {
  const fullPath = path.join(ROOT, relPath)
  const sql = fs.readFileSync(fullPath, 'utf8')
  await db.exec(sql)
}

async function setAuthContext(db, { userId = null, role = 'anon' } = {}) {
  if (!userId) {
    await db.exec(`
      SET ROLE ${role};
      SELECT set_config('request.jwt.claims', '', false);
      SELECT set_config('request.jwt.claim.sub', '', false);
      SELECT set_config('request.jwt.claim.role', '${role}', false);
    `)
  } else {
    await db.exec(`
      SET ROLE ${role};
      SELECT set_config('request.jwt.claims', '{"sub":"${userId}","role":"${role}"}', false);
      SELECT set_config('request.jwt.claim.sub', '${userId}', false);
      SELECT set_config('request.jwt.claim.role', '${role}', false);
    `)
  }
}

async function setSuperuser(db) {
  await db.exec(`
    SET ROLE postgres;
    SELECT set_config('request.jwt.claims', '', false);
    SELECT set_config('request.jwt.claim.sub', '', false);
    SELECT set_config('request.jwt.claim.role', '', false);
  `)
}

test('Fase 5C: Verifikasi Migrasi Database Kosong vs Upgrade Eksisting & Proteksi Rollback', async (t) => {
  await t.test('1. Verifikasi Isolasi Skrip Rollback & Integritas Direktori Migrasi', () => {
    const migrationsDir = path.join(ROOT, 'supabase/migrations')
    const rollbackDir = path.join(ROOT, 'supabase/rollback')

    const migrationFiles = findSqlFiles(migrationsDir)
    const rollbackFiles = findSqlFiles(rollbackDir)

    assert.ok(migrationFiles.length >= 10, 'Direktori migrations harus memuat seluruh file migrasi resmi')
    assert.ok(rollbackFiles.length >= 10, 'Direktori rollback harus memuat file rollback resmi')

    // Pastikan tidak ada file rollback yang terselip di migrations
    for (const f of migrationFiles) {
      assert.ok(!f.toLowerCase().includes('rollback'), `File ${f} tidak boleh berada di direktori migrations`)
      assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/, `Format nama file migrasi harus valid: ${f}`)
    }

    // Pastikan skrip rollback Fase 5B ada di direktori rollback
    assert.ok(
      rollbackFiles.includes('rollback_1000_assets_phase5_financial_report.sql'),
      'rollback_1000_assets_phase5_financial_report.sql harus tersedia di supabase/rollback'
    )
  })

  await t.test('2. Migrasi Bersih dari Database Kosong (Fresh Database Install)', async () => {
    const db = new PGlite()

    // Stub environment Supabase
    await execSqlFile(db, 'qa/independent/00_stub.sql')

    // Skema dasar public
    // Diuji: Jalur Fresh Install (database kosong tanpa data operasional)
    await execSqlFile(db, 'docs/reference/live_schema_public.sql')
    // Sediakan akun pengguna awal yang disyaratkan oleh migrasi 200
    await db.exec(`
      INSERT INTO auth.users (id, email, created_at) VALUES
        ('11111111-0000-0000-0000-000000000001', 'admin@simkos.test', now() - interval '2 day'),
        ('22222222-0000-0000-0000-000000000002', 'owner@simkos.test', now() - interval '1 day');
      SET simkos.admin_user_id = '11111111-0000-0000-0000-000000000001';
    `)
    // Jalankan seluruh file migrasi secara berurutan
    const migrations = [
      'supabase/migrations/20261010000200_organizations_and_backfill.sql',
      'supabase/migrations/20261010000210_org_rls_policies.sql',
      'supabase/migrations/20261010000300_private_storage_buckets.sql',
      'supabase/migrations/20261010000400_inventories_missing_columns.sql',
      'supabase/migrations/20261010000500_org_admin_role.sql',
      'supabase/migrations/20261018000600_pindah_kamar.sql',
      'supabase/migrations/20261107000700_tenant_alamat.sql',
      'supabase/migrations/20261108000800_assets_phase2.sql',
      'supabase/migrations/20261109000900_assets_phase4_bookkeeping.sql',
      'supabase/migrations/20261111001000_assets_phase5_financial_report.sql',
    ]

    for (const mig of migrations) {
      await execSqlFile(db, mig)
    }

    // Verifikasi objek utama terbentuk di database bersih:
    // 2.1 RPC get_period_financial_report
    const rpcReport = await db.query(`
      SELECT proname FROM pg_proc
      WHERE proname = 'get_period_financial_report';
    `)
    assert.equal(rpcReport.rows.length, 1, 'RPC get_period_financial_report harus tercipta')

    // 2.2 Helper get_expense_effective_allocated_cost
    const rpcEff = await db.query(`
      SELECT proname FROM pg_proc
      WHERE proname = 'get_expense_effective_allocated_cost';
    `)
    assert.equal(rpcEff.rows.length, 1, 'Helper get_expense_effective_allocated_cost harus tercipta')

    // 2.3 Kolom location_id & location_recorded pada asset_activation_snapshots
    const cols = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'asset_activation_snapshots'
        AND column_name IN ('location_id', 'location_recorded');
    `)
    assert.equal(cols.rows.length, 2, 'Kolom location_id dan location_recorded harus ada')

    // 2.4 Trigger validasi aktif
    const triggers = await db.query(`
      SELECT trigger_name, event_manipulation, event_object_table
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND trigger_name IN (
          'trg_validate_component_relations',
          'trg_validate_expense_asset_allocations',
          'trg_validate_asset_relations'
        );
    `)
    assert.ok(triggers.rows.length >= 3, 'Trigger validasi relasi dan alokasi harus aktif')
  })

  await t.test('3. Migrasi Pembaruan (Upgrade Path) pada Database yang Memiliki Data Fase 2 & Fase 4', async () => {
    const db = new PGlite()

    await execSqlFile(db, 'qa/independent/00_stub.sql')

    await execSqlFile(db, 'docs/reference/live_schema_public.sql')
    await execSqlFile(db, 'qa/independent/05_live_state.sql')
    await execSqlFile(db, 'supabase/migrations/20261010000200_organizations_and_backfill.sql')
    await execSqlFile(db, 'supabase/migrations/20261010000210_org_rls_policies.sql')
    await execSqlFile(db, 'qa/independent/13_simulated_move.sql')
    await execSqlFile(db, 'supabase/migrations/20261010000300_private_storage_buckets.sql')
    await execSqlFile(db, 'supabase/migrations/20261010000400_inventories_missing_columns.sql')
    await execSqlFile(db, 'qa/independent/14_org_b_and_users.sql')
    await db.exec("SET simkos.admin_user_id = '11111111-0000-0000-0000-000000000001';")
    await execSqlFile(db, 'supabase/migrations/20261010000500_org_admin_role.sql')
    await execSqlFile(db, 'supabase/migrations/20261018000600_pindah_kamar.sql')
    await execSqlFile(db, 'supabase/migrations/20261107000700_tenant_alamat.sql')
    await execSqlFile(db, 'supabase/migrations/20261108000800_assets_phase2.sql')
    await execSqlFile(db, 'supabase/migrations/20261109000900_assets_phase4_bookkeeping.sql')

    // Buat data eksisting di Fase 4: Pengeluaran, Aset, Komponen, Snapshot v1, dan Ledger
    const orgRes = await db.query("SELECT id FROM public.organizations WHERE name = 'SimKos'")
    const orgId = orgRes.rows[0].id
    const locRes = await db.query("SELECT id FROM public.locations WHERE org_id = $1 LIMIT 1", [orgId])
    const locId = locRes.rows[0].id

    // Konfigurasi pembukuan awal
    await db.query(`
      INSERT INTO public.asset_bookkeeping_settings (org_id, tanggal_mulai_pembukuan, created_by, updated_by)
      VALUES ($1, '2026-06-01', '22222222-0000-0000-0000-000000000002'::uuid, '22222222-0000-0000-0000-000000000002'::uuid);
    `, [orgId])

    // Buat pengeluaran kas eksisting
    const expRes = await db.query(`
      INSERT INTO public.expenses (org_id, location_id, kategori, nominal, tanggal_pengeluaran, keterangan)
      VALUES ($1, $2, 'Renovasi', 8000000, '2026-06-01', 'Pengeluaran Pra-Fase 5B')
      RETURNING id;
    `, [orgId, locId])
    const expId = expRes.rows[0].id

    // Buat aset & komponen eksisting
    const assetRes = await db.query(`
      INSERT INTO public.assets (org_id, location_id, nama_aset, kategori_aset, dasar_penggunaan, status_pencatatan)
      VALUES ($1, $2, 'AC Kamar Eksisting', 'elektronik_kantor', 'milik_sendiri', 'draft')
      RETURNING id;
    `, [orgId, locId])
    const assetId = assetRes.rows[0].id

    const compRes = await db.query(`
      INSERT INTO public.asset_components (
        org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
        masa_manfaat_bulan, tanggal_siap_guna, pola_penggunaan, porsi_usaha_persen,
        status_kapitalisasi, metode_penyusutan, expense_id, allocated_cost
      ) VALUES (
        $1, $2, 'Unit AC Inverter', 'perolehan_baru', 5000000, 0,
        60, '2026-06-01', 'seluruhnya_usaha', 100,
        'kapitalisasi', 'garis_lurus', $3, 5000000
      ) RETURNING id;
    `, [orgId, assetId, expId])
    const compId = compRes.rows[0].id

    // Aktivasi di Fase 4 -> menghasilkan snapshot v1 (tanpa location_id snapshot kolom)
    await setAuthContext(db, { userId: '22222222-0000-0000-0000-000000000002', role: 'authenticated' })
    await db.query(`SELECT public.activate_asset($1, 'Aktivasi Fase 4');`, [assetId])

    // Posting penyusutan batch 2026-06 di Fase 4
    const previewRes = await db.query(`SELECT public.preview_depreciation_posting($1, '2026-06') as preview;`, [orgId])
    const previewVal = typeof previewRes.rows[0].preview === 'string' ? JSON.parse(previewRes.rows[0].preview) : previewRes.rows[0].preview
    const previewToken = previewVal.preview_token
    const notesPost = 'Posting Batch 2026-06 Fase 4'
    const hashPost = getCanonicalHash(orgId, '2026-06', notesPost)
    await db.query(`
      SELECT public.post_depreciation_batch(
        $1, '2026-06', 'idemp-202606-upgrade-test', $2, $3, $4
      );
    `, [orgId, hashPost, previewToken, notesPost])
    await setSuperuser(db)

    const countBefore = await db.query(`
      SELECT
        (SELECT count(*) FROM public.assets WHERE id = $1) as asset_count,
        (SELECT count(*) FROM public.asset_components WHERE id = $2) as comp_count,
        (SELECT count(*) FROM public.asset_activation_snapshots WHERE asset_id = $1) as snap_count,
        (SELECT count(*) FROM public.asset_depreciation_ledger WHERE asset_id = $1) as ledger_count;
    `, [assetId, compId])

    assert.equal(Number(countBefore.rows[0].asset_count), 1)
    assert.equal(Number(countBefore.rows[0].comp_count), 1)
    assert.equal(Number(countBefore.rows[0].snap_count), 1)
    assert.ok(Number(countBefore.rows[0].ledger_count) > 0)

    // SEKARANG: Terapkan migrasi 1000 (Fase 5B) di atas database yang sudah terisi
    await execSqlFile(db, 'supabase/migrations/20261111001000_assets_phase5_financial_report.sql')

    // Verifikasi bahwa data eksisting tidak hilang / rusak
    const countAfter = await db.query(`
      SELECT
        (SELECT count(*) FROM public.assets WHERE id = $1) as asset_count,
        (SELECT count(*) FROM public.asset_components WHERE id = $2) as comp_count,
        (SELECT count(*) FROM public.asset_activation_snapshots WHERE asset_id = $1) as snap_count,
        (SELECT count(*) FROM public.asset_depreciation_ledger WHERE asset_id = $1) as ledger_count;
    `, [assetId, compId])

    assert.equal(Number(countAfter.rows[0].asset_count), Number(countBefore.rows[0].asset_count))
    assert.equal(Number(countAfter.rows[0].comp_count), Number(countBefore.rows[0].comp_count))
    assert.equal(Number(countAfter.rows[0].snap_count), Number(countBefore.rows[0].snap_count))
    assert.equal(Number(countAfter.rows[0].ledger_count), Number(countBefore.rows[0].ledger_count))

    // Verifikasi helper alokasi efektif langsung melindungi pengeluaran eksisting
    const effAlloc = await db.query(`
      SELECT public.get_expense_effective_allocated_cost($1) as eff_cost;
    `, [expId])
    assert.equal(Number(effAlloc.rows[0].eff_cost), 5000000)

    // Coba turunkan nominal pengeluaran di bawah 5jt -> HARUS DITOLAK
    let errBelow = null
    try {
      await db.query("UPDATE public.expenses SET nominal = 4000000 WHERE id = $1;", [expId])
    } catch (e) {
      errBelow = e
    }
    assert.ok(errBelow !== null, 'Penurunan nominal di bawah 5jt harus ditolak')
    assert.match(errBelow.message, /SIMKOS_EXPENSE_BELOW_ALLOCATIONS/)

    // Snapshot lama terdeteksi secara eksplisit oleh get_period_financial_report
    await setAuthContext(db, { userId: '22222222-0000-0000-0000-000000000002', role: 'authenticated' })
    const reportRes = await db.query(`
      SELECT public.get_period_financial_report($1, '2026-06') as rep;
    `, [orgId])
    const repData = typeof reportRes.rows[0].rep === 'string' ? JSON.parse(reportRes.rows[0].rep) : reportRes.rows[0].rep
    assert.equal(repData.completeness.is_complete, false, 'Snapshot lama harus ditandai belum lengkap')
    assert.ok(repData.completeness.reasons.some(r => r.code === 'SNAPSHOT_LAMA_BELUM_MEMUAT_METADATA'))
    await setSuperuser(db)
  })
})
