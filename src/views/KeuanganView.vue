<template>
  <div class="min-h-screen bg-bg-primary pb-24">
    <!-- Header -->
    <header class="relative z-20 bg-navy rounded-b-4xl px-6 pt-10 pb-7 text-white shadow-lg max-w-2xl mx-auto space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="text-3xl font-black tracking-tight">Keuangan</h1>
          <p class="text-xs text-blue-200 font-semibold mt-0.5">
            Arus Kas &amp; Laporan Hasil Usaha Internal Bulanan
          </p>
        </div>

        <!-- Pemilih Periode Bulan Kalender Penuh (YYYY-MM) -->
        <div class="flex items-center gap-1.5 bg-white/10 p-1.5 rounded-2xl border border-white/15">
          <button
            id="btn-prev-period"
            type="button"
            @click="goToPrevPeriod"
            class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center font-black text-xs transition active:scale-95"
            title="Bulan Sebelumnya"
          >
            ◀
          </button>
          <input
            id="keuangan-period-input"
            v-model="selectedPeriodKey"
            type="month"
            class="bg-transparent text-white font-extrabold text-xs px-2 py-1 rounded-lg focus:outline-none cursor-pointer"
            aria-label="Pilih Periode Bulan Laporan"
          />
          <button
            id="btn-next-period"
            type="button"
            @click="goToNextPeriod"
            class="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center font-black text-xs transition active:scale-95"
            title="Bulan Berikutnya"
          >
            ▶
          </button>
        </div>
      </div>

      <!-- Location Filter Dropdown -->
      <div class="space-y-1.5">
        <label class="block text-xs font-bold text-blue-200">Filter Lokasi Kos</label>
        <CustomLocationDropdown
          v-model="selectedLocationFilter"
          :locations="locationsList"
        />
      </div>

      <!-- Mode Switcher: Arus Kas vs Hasil Usaha Internal -->
      <div class="grid grid-cols-2 gap-2 bg-white/10 p-1.5 rounded-2xl border border-white/15">
        <button
          id="tab-arus-kas"
          type="button"
          @click="activeReportTab = 'arus_kas'"
          class="py-2.5 px-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5"
          :class="activeReportTab === 'arus_kas'
            ? 'bg-white text-navy shadow-md'
            : 'text-blue-100 hover:bg-white/10'"
        >
          <span>💵</span>
          <span>Arus Kas</span>
        </button>
        <button
          id="tab-hasil-usaha"
          type="button"
          @click="activeReportTab = 'hasil_usaha'"
          class="py-2.5 px-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5"
          :class="activeReportTab === 'hasil_usaha'
            ? 'bg-white text-navy shadow-md'
            : 'text-blue-100 hover:bg-white/10'"
        >
          <span>📊</span>
          <span>Hasil Usaha Internal</span>
          <span
            v-if="periodReport && !periodReport.completeness?.is_complete"
            class="w-2 h-2 rounded-full bg-amber-400"
            title="Laporan periode ini belum lengkap"
          ></span>
        </button>
      </div>
    </header>

    <!-- Content Area -->
    <div class="px-6 py-6 space-y-6 max-w-2xl mx-auto">
      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center justify-center py-20 gap-3">
        <svg class="w-10 h-10 animate-spin text-navy" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span class="text-base font-semibold text-text-secondary">Memproses data keuangan periode {{ formatPeriodDisplay(selectedPeriodKey) }}...</span>
      </div>

      <template v-else>
        <!-- Success Feedback -->
        <div
          v-if="paymentSuccessMsg"
          class="bg-income-light border-2 border-income/30 text-income rounded-[var(--radius-card)] p-4 flex items-center gap-3 animate-fade-in-up"
        >
          <span class="text-2xl flex-shrink-0">✓</span>
          <span class="text-sm font-bold">{{ paymentSuccessMsg }}</span>
        </div>

        <!-- ===================================================================== -->
        <!-- TAB 1: LAPORAN ARUS KAS (CASH BASIS MURNI)                            -->
        <!-- ===================================================================== -->
        <div v-if="activeReportTab === 'arus_kas'" id="panel-arus-kas" class="space-y-6">
          <!-- Banner Penjelasan Basis Kas -->
          <div class="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
            <div class="text-xs text-blue-950">
              <span class="font-extrabold block">💵 Laporan Arus Kas — {{ formatPeriodDisplay(selectedPeriodKey) }}</span>
              <span class="text-[11px] text-blue-800">
                Mencatat seluruh uang masuk dan uang keluar kas aktual (termasuk pembelian aset). Penyusutan tidak mengubah saldo kas.
              </span>
            </div>
            <button
              type="button"
              @click="activeReportTab = 'hasil_usaha'"
              class="px-3 py-1.5 rounded-xl bg-navy text-white text-[11px] font-bold flex-shrink-0 hover:bg-navy-dark transition"
            >
              Lihat Hasil Usaha →
            </button>
          </div>

          <!-- ========== WIDGET ARUS KAS MINI ========== -->
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-4">
              <!-- Pemasukan Card -->
              <div
                @click="toggleFinanceList('masuk')"
                class="cursor-pointer bg-white border-2 p-5 rounded-[var(--radius-card)] shadow-sm relative overflow-hidden active:scale-[0.98] transition-all duration-150 select-none"
                :class="activeFinanceList === 'masuk' ? 'border-income ring-4 ring-income/20 bg-income/5' : 'border-border hover:border-income/40'"
                role="button"
                tabindex="0"
                aria-label="Tampilkan rincian daftar pemasukan"
              >
                <div class="flex items-center justify-between">
                  <p class="text-xs font-bold text-text-muted">Total Pemasukan</p>
                  <span
                    class="text-[10px] font-extrabold px-1.5 py-0.5 rounded transition-colors"
                    :class="activeFinanceList === 'masuk' ? 'bg-income text-white' : 'bg-income/10 text-income'"
                  >
                    {{ activeFinanceList === 'masuk' ? '✕ Tutup' : '👆 Rincian' }}
                  </span>
                </div>
                <p id="val-cash-in-card" class="text-xl font-black text-income mt-1.5">
                  {{ formatCurrency(totalPemasukan) }}
                </p>
                <p class="text-[11px] font-bold text-income/80 mt-1">
                  {{ currentMonthIncomes.length }} transaksi ({{ formatPeriodDisplay(selectedPeriodKey) }})
                </p>
                <div class="absolute right-3 bottom-3 text-2xl opacity-10">📈</div>
              </div>

              <!-- Pengeluaran Card -->
              <div
                @click="toggleFinanceList('keluar')"
                class="cursor-pointer bg-white border-2 p-5 rounded-[var(--radius-card)] shadow-sm relative overflow-hidden active:scale-[0.98] transition-all duration-150 select-none"
                :class="activeFinanceList === 'keluar' ? 'border-expense ring-4 ring-expense/20 bg-expense/5' : 'border-border hover:border-expense/40'"
                role="button"
                tabindex="0"
                aria-label="Tampilkan rincian daftar pengeluaran"
              >
                <div class="flex items-center justify-between">
                  <p class="text-xs font-bold text-text-muted">Total Pengeluaran</p>
                  <span
                    class="text-[10px] font-extrabold px-1.5 py-0.5 rounded transition-colors"
                    :class="activeFinanceList === 'keluar' ? 'bg-expense text-white' : 'bg-expense/10 text-expense'"
                  >
                    {{ activeFinanceList === 'keluar' ? '✕ Tutup' : '👆 Rincian' }}
                  </span>
                </div>
                <p id="val-cash-out-card" class="text-xl font-black text-expense mt-1.5">
                  {{ formatCurrency(totalPengeluaran) }}
                </p>
                <p class="text-[11px] font-bold text-expense/80 mt-1">
                  {{ currentMonthExpenses.length }} transaksi ({{ formatPeriodDisplay(selectedPeriodKey) }})
                </p>
                <div class="absolute right-3 bottom-3 text-2xl opacity-10">📉</div>
              </div>
            </div>

            <!-- Baris Ringkasan Arus Kas Bersih -->
            <div class="bg-white border-2 border-border rounded-2xl px-4 py-3 flex items-center justify-between shadow-sm">
              <span class="text-xs font-extrabold text-text-secondary">Arus Kas Bersih (Cash In − Cash Out)</span>
              <span
                id="val-net-cash-flow-card"
                class="text-base font-black"
                :class="totalPemasukan - totalPengeluaran >= 0 ? 'text-income' : 'text-expense'"
              >
                {{ formatCurrency(totalPemasukan - totalPengeluaran) }}
              </span>
            </div>

            <p class="text-[11px] text-text-muted text-center font-medium">
              💡 Ketuk kartu Total Pemasukan atau Pengeluaran untuk melihat rincian transaksi
            </p>
          </div>

          <!-- Rincian Daftar Pemasukan (Saat Card Pemasukan Diklik) -->
          <div
            v-if="activeFinanceList === 'masuk'"
            class="bg-white rounded-[var(--radius-card)] border-2 border-income/30 p-5 shadow-md space-y-4 animate-fade-in-up"
          >
            <div class="flex items-center justify-between border-b border-border pb-3">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-8 h-8 rounded-lg bg-income/10 text-income flex items-center justify-center font-black flex-shrink-0">📈</span>
                <div class="min-w-0">
                  <h3 class="text-base font-extrabold text-text-primary truncate">Daftar Pemasukan Bulan Ini ({{ formatPeriodDisplay(selectedPeriodKey) }})</h3>
                  <p class="text-xs font-medium text-text-muted">{{ currentMonthIncomes.length }} transaksi diterima</p>
                </div>
              </div>
              <button
                @click="activeFinanceList = null"
                class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center font-bold text-sm active:scale-95 flex-shrink-0"
                aria-label="Tutup rincian pemasukan"
              >
                ✕
              </button>
            </div>

            <!-- Empty Incomes -->
            <div v-if="currentMonthIncomes.length === 0" class="py-8 text-center text-text-muted">
              <p class="text-3xl mb-1">📭</p>
              <p class="text-sm font-bold text-text-primary">Belum ada pemasukan pada periode ini</p>
              <p class="text-xs text-text-secondary mt-0.5">Pembayaran sewa yang masuk akan tercatat otomatis di sini.</p>
            </div>

            <!-- Incomes List -->
            <div v-else class="space-y-2.5">
              <div
                v-for="inc in paginatedIncomes"
                :key="inc.id"
                class="p-3.5 bg-gray-50 border border-border rounded-xl flex items-center justify-between gap-3 hover:bg-income/5 transition-colors"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 bg-income/15 text-income text-xs font-extrabold rounded-md flex-shrink-0">
                      Kamar {{ inc.rentals?.rooms?.nomor_kamar || '-' }}
                    </span>
                    <p class="text-sm font-bold text-text-primary truncate">
                      {{ inc.rentals?.tenants?.nama_lengkap || 'Penghuni' }}
                    </p>
                  </div>
                  <div class="flex items-center gap-2 mt-1 text-xs text-text-muted">
                    <span>📅 {{ formatDateDisplay(inc.tanggal_bayar || inc.tanggal) }}</span>
                    <span>•</span>
                    <span>💳 {{ inc.metode_bayar || 'Transfer' }}</span>
                    <template v-if="inc.rentals?.rooms?.locations?.nama_lokasi">
                      <span>•</span>
                      <span class="truncate">🏢 {{ inc.rentals.rooms.locations.nama_lokasi }}</span>
                    </template>
                  </div>
                  <p v-if="inc.keterangan || inc.catatan" class="text-xs text-text-secondary mt-0.5 truncate">
                    {{ inc.keterangan || inc.catatan }}
                  </p>
                </div>
                <div class="text-right flex-shrink-0">
                  <span class="text-sm font-black text-income block">
                    + {{ formatCurrency(inc.nominal ?? inc.jumlah_terima ?? 0) }}
                  </span>
                </div>
              </div>

              <!-- Pagination Pemasukan -->
              <BasePagination
                v-model="currentIncomePage"
                :total-items="currentMonthIncomes.length"
                :page-size="incomePageSize"
                item-label="transaksi"
              />
            </div>
          </div>

          <!-- Rincian Daftar Pengeluaran (Saat Card Pengeluaran Diklik) -->
          <div
            v-if="activeFinanceList === 'keluar'"
            class="bg-white rounded-[var(--radius-card)] border-2 border-expense/30 p-5 shadow-md space-y-4 animate-fade-in-up"
          >
            <div class="flex items-center justify-between border-b border-border pb-3">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-8 h-8 rounded-lg bg-expense/10 text-expense flex items-center justify-center font-black flex-shrink-0">📉</span>
                <div class="min-w-0">
                  <h3 class="text-base font-extrabold text-text-primary truncate">Daftar Pengeluaran Bulan Ini ({{ formatPeriodDisplay(selectedPeriodKey) }})</h3>
                  <p class="text-xs font-medium text-text-muted">{{ currentMonthExpenses.length }} pos pengeluaran dicatat</p>
                </div>
              </div>
              <button
                @click="activeFinanceList = null"
                class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center font-bold text-sm active:scale-95 flex-shrink-0"
                aria-label="Tutup rincian pengeluaran"
              >
                ✕
              </button>
            </div>

            <!-- Empty Expenses -->
            <div v-if="currentMonthExpenses.length === 0" class="py-8 text-center text-text-muted">
              <p class="text-3xl mb-1">📭</p>
              <p class="text-sm font-bold text-text-primary">Belum ada pengeluaran pada periode ini</p>
              <p class="text-xs text-text-secondary mt-0.5">Biaya operasional yang dicatat akan tercantum di sini.</p>
            </div>

            <!-- Expenses List -->
            <div v-else class="space-y-2.5">
              <div
                v-for="exp in paginatedExpenses"
                :key="exp.id"
                class="p-3.5 bg-gray-50 border border-border rounded-xl flex items-center justify-between gap-3 hover:bg-expense/5 transition-colors"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 bg-expense/15 text-expense text-xs font-extrabold rounded-md flex-shrink-0">
                      📦 {{ exp.kategori || exp.kategori_pengeluaran || 'Biaya' }}
                    </span>
                    <p class="text-sm font-bold text-text-primary truncate">
                      {{ exp.keterangan || exp.catatan || 'Pengeluaran' }}
                    </p>
                  </div>
                  <div class="flex items-center gap-2 mt-1 text-xs text-text-muted">
                    <span>📅 {{ formatDateDisplay(exp.tanggal_pengeluaran) }}</span>
                    <template v-if="exp.locations?.nama_lokasi">
                      <span>•</span>
                      <span class="truncate">🏢 {{ exp.locations.nama_lokasi }}</span>
                    </template>
                    <template v-else-if="exp.location_id == null">
                      <span>•</span>
                      <span>🌐 Tagihan Bersama</span>
                    </template>
                  </div>
                  <p v-if="exp.penerima" class="text-xs text-text-secondary mt-0.5 truncate">
                    Penerima: {{ exp.penerima }}
                  </p>
                </div>
                <div class="text-right flex-shrink-0">
                  <span class="text-sm font-black text-expense block">
                    - {{ formatCurrency(exp.nominal ?? exp.jumlah_pengeluaran ?? 0) }}
                  </span>
                </div>
              </div>

              <!-- Pagination Pengeluaran -->
              <BasePagination
                v-model="currentExpensePage"
                :total-items="currentMonthExpenses.length"
                :page-size="expensePageSize"
                item-label="transaksi"
              />
            </div>
          </div>

          <!-- Catatan tagihan bersama (location_id NULL) -->
          <p
            v-if="totalTagihanBersama > 0"
            class="text-xs font-semibold text-text-secondary bg-navy/5 border border-navy/10 rounded-xl px-4 py-3 -mt-2"
          >
            <template v-if="selectedLocationFilter === 'ALL'">
              🌐 Termasuk tagihan bersama {{ formatCurrency(totalTagihanBersama) }}
            </template>
            <template v-else>
              🌐 Tagihan bersama {{ formatCurrency(totalTagihanBersama) }} tidak termasuk total kos ini
            </template>
          </p>

          <!-- ========== TOMBOL AKSI CHUNKY ========== -->
          <div class="grid grid-cols-2 gap-4">
            <router-link
              to="/tambah-pemasukan"
              class="flex items-center justify-center gap-2 py-4 bg-income text-white rounded-xl text-base font-extrabold shadow-md shadow-income/20 active:scale-[0.96] transition-all duration-150"
            >
              <span>➕</span> Uang Masuk
            </router-link>

            <router-link
              to="/tambah-pengeluaran"
              class="flex items-center justify-center gap-2 py-4 bg-expense text-white rounded-xl text-base font-extrabold shadow-md shadow-expense/20 active:scale-[0.96] transition-all duration-150"
            >
              <span>➖</span> Uang Keluar
            </router-link>
          </div>

          <!-- ========== RADAR PIUTANG (UNPAID BILLS) ========== -->
          <div class="space-y-4">
            <div class="flex items-end justify-between border-b-2 border-border pb-2">
              <h2 class="text-2xl font-black text-text-primary tracking-tight">Belum Bayar ({{ formatPeriodDisplay(selectedPeriodKey) }})</h2>
              <span
                v-if="daftarBelumBayar.length > 0"
                class="text-sm font-bold bg-amber-100 text-amber-800 px-3 py-1 rounded-full border border-amber-200"
              >
                {{ daftarBelumBayar.length }} Penghuni
              </span>
            </div>

            <!-- Empty State (All Paid) -->
            <div
              v-if="daftarBelumBayar.length === 0"
              class="bg-green-50 border border-green-200 rounded-[var(--radius-card)] p-8 text-center shadow-sm"
            >
              <div class="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
                ✓
              </div>
              <p class="text-base font-extrabold text-green-800">Semua Lunas!</p>
              <p class="text-xs font-semibold text-green-600 mt-1">
                Seluruh penghuni aktif pada lokasi ini telah melakukan pembayaran sewa untuk periode terpilih.
              </p>
            </div>

            <!-- Unpaid List -->
            <div v-else class="space-y-3">
              <div
                v-for="rental in paginatedBelumBayar"
                :key="rental.id"
                @click="openPaymentModal(rental)"
                class="bg-white rounded-[var(--radius-card)] border-2 border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow hover:border-income/40 active:scale-[0.99] transition-all duration-150 relative overflow-hidden cursor-pointer"
              >
                <!-- Info Tenant -->
                <div class="flex items-center gap-4 flex-1">
                  <div class="w-14 h-14 rounded-2xl bg-green-500 flex items-center justify-center text-white px-1 text-center flex-shrink-0 shadow-sm overflow-hidden">
                    <span
                      class="leading-tight break-words select-none"
                      :class="getRoomBadgeFontSize(rental.rooms?.nomor_kamar)"
                    >
                      {{ rental.rooms?.nomor_kamar }}
                    </span>
                  </div>

                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-base font-extrabold text-text-primary truncate">
                        {{ rental.tenants?.nama_lengkap }}
                      </p>
                      <span class="text-[10px] bg-income/10 text-income font-bold px-2 py-0.5 rounded-full border border-income/20 flex-shrink-0">
                        ⚡ Klik untuk Bayar
                      </span>
                    </div>
                    <p class="text-xs font-bold text-text-secondary mt-0.5">
                      Tagihan: <span class="text-green-700">{{ formatCurrency(rental.rooms?.harga_bulanan || 0) }}</span>
                      <span v-if="rental.tanggal_jatuh_tempo" class="text-text-muted font-normal ml-2">
                        · Jatuh Tempo: {{ formatDateDisplay(rental.tanggal_jatuh_tempo) }}
                      </span>
                    </p>
                  </div>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-2 flex-shrink-0 text-right sm:text-left">
                  <button
                    type="button"
                    @click.stop="openPaymentModal(rental)"
                    class="px-3.5 py-2.5 bg-income hover:brightness-110 active:scale-95 text-white font-extrabold rounded-xl text-xs shadow-sm transition-transform flex items-center justify-center gap-1.5"
                    title="Verifikasi Pembayaran"
                  >
                    <span class="text-sm leading-none">✓</span>
                    <span>Sudah Bayar</span>
                  </button>
                  <button
                    type="button"
                    @click.stop="kirimTagihan(rental)"
                    class="px-3 py-2.5 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-extrabold rounded-xl text-xs shadow-sm transition-transform flex items-center justify-center gap-1.5"
                    title="Tagih via WhatsApp"
                  >
                    <span>WA</span>
                  </button>
                </div>

                <span class="absolute right-3 top-1 text-[8px] font-bold text-text-muted opacity-30">
                  {{ rental.rooms?.locations?.nama_lokasi }}
                </span>
              </div>

              <!-- Pagination Belum Bayar -->
              <BasePagination
                v-model="currentUnpaidPage"
                :total-items="daftarBelumBayar.length"
                :page-size="unpaidPageSize"
                item-label="penghuni"
              />
            </div>
          </div>
        </div>

        <!-- ===================================================================== -->
        <!-- TAB 2: LAPORAN HASIL USAHA INTERNAL (BULAN PENUH)                     -->
        <!-- ===================================================================== -->
        <div v-else-if="activeReportTab === 'hasil_usaha'" id="panel-hasil-usaha-internal" class="space-y-5">
          <!-- Error State Laporan -->
          <div
            v-if="reportError"
            id="error-laporan-hasil-usaha"
            class="bg-red-50 border-2 border-red-200 rounded-2xl p-4 text-xs text-red-900 space-y-2"
          >
            <div class="font-extrabold flex items-center gap-2 text-sm">
              <span>❌</span>
              <span>Gagal Memuat Laporan Hasil Usaha Internal</span>
            </div>
            <p>{{ reportError }}</p>
            <button
              type="button"
              @click="loadPeriodFinancialReport"
              class="px-3.5 py-2 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition"
            >
              Coba Muat Ulang
            </button>
          </div>

          <template v-else-if="periodReport">
            <!-- Header & Status Kelengkapan Laporan -->
            <div class="bg-white border-2 border-border rounded-3xl p-5 shadow-sm space-y-4">
              <div class="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                  <span class="text-[10px] font-black uppercase tracking-wider text-navy bg-navy/10 px-2.5 py-1 rounded-full">
                    Periode Bulan Penuh: {{ formatPeriodDisplay(periodReport.period_key) }} ({{ periodReport.period_key }})
                  </span>
                  <h2 class="text-lg font-black text-navy mt-2">
                    Laporan Hasil Usaha Internal
                  </h2>
                  <p class="text-xs font-bold text-text-secondary">
                    📍 {{ periodReport.location_name }}
                  </p>
                </div>

                <!-- Badge Status Kelengkapan -->
                <div
                  id="badge-kelengkapan-laporan"
                  class="px-3.5 py-1.5 rounded-full text-xs font-extrabold border flex items-center gap-1.5"
                  :class="completenessBadge.status === 'locked'
                    ? 'bg-purple-100 text-purple-900 border-purple-300'
                    : completenessBadge.status === 'complete'
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border-amber-300'"
                >
                  <span>
                    {{ completenessBadge.status === 'locked' ? '🔒' : completenessBadge.status === 'complete' ? '✅' : '⚠️' }}
                  </span>
                  <span>{{ completenessBadge.label }}</span>
                </div>
              </div>

              <!-- Label Basis Laporan Eksplisit -->
              <div id="label-basis-laporan" class="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-700 leading-relaxed">
                <strong class="text-navy block mb-0.5">ℹ️ Basis Laporan:</strong>
                {{ periodReport.report_basis_label }}
              </div>

              <!-- Daftar Alasan Ketidaklengkapan (Jika Belum Lengkap) -->
              <div
                v-if="!periodReport.completeness.is_complete"
                id="list-alasan-belum-lengkap"
                class="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 space-y-2.5 text-xs text-amber-950"
              >
                <div class="font-extrabold flex items-center justify-between gap-2">
                  <span>⚠️ Laporan Periode Ini Belum Lengkap (Bukan Final):</span>
                  <router-link
                    to="/aset/buku-pembantu"
                    class="text-[11px] font-black text-navy underline hover:text-navy-dark"
                  >
                    Buka Buku Pembantu →
                  </router-link>
                </div>
                <ul class="list-disc list-inside space-y-1 font-medium">
                  <li
                    v-for="reason in periodReport.completeness.reasons"
                    :key="reason.code"
                    :data-reason-code="reason.code"
                  >
                    <strong class="font-bold">[{{ reason.code }}]</strong> {{ reason.message }}
                  </li>
                </ul>
              </div>

              <!-- Rincian Perhitungan Hasil Usaha Internal -->
              <div class="divide-y divide-border text-xs">
                <!-- 1. Penerimaan Kas Usaha -->
                <div class="py-3 flex items-center justify-between gap-3">
                  <div>
                    <span class="font-extrabold text-text-primary block">1. Penerimaan Kas Usaha</span>
                    <span class="text-[11px] text-text-muted">Penerimaan sewa kas aktual pada periode {{ periodReport.period_key }}</span>
                  </div>
                  <span id="val-operating-cash-income" class="text-sm font-black text-income">
                    {{ formatCurrency(periodReport.operating_report.operating_cash_income) }}
                  </span>
                </div>

                <!-- 2. Pengeluaran Kas Bruto -->
                <div class="py-3 flex items-center justify-between gap-3">
                  <div>
                    <span class="font-bold text-text-secondary block">2. Pengeluaran Kas Bruto</span>
                    <span class="text-[11px] text-text-muted">Total kas keluar sebelum eliminasi pembelian aset dikapitalisasi</span>
                  </div>
                  <span id="val-gross-cash-expense" class="text-sm font-bold text-text-primary">
                    {{ formatCurrency(periodReport.operating_report.gross_cash_expense) }}
                  </span>
                </div>

                <!-- 3. Eliminasi Pembelian / Pekerjaan Aset Dikapitalisasi (Disahkan) -->
                <div class="py-3 flex items-center justify-between gap-3">
                  <div>
                    <span class="font-bold text-emerald-800 block">
                      3. Dikurangi: Pembelian / Pekerjaan Aset Dikapitalisasi (Disahkan)
                    </span>
                    <span class="text-[11px] text-text-muted">
                      Nominal dari snapshot terakhir yang disahkan (tidak dibebankan dua kali sebagai beban operasional)
                    </span>
                  </div>
                  <span id="val-approved-capitalized-deduction" class="text-sm font-black text-emerald-700">
                    ({{ formatCurrency(periodReport.operating_report.approved_capitalized_deduction) }})
                  </span>
                </div>

                <!-- Info Alokasi Beban Langsung Disahkan -->
                <div class="py-2.5 px-3 bg-gray-50 rounded-xl flex items-center justify-between gap-3 my-1">
                  <span class="text-[11px] font-semibold text-text-secondary">
                    ℹ️ Alokasi Komponen <code class="font-bold">beban_langsung</code> Disahkan (tetap menjadi beban operasional):
                  </span>
                  <span id="val-approved-direct-expense" class="text-xs font-bold text-text-primary">
                    {{ formatCurrency(periodReport.operating_report.approved_direct_expense_allocation) }}
                  </span>
                </div>

                <!-- 4. Pengeluaran Kas Operasional -->
                <div class="py-3 flex items-start justify-between gap-3">
                  <div>
                    <span class="font-extrabold text-text-primary block">4. Pengeluaran Kas Operasional</span>
                    <span class="text-[11px] text-text-muted">Pengeluaran Kas Bruto dikurangi Kapitalisasi Disahkan</span>
                  </div>
                  <div class="text-right">
                    <span
                      v-if="periodReport.operating_report.operating_cash_expense !== null"
                      id="val-operating-cash-expense"
                      class="text-sm font-black text-expense block"
                    >
                      {{ formatCurrency(periodReport.operating_report.operating_cash_expense) }}
                    </span>
                    <div v-else class="space-y-1">
                      <span
                        id="label-operating-expense-incomplete"
                        class="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-extrabold text-[11px] border border-amber-300"
                      >
                        Belum lengkap
                      </span>
                      <div class="text-[11px] text-text-secondary">
                        Nilai Referensi Terakhir Disahkan:
                        <strong id="val-reference-operating-cash-expense" class="text-navy font-black">
                          {{ formatCurrency(periodReport.operating_report.reference_operating_cash_expense) }}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Panel Pemisahan Nilai Referensi vs Usulan Revisi (Jika Ada Masalah Klasifikasi Tertunda) -->
                <div
                  v-if="!periodReport.completeness.classification_complete || periodReport.operating_report.pending_allocations.total_proposed_revision_allocation > 0"
                  id="panel-pending-allocations"
                  class="py-3 px-4 my-2 bg-amber-50/90 border border-amber-200 rounded-2xl space-y-2"
                >
                  <div class="font-extrabold text-amber-950 flex items-center justify-between">
                    <span>🔍 Rincian Klasifikasi Tertunda / Usulan Revisi (Dipisahkan Tanpa Hitung Ganda)</span>
                    <router-link to="/aset" class="text-[11px] text-navy underline font-bold">Tinjau Aset →</router-link>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                    <div class="bg-white p-2.5 rounded-xl border border-amber-200">
                      <span class="text-text-muted block">Kapitalisasi Terakhir Disahkan:</span>
                      <strong id="val-ref-approved-cap" class="text-navy text-xs font-black">
                        {{ formatCurrency(periodReport.operating_report.approved_capitalized_deduction) }}
                      </strong>
                    </div>
                    <div class="bg-white p-2.5 rounded-xl border border-amber-200">
                      <span class="text-text-muted block">Total Usulan Revisi / Draft:</span>
                      <strong id="val-proposed-revision-allocation" class="text-amber-800 text-xs font-black">
                        {{ formatCurrency(periodReport.operating_report.pending_allocations.total_proposed_revision_allocation) }}
                      </strong>
                    </div>
                    <div class="bg-white p-2.5 rounded-xl border border-amber-200">
                      <span class="text-text-muted block">Selisih Usulan vs Disahkan (Δ):</span>
                      <strong id="val-proposed-vs-approved-delta" class="text-xs font-black" :class="periodReport.operating_report.pending_allocations.proposed_vs_approved_delta >= 0 ? 'text-emerald-700' : 'text-red-700'">
                        {{ periodReport.operating_report.pending_allocations.proposed_vs_approved_delta >= 0 ? '+' : '' }}{{ formatCurrency(periodReport.operating_report.pending_allocations.proposed_vs_approved_delta) }}
                      </strong>
                    </div>
                  </div>
                  <p v-if="periodReport.completeness.null_allocated_cost_issue_count > 0" class="text-[11px] text-red-800 font-bold">
                    ⚠️ Terdapat {{ periodReport.completeness.null_allocated_cost_issue_count }} komponen terhubung ke pengeluaran yang belum memiliki nilai alokasi biaya (allocated_cost IS NULL).
                  </p>
                </div>

                <!-- 5. Surplus / Defisit Operasional Sebelum Penyusutan -->
                <div class="py-3 flex items-start justify-between gap-3">
                  <div>
                    <span class="font-extrabold text-navy block">5. Surplus / (Defisit) Operasional Sebelum Penyusutan</span>
                    <span class="text-[11px] text-text-muted">Penerimaan Kas Usaha dikurangi Pengeluaran Kas Operasional</span>
                  </div>
                  <div class="text-right">
                    <span
                      v-if="periodReport.operating_report.operating_surplus_before_depreciation !== null"
                      id="val-operating-surplus-before-depr"
                      class="text-sm font-black text-navy block"
                    >
                      {{ formatCurrency(periodReport.operating_report.operating_surplus_before_depreciation) }}
                    </span>
                    <div v-else class="space-y-1">
                      <span class="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-extrabold text-[11px] border border-amber-300">
                        Belum lengkap
                      </span>
                      <div class="text-[11px] text-text-secondary">
                        Referensi Terakhir Disahkan:
                        <strong id="val-reference-operating-surplus" class="text-navy font-black">
                          {{ formatCurrency(periodReport.operating_report.reference_operating_surplus_before_depreciation) }}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 6. Beban Penyusutan Usaha (Posted) -->
                <div class="py-3 flex items-start justify-between gap-3">
                  <div>
                    <span class="font-extrabold text-text-primary block">6. Dikurangi: Beban Penyusutan Usaha (Dibukukan)</span>
                    <span class="text-[11px] text-text-muted">
                      Hanya mengambil bagian usaha dari batch penyusutan berstatus <code class="font-bold">posted</code>
                    </span>
                  </div>
                  <div class="text-right">
                    <span
                      v-if="periodReport.operating_report.depreciation_business_portion !== null"
                      id="val-depreciation-business"
                      class="text-sm font-black text-expense block"
                    >
                      - {{ formatCurrency(periodReport.operating_report.depreciation_business_portion) }}
                    </span>
                    <span
                      v-else
                      id="label-depreciation-unposted"
                      class="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-extrabold text-[11px] border border-amber-300"
                    >
                      Belum dibukukan
                    </span>
                    <div
                      v-if="periodReport.operating_report.depreciation_total_posted !== null"
                      class="text-[10px] text-text-muted mt-1"
                    >
                      Total Penyusutan: {{ formatCurrency(periodReport.operating_report.depreciation_total_posted) }}
                      · Non-Usaha (Dikecualikan): {{ formatCurrency(periodReport.operating_report.depreciation_non_business_portion) }}
                    </div>
                  </div>
                </div>

                <!-- 7. Hasil Usaha Internal Bersih -->
                <div class="pt-4 pb-1 flex items-center justify-between gap-3 bg-navy/5 -mx-5 px-5 rounded-b-2xl">
                  <div>
                    <span class="text-sm font-black text-navy block">7. Hasil Usaha Internal Bersih</span>
                    <span class="text-[11px] text-text-secondary">
                      Surplus Operasional Sebelum Penyusutan dikurangi Beban Penyusutan Usaha
                    </span>
                  </div>
                  <div class="text-right">
                    <span
                      v-if="periodReport.operating_report.net_operating_income !== null"
                      id="val-net-operating-income"
                      class="text-lg font-black"
                      :class="periodReport.operating_report.net_operating_income >= 0 ? 'text-income' : 'text-expense'"
                    >
                      {{ formatCurrency(periodReport.operating_report.net_operating_income) }}
                    </span>
                    <span
                      v-else
                      id="label-net-operating-incomplete"
                      class="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-black text-xs border border-amber-300"
                    >
                      Belum lengkap
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Kartu Informasi Biaya Bersama Lintas Lokasi (shared_costs) -->
            <div
              id="panel-shared-costs"
              class="bg-white border-2 border-border rounded-3xl p-5 shadow-sm space-y-3"
            >
              <div class="flex items-center justify-between gap-2 border-b border-border pb-2.5">
                <h3 class="text-sm font-black text-navy flex items-center gap-1.5">
                  <span>🌐</span>
                  <span>Informasi Biaya Bersama Lintas Lokasi (<code class="text-xs">location_id IS NULL</code>)</span>
                </h3>
                <span
                  class="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full"
                  :class="periodReport.shared_costs.included_in_operating_report
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-blue-100 text-blue-900'"
                >
                  {{ periodReport.shared_costs.included_in_operating_report ? 'Termasuk di Konsolidasi Ini' : 'Informasi Terpisah' }}
                </span>
              </div>

              <p id="label-scope-disclaimer" class="text-xs font-semibold text-blue-900 bg-blue-50 border border-blue-200 rounded-xl p-3">
                {{ periodReport.scope_disclaimer_label }}
              </p>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div class="p-3 rounded-2xl bg-gray-50 border border-border">
                  <span class="text-text-muted text-[11px] block">Pengeluaran Kas Bersama (Tagihan Bersama):</span>
                  <strong id="val-shared-cash-expense" class="text-navy text-sm font-black">
                    {{ formatCurrency(periodReport.shared_costs.shared_cash_expense_total) }}
                  </strong>
                </div>
                <div class="p-3 rounded-2xl bg-gray-50 border border-border">
                  <span class="text-text-muted text-[11px] block">Penyusutan Aset Bersama (Porsi Usaha):</span>
                  <strong
                    v-if="periodReport.shared_costs.shared_depreciation_business_portion !== null"
                    id="val-shared-depreciation-business"
                    class="text-navy text-sm font-black"
                  >
                    {{ formatCurrency(periodReport.shared_costs.shared_depreciation_business_portion) }}
                  </strong>
                  <strong
                    v-else
                    id="label-shared-depreciation-unposted"
                    class="text-amber-800 text-xs font-extrabold"
                  >
                    Belum dibukukan
                  </strong>
                  <span
                    v-if="periodReport.shared_costs.shared_depreciation_total_posted !== null"
                    class="block text-[10px] text-text-muted mt-0.5"
                  >
                    Total: {{ formatCurrency(periodReport.shared_costs.shared_depreciation_total_posted) }}
                    (Non-Usaha: {{ formatCurrency(periodReport.shared_costs.shared_depreciation_non_business_portion) }})
                  </span>
                </div>
              </div>
            </div>

            <!-- Kartu Jembatan Rekonsiliasi Arus Kas vs Hasil Usaha Internal -->
            <div
              id="panel-reconciliation-bridge"
              class="bg-white border-2 border-border rounded-3xl p-5 shadow-sm space-y-3"
            >
              <div class="border-b border-border pb-2.5">
                <h3 class="text-sm font-black text-navy">
                  🔗 Jembatan Rekonsiliasi: Arus Kas Bersih vs Hasil Usaha Internal
                </h3>
                <p class="text-[11px] text-text-muted">
                  Memastikan perbedaan antara saldo kas dan hasil usaha internal dapat ditelusuri secara transparan
                </p>
              </div>

              <div class="space-y-2 text-xs">
                <div class="flex items-center justify-between py-1.5 border-b border-border/60">
                  <span class="font-bold text-text-secondary">Arus Kas Bersih (Cash In − Cash Out)</span>
                  <strong id="val-rec-net-cash-flow" class="font-black text-navy">
                    {{ formatCurrency(periodReport.reconciliation.net_cash_flow) }}
                  </strong>
                </div>
                <div class="flex items-center justify-between py-1.5 border-b border-border/60">
                  <span class="font-bold text-emerald-800">(+) Eliminasi Pembelian Aset Dikapitalisasi (Disahkan)</span>
                  <strong id="val-rec-add-back-cap" class="font-black text-emerald-700">
                    + {{ formatCurrency(periodReport.reconciliation.add_back_approved_capitalized_purchases) }}
                  </strong>
                </div>
                <div class="flex items-center justify-between py-1.5 border-b border-border/60">
                  <span class="font-bold text-expense">(−) Beban Penyusutan Usaha (Posted)</span>
                  <strong id="val-rec-less-depr" class="font-black text-expense">
                    {{
                      periodReport.reconciliation.less_posted_business_depreciation !== null
                        ? '- ' + formatCurrency(periodReport.reconciliation.less_posted_business_depreciation)
                        : 'Belum dibukukan'
                    }}
                  </strong>
                </div>
                <div class="flex items-center justify-between pt-2 font-black text-sm text-navy">
                  <span>(=) Hasil Usaha Internal Bersih</span>
                  <strong id="val-rec-net-operating-income">
                    {{
                      periodReport.reconciliation.net_operating_income !== null
                        ? formatCurrency(periodReport.reconciliation.net_operating_income)
                        : 'Belum lengkap'
                    }}
                  </strong>
                </div>
              </div>
            </div>

            <!-- Kartu Riwayat Revisi Alokasi Pengeluaran (Jika Ada) -->
            <div
              v-if="periodReport.allocation_revision_history && periodReport.allocation_revision_history.length > 0"
              id="panel-allocation-revision-history"
              class="bg-white border-2 border-border rounded-3xl p-5 shadow-sm space-y-3"
            >
              <div class="border-b border-border pb-2.5">
                <h3 class="text-sm font-black text-navy">
                  📜 Riwayat Revisi Alokasi Pengeluaran yang Mempengaruhi Periode Ini
                </h3>
                <p class="text-[11px] text-text-muted">
                  Perubahan alokasi biaya atau keputusan kapitalisasi antar versi snapshot yang telah disahkan
                </p>
              </div>

              <div class="space-y-2.5 text-xs">
                <div
                  v-for="(rev, idx) in periodReport.allocation_revision_history"
                  :key="idx"
                  class="p-3 rounded-2xl bg-gray-50 border border-border space-y-1"
                >
                  <div class="flex items-center justify-between font-bold text-navy">
                    <span>{{ rev.nama_aset }} — {{ rev.nama_komponen }}</span>
                    <span class="text-[10px] bg-navy/10 px-2 py-0.5 rounded-full">
                      Snapshot v{{ rev.previous_version }} → v{{ rev.current_version }}
                    </span>
                  </div>
                  <div class="text-[11px] text-text-secondary">
                    Alokasi: <strong>{{ formatCurrency(rev.previous_allocated_cost) }}</strong> ({{ rev.previous_status_kapitalisasi }})
                    → <strong>{{ formatCurrency(rev.current_allocated_cost) }}</strong> ({{ rev.current_status_kapitalisasi }})
                    · Selisih:
                    <strong :class="rev.allocated_cost_delta >= 0 ? 'text-emerald-700' : 'text-red-700'">
                      {{ rev.allocated_cost_delta >= 0 ? '+' : '' }}{{ formatCurrency(rev.allocated_cost_delta) }}
                    </strong>
                  </div>
                  <p v-if="rev.revision_notes" class="text-[11px] text-text-muted italic">
                    Catatan: "{{ rev.revision_notes }}"
                  </p>
                </div>
              </div>
            </div>
          </template>
        </div>
      </template>
    </div>

    <!-- ========== MODAL VERIFIKASI PEMBAYARAN SEWA ========== -->
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
            <span class="text-xs font-bold text-text-muted">Kamar &amp; Lokasi</span>
            <span class="text-xs font-black text-navy bg-navy/10 px-2 py-0.5 rounded-md">
              Kamar {{ selectedRental?.rooms?.nomor_kamar }} · {{ selectedRental?.rooms?.locations?.nama_lokasi }}
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
          <div class="space-y-1.5">
            <label for="nominal-bayar" class="block text-sm font-bold text-text-primary">
              Nominal Diterima (Rp) <span class="text-expense">*</span>
            </label>
            <input
              id="nominal-bayar"
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

          <div class="space-y-1.5">
            <label for="tanggal-bayar" class="block text-sm font-bold text-text-primary">
              Tanggal Bayar <span class="text-expense">*</span>
            </label>
            <input
              id="tanggal-bayar"
              v-model="paymentForm.tanggal_bayar"
              type="date"
              required
              class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-4 py-3 text-base font-semibold text-text-primary focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none transition-all"
            />
          </div>

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

          <div class="space-y-1.5">
            <label for="keterangan-bayar" class="block text-sm font-bold text-text-primary">
              Keterangan
            </label>
            <input
              id="keterangan-bayar"
              v-model="paymentForm.keterangan"
              type="text"
              placeholder="Contoh: Sewa Kamar (Lunas via Transfer)"
              class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                     px-4 py-2.5 text-xs font-semibold text-text-primary placeholder-text-muted focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none transition-all"
            />
          </div>

          <p class="text-[11px] text-slate-500 bg-slate-50 border border-slate-200/80 rounded-xl p-3 leading-relaxed">
            💡 <strong>Otomatis:</strong> Setelah disimpan, arus kas masuk langsung tercatat dan tanggal jatuh tempo penyewa otomatis maju <strong>+1 bulan</strong>.
          </p>

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
import { useRoute } from 'vue-router'
import { supabase } from '../supabase.js'
import BottomNav from '../components/BottomNav.vue'
import BaseModal from '../components/BaseModal.vue'
import BasePagination from '../components/BasePagination.vue'
import CustomLocationDropdown from '../components/CustomLocationDropdown.vue'
import { localDateStamp, advanceOneMonth } from '../lib/date.js'
import { getRoomBadgeFontSize } from '../lib/sewa.js'
import { getCurrentOrgId } from '../lib/storage.js'
import {
  formatPeriodKey,
  getNextPeriodKey,
  getPrevPeriodKey,
  formatPeriodDisplay,
  formatBookkeepingError,
} from '../lib/pembukuanAset.js'
import {
  fetchPeriodFinancialReport,
  getReportCompletenessBadge,
  isFullMonthPeriodKey,
} from '../lib/laporanKeuangan.js'

