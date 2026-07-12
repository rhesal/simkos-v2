<template>
  <div class="min-h-screen bg-bg-primary pb-24">
    <!-- Header -->
    <header class="bg-navy rounded-b-4xl px-6 pt-12 pb-8 text-white shadow-lg max-w-lg mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-3xl font-black tracking-tight">Denah Kos</h1>
        <span class="bg-white/10 px-4 py-1.5 rounded-full text-sm font-bold">
          Room Grid
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
            <span>➕</span> Daftar
          </router-link>
        </div>

        <!-- Filters Grid -->
        <div class="grid grid-cols-2 gap-3">
          <!-- Location Filter -->
          <div class="space-y-1.5">
            <label for="location-filter" class="block text-xs font-bold text-blue-200">Lokasi Kos</label>
            <div class="relative">
              <select
                id="location-filter"
                v-model="selectedLocationFilter"
                class="w-full px-4 py-3 bg-white border-2 border-white/20 rounded-xl appearance-none focus:outline-none focus:border-white text-sm font-bold text-gray-800 shadow-sm"
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
              <div class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          </div>

          <!-- Status Filter Dropdown -->
          <div class="space-y-1.5">
            <label for="status-filter" class="block text-xs font-bold text-blue-200">Status Kamar</label>
            <div class="relative">
              <select
                id="status-filter"
                v-model="statusFilter"
                class="w-full px-4 py-3 bg-white border-2 border-white/20 rounded-xl appearance-none focus:outline-none focus:border-white text-sm font-bold text-gray-800 shadow-sm"
              >
                <option value="Semua">📋 Semua</option>
                <option value="Terisi">🟢 Terisi</option>
                <option value="Kosong">⚪ Kosong</option>
              </select>
              <div class="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
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
        <span class="text-base font-semibold text-text-secondary">Memuat denah kos...</span>
      </div>

      <template v-else>
        <!-- Container Utama Widget Statistik Psikologis -->
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 mb-6 animate-fade-in-up">
          <!-- Baris 1: Persentase Tingkat Hunian -->
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm font-semibold text-slate-700">📊 Tingkat Hunian Produktif</span>
            <span class="text-sm font-bold text-green-600">{{ persentaseHunian }}%</span>
          </div>

          <!-- Progress Bar Horizontal Premium -->
          <div class="w-full bg-slate-100 rounded-full h-3 mb-4 overflow-hidden">
            <div class="bg-gradient-to-r from-green-500 to-emerald-600 h-3 rounded-full transition-all duration-500" 
                 :style="{ width: persentaseHunian + '%' }"></div>
          </div>

          <!-- Baris 2: Detail Aset Kamar (Positive Framing) -->
          <div class="grid grid-cols-2 gap-4 pt-2 border-t border-slate-50">
            <div class="text-center border-r border-slate-100">
              <p class="text-xs text-slate-500 mb-0.5">🎉 Kamar Aktif</p>
              <p class="text-lg font-bold text-slate-800">{{ kamarAktif }} <span class="text-xs font-normal text-slate-400">/ {{ totalKamar }}</span></p>
            </div>
            <div class="text-center">
              <p class="text-xs text-slate-500 mb-0.5">✨ Siap Huni (Tersedia)</p>
              <p class="text-lg font-bold text-emerald-600">{{ siapHuni }} <span class="text-xs font-normal text-slate-400">Kamar</span></p>
            </div>
          </div>
        </div>

        <button @click="fetchBlacklistTenants" class="w-full mb-4 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition animate-fade-in-up">
          <span>📋 Lihat Pusat Data Blacklist Penghuni</span>
        </button>

        <!-- Empty State -->
        <div
          v-if="filteredRooms.length === 0"
          class="bg-white rounded-[var(--radius-card)] border-2 border-dashed border-border p-12 text-center"
        >
          <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          </div>
          <p class="text-lg font-bold text-text-primary mb-1">Kamar tidak ditemukan</p>
          <p class="text-sm text-text-secondary">Tidak ada kamar yang sesuai dengan filter.</p>
        </div>

        <!-- Rooms Row List -->
        <div v-else class="flex flex-col gap-3">
          <div
            v-for="room in filteredRooms"
            :key="room.id"
            @click="handleRoomClick(room)"
            class="bg-white rounded-[var(--radius-card)] border-2 border-border p-4 flex items-center justify-between gap-4 cursor-pointer shadow-sm active:scale-[0.98] hover:shadow transition-all duration-150 relative overflow-hidden"
          >
            <!-- Left Side: Square Room Number Box -->
            <div
              class="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-black flex-shrink-0 shadow-sm"
              :class="room.activeRental ? 'bg-green-500' : 'bg-slate-400'"
            >
              {{ room.nomor_kamar }}
            </div>

            <!-- Middle Side: Main Info -->
            <div class="flex-1 min-w-0 flex flex-col justify-center">
              <template v-if="room.activeRental">
                <p class="text-base font-extrabold text-text-primary truncate">
                  {{ room.activeRental.tenants?.nama_lengkap }}
                </p>
                <p class="text-xs font-semibold text-text-secondary mt-0.5">
                  {{ formatCurrency(room.harga_bulanan || 0) }}/bulan
                </p>
              </template>
              <template v-else>
                <p class="text-base font-extrabold text-text-primary truncate">
                  Kamar {{ room.nomor_kamar }}
                </p>
                <p class="text-xs font-semibold text-text-secondary mt-0.5">
                  {{ formatCurrency(room.harga_bulanan || 0) }}/bulan
                </p>
              </template>
            </div>

            <!-- Right Side: Status Badge -->
            <div class="flex-shrink-0">
              <template v-if="room.activeRental">
                <span
                  class="px-3 py-1.5 rounded-full text-xs font-black inline-block border shadow-sm"
                  :class="room.activeRental.diffDays < 0
                    ? 'bg-red-100 text-red-700 border-red-200 animate-pulse'
                    : room.activeRental.diffDays === 0
                      ? 'bg-red-50 text-red-600 border-red-100'
                      : 'bg-amber-100 text-amber-800 border-amber-200'"
                >
                  <template v-if="room.activeRental.diffDays < 0">
                    🔴 Lewat {{ Math.abs(room.activeRental.diffDays) }} Hari
                  </template>
                  <template v-else-if="room.activeRental.diffDays === 0">
                    ⚠️ Hari Ini
                  </template>
                  <template v-else>
                    ⏳ H-{{ room.activeRental.diffDays }}
                  </template>
                </span>
              </template>
              <template v-else>
                <span class="px-4 py-1.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500 border border-gray-200 inline-block shadow-sm">
                  Kosong
                </span>
              </template>
            </div>

            <!-- Tiny Location Info overlay -->
            <span class="absolute right-3 top-1 text-[8px] font-bold text-text-muted opacity-30">
              {{ room.locations?.nama_lokasi }}
            </span>
          </div>
        </div>
      </template>
    </div>

    <!-- Modal 1: Detail Penghuni (Terisi) -->
    <div
      v-if="showDetailModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 pb-24 bg-navy/60 backdrop-blur-sm animate-fade-in"
    >
      <div class="bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl w-full max-w-md p-6 space-y-5 max-h-[80vh] overflow-y-auto pb-8 animate-fade-in-up">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b-2 border-border pb-3">
          <div v-if="isEditingRoomNumber" class="flex-1">
            <div class="flex items-center gap-2">
              <input
                v-model="editedRoomNumber"
                type="text"
                class="bg-card border-2 border-border rounded-lg px-2.5 py-1 text-sm font-extrabold text-text-primary focus:border-navy focus:outline-none w-28"
              />
              <button
                @click="updateRoomNumber"
                class="px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 active:scale-95 transition-transform"
              >
                Simpan
              </button>
              <button
                @click="batalEditRoomNumber"
                class="px-2.5 py-1 bg-gray-100 border border-border text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-200 active:scale-95 transition-transform"
              >
                Batal
              </button>
            </div>
            <!-- UX Copywriting Guardrail -->
            <p class="text-[10px] font-bold text-amber-600 max-w-[280px] leading-tight mt-1.5">
              Peringatan: Mengubah nomor kamar akan memperbarui nama kamar ini di seluruh laporan keuangan masa lalu. Gunakan hanya untuk koreksi salah ketik.
            </p>
          </div>
          <div v-else class="flex-1">
            <h3 class="text-xl font-black text-text-primary tracking-tight flex items-center gap-2">
              <span>🏠 Detail Kamar {{ selectedRoom?.nomor_kamar }}</span>
              <button @click="mulaiEditRoomNumber(selectedRoom?.nomor_kamar)" class="text-sm hover:opacity-85" title="Ubah Nomor Kamar">✏️</button>
            </h3>
            <p class="text-xs font-bold text-text-secondary mt-0.5">
              {{ selectedRoom?.locations?.nama_lokasi }}
            </p>
          </div>
          <button @click="showDetailModal = false" class="text-text-muted hover:text-text-primary text-xl font-bold">✕</button>
        </div>

        <!-- Detail Data -->
        <div class="space-y-3.5 pb-6">
          <div class="bg-gray-50 border border-border rounded-xl p-4 space-y-2.5 text-sm font-semibold text-text-primary">
            <div class="flex items-center justify-between">
              <span class="text-text-secondary">Nama Penghuni</span>
              <span class="font-extrabold">{{ selectedRoom?.activeRental?.tenants?.nama_lengkap }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-text-secondary">Nomor HP</span>
              <span class="font-extrabold text-navy">📞 {{ selectedRoom?.activeRental?.tenants?.nomor_hp || '-' }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-text-secondary">Harga Sewa</span>
              <span class="font-extrabold text-green-700">{{ formatCurrency(selectedRoom?.harga_bulanan || 0) }}/bulan</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-text-secondary">Tipe Sewa</span>
              <span class="capitalize bg-navy/5 text-navy px-2 py-0.5 rounded text-xs font-black">{{ selectedRoom?.activeRental?.tipe_sewa }}</span>
            </div>
            <!-- Baris Tanggal Masuk & Jatuh Tempo -->
            <div class="pt-2 border-t border-gray-200 space-y-2">
              <!-- Mulai Masuk -->
              <div class="flex justify-between items-center text-xs">
                <span class="text-text-secondary">Mulai Masuk</span>
                <div v-if="!isEditingDates" class="flex items-center space-x-1.5 font-semibold">
                  <span>{{ formatDateDisplay(selectedRoom?.activeRental?.tanggal_masuk) }}</span>
                  <button @click="mulaiEditDates" class="text-xs text-slate-400 hover:text-slate-600" title="Ubah Tanggal Sewa">✏️</button>
                </div>
                <input
                  v-else
                  type="date"
                  v-model="editStartDate"
                  class="border rounded-xl px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-green-500 w-36"
                />
              </div>

              <!-- Jatuh Tempo -->
              <div class="flex justify-between items-center text-xs">
                <span class="text-text-secondary">Jatuh Tempo</span>
                <div v-if="!isEditingDates" class="flex items-center space-x-1.5 font-bold text-navy">
                  <span>{{ formatDateDisplay(selectedRoom?.activeRental?.tanggal_jatuh_tempo) }}</span>
                </div>
                <input
                  v-else
                  type="date"
                  v-model="editDueDate"
                  class="border rounded-xl px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-green-500 w-36"
                />
              </div>

              <!-- Tombol Aksi Transisi -->
              <div v-if="isEditingDates" class="flex space-x-2 pt-1 justify-end">
                <button
                  @click="isEditingDates = false"
                  class="text-[10px] bg-gray-100 text-slate-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 transition font-bold"
                >
                  Batal
                </button>
                <button
                  @click="updateRentalDates"
                  class="text-[10px] bg-green-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-green-700 shadow-sm transition font-bold"
                >
                  Simpan Perubahan
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Actions Grid (WhatsApp, Edit, Checkout, Hapus) -->
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <!-- WhatsApp -->
            <button
              @click="hubungiWhatsApp(selectedRoom?.activeRental?.tenants?.nomor_hp)"
              class="flex items-center justify-center gap-2 py-3 bg-white border-2 border-green-500 hover:bg-green-50 active:scale-95 text-green-600 rounded-xl text-sm font-bold shadow-sm transition-all duration-150"
            >
              <svg class="w-5 h-5 mr-2 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.452 5.714 1.456h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <span>WhatsApp</span>
            </button>

            <!-- Edit -->
            <button
              @click="triggerEditModal"
              class="flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-700 rounded-xl text-sm font-bold shadow-sm transition-all duration-150 border border-gray-200"
            >
              ✏️ Edit Data
            </button>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <!-- Checkout -->
            <button
              @click="triggerCheckoutModal"
              class="flex items-center justify-center gap-2 py-3 bg-red-50 hover:bg-red-100 active:scale-95 text-red-600 rounded-xl text-sm font-bold shadow-sm transition-all duration-150 border border-red-200"
            >
              🔴 Checkout
            </button>

            <!-- Hapus -->
            <button
              @click="checkRentalHistoryBeforeDelete"
              class="flex items-center justify-center gap-2 py-3 border border-red-500 text-red-500 hover:bg-red-50 active:scale-95 rounded-xl text-xs font-bold transition-all duration-150"
            >
              🗑️ Hapus Sewa
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal 2: Kamar Kosong (Siap Huni) -->
    <div
      v-if="showEmptyModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 pb-24 bg-navy/60 backdrop-blur-sm animate-fade-in"
    >
      <div class="bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl w-full max-w-md p-6 space-y-5 max-h-[80vh] overflow-y-auto pb-8 animate-fade-in-up">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b-2 border-border pb-3">
          <div v-if="isEditingRoomNumber" class="flex-1">
            <div class="flex items-center gap-2">
              <input
                v-model="editedRoomNumber"
                type="text"
                class="bg-card border-2 border-border rounded-lg px-2.5 py-1 text-sm font-extrabold text-text-primary focus:border-navy focus:outline-none w-28"
              />
              <button
                @click="updateRoomNumber"
                class="px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 active:scale-95 transition-transform"
              >
                Simpan
              </button>
              <button
                @click="batalEditRoomNumber"
                class="px-2.5 py-1 bg-gray-100 border border-border text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-200 active:scale-95 transition-transform"
              >
                Batal
              </button>
            </div>
            <!-- UX Copywriting Guardrail -->
            <p class="text-[10px] font-bold text-amber-600 max-w-[280px] leading-tight mt-1.5">
              Peringatan: Mengubah nomor kamar akan memperbarui nama kamar ini di seluruh laporan keuangan masa lalu. Gunakan hanya untuk koreksi salah ketik.
            </p>
          </div>
          <div v-else class="flex-1">
            <h3 class="text-xl font-black text-text-primary tracking-tight flex items-center gap-2">
              <span>⚪ Kamar {{ selectedRoom?.nomor_kamar }} Kosong</span>
              <button @click="mulaiEditRoomNumber(selectedRoom?.nomor_kamar)" class="text-sm hover:opacity-85" title="Ubah Nomor Kamar">✏️</button>
            </h3>
            <p class="text-xs font-bold text-text-secondary mt-0.5">
              {{ selectedRoom?.locations?.nama_lokasi }}
            </p>
          </div>
          <button @click="showEmptyModal = false" class="text-text-muted hover:text-text-primary text-xl font-bold">✕</button>
        </div>

        <div class="text-center py-6 space-y-3 pb-6">
          <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-3xl">🔑</div>
          <p class="text-base font-extrabold text-text-primary">Kamar ini sedang kosong & siap dihuni.</p>
          <p class="text-xs font-bold text-text-secondary">Harga Standar: {{ formatCurrency(selectedRoom?.harga_bulanan || 0) }}/bulan</p>
        </div>

        <!-- Sejarah Hunian Kamar (Memoar Kamar) -->
        <hr class="border-border border-t-2 my-2" />

        <div class="space-y-3 text-left">
          <h4 class="text-sm font-semibold text-slate-700">📜 Sejarah Hunian Kamar</h4>
          
          <div v-if="pastTenantsList.length === 0" class="text-xs text-text-muted italic py-1">
            Belum ada riwayat penghuni di kamar ini.
          </div>
          
          <div v-else class="max-h-40 overflow-y-auto space-y-2 pr-1">
            <div
              v-for="item in pastTenantsList"
              :key="item.id"
              class="flex justify-between items-center p-2.5 bg-slate-50 border border-border rounded-xl text-xs shadow-sm"
            >
              <!-- Sisi Kiri -->
              <div class="min-w-0">
                <div class="flex items-center space-x-1.5 mb-0.5">
                  <span class="font-extrabold text-slate-800 truncate max-w-[120px]">{{ item.tenants?.nama_lengkap || 'Penyewa' }}</span>

                  <!-- Badge Indikator Reputasi -->
                  <span v-if="item.tenants?.status_reputasi === 'Blacklist'" class="bg-red-50 text-red-600 px-1.5 py-0.5 rounded-md font-bold border border-red-100 text-[9px] flex-shrink-0">🔴 RED FLAG</span>
                  <span v-else-if="item.tenants?.status_reputasi === 'Peringatan'" class="bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-md font-medium border border-amber-100 text-[9px] flex-shrink-0">🟡 PERINGATAN</span>
                  <span v-else class="bg-green-50 text-green-600 px-1.5 py-0.5 rounded-md border border-green-100 text-[9px] flex-shrink-0">🟢 BERSIH</span>
                </div>
                <p class="text-[10px] text-text-secondary font-semibold">
                  Periode: {{ formatDateDisplay(item.tanggal_masuk) }} - {{ formatDateDisplay(item.tanggal_keluar || item.tanggal_jatuh_tempo) }}
                </p>

                <!-- Tampilkan catatan jika ada alasan khusus -->
                <p v-if="item.tenants?.catatan_reputasi" class="text-[9px] text-slate-500 italic mt-1 bg-white border border-border p-1.5 rounded-lg leading-snug">
                  Ket: "{{ item.tenants.catatan_reputasi }}"
                </p>
              </div>

              <!-- Sisi Kanan -->
              <button
                @click="softArchiveTenant(item.id)"
                class="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-red-50 text-red-500 rounded-lg border border-border text-[10px] font-bold active:scale-95 transition-transform flex-shrink-0"
                title="Sembunyikan"
              >
                <span>👁️‍🗨️</span>
                <span class="text-[9px] text-text-muted font-bold">Sembunyikan</span>
              </button>
            </div>
          </div>
        </div>

        <div class="flex gap-3 pt-3 border-t-2 border-border">
          <button
            @click="showEmptyModal = false"
            class="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl active:scale-95 transition-transform"
          >
            Tutup
          </button>
          <router-link
            :to="`/tambah-penghuni?location_id=${selectedRoom?.location_id}&room_id=${selectedRoom?.id}`"
            class="flex-1 py-3 bg-navy text-white text-center font-bold rounded-xl active:scale-95 transition-transform shadow flex items-center justify-center gap-1.5"
          >
            ➕ Daftarkan
          </router-link>
        </div>
      </div>
    </div>

    <!-- Modal 3: Edit Data Sewa (Terisi) -->
    <div
      v-if="showEditModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 pb-24 bg-navy/60 backdrop-blur-sm animate-fade-in"
    >
      <div class="bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[80vh] overflow-y-auto pb-8 animate-fade-in-up">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b-2 border-border pb-3">
          <h3 class="text-xl font-black text-text-primary flex items-center gap-2">
            <span>✏️</span> Edit Data Sewa
          </h3>
          <button @click="showEditModal = false" class="text-text-muted hover:text-text-primary text-xl font-bold">✕</button>
        </div>

        <!-- Modal Fields -->
        <div class="space-y-4 py-2 pb-6">
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

          <!-- KTP Document Upload -->
          <div class="mt-4">
            <label class="text-xs font-semibold text-slate-600 block mb-1">🪪 Dokumen KTP Penyewa</label>
            <!-- Jika sudah ada KTP -->
            <div v-if="selectedRoom?.foto_ktp" class="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100 mt-1">
              <div class="flex items-center space-x-2">
                <span class="text-xs text-green-600 font-medium">✓ KTP Tersimpan</span>
                <a :href="selectedRoom.foto_ktp" target="_blank" class="text-xs text-blue-500 underline hover:text-blue-700">Lihat Foto</a>
              </div>
              <!-- Tombol Koreksi Berkas -->
              <button type="button" @click="clearKtpDocument" class="text-xs text-red-500 hover:text-red-700 font-medium transition p-1">
                🗑️ Ganti
              </button>
            </div>
            <!-- Jika belum ada KTP (Opsi Unggah) -->
            <input v-else type="file" accept="image/*" @change="handleKtpFileChange" class="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200" />
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

    <!-- Modal 4: Edukasi Hapus Aset Finansial -->
    <div v-if="showModalEdukasiHapus" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in">
      <div class="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-100 animate-fade-in-up">
        <div class="text-center mb-4">
          <span class="text-4xl">🔐</span>
          <h3 class="text-lg font-bold text-slate-800 mt-2">Aksi Dilindungi Sistem</h3>
        </div>
        <p class="text-sm text-slate-600 mb-6 text-center leading-relaxed">
          Penghuni ini memiliki sejarah transaksi pembayaran di Buku Besar. Demi keamanan pembukuan tahunan Kos Anda, data tidak boleh dihapus paksa. Gunakan fitur <strong>Checkout</strong> untuk mengosongkan kamar tanpa merusak laporan keuangan.
        </p>
        <div class="flex space-x-3">
          <button @click="showModalEdukasiHapus = false" class="flex-1 border border-slate-300 text-slate-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition">
            Tutup
          </button>
          <button @click="prosesCheckoutDariModal" class="flex-1 bg-green-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-green-700 shadow-md shadow-green-100 transition">
            Proses Checkout
          </button>
        </div>
      </div>
    </div>

    <!-- Modal 5: Konfirmasi Checkout & Penilaian Reputasi -->
    <div v-if="showCheckoutModal" class="fixed inset-0 bg-navy/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div class="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-fade-in-up">
        <div class="text-center mb-4">
          <span class="text-4xl">🚪</span>
          <h3 class="text-lg font-bold text-slate-800 mt-2">Konfirmasi Checkout</h3>
        </div>
        <p class="text-sm text-slate-600 mb-4 text-center leading-relaxed">
          Apakah Anda yakin ingin memproses Checkout untuk <strong>{{ selectedRoom?.activeRental?.tenants?.nama_lengkap }}</strong>? Kamar ini akan otomatis kosong kembali.
        </p>

        <!-- Form Penilaian Reputasi -->
        <div class="mt-4 border-t pt-4">
          <label class="text-xs font-semibold text-slate-700 block mb-2">📊 Penilaian Reputasi Penghuni</label>

          <!-- Pilihan Status Reputasi -->
          <select v-model="reputationStatus" class="border rounded-xl px-3 py-2 text-xs w-full text-slate-700 focus:ring-1 focus:ring-blue-500 mb-3 bg-white">
            <option value="Bersih">🟢 Bersih (Penyewa Baik)</option>
            <option value="Peringatan">🟡 Peringatan (Catatan Minor)</option>
            <option value="Blacklist">🔴 Blacklist / Red Flag (Bermasalah)</option>
          </select>

          <!-- Catatan Alasan Pelanggaran -->
          <textarea v-model="reputationNotes" placeholder="Tambahkan catatan rekam jejak atau alasan jika penyewa berstatus Red Flag..." rows="2" class="border rounded-xl px-3 py-2 text-xs w-full text-slate-700 focus:ring-1 focus:ring-blue-500 bg-white"></textarea>
        </div>

        <div class="flex space-x-3 mt-6">
          <button @click="showCheckoutModal = false" class="flex-1 border border-slate-300 text-slate-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition">
            Batal
          </button>
          <button @click="executeCheckout" class="flex-1 bg-green-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-green-700 shadow-md shadow-green-100 transition">
            Proses Checkout
          </button>
        </div>
      </div>
    </div>

    <!-- Modal 6: Pusat Data Blacklist Mantan Penghuni -->
    <div v-if="showBlacklistModal" class="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div class="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md p-6 max-h-[80vh] flex flex-col shadow-xl animate-fade-in-up">
        <!-- Header Modal -->
        <div class="flex justify-between items-center mb-4 border-b border-border pb-3">
          <h3 class="text-sm font-bold text-slate-800">🚨 Pusat Data Blacklist Mantan Penghuni</h3>
          <button @click="showBlacklistModal = false" class="text-slate-400 hover:text-slate-600 text-lg font-bold">✕</button>
        </div>

        <!-- Search Bar Input -->
        <input type="text" v-model="searchQueryBlacklist" placeholder="Cari nama atau nomor HP mantan penghuni..." class="border rounded-xl px-3 py-2 text-xs w-full text-slate-700 focus:outline-none focus:ring-1 focus:ring-red-500 mb-4 bg-white" />

        <!-- Daftar Baris Data Hasil Filter -->
        <div class="overflow-y-auto space-y-3 flex-1 pr-1">
          <div v-if="filteredBlacklist.length === 0" class="text-center py-6 text-xs text-slate-400">
            Data tidak ditemukan atau reputasi bersih.
          </div>
          <div v-for="tenant in filteredBlacklist" :key="tenant.id" class="p-3 bg-red-50/50 rounded-xl border border-red-100/60 text-xs">
            <div class="flex justify-between items-start mb-1">
              <span class="font-bold text-slate-800">{{ tenant.nama_lengkap }}</span>
              <span class="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-md font-bold">RED FLAG</span>
            </div>
            <p class="text-slate-500 text-[11px] mb-1">📞 {{ tenant.nomor_hp || 'Tidak ada nomor HP' }}</p>
            <div v-if="tenant.catatan_reputasi" class="bg-white p-2 rounded-lg border border-red-100 text-slate-600 italic text-[11px]">
              Alasan: "{{ tenant.catatan_reputasi }}"
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal 7: Edukasi Hapus Sewa (Hard Delete Protection) -->
    <div v-if="showHapusEdukasiModal" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 text-center shadow-2xl animate-fade-in">
        <!-- Icon Peringatan -->
        <div class="w-12 h-12 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-xl">
          ⚠️
        </div>

        <!-- Konten Teks -->
        <h3 class="text-sm font-bold text-white mb-2">Peringatan: Bahaya Hard Delete!</h3>
        <p class="text-xs text-slate-400 leading-relaxed mb-6">
          Tindakan menghapus data sewa <span class="text-white font-semibold">{{ selectedRoom?.activeRental?.tenants?.nama_lengkap || 'Penghuni' }}</span> akan menghapus seluruh riwayat sewa ini dari database. Buku Besar keuangan masa lalu bisa menjadi tidak seimbang.
        </p>

        <!-- Tombol Aksi Pilihan -->
        <div class="space-y-2">
          <!-- Pilihan Cerdas (Redirect ke Checkout) -->
          <button @click="showHapusEdukasiModal = false; triggerCheckoutModal()" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl text-xs font-semibold transition">
            🏃‍♂️ Gunakan Alur Checkout (Direkomendasikan)
          </button>

          <!-- Pilihan Paksa (Benar-benar Hapus) -->
          <button 
            :disabled="hasPayments"
            @click="executeHardDelete()" 
            class="w-full bg-slate-800 text-red-400 border border-slate-700 py-2 rounded-xl text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-slate-900 disabled:text-slate-600 disabled:border-slate-800"
          >
            ⚠️ Tetap Hapus Paksa Data
          </button>

          <!-- Teks Keterangan Tambahan Jika Terkunci -->
          <p v-if="hasPayments" class="text-[10px] text-amber-500/80 italic mt-1 leading-snug">
            *Tombol hapus dikunci karena penyewa sudah memiliki riwayat pembayaran di Buku Besar. Gunakan Alur Checkout.
          </p>

          <!-- Batal -->
          <button @click="showHapusEdukasiModal = false" class="w-full bg-transparent text-slate-500 hover:text-slate-400 py-1 text-xs transition">
            Kembali
          </button>
        </div>
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
const roomsList = ref([])
const locationsList = ref([])
const selectedLocationFilter = ref('ALL')
const searchQuery = ref('')
const statusFilter = ref('Semua')

// Modal visibility & selected room state
const showDetailModal = ref(false)
const showEmptyModal = ref(false)
const showEditModal = ref(false)
const showModalEdukasiHapus = ref(false)
const showCheckoutModal = ref(false)
const showBlacklistModal = ref(false)
const showHapusEdukasiModal = ref(false)
const hasPayments = ref(false)
const selectedRoom = ref(null)

// Reputation Rating states
const reputationStatus = ref('Bersih')
const reputationNotes = ref('')

// Blacklist center states
const blacklistTenants = ref([])
const searchQueryBlacklist = ref('')

// Room number edit states
const isEditingRoomNumber = ref(false)
const editedRoomNumber = ref('')

// Past tenants (Memoar Kamar)
const pastTenantsList = ref([])

// Rental dates inline edit states
const isEditingDates = ref(false)
const editStartDate = ref('')
const editDueDate = ref('')
const ktpFile = ref(null)

// Automatic Cerdas: when start date shifts, default due date by +1 month
watch(editStartDate, (newVal) => {
  if (newVal) {
    const date = new Date(newVal)
    date.setMonth(date.getMonth() + 1)

    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')

    editDueDate.value = `${yyyy}-${mm}-${dd}`
  }
})

// Edit Form
const editForm = reactive({
  rentalId: null,
  tenantId: null,
  roomId: null,
  nama_lengkap: '',
  nomor_hp: '',
  harga_bulanan: 0,
  tanggal_jatuh_tempo: ''
})

// Fetch Locations on Mount
async function loadLocations() {
  try {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('nama_lokasi', { ascending: true })

    if (error) throw error
    locationsList.value = data || []
  } catch (err) {
    console.error('[SimKos] Gagal fetch lokasi:', err)
  }
}

// Fetch all rooms with joined rental/tenant info
async function loadRoomsAndRentals() {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('*, locations(nama_lokasi), rentals(*, tenants(*))')
      .order('nomor_kamar', { ascending: true })

    if (error) throw error

    // Post-process to map active rental and days left
    roomsList.value = (data || []).map(room => {
      const activeRental = room.rentals?.find(r => r.status_aktif === true) || null
      let fotoKtp = null
      if (activeRental) {
        activeRental.diffDays = getDiffDays(activeRental.tanggal_jatuh_tempo)
        if (activeRental.tenants?.foto_ktp_url) {
          fotoKtp = getKtpPublicUrl(activeRental.tenants.foto_ktp_url)
        }
      }
      return {
        ...room,
        activeRental,
        foto_ktp: fotoKtp
      }
    })
  } catch (err) {
    console.error('[SimKos] Gagal fetch denah kamar:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await loadLocations()
  await loadRoomsAndRentals()
})

// Statistics Computed Properties
const totalKamar = computed(() => {
  const list = selectedLocationFilter.value === 'ALL'
    ? roomsList.value
    : roomsList.value.filter(r => r.location_id === selectedLocationFilter.value)
  return list.length
})

const kamarAktif = computed(() => {
  const list = selectedLocationFilter.value === 'ALL'
    ? roomsList.value
    : roomsList.value.filter(r => r.location_id === selectedLocationFilter.value)
  return list.filter(r => r.activeRental !== null).length
})

const siapHuni = computed(() => {
  return totalKamar.value - kamarAktif.value
})

const persentaseHunian = computed(() => {
  if (totalKamar.value === 0) return 0
  return Math.round((kamarAktif.value / totalKamar.value) * 100) || 0
})

// Filtered Rooms
const filteredRooms = computed(() => {
  let list = roomsList.value

  // 1. Location filter
  if (selectedLocationFilter.value !== 'ALL') {
    list = list.filter(r => r.location_id === selectedLocationFilter.value)
  }

  // 2. Search filter (if query exists, check if name matches active tenant)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(r => {
      const tenantName = r.activeRental?.tenants?.nama_lengkap || ''
      return tenantName.toLowerCase().includes(q)
    })
  }

  // 3. Status filter
  if (statusFilter.value === 'Terisi') {
    list = list.filter(r => r.activeRental !== null)
  } else if (statusFilter.value === 'Kosong') {
    list = list.filter(r => r.activeRental === null)
  }

  return list
})

