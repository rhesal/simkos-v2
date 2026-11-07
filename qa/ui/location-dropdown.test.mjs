import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

test('CustomLocationDropdown.vue menyediakan custom dropdown pengganti select native', () => {
  const componentPath = path.join(root, 'src/components/CustomLocationDropdown.vue')
  assert.ok(fs.existsSync(componentPath), 'CustomLocationDropdown.vue harus ada')
  const content = fs.readFileSync(componentPath, 'utf8')

  // Harus memiliki tombol trigger dengan rotasi chevron
  assert.match(content, /rotate-180/, 'Harus ada animasi rotasi chevron')
  // Harus memiliki backdrop click-outside
  assert.match(content, /fixed inset-0 z-40/, 'Harus ada backdrop klik di luar')
  // Harus mendukung Semua Lokasi
  assert.match(content, /Semua Lokasi/, 'Harus ada opsi Semua Lokasi')
  // Harus mendukung list lokasi dengan ikon 🏠 dan centang aktif
  assert.match(content, /🏠/, 'Harus ada emoji rumah untuk lokasi kos')
  assert.match(content, /modelValue/, 'Harus menerima modelValue v-model')
})

test('Menu Keuangan, Riwayat, Inventaris, dan Penghuni memakai CustomLocationDropdown', () => {
  const views = [
    { name: 'KeuanganView.vue', path: 'src/views/KeuanganView.vue' },
    { name: 'RiwayatTransaksiView.vue', path: 'src/views/RiwayatTransaksiView.vue' },
    { name: 'InventarisView.vue', path: 'src/views/InventarisView.vue' },
    { name: 'DaftarPenghuniView.vue', path: 'src/views/DaftarPenghuniView.vue' },
  ]

  for (const view of views) {
    const fullPath = path.join(root, view.path)
    const content = fs.readFileSync(fullPath, 'utf8')
    assert.match(
      content,
      /import CustomLocationDropdown from '\.\.\/components\/CustomLocationDropdown\.vue'/,
      `${view.name} harus mengimpor CustomLocationDropdown`
    )
    assert.match(
      content,
      /<CustomLocationDropdown/,
      `${view.name} harus merender <CustomLocationDropdown`
    )
    assert.doesNotMatch(
      content,
      /<select[^>]+(id="location-filter"|id="filter-lokasi")/,
      `${view.name} tidak boleh lagi memakai native select filter lokasi yang memicu radio button di mobile`
    )
  }
})
