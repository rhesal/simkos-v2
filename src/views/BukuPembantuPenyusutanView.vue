<template>
  <div class="min-h-screen bg-bg-app pb-28 text-text-primary">
    <!-- Header Navy -->
    <header class="bg-navy text-white px-5 pt-7 pb-6 rounded-b-[28px] shadow-lg">
      <div class="max-w-3xl mx-auto flex flex-col gap-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <router-link
              to="/aset"
              class="text-blue-200 hover:text-white font-bold text-sm transition flex items-center gap-1"
            >
              <span>‹</span>
              <span>Aset</span>
            </router-link>
            <span class="text-blue-400">/</span>
            <h1 class="text-xl sm:text-2xl font-black tracking-tight">Buku Pembantu Penyusutan</h1>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="text-[11px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider"
              :class="canManageBookkeeping ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' : 'bg-blue-500/20 text-blue-200 border border-blue-400/30'"
            >
              {{ currentUserRole ? (canManageBookkeeping ? `${currentUserRole}` : `${currentUserRole} (Baca Saja)`) : 'Memuat...' }}
            </span>
          </div>
        </div>

        <!-- Start Date Config & Quick Info -->
        <div class="bg-white/10 rounded-2xl p-3.5 backdrop-blur-sm border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div class="flex items-center gap-2.5">
            <span class="text-xl">📅</span>
            <div>
              <p class="text-blue-200 text-[11px] font-semibold">Tanggal Mulai Pembukuan Penyusutan</p>
              <p class="font-black text-sm text-white">
                {{ bookkeepingStartDate ? formatBookkeepingDate(bookkeepingStartDate) : 'Belum Dikonfigurasi' }}
              </p>
            </div>
          </div>
          <button
            v-if="canManageBookkeeping"
            type="button"
            @click="openStartDateModal"
            class="px-3 py-1.5 bg-white text-navy font-bold rounded-xl text-xs hover:bg-blue-50 active:scale-95 transition shadow-sm"
          >
            {{ bookkeepingStartDate ? 'Ubah Tanggal' : 'Atur Tanggal Mulai' }}
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-3xl mx-auto px-4 mt-5 space-y-5">
      <!-- Error Banner jika gagal memuat data -->
      <div
        v-if="errorMessage"
        class="bg-red-50 border-2 border-red-300 text-red-900 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      >
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">⚠️</span>
          <div>
            <p class="text-sm font-bold">Gagal memuat buku pembantu penyusutan</p>
            <p class="text-xs text-red-700 mt-0.5">{{ errorMessage }}</p>
          </div>
        </div>
        <button
          type="button"
          @click="loadAllData"
          class="px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow transition"
        >
          Coba Lagi
        </button>
      </div>

      <!-- Notifikasi Sukses / Info -->
      <div
        v-if="successMessage"
        class="bg-emerald-50 border-2 border-emerald-300 text-emerald-900 rounded-2xl p-3.5 shadow-sm flex items-center justify-between gap-2 text-xs font-bold"
      >
        <div class="flex items-center gap-2">
          <span>✅</span>
          <span>{{ successMessage }}</span>
        </div>
        <button type="button" @click="successMessage = ''" class="text-emerald-700 hover:text-emerald-900">✕</button>
      </div>

      <!-- Jika tanggal mulai belum diatur sama sekali -->
      <div
        v-if="!isLoading && !bookkeepingStartDate && !errorMessage"
        class="bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-2xl p-6 text-center space-y-3 shadow-sm"
      >
        <span class="text-4xl block">⚙️</span>
        <h2 class="text-base font-black">Pembukuan Penyusutan Belum Dikonfigurasi</h2>
        <p class="text-xs text-amber-800 max-w-md mx-auto leading-relaxed">
          Tentukan tanggal mulai pembukuan penyusutan resmi untuk organisasi kos ini. Aset dan komponen yang siap guna sebelum tanggal ini akan disahkan saldo awalnya terlebih dahulu.
        </p>
        <div v-if="canManageBookkeeping" class="pt-2">
          <button
            type="button"
            @click="openStartDateModal"
            class="px-5 py-2.5 bg-navy text-white text-xs font-bold rounded-xl shadow hover:bg-navy-dark active:scale-95 transition"
          >
            Konfigurasi Tanggal Mulai Pembukuan
          </button>
        </div>
      </div>

      <!-- Periode Navigator & Status Bar -->
      <div v-if="bookkeepingStartDate && !errorMessage" class="bg-white rounded-2xl border-2 border-border p-4 shadow-sm space-y-3">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3">
          <!-- Month Navigation -->
          <div class="flex items-center gap-2">
            <button
              type="button"
              @click="goToPrevPeriod"
              class="w-8 h-8 rounded-xl border border-border flex items-center justify-center font-black text-navy hover:bg-bg-app active:scale-90 transition"
              title="Periode Sebelumnya"
            >
              ‹
            </button>
            <div class="text-center min-w-[150px]">
              <span class="text-[11px] font-bold text-text-muted block">Periode Pembukuan</span>
              <span class="text-base font-black text-navy">{{ formatPeriodDisplay(selectedPeriodKey) }}</span>
              <span class="text-[10px] text-text-secondary block">({{ selectedPeriodKey }})</span>
            </div>
            <button
              type="button"
              @click="goToNextPeriod"
              class="w-8 h-8 rounded-xl border border-border flex items-center justify-center font-black text-navy hover:bg-bg-app active:scale-90 transition"
              title="Periode Berikutnya"
            >
              ›
            </button>
          </div>

          <!-- Periode Status Indicator & Actions -->
          <div class="flex items-center gap-2 flex-wrap justify-center sm:justify-end">
            <!-- Badge Status Periode -->
            <span
              v-if="isPeriodLocked"
              class="px-3 py-1 rounded-xl text-xs font-black bg-red-100 text-red-800 border border-red-200 flex items-center gap-1.5"
            >
              <span>🔒</span>
              <span>Terkunci</span>
            </span>
            <span
              v-else-if="currentPostedBatch"
              class="px-3 py-1 rounded-xl text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5"
            >
              <span>✅</span>
              <span>Sudah Dibukukan (Posted)</span>
            </span>
            <span
              v-else
              class="px-3 py-1 rounded-xl text-xs font-black bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1.5"
            >
              <span>🟡</span>
              <span>Terbuka — Belum Dibukukan</span>
            </span>

            <!-- Tombol Kunci / Buka Periode (Owner/Admin) -->
            <button
              v-if="canManageBookkeeping"
              type="button"
              @click="openLockModal"
              class="px-3 py-1.5 border border-border hover:bg-bg-app text-text-secondary text-xs font-bold rounded-xl transition"
            >
              {{ isPeriodLocked ? '🔓 Buka Kunci' : '🔒 Kunci Periode' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Ringkasan Metrik Angka Periode -->
      <div v-if="bookkeepingStartDate && !errorMessage" class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div class="bg-white rounded-2xl border-2 border-border p-3.5 shadow-sm">
          <span class="text-[11px] font-bold text-text-muted block">Total Beban</span>
          <strong class="text-base sm:text-lg font-black text-navy block mt-1 truncate">
            {{ formatCurrency(displayedSummary.totalDepreciation) }}
          </strong>
          <small class="text-[10px] text-text-secondary block mt-0.5">
            {{ currentPostedBatch ? 'Tercatat di ledger' : 'Estimasi pratinjau' }}
          </small>
        </div>
        <div class="bg-white rounded-2xl border-2 border-border p-3.5 shadow-sm">
          <span class="text-[11px] font-bold text-text-muted block">Bagian Usaha (Kos)</span>
          <strong class="text-base sm:text-lg font-black text-emerald-700 block mt-1 truncate">
            {{ formatCurrency(displayedSummary.businessPortion) }}
          </strong>
          <small class="text-[10px] text-emerald-600 block mt-0.5">Beban operasional</small>
        </div>
        <div class="bg-white rounded-2xl border-2 border-border p-3.5 shadow-sm">
          <span class="text-[11px] font-bold text-text-muted block">Bagian Non-Usaha</span>
          <strong class="text-base sm:text-lg font-black text-blue-700 block mt-1 truncate">
            {{ formatCurrency(displayedSummary.nonBusinessPortion) }}
          </strong>
          <small class="text-[10px] text-blue-600 block mt-0.5">Pribadi / Prive</small>
        </div>
        <div class="bg-white rounded-2xl border-2 border-border p-3.5 shadow-sm">
          <span class="text-[11px] font-bold text-text-muted block">Komponen Aset</span>
          <strong class="text-base sm:text-lg font-black text-navy block mt-1">
            {{ displayedSummary.componentCount }}
          </strong>
          <small class="text-[10px] text-text-secondary block mt-0.5">Komponen aktif</small>
        </div>
      </div>

      <!-- KONDISI A: PERIODE SUDAH DIBUKUKAN (POSTED BATCH) -->
      <section v-if="bookkeepingStartDate && currentPostedBatch && !errorMessage" class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-4">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-white bg-emerald-600 px-2 py-0.5 rounded-md">Batch Efektif</span>
              <h2 class="text-base font-black text-navy">Rincian Ledger Penyusutan Resmi</h2>
              <span v-if="currentPostedBatch?.batch_number" class="text-xs font-mono font-bold bg-blue-100 text-blue-900 px-2 py-0.5 rounded-md">
                {{ currentPostedBatch.batch_number }}
              </span>
            </div>
            <p class="text-xs text-text-secondary mt-1">
              Diposting pada {{ formatDateTime(currentPostedBatch.posted_at) }}
              <span v-if="currentPostedBatch.notes">• Catatan: "{{ currentPostedBatch.notes }}"</span>
            </p>
          </div>

          <!-- Tombol Batalkan Batch (Storno Reversal) -->
          <div v-if="canManageBookkeeping">
            <button
              v-if="isLatestActiveBatch"
              type="button"
              @click="openReverseModal"
              class="px-4 py-2 border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl shadow-sm active:scale-95 transition flex items-center gap-1.5"
            >
              <span>↩️</span>
              <span>Batalkan Posting (Storno)</span>
            </button>
            <span v-else class="text-[11px] text-text-muted italic">
              (Hanya batch terakhir yang dapat dibatalkan)
            </span>
          </div>
        </div>

        <!-- Tabel Rincian Baris Ledger -->
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs whitespace-nowrap">
            <thead class="bg-bg-app text-text-secondary font-bold border-b border-border">
              <tr>
                <th class="py-2.5 px-3">No</th>
                <th class="py-2.5 px-3">Nama Aset</th>
                <th class="py-2.5 px-3">Komponen</th>
                <th class="py-2.5 px-3 text-right">Nilai Buku Awal</th>
                <th class="py-2.5 px-3 text-right">Beban Total</th>
                <th class="py-2.5 px-3 text-right">Bagian Usaha</th>
                <th class="py-2.5 px-3 text-right">Bagian Non-Usaha</th>
                <th class="py-2.5 px-3 text-right">Nilai Buku Akhir</th>
                <th class="py-2.5 px-3 text-center">Tipe</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border font-medium">
              <tr v-for="(row, idx) in currentLedgerLines" :key="row.id" class="hover:bg-blue-50/40 transition">
                <td class="py-2 px-3 text-text-muted">{{ idx + 1 }}</td>
                <td class="py-2 px-3 font-bold text-navy">{{ row.assets?.nama_aset || '-' }}</td>
                <td class="py-2 px-3">{{ row.asset_components?.nama_komponen || '-' }}</td>
                <td class="py-2 px-3 text-right">{{ formatCurrency(row.opening_book_value || (Number(row.book_value_ending) + Number(row.depreciation_amount))) }}</td>
                <td class="py-2 px-3 text-right font-black" :class="row.entry_type === 'reversal' ? 'text-red-600' : 'text-navy'">
                  {{ formatCurrency(row.depreciation_amount) }}
                </td>
                <td class="py-2 px-3 text-right font-bold text-emerald-700">{{ formatCurrency(row.business_amount ?? row.business_portion_amount) }}</td>
                <td class="py-2 px-3 text-right text-blue-700">{{ formatCurrency(row.non_business_amount ?? row.non_business_portion_amount) }}</td>
                <td class="py-2 px-3 text-right font-bold text-navy">{{ formatCurrency(row.closing_book_value ?? row.book_value_ending) }}</td>
                <td class="py-2 px-3 text-center">
                  <span
                    class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    :class="row.entry_type === 'reversal' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'"
                  >
                    {{ row.entry_type === 'reversal' ? 'Storno' : 'Depresiasi' }}
                  </span>
                </td>
              </tr>
              <tr v-if="currentLedgerLines.length === 0">
                <td colspan="9" class="py-6 text-center text-text-muted italic">
                  Tidak ada baris penyusutan tercatat (batch bernilai nol).
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- KONDISI B: PERIODE BELUM DIBUKUKAN (PRATINJAU KALKULASI SERVER) -->
      <section v-else-if="bookkeepingStartDate && !currentPostedBatch && !errorMessage" class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-4">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-navy bg-navy/10 px-2 py-0.5 rounded-md">Pratinjau Server</span>
              <h2 class="text-base font-black text-navy">Simulasi Pembukuan Periode Terpilih</h2>
            </div>
            <p class="text-xs text-text-secondary mt-1">
              Dihitung langsung oleh engine server berdasarkan snapshot parameter aktivasi resmi terbaru.
            </p>
          </div>

          <!-- Tombol Posting Penyusutan (Owner/Admin) -->
          <div v-if="canManageBookkeeping">
            <button
              type="button"
              @click="openPostingModal"
              :disabled="hasBlockingIssue || isPosting"
              class="px-5 py-2.5 bg-navy hover:bg-navy-dark active:scale-95 text-white font-bold text-xs rounded-xl shadow transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span>📑</span>
              <span>{{ isPosting ? 'Memposting...' : 'Pratinjau & Bukukan Penyusutan' }}</span>
            </button>
          </div>
        </div>

        <!-- Banner Peringatan Masalah Penghalang Posting -->
        <div
          v-if="blockingIssueMessage"
          class="bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-2xl p-4 shadow-sm flex items-start gap-3"
        >
          <span class="text-2xl flex-shrink-0">⚠️</span>
          <div class="text-xs space-y-1">
            <p class="font-bold text-sm">Tidak Dapat Melakukan Posting</p>
            <p class="text-amber-800 leading-relaxed">{{ blockingIssueMessage }}</p>
          </div>
        </div>

        <!-- Tabel Rincian Pratinjau Server -->
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs whitespace-nowrap">
            <thead class="bg-bg-app text-text-secondary font-bold border-b border-border">
              <tr>
                <th class="py-2.5 px-3">No</th>
                <th class="py-2.5 px-3">Nama Aset</th>
                <th class="py-2.5 px-3">Komponen</th>
                <th class="py-2.5 px-3 text-right">Nilai Buku Awal</th>
                <th class="py-2.5 px-3 text-right">Beban Total</th>
                <th class="py-2.5 px-3 text-right">Bagian Usaha</th>
                <th class="py-2.5 px-3 text-right">Bagian Non-Usaha</th>
                <th class="py-2.5 px-3 text-right">Nilai Buku Akhir</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border font-medium">
              <tr v-for="(item, idx) in previewItems" :key="item.component_id || idx" class="hover:bg-blue-50/40 transition">
                <td class="py-2 px-3 text-text-muted">{{ idx + 1 }}</td>
                <td class="py-2 px-3 font-bold text-navy">{{ item.asset_name || item.nama_aset || '-' }}</td>
                <td class="py-2 px-3">{{ item.component_name || item.nama_komponen || '-' }}</td>
                <td class="py-2 px-3 text-right">{{ formatCurrency(item.opening_book_value || (Number(item.nilai_buku) + Number(item.beban))) }}</td>
                <td class="py-2 px-3 text-right font-black text-navy">{{ formatCurrency(item.depreciation_amount ?? item.beban) }}</td>
                <td class="py-2 px-3 text-right font-bold text-emerald-700">{{ formatCurrency(item.business_amount ?? item.beban_usaha) }}</td>
                <td class="py-2 px-3 text-right text-blue-700">{{ formatCurrency(item.non_business_amount ?? item.beban_non_usaha) }}</td>
                <td class="py-2 px-3 text-right font-bold text-navy">{{ formatCurrency(item.closing_book_value ?? item.nilai_buku) }}</td>
              </tr>
              <tr v-if="previewItems.length === 0">
                <td colspan="8" class="py-6 text-center text-text-muted italic">
                  Tidak ada komponen aktif yang disusutkan pada periode ini.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Riwayat Seluruh Batch Pembukuan -->
      <section v-if="bookkeepingStartDate && !errorMessage" class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-4">
        <div class="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 class="text-base font-black text-navy">Riwayat Batch Pembukuan</h2>
            <p class="text-xs text-text-secondary">Daftar seluruh batch posting resmi dan pembatalan (storno) historis.</p>
          </div>
          <span class="text-xs font-bold text-text-muted">{{ allBatchesList.length }} Batch Tercatat</span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs whitespace-nowrap">
            <thead class="bg-bg-app text-text-secondary font-bold border-b border-border">
              <tr>
                <th class="py-2.5 px-3">No. Batch</th>
                <th class="py-2.5 px-3">Periode</th>
                <th class="py-2.5 px-3">Status</th>
                <th class="py-2.5 px-3 text-right">Total Beban</th>
                <th class="py-2.5 px-3 text-right">Bagian Usaha</th>
                <th class="py-2.5 px-3">Waktu Posting</th>
                <th class="py-2.5 px-3">Catatan / Alasan</th>
                <th class="py-2.5 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border font-medium">
              <tr v-for="b in allBatchesList" :key="b.id" class="hover:bg-blue-50/40 transition">
                <td class="py-2.5 px-3 font-mono font-bold text-navy">{{ b.batch_number || '-' }}</td>
                <td class="py-2.5 px-3 font-bold text-navy">{{ formatPeriodDisplay(b.period_key) }}</td>
                <td class="py-2.5 px-3">
                  <span
                    class="text-[10px] font-black px-2.5 py-0.5 rounded-full"
                    :class="b.batch_status === 'posted' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700 line-through'"
                  >
                    {{ b.batch_status === 'posted' ? 'Posted' : 'Dibatalkan (Reversed)' }}
                  </span>
                </td>
                <td class="py-2.5 px-3 text-right font-black" :class="b.batch_status === 'posted' ? 'text-navy' : 'text-text-muted'">
                  {{ formatCurrency(b.total_depreciation) }}
                </td>
                <td class="py-2.5 px-3 text-right font-bold text-emerald-700">
                  {{ formatCurrency(b.total_business_portion) }}
                </td>
                <td class="py-2.5 px-3 text-text-secondary">{{ formatDateTime(b.posted_at || b.created_at) }}</td>
                <td class="py-2.5 px-3 text-text-secondary max-w-[200px] truncate">
                  {{ b.notes || (b.reversal_reason ? `Alasan: ${b.reversal_reason}` : '-') }}
                </td>
                <td class="py-2.5 px-3 text-center">
                  <button
                    type="button"
                    @click="selectPeriod(b.period_key)"
                    class="text-navy font-bold hover:underline text-xs"
                  >
                    Lihat
                  </button>
                </td>
              </tr>
              <tr v-if="allBatchesList.length === 0">
                <td colspan="8" class="py-6 text-center text-text-muted italic">
                  Belum ada batch pembukuan penyusutan yang pernah diposting.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>

    <!-- MODAL 1: PENGATURAN TANGGAL MULAI PEMBUKUAN -->
    <BaseModal v-if="showStartDateModal" @click.self="showStartDateModal = false">
      <div class="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border-2 border-border space-y-4">
        <div class="flex items-center justify-between border-b border-border pb-3">
          <h3 class="font-black text-base text-navy">Konfigurasi Tanggal Mulai Pembukuan</h3>
          <button type="button" @click="showStartDateModal = false" class="text-text-muted font-bold text-lg">✕</button>
        </div>

        <p class="text-xs text-text-secondary leading-relaxed">
          Tanggal mulai pembukuan menjadi garis batas formal (cutoff) antara penyusutan historis dan penyusutan bulanan yang dibukukan secara resmi.
        </p>

        <div class="space-y-1">
          <label class="block font-bold text-xs text-text-secondary">Tanggal Mulai (YYYY-MM-01)</label>
          <input
            v-model="newStartDateInput"
            type="date"
            class="w-full border-2 border-border rounded-xl p-2.5 text-xs font-semibold"
          />
          <small class="text-[11px] text-text-muted">Tanggal akan dinormalisasi ke hari pertama bulan bersangkutan.</small>
        </div>

        <div v-if="startDateModalError" class="p-2.5 rounded-xl bg-red-50 text-red-700 text-xs font-semibold">
          {{ startDateModalError }}
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            @click="showStartDateModal = false"
            class="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-text-secondary"
          >
            Batal
          </button>
          <button
            type="button"
            @click="saveStartDate"
            :disabled="isSavingStartDate"
            class="px-5 py-2.5 rounded-xl bg-navy text-white text-xs font-bold shadow hover:bg-navy-dark active:scale-95 transition disabled:opacity-50"
          >
            {{ isSavingStartDate ? 'Menyimpan...' : 'Simpan Tanggal' }}
          </button>
        </div>
      </div>
    </BaseModal>

    <!-- MODAL 2: KONFIRMASI POSTING BATCH -->
    <BaseModal v-if="showPostingModal" @click.self="showPostingModal = false">
      <div class="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border-2 border-border space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-border pb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">📑</span>
            <h3 class="font-black text-base text-navy">Konfirmasi Posting Penyusutan</h3>
          </div>
          <button type="button" @click="showPostingModal = false" class="text-text-muted font-bold text-lg">✕</button>
        </div>

        <!-- Peringatan & Perbandingan Perubahan jika Pratinjau Kedaluwarsa (SIMKOS_STALE_PREVIEW) -->
        <div
          v-if="stalePreviewInfo"
          class="p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 text-xs space-y-2"
        >
          <div class="flex items-center gap-1.5 font-black text-amber-900">
            <span>⚠️</span>
            <span>Pratinjau Kedaluwarsa ({{ stalePreviewInfo.code }})</span>
          </div>
          <p class="leading-relaxed text-[11px] text-amber-900">
            Keadaan parameter aset atau saldo awal telah berubah. Pratinjau terbaru telah dimuat dari server. Silakan tinjau perubahan nominal dan rincian berikut sebelum mengonfirmasi ulang:
          </p>
          <div class="bg-white rounded-xl p-2.5 border border-amber-200 space-y-1 text-[11px]">
            <div class="flex justify-between">
              <span class="text-text-muted">Total Beban:</span>
              <span>
                <span class="line-through text-text-muted mr-1">{{ formatCurrency(stalePreviewInfo.previous.totalDepreciation) }}</span>
                <strong class="text-navy font-black">→ {{ formatCurrency(stalePreviewInfo.latest.totalDepreciation) }}</strong>
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Beban Usaha:</span>
              <span>
                <span class="line-through text-text-muted mr-1">{{ formatCurrency(stalePreviewInfo.previous.businessPortion) }}</span>
                <strong class="text-emerald-700 font-black">→ {{ formatCurrency(stalePreviewInfo.latest.businessPortion) }}</strong>
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Beban Non-Usaha:</span>
              <span>
                <span class="line-through text-text-muted mr-1">{{ formatCurrency(stalePreviewInfo.previous.nonBusinessPortion) }}</span>
                <strong class="text-blue-700 font-black">→ {{ formatCurrency(stalePreviewInfo.latest.nonBusinessPortion) }}</strong>
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Jumlah Komponen:</span>
              <span>
                <span class="line-through text-text-muted mr-1">{{ stalePreviewInfo.previous.componentCount }}</span>
                <strong class="text-navy font-black">→ {{ stalePreviewInfo.latest.componentCount }} komponen</strong>
              </span>
            </div>
          </div>
        </div>

        <div class="bg-bg-app rounded-2xl p-4 space-y-2 text-xs border border-border">
          <div class="flex justify-between py-1">
            <span class="text-text-muted">Periode:</span>
            <strong class="text-navy font-black">{{ formatPeriodDisplay(selectedPeriodKey) }} ({{ selectedPeriodKey }})</strong>
          </div>
          <div class="flex justify-between py-1">
            <span class="text-text-muted">Total Beban Penyusutan:</span>
            <strong class="text-navy font-black">{{ formatCurrency(previewData?.total_depreciation) }}</strong>
          </div>
          <div class="flex justify-between py-1">
            <span class="text-text-muted">Beban Usaha (Kos):</span>
            <strong class="text-emerald-700 font-black">{{ formatCurrency(previewData?.total_business_portion) }}</strong>
          </div>
          <div class="flex justify-between py-1">
            <span class="text-text-muted">Beban Non-Usaha (Prive):</span>
            <strong class="text-blue-700 font-black">{{ formatCurrency(previewData?.total_non_business_portion) }}</strong>
          </div>
          <div class="flex justify-between py-1">
            <span class="text-text-muted">Jumlah Komponen:</span>
            <strong class="text-text-primary">{{ previewItems.length }} komponen</strong>
          </div>

          <!-- Rincian Komponen pada Modal Konfirmasi -->
          <div v-if="previewItems.length > 0" class="pt-2 border-t border-border space-y-1.5">
            <span class="text-[11px] font-bold text-text-secondary block">Rincian Komponen Pratinjau Terbaru:</span>
            <div
              v-for="item in previewItems"
              :key="item.component_id"
              class="flex items-center justify-between text-[11px] bg-white px-2.5 py-1.5 rounded-lg border border-border/70"
            >
              <span class="font-bold text-navy truncate max-w-[170px]">{{ item.nama_komponen }}</span>
              <span class="font-black text-navy">{{ formatCurrency(item.beban ?? item.depreciation_amount) }}</span>
            </div>
          </div>
        </div>

        <div class="space-y-1 text-xs">
          <label class="block font-bold text-text-secondary">Catatan Pembukuan (Opsional)</label>
          <input
            v-model="postingNotes"
            type="text"
            :disabled="isPosting || isRetryWithSameKey"
            placeholder="Contoh: Pembukuan penyusutan rutin bulanan"
            class="w-full border-2 border-border rounded-xl p-2.5 font-semibold text-xs disabled:bg-gray-100"
          />
        </div>

        <div v-if="postingModalError" class="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold leading-relaxed">
          {{ postingModalError }}
        </div>

        <p class="text-[11px] text-text-muted leading-relaxed">
          🛡️ Transaksi ini akan mencatat baris penyusutan resmi ke buku pembantu dan mengunci periode dari penyesuaian langsung. Permintaan dilindungi kunci idempotensi unik server (<code class="text-[10px]">{{ currentIdempotencyKey }}</code>).
        </p>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            @click="showPostingModal = false"
            class="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-text-secondary"
          >
            Batal
          </button>
          <button
            type="button"
            @click="executePosting"
            :disabled="isPosting || hasBlockingIssue"
            class="px-5 py-2.5 rounded-xl bg-navy text-white text-xs font-bold shadow hover:bg-navy-dark active:scale-95 transition disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>{{ isPosting ? 'Memproses...' : 'Konfirmasi & Bukukan' }}</span>
          </button>
        </div>
      </div>
    </BaseModal>

    <!-- MODAL 3: PEMBATALAN BATCH (STORNO REVERSAL) -->
    <BaseModal v-if="showReverseModal" @click.self="showReverseModal = false">
      <div class="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border-2 border-border space-y-4">
        <div class="flex items-center justify-between border-b border-border pb-3">
          <div class="flex items-center gap-2 text-red-600">
            <span class="text-xl">↩️</span>
            <h3 class="font-black text-base text-navy">Batalkan Batch (Storno Reversal)</h3>
          </div>
          <button type="button" @click="showReverseModal = false" class="text-text-muted font-bold text-lg">✕</button>
        </div>

        <div class="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-900 space-y-1.5">
          <p class="font-bold text-sm">Dampak Pembatalan Batch:</p>
          <p class="leading-relaxed">
            Pembatalan akan menerbitkan entri storno (reversal negatif) di buku pembantu penyusutan secara atomik dan membuka kembali periode <b>{{ formatPeriodDisplay(selectedPeriodKey) }}</b>. Riwayat batch tetap dipertahankan dan tidak akan dihapus.
          </p>
        </div>

        <div class="space-y-1 text-xs">
          <label class="block font-bold text-text-secondary">Alasan Pembatalan *</label>
          <textarea
            v-model="reverseReason"
            rows="2"
            placeholder="Jelaskan alasan pembatalan batch ini..."
            class="w-full border-2 border-border rounded-xl p-2.5 font-semibold text-xs"
          ></textarea>
        </div>

        <div v-if="reverseModalError" class="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          {{ reverseModalError }}
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            @click="showReverseModal = false"
            class="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-text-secondary"
          >
            Batal
          </button>
          <button
            type="button"
            @click="executeReversal"
            :disabled="isReversing || !reverseReason.trim()"
            class="px-5 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold shadow hover:bg-red-700 active:scale-95 transition disabled:opacity-50"
          >
            {{ isReversing ? 'Membatalkan...' : 'Konfirmasi Batalkan' }}
          </button>
        </div>
      </div>
    </BaseModal>

    <!-- MODAL 4: PENGUNCIAN / PEMBUKAAN PERIODE -->
    <BaseModal v-if="showLockModal" @click.self="showLockModal = false">
      <div class="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border-2 border-border space-y-4">
        <div class="flex items-center justify-between border-b border-border pb-3">
          <h3 class="font-black text-base text-navy">
            {{ isPeriodLocked ? 'Buka Kunci Periode' : 'Kunci Periode Pembukuan' }}
          </h3>
          <button type="button" @click="showLockModal = false" class="text-text-muted font-bold text-lg">✕</button>
        </div>

        <p class="text-xs text-text-secondary leading-relaxed">
          {{
            isPeriodLocked
              ? `Membuka kunci periode ${formatPeriodDisplay(selectedPeriodKey)} akan mengizinkan kembali mutasi atau pembukuan pada periode ini.`
              : `Mengunci periode ${formatPeriodDisplay(selectedPeriodKey)} akan mencegah mutasi baru, revisi parameter, maupun posting baru pada periode ini.`
          }}
        </p>

        <div class="space-y-1 text-xs">
          <label class="block font-bold text-text-secondary">
            {{ isPeriodLocked ? 'Alasan Pembukaan Kunci *' : 'Catatan Penguncian (Opsional)' }}
          </label>
          <input
            v-model="lockReasonInput"
            type="text"
            :placeholder="isPeriodLocked ? 'Masukkan alasan pembukaan kunci...' : 'Catatan penguncian...'"
            class="w-full border-2 border-border rounded-xl p-2.5 font-semibold text-xs"
          />
        </div>

        <div v-if="lockModalError" class="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          {{ lockModalError }}
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            @click="showLockModal = false"
            class="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-text-secondary"
          >
            Batal
          </button>
          <button
            type="button"
            @click="executeToggleLock"
            :disabled="isTogglingLock || (isPeriodLocked && !lockReasonInput.trim())"
            class="px-5 py-2.5 rounded-xl bg-navy text-white text-xs font-bold shadow hover:bg-navy-dark active:scale-95 transition disabled:opacity-50"
          >
            {{ isTogglingLock ? 'Memproses...' : (isPeriodLocked ? 'Konfirmasi Buka Kunci' : 'Konfirmasi Kunci Periode') }}
          </button>
        </div>
      </div>
    </BaseModal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../supabase.js'
import BaseModal from '../components/BaseModal.vue'
import { getCurrentUserRole } from '../lib/aset.js'
import { getCurrentOrgId } from '../lib/storage.js'
import {
  formatPeriodKey,
  getNextPeriodKey,
  getPrevPeriodKey,
  formatPeriodDisplay,
  getBookkeepingErrorCode,
  isStalePreviewError,
  formatBookkeepingError,
  getCanonicalPayloadHash,
  generateIdempotencyKey,
  fetchBookkeepingSettings,
  setBookkeepingStartDate,
  previewDepreciationPosting,
  postDepreciationBatch,
  reverseDepreciationBatch,
  lockBookkeepingPeriod,
  unlockBookkeepingPeriod,
  fetchBatchHistory,
  fetchBatchLedger,
  fetchPeriodLock,
} from '../lib/pembukuanAset.js'

const router = useRouter()
const route = useRoute()

// State Organisasi & Pengguna
const orgId = ref(null)
const currentUserRole = ref(null)
const isLoading = ref(true)
const errorMessage = ref('')
const successMessage = ref('')

// State Tanggal Mulai Pembukuan & Periode
const bookkeepingStartDate = ref(null)
const selectedPeriodKey = ref(formatPeriodKey(new Date().getFullYear(), new Date().getMonth() + 1))
const isPeriodLocked = ref(false)
const periodLockRecord = ref(null)

// State Batch & Ledger
const allBatchesList = ref([])
const currentPostedBatch = ref(null)
const currentLedgerLines = ref([])

// State Pratinjau Server
const previewData = ref(null)
const previewItems = ref([])
const blockingIssueMessage = ref('')

// Modal States
const showStartDateModal = ref(false)
const newStartDateInput = ref('')
const isSavingStartDate = ref(false)
const startDateModalError = ref('')

const showPostingModal = ref(false)
const postingNotes = ref('')
const isPosting = ref(false)
const postingModalError = ref('')
const currentIdempotencyKey = ref('')
const isRetryWithSameKey = ref(false)
const stalePreviewInfo = ref(null)

const showReverseModal = ref(false)
const reverseReason = ref('')
const isReversing = ref(false)
const reverseModalError = ref('')

const showLockModal = ref(false)
const lockReasonInput = ref('')
const isTogglingLock = ref(false)
const lockModalError = ref('')

// Computed Hak Akses
const canManageBookkeeping = computed(() => {
  return currentUserRole.value === 'owner' || currentUserRole.value === 'admin'
})

// Apakah batch yang dilihat adalah batch posted aktif terakhir (bisa dibatalkan)
const isLatestActiveBatch = computed(() => {
  if (!currentPostedBatch.value) return false
  const activeBatches = allBatchesList.value.filter(b => b.batch_status === 'posted')
  if (activeBatches.length === 0) return false
  return activeBatches[0].id === currentPostedBatch.value.id
})

// Apakah ada masalah yang menghalangi posting pratinjau
const hasBlockingIssue = computed(() => {
  if (isPeriodLocked.value) return true
  if (blockingIssueMessage.value) return true
  if (!previewData.value) return true
  return false
})

// Ringkasan Angka yang Ditampilkan
const displayedSummary = computed(() => {
  if (currentPostedBatch.value) {
    return {
      totalDepreciation: Number(currentPostedBatch.value.total_depreciation) || 0,
      businessPortion: Number(currentPostedBatch.value.total_business_portion) || 0,
      nonBusinessPortion: Number(currentPostedBatch.value.total_non_business_portion) || 0,
      componentCount: currentLedgerLines.value.length,
    }
  }
  if (previewData.value) {
    return {
      totalDepreciation: Number(previewData.value.total_depreciation) || 0,
      businessPortion: Number(previewData.value.total_business_portion) || 0,
      nonBusinessPortion: Number(previewData.value.total_non_business_portion) || 0,
      componentCount: previewItems.value.length,
    }
  }
  return {
    totalDepreciation: 0,
    businessPortion: 0,
    nonBusinessPortion: 0,
    componentCount: 0,
  }
})

// Formatting Helpers
function formatCurrency(val) {
  if (val === null || val === undefined) return 'Rp0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val)
}

function formatBookkeepingDate(dateStr) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(d)
}

function formatDateTime(dtStr) {
  if (!dtStr) return '-'
  const d = new Date(dtStr)
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

// Navigasi Periode
function goToPrevPeriod() {
  selectedPeriodKey.value = getPrevPeriodKey(selectedPeriodKey.value)
  loadPeriodDetails()
}

function goToNextPeriod() {
  selectedPeriodKey.value = getNextPeriodKey(selectedPeriodKey.value)
  loadPeriodDetails()
}

function selectPeriod(periodKey) {
  selectedPeriodKey.value = periodKey
  loadPeriodDetails()
}

// Lifecycle & Data Loading
onMounted(async () => {
  await loadAllData()
})

async function loadAllData() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    currentUserRole.value = await getCurrentUserRole(supabase)
    orgId.value = await getCurrentOrgId()

    // Ambil setting tanggal mulai pembukuan
    bookkeepingStartDate.value = await fetchBookkeepingSettings(supabase, orgId.value)

    if (bookkeepingStartDate.value) {
      if (route.query.period) {
        selectedPeriodKey.value = String(route.query.period)
      } else {
        const batches = await fetchBatchHistory(supabase, { orgId: orgId.value })
        const latestPosted = batches.find(b => b.batch_status === 'posted')
        if (latestPosted) {
          selectedPeriodKey.value = latestPosted.period_key
        } else {
          selectedPeriodKey.value = bookkeepingStartDate.value.slice(0, 7)
        }
      }
    }

    await loadPeriodDetails()
  } catch (err) {
    console.error('[BukuPenyusutan] Gagal memuat data:', err)
    errorMessage.value = formatBookkeepingError(err)
  } finally {
    isLoading.value = false
  }
}

