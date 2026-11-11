import pg from 'pg'
import crypto from 'node:crypto'

const PG_PORT = 54322
const DB_NAME = 'simkos_qa_staging'
const PG_USER = process.env.USER || 'disnak'

function getCanonicalHash(orgId, periodKey, notes = '') {
  return crypto.createHash('md5').update(`${orgId}|${periodKey}|${notes ? notes.trim() : ''}`).digest('hex')
}

export async function seedUatData() {
  console.log('[UAT-SEED] Mengisi data contoh realistis untuk sesi UAT...')
  const client = new pg.Client({ host: 'localhost', port: PG_PORT, user: PG_USER, database: DB_NAME })
  await client.connect()

  try {
    const orgRes = await client.query("SELECT id FROM public.organizations WHERE name = 'SimKos'")
    const orgId = orgRes.rows[0].id

    const loc1Res = await client.query("SELECT id FROM public.locations WHERE org_id = $1 ORDER BY nama_lokasi LIMIT 1", [orgId])
    const loc1Id = loc1Res.rows[0].id

    const ownerRes = await client.query("SELECT id FROM auth.users WHERE email = 'owner@simkos.test'")
    const ownerId = ownerRes.rows[0].id

    // 1. Pastikan pengaturan pembukuan disetel: Tanggal Mulai 2026-06-01
    await client.query(`
      INSERT INTO public.asset_bookkeeping_settings (org_id, tanggal_mulai_pembukuan, created_by, updated_by)
      VALUES ($1, '2026-06-01', $2, $2)
      ON CONFLICT (org_id) DO UPDATE SET tanggal_mulai_pembukuan = '2026-06-01';
    `, [orgId, ownerId])

    // 2. Data Transaksi Pengeluaran Kas Realistis
    // E1: Belanja AC Kamar (Rp 4.500.000) pada 2026-06-01
    const exp1 = (await client.query(`
      INSERT INTO public.expenses (org_id, location_id, kategori, nominal, tanggal_pengeluaran, keterangan)
      VALUES ($1, $2, 'Renovasi', 4500000, '2026-06-01', 'Pembelian AC Split 1 PK Inverter')
      RETURNING id;
    `, [orgId, loc1Id])).rows[0].id

    // E2: Belanja Water Heater (Rp 3.000.000) pada 2026-06-01
    const exp2 = (await client.query(`
      INSERT INTO public.expenses (org_id, location_id, kategori, nominal, tanggal_pengeluaran, keterangan)
      VALUES ($1, $2, 'Renovasi', 3000000, '2026-06-01', 'Pembelian Water Heater Gas')
      RETURNING id;
    `, [orgId, loc1Id])).rows[0].id

    // E3: Biaya Operasional Kas Murni (Rp 2.000.000) pada 2026-06-05
    await client.query(`
      INSERT INTO public.expenses (org_id, location_id, kategori, nominal, tanggal_pengeluaran, keterangan)
      VALUES ($1, $2, 'Kebersihan', 2000000, '2026-06-05', 'Beban Operasional Kebersihan Kos')
    `, [orgId, loc1Id])

    // 3. Data Transaksi Pemasukan Kas Realistis (Pendapatan Sewa Kamar via Rental)
    const activeRentalRes = await client.query("SELECT id FROM public.rentals WHERE org_id = $1 AND status_aktif = true LIMIT 1", [orgId])
    let rentalId = activeRentalRes.rows.length > 0 ? activeRentalRes.rows[0].id : null

    await client.query(`
      INSERT INTO public.incomes (org_id, rental_id, nominal, tanggal_bayar, metode_bayar, keterangan)
      VALUES ($1, $2, 10000000, '2026-06-02', 'Transfer', 'Penerimaan Pembayaran Sewa Kamar Bulan Juni')
    `, [orgId, rentalId])

    // 4. Data Contoh 1: Aset Fisik Draf (Siap diuji alur aktivasi & alokasi)
    const asset1 = (await client.query(`
      INSERT INTO public.assets (org_id, location_id, nama_aset, kategori_aset, dasar_penggunaan, status_pencatatan, catatan, created_by)
      VALUES ($1, $2, 'Water Heater Kamar Deluxe', 'fasilitas_kamar', 'milik_sendiri', 'draft', 'Aset baru siap aktivasi UAT', $3)
      RETURNING id;
    `, [orgId, loc1Id, ownerId])).rows[0].id

    await client.query(`
      INSERT INTO public.asset_components (
        org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
        masa_manfaat_bulan, tanggal_siap_guna, pola_penggunaan, porsi_usaha_persen,
        status_kapitalisasi, metode_penyusutan, expense_id, allocated_cost
      ) VALUES (
        $1, $2, 'Unit Water Heater 30L', 'perolehan_baru', 3000000, 0,
        36, '2026-06-01', 'seluruhnya_usaha', 100,
        'kapitalisasi', 'garis_lurus', $3, 3000000
      );
    `, [orgId, asset1, exp2])

    // 5. Data Contoh 2: Aset Aktif Bersaldo Awal Historis (Diperoleh sebelum 2026-06-01)
    const assetHist = (await client.query(`
      INSERT INTO public.assets (org_id, location_id, nama_aset, kategori_aset, dasar_penggunaan, status_pencatatan, catatan, created_by)
      VALUES ($1, $2, 'Genset Cadangan 5KVA', 'fasilitas_umum', 'milik_sendiri', 'draft', 'Aset historis sebelum pembukuan', $3)
      RETURNING id;
    `, [orgId, loc1Id, ownerId])).rows[0].id

    const compHist = (await client.query(`
      INSERT INTO public.asset_components (
        org_id, asset_id, nama_komponen, jenis_pekerjaan, biaya_perolehan, nilai_sisa,
        masa_manfaat_bulan, tanggal_siap_guna, pola_penggunaan, porsi_usaha_persen,
        status_kapitalisasi, metode_penyusutan
      ) VALUES (
        $1, $2, 'Mesin Genset Silent', 'perolehan_baru', 12000000, 0,
        60, '2025-06-01', 'seluruhnya_usaha', 100,
        'kapitalisasi', 'garis_lurus'
      ) RETURNING id;
    `, [orgId, assetHist])).rows[0].id

    // Aktifkan aset historis
    await client.query(`
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claims', '{"sub":"${ownerId}","role":"authenticated"}', false);
      SELECT public.activate_asset('${assetHist}', 'Aktivasi genset historis');
      RESET ROLE;
    `)

    // Sahkan Saldo Awal Catatan Terdahulu (Akumulasi Rp 2.400.000, Nilai Buku Rp 9.600.000, Sisa 48 Bulan)
    await client.query(`
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claims', '{"sub":"${ownerId}","role":"authenticated"}', false);
      SELECT public.approve_component_opening_balance(
        '${compHist}', 'catatan_terdahulu', 2400000, 2400000, 48, 'Saldo awal pembukuan per 1 Juni 2026'
      );
      RESET ROLE;
    `)

    console.log('[UAT-SEED] Data contoh UAT berhasil diisi!')
  } finally {
    await client.end()
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed_uat_data.mjs')) {
  seedUatData()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err)
      process.exit(1)
    })
}
