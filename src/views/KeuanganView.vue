<template>
  <div class="min-h-screen bg-bg-primary pb-24">
    <!-- Header -->
    <header class="bg-navy rounded-b-4xl px-6 pt-12 pb-8 text-white shadow-lg max-w-lg mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-3xl font-black tracking-tight">Keuangan</h1>
        <span class="bg-white/10 px-4 py-1.5 rounded-full text-sm font-bold">
          Bulan Ini
        </span>
      </div>

      <!-- Location Filter Dropdown -->
      <div class="space-y-1.5">
        <label for="location-filter" class="block text-xs font-bold text-blue-200">Filter Lokasi Kos</label>
        <div class="relative">
          <select
            id="location-filter"
            v-model="selectedLocationFilter"
            class="w-full px-5 py-4 bg-white border-2 border-white/20 rounded-xl appearance-none focus:outline-none focus:border-white text-lg font-medium text-gray-800 shadow-sm"
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
          <div class="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
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
        <span class="text-base font-semibold text-text-secondary">Memproses data arus kas...</span>
      </div>

      <template v-else>
        <!-- ========== WIDGET ARUS KAS MINI ========== -->
        <div class="grid grid-cols-2 gap-4">
          <!-- Pemasukan -->
          <div class="bg-white border-2 border-border p-5 rounded-[var(--radius-card)] shadow-sm relative overflow-hidden">
            <p class="text-xs font-bold text-text-muted">Total Pemasukan</p>
            <p class="text-xl font-black text-income mt-1.5">
              {{ formatCurrency(totalPemasukan) }}
            </p>
            <div class="absolute right-3 bottom-3 text-2xl opacity-10">📈</div>
          </div>

          <!-- Pengeluaran -->
          <div class="bg-white border-2 border-border p-5 rounded-[var(--radius-card)] shadow-sm relative overflow-hidden">
            <p class="text-xs font-bold text-text-muted">Total Pengeluaran</p>
            <p class="text-xl font-black text-expense mt-1.5">
              {{ formatCurrency(totalPengeluaran) }}
            </p>
            <div class="absolute right-3 bottom-3 text-2xl opacity-10">📉</div>
          </div>
        </div>

        <!-- ========== TOMBOL AKSY CHUNKY ========== -->
        <div class="grid grid-cols-2 gap-4">
          <router-link
            to="/tambah-pemasukan"
            class="flex items-center justify-center gap-2 py-4 bg-income text-white rounded-xl text-base font-extrabold shadow-md shadow-income/20 active:scale-[0.96] transition-all duration-150"
          >
            <span>➕</span> Uang Masuk
          </router-link>

          <router-link
            to="/tambah-pengeluaran"
            class="flex items-center justify-center gap-2 py-4 bg-expense text-white rounded-xl text-base font-extrabold shadow-md shadow-expense/20 active:scale-[0.96] transition-all duration-150"
          >
            <span>➖</span> Uang Keluar
          </router-link>
        </div>

        <!-- ========== RADAR PIUTANG (UNPAID BILLS) ========== -->
        <div class="space-y-4">
          <div class="flex items-end justify-between border-b-2 border-border pb-2">
            <h2 class="text-2xl font-black text-text-primary tracking-tight">Belum Bayar Bulan Ini</h2>
            <span
              v-if="daftarBelumBayar.length > 0"
              class="text-sm font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded-full border border-amber-200"
            >
              {{ daftarBelumBayar.length }} Penghuni
            </span>
          </div>

          <!-- Empty State (All Paid) -->
          <div
            v-if="daftarBelumBayar.length === 0"
            class="bg-green-50 border border-green-200 rounded-[var(--radius-card)] p-8 text-center shadow-sm"
          >
            <div class="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
              ✓
            </div>
            <p class="text-base font-extrabold text-green-800">Semua Lunas!</p>
            <p class="text-xs font-semibold text-green-600 mt-1">
              Seluruh penghuni aktif pada lokasi ini telah melakukan pembayaran sewa untuk bulan berjalan.
            </p>
          </div>

          <!-- Unpaid List (Memanjang Horizontal) -->
          <div v-else class="space-y-3">
            <div
              v-for="rental in daftarBelumBayar"
              :key="rental.id"
              class="bg-white rounded-[var(--radius-card)] border-2 border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow active:scale-[0.99] transition-all duration-150 relative overflow-hidden"
            >
              <div class="flex items-center gap-4">
                <!-- Square Box Room Number -->
                <div class="w-14 h-14 rounded-2xl bg-green-500 flex items-center justify-center text-white text-lg font-black flex-shrink-0 shadow-sm">
                  {{ rental.rooms?.nomor_kamar }}
                </div>

                <!-- Info Tenant & Amount -->
                <div class="min-w-0">
                  <p class="text-base font-extrabold text-text-primary truncate">
                    {{ rental.tenants?.nama_lengkap }}
                  </p>
                  <p class="text-xs font-bold text-text-secondary mt-0.5">
                    Tagihan: <span class="text-green-700">{{ formatCurrency(rental.rooms?.harga_bulanan || 0) }}</span>
                  </p>
                </div>
              </div>

              <!-- Action: Send WA -->
              <div class="flex-shrink-0 text-right sm:text-left">
                <button
                  @click="kirimTagihan(rental)"
                  class="w-full sm:w-auto px-4 py-2.5 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-extrabold rounded-xl text-xs shadow-sm transition-transform flex items-center justify-center gap-1.5"
                >
                  <svg class="w-4 h-4 mr-1.5 fill-current inline-block text-white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.452 5.714 1.456h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  <span>Tagih via WA</span>
                </button>
              </div>

              <!-- Location Tag overlay -->
              <span class="absolute right-3 top-1 text-[8px] font-bold text-text-muted opacity-30">
                {{ rental.rooms?.locations?.nama_lokasi }}
              </span>
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
const selectedLocationFilter = ref('ALL')

