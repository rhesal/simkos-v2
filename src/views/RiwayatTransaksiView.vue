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
      <!-- Export Buttons (Chunky) -->
      <div class="grid grid-cols-2 gap-4 mt-4 print-hide">
        <button
          @click="exportToCSV"
          class="flex items-center justify-center gap-2 px-4 py-3.5 bg-green-600 hover:bg-green-700 active:scale-[0.96] text-white rounded-xl text-sm font-extrabold shadow transition-all duration-150"
        >
          <span>🟢</span> Excel (CSV)
        </button>
        <button
          @click="exportToPDF"
          class="flex items-center justify-center gap-2 px-4 py-3.5 bg-white/15 hover:bg-white/20 active:scale-[0.96] text-white rounded-xl text-sm font-extrabold shadow border border-white/10 transition-all duration-150"
        >
          <span>🖨️</span> Cetak / PDF
        </button>
      </div>
    </header>

    <!-- Content Area -->
    <div class="px-6 py-6 space-y-6 max-w-lg mx-auto">
      <!-- Printable Report Header (Only visible in Print Mode) -->
      <div class="hidden print-show text-center pb-6 border-b-2 border-gray-300">
        <h1 class="text-2xl font-black text-gray-800">Laporan Keuangan SimKos</h1>
        <p class="text-sm font-bold text-gray-500 mt-1">Buku Besar / Riwayat Transaksi</p>
        <p class="text-xs font-semibold text-gray-500 mt-0.5">
          Lokasi: {{ selectedLocationFilterName }}
        </p>
        <p v-if="startDate || endDate" class="text-xs font-semibold text-gray-500">
          Periode: {{ startDate ? formatDateDisplay(startDate) : 'Mulai' }} s/d {{ endDate ? formatDateDisplay(endDate) : 'Selesai' }}
        </p>
      </div>
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

        <!-- Pesan hasil hapus pengeluaran -->
        <div
          v-if="pageMsg"
          class="rounded-xl px-4 py-3 text-sm font-bold border-2 flex items-start justify-between gap-3"
          :class="pageMsgType === 'error' ? 'bg-expense-light border-expense/30 text-expense' : 'bg-income-light border-income/30 text-income'"
        >
          <span>{{ pageMsg }}</span>
          <button type="button" class="flex-shrink-0 opacity-70 hover:opacity-100" aria-label="Tutup pesan" @click="pageMsg = ''">✕</button>
        </div>

        <!-- Catatan tagihan bersama (location_id NULL) -->
        <p
          v-if="filteredTagihanBersama > 0"
          class="text-xs font-semibold text-text-secondary bg-navy/5 border border-navy/10 rounded-xl px-4 py-3"
        >
          <template v-if="selectedLocationFilter === 'ALL'">
            🌐 Termasuk tagihan bersama {{ formatCurrency(filteredTagihanBersama) }}
          </template>
          <template v-else>
            🌐 Tagihan bersama {{ formatCurrency(filteredTagihanBersama) }} tidak termasuk total kos ini
          </template>
        </p>

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
            :class="tx.tipe === 'keluar' ? 'cursor-pointer active:scale-[0.99]' : ''"
            :role="tx.tipe === 'keluar' ? 'button' : undefined"
            :tabindex="tx.tipe === 'keluar' ? 0 : undefined"
            :aria-label="tx.tipe === 'keluar' ? `Lihat detail pengeluaran ${tx.keterangan}` : undefined"
            @click="tx.tipe === 'keluar' && openExpenseDetail(tx, $event)"
            @keydown.enter="tx.tipe === 'keluar' && openExpenseDetail(tx, $event)"
            @keydown.space.prevent="tx.tipe === 'keluar' && openExpenseDetail(tx, $event)"
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
                  <span
                    v-if="tx.semuaKos"
                    class="flex-shrink-0 bg-navy/10 text-navy border border-navy/20 px-2 py-0.5 rounded font-bold"
                  >
                    🌐 Tagihan bersama
                  </span>
                  <span v-else class="truncate">{{ tx.lokasi }}</span>
                </div>
                <span class="flex-shrink-0 font-bold bg-navy/5 text-navy px-2 py-0.5 rounded">
                  {{ formatDateDisplay(tx.tanggal) }}
                </span>
              </div>
            </div>

            <!-- Penanda baris pengeluaran bisa diketuk -->
            <span
              v-if="tx.tipe === 'keluar'"
              class="flex-shrink-0 text-2xl font-black text-text-muted leading-none -mr-1 print-hide"
              aria-hidden="true"
            >›</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Modal Detail / Hapus Pengeluaran -->
    <BaseModal
      v-if="detailTx"
      class="bg-black/50 print-hide"
      @click.self="closeExpenseDetail"
    >
      <div
        ref="dialogEl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expense-detail-title"
        tabindex="-1"
        class="outline-none bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-100 max-h-[85dvh] flex flex-col overflow-hidden"
        @keydown.esc.prevent="closeExpenseDetail"
      >
        <!-- Detail -->
        <template v-if="!confirmDelete">
          <div class="min-h-0 flex-1 overflow-y-auto p-6 pb-4 space-y-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 id="expense-detail-title" class="text-lg font-black text-text-primary">Detail Pengeluaran</h3>
                <p class="text-2xl font-black text-expense mt-1">- {{ formatCurrency(detailTx.nominal) }}</p>
              </div>
              <button
                type="button"
                class="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Tutup"
                :disabled="isDeleting"
                @click="closeExpenseDetail"
              >
                ✕
              </button>
            </div>

            <dl class="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
              <dt class="font-bold text-text-muted">Tanggal</dt>
              <dd class="col-span-2 font-semibold text-text-primary">{{ formatDateDisplay(detailTx.tanggal) }}</dd>
              <dt class="font-bold text-text-muted">Kategori</dt>
              <dd class="col-span-2 font-semibold text-text-primary">{{ detailTx.kategori }}</dd>
              <dt class="font-bold text-text-muted">Lokasi</dt>
              <dd class="col-span-2 font-semibold text-text-primary">
                <span
                  v-if="detailTx.semuaKos"
                  class="bg-navy/10 text-navy border border-navy/20 px-2 py-0.5 rounded font-bold"
                >🌐 Tagihan bersama (semua kos)</span>
                <span v-else>{{ detailTx.lokasiNama }}</span>
              </dd>
              <dt class="font-bold text-text-muted">Keterangan</dt>
              <dd class="col-span-2 font-semibold text-text-primary break-words">{{ detailTx.keteranganAsli || '-' }}</dd>
            </dl>

            <div>
              <p class="text-sm font-bold text-text-muted mb-2">Bukti Nota</p>
              <div v-if="!detailTx.bukti_nota_url" class="text-sm font-semibold text-text-secondary">Tidak ada nota.</div>
              <div
                v-else
                class="w-full rounded-xl border-2 border-border bg-gray-50 overflow-hidden flex items-center justify-center min-h-[8rem]"
              >
                <img v-if="detailNotaUrl" :src="detailNotaUrl" alt="Bukti nota" class="w-full max-h-[50vh] object-contain" />
                <span v-else class="text-sm font-semibold text-text-muted p-6">
                  {{ detailNotaLoading ? 'Memuat nota...' : 'Nota tidak bisa ditampilkan' }}
                </span>
              </div>
            </div>

          </div>

          <!-- Tombol selalu terlihat di bawah panel, isi di atasnya yang di-scroll -->
          <div class="grid grid-cols-2 gap-3 px-6 py-4 border-t-2 border-border bg-white shrink-0">
            <button
              type="button"
              class="py-3 bg-expense/10 hover:bg-expense/20 text-expense font-bold rounded-xl active:scale-95 transition-transform"
              @click="confirmDelete = true"
            >
              🗑️ Hapus
            </button>
            <router-link
              :to="`/pengeluaran/${detailTx.rawId}/edit`"
              class="py-3 bg-navy text-white font-bold rounded-xl active:scale-95 transition-transform text-center"
            >
              ✏️ Ubah
            </router-link>
          </div>
        </template>

        <!-- Konfirmasi Hapus -->
        <template v-else>
          <div class="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
            <div class="text-center">
              <span class="text-4xl">🗑️</span>
              <h3 id="expense-detail-title" class="text-lg font-bold text-slate-800 mt-2">Hapus pengeluaran ini?</h3>
            </div>
            <p class="text-sm text-slate-600 text-center leading-relaxed">
              Pengeluaran <strong>{{ formatCurrency(detailTx.nominal) }}</strong>
              tanggal <strong>{{ formatDateDisplay(detailTx.tanggal) }}</strong>
              ({{ detailTx.kategori }}) akan dihapus dari Buku Besar.
              <template v-if="detailTx.bukti_nota_url">
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
                @click="confirmDelete = false"
              >
                Batal
              </button>
              <button
                type="button"
                class="flex-1 bg-expense text-white rounded-xl py-3 text-sm font-bold shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isDeleting"
                @click="deleteExpense"
              >
                {{ isDeleting ? 'Menghapus...' : 'Ya, Hapus' }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </BaseModal>

    <!-- Bottom Navigation Bar -->
    <BottomNav />
  </div>
</template>

<script setup>
import BaseModal from '../components/BaseModal.vue'
import { ref, computed, onMounted, nextTick } from 'vue'
import { supabase } from '../supabase.js'
import { RECEIPT_BUCKET, getSignedUrl, deleteStorageFile } from '../lib/storage.js'
import BottomNav from '../components/BottomNav.vue'
import { buildCsv, csvFileParts, localDateStamp } from '../lib/csv.js'

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
        bukti_nota_url,
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
        lokasiNama: locName,
        location_id: locId
      }
    })

    // 5. Format and Map Expenses
    const mappedExpenses = (expData || []).map(item => {
      // location_id NULL = tagihan bersama (semua kos)
      const semuaKos = item.location_id == null
      const locName = semuaKos ? 'Tagihan bersama' : (item.locations?.nama_lokasi || 'Tidak Diketahui')

      return {
        id: `exp-${item.id}`,
        tipe: 'keluar',
        tanggal: item.tanggal_pengeluaran,
        nominal: item.nominal || 0,
        keterangan: item.keterangan || `Pengeluaran ${item.kategori}`,
        entitas: `📦 ${item.kategori}`,
        lokasi: semuaKos ? `🌐 ${locName}` : `🏢 ${locName}`,
        lokasiNama: locName,
        rawId: item.id,
        kategori: item.kategori,
        keteranganAsli: item.keterangan || '',
        bukti_nota_url: item.bukti_nota_url || null,
        location_id: item.location_id,
        semuaKos
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

// --- Detail, ubah & hapus pengeluaran ---
const detailTx = ref(null)
const detailNotaUrl = ref(null)
const detailNotaLoading = ref(false)
const confirmDelete = ref(false)
const isDeleting = ref(false)
const deleteError = ref('')
const pageMsg = ref('')
const pageMsgType = ref('success')

const dialogEl = ref(null)
let lastFocusedRow = null

function openExpenseDetail(tx, event) {
  lastFocusedRow = event?.currentTarget || null
  detailTx.value = tx
  confirmDelete.value = false
  deleteError.value = ''
  detailNotaUrl.value = null
  if (tx.bukti_nota_url) {
    detailNotaLoading.value = true
    getSignedUrl(RECEIPT_BUCKET, tx.bukti_nota_url)
      .then((url) => { if (detailTx.value === tx) detailNotaUrl.value = url })
      .finally(() => { detailNotaLoading.value = false })
  }
  // Pindahkan fokus ke dialog supaya Esc langsung berfungsi
  nextTick(() => dialogEl.value?.focus())
}

function closeExpenseDetail() {
  if (isDeleting.value) return
  detailTx.value = null
  detailNotaUrl.value = null
  confirmDelete.value = false
  // Kembalikan fokus ke baris asal (bila masih ada di DOM)
  const row = lastFocusedRow
  lastFocusedRow = null
  nextTick(() => { if (row && row.isConnected) row.focus() })
}

// Hapus BARIS dulu, baru file nota. Urutan ini menjamin tidak pernah ada baris
// yang menunjuk ke file yang sudah hilang. Bila file gagal dihapus, file menjadi
// yatim (dicatat di console & diberitahukan ke user), tapi data tetap konsisten.
async function deleteExpense() {
  const tx = detailTx.value
  if (!tx || isDeleting.value) return
  isDeleting.value = true
  deleteError.value = ''
  try {
    const { data, error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', tx.rawId)
      .select('id, bukti_nota_url')

    if (error) throw error
    if (!data || data.length === 0) throw new Error('Data tidak ditemukan atau tidak boleh dihapus.')

    // Pakai nilai nota dari baris yang BENAR-BENAR terhapus (hasil .delete().select()),
    // bukan dari daftar yang mungkin sudah basi (nota bisa sudah diganti user lain).
    const deletedNota = data[0].bukti_nota_url ?? null
    let notaFailed = false
    if (deletedNota) {
      try {
        await deleteStorageFile(RECEIPT_BUCKET, deletedNota)
      } catch (fileErr) {
        notaFailed = true
        console.error('[SimKos] Pengeluaran terhapus, tapi file nota gagal dihapus (file yatim):', deletedNota, fileErr?.message || fileErr)
      }
    }

    // Hapus dari daftar; total dihitung ulang otomatis (computed).
    transactionsList.value = transactionsList.value.filter(t => t.id !== tx.id)
    // Kegagalan hapus file hanya peringatan (baris sudah terhapus, data konsisten).
    pageMsgType.value = 'success'
    pageMsg.value = notaFailed
      ? `Pengeluaran ${formatCurrency(tx.nominal)} berhasil dihapus. Sisa file nota akan dibersihkan saat perawatan berkala.`
      : `Pengeluaran ${formatCurrency(tx.nominal)} tanggal ${formatDateDisplay(tx.tanggal)} berhasil dihapus.`

    isDeleting.value = false
    closeExpenseDetail()
  } catch (err) {
    console.error('[SimKos] Gagal menghapus pengeluaran:', err)
    deleteError.value = `Gagal menghapus: ${err.message || err}`
    isDeleting.value = false
  }
}

// Filter transactions by location and date range
const filteredTransactions = computed(() => {
  let list = transactionsList.value

  if (selectedLocationFilter.value !== 'ALL') {
    // Tagihan bersama tetap tampil di daftar per kos, diberi badge,
    // tapi tidak dihitung di total per kos (lihat filteredTotalExpense).
    list = list.filter(tx => tx.location_id === selectedLocationFilter.value || tx.semuaKos)
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

// Apakah transaksi dihitung di total untuk filter saat ini.
// Tagihan bersama tidak dihitung saat filter satu kos; di "Semua Lokasi" semua dihitung.
function isCountedInTotal(tx) {
  return selectedLocationFilter.value === 'ALL' || !tx.semuaKos
}

const filteredTotalExpense = computed(() => {
  return filteredTransactions.value
    .filter(tx => tx.tipe === 'keluar' && isCountedInTotal(tx))
    .reduce((sum, tx) => sum + tx.nominal, 0)
})

const filteredTagihanBersama = computed(() => {
  return filteredTransactions.value
    .filter(tx => tx.semuaKos)
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

const selectedLocationFilterName = computed(() => {
  if (selectedLocationFilter.value === 'ALL') return 'Semua Lokasi'
  const loc = locationList.value.find(l => l.id === selectedLocationFilter.value)
  return loc ? loc.nama_lokasi : 'Tidak Diketahui'
})

function exportToCSV() {
  const columns = [
    { header: 'Tanggal', type: 'text' },
    { header: 'Tipe', type: 'text' },
    { header: 'Entitas', type: 'text' },
    { header: 'Keterangan', type: 'text' },
    { header: 'Masuk', type: 'number' },
    { header: 'Keluar', type: 'number' },
    { header: 'Lokasi', type: 'text' },
    { header: 'Dihitung di total kos ini', type: 'text' },
  ]

  const rows = filteredTransactions.value.map(tx => [
    formatDateDisplay(tx.tanggal),
    tx.tipe === 'masuk' ? 'Pemasukan' : 'Pengeluaran',
    String(tx.entitas ?? '').replace(/[👤📦🏢]/gu, '').trim(),
    tx.keterangan,
    tx.tipe === 'masuk' ? tx.nominal : null,
    tx.tipe === 'keluar' ? tx.nominal : null,
    tx.lokasiNama,
    isCountedInTotal(tx) ? 'Ya' : 'Tidak'
  ])

  // Pemisah titik koma (CSV_DELIMITER, untuk Excel regional Indonesia) + BOM UTF-8
  // (agar karakter Indonesia tampil benar di Excel).
  // Sengaja TANPA baris "sep=" karena tampil sebagai sampah di Google Sheets.
  const csvContent = buildCsv(columns, rows)
  const blob = new Blob(csvFileParts(csvContent), { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `Laporan_SimKos_${localDateStamp()}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportToPDF() {
  window.print()
}
</script>

<style>
/* Printable CSS styles */
@media print {
  /* Hide interactive controls and menus */
  header,
  nav,
  .print-hide,
  button,
  .fixed {
    display: none !important;
  }

  /* Show printable header */
  .print-show {
    display: block !important;
  }

  /* Expand max width */
  .max-w-lg {
    max-width: 100% !important;
    width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* Ensure card backgrounds are printed */
  body, .bg-bg-primary {
    background-color: white !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .bg-white {
    background-color: white !important;
    border-color: #e5e7eb !important;
  }
}
</style>
