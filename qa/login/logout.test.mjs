import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signOutWithLocalFallback } from '../../src/lib/auth.js'

function fakeAuth(signOutImpl) {
  const calls = []
  return {
    calls,
    signOut: async (...a) => { calls.push(['signOut', ...a]); return signOutImpl() },
    _removeSession: async () => { calls.push(['_removeSession']) },
  }
}

test('logout online: cukup signOut ke server, sesi lokal tidak disentuh manual', async () => {
  const auth = fakeAuth(() => ({ error: null }))
  assert.deepEqual(await signOutWithLocalFallback(auth), { local: false })
  assert.deepEqual(auth.calls, [['signOut']])
})

test('logout offline (error jaringan dikembalikan): sesi lokal tetap dihapus', async () => {
  const auth = fakeAuth(() => ({ error: Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError', status: 0 }) }))
  assert.deepEqual(await signOutWithLocalFallback(auth), { local: true })
  assert.deepEqual(auth.calls, [['signOut'], ['_removeSession']])
})

test('logout saat signOut melempar exception: sesi lokal tetap dihapus', async () => {
  const auth = fakeAuth(() => { throw new TypeError('Failed to fetch') })
  assert.deepEqual(await signOutWithLocalFallback(auth), { local: true })
  assert.deepEqual(auth.calls.at(-1), ['_removeSession'])
})

test('supabase-js terpasang masih punya auth._removeSession (cek saat upgrade)', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient('https://example.supabase.co', 'anon', { auth: { persistSession: false, autoRefreshToken: false } })
  assert.equal(typeof client.auth._removeSession, 'function',
    'supabase-js tidak lagi punya _removeSession: perbarui src/lib/auth.js')
})

test('cadangan tanpa _removeSession menghapus key sesi, code-verifier, dan -user di auth.storage', async () => {
  const removed = []
  const auth = {
    storageKey: 'sb-x-auth-token',
    storage: { removeItem: async k => { removed.push(k) } },
    signOut: async () => ({ error: new Error('Failed to fetch') }),
  }
  assert.deepEqual(await signOutWithLocalFallback(auth), { local: true })
  assert.deepEqual(removed, ['sb-x-auth-token', 'sb-x-auth-token-code-verifier', 'sb-x-auth-token-user'])
})

test('hapus sesi lokal yang melempar error tidak menggagalkan logout', async () => {
  const auth = {
    signOut: async () => ({ error: new Error('Failed to fetch') }),
    _removeSession: async () => { throw new Error('storage rusak') },
  }
  assert.deepEqual(await signOutWithLocalFallback(auth), { local: true })
})
