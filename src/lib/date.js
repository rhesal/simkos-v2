// Tanggal lokal perangkat (mis. Asia/Jakarta) dalam format YYYY-MM-DD.
// Jangan pakai toISOString(): itu UTC, sehingga sebelum jam 07.00 WIB
// hasilnya tanggal kemarin.
export function localDateStamp(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
