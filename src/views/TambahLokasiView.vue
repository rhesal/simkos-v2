<template>
  <div>
    <!-- Header -->
    <header class="bg-navy text-white px-6 pt-5 pb-6 shadow-lg rounded-b-[1.5rem]">
      <div class="flex items-center gap-4">
        <button
          @click="$router.back()"
          class="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center active:scale-95 transition-transform flex-shrink-0"
          aria-label="Kembali"
        >
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight">Tambah Lokasi</h1>
          <p class="text-sm text-blue-200 mt-0.5 font-medium">Tambahkan properti kos baru</p>
        </div>
      </div>
    </header>

    <!-- Form Body -->
    <div class="px-6 py-6 space-y-6 max-w-lg mx-auto">

      <!-- Success Feedback -->
      <div
        v-if="successMsg"
        class="bg-income-light border-2 border-income/30 text-income rounded-[var(--radius-card)] p-5 flex items-center gap-3 animate-fade-in-up"
      >
        <svg class="w-7 h-7 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="text-lg font-bold">{{ successMsg }}</span>
      </div>

      <!-- Error Feedback -->
      <div
        v-if="errorMsg"
        class="bg-expense-light border-2 border-expense/30 text-expense rounded-[var(--radius-card)] p-5 flex items-center gap-3 animate-fade-in-up"
      >
        <svg class="w-7 h-7 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <span class="text-lg font-bold">{{ errorMsg }}</span>
      </div>

      <!-- Nama Lokasi -->
      <div class="space-y-2 animate-fade-in-up animate-stagger-1">
        <label for="nama-lokasi" class="block text-lg font-bold text-text-primary">
          Nama Lokasi <span class="text-expense">*</span>
        </label>
        <input
          id="nama-lokasi"
          v-model="form.nama_lokasi"
          type="text"
          placeholder="Contoh: Kos Melati"
          class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                 px-5 py-4 text-lg font-semibold text-text-primary placeholder-text-muted
                 focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                 transition-all duration-200 shadow-sm"
        />
      </div>

      <!-- Alamat -->
      <div class="space-y-2 animate-fade-in-up animate-stagger-2">
        <label for="alamat" class="block text-lg font-bold text-text-primary">
          Alamat
        </label>
        <textarea
          id="alamat"
          v-model="form.alamat"
          rows="3"
          placeholder="Contoh: Jl. Mawar No. 10, Bandung"
          class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                 px-5 py-4 text-lg font-semibold text-text-primary placeholder-text-muted
                 focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                 transition-all duration-200 shadow-sm resize-none"
        />
      </div>

      <!-- Submit Button -->
      <div class="animate-fade-in-up animate-stagger-3 pt-2">
        <button
          @click="handleSubmit"
          :disabled="isSubmitting || !form.nama_lokasi.trim()"
          class="w-full bg-navy text-white rounded-[var(--radius-btn)]
                 px-6 py-5 text-xl font-extrabold shadow-lg shadow-navy/25
                 active:scale-[0.97] transition-all duration-150
                 hover:shadow-xl hover:brightness-110
                 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
                 flex items-center justify-center gap-3"
        >
          <svg v-if="!isSubmitting" class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <!-- Spinner -->
          <svg v-else class="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>{{ isSubmitting ? 'Menyimpan...' : 'Simpan Lokasi' }}</span>
        </button>
      </div>

      <div class="h-8"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase.js'

const router = useRouter()
const isSubmitting = ref(false)
const successMsg = ref('')
const errorMsg = ref('')

const form = reactive({
  nama_lokasi: '',
  alamat: '',
})

async function handleSubmit() {
  if (!form.nama_lokasi.trim()) return

  isSubmitting.value = true
  errorMsg.value = ''
  successMsg.value = ''

  const { data, error } = await supabase
    .from('locations')
    .insert({
      nama_lokasi: form.nama_lokasi.trim(),
      alamat: form.alamat.trim(),
    })
    .select()

  isSubmitting.value = false

  if (error) {
    errorMsg.value = `Gagal menyimpan: ${error.message}`
    console.error('[Supabase] Insert location error:', error)
  } else {
    successMsg.value = 'Lokasi berhasil disimpan!'
    console.log('[Supabase] Lokasi baru:', data)
    setTimeout(() => {
      router.push('/')
    }, 1000)
  }
}
</script>
