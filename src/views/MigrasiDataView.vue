<template>
  <div class="min-h-screen bg-bg-primary pb-28">
    <!-- Header -->
    <header class="bg-navy text-white px-6 pt-5 pb-6 shadow-lg rounded-b-[1.5rem] space-y-3">
      <div class="flex items-center gap-3">
        <router-link
          to="/"
          class="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Kembali ke Beranda"
        >
          <svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </router-link>
        <div>
          <h1 class="text-2xl font-black tracking-tight flex items-center gap-2">
            <span>⚡</span> Migrasi Data Cerdas
          </h1>
          <p class="text-xs text-blue-200 font-medium">Import catatan buku kas & hubungkan ke menu penghuni</p>
        </div>
      </div>
    </header>

    <div class="px-5 mt-5 space-y-6 max-w-2xl mx-auto">
      <!-- Step 1: Input Catatan Teks -->
      <section class="bg-card border-2 border-border rounded-[var(--radius-card)] p-5 shadow-sm space-y-4">
        <div class="flex items-center justify-between border-b border-border pb-3">
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-full bg-navy text-white text-xs font-black flex items-center justify-center">1</span>
            <h2 class="text-lg font-black text-text-primary">Tempel Catatan Teks</h2>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="rawText"
              type="button"
              @click="clearText"
              class="text-xs text-text-muted hover:text-expense font-bold transition px-2 py-1"
            >
              Bersihkan
            </button>
            <button
              type="button"
              @click="loadSampleText"
              class="text-xs bg-navy/10 text-navy hover:bg-navy/20 font-bold px-3 py-1.5 rounded-lg transition"
            >
              Contoh Catatan
            </button>
          </div>
        </div>

        <p class="text-xs text-text-muted">
          Salin catatan dari WhatsApp, Notepad, atau buku catatan orang tua Anda, lalu tempel di kotak berikut:
        </p>

        <textarea
          v-model="rawText"
          rows="7"
          placeholder="Nama : Ahmad Choirul Riza&#10;Alamat : Kab. Jombang&#10;No. HP : 081234567890&#10;Tgl. Masuk : 06/07/2026&#10;Pembayaran/DP :&#10;1. Tgl.06-07-26 = 750.000 / trnfer lunas&#10;2. Tgl.06-08-26 = 750.000 / trnfer lunas"
          class="w-full bg-gray-50 border-2 border-border rounded-xl p-3.5 text-sm font-mono text-text-primary placeholder-text-muted focus:border-navy focus:bg-white focus:outline-none transition leading-relaxed"
        ></textarea>

        <button
          v-if="canPaste"
          type="button"
          @click="pasteFromClipboard"
          class="w-full py-2.5 bg-gray-100 hover:bg-gray-200 active:scale-[0.99] text-text-primary rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border border-border"
        >
          <span>📋</span> Tempel dari Clipboard
        </button>
      </section>

      <!-- Step 2: Hubungkan ke Penghuni / Kamar -->
      <section v-if="rawText.trim()" class="bg-card border-2 border-border rounded-[var(--radius-card)] p-5 shadow-sm space-y-4 animate-fade-in-up">
        <div class="flex items-center justify-between border-b border-border pb-3">
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-full bg-navy text-white text-xs font-black flex items-center justify-center">2</span>
            <h2 class="text-lg font-black text-text-primary">Koneksikan ke Penghuni</h2>
          </div>
          <span v-if="selectedRoom" class="text-xs text-income font-bold flex items-center gap-1">
            <span>✓</span> Terhubung
          </span>
        </div>

        <!-- Search input -->
        <div class="space-y-1.5">
          <label class="block text-xs font-bold text-text-muted uppercase tracking-wider">
            Cari Nama Penghuni / Nomor Kamar:
          </label>
          <div class="relative">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Ketik nama atau nomor kamar..."
              class="w-full bg-white border-2 border-border rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold text-text-primary focus:border-navy focus:outline-none"
            />
            <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted text-base">🔍</span>
          </div>
        </div>

        <!-- Selected Room Card (If connected) -->
        <div
          v-if="selectedRoom"
          class="p-4 rounded-xl bg-navy/5 border-2 border-navy/30 flex items-center justify-between gap-3 animate-fade-in"
        >
          <div class="flex items-center gap-3">
            <div
              :class="['w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm',
                       selectedRoom.activeRental ? 'bg-income' : 'bg-slate-400',
                       getRoomBadgeFontSize(selectedRoom.nomor_kamar)]"
            >
              {{ selectedRoom.nomor_kamar }}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-black text-base text-navy">
                  {{ selectedRoom.activeRental?.tenants?.nama_lengkap || 'Kamar Kosong' }}
                </span>
                <span v-if="isNameMatched" class="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">
                  Nama Cocok
                </span>
              </div>
              <p class="text-xs text-text-muted">
                {{ selectedRoom.locations?.nama_lokasi || 'Kos' }} · Kamar {{ selectedRoom.nomor_kamar }}
                <span v-if="selectedRoom.activeRental">· Jatuh Tempo: {{ formatDateDisplay(selectedRoom.activeRental.tanggal_jatuh_tempo) }}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            @click="selectedRoom = null"
            class="text-xs text-text-muted hover:text-expense underline font-bold shrink-0"
          >
            Ganti
          </button>
        </div>

        <!-- Search Results List (If no room selected or searching) -->
        <div v-else class="space-y-2 max-h-56 overflow-y-auto pr-1">
          <p class="text-xs text-text-muted font-medium">Pilih salah satu penghuni di bawah untuk mengkoneksikan data:</p>
          <div
            v-for="room in filteredRooms"
            :key="room.id"
            @click="selectTargetRoom(room)"
            class="p-3 bg-gray-50 hover:bg-navy/10 active:scale-[0.99] rounded-xl border border-border cursor-pointer transition flex items-center justify-between gap-2"
          >
            <div class="flex items-center gap-3">
              <span
                :class="['w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs',
                         room.activeRental ? 'bg-income' : 'bg-slate-400',
                         getRoomBadgeFontSize(room.nomor_kamar)]"
              >
                {{ room.nomor_kamar }}
              </span>
              <div>
                <p class="text-sm font-bold text-text-primary">
                  {{ room.activeRental?.tenants?.nama_lengkap || 'Kamar Kosong' }}
                </p>
                <p class="text-xs text-text-muted">
                  {{ room.locations?.nama_lokasi || 'Kos' }} · Kamar {{ room.nomor_kamar }}
                </p>
              </div>
            </div>
            <span class="text-xs bg-navy text-white px-3 py-1.5 rounded-lg font-bold shrink-0">
              Pilih
            </span>
          </div>

          <div v-if="filteredRooms.length === 0" class="p-4 text-center text-xs text-text-muted">
            Tidak ditemukan penghuni atau kamar yang sesuai kata kunci "{{ searchQuery }}".
          </div>
        </div>
      </section>

      <!-- Step 3: Pratinjau Data Migrasi -->
      <section v-if="selectedRoom && parsedData" class="bg-card border-2 border-border rounded-[var(--radius-card)] p-5 shadow-sm space-y-5 animate-fade-in-up">
        <div class="flex items-center justify-between border-b border-border pb-3">
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-full bg-navy text-white text-xs font-black flex items-center justify-center">3</span>
            <h2 class="text-lg font-black text-text-primary">Pratinjau Data Migrasi</h2>
          </div>
          <span class="text-xs bg-purple-100 text-purple-700 font-bold px-2.5 py-1 rounded-full">
            {{ parsedData.pembayaran.length }} Pembayaran Ditemukan
          </span>
        </div>

        <!-- 3A: Profil Penghuni -->
        <div class="bg-gray-50 rounded-xl p-4 border border-border space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-text-primary flex items-center gap-1.5">
              <span>👤</span> Data Profil Terdeteksi
            </h3>
            <label class="flex items-center gap-2 text-xs font-bold text-text-primary cursor-pointer">
              <input type="checkbox" v-model="updateProfile" class="w-4 h-4 rounded text-navy" />
              <span>Simpan ke Profil</span>
            </label>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div class="bg-white p-2.5 rounded-lg border border-border">
              <span class="text-text-muted block">Nama:</span>
              <span class="font-bold text-text-primary">{{ parsedData.nama || '--' }}</span>
            </div>
            <div class="bg-white p-2.5 rounded-lg border border-border">
              <span class="text-text-muted block">Alamat KTP:</span>
              <span class="font-bold text-text-primary">{{ parsedData.alamat || '--' }}</span>
            </div>
            <div class="bg-white p-2.5 rounded-lg border border-border">
              <span class="text-text-muted block">No. HP:</span>
              <span class="font-bold text-text-primary">{{ parsedData.nomor_hp || '--' }}</span>
            </div>
            <div class="bg-white p-2.5 rounded-lg border border-border">
              <span class="text-text-muted block">Tgl. Masuk:</span>
              <span class="font-bold text-text-primary">{{ parsedData.tanggal_masuk ? formatDateDisplay(parsedData.tanggal_masuk) : '--' }}</span>
            </div>
          </div>
        </div>

        <!-- 3B: Riwayat Pembayaran -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-text-primary flex items-center gap-1.5">
              <span>💳</span> Riwayat Pembayaran (Buku Catatan Kas)
            </h3>
            <span class="text-xs text-text-muted font-medium">
              Pilih yang ingin diimpor
            </span>
          </div>

          <div v-if="parsedData.pembayaran.length === 0" class="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
            Tidak ada baris pembayaran yang terdeteksi dalam format teks. Pastikan format pembayaran seperti: <br />
            <code>1. Tgl.06-07-26 = 750.000 / trnfer lunas</code>
          </div>

          <div v-else class="space-y-2 max-h-72 overflow-y-auto pr-1">
            <div
              v-for="(pay, idx) in parsedData.pembayaran"
              :key="idx"
              :class="['p-3 rounded-xl border transition flex items-center justify-between gap-3',
                       pay.isDuplicate ? 'bg-amber-50/60 border-amber-200' : 'bg-white border-border']"
            >
              <div class="flex items-center gap-3">
                <input
                  type="checkbox"
                  v-model="selectedPaymentIndices[idx]"
                  class="w-4 h-4 rounded text-navy cursor-pointer"
                />
                <div>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-black text-text-primary">
                      {{ formatRupiahSimple(pay.nominal) }}
                    </span>
                    <span
                      :class="['text-[10px] font-bold px-2 py-0.5 rounded-full',
                               pay.metode === 'Transfer' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700']"
                    >
                      {{ pay.metode }}
                    </span>
                    <span v-if="pay.isDuplicate" class="text-[10px] bg-amber-200 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                      Sudah Ada di Sistem
                    </span>
                    <span v-else class="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded">
                      Baru
                    </span>
                  </div>
                  <p class="text-xs text-text-muted mt-0.5">
                    Tanggal: {{ formatDateDisplay(pay.tanggal) }} · Keterangan: {{ pay.keterangan }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-blue-50 p-3 rounded-xl border border-blue-200 flex items-center justify-between text-xs">
            <span class="text-blue-900 font-medium">Total yang akan diimpor:</span>
            <span class="font-black text-blue-900 text-sm">{{ totalSelectedNominalFormatted }} ({{ countSelected }} transaksi)</span>
          </div>
        </div>

        <!-- 3C: Penyesuaian Tanggal Jatuh Tempo -->
        <div class="bg-gray-50 rounded-xl p-3.5 border border-border flex items-center justify-between gap-2">
          <div>
            <label class="text-xs font-bold text-text-primary block cursor-pointer" for="cb-due">
              Majukan Jatuh Tempo Otomatis
            </label>
            <p class="text-[11px] text-text-muted">
              Menyesuaikan jatuh tempo kamar sesuai bulan pembayaran terakhir yang diimpor.
            </p>
          </div>
          <input
            id="cb-due"
            type="checkbox"
            v-model="updateDueDate"
            class="w-5 h-5 rounded text-navy shrink-0 cursor-pointer"
          />
        </div>

        <!-- Submit Button -->
        <div class="pt-2">
          <button
            type="button"
            :disabled="isMigrating || countSelected === 0"
            @click="prosesMigrasi"
            class="w-full py-4 bg-income hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50 text-white rounded-[var(--radius-btn)] font-black text-base shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <span v-if="isMigrating" class="animate-spin text-lg">⏳</span>
            <span v-else>🚀</span>
            <span>{{ isMigrating ? 'Memproses Migrasi Data...' : 'Mulai Migrasi Data Sekarang' }}</span>
          </button>
        </div>
      </section>

      <!-- Step 4: Success Card -->
      <section v-if="migrationSuccess" class="bg-green-50 border-2 border-green-500 rounded-[var(--radius-card)] p-6 text-center space-y-4 animate-fade-in-up">
        <div class="w-14 h-14 bg-green-500 text-white rounded-full flex items-center justify-center text-2xl mx-auto shadow-md">
          ✓
        </div>
        <div>
          <h2 class="text-xl font-black text-green-900">Migrasi Data Berhasil!</h2>
          <p class="text-sm text-green-700 mt-1">
            Data untuk <strong>{{ successSummary.tenantName }}</strong> (Kamar {{ successSummary.roomNo }}) berhasil diperbarui dan {{ successSummary.count }} catatan pembayaran telah tersimpan.
          </p>
        </div>

        <div class="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            @click="bukaDiMenuPenghuni"
            class="flex-1 py-3.5 bg-navy hover:bg-navy/90 text-white rounded-xl text-sm font-black shadow-md transition flex items-center justify-center gap-2"
          >
            <span>📖</span> Buka Buku Catatan Kas
          </button>
          <button
            type="button"
            @click="resetFormForNext"
            class="flex-1 py-3.5 bg-white border-2 border-border text-text-primary hover:bg-gray-50 rounded-xl text-sm font-bold transition"
          >
            Migrasi Catatan Lainnya
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase.js'
import { parseCatatanKas } from '../lib/migrasiParser.js'
import { advanceOneMonth } from '../lib/date.js'
import { getRoomBadgeFontSize } from '../lib/sewa.js'

const router = useRouter()

const rawText = ref('')
const searchQuery = ref('')
const roomsList = ref([])
const selectedRoom = ref(null)
const existingIncomes = ref([])
const selectedPaymentIndices = ref({})
const updateProfile = ref(true)
const updateDueDate = ref(true)
const isMigrating = ref(false)
const migrationSuccess = ref(false)
const canPaste = ref(typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText))

