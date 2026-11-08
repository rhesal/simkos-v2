/**
 * SimKos — Mesin Perhitungan dan Simulasi Penyusutan Garis Lurus (Fase 3-R)
 * 
 * Prinsip & Kebijakan:
 * 1. Murni kalkulasi & pratinjau in-memory (tanpa efek samping ke database/pembukuan).
 * 2. Konvensi: Alokasi bulanan dengan prorata hari pada bulan pertama dan sisa fraksi
 *    pada bulan terakhir (tepat M periode jika siap guna tgl 1, atau M+1 periode jika siap guna > tgl 1).
 *    Periode ke-(M+1) berakhir tepat pada bulan yang sama dengan bulan mulai (mis. 16 Juni 2026
 *    selama 60 bulan berakhir pada Juni 2031, bukan Juli 2031).
 * 3. Pembagian Pembulatan Kumulatif (Cumulative Target Distribution):
 *    - Beban bulanan dihitung dari selisih target akumulasi teoritis:
 *      A(i) = round(Dasar * W(i) / M), beban[i] = A(i) - A(i - 1).
 *    - Menjamin beban selalu >= 0 (tidak pernah negatif).
 *    - Akumulasi tidak pernah melebihi dasar penyusutan.
 *    - Total akumulasi tepat 100% sama dengan dasar penyusutan tanpa menutupi kesalahan dengan Math.max().
 *    - Beban usaha dihitung proporsional terhadap akumulasi penyusutan aktual:
 *      AU(i) = round(TargetUsaha * A(i) / Dasar), bebanUsaha[i] = AU(i) - AU(i - 1).
 *      Menjamin bebanUsaha[i] <= beban[i] dan total beban usaha tepat sama dengan target porsinya.
 * 4. Pertahanan Ketidakpastian Input:
 *    - Porsi usaha kosong/null tetap null; perhitungan beban usaha menghasilkan "Belum ditentukan".
 *    - Metode penyusutan kosong/belum ditentukan tidak otomatis menjadi garis lurus (status BELUM_DAPAT_DIHITUNG).
 *    - Nominal pecahan (desimal) pada biaya/nilai sisa ditolak dengan pesan jelas; hanya integer rupiah yang diterima.
 *    - Nilai non-finite dan di atas MAX_SAFE_INTEGER ditolak.
 * 5. Nilai Buku Gabungan Berbasis Waktu (Time-based Capitalization):
 *    - Biaya setiap komponen baru masuk ke nilai buku gabungan pada bulan tanggal siap guna komponen tersebut.
 */

export const STATUS_PERHITUNGAN = {
  DAPAT_DIHITUNG: 'DAPAT_DIHITUNG',
  BELUM_DAPAT_DIHITUNG: 'BELUM_DAPAT_DIHITUNG',
  TIDAK_DISUSUTKAN: 'TIDAK_DISUSUTKAN',
  INPUT_TIDAK_VALID: 'INPUT_TIDAK_VALID',
  HASIL_PARSIAL: 'HASIL_PARSIAL',
}

/**
 * Preset umur ekonomis umum sebagai referensi/contoh cepat bagi pengguna.
 * Catatan: Ini bukan aturan pajak mengikat, dapat disesuaikan bebas oleh pengguna.
 */
export const PRESET_UMUR_EKONOMIS = [
  { tahun: 4, bulan: 48, label: '4 Tahun (48 bln)', keterangan: 'Peralatan / barang elektronik' },
  { tahun: 8, bulan: 96, label: '8 Tahun (96 bln)', keterangan: 'Perlengkapan / perabot tahan lama' },
  { tahun: 16, bulan: 192, label: '16 Tahun (192 bln)', keterangan: 'Bangunan semi permanen / renovasi besar' },
  { tahun: 20, bulan: 240, label: '20 Tahun (240 bln)', keterangan: 'Bangunan permanen kos' },
]

/**
 * Daftar nama bulan dalam bahasa Indonesia untuk label periode.
 */
