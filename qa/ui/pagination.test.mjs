import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve()

test('BasePagination.vue: komponen pagination mandiri tersedia dan mengekspor navigasi serta kalkulasi halaman', () => {
  const filePath = path.join(ROOT, 'src/components/BasePagination.vue')
  assert.ok(fs.existsSync(filePath), 'src/components/BasePagination.vue harus ada')

  const code = fs.readFileSync(filePath, 'utf8')
  assert.match(code, /modelValue/, 'Mendukung v-model halaman aktif')
  assert.match(code, /totalItems/, 'Mendukung prop totalItems')
  assert.match(code, /pageSize/, 'Mendukung prop pageSize')
  assert.match(code, /totalPages/, 'Menghitung totalPages secara reaktif')
  assert.match(code, /goToPage/, 'Memiliki fungsi navigasi halaman')
  assert.match(code, /Sebelumnya/, 'Memiliki label tombol Sebelumnya')
  assert.match(code, /Berikutnya/, 'Memiliki label tombol Berikutnya')
})

test('Semua 5 menu utama yang menampilkan list data mengintegrasikan BasePagination', () => {
  const views = [
    { file: 'src/views/RiwayatTransaksiView.vue', label: 'transaksi' },
    { file: 'src/views/InventarisView.vue', label: 'barang' },
    { file: 'src/views/AsetView.vue', label: 'aset' },
    { file: 'src/views/DaftarPenghuniView.vue', label: 'kamar' },
    { file: 'src/views/KeuanganView.vue', label: 'KeuanganView list' },
    { file: 'src/views/BerandaView.vue', label: 'peringatan' }
  ]

  for (const v of views) {
    const fullPath = path.join(ROOT, v.file)
    assert.ok(fs.existsSync(fullPath), `${v.file} harus ada`)
    const content = fs.readFileSync(fullPath, 'utf8')

    assert.match(content, /import BasePagination from/, `${v.file} harus mengimpor BasePagination`)
    assert.match(content, /<BasePagination/, `${v.file} harus merender komponen <BasePagination`)
  }
})
