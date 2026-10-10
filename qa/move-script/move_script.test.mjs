// Tes skrip supabase/scripts/move_root_files_to_org.mjs dengan stub Supabase
// (DB + Storage di memori). Jalankan: node --test qa/move-script/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { run } from '../../supabase/scripts/move_root_files_to_org.mjs'

const ORG = '0f000000-0000-0000-0000-000000000001'

function makeFake({ hooks = {} } = {}) {
  const db = {
    tenants: [
      { id: 't1', org_id: ORG, foto_ktp_url: 'ktp_1.jpg' },
      { id: 't2', org_id: ORG, foto_ktp_url: 'ktp_2.jpg' },
      { id: 't3', org_id: ORG, foto_ktp_url: null },
      { id: 't4', org_id: ORG, foto_ktp_url: `${ORG}/ktp_new.jpg` },
    ],
    expenses: [{ id: 'e1', org_id: ORG, bukti_nota_url: 'https://x.supabase.co/storage/v1/object/public/receipt_images/nota_1.jpg' }],
    inventories: [{ id: 'i1', org_id: ORG }], // kolom receipt_url tidak ada (seperti live)
  }
  const missingColumns = { inventories: ['receipt_url'] }
  const files = {
    ktp_images: new Set(['ktp_1.jpg', 'ktp_2.jpg', 'ktp_orphan.jpg', `${ORG}/ktp_new.jpg`]),
    receipt_images: new Set(['nota_1.jpg']),
  }

  function from(table) {
    const st = { op: 'select', filters: [], payload: null, cols: null, range: null }
    const b = {
      select(cols) { if (st.op === 'select') st.cols = cols; return b },
      order() { return b },
      range(a, z) { st.range = [a, z]; return b },
      update(p) { st.op = 'update'; st.payload = p; return b },
      eq(c, v) { st.filters.push([c, v]); return b },
      then(resolve, reject) {
        try { resolve(exec()) } catch (e) { reject(e) }
      },
    }
    function exec() {
      const cols = st.cols ? st.cols.split(',').map((s) => s.trim()) : Object.keys(st.payload || {})
      for (const c of cols) {
        if ((missingColumns[table] || []).includes(c)) return { data: null, error: { code: '42703', message: `column ${table}.${c} does not exist` } }
      }
      const rows = db[table].filter((r) => st.filters.every(([c, v]) => r[c] === v))
      if (st.op === 'select') {
        const [a, z] = st.range || [0, rows.length]
        return { data: rows.slice(a, z + 1).map((r) => ({ ...r })), error: null }
      }
      if (hooks.beforeUpdate) {
        const err = hooks.beforeUpdate(table, rows, st.payload)
        if (err) return { data: null, error: err }
      }
      for (const r of rows) Object.assign(r, st.payload)
      return { data: rows.map((r) => ({ id: r.id })), error: null }
    }
    return b
  }

  const storage = {
    from(bucket) {
      const set = files[bucket]
      return {
        async list(dir, { search, limit = 100, offset = 0 } = {}) {
          const prefix = dir ? `${dir}/` : ''
          const out = new Map()
          for (const f of set) {
            if (!f.startsWith(prefix)) continue
            const rest = f.slice(prefix.length)
            const slash = rest.indexOf('/')
            if (slash === -1) out.set(rest, { name: rest, id: `id-${f}` })
            else out.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null })
          }
          let arr = [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
          if (search) arr = arr.filter((o) => o.name.includes(search))
          return { data: arr.slice(offset, offset + limit), error: null }
        },
        async move(src, dst) {
          if (!set.has(src)) return { data: null, error: { message: 'Object not found' } }
          if (set.has(dst)) return { data: null, error: { message: 'The resource already exists' } }
          set.delete(src)
          set.add(dst)
          if (hooks.afterMove) hooks.afterMove(src, dst)
          return { data: { message: 'Successfully moved' }, error: null }
        },
      }
    },
  }
  return { supabase: { from, storage }, db, files }
}

const quiet = () => {}
const tmpLog = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mv-')), 'log.json')

test('pindah file root yang direferensikan, update baris, laporkan file tak direferensikan', async () => {
  const { supabase, db, files } = makeFake()
  const logPath = tmpLog()
  const { summary, log } = await run({ supabase, logPath, logger: quiet })
  assert.equal(summary.moved, 3)
  assert.equal(summary.alreadyInOrg, 1)
  assert.deepEqual(summary.skippedTables, ['inventories.receipt_url'])
  assert.equal(db.tenants[0].foto_ktp_url, `${ORG}/ktp_1.jpg`)
  assert.equal(db.tenants[1].foto_ktp_url, `${ORG}/ktp_2.jpg`)
  assert.equal(db.expenses[0].bukti_nota_url, `${ORG}/nota_1.jpg`)
  assert.ok(files.ktp_images.has(`${ORG}/ktp_1.jpg`) && !files.ktp_images.has('ktp_1.jpg'))
  assert.ok(files.ktp_images.has('ktp_orphan.jpg'), 'file tak direferensikan tidak dipindah')
  assert.deepEqual(log.unreferenced_root_files.ktp_images, ['ktp_orphan.jpg'])
  assert.ok(fs.existsSync(logPath))
})

test('idempotent: run kedua tidak mengubah apa pun', async () => {
  const { supabase, db, files } = makeFake()
  const logPath = tmpLog()
  await run({ supabase, logPath, logger: quiet })
  const before = JSON.stringify({ db, k: [...files.ktp_images], r: [...files.receipt_images] })
  const { summary } = await run({ supabase, logPath, logger: quiet })
  assert.equal(summary.moved, 0)
  assert.equal(summary.alreadyInOrg, 4)
  assert.equal(JSON.stringify({ db, k: [...files.ktp_images], r: [...files.receipt_images] }), before)
  // juga tanpa log (log hilang): tetap no-op
  const again = await run({ supabase, logPath: null, logger: quiet })
  assert.equal(again.summary.moved, 0)
})

