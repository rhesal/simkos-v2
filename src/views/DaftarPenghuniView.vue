<template>
  <div class="min-h-screen bg-bg-primary pb-24">
    <!-- Header -->
    <header class="bg-navy rounded-b-4xl px-6 pt-12 pb-8 text-white shadow-lg max-w-lg mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-3xl font-black tracking-tight">Penghuni</h1>
        <span class="bg-white/10 px-4 py-1.5 rounded-full text-sm font-bold">
          Master Data
        </span>
      </div>

      <!-- Search & Filter Controls -->
      <div class="space-y-4">
        <!-- Search Input and Add Button Chunky Navy -->
        <div class="flex items-end gap-3">
          <div class="flex-1 space-y-1.5">
            <label for="search-penghuni" class="block text-xs font-bold text-blue-200">Cari Nama Penghuni</label>
            <input
              id="search-penghuni"
              v-model="searchQuery"
              type="text"
              placeholder="Cari..."
              class="w-full px-4 py-3.5 bg-white border-2 border-white/20 rounded-xl focus:outline-none focus:border-white text-base font-medium text-gray-800 shadow-sm"
            />
          </div>
          <router-link
            to="/tambah-penghuni"
            class="px-4 py-3.5 bg-white text-navy font-bold rounded-xl flex items-center justify-center gap-1.5 shadow active:scale-95 transition-transform"
          >
            <span>➕</span> Tambah
          </router-link>
        </div>

        <!-- Status Filter Dropdown -->
        <div class="space-y-1.5">
          <label for="status-filter" class="block text-xs font-bold text-blue-200">Status Penyewaan</label>
          <div class="relative">
            <select
              id="status-filter"
              v-model="statusFilter"
              class="w-full px-5 py-4 bg-white border-2 border-white/20 rounded-xl appearance-none focus:outline-none focus:border-white text-lg font-medium text-gray-800 shadow-sm"
            >
              <option value="Semua">📋 Semua Status</option>
              <option value="Aktif">🟢 Aktif (Sedang Sewa)</option>
              <option value="Alumni">⚪ Alumni (Sudah Checkout)</option>
            </select>
            <div class="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
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
        <span class="text-base font-semibold text-text-secondary">Memuat data penghuni...</span>
      </div>

      <template v-else>
        <!-- Empty State -->
        <div
          v-if="filteredRentals.length === 0"
          class="bg-white rounded-[var(--radius-card)] border-2 border-dashed border-border p-12 text-center"
        >
          <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766v-.109A12.318 12.318 0 018.25 15.75c0-2.331 0-4.512.645-6.374 1.766a4.125 4.125 0 00-7.533 2.493 9.337 9.337 0 004.121.952c.963 0 1.868-.216 2.625-.372M12 9.75a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM21 9.75a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0z" />
            </svg>
          </div>
          <p class="text-lg font-bold text-text-primary mb-1">Tidak ada penghuni</p>
          <p class="text-sm text-text-secondary">Tidak ditemukan data penyewa sesuai filter.</p>
        </div>

        <!-- Cards List -->
        <div v-else class="space-y-4">
          <div
            v-for="item in filteredRentals"
            :key="item.id"
            class="bg-white rounded-[var(--radius-card)] border-2 border-border p-5 space-y-4 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <!-- Card Header: Nama & Status Badge & Edit/Delete -->
            <div class="flex items-start justify-between gap-2">
              <div>
                <h3 class="text-xl font-black text-text-primary tracking-tight">
                  {{ item.tenants?.nama_lengkap }}
                </h3>
                <p class="text-sm font-semibold text-text-secondary mt-0.5">
                  📞 {{ item.tenants?.nomor_hp || 'Tidak ada nomor HP' }}
                </p>
              </div>

              <!-- Status & Actions Stack -->
              <div class="flex flex-col items-end gap-2">
                <span
                  class="px-3 py-1 rounded-full text-xs font-black border shadow-sm"
                  :class="item.status_aktif
                    ? 'bg-green-100 text-green-700 border-green-200'
                    : 'bg-gray-100 text-gray-500 border-gray-200'"
                >
                  {{ item.status_aktif ? '🟢 Aktif' : '⚪ Alumni' }}
                </span>
                <div class="flex gap-2">
                  <button
                    @click="bukaModalEdit(item)"
                    class="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200 active:scale-95 transition-transform"
                    title="Ubah Penghuni"
                  >
                    ✏️
                  </button>
                  <button
                    @click="hapusRental(item)"
                    class="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm border border-red-200 active:scale-95 transition-transform"
                    title="Hapus Penghuni"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>

            <!-- Details: Kamar & Lokasi, Masa Sewa -->
            <div class="bg-gray-50 border border-border rounded-xl p-4 space-y-2.5 text-sm font-semibold text-text-primary">
              <div class="flex items-center justify-between">
                <span class="text-text-secondary">Lokasi Kos</span>
                <span class="font-extrabold text-navy">🏠 {{ item.rooms?.locations?.nama_lokasi || 'Tidak Diketahui' }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-text-secondary">Nomor Kamar</span>
                <span class="font-extrabold">Kamar {{ item.rooms?.nomor_kamar || '-' }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-text-secondary">Tipe Sewa</span>
                <span class="capitalize bg-navy/5 text-navy px-2 py-0.5 rounded text-xs font-black">{{ item.tipe_sewa }}</span>
              </div>
              <div class="flex items-center justify-between pt-2 border-t border-gray-200 text-xs">
                <span class="text-text-secondary">Mulai Masuk</span>
                <span>{{ formatDateDisplay(item.tanggal_masuk) }}</span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-text-secondary">Jatuh Tempo</span>
                <span :class="item.status_aktif ? 'font-bold text-navy' : 'text-text-secondary'">
                  {{ formatDateDisplay(item.tanggal_jatuh_tempo) }}
                </span>
              </div>
            </div>

            <!-- Actions Grid (Only active leases) -->
            <div v-if="item.status_aktif" class="grid grid-cols-2 gap-3 pt-2">
              <!-- WhatsApp -->
              <button
                @click="hubungiWhatsApp(item.tenants?.nomor_hp)"
                class="flex items-center justify-center gap-2 py-3 bg-white border-2 border-green-500 hover:bg-green-50 active:scale-95 text-green-600 rounded-xl text-sm font-bold shadow-sm transition-all duration-150"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.73-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.965C16.488 2.012 14.032.99 11.413.99c-5.447 0-9.877 4.373-9.882 9.8.001 1.65.452 3.254 1.31 4.68l-.932 3.406 3.535-.918c1.393.75 2.973 1.146 4.603 1.146zm11.385-6.864c-.302-.15-1.786-.87-2.063-.97-.277-.1-.478-.15-.678.15-.2.3-.775.97-.95 1.17-.175.2-.35.225-.652.075-.302-.15-1.276-.467-2.43-1.485-.898-.795-1.503-1.778-1.68-2.078-.175-.3-.018-.462.13-.61.135-.133.302-.35.45-.525.15-.175.2-.3.3-.5.1-.2.05-.375-.025-.525-.075-.15-.678-1.62-.93-2.225-.246-.588-.496-.51-.678-.52-.175-.008-.375-.01-.575-.01-.2 0-.525.075-.8.375-.275.3-1.05 1.025-1.05 2.5s1.025 2.9 1.175 3.1c.15.2 2.013 3.037 4.875 4.275.681.295 1.213.47 1.627.6.685.217 1.307.186 1.8.113.55-.082 1.786-.725 2.037-1.425.25-.7 0-1.25-.075-1.375-.075-.125-.275-.2-.577-.35z"/>
                </svg>
                <span>WhatsApp</span>
              </button>

              <!-- Checkout -->
              <button
                @click="checkOutPenghuni(item)"
                class="flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-sm font-bold shadow-sm transition-all duration-150"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                <span>Checkout</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Edit Modal Dialog (Custom Premium Backdrop) -->
    <div
      v-if="showEditModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-sm animate-fade-in"
    >
      <div class="bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl w-full max-w-md p-6 space-y-4 animate-fade-in-up">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b-2 border-border pb-3">
          <h3 class="text-xl font-black text-text-primary flex items-center gap-2">
            <span>✏️</span> Edit Data Sewa
          </h3>
          <button @click="showEditModal = false" class="text-text-muted hover:text-text-primary text-xl font-bold">✕</button>
        </div>

        <!-- Modal Fields -->
        <div class="space-y-4 py-2">
          <!-- Nama Lengkap -->
          <div class="space-y-1.5">
            <label for="edit-nama" class="block text-sm font-bold text-text-primary">Nama Lengkap</label>
            <input
              id="edit-nama"
              v-model="editForm.nama_lengkap"
              type="text"
              class="w-full bg-card border-2 border-border rounded-xl px-4 py-3 text-base font-semibold text-text-primary focus:border-navy focus:outline-none"
            />
          </div>

          <!-- Nomor HP -->
          <div class="space-y-1.5">
            <label for="edit-hp" class="block text-sm font-bold text-text-primary">Nomor HP</label>
            <input
              id="edit-hp"
              v-model="editForm.nomor_hp"
              type="tel"
              class="w-full bg-card border-2 border-border rounded-xl px-4 py-3 text-base font-semibold text-text-primary focus:border-navy focus:outline-none"
            />
          </div>

          <!-- Harga Sewa Bulanan -->
          <div class="space-y-1.5">
            <label for="edit-harga" class="block text-sm font-bold text-text-primary">Harga Sewa Bulanan</label>
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-text-muted">Rp</span>
              <input
                id="edit-harga"
                v-model.number="editForm.harga_bulanan"
                type="number"
                class="w-full bg-card border-2 border-border rounded-xl pl-12 pr-4 py-3 text-base font-semibold text-text-primary focus:border-navy focus:outline-none"
              />
            </div>
          </div>

          <!-- Tanggal Jatuh Tempo (Overlay format) -->
          <div class="space-y-1.5">
            <label for="edit-tgl-tempo" class="block text-sm font-bold text-text-primary">Tanggal Jatuh Tempo</label>
            <div class="relative rounded-xl border-2 border-border bg-card focus-within:border-navy transition-all duration-200 shadow-sm">
              <!-- Visual Text Overlay -->
              <div class="w-full px-4 py-3 text-base font-semibold text-text-primary flex items-center justify-between pointer-events-none">
                <span>{{ editForm.tanggal_jatuh_tempo ? formatDateDisplay(editForm.tanggal_jatuh_tempo) : 'Pilih Tanggal' }}</span>
                <span class="text-text-muted">📅</span>
              </div>
              <!-- Native Date Input -->
              <input
                id="edit-tgl-tempo"
                v-model="editForm.tanggal_jatuh_tempo"
                type="date"
                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>
          </div>
        </div>

        <!-- Modal Footer Actions -->
        <div class="flex gap-3 pt-3 border-t-2 border-border">
          <button
            @click="showEditModal = false"
            class="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl active:scale-95 transition-transform"
          >
            Batal
          </button>
          <button
            @click="updatePenghuni"
            class="flex-1 py-3 bg-navy text-white font-bold rounded-xl active:scale-95 transition-transform"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom Navigation Bar -->
    <BottomNav />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { supabase } from '../supabase.js'
import BottomNav from '../components/BottomNav.vue'

const isLoading = ref(true)
const rentalsList = ref([])
const searchQuery = ref('')
const statusFilter = ref('Semua')

// Edit Modal States
const showEditModal = ref(false)
const editForm = reactive({
  rentalId: null,
  tenantId: null,
  roomId: null,
  nama_lengkap: '',
  nomor_hp: '',
  harga_bulanan: 0,
  tanggal_jatuh_tempo: ''
})

async function loadRentals() {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('rentals')
      .select('*, tenants(*), rooms(*, locations(*))')
      .order('tanggal_masuk', { ascending: false })

    if (error) throw error
    rentalsList.value = data || []
  } catch (err) {
    console.error('[SimKos] Error loading rentals:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadRentals()
})

// Filtered and searched rentals
const filteredRentals = computed(() => {
  let list = rentalsList.value

  // 1. Search filter (case-insensitive name check)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(item => {
      const name = item.tenants?.nama_lengkap || ''
      return name.toLowerCase().includes(q)
    })
  }

  // 2. Status filter
  if (statusFilter.value === 'Aktif') {
    list = list.filter(item => item.status_aktif === true)
  } else if (statusFilter.value === 'Alumni') {
    list = list.filter(item => item.status_aktif === false)
  }

  return list
})

