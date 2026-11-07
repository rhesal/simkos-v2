<template>
  <div class="min-h-screen bg-bg-primary pb-24">
    <!-- ========== HEADER DENGAN PEMILIH LOKASI ========== -->
    <header class="relative z-20 bg-navy text-white px-6 pt-5 pb-6 shadow-lg rounded-b-[1.5rem] space-y-5 animate-fade-in-up">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-extrabold tracking-tight">SimKos</h1>
          <p class="text-base text-blue-200 mt-1 font-medium">Dashboard Eksekutif</p>
        </div>
        <div class="relative z-50">
          <button
            @click="isSettingsOpen = !isSettingsOpen"
            class="w-13 h-13 rounded-full bg-white/15 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Pengaturan"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          <!-- Settings Backdrop -->
          <div
            v-if="isSettingsOpen"
            class="fixed inset-0 z-40"
            @click="isSettingsOpen = false"
          />

          <!-- Settings Dropdown Menu -->
          <div
            v-if="isSettingsOpen"
            class="absolute right-0 mt-3 w-64 bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl overflow-hidden z-50"
          >
            <button
              v-if="currentLocationObject"
              @click="openEditLocationModal(currentLocationObject)"
              class="w-full px-5 py-4 text-left text-lg font-bold text-text-primary hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 border-b border-border"
            >
              <span class="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              </span>
              Ubah Nama Kos
            </button>
            <router-link
              to="/tambah-lokasi"
              @click="isSettingsOpen = false"
              class="w-full px-5 py-4 text-left text-lg font-bold text-text-primary hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 border-b border-border"
            >
              <span class="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </span>
              Tambah Lokasi
            </router-link>
            <router-link
              to="/tambah-kamar"
              @click="isSettingsOpen = false"
              class="w-full px-5 py-4 text-left text-lg font-bold text-text-primary hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 border-b border-border"
            >
              <span class="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </span>
              Tambah Kamar
            </router-link>
            <router-link
              to="/tambah-penghuni"
              @click="isSettingsOpen = false"
              class="w-full px-5 py-4 text-left text-lg font-bold text-text-primary hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 border-b border-border"
            >
              <span class="w-10 h-10 rounded-xl bg-income/10 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-income" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                </svg>
              </span>
              Daftar Penghuni Baru
            </router-link>
            <router-link
              to="/migrasi-data"
              @click="isSettingsOpen = false"
              class="w-full px-5 py-4 text-left text-lg font-bold text-text-primary hover:bg-gray-50 active:bg-gray-100 flex items-center gap-3 border-b border-border"
            >
              <span class="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </span>
              Migrasi Data Cerdas
            </router-link>
            <button
              @click="handleLogout"
              class="w-full px-5 py-4 text-left text-lg font-bold text-expense hover:bg-red-50 active:bg-red-100 flex items-center gap-3"
            >
              <span class="w-10 h-10 rounded-xl bg-expense/10 flex items-center justify-center flex-shrink-0">
                <svg class="w-5 h-5 text-expense" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </span>
              Keluar (Logout)
            </button>
          </div>
        </div>
      </div>

      <!-- Combo-box Pemilih Lokasi (Dinamis dari Supabase) -->
      <div class="relative">
        <!-- Loading state lokasi -->
        <div
          v-if="isLoadingLocations"
          class="w-full bg-white/10 border-2 border-white/20 rounded-[var(--radius-btn)]
                 px-5 py-4 flex items-center gap-3 text-lg font-bold text-white/60"
        >
          <svg class="w-6 h-6 animate-spin text-white/50" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Memuat lokasi...</span>
        </div>

        <!-- Empty state lokasi -->
        <router-link
          v-else-if="locations.length === 0"
          to="/tambah-lokasi"
          class="w-full bg-white/10 hover:bg-white/15 border-2 border-dashed border-white/30 rounded-[var(--radius-btn)]
                 px-5 py-4 flex items-center justify-center gap-3 text-lg font-bold text-white
                 transition-all duration-200"
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span>Tambah Lokasi Pertama</span>
        </router-link>

        <!-- Dropdown pemilih lokasi -->
        <template v-else>
          <div class="flex items-center gap-2">
            <button
              @click="isDropdownOpen = !isDropdownOpen"
              class="flex-1 bg-white/10 hover:bg-white/15 active:bg-white/20 border-2 border-white/20 rounded-[var(--radius-btn)]
                     px-5 py-4 flex items-center justify-between text-lg font-bold text-white
                     transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-white/25 min-w-0"
            >
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-2xl flex-shrink-0">{{ selectedLocation === 'ALL' ? '🏢' : '🏠' }}</span>
                <span class="truncate">{{ selectedLocationName }}</span>
              </div>
              <svg
                class="w-6 h-6 text-white/80 transition-transform duration-200 flex-shrink-0 ml-2"
                :class="{ 'rotate-180': isDropdownOpen }"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="3"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            <!-- Tombol Cepat Ubah Nama Kos -->
            <button
              v-if="currentLocationObject"
              @click="openEditLocationModal(currentLocationObject)"
              class="w-14 h-14 bg-white/10 hover:bg-white/20 active:scale-95 border-2 border-white/20 rounded-[var(--radius-btn)]
                     flex items-center justify-center text-white transition-all flex-shrink-0"
              title="Ubah Nama Kos"
              aria-label="Ubah Nama Kos"
            >
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </button>
          </div>

          <!-- Dropdown Backdrop -->
          <div
            v-if="isDropdownOpen"
            class="fixed inset-0 z-40"
            @click="isDropdownOpen = false"
          />

          <!-- Dropdown Menu Items -->
          <div
            v-if="isDropdownOpen"
            class="absolute z-50 left-0 right-0 mt-2 bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl overflow-hidden"
          >
            <!-- Opsi Semua Lokasi -->
            <div
              class="flex items-center justify-between border-b border-border hover:bg-gray-50 transition-colors"
              :class="{ 'bg-navy/5': selectedLocation === 'ALL' }"
            >
              <button
                @click="selectLocation('ALL')"
                class="flex-1 px-5 py-4 text-left text-lg font-bold text-text-primary flex items-center gap-3 min-w-0"
              >
                <span class="text-2xl flex-shrink-0">🏢</span>
                <span class="truncate">Semua Lokasi</span>
                <span class="text-xs bg-navy/10 text-navy font-extrabold px-2.5 py-0.5 rounded-full ml-1">
                  {{ locations.length }} Kos
                </span>
                <svg v-if="selectedLocation === 'ALL'" class="w-5 h-5 text-navy ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </button>
            </div>

            <!-- Daftar Masing-Masing Lokasi Kos -->
            <div
              v-for="loc in locations"
              :key="loc.id"
              class="flex items-center justify-between border-b border-border last:border-0 hover:bg-gray-50 transition-colors"
              :class="{ 'bg-navy/5': loc.id === selectedLocation }"
            >
              <button
                @click="selectLocation(loc.id)"
                class="flex-1 px-5 py-4 text-left text-lg font-bold text-text-primary flex items-center gap-3 min-w-0"
              >
                <span class="text-2xl flex-shrink-0">🏠</span>
                <span class="truncate">{{ loc.nama_lokasi }}</span>
                <svg v-if="loc.id === selectedLocation" class="w-5 h-5 text-navy ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </button>
              <button
                @click.stop="openEditLocationModal(loc)"
                class="p-4 text-text-muted hover:text-navy active:scale-95 transition-transform flex-shrink-0"
                title="Ubah nama kos ini"
                aria-label="Ubah nama kos ini"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              </button>
            </div>
          </div>
        </template>
      </div>
    </header>

    <!-- ========== BODY LAYOUT WITH INCREASED PADDING & SPACING ========== -->
    <div class="px-6 py-6 space-y-6 max-w-lg mx-auto">
      
      <!-- Global Loading State -->
      <div v-if="isLoadingData" class="flex flex-col items-center justify-center py-20 gap-3">
        <svg class="w-10 h-10 animate-spin text-navy" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span class="text-base font-semibold text-text-secondary">Menyusun ringkasan eksekutif...</span>
      </div>

      <template v-else>
        <!-- ========== KARTU KEUANGAN BULANAN ========== -->
        <div class="animate-fade-in-up animate-stagger-1">
          <div class="bg-navy rounded-[var(--radius-card)] p-6 text-white shadow-xl relative overflow-hidden">
            <!-- Decorative Background Elements -->
            <div class="absolute -right-8 -top-8 w-36 h-36 bg-white/5 rounded-full"></div>
            <div class="absolute -right-4 top-14 w-24 h-24 bg-white/5 rounded-full"></div>

            <div class="relative z-10 space-y-5">
              <div class="flex items-center gap-2.5">
                <svg class="w-6 h-6 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
                <p class="text-base font-semibold text-blue-200">Keuangan Bulan Ini · {{ currentMonth }}</p>
              </div>

              <!-- Saldo Bersih (Laba/Rugi) -->
              <div>
                <p class="text-sm font-bold text-blue-300">Laba / Rugi Bersih</p>
                <p class="text-4xl font-extrabold tracking-tight mt-1">
                  {{ formatCurrency(saldoBersih) }}
                </p>
              </div>

              <div class="flex flex-col gap-3 pt-5 border-t border-white/15">
                <!-- Income Row -->
                <div class="flex items-center justify-between w-full">
                  <div class="flex items-center gap-3">
                    <span class="w-10 h-10 rounded-xl bg-income/20 flex items-center justify-center flex-shrink-0">
                      <svg class="w-6 h-6 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                      </svg>
                    </span>
                    <span class="text-base font-bold text-blue-200">Pemasukan</span>
                  </div>
                  <span class="text-xl font-extrabold text-green-300">{{ formatCurrency(totalPemasukan) }}</span>
                </div>

                <!-- Expense Row -->
                <div class="flex items-center justify-between w-full">
                  <div class="flex items-center gap-3">
                    <span class="w-10 h-10 rounded-xl bg-expense/20 flex items-center justify-center flex-shrink-0">
                      <svg class="w-6 h-6 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                      </svg>
                    </span>
                    <span class="text-base font-bold text-blue-200">Pengeluaran</span>
                  </div>
                  <span class="text-xl font-extrabold text-red-300">{{ formatCurrency(totalPengeluaran) }}</span>
                </div>
                <p v-if="totalTagihanBersama > 0" class="text-xs font-semibold text-blue-200/90">
                  <template v-if="selectedLocation === 'ALL'">
                    🌐 Termasuk tagihan bersama {{ formatCurrency(totalTagihanBersama) }}
                  </template>
                  <template v-else>
                    🌐 Tagihan bersama {{ formatCurrency(totalTagihanBersama) }} tidak termasuk total kos ini
                  </template>
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- ========== KARTU OKUPANSI KAMAR ========== -->
        <div class="animate-fade-in-up animate-stagger-2 bg-white border-2 border-border rounded-[var(--radius-card)] p-6 shadow-sm">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-black text-text-primary tracking-tight">Status Okupansi</h2>
            <span class="text-sm font-extrabold px-3 py-1 bg-navy/5 text-navy rounded-full border border-navy/10">
              {{ occupiedRoomsCount }}/{{ totalRoomsCount }} Kamar
            </span>
          </div>

          <!-- Progress Bar -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-sm font-bold">
              <span class="text-text-secondary">Rasio Okupansi</span>
              <span class="text-navy">{{ Math.round(occupancyRate) }}%</span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-4 overflow-hidden border border-border">
              <div
                class="bg-navy h-full transition-all duration-500 rounded-full"
                :style="{ width: occupancyRate + '%' }"
              ></div>
            </div>
            <p class="text-xs font-semibold text-text-muted pt-1">
              Rasio kamar berpenghuni aktif terhadap kapasitas seluruh kamar di lokasi ini.
            </p>
          </div>
        </div>



        <!-- ========== RADAR JATUH TEMPO ========== -->
        <div class="space-y-4 animate-fade-in-up animate-stagger-4">
          <div class="flex items-end justify-between border-b-2 border-border pb-2">
            <h2 class="text-2xl font-black text-text-primary tracking-tight">Radar Jatuh Tempo</h2>
            <span
              v-if="radarList.length > 0"
              class="text-sm font-bold bg-red-100 text-red-700 px-3 py-1 rounded-full border border-red-200"
            >
              {{ radarList.length }} Peringatan
            </span>
          </div>

          <!-- Empty State Peringatan -->
          <div
            v-if="radarList.length === 0"
            class="bg-green-50 border border-green-200 rounded-[var(--radius-card)] p-6 text-center shadow-sm"
          >
            <div class="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p class="text-base font-extrabold text-green-800">Semua Aman!</p>
            <p class="text-xs font-semibold text-green-600 mt-1">
              Tidak ada penyewaan aktif yang jatuh tempo dalam 5 hari ke depan maupun menunggak.
            </p>
          </div>

          <!-- Peringatan List -->
          <div v-else class="space-y-3">
            <div
              v-for="item in paginatedRadarList"
              :key="item.id"
              @click="openPaymentModal(item.rental)"
              class="bg-white rounded-[var(--radius-card)] border-2 border-border p-4 flex items-center justify-between shadow-sm relative overflow-hidden cursor-pointer hover:border-navy hover:shadow-md transition-all active:scale-[0.99]"
              :class="item.diffDays < 0 ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-amber-500'"
              title="Klik untuk verifikasi pembayaran sewa"
            >
              <!-- Info Penyewa -->
              <div class="space-y-1">
                <p class="text-base font-extrabold text-text-primary">
                  {{ item.nama }}
                </p>
                <p class="text-xs font-semibold text-text-secondary">
                  🏠 {{ item.kamar }}
                </p>
                <p class="text-[10px] font-bold text-text-muted bg-gray-100 px-2 py-0.5 rounded inline-block">
                  Jatuh Tempo: {{ formatDateDisplay(item.jatuhTempo) }}
                </p>
              </div>

              <!-- Sisa Hari Indicator & Tombol Cepat Bayar -->
              <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span
                  class="px-2.5 py-1 rounded-xl text-xs font-black inline-block border shadow-sm"
                  :class="item.diffDays < 0
                    ? 'bg-red-100 text-red-700 border-red-200 animate-pulse'
                    : item.diffDays === 0
                      ? 'bg-red-50 text-red-600 border-red-100 font-bold'
                      : 'bg-amber-100 text-amber-800 border-amber-200'"
                >
                  <template v-if="item.diffDays < 0">
                    🔴 Lewat {{ Math.abs(item.diffDays) }} Hari
                  </template>
                  <template v-else-if="item.diffDays === 0">
                    ⚠️ Hari Ini
                  </template>
                  <template v-else>
                    ⏳ H-{{ item.diffDays }}
                  </template>
                </span>
                <span class="text-[11px] font-extrabold text-income bg-income/10 border border-income/20 px-2.5 py-0.5 rounded-lg flex items-center gap-1 hover:bg-income/20 transition-colors">
                  <span>Bayar</span>
                  <span>➔</span>
                </span>
              </div>
            </div>

            <!-- Pagination Radar Jatuh Tempo -->
            <BasePagination
              v-model="currentRadarPage"
              :total-items="radarList.length"
              :page-size="radarPageSize"
              item-label="peringatan"
            />
          </div>
        </div>
      </template>

      <!-- Bottom Spacer for layout breathing room -->
      <div class="h-8"></div>
    </div>

    <!-- Modal Ubah Nama Kos -->
    <BaseModal v-if="showEditLocationModal" class="bg-navy/60 backdrop-blur-sm animate-fade-in">
      <div
        class="bg-white rounded-[var(--radius-card)] w-full max-w-md p-6 shadow-2xl border border-border animate-fade-in-up"
        @click.stop
      >
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-border">
          <div class="flex items-center gap-3">
            <span class="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center text-xl flex-shrink-0">
              🏠
            </span>
            <div>
              <h3 class="text-xl font-extrabold text-text-primary">Ubah Nama Kos</h3>
              <p class="text-xs text-text-secondary mt-0.5 font-medium">Perbarui identitas properti kos Anda</p>
            </div>
          </div>
          <button
            type="button"
            @click="showEditLocationModal = false"
            class="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-text-muted hover:text-text-primary flex items-center justify-center font-bold text-lg transition-colors"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <!-- Error Feedback -->
        <div
          v-if="editLocationError"
          class="bg-expense-light border border-expense/30 text-expense rounded-xl p-3 mb-4 text-xs font-bold flex items-center gap-2"
        >
          <span>⚠️</span>
          <span>{{ editLocationError }}</span>
        </div>

        <form @submit.prevent="handleUpdateLocation" class="space-y-4">
          <!-- Nama Kos -->
          <div class="space-y-1.5">
            <label for="modal-edit-nama-kos" class="block text-sm font-bold text-text-primary">
              Nama Kos / Lokasi <span class="text-expense">*</span>
            </label>
            <input
              id="modal-edit-nama-kos"
              v-model="editLocationForm.nama_lokasi"
              type="text"
              placeholder="Contoh: Kos Melati"
              required
              class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-4 py-3 text-base font-semibold text-text-primary placeholder-text-muted
                     focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none transition-all"
            />
          </div>

          <!-- Alamat Kos -->
          <div class="space-y-1.5">
            <label for="modal-edit-alamat-kos" class="block text-sm font-bold text-text-primary">
              Alamat
            </label>
            <textarea
              id="modal-edit-alamat-kos"
              v-model="editLocationForm.alamat"
              rows="3"
              placeholder="Contoh: Jl. Mawar No. 10, Bandung"
              class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-4 py-3 text-base font-semibold text-text-primary placeholder-text-muted
                     focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none transition-all resize-none"
            />
          </div>

          <!-- Tombol Aksi -->
          <div class="flex gap-3 pt-2">
            <button
              type="button"
              @click="showEditLocationModal = false"
              class="flex-1 py-3 px-4 border-2 border-border text-text-secondary hover:bg-gray-50 active:bg-gray-100 font-bold rounded-[var(--radius-btn)] text-base transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="isUpdatingLocation || !editLocationForm.nama_lokasi.trim()"
              class="flex-1 py-3 px-4 bg-navy hover:brightness-110 active:scale-95 text-white font-extrabold rounded-[var(--radius-btn)] text-base shadow-md shadow-navy/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              <svg v-if="isUpdatingLocation" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>{{ isUpdatingLocation ? 'Menyimpan...' : 'Simpan' }}</span>
            </button>
          </div>
        </form>
      </div>
    </BaseModal>

    <!-- Modal Verifikasi Pembayaran Sewa (Dari Radar) -->
    <BaseModal v-if="showPaymentModal" class="bg-navy/60 backdrop-blur-sm animate-fade-in" @click="showPaymentModal = false">
      <div
        class="bg-white rounded-[var(--radius-card)] w-full max-w-md p-6 shadow-2xl border border-border animate-fade-in-up"
        @click.stop
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-border">
          <div class="flex items-center gap-3">
            <span class="w-10 h-10 rounded-xl bg-income/10 text-income flex items-center justify-center text-xl flex-shrink-0">
              💰
            </span>
            <div>
              <h3 class="text-xl font-extrabold text-text-primary">Verifikasi Pembayaran</h3>
              <p class="text-xs text-text-secondary mt-0.5 font-medium">Catat pelunasan sewa secara langsung</p>
            </div>
          </div>
          <button
            type="button"
            @click="showPaymentModal = false"
            class="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-text-muted hover:text-text-primary flex items-center justify-center font-bold text-lg transition-colors"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <!-- Detail Penghuni Card -->
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-text-muted">Kamar & Lokasi</span>
            <span class="text-xs font-black text-navy bg-navy/10 px-2 py-0.5 rounded-md">
              Kamar {{ selectedRental?.rooms?.nomor_kamar }} · {{ selectedRental?.rooms?.locations?.nama_lokasi || selectedLocationName }}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-text-muted">Nama Penghuni</span>
            <span class="text-sm font-extrabold text-text-primary">
              {{ selectedRental?.tenants?.nama_lengkap }}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-text-muted">Jatuh Tempo Saat Ini</span>
            <span class="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
              {{ formatDateDisplay(selectedRental?.tanggal_jatuh_tempo) }}
            </span>
          </div>
        </div>

        <!-- Error Feedback -->
        <div
          v-if="paymentError"
          class="bg-expense-light border border-expense/30 text-expense rounded-xl p-3 mb-4 text-xs font-bold flex items-center gap-2"
        >
          <span>⚠️</span>
          <span>{{ paymentError }}</span>
        </div>

        <!-- Form Body -->
        <form @submit.prevent="handleConfirmPayment" class="space-y-4">
          <!-- Nominal Bayar -->
          <div class="space-y-1.5">
            <label for="radar-nominal-bayar" class="block text-sm font-bold text-text-primary">
              Nominal Diterima (Rp) <span class="text-expense">*</span>
            </label>
            <input
              id="radar-nominal-bayar"
              v-model.number="paymentForm.nominal"
              type="number"
              inputmode="numeric"
              min="1"
              step="any"
              required
              class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-4 py-3 text-lg font-black text-income focus:border-income focus:ring-4 focus:ring-income/10 focus:outline-none transition-all"
            />
          </div>

          <!-- Tanggal Bayar -->
          <div class="space-y-1.5">
            <label for="radar-tanggal-bayar" class="block text-sm font-bold text-text-primary">
              Tanggal Bayar <span class="text-expense">*</span>
            </label>
            <input
              id="radar-tanggal-bayar"
              v-model="paymentForm.tanggal_bayar"
              type="date"
              required
              class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-4 py-3 text-base font-semibold text-text-primary focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none transition-all"
            />
          </div>

          <!-- Metode Bayar -->
          <div class="space-y-1.5">
            <label class="block text-sm font-bold text-text-primary">
              Metode Pembayaran
            </label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                @click="paymentForm.metode_bayar = 'Transfer'"
                class="py-2.5 px-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                :class="paymentForm.metode_bayar === 'Transfer' ? 'border-navy bg-navy text-white shadow-sm' : 'border-border bg-white text-text-secondary hover:bg-gray-50'"
              >
                <span>💳</span>
                <span>Transfer Bank</span>
              </button>
              <button
                type="button"
                @click="paymentForm.metode_bayar = 'Tunai'"
                class="py-2.5 px-3 rounded-xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                :class="paymentForm.metode_bayar === 'Tunai' ? 'border-navy bg-navy text-white shadow-sm' : 'border-border bg-white text-text-secondary hover:bg-gray-50'"
              >
                <span>💵</span>
                <span>Tunai (Cash)</span>
              </button>
            </div>
          </div>

          <!-- Keterangan Tambahan -->
          <div class="space-y-1.5">
            <label for="radar-keterangan-bayar" class="block text-sm font-bold text-text-primary">
              Keterangan
            </label>
            <input
              id="radar-keterangan-bayar"
              v-model="paymentForm.keterangan"
              type="text"
              placeholder="Contoh: Sewa Kamar (Lunas via Radar)"
              class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-4 py-2.5 text-xs font-semibold text-text-primary placeholder-text-muted focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none transition-all"
            />
          </div>

          <!-- Info Rollover Otomatis -->
          <p class="text-[11px] text-slate-500 bg-slate-50 border border-slate-200/80 rounded-xl p-3 leading-relaxed">
            💡 <strong>Otomatis:</strong> Setelah lunas, status jatuh tempo otomatis maju <strong>+1 bulan</strong> dan nama penyewa langsung keluar dari Radar Jatuh Tempo.
          </p>

          <!-- Action Buttons -->
          <div class="flex gap-3 pt-2">
            <button
              type="button"
              @click="showPaymentModal = false"
              class="flex-1 py-3 px-4 border-2 border-border text-text-secondary hover:bg-gray-50 active:bg-gray-100 font-bold rounded-[var(--radius-btn)] text-base transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="isSubmittingPayment || !paymentForm.nominal || paymentForm.nominal <= 0"
              class="flex-1 py-3 px-4 bg-income hover:brightness-110 active:scale-95 text-white font-extrabold rounded-[var(--radius-btn)] text-base shadow-md shadow-income/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              <svg v-if="isSubmittingPayment" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>{{ isSubmittingPayment ? 'Memproses...' : '✓ Konfirmasi Lunas' }}</span>
            </button>
          </div>
        </form>
      </div>
    </BaseModal>

    <!-- Bottom Navigation Bar -->
    <BottomNav />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase.js'
