# Plano: Supabase como fonte principal de dados / Google Drive só para arquivos grandes

**Contexto para quem for implementar (humano ou IA/Antigravity):** este documento foi escrito após uma auditoria do código-fonte do SuporteCrono em 2026-08-24. Não presuma que o código mudou desde então sem conferir — releia os arquivos citados antes de aplicar qualquer patch, pois `line:N` pode ter deslocado.

---

## ATUALIZAÇÃO 2026-08-24 (parte 2) — bug de perda de dados no reload + sugestão de URL

**Achado crítico, corrigido (commit `0837ef9`):** ao digitar num campo (ex: cápsula), o rascunho é salvo no `localStorage` na hora, mas o envio pro Supabase é assíncrono com até ~800ms de atraso (debounce duplo: 400ms no componente + 400ms no `draftStore`). Se a página recarregasse dentro desse intervalo, a busca do rascunho no servidor (ainda desatualizada) sobrescrevia incondicionalmente a tela — apagando o que tinha acabado de ser digitado, mesmo sem nenhum conflito real de outro usuário/computador. Corrigido guardando a `rev` do servidor junto com o rascunho local, e só deixando o servidor sobrescrever a tela quando a rev dele for realmente mais nova. Aplicado em Cisalhamento Direto, Triaxial CID e Adensamento (`src/features/*/draftStore.ts`).

**Sugestão do usuário, ainda não implementada:** URLs com um código único e rastreável por relatório, em vez dos IDs internos atuais. É uma boa ideia de UX/rastreabilidade, mas é uma mudança de escopo maior (afeta roteamento e possivelmente como links são compartilhados/impressos) — vale tratar como um item separado depois que a base de sincronização estiver 100% estável, não em cima da correção de bugs urgentes.

**Importante:** o usuário testou o site **publicado (Vercel)** e ainda viu o bug antigo do CD.IN/CD.NAT — isso é esperado, pois os commits de hoje só existem no GitHub até a Vercel fazer um novo deploy. Ainda não confirmamos se o deploy está desbloqueado (havia um deploy travado relatado no início da sessão). Antes de testar qualquer correção de hoje, confirmar que o deploy mais recente na Vercel corresponde ao commit `0837ef9` (ou mais novo).

---

## ATUALIZAÇÃO 2026-08-24 (parte 1) (pós-implementação parcial pelo Antigravity, commit `7527b77`)

O commit `7527b77 feat(arch): migracao para Supabase como fonte principal e Drive para arquivos grandes` já implementou boa parte das Fases 2, 3, 4 e 7 abaixo (rascunhos e aprovações migrados para o Supabase com `rev`, `_approvals-index.json` eliminado, chave da Service Account removida do código, `getWorkflowStatuses` duplicado unificado numa função só). **Isso já é uma melhoria real e deve ser mantido**, não revertido.

Porém uma segunda auditoria (pós-commit) encontrou a causa raiz do sintoma "cada tela/usuário mostra uma informação diferente para o mesmo relatório", que **não foi tocada por esse commit** — são 3 problemas novos/remanescentes, detalhados abaixo em ordem de prioridade. Trate isso como as próximas fases a implementar, complementando (não substituindo) o restante deste documento.

### Fase 1.5 — ✅ IMPLEMENTADA em 2026-08-24 — unificar o formato de `scopeId` entre todas as telas
Hoje existem pelo menos 2 formatos de `scopeId` (a "chave" usada pra gravar/ler status em `lab_index`/`report_approvals`) para o **mesmo ensaio**, dependendo de qual tela grava:
- Formato A — `os/{os.id}/amostra/{amostra.id}/ensaio/{ensaio.id}`, usado por:
  - `src/routes/_app.relatorio.cisalhamento-direto.tsx:197-199`
  - `src/routes/_app.relatorio.triaxial-cid.tsx:214-217`
  - `src/features/mesp-natural/editor.tsx:169-171`
- Formato B — `{ensaio.id}` puro (sem prefixo), usado por:
  - `src/routes/_app.relatorio.adensamento.tsx:384` (quando `ctx.ensaio.id` existe)
  - `src/routes/_app.relatorio.os.$osId.amostra.$amostraId.index.tsx:37` (a tela da Amostra, que lista o farol de todos os ensaios)

Como são strings diferentes para o mesmo ensaio, a tela da Amostra **nunca encontra** o registro que o editor de Cisalhamento Direto/Triaxial CID/MESP-A gravou — cai no valor default `"digitacao"` (`approvals.functions.ts:601-603`) ou num `catch` silencioso.