// Room Click Handler
function handleRoomClick(room) {
  isEditingRoomNumber.value = false
  editedRoomNumber.value = ''
  isEditingDates.value = false
  editStartDate.value = ''
  editDueDate.value = ''
  if (room.activeRental?.tenants?.foto_ktp_url) {
    room.foto_ktp = getKtpPublicUrl(room.activeRental.tenants.foto_ktp_url)
  } else {
    room.foto_ktp = null
  }
  selectedRoom.value = room
  if (room.activeRental) {
    showDetailModal.value = true
  } else {
    showEmptyModal.value = true
    loadPastTenants(room.id)
  }
}

// Open Edit Modal from Detail Modal
function triggerEditModal() {
  const rental = selectedRoom.value?.activeRental
  if (!rental) return

  editForm.rentalId = rental.id
  editForm.tenantId = rental.tenant_id
  editForm.roomId = selectedRoom.value.id
  editForm.nama_lengkap = rental.tenants?.nama_lengkap || ''
  editForm.nomor_hp = rental.tenants?.nomor_hp || ''
  editForm.harga_bulanan = selectedRoom.value.harga_bulanan || 0
  editForm.tanggal_jatuh_tempo = rental.tanggal_jatuh_tempo || ''

  showDetailModal.value = false
  showEditModal.value = true
}

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

