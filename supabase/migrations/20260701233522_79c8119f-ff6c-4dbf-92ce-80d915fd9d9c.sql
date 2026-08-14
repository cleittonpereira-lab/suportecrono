
-- Enums
CREATE TYPE public.equipamento_situacao AS ENUM ('disponivel','manutencao','interditado','inativo');
CREATE TYPE public.ensaio_status AS ENUM ('recebido','aguardando_programacao','programado','em_preparacao','em_execucao','pausado','aguardando_leitura','finalizado','conferencia','liberado','entregue','cancelado');
CREATE TYPE public.prioridade AS ENUM ('baixa','normal','alta','urgente');
CREATE TYPE public.programacao_status AS ENUM ('nao_programado','programado','em_execucao','finalizado','atrasado','cancelado');

-- Timestamp trigger fn
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Equipamentos
CREATE TABLE public.equipamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  codigo TEXT UNIQUE,
  tipo TEXT,
  descricao TEXT,
  fabricante TEXT,
  modelo TEXT,
  numero_serie TEXT,
  laboratorio TEXT,
  situacao public.equipamento_situacao NOT NULL DEFAULT 'disponivel',
  capacidade INT,
  tempo_medio_min INT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipamentos TO anon, authenticated;
GRANT ALL ON public.equipamentos TO service_role;
ALTER TABLE public.equipamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipamentos_all" ON public.equipamentos FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER equipamentos_updated_at BEFORE UPDATE ON public.equipamentos FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Tipos de Ensaio
CREATE TABLE public.tipos_ensaio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  codigo TEXT UNIQUE,
  equipamento_padrao_id UUID REFERENCES public.equipamentos(id) ON DELETE SET NULL,
  tempo_medio_min INT,
  tempo_min_min INT,
  tempo_max_min INT,
  tempo_preparacao_min INT DEFAULT 0,
  tempo_desmontagem_min INT DEFAULT 0,
  permite_paralelo BOOLEAN NOT NULL DEFAULT false,
  cor_gantt TEXT DEFAULT '#F0B43C',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_ensaio TO anon, authenticated;
GRANT ALL ON public.tipos_ensaio TO service_role;
ALTER TABLE public.tipos_ensaio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tipos_ensaio_all" ON public.tipos_ensaio FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER tipos_ensaio_updated_at BEFORE UPDATE ON public.tipos_ensaio FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Dependências
CREATE TABLE public.tipos_ensaio_dependencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predecessor_id UUID NOT NULL REFERENCES public.tipos_ensaio(id) ON DELETE CASCADE,
  sucessor_id UUID NOT NULL REFERENCES public.tipos_ensaio(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(predecessor_id, sucessor_id),
  CHECK (predecessor_id <> sucessor_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tipos_ensaio_dependencias TO anon, authenticated;
GRANT ALL ON public.tipos_ensaio_dependencias TO service_role;
ALTER TABLE public.tipos_ensaio_dependencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tipos_ensaio_dep_all" ON public.tipos_ensaio_dependencias FOR ALL USING (true) WITH CHECK (true);

-- Amostras
CREATE TABLE public.amostras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  os_numero TEXT NOT NULL,
  codigo TEXT,
  identificacao TEXT,
  profundidade TEXT,
  material TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.amostras(os_numero);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.amostras TO anon, authenticated;
GRANT ALL ON public.amostras TO service_role;
ALTER TABLE public.amostras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amostras_all" ON public.amostras FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER amostras_updated_at BEFORE UPDATE ON public.amostras FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Ensaios
CREATE TABLE public.ensaios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amostra_id UUID NOT NULL REFERENCES public.amostras(id) ON DELETE CASCADE,
  tipo_ensaio_id UUID NOT NULL REFERENCES public.tipos_ensaio(id) ON DELETE RESTRICT,
  equipamento_id UUID REFERENCES public.equipamentos(id) ON DELETE SET NULL,
  tecnico TEXT,
  corpo_prova TEXT,
  status public.ensaio_status NOT NULL DEFAULT 'aguardando_programacao',
  prioridade public.prioridade NOT NULL DEFAULT 'normal',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ensaios(amostra_id);
CREATE INDEX ON public.ensaios(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ensaios TO anon, authenticated;
GRANT ALL ON public.ensaios TO service_role;
ALTER TABLE public.ensaios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ensaios_all" ON public.ensaios FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER ensaios_updated_at BEFORE UPDATE ON public.ensaios FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Programações
CREATE TABLE public.programacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ensaio_id UUID NOT NULL REFERENCES public.ensaios(id) ON DELETE CASCADE,
  equipamento_id UUID REFERENCES public.equipamentos(id) ON DELETE SET NULL,
  inicio TIMESTAMPTZ NOT NULL,
  fim TIMESTAMPTZ NOT NULL,
  status public.programacao_status NOT NULL DEFAULT 'programado',
  ordem INT DEFAULT 0,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fim > inicio)
);
CREATE INDEX ON public.programacoes(equipamento_id, inicio);
CREATE INDEX ON public.programacoes(ensaio_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programacoes TO anon, authenticated;
GRANT ALL ON public.programacoes TO service_role;
ALTER TABLE public.programacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "programacoes_all" ON public.programacoes FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER programacoes_updated_at BEFORE UPDATE ON public.programacoes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Histórico
CREATE TABLE public.programacao_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programacao_id UUID REFERENCES public.programacoes(id) ON DELETE CASCADE,
  ensaio_id UUID REFERENCES public.ensaios(id) ON DELETE CASCADE,
  autor TEXT,
  acao TEXT NOT NULL,
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.programacao_historico TO anon, authenticated;
GRANT ALL ON public.programacao_historico TO service_role;
ALTER TABLE public.programacao_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prog_hist_all" ON public.programacao_historico FOR ALL USING (true) WITH CHECK (true);