**Correção:** escolher UM formato canônico (recomendo o Formato A, mais descritivo e já usado pela maioria) e:
1. Criar uma função utilitária única `buildScopeId(osId, amostraId, ensaioId)` em algum lugar compartilhado (ex: `src/lib/scope.ts`), usada por TODAS as telas — nenhuma tela deve montar a string na mão de novo.
2. Ajustar `_app.relatorio.adensamento.tsx:384` e `_app.relatorio.os.$osId.amostra.$amostraId.index.tsx:37` para usar essa função com os IDs completos (`os.id`, `amostra.id`, `ensaio.id`), não o `ensaio.id` puro.
3. Escrever uma migração de dados: para linhas existentes em `lab_index`/`report_approvals` cujo `scope_id` está no Formato B, recalcular e mover para o Formato A (juntando com `os_numero`/`amostra_code` já presentes na própria linha de `lab_index`, que tem essas colunas).
4. **Teste de aceite:** abrir o mesmo ensaio (de cada um dos 4 tipos: adensamento, triaxial, cisalhamento direto, MESP-A) simultaneamente no editor e na tela da Amostra, mudar o status num, confirmar que o outro reflete a mudança após o próximo refresh/refetch — sem precisar saber "de qual tela" o status foi setado.

**O que foi feito (passos 1 e 2 acima):**
- Criado `src/lib/scope.ts` com `buildScopeId(osId, amostraId, ensaioId)` — função única compartilhada.
- `_app.relatorio.cisalhamento-direto.tsx`, `_app.relatorio.triaxial-cid.tsx`, `features/mesp-natural/editor.tsx`: passaram a usar `buildScopeId(...)` em vez de montar a string na mão (já usavam o Formato A, só padronizado).
- `_app.relatorio.adensamento.tsx`: agora usa `buildScopeId(ctx.os.id, ctx.amostra.id, ctx.ensaio.id)` quando o contexto completo está disponível (antes usava `ctx.ensaio.id` puro — Formato B).
- `_app.relatorio.os.$osId.amostra.$amostraId.index.tsx` (tela da Amostra): a busca de status (`getWorkflowStatuses`) e a leitura do farol por ensaio agora usam `buildScopeId(osId, amostraId, e.id)` em vez de `e.id` puro.
- `npx tsc --noEmit` rodou limpo (0 erros) após as mudanças. Testado no dev server local — sem novos erros de console relacionados.

**O que NÃO foi feito ainda (passo 3, pendente):** a migração dos dados já existentes em `lab_index`/`report_approvals` que foram gravados no Formato B antigo (scope_id = id puro do ensaio) antes desta correção. Essas linhas antigas ficam "órfãs" — não serão encontradas pelo novo formato. Na prática, ensaios que já estavam em digitação quando essa correção foi aplicada podem precisar que alguém abra o editor de novo uma vez (o que grava um novo registro no formato correto) para "aparecerem" corretamente na tela da Amostra. Não é uma perda de dado grave, mas vale rodar uma migração de limpeza depois. A Fase 3.5 (ligar a Central de Relatórios ao mesmo pipeline) e a Fase 2.5 (corrigir o optimistic locking não-atômico do rascunho) continuam pendentes, como descrito acima.

### Fase 3.5 — ✅ IMPLEMENTADA em 2026-08-24 (via espelhamento best-effort) — Ligar a Central de Relatórios ao mesmo pipeline de status dos editores
`src/routes/_app.relatorio.pendentes.tsx` (Central de Relatórios) **não usa `getWorkflowStatuses`** — o status mostrado lá vem de uma tabela totalmente separada, `lab_pendencias_digitacao.status` (valores: `pendente/em_digitacao/digitado/verificado/aprovado/concluido_externo`), atualizada só por `atualizarStatusPendencia` em `src/lib/lab-pendencias.functions.ts`. Já o farol dos editores vem de `lab_index.workflow_status`/`report_approvals.status` (valores: `digitacao/aguardando_verificacao/aguardando_aprovacao/aprovado/rejeitado`). **Nenhuma das duas escritas atualiza a outra tabela.** Resultado: aprovar um relatório no editor não muda nada na Central, e vice-versa.

