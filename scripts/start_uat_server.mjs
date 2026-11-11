/**
 * Script Memulai Server UAT Terisolasi (Local Staging)
 * Menjalankan:
 * 1. Supabase Local Stack (GoTrue + PostgREST + Gateway Port 8432) pada port 54322 simkos_qa_staging
 * 2. Mengisi ulang data contoh realistis (seed_uat_data.mjs)
 * 3. Menjalankan Vite Web Server pada Port 5175 (Preview Staging URL: http://127.0.0.1:5175)
 */

import { startSupabaseStack } from './start_qa_supabase.mjs'
import { seedUatData } from './seed_uat_data.mjs'
import { spawn } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve()
const VITE_PORT = 5175

async function main() {
  console.log('[UAT-SERVER] Memulai stack Supabase lokal staging...')
  const stack = await startSupabaseStack()

  console.log('[UAT-SERVER] Mengisi data contoh realistis...')
  await seedUatData()

  console.log(`[UAT-SERVER] Menjalankan Vite Web Server di http://127.0.0.1:${VITE_PORT}...`)
  const viteProcess = spawn('npx', ['vite', '--port', String(VITE_PORT), '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'http://127.0.0.1:8432',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1xYSIsInJvbGUiOiJhbm9uIiwiZXhwIjoyNTM0MDIzMDA3OTl9.qa-anon-key',
    }
  })

  process.on('SIGINT', () => {
    console.log('\n[UAT-SERVER] Menghentikan server UAT...')
    try { stack.stop() } catch {}
    try { viteProcess.kill('SIGKILL') } catch {}
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    try { stack.stop() } catch {}
    try { viteProcess.kill('SIGKILL') } catch {}
    process.exit(0)
  })
}

main().catch(err => {
  console.error('[UAT-SERVER] Gagal memulai:', err)
  process.exit(1)
})
