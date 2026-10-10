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
  // _removeSession: menghapus sesi tersimpan + menandai agar refresh token
  // yang sedang berjalan tidak menyimpan sesi lagi (supabase-js 2.x).
  if (typeof auth._removeSession === 'function') {
    await auth._removeSession()
  } else if (auth.storageKey && globalThis.localStorage) {
    globalThis.localStorage.removeItem(auth.storageKey)
    globalThis.localStorage.removeItem(`${auth.storageKey}-code-verifier`)
  }
  return { local: true }
}
