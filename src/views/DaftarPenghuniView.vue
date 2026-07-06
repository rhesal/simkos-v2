<template>
  <div class="min-h-screen bg-bg-primary pb-24">
    <!-- Header -->
    <header class="bg-navy rounded-b-4xl px-6 pt-12 pb-8 text-white shadow-lg max-w-lg mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-3xl font-black tracking-tight">Denah Kos</h1>
        <span class="bg-white/10 px-4 py-1.5 rounded-full text-sm font-bold">
          Room Grid
        </span>
      </div>

      <!-- Search & Filter Controls -->
      <div class="space-y-4">
        <!-- Search Input and Add Button Chunky Navy -->
        <div class="flex items-end gap-3">
          <div class="flex-1 space-y-1.5">
            <label for="search-penghuni" class="block text-xs font-bold text-blue-200">Cari Nama Penghuni</label>
            <input
              id="search-penghuni"
              v-model="searchQuery"
              type="text"
              placeholder="Cari..."
              class="w-full px-4 py-3.5 bg-white border-2 border-white/20 rounded-xl focus:outline-none focus:border-white text-base font-medium text-gray-800 shadow-sm"
            />
          </div>
          <router-link
            to="/tambah-penghuni"
            class="px-4 py-3.5 bg-white text-navy font-bold rounded-xl flex items-center justify-center gap-1.5 shadow active:scale-95 transition-transform"
          >
            <span>➕</span> Daftar
          </router-link>
        </div>

        <!-- Filters Grid -->
        <div class="grid grid-cols-2 gap-3">
          <!-- Location Filter -->
          <div class="space-y-1.5">
            <label for="location-filter" class="block text-xs font-bold text-blue-200">Lokasi Kos</label>
            <div class="relative">
              <select
                id="location-filter"
                v-model="selectedLocationFilter"
                class="w-full px-4 py-3 bg-white border-2 border-white/20 rounded-xl appearance-none focus:outline-none focus:border-white text-sm font-bold text-gray-800 shadow-sm"
              >
                <option value="ALL">🏢 Semua Lokasi</option>
                <option
                  v-for="loc in locationsList"
                  :key="loc.id"
                  :value="loc.id"
                >
                  🏠 {{ loc.nama_lokasi }}
                </option>
              </select>
              <div class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Status Filter Dropdown -->
          <div class="space-y-1.5">
            <label for="status-filter" class="block text-xs font-bold text-blue-200">Status Kamar</label>
            <div class="relative">
              <select
                id="status-filter"
                v-model="statusFilter"
                class="w-full px-4 py-3 bg-white border-2 border-white/20 rounded-xl appearance-none focus:outline-none focus:border-white text-sm font-bold text-gray-800 shadow-sm"
              >
                <option value="Semua">📋 Semua</option>
                <option value="Terisi">🟢 Terisi</option>
                <option value="Kosong">⚪ Kosong</option>
              </select>
              <div class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Content Area -->
    <div class="px-6 py-6 space-y-6 max-w-lg mx-auto">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 gap-3">
        <svg class="w-10 h-10 animate-spin text-navy" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span class="text-base font-semibold text-text-secondary">Memuat denah kos...</span>
      </div>

      <template v-else>
        <!-- Legend Status -->
        <div class="flex flex-wrap gap-x-5 gap-y-2 bg-white p-4 rounded-[var(--radius-card)] border border-border shadow-sm">
          <span class="flex items-center gap-2.5 text-sm font-bold text-text-primary">
            <span class="w-4 h-4 rounded-full bg-green-500 shadow-sm"></span> Terisi
          </span>
          <span class="flex items-center gap-2.5 text-sm font-bold text-text-primary">
            <span class="w-4 h-4 rounded-full bg-gray-300 shadow-sm"></span> Kosong
          </span>
        </div>

        <!-- Empty State -->
        <div
          v-if="filteredRooms.length === 0"
          class="bg-white rounded-[var(--radius-card)] border-2 border-dashed border-border p-12 text-center"
        >
          <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </div>
          <p class="text-lg font-bold text-text-primary mb-1">Kamar tidak ditemukan</p>
          <p class="text-sm text-text-secondary">Tidak ada kamar yang sesuai dengan filter.</p>
        </div>

        <!-- Rooms Row List -->
        <div v-else class="flex flex-col gap-3">
          <div
            v-for="room in filteredRooms"
            :key="room.id"
            @click="handleRoomClick(room)"
            class="bg-white rounded-[var(--radius-card)] border-2 border-border p-4 flex items-center justify-between gap-4 cursor-pointer shadow-sm active:scale-[0.98] hover:shadow transition-all duration-150 relative overflow-hidden"
          >
            <!-- Left Side: Square Room Number Box -->
            <div
              class="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-black flex-shrink-0 shadow-sm"
              :class="room.activeRental ? 'bg-green-500' : 'bg-slate-400'"
            >
              {{ room.nomor_kamar }}
            </div>

            <!-- Middle Side: Main Info -->
            <div class="flex-1 min-w-0 flex flex-col justify-center">
              <template v-if="room.activeRental">
                <p class="text-base font-extrabold text-text-primary truncate">
                  {{ room.activeRental.tenants?.nama_lengkap }}
                </p>
                <p class="text-xs font-semibold text-text-secondary mt-0.5">
                  {{ formatCurrency(room.harga_bulanan || 0) }}/bulan
                </p>
              </template>
              <template v-else>
                <p class="text-base font-extrabold text-text-primary truncate">
                  Kamar {{ room.nomor_kamar }}
                </p>
                <p class="text-xs font-semibold text-text-secondary mt-0.5">
                  {{ formatCurrency(room.harga_bulanan || 0) }}/bulan
                </p>
              </template>
            </div>

            <!-- Right Side: Status Badge -->
            <div class="flex-shrink-0">
              <template v-if="room.activeRental">
                <span
                  class="px-3 py-1.5 rounded-full text-xs font-black inline-block border shadow-sm"
                  :class="room.activeRental.diffDays < 0
                    ? 'bg-red-100 text-red-700 border-red-200 animate-pulse'
                    : room.activeRental.diffDays === 0
                      ? 'bg-red-50 text-red-600 border-red-100'
                      : 'bg-amber-100 text-amber-800 border-amber-200'"
                >
                  <template v-if="room.activeRental.diffDays < 0">
                    🔴 Lewat {{ Math.abs(room.activeRental.diffDays) }} Hari
                  </template>
                  <template v-else-if="room.activeRental.diffDays === 0">
                    ⚠️ Hari Ini
                  </template>
                  <template v-else>
                    ⏳ H-{{ room.activeRental.diffDays }}
                  </template>
                </span>
              </template>
              <template v-else>
                <span class="px-4 py-1.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500 border border-gray-200 inline-block shadow-sm">
                  Kosong
                </span>
              </template>
            </div>

            <!-- Tiny Location Info overlay -->
            <span class="absolute right-3 top-1 text-[8px] font-bold text-text-muted opacity-30">
              {{ room.locations?.nama_lokasi }}
            </span>
          </div>
        </div>
      </template>
    </div>

    <!-- Modal 1: Detail Penghuni (Terisi) -->
    <div
      v-if="showDetailModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 pb-24 bg-navy/60 backdrop-blur-sm animate-fade-in"
    >
      <div class="bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl w-full max-w-md p-6 space-y-5 max-h-[80vh] overflow-y-auto pb-8 animate-fade-in-up">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b-2 border-border pb-3">
          <div>
            <h3 class="text-xl font-black text-text-primary tracking-tight">
              🏠 Detail Kamar {{ selectedRoom?.nomor_kamar }}
            </h3>
            <p class="text-xs font-bold text-text-secondary mt-0.5">
              {{ selectedRoom?.locations?.nama_lokasi }}
            </p>
          </div>
          <button @click="showDetailModal = false" class="text-text-muted hover:text-text-primary text-xl font-bold">✕</button>
        </div>

        <!-- Detail Data -->
        <div class="space-y-3.5 pb-6">
          <div class="bg-gray-50 border border-border rounded-xl p-4 space-y-2.5 text-sm font-semibold text-text-primary">
            <div class="flex items-center justify-between">
              <span class="text-text-secondary">Nama Penghuni</span>
              <span class="font-extrabold">{{ selectedRoom?.activeRental?.tenants?.nama_lengkap }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-text-secondary">Nomor HP</span>
              <span class="font-extrabold text-navy">📞 {{ selectedRoom?.activeRental?.tenants?.nomor_hp || '-' }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-text-secondary">Harga Sewa</span>
              <span class="font-extrabold text-green-700">{{ formatCurrency(selectedRoom?.harga_bulanan || 0) }}/bulan</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-text-secondary">Tipe Sewa</span>
              <span class="capitalize bg-navy/5 text-navy px-2 py-0.5 rounded text-xs font-black">{{ selectedRoom?.activeRental?.tipe_sewa }}</span>
            </div>
            <div class="flex items-center justify-between pt-2 border-t border-gray-200 text-xs">
              <span class="text-text-secondary">Mulai Masuk</span>
              <span>{{ formatDateDisplay(selectedRoom?.activeRental?.tanggal_masuk) }}</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-text-secondary">Jatuh Tempo</span>
              <span class="font-bold text-navy">{{ formatDateDisplay(selectedRoom?.activeRental?.tanggal_jatuh_tempo) }}</span>
            </div>
          </div>
        </div>

        <!-- Actions Grid (WhatsApp, Edit, Checkout, Hapus) -->
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <!-- WhatsApp -->
            <button
              @click="hubungiWhatsApp(selectedRoom?.activeRental?.tenants?.nomor_hp)"
              class="flex items-center justify-center gap-2 py-3 bg-white border-2 border-green-500 hover:bg-green-50 active:scale-95 text-green-600 rounded-xl text-sm font-bold shadow-sm transition-all duration-150"
            >
              <svg class="w-5 h-5 mr-2 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.452 5.714 1.456h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <span>WhatsApp</span>
            </button>

            <!-- Edit -->
            <button
              @click="triggerEditModal"
              class="flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-700 rounded-xl text-sm font-bold shadow-sm transition-all duration-150 border border-gray-200"
            >
              ✏️ Edit Data
            </button>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <!-- Checkout -->
            <button
              @click="checkOutPenghuni(selectedRoom?.activeRental)"
              class="flex items-center justify-center gap-2 py-3 bg-red-50 hover:bg-red-100 active:scale-95 text-red-600 rounded-xl text-sm font-bold shadow-sm transition-all duration-150 border border-red-200"
            >
              🔴 Checkout
            </button>

            <!-- Hapus -->
            <button
              @click="hapusRental(selectedRoom?.activeRental)"
              class="flex items-center justify-center gap-2 py-3 border border-red-500 text-red-500 hover:bg-red-50 active:scale-95 rounded-xl text-xs font-bold transition-all duration-150"
            >
              🗑️ Hapus Sewa
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal 2: Kamar Kosong (Siap Huni) -->
    <div
      v-if="showEmptyModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 pb-24 bg-navy/60 backdrop-blur-sm animate-fade-in"
    >
      <div class="bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl w-full max-w-md p-6 space-y-5 max-h-[80vh] overflow-y-auto pb-8 animate-fade-in-up">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b-2 border-border pb-3">
          <div>
            <h3 class="text-xl font-black text-text-primary tracking-tight">
              ⚪ Kamar {{ selectedRoom?.nomor_kamar }} Kosong
            </h3>
            <p class="text-xs font-bold text-text-secondary mt-0.5">
              {{ selectedRoom?.locations?.nama_lokasi }}
            </p>
          </div>
          <button @click="showEmptyModal = false" class="text-text-muted hover:text-text-primary text-xl font-bold">✕</button>
        </div>

        <div class="text-center py-6 space-y-3 pb-6">
          <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-3xl">🔑</div>
          <p class="text-base font-extrabold text-text-primary">Kamar ini sedang kosong & siap dihuni.</p>
          <p class="text-xs font-bold text-text-secondary">Harga Standar: {{ formatCurrency(selectedRoom?.harga_bulanan || 0) }}/bulan</p>
        </div>

        <div class="flex gap-3">
          <button
            @click="showEmptyModal = false"
            class="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl active:scale-95 transition-transform"
          >
            Tutup
          </button>
          <router-link
            :to="`/tambah-penghuni?location_id=${selectedRoom?.location_id}&room_id=${selectedRoom?.id}`"
            class="flex-1 py-3 bg-navy text-white text-center font-bold rounded-xl active:scale-95 transition-transform shadow flex items-center justify-center gap-1.5"
          >
            ➕ Daftarkan
          </router-link>
        </div>
      </div>
    </div>

    <!-- Modal 3: Edit Data Sewa (Terisi) -->
    <div
      v-if="showEditModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 pb-24 bg-navy/60 backdrop-blur-sm animate-fade-in"
    >
      <div class="bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[80vh] overflow-y-auto pb-8 animate-fade-in-up">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b-2 border-border pb-3">
          <h3 class="text-xl font-black text-text-primary flex items-center gap-2">
            <span>✏️</span> Edit Data Sewa
          </h3>
          <button @click="showEditModal = false" class="text-text-muted hover:text-text-primary text-xl font-bold">✕</button>
        </div>

        <!-- Modal Fields -->
        <div class="space-y-4 py-2 pb-6">
          <!-- Nama Lengkap -->
          <div class="space-y-1.5">
            <label for="edit-nama" class="block text-sm font-bold text-text-primary">Nama Lengkap</label>
            <input
              id="edit-nama"
              v-model="editForm.nama_lengkap"
              type="text"
              class="w-full bg-card border-2 border-border rounded-xl px-4 py-3 text-base font-semibold text-text-primary focus:border-navy focus:outline-none"
            />
          </div>

          <!-- Nomor HP -->
          <div class="space-y-1.5">
            <label for="edit-hp" class="block text-sm font-bold text-text-primary">Nomor HP</label>
            <input
              id="edit-hp"
              v-model="editForm.nomor_hp"
              type="tel"
              class="w-full bg-card border-2 border-border rounded-xl px-4 py-3 text-base font-semibold text-text-primary focus:border-navy focus:outline-none"
            />
          </div>

          <!-- Harga Sewa Bulanan -->
          <div class="space-y-1.5">
            <label for="edit-harga" class="block text-sm font-bold text-text-primary">Harga Sewa Bulanan</label>
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">Rp</span>
              <input
                id="edit-harga"
                v-model.number="editForm.harga_bulanan"
                type="number"
                class="w-full bg-card border-2 border-border rounded-xl pl-12 pr-4 py-3 text-base font-semibold text-text-primary focus:border-navy focus:outline-none"
              />
            </div>
          </div>

          <!-- Tanggal Jatuh Tempo (Overlay format) -->
          <div class="space-y-1.5">
            <label for="edit-tgl-tempo" class="block text-sm font-bold text-text-primary">Tanggal Jatuh Tempo</label>
            <div class="relative rounded-xl border-2 border-border bg-card focus-within:border-navy transition-all duration-200 shadow-sm">
              <!-- Visual Text Overlay -->
              <div class="w-full px-4 py-3 text-base font-semibold text-text-primary flex items-center justify-between pointer-events-none">
                <span>{{ editForm.tanggal_jatuh_tempo ? formatDateDisplay(editForm.tanggal_jatuh_tempo) : 'Pilih Tanggal' }}</span>
                <span class="text-text-muted">📅</span>
              </div>
              <!-- Native Date Input -->
              <input
                id="edit-tgl-tempo"
                v-model="editForm.tanggal_jatuh_tempo"
                type="date"
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>
          </div>
        </div>

        <!-- Modal Footer Actions -->
        <div class="flex gap-3 pt-3 border-t-2 border-border">
          <button
            @click="showEditModal = false"
            class="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl active:scale-95 transition-transform"
          >
            Batal
          </button>
          <button
            @click="updatePenghuni"
            class="flex-1 py-3 bg-navy text-white font-bold rounded-xl active:scale-95 transition-transform"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom Navigation Bar -->
    <BottomNav />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { supabase } from '../supabase.js'
import BottomNav from '../components/BottomNav.vue'

const isLoading = ref(true)
const roomsList = ref([])
const locationsList = ref([])
const selectedLocationFilter = ref('ALL')
const searchQuery = ref('')
const statusFilter = ref('Semua')

// Modal visibility & selected room state
const showDetailModal = ref(false)
const showEmptyModal = ref(false)
const showEditModal = ref(false)
const selectedRoom = ref(null)

// Edit Form
const editForm = reactive({
  rentalId: null,
  tenantId: null,
  roomId: null,
  nama_lengkap: '',
  nomor_hp: '',
  harga_bulanan: 0,
  tanggal_jatuh_tempo: ''
})

// Fetch Locations on Mount
async function loadLocations() {
  try {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('nama_lokasi', { ascending: true })

    if (error) throw error
    locationsList.value = data || []
  } catch (err) {
    console.error('[SimKos] Gagal fetch lokasi:', err)
  }
}

// Fetch all rooms with joined rental/tenant info
async function loadRoomsAndRentals() {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('*, locations(nama_lokasi), rentals(*, tenants(*))')
      .order('nomor_kamar', { ascending: true })

    if (error) throw error

    // Post-process to map active rental and days left
    roomsList.value = (data || []).map(room => {
      const activeRental = room.rentals?.find(r => r.status_aktif === true) || null
      if (activeRental) {
        activeRental.diffDays = getDiffDays(activeRental.tanggal_jatuh_tempo)
      }
      return {
        ...room,
        activeRental
      }
    })
  } catch (err) {
    console.error('[SimKos] Gagal fetch denah kamar:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await loadLocations()
  await loadRoomsAndRentals()
})

// Filtered Rooms
const filteredRooms = computed(() => {
  let list = roomsList.value

  // 1. Location filter
  if (selectedLocationFilter.value !== 'ALL') {
    list = list.filter(r => r.location_id === selectedLocationFilter.value)
  }

  // 2. Search filter (if query exists, check if name matches active tenant)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(r => {
      const tenantName = r.activeRental?.tenants?.nama_lengkap || ''
      return tenantName.toLowerCase().includes(q)
    })
  }

  // 3. Status filter
  if (statusFilter.value === 'Terisi') {
    list = list.filter(r => r.activeRental !== null)
  } else if (statusFilter.value === 'Kosong') {
    list = list.filter(r => r.activeRental === null)
  }

  return list
})

