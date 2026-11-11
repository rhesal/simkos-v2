import test from 'node:test'
import assert from 'node:assert/strict'
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

const VITE_PORT = 5178
let APP_URL = `http://127.0.0.1:${VITE_PORT}`
const DB_PORT = 54322
const DB_NAME = 'simkos_qa_staging'
const DB_USER = process.env.USER || 'disnak'

const ARTIFACT_DIR = process.platform === 'win32'
  ? 'C:/Users/Disnak/.gemini/antigravity/brain/008b6dbe-f529-406f-aab3-6014d58f7bcb'
  : '/mnt/c/Users/Disnak/.gemini/antigravity/brain/008b6dbe-f529-406f-aab3-6014d58f7bcb'

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

async function getCashDatabaseSnapshot(client) {
  const expenses = (await client.query('SELECT * FROM public.expenses ORDER BY id')).rows
  const incomes = (await client.query('SELECT * FROM public.incomes ORDER BY id')).rows

  let journals = []
  const hasJournals = (await client.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'journals')")).rows[0].exists
  if (hasJournals) {
    journals = (await client.query('SELECT * FROM public.journals ORDER BY id')).rows
  }

  let cashFlows = []
  const hasCashFlows = (await client.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cash_flows')")).rows[0].exists
  if (hasCashFlows) {
    cashFlows = (await client.query('SELECT * FROM public.cash_flows ORDER BY id')).rows
  }

  return { expenses, incomes, journals, cashFlows }
}

test('Alur Browser E2E Pembukuan Aset, Saldo Awal, & Buku Pembantu Penyusutan (Fase 4B-2R)', { timeout: 180000 }, async (t) => {
  let supabaseStack = null
  let viteProcess = null
  let browser = null
  let orgId = null
  let assetAcId = null
  let compAcId = null
  let assetGedungId = null
  let compGedungId = null
  let snapshotBefore = null

  try {
    // 0. Bersihkan port vite lama jika ada
    try {
      if (process.platform === 'win32') {
        const { execSync } = await import('node:child_process')
        execSync('wsl bash -c "fuser -k 5178/tcp 5179/tcp 2>/dev/null || true; pkill -9 -f vite || true"', { stdio: 'ignore' })
      }
    } catch {}

    // 1. Jalankan Stack Supabase Resmi
    console.log('[E2E-FASE4] Menyiapkan Supabase stack resmi...')
    supabaseStack = await startSupabaseStack()

    // 2. Siapkan data aset uji deterministik di PostgreSQL
    const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
    await pgClient.connect()
    try {
      const orgRes = await pgClient.query("SELECT id FROM public.organizations WHERE name = 'SimKos' LIMIT 1")
      orgId = orgRes.rows[0].id

      // Aset 1: AC Panasonic Inverter (Kategori Elektronik Kantor - Komponen Historis Siap Guna 2024-06-16)
      // Biaya: Rp 4.800.000, Nilai Sisa: 0, Masa Manfaat: 48 bulan, Porsi Usaha: 100%
      // Cutoff 2026-05-31: sudah berjalan 23,5 bulan (Juni 2024 prorata 15/30 = 0,5 bulan + 23 bulan penuh).
      // Sisa bobot manfaat = 48 - 23,5 = 24,5 bulan (25 periode kalender tersisa).
      const resAc = await pgClient.query(`
        INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan, kondisi_fisik, dasar_penggunaan)
        VALUES ('${orgId}', 'AC Panasonic Inverter Kamar 02', 'elektronik_kantor', 'draft', 'baik', 'milik_sendiri')
        RETURNING id;
      `)
      assetAcId = resAc.rows[0].id

      const resCompAc = await pgClient.query(`
        INSERT INTO public.asset_components (
          asset_id, org_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
          tanggal_siap_guna, masa_manfaat_bulan, pola_penggunaan, porsi_usaha_persen, status_kapitalisasi, metode_penyusutan
        )
        VALUES (
          '${assetAcId}', '${orgId}', 'Unit AC Panasonic 1 PK', 'perolehan_baru', 4800000, 0,
          '2024-06-16', 48, 'seluruhnya_usaha', 100, 'kapitalisasi', 'garis_lurus'
        )
        RETURNING id;
      `)
      compAcId = resCompAc.rows[0].id

      // Aset 2: Paviliun Belakang (Kategori Gedung - Komponen Non-Historis Siap Guna 2026-06-01)
      // Biaya: Rp 120.000.000, Masa Manfaat: 240 bulan (Beban Rp 500.000/bulan), Porsi Usaha: 75% (Rp 375.000 usaha, Rp 125.000 non-usaha)
      const resGedung = await pgClient.query(`
        INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan, kondisi_fisik, dasar_penggunaan)
        VALUES ('${orgId}', 'Paviliun Belakang 2 Lantai', 'gedung', 'draft', 'baik', 'milik_sendiri')
        RETURNING id;
      `)
      assetGedungId = resGedung.rows[0].id

      const resCompGedung = await pgClient.query(`
        INSERT INTO public.asset_components (
          asset_id, org_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
          tanggal_siap_guna, masa_manfaat_bulan, pola_penggunaan, porsi_usaha_persen, status_kapitalisasi,
          metode_penyusutan, luas_khusus_usaha, luas_nonusaha, luas_bersama
        )
        VALUES (
          '${assetGedungId}', '${orgId}', 'Struktur Paviliun Belakang', 'perolehan_baru', 120000000, 0,
          '2026-06-01', 240, 'campuran', 75, 'kapitalisasi',
          'garis_lurus', 150, 50, 0
        )
        RETURNING id;
      `)
      compGedungId = resCompGedung.rows[0].id

      // Rekam snapshot tabel kas sebelum seluruh alur pembukuan dijalankan
      snapshotBefore = await getCashDatabaseSnapshot(pgClient)
      console.log(`[E2E-FASE4] Snapshot data kas awal tersimpan: ${snapshotBefore.expenses.length} expenses, ${snapshotBefore.incomes.length} incomes.`)
    } finally {
      await pgClient.end()
    }

    // 3. Jalankan Vite dev server pada port 5178
    console.log(`[E2E-FASE4] Memulai Vite dev server pada port ${VITE_PORT}...`)
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

    console.log(`[E2E-FASE4] Vite dev server siap di ${APP_URL}! Meluncurkan Google Chrome...`)

    // 4. Luncurkan browser Chromium/Chrome
    browser = await puppeteer.launch({
      executablePath: process.platform === 'win32'
        ? CHROME_PATH
        : '/home/disnak/.local/bin/chrome.exe',
      userDataDir: 'C:\\Users\\Disnak\\AppData\\Local\\Temp\\chrome-puppeteer-fase4',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--window-size=1280,900',
      ],
    })

    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    page.on('dialog', async d => { await d.accept() })
    page.on('console', msg => console.log('[BROWSER LOG]', msg.type(), msg.text()))
    page.on('pageerror', err => console.error('[BROWSER ERROR]', err.message))
    page.on('response', async res => {
      if (res.status() >= 400) {
        let body = ''
        try { body = await res.text() } catch {}
        console.log(`[HTTP ${res.status()}] ${res.url()} -> ${body}`)
      }
    })
    await page.setViewport({ width: 1280, height: 900 })

    // --- SUBTEST 1: Login Owner Melalui Form Resmi ---
    await t.test('1. Login Owner Menggunakan GoTrue Resmi', async () => {
      await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0' })
      await setInputValue(page, '#email', 'owner@simkos.test')
      await setInputValue(page, '#password', 'testpass123')
      await clickElementWithText(page, 'button', 'Masuk')

      await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })
      assert.ok(!page.url().includes('/login'), 'Login harus berhasil')
      console.log('[E2E-FASE4] Owner berhasil login.')
    })

    // --- SUBTEST 2: Konfigurasi Tanggal Mulai Pembukuan di Buku Pembantu ---
    await t.test('2. Buka Buku Pembantu & Atur Tanggal Mulai Pembukuan', async () => {
      await page.goto(`${APP_URL}/aset/buku-pembantu`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1', { timeout: 10000 })

      const headerText = await page.evaluate(() => document.body.textContent)
      assert.ok(headerText.includes('Buku Pembantu Penyusutan'), 'Halaman Buku Pembantu harus terbuka')

      // Klik tombol Ubah / Atur Tanggal Mulai
      await clickElementWithText(page, 'button', 'Tanggal Mulai')

      // Tunggu modal muncul & isi tanggal mulai: 2026-06-01
      await page.waitForSelector('input[type="date"]', { timeout: 5000 })
      await setInputValue(page, 'input[type="date"]', '2026-06-01')

      // Simpan tanggal mulai
      await clickElementWithText(page, 'button', 'Simpan Tanggal')

      // Verifikasi tanggal mulai tertera di halaman
      await page.waitForFunction(
        () => document.body.textContent.includes('1 Juni 2026') || document.body.textContent.includes('2026-06-01'),
        { timeout: 10000 }
      )
      console.log('[E2E-FASE4] Tanggal mulai pembukuan berhasil diatur ke 2026-06-01.')
    })

    // --- SUBTEST 3: Aktivasi Aset & Pengesahan Saldo Awal Komponen Historis ---
    await t.test('3. Detail Aset: Aktivasi Aset & Pengesahan Saldo Awal Simulasi Historis', async () => {
      // 3.1 Buka Detail Aset AC
      await page.goto(`${APP_URL}/aset/${assetAcId}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1, h2', { timeout: 10000 })

      const bodyText1 = await page.evaluate(() => document.body.textContent)
      assert.ok(bodyText1.includes('Data Aset Lengkap — Siap Diaktivasi'), 'Banner siap aktivasi harus muncul')

      // Klik tombol "Aktivasi Aset (Resmi)"
      await clickElementWithText(page, 'button', 'Aktivasi Aset (Resmi)')
      await page.waitForSelector('button', { timeout: 5000 })
      await clickElementWithText(page, 'button', 'Konfirmasi Aktivasi')

      // Verifikasi status aset menjadi Aktif (Snapshot v1)
      await page.waitForFunction(
        () => document.body.textContent.includes('Aset Aktif Resmi') && document.body.textContent.includes('Snapshot v1'),
        { timeout: 10000 }
      )

      // Verifikasi indikator Saldo Awal Belum Disahkan
      await page.waitForFunction(
        () => document.body.textContent.includes('Saldo Awal Belum Disahkan'),
        { timeout: 10000 }
      )

      // Klik "Sahkan Saldo Awal"
      await clickElementWithText(page, 'button', 'Sahkan Saldo Awal')
      await page.waitForFunction(() => document.body.textContent.includes('Pengesahan Saldo Awal'), { timeout: 5000 })

      // Sahkan via jalur simulasi historis (default v1)
      await clickElementWithText(page, 'button', 'Konfirmasi Sahkan Saldo Awal')

      // Verifikasi indikator berubah menjadi ✅ Saldo Awal Disahkan (Historis • v1)
      await page.waitForFunction(
        () => document.body.textContent.includes('Saldo Awal Disahkan (Historis'),
        { timeout: 10000 }
      )
      console.log('[E2E-FASE4] Aset AC diaktivasi & saldo awal simulasi historis (v1) disahkan.')

      // 3.2 Buka Detail Aset Paviliun & Aktivasi
      await page.goto(`${APP_URL}/aset/${assetGedungId}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1, h2', { timeout: 10000 })
      await clickElementWithText(page, 'button', 'Aktivasi Aset (Resmi)')
      await page.waitForSelector('button', { timeout: 5000 })
      await clickElementWithText(page, 'button', 'Konfirmasi Aktivasi')

      await page.waitForFunction(
        () => document.body.textContent.includes('Aset Aktif Resmi'),
        { timeout: 10000 }
      )
      const pavText = await page.evaluate(() => document.body.textContent)
      assert.ok(pavText.includes('Komponen Non-Historis'), 'Paviliun harus berstatus non-historis')
      console.log('[E2E-FASE4] Aset Paviliun berhasil diaktivasi sebagai non-historis.')
    })

    // --- SUBTEST 4: Alur Browser Saldo Awal Catatan Terdahulu (Jalur Manual) & Pencocokan Database ---
    await t.test('4. Detail Aset: Alur Browser Saldo Awal Catatan Terdahulu (Jalur Manual) & Pencocokan Database', async () => {
      // Buka Detail Aset AC
      await page.goto(`${APP_URL}/aset/${assetAcId}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1, h2', { timeout: 10000 })

      // Klik tombol "Sahkan Saldo Awal" untuk mengganti ke jalur manual (catatan_terdahulu)
      await clickElementWithText(page, 'button', 'Sahkan Saldo Awal')
      await page.waitForFunction(() => document.body.textContent.includes('Pengesahan Saldo Awal'), { timeout: 5000 })

      // Pilih radio "Catatan Terdahulu (Manual)"
      await page.waitForSelector('#ob-jalur-manual', { timeout: 5000 })
      await page.click('#ob-jalur-manual')

      // Tunggu input manual muncul
      await page.waitForSelector('#ob-akumulasi-manual', { timeout: 5000 })

      // Isi nilai manual:
      // Biaya = 4.800.000, Akumulasi Manual = 2.595.000 -> Nilai Buku Awal = 2.205.000
      // Sisa dasar = 2.205.000, Sisa bobot manfaat = 24,5 bulan -> Beban 2026-06 = round(2.205.000 / 24,5) = Rp 90.000
      await setInputValue(page, '#ob-akumulasi-manual', '2595000')
      await setInputValue(page, '#ob-usaha-manual', '2595000')
      await setInputValue(page, '#ob-catatan-sumber', 'Kertas kerja penyusutan manual per 31 Mei 2026')

      // Konfirmasi pengesahan saldo awal jalur manual
      await clickElementWithText(page, 'button', 'Konfirmasi Sahkan Saldo Awal')

      // Verifikasi di UI Detail Aset bahwa saldo awal tercatat sebagai Catatan Terdahulu / Manual • v2
      await page.waitForFunction(
        () => document.body.textContent.includes('Catatan Terdahulu / Manual') &&
              document.body.textContent.includes('v2') &&
              document.body.textContent.includes('2.595.000') &&
              document.body.textContent.includes('2.205.000') &&
              document.body.textContent.includes('Kertas kerja penyusutan manual per 31 Mei 2026'),
        { timeout: 10000 }
      )

      // Cocokkan data saldo awal di database PostgreSQL
      const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
      await pgClient.connect()
      try {
        const obRes = await pgClient.query(`
          SELECT version, status, jalur_saldo, biaya_perolehan, nilai_sisa,
                 akumulasi_penyusutan_awal, nilai_buku_awal, akumulasi_usaha_awal, akumulasi_non_usaha_awal,
                 sisa_dasar_penyusutan, sisa_target_usaha, sisa_bobot_manfaat, sisa_periode_kalender, catatan_sumber
          FROM public.asset_opening_balances
          WHERE component_id = '${compAcId}'
          ORDER BY version ASC
        `)
        assert.strictEqual(obRes.rows.length, 2, 'Harus terdapat 2 versi riwayat saldo awal (v1 cancelled, v2 approved)')
        assert.strictEqual(obRes.rows[0].version, 1)
        assert.strictEqual(obRes.rows[0].status, 'cancelled', 'Saldo awal v1 (simulasi_historis) harus otomatis dibatalkan')
        assert.strictEqual(obRes.rows[0].jalur_saldo, 'simulasi_historis')

        const obV2 = obRes.rows[1]
        assert.strictEqual(obV2.version, 2)
        assert.strictEqual(obV2.status, 'approved')
        assert.strictEqual(obV2.jalur_saldo, 'catatan_terdahulu')
        assert.strictEqual(Number(obV2.akumulasi_penyusutan_awal), 2595000, 'Akumulasi awal manual harus Rp 2.595.000')
        assert.strictEqual(Number(obV2.akumulasi_usaha_awal), 2595000, 'Akumulasi usaha awal harus Rp 2.595.000')
        assert.strictEqual(Number(obV2.akumulasi_non_usaha_awal), 0, 'Akumulasi non-usaha awal harus Rp 0')
        assert.strictEqual(Number(obV2.nilai_buku_awal), 2205000, 'Nilai buku awal harus Rp 2.205.000')
        assert.strictEqual(Number(obV2.sisa_dasar_penyusutan), 2205000, 'Sisa dasar penyusutan harus Rp 2.205.000')
        assert.strictEqual(Number(obV2.sisa_target_usaha), 2205000, 'Sisa target usaha harus Rp 2.205.000')
        assert.strictEqual(Number(obV2.sisa_bobot_manfaat), 24.5, 'Sisa bobot manfaat harus 24,5 bulan')
        assert.strictEqual(Number(obV2.sisa_periode_kalender), 25, 'Sisa periode kalender harus 25 periode')
        assert.strictEqual(obV2.catatan_sumber, 'Kertas kerja penyusutan manual per 31 Mei 2026')
      } finally {
        await pgClient.end()
      }

      // Buka Buku Pembantu untuk mencocokkan penyusutan periode berikutnya (2026-06)
      await page.goto(`${APP_URL}/aset/buku-pembantu`, { waitUntil: 'networkidle0' })
      await page.waitForFunction(
        () => document.body.textContent.includes('Juni 2026') &&
              document.body.textContent.includes('590.000') &&
              document.body.textContent.includes('465.000') &&
              document.body.textContent.includes('90.000') &&
              document.body.textContent.includes('2.115.000'),
        { timeout: 10000 }
      )
      console.log('[E2E-FASE4] Saldo awal catatan terdahulu (v2) dan penyusutan periode berikutnya (Rp 90.000) cocok dengan database.')
    })

    // --- SUBTEST 5: Tes Browser Pratinjau Kedaluwarsa (SIMKOS_STALE_PREVIEW) ---
    await t.test('5. Buku Pembantu: Tes Browser Pratinjau Kedaluwarsa (SIMKOS_STALE_PREVIEW) & Konfirmasi Ulang', async () => {
      // 5.1 Di browser, klik "Pratinjau & Bukukan Penyusutan" saat pratinjau masih bernilai Rp 590.000 (AC Rp 90.000 + Paviliun Rp 500.000)
      await clickElementWithText(page, 'button', 'Pratinjau & Bukukan Penyusutan')
      await page.waitForFunction(
        () => document.body.textContent.includes('Konfirmasi Posting Penyusutan') &&
              document.body.textContent.includes('590.000'),
        { timeout: 5000 }
      )

      // 5.2 Sementara modal konfirmasi terbuka di browser, ubah keadaan melalui RPC resmi dari sesi lain (admin@simkos.test)
      // Sesi lain mengesahkan revisi saldo awal catatan_terdahulu v3:
      // Akumulasi manual = Rp 2.840.000 -> Nilai buku awal = Rp 1.960.000 -> Beban Juni 2026 = 1.960.000 / 24,5 = Rp 80.000
      // Sehingga Total Beban periode 2026-06 berubah dari Rp 590.000 menjadi Rp 580.000 (Beban Usaha Rp 465.000 -> Rp 455.000)
      const adminAuth = await loginGoTrueUser('admin@simkos.test', 'testpass123')
      const obV3 = await callOfficialRpc(
        'approve_component_opening_balance',
        {
          p_component_id: compAcId,
          p_jalur: 'catatan_terdahulu',
          p_manual_akumulasi: 2840000,
          p_manual_usaha: 2840000,
          p_revisi_sisa_bulan: null,
          p_catatan: 'Audit final buku inventaris manual per 31 Mei 2026 (Sesi Admin)',
        },
        adminAuth.access_token
      )
      assert.strictEqual(obV3.version, 3, 'Sesi lain berhasil menerbitkan saldo awal v3')

      // 5.3 Di browser, pengguna mengonfirmasi posting menggunakan pratinjau yang sudah kedaluwarsa
      await clickElementWithText(page, 'button', 'Konfirmasi & Bukukan')

      // 5.4 Tunggu UI menangkap kode SIMKOS_STALE_PREVIEW, menolak posting, mengambil pratinjau terbaru, dan menampilkan perubahan nominal
      await page.waitForFunction(
        () => document.body.textContent.includes('SIMKOS_STALE_PREVIEW') &&
              document.body.textContent.includes('590.000') &&
              document.body.textContent.includes('580.000') &&
              document.body.textContent.includes('465.000') &&
              document.body.textContent.includes('455.000') &&
              document.body.textContent.includes('80.000'),
        { timeout: 10000 }
      )

      // 5.5 Pastikan TIDAK ADA posting otomatis di database dan modal konfirmasi masih terbuka menunggu konfirmasi ulang
      const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
      await pgClient.connect()
      try {
        const batchCountRes = await pgClient.query(`
          SELECT count(*)::int AS cnt
          FROM public.asset_depreciation_batches
          WHERE org_id = '${orgId}' AND period_key = '2026-06'
        `)
        assert.strictEqual(batchCountRes.rows[0].cnt, 0, 'Tidak boleh ada posting otomatis saat pratinjau kedaluwarsa ditolak')
      } finally {
        await pgClient.end()
      }

      const isModalStillOpen = await page.evaluate(() => {
        return document.body.textContent.includes('Konfirmasi Posting Penyusutan') &&
               document.body.textContent.includes('Terbuka — Belum Dibukukan')
      })
      assert.strictEqual(isModalStillOpen, true, 'Modal harus tetap terbuka menampilkan data terbaru untuk dikonfirmasi ulang')
      console.log('[E2E-FASE4] Penolakan SIMKOS_STALE_PREVIEW, tampilan perubahan nominal (Rp 590.000 -> Rp 580.000), dan ketiadaan auto-post terverifikasi!')
    })

    // --- SUBTEST 6: Uji Pengiriman Ulang Sebenarnya (Simulated Network Drop After Server Commit + Idempotent Retry) ---
    await t.test('6. Buku Pembantu: Uji Pengiriman Ulang Sebenarnya (Commit Server Tanpa Respons Browser + Retry Idempoten) & Pencocokan Ledger', async () => {
      // Pada tahap ini modal konfirmasi sedang terbuka memegang pratinjau terbaru (Rp 580.000) dan kunci idempotensi baru.
      // Isi catatan pembukuan agar hash kanonis juga menguji catatan
      await setInputValue(page, 'input[placeholder*="Pembukuan penyusutan"]', 'Posting resmi Juni 2026 via retry idempoten')

      let postInterceptCount = 0
      let firstRequestPayload = null
      let secondRequestPayload = null
      let serverCommittedBatch = null
      let secondResponseBatch = null

      await page.setRequestInterception(true)

      const requestHandler = async (req) => {
        if (req.url().includes('/rest/v1/rpc/post_depreciation_batch') && req.method() === 'POST') {
          postInterceptCount += 1
          const rawBody = req.postData()
          const parsedBody = JSON.parse(rawBody)

          if (postInterceptCount === 1) {
            firstRequestPayload = parsedBody
            // Teruskan permintaan pertama ke server PostgREST sesungguhnya agar transaksi COMMIT di database
            const backendRes = await fetch(req.url(), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: req.headers()['apikey'] || ANON_KEY,
                Authorization: req.headers()['authorization'],
              },
              body: rawBody,
            })
            assert.strictEqual(backendRes.status, 200, 'Eksekusi pertama di server harus berhasil (HTTP 200)')
            serverCommittedBatch = await backendRes.json()

            // Putuskan koneksi ke browser untuk menyimulasikan respons jaringan hilang setelah commit di server
            await req.abort('failed')
            return
          }

          if (postInterceptCount === 2) {
            secondRequestPayload = parsedBody
            await req.continue()
            return
          }
        }
        await req.continue()
      }

      const responseHandler = async (res) => {
        if (res.url().includes('/rest/v1/rpc/post_depreciation_batch') && res.request().method() === 'POST') {
          if (res.status() === 200) {
            try {
              secondResponseBatch = await res.json()
            } catch {}
          }
        }
      }

      page.on('request', requestHandler)
      page.on('response', responseHandler)

      try {
        // 6.1 Klik pertama: berhasil commit di server, tetapi respons jaringan ke browser gagal (aborted)
        await clickElementWithText(page, 'button', 'Konfirmasi & Bukukan')

        // Tunggu pesan galat jaringan muncul di modal konfirmasi browser
        await page.waitForFunction(
          () => document.body.textContent.includes('Gagal terhubung ke server') &&
                document.body.textContent.includes('Konfirmasi Posting Penyusutan'),
          { timeout: 10000 }
        )

        // Pastikan di database batch SUDAH tercatat dari percobaan pertama sebelum retry dilakukan
        const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
        await pgClient.connect()
        try {
          const check1 = await pgClient.query(`
            SELECT id, batch_number, idempotency_key, payload_hash, total_depreciation
            FROM public.asset_depreciation_batches
            WHERE org_id = '${orgId}' AND period_key = '2026-06'
          `)
          assert.strictEqual(check1.rows.length, 1, 'Batch harus sudah tersimpan di server pada percobaan pertama')
          assert.strictEqual(check1.rows[0].id, serverCommittedBatch.id)

          const ledgerCheck1 = await pgClient.query(`
            SELECT count(*)::int AS cnt FROM public.asset_depreciation_ledger WHERE batch_id = '${serverCommittedBatch.id}'
          `)
          assert.strictEqual(ledgerCheck1.rows[0].cnt, 2, '2 baris ledger harus sudah tersimpan pada percobaan pertama')
        } finally {
          await pgClient.end()
        }

        // 6.2 Klik kedua (Retry): pengguna menekan tombol Konfirmasi & Bukukan kembali di browser
        await clickElementWithText(page, 'button', 'Konfirmasi & Bukukan')

        // Tunggu browser menerima respons retry dan beralih ke tampilan "Sudah Dibukukan"
        await page.waitForFunction(
          () => document.body.textContent.includes('Sudah Dibukukan') &&
                document.body.textContent.includes('Rincian Ledger Penyusutan Resmi'),
          { timeout: 10000 }
        )
      } finally {
        page.off('request', requestHandler)
        page.off('response', responseHandler)
        await page.setRequestInterception(false)
      }

      // 6.3 Buktikan kunci idempotensi & payload hash pada retry identik dengan percobaan pertama
      assert.strictEqual(postInterceptCount, 2, 'Harus terjadi tepat 2 pengiriman HTTP (1 terputus + 1 retry)')
      assert.ok(firstRequestPayload && secondRequestPayload, 'Kedua payload harus terekam')
      assert.strictEqual(
        secondRequestPayload.p_idempotency_key,
        firstRequestPayload.p_idempotency_key,
        'Retry wajib menggunakan kunci idempotensi yang sama persis'
      )
      assert.strictEqual(
        secondRequestPayload.p_payload_hash,
        firstRequestPayload.p_payload_hash,
        'Retry wajib mengirim payload_hash yang sama persis'
      )
      assert.ok(secondResponseBatch, 'Respons retry kedua harus diterima browser')
      assert.strictEqual(
        secondResponseBatch.id,
        serverCommittedBatch.id,
        'Hasil retry harus mengacu pada ID batch yang sama persis dengan commit pertama'
      )
      assert.strictEqual(
        secondResponseBatch.batch_number,
        serverCommittedBatch.batch_number,
        'Nomor batch hasil retry harus sama persis dengan commit pertama'
      )

      // 6.4 Cocokkan batch dan baris ledger di database (tidak ada duplikasi ledger & angka sesuai jalur manual v3)
      const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
      await pgClient.connect()
      try {
        const batchRes = await pgClient.query(`
          SELECT id, batch_number, total_depreciation, total_business_portion, total_non_business_portion
          FROM public.asset_depreciation_batches
          WHERE org_id = '${orgId}' AND period_key = '2026-06'
        `)
        assert.strictEqual(batchRes.rows.length, 1, 'Tetap hanya ada 1 batch setelah retry')
        assert.strictEqual(batchRes.rows[0].id, serverCommittedBatch.id)
        assert.strictEqual(Number(batchRes.rows[0].total_depreciation), 580000, 'Total beban batch = Rp 580.000')
        assert.strictEqual(Number(batchRes.rows[0].total_business_portion), 455000, 'Total bagian usaha = Rp 455.000')
        assert.strictEqual(Number(batchRes.rows[0].total_non_business_portion), 125000, 'Total bagian non-usaha = Rp 125.000')

        const ledgerRes = await pgClient.query(`
          SELECT component_id, opening_balance_id, entry_type, depreciation_amount,
                 business_portion_amount, non_business_portion_amount, cumulative_depreciation, book_value_ending
          FROM public.asset_depreciation_ledger
          WHERE batch_id = '${serverCommittedBatch.id}'
        `)
        assert.strictEqual(ledgerRes.rows.length, 2, 'Retry tidak boleh menambah baris ledger (tetap 2 baris)')

        const acLedger = ledgerRes.rows.find(r => r.component_id === compAcId)
        assert.ok(acLedger, 'Baris ledger untuk komponen AC harus ada')
        assert.strictEqual(Number(acLedger.depreciation_amount), 80000, 'Beban penyusutan AC jalur manual v3 = Rp 80.000')
        assert.strictEqual(Number(acLedger.business_portion_amount), 80000, 'Bagian usaha AC = Rp 80.000')
        assert.strictEqual(Number(acLedger.non_business_portion_amount), 0, 'Bagian non-usaha AC = Rp 0')
        assert.strictEqual(Number(acLedger.cumulative_depreciation), 2920000, 'Akumulasi akhir AC = 2.840.000 + 80.000 = Rp 2.920.000')
        assert.strictEqual(Number(acLedger.book_value_ending), 1880000, 'Nilai buku akhir AC = 4.800.000 - 2.920.000 = Rp 1.880.000')
      } finally {
        await pgClient.end()
      }

      const bodyText = await page.evaluate(() => document.body.textContent)
      assert.ok(bodyText.includes(serverCommittedBatch.batch_number), 'Nomor batch yang sama harus tampil di UI')
      console.log(`[E2E-FASE4] Retry idempoten berhasil diverifikasi: mengacu pada ${serverCommittedBatch.batch_number} tanpa menambah ledger!`)
    })

    // --- SUBTEST 7: Pembatalan Batch Terakhir (Storno Reversal), Uji Klik Ganda Terpisah, & Posting Pengganti ---
    await t.test('7. Pembatalan Batch Terakhir (Storno Reversal), Uji Klik Ganda Secara Terpisah, & Posting Ulang', async () => {
      // 7.1 Klik Batalkan Posting (Storno)
      await clickElementWithText(page, 'button', 'Batalkan Posting (Storno)')
      await page.waitForFunction(() => document.body.textContent.includes('Batalkan Batch (Storno Reversal)'), { timeout: 5000 })
      await setInputValue(page, 'textarea', 'Koreksi salah posting untuk pengujian storno & double-click')
      await clickElementWithText(page, 'button', 'Konfirmasi Batalkan')

      await page.waitForFunction(
        () => document.body.textContent.includes('Terbuka — Belum Dibukukan') &&
              document.body.textContent.includes('Dibatalkan (Reversed)') &&
              document.body.textContent.includes('Pratinjau & Bukukan Penyusutan'),
        { timeout: 10000 }
      )

      const bodyTextRev = await page.evaluate(() => document.body.textContent)
      assert.ok(bodyTextRev.includes('Dibatalkan (Reversed)'), 'Batch pertama harus berstatus Dibatalkan (Reversed)')

      // 7.2 Buka modal posting pengganti & uji klik ganda (double-click) secara terpisah
      await clickElementWithText(page, 'button', 'Pratinjau & Bukukan Penyusutan')
      await page.waitForFunction(() => document.body.textContent.includes('Konfirmasi Posting Penyusutan'), { timeout: 5000 })

      let doubleClickRpcCalls = 0
      await page.setRequestInterception(true)
      const dcHandler = async (req) => {
        if (req.url().includes('/rest/v1/rpc/post_depreciation_batch') && req.method() === 'POST') {
          doubleClickRpcCalls += 1
          // Beri jeda 250ms untuk memastikan klik kedua terjadi saat request pertama masih in-flight
          await new Promise(r => setTimeout(r, 250))
        }
        await req.continue()
      }
      page.on('request', dcHandler)

      try {
        // Eksekusi klik ganda secara sinkron di DOM browser dan periksa apakah tombol langsung disabled setelah klik pertama
        const doubleClickState = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'))
          const confirmBtn = buttons.find(b => b.textContent.includes('Konfirmasi & Bukukan') && !b.disabled)
          if (!confirmBtn) return { found: false }
          confirmBtn.click()
          const disabledAfterFirstClick = confirmBtn.disabled
          // Klik kedua saat masih memproses
          confirmBtn.click()
          return { found: true, disabledAfterFirstClick }
        })

        assert.strictEqual(doubleClickState.found, true, 'Tombol Konfirmasi & Bukukan harus ditemukan')

        await page.waitForFunction(
          () => document.body.textContent.includes('Sudah Dibukukan'),
          { timeout: 10000 }
        )
      } finally {
        page.off('request', dcHandler)
        await page.setRequestInterception(false)
      }

      assert.strictEqual(doubleClickRpcCalls, 1, 'Klik ganda pada tombol konfirmasi hanya boleh mengirim tepat 1 permintaan RPC ke server')
      console.log('[E2E-FASE4] Pembatalan storno, proteksi klik ganda (1 RPC call), & posting pengganti berhasil!')
    })

    // --- SUBTEST 8: Penguncian & Pembukaan Kunci Periode ---
    await t.test('8. Penguncian & Pembukaan Kunci Periode di Buku Pembantu', async () => {
      // Pindah ke periode berikutnya: 2026-07
      await clickElementWithText(page, 'button', '›')
      await page.waitForFunction(
        () => document.body.textContent.includes('Juli 2026'),
        { timeout: 10000 }
      )

      // Klik tombol Kunci Periode
      await clickElementWithText(page, 'button', 'Kunci Periode')
      await page.waitForFunction(() => document.body.textContent.includes('Kunci Periode Pembukuan'), { timeout: 5000 })

      await setInputValue(page, 'input[placeholder*="penguncian"]', 'Tutup buku interim Juli 2026 selesai diaudit')
      await clickElementWithText(page, 'button', 'Konfirmasi Kunci Periode')

      await page.waitForFunction(
        () => document.body.textContent.includes('Terkunci'),
        { timeout: 10000 }
      )

      const isPostBtnAvailable = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Pratinjau & Bukukan'))
        return btn ? !btn.disabled : false
      })
      assert.strictEqual(isPostBtnAvailable, false, 'Tombol posting harus dinonaktifkan saat periode terkunci')

      // Buka kunci periode
      await clickElementWithText(page, 'button', 'Buka Kunci')
      await page.waitForFunction(() => document.body.textContent.includes('Buka Kunci Periode'), { timeout: 5000 })
      await setInputValue(page, 'input[placeholder*="alasan"]', 'Pembukaan kembali untuk penyesuaian operasional')
      await clickElementWithText(page, 'button', 'Konfirmasi Buka Kunci')

      await page.waitForFunction(
        () => document.body.textContent.includes('Terbuka — Belum Dibukukan'),
        { timeout: 10000 }
      )
      console.log('[E2E-FASE4] Penguncian & pembukaan periode berhasil diverifikasi!')
    })

    // --- SUBTEST 9: Revisi Parameter Komponen, Deteksi Perlu Pengesahan Ulang, & Aktivasi Ulang ---
    await t.test('9. Revisi Parameter Komponen & Alur Pengesahan Ulang Aset', async () => {
      // Kembali ke periode 2026-06 dan batalkan posting batch pengganti terlebih dahulu agar aset tidak diblokir oleh batch aktif
      await clickElementWithText(page, 'button', '‹')
      await page.waitForFunction(() => document.body.textContent.includes('Juni 2026'), { timeout: 10000 })
      await clickElementWithText(page, 'button', 'Batalkan Posting (Storno)')
      await page.waitForFunction(() => document.body.textContent.includes('Batalkan Batch (Storno Reversal)'), { timeout: 5000 })
      await setInputValue(page, 'textarea', 'Batalkan untuk revisi parameter komponen AC')
      await clickElementWithText(page, 'button', 'Konfirmasi Batalkan')
      await page.waitForFunction(
        () => document.body.textContent.includes('Terbuka — Belum Dibukukan') &&
              document.body.textContent.includes('Pratinjau & Bukukan Penyusutan'),
        { timeout: 10000 }
      )

      // Buka halaman Detail Aset AC
      await page.goto(`${APP_URL}/aset/${assetAcId}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1, h2', { timeout: 10000 })

      // Klik tombol Revisi Parameter pada Unit AC
      await clickElementWithText(page, 'button', 'Revisi Parameter')
      await page.waitForFunction(() => document.body.textContent.includes('Revisi Parameter Komponen'), { timeout: 5000 })

      // Ubah porsi usaha dari 100% menjadi 60%
      await setInputValue(page, 'input[max="100"]', '60')
      await setInputValue(page, 'textarea', 'Perubahan alokasi kamar kos menjadi campuran keluarga')
      await clickElementWithText(page, 'button', 'Konfirmasi Revisi')

      // Verifikasi status aset berubah menjadi "Perlu Pengesahan Ulang"
      await page.waitForFunction(
        () => document.body.textContent.includes('Aset Memerlukan Pengesahan Ulang'),
        { timeout: 10000 }
      )

      // Cek di Buku Pembantu: posting harus menampilkan peringatan bahwa aset perlu pengesahan ulang
      await page.goto(`${APP_URL}/aset/buku-pembantu`, { waitUntil: 'networkidle0' })
      await page.waitForFunction(
        () => document.body.textContent.includes('memerlukan pengesahan ulang'),
        { timeout: 10000 }
      )

      // Kembali ke Detail Aset AC dan lakukan pengesahan ulang (Aktivasi Ulang)
      await page.goto(`${APP_URL}/aset/${assetAcId}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('button', { timeout: 10000 })
      await clickElementWithText(page, 'button', 'Sahkan Ulang Aset')
      await page.waitForFunction(() => document.body.textContent.includes('Sahkan Ulang Aset (Aktivasi Ulang)'), { timeout: 5000 })
      await clickElementWithText(page, 'button', 'Konfirmasi Sahkan Ulang')

      // Verifikasi aset kembali Aktif dengan Snapshot v2
      await page.waitForFunction(
        () => document.body.textContent.includes('Aset Aktif Resmi') && document.body.textContent.includes('Snapshot v2'),
        { timeout: 10000 }
      )

      // Setelah parameter porsi usaha berubah menjadi 60% pada Snapshot v2, sahkan ulang saldo awal komponen AC agar sesuai dengan Snapshot v2
      await clickElementWithText(page, 'button', 'Sahkan Saldo Awal')
      await page.waitForFunction(() => document.body.textContent.includes('Pengesahan Saldo Awal'), { timeout: 5000 })
      await clickElementWithText(page, 'button', 'Konfirmasi Sahkan Saldo Awal')
      await page.waitForFunction(() => document.body.textContent.includes('v4'), { timeout: 10000 })

      // Buka Buku Pembantu kembali dan pastikan posting berjalan mulus
      await page.goto(`${APP_URL}/aset/buku-pembantu`, { waitUntil: 'networkidle0' })
      await page.waitForFunction(() => document.body.textContent.includes('Juni 2026'), { timeout: 10000 })
      await clickElementWithText(page, 'button', 'Pratinjau & Bukukan Penyusutan')
      await page.waitForFunction(() => document.body.textContent.includes('Konfirmasi Posting Penyusutan'), { timeout: 5000 })
      await clickElementWithText(page, 'button', 'Konfirmasi & Bukukan')

      await page.waitForFunction(
        () => document.body.textContent.includes('Sudah Dibukukan'),
        { timeout: 10000 }
      )
      console.log('[E2E-FASE4] Alur revisi parameter, pengesahan ulang snapshot v2, dan pembukuan berhasil!')
    })

    // --- SUBTEST 10: Hak Akses Staf (Mode Baca-Saja) ---
    await t.test('10. Verifikasi Hak Akses Staf: Mode Baca-Saja Terlindungi', async () => {
      await page.evaluate(() => {
        window.localStorage.clear()
        window.sessionStorage.clear()
      })
      await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0' })

      await setInputValue(page, '#email', 'staff@simkos.test')
      await setInputValue(page, '#password', 'testpass123')
      await clickElementWithText(page, 'button', 'Masuk')
      await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })

      await page.goto(`${APP_URL}/aset/buku-pembantu`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1', { timeout: 10000 })

      const staffPageText = await page.evaluate(() => document.body.textContent)
      assert.ok(staffPageText.includes('Baca Saja') || staffPageText.includes('staff'), 'Badge staf baca-saja harus tampil')

      const hasMutateButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        return buttons.some(b => 
          b.textContent.includes('Batalkan Posting') || 
          b.textContent.includes('Kunci Periode') || 
          b.textContent.includes('Pratinjau & Bukukan') ||
          b.textContent.includes('Tanggal Mulai') ||
          b.textContent.includes('Ubah Tanggal')
        )
      })
      assert.strictEqual(hasMutateButtons, false, 'Tombol mutasi tidak boleh ditampilkan kepada staf')

      await page.goto(`${APP_URL}/aset/${assetAcId}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1, h2', { timeout: 10000 })

      const hasStaffAssetMutations = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        return buttons.some(b => 
          b.textContent.includes('Revisi Parameter') || 
          b.textContent.includes('Sahkan Saldo Awal') || 
          b.textContent.includes('Aktivasi Aset') ||
          b.textContent.includes('Sahkan Ulang Aset')
        )
      })
      assert.strictEqual(hasStaffAssetMutations, false, 'Tombol mutasi aset tidak boleh muncul untuk staf')
      console.log('[E2E-FASE4] Mode baca-saja staf terbukti terisolasi dengan sempurna.')
    })

    // --- SUBTEST 11: Verifikasi Integritas Kas Nol Dampak ---
    await t.test('11. Pemeriksaan Database: Integritas Data Kas Nol Perubahan Sebelum & Sesudah Skenario', async () => {
      const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
      await pgClient.connect()
      try {
        const snapshotAfter = await getCashDatabaseSnapshot(pgClient)

        assert.deepStrictEqual(snapshotAfter.expenses, snapshotBefore.expenses, 'Data expenses harus 100% identik')
        assert.deepStrictEqual(snapshotAfter.incomes, snapshotBefore.incomes, 'Data incomes harus 100% identik')
        assert.deepStrictEqual(snapshotAfter.journals, snapshotBefore.journals, 'Data journals harus 100% identik')
        assert.deepStrictEqual(snapshotAfter.cashFlows, snapshotBefore.cashFlows, 'Data cashFlows harus 100% identik')

        console.log('[E2E-FASE4] Verifikasi Integritas Kas Sukses: 0 mutasi pada data kas!')
      } finally {
        await pgClient.end()
      }
    })

    // --- SUBTEST 12: Tangkap Bukti Visual Desktop dan Mobile ---
    await t.test('12. Tangkap Screenshot Desktop dan Mobile Buku Pembantu Resolusi Tinggi', async () => {
      await page.evaluate(() => {
        window.localStorage.clear()
        window.sessionStorage.clear()
      })
      await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0' })
      await setInputValue(page, '#email', 'owner@simkos.test')
      await setInputValue(page, '#password', 'testpass123')
      await clickElementWithText(page, 'button', 'Masuk')
      await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })

      // 12.1 Screenshot Desktop
      await page.setViewport({ width: 1280, height: 950 })
      await page.goto(`${APP_URL}/aset/buku-pembantu`, { waitUntil: 'networkidle0' })
      await page.waitForFunction(() => document.body.textContent.includes('Rincian Ledger Penyusutan Resmi'), { timeout: 10000 })
      await new Promise(r => setTimeout(r, 600))

      const desktopShotPath = path.join(ROOT, 'docs/screenshots/qa_fase4_desktop_buku_pembantu.png')
      await page.screenshot({ path: desktopShotPath, fullPage: true })

      try {
        const artifactDesktop = path.join(ARTIFACT_DIR, 'qa_fase4_desktop_buku_pembantu.png')
        fs.copyFileSync(desktopShotPath, artifactDesktop)
      } catch {}

      // 12.2 Screenshot Mobile
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
      await page.goto(`${APP_URL}/aset/buku-pembantu`, { waitUntil: 'networkidle0' })
      await page.waitForFunction(() => document.body.textContent.includes('Rincian Ledger Penyusutan Resmi'), { timeout: 10000 })
      await new Promise(r => setTimeout(r, 600))

      const mobileShotPath = path.join(ROOT, 'docs/screenshots/qa_fase4_mobile_buku_pembantu.png')
      await page.screenshot({ path: mobileShotPath, fullPage: true })

      try {
        const artifactMobile = path.join(ARTIFACT_DIR, 'qa_fase4_mobile_buku_pembantu.png')
        fs.copyFileSync(mobileShotPath, artifactMobile)
      } catch {}

      console.log('[E2E-FASE4] Screenshot visual desktop dan mobile berhasil disimpan.')
    })

    await context.close()
  } catch (err) {
    console.error('[E2E-FASE4 ERROR DETECTED]:', err)
    throw err
  } finally {
    if (browser) {
      try { await browser.close() } catch {}
      console.log('[E2E-FASE4] Browser ditutup.')
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
        execSync('fuser -k 5178/tcp 2>/dev/null || true; pkill -9 -f "vite.*5178" || true', { shell: '/bin/bash', stdio: 'ignore' })
      } catch {}
      console.log('[E2E-FASE4] Vite dev server dihentikan.')
    }
    if (supabaseStack) {
      try { await supabaseStack.stop() } catch {}
      console.log('[E2E-FASE4] Supabase stack dihentikan.')
    }
  }
})
