# Peran organisasi: admin, owner, staff (migration 500)

Keputusan Rhesal (2026-10-10): Rhesal admin org SimKos, partner owner. Ke depan SimKos bisa dipakai pemilik kos lain; peran ini tetap **per organisasi**. Admin aplikasi lintas org akan dirancang terpisah dan tidak otomatis membuka data penghuni/KTP org lain.

| Aksi | admin | owner | staff |
| --- | --- | --- | --- |
| Data kos (penghuni, KTP, keuangan, inventaris, nota) | ✅ | ✅ | ✅ (seperti sekarang, `is_org_member`) |
| Ganti nama org | ✅ | ✅ | ❌ |
| Tambah anggota (owner/staff) | ✅ | ❌ | ❌ |
| Ubah peran anggota lain (owner ↔ staff) | ✅ | ❌ | ❌ |
| Keluarkan anggota lain (bukan admin) | ✅ | ❌ | ❌ |
| Jadikan seseorang admin | ❌ lewat API — hanya SQL Editor / service role | ❌ | ❌ |
| Ubah/keluarkan baris sendiri | ❌ | ❌ | ❌ |

- Lewat API, kolom `organization_members` yang boleh di-UPDATE hanya `role` (`user_id`/`org_id` tidak bisa dipindah), dan INSERT hanya `org_id`, `user_id`, `role`. Default `role` anggota baru `staff`; admin memilih peran secara eksplisit.
- Trigger `organization_members_last_admin_guard`: admin terakhir sebuah org tidak bisa dihapus, diturunkan, atau dipindah, **termasuk dari SQL Editor dan saat menghapus akun auth-nya**. Baris org dikunci (`for no key update`), jadi dua perubahan bersamaan juga tidak bisa menghabiskan admin (tes S9r). Untuk ganti admin: naikkan anggota lain jadi admin dulu, baru ubah admin lama. Menghapus organisasinya sendiri (cascade) tetap boleh.
- Migration: `supabase/migrations/20261010000500_org_admin_role.sql`. Calon admin diambil dari `simkos.admin_user_id` (default: user_id Rhesal di live); migration gagal tanpa sisa bila user itu bukan anggota org.
- Rollback: `supabase/rollback/rollback_500_org_admin_role.sql` (admin → owner, policy owner lama kembali). ⚠️ Setelah rollback, sesama owner kembali bisa saling mengeluarkan lewat API.
- Tes: `qa/rls/org/run_local_org.sh` skenario S9/S9b (`50_org_admin_500_tests.sql`), hasil di `qa/rls/org/results_500.txt`.

Ganti admin (SQL Editor, satu transaksi):
```sql
begin;
update public.organization_members set role = 'admin' where user_id = '<user_id_admin_baru>';
update public.organization_members set role = 'owner' where user_id = '<user_id_admin_lama>';
commit;
```

Buat org baru (SQL Editor, satu transaksi). Anggota pertama **wajib** `admin`; tanpa itu tidak ada yang bisa mengelola anggota org tersebut:
```sql
begin;
with o as (insert into public.organizations (name) values ('<Nama Kos>') returning id)
insert into public.organization_members (org_id, user_id, role)
select o.id, u.id, 'admin' from o, auth.users u where u.email = '<email pemilik>';
commit;
```
Anggota lain ditambahkan sebagai `owner` atau `staff`. `organization_members.user_id` unik, jadi akun yang sudah anggota org lain tidak bisa ditambahkan.

Catatan untuk fitur pendaftaran pemilik kos (nanti): pembuat org otomatis jadi `admin`, dan aturan satu akun satu org ditinjau ulang bila ada admin aplikasi lintas org.
