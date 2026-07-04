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
              class="w-full px-5 py-4 text-left text-lg font-bold text-text-primary hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3"
            >
              <span class="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </span>
              Tambah Kamar
            </router-link>
          </div>
        </div>
      </div>

      <!-- Combo-box Pemilih Lokasi (Kustom & Tertutup) -->
      <div class="relative">
        <button
          @click="isDropdownOpen = !isDropdownOpen"
          class="w-full bg-white/10 hover:bg-white/15 active:bg-white/20 border-2 border-white/20 rounded-[var(--radius-btn)]
                 px-5 py-4 flex items-center justify-between text-lg font-bold text-white
                 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-white/25"
        >
          <div class="flex items-center gap-3">
            <span class="text-2xl">{{ selectedLocationData.icon }}</span>
            <span>{{ selectedLocationData.name }}</span>
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

        <!-- Dropdown Menu Item -->
        <div
          v-if="isDropdownOpen"
          class="absolute z-50 left-0 right-0 mt-2 bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl overflow-hidden"
        >
          <button
            v-for="loc in locations"
            :key="loc.id"
            @click="selectLocation(loc.id)"
            class="w-full px-5 py-4 text-left text-lg font-bold text-text-primary hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 border-b border-border last:border-0"
          >
            <span class="text-2xl">{{ loc.icon }}</span>
            <span>{{ loc.name }}</span>
          </button>
        </div>
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

      <!-- ========== STATUS KAMAR DENGAN UKURAN LEBIH BESAR ========== -->
      <div class="space-y-4 animate-fade-in-up animate-stagger-3">
        <div class="flex items-end justify-between border-b-2 border-border pb-2">
          <h2 class="text-2xl font-black text-text-primary tracking-tight">Status Kamar</h2>
          <span class="text-lg font-bold text-text-secondary bg-gray-100 px-3 py-1 rounded-full">{{ currentLocationData.rooms.length }} kamar</span>
        </div>

        <!-- Legend Status (Ukuran Lebih Besar & Renggang) -->
        <div class="flex flex-wrap gap-x-5 gap-y-2 bg-white p-4 rounded-[var(--radius-card)] border border-border shadow-sm">
          <span class="flex items-center gap-2.5 text-sm font-bold text-text-primary">
            <span class="w-4 h-4 rounded-full bg-lunas shadow-sm"></span> Lunas
          </span>
          <span class="flex items-center gap-2.5 text-sm font-bold text-text-primary">
            <span class="w-4 h-4 rounded-full bg-jatuh-tempo shadow-sm"></span> Jatuh Tempo
          </span>
          <span class="flex items-center gap-2.5 text-sm font-bold text-text-primary">
            <span class="w-4 h-4 rounded-full bg-terlambat shadow-sm"></span> Terlambat
          </span>
          <span class="flex items-center gap-2.5 text-sm font-bold text-text-primary">
            <span class="w-4 h-4 rounded-full bg-kosong shadow-sm"></span> Kosong
          </span>
        </div>

        <!-- Room Cards List -->
        <div class="space-y-4">
          <div
            v-for="room in currentLocationData.rooms"
            :key="room.id"
            class="bg-card rounded-[var(--radius-card)] border-2 border-border p-5 flex items-center gap-5
                   shadow-sm hover:shadow-md transition-shadow duration-200"
          >
            <!-- Status Indicator Badge (Chunky) -->
            <div
              class="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-black flex-shrink-0 shadow-md"
              :class="statusBgClass(room.status)"
            >
              {{ room.number }}
            </div>

            <!-- Room Info -->
            <div class="flex-1 min-w-0">
              <p class="text-lg font-extrabold text-text-primary truncate">
                {{ room.tenant || 'Kamar Kosong' }}
              </p>
              <p class="text-sm font-semibold text-text-secondary mt-1">
                {{ statusLabel(room.status) }}
                <span v-if="room.dueDate && room.status !== 'kosong'" class="text-text-muted">
                  · {{ room.dueDate }}
                </span>
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
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase.js'