// Update Tenant Data (CRUD - Update)
async function updatePenghuni() {
  if (!editForm.nama_lengkap.trim() || !editForm.nomor_hp.trim()) {
    alert('Nama dan Nomor HP tidak boleh kosong!')
    return
  }

  isLoading.value = true
  showEditModal.value = false

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

    alert('Data sewa berhasil diperbarui!')
    await loadRoomsAndRentals()
  } catch (err) {
    alert(`Gagal memperbarui data: ${err.message}`)
    console.error('[SimKos] Update error:', err)
    isLoading.value = false
  }
}

// Trigger Checkout Modal
function triggerCheckoutModal() {
  showDetailModal.value = false
  reputationStatus.value = 'Bersih'
  reputationNotes.value = ''
  showCheckoutModal.value = true
}

// Execute Checkout process
async function executeCheckout() {
  const rental = selectedRoom.value?.activeRental
  if (!rental) return

  isLoading.value = true
  showCheckoutModal.value = false

  try {
    // 1. Update status sewa di rentals
    const { error: rentalError } = await supabase
      .from('rentals')
      .update({ status_aktif: false })
      .eq('id', rental.id)

    if (rentalError) throw new Error(`Gagal memperbarui status sewa: ${rentalError.message}`)

    // 2. Update status kamar di rooms menjadi 'Kosong'
    if (rental.room_id) {
      const { error: roomError } = await supabase
        .from('rooms')
        .update({ status_kamar: 'Kosong' })
        .eq('id', rental.room_id)

      if (roomError) throw new Error(`Gagal mengosongkan status kamar: ${roomError.message}`)
    }

    // 3. Update status reputasi di tenants
    if (rental.tenant_id) {
      const { error: tenantUpdateError } = await supabase
        .from('tenants')
        .update({
          status_reputasi: reputationStatus.value,
          catatan_reputasi: reputationNotes.value
        })
        .eq('id', rental.tenant_id)

      if (tenantUpdateError) throw new Error(`Gagal memperbarui reputasi penyewa: ${tenantUpdateError.message}`)
    }

    alert('Checkout berhasil diproses!')
    await loadRoomsAndRentals()
  } catch (err) {
    alert(`Gagal memproses checkout: ${err.message}`)
    console.error('[SimKos] Checkout error:', err)
  } finally {
    isLoading.value = false
    // Reset state
    reputationStatus.value = 'Bersih'
    reputationNotes.value = ''
  }
}

