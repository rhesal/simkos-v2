/**
 * SimKos — Modul Pembukuan Aset & Buku Pembantu Penyusutan (Fase 4B-2)
 *
 * Mengelola interaksi dengan RPC resmi pembukuan, kalkulasi canonical hash,
 * penanganan idempotensi, translasi pesan error manusiawi, dan navigasi periode.
 */

// ---------------------------------------------------------------------------
// 1. Pure JS MD5 Implementation (Self-Contained, Standar RFC 1321)
// ---------------------------------------------------------------------------
export function md5(str) {
  function safeAdd(x, y) {
    const lsw = (x & 0xffff) + (y & 0xffff)
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16)
    return (msw << 16) | (lsw & 0xffff)
  }
  function bitRol(num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt))
  }
  function md5cmn(q, a, b, x, s, t) {
    return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b)
  }
  function md5ff(a, b, c, d, x, s, t) {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t)
  }
  function md5gg(a, b, c, d, x, s, t) {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t)
  }
  function md5hh(a, b, c, d, x, s, t) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t)
  }
  function md5ii(a, b, c, d, x, s, t) {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t)
  }

  function binlMD5(x, len) {
    x[len >> 5] |= 0x80 << (len % 32)
    x[(((len + 64) >>> 9) << 4) + 14] = len

    let a = 1732584193
    let b = -271733879
    let c = -1732584194
    let d = 271733878

    for (let i = 0; i < x.length; i += 16) {
      const olda = a
      const oldb = b
      const oldc = c
      const oldd = d

      a = md5ff(a, b, c, d, x[i], 7, -680876936)
      d = md5ff(d, a, b, c, x[i + 1], 12, -389564586)
      c = md5ff(c, d, a, b, x[i + 2], 17, 606105819)
      b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330)
      a = md5ff(a, b, c, d, x[i + 4], 7, -176418897)
      d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426)
      c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341)
      b = md5ff(b, c, d, a, x[i + 7], 22, -45705983)
      a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416)
      d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417)
      c = md5ff(c, d, a, b, x[i + 10], 17, -42063)
      b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162)
      a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682)
      d = md5ff(d, a, b, c, x[i + 13], 12, -40341101)
      c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290)
      b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329)

      a = md5gg(a, b, c, d, x[i + 1], 5, -165796510)
      d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632)
      c = md5gg(c, d, a, b, x[i + 11], 14, 643717713)
      b = md5gg(b, c, d, a, x[i], 20, -373897302)
      a = md5gg(a, b, c, d, x[i + 5], 5, -701558691)
      d = md5gg(d, a, b, c, x[i + 10], 9, 38016083)
      c = md5gg(c, d, a, b, x[i + 15], 14, -660478335)
      b = md5gg(b, c, d, a, x[i + 4], 20, -405537848)
      a = md5gg(a, b, c, d, x[i + 9], 5, 568446438)
      d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690)
      c = md5gg(c, d, a, b, x[i + 3], 14, -187363961)
      b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501)
      a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467)
      d = md5gg(d, a, b, c, x[i + 2], 9, -51403784)
      c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473)
      b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734)

      a = md5hh(a, b, c, d, x[i + 5], 4, -378558)
      d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463)
      c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562)
      b = md5hh(b, c, d, a, x[i + 14], 23, -35309556)
      a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060)
      d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353)
      c = md5hh(c, d, a, b, x[i + 7], 16, -155497632)
      b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640)
      a = md5hh(a, b, c, d, x[i + 13], 4, 681279174)
      d = md5hh(d, a, b, c, x[i], 11, -358537222)
      c = md5hh(c, d, a, b, x[i + 3], 16, -722521979)
      b = md5hh(b, c, d, a, x[i + 6], 23, 76029189)
      a = md5hh(a, b, c, d, x[i + 9], 4, -640364487)
      d = md5hh(d, a, b, c, x[i + 12], 11, -421815835)
      c = md5hh(c, d, a, b, x[i + 15], 16, 530742520)
      b = md5hh(b, c, d, a, x[i + 2], 23, -995338651)

      a = md5ii(a, b, c, d, x[i], 6, -198630844)
      d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415)
      c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905)
      b = md5ii(b, c, d, a, x[i + 5], 21, -57434055)
      a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571)
      d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606)
      c = md5ii(c, d, a, b, x[i + 10], 15, -1051523)
      b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799)
      a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359)
      d = md5ii(d, a, b, c, x[i + 15], 10, -30611744)
      c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380)
      b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649)
      a = md5ii(a, b, c, d, x[i + 4], 6, -145523070)
      d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379)
      c = md5ii(c, d, a, b, x[i + 2], 15, 718787259)
      b = md5ii(b, c, d, a, x[i + 9], 21, -343485551)

      a = safeAdd(a, olda)
      b = safeAdd(b, oldb)
      c = safeAdd(c, oldc)
      d = safeAdd(d, oldd)
    }
    return [a, b, c, d]
  }

  function binl2rstr(input) {
    let output = ''
    for (let i = 0; i < input.length * 32; i += 8) {
      output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xff)
    }
    return output
  }

  function rstr2binl(input) {
    const output = Array(input.length >> 2).fill(0)
    for (let i = 0; i < input.length * 8; i += 8) {
      output[i >> 5] |= (input.charCodeAt(i / 8) & 0xff) << (i % 32)
    }
    return output
  }

  function rstr2hex(input) {
    const hexTab = '0123456789abcdef'
    let output = ''
    for (let i = 0; i < input.length; i++) {
      const x = input.charCodeAt(i)
      output += hexTab.charAt((x >>> 4) & 0x0f) + hexTab.charAt(x & 0x0f)
    }
    return output
  }

  const utf8 = unescape(encodeURIComponent(str || ''))
  return rstr2hex(binl2rstr(binlMD5(rstr2binl(utf8), utf8.length * 8)))
}