const successSummary = ref({
  tenantName: '',
  roomNo: '',
  roomId: '',
  count: 0
})

// Parsed Data computed
const parsedData = computed(() => {
  const parsed = parseCatatanKas(rawText.value)

  // Tandai jika pembayaran sudah pernah ada di database
  const pembayaranWithDupes = parsed.pembayaran.map(p => {
    const isDup = existingIncomes.value.some(ex =>
      ex.tanggal_bayar === p.tanggal && Number(ex.nominal) === Number(p.nominal)
    )
    return {
      ...p,
      isDuplicate: isDup
    }
  })

  return {
    ...parsed,
    pembayaran: pembayaranWithDupes
  }
})

// Otomatis centang item yang bukan duplikat
watch(parsedData, (newVal) => {
  const flags = {}
  newVal.pembayaran.forEach((p, idx) => {
    // Default centang bila bukan duplikat
    flags[idx] = !p.isDuplicate
  })
  selectedPaymentIndices.value = flags
}, { immediate: true })

// Otomatis cari penghuni saat nama di text terdeteksi
watch(() => parsedData.value.nama, (newNama) => {
  if (newNama && newNama.trim().length >= 3 && !selectedRoom.value) {
    searchQuery.value = newNama.trim()
    autoMatchRoom(newNama.trim(), parsedData.value.nomor_kamar)
  }
})

