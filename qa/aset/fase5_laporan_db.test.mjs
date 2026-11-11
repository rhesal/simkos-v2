/**
 * Fase 5B — Database Integration Tests untuk Laporan Keuangan Internal Terintegrasi
 *
 * Menguji RPC get_period_financial_report, snapshot lokasi/alokasi, preservasi nilai
 * referensi selama perlu_pengesahan_ulang (Tahap 3 tanpa hitung ganda), perpindahan
 * expense_id lintas periode, penanganan snapshot lama tanpa metadata, siklus multi-storno,
 * perbedaan ketiadaan batch (null) vs batch nol / lokasi tanpa ledger (0), ON DELETE RESTRICT,
 * dan batas penguncian periode penyusutan.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../..')

const ORG_A_ID = '11111111-1111-1111-1111-111111111111'
const OWNER_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const LOC_MELATI_ID = 'aaaaaaaa-1111-1111-1111-111111111111'
const LOC_MAWAR_ID = 'aaaaaaaa-2222-2222-2222-222222222222'
const ROOM_MELATI_01 = 'bbbbbbbb-1111-1111-1111-111111111111'
const ROOM_MELATI_02 = 'bbbbbbbb-2222-2222-2222-222222222222'
const TENANT_01 = 'cccccccc-1111-1111-1111-111111111111'
const TENANT_02 = 'cccccccc-2222-2222-2222-222222222222'
const RENTAL_01 = 'dddddddd-1111-1111-1111-111111111111'
const RENTAL_02 = 'dddddddd-2222-2222-2222-222222222222'

async function execSqlFile(db, relPath) {
  const fullPath = path.join(rootDir, relPath)
  const sql = fs.readFileSync(fullPath, 'utf8')
  await db.exec(sql)
}

let sharedDb = null

async function createPhase5Database() {
  if (!sharedDb) {
    sharedDb = new PGlite()

    await execSqlFile(sharedDb, 'qa/independent/00_stub.sql')
    await execSqlFile(sharedDb, 'docs/reference/live_schema_public.sql')
    await execSqlFile(sharedDb, 'qa/independent/05_live_state.sql')
    await execSqlFile(sharedDb, 'supabase/migrations/20261010000200_organizations_and_backfill.sql')
    await execSqlFile(sharedDb, 'supabase/migrations/20261010000210_org_rls_policies.sql')
    await execSqlFile(sharedDb, 'qa/independent/13_simulated_move.sql')
    await execSqlFile(sharedDb, 'supabase/migrations/20261010000300_private_storage_buckets.sql')
    await execSqlFile(sharedDb, 'supabase/migrations/20261010000400_inventories_missing_columns.sql')
    await execSqlFile(sharedDb, 'qa/independent/14_org_b_and_users.sql')

    await sharedDb.exec("SET simkos.admin_user_id = '11111111-0000-0000-0000-000000000001';")
    await execSqlFile(sharedDb, 'supabase/migrations/20261010000500_org_admin_role.sql')
    await execSqlFile(sharedDb, 'supabase/migrations/20261018000600_pindah_kamar.sql')
    await execSqlFile(sharedDb, 'supabase/migrations/20261107000700_tenant_alamat.sql')
    await execSqlFile(sharedDb, 'supabase/migrations/20261108000800_assets_phase2.sql')
    await execSqlFile(sharedDb, 'supabase/migrations/20261109000900_assets_phase4_bookkeeping.sql')
    await execSqlFile(sharedDb, 'supabase/migrations/20261111001000_assets_phase5_financial_report.sql')

    await sharedDb.exec(`
      INSERT INTO auth.users (id, email)
      VALUES ('${OWNER_A_ID}', 'owner.fase5@simkos.test')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.organizations (id, name)
      VALUES ('${ORG_A_ID}', 'SimKos Melati Mawar');

      INSERT INTO public.organization_members (org_id, user_id, role)
      VALUES ('${ORG_A_ID}', '${OWNER_A_ID}', 'owner');

      INSERT INTO public.locations (id, org_id, nama_lokasi) VALUES
        ('${LOC_MELATI_ID}', '${ORG_A_ID}', 'Kos Melati'),
        ('${LOC_MAWAR_ID}', '${ORG_A_ID}', 'Kos Mawar');

      INSERT INTO public.rooms (id, org_id, location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar) VALUES
        ('${ROOM_MELATI_01}', '${ORG_A_ID}', '${LOC_MELATI_ID}', '01', 100000, 2000000, 'Terisi'),
        ('${ROOM_MELATI_02}', '${ORG_A_ID}', '${LOC_MELATI_ID}', '02', 120000, 2500000, 'Terisi');

      INSERT INTO public.tenants (id, org_id, nama_lengkap) VALUES
        ('${TENANT_01}', '${ORG_A_ID}', 'Budi Santoso'),
        ('${TENANT_02}', '${ORG_A_ID}', 'Andi Wijaya');

      INSERT INTO public.rentals (id, org_id, room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo, status_aktif) VALUES
        ('${RENTAL_01}', '${ORG_A_ID}', '${ROOM_MELATI_01}', '${TENANT_01}', 'Bulanan', '2026-01-01', '2026-07-01', true),
        ('${RENTAL_02}', '${ORG_A_ID}', '${ROOM_MELATI_02}', '${TENANT_02}', 'Bulanan', '2026-01-01', '2026-07-01', true);
    `)
  }

  // Bersihkan data transaksi & aset ORG_A_ID secara bersih menggunakan TRUNCATE
  await sharedDb.exec(`
    TRUNCATE TABLE
      public.asset_depreciation_ledger,
      public.asset_depreciation_batches,
      public.asset_accounting_periods,
      public.asset_opening_balances,
      public.asset_activation_snapshots,
      public.asset_accounting_audit_logs,
      public.asset_bookkeeping_settings,
      public.asset_components,
      public.assets,
      public.incomes,
      public.expenses
    CASCADE;

    SELECT set_config('request.jwt.claims', '{"sub":"${OWNER_A_ID}","role":"authenticated"}', false);
    SELECT set_config('request.jwt.claim.sub', '${OWNER_A_ID}', false);
    SELECT set_config('request.jwt.claim.role', 'authenticated', false);
  `)

  return sharedDb
}

async function postPeriodHelper(db, orgId, periodKey, idempKey, notes = 'Posting penyusutan') {
  const prevRes = await db.query(
    `SELECT public.preview_depreciation_posting($1::uuid, $2::text) AS preview`,
    [orgId, periodKey]
  )
  const preview = prevRes.rows[0].preview
  const hashRes = await db.query(
    `SELECT md5($1::text || '|' || $2::text || '|' || coalesce(trim($3::text), '')) AS h`,
    [orgId, periodKey, notes]
  )
  const payloadHash = hashRes.rows[0].h
  const postRes = await db.query(
    `SELECT public.post_depreciation_batch($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text) AS batch`,
    [orgId, periodKey, idempKey, payloadHash, preview.preview_token, notes]
  )
  return postRes.rows[0].batch
}

test('1. Rekonsiliasi Lengkap Tahap 1 s/d Tahap 4 (Preservasi Referensi Tahap 3, Lokasi Snapshot, Lokasi Tanpa Ledger Rp0, & Biaya Bersama)', async () => {
  const db = await createPhase5Database()

  // Atur tanggal mulai pembukuan = 2026-06-01
  await db.query(`SELECT public.set_bookkeeping_start_date($1::uuid, '2026-06-01'::date)`, [ORG_A_ID])

  // 1. Masukkan Penerimaan Kas (incomes) Juni 2026 di Kos Melati (Lokasi 1) = Rp 4.500.000
  await db.exec(`
    INSERT INTO public.incomes (org_id, rental_id, tanggal_bayar, nominal, keterangan) VALUES
      ('${ORG_A_ID}', '${RENTAL_01}', '2026-06-05', 2000000, 'Sewa Kamar 01 Juni'),
      ('${ORG_A_ID}', '${RENTAL_02}', '2026-06-10', 2500000, 'Sewa Kamar 02 Juni');
  `)

  // 2. Masukkan Pengeluaran Kas (expenses) Juni 2026:
  //    Lokasi 1 (Kos Melati) = E1 (800rb) + E2 (3jt) + E3 (5,5jt) + E4 (1,2jt) = Rp 10.500.000
  //    Bersama (location_id NULL) = E5 (500rb)
  const E1_ID = 'eeeeeeee-1111-1111-1111-111111111111'
  const E2_ID = 'eeeeeeee-2222-2222-2222-222222222222'
  const E3_ID = 'eeeeeeee-3333-3333-3333-333333333333'
  const E4_ID = 'eeeeeeee-4444-4444-4444-444444444444'
  const E5_ID = 'eeeeeeee-5555-5555-5555-555555555555'

  await db.exec(`
    INSERT INTO public.expenses (id, org_id, location_id, tanggal_pengeluaran, nominal, kategori, keterangan) VALUES
      ('${E1_ID}', '${ORG_A_ID}', '${LOC_MELATI_ID}', '2026-06-12', 800000, 'Listrik', 'Tagihan Listrik Kos Melati'),
      ('${E2_ID}', '${ORG_A_ID}', '${LOC_MELATI_ID}', '2026-06-15', 3000000, 'Inventaris', 'Pembelian Kasur Kamar 01'),
      ('${E3_ID}', '${ORG_A_ID}', '${LOC_MELATI_ID}', '2026-06-18', 5500000, 'Perbaikan & Aset', 'Nota Campuran AC Kamar 02 + Cuci 3 AC'),
      ('${E4_ID}', '${ORG_A_ID}', '${LOC_MELATI_ID}', '2026-06-25', 1200000, 'Pemeliharaan', 'Pengecatan Dinding Kamar'),
      ('${E5_ID}', '${ORG_A_ID}', NULL, '2026-06-20', 500000, 'Internet', 'Tagihan Internet Fiber Bersama');
  `)

  // 3. Buat 4 Aset & Komponen sesuai Contoh Rekonsiliasi Bagian 9:
  //    a) Gedung Kos Melati (Lokasi 1): Biaya 60.000.000, Masa 60 bln, Siap guna 2026-06-01, Porsi Usaha 60% -> Beban 1.000.000/bln (Usaha 600.000, Non-Usaha 400.000)
  //    b) Kasur Kamar 01 (Lokasi 1, E2): Biaya 3.000.000, Masa 60 bln, Siap guna 2026-06-01, Porsi Usaha 100%, allocated_cost = 3.000.000 -> Beban 50.000/bln (Usaha 50.000)
  //    c) Unit AC Kamar 02 (Lokasi 1, E3): Snapshot v1 Biaya 4.800.000, Masa 60 bln, Siap guna 2026-06-01, Porsi Usaha 80%, allocated_cost = 4.800.000 -> Beban 80.000/bln (Usaha 64.000, Non-Usaha 16.000)
  //    d) Genset Cadangan Utama (Aset Bersama, location_id = NULL): Biaya 6.000.000, Masa 60 bln, Siap guna 2026-06-01, Porsi Usaha 100% -> Beban 100.000/bln (Usaha Bersama 100.000)
  //    e) Pekerjaan Pengecatan Dinding (Lokasi 1, E4): allocated_cost = 1.200.000, pada Tahap 1 masih draft / perlu_telaah.
  const ASSET_GEDUNG = 'ffffffff-1111-1111-1111-111111111111'
  const ASSET_KASUR = 'ffffffff-2222-2222-2222-222222222222'
  const ASSET_AC = 'ffffffff-3333-3333-3333-333333333333'
  const ASSET_GENSET = 'ffffffff-4444-4444-4444-444444444444'
  const ASSET_CAT = 'ffffffff-5555-5555-5555-555555555555'

  const COMP_GEDUNG = '99999999-1111-1111-1111-111111111111'
  const COMP_KASUR = '99999999-2222-2222-2222-222222222222'
  const COMP_AC = '99999999-3333-3333-3333-333333333333'
  const COMP_GENSET = '99999999-4444-4444-4444-444444444444'
  const COMP_CAT = '99999999-5555-5555-5555-555555555555'

  await db.exec(`
    INSERT INTO public.assets (id, org_id, location_id, kode_aset, nama_aset, kategori_aset, status_pencatatan) VALUES
      ('${ASSET_GEDUNG}', '${ORG_A_ID}', '${LOC_MELATI_ID}', 'AST-GDG-01', 'Gedung Kos Melati', 'gedung', 'draft'),
      ('${ASSET_KASUR}', '${ORG_A_ID}', '${LOC_MELATI_ID}', 'AST-KSR-01', 'Kasur Kamar 01', 'elektronik_kantor', 'draft'),
      ('${ASSET_AC}', '${ORG_A_ID}', '${LOC_MELATI_ID}', 'AST-AC-02', 'AC Kamar 02', 'elektronik_kantor', 'draft'),
      ('${ASSET_GENSET}', '${ORG_A_ID}', NULL, 'AST-GNS-01', 'Genset Cadangan Utama', 'elektronik_kantor', 'draft'),
      ('${ASSET_CAT}', '${ORG_A_ID}', '${LOC_MELATI_ID}', 'AST-CAT-01', 'Pengecatan Dinding Kamar', 'gedung', 'draft');

    INSERT INTO public.asset_components (
      id, asset_id, org_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
      masa_manfaat_bulan, tanggal_siap_guna, pola_penggunaan, porsi_usaha_persen,
      status_kapitalisasi, metode_penyusutan, expense_id, allocated_cost
    ) VALUES
      ('${COMP_GEDUNG}', '${ASSET_GEDUNG}', '${ORG_A_ID}', 'Struktur Gedung Melati', 'perolehan_baru', 60000000, 0, 60, '2026-06-01', 'campuran', 60, 'kapitalisasi', 'garis_lurus', NULL, NULL),
      ('${COMP_KASUR}', '${ASSET_KASUR}', '${ORG_A_ID}', 'Unit Kasur Springbed', 'perolehan_baru', 3000000, 0, 60, '2026-06-01', 'seluruhnya_usaha', 100, 'kapitalisasi', 'garis_lurus', '${E2_ID}', 3000000),
      ('${COMP_AC}', '${ASSET_AC}', '${ORG_A_ID}', 'Unit AC Kamar 02', 'perolehan_baru', 4800000, 0, 60, '2026-06-01', 'campuran', 80, 'kapitalisasi', 'garis_lurus', '${E3_ID}', 4800000),
      ('${COMP_GENSET}', '${ASSET_GENSET}', '${ORG_A_ID}', 'Mesin Genset Bersama', 'perolehan_baru', 6000000, 0, 60, '2026-06-01', 'seluruhnya_usaha', 100, 'kapitalisasi', 'garis_lurus', NULL, NULL),
      ('${COMP_CAT}', '${ASSET_CAT}', '${ORG_A_ID}', 'Pengecatan Ulang Kamar', 'pemeliharaan_rutin', 1200000, 0, NULL, NULL, 'seluruhnya_usaha', 100, 'perlu_telaah', 'tidak_disusutkan', '${E4_ID}', 1200000);
  `)

  // Aktifkan Gedung, Kasur, AC (Snapshot v1), dan Genset Bersama; biarkan ASSET_CAT masih draft/perlu_telaah untuk Tahap 1
  await db.query(`SELECT public.activate_asset($1::uuid, 'Aktivasi awal Gedung')`, [ASSET_GEDUNG])
  await db.query(`SELECT public.activate_asset($1::uuid, 'Aktivasi awal Kasur')`, [ASSET_KASUR])
  await db.query(`SELECT public.activate_asset($1::uuid, 'Aktivasi awal AC v1')`, [ASSET_AC])
  await db.query(`SELECT public.activate_asset($1::uuid, 'Aktivasi awal Genset Bersama')`, [ASSET_GENSET])

  // Posting Batch 1 periode 2026-06
  const batch1 = await postPeriodHelper(db, ORG_A_ID, '2026-06', 'idemp-202606-b1', 'Batch 1 Juni 2026')
  assert.equal(batch1.batch_status, 'posted')

  // =========================================================================
  // VERIFIKASI TAHAP 1: E4 masih perlu_telaah (draf baru), Batch 1 sudah posted
  // =========================================================================
  const resT1 = await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-06', $2::uuid) AS r`,
    [ORG_A_ID, LOC_MELATI_ID]
  )
  const rT1 = resT1.rows[0].r

  assert.equal(rT1.cash_flow.cash_inflow, 4500000)
  assert.equal(rT1.cash_flow.cash_outflow_total, 10500000)
  assert.equal(rT1.cash_flow.net_cash_flow, -6000000)
  assert.equal(rT1.completeness.is_complete, false)
  assert.equal(rT1.completeness.depreciation_complete, true)
  assert.equal(rT1.completeness.classification_complete, false)
  assert.equal(rT1.completeness.status_code, 'BELUM_LENGKAP_KLASIFIKASI')
  assert.equal(rT1.completeness.pending_classification_issue_count, 1)
  assert.equal(rT1.income_statement.approved_capitalized_deduction, 7800000)
  assert.equal(rT1.income_statement.approved_direct_expense_allocation, 0)
  assert.equal(rT1.income_statement.pending_allocations.unapproved_new_count, 1)
  assert.equal(rT1.income_statement.pending_allocations.unapproved_new_amount, 1200000)
  assert.equal(rT1.income_statement.operating_cash_expense_reference, 2700000)
  assert.equal(rT1.income_statement.operating_cash_expense, null)
  assert.equal(rT1.income_statement.surplus_deficit_before_depreciation_reference, 1800000)
  assert.equal(rT1.income_statement.surplus_deficit_before_depreciation, null)
  assert.equal(rT1.income_statement.depreciation_business_portion, 714000)
  assert.equal(rT1.income_statement.depreciation_non_business_portion, 416000)
  assert.equal(rT1.income_statement.net_operating_income, null)
  assert.equal(rT1.shared_costs.shared_cash_outflow_total, 500000)
  assert.equal(rT1.shared_costs.shared_depreciation_business_portion, 100000)

  // =========================================================================
  // VERIFIKASI TAHAP 2: E4 disahkan sebagai beban_langsung (1.200.000)
  // =========================================================================
  await db.exec(`
    UPDATE public.asset_components
    SET status_kapitalisasi = 'beban_langsung'
    WHERE id = '${COMP_CAT}';
  `)
  await db.query(`SELECT public.activate_asset($1::uuid, 'Sahkan pengecatan sebagai beban_langsung')`, [ASSET_CAT])

  const resT2 = await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-06', $2::uuid) AS r`,
    [ORG_A_ID, LOC_MELATI_ID]
  )
  const rT2 = resT2.rows[0].r

  assert.equal(rT2.completeness.is_complete, true)
  assert.equal(rT2.completeness.status_code, 'LENGKAP_DIBUKUKAN')
  assert.equal(rT2.income_statement.approved_capitalized_deduction, 7800000)
  assert.equal(rT2.income_statement.approved_direct_expense_allocation, 1200000)
  assert.equal(rT2.income_statement.operating_cash_expense, 2700000)
  assert.equal(rT2.income_statement.surplus_deficit_before_depreciation, 1800000)
  assert.equal(rT2.income_statement.depreciation_business_portion, 714000)
  assert.equal(rT2.income_statement.net_operating_income, 1086000)
  assert.equal(rT2.reconciliation.is_reconciled, true)
  assert.equal(rT2.reconciliation.equals_net_operating_income, 1086000)

  // =========================================================================
  // VERIFIKASI TAHAP 3: Batch 1 di-storno & AC (E3) direvisi 4,8jt -> usulan 4,5jt
  // Preservasi nilai referensi terakhir disahkan (7,8jt & 2,7jt) tanpa hitung ganda!
  // =========================================================================
  await db.query(
    `SELECT public.reverse_depreciation_batch($1::uuid, 'Storno Batch 1 untuk revisi alokasi AC Kamar 02')`,
    [batch1.id]
  )

  await db.query(
    `SELECT public.revise_component_parameters(
      $1::uuid,
      4500000::numeric,
      0::numeric,
      60::int,
      '2026-06-01'::date,
      80::numeric,
      'garis_lurus'::text,
      'kapitalisasi'::text,
      'Koreksi alokasi nota campuran AC dari 4,8jt ke 4,5jt'::text,
      $2::uuid,
      4500000::numeric,
      true
    )`,
    [COMP_AC, E3_ID]
  )

  const resT3 = await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-06', $2::uuid) AS r`,
    [ORG_A_ID, LOC_MELATI_ID]
  )
  const rT3 = resT3.rows[0].r

  assert.equal(rT3.completeness.is_complete, false)
  assert.equal(rT3.completeness.depreciation_complete, false)
  assert.equal(rT3.completeness.classification_complete, false)
  assert.equal(rT3.completeness.status_code, 'BELUM_LENGKAP_KEDUANYA')
  // Nilai referensi wajib mempertahankan Snapshot v1 (3.000.000 + 4.800.000 = 7.800.000)
  assert.equal(rT3.income_statement.approved_capitalized_deduction, 7800000)
  assert.equal(rT3.income_statement.operating_cash_expense_reference, 2700000)
  assert.equal(rT3.income_statement.surplus_deficit_before_depreciation_reference, 1800000)
  assert.equal(rT3.income_statement.operating_cash_expense, null)
  assert.equal(rT3.income_statement.depreciation_business_portion, null)
  assert.equal(rT3.income_statement.net_operating_income, null)
  // Usulan revisi dipisahkan secara eksplisit tanpa dihitung ganda
  assert.equal(rT3.income_statement.pending_allocations.reapproval_count, 1)
  assert.equal(rT3.income_statement.pending_allocations.reapproval_reference_amount, 4800000)
  assert.equal(rT3.income_statement.pending_allocations.reapproval_proposed_amount, 4500000)
  assert.equal(rT3.income_statement.pending_allocations.reapproval_proposed_delta, -300000)
  // Ketiadaan batch aktif menyebabkan penyusutan bersama juga null (bukan 0)
  assert.equal(rT3.shared_costs.shared_depreciation_business_portion, null)

  // =========================================================================
  // VERIFIKASI TAHAP 4: Aset AC disahkan ulang (Snapshot v2) & Batch 2 diposting
  // =========================================================================
  await db.query(`SELECT public.activate_asset($1::uuid, 'Pengesahan ulang AC v2 alokasi 4,5jt')`, [ASSET_AC])
  const batch2 = await postPeriodHelper(db, ORG_A_ID, '2026-06', 'idemp-202606-b2', 'Batch 2 Pengganti Juni 2026')
  assert.equal(batch2.batch_status, 'posted')

  // 4A. Filter Lokasi 1 (Kos Melati) -> Hasil Usaha Bersih = Rp 790.000
  const resT4Loc1 = await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-06', $2::uuid) AS r`,
    [ORG_A_ID, LOC_MELATI_ID]
  )
  const rT4Loc1 = resT4Loc1.rows[0].r

  assert.equal(rT4Loc1.completeness.is_complete, true)
  assert.equal(rT4Loc1.completeness.status_code, 'LENGKAP_DIBUKUKAN')
  assert.equal(rT4Loc1.income_statement.approved_capitalized_deduction, 7500000)
  assert.equal(rT4Loc1.income_statement.approved_direct_expense_allocation, 1200000)
  assert.equal(rT4Loc1.income_statement.operating_cash_expense, 3000000)
  assert.equal(rT4Loc1.income_statement.surplus_deficit_before_depreciation, 1500000)
  assert.equal(rT4Loc1.income_statement.depreciation_business_portion, 710000)
  assert.equal(rT4Loc1.income_statement.depreciation_non_business_portion, 415000)
  assert.equal(rT4Loc1.income_statement.depreciation_total, 1125000)
  assert.equal(rT4Loc1.income_statement.net_operating_income, 790000)
  assert.equal(rT4Loc1.shared_costs.included_in_report_totals, false)
  assert.equal(rT4Loc1.shared_costs.shared_cash_outflow_total, 500000)
  assert.equal(rT4Loc1.shared_costs.shared_depreciation_business_portion, 100000)
  assert.equal(rT4Loc1.reconciliation.is_reconciled, true)
  assert.equal(rT4Loc1.reconciliation.equals_net_operating_income, 790000)
  // Verifikasi jejak revisi alokasi Snapshot v1 -> v2
  assert.equal(rT4Loc1.allocation_revision_history.length, 1)
  assert.equal(rT4Loc1.allocation_revision_history[0].from_snapshot_version, 1)
  assert.equal(rT4Loc1.allocation_revision_history[0].to_snapshot_version, 2)
  assert.equal(rT4Loc1.allocation_revision_history[0].previous_allocated_cost, 4800000)
  assert.equal(rT4Loc1.allocation_revision_history[0].current_allocated_cost, 4500000)
  assert.equal(rT4Loc1.allocation_revision_history[0].operating_expense_delta, 300000)

  // 4B. Filter Lokasi 2 (Kos Mawar — Lokasi Tanpa Ledger pada Batch yang Sah -> Rp 0 Lengkap, BUKAN null!)
  const resT4Loc2 = await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-06', $2::uuid) AS r`,
    [ORG_A_ID, LOC_MAWAR_ID]
  )
  const rT4Loc2 = resT4Loc2.rows[0].r

  assert.equal(rT4Loc2.completeness.is_complete, true)
  assert.equal(rT4Loc2.completeness.has_posted_batch, true)
  assert.equal(rT4Loc2.completeness.status_code, 'LENGKAP_DIBUKUKAN')
  assert.equal(rT4Loc2.income_statement.depreciation_business_portion, 0)
  assert.equal(rT4Loc2.income_statement.depreciation_non_business_portion, 0)
  assert.equal(rT4Loc2.income_statement.depreciation_total, 0)
  assert.equal(rT4Loc2.income_statement.net_operating_income, 0)
  assert.equal(rT4Loc2.shared_costs.shared_cash_outflow_total, 500000)
  assert.equal(rT4Loc2.shared_costs.shared_depreciation_business_portion, 100000)

  // 4C. Filter Semua Lokasi (p_location_id = NULL) -> Hasil Usaha Bersih = Rp 190.000
  const resT4All = await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-06', NULL) AS r`,
    [ORG_A_ID]
  )
  const rT4All = resT4All.rows[0].r

  assert.equal(rT4All.completeness.is_complete, true)
  assert.equal(rT4All.cash_flow.cash_inflow, 4500000)
  assert.equal(rT4All.cash_flow.cash_outflow_total, 11000000)
  assert.equal(rT4All.cash_flow.net_cash_flow, -6500000)
  assert.equal(rT4All.income_statement.operating_cash_expense, 3500000)
  assert.equal(rT4All.income_statement.surplus_deficit_before_depreciation, 1000000)
  assert.equal(rT4All.income_statement.depreciation_business_portion, 810000)
  assert.equal(rT4All.income_statement.net_operating_income, 190000)
  assert.equal(rT4All.shared_costs.included_in_report_totals, true)
  assert.equal(rT4All.reconciliation.is_reconciled, true)
  assert.equal(rT4All.reconciliation.equals_net_operating_income, 190000)
})

test('2. Deteksi allocated_cost IS NULL dan perpindahan expense_id lintas periode (2026-05 -> 2026-06)', async () => {
  const db = await createPhase5Database()
  await db.query(`SELECT public.set_bookkeeping_start_date($1::uuid, '2026-05-01'::date)`, [ORG_A_ID])

  const EXP_MEI = 'eeeeeeee-0505-0505-0505-050505050505'
  const EXP_JUNI = 'eeeeeeee-0606-0606-0606-060606060606'
  const ASSET_POMPA = 'ffffffff-7777-7777-7777-777777777777'
  const COMP_POMPA = '99999999-7777-7777-7777-777777777777'

  await db.exec(`
    INSERT INTO public.expenses (id, org_id, location_id, tanggal_pengeluaran, nominal, kategori, keterangan) VALUES
      ('${EXP_MEI}', '${ORG_A_ID}', '${LOC_MELATI_ID}', '2026-05-10', 2000000, 'Perbaikan', 'Nota Mei'),
      ('${EXP_JUNI}', '${ORG_A_ID}', '${LOC_MELATI_ID}', '2026-06-10', 2400000, 'Perbaikan', 'Nota Juni');

    INSERT INTO public.assets (id, org_id, location_id, kode_aset, nama_aset, kategori_aset, status_pencatatan) VALUES
      ('${ASSET_POMPA}', '${ORG_A_ID}', '${LOC_MELATI_ID}', 'AST-PMP-01', 'Pompa Air Utama', 'elektronik_kantor', 'draft');

    INSERT INTO public.asset_components (
      id, asset_id, org_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
      masa_manfaat_bulan, tanggal_siap_guna, pola_penggunaan, porsi_usaha_persen,
      status_kapitalisasi, metode_penyusutan, expense_id, allocated_cost
    ) VALUES (
      '${COMP_POMPA}', '${ASSET_POMPA}', '${ORG_A_ID}', 'Mesin Pompa Air', 'perolehan_baru',
      2000000, 0, 20, '2026-05-10', 'seluruhnya_usaha', 100,
      'kapitalisasi', 'garis_lurus', '${EXP_MEI}', NULL
    );
  `)

  // 2A. Saat expense_id terisi tetapi allocated_cost IS NULL:
  //     - activate_asset wajib menolak dengan SIMKOS_INCOMPLETE_ALLOCATION
  await assert.rejects(
    () => db.query(`SELECT public.activate_asset($1::uuid, 'Coba aktifkan tanpa allocated_cost')`, [ASSET_POMPA]),
    /SIMKOS_INCOMPLETE_ALLOCATION/
  )

  //     - get_period_financial_report wajib mendeteksi null_allocated_cost_issue_count = 1
  const repNull = (await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-05', $2::uuid) AS r`,
    [ORG_A_ID, LOC_MELATI_ID]
  )).rows[0].r
  assert.equal(repNull.completeness.classification_complete, false)
  assert.equal(repNull.completeness.null_allocated_cost_issue_count, 1)
  assert.equal(repNull.income_statement.operating_cash_expense, null)

  // 2B. Lengkapi allocated_cost = 2.000.000 pada EXP_MEI dan aktifkan Snapshot v1
  await db.exec(`UPDATE public.asset_components SET allocated_cost = 2000000 WHERE id = '${COMP_POMPA}';`)
  await db.query(`SELECT public.activate_asset($1::uuid, 'Aktivasi Pompa v1 di Nota Mei')`, [ASSET_POMPA])

  // 2C. Pindahkan tautan expense_id dari EXP_MEI (2026-05) ke EXP_JUNI (2026-06, allocated_cost = 2.400.000) via revise_component_parameters
  await db.query(
    `SELECT public.revise_component_parameters(
      $1::uuid, 2400000::numeric, 0::numeric, 24::int, '2026-06-10'::date, 100::numeric,
      'garis_lurus'::text, 'kapitalisasi'::text, 'Pindahkan tautan nota dari Mei ke Juni'::text,
      $2::uuid, 2400000::numeric, true
    )`,
    [COMP_POMPA, EXP_JUNI]
  )

  // Selama perlu_pengesahan_ulang, KEDUA periode (2026-05 dan 2026-06) wajib classification_complete = false!
  const repMeiPending = (await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-05', $2::uuid) AS r`,
    [ORG_A_ID, LOC_MELATI_ID]
  )).rows[0].r
  const repJuniPending = (await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-06', $2::uuid) AS r`,
    [ORG_A_ID, LOC_MELATI_ID]
  )).rows[0].r

  assert.equal(repMeiPending.completeness.classification_complete, false)
  assert.equal(repMeiPending.income_statement.approved_capitalized_deduction, 2000000) // Referensi v1 tetap dipertahankan di Mei
  assert.equal(repMeiPending.income_statement.pending_allocations.reapproval_reference_amount, 2000000)
  assert.equal(repMeiPending.income_statement.pending_allocations.reapproval_proposed_amount, 0)
  assert.equal(repMeiPending.income_statement.pending_allocations.reapproval_proposed_delta, -2000000)

  assert.equal(repJuniPending.completeness.classification_complete, false)
  assert.equal(repJuniPending.income_statement.approved_capitalized_deduction, 0) // Referensi v1 di Juni masih 0
  assert.equal(repJuniPending.income_statement.pending_allocations.reapproval_reference_amount, 0)
  assert.equal(repJuniPending.income_statement.pending_allocations.reapproval_proposed_amount, 2400000)
  assert.equal(repJuniPending.income_statement.pending_allocations.reapproval_proposed_delta, 2400000)

  // 2D. Sahkan ulang (Snapshot v2) -> Kedua periode selesai klasifikasi & memuat allocation_revision_history!
  await db.query(`SELECT public.activate_asset($1::uuid, 'Pengesahan ulang Pompa v2 di Nota Juni')`, [ASSET_POMPA])

  const repMeiAfter = (await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-05', $2::uuid) AS r`,
    [ORG_A_ID, LOC_MELATI_ID]
  )).rows[0].r
  const repJuniAfter = (await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-06', $2::uuid) AS r`,
    [ORG_A_ID, LOC_MELATI_ID]
  )).rows[0].r

  assert.equal(repMeiAfter.completeness.classification_complete, true)
  assert.equal(repMeiAfter.income_statement.approved_capitalized_deduction, 0)
  assert.equal(repMeiAfter.income_statement.operating_cash_expense, 2000000)
  assert.equal(repMeiAfter.allocation_revision_history.length, 1)
  assert.equal(repMeiAfter.allocation_revision_history[0].operating_expense_delta, 2000000)

  assert.equal(repJuniAfter.completeness.classification_complete, true)
  assert.equal(repJuniAfter.income_statement.approved_capitalized_deduction, 2400000)
  assert.equal(repJuniAfter.income_statement.operating_cash_expense, 0)
  assert.equal(repJuniAfter.allocation_revision_history.length, 1)
  assert.equal(repJuniAfter.allocation_revision_history[0].operating_expense_delta, -2400000)
})

test('3. Penanganan snapshot lama tanpa lokasi/alokasi, siklus multi-storno, Batch Nol (0 vs null), ON DELETE RESTRICT, & batas penguncian periode', async () => {
  const db = await createPhase5Database()
  await db.query(`SELECT public.set_bookkeeping_start_date($1::uuid, '2026-06-01'::date)`, [ORG_A_ID])

  const ASSET_LAMA = 'ffffffff-8888-8888-8888-888888888888'
  const COMP_LAMA = '99999999-8888-8888-8888-888888888888'
  const EXP_LAMA = 'eeeeeeee-8888-8888-8888-888888888888'

  await db.exec(`
    INSERT INTO public.expenses (id, org_id, location_id, tanggal_pengeluaran, nominal, kategori, keterangan) VALUES
      ('${EXP_LAMA}', '${ORG_A_ID}', '${LOC_MELATI_ID}', '2026-06-05', 1800000, 'Peralatan', 'Meja Kerja');

    INSERT INTO public.assets (id, org_id, location_id, kode_aset, nama_aset, kategori_aset, status_pencatatan) VALUES
      ('${ASSET_LAMA}', '${ORG_A_ID}', '${LOC_MELATI_ID}', 'AST-MJA-01', 'Meja Kerja Kamar', 'elektronik_kantor', 'draft');

    INSERT INTO public.asset_components (
      id, asset_id, org_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
      masa_manfaat_bulan, tanggal_siap_guna, pola_penggunaan, porsi_usaha_persen,
      status_kapitalisasi, metode_penyusutan, expense_id, allocated_cost
    ) VALUES (
      '${COMP_LAMA}', '${ASSET_LAMA}', '${ORG_A_ID}', 'Meja Kayu Jati', 'perolehan_baru',
      1800000, 0, 18, '2026-06-01', 'seluruhnya_usaha', 100,
      'kapitalisasi', 'garis_lurus', '${EXP_LAMA}', 1800000
    );
  `)

  // Aktifkan aset, lalu simulasikan kondisi snapshot lama pra-Fase 5B:
  // location_id = NULL, location_recorded = false, dan snapshot_params tanpa kunci expense_id / allocated_cost / location_id
  await db.query(`SELECT public.activate_asset($1::uuid, 'Aktivasi awal')`, [ASSET_LAMA])
  await db.exec(`
    UPDATE public.asset_activation_snapshots
    SET location_id = NULL,
        location_recorded = false,
        snapshot_params = jsonb_build_array(
          (snapshot_params->0) - 'expense_id' - 'allocated_cost' - 'location_id'
        )
    WHERE asset_id = '${ASSET_LAMA}';
  `)

  const batchLama = await postPeriodHelper(db, ORG_A_ID, '2026-06', 'idemp-legacy-1', 'Batch dengan snapshot lama')

  // 3A. Verifikasi bahwa snapshot lama TIDAK dianggap aset bersama atau Rp 0, melainkan menandai Belum Lengkap
  const repLegacy = (await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-06', NULL) AS r`,
    [ORG_A_ID]
  )).rows[0].r

  assert.equal(repLegacy.completeness.is_complete, false)
  assert.equal(repLegacy.completeness.depreciation_complete, false)
  assert.equal(repLegacy.completeness.classification_complete, false)
  assert.equal(repLegacy.completeness.legacy_snapshot_issue_count, 2) // 1 lokasi + 1 alokasi
  assert.equal(repLegacy.income_statement.depreciation_business_portion, null)
  assert.equal(repLegacy.shared_costs.shared_depreciation_business_portion, null)
  assert.ok(repLegacy.completeness.reasons.some((r) => r.code === 'SNAPSHOT_LAMA_BELUM_MEMUAT_METADATA'))

  // 3B. Storno batch lama, revisi & aktifkan ulang -> menerbitkan Snapshot v2 dengan metadata lengkap, lalu uji Siklus Multi-Storno!
  await db.query(`SELECT public.reverse_depreciation_batch($1::uuid, 'Storno untuk upgrade snapshot lama')`, [batchLama.id])
  await db.query(
    `SELECT public.revise_component_parameters(
      $1::uuid, 1800000::numeric, 0::numeric, 18::int, '2026-06-01'::date, 100::numeric,
      'garis_lurus'::text, 'kapitalisasi'::text, 'Sinkronisasi metadata Fase 5B'::text
    )`,
    [COMP_LAMA]
  )
  await db.query(`SELECT public.activate_asset($1::uuid, 'Aktivasi ulang v2 dengan metadata lengkap')`, [ASSET_LAMA])

  // Siklus Multi-Storno: Batch 2 -> Storno -> Batch 3
  const batch2 = await postPeriodHelper(db, ORG_A_ID, '2026-06', 'idemp-multi-2', 'Batch 2')
  await db.query(`SELECT public.reverse_depreciation_batch($1::uuid, 'Storno kedua')`, [batch2.id])
  const batch3 = await postPeriodHelper(db, ORG_A_ID, '2026-06', 'idemp-multi-3', 'Batch 3 Final')
  assert.equal(batch3.batch_status, 'posted')

  const repMulti = (await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-06', $2::uuid) AS r`,
    [ORG_A_ID, LOC_MELATI_ID]
  )).rows[0].r
  assert.equal(repMulti.completeness.is_complete, true)
  // Hanya Batch 3 yang dihitung (1.800.000 / 18 bln = 100.000/bln), tidak dihitung ganda dari Batch 1 & 2!
  assert.equal(repMulti.income_statement.depreciation_business_portion, 100000)

  // 3C. Verifikasi ON DELETE RESTRICT pada lokasi snapshot & proteksi penghapusan expense teralokasi
  await assert.rejects(
    () => db.exec(`DELETE FROM public.expenses WHERE id = '${EXP_LAMA}';`),
    /SIMKOS_EXPENSE_HAS_ALLOCATED_ASSET/
  )

  const fkCheck = await db.query(`
    SELECT confdeltype
    FROM pg_constraint
    WHERE conrelid = 'public.asset_activation_snapshots'::regclass
      AND conname = 'asset_activation_snapshots_location_id_fkey'
  `)
  assert.equal(fkCheck.rows[0]?.confdeltype, 'r', 'FK location_id pada snapshot wajib ON DELETE RESTRICT (r)')

  const LOC_RESTRICT_ID = 'aaaaaaaa-3333-3333-3333-333333333333'
  await db.exec(`
    INSERT INTO public.locations (id, org_id, nama_lokasi)
    VALUES ('${LOC_RESTRICT_ID}', '${ORG_A_ID}', 'Kos Anggrek Restrict');

    UPDATE public.asset_activation_snapshots
    SET location_id = '${LOC_RESTRICT_ID}'
    WHERE asset_id = '${ASSET_LAMA}' AND version = 1;
  `)

  await assert.rejects(
    () => db.exec(`DELETE FROM public.locations WHERE id = '${LOC_RESTRICT_ID}';`),
    /asset_activation_snapshots_location_id_fkey|violates foreign key constraint/i
  )

  // 3D. Verifikasi penolakan perubahan langsung lokasi aset & pengeluaran yang terikat snapshot
  await assert.rejects(
    () => db.exec(`UPDATE public.assets SET location_id = '${LOC_MAWAR_ID}' WHERE id = '${ASSET_LAMA}';`),
    /SIMKOS_LOCKED_ASSET_LOCATION/
  )
  await assert.rejects(
    () => db.exec(`UPDATE public.expenses SET location_id = '${LOC_MAWAR_ID}' WHERE id = '${EXP_LAMA}';`),
    /SIMKOS_EXPENSE_LOCKED_BY_ACTIVE_ASSET/
  )

  // 3E. Verifikasi Penguncian Periode Penyusutan:
  //     - Mengubah status laporan menjadi LENGKAP_TERKUNCI
  //     - Memblokir reverse_depreciation_batch (SIMKOS_PERIOD_LOCKED)
  //     - TIDAK memblokir pencatatan transaksi kas umum baru (incomes / expenses)
  await db.query(`SELECT public.lock_accounting_period($1::uuid, '2026-06')`, [ORG_A_ID])

  const repLocked = (await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-06', $2::uuid) AS r`,
    [ORG_A_ID, LOC_MELATI_ID]
  )).rows[0].r
  assert.equal(repLocked.completeness.status_code, 'LENGKAP_TERKUNCI')
  assert.equal(repLocked.completeness.period_lock_status, 'locked')

  await assert.rejects(
    () => db.query(`SELECT public.reverse_depreciation_batch($1::uuid, 'Coba storno saat terkunci')`, [batch3.id]),
    /SIMKOS_PERIOD_LOCKED/
  )

  // Transaksi kas umum tetap diizinkan pada periode yang buku pembantu penyusutannya dikunci
  await db.exec(`
    INSERT INTO public.incomes (org_id, rental_id, tanggal_bayar, nominal, keterangan)
    VALUES ('${ORG_A_ID}', '${RENTAL_01}', '2026-06-28', 1500000, 'Penerimaan kas umum tetap berjalan');
  `)
})

test('4. Perbedaan ketat Ketiadaan Batch (null) vs Batch Nol (Rp 0 pada periode dengan 0 komponen disusutkan)', async () => {
  const db = await createPhase5Database()
  await db.query(`SELECT public.set_bookkeeping_start_date($1::uuid, '2026-06-01'::date)`, [ORG_A_ID])

  // Tanpa aset yang disusutkan:
  // 4A. Sebelum batch diposting -> Ketiadaan batch wajib menghasilkan NULL
  const repNoBatch = (await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-06', NULL) AS r`,
    [ORG_A_ID]
  )).rows[0].r

  assert.equal(repNoBatch.completeness.has_posted_batch, false)
  assert.equal(repNoBatch.completeness.depreciation_complete, false)
  assert.equal(repNoBatch.income_statement.depreciation_business_portion, null)
  assert.equal(repNoBatch.income_statement.depreciation_total, null)
  assert.equal(repNoBatch.income_statement.net_operating_income, null)

  // 4B. Setelah Batch Nol diposting -> Wajib menghasilkan 0 (Rp 0) dan status Lengkap!
  const zeroBatch = await postPeriodHelper(db, ORG_A_ID, '2026-06', 'idemp-zero-batch', 'Posting batch nol sah')
  assert.equal(zeroBatch.batch_status, 'posted')
  assert.equal(Number(zeroBatch.total_depreciation), 0)
  assert.equal(Number(zeroBatch.component_count), 0)

  const repZeroBatch = (await db.query(
    `SELECT public.get_period_financial_report($1::uuid, '2026-06', NULL) AS r`,
    [ORG_A_ID]
  )).rows[0].r

  assert.equal(repZeroBatch.completeness.has_posted_batch, true)
  assert.equal(repZeroBatch.completeness.depreciation_complete, true)
  assert.equal(repZeroBatch.completeness.is_complete, true)
  assert.equal(repZeroBatch.completeness.status_code, 'LENGKAP_DIBUKUKAN')
  assert.equal(repZeroBatch.income_statement.depreciation_business_portion, 0)
  assert.equal(repZeroBatch.income_statement.depreciation_non_business_portion, 0)
  assert.equal(repZeroBatch.income_statement.depreciation_total, 0)
  assert.equal(repZeroBatch.income_statement.net_operating_income, 0)
})
