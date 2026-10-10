// Tes utilitas ekspor CSV. Jalankan: node --test qa/csv/
// Paksa zona waktu WIB sebelum Date dipakai, supaya tes 06.00 WIB selalu
// benar-benar memeriksa (tidak tergantung TZ mesin/CI).
process.env.TZ = 'Asia/Jakarta'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCsv, neutralizeFormula, numberCell, textCell, localDateStamp,
  CSV_DELIMITER, CSV_BOM_BYTES, csvFileParts,
} from '../../src/lib/csv.js'

// Parser CSV minimal (RFC 4180, pemisah bisa diatur) untuk uji round-trip.
function parseCsv(text, delim) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === delim) { row.push(field); field = '' }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++ }
    else field += ch
  }
  row.push(field); rows.push(row)
  return rows
}

test('teks berawalan karakter rumus diberi awalan kutip', () => {
  for (const s of ['=SUM(A1)', '+62812', '-5', '@cmd', '\tx', '\rx']) {
    assert.equal(neutralizeFormula(s), `'${s}`)
  }
  assert.equal(neutralizeFormula('Bayar listrik'), 'Bayar listrik')
  assert.equal(neutralizeFormula(null), '')
  assert.equal(textCell('a "b", c'), '"a ""b"", c"')
})

test('angka ditulis polos tanpa kutip dan tanpa pemisah ribuan', () => {
  assert.equal(numberCell(1500000), '1500000')
  assert.equal(numberCell('250000'), '250000')
  assert.equal(numberCell(-1000), '-1000') // angka negatif tidak dinetralkan
  assert.equal(numberCell(12345678901234), '12345678901234')
  assert.equal(numberCell(null), '')
  assert.equal(numberCell(''), '')
  assert.equal(numberCell('abc'), '')
})

test('buildCsv: kolom Masuk/Keluar numerik, teks dikutip & dinetralkan', () => {
  const cols = [
    { header: 'Keterangan', type: 'text' },
    { header: 'Masuk', type: 'number' },
    { header: 'Keluar', type: 'number' },
  ]
  const csv = buildCsv(cols, [
    ['=HYPERLINK("x")', 100000, null],
    ['Internet', null, 350000],
  ])
  assert.equal(csv, [
    '"Keterangan";"Masuk";"Keluar"',
    '"\'=HYPERLINK(""x"")";100000;',
    '"Internet";;350000',
  ].join('\r\n'))
  assert.ok(!csv.startsWith('sep='))
})

test('pemisah titik koma: header, angka polos, teks berisi ; tetap satu sel', () => {
  assert.equal(CSV_DELIMITER, ';')
  const cols = [
    { header: 'Tanggal', type: 'text' },
    { header: 'Keterangan', type: 'text' },
    { header: 'Masuk', type: 'number' },
    { header: 'Keluar', type: 'number' },
  ]
  const csv = buildCsv(cols, [
    ['10 Okt 2026', 'Listrik; Air', null, 350000],
    ['10 Okt 2026', 'Sewa André, "kamar 3"', 1500000, null],
    ['10 Okt 2026', '=1+1', 5000, null],
  ])
  const lines = csv.split('\r\n')
  assert.equal(lines[0], '"Tanggal";"Keterangan";"Masuk";"Keluar"')
  assert.ok(!lines[0].includes(','), 'header tidak memakai koma')
  assert.equal(lines[1], '"10 Okt 2026";"Listrik; Air";;350000')
  // Kolom angka tidak dikutip
  assert.match(lines[2], /;1500000;$/)
  assert.ok(!/"\d+"/.test(csv), 'tidak ada angka yang dikutip')

  const parsed = parseCsv(csv, ';')
  assert.equal(parsed.length, 4)
  for (const r of parsed) assert.equal(r.length, 4, 'setiap baris tepat 4 kolom')
  assert.equal(parsed[1][1], 'Listrik; Air')
  assert.equal(parsed[2][1], 'Sewa André, "kamar 3"')
  assert.equal(parsed[3][1], "'=1+1")
  assert.equal(parsed[2][2], '1500000')
})

test('file CSV: BOM UTF-8 di depan, tanpa baris sep=', async () => {
  assert.deepEqual([...CSV_BOM_BYTES], [0xEF, 0xBB, 0xBF])
  const csv = buildCsv([{ header: 'Nama', type: 'text' }], [['André']])
  const bytes = new Uint8Array(await new Blob(csvFileParts(csv)).arrayBuffer())
  assert.deepEqual([...bytes.slice(0, 3)], [0xEF, 0xBB, 0xBF])
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
  assert.equal(text.charCodeAt(0), 0xFEFF)
  assert.ok(!/^\uFEFF?sep=/i.test(text))
  assert.ok(!text.toLowerCase().includes('sep='))
  assert.ok(text.endsWith('"André"'))
})

test('localDateStamp memakai tanggal lokal, bukan UTC', () => {
  // 10 Okt 2026 05:30 lokal → harus 2026-10-10 apa pun zona waktunya
  assert.equal(localDateStamp(new Date(2026, 9, 10, 5, 30)), '2026-10-10')
  assert.equal(localDateStamp(new Date(2026, 0, 1, 0, 1)), '2026-01-01')
})

test('localDateStamp di Asia/Jakarta jam 06.00 WIB tidak mundur sehari', () => {
  // TZ dipaksa Asia/Jakarta di baris paling atas file ini.
  assert.equal(new Date('2026-10-09T23:00:00Z').getTimezoneOffset(), -420)
  const d = new Date('2026-10-09T23:00:00Z') // = 10 Okt 06.00 WIB
  assert.equal(d.toISOString().slice(0, 10), '2026-10-09')
  assert.equal(localDateStamp(d), '2026-10-10')
})
