/**
 * Leitura e arrumação da planilha da Programação. Só lógica, sem rede — o
 * servidor lê e grava a planilha (programacao-fonte.server.ts); aqui só se
 * decide o quê.
 *
 * A planilha é a fonte dos dados da programação. O defeito que isto corrige:
 * `insertRow` acrescentava a linha na ordem dos campos enviados ({...linha,
 * id, created_at, updated_at}), não na do cabeçalho da aba. As telas liam pelo
 * cabeçalho: o ensaio importado ficava com o id da amostra na coluna "id", o
 * do tipo em "amostra_id" e "pendente" em "tipo_ensaio_id" — os cartões
 * "Ensaio • amostra" do Gantt.
 *
 * Como desentortar sem chute: a cópia do app (programacao_db.json) guardou
 * cada linha incluída com os campos NA MESMA ORDEM em que ela foi para a
 * planilha. Essas ordens viram gabaritos; uma linha torta é lida pelo gabarito
 * de mesmo tamanho que melhor encaixa (id que existe, data onde é data, status
 * conhecido...). Linha que nenhum gabarito explica fica como está — e aparece
 * no relatório, com os valores.
 */
import { ehTipoAvulso, resolverTipo, type TipoProg } from "./programacao-tipos";

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
export const celula = (v: unknown) => (v == null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v));

function aparaFim(v: unknown[]): string[] {
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
    if (k) o[k] = v[i] ?? "";
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

/** Gabaritos de uma aba: as ordens de campos das linhas incluídas que a cópia do app guardou. */
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

/** Cabeçalho = primeira linha, se tiver a coluna "id". Aba sem ele não é lida da planilha. */
export function cabecalhoDe(valores: unknown[][]): string[] | null {
  const primeira = (valores[0] ?? []).map((c) => texto(c).trim());
  return primeira.includes("id") ? primeira : null;
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
    const cab = cabecalhoDe(p.valores);
    const col = cab ? cab.indexOf("id") : -1;
    for (const crua of cab ? p.valores.slice(1) : p.valores) {
      const v = aparaFim(crua);
      // Linha torta: o id verdadeiro está no rabo, não na coluna "id".
      if (temRabo(v)) ids[conj].add(v[v.length - 3]);
      else if (col >= 0 && pareceId(v[col] ?? "")) ids[conj].add(v[col]);
    }
  }
  return ids;
}

const maisNova = (a: Linha, b: Linha) => texto(a.updated_at) > texto(b.updated_at);

type LinhaLida = { indice: number; pos: number; crua: string[]; leitura: Leitura };

/** Lê as linhas de dados de uma aba com cabeçalho. `pos` = número da linha na planilha (1 = cabeçalho). */
function lerLinhasDaAba(p: AbaDaPlanilha, cabecalho: string[], banco: Abas, ids: IdsConhecidos): LinhaLida[] {
  const ordens = coletarOrdens(banco[p.aba] ?? [], ORDENS_DA_IMPORTACAO_ANTIGA[p.aba]);
  const out: LinhaLida[] = [];
  p.valores.slice(1).forEach((bruta, indice) => {
    const crua = aparaFim(bruta);
    if (crua.length === 0) return;
    out.push({ indice, pos: indice + 2, crua, leitura: lerLinha(crua, cabecalho, ordens, ids) });
  });
  return out;
}

export type RelatorioAba = {
  aba: string;
  /** false = aba sem cabeçalho com "id" (ou vazia): não é lida nem mexida. */
  temCabecalho: boolean;
  naPlanilha: number;
  alinhadas: number;
  realinhadas: number;
  /** Linhas com um id que já apareceu antes na aba (vale a alteração mais recente). */
  repetidas: number;
  naoReconhecidas: { linha: number; valores: string[] }[];
};

export type RelatorioTipos = {
  corrigidos: { ensaio: string; amostra: string; de: string; para: string }[];
  semTipo: { ensaio: string; amostra: string; valor: string }[];
  avulsosRemovidos: string[];
};

export type ModeloDaPlanilha = {
  /** Só as abas com cabeçalho. */
  dados: Abas;
  cabecalhos: Record<string, string[]>;
  /** Linha da planilha do registro que vale, por id. */
  posicao: Record<string, Map<string, number>>;
  /** Todas as linhas com aquele id (repetidas incluídas). */
  posicoes: Record<string, Map<string, number[]>>;
  /** Quantas células cada linha tem hoje (para limpar sobra ao regravar). */
  larguras: Record<string, Map<number, number>>;
  relatorio: RelatorioAba[];
  tipos: RelatorioTipos;
};

/**
 * A planilha lida como as telas devem vê-la: linhas tortas pelo gabarito, id
 * repetido = a alteração mais recente, ensaio de tipo avulso ou etiqueta crua
 * no tipo oficial (a etiqueta vai para `etiqueta`).
 */
