// Helper Supabase Storage untuk file privat (foto KTP & nota).
//
// Aturan:
// - Database HANYA menyimpan path objek di bucket, di folder ORGANISASI:
//   "<org_id>/ktp_<uuid>.jpg". Policy storage (migration 300) hanya mengizinkan
//   anggota org tersebut, dan trigger DB menolak path di luar folder org baris itu.
// - org_id diambil SEKALI setelah login (organization_members), di-cache di
//   memori, dan dibuang saat logout / user berganti.
// - Foto KTP ditampilkan lewat downloadPrivateFile() -> Blob -> blob URL di
//   modal (components/KtpViewerModal.vue). Tidak ada URL yang bisa dibagikan
//   atau masuk riwayat browser.
// - Nota ditampilkan lewat signed URL:
//     ktp_images     -> 5 menit, TIDAK di-cache (cadangan; UI memakai download)
//     receipt_images -> 1 jam, di-cache di memori (dibuang sebelum kedaluwarsa)
// - Upload KTP memakai cacheControl '0' (header "max-age=0") agar response
//   download tidak disimpan lama di cache HTTP browser. Catatan: storage-js
//   selalu mengirim `max-age=<nilai>`, jadi 'no-store' TIDAK valid di sini.
// - Cache signed URL dikosongkan saat logout / user berganti (lihat
//   initStorageAuthListener, dipanggil dari main.js).
// - Baris lama yang masih menyimpan URL publik penuh tetap didukung:
//   path diekstrak otomatis dari URL tersebut.
// - Nama file tidak boleh memuat data pribadi: dipakai UUID acak, ekstensi
//   diturunkan dari MIME type (bukan dari nama file asli).
import { supabase } from '../supabase.js'

export const KTP_BUCKET = 'ktp_images'
export const RECEIPT_BUCKET = 'receipt_images'

// Tipe file yang diizinkan (harus sama dengan allowed_mime_types di
// supabase/migrations/20261010000300_private_storage_buckets.sql). SVG sengaja
// TIDAK diizinkan karena bisa memuat skrip.
export const ALLOWED_IMAGE_TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
})
// Nilai untuk atribut accept pada <input type="file">
export const IMAGE_ACCEPT = Object.keys(ALLOWED_IMAGE_TYPES).join(',')
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * Validasi file gambar di sisi client. Mengembalikan pesan error (string)
 * atau null bila valid. Bucket tetap menegakkan aturan yang sama di server.
 */
export function validateImageFile(file) {
  if (!file) return 'File tidak ditemukan.'
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_TYPES, file.type)) {
    return 'File harus berupa foto JPG, PNG, atau WEBP.'
  }
  if (file.size > MAX_IMAGE_BYTES) return 'Ukuran file maksimal 5MB.'
  return null
}

// Konfigurasi per bucket: masa berlaku signed URL (detik) & boleh di-cache atau tidak.
// uploadCacheControl: detik untuk header Cache-Control objek (storage-js
// mengirimnya sebagai `max-age=<nilai>`).
const BUCKET_CONFIG = {
  [KTP_BUCKET]: { ttl: 5 * 60, cache: false, uploadCacheControl: '0' },
  [RECEIPT_BUCKET]: { ttl: 60 * 60, cache: true, uploadCacheControl: '3600' },
}
const DEFAULT_CONFIG = { ttl: 5 * 60, cache: false, uploadCacheControl: '0' }

export function signedUrlTtl(bucket) {
  return (BUCKET_CONFIG[bucket] || DEFAULT_CONFIG).ttl
}

// Cache kecil di memori agar tidak meminta signed URL berulang-ulang.
// Hanya untuk bucket dengan cache: true. Entri dianggap basi saat sisa umurnya
// kurang dari 20% TTL (min. 30 detik) agar URL yang dipakai UI tidak keburu habis.
const cache = new Map()

function cacheKey(bucket, path) {
  return `${bucket}::${path}`
}

function cacheMarginMs(ttlSeconds) {
  return Math.max(30_000, ttlSeconds * 1000 * 0.2)
}

function cacheGet(bucket, path) {
  if (!(BUCKET_CONFIG[bucket] || DEFAULT_CONFIG).cache) return null
  const key = cacheKey(bucket, path)
  const hit = cache.get(key)
  if (!hit) return null
  if (hit.expiresAt - hit.marginMs > Date.now()) return hit.url
  cache.delete(key)
  return null
}

function cacheSet(bucket, path, url, ttlSeconds) {
  if (!(BUCKET_CONFIG[bucket] || DEFAULT_CONFIG).cache) return
  cache.set(cacheKey(bucket, path), {
    url,
    expiresAt: Date.now() + ttlSeconds * 1000,
    marginMs: cacheMarginMs(ttlSeconds),
  })
}

/** Kosongkan seluruh cache signed URL (dipanggil saat logout / ganti user). */
export function clearSignedUrlCache() {
  cache.clear()
}

