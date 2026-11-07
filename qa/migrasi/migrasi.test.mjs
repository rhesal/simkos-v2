import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCatatanKas, parsePaymentLine, parseIndoDate } from '../../src/lib/migrasiParser.js'

test('parseIndoDate: konversi format tanggal Indonesia ke YYYY-MM-DD', () => {
  assert.equal(parseIndoDate('06/07/2026'), '2026-07-06')
  assert.equal(parseIndoDate('06-07-26'), '2026-07-06')
  assert.equal(parseIndoDate('Tgl.19-02-26'), '2026-02-19')
  assert.equal(parseIndoDate('2026-11-04'), '2026-11-04')
  assert.equal(parseIndoDate(''), null)
})

test('parsePaymentLine: ekstrak nominal, tanggal, metode bayar dan keterangan', () => {
  const p1 = parsePaymentLine('1. Tgl.06-07-26 = 750.000 / trnfer lunas')
  assert.deepEqual(p1, {
    tanggal: '2026-07-06',
    nominal: 750000,
    metode: 'Transfer',
    keterangan: 'trnfer lunas'
  })

  const p2 = parsePaymentLine('6. Tgl.19-02-26 = 765.000 / tunai lunas')
  assert.deepEqual(p2, {
    tanggal: '2026-02-19',
    nominal: 765000,
    metode: 'Tunai',
    keterangan: 'tunai lunas'
  })

  const p3 = parsePaymentLine('Tgl. 05/10/2026 : Rp 800.000 (transfer)')
  assert.deepEqual(p3, {
    tanggal: '2026-10-05',
    nominal: 800000,
    metode: 'Transfer',
    keterangan: 'transfer'
  })
})

test('parseCatatanKas: mem-parse teks catatan buku kas lengkap (sesuai gambar pengguna)', () => {
  const rawNote = `Data Kamar Kost KD07

Nama : Ahmad Choirul Riza
Alamat : Kab. Jombang
No. HP : 081234567890
Tgl. Masuk : 06/07/2026
HP Family : --
Catatan : --
Pembayaran/DP :
1. Tgl.06-07-26 = 750.000 / trnfer lunas
2. Tgl.06-08-26 = 750.000 / trnfer lunas
3. Tgl.06-09-26 = 750.000 / tunai lunas
4. Tgl.05-10-26 = 750.000 / tunai lunas
5. Tgl.04-11-26 = 750.000 / tunai lunas
6. Tgl.19-02-26 = 765.000 / tunai lunas`

  const res = parseCatatanKas(rawNote)

  assert.equal(res.nomor_kamar, 'KD07')
  assert.equal(res.nama, 'Ahmad Choirul Riza')
  assert.equal(res.alamat, 'Kab. Jombang')
  assert.equal(res.nomor_hp, '081234567890')
  assert.equal(res.tanggal_masuk, '2026-07-06')
  assert.equal(res.kontak_darurat, '')
  assert.equal(res.catatan, '')
  assert.equal(res.pembayaran.length, 6)

  assert.equal(res.pembayaran[0].nominal, 750000)
  assert.equal(res.pembayaran[0].metode, 'Transfer')
  assert.equal(res.pembayaran[2].metode, 'Tunai')
  assert.equal(res.pembayaran[5].nominal, 765000)
  assert.equal(res.pembayaran[5].tanggal, '2026-02-19')
})
