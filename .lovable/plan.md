# Plano — Integração final do módulo Relatório

Confirmado com você:
1. Tabelas novas com prefixo `lab_`.
2. Sub-aba "Usuários" do Relatório removida — administração continua só em `/admin/usuarios`, mas ganha uma coluna extra de **papel no Relatório**.
3. Google Drive fica desligado por enquanto. Em vez disso, faremos a ponte **Gantt → Relatório (Pendente de digitação)**.

---

## 1. Banco de dados (migration única)

Renomear/criar tabelas do módulo com prefixo `lab_`:
- `lab_index` (já existe com esse nome — manter)
- `lab_report_approvals` (renomear a partir de `report_approvals`)
- `lab_report_approval_comments` (renomear a partir de `report_approval_comments`)

Novo enum e coluna para papel no Relatório:
- `CREATE TYPE public.lab_report_role AS ENUM ('aprovador','verificador','digitador','nenhum');`
- Adicionar `profiles.lab_report_role lab_report_role NOT NULL DEFAULT 'nenhum'`.
- Adicionar `profiles.titulo TEXT` (para exibir "Engº Geotécnico Cleitton Pereira" etc).

Seed do Cleitton:
- `UPDATE profiles SET titulo = 'Engº Geotécnico Cleitton Pereira', lab_report_role = 'aprovador' WHERE email = 'cleitton.pereira@suportesolos.com.br';`

Nova tabela para a ponte Gantt → Digitação:
- `lab_pendencias_digitacao` (id, os, amostra, ensaio, tipo_ensaio, equipamento, data_conclusao, operador_user_id, status ['pendente','em_digitacao','digitado','verificado','aprovado'], programacao_id FK, created_at, updated_at)
- Grants para `authenticated` + `service_role`, RLS ligado, políticas usando `has_role`/`lab_report_role`.

Ajustar todas as policies existentes que referenciavam `report_approvals` / `report_approval_comments` para os novos nomes.

## 2. Papéis de Relatório na gestão de usuários

Em `/admin/usuarios`:
- Nova coluna **Papel no Relatório** (Select: Aprovador / Verificador / Digitador / Nenhum) — só admin edita.
- Nova coluna **Título** (input livre) — só admin edita. Exibida no cabeçalho de PDFs quando a pessoa é aprovadora/verificadora.
- Atualizar `src/lib/lab-adminUsers.functions.ts` e a tela de admin para gravar/ler os dois campos.

Remover a sub-aba **Usuários** de `/relatorio/*` e seus arquivos.

## 3. Ponte Gantt → Relatório

Ao concluir um ensaio no Gantt / Kanban / Leitor QR:
- Além de mover para "Concluídos", inserir uma linha em `lab_pendencias_digitacao` (status `pendente`) via server fn `criarPendenciaDigitacao`.
- Se já existir pendência para aquela combinação `os+amostra+ensaio`, não duplicar.

Nova sub-aba **Relatório → Pendente de Digitação**:
- Lista todas as pendências (filtro por OS, tipo de ensaio, operador, data).
- Digitador abre a linha → vai para o formulário do ensaio correspondente (Adensamento, Triaxial CID, etc.) já pré-preenchido com OS/Amostra.
- Ao salvar o laudo, muda status para `digitado`; verificador muda para `verificado`; aprovador para `aprovado`.

Sub-abas finais do Relatório:
- Visão Geral
- **Pendente de Digitação** (novo)
- OS / Amostras
- Adensamento
- Triaxial CID
- Emissões

## 4. Google Drive

Desligado. Deixaremos a `drive_sync_log` intacta e o botão de sync escondido atrás de flag `VITE_ENABLE_DRIVE_SYNC=false`. Quando você quiser ativar depois, é só me pedir + fornecer credencial via connector.

---

## Detalhes técnicos

- Migrations: uma migration única com `ALTER TABLE ... RENAME`, criação de enum/tabela nova, colunas em `profiles`, seed do Cleitton, e ajuste das policies.
- Após a migration os tipos gerados serão atualizados; os arquivos `src/features/lab/**` e `src/lib/lab-*.functions.ts` que referenciam `report_approvals` serão trocados para `lab_report_approvals` (busca e substituição).
- A ponte usa `createServerFn` com `requireSupabaseAuth`; a chamada é disparada dentro do `concluirEnsaio` já existente no Gantt.
- Permissões da nova aba "Pendente de Digitação" ficam em `tab-permissions.ts` com key `relatorio.pendente-digitacao`.

Se aprovar, começo pela migration.