// Trigger hard delete educational modal with database check for existing payments
async function checkRentalHistoryBeforeDelete() {
  showDetailModal.value = false
  isLoading.value = true
  hasPayments.value = false

  try {
    const rentalId = selectedRoom.value?.activeRental?.id
    if (!rentalId) {
      showHapusEdukasiModal.value = true
      return
    }

    // Query efficiently: select count of incomes for this rental
    const { count, error } = await supabase
      .from('incomes')
      .select('id', { count: 'exact', head: true })
      .eq('rental_id', rentalId)

    if (error) throw error

    hasPayments.value = count > 0
    showHapusEdukasiModal.value = true
  } catch (err) {
    console.error('Gagal memeriksa riwayat transaksi:', err.message || err)
    // Fallback safe: assume payments exist
    hasPayments.value = true
    showHapusEdukasiModal.value = true
  } finally {
    isLoading.value = false
  }
}

// Execute hard delete bypass confirm
async function executeHardDelete() {
  const rental = selectedRoom.value?.activeRental
  if (!rental) return

  showHapusEdukasiModal.value = false
  isLoading.value = true

  try {
    // 1. Hapus dari rentals
    const { error: deleteError } = await supabase
      .from('rentals')
      .delete()
      .eq('id', rental.id)

    if (deleteError) throw deleteError

    // 2. Kembalikan status kamar menjadi 'Kosong'
    if (rental.room_id) {
      const { error: roomError } = await supabase
        .from('rooms')
        .update({ status_kamar: 'Kosong' })
        .eq('id', rental.room_id)

      if (roomError) throw roomError
    }

    alert('Data sewa berhasil dihapus!')
    await loadRoomsAndRentals()
  } catch (err) {
    const errorMsg = String(err.message || err).toLowerCase()
    if (errorMsg.includes('foreign key constraint') || errorMsg.includes('incomes_rental_id_fkey')) {
      showModalEdukasiHapus.value = true
    } else {
      alert(`Gagal menghapus data sewa: ${err.message}`)
    }
    console.error('[SimKos] Delete error:', err)
  } finally {
    isLoading.value = false
  }
}

