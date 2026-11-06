import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceOneMonth, localDateStamp } from '../../src/lib/date.js'

test('advanceOneMonth: memajukan tanggal reguler 1 bulan', () => {
  assert.equal(advanceOneMonth('2026-05-15'), '2026-06-15')
  assert.equal(advanceOneMonth('2026-01-10'), '2026-02-10')
})

test('advanceOneMonth: pergantian tahun dari Desember ke Januari', () => {
  assert.equal(advanceOneMonth('2026-12-05'), '2027-01-05')
  assert.equal(advanceOneMonth('2026-12-31'), '2027-01-31')
})

test('advanceOneMonth: penanganan akhir bulan (rollover limit)', () => {
  // 31 Januari -> 28 Februari (bukan tahun kabisat 2026)
  assert.equal(advanceOneMonth('2026-01-31'), '2026-02-28')
  // 31 Maret -> 30 April
  assert.equal(advanceOneMonth('2026-03-31'), '2026-04-30')
  // 31 Mei -> 30 Juni
  assert.equal(advanceOneMonth('2026-05-31'), '2026-06-30')
  // Tahun kabisat 2028: 31 Jan 2028 -> 29 Feb 2028
  assert.equal(advanceOneMonth('2028-01-31'), '2028-02-29')
})

test('advanceOneMonth: penanganan input tidak valid', () => {
  assert.equal(advanceOneMonth(''), null)
  assert.equal(advanceOneMonth(null), null)
  assert.equal(advanceOneMonth('invalid-date'), 'invalid-date')
})
