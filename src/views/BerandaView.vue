<template>
  <div>
    <!-- ========== HEADER DENGAN PEMILIH LOKASI ========== -->
    <header class="bg-navy text-white px-6 pt-5 pb-6 shadow-lg rounded-b-[1.5rem] space-y-5 animate-fade-in-up">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-extrabold tracking-tight">SimKos</h1>
          <p class="text-base text-blue-200 mt-1 font-medium">Sistem Manajemen Kos</p>
        </div>
        <div class="relative">
          <button
            @click="isSettingsOpen = !isSettingsOpen"
            class="w-13 h-13 rounded-full bg-white/15 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Pengaturan"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          <!-- Settings Dropdown Menu -->
          <div
            v-if="isSettingsOpen"
            class="absolute right-0 mt-3 w-64 bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl overflow-hidden z-50"
          >
            <router-link
              to="/tambah-lokasi"
              @click="isSettingsOpen = false"
              class="w-full px-5 py-4 text-left text-lg font-bold text-text-primary hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 border-b border-border"
            >
              <span class="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </span>
              Tambah Lokasi
            </router-link>
            <router-link
              to="/tambah-kamar"
              @click="isSettingsOpen = false"
              class="w-full px-5 py-4 text-left text-lg font-bold text-text-primary hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 border-b border-border"
            >
              <span class="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </span>
              Tambah Kamar
            </router-link>
            <router-link
              to="/tambah-penghuni"
              @click="isSettingsOpen = false"
              class="w-full px-5 py-4 text-left text-lg font-bold text-text-primary hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 border-b border-border"
            >
              <span class="w-10 h-10 rounded-xl bg-income/10 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-income" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                </svg>
              </span>
              Daftar Penghuni Baru
            </router-link>
            <button
              @click="handleLogout"
              class="w-full px-5 py-4 text-left text-lg font-bold text-expense hover:bg-red-50 active:bg-red-100 flex items-center gap-3"
            >
              <span class="w-10 h-10 rounded-xl bg-expense/10 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-expense" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </span>
              Keluar (Logout)
            </button>
          </div>
        </div>
      </div>

      <!-- Combo-box Pemilih Lokasi (Dinamis dari Supabase) -->
      <div class="relative">
        <!-- Loading state lokasi -->
        <div
          v-if="isLoadingLocations"
          class="w-full bg-white/10 border-2 border-white/20 rounded-[var(--radius-btn)]
                 px-5 py-4 flex items-center gap-3 text-lg font-bold text-white/60"
        >
          <svg class="w-6 h-6 animate-spin text-white/50" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Memuat lokasi...</span>
        </div>

        <!-- Empty state lokasi -->
        <router-link
          v-else-if="locations.length === 0"
          to="/tambah-lokasi"
          class="w-full bg-white/10 hover:bg-white/15 border-2 border-dashed border-white/30 rounded-[var(--radius-btn)]
                 px-5 py-4 flex items-center justify-center gap-3 text-lg font-bold text-white
                 transition-all duration-200"
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span>Tambah Lokasi Pertama</span>
        </router-link>

        <!-- Dropdown pemilih lokasi -->
        <template v-else>
          <button
            @click="isDropdownOpen = !isDropdownOpen"
            class="w-full bg-white/10 hover:bg-white/15 active:bg-white/20 border-2 border-white/20 rounded-[var(--radius-btn)]
                   px-5 py-4 flex items-center justify-between text-lg font-bold text-white
                   transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-white/25"
          >
            <div class="flex items-center gap-3">
              <span class="text-2xl">🏠</span>
              <span>{{ selectedLocationName }}</span>
            </div>
            <svg
              class="w-6 h-6 text-white/80 transition-transform duration-200"
              :class="{ 'rotate-180': isDropdownOpen }"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              stroke-width="3"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          <!-- Dropdown Menu Items -->
          <div
            v-if="isDropdownOpen"
            class="absolute z-50 left-0 right-0 mt-2 bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl overflow-hidden"
          >
            <button
              v-for="loc in locations"
              :key="loc.id"
              @click="selectLocation(loc.id)"
              class="w-full px-5 py-4 text-left text-lg font-bold text-text-primary hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 border-b border-border last:border-0"
              :class="{ 'bg-navy/5': loc.id === selectedLocation }"
            >
              <span class="text-2xl">🏠</span>
              <span>{{ loc.nama_lokasi }}</span>
              <svg v-if="loc.id === selectedLocation" class="w-5 h-5 text-navy ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </button>
          </div>
        </template>
      </div>
    </header>

    <!-- ========== BODY LAYOUT WITH INCREASED PADDING & SPACING ========== -->
    <div class="px-6 py-6 space-y-6 max-w-lg mx-auto">

      <!-- ========== CASH SUMMARY CARD ========== -->
      <div class="animate-fade-in-up animate-stagger-1">
        <div class="bg-navy rounded-[var(--radius-card)] p-6 text-white shadow-xl relative overflow-hidden">
          <!-- Decorative Background Elements -->
          <div class="absolute -right-8 -top-8 w-36 h-36 bg-white/5 rounded-full"></div>
          <div class="absolute -right-4 top-14 w-24 h-24 bg-white/5 rounded-full"></div>

          <div class="relative z-10 space-y-5">
            <div class="flex items-center gap-2.5">
              <svg class="w-6 h-6 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
              <p class="text-base font-semibold text-blue-200">Sisa Kas · {{ currentMonth }}</p>
            </div>

            <p class="text-4xl font-extrabold tracking-tight">
              {{ formatCurrency(currentCash.sisa) }}
            </p>

            <div class="flex items-center justify-between gap-4 pt-5 border-t border-white/15">
              <!-- Income Total -->
              <div class="flex items-center gap-3">
                <span class="w-11 h-11 rounded-xl bg-income/20 flex items-center justify-center flex-shrink-0">
                  <svg class="w-7 h-7 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                  </svg>
                </span>
                <div>
                  <p class="text-sm font-bold text-blue-200">Masuk</p>
                  <p class="text-lg font-extrabold text-green-300 mt-0.5">{{ formatCurrency(currentCash.masuk) }}</p>
                </div>
              </div>

              <!-- Expense Total -->
              <div class="flex items-center gap-3">
                <span class="w-11 h-11 rounded-xl bg-expense/20 flex items-center justify-center flex-shrink-0">
                  <svg class="w-7 h-7 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                  </svg>
                </span>
                <div>
                  <p class="text-sm font-bold text-blue-200">Keluar</p>
                  <p class="text-lg font-extrabold text-red-300 mt-0.5">{{ formatCurrency(currentCash.keluar) }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ========== ACTION BUTTONS DENGAN UKURAN EKSTRA BESAR (CHUNKY) ========== -->
      <div class="grid grid-cols-2 gap-4 animate-fade-in-up animate-stagger-2">
        <!-- Catat Uang Masuk -->
        <button
          class="flex flex-col items-center justify-center gap-3
                 bg-income text-white rounded-[var(--radius-card)]
                 p-6 min-h-[7rem] shadow-lg shadow-income/25
                 active:scale-[0.96] transition-all duration-150
                 hover:shadow-xl hover:shadow-income/30 hover:brightness-105"
        >
          <span class="w-13 h-13 rounded-2xl bg-white/20 flex items-center justify-center shadow-inner">
            <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </span>
          <span class="text-lg font-extrabold tracking-wide">Uang Masuk</span>
        </button>

        <!-- Catat Uang Keluar -->
        <button
          class="flex flex-col items-center justify-center gap-3
                 bg-expense text-white rounded-[var(--radius-card)]
                 p-6 min-h-[7rem] shadow-lg shadow-expense/25
                 active:scale-[0.96] transition-all duration-150
                 hover:shadow-xl hover:shadow-expense/30 hover:brightness-105"
        >
          <span class="w-13 h-13 rounded-2xl bg-white/20 flex items-center justify-center shadow-inner">
            <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
            </svg>
          </span>
          <span class="text-lg font-extrabold tracking-wide">Uang Keluar</span>
        </button>
      </div>

      <!-- ========== STATUS KAMAR DINAMIS ========== -->
      <div class="space-y-4 animate-fade-in-up animate-stagger-3">
        <div class="flex items-end justify-between border-b-2 border-border pb-2">
          <h2 class="text-2xl font-black text-text-primary tracking-tight">Status Kamar</h2>
          <span class="text-lg font-bold text-text-secondary bg-gray-100 px-3 py-1 rounded-full">{{ rooms.length }} kamar</span>
        </div>

        <!-- Legend Status (Ukuran Lebih Besar & Renggang) -->
        <div class="flex flex-wrap gap-x-5 gap-y-2 bg-white p-4 rounded-[var(--radius-card)] border border-border shadow-sm">
          <span class="flex items-center gap-2.5 text-sm font-bold text-text-primary">
            <span class="w-4 h-4 rounded-full bg-lunas shadow-sm"></span> Terisi
          </span>
          <span class="flex items-center gap-2.5 text-sm font-bold text-text-primary">
            <span class="w-4 h-4 rounded-full bg-kosong shadow-sm"></span> Kosong
          </span>
        </div>

        <!-- Loading Kamar -->
        <div v-if="isLoadingRooms" class="flex items-center justify-center py-10">
          <svg class="w-8 h-8 animate-spin text-navy" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span class="ml-3 text-lg font-semibold text-text-secondary">Memuat data kamar...</span>
        </div>

        <!-- Empty State Kamar -->
        <div
          v-else-if="rooms.length === 0 && !isLoadingRooms"
          class="bg-white rounded-[var(--radius-card)] border-2 border-dashed border-border p-8 text-center"
        >
          <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </div>
          <p class="text-lg font-bold text-text-primary mb-1">Belum ada kamar</p>
          <p class="text-sm text-text-secondary mb-4">Tambahkan kamar untuk lokasi ini.</p>
          <router-link
            to="/tambah-kamar"
            class="inline-flex items-center gap-2 bg-navy text-white px-5 py-3 rounded-[var(--radius-btn)] text-base font-bold active:scale-95 transition-transform"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Tambah Kamar
          </router-link>
        </div>

        <!-- Room Cards List (Dinamis v-for) -->
        <div v-else class="space-y-4">
          <div
            v-for="room in rooms"
            :key="room.id"
            class="bg-card rounded-[var(--radius-card)] border-2 border-border p-5 flex items-center gap-5
                   shadow-sm hover:shadow-md transition-shadow duration-200"
          >
            <!-- Status Indicator Badge (Chunky) -->
            <div
              class="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-black flex-shrink-0 shadow-md"
              :class="statusBgClass(room.status)"
            >
              {{ room.nomor_kamar }}
            </div>

            <!-- Room Info -->
            <div class="flex-1 min-w-0">
              <p class="text-lg font-extrabold text-text-primary truncate">
                Kamar {{ room.nomor_kamar }}
              </p>
              <p class="text-sm font-semibold text-text-secondary mt-1">
                {{ formatCurrency(room.harga_bulanan || 0) }}/bulan
              </p>
            </div>

            <!-- Action Status Badge -->
            <span
              class="px-4 py-2 rounded-[var(--radius-badge)] text-sm font-extrabold flex-shrink-0 border"
              :class="statusBadgeClass(room.status)"
            >
              {{ statusLabel(room.status) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Bottom Spacer for layout breathing room -->
      <div class="h-8"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase.js'

const router = useRouter()

// --- UI States ---
const isDropdownOpen = ref(false)
const isSettingsOpen = ref(false)
const isLoadingLocations = ref(true)
const isLoadingRooms = ref(false)

// --- Data States ---
const locations = ref([])
const selectedLocation = ref(null)
const rooms = ref([])

// --- Computed ---
const selectedLocationName = computed(() => {
  const loc = locations.value.find(l => l.id === selectedLocation.value)
  return loc ? loc.nama_lokasi : 'Pilih Lokasi'
})

const currentMonth = computed(() => {
  const now = new Date()
  return now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
})

// Kas sementara (placeholder sampai tabel transaksi dibuat)
const currentCash = computed(() => {
  return { masuk: 0, keluar: 0, sisa: 0 }
})

// --- Fetch Locations ---
onMounted(async () => {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .order('nama_lokasi', { ascending: true })

  isLoadingLocations.value = false

  if (error) {
    console.error('[Supabase] Gagal fetch locations:', error)
  } else {
    locations.value = data || []
    console.log('[Supabase] Locations loaded:', data)

    // Set lokasi pertama sebagai default
    if (locations.value.length > 0) {
      selectedLocation.value = locations.value[0].id
    }
  }
})

// --- Fetch Rooms (reaktif terhadap perubahan lokasi) ---
async function fetchRooms(locationId) {
  if (!locationId) {
    rooms.value = []
    return
  }

  isLoadingRooms.value = true

  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('location_id', locationId)
    .order('nomor_kamar', { ascending: true })

  isLoadingRooms.value = false

  if (error) {
    console.error('[Supabase] Gagal fetch rooms:', error)
    rooms.value = []
  } else {
    rooms.value = data || []
    console.log('[Supabase] Rooms loaded for location', locationId, ':', data)
  }
}

// Watcher: setiap kali selectedLocation berubah, fetch ulang rooms
watch(selectedLocation, (newId) => {
  fetchRooms(newId)
}, { immediate: true })

// --- Actions ---
const selectLocation = (id) => {
  selectedLocation.value = id
  isDropdownOpen.value = false
}

// --- Helpers ---
function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function statusLabel(status) {
  const s = (status || '').toLowerCase()
  const map = {
    kosong: 'Kosong',
    tersedia: 'Tersedia',
    terisi: 'Terisi',
  }
  return map[s] || status || 'Kosong'
}

function statusBgClass(status) {
  const s = (status || '').toLowerCase()
  if (s === 'kosong') return 'bg-kosong'
  if (s === 'tersedia' || s === 'terisi') return 'bg-lunas'
  return 'bg-kosong'
}

function statusBadgeClass(status) {
  const s = (status || '').toLowerCase()
  if (s === 'kosong') return 'bg-gray-100 text-text-muted border-gray-200'
  if (s === 'tersedia' || s === 'terisi') return 'bg-income-light text-income border-income/20'
  return 'bg-gray-100 text-text-muted border-gray-200'
}
// --- Logout Function ---
async function handleLogout() {
  isSettingsOpen.value = false
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('[Supabase Auth] Gagal logout:', error)
  } else {
    console.log('[Supabase Auth] Logout berhasil')
    router.push('/login')
  }
}
</script>
