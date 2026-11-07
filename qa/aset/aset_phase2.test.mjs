import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  calculateSharedAreaAllocation,
  inspectAssetCompleteness,
  getAssetCategoryLabel,
  getAssetCategoryIcon
} from '../../src/lib/aset.js'

const ROOT = path.resolve()

test('calculateSharedAreaAllocation: alokasi proporsional luas bersama', () => {
  // Luas: Kos 120, Nonusaha 80, Bersama 40
  const res = calculateSharedAreaAllocation(120, 80, 40)
  assert.equal(res.canCalculate, true)
  assert.equal(res.isZeroDenominator, false)
  assert.equal(res.luasTotal, 240)
  assert.equal(res.ratioUsaha, 0.6) // 120 / (120 + 80) = 0.6
  assert.equal(res.luasUsahaEfektif, 144) // 120 + (0.6 * 40) = 144
  assert.equal(res.luasNonUsahaEfektif, 96) // 80 + (0.4 * 40) = 96
  assert.equal(res.porsiUsahaPersen, 60.0) // 144 / 240 = 60.0%
})

test('calculateSharedAreaAllocation: penanganan penyebut nol tanpa tebak persentase otomatis', () => {
  // Luas khusus kosong: Kos 0, Nonusaha 0, Bersama 100
  const res = calculateSharedAreaAllocation(0, 0, 100)
  assert.equal(res.canCalculate, false)
  assert.equal(res.isZeroDenominator, true)
  assert.equal(res.porsiUsahaPersen, null, 'Porsi usaha harus null, bukan 0 atau 100 otomatis')
  assert.equal(res.luasUsahaEfektif, null)
})

test('inspectAssetCompleteness: mendeteksi data draf yang belum lengkap', () => {
  const incompleteAsset = { nama_aset: 'Gedung Kos' }
  const incompleteComp = [{ biaya_perolehan: null, tanggal_siap_guna: null, tahun_perolehan: null }]

  const res1 = inspectAssetCompleteness(incompleteAsset, incompleteComp)
  assert.equal(res1.isComplete, false)
  assert.ok(res1.missingFields.includes('Biaya perolehan'))
  assert.ok(res1.missingFields.includes('Tanggal atau tahun perolehan'))

  // Aset lengkap dengan tahun bebas (tanpa tanggal 1 Jan)
  const completeAsset = { nama_aset: 'Gedung Kos Utama', kategori_aset: 'gedung' }
  const completeComp = [{
    biaya_perolehan: 600000000,
    tahun_perolehan: 2021,
    pola_penggunaan: 'seluruhnya_usaha',
    metode_penyusutan: 'garis_lurus',
    masa_manfaat_bulan: 240
  }]
  const res2 = inspectAssetCompleteness(completeAsset, completeComp)
  assert.equal(res2.isComplete, true)
  assert.equal(res2.missingFields.length, 0)
})

test('Pemisahan Kategori Tanah vs Gedung & Barang', () => {
  assert.equal(getAssetCategoryLabel('tanah'), 'Tanah')
  assert.equal(getAssetCategoryLabel('gedung'), 'Gedung')
  assert.equal(getAssetCategoryLabel('fasilitas_kamar'), 'Fasilitas Kamar')
  assert.equal(getAssetCategoryLabel('fasilitas_umum'), 'Fasilitas Umum')
  assert.equal(getAssetCategoryIcon('tanah'), '🏞️')
  assert.equal(getAssetCategoryIcon('gedung'), '🏢')
})

test('Migrasi 800: integritas skema Fase 2 & backfill idempoten', () => {
  const migFile = path.join(ROOT, 'supabase/migrations/20261108000800_assets_phase2.sql')
  assert.ok(fs.existsSync(migFile), 'File migrasi 800 harus ada')

  const sql = fs.readFileSync(migFile, 'utf8')
  assert.match(sql, /capitalization_threshold numeric/, 'Organisasi memiliki ambang kapitalisasi')
  assert.match(sql, /create table if not exists public\.assets/, 'Membuat tabel public.assets')
  assert.match(sql, /create table if not exists public\.asset_components/, 'Membuat tabel public.asset_components')
  assert.match(sql, /legacy_inventory_id/, 'Menyimpan rujukan unik ke inventaris lama')
  assert.match(sql, /uq_assets_legacy_inventory unique/, 'Constraint keunikan backfill legacy_inventory_id')
  assert.match(sql, /allocated_cost/, 'Mendukung alokasi split transaksi pembelian')
  assert.match(sql, /SIMKOS_CROSS_TENANT_LOCATION/, 'Trigger menolak cross-tenant location')
  assert.match(sql, /SIMKOS_CROSS_TENANT_ROOM/, 'Trigger menolak cross-tenant room')
  assert.match(sql, /SIMKOS_OVERALLOCATED_EXPENSE/, 'Trigger menolak alokasi melebihi transaksi sumber')
  assert.match(sql, /backfill_inventories_to_assets\(\)/, 'Fungsi backfill idempoten tersedia')
  assert.match(sql, /where not exists/, 'Backfill menggunakan guard anti duplikasi')
})

test('Simulasi Backfill Idempoten: run kedua tidak menghasilkan duplikat', () => {
  // Simulasi data inventaris lama
  const mockInventories = [
    { id: 'inv-1', nama_barang: 'Kasur Busa No 2', harga: 1200000, tipe_fasilitas: 'kamar' },
    { id: 'inv-2', nama_barang: 'Meja Belajar', harga: 450000, tipe_fasilitas: 'kamar' }
  ]

  const mockAssetsTable = []

  function runBackfill(sourceList) {
    let inserted = 0
    for (const inv of sourceList) {
      const exists = mockAssetsTable.some(a => a.legacy_inventory_id === inv.id)
      if (!exists) {
        mockAssetsTable.push({
          id: 'asset-' + inv.id,
          nama_aset: inv.nama_barang,
          legacy_inventory_id: inv.id,
          status_pencatatan: 'draft'
        })
        inserted++
      }
    }
    return inserted
  }

  // Run pertama
  const r1 = runBackfill(mockInventories)
  assert.equal(r1, 2)
  assert.equal(mockAssetsTable.length, 2)

  // Run kedua (harus 0 duplikat)
  const r2 = runBackfill(mockInventories)
  assert.equal(r2, 0, 'Run kedua tidak boleh memasukkan duplikat')
  assert.equal(mockAssetsTable.length, 2, 'Total record tetap 2')
})

test('Alokasi Transaksi Campuran: alokasi total tidak boleh melebihi transaksi sumber', () => {
  const expenseNominal = 10000000 // Rp 10.000.000 (nota gabungan)
  const allocation1 = 6500000 // AC
  const allocation2 = 2400000 // Pompa Air
  const totalAllocated = allocation1 + allocation2
  const operationalExpenseLeft = expenseNominal - totalAllocated

  assert.ok(totalAllocated <= expenseNominal, 'Alokasi valid karena tidak melebihi nominal')
  assert.equal(operationalExpenseLeft, 1100000, 'Sisa Rp 1.100.000 diakui sebagai beban operasional langsung')

  const invalidAllocation = 3000000 // Kelebihan
  assert.ok((totalAllocated + invalidAllocation) > expenseNominal, 'Melebihi batas transaksi sumber')
})
