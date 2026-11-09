import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const ROOT = path.resolve()

function parseVal(val) {
  if (val === null || val === undefined) return val
  return typeof val === 'string' ? JSON.parse(val) : val
}

// Helper: load and execute SQL file
async function execSqlFile(db, relPath) {
  const fullPath = path.join(ROOT, relPath)
  const sql = fs.readFileSync(fullPath, 'utf8')
  await db.exec(sql)
}

// Helper: switch auth context
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

// Reset auth to superuser/service_role
async function setSuperuser(db) {
  await db.exec(`
    SET ROLE postgres;
    SELECT set_config('request.jwt.claims', '', false);
    SELECT set_config('request.jwt.claim.sub', '', false);
    SELECT set_config('request.jwt.claim.role', '', false);
  `)
}

// Helper init DB dengan rantai migrasi lengkap hingga 900
async function initFullDatabase() {
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

  const orgRes = await db.query("SELECT id FROM public.organizations WHERE name = 'SimKos'")
  const orgA = orgRes.rows[0].id
  const adminA = '11111111-0000-0000-0000-000000000001'
  const ownerA = '22222222-0000-0000-0000-000000000002'
  const staffA = '44444444-0000-0000-0000-000000000004'

  const orgB = 'b0000000-0000-0000-0000-00000000000b'
  const ownerB = '33333333-0000-0000-0000-000000000003'

  return { db, orgA, adminA, ownerA, staffA, orgB, ownerB }
}