function autoMatchRoom(nama, kamarNo) {
  const lowerNama = nama.toLowerCase()
  // 1. Cari exact/partial name match pada active rental
  const matched = roomsList.value.find(r => {
    const tName = r.activeRental?.tenants?.nama_lengkap || ''
    return tName.toLowerCase().includes(lowerNama) || lowerNama.includes(tName.toLowerCase())
  })
  if (matched) {
    selectTargetRoom(matched)
    return
  }

  // 2. Jika ada nomor kamar di catatan, cocokkan nomor kamar
  if (kamarNo) {
    const byKamar = roomsList.value.find(r =>
      String(r.nomor_kamar).toLowerCase() === String(kamarNo).toLowerCase()
    )
    if (byKamar) {
      selectTargetRoom(byKamar)
    }
  }
}

const isNameMatched = computed(() => {
  if (!selectedRoom.value || !parsedData.value.nama) return false
  const rName = (selectedRoom.value.activeRental?.tenants?.nama_lengkap || '').toLowerCase()
  const pName = parsedData.value.nama.toLowerCase()
  return rName.includes(pName) || pName.includes(rName)
})

const filteredRooms = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return roomsList.value
  return roomsList.value.filter(r => {
    const tName = (r.activeRental?.tenants?.nama_lengkap || '').toLowerCase()
    const rNo = String(r.nomor_kamar || '').toLowerCase()
    const loc = (r.locations?.nama_lokasi || '').toLowerCase()
    return tName.includes(q) || rNo.includes(q) || loc.includes(q)
  })
})