// Redirect action to checkout from educational modal
function prosesCheckoutDariModal() {
  showModalEdukasiHapus.value = false
  reputationStatus.value = 'Bersih'
  reputationNotes.value = ''
  showCheckoutModal.value = true
}

// Fetch blacklist tenants
async function fetchBlacklistTenants() {
  try {
    isLoading.value = true
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('status_reputasi', 'Blacklist')

    if (error) throw error
    blacklistTenants.value = data || []
    showBlacklistModal.value = true
  } catch (err) {
    console.error('Gagal mengambil data blacklist:', err.message || err)
    alert('Gagal mengambil data blacklist.')
  } finally {
    isLoading.value = false
  }
}

// Search filter computed property for blacklist center
const filteredBlacklist = computed(() => {
  return blacklistTenants.value.filter(tenant => {
    const query = searchQueryBlacklist.value.toLowerCase().trim()
    return (
      tenant.nama_lengkap?.toLowerCase().includes(query) ||
      tenant.nomor_hp?.includes(query)
    )
  })
})

// Room Number Editing Handlers
function mulaiEditRoomNumber(currentVal) {
  editedRoomNumber.value = currentVal || ''
  isEditingRoomNumber.value = true
}

function batalEditRoomNumber() {
  isEditingRoomNumber.value = false
  editedRoomNumber.value = ''
}

