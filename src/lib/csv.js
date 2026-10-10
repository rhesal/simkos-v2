// Utilitas ekspor CSV Buku Besar.
// - Kolom angka (Masuk/Keluar) ditulis sebagai digit polos tanpa tanda kutip
//   dan tanpa pemisah ribuan, supaya bisa langsung dijumlah di spreadsheet.
// - Sel teks yang diawali = + - @ TAB atau CR diberi awalan ' supaya tidak
//   dieksekusi sebagai rumus (CSV/formula injection).
// - Pemisah tetap koma; BOM UTF-8 ditambahkan saat membuat Blob (bukan di sini).

const FORMULA_PREFIX = /^[=+\-@\t\r]/

// Netralkan teks yang bisa dibaca sebagai rumus oleh Excel/Sheets.
export function neutralizeFormula(value) {
  const s = value == null ? '' : String(value)
  return FORMULA_PREFIX.test(s) ? `'${s}` : s
}

// Sel teks: dinetralkan lalu selalu dikutip (aman untuk koma, kutip, baris baru).
export function textCell(value) {
  return `"${neutralizeFormula(value).replace(/"/g, '""')}"`
}

// Sel angka: digit polos tanpa kutip. Kosong bila tidak berlaku / bukan angka.
export function numberCell(value) {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  // Rupiah tanpa desimal; hindari notasi eksponen untuk angka besar.
  return Math.round(n).toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 })
}

// columns: [{ header, type: 'text' | 'number' }]; rows: array of array nilai.
export function buildCsv(columns, rows) {
  const head = columns.map(c => textCell(c.header)).join(',')
  const body = rows.map(row =>
    row.map((val, i) => (columns[i].type === 'number' ? numberCell(val) : textCell(val))).join(',')
  )
  return [head, ...body].join('\r\n')
}

// localDateStamp dipindah ke ./date.js (dipakai juga oleh form); diekspor ulang
// di sini supaya impor lama tetap jalan.
export { localDateStamp } from './date.js'
