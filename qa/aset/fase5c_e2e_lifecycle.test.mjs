/**
 * Fase 5C — Verifikasi Akhir: Pengujian Alur Lengkap End-to-End Siklus Hidup Aset
 *
 * Menguji satu alur terpadu tanpa terputus:
 * 1. Inventaris Lama (inventories) -> Sinkronisasi ke draf aset (assets & asset_components)
 * 2. Lengkapi Komponen Finansial (alokasi beban/kapitalisasi, masa manfaat, lokasi)
 * 3. Aktivasi Aset (Snapshot v1 dengan location_id & location_recorded snapshot)
 * 4. Pengesahan Saldo Awal Historis (asset_opening_balances)
 * 5. Posting Batch Penyusutan Pertama (asset_depreciation_batches & ledger)
 * 6. Laporan Hasil Usaha Internal (get_period_financial_report lengkap & terekonsiliasi)
 * 7. Koreksi Parameter Komponen (revisi parameter -> butuh pengesahan ulang)
 * 8. Pembatalan Batch Terakhir (reverse_depreciation_batch / storno)
 * 9. Aktivasi Ulang Aset (Snapshot v2 dengan versi baru)
 * 10. Posting Ulang Pengganti (replaces_batch_id terhubung, ledger replacement)
 * 11. Verifikasi Konsistensi Laporan Pasca-Koreksi (laporan merefleksikan parameter baru secara konsisten)
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

function parseVal(val) {
  return typeof val === 'string' ? JSON.parse(val) : val
}

test('Fase 5C: Uji Alur Lengkap Siklus Hidup Aset (Inventaris -> Draf -> Aktivasi -> Saldo Awal -> Posting -> Laporan -> Koreksi -> Posting Ulang)', async (t) => {
  const db = new PGlite()

  // Setup rantai migrasi lengkap
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
  await execSqlFile(db, 'supabase/migrations/20261111001000_assets_phase5_financial_report.sql')

  const orgRes = await db.query("SELECT id FROM public.organizations WHERE name = 'SimKos'")
  const orgId = orgRes.rows[0].id
  const ownerId = '22222222-0000-0000-0000-000000000002'

  const locRes = await db.query("SELECT id FROM public.locations WHERE org_id = $1 LIMIT 1", [orgId])
  const locId = locRes.rows[0].id

  // 0. Konfigurasi Tanggal Mulai Pembukuan: 2026-06-01
  await setAuthContext(db, { userId: ownerId, role: 'authenticated' })
  await db.query(`SELECT public.set_bookkeeping_start_date($1, '2026-06-01'::date);`, [orgId])

  let inventoryId = null
  let assetId = null
  let componentId = null
  let expenseId = null
  let batch1Id = null
  let previewToken1 = null

  // --------------------------------------------------------------------------
  // Langkah 1: Buat Inventaris Lama & Sinkronkan ke Draf Aset
  // --------------------------------------------------------------------------
  await t.test('1. Inventaris Lama -> Sinkronisasi ke Draf Aset', async () => {
    // Buat data inventaris fisik lama
    const invRes = await db.query(`
      INSERT INTO public.inventories (
        org_id, location_id, nama_barang, kondisi, harga, tanggal_pembelian
      ) VALUES (
        $1, $2, 'Smart TV LG 43 Inch', 'Baik', 4500000, '2025-06-01'
      ) RETURNING id;
    `, [orgId, locId])
    inventoryId = invRes.rows[0].id

    // Jalankan sinkronisasi / backfill resmi
    const syncRes = await db.query(`SELECT * FROM public.backfill_inventories_to_assets($1);`, [orgId])
    assert.ok(Number(syncRes.rows[0].inserted_assets) >= 1, 'Draf aset baru harus tercipta dari inventaris')

    // Verifikasi aset berstatus draft dan terhubung ke legacy_inventory_id
    const assetRow = await db.query(`
      SELECT id, status_pencatatan, nama_aset, location_id
      FROM public.assets
      WHERE legacy_inventory_id = $1;
    `, [inventoryId])
    assert.equal(assetRow.rows.length, 1)
    assert.equal(assetRow.rows[0].status_pencatatan, 'draft')
    assetId = assetRow.rows[0].id

    // Verifikasi komponen asal terbentuk
    const compRow = await db.query(`
      SELECT id, biaya_perolehan, is_origin_inventory
      FROM public.asset_components
      WHERE asset_id = $1;
    `, [assetId])
    assert.equal(compRow.rows.length, 1)
    assert.equal(compRow.rows[0].is_origin_inventory, true)
    assert.equal(Number(compRow.rows[0].biaya_perolehan), 4500000)
    componentId = compRow.rows[0].id
  })

  // --------------------------------------------------------------------------
  // Langkah 2: Lengkapi Komponen Finansial & Tautkan Pengeluaran
  // --------------------------------------------------------------------------
  await t.test('2. Lengkapi Komponen Finansial (Alokasi Pengeluaran & Parameter Penyusutan)', async () => {
    // Buat pengeluaran kas yang mendanai perolehan TV ini
    const expRes = await db.query(`
      INSERT INTO public.expenses (
        org_id, location_id, nominal, kategori, tanggal_pengeluaran, keterangan
      ) VALUES (
        $1, $2, 4500000, 'Peralatan & Elektronik', '2025-06-01', 'Nota Pembelian Smart TV LG'
      ) RETURNING id;
    `, [orgId, locId])
    expenseId = expRes.rows[0].id

    // Update komponen finansial: kapitalisasi penuh, 60 bulan (5 tahun), tanggal siap guna 2025-06-01
    await db.query(`
      UPDATE public.asset_components
      SET
        expense_id = $1,
        allocated_cost = 4500000,
        biaya_perolehan = 4500000,
        nilai_sisa = 0,
        masa_manfaat_bulan = 60,
        tanggal_siap_guna = '2025-06-01',
        pola_penggunaan = 'seluruhnya_usaha',
        porsi_usaha_persen = 100,
        status_kapitalisasi = 'kapitalisasi',
        metode_penyusutan = 'garis_lurus'
      WHERE id = $2;
    `, [expenseId, componentId])

    const compCheck = await db.query(`SELECT allocated_cost, status_kapitalisasi FROM public.asset_components WHERE id = $1;`, [componentId])
    assert.equal(Number(compCheck.rows[0].allocated_cost), 4500000)
    assert.equal(compCheck.rows[0].status_kapitalisasi, 'kapitalisasi')
  })

  // --------------------------------------------------------------------------
  // Langkah 3: Aktivasi Aset (Penerbitan Snapshot v1)
  // --------------------------------------------------------------------------
  await t.test('3. Aktivasi Aset Resmi via activate_asset -> Snapshot v1 dengan Metadata Lokasi & Alokasi', async () => {
    const actRes = await db.query(`SELECT public.activate_asset($1, 'Aktivasi Awal Smart TV') as val;`, [assetId])
    const snap = parseVal(actRes.rows[0].val)
    assert.equal(snap.version, 1)
    assert.equal(snap.asset_id, assetId)

    // Periksa status aset di DB
    const aCheck = await db.query(`SELECT status_pencatatan FROM public.assets WHERE id = $1;`, [assetId])
    assert.equal(aCheck.rows[0].status_pencatatan, 'aktif')

    // Verifikasi kolom snapshot Fase 5B terisi
    const snapDb = await db.query(`
      SELECT version, location_id, location_recorded, snapshot_params
      FROM public.asset_activation_snapshots
      WHERE asset_id = $1 AND version = 1;
    `, [assetId])
    assert.equal(snapDb.rows.length, 1)
    assert.equal(snapDb.rows[0].location_id, locId, 'location_id snapshot harus tersimpan')
    assert.ok(snapDb.rows[0].location_recorded, 'location_recorded harus tercatat')
  })

  // --------------------------------------------------------------------------
  // Langkah 4: Pengesahan Saldo Awal Historis (Cut-off 2026-05-31)
  // --------------------------------------------------------------------------
  await t.test('4. Pengesahan Saldo Awal Historis (asset_opening_balances)', async () => {
    // Siap guna 2025-06-01, mulai pembukuan 2026-06-01 -> 12 bulan penyusutan historis
    // Biaya Rp4.500.000 / 60 bulan = Rp75.000/bln * 12 bln = Rp900.000 akumulasi penyusutan awal
    // Sisa masa manfaat = 48 bulan.
    const obRes = await db.query(`
      SELECT public.approve_component_opening_balance(
        $1,
        'catatan_terdahulu',
        900000,
        900000,
        48,
        'Saldo awal historis pembukuan mandiri pra-SimKos'
      ) as val;
    `, [componentId])
    const ob = parseVal(obRes.rows[0].val)
    assert.equal(Number(ob.akumulasi_penyusutan_awal), 900000)
    assert.equal(Number(ob.sisa_bobot_manfaat), 48)

    // Verifikasi pengaturan terkunci otomatis setelah ada saldo awal
    const settings = await db.query(`SELECT is_locked FROM public.asset_bookkeeping_settings WHERE org_id = $1;`, [orgId])
    assert.equal(settings.rows[0].is_locked, true)
  })

  // --------------------------------------------------------------------------
  // Langkah 5: Posting Batch Penyusutan Pertama (Periode 2026-06)
  // --------------------------------------------------------------------------
  await t.test('5. Pratinjau & Posting Batch Penyusutan Pertama (2026-06)', async () => {
    // 5.1 Preview
    const prevRes = await db.query(`SELECT public.preview_depreciation_posting($1, '2026-06') as val;`, [orgId])
    const prev = parseVal(prevRes.rows[0].val)
    assert.equal(prev.period_key, '2026-06')
    assert.equal(Number(prev.total_depreciation), 75000, 'Penyusutan per bulan TV: Rp3.600.000 / 48 bln = Rp75.000')
    assert.equal(Number(prev.total_business_portion), 75000)
    previewToken1 = prev.preview_token

    // 5.2 Post Batch 1
    const notes1 = 'Posting Batch Pertama Juni 2026'
    const hash1 = getCanonicalHash(orgId, '2026-06', notes1)
    const postRes = await db.query(`
      SELECT public.post_depreciation_batch(
        $1, '2026-06', 'idemp-flow-202606-v1', $2, $3, $4
      ) as val;
    `, [orgId, hash1, previewToken1, notes1])
    const batch1 = parseVal(postRes.rows[0].val)
    assert.equal(batch1.batch_status, 'posted')
    assert.equal(batch1.replaces_batch_id, null)
    assert.equal(Number(batch1.total_depreciation), 75000)
    batch1Id = batch1.id

    // Verifikasi ledger batch 1
    const ledger = await db.query(`
      SELECT entry_type, depreciation_amount, business_portion_amount
      FROM public.asset_depreciation_ledger
      WHERE batch_id = $1 AND component_id = $2;
    `, [batch1Id, componentId])
    assert.equal(ledger.rows.length, 1)
    assert.equal(ledger.rows[0].entry_type, 'regular')
    assert.equal(Number(ledger.rows[0].depreciation_amount), 75000)
  })

  // --------------------------------------------------------------------------
  // Langkah 6: Laporan Hasil Usaha Internal (Lengkap & Terekonsiliasi)
  // --------------------------------------------------------------------------
  await t.test('6. Verifikasi Laporan Hasil Usaha Internal Periode 2026-06 (Lengkap & Terekonsiliasi)', async () => {
    // Masukkan penerimaan sewa kamar di Juni 2026 untuk melihat laba operasional bersih
    // rentals 'a0000000-0000-0000-0000-000000000004' ada di 05_live_state.sql pada org SimKos
    await db.query(`
      INSERT INTO public.incomes (
        org_id, rental_id, nominal, kategori, tanggal_bayar, keterangan
      ) VALUES (
        $1, 'a0000000-0000-0000-0000-000000000004', 2000000, 'Sewa Kamar', '2026-06-05', 'Pembayaran Sewa Kamar A1'
      );
    `, [orgId])

    const repRes = await db.query(`SELECT public.get_period_financial_report($1, '2026-06') as rep;`, [orgId])
    const rep = parseVal(repRes.rows[0].rep)

    // Kelengkapan
    assert.equal(rep.completeness.is_complete, true, 'Laporan Juni 2026 harus lengkap')
    assert.equal(rep.completeness.depreciation_complete, true)
    assert.equal(rep.completeness.status_code, 'LENGKAP_DIBUKUKAN')

    // Beban penyusutan masuk ke laporan
    assert.equal(rep.income_statement.depreciation_business_portion, 75000)
    // Pendapatan kas = 2.000.000, Pengeluaran kas operasional = 0 (karena pengeluaran TV terjadi 2025-06 di luar periode)
    assert.equal(rep.income_statement.operating_cash_revenue, 2000000)
    // Laba usaha bersih = 2.000.000 - 0 - 75.000 = Rp1.925.000
    assert.equal(rep.income_statement.net_operating_income, 1925000)

    // Rekonsiliasi
    assert.equal(rep.reconciliation.is_reconciled, true)
    assert.equal(rep.reconciliation.equals_net_operating_income, 1925000)
  })

  // --------------------------------------------------------------------------
  // Langkah 7: Koreksi Parameter Komponen (Revisi Biaya Perolehan & Nilai Sisa)
  // --------------------------------------------------------------------------
  await t.test('7. Koreksi Parameter Komponen (Membutuhkan Pengesahan Ulang)', async () => {
    // Karena batch 2026-06 aktif mengunci komponen ini, revisi langsung wajib ditolak
    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.revise_component_parameters(
            $1, 4800000, 0, 60, '2025-06-01'::date, 100, 'garis_lurus', 'kapitalisasi', 'Revisi biaya ke 4.8jt'
          );
        `, [componentId])
      },
      /SIMKOS_POSTED_BATCH_EXISTS|SIMKOS_PERIOD_LOCKED/,
      'Revisi saat batch posting aktif harus ditolak untuk menjaga integritas'
    )
  })

  // --------------------------------------------------------------------------
  // Langkah 8: Pembatalan Batch Terakhir (Storno)
  // --------------------------------------------------------------------------
  await t.test('8. Pembatalan Batch Terakhir via reverse_depreciation_batch (Storno)', async () => {
    const revRes = await db.query(`
      SELECT public.reverse_depreciation_batch($1, 'Pembatalan untuk perbaikan parameter aset') as val;
    `, [batch1Id])
    const rev = parseVal(revRes.rows[0].val)
    assert.equal(rev.batch_status, 'reversed')

    // Verifikasi ledger storno tercipta
    const stornoLedger = await db.query(`
      SELECT entry_type, depreciation_amount
      FROM public.asset_depreciation_ledger
      WHERE component_id = $1 AND entry_type = 'reversal';
    `, [componentId])
    assert.equal(stornoLedger.rows.length, 1)
    assert.equal(Number(stornoLedger.rows[0].depreciation_amount), -75000)
  })

  // --------------------------------------------------------------------------
  // Langkah 9: Eksekusi Revisi & Pengesahan Ulang (Snapshot v2)
  // --------------------------------------------------------------------------
  await t.test('9. Eksekusi Revisi Parameter Komponen & Aktivasi Ulang (Snapshot v2)', async () => {
    // Tambah kapasitas pengeluaran kas terlebih dahulu
    await db.query(`UPDATE public.expenses SET nominal = 4800000 WHERE id = $1;`, [expenseId])

    // Revisi parameter komponen (biaya Rp4.800.000, alokasi Rp4.800.000)
    await db.query(`
      SELECT public.revise_component_parameters(
        $1, 4800000, 0, 60, '2025-06-01'::date, 100, 'garis_lurus', 'kapitalisasi', 'Koreksi nilai riil termasuk ongkos kirim & instalasi'
      );
    `, [componentId])

    // Komponen ditandai butuh pengesahan ulang
    const compCheck = await db.query(`SELECT requires_reapproval FROM public.asset_components WHERE id = $1;`, [componentId])
    assert.equal(compCheck.rows[0].requires_reapproval, true)

    // Posting baru dilarang selama butuh pengesahan ulang
    await assert.rejects(
      async () => {
        await db.query(`SELECT public.preview_depreciation_posting($1, '2026-06');`, [orgId])
      },
      /SIMKOS_REAPPROVAL_REQUIRED/,
      'Pratinjau diblokir saat aset membutuhkan pengesahan ulang'
    )

    // 1. Pengesahan ulang via activate_asset -> menerbitkan Snapshot v2
    const reactRes = await db.query(`SELECT public.activate_asset($1, 'Aktivasi Ulang Smart TV v2') as val;`, [assetId])
    const snap2 = parseVal(reactRes.rows[0].val)
    assert.equal(snap2.version, 2, 'Snapshot harus naik ke versi 2')
    assert.equal(Number(snap2.snapshot_params[0].biaya_perolehan), 4800000)

    // Flag requires_reapproval harus sudah terhapus
    const compClean = await db.query(`SELECT requires_reapproval FROM public.asset_components WHERE id = $1;`, [componentId])
    assert.equal(compClean.rows[0].requires_reapproval, false)

    // 2. Perbarui saldo awal historis agar selaras dengan biaya baru di snapshot v2 (Rp4.800.000 / 60 * 12 = Rp960.000, sisa Rp3.840.000)
    await db.query(`
      SELECT public.approve_component_opening_balance(
        $1, 'catatan_terdahulu', 960000, 960000, 48, 'Penyesuaian saldo awal pasca revisi biaya'
      );
    `, [componentId])
  })

  // --------------------------------------------------------------------------
  // Langkah 10: Posting Ulang Pengganti (Replacement Batch)
  // --------------------------------------------------------------------------
  await t.test('10. Posting Ulang Pengganti (Batch Pengganti yang Terhubung)', async () => {
    // Pratinjau baru: Beban per bulan baru = Rp3.840.000 / 48 = Rp80.000
    const prevRes2 = await db.query(`SELECT public.preview_depreciation_posting($1, '2026-06') as val;`, [orgId])
    const prev2 = parseVal(prevRes2.rows[0].val)
    assert.equal(Number(prev2.total_depreciation), 80000, 'Beban penyusutan baru harus Rp80.000/bln')

    const notes2 = 'Posting Pengganti Juni 2026 Pasca Koreksi'
    const hash2 = getCanonicalHash(orgId, '2026-06', notes2)
    const postRes2 = await db.query(`
      SELECT public.post_depreciation_batch(
        $1, '2026-06', 'idemp-flow-202606-v2', $2, $3, $4
      ) as val;
    `, [orgId, hash2, prev2.preview_token, notes2])
    const batch2 = parseVal(postRes2.rows[0].val)

    assert.equal(batch2.batch_status, 'posted')
    assert.equal(batch2.replaces_batch_id, batch1Id, 'Batch 2 harus menjadi pengganti resmi Batch 1')
    assert.equal(Number(batch2.total_depreciation), 80000)

    // Verifikasi ledger replacement
    const repLedger = await db.query(`
      SELECT entry_type, depreciation_amount
      FROM public.asset_depreciation_ledger
      WHERE batch_id = $1 AND component_id = $2;
    `, [batch2.id, componentId])
    assert.equal(repLedger.rows[0].entry_type, 'replacement')
    assert.equal(Number(repLedger.rows[0].depreciation_amount), 80000)
  })

  // --------------------------------------------------------------------------
  // Langkah 11: Verifikasi Konsistensi Laporan Pasca Koreksi
  // --------------------------------------------------------------------------
  await t.test('11. Verifikasi Konsistensi Laporan Hasil Usaha Pasca Koreksi & Posting Ulang', async () => {
    const repRes = await db.query(`SELECT public.get_period_financial_report($1, '2026-06') as rep;`, [orgId])
    const rep = parseVal(repRes.rows[0].rep)

    // Laporan harus lengkap
    assert.equal(rep.completeness.is_complete, true)
    assert.equal(rep.completeness.status_code, 'LENGKAP_DIBUKUKAN')

    // Beban penyusutan baru sebesar Rp80.000 (tidak ada duplikasi dari batch storno)
    assert.equal(rep.income_statement.depreciation_business_portion, 80000)

    // Laba usaha bersih: 2.000.000 - 80.000 = Rp1.920.000
    assert.equal(rep.income_statement.net_operating_income, 1920000)

    // Rekonsiliasi terekonsiliasi sempurna
    assert.equal(rep.reconciliation.is_reconciled, true)
    assert.equal(rep.reconciliation.equals_net_operating_income, 1920000)

    // Verifikasi total ledger bersih untuk Juni 2026: +75.000 (batch 1) - 75.000 (storno) + 80.000 (replacement) = +80.000
    const sumLedger = await db.query(`
      SELECT sum(depreciation_amount) as net_depreciation
      FROM public.asset_depreciation_ledger
      WHERE component_id = $1;
    `, [componentId])
    assert.equal(Number(sumLedger.rows[0].net_depreciation), 80000, 'Saldo penyusutan kumulatif ledger bersih harus tepat Rp80.000')
  })
})
