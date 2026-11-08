import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { spawn, execSync } from 'node:child_process'
import puppeteer from 'puppeteer-core'
import { startSupabaseStack } from '../../scripts/start_qa_supabase.mjs'

const ROOT = path.resolve()
const CHROME_PATH = process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'

const VITE_PORT = 5175
const APP_URL = `http://127.0.0.1:${VITE_PORT}`

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

test('Alur Browser End-to-End dengan GoTrue Resmi (Router & Guard Asli)', { timeout: 90000 }, async (t) => {
  let supabaseStack = null
  let viteProcess = null
  let browser = null

  try {
    // 1. Jalankan Stack Supabase Resmi (PostgreSQL 16 + GoTrue v2.197.0 + PostgREST 16.5)
    console.log('[E2E-GOTRUE] Menyiapkan Supabase stack resmi...')
    supabaseStack = await startSupabaseStack()

    // 2. Jalankan Vite dev server pada port 5175
    console.log(`[E2E-GOTRUE] Memulai Vite dev server pada port ${VITE_PORT}...`)
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

    console.log(`[E2E-GOTRUE] Vite siap di ${APP_URL}! Meluncurkan Google Chrome...`)

    // 3. Luncurkan browser Chrome asli dalam mode headless
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

    // --- LANGKAH 1: Login Owner melalui Form Resmi ---
    await t.test('1. Login Owner Menggunakan GoTrue Resmi', async () => {
      await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0' })
      await setInputValue(page, '#email', 'owner@simkos.test')
      await setInputValue(page, '#password', 'testpass123')
      await clickElementWithText(page, 'button', 'Masuk')

      // Tunggu navigasi keluar dari /login ke Beranda
      await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })
      assert.ok(!page.url().includes('/login'), 'Harus berhasil login dan dialihkan dari /login')
      console.log('[E2E-GOTRUE] Login owner berhasil via GoTrue resmi.')
    })

    // --- LANGKAH 2: Buka Modul Aset ---
    await t.test('2. Buka Modul Aset Melalui Navigasi', async () => {
      await page.goto(`${APP_URL}/aset`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('h1', { timeout: 10000 })
      const heading = await page.$eval('h1', el => el.textContent)
      assert.ok(heading.includes('Aset'), 'Halaman aset harus menampilkan judul Aset & Inventaris')
      assert.ok(page.url().endsWith('/aset'), 'URL harus berada di /aset')
      console.log('[E2E-GOTRUE] Modul aset berhasil dibuka.')
    })

    // --- LANGKAH 3: Reload Halaman dan Pastikan Sesi Tetap Aktif ---
    await t.test('3. Reload Halaman dan Pastikan Sesi Tetap Aktif', async () => {
      await page.reload({ waitUntil: 'networkidle0' })
      await page.waitForSelector('h1', { timeout: 10000 })
      assert.ok(page.url().endsWith('/aset'), 'Sesi harus tetap aktif setelah reload tanpa diarahkan ke /login')
      const heading = await page.$eval('h1', el => el.textContent)
      assert.ok(heading.includes('Aset'), 'Konten modul aset harus tetap muncul setelah reload')
      console.log('[E2E-GOTRUE] Sesi berhasil dipulihkan otomatis setelah reload.')
    })

    // --- LANGKAH 4: Simpan dan Edit Draf Aset ---
    await t.test('4. Simpan dan Edit Draf Aset dengan Token Nyata', async () => {
      // 4.1 Buka form tambah aset
      await page.goto(`${APP_URL}/aset/tambah`, { waitUntil: 'networkidle0' })
      await clickElementWithText(page, 'button', 'Gedung / Bangunan Kos')
      await page.waitForSelector('input[placeholder*="Gedung Kos Utama"]', { timeout: 10000 })

      // Isi form draf
      await setInputValue(page, 'input[placeholder*="Gedung Kos Utama"]', 'Gedung GoTrue Resmi E2E')
      await setInputValue(page, 'input[placeholder*="Dapat berbeda dari akun pengguna"]', 'Budi Owner')

      // Simpan draf
      await clickElementWithText(page, 'button', 'Simpan Draf')
      await page.waitForFunction(() => window.location.pathname.match(/\/aset\/[0-9a-f-]+/), { timeout: 15000 })
      assert.ok(page.url().includes('/aset/'), 'Harus dialihkan ke halaman detail aset')

      // Verifikasi di halaman detail
      await page.waitForFunction(
        () => {
          const h = document.querySelector('h1, h2')
          return h && h.textContent.includes('Gedung GoTrue Resmi E2E')
        },
        { timeout: 10000 }
      )

      // 4.2 Edit draf aset
      await clickElementWithText(page, 'a', 'Edit')
      await page.waitForFunction(() => window.location.pathname.endsWith('/edit'), { timeout: 10000 })
      await page.waitForSelector('input[placeholder*="Gedung Kos Utama"]', { timeout: 10000 })
      await setInputValue(page, 'input[placeholder*="Gedung Kos Utama"]', 'Gedung GoTrue Resmi E2E (Diperbarui)')
      await clickElementWithText(page, 'button', 'Simpan Draf')

      await page.waitForFunction(
        () => !window.location.pathname.endsWith('/edit') && window.location.pathname.match(/\/aset\/[0-9a-f-]+/),
        { timeout: 15000 }
      )
      await page.waitForFunction(
        () => {
          const h = document.querySelector('h1, h2')
          return h && h.textContent.includes('Diperbarui')
        },
        { timeout: 10000 }
      )
      console.log('[E2E-GOTRUE] Simpan dan edit draf berhasil.')
    })

    // --- LANGKAH 5: Logout melalui Menu Pengaturan ---
    await t.test('5. Logout dari Aplikasi', async () => {
      await page.goto(`${APP_URL}/`, { waitUntil: 'networkidle0' })
      await page.waitForSelector('button[aria-label="Pengaturan"]', { timeout: 10000 })
      await page.click('button[aria-label="Pengaturan"]')
      await clickElementWithText(page, 'button', 'Keluar')

      await page.waitForFunction(() => window.location.pathname.includes('/login'), { timeout: 15000 })
      assert.ok(page.url().includes('/login'), 'Logout harus mengarahkan pengguna kembali ke halaman /login')
      console.log('[E2E-GOTRUE] Logout berhasil via GoTrue.')
    })

    // --- LANGKAH 6: Buka Kembali Rute Terlindungi & Pastikan Diarahkan ke Login ---
    await t.test('6. Akses Rute Terlindungi Setelah Logout Diarahkan ke Login', async () => {
      await page.goto(`${APP_URL}/aset`, { waitUntil: 'networkidle0' })
      await page.waitForFunction(() => window.location.pathname.includes('/login'), { timeout: 10000 })
      assert.ok(page.url().includes('/login'), 'Akses langsung rute /aset setelah logout harus dicegat guard ke /login')
      console.log('[E2E-GOTRUE] Guard router asli berhasil mencegat akses tanpa sesi.')
    })

    await context.close()
  } finally {
    if (browser) {
      try { await browser.close() } catch {}
      console.log('[E2E-GOTRUE] Browser ditutup.')
    }
    if (viteProcess && !viteProcess.killed) {
      try {
        viteProcess.kill('SIGKILL')
      } catch {}
      console.log('[E2E-GOTRUE] Vite dev server dihentikan.')
    }
    if (supabaseStack) {
      try { await supabaseStack.stop() } catch {}
      console.log('[E2E-GOTRUE] Supabase stack dihentikan.')
    }
  }
})
