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

const VITE_PORT = 5176
const APP_URL = `http://127.0.0.1:${VITE_PORT}`
const DB_PORT = 54322
const DB_NAME = 'simkos_qa_staging'
const DB_USER = process.env.USER || 'disnak'

const ARTIFACT_DIR = 'C:/Users/Disnak/.gemini/antigravity/brain/008b6dbe-f529-406f-aab3-6014d58f7bcb'

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

test('Alur Browser End-to-End Simulasi Penyusutan Aset (Fase 3)', { timeout: 120000 }, async (t) => {
  let supabaseStack = null
  let viteProcess = null
  let browser = null
  let testAssetId = null

  try {
    // 1. Jalankan Stack Supabase Resmi
    console.log('[E2E-SIMULASI] Menyiapkan Supabase stack resmi...')
    supabaseStack = await startSupabaseStack()

    // 2. Siapkan data aset uji deterministik di PostgreSQL
    const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
    await pgClient.connect()
    try {
      const orgRes = await pgClient.query("SELECT id FROM public.organizations WHERE name = 'SimKos' LIMIT 1")
      const orgId = orgRes.rows[0].id

      const assetRes = await pgClient.query(`
        INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan, kondisi_fisik, dasar_penggunaan)
        VALUES ('${orgId}', 'AC Daikin Kamar 01 Simulasi', 'fasilitas_kamar', 'draft', 'baik', 'milik_sendiri')
        RETURNING id;
      `)
      testAssetId = assetRes.rows[0].id

      await pgClient.query(`
        INSERT INTO public.asset_components (
          asset_id, org_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
          tanggal_siap_guna, masa_manfaat_bulan, pola_penggunaan, porsi_usaha_persen, status_kapitalisasi
        )
        VALUES (
          '${testAssetId}', '${orgId}', 'Unit AC Daikin 1/2 PK', 'perolehan_baru', 6000000, 0,
          '2026-06-16', 60, 'seluruhnya_usaha', 100, 'kapitalisasi'
        );
      `)
      console.log(`[E2E-SIMULASI] Aset uji disiapkan dengan ID: ${testAssetId}`)
    } finally {
      await pgClient.end()
    }

    // 3. Jalankan Vite dev server pada port 5176
    console.log(`[E2E-SIMULASI] Memulai Vite dev server pada port ${VITE_PORT}...`)
    viteProcess = process.platform === 'win32'
      ? spawn('wsl', ['bash', '-c', `cd /home/disnak/projects/simkos-v2 && npx vite --mode test --port ${VITE_PORT}`], { stdio: 'pipe' })
      : spawn('npx', ['vite', '--mode', 'test', '--port', String(VITE_PORT)], { cwd: ROOT, stdio: 'pipe' })

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Vite dev server timeout')), 25000)
      const onData = (chunk) => {
        const text = chunk.toString()
        if (text.includes('ready in') || text.includes('Local:')) {
          clearTimeout(timeout)
          resolve()
        }
      }
      viteProcess.stdout.on('data', onData)
      viteProcess.stderr.on('data', onData)
    })

    console.log(`[E2E-SIMULASI] Vite dev server siap di ${APP_URL}! Meluncurkan Google Chrome...`)

    // 4. Luncurkan Google Chrome headless
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
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
    await page.setViewport({ width: 1280, height: 900 })

    // --- LANGKAH 1: Login Owner Melalui Form Resmi ---
    await t.test('1. Login Owner Menggunakan GoTrue Resmi', async () => {
      await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0' })
      await setInputValue(page, '#email', 'owner@simkos.test')
      await setInputValue(page, '#password', 'testpass123')
      await clickElementWithText(page, 'button', 'Masuk')

      await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })
      assert.ok(!page.url().includes('/login'), 'Login harus berhasil')
      console.log('[E2E-SIMULASI] Owner berhasil login.')
    })

    // --- LANGKAH 2: Buka Halaman Detail Aset Draf ---
    await t.test('2. Buka Halaman Detail Aset Draf & Bagian Simulasi', async () => {
      await page.goto(`${APP_URL}/aset/${testAssetId}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1, h2', { timeout: 10000 })

      // Pastikan bagian Simulasi Penyusutan Aset ada
      await page.waitForFunction(
        () => document.body.textContent.includes('Simulasi Penyusutan Aset'),
        { timeout: 10000 }
      )
      console.log('[E2E-SIMULASI] Halaman detail aset dan kartu simulasi terbuka.')
    })

    // --- LANGKAH 3: Verifikasi Nilai Awal Simulasi ---
    await t.test('3. Verifikasi Nilai Awal Terisi Sesuai Komponen Tersimpan', async () => {
      // Tunggu input masa manfaat terisi dengan nilai 60
      await page.waitForFunction(
        () => {
          const input = document.querySelector('input[type="number"][min="1"]')
          return input && input.value === '60'
        },
        { timeout: 10000 }
      )

      // Badge simulasi
      const badgeText = await page.$eval('section', el => el.textContent)
      assert.ok(badgeText.includes('Simulasi — belum dibukukan'), 'Badge simulasi harus muncul')

      // Cek ringkasan beban bulan penuh (Rp 100.000)
      await page.waitForFunction(
        () => document.body.textContent.includes('100.000'),
        { timeout: 10000 }
      )

      // Cek prorata bulan pertama Juni 2026 (Rp 50.000)
      await page.waitForFunction(
        () => document.body.textContent.includes('50.000') && document.body.textContent.includes('Prorata'),
        { timeout: 10000 }
      )

      console.log('[E2E-SIMULASI] Nilai awal simulasi diverifikasi akurat.')
    })

    // --- LANGKAH 4: Ubah Parameter Simulasi Secara Interaktif ---
    await t.test('4. Ubah Parameter Simulasi (8 Tahun / 96 Bulan) & Verifikasi Kereaktifan', async () => {
      // Klik preset "8 Tahun (96 bln)"
      await clickElementWithText(page, 'button', '8 Tahun (96 bln)')

      // Tunggu perubahan reaktif pada DOM
      await page.waitForFunction(
        () => document.body.textContent.includes('62.500'),
        { timeout: 5000 }
      )

      // Pastikan indikator in-memory muncul
      const hasModifiedNotice = await page.evaluate(() => {
        return document.body.textContent.includes('Nilai simulasi sedang diubah secara lokal (in-memory)')
      })
      assert.ok(hasModifiedNotice, 'Harus menampilkan notifikasi bahwa nilai simulasi diubah secara in-memory')

      // Verifikasi beban prorata pertama menjadi Rp 31.250 (15/30 * 62.500)
      const has31k = await page.evaluate(() => {
        return document.body.textContent.includes('31.250')
      })
      assert.ok(has31k, 'Beban prorata periode pertama harus reaktif berubah ke Rp 31.250')
      console.log('[E2E-SIMULASI] Parameter berhasil diubah dan tabel bereaksi seketika.')
    })

    // --- LANGKAH 5: Kembalikan ke Data Tersimpan ---
    await t.test('5. Klik "Kembalikan ke data tersimpan" dan Verifikasi Nilai Semula', async () => {
      await clickElementWithText(page, 'button', 'Kembalikan ke data tersimpan')

      // Tunggu nilai kembali ke 100.000
      await page.waitForFunction(
        () => document.body.textContent.includes('100.000'),
        { timeout: 5000 }
      )

      const masaInputVal = await page.$eval('input[type="number"][min="1"]', el => el.value)
      assert.strictEqual(masaInputVal, '60', 'Masa manfaat harus kembali ke 60 bulan')

      const hasModifiedNotice = await page.evaluate(() => {
        return document.body.textContent.includes('Nilai simulasi sedang diubah secara lokal (in-memory)')
      })
      assert.strictEqual(hasModifiedNotice, false, 'Notifikasi modifikasi in-memory harus hilang')
      console.log('[E2E-SIMULASI] Nilai simulasi berhasil direset ke nilai tersimpan.')
    })

    // --- LANGKAH 6: Buktikan Tidak Ada Efek Samping ke Database ---
    await t.test('6. Verifikasi Integritas Database: Tidak Ada Mutasi Pembukuan & Data Komponen Utuh', async () => {
      const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
      await pgClient.connect()
      try {
        // Cek asset_components
        const compRes = await pgClient.query(`
          SELECT masa_manfaat_bulan, biaya_perolehan, nilai_sisa 
          FROM public.asset_components 
          WHERE asset_id = '${testAssetId}'
        `)
        assert.strictEqual(compRes.rows.length, 1, 'Komponen harus tetap ada 1 baris')
        assert.strictEqual(Number(compRes.rows[0].masa_manfaat_bulan), 60, 'Masa manfaat di DB harus tetap 60 bulan')
        assert.strictEqual(Number(compRes.rows[0].biaya_perolehan), 6000000, 'Biaya perolehan di DB harus tetap 6.000.000')

        // Cek status aset
        const assetCheck = await pgClient.query(`SELECT status_pencatatan FROM public.assets WHERE id = '${testAssetId}'`)
        assert.strictEqual(assetCheck.rows[0].status_pencatatan, 'draft', 'Status aset harus tetap draft')

        // Cek tabel pengeluaran / expenses
        const expCheck = await pgClient.query("SELECT COUNT(*) FROM public.expenses WHERE keterangan ILIKE '%penyusutan%'")
        assert.strictEqual(Number(expCheck.rows[0].count), 0, 'Tidak boleh ada catatan beban pengeluaran penyusutan yang terbuat')

        // Cek tabel journal jika ada
        const tableCheck = await pgClient.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'journals'
          );
        `)
        if (tableCheck.rows[0].exists) {
          const journalCount = await pgClient.query("SELECT COUNT(*) FROM public.journals")
          assert.strictEqual(Number(journalCount.rows[0].count), 0, 'Tabel journals harus tetap kosong')
        }

        console.log('[E2E-SIMULASI] Database bersih: Terbukti tidak ada mutasi server atau efek samping pembukuan.')
      } finally {
        await pgClient.end()
      }
    })

    // --- LANGKAH 7: Tangkap Screenshot Desktop dan Mobile ---
    await t.test('7. Tangkap Bukti Visual Desktop dan Mobile', async () => {
      // 7.1 Screenshot Desktop
      await page.setViewport({ width: 1280, height: 900 })
      await new Promise(r => setTimeout(r, 500))
      const desktopShotPath = path.join(ROOT, 'docs/screenshots/qa_fase3_desktop_simulasi_penyusutan.png')
      await page.screenshot({ path: desktopShotPath, fullPage: true })

      // Simpan ke direktori artifacts jika ada
      try {
        const artifactDesktop = path.join(ARTIFACT_DIR, 'qa_fase3_desktop_simulasi_penyusutan.png')
        fs.copyFileSync(desktopShotPath, artifactDesktop)
      } catch {}

      // 7.2 Screenshot Mobile
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
      await new Promise(r => setTimeout(r, 500))
      const mobileShotPath = path.join(ROOT, 'docs/screenshots/qa_fase3_mobile_simulasi_penyusutan.png')
      await page.screenshot({ path: mobileShotPath, fullPage: true })

      try {
        const artifactMobile = path.join(ARTIFACT_DIR, 'qa_fase3_mobile_simulasi_penyusutan.png')
        fs.copyFileSync(mobileShotPath, artifactMobile)
      } catch {}

      console.log('[E2E-SIMULASI] Screenshot desktop dan mobile berhasil disimpan.')
    })

    await context.close()
  } finally {
    if (browser) {
      try { await browser.close() } catch {}
      console.log('[E2E-SIMULASI] Browser ditutup.')
    }
    if (viteProcess && !viteProcess.killed) {
      try {
        viteProcess.kill('SIGKILL')
      } catch {}
      console.log('[E2E-SIMULASI] Vite dev server dihentikan.')
    }
    if (supabaseStack) {
      try { await supabaseStack.stop() } catch {}
      console.log('[E2E-SIMULASI] Supabase stack dihentikan.')
    }
  }
})
