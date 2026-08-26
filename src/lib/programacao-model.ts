/**
 * Modelo de dados compartilhado da Programação de Ensaios — usado por
 * `_app.programacao.gantt.tsx`, `_app.programacao.central.tsx` e
 * `_app.programacao.scan.tsx`.
 *
 * Antes cada uma dessas telas mantinha seu próprio tipo `Programacao` e sua
 * própria função de conversão da linha crua da planilha, e tinham divergido:
 * só `central.tsx` modelava `predecessor_id`, o que deixava a cadeia de
 * dependências entre ensaios invisível pro Gantt e pro scan mobile. Esse
 * módulo centraliza os dois.
 */
import { endIsoFromDur, parseIncluirFds } from "@/lib/business-days";

export const SHEET_AMOSTRAS = "Amostras";
export const SHEET_ENSAIOS = "Ensaios";
export const SHEET_PROGS = "Programações";
export const SHEET_TIPOS = "Tipos de Ensaio";
export const SHEET_EQUIPS = "Equipamentos";

export const PROG_COLUMNS = [
  "id",
  "ensaio_id",
  "equipamento_id",
  "data_inicio",
  "data_fim",
  "data_inicio_prevista",
  "duracao_dias",
  "data_inicio_real",
  "data_fim_real",
  "inicio_real_ts",
  "fim_real_ts",
  "status",
  "progresso",
  "observacoes",
  "tecnico",
  "incluir_fds",
  "predecessor_id",
  "created_at",
  "updated_at",
];

export type Programacao = {
  id: string;
  ensaio_id: string;
  equipamento_id: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  data_inicio_prevista: string | null;
  duracao_dias: number;
  data_inicio_real: string | null;
  data_fim_real: string | null;
  inicio_real_ts: string | null;
  fim_real_ts: string | null;
  status: "planejado" | "em_execucao" | "concluido";
  progresso: number;
  observacoes: string | null;
  tecnico: string | null;
  incluir_fds: boolean;
  /** Ensaio que precisa terminar antes deste começar — base da cascata de reagendamento. */
  predecessor_id: string | null;
};

/** Converte uma linha crua (string a string) da planilha "Programações" no modelo tipado único. */
export function parseProgramacaoRow(r: Record<string, string>): Programacao {
  const prevista = r.data_inicio_prevista || r.data_inicio || null;
  let dur = Number(r.duracao_dias || 0);
  if (!dur && r.data_inicio && r.data_fim) {
    const a = new Date(r.data_inicio + "T00:00:00").getTime();
    const b = new Date(r.data_fim + "T00:00:00").getTime();
    dur = Math.max(1, Math.round((b - a) / 86400000) + 1);
  }
  if (!dur) dur = 1;
  const inicioReal = r.data_inicio_real || null;
  const fimReal = r.data_fim_real || null;
  const inicioRealTs = r.inicio_real_ts || null;
  const fimRealTs = r.fim_real_ts || null;
  const rawStatus = (r.status || "").trim().toLowerCase() as Programacao["status"];
  const status: Programacao["status"] = fimReal
    ? "concluido"
    : inicioReal
      ? "em_execucao"
      : rawStatus === "em_execucao" || rawStatus === "concluido"
        ? rawStatus
        : "planejado";
  const incluir_fds = parseIncluirFds(r.incluir_fds);
  const effInicio = inicioReal || prevista;
  const effFim = fimReal || (effInicio ? endIsoFromDur(effInicio, dur, incluir_fds) : null);

  return {
    id: r.id,
    ensaio_id: r.ensaio_id ?? "",
    equipamento_id: r.equipamento_id || null,
    data_inicio: effInicio,
    data_fim: effFim,
    data_inicio_prevista: prevista,
    duracao_dias: dur,
    data_inicio_real: inicioReal,
    data_fim_real: fimReal,
    inicio_real_ts: inicioRealTs,
    fim_real_ts: fimRealTs,
    status,
    progresso: Number(r.progresso || (status === "concluido" ? 100 : status === "em_execucao" ? 50 : 0)),
    observacoes: r.observacoes || null,
    tecnico: r.tecnico || null,
    incluir_fds,
    predecessor_id: r.predecessor_id || null,
  };
}
