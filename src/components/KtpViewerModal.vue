<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      @click.self="close"
    >
      <div
        ref="dialogEl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ktp-viewer-title"
        tabindex="-1"
        class="w-full max-w-md rounded-2xl bg-white shadow-xl outline-none"
        @keydown.esc.prevent="close"
      >
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 id="ktp-viewer-title" class="text-sm font-bold text-slate-800">
            KTP{{ tenantName ? ` — ${tenantName}` : '' }}
          </h2>
          <button
            type="button"
            class="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup"
            @click="close"
          >
            ✕
          </button>
        </div>

        <div class="p-4">
          <div
            v-if="status === 'loading'"
            class="flex aspect-[85.6/54] w-full animate-pulse items-center justify-center rounded-xl bg-slate-200"
          >
            <span class="text-xs font-medium text-slate-500">Memuat KTP…</span>
          </div>

          <img
            v-else-if="status === 'ready' && blobUrl"
            :src="blobUrl"
            alt="Foto KTP penghuni"
            class="max-h-[70vh] w-full rounded-xl object-contain"
            draggable="false"
            @contextmenu.prevent
          />

          <div
            v-else-if="status === 'error'"
            class="flex flex-col items-center gap-3 rounded-xl bg-red-50 px-4 py-6 text-center"
          >
            <span class="text-2xl" aria-hidden="true">⚠️</span>
            <p class="text-sm font-medium text-red-700">KTP gagal dimuat.</p>
            <button
              type="button"
              class="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
              @click="load"
            >
              Coba lagi
            </button>
          </div>
        </div>

        <div class="flex justify-end border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            class="rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-200"
            @click="close"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// Modal penampil KTP.
// - Gambar diambil lewat supabase.storage.download() (token sesi, dijaga RLS),
//   ditampilkan sebagai blob URL, lalu revokeObjectURL saat modal ditutup.
// - Tidak memakai signed URL / tab baru, jadi tidak ada URL yang masuk
//   riwayat browser atau bisa dibagikan.
// - Saat logout / user berganti, modal langsung tertutup dan blob dibuang.
import { ref, watch, nextTick, onUnmounted } from 'vue'
import { KTP_BUCKET, downloadPrivateFile, onStorageSignedOut } from '../lib/storage.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  // Nilai kolom foto_ktp_url (path objek, atau URL lama yang akan diubah ke path)
  storedValue: { type: String, default: '' },
  tenantName: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const status = ref('idle') // idle | loading | ready | error
const blobUrl = ref(null)
const dialogEl = ref(null)
let requestId = 0
let previousFocus = null

function releaseBlob() {
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value)
    blobUrl.value = null
  }
}

async function load() {
  const myRequest = ++requestId
  releaseBlob()
  status.value = 'loading'
  try {
    const blob = await downloadPrivateFile(KTP_BUCKET, props.storedValue)
    // Abaikan hasil bila modal sudah ditutup / dimuat ulang selama menunggu
    if (myRequest !== requestId || !props.open) return
    blobUrl.value = URL.createObjectURL(blob)
    status.value = 'ready'
  } catch (err) {
    if (myRequest !== requestId) return
    // Jangan log isi/path file (bisa memuat data pribadi); cukup pesan error.
    console.warn('[SimKos] Gagal memuat KTP:', err?.message || 'unknown error')
    status.value = 'error'
  }
}

function reset() {
  requestId++ // batalkan request yang masih berjalan
  releaseBlob()
  status.value = 'idle'
}

function close() {
  reset()
  emit('close')
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      previousFocus = document.activeElement
      load()
      await nextTick()
      dialogEl.value?.focus()
    } else {
      reset()
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus()
      previousFocus = null
    }
  },
  { immediate: true },
)

// Logout / ganti user: tutup modal & buang blob segera.
const stopSignedOut = onStorageSignedOut(() => {
  if (props.open || blobUrl.value) close()
})

onUnmounted(() => {
  stopSignedOut()
  reset()
})
</script>
