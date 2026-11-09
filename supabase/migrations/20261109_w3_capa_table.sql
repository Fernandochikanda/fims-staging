-- ============================================================================
-- W3: CAPA (Corrective Action Preventive Action) tracking table
-- ============================================================================
-- Creates fims_capa to track corrective actions for critical defects
-- (inspection items scored 1-2). Replaces the ad-hoc audit log + chat
-- notification that had no tracking, no closure, no evidence.
--
-- Run this in: Supabase SQL Editor (both Production + Test projects)
-- ============================================================================

-- ─── Table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fims_capa (
  id                  TEXT PRIMARY KEY,
  inspection_id       TEXT NOT NULL,
  item_id             TEXT NOT NULL,
  item_label          TEXT,
  section_id          TEXT,
  section_name        TEXT,
  location_name       TEXT,
  location_id         TEXT,
  assigned_to         TEXT,          -- user_id ('usr_*') of responsible inspector
  assigned_name       TEXT,
  due_at              TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'in_progress', 'closed', 'overdue', 'cancelled')),
  evidence_photo_path TEXT,          -- Supabase Storage path (optional)
  evidence_note       TEXT,
  closed_at           TIMESTAMPTZ,
  closed_by           TEXT,          -- user_id who closed
  closed_by_name      TEXT,
  closure_note        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fims_capa_inspection ON public.fims_capa (inspection_id);
CREATE INDEX IF NOT EXISTS idx_fims_capa_assigned   ON public.fims_capa (assigned_to);
CREATE INDEX IF NOT EXISTS idx_fims_capa_status     ON public.fims_capa (status);
CREATE INDEX IF NOT EXISTS idx_fims_capa_due        ON public.fims_capa (due_at) WHERE status IN ('open', 'in_progress');

-- ─── RLS (matches existing fims_inspections pattern) ───────────
ALTER TABLE public.fims_capa ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users (app does client-side filtering by role)
CREATE POLICY "capa_select_all" ON public.fims_capa
  FOR SELECT USING (true);

-- Insert: any authenticated user (the app generates CAPA rows on submit)
CREATE POLICY "capa_insert_all" ON public.fims_capa
  FOR INSERT WITH CHECK (true);

-- Update: any authenticated user (inspectors add evidence, supervisors close)
CREATE POLICY "capa_update_all" ON public.fims_capa
  FOR UPDATE USING (true);

-- Delete: any authenticated user (admin cleanup)
CREATE POLICY "capa_delete_all" ON public.fims_capa
  FOR DELETE USING (true);

-- ─── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fims_capa_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fims_capa_updated_at ON public.fims_capa;
CREATE TRIGGER trg_fims_capa_updated_at
  BEFORE UPDATE ON public.fims_capa
  FOR EACH ROW EXECUTE FUNCTION public.fims_capa_set_updated_at();

-- ─── Auto-mark overdue function ───────────────────────────────
-- Called by the app periodically to mark CAPAs past their due_at as overdue
CREATE OR REPLACE FUNCTION public.fims_capa_mark_overdue()
RETURNS INTEGER AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE public.fims_capa
  SET status = 'overdue'
  WHERE status IN ('open', 'in_progress')
    AND due_at < NOW();
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql;