// --- Uji Koneksi Supabase ---
onMounted(async () => {
  const { data, error } = await supabase.from('locations').select('*')
  if (error) {
    console.error('[Supabase] Gagal fetch locations:', error)
  } else {
    console.log('[Supabase] Koneksi berhasil! Data locations:', data)
  }
})

const isDropdownOpen = ref(false)
const isSettingsOpen = ref(false)
const selectedLocation = ref('melati')

const locations = [
  { id: 'melati', name: 'Kos Melati', icon: '🏠' },
  { id: 'mawar', name: 'Kos Mawar', icon: '🌹' },
]

const selectedLocationData = computed(() => {
  return locations.find(loc => loc.id === selectedLocation.value)
})

const selectLocation = (id) => {
  selectedLocation.value = id
  isDropdownOpen.value = false
}

const locationData = {
  melati: {
    cash: { masuk: 12500000, keluar: 4200000, sisa: 8300000 },
    rooms: [
      { id: 1, number: '01', tenant: 'Budi Santoso', status: 'lunas', dueDate: '1 Jul 2026' },
      { id: 2, number: '02', tenant: 'Siti Aminah', status: 'lunas', dueDate: '1 Jul 2026' },
      { id: 3, number: '03', tenant: 'Andi Wijaya', status: 'jatuh-tempo', dueDate: '3 Jul 2026' },
      { id: 4, number: '04', tenant: 'Dewi Lestari', status: 'terlambat', dueDate: '28 Jun 2026' },
      { id: 5, number: '05', tenant: null, status: 'kosong', dueDate: null },
      { id: 6, number: '06', tenant: 'Rizal Pratama', status: 'lunas', dueDate: '1 Jul 2026' },
      { id: 7, number: '07', tenant: 'Maya Sari', status: 'jatuh-tempo', dueDate: '5 Jul 2026' },
      { id: 8, number: '08', tenant: null, status: 'kosong', dueDate: null },
    ],
  },
  mawar: {
    cash: { masuk: 9000000, keluar: 3100000, sisa: 5900000 },
    rooms: [
      { id: 1, number: '01', tenant: 'Hendra Gunawan', status: 'lunas', dueDate: '1 Jul 2026' },
      { id: 2, number: '02', tenant: 'Linda Permata', status: 'terlambat', dueDate: '25 Jun 2026' },
      { id: 3, number: '03', tenant: null, status: 'kosong', dueDate: null },
      { id: 4, number: '04', tenant: 'Fajar Nugroho', status: 'lunas', dueDate: '1 Jul 2026' },
      { id: 5, number: '05', tenant: 'Ratna Dewi', status: 'jatuh-tempo', dueDate: '4 Jul 2026' },
      { id: 6, number: '06', tenant: 'Agus Salim', status: 'lunas', dueDate: '1 Jul 2026' },
    ],
  },
}

const currentLocationData = computed(() => {
  return locationData[selectedLocation.value]
})

const currentCash = computed(() => {
  return currentLocationData.value.cash
})

const currentMonth = computed(() => {
  const now = new Date()
  return now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
})

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function statusLabel(status) {
  const map = {
    lunas: 'Lunas',
    'jatuh-tempo': 'Jatuh Tempo',
    terlambat: 'Terlambat',
    kosong: 'Kosong',
  }
  return map[status] || status
}

function statusBgClass(status) {
  const map = {
    lunas: 'bg-lunas',
    'jatuh-tempo': 'bg-jatuh-tempo',
    terlambat: 'bg-terlambat',
    kosong: 'bg-kosong',
  }
  return map[status] || 'bg-gray-400'
}

function statusBadgeClass(status) {
  const map = {
    lunas: 'bg-income-light text-income border-income/20',
    'jatuh-tempo': 'bg-amber-100 text-amber-800 border-amber-200',
    terlambat: 'bg-expense-light text-expense border-expense/20',
    kosong: 'bg-gray-100 text-text-muted border-gray-200',
  }
  return map[status] || 'bg-gray-100 text-gray-500 border-gray-200'
}
</script>
