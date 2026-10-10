// Tes supabase/scripts/report_orphan_files.mjs (read-only) dengan stub di memori.
// Jalankan: node --test qa/move-script/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { report } from '../../supabase/scripts/report_orphan_files.mjs'

const ORG = '0f000000-0000-0000-0000-000000000001'
const ORG_B = '0f000000-0000-0000-0000-00000000000b'
const OLD = '2026-01-01T00:00:00Z'
const NOW = Date.parse('2026-10-10T08:00:00Z')

function makeFake({ inventoriesHasColumn = false, failTable = null } = {}) {
  const writes = []
  const db = {
    organizations: [{ id: ORG }, { id: ORG_B }],
    tenants: [
      { id: 't1', foto_ktp_url: `${ORG}/ktp_used.jpg` },
      { id: 't2', foto_ktp_url: null },
      { id: 't3', foto_ktp_url: `https://x.supabase.co/storage/v1/object/public/ktp_images/${ORG_B}/ktp_legacy_url.jpg` },
    ],
    expenses: [{ id: 'e1', bukti_nota_url: `${ORG}/nota_used.jpg` }],
    inventories: [{ id: 'i1', receipt_url: `${ORG}/inv_used.jpg` }],
  }
  const files = {
    ktp_images: new Map([
      [`${ORG}/ktp_used.jpg`, OLD],
      [`${ORG}/ktp_orphan.jpg`, OLD],
      [`${ORG}/sub/ktp_deep_orphan.jpg`, OLD],
      [`${ORG}/ktp_baru.jpg`, '2026-10-10T07:30:00Z'], // < 24 jam
      [`${ORG_B}/ktp_legacy_url.jpg`, OLD],
      ['ktp_root.jpg', OLD], // di luar folder org: bukan urusan laporan ini
    ]),
    receipt_images: new Map([
      [`${ORG}/nota_used.jpg`, OLD],
      [`${ORG}/inv_used.jpg`, OLD],
      [`${ORG_B}/nota_orphan.jpg`, OLD],
    ]),
  }
  function from(table) {
    const st = { cols: null, range: null }
    const b = {
      select(cols) { st.cols = cols; return b },
      order() { return b },
      range(a, z) { st.range = [a, z]; return b },
      update() { writes.push(['update', table]); throw new Error('tidak boleh menulis') },
      delete() { writes.push(['delete', table]); throw new Error('tidak boleh menulis') },
      insert() { writes.push(['insert', table]); throw new Error('tidak boleh menulis') },
      then(resolve) {
        if (failTable === table) return resolve({ data: null, error: { message: 'permission denied' } })
        if (table === 'inventories' && !inventoriesHasColumn && st.cols?.includes('receipt_url')) {
          return resolve({ data: null, error: { code: '42703', message: 'column inventories.receipt_url does not exist' } })
        }
        const rows = db[table]
        const [a, z] = st.range || [0, rows.length]
        resolve({ data: rows.slice(a, z + 1).map((r) => ({ ...r })), error: null })
      },
    }
    return b
  }
  const storage = {
    from(bucket) {
      const m = files[bucket]
      return {
        async list(dir, { limit = 100, offset = 0 } = {}) {
          const prefix = dir ? `${dir}/` : ''
          const out = new Map()
          for (const [f, created_at] of m) {
            if (!f.startsWith(prefix)) continue
            const rest = f.slice(prefix.length)
            const slash = rest.indexOf('/')
            if (slash === -1) out.set(rest, { name: rest, id: `id-${f}`, created_at, metadata: { size: 10 } })
            else out.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null })
          }
          const arr = [...out.values()].sort((x, y) => x.name.localeCompare(y.name))
          return { data: arr.slice(offset, offset + limit), error: null }
        },
        async remove(p) { writes.push(['remove', bucket, p]); throw new Error('tidak boleh menghapus') },
        async move(s) { writes.push(['move', bucket, s]); throw new Error('tidak boleh memindah') },
      }
    },
  }
  return { supabase: { from, storage }, writes, files }
}

const quiet = () => {}

test('melaporkan file yatim di ktp_images/<org>/ dan receipt_images/<org>/, tanpa menulis apa pun', async () => {
  const { supabase, writes, files } = makeFake()
  const before = JSON.stringify([...files.ktp_images, ...files.receipt_images])
  const r = await report({ supabase, now: NOW, logger: quiet })
  const ktp = r.buckets.ktp_images.orphans.map((o) => o.path).sort()
  const nota = r.buckets.receipt_images.orphans.map((o) => o.path).sort()
  assert.deepEqual(ktp, [`${ORG}/ktp_orphan.jpg`, `${ORG}/sub/ktp_deep_orphan.jpg`])
  // inventories.receipt_url tidak ada (seperti live) -> inv_used.jpg terlapor yatim
  assert.deepEqual(nota, [`${ORG}/inv_used.jpg`, `${ORG_B}/nota_orphan.jpg`].sort())
  assert.deepEqual(r.skipped_columns, ['inventories.receipt_url'])
  assert.equal(r.buckets.ktp_images.too_new, 1, 'file < 24 jam dilewati')
  assert.equal(r.total_orphans, 4)
  assert.ok(!ktp.includes('ktp_root.jpg'), 'file di luar folder org tidak termasuk')
  assert.deepEqual(writes, [])
  assert.equal(JSON.stringify([...files.ktp_images, ...files.receipt_images]), before)
})

test('URL publik lama di baris tetap dianggap rujukan', async () => {
  const { supabase } = makeFake()
  const r = await report({ supabase, now: NOW, logger: quiet })
  assert.ok(!r.buckets.ktp_images.orphans.some((o) => o.path.endsWith('ktp_legacy_url.jpg')))
})

test('kolom inventories.receipt_url ada -> nota inventaris dianggap dirujuk', async () => {
  const { supabase } = makeFake({ inventoriesHasColumn: true })
  const r = await report({ supabase, now: NOW, logger: quiet })
  assert.deepEqual(r.buckets.receipt_images.orphans.map((o) => o.path), [`${ORG_B}/nota_orphan.jpg`])
  assert.deepEqual(r.skipped_columns, [])
})

test('min-age 0 -> file baru ikut dilaporkan', async () => {
  const { supabase } = makeFake()
  const r = await report({ supabase, now: NOW, minAgeHours: 0, logger: quiet })
  assert.ok(r.buckets.ktp_images.orphans.some((o) => o.path.endsWith('ktp_baru.jpg')))
})

test('gagal membaca tabel wajib -> throw (tidak melaporkan yatim palsu)', async () => {
  const { supabase } = makeFake({ failTable: 'tenants' })
  await assert.rejects(report({ supabase, now: NOW, logger: quiet }), /tenants/)
})
