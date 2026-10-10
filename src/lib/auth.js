/**
 * Logout yang tetap jalan saat offline.
 *
 * `supabase.auth.signOut()` selalu memanggil server dulu (juga dengan
 * scope 'local'). Kalau jaringan putus, supabase-js mengembalikan error dan
 * TIDAK menghapus sesi di perangkat, sehingga tombol Keluar terlihat diam.
 * Di sini, bila panggilan server gagal, sesi di perangkat tetap dihapus.
 * Token di server akan kedaluwarsa sendiri (access token ±1 jam); refresh
 * token-nya ikut terhapus dari perangkat sehingga tidak bisa dipakai lagi dari sini.
 *
 * Mengembalikan { local: boolean } — true bila hanya sesi lokal yang dihapus.
 */
export async function signOutWithLocalFallback(auth) {
  let serverError = null
  try {
    const { error } = await auth.signOut()
    serverError = error || null
  } catch (err) {
    serverError = err
  }
  if (!serverError) return { local: false }

  console.warn('[Supabase Auth] Logout ke server gagal, sesi di perangkat tetap dihapus:', serverError?.message || serverError)
  try {
    // _removeSession: menghapus sesi tersimpan, memicu SIGNED_OUT, dan menandai
    // agar refresh token yang sedang berjalan tidak menyimpan sesi lagi
    // (supabase-js 2.x; dijaga tes qa/login/logout.test.mjs).
    if (typeof auth._removeSession === 'function') {
      await auth._removeSession()
    } else {
      await removeStoredSession(auth)
    }
  } catch (err) {
    console.warn('[Supabase Auth] Gagal menghapus sesi di perangkat:', err?.message || err)
  }
  return { local: true }
}

/** Cadangan bila _removeSession tidak ada: hapus key yang sama dengan library. */
async function removeStoredSession(auth) {
  const storage = auth.storage || globalThis.localStorage
  if (!auth.storageKey || !storage) return
  for (const suffix of ['', '-code-verifier', '-user']) {
    await storage.removeItem(auth.storageKey + suffix)
  }
}
