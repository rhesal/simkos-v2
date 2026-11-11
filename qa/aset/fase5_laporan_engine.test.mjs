import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isFullMonthPeriodKey,
  getFullMonthDateRange,
  detectFullMonthFromDateRange,
  getReportCompletenessBadge,
  validateReconciliationBridge,
  evaluatePeriodFinancialReportLocal,
} from '../../src/lib/laporanKeuangan.js'

test('1. Validasi periode bulan kalender penuh (YYYY-MM) dan deteksi rentang tanggal', () => {
  assert.equal(isFullMonthPeriodKey('2026-06'), true)
  assert.equal(isFullMonthPeriodKey('2026-12'), true)
  assert.equal(isFullMonthPeriodKey('2026-00'), false)
  assert.equal(isFullMonthPeriodKey('2026-13'), false)
  assert.equal(isFullMonthPeriodKey('2026-06-01'), false)
  assert.equal(isFullMonthPeriodKey(''), false)

  const rangeJune = getFullMonthDateRange('2026-06')
  assert.equal(rangeJune.startDate, '2026-06-01')
  assert.equal(rangeJune.endDate, '2026-06-30')

  const rangeFebLeap = getFullMonthDateRange('2024-02')
  assert.equal(rangeFebLeap.startDate, '2024-02-01')
  assert.equal(rangeFebLeap.endDate, '2024-02-29')

  assert.throws(
    () => getFullMonthDateRange('2026-06-01 s/d 2026-06-15'),
    /SIMKOS_FULL_MONTH_REQUIRED/
  )

  // Deteksi dari pasangan startDate & endDate
  const fullMonth = detectFullMonthFromDateRange('2026-06-01', '2026-06-30')
  assert.equal(fullMonth.isFullMonth, true)
  assert.equal(fullMonth.periodKey, '2026-06')
  assert.equal(fullMonth.reason, null)

  const partialMonth = detectFullMonthFromDateRange('2026-06-01', '2026-06-15')
  assert.equal(partialMonth.isFullMonth, false)
  assert.equal(partialMonth.periodKey, null)
  assert.match(partialMonth.reason, /Rentang tanggal parsial/)

  const crossMonth = detectFullMonthFromDateRange('2026-06-15', '2026-07-15')
  assert.equal(crossMonth.isFullMonth, false)
  assert.equal(crossMonth.periodKey, null)
  assert.match(crossMonth.reason, /melintasi lebih dari satu bulan/)
})

