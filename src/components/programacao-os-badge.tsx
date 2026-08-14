import { useState } from "react";
import { ChevronDown, ChevronRight, FlaskConical } from "lucide-react";
import {
  useProgramacaoByOs,
  PROG_STATUS_LABEL,
  PROG_STATUS_PILL,
  fmtProgDate,
  type ProgStatus,
  type ProgOsSummary,
} from "@/hooks/use-programacao-by-os";
import { Button } from "@/components/ui/button";

/** Ordem de exibição dos contadores (só aparecem os > 0). */
const ORDER: ProgStatus[] = [
  "em_execucao",
  "atrasado",
  "programado",
  "pendente",
  "concluido",
  "cancelado",
];

const DOT: Record<ProgStatus, string> = {
  em_execucao: "status-bar-execucao",
  atrasado: "status-bar-atrasado",
  programado: "status-bar-programado",
  pendente: "status-bar-pendente",
  concluido: "status-bar-concluido",
  cancelado: "bg-muted-foreground/50",
};

/**
 * Chip compacto (usado nas células da tabela de cronograma) mostrando o
 * resumo da programação daquela OS.
 */
export function ProgramacaoOsChip({ os }: { os: string }) {
  const { lookup } = useProgramacaoByOs();
  const s = os ? lookup(os) : undefined;
  if (!s || s.total === 0) return null;
  const parts = ORDER.filter((k) => s.counts[k] > 0);
  return (
    <div
      className="mt-1 inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] leading-none"
      title={`Programação: ${s.total} ensaio${s.total === 1 ? "" : "s"}`}
    >
      <FlaskConical className="h-3 w-3 text-muted-foreground" />
      <span className="font-semibold text-muted-foreground uppercase tracking-wide">
        Prog
      </span>
      <span className="tabular-nums text-foreground">{s.total}</span>
      {parts.map((k) => (
        <span key={k} className="inline-flex items-center gap-0.5" title={PROG_STATUS_LABEL[k]}>
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[k]}`} />
          <span className="tabular-nums">{s.counts[k]}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Painel completo (usado no diálogo de detalhes) — lista cada ensaio dessa
 * OS com status, amostra e datas planejadas/reais.
 */
export function ProgramacaoOsPanel({ os }: { os: string }) {
  const [open, setOpen] = useState(false);
  const { lookup, isLoading } = useProgramacaoByOs();
  const s = os ? lookup(os) : undefined;
  if (!os) return null;
  if (!s || s.total === 0) return null;
  return (
    <div className="rounded-md border bg-muted/20">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="w-full justify-between h-auto py-2 px-3 hover:bg-muted/40"
      >
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <FlaskConical className="h-3.5 w-3.5" />
          Programação de ensaios
          <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
            ({isLoading ? "..." : s.total})
          </span>
        </span>
        <Summary s={s} />
      </Button>
      {open && (
        <div className="border-t p-3">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40">
                <tr className="text-left">
                  <th className="py-1 px-2 font-medium">Status</th>
                  <th className="py-1 px-2 font-medium">Ensaio</th>
                  <th className="py-1 px-2 font-medium">Amostra</th>
                  <th className="py-1 px-2 font-medium">Identificação</th>
                  <th className="py-1 px-2 font-medium whitespace-nowrap">Prof.</th>
                  <th className="py-1 px-2 font-medium whitespace-nowrap">Início</th>
                  <th className="py-1 px-2 font-medium whitespace-nowrap">Fim previsto</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((it) => (
                  <tr key={it.ensaioId} className="border-t">
                    <td className="py-1.5 px-2">
                      <span className={PROG_STATUS_PILL[it.status]}>{PROG_STATUS_LABEL[it.status]}</span>
                    </td>
                    <td className="py-1.5 px-2">{it.tipoNome}</td>
                    <td className="py-1.5 px-2 font-mono text-[11px]">{it.amostraCodigo || "—"}</td>
                    <td className="py-1.5 px-2 text-[11px]">{it.amostraIdentificacao || "—"}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap tabular-nums text-[11px]">
                      {it.amostraProfundidade || "—"}
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap tabular-nums">{fmtProgDate(it.inicio)}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap tabular-nums">{fmtProgDate(it.fim)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({ s }: { s: ProgOsSummary }) {
  const parts = ORDER.filter((k) => s.counts[k] > 0);
  return (
    <span className="inline-flex items-center gap-1.5">
      {parts.map((k) => (
        <span
          key={k}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
          title={PROG_STATUS_LABEL[k]}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[k]}`} />
          <span className="tabular-nums">{s.counts[k]}</span>
        </span>
      ))}
    </span>
  );
}