**Correção (escolher uma):**
- **Opção recomendada:** aposentar o campo `status` de `lab_pendencias_digitacao` como fonte de verdade de workflow — a Central passa a fazer `JOIN`/consulta cruzada com `lab_index` (pelo mesmo `scope_id` canônico da Fase 1.5, montado a partir de `os`/`amostra`/`ensaio` que já existem em `lab_pendencias_digitacao`) e mostra `workflow_status` de lá. `lab_pendencias_digitacao.status` continua existindo só para o estágio "pendente → em_digitacao → digitado" (que não tem equivalente em `lab_index`), mas o estágio "verificado/aprovado" passa a vir sempre de `lab_index`.
- **Alternativa mais simples de implementar:** fazer `setWorkflowStatus` (em `approvals.functions.ts`) também atualizar `lab_pendencias_digitacao.status` (mapeando os valores equivalentes) na mesma transação/chamada, e vice-versa em `atualizarStatusPendencia`. Mais rápido de fazer, mas duplica a escrita (risco de re-divergir no futuro se alguém mexer só num dos dois lados de novo).
- **Teste de aceite:** aprovar um relatório dentro do editor, confirmar que a Central de Relatórios reflete "aprovado" no próximo refresh (15s), sem precisar de nenhuma ação manual adicional.

**O que foi feito:** implementada a Opção "mais simples" (espelhamento nas duas direções), não a Opção A (JOIN por scopeId) — porque `lab_pendencias_digitacao` guarda `os`/`amostra`/`ensaio` como texto (código da OS, código da amostra, sigla do ensaio), não os IDs internos usados em `lab_index.scope_id`. Não existe hoje uma chave confiável para fazer JOIN direto entre as duas tabelas — a Opção A ficaria pra uma unificação de schema maior, fora do escopo de hoje.
- `setWorkflowStatus` (`approvals.functions.ts`) agora também atualiza `lab_pendencias_digitacao.status` (melhor esforço, por `os`+`ensaio`+`amostra` iguais) sempre que muda `lab_index.workflow_status`.
- `atualizarStatusPendencia` (`lab-pendencias.functions.ts`) agora também atualiza `lab_index.workflow_status` (melhor esforço, só quando encontra exatamente 1 registro correspondente) sempre que muda `lab_pendencias_digitacao.status`.
- Nenhum dos dois espelhamentos bloqueia a escrita principal se não encontrar correspondência (ex: relatório avulso sem pendência vinculada) — é sincronização auxiliar, não fonte de verdade.
- **Risco conhecido:** o match usa texto (os/amostra/ensaio) igual em ambos os lados. Se a sigla do ensaio for editada depois de criado (ex: alguém renomeia "CD4.IN" pra outra coisa), o vínculo entre os dois registros se perde silenciosamente — os dois pipelines voltam a divergir só para aquele ensaio específico. Isso é aceitável como correção imediata, mas reforça que a solução definitiva (Opção A com uma chave estável de verdade) ainda vale a pena no médio prazo.
- **Também corrigido nesta sessão (fora do escopo original, mas achado durante a investigação do sintoma CD.IN/CD.NAT):** `abrirPorTipo` (`_app.relatorio.pendentes.tsx`) e `abrirEnsaio` (`EnsaioListByType.tsx`) localizavam o ensaio a abrir só por `tipo`, então uma amostra com dois ensaios do mesmo tipo (ex: duas sub-variantes de Cisalhamento Direto) sempre abria o primeiro ensaio daquele tipo já existente no `labStore`, não importa em qual dos dois o usuário clicasse. Corrigido para também casar pela sigla/nome específico do ensaio. Além disso, `EditorErrorBoundary`/`Editor` em `_app.relatorio.os.$osId.amostra.$amostraId.ensaio.$ensaioId.tsx` ganhou `key={ensaio.id}` para forçar o React a recriar o editor do zero ao trocar de ensaio do mesmo tipo (antes, o componente era reaproveitado e o rascunho do ensaio anterior "grudava" na tela).

### Fase 2.5 — Corrigir o optimistic locking de `saveSharedDraft` (não é atômico hoje)
Em `src/lib/draft.functions.ts`, `saveSharedDraft` faz hoje: `SELECT rev` → compara em JavaScript (`existing.rev > expectedRev`) → `UPSERT` **sem** `WHERE rev = expectedRev`. Isso é um check-then-write (TOCTOU): dois salvamentos quase simultâneos podem passar os dois pela checagem antes de qualquer um escrever, e o segundo `UPSERT` sobrescreve o primeiro silenciosamente — a mesma classe de bug que a migração deveria ter eliminado, só que agora dentro do Supabase em vez do Drive.

