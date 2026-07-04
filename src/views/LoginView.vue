<template>
  <div class="min-h-dvh flex flex-col justify-between bg-bone px-6 py-12">
    <div class="w-full max-w-md mx-auto space-y-8 my-auto">
      <!-- Logo & Title -->
      <div class="text-center space-y-3">
        <div class="w-20 h-20 bg-navy rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-navy/20">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div class="space-y-1">
          <h1 class="text-4xl font-extrabold tracking-tight text-navy">SimKos</h1>
          <p class="text-base text-text-secondary font-medium">Sistem Manajemen Kos & Akuntansi</p>
        </div>
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

      <!-- Login Form Card -->
      <div class="bg-card border-2 border-border rounded-[var(--radius-card)] p-6 shadow-md space-y-6">
        <!-- Email Input -->
        <div class="space-y-2">
          <label for="email" class="block text-lg font-bold text-text-primary">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            placeholder="nama@email.com"
            class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                   px-5 py-4 text-lg font-semibold text-text-primary placeholder-text-muted
                   focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                   transition-all duration-200 shadow-sm"
          />
        </div>

        <!-- Password Input -->
        <div class="space-y-2">
          <label for="password" class="block text-lg font-bold text-text-primary">Kata Sandi</label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="••••••••"
            @keyup.enter="handleLogin"
            class="w-full bg-card border-2 border-border rounded-[var(--radius-btn)]
                   px-5 py-4 text-lg font-semibold text-text-primary placeholder-text-muted
                   focus:border-navy focus:ring-4 focus:ring-navy/10 focus:outline-none
                   transition-all duration-200 shadow-sm"
          />
        </div>

        <!-- Submit Button -->
        <button
          @click="handleLogin"
          :disabled="isLoading || !isFormValid"
          class="w-full bg-navy text-white rounded-[var(--radius-btn)]
                 px-6 py-5 text-xl font-extrabold shadow-lg shadow-navy/25
                 active:scale-[0.97] transition-all duration-150
                 hover:shadow-xl hover:brightness-110
                 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100
                 flex items-center justify-center gap-3"
        >
          <svg v-if="!isLoading" class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 11.517 1.28l-.517-.02a.75.75 0 010-1.24z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <!-- Spinner -->
          <svg v-else class="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>{{ isLoading ? 'Masuk...' : 'Masuk ke Aplikasi' }}</span>
        </button>
      </div>
    </div>
    <!-- Footer -->
    <div class="text-center text-sm font-semibold text-text-muted">
      SimKos &copy; 2026. Hak Cipta Dilindungi.
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase.js'

const router = useRouter()
const email = ref('')
const password = ref('')
const isLoading = ref(false)
const errorMsg = ref('')

const isFormValid = computed(() => {
  return email.value.trim() && password.value.length >= 6
})

async function handleLogin() {
  if (!isFormValid.value) return

  isLoading.value = true
  errorMsg.value = ''

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.value.trim(),
    password: password.value,
  })

  isLoading.value = false

  if (error) {
    if (error.status === 400) {
      errorMsg.value = 'Email atau kata sandi salah'
    } else {
      errorMsg.value = error.message
    }
    console.error('[Supabase Auth] Login error:', error)
  } else {
    console.log('[Supabase Auth] Login success:', data)
    router.push('/')
  }
}
</script>
