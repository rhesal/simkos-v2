<template>
  <div>
    <!-- Header -->
    <header class="bg-navy text-white px-6 pt-5 pb-6 shadow-lg rounded-b-[1.5rem]">
      <div class="flex items-center gap-4">
        <button
          @click="$router.back()"
          class="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
          aria-label="Kembali"
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight">Catat Uang Masuk</h1>
          <p class="text-sm text-blue-200 mt-0.5 font-medium">Rekam pembayaran sewa penghuni</p>
        </div>
      </div>
    </header>

    <!-- Form Body -->
    <div class="px-6 py-6 space-y-6 max-w-lg mx-auto">

      <!-- Success Feedback -->
      <div
        v-if="successMsg"
        class="bg-income-light border-2 border-income/30 text-income rounded-[var(--radius-card)] p-5 flex items-center gap-3 animate-fade-in-up"
      >
        <svg class="w-7 h-7 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="text-lg font-bold">{{ successMsg }}</span>
      </div>

      <!-- Error Feedback -->
      <div
        v-if="errorMsg"
        class="bg-expense-light border-2 border-expense/30 text-expense rounded-[var(--radius-card)] p-5 flex items-center gap-3 animate-fade-in-up"
      >
        <svg class="w-7 h-7 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <span class="text-lg font-bold">{{ errorMsg }}</span>
      </div>

      <!-- Loading locations indicator -->
      <div v-if="isLoadingLocations" class="flex items-center justify-center py-8">
        <svg class="w-8 h-8 animate-spin text-navy" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span class="ml-3 text-lg font-semibold text-text-secondary">Memuat lokasi...</span>
      </div>

      <template v-else>
        <!-- Dropdown Lokasi -->
        <div class="space-y-2 animate-fade-in-up animate-stagger-1">
          <label for="lokasi-select" class="block text-lg font-bold text-text-primary">
            Lokasi Kos <span class="text-expense">*</span>
          </label>
          <div class="relative">
            <select
              id="lokasi-select"
              v-model="form.location_id"
              class="w-full appearance-none bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-5 py-4 text-lg font-semibold text-text-primary
                     focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                     transition-all duration-200 shadow-sm"
            >
              <option value="" disabled>-- Pilih Lokasi Kos --</option>
              <option v-for="loc in locationList" :key="loc.id" :value="loc.id">
                {{ loc.nama_lokasi }}
              </option>
            </select>
            <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg class="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Dropdown Kamar (Hanya terisi) -->
        <div class="space-y-2 animate-fade-in-up animate-stagger-2">
          <label for="kamar-select" class="block text-lg font-bold text-text-primary">
            Pilih Kamar Terisi <span class="text-expense">*</span>
          </label>
          
          <div v-if="isLoadingRooms" class="flex items-center gap-3 px-5 py-4">
            <svg class="w-6 h-6 animate-spin text-navy" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span class="text-base font-semibold text-text-secondary">Memuat kamar...</span>
          </div>

          <div v-else class="relative">
            <select
              id="kamar-select"
              v-model="form.room_id"
              :disabled="!form.location_id || occupiedRooms.length === 0"
              class="w-full appearance-none bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-5 py-4 text-lg font-semibold text-text-primary
                     focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                     transition-all duration-200 shadow-sm
                     disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="" disabled>
                {{ !form.location_id ? '-- Pilih lokasi dahulu --' : occupiedRooms.length === 0 ? '-- Tidak ada kamar terisi --' : '-- Pilih Kamar --' }}
              </option>
              <option v-for="room in occupiedRooms" :key="room.id" :value="room.id">
                Kamar {{ room.nomor_kamar }} — {{ formatCurrency(room.harga_bulanan) }}
              </option>
            </select>
            <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg class="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>
          <p v-if="form.location_id && !isLoadingRooms && occupiedRooms.length === 0" class="text-sm font-semibold text-jatuh-tempo mt-1">
            ⚠️ Tidak ada kamar terisi (terdaftar penyewaan aktif) di lokasi ini.
          </p>
        </div>

        <!-- Detail Sewa / Lanjutan (Tampil setelah Kamar terpilih) -->
        <div v-if="isLoadingRental" class="flex items-center justify-center py-6">
          <svg class="w-7 h-7 animate-spin text-navy" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span class="ml-3 text-base font-semibold text-text-secondary">Memuat data penyewaan...</span>
        </div>

        <template v-else-if="form.room_id && activeRental">
          <!-- Info Rental Summary -->
          <div class="bg-gray-100 border border-border p-4 rounded-[var(--radius-card)] space-y-2 animate-fade-in-up">
            <p class="text-base font-bold text-text-primary">
              Penghuni: <span class="text-navy">{{ activeRental.tenants?.nama_lengkap || 'Tidak diketahui' }}</span>
            </p>
            <p class="text-sm font-semibold text-text-secondary">
              Tipe Sewa: <span class="capitalize">{{ activeRental.tipe_sewa }}</span> · Tanggal Jatuh Tempo: {{ activeRental.tanggal_jatuh_tempo }}
            </p>
          </div>

          <!-- Tanggal Bayar -->
          <div class="space-y-2 animate-fade-in-up">
            <label for="tanggal_bayar" class="block text-lg font-bold text-text-primary">
              Tanggal Bayar <span class="text-expense">*</span>
            </label>
            <input
              id="tanggal_bayar"
              v-model="form.tanggal_bayar"
              type="date"
              class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-5 py-4 text-lg font-semibold text-text-primary
                     focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                     transition-all duration-200 shadow-sm"
            />
          </div>

          <!-- Nominal Pemasukan -->
          <div class="space-y-2 animate-fade-in-up">
            <label for="nominal" class="block text-lg font-bold text-text-primary">
              Nominal Pemasukan <span class="text-expense">*</span>
            </label>
            <div class="relative">
              <span class="absolute left-5 top-1/2 -translate-y-1/2 text-lg font-bold text-text-muted">Rp</span>
              <input
                id="nominal"
                v-model.number="form.nominal"
                type="number"
                inputmode="numeric"
                placeholder="0"
                class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                       pl-14 pr-5 py-4 text-lg font-bold text-text-primary placeholder-text-muted
                       focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                       transition-all duration-200 shadow-sm"
              />
            </div>
          </div>

          <!-- Keterangan -->
          <div class="space-y-2 animate-fade-in-up">
            <label for="keterangan" class="block text-lg font-bold text-text-primary">
              Keterangan
            </label>
            <input
              id="keterangan"
              v-model="form.keterangan"
              type="text"
              placeholder="Contoh: Bayar sewa bulan Juli"
              class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-5 py-4 text-lg font-semibold text-text-primary placeholder-text-muted
                     focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                     transition-all duration-200 shadow-sm"
            />
          </div>

          <!-- Submit Button (Raksasa chunky hijau) -->
          <div class="pt-4 animate-fade-in-up">
            <button
              @click="handleSubmit"
              :disabled="isSubmitting || !isFormValid"
              class="w-full bg-income text-white rounded-[var(--radius-btn)]
                     px-6 py-5 text-xl font-extrabold shadow-lg shadow-income/25
                     active:scale-[0.97] transition-all duration-150
                     hover:shadow-xl hover:brightness-105
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
                     flex items-center justify-center gap-3"
            >
              <svg v-if="!isSubmitting" class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg v-else class="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>{{ isSubmitting ? 'Menyimpan...' : 'Simpan Pemasukan' }}</span>
            </button>
          </div>
        </template>
      </template>

      <div class="h-8"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase.js'