import { signOutWithLocalFallback } from '../lib/auth.js'
import { clearSignedUrlCache, clearOrgIdCache } from '../lib/storage.js'
import { localDateStamp, advanceOneMonth } from '../lib/date.js'
import { calculateEffectiveDueDate } from '../lib/sewa.js'
import BottomNav from '../components/BottomNav.vue'
import BaseModal from '../components/BaseModal.vue'
import BasePagination from '../components/BasePagination.vue'

const router = useRouter()

// --- UI States ---
const isDropdownOpen = ref(false)
const isSettingsOpen = ref(false)
const isLoadingLocations = ref(true)
const isLoadingData = ref(false)

// --- Edit Location Modal States ---
const showEditLocationModal = ref(false)
const editLocationForm = reactive({
  id: '',
  nama_lokasi: '',
  alamat: '',
})
const isUpdatingLocation = ref(false)
const editLocationError = ref('')

// --- Payment Verification Modal States ---
const showPaymentModal = ref(false)
const selectedRental = ref(null)
const isSubmittingPayment = ref(false)
const paymentError = ref('')

const paymentForm = reactive({
  nominal: 0,
  tanggal_bayar: '',
  metode_bayar: 'Transfer',
  keterangan: '',
})

// --- Data States ---
const locations = ref([])
const selectedLocation = ref(null)
const rooms = ref([])
const rentalsList = ref([])
const incomesList = ref([])
const expensesList = ref([])

