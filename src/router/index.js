import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '../supabase.js'

const routes = [
  {
    path: '/',
    name: 'Beranda',
    component: () => import('../views/BerandaView.vue'),
  },
  {
    path: '/keuangan',
    name: 'Keuangan',
    component: () => import('../views/KeuanganView.vue'),
  },
  {
    path: '/inventaris',
    name: 'Inventaris',
    component: () => import('../views/InventarisView.vue'),
  },
  {
    path: '/tambah-lokasi',
    name: 'TambahLokasi',
    component: () => import('../views/TambahLokasiView.vue'),
  },
  {
    path: '/tambah-kamar',
    name: 'TambahKamar',
    component: () => import('../views/TambahKamarView.vue'),
  },
  {
    path: '/tambah-penghuni',
    name: 'TambahPenghuni',
    component: () => import('../views/TambahPenghuniView.vue'),
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Navigation Guard
router.beforeEach(async (to, from, next) => {
  const { data: { session } } = await supabase.auth.getSession()

  if (to.name !== 'Login' && !session) {
    // Belum login & mencoba masuk ke halaman selain login -> tendang ke login
    next({ name: 'Login' })
  } else if (to.name === 'Login' && session) {
    // Sudah login & mencoba masuk ke halaman login -> arahkan ke Beranda
    next({ name: 'Beranda' })
  } else {
    next()
  }
})

export default router
