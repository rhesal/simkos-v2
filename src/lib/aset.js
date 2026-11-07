/**
 * SimKos — Modul Aset & Inventaris Helper
 * Algoritma, validasi alokasi area, dan status kelengkapan data aset.
 */

/**
 * Menghitung alokasi proporsional luas bersama untuk pola penggunaan campuran.
 * 
 * Aturan matematis:
 * - p = luas_usaha / (luas_usaha + luas_nonusaha)
 * - luas_bersama_usaha = p * luas_bersama
 * - luas_usaha_efektif = luas_usaha + luas_bersama_usaha
 * - luas_total = luas_usaha + luas_nonusaha + luas_bersama
 * - porsi_usaha_persen = (luas_usaha_efektif / luas_total) * 100 = p * 100
 * 
 * Penanganan penyebut nol:
 * Jika (luas_usaha + luas_nonusaha) === 0, fungsi TIDAK menghasilkan persentase otomatis
 * (mengembalikan null untuk porsi dan luas efektif, dengan isZeroDenominator: true).
 */
export function calculateSharedAreaAllocation(luasUsaha, luasNonUsaha, luasBersama = 0) {
  const u = parseFloat(luasUsaha) || 0
  const n = parseFloat(luasNonUsaha) || 0
  const b = parseFloat(luasBersama) || 0

  const luasTotal = u + n + b
  const denominator = u + n

  if (denominator <= 0) {
    return {
      luasUsaha: u,
      luasNonUsaha: n,
      luasBersama: b,
      luasTotal,
      luasUsahaEfektif: null,
      luasNonUsahaEfektif: null,
      ratioUsaha: null,
      porsiUsahaPersen: null,
      isZeroDenominator: true,
      canCalculate: false,
    }
  }

  const p = u / denominator
  const luasBersamaUsaha = p * b
  const luasBersamaNonUsaha = (1 - p) * b
  const luasUsahaEfektif = u + luasBersamaUsaha
  const luasNonUsahaEfektif = n + luasBersamaNonUsaha
  const porsiUsahaPersen = p * 100

  return {
    luasUsaha: u,
    luasNonUsaha: n,
    luasBersama: b,
    luasTotal,
    luasUsahaEfektif: Math.round(luasUsahaEfektif * 100) / 100,
    luasNonUsahaEfektif: Math.round(luasNonUsahaEfektif * 100) / 100,
    ratioUsaha: p,
    porsiUsahaPersen: Math.round(porsiUsahaPersen * 100) / 100,
    isZeroDenominator: false,
    canCalculate: true,
  }
}

/**
 * Pengecekan kelengkapan data aset untuk indikator draf.
 */
export function inspectAssetCompleteness(asset, components = []) {
  const missing = []

  if (!asset.nama_aset || !asset.nama_aset.trim()) {
    missing.push('Nama aset')
  }

  // Cek komponen perolehan awal
  const mainComp = components.find(c => c.jenis_pekerjaan === 'bangunan_awal' || c.jenis_pekerjaan === 'perolehan_baru') || components[0]

  if (!mainComp) {
    missing.push('Data perolehan awal')
  } else {
    if (mainComp.biaya_perolehan === null || mainComp.biaya_perolehan === undefined) {
      missing.push('Biaya perolehan')
    }
    if (!mainComp.tanggal_siap_guna && !mainComp.tahun_perolehan) {
      missing.push('Tanggal atau tahun perolehan')
    }
    if (asset.kategori_aset === 'gedung' && mainComp.pola_penggunaan === 'campuran') {
      const area = calculateSharedAreaAllocation(mainComp.luas_khusus_usaha, mainComp.luas_nonusaha, mainComp.luas_bersama)
      if (!area.canCalculate) {
        missing.push('Luas area khusus kos/keluarga')
      }
    }
    if (mainComp.metode_penyusutan === 'garis_lurus' && !mainComp.masa_manfaat_bulan) {
      missing.push('Masa manfaat penyusutan')
    }
  }

  return {
    isComplete: missing.length === 0,
    missingFields: missing,
  }
}

/**
 * Label human-readable untuk kategori aset.
 */
export function getAssetCategoryLabel(kategori) {
  const map = {
    tanah: 'Tanah',
    gedung: 'Gedung',
    fasilitas_kamar: 'Fasilitas Kamar',
    fasilitas_umum: 'Fasilitas Umum',
    kendaraan: 'Kendaraan',
    elektronik_kantor: 'Elektronik Kantor',
    lainnya: 'Lainnya',
  }
  return map[kategori] || 'Aset'
}

/**
 * Icon emoji visual untuk kategori aset.
 */
export function getAssetCategoryIcon(kategori) {
  const map = {
    tanah: '🏞️',
    gedung: '🏢',
    fasilitas_kamar: '🛏️',
    fasilitas_umum: '🚿',
    kendaraan: '🛵',
    elektronik_kantor: '💻',
    lainnya: '📦',
  }
  return map[kategori] || '📦'
}
