
DO $$ BEGIN
  CREATE TYPE public.approval_status AS ENUM (
    'digitacao','pendente','pendente_verificacao','verificado','rejeitado_verificacao',
    'pendente_aprovacao','aprovado','rejeitado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.drive_folder_cache (
  path text PRIMARY KEY,
  folder_id text NOT NULL,
  parent_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.drive_folder_cache TO service_role;
ALTER TABLE public.drive_folder_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view drive folder cache" ON public.drive_folder_cache;
CREATE POLICY "Admins can view drive folder cache"
  ON public.drive_folder_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.drive_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id text NOT NULL,
  rev integer,
  kind text NOT NULL,
  status text NOT NULL,
  error text,
  file_id text,
  folder_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drive_sync_log_scope_idx ON public.drive_sync_log (scope_id, created_at DESC);
GRANT ALL ON public.drive_sync_log TO service_role;
ALTER TABLE public.drive_sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view drive sync log" ON public.drive_sync_log;
CREATE POLICY "Admins can view drive sync log"
  ON public.drive_sync_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.lab_index (
  scope_id text PRIMARY KEY,
  os_numero text,
  os_cliente text,
  amostra_code text,
  ensaio_tipo text,
  ensaio_nome text,
  workflow_status text NOT NULL DEFAULT 'digitacao',
  updated_at timestamptz NOT NULL DEFAULT now(),
  extra jsonb
);
CREATE INDEX IF NOT EXISTS lab_index_workflow_status_idx ON public.lab_index (workflow_status);
GRANT SELECT ON public.lab_index TO authenticated;
GRANT ALL ON public.lab_index TO service_role;
ALTER TABLE public.lab_index ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth read lab index" ON public.lab_index;
CREATE POLICY "Auth read lab index"
  ON public.lab_index FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.report_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id text NOT NULL,
  rev integer NOT NULL,
  status public.approval_status NOT NULL DEFAULT 'pendente_verificacao',
  requested_by uuid NOT NULL,
  requested_by_name text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  comment text,
  filename text,
  verified_by uuid,
  verified_by_name text,
  verified_at timestamptz,
  verification_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_id, rev)
);
CREATE INDEX IF NOT EXISTS report_approvals_scope_idx ON public.report_approvals (scope_id, rev DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_approvals TO authenticated;
GRANT ALL ON public.report_approvals TO service_role;
ALTER TABLE public.report_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read approvals" ON public.report_approvals;
CREATE POLICY "auth read approvals" ON public.report_approvals
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth request approval" ON public.report_approvals;
CREATE POLICY "auth request approval" ON public.report_approvals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = requested_by);

DROP POLICY IF EXISTS "verificador or admin update approval" ON public.report_approvals;
CREATE POLICY "verificador or admin update approval" ON public.report_approvals
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'verificador') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'verificador') OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "admin delete approval" ON public.report_approvals;
CREATE POLICY "admin delete approval" ON public.report_approvals
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS report_approvals_touch ON public.report_approvals;
CREATE TRIGGER report_approvals_touch
  BEFORE UPDATE ON public.report_approvals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.report_approval_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id text NOT NULL,
  rev integer NOT NULL,
  action text NOT NULL,
  comment text,
  author_id uuid NOT NULL,
  author_name text,
  author_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_approval_comments_scope_rev_idx
  ON public.report_approval_comments (scope_id, rev, created_at);
GRANT SELECT, INSERT ON public.report_approval_comments TO authenticated;
GRANT ALL ON public.report_approval_comments TO service_role;
ALTER TABLE public.report_approval_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read comments" ON public.report_approval_comments;
CREATE POLICY "auth read comments" ON public.report_approval_comments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth insert own comments" ON public.report_approval_comments;
CREATE POLICY "auth insert own comments" ON public.report_approval_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "verif or admin update comments" ON public.report_approval_comments;
CREATE POLICY "verif or admin update comments" ON public.report_approval_comments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'verificador') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'verificador') OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "verif or admin delete comments" ON public.report_approval_comments;
CREATE POLICY "verif or admin delete comments" ON public.report_approval_comments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'verificador') OR public.has_role(auth.uid(),'admin'));
