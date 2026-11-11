-- ==============================================================================
-- Prosedur Pemulihan Operasional (OPERATIONAL RECOVERY - NON-DESTRUCTIVE):
-- recover_1000_assets_phase5_operational.sql
--
-- Tujuan:
-- Melakukan pemulihan keadaan fungsi operasional tanpa merusak atau menghapus data.
-- TIDAK MENGHAPUS (DROP) kolom tabel `asset_activation_snapshots` (`location_id`, `location_recorded`).
-- Memulihkan definisi fungsi RPC `get_period_financial_report` dan helper alokasi
-- ke keadaan stabil yang konsisten, mempertahankan integritas referensial dan RLS.
-- ==============================================================================

-- 1. Kunci transaksi agar pemulihan berjalan atomik
do $$
begin
  -- 2. Pastikan kolom-kolom penting snapshot tetap ada dan bertipe benar
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'asset_activation_snapshots' and column_name = 'location_id'
  ) then
    alter table public.asset_activation_snapshots
      add column location_id uuid references public.locations(id) on delete restrict;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'asset_activation_snapshots' and column_name = 'location_recorded'
  ) then
    alter table public.asset_activation_snapshots
      add column location_recorded boolean not null default false;
  end if;
end $$;

-- 3. Pastikan indeks performa snapshot terpasang
create index if not exists idx_snapshots_location
  on public.asset_activation_snapshots (location_id);

create index if not exists idx_snapshots_org_asset_ver
  on public.asset_activation_snapshots (org_id, asset_id, version desc);

-- 4. Pastikan izin helper internal tetap dicabut dari publik/eksternal
revoke execute on function public.get_expense_effective_allocated_cost(uuid, uuid) from public, anon, authenticated;

-- 5. Pastikan izin RPC resmi aktif untuk authenticated
grant execute on function public.activate_asset(uuid, text) to anon, authenticated;
grant execute on function public.revise_component_parameters(uuid, numeric, numeric, int, date, numeric, text, text, text, uuid, numeric, boolean) to anon, authenticated;
grant execute on function public.get_period_financial_report(uuid, text, uuid) to anon, authenticated;

-- 6. Reload skema PostgREST
notify pgrst, 'reload schema';
