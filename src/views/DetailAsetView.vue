<template>
  <div class="min-h-screen bg-bg-app pb-24 text-text-primary">
    <!-- Header Navy -->
    <header class="bg-navy text-white px-5 pt-6 pb-6 rounded-b-[24px] shadow-md">
      <div class="max-w-xl mx-auto flex items-center justify-between">
        <router-link
          to="/aset"
          class="flex items-center gap-1.5 text-blue-200 hover:text-white font-bold text-sm transition"
        >
          <span>‹</span>
          <span>Daftar Aset</span>
        </router-link>
        <h1 class="text-base font-black tracking-tight truncate max-w-[200px]">
          {{ asset?.nama_aset || 'Detail Aset' }}
        </h1>
        <router-link
          v-if="asset && canManageAssets"
          :to="`/aset/${asset.id}/edit`"
          class="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg font-bold text-white transition"
        >
          Edit
        </router-link>
        <div v-else class="w-10"></div>
      </div>
    </header>

    <main v-if="isLoading" class="max-w-xl mx-auto px-4 mt-8 text-center text-text-muted text-sm font-semibold">
      Memuat detail aset...
    </main>

    <!-- Error State dengan Tombol Coba Lagi -->
    <main v-else-if="errorMessage" class="max-w-xl mx-auto px-4 mt-8 bg-white border-2 border-red-200 rounded-2xl p-8 text-center space-y-3">
      <span class="text-3xl block">⚠️</span>
      <p class="font-bold text-base text-red-900">Gagal Memuat Detail Aset</p>
      <p class="text-xs text-red-700">{{ errorMessage }}</p>
      <div class="pt-2 flex justify-center gap-2">
        <button
          type="button"
          @click="loadAssetDetail"
          class="px-4 py-2 bg-navy text-white text-xs font-bold rounded-xl shadow"
        >
          Coba Lagi
        </button>
        <router-link to="/aset" class="px-4 py-2 border border-border text-xs font-bold rounded-xl">
          Kembali ke Daftar
        </router-link>
      </div>
    </main>

    <main v-else-if="!asset" class="max-w-xl mx-auto px-4 mt-8 bg-white border-2 border-border rounded-2xl p-8 text-center space-y-3">
      <p class="font-bold text-base text-text-primary">Aset tidak ditemukan</p>
      <router-link to="/aset" class="inline-block px-4 py-2 bg-navy text-white text-xs font-bold rounded-xl shadow">
        Kembali ke Daftar Aset
      </router-link>
    </main>

    <main v-else class="max-w-xl mx-auto px-4 mt-5 space-y-4">
      <!-- Kartu Identitas Aset -->
      <div class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="w-12 h-12 bg-navy/5 text-2xl rounded-2xl flex items-center justify-center flex-shrink-0">
              {{ getAssetCategoryIcon(asset.kategori_aset) }}
            </span>
            <div>
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
                <span class="text-[11px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">
                  Kondisi: {{ asset.kondisi_fisik }}
                </span>
              </div>
              <h2 class="text-lg font-black text-navy mt-1">
                {{ asset.nama_aset }}
              </h2>
            </div>
          </div>
        </div>

        <!-- Detail Meta Data -->
        <div class="border-t border-border pt-3 space-y-2 text-xs">
          <div class="flex justify-between py-1">
            <span class="text-text-muted">Pemilik Sah:</span>
            <strong class="text-text-primary">{{ asset.nama_pemilik || 'Belum diisi' }}</strong>
          </div>
          <div class="flex justify-between py-1">
            <span class="text-text-muted">Dasar Penggunaan:</span>
            <span class="font-bold capitalize">{{ asset.dasar_penggunaan?.replace('_', ' ') }}</span>
          </div>
          <div class="flex justify-between py-1">
            <span class="text-text-muted">Lokasi Fisik:</span>
            <span>{{ asset.locations?.nama_lokasi || 'Tidak terikat lokasi' }}</span>
          </div>
          <div v-if="asset.rooms?.nomor_kamar" class="flex justify-between py-1">
            <span class="text-text-muted">Kamar:</span>
            <span class="font-bold text-navy">Kamar {{ asset.rooms.nomor_kamar }}</span>
          </div>
          <div v-if="asset.catatan" class="pt-2 border-t border-border text-text-secondary italic">
            "{{ asset.catatan }}"
          </div>
        </div>
      </div>

      <!-- Alert Peringatan jika data belum lengkap -->
      <div
        v-if="completeness.missingFields.length > 0"
        class="bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-2xl p-4 shadow-sm space-y-1.5"
      >
        <div class="flex items-center gap-2 font-black text-xs">
          <span>⚠️</span>
          <span>Data Belum Lengkap (Status Draf)</span>
        </div>
        <p class="text-xs text-amber-800 leading-relaxed">
          Sebelum aktivasi pembukuan resmi, lengkapi data:
          <b class="underline">{{ completeness.missingFields.join(', ') }}</b>.
        </p>
      </div>

      <!-- Kartu Komponen & Riwayat Pengembangan -->
      <div class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-black text-navy">Komponen & Riwayat Perolehan</h3>
            <p class="text-xs text-text-muted">Riwayat pembangunan awal dan renovasi lanjutan.</p>
          </div>
          <button
            v-if="canManageAssets"
            type="button"
            @click="showAddComponentModal = true"
            class="text-xs bg-navy text-white px-3 py-1.5 rounded-xl font-bold shadow hover:bg-navy-light transition"
          >
            ＋ Tambah
          </button>
        </div>

        <div v-if="componentsList.length === 0" class="p-6 text-center text-text-muted text-xs">
          Belum ada komponen biaya yang tercatat.
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="comp in componentsList"
            :key="comp.id"
            class="p-3.5 rounded-xl border border-border bg-gray-50/70 space-y-2 text-xs"
          >
            <div class="flex items-center justify-between gap-2">
              <strong class="font-extrabold text-navy text-sm">{{ comp.nama_komponen }}</strong>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900 capitalize">
                {{ comp.jenis_pekerjaan.replace('_', ' ') }}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-2 text-[11px] pt-1">
              <div>
                <span class="text-text-muted block">Biaya:</span>
                <b>{{ comp.biaya_perolehan !== null ? formatCurrency(comp.biaya_perolehan) : 'Belum diketahui' }}</b>
              </div>
              <div>
                <span class="text-text-muted block">Siap Guna:</span>
                <span>{{ comp.tanggal_siap_guna || (comp.tahun_perolehan ? 'Tahun ' + comp.tahun_perolehan : 'Belum diisi') }}</span>
              </div>
              <div>
                <span class="text-text-muted block">Pola Penggunaan:</span>
                <span class="capitalize">
                  {{ comp.pola_penggunaan?.replace('_', ' ') }}
                  ({{ comp.porsi_usaha_persen !== null ? comp.porsi_usaha_persen + '%' : 'Belum ditentukan' }})
                </span>
              </div>
              <div>
                <span class="text-text-muted block">Masa Manfaat:</span>
                <span>{{ comp.masa_manfaat_bulan ? (comp.masa_manfaat_bulan / 12) + ' Tahun' : '-' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Ringkasan Finansial Simulasi -->
      <div class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-3">
        <h3 class="text-sm font-black text-navy">Simulasi Pembukuan Internal</h3>
        <div class="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1.5 text-xs text-blue-950">
          <div class="flex justify-between">
            <span>Total Biaya Perolehan Terdata:</span>
            <b>{{ formatCurrency(totalCost) }}</b>
          </div>
          <div class="flex justify-between">
            <span>Metode Penyusutan:</span>
            <span class="font-bold">{{ asset.kategori_aset === 'tanah' ? 'Tidak Disusutkan' : 'Garis Lurus' }}</span>
          </div>
          <div class="flex justify-between">
            <span>Nilai Buku:</span>
            <span class="font-bold text-amber-800">Belum dapat dihitung</span>
          </div>
          <div class="flex justify-between pt-1 border-t border-blue-200 font-extrabold text-navy">
            <span>Status Pencatatan:</span>
            <span>Draf Simulasi</span>
          </div>
        </div>
        <p class="text-[11px] text-text-muted leading-relaxed">
          Pencatatan berstatus draf tidak mengubah saldo kas, tidak menghasilkan jurnal, dan tidak mengubah laporan hasil usaha.
        </p>
      </div>

      <!-- Tombol Hapus Draf (Hanya Admin / Owner) -->
      <div v-if="canManageAssets && asset.status_pencatatan === 'draft'" class="pt-2">
        <button
          type="button"
          @click="deleteDraftAsset"
          :disabled="isDeleting"
          class="w-full py-3 rounded-xl border-2 border-expense/30 bg-expense-light text-expense font-bold text-xs hover:bg-expense/10 active:scale-95 transition disabled:opacity-50"
        >
          {{ isDeleting ? 'Menghapus...' : 'Hapus Draf Aset Ini' }}
        </button>
      </div>
    </main>

    <!-- Modal Tambah Komponen / Pengembangan -->
    <BaseModal v-if="showAddComponentModal" @click.self="showAddComponentModal = false">
      <div class="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border-2 border-border space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-border pb-3">
          <h3 class="font-black text-base text-navy">Tambah Pengembangan / Renovasi</h3>
          <button type="button" @click="showAddComponentModal = false" class="text-text-muted font-bold text-lg">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="block font-bold text-text-secondary mb-1">Nama Pekerjaan *</label>
            <input
              v-model="newComp.nama_komponen"
              type="text"
              placeholder="Contoh: Penambahan 2 Kamar Lt 2"
              class="w-full border-2 border-border rounded-xl p-2.5 font-semibold"
            />
          </div>

          <div>
            <label class="block font-bold text-text-secondary mb-1">Jenis Pekerjaan</label>
            <select v-model="newComp.jenis_pekerjaan" class="w-full border-2 border-border rounded-xl p-2.5 font-semibold">
              <option value="penambahan_kapasitas">Penambahan Kapasitas / Lantai</option>
              <option value="penggantian_komponen">Penggantian Komponen (Atap, Instalasi)</option>
              <option value="pemeliharaan_rutin">Pemeliharaan Rutin</option>
              <option value="lainnya">Lainnya — Perlu Telaah</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block font-bold text-text-secondary mb-1">Biaya (Rp)</label>
              <input
                v-model.number="newComp.biaya_perolehan"
                type="number"
                min="0"
                placeholder="Biaya..."
                class="w-full border-2 border-border rounded-xl p-2.5 font-semibold"
              />
            </div>
            <div>
              <label class="block font-bold text-text-secondary mb-1">Tahun Pekerjaan</label>
              <input
                v-model.number="newComp.tahun_perolehan"
                type="number"
                placeholder="Contoh: 2024"
                class="w-full border-2 border-border rounded-xl p-2.5 font-semibold"
              />
            </div>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            @click="showAddComponentModal = false"
            class="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-text-secondary"
          >
            Batal
          </button>
          <button
            type="button"
            @click="saveNewComponent"
            :disabled="isSavingComp"
            class="px-5 py-2.5 rounded-xl bg-navy text-white text-xs font-bold shadow disabled:opacity-50"
          >
            {{ isSavingComp ? 'Menyimpan...' : 'Simpan Komponen' }}
          </button>
        </div>
      </div>
    </BaseModal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../supabase.js'
import BaseModal from '../components/BaseModal.vue'
import { getAssetCategoryLabel, getAssetCategoryIcon, inspectAssetCompleteness, getCurrentUserRole } from '../lib/aset.js'

const route = useRoute()
const router = useRouter()

const isLoading = ref(true)
const isDeleting = ref(false)
const isSavingComp = ref(false)
const errorMessage = ref('')
const currentUserRole = ref(null)
const showAddComponentModal = ref(false)

const asset = ref(null)
const componentsList = ref([])

const canManageAssets = computed(() => {
  return currentUserRole.value === 'admin' || currentUserRole.value === 'owner'
})

const newComp = reactive({
  nama_komponen: '',
  jenis_pekerjaan: 'penambahan_kapasitas',
  biaya_perolehan: null,
  tahun_perolehan: null,
  pola_penggunaan: 'seluruhnya_usaha',
  porsi_usaha_persen: 100,
})

async function loadAssetDetail() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    currentUserRole.value = await getCurrentUserRole(supabase)

    const { data, error } = await supabase
      .from('assets')
      .select(`
        *,
        locations(nama_lokasi),
        rooms(nomor_kamar),
        asset_components(*)
      `)
      .eq('id', route.params.id)
      .single()

    if (error) throw error
    if (!data) {
      asset.value = null
    } else {
      asset.value = data
      componentsList.value = data.asset_components || []
    }
  } catch (err) {
    console.error('[SimKos] Error load detail aset:', err)
    errorMessage.value = err.message || 'Gagal memuat detail aset.'
  } finally {
    isLoading.value = false
  }
}

