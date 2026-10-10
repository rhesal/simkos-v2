#!/usr/bin/env node
// =====================================================================
// SimKos v2 — laporan FILE YATIM di folder organisasi (READ-ONLY).
//
// Aturan aplikasi: BARIS dulu, FILE belakangan (docs/tagihan-bersama.md).
// Kalau penghapusan file gagal, file lama tertinggal di "<org_id>/...".
// Skrip ini MELAPORKAN file di
//   ktp_images/<org_id>/...      (dirujuk tenants.foto_ktp_url)
//   receipt_images/<org_id>/...  (dirujuk expenses.bukti_nota_url,
//                                 inventories.receipt_url bila kolom ada)
// yang tidak dirujuk baris mana pun. Skrip TIDAK PERNAH menghapus, memindah,
// atau mengubah apa pun; keputusan hapus tetap di tangan Rhesal.
//
// File yang lebih muda dari --min-age-hours (default 24) tidak dilaporkan,
// supaya upload yang sedang berjalan (file sudah naik, baris belum disimpan)
// tidak salah dianggap yatim.
//
// Pakai (service role key JANGAN di-commit; cukup di environment):
//   export SUPABASE_URL=https://<ref>.supabase.co
//   export SUPABASE_SERVICE_ROLE_KEY=...
//   node supabase/scripts/report_orphan_files.mjs [--min-age-hours 24] [--out laporan.json]
// Output: ringkasan di stdout + JSON (stdout, atau --out <file>).
// =====================================================================
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { TARGETS, toStoragePath } from './move_root_files_to_org.mjs'

const PAGE = 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const BUCKETS = [...new Set(TARGETS.map((t) => t.bucket))]

function isMissingColumnError(error) {
  const msg = `${error?.code || ''} ${error?.message || ''}`
  return /42703|PGRST204|does not exist|Could not find/i.test(msg)
}

async function fetchColumn(supabase, table, column) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(`id, ${column}`)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return { rows: null, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return { rows, error: null }
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

/** Semua file (rekursif) di bawah folder dir. */
async function listFilesRecursive(supabase, bucket, dir) {
  const out = []
  for (const o of await listDir(supabase, bucket, dir)) {
    const full = `${dir}/${o.name}`
    if (o.id === null) out.push(...(await listFilesRecursive(supabase, bucket, full)))
    else out.push({ path: full, created_at: o.created_at || o.updated_at || null, size: o.metadata?.size ?? null })
  }
  return out
}

/**
 * Buat laporan. Hanya membaca (select + storage.list).
 * @returns {{ generated_at, min_age_hours, skipped_columns, buckets: { [bucket]: { scanned, referenced, orphans: [{path, org_id, created_at, size}] } }, total_orphans }}
 */
export async function report({ supabase, minAgeHours = 24, now = Date.now(), logger = console.log }) {
  const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id')
  if (orgErr || !Array.isArray(orgs)) throw new Error(`Gagal membaca organizations: ${orgErr?.message || 'respons tidak valid'}`)
  const orgIds = orgs.map((o) => String(o.id).toLowerCase()).filter((id) => UUID_RE.test(id))

  const referenced = new Map(BUCKETS.map((b) => [b, new Set()]))
  const skipped = []
  for (const t of TARGETS) {
    const { rows, error } = await fetchColumn(supabase, t.table, t.column)
    if (error) {
      if (t.optional && isMissingColumnError(error)) {
        skipped.push(`${t.table}.${t.column}`)
        logger(`Lewati ${t.table}.${t.column}: kolom tidak ada.`)
        continue
      }
      // Wajib berhenti: tanpa daftar rujukan lengkap, file yang dipakai bisa salah dilaporkan yatim.
      throw new Error(`Gagal membaca ${t.table}.${t.column}: ${error.message || error}`)
    }
    for (const r of rows) {
      const p = toStoragePath(t.bucket, r[t.column])
      if (p) referenced.get(t.bucket).add(p)
    }
  }

  const cutoff = now - minAgeHours * 3600 * 1000
  const out = { generated_at: new Date(now).toISOString(), min_age_hours: minAgeHours, skipped_columns: skipped, buckets: {}, total_orphans: 0 }
  for (const bucket of BUCKETS) {
    const b = (out.buckets[bucket] = { scanned: 0, referenced: referenced.get(bucket).size, too_new: 0, orphans: [] })
    for (const org of orgIds) {
      for (const f of await listFilesRecursive(supabase, bucket, org)) {
        b.scanned += 1
        if (referenced.get(bucket).has(f.path)) continue
        const t = f.created_at ? Date.parse(f.created_at) : NaN
        if (Number.isFinite(t) && t > cutoff) { b.too_new += 1; continue }
        b.orphans.push({ path: f.path, org_id: org, created_at: f.created_at, size: f.size })
      }
    }
    out.total_orphans += b.orphans.length
    logger(`${bucket}: ${b.scanned} file di folder org, ${b.orphans.length} yatim, ${b.too_new} terlalu baru (dilewati).`)
  }
  return out
}

async function main() {
  const args = process.argv.slice(2)
  const ai = args.indexOf('--min-age-hours')
  const minAgeHours = ai !== -1 ? Number(args[ai + 1]) : 24
  if (!Number.isFinite(minAgeHours) || minAgeHours < 0) {
    console.error('--min-age-hours harus angka >= 0')
    process.exit(2)
  }
  const oi = args.indexOf('--out')
  const outPath = oi !== -1 ? args[oi + 1] : null
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di environment (jangan di-commit).')
    process.exit(2)
  }
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const result = await report({ supabase, minAgeHours, logger: (m) => console.error(m) })
  const json = JSON.stringify(result, null, 2)
  if (outPath) fs.writeFileSync(outPath, json)
  else console.log(json)
  console.error(`Total file yatim: ${result.total_orphans}. Tidak ada yang dihapus (laporan saja).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