export function lerPlanilha(planilha: AbaDaPlanilha[], banco: Abas = {}): ModeloDaPlanilha {
  const ids = idsConhecidos(banco, planilha);
  const m: ModeloDaPlanilha = {
    dados: {},
    cabecalhos: {},
    posicao: {},
    posicoes: {},
    larguras: {},
    relatorio: [],
    tipos: { corrigidos: [], semTipo: [], avulsosRemovidos: [] },
  };
  for (const p of planilha) {
    const cab = cabecalhoDe(p.valores);
    const r: RelatorioAba = {
      aba: p.aba,
      temCabecalho: !!cab,
      naPlanilha: 0,
      alinhadas: 0,
      realinhadas: 0,
      repetidas: 0,
      naoReconhecidas: [],
    };
    m.relatorio.push(r);
    if (!cab) continue;

    const escolhidas = new Map<string, { linha: Linha; pos: number }>();
    const posicoes = new Map<string, number[]>();
    const larguras = new Map<number, number>();
    for (const l of lerLinhasDaAba(p, cab, banco, ids)) {
      r.naPlanilha++;
      larguras.set(l.pos, l.crua.length);
      if (l.leitura.como === "nao_reconhecida") {
        r.naoReconhecidas.push({ linha: l.pos, valores: l.crua });
        continue;
      }
      if (l.leitura.como === "alinhada") r.alinhadas++;
      else r.realinhadas++;
      const { linha } = l.leitura;
      const ps = posicoes.get(linha.id);
      if (ps) {
        ps.push(l.pos);
        r.repetidas++;
      } else {
        posicoes.set(linha.id, [l.pos]);
      }
      const antes = escolhidas.get(linha.id);
      if (!antes || maisNova(linha, antes.linha)) escolhidas.set(linha.id, { linha, pos: l.pos });
    }
    m.cabecalhos[p.aba] = cab;
    m.dados[p.aba] = [...escolhidas.values()].map((x) => x.linha);
    m.posicao[p.aba] = new Map([...escolhidas].map(([id, x]) => [id, x.pos]));
    m.posicoes[p.aba] = posicoes;
    m.larguras[p.aba] = larguras;
  }
  m.tipos = corrigirTipos(m.dados, { removerAvulsos: false });
  return m;
}

/**
 * Ensaio sem tipo válido, ou num tipo avulso ("CD3.IN") que tem tipo oficial
 * equivalente, passa ao tipo oficial — a etiqueta original fica em `etiqueta`.
 * Avulsos repetidos (mesmo nome) viram um só. Com `removerAvulsos`, some da
 * lista o avulso que ficou sem uso E é repetido (de um oficial ou de outro).
 */
export function corrigirTipos(dados: Abas, opcoes: { removerAvulsos: boolean } = { removerAvulsos: true }): RelatorioTipos {
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
  if (!opcoes.removerAvulsos) return rel;

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

/* ---------------------------- Gravar na planilha ---------------------------- */

/** O registro como linha da aba, cada valor na coluna do cabeçalho; campo novo vira coluna nova no fim. */
export function linhaParaPlanilha(
  cabecalho: string[],
  registro: Record<string, unknown>,
): { cabecalho: string[]; valores: string[]; cabecalhoMudou: boolean } {
  const cab = [...cabecalho];
  for (const k of Object.keys(registro)) if (k && !cab.includes(k)) cab.push(k);
  return {
    cabecalho: cab,
    valores: cab.map((k) => celula(registro[k])),
    cabecalhoMudou: cab.length !== cabecalho.length,
  };
}

/* ---------------------------- Arrumar a planilha ---------------------------- */

export type Arrumacao = {
  /** Abas que mudam, já com o conteúdo novo inteiro (cabeçalho + linhas). */
  abas: AbaDaPlanilha[];
  relatorio: RelatorioAba[];
  tipos: RelatorioTipos;
};

/**
 * Endireita a planilha: cada linha torta volta para as colunas do cabeçalho,
 * no MESMO lugar; ensaios de tipo avulso/etiqueta crua passam ao tipo oficial
 * (com a etiqueta na coluna "etiqueta"). Nenhuma linha some: a que o reparo
 * não soube ler, as vazias e as abas sem cabeçalho ficam como estão.
 */
export function arrumarPlanilha(planilha: AbaDaPlanilha[], banco: Abas = {}): Arrumacao {
  const modelo = lerPlanilha(planilha, banco);
  const corrigidos = new Map<string, Linha>();
  const idsCorrigidos = new Set(modelo.tipos.corrigidos.map((c) => c.ensaio));
  for (const e of modelo.dados.Ensaios ?? []) if (idsCorrigidos.has(e.id)) corrigidos.set(e.id, e);
  const ids = idsConhecidos(banco, planilha);

  const abas: AbaDaPlanilha[] = [];
  for (const p of planilha) {
    const cab = cabecalhoDe(p.valores);
    if (!cab) continue;
    const lidas = new Map(lerLinhasDaAba(p, cab, banco, ids).map((l) => [l.indice, l]));
    const registro = (l: LinhaLida | undefined): Linha | null => {
      if (!l || l.leitura.como === "nao_reconhecida") return null;
      const o = l.leitura.linha;
      const c = p.aba === "Ensaios" ? corrigidos.get(o.id) : undefined;
      return c ? { ...o, tipo_ensaio_id: c.tipo_ensaio_id, etiqueta: c.etiqueta ?? o.etiqueta ?? "" } : o;
    };

    const dados = p.valores.slice(1);
    let novoCab = cab;
    for (let i = 0; i < dados.length; i++) {
      const r = registro(lidas.get(i));
      if (r) novoCab = linhaParaPlanilha(novoCab, r).cabecalho;
    }
    const valores = [
      novoCab,
      ...dados.map((crua, i) => {
        const r = registro(lidas.get(i));
        return r ? aparaFim(novoCab.map((k) => celula(r[k]))) : aparaFim(crua);
      }),
    ];
    const antes = JSON.stringify(p.valores.map(aparaFim));
    if (JSON.stringify(valores.map(aparaFim)) !== antes) abas.push({ aba: p.aba, valores });
  }
  return { abas, relatorio: modelo.relatorio, tipos: modelo.tipos };
}
