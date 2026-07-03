<template>
  <nav class="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-border shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
       :style="{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }">
    <div class="flex items-stretch justify-around max-w-lg mx-auto">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="flex flex-col items-center justify-center flex-1 py-3 gap-1 transition-all duration-200 relative group"
        :class="isActive(item.to)
          ? 'text-navy'
          : 'text-text-muted hover:text-text-secondary'"
      >
        <!-- Active indicator pill -->
        <span
          v-if="isActive(item.to)"
          class="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-navy rounded-b-full"
        />

        <!-- Icon -->
        <span
          class="w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-200"
          :class="isActive(item.to) ? 'bg-navy/10 scale-110' : 'group-hover:bg-gray-100'"
        >
          <component :is="item.icon" class="w-6 h-6" />
        </span>

        <!-- Label -->
        <span
          class="text-xs font-semibold tracking-wide"
          :class="isActive(item.to) ? 'text-navy' : ''"
        >
          {{ item.label }}
        </span>
      </router-link>
    </div>
  </nav>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { h } from 'vue'

const route = useRoute()

const isActive = (path) => {
  return route.path === path
}

// SVG Icon Components
const IconBeranda = {
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      fill: 'none',
      viewBox: '0 0 24 24',
      'stroke-width': '2',
      stroke: 'currentColor',
    }, [
      h('path', {
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        d: 'M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
      }),
    ])
  },
}

const IconKeuangan = {
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      fill: 'none',
      viewBox: '0 0 24 24',
      'stroke-width': '2',
      stroke: 'currentColor',
    }, [
      h('path', {
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        d: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
      }),
    ])
  },
}

const IconInventaris = {
  render() {
    return h('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      fill: 'none',
      viewBox: '0 0 24 24',
      'stroke-width': '2',
      stroke: 'currentColor',
    }, [
      h('path', {
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        d: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
      }),
    ])
  },
}

const navItems = [
  { to: '/', label: 'Beranda', icon: IconBeranda },
  { to: '/keuangan', label: 'Keuangan', icon: IconKeuangan },
  { to: '/inventaris', label: 'Inventaris', icon: IconInventaris },
]
</script>
