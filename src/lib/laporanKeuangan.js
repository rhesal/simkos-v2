/**
 * SimKos — Modul Laporan Keuangan Terintegrasi (Fase 5B)
 *
 * Memisahkan Laporan Arus Kas (Cash Basis Murni) dan Laporan Hasil Usaha Internal
 * (Berbasis Penerimaan/Pengeluaran Kas dengan Penyesuaian Kapitalisasi Disahkan &
 * Beban Penyusutan Usaha Dibukukan).
 */

import { formatPeriodDisplay } from './pembukuanAset.js'

/**
 * Validasi apakah periodKey berformat bulan kalender penuh YYYY-MM (01..12).
 */
export function isFullMonthPeriodKey(periodKey) {
  if (typeof periodKey !== 'string') return false
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey.trim())
}

/**
 * Menghitung tanggal awal dan tanggal akhir bulan kalender penuh dari YYYY-MM.
 */
export function getFullMonthDateRange(periodKey) {
  if (!isFullMonthPeriodKey(periodKey)) {
    throw new Error('SIMKOS_FULL_MONTH_REQUIRED: Laporan Hasil Usaha Internal hanya tersedia untuk periode satu bulan kalender penuh (format YYYY-MM).')
  }
  const [year, month] = periodKey.trim().split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mStr = String(month).padStart(2, '0')
  const dStr = String(lastDay).padStart(2, '0')
  return {
    startDate: `${year}-${mStr}-01`,
    endDate: `${year}-${mStr}-${dStr}`,
    year,
    month,
    lastDay,
  }
}

/**
 * Memeriksa apakah pasangan startDate dan endDate merupakan satu bulan kalender penuh (YYYY-MM).
 */
