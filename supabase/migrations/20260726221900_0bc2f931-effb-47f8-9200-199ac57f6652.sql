
-- Normaliza amostra vazia para NULL
UPDATE public.lab_pendencias_digitacao SET amostra = NULL WHERE amostra IS NOT NULL AND btrim(amostra) = '';

-- Remove duplicatas mantendo a linha mais antiga por (os, coalesce(amostra,''), ensaio)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY os, COALESCE(amostra, ''), ensaio
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.lab_pendencias_digitacao
)
DELETE FROM public.lab_pendencias_digitacao p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

-- Índice único parcial para futuras inserções
CREATE UNIQUE INDEX IF NOT EXISTS lab_pendencias_digitacao_uniq
  ON public.lab_pendencias_digitacao (os, COALESCE(amostra, ''), ensaio);