const countSelected = computed(() => {
  return Object.values(selectedPaymentIndices.value).filter(Boolean).length
})

const totalSelectedNominalFormatted = computed(() => {
  let total = 0
  parsedData.value.pembayaran.forEach((p, idx) => {
    if (selectedPaymentIndices.value[idx]) {
      total += p.nominal
    }
  })
  return formatRupiahSimple(total)
})

async function selectTargetRoom(room) {
  selectedRoom.value = room
  existingIncomes.value = []
  if (room.activeRental?.id) {
    // Ambil riwayat pembayaran lama untuk deteksi duplikasi
    try {
      const { data, error } = await supabase
        .from('incomes')
        .select('tanggal_bayar, nominal')
        .eq('rental_id', room.activeRental.id)

      if (!error && data) {
        existingIncomes.value = data
      }
    } catch (_) {}
  }
}

async function loadRooms() {
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('*, locations(nama_lokasi), rentals(*, tenants(*))')
      .order('nomor_kamar', { ascending: true })

    if (error) throw error

    roomsList.value = (data || []).map(room => {
      const activeRental = room.rentals?.find(r => r.status_aktif === true) || null
      return {
        ...room,
        activeRental
      }
    })
  } catch (err) {
    console.error('[SimKos] Gagal memuat kamar:', err)
  }
}