// --- Computed ---
const currentLocationObject = computed(() => {
  return locations.value.find(l => l.id === selectedLocation.value) || null
})

const selectedLocationName = computed(() => {
  if (selectedLocation.value === 'ALL') return 'Semua Lokasi'
  const loc = currentLocationObject.value
  return loc ? loc.nama_lokasi : 'Pilih Lokasi'
})

const currentMonth = computed(() => {
  const now = new Date()
  return now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
})

const currentMonthPrefix = computed(() => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
})

// Keuangan Bulan Berjalan
const totalPemasukan = computed(() => {
  return incomesList.value
    .filter(item => item.tanggal_bayar && item.tanggal_bayar.startsWith(currentMonthPrefix.value))
    .reduce((sum, item) => sum + (item.nominal || 0), 0)
})

// Pengeluaran kos ini saja. Tagihan bersama (location_id NULL)
// tidak dihitung per kos, supaya tidak terhitung dobel di tiap kos.
const totalPengeluaran = computed(() => {
  return expensesList.value
    .filter(item => selectedLocation.value === 'ALL' || item.location_id != null)
    .filter(item => item.tanggal_pengeluaran && item.tanggal_pengeluaran.startsWith(currentMonthPrefix.value))
    .reduce((sum, item) => sum + (item.nominal || 0), 0)
})

