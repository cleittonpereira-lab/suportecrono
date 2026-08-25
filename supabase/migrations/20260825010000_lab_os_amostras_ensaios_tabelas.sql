-- Substitui o "_lab-state.json" (um único arquivo com TODO o estado do
-- laboratório, sobrescrito por inteiro a cada mudança) por três tabelas
-- relacionais: cada OS, amostra e ensaio é sua própria linha. Isso elimina
-- a colisão de escrita entre usuários diferentes trabalhando em
-- OS/amostras/ensaios diferentes ao mesmo tempo.
--
-- Os IDs são mantidos como TEXT (não UUID) porque já existem no sistema
-- (gerados no cliente como "os_xxx", "am_xxx", "en_xxx") e são referenciados
-- por scope_id em lab_index/report_approvals — preservar o mesmo formato
-- evita quebrar vínculos já existentes.

CREATE TABLE IF NOT EXISTS public.lab_os (
  id text PRIMARY KEY,
  numero text NOT NULL,
  client text,
  work_number text,
  local text,
  operator text,
  technical_resp text,
  revision text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_os_numero_idx ON public.lab_os (numero);

CREATE TABLE IF NOT EXISTS public.lab_amostras (
  id text PRIMARY KEY,
  os_id text NOT NULL REFERENCES public.lab_os(id) ON DELETE CASCADE,
  report_number text,
  borehole text,
  depth text,
  description text,
  granulometric_description text,
  code text,
  sample_type text,
  material_type text,
  coords jsonb,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_amostras_os_id_idx ON public.lab_amostras (os_id);
CREATE INDEX IF NOT EXISTS lab_amostras_code_idx ON public.lab_amostras (code);

CREATE TABLE IF NOT EXISTS public.lab_ensaios (
  id text PRIMARY KEY,
  amostra_id text NOT NULL REFERENCES public.lab_amostras(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  status text,
  label text,
  nome text,
  sigla text,
  operator text,
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Espelha Ensaio.payload por compatibilidade com o labStore existente.
  -- A fonte de verdade "oficial" do rascunho digitado continua sendo
  -- lab_index.extra (com optimistic locking via rev) — este campo aqui é
  -- best-effort, preenchido pelo mesmo ctx.onPayloadChange que já existia.
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_ensaios_amostra_id_idx ON public.lab_ensaios (amostra_id);
CREATE INDEX IF NOT EXISTS lab_ensaios_tipo_idx ON public.lab_ensaios (tipo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_os TO authenticated;
GRANT ALL ON public.lab_os TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_amostras TO authenticated;
GRANT ALL ON public.lab_amostras TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_ensaios TO authenticated;
GRANT ALL ON public.lab_ensaios TO service_role;

ALTER TABLE public.lab_os ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_amostras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_ensaios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read/write lab_os" ON public.lab_os;
CREATE POLICY "Auth read/write lab_os"
  ON public.lab_os FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Auth read/write lab_amostras" ON public.lab_amostras;
CREATE POLICY "Auth read/write lab_amostras"
  ON public.lab_amostras FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Auth read/write lab_ensaios" ON public.lab_ensaios;
CREATE POLICY "Auth read/write lab_ensaios"
  ON public.lab_ensaios FOR ALL TO authenticated USING (true) WITH CHECK (true);
