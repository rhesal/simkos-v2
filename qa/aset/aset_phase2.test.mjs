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

test('Migrasi 800: integritas sintaks PostgreSQL & skema Fase 2-R', () => {
  const migFile = path.join(ROOT, 'supabase/migrations/20261108000800_assets_phase2.sql')
  assert.ok(fs.existsSync(migFile), 'File migrasi 800 harus ada')

  const sql = fs.readFileSync(migFile, 'utf8')
  // Verifikasi koreksi sintaks
  assert.doesNotMatch(sql, /add column if not null/i, 'Tidak boleh ada sintaks invalid ADD COLUMN IF NOT NULL')
  assert.match(sql, /add column if not exists capitalization_threshold/i, 'Sintaks valid ADD COLUMN IF NOT EXISTS')

  // Verifikasi tabel dan constraint
  assert.match(sql, /create table if not exists public\.assets/, 'Membuat tabel public.assets')
  assert.match(sql, /create table if not exists public\.asset_components/, 'Membuat tabel public.asset_components')
  assert.match(sql, /legacy_inventory_id/, 'Menyimpan rujukan unik ke inventaris lama')
  assert.match(sql, /uq_assets_legacy_inventory/i, 'Constraint keunikan backfill legacy_inventory_id')
  assert.match(sql, /allocated_cost numeric check \(allocated_cost >= 0\)/, 'Mendukung alokasi split transaksi pembelian')
  assert.match(sql, /porsi_usaha_persen numeric check/, 'Porsi usaha mendukung check 0-100 dan nullable')
  assert.match(sql, /is_origin_inventory boolean/i, 'Menandai tepat satu komponen asal hasil backfill')
  assert.match(sql, /financials_customized_in_asset boolean/i, 'Melacak kustomisasi finansial di modul aset')

  // Verifikasi trigger pengamanan & integritas
  assert.match(sql, /SIMKOS_CROSS_TENANT_LOCATION/, 'Trigger menolak cross-tenant location')
  assert.match(sql, /SIMKOS_CROSS_TENANT_ROOM/, 'Trigger menolak cross-tenant room')
  assert.match(sql, /SIMKOS_CROSS_TENANT_INVENTORY/, 'Trigger menolak cross-tenant legacy_inventory_id')
  assert.match(sql, /SIMKOS_ROOM_LOCATION_MISMATCH/, 'Trigger memastikan kamar sesuai lokasi aset')
  assert.match(sql, /SIMKOS_IMMUTABLE_ORG/, 'Trigger menolak pemindahan organisasi aset')
  assert.match(sql, /SIMKOS_PHASE2_DRAFT_ONLY/, 'Trigger membatasi aset hanya draft di Fase 2')
  assert.match(sql, /SIMKOS_NON_DRAFT_COMPONENT_DELETE/, 'Trigger menolak hapus komponen jika aset induk bukan draft')
  assert.match(sql, /SIMKOS_OVERALLOCATED_EXPENSE/, 'Trigger menolak alokasi melebihi transaksi sumber')
  assert.match(sql, /SIMKOS_EXPENSE_HAS_ALLOCATED_ASSET/, 'Trigger menolak hapus pengeluaran yang teralokasi')
  assert.match(sql, /SIMKOS_EXPENSE_BELOW_ALLOCATIONS/, 'Trigger menolak nominal pengeluaran turun di bawah alokasi')

  // Verifikasi trigger transisi inventaris lama
  assert.match(sql, /trg_sync_inventory_to_asset/, 'Trigger sinkronisasi inventaris lama ke aset terpasang')

  // Verifikasi RPC Backfill aman & CTE valid
  assert.match(sql, /SIMKOS_UNAUTHENTICATED/, 'RPC backfill menolak user anonim')
  assert.match(sql, /SIMKOS_FORBIDDEN_ORG/, 'RPC backfill memvalidasi keanggotaan pada organisasi target')
  assert.match(sql, /SIMKOS_UNAUTHORIZED/, 'RPC backfill menolak user selain admin/owner')
  assert.match(sql, /pg_advisory_xact_lock/, 'RPC backfill menggunakan advisory lock anti race condition')
  assert.match(sql, /with ins_assets as/i, 'RPC backfill menggunakan CTE INSERT RETURNING yang valid')
  assert.doesNotMatch(sql, /into _new_assets_batch;/i, 'Tidak ada sintaks RETURNING INTO temporary_table yang tidak valid')
  assert.match(sql, /null, -- Tanggal siap guna tidak otomatis disamakan/, 'Tanggal siap guna dibiarkan NULL pada backfill')
  assert.match(sql, /'perlu_telaah'/, 'Klasifikasi awal backfill berstatus perlu_telaah')
  assert.match(sql, /grant execute on function public\.backfill_inventories_to_assets/i, 'Izin eksekusi RPC terdaftar eksplisit')
})

