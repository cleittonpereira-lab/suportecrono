import type { ScheduleRow } from "@/lib/sheets.functions";
import type { StatusKey } from "@/lib/status-tokens";

// Re-export para que consumidores do cronograma usem os mesmos tokens/labels
// definidos em status-tokens.ts (fonte única de status do app).
export type { StatusKey } from "@/lib/status-tokens";
export {
  STATUS_LABEL,
  STATUS_PILL,
  STATUS_BAR,
  normalizeStatus,
} from "@/lib/status-tokens";

export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const MONTH_SHORT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export const WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Normaliza número de OS para chave de lookup (trim, upper, sem espaços, sem zeros à esquerda).
// Fonte única — não duplicar em hooks/componentes.
export function normOs(s: string): string {
  if (!s) return "";
  return String(s).trim().toUpperCase().replace(/\s+/g, "").replace(/^0+/, "");
}

export function parseBrDate(s: string): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  const date = new Date(y, mo, d);
  if (isNaN(date.getTime())) return null;
  return date;
}

export function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function weekKey(d: Date) {
  // ISO week start (Mon)
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Mon=0..Sun=6
  date.setDate(date.getDate() - day);
  return dateKey(date);
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Fonte única do status de uma linha do cronograma.
 * Mapeia campos brutos (dataEntrega, delta) para uma StatusKey canônica
 * compartilhada com o restante do app (Gantt/Kanban/Tabelas).
 *
 *  - pendente   → sem data de entrega
 *  - atrasado   → data no passado OU delta marca "atraso"
 *  - execucao   → data é hoje (entrega em andamento)
 *  - programado → data no futuro
 */
export function getScheduleStatus(r: ScheduleRow): StatusKey {
  if (r.delta && /atraso/i.test(r.delta)) return "atrasado";
  const d = parseBrDate(r.dataEntrega);
  if (!d) return "pendente";
  const today = dateKey(todayInSaoPaulo());
  const key = dateKey(d);
  if (key < today) return "atrasado";
  if (key === today) return "execucao";
  return "programado";
}

export function isAtrasado(r: ScheduleRow) {
  return getScheduleStatus(r) === "atrasado";
}

export function isHoje(r: ScheduleRow) {
  return getScheduleStatus(r) === "execucao";
}

// Retorna a data "hoje" no fuso de São Paulo (America/Sao_Paulo)
export function todayInSaoPaulo(): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  return new Date(y, m - 1, d);
}

export function isPendente(r: ScheduleRow) {
  return getScheduleStatus(r) === "pendente";
}

// Setor "indefinido" = vazio ou contém a palavra "definir".
// Essas OS não devem aparecer no Cronograma; ficam na aba Pendentes até
// que o setor seja definido.
export function isSetorIndefinido(r: ScheduleRow): boolean {
  const s = (r.setor || "").trim();
  if (!s) return true;
  return /definir/i.test(s);
}

// Normaliza nomes de setor: corrige variações comuns ("convencional",
// "ESPECIAIS", "dosagens", "agreg.") para uma forma canônica consistente.
export function normalizeSetor(raw: string): string {
  const s = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!s) return "";
  // Match em qualquer posição para tolerar abreviações ("conv.", "esp"),
  // erros de digitação ("epecial", "convencinal") e variações de plural.
  if (/\bconv|convec|convenc|convenci/.test(s)) return "Convencionais";
  if (/\bespec|\besp\b|epec|espeic|espci/.test(s)) return "Especiais";
  if (/\bdosa|dosag/.test(s)) return "Dosagem";
  if (/\bagreg|\bagr\b/.test(s)) return "Agregados";
  if (/\basfal|\basf\b/.test(s)) return "Asfalto";
  if (/\bsolo\b/.test(s)) return "Solo";
  if (/\bprism|\bprm\b/.test(s)) return "Prismáticos";
  if (/\baco\b|\baço\b/.test(s)) return "Aço";
  if (/\bcampo\b/.test(s)) return "Campo";
  // fallback: capitaliza preservando o texto original
  return raw.trim().replace(/\s+/g, " ");
}

