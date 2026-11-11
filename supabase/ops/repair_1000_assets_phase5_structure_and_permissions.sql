-- ==============================================================================
-- Skrip Pemeliharaan Operasional (OPERATIONAL MAINTENANCE):
-- repair_1000_assets_phase5_structure_and_permissions.sql
--
-- Kemampuan Sebenarnya:
-- 1. Pemeriksaan Struktur: Memastikan tabel `asset_activation_snapshots` memiliki
--    kolom `location_id` dan `location_recorded` tanpa menghapus/mengubah data.
-- 2. Perbaikan Indeks: Memastikan indeks pencarian performa snapshot terpasang.
-- 3. Perbaikan Izin Akses (Permissions Guard):
--    - Mencabut izin pemanggilan fungsi helper internal `get_expense_effective_allocated_cost`
--      dari PUBLIC, anon, dan authenticated (hanya diakses oleh trigger internal).
--    - Menyegarkan izin eksekusi RPC publik resmi (activate_asset, revise_component_parameters,
--      get_period_financial_report).
-- 4. Notifikasi penyegaran cache skema PostgREST.
--
-- BATASAN:
-- Skrip ini BUKAN pemulihan seluruh fungsi aplikasi secara menyeluruh dan BUKAN
-- pengganti migrasi database, melainkan skrip terfokus untuk perbaikan struktur kolom,
-- indeks, dan izin akses database secara aman (non-destruktif).
--
-- Atomisitas: Seluruh pernyataan dibungkus dalam blok transaksi tunggal (BEGIN ... COMMIT).
-- Jika terjadi kesalahan atau dibatalkan, seluruh mutasi dibatalkan secara otomatis (ROLLBACK).
-- ==============================================================================

BEGIN;

-- 1. Pemeriksaan Struktur Kolom Tabel asset_activation_snapshots
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'asset_activation_snapshots' 
      AND column_name = 'location_id'
  ) THEN
    ALTER TABLE public.asset_activation_snapshots
      ADD COLUMN location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'asset_activation_snapshots' 
      AND column_name = 'location_recorded'
  ) THEN
    ALTER TABLE public.asset_activation_snapshots
      ADD COLUMN location_recorded boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 2. Perbaikan & Pemastian Indeks Snapshot
CREATE INDEX IF NOT EXISTS idx_snapshots_location
  ON public.asset_activation_snapshots (location_id);

CREATE INDEX IF NOT EXISTS idx_snapshots_org_asset_ver
  ON public.asset_activation_snapshots (org_id, asset_id, version DESC);

-- 3. Perbaikan Izin: Cabut Izin Helper Internal dari Publik/Eksternal
REVOKE EXECUTE ON FUNCTION public.get_expense_effective_allocated_cost(uuid, uuid) FROM public, anon, authenticated;

-- 4. Perbaikan Izin: Pastikan Izin Eksekusi RPC Publik Resmi Aktif
GRANT EXECUTE ON FUNCTION public.activate_asset(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revise_component_parameters(uuid, numeric, numeric, int, date, numeric, text, text, text, uuid, numeric, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_period_financial_report(uuid, text, uuid) TO anon, authenticated;

-- 5. Beri sinyal penyegaran skema PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
