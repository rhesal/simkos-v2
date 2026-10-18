// Aturan sewa yang dipakai TambahPenghuniView & DaftarPenghuniView:
// kamar kosong, daftar kamar tujuan pindah, dan pesan error RPC
// (pindah_kamar / daftar_penghuni, migration 600) untuk pengguna.

// Kamar dianggap kosong bila status_kamar 'Kosong' DAN (kalau data sewa ikut
// di-load) tidak ada sewa aktif. Sama dengan pengecekan di RPC.
export function isRoomEmpty(room) {
  if (!room) return false
  const status = String(room.status_kamar || '').trim().toLowerCase()
  if (status !== 'kosong') return false
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

const DETAIL_MESSAGES = {
  SIMKOS_KAMAR_TERISI: 'Kamar sudah terisi. Pilih kamar lain yang kosong.',
  SIMKOS_KAMAR_TIDAK_ADA: 'Kamar tidak ditemukan. Muat ulang halaman lalu coba lagi.',
  SIMKOS_KAMAR_SAMA: 'Kamar tujuan sama dengan kamar sekarang.',
  SIMKOS_BEDA_ORG: 'Kamar tujuan bukan milik kos Anda.',
  SIMKOS_SEWA_TIDAK_ADA: 'Data sewa tidak ditemukan. Muat ulang halaman lalu coba lagi.',
  SIMKOS_SEWA_TIDAK_AKTIF: 'Sewa ini sudah tidak aktif (sudah checkout atau sudah dipindah). Muat ulang halaman.',
  SIMKOS_TANGGAL_SEBELUM_MASUK: 'Tanggal pindah tidak boleh sebelum tanggal masuk.',
  SIMKOS_TANGGAL_TEMPO: 'Tanggal jatuh tempo tidak boleh sebelum tanggal masuk.',
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
