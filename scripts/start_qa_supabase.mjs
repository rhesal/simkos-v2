import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn, execSync } from 'node:child_process'
import { setupQaDatabase, JWT_SECRET } from './setup_qa_database.mjs'

const ROOT = path.resolve()
const GATEWAY_PORT = 8432
const PGRST_PORT = 8433
const GOTRUE_PORT = 9999

export { JWT_SECRET }

export async function startSupabaseStack() {
  const userMap = await setupQaDatabase()

  // Pastikan proses lama dibersihkan
  try {
    if (process.platform === 'win32') {
      execSync('wsl bash -c "pkill -9 -f postgrest; pkill -9 -f gotrue; pkill -9 -f \'auth serve\'"', { stdio: 'ignore' })
    } else {
      execSync('pkill -9 -f postgrest; pkill -9 -f gotrue; pkill -9 -f "auth serve"', { shell: '/bin/bash', stdio: 'ignore' })
    }
  } catch {}

  // 1. Tulis postgrest.conf terbatas pada loopback
  const confPath = path.join(ROOT, 'scripts/pgrst_qa.conf')
  fs.writeFileSync(
    confPath,
    `db-uri = "postgres://disnak@localhost:54322/simkos_qa_staging"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "${JWT_SECRET}"
server-host = "127.0.0.1"
server-port = ${PGRST_PORT}
db-pool = 10
`
  )

  // 2. Jalankan binary PostgREST 16.5
  console.log(`[SUPABASE-QA] Menjalankan PostgREST 16.5 pada 127.0.0.1:${PGRST_PORT}...`)
  const pgrstProcess = process.platform === 'win32'
    ? spawn('wsl', ['/home/disnak/.local/bin/postgrest', '/home/disnak/projects/simkos-v2/scripts/pgrst_qa.conf'], { stdio: 'inherit' })
    : spawn('/home/disnak/.local/bin/postgrest', [confPath], { stdio: 'inherit' })

  // 3. Jalankan binary resmi Supabase Auth (GoTrue v2.197.0)
  console.log(`[SUPABASE-QA] Menjalankan Supabase Auth (GoTrue v2.197.0) pada 127.0.0.1:${GOTRUE_PORT}...`)
  const gotrueEnv = {
    ...process.env,
    PORT: String(GOTRUE_PORT),
    GOTRUE_API_HOST: '127.0.0.1',
    API_EXTERNAL_URL: `http://127.0.0.1:${GATEWAY_PORT}/auth/v1`,
    GOTRUE_DB_DATABASE_URL: 'postgres://disnak@localhost:54322/simkos_qa_staging?sslmode=disable&search_path=auth,public',
    GOTRUE_SITE_URL: 'http://127.0.0.1:5175',
    GOTRUE_JWT_SECRET: JWT_SECRET,
    GOTRUE_DB_DRIVER: 'postgres',
    GOTRUE_DISABLE_SIGNUP: 'false',
    GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true',
    GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: '0',
    GOTRUE_SECURITY_REFRESH_TOKEN_ALLOW_REUSE: 'false',
    GOTRUE_REFRESH_TOKEN_ROTATION_ENABLED: 'true',
    GOTRUE_REFRESH_TOKEN_REUSE_INTERVAL: '0',
    GOTRUE_REFRESH_TOKEN_ALLOW_REUSE: 'false',
  }

  const gotrueProcess = process.platform === 'win32'
    ? spawn('wsl', ['bash', '-c', `PORT=${GOTRUE_PORT} GOTRUE_API_HOST=127.0.0.1 API_EXTERNAL_URL="http://127.0.0.1:${GATEWAY_PORT}/auth/v1" GOTRUE_DB_DATABASE_URL="postgres://disnak@localhost:54322/simkos_qa_staging?sslmode=disable&search_path=auth,public" GOTRUE_SITE_URL="http://127.0.0.1:5175" GOTRUE_JWT_SECRET="${JWT_SECRET}" GOTRUE_DB_DRIVER="postgres" GOTRUE_DISABLE_SIGNUP=false GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=0 GOTRUE_SECURITY_REFRESH_TOKEN_ALLOW_REUSE=false GOTRUE_REFRESH_TOKEN_ROTATION_ENABLED=true GOTRUE_REFRESH_TOKEN_REUSE_INTERVAL=0 GOTRUE_REFRESH_TOKEN_ALLOW_REUSE=false /home/disnak/.local/bin/auth serve`], { stdio: 'pipe' })
    : spawn('/home/disnak/.local/bin/auth', ['serve'], { env: gotrueEnv, stdio: 'pipe' })

  // Tunggu engine siap
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // 4. HTTP Gateway Server (Loopback 127.0.0.1 only)
  // Berfungsi semata sebagai reverse-proxy lokal menyatukan PostgREST dan GoTrue resmi
  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.setHeader('Access-Control-Expose-Headers', '*')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      return res.end()
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

    // 4.1 Proxy ke Official Supabase Auth (GoTrue)
    if (url.pathname.startsWith('/auth/v1')) {
      const targetPath = url.pathname.replace(/^\/auth\/v1/, '') || '/'
      const proxyReq = http.request(
        `http://127.0.0.1:${GOTRUE_PORT}${targetPath}${url.search}`,
        {
          method: req.method,
          headers: {
            ...req.headers,
            host: `127.0.0.1:${GOTRUE_PORT}`,
          },
        },
        proxyRes => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers)
          proxyRes.pipe(res)
        }
      )

      proxyReq.on('error', err => {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Auth Gateway Error', details: err.message }))
      })

      req.pipe(proxyReq)
      return
    }

    // 4.2 Proxy ke Official PostgREST
    if (url.pathname.startsWith('/rest/v1')) {
      const targetPath = url.pathname.replace(/^\/rest\/v1/, '') || '/'
      const proxyReq = http.request(
        `http://127.0.0.1:${PGRST_PORT}${targetPath}${url.search}`,
        {
          method: req.method,
          headers: {
            ...req.headers,
            host: `127.0.0.1:${PGRST_PORT}`,
          },
        },
        proxyRes => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers)
          proxyRes.pipe(res)
        }
      )

      proxyReq.on('error', err => {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'REST Gateway Error', details: err.message }))
      })

      req.pipe(proxyReq)
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not Found' }))
  })

  await new Promise(resolve => server.listen(GATEWAY_PORT, '127.0.0.1', resolve))
  console.log(`[SUPABASE-QA] Supabase Gateway aktif di http://127.0.0.1:${GATEWAY_PORT} (loopback only)`)

  return {
    server,
    pgrstProcess,
    gotrueProcess,
    userMap,
    stop: async () => {
      try {
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections()
        }
      } catch {}
      await new Promise(resolve => server.close(resolve))
      try {
        if (pgrstProcess) {
          try { pgrstProcess.kill('SIGKILL') } catch {}
          try { pgrstProcess.unref() } catch {}
        }
        if (gotrueProcess) {
          try { gotrueProcess.kill('SIGKILL') } catch {}
          try { gotrueProcess.unref() } catch {}
        }
        if (process.platform === 'win32') {
          execSync('wsl bash -c "pkill -9 -f postgrest; pkill -9 -f gotrue; pkill -9 -f \'auth serve\'"', { stdio: 'ignore' })
        } else {
          execSync('pkill -9 -f postgrest; pkill -9 -f gotrue; pkill -9 -f "auth serve"', { shell: '/bin/bash', stdio: 'ignore' })
        }
      } catch {}
    },
  }
}

if (process.argv[1] && process.argv[1].endsWith('start_qa_supabase.mjs')) {
  startSupabaseStack()
    .then(() => {
      console.log('Tekan Ctrl+C untuk berhenti.')
    })
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
}