const locationsList = ref([])
const rentalsList = ref([])
const incomesList = ref([])
const expensesList = ref([])

const currentMonth = computed(() => {
  const now = new Date()
  return now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
})

const currentMonthPrefix = computed(() => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
})

// Current month cash transactions
const currentMonthIncomes = computed(() => {
  return incomesList.value.filter(item => {
    const matchesLocation = selectedLocationFilter.value === 'ALL' || item.rentals?.rooms?.location_id === selectedLocationFilter.value
    const matchesMonth = item.tanggal_bayar && item.tanggal_bayar.startsWith(currentMonthPrefix.value)
    return matchesLocation && matchesMonth
  })
})

const currentMonthExpenses = computed(() => {
  return expensesList.value.filter(item => {
    const matchesLocation = selectedLocationFilter.value === 'ALL' || item.location_id === selectedLocationFilter.value
    const matchesMonth = item.tanggal_pengeluaran && item.tanggal_pengeluaran.startsWith(currentMonthPrefix.value)
    return matchesLocation && matchesMonth
  })
})

const totalPemasukan = computed(() => {
  return currentMonthIncomes.value.reduce((sum, item) => sum + (item.nominal || 0), 0)
})

const totalPengeluaran = computed(() => {
  return currentMonthExpenses.value.reduce((sum, item) => sum + (item.nominal || 0), 0)
})

// Filter rentals that have NOT paid this month (Piutang)
const daftarBelumBayar = computed(() => {
  return rentalsList.value.filter(rental => {
    // Check Location filter
    const matchesLocation = selectedLocationFilter.value === 'ALL' || rental.rooms?.location_id === selectedLocationFilter.value
    if (!matchesLocation) return false

    // Check if paid in the current month
    const hasPaid = incomesList.value.some(income => {
      return income.rental_id === rental.id && income.tanggal_bayar && income.tanggal_bayar.startsWith(currentMonthPrefix.value)
    })
    
    return !hasPaid
  })
})

// Load Locations
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

// Load Financial Dashboard Data
async function loadFinanceData() {
  isLoading.value = true
  try {
    // 1. Fetch active rentals
    const { data: rentalsData, error: rentalsError } = await supabase
      .from('rentals')
      .select('*, tenants(*), rooms(*, locations(*))')
      .eq('status_aktif', true)

    if (rentalsError) throw rentalsError
    rentalsList.value = rentalsData || []

    // 2. Fetch incomes with location reference
    const { data: incomesData, error: incomesError } = await supabase
      .from('incomes')
      .select('*, rentals!inner(rooms!inner(location_id))')

    if (incomesError) throw incomesError
    incomesList.value = incomesData || []

    // 3. Fetch expenses
    const { data: expensesData, error: expensesError } = await supabase
      .from('expenses')
      .select('*')

    if (expensesError) throw expensesError
    expensesList.value = expensesData || []

  } catch (err) {
    console.error('[SimKos] Gagal fetch data keuangan:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await loadLocations()
  await loadFinanceData()
})

// Send WhatsApp automatic bill template
function kirimTagihan(rental) {
  const tenantName = rental.tenants?.nama_lengkap || 'Penghuni'
  const roomNo = rental.rooms?.nomor_kamar || '-'
  const amountStr = formatCurrency(rental.rooms?.harga_bulanan || 0)
  const phone = rental.tenants?.nomor_hp || ''

  if (!phone) {
    alert('Nomor HP penghuni tidak tersedia!')
    return
  }

  // Clean phone number (replace initial 0 with 62)
  let formattedPhone = phone.replace(/\D/g, '')
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '62' + formattedPhone.substring(1)
  }

  // Message template
  const textMsg = `Halo ${tenantName}, mengingatkan untuk pembayaran sewa Kamar ${roomNo} periode bulan ini sebesar ${amountStr}. Pembayaran dapat ditransfer melalui nomor rekening 1440005288516. Jika sudah transfer, mohon kirimkan bukti transfernya ya. Terima kasih! 🙏`

  const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(textMsg)}`
  window.open(waUrl, '_blank')
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
</script>
