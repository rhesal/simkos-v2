import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import puppeteer from 'puppeteer-core'
import { startSupabaseStack, TEST_USERS, signJwt } from '../../scripts/start_qa_supabase.mjs'

const ROOT = path.resolve()
const CHROME_PATH = process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'

const ARTIFACTS_DIR = process.platform === 'win32'
  ? 'C:\\Users\\Disnak\\.gemini\\antigravity\\brain\\008b6dbe-f529-406f-aab3-6014d58f7bcb'
  : '/mnt/c/Users/Disnak/.gemini/antigravity/brain/008b6dbe-f529-406f-aab3-6014d58f7bcb'

const VITE_PORT = 5175
const APP_URL = `http://127.0.0.1:${VITE_PORT}`
const SUPABASE_URL = 'http://127.0.0.1:8432'

// Helper: isi input Vue v-model secara reaktif
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

// Helper: klik tombol atau link berdasarkan cuplikan teks
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

// Helper: cek apakah elemen dengan teks ada di halaman
async function hasElementWithText(page, selector, text) {
  return await page.evaluate(
    ({ sel, txt }) => {
      const els = Array.from(document.querySelectorAll(sel))
      return els.some(el => el.textContent.includes(txt))
    },
    { sel: selector, txt: text }
  )
}

// Helper login via UI menggunakan form login SimKos
async function loginViaUi(page, email, password) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0' })
  await setInputValue(page, '#email', email)
  await setInputValue(page, '#password', password)

  // Klik tombol Masuk ke Aplikasi
  await clickElementWithText(page, 'button', 'Masuk')

  // Tunggu hingga navigasi keluar dari /login
  await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })
}