const totalTagihanBersama = computed(() => {
  return expensesList.value
    .filter(item => item.location_id == null)
    .filter(item => item.tanggal_pengeluaran && item.tanggal_pengeluaran.startsWith(currentMonthPrefix.value))
    .reduce((sum, item) => sum + (item.nominal || 0), 0)
})

const saldoBersih = computed(() => {
  return totalPemasukan.value - totalPengeluaran.value
})

// Status Okupansi
const totalRoomsCount = computed(() => rooms.value.length)
const occupiedRoomsCount = computed(() => rooms.value.filter(r => (r.status_kamar || '').toLowerCase() === 'terisi').length)
const occupancyRate = computed(() => {
  return totalRoomsCount.value > 0 ? (occupiedRoomsCount.value / totalRoomsCount.value) * 100 : 0
})

// Radar Jatuh Tempo
const radarList = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return rentalsList.value.map(rental => {
    const tenantName = rental.tenants?.nama_lengkap || 'Penghuni'
    const roomNo = rental.rooms?.nomor_kamar || ''
    const locName = rental.rooms?.locations?.nama_lokasi || ''
    
    // Hitung tanggal jatuh tempo efektif (otomatis memperhitungkan pembayaran yang sudah masuk)
    const effectiveDueDate = calculateEffectiveDueDate(rental) || rental.tanggal_jatuh_tempo

    // Parse tanggal_jatuh_tempo
    const parts = (effectiveDueDate || '').split('-')
    let diffDays = 999
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10) - 1
      const day = parseInt(parts[2], 10)
      const dueDate = new Date(year, month, day)
      dueDate.setHours(0, 0, 0, 0)
      const diffTime = dueDate.getTime() - today.getTime()
      diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    }

    return {
      id: rental.id,
      rental,
      nama: tenantName,
      kamar: `Kamar ${roomNo} (${locName})`,
      jatuhTempo: effectiveDueDate,
      diffDays
    }
  })
  .filter(item => item.diffDays <= 5) // H-5 or overdue
  .sort((a, b) => a.diffDays - b.diffDays)
})

