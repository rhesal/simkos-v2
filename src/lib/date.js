// Tanggal lokal perangkat (mis. Asia/Jakarta) dalam format YYYY-MM-DD.
// Jangan pakai toISOString(): itu UTC, sehingga sebelum jam 07.00 WIB
// hasilnya tanggal kemarin.
export function localDateStamp(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Majukan tanggal YYYY-MM-DD sebanyak +1 bulan secara aman tanpa distorsi timezone.
 * Menangani batas akhir bulan (misal 31 Jan -> 28 Feb).
 */
export function advanceOneMonth(dateStr) {
  if (!dateStr) return null
  const parts = String(dateStr).split('-')
  if (parts.length === 3) {
    let year = parseInt(parts[0], 10)
    let month = parseInt(parts[1], 10)
    const day = parseInt(parts[2], 10)

    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
    const maxDays = new Date(year, month, 0).getDate()
    const safeDay = Math.min(day, maxDays)

    return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
  }
  return dateStr
}
