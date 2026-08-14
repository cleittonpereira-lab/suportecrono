ALTER TABLE public.lab_pendencias_digitacao
  ADD COLUMN IF NOT EXISTS payload jsonb;

COMMENT ON COLUMN public.lab_pendencias_digitacao.payload IS
  'Dados brutos coletados na digitalização (ex.: M.ESP.A determinações). Usado para pré-preencher o relatório.';