import puppeteer from 'puppeteer-core'
import path from 'node:path'

const CHROME_PATH = process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'

const APP_URL = 'http://127.0.0.1:5175'

async function takeScreenshots() {
  const browser = await puppeteer.launch({
    executablePath: process.platform === 'win32'
      ? CHROME_PATH
      : '/home/disnak/.local/bin/chrome.exe',
    userDataDir: 'C:\\Users\\Disnak\\AppData\\Local\\Temp\\chrome-puppeteer-uat',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=9223',
    ]
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })

  // 1. Login sebagai Owner
  console.log('[SCREENSHOT] Membuka halaman login...')
  await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('#email', { timeout: 10000 })
  await page.type('#email', 'owner@simkos.test')
  await page.type('#password', 'testpass123')
  const buttons = await page.$$('button')
  for (const b of buttons) {
    const text = await page.evaluate(el => el.textContent, b)
    if (text.includes('Masuk')) {
      await b.click()
      break
    }
  }
  await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15000 })

  // 2. Screenshot Halaman Aset (Daftar Aset Contoh)
  console.log('[SCREENSHOT] Menuju /aset...')
  await page.goto(`${APP_URL}/aset`, { waitUntil: 'networkidle0' })
  await page.screenshot({ path: 'docs/screenshots/uat_01_daftar_aset.png' })

  // 3. Screenshot Halaman Tambah Aset
  console.log('[SCREENSHOT] Menuju /aset/tambah...')
  await page.goto(`${APP_URL}/aset/tambah`, { waitUntil: 'networkidle0' })
  await page.screenshot({ path: 'docs/screenshots/uat_02_tambah_aset.png' })

  // 4. Screenshot Detail Aset (Simulasi Saldo Awal / Komponen)
  console.log('[SCREENSHOT] Menuju detail aset...')
  await page.goto(`${APP_URL}/aset`, { waitUntil: 'networkidle0' })
  const assetLinks = await page.$$('a[href*="/aset/"]')
  if (assetLinks.length > 0) {
    await assetLinks[0].click()
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {})
    await page.screenshot({ path: 'docs/screenshots/uat_03_detail_aset_saldo_awal.png' })
  }

  // 5. Screenshot Halaman Buku Pembantu Penyusutan (Posting Bulanan)
  console.log('[SCREENSHOT] Menuju /buku-pembantu-penyusutan...')
  await page.goto(`${APP_URL}/buku-pembantu-penyusutan`, { waitUntil: 'networkidle0' })
  await page.screenshot({ path: 'docs/screenshots/uat_04_buku_pembantu_posting.png' })

  // 6. Screenshot Halaman Keuangan (Laporan Hasil Usaha Internal)
  console.log('[SCREENSHOT] Menuju /keuangan...')
  await page.goto(`${APP_URL}/keuangan?period=2026-06`, { waitUntil: 'networkidle0' })
  // Klik tab Hasil Usaha Internal jika ada
  const tabButtons = await page.$$('button')
  for (const b of tabButtons) {
    const text = await page.evaluate(el => el.textContent, b)
    if (text.includes('Hasil Usaha Internal')) {
      await b.click()
      await new Promise(r => setTimeout(r, 600))
      break
    }
  }
  await page.screenshot({ path: 'docs/screenshots/uat_05_laporan_hasil_usaha.png' })

  await browser.close()
  console.log('[SCREENSHOT] Seluruh screenshot alur UAT berhasil diambil!')
}

takeScreenshots().catch(err => {
  console.error('[SCREENSHOT] Error:', err)
  process.exit(1)
})
