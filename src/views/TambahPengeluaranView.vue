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
          <h1 class="text-2xl font-extrabold tracking-tight">Catat Uang Keluar</h1>
          <p class="text-sm text-blue-200 mt-0.5 font-medium">Rekam transaksi pengeluaran operasional</p>
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
              class="w-full px-5 py-4 bg-white border-2 border-gray-200 rounded-xl appearance-none focus:outline-none focus:border-navy text-lg font-medium text-gray-800 shadow-sm"
            >
              <option value="" disabled hidden selected>-- Pilih Lokasi Kos --</option>
              <option v-for="loc in locationList" :key="loc.id" :value="loc.id">
                {{ loc.nama_lokasi }}
              </option>
            </select>
            <div class="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Tanggal & Kategori (2 Col Layout) -->
        <div class="grid grid-cols-2 gap-4 animate-fade-in-up animate-stagger-2">
          <!-- Tanggal -->
          <div class="space-y-2">
            <label for="tanggal" class="block text-base font-bold text-text-primary">
              Tanggal <span class="text-expense">*</span>
            </label>
            <div class="relative rounded-[var(--radius-btn)] border-2 border-border bg-card focus-within:border-navy focus-within:ring-4 focus-within:ring-navy/10 transition-all duration-200 shadow-sm">
              <!-- Visual Text Overlay -->
              <div class="w-full px-4 py-4 text-base font-semibold text-text-primary flex items-center justify-between pointer-events-none">
                <span>{{ formatDateDisplay(form.tanggal) }}</span>
                <span class="text-text-muted">📅</span>
              </div>
              <!-- Native Date Input -->
              <input
                id="tanggal"
                v-model="form.tanggal"
                type="date"
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>
          </div>

          <!-- Kategori -->
          <div class="space-y-2">
            <label for="kategori" class="block text-base font-bold text-text-primary">
              Kategori <span class="text-expense">*</span>
            </label>
            <div class="relative">
              <select
                id="kategori"
                v-model="form.kategori"
                class="w-full px-5 py-4 bg-white border-2 border-gray-200 rounded-xl appearance-none focus:outline-none focus:border-navy text-lg font-medium text-gray-800 shadow-sm"
              >
                <option value="Listrik">⚡ Listrik</option>
                <option value="Air">💧 Air</option>
                <option value="Kebersihan">🧹 Kebersihan</option>
                <option value="Perbaikan">🛠️ Perbaikan</option>
                <option value="Lainnya">📦 Lainnya</option>
              </select>
              <div class="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <!-- Nominal -->
        <div class="space-y-2 animate-fade-in-up animate-stagger-3">
          <label for="nominal" class="block text-lg font-bold text-text-primary">
            Nominal Pengeluaran <span class="text-expense">*</span>
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
        <div class="space-y-2 animate-fade-in-up animate-stagger-4">
          <label for="keterangan" class="block text-lg font-bold text-text-primary">
            Keterangan
          </label>
          <textarea
            id="keterangan"
            v-model="form.keterangan"
            rows="3"
            placeholder="Tulis detail pengeluaran..."
            class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                   px-5 py-4 text-lg font-semibold text-text-primary placeholder-text-muted
                   focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                   transition-all duration-200 shadow-sm resize-none"
          />
        </div>

        <!-- Bukti Nota -->
        <div class="space-y-2 animate-fade-in-up animate-stagger-5">
          <label class="block text-lg font-bold text-text-primary">
            Bukti Nota / Kuitansi
          </label>
          <!-- Hidden Input -->
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleFileSelect"
          />
          <!-- Trigger / Preview Area -->
          <div
            v-if="!receiptPreview"
            @click="fileInputRef?.click()"
            class="w-full border-2 border-dashed border-border rounded-[var(--radius-card)] p-6
                   flex flex-col items-center justify-center gap-2 cursor-pointer
                   bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-150"
          >
            <div class="w-12 h-12 rounded-2xl bg-expense/10 flex items-center justify-center">
              <svg class="w-6 h-6 text-expense" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
            </div>
            <p class="text-base font-bold text-text-primary">Foto Nota Belanja</p>
            <p class="text-xs text-text-muted">JPG, PNG (maks. 5MB)</p>
          </div>
          <div v-else class="relative">
            <img
              :src="receiptPreview"
              alt="Preview Nota"
              class="w-full h-48 object-cover rounded-[var(--radius-card)] border-2 border-border shadow-sm"
            />
            <button
              @click="removeFile"
              class="absolute top-2 right-2 w-10 h-10 rounded-xl bg-expense text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              aria-label="Hapus"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <p class="text-sm font-semibold text-text-secondary mt-2 truncate">{{ receiptFile?.name }}</p>
          </div>
        </div>

        <!-- Submit Button (Raksasa chunky) -->
        <div class="pt-4">
          <button
            @click="handleSubmit"
            :disabled="isSubmitting || !isFormValid"
            class="w-full bg-expense text-white rounded-[var(--radius-btn)]
                   px-6 py-5 text-xl font-extrabold shadow-lg shadow-expense/25
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
            <span>{{ isSubmitting ? 'Menyimpan...' : 'Simpan Pengeluaran' }}</span>
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

