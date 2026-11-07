<template>
  <div class="min-h-screen bg-bg-app pb-28 text-text-primary">
    <!-- Header Navy -->
    <header class="bg-navy text-white px-5 pt-7 pb-6 rounded-b-[28px] shadow-lg">
      <div class="max-w-xl mx-auto flex flex-col gap-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase font-extrabold tracking-widest text-blue-200">Kekayaan Usaha</p>
            <h1 class="text-2xl font-black tracking-tight mt-0.5">Aset & Inventaris</h1>
          </div>
          <router-link
            to="/aset/tambah"
            class="bg-white text-navy px-4 py-2.5 rounded-xl font-bold text-sm shadow hover:bg-blue-50 active:scale-95 transition-all flex items-center gap-1.5"
          >
            <span>＋</span>
            <span>Tambah</span>
          </router-link>
        </div>

        <!-- Custom Location Dropdown -->
        <div>
          <CustomLocationDropdown
            v-model="selectedLocationFilter"
            :locations="locationsList"
            label="Filter Lokasi Kos"
            :show-all-option="true"
            size="compact"
            theme="default"
          />
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-xl mx-auto px-4 mt-5 space-y-5">
      <!-- Banner Sinkronisasi Inventaris Lama jika ada -->
      <div
        v-if="unlinkedInventoriesCount > 0"
        class="bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      >
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">📦</span>
          <div>
            <p class="text-sm font-bold">Ditemukan {{ unlinkedInventoriesCount }} inventaris lama</p>
            <p class="text-xs text-amber-800 mt-0.5">Dapat dibackfill menjadi draf aset tanpa mengubah data aslinya.</p>
          </div>
        </div>
        <button
          type="button"
          @click="runBackfill"
          :disabled="isBackfilling"
          class="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow transition disabled:opacity-50"
        >
          {{ isBackfilling ? 'Memproses...' : 'Sinkronkan Draf' }}
        </button>
      </div>

      <!-- Kartu Ringkasan Metrik -->
      <div class="grid grid-cols-3 gap-2.5">
        <div class="bg-white rounded-2xl border-2 border-border p-3.5 shadow-sm">
          <span class="text-[11px] font-bold text-text-muted block">Biaya Terdata</span>
          <strong class="text-base sm:text-lg font-black text-navy block mt-1 truncate">
            {{ formatCurrency(totalRecordedCost) }}
          </strong>
          <small class="text-[10px] text-text-secondary block mt-0.5">{{ assetsWithCostCount }} aset</small>
        </div>
        <div class="bg-white rounded-2xl border-2 border-border p-3.5 shadow-sm">
          <span class="text-[11px] font-bold text-text-muted block">Nilai Buku (Est.)</span>
          <strong class="text-base sm:text-lg font-black text-income block mt-1 truncate">
            {{ formatCurrency(estimatedBookValue) }}
          </strong>
          <small class="text-[10px] text-text-secondary block mt-0.5">Simulasi draf</small>
        </div>
        <div class="bg-white rounded-2xl border-2 border-border p-3.5 shadow-sm">
          <span class="text-[11px] font-bold text-text-muted block">Perlu Dilengkapi</span>
          <strong class="text-base sm:text-lg font-black text-expense block mt-1">
            {{ incompleteCount }}
          </strong>
          <small class="text-[10px] text-text-secondary block mt-0.5">Biaya/tanggal kosong</small>
        </div>
      </div>

      <!-- Search & Kategori Tabs -->
      <div class="space-y-3">
        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari nama aset atau kode..."
            class="w-full bg-white border-2 border-border rounded-xl px-4 py-3 pl-10 text-sm font-semibold focus:outline-none focus:border-navy transition"
          />
          <span class="absolute left-3.5 top-3.5 text-text-muted">🔍</span>
          <button
            v-if="searchQuery"
            type="button"
            @click="searchQuery = ''"
            class="absolute right-3.5 top-3 text-gray-400 hover:text-gray-600 font-bold"
          >
            ✕
          </button>
        </div>

        <!-- Tabs Kategori -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs font-bold">
          <button
            v-for="tab in categoryTabs"
            :key="tab.value"
            type="button"
            @click="activeCategory = tab.value"
            class="px-3.5 py-2 rounded-xl whitespace-nowrap transition-all border"
            :class="activeCategory === tab.value
              ? 'bg-navy text-white border-navy shadow-sm'
              : 'bg-white text-text-secondary border-border hover:bg-gray-50'"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- List Aset Cards -->
      <div v-if="isLoading" class="p-12 text-center text-text-muted text-sm font-semibold">
        Memuat daftar aset...
      </div>

      <div v-else-if="filteredAssets.length === 0" class="bg-white border-2 border-border rounded-2xl p-8 text-center text-text-muted space-y-3">
        <span class="text-4xl block">📦</span>
        <p class="font-bold text-sm text-text-primary">Belum ada aset pada kriteria ini</p>
        <p class="text-xs">Tambahkan gedung, tanah, atau barang inventaris baru sebagai draf.</p>
        <router-link
          to="/aset/tambah"
          class="inline-block px-4 py-2 bg-navy text-white text-xs font-bold rounded-xl shadow mt-2"
        >
          ＋ Tambah Aset Baru
        </router-link>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="asset in paginatedAssets"
          :key="asset.id"
          @click="openDetail(asset.id)"
          class="bg-white rounded-2xl border-2 border-border p-4 shadow-sm hover:border-navy/50 active:scale-[0.99] transition cursor-pointer flex flex-col gap-3 relative overflow-hidden"
        >
          <!-- Baris Atas: Icon, Kategori & Status Badge -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <span class="w-11 h-11 bg-navy/5 text-xl rounded-xl flex items-center justify-center flex-shrink-0">
                {{ getAssetCategoryIcon(asset.kategori_aset) }}
              </span>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[11px] font-bold text-navy bg-navy/10 px-2 py-0.5 rounded-md">
                    {{ getAssetCategoryLabel(asset.kategori_aset) }}
                  </span>
                  <span
                    class="text-[11px] font-bold px-2 py-0.5 rounded-md"
                    :class="getStatusBadgeClass(asset.status_pencatatan)"
                  >
                    {{ getStatusText(asset.status_pencatatan) }}
                  </span>
                  <span v-if="asset.kondisi_fisik && asset.kondisi_fisik !== 'baik'" class="text-[11px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-800">
                    {{ asset.kondisi_fisik }}
                  </span>
                </div>
                <h3 class="font-extrabold text-base text-text-primary mt-1 truncate">
                  {{ asset.nama_aset }}
                </h3>
              </div>
            </div>
            <span class="text-text-muted text-lg">›</span>
          </div>

          <!-- Lokasi / Kamar / Pemilik -->
          <div class="text-xs text-text-secondary flex items-center gap-2 flex-wrap">
            <span v-if="asset.locations?.nama_lokasi">📍 {{ asset.locations.nama_lokasi }}</span>
            <span v-if="asset.rooms?.nomor_kamar">🚪 Kmr {{ asset.rooms.nomor_kamar }}</span>
            <span v-if="asset.nama_pemilik">👤 Pemilik: {{ asset.nama_pemilik }}</span>
            <span v-if="asset.dasar_penggunaan && asset.dasar_penggunaan !== 'milik_sendiri'" class="italic text-amber-700">
              ({{ asset.dasar_penggunaan.replace('_', ' ') }})
            </span>
          </div>

          <!-- Alert jika ada data belum lengkap -->
          <div
            v-if="asset.incompleteFields && asset.incompleteFields.length > 0"
            class="text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5"
          >
            <span>⚠️</span>
            <span>Perlu dilengkapi: {{ asset.incompleteFields.join(', ') }}</span>
          </div>

          <!-- Baris Bawah: Biaya Perolehan & Nilai Buku -->
          <div class="flex items-center justify-between pt-2 border-t border-border text-xs">
            <div>
              <span class="text-text-muted block text-[10px]">Biaya Perolehan</span>
              <strong class="font-bold text-text-primary text-sm">
                {{ asset.totalCost !== null ? formatCurrency(asset.totalCost) : 'Belum diketahui' }}
              </strong>
            </div>
            <div class="text-right">
              <span class="text-text-muted block text-[10px]">Porsi Usaha</span>
              <span class="font-bold text-navy">
                {{ asset.porsiUsaha !== null ? asset.porsiUsaha + '%' : '100%' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <BasePagination
          v-model="currentPage"
          :total-items="filteredAssets.length"
          :page-size="pageSize"
          item-label="aset"
        />
      </div>
    </main>

    <!-- Bottom Nav Bar -->
    <BottomNav />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase.js'
import BottomNav from '../components/BottomNav.vue'
import BasePagination from '../components/BasePagination.vue'
import CustomLocationDropdown from '../components/CustomLocationDropdown.vue'
import { getAssetCategoryLabel, getAssetCategoryIcon, inspectAssetCompleteness } from '../lib/aset.js'

const router = useRouter()

const isLoading = ref(true)
const isBackfilling = ref(false)
const assetsList = ref([])
const locationsList = ref([])
const selectedLocationFilter = ref('ALL')
const searchQuery = ref('')
const activeCategory = ref('Semua')
const unlinkedInventoriesCount = ref(0)

const currentPage = ref(1)
const pageSize = ref(10)

const categoryTabs = [
  { label: 'Semua', value: 'Semua' },
  { label: 'Gedung', value: 'gedung' },
  { label: 'Tanah', value: 'tanah' },
  { label: 'Fasilitas Kamar', value: 'fasilitas_kamar' },
  { label: 'Fasilitas Umum', value: 'fasilitas_umum' },
  { label: 'Draf', value: 'draft' },
]

async function loadData() {
  isLoading.value = true
  try {
    // 1. Load Locations
    const { data: locs } = await supabase
      .from('locations')
      .select('id, nama_lokasi')
      .order('nama_lokasi')
    locationsList.value = locs || []

    // 2. Load Assets with Components
    const { data: assets, error } = await supabase
      .from('assets')
      .select(`
        *,
        locations(nama_lokasi),
        rooms(nomor_kamar),
        asset_components(*)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[SimKos] Gagal memuat data aset:', error)
      assetsList.value = []
    } else {
      assetsList.value = (assets || []).map(a => {
        const comps = a.asset_components || []
        const mainComp = comps[0] || null

        // Hitung total biaya terdata
        let totalCost = null
        if (comps.some(c => c.biaya_perolehan !== null && c.biaya_perolehan !== undefined)) {
          totalCost = comps.reduce((acc, c) => acc + (parseFloat(c.biaya_perolehan) || 0), 0)
        }

        const completeness = inspectAssetCompleteness(a, comps)

        return {
          ...a,
          totalCost,
          porsiUsaha: mainComp?.porsi_usaha_persen ?? null,
          incompleteFields: completeness.missingFields,
          isComplete: completeness.isComplete,
        }
      })
    }

    // 3. Cek apakah ada inventaris lama yang belum dibackfill
    await checkUnlinkedInventories()
  } catch (err) {
    console.error('[SimKos] Error loadData aset:', err)
  } finally {
    isLoading.value = false
  }
}

async function checkUnlinkedInventories() {
  try {
    const { count, error } = await supabase
      .from('inventories')
      .select('id', { count: 'exact', head: true })
    
    const existingLegacy = assetsList.value.filter(a => a.legacy_inventory_id).length
    const diff = (count || 0) - existingLegacy
    unlinkedInventoriesCount.value = Math.max(0, diff)
  } catch {
    unlinkedInventoriesCount.value = 0
  }
}

async function runBackfill() {
  isBackfilling.value = true
  try {
    const { data, error } = await supabase.rpc('backfill_inventories_to_assets')
    if (error) throw error
    await loadData()
  } catch (err) {
    console.error('[SimKos] Backfill gagal:', err)
    alert(`Gagal menyinkronkan draf: ${err.message}`)
  } finally {
    isBackfilling.value = false
  }
}

// Filtered Assets
const filteredAssets = computed(() => {
  return assetsList.value.filter(item => {
    // Filter Lokasi
    if (selectedLocationFilter.value !== 'ALL' && item.location_id !== selectedLocationFilter.value) {
      return false
    }

    // Filter Kategori / Tab
    if (activeCategory.value === 'draft') {
      if (item.status_pencatatan !== 'draft') return false
    } else if (activeCategory.value !== 'Semua') {
      if (item.kategori_aset !== activeCategory.value) return false
    }

    // Search Query
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase()
      const matchName = item.nama_aset?.toLowerCase().includes(q)
      const matchCode = item.kode_aset?.toLowerCase().includes(q)
      const matchLoc = item.locations?.nama_lokasi?.toLowerCase().includes(q)
      if (!matchName && !matchCode && !matchLoc) return false
    }

    return true
  })
})

const paginatedAssets = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredAssets.value.slice(start, start + pageSize.value)
})

watch([selectedLocationFilter, activeCategory, searchQuery], () => {
  currentPage.value = 1
})

// Metrics
const totalRecordedCost = computed(() => {
  return assetsList.value.reduce((acc, a) => acc + (a.totalCost || 0), 0)
})

const assetsWithCostCount = computed(() => {
  return assetsList.value.filter(a => a.totalCost !== null).length
})

const estimatedBookValue = computed(() => {
  // Nilai buku sementara untuk draf
  return totalRecordedCost.value
})

const incompleteCount = computed(() => {
  return assetsList.value.filter(a => !a.isComplete).length
})

function openDetail(id) {
  router.push(`/aset/${id}`)
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'terverifikasi': return 'bg-blue-100 text-blue-800'
    case 'dibukukan': return 'bg-emerald-100 text-emerald-800'
    case 'diarsipkan': return 'bg-gray-200 text-gray-700'
    default: return 'bg-amber-100 text-amber-800'
  }
}

function getStatusText(status) {
  switch (status) {
    case 'terverifikasi': return 'Terverifikasi'
    case 'dibukukan': return 'Dibukukan'
    case 'diarsipkan': return 'Diarsipkan'
    default: return 'Draf'
  }
}

function formatCurrency(val) {
  if (val === null || val === undefined) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val)
}

onMounted(() => {
  loadData()
})
</script>