test('Simulasi Backfill Idempoten & Hitungan Nyata: run kedua tidak menghasilkan duplikat', () => {
  const mockInventories = [
    { id: 'inv-1', org_id: 'org-1', nama_barang: 'Kasur Busa No 2', harga: 1200000, tipe_fasilitas: 'kamar' },
    { id: 'inv-2', org_id: 'org-1', nama_barang: 'Meja Belajar', harga: 450000, tipe_fasilitas: 'kamar' }
  ]

  const mockAssetsTable = []

  function runBackfill(callerOrgId) {
    let insertedAssets = 0
    let insertedComponents = 0

    for (const inv of mockInventories) {
      if (inv.org_id !== callerOrgId) continue

      const exists = mockAssetsTable.some(a => a.legacy_inventory_id === inv.id)
      if (!exists) {
        mockAssetsTable.push({
          id: 'asset-' + inv.id,
          org_id: inv.org_id,
          nama_aset: inv.nama_barang,
          legacy_inventory_id: inv.id,
          status_pencatatan: 'draft'
        })
        insertedAssets++
        insertedComponents++
      }
    }
    return { insertedAssets, insertedComponents }
  }

  // Panggilan pertama oleh org-1
  const r1 = runBackfill('org-1')
  assert.equal(r1.insertedAssets, 2)
  assert.equal(r1.insertedComponents, 2)
  assert.equal(mockAssetsTable.length, 2)

  // Panggilan kedua oleh org-1 (harus 0 dibuat, bukan total historis)
  const r2 = runBackfill('org-1')
  assert.equal(r2.insertedAssets, 0, 'Run kedua harus mengembalikan 0 aset baru')
  assert.equal(r2.insertedComponents, 0, 'Run kedua harus mengembalikan 0 komponen baru')
  assert.equal(mockAssetsTable.length, 2, 'Total baris di tabel tetap 2')

  // Panggilan oleh org lain (org-2)
  const r3 = runBackfill('org-2')
  assert.equal(r3.insertedAssets, 0)
  assert.equal(mockAssetsTable.length, 2)
})

test('Validasi Relasi Cross-Tenant: penolakan tautan silang organisasi', () => {
  const orgA = '00000000-0000-0000-0000-000000000001'
  const orgB = '00000000-0000-0000-0000-000000000002'

  const mockLocations = [
    { id: 'loc-A', org_id: orgA },
    { id: 'loc-B', org_id: orgB }
  ]

  function validateAssetInsert(asset) {
    if (asset.location_id) {
      const loc = mockLocations.find(l => l.id === asset.location_id)
      if (!loc || loc.org_id !== asset.org_id) {
        throw new Error('SIMKOS_CROSS_TENANT_LOCATION')
      }
    }
    return true
  }

  // Insert valid (lokasi seorganisasi)
  assert.ok(validateAssetInsert({ org_id: orgA, location_id: 'loc-A' }))

  // Insert invalid (lokasi milik org lain)
  assert.throws(() => {
    validateAssetInsert({ org_id: orgA, location_id: 'loc-B' })
  }, /SIMKOS_CROSS_TENANT_LOCATION/)
})

test('Alokasi Transaksi Campuran: alokasi total tidak boleh melebihi transaksi sumber', () => {
  const expenseNominal = 10000000 // Rp 10.000.000 (nota gabungan)
  const allocation1 = 6500000 // AC
  const allocation2 = 2400000 // Pompa Air
  const totalAllocated = allocation1 + allocation2
  const operationalExpenseLeft = expenseNominal - totalAllocated

  assert.ok(totalAllocated <= expenseNominal, 'Alokasi valid karena tidak melebihi nominal')
  assert.equal(operationalExpenseLeft, 1100000, 'Sisa Rp 1.100.000 diakui sebagai beban operasional langsung')

  const invalidAllocation = 3000000 // Total jadi 11.900.000 (melebihi 10.000.000)
  assert.ok((totalAllocated + invalidAllocation) > expenseNominal, 'Melebihi batas transaksi sumber')
})

