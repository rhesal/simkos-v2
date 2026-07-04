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
          <h1 class="text-2xl font-extrabold tracking-tight">Daftar Penghuni</h1>
          <p class="text-sm text-blue-200 mt-0.5 font-medium">Pendaftaran penghuni baru</p>
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

      <!-- Step Progress Indicator (saat submit) -->
      <div
        v-if="isSubmitting"
        class="bg-white border-2 border-border rounded-[var(--radius-card)] p-5 space-y-4 animate-fade-in-up"
      >
        <p class="text-lg font-bold text-text-primary">Memproses pendaftaran...</p>
        <div class="space-y-3">
          <div v-for="(step, i) in submitSteps" :key="i" class="flex items-center gap-3">
            <!-- Done -->
            <svg v-if="step.done" class="w-6 h-6 text-income flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <!-- Active -->
            <svg v-else-if="step.active" class="w-6 h-6 animate-spin text-navy flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <!-- Pending -->
            <div v-else class="w-6 h-6 rounded-full border-2 border-border flex-shrink-0"></div>
            <span class="text-base font-semibold" :class="step.done ? 'text-income' : step.active ? 'text-navy' : 'text-text-muted'">
              {{ step.label }}
            </span>
          </div>
        </div>
      </div>

      <!-- ===== FORM FIELDS ===== -->
      <template v-if="!isSubmitting && !successMsg">

        <!-- ===== SECTION 1: PEMILIHAN KAMAR ===== -->
        <div class="space-y-2">
          <h2 class="text-xl font-black text-text-primary tracking-tight border-b-2 border-border pb-2">📍 Pemilihan Kamar</h2>
        </div>

        <!-- Pilih Lokasi -->
        <div class="space-y-2 animate-fade-in-up animate-stagger-1">
          <label for="lokasi-select" class="block text-lg font-bold text-text-primary">
            Pilih Lokasi <span class="text-expense">*</span>
          </label>

          <div v-if="isLoadingLocations" class="flex items-center gap-3 px-5 py-4">
            <svg class="w-6 h-6 animate-spin text-navy" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span class="text-base font-semibold text-text-secondary">Memuat lokasi...</span>
          </div>

          <div v-else class="relative">
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

        <!-- Pilih Kamar -->
        <div class="space-y-2 animate-fade-in-up animate-stagger-2">
          <label for="kamar-select" class="block text-lg font-bold text-text-primary">
            Pilih Kamar <span class="text-expense">*</span>
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
              :disabled="availableRooms.length === 0"
              class="w-full px-5 py-4 bg-white border-2 border-gray-200 rounded-xl appearance-none focus:outline-none focus:border-navy text-lg font-medium text-gray-800 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="" disabled hidden selected>
                {{ !form.location_id ? '-- Pilih lokasi dahulu --' : availableRooms.length === 0 ? '-- Tidak ada kamar tersedia --' : '-- Pilih Kamar --' }}
              </option>
              <option v-for="room in availableRooms" :key="room.id" :value="room.id">
                Kamar {{ room.nomor_kamar }} — {{ formatCurrency(room.harga_bulanan || 0) }}/bln
              </option>
            </select>
            <div class="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>
          <p v-if="form.location_id && !isLoadingRooms && availableRooms.length === 0" class="text-sm font-semibold text-jatuh-tempo mt-1">
            ⚠️ Semua kamar di lokasi ini sudah terisi.
          </p>
        </div>

        <!-- ===== SECTION 2: DATA PENGHUNI ===== -->
        <div class="space-y-2 pt-2">
          <h2 class="text-xl font-black text-text-primary tracking-tight border-b-2 border-border pb-2">👤 Data Penghuni</h2>
        </div>

        <!-- Nama Lengkap -->
        <div class="space-y-2 animate-fade-in-up animate-stagger-3">
          <label for="nama" class="block text-lg font-bold text-text-primary">
            Nama Lengkap <span class="text-expense">*</span>
          </label>
          <input
            id="nama"
            v-model="form.nama_lengkap"
            type="text"
            placeholder="Contoh: Budi Santoso"
            class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                   px-5 py-4 text-lg font-semibold text-text-primary placeholder-text-muted
                   focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                   transition-all duration-200 shadow-sm"
          />
        </div>

        <!-- Nomor HP -->
        <div class="space-y-2 animate-fade-in-up animate-stagger-4">
          <label for="hp" class="block text-lg font-bold text-text-primary">
            Nomor HP <span class="text-expense">*</span>
          </label>
          <input
            id="hp"
            v-model="form.nomor_hp"
            type="tel"
            inputmode="tel"
            placeholder="Contoh: 081234567890"
            class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                   px-5 py-4 text-lg font-semibold text-text-primary placeholder-text-muted
                   focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                   transition-all duration-200 shadow-sm"
          />
        </div>

        <!-- Kontak Darurat -->
        <div class="space-y-2 animate-fade-in-up animate-stagger-5">
          <label for="darurat" class="block text-lg font-bold text-text-primary">
            Kontak Darurat
          </label>
          <input
            id="darurat"
            v-model="form.kontak_darurat"
            type="tel"
            inputmode="tel"
            placeholder="Contoh: 089876543210"
            class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                   px-5 py-4 text-lg font-semibold text-text-primary placeholder-text-muted
                   focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                   transition-all duration-200 shadow-sm"
          />
        </div>

        <!-- Upload Foto KTP -->
        <div class="space-y-2 animate-fade-in-up">
          <label class="block text-lg font-bold text-text-primary">
            Foto KTP <span class="text-expense">*</span>
          </label>

          <!-- File Input (Hidden) -->
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleFileSelect"
          />

          <!-- Custom Upload Button / Preview -->
          <div
            v-if="!ktpPreview"
            @click="fileInputRef?.click()"
            class="w-full border-2 border-dashed border-border rounded-[var(--radius-card)] p-8
                   flex flex-col items-center justify-center gap-3 cursor-pointer
                   bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-150"
          >
            <div class="w-14 h-14 rounded-2xl bg-navy/10 flex items-center justify-center">
              <svg class="w-7 h-7 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
            </div>
            <p class="text-base font-bold text-text-primary">Ketuk untuk ambil foto KTP</p>
            <p class="text-sm text-text-muted">Format: JPG, PNG (maks. 5MB)</p>
          </div>

          <!-- Preview -->
          <div v-else class="relative">
            <img
              :src="ktpPreview"
              alt="Preview KTP"
              class="w-full h-48 object-cover rounded-[var(--radius-card)] border-2 border-border shadow-sm"
            />
            <button
              @click="removeFile"
              class="absolute top-2 right-2 w-10 h-10 rounded-xl bg-expense text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              aria-label="Hapus foto"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <p class="text-sm font-semibold text-text-secondary mt-2">{{ ktpFile?.name }}</p>
          </div>
        </div>

        <!-- ===== SECTION 3: DETAIL SEWA ===== -->
        <div class="space-y-2 pt-2">
          <h2 class="text-xl font-black text-text-primary tracking-tight border-b-2 border-border pb-2">📋 Detail Sewa</h2>
        </div>

        <!-- Tipe Sewa -->
        <div class="space-y-2 animate-fade-in-up">
          <label for="tipe-sewa" class="block text-lg font-bold text-text-primary">
            Tipe Sewa <span class="text-expense">*</span>
          </label>
          <div class="relative">
            <select
              id="tipe-sewa"
              v-model="form.tipe_sewa"
              class="w-full px-5 py-4 bg-white border-2 border-gray-200 rounded-xl appearance-none focus:outline-none focus:border-navy text-lg font-medium text-gray-800 shadow-sm"
            >
              <option value="bulanan">📅 Bulanan</option>
              <option value="harian">🕐 Harian</option>
            </select>
            <div class="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>
        </div>

        <!-- Tanggal Masuk & Jatuh Tempo (2 kolom) -->
        <div class="grid grid-cols-2 gap-4 animate-fade-in-up">
          <div class="space-y-2">
            <label for="tgl-masuk" class="block text-base font-bold text-text-primary">
              Tanggal Masuk <span class="text-expense">*</span>
            </label>
            <div class="relative rounded-[var(--radius-btn)] border-2 border-border bg-card focus-within:border-navy focus-within:ring-4 focus-within:ring-navy/10 transition-all duration-200 shadow-sm">
              <!-- Visual Text Overlay -->
              <div class="w-full px-4 py-4 text-base font-semibold text-text-primary flex items-center justify-between pointer-events-none">
                <span>{{ formatDateDisplay(form.tanggal_masuk) }}</span>
                <span class="text-text-muted">📅</span>
              </div>
              <!-- Native Date Input -->
              <input
                id="tgl-masuk"
                v-model="form.tanggal_masuk"
                type="date"
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>
          </div>
          <div class="space-y-2">
            <label for="tgl-tempo" class="block text-base font-bold text-text-primary">
              Jatuh Tempo <span class="text-expense">*</span>
            </label>
            <div class="relative rounded-[var(--radius-btn)] border-2 border-border bg-card focus-within:border-navy focus-within:ring-4 focus-within:ring-navy/10 transition-all duration-200 shadow-sm">
              <!-- Visual Text Overlay -->
              <div class="w-full px-4 py-4 text-base font-semibold text-text-primary flex items-center justify-between pointer-events-none">
                <span>{{ formatDateDisplay(form.tanggal_jatuh_tempo) }}</span>
                <span class="text-text-muted">📅</span>
              </div>
              <!-- Native Date Input -->
              <input
                id="tgl-tempo"
                v-model="form.tanggal_jatuh_tempo"
                type="date"
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <div class="pt-4">
          <button
            @click="handleSubmit"
            :disabled="!isFormValid"
            class="w-full bg-navy text-white rounded-[var(--radius-btn)]
                   px-6 py-5 text-xl font-extrabold shadow-lg shadow-navy/25
                   active:scale-[0.97] transition-all duration-150
                   hover:shadow-xl hover:brightness-110
                   disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
                   flex items-center justify-center gap-3"
          >
            <svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Daftarkan Penghuni</span>
          </button>
        </div>
      </template>

      <div class="h-8"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../supabase.js'

