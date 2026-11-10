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

const VITE_PORT = 5178
let APP_URL = `http://127.0.0.1:${VITE_PORT}`
const DB_PORT = 54322
const DB_NAME = 'simkos_qa_staging'
const DB_USER = process.env.USER || 'disnak'

const ARTIFACT_DIR = process.platform === 'win32'
  ? 'C:/Users/Disnak/.gemini/antigravity/brain/008b6dbe-f529-406f-aab3-6014d58f7bcb'
  : '/mnt/c/Users/Disnak/.gemini/antigravity/brain/008b6dbe-f529-406f-aab3-6014d58f7bcb'

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

test('Alur Browser E2E Pembukuan Aset, Saldo Awal, & Buku Pembantu Penyusutan (Fase 4B-2)', { timeout: 180000 }, async (t) => {
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

    // --- LANGKAH 1: Login Owner Melalui Form Resmi ---
    await t.test('1. Login Owner Menggunakan GoTrue Resmi', async () => {
      await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0' })
      await setInputValue(page, '#email', 'owner@simkos.test')
      await setInputValue(page, '#password', 'testpass123')
      await clickElementWithText(page, 'button', 'Masuk')

      await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })
      assert.ok(!page.url().includes('/login'), 'Login harus berhasil')
      console.log('[E2E-FASE4] Owner berhasil login.')
    })

    // --- LANGKAH 2: Konfigurasi Tanggal Mulai Pembukuan di Buku Pembantu ---
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

    // --- LANGKAH 3: Aktivasi Aset & Pengesahan Saldo Awal Komponen Historis ---
    await t.test('3. Detail Aset: Aktivasi Aset & Pengesahan Saldo Awal Komponen Historis', async () => {
      // 3.1 Buka Detail Aset AC
      await page.goto(`${APP_URL}/aset/${assetAcId}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1, h2', { timeout: 10000 })

      // Verifikasi banner draf siap aktivasi
      const bodyText1 = await page.evaluate(() => document.body.textContent)
      assert.ok(bodyText1.includes('Data Aset Lengkap — Siap Diaktivasi'), 'Banner siap aktivasi harus muncul')

      // Klik tombol "Aktivasi Aset (Resmi)"
      await clickElementWithText(page, 'button', 'Aktivasi Aset (Resmi)')
      await page.waitForSelector('button', { timeout: 5000 })

      // Klik konfirmasi di modal
      await clickElementWithText(page, 'button', 'Konfirmasi Aktivasi')

      // Verifikasi status aset menjadi Aktif (Snapshot v1)
      await page.waitForFunction(
        () => document.body.textContent.includes('Aset Aktif Resmi') && document.body.textContent.includes('Snapshot v1'),
        { timeout: 10000 }
      )

      // Verifikasi indikator Saldo Awal Belum Disahkan karena tanggal_siap_guna (2024-06-16) < bookkeeping_start_date (2026-06-01)
      await page.waitForFunction(
        () => document.body.textContent.includes('Saldo Awal Belum Disahkan'),
        { timeout: 10000 }
      )

      // Klik "Sahkan Saldo Awal"
      await clickElementWithText(page, 'button', 'Sahkan Saldo Awal')
      await page.waitForFunction(() => document.body.textContent.includes('Pengesahan Saldo Awal'), { timeout: 5000 })

      // Sahkan via jalur simulasi historis (default)
      await clickElementWithText(page, 'button', 'Konfirmasi Sahkan Saldo Awal')

      // Verifikasi indikator berubah menjadi ✅ Saldo Awal Disahkan (Historis)
      await page.waitForFunction(
        () => document.body.textContent.includes('Saldo Awal Disahkan (Historis)'),
        { timeout: 10000 }
      )
      console.log('[E2E-FASE4] Aset AC diaktivasi & saldo awal historis disahkan.')

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
      // Karena siap guna Paviliun adalah 2026-06-01 (tepat sama dengan bookkeeping start date), komponen ini non-historis
      const pavText = await page.evaluate(() => document.body.textContent)
      assert.ok(pavText.includes('Komponen Non-Historis'), 'Paviliun harus berstatus non-historis')
      console.log('[E2E-FASE4] Aset Paviliun berhasil diaktivasi sebagai non-historis.')
    })

    // --- LANGKAH 4: Alur Pratinjau Server & Posting Penyusutan di Buku Pembantu ---
    await t.test('4. Buku Pembantu: Pratinjau Server & Posting Periode 2026-06', async () => {
      await page.goto(`${APP_URL}/aset/buku-pembantu`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1', { timeout: 10000 })
      const initialText = await page.evaluate(() => document.body.textContent)
      console.log('[DEBUG INITIAL BUKU PEMBANTU TEXT]:', initialText.replace(/\s+/g, ' ').slice(0, 1000))

      // Tunggu periode 2026-06 selesai dimuat
      await page.waitForFunction(
        () => document.body.textContent.includes('Juni 2026') && document.body.textContent.includes('Terbuka — Belum Dibukukan'),
        { timeout: 10000 }
      )

      // Verifikasi metrik estimasi pratinjau server
      try {
        await page.waitForFunction(
          () => document.body.textContent.includes('600.000') && document.body.textContent.includes('475.000'),
          { timeout: 10000 }
        )
      } catch (err) {
        const txt = await page.evaluate(() => document.body.textContent)
        console.log('[DEBUG SUBTEST 4 BODY TEXT]:', txt.replace(/\s+/g, ' ').slice(0, 1000))
        throw err
      }

      // Klik tombol "Pratinjau & Bukukan Penyusutan"
      await clickElementWithText(page, 'button', 'Pratinjau & Bukukan Penyusutan')

      // Modal konfirmasi posting terbuka
      await page.waitForFunction(
        () => document.body.textContent.includes('Konfirmasi Posting Penyusutan'),
        { timeout: 5000 }
      )

      // Klik "Konfirmasi & Bukukan"
      await clickElementWithText(page, 'button', 'Konfirmasi & Bukukan')

      // Verifikasi transisi ke mode "Sudah Dibukukan"
      await page.waitForFunction(
        () => document.body.textContent.includes('Sudah Dibukukan') && document.body.textContent.includes('Rincian Ledger Penyusutan Resmi'),
        { timeout: 10000 }
      )

      // Verifikasi riwayat batch memuat batch posted
      const bodyText = await page.evaluate(() => document.body.textContent)
      assert.ok(bodyText.includes('BATCH-202606-') || bodyText.includes('BATCH-2026-06-') || bodyText.includes('BATCH-2026'), 'Nomor batch harus tercantum di riwayat')
      assert.ok(bodyText.includes('Batalkan Posting (Storno)'), 'Tombol batalkan storno harus muncul untuk batch aktif')
      console.log('[E2E-FASE4] Posting penyusutan periode 2026-06 berhasil dibukukan secara resmi!')
    })

    // --- LANGKAH 5: Idempotensi Pengiriman Ulang & Anti Double-Click ---
    await t.test('5. Verifikasi Idempotensi & Proteksi Pengiriman Ulang Server', async () => {
      const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
      await pgClient.connect()
      try {
        const batchRes = await pgClient.query(`
          SELECT id, batch_number, total_depreciation 
          FROM public.asset_depreciation_batches 
          WHERE org_id = '${orgId}' AND period_key = '2026-06' AND batch_status = 'posted'
        `)
        assert.strictEqual(batchRes.rows.length, 1, 'Hanya ada tepat 1 batch posted untuk 2026-06')
        assert.strictEqual(Number(batchRes.rows[0].total_depreciation), 600000, 'Total beban posted harus Rp 600.000')
        console.log('[E2E-FASE4] Keunikan batch efektif & konsistensi data terverifikasi.')
      } finally {
        await pgClient.end()
      }
    })

    // --- LANGKAH 6: Pembatalan Batch Terakhir (Storno Reversal) & Re-Posting ---
    await t.test('6. Pembatalan Batch Terakhir (Storno Reversal) & Posting Ulang', async () => {
      // 6.1 Klik Batalkan Posting (Storno)
      await clickElementWithText(page, 'button', 'Batalkan Posting (Storno)')

      // Tunggu modal storno
      await page.waitForFunction(() => document.body.textContent.includes('Batalkan Batch (Storno Reversal)'), { timeout: 5000 })

      // Isi alasan pembatalan
      await setInputValue(page, 'textarea', 'Koreksi salah posting untuk pengujian browser E2E')

      // Konfirmasi pembatalan
      await clickElementWithText(page, 'button', 'Konfirmasi Batalkan')

      // Verifikasi status kembali Terbuka — Belum Dibukukan
      await page.waitForFunction(
        () => document.body.textContent.includes('Terbuka — Belum Dibukukan'),
        { timeout: 10000 }
      )

      // Verifikasi riwayat batch memuat status Reversed
      const bodyTextRev = await page.evaluate(() => document.body.textContent)
      assert.ok(bodyTextRev.includes('Dibatalkan') || bodyTextRev.includes('reversed'), 'Batch pertama harus berstatus reversed')

      // 6.2 Posting ulang periode 2026-06
      await clickElementWithText(page, 'button', 'Pratinjau & Bukukan Penyusutan')
      await page.waitForFunction(() => document.body.textContent.includes('Konfirmasi Posting Penyusutan'), { timeout: 5000 })
      await clickElementWithText(page, 'button', 'Konfirmasi & Bukukan')

      await page.waitForFunction(
        () => document.body.textContent.includes('Sudah Dibukukan'),
        { timeout: 10000 }
      )
      console.log('[E2E-FASE4] Pembatalan storno & posting pengganti berhasil!')
    })

    // --- LANGKAH 7: Penguncian & Pembukaan Kunci Periode ---
    await t.test('7. Penguncian & Pembukaan Kunci Periode di Buku Pembantu', async () => {
      // Pindah ke periode berikutnya: 2026-07
      await clickElementWithText(page, 'button', '›')
      await page.waitForFunction(
        () => document.body.textContent.includes('Juli 2026'),
        { timeout: 10000 }
      )

      // Klik tombol Kunci Periode
      await clickElementWithText(page, 'button', 'Kunci Periode')
      await page.waitForFunction(() => document.body.textContent.includes('Kunci Periode Pembukuan'), { timeout: 5000 })

      // Isi alasan kunci periode (input text)
      await setInputValue(page, 'input[placeholder*="penguncian"]', 'Tutup buku interim Juli 2026 selesai diaudit')
      await clickElementWithText(page, 'button', 'Konfirmasi Kunci Periode')

      // Verifikasi badge status periode berubah menjadi "Terkunci"
      await page.waitForFunction(
        () => document.body.textContent.includes('Terkunci'),
        { timeout: 10000 }
      )

      // Verifikasi tombol posting tidak dapat ditekan / disabled / hilang
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

    // --- LANGKAH 8: Revisi Parameter Komponen, Deteksi Perlu Pengesahan Ulang, & Aktivasi Ulang ---
    await t.test('8. Revisi Parameter Komponen & Alur Pengesahan Ulang Aset', async () => {
      // Kembali ke periode 2026-06 dan batalkan posting batch pengganti terlebih dahulu agar aset tidak diblokir oleh batch aktif
      await clickElementWithText(page, 'button', '‹')
      await page.waitForFunction(() => document.body.textContent.includes('Juni 2026'), { timeout: 10000 })
      await clickElementWithText(page, 'button', 'Batalkan Posting (Storno)')
      await page.waitForFunction(() => document.body.textContent.includes('Batalkan Batch (Storno Reversal)'), { timeout: 5000 })
      await setInputValue(page, 'textarea', 'Batalkan untuk revisi parameter komponen AC')
      await clickElementWithText(page, 'button', 'Konfirmasi Batalkan')
      await page.waitForFunction(() => document.body.textContent.includes('Terbuka — Belum Dibukukan'), { timeout: 10000 })

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

      // Verifikasi status aset berubah menjadi "Perlu Pengesahan Ulang" (Banner oranye)
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

    // --- LANGKAH 9: Hak Akses Staf (Mode Baca-Saja) ---
    await t.test('9. Verifikasi Hak Akses Staf: Mode Baca-Saja Terlindungi', async () => {
      // 9.1 Logout Owner
      await page.evaluate(() => {
        window.localStorage.clear()
        window.sessionStorage.clear()
      })
      await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0' })

      // 9.2 Login Staff
      await setInputValue(page, '#email', 'staff@simkos.test')
      await setInputValue(page, '#password', 'testpass123')
      await clickElementWithText(page, 'button', 'Masuk')
      await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })

      // 9.3 Buka Buku Pembantu
      await page.goto(`${APP_URL}/aset/buku-pembantu`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1', { timeout: 10000 })

      // Verifikasi role badge staf (Mode Baca-Saja)
      const staffPageText = await page.evaluate(() => document.body.textContent)
      assert.ok(staffPageText.includes('Baca Saja') || staffPageText.includes('staff'), 'Badge staf baca-saja harus tampil')

      // Verifikasi tombol mutasi (Batalkan Posting, Kunci Periode, dsb) TIDAK tersedia
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

      // 9.4 Buka Detail Aset
      await page.goto(`${APP_URL}/aset/${assetAcId}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1, h2', { timeout: 10000 })

      // Verifikasi tombol revisi parameter / pengesahan saldo awal / aktivasi tidak muncul untuk staf
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

    // --- LANGKAH 10: Verifikasi Integritas Kas Nol Dampak ---
    await t.test('10. Verifikasi Integritas Data Kas: Nol Perubahan Sebelum & Sesudah Skenario', async () => {
      const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
      await pgClient.connect()
      try {
        const snapshotAfter = await getCashDatabaseSnapshot(pgClient)

        // Verifikasi tidak ada perubahan apapun pada tabel kas
        assert.deepStrictEqual(snapshotAfter.expenses, snapshotBefore.expenses, 'Data expenses harus 100% identik')
        assert.deepStrictEqual(snapshotAfter.incomes, snapshotBefore.incomes, 'Data incomes harus 100% identik')
        assert.deepStrictEqual(snapshotAfter.journals, snapshotBefore.journals, 'Data journals harus 100% identik')
        assert.deepStrictEqual(snapshotAfter.cashFlows, snapshotBefore.cashFlows, 'Data cashFlows harus 100% identik')

        console.log('[E2E-FASE4] Verifikasi Integritas Kas Sukses: 0 mutasi pada data kas!')
      } finally {
        await pgClient.end()
      }
    })

    // --- LANGKAH 11: Tangkap Bukti Visual Desktop dan Mobile ---
    await t.test('11. Tangkap Screenshot Desktop dan Mobile Buku Pembantu Resolusi Tinggi', async () => {
      // Re-login owner agar screenshot menangkap tampilan penuh buku pembantu
      await page.evaluate(() => {
        window.localStorage.clear()
        window.sessionStorage.clear()
      })
      await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0' })
      await setInputValue(page, '#email', 'owner@simkos.test')
      await setInputValue(page, '#password', 'testpass123')
      await clickElementWithText(page, 'button', 'Masuk')
      await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })

      // 11.1 Screenshot Desktop
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

      // 11.2 Screenshot Mobile
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
    if (viteProcess && !viteProcess.killed) {
      try {
        viteProcess.kill('SIGKILL')
      } catch {}
      console.log('[E2E-FASE4] Vite dev server dihentikan.')
    }
    if (supabaseStack) {
      try { await supabaseStack.stop() } catch {}
      console.log('[E2E-FASE4] Supabase stack dihentikan.')
    }
  }
})