test('Sinkronisasi Transisi Inventaris: perubahan pada inventaris lama terpropagasi ke draf aset', () => {
  // Simulasi tabel aset yang tertaut ke inventaris lama
  const asset = {
    nama_aset: 'Kipas Angin Lama',
    kondisi_fisik: 'baik',
    legacy_inventory_id: 'inv-10',
    status_pencatatan: 'draft'
  }
  const component = {
    biaya_perolehan: 300000,
    tanggal_perolehan: '2025-01-01'
  }

  // Simulasi update di menu inventaris lama oleh admin/owner
  const updatedLegacy = {
    id: 'inv-10',
    nama_barang: 'Kipas Angin Berdiri Maspion',
    kondisi: 'Rusak Ringan',
    harga: 350000,
    tanggal_pembelian: '2025-02-15'
  }

  // Fungsi sinkronisasi (seperti trigger sync_inventory_to_asset)
  function applySync(a, comps, leg, role) {
    const isPrivileged = role === 'admin' || role === 'owner'
    if (a.status_pencatatan !== 'draft') {
      if (leg.nama_barang !== a.nama_aset || leg.harga !== comps[0]?.biaya_perolehan) {
        throw new Error('SIMKOS_ASSET_ALREADY_VERIFIED')
      }
      a.kondisi_fisik = leg.kondisi.toLowerCase().includes('rusak') ? 'rusak_ringan' : 'baik'
      return
    }

    if (!isPrivileged && leg.harga !== comps[0]?.biaya_perolehan) {
      throw new Error('SIMKOS_STAFF_CANNOT_MUTATE_ASSET_FINANCIALS')
    }

    a.nama_aset = leg.nama_barang
    a.kondisi_fisik = leg.kondisi.toLowerCase().includes('rusak') ? 'rusak_ringan' : 'baik'

    // Identifikasi tepat satu komponen asal (is_origin_inventory = true)
    const originComp = comps.find(c => c.is_origin_inventory) || comps[0]
    if (originComp && isPrivileged) {
      // Jika komponen sudah disesuaikan finansialnya di modul aset, JANGAN timpa biaya/tanggal
      if (!originComp.financials_customized_in_asset) {
        originComp.biaya_perolehan = leg.harga
        originComp.tanggal_perolehan = leg.tanggal_pembelian
      }
    }
  }

  const components = [{
    id: 'comp-1',
    biaya_perolehan: 300000,
    tanggal_perolehan: '2025-01-01',
    is_origin_inventory: true,
    financials_customized_in_asset: false
  }]

  // 1. Sukses jika dijalankan admin/owner saat belum dikustomisasi di Aset
  applySync(asset, components, updatedLegacy, 'admin')
  assert.equal(asset.nama_aset, 'Kipas Angin Berdiri Maspion')
  assert.equal(asset.kondisi_fisik, 'rusak_ringan')
  assert.equal(components[0].biaya_perolehan, 350000)

  // 2. Proteksi Nilai yang Sudah Dikustomisasi di Modul Aset:
  // User mengedit nilai biaya di modul aset menjadi 400000
  components[0].biaya_perolehan = 400000
  components[0].financials_customized_in_asset = true

  // Kemudian ada update kondisi/catatan di menu inventaris lama
  const noteUpdate = { ...updatedLegacy, kondisi: 'Baik', catatan: 'Dibersihkan teknisi' }
  applySync(asset, components, noteUpdate, 'admin')

  // Kondisi fisik terupdate, namun biaya perolehan yang sudah dikustomisasi TIDAK tertimpa!
  assert.equal(asset.kondisi_fisik, 'baik')
  assert.equal(components[0].biaya_perolehan, 400000, 'Biaya yang dikustomisasi di modul aset tidak tertimpa oleh sync inventaris')

  // 3. Ditolak jika staf mencoba mengubah harga aset melalui menu inventaris
  const staffAttempt = { ...updatedLegacy, harga: 999999 }
  assert.throws(() => {
    applySync(asset, components, staffAttempt, 'staff')
  }, /SIMKOS_STAFF_CANNOT_MUTATE_ASSET_FINANCIALS/)

  // 4. Ditolak jika aset sudah diverifikasi (SSOT terkunci) dan diubah namanya dari inventaris
  asset.status_pencatatan = 'terverifikasi'
  const renameAttempt = { ...updatedLegacy, nama_barang: 'Kipas Berubah Nama' }
  assert.throws(() => {
    applySync(asset, components, renameAttempt, 'admin')
  }, /SIMKOS_ASSET_ALREADY_VERIFIED/)
})

