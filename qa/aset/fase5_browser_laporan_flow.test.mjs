/**
 * Fase 5B — Pengujian Browser E2E Integrasi Laporan Arus Kas & Hasil Usaha Internal
 *
 * Menguji alur nyata di Chrome (Puppeteer) + Vite + GoTrue v2.197.0 + PostgREST 16.5:
 * 1. Pemisahan Tab Arus Kas vs Tab Hasil Usaha Internal di /keuangan.
 * 2. Rekonsiliasi Tahap 1 (Belum Lengkap Klasifikasi: E4 perlu_telaah, nilai referensi tampil).
 * 3. Rekonsiliasi Tahap 2 (Lengkap — Sudah Dibukukan: Hasil Usaha Bersih Rp 1.086.000).
 * 4. Rekonsiliasi Tahap 3 (Storno Batch 1 + Revisi Alokasi E3 via modal UI Detail Aset ->
 *    Preservasi nilai referensi Snapshot v1 Rp 7.800.000 & usulan revisi Rp 4.500.000 terpisah
 *    tanpa hitung ganda, serta ketiadaan batch tampil sebagai "Belum dibukukan" / null).
 * 5. Rekonsiliasi Tahap 4 (Pengesahan ulang Snapshot v2 + Posting Batch 2 ->
 *    Lokasi 1 Kos Melati = Rp 790.000 + Riwayat Revisi Alokasi v1->v2;
 *    Lokasi 2 Kos Mawar tanpa ledger = Rp 0 Lengkap;
 *    Semua Lokasi Konsolidasi = Rp 190.000).
 * 6. Pembatasan periode bulan kalender penuh di /riwayat-transaksi (rentang tanggal parsial vs bulan penuh)
 *    serta verifikasi akses baca peran Staff.
 * 7. Bukti visual screenshot Desktop (1280x950) dan Mobile (390x844).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import pg from 'pg'
import puppeteer from 'puppeteer-core'
import { startSupabaseStack } from '../../scripts/start_qa_supabase.mjs'

const ROOT = path.resolve()
const CHROME_PATH = process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'

const SUPABASE_GATEWAY_URL = 'http://127.0.0.1:8432'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1xYSIsInJvbGUiOiJhbm9uIiwiZXhwIjoyNTM0MDIzMDA3OTl9.qa-anon-key'

const VITE_PORT = 5179
let APP_URL = `http://127.0.0.1:${VITE_PORT}`
const DB_PORT = 54322
const DB_NAME = 'simkos_qa_staging'
const DB_USER = process.env.USER || 'disnak'

const ARTIFACT_DIR = process.platform === 'win32'
  ? 'C:/Users/Disnak/.gemini/antigravity/brain/008b6dbe-f529-406f-aab3-6014d58f7bcb'
  : '/mnt/c/Users/Disnak/.gemini/antigravity/brain/008b6dbe-f529-406f-aab3-6014d58f7bcb'

function getCanonicalHash(orgId, periodKey, notes = '') {
  return crypto.createHash('md5').update(`${orgId}|${periodKey}|${notes ? notes.trim() : ''}`).digest('hex')
}

async function loginGoTrueUser(email, password) {
  const res = await fetch(`${SUPABASE_GATEWAY_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Login GoTrue gagal untuk ${email}: ${res.status} ${errText}`)
  }
  return await res.json()
}

async function callOfficialRpc(rpcName, payload, accessToken) {
  const res = await fetch(`${SUPABASE_GATEWAY_URL}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) {
    throw new Error(`RPC ${rpcName} gagal (${res.status}): ${text}`)
  }
  return data
}

async function setInputValue(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 10000 })
  await page.$eval(
    selector,
    (el, val) => {
      el.value = val
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    value
  )
}

async function clickElementWithText(page, selector, text) {
  await page.waitForFunction(
    ({ sel, txt }) => {
      const els = Array.from(document.querySelectorAll(sel))
      return els.some(el => el.textContent.includes(txt) && !el.disabled)
    },
    { timeout: 10000 },
    { sel: selector, txt: text }
  )
  await page.evaluate(
    ({ sel, txt }) => {
      const els = Array.from(document.querySelectorAll(sel))
      const target = els.find(el => el.textContent.includes(txt) && !el.disabled)
      if (target) target.click()
    },
    { sel: selector, txt: text }
  )
}

async function selectLocationInDropdown(page, locationLabel) {
  // Klik tombol trigger CustomLocationDropdown
  await page.waitForSelector('button[aria-expanded]', { timeout: 10000 })
  await page.click('button[aria-expanded]')
  await clickElementWithText(page, 'button', locationLabel)
  await new Promise(r => setTimeout(r, 400))
}

test('Fase 5B Browser E2E: Integrasi Laporan Arus Kas & Hasil Usaha Internal', { timeout: 180000 }, async (t) => {
  let supabaseStack = null
  let viteProcess = null
  let browser = null
  let orgId = null
  let ownerSession = null

  let locMelatiId = null
  let locMawarId = null
  let assetGedungId = null
  let assetKasurId = null
  let assetAcId = null
  let assetGensetId = null
  let assetCatId = null
  let compCatId = null
  let exp3Id = null
  let batch1Id = null

  try {
    // 1. Jalankan Stack Supabase Resmi
    console.log('[E2E-FASE5] Menyiapkan Supabase stack resmi...')
    supabaseStack = await startSupabaseStack()
    ownerSession = await loginGoTrueUser('owner@simkos.test', 'testpass123')

    // 2. Siapkan data Contoh Rekonsiliasi Bagian 9 pada periode 2026-06
    const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
    await pgClient.connect()
    try {
      const orgRes = await pgClient.query("SELECT id FROM public.organizations WHERE name = 'SimKos' LIMIT 1")
      orgId = orgRes.rows[0].id

      // Bersihkan transaksi Juni 2026 dan data pembukuan aset sebelumnya agar deterministik sesuai Bagian 9
      await pgClient.query(`
        TRUNCATE TABLE
          public.asset_depreciation_ledger,
          public.asset_depreciation_batches,
          public.asset_accounting_periods,
          public.asset_opening_balances,
          public.asset_activation_snapshots,
          public.asset_accounting_audit_logs,
          public.asset_bookkeeping_settings,
          public.asset_components,
          public.assets
        CASCADE;
      `)
      await pgClient.query(
        `DELETE FROM public.incomes WHERE org_id = $1 AND tanggal_bayar >= '2026-06-01' AND tanggal_bayar <= '2026-06-30'`,
        [orgId]
      )
      await pgClient.query(
        `DELETE FROM public.expenses WHERE org_id = $1 AND tanggal_pengeluaran >= '2026-06-01' AND tanggal_pengeluaran <= '2026-06-30'`,
        [orgId]
      )

      // Buat 2 Lokasi: Kos Melati Rekonsiliasi (Lokasi 1) & Kos Mawar Kosong (Lokasi 2)
      const loc1Res = await pgClient.query(
        `INSERT INTO public.locations (org_id, nama_lokasi) VALUES ($1, 'Kos Melati Rekonsiliasi') RETURNING id`,
        [orgId]
      )
      locMelatiId = loc1Res.rows[0].id

      const loc2Res = await pgClient.query(
        `INSERT INTO public.locations (org_id, nama_lokasi) VALUES ($1, 'Kos Mawar Kosong') RETURNING id`,
        [orgId]
      )
      locMawarId = loc2Res.rows[0].id

      // Buat 2 kamar & 2 rental di Kos Melati Rekonsiliasi untuk penerimaan sewa Juni 2026
      const room1Res = await pgClient.query(
        `INSERT INTO public.rooms (org_id, location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar)
         VALUES ($1, $2, 'M-01', 100000, 2000000, 'Terisi') RETURNING id`,
        [orgId, locMelatiId]
      )
      const room2Res = await pgClient.query(
        `INSERT INTO public.rooms (org_id, location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar)
         VALUES ($1, $2, 'M-02', 120000, 2500000, 'Terisi') RETURNING id`,
        [orgId, locMelatiId]
      )
      const tenant1Res = await pgClient.query(
        `INSERT INTO public.tenants (org_id, nama_lengkap) VALUES ($1, 'Rudi Melati 01') RETURNING id`,
        [orgId]
      )
      const tenant2Res = await pgClient.query(
        `INSERT INTO public.tenants (org_id, nama_lengkap) VALUES ($1, 'Siti Melati 02') RETURNING id`,
        [orgId]
      )
      const rental1Res = await pgClient.query(
        `INSERT INTO public.rentals (org_id, room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo, status_aktif)
         VALUES ($1, $2, $3, 'Bulanan', '2026-01-01', '2026-07-01', true) RETURNING id`,
        [orgId, room1Res.rows[0].id, tenant1Res.rows[0].id]
      )
      const rental2Res = await pgClient.query(
        `INSERT INTO public.rentals (org_id, room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo, status_aktif)
         VALUES ($1, $2, $3, 'Bulanan', '2026-01-01', '2026-07-01', true) RETURNING id`,
        [orgId, room2Res.rows[0].id, tenant2Res.rows[0].id]
      )

      // Incomes Juni 2026 di Kos Melati Rekonsiliasi = Rp 4.500.000
      await pgClient.query(
        `INSERT INTO public.incomes (org_id, rental_id, tanggal_bayar, nominal, keterangan) VALUES
          ($1, $2, '2026-06-05', 2000000, 'Sewa Kamar M-01 Juni 2026'),
          ($1, $3, '2026-06-10', 2500000, 'Sewa Kamar M-02 Juni 2026')`,
        [orgId, rental1Res.rows[0].id, rental2Res.rows[0].id]
      )

      // Expenses Juni 2026: E1 (800rb), E2 (3jt), E3 (5,5jt), E4 (1,2jt) di Lokasi 1 + E5 (500rb) Bersama
      const e2Res = await pgClient.query(
        `INSERT INTO public.expenses (org_id, location_id, tanggal_pengeluaran, nominal, kategori, keterangan)
         VALUES ($1, $2, '2026-06-15', 3000000, 'Inventaris', 'Pembelian Kasur Kamar M-01') RETURNING id`,
        [orgId, locMelatiId]
      )
      const exp2Id = e2Res.rows[0].id

      const e3Res = await pgClient.query(
        `INSERT INTO public.expenses (org_id, location_id, tanggal_pengeluaran, nominal, kategori, keterangan)
         VALUES ($1, $2, '2026-06-18', 5500000, 'Perbaikan & Aset', 'Nota Campuran AC Kamar M-02 + Cuci 3 AC') RETURNING id`,
        [orgId, locMelatiId]
      )
      exp3Id = e3Res.rows[0].id

      const e4Res = await pgClient.query(
        `INSERT INTO public.expenses (org_id, location_id, tanggal_pengeluaran, nominal, kategori, keterangan)
         VALUES ($1, $2, '2026-06-25', 1200000, 'Pemeliharaan', 'Pengecatan Dinding Kamar') RETURNING id`,
        [orgId, locMelatiId]
      )
      const exp4Id = e4Res.rows[0].id

      await pgClient.query(
        `INSERT INTO public.expenses (org_id, location_id, tanggal_pengeluaran, nominal, kategori, keterangan) VALUES
          ($1, $2, '2026-06-12', 800000, 'Listrik', 'Tagihan Listrik Kos Melati'),
          ($1, NULL, '2026-06-20', 500000, 'Internet', 'Tagihan Internet Fiber Bersama')`,
        [orgId, locMelatiId]
      )

      // Buat 5 Aset & Komponen sesuai Bagian 9
      assetGedungId = (await pgClient.query(
        `INSERT INTO public.assets (org_id, location_id, kode_aset, nama_aset, kategori_aset, status_pencatatan)
         VALUES ($1, $2, 'AST-GDG-M1', 'Gedung Kos Melati', 'gedung', 'draft') RETURNING id`,
        [orgId, locMelatiId]
      )).rows[0].id

      assetKasurId = (await pgClient.query(
        `INSERT INTO public.assets (org_id, location_id, kode_aset, nama_aset, kategori_aset, status_pencatatan)
         VALUES ($1, $2, 'AST-KSR-M1', 'Kasur Kamar M-01', 'fasilitas_kamar', 'draft') RETURNING id`,
        [orgId, locMelatiId]
      )).rows[0].id

      assetAcId = (await pgClient.query(
        `INSERT INTO public.assets (org_id, location_id, kode_aset, nama_aset, kategori_aset, status_pencatatan)
         VALUES ($1, $2, 'AST-AC-M2', 'AC Kamar M-02', 'elektronik_kantor', 'draft') RETURNING id`,
        [orgId, locMelatiId]
      )).rows[0].id

      assetGensetId = (await pgClient.query(
        `INSERT INTO public.assets (org_id, location_id, kode_aset, nama_aset, kategori_aset, status_pencatatan)
         VALUES ($1, NULL, 'AST-GNS-01', 'Genset Cadangan Utama', 'fasilitas_umum', 'draft') RETURNING id`,
        [orgId]
      )).rows[0].id

      assetCatId = (await pgClient.query(
        `INSERT INTO public.assets (org_id, location_id, kode_aset, nama_aset, kategori_aset, status_pencatatan)
         VALUES ($1, $2, 'AST-CAT-M1', 'Pekerjaan Pengecatan Dinding', 'gedung', 'draft') RETURNING id`,
        [orgId, locMelatiId]
      )).rows[0].id

      await pgClient.query(
        `INSERT INTO public.asset_components (
          asset_id, org_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
          masa_manfaat_bulan, tanggal_siap_guna, pola_penggunaan, porsi_usaha_persen,
          status_kapitalisasi, metode_penyusutan, expense_id, allocated_cost
        ) VALUES
          ($1, $5, 'Struktur Gedung Melati', 'perolehan_baru', 60000000, 0, 60, '2026-06-01', 'campuran', 60, 'kapitalisasi', 'garis_lurus', NULL, NULL),
          ($2, $5, 'Unit Kasur Springbed', 'perolehan_baru', 3000000, 0, 60, '2026-06-01', 'seluruhnya_usaha', 100, 'kapitalisasi', 'garis_lurus', $6, 3000000),
          ($3, $5, 'Unit AC Kamar M-02', 'perolehan_baru', 4800000, 0, 60, '2026-06-01', 'campuran', 80, 'kapitalisasi', 'garis_lurus', $7, 4800000),
          ($4, $5, 'Mesin Genset Bersama', 'perolehan_baru', 6000000, 0, 60, '2026-06-01', 'seluruhnya_usaha', 100, 'kapitalisasi', 'garis_lurus', NULL, NULL)`,
        [assetGedungId, assetKasurId, assetAcId, assetGensetId, orgId, exp2Id, exp3Id]
      )

      const catCompRes = await pgClient.query(
        `INSERT INTO public.asset_components (
          asset_id, org_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
          masa_manfaat_bulan, tanggal_siap_guna, pola_penggunaan, porsi_usaha_persen,
          status_kapitalisasi, metode_penyusutan, expense_id, allocated_cost
        ) VALUES ($1, $2, 'Pengecatan Ulang Kamar', 'pemeliharaan_rutin', 1200000, 0, NULL, NULL, 'seluruhnya_usaha', 100, 'perlu_telaah', 'tidak_disusutkan', $3, 1200000)
        RETURNING id`,
        [assetCatId, orgId, exp4Id]
      )
      compCatId = catCompRes.rows[0].id
    } finally {
      await pgClient.end()
    }

    // Set tanggal mulai pembukuan = 2026-06-01, aktifkan 4 aset awal, dan posting Batch 1 untuk Tahap 1
    await callOfficialRpc('set_bookkeeping_start_date', { p_org_id: orgId, p_start_date: '2026-06-01' }, ownerSession.access_token)
    await callOfficialRpc('activate_asset', { p_asset_id: assetGedungId, p_activation_notes: 'Aktivasi Gedung' }, ownerSession.access_token)
    await callOfficialRpc('activate_asset', { p_asset_id: assetKasurId, p_activation_notes: 'Aktivasi Kasur' }, ownerSession.access_token)
    await callOfficialRpc('activate_asset', { p_asset_id: assetAcId, p_activation_notes: 'Aktivasi AC v1' }, ownerSession.access_token)
    await callOfficialRpc('activate_asset', { p_asset_id: assetGensetId, p_activation_notes: 'Aktivasi Genset Bersama' }, ownerSession.access_token)

    const prev1 = await callOfficialRpc('preview_depreciation_posting', { p_org_id: orgId, p_period_key: '2026-06' }, ownerSession.access_token)
    const notes1 = 'Batch 1 Juni 2026'
    const batch1 = await callOfficialRpc(
      'post_depreciation_batch',
      {
        p_org_id: orgId,
        p_period_key: '2026-06',
        p_idempotency_key: 'e2e-f5-b1',
        p_payload_hash: getCanonicalHash(orgId, '2026-06', notes1),
        p_preview_token: prev1.preview_token,
        p_notes: notes1,
      },
      ownerSession.access_token
    )
    batch1Id = batch1.id

    // 3. Jalankan Vite dev server
    console.log(`[E2E-FASE5] Memulai Vite dev server pada port ${VITE_PORT}...`)
    viteProcess = process.platform === 'win32'
      ? spawn('wsl', ['bash', '-c', `cd /home/disnak/projects/simkos-v2 && npx vite --mode test --port ${VITE_PORT}`], { stdio: 'pipe' })
      : spawn('npx', ['vite', '--mode', 'test', '--port', String(VITE_PORT)], { cwd: ROOT, stdio: 'pipe' })

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Vite dev server timeout')), 25000)
      const onData = (chunk) => {
        const text = chunk.toString()
        const match = text.match(/http:\/\/(localhost|127\.0\.0\.1):(\d+)\//)
        if (match) {
          APP_URL = `http://127.0.0.1:${match[2]}`
        }
        if (text.includes('ready in') || text.includes('Local:')) {
          clearTimeout(timeout)
          resolve()
        }
      }
      viteProcess.stdout.on('data', onData)
      viteProcess.stderr.on('data', onData)
    })

    // 4. Luncurkan Chrome
    browser = await puppeteer.launch({
      executablePath: process.platform === 'win32'
        ? CHROME_PATH
        : '/home/disnak/.local/bin/chrome.exe',
      userDataDir: 'C:\\Users\\Disnak\\AppData\\Local\\Temp\\chrome-puppeteer-fase5',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--window-size=1280,950',
      ],
    })

    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    page.on('dialog', async d => { await d.accept() })
    page.on('pageerror', err => console.error('[BROWSER ERROR]', err.message))
    await page.setViewport({ width: 1280, height: 950 })

    // --- SUBTEST 1: Login Owner ---
    await t.test('1. Login Owner Melalui Form Resmi GoTrue', async () => {
      await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0' })
      await setInputValue(page, '#email', 'owner@simkos.test')
      await setInputValue(page, '#password', 'testpass123')
      await clickElementWithText(page, 'button', 'Masuk')
      await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })
      assert.ok(!page.url().includes('/login'))
    })

    // --- SUBTEST 2: Verifikasi Tahap 1 di /keuangan (Arus Kas vs Hasil Usaha Belum Lengkap Klasifikasi) ---
    await t.test('2. Tahap 1 di Browser: Pemisahan Arus Kas vs Hasil Usaha Internal (Belum Lengkap Klasifikasi)', async () => {
      await page.goto(`${APP_URL}/keuangan?period=2026-06`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('#tab-arus-kas', { timeout: 10000 })

      // Pilih Lokasi 1: Kos Melati Rekonsiliasi
      await selectLocationInDropdown(page, 'Kos Melati Rekonsiliasi')

      // Verifikasi Tab Arus Kas (Cash Basis Murni)
      await page.waitForFunction(
        () => document.querySelector('#val-cash-in-card')?.textContent.includes('4.500.000'),
        { timeout: 10000 }
      )
      const cashInText = await page.$eval('#val-cash-in-card', el => el.textContent.trim())
      const cashOutText = await page.$eval('#val-cash-out-card', el => el.textContent.trim())
      const netCashText = await page.$eval('#val-net-cash-flow-card', el => el.textContent.trim())
      assert.ok(cashInText.includes('4.500.000'), `Cash In harus Rp 4.500.000, aktual: ${cashInText}`)
      assert.ok(cashOutText.includes('10.500.000'), `Cash Out harus Rp 10.500.000, aktual: ${cashOutText}`)
      assert.ok(netCashText.includes('6.000.000'), `Net Cash Flow harus -Rp 6.000.000, aktual: ${netCashText}`)

      // Beralih ke Tab Hasil Usaha Internal
      await page.click('#tab-hasil-usaha')
      await page.waitForSelector('#panel-hasil-usaha-internal', { timeout: 10000 })

      const badgeText = await page.$eval('#badge-kelengkapan-laporan', el => el.textContent.trim())
      assert.ok(badgeText.includes('Belum Lengkap — Klasifikasi Tertunda'), `Badge Tahap 1 tidak sesuai: ${badgeText}`)

      const capText = await page.$eval('#val-approved-capitalized-deduction', el => el.textContent.trim())
      assert.ok(capText.includes('7.800.000'), `Kapitalisasi disahkan harus Rp 7.800.000, aktual: ${capText}`)

      const refOpExp = await page.$eval('#val-reference-operating-cash-expense', el => el.textContent.trim())
      assert.ok(refOpExp.includes('2.700.000'), `Nilai referensi beban operasional harus Rp 2.700.000, aktual: ${refOpExp}`)

      const deprBus = await page.$eval('#val-depreciation-business', el => el.textContent.trim())
      assert.ok(deprBus.includes('714.000'), `Penyusutan usaha Tahap 1 harus Rp 714.000, aktual: ${deprBus}`)

      const netIncIncomplete = await page.$eval('#label-net-operating-incomplete', el => el.textContent.trim())
      assert.equal(netIncIncomplete, 'Belum lengkap')

      // Verifikasi kartu Informasi Biaya Bersama (Rp 500.000 kas bersama & Rp 100.000 penyusutan bersama)
      const sharedCash = await page.$eval('#val-shared-cash-expense', el => el.textContent.trim())
      const sharedDepr = await page.$eval('#val-shared-depreciation-business', el => el.textContent.trim())
      assert.ok(sharedCash.includes('500.000'))
      assert.ok(sharedDepr.includes('100.000'))
    })

    // --- SUBTEST 3: Verifikasi Tahap 2 (E4 Disahkan sebagai beban_langsung -> Hasil Usaha Lengkap Rp 1.086.000) ---
    await t.test('3. Tahap 2 di Browser: Pengesahan beban_langsung E4 -> Hasil Usaha Lengkap Rp 1.086.000', async () => {
      // Sahkan E4 sebagai beban_langsung dan aktifkan ASSET_CAT
      const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
      await pgClient.connect()
      try {
        await pgClient.query(`UPDATE public.asset_components SET status_kapitalisasi = 'beban_langsung' WHERE id = $1`, [compCatId])
      } finally {
        await pgClient.end()
      }
      await callOfficialRpc('activate_asset', { p_asset_id: assetCatId, p_activation_notes: 'Sahkan E4 beban_langsung' }, ownerSession.access_token)

      await page.goto(`${APP_URL}/keuangan?period=2026-06&tab=hasil_usaha`, { waitUntil: 'networkidle0' })
      await selectLocationInDropdown(page, 'Kos Melati Rekonsiliasi')

      await page.waitForFunction(
        () => document.querySelector('#badge-kelengkapan-laporan')?.textContent.includes('Lengkap — Sudah Dibukukan'),
        { timeout: 10000 }
      )
      const directExp = await page.$eval('#val-approved-direct-expense', el => el.textContent.trim())
      const opExp = await page.$eval('#val-operating-cash-expense', el => el.textContent.trim())
      const surplus = await page.$eval('#val-operating-surplus-before-depr', el => el.textContent.trim())
      const netOp = await page.$eval('#val-net-operating-income', el => el.textContent.trim())

      assert.ok(directExp.includes('1.200.000'))
      assert.ok(opExp.includes('2.700.000'))
      assert.ok(surplus.includes('1.800.000'))
      assert.ok(netOp.includes('1.086.000'), `Hasil Usaha Bersih Tahap 2 harus Rp 1.086.000, aktual: ${netOp}`)
    })

    // --- SUBTEST 4: Verifikasi Tahap 3 (Storno Batch 1 + Revisi Alokasi via UI Detail Aset -> Preservasi Referensi & Tanpa Hitung Ganda) ---
    await t.test('4. Tahap 3 di Browser: Revisi Alokasi via UI Detail Aset -> Preservasi Referensi Rp 7.800.000 & Usulan Rp 4.500.000 Terpisah', async () => {
      // Storno Batch 1
      await callOfficialRpc(
        'reverse_depreciation_batch',
        { p_batch_id: batch1Id, p_reason: 'Storno Batch 1 untuk revisi alokasi AC M-02' },
        ownerSession.access_token
      )

      // Buka halaman Detail Aset AC Kamar M-02 dan lakukan Revisi Parameter + Alokasi Pengeluaran melalui UI!
      await page.goto(`${APP_URL}/aset/${assetAcId}`, { waitUntil: 'networkidle0' })
      await clickElementWithText(page, 'button', 'Revisi Parameter')
      await page.waitForSelector('#revise-allocated-cost', { timeout: 10000 })

      await setInputValue(page, '#revise-biaya', '4500000')
      await setInputValue(page, '#revise-allocated-cost', '4500000')
      await setInputValue(page, '#revise-reason', 'Koreksi alokasi nota campuran AC dari Rp 4.800.000 menjadi Rp 4.500.000')
      await clickElementWithText(page, 'button', 'Konfirmasi Revisi')

      await page.waitForFunction(
        () => document.body.textContent.includes('Perlu Pengesahan Ulang'),
        { timeout: 10000 }
      )

      // Buka /keuangan?period=2026-06&tab=hasil_usaha untuk memverifikasi Tahap 3
      await page.goto(`${APP_URL}/keuangan?period=2026-06&tab=hasil_usaha`, { waitUntil: 'networkidle0' })
      await selectLocationInDropdown(page, 'Kos Melati Rekonsiliasi')

      await page.waitForSelector('#panel-pending-allocations', { timeout: 10000 })

      const badgeT3 = await page.$eval('#badge-kelengkapan-laporan', el => el.textContent.trim())
      assert.ok(badgeT3.includes('Belum Lengkap — Penyusutan & Klasifikasi Tertunda'), `Badge Tahap 3: ${badgeT3}`)

      // Pastikan nilai referensi terakhir disahkan tetap Rp 7.800.000 dan beban operasional referensi Rp 2.700.000 (tidak dihitung ganda!)
      const refCap = await page.$eval('#val-ref-approved-cap', el => el.textContent.trim())
      const refOp = await page.$eval('#val-reference-operating-cash-expense', el => el.textContent.trim())
      const propRev = await page.$eval('#val-proposed-revision-allocation', el => el.textContent.trim())
      const propDelta = await page.$eval('#val-proposed-vs-approved-delta', el => el.textContent.trim())

      assert.ok(refCap.includes('7.800.000'), `Referensi kapitalisasi Tahap 3 harus Rp 7.800.000, aktual: ${refCap}`)
      assert.ok(refOp.includes('2.700.000'), `Referensi beban operasional Tahap 3 harus Rp 2.700.000, aktual: ${refOp}`)
      assert.ok(propRev.includes('4.500.000'), `Usulan revisi Tahap 3 harus Rp 4.500.000, aktual: ${propRev}`)
      assert.ok(propDelta.includes('300.000'), `Selisih usulan vs disahkan harus -Rp 300.000, aktual: ${propDelta}`)

      // Ketiadaan batch wajib tampil sebagai "Belum dibukukan" (null), BUKAN Rp 0!
      const deprUnposted = await page.$eval('#label-depreciation-unposted', el => el.textContent.trim())
      const sharedUnposted = await page.$eval('#label-shared-depreciation-unposted', el => el.textContent.trim())
      assert.equal(deprUnposted, 'Belum dibukukan')
      assert.equal(sharedUnposted, 'Belum dibukukan')
    })

    // --- SUBTEST 5: Verifikasi Tahap 4 (Pengesahan Ulang Snapshot v2 + Posting Batch 2 -> Rekonsiliasi Lokasi 1, Lokasi 2 Tanpa Ledger Rp 0, & Semua Lokasi) ---
    await t.test('5. Tahap 4 di Browser: Pengesahan Ulang & Posting Batch 2 -> Lokasi 1 (Rp 790.000), Lokasi 2 Tanpa Ledger (Rp 0 Lengkap), & Semua Lokasi (Rp 190.000)', async () => {
      // Sahkan ulang AC Kamar M-02 (Snapshot v2) & posting Batch 2
      await callOfficialRpc('activate_asset', { p_asset_id: assetAcId, p_activation_notes: 'Pengesahan ulang AC v2 Rp 4.500.000' }, ownerSession.access_token)
      const prev2 = await callOfficialRpc('preview_depreciation_posting', { p_org_id: orgId, p_period_key: '2026-06' }, ownerSession.access_token)
      const notes2 = 'Batch 2 Pengganti Juni 2026'
      await callOfficialRpc(
        'post_depreciation_batch',
        {
          p_org_id: orgId,
          p_period_key: '2026-06',
          p_idempotency_key: 'e2e-f5-b2',
          p_payload_hash: getCanonicalHash(orgId, '2026-06', notes2),
          p_preview_token: prev2.preview_token,
          p_notes: notes2,
        },
        ownerSession.access_token
      )

      await page.goto(`${APP_URL}/keuangan?period=2026-06&tab=hasil_usaha`, { waitUntil: 'networkidle0' })

      // 5A. Filter Lokasi 1: Kos Melati Rekonsiliasi -> Hasil Usaha Bersih = Rp 790.000
      await selectLocationInDropdown(page, 'Kos Melati Rekonsiliasi')
      await page.waitForFunction(
        () => document.querySelector('#val-net-operating-income')?.textContent.includes('790.000'),
        { timeout: 10000 }
      )

      const capT4 = await page.$eval('#val-approved-capitalized-deduction', el => el.textContent.trim())
      const opExpT4 = await page.$eval('#val-operating-cash-expense', el => el.textContent.trim())
      const deprT4 = await page.$eval('#val-depreciation-business', el => el.textContent.trim())
      const netT4 = await page.$eval('#val-net-operating-income', el => el.textContent.trim())
      const recNetT4 = await page.$eval('#val-rec-net-operating-income', el => el.textContent.trim())
      const revHistoryText = await page.$eval('#panel-allocation-revision-history', el => el.textContent)

      assert.ok(capT4.includes('7.500.000'))
      assert.ok(opExpT4.includes('3.000.000'))
      assert.ok(deprT4.includes('710.000'))
      assert.ok(netT4.includes('790.000'))
      assert.ok(recNetT4.includes('790.000'))
      assert.ok(revHistoryText.includes('v1 → v2'), 'Riwayat revisi alokasi harus menampilkan v1 -> v2')
      assert.ok(revHistoryText.includes('300.000'), 'Riwayat revisi alokasi harus menampilkan dampak +Rp 300.000')

      // 5B. Filter Lokasi 2: Kos Mawar Kosong (Lokasi Tanpa Ledger pada Batch yang Sah -> Rp 0 Lengkap!)
      await selectLocationInDropdown(page, 'Kos Mawar Kosong')
      await page.waitForFunction(
        () => document.querySelector('#panel-hasil-usaha-internal')?.textContent.includes('Kos Mawar Kosong'),
        { timeout: 10000 }
      )
      const badgeLoc2 = await page.$eval('#badge-kelengkapan-laporan', el => el.textContent.trim())
      const deprLoc2 = await page.$eval('#val-depreciation-business', el => el.textContent.trim())
      const netLoc2 = await page.$eval('#val-net-operating-income', el => el.textContent.trim())
      assert.ok(badgeLoc2.includes('Lengkap — Sudah Dibukukan'))
      assert.ok(deprLoc2.includes('Rp 0') || deprLoc2.includes('Rp\u00a00'), `Penyusutan Lokasi 2 harus Rp 0, aktual: ${deprLoc2}`)
      assert.ok(netLoc2.includes('Rp 0') || netLoc2.includes('Rp\u00a00'), `Hasil Usaha Lokasi 2 harus Rp 0, aktual: ${netLoc2}`)

      // 5C. Filter Semua Lokasi (Konsolidasi) -> Hasil Usaha Bersih = Rp 190.000
      await selectLocationInDropdown(page, 'Semua Lokasi')
      await page.waitForFunction(
        () => document.querySelector('#val-net-operating-income')?.textContent.includes('190.000'),
        { timeout: 10000 }
      )
      const opExpAll = await page.$eval('#val-operating-cash-expense', el => el.textContent.trim())
      const deprAll = await page.$eval('#val-depreciation-business', el => el.textContent.trim())
      const netAll = await page.$eval('#val-net-operating-income', el => el.textContent.trim())
      assert.ok(opExpAll.includes('3.500.000'))
      assert.ok(deprAll.includes('810.000'))
      assert.ok(netAll.includes('190.000'))
    })

    // --- SUBTEST 6: Pembatasan Bulan Penuh di /riwayat-transaksi & Verifikasi Akses Baca Staff ---
    await t.test('6. Pembatasan Bulan Kalender Penuh di /riwayat-transaksi & Akses Baca Staff', async () => {
      await page.goto(`${APP_URL}/riwayat-transaksi`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('#banner-status-periode-laporan', { timeout: 10000 })

      // 6A. Rentang tanggal parsial (2026-06-05 s/d 2026-06-20) -> Mode Riwayat Arus Kas, tombol Hasil Usaha tidak muncul
      await setInputValue(page, '#start-date', '2026-06-05')
      await setInputValue(page, '#end-date', '2026-06-20')
      await new Promise(r => setTimeout(r, 300))

      const bannerPartial = await page.$eval('#banner-status-periode-laporan', el => el.textContent)
      assert.ok(bannerPartial.includes('Mode Riwayat Arus Kas (Rentang Tanggal Bebas / Parsial)'))
      assert.ok(bannerPartial.includes('memerlukan satu bulan penuh'))
      const hasBtnPartial = await page.$('#btn-buka-hasil-usaha-bulan-penuh')
      assert.equal(hasBtnPartial, null, 'Tombol Hasil Usaha tidak boleh muncul pada rentang tanggal parsial')

      // 6B. Rentang satu bulan kalender penuh (2026-06-01 s/d 2026-06-30) -> Tombol Hasil Usaha muncul
      await setInputValue(page, '#start-date', '2026-06-01')
      await setInputValue(page, '#end-date', '2026-06-30')
      await new Promise(r => setTimeout(r, 300))

      const bannerFull = await page.$eval('#banner-status-periode-laporan', el => el.textContent)
      assert.ok(bannerFull.includes('Periode Bulan Kalender Penuh (2026-06)'))
      const hasBtnFull = await page.$('#btn-buka-hasil-usaha-bulan-penuh')
      assert.ok(hasBtnFull, 'Tombol Hasil Usaha harus muncul pada rentang satu bulan kalender penuh')

      // 6C. Login sebagai Staff (staff@simkos.test) dan pastikan dapat melihat Laporan Hasil Usaha Internal
      await page.evaluate(() => {
        window.localStorage.clear()
        window.sessionStorage.clear()
      })
      await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0' })
      await setInputValue(page, '#email', 'staff@simkos.test')
      await setInputValue(page, '#password', 'testpass123')
      await clickElementWithText(page, 'button', 'Masuk')
      await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })

      await page.goto(`${APP_URL}/keuangan?period=2026-06&tab=hasil_usaha`, { waitUntil: 'networkidle0' })
      await page.waitForFunction(
        () => document.querySelector('#val-net-operating-income')?.textContent.includes('190.000'),
        { timeout: 10000 }
      )
      const staffNet = await page.$eval('#val-net-operating-income', el => el.textContent.trim())
      assert.ok(staffNet.includes('190.000'), 'Staff harus dapat membaca Hasil Usaha Internal Bersih Rp 190.000')
    })

    // --- SUBTEST 7: Tangkap Bukti Visual Desktop & Mobile ---
    await t.test('7. Tangkap Screenshot Desktop dan Mobile Laporan Hasil Usaha Internal', async () => {
      // Pilih Lokasi 1 (Kos Melati Rekonsiliasi) agar menampilkan rincian lengkap + biaya bersama + riwayat revisi alokasi
      await selectLocationInDropdown(page, 'Kos Melati Rekonsiliasi')
      await page.waitForFunction(
        () => document.querySelector('#val-net-operating-income')?.textContent.includes('790.000'),
        { timeout: 10000 }
      )
      await new Promise(r => setTimeout(r, 500))

      // 7.1 Screenshot Desktop (1280x950)
      await page.setViewport({ width: 1280, height: 950 })
      await new Promise(r => setTimeout(r, 400))
      const desktopShotPath = path.join(ROOT, 'docs/screenshots/qa_fase5_desktop_hasil_usaha.png')
      await page.screenshot({ path: desktopShotPath, fullPage: true })
      try {
        fs.copyFileSync(desktopShotPath, path.join(ARTIFACT_DIR, 'qa_fase5_desktop_hasil_usaha.png'))
      } catch {}

      // 7.2 Screenshot Mobile (390x844)
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
      await new Promise(r => setTimeout(r, 400))
      const mobileShotPath = path.join(ROOT, 'docs/screenshots/qa_fase5_mobile_hasil_usaha.png')
      await page.screenshot({ path: mobileShotPath, fullPage: true })
      try {
        fs.copyFileSync(mobileShotPath, path.join(ARTIFACT_DIR, 'qa_fase5_mobile_hasil_usaha.png'))
      } catch {}

      console.log('[E2E-FASE5] Screenshot desktop dan mobile berhasil disimpan.')
    })

    await context.close()
  } finally {
    if (browser) {
      try { await browser.close() } catch {}
    }
    if (viteProcess) {
      try {
        viteProcess.stdout?.destroy()
        viteProcess.stderr?.destroy()
        viteProcess.kill('SIGKILL')
        viteProcess.unref()
      } catch {}
      try {
        const { execSync } = await import('node:child_process')
        execSync(`fuser -k ${VITE_PORT}/tcp 2>/dev/null || true; pkill -9 -f "vite.*${VITE_PORT}" || true`, { shell: '/bin/bash', stdio: 'ignore' })
      } catch {}
    }
    if (supabaseStack) {
      try { await supabaseStack.stop() } catch {}
    }
  }
})
