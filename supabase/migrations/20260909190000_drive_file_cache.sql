-- Mapa duravel de (pasta, nome) -> fileId do Google Drive.
--
-- O Drive permite varios arquivos com o mesmo nome na mesma pasta, e a busca
-- por nome dele e eventualmente consistente: um arquivo criado ha segundos
-- ainda pode nao aparecer. O cache em memoria de `driveStorage` resolve isso
-- dentro de UMA isolate do Worker, mas o Cloudflare distribui as requisicoes
-- entre varias. Na pratica: a isolate A criava o arquivo, o proximo autosave
-- caia na isolate B com cache vazio, a busca por nome ainda nao enxergava o
-- arquivo de A, e B criava um segundo. As duas passavam a escrever cada uma
-- no seu arquivo (split-brain) e o trabalho digitado numa delas se perdia.
--
-- O Postgres e fortemente consistente, entao serve de ponto de encontro entre
-- isolates: quem cria grava o id aqui, quem for escrever depois encontra.
CREATE TABLE IF NOT EXISTS public.drive_file_cache (
  -- "<parentId>/<nome do arquivo>"
  key text PRIMARY KEY,
  file_id text NOT NULL,
  parent_id text NOT NULL,
  name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drive_file_cache_parent_idx
  ON public.drive_file_cache (parent_id, name);

GRANT ALL ON public.drive_file_cache TO service_role;
ALTER TABLE public.drive_file_cache ENABLE ROW LEVEL SECURITY;

-- Mesma politica do drive_folder_cache: so o service_role escreve; admin le.
DROP POLICY IF EXISTS "Admins can view drive file cache" ON public.drive_file_cache;
CREATE POLICY "Admins can view drive file cache"
  ON public.drive_file_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
