-- =====================================================================
-- Rollback 800 (Lingkungan Operasional / Aman Data Pengguna)
-- Menonaktifkan fungsi baru tanpa menghapus data aset pengguna secara destruktif.
-- =====================================================================

-- Menjaga tabel tetap ada namun mengarsipkan status bila diperlukan
comment on table public.assets is 'ARCHIVED / DEPRECATED: Modul Aset Fase 2 nonaktif sementara.';
comment on table public.asset_components is 'ARCHIVED / DEPRECATED: Komponen Aset Fase 2 nonaktif sementara.';

-- Nonaktifkan trigger validasi jika terjadi isu operasional
drop trigger if exists trg_validate_component_relations on public.asset_components;
drop trigger if exists trg_validate_asset_relations on public.assets;

-- Data inventories lama tetap utuh 100% dan menjadi fallback aplikasi.
