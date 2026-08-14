import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listRows } from "@/lib/programacao.functions";
import { parseIncluirFds, normalizeDurationDays, endIsoFromDur } from "@/lib/business-days";
import { normOs } from "@/lib/schedule-utils";

const SHEET_AMOSTRAS = "Amostras";
const SHEET_ENSAIOS = "Ensaios";
const SHEET_PROGS = "Programações";
const SHEET_TIPOS = "Tipos de Ensaio";

export type ProgStatus =
  | "pendente"
  | "atrasado"
  | "programado"
  | "em_execucao"
  | "concluido"
  | "cancelado";

export type ProgEnsaioItem = {
  ensaioId: string;
  tipoNome: string;
  amostraCodigo: string | null;
  amostraIdentificacao: string | null;
  amostraProfundidade: string | null;
  status: ProgStatus;
  inicio: string | null;
  fim: string | null;
};

export type ProgOsSummary = {
  os: string;
  total: number;
  counts: Record<ProgStatus, number>;
  items: ProgEnsaioItem[];
};

function derive(
  ensaioStatus: string,
  prog: {
    status?: string;
    data_inicio_prevista?: string | null;
    data_inicio_real?: string | null;
    data_fim_real?: string | null;
  } | null,
  prazo: string | null,
): ProgStatus {
  if (ensaioStatus === "concluido") return "concluido";
  if (ensaioStatus === "cancelado") return "cancelado";
  if (!prog) {
    if (prazo) {
      const d = new Date(prazo);
      if (!isNaN(d.getTime()) && d.getTime() < Date.now()) return "atrasado";
    }
    return "pendente";
  }
  if (prog.status === "em_execucao" || ensaioStatus === "em_execucao") return "em_execucao";
  if (prog.status === "concluido") return "concluido";
  const ini = prog.data_inicio_prevista ? new Date(prog.data_inicio_prevista) : null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (ini && !isNaN(ini.getTime()) && ini.getTime() < hoje.getTime()) return "atrasado";
  return "programado";
}

export function useProgramacaoByOs() {
  const { data: amostras = [], isLoading: la } = useQuery({
    queryKey: ["amostras"],
    queryFn: async () => listRows({ data: { sheet: SHEET_AMOSTRAS } }),
  });
  const { data: ensaios = [], isLoading: le } = useQuery({
    queryKey: ["ensaios"],
    queryFn: async () => listRows({ data: { sheet: SHEET_ENSAIOS } }),
  });
  const { data: progs = [], isLoading: lp } = useQuery({
    queryKey: ["programacoes"],
    queryFn: async () => listRows({ data: { sheet: SHEET_PROGS } }),
  });
  const { data: tipos = [], isLoading: lt } = useQuery({
    queryKey: ["tipos_ensaio_min"],
    queryFn: async () => listRows({ data: { sheet: SHEET_TIPOS } }),
  });

  const byOs = useMemo(() => {
    const tipoNome = new Map<string, string>();
    for (const t of tipos) tipoNome.set(t.id, t.nome ?? "");
    const amostraById = new Map<
      string,
      { os: string; codigo: string | null; identificacao: string | null; profundidade: string | null }
    >();
    for (const a of amostras) {
      amostraById.set(a.id, {
        os: a.os_numero ?? "",
        codigo: a.codigo_amostra || null,
        // Mesma lógica da aba Gantt: a "identificação" (ex.: SH-402-01) é
        // gravada no campo `descricao` da aba Amostras antes do " — ".
        identificacao:
          (a.descricao ? String(a.descricao).split(" — ")[0] : "") ||
          a.identificacao ||
          null,
        profundidade: a.profundidade || null,
      });
    }
    const progByEnsaio = new Map<string, Record<string, string>>();
    for (const p of progs) progByEnsaio.set(p.ensaio_id, p);

    const emptyCounts = (): Record<ProgStatus, number> => ({
      pendente: 0,
      atrasado: 0,
      programado: 0,
      em_execucao: 0,
      concluido: 0,
      cancelado: 0,
    });
    const map = new Map<string, ProgOsSummary>();

    for (const e of ensaios) {
      const am = amostraById.get(e.amostra_id ?? "");
      if (!am) continue;
      const key = normOs(am.os);
      if (!key) continue;
      const prog = progByEnsaio.get(e.id) ?? null;
      const status = derive(e.status ?? "", prog, e.prazo || null);
      let inicio: string | null = null;
      let fim: string | null = null;
      if (prog) {
        inicio = prog.data_inicio_real || prog.data_inicio_prevista || null;
        if (prog.data_fim_real) fim = prog.data_fim_real;
        else if (prog.data_fim) fim = prog.data_fim;
        else if (prog.data_inicio_prevista) {
          const dur = normalizeDurationDays(Number(prog.duracao_dias) || 1, 1);
          fim = endIsoFromDur(
            prog.data_inicio_prevista,
            dur,
            parseIncluirFds(prog.incluir_fds),
          );
        }
      }
      const item: ProgEnsaioItem = {
        ensaioId: e.id,
        tipoNome: tipoNome.get(e.tipo_ensaio_id ?? "") ?? "Ensaio",
        amostraCodigo: am.codigo,
        amostraIdentificacao: am.identificacao,
        amostraProfundidade: am.profundidade,
        status,
        inicio,
        fim,
      };
      const cur = map.get(key) ?? {
        os: am.os,
        total: 0,
        counts: emptyCounts(),
        items: [] as ProgEnsaioItem[],
      };
      cur.total += 1;
      cur.counts[status] += 1;
      cur.items.push(item);
      map.set(key, cur);
    }
    const order: Record<ProgStatus, number> = {
      em_execucao: 0,
      atrasado: 1,
      programado: 2,
      pendente: 3,
      concluido: 4,
      cancelado: 5,
    };
    for (const v of map.values()) v.items.sort((a, b) => order[a.status] - order[b.status]);
    return map;
  }, [amostras, ensaios, progs, tipos]);

  return {
    isLoading: la || le || lp || lt,
    lookup: (os: string): ProgOsSummary | undefined => byOs.get(normOs(os)),
  };
}

export const PROG_STATUS_LABEL: Record<ProgStatus, string> = {
  pendente: "Pendente",
  atrasado: "Atrasado",
  programado: "Programado",
  em_execucao: "Em execução",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const PROG_STATUS_PILL: Record<ProgStatus, string> = {
  pendente: "status-pill status-pendente",
  atrasado: "status-pill status-atrasado",
  programado: "status-pill status-programado",
  em_execucao: "status-pill status-execucao",
  concluido: "status-pill status-concluido",
  cancelado: "status-pill status-pendente opacity-60",
};

export function fmtProgDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("pt-BR");
}