// ---------------------------------------------------------------------
// Organisasi user yang login (multi-pemilik). Satu user = satu org.
// ---------------------------------------------------------------------
let orgIdCache = null // { userId, promise }

/** Buang org_id yang di-cache (dipanggil saat logout / ganti user). */
export function clearOrgIdCache() {
  orgIdCache = null
}

/**
 * org_id milik user yang login. Diambil sekali dari organization_members
 * (RLS: user hanya melihat keanggotaan org-nya) lalu di-cache per user.
 */
export async function getCurrentOrgId() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.')
  const userId = data.user.id
  if (orgIdCache && orgIdCache.userId === userId) return orgIdCache.promise

  const promise = (async () => {
    const { data: rows, error: orgError } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
    if (orgError) throw new Error(`Gagal memuat data organisasi: ${orgError.message}`)
    if (!rows || rows.length === 0) {
      throw new Error('Akun ini belum terdaftar di organisasi SimKos. Hubungi pemilik kos.')
    }
    if (rows.length > 1) throw new Error('Akun ini terdaftar di lebih dari satu organisasi.')
    return rows[0].org_id
  })()
  orgIdCache = { userId, promise }
  // Jangan simpan kegagalan di cache: percobaan berikutnya mengambil ulang.
  promise.catch(() => {
    if (orgIdCache?.promise === promise) orgIdCache = null
  })
  return promise
}

let authListenerStarted = false
let currentUserId = null
const signedOutHandlers = new Set()

/**
 * Daftarkan callback yang dipanggil saat user logout atau berganti.
 * Mengembalikan fungsi untuk melepas callback (panggil di onUnmounted).
 * Dipakai modal KTP untuk menutup diri & membuang blob.
 */
export function onStorageSignedOut(handler) {
  signedOutHandlers.add(handler)
  return () => signedOutHandlers.delete(handler)
}

/**
 * Pasang listener auth: cache signed URL dikosongkan saat SIGNED_OUT atau
 * saat user yang login berganti, supaya user berikutnya di perangkat yang
 * sama tidak bisa mendapat URL file milik user sebelumnya.
 */
export function initStorageAuthListener() {
  if (authListenerStarted) return
  authListenerStarted = true
  supabase.auth.onAuthStateChange((event, session) => {
    const nextUserId = session?.user?.id || null
    if (event === 'SIGNED_OUT' || nextUserId !== currentUserId) {
      clearSignedUrlCache()
      clearOrgIdCache()
      for (const handler of [...signedOutHandlers]) {
        try {
          handler(event)
        } catch (err) {
          console.warn('[SimKos] Handler logout gagal:', err?.message || err)
        }
      }
    }
    currentUserId = nextUserId
    // Ambil org_id sekali setelah login supaya upload pertama tidak menunggu.
    if (nextUserId && event !== 'SIGNED_OUT') getCurrentOrgId().catch(() => {})
  })
}

/**
 * Ubah nilai yang tersimpan di DB (path atau URL publik/signed lama) menjadi path objek.
 * Mengembalikan null bila kosong / tidak bisa dikenali.
 */
export function toStoragePath(bucket, value) {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (!/^https?:\/\//i.test(trimmed)) {
    // Sudah berupa path. Buang prefix "<bucket>/" bila ada.
    const clean = trimmed.replace(/^\/+/, '')
    return clean.startsWith(`${bucket}/`) ? clean.slice(bucket.length + 1) : clean
  }

  try {
    const url = new URL(trimmed)
    // Format: /storage/v1/object/(public|sign|authenticated)/<bucket>/<path>
    const marker = `/storage/v1/object/`
    const idx = url.pathname.indexOf(marker)
    if (idx === -1) return null
    const rest = url.pathname.slice(idx + marker.length).split('/')
    // rest[0] = public|sign|authenticated, rest[1] = bucket
    if (rest.length < 3 || rest[1] !== bucket) return null
    return decodeURIComponent(rest.slice(2).join('/')) || null
  } catch {
    return null
  }
}

/**
 * Buat path upload baru dengan prefix org id: "<org_id>/<prefix>_<uuid>.<ext>".
 * Prefix org id dipakai oleh policy storage & trigger path (lihat supabase/migrations).
 * Ekstensi diturunkan dari MIME type, bukan dari nama file asli.
 */
export async function buildUploadPath(prefix, file) {
  const ext = ALLOWED_IMAGE_TYPES[file?.type]
  if (!ext) throw new Error('File harus berupa foto JPG, PNG, atau WEBP.')
  const orgId = await getCurrentOrgId()
  return `${orgId}/${prefix}_${crypto.randomUUID()}.${ext}`
}

export const RELOAD_APP_MESSAGE = 'Upload ditolak server. Muat ulang aplikasi lalu coba lagi.'

