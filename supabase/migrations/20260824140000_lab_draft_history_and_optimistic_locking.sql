-- Migration: Add rev to lab_index and create lab_draft_history
-- 1. Add optimistic locking rev to lab_index if not exists
ALTER TABLE public.lab_index ADD COLUMN IF NOT EXISTS rev integer NOT NULL DEFAULT 1;

-- 2. Create audit history table for draft modifications
CREATE TABLE IF NOT EXISTS public.lab_draft_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id text NOT NULL REFERENCES public.lab_index(scope_id) ON DELETE CASCADE,
  rev integer NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  diff jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS lab_draft_history_scope_idx ON public.lab_draft_history (scope_id, changed_at DESC);
GRANT SELECT, INSERT ON public.lab_draft_history TO authenticated;
GRANT ALL ON public.lab_draft_history TO service_role;
ALTER TABLE public.lab_draft_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read draft history" ON public.lab_draft_history;
CREATE POLICY "auth read draft history" ON public.lab_draft_history FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth insert draft history" ON public.lab_draft_history;
CREATE POLICY "auth insert draft history" ON public.lab_draft_history FOR INSERT TO authenticated WITH CHECK (true);
