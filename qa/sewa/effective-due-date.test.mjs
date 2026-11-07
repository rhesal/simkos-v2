import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateEffectiveDueDate } from '../../src/lib/sewa.js'

test('calculateEffectiveDueDate: rental tanpa pembayaran tetap memakai tanggal_jatuh_tempo awal', () => {
  const rental = {
    tanggal_jatuh_tempo: '2026-11-05',
    incomes: []
  }
  assert.equal(calculateEffectiveDueDate(rental), '2026-11-05')
})

test('calculateEffectiveDueDate: rental yang sudah bayar di tanggal jatuh tempo dimajukan +1 bulan', () => {
  // Kasus user: Jatuh tempo 2026-11-05, sudah bayar 2026-11-05
  const rental = {
    tanggal_jatuh_tempo: '2026-11-05',
    incomes: [
      { tanggal_bayar: '2026-11-05', nominal: 750000, keterangan: 'Sewa Kamar (Transfer)' }
    ]
  }
  // Jatuh tempo efektif berikutnya harus 2026-12-05
  assert.equal(calculateEffectiveDueDate(rental), '2026-12-05')
})

test('calculateEffectiveDueDate: rental yang bayar di bulan yang sama dimajukan +1 bulan', () => {
  const rental = {
    tanggal_jatuh_tempo: '2026-11-05',
    incomes: [
      { tanggal_bayar: '2026-11-03', nominal: 750000, keterangan: 'Sewa Kamar (Tunai)' }
    ]
  }
  assert.equal(calculateEffectiveDueDate(rental), '2026-12-05')
})

test('calculateEffectiveDueDate: pembayaran bulan sebelumnya (belum bayar bulan ini) tidak memajukan jatuh tempo bulan ini', () => {
  const rental = {
    tanggal_jatuh_tempo: '2026-11-05',
    incomes: [
      { tanggal_bayar: '2026-10-05', nominal: 750000, keterangan: 'Sewa Kamar Oktober' }
    ]
  }
  // Karena belum ada pembayaran untuk November, jatuh tempo efektif tetap 2026-11-05 (akan muncul di radar)
  assert.equal(calculateEffectiveDueDate(rental), '2026-11-05')
})

test('calculateEffectiveDueDate: pembayaran advance (bayar 2 bulan sekaligus)', () => {
  const rental = {
    tanggal_jatuh_tempo: '2026-11-05',
    incomes: [
      { tanggal_bayar: '2026-11-05', nominal: 750000 },
      { tanggal_bayar: '2026-12-01', nominal: 750000 }
    ]
  }
  assert.equal(calculateEffectiveDueDate(rental), '2027-01-05')
})
