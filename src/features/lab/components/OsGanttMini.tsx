/**
 * Gantt somente-leitura filtrado pra uma única OS — mesmos dados da
 * Programação (Programações/Ensaios/Amostras/Tipos de Ensaio/Equipamentos),
 * só que restrito aos itens dessa OS. Não é o Gantt operacional completo
 * (_app.programacao.gantt.tsx, com edição/arraste) — é uma leitura rápida
 * do planejado × real dentro do hub da OS.
 */
import { useMemo } from "react";
import { differenceInCalendarDays, format, addDays, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { equipColor } from "@/lib/equip-colors";
import { normOs } from "@/lib/schedule-utils";

interface Row {
  id: string;
  label: string;
  equipamento: string;
  status: string;
  inicio: Date;
  fim: Date;
  real: boolean;
}

function parseDate(v: unknown): Date | null {
  if (!v || typeof v !== "string") return null;
  const d = v.includes("T") || /^\d{4}-\d{2}-\d{2}$/.test(v) ? parseISO(v) : new Date(v);
  return isValid(d) ? d : null;
}

export function OsGanttMini({
  osNumero,
  progs,
  ensaiosProg,
  amostrasProg,
  tiposProg,
  equipsProg,
}: {
  osNumero: string;
  progs: any[];
  ensaiosProg: any[];
  amostrasProg: any[];
  tiposProg: any[];
  equipsProg: any[];
}) {
  const rows = useMemo<Row[]>(() => {
    const enMap = new Map(ensaiosProg.map((e) => [e.id, e]));
    const amMap = new Map(amostrasProg.map((a) => [a.id, a]));
    const tpMap = new Map(tiposProg.map((t) => [t.id, t]));
    const eqMap = new Map(equipsProg.map((eq) => [eq.id, eq]));

    const out: Row[] = [];
    for (const prog of progs) {
      const en = enMap.get(prog.ensaio_id ?? "");
      const am = en ? amMap.get(en.amostra_id ?? "") : undefined;
      if (!am || normOs(am.os_numero || "") !== normOs(osNumero)) continue;

      const tp = en ? tpMap.get(en.tipo_ensaio_id ?? "") : undefined;
      const eq = prog.equipamento_id ? eqMap.get(prog.equipamento_id) : undefined;

      const inicioReal = parseDate(prog.data_inicio_real);
      const fimReal = parseDate(prog.data_fim_real);
      const inicioPrev = parseDate(prog.data_inicio);
      const fimPrev = parseDate(prog.data_fim);

      const inicio = inicioReal ?? inicioPrev;
      const fim = fimReal ?? fimPrev ?? inicio;
      if (!inicio || !fim) continue;

      out.push({
        id: prog.id,
        label: `${am.codigo_amostra || am.identificacao || "AM"} · ${tp?.nome || "Ensaio"}`,
        equipamento: eq?.nome || "—",
        status: prog.status || "pendente",
        inicio,
        fim: fim < inicio ? inicio : fim,
        real: Boolean(inicioReal && fimReal),
      });
    }
    return out.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }, [osNumero, progs, ensaiosProg, amostrasProg, tiposProg, equipsProg]);

  const { rangeStart, rangeEnd, totalDays } = useMemo(() => {
    if (rows.length === 0) {
      const hoje = new Date();
      return { rangeStart: hoje, rangeEnd: addDays(hoje, 14), totalDays: 14 };
    }
    let min = rows[0].inicio;
    let max = rows[0].fim;
    for (const r of rows) {
      if (r.inicio < min) min = r.inicio;
      if (r.fim > max) max = r.fim;
    }
    const start = addDays(min, -1);
    const end = addDays(max, 2);
    return { rangeStart: start, rangeEnd: end, totalDays: Math.max(1, differenceInCalendarDays(end, start)) };
  }, [rows]);

  const semanaMarcadores = useMemo(() => {
    const marcos: { pct: number; label: string }[] = [];
    for (let d = 0; d <= totalDays; d += 7) {
      const date = addDays(rangeStart, d);
      marcos.push({ pct: (d / totalDays) * 100, label: format(date, "dd/MM", { locale: ptBR }) });
    }
    return marcos;
  }, [rangeStart, totalDays]);

  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground py-2">Nenhum item de programação (bancada) encontrado pra essa OS.</div>;
  }

  return (
    <div className="space-y-0.5">
      <div className="relative h-5 ml-40 border-b text-[10px] text-muted-foreground">
        {semanaMarcadores.map((m, i) => (
          <div key={i} className="absolute top-0 -translate-x-1/2" style={{ left: `${m.pct}%` }}>
            {m.label}
          </div>
        ))}
      </div>
      {rows.map((r) => {
        const startPct = (differenceInCalendarDays(r.inicio, rangeStart) / totalDays) * 100;
        const widthPct = Math.max(1.5, (differenceInCalendarDays(r.fim, r.inicio) / totalDays) * 100 || 1.5);
        const cor = equipColor(r.equipamento);
        return (
          <div key={r.id} className="flex items-center gap-2 py-1">
            <div className="w-40 shrink-0 text-[11px] text-foreground truncate pr-2" title={r.label}>{r.label}</div>
            <div className="relative flex-1 h-6 bg-muted/30 rounded">
              <div
                className={`absolute top-0.5 h-5 rounded flex items-center px-1.5 text-[10px] font-medium truncate ${r.real ? "" : "opacity-60 border border-dashed"}`}
                style={{
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: cor.bg,
                  color: cor.text,
                  borderColor: cor.border,
                }}
                title={`${r.equipamento} · ${format(r.inicio, "dd/MM", { locale: ptBR })} – ${format(r.fim, "dd/MM", { locale: ptBR })}${r.real ? " (real)" : " (previsto)"}`}
              >
                {r.equipamento}
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-3 pt-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded bg-primary/30 border border-primary/50" /> Real</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded border border-dashed border-muted-foreground/50 opacity-60" /> Previsto</span>
      </div>
    </div>
  );
}