test('resume: proses mati setelah move sebelum update baris -> run berikutnya menuntaskan', async () => {
  let crash = true
  const { supabase, db, files } = makeFake({
    hooks: { afterMove: (src) => { if (crash && src === 'ktp_2.jpg') { crash = false; throw new Error('proses mati') } } },
  })
  const logPath = tmpLog()
  await assert.rejects(run({ supabase, logPath, logger: quiet }), /proses mati/)
  assert.equal(db.tenants[1].foto_ktp_url, 'ktp_2.jpg', 'baris belum diupdate')
  assert.ok(files.ktp_images.has(`${ORG}/ktp_2.jpg`), 'file sudah dipindah')
  const saved = JSON.parse(fs.readFileSync(logPath, 'utf8'))
  assert.equal(saved.items['ktp_images::ktp_1.jpg'].status, 'done')
  const { summary } = await run({ supabase, logPath, logger: quiet })
  assert.equal(summary.failed + summary.missing + summary.conflicts, 0)
  assert.equal(db.tenants[1].foto_ktp_url, `${ORG}/ktp_2.jpg`)
})

test('update baris gagal -> file dipindah balik, baris tetap menunjuk file yang ada', async () => {
  const { supabase, db, files } = makeFake({
    hooks: { beforeUpdate: (table, rows, payload) => (table === 'tenants' && payload.foto_ktp_url?.endsWith('ktp_1.jpg') ? { message: 'boom' } : null) },
  })
  const { summary, log } = await run({ supabase, logPath: tmpLog(), logger: quiet })
  assert.equal(summary.failed, 1)
  assert.equal(db.tenants[0].foto_ktp_url, 'ktp_1.jpg')
  assert.ok(files.ktp_images.has('ktp_1.jpg') && !files.ktp_images.has(`${ORG}/ktp_1.jpg`))
  assert.equal(log.items['ktp_images::ktp_1.jpg'].status, 'failed')
})

test('file sumber hilang -> baris tidak diubah, dilaporkan', async () => {
  const { supabase, db, files } = makeFake()
  files.ktp_images.delete('ktp_2.jpg')
  const { summary } = await run({ supabase, logPath: tmpLog(), logger: quiet })
  assert.equal(summary.missing, 1)
  assert.equal(db.tenants[1].foto_ktp_url, 'ktp_2.jpg')
})

test('konflik: tujuan sudah ada dan sumber masih ada -> tidak menimpa', async () => {
  const { supabase, db, files } = makeFake()
  files.ktp_images.add(`${ORG}/ktp_1.jpg`)
  const { summary } = await run({ supabase, logPath: tmpLog(), logger: quiet })
  assert.equal(summary.conflicts, 1)
  assert.equal(db.tenants[0].foto_ktp_url, 'ktp_1.jpg')
  assert.ok(files.ktp_images.has('ktp_1.jpg'))
})

test('dry-run tidak mengubah apa pun dan tidak menulis log', async () => {
  const { supabase, db, files } = makeFake()
  const logPath = tmpLog()
  const { summary } = await run({ supabase, logPath, dryRun: true, logger: quiet })
  assert.equal(summary.planned, 3)
  assert.equal(db.tenants[0].foto_ktp_url, 'ktp_1.jpg')
  assert.ok(files.ktp_images.has('ktp_1.jpg'))
  assert.ok(!fs.existsSync(logPath))
})

const ORG_B = '0f000000-0000-0000-0000-00000000000b'
const UID = '0a000000-0000-0000-0000-0000000000aa'

test('konflik: baris org B merujuk file di folder org A -> tidak dipindah', async () => {
  const { supabase, db, files } = makeFake()
  files.ktp_images.add(`${ORG}/ktp_a_only.jpg`)
  db.tenants.push({ id: 't5', org_id: ORG_B, foto_ktp_url: `${ORG}/ktp_a_only.jpg` })
  const { summary, log } = await run({ supabase, logPath: tmpLog(), logger: quiet })
  assert.equal(summary.conflicts, 1)
  assert.equal(log.items[`ktp_images::${ORG}/ktp_a_only.jpg`].status, 'conflict')
  assert.equal(db.tenants[4].foto_ktp_url, `${ORG}/ktp_a_only.jpg`, 'baris tidak diubah')
  assert.ok(files.ktp_images.has(`${ORG}/ktp_a_only.jpg`), 'file tetap di folder org A')
  assert.ok(!files.ktp_images.has(`${ORG_B}/ktp_a_only.jpg`), 'file tidak berpindah ke org B')
})

test('laporan mencakup semua file di luar folder org, termasuk <uid>/ yang tak direferensikan', async () => {
  const { supabase, files } = makeFake()
  files.ktp_images.add(`${UID}/ktp_stray.jpg`)
  files.ktp_images.add(`${ORG}/ktp_inorg_orphan.jpg`)
  const { log } = await run({ supabase, logPath: tmpLog(), logger: quiet })
  const outside = log.unreferenced_outside_org_files.ktp_images
  assert.ok(outside.includes('ktp_orphan.jpg'))
  assert.ok(outside.includes(`${UID}/ktp_stray.jpg`))
  assert.ok(!outside.some((f) => f.startsWith(`${ORG}/`)), 'file di folder org tidak dilaporkan')
  assert.deepEqual(log.unreferenced_root_files.ktp_images, ['ktp_orphan.jpg'])
  assert.ok(files.ktp_images.has(`${UID}/ktp_stray.jpg`), 'tidak dipindah')
})