const router = useRouter()
const route = useRoute()

// --- UI States ---
const isLoadingLocations = ref(true)
const isLoadingRooms = ref(false)
const isSubmitting = ref(false)
const successMsg = ref('')
const errorMsg = ref('')

// --- Data ---
const locationList = ref([])
const roomList = ref([])
const ktpFile = ref(null)
const ktpPreview = ref(null)
const fileInputRef = ref(null)

// --- Submit Steps Progress ---
const submitSteps = ref([
  { label: 'Mengunggah foto KTP...', active: false, done: false },
  { label: 'Menyimpan data penghuni...', active: false, done: false },
  { label: 'Membuat data sewa...', active: false, done: false },
  { label: 'Memperbarui status kamar...', active: false, done: false },
])

// --- Form ---
const form = reactive({
  location_id: '',
  room_id: '',
  nama_lengkap: '',
  nomor_hp: '',
  kontak_darurat: '',
  tipe_sewa: 'bulanan',
  tanggal_masuk: new Date().toISOString().split('T')[0],
  tanggal_jatuh_tempo: '',
})

// --- Computed ---
const availableRooms = computed(() => {
  return roomList.value.filter(r => {
    const s = (r.status || '').toLowerCase()
    return s !== 'terisi'
  })
})

const isFormValid = computed(() => {
  return (
    form.room_id &&
    form.nama_lengkap.trim() &&
    form.nomor_hp.trim() &&
    ktpFile.value &&
    form.tipe_sewa &&
    form.tanggal_masuk &&
    form.tanggal_jatuh_tempo
  )
})

