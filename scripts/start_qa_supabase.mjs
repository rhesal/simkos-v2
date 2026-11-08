import crypto from 'node:crypto'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { setupQaDatabase } from './setup_qa_database.mjs'

const ROOT = path.resolve()
const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'
const GATEWAY_PORT = 8432
const PGRST_PORT = 8433

function base64Url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

export function signJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64Url(JSON.stringify(header))
  const encodedPayload = base64Url(JSON.stringify(payload))
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest()
  const encodedSignature = base64Url(signature)
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`
}

export function verifyJwt(token) {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split('.')
    const expectedSig = base64Url(
      crypto
        .createHmac('sha256', JWT_SECRET)
        .update(`${headerB64}.${payloadB64}`)
        .digest()
    )
    if (signatureB64 !== expectedSig) return null
    const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf8')
    return JSON.parse(payloadJson)
  } catch {
    return null
  }
}

export const TEST_USERS = {
  'owner@simkos.test': {
    id: '22222222-0000-0000-0000-000000000002',
    email: 'owner@simkos.test',
    role: 'authenticated',
    role_name: 'owner',
    org_name: 'SimKos',
  },
  'admin@simkos.test': {
    id: '11111111-0000-0000-0000-000000000001',
    email: 'admin@simkos.test',
    role: 'authenticated',
    role_name: 'admin',
    org_name: 'SimKos',
  },
  'staff@simkos.test': {
    id: '44444444-0000-0000-0000-000000000004',
    email: 'staff@simkos.test',
    role: 'authenticated',
    role_name: 'staff',
    org_name: 'SimKos',
  },
  'ownerb@simkos.test': {
    id: '33333333-0000-0000-0000-000000000003',
    email: 'ownerb@simkos.test',
    role: 'authenticated',
    role_name: 'owner',
    org_name: 'Kos Lain',
  },
}

export async function startSupabaseStack() {
  await setupQaDatabase()

  // 1. Tulis postgrest.conf
  const confPath = path.join(ROOT, 'scripts/pgrst_qa.conf')
  fs.writeFileSync(
    confPath,
    `db-uri = "postgres://disnak@localhost:54322/simkos_qa_staging"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "${JWT_SECRET}"
server-port = ${PGRST_PORT}
db-pool = 10
`
  )

  // 2. Jalankan binary postgrest
  console.log(`[SUPABASE-QA] Menjalankan PostgREST 16.5 pada port ${PGRST_PORT}...`)
  const pgrstProcess = process.platform === 'win32'
    ? spawn('wsl', ['/home/disnak/.local/bin/postgrest', '/home/disnak/projects/simkos-v2/scripts/pgrst_qa.conf'], { stdio: 'inherit' })
    : spawn('/home/disnak/.local/bin/postgrest', [confPath], { stdio: 'inherit' })

  // Tunggu PostgREST siap
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // 3. Buat HTTP Gateway Server
  const server = http.createServer(async (req, res) => {
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

    // Auth endpoints
    if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
      let body = ''
      req.on('data', chunk => (body += chunk))
      req.on('end', () => {
        try {
          const params = JSON.parse(body || '{}')
          const email = (params.email || '').toLowerCase()
          const password = params.password || ''
          const user = TEST_USERS[email]

          if (!user || password !== 'testpass123') {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }))
          }

          const now = Math.floor(Date.now() / 1000)
          const token = signJwt({
            aud: 'authenticated',
            exp: now + 3600 * 24,
            sub: user.id,
            email: user.email,
            role: 'authenticated',
            app_metadata: { provider: 'email', providers: ['email'] },
            user_metadata: {},
          })

          const authResponse = {
            access_token: token,
            token_type: 'bearer',
            expires_in: 3600 * 24,
            expires_at: now + 3600 * 24,
            refresh_token: 'qa_refresh_' + user.id,
            user: {
              id: user.id,
              aud: 'authenticated',
              role: 'authenticated',
              email: user.email,
              email_confirmed_at: '2026-01-01T00:00:00Z',
              phone: '',
              user_metadata: {},
              app_metadata: { provider: 'email', providers: ['email'] },
            },
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(authResponse))
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: e.message }))
        }
      })
      return
    }

    if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
      const authHeader = req.headers['authorization'] || ''
      const token = authHeader.replace(/^Bearer\s+/i, '')
      const claims = verifyJwt(token)
      if (!claims) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'unauthorized' }))
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(
        JSON.stringify({
          id: claims.sub,
          aud: 'authenticated',
          role: 'authenticated',
          email: claims.email,
          email_confirmed_at: '2026-01-01T00:00:00Z',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
        })
      )
    }

    if (url.pathname === '/auth/v1/logout') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({}))
    }

    // Storage mock endpoints
    if (url.pathname.startsWith('/storage/v1/')) {
      if (req.method === 'POST') {
        let b = ''
        req.on('data', c => (b += c))
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ Key: 'mock_uploaded_file_path.jpg' }))
        })
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify([]))
    }

    // Proxy /rest/v1/* ke PostgREST
    if (url.pathname.startsWith('/rest/v1/')) {
      const targetPath = url.pathname.replace('/rest/v1', '') + url.search
      const targetHeaders = { ...req.headers, host: `localhost:${PGRST_PORT}` }

      const proxyReq = http.request(
        {
          host: '127.0.0.1',
          port: PGRST_PORT,
          path: targetPath,
          method: req.method,
          headers: targetHeaders,
        },
        proxyRes => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers)
          proxyRes.pipe(res)
        }
      )

      proxyReq.on('error', err => {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Bad Gateway', details: err.message }))
      })

      req.pipe(proxyReq)
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not Found' }))
  })

  await new Promise(resolve => server.listen(GATEWAY_PORT, '0.0.0.0', resolve))
  console.log(`[SUPABASE-QA] Supabase Gateway aktif di http://127.0.0.1:${GATEWAY_PORT}`)

  return {
    server,
    pgrstProcess,
    stop: async () => {
      await new Promise(resolve => server.close(resolve))
      try {
        if (process.platform === 'win32') {
          const { execSync } = await import('node:child_process')
          execSync('wsl pkill -f postgrest', { stdio: 'ignore' })
        } else {
          pgrstProcess.kill('SIGTERM')
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
