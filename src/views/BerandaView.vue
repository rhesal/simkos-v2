<template>
  <div class="px-4 py-5 space-y-5">

    <!-- ========== LOCATION SELECTOR ========== -->
    <div class="animate-fade-in-up animate-stagger-1">
      <label for="lokasi-select" class="block text-sm font-semibold text-text-secondary mb-2">
        Pilih Lokasi Kos
      </label>
      <div class="relative">
        <select
          id="lokasi-select"
          v-model="selectedLocation"
          class="w-full appearance-none bg-card border-2 border-border rounded-[var(--radius-btn)]
                 px-5 py-4 text-lg font-semibold text-text-primary
                 focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                 transition-all duration-200 cursor-pointer shadow-sm"
        >
          <option v-for="loc in locations" :key="loc.id" :value="loc.id">
            {{ loc.name }}
          </option>
        </select>
        <!-- Dropdown arrow -->
        <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg class="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </div>
    </div>

    <!-- ========== CASH SUMMARY CARD ========== -->
    <div class="animate-fade-in-up animate-stagger-2">
      <div class="bg-navy rounded-[var(--radius-card)] p-6 text-white shadow-xl relative overflow-hidden">
        <!-- Decorative circles -->
        <div class="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full"></div>
        <div class="absolute -right-4 top-12 w-20 h-20 bg-white/5 rounded-full"></div>

        <div class="relative z-10">
          <div class="flex items-center gap-2 mb-1">
            <svg class="w-5 h-5 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <p class="text-sm font-medium text-blue-200">Sisa Kas · {{ currentMonth }}</p>
          </div>

          <p class="text-3xl font-extrabold tracking-tight mt-2">
            {{ formatCurrency(currentCash.sisa) }}
          </p>

          <div class="flex items-center gap-6 mt-4 pt-4 border-t border-white/15">
            <div class="flex items-center gap-2">
              <span class="w-8 h-8 rounded-lg bg-income/20 flex items-center justify-center">
                <svg class="w-5 h-5 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </span>
              <div>
                <p class="text-xs text-blue-300">Masuk</p>
                <p class="text-base font-bold text-green-300">{{ formatCurrency(currentCash.masuk) }}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-8 h-8 rounded-lg bg-expense/20 flex items-center justify-center">
                <svg class="w-5 h-5 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                </svg>
              </span>
              <div>
                <p class="text-xs text-blue-300">Keluar</p>
                <p class="text-base font-bold text-red-300">{{ formatCurrency(currentCash.keluar) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== ACTION BUTTONS ========== -->
    <div class="grid grid-cols-2 gap-3 animate-fade-in-up animate-stagger-3">
      <!-- Catat Uang Masuk -->
      <button
        class="flex flex-col items-center justify-center gap-2
               bg-income text-white rounded-[var(--radius-btn)]
               p-5 min-h-[5.5rem] shadow-lg shadow-income/25
               active:scale-[0.97] transition-all duration-150
               hover:shadow-xl hover:shadow-income/30 hover:brightness-110"
      >
        <span class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </span>
        <span class="text-base font-bold">Uang Masuk</span>
      </button>

      <!-- Catat Uang Keluar -->
      <button
        class="flex flex-col items-center justify-center gap-2
               bg-expense text-white rounded-[var(--radius-btn)]
               p-5 min-h-[5.5rem] shadow-lg shadow-expense/25
               active:scale-[0.97] transition-all duration-150
               hover:shadow-xl hover:shadow-expense/30 hover:brightness-110"
      >
        <span class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
          </svg>
        </span>
        <span class="text-base font-bold">Uang Keluar</span>
      </button>
    </div>

    <!-- ========== ROOM STATUS ========== -->
    <div class="animate-fade-in-up animate-stagger-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-xl font-bold text-text-primary">Status Kamar</h2>
        <span class="text-sm text-text-muted font-medium">{{ currentLocationData.rooms.length }} kamar</span>
      </div>

      <!-- Legend -->
      <div class="flex flex-wrap gap-x-4 gap-y-1 mb-4">
        <span class="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
          <span class="w-3 h-3 rounded-full bg-lunas"></span> Lunas
        </span>
        <span class="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
          <span class="w-3 h-3 rounded-full bg-jatuh-tempo"></span> Jatuh Tempo
        </span>
        <span class="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
          <span class="w-3 h-3 rounded-full bg-terlambat"></span> Terlambat
        </span>
        <span class="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
          <span class="w-3 h-3 rounded-full bg-kosong"></span> Kosong
        </span>
      </div>

      <!-- Room Cards -->
      <div class="space-y-3">
        <div
          v-for="room in currentLocationData.rooms"
          :key="room.id"
          class="bg-card rounded-[var(--radius-card)] border border-border p-4 flex items-center gap-4
                 shadow-sm hover:shadow-md transition-shadow duration-200"
        >
          <!-- Status Indicator -->
          <div
            class="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-extrabold flex-shrink-0 shadow-sm"
            :class="statusBgClass(room.status)"
          >
            {{ room.number }}
          </div>

          <!-- Room Info -->
          <div class="flex-1 min-w-0">
            <p class="text-base font-bold text-text-primary truncate">
              {{ room.tenant || 'Kamar Kosong' }}
            </p>
            <p class="text-sm text-text-secondary mt-0.5">
              {{ statusLabel(room.status) }}
              <span v-if="room.dueDate && room.status !== 'kosong'" class="text-text-muted">
                · {{ room.dueDate }}
              </span>
            </p>
          </div>

          <!-- Status badge -->
          <span
            class="px-3 py-1.5 rounded-[var(--radius-badge)] text-xs font-bold flex-shrink-0"
            :class="statusBadgeClass(room.status)"
          >
            {{ statusLabel(room.status) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Spacer for bottom nav -->
    <div class="h-4"></div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

// --- Static Data ---
const locations = [
  { id: 'melati', name: '🏠 Kos Melati' },
  { id: 'mawar', name: '🌹 Kos Mawar' },
]

const selectedLocation = ref('melati')

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

// --- Computed ---
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
    lunas: 'bg-income-light text-income',
    'jatuh-tempo': 'bg-amber-100 text-amber-700',
    terlambat: 'bg-expense-light text-expense',
    kosong: 'bg-gray-100 text-text-muted',
  }
  return map[status] || 'bg-gray-100 text-gray-500'
}
</script>