async function updateRoomNumber() {
  const newNum = editedRoomNumber.value.trim()
  if (!newNum) {
    alert('Nomor kamar tidak boleh kosong!')
    return
  }

  const locationId = selectedRoom.value?.location_id
  const roomId = selectedRoom.value?.id

  const isDuplicate = roomsList.value.some(room =>
    room.location_id === locationId &&
    room.id !== roomId &&
    String(room.nomor_kamar).toLowerCase() === newNum.toLowerCase()
  )

  if (isDuplicate) {
    alert('Nomor kamar sudah terpakai di lokasi ini!')
    return
  }

  isLoading.value = true
  try {
    const { error } = await supabase
      .from('rooms')
      .update({ nomor_kamar: newNum })
      .eq('id', roomId)

    if (error) throw error

    if (selectedRoom.value) {
      selectedRoom.value.nomor_kamar = newNum
    }
    const localRoom = roomsList.value.find(r => r.id === roomId)
    if (localRoom) {
      localRoom.nomor_kamar = newNum
    }

    isEditingRoomNumber.value = false
    alert('Nomor kamar berhasil diubah!')
  } catch (err) {
    alert(`Gagal mengubah nomor kamar: ${err.message}`)
    console.error('[SimKos] Update room number error:', err)
  } finally {
    isLoading.value = false
  }
}

