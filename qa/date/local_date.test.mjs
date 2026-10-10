// Tes tanggal default form. Jalankan: node --test qa/date/
// Paksa zona waktu WIB sebelum Date dipakai, supaya tes 06.00 WIB selalu
// benar-benar memeriksa (tidak tergantung TZ mesin/CI).
process.env.TZ = 'Asia/Jakarta'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localDateStamp } from '../../src/lib/date.js'
import { localDateStamp as fromCsv } from '../../src/lib/csv.js'

test('TZ benar-benar Asia/Jakarta (UTC+7)', () => {
  assert.equal(new Date('2026-10-09T23:00:00Z').getTimezoneOffset(), -420)
})

test('06.00 WIB: tanggal default = hari ini, bukan kemarin (UTC)', () => {
  const d = new Date('2026-10-09T23:00:00Z') // = 10 Okt 06.00 WIB
  assert.equal(d.toISOString().slice(0, 10), '2026-10-09') // cara lama: salah
  assert.equal(localDateStamp(d), '2026-10-10')
})

test('batas hari: 00.00 dan 23.59 WIB, pergantian tahun', () => {
  assert.equal(localDateStamp(new Date('2026-10-09T17:00:00Z')), '2026-10-10') // 00.00 WIB
  assert.equal(localDateStamp(new Date('2026-10-10T16:59:00Z')), '2026-10-10') // 23.59 WIB
  assert.equal(localDateStamp(new Date('2026-12-31T18:30:00Z')), '2027-01-01') // 01.30 WIB 1 Jan
})

test('csv.js mengekspor ulang helper yang sama', () => {
  assert.equal(fromCsv, localDateStamp)
})

test('tidak ada lagi default tanggal berbasis toISOString() di src', () => {
  const files = [
    'src/views/TambahPemasukanView.vue',
    'src/views/TambahPengeluaranView.vue',
    'src/views/TambahPenghuniView.vue',
    'src/views/InventarisView.vue',
  ]
  for (const f of files) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
    assert.ok(!/toISOString\(\)/.test(src), `${f} masih memakai toISOString()`)
    assert.ok(/localDateStamp\(\)/.test(src), `${f} belum memakai localDateStamp()`)
  }
})