const router = useRouter()

// UI States
const isLoadingLocations = ref(true)
const isLoadingRooms = ref(false)
const isLoadingRental = ref(false)
const isSubmitting = ref(false)
const successMsg = ref('')
const errorMsg = ref('')

// Form & Data States
const locationList = ref([])
const roomList = ref([])
const activeRental = ref(null)

const form = reactive({
  location_id: '',
  room_id: '',
  tanggal_bayar: new Date().toISOString().split('T')[0],
  nominal: null,
  keterangan: '',
})

// Occupied rooms in selected location
const occupiedRooms = computed(() => {
  return roomList.value.filter(r => (r.status || '').toLowerCase() === 'terisi')
})

// Validation
const isFormValid = computed(() => {
  return form.room_id && activeRental.value && form.tanggal_bayar && form.nominal > 0
})

// Fetch Locations
onMounted(async () => {
  const { data, error } = await supabase
    .from('locations')
    .select('id, nama_lokasi')
    .order('nama_lokasi', { ascending: true })

  isLoadingLocations.value = false

  if (error) {
    console.error('[Supabase] Fetch locations error:', error)
    errorMsg.value = `Gagal memuat lokasi: ${error.message}`
  } else {
    locationList.value = data || []
  }
})

// Fetch Rooms on location change
watch(() => form.location_id, async (newId) => {
  form.room_id = ''
  roomList.value = []
  activeRental.value = null

  if (!newId) return

  isLoadingRooms.value = true

  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('location_id', newId)
    .order('nomor_kamar', { ascending: true })

  isLoadingRooms.value = false

  if (error) {
    console.error('[Supabase] Fetch rooms error:', error)
  } else {
    roomList.value = data || []
  }
})

// Fetch Active Rental and auto-fill price on Room change
watch(() => form.room_id, async (newRoomId) => {
  activeRental.value = null
  form.nominal = null

  if (!newRoomId) return

  isLoadingRental.value = true

  const { data, error } = await supabase
    .from('rentals')
    .select('*, tenants(nama_lengkap)')
    .eq('room_id', newRoomId)
    .eq('status_aktif', true)
    .maybeSingle()

  isLoadingRental.value = false

  if (error) {
    console.error('[Supabase] Fetch rental error:', error)
    errorMsg.value = `Gagal memuat detail rental: ${error.message}`
  } else if (!data) {
    errorMsg.value = 'Tidak ada penyewaan aktif yang ditemukan untuk kamar ini.'
  } else {
    errorMsg.value = ''
    activeRental.value = data

    // Autofill nominal using room price
    const selectedRoom = roomList.value.find(r => r.id === newRoomId)
    if (selectedRoom) {
      form.nominal = selectedRoom.harga_bulanan || 0
    }
  }
})

// Submit Income
async function handleSubmit() {
  if (!isFormValid.value) return

  isSubmitting.value = true
  errorMsg.value = ''
  successMsg.value = ''

  try {
    const { error } = await supabase
      .from('incomes')
      .insert({
        rental_id: activeRental.value.id,
        tanggal_bayar: form.tanggal_bayar,
        nominal: form.nominal,
        keterangan: form.keterangan.trim() || null,
      })

    if (error) throw error

    successMsg.value = 'Pembayaran berhasil disimpan!'
    setTimeout(() => {
      router.push('/')
    }, 1500)

  } catch (err) {
    errorMsg.value = `Gagal menyimpan: ${err.message}`
    console.error('[Supabase] Insert income error:', err)
  } finally {
    isSubmitting.value = false
  }
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
