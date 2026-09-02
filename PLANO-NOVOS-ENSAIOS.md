# Plano — Novos Ensaios (Relatório + Digitalização)

## Contexto

Hoje o sistema tem 4 ensaios totalmente implementados (relatório completo + fluxo de aprovação): Cisalhamento Direto, Triaxial CID, Adensamento e M.ESP.A — e 2 deles (M.ESP.A e Adensamento) já têm digitalização de campo por QR Code. Este documento planeja a entrada de **6 novos tipos de ensaio**, usando a mesma arquitetura já validada (relatório completo no Drive + digitalização mobile via `src/features/digit-scan/registry.ts`, criado na Fase 6 do plano de automação da Programação).

Cada seção abaixo cobre: a norma de referência, o que muda em relação ao que já existe (pra reaproveitar o máximo de código possível), os dados que o relatório precisa, e como a digitalização de campo deve funcionar. O tamanho de implementação é uma estimativa relativa (P/M/G), não uma data.

**Ordem de prioridade sugerida** (da mais barata/reaproveitável pra mais nova): Umidade Natural → Triaxial UU → Triaxial CIU → Permeabilidade (CC e CV) → DSS → Módulo de Resiliência (DNIT 134).

---

## 1. Umidade Natural (Teor de Umidade)

**Norma:** NBR 6457 / NBR 16469 (preparação de amostras) + determinação por estufa (105–110 °C).

**Tamanho: P (pequeno).** É estruturalmente o ensaio mais simples do sistema — só massas de cápsula (tara, úmida, seca), igual ao que M.ESP.A e as cápsulas de Adensamento já fazem.

**O que reaproveitar:** o padrão inteiro já existe. `MoistureCapsule`/`CapsulaInicialInput` (mesmo shape usado em `oedometer.ts` e `adens-scan/ui.tsx`), a Central de Cápsulas (`_app.relatorio.digitalizacao.capsulas.tsx`) já detecta "massa seca pendente" de forma genérica — só precisa de uma nova entrada em `CAPSULE_SOURCES`.

**Dados do relatório:**
- Identificação padrão (OS, amostra, furo, profundidade — igual aos outros).
- N cápsulas (normalmente 1 a 3 por amostra): número, tara, cápsula+solo úmido, cápsula+solo seco.
- Cálculo: `w% = (massa_água / massa_seca) × 100`, com média se houver mais de 1 cápsula (desvio entre determinações como controle de qualidade, igual já existe em Adensamento).

**Digitalização de campo:** tela nova mínima (`features/umidade-natural/`), no mesmo padrão do `AdensWorkspace` mas só com o bloco de cápsulas — sem moldagem, sem fotos de CP (opcionalmente 1 foto da amostra). É o candidato ideal pra ser o **primeiro a usar o registro genérico da Fase 6**, exatamente pra validar o padrão de extensão antes dos ensaios maiores.

---

## 2. Triaxial UU (Não Consolidado Não Drenado)

**Norma:** ASTM D2850 / NBR 12770 (equivalente nacional para solos coesivos).

**Tamanho: M (médio) — mas reaproveitando muito do módulo Triaxial CID já existente**, não como módulo novo do zero.

**Por que reaproveitar o CID:** o UU não tem fase de saturação por contrapressão nem fase de adensamento — o CP é ensaiado direto na umidade/condição de moldagem, sob pressão confinante total (célula), e cisalhado sem drenagem. Os tipos já existentes em `src/features/triaxial-cid/types.ts` já têm campo `condition: "saturado" | "natural"` e o `ShearReading` já é genérico o bastante (`eaPct`, `F`/`loadKgf`, `dispMm`) pra cobrir UU sem mudança de shape. A diferença real é **qual das fases roda**: UU pula `saturation` e `consolidation`, usa só `shear` (tensão total, sem poropressão), e o cálculo de resistência usa **tensões totais** (`cu`, e teoricamente `φu ≈ 0` pra solo saturado) em vez de tensões efetivas.

**Recomendação:** adicionar `testType: "cid" | "uu"` (ou renomear o módulo pra "Triaxial" genérico com esse seletor) em vez de criar `features/triaxial-uu/` do zero. Isso evita duplicar toda a lógica de geometria de CP, moldagem, cálculo de índices físicos e as telas de relatório — só a fase de cisalhamento e a envoltória final (Mohr total em vez de efetiva) mudam.

**Dados do relatório:**
- Igual ao CID até a moldagem do CP (D0, H0, massas, cápsulas de umidade).
- Sem fases de saturação/adensamento.
- Cisalhamento: leituras de carga axial × deformação, sob 2–3 pressões confinantes diferentes (CPs distintos), sem medição de poropressão.
- Envoltória: círculos de Mohr em tensões totais → `cu` (coesão não drenada) e `φu`.

