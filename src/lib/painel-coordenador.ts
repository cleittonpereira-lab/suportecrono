/**
 * Painel do Coordenador — só lógica (sem rede, sem tela). Recebe o que o app
 * já tem (Chegada de amostras, Programação, Cronograma, datas acordadas das
 * OS, pendências de laudo) e monta os números do dia, a esteira da operação,
 * os prazos e os alertas.
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
  chegadas: { id: string; osCliente: string; dataChegada: string; amostras: number; coluna: string }[];
  /** Última coluna do quadro de chegada ("OS no Sistema"): quem está nela saiu do recebimento. */
  colunaFinal: string;
  amostras: { id: string; os_numero: string; codigo_amostra?: string }[];
  ensaios: { id: string; amostra_id: string; tipo_ensaio_id: string; status: string; created_at?: string; etiqueta?: string }[];
  programacoes: Pick<Programacao, "id" | "ensaio_id" | "status" | "data_fim" | "tecnico">[];
  tipos: { id: string; nome: string }[];
  pendencias: { id: string; os: string; amostra?: string | null; ensaio: string; status: string; created_at: string; updated_at?: string | null }[];
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
};

export type Alerta = { nivel: "crit" | "warn"; texto: string; detalhe: string; destino: Destino };

export type PainelModelo = { tiles: Tiles; esteira: EtapaEsteira[]; prazos: LinhaPrazo[]; alertas: Alerta[] };

/* ------------------------------ Datas e OS ------------------------------ */

const DIA = 86_400_000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const somaDias = (iso: string, n: number) => new Date(utc(iso) + n * DIA).toISOString().slice(0, 10);
export const diasEntre = (de: string, ate: string) => Math.round((utc(ate) - utc(de)) / DIA);

/** Dias úteis (seg–sex) depois de `de`, até `ate` inclusive. Sexta → terça = 2. */
export function diasUteisEntre(de: string, ate: string): number {
  let n = 0;
  for (let t = utc(de) + DIA; t <= utc(ate); t += DIA) {
    const w = new Date(t).getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
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

export function montarPainel(e: EntradaPainel): PainelModelo {
  const { hoje } = e;

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
  const progDoEnsaio = new Map(e.programacoes.map((p) => [p.ensaio_id, p]));
  const ensaioPorId = new Map(e.ensaios.map((x) => [x.id, x]));
  const nomeEnsaio = (en: EntradaPainel["ensaios"][number]) => nomeDoTipo.get(en.tipo_ensaio_id) || en.etiqueta || "Ensaio";
  const ativo = (en: EntradaPainel["ensaios"][number]) => {
    const st = (en.status || "").toLowerCase();
    if (st === "concluido" || st === "cancelado") return false;
    return progDoEnsaio.get(en.id)?.status !== "concluido";
  };
  const ensaiosNoEscopo = e.ensaios.filter((en) => noEscopo(osDaAmostra.get(en.amostra_id)));

  // 1) Recebimento — o próprio quadro de chegada tem o fluxo (Registro → … → OS no Sistema).
  const chegadas = e.chegadas
    .map((c) => ({ ...c, iso: paraIso(c.dataChegada), os: osDaChegada(c.osCliente) }))
    .filter((c) => e.setor === "todos" || noEscopo(c.os));
  const desde = somaDias(hoje, -(JANELA_ENTREGAS - 1));
  const recentes = chegadas.filter((c) => c.iso && c.iso >= desde && c.iso <= hoje);
  const noRecebimento = chegadas.filter((c) => c.coluna !== e.colunaFinal);
  const recebParados = noRecebimento
    .filter((c) => c.iso && diasUteisEntre(c.iso, hoje) >= DIAS_UTEIS_PARADO)
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
  const emExecucao = e.programacoes.filter((p) => {
    if (p.status !== "em_execucao") return false;
    const en = ensaioPorId.get(p.ensaio_id);
    return en ? noEscopo(osDaAmostra.get(en.amostra_id)) : e.setor === "todos";
  });
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
    const laudosDaOs = laudos.filter((p) => chaveOs(p.os) === k).length;

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
    const en = ensaioPorId.get(p.ensaio_id);
    const am = en ? amostraPorId.get(en.amostra_id) : undefined;
    alertas.push({
      nivel: "warn",
      texto: `${plural(alemDoPrevisto.length, "ensaio passou", "ensaios passaram")} do fim previsto na bancada`,
      detalhe: `Mais atrasado: ${en ? nomeEnsaio(en) : "Ensaio"} · OS ${am?.os_numero ?? "—"} · previsto ${br(p.data_fim!)}${p.tecnico ? ` · ${p.tecnico}` : ""}`,
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

  return { tiles, esteira, prazos, alertas };
}