const route = useRoute()

const isLoading = ref(true)
const selectedLocationFilter = ref('ALL')
const activeFinanceList = ref(null) // null | 'masuk' | 'keluar'
const activeReportTab = ref('arus_kas') // 'arus_kas' | 'hasil_usaha'

const now = new Date()
const defaultPeriodKey = formatPeriodKey(now.getFullYear(), now.getMonth() + 1)
const selectedPeriodKey = ref(
  typeof route.query?.period === 'string' && isFullMonthPeriodKey(route.query.period)
    ? route.query.period
    : defaultPeriodKey
)

if (route.query?.tab === 'hasil_usaha') {
  activeReportTab.value = 'hasil_usaha'
}

watch(
  () => route.query,
  (q) => {
    if (typeof q?.period === 'string' && isFullMonthPeriodKey(q.period)) {
      selectedPeriodKey.value = q.period
    }
    if (q?.tab === 'hasil_usaha' || q?.tab === 'arus_kas') {
      activeReportTab.value = q.tab
    }
  }
)

const orgId = ref(null)
const periodReport = ref(null)
const reportError = ref('')

const currentIncomePage = ref(1)
const incomePageSize = ref(5)
const currentExpensePage = ref(1)
const expensePageSize = ref(5)
const currentUnpaidPage = ref(1)
const unpaidPageSize = ref(5)