**Digitalização de campo:** moldagem do CP (mesmos campos de anel/massas do Adensamento, adaptado pra corpo de prova triaxial: diâmetro, altura, massa) + cápsulas de umidade inicial/final + fotos. Não há leituras de processo em campo (o cisalhamento roda na prensa, os dados brutos são importados depois, igual o CID já faz via XLSX — ver `rawImport` no tipo `TriaxialSpecimen`).

---

## 3. Triaxial CIU (Consolidado Isotropicamente Não Drenado)

**Norma:** ASTM D4767 / ISO 17892-9 (mesma família normativa do CID já implementado).

**Tamanho: M (médio) — mesma lógica de reaproveitamento do UU, um nível acima em complexidade.**

**Por que reaproveitar o CID:** olhando `src/features/triaxial-cid/types.ts` diretamente — o CIU **tem** fase de saturação e adensamento igual ao CID (por isso "Consolidado" no nome), a diferença real é só na fase de cisalhamento: CID é drenado (mede variação de volume, `dvPct`/`dVcm3`), CIU é não drenado (mede poropressão, e o campo `uPore` **já existe** no tipo `ShearReading`, provavelmente deixado ali de propósito ou por generalização anterior). Ou seja: a estrutura de dados já comporta CIU quase sem mudança — só falta a lógica de cálculo alternativa (tensão efetiva via `σ' = σ - u` em vez de via correção de área/volume) e a envoltória em tensões efetivas usando poropressão medida.

**Recomendação:** mesmo `testType`/seletor do item 2 (`"cid" | "ciu" | "uu"`), com CID e CIU compartilhando saturação + adensamento, e só divergindo na fase de cisalhamento (drenado vs. não drenado) e no cálculo de resultados.

**Dados do relatório:** idênticos ao CID até o fim da fase de adensamento. Na fase de cisalhamento: leituras de carga axial, deformação axial e **poropressão** (em vez de variação de volume). Resultado: parâmetro `B` de Skempton (já existe: `BFinal` no tipo `SpecimenResults`), tensão desviadora, trajetória de tensões efetivas, envoltória `c'`/`φ'` (mesmos campos `EnvelopeResult` já existentes) **e** envoltória total `cu`/`φu` calculada a partir do mesmo ensaio (CIU rende as duas, que é uma vantagem prática de reportar).

**Digitalização de campo:** igual ao CID (já roda via QR? — não, hoje só Adensamento/M.ESP.A têm QR; Triaxial CID também ainda não tem digitalização de campo). Se for prioridade, a mesma tela serviria pros três (CID/CIU/UU), variando só quais fases pedem dado em campo.

---

## 4. Permeabilidade — Carga Constante e Carga Variável

**Normas:** NBR 13292 (carga constante, solos granulares) e NBR 14545 (carga variável, solos coesivos/pouco permeáveis).

**Tamanho: M (médio) por ensaio — módulo novo, mas o mais simples entre os "novos de verdade" (sem fase de cisalhamento/envoltória).**

São dois ensaios normativamente distintos (aplicam-se a faixas de permeabilidade diferentes) mas compartilham a mesma identificação de amostra/CP e o mesmo tipo de saída (coeficiente de permeabilidade `k`, em cm/s), então recomendo um único módulo `features/permeabilidade/` com `metodo: "carga_constante" | "carga_variavel"`.

**Dados do relatório — Carga Constante:**
- Geometria do corpo de prova (diâmetro, altura, área) — mesmo padrão de `ringDiameter`/`ringHeight` do Adensamento.
- Gradiente hidráulico aplicado, temperatura da água (correção de viscosidade — `k_20°C = k_T × η_T/η_20`, tabela de viscosidade padrão a incluir como constante).
- Leituras: volume percolado × tempo, em geral várias repetições pra tirar média/desvio.
- Cálculo: `k = (Q·L)/(A·h·t)`, corrigido pra 20 °C.

**Dados do relatório — Carga Variável:**
- Mesma geometria + área da bureta (tubo de carga variável).
- Leituras: altura da coluna d'água (h1 → h2) ao longo do tempo, uma ou mais séries.
- Cálculo: `k = (a·L)/(A·t)·ln(h1/h2)`, mesma correção de temperatura.

**Digitalização de campo:** moldagem/preparação do CP (dimensões, massa) — as leituras de percolação em si normalmente são feitas com o ensaio já montado na bancada ao longo de horas/dias, então o valor da digitalização aqui está mais em registrar o *setup* inicial (permite depois o técnico complementar as leituras periódicas direto do relatório, sem re-digitar a identificação) do que substituir o acompanhamento manual do ensaio em si.

---

## 5. DSS — Ensaio de Cisalhamento Simples Direto

