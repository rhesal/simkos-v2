#!/usr/bin/env node
// =====================================================================
// SimKos v2 — pindahkan file KTP/nota lama ke folder organisasi.
//
// Sekali jalan, idempotent, bisa dilanjutkan (resume) bila terputus.
// Dijalankan SESUDAH migration 200 + 210 (dan deploy frontend baru) dan
// SEBELUM migration 300.
//
// Untuk setiap baris yang menunjuk file di luar folder "<org_id>/":
//   tenants.foto_ktp_url      -> bucket ktp_images
//   expenses.bukti_nota_url   -> bucket receipt_images
//   inventories.receipt_url   -> bucket receipt_images (dilewati bila kolom tidak ada)
// file dipindah (storage move) ke "<org_id>/<nama file yang sama>", LALU
// path di baris diperbarui (hanya bila nilainya masih sama). Bila update
// baris gagal, baris yang sempat diperbarui dikembalikan dan file dipindah
// balik, jadi baris tidak pernah menunjuk file yang tidak ada.
// File di luar folder organisasi (di root, di folder "<uid>/", atau folder lain)
// yang tidak direferensikan baris mana pun TIDAK dipindah, hanya dilaporkan
// (log.unreferenced_outside_org_files) supaya Rhesal bisa memutuskan sisa KTP.
// File yang berada di folder ORGANISASI LAIN tidak pernah dipindah: ditandai
// 'conflict' (mencegah file org A berpindah ke org B lewat baris org B).
//
// Pakai (service role key JANGAN di-commit; cukup di environment):
//   export SUPABASE_URL=https://<ref>.supabase.co
//   export SUPABASE_SERVICE_ROLE_KEY=...        # Dashboard -> Settings -> API
//   node supabase/scripts/move_root_files_to_org.mjs --dry-run   # lihat rencana
//   node supabase/scripts/move_root_files_to_org.mjs             # jalankan
// Opsi: --log <file>  (default supabase/scripts/move_root_files_to_org.log.json, di-.gitignore)
//
// Log JSON ditulis setelah setiap langkah (tulis ke file sementara lalu
// rename). Saat dijalankan ulang, item "done" dilewati dan kondisi storage
// (file sumber/tujuan ada atau tidak) dicek ulang sebelum bertindak.
// Exit code 1 bila ada item gagal/konflik/hilang -> jangan lanjut ke migration 300.
// =====================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const TARGETS = [
  { table: 'tenants', column: 'foto_ktp_url', bucket: 'ktp_images', optional: false },
  { table: 'expenses', column: 'bukti_nota_url', bucket: 'receipt_images', optional: false },
  { table: 'inventories', column: 'receipt_url', bucket: 'receipt_images', optional: true },
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Segmen folder pertama bila berupa UUID (dinormalisasi huruf kecil), selain itu null. */
function firstUuidFolder(objectPath) {
  const slash = objectPath.indexOf('/')
  if (slash === -1) return null
  const seg = objectPath.slice(0, slash)
  return UUID_RE.test(seg) ? seg.toLowerCase() : null
}
const PAGE = 1000

/** Nilai di DB (path / URL Supabase lama) -> path objek di bucket. Sama dengan src/lib/storage.js. */
export function toStoragePath(bucket, value) {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^https?:\/\//i.test(trimmed)) {
    const clean = trimmed.replace(/^\/+/, '')
    return clean.startsWith(`${bucket}/`) ? clean.slice(bucket.length + 1) : clean
  }
  try {
    const url = new URL(trimmed)
    const marker = '/storage/v1/object/'
    const idx = url.pathname.indexOf(marker)
    if (idx === -1) return null
    const rest = url.pathname.slice(idx + marker.length).split('/')
    if (rest.length < 3 || rest[1] !== bucket) return null
    return decodeURIComponent(rest.slice(2).join('/')) || null
  } catch {
    return null
  }
}

function isMissingColumnError(error) {
  const msg = `${error?.code || ''} ${error?.message || ''}`
  return /42703|PGRST204|does not exist|Could not find/i.test(msg)
}

function loadLog(logPath) {
  if (logPath && fs.existsSync(logPath)) return JSON.parse(fs.readFileSync(logPath, 'utf8'))
  return { version: 1, started_at: new Date().toISOString(), runs: 0, items: {}, events: [], unreferenced_root_files: {}, unreferenced_outside_org_files: {} }
}