const currentRadarPage = ref(1)
const radarPageSize = ref(5)

const paginatedRadarList = computed(() => {
  const start = (currentRadarPage.value - 1) * radarPageSize.value
  return radarList.value.slice(start, start + radarPageSize.value)
})

watch(selectedLocation, () => {
  currentRadarPage.value = 1
})

// --- Fetch Locations ---
onMounted(async () => {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .order('nama_lokasi', { ascending: true })

  isLoadingLocations.value = false

  if (error) {
    console.error('[Supabase] Gagal fetch locations:', error)
  } else {
    locations.value = data || []
    if (locations.value.length > 0) {
      selectedLocation.value = locations.value[0].id
    }
  }
})

// --- Fetch Dashboard Data ---
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
async function fetchDashboardData(locationId) {
  if (!locationId) return

  const isAll = locationId === 'ALL'
  if (!isAll && !UUID_RE.test(String(locationId))) {
    console.error('[SimKos] location_id bukan UUID, fetch dashboard dibatalkan:', locationId)
    return
  }
  const safeLocationId = isAll ? '' : String(locationId).toLowerCase()

  isLoadingData.value = true

  try {
    // 1. Fetch rooms
    let roomsQuery = supabase
      .from('rooms')
      .select('*')
      .order('nomor_kamar', { ascending: true })

    if (!isAll) {
      roomsQuery = roomsQuery.eq('location_id', locationId)
    }

    const { data: roomsData, error: roomsError } = await roomsQuery
    if (roomsError) throw roomsError
    rooms.value = roomsData || []

    // 2. Fetch active rentals for radar beserta riwayat pembayarannya
    let rentalsQuery = supabase
      .from('rentals')
      .select('*, tenants(nama_lengkap), rooms!inner(nomor_kamar, location_id, harga_bulanan, locations(nama_lokasi)), incomes(id, nominal, tanggal_bayar, keterangan)')
      .eq('status_aktif', true)

    if (!isAll) {
      rentalsQuery = rentalsQuery.eq('rooms.location_id', locationId)
    }

    const { data: rentalsData, error: rentalsError } = await rentalsQuery
    if (rentalsError) throw rentalsError
    rentalsList.value = rentalsData || []

    // Sinkronisasi otomatis tanggal jatuh tempo rental jika penghuni sudah bayar
    for (const rental of rentalsList.value) {
      const effDue = calculateEffectiveDueDate(rental)
      if (effDue && effDue !== rental.tanggal_jatuh_tempo) {
        supabase
          .from('rentals')
          .update({ tanggal_jatuh_tempo: effDue })
          .eq('id', rental.id)
          .then(({ error }) => {
            if (error) console.warn('[SimKos] Auto-sinkronisasi tanggal jatuh tempo gagal:', error)
          })
        rental.tanggal_jatuh_tempo = effDue
      }
    }

    // 3. Fetch incomes
    let incomesQuery = supabase
      .from('incomes')
      .select('nominal, tanggal_bayar, rentals!inner(rooms!inner(location_id))')

    if (!isAll) {
      incomesQuery = incomesQuery.eq('rentals.rooms.location_id', locationId)
    }

    const { data: incomesData, error: incomesError } = await incomesQuery
    if (incomesError) throw incomesError
    incomesList.value = incomesData || []

    // 4. Fetch expenses
    let expensesQuery = supabase
      .from('expenses')
      .select('nominal, tanggal_pengeluaran, location_id')

    if (!isAll) {
      expensesQuery = expensesQuery.or(`location_id.eq.${safeLocationId},location_id.is.null`)
    }

    const { data: expensesData, error: expensesError } = await expensesQuery
    if (expensesError) throw expensesError
    expensesList.value = expensesData || []

  } catch (err) {
    console.error('[Supabase] Gagal fetch data dashboard:', err)
  } finally {
    isLoadingData.value = false
  }
}