// Room Click Handler
function handleRoomClick(room) {
  selectedRoom.value = room
  if (room.activeRental) {
    showDetailModal.value = true
  } else {
    showEmptyModal.value = true
  }
}

// Open Edit Modal from Detail Modal
function triggerEditModal() {
  const rental = selectedRoom.value?.activeRental
  if (!rental) return

  editForm.rentalId = rental.id
  editForm.tenantId = rental.tenant_id
  editForm.roomId = selectedRoom.value.id
  editForm.nama_lengkap = rental.tenants?.nama_lengkap || ''
  editForm.nomor_hp = rental.tenants?.nomor_hp || ''
  editForm.harga_bulanan = selectedRoom.value.harga_bulanan || 0
  editForm.tanggal_jatuh_tempo = rental.tanggal_jatuh_tempo || ''

  showDetailModal.value = false
  showEditModal.value = true
}

// WhatsApp Quick Action
function hubungiWhatsApp(noHp) {
  if (!noHp) {
    alert('Nomor HP tidak terdaftar!')
    return
  }
  let formatted = noHp.replace(/\D/g, '') // remove non-digits
  if (formatted.startsWith('0')) {
    formatted = '62' + formatted.substring(1)
  }
  window.open(`https://wa.me/${formatted}`, '_blank')
}

