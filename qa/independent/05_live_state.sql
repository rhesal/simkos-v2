-- Kondisi live sebelum PR #1 (dari /workspace/simkos-v2-live/*.json), ditulis ulang oleh QA.
insert into storage.buckets (id, name, public) values ('ktp_images','ktp_images',false), ('receipt_images','receipt_images',false);
do $$
declare t text;
begin
  foreach t in array array['locations','rooms','tenants','rentals','incomes','expenses','inventories'] loop
    execute format('create policy %I on public.%I for all to public using (auth.role() = ''authenticated'')', 'Hanya user login yang bisa akses ' || t, t);
    if t <> 'inventories' then execute format('alter table public.%I enable row level security', t); end if;
    execute format('grant select, insert on public.%I to anon', t);
    execute format('grant all on public.%I to authenticated', t);
  end loop;
end $$;
create policy "Izinkan lihat KTP" on storage.objects for select to authenticated using (bucket_id = 'ktp_images');
create policy "Izinkan upload KTP" on storage.objects for insert to authenticated with check (bucket_id = 'ktp_images');

-- Dua akun live: R (Rhesal) dan P (partner)
insert into auth.users (id, email, created_at) values
  ('11111111-0000-0000-0000-000000000001', 'r@example.test', now() - interval '2 day'),
  ('22222222-0000-0000-0000-000000000002', 'p@example.test', now() - interval '1 day');

-- Data lama tanpa org, file KTP & nota di root bucket (seperti live: 27/27 at_root)
insert into public.locations (id, nama_lokasi) values ('a0000000-0000-0000-0000-000000000001', 'Kos Lama');
insert into public.rooms (id, location_id, nomor_kamar, harga_harian, harga_bulanan, status_kamar)
  values ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '1', 50000, 1000000, 'Terisi');
insert into public.tenants (id, nama_lengkap, foto_ktp_url) values
  ('a0000000-0000-0000-0000-000000000003', 'Penghuni Rhesal', 'ktp_1700000000001.jpg'),
  ('a0000000-0000-0000-0000-000000000013', 'Penghuni Partner', 'ktp_1700000000002.jpg');
insert into public.rentals (id, room_id, tenant_id, tipe_sewa, tanggal_masuk, tanggal_jatuh_tempo)
  values ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'bulanan', current_date, current_date + 30);
insert into public.incomes (id, rental_id, tanggal_bayar, nominal) values ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000004', current_date, 1000000);
insert into public.expenses (id, location_id, tanggal_pengeluaran, kategori, nominal, bukti_nota_url)
  values ('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', current_date, 'Listrik', 200000, 'nota_1700000000003.jpg');
insert into public.inventories (id, location_id, room_id, nama_barang, kondisi) values ('a0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Kasur', 'Baik');
insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('ktp_images', 'ktp_1700000000001.jpg', '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  ('ktp_images', 'ktp_1700000000002.jpg', '22222222-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002'),
  ('ktp_images', 'ktp_yatim_1600000000000.jpg', '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  ('receipt_images', 'nota_1700000000003.jpg', '11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001');
