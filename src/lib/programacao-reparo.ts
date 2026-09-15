/**
 * Reparo da programação: junta a planilha antiga (com linhas de colunas
 * trocadas) ao banco do app e corrige os tipos de ensaio perdidos. Só lógica,
 * sem rede — o servidor lê a planilha e grava (programacao-planilha.server.ts);
 * aqui só se decide o quê.
 *
 * Por que as colunas trocaram: `insertRow` acrescentava a linha na planilha na
 * ordem dos campos enviados ({...linha, id, created_at, updated_at}), não na
 * ordem do cabeçalho da aba. E o Gantt lia a planilha: o ensaio importado
 * ficava com o id da amostra na coluna "id", o id do tipo em "amostra_id" e
 * "pendente" em "tipo_ensaio_id" — daí os cartões "Ensaio • amostra".
 *
 * Como desentortar sem chute: o banco guardou cada linha incluída com os
 * campos NA MESMA ORDEM em que ela foi para a planilha. Essas ordens viram
 * gabaritos; uma linha torta é lida pelo gabarito de mesmo tamanho que melhor
 * encaixa (id que existe, data onde é data, status conhecido...). Linha que
 * nenhum gabarito explica não entra — vai para o relatório, com os valores.
 */
import { ehTipoAvulso, resolverTipo, type TipoProg } from "./programacao-tipos";
import { PROG_COLUMNS } from "./programacao-model";

export type Linha = Record<string, string>;
export type Abas = Record<string, Linha[]>;
export type AbaDaPlanilha = { aba: string; valores: string[][] };

export const ABAS_DA_PROGRAMACAO = [
  "Amostras",
  "Ensaios",
  "Programações",
  "Tipos de Ensaio",
  "Equipamentos",
  "Dependências",
] as const;

const RABO = ["id", "created_at", "updated_at"];