const completenessBadge = computed(() => {
  return getReportCompletenessBadge(periodReport.value?.completeness)
})

watch([selectedLocationFilter, selectedPeriodKey], async () => {
  currentIncomePage.value = 1
  currentExpensePage.value = 1
  currentUnpaidPage.value = 1
  await loadPeriodFinancialReport()
})

function goToPrevPeriod() {
  selectedPeriodKey.value = getPrevPeriodKey(selectedPeriodKey.value)
}

function goToNextPeriod() {
  selectedPeriodKey.value = getNextPeriodKey(selectedPeriodKey.value)
}

function toggleFinanceList(type) {
  if (activeFinanceList.value === type) {
    activeFinanceList.value = null
  } else {
    activeFinanceList.value = type
  }
}

// Payment Modal States
const showPaymentModal = ref(false)
const selectedRental = ref(null)
const isSubmittingPayment = ref(false)
const paymentError = ref('')
const paymentSuccessMsg = ref('')

const paymentForm = reactive({
  nominal: 0,
  tanggal_bayar: '',
  metode_bayar: 'Transfer',
  keterangan: '',
})

const locationsList = ref([])
const rentalsList = ref([])
const incomesList = ref([])
const expensesList = ref([])

const currentMonthPrefix = computed(() => {
  return selectedPeriodKey.value || defaultPeriodKey
})

