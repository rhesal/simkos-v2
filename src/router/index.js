import { createRouter, createWebHistory } from 'vue-router'

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
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
