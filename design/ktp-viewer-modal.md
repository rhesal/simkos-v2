# Spek UI — Modal Lihat KTP (simkos-v2)
Versi v0.1 · 2026-10-10 · Terkait PR #1 (fix/secure-ktp-storage). Sketsa ini untuk dirapikan nanti dan tidak menahan PR.

## Pemicu
Tombol "Lihat KTP" di detail penghuni (ikon mata). Tidak ada link `<a href>` atau tab baru.

## Wireframe
```
+-------------------------------------------+
| KTP — <Nama Penghuni>                 [X] |
|-------------------------------------------|
|                                           |
|         [ gambar KTP, fit-to-width ]      |
|                                           |
|-------------------------------------------|
|                                  [Tutup]  |
+-------------------------------------------+
```

## State
| State | Tampilan |
|-------|----------|
| Loading | Skeleton abu-abu seukuran rasio KTP (85.6:54) + teks "Memuat KTP…" |
| Sukses | Gambar dari blob URL, `object-fit: contain`, alt="Foto KTP penghuni" |
| Error | Ikon peringatan + "KTP gagal dimuat." + tombol [Coba lagi] (panggil ulang `download()`) |
| Tidak ada KTP | Tombol "Lihat KTP" disembunyikan/disabled dengan tooltip "Belum ada KTP" |

## Perilaku
- Tutup lewat [X], [Tutup], tombol Esc, atau klik backdrop; semua jalur memanggil `revokeObjectURL`.
- Event `SIGNED_OUT`: modal langsung tertutup dan blob dibuang.
- Nonaktifkan klik kanan "simpan gambar" tidak perlu (tidak efektif); cukup tidak sediakan tombol unduh.
- Fokus terkunci di dalam modal (focus trap), fokus awal di tombol [X], kembali ke tombol "Lihat KTP" setelah ditutup.

## Token
- Lebar modal: maks 560px (desktop), 100% − 32px (mobile)
- Radius 12px, padding 16/24, backdrop rgba(0,0,0,.6)
- Teks error memakai warna error dari tema yang ada
