// Tes aturan sewa (kamar kosong, kamar tujuan pindah, pesan error RPC).
// Jalankan: node --test qa/sewa/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isRoomEmpty, pindahTargetRooms, roomOptionLabel, rpcErrorMessage } from '../../src/lib/sewa.js'

const room = (id, lokasi, nomor, status = 'Kosong', extra = {}) =>
  ({ id, nomor_kamar: nomor, status_kamar: status, harga_bulanan: 1000000, locations: { nama_lokasi: lokasi }, ...extra })

test('isRoomEmpty: hanya status Kosong tanpa sewa aktif', () => {
  assert.equal(isRoomEmpty(room('a', 'K', '1')), true)
  assert.equal(isRoomEmpty(room('a', 'K', '1', ' kosong ')), true)
  assert.equal(isRoomEmpty(room('a', 'K', '1', 'Terisi')), false)
  assert.equal(isRoomEmpty(room('a', 'K', '1', null)), false)
  assert.equal(isRoomEmpty(room('a', 'K', '1', 'Kosong', { rentals: [{ status_aktif: true }] })), false)
  assert.equal(isRoomEmpty(room('a', 'K', '1', 'Kosong', { rentals: [{ status_aktif: false }] })), true)
  assert.equal(isRoomEmpty(room('a', 'K', '1', 'Kosong', { activeRental: { id: 'r' } })), false)
  assert.equal(isRoomEmpty(null), false)
})

test('isRoomEmpty memakai status_kamar (bukan kolom `status` yang tidak ada di live)', () => {
  assert.equal(isRoomEmpty({ id: 'a', status: 'kosong', status_kamar: 'Terisi' }), false)
})

test('pindahTargetRooms: semua lokasi, kosong saja, tanpa kamar sekarang, urut lokasi lalu nomor natural', () => {
  const rooms = [
    room('cur', 'Kos A', '1'),
    room('x10', 'Kos B', '10'),
    room('x2', 'Kos B', '2'),
    room('isi', 'Kos A', '3', 'Terisi'),
    room('a5', 'Kos A', '5'),
    room('aktif', 'Kos A', '6', 'Kosong', { rentals: [{ status_aktif: true }] }),
  ]
  assert.deepEqual(pindahTargetRooms(rooms, 'cur').map(r => r.id), ['a5', 'x2', 'x10'])
  assert.deepEqual(pindahTargetRooms(null, 'cur'), [])
})

test('roomOptionLabel: lokasi + nomor kamar + harga', () => {
  const label = roomOptionLabel(room('a', 'Kos Dua', '4', 'Kosong', { harga_bulanan: 1500000 }))
  assert.match(label, /^Kos Dua · Kamar 4 · Rp\s?1\.500\.000\/bln$/)
  assert.match(roomOptionLabel({ nomor_kamar: '7' }), /^Tanpa lokasi · Kamar 7 · Rp\s?0\/bln$/)
})

test('rpcErrorMessage: kode SIMKOS_* dari RPC', () => {
  assert.equal(rpcErrorMessage({ code: 'P0001', details: 'SIMKOS_KAMAR_TERISI', message: 'x' }),
    'Kamar sudah terisi. Pilih kamar lain yang kosong.')
  assert.match(rpcErrorMessage({ code: 'P0001', details: 'SIMKOS_SEWA_TIDAK_AKTIF' }), /sudah tidak aktif/)
  assert.match(rpcErrorMessage({ code: 'P0001', details: 'SIMKOS_TANGGAL_SEBELUM_MASUK' }), /sebelum tanggal masuk/)
})

test('rpcErrorMessage: unique index, izin, RPC belum ada, offline, fallback', () => {
  assert.match(rpcErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "rentals_one_active_per_room"' }), /sudah terisi/)
  assert.match(rpcErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "rentals_one_active_per_tenant"' }), /masih punya sewa aktif/)
  assert.match(rpcErrorMessage({ code: '42501', message: 'tenants.foto_ktp_url harus berupa path' }), /Foto KTP tidak valid/)
  assert.match(rpcErrorMessage({ code: '42501', message: 'permission denied for function pindah_kamar' }), /tidak punya akses/)
  assert.match(rpcErrorMessage({ code: 'PGRST202', message: 'Could not find the function' }), /migration 600/)
  assert.match(rpcErrorMessage({ message: 'TypeError: Failed to fetch' }), /koneksi internet/)
  assert.equal(rpcErrorMessage({ code: 'XX000', message: 'internal' }, 'Gagal pindah kamar.'), 'Gagal pindah kamar.')
  assert.equal(rpcErrorMessage(null), '')
})

test('pesan error tidak membocorkan isi error mentah (mis. detail nilai path)', () => {
  const msg = rpcErrorMessage({ code: '42501', message: 'tenants.foto_ktp_url harus ...', details: 'nilai: org/ktp_rahasia.jpg' })
  assert.doesNotMatch(msg, /rahasia/)
})

test('kode SIMKOS_* di frontend sama dengan yang dilempar migration 600', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261018000600_pindah_kamar.sql', import.meta.url), 'utf8')
  const fromSql = new Set([...sql.matchAll(/detail = '(SIMKOS_[A-Z_]+)'/g)].map(m => m[1]))
  const js = readFileSync(new URL('../../src/lib/sewa.js', import.meta.url), 'utf8')
  const fromJs = new Set([...js.matchAll(/^\s+(SIMKOS_[A-Z_]+):/gm)].map(m => m[1]))
  assert.ok(fromSql.size >= 8)
  assert.deepEqual([...fromSql].sort(), [...fromJs].sort())
})

test('view memakai RPC atomik, tanpa rollback manual tenant & tanpa console.log data', () => {
  const tambah = readFileSync(new URL('../../src/views/TambahPenghuniView.vue', import.meta.url), 'utf8')
  assert.match(tambah, /supabase\.rpc\('daftar_penghuni'/)
  assert.doesNotMatch(tambah, /from\('tenants'\)\s*\.delete\(\)/)
  assert.doesNotMatch(tambah, /from\('rentals'\)\s*\.insert/)
  assert.doesNotMatch(tambah, /console\.log/)
  const daftar = readFileSync(new URL('../../src/views/DaftarPenghuniView.vue', import.meta.url), 'utf8')
  assert.match(daftar, /supabase\.rpc\('pindah_kamar'/)
  assert.match(daftar, /tanggal_keluar: localDateStamp\(\)/)
  assert.doesNotMatch(daftar, /console\.log/)
})
