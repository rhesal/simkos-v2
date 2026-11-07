<template>
  <div
    v-if="totalItems > pageSize"
    class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 pb-1 border-t border-border mt-4 text-xs font-semibold select-none"
  >
    <!-- Info Ringkasan Data -->
    <div class="text-text-secondary text-center sm:text-left">
      Menampilkan
      <span class="font-extrabold text-text-primary">{{ fromItem }}</span>
      -
      <span class="font-extrabold text-text-primary">{{ toItem }}</span>
      dari
      <span class="font-extrabold text-text-primary">{{ totalItems }}</span>
      {{ itemLabel }}
    </div>

    <!-- Tombol Navigasi Halaman -->
    <div class="flex items-center gap-1.5">
      <!-- Tombol Sebelumnya -->
      <button
        type="button"
        @click="goToPage(currentPage - 1)"
        :disabled="currentPage <= 1"
        class="px-3 py-2 rounded-xl border border-border bg-white text-text-primary hover:bg-gray-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition-all font-bold flex items-center gap-1 shadow-sm"
        aria-label="Halaman sebelumnya"
      >
        <span>‹</span>
        <span class="hidden sm:inline">Sebelumnya</span>
      </button>

      <!-- Badge Indikator Halaman -->
      <span class="px-3 py-2 rounded-xl bg-navy/10 text-navy font-black border border-navy/20 min-w-[70px] text-center">
        {{ currentPage }} / {{ totalPages }}
      </span>

      <!-- Tombol Berikutnya -->
      <button
        type="button"
        @click="goToPage(currentPage + 1)"
        :disabled="currentPage >= totalPages"
        class="px-3 py-2 rounded-xl border border-border bg-white text-text-primary hover:bg-gray-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition-all font-bold flex items-center gap-1 shadow-sm"
        aria-label="Halaman berikutnya"
      >
        <span class="hidden sm:inline">Berikutnya</span>
        <span>›</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: Number,
    default: 1
  },
  totalItems: {
    type: Number,
    required: true
  },
  pageSize: {
    type: Number,
    default: 10
  },
  itemLabel: {
    type: String,
    default: 'data'
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const currentPage = computed(() => Math.max(1, props.modelValue || 1))

const totalPages = computed(() => {
  return Math.ceil(props.totalItems / props.pageSize) || 1
})

const fromItem = computed(() => {
  if (props.totalItems === 0) return 0
  return (currentPage.value - 1) * props.pageSize + 1
})

const toItem = computed(() => {
  return Math.min(currentPage.value * props.pageSize, props.totalItems)
})

function goToPage(page) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) return
  emit('update:modelValue', page)
  emit('change', page)
}
</script>
