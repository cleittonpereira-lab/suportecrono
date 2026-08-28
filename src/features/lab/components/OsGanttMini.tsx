/**
 * Gantt somente-leitura filtrado pra uma única OS — mesmos dados da
 * Programação (Programações/Ensaios/Amostras/Tipos de Ensaio/Equipamentos),
 * só que restrito aos itens dessa OS. Não é o Gantt operacional completo
 * (_app.programacao.gantt.tsx, com edição/arraste) — é uma leitura rápida
 * do previsto × real dentro do hub da OS, ao estilo MS Project (previsto e
 * real lado a lado, com o desvio em dias).
 *
 * Dois modos: "Consolidado" (escala ajustada à largura, sem rolagem — boa
 * visão geral) e "Ver tudo" (largura fixa por dia, com rolagem horizontal —
 * mais preciso pra intervalos longos).
 */
import { useMemo, useState } from "react";
import { differenceInCalendarDays, format, addDays, isValid, parseISO, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { equipColor } from "@/lib/equip-colors";
import { normOs } from "@/lib/schedule-utils";

interface Row {
  id: string;
  label: string;
  equipamento: string;
  status: string;
  previstoInicio: Date | null;
  previstoFim: Date | null;
  realInicio: Date | null;
  realFim: Date | null;
}

function parseDate(v: unknown): Date | null {
  if (!v || typeof v !== "string") return null;
  const d = v.includes("T") || /^\d{4}-\d{2}-\d{2}$/.test(v) ? parseISO(v) : new Date(v);
  return isValid(d) ? d : null;
}

function fmt(d: Date) {
  return format(d, "dd/MM", { locale: ptBR });
}

const DAY_PX = 34; // largura fixa de 1 dia no modo "ver tudo"

export function OsGanttMini({
  osNumero,
  progs,
  ensaiosProg,
  amostrasProg,
  tiposProg,
  equipsProg,
  dataOriginal,
  historicoData,
}: {
  osNumero: string;
  progs: any[];
  ensaiosProg: any[];
  amostrasProg: any[];
  tiposProg: any[];
  equipsProg: any[];
  /** Data originalmente acordada com o cliente (linha tracejada vermelha) */
  dataOriginal?: string | null;
  /** Histórico de reprogramações (linhas tracejadas âmbar) */
  historicoData?: Array<{ data: string; alteradoPor?: string; alteradoEm?: string }>;
}) {
  const [expandido, setExpandido] = useState(false);

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

      const previstoInicio = parseDate(prog.data_inicio);
      const previstoFim = parseDate(prog.data_fim) ?? previstoInicio;
      const realInicio = parseDate(prog.data_inicio_real);
      const realFim = parseDate(prog.data_fim_real) ?? realInicio;

      if (!previstoInicio && !realInicio) continue;

      out.push({
        id: prog.id,
        label: `${am.codigo_amostra || am.identificacao || "AM"} · ${tp?.nome || "Ensaio"}`,
        equipamento: eq?.nome || "Sem equipamento",
        status: prog.status || "pendente",
        previstoInicio,
        previstoFim: previstoFim && previstoInicio && previstoFim < previstoInicio ? previstoInicio : previstoFim,
        realInicio,
        realFim: realFim && realInicio && realFim < realInicio ? realInicio : realFim,
      });
    }
    return out.sort((a, b) => (a.previstoInicio ?? a.realInicio!).getTime() - (b.previstoInicio ?? b.realInicio!).getTime());
  }, [osNumero, progs, ensaiosProg, amostrasProg, tiposProg, equipsProg]);

  const hoje = useMemo(() => startOfDay(new Date()), []);

  const { rangeStart, totalDays } = useMemo(() => {
    let min = hoje;
    let max = addDays(hoje, 14);
    for (const r of rows) {
      const starts = [r.previstoInicio, r.realInicio].filter(Boolean) as Date[];
      const ends = [r.previstoFim, r.realFim].filter(Boolean) as Date[];
      for (const d of starts) if (d < min) min = d;
      for (const d of ends) if (d > max) max = d;
    }
    const start = addDays(min, -2);
    const end = addDays(max, 3);
    return { rangeStart: start, totalDays: Math.max(1, differenceInCalendarDays(end, start)) };
  }, [rows, hoje]);

  const diasMarcadores = useMemo(() => {
    const passo = expandido ? 1 : Math.max(1, Math.round(totalDays / 12));
    const marcos: { d: number; label: string }[] = [];
    for (let d = 0; d <= totalDays; d += passo) marcos.push({ d, label: fmt(addDays(rangeStart, d)) });
    return marcos;
  }, [rangeStart, totalDays, expandido]);

  const equipamentosUnicos = useMemo(() => Array.from(new Set(rows.map((r) => r.equipamento))), [rows]);

  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground py-2">Nenhum item de programação (bancada) encontrado pra essa OS.</div>;
  }

  const trackWidth = expandido ? totalDays * DAY_PX : undefined;
  const pct = (d: number) => (expandido ? d * DAY_PX : (d / totalDays) * 100);
  const unit = expandido ? "px" : "%";
  const hojeOffset = differenceInCalendarDays(hoje, rangeStart);

  const parseDateSafe = (v?: string | null) => {
    if (!v) return null;
    const d = parseISO(v);
    return isValid(d) ? d : null;
  };

  const dataOriginalParsed = parseDateSafe(dataOriginal);
  const dataOriginalOffset = dataOriginalParsed ? differenceInCalendarDays(dataOriginalParsed, rangeStart) : null;

  const reprogramacoesParsed = useMemo(() => {
    return (historicoData || [])
      .map((h, idx) => ({
        idx: idx + 1,
        date: parseDateSafe(h.data),
        alteradoPor: h.alteradoPor,
        alteradoEm: h.alteradoEm,
      }))
      .filter((h): h is { idx: number; date: Date; alteradoPor?: string; alteradoEm?: string } => h.date !== null);
  }, [historicoData]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground">{rows.length} ite{rows.length === 1 ? "m" : "ns"} de programação</div>
        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2" onClick={() => setExpandido((v) => !v)}>
          {expandido ? <><Minimize2 className="h-3 w-3" /> Consolidar</> : <><Maximize2 className="h-3 w-3" /> Ver tudo</>}
        </Button>
      </div>

      <div className={expandido ? "overflow-x-auto" : ""}>
        <div style={expandido ? { width: trackWidth ? trackWidth + 176 : undefined } : undefined}>
          <div className="flex text-[10px] text-muted-foreground">
            <div className="w-40 shrink-0" />
            <div className="w-24 shrink-0" />
            <div className="relative flex-1 h-6 border-b" style={expandido ? { width: trackWidth } : undefined}>
              {diasMarcadores.map((m, i) => (
                <div key={i} className="absolute top-0 border-l border-border/70 pl-1 h-full" style={{ left: `${pct(m.d)}${unit}` }}>
                  {m.label}
                </div>
              ))}
              <div className="absolute top-0 border-l-2 border-primary h-full z-10" style={{ left: `${pct(hojeOffset)}${unit}` }}>
                <span className="absolute -top-3 -translate-x-1/2 bg-primary text-primary-foreground text-[8px] px-1 rounded font-semibold whitespace-nowrap">Hoje</span>
              </div>

              {/* Marcador de Data Original no cabeçalho */}
              {dataOriginalOffset !== null && dataOriginalOffset >= 0 && dataOriginalOffset <= totalDays && (
                <div className="absolute top-0 border-l-2 border-rose-500 h-full z-20" style={{ left: `${pct(dataOriginalOffset)}${unit}` }}>
                  <span className="absolute -top-3.5 -translate-x-1/2 bg-rose-500 text-white text-[9px] px-1 rounded font-bold whitespace-nowrap shadow-sm">
                    Orig: {fmt(dataOriginalParsed!)}
                  </span>
                </div>
              )}

              {/* Marcadores de Reprogramações no cabeçalho */}
              {reprogramacoesParsed.map((rep) => {
                const repOffset = differenceInCalendarDays(rep.date, rangeStart);
                if (repOffset < 0 || repOffset > totalDays) return null;
                return (
                  <div key={rep.idx} className="absolute top-0 border-l-2 border-amber-500 h-full z-20" style={{ left: `${pct(repOffset)}${unit}` }}>
                    <span className="absolute -top-3.5 -translate-x-1/2 bg-amber-500 text-white text-[9px] px-1 rounded font-bold whitespace-nowrap shadow-sm">
                      Reprog {rep.idx}: {fmt(rep.date)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {rows.map((r) => {
            const cor = equipColor(r.equipamento);
            const temAmbos = !!(r.previstoInicio && r.realInicio);
            const delta = temAmbos ? differenceInCalendarDays(r.realInicio!, r.previstoInicio!) : null;
            const deltaLabel =
              delta === null ? null : delta > 0 ? `${delta}d de atraso` : delta < 0 ? `${Math.abs(delta)}d adiantado` : "no prazo previsto";
            const deltaColor = delta === null ? "" : delta > 0 ? "text-rose-600" : delta < 0 ? "text-emerald-600" : "text-muted-foreground";

            return (
              <div key={r.id} className="flex items-center gap-0 py-2 border-b border-border/40 last:border-0">
                <div className="w-40 shrink-0 text-xs text-foreground truncate pr-2 font-medium" title={r.label}>{r.label}</div>
                <div className="w-24 shrink-0 flex items-center gap-1.5 text-[10px] text-muted-foreground truncate pr-2">
                  <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cor.border }} />
                  <span className="truncate" title={r.equipamento}>{r.equipamento}</span>
                </div>
                <div className="relative flex-1" style={{ height: 26, width: expandido ? trackWidth : undefined }}>
                  {/* Linha vertical de Data Original (Vermelha) */}
                  {dataOriginalOffset !== null && dataOriginalOffset >= 0 && dataOriginalOffset <= totalDays && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-rose-500/70 z-10 pointer-events-none"
                      style={{ left: `${pct(dataOriginalOffset)}${unit}` }}
                    />
                  )}

                  {/* Linhas verticais de Datas Reprogramadas (Âmbar) */}
                  {reprogramacoesParsed.map((rep) => {
                    const repOffset = differenceInCalendarDays(rep.date, rangeStart);
                    if (repOffset < 0 || repOffset > totalDays) return null;
                    return (
                      <div
                        key={rep.idx}
                        className="absolute top-0 bottom-0 w-px bg-amber-500/70 z-10 pointer-events-none"
                        style={{ left: `${pct(repOffset)}${unit}` }}
                      />
                    );
                  })}
                  {r.previstoInicio && r.previstoFim && (
                    <div
                      className="absolute top-0.5 h-2.5 rounded"
                      style={{
                        left: `${pct(differenceInCalendarDays(r.previstoInicio, rangeStart))}${unit}`,
                        width: `${Math.max(expandido ? 3 : 1, pct(Math.max(1, differenceInCalendarDays(r.previstoFim, r.previstoInicio) + 1)))}${unit}`,
                        border: `1.5px dashed ${cor.border}`,
                        backgroundColor: "transparent",
                      }}
                      title={`Previsto: ${fmt(r.previstoInicio)} – ${fmt(r.previstoFim)}`}
                    />
                  )}
                  {r.realInicio && r.realFim && (
                    <div
                      className="absolute bottom-0.5 h-2.5 rounded"
                      style={{
                        left: `${pct(differenceInCalendarDays(r.realInicio, rangeStart))}${unit}`,
                        width: `${Math.max(expandido ? 3 : 1, pct(Math.max(1, differenceInCalendarDays(r.realFim, r.realInicio) + 1)))}${unit}`,
                        backgroundColor: cor.bg,
                        border: `1.5px solid ${cor.border}`,
                      }}
                      title={`Real: ${fmt(r.realInicio)} – ${fmt(r.realFim)}`}
                    />
                  )}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 text-[10px] whitespace-nowrap"
                    style={{
                      left: `calc(${pct(differenceInCalendarDays((r.realFim ?? r.previstoFim)!, rangeStart))}${unit} + 8px)`,
                    }}
                  >
                    <span style={{ color: cor.text }} className="font-semibold">
                      {r.realInicio ? fmt(r.realInicio) : fmt(r.previstoInicio!)}
                      {(r.realFim ?? r.previstoFim) && (r.realFim ?? r.previstoFim)!.getTime() !== (r.realInicio ?? r.previstoInicio)!.getTime()
                        ? ` – ${fmt((r.realFim ?? r.previstoFim)!)}`
                        : ""}
                    </span>
                    {deltaLabel && <span className={`ml-1.5 font-medium ${deltaColor}`}>({deltaLabel})</span>}
                    {!temAmbos && !r.realInicio && <span className="ml-1.5 text-muted-foreground">(previsto)</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded border-[1.5px] border-solid border-foreground/40 bg-muted" /> Real</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded border-[1.5px] border-dashed border-foreground/40" /> Previsto</span>
        <span className="flex items-center gap-1"><span className="inline-block w-0.5 h-3 bg-primary" /> Hoje</span>
        <span className="flex items-center gap-1"><span className="inline-block w-px h-3 bg-rose-500" /> <span className="text-rose-600">Data Original</span></span>
        <span className="flex items-center gap-1"><span className="inline-block w-px h-3 bg-amber-500" /> <span className="text-amber-600">Reprogramações</span></span>
        <span className="text-rose-600">■ Atraso</span>
        <span className="text-emerald-600">■ Adiantado</span>
        {equipamentosUnicos.length > 0 && (
          <span className="flex items-center gap-2 flex-wrap">
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
