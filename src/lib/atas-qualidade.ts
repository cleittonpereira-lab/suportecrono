/**
 * Atas de reunião do Qualidade - LAB (grupo de trabalho ISO 17025 e outros).
 *
 * Lógica PURA — sem servidor, sem tela — compartilhada entre as telas, o
 * servidor (que aplica as operações) e o PDF. Um documento JSON por reunião.
 *
 * Ideia central: cada reunião tem uma lista de ITENS (ação, decisão ou
 * informe) como as linhas de um quadro de demandas — responsáveis, prazo e
 * situação. Ao abrir uma reunião nova, a tela mostra primeiro o que ficou
 * alinhado na anterior e o que segue em aberto; o que não foi concluído pode
 * ser TRAZIDO para a reunião nova (vira um item novo, ligado ao de origem; o
 * de origem passa a "transferida", então a ata antiga continua contando a
 * história certa e a pendência nunca aparece em dobro).
 */

export type TipoItem = "acao" | "decisao" | "informe";
export type StatusItem = "pendente" | "em_andamento" | "concluida" | "cancelada" | "transferida";
export type StatusReuniao = "agendada" | "em_andamento" | "encerrada";

export const GRUPO_PADRAO = "Grupo de trabalho ISO 17025";

export const TIPO_LABEL: Record<TipoItem, string> = {
  acao: "Ação",
  decisao: "Decisão",
  informe: "Informe",
};

export const STATUS_ITEM_LABEL: Record<StatusItem, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  transferida: "Passou p/ outra reunião",
};

export const STATUS_REUNIAO_LABEL: Record<StatusReuniao, string> = {
  agendada: "Agendada",
  em_andamento: "Em andamento",
  encerrada: "Encerrada",
};

export interface OrigemItem {
  reuniaoId: string;
  itemId: string;
  reuniaoNumero: number;
  reuniaoData: string;
}

export interface ItemAta {
  id: string;
  tipo: TipoItem;
  descricao: string;
  responsaveis: string[];
  /** AAAA-MM-DD ou null */
  prazo: string | null;
  status: StatusItem;
  concluidoEm: string | null;
  concluidoPor: string | null;
  observacao: string;
  /** De onde o item veio quando foi trazido de uma reunião anterior. */
  origem: OrigemItem | null;
  /** Para onde o item foi quando passou para uma reunião nova. */
  transferidaPara: { reuniaoId: string; reuniaoNumero: number; reuniaoData: string } | null;
  criadoEm: string;
  criadoPor: string;
}

export interface Participante {
  nome: string;
  presente: boolean;
  /** Cargo/função ou empresa — texto livre. */
  funcao: string;
  /** Pessoa de fora do app (sem conta). */
  externo: boolean;
}

export interface Reuniao {
  id: string;
  grupo: string;
  /** Sequencial dentro do grupo (1, 2, 3...). */
  numero: number;
  titulo: string;
  /** AAAA-MM-DD */
  data: string;
  horaInicio: string;
  horaFim: string;
  local: string;
  pauta: string;
  observacoes: string;
  participantes: Participante[];
  itens: ItemAta[];
  status: StatusReuniao;
  /** Quem redige a ata (nome). */
  redator: string;
  criadaPor: string;
  criadaEm: string;
  atualizadaEm: string;
  encerradaEm: string | null;
  encerradaPor: string | null;
}

// ---------------------------------------------------------------------------
// Situação dos itens
// ---------------------------------------------------------------------------

/** Item que ainda precisa de ação (não concluído, cancelado nem transferido). */
export function itemEmAberto(i: Pick<ItemAta, "tipo" | "status">): boolean {
  return i.tipo === "acao" && (i.status === "pendente" || i.status === "em_andamento");
}

export function itemAtrasado(i: Pick<ItemAta, "tipo" | "status" | "prazo">, hoje: string): boolean {
  return itemEmAberto(i) && !!i.prazo && i.prazo < hoje;
}

