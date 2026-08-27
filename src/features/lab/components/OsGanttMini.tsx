/**
 * Gantt somente-leitura filtrado pra uma única OS — mesmos dados da
 * Programação (Programações/Ensaios/Amostras/Tipos de Ensaio/Equipamentos),
 * só que restrito aos itens dessa OS. Não é o Gantt operacional completo
 * (_app.programacao.gantt.tsx, com edição/arraste) — é uma leitura rápida
 * do planejado × real dentro do hub da OS, com as datas sempre visíveis
 * (não só no hover).
 */
import { useMemo } from "react";
import { differenceInCalendarDays, format, addDays, isValid, parseISO, startOfDay } from "date-fns";
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

function fmt(d: Date) {
  return format(d, "dd/MM", { locale: ptBR });
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
        equipamento: eq?.nome || "Sem equipamento",
        status: prog.status || "pendente",
        inicio,
        fim: fim < inicio ? inicio : fim,
        real: Boolean(inicioReal && fimReal),
      });
    }
    return out.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  }, [osNumero, progs, ensaiosProg, amostrasProg, tiposProg, equipsProg]);

  const hoje = useMemo(() => startOfDay(new Date()), []);

  const { rangeStart, totalDays, diasMarcadores } = useMemo(() => {
    let min = rows.length > 0 ? rows[0].inicio : hoje;
    let max = rows.length > 0 ? rows[0].fim : addDays(hoje, 14);
    for (const r of rows) {
      if (r.inicio < min) min = r.inicio;
      if (r.fim > max) max = r.fim;
    }
    if (hoje < min) min = hoje;
    if (hoje > max) max = hoje;
    const start = addDays(min, -2);
    const end = addDays(max, 3);
    const total = Math.max(1, differenceInCalendarDays(end, start));
    const marcos: { pct: number; label: string; hoje: boolean }[] = [];
    for (let d = 0; d <= total; d += 7) {
      marcos.push({ pct: (d / total) * 100, label: fmt(addDays(start, d)), hoje: false });
    }
    return { rangeStart: start, totalDays: total, diasMarcadores: marcos };
  }, [rows, hoje]);

  const hojePct = (differenceInCalendarDays(hoje, rangeStart) / totalDays) * 100;

  const equipamentosUnicos = useMemo(() => Array.from(new Set(rows.map((r) => r.equipamento))), [rows]);

  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground py-2">Nenhum item de programação (bancada) encontrado pra essa OS.</div>;
  }

  return (
    <div className="space-y-0">
      <div className="flex text-[10px] text-muted-foreground">
        <div className="w-44 shrink-0" />
        <div className="w-24 shrink-0" />
        <div className="relative flex-1 h-5 border-b">
          {diasMarcadores.map((m, i) => (
            <div key={i} className="absolute top-0 border-l border-border/70 pl-1 h-full" style={{ left: `${m.pct}%` }}>
              {m.label}
            </div>
          ))}
          <div className="absolute top-0 border-l-2 border-primary h-full" style={{ left: `${hojePct}%` }} />
        </div>
      </div>

      {rows.map((r) => {
        const startPct = (differenceInCalendarDays(r.inicio, rangeStart) / totalDays) * 100;
        const widthPct = Math.max(1.2, (differenceInCalendarDays(r.fim, r.inicio) / totalDays) * 100 || 1.2);
        const cor = equipColor(r.equipamento);
        const duracaoDias = Math.max(1, differenceInCalendarDays(r.fim, r.inicio) + 1);
        const dataLabel = r.fim.getTime() === r.inicio.getTime() ? fmt(r.inicio) : `${fmt(r.inicio)} – ${fmt(r.fim)}`;
        return (
          <div key={r.id} className="flex items-center gap-0 py-1.5 border-b border-border/40 last:border-0">
            <div className="w-44 shrink-0 text-xs text-foreground truncate pr-2 font-medium" title={r.label}>{r.label}</div>
            <div className="w-24 shrink-0 flex items-center gap-1.5 text-[10px] text-muted-foreground truncate pr-2">
              <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cor.border }} />
              <span className="truncate" title={r.equipamento}>{r.equipamento}</span>
            </div>
            <div className="relative flex-1 h-7">
              <div
                className="absolute inset-y-1.5 rounded"
                style={{
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: cor.bg,
                  border: `1.5px ${r.real ? "solid" : "dashed"} ${cor.border}`,
                }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 text-[10px] font-semibold whitespace-nowrap"
                style={{ left: `calc(${startPct + widthPct}% + 6px)`, color: cor.text }}
              >
                {dataLabel} <span className="text-muted-foreground font-normal">({duracaoDias}d{r.real ? " · real" : " · previsto"})</span>
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded border-[1.5px] border-solid border-foreground/40 bg-muted" /> Executado (real)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2.5 rounded border-[1.5px] border-dashed border-foreground/40 bg-muted" /> Previsto (ainda não executado)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-0.5 h-3 bg-primary" /> Hoje</span>
        {equipamentosUnicos.length > 0 && (
          <span className="flex items-center gap-2">
            {equipamentosUnicos.map((eq) => (
              <span key={eq} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: equipColor(eq).border }} /> {eq}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