**Correção:** trocar por uma escrita condicional atômica de verdade:
```ts
const { data, error } = await supabase
  .from("lab_index")
  .update({ extra: payload, rev: expectedRev + 1, updated_at: new Date().toISOString() })
  .eq("scope_id", scopeId)
  .eq("rev", expectedRev)
  .select("rev")
  .single();
// se `error` (PGRST116 - no rows) ou !data => conflito real, devolver 409 pro front
```
Isso já é exatamente o padrão que `verifyApproval`/`decideApproval` em `approvals.functions.ts` já fazem corretamente — só replicar o mesmo padrão aqui.

### Fase 5.5 — Terminar a migração de dados legados do Drive
`scripts/migrate-drive-to-supabase.ts` foi criado mas (a) não há evidência de ter sido executado, e (b) mesmo executando, só migra `workflow_status`, não migra o campo `extra` (o conteúdo digitado do rascunho, que vinha de `ensaio.json`). Precisa:
1. Completar o script para também ler `ensaio.json` de cada pasta de ensaio no Drive e fazer upsert do conteúdo em `lab_index.extra` (com `rev` inicial adequado, verificando se já não existe um rascunho mais novo no Supabase antes de sobrescrever).
2. Ajustar o script para usar o `scopeId` canônico da Fase 1.5 (senão a migração cria mais linhas com chave errada).
3. Rodar o script uma vez em produção, com backup antes.

---

## 0. Princípio acordado com o dono do sistema

- **Google Drive** guarda o que é grande e não muda depois de criado: PDFs finais de laudo (por revisão), fotos de ensaio, anexos.
- **Supabase** guarda o que é pequeno e muda com frequência por múltiplas pessoas: rascunho digitado, status/farol de workflow, pendências de digitação, histórico de aprovações.
- Isso **não tem custo adicional** — o Supabase já está integrado e sendo usado hoje como "espelho" secundário; estamos só invertendo qual lado é a fonte de verdade. O Drive continua sendo usado exatamente como já é para PDFs/fotos.

## 1. Diagnóstico resumido (por que mudar)

Hoje (commit `47c7ddc` e anteriores da "migração soberana para Drive"), cada salvamento de rascunho ou mudança de status:
1. Lê um arquivo JSON inteiro do Google Drive.
2. Modifica em memória o pedaço relevante.
3. Sobrescreve o arquivo inteiro de volta (`overwrite: true`).

Isso é feito a cada ~400ms de autosave, e a cada ação de workflow (enviar/verificar/aprovar). Sem nenhum lock ou verificação de versão antes de sobrescrever. Se duas pessoas salvam ao mesmo tempo (dois computadores, ou um digitador + um verificador), quem salva por último apaga silenciosamente o trabalho do outro — sem erro visível. O pior caso é o arquivo `_approvals-index.json`, que é **um único arquivo compartilhado por TODOS os relatórios do sistema inteiro** — qualquer duas ações de workflow simultâneas em relatórios *diferentes* competem pelo mesmo arquivo.

Arquivos-chave do problema:
- `src/lib/draft.functions.ts` — `saveSharedDraft` (rascunhos)
- `src/lib/approvals.functions.ts` — `requestApproval`, `verifyApproval`, `decideApproval`, `setWorkflowStatus`, `getMasterApprovals`/`saveMasterApprovals` (status/farol/aprovações — arquivo único no Drive)
- `src/lib/driveSync.functions.ts` — segunda implementação duplicada de `getWorkflowStatuses` (linha ~569), inconsistente com a de `approvals.functions.ts` (linha ~473)
- `src/lib/lab-pendencias.functions.ts` — pendências de digitação (double-write disco local do servidor + Supabase)
- `src/lib/chegada-amostras.functions.ts` — quadro Kanban de chegada de amostras (mesmo padrão de arquivo único no Drive, linha ~130-131)

## 2. Estado atual do schema Supabase (já existe, conferido em `supabase/migrations/`)

Boa notícia: a maior parte da estrutura relacional necessária **já existe**. Não é preciso criar um banco do zero.