test('2. Pemisahan nilai referensi disahkan vs usulan revisi tanpa hitung ganda (Contoh Rekonsiliasi Tahap 1 s/d Tahap 4)', () => {
  const orgId = '00000000-0000-0000-0000-000000000001'
  const loc1 = '00000000-0000-0000-0000-000000000011' // Kos Melati
  const loc2 = '00000000-0000-0000-0000-000000000012' // Kos Mawar

  const incomes = [
    { id: 'i1', tanggal: '2026-06-05', jumlah_terima: 2000000, location_id: loc1 },
    { id: 'i2', tanggal: '2026-06-10', jumlah_terima: 2500000, location_id: loc1 },
  ]
  const expenses = [
    { id: 'e1', tanggal_pengeluaran: '2026-06-12', jumlah_pengeluaran: 800000, location_id: loc1 },
    { id: 'e2', tanggal_pengeluaran: '2026-06-15', jumlah_pengeluaran: 3000000, location_id: loc1 },
    { id: 'e3', tanggal_pengeluaran: '2026-06-18', jumlah_pengeluaran: 5500000, location_id: loc1 },
    { id: 'e4', tanggal_pengeluaran: '2026-06-25', jumlah_pengeluaran: 1200000, location_id: loc1 },
    { id: 'e5', tanggal_pengeluaran: '2026-06-20', jumlah_pengeluaran: 500000, location_id: null },
  ]

  const snapGedungV1 = {
    id: 'snap-gedung-v1',
    asset_id: 'asset-gedung',
    version: 1,
    location_id: loc1,
    location_recorded: true,
    snapshot_params: { components: [] },
  }
  const snapKasurV1 = {
    id: 'snap-kasur-v1',
    asset_id: 'asset-kasur',
    version: 1,
    location_id: loc1,
    location_recorded: true,
    snapshot_params: {
      components: [
        {
          component_id: 'c-kasur',
          expense_id: 'e2',
          allocated_cost: 3000000,
          status_kapitalisasi: 'kapitalisasi',
        },
      ],
    },
  }
  const snapAcV1 = {
    id: 'snap-ac-v1',
    asset_id: 'asset-ac',
    version: 1,
    location_id: loc1,
    location_recorded: true,
    snapshot_params: {
      components: [
        {
          component_id: 'c-ac',
          expense_id: 'e3',
          allocated_cost: 4800000,
          status_kapitalisasi: 'kapitalisasi',
        },
      ],
    },
  }
  const snapGensetV1 = {
    id: 'snap-genset-v1',
    asset_id: 'asset-genset',
    version: 1,
    location_id: null,
    location_recorded: true,
    snapshot_params: { components: [] },
  }

  const ledgersBatch1 = [
    { batch_id: 'b1', snapshot_id: 'snap-gedung-v1', penyusutan_periode_ini: 1000000, porsi_usaha_periode_ini: 600000, porsi_non_usaha_periode_ini: 400000 },
    { batch_id: 'b1', snapshot_id: 'snap-kasur-v1', penyusutan_periode_ini: 50000, porsi_usaha_periode_ini: 50000, porsi_non_usaha_periode_ini: 0 },
    { batch_id: 'b1', snapshot_id: 'snap-ac-v1', penyusutan_periode_ini: 80000, porsi_usaha_periode_ini: 64000, porsi_non_usaha_periode_ini: 16000 },
    { batch_id: 'b1', snapshot_id: 'snap-genset-v1', penyusutan_periode_ini: 100000, porsi_usaha_periode_ini: 100000, porsi_non_usaha_periode_ini: 0 },
  ]

  // --- TAHAP 1: E4 masih perlu_telaah (draf baru 1.200.000), Batch 1 (v1) sudah diposting
  const tahap1 = evaluatePeriodFinancialReportLocal({
    orgId,
    periodKey: '2026-06',
    locationId: loc1,
    locationName: 'Kos Melati',
    incomes,
    expenses,
    assets: [
      { id: 'asset-kasur', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 },
      { id: 'asset-ac', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 },
      { id: 'asset-cat', status_aset: 'draft', requires_reapproval: false, location_id: loc1 },
    ],
    components: [
      { id: 'c-kasur', asset_id: 'asset-kasur', expense_id: 'e2', allocated_cost: 3000000, status_kapitalisasi: 'kapitalisasi', tanggal_siap_guna: '2026-06-15' },
      { id: 'c-ac', asset_id: 'asset-ac', expense_id: 'e3', allocated_cost: 4800000, status_kapitalisasi: 'kapitalisasi', tanggal_siap_guna: '2026-06-18' },
      { id: 'c-cat', asset_id: 'asset-cat', expense_id: 'e4', allocated_cost: 1200000, status_kapitalisasi: 'perlu_telaah', tanggal_siap_guna: null },
    ],
    snapshots: [snapGedungV1, snapKasurV1, snapAcV1, snapGensetV1],
    batches: [{ id: 'b1', period_key: '2026-06', status: 'posted' }],
    ledgerEntries: ledgersBatch1,
  })

  assert.equal(tahap1.cash_flow.cash_in, 4500000)
  assert.equal(tahap1.cash_flow.cash_out, 10500000)
  assert.equal(tahap1.cash_flow.net_cash_flow, -6000000)
  assert.equal(tahap1.completeness.is_complete, false)
  assert.equal(tahap1.completeness.classification_complete, false)
  assert.equal(tahap1.completeness.depreciation_complete, true)
  assert.equal(tahap1.operating_report.approved_capitalized_deduction, 7800000)
  assert.equal(tahap1.operating_report.approved_direct_expense_allocation, 0)
  assert.equal(tahap1.operating_report.operating_cash_expense, null)
  assert.equal(tahap1.operating_report.reference_operating_cash_expense, 2700000)
  assert.equal(tahap1.operating_report.pending_allocations.unapproved_new_amount, 1200000)
  assert.equal(tahap1.operating_report.depreciation_business_portion, 714000)
  assert.equal(tahap1.operating_report.net_operating_income, null)
  assert.equal(validateReconciliationBridge(tahap1).valid, true)

  // --- TAHAP 2: E4 disahkan sebagai beban_langsung (1.200.000), Batch 1 (v1) aktif
  const snapCatV1 = {
    id: 'snap-cat-v1',
    asset_id: 'asset-cat',
    version: 1,
    location_id: loc1,
    location_recorded: true,
    snapshot_params: {
      components: [
        {
          component_id: 'c-cat',
          expense_id: 'e4',
          allocated_cost: 1200000,
          status_kapitalisasi: 'beban_langsung',
        },
      ],
    },
  }

  const tahap2 = evaluatePeriodFinancialReportLocal({
    orgId,
    periodKey: '2026-06',
    locationId: loc1,
    locationName: 'Kos Melati',
    incomes,
    expenses,
    assets: [
      { id: 'asset-kasur', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 },
      { id: 'asset-ac', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 },
      { id: 'asset-cat', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 },
    ],
    components: [
      { id: 'c-kasur', asset_id: 'asset-kasur', expense_id: 'e2', allocated_cost: 3000000, status_kapitalisasi: 'kapitalisasi', tanggal_siap_guna: '2026-06-15' },
      { id: 'c-ac', asset_id: 'asset-ac', expense_id: 'e3', allocated_cost: 4800000, status_kapitalisasi: 'kapitalisasi', tanggal_siap_guna: '2026-06-18' },
      { id: 'c-cat', asset_id: 'asset-cat', expense_id: 'e4', allocated_cost: 1200000, status_kapitalisasi: 'beban_langsung', tanggal_siap_guna: null },
    ],
    snapshots: [snapGedungV1, snapKasurV1, snapAcV1, snapCatV1, snapGensetV1],
    batches: [{ id: 'b1', period_key: '2026-06', status: 'posted' }],
    ledgerEntries: ledgersBatch1,
  })

  assert.equal(tahap2.completeness.is_complete, true)
  assert.equal(tahap2.operating_report.approved_capitalized_deduction, 7800000)
  assert.equal(tahap2.operating_report.approved_direct_expense_allocation, 1200000)
  assert.equal(tahap2.operating_report.operating_cash_expense, 2700000)
  assert.equal(tahap2.operating_report.operating_surplus_before_depreciation, 1800000)
  assert.equal(tahap2.operating_report.depreciation_business_portion, 714000)
  assert.equal(tahap2.operating_report.net_operating_income, 1086000)
  assert.equal(validateReconciliationBridge(tahap2).valid, true)

  // --- TAHAP 3: Batch 1 di-storno (reversed) & E3 direvisi dari 4.800.000 menjadi 4.500.000 (status perlu_pengesahan_ulang)
  const tahap3 = evaluatePeriodFinancialReportLocal({
    orgId,
    periodKey: '2026-06',
    locationId: loc1,
    locationName: 'Kos Melati',
    incomes,
    expenses,
    assets: [
      { id: 'asset-kasur', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 },
      { id: 'asset-ac', status_aset: 'perlu_pengesahan_ulang', requires_reapproval: true, location_id: loc1 },
      { id: 'asset-cat', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 },
    ],
    components: [
      { id: 'c-kasur', asset_id: 'asset-kasur', expense_id: 'e2', allocated_cost: 3000000, status_kapitalisasi: 'kapitalisasi', tanggal_siap_guna: '2026-06-15', requires_reapproval: false },
      { id: 'c-ac', asset_id: 'asset-ac', expense_id: 'e3', allocated_cost: 4500000, status_kapitalisasi: 'kapitalisasi', tanggal_siap_guna: '2026-06-18', requires_reapproval: true },
      { id: 'c-cat', asset_id: 'asset-cat', expense_id: 'e4', allocated_cost: 1200000, status_kapitalisasi: 'beban_langsung', tanggal_siap_guna: null, requires_reapproval: false },
    ],
    snapshots: [snapGedungV1, snapKasurV1, snapAcV1, snapCatV1, snapGensetV1],
    batches: [{ id: 'b1', period_key: '2026-06', status: 'reversed' }],
    ledgerEntries: ledgersBatch1,
  })

  // Preservasi nilai referensi terakhir disahkan (7.800.000 -> 2.700.000 & 1.800.000)
  assert.equal(tahap3.operating_report.approved_capitalized_deduction, 7800000)
  assert.equal(tahap3.operating_report.reference_operating_cash_expense, 2700000)
  assert.equal(tahap3.operating_report.reference_operating_surplus_before_depreciation, 1800000)
  assert.equal(tahap3.operating_report.operating_cash_expense, null)
  assert.equal(tahap3.operating_report.depreciation_business_portion, null)
  assert.equal(tahap3.operating_report.net_operating_income, null)
  // Pemisahan usulan revisi tanpa hitung ganda
  assert.equal(tahap3.operating_report.pending_allocations.reapproval_reference_amount, 4800000)
  assert.equal(tahap3.operating_report.pending_allocations.reapproval_proposed_amount, 4500000)
  assert.equal(tahap3.operating_report.pending_allocations.reapproval_proposed_delta, -300000)
  assert.equal(tahap3.operating_report.pending_allocations.proposed_vs_approved_delta, -300000)
  assert.equal(validateReconciliationBridge(tahap3).valid, true)

  // --- TAHAP 4: Aset AC disahkan ulang (Snapshot v2 = 4.500.000) & Batch 2 Pengganti diposting
  const snapAcV2 = {
    id: 'snap-ac-v2',
    asset_id: 'asset-ac',
    version: 2,
    location_id: loc1,
    location_recorded: true,
    snapshot_params: {
      components: [
        {
          component_id: 'c-ac',
          expense_id: 'e3',
          allocated_cost: 4500000,
          status_kapitalisasi: 'kapitalisasi',
        },
      ],
    },
  }

  const ledgersBatch2 = [
    { batch_id: 'b2', snapshot_id: 'snap-gedung-v1', penyusutan_periode_ini: 1000000, porsi_usaha_periode_ini: 600000, porsi_non_usaha_periode_ini: 400000 },
    { batch_id: 'b2', snapshot_id: 'snap-kasur-v1', penyusutan_periode_ini: 50000, porsi_usaha_periode_ini: 50000, porsi_non_usaha_periode_ini: 0 },
    { batch_id: 'b2', snapshot_id: 'snap-ac-v2', penyusutan_periode_ini: 75000, porsi_usaha_periode_ini: 60000, porsi_non_usaha_periode_ini: 15000 },
    { batch_id: 'b2', snapshot_id: 'snap-genset-v1', penyusutan_periode_ini: 100000, porsi_usaha_periode_ini: 100000, porsi_non_usaha_periode_ini: 0 },
  ]

  // 4A. Filter Lokasi 1 (Kos Melati) -> Hasil Usaha Bersih Rp 790.000
  const tahap4Loc1 = evaluatePeriodFinancialReportLocal({
    orgId,
    periodKey: '2026-06',
    locationId: loc1,
    locationName: 'Kos Melati',
    incomes,
    expenses,
    assets: [
      { id: 'asset-kasur', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 },
      { id: 'asset-ac', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 },
      { id: 'asset-cat', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 },
    ],
    components: [
      { id: 'c-kasur', asset_id: 'asset-kasur', expense_id: 'e2', allocated_cost: 3000000, status_kapitalisasi: 'kapitalisasi', tanggal_siap_guna: '2026-06-15' },
      { id: 'c-ac', asset_id: 'asset-ac', expense_id: 'e3', allocated_cost: 4500000, status_kapitalisasi: 'kapitalisasi', tanggal_siap_guna: '2026-06-18' },
      { id: 'c-cat', asset_id: 'asset-cat', expense_id: 'e4', allocated_cost: 1200000, status_kapitalisasi: 'beban_langsung', tanggal_siap_guna: null },
    ],
    snapshots: [snapGedungV1, snapKasurV1, snapAcV1, snapAcV2, snapCatV1, snapGensetV1],
    batches: [{ id: 'b2', period_key: '2026-06', status: 'posted' }],
    ledgerEntries: ledgersBatch2,
  })

  assert.equal(tahap4Loc1.completeness.is_complete, true)
  assert.equal(tahap4Loc1.operating_report.approved_capitalized_deduction, 7500000)
  assert.equal(tahap4Loc1.operating_report.approved_direct_expense_allocation, 1200000)
  assert.equal(tahap4Loc1.operating_report.operating_cash_expense, 3000000)
  assert.equal(tahap4Loc1.operating_report.operating_surplus_before_depreciation, 1500000)
  assert.equal(tahap4Loc1.operating_report.depreciation_total_posted, 1125000)
  assert.equal(tahap4Loc1.operating_report.depreciation_business_portion, 710000)
  assert.equal(tahap4Loc1.operating_report.depreciation_non_business_portion, 415000)
  assert.equal(tahap4Loc1.operating_report.net_operating_income, 790000)
  assert.equal(tahap4Loc1.shared_costs.included_in_operating_report, false)
  assert.equal(tahap4Loc1.shared_costs.shared_cash_expense_total, 500000)
  assert.equal(tahap4Loc1.shared_costs.shared_depreciation_business_portion, 100000)
  assert.equal(validateReconciliationBridge(tahap4Loc1).valid, true)

  // 4B. Filter Lokasi 2 (Kos Mawar — Tanpa Ledger pada Batch yang Sah -> Rp 0 Lengkap, BUKAN null!)
  const tahap4Loc2 = evaluatePeriodFinancialReportLocal({
    orgId,
    periodKey: '2026-06',
    locationId: loc2,
    locationName: 'Kos Mawar',
    incomes,
    expenses,
    assets: [],
    components: [],
    snapshots: [snapGedungV1, snapKasurV1, snapAcV2, snapCatV1, snapGensetV1],
    batches: [{ id: 'b2', period_key: '2026-06', status: 'posted' }],
    ledgerEntries: ledgersBatch2,
  })

  assert.equal(tahap4Loc2.completeness.is_complete, true)
  assert.equal(tahap4Loc2.completeness.has_posted_batch, true)
  assert.equal(tahap4Loc2.operating_report.depreciation_total_posted, 0)
  assert.equal(tahap4Loc2.operating_report.depreciation_business_portion, 0)
  assert.equal(tahap4Loc2.operating_report.depreciation_non_business_portion, 0)
  assert.equal(tahap4Loc2.operating_report.net_operating_income, 0)
  assert.equal(validateReconciliationBridge(tahap4Loc2).valid, true)

  // 4C. Filter Semua Lokasi (Konsolidasi Organisasi -> Rp 190.000)
  const tahap4All = evaluatePeriodFinancialReportLocal({
    orgId,
    periodKey: '2026-06',
    locationId: null,
    incomes,
    expenses,
    assets: [
      { id: 'asset-kasur', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 },
      { id: 'asset-ac', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 },
      { id: 'asset-cat', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 },
    ],
    components: [
      { id: 'c-kasur', asset_id: 'asset-kasur', expense_id: 'e2', allocated_cost: 3000000, status_kapitalisasi: 'kapitalisasi', tanggal_siap_guna: '2026-06-15' },
      { id: 'c-ac', asset_id: 'asset-ac', expense_id: 'e3', allocated_cost: 4500000, status_kapitalisasi: 'kapitalisasi', tanggal_siap_guna: '2026-06-18' },
      { id: 'c-cat', asset_id: 'asset-cat', expense_id: 'e4', allocated_cost: 1200000, status_kapitalisasi: 'beban_langsung', tanggal_siap_guna: null },
    ],
    snapshots: [snapGedungV1, snapKasurV1, snapAcV2, snapCatV1, snapGensetV1],
    batches: [{ id: 'b2', period_key: '2026-06', status: 'posted' }],
    ledgerEntries: ledgersBatch2,
  })

  assert.equal(tahap4All.completeness.is_complete, true)
  assert.equal(tahap4All.cash_flow.cash_out, 11000000)
  assert.equal(tahap4All.cash_flow.net_cash_flow, -6500000)
  assert.equal(tahap4All.operating_report.operating_cash_expense, 3500000)
  assert.equal(tahap4All.operating_report.operating_surplus_before_depreciation, 1000000)
  assert.equal(tahap4All.operating_report.depreciation_business_portion, 810000)
  assert.equal(tahap4All.operating_report.net_operating_income, 190000)
  assert.equal(validateReconciliationBridge(tahap4All).valid, true)
})

