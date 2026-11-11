-- ==============================================================================
-- Rollback Pengembangan (DEVELOPMENT ONLY): rollback_1000_assets_phase5_financial_report.sql
-- PERINGATAN: SKRIP INI HANYA UNTUK KEPERLUAN PENGEMBANGAN / TEST RUNNER LOKAL!
-- JANGAN PERNAH DIJALANKAN DI LINGKUNGAN OPERASIONAL ATAU PRODUKSI!
-- Skrip ini merusak (DESTRUCTIVE) karena menghapus kolom metadata snapshot (location_id, location_recorded).
-- Untuk pemulihan operasional (hotfix/disaster recovery), gunakan prosedur pemulihan
-- operasional yang mempertahankan integritas data dan tabel snapshot.
-- ==============================================================================

drop function if exists public.get_period_financial_report(uuid, text, uuid);
drop function if exists public.get_expense_effective_allocated_cost(uuid, uuid);

drop index if exists public.idx_snapshots_location;
drop index if exists public.idx_snapshots_org_asset_ver;

alter table public.asset_activation_snapshots
  drop column if exists location_recorded,
  drop column if exists location_id;