// WhatsApp Quick Action
function hubungiWhatsApp(noHp) {
  if (!noHp) {
    alert('Nomor HP tidak terdaftar!')
    return
  }
  let formatted = noHp.replace(/\D/g, '') // remove non-digits
  if (formatted.startsWith('0')) {
    formatted = '62' + formatted.substring(1)
  }
  window.open(`https://wa.me/${formatted}`, '_blank')
}

// Checkout Process (Sequential DB operations)
async function checkOutPenghuni(rental) {
  const confirmCheckout = confirm(`Apakah Anda yakin ingin memproses Checkout untuk ${rental.tenants?.nama_lengkap || 'penghuni ini'}? Kamar ini akan otomatis kosong kembali.`)
  if (!confirmCheckout) return

  isLoading.value = true

  try {
    // 1. Update status sewa di tabel rentals
    const { error: rentalError } = await supabase
      .from('rentals')
      .update({ status_aktif: false })
      .eq('id', rental.id)

    if (rentalError) throw new Error(`Gagal memperbarui status sewa: ${rentalError.message}`)

    // 2. Update status kamar di tabel rooms menjadi 'Kosong'
    if (rental.room_id) {
      const { error: roomError } = await supabase
        .from('rooms')
        .update({ status_kamar: 'Kosong' })
        .eq('id', rental.room_id)

      if (roomError) throw new Error(`Gagal mengosongkan status kamar: ${roomError.message}`)
    }

    alert('Checkout berhasil diproses!')
    await loadRentals()
  } catch (err) {
    alert(`Gagal memproses checkout: ${err.message}`)
    console.error('[SimKos] Checkout error:', err)
    isLoading.value = false
  }
}