/**
 * Menghitung canonical payload hash yang identik dengan formula database:
 * md5(p_org_id || '|' || p_period_key || '|' || coalesce(trim(p_notes), ''))
 */
export function getCanonicalPayloadHash(orgId, periodKey, notes = '') {
  const cleanNotes = (notes || '').trim()
  const payloadStr = `${orgId}|${periodKey}|${cleanNotes}`
  return md5(payloadStr)
}

/**
 * Membuat kunci idempotensi untuk pengiriman batch pembukuan.
 */
export function generateIdempotencyKey(orgId, periodKey) {
  const shortOrg = (orgId || 'org').slice(0, 8)
  const cleanPeriod = (periodKey || 'period').replace('-', '')
  const rand = Math.random().toString(36).substring(2, 8)
  return `idemp-${shortOrg}-${cleanPeriod}-${Date.now()}-${rand}`
}

// ---------------------------------------------------------------------------
// 2. Manipulasi & Navigasi Periode (YYYY-MM)
// ---------------------------------------------------------------------------
export function formatPeriodKey(year, month) {
  const m = String(month).padStart(2, '0')
  return `${year}-${m}`
}

export function parsePeriodKey(periodKey) {
  if (!periodKey || !/^\d{4}-\d{2}$/.test(periodKey)) {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() + 1 }
  }
  const [y, m] = periodKey.split('-').map(Number)
  return { year: y, month: m }
}

export function getNextPeriodKey(periodKey) {
  const { year, month } = parsePeriodKey(periodKey)
  if (month === 12) {
    return formatPeriodKey(year + 1, 1)
  }
  return formatPeriodKey(year, month + 1)
}

export function getPrevPeriodKey(periodKey) {
  const { year, month } = parsePeriodKey(periodKey)
  if (month === 1) {
    return formatPeriodKey(year - 1, 12)
  }
  return formatPeriodKey(year, month - 1)
}

export function formatPeriodDisplay(periodKey) {
  if (!periodKey) return '-'
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ]
  const { year, month } = parsePeriodKey(periodKey)
  return `${months[month - 1] || ''} ${year}`
}

// ---------------------------------------------------------------------------
// 3. Ekstraksi Kode Error Server & Human-Readable Error Translators
// ---------------------------------------------------------------------------