function saveLog(logPath, log) {
  if (!logPath) return
  const tmp = `${logPath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(log, null, 2))
  fs.renameSync(tmp, logPath)
}

async function fetchAll(supabase, table, column) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(`id, org_id, ${column}`)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return { rows: null, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return { rows, error: null }
}

async function objectExists(supabase, bucket, objectPath) {
  const slash = objectPath.lastIndexOf('/')
  const dir = slash === -1 ? '' : objectPath.slice(0, slash)
  const name = slash === -1 ? objectPath : objectPath.slice(slash + 1)
  const { data, error } = await supabase.storage.from(bucket).list(dir, { search: name, limit: 100 })
  if (error) throw new Error(`list ${bucket}/${dir} gagal: ${error.message || error}`)
  return (data || []).some((o) => o.name === name && o.id !== null)
}

async function listDir(supabase, bucket, dir) {
  const entries = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage.from(bucket).list(dir, { limit: PAGE, offset })
    if (error) throw new Error(`list ${bucket}/${dir} gagal: ${error.message || error}`)
    entries.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return entries
}

/**
 * Semua file di LUAR folder organisasi: file di root, plus isi (rekursif) folder
 * top-level yang namanya bukan org_id yang dikenal (mis. "<uid>/").
 * Mengembalikan { root: [...], all: [...] }.
 */
async function listFilesOutsideOrgFolders(supabase, bucket, orgIds) {
  const root = []
  const all = []
  async function walk(dir, depth) {
    for (const o of await listDir(supabase, bucket, dir)) {
      const full = dir ? `${dir}/${o.name}` : o.name
      if (o.id !== null) {
        all.push(full)
        if (!dir) root.push(full)
        continue
      }
      // Folder: lewati folder organisasi (hanya di level teratas, huruf kecil persis).
      if (depth === 0 && orgIds.has(o.name)) continue
      await walk(full, depth + 1)
    }
  }
  await walk('', 0)
  return { root, all }
}

async function fetchOrgIds(supabase) {
  try {
    const { data, error } = await supabase.from('organizations').select('id')
    if (error || !Array.isArray(data)) return []
    return data.map((r) => String(r.id).toLowerCase())
  } catch {
    return []
  }
}

/**
 * Jalankan pemindahan. Mengembalikan { summary, log }; log disimpan setiap langkah.
 * @param {{ supabase: any, logPath?: string|null, dryRun?: boolean, logger?: (msg: string) => void }} opts
 */
export async function run({ supabase, logPath = null, dryRun = false, logger = console.log }) {
  const log = loadLog(logPath)
  log.runs += 1
  const say = (msg, extra = {}) => {
    logger(msg)
    log.events.push({ at: new Date().toISOString(), msg, ...extra })
    if (!dryRun) saveLog(logPath, log)
  }
  const summary = { moved: 0, alreadyDone: 0, alreadyInOrg: 0, conflicts: 0, missing: 0, failed: 0, planned: 0, skippedTables: [] }

  // 1. Kumpulkan referensi, dikelompokkan per file sumber.
  const groups = new Map() // bucket::src -> { bucket, src, dst, org, refs }
  const referenced = new Map() // bucket -> Set(path)
  const orgIds = new Set(await fetchOrgIds(supabase))
  for (const t of TARGETS) {
    const { rows, error } = await fetchAll(supabase, t.table, t.column)
    if (error) {
      if (t.optional && isMissingColumnError(error)) {
        summary.skippedTables.push(`${t.table}.${t.column}`)
        say(`Lewati ${t.table}.${t.column}: kolom tidak ada.`)
        continue
      }
      throw new Error(`Gagal membaca ${t.table}: ${error.message || error}`)
    }
    for (const row of rows) {
      const value = row[t.column]
      const src = toStoragePath(t.bucket, value)
      if (!src) continue
      if (!referenced.has(t.bucket)) referenced.set(t.bucket, new Set())
      referenced.get(t.bucket).add(src)
      if (!row.org_id || !UUID_RE.test(row.org_id)) {
        throw new Error(`${t.table} ${row.id} tidak punya org_id. Jalankan migration 200 dulu.`)
      }
      orgIds.add(String(row.org_id).toLowerCase())
      if (src.startsWith(`${row.org_id}/`) && value === src) {
        summary.alreadyInOrg += 1
        continue
      }
      const dst = src.startsWith(`${row.org_id}/`) ? src : `${row.org_id}/${src.split('/').pop()}`
      const key = `${t.bucket}::${src}`
      if (!groups.has(key)) groups.set(key, { bucket: t.bucket, src, dst, org: row.org_id, srcFolderOrg: firstUuidFolder(src), refs: [] })
      const g = groups.get(key)
      if (g.org !== row.org_id) g.conflictOrg = true
      g.refs.push({ table: t.table, column: t.column, id: row.id, value })
    }
  }

  // 2. Proses setiap file.
  for (const g of groups.values()) {
    const key = `${g.bucket}::${g.src}`
    const item = (log.items[key] ||= { bucket: g.bucket, src: g.src, dst: g.dst, status: 'pending', refs: [] })
    item.refs = g.refs.map((r) => ({ table: r.table, id: r.id, old: r.value }))
    if (item.status === 'done') {
      summary.alreadyDone += 1
      continue
    }
    if (g.conflictOrg) {
      item.status = 'conflict'
      item.reason = 'file yang sama direferensikan baris dari organisasi berbeda'
      summary.conflicts += 1
      say(`KONFLIK ${key}: ${item.reason}; tidak diproses.`)
      continue
    }
    // Sumber berada di folder organisasi LAIN yang dikenal -> jangan pernah dipindah.
    if (g.srcFolderOrg && g.srcFolderOrg !== String(g.org).toLowerCase() && orgIds.has(g.srcFolderOrg)) {
      item.status = 'conflict'
      item.reason = `file sumber berada di folder organisasi lain (${g.srcFolderOrg}); tidak dipindah`
      summary.conflicts += 1
      say(`KONFLIK ${key}: ${item.reason}`)
      continue
    }

    const samePath = g.src === g.dst // nilai berupa URL penuh yang path-nya sudah di folder org
    const srcExists = samePath ? false : await objectExists(supabase, g.bucket, g.src)
    const dstExists = await objectExists(supabase, g.bucket, g.dst)

    if (dryRun) {
      summary.planned += 1
      logger(`[dry-run] ${g.bucket}: ${g.src} -> ${g.dst} (${g.refs.length} baris; sumber ada=${srcExists}, tujuan ada=${dstExists})`)
      continue
    }

    if (srcExists && dstExists) {
      item.status = 'conflict'
      item.reason = 'file tujuan sudah ada dan file sumber masih ada; tidak menimpa'
      summary.conflicts += 1
      say(`KONFLIK ${key}: ${item.reason}`)
      continue
    }
    if (!srcExists && !dstExists) {
      item.status = 'missing'
      item.reason = 'file sumber maupun tujuan tidak ditemukan; baris tidak diubah'
      summary.missing += 1
      say(`HILANG ${key}: ${item.reason}`)
      continue
    }

    if (srcExists) {
      const { error } = await supabase.storage.from(g.bucket).move(g.src, g.dst)
      if (error) {
        item.status = 'failed'
        item.reason = `move gagal: ${error.message || error}`
        summary.failed += 1
        say(`GAGAL ${key}: ${item.reason}`)
        continue
      }
      item.status = 'moved'
      say(`Pindah ${g.bucket}: ${g.src} -> ${g.dst}`, { key })
    } else {
      // Run sebelumnya sudah memindah file tapi terhenti sebelum update baris.
      item.status = 'moved'
      say(`Lanjutkan ${key}: file sudah di ${g.dst}, perbarui baris.`, { key })
    }

    // Update semua baris, hanya bila nilainya masih sama (tidak menimpa perubahan user).
    const updated = []
    let failure = null
    for (const r of g.refs) {
      const { data, error } = await supabase
        .from(r.table)
        .update({ [r.column]: g.dst })
        .eq('id', r.id)
        .eq(r.column, r.value)
        .select('id')
      if (error || !data || data.length !== 1) {
        failure = error ? error.message || String(error) : `baris ${r.table} ${r.id} berubah/tidak ditemukan (0 baris diperbarui)`
        break
      }
      updated.push(r)
      say(`Update ${r.table} ${r.id}: ${r.column} = ${g.dst}`, { key })
    }

    if (failure) {
      // Kembalikan baris yang sudah diperbarui, lalu pindahkan file balik.
      for (const r of updated) {
        await supabase.from(r.table).update({ [r.column]: r.value }).eq('id', r.id).eq(r.column, g.dst).select('id')
      }
      const back = samePath ? { error: null } : await supabase.storage.from(g.bucket).move(g.dst, g.src)
      item.status = back.error ? 'failed_needs_attention' : 'failed'
      item.reason = `update baris gagal: ${failure}` + (back.error ? `; MOVE BALIK GAGAL: ${back.error.message || back.error}` : '; file dikembalikan')
      summary.failed += 1
      say(`GAGAL ${key}: ${item.reason}`, { key })
      continue
    }

    item.status = 'done'
    summary.moved += 1
    say(`Selesai ${key}`, { key })
  }

  // 3. Laporkan SEMUA file di luar folder organisasi yang tidak direferensikan
  //    (root, "<uid>/", folder lain). Tidak dipindah; untuk diputuskan Rhesal.
  log.unreferenced_outside_org_files ||= {}
  for (const bucket of new Set(TARGETS.map((t) => t.bucket))) {
    const { root, all } = await listFilesOutsideOrgFolders(supabase, bucket, orgIds)
    const refs = referenced.get(bucket) || new Set()
    const unrefAll = all.filter((name) => !refs.has(name))
    log.unreferenced_root_files[bucket] = root.filter((name) => !refs.has(name))
    log.unreferenced_outside_org_files[bucket] = unrefAll
    if (unrefAll.length) {
      logger(`INFO ${bucket}: ${unrefAll.length} file di luar folder organisasi tidak direferensikan (tidak dipindah): ${unrefAll.join(', ')}`)
    }
  }

  log.finished_at = new Date().toISOString()
  log.last_summary = summary
  if (!dryRun) saveLog(logPath, log)
  logger(`Ringkasan: ${JSON.stringify(summary)}`)
  return { summary, log }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const li = args.indexOf('--log')
  const here = path.dirname(fileURLToPath(import.meta.url))
  const logPath = li !== -1 ? args[li + 1] : path.join(here, 'move_root_files_to_org.log.json')
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di environment (jangan di-commit).')
    process.exit(2)
  }
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { summary } = await run({ supabase, logPath, dryRun })
  if (summary.failed || summary.conflicts || summary.missing) {
    console.error('Ada item yang belum selesai. Periksa log, perbaiki, lalu jalankan ulang. JANGAN jalankan migration 300 dulu.')
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
