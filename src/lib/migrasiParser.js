/**
 * Parser Cerdas Catatan Buku Kas SimKos
 * Mengekstrak informasi penghuni dan riwayat pembayaran dari format teks catatan kas
 */

export function parseIndoDate(str) {
  if (!str) return null
  const cleaned = String(str).trim().replace(/^Tgl\.?\s*/i, '')
  const parts = cleaned.split(/[-\/]/)
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
    }
    let yr = parts[2]
    if (yr.length === 2) yr = '20' + yr
    return `${yr}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  return null
}

export function parsePaymentLine(line) {
  const trimmed = String(line || '').trim()
  if (!trimmed) return null

  // Format: "1. Tgl.06-07-26 = 750.000 / trnfer lunas"
  // Format: "Tgl. 05/10/2026 : Rp 800.000 (transfer)"
  // Format: "04-11-2026 = 750000 / tunai"
  const m = trimmed.match(/^(?:\d+[\.\)]\s*)?(?:Tgl\.?\s*)?(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})\s*[:=]\s*(?:Rp\.?\s*)?([\d\.,]+)(?:\s*[\/|\-,\s]\s*(.*))?$/i)
  if (!m) return null

  const dateStr = parseIndoDate(m[1])
  if (!dateStr) return null

  const nominal = parseInt(m[2].replace(/[\.,]/g, ''), 10)
  if (isNaN(nominal) || nominal <= 0) return null

  const extra = (m[3] || '').replace(/^[\(\[]|[\)\]]$/g, '').trim()
  const lowerExtra = extra.toLowerCase()
  const metode = (lowerExtra.includes('tunai') || lowerExtra.includes('cash')) ? 'Tunai' : 'Transfer'

  return {
    tanggal: dateStr,
    nominal,
    metode,
    keterangan: extra || `Sewa Kamar (${metode})`
  }
}

export function parseCatatanKas(text) {
  if (!text || typeof text !== 'string') {
    return {
      nomor_kamar: null,
      nama: '',
      alamat: '',
      nomor_hp: '',
      tanggal_masuk: null,
      kontak_darurat: '',
      catatan: '',
      pembayaran: []
    }
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const result = {
    nomor_kamar: null,
    nama: '',
    alamat: '',
    nomor_hp: '',
    tanggal_masuk: null,
    kontak_darurat: '',
    catatan: '',
    pembayaran: []
  }

  for (const line of lines) {
    // 1. Kamar
    const mKamar = line.match(/(?:Data\s+Kamar\s+Kost|Kamar)\s*[:=]?\s*([A-Za-z0-9\-]+)/i)
    if (mKamar && !result.nomor_kamar) {
      result.nomor_kamar = mKamar[1].trim()
      continue
    }

    // 2. Nama
    const mNama = line.match(/^Nama\s*[:=]\s*(.+)$/i)
    if (mNama) {
      result.nama = mNama[1].trim()
      continue
    }

    // 3. Alamat
    const mAlamat = line.match(/^Alamat\s*[:=]\s*(.+)$/i)
    if (mAlamat) {
      result.alamat = mAlamat[1].trim()
      continue
    }

    // 4. No. HP
    const mHp = line.match(/^(?:No\.?\s*HP|Nomor\s*HP|No\s*Telepon|No\s*Telp|No\s*WA)\s*[:=]\s*(.+)$/i)
    if (mHp) {
      const v = mHp[1].trim()
      result.nomor_hp = (v === '--' || v === '-') ? '' : v
      continue
    }

    // 5. Tgl. Masuk
    const mTglMasuk = line.match(/^(?:Tgl\.?\s*Masuk|Tanggal\s*Masuk)\s*[:=]\s*(.+)$/i)
    if (mTglMasuk) {
      result.tanggal_masuk = parseIndoDate(mTglMasuk[1].trim())
      continue
    }

    // 6. HP Family / Kontak Darurat
    const mFamily = line.match(/^(?:HP\s*Family|Kontak\s*Darurat|No\s*Family|Keluarga)\s*[:=]\s*(.+)$/i)
    if (mFamily) {
      const v = mFamily[1].trim()
      result.kontak_darurat = (v === '--' || v === '-') ? '' : v
      continue
    }

    // 7. Catatan
    const mCatatan = line.match(/^Catatan\s*[:=]\s*(.+)$/i)
    if (mCatatan) {
      const v = mCatatan[1].trim()
      result.catatan = (v === '--' || v === '-') ? '' : v
      continue
    }

    // 8. Baris Pembayaran
    const payItem = parsePaymentLine(line)
    if (payItem) {
      result.pembayaran.push(payItem)
    }
  }

  return result
}