// UI States
const isLoadingLocations = ref(true)
const isSubmitting = ref(false)
const successMsg = ref('')
const errorMsg = ref('')

// Form & Data States
const locationList = ref([])
const receiptFile = ref(null)
const receiptPreview = ref(null)
const fileInputRef = ref(null)

const form = reactive({
  location_id: '',
  tanggal: new Date().toISOString().split('T')[0],
  kategori: 'Listrik',
  nominal: null,
  keterangan: '',
})

// Validation
const isFormValid = computed(() => {
  return form.location_id && form.tanggal && form.kategori && form.nominal > 0
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

// File handling
function handleFileSelect(e) {
  const file = e.target.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    errorMsg.value = 'Nota harus berupa file gambar.'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    errorMsg.value = 'Ukuran berkas melebihi 5MB.'
    return
  }

  errorMsg.value = ''
  receiptFile.value = file
  receiptPreview.value = URL.createObjectURL(file)
}

function removeFile() {
  receiptFile.value = null
  receiptPreview.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

// Submit Expense
async function handleSubmit() {
  if (!isFormValid.value) return

  isSubmitting.value = true
  errorMsg.value = ''
  successMsg.value = ''

  let receiptPath = null

  try {
    // 1. Upload receipt if exists
    if (receiptFile.value) {
      const timestamp = Date.now()
      const ext = receiptFile.value.name.split('.').pop()
      const fileName = `receipt_${timestamp}.${ext}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipt_images')
        .upload(fileName, receiptFile.value, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw new Error(`Gagal unggah nota: ${uploadError.message}`)
      receiptPath = uploadData.path
    }

    // 2. Insert to expenses table
    const { error: insertError } = await supabase
      .from('expenses')
      .insert({
        location_id: form.location_id,
        tanggal_pengeluaran: form.tanggal,
        kategori: form.kategori,
        nominal: form.nominal,
        keterangan: form.keterangan.trim() || null,
        bukti_nota_url: receiptPath,
      })

    if (insertError) {
      // Cleanup uploaded file if DB insert fails
      if (receiptPath) {
        await supabase.storage.from('receipt_images').remove([receiptPath])
      }
      throw new Error(`Gagal menyimpan data pengeluaran: ${insertError.message}`)
    }

    successMsg.value = 'Pengeluaran berhasil dicatat!'
    setTimeout(() => {
      router.push('/')
    }, 1500)

  } catch (err) {
    errorMsg.value = err.message
    console.error('[SimKos] Gagal catat pengeluaran:', err)
  } finally {
    isSubmitting.value = false
  }
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}
</script>
