// Tes aturan tipe barang inventaris. Jalankan: node --test qa/inventaris/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assetType } from '../../src/lib/inventaris.js'

const tabOf = a => (assetType(a) === 'kamar' ? 'Fasilitas Kamar' : 'Fasilitas Umum')

test('tipe_fasilitas terisi dipakai apa adanya', () => {
  assert.equal(assetType({ tipe_fasilitas: 'kamar', room_id: 'r1' }), 'kamar')
  assert.equal(assetType({ tipe_fasilitas: 'umum', room_id: null }), 'umum')
  // tipe 'umum' tetap 'umum' walau room_id (sisa data) terisi
  assert.equal(assetType({ tipe_fasilitas: 'umum', room_id: 'r1' }), 'umum')
})

test('NULL + room_id -> kamar (tab Kamar, room_id tidak hilang)', () => {
  const a = { tipe_fasilitas: null, room_id: 'r1' }
  assert.equal(assetType(a), 'kamar')
  assert.equal(tabOf(a), 'Fasilitas Kamar')
})

test('NULL tanpa room_id -> umum (tab Umum)', () => {
  assert.equal(assetType({ tipe_fasilitas: null, room_id: null }), 'umum')
  assert.equal(assetType({ room_id: '' }), 'umum')
  assert.equal(assetType({}), 'umum')
})

test("barang 'kamar' yang kamarnya dihapus (room_id NULL) tetap di tab Kamar", () => {
  const a = { tipe_fasilitas: 'kamar', room_id: null }
  assert.equal(assetType(a), 'kamar')
  assert.equal(tabOf(a), 'Fasilitas Kamar')
})

// Tidak ada test runner komponen Vue: pastikan tab, label kartu, dan form edit
// memakai helper yang sama, dan payload menyimpan room_id untuk tipe kamar.
test('InventarisView memakai assetType di tab, label, dan form edit', () => {
  const src = readFileSync(new URL('../../src/views/InventarisView.vue', import.meta.url), 'utf8')
  assert.match(src, /import \{ assetType \} from '\.\.\/lib\/inventaris\.js'/)
  assert.match(src, /const matchesTab = assetType\(asset\) ===/)
  assert.match(src, /form\.tipe_fasilitas = assetType\(asset\)/)
  assert.match(src, /v-if="assetType\(asset\) === 'kamar'"[^>]*>\s*\{\{ asset\.rooms\?\.nomor_kamar \|\| 'Kmr' \}\}/)
  assert.match(src, /room_id: form\.tipe_fasilitas === 'kamar' && form\.room_id \? form\.room_id : null/)
  assert.match(src, /form\.room_id = asset\.room_id \|\| ''/)
  assert.ok(!/tipe_fasilitas \?\? 'umum'/.test(src), "masih ada aturan lama `?? 'umum'`")
})

test('explainZeroRows memeriksa error sebelum menyimpulkan', () => {
  const src = readFileSync(new URL('../../src/views/InventarisView.vue', import.meta.url), 'utf8')
  const fn = src.slice(src.indexOf('async function explainZeroRows'), src.indexOf('async function hapusFileNotaLama'))
  assert.match(fn, /const \{ data, error \} =/)
  assert.ok(fn.indexOf('if (error) return CHECK_FAILED_MSG') < fn.indexOf('return data ?'))
})
