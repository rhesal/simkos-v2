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
        <!-- Success Feedback -->
        <div
          v-if="paymentSuccessMsg"
          class="bg-income-light border-2 border-income/30 text-income rounded-[var(--radius-card)] p-4 flex items-center gap-3 animate-fade-in-up"
        >
          <span class="text-2xl flex-shrink-0">✓</span>
          <span class="text-sm font-bold">{{ paymentSuccessMsg }}</span>
        </div>

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

        <!-- Catatan tagihan bersama (location_id NULL) -->
        <p
          v-if="totalTagihanBersama > 0"
          class="text-xs font-semibold text-text-secondary bg-navy/5 border border-navy/10 rounded-xl px-4 py-3 -mt-2"
        >
          <template v-if="selectedLocationFilter === 'ALL'">
            🌐 Termasuk tagihan bersama {{ formatCurrency(totalTagihanBersama) }}
          </template>
          <template v-else>
            🌐 Tagihan bersama {{ formatCurrency(totalTagihanBersama) }} tidak termasuk total kos ini
          </template>
        </p>

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
              @click="openPaymentModal(rental)"
              class="bg-white rounded-[var(--radius-card)] border-2 border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow hover:border-income/40 active:scale-[0.99] transition-all duration-150 relative overflow-hidden cursor-pointer"
            >
              <!-- Info Tenant (Clickable to verify payment) -->
              <div class="flex items-center gap-4 flex-1">
                <!-- Square Box Room Number -->
                <div class="w-14 h-14 rounded-2xl bg-green-500 flex items-center justify-center text-white px-1 text-center flex-shrink-0 shadow-sm overflow-hidden">
                  <span
                    class="leading-tight break-words select-none"
                    :class="getRoomBadgeFontSize(rental.rooms?.nomor_kamar)"
                  >
                    {{ rental.rooms?.nomor_kamar }}
                  </span>
                </div>

                <!-- Info Tenant & Amount -->
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="text-base font-extrabold text-text-primary truncate">
                      {{ rental.tenants?.nama_lengkap }}
                    </p>
                    <span class="text-[10px] bg-income/10 text-income font-bold px-2 py-0.5 rounded-full border border-income/20 flex-shrink-0">
                      ⚡ Klik untuk Bayar
                    </span>
                  </div>
                  <p class="text-xs font-bold text-text-secondary mt-0.5">
                    Tagihan: <span class="text-green-700">{{ formatCurrency(rental.rooms?.harga_bulanan || 0) }}</span>
                    <span v-if="rental.tanggal_jatuh_tempo" class="text-text-muted font-normal ml-2">
                      · Jatuh Tempo: {{ formatDateDisplay(rental.tanggal_jatuh_tempo) }}
                    </span>
                  </p>
                </div>
              </div>

              <!-- Actions: Sudah Bayar & Send WA -->
              <div class="flex items-center gap-2 flex-shrink-0 text-right sm:text-left">
                <button
                  type="button"
                  @click.stop="openPaymentModal(rental)"
                  class="px-3.5 py-2.5 bg-income hover:brightness-110 active:scale-95 text-white font-extrabold rounded-xl text-xs shadow-sm transition-transform flex items-center justify-center gap-1.5"
                  title="Verifikasi Pembayaran"
                >
                  <span class="text-sm leading-none">✓</span>
                  <span>Sudah Bayar</span>
                </button>
                <button
                  type="button"
                  @click.stop="kirimTagihan(rental)"
                  class="px-3 py-2.5 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-extrabold rounded-xl text-xs shadow-sm transition-transform flex items-center justify-center gap-1.5"
                  title="Tagih via WhatsApp"
                >
                  <svg class="w-4 h-4 mr-0.5 fill-current inline-block text-white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.452 5.714 1.456h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  <span>WA</span>
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

    <!-- ========== MODAL VERIFIKASI PEMBAYARAN SEWA ========== -->
    <BaseModal v-if="showPaymentModal" class="bg-navy/60 backdrop-blur-sm animate-fade-in" @click="showPaymentModal = false">
      <div
        class="bg-white rounded-[var(--radius-card)] w-full max-w-md p-6 shadow-2xl border border-border animate-fade-in-up"
        @click.stop
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-border">
          <div class="flex items-center gap-3">
            <span class="w-10 h-10 rounded-xl bg-income/10 text-income flex items-center justify-center text-xl flex-shrink-0">
              💰
            </span>
            <div>
              <h3 class="text-xl font-extrabold text-text-primary">Verifikasi Pembayaran</h3>
              <p class="text-xs text-text-secondary mt-0.5 font-medium">Catat pelunasan sewa secara langsung</p>
            </div>
          </div>
          <button
            type="button"
            @click="showPaymentModal = false"
            class="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-text-muted hover:text-text-primary flex items-center justify-center font-bold text-lg transition-colors"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <!-- Detail Penghuni Card -->
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-text-muted">Kamar & Lokasi</span>
            <span class="text-xs font-black text-navy bg-navy/10 px-2 py-0.5 rounded-md">
              Kamar {{ selectedRental?.rooms?.nomor_kamar }} · {{ selectedRental?.rooms?.locations?.nama_lokasi }}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-text-muted">Nama Penghuni</span>
            <span class="text-sm font-extrabold text-text-primary">
              {{ selectedRental?.tenants?.nama_lengkap }}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-text-muted">Jatuh Tempo Saat Ini</span>
            <span class="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
              {{ formatDateDisplay(selectedRental?.tanggal_jatuh_tempo) }}
            </span>
          </div>
        </div>

        <!-- Error Feedback -->
        <div
          v-if="paymentError"
          class="bg-expense-light border border-expense/30 text-expense rounded-xl p-3 mb-4 text-xs font-bold flex items-center gap-2"
        >
          <span>⚠️</span>
          <span>{{ paymentError }}</span>
        </div>

        <!-- Form Body -->
        <form @submit.prevent="handleConfirmPayment" class="space-y-4">
          <!-- Nominal Bayar -->
          <div class="space-y-1.5">
            <label for="nominal-bayar" class="block text-sm font-bold text-text-primary">
              Nominal Diterima (Rp) <span class="text-expense">*</span>
            </label>
            <input
              id="nominal-bayar"
              v-model.number="paymentForm.nominal"
              type="number"
              inputmode="numeric"
              min="1"
              step="any"
              required
              class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-4 py-3 text-lg font-black text-income focus:border-income focus:ring-4 focus:ring-income/10 focus:outline-none transition-all"
            />
          </div>

          <!-- Tanggal Bayar -->
          <div class="space-y-1.5">
            <label for="tanggal-bayar" class="block text-sm font-bold text-text-primary">
              Tanggal Bayar <span class="text-expense">*</span>
            </label>
            <input
              id="tanggal-bayar"
              v-model="paymentForm.tanggal_bayar"
              type="date"
              required
              class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-4 py-3 text-base font-semibold text-text-primary focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none transition-all"
            />
          </div>

          <!-- Metode Bayar -->
          <div class="space-y-1.5">
            <label class="block text-sm font-bold text-text-primary">
              Metode Pembayaran
            </label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                @click="paymentForm.metode_bayar = 'Transfer'"
                class="py-2.5 px-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                :class="paymentForm.metode_bayar === 'Transfer' ? 'border-navy bg-navy text-white shadow-sm' : 'border-border bg-white text-text-secondary hover:bg-gray-50'"
              >
                <span>💳</span>
                <span>Transfer Bank</span>
              </button>
              <button
                type="button"
                @click="paymentForm.metode_bayar = 'Tunai'"
                class="py-2.5 px-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                :class="paymentForm.metode_bayar === 'Tunai' ? 'border-navy bg-navy text-white shadow-sm' : 'border-border bg-white text-text-secondary hover:bg-gray-50'"
              >
                <span>💵</span>
                <span>Tunai (Cash)</span>
              </button>
            </div>
          </div>

          <!-- Keterangan Tambahan -->
          <div class="space-y-1.5">
            <label for="keterangan-bayar" class="block text-sm font-bold text-text-primary">
              Keterangan
            </label>
            <input
              id="keterangan-bayar"
              v-model="paymentForm.keterangan"
              type="text"
              placeholder="Contoh: Sewa Kamar (Lunas via Transfer)"
              class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-4 py-2.5 text-xs font-semibold text-text-primary placeholder-text-muted focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none transition-all"
            />
          </div>

          <!-- Info Rollover Otomatis -->
          <p class="text-[11px] text-slate-500 bg-slate-50 border border-slate-200/80 rounded-xl p-3 leading-relaxed">
            💡 <strong>Otomatis:</strong> Setelah disimpan, arus kas masuk langsung tercatat dan tanggal jatuh tempo penyewa otomatis maju <strong>+1 bulan</strong>.
          </p>

          <!-- Action Buttons -->
          <div class="flex gap-3 pt-2">
            <button
              type="button"
              @click="showPaymentModal = false"
              class="flex-1 py-3 px-4 border-2 border-border text-text-secondary hover:bg-gray-50 active:bg-gray-100 font-bold rounded-[var(--radius-btn)] text-base transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="isSubmittingPayment || !paymentForm.nominal || paymentForm.nominal <= 0"
              class="flex-1 py-3 px-4 bg-income hover:brightness-110 active:scale-95 text-white font-extrabold rounded-[var(--radius-btn)] text-base shadow-md shadow-income/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              <svg v-if="isSubmittingPayment" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>{{ isSubmittingPayment ? 'Memproses...' : '✓ Konfirmasi Lunas' }}</span>
            </button>
          </div>
        </form>
      </div>
    </BaseModal>

    <!-- Bottom Navigation Bar -->
    <BottomNav />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { supabase } from '../supabase.js'
