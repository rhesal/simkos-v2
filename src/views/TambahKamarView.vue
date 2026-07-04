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
          <h1 class="text-2xl font-extrabold tracking-tight">Tambah Kamar</h1>
          <p class="text-sm text-blue-200 mt-0.5 font-medium">Daftarkan kamar baru ke lokasi</p>
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

      <!-- Loading state for locations -->
      <div v-if="isLoadingLocations" class="flex items-center justify-center py-8">
        <svg class="w-8 h-8 animate-spin text-navy" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span class="ml-3 text-lg font-semibold text-text-secondary">Memuat lokasi...</span>
      </div>

      <template v-else>
        <!-- Pilih Lokasi -->
        <div class="space-y-2 animate-fade-in-up animate-stagger-1">
          <label for="lokasi-select" class="block text-lg font-bold text-text-primary">
            Pilih Lokasi <span class="text-expense">*</span>
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
          <p v-if="locationList.length === 0" class="text-sm font-semibold text-jatuh-tempo mt-1">
            ⚠️ Belum ada lokasi. Silakan tambah lokasi terlebih dahulu.
          </p>
        </div>

        <!-- Nomor Kamar -->
        <div class="space-y-2 animate-fade-in-up animate-stagger-2">
          <label for="nomor-kamar" class="block text-lg font-bold text-text-primary">
            Nomor Kamar <span class="text-expense">*</span>
          </label>
          <input
            id="nomor-kamar"
            v-model="form.nomor_kamar"
            type="text"
            placeholder="Contoh: 01, A1, dll."
            class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                   px-5 py-4 text-lg font-semibold text-text-primary placeholder-text-muted
                   focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                   transition-all duration-200 shadow-sm"
          />
        </div>

        <!-- Harga: 2 kolom -->
        <div class="grid grid-cols-2 gap-4 animate-fade-in-up animate-stagger-3">
          <!-- Harga Harian -->
          <div class="space-y-2">
            <label for="harga-harian" class="block text-base font-bold text-text-primary">
              Harga Harian
            </label>
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-text-muted">Rp</span>
              <input
                id="harga-harian"
                v-model.number="form.harga_harian"
                type="number"
                inputmode="numeric"
                placeholder="0"
                class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                       pl-12 pr-4 py-4 text-lg font-semibold text-text-primary placeholder-text-muted
                       focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                       transition-all duration-200 shadow-sm"
              />
            </div>
          </div>

          <!-- Harga Bulanan -->
          <div class="space-y-2">
            <label for="harga-bulanan" class="block text-base font-bold text-text-primary">
              Harga Bulanan
            </label>
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-text-muted">Rp</span>
              <input
                id="harga-bulanan"
                v-model.number="form.harga_bulanan"
                type="number"
                inputmode="numeric"
                placeholder="0"
                class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                       pl-12 pr-4 py-4 text-lg font-semibold text-text-primary placeholder-text-muted
                       focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                       transition-all duration-200 shadow-sm"
              />
            </div>
          </div>
        </div>

        <!-- Status Kamar -->
        <div class="space-y-2 animate-fade-in-up animate-stagger-4">
          <label for="status-kamar" class="block text-lg font-bold text-text-primary">
            Status Kamar
          </label>
          <div class="relative">
            <select
              id="status-kamar"
              v-model="form.status"
              class="w-full appearance-none bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-5 py-4 text-lg font-semibold text-text-primary
                     focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                     transition-all duration-200 shadow-sm"
            >
              <option value="kosong">⚪ Kosong</option>
              <option value="lunas">🟢 Lunas</option>
              <option value="jatuh-tempo">🟡 Jatuh Tempo</option>
              <option value="terlambat">🔴 Terlambat</option>
            </select>
            <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg class="w-6 h-6 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <div class="animate-fade-in-up animate-stagger-5 pt-2">
          <button
            @click="handleSubmit"
            :disabled="isSubmitting || !isFormValid"
            class="w-full bg-navy text-white rounded-[var(--radius-btn)]
                   px-6 py-5 text-xl font-extrabold shadow-lg shadow-navy/25
                   active:scale-[0.97] transition-all duration-150
                   hover:shadow-xl hover:brightness-110
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
            <span>{{ isSubmitting ? 'Menyimpan...' : 'Simpan Kamar' }}</span>
          </button>
        </div>
      </template>

      <div class="h-8"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase.js'

const router = useRouter()
const isSubmitting = ref(false)
const isLoadingLocations = ref(true)
const successMsg = ref('')
const errorMsg = ref('')
const locationList = ref([])

const form = reactive({
  location_id: '',
  nomor_kamar: '',
  harga_harian: null,
  harga_bulanan: null,
  status: 'kosong',
})

const isFormValid = computed(() => {
  return form.location_id && form.nomor_kamar.trim()
})

// Fetch locations from Supabase on mount
onMounted(async () => {
  const { data, error } = await supabase
    .from('locations')
    .select('id, nama_lokasi')
    .order('nama_lokasi', { ascending: true })

  isLoadingLocations.value = false

  if (error) {
    errorMsg.value = `Gagal memuat lokasi: ${error.message}`
    console.error('[Supabase] Fetch locations error:', error)
  } else {
    locationList.value = data || []
    console.log('[Supabase] Locations loaded:', data)
  }
})

async function handleSubmit() {
  if (!isFormValid.value) return

  isSubmitting.value = true
  errorMsg.value = ''
  successMsg.value = ''

  const payload = {
    location_id: form.location_id,
    nomor_kamar: form.nomor_kamar.trim(),
    harga_harian: form.harga_harian || 0,
    harga_bulanan: form.harga_bulanan || 0,
    status: form.status,
  }

  const { data, error } = await supabase
    .from('rooms')
    .insert(payload)
    .select()

  isSubmitting.value = false

  if (error) {
    errorMsg.value = `Gagal menyimpan: ${error.message}`
    console.error('[Supabase] Insert room error:', error)
  } else {
    successMsg.value = 'Kamar berhasil disimpan!'
    console.log('[Supabase] Kamar baru:', data)
    setTimeout(() => {
      router.push('/')
    }, 1000)
  }
}
</script>
