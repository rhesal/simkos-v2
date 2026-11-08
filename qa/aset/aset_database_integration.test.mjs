import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const ROOT = path.resolve()

// Helper: load and execute SQL file
async function execSqlFile(db, relPath) {
  const fullPath = path.join(ROOT, relPath)
  const sql = fs.readFileSync(fullPath, 'utf8')
  await db.exec(sql)
}

// Helper: switch auth context
async function setAuthContext(db, { userId = null, role = 'anon' } = {}) {
  if (!userId) {
    await db.exec(`
      SET ROLE ${role};
      SELECT set_config('request.jwt.claims', '', false);
      SELECT set_config('request.jwt.claim.sub', '', false);
      SELECT set_config('request.jwt.claim.role', '${role}', false);
    `)
  } else {
    await db.exec(`
      SET ROLE ${role};
      SELECT set_config('request.jwt.claims', '{"sub":"${userId}","role":"${role}"}', false);
      SELECT set_config('request.jwt.claim.sub', '${userId}', false);
      SELECT set_config('request.jwt.claim.role', '${role}', false);
    `)
  }
}

// Reset auth to superuser/service_role
async function setSuperuser(db) {
  await db.exec(`
    SET ROLE postgres;
    SELECT set_config('request.jwt.claims', '', false);
    SELECT set_config('request.jwt.claim.sub', '', false);
    SELECT set_config('request.jwt.claim.role', '', false);
  `)
}