export function detectFullMonthFromDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return {
      isFullMonth: false,
      periodKey: null,
      reason: 'Pilih satu bulan kalender penuh (tanggal 1 hingga akhir bulan) untuk melihat Laporan Hasil Usaha Internal.',
    }
  }
  const startMatch = String(startDate).trim().match(/^(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/)
  const endMatch = String(endDate).trim().match(/^(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/)
  if (!startMatch || !endMatch) {
    return {
      isFullMonth: false,
      periodKey: null,
      reason: 'Format rentang tanggal tidak valid untuk periode bulan penuh.',
    }
  }

  const periodKey = `${startMatch[1]}-${startMatch[2]}`
  const endPeriodKey = `${endMatch[1]}-${endMatch[2]}`
  if (periodKey !== endPeriodKey) {
    return {
      isFullMonth: false,
      periodKey: null,
      reason: 'Rentang tanggal melintasi lebih dari satu bulan. Laporan Hasil Usaha Internal hanya tersedia per bulan kalender penuh (YYYY-MM).',
    }
  }

  const { startDate: expectedStart, endDate: expectedEnd } = getFullMonthDateRange(periodKey)
  if (startDate.trim() !== expectedStart || endDate.trim() !== expectedEnd) {
    return {
      isFullMonth: false,
      periodKey: null,
      reason: `Rentang tanggal parsial (${startDate} s/d ${endDate}) hanya mendukung Laporan Arus Kas. Laporan Hasil Usaha Internal memerlukan satu bulan penuh (${expectedStart} s/d ${expectedEnd}).`,
    }
  }

  return {
    isFullMonth: true,
    periodKey,
    reason: null,
  }
}

/**
 * Memanggil RPC resmi get_period_financial_report di server.
 */
export async function fetchPeriodFinancialReport(supabaseClient, {
  orgId,
  periodKey,
  locationId = null,
}) {
  if (!isFullMonthPeriodKey(periodKey)) {
    throw new Error('SIMKOS_FULL_MONTH_REQUIRED: Laporan Hasil Usaha Internal hanya tersedia untuk periode satu bulan kalender penuh (format YYYY-MM).')
  }

  const { data, error } = await supabaseClient.rpc('get_period_financial_report', {
    p_org_id: orgId,
    p_period_key: periodKey.trim(),
    p_location_id: locationId || null,
  })
  if (error) throw error
  return data
}

/**
 * Menghasilkan badge status kelengkapan laporan untuk UI.
 */
export function getReportCompletenessBadge(completeness) {
  if (!completeness) {
    return {
      status: 'incomplete',
      label: 'Belum Lengkap',
      badgeClass: 'badge-warning',
      reasons: [],
    }
  }

  if (completeness.is_complete) {
    if (completeness.period_status === 'locked') {
      return {
        status: 'locked',
        label: 'Lengkap — Periode Penyusutan Terkunci',
        badgeClass: 'badge-locked',
        reasons: [],
      }
    }
    return {
      status: 'complete',
      label: 'Lengkap — Sudah Dibukukan',
      badgeClass: 'badge-complete',
      reasons: [],
    }
  }

  let incompleteLabel = 'Belum Lengkap'
  if (completeness.depreciation_complete === false && completeness.classification_complete === false) {
    incompleteLabel = 'Belum Lengkap — Penyusutan & Klasifikasi Tertunda'
  } else if (completeness.depreciation_complete === false) {
    incompleteLabel = 'Belum Lengkap — Penyusutan Belum Dibukukan'
  } else if (completeness.classification_complete === false) {
    incompleteLabel = 'Belum Lengkap — Klasifikasi Tertunda'
  }

  return {
    status: 'incomplete',
    label: incompleteLabel,
    badgeClass: 'badge-incomplete',
    reasons: Array.isArray(completeness.reasons) ? completeness.reasons : [],
  }
}

/**
 * Memverifikasi invariansi jembatan rekonsiliasi antara Laporan Arus Kas dan Hasil Usaha Internal.
 */
export function validateReconciliationBridge(report) {
  if (!report || !report.cash_flow || !report.operating_report || !report.completeness) {
    return { valid: false, reason: 'Struktur laporan tidak lengkap.' }
  }

  const cf = report.cash_flow
  const op = report.operating_report
  const comp = report.completeness
  const rec = report.reconciliation || {}

  // 1. Arus kas bersih harus selalu kas masuk - kas keluar bruto
  const expectedNetCash = Number(cf.cash_in) - Number(cf.cash_out)
  if (Number(cf.net_cash_flow) !== expectedNetCash) {
    return { valid: false, reason: 'net_cash_flow tidak sama dengan cash_in - cash_out' }
  }

  // 2. Pengeluaran kas operasional referensi = gross_cash_expense - approved_capitalized_deduction
  const expectedRefOpExpense = Number(op.gross_cash_expense) - Number(op.approved_capitalized_deduction)
  if (Number(op.reference_operating_cash_expense) !== expectedRefOpExpense) {
    return { valid: false, reason: 'reference_operating_cash_expense tidak sama dengan gross_cash_expense - approved_capitalized_deduction' }
  }

  // 3. Jika klasifikasi belum lengkap, operating_cash_expense & net_operating_income wajib null
  if (!comp.classification_complete) {
    if (op.operating_cash_expense !== null || op.operating_surplus_before_depreciation !== null || op.net_operating_income !== null) {
      return { valid: false, reason: 'Nilai final hasil usaha harus null ketika classification_complete = false' }
    }
  } else {
    if (Number(op.operating_cash_expense) !== expectedRefOpExpense) {
      return { valid: false, reason: 'operating_cash_expense tidak cocok dengan reference_operating_cash_expense ketika lengkap' }
    }
    const expectedSurplus = Number(op.operating_cash_income) - Number(op.operating_cash_expense)
    if (Number(op.operating_surplus_before_depreciation) !== expectedSurplus) {
      return { valid: false, reason: 'operating_surplus_before_depreciation tidak cocok' }
    }
  }

  // 4. Jika penyusutan belum lengkap (tidak ada batch atau ada reapproval/legacy issue), depreciation_* wajib null
  if (!comp.depreciation_complete) {
    if (
      op.depreciation_total_posted !== null ||
      op.depreciation_business_portion !== null ||
      op.depreciation_non_business_portion !== null ||
      op.net_operating_income !== null
    ) {
      return { valid: false, reason: 'Field penyusutan dan net_operating_income harus null ketika depreciation_complete = false' }
    }
  } else {
    if (
      op.depreciation_total_posted === null ||
      op.depreciation_business_portion === null ||
      op.depreciation_non_business_portion === null
    ) {
      return { valid: false, reason: 'Field penyusutan tidak boleh null ketika depreciation_complete = true (batch nol/lokasi tanpa ledger wajib 0)' }
    }
  }

  // 5. Jika keduanya lengkap, verifikasi jembatan rekonsiliasi penuh:
  // Hasil Usaha Internal Bersih = Arus Kas Bersih + Eliminasi Kapitalisasi Disahkan - Beban Penyusutan Usaha
  if (comp.is_complete) {
    const expectedNetOperatingIncome =
      Number(cf.net_cash_flow) +
      Number(op.approved_capitalized_deduction) -
      Number(op.depreciation_business_portion)

    if (Number(op.net_operating_income) !== expectedNetOperatingIncome) {
      return {
        valid: false,
        reason: `Jembatan rekonsiliasi gagal: ${op.net_operating_income} !== ${expectedNetOperatingIncome}`,
      }
    }
    if (Number(rec.net_operating_income) !== expectedNetOperatingIncome) {
      return {
        valid: false,
        reason: 'reconciliation.net_operating_income tidak sinkron dengan operating_report.net_operating_income',
      }
    }
  } else if (rec.net_operating_income !== null) {
    return {
      valid: false,
      reason: 'reconciliation.net_operating_income harus null ketika laporan belum lengkap',
    }
  }

  return { valid: true, reason: null }
}

/**
 * Mesin evaluator lokal (murni JS) untuk memvalidasi kontrak JSON Fase 5A/5B
 * secara deterministik di unit test tanpa bergantung pada koneksi jaringan.
 */
export function evaluatePeriodFinancialReportLocal({
  orgId,
  periodKey,
  locationId = null,
  locationName = null,
  periodStatus = 'open',
  incomes = [],
  expenses = [],
  allExpensesById = {},
  assets = [],
  components = [],
  snapshots = [],
  batches = [],
  ledgerEntries = [],
}) {
  const { startDate, endDate } = getFullMonthDateRange(periodKey)

  // Map pembantu
  const expMap = { ...allExpensesById }
  for (const e of expenses) {
    if (e && e.id) expMap[e.id] = e
  }

  const assetMap = {}
  for (const a of assets) {
    if (a && a.id) assetMap[a.id] = a
  }

  // Urutkan snapshot per aset berdasarkan version
  const snapshotsByAsset = {}
  const snapshotById = {}
  for (const s of snapshots) {
    if (!s || !s.asset_id) continue
    snapshotById[s.id] = s
    if (!snapshotsByAsset[s.asset_id]) snapshotsByAsset[s.asset_id] = []
    snapshotsByAsset[s.asset_id].push(s)
  }
  for (const aid of Object.keys(snapshotsByAsset)) {
    snapshotsByAsset[aid].sort((a, b) => Number(b.version) - Number(a.version))
  }

  const matchLoc = (loc) => (locationId === null ? true : loc === locationId)
  const inPeriod = (dateStr) => Boolean(dateStr && dateStr >= startDate && dateStr <= endDate)

  // 1. Arus Kas
  const cashIn = incomes
    .filter((inc) => inPeriod(inc.tanggal) && matchLoc(inc.location_id ?? null))
    .reduce((sum, inc) => sum + Number(inc.jumlah_terima || 0), 0)

  const cashOut = expenses
    .filter((exp) => inPeriod(exp.tanggal_pengeluaran) && matchLoc(exp.location_id ?? null))
    .reduce((sum, exp) => sum + Number(exp.jumlah_pengeluaran || 0), 0)

  const sharedCashExpenseTotal = expenses
    .filter((exp) => inPeriod(exp.tanggal_pengeluaran) && (exp.location_id ?? null) === null)
    .reduce((sum, exp) => sum + Number(exp.jumlah_pengeluaran || 0), 0)

  // 2. Snapshot terakhir yang disahkan per aset
  let approvedCapitalizedDeduction = 0
  let approvedDirectExpenseAllocation = 0
  let legacyAllocationIssueCount = 0
  const latestApprovedCompMap = {}

  for (const aid of Object.keys(snapshotsByAsset)) {
    const latestSnap = snapshotsByAsset[aid][0]
    const paramsComponents = Array.isArray(latestSnap?.snapshot_params?.components)
      ? latestSnap.snapshot_params.components
      : []

    for (const elem of paramsComponents) {
      const cid = elem.component_id
      const hasExpenseKey = Object.prototype.hasOwnProperty.call(elem, 'expense_id')
      const hasAllocKey = Object.prototype.hasOwnProperty.call(elem, 'allocated_cost')
      latestApprovedCompMap[cid] = {
        ...elem,
        snapshot_id: latestSnap.id,
        snapshot_version: latestSnap.version,
        has_allocation_metadata: hasExpenseKey && hasAllocKey,
      }

      if (elem.expense_id) {
        const exp = expMap[elem.expense_id]
        if (exp && inPeriod(exp.tanggal_pengeluaran) && matchLoc(exp.location_id ?? null)) {
          if (!hasExpenseKey || !hasAllocKey || elem.allocated_cost === null || elem.allocated_cost === undefined) {
            legacyAllocationIssueCount += 1
          } else if (elem.status_kapitalisasi === 'kapitalisasi') {
            approvedCapitalizedDeduction += Number(elem.allocated_cost)
          } else if (elem.status_kapitalisasi === 'beban_langsung') {
            approvedDirectExpenseAllocation += Number(elem.allocated_cost)
          }
        }
      }
    }
  }

  // 3. Evaluasi masalah klasifikasi tertunda & usulan revisi
  let pendingDraftOrReviewAllocation = 0
  let pendingCapitalizationReapprovalAllocation = 0
  let reapprovalReferenceAmount = 0
  let reapprovalProposedDelta = 0
  let unapprovedNewCount = 0
  let reapprovalCount = 0
  let nullAllocatedCostIssueCount = 0
  let pendingClassificationIssueCount = 0

  for (const c of components) {
    const asset = assetMap[c.asset_id] || {}
    const assetStatus = asset.status_pencatatan || asset.status_aset || 'draft'
    const latestSnapComp = latestApprovedCompMap[c.id] || null
    const curExp = c.expense_id ? expMap[c.expense_id] : null
    const snapExp = latestSnapComp?.expense_id ? expMap[latestSnapComp.expense_id] : null

    const curInScope = Boolean(curExp && inPeriod(curExp.tanggal_pengeluaran) && matchLoc(curExp.location_id ?? null))
    const snapInScope = Boolean(snapExp && inPeriod(snapExp.tanggal_pengeluaran) && matchLoc(snapExp.location_id ?? null))

    if (!curInScope && !snapInScope) continue

    const hasAllocationDiff = Boolean(
      latestSnapComp && (
        (c.expense_id || null) !== (latestSnapComp.expense_id || null) ||
        Number(c.allocated_cost ?? -1) !== Number(latestSnapComp.allocated_cost ?? -1) ||
        c.status_kapitalisasi !== latestSnapComp.status_kapitalisasi
      )
    )
    const anySiblingRequiresReapproval = components.some(
      (other) => other.asset_id === c.asset_id && Boolean(other.requires_reapproval)
    )

    const isPendingIssue =
      assetStatus === 'draft' ||
      Boolean(c.requires_reapproval) ||
      c.status_kapitalisasi === 'perlu_telaah' ||
      Boolean(c.expense_id && (c.allocated_cost === null || c.allocated_cost === undefined)) ||
      !latestSnapComp ||
      !latestSnapComp.has_allocation_metadata ||
      hasAllocationDiff ||
      (assetStatus === 'perlu_pengesahan_ulang' && !anySiblingRequiresReapproval && c.status_kapitalisasi === 'kapitalisasi')

    if (!isPendingIssue) continue

    pendingClassificationIssueCount += 1

    if (
      (curInScope && c.expense_id && (c.allocated_cost === null || c.allocated_cost === undefined)) ||
      (snapInScope &&
        latestSnapComp?.expense_id &&
        (!latestSnapComp.has_allocation_metadata ||
          latestSnapComp.allocated_cost === null ||
          latestSnapComp.allocated_cost === undefined))
    ) {
      nullAllocatedCostIssueCount += 1
    }

    if (!latestSnapComp) {
      if (curInScope) {
        unapprovedNewCount += 1
        if (c.allocated_cost !== null && c.allocated_cost !== undefined) {
          pendingDraftOrReviewAllocation += Number(c.allocated_cost)
        }
      }
    } else {
      reapprovalCount += 1
      const refCap =
        snapInScope && latestSnapComp.has_allocation_metadata
          ? Number(latestSnapComp.allocated_cost || 0)
          : 0
      const propCap =
        curInScope && c.allocated_cost !== null && c.allocated_cost !== undefined
          ? Number(c.allocated_cost)
          : 0
      reapprovalReferenceAmount += refCap
      pendingCapitalizationReapprovalAllocation += propCap

      const curCapOnly =
        curInScope && c.status_kapitalisasi === 'kapitalisasi' ? Number(c.allocated_cost || 0) : 0
      const refCapOnly =
        snapInScope && latestSnapComp.has_allocation_metadata && latestSnapComp.status_kapitalisasi === 'kapitalisasi'
          ? Number(latestSnapComp.allocated_cost || 0)
          : 0
      reapprovalProposedDelta += curCapOnly - refCapOnly
    }
  }

  const totalProposedRevisionAllocation =
    pendingDraftOrReviewAllocation + pendingCapitalizationReapprovalAllocation
  const proposedVsApprovedDelta = reapprovalProposedDelta

  const classificationComplete =
    pendingClassificationIssueCount === 0 &&
    nullAllocatedCostIssueCount === 0 &&
    legacyAllocationIssueCount === 0

  // 4. Evaluasi Batch Penyusutan & Masalah Reapproval/Legacy Location
  const postedBatch = batches.find((b) => b.period_key === periodKey && b.status === 'posted') || null
  const hasPostedBatch = Boolean(postedBatch)

  // Komponen yang memerlukan pengesahan ulang pada periode ini
  let reapprovalAssetIssueCount = 0
  for (const c of components) {
    const asset = assetMap[c.asset_id] || {}
    if (
      c.status_kapitalisasi === 'kapitalisasi' &&
      c.tanggal_siap_guna &&
      c.tanggal_siap_guna <= endDate &&
      (locationId === null || asset.location_id === locationId) &&
      (asset.requires_reapproval || asset.status_aset === 'perlu_pengesahan_ulang')
    ) {
      reapprovalAssetIssueCount += 1
    }
  }

  // Snapshot lama pada ledger batch aktif yang belum memiliki location_recorded = true
  let legacyLocationIssueCount = 0
  if (hasPostedBatch) {
    const activeLedgers = ledgerEntries.filter((l) => l.batch_id === postedBatch.id)
    for (const l of activeLedgers) {
      const snap = snapshotById[l.snapshot_id]
      if (!snap || !snap.location_recorded) {
        legacyLocationIssueCount += 1
      }
    }
  }

  const depreciationComplete =
    hasPostedBatch &&
    reapprovalAssetIssueCount === 0 &&
    legacyLocationIssueCount === 0

  let deprTotalPosted = null
  let deprBusinessPortion = null
  let deprNonBusinessPortion = null
  let sharedDeprTotalPosted = null
  let sharedDeprBusinessPortion = null
  let sharedDeprNonBusinessPortion = null

  if (depreciationComplete) {
    const activeLedgers = ledgerEntries.filter((l) => l.batch_id === postedBatch.id)
    const scopedLedgers = activeLedgers.filter((l) => {
      const snap = snapshotById[l.snapshot_id]
      return snap && snap.location_recorded && matchLoc(snap.location_id ?? null)
    })

    // Batch nol atau lokasi tanpa ledger wajib menghasilkan 0 (bukan null)
    deprTotalPosted = scopedLedgers.reduce((s, l) => s + Number(l.penyusutan_periode_ini || 0), 0)
    deprBusinessPortion = scopedLedgers.reduce((s, l) => s + Number(l.porsi_usaha_periode_ini || 0), 0)
    deprNonBusinessPortion = scopedLedgers.reduce((s, l) => s + Number(l.porsi_non_usaha_periode_ini || 0), 0)

    const sharedLedgers = activeLedgers.filter((l) => {
      const snap = snapshotById[l.snapshot_id]
      return snap && snap.location_recorded && (snap.location_id ?? null) === null
    })
    sharedDeprTotalPosted = sharedLedgers.reduce((s, l) => s + Number(l.penyusutan_periode_ini || 0), 0)
    sharedDeprBusinessPortion = sharedLedgers.reduce((s, l) => s + Number(l.porsi_usaha_periode_ini || 0), 0)
    sharedDeprNonBusinessPortion = sharedLedgers.reduce((s, l) => s + Number(l.porsi_non_usaha_periode_ini || 0), 0)
  }

  // 5. Alasan ketidaklengkapan
  const reasons = []
  if (!hasPostedBatch) {
    reasons.push({
      code: 'PENYUSUTAN_BELUM_DIBUKUKAN',
      message: `Penyusutan periode ${formatPeriodDisplay(periodKey)} (${periodKey}) belum diposting ke Buku Pembantu Penyusutan.`,
    })
  }
  if (reapprovalAssetIssueCount > 0) {
    reasons.push({
      code: 'ASET_PERLU_PENGESAHAN_ULANG',
      message: `Terdapat ${reapprovalAssetIssueCount} komponen aset yang parameternya direvisi dan memerlukan pengesahan ulang.`,
    })
  }
  if (legacyLocationIssueCount > 0 || legacyAllocationIssueCount > 0) {
    reasons.push({
      code: 'SNAPSHOT_LAMA_BELUM_MEMUAT_METADATA',
      message: 'Terdapat snapshot aset versi lama yang belum memuat metadata lokasi atau alokasi pengeluaran. Lakukan pengesahan ulang aset terkait.',
    })
  }
  if (nullAllocatedCostIssueCount > 0) {
    reasons.push({
      code: 'ALOKASI_BIAYA_BELUM_DIISI',
      message: `Terdapat ${nullAllocatedCostIssueCount} komponen terhubung ke pengeluaran yang belum memiliki nilai alokasi biaya (allocated_cost IS NULL).`,
    })
  }
  if (pendingClassificationIssueCount > 0) {
    reasons.push({
      code: 'ALOKASI_KAPITALISASI_BELUM_DISAHKAN',
      message: `Terdapat ${pendingClassificationIssueCount} alokasi komponen pada pengeluaran periode ini yang masih berstatus draft, perlu telaah, atau menunggu pengesahan ulang.`,
    })
  }

  const isComplete = classificationComplete && depreciationComplete
  const refOperatingCashExpense = cashOut - approvedCapitalizedDeduction
  const refOperatingSurplus = cashIn - refOperatingCashExpense

  return {
    org_id: orgId,
    period_key: periodKey,
    location_id: locationId,
    location_name: locationId === null ? 'Semua Lokasi (Konsolidasi Organisasi)' : (locationName || 'Lokasi Terpilih'),
    report_basis_label: 'Laporan Internal — Berbasis Penerimaan/Pengeluaran Kas dengan Penyesuaian Kapitalisasi & Penyusutan (Bukan Akrual Penuh)',
    scope_disclaimer_label:
      locationId !== null
        ? 'Hasil usaha lokasi ini belum mencakup alokasi biaya bersama lintas lokasi (tagihan bersama & penyusutan aset bersama).'
        : 'Laporan konsolidasi organisasi mencakup seluruh lokasi kos dan biaya bersama lintas lokasi.',
    completeness: {
      is_complete: isComplete,
      depreciation_complete: depreciationComplete,
      classification_complete: classificationComplete,
      has_posted_batch: hasPostedBatch,
      posted_batch_id: postedBatch ? postedBatch.id : null,
      period_status: periodStatus,
      pending_classification_issue_count: pendingClassificationIssueCount,
      null_allocated_cost_issue_count: nullAllocatedCostIssueCount,
      reapproval_asset_issue_count: reapprovalAssetIssueCount,
      legacy_snapshot_issue_count: legacyLocationIssueCount + legacyAllocationIssueCount,
      reasons,
    },
    cash_flow: {
      basis: 'cash',
      cash_in: cashIn,
      cash_out: cashOut,
      net_cash_flow: cashIn - cashOut,
    },
    operating_report: {
      basis: 'internal_modified_cash_with_depreciation',
      operating_cash_income: cashIn,
      gross_cash_expense: cashOut,
      approved_capitalized_deduction: approvedCapitalizedDeduction,
      approved_direct_expense_allocation: approvedDirectExpenseAllocation,
      operating_cash_expense: classificationComplete ? refOperatingCashExpense : null,
      reference_operating_cash_expense: refOperatingCashExpense,
      pending_allocations: {
        issue_count: pendingClassificationIssueCount,
        null_allocated_cost_count: nullAllocatedCostIssueCount,
        unapproved_new_count: unapprovedNewCount,
        unapproved_new_amount: pendingDraftOrReviewAllocation,
        pending_draft_or_review_allocation: pendingDraftOrReviewAllocation,
        reapproval_count: reapprovalCount,
        reapproval_reference_amount: reapprovalReferenceAmount,
        reapproval_proposed_amount: pendingCapitalizationReapprovalAllocation,
        pending_capitalization_reapproval_allocation: pendingCapitalizationReapprovalAllocation,
        total_proposed_revision_allocation: totalProposedRevisionAllocation,
        reapproval_proposed_delta: pendingClassificationIssueCount > 0 ? proposedVsApprovedDelta : 0,
        proposed_vs_approved_delta:
          pendingClassificationIssueCount > 0 ? proposedVsApprovedDelta : 0,
      },
      operating_surplus_before_depreciation: classificationComplete ? refOperatingSurplus : null,
      reference_operating_surplus_before_depreciation: refOperatingSurplus,
      depreciation_total_posted: deprTotalPosted,
      depreciation_business_portion: deprBusinessPortion,
      depreciation_non_business_portion: deprNonBusinessPortion,
      net_operating_income: isComplete ? refOperatingSurplus - deprBusinessPortion : null,
    },
    shared_costs: {
      included_in_operating_report: locationId === null,
      shared_cash_expense_total: sharedCashExpenseTotal,
      shared_depreciation_total_posted: sharedDeprTotalPosted,
      shared_depreciation_business_portion: sharedDeprBusinessPortion,
      shared_depreciation_non_business_portion: sharedDeprNonBusinessPortion,
    },
    reconciliation: {
      net_cash_flow: cashIn - cashOut,
      add_back_approved_capitalized_purchases: approvedCapitalizedDeduction,
      less_posted_business_depreciation: deprBusinessPortion,
      net_operating_income: isComplete
        ? (cashIn - cashOut) + approvedCapitalizedDeduction - deprBusinessPortion
        : null,
      excluded_non_business_depreciation: deprNonBusinessPortion,
    },
    allocation_revision_history: [],
  }
}
