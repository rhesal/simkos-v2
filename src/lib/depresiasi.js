/**
 * SimKos — Mesin Perhitungan dan Simulasi Penyusutan Garis Lurus (Fase 3)
 * 
 * Prinsip & Kebijakan:
 * 1. Murni kalkulasi & pratinjau in-memory (tanpa efek samping ke database/pembukuan).
 * 2. Konvensi: Alokasi bulanan dengan prorata hari pada bulan pertama dan sisa fraksi
 *    pada bulan terakhir.
 * 3. Presisi: Aritmetika integer rupiah dengan rekonsiliasi selisih pembulatan total
 *    dan porsi usaha pada periode akhir penyusutan.
 * 4. Penanganan kalender: Perhitungan hari kabisat (Februari 28/29 hari) tanpa pergeseran timezone.
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
export function validateDepreciationInput(component, assetCategory = null) {
  const missing = []
  const errors = []

  // 1. Pengecekan Tanah
  if (assetCategory === 'tanah' || component?.kategori === 'tanah' || component?.jenis_pekerjaan === 'tanah') {
    return {
      status: STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN,
      alasan: 'Tanah memiliki masa manfaat tidak terbatas dan tidak mengalami depresiasi fisik.',
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

  // 4. Pengecekan Metode Penyusutan (Default: garis_lurus)
  const metode = component?.metode_penyusutan || 'garis_lurus'
  if (metode === 'belum_ditentukan') {
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
    if (isNaN(numBiaya) || numBiaya < 0) {
      errors.push('Biaya perolehan harus berupa angka nonnegatif.')
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
    if (!Number.isInteger(numMasa) || numMasa <= 0) {
      errors.push('Masa manfaat harus berupa bilangan bulat positif dalam bulan.')
    }
  }

  // 8. Pengecekan Nilai Sisa (jika diisi)
  const nilaiSisa = component?.nilai_sisa
  if (nilaiSisa !== null && nilaiSisa !== undefined && nilaiSisa !== '') {
    const numSisa = Number(nilaiSisa)
    if (isNaN(numSisa) || numSisa < 0) {
      errors.push('Nilai sisa harus berupa angka nonnegatif.')
    } else if (biaya !== null && biaya !== undefined && Number(biaya) >= 0 && numSisa > Number(biaya)) {
      errors.push('Nilai sisa tidak boleh melebihi biaya perolehan.')
    }
  }

  // 9. Pengecekan Porsi Usaha
  const porsiUsaha = component?.porsi_usaha_persen
  if (porsiUsaha !== null && porsiUsaha !== undefined && porsiUsaha !== '') {
    const numPorsi = Number(porsiUsaha)
    if (isNaN(numPorsi) || numPorsi < 0 || numPorsi > 100) {
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
 * @param {string} [assetCategory] - Kategori aset induk ('gedung', 'barang', 'tanah')
 * @returns {Object} Hasil perhitungan dan jadwal periode
 */
