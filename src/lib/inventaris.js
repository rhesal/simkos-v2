// Aturan tipe barang inventaris. Satu-satunya sumber kebenaran untuk tab
// (Fasilitas Kamar / Fasilitas Umum), label kartu, dan nilai awal form edit,
// supaya barang tidak tampil di satu tab lalu tersimpan sebagai tipe lain.
//
// - tipe_fasilitas terisi ('kamar' | 'umum') -> dipakai apa adanya. Barang
//   'kamar' yang kamarnya sudah dihapus (room_id NULL) tetap 'kamar'.
// - tipe_fasilitas NULL (baris lama / jalur lain) -> 'kamar' bila room_id
//   terisi (room_id tidak hilang saat disimpan), selain itu 'umum'.
export function assetType(asset) {
  const tipe = asset?.tipe_fasilitas
  if (tipe === 'kamar' || tipe === 'umum') return tipe
  return asset?.room_id ? 'kamar' : 'umum'
}