// Update Tenant Data (CRUD - Update)
async function updatePenghuni() {
  if (!editForm.nama_lengkap.trim() || !editForm.nomor_hp.trim()) {
    alert('Nama dan Nomor HP tidak boleh kosong!')
    return
  }

  isLoading.value = true
  showEditModal.value = false

  try {
    // 1. Update tenants table
    if (editForm.tenantId) {
      const { error: tenantError } = await supabase
        .from('tenants')
        .update({
          nama_lengkap: editForm.nama_lengkap.trim(),
          nomor_hp: editForm.nomor_hp.trim()
        })
        .eq('id', editForm.tenantId)

      if (tenantError) throw tenantError
    }

    // 2. Update rooms table (harga_bulanan)
    if (editForm.roomId) {
      const { error: roomError } = await supabase
        .from('rooms')
        .update({
          harga_bulanan: editForm.harga_bulanan
        })
        .eq('id', editForm.roomId)

      if (roomError) throw roomError
    }

    // 3. Update rentals table (tanggal_jatuh_tempo)
    if (editForm.rentalId) {
      const { error: rentalError } = await supabase
        .from('rentals')
        .update({
          tanggal_jatuh_tempo: editForm.tanggal_jatuh_tempo
        })
        .eq('id', editForm.rentalId)

      if (rentalError) throw rentalError
    }

    alert('Data sewa berhasil diperbarui!')
    await loadRoomsAndRentals()
  } catch (err) {
    alert(`Gagal memperbarui data: ${err.message}`)
    console.error('[SimKos] Update error:', err)
    isLoading.value = false
  }
}

