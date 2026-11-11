/**
 * Fase 5B — Pengujian API Lintas Organisasi & Peran (GoTrue v2.197.0 + PostgREST 16.5)
 *
 * Menguji:
 * 1. Otorisasi RPC get_period_financial_report untuk owner, admin, dan staff Org A (diizinkan)
 *    serta penolakan untuk owner Org B dan anon (SIMKOS_FORBIDDEN).
 * 2. Penolakan filter lokasi lintas organisasi (SIMKOS_CROSS_TENANT_LOCATION) dan format
 *    periode non-bulan penuh (SIMKOS_FULL_MONTH_REQUIRED).
 * 3. Penolakan direct HTTP PATCH / DELETE atas allocated_cost, expense_id, status_kapitalisasi,
 *    assets.location_id, dan transaksi expenses yang telah terikat snapshot aset aktif.
 * 4. Siklus REST penuh: aktivasi aset berrelasi pengeluaran -> laporan lengkap -> revisi alokasi
 *    via RPC revise_component_parameters -> preservasi nilai referensi selama perlu_pengesahan_ulang
 *    -> pengesahan ulang via activate_asset -> verifikasi allocation_revision_history.
 */

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

test('Fase 5B API: Integrasi Laporan Internal via GoTrue & PostgREST', { timeout: 90000 }, async (t) => {
  let stack = null
  let ownerA, adminA, staffA, ownerB
  let orgA, orgB, locA, locB

  try {
    stack = await startSupabaseStack()

    await t.test('1. Otentikasi GoTrue & Isolasi Organisasi/Peran pada get_period_financial_report', async () => {
      ownerA = await loginUser('owner@simkos.test', 'testpass123')
      adminA = await loginUser('admin@simkos.test', 'testpass123')
      staffA = await loginUser('staff@simkos.test', 'testpass123')
      ownerB = await loginUser('ownerb@simkos.test', 'testpass123')

      const orgResA = await restFetch('/organizations?name=eq.SimKos&select=id,name', { token: ownerA.access_token })
      assert.equal(orgResA.status, 200)
      orgA = orgResA.data[0].id

      const orgResB = await restFetch('/organizations?name=eq.Kos Lain&select=id,name', { token: ownerB.access_token })
      assert.equal(orgResB.status, 200)
      orgB = orgResB.data[0].id

      const locResA = await restFetch(`/locations?org_id=eq.${orgA}&select=id,nama_lokasi&limit=1`, { token: ownerA.access_token })
      assert.equal(locResA.status, 200)
      locA = locResA.data[0].id

      const locResB = await restFetch(`/locations?org_id=eq.${orgB}&select=id,nama_lokasi&limit=1`, { token: ownerB.access_token })
      assert.equal(locResB.status, 200)
      locB = locResB.data[0].id

      // Owner A, Admin A, dan Staff A wajib diizinkan memanggil get_period_financial_report untuk Org A
      for (const [roleName, userObj] of [
        ['owner', ownerA],
        ['admin', adminA],
        ['staff', staffA],
      ]) {
        const repRes = await restFetch('/rpc/get_period_financial_report', {
          method: 'POST',
          token: userObj.access_token,
          body: { p_org_id: orgA, p_period_key: '2026-08', p_location_id: locA },
        })
        assert.equal(repRes.status, 200, `${roleName} Org A harus diizinkan membaca laporan keuangan internal`)
        assert.equal(repRes.data.org_id, orgA)
        assert.equal(repRes.data.period_key, '2026-08')
      }

      // Owner B mencoba membaca laporan Org A -> Ditolak SIMKOS_FORBIDDEN
      const crossOrgTry = await restFetch('/rpc/get_period_financial_report', {
        method: 'POST',
        token: ownerB.access_token,
        body: { p_org_id: orgA, p_period_key: '2026-08', p_location_id: null },
      })
      assert.ok(crossOrgTry.status >= 400, 'Owner B harus ditolak membaca laporan Org A')
      assert.ok(JSON.stringify(crossOrgTry.data).includes('SIMKOS_FORBIDDEN'))

      // Anon (tanpa token Bearer) mencoba membaca laporan Org A -> Ditolak
      const anonTry = await restFetch('/rpc/get_period_financial_report', {
        method: 'POST',
        body: { p_org_id: orgA, p_period_key: '2026-08', p_location_id: null },
      })
      assert.ok(anonTry.status >= 400, 'Anon harus ditolak memanggil get_period_financial_report')
    })

    await t.test('2. Validasi Filter Lokasi Lintas Organisasi & Periode Bulan Penuh via REST', async () => {
      // Owner A memfilter laporan Org A menggunakan location_id milik Org B -> SIMKOS_CROSS_TENANT_LOCATION
      const crossLocTry = await restFetch('/rpc/get_period_financial_report', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_org_id: orgA, p_period_key: '2026-08', p_location_id: locB },
      })
      assert.ok(crossLocTry.status >= 400, 'Filter lokasi lintas organisasi harus ditolak')
      assert.ok(JSON.stringify(crossLocTry.data).includes('SIMKOS_CROSS_TENANT_LOCATION'))

      // Format periode non-bulan penuh -> SIMKOS_FULL_MONTH_REQUIRED
      for (const invalidKey of ['2026-08-01', '2026-13', '2026/08', '2026-8']) {
        const badPeriodTry = await restFetch('/rpc/get_period_financial_report', {
          method: 'POST',
          token: ownerA.access_token,
          body: { p_org_id: orgA, p_period_key: invalidKey, p_location_id: null },
        })
        assert.ok(badPeriodTry.status >= 400, `Periode ${invalidKey} harus ditolak`)
        assert.ok(JSON.stringify(badPeriodTry.data).includes('SIMKOS_FULL_MONTH_REQUIRED'))
      }
    })

    let expId, assetId, compId, batchId
    await t.test('3. Proteksi Direct PATCH / DELETE Alokasi & Lokasi serta Alur Revisi Alokasi via REST', async () => {
      // Pastikan tanggal mulai pembukuan disetel ke 2026-08-01
      const setStartRes = await restFetch('/rpc/set_bookkeeping_start_date', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_org_id: orgA, p_start_date: '2026-08-01' },
      })
      assert.equal(setStartRes.status, 200)

      // 3.1 Buat pengeluaran nota campuran Rp 4.000.000 pada Agustus 2026 di locA
      const createExp = await restFetch('/expenses', {
        method: 'POST',
        token: ownerA.access_token,
        headers: { Prefer: 'return=representation' },
        body: {
          org_id: orgA,
          location_id: locA,
          tanggal_pengeluaran: '2026-08-10',
          nominal: 4000000,
          kategori: 'Perbaikan & Aset',
          keterangan: 'Nota Campuran Water Heater + Pasang Pipa',
        },
      })
      assert.equal(createExp.status, 201)
      expId = createExp.data[0].id

      // 3.2 Buat aset draf & komponen terhubung ke expId dengan allocated_cost = 3.600.000
      const createAsset = await restFetch('/assets', {
        method: 'POST',
        token: ownerA.access_token,
        headers: { Prefer: 'return=representation' },
        body: {
          org_id: orgA,
          location_id: locA,
          nama_aset: 'Water Heater Kamar Utama',
          kategori_aset: 'elektronik_kantor',
          dasar_penggunaan: 'milik_sendiri',
          status_pencatatan: 'draft',
        },
      })
      assert.equal(createAsset.status, 201)
      assetId = createAsset.data[0].id

      const createComp = await restFetch('/asset_components', {
        method: 'POST',
        token: ownerA.access_token,
        headers: { Prefer: 'return=representation' },
        body: {
          asset_id: assetId,
          org_id: orgA,
          nama_komponen: 'Unit Water Heater Ariston',
          jenis_pekerjaan: 'perolehan_baru',
          biaya_perolehan: 3600000,
          nilai_sisa: 0,
          masa_manfaat_bulan: 36,
          tanggal_siap_guna: '2026-08-01',
          pola_penggunaan: 'seluruhnya_usaha',
          porsi_usaha_persen: 100,
          status_kapitalisasi: 'kapitalisasi',
          metode_penyusutan: 'garis_lurus',
          expense_id: expId,
          allocated_cost: 3600000,
        },
      })
      assert.equal(createComp.status, 201)
      compId = createComp.data[0].id

      // 3.3 Aktifkan aset (Snapshot v1) & posting penyusutan Agustus 2026
      const actRes = await restFetch('/rpc/activate_asset', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_asset_id: assetId, p_activation_notes: 'Aktivasi Water Heater v1' },
      })
      assert.equal(actRes.status, 200)
      assert.equal(actRes.data.location_id, locA)
      assert.equal(actRes.data.location_recorded, true)

      const prevRes = await restFetch('/rpc/preview_depreciation_posting', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_org_id: orgA, p_period_key: '2026-08' },
      })
      assert.equal(prevRes.status, 200)

      const postNotes = 'Posting Agustus 2026 Batch 1'
      const postRes = await restFetch('/rpc/post_depreciation_batch', {
        method: 'POST',
        token: ownerA.access_token,
        body: {
          p_org_id: orgA,
          p_period_key: '2026-08',
          p_idempotency_key: 'api-f5-b1',
          p_payload_hash: getCanonicalHash(orgA, '2026-08', postNotes),
          p_preview_token: prevRes.data.preview_token,
          p_notes: postNotes,
        },
      })
      assert.equal(postRes.status, 200)
      batchId = postRes.data.id

      // 3.4 Coba direct PATCH allocated_cost pada komponen bersnapshot -> WAJIB DITOLAK
      const patchAlloc = await restFetch(`/asset_components?id=eq.${compId}`, {
        method: 'PATCH',
        token: ownerA.access_token,
        body: { allocated_cost: 3000000 },
      })
      assert.ok(patchAlloc.status >= 400, 'Direct PATCH allocated_cost harus ditolak')
      assert.ok(JSON.stringify(patchAlloc.data).includes('SIMKOS_LOCKED_FINANCIAL_PARAMETERS'))

      // 3.5 Coba direct PATCH location_id pada aset bersnapshot -> WAJIB DITOLAK
      const patchAssetLoc = await restFetch(`/assets?id=eq.${assetId}`, {
        method: 'PATCH',
        token: ownerA.access_token,
        body: { location_id: null },
      })
      assert.ok(patchAssetLoc.status >= 400, 'Direct PATCH location_id aset bersnapshot harus ditolak')
      assert.ok(JSON.stringify(patchAssetLoc.data).includes('SIMKOS_LOCKED_ASSET_LOCATION'))

      // 3.6 Coba direct PATCH menurunkan nominal di bawah alokasi & mengubah tanggal/lokasi pada expenses terikat snapshot -> WAJIB DITOLAK
      const patchExpBelow = await restFetch(`/expenses?id=eq.${expId}`, {
        method: 'PATCH',
        token: ownerA.access_token,
        body: { nominal: 3000000 },
      })
      assert.ok(patchExpBelow.status >= 400, 'Direct PATCH nominal di bawah alokasi harus ditolak')
      assert.ok(JSON.stringify(patchExpBelow.data).includes('SIMKOS_EXPENSE_BELOW_ALLOCATIONS'))

      const patchExpLocked = await restFetch(`/expenses?id=eq.${expId}`, {
        method: 'PATCH',
        token: ownerA.access_token,
        body: { tanggal_pengeluaran: '2026-09-10' },
      })
      assert.ok(patchExpLocked.status >= 400, 'Direct PATCH tanggal_pengeluaran expense terikat snapshot harus ditolak')
      assert.ok(JSON.stringify(patchExpLocked.data).includes('SIMKOS_EXPENSE_LOCKED_BY_ACTIVE_ASSET'))

      // 3.7 Coba direct DELETE pada expenses terikat komponen/snapshot -> WAJIB DITOLAK
      const delExp = await restFetch(`/expenses?id=eq.${expId}`, {
        method: 'DELETE',
        token: ownerA.access_token,
      })
      assert.ok(delExp.status >= 400, 'Direct DELETE expense terikat komponen harus ditolak')
      assert.ok(JSON.stringify(delExp.data).includes('SIMKOS_EXPENSE_HAS_ALLOCATED_ASSET'))

      // 3.8 Storno Batch 1, lalu revisi alokasi melalui RPC revise_component_parameters (3,6jt -> 3,24jt)
      const revBatch = await restFetch('/rpc/reverse_depreciation_batch', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_batch_id: batchId, p_reason: 'Storno untuk revisi alokasi Water Heater' },
      })
      assert.equal(revBatch.status, 200)

      const revComp = await restFetch('/rpc/revise_component_parameters', {
        method: 'POST',
        token: ownerA.access_token,
        body: {
          p_component_id: compId,
          p_biaya_perolehan: 3240000,
          p_nilai_sisa: 0,
          p_masa_manfaat_bulan: 36,
          p_tanggal_siap_guna: '2026-08-01',
          p_porsi_usaha_persen: 100,
          p_metode_penyusutan: 'garis_lurus',
          p_status_kapitalisasi: 'kapitalisasi',
          p_revision_notes: 'Koreksi alokasi nota campuran Water Heater ke Rp 3.240.000',
          p_expense_id: expId,
          p_allocated_cost: 3240000,
          p_update_expense_allocation: true,
        },
      })
      assert.equal(revComp.status, 200)
      assert.equal(revComp.data.requires_reapproval, true)
      assert.equal(Number(revComp.data.allocated_cost), 3240000)

      // 3.9 Selama perlu_pengesahan_ulang, verifikasi get_period_financial_report mempertahankan referensi v1 (3.600.000)
      const repPending = await restFetch('/rpc/get_period_financial_report', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_org_id: orgA, p_period_key: '2026-08', p_location_id: locA },
      })
      assert.equal(repPending.status, 200)
      assert.equal(repPending.data.completeness.is_complete, false)
      assert.equal(repPending.data.completeness.status_code, 'BELUM_LENGKAP_KEDUANYA')
      assert.equal(repPending.data.income_statement.approved_capitalized_deduction, 3600000)
      assert.equal(repPending.data.income_statement.pending_allocations.reapproval_reference_amount, 3600000)
      assert.equal(repPending.data.income_statement.pending_allocations.reapproval_proposed_amount, 3240000)
      assert.equal(repPending.data.income_statement.pending_allocations.reapproval_proposed_delta, -360000)

      // 3.10 Sahkan ulang (Snapshot v2) & posting Batch 2 -> Laporan menjadi Lengkap & mencatat allocation_revision_history
      const reactRes = await restFetch('/rpc/activate_asset', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_asset_id: assetId, p_activation_notes: 'Pengesahan ulang Water Heater v2' },
      })
      assert.equal(reactRes.status, 200)
      assert.equal(reactRes.data.version, 2)

      const prev2 = await restFetch('/rpc/preview_depreciation_posting', {
        method: 'POST',
        token: ownerA.access_token,
        body: { p_org_id: orgA, p_period_key: '2026-08' },
      })
      const postNotes2 = 'Posting Agustus 2026 Batch 2'
      const post2 = await restFetch('/rpc/post_depreciation_batch', {
        method: 'POST',
        token: ownerA.access_token,
        body: {
          p_org_id: orgA,
          p_period_key: '2026-08',
          p_idempotency_key: 'api-f5-b2',
          p_payload_hash: getCanonicalHash(orgA, '2026-08', postNotes2),
          p_preview_token: prev2.data.preview_token,
          p_notes: postNotes2,
        },
      })
      assert.equal(post2.status, 200)

      const repFinal = await restFetch('/rpc/get_period_financial_report', {
        method: 'POST',
        token: staffA.access_token, // dibaca oleh staffA
        body: { p_org_id: orgA, p_period_key: '2026-08', p_location_id: locA },
      })
      assert.equal(repFinal.status, 200)
      assert.equal(repFinal.data.completeness.is_complete, true)
      assert.equal(repFinal.data.completeness.status_code, 'LENGKAP_DIBUKUKAN')
      assert.equal(repFinal.data.income_statement.approved_capitalized_deduction, 3240000)
      assert.equal(repFinal.data.income_statement.depreciation_business_portion, 90000)
      assert.equal(repFinal.data.allocation_revision_history.length, 1)
      assert.equal(repFinal.data.allocation_revision_history[0].operating_expense_delta, 360000)
    })
  } finally {
    if (stack) {
      await stack.stop()
    }
  }
})
