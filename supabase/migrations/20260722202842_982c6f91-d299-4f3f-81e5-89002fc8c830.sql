
-- 1. Rename report tables to lab_ prefix
ALTER TABLE public.report_approvals RENAME TO lab_report_approvals;
ALTER TABLE public.report_approval_comments RENAME TO lab_report_approval_comments;

-- 2. New enum for report role
CREATE TYPE public.lab_report_role AS ENUM ('aprovador','verificador','digitador','nenhum');

-- 3. Extend profiles with lab_report_role and titulo
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lab_report_role public.lab_report_role NOT NULL DEFAULT 'nenhum',
  ADD COLUMN IF NOT EXISTS titulo text;

-- 4. Seed Cleitton
UPDATE public.profiles
SET titulo = 'Engº Geotécnico Cleitton Pereira',
    lab_report_role = 'aprovador'
WHERE lower(email) = 'cleitton.pereira@suportesolos.com.br';

-- 5. Protect lab_report_role from non-admin edits (like cargo)
CREATE OR REPLACE FUNCTION public.tg_profiles_protect_lab_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lab_report_role IS DISTINCT FROM OLD.lab_report_role AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.lab_report_role := OLD.lab_report_role;
  END IF;
  IF NEW.titulo IS DISTINCT FROM OLD.titulo AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.titulo := OLD.titulo;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_protect_lab_role ON public.profiles;
CREATE TRIGGER profiles_protect_lab_role
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_protect_lab_role();

-- 6. New table: lab_pendencias_digitacao (Gantt -> Digitação bridge)
CREATE TABLE public.lab_pendencias_digitacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  os text NOT NULL,
  amostra text,
  ensaio text NOT NULL,
  tipo_ensaio text,
  equipamento text,
  data_conclusao timestamptz NOT NULL DEFAULT now(),
  operador_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  programacao_id uuid,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','em_digitacao','digitado','verificado','aprovado')),
  digitador_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verificador_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovador_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (os, amostra, ensaio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_pendencias_digitacao TO authenticated;
GRANT ALL ON public.lab_pendencias_digitacao TO service_role;

ALTER TABLE public.lab_pendencias_digitacao ENABLE ROW LEVEL SECURITY;

-- All authenticated users can see all pendencies (lab workflow)
CREATE POLICY "auth read lab_pendencias" ON public.lab_pendencias_digitacao
  FOR SELECT TO authenticated USING (true);

-- Any authenticated user can insert (created by conclusion of ensaio)
CREATE POLICY "auth insert lab_pendencias" ON public.lab_pendencias_digitacao
  FOR INSERT TO authenticated WITH CHECK (true);

-- Any authenticated user can update (workflow transitions handled in app)
CREATE POLICY "auth update lab_pendencias" ON public.lab_pendencias_digitacao
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Only admin can delete
CREATE POLICY "admin delete lab_pendencias" ON public.lab_pendencias_digitacao
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER lab_pendencias_touch_updated
BEFORE UPDATE ON public.lab_pendencias_digitacao
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX lab_pendencias_status_idx ON public.lab_pendencias_digitacao(status);
CREATE INDEX lab_pendencias_os_idx ON public.lab_pendencias_digitacao(os);
