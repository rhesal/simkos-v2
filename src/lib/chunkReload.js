/**
 * Pemulihan saat file JS (chunk) halaman gagal dimuat.
 *
 * Setelah deploy baru, tab yang masih memakai index.html lama akan meminta
 * chunk dengan hash lama. Chunk itu sudah tidak ada di server (404), sehingga
 * import() gagal dan navigasi batal tanpa pesan. Solusinya: muat ulang halaman
 * tujuan sekali supaya index.html baru ikut terambil.
 */

const RELOAD_KEY = 'simkos:chunk-reload-at'
// Jangan reload lagi dalam jendela ini, supaya tidak terjadi loop reload
// bila server memang sedang bermasalah.
const RELOAD_COOLDOWN_MS = 10_000

let reloadPending = false

/** true bila reload sudah dipicu di halaman ini (tinggal menunggu browser pindah). */
export function isReloadPending() {
  return reloadPending
}

/** true bila error berasal dari gagal memuat modul/chunk dinamis. */
export function isChunkLoadError(err) {
  const msg = String(err?.message || err || '')
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(msg)
}

/**
 * Muat ulang ke `path` paling banyak sekali per RELOAD_COOLDOWN_MS.
 * Mengembalikan true bila reload dijalankan, false bila ditahan cooldown.
 */
export function reloadOnce(path, { storage = globalThis.sessionStorage, location = globalThis.location, now = Date.now() } = {}) {
  let last = 0
  try {
    last = Number(storage?.getItem(RELOAD_KEY)) || 0
  } catch {
    // sessionStorage bisa tidak tersedia (mode privat tertentu)
  }
  if (last && now - last < RELOAD_COOLDOWN_MS) return false
  try {
    storage?.setItem(RELOAD_KEY, String(now))
  } catch {
    // abaikan
  }
  reloadPending = true
  location.assign(path)
  return true
}
