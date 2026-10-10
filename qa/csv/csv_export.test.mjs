// Tes utilitas ekspor CSV. Jalankan: node --test qa/csv/
// Paksa zona waktu WIB sebelum Date dipakai, supaya tes 06.00 WIB selalu
// benar-benar memeriksa (tidak tergantung TZ mesin/CI).
process.env.TZ = 'Asia/Jakarta'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCsv, neutralizeFormula, numberCell, textCell, localDateStamp } from '../../src/lib/csv.js'

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
    '"Keterangan","Masuk","Keluar"',
    '"\'=HYPERLINK(""x"")",100000,',
    '"Internet",,350000',
  ].join('\r\n'))
  assert.ok(!csv.startsWith('sep='))
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
