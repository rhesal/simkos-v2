<template>
  <div class="relative w-full">
    <!-- Backdrop Klik di Luar untuk Menutup Dropdown -->
    <div
      v-if="isOpen"
      class="fixed inset-0 z-40"
      @click="isOpen = false"
    />

    <!-- Tombol Trigger Dropdown -->
    <button
      type="button"
      @click="isOpen = !isOpen"
      :class="[
        'w-full flex items-center justify-between transition-all duration-200 focus:outline-none focus:ring-4 min-w-0',
        size === 'compact'
          ? 'px-4 py-3 rounded-xl text-sm font-bold'
          : 'px-5 py-4 rounded-[var(--radius-btn)] text-lg font-bold',
        theme === 'white'
          ? 'bg-white border-2 border-white/20 text-gray-800 shadow-sm focus:ring-navy/20'
          : 'bg-white/10 hover:bg-white/15 active:bg-white/20 border-2 border-white/20 text-white focus:ring-white/25'
      ]"
      :aria-expanded="isOpen"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <span
          :class="size === 'compact' ? 'text-lg' : 'text-2xl'"
          class="flex-shrink-0"
        >
          {{ selectedIcon }}
        </span>
        <span class="truncate">{{ selectedName }}</span>
      </div>

      <svg
        :class="[
          'transition-transform duration-200 flex-shrink-0 ml-2',
          size === 'compact' ? 'w-4 h-4' : 'w-6 h-6',
          theme === 'white' ? 'text-gray-500' : 'text-white/80',
          { 'rotate-180': isOpen }
        ]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        stroke-width="2.5"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
      </svg>
    </button>

    <!-- Floating Card Dropdown Menu -->
    <div
      v-if="isOpen"
      :class="[
        'absolute z-50 mt-2 bg-white rounded-[var(--radius-card)] border-2 border-border shadow-2xl overflow-hidden max-h-80 overflow-y-auto',
        size === 'compact'
          ? 'left-0 min-w-[260px] max-w-[calc(100vw-3rem)]'
          : 'left-0 right-0 w-full'
      ]"
    >
      <!-- Opsi Semua Lokasi -->
      <div
        v-if="showAll"
        class="flex items-center justify-between border-b border-border hover:bg-gray-50 active:bg-gray-100 transition-colors"
        :class="{ 'bg-navy/5': modelValue === 'ALL' }"
      >
        <button
          type="button"
          @click="select('ALL')"
          :class="size === 'compact' ? 'px-4 py-3 text-sm' : 'px-5 py-4 text-lg'"
          class="flex-1 text-left font-bold text-text-primary flex items-center gap-3 min-w-0"
        >
          <span :class="size === 'compact' ? 'text-lg' : 'text-2xl'" class="flex-shrink-0">🏢</span>
          <span class="truncate">{{ allLabel }}</span>
          <span
            v-if="locations && locations.length > 0"
            class="text-xs bg-navy/10 text-navy font-extrabold px-2.5 py-0.5 rounded-full ml-1 flex-shrink-0"
          >
            {{ locations.length }} Kos
          </span>
          <svg
            v-if="modelValue === 'ALL'"
            class="w-5 h-5 text-navy ml-auto flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="3"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </button>
      </div>

      <!-- Empty State jika belum ada lokasi -->
      <div
        v-if="(!locations || locations.length === 0) && !showAll"
        class="px-5 py-4 text-sm text-text-muted font-medium text-center"
      >
        Belum ada lokasi kos
      </div>

      <!-- Daftar Masing-Masing Lokasi Kos -->
      <div
        v-for="loc in locations"
        :key="loc.id"
        class="flex items-center justify-between border-b border-border last:border-0 hover:bg-gray-50 active:bg-gray-100 transition-colors"
        :class="{ 'bg-navy/5': loc.id === modelValue }"
      >
        <button
          type="button"
          @click="select(loc.id)"
          :class="size === 'compact' ? 'px-4 py-3 text-sm' : 'px-5 py-4 text-lg'"
          class="flex-1 text-left font-bold text-text-primary flex items-center gap-3 min-w-0"
        >
          <span :class="size === 'compact' ? 'text-lg' : 'text-2xl'" class="flex-shrink-0">🏠</span>
          <span class="truncate">{{ loc.nama_lokasi }}</span>
          <svg
            v-if="loc.id === modelValue"
            class="w-5 h-5 text-navy ml-auto flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="3"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: 'ALL'
  },
  locations: {
    type: Array,
    default: () => []
  },
  showAll: {
    type: Boolean,
    default: true
  },
  allLabel: {
    type: String,
    default: 'Semua Lokasi'
  },
  size: {
    type: String,
    default: 'normal' // 'normal' | 'compact'
  },
  theme: {
    type: String,
    default: 'navy' // 'navy' | 'white'
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const isOpen = ref(false)

const selectedIcon = computed(() => {
  return props.modelValue === 'ALL' ? '🏢' : '🏠'
})

const selectedName = computed(() => {
  if (props.modelValue === 'ALL') {
    return props.allLabel
  }
  const match = props.locations.find(loc => loc.id === props.modelValue)
  return match ? match.nama_lokasi : props.allLabel
})

function select(id) {
  emit('update:modelValue', id)
  emit('change', id)
  isOpen.value = false
}
</script>