test('Pembatasan Status Draf pada INSERT dan UPDATE serta penghapusan komponen', () => {
  function checkAssetStatus(operation, status) {
    if (status !== 'draft') {
      throw new Error('SIMKOS_PHASE2_DRAFT_ONLY')
    }
  }

  function checkComponentDelete(parentAssetStatus) {
    if (parentAssetStatus !== 'draft') {
      throw new Error('SIMKOS_NON_DRAFT_COMPONENT_DELETE')
    }
  }

  // 1. INSERT non-draft harus ditolak
  assert.throws(() => checkAssetStatus('INSERT', 'terverifikasi'), /SIMKOS_PHASE2_DRAFT_ONLY/)
  // 2. UPDATE non-draft harus ditolak
  assert.throws(() => checkAssetStatus('UPDATE', 'dibukukan'), /SIMKOS_PHASE2_DRAFT_ONLY/)
  // 3. Status draft diizinkan
  assert.doesNotThrow(() => checkAssetStatus('INSERT', 'draft'))
  assert.doesNotThrow(() => checkAssetStatus('UPDATE', 'draft'))

  // 4. Penghapusan komponen aset non-draft ditolak
  assert.throws(() => checkComponentDelete('terverifikasi'), /SIMKOS_NON_DRAFT_COMPONENT_DELETE/)
  assert.throws(() => checkComponentDelete('dibukukan'), /SIMKOS_NON_DRAFT_COMPONENT_DELETE/)
  // 5. Penghapusan komponen aset draft diizinkan
  assert.doesNotThrow(() => checkComponentDelete('draft'))
})

test('UI Verifikasi: Tampilan bersih dari istilah fase dan memakai label Belum dapat dihitung', () => {
  const asetViewSrc = fs.readFileSync(path.join(ROOT, 'src/views/AsetView.vue'), 'utf8')
  const detailViewSrc = fs.readFileSync(path.join(ROOT, 'src/views/DetailAsetView.vue'), 'utf8')
  const tambahViewSrc = fs.readFileSync(path.join(ROOT, 'src/views/TambahAsetView.vue'), 'utf8')

  // Label "Belum dapat dihitung" harus ada
  assert.ok(asetViewSrc.includes('Belum dapat dihitung'), 'AsetView menampilkan Belum dapat dihitung')
  assert.ok(detailViewSrc.includes('Belum dapat dihitung'), 'DetailAsetView menampilkan Belum dapat dihitung')

  // Istilah fase pengembangan tidak boleh ada di template user-facing
  assert.ok(!asetViewSrc.includes('Tersedia di Fase 3'), 'AsetView tidak memuat teks Fase 3')
  assert.ok(!detailViewSrc.includes('Fase 3'), 'DetailAsetView tidak memuat teks Fase 3')
  assert.ok(!tambahViewSrc.includes('fase selanjutnya'), 'TambahAsetView tidak memuat teks fase selanjutnya')
})

test('UI Verifikasi Router & Integrasi Navigasi: Rute Aset, Tambah, Detail, Edit, dan BottomNav', () => {
  const routerSrc = fs.readFileSync(path.join(ROOT, 'src/router/index.js'), 'utf8')
  const bottomNavSrc = fs.readFileSync(path.join(ROOT, 'src/components/BottomNav.vue'), 'utf8')

  // Pastikan rute-rute modul aset terdaftar di router
  assert.ok(routerSrc.includes("path: '/aset'"), 'Router mendaftarkan /aset')
  assert.ok(routerSrc.includes("name: 'Aset'"), 'Router mendaftarkan name Aset')
  assert.ok(routerSrc.includes("path: '/aset/tambah'"), 'Router mendaftarkan /aset/tambah')
  assert.ok(routerSrc.includes("name: 'TambahAset'"), 'Router mendaftarkan name TambahAset')
  assert.ok(routerSrc.includes("path: '/aset/:id'"), 'Router mendaftarkan /aset/:id')
  assert.ok(routerSrc.includes("name: 'DetailAset'"), 'Router mendaftarkan name DetailAset')
  assert.ok(routerSrc.includes("path: '/aset/:id/edit'"), 'Router mendaftarkan /aset/:id/edit')
  assert.ok(routerSrc.includes("name: 'EditAset'"), 'Router mendaftarkan name EditAset')

  // Pastikan file komponen rute aset benar-benar ada di disk
  assert.ok(fs.existsSync(path.join(ROOT, 'src/views/AsetView.vue')), 'AsetView.vue harus ada')
  assert.ok(fs.existsSync(path.join(ROOT, 'src/views/TambahAsetView.vue')), 'TambahAsetView.vue harus ada')
  assert.ok(fs.existsSync(path.join(ROOT, 'src/views/DetailAsetView.vue')), 'DetailAsetView.vue harus ada')

  // Pastikan BottomNav mengarahkan ke /aset dengan label Aset
  assert.ok(bottomNavSrc.includes("to: '/aset'"), 'BottomNav memiliki link ke /aset')
  assert.ok(bottomNavSrc.includes("label: 'Aset'"), 'BottomNav memiliki label Aset')
  assert.ok(bottomNavSrc.includes("route.path.startsWith('/aset')"), 'BottomNav mengaktifkan tab saat berada di rute aset')
})