onMounted(() => {
  loadRooms()
})

function loadSampleText() {
  rawText.value = `Data Kamar Kost KD07

Nama : Ahmad Choirul Riza
Alamat : Kab. Jombang
No. HP : 081234567890
Tgl. Masuk : 06/07/2026
HP Family : --
Catatan : --
Pembayaran/DP :
1. Tgl.06-07-26 = 750.000 / trnfer lunas
2. Tgl.06-08-26 = 750.000 / trnfer lunas
3. Tgl.06-09-26 = 750.000 / tunai lunas
4. Tgl.05-10-26 = 750.000 / tunai lunas
5. Tgl.04-11-26 = 750.000 / tunai lunas
6. Tgl.19-02-26 = 765.000 / tunai lunas`
  migrationSuccess.value = false
}

function clearText() {
  rawText.value = ''
  selectedRoom.value = null
  migrationSuccess.value = false
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    if (text) {
      rawText.value = text
    }
  } catch (err) {
    alert('Tidak dapat membaca clipboard: pastikan izin clipboard aktif di browser Anda.')
  }
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '--'
  const parts = String(dateStr).split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return dateStr
}

function formatRupiahSimple(val) {
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(val || 0)
}

async function prosesMigrasi() {
  const room = selectedRoom.value
  const rental = room?.activeRental
  if (!rental) {
    alert('Pilih kamar dengan penghuni aktif untuk mengkoneksikan catatan!')
    return
  }

  isMigrating.value = true
  try {
    // 1. Update data profil penghuni (Alamat, No HP, dll) jika dicentang
    if (updateProfile.value && rental.tenant_id) {
      const tenantPayload = {}
      if (parsedData.value.alamat) tenantPayload.alamat = parsedData.value.alamat
      if (parsedData.value.nomor_hp) tenantPayload.nomor_hp = parsedData.value.nomor_hp
      if (parsedData.value.kontak_darurat) tenantPayload.kontak_darurat = parsedData.value.kontak_darurat

      if (Object.keys(tenantPayload).length > 0) {
        const { error: tErr } = await supabase
          .from('tenants')
          .update(tenantPayload)
          .eq('id', rental.tenant_id)

        if (tErr) console.error('[SimKos] Update profil warning:', tErr.message)
      }

      // Update catatan sewa bila ada
      if (parsedData.value.catatan) {
        await supabase
          .from('rentals')
          .update({ catatan: parsedData.value.catatan })
          .eq('id', rental.id)
      }
    }

    // 2. Insert baris pembayaran yang dipilih
    const toInsert = []
    parsedData.value.pembayaran.forEach((p, idx) => {
      if (selectedPaymentIndices.value[idx]) {
        toInsert.push({
          rental_id: rental.id,
          tanggal_bayar: p.tanggal,
          nominal: p.nominal,
          keterangan: p.keterangan || `Sewa Kamar (${p.metode})`,
          metode_bayar: p.metode,
          status_bayar: 'Lunas',
          kategori: 'Sewa Kamar',
          ...(rental.org_id ? { org_id: rental.org_id } : {})
        })
      }
    })

    if (toInsert.length > 0) {
      const { error: incErr } = await supabase
        .from('incomes')
        .insert(toInsert)

      if (incErr) throw incErr
    }

    // 3. Majukan tanggal jatuh tempo jika dipilih
    if (updateDueDate.value && toInsert.length > 0) {
      // Ambil transaksi dengan tanggal paling akhir
      const sorted = [...toInsert].sort((a, b) => a.tanggal_bayar.localeCompare(b.tanggal_bayar))
      const latestPayment = sorted[sorted.length - 1]
      const newDueDate = advanceOneMonth(latestPayment.tanggal_bayar)

      if (newDueDate) {
        await supabase
          .from('rentals')
          .update({ tanggal_jatuh_tempo: newDueDate })
          .eq('id', rental.id)
      }
    }

    // Simpan ringkasan sukses
    successSummary.value = {
      tenantName: rental.tenants?.nama_lengkap || parsedData.value.nama || 'Penghuni',
      roomNo: room.nomor_kamar,
      roomId: room.id,
      count: toInsert.length
    }

    migrationSuccess.value = true
    // Refresh list kamar
    await loadRooms()
  } catch (err) {
    alert(`Gagal memproses migrasi data: ${err.message || 'Terjadi kesalahan'}`)
    console.error('[SimKos] Migrasi error:', err)
  } finally {
    isMigrating.value = false
  }
}

function bukaDiMenuPenghuni() {
  if (successSummary.value.roomId) {
    router.push({
      path: '/penghuni',
      query: { room_id: successSummary.value.roomId }
    })
  } else {
    router.push('/penghuni')
  }
}

function resetFormForNext() {
  rawText.value = ''
  selectedRoom.value = null
  migrationSuccess.value = false
  searchQuery.value = ''
}
</script>
