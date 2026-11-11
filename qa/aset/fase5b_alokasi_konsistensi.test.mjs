/**
 * Fase 5B Koreksi: Pengujian SQL & REST Konsistensi Batas Alokasi Master dan Snapshot
 *
 * Menguji:
 * 1. Contoh Kasus Rp 4,8 Juta -> Rp 4,5 Juta:
 *    - Aset 1 aktif dengan Snapshot v1 (allocated_cost = Rp 4.800.000) pada Pengeluaran E1 (nominal = Rp 5.000.000).
 *    - Komponen direvisi menjadi Rp 4.500.000 (status aset menjadi perlu_pengesahan_ulang).
 *    - Validasi: Nominal pengeluaran E1 TIDAK BISA diturunkan ke Rp 4.700.000 (harus ditolak SIMKOS_EXPENSE_BELOW_ALLOCATIONS
 *      karena snapshot resmi Rp 4.800.000 masih berlaku dan wajib dilindungi).
 *    - Validasi: Komponen dari aset lain TIDAK BISA memakai kapasitas Rp 300.000 (misal mencoba mengalokasikan Rp 400.000 pada E1,
 *      ditolak SIMKOS_OVERALLOCATED_EXPENSE).
 *    - Setelah activate_asset (Snapshot v2 disahkan Rp 4.500.000), komitmen snapshot turun menjadi Rp 4.500.000,
 *      sehingga nominal E1 kini sah diturunkan ke Rp 4.600.000, atau komponen lain dapat mengalokasikan hingga Rp 500.000.
 * 2. Pemindahan expense_id (E1 -> E2):
 *    - Komponen disahkan pada E1 (Rp 2.000.000).
 *    - Komponen direvisi dengan expense_id pindah ke E2 (Rp 2.000.000).
 *    - Selama pending re-approval: E1 tetap melindungi alokasi snapshot Rp 2.000.000, dan E2 harus memiliki kapasitas untuk usulan Rp 2.000.000.
 *    - Jika E2 penuh (overcapacity), revisi ditolak dan rollback bersih tanpa perubahan parsial.
 * 3. Atomic Rollback Integrity:
 *    - Pembuktian bahwa kegagalan validasi alokasi pada level database tidak meninggalkan perubahan parsial.
 * 4. Pengujian Konkurensi PostgreSQL (Dual Client):
 *    - Koneksi 1 mencoba menurunkan nominal pengeluaran bersamaan dengan Koneksi 2 melakukan revisi/penambahan alokasi.
 *    - Baris pengeluaran terkunci secara konsisten via FOR UPDATE sehingga terserialisasi dan kapasitas tidak terlanggar.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { startSupabaseStack } from '../../scripts/start_qa_supabase.mjs'

const PG_PORT = 54322
const PG_USER = process.env.USER || 'disnak'
const SUPABASE_URL = 'http://127.0.0.1:8432'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1xYSIsInJvbGUiOiJhbm9uIiwiZXhwIjoyNTM0MDIzMDA3OTl9.qa-anon-key'

async function createPgClient() {
  const client = new pg.Client({
    host: 'localhost',
    port: PG_PORT,
    user: PG_USER,
    database: 'simkos_qa_staging',
    statement_timeout: 8000,
    query_timeout: 8000,
  })
  await client.connect()
  return client
}

async function loginUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Login failed for ${email}: ${res.status} ${err}`)
  }
  return await res.json()
}

async function restFetch(urlPath, { method = 'GET', token, body = null, headers = {} } = {}) {
  const reqHeaders = {
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
    ...headers,
  }
  if (token) {
    reqHeaders.Authorization = `Bearer ${token}`
  }
  const opts = { method, headers: reqHeaders }
  if (body !== null) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body)
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1${urlPath}`, opts)
  const contentType = res.headers.get('content-type') || ''
  let data = null
  if (contentType.includes('application/json')) {
    data = await res.json()
  } else {
    data = await res.text()
  }
  return { status: res.status, headers: res.headers, data }
}

test('Fase 5B Koreksi: Konsistensi Batas Alokasi Master dan Snapshot', { timeout: 90000 }, async (t) => {
  let stack = null
  let dbClient = null

  try {
    stack = await startSupabaseStack()
    dbClient = await createPgClient()

    const ownerAuth = await loginUser('owner@simkos.test', 'testpass123')
    const ownerToken = ownerAuth.access_token

    // Ambil org_id dan location_id
    const orgRes = await restFetch('/organizations?name=eq.SimKos&select=id', { token: ownerToken })
    assert.equal(orgRes.status, 200)
    const orgId = orgRes.data[0].id

    const locRes = await restFetch(`/locations?org_id=eq.${orgId}&select=id&limit=1`, { token: ownerToken })
    assert.equal(locRes.status, 200)
    const locId = locRes.data[0].id

    await t.test('1. Skenario Rp 4,8 Juta -> Rp 4,5 Juta: Perlindungan Alokasi Snapshot selama Pending Pengesahan Ulang', async () => {
      // 1.1 Buat Pengeluaran E1 senilai Rp 5.000.000
      const expRes = await restFetch('/expenses', {
        method: 'POST',
        token: ownerToken,
        headers: { Prefer: 'return=representation' },
        body: {
          org_id: orgId,
          location_id: locId,
          kategori: 'Pemeliharaan',
          nominal: 5000000,
          tanggal_pengeluaran: '2026-06-01',
          keterangan: 'Pengeluaran Kas Sumber E1 Rp 5.000.000',
        },
      })
      assert.equal(expRes.status, 201)
      const expE1Id = expRes.data[0].id

      // 1.2 Buat Aset 1 dengan Komponen C1 dialokasikan Rp 4.800.000 ke E1
      const assetRes = await restFetch('/assets', {
        method: 'POST',
        token: ownerToken,
        headers: { Prefer: 'return=representation' },
        body: {
          org_id: orgId,
          location_id: locId,
          nama_aset: 'Aset Uji Konsistensi Alokasi',
          kategori_aset: 'elektronik_kantor',
          dasar_penggunaan: 'milik_sendiri',
          status_pencatatan: 'draft',
        },
      })
      assert.equal(assetRes.status, 201)
      const asset1Id = assetRes.data[0].id

      const compRes = await restFetch('/asset_components', {
        method: 'POST',
        token: ownerToken,
        headers: { Prefer: 'return=representation' },
        body: {
          org_id: orgId,
          asset_id: asset1Id,
          nama_komponen: 'Komponen C1',
          jenis_pekerjaan: 'perolehan_baru',
          biaya_perolehan: 4800000,
          nilai_sisa: 0,
          masa_manfaat_bulan: 48,
          tanggal_siap_guna: '2026-06-01',
          pola_penggunaan: 'seluruhnya_usaha',
          porsi_usaha_persen: 100,
          status_kapitalisasi: 'kapitalisasi',
          metode_penyusutan: 'garis_lurus',
          expense_id: expE1Id,
          allocated_cost: 4800000,
        },
      })
      assert.equal(compRes.status, 201)
      const compC1Id = compRes.data[0].id

      // 1.3 Aktivasi Aset 1 -> Menghasilkan Snapshot v1 (allocated_cost = Rp 4.800.000)
      const actRes1 = await restFetch('/rpc/activate_asset', {
        method: 'POST',
        token: ownerToken,
        body: { p_asset_id: asset1Id, p_activation_notes: 'Aktivasi Awal Snapshot v1' },
      })
      assert.equal(actRes1.status, 200)
      assert.equal(actRes1.data.version, 1)

      // 1.4 Revisi C1 via RPC revise_component_parameters: turunkan biaya & alokasi ke Rp 4.500.000
      const revRes = await restFetch('/rpc/revise_component_parameters', {
        method: 'POST',
        token: ownerToken,
        body: {
          p_component_id: compC1Id,
          p_biaya_perolehan: 4500000,
          p_nilai_sisa: 0,
          p_masa_manfaat_bulan: 48,
          p_tanggal_siap_guna: '2026-06-01',
          p_porsi_usaha_persen: 100,
          p_metode_penyusutan: 'garis_lurus',
          p_status_kapitalisasi: 'kapitalisasi',
          p_expense_id: expE1Id,
          p_allocated_cost: 4500000,
          p_update_expense_allocation: true,
          p_revision_notes: 'Usulan revisi alokasi dari 4.8jt ke 4.5jt',
        },
      })
      assert.equal(revRes.status, 200)
      assert.equal(revRes.data.requires_reapproval, true)

      // Verifikasi status aset induk kini perlu_pengesahan_ulang
      const aCheck = await restFetch(`/assets?id=eq.${asset1Id}&select=status_pencatatan`, { token: ownerToken })
      assert.equal(aCheck.data[0].status_pencatatan, 'perlu_pengesahan_ulang')

      // 1.5 Uji Penolakan Penurunan Nominal Pengeluaran E1:
      // Karena Snapshot v1 (Rp 4.800.000) masih berlaku resmi, penurunan nominal ke Rp 4.700.000 HARUS DITOLAK!
      const patchBelowSnap = await restFetch(`/expenses?id=eq.${expE1Id}`, {
        method: 'PATCH',
        token: ownerToken,
        body: { nominal: 4700000 },
      })
      assert.notEqual(patchBelowSnap.status, 200)
      assert.match(JSON.stringify(patchBelowSnap.data), /SIMKOS_EXPENSE_BELOW_ALLOCATIONS/)

      // 1.6 Uji Penolakan Komponen Lain Mengambil Kapasitas Rp 300.000 yang belum disahkan:
      // Buat Aset 2 dan Komponen C2 yang mencoba mengalokasikan Rp 400.000 pada E1 (total alokasi efektif akan jadi 4.8jt + 400rb = 5.2jt > 5jt)
      const asset2Res = await restFetch('/assets', {
        method: 'POST',
        token: ownerToken,
        headers: { Prefer: 'return=representation' },
        body: {
          org_id: orgId,
          location_id: locId,
          nama_aset: 'Aset 2 Penguji Kapasitas',
          kategori_aset: 'elektronik_kantor',
          dasar_penggunaan: 'milik_sendiri',
          status_pencatatan: 'draft',
        },
      })
      const asset2Id = asset2Res.data[0].id

      const comp2Over = await restFetch('/asset_components', {
        method: 'POST',
        token: ownerToken,
        body: {
          org_id: orgId,
          asset_id: asset2Id,
          nama_komponen: 'Komponen C2 Over',
          jenis_pekerjaan: 'perolehan_baru',
          biaya_perolehan: 500000,
          expense_id: expE1Id,
          allocated_cost: 400000,
        },
      })
      assert.notEqual(comp2Over.status, 201)
      assert.match(JSON.stringify(comp2Over.data), /SIMKOS_OVERALLOCATED_EXPENSE/)

      // 1.7 Komponen C2 dengan alokasi Rp 200.000 (4.8jt + 200rb = 5.0jt <= 5.0jt) HARUS BERHASIL
      const comp2Ok = await restFetch('/asset_components', {
        method: 'POST',
        token: ownerToken,
        headers: { Prefer: 'return=representation' },
        body: {
          org_id: orgId,
          asset_id: asset2Id,
          nama_komponen: 'Komponen C2 Valid',
          jenis_pekerjaan: 'perolehan_baru',
          biaya_perolehan: 200000,
          expense_id: expE1Id,
          allocated_cost: 200000,
        },
      })
      assert.equal(comp2Ok.status, 201)
      const compC2Id = comp2Ok.data[0].id

      // 1.8 Sahkan Aset 1 melalui activate_asset -> Snapshot v2 (Rp 4.500.000)
      const actRes2 = await restFetch('/rpc/activate_asset', {
        method: 'POST',
        token: ownerToken,
        body: { p_asset_id: asset1Id, p_activation_notes: 'Pengesahan Ulang Snapshot v2' },
      })
      assert.equal(actRes2.status, 200)
      assert.equal(actRes2.data.version, 2)

      // 1.9 Setelah Snapshot v2 disahkan, alokasi resmi E1 menjadi: C1 (4.5jt) + C2 (200rb) = 4.7jt.
      // Sekarang penurunan nominal E1 ke Rp 4.800.000 diperbolehkan (karena 4.8jt >= 4.7jt),
      // namun penurunan ke Rp 4.600.000 tetap ditolak!
      const patchBelowNew = await restFetch(`/expenses?id=eq.${expE1Id}`, {
        method: 'PATCH',
        token: ownerToken,
        body: { nominal: 4600000 },
      })
      assert.notEqual(patchBelowNew.status, 200)
      assert.match(JSON.stringify(patchBelowNew.data), /SIMKOS_EXPENSE_BELOW_ALLOCATIONS/)

      const patchValidNew = await restFetch(`/expenses?id=eq.${expE1Id}`, {
        method: 'PATCH',
        token: ownerToken,
        body: { nominal: 4800000 },
      })
      assert.equal(patchValidNew.status, 204)
    })

    await t.test('2. Skenario Pemindahan expense_id Lintas Transaksi (E_sumber -> E_tujuan)', async () => {
      // 2.1 Siapkan dua pengeluaran:
      // E_src: nominal Rp 3.000.000
      // E_dst: nominal Rp 2.000.000
      const eSrcRes = await restFetch('/expenses', {
        method: 'POST',
        token: ownerToken,
        headers: { Prefer: 'return=representation' },
        body: {
          org_id: orgId,
          location_id: locId,
          kategori: 'Perbaikan',
          nominal: 3000000,
          tanggal_pengeluaran: '2026-05-15',
          keterangan: 'E_src Rp 3.000.000',
        },
      })
      const eSrcId = eSrcRes.data[0].id

      const eDstRes = await restFetch('/expenses', {
        method: 'POST',
        token: ownerToken,
        headers: { Prefer: 'return=representation' },
        body: {
          org_id: orgId,
          location_id: locId,
          kategori: 'Renovasi',
          nominal: 2000000,
          tanggal_pengeluaran: '2026-06-15',
          keterangan: 'E_dst Rp 2.000.000',
        },
      })
      const eDstId = eDstRes.data[0].id

      // 2.2 Buat Aset 3 dengan Komponen C3 dialokasikan Rp 2.000.000 ke E_src lalu disahkan (Snapshot v1)
      const a3Res = await restFetch('/assets', {
        method: 'POST',
        token: ownerToken,
        headers: { Prefer: 'return=representation' },
        body: { org_id: orgId, location_id: locId, nama_aset: 'Aset 3 Pindah Transaksi', kategori_aset: 'elektronik_kantor', dasar_penggunaan: 'milik_sendiri', status_pencatatan: 'draft' },
      })
      const a3Id = a3Res.data[0].id

      const c3Res = await restFetch('/asset_components', {
        method: 'POST',
        token: ownerToken,
        headers: { Prefer: 'return=representation' },
        body: {
          org_id: orgId,
          asset_id: a3Id,
          nama_komponen: 'Komponen C3',
          jenis_pekerjaan: 'perolehan_baru',
          biaya_perolehan: 2500000,
          nilai_sisa: 0,
          masa_manfaat_bulan: 36,
          tanggal_siap_guna: '2026-05-15',
          pola_penggunaan: 'seluruhnya_usaha',
          porsi_usaha_persen: 100,
          status_kapitalisasi: 'kapitalisasi',
          metode_penyusutan: 'garis_lurus',
          expense_id: eSrcId,
          allocated_cost: 2000000,
        },
      })
      const c3Id = c3Res.data[0].id

      const act3Res = await restFetch('/rpc/activate_asset', {
        method: 'POST',
        token: ownerToken,
        body: { p_asset_id: a3Id, p_activation_notes: 'Aktivasi Awal C3 di E_src' },
      })
      assert.equal(act3Res.status, 200)

      // 2.3 Isi E_dst dengan komponen lain sebesar Rp 1.500.000 sehingga sisa kapasitas E_dst = Rp 500.000
      const aOtherRes = await restFetch('/assets', {
        method: 'POST',
        token: ownerToken,
        headers: { Prefer: 'return=representation' },
        body: { org_id: orgId, location_id: locId, nama_aset: 'Aset Penjaga Kapasitas E_dst', kategori_aset: 'elektronik_kantor', dasar_penggunaan: 'milik_sendiri', status_pencatatan: 'draft' },
      })
      const aOtherId = aOtherRes.data[0].id

      await restFetch('/asset_components', {
        method: 'POST',
        token: ownerToken,
        body: {
          org_id: orgId,
          asset_id: aOtherId,
          nama_komponen: 'Komponen Penghuni E_dst',
          jenis_pekerjaan: 'perolehan_baru',
          biaya_perolehan: 1500000,
          expense_id: eDstId,
          allocated_cost: 1500000,
        },
      })

      // 2.4 Coba revisi C3 untuk memindahkan expense_id ke E_dst dengan alokasi Rp 2.000.000.
      // Sisa kapasitas E_dst hanya 500rb -> HARUS DITOLAK SIMKOS_OVERALLOCATED_EXPENSE!
      const revFail = await restFetch('/rpc/revise_component_parameters', {
        method: 'POST',
        token: ownerToken,
        body: {
          p_component_id: c3Id,
          p_biaya_perolehan: 2500000,
          p_nilai_sisa: 0,
          p_masa_manfaat_bulan: 36,
          p_tanggal_siap_guna: '2026-05-15',
          p_porsi_usaha_persen: 100,
          p_status_kapitalisasi: 'kapitalisasi',
          p_metode_penyusutan: 'garis_lurus',
          p_expense_id: eDstId,
          p_allocated_cost: 2000000,
          p_update_expense_allocation: true,
          p_revision_notes: 'Pindah ke E_dst yang overcapacity',
        },
      })
      assert.notEqual(revFail.status, 200)
      assert.match(JSON.stringify(revFail.data), /SIMKOS_OVERALLOCATED_EXPENSE/)

      // 2.5 Buktikan penolakan tidak meninggalkan perubahan parsial (Atomic Rollback Integrity):
      // C3 masih terikat pada E_src, allocated_cost masih 2.000.000, dan requires_reapproval masih false
      const c3Check = await restFetch(`/asset_components?id=eq.${c3Id}`, { token: ownerToken })
      assert.equal(c3Check.data[0].expense_id, eSrcId)
      assert.equal(Number(c3Check.data[0].allocated_cost), 2000000)
      assert.equal(c3Check.data[0].requires_reapproval, false)

      // 2.6 Sekarang naikkan kapasitas E_dst menjadi Rp 4.000.000, lalu ulangi pemindahan C3 ke E_dst (Rp 2.000.000)
      const expandDst = await restFetch(`/expenses?id=eq.${eDstId}`, {
        method: 'PATCH',
        token: ownerToken,
        body: { nominal: 4000000 },
      })
      assert.equal(expandDst.status, 204)

      const revOk = await restFetch('/rpc/revise_component_parameters', {
        method: 'POST',
        token: ownerToken,
        body: {
          p_component_id: c3Id,
          p_biaya_perolehan: 2500000,
          p_nilai_sisa: 0,
          p_masa_manfaat_bulan: 36,
          p_tanggal_siap_guna: '2026-05-15',
          p_porsi_usaha_persen: 100,
          p_status_kapitalisasi: 'kapitalisasi',
          p_metode_penyusutan: 'garis_lurus',
          p_expense_id: eDstId,
          p_allocated_cost: 2000000,
          p_update_expense_allocation: true,
          p_revision_notes: 'Pindah ke E_dst yang berkapasitas cukup',
        },
      })
      assert.equal(revOk.status, 200)
      assert.equal(revOk.data.expense_id, eDstId)
      assert.equal(revOk.data.requires_reapproval, true)

      // 2.7 PENTING: Selama C3 berstatus perlu_pengesahan_ulang, E_src (transaksi sumber lama)
      // HARUS TETAP TERLINDUNGI oleh komitmen Snapshot v1 (Rp 2.000.000)!
      // Coba turunkan nominal E_src ke Rp 1.500.000 -> HARUS DITOLAK SIMKOS_EXPENSE_BELOW_ALLOCATIONS!
      const patchSrcFail = await restFetch(`/expenses?id=eq.${eSrcId}`, {
        method: 'PATCH',
        token: ownerToken,
        body: { nominal: 1500000 },
      })
      assert.notEqual(patchSrcFail.status, 200)
      assert.match(JSON.stringify(patchSrcFail.data), /SIMKOS_EXPENSE_BELOW_ALLOCATIONS/)

      // 2.8 Sahkan pemindahan ke E_dst via activate_asset (Snapshot v2)
      const act3v2 = await restFetch('/rpc/activate_asset', {
        method: 'POST',
        token: ownerToken,
        body: { p_asset_id: a3Id, p_activation_notes: 'Pengesahan Pindah ke E_dst' },
      })
      assert.equal(act3v2.status, 200)
      assert.equal(act3v2.data.version, 2)

      // 2.9 Setelah disahkan ke E_dst, E_src telah bebas dari komitmen C3!
      // Sekarang E_src sah diturunkan ke Rp 500.000!
      const patchSrcOk = await restFetch(`/expenses?id=eq.${eSrcId}`, {
        method: 'PATCH',
        token: ownerToken,
        body: { nominal: 500000 },
      })
      assert.equal(patchSrcOk.status, 204)
    })

    await t.test('3. Pengujian Konkurensi PostgreSQL: Mutasi Nominal vs Penambahan Alokasi Bersamaan', async () => {
      // Skenario Konkurensi:
      // Pengeluaran E_race bernilai Rp 10.000.000.
      // Sudah ada alokasi resmi Rp 6.000.000. Sisa kapasitas Rp 4.000.000.
      // Sesi 1 mencoba menurunkan nominal pengeluaran menjadi Rp 7.000.000 (tersisa kapasitas 1jt).
      // Sesi 2 bersamaan mencoba merevisi/menambah alokasi komponen lain sebesar Rp 3.500.000.
      // Karena row-locking (FOR UPDATE) diterapkan secara konsisten, salah satu transaksi akan menunggu
      // dan transaksi yang berbenturan akan tertolak aman (tidak ada over-allocation).

      const client1 = await createPgClient()
      const client2 = await createPgClient()

      try {
        // Buat pengeluaran uji bersama
        const expRes = await dbClient.query(`
          INSERT INTO public.expenses (org_id, location_id, kategori, nominal, tanggal_pengeluaran, keterangan)
          VALUES ($1, $2, 'Operasional', 10000000, '2026-06-01', 'E_race 10jt')
          RETURNING id;
        `, [orgId, locId])
        const eRaceId = expRes.rows[0].id

        // Buat aset & komponen awal dialokasikan Rp 6.000.000 dan aktifkan
        const aRes = await dbClient.query(`
          INSERT INTO public.assets (org_id, location_id, nama_aset, kategori_aset, dasar_penggunaan, status_pencatatan)
          VALUES ($1, $2, 'Aset Race 1', 'elektronik_kantor', 'milik_sendiri', 'draft')
          RETURNING id;
        `, [orgId, locId])
        const aRaceId = aRes.rows[0].id

        const cRes = await dbClient.query(`
          INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa, masa_manfaat_bulan, tanggal_siap_guna, pola_penggunaan, porsi_usaha_persen, status_kapitalisasi, metode_penyusutan, expense_id, allocated_cost)
          VALUES ($1, $2, 'C_race 1', 'perolehan_baru', 6000000, 0, 36, '2026-06-01', 'seluruhnya_usaha', 100, 'kapitalisasi', 'garis_lurus', $3, 6000000)
          RETURNING id;
        `, [orgId, aRaceId, eRaceId])
        const cRaceId = cRes.rows[0].id

        // Aktifkan aset race 1 via REST API resmi sebagai owner
        const actRace1 = await restFetch('/rpc/activate_asset', {
          method: 'POST',
          token: ownerToken,
          body: { p_asset_id: aRaceId, p_activation_notes: 'Aktivasi Race 1' },
        })
        assert.equal(actRace1.status, 200)

        // Buat draft komponen kedua pada aset lain tanpa alokasi awal
        const a2Res = await dbClient.query(`
          INSERT INTO public.assets (org_id, location_id, nama_aset, kategori_aset, dasar_penggunaan, status_pencatatan)
          VALUES ($1, $2, 'Aset Race 2', 'elektronik_kantor', 'milik_sendiri', 'draft')
          RETURNING id;
        `, [orgId, locId])
        const aRace2Id = a2Res.rows[0].id

        const c2Res = await dbClient.query(`
          INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa, masa_manfaat_bulan, tanggal_siap_guna, pola_penggunaan, porsi_usaha_persen, status_kapitalisasi, metode_penyusutan)
          VALUES ($1, $2, 'C_race 2', 'perolehan_baru', 5000000, 0, 36, '2026-06-01', 'seluruhnya_usaha', 100, 'kapitalisasi', 'garis_lurus')
          RETURNING id;
        `, [orgId, aRace2Id])
        const cRace2Id = c2Res.rows[0].id

        // Eksekusi balapan:
        // Transaksi 1: menurunkan nominal E_race ke Rp 7.000.000
        // Transaksi 2: mengalokasikan Rp 3.500.000 pada C_race 2 ke E_race (total butuh 6jt + 3.5jt = 9.5jt)
        const t1 = async () => {
          try {
            await client1.query('BEGIN;')
            await client1.query(`
              UPDATE public.expenses SET nominal = 7000000 WHERE id = $1;
            `, [eRaceId])
            await new Promise(r => setTimeout(r, 50))
            await client1.query('COMMIT;')
            return { ok: true, actor: 't1' }
          } catch (err) {
            await client1.query('ROLLBACK;').catch(() => {})
            return { ok: false, actor: 't1', error: err.message }
          }
        }

        const t2 = async () => {
          try {
            await client2.query('BEGIN;')
            await new Promise(r => setTimeout(r, 10))
            await client2.query(`
              UPDATE public.asset_components
              SET expense_id = $1, allocated_cost = 3500000
              WHERE id = $2;
            `, [eRaceId, cRace2Id])
            await client2.query('COMMIT;')
            return { ok: true, actor: 't2' }
          } catch (err) {
            await client2.query('ROLLBACK;').catch(() => {})
            return { ok: false, actor: 't2', error: err.message }
          }
        }

        const [res1, res2] = await Promise.all([t1(), t2()])

        // Verifikasi hasil:
        // Satu transaksi harus berhasil dan satu harus ditolak karena kapasitas 7jt tidak cukup untuk 6jt + 3.5jt!
        const successCount = (res1.ok ? 1 : 0) + (res2.ok ? 1 : 0)
        assert.equal(successCount, 1, `Harus tepat 1 transaksi yang berhasil. Hasil: t1=${res1.ok}, t2=${res2.ok}`)

        if (!res1.ok) {
          assert.match(res1.error, /SIMKOS_EXPENSE_BELOW_ALLOCATIONS/)
        }
        if (!res2.ok) {
          assert.match(res2.error, /SIMKOS_OVERALLOCATED_EXPENSE/)
        }

        // Verifikasi integritas akhir pengeluaran tidak pernah over-allocated
        const finalCheck = await dbClient.query(`
          SELECT nominal, public.get_expense_effective_allocated_cost(id) as effective_allocated
          FROM public.expenses
          WHERE id = $1;
        `, [eRaceId])
        const finalNominal = Number(finalCheck.rows[0].nominal)
        const finalAllocated = Number(finalCheck.rows[0].effective_allocated)
        assert.ok(finalNominal >= finalAllocated, `Nominal (${finalNominal}) harus >= alokasi efektif (${finalAllocated})`)
      } finally {
        await client1.end().catch(() => {})
        await client2.end().catch(() => {})
      }
    })

    // ------------------------------------------------------------------------
    // Subtest 4: Verifikasi Helper Alokasi sebagai Fungsi Internal (Blokir Pemanggilan REST Langsung)
    // ------------------------------------------------------------------------
    await t.test('4. Proteksi Helper Internal: Pemanggilan Langsung get_expense_effective_allocated_cost via REST Ditolak (Anonim & Lintas Organisasi)', async () => {
      // 4.1 Pemanggilan RPC langsung oleh anonim
      const anonRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_expense_effective_allocated_cost`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_expense_id: '11111111-1111-1111-1111-111111111111' }),
      })
      // PostgREST merespons 404/401/403 jika izin eksekusi dicabut dari anon / public
      assert.ok(
        [401, 403, 404].includes(anonRes.status),
        `Pemanggilan helper oleh anonim harus ditolak (HTTP 401/403/404), dapat: ${anonRes.status}`
      )

      // 4.2 Pemanggilan RPC langsung oleh pengguna organisasi lain (Org B)
      const loginB = await loginUser('ownerb@simkos.test', 'testpass123')
      const userBRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_expense_effective_allocated_cost`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${loginB.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_expense_id: '11111111-1111-1111-1111-111111111111' }),
      })
      assert.ok(
        [401, 403, 404].includes(userBRes.status),
        `Pemanggilan helper oleh pengguna terautentikasi harus ditolak (HTTP 401/403/404), dapat: ${userBRes.status}`
      )

      // 4.3 Pemanggilan RPC langsung oleh owner organisasi sendiri (Org A) juga harus ditolak karena ini fungsi internal
      const userARes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_expense_effective_allocated_cost`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_expense_id: '11111111-1111-1111-1111-111111111111' }),
      })
      assert.ok(
        [401, 403, 404].includes(userARes.status),
        `Pemanggilan helper oleh owner via REST harus ditolak (fungsi internal murni), dapat: ${userARes.status}`
      )

      // 4.4 Pastikan trigger dan RPC resmi (activate_asset, update expenses) tetap berfungsi normal dengan SECURITY DEFINER
      const expTestRes = await dbClient.query(`
        INSERT INTO public.expenses (org_id, location_id, kategori, nominal, tanggal_pengeluaran, keterangan)
        VALUES ($1, $2, 'Uji Helper Internal', 2000000, '2026-06-01', 'Test Trigger')
        RETURNING id;
      `, [orgId, locId])
      const expTestId = expTestRes.rows[0].id

      // Direct patch expenses via REST oleh Owner A: harus berhasil karena trigger DB internal dapat mengeksekusi helper
      const patchExpRes = await fetch(`${SUPABASE_URL}/rest/v1/expenses?id=eq.${expTestId}`, {
        method: 'PATCH',
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ nominal: 2500000 }),
      })
      assert.equal(patchExpRes.status, 200, 'Trigger validasi expenses harus tetap bekerja normal saat dipanggil via REST')
      const patched = await patchExpRes.json()
      assert.equal(Number(patched[0].nominal), 2500000)
    })
  } finally {
    if (dbClient) {
      await dbClient.end().catch(() => {})
    }
    if (stack && typeof stack.stop === 'function') {
      await stack.stop().catch(() => {})
    }
  }
})
