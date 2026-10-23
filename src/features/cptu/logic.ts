/**
 * Acompanhamento de CPTu — regras puras (sem servidor nem tela), para poder
 * testar: leitura do extrato da SOND ("mapa em modo tabela"), mescla de uma
 * nova importação com o que já foi anotado, edição com histórico e o resumo
 * do cabeçalho.
 *
 * O extrato da SOND manda nos dados de campo (coordenadas, profundidade,
 * observação, critério). O status vem dele também, mas só quando MUDA na SOND:
 * se a equipe marcou um CPTu como Concluído ou Cancelado aqui, a próxima
 * importação não desfaz isso. Os pontos de controle (recebimento, verificação,
 * relatório), observações e links são só nossos — a importação nunca mexe.
 */

export const CPTU_STATUS = [
  "PENDENTE",
  "PRIORIDADE",
  "EXECUTADO",
  "CONCLUIDO",
  "CANCELADO",
] as const;
export type CptuStatus = (typeof CPTU_STATUS)[number];

export const STATUS_LABEL: Record<CptuStatus, string> = {
  PENDENTE: "Pendente",
  PRIORIDADE: "Prioridade",
  EXECUTADO: "Executado",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

/** Status que só a equipe define — a importação da SOND não sobrescreve. */
const STATUS_INTERNOS: readonly CptuStatus[] = ["CONCLUIDO", "CANCELADO"];

export const RELATORIO_STATUS = ["NAO", "SIM_SOND"] as const;
export type RelatorioStatus = (typeof RELATORIO_STATUS)[number];
export const RELATORIO_LABEL: Record<RelatorioStatus, string> = {
  NAO: "Não",
  SIM_SOND: "Sim, na Sond",
};

/** Uma linha do extrato da SOND, já interpretada. */
export type CptuLinhaImportada = {
  os: string;
  identificacao: string;
  tipo: string;
  lat: number | null;
  lng: number | null;
  status: CptuStatus;
  /** yyyy-mm-dd */
  desde: string | null;
  dataFimOs: string | null;
  profundidade: number;
  obsCampo: string;
  criterio: string;
};

export type CptuEvento = { em: string; por: string; campo: string; de: string; para: string };

export type CptuRegistro = CptuLinhaImportada & {
  id: string;
  /** Último status visto na SOND (para saber quando ele mudou lá). */
  statusSond: CptuStatus;
  recebimentoCampo: boolean;
  verificacaoBrutos: boolean;
  relatorio: RelatorioStatus;
  observacoes: string;
  linkSondagemRef: string;
  linkDadosBrutos: string;
  /** Não veio na última importação (saiu do mapa da SOND). */
  ausenteNaSond: boolean;
  /** Atenção verificada pela equipe: quando e quem deu a baixa ("" = não verificada). */
  atencaoVerificadaEm: string;
  atencaoVerificadaPor: string;
  /** Status + descrição de campo no momento da baixa. Se a SOND mudar isso, a baixa deixa de valer. */
  atencaoSnapshot: string;
  atencaoNota: string;
  criadoEm: string;
  atualizadoEm: string;
  atualizadoPor: string;
  historico: CptuEvento[];
};

export type CptuImportacao = {
  em: string;
  por: string;
  arquivo: string;
  total: number;
  novos: number;
  statusAlterados: number;
  ausentes: number;
};

export type CptuDoc = {
  registros: Record<string, CptuRegistro>;
  importacoes: CptuImportacao[];
};

export function docVazio(): CptuDoc {
  return { registros: {}, importacoes: [] };
}

const MAX_HISTORICO = 60;
const MAX_IMPORTACOES = 30;

export function normalizarTexto(s: string): string {
  return (s ?? "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
}

/** Mesma OS nas duas fontes: "18205-26", "18205/26" e " 18205-26 " batem. */
export function chaveOs(os: string): string {
  return normalizarTexto(os)
    .replace(/[^0-9A-Z]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function chaveCptu(os: string, identificacao: string): string {
  return `${os.trim().toUpperCase()}|${identificacao.trim().toUpperCase().replace(/\s+/g, " ")}`;
}

export function normalizarStatus(raw: string): CptuStatus {
  const s = normalizarTexto(raw);
  if (s.startsWith("PRIORI")) return "PRIORIDADE";
  if (s.startsWith("EXECUTAD") || s === "REALIZADO") return "EXECUTADO";
  if (s.startsWith("CONCLU")) return "CONCLUIDO";
  if (s.startsWith("CANCEL")) return "CANCELADO";
  return "PENDENTE";
}

/** "1.234,56" → 1234.56; "-25.53" → -25.53; vazio → null. */
export function parseNumero(raw: string): number | null {
  const s = (raw ?? "").toString().trim();
  if (!s) return null;
  const limpo = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** "08/10/2026" → "2026-10-08". */
export function parseDataBr(raw: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec((raw ?? "").trim());
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** CSV com `;` ou `,` (detectado pela 1ª linha), aspas e BOM. */
export function parseCsvSond(texto: string): string[][] {
  const t = texto.replace(/^\uFEFF/, "");
  const primeira = t.slice(0, t.indexOf("\n") === -1 ? t.length : t.indexOf("\n"));
  const sep =
    (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let linha: string[] = [];
  let valor = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        valor += '"';
        i++;
      } else if (c === '"') aspas = false;
      else valor += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(valor);
      valor = "";
    } else if (c === "\n") {
      linha.push(valor);
      linhas.push(linha);
      linha = [];
      valor = "";
    } else if (c !== "\r") valor += c;
  }
  if (valor || linha.length) {
    linha.push(valor);
    linhas.push(linha);
  }
  return linhas.filter((l) => l.some((v) => v.trim() !== ""));
}

const COLUNAS: Record<keyof CptuLinhaImportada, string[]> = {
  os: ["ORDEM DE SERVICO", "OS"],
  identificacao: ["IDENTIFICACAO"],
  tipo: ["TIPO"],
  lat: ["LATITUDE"],
  lng: ["LONGITUDE"],
  status: ["STATUS"],
  desde: ["DESDE"],
  dataFimOs: ["DATA FIM"],
  profundidade: ["PROF"],
  obsCampo: ["OBSERVACAO DE CAMPO", "OBSERVACAO"],
  criterio: ["CRITERIO"],
};

export type ResultadoLeitura = {
  linhas: CptuLinhaImportada[];
  /** Linhas puladas: tipo diferente de CPTu ou OS de teste. */
  ignoradas: number;
  erro?: string;
};

/** Interpreta a tabela do extrato (1ª linha = cabeçalho). Só fica CPTu/CPT. */
export function lerExtratoSond(tabela: string[][]): ResultadoLeitura {
  const iCab = tabela.findIndex((l) =>
    l.some((v) => normalizarTexto(v).startsWith("IDENTIFICACAO")),
  );
  if (iCab === -1) {
    return {
      linhas: [],
      ignoradas: 0,
      erro: 'Não achei a coluna "Identificação" — confira se é o extrato do mapa da SOND.',
    };
  }
  const cab = tabela[iCab].map(normalizarTexto);
  const idx = {} as Record<keyof CptuLinhaImportada, number>;
  for (const [campo, nomes] of Object.entries(COLUNAS) as [keyof CptuLinhaImportada, string[]][]) {
    idx[campo] = cab.findIndex((h) => nomes.some((n) => h.startsWith(n)));
  }
  if (idx.os === -1) {
    return { linhas: [], ignoradas: 0, erro: 'Não achei a coluna "Ordem de Serviço (OS)".' };
  }
  const val = (l: string[], campo: keyof CptuLinhaImportada) =>
    idx[campo] >= 0 ? (l[idx[campo]] ?? "").trim() : "";

  const linhas: CptuLinhaImportada[] = [];
  const vistos = new Set<string>();
  let ignoradas = 0;
  for (const l of tabela.slice(iCab + 1)) {
    const os = val(l, "os");
    const identificacao = val(l, "identificacao");
    if (!os || !identificacao) continue;
    const tipo = val(l, "tipo") || "CPTU";
    if (!normalizarTexto(tipo).includes("CPT") || normalizarTexto(os) === "TESTE") {
      ignoradas++;
      continue;
    }
    const chave = chaveCptu(os, identificacao);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    linhas.push({
      os,
      identificacao,
      tipo,
      lat: parseNumero(val(l, "lat")),
      lng: parseNumero(val(l, "lng")),
      status: normalizarStatus(val(l, "status")),
      desde: parseDataBr(val(l, "desde")),
      dataFimOs: parseDataBr(val(l, "dataFimOs")),
      profundidade: parseNumero(val(l, "profundidade")) ?? 0,
      obsCampo: val(l, "obsCampo"),
      criterio: val(l, "criterio"),
    });
  }
  return { linhas, ignoradas };
}

export function novoRegistro(l: CptuLinhaImportada, em: string, por: string): CptuRegistro {
  return {
    ...l,
    id: chaveCptu(l.os, l.identificacao),
    statusSond: l.status,
    recebimentoCampo: false,
    verificacaoBrutos: false,
    relatorio: "NAO",
    observacoes: "",
    linkSondagemRef: "",
    linkDadosBrutos: "",
    ausenteNaSond: false,
    atencaoVerificadaEm: "",
    atencaoVerificadaPor: "",
    atencaoSnapshot: "",
    atencaoNota: "",
    criadoEm: em,
    atualizadoEm: em,
    atualizadoPor: por,
    historico: [{ em, por, campo: "importação", de: "", para: STATUS_LABEL[l.status] }],
  };
}

/** Status + descrição de campo: o que a baixa de atenção "viu". */
export const snapshotAtencao = (r: Pick<CptuRegistro, "status" | "obsCampo">) =>
  `${r.status}|${r.obsCampo}`;

/**
 * A atenção foi verificada e a SOND não mudou nada desde então. Registros de
 * antes desta marcação não têm os campos: contam como não verificados.
 */
export const verificacaoVale = (
  r: Pick<CptuRegistro, "status" | "obsCampo" | "atencaoVerificadaEm" | "atencaoSnapshot">,
) => !!r.atencaoVerificadaEm && r.atencaoSnapshot === snapshotAtencao(r);

function registrarEvento(r: CptuRegistro, ev: CptuEvento) {
  r.historico = [...r.historico, ev].slice(-MAX_HISTORICO);
}

export function mesclarImportacao(
  atual: CptuDoc | null,
  linhas: CptuLinhaImportada[],
  meta: { em: string; por: string; arquivo: string },
): { doc: CptuDoc; resumo: CptuImportacao } {
  const doc: CptuDoc = atual
    ? { registros: { ...atual.registros }, importacoes: [...atual.importacoes] }
    : docVazio();
  const { em, por } = meta;
  const presentes = new Set<string>();
  let novos = 0;
  let statusAlterados = 0;

  for (const l of linhas) {
    const id = chaveCptu(l.os, l.identificacao);
    presentes.add(id);
    const antigo = doc.registros[id];
    if (!antigo) {
      doc.registros[id] = novoRegistro(l, em, por);
      novos++;
      continue;
    }
    const r: CptuRegistro = { ...antigo, historico: [...antigo.historico] };
    r.tipo = l.tipo;
    r.lat = l.lat;
    r.lng = l.lng;
    r.desde = l.desde;
    r.dataFimOs = l.dataFimOs;
    r.obsCampo = l.obsCampo;
    r.criterio = l.criterio;
    if (l.profundidade !== r.profundidade) {
      registrarEvento(r, {
        em,
        por: "SOND",
        campo: "profundidade",
        de: String(r.profundidade),
        para: String(l.profundidade),
      });
      r.profundidade = l.profundidade;
    }
    if (l.status !== r.statusSond) {
      if (!STATUS_INTERNOS.includes(r.status) && l.status !== r.status) {
        registrarEvento(r, {
          em,
          por: "SOND",
          campo: "status",
          de: STATUS_LABEL[r.status],
          para: STATUS_LABEL[l.status],
        });
        r.status = l.status;
        statusAlterados++;
      }
      r.statusSond = l.status;
    }
    if (r.ausenteNaSond) r.ausenteNaSond = false;
    r.atualizadoEm = em;
    doc.registros[id] = r;
  }

  let ausentes = 0;
  for (const [id, r] of Object.entries(doc.registros)) {
    if (presentes.has(id)) continue;
    if (!r.ausenteNaSond) doc.registros[id] = { ...r, ausenteNaSond: true };
    ausentes++;
  }

  const resumo: CptuImportacao = {
    em,
    por,
    arquivo: meta.arquivo,
    total: linhas.length,
    novos,
    statusAlterados,
    ausentes,
  };
  doc.importacoes = [...doc.importacoes, resumo].slice(-MAX_IMPORTACOES);
  return { doc, resumo };
}

export type CptuPatch = Partial<
  Pick<
    CptuRegistro,
    | "status"
    | "recebimentoCampo"
    | "verificacaoBrutos"
    | "relatorio"
    | "observacoes"
    | "linkSondagemRef"
    | "linkDadosBrutos"
    | "atencaoNota"
  >
> & {
  /** Dar baixa (true) ou reabrir (false) o ponto de atenção. Não é um campo gravado direto. */
  atencaoVerificada?: boolean;
};

const NOME_CAMPO: Record<keyof CptuPatch, string> = {
  status: "status",
  recebimentoCampo: "recebimento dos dados de campo",
  verificacaoBrutos: "verificação dos dados brutos",
  relatorio: "relatório",
  observacoes: "observações",
  linkSondagemRef: "link da sondagem de referência",
  linkDadosBrutos: "link dos dados brutos",
  atencaoNota: "nota da atenção",
  atencaoVerificada: "atenção verificada",
};

function textoDoValor(campo: keyof CptuPatch, v: unknown): string {
  if (campo === "status") return STATUS_LABEL[v as CptuStatus];
  if (campo === "relatorio") return RELATORIO_LABEL[v as RelatorioStatus];
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return String(v ?? "");
}

/** Aplica a edição e anota no histórico só o que mudou. Devolve o mesmo objeto se nada mudou. */
export function aplicarPatch(
  r: CptuRegistro,
  patch: CptuPatch,
  em: string,
  por: string,
): CptuRegistro {
  let novo: CptuRegistro | null = null;
  for (const campo of Object.keys(patch) as (keyof CptuPatch)[]) {
    if (campo === "atencaoVerificada") continue;
    const v = patch[campo];
    if (v === undefined || v === r[campo]) continue;
    novo ??= { ...r, historico: [...r.historico] };
    registrarEvento(novo, {
      em,
      por,
      campo: NOME_CAMPO[campo],
      de: textoDoValor(campo, r[campo]),
      para: textoDoValor(campo, v),
    });
    (novo as Record<string, unknown>)[campo] = v;
  }
  const baixa = patch.atencaoVerificada;
  if (baixa !== undefined && baixa !== verificacaoVale(r)) {
    novo ??= { ...r, historico: [...r.historico] };
    registrarEvento(novo, {
      em,
      por,
      campo: NOME_CAMPO.atencaoVerificada,
      de: baixa ? "Não" : "Sim",
      para: baixa ? "Sim" : "Não",
    });
    novo.atencaoVerificadaEm = baixa ? em : "";
    novo.atencaoVerificadaPor = baixa ? por : "";
    novo.atencaoSnapshot = baixa ? snapshotAtencao(r) : "";
  }
  if (!novo) return r;
  novo.atualizadoEm = em;
  novo.atualizadoPor = por;
  return novo;
}

/** "ATÉ 10,0 METROS" / "ATÉ **6 METROS**" → 10 / 6. "ATÉ A LIMITAÇÃO" → null. */
export function profundidadePrevista(criterio: string): number | null {
  const m = /AT[ÉE]\s*\**\s*([\d]+(?:[.,]\d+)?)\s*\**\s*(?:METROS?|M\b)/i.exec(criterio ?? "");
  return m ? parseNumero(m[1]) : null;
}

/** "PRÉ FURO DE 8 METROS" / "PRÉ-FURO 14,09 METROS" → 8 / 14.09. */
export function preFuro(criterio: string): number | null {
  const m = /PR[ÉE][\s-]*FURO\s*(?:DE\s*)?([\d]+(?:[.,]\d+)?)\s*METROS?/i.exec(criterio ?? "");
  return m ? parseNumero(m[1]) : null;
}

/** Cotas de dissipação entre "#": "# 2,5m / 4,5m #" → ["2,5m", "4,5m"]. */
export function cotasDissipacao(criterio: string): string[] {
  const m = /#([^#]+)#/.exec(criterio ?? "");
  if (!m) return [];
  return m[1]
    .split("/")
    .map((s) => s.replace(/\s+/g, "").trim())
    .filter(Boolean);
}

export function diasDesde(dataIso: string | null, hoje = new Date()): number | null {
  if (!dataIso) return null;
  const [y, m, d] = dataIso.split("-").map(Number);
  const inicio = new Date(y, (m || 1) - 1, d || 1);
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((base.getTime() - inicio.getTime()) / 86_400_000);
}

export const estaPendente = (r: Pick<CptuRegistro, "status">) =>
  r.status === "PENDENTE" || r.status === "PRIORIDADE";
export const foiExecutado = (r: Pick<CptuRegistro, "status">) =>
  r.status === "EXECUTADO" || r.status === "CONCLUIDO";

/** Executado, mas falta algum dos 3 pontos de controle. */
export function etapasFaltando(r: CptuRegistro): string[] {
  if (!foiExecutado(r)) return [];
  const f: string[] = [];
  if (!r.recebimentoCampo) f.push("Recebimento");
  if (!r.verificacaoBrutos) f.push("Verificação");
  if (r.relatorio !== "SIM_SOND") f.push("Relatório");
  return f;
}

/** Executado com tudo pronto, mas ainda não marcado como Concluído. */
export const prontoParaConcluir = (r: CptuRegistro) =>
  r.status === "EXECUTADO" && etapasFaltando(r).length === 0;

export type CptuResumo = {
  total: number;
  porStatus: Record<CptuStatus, number>;
  pendentes: number;
  metrosExecutados: number;
  metrosPrevistosPendentes: number;
  pendentesSemPrevisao: number;
  pendentesHaMaisDe30Dias: number;
  semRecebimento: number;
  semVerificacao: number;
  semRelatorio: number;
  prontosParaConcluir: number;
  osComPendentes: number;
};

export function resumir(registros: CptuRegistro[], hoje = new Date()): CptuResumo {
  const porStatus = Object.fromEntries(CPTU_STATUS.map((s) => [s, 0])) as Record<
    CptuStatus,
    number
  >;
  const res: CptuResumo = {
    total: registros.length,
    porStatus,
    pendentes: 0,
    metrosExecutados: 0,
    metrosPrevistosPendentes: 0,
    pendentesSemPrevisao: 0,
    pendentesHaMaisDe30Dias: 0,
    semRecebimento: 0,
    semVerificacao: 0,
    semRelatorio: 0,
    prontosParaConcluir: 0,
    osComPendentes: 0,
  };
  const osPend = new Set<string>();
  for (const r of registros) {
    porStatus[r.status]++;
    if (estaPendente(r)) {
      res.pendentes++;
      osPend.add(r.os);
      const prev = profundidadePrevista(r.criterio);
      if (prev == null) res.pendentesSemPrevisao++;
      else res.metrosPrevistosPendentes += prev;
      if ((diasDesde(r.desde, hoje) ?? 0) > 30) res.pendentesHaMaisDe30Dias++;
    }
    if (foiExecutado(r)) {
      res.metrosExecutados += r.profundidade || 0;
      if (!r.recebimentoCampo) res.semRecebimento++;
      if (!r.verificacaoBrutos) res.semVerificacao++;
      if (r.relatorio !== "SIM_SOND") res.semRelatorio++;
    }
    if (prontoParaConcluir(r)) res.prontosParaConcluir++;
  }
  res.osComPendentes = osPend.size;
  return res;
}
