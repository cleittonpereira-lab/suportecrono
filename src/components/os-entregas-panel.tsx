import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Truck } from "lucide-react";
import { useEntregues } from "@/hooks/use-entregues";
import { useSchedule } from "@/hooks/use-schedule";
import { SetorBadges } from "@/components/setor-badges";
import { Button } from "@/components/ui/button";
import { parseBrDate, normOs } from "@/lib/schedule-utils";
import type { EntregueRow, ScheduleRow } from "@/lib/sheets.functions";

type Farol = "entregue" | "atrasado" | "hoje" | "futura" | "indef";

export interface EntregaItem {
  farol: Farol;
  dataPostagem: string;
  dataProgramada: string;
  setor: string;
  laboratorio: string;
  volumeComp: string;
  volumeCaract: string;
  volumeEspec: string;
  escopo: string;
  origem: "entregue" | "cronograma";
}

function farolEntregue(e: EntregueRow): Farol {
  if (e.dataPostagem && e.dataPostagem.trim()) return "entregue";
  const prog = parseBrDate(e.dataProgramada);
  if (!prog) return "indef";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const t = prog.getTime();
  const h = hoje.getTime();
  if (t < h) return "atrasado";
  if (t === h) return "hoje";
  return "futura";
}

function entregueToItem(e: EntregueRow): EntregaItem {
  return {
    farol: farolEntregue(e),
    dataPostagem: e.dataPostagem,
    dataProgramada: e.dataProgramada,
    setor: e.setor,
    laboratorio: e.laboratorio,
    volumeComp: e.volumeComp,
    volumeCaract: e.volumeCaract,
    volumeEspec: e.volumeEspec,
    escopo: e.escopo,
    origem: "entregue",
  };
}

function scheduleToItem(s: ScheduleRow): EntregaItem {
  return {
    farol: "futura",
    dataPostagem: s.dataPostagem,
    dataProgramada: s.dataEntrega,
    setor: s.setor,
    laboratorio: s.laboratorio,
    volumeComp: s.volumeComp,
    volumeCaract: s.volumeCaract,
    volumeEspec: "",
    escopo: s.escopo,
    origem: "cronograma",
  };
}

const FAROL_CLS: Record<Farol, string> = {
  entregue:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  atrasado:
    "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  hoje: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  futura:
    "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  indef: "bg-muted text-muted-foreground border-border",
};
const FAROL_LBL: Record<Farol, string> = {
  entregue: "Entregue",
  atrasado: "Atrasado",
  hoje: "Hoje",
  futura: "Futura",
  indef: "—",
};

export function FarolBadge({ f }: { f: Farol }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${FAROL_CLS[f]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {FAROL_LBL[f]}
    </span>
  );
}

export function useOsEntregas({
  os,
  excludeProgramada,
  excludeLaboratorio,
}: {
  os: string;
  excludeProgramada?: string;
  excludeLaboratorio?: string;
}) {
  const { data: entrData, isLoading: l1 } = useEntregues();
  const { data: schedData, isLoading: l2 } = useSchedule();

  return useMemo(() => {
    const key = normOs(os);
    const exProg = (excludeProgramada || "").trim();
    const exLab = (excludeLaboratorio || "").trim().toLowerCase();
    const matchesExclusion = (prog: string, lab: string) => {
      if (!exProg) return false;
      if (prog.trim() !== exProg) return false;
      if (exLab && lab.trim().toLowerCase() !== exLab) return false;
      return true;
    };

    const passadas: EntregaItem[] = [];
    const futuras: EntregaItem[] = [];

    if (entrData && key) {
      for (const r of entrData.rows) {
        if (normOs(r.os) !== key) continue;
        if (matchesExclusion(r.dataProgramada, r.laboratorio)) continue;
        const it = entregueToItem(r);
        if (it.farol === "futura") futuras.push(it);
        else passadas.push(it);
      }
    }

    if (schedData && key) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      for (const r of schedData.rows) {
        if (normOs(r.os) !== key) continue;
        if (matchesExclusion(r.dataEntrega, r.laboratorio)) continue;
        const d = parseBrDate(r.dataEntrega);
        if (!d) continue;
        if (d.getTime() <= hoje.getTime()) continue;
        // dedupe: já está em entregues (mesma programada + laboratorio)?
        const dup = futuras.some(
          (f) =>
            f.dataProgramada.trim() === r.dataEntrega.trim() &&
            (f.laboratorio || "").trim().toLowerCase() ===
              (r.laboratorio || "").trim().toLowerCase(),
        );
        if (dup) continue;
        futuras.push(scheduleToItem(r));
      }
    }

    return { passadas, futuras, isLoading: l1 || l2 };
  }, [entrData, schedData, os, excludeProgramada, excludeLaboratorio, l1, l2]);
}

export function OsEntregasPanel({
  os,
  excludeProgramada,
  excludeLaboratorio,
}: {
  os: string;
  excludeProgramada?: string;
  excludeLaboratorio?: string;
}) {
  const [open, setOpen] = useState(false);
  const { passadas, futuras, isLoading } = useOsEntregas({
    os,
    excludeProgramada,
    excludeLaboratorio,
  });
  const total = passadas.length + futuras.length;

  if (!os) return null;

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
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <Truck className="h-3.5 w-3.5" />
          Entregas desta OS
          <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
            ({isLoading ? "..." : total})
          </span>
        </span>
      </Button>
      {open && (
        <div className="border-t p-3 space-y-4">
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Carregando entregas...</div>
          ) : total === 0 ? (
            <div className="text-xs text-muted-foreground">
              Nenhuma entrega registrada para esta OS.
            </div>
          ) : (
            <>
              <EntregasTable
                title={`Realizadas / Atrasadas (${passadas.length})`}
                rows={passadas}
              />
              {futuras.length > 0 && (
                <EntregasTable
                  title={`Futuras (${futuras.length})`}
                  rows={futuras}
                  highlight
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function EntregasTable({
  title,
  rows,
  highlight = false,
}: {
  title: string;
  rows: EntregaItem[];
  highlight?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 font-semibold">
        {title}
      </div>
      <div
        className={`overflow-x-auto rounded-md border ${highlight ? "bg-sky-50/40 dark:bg-sky-950/10" : ""}`}
      >
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/40">
            <tr className="text-left">
              <th className="py-1 px-2 font-medium">Farol</th>
              <th className="py-1 px-2 font-medium">Postagem</th>
              <th className="py-1 px-2 font-medium">Programada</th>
              <th className="py-1 px-2 font-medium">Setor</th>
              <th className="py-1 px-2 font-medium">Laboratório</th>
              <th className="py-1 px-2 font-medium text-right">Comp.</th>
              <th className="py-1 px-2 font-medium text-right">Caract.</th>
              <th className="py-1 px-2 font-medium text-right">Espec.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={i} className="border-t">
                <td className="py-1.5 px-2">
                  <FarolBadge f={e.farol} />
                </td>
                <td className="py-1.5 px-2 whitespace-nowrap">{e.dataPostagem || "—"}</td>
                <td className="py-1.5 px-2 whitespace-nowrap">{e.dataProgramada || "—"}</td>
                <td className="py-1.5 px-2">
                  {e.setor ? <SetorBadges setor={e.setor} size="xs" /> : "—"}
                </td>
                <td
                  className="py-1.5 px-2 max-w-[220px] truncate"
                  title={e.laboratorio}
                >
                  {e.laboratorio || "—"}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums">
                  {e.volumeComp || "—"}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums">
                  {e.volumeCaract || "—"}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums">
                  {e.volumeEspec || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
