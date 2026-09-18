/**
 * Painel do Coordenador — só lógica (sem rede, sem tela). Recebe o que o app
 * já tem (Chegada de amostras, Programação, Cronograma, datas acordadas das
 * OS, pendências de laudo) e monta os números do dia, a esteira da operação,
 * os prazos, os alertas (Fase 1), a bancada e os laudos por etapa (Fase 2).
 *
 * Regras decididas pelo usuário em 15/09/2026:
 *  - vale a data acordada na OS quando existir; senão, a do Cronograma (e o
 *    painel mostra quando as duas divergem);
 *  - "parado" = 2 dias úteis ou mais na mesma situação;
 *  - entrega em risco: os ensaios terminam depois da data, ou faltam 3 dias ou
 *    menos com ensaio ainda não iniciado (ou sem programação).
 */
import type { Programacao } from "./programacao-model";
import { splitSetores } from "./schedule-utils";

export const DIAS_UTEIS_PARADO = 2;
export const DIAS_RISCO_NAO_INICIADO = 3;
export const JANELA_PRAZOS = 15;
export const JANELA_ENTREGAS = 7;
/** Dias úteis mostrados na grade de ocupação da bancada. */
export const DIAS_BANCADA = 7;
/** A partir de quantos dias um ensaio conta como "longo" (adensamento, triaxial…). */
export const DURACAO_ENSAIO_LONGO = 3;
/** Até quantos dias atrás uma chegada com OS aberta e sem ensaio vira alerta. */
export const JANELA_CHEGADA_SEM_ENSAIO = 30;

export type Setor = "todos" | "Especiais" | "Convencionais" | "Dosagem";
export const SETORES: Setor[] = ["todos", "Especiais", "Convencionais", "Dosagem"];

/** Para onde um número ou alerta leva. */
export type Destino = { to: string; search?: Record<string, string> };

export type EntradaPainel = {
  /** Hoje, "AAAA-MM-DD". */
  hoje: string;
  setor: Setor;
  cronograma: { os: string; tomador: string; setor: string; dataEntrega: string; dataPostagem: string }[];
  /** Por chave de OS (`chaveOs`). */
  datasAcordadas: Record<string, { data: string | null; arquivada: boolean }>;
  /** `osNumero`: o campo próprio da chegada; sem ele, a OS é procurada no texto do cliente. */
  chegadas: { id: string; osCliente: string; osNumero?: string; dataChegada: string; amostras: number; coluna: string }[];
  /** Última coluna do quadro de chegada ("OS no Sistema"): quem está nela saiu do recebimento. */
  colunaFinal: string;
  amostras: { id: string; os_numero: string; codigo_amostra?: string }[];
  ensaios: { id: string; amostra_id: string; tipo_ensaio_id: string; status: string; created_at?: string; etiqueta?: string }[];
  programacoes: Pick<
    Programacao,
    | "id"
    | "ensaio_id"
    | "status"
    | "data_inicio"
    | "data_fim"
    | "data_inicio_real"
    | "data_fim_real"
    | "duracao_dias"
    | "incluir_fds"
    | "equipamento_id"
    | "tecnico"
  >[];
  tipos: { id: string; nome: string }[];
  equipamentos: { id: string; nome: string }[];
  pendencias: {
    id: string;
    os: string;
    amostra?: string | null;
    ensaio: string;
    status: string;
    created_at: string;
    updated_at?: string | null;
    operador_nome?: string | null;
    digitador_nome?: string | null;
    verificador_nome?: string | null;
  }[];
};

export type Tiles = {
  recebidas: { amostras: number; registros: number };
  aguardandoProgramacao: { total: number; parados: number };
  emAndamento: { total: number; alemDoPrevisto: number };
  entregas7d: { total: number; emRisco: number };
  atrasadas: { total: number; maiorAtraso: number };
  laudosParados: { total: number; maisAntigoDias: number };
};

export type EtapaEsteira = {
  chave: "recebimento" | "programacao" | "bancada" | "laudo" | "entrega";
  nome: string;
  total: number;
  parados: number;
  rotuloTotal: string;
  rotuloParados: string;
  gargalo: boolean;
  destino: Destino;
};

/** Um ensaio da OS, com a programação que ele tem (se tiver) — detalhe da linha de prazo. */
export type ItemOSEnsaio = { id: string; ensaio: string; status: string; tecnico: string | null; inicio: string | null; fim: string | null };

export type LinhaPrazo = {
  os: string;
  chave: string;
  cliente: string;
  /** A data que vale ("AAAA-MM-DD"). */
  entrega: string;
  fonte: "acordada" | "cronograma";
  dataCronograma: string;
  divergente: boolean;
  /** Fim do último ensaio programado; null quando há ensaio sem programação. */
  previsao: string | null;
  falta: string;
  situacao: "atraso" | "risco" | "ok";
  diasAtraso: number;
  motivoRisco: string | null;
  /** Todo ensaio desta OS (ativo ou não) — para o detalhe ao clicar na linha. */
  ensaiosDetalhe: ItemOSEnsaio[];
  /** Laudos em andamento desta OS — para o detalhe ao clicar na linha. */
  laudosDetalhe: LaudoNaEtapa[];
};

export type Alerta = { nivel: "crit" | "warn"; texto: string; detalhe: string; destino: Destino };

export type EstadoDia = "livre" | "ocupado" | "atrasado";