/** Dias de atraso (positivo) ou de folga (negativo) em relação a hoje; null sem prazo. */
export function diasParaPrazo(prazo: string | null, hoje: string): number | null {
  if (!prazo) return null;
  const a = Date.parse(`${prazo}T12:00:00Z`);
  const b = Date.parse(`${hoje}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export interface ResumoReuniao {
  acoes: number;
  concluidas: number;
  emAberto: number;
  atrasadas: number;
  decisoes: number;
  informes: number;
  /** 0–100; sem ações = 0 */
  percentualConcluido: number;
}

export function resumirReuniao(r: Pick<Reuniao, "itens">, hoje: string): ResumoReuniao {
  // Ações transferidas e canceladas não entram na conta: a primeira vive na
  // reunião nova, a segunda deixou de valer.
  const acoes = r.itens.filter((i) => i.tipo === "acao" && i.status !== "cancelada" && i.status !== "transferida");
  const concluidas = acoes.filter((i) => i.status === "concluida").length;
  const emAberto = acoes.filter(itemEmAberto).length;
  const atrasadas = acoes.filter((i) => itemAtrasado(i, hoje)).length;
  return {
    acoes: acoes.length,
    concluidas,
    emAberto,
    atrasadas,
    decisoes: r.itens.filter((i) => i.tipo === "decisao").length,
    informes: r.itens.filter((i) => i.tipo === "informe").length,
    percentualConcluido: acoes.length === 0 ? 0 : Math.round((concluidas / acoes.length) * 100),
  };
}

// ---------------------------------------------------------------------------
// Encadeamento das reuniões de um grupo
// ---------------------------------------------------------------------------

/** Mais antiga primeiro: por data, depois hora, depois número. */
export function ordenarReunioes(rs: readonly Reuniao[]): Reuniao[] {
  return [...rs].sort(
    (a, b) =>
      a.data.localeCompare(b.data) || a.horaInicio.localeCompare(b.horaInicio) || a.numero - b.numero,
  );
}

export function reunioesDoGrupo(rs: readonly Reuniao[], grupo: string): Reuniao[] {
  return ordenarReunioes(rs.filter((r) => r.grupo === grupo));
}

/** A reunião imediatamente anterior (do mesmo grupo) à `atual`, ou null. */
export function reuniaoAnterior(rs: readonly Reuniao[], atual: Pick<Reuniao, "id" | "grupo">): Reuniao | null {
  const doGrupo = reunioesDoGrupo(rs, atual.grupo);
  const pos = doGrupo.findIndex((r) => r.id === atual.id);
  return pos > 0 ? doGrupo[pos - 1] : null;
}

/** Todas as reuniões do grupo ANTES da atual (da mais recente para a mais antiga). */
export function reunioesAnteriores(rs: readonly Reuniao[], atual: Pick<Reuniao, "id" | "grupo">): Reuniao[] {
  const doGrupo = reunioesDoGrupo(rs, atual.grupo);
  const pos = doGrupo.findIndex((r) => r.id === atual.id);
  return pos > 0 ? doGrupo.slice(0, pos).reverse() : [];
}

export interface PendenciaAberta {
  reuniao: Reuniao;
  item: ItemAta;
}

/**
 * Ações ainda em aberto das reuniões ANTERIORES à `atual`: o que o grupo
 * deixou pendente e precisa ver ao abrir a reunião. Mais antigas primeiro.
 */
export function pendenciasAnteriores(rs: readonly Reuniao[], atual: Pick<Reuniao, "id" | "grupo">): PendenciaAberta[] {
  const out: PendenciaAberta[] = [];
  for (const r of [...reunioesAnteriores(rs, atual)].reverse()) {
    for (const item of r.itens) if (itemEmAberto(item)) out.push({ reuniao: r, item });
  }
  return out;
}

/** Todas as ações em aberto de um grupo (qualquer reunião), mais antigas primeiro. */
export function pendenciasDoGrupo(rs: readonly Reuniao[], grupo: string): PendenciaAberta[] {
  const out: PendenciaAberta[] = [];
  for (const r of reunioesDoGrupo(rs, grupo)) {
    for (const item of r.itens) if (itemEmAberto(item)) out.push({ reuniao: r, item });
  }
  return out;
}

/** Quem aparece em reuniões do grupo, em ordem alfabética — para sugestões. */
export function gruposExistentes(rs: readonly Reuniao[]): string[] {
  const set = new Set<string>([GRUPO_PADRAO]);
  for (const r of rs) if (r.grupo.trim()) set.add(r.grupo.trim());
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function proximoNumero(rs: readonly Reuniao[], grupo: string): number {
  return rs.filter((r) => r.grupo === grupo).reduce((m, r) => Math.max(m, r.numero), 0) + 1;
}

// ---------------------------------------------------------------------------
// Fabricação de itens e reuniões
// ---------------------------------------------------------------------------

export function novoItem(
  base: Partial<ItemAta> & { descricao: string },
  quem: string,
  agora: string,
  id: string,
): ItemAta {
  return {
    id,
    tipo: base.tipo ?? "acao",
    descricao: base.descricao.trim(),
    responsaveis: limparNomes(base.responsaveis ?? []),
    prazo: base.prazo || null,
    status: base.status ?? "pendente",
    concluidoEm: base.status === "concluida" ? agora : null,
    concluidoPor: base.status === "concluida" ? quem : null,
    observacao: base.observacao ?? "",
    origem: base.origem ?? null,
    transferidaPara: null,
    criadoEm: agora,
    criadoPor: quem,
  };
}

/** Nomes sem espaços sobrando, sem vazios e sem repetição (ignora maiúsculas). */
export function limparNomes(nomes: readonly string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const n of nomes) {
    const t = n.trim().replace(/\s+/g, " ");
    if (!t) continue;
    const k = t.toLocaleLowerCase("pt-BR");
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(t);
  }
  return out;
}

/** A cópia de um item pendente que vai viver na reunião nova. */
export function copiaParaReuniaoNova(
  origem: Reuniao,
  item: ItemAta,
  quem: string,
  agora: string,
  id: string,
): ItemAta {
  return novoItem(
    {
      tipo: item.tipo,
      descricao: item.descricao,
      responsaveis: item.responsaveis,
      prazo: item.prazo,
      status: item.status === "em_andamento" ? "em_andamento" : "pendente",
      observacao: item.observacao,
      origem: { reuniaoId: origem.id, itemId: item.id, reuniaoNumero: origem.numero, reuniaoData: origem.data },
    },
    quem,
    agora,
    id,
  );
}

/**
 * Aplica uma mudança de situação mantendo coerentes os campos de conclusão:
 * concluir grava quem e quando; reabrir apaga.
 */
export function comNovoStatus(item: ItemAta, status: StatusItem, quem: string, agora: string): ItemAta {
  if (status === "concluida") {
    return { ...item, status, concluidoEm: item.concluidoEm ?? agora, concluidoPor: item.concluidoPor ?? quem };
  }
  return { ...item, status, concluidoEm: null, concluidoPor: null };
}

// ---------------------------------------------------------------------------
// Operações (o servidor aplica; a tela só descreve o que quer mudar)
// ---------------------------------------------------------------------------

export type CamposItem = Partial<
  Pick<ItemAta, "tipo" | "descricao" | "responsaveis" | "prazo" | "observacao">
> & { status?: StatusItem };

export type CamposReuniao = Partial<
  Pick<
    Reuniao,
    "grupo" | "titulo" | "data" | "horaInicio" | "horaFim" | "local" | "pauta" | "observacoes" | "redator"
  >
>;

export type OperacaoAta =
  | { op: "dados"; campos: CamposReuniao }
  | { op: "participantes"; participantes: Participante[] }
  | { op: "item_novo"; id: string; item: Partial<ItemAta> & { descricao: string } }
  | { op: "item_alterar"; itemId: string; campos: CamposItem }
  | { op: "item_remover"; itemId: string }
  | { op: "status"; status: StatusReuniao };

export function aplicarOperacao(r: Reuniao, o: OperacaoAta, quem: string, agora: string): Reuniao {
  const base = { ...r, atualizadaEm: agora };
  switch (o.op) {
    case "dados": {
      const c = o.campos;
      return {
        ...base,
        ...(c.grupo !== undefined ? { grupo: c.grupo.trim() || r.grupo } : null),
        ...(c.titulo !== undefined ? { titulo: c.titulo.trim() || r.titulo } : null),
        ...(c.data !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(c.data) ? { data: c.data } : null),
        ...(c.horaInicio !== undefined ? { horaInicio: c.horaInicio } : null),
        ...(c.horaFim !== undefined ? { horaFim: c.horaFim } : null),
        ...(c.local !== undefined ? { local: c.local.trim() } : null),
        ...(c.pauta !== undefined ? { pauta: c.pauta } : null),
        ...(c.observacoes !== undefined ? { observacoes: c.observacoes } : null),
        ...(c.redator !== undefined ? { redator: c.redator.trim() } : null),
      };
    }
    case "participantes": {
      const vistos = new Set<string>();
      const lista: Participante[] = [];
      for (const p of o.participantes) {
        const nome = p.nome.trim().replace(/\s+/g, " ");
        const k = nome.toLocaleLowerCase("pt-BR");
        if (!nome || vistos.has(k)) continue;
        vistos.add(k);
        lista.push({ nome, presente: !!p.presente, funcao: (p.funcao ?? "").trim(), externo: !!p.externo });
      }
      return { ...base, participantes: lista };
    }
    case "item_novo": {
      if (!o.item.descricao.trim()) return r;
      // Idempotente: se a tela repetir o envio (rede ruim), não duplica.
      if (r.itens.some((i) => i.id === o.id)) return r;
      return { ...base, itens: [...r.itens, novoItem(o.item, quem, agora, o.id)] };
    }
    case "item_alterar": {
      let achou = false;
      const itens = r.itens.map((i) => {
        if (i.id !== o.itemId) return i;
        achou = true;
        const c = o.campos;
        let n: ItemAta = { ...i };
        if (c.tipo !== undefined) n.tipo = c.tipo;
        if (c.descricao !== undefined && c.descricao.trim()) n.descricao = c.descricao.trim();
        if (c.responsaveis !== undefined) n.responsaveis = limparNomes(c.responsaveis);
        if (c.prazo !== undefined) n.prazo = c.prazo || null;
        if (c.observacao !== undefined) n.observacao = c.observacao;
        if (c.status !== undefined && c.status !== "transferida") n = comNovoStatus(n, c.status, quem, agora);
        return n;
      });
      return achou ? { ...base, itens } : r;
    }
    case "item_remover":
      return { ...base, itens: r.itens.filter((i) => i.id !== o.itemId) };
    case "status": {
      if (o.status === r.status) return r;
      if (o.status === "encerrada") return { ...base, status: o.status, encerradaEm: agora, encerradaPor: quem };
      return { ...base, status: o.status, encerradaEm: null, encerradaPor: null };
    }
  }
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** AAAA-MM-DD → dd/mm/aaaa (devolve o texto como veio se não for uma data). */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function nomeDoArquivoDaAta(r: Pick<Reuniao, "grupo" | "numero" | "data">): string {
  const grupo = r.grupo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `Ata_${grupo || "reuniao"}_${String(r.numero).padStart(2, "0")}_${r.data}.pdf`;
}

/**
 * Ações ainda em aberto até a reunião `atual` (ela inclusive): o que a ata
 * deixa pendente ao ser fechada. Mais antigas primeiro.
 */
export function pendenciasAteReuniao(rs: readonly Reuniao[], atual: Pick<Reuniao, "id" | "grupo">): PendenciaAberta[] {
  const doGrupo = reunioesDoGrupo(rs, atual.grupo);
  const pos = doGrupo.findIndex((r) => r.id === atual.id);
  const ate = pos >= 0 ? doGrupo.slice(0, pos + 1) : doGrupo;
  const out: PendenciaAberta[] = [];
  for (const r of ate) for (const item of r.itens) if (itemEmAberto(item)) out.push({ reuniao: r, item });
  return out;
}

/** Iniciais para o avatar: "Ana Souza" → "AS". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toLocaleUpperCase("pt-BR");
  return (partes[0][0] + partes[partes.length - 1][0]).toLocaleUpperCase("pt-BR");
}