test('Fase 4B-1: Uji Integrasi Database & Kontrak Pembukuan Penyusutan', async (t) => {
  const { db, orgA, adminA, ownerA, staffA, orgB, ownerB } = await initFullDatabase()

  // Ambil snapshot awal tabel expenses dan incomes
  const initExp = await db.query("SELECT * FROM public.expenses ORDER BY id ASC;")
  const initInc = await db.query("SELECT * FROM public.incomes ORDER BY id ASC;")

  // --------------------------------------------------------------------------
  // Uji 1: Verifikasi Skema & Constraint
  // --------------------------------------------------------------------------
  await t.test('1. Skema Tabel Pembukuan, Constraint, & RLS Terdaftar', async () => {
    const tableRes = await db.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN (
          'asset_bookkeeping_settings',
          'asset_activation_snapshots',
          'asset_opening_balances',
          'asset_accounting_periods',
          'asset_depreciation_batches',
          'asset_depreciation_ledger',
          'asset_accounting_audit_logs'
        );
    `)
    assert.equal(tableRes.rows.length, 7, 'Seluruh 7 tabel pembukuan harus terdaftar')

    const statusCheck = await db.query(`
      SELECT pg_get_constraintdef(c.oid) as def
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'assets' AND c.conname = 'assets_status_pencatatan_check';
    `)
    assert.ok(statusCheck.rows[0].def.includes("'aktif'"), "Constraint assets harus mendukung status 'aktif'")
  })

  // --------------------------------------------------------------------------
  // Uji 2: Pengaturan Tanggal Mulai Pembukuan & Kontrol Otorisasi
  // --------------------------------------------------------------------------
  await t.test('2. Pengaturan Tanggal Mulai Pembukuan: Hak Akses & Validasi', async () => {
    // 2.1 Staf ditolak
    await setAuthContext(db, { userId: staffA, role: 'authenticated' })
    await assert.rejects(
      async () => {
        await db.query("SELECT public.set_bookkeeping_start_date($1, '2027-01-01');", [orgA])
      },
      /SIMKOS_FORBIDDEN/,
      'Staf harus ditolak mengatur tanggal pembukuan'
    )

    // 2.2 Tanggal selain tanggal 1 ditolak
    await setAuthContext(db, { userId: ownerA, role: 'authenticated' })
    await assert.rejects(
      async () => {
        await db.query("SELECT public.set_bookkeeping_start_date($1, '2027-01-15');", [orgA])
      },
      /SIMKOS_INVALID_START_DATE/,
      'Tanggal mulai bukan tanggal 1 wajib ditolak'
    )

    // 2.3 Owner berhasil mengatur 2027-01-01
    const res = await db.query("SELECT public.set_bookkeeping_start_date($1, '2027-01-01') as val;", [orgA])
    const settings = parseVal(res.rows[0].val)
    assert.equal(settings.tanggal_mulai_pembukuan, '2027-01-01')
    assert.equal(settings.is_locked, false)

    // 2.4 Verifikasi audit log tercatat
    const auditRes = await db.query(
      "SELECT * FROM public.asset_accounting_audit_logs WHERE org_id = $1 AND event_type = 'start_date_configured';",
      [orgA]
    )
    assert.equal(auditRes.rows.length, 1, 'Audit log start_date_configured wajib tercatat')
  })

  // --------------------------------------------------------------------------
  // Uji 3: Kesetaraan Hasil Server dengan Kontrak Simulasi (Nominal Kecil, Dasar Nol, Prorata)
  // --------------------------------------------------------------------------
  await t.test('3. Kesetaraan Engine Server vs Kontrak Simulasi Fase 3-R', async () => {
    // 3.1 AC Rp6.5M, sisa Rp500k, dasar Rp6M, 60 bulan, siap guna 16 Juni 2024, porsi usaha 100%
    const resAC = await db.query(`
      SELECT * FROM public.calc_component_depreciation_schedule(
        6500000, 500000, 60, '2024-06-16', 100
      ) ORDER BY periode_idx ASC;
    `)
    assert.equal(resAC.rows.length, 61, 'AC siap guna 16 Juni harus memiliki 61 periode kalender (M+1)')
    assert.equal(resAC.rows[0].period_key, '2024-06')
    assert.equal(Number(resAC.rows[0].beban), 50000, 'Bulan 1 prorata 15/30 = 0.5 bulan = Rp50.000')
    assert.equal(Number(resAC.rows[1].beban), 100000, 'Bulan penuh = Rp100.000')
    assert.equal(resAC.rows[60].period_key, '2029-06')
    assert.equal(Number(resAC.rows[60].beban), 50000, 'Bulan ke-61 sisa fraksi = Rp50.000')
    assert.equal(Number(resAC.rows[60].akumulasi), 6000000, 'Total akumulasi tepat dasar penyusutan Rp6M')
    assert.equal(Number(resAC.rows[60].nilai_buku), 500000, 'Nilai buku akhir tepat Rp500.000 (nilai sisa)')

    // 3.2 Dasar Rp60 / 120 bulan porsi usaha 50%
    const res60 = await db.query(`
      SELECT * FROM public.calc_component_depreciation_schedule(
        60, 0, 120, '2024-01-01', 50
      ) ORDER BY periode_idx ASC;
    `)
    assert.equal(res60.rows.length, 120)
    assert.equal(Number(res60.rows[119].akumulasi), 60, 'Akumulasi total tepat Rp60')
    assert.equal(Number(res60.rows[119].akumulasi_usaha), 30, 'Akumulasi usaha tepat Rp30 (50%)')

    // 3.3 Dasar Rp120 / 120 bulan porsi usaha 50%
    const res120 = await db.query(`
      SELECT * FROM public.calc_component_depreciation_schedule(
        120, 0, 120, '2024-01-01', 50
      ) ORDER BY periode_idx ASC;
    `)
    assert.equal(res120.rows.length, 120)
    assert.equal(Number(res120.rows[119].akumulasi), 120, 'Akumulasi total tepat Rp120')
    assert.equal(Number(res120.rows[119].akumulasi_usaha), 60, 'Akumulasi usaha tepat Rp60 (50%)')

    // 3.4 Dasar Nol: Biaya Rp1.000.000 = Nilai Sisa Rp1.000.000
    const resZero = await db.query(`
      SELECT * FROM public.calc_component_depreciation_schedule(
        1000000, 1000000, 36, '2024-01-01', 100
      ) ORDER BY periode_idx ASC;
    `)
    assert.equal(resZero.rows.length, 36)
    assert.equal(Number(resZero.rows[0].beban), 0, 'Dasar nol: beban harus 0')
    assert.equal(Number(resZero.rows[0].beban_usaha), 0, 'Dasar nol: beban usaha harus 0')
    assert.equal(Number(resZero.rows[0].nilai_buku), 1000000, 'Nilai buku dasar nol tetap nilai sisa')
    assert.equal(Number(resZero.rows[35].akumulasi), 0, 'Akumulasi akhir dasar nol = 0')
  })

  // --------------------------------------------------------------------------
  // Uji 4: Aktivasi Aset & Pengesahan Saldo Awal (Historis vs Manual)
  // --------------------------------------------------------------------------
  let assetIdAC, compIdAC, assetIdGedung, compIdGedung
  await t.test('4. Aktivasi Aset & Pengesahan Saldo Awal Berversi', async () => {
    await setAuthContext(db, { userId: ownerA, role: 'authenticated' })

    // Buat aset AC (draft)
    const insAssetAC = await db.query(`
      INSERT INTO public.assets (org_id, nama_aset, kategori_aset, dasar_penggunaan, status_pencatatan)
      VALUES ($1, 'AC Daikin Kamar 01', 'elektronik_kantor', 'milik_sendiri', 'draft')
      RETURNING id;
    `, [orgA])
    assetIdAC = insAssetAC.rows[0].id

    // Komponen AC
    const insCompAC = await db.query(`
      INSERT INTO public.asset_components (
        asset_id, org_id, nama_komponen, biaya_perolehan, nilai_sisa, masa_manfaat_bulan,
        tanggal_siap_guna, porsi_usaha_persen, status_kapitalisasi, metode_penyusutan
      ) VALUES ($1, $2, 'Unit AC Daikin', 6000000, 0, 60, '2024-06-16', 100, 'kapitalisasi', 'garis_lurus')
      RETURNING id;
    `, [assetIdAC, orgA])
    compIdAC = insCompAC.rows[0].id

    // Aktivasi aset AC
    const actRes = await db.query("SELECT public.activate_asset($1, 'Aktivasi AC Kamar 01') as val;", [assetIdAC])
    const snapAC = parseVal(actRes.rows[0].val)
    assert.equal(snapAC.version, 1)
    assert.equal(snapAC.algorithm_version, 'v3.1-bresenham')

    // Sahkan Saldo Awal AC (Jalur Simulasi Historis per Cutoff 31 Des 2026)
    // 16 Juni 2024 s/d 31 Des 2026 = 31 periode (30.5 bulan = Rp3.050.000)
    const obResAC = await db.query(`
      SELECT public.approve_component_opening_balance(
        $1, 'simulasi_historis', null, null, null, 'Saldo awal simulasi historis'
      ) as val;
    `, [compIdAC])
    const obAC = parseVal(obResAC.rows[0].val)
    assert.equal(obAC.version, 1)
    assert.equal(obAC.status, 'approved')
    assert.equal(Number(obAC.akumulasi_penyusutan_awal), 3050000, 'Akumulasi awal periode ke-31 harus Rp3.050.000')
    assert.equal(Number(obAC.akumulasi_usaha_awal), 3050000)
    assert.equal(Number(obAC.nilai_buku_awal), 2950000)
    assert.equal(Number(obAC.sisa_dasar_penyusutan), 2950000)
    assert.equal(obAC.sisa_periode_kalender, 30, 'Sisa periode kalender Jan 2027-Jun 2029 harus tepat 30')

    // Buat aset Gedung Kos (Jalur Catatan Terdahulu / Manual)
    const insAssetGedung = await db.query(`
      INSERT INTO public.assets (org_id, nama_aset, kategori_aset, dasar_penggunaan, status_pencatatan)
      VALUES ($1, 'Gedung Kos Utama', 'gedung', 'milik_sendiri', 'draft')
      RETURNING id;
    `, [orgA])
    assetIdGedung = insAssetGedung.rows[0].id

    const insCompGedung = await db.query(`
      INSERT INTO public.asset_components (
        asset_id, org_id, nama_komponen, biaya_perolehan, nilai_sisa, masa_manfaat_bulan,
        tanggal_siap_guna, porsi_usaha_persen, status_kapitalisasi, metode_penyusutan
      ) VALUES ($1, $2, 'Struktur Bangunan', 600000000, 60000000, 240, '2015-01-01', 60, 'kapitalisasi', 'garis_lurus')
      RETURNING id;
    `, [assetIdGedung, orgA])
    compIdGedung = insCompGedung.rows[0].id

    await db.query("SELECT public.activate_asset($1, 'Aktivasi Gedung') as val;", [assetIdGedung])

    // Sahkan Saldo Awal Gedung secara Manual (Akumulasi Rp180.000.000, Usaha 60% = Rp108.000.000)
    const obResGedung = await db.query(`
      SELECT public.approve_component_opening_balance(
        $1, 'catatan_terdahulu', 180000000, 108000000, null, 'Laporan Keuangan Audit 2026'
      ) as val;
    `, [compIdGedung])
    const obGedung = parseVal(obResGedung.rows[0].val)
    assert.equal(Number(obGedung.nilai_buku_awal), 420000000)
    assert.equal(Number(obGedung.sisa_dasar_penyusutan), 360000000)
    assert.equal(Number(obGedung.sisa_target_usaha), 216000000)
    assert.equal(Number(obGedung.sisa_bobot_manfaat), 96, 'Sisa masa manfaat 240 - 144 = 96 bulan')
  })

  // --------------------------------------------------------------------------
  // Uji 5: Pratinjau Server, Idempotensi, & Stale Preview Guard
  // --------------------------------------------------------------------------
  let previewTokenJan2027
  await t.test('5. Pratinjau Server, Idempotensi, & Stale Preview Guard', async () => {
    await setAuthContext(db, { userId: ownerA, role: 'authenticated' })

    // 5.1 Pratinjau periode pertama 2027-01
    const prevRes = await db.query("SELECT public.preview_depreciation_posting($1, '2027-01') as val;", [orgA])
    const preview = parseVal(prevRes.rows[0].val)
    assert.equal(preview.period_key, '2027-01')
    assert.equal(preview.component_count, 2, '2 komponen eligible (AC + Gedung)')
    // Beban Jan 2027: AC Rp100.000 + Gedung (360jt/96 = 3.750.000) = Rp3.850.000
    assert.equal(Number(preview.total_depreciation), 3850000)
    assert.equal(Number(preview.total_business_portion), 2350000, 'AC 100k + Gedung 2.25M = 2.35M')
    assert.equal(Number(preview.total_non_business_portion), 1500000, 'Gedung non-usaha 1.5M')
    assert.ok(preview.preview_token.startsWith('pv_'), 'Preview token harus memiliki prefix pv_')
    previewTokenJan2027 = preview.preview_token

    // 5.2 Token kedaluwarsa jika parameter berubah diam-diam
    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.post_depreciation_batch(
            $1, '2027-01', 'idemp-01', 'hash-payload-1', 'pv_invalid_token', 'Posting Jan 2027'
          );
        `, [orgA])
      },
      /SIMKOS_STALE_PREVIEW/,
      'Token pratinjau tidak cocok wajib ditolak dengan SIMKOS_STALE_PREVIEW'
    )
  })

  // --------------------------------------------------------------------------
  // Uji 6: Siklus Lengkap: Posting → Pembatalan → Pengganti → Pembatalan ke-2 → Pengganti Berikutnya
  // --------------------------------------------------------------------------
  let batch1Id, batch2Id, batch3Id
  await t.test('6. Siklus Multi-Versi Reversal & Replacement (Posting -> Batal -> Ganti -> Batal -> Ganti)', async () => {
    await setAuthContext(db, { userId: ownerA, role: 'authenticated' })

    // 6.1 Posting Pertama (Batch 1)
    const post1Res = await db.query(`
      SELECT public.post_depreciation_batch(
        $1, '2027-01', 'idemp-202701-v1', 'payload-hash-v1', $2, 'Posting Pertama Januari'
      ) as val;
    `, [orgA, previewTokenJan2027])
    const batch1 = parseVal(post1Res.rows[0].val)
    batch1Id = batch1.id
    assert.equal(batch1.batch_status, 'posted')
    assert.equal(batch1.replaces_batch_id, null)
    assert.equal(Number(batch1.total_depreciation), 3850000)

    // Idempotensi: panggil ulang dengan payload sama mengembalikan batch1 tanpa error
    const idemRes = await db.query(`
      SELECT public.post_depreciation_batch(
        $1, '2027-01', 'idemp-202701-v1', 'payload-hash-v1', $2, 'Posting Ulang'
      ) as val;
    `, [orgA, previewTokenJan2027])
    const idemBatch = parseVal(idemRes.rows[0].val)
    assert.equal(idemBatch.id, batch1Id, 'Idempotency harus mengembalikan batch yang sama')

    // Idempotensi: kunci sama dengan payload berbeda ditolak keras
    await assert.rejects(
      async () => {
        await db.query(`
          SELECT public.post_depreciation_batch(
            $1, '2027-01', 'idemp-202701-v1', 'payload-hash-DIFFERENT', $2, 'Payload Beda'
          );
        `, [orgA, previewTokenJan2027])
      },
      /SIMKOS_IDEMPOTENCY_PAYLOAD_MISMATCH/,
      'Payload berbeda dengan kunci idempotensi sama harus ditolak'
    )

    // Verifikasi ledger batch 1 bertipe 'regular'
    const ledger1 = await db.query(
      "SELECT * FROM public.asset_depreciation_ledger WHERE batch_id = $1;",
      [batch1Id]
    )
    assert.equal(ledger1.rows.length, 2)
    assert.ok(ledger1.rows.every(r => r.entry_type === 'regular'))

    // 6.2 Pembatalan Pertama (Reversal Batch 1)
    const rev1Res = await db.query(`
      SELECT public.reverse_depreciation_batch($1, 'Salah alokasi biaya') as val;
    `, [batch1Id])
    const rev1 = parseVal(rev1Res.rows[0].val)
    assert.equal(rev1.batch_status, 'reversed')

    // Verifikasi ada baris storno reversal di ledger
    const ledgerRev1 = await db.query(
      "SELECT * FROM public.asset_depreciation_ledger WHERE batch_id = $1 AND entry_type = 'reversal';",
      [batch1Id]
    )
    assert.equal(ledgerRev1.rows.length, 2, 'Harus ada 2 baris storno pembalik')
    assert.ok(Number(ledgerRev1.rows[0].depreciation_amount) < 0, 'Nominal reversal harus negatif')

    // 6.3 Pengganti Pertama (Replacement Batch 2)
    const prevRes2 = await db.query("SELECT public.preview_depreciation_posting($1, '2027-01') as val;", [orgA])
    const prev2 = parseVal(prevRes2.rows[0].val)

    const post2Res = await db.query(`
      SELECT public.post_depreciation_batch(
        $1, '2027-01', 'idemp-202701-v2', 'payload-hash-v2', $2, 'Posting Pengganti 1'
      ) as val;
    `, [orgA, prev2.preview_token])
    const batch2 = parseVal(post2Res.rows[0].val)
    batch2Id = batch2.id
    assert.equal(batch2.batch_status, 'posted')
    assert.equal(batch2.replaces_batch_id, batch1Id, 'Batch 2 harus mereferensikan batch 1 sebagai pengganti')

    // Verifikasi ledger batch 2 bertipe 'replacement'
    const ledger2 = await db.query(
      "SELECT * FROM public.asset_depreciation_ledger WHERE batch_id = $1;",
      [batch2Id]
    )
    assert.equal(ledger2.rows.length, 2)
    assert.ok(ledger2.rows.every(r => r.entry_type === 'replacement'))

    // 6.4 Pembatalan Kedua (Reversal Batch 2)
    const rev2Res = await db.query(`
      SELECT public.reverse_depreciation_batch($1, 'Koreksi kedua') as val;
    `, [batch2Id])
    const rev2 = parseVal(rev2Res.rows[0].val)
    assert.equal(rev2.batch_status, 'reversed')

    // 6.5 Pengganti Berikutnya (Replacement Batch 3)
    const prevRes3 = await db.query("SELECT public.preview_depreciation_posting($1, '2027-01') as val;", [orgA])
    const prev3 = parseVal(prevRes3.rows[0].val)

    const post3Res = await db.query(`
      SELECT public.post_depreciation_batch(
        $1, '2027-01', 'idemp-202701-v3', 'payload-hash-v3', $2, 'Posting Pengganti 2'
      ) as val;
    `, [orgA, prev3.preview_token])
    const batch3 = parseVal(post3Res.rows[0].val)
    batch3Id = batch3.id
    assert.equal(batch3.batch_status, 'posted')
    assert.equal(batch3.replaces_batch_id, batch2Id, 'Batch 3 harus mereferensikan batch 2')

    // Verifikasi di DB ada 3 batch: 2 reversed, 1 posted
    const allBatches = await db.query(
      "SELECT id, batch_status, replaces_batch_id FROM public.asset_depreciation_batches WHERE org_id = $1 AND period_key = '2027-01' ORDER BY created_at ASC;",
      [orgA]
    )
    assert.equal(allBatches.rows.length, 3, 'Harus ada tepat 3 batch historis di tabel')
    assert.equal(allBatches.rows[0].batch_status, 'reversed')
    assert.equal(allBatches.rows[1].batch_status, 'reversed')
    assert.equal(allBatches.rows[2].batch_status, 'posted')
  })

  // --------------------------------------------------------------------------
  // Uji 7: Koreksi Saldo Awal Setelah Seluruh Posting Efektif Dibatalkan
  // --------------------------------------------------------------------------
  await t.test('7. Koreksi Saldo Awal Pasca-Unwind Posting Efektif', async () => {
    await setAuthContext(db, { userId: ownerA, role: 'authenticated' })

    // 7.1 Saat Batch 3 masih 'posted', pembatalan saldo awal DITOLAK
    await assert.rejects(
      async () => {
        await db.query("SELECT public.cancel_component_opening_balance($1, 'Ingin revisi');", [compIdAC])
      },
      /SIMKOS_POSTED_BATCH_EXISTS/,
      'Pembatalan saldo awal wajib ditolak jika masih ada batch aktif'
    )

    // 7.2 Batalkan Batch 3 (sekarang 0 batch aktif)
    await db.query("SELECT public.reverse_depreciation_batch($1, 'Membatalkan seluruh batch aktif');", [batch3Id])

    // 7.3 Sekarang pembatalan saldo awal AC berhasil
    const cancelRes = await db.query("SELECT public.cancel_component_opening_balance($1, 'Angka historis salah');", [compIdAC])
    assert.ok(cancelRes.rows.length > 0, 'Saldo awal berhasil dibatalkan')

    // 7.4 Sahkan Saldo Awal AC Versi Baru (Versi 2)
    const newObRes = await db.query(`
      SELECT public.approve_component_opening_balance(
        $1, 'simulasi_historis', null, null, null, 'Saldo awal koreksi versi 2'
      ) as val;
    `, [compIdAC])
    const newOB = parseVal(newObRes.rows[0].val)
    assert.equal(newOB.version, 2, 'Saldo awal baru harus versi 2')
    assert.equal(newOB.status, 'approved')

    // Verifikasi di DB ada 2 entri saldo awal untuk komponen AC: 1 cancelled, 1 approved
    const obHistory = await db.query(
      "SELECT version, status FROM public.asset_opening_balances WHERE component_id = $1 ORDER BY version ASC;",
      [compIdAC]
    )
    assert.equal(obHistory.rows.length, 2)
    assert.equal(obHistory.rows[0].status, 'cancelled')
    assert.equal(obHistory.rows[1].status, 'approved')

    // 7.5 Posting ulang periode 2027-01 dengan saldo awal baru
    const prevRes4 = await db.query("SELECT public.preview_depreciation_posting($1, '2027-01') as val;", [orgA])
    const prev4 = parseVal(prevRes4.rows[0].val)
    const post4Res = await db.query(`
      SELECT public.post_depreciation_batch(
        $1, '2027-01', 'idemp-202701-v4', 'payload-hash-v4', $2, 'Posting Ulang dengan Saldo Baru'
      ) as val;
    `, [orgA, prev4.preview_token])
    const batch4 = parseVal(post4Res.rows[0].val)
    assert.equal(batch4.batch_status, 'posted')
  })

  // --------------------------------------------------------------------------
  // Uji 8: Penambahan Komponen Terlambat dengan Tanggal Siap Guna Asli Tetap Utuh
  // --------------------------------------------------------------------------
  await t.test('8. Penambahan Komponen Terlambat: Tanggal Siap Guna Asli Tetap Utuh', async () => {
    await setAuthContext(db, { userId: ownerA, role: 'authenticated' })

    // Post periode 2027-02
    const prevFeb = await db.query("SELECT public.preview_depreciation_posting($1, '2027-02') as val;", [orgA])
    const pFeb = parseVal(prevFeb.rows[0].val)
    await db.query(`
      SELECT public.post_depreciation_batch($1, '2027-02', 'idemp-202702', 'hash-feb', $2, 'Batch Feb');
    `, [orgA, pFeb.preview_token])

    // Buat komponen terlambat: siap guna '2027-01-15' (di masa lalu), tapi baru didaftarkan sekarang
    const insLateComp = await db.query(`
      INSERT INTO public.asset_components (
        asset_id, org_id, nama_komponen, biaya_perolehan, nilai_sisa, masa_manfaat_bulan,
        tanggal_siap_guna, porsi_usaha_persen, status_kapitalisasi, metode_penyusutan
      ) VALUES ($1, $2, 'Dispenser Terlambat', 1200000, 0, 12, '2027-01-15', 100, 'kapitalisasi', 'garis_lurus')
      RETURNING id, tanggal_siap_guna;
    `, [assetIdAC, orgA])
    const lateCompId = insLateComp.rows[0].id
    const origDate = insLateComp.rows[0].tanggal_siap_guna
    const origDateStr = origDate instanceof Date ? origDate.toISOString().slice(0, 10) : String(origDate)

    // Tanggal siap guna asli wajib tetap 2027-01-15
    assert.equal(origDateStr, '2027-01-15', 'Tanggal siap guna asli harus tetap 2027-01-15')

    // Buat snapshot aktivasi baru aset AC
    await db.query("SELECT public.activate_asset($1, 'Snapshot komponen terlambat');", [assetIdAC])

    // Cek master komponen: tanggal siap guna di master komponen TIDAK BOLEH BERUBAH
    const compCheck = await db.query("SELECT tanggal_siap_guna FROM public.asset_components WHERE id = $1;", [lateCompId])
    const checkedDate = compCheck.rows[0].tanggal_siap_guna
    const checkedDateStr = checkedDate instanceof Date ? checkedDate.toISOString().slice(0, 10) : String(checkedDate)
    assert.equal(checkedDateStr, '2027-01-15', 'Tanggal siap guna master komponen dilarang diubah paksa')

    // Pratinjau periode 2027-03: komponen terlambat mulai dievaluasi jadwalnya untuk periode 2027-03
    const prevMar = await db.query("SELECT public.preview_depreciation_posting($1, '2027-03') as val;", [orgA])
    const pMar = parseVal(prevMar.rows[0].val)
    assert.ok(pMar.eligible_components.some(c => c.component_id === lateCompId), 'Komponen terlambat eligible pada periode 2027-03')
  })

  // --------------------------------------------------------------------------
  // Uji 9: Penguncian Periode & Pembatalan Non-Kronologis
  // --------------------------------------------------------------------------
  await t.test('9. Penguncian Periode & Penolakan Reversal Non-Kronologis', async () => {
    await setAuthContext(db, { userId: ownerA, role: 'authenticated' })

    // Cari batch posting aktif terakhir (Feb 2027) dan yang sebelumnya (Jan 2027)
    const batches = await db.query(
      "SELECT id, period_key FROM public.asset_depreciation_batches WHERE org_id = $1 AND batch_status = 'posted' ORDER BY period_key ASC;",
      [orgA]
    )
    const batchJan = batches.rows[0]
    const batchFeb = batches.rows[1]

    // 9.1 Coba batalkan batch Jan saat batch Feb masih aktif -> WAJIB DITOLAK
    await assert.rejects(
      async () => {
        await db.query("SELECT public.reverse_depreciation_batch($1, 'Coba lompat');", [batchJan.id])
      },
      /SIMKOS_NON_CHRONOLOGICAL_REVERSAL/,
      'Pembatalan periode bukan terakhir wajib ditolak dengan SIMKOS_NON_CHRONOLOGICAL_REVERSAL'
    )

    // 9.2 Kunci periode Feb 2027
    await db.query("SELECT public.lock_accounting_period($1, '2027-02');", [orgA])

    // 9.3 Reversal pada periode terkunci -> WAJIB DITOLAK
    await assert.rejects(
      async () => {
        await db.query("SELECT public.reverse_depreciation_batch($1, 'Coba batalkan saat terkunci');", [batchFeb.id])
      },
      /SIMKOS_PERIOD_LOCKED/,
      'Aksi reversal pada periode terkunci wajib ditolak dengan SIMKOS_PERIOD_LOCKED'
    )

    // 9.4 Buka kunci periode Feb 2027
    await db.query("SELECT public.unlock_accounting_period($1, '2027-02', 'Buka kunci untuk audit tahunan');", [orgA])

    // 9.5 Setelah dibuka, pembatalan batch Feb berhasil
    const revFebRes = await db.query("SELECT public.reverse_depreciation_batch($1, 'Batal Feb');", [batchFeb.id])
    assert.ok(revFebRes.rows.length > 0)
  })

  // --------------------------------------------------------------------------
  // Uji 10: Isolasi Multi-Tenant & Penolakan Akses Lintas Organisasi
  // --------------------------------------------------------------------------
  await t.test('10. Penolakan Akses Lintas Organisasi (Tenant Isolation)', async () => {
    // Owner B mencoba memposting atau membatalkan batch Org A -> WAJIB DITOLAK
    await setAuthContext(db, { userId: ownerB, role: 'authenticated' })

    await assert.rejects(
      async () => {
        await db.query("SELECT public.preview_depreciation_posting($1, '2027-03');", [orgA])
      },
      /SIMKOS_FORBIDDEN/,
      'Owner Org B dilarang membuat pratinjau Org A'
    )

    await assert.rejects(
      async () => {
        await db.query("SELECT public.set_bookkeeping_start_date($1, '2027-01-01');", [orgA])
      },
      /SIMKOS_FORBIDDEN/,
      'Owner Org B dilarang mengubah konfigurasi Org A'
    )
  })

  // --------------------------------------------------------------------------
  // Uji 11: Perlindungan Integritas Kas (0 Perubahan pada expenses & incomes)
  // --------------------------------------------------------------------------
  await t.test('11. Transaksi Kas Murni Tidak Terdampak (Zero Impact to Expenses/Incomes)', async () => {
    await setSuperuser(db)
    const finalExp = await db.query("SELECT * FROM public.expenses ORDER BY id ASC;")
    const finalInc = await db.query("SELECT * FROM public.incomes ORDER BY id ASC;")

    // Verifikasi jumlah baris expenses dan incomes persis sama dengan snapshot awal
    assert.equal(finalExp.rows.length, initExp.rows.length, 'Jumlah baris expenses tidak boleh berubah')
    assert.equal(finalInc.rows.length, initInc.rows.length, 'Jumlah baris incomes tidak boleh berubah')
    assert.deepEqual(finalExp.rows, initExp.rows, 'Seluruh baris expenses identik 100%')
    assert.deepEqual(finalInc.rows, initInc.rows, 'Seluruh baris incomes identik 100%')
  })

  // --------------------------------------------------------------------------
  // Uji 12: Kebijakan Penghapusan Organisasi (ON DELETE RESTRICT)
  // --------------------------------------------------------------------------
  await t.test('12. Perlindungan Riwayat: Penghapusan Organisasi Ditolak Keras (ON DELETE RESTRICT)', async () => {
    await setSuperuser(db)

    // Coba hapus Org A yang telah memiliki riwayat pembukuan resmi
    await assert.rejects(
      async () => {
        await db.query("DELETE FROM public.organizations WHERE id = $1;", [orgA])
      },
      /violates.*foreign key constraint/,
      'Penghapusan organisasi yang memiliki riwayat pembukuan wajib ditolak foreign key restrict'
    )
  })
})