// Watcher
watch(selectedLocation, (newId) => {
  if (newId) {
    fetchDashboardData(newId)
  }
}, { immediate: true })

// Actions
const selectLocation = (id) => {
  selectedLocation.value = id
  isDropdownOpen.value = false
}

function openEditLocationModal(loc) {
  const target = loc || currentLocationObject.value
  if (!target) return
  isDropdownOpen.value = false
  isSettingsOpen.value = false
  editLocationForm.id = target.id
  editLocationForm.nama_lokasi = target.nama_lokasi || ''
  editLocationForm.alamat = target.alamat || ''
  editLocationError.value = ''
  showEditLocationModal.value = true
}

async function handleUpdateLocation() {
  if (!editLocationForm.nama_lokasi.trim()) {
    editLocationError.value = 'Nama kos tidak boleh kosong.'
    return
  }

  isUpdatingLocation.value = true
  editLocationError.value = ''

  try {
    const { error } = await supabase
      .from('locations')
      .update({
        nama_lokasi: editLocationForm.nama_lokasi.trim(),
        alamat: editLocationForm.alamat.trim() || null,
      })
      .eq('id', editLocationForm.id)

    if (error) throw error

    // Perbarui data lokasi lokal di array locations
    const loc = locations.value.find(l => l.id === editLocationForm.id)
    if (loc) {
      loc.nama_lokasi = editLocationForm.nama_lokasi.trim()
      loc.alamat = editLocationForm.alamat.trim() || null
    }

    showEditLocationModal.value = false
  } catch (err) {
    console.error('[SimKos] Gagal memperbarui nama kos:', err)
    editLocationError.value = `Gagal menyimpan: ${err.message || 'Terjadi kesalahan.'}`
  } finally {
    isUpdatingLocation.value = false
  }
}

