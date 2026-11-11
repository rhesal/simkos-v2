import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateComponentDepreciation,
  calculateAssetDepreciation,
  validateDepreciationInput,
  normalizeAssetCategory,
  STATUS_PERHITUNGAN,
  getDaysInMonth,
  parseDateParts,
} from '../../src/lib/depresiasi.js'
import {
  getBookkeepingErrorCode,
  isStalePreviewError,
  formatBookkeepingError,
  getCanonicalPayloadHash,
} from '../../src/lib/pembukuanAset.js'

test('Mesin Penyusutan Garis Lurus (Fase 3-R): Kontrak, Pembulatan, & Rekonsiliasi Presisi', async (t) => {
  // ---------------------------------------------------------------------------
  // 1. Helper Kalender
  // ---------------------------------------------------------------------------
  await t.test('1. Helper Kalender: Perhitungan Hari & Kabisat Akurat', () => {
    assert.strictEqual(getDaysInMonth(2024, 2), 29, 'Februari 2024 (kabisat) harus 29 hari')
    assert.strictEqual(getDaysInMonth(2026, 2), 28, 'Februari 2026 (non-kabisat) harus 28 hari')
    assert.strictEqual(getDaysInMonth(2026, 6), 30, 'Juni 2026 harus 30 hari')
    assert.strictEqual(getDaysInMonth(2026, 7), 31, 'Juli 2026 harus 31 hari')

    const p = parseDateParts('2026-06-16')
    assert.deepStrictEqual(p, { year: 2026, month: 6, day: 16 })
  })

  // ---------------------------------------------------------------------------
  // 2. Fixture 1: AC Rp6.500.000, Sisa Rp500.000, 60 Bulan, Siap Guna Tgl 1
  // ---------------------------------------------------------------------------
  await t.test('2. Fixture 1: AC Rp6.5M, sisa Rp500k, 60 bulan, mulai tanggal 1 (tepat M periode)', () => {
    const comp = {
      nama_komponen: 'AC Daikin 1 PK',
      biaya_perolehan: 6500000,
      nilai_sisa: 500000,
      masa_manfaat_bulan: 60,
      tanggal_siap_guna: '2026-06-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
    }
    const res = calculateComponentDepreciation(comp)

    assert.strictEqual(res.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.strictEqual(res.dasarPenyusutan, 6000000)
    assert.strictEqual(res.jadwalBulanan.length, 60, 'Mulai tanggal 1 harus tepat 60 periode')
    assert.strictEqual(res.periodeAwal, 'Juni 2026')
    assert.strictEqual(res.periodeAkhir, 'Mei 2031')

    const totalBeban = res.jadwalBulanan.reduce((sum, r) => sum + r.bebanPenyusutan, 0)
    assert.strictEqual(totalBeban, 6000000, 'Total beban penyusutan harus tepat Rp6.000.000')

    const last = res.jadwalBulanan[res.jadwalBulanan.length - 1]
    assert.strictEqual(last.nilaiBukuAkhir, 500000, 'Nilai buku akhir harus tepat sama dengan nilai sisa')
    assert.strictEqual(res.totalPenyusutanUsaha, 6000000)
  })

  // ---------------------------------------------------------------------------
  // 3. Fixture 2: Dasar Rp6.000.000, 60 Bulan, Siap Guna 16 Juni 2026
  // ---------------------------------------------------------------------------
  await t.test('3. Fixture 2: Dasar Rp6.000.000, 60 bulan, siap guna 16 Juni 2026 (M+1 periode, selesai Juni 2031)', () => {
    const comp = {
      nama_komponen: 'AC Inverter',
      biaya_perolehan: 6000000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 60,
      tanggal_siap_guna: '2026-06-16',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
    }
    const res = calculateComponentDepreciation(comp)

    assert.strictEqual(res.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.strictEqual(res.totalPeriods, 61, 'Harus 61 periode (M+1)')
    assert.strictEqual(res.periodeAwal, 'Juni 2026')
    assert.strictEqual(res.periodeAkhir, 'Juni 2031', 'Periode terakhir harus Juni 2031 (bukan Juli 2031)')

    // Periode 1: 15 hari dari 30 hari Juni = 50% * 100.000 = Rp50.000
    const row1 = res.jadwalBulanan[0]
    assert.strictEqual(row1.bebanPenyusutan, 50000)
    assert.strictEqual(row1.isProrata, true)
    assert.strictEqual(row1.hariProrata, 15)

    // Periode 2: Juli 2026 (bulan penuh) = Rp100.000
    const row2 = res.jadwalBulanan[1]
    assert.strictEqual(row2.bebanPenyusutan, 100000)

    // Periode 61: Juni 2031 (sisa fraksi) = Rp50.000
    const row61 = res.jadwalBulanan[60]
    assert.strictEqual(row61.periodeLabel, 'Juni 2031')
    assert.strictEqual(row61.bebanPenyusutan, 50000)
    assert.strictEqual(row61.isFractionalFinal, true)

    // Total akumulasi persis Rp6.000.000
    const totalBeban = res.jadwalBulanan.reduce((sum, r) => sum + r.bebanPenyusutan, 0)
    assert.strictEqual(totalBeban, 6000000)
    assert.strictEqual(row61.nilaiBukuAkhir, 0)
  })

  // ---------------------------------------------------------------------------
  // 4. Fixture 3: Dasar Rp3.600.000, 36 Bulan, Siap Guna 31 Januari 2026
  // ---------------------------------------------------------------------------
  await t.test('4. Fixture 3: Dasar Rp3.6M, 36 bulan, siap guna 31 Januari 2026', () => {
    const comp = {
      nama_komponen: 'Perlengkapan Kantor',
      biaya_perolehan: 3600000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 36,
      tanggal_siap_guna: '2026-01-31',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
    }
    const res = calculateComponentDepreciation(comp)

    assert.strictEqual(res.jadwalBulanan.length, 37)
    assert.strictEqual(res.periodeAwal, 'Januari 2026')
    assert.strictEqual(res.periodeAkhir, 'Januari 2029')

    // Januari 2026: 1 hari aktif dari 31 hari
    const row1 = res.jadwalBulanan[0]
    assert.strictEqual(row1.bebanPenyusutan, Math.round((3600000 / 36) * (1 / 31))) // Rp3.226

    const totalBeban = res.jadwalBulanan.reduce((s, r) => s + r.bebanPenyusutan, 0)
    assert.strictEqual(totalBeban, 3600000)
  })

  // ---------------------------------------------------------------------------
  // 5. Fixture 4: Dasar Rp12.000.000, 48 Bulan, Siap Guna 29 Februari 2024
  // ---------------------------------------------------------------------------
  await t.test('5. Fixture 4: Dasar Rp12M, 48 bulan, siap guna 29 Februari 2024 (kabisat)', () => {
    const comp = {
      nama_komponen: 'Genset Kos',
      biaya_perolehan: 12000000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 48,
      tanggal_siap_guna: '2024-02-29',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
    }
    const res = calculateComponentDepreciation(comp)

    assert.strictEqual(res.jadwalBulanan.length, 49)
    assert.strictEqual(res.periodeAwal, 'Februari 2024')
    assert.strictEqual(res.periodeAkhir, 'Februari 2028')

    // Februari 2024: 1 hari aktif dari 29 hari
    const row1 = res.jadwalBulanan[0]
    assert.strictEqual(row1.bebanPenyusutan, Math.round((12000000 / 48) * (1 / 29))) // Rp8.621

    const totalBeban = res.jadwalBulanan.reduce((s, r) => s + r.bebanPenyusutan, 0)
    assert.strictEqual(totalBeban, 12000000)
  })

  // ---------------------------------------------------------------------------
  // 6. Fixture 5: Bangunan Rp600.000.000, 240 Bulan, Usaha 60%
  // ---------------------------------------------------------------------------
  await t.test('6. Fixture 5: Bangunan Rp600M, 240 bulan, porsi usaha 60%', () => {
    const comp = {
      nama_komponen: 'Gedung Utama',
      biaya_perolehan: 600000000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 240,
      tanggal_siap_guna: '2020-01-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 60,
    }
    const res = calculateComponentDepreciation(comp)

    assert.strictEqual(res.bebanBulanPenuh, 2500000)
    assert.strictEqual(res.bebanUsahaBulanPenuh, 1500000)
    assert.strictEqual(res.totalPenyusutanUsaha, 360000000)

    const totalUsaha = res.jadwalBulanan.reduce((s, r) => s + r.bebanUsaha, 0)
    assert.strictEqual(totalUsaha, 360000000)
  })

  // ---------------------------------------------------------------------------
  // 7. Butir 1: Regresi Nilai Kecil & Pembagian Pembulatan Kumulatif
  // ---------------------------------------------------------------------------
  await t.test('7. Regresi Butir 1: Dasar Rp60 & Rp120 / 120 bulan dengan Porsi Usaha 50% (Tgl 1 & Parsial)', () => {
    // Skenario A: Dasar Rp60, 120 bulan, porsi usaha 50%, mulai tgl 1
    const comp60 = {
      biaya_perolehan: 60,
      nilai_sisa: 0,
      masa_manfaat_bulan: 120,
      tanggal_siap_guna: '2026-01-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 50,
    }
    const res60 = calculateComponentDepreciation(comp60)
    assert.strictEqual(res60.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.strictEqual(res60.jadwalBulanan.length, 120)

    // Invariants Skenario A
    let sumB60 = 0
    let sumU60 = 0
    for (const row of res60.jadwalBulanan) {
      assert.ok(row.bebanPenyusutan >= 0, 'Beban tidak boleh negatif')
      assert.ok(row.bebanUsaha >= 0, 'Beban usaha tidak boleh negatif')
      assert.ok(row.bebanUsaha <= row.bebanPenyusutan, 'Beban usaha tidak boleh melebihi beban penyusutan')
      sumB60 += row.bebanPenyusutan
      sumU60 += row.bebanUsaha
      assert.ok(sumB60 <= 60, 'Akumulasi tidak boleh melebihi dasar penyusutan')
    }
    assert.strictEqual(sumB60, 60, 'Total beban jadwal harus persis Rp60')
    assert.strictEqual(sumU60, 30, 'Total beban usaha harus persis Rp30 (50% dari 60)')

    // Skenario B: Dasar Rp120, 120 bulan, porsi usaha 50%, mulai tgl 1
    const comp120 = {
      biaya_perolehan: 120,
      nilai_sisa: 0,
      masa_manfaat_bulan: 120,
      tanggal_siap_guna: '2026-01-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 50,
    }
    const res120 = calculateComponentDepreciation(comp120)
    assert.strictEqual(res120.jadwalBulanan.length, 120)
    let sumB120 = 0
    let sumU120 = 0
    for (const row of res120.jadwalBulanan) {
      assert.ok(row.bebanPenyusutan >= 0)
      assert.ok(row.bebanUsaha >= 0)
      assert.ok(row.bebanUsaha <= row.bebanPenyusutan)
      sumB120 += row.bebanPenyusutan
      sumU120 += row.bebanUsaha
    }
    assert.strictEqual(sumB120, 120, 'Total beban jadwal harus persis Rp120')
    assert.strictEqual(sumU120, 60, 'Total beban usaha harus persis Rp60 (50% dari 120)')

    // Skenario C: Dasar Rp60, 120 bulan, porsi usaha 50%, mulai parsial (16 Juni 2026)
    const comp60Parsial = {
      biaya_perolehan: 60,
      nilai_sisa: 0,
      masa_manfaat_bulan: 120,
      tanggal_siap_guna: '2026-06-16',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 50,
    }
    const res60P = calculateComponentDepreciation(comp60Parsial)
    assert.strictEqual(res60P.jadwalBulanan.length, 121, 'Mulai parsial harus tepat 121 periode (M+1)')
    assert.strictEqual(res60P.periodeAwal, 'Juni 2026')
    assert.strictEqual(res60P.periodeAkhir, 'Juni 2036', 'Periode akhir harus Juni 2036')

    let sumB60P = 0
    let sumU60P = 0
    for (const row of res60P.jadwalBulanan) {
      assert.ok(row.bebanPenyusutan >= 0)
      assert.ok(row.bebanUsaha >= 0)
      assert.ok(row.bebanUsaha <= row.bebanPenyusutan)
      sumB60P += row.bebanPenyusutan
      sumU60P += row.bebanUsaha
    }
    assert.strictEqual(sumB60P, 60)
    assert.strictEqual(sumU60P, 30)

    // Skenario D: Dasar Rp120, 120 bulan, porsi usaha 50%, mulai parsial (16 Juni 2026)
    const comp120Parsial = {
      biaya_perolehan: 120,
      nilai_sisa: 0,
      masa_manfaat_bulan: 120,
      tanggal_siap_guna: '2026-06-16',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 50,
    }
    const res120P = calculateComponentDepreciation(comp120Parsial)
    assert.strictEqual(res120P.jadwalBulanan.length, 121)
    let sumB120P = 0
    let sumU120P = 0
    for (const row of res120P.jadwalBulanan) {
      assert.ok(row.bebanPenyusutan >= 0)
      assert.ok(row.bebanUsaha >= 0)
      assert.ok(row.bebanUsaha <= row.bebanPenyusutan)
      sumB120P += row.bebanPenyusutan
      sumU120P += row.bebanUsaha
    }
    assert.strictEqual(sumB120P, 120)
    assert.strictEqual(sumU120P, 60)
  })

  // ---------------------------------------------------------------------------
  // 8. Butir 2: Pertahankan Ketidakpastian Input & Validasi Angka Ketat
  // ---------------------------------------------------------------------------
  await t.test('8. Butir 2: Porsi Usaha NULL vs 0%, Metode Kosong, dan Validasi Desimal', () => {
    // 8.1 Porsi usaha null tetap null, beban usaha null (Belum ditentukan)
    const compNull = {
      biaya_perolehan: 6000000,
      masa_manfaat_bulan: 60,
      tanggal_siap_guna: '2026-06-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: null,
    }
    const resNull = calculateComponentDepreciation(compNull)
    assert.strictEqual(resNull.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.strictEqual(resNull.porsiUsahaPersen, null)
    assert.strictEqual(resNull.totalPenyusutanUsaha, null)
    assert.strictEqual(resNull.bebanUsahaBulanPenuh, null)
    assert.strictEqual(resNull.jadwalBulanan[0].bebanUsaha, null)

    // 8.2 Porsi usaha 0% menghasilkan beban usaha 0
    const compZero = { ...compNull, porsi_usaha_persen: 0 }
    const resZero = calculateComponentDepreciation(compZero)
    assert.strictEqual(resZero.porsiUsahaPersen, 0)
    assert.strictEqual(resZero.totalPenyusutanUsaha, 0)
    assert.strictEqual(resZero.jadwalBulanan[0].bebanUsaha, 0)

    // 8.3 Metode penyusutan kosong / belum ditentukan TIDAK otomatis jadi garis lurus
    const compNoMetode = {
      biaya_perolehan: 6000000,
      masa_manfaat_bulan: 60,
      tanggal_siap_guna: '2026-06-01',
      metode_penyusutan: null,
    }
    const resNoMetode = calculateComponentDepreciation(compNoMetode)
    assert.strictEqual(resNoMetode.status, STATUS_PERHITUNGAN.BELUM_DAPAT_DIHITUNG)
    assert.ok(resNoMetode.missingFields.includes('Metode penyusutan belum ditentukan'))

    const compBelum = { ...compNoMetode, metode_penyusutan: 'belum_ditentukan' }
    const resBelum = calculateComponentDepreciation(compBelum)
    assert.strictEqual(resBelum.status, STATUS_PERHITUNGAN.BELUM_DAPAT_DIHITUNG)

    // 8.4 Penolakan pecahan desimal pada biaya dan nilai sisa
    const compDesimal = {
      biaya_perolehan: 6000000.75,
      masa_manfaat_bulan: 60,
      tanggal_siap_guna: '2026-06-01',
      metode_penyusutan: 'garis_lurus',
    }
    const resDesimal = calculateComponentDepreciation(compDesimal)
    assert.strictEqual(resDesimal.status, STATUS_PERHITUNGAN.INPUT_TIDAK_VALID)
    assert.ok(resDesimal.errors.some(e => e.includes('tanpa pecahan desimal')))

    // 8.5 Penolakan nonfinite (Infinity / NaN) dan batas angka aman
    const compInf = {
      biaya_perolehan: Infinity,
      masa_manfaat_bulan: 60,
      tanggal_siap_guna: '2026-06-01',
      metode_penyusutan: 'garis_lurus',
    }
    const resInf = calculateComponentDepreciation(compInf)
    assert.strictEqual(resInf.status, STATUS_PERHITUNGAN.INPUT_TIDAK_VALID)

    const compBig = {
      biaya_perolehan: Number.MAX_SAFE_INTEGER + 1000,
      masa_manfaat_bulan: 60,
      tanggal_siap_guna: '2026-06-01',
      metode_penyusutan: 'garis_lurus',
    }
    const resBig = calculateComponentDepreciation(compBig)
    assert.strictEqual(resBig.status, STATUS_PERHITUNGAN.INPUT_TIDAK_VALID)
  })

  // ---------------------------------------------------------------------------
  // 9. Butir 3: Selaras Argumen Kategori (String & Opsi Objek)
  // ---------------------------------------------------------------------------
  await t.test('9. Butir 3: Penanganan Kategori Tanah via String & Opsi Objek', () => {
    const comp = {
      nama_komponen: 'Bidang Tanah Kos',
      biaya_perolehan: 500000000,
      masa_manfaat_bulan: 240,
      tanggal_siap_guna: '2026-01-01',
      metode_penyusutan: 'garis_lurus',
    }

    // Pemanggilan dengan string
    const resStr = calculateComponentDepreciation(comp, 'tanah')
    assert.strictEqual(resStr.status, STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN)

    // Pemanggilan dengan objek opsi assetCategory
    const resObj = calculateComponentDepreciation(comp, { assetCategory: 'tanah' })
    assert.strictEqual(resObj.status, STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN)

    // Pemanggilan dengan objek opsi kategori_aset
    const resKategori = calculateComponentDepreciation(comp, { kategori_aset: 'tanah' })
    assert.strictEqual(resKategori.status, STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN)

    // Agregasi aset tanah
    const resAsset = calculateAssetDepreciation([comp], { assetCategory: 'tanah' })
    assert.strictEqual(resAsset.status, STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN)
  })

  // ---------------------------------------------------------------------------
  // 10. Butir 4: Nilai Buku Gabungan Berbasis Waktu (Time-based Capitalization)
  // ---------------------------------------------------------------------------
  await t.test('10. Butir 4: Nilai Buku Gabungan Berbasis Waktu Kapitalisasi', () => {
    // Komponen 1: Bangunan awal Rp500 jt, 240 bulan, mulai 2020-01-01
    const compAwal = {
      id: 'comp-1',
      nama_komponen: 'Pembangunan Awal',
      biaya_perolehan: 500000000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 240,
      tanggal_siap_guna: '2020-01-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
    }

    // Komponen 2: Renovasi Tambah Lantai Rp200 jt, 120 bulan, baru siap guna 2024-01-01 (4 tahun kemudian)
    const compRenov = {
      id: 'comp-2',
      nama_komponen: 'Renovasi Lantai 2',
      biaya_perolehan: 200000000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 120,
      tanggal_siap_guna: '2024-01-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
    }

    const resGabungan = calculateAssetDepreciation([compAwal, compRenov], 'gedung')
    assert.strictEqual(resGabungan.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.strictEqual(resGabungan.biayaTotal, 700000000)

    // Cek periode 2020-01 (Bulan pertama):
    // Komponen 2 BELUM aktif; biaya aktif harus Rp500.000.000 (bukan Rp700.000.000!)
    const row2020_01 = resGabungan.jadwalBulanan.find(r => r.periodeKey === '2020-01')
    assert.ok(row2020_01, 'Harus ada periode 2020-01')
    assert.strictEqual(row2020_01.biayaAktif, 500000000, 'Pada 2020-01 biaya aktif hanya Rp500M')
    // Beban bulanan awal = 500M / 240 = Rp2.083.333
    assert.strictEqual(row2020_01.bebanPenyusutan, Math.round(500000000 / 240))
    assert.strictEqual(row2020_01.nilaiBukuAkhir, 500000000 - row2020_01.bebanPenyusutan)

    // Cek periode 2023-12 (Tepat sebelum renovasi masuk):
    // Biaya aktif masih Rp500.000.000
    const row2023_12 = resGabungan.jadwalBulanan.find(r => r.periodeKey === '2023-12')
    assert.strictEqual(row2023_12.biayaAktif, 500000000)

    // Cek periode 2024-01 (Renovasi masuk):
    // Biaya aktif sekarang menjadi Rp700.000.000!
    const row2024_01 = resGabungan.jadwalBulanan.find(r => r.periodeKey === '2024-01')
    assert.strictEqual(row2024_01.biayaAktif, 700000000, 'Pada 2024-01 biaya aktif melonjak jadi Rp700M')

    // Beban bulan 2024-01 adalah beban Komponen 1 + beban Komponen 2
    const bebanComp1 = Math.round(500000000 / 240)
    const bebanComp2 = Math.round(200000000 / 120)
    assert.strictEqual(row2024_01.bebanPenyusutan, bebanComp1 + bebanComp2)

    // Nilai buku 2024-01 mencerminkan penambahan nilai kapitalisasi dari renovasi
    const resAwalSolo = calculateComponentDepreciation(compAwal)
    const resRenovSolo = calculateComponentDepreciation(compRenov)
    const nbAwalSolo = resAwalSolo.jadwalBulanan.find(r => r.periodeKey === '2024-01').nilaiBukuAkhir
    const nbRenovSolo = resRenovSolo.jadwalBulanan.find(r => r.periodeKey === '2024-01').nilaiBukuAkhir
    assert.strictEqual(row2024_01.nilaiBukuAkhir, nbAwalSolo + nbRenovSolo, 'Nilai buku gabungan aditif linear dengan komponen')
  })

  // ---------------------------------------------------------------------------
  // 11. Butir 1 & 2: Komponen Dasar Nol & Kalender Gabungan Termasuk Aktivasi Komponen
  // ---------------------------------------------------------------------------
  await t.test('11. Butir 1 & 2: Komponen Dasar Nol & Kalender Gabungan Termasuk Aktivasi Komponen', () => {
    // 11.1 Komponen tunggal dengan biaya == nilai sisa (dasar 0)
    const compNol = {
      id: 'comp-nol-1',
      nama_komponen: 'Partisi Knockdown Khusus',
      biaya_perolehan: 15000000,
      nilai_sisa: 15000000,
      masa_manfaat_bulan: 36,
      tanggal_siap_guna: '2026-06-16',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
    }
    const resNol = calculateComponentDepreciation(compNol)
    assert.strictEqual(resNol.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.strictEqual(resNol.dasarPenyusutan, 0)
    assert.strictEqual(resNol.bebanBulanPenuh, 0)
    assert.strictEqual(resNol.totalPeriods, 37, 'Prorata 16 Juni 2026 selama 36 bln -> 37 periode')
    assert.strictEqual(resNol.periodeAwal, 'Juni 2026')
    assert.strictEqual(resNol.periodeAkhir, 'Juni 2029')
    assert.strictEqual(resNol.jadwalBulanan.length, 37)
    assert.ok(resNol.jadwalBulanan.every(r => r.bebanPenyusutan === 0 && r.nilaiBukuAkhir === 15000000))

    // 11.2 Regresi Contoh A/B:
    // Komponen A (dasar > 0) aktif 2026-06-01 (60 bln -> selesai Mei 2031)
    // Komponen B (dasar == 0) aktif 2027-01-01 (60 bln -> selesai Desember 2031)
    const compA = {
      id: 'comp-a',
      nama_komponen: 'AC Sentral Utama',
      biaya_perolehan: 120000000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 60,
      tanggal_siap_guna: '2026-06-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
    }
    const compB = {
      id: 'comp-b',
      nama_komponen: 'Jaminan / Perlengkapan Khusus',
      biaya_perolehan: 30000000,
      nilai_sisa: 30000000,
      masa_manfaat_bulan: 60,
      tanggal_siap_guna: '2027-01-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
    }

    const resAB = calculateAssetDepreciation([compA, compB], 'barang')
    assert.strictEqual(resAB.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.strictEqual(resAB.biayaTotal, 150000000)
    assert.strictEqual(resAB.dasarPenyusutanTotal, 120000000)

    // Kalender gabungan harus membentang dari Juni 2026 sampai Desember 2031 (mencakup aktivasi Komponen B)
    assert.strictEqual(resAB.jadwalBulanan[0].periodeKey, '2026-06')
    const lastRowAB = resAB.jadwalBulanan[resAB.jadwalBulanan.length - 1]
    assert.strictEqual(lastRowAB.periodeKey, '2031-12', 'Kalender gabungan harus mencapai Desember 2031')

    // Pada 2026-06, biaya aktif hanya Komponen A (Rp120.000.000)
    const row2026_06 = resAB.jadwalBulanan.find(r => r.periodeKey === '2026-06')
    assert.strictEqual(row2026_06.biayaAktif, 120000000)

    // Pada 2027-01, Komponen B aktif sehingga biaya aktif menjadi Rp150.000.000
    const row2027_01 = resAB.jadwalBulanan.find(r => r.periodeKey === '2027-01')
    assert.strictEqual(row2027_01.biayaAktif, 150000000)
    assert.strictEqual(row2027_01.bebanPenyusutan, 2000000, 'Beban penyusutan hanya dari Komponen A (120M / 60 bln)')

    // Pada 2031-06 (setelah Komponen A selesai di Mei 2031):
    // Komponen A telah habis disusutkan (nilai sisa 0), Komponen B masih aktif dengan nilai buku Rp30M
    const row2031_06 = resAB.jadwalBulanan.find(r => r.periodeKey === '2031-06')
    assert.ok(row2031_06, 'Periode 2031-06 harus ada di kalender gabungan')
    assert.strictEqual(row2031_06.bebanPenyusutan, 0, 'Komponen A sudah selesai, Komponen B beban 0')
    assert.strictEqual(row2031_06.nilaiBukuAkhir, 30000000, 'Nilai buku akhir mencerminkan Komponen B yang masih aktif')

    // 11.3 Aset yang seluruh komponennya memiliki biaya sama dengan nilai sisa (dasar 0)
    const compAllZero1 = {
      id: 'comp-z1',
      nama_komponen: 'Perlengkapan Awal',
      biaya_perolehan: 20000000,
      nilai_sisa: 20000000,
      masa_manfaat_bulan: 24,
      tanggal_siap_guna: '2026-01-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
    }
    const compAllZero2 = {
      id: 'comp-z2',
      nama_komponen: 'Perlengkapan Tambahan',
      biaya_perolehan: 10000000,
      nilai_sisa: 10000000,
      masa_manfaat_bulan: 24,
      tanggal_siap_guna: '2026-07-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
    }

    const resAllZero = calculateAssetDepreciation([compAllZero1, compAllZero2], 'barang')
    assert.strictEqual(resAllZero.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.strictEqual(resAllZero.biayaTotal, 30000000)
    assert.strictEqual(resAllZero.dasarPenyusutanTotal, 0)
    assert.strictEqual(resAllZero.totalPenyusutanUsaha, 0)
    assert.ok(resAllZero.jadwalBulanan.length > 0, 'Jadwal bulanan gabungan harus terbentuk')
    assert.strictEqual(resAllZero.jadwalBulanan[0].periodeKey, '2026-01')
    assert.strictEqual(resAllZero.jadwalBulanan[resAllZero.jadwalBulanan.length - 1].periodeKey, '2028-06')
    assert.ok(resAllZero.jadwalBulanan.every(r => r.bebanPenyusutan === 0 && r.akumulasiPenyusutan === 0))
    // Cek bahwa pada 2026-01 nilai buku = 20M, dan pada 2026-07 naik jadi 30M
    assert.strictEqual(resAllZero.jadwalBulanan.find(r => r.periodeKey === '2026-01').nilaiBukuAkhir, 20000000)
    assert.strictEqual(resAllZero.jadwalBulanan.find(r => r.periodeKey === '2026-07').nilaiBukuAkhir, 30000000)
  })

  // ---------------------------------------------------------------------------
  // 12. Fase 4B-2R: Penanganan Kode Error Server Eksplisit (SIMKOS_STALE_PREVIEW)
  // ---------------------------------------------------------------------------
  await t.test('12. Fase 4B-2R: Deteksi Eksplisit Kode Error Server SIMKOS_STALE_PREVIEW & Hash Payload Deterministik', () => {
    const staleErr = {
      code: 'P0001',
      message: 'SIMKOS_STALE_PREVIEW: Pratinjau kedaluwarsa. Parameter aset, komponen, atau saldo awal telah berubah sejak pratinjau dibuat',
    }
    assert.strictEqual(getBookkeepingErrorCode(staleErr), 'SIMKOS_STALE_PREVIEW')
    assert.strictEqual(isStalePreviewError(staleErr), true)

    // Pesan terjemahan tanpa kode SIMKOS_STALE_PREVIEW TIDAK boleh dianggap sebagai SIMKOS_STALE_PREVIEW
    const translatedFakeErr = {
      message: 'Pratinjau kedaluwarsa karena data aset, komponen, atau saldo awal telah berubah.',
    }
    assert.strictEqual(getBookkeepingErrorCode(translatedFakeErr), null)
    assert.strictEqual(isStalePreviewError(translatedFakeErr), false)

    // Kode error server lain diekstrak secara akurat dan tidak tertukar dengan SIMKOS_STALE_PREVIEW
    const lockedErr = { message: 'SIMKOS_PERIOD_LOCKED: Periode 2026-07 dalam keadaan terkunci (locked)' }
    assert.strictEqual(getBookkeepingErrorCode(lockedErr), 'SIMKOS_PERIOD_LOCKED')
    assert.strictEqual(isStalePreviewError(lockedErr), false)
    assert.ok(formatBookkeepingError(lockedErr).includes('terkunci'))

    // Hash payload deterministik untuk retry idempoten
    const h1 = getCanonicalPayloadHash('org-1', '2026-06', '  Catatan uji  ')
    const h2 = getCanonicalPayloadHash('org-1', '2026-06', 'Catatan uji')
    const h3 = getCanonicalPayloadHash('org-1', '2026-06', 'Catatan berbeda')
    assert.strictEqual(h1, h2, 'Payload identik (setelah trim) harus menghasilkan hash yang sama untuk retry')
    assert.notStrictEqual(h1, h3, 'Catatan berbeda harus menghasilkan hash berbeda')
  })
})