// --- Fetch Locations ---
onMounted(async () => {
  const { data, error } = await supabase
    .from('locations')
    .select('id, nama_lokasi')
    .order('nama_lokasi', { ascending: true })

  isLoadingLocations.value = false

  if (error) {
    console.error('[Supabase] Fetch locations error:', error)
  } else {
    locationList.value = data || []
    
    // Pre-select location from route query
    if (route.query.location_id) {
      form.location_id = route.query.location_id
    }
  }
})

// --- Fetch Rooms saat lokasi berubah ---
watch(() => form.location_id, async (newId) => {
  form.room_id = ''
  roomList.value = []

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
    
    // Preselect room from route query if available
    if (route.query.room_id && roomList.value.some(r => r.id === route.query.room_id)) {
      form.room_id = route.query.room_id
    }
  }
})

// --- Otomatisasi Jatuh Tempo ---
watch(
  () => [form.tanggal_masuk, form.tipe_sewa],
  ([tglMasuk, tipeSewa]) => {
    if (!tglMasuk) return

    const parts = tglMasuk.split('-')
    if (parts.length !== 3) return

    const year = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const day = parseInt(parts[2], 10)

    const date = new Date(year, month, day)

    if (tipeSewa === 'bulanan') {
      date.setMonth(date.getMonth() + 1)
    } else if (tipeSewa === 'harian') {
      date.setDate(date.getDate() + 1)
    }

    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')

    form.tanggal_jatuh_tempo = `${y}-${m}-${d}`
  },
  { immediate: true }
)