```sql
-- já existe (20260722200934_...)
CREATE TABLE public.lab_index (
  scope_id text PRIMARY KEY,
  os_numero text,
  os_cliente text,
  amostra_code text,
  ensaio_tipo text,
  ensaio_nome text,
  workflow_status text NOT NULL DEFAULT 'digitacao',
  updated_at timestamptz NOT NULL DEFAULT now(),
  extra jsonb   -- aqui é onde o payload do rascunho (ensaio.json) é espelhado hoje
);

CREATE TYPE public.approval_status AS ENUM (
  'digitacao','pendente','pendente_verificacao','verificado','rejeitado_verificacao',
  'pendente_aprovacao','aprovado','rejeitado'
);

CREATE TABLE public.report_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id text NOT NULL,
  rev integer NOT NULL,          -- <-- JÁ TEM campo de revisão! usar para optimistic locking
  status public.approval_status NOT NULL DEFAULT 'pendente_verificacao',
  requested_by uuid NOT NULL,
  requested_by_name text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  comment text
  -- (conferir colunas completas com \d report_approvals no Supabase antes de mexer)
);

-- já existe (20260722202842_...)
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
```

Nota: o código hoje referencia nomes como `lab_report_approvals` em alguns pontos — **confirmar contra o schema real** (`report_approvals` é o nome que apareceu nas migrations) antes de escrever queries. Pode haver uma view/alias, ou pode ser um erro de nome já existente no código atual — checar com `\dt` / `\dv` no Supabase ou grep em `supabase/migrations/*.sql` por `CREATE VIEW`.

**Não existe ainda** uma tabela para o quadro Kanban de "chegada de amostras" (`chegada-amostras.functions.ts`) — hoje é 100% um blob JSON único no Drive. Se for incluído no escopo (ver Fase 4, opcional), precisa criar tabela nova (uma linha por card, não um blob).

**Falta em `lab_index`:** um campo de controle de versão explícito para o `extra` (o rascunho). `updated_at` existe mas não é suficiente sozinho para optimistic locking robusto (dois updates no mesmo milissegundo são possíveis). Recomendo adicionar:
```sql
ALTER TABLE public.lab_index ADD COLUMN IF NOT EXISTS rev integer NOT NULL DEFAULT 1;
```

**Falta um log de auditoria de campo** (o item que o gestor pediu: "verificar os dados que ela digitou e alterou"). Proposta de tabela nova:
```sql
CREATE TABLE public.lab_draft_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id text NOT NULL REFERENCES public.lab_index(scope_id) ON DELETE CASCADE,
  rev integer NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  diff jsonb NOT NULL   -- {"campo": {"de": ..., "para": ...}, ...} calculado no servidor comparando payload novo vs anterior
);
CREATE INDEX ON public.lab_draft_history (scope_id, changed_at DESC);
```
Preencher isso dentro da própria `saveSharedDraft` (calcular diff entre `extra` antigo e novo antes de sobrescrever, gravar uma linha aqui). Isso resolve diretamente o requisito "D" do gestor (ver conversa anterior) e é praticamente grátis de implementar já que estaremos mexendo nessa função de qualquer forma.

## 3. Ordem de execução recomendada (do menor risco pro maior)

Fazer **uma camada de cada vez**, testar, só então seguir pra próxima. Não fazer tudo num PR gigante.

### Fase 1 — Unificar `getWorkflowStatuses` (risco baixo, ganho imediato)
- Hoje existem 2 implementações: `approvals.functions.ts:~473` e `driveSync.functions.ts:~569`.
- Escolher UMA (recomendo a de `approvals.functions.ts`, já que ela vai virar a fonte de verdade na Fase 2), fazer a outra virar um re-export/chamada pra ela, e atualizar todos os imports:
  - `_app.relatorio.adensamento.tsx:138`
  - `_app.relatorio.triaxial-cid.tsx:61`
  - `_app.relatorio.cisalhamento-direto.tsx:73`
  - `features/mesp-natural/editor.tsx:33`
  - `_app.relatorio.os.$osId.amostra.$amostraId.index.tsx:17`
  - (buscar por `getWorkflowStatuses` em todo `src/` pra achar outros usos)
- **Teste:** abrir a Central de Relatórios e as telas de amostra lado a lado, confirmar que mostram o mesmo status pro mesmo ensaio.

### Fase 2 — Rascunhos: Supabase vira fonte primária (risco médio)
Arquivo: `src/lib/draft.functions.ts`, função `saveSharedDraft` (linha ~37-113) e a função de leitura equivalente (`loadSharedDraft` ou nome similar — localizar no mesmo arquivo).