/** true bila error storage berarti akses ditolak (403 / RLS). */
export function isAccessDeniedError(error) {
  const status = Number(error?.statusCode ?? error?.status)
  return status === 403 || /row-level security|unauthorized|forbidden/i.test(error?.message || '')
}

// Upload 403 biasanya berarti aplikasi masih memakai versi lama (aturan
// penyimpanan berubah) atau data org di memori basi: buang cache & tawarkan muat ulang.
function promptReloadAfterDenied() {
  clearOrgIdCache()
  clearSignedUrlCache()
  if (typeof window !== 'undefined' && window.confirm(`${RELOAD_APP_MESSAGE}\n\nMuat ulang aplikasi sekarang?`)) {
    window.location.reload()
  }
}

/**
 * Upload file ke bucket privat. Mengembalikan path objek yang harus disimpan di DB.
 */
export async function uploadPrivateFile(bucket, prefix, file) {
  const invalid = validateImageFile(file)
  if (invalid) throw new Error(invalid)
  const path = await buildUploadPath(prefix, file)
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: (BUCKET_CONFIG[bucket] || DEFAULT_CONFIG).uploadCacheControl,
    upsert: false,
    contentType: file.type,
  })
  if (error) {
    if (isAccessDeniedError(error)) {
      promptReloadAfterDenied()
      const denied = new Error(RELOAD_APP_MESSAGE)
      denied.needsReload = true
      denied.cause = error
      throw denied
    }
    throw error
  }
  return data.path
}

/**
 * Unduh file privat sebagai Blob memakai token sesi user (tetap dijaga RLS).
 * Dipakai untuk menampilkan KTP lewat blob URL tanpa signed URL.
 * Melempar error bila gagal, supaya UI bisa menampilkan tombol coba lagi.
 */
export async function downloadPrivateFile(bucket, value) {
  const path = toStoragePath(bucket, value)
  if (!path) throw new Error('File tidak ditemukan.')
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error) throw error
  if (!data) throw new Error('File kosong.')
  return data
}

/**
 * Signed URL untuk satu file. Mengembalikan null bila tidak ada / gagal.
 */
export async function getSignedUrl(bucket, value, expiresIn = signedUrlTtl(bucket)) {
  const path = toStoragePath(bucket, value)
  if (!path) return null

  const hit = cacheGet(bucket, path)
  if (hit) return hit

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error || !data?.signedUrl) {
    console.warn('[SimKos] Gagal membuat signed URL:', error?.message || error)
    return null
  }
  cacheSet(bucket, path, data.signedUrl, expiresIn)
  return data.signedUrl
}

/**
 * Signed URL untuk banyak file sekaligus. Mengembalikan Map<nilaiAsli, signedUrl>.
 */
export async function getSignedUrls(bucket, values, expiresIn = signedUrlTtl(bucket)) {
  const result = new Map()
  const toSign = []
  const pathToValues = new Map()

  for (const value of values || []) {
    const path = toStoragePath(bucket, value)
    if (!path) continue
    const hit = cacheGet(bucket, path)
    if (hit) {
      result.set(value, hit)
      continue
    }
    if (!pathToValues.has(path)) {
      pathToValues.set(path, [])
      toSign.push(path)
    }
    pathToValues.get(path).push(value)
  }

  if (toSign.length === 0) return result

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(toSign, expiresIn)
  if (error) {
    console.warn('[SimKos] Gagal membuat signed URLs:', error.message || error)
    return result
  }
  for (const item of data || []) {
    if (!item?.signedUrl || item.error) continue
    cacheSet(bucket, item.path, item.signedUrl, expiresIn)
    for (const original of pathToValues.get(item.path) || []) {
      result.set(original, item.signedUrl)
    }
  }
  return result
}

/**
 * Hapus file (best effort). Tidak melempar error; mengembalikan true bila berhasil.
 */
export async function removeStorageFile(bucket, value) {
  const path = toStoragePath(bucket, value)
  if (!path) return false
  cache.delete(cacheKey(bucket, path))
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) {
    console.warn('[SimKos] Gagal menghapus file storage:', error.message || error)
    return false
  }
  return true
}

/**
 * Hapus file secara KETAT: melempar error bila Storage mengembalikan error,
 * supaya pemanggil bisa membatalkan langkah berikutnya (mis. mengosongkan kolom DB)
 * dan menampilkan pesan ke user.
 *
 * Mengembalikan jumlah objek yang terhapus. Catatan: Supabase Storage mengembalikan
 * daftar kosong (tanpa error) bila objek sudah tidak ada atau tidak bisa diakses user
 * ini (RLS); kasus itu dianggap "sudah tidak ada" bagi user ini.
 */
export async function deleteStorageFile(bucket, value) {
  const path = toStoragePath(bucket, value)
  if (!path) return 0
  cache.delete(cacheKey(bucket, path))
  const { data, error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
  return Array.isArray(data) ? data.length : 0
}