async function loadPeriodDetails() {
  if (!orgId.value || !bookkeepingStartDate.value) return

  blockingIssueMessage.value = ''
  currentPostedBatch.value = null
  currentLedgerLines.value = []
  previewData.value = null
  previewItems.value = []

  try {
    // 1. Ambil riwayat batch seluruh organisasi
    allBatchesList.value = await fetchBatchHistory(supabase, { orgId: orgId.value })

    // 2. Cek apakah periode ini terkunci
    periodLockRecord.value = await fetchPeriodLock(supabase, {
      orgId: orgId.value,
      periodKey: selectedPeriodKey.value,
    })
    isPeriodLocked.value = !!periodLockRecord.value

    // 3. Cek apakah ada batch berstatus 'posted' di periode ini
    const batchInPeriod = allBatchesList.value.find(
      b => b.period_key === selectedPeriodKey.value && b.batch_status === 'posted'
    )

    if (batchInPeriod) {
      // Periode sudah dibukukan!
      currentPostedBatch.value = batchInPeriod
      currentLedgerLines.value = await fetchBatchLedger(supabase, { batchId: batchInPeriod.id })
    } else {
      // Periode terbuka / belum dibukukan -> Panggil preview server
      try {
        const pData = await previewDepreciationPosting(supabase, {
          orgId: orgId.value,
          periodKey: selectedPeriodKey.value,
        })
        previewData.value = pData
        previewItems.value = pData.eligible_components || pData.items || []
      } catch (prevErr) {
        // Tangani masalah yang menghalangi posting (misal SIMKOS_REAPPROVAL_REQUIRED, SIMKOS_GAP_DETECTED)
        blockingIssueMessage.value = formatBookkeepingError(prevErr)
      }
    }
  } catch (err) {
    console.error('[BukuPenyusutan] Gagal memuat rincian periode:', err)
    errorMessage.value = formatBookkeepingError(err)
  }
}