test('Jalur A: Instalasi Bersih dari Skema Dasar & Verifikasi Integrasi SQL dengan Stub Supabase', async (t) => {
  const db = new PGlite()

  // 1. Eksekusi rantai migrasi dasar
  await execSqlFile(db, 'qa/independent/00_stub.sql')
  await execSqlFile(db, 'docs/reference/live_schema_public.sql')
  await execSqlFile(db, 'qa/independent/05_live_state.sql')
  await execSqlFile(db, 'supabase/migrations/20261010000200_organizations_and_backfill.sql')
  await execSqlFile(db, 'supabase/migrations/20261010000210_org_rls_policies.sql')
  await execSqlFile(db, 'qa/independent/13_simulated_move.sql')
  await execSqlFile(db, 'supabase/migrations/20261010000300_private_storage_buckets.sql')
  await execSqlFile(db, 'supabase/migrations/20261010000400_inventories_missing_columns.sql')
  await execSqlFile(db, 'qa/independent/14_org_b_and_users.sql')
  
  // Migration 500 membutuhkan simkos.admin_user_id (Rhesal)
  await db.exec("SET simkos.admin_user_id = '11111111-0000-0000-0000-000000000001';")
  await execSqlFile(db, 'supabase/migrations/20261010000500_org_admin_role.sql')
  await execSqlFile(db, 'supabase/migrations/20261018000600_pindah_kamar.sql')
  await execSqlFile(db, 'supabase/migrations/20261107000700_tenant_alamat.sql')

  // Terapkan Migration 800 (Fase 2 Revisi Terkoreksi)
  await execSqlFile(db, 'supabase/migrations/20261108000800_assets_phase2.sql')

  // Identitas aktor pengujian dari data fixture:
  // Org A ("SimKos")
  const orgARes = await db.query("SELECT id FROM public.organizations WHERE name = 'SimKos'")
  const orgA = orgARes.rows[0].id
  const adminA = '11111111-0000-0000-0000-000000000001' // Rhesal (admin Org A)
  const ownerA = '22222222-0000-0000-0000-000000000002' // Partner (owner Org A)
  const staffA = '44444444-0000-0000-0000-000000000004' // Staff Org A

  // Org B ("Kos Lain")
  const orgB = 'b0000000-0000-0000-0000-00000000000b'
  const ownerB = '33333333-0000-0000-0000-000000000003' // Owner Org B

  await t.test('1.1 Verifikasi Katalog pg_proc: hanya fungsi berparameter yang aktif', async () => {
    const res = await db.query(`
      SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'backfill_inventories_to_assets';
    `)
    assert.equal(res.rows.length, 1, 'Hanya boleh ada tepat satu overload fungsi backfill')
    assert.ok(res.rows[0].args.includes('uuid'), 'Fungsi harus menerima parameter uuid')
  })

  await t.test('1.2 Verifikasi Katalog pg_policies: policy lama bersih, policy baru aktif', async () => {
    const res = await db.query(`
      SELECT policyname, tablename
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename IN ('assets', 'asset_components');
    `)
    const policyNames = res.rows.map(r => r.policyname)

    // Policy lama tidak boleh ada
    assert.ok(!policyNames.includes('assets_org_access'), 'Policy lama assets_org_access tidak boleh ada')
    assert.ok(!policyNames.includes('asset_components_org_access'), 'Policy lama asset_components_org_access tidak boleh ada')

    // Policy baru granular wajib aktif
    assert.ok(policyNames.includes('assets_org_read'), 'Policy assets_org_read harus aktif')
    assert.ok(policyNames.includes('assets_org_write'), 'Policy assets_org_write harus aktif')
    assert.ok(policyNames.includes('assets_org_update'), 'Policy assets_org_update harus aktif')
    assert.ok(policyNames.includes('assets_org_delete'), 'Policy assets_org_delete harus aktif')
    assert.ok(policyNames.includes('asset_components_org_read'), 'Policy asset_components_org_read harus aktif')
    assert.ok(policyNames.includes('asset_components_org_write'), 'Policy asset_components_org_write harus aktif')
    assert.ok(policyNames.includes('asset_components_org_update'), 'Policy asset_components_org_update harus aktif')
    assert.ok(policyNames.includes('asset_components_org_delete'), 'Policy asset_components_org_delete harus aktif')
  })

  let assetAId = null

  await t.test('1.3 Isolasi Hak Akses RLS: Anonim, Staff, Owner, dan Lintas-Organisasi', async () => {
    // 1.3.1 Anonim ditolak melihat atau menambah aset
    await setAuthContext(db, { role: 'anon' })
    const anonRead = await db.query('SELECT * FROM public.assets')
    assert.equal(anonRead.rows.length, 0, 'Anonim tidak boleh melihat aset apapun')

    await assert.rejects(
      async () => {
        await db.query(`
          INSERT INTO public.assets (org_id, nama_aset, kategori_aset)
          VALUES ('${orgA}', 'Aset Anonim', 'elektronik_kantor');
        `)
      },
      /permission denied|new row violates row-level security policy/i,
      'Anonim harus ditolak membuat aset'
    )

    // 1.3.2 Owner A dapat membuat aset draf di Org A
    await setAuthContext(db, { userId: ownerA, role: 'authenticated' })
    const insertAsset = await db.query(`
      INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan)
      VALUES ('${orgA}', 'Gedung Utama Melati', 'gedung', 'draft')
      RETURNING id;
    `)
    assert.equal(insertAsset.rows.length, 1)
    assetAId = insertAsset.rows[0].id

    // 1.3.3 Staff A dapat membaca aset di Org A
    await setAuthContext(db, { userId: staffA, role: 'authenticated' })
    const staffRead = await db.query(`SELECT id, nama_aset FROM public.assets WHERE id = '${assetAId}'`)
    assert.equal(staffRead.rows.length, 1, 'Staff harus dapat membaca aset di organisasinya')

    // 1.3.4 Staff A DITOLAK membuat aset draf (violates WITH CHECK)
    await assert.rejects(
      async () => {
        await db.query(`
          INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan)
          VALUES ('${orgA}', 'Aset Ilegal Staff', 'elektronik_kantor', 'draft');
        `)
      },
      /violates row-level security policy|permission denied/i,
      'Staff harus ditolak menambahkan aset baru'
    )

    // Staff A DITOLAK mengubah aset draf (di-filter oleh RLS USING sehingga rowCount = 0)
    const staffUpdate = await db.query(`
      UPDATE public.assets SET nama_aset = 'Gedung Diubah Staff' WHERE id = '${assetAId}';
    `)
    assert.equal(staffUpdate.rowCount, 0, 'Staff dilarang mengupdate aset (0 baris diubah karena ditolak RLS USING)')

    // 1.3.5 Owner B di Org B TIDAK DAPAT membaca atau memodifikasi aset Org A
    await setAuthContext(db, { userId: ownerB, role: 'authenticated' })
    const orgBRead = await db.query(`SELECT * FROM public.assets WHERE id = '${assetAId}'`)
    assert.equal(orgBRead.rows.length, 0, 'Organisasi lain tidak boleh melihat aset Org A')

    const updateOtherOrg = await db.query(`UPDATE public.assets SET nama_aset = 'Dibajak Org B' WHERE id = '${assetAId}'`)
    assert.equal(updateOtherOrg.rowCount, 0, 'Update lintas org tidak boleh menyentuh baris manapun')
  })

  await t.test('1.4 Validasi Integritas Relasi Lintas-Organisasi (Cross-Tenant)', async () => {
    // Siapkan fixture lokasi Org A dan Org B
    await setSuperuser(db)
    const locA = (await db.query(`INSERT INTO public.locations (org_id, nama_lokasi) VALUES ('${orgA}', 'Lokasi A') RETURNING id`)).rows[0].id
    const locB = (await db.query(`INSERT INTO public.locations (org_id, nama_lokasi) VALUES ('${orgB}', 'Lokasi B') RETURNING id`)).rows[0].id
    const roomB = (await db.query(`INSERT INTO public.rooms (org_id, location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar) VALUES ('${orgB}', '${locB}', 'K101', 50000, 1000000, 'Kosong') RETURNING id`)).rows[0].id
    const expB = (await db.query(`INSERT INTO public.expenses (org_id, location_id, tanggal_pengeluaran, kategori, nominal, keterangan) VALUES ('${orgB}', '${locB}', CURRENT_DATE, 'Renovasi', 5000000, 'Nota B') RETURNING id`)).rows[0].id

    await setAuthContext(db, { userId: adminA, role: 'authenticated' })

    // Aset Org A menautkan lokasi Org B -> Ditolak
    await assert.rejects(
      async () => {
        await db.query(`
          INSERT INTO public.assets (org_id, nama_aset, kategori_aset, location_id, status_pencatatan)
          VALUES ('${orgA}', 'Aset Silang Lokasi', 'gedung', '${locB}', 'draft');
        `)
      },
      /SIMKOS_CROSS_TENANT_LOCATION/,
      'Aset tidak boleh menautkan lokasi milik organisasi lain'
    )

    // Buat aset legal di Org A
    const validAssetA = (await db.query(`
      INSERT INTO public.assets (org_id, nama_aset, kategori_aset, location_id, status_pencatatan)
      VALUES ('${orgA}', 'Aset Valid A', 'gedung', '${locA}', 'draft')
      RETURNING id;
    `)).rows[0].id

    // Komponen Org A menautkan kamar Org B -> Ditolak pada aset
    await assert.rejects(
      async () => {
        await db.query(`
          INSERT INTO public.assets (org_id, nama_aset, kategori_aset, room_id, status_pencatatan)
          VALUES ('${orgA}', 'Aset Silang Kamar Org B', 'fasilitas_kamar', '${roomB}', 'draft');
        `)
      },
      /SIMKOS_CROSS_TENANT_ROOM/,
      'Aset tidak boleh menautkan kamar milik organisasi lain'
    )

    // Komponen Org A menautkan pengeluaran Org B -> Ditolak
    await assert.rejects(
      async () => {
        await db.query(`
          INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, expense_id, allocated_cost)
          VALUES ('${orgA}', '${validAssetA}', 'Renovasi Silang Org', 'perolehan_baru', '${expB}', 1000000);
        `)
      },
      /SIMKOS_CROSS_TENANT_EXPENSE/,
      'Komponen tidak boleh menautkan pengeluaran milik organisasi lain'
    )
  })

  await t.test('1.5 Batas Alokasi Pengeluaran & Proteksi Hapus Pengeluaran Teralokasi', async () => {
    await setSuperuser(db)
    const locA = (await db.query(`SELECT id FROM public.locations WHERE org_id = '${orgA}' LIMIT 1`)).rows[0].id
    const expA = (await db.query(`
      INSERT INTO public.expenses (org_id, location_id, tanggal_pengeluaran, kategori, nominal, keterangan)
      VALUES ('${orgA}', '${locA}', CURRENT_DATE, 'Peralatan', 1000000, 'Beli TV dan Kulkas')
      RETURNING id;
    `)).rows[0].id
    const assetA = (await db.query(`SELECT id FROM public.assets WHERE org_id = '${orgA}' LIMIT 1`)).rows[0].id

    await setAuthContext(db, { userId: ownerA, role: 'authenticated' })

    // Alokasi 1: Biaya komponen 700.000, alokasi 600.000 (Legal)
    await db.query(`
      INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, expense_id, allocated_cost)
      VALUES ('${orgA}', '${assetA}', 'Kulkas 1 Pintu', 'perolehan_baru', 700000, '${expA}', 600000);
    `)

    // Alokasi melebihi biaya perolehan komponen -> DITOLAK
    await assert.rejects(
      async () => {
        await db.query(`
          INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, expense_id, allocated_cost)
          VALUES ('${orgA}', '${assetA}', 'TV Kamar', 'perolehan_baru', 300000, '${expA}', 400000);
        `)
      },
      /SIMKOS_ALLOCATION_EXCEEDS_ASSET_COST/,
      'Alokasi biaya tidak boleh melebihi biaya perolehan komponen'
    )

    // Alokasi 2: Biaya komponen 600.000, alokasi 500.000 (Total alokasi 600k + 500k = 1.1jt > 1jt -> DITOLAK)
    await assert.rejects(
      async () => {
        await db.query(`
          INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, expense_id, allocated_cost)
          VALUES ('${orgA}', '${assetA}', 'TV Kamar', 'perolehan_baru', 600000, '${expA}', 500000);
        `)
      },
      /SIMKOS_OVERALLOCATED_EXPENSE/,
      'Total alokasi tidak boleh melebihi nominal transaksi pengeluaran sumber'
    )

    // Menghapus transaksi pengeluaran yang memiliki relasi alokasi komponen -> DITOLAK
    await assert.rejects(
      async () => {
        await db.query(`DELETE FROM public.expenses WHERE id = '${expA}';`)
      },
      /SIMKOS_EXPENSE_HAS_ALLOCATED_ASSET/,
      'Pengeluaran yang dialokasikan ke aset tidak boleh dihapus'
    )

    // Menurunkan nominal pengeluaran di bawah total alokasi yang sudah ada (600.000) -> DITOLAK
    await assert.rejects(
      async () => {
        await db.query(`UPDATE public.expenses SET nominal = 500000 WHERE id = '${expA}';`)
      },
      /SIMKOS_EXPENSE_BELOW_ALLOCATIONS/,
      'Nominal pengeluaran tidak boleh diturunkan di bawah total alokasi aset terkait'
    )
  })

  await t.test('1.6 Constraint Komponen Asal Unik (uq_asset_origin_inventory_component)', async () => {
    await setAuthContext(db, { userId: adminA, role: 'authenticated' })
    const assetRes = await db.query(`
      INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan)
      VALUES ('${orgA}', 'Aset Tes Komponen Asal', 'elektronik_kantor', 'draft')
      RETURNING id;
    `)
    const assetId = assetRes.rows[0].id

    // Komponen asal ke-1 (Legal)
    await db.query(`
      INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, is_origin_inventory, biaya_perolehan)
      VALUES ('${orgA}', '${assetId}', 'Unit Asal 1', 'perolehan_baru', true, 500000);
    `)

    // Komponen asal ke-2 pada aset yang sama -> DITOLAK oleh UNIQUE constraint
    await assert.rejects(
      async () => {
        await db.query(`
          INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, is_origin_inventory, biaya_perolehan)
          VALUES ('${orgA}', '${assetId}', 'Unit Asal 2 (Duplikat Asal)', 'perolehan_baru', true, 300000);
        `)
      },
      /uq_asset_origin_inventory_component|unique constraint/i,
      'Maksimal hanya boleh ada 1 komponen asal per aset'
    )
  })

  let testInvId = null
  let linkedAssetId = null
  let originCompId = null

  await t.test('1.7 Skenario Lengkap Transisi Inventaris & Penanda Mutasi Finansial Server', async () => {
    await setSuperuser(db)
    const locA = (await db.query(`SELECT id FROM public.locations WHERE org_id = '${orgA}' LIMIT 1`)).rows[0].id
    
    // Siapkan data inventaris baru di Org A (skema: id, org_id, location_id, nama_barang, kondisi, harga, tanggal_pembelian, catatan)
    const invRes = await db.query(`
      INSERT INTO public.inventories (org_id, location_id, nama_barang, kondisi, harga, tanggal_pembelian, catatan)
      VALUES ('${orgA}', '${locA}', 'Dispenser Galon Bawah', 'Baik', 1500000, '2026-03-01', 'Beli baru di toko elektronik')
      RETURNING id;
    `)
    testInvId = invRes.rows[0].id

    // Jalankan Backfill RPC untuk Org A oleh Admin
    await setAuthContext(db, { userId: adminA, role: 'authenticated' })
    const backfillRes = await db.query(`SELECT * FROM public.backfill_inventories_to_assets('${orgA}');`)
    assert.equal(backfillRes.rows.length, 1)
    assert.ok(backfillRes.rows[0].inserted_assets >= 1, 'Aset baru harus terbentuk dari inventaris')
    assert.ok(backfillRes.rows[0].inserted_components >= 1, 'Komponen asal harus terbentuk')

    // Periksa aset dan komponen yang terbentuk
    const linkedAsset = (await db.query(`SELECT * FROM public.assets WHERE legacy_inventory_id = '${testInvId}'`)).rows[0]
    assert.ok(linkedAsset, 'Aset harus tertaut ke inventaris')
    assert.equal(linkedAsset.status_pencatatan, 'draft')
    linkedAssetId = linkedAsset.id

    const originComp = (await db.query(`SELECT * FROM public.asset_components WHERE asset_id = '${linkedAsset.id}' AND is_origin_inventory = true`)).rows[0]
    assert.ok(originComp, 'Komponen asal harus bertanda is_origin_inventory = true')
    assert.equal(Number(originComp.biaya_perolehan), 1500000)
    assert.equal(originComp.financials_customized_in_asset, false, 'financials_customized_in_asset awalnya false')
    originCompId = originComp.id

    // (b) Ubah harga di inventaris pertama kali (1.500.000 -> 1.700.000)
    await db.query(`UPDATE public.inventories SET harga = 1700000 WHERE id = '${testInvId}'`)
    const compAfterSync1 = (await db.query(`SELECT * FROM public.asset_components WHERE id = '${originCompId}'`)).rows[0]
    assert.equal(Number(compAfterSync1.biaya_perolehan), 1700000, 'Harga tersinkron otomatis ke komponen')
    assert.equal(compAfterSync1.financials_customized_in_asset, false, 'Penanda kustomisasi harus tetap false')

    // (c) Ubah harga di inventaris kedua kali (1.700.000 -> 1.850.000)
    await db.query(`UPDATE public.inventories SET harga = 1850000 WHERE id = '${testInvId}'`)
    const compAfterSync2 = (await db.query(`SELECT * FROM public.asset_components WHERE id = '${originCompId}'`)).rows[0]
    assert.equal(Number(compAfterSync2.biaya_perolehan), 1850000, 'Harga tersinkron otomatis ke komponen kedua kali')
    assert.equal(compAfterSync2.financials_customized_in_asset, false, 'Penanda kustomisasi tetap false')

    // (d) Edit biaya perolehan komponen langsung via modul Aset (misal menjadi 2.200.000)
    await db.query(`
      UPDATE public.asset_components 
      SET biaya_perolehan = 2200000 
      WHERE id = '${originCompId}'
    `)
    const compAfterCustom = (await db.query(`SELECT * FROM public.asset_components WHERE id = '${originCompId}'`)).rows[0]
    assert.equal(Number(compAfterCustom.biaya_perolehan), 2200000)
    assert.equal(compAfterCustom.financials_customized_in_asset, true, 'Server harus menandai financials_customized_in_asset = true')

    // (e) Ubah catatan & kondisi di inventaris (harga di inventaris 1.850.000)
    await db.query(`
      UPDATE public.inventories 
      SET kondisi = 'Rusak Ringan', catatan = 'Kran air dingin bocor halus'
      WHERE id = '${testInvId}'
    `)
    const compAfterInvNoteEdit = (await db.query(`SELECT * FROM public.asset_components WHERE id = '${originCompId}'`)).rows[0]
    assert.equal(Number(compAfterInvNoteEdit.biaya_perolehan), 2200000, 'BIAYA ASET TETAP UTUH (2.200.000) tidak ditimpa oleh inventaris!')
    assert.equal(compAfterInvNoteEdit.financials_customized_in_asset, true)

    // Catatan dan kondisi aset tetap diperbarui
    const assetAfterInvNoteEdit = (await db.query(`SELECT * FROM public.assets WHERE id = '${linkedAssetId}'`)).rows[0]
    assert.equal(assetAfterInvNoteEdit.kondisi_fisik, 'rusak_ringan')
    assert.ok(assetAfterInvNoteEdit.catatan.includes('Kran air dingin'))

    // (f) Client mencoba mereset flag financials_customized_in_asset menjadi false -> Ditolak server
    await assert.rejects(
      async () => {
        await db.query(`
          UPDATE public.asset_components 
          SET financials_customized_in_asset = false 
          WHERE id = '${originCompId}'
        `)
      },
      /SIMKOS_CANNOT_RESET_CUSTOMIZED_FINANCIALS/,
      'Client tidak boleh mereset flag penanda perubahan finansial'
    )

    // (g) Staf mencoba mengubah harga inventaris yang tertaut ke aset -> Ditolak
    await setAuthContext(db, { userId: staffA, role: 'authenticated' })
    await assert.rejects(
      async () => {
        await db.query(`UPDATE public.inventories SET harga = 999999 WHERE id = '${testInvId}'`)
      },
      /SIMKOS_STAFF_CANNOT_MUTATE_ASSET_FINANCIALS/,
      'Staff dilarang mengubah harga inventaris yang tertaut ke aset'
    )

    // (h) Ketika aset berstatus selain draft (misal terverifikasi), inventaris terkunci dari perubahan finansial/identitas
    await setSuperuser(db)
    await db.exec(`
      SET session_replication_role = 'replica';
      UPDATE public.assets SET status_pencatatan = 'terverifikasi' WHERE id = '${linkedAssetId}';
      SET session_replication_role = 'origin';
    `)
    await setAuthContext(db, { userId: adminA, role: 'authenticated' })
    await assert.rejects(
      async () => {
        await db.query(`UPDATE public.inventories SET harga = 9999999 WHERE id = '${testInvId}'`)
      },
      /SIMKOS_ASSET_ALREADY_VERIFIED/,
      'Inventaris yang tertaut ke aset terverifikasi tidak boleh diubah nilai harga/identitasnya'
    )
  })

  await t.test('1.8 Idempotensi RPC Backfill & Penolakan Hak Akses Staf', async () => {
    // Eksekusi ulang backfill untuk Org A harus mengembalikan 0 aset baru (idempoten)
    await setAuthContext(db, { userId: adminA, role: 'authenticated' })
    const repeatRes = await db.query(`SELECT * FROM public.backfill_inventories_to_assets('${orgA}');`)
    assert.equal(repeatRes.rows[0].inserted_assets, 0, 'Backfill ulang tidak boleh menambah aset duplikat')
    assert.equal(repeatRes.rows[0].inserted_components, 0)

    // Staff mencoba mengeksekusi RPC backfill -> Ditolak
    await setAuthContext(db, { userId: staffA, role: 'authenticated' })
    await assert.rejects(
      async () => {
        await db.query(`SELECT * FROM public.backfill_inventories_to_assets('${orgA}');`)
      },
      /SIMKOS_UNAUTHORIZED|Hanya admin atau owner/i,
      'Staff dilarang menjalankan fungsi backfill inventaris'
    )
  })

  await t.test('1.9 Verifikasi Batas Keamanan Penanda simkos.in_inventory_sync & Proteksi Bypass', async () => {
    await setSuperuser(db)
    // 1.9.1 Nilai awal setting simkos.in_inventory_sync adalah false, kosong, atau null
    const initialRes = await db.query("SELECT current_setting('simkos.in_inventory_sync', true) as val;")
    const initialSetting = initialRes.rows[0].val
    assert.ok(
      initialSetting === 'false' || initialSetting === '' || initialSetting === null,
      'Setting awal harus bernilai false, kosong, atau tidak ter-set'
    )

    // 1.9.2 Client mencoba memanipulasi update komponen dengan menyertakan financials_customized_in_asset = false
    await setAuthContext(db, { userId: ownerA, role: 'authenticated' })
    const assetNewRes = await db.query(`
      INSERT INTO public.assets (org_id, nama_aset, kategori_aset, status_pencatatan)
      VALUES ('${orgA}', 'Aset Pengujian Spoofing', 'elektronik_kantor', 'draft') RETURNING id;
    `)
    const aNewId = assetNewRes.rows[0].id

    const compNewRes = await db.query(`
      INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, financials_customized_in_asset)
      VALUES ('${orgA}', '${aNewId}', 'Komponen Uji Spoofing', 'perolehan_baru', 500000, false) RETURNING id;
    `)
    const cNewId = compNewRes.rows[0].id

    // Client memodifikasi biaya menjadi 800.000 dan secara eksplisit menyertakan financials_customized_in_asset = false dalam payload
    await db.query(`
      UPDATE public.asset_components
      SET biaya_perolehan = 800000, financials_customized_in_asset = false
      WHERE id = '${cNewId}';
    `)
    const compAfterSpoof = (await db.query(`SELECT financials_customized_in_asset, biaya_perolehan FROM public.asset_components WHERE id = '${cNewId}'`)).rows[0]
    assert.equal(compAfterSpoof.financials_customized_in_asset, true, 'Trigger server WAJIB memaksakan true bila perubahan biaya tidak melalui sinkronisasi server')
    assert.equal(Number(compAfterSpoof.biaya_perolehan), 800000)

    // 1.9.3 Setelah operasi selesai, setting simkos.in_inventory_sync tidak aktif (false/kosong/null)
    const afterUpdateSetting = (await db.query("SELECT current_setting('simkos.in_inventory_sync', true) as val;")).rows[0].val
    assert.ok(
      afterUpdateSetting === 'false' || afterUpdateSetting === '' || afterUpdateSetting === null,
      'Setting harus tidak aktif (false/kosong/null) setelah update client'
    )

    // 1.9.4 Jika terjadi error/exception saat sinkronisasi inventaris, transaksi rollback dan setting tetap aman
    await assert.rejects(
      async () => {
        // Memicu error dengan memberikan nilai harga negatif yang melanggar check constraint
        await db.query(`
          UPDATE public.inventories SET harga = -1000 WHERE id = '${testInvId}';
        `)
      },
      /violates check constraint/i,
      'Operasi inventaris invalid harus gagal'
    )

    const afterRollbackSetting = (await db.query("SELECT current_setting('simkos.in_inventory_sync', true) as val;")).rows[0].val
    assert.ok(
      afterRollbackSetting === 'false' || afterRollbackSetting === '' || afterRollbackSetting === null,
      'Setting harus tidak aktif (false/kosong/null) bahkan setelah transaksi gagal/rollback'
    )
  })
})

