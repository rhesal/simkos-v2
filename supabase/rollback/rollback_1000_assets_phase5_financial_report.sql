-- ==============================================================================
-- Rollback Pengembangan: rollback_1000_assets_phase5_financial_report.sql
-- Mengembalikan penambahan Fase 5B ke baseline akhir Fase 4B-2R
-- ==============================================================================

drop function if exists public.get_period_financial_report(uuid, text, uuid);
drop function if exists public.get_expense_effective_allocated_cost(uuid, uuid);

drop index if exists public.idx_snapshots_location;
drop index if exists public.idx_snapshots_org_asset_ver;

alter table public.asset_activation_snapshots
  drop column if exists location_recorded,
  drop column if exists location_id;
