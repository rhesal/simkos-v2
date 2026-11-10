import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { startSupabaseStack } from '../../scripts/start_qa_supabase.mjs'

const SUPABASE_URL = 'http://127.0.0.1:8432'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1xYSIsInJvbGUiOiJhbm9uIiwiZXhwIjoyNTM0MDIzMDA3OTl9.qa-anon-key'

function getCanonicalHash(orgId, periodKey, notes = '') {
  return crypto.createHash('md5').update(`${orgId}|${periodKey}|${notes ? notes.trim() : ''}`).digest('hex')
}

async function loginUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
    },
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
  const opts = {
    method,
    headers: reqHeaders,
  }
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

test('Fase 4B-1R API: Pengujian GoTrue Resmi & PostgREST Terproteksi', { timeout: 90000 }, async (t) => {
  let stack = null
  let ownerA, adminA, staffA, ownerB
  let orgA, orgB

  try {
    stack = await startSupabaseStack()

    // ------------------------------------------------------------------------
    // 1. Login Semua Peran Melalui GoTrue v2.197.0 Resmi
    // ------------------------------------------------------------------------
    await t.test('1. Otentikasi GoTrue Resmi: Owner, Admin, Staff (Org A) & Owner (Org B)', async () => {
      ownerA = await loginUser('owner@simkos.test', 'testpass123')
      adminA = await loginUser('admin@simkos.test', 'testpass123')
      staffA = await loginUser('staff@simkos.test', 'testpass123')
      ownerB = await loginUser('ownerb@simkos.test', 'testpass123')

      assert.ok(ownerA.access_token, 'Owner A harus menerima access_token resmi')
      assert.ok(adminA.access_token, 'Admin A harus menerima access_token resmi')
      assert.ok(staffA.access_token, 'Staff A harus menerima access_token resmi')
      assert.ok(ownerB.access_token, 'Owner B harus menerima access_token resmi')

      // Dapatkan data organisasi SimKos dan Kos Lain
      const orgResA = await restFetch('/organizations?name=eq.SimKos&select=id,name', { token: ownerA.access_token })
      assert.equal(orgResA.status, 200)
      assert.equal(orgResA.data.length, 1)
      orgA = orgResA.data[0].id

      const orgResB = await restFetch('/organizations?name=eq.Kos Lain&select=id,name', { token: ownerB.access_token })
      assert.equal(orgResB.status, 200)
      assert.equal(orgResB.data.length, 1)
      orgB = orgResB.data[0].id

      assert.notEqual(orgA, orgB, 'ID Org A dan Org B harus berbeda')
    })

    // ------------------------------------------------------------------------
    // 2. Otorisasi Konfigurasi Tanggal Mulai Pembukuan & Isolasi Tenant
    // ------------------------------------------------------------------------
    await t.test('2. Otorisasi Konfigurasi Pembukuan via REST RPC', async () => {
      // 2.1 Staff A mencoba mengatur tanggal pembukuan -> Ditolak SIMKOS_FORBIDDEN
      const staffTry = await restFetch('/rpc/set_bookkeeping_start_date', {
        method: 'POST',
        token: staffA.access_token,
        body: { p_org_id: orgA, p_start_date: '2027-01-01' },
      })
      assert.ok(staffTry.status >= 400, 'Staff harus ditolak mengatur tanggal pembukuan')
      assert.ok(JSON.stringify(staffTry.data).includes('SIMKOS_FORBIDDEN'))

      // 2.2 Owner B mencoba mengatur tanggal pembukuan Org A -> Ditolak SIMKOS_FORBIDDEN
      const crossTry = await restFetch('/rpc/set_bookkeeping_start_date', {
        method: 'POST',
        token: ownerB.access_token,
        body: { p_org_id: orgA, p_start_date: '2027-01-01' },
      })
      assert.ok(crossTry.status >= 400, 'Akses lintas organisasi harus ditolak')
      assert.ok(JSON.stringify(crossTry.data).includes('SIMKOS_FORBIDDEN'))

      // 2.3 Owner A berhasil mengatur tanggal pembukuan Org A
      const ownerSuccess = await restFetch('/rpc/set_bookkeeping_start_date', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_org_id: orgA, p_start_date: '2027-01-01' },
      })
      assert.equal(ownerSuccess.status, 200, 'Owner A harus berhasil mengatur tanggal pembukuan')
      assert.equal(ownerSuccess.data.tanggal_mulai_pembukuan, '2027-01-01')
    })

    // ------------------------------------------------------------------------
    // 3. Perlindungan Terhadap Mutasi Langsung via REST Endpoint
    // ------------------------------------------------------------------------
    let assetId, compId
    await t.test('3. Pencegahan Mutasi Langsung Status, Kategori, & Parameter Finansial via REST', async () => {
      // Buat aset baru berstatus 'draft' via REST
      const createAssetRes = await restFetch('/assets', {
        method: 'POST',
        token: ownerA.access_token,
        headers: { Prefer: 'return=representation' },
        body: {
          org_id: orgA,
          nama_aset: 'Server Rak Lab',
          kategori_aset: 'elektronik_kantor',
          dasar_penggunaan: 'milik_sendiri',
          status_pencatatan: 'draft',
        },
      })
      assert.equal(createAssetRes.status, 201, 'Aset draf berhasil dibuat')
      assetId = createAssetRes.data[0].id

      // Buat komponen dengan tanggal siap guna historis (sebelum cutoff 2027-01-01)
      const createCompRes = await restFetch('/asset_components', {
        method: 'POST',
        token: ownerA.access_token,
        headers: { Prefer: 'return=representation' },
        body: {
          asset_id: assetId,
          org_id: orgA,
          nama_komponen: 'Mesin Server',
          biaya_perolehan: 12000000,
          nilai_sisa: 0,
          masa_manfaat_bulan: 60,
          tanggal_siap_guna: '2024-06-16',
          porsi_usaha_persen: 100,
          status_kapitalisasi: 'kapitalisasi',
          metode_penyusutan: 'garis_lurus',
        },
      })
      assert.equal(createCompRes.status, 201)
      compId = createCompRes.data[0].id

      // 3.1 Coba langsung PATCH status_pencatatan menjadi 'aktif' via REST -> WAJIB DITOLAK
      const directPatchStatus = await restFetch(`/assets?id=eq.${assetId}`, {
        method: 'PATCH',
        token: ownerA.access_token,
        body: { status_pencatatan: 'aktif' },
      })
      assert.ok(directPatchStatus.status >= 400, 'Direct PATCH status aset harus ditolak')
      assert.ok(JSON.stringify(directPatchStatus.data).includes('SIMKOS_DIRECT_ACTIVATION_FORBIDDEN'))

      // 3.2 Aktivasi resmi via RPC activate_asset -> BERHASIL
      const activateRes = await restFetch('/rpc/activate_asset', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_asset_id: assetId, p_activation_notes: 'Aktivasi via PostgREST RPC' },
      })
      assert.equal(activateRes.status, 200, 'Aktivasi via RPC resmi harus berhasil')
      assert.equal(activateRes.data.version, 1)
      assert.equal(activateRes.data.kategori_aset, 'elektronik_kantor')

      // 3.3 Coba langsung PATCH kategori_aset setelah aktivasi -> WAJIB DITOLAK
      const directPatchCategory = await restFetch(`/assets?id=eq.${assetId}`, {
        method: 'PATCH',
        token: ownerA.access_token,
        body: { kategori_aset: 'tanah' },
      })
      assert.ok(directPatchCategory.status >= 400, 'Direct PATCH kategori_aset harus ditolak setelah snapshot')
      assert.ok(JSON.stringify(directPatchCategory.data).includes('SIMKOS_LOCKED_ASSET_CATEGORY'))

      // 3.4 Sahkan saldo awal via RPC approve_component_opening_balance -> BERHASIL
      const approveObRes = await restFetch('/rpc/approve_component_opening_balance', {
        method: 'POST',
        token: ownerA.access_token,
        body: {
          p_component_id: compId,
          p_jalur: 'simulasi_historis',
          p_catatan: 'Pengesahan saldo awal via REST',
        },
      })
      assert.equal(approveObRes.status, 200)
      assert.equal(approveObRes.data.status, 'approved')

      // 3.5 Coba langsung PATCH biaya_perolehan master komponen -> WAJIB DITOLAK
      const directPatchCost = await restFetch(`/asset_components?id=eq.${compId}`, {
        method: 'PATCH',
        token: ownerA.access_token,
        body: { biaya_perolehan: 99999999 },
      })
      assert.ok(directPatchCost.status >= 400, 'Direct PATCH biaya perolehan harus ditolak')
      assert.ok(JSON.stringify(directPatchCost.data).includes('SIMKOS_LOCKED_FINANCIAL_PARAMETERS'))
    })

    // ------------------------------------------------------------------------
    // 4. Isolasi Multi-Tenant PostgREST (Tenant RLS Isolation)
    // ------------------------------------------------------------------------
    await t.test('4. Isolasi Multi-Tenant Data Pembukuan via PostgREST RLS', async () => {
      // Owner B mencoba membaca aset Org A -> kosong
      const getAssetsB = await restFetch(`/assets?id=eq.${assetId}`, { token: ownerB.access_token })
      assert.equal(getAssetsB.status, 200)
      assert.deepEqual(getAssetsB.data, [], 'Owner B tidak boleh dapat melihat aset Org A')

      // Owner B mencoba membaca snapshot Org A -> kosong
      const getSnapsB = await restFetch(`/asset_activation_snapshots?asset_id=eq.${assetId}`, { token: ownerB.access_token })
      assert.equal(getSnapsB.status, 200)
      assert.deepEqual(getSnapsB.data, [], 'Owner B tidak boleh dapat melihat snapshot Org A')

      // Owner B mencoba membaca saldo awal Org A -> kosong
      const getObsB = await restFetch(`/asset_opening_balances?component_id=eq.${compId}`, { token: ownerB.access_token })
      assert.equal(getObsB.status, 200)
      assert.deepEqual(getObsB.data, [], 'Owner B tidak boleh dapat melihat saldo awal Org A')

      // Owner B mencoba memanggil preview_depreciation_posting untuk Org A -> Ditolak
      const previewCross = await restFetch('/rpc/preview_depreciation_posting', {
        method: 'POST',
        token: ownerB.access_token,
        body: { p_org_id: orgA, p_period_key: '2027-01' },
      })
      assert.ok(previewCross.status >= 400)
      assert.ok(JSON.stringify(previewCross.data).includes('SIMKOS_FORBIDDEN'))
    })

    // ------------------------------------------------------------------------
    // 5. Alur Lengkap Pratinjau, Posting, Verifikasi Ledger, & Reversal via REST
    // ------------------------------------------------------------------------
    await t.test('5. Siklus Posting & Pembatalan via PostgREST RPC (Admin & Owner)', async () => {
      // 5.1 Admin A memanggil preview_depreciation_posting
      const prevRes = await restFetch('/rpc/preview_depreciation_posting', {
        method: 'POST',
        token: adminA.access_token,
        body: { p_org_id: orgA, p_period_key: '2027-01' },
      })
      assert.equal(prevRes.status, 200, 'Pratinjau oleh Admin A harus berhasil')
      const previewData = prevRes.data
      assert.ok(previewData.preview_token, 'Pratinjau harus mengembalikan preview_token')
      assert.equal(Number(previewData.total_depreciation), 200000, 'Beban Jan untuk server 12jt/60bln = 200.000')

      // 5.2 Hitung canonical hash
      const notesPost = 'Posting Batch Jan 2027 via PostgREST'
      const canonicalHash = getCanonicalHash(orgA, '2027-01', notesPost)

      // 5.3 Admin A memposting batch
      const postRes = await restFetch('/rpc/post_depreciation_batch', {
        method: 'POST',
        token: adminA.access_token,
        body: {
          p_org_id: orgA,
          p_period_key: '2027-01',
          p_idempotency_key: 'idemp-api-jan2027',
          p_payload_hash: canonicalHash,
          p_preview_token: previewData.preview_token,
          p_notes: notesPost,
        },
      })
      assert.equal(postRes.status, 200, 'Posting batch oleh Admin A harus berhasil')
      const batchData = postRes.data
      assert.equal(batchData.batch_status, 'posted')
      assert.equal(Number(batchData.total_depreciation), 200000)
      const postedBatchId = batchData.id

      // 5.4 Staff A dapat membaca buku pembantu (read-only)
      const staffReadLedger = await restFetch(`/asset_depreciation_ledger?batch_id=eq.${postedBatchId}`, {
        token: staffA.access_token,
      })
      assert.equal(staffReadLedger.status, 200)
      assert.equal(staffReadLedger.data.length, 1, 'Staff harus dapat membaca ledger yang diposting')
      assert.equal(Number(staffReadLedger.data[0].depreciation_amount), 200000)

      // 5.5 Staff A mencoba membatalkan batch -> DITOLAK SIMKOS_FORBIDDEN
      const staffRevTry = await restFetch('/rpc/reverse_depreciation_batch', {
        method: 'POST',
        token: staffA.access_token,
        body: { p_batch_id: postedBatchId, p_reason: 'Staff coba batalkan' },
      })
      assert.ok(staffRevTry.status >= 400, 'Staff harus dilarang membatalkan batch pembukuan')
      assert.ok(JSON.stringify(staffRevTry.data).includes('SIMKOS_FORBIDDEN'))

      // 5.6 Owner A membatalkan batch -> BERHASIL (Storno Reversal)
      const ownerRevRes = await restFetch('/rpc/reverse_depreciation_batch', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_batch_id: postedBatchId, p_reason: 'Pembatalan resmi oleh Owner via API' },
      })
      assert.equal(ownerRevRes.status, 200, 'Owner A berhasil membatalkan batch')
      assert.equal(ownerRevRes.data.batch_status, 'reversed')

      // 5.7 Verifikasi baris storno di ledger melalui REST
      const ledgerReversal = await restFetch(
        `/asset_depreciation_ledger?batch_id=eq.${postedBatchId}&entry_type=eq.reversal`,
        { token: ownerA.access_token }
      )
      assert.equal(ledgerReversal.status, 200)
      assert.equal(ledgerReversal.data.length, 1, 'Harus ada tepat 1 baris reversal storno di ledger')
      assert.equal(Number(ledgerReversal.data[0].depreciation_amount), -200000, 'Nominal storno harus -200.000')
    })

    // ------------------------------------------------------------------------
    // 6. Pengujian Negatif Revisi Parameter Komponen via REST API
    // ------------------------------------------------------------------------
    await t.test('6. Jalur Negatif Revisi Parameter & Wajib Re-Aktivasi via REST RPC', async () => {
      // 6.1 Revisi parameter komponen mesin server dari 12jt menjadi 24jt via RPC
      const revRes = await restFetch('/rpc/revise_component_parameters', {
        method: 'POST',
        token: ownerA.access_token,
        body: {
          p_component_id: compId,
          p_biaya_perolehan: 24000000,
          p_nilai_sisa: 0,
          p_masa_manfaat_bulan: 60,
          p_tanggal_siap_guna: '2024-06-16',
          p_porsi_usaha_persen: 100,
          p_metode_penyusutan: 'garis_lurus',
          p_status_kapitalisasi: 'kapitalisasi',
          p_revision_notes: 'Revisi biaya server ke 24jt via REST',
        },
      })
      assert.equal(revRes.status, 200, 'Revisi parameter via REST harus berhasil')

      // Verifikasi status aset berubah menjadi 'perlu_pengesahan_ulang'
      const checkAsset = await restFetch(`/assets?id=eq.${assetId}`, { token: ownerA.access_token })
      assert.equal(checkAsset.data[0].status_pencatatan, 'perlu_pengesahan_ulang')

      // 6.2 NEGATIF: Langsung sahkan saldo awal tanpa aktivasi ulang -> DITOLAK
      const tryOb = await restFetch('/rpc/approve_component_opening_balance', {
        method: 'POST',
        token: ownerA.access_token,
        body: {
          p_component_id: compId,
          p_jalur: 'simulasi_historis',
          p_catatan: 'Coba sahkan langsung tanpa aktivasi',
        },
      })
      assert.ok(tryOb.status >= 400, 'Pengesahan saldo awal tanpa aktivasi ulang wajib ditolak')
      assert.ok(JSON.stringify(tryOb.data).includes('SIMKOS_REAPPROVAL_REQUIRED'))

      // 6.3 NEGATIF: Langsung pratinjau penyusutan tanpa aktivasi ulang -> DITOLAK
      const tryPrev = await restFetch('/rpc/preview_depreciation_posting', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_org_id: orgA, p_period_key: '2027-01' },
      })
      assert.ok(tryPrev.status >= 400, 'Pratinjau penyusutan tanpa aktivasi ulang wajib ditolak')
      assert.ok(JSON.stringify(tryPrev.data).includes('SIMKOS_REAPPROVAL_REQUIRED'))

      // 6.4 Aktivasi ulang resmi via RPC activate_asset -> BERHASIL
      const reactRes = await restFetch('/rpc/activate_asset', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_asset_id: assetId, p_activation_notes: 'Aktivasi ulang setelah revisi 24jt' },
      })
      assert.equal(reactRes.status, 200)
      assert.equal(reactRes.data.version, 2)

      const checkAssetAfter = await restFetch(`/assets?id=eq.${assetId}`, { token: ownerA.access_token })
      assert.equal(checkAssetAfter.data[0].status_pencatatan, 'aktif', 'Status aset kembali aktif atomik')

      // 6.5 Sekarang sahkan saldo awal baru via REST RPC -> BERHASIL
      const okOb = await restFetch('/rpc/approve_component_opening_balance', {
        method: 'POST',
        token: ownerA.access_token,
        body: {
          p_component_id: compId,
          p_jalur: 'simulasi_historis',
          p_catatan: 'Pengesahan saldo awal resmi setelah aktivasi ulang',
        },
      })
      assert.equal(okOb.status, 200)
      assert.equal(okOb.data.status, 'approved')

      // 6.6 Pratinjau dan posting ulang untuk periode 2027-01
      const okPrev = await restFetch('/rpc/preview_depreciation_posting', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_org_id: orgA, p_period_key: '2027-01' },
      })
      assert.equal(okPrev.status, 200)
      // Server 24jt / 60 bln = 400.000 / bln
      assert.equal(Number(okPrev.data.total_depreciation), 400000, 'Beban pratinjau baru harus 400.000')

      const notesPost2 = 'Posting Jan setelah revisi 24jt'
      const hashPost2 = getCanonicalHash(orgA, '2027-01', notesPost2)

      const okPost = await restFetch('/rpc/post_depreciation_batch', {
        method: 'POST',
        token: ownerA.access_token,
        body: {
          p_org_id: orgA,
          p_period_key: '2027-01',
          p_idempotency_key: 'idemp-api-jan2027-rev24m',
          p_payload_hash: hashPost2,
          p_preview_token: okPrev.data.preview_token,
          p_notes: notesPost2,
        },
      })
      assert.equal(okPost.status, 200)
      const newBatchId = okPost.data.id

      // 6.7 Verifikasi nominal ledger memakai parameter baru: Rp400.000 (bukan Rp200.000)
      const ledgerCheck = await restFetch(`/asset_depreciation_ledger?batch_id=eq.${newBatchId}`, {
        token: ownerA.access_token,
      })
      assert.equal(ledgerCheck.status, 200)
      assert.equal(
        Number(ledgerCheck.data[0].depreciation_amount),
        400000,
        'Nominal beban di ledger terbukti nyata menggunakan parameter baru (Rp400.000)'
      )
    })
  } finally {
    if (stack) {
      console.log('[QA-API] Menghentikan Supabase stack...')
      await stack.stop()
    }
  }
})
