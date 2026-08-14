---
name: Fluxo padrão de digitalização e digitação de ensaios (todos os tipos)
description: Fluxo completo QR → execução → digitação → verificação → aprovação. Aplica-se a M.ESP.A, Triaxial UU/CIU/CD, Adensamento e futuros ensaios. Referência única para replicar padrão.
type: feature
---

Padrão único para TODOS os ensaios digitalizados (M.ESP.A é a referência; Triaxial UU/CIU/CD, Adensamento etc. seguem o mesmo). Nunca criar fluxo divergente por ensaio.

## 1. Leitura de QR (variant "scanner", mobile-first)
- Botão "Ler QR Code" abre câmera dinâmica (traseira principal). Também aceita "Tirar foto do QR".
- BarcodeDetector nativo quando disponível; fallback html5-qrcode 24fps; toggle de lanterna.
- Após leitura: espera 1,5s e mostra pop-up de confirmação.
  - 1ª vez: "Operador {nome}, deseja iniciar a execução do ensaio {sigla} da amostra {os/amostra}?" + dados do QR (ID furo, profundidade).
  - Já iniciado: pop-up "Ensaio já iniciado em {data}" por 3s e vai direto para digitação.
- QR é fonte de verdade: mesmo sem OS na programação, cria/abre a pendência com os dados do QR.
- Topo do scanner: botão "Voltar". Ações: "Salvar rascunho" + "Finalizar execução".
- Determinações no celular: cards HORIZONTAIS, Enter avança, auto-select do input.
- Scanner NÃO mostra resultados calculados nem PDF — só entrada de dados de campo.

## 2. Operador
- Operador = técnico definido na programação do Gantt (não quem clicou "Concluir").
- Preservado em `lab_pendencias_digitacao.operador_nome`; nunca sobrescrever com o usuário logado.

## 3. Editor (variant "editor", desktop, Relatório → Digitação)
- Abas no topo iguais ao Triaxial CID: "Ensaio | Versões | Prévia PDF".
- Cabeçalho puxa Tomador/Obra pelo nº da OS; ID do Furo/Profundidade vêm do QR mas ficam editáveis.
- Massa Específica usa ρ (rho grego), nunca γ.
- Determinações em TABELA HORIZONTAL (nova determinação = nova coluna).
- Autosave + versionamento + prévia PDF ao vivo (offscreen render).
- Duração real em ms (`src/lib/duracao-real.ts`), nunca arredondar 2h para 1d.

## 4. Máquina de estados + SLA
`pendente → em_digitacao → digitado → verificado → aprovado`
- Todo passo grava quem fez e quando (audit log).
- SLA: Digitação 3d úteis; Verificação+Aprovação 2d úteis; cores em `emissoes-inner.tsx`.
- Hub Relatório → Digitação & Emissões: colunas lado-a-lado (Próximos / Pendentes / Em Execução / Enviados / Em Digitação / Aguardando Verificação / Aguardando Aprovação / Aprovados). Dashboard só na Visão Geral.

## 5. Central de Cápsulas ↔ Ensaio (sincronização bidirecional)
- Cápsula pertence ao número (ex.: 343) e pode aparecer em vários ensaios/amostras.
- Pesagem inicial + tara nascem no ensaio; pesagem final é digitada na Central no dia seguinte.
- Ao salvar final na Central: atualizar `payload.dets[i]` da pendência (`massaCapsulaSoloSeco`, tara, nº cápsula) por match de nº cápsula + OS/amostra/determinação.
- Editor do ensaio, ao montar, faz merge server-first para campos de cápsula: pendência tem prioridade sobre rascunho localStorage vazio; merge por nº da cápsula / índice da determinação.
- Central lista pendentes com data inicial, tipo/código do ensaio, determinação (CP01/Det01…); imprimível com marca Suporte INFRA.

## 6. Ponte Gantt → Relatório
- Ensaios digitalizados iniciam pela Digitalização; concluir lá cria/atualiza `lab_pendencias_digitacao`.
- Ensaios NÃO digitalizados: ao concluir no Gantt, vão para "Pendentes de digitação".
- Nunca duplicar pendência: upsert por (os, amostra, ensaio).

## 7. Triaxiais (UU/CIU/CD)
- Mesmo QR pode carregar múltiplos CPs — tratar CPs como "determinações" no payload; editor pré-preenche cada CP.

## 8. Regras invioláveis
- Nunca sobrescrever operador com o usuário logado se `operador_nome` já veio da programação.
- Nunca deixar rascunho local vazio bloquear hidratação do servidor.
- Nunca mostrar PDF/resultado no scanner mobile.
- Nunca criar fluxo específico por tipo de ensaio — estender este padrão.
