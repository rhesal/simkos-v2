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
            class="bg-white rounded-[var(--radius-card)] border-2 border-border p-4 pt-5 flex items-center gap-3.5 shadow-sm hover:shadow transition-all duration-150 relative overflow-hidden"
          >
            <!-- Icon box -->
            <div class="w-14 h-14 rounded-2xl bg-slate-100 flex flex-col items-center justify-center flex-shrink-0 border border-border">
              <span v-if="assetType(asset) === 'kamar'" class="text-xs font-black text-navy leading-none">
                {{ asset.rooms?.nomor_kamar || 'Kmr' }}
              </span>
              <span v-else class="text-lg leading-none">🏢</span>
            </div>

            <!-- Detail: baris atas nama + tombol, baris bawah kondisi/tanggal/harga -->
            <div class="min-w-0 flex-1">
              <div class="flex items-start gap-2">
                <!-- Nama: maks. 3 baris, baru dipotong kalau benar-benar panjang -->
                <p class="min-w-0 flex-1 text-base font-extrabold text-text-primary leading-snug line-clamp-3 break-words" :title="asset.nama_barang">
                  {{ asset.nama_barang }}
                </p>

                <!-- Action buttons (ukuran tetap) -->
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <!-- View Receipt Button -->
                  <button
                    v-if="asset.receipt_url"
                    type="button"
                    @click="bukaFotoNota(asset.receipt_url)"
                    class="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-sm border border-blue-100 active:scale-95 transition-transform"
                    :title="`Lihat nota ${asset.nama_barang}`"
                    :aria-label="`Lihat nota ${asset.nama_barang}`"
                  >
                    <span aria-hidden="true">📷</span>
                  </button>
                  <button
                    type="button"
                    @click="bukaModalEdit(asset)"
                    class="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm border border-gray-200 active:scale-95 transition-transform"
                    :title="`Ubah ${asset.nama_barang}`"
                    :aria-label="`Ubah ${asset.nama_barang}`"
                  >
                    <span aria-hidden="true">✏️</span>
                  </button>
                  <button
                    type="button"
                    @click="bukaKonfirmasiHapus(asset)"
                    class="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm border border-red-200 active:scale-95 transition-transform"
                    :title="`Hapus ${asset.nama_barang}`"
                    :aria-label="`Hapus ${asset.nama_barang}`"
                  >
                    <span aria-hidden="true">🗑️</span>
                  </button>
                </div>
              </div>

              <!-- Kondisi, tanggal beli, harga: turun ke baris berikut kalau sempit -->
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs font-semibold text-text-secondary">
                <!-- Condition Badge -->
                <span
                  class="px-2 py-0.5 rounded text-[10px] font-black border whitespace-nowrap"
                  :class="kondisiBadgeClass(asset.kondisi)"
                >
                  {{ asset.kondisi }}
                </span>
                <span class="whitespace-nowrap">{{ formatDateDisplay(asset.tanggal_pembelian) }}</span>
                <span class="whitespace-nowrap text-green-700 font-extrabold">{{ formatHarga(asset.harga) }}</span>
              </div>
            </div>

            <!-- Location Overlay: tetap di area pt-5, dipotong kalau nama lokasi panjang -->
            <span
              v-if="asset.locations?.nama_lokasi"
              class="absolute right-3 top-1 max-w-[50%] truncate text-[10px] leading-none font-bold text-text-secondary"
              :title="asset.locations.nama_lokasi"
            >
              {{ asset.locations.nama_lokasi }}
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
          <button @click="tutupModal" class="text-text-muted hover:text-text-primary text-xl font-bold" aria-label="Tutup">✕</button>
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
              <!-- (1) File baru dipilih: ✕ hanya membatalkan file baru ini -->
              <div v-if="receiptFile" class="relative w-16 h-16 rounded-xl border-2 border-border overflow-hidden flex-shrink-0">
                <img :src="newReceiptPreview" class="w-full h-full object-cover" alt="Pratinjau nota baru" />
                <button
                  type="button"
                  @click="batalkanFileBaru"
                  class="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] font-black"
                  aria-label="Batalkan file nota baru"
                  title="Batalkan file baru"
                >
                  ✕
                </button>
              </div>
              <!-- (2) Nota lama ada dan tidak ditandai hapus: tampilkan (loading / error / gambar) -->
              <div
                v-else-if="form.original_receipt_path && !notaPendingDelete"
                class="relative w-16 h-16 rounded-xl border-2 border-border overflow-hidden flex-shrink-0 bg-gray-50"
              >
                <img
                  v-if="existingPreviewStatus === 'ready'"
                  :src="existingPreviewUrl"
                  class="w-full h-full object-cover"
                  alt="Pratinjau nota"
                  @error="existingPreviewStatus = 'error'"
                />
                <div
                  v-else-if="existingPreviewStatus === 'error'"
                  class="w-full h-full flex flex-col items-center justify-center text-center text-[9px] font-bold text-red-600 leading-tight px-1"
                  role="status"
                >
                  <span class="text-base leading-none">⚠️</span>
                  Nota gagal dimuat
                </div>
                <div v-else class="w-full h-full flex items-center justify-center" role="status" aria-label="Memuat nota">
                  <span class="w-5 h-5 animate-spin border-2 border-navy border-t-transparent rounded-full"></span>
                </div>
                <button
                  type="button"
                  @click="tandaiHapusNota"
                  class="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] font-black"
                  aria-label="Hapus nota"
                  title="Hapus nota"
                >
                  ✕
                </button>
              </div>
              <!-- (3) Unggah: tidak ada nota, atau nota lama ditandai hapus (bisa diganti file baru) -->
              <label
                v-if="!receiptFile && (!form.original_receipt_path || notaPendingDelete)"
                class="w-full border-2 border-dashed border-border hover:border-navy rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer text-xs font-bold text-text-secondary transition-all"
              >
                <span>📷 Klik untuk Unggah Nota</span>
                <input
                  type="file"
                  :accept="IMAGE_ACCEPT"
                  class="hidden"
                  @change="handleFileUpload"
                />
              </label>
              <button
                v-if="existingPreviewStatus === 'error' && form.original_receipt_path && !notaPendingDelete && !receiptFile"
                type="button"
                @click="muatPratinjauNota"
                class="text-xs font-bold text-navy underline"
              >
                Coba lagi
              </button>
            </div>
            <!-- Penanda: hapus nota baru berlaku saat Simpan -->
            <div
              v-if="notaPendingDelete && !receiptFile"
              class="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"
              role="status"
            >
              <span class="text-xs font-bold text-amber-800">🗑️ Nota akan dihapus saat Simpan</span>
              <button
                type="button"
                @click="batalHapusNota"
                class="text-xs font-black text-navy underline flex-shrink-0"
              >
                Batal hapus
              </button>
            </div>
            <p v-else-if="receiptFile && form.original_receipt_path" class="text-xs font-semibold text-text-secondary">
              Nota lama akan diganti saat Simpan.
            </p>
          </div>
        </div>

        <!-- Modal Footer Actions -->
        <div class="flex gap-3 pt-3 border-t-2 border-border">
          <button
            @click="tutupModal"
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
          type="button"
          @click="showImageModal = false"
          class="absolute -top-3 -right-3 w-8 h-8 bg-white border-2 border-border hover:bg-gray-50 text-navy font-bold rounded-full flex items-center justify-center shadow-lg"
          title="Tutup foto nota"
          aria-label="Tutup foto nota"
        >
          <span aria-hidden="true">✕</span>
        </button>
        <img :src="selectedImageUrl" alt="Foto nota pembelian" class="w-full rounded-xl object-contain max-h-[75vh]" />
      </div>
    </div>

    <!-- Modal 3: Konfirmasi Hapus Barang (langkah terpisah, seperti hapus pengeluaran) -->
    <div
      v-if="deleteTarget"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 pb-24 bg-navy/60 backdrop-blur-sm"
      @click.self="tutupKonfirmasiHapus"
      @keydown.esc="tutupKonfirmasiHapus"
    >
      <div
        ref="deleteDialogRef"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hapus-aset-title"
        tabindex="-1"
        class="bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl w-full max-w-md p-6 space-y-4 focus:outline-none"
      >
        <div class="text-center">
          <span class="text-4xl">🗑️</span>
          <h3 id="hapus-aset-title" class="text-lg font-bold text-slate-800 mt-2">Hapus barang ini?</h3>
        </div>
        <p class="text-sm text-slate-600 text-center leading-relaxed">
          <strong>{{ deleteTarget.nama_barang }}</strong>
          <template v-if="deleteTarget.harga != null"> ({{ formatCurrency(Number(deleteTarget.harga)) }})</template>
          akan dihapus dari inventaris.
          <template v-if="deleteTarget.receipt_url">
            <br />File <strong>foto nota juga ikut dihapus permanen</strong>.
          </template>
          <br />Tindakan ini tidak bisa dibatalkan.
        </p>
        <p v-if="deleteError" class="text-sm font-bold text-expense bg-expense-light border border-expense/30 rounded-xl px-3 py-2">
          {{ deleteError }}
        </p>
        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 border border-slate-300 text-slate-600 rounded-xl py-3 text-sm font-bold hover:bg-slate-50 transition disabled:opacity-50"
            :disabled="isDeleting"
            @click="tutupKonfirmasiHapus"
          >
            Batal
          </button>
          <button
            type="button"
            class="flex-1 bg-expense text-white rounded-xl py-3 text-sm font-bold shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="isDeleting"
            @click="hapusAset"
          >
            {{ isDeleting ? 'Menghapus...' : 'Ya, Hapus' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom Navigation Bar -->
    <BottomNav />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { supabase } from '../supabase.js'
import { RECEIPT_BUCKET, IMAGE_ACCEPT, validateImageFile, getSignedUrl, uploadPrivateFile, removeStorageFile, deleteStorageFile } from '../lib/storage.js'
import BottomNav from '../components/BottomNav.vue'
import { localDateStamp } from '../lib/date.js'
import { assetType } from '../lib/inventaris.js'

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
  tanggal_pembelian: localDateStamp(),
  harga: null,
  tipe_fasilitas: 'kamar',
  // Nilai receipt_url di DB saat form dibuka, APA ADANYA (path objek, atau URL
  // publik lama). Dipakai untuk pratinjau dan compare-and-set saat Simpan.
  original_receipt_path: null
})

