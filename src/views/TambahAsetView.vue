<template>
  <div class="min-h-screen bg-bg-app pb-24 text-text-primary">
    <!-- Header Navy -->
    <header class="bg-navy text-white px-5 pt-6 pb-6 rounded-b-[24px] shadow-md">
      <div class="max-w-xl mx-auto flex items-center justify-between">
        <button
          type="button"
          @click="goBack"
          class="flex items-center gap-1.5 text-blue-200 hover:text-white font-bold text-sm transition"
        >
          <span>‹</span>
          <span>Kembali</span>
        </button>
        <h1 class="text-lg font-black tracking-tight">
          {{ isEditMode ? 'Edit Aset' : 'Tambah Aset Baru' }}
        </h1>
        <div class="w-12"></div>
      </div>
    </header>

    <main class="max-w-xl mx-auto px-4 mt-5 space-y-5">
      <!-- Pilihan Jenis Form untuk Tambah Baru -->
      <div v-if="!isEditMode && stepSelection" class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-4">
        <h2 class="text-base font-black text-navy">Pilih Jenis Aset yang Ingin Dicatat</h2>
        <p class="text-xs text-text-secondary leading-relaxed">
          Pencatatan tanah dan gedung menggunakan formulir bertahap dengan riwayat pembangunan, sedangkan fasilitas kamar/umum menggunakan formulir ringkas.
        </p>

        <div class="grid grid-cols-1 gap-3 pt-2">
          <button
            type="button"
            @click="selectFormType('gedung')"
            class="flex items-start gap-3.5 p-4 rounded-xl border-2 border-border hover:border-navy hover:bg-navy/5 text-left transition group active:scale-[0.99]"
          >
            <span class="text-3xl p-2 bg-navy/10 rounded-xl">🏢</span>
            <div>
              <strong class="text-sm font-extrabold text-navy block group-hover:underline">Gedung / Bangunan Kos</strong>
              <p class="text-xs text-text-secondary mt-0.5">Form bertahap: identitas, pola penggunaan usaha/campuran, biaya awal, dan pengembangan bertahap.</p>
            </div>
          </button>

          <button
            type="button"
            @click="selectFormType('tanah')"
            class="flex items-start gap-3.5 p-4 rounded-xl border-2 border-border hover:border-navy hover:bg-navy/5 text-left transition group active:scale-[0.99]"
          >
            <span class="text-3xl p-2 bg-emerald-100 rounded-xl">🏞️</span>
            <div>
              <strong class="text-sm font-extrabold text-navy block group-hover:underline">Tanah</strong>
              <p class="text-xs text-text-secondary mt-0.5">Pencatatan tanah terpisah dari gedung. Tidak mengalami penyusutan.</p>
            </div>
          </button>

          <button
            type="button"
            @click="selectFormType('barang')"
            class="flex items-start gap-3.5 p-4 rounded-xl border-2 border-border hover:border-navy hover:bg-navy/5 text-left transition group active:scale-[0.99]"
          >
            <span class="text-3xl p-2 bg-blue-100 rounded-xl">🛏️</span>
            <div>
              <strong class="text-sm font-extrabold text-navy block group-hover:underline">Fasilitas Kamar & Barang Inventaris</strong>
              <p class="text-xs text-text-secondary mt-0.5">Form ringkas: perabot kamar, AC, pompa air, dispenser, peralatan operasional.</p>
            </div>
          </button>
        </div>
      </div>

      <!-- ============================================================== -->
      <!-- FORM BERTAHAP (GEDUNG & TANAH) -->
      <!-- ============================================================== -->
      <div v-else-if="formMode === 'wizard'" class="space-y-4">
        <!-- Stepbar Progress -->
        <div class="flex items-center gap-1.5 bg-white p-2.5 rounded-2xl border-2 border-border text-xs font-bold shadow-sm">
          <div
            v-for="(st, idx) in wizardSteps"
            :key="idx"
            class="flex-1 py-1.5 text-center rounded-xl transition"
            :class="currentStep === idx
              ? 'bg-navy text-white shadow-sm'
              : currentStep > idx
                ? 'text-emerald-700 bg-emerald-50'
                : 'text-text-muted'"
          >
            {{ idx + 1 }}. {{ st }}
          </div>
        </div>

        <!-- Langkah 1: Identitas -->
        <div v-if="currentStep === 0" class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-4">
          <h2 class="text-base font-black text-navy">Langkah 1: Identitas Aset</h2>
          <p class="text-xs text-text-secondary">Identitas pemilik dan dasar penggunaan dicatat per aset. Pengelola aplikasi tidak otomatis menjadi pemilik aset.</p>

          <div>
            <label class="block text-xs font-bold text-text-secondary mb-1">Nama Aset / Bangunan *</label>
            <input
              v-model="form.nama_aset"
              type="text"
              placeholder="Contoh: Gedung Kos Utama, Tanah Hamur 33"
              class="w-full bg-white border-2 border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-navy"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-text-secondary mb-1">Kategori</label>
              <select
                v-model="form.kategori_aset"
                class="w-full bg-white border-2 border-border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-navy"
              >
                <option value="gedung">Gedung / Bangunan</option>
                <option value="tanah">Tanah</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-text-secondary mb-1">Dasar Penggunaan</label>
              <select
                v-model="form.dasar_penggunaan"
                class="w-full bg-white border-2 border-border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-navy"
              >
                <option value="milik_sendiri">Milik Sendiri</option>
                <option value="sewa">Sewa</option>
                <option value="pinjam_pakai">Pinjam Pakai</option>
                <option value="dikelola_pihak_lain">Dikelola Pihak Lain</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-bold text-text-secondary mb-1">Nama Pemilik Sah Aset</label>
            <input
              v-model="form.nama_pemilik"
              type="text"
              placeholder="Dapat berbeda dari akun pengguna"
              class="w-full bg-white border-2 border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-navy"
            />
            <small class="text-[11px] text-text-muted mt-1 block">Pemilik fisik aset tetap dapat dicatat terpisah dari hak akses akun.</small>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-bold text-text-secondary mb-1">Lokasi Kos Fisik</label>
              <select
                v-model="form.location_id"
                class="w-full bg-white border-2 border-border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-navy"
              >
                <option :value="null">-- Tidak Terikat Lokasi --</option>
                <option v-for="loc in locationsList" :key="loc.id" :value="loc.id">
                  {{ loc.nama_lokasi }}
                </option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-bold text-text-secondary mb-1">Kondisi Fisik</label>
              <select
                v-model="form.kondisi_fisik"
                class="w-full bg-white border-2 border-border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-navy"
              >
                <option value="sangat_baik">Sangat Baik</option>
                <option value="baik">Baik</option>
                <option value="rusak_ringan">Rusak Ringan</option>
                <option value="rusak_berat">Rusak Berat</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Langkah 2: Penggunaan (Khusus Gedung) -->
        <div v-else-if="currentStep === 1" class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-4">
          <h2 class="text-base font-black text-navy">Langkah 2: Pola Penggunaan</h2>
          <p class="text-xs text-text-secondary">Tentukan apakah gedung digunakan seluruhnya untuk usaha kos atau berbagi tempat dengan tempat tinggal nonusaha (keluarga).</p>

          <div>
            <label class="block text-xs font-bold text-text-secondary mb-1">Pola Penggunaan</label>
            <div class="grid grid-cols-2 gap-3">
              <button
                type="button"
                @click="componentForm.pola_penggunaan = 'seluruhnya_usaha'"
                class="p-3 rounded-xl border-2 font-bold text-xs transition"
                :class="componentForm.pola_penggunaan === 'seluruhnya_usaha'
                  ? 'border-navy bg-navy/10 text-navy'
                  : 'border-border text-text-secondary'"
              >
                Seluruhnya Usaha (100%)
              </button>
              <button
                type="button"
                @click="componentForm.pola_penggunaan = 'campuran'"
                class="p-3 rounded-xl border-2 font-bold text-xs transition"
                :class="componentForm.pola_penggunaan === 'campuran'
                  ? 'border-navy bg-navy/10 text-navy'
                  : 'border-border text-text-secondary'"
              >
                Campuran (Usaha + Nonusaha)
              </button>
            </div>
          </div>

          <div v-if="componentForm.pola_penggunaan === 'campuran'" class="space-y-3 pt-2">
            <p class="text-xs text-text-muted">Masukkan luas lantai total (m²). Area bersama akan dialokasikan secara proporsional sesuai rasio area khusus.</p>

            <div class="grid grid-cols-3 gap-2.5">
              <div>
                <label class="block text-[11px] font-bold text-text-secondary mb-1">Khusus Kos (m²)</label>
                <input
                  v-model.number="componentForm.luas_khusus_usaha"
                  type="number"
                  min="0"
                  class="w-full bg-white border-2 border-border rounded-xl p-2.5 text-sm font-semibold"
                />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-text-secondary mb-1">Nonusaha (m²)</label>
                <input
                  v-model.number="componentForm.luas_nonusaha"
                  type="number"
                  min="0"
                  class="w-full bg-white border-2 border-border rounded-xl p-2.5 text-sm font-semibold"
                />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-text-secondary mb-1">Bersama (m²)</label>
                <input
                  v-model.number="componentForm.luas_bersama"
                  type="number"
                  min="0"
                  class="w-full bg-white border-2 border-border rounded-xl p-2.5 text-sm font-semibold"
                />
              </div>
            </div>

            <!-- Kalkulasi Alokasi Area Realtime -->
            <div
              class="p-3.5 rounded-xl border-2 text-xs space-y-1.5"
              :class="areaCalc.isZeroDenominator ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-blue-50 border-blue-200 text-blue-950'"
            >
              <div v-if="areaCalc.isZeroDenominator" class="font-bold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>Luas khusus kos atau nonusaha harus lebih dari 0 m² untuk menghitung proporsi usaha (tidak dapat dihitung otomatis).</span>
              </div>
              <template v-else>
                <div class="flex justify-between">
                  <span>Luas Fisik Total:</span>
                  <b>{{ areaCalc.luasTotal }} m²</b>
                </div>
                <div class="flex justify-between">
                  <span>Luas Usaha Efektif:</span>
                  <b>{{ areaCalc.luasUsahaEfektif }} m²</b>
                </div>
                <div class="flex justify-between">
                  <span>Luas Nonusaha Efektif:</span>
                  <b>{{ areaCalc.luasNonUsahaEfektif }} m²</b>
                </div>
                <div class="flex justify-between pt-1 border-t border-blue-200/60 font-black text-navy text-sm">
                  <span>Porsi Usaha Terhitung:</span>
                  <span>{{ areaCalc.porsiUsahaPersen !== null ? areaCalc.porsiUsahaPersen + '%' : 'Belum ditentukan' }}</span>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- Langkah 3: Biaya & Riwayat Bangunan -->
        <div v-else-if="currentStep === 2" class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-4">
          <h2 class="text-base font-black text-navy">Langkah 3: Biaya & Riwayat</h2>
          <p class="text-xs text-text-secondary">Data yang belum diketahui boleh dikosongkan. Tahun perolehan tidak otomatis diubah menjadi tanggal 1 Januari.</p>

          <div class="border-b border-border pb-4 space-y-3">
            <h3 class="text-sm font-bold text-navy flex items-center gap-1.5">
              <span>🏗️</span>
              <span>Perolehan / Bangunan Awal</span>
            </h3>

            <div>
              <label class="block text-xs font-bold text-text-secondary mb-1">Biaya Perolehan / Pembangunan (Rp)</label>
              <input
                v-model.number="componentForm.biaya_perolehan"
                type="number"
                min="0"
                placeholder="Kosongkan jika belum diketahui"
                class="w-full bg-white border-2 border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-navy"
              />
              <small class="text-[11px] text-text-muted mt-0.5 block">Disimpan sebagai NULL bila dikosongkan, bukan nol.</small>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-text-secondary mb-1">Tahun Perolehan (Tahun saja)</label>
                <input
                  v-model.number="componentForm.tahun_perolehan"
                  type="number"
                  placeholder="Contoh: 2021"
                  class="w-full bg-white border-2 border-border rounded-xl px-3 py-2 text-sm font-semibold"
                />
              </div>
              <div>
                <label class="block text-xs font-bold text-text-secondary mb-1">Tanggal Siap Guna (Opsional)</label>
                <input
                  v-model="componentForm.tanggal_siap_guna"
                  type="date"
                  class="w-full bg-white border-2 border-border rounded-xl px-3 py-2 text-sm font-semibold"
                />
              </div>
            </div>
          </div>

          <!-- Parameter Penyusutan (jika bukan tanah) -->
          <div v-if="form.kategori_aset !== 'tanah'" class="space-y-3">
            <h3 class="text-sm font-bold text-navy flex items-center gap-1.5">
              <span>📉</span>
              <span>Parameter Penyusutan (Simulasi)</span>
            </h3>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-text-secondary mb-1">Masa Manfaat (Tahun)</label>
                <input
                  v-model.number="componentForm.masa_manfaat_tahun"
                  type="number"
                  min="1"
                  placeholder="Misal: 20"
                  class="w-full bg-white border-2 border-border rounded-xl px-3 py-2 text-sm font-semibold"
                />
              </div>
              <div>
                <label class="block text-xs font-bold text-text-secondary mb-1">Nilai Sisa / Residu (Rp)</label>
                <input
                  v-model.number="componentForm.nilai_sisa"
                  type="number"
                  min="0"
                  placeholder="Default: 0"
                  class="w-full bg-white border-2 border-border rounded-xl px-3 py-2 text-sm font-semibold"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Langkah 4: Pratinjau Draf -->
        <div v-else-if="currentStep === 3" class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-black text-navy">Langkah 4: Pratinjau Draf</h2>
            <span class="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300">
              Draf · Belum Masuk Jurnal
            </span>
          </div>

          <div class="p-4 bg-gray-50 border-2 border-border rounded-xl space-y-2 text-xs">
            <div class="flex justify-between py-1 border-b border-border">
              <span class="text-text-muted">Nama Aset:</span>
              <strong class="text-text-primary">{{ form.nama_aset || '-' }}</strong>
            </div>
            <div class="flex justify-between py-1 border-b border-border">
              <span class="text-text-muted">Kategori:</span>
              <span>{{ getAssetCategoryLabel(form.kategori_aset) }}</span>
            </div>
            <div class="flex justify-between py-1 border-b border-border">
              <span class="text-text-muted">Pemilik:</span>
              <span>{{ form.nama_pemilik || 'Belum diisi' }} ({{ form.dasar_penggunaan }})</span>
            </div>
            <div class="flex justify-between py-1 border-b border-border">
              <span class="text-text-muted">Biaya Perolehan:</span>
              <b>{{ componentForm.biaya_perolehan ? formatCurrency(componentForm.biaya_perolehan) : 'Belum diketahui' }}</b>
            </div>
            <div class="flex justify-between py-1 border-b border-border">
              <span class="text-text-muted">Porsi Usaha:</span>
              <b>{{ calculatedPorsiUsaha !== null ? calculatedPorsiUsaha + '%' : 'Belum ditentukan' }}</b>
            </div>
            <div v-if="form.kategori_aset !== 'tanah'" class="flex justify-between py-1">
              <span class="text-text-muted">Simulasi Beban Bulanan:</span>
              <b class="text-navy font-black">{{ monthlyDeprEstimated }}</b>
            </div>
          </div>

          <div class="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-3 text-xs leading-relaxed">
            💡 Draf ini dapat disimpan kapan saja. Tidak menghasilkan transaksi kas keluar ganda atau jurnal pembukuan sampai diverifikasi pada fase selanjutnya.
          </div>
        </div>

        <!-- Tombol Aksi Wizard -->
        <div class="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            @click="prevStep"
            class="px-4 py-3 rounded-xl border-2 border-border bg-white text-text-primary font-bold text-sm hover:bg-gray-50 active:scale-95 transition"
          >
            {{ currentStep === 0 ? 'Batal' : '‹ Sebelumnya' }}
          </button>

          <div class="flex items-center gap-2">
            <!-- Simpan Draf Cepat Kapan Saja -->
            <button
              type="button"
              @click="saveAsset"
              :disabled="isSubmitting"
              class="px-4 py-3 rounded-xl border-2 border-navy text-navy font-extrabold text-sm hover:bg-navy/5 active:scale-95 transition disabled:opacity-50"
            >
              Simpan Draf
            </button>

            <!-- Lanjut Langkah Berikutnya -->
            <button
              v-if="currentStep < 3"
              type="button"
              @click="nextStep"
              class="px-5 py-3 rounded-xl bg-navy text-white font-extrabold text-sm shadow hover:bg-navy-light active:scale-95 transition"
            >
              Lanjutkan ›
            </button>
          </div>
        </div>
      </div>

      <!-- ============================================================== -->
      <!-- FORM RINGKAS (BARANG / FASILITAS KAMAR & UMUM) -->
      <!-- ============================================================== -->
      <div v-else-if="formMode === 'simple'" class="bg-white rounded-2xl border-2 border-border p-5 shadow-sm space-y-4">
        <div class="flex items-center justify-between border-b border-border pb-3">
          <h2 class="text-base font-black text-navy">Formulir Barang Inventaris</h2>
          <span class="text-xs font-bold text-text-muted">Ringkas</span>
        </div>

        <div>
          <label class="block text-xs font-bold text-text-secondary mb-1">Nama Barang *</label>
          <input
            v-model="form.nama_aset"
            type="text"
            placeholder="Contoh: AC Daikin 1/2 PK, Lemari 2 Pintu"
            class="w-full bg-white border-2 border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-navy"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-text-secondary mb-1">Kategori Barang</label>
            <select
              v-model="form.kategori_aset"
              class="w-full bg-white border-2 border-border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-navy"
            >
              <option value="fasilitas_kamar">Fasilitas Kamar</option>
              <option value="fasilitas_umum">Fasilitas Umum</option>
              <option value="elektronik_kantor">Elektronik</option>
              <option value="kendaraan">Kendaraan</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-text-secondary mb-1">Kondisi Fisik</label>
            <select
              v-model="form.kondisi_fisik"
              class="w-full bg-white border-2 border-border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-navy"
            >
              <option value="sangat_baik">Sangat Baik</option>
              <option value="baik">Baik</option>
              <option value="rusak_ringan">Rusak Ringan</option>
              <option value="rusak_berat">Rusak Berat</option>
              <option value="hilang">Hilang</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-text-secondary mb-1">Lokasi Kos</label>
            <select
              v-model="form.location_id"
              class="w-full bg-white border-2 border-border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-navy"
            >
              <option :value="null">-- Pilih Lokasi --</option>
              <option v-for="loc in locationsList" :key="loc.id" :value="loc.id">
                {{ loc.nama_lokasi }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-text-secondary mb-1">Khusus Kamar</label>
            <select
              v-model="form.room_id"
              class="w-full bg-white border-2 border-border rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-navy"
            >
              <option :value="null">-- Bukan Kamar Spesifik --</option>
              <option v-for="r in availableRooms" :key="r.id" :value="r.id">
                Kamar {{ r.nomor_kamar }}
              </option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold text-text-secondary mb-1">Harga Beli / Biaya (Rp)</label>
            <input
              v-model.number="componentForm.biaya_perolehan"
              type="number"
              min="0"
              placeholder="Kosongkan jika belum tahu"
              class="w-full bg-white border-2 border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-navy"
            />
          </div>
          <div>
            <label class="block text-xs font-bold text-text-secondary mb-1">Tanggal Pembelian</label>
            <input
              v-model="componentForm.tanggal_perolehan"
              type="date"
              class="w-full bg-white border-2 border-border rounded-xl px-3 py-2.5 text-sm font-semibold"
            />
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-text-secondary mb-1">Catatan</label>
          <textarea
            v-model="form.catatan"
            rows="2"
            placeholder="Keterangan tambahan..."
            class="w-full bg-white border-2 border-border rounded-xl p-3 text-sm font-semibold"
          ></textarea>
        </div>

        <div class="flex items-center justify-between gap-3 pt-3 border-t border-border">
          <button
            type="button"
            @click="goBack"
            class="px-4 py-3 rounded-xl border-2 border-border bg-white text-text-primary font-bold text-sm hover:bg-gray-50 active:scale-95 transition"
          >
            Batal
          </button>
          <button
            type="button"
            @click="saveAsset"
            :disabled="isSubmitting"
            class="px-6 py-3 rounded-xl bg-navy text-white font-extrabold text-sm shadow hover:bg-navy-light active:scale-95 transition disabled:opacity-50"
          >
            {{ isSubmitting ? 'Menyimpan...' : 'Simpan Draf Aset' }}
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../supabase.js'
import { calculateSharedAreaAllocation, getAssetCategoryLabel, getCurrentUserRole } from '../lib/aset.js'

const router = useRouter()
const route = useRoute()

const isEditMode = computed(() => !!route.params.id)
const isSubmitting = ref(false)
const stepSelection = ref(!isEditMode.value)
const formMode = ref('wizard') // 'wizard' | 'simple'
const currentStep = ref(0)
const wizardSteps = ['Identitas', 'Penggunaan', 'Biaya', 'Pratinjau']

const locationsList = ref([])
const roomsList = ref([])
const currentUserRole = ref(null)

const form = reactive({
  nama_aset: '',
  kategori_aset: 'gedung',
  dasar_penggunaan: 'milik_sendiri',
  nama_pemilik: '',
  location_id: null,
  room_id: null,
  kondisi_fisik: 'baik',
  status_penggunaan: 'aktif',
  status_pencatatan: 'draft',
  catatan: '',
})

const componentForm = reactive({
  biaya_perolehan: null,
  tahun_perolehan: null,
  tanggal_perolehan: null,
  tanggal_siap_guna: null,
  masa_manfaat_tahun: 20,
  nilai_sisa: 0,
  pola_penggunaan: 'seluruhnya_usaha',
  luas_khusus_usaha: 0,
  luas_nonusaha: 0,
  luas_bersama: 0,
})

function selectFormType(type) {
  stepSelection.value = false
  if (type === 'gedung') {
    form.kategori_aset = 'gedung'
    formMode.value = 'wizard'
  } else if (type === 'tanah') {
    form.kategori_aset = 'tanah'
    formMode.value = 'wizard'
  } else {
    form.kategori_aset = 'fasilitas_kamar'
    formMode.value = 'simple'
  }
}

const availableRooms = computed(() => {
  if (!form.location_id) return roomsList.value
  return roomsList.value.filter(r => r.location_id === form.location_id)
})

const areaCalc = computed(() => {
  return calculateSharedAreaAllocation(
    componentForm.luas_khusus_usaha,
    componentForm.luas_nonusaha,
    componentForm.luas_bersama
  )
})

const calculatedPorsiUsaha = computed(() => {
  if (componentForm.pola_penggunaan === 'seluruhnya_usaha') return 100
  return areaCalc.value.porsiUsahaPersen
})

const monthlyDeprEstimated = computed(() => {
  if (!componentForm.biaya_perolehan || !componentForm.masa_manfaat_tahun) return 'Belum dapat dihitung'
  const basis = componentForm.biaya_perolehan - (componentForm.nilai_sisa || 0)
  if (basis <= 0) return 'Rp 0'
  const monthlyTotal = basis / (componentForm.masa_manfaat_tahun * 12)
  const porsi = calculatedPorsiUsaha.value !== null ? calculatedPorsiUsaha.value / 100 : null
  if (porsi === null) return 'Porsi belum ditentukan'
  const monthlyUsaha = monthlyTotal * porsi
  return formatCurrency(Math.round(monthlyUsaha)) + ' / bln'
})

function nextStep() {
  if (currentStep.value === 0 && !form.nama_aset.trim()) {
    alert('Nama aset wajib diisi.')
    return
  }
  if (currentStep.value < 3) {
    currentStep.value++
    window.scrollTo(0, 0)
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
    window.scrollTo(0, 0)
  } else {
    goBack()
  }
}

function goBack() {
  router.push('/aset')
}

async function loadInitialData() {
  currentUserRole.value = await getCurrentUserRole(supabase)

  const { data: locs } = await supabase.from('locations').select('id, nama_lokasi').order('nama_lokasi')
  locationsList.value = locs || []

  const { data: rms } = await supabase.from('rooms').select('id, location_id, nomor_kamar').order('nomor_kamar')
  roomsList.value = rms || []

  if (isEditMode.value) {
    stepSelection.value = false
    const { data: asset, error } = await supabase
      .from('assets')
      .select('*, asset_components(*)')
      .eq('id', route.params.id)
      .single()

    if (error || !asset) {
      alert('Aset tidak ditemukan.')
      router.push('/aset')
      return
    }

    form.nama_aset = asset.nama_aset
    form.kategori_aset = asset.kategori_aset
    form.dasar_penggunaan = asset.dasar_penggunaan
    form.nama_pemilik = asset.nama_pemilik || ''
    form.location_id = asset.location_id
    form.room_id = asset.room_id
    form.kondisi_fisik = asset.kondisi_fisik
    form.status_penggunaan = asset.status_penggunaan
    form.status_pencatatan = asset.status_pencatatan
    form.catatan = asset.catatan || ''

    if (['gedung', 'tanah'].includes(asset.kategori_aset)) {
      formMode.value = 'wizard'
    } else {
      formMode.value = 'simple'
    }

    const comp = asset.asset_components?.[0]
    if (comp) {
      componentForm.biaya_perolehan = comp.biaya_perolehan
      componentForm.tahun_perolehan = comp.tahun_perolehan
      componentForm.tanggal_perolehan = comp.tanggal_perolehan
      componentForm.tanggal_siap_guna = comp.tanggal_siap_guna
      componentForm.masa_manfaat_tahun = comp.masa_manfaat_bulan ? Math.round(comp.masa_manfaat_bulan / 12) : 20
      componentForm.nilai_sisa = comp.nilai_sisa || 0
      componentForm.pola_penggunaan = comp.pola_penggunaan || 'seluruhnya_usaha'
      componentForm.luas_khusus_usaha = comp.luas_khusus_usaha || 0
      componentForm.luas_nonusaha = comp.luas_nonusaha || 0
      componentForm.luas_bersama = comp.luas_bersama || 0
    }
  }
}

async function saveAsset() {
  if (!form.nama_aset.trim()) {
    alert('Nama aset wajib diisi.')
    return
  }

  isSubmitting.value = true
  try {
    const assetPayload = {
      nama_aset: form.nama_aset.trim(),
      kategori_aset: form.kategori_aset,
      dasar_penggunaan: form.dasar_penggunaan,
      nama_pemilik: form.nama_pemilik.trim() || null,
      location_id: form.location_id,
      room_id: form.room_id,
      kondisi_fisik: form.kondisi_fisik,
      status_penggunaan: form.status_penggunaan,
      status_pencatatan: 'draft', // Selalu draft pada Fase 2
      catatan: form.catatan?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    let assetId = route.params.id

    if (isEditMode.value) {
      const { error: updateErr } = await supabase
        .from('assets')
        .update(assetPayload)
        .eq('id', assetId)
      if (updateErr) throw updateErr
    } else {
      const { data: newAsset, error: insertErr } = await supabase
        .from('assets')
        .insert(assetPayload)
        .select('id')
        .single()
      if (insertErr) throw insertErr
      assetId = newAsset.id
    }

    // Upsert Main Component
    const compPayload = {
      asset_id: assetId,
      nama_komponen: form.kategori_aset === 'gedung' ? 'Bangunan Awal' : form.nama_aset,
      jenis_pekerjaan: form.kategori_aset === 'gedung' ? 'bangunan_awal' : 'perolehan_baru',
      biaya_perolehan: componentForm.biaya_perolehan !== null && componentForm.biaya_perolehan !== '' ? componentForm.biaya_perolehan : null,
      tahun_perolehan: componentForm.tahun_perolehan || null,
      tanggal_perolehan: componentForm.tanggal_perolehan || null,
      tanggal_siap_guna: componentForm.tanggal_siap_guna || null,
      nilai_sisa: componentForm.nilai_sisa || 0,
      masa_manfaat_bulan: form.kategori_aset === 'tanah' ? null : (componentForm.masa_manfaat_tahun ? componentForm.masa_manfaat_tahun * 12 : null),
      metode_penyusutan: form.kategori_aset === 'tanah' ? 'tidak_disusutkan' : 'garis_lurus',
      pola_penggunaan: componentForm.pola_penggunaan,
      luas_khusus_usaha: componentForm.luas_khusus_usaha || 0,
      luas_nonusaha: componentForm.luas_nonusaha || 0,
      luas_bersama: componentForm.luas_bersama || 0,
      porsi_usaha_persen: calculatedPorsiUsaha.value,
      status_kapitalisasi: 'perlu_telaah',
      updated_at: new Date().toISOString(),
    }

    if (isEditMode.value) {
      const { data: existingComp } = await supabase
        .from('asset_components')
        .select('id')
        .eq('asset_id', assetId)
        .limit(1)
        .maybeSingle()

      if (existingComp) {
        await supabase
          .from('asset_components')
          .update(compPayload)
          .eq('id', existingComp.id)
      } else {
        await supabase.from('asset_components').insert(compPayload)
      }
    } else {
      await supabase.from('asset_components').insert(compPayload)
    }

    router.push(`/aset/${assetId}`)
  } catch (err) {
    console.error('[SimKos] Gagal menyimpan aset:', err)
    alert(`Gagal menyimpan aset: ${err.message}`)
  } finally {
    isSubmitting.value = false
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
  loadInitialData()
})
</script>