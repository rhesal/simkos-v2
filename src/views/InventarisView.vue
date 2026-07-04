<template>
  <div class="min-h-screen bg-bg-primary pb-24">
    <!-- Header -->
    <header class="bg-navy rounded-b-4xl px-6 pt-12 pb-8 text-white shadow-lg max-w-lg mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-3xl font-black tracking-tight">Inventaris</h1>
        <button
          @click="bukaModalTambah"
          class="px-4 py-3 bg-white text-navy font-bold rounded-xl flex items-center justify-center gap-1.5 shadow active:scale-95 transition-transform"
        >
          <span>➕</span> Tambah
        </button>
      </div>

      <!-- Filters & Tabs Grid -->
      <div class="space-y-4">
        <!-- Location Filter -->
        <div class="space-y-1.5">
          <label for="location-filter" class="block text-xs font-bold text-blue-200">Lokasi Kos</label>
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

        <!-- Segmented Tab Control (Premium Switcher) -->
        <div class="flex bg-white/10 p-1.5 rounded-xl border border-white/10">
          <button
            @click="activeTab = 'Fasilitas Kamar'"
            class="flex-1 py-2.5 rounded-lg text-sm font-black transition-all"
            :class="activeTab === 'Fasilitas Kamar' ? 'bg-white text-navy shadow-sm' : 'text-blue-100 hover:text-white'"
          >
            🛏️ Fasilitas Kamar
          </button>
          <button
            @click="activeTab = 'Fasilitas Umum'"
            class="flex-1 py-2.5 rounded-lg text-sm font-black transition-all"
            :class="activeTab === 'Fasilitas Umum' ? 'bg-white text-navy shadow-sm' : 'text-blue-100 hover:text-white'"
          >
            🏢 Fasilitas Umum
          </button>
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
        <span class="text-base font-semibold text-text-secondary">Memuat data inventaris...</span>
      </div>

      <template v-else>
        <!-- Empty State -->
        <div
          v-if="filteredAssets.length === 0"
          class="bg-white rounded-[var(--radius-card)] border-2 border-dashed border-border p-12 text-center"
        >
          <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4 text-3xl">📦</div>
          <p class="text-lg font-bold text-text-primary mb-1">Aset tidak ditemukan</p>
          <p class="text-sm text-text-secondary">Belum ada barang inventaris terdaftar untuk kategori dan lokasi ini.</p>
        </div>

        <!-- Inventory List (Row Layout) -->
        <div v-else class="flex flex-col gap-3">
          <div
            v-for="asset in filteredAssets"
            :key="asset.id"
            class="bg-white rounded-[var(--radius-card)] border-2 border-border p-4 flex items-center justify-between gap-4 shadow-sm hover:shadow transition-all duration-150 relative overflow-hidden"
          >
            <!-- Left Side: Icon box and details -->
            <div class="flex items-center gap-3.5 min-w-0">
              <div class="w-14 h-14 rounded-2xl bg-slate-100 flex flex-col items-center justify-center flex-shrink-0 border border-border">
                <span v-if="asset.tipe_fasilitas === 'kamar'" class="text-xs font-black text-navy leading-none">
                  {{ asset.rooms?.nomor_kamar || 'Kmr' }}
                </span>
                <span v-else class="text-lg leading-none">🏢</span>
              </div>

              <!-- Asset Detail Text -->
              <div class="min-w-0">
                <p class="text-base font-extrabold text-text-primary truncate">
                  {{ asset.nama_barang }}
                </p>
                <div class="flex items-center gap-2 mt-1">
                  <!-- Condition Badge -->
                  <span
                    class="px-2 py-0.5 rounded text-[10px] font-black border"
                    :class="kondisiBadgeClass(asset.kondisi)"
                  >
                    {{ asset.kondisi }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Right Side: Buy date, Price, and Actions -->
            <div class="flex items-center gap-3 flex-shrink-0">
              <div class="text-right text-xs font-semibold text-text-secondary">
                <p>{{ formatDateDisplay(asset.tanggal_pembelian) }}</p>
                <p class="text-green-700 font-extrabold mt-0.5">{{ formatCurrency(asset.harga || 0) }}</p>
              </div>

              <!-- Action buttons -->
              <div class="flex items-center gap-1.5">
                <!-- View Receipt Button -->
                <button
                  v-if="asset.receipt_url"
                  @click="bukaFotoNota(asset.receipt_url)"
                  class="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm border border-blue-100 active:scale-95 transition-transform"
                  title="Lihat Nota"
                >
                  📷
                </button>
                <button
                  @click="bukaModalEdit(asset)"
                  class="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200 active:scale-95 transition-transform"
                  title="Ubah Aset"
                >
                  ✏️
                </button>
                <button
                  @click="hapusAset(asset)"
                  class="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm border border-red-200 active:scale-95 transition-transform"
                  title="Hapus Aset"
                >
                  🗑️
                </button>
              </div>
            </div>

            <!-- Location Overlay -->
            <span class="absolute right-3 top-1 text-[8px] font-bold text-text-muted opacity-30">
              {{ asset.locations?.nama_lokasi }}
            </span>
          </div>
        </div>
      </template>
    </div>

    <!-- Modal: Tambah / Edit Barang -->
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 pb-24 bg-navy/60 backdrop-blur-sm animate-fade-in"
    >
      <div class="bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[80vh] overflow-y-auto pb-8 animate-fade-in-up">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b-2 border-border pb-3">
          <h3 class="text-xl font-black text-text-primary flex items-center gap-2">
            <span>{{ form.id ? '✏️ Edit Barang' : '➕ Tambah Barang' }}</span>
          </h3>
          <button @click="showModal = false" class="text-text-muted hover:text-text-primary text-xl font-bold">✕</button>
        </div>

        <!-- Modal Fields -->
        <div class="space-y-4 py-2 pb-6">
          <!-- Nama Barang -->
          <div class="space-y-1.5">
            <label for="form-nama" class="block text-sm font-bold text-text-primary">Nama Barang</label>
            <input
              id="form-nama"
              v-model="form.nama_barang"
              type="text"
              placeholder="Contoh: AC Sharp 1/2 PK"
              class="w-full bg-card border-2 border-border rounded-xl px-4 py-3 text-base font-semibold text-text-primary focus:border-navy focus:outline-none"
            />
          </div>

          <!-- Tipe Fasilitas Segment -->
          <div class="space-y-1.5">
            <label class="block text-sm font-bold text-text-primary">Tipe Fasilitas</label>
            <div class="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button
                @click="form.tipe_fasilitas = 'kamar'"
                class="flex-1 py-2 rounded-lg text-xs font-black transition-all"
                :class="form.tipe_fasilitas === 'kamar' ? 'bg-white text-navy shadow-sm' : 'text-text-secondary'"
              >
                🛏️ Kamar
              </button>
              <button
                @click="form.tipe_fasilitas = 'umum'"
                class="flex-1 py-2 rounded-lg text-xs font-black transition-all"
                :class="form.tipe_fasilitas === 'umum' ? 'bg-white text-navy shadow-sm' : 'text-text-secondary'"
              >
                🏢 Umum
              </button>
            </div>
          </div>

          <!-- Lokasi Kos -->
          <div class="space-y-1.5">
            <label for="form-location" class="block text-sm font-bold text-text-primary">Lokasi Kos</label>
            <div class="relative">
              <select
                id="form-location"
                v-model="form.location_id"
                class="w-full bg-card border-2 border-border rounded-xl px-4 py-3 appearance-none text-base font-semibold text-text-primary focus:border-navy focus:outline-none"
              >
                <option value="">Pilih Lokasi</option>
                <option
                  v-for="loc in locationsList"
                  :key="loc.id"
                  :value="loc.id"
                >
                  {{ loc.nama_lokasi }}
                </option>
              </select>
              <div class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Kamar (Only shown for Kamar facilities) -->
          <div v-if="form.tipe_fasilitas === 'kamar'" class="space-y-1.5">
            <label for="form-room" class="block text-sm font-bold text-text-primary">Kamar</label>
            <div class="relative">
              <select
                id="form-room"
                v-model="form.room_id"
                class="w-full bg-card border-2 border-border rounded-xl px-4 py-3 appearance-none text-base font-semibold text-text-primary focus:border-navy focus:outline-none"
              >
                <option value="">Pilih Kamar</option>
                <option
                  v-for="rm in formRoomList"
                  :key="rm.id"
                  :value="rm.id"
                >
                  Kamar {{ rm.nomor_kamar }}
                </option>
              </select>
              <div class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Kondisi & Tanggal Beli Grid -->
          <div class="grid grid-cols-2 gap-3">
            <!-- Kondisi -->
            <div class="space-y-1.5">
              <label for="form-kondisi" class="block text-sm font-bold text-text-primary">Kondisi</label>
              <div class="relative">
                <select
                  id="form-kondisi"
                  v-model="form.kondisi"
                  class="w-full bg-card border-2 border-border rounded-xl px-4 py-3 appearance-none text-base font-semibold text-text-primary focus:border-navy focus:outline-none"
                >
                  <option value="Baik">🟢 Baik</option>
                  <option value="Butuh Servis">🟡 Servis</option>
                  <option value="Rusak">🔴 Rusak</option>
                </select>
                <div class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>
            </div>

            <!-- Tanggal Beli -->
            <div class="space-y-1.5">
              <label for="form-tanggal" class="block text-sm font-bold text-text-primary">Tanggal Beli</label>
              <div class="relative rounded-xl border-2 border-border bg-card focus-within:border-navy transition-all duration-200 shadow-sm">
                <!-- Visual Text Overlay -->
                <div class="w-full px-4 py-3 text-base font-semibold text-text-primary flex items-center justify-between pointer-events-none">
                  <span class="truncate">{{ form.tanggal_pembelian ? formatDateDisplay(form.tanggal_pembelian) : 'Pilih' }}</span>
                  <span class="text-text-muted">📅</span>
                </div>
                <!-- Native Date Input -->
                <input
                  id="form-tanggal"
                  v-model="form.tanggal_pembelian"
                  type="date"
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
              </div>
            </div>
          </div>

          <!-- Harga Barang -->
          <div class="space-y-1.5">
            <label for="form-harga" class="block text-sm font-bold text-text-primary">Harga Barang</label>
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">Rp</span>
              <input
                id="form-harga"
                v-model.number="form.harga"
                type="number"
                placeholder="Contoh: 3500000"
                class="w-full bg-card border-2 border-border rounded-xl pl-12 pr-4 py-3 text-base font-semibold text-text-primary focus:border-navy focus:outline-none"
              />
            </div>
          </div>

          <!-- File Upload: Unggah Foto Nota (Optional) -->
          <div class="space-y-2">
            <label class="block text-sm font-bold text-text-primary">Foto Nota Pembelian (Opsional)</label>
            <div class="flex items-center gap-3">
              <div v-if="form.receiptPreview" class="relative w-16 h-16 rounded-xl border-2 border-border overflow-hidden">
                <img :src="form.receiptPreview" class="w-full h-full object-cover" />
                <button
                  @click="hapusNotaPreview"
                  class="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] font-black"
                >
                  ✕
                </button>
              </div>
              <label
                v-else
                class="w-full border-2 border-dashed border-border hover:border-navy rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer text-xs font-bold text-text-secondary transition-all"
              >
                <span>📷 Klik untuk Unggah Nota</span>
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="handleFileUpload"
                />
              </label>
            </div>
          </div>
        </div>

        <!-- Modal Footer Actions -->
        <div class="flex gap-3 pt-3 border-t-2 border-border">
          <button
            @click="showModal = false"
            class="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl active:scale-95 transition-transform"
          >
            Batal
          </button>
          <button
            @click="handleSubmit"
            :disabled="isSubmitting"
            class="flex-1 py-3 bg-navy text-white font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <span v-if="isSubmitting" class="w-4 h-4 animate-spin border-2 border-white border-t-transparent rounded-full"></span>
            <span>Simpan</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal 2: Lihat Foto Nota -->
    <div
      v-if="showImageModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/80 backdrop-blur-sm"
      @click="showImageModal = false"
    >
      <div class="relative bg-white rounded-2xl p-2 border-2 border-border shadow-2xl max-w-sm w-full" @click.stop>
        <button
          @click="showImageModal = false"
          class="absolute -top-3 -right-3 w-8 h-8 bg-white border-2 border-border hover:bg-gray-50 text-navy font-bold rounded-full flex items-center justify-center shadow-lg"
        >
          ✕
        </button>
        <img :src="selectedImageUrl" class="w-full rounded-xl object-contain max-h-[75vh]" />
      </div>
    </div>

    <!-- Bottom Navigation Bar -->
    <BottomNav />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { supabase } from '../supabase.js'
import BottomNav from '../components/BottomNav.vue'

const isLoading = ref(true)
const isSubmitting = ref(false)
const selectedLocationFilter = ref('ALL')
const activeTab = ref('Fasilitas Kamar')

// Modals
const showModal = ref(false)
const showImageModal = ref(false)
const selectedImageUrl = ref('')

// Lists
const locationsList = ref([])
const formRoomList = ref([])
const inventoriesList = ref([])

// Form State
const form = reactive({
  id: null,
  nama_barang: '',
  location_id: '',
  room_id: '',
  kondisi: 'Baik',
  tanggal_pembelian: new Date().toISOString().split('T')[0],
  harga: null,
  tipe_fasilitas: 'kamar',
  receiptPreview: null
})
const receiptFile = ref(null)

// Compute Filtered Inventories
const filteredAssets = computed(() => {
  return inventoriesList.value.filter(asset => {
    // Tab Filter
    const matchesTab = activeTab.value === 'Fasilitas Kamar'
      ? asset.tipe_fasilitas === 'kamar'
      : asset.tipe_fasilitas === 'umum'
    if (!matchesTab) return false

    // Location Filter
    const matchesLocation = selectedLocationFilter.value === 'ALL' || asset.location_id === selectedLocationFilter.value
    return matchesLocation
  })
})

// Fetch locations & inventories
async function loadLocations() {
  try {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .order('nama_lokasi', { ascending: true })
    locationsList.value = data || []
  } catch (err) {
    console.error('Fetch locations error:', err)
  }
}

async function loadInventories() {
  isLoading.value = true
  try {
    const { data } = await supabase
      .from('inventories')
      .select('*, locations(nama_lokasi), rooms(nomor_kamar)')
      .order('nama_barang', { ascending: true })
    inventoriesList.value = data || []
  } catch (err) {
    console.error('Fetch inventories error:', err)
  } finally {
    isLoading.value = false
  }
}

// Watch location_id to update room selection list in form
watch(() => form.location_id, async (newLocId) => {
  formRoomList.value = []
  if (!newLocId) return
  try {
    const { data } = await supabase
      .from('rooms')
      .select('*')
      .eq('location_id', newLocId)
      .order('nomor_kamar', { ascending: true })
    formRoomList.value = data || []
  } catch (err) {
    console.error('Fetch rooms list error:', err)
  }
})

onMounted(async () => {
  await loadLocations()
  await loadInventories()
})

// Action triggers
function bukaModalTambah() {
  form.id = null
  form.nama_barang = ''
  form.location_id = locationsList.value.length > 0 ? locationsList.value[0].id : ''
  form.room_id = ''
  form.kondisi = 'Baik'
  form.tanggal_pembelian = new Date().toISOString().split('T')[0]
  form.harga = null
  form.tipe_fasilitas = activeTab.value === 'Fasilitas Kamar' ? 'kamar' : 'umum'
  form.receiptPreview = null
  receiptFile.value = null
  showModal.value = true
}

function bukaModalEdit(asset) {
  form.id = asset.id
  form.nama_barang = asset.nama_barang
  form.location_id = asset.location_id
  form.room_id = asset.room_id || ''
  form.kondisi = asset.kondisi
  form.tanggal_pembelian = asset.tanggal_pembelian
  form.harga = asset.harga
  form.tipe_fasilitas = asset.tipe_fasilitas
  form.receiptPreview = asset.receipt_url
  receiptFile.value = null
  showModal.value = true
}

// File Upload Handler
function handleFileUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    alert('File harus berupa gambar!')
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('Ukuran file maksimal 5MB!')
    return
  }

  receiptFile.value = file
  form.receiptPreview = URL.createObjectURL(file)
}