// Current month cash transactions
const currentMonthIncomes = computed(() => {
  return incomesList.value
    .filter(item => {
      const itemLocId = item.location_id ?? item.rentals?.rooms?.location_id ?? null
      const matchesLocation = selectedLocationFilter.value === 'ALL' || itemLocId === selectedLocationFilter.value
      const dateCol = item.tanggal_bayar || item.tanggal || ''
      const matchesMonth = dateCol.startsWith(currentMonthPrefix.value)
      return matchesLocation && matchesMonth
    })
    .sort((a, b) => new Date(b.tanggal_bayar || b.tanggal || 0) - new Date(a.tanggal_bayar || a.tanggal || 0))
})

const paginatedIncomes = computed(() => {
  const start = (currentIncomePage.value - 1) * incomePageSize.value
  return currentMonthIncomes.value.slice(start, start + incomePageSize.value)
})

const currentMonthExpenses = computed(() => {
  return expensesList.value
    .filter(item => {
      const matchesLocation = selectedLocationFilter.value === 'ALL' || item.location_id === selectedLocationFilter.value
      const matchesMonth = item.tanggal_pengeluaran && item.tanggal_pengeluaran.startsWith(currentMonthPrefix.value)
      return matchesLocation && matchesMonth
    })
    .sort((a, b) => new Date(b.tanggal_pengeluaran || 0) - new Date(a.tanggal_pengeluaran || 0))
})