/** Uma programação, para listar o que ocupa um equipamento ou a agenda de um técnico. */
export type ItemBancada = {
  id: string;
  ensaio: string;
  os: string;
  amostra: string;
  equipamento: string;
  tecnico: string | null;
  inicio: string | null;
  fim: string | null;
  status: string;
  atrasado: boolean;
};

export type OcupacaoEquipamento = {
  id: string;
  nome: string;
  /** Um estado por dia de `Bancada.dias`. "atrasado" = ensaio que passou do fim previsto e segue no equipamento. */
  dias: EstadoDia[];
  ensaios: number;
  /** Dia útil em que termina o último ensaio da janela; null quando não há nada adiante. */
  livreEm: string | null;
  comAtraso: boolean;
  /** As programações por trás do número — para o detalhe ao clicar. */
  itens: ItemBancada[];
};
export type CargaTecnico = {
  nome: string;
  emExecucao: number;
  programados: number;
  alemDoPrevisto: number;
  /** As programações por trás dos números — para o detalhe ao clicar. */
  itens: ItemBancada[];
};
export type EnsaioLongo = {
  id: string;
  ensaio: string;
  os: string;
  amostra: string;
  equipamento: string;
  tecnico: string | null;
  dia: number;
  de: number;
  fimPrevisto: string | null;
  atrasado: boolean;
};
export type Bancada = { dias: string[]; equipamentos: OcupacaoEquipamento[]; tecnicos: CargaTecnico[]; longos: EnsaioLongo[] };

export type LaudoNaEtapa = { id: string; ensaio: string; os: string; amostra: string | null; pessoa: string | null; papel: string; idade: number };
export type EtapaDeLaudo = { chave: "digitacao" | "verificacao" | "aprovacao"; nome: string; total: number; parados: number; itens: LaudoNaEtapa[] };

export type ItemRecebida = { id: string; os: string; cliente: string; data: string | null; amostras: number; parado?: boolean };
export type ItemAguardando = { id: string; ensaio: string; os: string; amostra: string; criadoEm: string | null; diasParado: number };
export type ItemEmAndamento = {
  id: string; ensaio: string; os: string; amostra: string; equipamento: string; tecnico: string | null;
  fimPrevisto: string | null; alemDoPrevisto: boolean;
};

/** As listas por trás dos números dos tiles/esteira — para abrir o detalhe ao clicar. */
export type Detalhes = {
  recebidas: ItemRecebida[];
  /** Tudo que ainda está no fluxo de chegada (etapa "Recebimento" da esteira) — não só os últimos 7 dias. */
  noRecebimento: ItemRecebida[];
  aguardandoProgramacao: ItemAguardando[];
  emAndamento: ItemEmAndamento[];
  laudosParados: LaudoNaEtapa[];
};

export type PainelModelo = {
  tiles: Tiles;
  esteira: EtapaEsteira[];
  prazos: LinhaPrazo[];
  alertas: Alerta[];
  bancada: Bancada;
  laudos: EtapaDeLaudo[];
  detalhes: Detalhes;
};

/* ------------------------------ Datas e OS ------------------------------ */

const DIA = 86_400_000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const somaDias = (iso: string, n: number) => new Date(utc(iso) + n * DIA).toISOString().slice(0, 10);
export const diasEntre = (de: string, ate: string) => Math.round((utc(ate) - utc(de)) / DIA);
const ehDiaUtil = (iso: string) => {
  const w = new Date(utc(iso)).getUTCDay();
  return w !== 0 && w !== 6;
};