test('3. Penanganan snapshot lama tanpa data lokasi/alokasi dan komponen dengan allocated_cost IS NULL', () => {
  const orgId = '00000000-0000-0000-0000-000000000001'
  const loc1 = '00000000-0000-0000-0000-000000000011'

  // Snapshot lama sebelum Fase 5B: location_recorded = false, dan snapshot_params belum memuat expense_id/allocated_cost
  const legacySnap = {
    id: 'snap-legacy',
    asset_id: 'asset-legacy',
    version: 1,
    location_id: null,
    location_recorded: false,
    snapshot_params: {
      components: [
        {
          component_id: 'c-legacy',
          biaya_perolehan: 3000000,
        },
      ],
    },
  }

  const reportLegacy = evaluatePeriodFinancialReportLocal({
    orgId,
    periodKey: '2026-06',
    locationId: null,
    incomes: [{ id: 'i1', tanggal: '2026-06-05', jumlah_terima: 5000000, location_id: loc1 }],
    expenses: [{ id: 'e1', tanggal_pengeluaran: '2026-06-10', jumlah_pengeluaran: 3000000, location_id: loc1 }],
    assets: [{ id: 'asset-legacy', status_aset: 'aktif', requires_reapproval: false, location_id: loc1 }],
    components: [
      { id: 'c-legacy', asset_id: 'asset-legacy', expense_id: 'e1', allocated_cost: null, status_kapitalisasi: 'kapitalisasi', tanggal_siap_guna: '2026-06-10' },
    ],
    snapshots: [legacySnap],
    batches: [{ id: 'b-legacy', period_key: '2026-06', status: 'posted' }],
    ledgerEntries: [
      { batch_id: 'b-legacy', snapshot_id: 'snap-legacy', penyusutan_periode_ini: 100000, porsi_usaha_periode_ini: 100000, porsi_non_usaha_periode_ini: 0 },
    ],
  })

  // Snapshot lama tidak boleh dianggap aset bersama atau Rp 0:
  assert.equal(reportLegacy.completeness.is_complete, false)
  assert.equal(reportLegacy.completeness.depreciation_complete, false)
  assert.equal(reportLegacy.completeness.classification_complete, false)
  assert.equal(reportLegacy.completeness.null_allocated_cost_issue_count, 1)
  assert.equal(reportLegacy.completeness.legacy_snapshot_issue_count, 1)
  assert.equal(reportLegacy.operating_report.depreciation_business_portion, null)
  assert.equal(reportLegacy.shared_costs.shared_depreciation_business_portion, null)
  assert.equal(reportLegacy.operating_report.operating_cash_expense, null)
  assert.equal(reportLegacy.operating_report.net_operating_income, null)

  const badge = getReportCompletenessBadge(reportLegacy.completeness)
  assert.equal(badge.status, 'incomplete')
  assert.equal(badge.label, 'Belum Lengkap — Penyusutan & Klasifikasi Tertunda')
  assert.ok(badge.reasons.some((r) => r.code === 'SNAPSHOT_LAMA_BELUM_MEMUAT_METADATA'))
  assert.ok(badge.reasons.some((r) => r.code === 'ALOKASI_BIAYA_BELUM_DIISI'))
})