// Separa setores combinados ("Convencional / Especial") em tags individuais
export function splitSetores(setor: string): string[] {
  if (!setor) return [];
  const parts = setor
    .split(/\s*[\/+&,;]\s*|\s+e\s+/i)
    .map((s) => normalizeSetor(s))
    .filter(Boolean);
  return Array.from(new Set(parts));
}

// Tags pré-definidas de escopo (ensaios). A coluna "Escopo" da planilha
// guarda um texto livre separado por "/", ";" ou "," — convertemos em tags.
export const ESCOPO_TAGS = [
  "Caracterização Comp/CBR",
  "Triaxiais Mec. Solos",
  "MR / DP",
  "Adensamento",
  "Edométrico (expansão / colapso)",
  "Cisalhamento",
  "MCT.C",
] as const;
export type EscopoTag = (typeof ESCOPO_TAGS)[number];

function normEscopoToken(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Heurística para casar token livre com uma das tags canônicas.
export function matchEscopoTag(raw: string): EscopoTag | null {
  const n = normEscopoToken(raw);
  if (!n) return null;
  if (/(caract|cbr)/.test(n)) return "Caracterização Comp/CBR";
  if (/triax.*(pav|asf)/.test(n) || /pav.*triax/.test(n)) return "MR / DP";
  if (/^mr$/.test(n) || /^dp$/.test(n) || /\bmr\s*\/\s*dp\b/.test(n) || /\bmr\s*e\s*dp\b/.test(n))
    return "MR / DP";
  if (/triax/.test(n)) return "Triaxiais Mec. Solos";
  if (/adens/.test(n)) return "Adensamento";
  if (/edom|expans|colap/.test(n)) return "Edométrico (expansão / colapso)";
  if (/cisalh/.test(n)) return "Cisalhamento";
  if (/mct/.test(n)) return "MCT.C";
  return null;
}

// Separa o texto livre de escopo em tags + extras desconhecidos
export function splitEscopo(raw: string): {
  tags: EscopoTag[];
  extras: string[];
} {
  if (!raw) return { tags: [], extras: [] };
  // Suporta metadados de entrega após "||" (ex.: "Adensamento || Parcial 2").
  // Ignora esta parte na exibição de tags de escopo.
  const escopoOnly = String(raw).split("||")[0];
  const parts = String(escopoOnly)
    .split(/\s*[\/;,]\s*|\s+e\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const tags = new Set<EscopoTag>();
  const extras: string[] = [];
  for (const p of parts) {
    const t = matchEscopoTag(p);
    if (t) tags.add(t);
    else extras.push(p);
  }
  return { tags: Array.from(tags), extras };
}

export function joinEscopo(tags: EscopoTag[], extras: string[] = []): string {
  return [...tags, ...extras.map((e) => e.trim()).filter(Boolean)].join(" / ");
}

// -------- Tipo de entrega (Parcial / Final) salvo na coluna P --------
// Formato: "<escopo>||Parcial 2"  ou  "<escopo>||Final"  ou  "<escopo>"
export type TipoEntrega = "Parcial" | "Final" | "Revisão";
export interface EntregaMeta {
  tipo: TipoEntrega | null;
  numero: number | null; // apenas para Parcial
}

export function parseEntregaMeta(raw: string | undefined | null): EntregaMeta {
  if (!raw) return { tipo: null, numero: null };
  const parts = String(raw).split("||");
  if (parts.length < 2) return { tipo: null, numero: null };
  const meta = parts.slice(1).join("||").trim();
  if (!meta) return { tipo: null, numero: null };
  const m = meta.match(/parcial\s*(\d+)?/i);
  if (m) return { tipo: "Parcial", numero: m[1] ? parseInt(m[1], 10) : null };
  if (/final/i.test(meta)) return { tipo: "Final", numero: null };
  const r = meta.match(/revis[aã]o\s*(\d+)?/i);
  if (r) return { tipo: "Revisão", numero: r[1] ? parseInt(r[1], 10) : null };
  return { tipo: null, numero: null };
}

export function formatEscopoP(
  tags: EscopoTag[],
  extras: string[],
  meta: EntregaMeta,
): string {
  const escopo = joinEscopo(tags, extras);
  if (!meta.tipo) return escopo;
  const metaStr =
    meta.tipo === "Final"
      ? `Final${meta.numero ? ` ${meta.numero}` : ""}`
      : `${meta.tipo}${meta.numero ? ` ${meta.numero}` : ""}`;
  return escopo ? `${escopo} || ${metaStr}` : `|| ${metaStr}`;
}

export interface ScheduleFilters {
  search: string;
  setor: string;
  tomador: string;
  status: string;
  escopo: string[]; // Alterado para string[] para suportar múltiplos escopos
}

export const emptyFilters: ScheduleFilters = {
  search: "",
  setor: "all",
  tomador: "all",
  status: "all",
  escopo: [], // Inicializado como array vazio
};

export function applyFilters(
  rows: ScheduleRow[],
  f: ScheduleFilters,
): ScheduleRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (f.setor !== "all") {
      const parts = splitSetores(row.setor);
      if (!parts.includes(f.setor)) return false;
    }
    if (f.escopo && f.escopo.length > 0) {
      const tags = splitEscopo(row.escopo).tags as string[];
      // Se algum dos escopos filtrados estiver presente nas tags da linha
      if (!f.escopo.some(s => tags.includes(s))) return false;
    }
    if (f.tomador !== "all" && row.tomador !== f.tomador) return false;
    if (f.status === "atrasado" && !isAtrasado(row)) return false;
    if (f.status === "hoje" && !isHoje(row)) return false;
    if (f.status === "pendente" && !isPendente(row)) return false;
    if (f.status === "futuro") {
      if (isAtrasado(row) || isHoje(row) || isPendente(row)) return false;
    }
    if (!q) return true;
    return (
      row.tomador.toLowerCase().includes(q) ||
      row.os.toLowerCase().includes(q) ||
      row.setor.toLowerCase().includes(q) ||
      row.laboratorio.toLowerCase().includes(q)
    );
  });
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

