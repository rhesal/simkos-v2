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

      <!-- Notifikasi Sukses -->
      <div
        v-if="successNotification"
        class="bg-emerald-50 border-2 border-emerald-300 text-emerald-900 rounded-2xl p-3.5 shadow-sm flex items-center justify-between gap-2 text-xs font-bold"
      >
        <div class="flex items-center gap-2">
          <span>✅</span>
          <span>{{ successNotification }}</span>
        </div>
        <button type="button" @click="successNotification = ''" class="text-emerald-700 hover:text-emerald-900">✕</button>
      </div>

      <!-- Banner Status Khusus: Perlu Pengesahan Ulang -->
      <div
        v-if="asset.status_pencatatan === 'perlu_pengesahan_ulang'"
        class="bg-amber-50 border-2 border-amber-300 text-amber-900 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      >
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">⚠️</span>
          <div>
            <p class="font-bold text-sm text-amber-900">Aset Memerlukan Pengesahan Ulang</p>
            <p class="text-xs text-amber-800 mt-0.5">Parameter finansial telah direvisi. Aset ini diblokir dari pembukuan sampai disahkan ulang.</p>
          </div>
        </div>
        <button
          v-if="canManageAssets"
          type="button"
          @click="openActivateModal"
          class="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5"
        >
          <span>✍️</span>
          <span>Sahkan Ulang Aset</span>
        </button>
      </div>

      <!-- Banner Status Draf: Siap Aktivasi -->
      <div
        v-else-if="asset.status_pencatatan === 'draft' && completeness.isComplete"
        class="bg-blue-50 border-2 border-blue-200 text-blue-900 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      >
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">📋</span>
          <div>
            <p class="font-bold text-sm text-blue-900">Data Aset Lengkap — Siap Diaktivasi</p>
            <p class="text-xs text-blue-700 mt-0.5">Aktivasi akan membekukan parameter ke snapshot resmi untuk pembukuan penyusutan.</p>
          </div>
        </div>
        <button
          v-if="canManageAssets"
          type="button"
          @click="openActivateModal"
          class="px-4 py-2 bg-navy hover:bg-navy-dark active:scale-95 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5"
        >
          <span>🚀</span>
          <span>Aktivasi Aset (Resmi)</span>
        </button>
      </div>

      <!-- Banner Status Aktif: Info Snapshot & Link Buku Pembantu -->
      <div
        v-else-if="asset.status_pencatatan === 'aktif'"
        class="bg-emerald-50 border-2 border-emerald-200 text-emerald-900 rounded-2xl p-3.5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
      >
        <div class="flex items-center gap-2">
          <span>🟢</span>
          <span><b>Aset Aktif Resmi</b> (Snapshot v{{ latestSnapshotVersion || 1 }})</span>
        </div>
        <router-link
          to="/aset/buku-pembantu"
          class="font-bold text-navy hover:underline flex items-center gap-1"
        >
          <span>Buka Buku Pembantu Penyusutan</span>
          <span>›</span>
        </router-link>
      </div>

      <!-- Kartu Komponen & Riwayat Pengembangan -->
      <div class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-black text-navy">Komponen & Riwayat Perolehan</h3>
            <p class="text-xs text-text-muted">Rincian perolehan awal, penambahan, dan peningkatan aset.</p>
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

            <!-- Action Bar Komponen Pembukuan -->
            <div class="flex items-center justify-between gap-2 pt-2 border-t border-border/60 flex-wrap">
              <!-- Indikator Saldo Awal Historis -->
              <div v-if="isComponentHistorical(comp)" class="space-y-1">
                <div v-if="comp.approvedOB" class="flex items-center gap-1.5 flex-wrap">
                  <span
                    class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800"
                  >
                    ✅ Saldo Awal Disahkan ({{ comp.approvedOB.jalur_saldo === 'catatan_terdahulu' ? 'Catatan Terdahulu / Manual' : 'Historis' }} • v{{ comp.approvedOB.version || 1 }})
                  </span>
                  <button
                    v-if="canManageAssets && asset.status_pencatatan !== 'perlu_pengesahan_ulang'"
                    type="button"
                    @click="openOBModal(comp)"
                    class="text-[10px] font-bold text-navy hover:underline bg-white px-2 py-0.5 border border-border rounded shadow-xs"
                  >
                    Sahkan Saldo Awal
                  </button>
                </div>
                <div v-if="comp.approvedOB" class="text-[10px] text-text-secondary font-semibold">
                  <span>Akumulasi Awal: {{ formatCurrency(comp.approvedOB.akumulasi_penyusutan_awal) }} • Nilai Buku Awal: {{ formatCurrency(comp.approvedOB.nilai_buku_awal) }}</span>
                  <span v-if="comp.approvedOB.catatan_sumber" class="ml-1 italic">• Sumber: "{{ comp.approvedOB.catatan_sumber }}"</span>
                </div>
                <div v-else class="flex items-center gap-1.5">
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    🟡 Saldo Awal Belum Disahkan
                  </span>
                  <button
                    v-if="canManageAssets && asset.status_pencatatan !== 'perlu_pengesahan_ulang'"
                    type="button"
                    @click="openOBModal(comp)"
                    class="text-[10px] font-bold text-navy hover:underline bg-white px-2 py-0.5 border border-border rounded shadow-xs"
                  >
                    Sahkan Saldo Awal
                  </button>
                </div>
              </div>
              <div v-else>
                <span class="text-[10px] font-semibold text-text-muted">Komponen Non-Historis</span>
              </div>

              <!-- Tombol Revisi Parameter (Owner/Admin) -->
              <div v-if="canManageAssets && asset.status_pencatatan !== 'draft'">
                <button
                  type="button"
                  @click="openReviseModal(comp)"
                  class="text-[10px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg border border-amber-300 transition"
                >
                  ✏️ Revisi Parameter
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Kartu Simulasi Penyusutan Aset -->
      <section class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-4">
        <!-- Header Simulasi -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-black text-navy">Simulasi Penyusutan Aset</h3>
              <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                Simulasi — belum dibukukan
              </span>
            </div>
            <p class="text-xs text-text-muted mt-0.5">
              Pratinjau perhitungan beban penyusutan garis lurus bulanan dan tahunan secara interaktif.
            </p>
          </div>
        </div>

        <div v-if="componentsList.length === 0" class="p-6 text-center text-text-muted text-xs">
          Belum ada komponen biaya untuk disimulasikan. Tambahkan komponen biaya perolehan terlebih dahulu.
        </div>

        <div v-else class="space-y-4">
          <!-- Selector Tab Komponen (jika > 1 komponen) -->
          <div v-if="componentsList.length > 1" class="flex flex-wrap gap-1.5 border-b border-border pb-3">
            <button
              type="button"
              @click="selectSimTab('all')"
              class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              :class="activeSimTab === 'all'
                ? 'bg-navy text-white shadow-sm'
                : 'bg-gray-100 text-text-secondary hover:bg-gray-200'"
            >
              📊 Ringkasan Gabungan Aset
            </button>
            <button
              v-for="comp in componentsList"
              :key="'tab-' + comp.id"
              type="button"
              @click="selectSimTab(comp.id)"
              class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all truncate max-w-[200px]"
              :class="activeSimTab === comp.id
                ? 'bg-navy text-white shadow-sm'
                : 'bg-gray-100 text-text-secondary hover:bg-gray-200'"
            >
              {{ comp.nama_komponen }}
            </button>
          </div>

          <!-- TAMPILAN 1: SIMULATOR KOMPONEN INDIVIDUAL -->
          <div v-if="activeSimTab !== 'all' && selectedComponent" class="space-y-4">
            <!-- Alert jika komponen tidak disusutkan -->
            <div
              v-if="selectedComponentCalc?.status === 'TIDAK_DISUSUTKAN'"
              class="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-text-secondary space-y-1"
            >
              <div class="font-bold text-text-primary flex items-center gap-1.5">
                <span>ℹ️</span>
                <span>Komponen Tidak Disusutkan</span>
              </div>
              <p>{{ selectedComponentCalc.alasan }}</p>
            </div>

            <div v-else class="space-y-4">
              <!-- Alert jika berstatus perlu telaah -->
              <div
                v-if="selectedComponent.status_kapitalisasi === 'perlu_telaah' || selectedComponent.jenis_pekerjaan === 'lainnya'"
                class="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-1"
              >
                <div class="font-bold flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>Perlu Telaah Pembukuan</span>
                </div>
                <p>
                  Komponen berstatus perlu telaah. Simulasi dijalankan dengan asumsi dikapitalisasi; tentukan perlakuan definitif sebelum pembukuan.
                </p>
              </div>

              <!-- Form Parameter Simulasi In-Memory -->
              <div class="p-4 rounded-2xl bg-gray-50/80 border border-border space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold text-navy">Parameter Simulasi Interaktif</span>
                  <button
                    type="button"
                    @click="resetSimParamsToCurrentComponent()"
                    class="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline flex items-center gap-1"
                    title="Kembalikan semua nilai ke data tersimpan di database"
                  >
                    <span>↺</span>
                    <span>Kembalikan ke data tersimpan</span>
                  </button>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label class="block font-bold text-text-secondary mb-1">Biaya Perolehan (Rp)</label>
                    <input
                      v-model.number="simParams.biaya_perolehan"
                      type="number"
                      min="0"
                      placeholder="Biaya perolehan..."
                      class="w-full border-2 border-border bg-white rounded-xl p-2 font-bold text-text-primary focus:border-navy outline-none"
                    />
                  </div>
                  <div>
                    <label class="block font-bold text-text-secondary mb-1">Nilai Sisa / Residu (Rp)</label>
                    <input
                      v-model.number="simParams.nilai_sisa"
                      type="number"
                      min="0"
                      placeholder="0"
                      class="w-full border-2 border-border bg-white rounded-xl p-2 font-bold text-text-primary focus:border-navy outline-none"
                    />
                  </div>
                  <div>
                    <label class="block font-bold text-text-secondary mb-1">Tanggal Siap Guna</label>
                    <input
                      v-model="simParams.tanggal_siap_guna"
                      type="date"
                      class="w-full border-2 border-border bg-white rounded-xl p-2 font-bold text-text-primary focus:border-navy outline-none"
                    />
                  </div>
                  <div>
                    <label class="block font-bold text-text-secondary mb-1">Masa Manfaat (Bulan)</label>
                    <input
                      v-model.number="simParams.masa_manfaat_bulan"
                      type="number"
                      min="1"
                      placeholder="Contoh: 60"
                      class="w-full border-2 border-border bg-white rounded-xl p-2 font-bold text-text-primary focus:border-navy outline-none"
                    />
                  </div>
                </div>

                <!-- Preset Umur Ekonomis Cepat -->
                <div class="space-y-1.5 pt-1">
                  <div class="flex items-center justify-between text-[11px]">
                    <span class="font-bold text-text-muted">Pilihan Preset Umur Ekonomis:</span>
                  </div>
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <button
                      v-for="preset in PRESET_UMUR_EKONOMIS"
                      :key="'preset-' + preset.bulan"
                      type="button"
                      @click="applyPresetUmur(preset.bulan)"
                      class="px-2 py-1.5 rounded-lg border text-[11px] font-bold text-center transition-all"
                      :class="simParams.masa_manfaat_bulan === preset.bulan
                        ? 'bg-navy text-white border-navy'
                        : 'bg-white text-navy border-border hover:bg-gray-50'"
                    >
                      {{ preset.label }}
                    </button>
                  </div>
                  <p class="text-[10px] text-text-muted italic">
                    Contoh umur ekonomis (bukan aturan pajak, dapat disesuaikan).
                  </p>
                </div>

                <!-- Pengaturan Porsi Usaha -->
                <div class="space-y-1.5 pt-1 border-t border-border/60">
                  <div class="flex items-center justify-between flex-wrap gap-1">
                    <label class="block font-bold text-text-secondary text-xs">
                      Porsi Usaha (%)
                      <span v-if="simParams.porsi_usaha_persen === null" class="text-amber-700 font-semibold text-[11px] ml-1">
                        (Belum Ditentukan)
                      </span>
                    </label>
                    <div class="flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        @click="simParams.porsi_usaha_persen = 100"
                        class="px-2 py-0.5 rounded text-[10px] font-bold border border-border bg-white hover:bg-gray-100"
                        :class="simParams.porsi_usaha_persen === 100 ? 'bg-navy text-white border-navy' : ''"
                      >
                        100% Usaha
                      </button>
                      <button
                        type="button"
                        @click="simParams.porsi_usaha_persen = 50"
                        class="px-2 py-0.5 rounded text-[10px] font-bold border border-border bg-white hover:bg-gray-100"
                        :class="simParams.porsi_usaha_persen === 50 ? 'bg-navy text-white border-navy' : ''"
                      >
                        50% Sebagian
                      </button>
                      <button
                        type="button"
                        @click="simParams.porsi_usaha_persen = 0"
                        class="px-2 py-0.5 rounded text-[10px] font-bold border border-border bg-white hover:bg-gray-100"
                        :class="simParams.porsi_usaha_persen === 0 ? 'bg-navy text-white border-navy' : ''"
                      >
                        0% Non-Usaha
                      </button>
                      <button
                        type="button"
                        @click="simParams.porsi_usaha_persen = null"
                        class="px-2 py-0.5 rounded text-[10px] font-bold border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                        :class="simParams.porsi_usaha_persen === null ? 'ring-2 ring-amber-400' : ''"
                      >
                        Kosongkan
                      </button>
                    </div>
                  </div>
                  <input
                    v-model.number="simParams.porsi_usaha_persen"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Belum ditentukan..."
                    class="w-full border-2 border-border bg-white rounded-xl p-2 font-bold text-text-primary focus:border-navy outline-none text-xs"
                  />
                </div>

                <!-- Pengaturan Metode Penyusutan -->
                <div class="space-y-1 pt-1 border-t border-border/60">
                  <label class="block font-bold text-text-secondary text-xs">Metode Penyusutan</label>
                  <select
                    v-model="simParams.metode_penyusutan"
                    class="w-full border-2 border-border bg-white rounded-xl p-2 font-bold text-text-primary focus:border-navy outline-none text-xs"
                  >
                    <option value="garis_lurus">Garis Lurus (Straight Line)</option>
                    <option value="belum_ditentukan">Belum Ditentukan</option>
                    <option value="tidak_disusutkan">Tidak Disusutkan</option>
                  </select>
                </div>

                <!-- Indikator Perubahan In-Memory -->
                <div v-if="isSimModified" class="pt-1 flex items-center justify-between text-[11px] text-blue-900 bg-blue-50/80 p-2 rounded-lg border border-blue-200">
                  <span>✏️ Nilai simulasi sedang diubah secara lokal (in-memory).</span>
                  <span class="font-bold text-[10px] uppercase tracking-wide">Belum Tersimpan</span>
                </div>
              </div>

              <!-- Hasil Kalkulasi Komponen -->
              <div v-if="selectedComponentCalc?.status === 'BELUM_DAPAT_DIHITUNG'" class="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                <div class="font-bold flex items-center gap-1.5">
                  <span>⚠️</span>
                  <span>Belum dapat dihitung</span>
                </div>
                <p>
                  Parameter berikut belum lengkap: <b class="underline">{{ selectedComponentCalc.missingFields.join(', ') }}</b>. Lengkapi form simulasi di atas untuk melihat jadwal penyusutan.
                </p>
              </div>

              <div v-else-if="selectedComponentCalc?.status === 'INPUT_TIDAK_VALID'" class="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-1.5">
                <div class="font-bold flex items-center gap-1.5">
                  <span>❌</span>
                  <span>Input Tidak Valid</span>
                </div>
                <ul class="list-disc list-inside">
                  <li v-for="err in selectedComponentCalc.errors" :key="err">{{ err }}</li>
                </ul>
              </div>

              <div v-else-if="selectedComponentCalc?.status === 'DAPAT_DIHITUNG'" class="space-y-4">
                <!-- Info Status Historis jika siap guna masa lalu -->
                <div
                  v-if="selectedComponentCalc.posisiBulanIni"
                  class="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-2 text-blue-950"
                >
                  <div class="flex items-center justify-between font-bold text-[11px] text-blue-900">
                    <span>Posisi per Bulan Ini ({{ selectedComponentCalc.posisiBulanIni.currentPeriodKey }}):</span>
                    <span v-if="selectedComponentCalc.posisiBulanIni.isFullyDepreciated" class="text-emerald-700 font-extrabold">
                      ✓ Telah Selesai Disusutkan
                    </span>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div class="bg-white p-2 rounded-lg border border-blue-100">
                      <span class="text-text-muted block text-[10px]">Akumulasi Penyusutan:</span>
                      <strong class="text-navy text-sm font-black">{{ formatCurrency(selectedComponentCalc.posisiBulanIni.akumulasiPenyusutan) }}</strong>
                    </div>
                    <div class="bg-white p-2 rounded-lg border border-blue-100">
                      <span class="text-text-muted block text-[10px]">Nilai Buku Bulan Ini:</span>
                      <strong class="text-navy text-sm font-black">{{ formatCurrency(selectedComponentCalc.posisiBulanIni.nilaiBuku) }}</strong>
                    </div>
                    <div class="bg-white p-2 rounded-lg border border-blue-100">
                      <span class="text-text-muted block text-[10px]">Sisa Masa Manfaat:</span>
                      <strong class="text-navy text-sm font-black">{{ selectedComponentCalc.posisiBulanIni.sisaBulan }} Bulan</strong>
                    </div>
                  </div>
                </div>

                <!-- Kartu Ringkasan Hasil Utama -->
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div class="bg-gray-50 border border-border p-3 rounded-xl">
                    <span class="text-text-muted text-[10px] block">Beban / Bulan (Penuh):</span>
                    <strong class="text-navy text-sm font-black">{{ formatCurrency(selectedComponentCalc.bebanBulanPenuh) }}</strong>
                  </div>
                  <div class="bg-gray-50 border border-border p-3 rounded-xl">
                    <span class="text-text-muted text-[10px] block">Beban Usaha / Bulan:</span>
                    <strong v-if="selectedComponentCalc.bebanUsahaBulanPenuh !== null" class="text-emerald-700 text-sm font-black">
                      {{ formatCurrency(selectedComponentCalc.bebanUsahaBulanPenuh) }}
                    </strong>
                    <strong v-else class="text-amber-800 text-xs font-bold italic">
                      Belum ditentukan
                    </strong>
                  </div>
                  <div class="bg-gray-50 border border-border p-3 rounded-xl">
                    <span class="text-text-muted text-[10px] block">Dasar Penyusutan:</span>
                    <strong class="text-navy text-sm font-black">{{ formatCurrency(selectedComponentCalc.dasarPenyusutan) }}</strong>
                  </div>
                  <div class="bg-gray-50 border border-border p-3 rounded-xl">
                    <span class="text-text-muted text-[10px] block">Total Beban Usaha:</span>
                    <strong v-if="selectedComponentCalc.totalPenyusutanUsaha !== null" class="text-emerald-700 text-sm font-black">
                      {{ formatCurrency(selectedComponentCalc.totalPenyusutanUsaha) }}
                    </strong>
                    <strong v-else class="text-amber-800 text-xs font-bold italic">
                      Belum ditentukan
                    </strong>
                  </div>
                  <div class="bg-gray-50 border border-border p-3 rounded-xl">
                    <span class="text-text-muted text-[10px] block">Nilai Buku Akhir:</span>
                    <strong class="text-navy text-sm font-black">{{ formatCurrency(selectedComponentCalc.nilaiBukuAkhir) }}</strong>
                  </div>
                  <div class="bg-gray-50 border border-border p-3 rounded-xl">
                    <span class="text-text-muted text-[10px] block">Selesai Penyusutan:</span>
                    <strong class="text-navy text-xs font-black">{{ selectedComponentCalc.tanggalSelesai }}</strong>
                  </div>
                </div>

                <!-- Pilihan Tampilan Jadwal: Bulanan vs Tahunan -->
                <div class="pt-2 space-y-3">
                  <div class="flex items-center justify-between border-b border-border pb-2">
                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        @click="simScheduleViewMode = 'bulanan'"
                        class="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                        :class="simScheduleViewMode === 'bulanan'
                          ? 'bg-navy text-white shadow-sm'
                          : 'bg-gray-100 text-text-secondary hover:bg-gray-200'"
                      >
                        Jadwal Bulanan ({{ selectedComponentCalc.jadwalBulanan.length }} Periode)
                      </button>
                      <button
                        type="button"
                        @click="simScheduleViewMode = 'tahunan'"
                        class="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                        :class="simScheduleViewMode === 'tahunan'
                          ? 'bg-navy text-white shadow-sm'
                          : 'bg-gray-100 text-text-secondary hover:bg-gray-200'"
                      >
                        Ringkasan Tahunan ({{ selectedComponentCalc.ringkasanTahunan.length }} Tahun)
                      </button>
                    </div>
                  </div>

                  <!-- Tabel Jadwal Bulanan -->
                  <div v-if="simScheduleViewMode === 'bulanan'" class="space-y-2">
                    <div class="overflow-x-auto rounded-xl border border-border">
                      <table class="w-full text-left text-xs whitespace-nowrap">
                        <thead class="bg-gray-100 text-text-secondary text-[10px] uppercase font-bold border-b border-border">
                          <tr>
                            <th class="py-2.5 px-3">Periode</th>
                            <th class="py-2.5 px-3 text-right">Beban Penyusutan</th>
                            <th class="py-2.5 px-3 text-right">
                              Porsi Usaha {{ selectedComponentCalc.porsiUsahaPersen !== null ? '(' + selectedComponentCalc.porsiUsahaPersen + '%)' : '(Belum Ditentukan)' }}
                            </th>
                            <th class="py-2.5 px-3 text-right">Akumulasi</th>
                            <th class="py-2.5 px-3 text-right">Nilai Buku</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-border font-medium">
                          <tr
                            v-for="row in paginatedJadwalBulanan"
                            :key="row.periodeKey"
                            class="hover:bg-gray-50/80 transition"
                          >
                            <td class="py-2 px-3">
                              <span class="font-bold text-navy">{{ row.periodeLabel }}</span>
                              <span v-if="row.isProrata" class="ml-1 text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                Prorata ({{ row.hariProrata }}/{{ row.totalHariBulan }} hari)
                              </span>
                              <span v-else-if="row.isFractionalFinal" class="ml-1 text-[10px] text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                Sisa Fraksi
                              </span>
                            </td>
                            <td class="py-2 px-3 text-right font-bold text-text-primary">
                              {{ formatCurrency(row.bebanPenyusutan) }}
                            </td>
                            <td class="py-2 px-3 text-right font-bold text-emerald-700">
                              {{ row.bebanUsaha !== null ? formatCurrency(row.bebanUsaha) : 'Belum ditentukan' }}
                            </td>
                            <td class="py-2 px-3 text-right text-text-muted">
                              {{ formatCurrency(row.akumulasiPenyusutan) }}
                            </td>
                            <td class="py-2 px-3 text-right font-black text-navy">
                              {{ formatCurrency(row.nilaiBukuAkhir) }}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <!-- Paginasi Jadwal Bulanan -->
                    <BasePagination
                      v-model="simSchedulePage"
                      :total-items="selectedComponentCalc.jadwalBulanan.length"
                      :page-size="12"
                      item-label="bulan"
                    />
                  </div>

                  <!-- Tabel Ringkasan Tahunan -->
                  <div v-else-if="simScheduleViewMode === 'tahunan'" class="overflow-x-auto rounded-xl border border-border">
                    <table class="w-full text-left text-xs whitespace-nowrap">
                      <thead class="bg-gray-100 text-text-secondary text-[10px] uppercase font-bold border-b border-border">
                        <tr>
                          <th class="py-2.5 px-3">Tahun</th>
                          <th class="py-2.5 px-3 text-center">Jumlah Bulan</th>
                          <th class="py-2.5 px-3 text-right">Beban Tahunan</th>
                          <th class="py-2.5 px-3 text-right">Porsi Usaha Tahunan</th>
                          <th class="py-2.5 px-3 text-right">Akumulasi Akhir Tahun</th>
                          <th class="py-2.5 px-3 text-right">Nilai Buku Akhir Tahun</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-border font-medium">
                        <tr
                          v-for="row in selectedComponentCalc.ringkasanTahunan"
                          :key="'year-' + row.tahun"
                          class="hover:bg-gray-50/80 transition"
                        >
                          <td class="py-2 px-3 font-black text-navy">
                            {{ row.tahun }}
                          </td>
                          <td class="py-2 px-3 text-center text-text-muted">
                            {{ row.bulanCount }} bulan
                          </td>
                          <td class="py-2 px-3 text-right font-bold text-text-primary">
                            {{ formatCurrency(row.bebanTahunan) }}
                          </td>
                          <td class="py-2 px-3 text-right font-bold text-emerald-700">
                            {{ row.bebanUsahaTahunan !== null ? formatCurrency(row.bebanUsahaTahunan) : 'Belum ditentukan' }}
                          </td>
                          <td class="py-2 px-3 text-right text-text-muted">
                            {{ formatCurrency(row.akumulasiAkhirTahun) }}
                          </td>
                          <td class="py-2 px-3 text-right font-black text-navy">
                            {{ formatCurrency(row.nilaiBukuAkhirTahun) }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- TAMPILAN 2: RINGKASAN GABUNGAN ASET (MULTI-KOMPONEN) -->
          <div v-else-if="activeSimTab === 'all' && assetSimResult" class="space-y-4">
            <!-- Alert jika aset tidak disusutkan (misal tanah) -->
            <div
              v-if="assetSimResult.status === 'TIDAK_DISUSUTKAN'"
              class="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-text-secondary space-y-1"
            >
              <div class="font-bold text-text-primary flex items-center gap-1.5">
                <span>ℹ️</span>
                <span>Aset Tidak Disusutkan</span>
              </div>
              <p>{{ assetSimResult.alasan }}</p>
            </div>

            <!-- Alert jika hasil parsial -->
            <div
              v-if="assetSimResult.isPartial"
              class="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-1.5"
            >
              <div class="font-bold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>{{ assetSimResult.labelParsial }}</span>
              </div>
              <p class="text-[11px] leading-relaxed">
                Beberapa komponen belum dapat disusutkan atau belum memiliki data lengkap.
              </p>
              <ul v-if="assetSimResult.missingComponents.length > 0" class="list-disc list-inside text-[11px] pt-1">
                <li v-for="mc in assetSimResult.missingComponents" :key="mc.nama">
                  <b>{{ mc.nama }}</b>: {{ mc.missing.join(', ') }}
                </li>
              </ul>
            </div>

            <!-- Kartu Metrik Gabungan -->
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div class="bg-gray-50 border border-border p-3 rounded-xl">
                <span class="text-text-muted text-[10px] block">Biaya Terkapitalisasi:</span>
                <strong class="text-navy text-sm font-black">{{ formatCurrency(assetSimResult.biayaTotal) }}</strong>
              </div>
              <div class="bg-gray-50 border border-border p-3 rounded-xl">
                <span class="text-text-muted text-[10px] block">Total Nilai Sisa:</span>
                <strong class="text-navy text-sm font-black">{{ formatCurrency(assetSimResult.nilaiSisaTotal) }}</strong>
              </div>
              <div class="bg-gray-50 border border-border p-3 rounded-xl">
                <span class="text-text-muted text-[10px] block">Dasar Penyusutan Gabungan:</span>
                <strong class="text-navy text-sm font-black">{{ formatCurrency(assetSimResult.dasarPenyusutanTotal) }}</strong>
              </div>
              <div class="bg-gray-50 border border-border p-3 rounded-xl">
                <span class="text-text-muted text-[10px] block">Total Beban Usaha:</span>
                <strong v-if="assetSimResult.totalPenyusutanUsaha !== null" class="text-emerald-700 text-sm font-black">
                  {{ formatCurrency(assetSimResult.totalPenyusutanUsaha) }}
                </strong>
                <strong v-else class="text-amber-800 text-xs font-bold italic">
                  Belum ditentukan
                </strong>
              </div>
              <div class="bg-gray-50 border border-border p-3 rounded-xl">
                <span class="text-text-muted text-[10px] block">Komponen Terhitung:</span>
                <strong class="text-navy text-sm font-black">{{ assetSimResult.komponenTerhitung }} / {{ assetSimResult.totalKomponen }}</strong>
              </div>
              <div class="bg-gray-50 border border-border p-3 rounded-xl">
                <span class="text-text-muted text-[10px] block">Rentang Periode:</span>
                <strong class="text-navy text-xs font-black">{{ assetSimResult.periodeAwal || '-' }} s.d. {{ assetSimResult.periodeAkhir || '-' }}</strong>
              </div>
            </div>

            <!-- Pilihan Tampilan Jadwal Gabungan: Bulanan vs Tahunan -->
            <div v-if="assetSimResult.canCalculate && assetSimResult.jadwalBulanan.length > 0" class="pt-2 space-y-3">
              <div class="flex items-center justify-between border-b border-border pb-2">
                <div class="flex items-center gap-1.5">
                  <button
                    type="button"
                    @click="simScheduleViewMode = 'bulanan'"
                    class="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                    :class="simScheduleViewMode === 'bulanan'
                      ? 'bg-navy text-white shadow-sm'
                      : 'bg-gray-100 text-text-secondary hover:bg-gray-200'"
                  >
                    Jadwal Bulanan Gabungan ({{ assetSimResult.jadwalBulanan.length }} Periode)
                  </button>
                  <button
                    type="button"
                    @click="simScheduleViewMode = 'tahunan'"
                    class="px-3 py-1 rounded-lg text-xs font-bold transition-all"
                    :class="simScheduleViewMode === 'tahunan'
                      ? 'bg-navy text-white shadow-sm'
                      : 'bg-gray-100 text-text-secondary hover:bg-gray-200'"
                  >
                    Ringkasan Tahunan Gabungan ({{ assetSimResult.ringkasanTahunan.length }} Tahun)
                  </button>
                </div>
              </div>

              <!-- Tabel Jadwal Bulanan Gabungan -->
              <div v-if="simScheduleViewMode === 'bulanan'" class="space-y-2">
                <div class="overflow-x-auto rounded-xl border border-border">
                  <table class="w-full text-left text-xs whitespace-nowrap">
                    <thead class="bg-gray-100 text-text-secondary text-[10px] uppercase font-bold border-b border-border">
                      <tr>
                        <th class="py-2.5 px-3">Periode</th>
                        <th class="py-2.5 px-3 text-right">Beban Gabungan</th>
                        <th class="py-2.5 px-3 text-right">Porsi Usaha</th>
                        <th class="py-2.5 px-3 text-right">Akumulasi</th>
                        <th class="py-2.5 px-3 text-right">Nilai Buku</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-border font-medium">
                      <tr
                        v-for="row in paginatedJadwalBulanan"
                        :key="'gabungan-' + row.periodeKey"
                        class="hover:bg-gray-50/80 transition"
                      >
                        <td class="py-2 px-3 font-bold text-navy">
                          {{ row.periodeLabel }}
                        </td>
                        <td class="py-2 px-3 text-right font-bold text-text-primary">
                          {{ formatCurrency(row.bebanPenyusutan) }}
                        </td>
                        <td class="py-2 px-3 text-right font-bold text-emerald-700">
                          {{ row.bebanUsaha !== null ? formatCurrency(row.bebanUsaha) : 'Belum ditentukan' }}
                        </td>
                        <td class="py-2 px-3 text-right text-text-muted">
                          {{ formatCurrency(row.akumulasiPenyusutan) }}
                        </td>
                        <td class="py-2 px-3 text-right font-black text-navy">
                          {{ formatCurrency(row.nilaiBukuAkhir) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <BasePagination
                  v-model="simSchedulePage"
                  :total-items="assetSimResult.jadwalBulanan.length"
                  :page-size="12"
                  item-label="bulan"
                />
              </div>

              <!-- Tabel Ringkasan Tahunan Gabungan -->
              <div v-else-if="simScheduleViewMode === 'tahunan'" class="overflow-x-auto rounded-xl border border-border">
                <table class="w-full text-left text-xs whitespace-nowrap">
                  <thead class="bg-gray-100 text-text-secondary text-[10px] uppercase font-bold border-b border-border">
                    <tr>
                      <th class="py-2.5 px-3">Tahun</th>
                      <th class="py-2.5 px-3 text-center">Jumlah Bulan</th>
                      <th class="py-2.5 px-3 text-right">Beban Tahunan Gabungan</th>
                      <th class="py-2.5 px-3 text-right">Porsi Usaha Tahunan</th>
                      <th class="py-2.5 px-3 text-right">Akumulasi Akhir Tahun</th>
                      <th class="py-2.5 px-3 text-right">Nilai Buku Akhir Tahun</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-border font-medium">
                    <tr
                      v-for="row in assetSimResult.ringkasanTahunan"
                      :key="'year-gabungan-' + row.tahun"
                      class="hover:bg-gray-50/80 transition"
                    >
                      <td class="py-2 px-3 font-black text-navy">
                        {{ row.tahun }}
                      </td>
                      <td class="py-2 px-3 text-center text-text-muted">
                        {{ row.bulanCount }} bulan
                      </td>
                      <td class="py-2 px-3 text-right font-bold text-text-primary">
                        {{ formatCurrency(row.bebanTahunan) }}
                      </td>
                      <td class="py-2 px-3 text-right font-bold text-emerald-700">
                        {{ row.bebanUsahaTahunan !== null ? formatCurrency(row.bebanUsahaTahunan) : 'Belum ditentukan' }}
                      </td>
                      <td class="py-2 px-3 text-right text-text-muted">
                        {{ formatCurrency(row.akumulasiAkhirTahun) }}
                      </td>
                      <td class="py-2 px-3 text-right font-black text-navy">
                        {{ formatCurrency(row.nilaiBukuAkhirTahun) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- Safeguard Note -->
        <p class="text-[11px] text-text-muted leading-relaxed border-t border-border pt-3">
          🛡️ Pencatatan berstatus draf simulasi. Perhitungan ini murni pratinjau di memori peramban dan tidak membuat jurnal pembukuan, tidak mengubah kas, serta tidak mempengaruhi laporan keuangan.
        </p>
      </section>

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

    <!-- Modal Aktivasi / Pengesahan Ulang Aset -->
    <BaseModal v-if="showActivateModal" @click.self="showActivateModal = false">
      <div class="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border-2 border-border space-y-4">
        <div class="flex items-center justify-between border-b border-border pb-3">
          <h3 class="font-black text-base text-navy">
            {{ asset.status_pencatatan === 'perlu_pengesahan_ulang' ? 'Sahkan Ulang Aset (Aktivasi Ulang)' : 'Aktivasi Aset (Resmi)' }}
          </h3>
          <button type="button" @click="showActivateModal = false" class="text-text-muted font-bold text-lg">✕</button>
        </div>

        <p class="text-xs text-text-secondary leading-relaxed">
          Aktivasi aset akan membekukan seluruh parameter finansial komponen ke dalam snapshot versi resmi (SSOT pembukuan) dan mengaktifkan aset untuk penyusutan.
        </p>

        <div class="space-y-1 text-xs">
          <label class="block font-bold text-text-secondary">Catatan Aktivasi (Opsional)</label>
          <input
            v-model="activationNotes"
            type="text"
            placeholder="Contoh: Pengesahan aktivasi awal modul pembukuan"
            class="w-full border-2 border-border rounded-xl p-2.5 font-semibold text-xs"
          />
        </div>

        <div v-if="activateModalError" class="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          {{ activateModalError }}
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            @click="showActivateModal = false"
            class="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-text-secondary"
          >
            Batal
          </button>
          <button
            type="button"
            @click="executeActivateAsset"
            :disabled="isActivating"
            class="px-5 py-2.5 rounded-xl bg-navy text-white text-xs font-bold shadow hover:bg-navy-dark active:scale-95 transition disabled:opacity-50"
          >
            {{ isActivating ? 'Memproses...' : (asset.status_pencatatan === 'perlu_pengesahan_ulang' ? 'Konfirmasi Sahkan Ulang' : 'Konfirmasi Aktivasi') }}
          </button>
        </div>
      </div>
    </BaseModal>

    <!-- Modal Pengesahan Saldo Awal -->
    <BaseModal v-if="showOBModal && targetCompOB" @click.self="showOBModal = false">
      <div class="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border-2 border-border space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-border pb-3">
          <h3 class="font-black text-base text-navy">Pengesahan Saldo Awal</h3>
          <button type="button" @click="showOBModal = false" class="text-text-muted font-bold text-lg">✕</button>
        </div>

        <div class="p-3 bg-bg-app rounded-xl border border-border text-xs space-y-1">
          <p class="font-bold text-navy">{{ targetCompOB.nama_komponen }}</p>
          <p class="text-text-secondary">Biaya: {{ formatCurrency(targetCompOB.biaya_perolehan) }} • Siap Guna: {{ targetCompOB.tanggal_siap_guna }}</p>
        </div>

        <!-- Pilihan Jalur -->
        <div class="space-y-2 text-xs">
          <label class="block font-bold text-text-secondary">Pilih Jalur Pengesahan:</label>
          <div class="flex gap-4">
            <label class="flex items-center gap-1.5 cursor-pointer font-semibold">
              <input id="ob-jalur-historis" type="radio" value="simulasi_historis" v-model="obJalur" />
              <span>Simulasi Historis</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer font-semibold">
              <input id="ob-jalur-manual" type="radio" value="catatan_terdahulu" v-model="obJalur" />
              <span>Catatan Terdahulu (Manual)</span>
            </label>
          </div>
        </div>

        <!-- Form Manual (Catatan Terdahulu) jika dipilih -->
        <div v-if="obJalur === 'catatan_terdahulu'" class="space-y-3 text-xs bg-gray-50 p-3 rounded-xl border border-border">
          <div>
            <label class="block font-bold text-text-secondary mb-1">Akumulasi Penyusutan Awal (Rp) *</label>
            <input
              id="ob-akumulasi-manual"
              v-model.number="obAkumulasiManual"
              type="number"
              min="0"
              placeholder="Contoh: 2840000"
              class="w-full border-2 border-border rounded-xl p-2 font-semibold bg-white"
            />
          </div>
          <div>
            <label class="block font-bold text-text-secondary mb-1">Akumulasi Bagian Usaha Awal (Rp) *</label>
            <input
              id="ob-usaha-manual"
              v-model.number="obTargetUsahaManual"
              type="number"
              min="0"
              placeholder="Contoh: 2840000"
              class="w-full border-2 border-border rounded-xl p-2 font-semibold bg-white"
            />
          </div>
          <div>
            <label class="block font-bold text-text-secondary mb-1">Revisi Estimasi Sisa Masa Manfaat (Bulan) <span class="font-normal text-text-muted">(Opsional — wajib jika masa manfaat awal habis)</span></label>
            <input
              id="ob-sisa-bulan-manual"
              v-model.number="obSisaBulanManual"
              type="number"
              min="1"
              placeholder="Kosongkan jika mengikuti sisa bobot jadwal..."
              class="w-full border-2 border-border rounded-xl p-2 font-semibold bg-white"
            />
          </div>
        </div>

        <div class="space-y-1 text-xs">
          <label class="block font-bold text-text-secondary">
            Catatan Sumber / Pengesahan {{ obJalur === 'catatan_terdahulu' ? '*' : '(Opsional)' }}
          </label>
          <input
            id="ob-catatan-sumber"
            v-model="obCatatan"
            type="text"
            placeholder="Contoh: Buku inventaris manual kos per 31 Mei 2026"
            class="w-full border-2 border-border rounded-xl p-2.5 font-semibold text-xs"
          />
        </div>

        <div v-if="obModalError" class="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          {{ obModalError }}
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            @click="showOBModal = false"
            class="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-text-secondary"
          >
            Batal
          </button>
          <button
            type="button"
            @click="executeApproveOB"
            :disabled="isApprovingOB"
            class="px-5 py-2.5 rounded-xl bg-navy text-white text-xs font-bold shadow hover:bg-navy-dark active:scale-95 transition disabled:opacity-50"
          >
            {{ isApprovingOB ? 'Mengesahkan...' : 'Konfirmasi Sahkan Saldo Awal' }}
          </button>
        </div>
      </div>
    </BaseModal>

    <!-- Modal Revisi Parameter Finansial -->
    <BaseModal v-if="showReviseModal && targetCompRevise" @click.self="showReviseModal = false">
      <div class="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border-2 border-border space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-border pb-3">
          <h3 class="font-black text-base text-navy">Revisi Parameter Komponen</h3>
          <button type="button" @click="showReviseModal = false" class="text-text-muted font-bold text-lg">✕</button>
        </div>

        <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
          <p class="font-bold">⚠️ Perhatian Integritas Pembukuan:</p>
          <p class="leading-relaxed">
            Revisi parameter resmi akan mengupdate master dan menandai aset sebagai <b>Perlu Pengesahan Ulang</b>. Jika terdapat batch posting aktif terdampak, batalkan batch tersebut terlebih dahulu di Buku Pembantu.
          </p>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="block font-bold text-text-secondary mb-1">Biaya Perolehan (Rp) *</label>
            <input
              id="revise-biaya"
              v-model.number="reviseBiaya"
              type="number"
              min="0"
              class="w-full border-2 border-border rounded-xl p-2 font-semibold"
            />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-bold text-text-secondary mb-1">Nilai Sisa (Rp)</label>
              <input
                v-model.number="reviseNilaiSisa"
                type="number"
                min="0"
                class="w-full border-2 border-border rounded-xl p-2 font-semibold"
              />
            </div>
            <div>
              <label class="block font-bold text-text-secondary mb-1">Masa Manfaat (Bulan) *</label>
              <input
                v-model.number="reviseMasaManfaat"
                type="number"
                min="1"
                class="w-full border-2 border-border rounded-xl p-2 font-semibold"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-bold text-text-secondary mb-1">Tanggal Siap Guna *</label>
              <input
                v-model="reviseTanggalSiapGuna"
                type="date"
                class="w-full border-2 border-border rounded-xl p-2 font-semibold"
              />
            </div>
            <div>
              <label class="block font-bold text-text-secondary mb-1">Porsi Usaha (%) *</label>
              <input
                v-model.number="revisePorsiUsaha"
                type="number"
                min="0"
                max="100"
                class="w-full border-2 border-border rounded-xl p-2 font-semibold"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-bold text-text-secondary mb-1">Keputusan Kapitalisasi</label>
              <select
                v-model="reviseStatusKapitalisasi"
                class="w-full border-2 border-border rounded-xl p-2 font-semibold bg-white"
              >
                <option value="kapitalisasi">Kapitalisasi Aset</option>
                <option value="beban_langsung">Beban Langsung</option>
                <option value="perlu_telaah">Perlu Telaah</option>
              </select>
            </div>
            <div v-if="reviseExpenseId">
              <label class="block font-bold text-text-secondary mb-1">Alokasi Pengeluaran (Rp)</label>
              <input
                id="revise-allocated-cost"
                v-model.number="reviseAllocatedCost"
                type="number"
                min="0"
                class="w-full border-2 border-border rounded-xl p-2 font-semibold"
              />
            </div>
          </div>
          <div>
            <label class="block font-bold text-text-secondary mb-1">Alasan Revisi *</label>
            <textarea
              id="revise-reason"
              v-model="reviseReason"
              rows="2"
              placeholder="Jelaskan alasan perubahan parameter finansial ini..."
              class="w-full border-2 border-border rounded-xl p-2 font-semibold"
            ></textarea>
          </div>
        </div>

        <div v-if="reviseModalError" class="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          {{ reviseModalError }}
        </div>

        <div class="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            @click="showReviseModal = false"
            class="px-4 py-2.5 rounded-xl border border-border text-xs font-bold text-text-secondary"
          >
            Batal
          </button>
          <button
            type="button"
            @click="executeReviseParameters"
            :disabled="isRevising || !reviseReason.trim()"
            class="px-5 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-bold shadow hover:bg-amber-700 active:scale-95 transition disabled:opacity-50"
          >
            {{ isRevising ? 'Menyimpan...' : 'Konfirmasi Revisi' }}
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
import BasePagination from '../components/BasePagination.vue'
import { getAssetCategoryLabel, getAssetCategoryIcon, inspectAssetCompleteness, getCurrentUserRole } from '../lib/aset.js'
import {
  calculateComponentDepreciation,
  calculateAssetDepreciation,
  STATUS_PERHITUNGAN,
  PRESET_UMUR_EKONOMIS,
} from '../lib/depresiasi.js'
import {
  activateAsset,
  approveComponentOpeningBalance,
  reviseComponentParameters,
  fetchBookkeepingSettings,
  formatBookkeepingError,
} from '../lib/pembukuanAset.js'

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

// State Pembukuan & Saldo Awal
const latestSnapshotVersion = ref(null)
const bookkeepingStartDate = ref(null)
const approvedOBMap = ref({})
const successNotification = ref('')

// State Modal Aktivasi / Pengesahan Ulang
const showActivateModal = ref(false)
const activationNotes = ref('')
const isActivating = ref(false)
const activateModalError = ref('')

// State Modal Saldo Awal
const showOBModal = ref(false)
const targetCompOB = ref(null)
const obJalur = ref('simulasi_historis')
const obAkumulasiManual = ref(null)
const obSisaBulanManual = ref(null)
const obTargetUsahaManual = ref(null)
const obCatatan = ref('')
const isApprovingOB = ref(false)
const obModalError = ref('')

// State Modal Revisi Parameter
const showReviseModal = ref(false)
const targetCompRevise = ref(null)
const reviseBiaya = ref(0)
const reviseNilaiSisa = ref(0)
const reviseMasaManfaat = ref(0)
const reviseTanggalSiapGuna = ref('')
const revisePorsiUsaha = ref(100)
const reviseStatusKapitalisasi = ref('kapitalisasi')
const reviseExpenseId = ref(null)
const reviseAllocatedCost = ref(null)
const reviseReason = ref('')
const isRevising = ref(false)
const reviseModalError = ref('')

// State Simulasi Penyusutan (In-Memory)
const activeSimTab = ref('all')
const simSchedulePage = ref(1)
const simScheduleViewMode = ref('bulanan') // 'bulanan' | 'tahunan'

const simParams = reactive({
  biaya_perolehan: null,
  nilai_sisa: 0,
  masa_manfaat_bulan: null,
  tanggal_siap_guna: '',
  porsi_usaha_persen: null,
  metode_penyusutan: 'garis_lurus',
})

const canManageAssets = computed(() => {
  return currentUserRole.value === 'admin' || currentUserRole.value === 'owner'
})

const selectedComponent = computed(() => {
  if (activeSimTab.value === 'all') return null
  return componentsList.value.find(c => c.id === activeSimTab.value) || null
})

function resetSimParamsToCurrentComponent(compToUse = null) {
  const comp = (compToUse && compToUse.id)
    ? compToUse
    : (selectedComponent.value || (activeSimTab.value !== 'all' ? componentsList.value.find(c => c.id === activeSimTab.value) : null) || componentsList.value[0])
  if (!comp) return
  simParams.biaya_perolehan = comp.biaya_perolehan !== null && comp.biaya_perolehan !== undefined
    ? Number(comp.biaya_perolehan)
    : null
  simParams.nilai_sisa = comp.nilai_sisa !== null && comp.nilai_sisa !== undefined
    ? Number(comp.nilai_sisa)
    : 0
  simParams.masa_manfaat_bulan = comp.masa_manfaat_bulan ? Number(comp.masa_manfaat_bulan) : null
  simParams.tanggal_siap_guna = comp.tanggal_siap_guna || ''
  simParams.porsi_usaha_persen = comp.porsi_usaha_persen !== null && comp.porsi_usaha_persen !== undefined
    ? Number(comp.porsi_usaha_persen)
    : null
  simParams.metode_penyusutan = comp.metode_penyusutan || 'belum_ditentukan'
}

function selectSimTab(tabId) {
  activeSimTab.value = tabId
  simSchedulePage.value = 1
  if (tabId !== 'all') {
    resetSimParamsToCurrentComponent()
  }
}

function applyPresetUmur(bulan) {
  simParams.masa_manfaat_bulan = bulan
}

const isSimModified = computed(() => {
  const comp = selectedComponent.value
  if (!comp) return false

  const origBiaya = comp.biaya_perolehan !== null && comp.biaya_perolehan !== undefined
    ? Number(comp.biaya_perolehan)
    : null
  const origNilaiSisa = comp.nilai_sisa !== null && comp.nilai_sisa !== undefined
    ? Number(comp.nilai_sisa)
    : 0
  const origMasa = comp.masa_manfaat_bulan ? Number(comp.masa_manfaat_bulan) : null
  const origTanggal = comp.tanggal_siap_guna || ''
  const origPorsi = comp.porsi_usaha_persen !== null && comp.porsi_usaha_persen !== undefined
    ? Number(comp.porsi_usaha_persen)
    : null
  const origMetode = comp.metode_penyusutan || 'belum_ditentukan'

  return (
    simParams.biaya_perolehan !== origBiaya ||
    simParams.nilai_sisa !== origNilaiSisa ||
    simParams.masa_manfaat_bulan !== origMasa ||
    simParams.tanggal_siap_guna !== origTanggal ||
    simParams.porsi_usaha_persen !== origPorsi ||
    simParams.metode_penyusutan !== origMetode
  )
})

const selectedComponentCalc = computed(() => {
  const comp = selectedComponent.value
  if (!comp) return null

  // Salin data komponen dengan nilai yang sedang diubah di simParams
  const compForCalc = {
    ...comp,
    biaya_perolehan: simParams.biaya_perolehan,
    nilai_sisa: simParams.nilai_sisa,
    masa_manfaat_bulan: simParams.masa_manfaat_bulan,
    tanggal_siap_guna: simParams.tanggal_siap_guna,
    porsi_usaha_persen: simParams.porsi_usaha_persen,
    metode_penyusutan: simParams.metode_penyusutan,
  }

  return calculateComponentDepreciation(compForCalc, asset.value?.kategori_aset)
})

const assetSimResult = computed(() => {
  if (!componentsList.value || componentsList.value.length === 0) return null
  return calculateAssetDepreciation(componentsList.value, asset.value?.kategori_aset)
})

const activeJadwalBulanan = computed(() => {
  if (activeSimTab.value === 'all') {
    return assetSimResult.value?.jadwalBulanan || []
  }
  return selectedComponentCalc.value?.jadwalBulanan || []
})

const paginatedJadwalBulanan = computed(() => {
  const list = activeJadwalBulanan.value
  const start = (simSchedulePage.value - 1) * 12
  return list.slice(start, start + 12)
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
      const comps = data.asset_components || []

      // Ambil pengaturan tanggal mulai pembukuan
      try {
        const startDate = await fetchBookkeepingSettings(supabase, data.org_id)
        bookkeepingStartDate.value = startDate || null
      } catch (settingsErr) {
        console.warn('[SimKos] Gagal memuat bookkeeping settings:', settingsErr)
      }

      // Ambil snapshot versi terakhir
      try {
        const { data: snapData } = await supabase
          .from('asset_activation_snapshots')
          .select('version')
          .eq('asset_id', data.id)
          .order('version', { ascending: false })
          .limit(1)

        latestSnapshotVersion.value = snapData && snapData.length > 0 ? snapData[0].version : null
      } catch (snapErr) {
        console.warn('[SimKos] Gagal memuat snapshot aktivasi:', snapErr)
      }

      // Ambil approved opening balances
      try {
        const { data: obData } = await supabase
          .from('asset_opening_balances')
          .select('*')
          .eq('asset_id', data.id)
          .eq('status', 'approved')

        const map = {}
        if (obData) {
          for (const row of obData) {
            map[row.component_id] = row
          }
        }
        approvedOBMap.value = map

        for (const comp of comps) {
          comp.approvedOB = map[comp.id] || null
        }
      } catch (obErr) {
        console.warn('[SimKos] Gagal memuat opening balances:', obErr)
      }

      componentsList.value = comps

      if (componentsList.value.length === 1) {
        activeSimTab.value = componentsList.value[0].id
        resetSimParamsToCurrentComponent(componentsList.value[0])
      } else if (componentsList.value.length > 1) {
        activeSimTab.value = 'all'
      }
    }
  } catch (err) {
    console.error('[SimKos] Error load detail aset:', err)
    errorMessage.value = err.message || 'Gagal memuat detail aset.'
  } finally {
    isLoading.value = false
  }
}

function isComponentHistorical(comp) {
  if (!comp || !comp.tanggal_siap_guna || !bookkeepingStartDate.value) return false
  return comp.tanggal_siap_guna < bookkeepingStartDate.value
}

function openActivateModal() {
  activateModalError.value = ''
  activationNotes.value = ''
  showActivateModal.value = true
}

async function executeActivateAsset() {
  isActivating.value = true
  activateModalError.value = ''
  try {
    await activateAsset(supabase, {
      assetId: asset.value.id,
      notes: activationNotes.value,
    })
    showActivateModal.value = false
    await loadAssetDetail()
  } catch (err) {
    activateModalError.value = formatBookkeepingError(err)
  } finally {
    isActivating.value = false
  }
}

function openOBModal(comp) {
  targetCompOB.value = comp
  obJalur.value = 'simulasi_historis'
  obAkumulasiManual.value = null
  obSisaBulanManual.value = null
  obTargetUsahaManual.value = null
  obCatatan.value = ''
  obModalError.value = ''
  showOBModal.value = true
}

async function executeApproveOB() {
  if (!targetCompOB.value) return

  let manualAkum = null
  let manualUsaha = null
  let manualSisaBulan = null

  if (obJalur.value === 'catatan_terdahulu') {
    if (obAkumulasiManual.value === null || obAkumulasiManual.value === undefined || obAkumulasiManual.value === '') {
      obModalError.value = 'Akumulasi penyusutan awal wajib diisi untuk jalur catatan terdahulu (manual).'
      return
    }
    manualAkum = Number(obAkumulasiManual.value)

    if (obTargetUsahaManual.value === null || obTargetUsahaManual.value === undefined || obTargetUsahaManual.value === '') {
      const porsi = targetCompOB.value.porsi_usaha_persen !== null && targetCompOB.value.porsi_usaha_persen !== undefined
        ? Number(targetCompOB.value.porsi_usaha_persen)
        : 100
      manualUsaha = Math.round(manualAkum * (porsi / 100))
    } else {
      manualUsaha = Number(obTargetUsahaManual.value)
    }

    if (obSisaBulanManual.value !== null && obSisaBulanManual.value !== undefined && obSisaBulanManual.value !== '' && Number(obSisaBulanManual.value) > 0) {
      manualSisaBulan = Number(obSisaBulanManual.value)
    }

    if (!obCatatan.value || !obCatatan.value.trim()) {
      obModalError.value = 'Catatan sumber wajib diisi untuk jalur catatan terdahulu (manual).'
      return
    }
  }

  isApprovingOB.value = true
  obModalError.value = ''
  try {
    await approveComponentOpeningBalance(supabase, {
      componentId: targetCompOB.value.id,
      jalur: obJalur.value,
      akumulasiManual: manualAkum,
      sisaBulanManual: manualSisaBulan,
      targetUsahaManual: manualUsaha,
      catatan: obCatatan.value.trim(),
    })
    showOBModal.value = false
    await loadAssetDetail()
  } catch (err) {
    obModalError.value = formatBookkeepingError(err)
  } finally {
    isApprovingOB.value = false
  }
}

function openReviseModal(comp) {
  targetCompRevise.value = comp
  reviseBiaya.value = comp.biaya_perolehan !== null ? Number(comp.biaya_perolehan) : 0
  reviseNilaiSisa.value = comp.nilai_sisa !== null ? Number(comp.nilai_sisa) : 0
  reviseMasaManfaat.value = comp.masa_manfaat_bulan ? Number(comp.masa_manfaat_bulan) : 0
  reviseTanggalSiapGuna.value = comp.tanggal_siap_guna || ''
  revisePorsiUsaha.value = comp.porsi_usaha_persen !== null ? Number(comp.porsi_usaha_persen) : 100
  reviseStatusKapitalisasi.value = comp.status_kapitalisasi || 'kapitalisasi'
  reviseExpenseId.value = comp.expense_id || null
  reviseAllocatedCost.value = comp.allocated_cost !== null && comp.allocated_cost !== undefined ? Number(comp.allocated_cost) : null
  reviseReason.value = ''
  reviseModalError.value = ''
  showReviseModal.value = true
}

async function executeReviseParameters() {
  if (!targetCompRevise.value) return
  if (!reviseReason.value.trim()) {
    reviseModalError.value = 'Alasan revisi parameter wajib diisi.'
    return
  }

  isRevising.value = true
  reviseModalError.value = ''
  try {
    const hasAllocationField = Boolean(reviseExpenseId.value)
    await reviseComponentParameters(supabase, {
      componentId: targetCompRevise.value.id,
      notes: reviseReason.value.trim(),
      biaya: reviseBiaya.value,
      nilaiSisa: reviseNilaiSisa.value,
      masaManfaat: reviseMasaManfaat.value,
      tanggalSiapGuna: reviseTanggalSiapGuna.value,
      porsiUsaha: revisePorsiUsaha.value,
      statusKapitalisasi: reviseStatusKapitalisasi.value,
      expenseId: reviseExpenseId.value,
      allocatedCost: reviseAllocatedCost.value,
      updateExpenseAllocation: hasAllocationField,
    })
    showReviseModal.value = false
    await loadAssetDetail()
  } catch (err) {
    reviseModalError.value = formatBookkeepingError(err)
  } finally {
    isRevising.value = false
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
    case 'aktif': return 'bg-emerald-100 text-emerald-800'
    case 'perlu_pengesahan_ulang': return 'bg-amber-100 text-amber-800'
    case 'terverifikasi': return 'bg-blue-100 text-blue-800'
    case 'dibukukan': return 'bg-purple-100 text-purple-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

function getStatusText(status) {
  switch (status) {
    case 'aktif': return 'Aktif'
    case 'perlu_pengesahan_ulang': return 'Perlu Pengesahan Ulang'
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