/** Ordens em que a importação de ensaios antiga enviava os campos (import-ensaios-dialog). */
export const ORDENS_DA_IMPORTACAO_ANTIGA: Record<string, string[][]> = {
  Amostras: [
    ["os_numero", "codigo_amostra", "descricao", "tomador", "obra", "prioridade", "tipo", "topo_m", "base_m", "amostra_coletada", ...RABO],
  ],
  Ensaios: [["amostra_id", "tipo_ensaio_id", "status", "prioridade", ...RABO]],
  "Tipos de Ensaio": [["nome", "codigo", "permite_paralelo", "cor_gantt", ...RABO]],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_SEMENTE = /^(te|eq|am|es|pr)-[\w-]+$/;
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATA = /^\d{4}-\d{2}-\d{2}/;
const STATUS = new Set(["pendente", "planejado", "programado", "em_execucao", "concluido", "cancelado", "pausado"]);
const PRIORIDADES = new Set(["baixa", "media", "alta", "urgente"]);

export const pareceId = (v: string) => UUID.test(v) || ID_SEMENTE.test(v);
const norm = (s: unknown) => String(s ?? "").trim().toUpperCase();
const texto = (v: unknown) => (v == null ? "" : String(v));

function aparaFim(v: string[]): string[] {
  const out = v.map(texto);
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

/** A linha termina em id, criado em, alterado em — o rabo que `insertRow` sempre punha. */
function temRabo(v: string[]): boolean {
  const n = v.length;
  return n >= 3 && pareceId(v[n - 3]) && INSTANTE.test(v[n - 2]) && INSTANTE.test(v[n - 1]);
}

function porOrdem(ordem: string[], v: string[]): Linha {
  const o: Linha = {};
  ordem.forEach((k, i) => {
    o[k] = v[i] ?? "";
  });
  return o;
}

export type IdsConhecidos = {
  amostras: Set<string>;
  ensaios: Set<string>;
  tipos: Set<string>;
  equipamentos: Set<string>;
  programacoes: Set<string>;
};

const CONJUNTO_DA_ABA: Record<string, keyof IdsConhecidos> = {
  Amostras: "amostras",
  Ensaios: "ensaios",
  "Tipos de Ensaio": "tipos",
  Equipamentos: "equipamentos",
  Programações: "programacoes",
};

const CONJUNTO_DO_CAMPO: Record<string, keyof IdsConhecidos> = {
  amostra_id: "amostras",
  ensaio_id: "ensaios",
  tipo_ensaio_id: "tipos",
  equipamento_id: "equipamentos",
  predecessor_id: "programacoes",
  tipo_predecessor_id: "tipos",
  tipo_sucessor_id: "tipos",
};

/** Quanto um valor combina com o campo: positivo encaixa; -3 ou menos = impossível. */
function encaixe(campo: string, valor: string, ids: IdsConhecidos): number {
  if (valor === "") return 0;
  const conj = CONJUNTO_DO_CAMPO[campo];
  if (conj) {
    if (ids[conj].has(valor)) return 3;
    if (INSTANTE.test(valor) || DATA.test(valor) || STATUS.has(valor)) return -3;
    // tipo_ensaio_id às vezes guardou a etiqueta crua ("CD3.IN").
    return pareceId(valor) ? 1 : campo === "tipo_ensaio_id" ? 0 : -1;
  }
  if (campo === "id") return pareceId(valor) ? 1 : -3;
  if (campo === "created_at" || campo === "updated_at" || campo.endsWith("_ts")) return INSTANTE.test(valor) ? 2 : -3;
  if (campo.startsWith("data_") || campo === "prazo") return DATA.test(valor) ? 2 : -3;
  if (campo === "status") return STATUS.has(valor) ? 2 : -2;
  if (campo === "prioridade") return PRIORIDADES.has(valor) ? 2 : -2;
  if (campo === "duracao_dias" || campo === "progresso" || campo === "tempo_medio_h") {
    return /^-?\d+([.,]\d+)?$/.test(valor) ? 1 : -2;
  }
  if (campo === "incluir_fds" || campo === "permite_paralelo") return /^(true|false)$/i.test(valor) ? 1 : -2;
  // Texto livre: não pode ser um id nem um instante.
  return pareceId(valor) || INSTANTE.test(valor) ? -2 : 0;
}

const mesmaLinha = (a: Linha, b: Linha) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

export type Leitura = { como: "alinhada" | "realinhada"; linha: Linha } | { como: "nao_reconhecida" };

/** Lê uma linha crua da planilha: pelo cabeçalho quando está no lugar, pelo gabarito quando está torta. */
export function lerLinha(
  crua: string[],
  cabecalho: string[] | null,
  ordens: string[][],
  ids: IdsConhecidos,
): Leitura {
  const v = aparaFim(crua);
  const n = v.length;
  if (temRabo(v)) {
    if (cabecalho && cabecalho[n - 3] === "id" && cabecalho[n - 2] === "created_at" && cabecalho[n - 1] === "updated_at") {
      return { como: "alinhada", linha: porOrdem(cabecalho, v) };
    }
    let melhor: { linha: Linha; nota: number } | null = null;
    let empate = false;
    for (const ordem of ordens) {
      if (ordem.length !== n) continue;
      const notas = ordem.map((k, i) => encaixe(k, v[i], ids));
      if (notas.some((x) => x <= -3)) continue;
      const nota = notas.reduce((a, b) => a + b, 0);
      const linha = porOrdem(ordem, v);
      if (!melhor || nota > melhor.nota) {
        melhor = { linha, nota };
        empate = false;
      } else if (nota === melhor.nota && !mesmaLinha(linha, melhor.linha)) {
        empate = true;
      }
    }
    return melhor && !empate ? { como: "realinhada", linha: melhor.linha } : { como: "nao_reconhecida" };
  }
  if (cabecalho) {
    const linha = porOrdem(cabecalho, v);
    if (pareceId(linha.id ?? "")) return { como: "alinhada", linha };
  }
  return { como: "nao_reconhecida" };
}

/** Gabaritos de uma aba: as ordens de campos das linhas incluídas que o banco guardou. */
export function coletarOrdens(linhas: Linha[], extras: string[][] = []): string[][] {
  const vistas = new Map<string, string[]>();
  for (const o of extras) vistas.set(o.join(""), o);
  for (const l of linhas) {
    const ks = Object.keys(l);
    const n = ks.length;
    if (n >= 3 && ks[n - 3] === "id" && ks[n - 2] === "created_at" && ks[n - 1] === "updated_at") {
      vistas.set(ks.join(""), ks);
    }
  }
  return [...vistas.values()];
}

function separarCabecalho(valores: string[][]): { cabecalho: string[] | null; linhas: string[][] } {
  const primeira = (valores[0] ?? []).map((c) => texto(c).trim());
  return primeira.includes("id") ? { cabecalho: primeira, linhas: valores.slice(1) } : { cabecalho: null, linhas: valores };
}

function idsConhecidos(banco: Abas, planilha: AbaDaPlanilha[]): IdsConhecidos {
  const ids: IdsConhecidos = {
    amostras: new Set(),
    ensaios: new Set(),
    tipos: new Set(),
    equipamentos: new Set(),
    programacoes: new Set(),
  };
  for (const [aba, conj] of Object.entries(CONJUNTO_DA_ABA)) {
    for (const l of banco[aba] ?? []) if (l.id) ids[conj].add(texto(l.id));
    const p = planilha.find((x) => x.aba === aba);
    if (!p) continue;
    const { cabecalho, linhas } = separarCabecalho(p.valores);
    const col = cabecalho ? cabecalho.indexOf("id") : -1;
    for (const crua of linhas) {
      const v = aparaFim(crua);
      // Linha torta: o id verdadeiro está no rabo, não na coluna "id".
      if (temRabo(v)) ids[conj].add(v[v.length - 3]);
      else if (col >= 0 && pareceId(v[col] ?? "")) ids[conj].add(v[col]);
    }
  }
  return ids;
}

const maisNova = (a: Linha, b: Linha) => texto(a.updated_at) > texto(b.updated_at);

export type RelatorioAba = {
  aba: string;
  /** false = a aba não existe na planilha: o banco fica como está. */
  naPlanilhaExiste: boolean;
  naPlanilha: number;
  alinhadas: number;
  realinhadas: number;
  naoReconhecidas: { linha: number; valores: string[] }[];
  noApp: number;
  soNaPlanilha: number;
  soNoApp: number;
  /** Das só no banco, as que ficaram mesmo sem `manterSoNoApp` porque algo as usa. */
  soNoAppMantidas: number;
  planilhaMaisNova: number;
  resultado: number;
};

/**
 * Junta planilha e banco, aba a aba. Linha nos dois: vale a alteração mais
 * recente. Só na planilha: entra (era o que as telas mostravam). Só no banco:
 * as telas NÃO mostravam (liam a planilha) — em geral sobra de gravação que
 * falhou ou de algo apagado; fica só se `manterSoNoApp`.
 */
export function mesclar(
  banco: Abas,
  planilha: AbaDaPlanilha[],
  opcoes: { manterSoNoApp: boolean },
): { dados: Abas; relatorio: RelatorioAba[] } {
  const ids = idsConhecidos(banco, planilha);
  const dados: Abas = {};
  const relatorio: RelatorioAba[] = [];
  const foraDoResultado = new Map<string, Linha[]>();
  const nomes = [...new Set([...Object.keys(banco), ...planilha.map((p) => p.aba)])];

  for (const aba of nomes) {
    const doBanco = banco[aba] ?? [];
    const daPlanilha = planilha.find((p) => p.aba === aba);
    const r: RelatorioAba = {
      aba,
      naPlanilhaExiste: !!daPlanilha,
      naPlanilha: 0,
      alinhadas: 0,
      realinhadas: 0,
      naoReconhecidas: [],
      noApp: doBanco.length,
      soNaPlanilha: 0,
      soNoApp: 0,
      soNoAppMantidas: 0,
      planilhaMaisNova: 0,
      resultado: doBanco.length,
    };
    relatorio.push(r);
    if (!daPlanilha) {
      dados[aba] = doBanco.map((l) => ({ ...l }));
      continue;
    }

    const { cabecalho, linhas } = separarCabecalho(daPlanilha.valores);
    const ordens = coletarOrdens(doBanco, ORDENS_DA_IMPORTACAO_ANTIGA[aba]);
    const lidas = new Map<string, Linha>();
    linhas.forEach((crua, i) => {
      const v = aparaFim(crua);
      if (v.length === 0) return;
      r.naPlanilha++;
      const l = lerLinha(v, cabecalho, ordens, ids);
      if (l.como === "nao_reconhecida") {
        r.naoReconhecidas.push({ linha: i + (cabecalho ? 2 : 1), valores: v });
        return;
      }
      if (l.como === "alinhada") r.alinhadas++;
      else r.realinhadas++;
      const antes = lidas.get(l.linha.id);
      if (!antes || maisNova(l.linha, antes)) lidas.set(l.linha.id, l.linha);
    });

    const saida: Linha[] = [];
    const usados = new Set<string>();
    const deFora: Linha[] = [];
    for (const b of doBanco) {
      const p = lidas.get(b.id);
      if (p) {
        usados.add(b.id);
        if (maisNova(p, b)) {
          r.planilhaMaisNova++;
          saida.push({ ...b, ...p });
        } else {
          saida.push({ ...p, ...b });
        }
      } else {
        r.soNoApp++;
        if (opcoes.manterSoNoApp) saida.push({ ...b });
        else deFora.push({ ...b });
      }
    }
    for (const [id, p] of lidas) {
      if (usados.has(id)) continue;
      r.soNaPlanilha++;
      saida.push(p);
    }
    dados[aba] = saida;
    if (deFora.length) foraDoResultado.set(aba, deFora);
  }

  // Linha só do banco que algo do resultado ainda usa (o tipo de um ensaio, a
  // amostra de um ensaio...) fica mesmo sem `manterSoNoApp` — senão o reparo
  // criaria órfãos. Repete até parar: a linha que volta pode usar outra.
  for (let mudou = true; mudou; ) {
    mudou = false;
    const emUso = valoresEmUso(dados);
    for (const [aba, linhas] of foraDoResultado) {
      const ficamFora: Linha[] = [];
      for (const l of linhas) {
        if (emUso.has(texto(l.id))) {
          dados[aba].push(l);
          relatorio.find((r) => r.aba === aba)!.soNoAppMantidas++;
          mudou = true;
        } else {
          ficamFora.push(l);
        }
      }
      foraDoResultado.set(aba, ficamFora);
    }
  }
  for (const r of relatorio) r.resultado = dados[r.aba].length;
  return { dados, relatorio };
}

/** Todo valor que aponta para outra linha (menos o próprio id); listas "a,b" contam item a item. */
function valoresEmUso(dados: Abas): Set<string> {
  const s = new Set<string>();
  for (const linhas of Object.values(dados)) {
    for (const l of linhas) {
      for (const [k, v] of Object.entries(l)) {
        if (k === "id") continue;
        for (const parte of texto(v).split(",")) if (parte.trim()) s.add(parte.trim());
      }
    }
  }
  return s;
}

export type RelatorioTipos = {
  corrigidos: { ensaio: string; amostra: string; de: string; para: string }[];
  semTipo: { ensaio: string; amostra: string; valor: string }[];
  avulsosRemovidos: string[];
};

/**
 * Ensaio sem tipo válido, ou num tipo avulso ("CD3.IN") que tem tipo oficial
 * equivalente, passa ao tipo oficial — a etiqueta original fica em `etiqueta`.
 * Avulsos repetidos (mesmo nome) viram um só. Some só o avulso que ficou sem
 * uso E é repetido (de um oficial ou de outro avulso); os demais ficam.
 */
export function corrigirTipos(dados: Abas): RelatorioTipos {
  const tipos = (dados["Tipos de Ensaio"] ?? []) as (Linha & TipoProg)[];
  const porId = new Map(tipos.map((t) => [t.id, t]));
  const oficiais = tipos.filter((t) => !ehTipoAvulso(t));
  const amostras = new Map((dados.Amostras ?? []).map((a) => [a.id, a]));
  const rotulo = (id: string) => {
    const a = amostras.get(id);
    return a ? `OS ${a.os_numero} · ${a.codigo_amostra || a.identificacao || "amostra"}` : id || "(sem amostra)";
  };
  const primeiroAvulso = new Map<string, Linha & TipoProg>();
  for (const t of tipos) if (ehTipoAvulso(t) && !primeiroAvulso.has(norm(t.nome))) primeiroAvulso.set(norm(t.nome), t);

  const rel: RelatorioTipos = { corrigidos: [], semTipo: [], avulsosRemovidos: [] };
  for (const e of dados.Ensaios ?? []) {
    const atual = texto(e.tipo_ensaio_id);
    const t = porId.get(atual);
    if (t && !ehTipoAvulso(t)) continue;
    const etiqueta = t ? t.nome : !pareceId(atual) ? atual : texto(e.etiqueta);
    const oficial = etiqueta ? resolverTipo(etiqueta, oficiais) : null;
    const alvo = oficial ?? (t ? primeiroAvulso.get(norm(t.nome)) : undefined);
    if (!alvo) {
      rel.semTipo.push({ ensaio: e.id, amostra: rotulo(e.amostra_id), valor: atual });
      continue;
    }
    if (!e.etiqueta && etiqueta) e.etiqueta = etiqueta;
    if (alvo.id === atual) continue;
    e.tipo_ensaio_id = alvo.id;
    rel.corrigidos.push({ ensaio: e.id, amostra: rotulo(e.amostra_id), de: etiqueta || atual, para: alvo.nome });
  }

  const usados = new Set<string>();
  for (const [aba, linhas] of Object.entries(dados)) {
    if (aba === "Tipos de Ensaio") continue;
    for (const l of linhas) for (const v of Object.values(l)) usados.add(texto(v));
  }
  dados["Tipos de Ensaio"] = tipos.filter((t) => {
    if (!ehTipoAvulso(t) || usados.has(t.id)) return true;
    const repetido = resolverTipo(t.nome, oficiais) !== null || primeiroAvulso.get(norm(t.nome))?.id !== t.id;
    if (!repetido) return true;
    rel.avulsosRemovidos.push(t.nome);
    return false;
  });
  return rel;
}

export type RelatorioReparo = {
  abas: RelatorioAba[];
  tipos: RelatorioTipos;
  programacoesSemEnsaio: number;
};

/** O reparo inteiro: junta, corrige os tipos e conta as programações órfãs. */
export function montarReparo(
  banco: Abas,
  planilha: AbaDaPlanilha[],
  opcoes: { manterSoNoApp: boolean },
): { dados: Abas; relatorio: RelatorioReparo } {
  const { dados, relatorio } = mesclar(banco, planilha, opcoes);
  const tipos = corrigirTipos(dados);
  const ensaios = new Set((dados.Ensaios ?? []).map((e) => e.id));
  const programacoesSemEnsaio = (dados["Programações"] ?? []).filter((p) => !ensaios.has(p.ensaio_id)).length;
  return { dados, relatorio: { abas: relatorio, tipos, programacoesSemEnsaio } };
}

/* ------------------------- Espelho da planilha ------------------------- */

const ORDEM_DAS_COLUNAS: Record<string, string[]> = {
  Amostras: [
    "os_numero", "codigo_amostra", "tipo", "identificacao", "descricao", "tomador", "obra",
    "prioridade", "topo_m", "base_m", "amostra_coletada",
  ],
  Ensaios: ["amostra_id", "tipo_ensaio_id", "etiqueta", "status", "prioridade", "prazo", "observacoes", "detalhes_tecnicos"],
  Programações: PROG_COLUMNS,
  "Tipos de Ensaio": ["nome", "codigo", "cor_gantt", "equipamentos_ids", "permite_paralelo", "tempo_medio_h", "tipo_relatorio"],
  Equipamentos: ["nome", "codigo"],
};

/** Cabeçalho fixo da aba no espelho: id primeiro, as colunas conhecidas, as demais, e as datas no fim. */
export function cabecalhoDaAba(aba: string, linhas: Linha[]): string[] {
  const preferidas = (ORDEM_DAS_COLUNAS[aba] ?? []).filter((k) => !RABO.includes(k));
  const outras: string[] = [];
  for (const l of linhas) {
    for (const k of Object.keys(l)) {
      if (!RABO.includes(k) && !preferidas.includes(k) && !outras.includes(k)) outras.push(k);
    }
  }
  return ["id", ...preferidas, ...outras, "created_at", "updated_at"];
}

const celula = (v: unknown) => (v == null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v));

/** A aba inteira como vai para a planilha: cabeçalho + uma linha por registro, cada valor na sua coluna. */
export function valoresDaAba(aba: string, linhas: Linha[]): string[][] {
  const cab = cabecalhoDaAba(aba, linhas);
  return [cab, ...linhas.map((l) => cab.map((k) => celula(l[k])))];
}