// Modal Aksi: Tanggal Mulai
function openStartDateModal() {
  newStartDateInput.value = bookkeepingStartDate.value || `${new Date().getFullYear()}-01-01`
  startDateModalError.value = ''
  showStartDateModal.value = true
}

async function saveStartDate() {
  if (!newStartDateInput.value) {
    startDateModalError.value = 'Tanggal mulai pembukuan wajib diisi'
    return
  }
  isSavingStartDate.value = true
  startDateModalError.value = ''
  try {
    await setBookkeepingStartDate(supabase, {
      orgId: orgId.value,
      startDate: newStartDateInput.value,
    })
    bookkeepingStartDate.value = newStartDateInput.value
    showStartDateModal.value = false
    successMessage.value = 'Tanggal mulai pembukuan berhasil dikonfigurasi!'
    await loadAllData()
  } catch (err) {
    startDateModalError.value = formatBookkeepingError(err)
  } finally {
    isSavingStartDate.value = false
  }
}

// Modal Aksi: Posting Batch
function openPostingModal() {
  if (!previewData.value || hasBlockingIssue.value) return
  postingNotes.value = ''
  postingModalError.value = ''
  stalePreviewInfo.value = null
  isRetryWithSameKey.value = false
  // Generate idempotency key baru saat modal dibuka
  currentIdempotencyKey.value = generateIdempotencyKey(orgId.value, selectedPeriodKey.value)
  showPostingModal.value = true
}

