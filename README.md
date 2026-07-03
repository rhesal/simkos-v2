# SimKos — Sistem Manajemen Kos 🏠

Aplikasi Progressive Web App (PWA) untuk manajemen kos-kosan. Dibangun untuk memudahkan pemilik kos dalam mengelola keuangan, inventaris, dan status penghuni.

## Tech Stack

- **Vue.js 3** + Composition API
- **Vite** — Build tool ultra-cepat
- **Tailwind CSS v4** — Utility-first CSS
- **Vue Router 4** — Client-side routing
- **Vite PWA Plugin** — Offline support & installable

## Fitur (Fase 1)

- [x] Halaman Beranda dengan ringkasan kos
- [x] Dropdown pemilih lokasi kos
- [x] Kartu ringkasan sisa kas bulan berjalan
- [x] Tombol aksi Catat Uang Masuk & Keluar
- [x] Daftar status kamar dengan indikator warna
- [x] Bottom Navigation Bar (Beranda, Keuangan, Inventaris)
- [x] PWA-ready (installable, offline-capable)

## Desain

- **Tema:** Akuntan Profesional
- **Mobile-First** dengan UI chunky untuk aksesibilitas
- **Palet Warna:**
  - Background: `#F8F9FA` (Putih Tulang)
  - Header/Primary: `#1E3A8A` (Navy Blue)
  - Income: `#10B981` (Hijau)
  - Expense: `#EF4444` (Merah)

## Setup & Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Node Version

Project ini membutuhkan **Node.js v20+**. Gunakan `nvm use` untuk otomatis menggunakan versi yang benar.

## License

MIT
