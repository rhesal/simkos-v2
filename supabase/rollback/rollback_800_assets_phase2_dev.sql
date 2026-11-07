-- =====================================================================
-- Rollback 800 (Lingkungan Pengujian / Dev Only)
-- Menghapus seluruh tabel, fungsi, trigger Fase 2 untuk test suite lokal.
-- JANGAN DIJALANKAN DI PRODUKSI BILA SUDAH ADA DATA PENGGUNA.
-- =====================================================================

drop function if exists public.backfill_inventories_to_assets();
drop trigger if exists trg_sync_inventory_to_asset on public.inventories;
drop function if exists public.sync_inventory_to_asset();

drop trigger if exists trg_validate_expense_asset_allocations on public.expenses;
drop function if exists public.validate_expense_asset_allocations();

drop trigger if exists asset_components_doc_path_org on public.asset_components;
drop trigger if exists trg_validate_component_relations on public.asset_components;
drop function if exists public.validate_component_relations();

drop trigger if exists trg_validate_asset_relations on public.assets;
drop function if exists public.validate_asset_relations();

drop table if exists public.asset_components cascade;
drop table if exists public.assets cascade;

alter table public.organizations drop column if exists capitalization_threshold;