// Checkout Process (Sequential DB operations)
async function checkOutPenghuni(rental) {
  if (!rental) return
  const confirmCheckout = confirm(`Apakah Anda yakin ingin memproses Checkout untuk ${rental.tenants?.nama_lengkap || 'penghuni ini'}? Kamar ini akan otomatis kosong kembali.`)
  if (!confirmCheckout) return

  isLoading.value = true
  showDetailModal.value = false

  try {
    // 1. Update status sewa di tabel rentals
    const { error: rentalError } = await supabase
      .from('rentals')
      .update({ status_aktif: false })
      .eq('id', rental.id)

    if (rentalError) throw new Error(`Gagal memperbarui status sewa: ${rentalError.message}`)

    // 2. Update status kamar di tabel rooms menjadi 'Kosong'
    if (rental.room_id) {
      const { error: roomError } = await supabase
        .from('rooms')
        .update({ status_kamar: 'Kosong' })
        .eq('id', rental.room_id)

      if (roomError) throw new Error(`Gagal mengosongkan status kamar: ${roomError.message}`)
    }

    alert('Checkout berhasil diproses!')
    await loadRoomsAndRentals()
  } catch (err) {
    alert(`Gagal memproses checkout: ${err.message}`)
    console.error('[SimKos] Checkout error:', err)
    isLoading.value = false
  }
}