// State nota di form (tidak ada yang menyentuh DB/storage sebelum Simpan):
// - receiptFile/newReceiptPreview: file baru yang dipilih (blob URL, wajib di-revoke)
// - notaPendingDelete: nota lama ditandai hapus (berlaku saat Simpan)
// - existingPreview*: pratinjau nota lama via signed URL (loading/ready/error)
const newReceiptPreview = ref(null)
const notaPendingDelete = ref(false)
const existingPreviewUrl = ref(null)
const existingPreviewStatus = ref('idle') // 'idle' | 'loading' | 'ready' | 'error'
let previewRequestSeq = 0

const receiptFile = ref(null)

// Compute Filtered Inventories
const filteredAssets = computed(() => {
  return inventoriesList.value.filter(asset => {
    // Tab Filter
    // Aturan tipe sama dengan form edit (lihat lib/inventaris.js).
    const matchesTab = assetType(asset) === (activeTab.value === 'Fasilitas Kamar' ? 'kamar' : 'umum')
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

onBeforeUnmount(() => {
  resetNotaState()
})

// Bersihkan semua state nota form (dipanggil saat buka/tutup form & unmount).
function revokeNewPreview() {
  if (newReceiptPreview.value) URL.revokeObjectURL(newReceiptPreview.value)
  newReceiptPreview.value = null
}
function resetNotaState() {
  revokeNewPreview()
  receiptFile.value = null
  notaPendingDelete.value = false
  existingPreviewUrl.value = null
  existingPreviewStatus.value = 'idle'
  previewRequestSeq++ // abaikan respons signed URL yang masih berjalan
}

// Form ditutup lewat jalur apa pun -> lepas blob URL. Tidak ada yang tersimpan,
// jadi nota lama tetap utuh (hapus nota hanya berlaku saat Simpan).
watch(showModal, (open) => {
  if (!open) resetNotaState()
})

function tutupModal() {
  showModal.value = false
}

// Action triggers
function bukaModalTambah() {
  form.id = null
  form.nama_barang = ''
  form.location_id = locationsList.value.length > 0 ? locationsList.value[0].id : ''
  form.room_id = ''
  form.kondisi = 'Baik'
  form.tanggal_pembelian = localDateStamp()
  form.harga = null
  form.tipe_fasilitas = activeTab.value === 'Fasilitas Kamar' ? 'kamar' : 'umum'
  form.original_receipt_path = null
  resetNotaState()
  showModal.value = true
}

function bukaModalEdit(asset) {
  form.id = asset.id
  form.nama_barang = asset.nama_barang
  form.location_id = asset.location_id
  form.room_id = asset.room_id || ''
  form.kondisi = asset.kondisi
  form.tanggal_pembelian = asset.tanggal_pembelian || ''
  // NULL tetap NULL (harga tidak diketahui); 0 tetap 0.
  form.harga = asset.harga ?? null
  // Aturan sama dengan filter tab: NULL + room_id -> 'kamar' (room_id tetap
  // tersimpan), NULL tanpa room_id -> 'umum'.
  form.tipe_fasilitas = assetType(asset)
  form.original_receipt_path = asset.receipt_url ?? null
  resetNotaState()
  showModal.value = true
  muatPratinjauNota()
}

// Bucket nota privat: pratinjau nota lama memakai signed URL berumur pendek.
function muatPratinjauNota() {
  const value = form.original_receipt_path
  if (!value) return
  const seq = ++previewRequestSeq
  existingPreviewUrl.value = null
  existingPreviewStatus.value = 'loading'
  getSignedUrl(RECEIPT_BUCKET, value)
    .then((url) => {
      if (seq !== previewRequestSeq) return // form sudah ditutup/dibuka ulang
      existingPreviewUrl.value = url || null
      existingPreviewStatus.value = url ? 'ready' : 'error'
    })
    .catch((err) => {
      if (seq !== previewRequestSeq) return
      console.warn('[SimKos] Pratinjau nota gagal dimuat:', err?.message || err)
      existingPreviewStatus.value = 'error'
    })
}

// File Upload Handler
function handleFileUpload(e) {
  const file = e.target.files?.[0]
  if (!file) return

  const invalid = validateImageFile(file)
  if (invalid) {
    alert(invalid)
    e.target.value = ''
    return
  }

  revokeNewPreview() // ganti file: lepas blob URL file sebelumnya
  receiptFile.value = file
  newReceiptPreview.value = URL.createObjectURL(file)
  e.target.value = ''
}

// ✕ pada file BARU: batalkan file itu saja. Nota lama (bila ada) tampil lagi,
// atau tetap berstatus "akan dihapus" bila sebelumnya memang sudah ditandai.
function batalkanFileBaru() {
  revokeNewPreview()
  receiptFile.value = null
}

// ✕ pada nota LAMA (tidak ada file baru): tandai hapus, berlaku saat Simpan.
function tandaiHapusNota() {
  if (receiptFile.value) return batalkanFileBaru()
  notaPendingDelete.value = true
}

function batalHapusNota() {
  notaPendingDelete.value = false
  if (existingPreviewStatus.value !== 'ready') muatPratinjauNota()
}

async function bukaFotoNota(storedValue) {
  const url = await getSignedUrl(RECEIPT_BUCKET, storedValue)
  if (!url) {
    alert('Foto nota tidak dapat dimuat. Coba lagi nanti.')
    return
  }
  selectedImageUrl.value = url
  showImageModal.value = true
}

// --- Nota inventaris: aturan BARIS dulu, FILE belakangan (sama dengan nota
// pengeluaran, lihat docs/tagihan-bersama.md).
const CONFLICT_MSG = 'Data sudah diubah oleh pengguna lain, muat ulang halaman.'
const NOT_FOUND_MSG = 'Barang tidak ditemukan. Mungkin sudah dihapus.'
const CHECK_FAILED_MSG = 'Perubahan belum tersimpan dan status data tidak bisa dicek (cek koneksi internet). Muat ulang halaman lalu coba lagi.'
const ORPHAN_NOTE = ' Sisa file nota akan dibersihkan saat perawatan berkala.'

// Compare-and-set pada receipt_url. .eq(kolom, null) tidak pernah cocok di SQL,
// jadi cabang null memakai .is().
function whereReceiptIs(query, known) {
  return known === null ? query.is('receipt_url', null) : query.eq('receipt_url', known)
}

// Update/delete kena 0 baris: bedakan "baris hilang" dari "nota diubah orang lain".
async function explainZeroRows(id) {
  const { data, error } = await supabase.from('inventories').select('id').eq('id', id).maybeSingle()
  // Cek gagal (mis. jaringan) -> jangan menyimpulkan "barang tidak ditemukan".
  if (error) return CHECK_FAILED_MSG
  return data ? CONFLICT_MSG : NOT_FOUND_MSG
}

// Hapus file nota lama tanpa memblokir. Mengembalikan catatan untuk pesan sukses.
async function hapusFileNotaLama(value) {
  if (!value) return ''
  try {
    await deleteStorageFile(RECEIPT_BUCKET, value)
    return ''
  } catch (err) {
    console.error('[SimKos] Baris inventaris tersimpan, tapi file nota gagal dihapus (file yatim):', value, err?.message || err)
    return ORPHAN_NOTE
  }
}

// Submit Create/Update Asset (CRUD - Save)
async function handleSubmit() {
  if (isSubmitting.value) return
  if (!form.nama_barang.trim() || !form.location_id) {
    alert('Nama barang dan lokasi wajib diisi!')
    return
  }
  if (form.harga !== null && form.harga !== '' && (!Number.isFinite(Number(form.harga)) || Number(form.harga) < 0)) {
    alert('Harga barang tidak boleh negatif.')
    return
  }

  isSubmitting.value = true
  let uploadedPath = null

  try {
    const payload = {
      nama_barang: form.nama_barang.trim(),
      location_id: form.location_id,
      room_id: form.tipe_fasilitas === 'kamar' && form.room_id ? form.room_id : null,
      kondisi: form.kondisi,
      tanggal_pembelian: form.tanggal_pembelian || null,
      // Kosong ('' dari v-model.number yang dikosongkan, atau null/undefined dari
      // form baru / harga NULL) -> NULL = "harga tidak diketahui". 0 tetap 0.
      harga: form.harga === '' || form.harga == null ? null : Number(form.harga),
      tipe_fasilitas: form.tipe_fasilitas,
    }

    const known = form.original_receipt_path // nilai DB saat form dibuka (apa adanya)
    const notaRemoved = known !== null && notaPendingDelete.value && !receiptFile.value

    // 1. Upload nota baru dulu (file baru belum dirujuk siapa pun).
    if (receiptFile.value) {
      uploadedPath = await uploadPrivateFile(RECEIPT_BUCKET, 'receipt', receiptFile.value)
      payload.receipt_url = uploadedPath
    } else if (notaRemoved) {
      payload.receipt_url = null
    }
    // Nota tidak berubah -> receipt_url TIDAK dikirim, supaya nota yang baru
    // ditambahkan partner tidak tertimpa.

    let note = ''
    if (form.id) {
      // 2. BARIS: update. Bila nota ikut berubah, pakai compare-and-set.
      let query = supabase.from('inventories').update(payload).eq('id', form.id)
      if ('receipt_url' in payload) query = whereReceiptIs(query, known)
      const { data, error } = await query.select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error(await explainZeroRows(form.id))
      uploadedPath = null // sudah dirujuk baris, jangan di-rollback

      // 3. FILE: hapus nota lama (non-blocking).
      if ('receipt_url' in payload && known && known !== payload.receipt_url) {
        note = await hapusFileNotaLama(known)
      }
      alert(`Aset berhasil diperbarui!${note}`)
    } else {
      if (!('receipt_url' in payload)) payload.receipt_url = null
      const { data, error } = await supabase.from('inventories').insert([payload]).select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Aset gagal disimpan (ditolak server).')
      uploadedPath = null
      alert('Aset berhasil ditambahkan!')
    }

    showModal.value = false
    await loadInventories()
  } catch (err) {
    // Baris tidak berubah -> file yang baru terunggah tidak dirujuk, hapus lagi.
    if (uploadedPath) {
      await removeStorageFile(RECEIPT_BUCKET, uploadedPath)
    }
    alert(`Gagal menyimpan aset: ${err.message}`)
    console.error('[SimKos] Save asset error:', err)
  } finally {
    isSubmitting.value = false
  }
}

// Delete Asset (CRUD - Delete): konfirmasi di langkah terpisah.
const deleteTarget = ref(null)
const deleteError = ref('')
const isDeleting = ref(false)
const deleteDialogRef = ref(null)
let deleteReturnFocus = null

async function bukaKonfirmasiHapus(asset) {
  deleteReturnFocus = document.activeElement
  deleteTarget.value = asset
  deleteError.value = ''
  await nextTick()
  deleteDialogRef.value?.focus() // supaya Esc bisa menutup
}

function tutupKonfirmasiHapus() {
  if (isDeleting.value) return
  deleteTarget.value = null
  deleteError.value = ''
  deleteReturnFocus?.focus?.()
  deleteReturnFocus = null
}

async function hapusAset() {
  const asset = deleteTarget.value
  if (!asset || isDeleting.value) return
  isDeleting.value = true
  deleteError.value = ''
  try {
    // 1. BARIS dulu.
    const { data, error } = await supabase
      .from('inventories')
      .delete()
      .eq('id', asset.id)
      .select('id, receipt_url')
    if (error) throw error
    if (!data || data.length === 0) throw new Error(NOT_FOUND_MSG)

    // 2. FILE belakangan (non-blocking). Pakai receipt_url dari baris yang BENAR-BENAR
    // terhapus, bukan dari daftar yang mungkin basi (nota bisa sudah diganti user lain).
    const note = await hapusFileNotaLama(data[0].receipt_url ?? null)

    inventoriesList.value = inventoriesList.value.filter(a => a.id !== asset.id)
    isDeleting.value = false
    tutupKonfirmasiHapus()
    alert(`Aset berhasil dihapus!${note}`)
  } catch (err) {
    console.error('[SimKos] Delete asset error:', err)
    deleteError.value = `Gagal menghapus: ${err.message || err}`
    isDeleting.value = false
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

// Harga NULL = tidak diketahui -> "–"; 0 tetap "Rp 0".
function formatHarga(value) {
  if (value === null || value === undefined || value === '') return '–'
  const n = Number(value)
  return Number.isFinite(n) ? formatCurrency(n) : '–'
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '-'
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}
</script>