/**
 * Mengekstrak kode error kanonis server (misal: SIMKOS_STALE_PREVIEW)
 * secara eksplisit dari objek atau string error Supabase/PostgreSQL.
 */
export function getBookkeepingErrorCode(err) {
  if (!err) return null
  const msg = typeof err === 'string' ? err : (err.message || err.details || JSON.stringify(err))
  const match = msg.match(/\b(SIMKOS_[A-Z0-9_]+)\b/)
  return match ? match[1] : null
}

/**
 * Memeriksa apakah error merupakan penolakan pratinjau kedaluwarsa (SIMKOS_STALE_PREVIEW).
 */
export function isStalePreviewError(err) {
  return getBookkeepingErrorCode(err) === 'SIMKOS_STALE_PREVIEW'
}

export function formatBookkeepingError(err) {
  if (!err) return 'Terjadi kesalahan tidak terduga.'
  const msg = typeof err === 'string' ? err : (err.message || err.details || JSON.stringify(err))
  const code = getBookkeepingErrorCode(err)

  switch (code) {
    case 'SIMKOS_STALE_PREVIEW':
      return 'Pratinjau kedaluwarsa (SIMKOS_STALE_PREVIEW): Parameter aset, komponen, atau saldo awal telah berubah sejak pratinjau dibuat. Pratinjau terbaru telah dimuat; silakan tinjau perubahan nominal dan rincian sebelum mengonfirmasi ulang.'
    case 'SIMKOS_REAPPROVAL_REQUIRED':
      return 'Terdapat aset atau komponen yang memerlukan pengesahan ulang parameter sebelum periode ini dapat dibukukan. Silakan sahkan ulang aset terkait terlebih dahulu.'
    case 'SIMKOS_PERIOD_LOCKED':
      return 'Periode pembukuan ini terkunci dan tidak dapat diubah atau diposting. Buka kunci periode terlebih dahulu jika diperlukan penyesuaian.'
    case 'SIMKOS_GAP_DETECTED': {
      const match = msg.match(/diharapkan berikutnya adalah ([0-9]{4}-[0-9]{2})/)
      const expected = match ? match[1] : 'periode sebelumnya'
      return `Urutan periode tidak valid. Anda harus membukukan periode ${expected} terlebih dahulu secara berurutan.`
    }
    case 'SIMKOS_POSTED_BATCH_EXISTS':
      return 'Masih terdapat batch pembukuan aktif di periode ini atau periode setelahnya. Batalkan (unwind) batch aktif terlebih dahulu sebelum melanjutkan mutasi ini.'
    case 'SIMKOS_NO_SETTINGS':
    case 'SIMKOS_BOOKKEEPING_NOT_CONFIGURED':
      return 'Tanggal mulai pembukuan penyusutan belum dikonfigurasi. Atur tanggal mulai pembukuan terlebih dahulu.'
    case 'SIMKOS_SETTINGS_LOCKED':
      return 'Pengaturan tanggal mulai pembukuan telah dikunci karena sudah ada riwayat pembukuan dan tidak dapat diubah.'
    case 'SIMKOS_NON_CHRONOLOGICAL_REVERSAL':
    case 'SIMKOS_CANNOT_REVERSE_HISTORICAL_BATCH':
      return 'Hanya batch pembukuan aktif terakhir yang dapat dibatalkan. Untuk membatalkan periode sebelumnya, batalkan periode setelahnya secara berurutan.'
    case 'SIMKOS_BATCH_ALREADY_POSTED':
      return 'Periode ini telah memiliki batch posting aktif.'
    case 'SIMKOS_BATCH_NOT_POSTED':
      return 'Batch ini telah dibatalkan sebelumnya.'
    case 'SIMKOS_PERIOD_BEFORE_START':
      return 'Periode yang dipilih berada sebelum tanggal mulai pembukuan organisasi.'
    case 'SIMKOS_FORBIDDEN':
      return 'Akses ditolak: Anda tidak memiliki wewenang untuk tindakan pembukuan ini (khusus Pemilik Kos atau Admin).'
    case 'SIMKOS_LOCKED_STATUS_TRANSITION':
    case 'SIMKOS_DIRECT_ACTIVATION_FORBIDDEN':
    case 'SIMKOS_CANNOT_REVERT_ACTIVE_ASSET':
    case 'SIMKOS_DIRECT_STATUS_CHANGE_FORBIDDEN':
      return 'Status aset terkunci dan tidak dapat diubah secara langsung; gunakan aksi aktivasi atau revisi resmi.'
    case 'SIMKOS_DIRECT_REAPPROVAL_FLAG_UPDATE_FORBIDDEN':
      return 'Penanda pengesahan ulang tidak dapat dimanipulasi secara langsung; hanya diubah melalui aktivasi atau revisi resmi.'
    case 'SIMKOS_LOCKED_FINANCIAL_PARAMETERS':
      return 'Parameter finansial komponen ini telah dibukukan dan terkunci. Gunakan tombol Revisi Parameter setelah membatalkan batch aktif.'
    case 'SIMKOS_LATE_COMPONENT_REQUIRES_UNWIND':
      return 'Komponen baru memiliki tanggal siap guna sebelum posting aktif terakhir. Batalkan (unwind) posting aktif terlebih dahulu untuk memperhitungkan masa lalu komponen ini.'
    case 'SIMKOS_IDEMPOTENCY_PAYLOAD_MISMATCH':
      return 'Kunci permintaan tidak cocok dengan data pembukuan yang dikirim. Coba kembali beberapa saat lagi.'
    case 'SIMKOS_INVALID_PATH':
      return 'Jalur saldo awal tidak valid. Gunakan Simulasi Historis atau Catatan Terdahulu (Manual).'
    case 'SIMKOS_INVALID_MANUAL_ACCUMULATION':
      return 'Akumulasi penyusutan awal manual tidak valid (harus bilangan bulat rupiah antara 0 hingga dasar penyusutan).'
    case 'SIMKOS_INVALID_MANUAL_BUSINESS':
      return 'Akumulasi bagian usaha awal manual tidak valid (harus bilangan bulat rupiah antara 0 hingga akumulasi penyusutan awal).'
    case 'SIMKOS_REVISION_REQUIRED':
      return 'Sisa dasar penyusutan positif namun masa manfaat awal telah habis. Wajib mengisi revisi estimasi sisa masa manfaat (bulan).'
    case 'SIMKOS_REASON_REQUIRED':
      return 'Wajib mencantumkan alasan tertulis untuk tindakan ini.'
    default:
      break
  }

  // Tangani galat jaringan (Failed to fetch / NetworkError)
  if (/failed to fetch|networkerror|network request failed|internetdisconnected/i.test(msg)) {
    return 'Gagal terhubung ke server (respons jaringan terputus). Anda dapat menekan tombol konfirmasi kembali untuk mengirim ulang secara aman dengan kunci idempotensi yang sama.'
  }

  // Bersihkan prefix SIMKOS_* jika ada
  return msg.replace(/^Error:\s*/, '').replace(/^[A-Z0-9_]+:\s*/, '')
}