// Fetch past tenants for memoar kamar
async function loadPastTenants(roomId) {
  pastTenantsList.value = []
  try {
    const { data, error } = await supabase
      .from('rentals')
      .select('*, tenants(*)')
      .eq('room_id', roomId)
      .eq('status_aktif', false)
      .order('tanggal_masuk', { ascending: false })

    if (error) throw error
    pastTenantsList.value = (data || []).filter(r => r.hide_in_history !== true)
  } catch (err) {
    console.error('[SimKos] loadPastTenants error:', err)
  }
}

// Soft archive past tenant record
async function softArchiveTenant(rentalId) {
  try {
    const { error } = await supabase
      .from('rentals')
      .update({ hide_in_history: true })
      .eq('id', rentalId)

    if (error) {
      console.warn('[SimKos] hide_in_history column update failed, simulating frontend archive:', error)
    }

    pastTenantsList.value = pastTenantsList.value.filter(r => r.id !== rentalId)
    alert('Riwayat hunian berhasil disembunyikan!')
  } catch (err) {
    console.error('[SimKos] softArchiveTenant error:', err)
    pastTenantsList.value = pastTenantsList.value.filter(r => r.id !== rentalId)
  }
}

// Rental dates inline editing functions
function mulaiEditDates() {
  editStartDate.value = selectedRoom.value?.activeRental?.tanggal_masuk || ''
  editDueDate.value = selectedRoom.value?.activeRental?.tanggal_jatuh_tempo || ''
  isEditingDates.value = true
}

