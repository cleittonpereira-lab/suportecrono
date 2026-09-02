# Mensagem para colar no Antigravity

Copie e cole o texto abaixo (incluindo o SQL) para o Antigravity:

---

Preciso que você rode uma migração SQL no banco Supabase deste projeto (SuporteCrono). Ela cria 3 tabelas novas (`lab_os`, `lab_amostras`, `lab_ensaios`) que vão substituir o arquivo único `_lab-state.json` que hoje guarda todo o estado do laboratório — isso está causando perda de dados quando duas pessoas trabalham ao mesmo tempo em OS/amostras diferentes, porque cada salvamento sobrescreve o estado inteiro.

O código da aplicação que usa essas tabelas já foi commitado e enviado (branch `main`, a partir do commit `cb479b6`). Só falta criar as tabelas no banco. Rode este SQL no SQL Editor do Supabase:

```sql
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
```

Esse mesmo SQL já está salvo no repositório em `supabase/migrations/20260825010000_lab_os_amostras_ensaios_tabelas.sql`, então se você tiver um fluxo de "aplicar migrations pendentes" pode usar esse arquivo diretamente em vez de colar o SQL manualmente.

Depois de rodar, não precisa fazer mais nada — a migração dos dados que já existem (das OS/amostras/ensaios atuais) para essas tabelas novas eu (Claude) já vou rodar assim que confirmarem que as tabelas foram criadas.

---