// --- Payment Verification Handlers ---
function openPaymentModal(rental) {
  if (!rental) return
  selectedRental.value = rental
  paymentForm.nominal = rental.rooms?.harga_bulanan || 0
  paymentForm.tanggal_bayar = localDateStamp()
  paymentForm.metode_bayar = 'Transfer'
  paymentForm.keterangan = `Sewa Kamar ${rental.rooms?.nomor_kamar || ''} (${rental.tenants?.nama_lengkap || ''})`
  paymentError.value = ''
  showPaymentModal.value = true
}

async function handleConfirmPayment() {
  if (!selectedRental.value) return
  if (!paymentForm.nominal || paymentForm.nominal <= 0) {
    paymentError.value = 'Nominal pembayaran harus lebih besar dari Rp 0.'
    return
  }
  if (!paymentForm.tanggal_bayar) {
    paymentError.value = 'Tanggal pembayaran wajib diisi.'
    return
  }

  isSubmittingPayment.value = true
  paymentError.value = ''

  try {
    const rental = selectedRental.value
    const userKet = paymentForm.keterangan ? paymentForm.keterangan.trim() : ''
    const finalKeterangan = userKet
      ? `${userKet} (${paymentForm.metode_bayar})`
      : `Sewa Kamar (${paymentForm.metode_bayar})`

    const payload = {
      rental_id: rental.id,
      nominal: Number(paymentForm.nominal),
      tanggal_bayar: paymentForm.tanggal_bayar,
      keterangan: finalKeterangan,
    }
    if (rental.org_id) {
      payload.org_id = rental.org_id
    }

    // 1. Insert ke tabel incomes (hanya kolom yang ada di database)
    const { error: incomeError } = await supabase
      .from('incomes')
      .insert(payload)

    if (incomeError) throw incomeError

    // 2. Update tanggal_jatuh_tempo di tabel rentals (+1 bulan)
    if (rental.tanggal_jatuh_tempo) {
      const nextDueDate = advanceOneMonth(rental.tanggal_jatuh_tempo)
      const { error: rentalError } = await supabase
        .from('rentals')
        .update({
          tanggal_jatuh_tempo: nextDueDate,
        })
        .eq('id', rental.id)

      if (rentalError) {
        console.warn('[SimKos] Gagal mengupdate tanggal jatuh tempo rental:', rentalError)
      } else {
        rental.tanggal_jatuh_tempo = nextDueDate
      }
    }

    // 3. Tutup modal dan refresh data dashboard secara menyeluruh
    showPaymentModal.value = false
    await fetchDashboardData(selectedLocation.value)
  } catch (err) {
    console.error('[SimKos] Gagal memverifikasi pembayaran:', err)
    paymentError.value = `Gagal memproses pembayaran: ${err.message || 'Terjadi kesalahan sistem.'}`
  } finally {
    isSubmittingPayment.value = false
  }
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
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

async function handleLogout() {
  isSettingsOpen.value = false
  // Buang signed URL yang tersimpan di memori sebelum sesi ditutup
  clearSignedUrlCache()
  clearOrgIdCache()
  // Saat offline, sesi di perangkat tetap dihapus supaya tombol Keluar
  // selalu berhasil membawa user ke halaman login.
  try {
    await signOutWithLocalFallback(supabase.auth)
  } finally {
    router.replace('/login')
  }
}
</script>