export function getDeltaDays(r: ScheduleRow): number | null {
  const m = r.delta?.match(/-?\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  if (isNaN(n)) return null;
  return isAtrasado(r) ? -Math.abs(n) : Math.abs(n);
}

// Calcula a data da Páscoa (algoritmo de Meeus/Jones/Butcher)
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Feriados nacionais + SP (estado) + São Pedro/SP (município)
export function getFeriados(year: number): Map<string, string> {
  const map = new Map<string, string>();
  const add = (d: Date, name: string) => map.set(dateKey(d), name);

  // Nacionais fixos
  add(new Date(year, 0, 1), "Confraternização Universal");
  add(new Date(year, 3, 21), "Tiradentes");
  add(new Date(year, 4, 1), "Dia do Trabalho");
  add(new Date(year, 8, 7), "Independência do Brasil");
  add(new Date(year, 9, 12), "Nossa Senhora Aparecida");
  add(new Date(year, 10, 2), "Finados");
  add(new Date(year, 10, 15), "Proclamação da República");
  add(new Date(year, 10, 20), "Consciência Negra");
  add(new Date(year, 11, 25), "Natal");

  // Móveis (baseados na Páscoa)
  const easter = easterSunday(year);
  add(addDays(easter, -48), "Carnaval (segunda)");
  add(addDays(easter, -47), "Carnaval (terça)");
  add(addDays(easter, -2), "Sexta-feira Santa");
  add(easter, "Páscoa");
  add(addDays(easter, 60), "Corpus Christi");

  // Estadual SP
  add(new Date(year, 6, 9), "Revolução Constitucionalista (SP)");

  // Município São Pedro/SP
  add(new Date(year, 5, 28), "Aniversário de São Pedro");
  add(new Date(year, 5, 29), "São Pedro (padroeiro)");

  return map;
}

export function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}