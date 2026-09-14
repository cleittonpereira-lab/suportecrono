-- Documentos do app no Cloudflare D1: o que antes era um arquivo JSON no Google
-- Drive vira um registro, com a mesma chave de antes (pasta + nome do arquivo).
--
-- `rev` sobe a cada gravação e é a trava entre gravações simultâneas vindas de
-- servidores diferentes: `UPDATE ... WHERE rev = ?` só vence uma vez. No Drive
-- não havia trava nenhuma — a última gravação apagava a outra.
CREATE TABLE IF NOT EXISTS documentos (
  pasta TEXT NOT NULL,
  nome TEXT NOT NULL,
  dados TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  atualizado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (pasta, nome)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS documentos_por_pasta_e_data ON documentos (pasta, atualizado_em);