const paginatedExpenses = computed(() => {
  const start = (currentExpensePage.value - 1) * expensePageSize.value
  return currentMonthExpenses.value.slice(start, start + expensePageSize.value)
})

// Tagihan bersama (location_id NULL) bulan ini.
const totalTagihanBersama = computed(() => {
  if (periodReport.value?.shared_costs?.shared_cash_expense_total !== undefined) {
    return Number(periodReport.value.shared_costs.shared_cash_expense_total) || 0
  }
  return expensesList.value
    .filter(item => item.location_id == null && item.tanggal_pengeluaran && item.tanggal_pengeluaran.startsWith(currentMonthPrefix.value))
    .reduce((sum, item) => sum + Number(item.nominal ?? item.jumlah_pengeluaran ?? 0), 0)
})

const totalPemasukan = computed(() => {
  if (periodReport.value?.cash_flow?.cash_in !== undefined) {
    return Number(periodReport.value.cash_flow.cash_in) || 0
  }
  return currentMonthIncomes.value.reduce((sum, item) => sum + Number(item.nominal ?? item.jumlah_terima ?? 0), 0)
})

const totalPengeluaran = computed(() => {
  if (periodReport.value?.cash_flow?.cash_out !== undefined) {
    return Number(periodReport.value.cash_flow.cash_out) || 0
  }
  return currentMonthExpenses.value.reduce((sum, item) => sum + Number(item.nominal ?? item.jumlah_pengeluaran ?? 0), 0)
})

