-- ==============================================================================
-- Rollback Pengembangan: rollback_900_assets_phase4_bookkeeping.sql
-- Modul: Aset & Inventaris SimKos (Fase 4B-1)
-- Deskripsi: Rollback bersih struktur pembukuan aset untuk lingkungan dev/staging.
-- ==============================================================================

-- 1. Hapus RPC functions
drop function if exists public.unlock_accounting_period(uuid, text, text);
drop function if exists public.lock_accounting_period(uuid, text);
drop function if exists public.reverse_depreciation_batch(uuid, text);
drop function if exists public.post_depreciation_batch(uuid, text, text, text, text, text);
drop function if exists public.preview_depreciation_posting(uuid, text);
drop function if exists public.cancel_component_opening_balance(uuid, text);
drop function if exists public.approve_component_opening_balance(uuid, text, numeric, numeric, int, text);
drop function if exists public.activate_asset(uuid, text);
drop function if exists public.set_bookkeeping_start_date(uuid, date);
drop function if exists public.calc_component_manual_schedule(numeric, numeric, numeric, numeric, numeric, numeric, numeric, int, date);
drop function if exists public.calc_component_depreciation_schedule(numeric, numeric, int, date, numeric);

-- 2. Hapus tabel-tabel pembukuan
drop table if exists public.asset_accounting_audit_logs cascade;
drop table if exists public.asset_depreciation_ledger cascade;
drop table if exists public.asset_depreciation_batches cascade;
drop table if exists public.asset_accounting_periods cascade;
drop table if exists public.asset_opening_balances cascade;
drop table if exists public.asset_activation_snapshots cascade;
drop table if exists public.asset_bookkeeping_settings cascade;