async function executePosting() {
  if (isPosting.value || hasBlockingIssue.value) return // Cegah klik ganda
  isPosting.value = true
  postingModalError.value = ''

  // Rekam keadaan pratinjau sebelum pengiriman untuk pembanding jika terjadi SIMKOS_STALE_PREVIEW
  const previousPreviewSnapshot = {
    previewToken: previewData.value?.preview_token,
    totalDepreciation: Number(previewData.value?.total_depreciation) || 0,
    businessPortion: Number(previewData.value?.total_business_portion) || 0,
    nonBusinessPortion: Number(previewData.value?.total_non_business_portion) || 0,
    componentCount: previewItems.value.length,
    items: previewItems.value.map(item => ({ ...item })),
  }

  try {
    const payloadHash = getCanonicalPayloadHash(
      orgId.value,
      selectedPeriodKey.value,
      postingNotes.value
    )

    isRetryWithSameKey.value = true

    await postDepreciationBatch(supabase, {
      orgId: orgId.value,
      periodKey: selectedPeriodKey.value,
      idempotencyKey: currentIdempotencyKey.value, // Digunakan kembali saat retry jaringan
      payloadHash,
      previewToken: previewData.value.preview_token,
      notes: postingNotes.value,
    })

    showPostingModal.value = false
    stalePreviewInfo.value = null
    isRetryWithSameKey.value = false
    successMessage.value = `Penyusutan periode ${formatPeriodDisplay(selectedPeriodKey.value)} berhasil diposting!`
    await loadPeriodDetails()
  } catch (err) {
    console.error('[BukuPenyusutan] Gagal posting:', err)
    const errCode = getBookkeepingErrorCode(err)
    const errText = formatBookkeepingError(err)

    // Tangani SIMKOS_STALE_PREVIEW secara eksplisit berdasarkan kode server, bukan kalimat terjemahan
    if (errCode === 'SIMKOS_STALE_PREVIEW' || isStalePreviewError(err)) {
      postingModalError.value = errText
      try {
        const fresh = await previewDepreciationPosting(supabase, {
          orgId: orgId.value,
          periodKey: selectedPeriodKey.value,
        })
        const freshItems = fresh.eligible_components || fresh.items || []
        previewData.value = fresh
        previewItems.value = freshItems
        // Buat kunci idempotensi baru karena keadaan pratinjau telah berubah dan wajib dikonfirmasi ulang
        currentIdempotencyKey.value = generateIdempotencyKey(orgId.value, selectedPeriodKey.value)
        isRetryWithSameKey.value = false
        stalePreviewInfo.value = {
          code: 'SIMKOS_STALE_PREVIEW',
          previous: previousPreviewSnapshot,
          latest: {
            previewToken: fresh.preview_token,
            totalDepreciation: Number(fresh.total_depreciation) || 0,
            businessPortion: Number(fresh.total_business_portion) || 0,
            nonBusinessPortion: Number(fresh.total_non_business_portion) || 0,
            componentCount: freshItems.length,
            items: freshItems,
          },
        }
      } catch (rfErr) {
        previewData.value = null
        previewItems.value = []
        stalePreviewInfo.value = null
        isRetryWithSameKey.value = false
        const rfText = formatBookkeepingError(rfErr)
        blockingIssueMessage.value = rfText
        postingModalError.value = rfText
      }
    } else {
      // Pada galat jaringan, currentIdempotencyKey dipertahankan untuk retry idempoten yang aman
      postingModalError.value = errText
    }
  } finally {
    isPosting.value = false
  }
}

