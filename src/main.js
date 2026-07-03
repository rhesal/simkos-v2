import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './style.css'

// --- Route Definitions ---
const routes = [
  {
    path: '/',
    name: 'Beranda',
    component: () => import('./views/BerandaView.vue'),
  },
  {
    path: '/keuangan',
    name: 'Keuangan',
    component: () => import('./views/KeuanganView.vue'),
  },
  {
    path: '/inventaris',
    name: 'Inventaris',
    component: () => import('./views/InventarisView.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// --- Create App ---
const app = createApp(App)
app.use(router)
app.mount('#app')