// Filter rentals that have NOT paid in the selected month
const daftarBelumBayar = computed(() => {
  return rentalsList.value.filter(rental => {
    const matchesLocation = selectedLocationFilter.value === 'ALL' || rental.rooms?.location_id === selectedLocationFilter.value
    if (!matchesLocation) return false

    const hasPaid = incomesList.value.some(income => {
      const dateCol = income.tanggal_bayar || income.tanggal || ''
      return income.rental_id === rental.id && dateCol.startsWith(currentMonthPrefix.value)
    })

    return !hasPaid
  })
})

const paginatedBelumBayar = computed(() => {
  const start = (currentUnpaidPage.value - 1) * unpaidPageSize.value
  return daftarBelumBayar.value.slice(start, start + unpaidPageSize.value)
})

// Load Locations
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

async function loadPeriodFinancialReport() {
  if (!orgId.value) {
    orgId.value = await getCurrentOrgId()
  }
  if (!orgId.value || !isFullMonthPeriodKey(selectedPeriodKey.value)) return

  reportError.value = ''
  try {
    const locId = selectedLocationFilter.value === 'ALL' ? null : selectedLocationFilter.value
    const data = await fetchPeriodFinancialReport(supabase, {
      orgId: orgId.value,
      periodKey: selectedPeriodKey.value,
      locationId: locId,
    })
    periodReport.value = data
  } catch (err) {
    console.error('[SimKos] Gagal memuat laporan hasil usaha internal:', err)
    reportError.value = formatBookkeepingError(err)
  }
}

