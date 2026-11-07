import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

test('KeuanganView.vue: Card Total Pemasukan dan Pengeluaran dapat diklik untuk menampilkan daftar', () => {
  const filePath = path.join(root, 'src/views/KeuanganView.vue')
  const content = fs.readFileSync(filePath, 'utf8')

  // Harus memiliki fungsi toggleFinanceList
  assert.match(content, /toggleFinanceList\(['"]masuk['"]\)/, 'Card pemasukan harus memanggil toggleFinanceList masuk')
  assert.match(content, /toggleFinanceList\(['"]keluar['"]\)/, 'Card pengeluaran harus memanggil toggleFinanceList keluar')
  assert.match(content, /activeFinanceList/, 'Harus ada state activeFinanceList')

  // Harus merender rincian daftar pemasukan dan pengeluaran
  assert.match(content, /Daftar Pemasukan Bulan Ini/, 'Harus ada judul Daftar Pemasukan Bulan Ini')
  assert.match(content, /Daftar Pengeluaran Bulan Ini/, 'Harus ada judul Daftar Pengeluaran Bulan Ini')
})

test('RiwayatTransaksiView.vue: Card Total Masuk dan Total Keluar dapat diklik untuk memfilter daftar transaksi', () => {
  const filePath = path.join(root, 'src/views/RiwayatTransaksiView.vue')
  const content = fs.readFileSync(filePath, 'utf8')

  // Harus memiliki fungsi toggleTypeFilter
  assert.match(content, /toggleTypeFilter\(['"]masuk['"]\)/, 'Card total masuk harus memanggil toggleTypeFilter masuk')
  assert.match(content, /toggleTypeFilter\(['"]keluar['"]\)/, 'Card total keluar harus memanggil toggleTypeFilter keluar')
  assert.match(content, /filterTipe/, 'Harus ada state filterTipe')

  // filteredTransactions harus menyaring berdasarkan filterTipe
  assert.match(content, /tx\.tipe === filterTipe\.value/, 'filteredTransactions harus menyaring tipe transaksi')
})
