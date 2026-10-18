// Aturan sewa yang dipakai TambahPenghuniView & DaftarPenghuniView:
// kamar kosong, daftar kamar tujuan pindah, dan pesan error RPC
// (pindah_kamar / daftar_penghuni, migration 600) untuk pengguna.

// Nilai yang diizinkan DB (migration 600). Dibandingkan PERSIS, tanpa
// lower/trim: constraint rooms_status_kamar_check menjamin hanya dua nilai ini.
export const ROOM_STATUS = Object.freeze({ KOSONG: 'Kosong', TERISI: 'Terisi' })
// Whitelist RPC daftar_penghuni (nilai <option> di TambahPenghuniView).
export const TIPE_SEWA = Object.freeze(['bulanan', 'harian'])
// Whitelist RPC checkout_sewa (nilai <option> modal checkout).
export const STATUS_REPUTASI = Object.freeze(['Bersih', 'Peringatan', 'Blacklist'])

// Kamar dianggap kosong bila status_kamar PERSIS 'Kosong' DAN (kalau data sewa
// ikut di-load) tidak ada sewa aktif. Aturan yang sama dengan RPC.
export function isRoomEmpty(room) {
  if (!room) return false
  if (room.status_kamar !== ROOM_STATUS.KOSONG) return false
  if (room.activeRental) return false
  if (Array.isArray(room.rentals) && room.rentals.some(r => r?.status_aktif === true)) return false
  return true
}

const collator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' })

// Kamar tujuan pindah: semua lokasi, hanya yang kosong, bukan kamar sekarang.
// Urut: nama lokasi, lalu nomor kamar (natural: 2 sebelum 10).
export function pindahTargetRooms(rooms, currentRoomId) {
  return (rooms || [])
    .filter(r => r && r.id !== currentRoomId && isRoomEmpty(r))
    .sort((a, b) =>
      collator.compare(a.locations?.nama_lokasi || '', b.locations?.nama_lokasi || '') ||
      collator.compare(String(a.nomor_kamar ?? ''), String(b.nomor_kamar ?? '')))
}

export function formatRupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}

// Label opsi kamar tujuan: "Kos Dua · Kamar 4 · Rp 1.500.000/bln"
export function roomOptionLabel(room) {
  const lokasi = room?.locations?.nama_lokasi || 'Tanpa lokasi'
  return `${lokasi} · Kamar ${room?.nomor_kamar ?? '?'} · ${formatRupiah(room?.harga_bulanan)}/bln`
}

// Hapus paksa ditolak: penghuni punya sewa lain (pindah kamar) atau pemasukan.
export const RIWAYAT_SEWA_MSG = 'Penghuni ini punya riwayat sewa/pindah kamar. Gunakan Checkout atau Pindah Kamar untuk koreksi.'

const DETAIL_MESSAGES = {
  SIMKOS_ADA_RIWAYAT: RIWAYAT_SEWA_MSG,
  SIMKOS_KAMAR_TERISI: 'Kamar sudah terisi. Pilih kamar lain yang kosong.',
  SIMKOS_KAMAR_TIDAK_ADA: 'Kamar tidak ditemukan. Muat ulang halaman lalu coba lagi.',
  SIMKOS_KAMAR_SAMA: 'Kamar tujuan sama dengan kamar sekarang.',
  SIMKOS_BEDA_ORG: 'Kamar tujuan bukan milik kos Anda.',
  SIMKOS_SEWA_TIDAK_ADA: 'Data sewa tidak ditemukan. Muat ulang halaman lalu coba lagi.',
  SIMKOS_SEWA_TIDAK_AKTIF: 'Sewa ini sudah tidak aktif (sudah checkout atau sudah dipindah). Muat ulang halaman.',
  SIMKOS_TANGGAL_SEBELUM_MASUK: 'Tanggal pindah tidak boleh sebelum tanggal masuk.',
  SIMKOS_TANGGAL_TEMPO: 'Tanggal jatuh tempo tidak boleh sebelum tanggal masuk.',
  SIMKOS_TANGGAL_KELUAR: 'Tanggal checkout tidak boleh sebelum tanggal masuk.',
  SIMKOS_TIPE_SEWA: 'Tipe sewa harus Bulanan atau Harian.',
  SIMKOS_REPUTASI: 'Pilih status reputasi: Bersih, Peringatan, atau Blacklist.',
  SIMKOS_GAGAL_UPDATE_PENGHUNI: 'Reputasi penghuni gagal diperbarui. Tidak ada data yang berubah, silakan coba lagi.',
  SIMKOS_INPUT_KOSONG: 'Data belum lengkap. Periksa isian lalu coba lagi.',
  SIMKOS_GAGAL_UPDATE_KAMAR: 'Status kamar gagal diperbarui. Tidak ada data yang berubah, silakan coba lagi.',
}

// Ubah error supabase-js (PostgREST) jadi pesan Bahasa Indonesia yang jelas.
// Tidak pernah mengembalikan isi data; hanya pesan.
export function rpcErrorMessage(error, fallback = 'Terjadi kesalahan. Silakan coba lagi.') {
  if (!error) return ''
  const code = String(error.code || '')
  const details = String(error.details || '')
  const message = String(error.message || '')

  if (DETAIL_MESSAGES[details]) return DETAIL_MESSAGES[details]

  if (code === '23505') {
    if (/rentals_one_active_per_room/.test(message + details)) return DETAIL_MESSAGES.SIMKOS_KAMAR_TERISI
    if (/rentals_one_active_per_tenant/.test(message + details)) return 'Penghuni ini masih punya sewa aktif di kamar lain.'
  }
  if (code === '23503' && /incomes_rental_id_fkey|rentals_tenant_id_fkey/.test(message + details)) {
    return RIWAYAT_SEWA_MSG
  }
  if (code === '23514' && /rooms_status_kamar_check/.test(message + details)) {
    return 'Status kamar tidak valid (harus Kosong atau Terisi).'
  }
  if (code === '42501') {
    if (/foto_ktp_url/.test(message)) return 'Foto KTP tidak valid untuk kos ini. Unggah ulang foto KTP.'
    return 'Anda tidak punya akses untuk melakukan ini. Coba keluar lalu masuk lagi.'
  }
  // RPC belum ada di database (migration 600 belum diterapkan).
  if (code === 'PGRST202' || code === '42883') {
    return 'Fitur ini belum aktif di database. Hubungi admin untuk menerapkan migration 600.'
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return 'Tidak ada koneksi internet. Periksa koneksi lalu coba lagi.'
  }
  return fallback
}