// Modal Aksi: Pembatalan Batch
function openReverseModal() {
  if (!currentPostedBatch.value || !isLatestActiveBatch.value) return
  reverseReason.value = ''
  reverseModalError.value = ''
  showReverseModal.value = true
}

async function executeReversal() {
  if (isReversing.value || !reverseReason.value.trim()) return
  isReversing.value = true
  reverseModalError.value = ''

  try {
    await reverseDepreciationBatch(supabase, {
      batchId: currentPostedBatch.value.id,
      reason: reverseReason.value.trim(),
    })

    showReverseModal.value = false
    successMessage.value = `Batch periode ${formatPeriodDisplay(selectedPeriodKey.value)} berhasil dibatalkan (storno)!`
    await loadPeriodDetails()
  } catch (err) {
    console.error('[BukuPenyusutan] Gagal membatalkan batch:', err)
    reverseModalError.value = formatBookkeepingError(err)
  } finally {
    isReversing.value = false
  }
}

// Modal Aksi: Kunci / Buka Periode
function openLockModal() {
  lockReasonInput.value = ''
  lockModalError.value = ''
  showLockModal.value = true
}

async function executeToggleLock() {
  if (isTogglingLock.value) return
  isTogglingLock.value = true
  lockModalError.value = ''

  try {
    if (isPeriodLocked.value) {
      await unlockBookkeepingPeriod(supabase, {
        orgId: orgId.value,
        periodKey: selectedPeriodKey.value,
        reason: lockReasonInput.value.trim(),
      })
      successMessage.value = `Kunci periode ${formatPeriodDisplay(selectedPeriodKey.value)} berhasil dibuka.`
    } else {
      await lockBookkeepingPeriod(supabase, {
        orgId: orgId.value,
        periodKey: selectedPeriodKey.value,
        notes: lockReasonInput.value.trim(),
      })
      successMessage.value = `Periode ${formatPeriodDisplay(selectedPeriodKey.value)} berhasil dikunci.`
    }

    showLockModal.value = false
    await loadPeriodDetails()
  } catch (err) {
    console.error('[BukuPenyusutan] Gagal mengubah kunci periode:', err)
    lockModalError.value = formatBookkeepingError(err)
  } finally {
    isTogglingLock.value = false
  }
}
</script>
