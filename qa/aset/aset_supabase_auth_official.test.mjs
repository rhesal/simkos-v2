import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { startSupabaseStack } from '../../scripts/start_qa_supabase.mjs'

const SUPABASE_URL = 'http://127.0.0.1:8432'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1xYSIsInJvbGUiOiJhbm9uIiwiZXhwIjoyNTM0MDIzMDA3OTl9.qa-anon-key'

test('Verifikasi Supabase Auth Resmi (GoTrue v2.197.0) & API Terproteksi Token Nyata', { timeout: 60000 }, async (t) => {
  let stack = null

  try {
    stack = await startSupabaseStack()

    let ownerSession = null
    let adminSession = null
    let staffSession = null
    let ownerBSession = null

    // 1. Login owner, admin, dan staff menggunakan GoTrue resmi
    await t.test('1. Login Owner, Admin, dan Staff melalui GoTrue Resmi', async () => {
      const usersToTest = [
        { email: 'owner@simkos.test', pass: 'testpass123' },
        { email: 'admin@simkos.test', pass: 'testpass123' },
        { email: 'staff@simkos.test', pass: 'testpass123' },
        { email: 'ownerb@simkos.test', pass: 'testpass123' },
      ]

      for (const u of usersToTest) {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: ANON_KEY,
          },
          body: JSON.stringify({ email: u.email, password: u.pass }),
        })

        assert.equal(res.status, 200, `Login untuk ${u.email} harus berhasil (status 200)`)
        const data = await res.json()
        assert.ok(data.access_token, `Harus menerima access_token JWT resmi untuk ${u.email}`)
        assert.ok(data.refresh_token, `Harus menerima refresh_token resmi untuk ${u.email}`)
        assert.equal(data.user.email, u.email, 'Email pengguna pada respon harus sesuai')

        if (u.email === 'owner@simkos.test') ownerSession = data
        if (u.email === 'admin@simkos.test') adminSession = data
        if (u.email === 'staff@simkos.test') staffSession = data
        if (u.email === 'ownerb@simkos.test') ownerBSession = data
      }
    })

    // 2. Penolakan password salah oleh GoTrue
    await t.test('2. Penolakan Kredensial Tidak Valid (Password Salah)', async () => {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ email: 'owner@simkos.test', password: 'salah_password' }),
      })

      assert.equal(res.status, 400, 'Password salah harus menghasilkan status 400 Bad Request')
      const err = await res.json()
      assert.equal(err.error_code, 'invalid_credentials', 'Kode kesalahan harus invalid_credentials')
      assert.ok(err.msg.includes('Invalid login credentials'), 'Pesan kesalahan resmi GoTrue harus sesuai')
    })

    // 3. Pemulihan sesi setelah halaman dimuat ulang (Session Recovery via /user)
    await t.test('3. Pemulihan Sesi (Session Recovery) Menggunakan Access Token Resmi', async () => {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${ownerSession.access_token}`,
          apikey: ANON_KEY,
        },
      })

      assert.equal(res.status, 200, 'Pemulihan data user dengan access token harus berhasil')
      const user = await res.json()
      assert.equal(user.email, 'owner@simkos.test')
      assert.equal(user.id, ownerSession.user.id)
    })

    // 4. Pembaruan sesi melalui refresh token (Token Rotation)
    let rotatedSession = null
    await t.test('4. Pembaruan Sesi melalui Refresh Token (Token Rotation)', async () => {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: ownerSession.refresh_token }),
      })

      assert.equal(res.status, 200, 'Refresh token harus menghasilkan status 200')
      rotatedSession = await res.json()
      assert.ok(rotatedSession.access_token, 'Harus menerbitkan access token baru')
      assert.ok(rotatedSession.refresh_token, 'Harus menerbitkan refresh token baru')
      assert.notEqual(rotatedSession.refresh_token, ownerSession.refresh_token, 'Refresh token harus dirotasi')

      // Verifikasi token refresh tidak valid / palsu ditolak
      const invalidRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: 'invalid_dummy_refresh_token' }),
      })
      assert.equal(invalidRes.status, 400, 'Penggunaan refresh token palsu harus ditolak')
    })

    // 5. Logout dan akses ulang ke halaman/endpoint terlindungi
    await t.test('5. Logout dan Akses Ulang ke Endpoint Terlindungi', async () => {
      // Logout via endpoint resmi
      const logoutRes = await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${rotatedSession.access_token}`,
          apikey: ANON_KEY,
        },
      })
      assert.ok([200, 204].includes(logoutRes.status), 'Logout harus berhasil (status 200 atau 204)')

      // Upaya memanggil /auth/v1/user tanpa token harus ditolak
      const unauthRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: ANON_KEY },
      })
      assert.equal(unauthRes.status, 401, 'Akses endpoint terlindungi tanpa token harus ditolak 401')

      // Upaya memanggil refresh token untuk sesi yang sudah di-logout harus ditolak
      const postLogoutRefresh = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ refresh_token: rotatedSession.refresh_token }),
      })
      assert.ok(postLogoutRefresh.status >= 400, 'Refresh token setelah logout harus ditolak')
    })

    // 6. Tambah/edit draf serta penolakan akses lintas organisasi via API dengan token dari Supabase Auth
    await t.test('6. Tambah/Edit Draf Aset dan Penolakan Lintas-Organisasi Menggunakan Token Resmi', async () => {
      // 6.0 Login ulang owner setelah logout di subtes 5 untuk mendapatkan sesi aktif baru
      const reloginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ email: 'owner@simkos.test', password: 'testpass123' }),
      })
      assert.equal(reloginRes.status, 200, 'Login ulang owner setelah logout harus berhasil 200')
      const reloginOwnerSession = await reloginRes.json()
      assert.ok(reloginOwnerSession.access_token, 'Owner harus menerima access token baru setelah login ulang')

      // 6.1 Owner menggunakan sesi miliknya sendiri (bukan token admin) untuk menambah dan mengedit aset
      const clientOwner = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${reloginOwnerSession.access_token}` } },
      })

      const { data: newAsset, error: insertErr } = await clientOwner
        .from('assets')
        .insert({
          nama_aset: 'Gedung Resmi Supabase Auth',
          kategori_aset: 'gedung',
          status_pencatatan: 'draft',
        })
        .select('id, nama_aset')
        .single()

      assert.ok(!insertErr, `Owner harus berhasil membuat aset draf: ${insertErr?.message}`)
      assert.ok(newAsset.id, 'Aset baru harus memiliki ID')

      // Edit aset draf
      const { data: updatedAsset, error: updateErr } = await clientOwner
        .from('assets')
        .update({ nama_aset: 'Gedung Resmi Supabase Auth (Diperbarui)' })
        .eq('id', newAsset.id)
        .select('nama_aset')
        .single()

      assert.ok(!updateErr, `Owner harus berhasil mengedit aset draf: ${updateErr?.message}`)
      assert.equal(updatedAsset.nama_aset, 'Gedung Resmi Supabase Auth (Diperbarui)')

      // 6.2 Staff ditolak saat menambah aset baru
      const clientStaff = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${staffSession.access_token}` } },
      })

      const { error: staffInsertErr } = await clientStaff
        .from('assets')
        .insert({
          nama_aset: 'Aset Ilegal Staf',
          kategori_aset: 'elektronik_kantor',
          status_pencatatan: 'draft',
        })

      assert.ok(staffInsertErr, 'Staf harus ditolak membuat aset baru')
      assert.ok(
        /violates row-level security|permission denied/i.test(staffInsertErr.message),
        `Penolakan staf harus berasal dari RLS policy (actual: ${staffInsertErr.message})`
      )

      // 6.3 Pengguna Organisasi B (Kos Lain) sama sekali tidak dapat melihat aset Organisasi A
      const clientOrgB = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${ownerBSession.access_token}` } },
      })

      const { data: assetsForB, error: bErr } = await clientOrgB
        .from('assets')
        .select('id, nama_aset')

      assert.ok(!bErr, `Query aset untuk Org B tidak boleh error: ${bErr?.message}`)
      assert.equal(assetsForB.length, 0, 'Pengguna dari Organisasi B sama sekali tidak dapat melihat aset Organisasi A')
    })
  } finally {
    if (stack) {
      await stack.stop()
      console.log('[TEST] Stack Supabase lokal dihentikan.')
    }
  }
})