**Norma:** ASTM D6528 (não confundir com o Cisalhamento Direto — caixa bipartida — que o sistema já tem).

**Tamanho: G (grande) — equipamento e grandezas medidas são bem diferentes do CD já existente, então o reaproveitamento de código é menor.**

O DSS difere do Cisalhamento Direto convencional por manter a **área constante** (sem rotação da caixa) e medir tensão cisalhante sob deformação controlada com altura constante (condição K0), sendo usado principalmente pra obter parâmetros de resistência não drenada em argilas/análise sísmica — é mais próximo em espírito do Triaxial (fases de consolidação + cisalhamento) do que do CD.

**Dados do relatório:**
- Moldagem do CP em anel (igual Adensamento: diâmetro, altura, massas).
- Fase de consolidação vertical (leituras deformação × tempo, igual `ConsolidationReading` do Triaxial).
- Fase de cisalhamento: tensão cisalhante × deformação horizontal, sob altura constante — tipicamente calcula variação de tensão vertical necessária pra manter volume constante (análogo à poropressão gerada em ensaio não drenado).
- Resultado: curva tensão-deformação, resistência não drenada `su`, razão `su/σ'v`.

**Recomendação de reaproveitamento:** a fase de consolidação pode reaproveitar o MESMO padrão de `ConsolidationReading` do Triaxial/Adensamento; a fase de cisalhamento é estruturalmente nova (não existe hoje um "cisalhamento sob altura constante" no sistema) — esse é o ensaio da lista que realmente pede um cálculo novo, não só uma variação de condição sobre módulo existente.

**Digitalização de campo:** moldagem do CP + cápsulas de umidade, mesmo padrão dos demais.

---

## 6. Módulo de Resiliência (MR) — DNIT 134/2018-ME

**Norma:** DNIT 134/2018-ME (baseada em AASHTO T307), pavimentação — para solos de subleito/base.

**Tamanho: G (grande) — o mais diferente de tudo que já existe no sistema.**

Este é estruturalmente o mais distante dos ensaios já implementados: é um ensaio **cíclico** (carregamento repetido, centenas a milhares de ciclos em múltiplas combinações de tensão confinante/desvio), não estático como os demais — a "curva" de interesse não é tensão-deformação de um único carregamento, mas o **módulo resiliente em função do estado de tensões**, ajustado por um modelo composto (ex.: modelo universal `MR = k1·Pa·(θ/Pa)^k2·(τoct/Pa+1)^k3`).

**Dados do relatório:**
- Moldagem do CP (compactação — energia, umidade ótima, massa específica seca — reaproveita os campos `sampleState`/`compactionEnergy`/`compactionDegreePct` que **já existem** em `TriaxialSample`, criados justamente pra amostras compactadas).
- Sequência de pares (σ3, σd) prescrita pela norma (18 pares padrão) — geralmente um arquivo/tabela fixa de "estados de tensão" a percorrer.
- Para cada par: módulo resiliente calculado (`MR = σd/εr`, deformação recuperável do último ciclo estável de cada estágio) — os dados brutos (milhares de ciclos) tipicamente vêm de importação de arquivo do equipamento (mesmo padrão `rawImport` do Triaxial), não digitação manual ciclo a ciclo.
- Ajuste do modelo composto (regressão não linear) → coeficientes k1/k2/k3 + R².

**Digitalização de campo:** só a moldagem/compactação do CP (mesmo padrão de massas/dimensões) — os dados cíclicos em si não são candidatos a digitação manual em campo, vêm de importação de arquivo do equipamento (como o Triaxial CID já faz hoje com XLSX da OWNTEC).

---

## Resumo — tamanho e ordem sugerida

| # | Ensaio | Tamanho | Reaproveita de |
|---|---|---|---|
| 1 | Umidade Natural | P | Cápsulas (Adensamento/M.ESP.A) + Central de Cápsulas |
| 2 | Triaxial UU | M | Triaxial CID (~70% do código) |
| 3 | Triaxial CIU | M | Triaxial CID (~70% do código, `uPore` já existe no tipo) |
| 4 | Permeabilidade (CC + CV) | M | Geometria de CP (Adensamento) + cálculo novo |
| 5 | DSS | G | Consolidação (Triaxial/Adensamento) + cisalhamento novo |
| 6 | Módulo de Resiliência (DNIT 134) | G | Compactação (campos já existem em `TriaxialSample`) + modelo novo |

Recomendo confirmar comigo, antes de cada implementação, os detalhes normativos específicos que a Suporte INFRA já usa na prática (planilhas/laudos atuais), já que normas como DSS e MR têm variações de procedimento entre laboratórios — a estrutura acima é a base técnica correta, mas os campos exatos do relatório final devem bater com o que vocês já emitem hoje.