import BottomNav from '../components/BottomNav.vue'
import BaseModal from '../components/BaseModal.vue'
import { localDateStamp, advanceOneMonth } from '../lib/date.js'
import { getRoomBadgeFontSize } from '../lib/sewa.js'

const isLoading = ref(true)
const selectedLocationFilter = ref('ALL')

// Payment Modal States
const showPaymentModal = ref(false)
const selectedRental = ref(null)
const isSubmittingPayment = ref(false)
const paymentError = ref('')
const paymentSuccessMsg = ref('')

const paymentForm = reactive({
  nominal: 0,
  tanggal_bayar: '',
  metode_bayar: 'Transfer',
  keterangan: '',
})

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

// Tagihan bersama (location_id NULL) bulan ini.
// Dihitung di total "Semua Lokasi", tidak dihitung di total per kos.
const totalTagihanBersama = computed(() => {
  return expensesList.value
    .filter(item => item.location_id == null && item.tanggal_pengeluaran && item.tanggal_pengeluaran.startsWith(currentMonthPrefix.value))
    .reduce((sum, item) => sum + (item.nominal || 0), 0)
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
  const textMsg = `Halo ${tenantName}, mengingatkan untuk pembayaran sewa Kamar ${roomNo} periode bulan ini sebesar ${amountStr}. Pembayaran dapat ditransfer melalui nomor rekening Bank Mandiri 1440005288516 A.N Tutik Widayati. Jika sudah transfer, mohon kirimkan bukti transfernya ya. Terima kasih!`

  const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(textMsg)}`
  window.open(waUrl, '_blank')
}

// Payment Verification Modal Handlers
function openPaymentModal(rental) {
  if (!rental) return
  selectedRental.value = rental
  paymentForm.nominal = rental.rooms?.harga_bulanan || 0
  paymentForm.tanggal_bayar = localDateStamp()
  paymentForm.metode_bayar = 'Transfer'
  paymentForm.keterangan = `Sewa Kamar ${rental.rooms?.nomor_kamar || ''} (${rental.tenants?.nama_lengkap || ''})`
  paymentError.value = ''
  showPaymentModal.value = true
}

async function handleConfirmPayment() {
  if (!selectedRental.value) return
  if (!paymentForm.nominal || paymentForm.nominal <= 0) {
    paymentError.value = 'Nominal pembayaran harus lebih besar dari Rp 0.'
    return
  }
  if (!paymentForm.tanggal_bayar) {
    paymentError.value = 'Tanggal bayar harus diisi.'
    return
  }

  isSubmittingPayment.value = true
  paymentError.value = ''

  try {
    const rental = selectedRental.value
    const userKet = paymentForm.keterangan ? paymentForm.keterangan.trim() : ''
    const finalKeterangan = userKet
      ? `${userKet} (${paymentForm.metode_bayar})`
      : `Sewa Kamar (${paymentForm.metode_bayar})`

    const payload = {
      rental_id: rental.id,
      tanggal_bayar: paymentForm.tanggal_bayar,
      nominal: Number(paymentForm.nominal),
      keterangan: finalKeterangan,
    }
    if (rental.org_id) {
      payload.org_id = rental.org_id
    }

    // 1. Simpan ke incomes (hanya kolom yang ada di database)
    const { error: incomeError } = await supabase
      .from('incomes')
      .insert(payload)

    if (incomeError) throw incomeError

    // 2. Majukan jatuh tempo sewa +1 bulan di rentals
    if (rental.tanggal_jatuh_tempo) {
      const tanggalJatuhTempoBaru = advanceOneMonth(rental.tanggal_jatuh_tempo)

      const { error: updateRentalError } = await supabase
        .from('rentals')
        .update({ tanggal_jatuh_tempo: tanggalJatuhTempoBaru })
        .eq('id', rental.id)

      if (updateRentalError) throw updateRentalError
      rental.tanggal_jatuh_tempo = tanggalJatuhTempoBaru
    }

    showPaymentModal.value = false
    paymentSuccessMsg.value = `Pembayaran Kamar ${rental.rooms?.nomor_kamar || ''} (${rental.tenants?.nama_lengkap || ''}) berhasil diverifikasi!`
    setTimeout(() => {
      paymentSuccessMsg.value = ''
    }, 4000)

    // 3. Reload data keuangan agar daftar piutang & total pemasukan langsung ter-update
    await loadFinanceData()
  } catch (err) {
    console.error('[SimKos] Gagal memverifikasi pembayaran:', err)
    paymentError.value = `Gagal menyimpan: ${err.message || 'Terjadi kesalahan'}`
  } finally {
    isSubmittingPayment.value = false
  }
}

// Helpers
function formatDateDisplay(dateStr) {
  if (!dateStr) return '-'
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}
function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}
</script>
