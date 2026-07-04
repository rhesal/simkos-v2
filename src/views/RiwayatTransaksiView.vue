<template>
  <div class="min-h-screen bg-bg-primary pb-24">
    <!-- Header -->
    <header class="bg-navy rounded-b-4xl px-6 pt-12 pb-8 text-white shadow-lg max-w-lg mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-3xl font-black tracking-tight">Buku Besar</h1>
        <span class="bg-white/10 px-4 py-1.5 rounded-full text-sm font-bold">
          Riwayat Transaksi
        </span>
      </div>

      <!-- Filter Lokasi (Chunky) -->
      <div class="space-y-2">
        <label for="filter-lokasi" class="block text-sm font-bold text-blue-200">
          Filter Lokasi Kos
        </label>
        <div class="relative">
          <select
            id="filter-lokasi"
            v-model="selectedLocationFilter"
            class="w-full px-5 py-4 bg-white border-2 border-white/20 rounded-xl appearance-none focus:outline-none focus:border-white text-lg font-medium text-gray-800 shadow-sm"
          >
            <option value="ALL">🏢 Semua Lokasi</option>
            <option v-for="loc in locationList" :key="loc.id" :value="loc.id">
              🏠 {{ loc.nama_lokasi }}
            </option>
          </select>
          <div class="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>
      </div>

      <!-- Rentang Tanggal (Chunky) -->
      <div class="grid grid-cols-2 gap-4 mt-4">
        <!-- Dari Tanggal -->
        <div class="space-y-1.5">
          <label for="start-date" class="block text-xs font-bold text-blue-200">
            Dari Tanggal
          </label>
          <div class="relative rounded-xl border-2 border-white/20 bg-white/10 focus-within:border-white focus-within:ring-4 focus-within:ring-white/10 transition-all duration-200 shadow-sm">
            <!-- Visual Text Overlay -->
            <div class="w-full px-4 py-3 text-base font-semibold text-white flex items-center justify-between pointer-events-none">
              <span class="truncate">{{ startDate ? formatDateDisplay(startDate) : 'Mulai' }}</span>
              <span class="text-white/60 text-sm flex-shrink-0">📅</span>
            </div>
            <!-- Native Date Input -->
            <input
              id="start-date"
              v-model="startDate"
              type="date"
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </div>
        </div>

        <!-- Sampai Tanggal -->
        <div class="space-y-1.5">
          <label for="end-date" class="block text-xs font-bold text-blue-200">
            Sampai Tanggal
          </label>
          <div class="relative rounded-xl border-2 border-white/20 bg-white/10 focus-within:border-white focus-within:ring-4 focus-within:ring-white/10 transition-all duration-200 shadow-sm">
            <!-- Visual Text Overlay -->
            <div class="w-full px-4 py-3 text-base font-semibold text-white flex items-center justify-between pointer-events-none">
              <span class="truncate">{{ endDate ? formatDateDisplay(endDate) : 'Selesai' }}</span>
              <span class="text-white/60 text-sm flex-shrink-0">📅</span>
            </div>
            <!-- Native Date Input -->
            <input
              id="end-date"
              v-model="endDate"
              type="date"
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          </div>
        </div>
      </div>

      <!-- Reset Button -->
      <div v-if="startDate || endDate" class="mt-3 flex justify-end">
        <button
          @click="resetDateFilters"
          class="px-3 py-1.5 bg-white/15 hover:bg-white/20 active:bg-white/30 text-white rounded-lg text-xs font-bold transition-all"
        >
          🧹 Reset Rentang Tanggal
        </button>
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
        <span class="text-base font-semibold text-text-secondary">Memuat riwayat transaksi...</span>
      </div>

      <template v-else>
        <!-- Summary Mini Cards -->
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-white border-2 border-border p-4 rounded-[var(--radius-card)] shadow-sm">
            <p class="text-xs font-bold text-text-muted">Total Masuk</p>
            <p class="text-lg font-black text-income mt-1">
              {{ formatCurrency(filteredTotalIncome) }}
            </p>
          </div>
          <div class="bg-white border-2 border-border p-4 rounded-[var(--radius-card)] shadow-sm">
            <p class="text-xs font-bold text-text-muted">Total Keluar</p>
            <p class="text-lg font-black text-expense mt-1">
              {{ formatCurrency(filteredTotalExpense) }}
            </p>
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-if="filteredTransactions.length === 0"
          class="bg-white rounded-[var(--radius-card)] border-2 border-dashed border-border p-12 text-center"
        >
          <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A4.002 4.002 0 007.5 12h-3m0 0a3 3 0 01-3-3V7.5a3 3 0 013-3h3m0 3h-3m3 3V12" />
            </svg>
          </div>
          <p class="text-lg font-bold text-text-primary mb-1">Belum ada transaksi</p>
          <p class="text-sm text-text-secondary">Tidak ditemukan catatan kas di lokasi terpilih.</p>
        </div>

        <!-- Transactions List -->
        <div v-else class="space-y-4">
          <div
            v-for="tx in filteredTransactions"
            :key="tx.id"
            class="bg-white rounded-[var(--radius-card)] border-2 border-border p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <!-- Type Icon/Badge -->
            <div
              class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              :class="tx.tipe === 'masuk' ? 'bg-income/10 text-income' : 'bg-expense/10 text-expense'"
            >
              <svg v-if="tx.tipe === 'masuk'" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
              <svg v-else class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
              </svg>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <p class="text-base font-extrabold text-text-primary truncate">
                  {{ tx.keterangan }}
                </p>
                <p
                  class="text-base font-black flex-shrink-0"
                  :class="tx.tipe === 'masuk' ? 'text-income' : 'text-expense'"
                >
                  {{ tx.tipe === 'masuk' ? '+' : '-' }} {{ formatCurrency(tx.nominal) }}
                </p>
              </div>

              <div class="flex items-center justify-between text-xs font-semibold text-text-secondary mt-1.5">
                <div class="flex items-center gap-1.5 truncate">
                  <span class="bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                    {{ tx.entitas }}
                  </span>
                  <span class="text-text-muted">·</span>
                  <span class="truncate">{{ tx.lokasi }}</span>
                </div>
                <span class="flex-shrink-0 font-bold bg-navy/5 text-navy px-2 py-0.5 rounded">
                  {{ formatDateDisplay(tx.tanggal) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Bottom Navigation Bar -->
    <BottomNav />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase.js'
import BottomNav from '../components/BottomNav.vue'

const isLoading = ref(true)
const locationList = ref([])
const selectedLocationFilter = ref('ALL')
const transactionsList = ref([])
const startDate = ref('')
const endDate = ref('')

function resetDateFilters() {
  startDate.value = ''
  endDate.value = ''
}

// Load Locations and Transactions
onMounted(async () => {
  try {
    // 1. Fetch Locations
    const { data: locData, error: locError } = await supabase
      .from('locations')
      .select('id, nama_lokasi')
      .order('nama_lokasi', { ascending: true })

    if (locError) throw locError
    locationList.value = locData || []

    // 2. Fetch Incomes
    const { data: incData, error: incError } = await supabase
      .from('incomes')
      .select(`
        id,
        tanggal_bayar,
        nominal,
        keterangan,
        rentals (
          tenants (nama_lengkap),
          rooms (
            nomor_kamar,
            location_id,
            locations (nama_lokasi)
          )
        )
      `)

    if (incError) throw incError

    // 3. Fetch Expenses
    const { data: expData, error: expError } = await supabase
      .from('expenses')
      .select(`
        id,
        tanggal_pengeluaran,
        nominal,
        keterangan,
        kategori,
        location_id,
        locations (nama_lokasi)
      `)

    if (expError) throw expError

    // 4. Format and Map Incomes
    const mappedIncomes = (incData || []).map(item => {
      const tenantName = item.rentals?.tenants?.nama_lengkap || 'Penghuni'
      const roomNo = item.rentals?.rooms?.nomor_kamar || ''
      const locId = item.rentals?.rooms?.location_id || null
      const locName = item.rentals?.rooms?.locations?.nama_lokasi || 'Tidak Diketahui'

      return {
        id: `inc-${item.id}`,
        tipe: 'masuk',
        tanggal: item.tanggal_bayar,
        nominal: item.nominal || 0,
        keterangan: item.keterangan || 'Bayar Sewa Kos',
        entitas: `👤 ${tenantName} (Kamar ${roomNo})`,
        lokasi: `🏢 ${locName}`,
        location_id: locId
      }
    })

    // 5. Format and Map Expenses
    const mappedExpenses = (expData || []).map(item => {
      const locName = item.locations?.nama_lokasi || 'Tidak Diketahui'

      return {
        id: `exp-${item.id}`,
        tipe: 'keluar',
        tanggal: item.tanggal_pengeluaran,
        nominal: item.nominal || 0,
        keterangan: item.keterangan || `Pengeluaran ${item.kategori}`,
        entitas: `📦 ${item.kategori}`,
        lokasi: `🏢 ${locName}`,
        location_id: item.location_id
      }
    })

    // 6. Combine and Sort Descending by Date
    const combined = [...mappedIncomes, ...mappedExpenses].sort((a, b) => {
      return new Date(b.tanggal) - new Date(a.tanggal)
    })

    transactionsList.value = combined

  } catch (err) {
    console.error('[SimKos] Error loading general ledger:', err)
  } finally {
    isLoading.value = false
  }
})

// Filter transactions by location and date range
const filteredTransactions = computed(() => {
  let list = transactionsList.value

  if (selectedLocationFilter.value !== 'ALL') {
    list = list.filter(tx => tx.location_id === selectedLocationFilter.value)
  }

  if (startDate.value) {
    list = list.filter(tx => tx.tanggal >= startDate.value)
  }

  if (endDate.value) {
    list = list.filter(tx => tx.tanggal <= endDate.value)
  }

  return list
})

const filteredTotalIncome = computed(() => {
  return filteredTransactions.value
    .filter(tx => tx.tipe === 'masuk')
    .reduce((sum, tx) => sum + tx.nominal, 0)
})

const filteredTotalExpense = computed(() => {
  return filteredTransactions.value
    .filter(tx => tx.tipe === 'keluar')
    .reduce((sum, tx) => sum + tx.nominal, 0)
})

// Helper functions
function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}
</script>