// Open Edit Modal
function bukaModalEdit(rental) {
  editForm.rentalId = rental.id
  editForm.tenantId = rental.tenant_id
  editForm.roomId = rental.room_id
  editForm.nama_lengkap = rental.tenants?.nama_lengkap || ''
  editForm.nomor_hp = rental.tenants?.nomor_hp || ''
  editForm.harga_bulanan = rental.rooms?.harga_bulanan || 0
  editForm.tanggal_jatuh_tempo = rental.tanggal_jatuh_tempo || ''
  showEditModal.value = true
}

// Update Tenant Data (CRUD - Update)
async function updatePenghuni() {
  if (!editForm.nama_lengkap.trim() || !editForm.nomor_hp.trim()) {
    alert('Nama dan Nomor HP tidak boleh kosong!')
    return
  }

  isLoading.value = true

  try {
    // 1. Update tenants table
    if (editForm.tenantId) {
      const { error: tenantError } = await supabase
        .from('tenants')
        .update({
          nama_lengkap: editForm.nama_lengkap.trim(),
          nomor_hp: editForm.nomor_hp.trim()
        })
        .eq('id', editForm.tenantId)

      if (tenantError) throw tenantError
    }

    // 2. Update rooms table (harga_bulanan)
    if (editForm.roomId) {
      const { error: roomError } = await supabase
        .from('rooms')
        .update({
          harga_bulanan: editForm.harga_bulanan
        })
        .eq('id', editForm.roomId)

      if (roomError) throw roomError
    }

    // 3. Update rentals table (tanggal_jatuh_tempo)
    if (editForm.rentalId) {
      const { error: rentalError } = await supabase
        .from('rentals')
        .update({
          tanggal_jatuh_tempo: editForm.tanggal_jatuh_tempo
        })
        .eq('id', editForm.rentalId)

      if (rentalError) throw rentalError
    }

    alert('Data penghuni berhasil diperbarui!')
    showEditModal.value = false
    await loadRentals()
  } catch (err) {
    alert(`Gagal memperbarui data: ${err.message}`)
    console.error('[SimKos] Update error:', err)
    isLoading.value = false
  }
}

// Delete Rental Record (CRUD - Delete)
async function hapusRental(rental) {
  const confirmDelete = confirm(`Apakah Anda yakin ingin menghapus data sewa untuk ${rental.tenants?.nama_lengkap || 'penghuni ini'}? Tindakan ini akan menghapus riwayat sewa ini dari database dan mengosongkan status kamar.`)
  if (!confirmDelete) return

  isLoading.value = true

  try {
    // 1. Hapus dari tabel rentals
    const { error: deleteError } = await supabase
      .from('rentals')
      .delete()
      .eq('id', rental.id)

    if (deleteError) throw deleteError

    // 2. Kembalikan status kamar di tabel rooms menjadi 'Kosong'
    if (rental.room_id) {
      const { error: roomError } = await supabase
        .from('rooms')
        .update({ status_kamar: 'Kosong' })
        .eq('id', rental.room_id)

      if (roomError) throw roomError
    }

    alert('Data sewa berhasil dihapus!')
    await loadRentals()
  } catch (err) {
    alert(`Gagal menghapus data sewa: ${err.message}`)
    console.error('[SimKos] Delete error:', err)
    isLoading.value = false
  }
}

// Helpers
function formatDateDisplay(dateStr) {
  if (!dateStr) return '-'
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}
</script>
