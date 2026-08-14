
CREATE TABLE public.lab_capsulas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero TEXT NOT NULL,
  os TEXT,
  amostra TEXT,
  tipo_ensaio TEXT,
  ensaio_codigo TEXT,
  determinacao TEXT,
  peso_inicial NUMERIC,
  peso_tara NUMERIC,
  peso_final NUMERIC,
  data_inicial TIMESTAMPTZ,
  data_tara TIMESTAMPTZ,
  data_final TIMESTAMPTZ,
  operador_inicial_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  operador_inicial_nome TEXT,
  operador_final_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  operador_final_nome TEXT,
  pendencia_id UUID REFERENCES public.lab_pendencias_digitacao(id) ON DELETE SET NULL,
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_capsulas TO authenticated;
GRANT ALL ON public.lab_capsulas TO service_role;

ALTER TABLE public.lab_capsulas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem cápsulas" ON public.lab_capsulas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados criam cápsulas" ON public.lab_capsulas
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Autenticados atualizam cápsulas" ON public.lab_capsulas
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Autenticados removem cápsulas" ON public.lab_capsulas
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE INDEX lab_capsulas_numero_idx ON public.lab_capsulas (numero);
CREATE INDEX lab_capsulas_pending_final_idx ON public.lab_capsulas (numero) WHERE peso_final IS NULL;
CREATE INDEX lab_capsulas_os_amostra_idx ON public.lab_capsulas (os, amostra);

CREATE TRIGGER lab_capsulas_touch
  BEFORE UPDATE ON public.lab_capsulas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