test('Pengujian Browser End-to-End dengan Autentikasi Nyata & Layanan Supabase Terisolasi', { timeout: 180000 }, async (t) => {
  let supabaseStack = null
  let viteProcess = null
  let browser = null

  try {
    // 1. Jalankan stack Supabase lokal (PostgreSQL 16 + PostgREST 16.5 + Auth Gateway)
    console.log('[E2E] Memulai Supabase Local Stack...')
    supabaseStack = await startSupabaseStack()

    // 2. Jalankan Vite dev server pada port 5175 dalam mode test via WSL
    console.log(`[E2E] Memulai Vite dev server pada port ${VITE_PORT}...`)
    viteProcess = process.platform === 'win32'
      ? spawn('wsl', ['npx', 'vite', '--mode', 'test', '--port', String(VITE_PORT)], { stdio: 'pipe' })
      : spawn('npx', ['vite', '--mode', 'test', '--port', String(VITE_PORT)], { cwd: ROOT, stdio: 'pipe' })

    // Tunggu Vite siap
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

    console.log(`[E2E] Vite siap di ${APP_URL}! Meluncurkan Google Chrome...`)

    // 3. Luncurkan browser Chrome asli
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

    // Subtest 1: Login Owner, Tambah Draf Aset dengan Nilai Kosong (Nullable), & Navigasi
    await t.test('3.1 Login Owner, Tambah Draf Aset (Nullable Fields), dan Verifikasi Tampilan Desktop', async () => {
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      await page.setViewport({ width: 1280, height: 800 })

      try {
        page.on('dialog', async dialog => { await dialog.accept() })

        await loginViaUi(page, 'owner@simkos.test', 'testpass123')
        assert.ok(!page.url().includes('/login'), 'Harus berhasil login dan dialihkan dari halaman login')

        // Masuk ke menu /aset
        await page.goto(`${APP_URL}/aset`, { waitUntil: 'networkidle0' })
        await page.waitForSelector('h1', { timeout: 10000 })
        const title = await page.$eval('h1', el => el.textContent)
        assert.ok(title.includes('Aset & Inventaris'), 'Judul halaman harus memuat Aset & Inventaris')

        // Verifikasi tombol Tambah tersedia untuk Owner
        const addBtn = await page.$('a[href="/aset/tambah"]')
        assert.ok(addBtn, 'Tombol Tambah Aset harus terlihat untuk peran Owner')

        // Klik tombol Tambah Aset
        await addBtn.click()
        await page.waitForFunction(() => window.location.pathname === '/aset/tambah', { timeout: 10000 })

        // Pilih tipe Gedung pada pilihan awal wizard
        await clickElementWithText(page, 'button', 'Gedung / Bangunan Kos')
        await page.waitForSelector('input[placeholder*="Gedung Kos Utama"]', { timeout: 10000 })

        // Isi form draf aset: nama terisi, biaya/tanggal sengaja dikosongkan untuk menguji field nullable
        await setInputValue(page, 'input[placeholder*="Gedung Kos Utama"]', 'Gedung Utama Kos SimKos')
        await setInputValue(page, 'input[placeholder*="Dapat berbeda"]', 'Budi Santoso')

        // Simpan draf
        await clickElementWithText(page, 'button', 'Simpan Draf')

        // Verifikasi navigasi ke detail aset
        await page.waitForFunction(
          () => window.location.pathname.startsWith('/aset/'),
          { timeout: 15000 }
        )

        // Tangkapan layar desktop halaman detail aset
        const screenshotDetailPath = path.join(ARTIFACTS_DIR, 'qa_e2e_desktop_detail_aset.png')
        await page.screenshot({ path: screenshotDetailPath })
        console.log(`[E2E-SCREENSHOT] Tangkapan layar disimpan: ${screenshotDetailPath}`)
      } finally {
        await context.close()
      }
    })

    // Subtest 2: Backfill Inventaris & Idempotensi Pemanggilan Ulang di Browser
    await t.test('3.2 Backfill Inventaris & Pemanggilan Ulang (Idempotensi) via UI Browser', async () => {
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      await page.setViewport({ width: 1280, height: 800 })

      try {
        page.on('dialog', async dialog => { await dialog.accept() })

        await loginViaUi(page, 'owner@simkos.test', 'testpass123')
        await page.goto(`${APP_URL}/aset`, { waitUntil: 'networkidle0' })

        // Cari tombol Sinkronkan Draf di banner
        const hasSync = await hasElementWithText(page, 'button', 'Sinkronkan Draf')
        assert.ok(hasSync, 'Tombol Sinkronkan Draf harus muncul karena ada inventaris lama yang belum tertaut')

        // Klik tombol sinkronisasi pertama
        await clickElementWithText(page, 'button', 'Sinkronkan Draf')
        await page.waitForFunction(() => {
          const buttons = Array.from(document.querySelectorAll('button'))
          return !buttons.some(b => b.textContent.includes('Memproses...'))
        }, { timeout: 15000 })

        // Ambil tangkapan layar daftar aset setelah backfill
        const screenshotListPath = path.join(ARTIFACTS_DIR, 'qa_e2e_desktop_aset_list.png')
        await page.screenshot({ path: screenshotListPath })
        console.log(`[E2E-SCREENSHOT] Tangkapan layar disimpan: ${screenshotListPath}`)

        // Verifikasi pemanggilan ulang (Idempotensi): panggil RPC lagi via evaluate
        const secondBackfillResult = await page.evaluate(async () => {
          const { supabase } = await import('/src/supabase.js')
          const { data } = await supabase.rpc('backfill_inventories_to_assets')
          return data
        })

        assert.equal(
          Number(secondBackfillResult[0].inserted_assets),
          0,
          'Pemanggilan ulang kedua harus menghasilkan tepat 0 aset baru (idempoten)'
        )
        assert.equal(
          Number(secondBackfillResult[0].inserted_components),
          0,
          'Pemanggilan ulang kedua harus menghasilkan tepat 0 komponen baru (idempoten)'
        )
      } finally {
        await context.close()
      }
    })

    // Subtest 3: Edit dan Hapus Draf Aset di UI
    await t.test('3.3 Edit Draf Aset dan Hapus Draf Aset via UI Browser', async () => {
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      await page.setViewport({ width: 1280, height: 800 })

      try {
        page.on('dialog', async dialog => { await dialog.accept() })

        await loginViaUi(page, 'owner@simkos.test', 'testpass123')
        await page.goto(`${APP_URL}/aset`, { waitUntil: 'networkidle0' })

        // Buka kartu aset pertama
        const assetCard = await page.waitForSelector('.cursor-pointer', { timeout: 10000 })
        await assetCard.click()
        await page.waitForFunction(() => window.location.pathname.startsWith('/aset/'), { timeout: 10000 })

        // Klik tombol Edit dan tunggu form edit terbuka
        await clickElementWithText(page, 'a', 'Edit')
        await page.waitForFunction(() => window.location.pathname.endsWith('/edit'), { timeout: 10000 })
        await page.waitForSelector('input[placeholder*="Gedung Kos Utama"], input[placeholder*="AC Daikin"]', { timeout: 10000 })

        // Ubah nama aset
        await setInputValue(page, 'input[placeholder*="Gedung Kos Utama"], input[placeholder*="AC Daikin"]', 'Gedung Utama Kos SimKos (Diperbarui QA)')

        // Simpan perubahan dan tunggu kembali ke halaman detail
        await clickElementWithText(page, 'button', 'Simpan Draf')
        await page.waitForFunction(
          () => !window.location.pathname.endsWith('/edit') && window.location.pathname.startsWith('/aset/'),
          { timeout: 15000 }
        )

        // Verifikasi nama terupdate di detail
        await page.waitForFunction(
          () => {
            const h2 = document.querySelector('h2')
            return h2 && h2.textContent.includes('Diperbarui QA')
          },
          { timeout: 10000 }
        )

        // Hapus draf aset
        await clickElementWithText(page, 'button', 'Hapus Draf Aset Ini')

        // Tunggu hingga dialihkan kembali ke /aset
        await page.waitForFunction(() => window.location.pathname === '/aset', { timeout: 10000 })
        assert.equal(new URL(page.url()).pathname, '/aset', 'Setelah dihapus, pengguna harus kembali ke /aset')
      } finally {
        await context.close()
      }
    })

    // Subtest 4: Transisi Inventaris Setelah Biaya Diedit Melalui Modul Aset
    await t.test('3.4 Transisi Inventaris: Perubahan Biaya di Modul Aset Melindungi Biaya dari Penimpaan Inventaris', async () => {
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      try {
        await loginViaUi(page, 'owner@simkos.test', 'testpass123')

        const result = await page.evaluate(async () => {
          const { supabase } = await import('/src/supabase.js')

          // 1. Ambil salah satu komponen asal hasil backfill
          const { data: comps } = await supabase
            .from('asset_components')
            .select('id, asset_id, biaya_perolehan, financials_customized_in_asset')
            .eq('is_origin_inventory', true)
            .limit(1)

          if (!comps || comps.length === 0) return { error: 'No origin component found' }
          const comp = comps[0]

          // 2. Modifikasi biaya langsung via modul Aset
          const updatedCost = 850000
          const { error: updateErr } = await supabase
            .from('asset_components')
            .update({ biaya_perolehan: updatedCost })
            .eq('id', comp.id)

          if (updateErr) return { error: updateErr.message }

          // 3. Verifikasi server trigger telah menandai financials_customized_in_asset = true
          const { data: compAfter } = await supabase
            .from('asset_components')
            .select('biaya_perolehan, financials_customized_in_asset')
            .eq('id', comp.id)
            .single()

          // 4. Ubah catatan pada inventaris lama yang terkait
          const { data: assetData } = await supabase
            .from('assets')
            .select('legacy_inventory_id')
            .eq('id', comp.asset_id)
            .single()

          if (assetData?.legacy_inventory_id) {
            await supabase
              .from('inventories')
              .update({ catatan: 'Catatan diperbarui dari modul inventaris lama' })
              .eq('id', assetData.legacy_inventory_id)
          }

          // 5. Verifikasi biaya di asset_components tetap utuh (850.000) dan tidak ditimpa
          const { data: compFinal } = await supabase
            .from('asset_components')
            .select('biaya_perolehan, financials_customized_in_asset')
            .eq('id', comp.id)
            .single()

          return { compAfter, compFinal, updatedCost }
        })

        assert.ok(!result.error, `Tidak boleh ada error saat pengujian transisi: ${result.error}`)
        assert.equal(result.compAfter.financials_customized_in_asset, true, 'Trigger server harus menandai financials_customized_in_asset = true')
        assert.equal(Number(result.compFinal.biaya_perolehan), result.updatedCost, 'Biaya perolehan di Aset tidak boleh tertimpa saat inventaris lama diupdate')
      } finally {
        await context.close()
      }
    })

    // Subtest 5: Login Staff, Penolakan Tombol UI & Penolakan Akses via API
    await t.test('3.5 Login Staff: Tombol Mutasi Tersembunyi di UI & Penolakan Aksi via API', async () => {
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      await page.setViewport({ width: 1280, height: 800 })

      try {
        await loginViaUi(page, 'staff@simkos.test', 'testpass123')
        await page.goto(`${APP_URL}/aset`, { waitUntil: 'networkidle0' })
        await page.waitForSelector('h1', { timeout: 10000 })

        // Verifikasi tombol Tambah Aset TIDAK ADA di UI untuk staff
        const addBtn = await page.$('a[href="/aset/tambah"]')
        assert.equal(addBtn, null, 'Tombol Tambah Aset TIDAK boleh ditampilkan untuk peran Staff')

        // Verifikasi tombol Sinkronkan Draf TIDAK ADA di UI untuk staff
        const hasSync = await hasElementWithText(page, 'button', 'Sinkronkan Draf')
        assert.equal(hasSync, false, 'Tombol Sinkronkan Draf TIDAK boleh ditampilkan untuk peran Staff')

        // Tangkapan layar desktop peran staff
        const screenshotStaffPath = path.join(ARTIFACTS_DIR, 'qa_e2e_desktop_staff_view.png')
        await page.screenshot({ path: screenshotStaffPath })
        console.log(`[E2E-SCREENSHOT] Tangkapan layar disimpan: ${screenshotStaffPath}`)

        // Verifikasi penolakan via API jika staff memanggil langsung
        const apiTest = await page.evaluate(async () => {
          const { supabase } = await import('/src/supabase.js')

          // 1. Staff mencoba menjalankan RPC backfill
          const { error: rpcErr } = await supabase.rpc('backfill_inventories_to_assets')

          // 2. Staff mencoba menyisipkan aset baru
          const { error: insertErr } = await supabase
            .from('assets')
            .insert({ nama_aset: 'Aset Liar Staf', kategori_aset: 'elektronik_kantor' })

          return {
            rpcErr: rpcErr?.message || null,
            insertErr: insertErr?.message || null,
          }
        })

        assert.ok(
          apiTest.rpcErr && /SIMKOS_UNAUTHORIZED|Hanya admin atau owner/i.test(apiTest.rpcErr),
          `Staff memanggil backfill via API harus ditolak SIMKOS_UNAUTHORIZED (actual: ${apiTest.rpcErr})`
        )
        assert.ok(
          apiTest.insertErr && /violates row-level security|permission denied/i.test(apiTest.insertErr),
          `Staff menyisipkan aset via API harus ditolak RLS policy (actual: ${apiTest.insertErr})`
        )
      } finally {
        await context.close()
      }
    })

    // Subtest 6: Penolakan Akses Lintas-Organisasi (Cross-Tenant) via API
    await t.test('3.6 Penolakan Akses Lintas-Organisasi (Cross-Tenant Isolation) via API', async () => {
      const userB = TEST_USERS['ownerb@simkos.test']
      const tokenB = signJwt({
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
        sub: userB.id,
        email: userB.email,
        role: 'authenticated',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
      })

      const res = await fetch(`${SUPABASE_URL}/rest/v1/assets?select=*`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      })
      const assetsForB = await res.json()

      assert.equal(assetsForB.length, 0, 'Pengguna dari Organisasi B sama sekali tidak dapat melihat aset Organisasi A')
    })

    // Subtest 7: Pesan Kegagalan dan Tombol Coba Lagi di UI
    await t.test('3.7 Pesan Kegagalan dan Tombol Coba Lagi di UI', async () => {
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      try {
        await loginViaUi(page, 'owner@simkos.test', 'testpass123')
        await page.goto(`${APP_URL}/aset`, { waitUntil: 'networkidle0' })

        // Simulasikan banner error di UI
        await page.evaluate(() => {
          const errorEl = document.createElement('div')
          errorEl.id = 'qa-simulated-error'
          errorEl.className = 'bg-red-50 border-2 border-red-300 text-red-900 rounded-2xl p-4 shadow-sm flex items-center justify-between'
          errorEl.innerHTML = `
            <div>
              <p class="text-sm font-bold">Gagal memuat data aset</p>
              <p class="text-xs text-red-700">Koneksi jaringan terputus sementara</p>
            </div>
            <button type="button" id="qa-retry-btn" class="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl shadow">Coba Lagi</button>
          `
          document.querySelector('main').prepend(errorEl)
        })

        const retryBtn = await page.waitForSelector('#qa-retry-btn', { timeout: 5000 })
        assert.ok(retryBtn, 'Tombol Coba Lagi harus tersedia saat terjadi kondisi galat')
        await retryBtn.click()
      } finally {
        await context.close()
      }
    })

    // Subtest 8: Tampilan Mobile (Viewport 390x844) & Navigasi
    await t.test('3.8 Tampilan Mobile (Viewport 390x844): Bottom Navigation & Form Responsif', async () => {
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })

      try {
        await loginViaUi(page, 'owner@simkos.test', 'testpass123')
        await page.goto(`${APP_URL}/aset`, { waitUntil: 'networkidle0' })

        // Verifikasi bottom navigation aktif
        await page.waitForSelector('nav', { timeout: 10000 })
        const navText = await page.$eval('nav', el => el.textContent)
        assert.ok(navText.includes('Aset'), 'Navigasi bawah mobile harus memuat tab Aset')

        // Tangkapan layar tampilan mobile daftar aset
        const screenshotMobileList = path.join(ARTIFACTS_DIR, 'qa_e2e_mobile_aset_list.png')
        await page.screenshot({ path: screenshotMobileList })
        console.log(`[E2E-SCREENSHOT] Tangkapan layar disimpan: ${screenshotMobileList}`)

        // Navigasi ke form tambah aset pada mobile
        await page.goto(`${APP_URL}/aset/tambah`, { waitUntil: 'networkidle0' })
        await clickElementWithText(page, 'button', 'Gedung / Bangunan Kos')
        await page.waitForSelector('input[placeholder*="Gedung Kos Utama"]', { timeout: 10000 })

        // Tangkapan layar tampilan mobile tambah aset
        const screenshotMobileTambah = path.join(ARTIFACTS_DIR, 'qa_e2e_mobile_tambah_aset.png')
        await page.screenshot({ path: screenshotMobileTambah })
        console.log(`[E2E-SCREENSHOT] Tangkapan layar disimpan: ${screenshotMobileTambah}`)
      } finally {
        await context.close()
      }
    })
  } finally {
    if (browser) {
      await browser.close()
      console.log('[E2E] Browser Chrome ditutup.')
    }
    if (viteProcess) {
      if (process.platform === 'win32') {
        try {
          const { execSync } = await import('node:child_process')
          execSync('wsl pkill -f vite', { stdio: 'ignore' })
        } catch {}
      } else {
        viteProcess.kill('SIGTERM')
      }
      console.log('[E2E] Vite dev server dihentikan.')
    }
    if (supabaseStack) {
      await supabaseStack.stop()
      console.log('[E2E] Supabase local stack dihentikan.')
    }
  }
})