// ---------------------------------------------------------------------------
// 4. RPC Wrappers Resmi
// ---------------------------------------------------------------------------

export async function fetchBookkeepingSettings(supabaseClient, orgId) {
  const { data, error } = await supabaseClient
    .from('asset_bookkeeping_settings')
    .select('tanggal_mulai_pembukuan')
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw error
  return data?.tanggal_mulai_pembukuan || null
}

export async function setBookkeepingStartDate(supabaseClient, { orgId, startDate }) {
  const { data, error } = await supabaseClient.rpc('set_bookkeeping_start_date', {
    p_org_id: orgId,
    p_start_date: startDate,
  })
  if (error) throw error
  return data
}

export async function previewDepreciationPosting(supabaseClient, { orgId, periodKey }) {
  const { data, error } = await supabaseClient.rpc('preview_depreciation_posting', {
    p_org_id: orgId,
    p_period_key: periodKey,
  })
  if (error) throw error
  return data
}

export async function postDepreciationBatch(supabaseClient, {
  orgId,
  periodKey,
  idempotencyKey,
  payloadHash,
  previewToken,
  notes = '',
}) {
  const { data, error } = await supabaseClient.rpc('post_depreciation_batch', {
    p_org_id: orgId,
    p_period_key: periodKey,
    p_idempotency_key: idempotencyKey,
    p_payload_hash: payloadHash,
    p_preview_token: previewToken,
    p_notes: notes,
  })
  if (error) throw error
  return data
}

