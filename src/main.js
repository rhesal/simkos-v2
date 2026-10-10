import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { initStorageAuthListener } from './lib/storage.js'

// Kosongkan cache signed URL saat logout / ganti user
initStorageAuthListener()

// --- Create App ---
const app = createApp(App)
app.use(router)
app.mount('#app')
