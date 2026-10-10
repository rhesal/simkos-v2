<template>
  <!--
    Lapisan modal bersama. Di-teleport ke <body> supaya tidak terjebak di
    stacking context halaman, dan z-[60] supaya selalu di atas BottomNav (z-50).
    Panel selalu di tengah layar; padding mengikuti safe-area HP (notch/gestur).
    Warna latar, blur, animasi, dan listener (mis. @click.self) diteruskan
    lewat atribut dari pemanggil.
  -->
  <Teleport to="body">
    <div
      v-bind="$attrs"
      class="base-modal-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <slot />
    </div>
  </Teleport>
</template>

<script>
// Jumlah modal yang sedang terbuka (modal bisa bertumpuk, mis. KTP di atas
// Detail Penghuni). Scroll body dikunci selama masih ada yang terbuka.
let openCount = 0
let savedOverflow = ''
</script>

<script setup>
import { onMounted, onUnmounted } from 'vue'

defineOptions({ inheritAttrs: false })

// Kunci scroll halaman di belakang modal; dilepas saat modal ditutup.
onMounted(() => {
  if (openCount++ === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
})
onUnmounted(() => {
  if (--openCount === 0) document.body.style.overflow = savedOverflow
})
</script>

<style scoped>
.base-modal-overlay {
  padding-top: max(1rem, env(safe-area-inset-top));
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
</style>