function hapusNotaPreview() {
  receiptFile.value = null
  form.receiptPreview = null
}

function bukaFotoNota(url) {
  selectedImageUrl.value = url
  showImageModal.value = true
}

// Submit Create/Update Asset (CRUD - Save)
async function handleSubmit() {
  if (!form.nama_barang.trim() || !form.location_id) {
    alert('Nama barang dan lokasi wajib diisi!')
    return
  }

  isSubmitting.value = true
  let receiptPath = form.receiptPreview // keep original url if not updated

  try {
    // 1. Upload new receipt image if selected
    if (receiptFile.value) {
      const timestamp = Date.now()
      const ext = receiptFile.value.name.split('.').pop()
      const fileName = `receipt_${timestamp}.${ext}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('receipt_images')
        .upload(fileName, receiptFile.value, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) throw uploadError

      // Resolve public URL for display
      const { data: publicUrlData } = supabase.storage
        .from('receipt_images')
        .getPublicUrl(uploadData.path)

      receiptPath = publicUrlData.publicUrl
    }

    const payload = {
      nama_barang: form.nama_barang.trim(),
      location_id: form.location_id,
      room_id: form.tipe_fasilitas === 'kamar' && form.room_id ? form.room_id : null,
      kondisi: form.kondisi,
      tanggal_pembelian: form.tanggal_pembelian,
      harga: form.harga || 0,
      tipe_fasilitas: form.tipe_fasilitas,
      receipt_url: receiptPath
    }

    if (form.id) {
      // Update
      const { error } = await supabase
        .from('inventories')
        .update(payload)
        .eq('id', form.id)

      if (error) throw error
      alert('Aset berhasil diperbarui!')
    } else {
      // Insert
      const { error } = await supabase
        .from('inventories')
        .insert([payload])

      if (error) throw error
      alert('Aset berhasil ditambahkan!')
    }

    showModal.value = false
    await loadInventories()
  } catch (err) {
    alert(`Gagal menyimpan aset: ${err.message}`)
    console.error('[SimKos] Save asset error:', err)
  } finally {
    isSubmitting.value = false
  }
}

// Delete Asset (CRUD - Delete)
async function hapusAset(asset) {
  const confirmDelete = confirm(`Apakah Anda yakin ingin menghapus barang ${asset.nama_barang}?`)
  if (!confirmDelete) return

  isLoading.value = true
  try {
    const { error } = await supabase
      .from('inventories')
      .delete()
      .eq('id', asset.id)

    if (error) throw error
    alert('Aset berhasil dihapus!')
    await loadInventories()
  } catch (err) {
    alert(`Gagal menghapus aset: ${err.message}`)
    console.error('[SimKos] Delete asset error:', err)
    isLoading.value = false
  }
}

// Helpers
function kondisiBadgeClass(kondisi) {
  if (kondisi === 'Baik') return 'bg-green-100 text-green-700 border-green-200'
  if (kondisi === 'Butuh Servis') return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-red-100 text-red-700 border-red-200'
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '-'
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}
</script>
