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

async function getFullDatabaseSnapshot(client) {
  const assets = (await client.query('SELECT * FROM public.assets ORDER BY id')).rows
  const components = (await client.query('SELECT * FROM public.asset_components ORDER BY id')).rows
  const expenses = (await client.query('SELECT * FROM public.expenses ORDER BY id')).rows

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

  return { assets, components, expenses, journals, cashFlows }
}

test('Alur Browser End-to-End Simulasi Penyusutan Aset (Fase 3-R)', { timeout: 150000 }, async (t) => {
  let supabaseStack = null
  let viteProcess = null
  let browser = null
  let assetAcId = null
  let assetTanahId = null
  let assetGedungId = null
  let snapshotBefore = null

  try {
    // 1. Jalankan Stack Supabase Resmi
    console.log('[E2E-SIMULASI-3R] Menyiapkan Supabase stack resmi...')
    supabaseStack = await startSupabaseStack()

    // 2. Siapkan data aset uji deterministik di PostgreSQL
    const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
    await pgClient.connect()
    try {
      const orgRes = await pgClient.query("SELECT id FROM public.organizations WHERE name = 'SimKos' LIMIT 1")
      const orgId = orgRes.rows[0].id

      // Aset 1: AC Daikin Kamar (Fasilitas Kamar - Garis Lurus standar)
      const resAc = await pgClient.query(`
        INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan, kondisi_fisik, dasar_penggunaan)
        VALUES ('${orgId}', 'AC Daikin Kamar 01 Simulasi', 'fasilitas_kamar', 'draft', 'baik', 'milik_sendiri')
        RETURNING id;
      `)
      assetAcId = resAc.rows[0].id

      await pgClient.query(`
        INSERT INTO public.asset_components (
          asset_id, org_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
          tanggal_siap_guna, masa_manfaat_bulan, pola_penggunaan, porsi_usaha_persen, status_kapitalisasi
        )
        VALUES (
          '${assetAcId}', '${orgId}', 'Unit AC Daikin 1/2 PK', 'perolehan_baru', 6000000, 0,
          '2026-06-16', 60, 'seluruhnya_usaha', 100, 'kapitalisasi'
        );
      `)

      // Aset 2: Tanah Kavling SimKos (Kategori Tanah - Tidak Disusutkan)
      const resTanah = await pgClient.query(`
        INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan, kondisi_fisik, dasar_penggunaan)
        VALUES ('${orgId}', 'Tanah Kavling Area Depan SimKos', 'tanah', 'draft', 'baik', 'milik_sendiri')
        RETURNING id;
      `)
      assetTanahId = resTanah.rows[0].id

      await pgClient.query(`
        INSERT INTO public.asset_components (
          asset_id, org_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
          pola_penggunaan, porsi_usaha_persen, status_kapitalisasi
        )
        VALUES (
          '${assetTanahId}', '${orgId}', 'Lahan Utama 300 m2', 'perolehan_baru', 500000000, 0,
          'seluruhnya_usaha', 100, 'kapitalisasi'
        );
      `)

      // Aset 3: Gedung Induk Multi-Komponen dengan Komponen Porsi Usaha NULL
      const resGedung = await pgClient.query(`
        INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan, kondisi_fisik, dasar_penggunaan)
        VALUES ('${orgId}', 'Gedung Induk SimKos 2 Lantai', 'gedung', 'draft', 'baik', 'milik_sendiri')
        RETURNING id;
      `)
      assetGedungId = resGedung.rows[0].id

      // Komponen 1 Gedung: Struktur Bangunan (Porsi usaha NULL/belum ditentukan)
      await pgClient.query(`
        INSERT INTO public.asset_components (
          asset_id, org_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
          tanggal_siap_guna, masa_manfaat_bulan, pola_penggunaan, porsi_usaha_persen, status_kapitalisasi
        )
        VALUES (
          '${assetGedungId}', '${orgId}', 'Struktur Bangunan Gedung Induk', 'perolehan_baru', 300000000, 0,
          '2026-01-01', 240, 'campuran', NULL, 'kapitalisasi'
        );
      `)

      // Komponen 2 Gedung: Renovasi Lanjutan (Siap guna masa mendatang 2027-01-01, Porsi usaha 80%)
      await pgClient.query(`
        INSERT INTO public.asset_components (
          asset_id, org_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
          tanggal_siap_guna, masa_manfaat_bulan, pola_penggunaan, porsi_usaha_persen, status_kapitalisasi
        )
        VALUES (
          '${assetGedungId}', '${orgId}', 'Renovasi Penambahan Balkon Lantai 2', 'penambahan_kapasitas', 60000000, 0,
          '2027-01-01', 120, 'campuran', 80, 'kapitalisasi'
        );
      `)

      // Ambil snapshot awal lengkap database sebelum ada aktivitas browser/simulasi
      snapshotBefore = await getFullDatabaseSnapshot(pgClient)
      console.log(`[E2E-SIMULASI-3R] Snapshot database awal tersimpan: ${snapshotBefore.assets.length} aset, ${snapshotBefore.components.length} komponen, ${snapshotBefore.expenses.length} expenses.`)
    } finally {
      await pgClient.end()
    }

    // 3. Jalankan Vite dev server pada port 5176
    console.log(`[E2E-SIMULASI-3R] Memulai Vite dev server pada port ${VITE_PORT}...`)
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

    console.log(`[E2E-SIMULASI-3R] Vite dev server siap di ${APP_URL}! Meluncurkan Google Chrome...`)

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
      console.log('[E2E-SIMULASI-3R] Owner berhasil login.')
    })

    // --- LANGKAH 2: Buka Halaman Detail Aset AC & Verifikasi Nilai Awal ---
    await t.test('2. Buka Halaman Detail Aset AC & Verifikasi Presisi Simulasi Garis Lurus', async () => {
      await page.goto(`${APP_URL}/aset/${assetAcId}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1, h2', { timeout: 10000 })

      // Pastikan bagian Simulasi Penyusutan Aset ada
      await page.waitForFunction(
        () => document.body.textContent.includes('Simulasi Penyusutan Aset'),
        { timeout: 10000 }
      )

      // Verifikasi badge simulasi
      const bodyText = await page.evaluate(() => document.body.textContent)
      assert.ok(bodyText.includes('Simulasi — belum dibukukan'), 'Badge simulasi harus muncul')

      // Verifikasi beban bulan penuh (Rp 100.000) dan prorata Juni 2026 (Rp 50.000)
      await page.waitForFunction(
        () => document.body.textContent.includes('100.000') && document.body.textContent.includes('50.000'),
        { timeout: 10000 }
      )
      console.log('[E2E-SIMULASI-3R] Nilai awal simulasi AC terverifikasi akurat.')
    })

    // --- LANGKAH 3: Ubah Parameter Simulasi In-Memory (Preset, Porsi Usaha Null, Metode Kosong) ---
    await t.test('3. Ubah Parameter Simulasi: Preset Umur, Kosongkan Porsi Usaha, dan Metode Belum Ditentukan', async () => {
      // 3.1 Klik preset "8 Tahun (96 bln)"
      await clickElementWithText(page, 'button', '8 Tahun (96 bln)')

      // Tunggu perubahan reaktif pada DOM ke Rp 62.500 dan prorata Rp 31.250
      await page.waitForFunction(
        () => document.body.textContent.includes('62.500') && document.body.textContent.includes('31.250'),
        { timeout: 5000 }
      )

      // Indikator perubahan lokal
      const hasModifiedNotice = await page.evaluate(() => {
        return document.body.textContent.includes('Nilai simulasi sedang diubah secara lokal (in-memory)')
      })
      assert.ok(hasModifiedNotice, 'Harus menampilkan notifikasi modifikasi in-memory')

      // 3.2 Kosongkan Porsi Usaha melalui tombol UI
      await clickElementWithText(page, 'button', 'Kosongkan')

      // Periksa bahwa label "(Belum Ditentukan)" muncul di input porsi usaha
      await page.waitForFunction(
        () => document.body.textContent.includes('(Belum Ditentukan)'),
        { timeout: 5000 }
      )

      // Periksa bahwa beban usaha pada tabel bertuliskan "Belum ditentukan", namun beban penyusutan total tetap Rp 62.500
      const hasBelumDitentukanTable = await page.evaluate(() => {
        return document.body.textContent.includes('Belum ditentukan')
      })
      assert.ok(hasBelumDitentukanTable, 'Kolom beban usaha harus menampilkan "Belum ditentukan" saat porsi null')

      // 3.3 Ubah Metode Penyusutan ke "Belum Ditentukan"
      await page.$eval('select', el => {
        el.value = 'belum_ditentukan'
        el.dispatchEvent(new Event('change', { bubbles: true }))
      })

      // Verifikasi bahwa status beralih ke "Belum dapat dihitung" dan muncul pesan field belum lengkap
      await page.waitForFunction(
        () => document.body.textContent.includes('Belum dapat dihitung') &&
              document.body.textContent.includes('Metode penyusutan belum ditentukan'),
        { timeout: 5000 }
      )
      console.log('[E2E-SIMULASI-3R] Uji interaktif parameter (preset, porsi null, metode kosong) sukses.')

      // 3.4 Kembalikan metode ke Garis Lurus agar dapat dites reset
      await page.$eval('select', el => {
        el.value = 'garis_lurus'
        el.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await page.waitForFunction(
        () => document.body.textContent.includes('62.500'),
        { timeout: 5000 }
      )
    })

    // --- LANGKAH 4: Reset Simulasi ke Data Tersimpan ---
    await t.test('4. Klik "Kembalikan ke data tersimpan" dan Verifikasi Kembalinya Nilai Asli', async () => {
      await clickElementWithText(page, 'button', 'Kembalikan ke data tersimpan')

      // Tunggu nilai kembali ke 100.000 dan porsi usaha kembali ke 100%
      await page.waitForFunction(
        () => document.body.textContent.includes('100.000') && !document.body.textContent.includes('(Belum Ditentukan)'),
        { timeout: 5000 }
      )

      const hasModifiedNotice = await page.evaluate(() => {
        return document.body.textContent.includes('Nilai simulasi sedang diubah secara lokal (in-memory)')
      })
      assert.strictEqual(hasModifiedNotice, false, 'Notifikasi modifikasi in-memory harus hilang setelah reset')
      console.log('[E2E-SIMULASI-3R] Reset parameter simulasi sukses.')
    })

    // --- LANGKAH 5: Verifikasi Antarmuka Aset Kategori Tanah ---
    await t.test('5. Verifikasi UI Aset Tanah: Masa Manfaat Tak Terbatas & Tidak Disusutkan', async () => {
      await page.goto(`${APP_URL}/aset/${assetTanahId}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1, h2', { timeout: 10000 })

      // Verifikasi teks penanganan tanah muncul di UI
      await page.waitForFunction(
        () => document.body.textContent.includes('Tanah memiliki masa manfaat tidak terbatas dan tidak mengalami penyusutan'),
        { timeout: 10000 }
      )

      // Pastikan tabel jadwal bulanan tidak dirender untuk tanah
      const hasTabelBeban = await page.evaluate(() => {
        return document.querySelector('table tbody tr') !== null
      })
      assert.strictEqual(hasTabelBeban, false, 'Tabel jadwal penyusutan tidak boleh dirender untuk aset tanah')
      console.log('[E2E-SIMULASI-3R] Antarmuka aset tanah diverifikasi akurat.')
    })

    // --- LANGKAH 6: Verifikasi Aset Multi-Komponen, Porsi NULL, Ganti Tab, dan Reload ---
    await t.test('6. Verifikasi Multi-Komponen: Porsi Usaha NULL di DB, Tab Switching, dan Reload', async () => {
      await page.goto(`${APP_URL}/aset/${assetGedungId}`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1, h2', { timeout: 10000 })

      // Tunggu tabs multi-komponen muncul
      await page.waitForFunction(
        () => document.body.textContent.includes('Ringkasan Gabungan Aset') &&
              document.body.textContent.includes('Struktur Bangunan Gedung Induk') &&
              document.body.textContent.includes('Renovasi Penambahan Balkon Lantai 2'),
        { timeout: 10000 }
      )

      // 6.1 Pada tab ringkasan gabungan, periksa bahwa total biaya terkapitalisasi = Rp 360.000.000
      await page.waitForFunction(
        () => document.body.textContent.includes('360.000.000'),
        { timeout: 5000 }
      )

      // 6.2 Buka tab komponen pertama (Struktur Bangunan - porsi usaha NULL)
      await clickElementWithText(page, 'button', 'Struktur Bangunan Gedung Induk')
      await page.waitForFunction(
        () => document.body.textContent.includes('(Belum Ditentukan)') &&
              document.body.textContent.includes('300.000.000'),
        { timeout: 5000 }
      )

      // Verifikasi di tabel bahwa porsi usaha tertulis "Belum ditentukan"
      const hasBelumDitentukanComp1 = await page.evaluate(() => {
        return document.body.textContent.includes('Belum ditentukan')
      })
      assert.ok(hasBelumDitentukanComp1, 'Komponen dengan porsi NULL di DB harus menampilkan "Belum ditentukan"')

      // 6.3 Pindah ke tab komponen kedua (Renovasi - porsi usaha 80%)
      await clickElementWithText(page, 'button', 'Renovasi Penambahan Balkon Lantai 2')
      await page.waitForFunction(
        () => document.body.textContent.includes('60.000.000') &&
              !document.body.textContent.includes('(Belum Ditentukan)'),
        { timeout: 5000 }
      )

      // Ubah parameter in-memory di tab ini
      await clickElementWithText(page, 'button', '4 Tahun (48 bln)')
      const isModifiedBeforeReload = await page.evaluate(() => {
        return document.body.textContent.includes('Nilai simulasi sedang diubah secara lokal (in-memory)')
      })
      assert.ok(isModifiedBeforeReload, 'Parameter tab harus termodifikasi in-memory')

      // 6.4 Reload Halaman
      await page.reload({ waitUntil: 'networkidle0' })
      await page.waitForSelector('h1, h2', { timeout: 10000 })

      // Setelah reload, parameter lokal harus kembali bersih sesuai data server
      const isModifiedAfterReload = await page.evaluate(() => {
        return document.body.textContent.includes('Nilai simulasi sedang diubah secara lokal (in-memory)')
      })
      assert.strictEqual(isModifiedAfterReload, false, 'Setelah reload, state lokal in-memory harus bersih')
      console.log('[E2E-SIMULASI-3R] Verifikasi multi-komponen, porsi null, tab switching, dan reload sukses.')
    })

    // --- LANGKAH 7: Buktikan Secara Komparatif Tidak Ada Perubahan 1 Byte Pun di Database ---
    await t.test('7. Verifikasi Snapshot Komparatif: Database Tetap Utuh 100% Tanpa Mutasi', async () => {
      const pgClient = new pg.Client({ host: 'localhost', port: DB_PORT, user: DB_USER, database: DB_NAME })
      await pgClient.connect()
      try {
        const snapshotAfter = await getFullDatabaseSnapshot(pgClient)

        // Periksa kesetaraan komparatif utuh (deepStrictEqual)
        assert.deepStrictEqual(snapshotAfter.assets, snapshotBefore.assets, 'Tabel assets harus identik sebelum dan sesudah simulasi')
        assert.deepStrictEqual(snapshotAfter.components, snapshotBefore.components, 'Tabel asset_components harus identik sebelum dan sesudah simulasi')
        assert.deepStrictEqual(snapshotAfter.expenses, snapshotBefore.expenses, 'Tabel expenses harus identik sebelum dan sesudah simulasi')
        assert.deepStrictEqual(snapshotAfter.journals, snapshotBefore.journals, 'Tabel journals harus identik sebelum dan sesudah simulasi')
        assert.deepStrictEqual(snapshotAfter.cashFlows, snapshotBefore.cashFlows, 'Tabel cash_flows harus identik sebelum dan sesudah simulasi')

        console.log('[E2E-SIMULASI-3R] Snapshot database SEBELUM vs SESUDAH simulasi terbukti IDENTIK 100%!')
      } finally {
        await pgClient.end()
      }
    })

    // --- LANGKAH 8: Tangkap Screenshot Desktop dan Mobile ---
    await t.test('8. Tangkap Bukti Visual Desktop dan Mobile Resolusi Tinggi', async () => {
      // 8.1 Screenshot Desktop
      await page.setViewport({ width: 1280, height: 900 })
      await page.goto(`${APP_URL}/aset/${assetAcId}`, { waitUntil: 'networkidle0' })
      await new Promise(r => setTimeout(r, 800))
      const desktopShotPath = path.join(ROOT, 'docs/screenshots/qa_fase3_desktop_simulasi_penyusutan.png')
      await page.screenshot({ path: desktopShotPath, fullPage: true })

      // Simpan ke direktori artifacts jika ada
      try {
        const artifactDesktop = path.join(ARTIFACT_DIR, 'qa_fase3_desktop_simulasi_penyusutan.png')
        fs.copyFileSync(desktopShotPath, artifactDesktop)
      } catch {}

      // 8.2 Screenshot Mobile
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
      await new Promise(r => setTimeout(r, 800))
      const mobileShotPath = path.join(ROOT, 'docs/screenshots/qa_fase3_mobile_simulasi_penyusutan.png')
      await page.screenshot({ path: mobileShotPath, fullPage: true })

      try {
        const artifactMobile = path.join(ARTIFACT_DIR, 'qa_fase3_mobile_simulasi_penyusutan.png')
        fs.copyFileSync(mobileShotPath, artifactMobile)
      } catch {}

      console.log('[E2E-SIMULASI-3R] Screenshot desktop dan mobile berhasil disimpan.')
    })

    await context.close()
  } finally {
    if (browser) {
      try { await browser.close() } catch {}
      console.log('[E2E-SIMULASI-3R] Browser ditutup.')
    }
    if (viteProcess && !viteProcess.killed) {
      try {
        viteProcess.kill('SIGKILL')
      } catch {}
      console.log('[E2E-SIMULASI-3R] Vite dev server dihentikan.')
    }
    if (supabaseStack) {
      try { await supabaseStack.stop() } catch {}
      console.log('[E2E-SIMULASI-3R] Supabase stack dihentikan.')
    }
  }
})