const completeness = computed(() => {
  if (!asset.value) return { isComplete: false, missingFields: [] }
  return inspectAssetCompleteness(asset.value, componentsList.value)
})

const totalCost = computed(() => {
  return componentsList.value.reduce((acc, c) => acc + (parseFloat(c.biaya_perolehan) || 0), 0)
})

async function saveNewComponent() {
  if (!canManageAssets.value) {
    alert('Hanya admin atau owner yang dapat menambah komponen.')
    return
  }
  if (!newComp.nama_komponen.trim()) {
    alert('Nama pekerjaan komponen wajib diisi.')
    return
  }

  isSavingComp.value = true
  try {
    const payload = {
      asset_id: asset.value.id,
      nama_komponen: newComp.nama_komponen.trim(),
      jenis_pekerjaan: newComp.jenis_pekerjaan,
      biaya_perolehan: newComp.biaya_perolehan !== null ? newComp.biaya_perolehan : null,
      tahun_perolehan: newComp.tahun_perolehan || null,
      pola_penggunaan: newComp.pola_penggunaan,
      porsi_usaha_persen: newComp.porsi_usaha_persen,
      status_kapitalisasi: newComp.jenis_pekerjaan === 'pemeliharaan_rutin' ? 'beban_langsung' : 'kapitalisasi',
    }

    const { error } = await supabase.from('asset_components').insert(payload)
    if (error) throw error

    showAddComponentModal.value = false
    newComp.nama_komponen = ''
    newComp.biaya_perolehan = null
    newComp.tahun_perolehan = null
    await loadAssetDetail()
  } catch (err) {
    alert(`Gagal menambah komponen: ${err.message}`)
  } finally {
    isSavingComp.value = false
  }
}

async function deleteDraftAsset() {
  if (!canManageAssets.value) {
    alert('Hanya admin atau owner yang berwenang menghapus draf aset.')
    return
  }
  if (!confirm(`Hapus draf aset "${asset.value.nama_aset}"? Aksi ini tidak dapat dibatalkan.`)) return

  isDeleting.value = true
  try {
    const { error } = await supabase
      .from('assets')
      .delete()
      .eq('id', asset.value.id)

    if (error) throw error
    router.push('/aset')
  } catch (err) {
    alert(`Gagal menghapus draf: ${err.message}`)
  } finally {
    isDeleting.value = false
  }
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'terverifikasi': return 'bg-blue-100 text-blue-800'
    case 'dibukukan': return 'bg-emerald-100 text-emerald-800'
    default: return 'bg-amber-100 text-amber-800'
  }
}

function getStatusText(status) {
  switch (status) {
    case 'terverifikasi': return 'Terverifikasi'
    case 'dibukukan': return 'Dibukukan'
    default: return 'Draf'
  }
}

function formatCurrency(val) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val || 0)
}

onMounted(() => {
  loadAssetDetail()
})
</script>