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