Mudança de comportamento:
1. Cliente envia `{ scopeId, payload, expectedRev }` (o `expectedRev` é o `rev` que o cliente tinha quando abriu/última vez leu o registro).
2. No servidor: `UPDATE lab_index SET extra = payload, rev = rev + 1, updated_at = now() WHERE scope_id = $1 AND rev = $expectedRev RETURNING rev`.
3. Se **zero linhas afetadas** → alguém salvou por cima entre a leitura e a escrita deste cliente. Retornar erro `409 CONFLICT` explícito pro front, **não** silenciar.
4. No front, ao receber conflito: **não sobrescrever silenciosamente** — mostrar um aviso ("Este relatório foi alterado por outra pessoa enquanto você digitava — recarregando os dados mais recentes") e recarregar o registro atual antes de deixar o usuário continuar. (Versão simples suficiente para o volume de uso do laboratório: não precisa de merge automático campo-a-campo agora, só evitar a perda silenciosa.)
5. Antes do UPDATE, calcular o diff entre `extra` antigo e novo e inserir uma linha em `lab_draft_history` (ver seção 2).
6. **Remover** a escrita em `ensaio.json` no Drive dentro deste fluxo de autosave (linhas ~63-69 do arquivo atual, `uploadBytesToDrive({..., overwrite: true})`). O Drive deixa de ser tocado a cada 400ms.
7. **Remover** a escrita em `.data/drafts/{scopeId}.json` no disco do servidor (linha ~76-86) — isso deixa de fazer sentido quando Supabase é a fonte confiável; era um paliativo do problema que estamos corrigindo.
8. Manter compatibilidade de leitura: `loadSharedDraft` deve ler primeiro do Supabase; se o registro não existir lá mas existir um `ensaio.json` legado no Drive (dado antigo pré-migração), importar esse conteúdo pro Supabase nessa primeira leitura (ver Fase 5, migração de dados existentes).

**Teste:** abrir o mesmo ensaio em duas abas/computadores, editar campos diferentes em cada um, salvar em sequência rápida — confirmar que o segundo salvamento recebe o aviso de conflito ao invés de apagar o primeiro silenciosamente.

### Fase 3 — Aprovações/farol: eliminar o arquivo único `_approvals-index.json` (risco médio-alto, é o pior ofensor)
Arquivo: `src/lib/approvals.functions.ts`.

Mudança de comportamento:
1. `requestApproval`, `verifyApproval`, `decideApproval` passam a fazer `INSERT`/`UPDATE` diretamente na tabela `report_approvals` (usando o campo `rev` que já existe lá — mesma lógica de optimistic locking da Fase 2: `WHERE scope_id = $1 AND rev = $expectedRev`).
2. `setWorkflowStatus` (linhas ~132-146, hoje grava em `lab_index` só como best-effort dentro de um `try/catch` silencioso) passa a ser a escrita **principal e obrigatória** em `lab_index.workflow_status` — se falhar, a operação inteira falha e mostra erro pro usuário (não seguir em frente como sucesso).
3. **Remover** `getMasterApprovals`/`saveMasterApprovals` (leitura/escrita do `_approvals-index.json` inteiro) do caminho principal. Esse arquivo no Drive pode continuar existindo só como **backup opcional assíncrono** (grava depois, não bloqueia, não é lido de volta por ninguém) se quiser manter por segurança na transição — mas não pode mais ser a fonte de leitura.
4. Conferir e corrigir os dois pontos identificados na auditoria anterior que já tinham esse bug mesmo antes da migração pro Drive:
   - `_app.relatorio.adensamento.tsx:713-744` — toast de sucesso e `setWfStatus` fora do `try`, precisa mover pra dentro e adicionar `toast.error` no `catch` (copiar o padrão já correto de `_app.relatorio.triaxial-cid.tsx:753-789`).
   - `_app.relatorio.cisalhamento-direto.tsx:784-819` — mesmo ajuste.

**Teste:** simular verificador aprovando o relatório A e digitador enviando o relatório B pra verificação nos mesmos ~2 segundos (duas abas diferentes) — confirmar que as duas operações completam corretamente sem uma pisar na outra (antes, ambas competiam pelo mesmo arquivo `_approvals-index.json`; agora são linhas diferentes na tabela, sem conflito nenhum entre si).