export async function reverseDepreciationBatch(supabaseClient, { batchId, reason }) {
  const { data, error } = await supabaseClient.rpc('reverse_depreciation_batch', {
    p_batch_id: batchId,
    p_reason: reason,
  })
  if (error) throw error
  return data
}

export async function lockBookkeepingPeriod(supabaseClient, { orgId, periodKey }) {
  const { data, error } = await supabaseClient.rpc('lock_accounting_period', {
    p_org_id: orgId,
    p_period_key: periodKey,
  })
  if (error) throw error
  return data
}

export async function unlockBookkeepingPeriod(supabaseClient, { orgId, periodKey, reason }) {
  const { data, error } = await supabaseClient.rpc('unlock_accounting_period', {
    p_org_id: orgId,
    p_period_key: periodKey,
    p_reason: reason,
  })
  if (error) throw error
  return data
}

export async function activateAsset(supabaseClient, { assetId, notes = '' }) {
  const { data, error } = await supabaseClient.rpc('activate_asset', {
    p_asset_id: assetId,
    p_activation_notes: notes,
  })
  if (error) throw error
  return data
}

export async function approveComponentOpeningBalance(supabaseClient, {
  componentId,
  jalur,
  akumulasiManual = null,
  sisaBulanManual = null,
  targetUsahaManual = null,
  catatan = '',
}) {
  const { data, error } = await supabaseClient.rpc('approve_component_opening_balance', {
    p_component_id: componentId,
    p_jalur: jalur,
    p_manual_akumulasi: akumulasiManual,
    p_manual_usaha: targetUsahaManual,
    p_revisi_sisa_bulan: sisaBulanManual,
    p_catatan: catatan,
  })
  if (error) throw error
  return data
}

export async function reviseComponentParameters(supabaseClient, {
  componentId,
  biaya,
  nilaiSisa,
  masaManfaat,
  tanggalSiapGuna,
  porsiUsaha,
  metode = 'garis_lurus',
  statusKapitalisasi = 'kapitalisasi',
  notes = '',
}) {
  const { data, error } = await supabaseClient.rpc('revise_component_parameters', {
    p_component_id: componentId,
    p_biaya_perolehan: biaya,
    p_nilai_sisa: nilaiSisa,
    p_masa_manfaat_bulan: masaManfaat,
    p_tanggal_siap_guna: tanggalSiapGuna,
    p_porsi_usaha_persen: porsiUsaha,
    p_metode_penyusutan: metode,
    p_status_kapitalisasi: statusKapitalisasi,
    p_revision_notes: notes,
  })
  if (error) throw error
  return data
}

export async function fetchBatchHistory(supabaseClient, { orgId }) {
  const { data, error } = await supabaseClient
    .from('asset_depreciation_batches')
    .select('*')
    .eq('org_id', orgId)
    .order('period_key', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function fetchBatchLedger(supabaseClient, { batchId }) {
  const { data, error } = await supabaseClient
    .from('asset_depreciation_ledger')
    .select(`
      *,
      assets (
        nama_aset,
        kategori_aset
      ),
      asset_components (
        nama_komponen
      )
    `)
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

export async function fetchPeriodLock(supabaseClient, { orgId, periodKey }) {
  const { data, error } = await supabaseClient
    .from('asset_accounting_periods')
    .select('*')
    .eq('org_id', orgId)
    .eq('period_key', periodKey)
    .eq('status', 'locked')
    .maybeSingle()

  if (error) throw error
  return data || null
}