// Load Financial Dashboard Data
async function loadFinanceData() {
  isLoading.value = true
  try {
    orgId.value = await getCurrentOrgId()

    // 1. Fetch active rentals
    const { data: rentalsData, error: rentalsError } = await supabase
      .from('rentals')
      .select('*, tenants(*), rooms(*, locations(*))')
      .eq('status_aktif', true)

    if (!rentalsError) {
      rentalsList.value = rentalsData || []
    }

    // 2. Fetch incomes
    const { data: incomesData, error: incomesError } = await supabase
      .from('incomes')
      .select('*, rentals(id, rooms(id, nomor_kamar, location_id, locations(nama_lokasi)), tenants(id, nama_lengkap, nomor_hp))')
      .order('created_at', { ascending: false })

    if (!incomesError) {
      incomesList.value = incomesData || []
    }

    // 3. Fetch expenses
    const { data: expensesData, error: expensesError } = await supabase
      .from('expenses')
      .select('*, locations(nama_lokasi)')
      .order('tanggal_pengeluaran', { ascending: false })

    if (!expensesError) {
      expensesList.value = expensesData || []
    }

    // 4. Load server-calculated financial report (Cash Flow + Operating Report)
    await loadPeriodFinancialReport()
  } catch (err) {
    console.error('[SimKos] Gagal fetch data keuangan:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await loadLocations()
  await loadFinanceData()
})

// Send WhatsApp automatic bill template
function kirimTagihan(rental) {
  const tenantName = rental.tenants?.nama_lengkap || 'Penghuni'
  const roomNo = rental.rooms?.nomor_kamar || '-'
  const amountStr = formatCurrency(rental.rooms?.harga_bulanan || 0)
  const phone = rental.tenants?.nomor_hp || ''

  if (!phone) {
    alert('Nomor HP penghuni tidak tersedia!')
    return
  }

  let formattedPhone = phone.replace(/\D/g, '')
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '62' + formattedPhone.substring(1)
  }

  const textMsg = `Halo ${tenantName}, mengingatkan untuk pembayaran sewa Kamar ${roomNo} periode bulan ini sebesar ${amountStr}. Pembayaran dapat ditransfer melalui nomor rekening Bank Mandiri 1440005288516 A.N Tutik Widayati. Jika sudah transfer, mohon kirimkan bukti transfernya ya. Terima kasih!`

  const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(textMsg)}`
  window.open(waUrl, '_blank')
}

// Payment Verification Modal Handlers
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
    paymentError.value = 'Tanggal bayar harus diisi.'
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
      tanggal_bayar: paymentForm.tanggal_bayar,
      nominal: Number(paymentForm.nominal),
      keterangan: finalKeterangan,
    }
    if (rental.org_id) {
      payload.org_id = rental.org_id
    }

    const { error: incomeError } = await supabase
      .from('incomes')
      .insert(payload)

    if (incomeError) throw incomeError

    if (rental.tanggal_jatuh_tempo) {
      const tanggalJatuhTempoBaru = advanceOneMonth(rental.tanggal_jatuh_tempo)

      const { error: updateRentalError } = await supabase
        .from('rentals')
        .update({ tanggal_jatuh_tempo: tanggalJatuhTempoBaru })
        .eq('id', rental.id)

      if (updateRentalError) throw updateRentalError
      rental.tanggal_jatuh_tempo = tanggalJatuhTempoBaru
    }

    showPaymentModal.value = false
    paymentSuccessMsg.value = `Pembayaran Kamar ${rental.rooms?.nomor_kamar || ''} (${rental.tenants?.nama_lengkap || ''}) berhasil diverifikasi!`
    setTimeout(() => {
      paymentSuccessMsg.value = ''
    }, 4000)

    await loadFinanceData()
  } catch (err) {
    console.error('[SimKos] Gagal memverifikasi pembayaran:', err)
    paymentError.value = `Gagal menyimpan: ${err.message || 'Terjadi kesalahan'}`
  } finally {
    isSubmittingPayment.value = false
  }
}

// Helpers
function formatDateDisplay(dateStr) {
  if (!dateStr) return '-'
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}
function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}
</script>
