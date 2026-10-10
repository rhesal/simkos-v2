import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isChunkLoadError, reloadOnce } from '../../src/lib/chunkReload.js'

test('isChunkLoadError mengenali pesan gagal import di Chrome, Firefox, Safari', () => {
  assert.ok(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/BerandaView-abc.js')))
  assert.ok(isChunkLoadError(new TypeError('error loading dynamically imported module')))
  assert.ok(isChunkLoadError(new TypeError('Importing a module script failed.')))
  assert.ok(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css')))
})

test('isChunkLoadError tidak menangkap error lain', () => {
  assert.equal(isChunkLoadError(new Error('Invalid login credentials')), false)
  assert.equal(isChunkLoadError(undefined), false)
})

function fakeEnv() {
  const store = new Map()
  const assigned = []
  return {
    assigned,
    storage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    location: { assign: p => assigned.push(p) },
  }
}

test('reloadOnce memuat ulang sekali lalu menahan reload kedua (anti loop)', () => {
  const env = fakeEnv()
  assert.equal(reloadOnce('/', { ...env, now: 1_000_000 }), true)
  assert.equal(reloadOnce('/', { ...env, now: 1_005_000 }), false)
  assert.deepEqual(env.assigned, ['/'])
})

test('reloadOnce boleh lagi setelah jeda 10 detik', () => {
  const env = fakeEnv()
  reloadOnce('/', { ...env, now: 1_000_000 })
  assert.equal(reloadOnce('/inventaris', { ...env, now: 1_011_000 }), true)
  assert.deepEqual(env.assigned, ['/', '/inventaris'])
})

test('reloadOnce tetap jalan bila sessionStorage tidak tersedia', () => {
  const assigned = []
  const storage = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') } }
  assert.equal(reloadOnce('/', { storage, location: { assign: p => assigned.push(p) }, now: 5 }), true)
  assert.deepEqual(assigned, ['/'])
})