export const NAMA_BULAN = [
  '',
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

/**
 * Menormalkan argumen kategori aset induk baik yang diberikan berupa string maupun objek opsi.
 * @param {string|Object} arg
 * @returns {string|null}
 */
export function normalizeAssetCategory(arg) {
  if (!arg) return null
  if (typeof arg === 'string') return arg.trim().toLowerCase()
  if (typeof arg === 'object') {
    const raw = arg.assetCategory || arg.kategori_aset || arg.category || ''
    return typeof raw === 'string' && raw.trim() !== '' ? raw.trim().toLowerCase() : null
  }
  return null
}

/**
 * Menghitung jumlah hari kalender dalam bulan tertentu (menangani kabisat).
 * @param {number} year - Tahun (mis. 2024, 2026)
 * @param {number} month - Bulan 1-12
 * @returns {number} Jumlah hari (28, 29, 30, atau 31)
 */
export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

/**
 * Memecah string tanggal YYYY-MM-DD secara numerik tanpa pergeseran timezone.
 * @param {string} dateStr 
 * @returns {{ year: number, month: number, day: number } | null}
 */
export function parseDateParts(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  const parts = dateStr.trim().split('-')
  if (parts.length !== 3) return null
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null
  if (month < 1 || month > 12) return null
  const maxDay = getDaysInMonth(year, month)
  if (day < 1 || day > maxDay) return null
  return { year, month, day }
}

/**
 * Menghasilkan string periode YYYY-MM dan label "Bulan Tahun".
 */
export function formatPeriodKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function formatPeriodLabel(year, month) {
  return `${NAMA_BULAN[month]} ${year}`
}

/**
 * Memajukan tahun dan bulan sebanyak delta bulan.
 */
export function addMonths(year, month, delta) {
  const totalMonths = (year * 12 + (month - 1)) + delta
  const newYear = Math.floor(totalMonths / 12)
  const newMonth = (totalMonths % 12) + 1
  return { year: newYear, month: newMonth }
}

/**
 * Memvalidasi kelayakan input penyusutan komponen aset.
 */
export function validateDepreciationInput(component, assetCategoryArg = null) {
  const missing = []
  const errors = []
  const assetCategory = normalizeAssetCategory(assetCategoryArg)

  // 1. Pengecekan Tanah
  if (assetCategory === 'tanah' || component?.kategori === 'tanah' || component?.jenis_pekerjaan === 'tanah') {
    return {
      status: STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN,
      alasan: 'Tanah memiliki masa manfaat tidak terbatas dan tidak mengalami penyusutan.',
      canCalculate: false,
      missingFields: [],
      errors: [],
    }
  }

  // 2. Pengecekan Beban Langsung
  if (component?.status_kapitalisasi === 'beban_langsung') {
    return {
      status: STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN,
      alasan: 'Komponen diklasifikasikan sebagai beban langsung (tidak dikapitalisasi ke nilai aset).',
      canCalculate: false,
      missingFields: [],
      errors: [],
    }
  }

  // 3. Pengecekan Metode Tidak Disusutkan
  if (component?.metode_penyusutan === 'tidak_disusutkan') {
    return {
      status: STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN,
      alasan: 'Komponen ditandai tidak disusutkan oleh pengguna.',
      canCalculate: false,
      missingFields: [],
      errors: [],
    }
  }

  // 4. Pengecekan Metode Penyusutan (TIDAK otomatis menjadi garis_lurus jika kosong/belum ditentukan)
  const metode = component?.metode_penyusutan
  if (!metode || metode === 'belum_ditentukan') {
    missing.push('Metode penyusutan belum ditentukan')
  } else if (metode !== 'garis_lurus') {
    errors.push(`Metode penyusutan '${metode}' tidak didukung (hanya garis_lurus).`)
  }

  // 5. Pengecekan Biaya Perolehan
  const biaya = component?.biaya_perolehan
  if (biaya === null || biaya === undefined || biaya === '') {
    missing.push('Biaya perolehan')
  } else if (typeof biaya === 'number' && isNaN(biaya)) {
    missing.push('Biaya perolehan')
  } else {
    const numBiaya = Number(biaya)
    if (!Number.isFinite(numBiaya)) {
      errors.push('Biaya perolehan harus berupa angka berhingga (finite).')
    } else if (numBiaya < 0) {
      errors.push('Biaya perolehan harus berupa angka nonnegatif.')
    } else if (numBiaya > Number.MAX_SAFE_INTEGER) {
      errors.push('Biaya perolehan melebihi batas angka aman sistem.')
    } else if (!Number.isInteger(numBiaya)) {
      errors.push('Biaya perolehan harus berupa bilangan bulat rupiah tanpa pecahan desimal.')
    }
  }

  // 6. Pengecekan Tanggal Siap Guna
  const tanggalSiapGuna = component?.tanggal_siap_guna
  if (!tanggalSiapGuna || String(tanggalSiapGuna).trim() === '') {
    missing.push('Tanggal siap guna lengkap')
  } else {
    const parsed = parseDateParts(String(tanggalSiapGuna))
    if (!parsed) {
      errors.push('Format tanggal siap guna tidak valid (harus YYYY-MM-DD lengkap).')
    }
  }

  // 7. Pengecekan Masa Manfaat Bulan
  const masaManfaat = component?.masa_manfaat_bulan
  if (masaManfaat === null || masaManfaat === undefined || masaManfaat === '') {
    missing.push('Masa manfaat (bulan)')
  } else {
    const numMasa = Number(masaManfaat)
    if (!Number.isFinite(numMasa)) {
      errors.push('Masa manfaat harus berupa angka berhingga.')
    } else if (!Number.isInteger(numMasa) || numMasa <= 0) {
      errors.push('Masa manfaat harus berupa bilangan bulat positif dalam bulan.')
    } else if (numMasa > 1200) {
      errors.push('Masa manfaat melebihi batas maksimal yang didukung (1200 bulan / 100 tahun).')
    }
  }

  // 8. Pengecekan Nilai Sisa (jika diisi)
  const nilaiSisa = component?.nilai_sisa
  if (nilaiSisa !== null && nilaiSisa !== undefined && nilaiSisa !== '') {
    const numSisa = Number(nilaiSisa)
    if (!Number.isFinite(numSisa)) {
      errors.push('Nilai sisa harus berupa angka berhingga (finite).')
    } else if (numSisa < 0) {
      errors.push('Nilai sisa harus berupa angka nonnegatif.')
    } else if (numSisa > Number.MAX_SAFE_INTEGER) {
      errors.push('Nilai sisa melebihi batas angka aman sistem.')
    } else if (!Number.isInteger(numSisa)) {
      errors.push('Nilai sisa harus berupa bilangan bulat rupiah tanpa pecahan desimal.')
    } else if (biaya !== null && biaya !== undefined && Number.isFinite(Number(biaya)) && numSisa > Number(biaya)) {
      errors.push('Nilai sisa tidak boleh melebihi biaya perolehan.')
    }
  }

  // 9. Pengecekan Porsi Usaha
  const porsiUsaha = component?.porsi_usaha_persen
  if (porsiUsaha !== null && porsiUsaha !== undefined && porsiUsaha !== '') {
    const numPorsi = Number(porsiUsaha)
    if (!Number.isFinite(numPorsi) || numPorsi < 0 || numPorsi > 100) {
      errors.push('Porsi usaha harus berupa angka antara 0% dan 100%.')
    }
  }

  // Klasifikasi Status Hasil
  if (errors.length > 0) {
    return {
      status: STATUS_PERHITUNGAN.INPUT_TIDAK_VALID,
      canCalculate: false,
      missingFields: missing,
      errors,
    }
  }

  if (missing.length > 0) {
    return {
      status: STATUS_PERHITUNGAN.BELUM_DAPAT_DIHITUNG,
      canCalculate: false,
      missingFields: missing,
      errors: [],
    }
  }

  return {
    status: STATUS_PERHITUNGAN.DAPAT_DIHITUNG,
    canCalculate: true,
    missingFields: [],
    errors: [],
  }
}

/**
 * Menghitung jadwal penyusutan garis lurus untuk satu komponen aset.
 * 
 * @param {Object} component - Data komponen aset
 * @param {string|Object} [assetCategoryArg] - Kategori aset induk ('gedung', 'barang', 'tanah') atau opsi
 * @returns {Object} Hasil perhitungan dan jadwal periode
 */
export function calculateComponentDepreciation(component, assetCategoryArg = null) {
  const assetCategory = normalizeAssetCategory(assetCategoryArg)
  const validation = validateDepreciationInput(component, assetCategory)

  if (!validation.canCalculate) {
    return {
      ...validation,
      komponenId: component?.id || null,
      namaKomponen: component?.nama_komponen || 'Komponen',
      biayaPerolehan: component?.biaya_perolehan !== null && component?.biaya_perolehan !== undefined
        ? Number(component.biaya_perolehan)
        : null,
      nilaiSisa: component?.nilai_sisa !== null && component?.nilai_sisa !== undefined
        ? Number(component.nilai_sisa)
        : null,
      dasarPenyusutan: null,
      masaManfaatBulan: component?.masa_manfaat_bulan ? Number(component.masa_manfaat_bulan) : null,
      bebanBulanPenuh: null,
      bebanBulanPertama: null,
      bebanUsahaBulanPenuh: null,
      totalPenyusutanUsaha: null,
      porsiUsahaPersen: (component?.porsi_usaha_persen !== null && component?.porsi_usaha_persen !== undefined && component?.porsi_usaha_persen !== '')
        ? Number(component.porsi_usaha_persen)
        : null,
      periodeAwal: null,
      periodeAkhir: null,
      isPerluTelaah: component?.status_kapitalisasi === 'perlu_telaah',
      catatanSimulasi: component?.status_kapitalisasi === 'perlu_telaah'
        ? 'Simulasi dengan asumsi dikapitalisasi'
        : null,
      jadwalBulanan: [],
      ringkasanTahunan: [],
    }
  }

  const biaya = Number(component.biaya_perolehan)
  const nilaiSisa = Number(component.nilai_sisa || 0)
  const dasarPenyusutan = biaya - nilaiSisa
  const M = Number(component.masa_manfaat_bulan)
  const dateParts = parseDateParts(String(component.tanggal_siap_guna))
  const { year: startYear, month: startMonth, day: startDay } = dateParts

  const porsiUsahaRaw = component.porsi_usaha_persen
  const hasPorsiUsaha = porsiUsahaRaw !== null && porsiUsahaRaw !== undefined && porsiUsahaRaw !== ''
  const porsiUsaha = hasPorsiUsaha ? Number(porsiUsahaRaw) : null

  // Konvensi Periode & Prorata
  const daysInFirstMonth = getDaysInMonth(startYear, startMonth)
  const daysActiveFirstMonth = daysInFirstMonth - startDay + 1
  const fraksiBulanPertama = daysActiveFirstMonth / daysInFirstMonth

  // Total periode bulanan kalender:
  // - Jika siap guna tgl 1: tepat M periode
  // - Jika siap guna > tgl 1: tepat M + 1 periode (periode ke-(M+1) jatuh di bulan yang sama dengan bulan mulai)
  const totalPeriods = startDay === 1 ? M : M + 1
  const jadwalBulanan = []

  // Target Beban Usaha Total
  const totalBebanUsahaTarget = hasPorsiUsaha
    ? Math.round(dasarPenyusutan * (porsiUsaha / 100))
    : null

  let prevAkumulasi = 0
  let prevAkumulasiUsaha = 0

  for (let i = 1; i <= totalPeriods; i++) {
    const deltaBulan = i - 1
    const { year: curYear, month: curMonth } = addMonths(startYear, startMonth, deltaBulan)
    const periodeKey = formatPeriodKey(curYear, curMonth)
    const periodeLabel = formatPeriodLabel(curYear, curMonth)

    // Bobot kumulatif W(i)
    let W
    if (startDay === 1) {
      W = i
    } else {
      if (i === 1) {
        W = fraksiBulanPertama
      } else if (i <= M) {
        W = fraksiBulanPertama + (i - 1)
      } else {
        // Periode M + 1: Menyelesaikan fraksi sisa
        W = M
      }
    }

    // Target akumulasi teoritis pada periode i (Bresenham Cumulative Target)
    const targetAkumulasi = dasarPenyusutan === 0 ? 0 : Math.round(dasarPenyusutan * (W / M))
    const bebanPeriode = targetAkumulasi - prevAkumulasi
    prevAkumulasi = targetAkumulasi

    const akumulasiPenyusutan = targetAkumulasi
    const nilaiBukuAkhir = biaya - akumulasiPenyusutan

    // Beban Porsi Usaha
    let bebanUsahaPeriode = null
    if (hasPorsiUsaha) {
      if (totalBebanUsahaTarget === 0 || dasarPenyusutan === 0) {
        bebanUsahaPeriode = 0
      } else {
        // AU(i) = round(TargetUsaha * A(i) / Dasar)
        // Sifat matematis: menjamin bebanUsaha >= 0, bebanUsaha <= bebanPeriode,
        // jika bebanPeriode == 0 maka bebanUsaha == 0, dan total akumulasi tepat = totalBebanUsahaTarget
        const targetAkumulasiUsaha = Math.round(totalBebanUsahaTarget * (targetAkumulasi / dasarPenyusutan))
        bebanUsahaPeriode = targetAkumulasiUsaha - prevAkumulasiUsaha
        prevAkumulasiUsaha = targetAkumulasiUsaha
      }
    }

    const isProrata = (startDay > 1) && (i === 1)
    const isFractionalFinal = (startDay > 1) && (i === totalPeriods)

    jadwalBulanan.push({
      periodeIndex: i,
      periodeKey,
      periodeLabel,
      tahun: curYear,
      bulan: curMonth,
      bebanPenyusutan: bebanPeriode,
      bebanUsaha: bebanUsahaPeriode,
      akumulasiPenyusutan,
      nilaiBukuAkhir,
      isProrata,
      hariProrata: isProrata ? daysActiveFirstMonth : null,
      totalHariBulan: isProrata ? daysInFirstMonth : null,
      isFractionalFinal,
    })
  }

  const firstPeriod = jadwalBulanan[0]
  const lastPeriod = jadwalBulanan[jadwalBulanan.length - 1]
  const ringkasanTahunan = generateAnnualSummary(jadwalBulanan)

  // Estimasi beban bulan penuh untuk kartu ringkasan
  const bebanBulanPenuhBulat = dasarPenyusutan === 0 ? 0 : Math.round(dasarPenyusutan / M)
  const bebanUsahaBulanPenuh = hasPorsiUsaha
    ? (dasarPenyusutan === 0 ? 0 : Math.round((dasarPenyusutan / M) * (porsiUsaha / 100)))
    : null

  // Indikator Posisi Bulan Berjalan (jika tanggal mulai di masa lalu)
  const now = new Date()
  const currentKey = formatPeriodKey(now.getFullYear(), now.getMonth() + 1)
  let posisiBulanIni = null

  if (firstPeriod && firstPeriod.periodeKey <= currentKey) {
    const currentRow = [...jadwalBulanan].reverse().find(r => r.periodeKey <= currentKey)
    if (currentRow) {
      const isDone = currentKey >= lastPeriod.periodeKey
      posisiBulanIni = {
        currentPeriodKey: currentKey,
        currentPeriodLabel: formatPeriodLabel(now.getFullYear(), now.getMonth() + 1),
        akumulasiPenyusutan: isDone ? dasarPenyusutan : currentRow.akumulasiPenyusutan,
        nilaiBuku: isDone ? nilaiSisa : currentRow.nilaiBukuAkhir,
        sisaBulan: isDone ? 0 : Math.max(0, totalPeriods - currentRow.periodeIndex),
        isFullyDepreciated: isDone,
      }
    }
  }

  return {
    status: STATUS_PERHITUNGAN.DAPAT_DIHITUNG,
    canCalculate: true,
    komponenId: component?.id || null,
    namaKomponen: component?.nama_komponen || 'Komponen',
    biayaPerolehan: biaya,
    nilaiSisa,
    dasarPenyusutan,
    masaManfaatBulan: M,
    bebanBulanPenuh: bebanBulanPenuhBulat,
    bebanBulanPertama: firstPeriod ? firstPeriod.bebanPenyusutan : 0,
    bebanUsahaBulanPenuh,
    totalPenyusutanUsaha: totalBebanUsahaTarget,
    porsiUsahaPersen: porsiUsaha,
    startPeriodKey: firstPeriod ? firstPeriod.periodeKey : formatPeriodKey(startYear, startMonth),
    endPeriodKey: lastPeriod ? lastPeriod.periodeKey : null,
    periodeAwal: firstPeriod ? firstPeriod.periodeLabel : formatPeriodLabel(startYear, startMonth),
    periodeAkhir: lastPeriod ? lastPeriod.periodeLabel : null,
    tanggalSelesai: lastPeriod ? lastPeriod.periodeLabel : null,
    totalPeriods,
    posisiBulanIni,
    isPerluTelaah: component?.status_kapitalisasi === 'perlu_telaah',
    catatanSimulasi: component?.status_kapitalisasi === 'perlu_telaah'
      ? 'Simulasi dengan asumsi dikapitalisasi'
      : null,
    jadwalBulanan,
    ringkasanTahunan,
  }
}

/**
 * Menghasilkan ringkasan penyusutan tahunan dari jadwal bulanan.
 */
export function generateAnnualSummary(monthlySchedule = []) {
  if (!monthlySchedule || monthlySchedule.length === 0) return []

  const groups = {}
  for (const item of monthlySchedule) {
    const yr = item.tahun
    if (!groups[yr]) {
      groups[yr] = {
        tahun: yr,
        bulanCount: 0,
        bebanTahunan: 0,
        bebanUsahaTahunan: item.bebanUsaha !== null ? 0 : null,
        akumulasiAkhirTahun: 0,
        nilaiBukuAkhirTahun: 0,
      }
    }
    groups[yr].bulanCount += 1
    groups[yr].bebanTahunan += item.bebanPenyusutan
    if (item.bebanUsaha !== null && groups[yr].bebanUsahaTahunan !== null) {
      groups[yr].bebanUsahaTahunan += item.bebanUsaha
    } else if (item.bebanUsaha === null) {
      groups[yr].bebanUsahaTahunan = null
    }
    groups[yr].akumulasiAkhirTahun = item.akumulasiPenyusutan
    groups[yr].nilaiBukuAkhirTahun = item.nilaiBukuAkhir
  }

  return Object.values(groups).sort((a, b) => a.tahun - b.tahun)
}

/**
 * Menghitung penyusutan gabungan untuk seluruh komponen aset.
 * Menerapkan nilai buku berbasis waktu (biaya setiap komponen masuk ke nilai buku
 * pada bulan tanggal siap guna / perolehan masing-masing komponen).
 * 
 * @param {Array} components - Daftar komponen aset
 * @param {string|Object} [assetCategoryArg] - Kategori aset induk
 * @returns {Object} Hasil agregasi jadwal dan status parsial/lengkap
 */
export function calculateAssetDepreciation(components = [], assetCategoryArg = null) {
  const assetCategory = normalizeAssetCategory(assetCategoryArg)

  if (assetCategory === 'tanah') {
    return {
      status: STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN,
      alasan: 'Tanah memiliki masa manfaat tidak terbatas dan tidak mengalami penyusutan.',
      canCalculate: false,
      isPartial: false,
      totalKomponen: components.length,
      komponenTerhitung: 0,
      biayaTotal: components.reduce((acc, c) => acc + (Number(c.biaya_perolehan) || 0), 0),
      nilaiSisaTotal: components.reduce((acc, c) => acc + (Number(c.nilai_sisa) || 0), 0),
      dasarPenyusutanTotal: 0,
      bebanBulanPenuhTotal: 0,
      totalPenyusutanUsaha: 0,
      jadwalBulanan: [],
      ringkasanTahunan: [],
      komponenResults: [],
      missingComponents: [],
    }
  }

  if (!components || components.length === 0) {
    return {
      status: STATUS_PERHITUNGAN.BELUM_DAPAT_DIHITUNG,
      alasan: 'Aset belum memiliki komponen perolehan atau pengembangan.',
      canCalculate: false,
      isPartial: false,
      totalKomponen: 0,
      komponenTerhitung: 0,
      biayaTotal: 0,
      nilaiSisaTotal: 0,
      dasarPenyusutanTotal: 0,
      bebanBulanPenuhTotal: 0,
      totalPenyusutanUsaha: null,
      jadwalBulanan: [],
      ringkasanTahunan: [],
      komponenResults: [],
      missingComponents: [],
    }
  }

  const results = components.map(c => ({
    komponen: c,
    result: calculateComponentDepreciation(c, assetCategory),
  }))

  const calculable = results.filter(r => r.result.canCalculate)
  const missing = results.filter(r => !r.result.canCalculate && r.result.status !== STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN)
  const notDepreciable = results.filter(r => r.result.status === STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN)

  // Jika tidak ada komponen yang dapat disusutkan sama sekali
  if (calculable.length === 0) {
    if (notDepreciable.length === components.length) {
      return {
        status: STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN,
        alasan: 'Semua komponen pada aset ini ditandai tidak disusutkan atau beban langsung.',
        canCalculate: false,
        isPartial: false,
        totalKomponen: components.length,
        komponenTerhitung: 0,
        biayaTotal: components.reduce((acc, c) => acc + (Number(c.biaya_perolehan) || 0), 0),
        nilaiSisaTotal: components.reduce((acc, c) => acc + (Number(c.nilai_sisa) || 0), 0),
        dasarPenyusutanTotal: 0,
        bebanBulanPenuhTotal: 0,
        totalPenyusutanUsaha: 0,
        jadwalBulanan: [],
        ringkasanTahunan: [],
        komponenResults: results,
        missingComponents: [],
      }
    }

    return {
      status: STATUS_PERHITUNGAN.BELUM_DAPAT_DIHITUNG,
      alasan: 'Parameter penyusutan pada seluruh komponen belum lengkap.',
      canCalculate: false,
      isPartial: false,
      totalKomponen: components.length,
      komponenTerhitung: 0,
      biayaTotal: null,
      nilaiSisaTotal: null,
      dasarPenyusutanTotal: null,
      bebanBulanPenuhTotal: null,
      totalPenyusutanUsaha: null,
      jadwalBulanan: [],
      ringkasanTahunan: [],
      komponenResults: results,
      missingComponents: missing.map(m => ({
        nama: m.komponen.nama_komponen || 'Komponen',
        missing: m.result.missingFields || m.result.errors || [],
      })),
    }
  }

  const isPartial = missing.length > 0
  const status = isPartial ? STATUS_PERHITUNGAN.HASIL_PARSIAL : STATUS_PERHITUNGAN.DAPAT_DIHITUNG

  // Agregasi nilai dasar dari komponen yang terhitung
  const biayaTotal = calculable.reduce((acc, r) => acc + r.result.biayaPerolehan, 0)
  const nilaiSisaTotal = calculable.reduce((acc, r) => acc + r.result.nilaiSisa, 0)
  const dasarPenyusutanTotal = calculable.reduce((acc, r) => acc + r.result.dasarPenyusutan, 0)
  const bebanBulanPenuhTotal = calculable.reduce((acc, r) => acc + r.result.bebanBulanPenuh, 0)

  // Total porsi usaha hanya ada jika semua komponen yang terhitung memiliki porsi usaha
  const allHaveBusinessPortion = calculable.every(r => r.result.porsiUsahaPersen !== null)
  const totalPenyusutanUsaha = allHaveBusinessPortion
    ? calculable.reduce((acc, r) => acc + (r.result.totalPenyusutanUsaha || 0), 0)
    : null

  // Helper untuk mendapatkan seluruh periode antara dua kunci periode YYYY-MM
  function getPeriodKeysBetween(startKey, endKey) {
    if (!startKey) return []
    if (!endKey || startKey > endKey) return [startKey]
    const keys = []
    const [sY, sM] = startKey.split('-').map(Number)
    const [eY, eM] = endKey.split('-').map(Number)
    let curY = sY
    let curM = sM
    while (curY < eY || (curY === eY && curM <= eM)) {
      keys.push(formatPeriodKey(curY, curM))
      const next = addMonths(curY, curM, 1)
      curY = next.year
      curM = next.month
    }
    return keys
  }

  // Bangun lookup cepat entry per komponen: map[komponenId][periodeKey]
  const compScheduleMap = new Map()
  for (const item of calculable) {
    const m = new Map()
    for (const entry of (item.result.jadwalBulanan || [])) {
      m.set(entry.periodeKey, entry)
    }

    const compDateParts = item.komponen?.tanggal_siap_guna
      ? parseDateParts(String(item.komponen.tanggal_siap_guna))
      : null

    const fallbackStartKey = compDateParts
      ? formatPeriodKey(compDateParts.year, compDateParts.month)
      : ''

    const startKey = item.result.startPeriodKey ||
      (item.result.jadwalBulanan && item.result.jadwalBulanan[0]?.periodeKey) ||
      fallbackStartKey

    const endKey = item.result.endPeriodKey ||
      (item.result.jadwalBulanan && item.result.jadwalBulanan[item.result.jadwalBulanan.length - 1]?.periodeKey) ||
      startKey

    compScheduleMap.set(item.result.komponenId || item.komponen.id, {
      result: item.result,
      komponen: item.komponen,
      map: m,
      startKey,
      endKey,
    })
  }

  // Kumpulkan seluruh periode bulan kalender unik yang ada di komponen-komponen terhitung
  // Memastikan aktivasi seluruh komponen tercakup meskipun jadwal komponen tertentu kosong
  const allPeriodKeysSet = new Set()
  for (const [compId, compInfo] of compScheduleMap.entries()) {
    for (const entry of (compInfo.result.jadwalBulanan || [])) {
      allPeriodKeysSet.add(entry.periodeKey)
    }
    if (compInfo.startKey && compInfo.endKey) {
      for (const k of getPeriodKeysBetween(compInfo.startKey, compInfo.endKey)) {
        allPeriodKeysSet.add(k)
      }
    } else if (compInfo.startKey) {
      allPeriodKeysSet.add(compInfo.startKey)
    }
  }
  const sortedMonthKeys = Array.from(allPeriodKeysSet).sort()

  // Bangun jadwal bulanan gabungan berbasis waktu kapitalisasi
  const jadwalBulanan = []
  let akumulasiPenyusutanBerjalan = 0

  for (let i = 0; i < sortedMonthKeys.length; i++) {
    const key = sortedMonthKeys[i]
    const [yearStr, monthStr] = key.split('-')
    const curYear = parseInt(yearStr, 10)
    const curMonth = parseInt(monthStr, 10)
    const periodeLabel = formatPeriodLabel(curYear, curMonth)

    let bebanBulanIni = 0
    let bebanUsahaBulanIni = allHaveBusinessPortion ? 0 : null
    let biayaAktifBulanIni = 0
    let nilaiBukuAkhirBulanIni = 0
    const breakdown = []

    for (const [compId, compInfo] of compScheduleMap.entries()) {
      // Komponen baru masuk ke nilai buku jika bulan ini >= tanggal siap guna / periode awal komponen
      if (compInfo.startKey && key >= compInfo.startKey) {
        biayaAktifBulanIni += compInfo.result.biayaPerolehan

        const entry = compInfo.map.get(key)
        if (entry) {
          // Komponen sedang dalam masa penyusutan aktif di bulan ini
          bebanBulanIni += entry.bebanPenyusutan
          if (allHaveBusinessPortion && entry.bebanUsaha !== null) {
            bebanUsahaBulanIni += entry.bebanUsaha
          }
          nilaiBukuAkhirBulanIni += entry.nilaiBukuAkhir
          breakdown.push({
            komponenId: compId,
            namaKomponen: compInfo.result.namaKomponen,
            beban: entry.bebanPenyusutan,
            bebanUsaha: entry.bebanUsaha,
            nilaiBuku: entry.nilaiBukuAkhir,
          })
        } else if (compInfo.endKey && key > compInfo.endKey) {
          // Komponen sudah selesai disusutkan sebelum bulan ini; nilai bukunya adalah nilai sisa
          nilaiBukuAkhirBulanIni += compInfo.result.nilaiSisa
        } else if (compInfo.result.dasarPenyusutan === 0) {
          // Komponen dasar penyusutan 0 di masa aktif tanpa entry khusus
          nilaiBukuAkhirBulanIni += compInfo.result.nilaiSisa
          breakdown.push({
            komponenId: compId,
            namaKomponen: compInfo.result.namaKomponen,
            beban: 0,
            bebanUsaha: allHaveBusinessPortion ? 0 : null,
            nilaiBuku: compInfo.result.nilaiSisa,
          })
        }
      }
    }

    akumulasiPenyusutanBerjalan += bebanBulanIni

    jadwalBulanan.push({
      periodeIndex: i + 1,
      periodeKey: key,
      periodeLabel,
      tahun: curYear,
      bulan: curMonth,
      bebanPenyusutan: bebanBulanIni,
      bebanUsaha: bebanUsahaBulanIni,
      akumulasiPenyusutan: akumulasiPenyusutanBerjalan,
      biayaAktif: biayaAktifBulanIni,
      nilaiBukuAkhir: nilaiBukuAkhirBulanIni,
      komponenBreakdown: breakdown,
    })
  }

  const ringkasanTahunan = generateAnnualSummary(jadwalBulanan)

  return {
    status,
    canCalculate: true,
    isPartial,
    labelParsial: isPartial
      ? `Hasil parsial: ${calculable.length} dari ${components.length} komponen dapat dihitung`
      : null,
    totalKomponen: components.length,
    komponenTerhitung: calculable.length,
    biayaTotal,
    nilaiSisaTotal,
    dasarPenyusutanTotal,
    bebanBulanPenuhTotal,
    totalPenyusutanUsaha,
    periodeAwal: jadwalBulanan[0]?.periodeLabel || null,
    periodeAkhir: jadwalBulanan[jadwalBulanan.length - 1]?.periodeLabel || null,
    jadwalBulanan,
    ringkasanTahunan,
    komponenResults: results,
    missingComponents: missing.map(m => ({
      nama: m.komponen.nama_komponen || 'Komponen',
      missing: m.result.missingFields || m.result.errors || [],
    })),
  }
}