// Delete Rental Record (CRUD - Delete)
async function hapusRental(rental) {
  if (!rental) return
  const confirmDelete = confirm(`Apakah Anda yakin ingin menghapus data sewa untuk ${rental.tenants?.nama_lengkap || 'penghuni ini'}? Tindakan ini akan menghapus riwayat sewa ini dari database dan mengosongkan status kamar.`)
  if (!confirmDelete) return

  isLoading.value = true
  showDetailModal.value = false

  try {
    // 1. Hapus dari rentals
    const { error: deleteError } = await supabase
      .from('rentals')
      .delete()
      .eq('id', rental.id)

    if (deleteError) throw deleteError

    // 2. Kembalikan status kamar menjadi 'Kosong'
    if (rental.room_id) {
      const { error: roomError } = await supabase
        .from('rooms')
        .update({ status_kamar: 'Kosong' })
        .eq('id', rental.room_id)

      if (roomError) throw roomError
    }

    alert('Data sewa berhasil dihapus!')
    await loadRoomsAndRentals()
  } catch (err) {
    const errorMsg = String(err.message || err).toLowerCase()
    if (errorMsg.includes('foreign key constraint') || errorMsg.includes('incomes_rental_id_fkey')) {
      alert("Gagal Menghapus: Penghuni ini memiliki riwayat transaksi di menu Keuangan. Demi keamanan pembukuan, silakan gunakan tombol 'Checkout' sebagai gantinya.")
    } else {
      alert(`Gagal menghapus data sewa: ${err.message}`)
    }
    console.error('[SimKos] Delete error:', err)
    isLoading.value = false
  }
}

// Helper: Sisa Hari Jatuh Tempo
function getDiffDays(tanggalJatuhTempo) {
  if (!tanggalJatuhTempo) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const parts = tanggalJatuhTempo.split('-')
  if (parts.length !== 3) return null
  
  const dueDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
  dueDate.setHours(0, 0, 0, 0)
  
  const diffTime = dueDate.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// Helpers
function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '-'
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}
</script>