### Fase 4 — Pendências de digitação (risco baixo)
Arquivo: `src/lib/lab-pendencias.functions.ts`.
- `criarPendenciaDigitacao` (linha ~74): remover a escrita em `.data/pendencias.json` local (linha ~51) do caminho síncrono/obrigatório. Supabase (`lab_pendencias_digitacao`, já bem modelada com `UNIQUE (os, amostra, ensaio)`) vira a única escrita, e precisa deixar de estar dentro de um `try/catch` silencioso (linhas ~107-122) — se falhar, avisar.
- `listPendenciasDigitacao` (linha ~153): parar de fundir com o arquivo local (linhas ~156-178), ler só do Supabase.

**Teste:** concluir um ensaio na bancada (ou simular via botão/ação equivalente), confirmar que aparece na Central de Relatórios (`_app.relatorio.pendentes.tsx`) sem depender do arquivo local do servidor.

### Fase 5 — Migração dos dados que hoje só existem no Drive (obrigatório antes de desligar a leitura do Drive em produção)
Escrever um script único (rodar uma vez, não vira parte do app):
1. Listar todos os `ensaio.json` existentes nas pastas de ensaio no Drive.
2. Para cada um, se não existir uma linha correspondente em `lab_index` com dados equivalentes em `extra`, fazer o `upsert` trazendo esse conteúdo pro Supabase (com `rev = 1`).
3. Ler `_approvals-index.json` inteiro uma última vez e fazer `upsert` de cada entrada em `report_approvals`/`lab_index.workflow_status`, comparando com o que já existe (não sobrescrever se o Supabase já tiver uma aprovação mais recente que o arquivo do Drive, pelo `decided_at`/`requested_at`).
4. Rodar isso ANTES de fazer deploy do código das Fases 2 e 3 em produção — senão relatórios em digitação no momento da troca "somem" da visão do app.

### Fase 6 (opcional, não bloqueia o resto) — Quadro Kanban de chegada de amostras
`src/lib/chegada-amostras.functions.ts` tem o mesmo problema (arquivo único no Drive), mas é um sistema separado (chegada de amostras, não relatórios). Se o gestor relatar os mesmos sintomas ali, aplicar o mesmo princípio: criar uma tabela `chegada_amostras_cards` (uma linha por card, não um blob), com o mesmo padrão de `rev`.

### Fase 7 (independente, pode ser feita a qualquer momento, inclusive antes de tudo acima)
**Segurança:** `src/lib/google-auth.server.ts:~87` tem a chave privada de uma Service Account do Google embutida em Base64 no código-fonte como fallback. Isso deve ser:
1. Removido do código.
2. A chave rotacionada/revogada no Google Cloud Console (a antiga, que ficou exposta no histórico do Git, precisa ser invalidada — trocar não é suficiente, tem que revogar a antiga).
3. A nova chave configurada só via variável de ambiente (`GOOGLE_SERVICE_ACCOUNT_JSON`, que já existe no `.env.example`), sem fallback hardcoded.

Isso é urgente e não depende de nada das outras fases — pode ser feito primeiro, é rápido.

## 4. O que **não** muda
- Fotos de ensaio continuam indo pro Drive.
- PDFs finais continuam sendo gerados e guardados como já é hoje (Supabase Storage bucket `lab-reports` + cópia no Drive por revisão) — esse fluxo já está correto e não precisa mexer.
- Nenhuma tela muda visualmente para o usuário final — a mudança é só em qual "banco" cada função usa por baixo dos panos.

## 5. Checklist de aceite (como saber que funcionou)
- [ ] Dois usuários editando o mesmo relatório em computadores diferentes: nenhum perde dados silenciosamente; o segundo a salvar recebe aviso de conflito.
- [ ] Status do farol é idêntico em todas as telas que o mostram (Central de Relatórios, tela da amostra, editor do ensaio) para o mesmo ensaio, ao mesmo tempo.
- [ ] Gestor consegue abrir um relatório e ver uma lista de "o que mudou, quando, por quem" (tabela `lab_draft_history`).
- [ ] Simular falha de rede durante envio pra verificação: o app mostra erro claro, **não** avança o farol como se tivesse dado certo.
- [ ] Chave da Service Account do Google não aparece mais em nenhum arquivo `.ts`/`.js` do repositório (só em variável de ambiente).
- [ ] Rodar o app apontando pro banco de produção por pelo menos alguns dias com os dois caminhos (Drive antigo e Supabase novo) coexistindo antes de apagar de vez o código do caminho antigo, para garantir que nada ficou esquecido.