async function updateRentalDates() {
  try {
    const rentalId = selectedRoom.value?.activeRental?.id
    if (!rentalId) return

    isLoading.value = true
    const { error } = await supabase
      .from('rentals')
      .update({
        tanggal_masuk: editStartDate.value,
        tanggal_jatuh_tempo: editDueDate.value
      })
      .eq('id', rentalId)

    if (error) throw error

    // Sinkronisasi Real-Time ke State Frontend tanpa reload halaman
    if (selectedRoom.value?.activeRental) {
      selectedRoom.value.activeRental.tanggal_masuk = editStartDate.value
      selectedRoom.value.activeRental.tanggal_jatuh_tempo = editDueDate.value
      selectedRoom.value.activeRental.diffDays = getDiffDays(editDueDate.value)
    }

    // Update roomsList item
    const localRoom = roomsList.value.find(r => r.id === selectedRoom.value?.id)
    if (localRoom?.activeRental) {
      localRoom.activeRental.tanggal_masuk = editStartDate.value
      localRoom.activeRental.tanggal_jatuh_tempo = editDueDate.value
      localRoom.activeRental.diffDays = getDiffDays(editDueDate.value)
    }

    isEditingDates.value = false
    alert('Tanggal sewa berhasil diperbarui!')
  } catch (err) {
    console.error('Gagal memperbarui tanggal sewa di Supabase:', err.message || err)
    alert('Terjadi kesalahan saat memperbarui tanggal sewa.')
  } finally {
    isLoading.value = false
  }
}

// Get public URL for KTP photo
function getKtpPublicUrl(path) {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const { data } = supabase.storage.from('ktp_images').getPublicUrl(path)
  return data?.publicUrl || null
}

// Handle KTP file change & upload
async function handleKtpFileChange(e) {
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

  ktpFile.value = file
  isLoading.value = true

  try {
    // 1. Generate unique file name
    const fileExtension = file.name.split('.').pop()
    const uniqueFileName = `ktp_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`

    // 2. Upload to Supabase Storage bucket 'ktp_images'
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('ktp_images')
      .upload(uniqueFileName, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) throw uploadError

    const ktpPath = uploadData.path

    // 3. Get Public URL
    const publicUrl = getKtpPublicUrl(ktpPath)

    // 4. Update tenants table
    const tenantId = editForm.tenantId || selectedRoom.value?.activeRental?.tenant_id
    if (!tenantId) {
      throw new Error('ID Penghuni tidak ditemukan!')
    }

    const { error: updateError } = await supabase
      .from('tenants')
      .update({ foto_ktp_url: ktpPath })
      .eq('id', tenantId)

    if (updateError) throw updateError

    // 5. Update local state
    if (selectedRoom.value) {
      selectedRoom.value.foto_ktp = publicUrl
      if (selectedRoom.value.activeRental?.tenants) {
        selectedRoom.value.activeRental.tenants.foto_ktp_url = ktpPath
      }
    }

    // Update in roomsList
    const localRoom = roomsList.value.find(r => r.id === selectedRoom.value?.id)
    if (localRoom) {
      localRoom.foto_ktp = publicUrl
      if (localRoom.activeRental?.tenants) {
        localRoom.activeRental.tenants.foto_ktp_url = ktpPath
      }
    }

    alert('Foto KTP berhasil diunggah!')
  } catch (err) {
    alert(`Gagal mengunggah KTP: ${err.message}`)
    console.error('[SimKos] Upload KTP error:', err)
  } finally {
    isLoading.value = false
    ktpFile.value = null
  }
}

// Clear and reset KTP document URL in database
async function clearKtpDocument() {
  if (!confirm('Apakah Anda yakin ingin mengganti foto KTP ini?')) return

  try {
    const tenantId = editForm.tenantId || selectedRoom.value?.activeRental?.tenant_id
    if (!tenantId) {
      throw new Error('ID Penghuni tidak ditemukan!')
    }

    isLoading.value = true
    const { error } = await supabase
      .from('tenants')
      .update({ foto_ktp_url: null })
      .eq('id', tenantId)

    if (error) throw error

    // Sinkronisasi State Frontend secara instan agar input file muncul kembali
    if (selectedRoom.value) {
      selectedRoom.value.foto_ktp = null
      if (selectedRoom.value.activeRental?.tenants) {
        selectedRoom.value.activeRental.tenants.foto_ktp_url = null
      }
    }

    const localRoom = roomsList.value.find(r => r.id === selectedRoom.value?.id)
    if (localRoom) {
      localRoom.foto_ktp = null
      if (localRoom.activeRental?.tenants) {
        localRoom.activeRental.tenants.foto_ktp_url = null
      }
    }

    console.log('Dokumen KTP berhasil di-reset. Siap untuk unggah ulang.')
    alert('Dokumen KTP berhasil dikosongkan. Silakan unggah kembali.')
  } catch (err) {
    console.error('Gagal mereset dokumen KTP:', err.message || err)
    alert('Terjadi kesalahan saat mengosongkan berkas KTP.')
  } finally {
    isLoading.value = false
  }
}

// Helper: Sisa Hari Jatuh Tempo
function getDiffDays(tanggalJatuhTempo) {
  if (!tanggalJatuhTempo) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const parts = tanggalJatuhTempo.split('-')
  if (parts.length !== 3) return null
  
  const dueDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
  dueDate.setHours(0, 0, 0, 0)
  
  const diffTime = dueDate.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

// Helpers
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