export function calculateComponentDepreciation(component, assetCategory = null) {
  const validation = validateDepreciationInput(component, assetCategory)

  if (!validation.canCalculate) {
    return {
      ...validation,
      komponenId: component?.id || null,
      namaKomponen: component?.nama_komponen || 'Komponen',
      biayaPerolehan: component?.biaya_perolehan ?? null,
      nilaiSisa: component?.nilai_sisa ?? null,
      dasarPenyusutan: null,
      masaManfaatBulan: component?.masa_manfaat_bulan ?? null,
      bebanBulanPenuh: null,
      bebanBulanPertama: null,
      totalPenyusutanUsaha: null,
      porsiUsahaPersen: component?.porsi_usaha_persen ?? null,
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
  const dasarPenyusutan = Math.max(0, biaya - nilaiSisa)
  const M = Number(component.masa_manfaat_bulan)
  const dateParts = parseDateParts(String(component.tanggal_siap_guna))
  const { year: startYear, month: startMonth, day: startDay } = dateParts

  const porsiUsahaRaw = component.porsi_usaha_persen
  const hasPorsiUsaha = porsiUsahaRaw !== null && porsiUsahaRaw !== undefined && porsiUsahaRaw !== ''
  const porsiUsaha = hasPorsiUsaha ? Number(porsiUsahaRaw) : null

  // Kasus Khusus: Biaya sama dengan Nilai Sisa (Dasar Penyusutan Nol)
  if (dasarPenyusutan === 0) {
    const endPeriodDate = addMonths(startYear, startMonth, startDay === 1 ? M - 1 : M)
    return {
      status: STATUS_PERHITUNGAN.DAPAT_DIHITUNG,
      canCalculate: true,
      komponenId: component?.id || null,
      namaKomponen: component?.nama_komponen || 'Komponen',
      biayaPerolehan: biaya,
      nilaiSisa,
      dasarPenyusutan: 0,
      masaManfaatBulan: M,
      bebanBulanPenuh: 0,
      bebanBulanPertama: 0,
      totalPenyusutanUsaha: hasPorsiUsaha ? 0 : null,
      porsiUsahaPersen: porsiUsaha,
      periodeAwal: formatPeriodLabel(startYear, startMonth),
      periodeAkhir: formatPeriodLabel(endPeriodDate.year, endPeriodDate.month),
      isPerluTelaah: component?.status_kapitalisasi === 'perlu_telaah',
      catatanSimulasi: component?.status_kapitalisasi === 'perlu_telaah'
        ? 'Simulasi dengan asumsi dikapitalisasi'
        : null,
      jadwalBulanan: [],
      ringkasanTahunan: [],
    }
  }

  const bebanBulanPenuhTeoritis = dasarPenyusutan / M
  const bebanBulanPenuhBulat = Math.round(bebanBulanPenuhTeoritis)

  const daysInFirstMonth = getDaysInMonth(startYear, startMonth)
  const daysActiveFirstMonth = daysInFirstMonth - startDay + 1
  const fraksiBulanPertama = daysActiveFirstMonth / daysInFirstMonth

  // Jumlah Periode: Tepat M jika hari = 1, atau M + 1 jika hari > 1
  const totalPeriods = startDay === 1 ? M : M + 1
  const jadwalBulanan = []

  // Alokasi Beban Total & Porsi Usaha
  const totalBebanUsahaTarget = hasPorsiUsaha
    ? Math.round(dasarPenyusutan * (porsiUsaha / 100))
    : null

  let akumulasiPenyusutan = 0
  let akumulasiBebanUsaha = 0

  for (let i = 0; i < totalPeriods; i++) {
    const periodIndex = i + 1
    const { year: curYear, month: curMonth } = addMonths(startYear, startMonth, i)
    const periodeKey = formatPeriodKey(curYear, curMonth)
    const periodeLabel = formatPeriodLabel(curYear, curMonth)

    let bebanPeriode = 0

    if (startDay === 1) {
      // Siap guna tanggal 1: M periode penuh
      if (periodIndex < totalPeriods) {
        bebanPeriode = bebanBulanPenuhBulat
      } else {
        // Periode terakhir (M) menyelesaikan sisa pembulatan
        bebanPeriode = dasarPenyusutan - akumulasiPenyusutan
      }
    } else {
      // Siap guna setelah tanggal 1: M + 1 periode
      if (periodIndex === 1) {
        // Periode 1: Memakai fraksi prorata hari pertama
        bebanPeriode = Math.round(bebanBulanPenuhTeoritis * fraksiBulanPertama)
      } else if (periodIndex < totalPeriods) {
        // Periode 2 s/d M: Beban bulan penuh
        bebanPeriode = bebanBulanPenuhBulat
      } else {
        // Periode M + 1: Sisa fraksi dan rekonsiliasi pembulatan akhir
        bebanPeriode = dasarPenyusutan - akumulasiPenyusutan
      }
    }

    // Pastikan beban tidak negatif dan tidak melebihi sisa dasar penyusutan
    bebanPeriode = Math.max(0, bebanPeriode)
    akumulasiPenyusutan += bebanPeriode
    const nilaiBukuAkhir = Math.max(nilaiSisa, biaya - akumulasiPenyusutan)

    // Beban Porsi Usaha
    let bebanUsahaPeriode = null
    if (hasPorsiUsaha) {
      if (porsiUsaha === 0) {
        bebanUsahaPeriode = 0
      } else if (periodIndex < totalPeriods) {
        bebanUsahaPeriode = Math.round(bebanPeriode * (porsiUsaha / 100))
        akumulasiBebanUsaha += bebanUsahaPeriode
      } else {
        // Rekonsiliasi selisih pembulatan usaha pada periode akhir
        bebanUsahaPeriode = totalBebanUsahaTarget - akumulasiBebanUsaha
        akumulasiBebanUsaha += bebanUsahaPeriode
      }
    }

    const isProrata = (startDay > 1) && (periodIndex === 1)
    const isFractionalFinal = (startDay > 1) && (periodIndex === totalPeriods)

    jadwalBulanan.push({
      periodeIndex: periodIndex,
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
    totalPenyusutanUsaha: totalBebanUsahaTarget,
    porsiUsahaPersen: porsiUsaha,
    periodeAwal: firstPeriod ? firstPeriod.periodeLabel : null,
    periodeAkhir: lastPeriod ? lastPeriod.periodeLabel : null,
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
        jumlahBulan: 0,
        bebanPenyusutan: 0,
        bebanUsaha: item.bebanUsaha !== null ? 0 : null,
        akumulasiPenyusutan: 0,
        nilaiBukuAkhir: 0,
      }
    }
    groups[yr].jumlahBulan += 1
    groups[yr].bebanPenyusutan += item.bebanPenyusutan
    if (item.bebanUsaha !== null && groups[yr].bebanUsaha !== null) {
      groups[yr].bebanUsaha += item.bebanUsaha
    }
    groups[yr].akumulasiPenyusutan = item.akumulasiPenyusutan
    groups[yr].nilaiBukuAkhir = item.nilaiBukuAkhir
  }

  return Object.values(groups).sort((a, b) => a.tahun - b.tahun)
}

/**
 * Menghitung penyusutan gabungan untuk seluruh komponen aset.
 * Memisahkan komponen yang dapat dihitung dari komponen yang belum/tidak dapat dihitung.
 * 
 * @param {Array} components - Daftar komponen aset
 * @param {string} [assetCategory] - Kategori aset induk
 * @returns {Object} Hasil agregasi jadwal dan status parsial/lengkap
 */
export function calculateAssetDepreciation(components = [], assetCategory = null) {
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

  // Gabungkan jadwal bulanan per periode kalender (YYYY-MM)
  const monthMap = {}

  for (const item of calculable) {
    for (const entry of item.result.jadwalBulanan) {
      const key = entry.periodeKey
      if (!monthMap[key]) {
        monthMap[key] = {
          periodeKey: key,
          periodeLabel: entry.periodeLabel,
          tahun: entry.tahun,
          bulan: entry.bulan,
          bebanPenyusutan: 0,
          bebanUsaha: allHaveBusinessPortion ? 0 : null,
          komponenBreakdown: [],
        }
      }
      monthMap[key].bebanPenyusutan += entry.bebanPenyusutan
      if (allHaveBusinessPortion && entry.bebanUsaha !== null) {
        monthMap[key].bebanUsaha += entry.bebanUsaha
      }
      monthMap[key].komponenBreakdown.push({
        komponenId: item.result.komponenId,
        namaKomponen: item.result.namaKomponen,
        beban: entry.bebanPenyusutan,
        bebanUsaha: entry.bebanUsaha,
      })
    }
  }

  // Urutkan periode secara kronologis
  const sortedMonthKeys = Object.keys(monthMap).sort()
  const jadwalBulanan = []
  let akumulasiPenyusutan = 0

  for (let i = 0; i < sortedMonthKeys.length; i++) {
    const key = sortedMonthKeys[i]
    const m = monthMap[key]
    akumulasiPenyusutan += m.bebanPenyusutan
    const nilaiBukuAkhir = Math.max(nilaiSisaTotal, biayaTotal - akumulasiPenyusutan)

    jadwalBulanan.push({
      periodeIndex: i + 1,
      periodeKey: m.periodeKey,
      periodeLabel: m.periodeLabel,
      tahun: m.tahun,
      bulan: m.bulan,
      bebanPenyusutan: m.bebanPenyusutan,
      bebanUsaha: m.bebanUsaha,
      akumulasiPenyusutan,
      nilaiBukuAkhir,
      komponenBreakdown: m.komponenBreakdown,
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