test('Jalur B: Pembaruan Skema dari Versi Lama (Upgrade Path & Pembersihan Objek Legacy)', async (t) => {
  const db = new PGlite()

  // 1. Eksekusi skema baseline sampai migration 700
  await execSqlFile(db, 'qa/independent/00_stub.sql')
  await execSqlFile(db, 'docs/reference/live_schema_public.sql')
  await execSqlFile(db, 'qa/independent/05_live_state.sql')
  await execSqlFile(db, 'supabase/migrations/20261010000200_organizations_and_backfill.sql')
  await execSqlFile(db, 'supabase/migrations/20261010000210_org_rls_policies.sql')
  await execSqlFile(db, 'qa/independent/13_simulated_move.sql')
  await execSqlFile(db, 'supabase/migrations/20261010000300_private_storage_buckets.sql')
  await execSqlFile(db, 'supabase/migrations/20261010000400_inventories_missing_columns.sql')
  await execSqlFile(db, 'qa/independent/14_org_b_and_users.sql')
  await db.exec("SET simkos.admin_user_id = '11111111-0000-0000-0000-000000000001';")
  await execSqlFile(db, 'supabase/migrations/20261010000500_org_admin_role.sql')
  await execSqlFile(db, 'supabase/migrations/20261018000600_pindah_kamar.sql')
  await execSqlFile(db, 'supabase/migrations/20261107000700_tenant_alamat.sql')

  const orgARes = await db.query("SELECT id FROM public.organizations WHERE name = 'SimKos'")
  const orgA = orgARes.rows[0].id

  // 2. Pasang skema versi terdahulu yang pernah diterapkan (commit 8bee6db)
  await execSqlFile(db, 'qa/aset/fixture_legacy_phase2_8bee6db.sql')

  // 3. Masukkan data sintetis realistis pada skema terdahulu:
  const locARes = await db.query(`SELECT id FROM public.locations WHERE org_id = '${orgA}' LIMIT 1`)
  const locA = locARes.rows[0].id
  const inv1Res = await db.query(`
    INSERT INTO public.inventories (org_id, location_id, nama_barang, kondisi)
    VALUES ('${orgA}', '${locA}', 'Barang Legacy 1', 'Baik') RETURNING id;
  `)
  const inv1Id = inv1Res.rows[0].id

  const inv2Res = await db.query(`
    INSERT INTO public.inventories (org_id, location_id, nama_barang, kondisi)
    VALUES ('${orgA}', '${locA}', 'Barang Legacy 2', 'Baik') RETURNING id;
  `)
  const inv2Id = inv2Res.rows[0].id

  // Data Aset 1: Tepat 1 komponen perolehan_baru (harus otomatis menjadi is_origin_inventory = true)
  const a1 = (await db.query(`
    INSERT INTO public.assets (org_id, nama_aset, kategori_aset, legacy_inventory_id, status_pencatatan)
    VALUES ('${orgA}', 'Aset Legacy Tunggal', 'elektronik_kantor', '${inv1Id}', 'draft')
    RETURNING id;
  `)).rows[0].id
  const c1 = (await db.query(`
    INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan)
    VALUES ('${orgA}', '${a1}', 'Komponen Tunggal', 'perolehan_baru', 250000)
    RETURNING id;
  `)).rows[0].id

  // Data Aset 2: Ambigu (>1 komponen perolehan_baru pada aset yang sama) (harus ditandai status_kapitalisasi = 'perlu_telaah')
  const a2 = (await db.query(`
    INSERT INTO public.assets (org_id, nama_aset, kategori_aset, legacy_inventory_id, status_pencatatan)
    VALUES ('${orgA}', 'Aset Legacy Ambigu', 'elektronik_kantor', '${inv2Id}', 'draft')
    RETURNING id;
  `)).rows[0].id
  const c2a = (await db.query(`
    INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan)
    VALUES ('${orgA}', '${a2}', 'Komponen Ambigu 1', 'perolehan_baru', 300000)
    RETURNING id;
  `)).rows[0].id
  const c2b = (await db.query(`
    INSERT INTO public.asset_components (org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan)
    VALUES ('${orgA}', '${a2}', 'Komponen Ambigu 2', 'perolehan_baru', 450000)
    RETURNING id;
  `)).rows[0].id

  await t.test('2.1 Menerapkan Migrasi 800 final di atas skema versi 8bee6db', async () => {
    // Terapkan migration 800 revisi
    await execSqlFile(db, 'supabase/migrations/20261108000800_assets_phase2.sql')
  })

  await t.test('2.2 Verifikasi pembersihan policy lama dan fungsi 0-argumen dari katalog', async () => {
    // Policy lama assets_org_access dan asset_components_org_access harus sudah hilang
    const policies = (await db.query(`
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND policyname IN ('assets_org_access', 'asset_components_org_access');
    `)).rows
    assert.equal(policies.length, 0, 'Policy lama assets_org_access & asset_components_org_access harus terhapus bersih')

    // Fungsi 0-argumen harus sudah hilang dan digantikan oleh overload 1-argumen
    const funcs = (await db.query(`
      SELECT proname, pg_get_function_identity_arguments(p.oid) as args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'backfill_inventories_to_assets';
    `)).rows
    assert.equal(funcs.length, 1, 'Hanya ada tepat 1 fungsi backfill')
    assert.ok(funcs[0].args.includes('uuid'), 'Fungsi harus menerima parameter org_id')
  })

  await t.test('2.3 Verifikasi pelestarian data eksisting & pemetaan komponen asal', async () => {
    // Pelestarian data: seluruh aset lama tetap utuh
    const allAssets = (await db.query(`SELECT id, nama_aset FROM public.assets WHERE id IN ('${a1}', '${a2}')`)).rows
    assert.equal(allAssets.length, 2, 'Data aset eksisting harus tetap lestari dan utuh')

    // Kasus 1: Komponen tunggal harus dipetakan menjadi is_origin_inventory = true
    const resC1 = (await db.query(`SELECT is_origin_inventory, status_kapitalisasi FROM public.asset_components WHERE id = '${c1}'`)).rows[0]
    assert.equal(resC1.is_origin_inventory, true, 'Komponen tunggal harus ditandai is_origin_inventory = true')

    // Kasus 2: Komponen ambigu harus ditandai status_kapitalisasi = 'perlu_telaah' dengan catatan audit
    const resC2a = (await db.query(`SELECT is_origin_inventory, status_kapitalisasi, catatan_telaah FROM public.asset_components WHERE id = '${c2a}'`)).rows[0]
    const resC2b = (await db.query(`SELECT is_origin_inventory, status_kapitalisasi, catatan_telaah FROM public.asset_components WHERE id = '${c2b}'`)).rows[0]

    assert.equal(resC2a.is_origin_inventory, false)
    assert.equal(resC2a.status_kapitalisasi, 'perlu_telaah')
    assert.ok(resC2a.catatan_telaah.includes('ambigu'))

    assert.equal(resC2b.is_origin_inventory, false)
    assert.equal(resC2b.status_kapitalisasi, 'perlu_telaah')
    assert.ok(resC2b.catatan_telaah.includes('ambigu'))
  })
})