/** Dias úteis (seg–sex) depois de `de`, até `ate` inclusive. Sexta → terça = 2. */
export function diasUteisEntre(de: string, ate: string): number {
  let n = 0;
  for (let t = utc(de) + DIA; t <= utc(ate); t += DIA) {
    const w = new Date(t).getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

/** Os próximos `n` dias úteis a partir de hoje (hoje entra se for dia útil). */
export function proximosDiasUteis(hoje: string, n: number): string[] {
  const out: string[] = [];
  for (let d = hoje; out.length < n; d = somaDias(d, 1)) if (ehDiaUtil(d)) out.push(d);
  return out;
}

function proximoDiaUtil(iso: string): string {
  let d = somaDias(iso, 1);
  while (!ehDiaUtil(d)) d = somaDias(d, 1);
  return d;
}

/** "15/09/2026", "2026-09-15" ou um instante ISO → "2026-09-15"; o resto → null. */
export function paraIso(s: string | null | undefined): string | null {
  const t = String(s ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  return `${y}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Chave de OS para cruzar fontes: "OS 017588-26" e "17588-26" viram "17588-26". */
export function chaveOs(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/^OS[\s.:º°#-]*/, "")
    .replace(/\s+/g, "")
    .replace(/^0+/, "");
}

/** A OS dentro do texto livre da chegada ("Alfa Geotecnia / OS 1029", "17588-26 EPR"). */
export function osDaChegada(texto: string): string | null {
  const m = texto.match(/(\d{3,6}-\d{2})(?!\d)/);
  if (m) return chaveOs(m[1]);
  const m2 = texto.match(/\bOS\s*[:nº°#.-]*\s*(\d{3,6})(?!\d)/i);
  return m2 ? chaveOs(m2[1]) : null;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/* -------------------------------- Painel -------------------------------- */

const ETAPAS_DE_LAUDO = new Set(["pendente", "em_digitacao", "digitado", "verificado"]);

/**
 * Mapas e filtros de escopo (setor, ensaio ativo, rótulo de programação) —
 * usado por `montarPainel` e por quem monta um detalhe à parte (ex.: a
 * bancada com uma janela de dias diferente), pra não recalcular tudo de novo
 * nem divergir do que o painel principal já decidiu.
 */
function prepararEscopo(e: EntradaPainel) {
  // Setor de cada OS, pelo Cronograma (uma OS pode estar em mais de um).
  const setoresDaOs = new Map<string, Set<string>>();
  for (const r of e.cronograma) {
    const k = chaveOs(r.os);
    if (!k) continue;
    const s = setoresDaOs.get(k) ?? new Set<string>();
    for (const x of splitSetores(r.setor)) s.add(x);
    setoresDaOs.set(k, s);
  }
  const noEscopo = (k: string | null | undefined) =>
    e.setor === "todos" || (!!k && !!setoresDaOs.get(k)?.has(e.setor));

  const osDaAmostra = new Map(e.amostras.map((a) => [a.id, chaveOs(a.os_numero)]));
  const amostraPorId = new Map(e.amostras.map((a) => [a.id, a]));
  const nomeDoTipo = new Map(e.tipos.map((t) => [t.id, t.nome]));
  const nomeDoEquipamento = new Map(e.equipamentos.map((q) => [q.id, q.nome]));
  const progDoEnsaio = new Map(e.programacoes.map((p) => [p.ensaio_id, p]));
  const ensaioPorId = new Map(e.ensaios.map((x) => [x.id, x]));
  const nomeEnsaio = (en: EntradaPainel["ensaios"][number]) => nomeDoTipo.get(en.tipo_ensaio_id) || en.etiqueta || "Ensaio";
  const ativo = (en: EntradaPainel["ensaios"][number]) => {
    const st = (en.status || "").toLowerCase();
    if (st === "concluido" || st === "cancelado") return false;
    return progDoEnsaio.get(en.id)?.status !== "concluido";
  };
  const ensaiosNoEscopo = e.ensaios.filter((en) => noEscopo(osDaAmostra.get(en.amostra_id)));
  const progNoEscopo = (p: EntradaPainel["programacoes"][number]) => {
    const en = ensaioPorId.get(p.ensaio_id);
    return en ? noEscopo(osDaAmostra.get(en.amostra_id)) : e.setor === "todos";
  };
  /** Ensaio, OS e amostra de uma programação, para rotular listas. */
  const rotuloDaProg = (p: EntradaPainel["programacoes"][number]) => {
    const en = ensaioPorId.get(p.ensaio_id);
    const am = en ? amostraPorId.get(en.amostra_id) : undefined;
    return { ensaio: en ? nomeEnsaio(en) : "Ensaio", os: am?.os_numero ?? "—", amostra: am?.codigo_amostra ?? "—" };
  };
  return {
    noEscopo, osDaAmostra, amostraPorId, nomeDoTipo, nomeDoEquipamento, progDoEnsaio, ensaioPorId,
    nomeEnsaio, ativo, ensaiosNoEscopo, progNoEscopo, rotuloDaProg,
  };
}

export function montarPainel(e: EntradaPainel): PainelModelo {
  const { hoje } = e;
  const {
    noEscopo, osDaAmostra, amostraPorId, nomeDoEquipamento, progDoEnsaio, ensaioPorId,
    nomeEnsaio, ativo, ensaiosNoEscopo, progNoEscopo, rotuloDaProg,
  } = prepararEscopo(e);

  // 1) Recebimento — o próprio quadro de chegada tem o fluxo (Registro → … → OS no Sistema).
  const chegadas = e.chegadas
    .map((c) => ({ ...c, iso: paraIso(c.dataChegada), os: c.osNumero?.trim() ? chaveOs(c.osNumero) : osDaChegada(c.osCliente) }))
    .filter((c) => e.setor === "todos" || noEscopo(c.os));
  const desde = somaDias(hoje, -(JANELA_ENTREGAS - 1));
  const recentes = chegadas.filter((c) => c.iso && c.iso >= desde && c.iso <= hoje);
  const noRecebimento = chegadas.filter((c) => c.coluna !== e.colunaFinal);
  const recebParados = noRecebimento
    .filter((c) => c.iso && diasUteisEntre(c.iso, hoje) >= DIAS_UTEIS_PARADO)
    .sort((a, b) => (a.iso ?? "").localeCompare(b.iso ?? ""));
  // OS já aberta no quadro, mas nenhum ensaio dela chegou à Programação.
  const osComEnsaio = new Set(e.ensaios.map((en) => osDaAmostra.get(en.amostra_id)).filter(Boolean));
  const desdeSemEnsaio = somaDias(hoje, -JANELA_CHEGADA_SEM_ENSAIO);
  const chegadasSemEnsaio = chegadas
    .filter(
      (c) =>
        c.coluna === e.colunaFinal &&
        !!c.os &&
        !osComEnsaio.has(c.os) &&
        !!c.iso &&
        c.iso >= desdeSemEnsaio &&
        diasUteisEntre(c.iso, hoje) >= DIAS_UTEIS_PARADO,
    )
    .sort((a, b) => (a.iso ?? "").localeCompare(b.iso ?? ""));

  // 2) Programação — ensaio ativo sem data no Gantt.
  const aguardando = ensaiosNoEscopo.filter((en) => ativo(en) && !progDoEnsaio.has(en.id));
  const aguardandoParados = aguardando
    .filter((en) => {
      const iso = paraIso(en.created_at);
      return !!iso && diasUteisEntre(iso, hoje) >= DIAS_UTEIS_PARADO;
    })
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));

  // 3) Bancada — em execução, e as que passaram do fim previsto.
  const progsAtivas = e.programacoes.filter((p) => p.status !== "concluido" && progNoEscopo(p));
  const emExecucao = progsAtivas.filter((p) => p.status === "em_execucao");
  const alemDoPrevisto = emExecucao
    .filter((p) => !!p.data_fim && p.data_fim < hoje)
    .sort((a, b) => (a.data_fim ?? "").localeCompare(b.data_fim ?? ""));

  // 4) Laudos — da pendência à aprovação; "parado" pela última alteração.
  const laudos = e.pendencias.filter((p) => ETAPAS_DE_LAUDO.has(p.status) && noEscopo(chaveOs(p.os)));
  const idadeLaudo = (p: EntradaPainel["pendencias"][number]) => {
    const iso = paraIso(p.updated_at || p.created_at);
    return iso ? diasUteisEntre(iso, hoje) : 0;
  };
  const laudosParados = laudos
    .filter((p) => idadeLaudo(p) >= DIAS_UTEIS_PARADO)
    .sort((a, b) => idadeLaudo(b) - idadeLaudo(a));

  // 5) Prazos — uma linha por OS com entrega em aberto (sem data de postagem) até 15 dias.
  const abertas = new Map<string, { os: string; cliente: string; dataCronograma: string }>();
  for (const r of e.cronograma) {
    if ((r.dataPostagem ?? "").trim()) continue;
    const k = chaveOs(r.os);
    const iso = paraIso(r.dataEntrega);
    if (!k || !iso || !noEscopo(k)) continue;
    const atual = abertas.get(k);
    if (!atual || iso < atual.dataCronograma) {
      abertas.set(k, { os: r.os.trim(), cliente: r.tomador || atual?.cliente || "", dataCronograma: iso });
    }
  }
  const limite = somaDias(hoje, JANELA_PRAZOS);
  const prazos: LinhaPrazo[] = [];
  for (const [k, o] of abertas) {
    const hub = e.datasAcordadas[k];
    if (hub?.arquivada) continue;
    const acordada = paraIso(hub?.data ?? null);
    const entrega = acordada ?? o.dataCronograma;
    if (entrega > limite) continue;

    const daOs = ensaiosNoEscopo.filter((en) => osDaAmostra.get(en.amostra_id) === k);
    const ativos = daOs.filter(ativo);
    const semProg = ativos.filter((en) => !progDoEnsaio.has(en.id)).length;
    const progs = ativos.map((en) => progDoEnsaio.get(en.id)).filter((p): p is NonNullable<typeof p> => !!p);
    const emBancada = progs.filter((p) => p.status === "em_execucao").length;
    const naoIniciados = progs.length - emBancada;
    const fins = progs.map((p) => p.data_fim).filter((d): d is string => !!d).sort();
    const ultimoFim = fins.length ? fins[fins.length - 1] : null;
    const laudosDaOsItens = laudos.filter((p) => chaveOs(p.os) === k);
    const laudosDaOs = laudosDaOsItens.length;

    const partes: string[] = [];
    if (emBancada) partes.push(`${emBancada} em bancada`);
    if (naoIniciados) partes.push(`${naoIniciados} programado${naoIniciados === 1 ? "" : "s"}`);
    if (semProg) partes.push(`${semProg} sem programação`);
    if (laudosDaOs) partes.push(plural(laudosDaOs, "laudo em andamento", "laudos em andamento"));
    const falta = partes.join(" · ") || (daOs.length ? "ensaios concluídos" : "sem ensaios na programação");

    let situacao: LinhaPrazo["situacao"] = "ok";
    let diasAtraso = 0;
    let motivoRisco: string | null = null;
    if (entrega < hoje) {
      situacao = "atraso";
      diasAtraso = diasEntre(entrega, hoje);
    } else if (ultimoFim && ultimoFim > entrega) {
      situacao = "risco";
      motivoRisco = `ensaios terminam ${br(ultimoFim)}`;
    } else if (diasEntre(hoje, entrega) <= DIAS_RISCO_NAO_INICIADO && (semProg > 0 || naoIniciados > 0)) {
      situacao = "risco";
      motivoRisco = semProg > 0 ? "ensaio sem programação" : "ensaio não iniciado";
    }

    const ensaiosDetalhe: ItemOSEnsaio[] = daOs.map((en) => {
      const p = progDoEnsaio.get(en.id);
      return {
        id: en.id,
        ensaio: nomeEnsaio(en),
        status: p?.status ?? (ativo(en) ? "sem_programacao" : en.status),
        tecnico: p?.tecnico ?? null,
        inicio: p?.data_inicio ?? null,
        fim: p?.data_fim ?? null,
      };
    });
    const laudosDetalhe: LaudoNaEtapa[] = laudosDaOsItens.map((p) => ({
      id: p.id,
      ensaio: p.ensaio,
      os: p.os,
      amostra: p.amostra ?? null,
      pessoa: p.verificador_nome || p.digitador_nome || p.operador_nome || null,
      papel: p.status === "verificado" ? "verificado por" : p.status === "digitado" ? "enviado por" : p.digitador_nome ? "com" : "operador",
      idade: idadeLaudo(p),
    }));

    prazos.push({
      os: o.os,
      chave: k,
      cliente: o.cliente,
      entrega,
      fonte: acordada ? "acordada" : "cronograma",
      dataCronograma: o.dataCronograma,
      divergente: !!acordada && acordada !== o.dataCronograma,
      previsao: semProg > 0 ? null : ultimoFim,
      falta,
      situacao,
      diasAtraso,
      motivoRisco,
      ensaiosDetalhe,
      laudosDetalhe,
    });
  }
  const ordem = { atraso: 0, risco: 1, ok: 2 } as const;
  prazos.sort(
    (a, b) => ordem[a.situacao] - ordem[b.situacao] || b.diasAtraso - a.diasAtraso || a.entrega.localeCompare(b.entrega),
  );
  const atrasadas = prazos.filter((p) => p.situacao === "atraso");
  const proximas = prazos.filter((p) => p.situacao !== "atraso" && p.entrega <= somaDias(hoje, JANELA_ENTREGAS));

  // Números do dia
  const tiles: Tiles = {
    recebidas: { amostras: recentes.reduce((s, c) => s + (c.amostras || 1), 0), registros: recentes.length },
    aguardandoProgramacao: { total: aguardando.length, parados: aguardandoParados.length },
    emAndamento: { total: emExecucao.length, alemDoPrevisto: alemDoPrevisto.length },
    entregas7d: { total: proximas.length, emRisco: proximas.filter((p) => p.situacao === "risco").length },
    atrasadas: { total: atrasadas.length, maiorAtraso: atrasadas[0]?.diasAtraso ?? 0 },
    laudosParados: { total: laudosParados.length, maisAntigoDias: laudosParados[0] ? idadeLaudo(laudosParados[0]) : 0 },
  };

  // As listas por trás dos tiles/esteira — pro detalhe ao clicar.
  const detalhes: Detalhes = {
    recebidas: recentes.map((c) => ({
      id: c.id, os: c.osNumero?.trim() || c.os || "—", cliente: c.osCliente, data: c.iso, amostras: c.amostras || 1,
    })),
    noRecebimento: noRecebimento
      .map((c) => ({
        id: c.id, os: c.osNumero?.trim() || c.os || "—", cliente: c.osCliente, data: c.iso, amostras: c.amostras || 1,
        parado: !!c.iso && diasUteisEntre(c.iso, hoje) >= DIAS_UTEIS_PARADO,
      }))
      .sort((a, b) => Number(b.parado) - Number(a.parado) || (a.data ?? "").localeCompare(b.data ?? "")),
    aguardandoProgramacao: aguardando
      .map((en): ItemAguardando => {
        const am = amostraPorId.get(en.amostra_id);
        const iso = paraIso(en.created_at);
        return {
          id: en.id, ensaio: nomeEnsaio(en), os: am?.os_numero ?? "—", amostra: am?.codigo_amostra ?? "—",
          criadoEm: iso, diasParado: iso ? diasUteisEntre(iso, hoje) : 0,
        };
      })
      .sort((a, b) => b.diasParado - a.diasParado),
    emAndamento: emExecucao
      .map((p): ItemEmAndamento => {
        const r = rotuloDaProg(p);
        return {
          id: p.id, ensaio: r.ensaio, os: r.os, amostra: r.amostra,
          equipamento: (p.equipamento_id && nomeDoEquipamento.get(p.equipamento_id)) || "Sem equipamento",
          tecnico: p.tecnico || null,
          fimPrevisto: p.data_fim ?? null,
          alemDoPrevisto: !!p.data_fim && p.data_fim < hoje,
        };
      })
      .sort((a, b) => Number(b.alemDoPrevisto) - Number(a.alemDoPrevisto)),
    laudosParados: laudosParados.map((p) => ({
      id: p.id,
      ensaio: p.ensaio,
      os: p.os,
      amostra: p.amostra ?? null,
      pessoa: p.verificador_nome || p.digitador_nome || p.operador_nome || null,
      papel: p.status === "verificado" ? "verificado por" : p.status === "digitado" ? "enviado por" : p.digitador_nome ? "com" : "operador",
      idade: idadeLaudo(p),
    })),
  };

  // Esteira: cada etapa com o que está nela agora e quanto está parado; o gargalo é a maior proporção parada.
  const esteira: EtapaEsteira[] = [
    { chave: "recebimento", nome: "Recebimento", total: noRecebimento.length, parados: recebParados.length, rotuloTotal: "registros no fluxo de chegada", rotuloParados: "parados há 2+ dias úteis", gargalo: false, destino: { to: "/chegada-amostras" } },
    { chave: "programacao", nome: "Programação", total: aguardando.length, parados: aguardandoParados.length, rotuloTotal: "ensaios sem data no Gantt", rotuloParados: "esperando há 2+ dias úteis", gargalo: false, destino: { to: "/programacao/gantt" } },
    { chave: "bancada", nome: "Bancada", total: emExecucao.length, parados: alemDoPrevisto.length, rotuloTotal: "ensaios em execução", rotuloParados: "além do fim previsto", gargalo: false, destino: { to: "/relatorio/digitalizacao/fila" } },
    { chave: "laudo", nome: "Laudo", total: laudos.length, parados: laudosParados.length, rotuloTotal: "laudos em andamento", rotuloParados: "parados há 2+ dias úteis", gargalo: false, destino: { to: "/relatorio/pendentes", search: { tab: "fluxo-relatorios" } } },
    { chave: "entrega", nome: "Entrega", total: proximas.length + atrasadas.length, parados: atrasadas.length, rotuloTotal: "vencem em 7 dias ou atrasadas", rotuloParados: "atrasadas", gargalo: false, destino: { to: "/entregas" } },
  ];
  let pior: EtapaEsteira | null = null;
  for (const et of esteira) {
    if (!et.parados || !et.total) continue;
    const r = et.parados / et.total;
    if (!pior || r > pior.parados / pior.total || (r === pior.parados / pior.total && et.parados > pior.parados)) pior = et;
  }
  if (pior) pior.gargalo = true;

  // Alertas: o que pede ação hoje, o mais grave primeiro.
  const alertas: Alerta[] = [];
  const gantt: Destino = { to: "/programacao/gantt" };
  for (const p of prazos.filter((x) => x.situacao === "risco" && x.motivoRisco?.startsWith("ensaios terminam"))) {
    alertas.push({
      nivel: "crit",
      texto: `OS ${p.os}: ${p.motivoRisco}, entrega em ${br(p.entrega)}`,
      detalhe: `${p.cliente || "Cliente"} · renegociar a data ou priorizar na bancada`,
      destino: gantt,
    });
  }
  if (atrasadas.length) {
    const m = atrasadas[0];
    alertas.push({
      nivel: "crit",
      texto: plural(atrasadas.length, "entrega atrasada", "entregas atrasadas"),
      detalhe: `Maior atraso: OS ${m.os}${m.cliente ? ` (${m.cliente})` : ""}, ${m.diasAtraso} dias`,
      destino: { to: "/entregas" },
    });
  }
  for (const p of prazos.filter((x) => x.situacao === "risco" && !x.motivoRisco?.startsWith("ensaios terminam")).slice(0, 3)) {
    alertas.push({
      nivel: "warn",
      texto: `OS ${p.os}: entrega em ${br(p.entrega)} com ${p.motivoRisco}`,
      detalhe: p.cliente || p.falta,
      destino: gantt,
    });
  }
  if (recebParados.length) {
    const c = recebParados[0];
    alertas.push({
      nivel: "warn",
      texto: `${plural(recebParados.length, "registro de chegada parado", "registros de chegada parados")} no recebimento`,
      detalhe: `Mais antigo: ${c.iso ? br(c.iso) : c.dataChegada} · ${c.osCliente || "sem cliente"}`,
      destino: { to: "/chegada-amostras" },
    });
  }
  if (chegadasSemEnsaio.length) {
    const c = chegadasSemEnsaio[0];
    alertas.push({
      nivel: "warn",
      texto: `${plural(chegadasSemEnsaio.length, "chegada com OS aberta", "chegadas com OS aberta")} e nenhum ensaio na programação`,
      detalhe: `Mais antiga: ${c.iso ? br(c.iso) : c.dataChegada} · OS ${c.osNumero?.trim() || c.os} · ${c.osCliente || "sem cliente"}`,
      destino: { to: "/programacao/central" },
    });
  }
  if (aguardandoParados.length) {
    const en = aguardandoParados[0];
    const am = amostraPorId.get(en.amostra_id);
    alertas.push({
      nivel: "warn",
      texto: `${plural(aguardandoParados.length, "ensaio sem programação", "ensaios sem programação")} há 2+ dias úteis`,
      detalhe: `Mais antigo: ${nomeEnsaio(en)} · OS ${am?.os_numero ?? "—"} · ${am?.codigo_amostra ?? ""}`.trim(),
      destino: gantt,
    });
  }
  if (alemDoPrevisto.length) {
    const p = alemDoPrevisto[0];
    const r = rotuloDaProg(p);
    alertas.push({
      nivel: "warn",
      texto: `${plural(alemDoPrevisto.length, "ensaio passou", "ensaios passaram")} do fim previsto na bancada`,
      detalhe: `Mais atrasado: ${r.ensaio} · OS ${r.os} · previsto ${br(p.data_fim!)}${p.tecnico ? ` · ${p.tecnico}` : ""}`,
      destino: { to: "/relatorio/digitalizacao/fila" },
    });
  }
  if (laudosParados.length) {
    const p = laudosParados[0];
    alertas.push({
      nivel: "warn",
      texto: `${plural(laudosParados.length, "laudo parado", "laudos parados")} há 2+ dias úteis`,
      detalhe: `Mais antigo: ${p.ensaio} · OS ${p.os} · ${idadeLaudo(p)} dias úteis na mesma etapa`,
      destino: { to: "/relatorio/pendentes", search: { tab: "fluxo-relatorios" } },
    });
  }
  for (const p of prazos.filter((x) => x.divergente).slice(0, 3)) {
    alertas.push({
      nivel: "warn",
      texto: `OS ${p.os}: data acordada ${br(p.entrega)} diferente do Cronograma (${br(p.dataCronograma)})`,
      detalhe: "Vale a data acordada — atualize o Cronograma se ela mudou",
      destino: { to: "/entregas" },
    });
  }

  return {
    tiles,
    esteira,
    prazos,
    alertas,
    bancada: montarBancada(e, hoje, progsAtivas, nomeDoEquipamento, rotuloDaProg, DIAS_BANCADA),
    laudos: montarLaudos(laudos, idadeLaudo),
    detalhes,
  };
}

/**
 * A bancada com uma janela de dias à escolha (o detalhe "ver mais datas" ao
 * clicar na grade de ocupação) — reaproveita o mesmo escopo/filtro do painel
 * principal, sem precisar buscar nada de novo (tudo já está em `entrada`).
 */
export function montarBancadaComJanela(e: EntradaPainel, dias: number): Bancada {
  const { nomeDoEquipamento, progNoEscopo, rotuloDaProg } = prepararEscopo(e);
  const progsAtivas = e.programacoes.filter((p) => p.status !== "concluido" && progNoEscopo(p));
  return montarBancada(e, e.hoje, progsAtivas, nomeDoEquipamento, rotuloDaProg, dias);
}

/* ------------------------------ Fase 2: bancada ------------------------------ */

function montarBancada(
  e: EntradaPainel,
  hoje: string,
  progsAtivas: EntradaPainel["programacoes"],
  nomeDoEquipamento: Map<string, string>,
  rotuloDaProg: (p: EntradaPainel["programacoes"][number]) => { ensaio: string; os: string; amostra: string },
  janelaDias: number = DIAS_BANCADA,
): Bancada {
  const dias = proximosDiasUteis(hoje, janelaDias);
  const fimJanela = dias[dias.length - 1];
  const itemDe = (p: EntradaPainel["programacoes"][number], equipamentoNome: string): ItemBancada => {
    const r = rotuloDaProg(p);
    return {
      id: p.id, ...r, equipamento: equipamentoNome, tecnico: p.tecnico || null,
      inicio: p.data_inicio ?? null, fim: p.data_fim ?? null, status: p.status,
      atrasado: !!p.data_fim && p.data_fim < hoje && p.status === "em_execucao",
    };
  };

  // Ocupação: cada programação ocupa o equipamento do início ao fim previsto.
  const porEquipamento = new Map<string, EntradaPainel["programacoes"]>();
  for (const p of progsAtivas) {
    const k = p.equipamento_id || "__sem__";
    porEquipamento.set(k, [...(porEquipamento.get(k) ?? []), p]);
  }
  const ids =
    e.setor === "todos"
      ? [...new Set([...e.equipamentos.map((q) => q.id), ...porEquipamento.keys()])]
      : [...porEquipamento.keys()];
  const equipamentos = ids
    .map((id): OcupacaoEquipamento => {
      const nome = id === "__sem__" ? "Sem equipamento" : nomeDoEquipamento.get(id) ?? "Equipamento removido";
      const estados: EstadoDia[] = dias.map(() => "livre");
      let ensaios = 0;
      let comAtraso = false;
      let ultimoFim: string | null = null;
      const itens: ItemBancada[] = [];
      for (const p of porEquipamento.get(id) ?? []) {
        const ini = p.data_inicio;
        const fim = p.data_fim;
        if (!ini || !fim) continue;
        // Passou do fim previsto e segue na bancada: o equipamento está preso hoje.
        if (p.status === "em_execucao" && fim < hoje) {
          estados[0] = "atrasado";
          comAtraso = true;
          ensaios++;
          itens.push(itemDe(p, nome));
          continue;
        }
        if (ini > fimJanela || fim < dias[0]) continue;
        ensaios++;
        itens.push(itemDe(p, nome));
        dias.forEach((d, i) => {
          if (ini <= d && d <= fim && estados[i] === "livre") estados[i] = "ocupado";
        });
        if (!ultimoFim || fim > ultimoFim) ultimoFim = fim;
      }
      itens.sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""));
      return {
        id,
        nome,
        dias: estados,
        ensaios,
        livreEm: ultimoFim ? proximoDiaUtil(ultimoFim) : null,
        comAtraso,
        itens,
      };
    })
    .filter((q) => q.id !== "__sem__" || q.ensaios > 0)
    .sort((a, b) => {
      const ocupA = a.dias.filter((x) => x !== "livre").length;
      const ocupB = b.dias.filter((x) => x !== "livre").length;
      return ocupB - ocupA || a.nome.localeCompare(b.nome);
    });

  // Carga por técnico (pelo nome gravado na programação).
  const carga = new Map<string, CargaTecnico>();
  for (const p of progsAtivas) {
    const nome = (p.tecnico ?? "").trim() || "Sem técnico";
    const c = carga.get(nome) ?? { nome, emExecucao: 0, programados: 0, alemDoPrevisto: 0, itens: [] };
    const equipamentoNome = (p.equipamento_id && nomeDoEquipamento.get(p.equipamento_id)) || "Sem equipamento";
    if (p.status === "em_execucao") {
      c.emExecucao++;
      if (p.data_fim && p.data_fim < hoje) c.alemDoPrevisto++;
      c.itens.push(itemDe(p, equipamentoNome));
    } else if (p.data_inicio && p.data_inicio <= fimJanela) {
      c.programados++;
      c.itens.push(itemDe(p, equipamentoNome));
    }
    carga.set(nome, c);
  }
  const tecnicos = [...carga.values()]
    .map((c) => ({ ...c, itens: c.itens.sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? "")) }))
    .filter((c) => c.emExecucao + c.programados > 0)
    .sort((a, b) =>
      a.nome === "Sem técnico" ? 1 : b.nome === "Sem técnico" ? -1 : b.emExecucao + b.programados - (a.emExecucao + a.programados) || a.nome.localeCompare(b.nome),
    );

  // Ensaios longos em curso: em que dia estão, de quantos.
  const longos = progsAtivas
    .filter((p) => p.status === "em_execucao" && (p.duracao_dias ?? 0) >= DURACAO_ENSAIO_LONGO)
    .map((p): EnsaioLongo | null => {
      const ini = p.data_inicio_real || p.data_inicio;
      if (!ini) return null;
      const r = rotuloDaProg(p);
      return {
        id: p.id,
        ...r,
        equipamento: (p.equipamento_id && nomeDoEquipamento.get(p.equipamento_id)) || "Sem equipamento",
        tecnico: p.tecnico || null,
        dia: (p.incluir_fds ? diasEntre(ini, hoje) : diasUteisEntre(ini, hoje)) + 1,
        de: Math.ceil(p.duracao_dias),
        fimPrevisto: p.data_fim,
        atrasado: !!p.data_fim && p.data_fim < hoje,
      };
    })
    .filter((x): x is EnsaioLongo => !!x)
    .sort((a, b) => b.dia / b.de - a.dia / a.de);

  return { dias, equipamentos, tecnicos, longos };
}

/* ------------------------------ Fase 2: laudos ------------------------------ */

function montarLaudos(
  laudos: EntradaPainel["pendencias"],
  idadeLaudo: (p: EntradaPainel["pendencias"][number]) => number,
): EtapaDeLaudo[] {
  type P = EntradaPainel["pendencias"][number];
  const etapas: { chave: EtapaDeLaudo["chave"]; nome: string; status: string[]; pessoa: (p: P) => string | null; papel: (p: P) => string }[] = [
    {
      chave: "digitacao",
      nome: "Em digitação",
      status: ["pendente", "em_digitacao"],
      pessoa: (p) => p.digitador_nome || p.operador_nome || null,
      papel: (p) => (p.digitador_nome ? "com" : "operador"),
    },
    { chave: "verificacao", nome: "Aguardando verificação", status: ["digitado"], pessoa: (p) => p.digitador_nome || null, papel: () => "enviado por" },
    { chave: "aprovacao", nome: "Aguardando aprovação", status: ["verificado"], pessoa: (p) => p.verificador_nome || null, papel: () => "verificado por" },
  ];
  return etapas.map((et) => {
    const lista = laudos
      .filter((p) => et.status.includes(p.status))
      .map((p) => ({
        id: p.id,
        ensaio: p.ensaio,
        os: p.os,
        amostra: p.amostra ?? null,
        pessoa: et.pessoa(p),
        papel: et.papel(p),
        idade: idadeLaudo(p),
      }))
      .sort((a, b) => b.idade - a.idade);
    return {
      chave: et.chave,
      nome: et.nome,
      total: lista.length,
      parados: lista.filter((x) => x.idade >= DIAS_UTEIS_PARADO).length,
      // Lista completa (não corta mais em 5) — quem exibe o resumo compacto corta na tela;
      // o detalhe ao clicar precisa de todos.
      itens: lista,
    };
  });
}

/* ------------------- Fontes → entrada (tela e servidor) ------------------- */

type LinhaDaFonte = Record<string, string>;

/** As fontes como chegam das consultas da tela e das leituras do servidor (agendamento). */
export type FontesDoPainel = {
  hoje: string;
  setor: Setor;
  cronograma: EntradaPainel["cronograma"];
  /** Por número da OS como gravado. */
  datasAcordadas: Record<string, { osNumero: string; data: string | null; arquivada: boolean }>;
  chegada: { columns?: { id: string }[]; tasks?: Record<string, unknown[]> } | null | undefined;
  amostras: LinhaDaFonte[];
  ensaios: LinhaDaFonte[];
  /** Já convertidas por parseProgramacaoRow. */
  programacoes: EntradaPainel["programacoes"];
  tipos: LinhaDaFonte[];
  equipamentos: LinhaDaFonte[];
  pendencias: EntradaPainel["pendencias"];
};

export function entradaDasFontes(f: FontesDoPainel): EntradaPainel {
  const chegadas = Object.entries(f.chegada?.tasks ?? {}).flatMap(([coluna, lista]) =>
    (lista ?? []).map((bruto) => {
      const t = bruto as Record<string, unknown>;
      return {
        id: String(t.id ?? ""),
        osCliente: String(t.osCliente ?? ""),
        osNumero: t.osNumero ? String(t.osNumero) : undefined,
        dataChegada: String(t.dataChegada ?? ""),
        amostras: Array.isArray(t.amostras) && t.amostras.length ? t.amostras.length : 1,
        coluna,
      };
    }),
  );
  return {
    hoje: f.hoje,
    setor: f.setor,
    cronograma: f.cronograma,
    datasAcordadas: Object.fromEntries(
      Object.values(f.datasAcordadas).map((d) => [chaveOs(d.osNumero), { data: d.data, arquivada: d.arquivada }]),
    ),
    chegadas,
    colunaFinal: f.chegada?.columns?.at(-1)?.id ?? "os-sistema",
    amostras: f.amostras.map((r) => ({ id: r.id, os_numero: r.os_numero ?? "", codigo_amostra: r.codigo_amostra })),
    ensaios: f.ensaios.map((r) => ({
      id: r.id,
      amostra_id: r.amostra_id ?? "",
      tipo_ensaio_id: r.tipo_ensaio_id ?? "",
      status: r.status ?? "",
      created_at: r.created_at,
      etiqueta: r.etiqueta,
    })),
    programacoes: f.programacoes,
    tipos: f.tipos.map((r) => ({ id: r.id, nome: r.nome ?? "" })),
    equipamentos: f.equipamentos.map((r) => ({ id: r.id, nome: r.nome ?? "" })),
    pendencias: f.pendencias,
  };
}
