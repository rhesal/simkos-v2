// Helper Supabase Storage untuk file privat (foto KTP & nota).
//
// Aturan:
// - Database HANYA menyimpan path objek di bucket (mis. "<user_id>/ktp_123.jpg"),
//   bukan URL publik.
// - Untuk menampilkan file, gunakan signed URL berumur pendek (default 1 jam).
// - Baris lama yang masih menyimpan URL publik penuh tetap didukung:
//   path diekstrak otomatis dari URL tersebut.
import { supabase } from '../supabase.js'

export const KTP_BUCKET = 'ktp_images'
export const RECEIPT_BUCKET = 'receipt_images'

// Masa berlaku signed URL (detik)
export const SIGNED_URL_TTL = 60 * 60

// Cache kecil di memori agar tidak meminta signed URL berulang-ulang
const cache = new Map()
const CACHE_MARGIN_MS = 5 * 60 * 1000

function cacheKey(bucket, path) {
  return `${bucket}::${path}`
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
 * Buat path upload baru dengan prefix user id: "<user_id>/<prefix>_<timestamp>_<rand>.<ext>".
 * Prefix user id dipakai oleh policy storage (lihat supabase/migrations).
 */
export async function buildUploadPath(prefix, file) {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.')
  const rawExt = (file?.name || '').split('.').pop() || 'jpg'
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const rand = Math.random().toString(36).slice(2, 8)
  return `${data.user.id}/${prefix}_${Date.now()}_${rand}.${ext}`
}

/**
 * Upload file ke bucket privat. Mengembalikan path objek yang harus disimpan di DB.
 */
export async function uploadPrivateFile(bucket, prefix, file) {
  const path = await buildUploadPath(prefix, file)
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file?.type || undefined,
  })
  if (error) throw error
  return data.path
}

/**
 * Signed URL untuk satu file. Mengembalikan null bila tidak ada / gagal.
 */
export async function getSignedUrl(bucket, value, expiresIn = SIGNED_URL_TTL) {
  const path = toStoragePath(bucket, value)
  if (!path) return null

  const key = cacheKey(bucket, path)
  const hit = cache.get(key)
  if (hit && hit.expiresAt - CACHE_MARGIN_MS > Date.now()) return hit.url

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error || !data?.signedUrl) {
    console.warn('[SimKos] Gagal membuat signed URL:', error?.message || error)
    return null
  }
  cache.set(key, { url: data.signedUrl, expiresAt: Date.now() + expiresIn * 1000 })
  return data.signedUrl
}

/**
 * Signed URL untuk banyak file sekaligus. Mengembalikan Map<nilaiAsli, signedUrl>.
 */
export async function getSignedUrls(bucket, values, expiresIn = SIGNED_URL_TTL) {
  const result = new Map()
  const toSign = []
  const pathToValues = new Map()

  for (const value of values || []) {
    const path = toStoragePath(bucket, value)
    if (!path) continue
    const hit = cache.get(cacheKey(bucket, path))
    if (hit && hit.expiresAt - CACHE_MARGIN_MS > Date.now()) {
      result.set(value, hit.url)
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
    cache.set(cacheKey(bucket, item.path), {
      url: item.signedUrl,
      expiresAt: Date.now() + expiresIn * 1000,
    })
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