// --- File Handling ---
function handleFileSelect(e) {
  const file = e.target.files?.[0]
  if (!file) return

  // Validasi: hanya gambar, maks 5MB
  if (!file.type.startsWith('image/')) {
    errorMsg.value = 'File harus berupa gambar (JPG, PNG, dll).'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    errorMsg.value = 'Ukuran file melebihi 5MB.'
    return
  }

  errorMsg.value = ''
  ktpFile.value = file
  ktpPreview.value = URL.createObjectURL(file)
}

function removeFile() {
  ktpFile.value = null
  ktpPreview.value = null
  if (fileInputRef.value) fileInputRef.value.value = ''
}

// --- Submit: Sequential Database Operations ---
async function handleSubmit() {
  if (!isFormValid.value) return

  isSubmitting.value = true
  errorMsg.value = ''
  successMsg.value = ''

  // Reset steps
  submitSteps.value.forEach(s => { s.active = false; s.done = false })

  let ktpPath = ''
  let tenantId = null

  try {
    // === STEP 1: Upload KTP ===
    submitSteps.value[0].active = true

    const timestamp = Date.now()
    const ext = ktpFile.value.name.split('.').pop()
    const fileName = `ktp_${timestamp}.${ext}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('ktp_images')
      .upload(fileName, ktpFile.value, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) throw new Error(`Gagal unggah KTP: ${uploadError.message}`)

    ktpPath = uploadData.path
    submitSteps.value[0].active = false
    submitSteps.value[0].done = true

    // === STEP 2: Insert Tenant ===
    submitSteps.value[1].active = true

    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        nama_lengkap: form.nama_lengkap.trim(),
        nomor_hp: form.nomor_hp.trim(),
        kontak_darurat: form.kontak_darurat.trim() || null,
        foto_ktp_url: ktpPath,
      })
      .select()
      .single()

    if (tenantError) throw new Error(`Gagal simpan penghuni: ${tenantError.message}`)

    tenantId = tenantData.id
    submitSteps.value[1].active = false
    submitSteps.value[1].done = true

    // === STEP 3: Insert Rental ===
    submitSteps.value[2].active = true

    const { error: rentalError } = await supabase
      .from('rentals')
      .insert({
        tenant_id: tenantId,
        room_id: form.room_id,
        tipe_sewa: form.tipe_sewa,
        tanggal_masuk: form.tanggal_masuk,
        tanggal_jatuh_tempo: form.tanggal_jatuh_tempo,
        status_aktif: true,
      })

    if (rentalError) throw new Error(`Gagal simpan data sewa: ${rentalError.message}`)

    submitSteps.value[2].active = false
    submitSteps.value[2].done = true

    // === STEP 4: Update Room Status ===
    submitSteps.value[3].active = true

    const { error: roomError } = await supabase
      .from('rooms')
      .update({ status_kamar: 'Terisi' })
      .eq('id', form.room_id)

    if (roomError) throw new Error(`Gagal update status kamar: ${roomError.message}`)

    submitSteps.value[3].active = false
    submitSteps.value[3].done = true

    // === SUCCESS ===
    isSubmitting.value = false
    successMsg.value = `${form.nama_lengkap} berhasil didaftarkan!`
    console.log('[SimKos] Pendaftaran penghuni sukses. Tenant ID:', tenantId)

    setTimeout(() => {
      router.push('/')
    }, 1500)

  } catch (err) {
    isSubmitting.value = false
    errorMsg.value = err.message
    console.error('[SimKos] Pendaftaran gagal:', err)

    // Cleanup: jika KTP sudah terunggah tapi proses selanjutnya gagal
    if (ktpPath) {
      console.log('[SimKos] Rollback: menghapus KTP yang sudah terunggah...')
      await supabase.storage.from('ktp_images').remove([ktpPath])
    }

    // Cleanup: jika tenant sudah ter-insert tapi rental/room gagal
    if (tenantId) {
      console.log('[SimKos] Rollback: menghapus tenant yang sudah ter-insert...')
      await supabase.from('tenants').delete().eq('id', tenantId)
    }
  }
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

function formatDateDisplay(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}
</script>
