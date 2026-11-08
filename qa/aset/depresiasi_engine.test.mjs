import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STATUS_PERHITUNGAN,
  validateDepreciationInput,
  calculateComponentDepreciation,
  calculateAssetDepreciation,
  getDaysInMonth,
  parseDateParts,
} from '../../src/lib/depresiasi.js'

test('Mesin Penyusutan Garis Lurus (Fase 3): Kontrak & Pengujian Penerimaan', async (t) => {
  // 1. Helper kalender & kabisat
  await t.test('1. Helper Kalender: Perhitungan Hari & Kabisat Akurat', () => {
    assert.equal(getDaysInMonth(2024, 2), 29, 'Februari 2024 kabisat harus 29 hari')
    assert.equal(getDaysInMonth(2026, 2), 28, 'Februari 2026 bukan kabisat harus 28 hari')
    assert.equal(getDaysInMonth(2026, 6), 30, 'Juni 2026 harus 30 hari')
    assert.equal(getDaysInMonth(2026, 1), 31, 'Januari 2026 harus 31 hari')

    const p = parseDateParts('2026-06-16')
    assert.deepEqual(p, { year: 2026, month: 6, day: 16 })
    assert.equal(parseDateParts('invalid-date'), null)
    assert.equal(parseDateParts(null), null)
  })

  // 2. Fixture Penerimaan 1: AC Rp6.500.000, sisa Rp500.000, 60 bulan, mulai tanggal 1
  await t.test('2. Fixture 1: AC Rp6.500.000, sisa Rp500.000, 60 bulan, mulai tanggal 1', () => {
    const component = {
      nama_komponen: 'AC Daikin 1/2 PK',
      biaya_perolehan: 6500000,
      nilai_sisa: 500000,
      masa_manfaat_bulan: 60,
      tanggal_siap_guna: '2026-01-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
      status_kapitalisasi: 'kapitalisasi',
    }

    const res = calculateComponentDepreciation(component, 'barang')
    assert.equal(res.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.equal(res.dasarPenyusutan, 6000000)
    assert.equal(res.bebanBulanPenuh, 100000)
    assert.equal(res.jadwalBulanan.length, 60, 'Mulai tanggal 1 harus menghasilkan tepat 60 periode')

    // Beban tiap bulan Rp100.000
    for (let i = 0; i < 60; i++) {
      assert.equal(res.jadwalBulanan[i].bebanPenyusutan, 100000)
    }

    // Nilai buku setelah 12 periode harus Rp5.300.000 (biaya 6.500.000 - akumulasi 1.200.000)
    const periode12 = res.jadwalBulanan[11]
    assert.equal(periode12.akumulasiPenyusutan, 1200000)
    assert.equal(periode12.nilaiBukuAkhir, 5300000)

    // Periode terakhir nilai buku harus sama dengan nilai sisa (Rp500.000)
    const periodeAkhir = res.jadwalBulanan[59]
    assert.equal(periodeAkhir.nilaiBukuAkhir, 500000)
    assert.equal(periodeAkhir.akumulasiPenyusutan, 6000000)
  })

  // 3. Fixture Penerimaan 2: Dasar Rp6.000.000, 60 bulan, siap guna 16 Juni 2026
  await t.test('3. Fixture 2: Dasar Rp6.000.000, 60 bulan, siap guna 16 Juni 2026', () => {
    const component = {
      nama_komponen: 'Peralatan Listrik',
      biaya_perolehan: 6000000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 60,
      tanggal_siap_guna: '2026-06-16',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
      status_kapitalisasi: 'kapitalisasi',
    }

    const res = calculateComponentDepreciation(component, 'barang')
    assert.equal(res.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.equal(res.jadwalBulanan.length, 61, 'Siap guna setelah tgl 1 harus menghasilkan M + 1 (61) periode')

    // Juni 2026: 15 hari dari 30 hari = Rp50.000
    const p1 = res.jadwalBulanan[0]
    assert.equal(p1.periodeKey, '2026-06')
    assert.equal(p1.bebanPenyusutan, 50000)

    // Juli 2026 s/d Mei 2031 (periode 2 s/d 60, 59 bulan): masing-masing Rp100.000
    for (let i = 1; i <= 59; i++) {
      assert.equal(res.jadwalBulanan[i].bebanPenyusutan, 100000, `Bulan ${res.jadwalBulanan[i].periodeKey} harus 100.000`)
    }
    assert.equal(res.jadwalBulanan[59].periodeKey, '2031-05')

    // Juni 2031 (periode 61): Rp50.000
    const pAkhir = res.jadwalBulanan[60]
    assert.equal(pAkhir.periodeKey, '2031-06')
    assert.equal(pAkhir.bebanPenyusutan, 50000)

    // Total akumulasi tepat 6.000.000
    assert.equal(pAkhir.akumulasiPenyusutan, 6000000)
    assert.equal(pAkhir.nilaiBukuAkhir, 0)
  })

  // 4. Fixture Penerimaan 3: Dasar Rp3.600.000, 36 bulan, siap guna 31 Januari 2026
  await t.test('4. Fixture 3: Dasar Rp3.600.000, 36 bulan, siap guna 31 Januari 2026', () => {
    const component = {
      nama_komponen: 'Perangkat Wifi',
      biaya_perolehan: 3600000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 36,
      tanggal_siap_guna: '2026-01-31',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
      status_kapitalisasi: 'kapitalisasi',
    }

    const res = calculateComponentDepreciation(component, 'barang')
    assert.equal(res.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.equal(res.jadwalBulanan.length, 37, 'Total periode harus 37 (36 + 1)')

    // Januari 2026: 1 hari dari 31 hari = round(100.000 * 1 / 31) = Rp3.226
    const p1 = res.jadwalBulanan[0]
    assert.equal(p1.periodeKey, '2026-01')
    assert.equal(p1.bebanPenyusutan, 3226)

    // Februari 2026 s/d Desember 2028 (35 bulan): masing-masing Rp100.000
    for (let i = 1; i <= 35; i++) {
      assert.equal(res.jadwalBulanan[i].bebanPenyusutan, 100000)
    }
    assert.equal(res.jadwalBulanan[35].periodeKey, '2028-12')

    // Januari 2029 (periode 37): sisa Rp96.774
    const pAkhir = res.jadwalBulanan[36]
    assert.equal(pAkhir.periodeKey, '2029-01')
    assert.equal(pAkhir.bebanPenyusutan, 96774)

    // Total tepat Rp3.600.000
    const sumTotal = res.jadwalBulanan.reduce((acc, p) => acc + p.bebanPenyusutan, 0)
    assert.equal(sumTotal, 3600000)
  })

  // 5. Fixture Penerimaan 4: Dasar Rp12.000.000, 48 bulan, siap guna 29 Februari 2024 (Kabisat)
  await t.test('5. Fixture 4: Dasar Rp12.000.000, 48 bulan, siap guna 29 Februari 2024', () => {
    const component = {
      nama_komponen: 'Server CCTV',
      biaya_perolehan: 12000000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 48,
      tanggal_siap_guna: '2024-02-29',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
      status_kapitalisasi: 'kapitalisasi',
    }

    const res = calculateComponentDepreciation(component, 'barang')
    assert.equal(res.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.equal(res.jadwalBulanan.length, 49, 'Total periode harus 49 (48 + 1)')

    // Februari 2024: 1 hari dari 29 hari = round(250.000 * 1 / 29) = Rp8.621
    const p1 = res.jadwalBulanan[0]
    assert.equal(p1.periodeKey, '2024-02')
    assert.equal(p1.bebanPenyusutan, 8621)

    // Maret 2024 s/d Januari 2028 (47 bulan): masing-masing Rp250.000
    for (let i = 1; i <= 47; i++) {
      assert.equal(res.jadwalBulanan[i].bebanPenyusutan, 250000)
    }
    assert.equal(res.jadwalBulanan[47].periodeKey, '2028-01')

    // Februari 2028 (periode 49): sisa Rp241.379
    const pAkhir = res.jadwalBulanan[48]
    assert.equal(pAkhir.periodeKey, '2028-02')
    assert.equal(pAkhir.bebanPenyusutan, 241379)

    // Total tepat Rp12.000.000
    const sumTotal = res.jadwalBulanan.reduce((acc, p) => acc + p.bebanPenyusutan, 0)
    assert.equal(sumTotal, 12000000)
  })

  // 6. Fixture Penerimaan 5: Bangunan Rp600.000.000, sisa nol, 240 bulan, usaha 60%
  await t.test('6. Fixture 5: Bangunan Rp600.000.000, sisa nol, 240 bulan, usaha 60%', () => {
    const component = {
      nama_komponen: 'Bangunan Utama',
      biaya_perolehan: 600000000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 240,
      tanggal_siap_guna: '2025-01-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 60,
      status_kapitalisasi: 'kapitalisasi',
    }

    const res = calculateComponentDepreciation(component, 'gedung')
    assert.equal(res.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.equal(res.bebanBulanPenuh, 2500000)
    assert.equal(res.totalPenyusutanUsaha, 360000000) // 600.000.000 * 60%

    // Tiap bulan penuh porsi usaha = 2.500.000 * 60% = Rp1.500.000
    assert.equal(res.jadwalBulanan[0].bebanUsaha, 1500000)
    assert.equal(res.jadwalBulanan[100].bebanUsaha, 1500000)

    const sumUsaha = res.jadwalBulanan.reduce((acc, p) => acc + p.bebanUsaha, 0)
    assert.equal(sumUsaha, 360000000, 'Total porsi usaha harus tepat 360.000.000')
  })

  // 7. Parameter kosong vs Tidak valid
  await t.test('7. Validasi: Biaya / Tanggal Kosong Menghasilkan BELUM_DAPAT_DIHITUNG', () => {
    // Biaya kosong
    const c1 = {
      masa_manfaat_bulan: 60,
      tanggal_siap_guna: '2026-01-01',
      metode_penyusutan: 'garis_lurus',
    }
    const r1 = calculateComponentDepreciation(c1, 'barang')
    assert.equal(r1.status, STATUS_PERHITUNGAN.BELUM_DAPAT_DIHITUNG)
    assert.ok(r1.missingFields.includes('Biaya perolehan'))

    // Tanggal siap guna kosong (hanya tahun perolehan)
    const c2 = {
      biaya_perolehan: 5000000,
      tahun_perolehan: 2025,
      masa_manfaat_bulan: 60,
      metode_penyusutan: 'garis_lurus',
    }
    const r2 = calculateComponentDepreciation(c2, 'barang')
    assert.equal(r2.status, STATUS_PERHITUNGAN.BELUM_DAPAT_DIHITUNG)
    assert.ok(r2.missingFields.includes('Tanggal siap guna lengkap'))

    // Nilai sisa melebihi biaya perolehan
    const c3 = {
      biaya_perolehan: 5000000,
      nilai_sisa: 6000000,
      tanggal_siap_guna: '2026-01-01',
      masa_manfaat_bulan: 60,
      metode_penyusutan: 'garis_lurus',
    }
    const r3 = calculateComponentDepreciation(c3, 'barang')
    assert.equal(r3.status, STATUS_PERHITUNGAN.INPUT_TIDAK_VALID)
    assert.ok(r3.errors.some(e => e.includes('Nilai sisa tidak boleh melebihi biaya perolehan')))
  })

  // 8. Porsi Usaha: NULL vs 0%
  await t.test('8. Porsi Usaha: NULL vs 0% Dibedakan dengan Benar', () => {
    const base = {
      biaya_perolehan: 1200000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 12,
      tanggal_siap_guna: '2026-01-01',
      metode_penyusutan: 'garis_lurus',
      status_kapitalisasi: 'kapitalisasi',
    }

    // Porsi usaha 0%
    const res0 = calculateComponentDepreciation({ ...base, porsi_usaha_persen: 0 }, 'barang')
    assert.equal(res0.porsiUsahaPersen, 0)
    assert.equal(res0.totalPenyusutanUsaha, 0)
    assert.equal(res0.jadwalBulanan[0].bebanUsaha, 0)
    assert.equal(res0.jadwalBulanan[0].bebanPenyusutan, 100000)

    // Porsi usaha NULL
    const resNull = calculateComponentDepreciation({ ...base, porsi_usaha_persen: null }, 'barang')
    assert.equal(resNull.porsiUsahaPersen, null)
    assert.equal(resNull.totalPenyusutanUsaha, null)
    assert.equal(resNull.jadwalBulanan[0].bebanUsaha, null)
    assert.equal(resNull.jadwalBulanan[0].bebanPenyusutan, 100000)
  })

  // 9. Tanah dan Beban Langsung
  await t.test('9. Tanah dan Beban Langsung: TIDAK_DISUSUTKAN', () => {
    const cTanah = {
      nama_komponen: 'Tanah Utama',
      biaya_perolehan: 500000000,
      tanggal_siap_guna: '2020-01-01',
      metode_penyusutan: 'garis_lurus',
    }
    const resTanah = calculateComponentDepreciation(cTanah, 'tanah')
    assert.equal(resTanah.status, STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN)
    assert.ok(resTanah.alasan.includes('Tanah'))

    const cBeban = {
      nama_komponen: 'Cat Kamar Kos Rutin',
      biaya_perolehan: 1500000,
      tanggal_siap_guna: '2026-02-01',
      masa_manfaat_bulan: 12,
      metode_penyusutan: 'garis_lurus',
      status_kapitalisasi: 'beban_langsung',
    }
    const resBeban = calculateComponentDepreciation(cBeban, 'gedung')
    assert.equal(resBeban.status, STATUS_PERHITUNGAN.TIDAK_DISUSUTKAN)
    assert.ok(resBeban.alasan.includes('beban langsung'))
  })

  // 10. Masa manfaat 1 bulan, nilai kecil & dasar nol
  await t.test('10. Kasus Ekstrem: 1 Bulan, Nilai Kecil, dan Biaya = Nilai Sisa', () => {
    // 1 bulan mulai tgl 15
    const c1 = {
      biaya_perolehan: 1000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 1,
      tanggal_siap_guna: '2026-06-16',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
      status_kapitalisasi: 'kapitalisasi',
    }
    const r1 = calculateComponentDepreciation(c1, 'barang')
    assert.equal(r1.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.equal(r1.jadwalBulanan.length, 2)
    assert.equal(r1.jadwalBulanan[0].bebanPenyusutan, 500)
    assert.equal(r1.jadwalBulanan[1].bebanPenyusutan, 500)
    assert.equal(r1.jadwalBulanan[1].nilaiBukuAkhir, 0)

    // Biaya = Nilai Sisa (Dasar = 0)
    const cZero = {
      biaya_perolehan: 5000000,
      nilai_sisa: 5000000,
      masa_manfaat_bulan: 36,
      tanggal_siap_guna: '2026-01-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
    }
    const rZero = calculateComponentDepreciation(cZero, 'barang')
    assert.equal(rZero.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.equal(rZero.dasarPenyusutan, 0)
    assert.equal(rZero.bebanBulanPenuh, 0)
  })

  // 11. Multi-komponen dengan tanggal berbeda & status parsial
  await t.test('11. Multi-Komponen: Agregasi Jadwal & Hasil Parsial', () => {
    const comp1 = {
      id: 'comp-1',
      nama_komponen: 'Bangunan Induk',
      biaya_perolehan: 240000000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 240,
      tanggal_siap_guna: '2026-01-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 80,
      status_kapitalisasi: 'kapitalisasi',
    }

    const comp2 = {
      id: 'comp-2',
      nama_komponen: 'Renovasi Kamar Mandi (Pengembangan)',
      biaya_perolehan: 12000000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 60,
      tanggal_siap_guna: '2026-07-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
      status_kapitalisasi: 'kapitalisasi',
    }

    // 11.1 Kedua komponen lengkap
    const resFull = calculateAssetDepreciation([comp1, comp2], 'gedung')
    assert.equal(resFull.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.equal(resFull.isPartial, false)
    assert.equal(resFull.biayaTotal, 252000000)

    // Cek periode Januari 2026 (hanya comp1 aktif): beban = 1.000.000, usaha = 800.000
    const jan26 = resFull.jadwalBulanan.find(j => j.periodeKey === '2026-01')
    assert.equal(jan26.bebanPenyusutan, 1000000)
    assert.equal(jan26.bebanUsaha, 800000)

    // Cek periode Juli 2026 (comp1 + comp2 aktif):
    // comp1 beban = 1.000.000 (usaha 800.000)
    // comp2 beban = 200.000 (usaha 200.000)
    // total beban = 1.200.000, total usaha = 1.000.000
    const jul26 = resFull.jadwalBulanan.find(j => j.periodeKey === '2026-07')
    assert.equal(jul26.bebanPenyusutan, 1200000)
    assert.equal(jul26.bebanUsaha, 1000000)

    // 11.2 Salah satu komponen belum lengkap (comp3 missing masa manfaat)
    const comp3Incomplete = {
      id: 'comp-3',
      nama_komponen: 'Kanopi Parkir',
      biaya_perolehan: 5000000,
      tanggal_siap_guna: '2026-08-01',
      metode_penyusutan: 'garis_lurus',
      // masa_manfaat_bulan tidak diisi
    }

    const resPartial = calculateAssetDepreciation([comp1, comp2, comp3Incomplete], 'gedung')
    assert.equal(resPartial.status, STATUS_PERHITUNGAN.HASIL_PARSIAL)
    assert.equal(resPartial.isPartial, true)
    assert.equal(resPartial.komponenTerhitung, 2)
    assert.equal(resPartial.totalKomponen, 3)
    assert.ok(resPartial.labelParsial.includes('2 dari 3'))
    assert.equal(resPartial.missingComponents.length, 1)
    assert.equal(resPartial.missingComponents[0].nama, 'Kanopi Parkir')
  })

  // 12. Status Perlu Telaah
  await t.test('12. Status Perlu Telaah: Menampilkan Catatan Simulasi Asumsi Kapitalisasi', () => {
    const compTelaah = {
      nama_komponen: 'Pemasangan Partisi Gypsum',
      biaya_perolehan: 4800000,
      nilai_sisa: 0,
      masa_manfaat_bulan: 48,
      tanggal_siap_guna: '2026-01-01',
      metode_penyusutan: 'garis_lurus',
      porsi_usaha_persen: 100,
      status_kapitalisasi: 'perlu_telaah',
    }

    const res = calculateComponentDepreciation(compTelaah, 'gedung')
    assert.equal(res.status, STATUS_PERHITUNGAN.DAPAT_DIHITUNG)
    assert.equal(res.isPerluTelaah, true)
    assert.equal(res.catatanSimulasi, 'Simulasi dengan asumsi dikapitalisasi')
  })
})
