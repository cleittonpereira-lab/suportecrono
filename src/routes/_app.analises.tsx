import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useSchedule } from "@/hooks/use-schedule";
import {
  applyFilters,
  emptyFilters,
  getDeltaDays,
  isAtrasado,
  isPendente,
  monthKey,
  parseBrDate,
  weekKey,
  MONTH_SHORT,
} from "@/lib/schedule-utils";
import { ScheduleFilterBar } from "@/components/schedule-filter-bar";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import type { ScheduleRow } from "@/lib/sheets.functions";
import { PageHeader } from "@/components/page-header";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_app/analises")({
  head: () => ({ meta: [{ title: "Análises | LabFlow" }] }),
  component: Page,
});

function Page() {
  const { data } = useSchedule();
  const [filters, setFilters] = useState(emptyFilters);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!data) return <div className="text-muted-foreground">Carregando...</div>;
  const rows = applyFilters(data.rows, filters);

  return (
    <div className="space-y-6 w-full">
      <PageHeader
        eyebrow="Análises · Produtividade"
        icon={BarChart3}
        title="Análises"
        description="Insights sobre produtividade, tomadores e prazos"
      />
      <ScheduleFilterBar
        rows={data.rows}
        filters={filters}
        onChange={setFilters}
        filteredCount={rows.length}
        totalCount={data.rows.length}
      />

      {!mounted ? (
        <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
          Carregando gráficos...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SetorProdutividade rows={rows} />
          <RankingTomadores rows={rows} />
          <CargaSemanal rows={rows} />
          <CargaMensal rows={rows} />
          <TendenciaAtrasos rows={rows} />
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  full,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border bg-card ${full ? "lg:col-span-2" : ""}`}
    >
      <div className="px-4 py-3 border-b">
        <h2 className="font-semibold text-sm">{title}</h2>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* === 1. Produtividade por setor === */
function SetorProdutividade({ rows }: { rows: ScheduleRow[] }) {
  const stats = useMemo(() => {
    const map = new Map<
      string,
      { total: number; atrasadas: number; deltaSum: number; deltaCount: number }
    >();
    for (const r of rows) {
      const k = r.setor || "—";
      if (!map.has(k))
        map.set(k, { total: 0, atrasadas: 0, deltaSum: 0, deltaCount: 0 });
      const s = map.get(k)!;
      s.total++;
      if (isAtrasado(r)) s.atrasadas++;
      const d = getDeltaDays(r);
      if (d !== null) {
        s.deltaSum += d;
        s.deltaCount++;
      }
    }
    return Array.from(map.entries())
      .map(([setor, s]) => ({
        setor,
        total: s.total,
        atrasadas: s.atrasadas,
        noPrazo: s.total - s.atrasadas,
        pctAtraso: s.total ? Math.round((s.atrasadas / s.total) * 100) : 0,
        mediaDelta: s.deltaCount
          ? Math.round((s.deltaSum / s.deltaCount) * 10) / 10
          : null,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [rows]);

  const config = {
    noPrazo: { label: "No prazo", color: "var(--chart-2)" },
    atrasadas: { label: "Atrasadas", color: "var(--destructive)" },
  } satisfies ChartConfig;

  return (
    <Card
      title="Produtividade por setor"
      subtitle="OS por setor, com fatia de atrasados"
    >
      {stats.length === 0 ? (
        <Empty />
      ) : (
        <>
          <ChartContainer config={config} className="h-[260px] w-full">
            <BarChart data={stats} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="setor"
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <YAxis tickLine={false} axisLine={false} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="noPrazo" stackId="a" fill="var(--color-noPrazo)" />
              <Bar
                dataKey="atrasadas"
                stackId="a"
                fill="var(--color-atrasadas)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {stats.slice(0, 6).map((s) => (
              <div
                key={s.setor}
                className="flex items-center justify-between rounded-md border px-2 py-1.5"
              >
                <span className="font-medium truncate">{s.setor}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="secondary" className="text-[10px]">
                    {s.total}
                  </Badge>
                  <Badge
                    variant={s.pctAtraso > 30 ? "destructive" : "outline"}
                    className="text-[10px]"
                  >
                    {s.pctAtraso}% atraso
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/* === 2. Ranking de tomadores === */
function RankingTomadores({ rows }: { rows: ScheduleRow[] }) {
  const stats = useMemo(() => {
    const map = new Map<string, { total: number; atrasadas: number }>();
    for (const r of rows) {
      const k = r.tomador || "—";
      if (!map.has(k)) map.set(k, { total: 0, atrasadas: 0 });
      const s = map.get(k)!;
      s.total++;
      if (isAtrasado(r)) s.atrasadas++;
    }
    return Array.from(map.entries())
      .map(([tomador, s]) => ({ tomador, ...s }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [rows]);

  const max = Math.max(...stats.map((s) => s.total), 1);

  return (
    <Card
      title="Ranking de tomadores"
      subtitle="Top 10 por volume — barra vermelha = atrasados"
    >
      {stats.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-2">
          {stats.map((s, i) => {
            const wTotal = (s.total / max) * 100;
            const wAtraso = (s.atrasadas / max) * 100;
            return (
              <li key={s.tomador} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium truncate">
                    {i + 1}. {s.tomador}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {s.total} OS · {s.atrasadas} atrasadas
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary rounded-full"
                    style={{ width: `${wTotal}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 bg-destructive rounded-full"
                    style={{ width: `${wAtraso}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* === 3. Carga semanal === */
function CargaSemanal({ rows }: { rows: ScheduleRow[] }) {
  const stats = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const d = parseBrDate(r.dataEntrega);
      if (!d) continue;
      const k = weekKey(d);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([k, total]) => {
        const d = new Date(k + "T00:00:00");
        return {
          label: `${String(d.getDate()).padStart(2, "0")}/${MONTH_SHORT[d.getMonth()]}`,
          total,
        };
      });
  }, [rows]);

  const config = {
    total: { label: "Entregas", color: "var(--chart-1)" },
  } satisfies ChartConfig;

  return (
    <Card
      title="Carga semanal"
      subtitle="Entregas previstas por semana (últimas 12)"
    >
      {stats.length === 0 ? (
        <Empty />
      ) : (
        <ChartContainer config={config} className="h-[260px] w-full">
          <BarChart data={stats} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={11}
            />
            <YAxis tickLine={false} axisLine={false} fontSize={11} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="total"
              fill="var(--color-total)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      )}
    </Card>
  );
}

/* === 4. Carga mensal === */
function CargaMensal({ rows }: { rows: ScheduleRow[] }) {
  const stats = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const d = parseBrDate(r.dataEntrega);
      if (!d) continue;
      const k = monthKey(d);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, total]) => {
        const [y, m] = k.split("-");
        return { label: `${MONTH_SHORT[parseInt(m, 10) - 1]}/${y.slice(2)}`, total };
      });
  }, [rows]);

  const config = {
    total: { label: "Entregas", color: "var(--chart-3)" },
  } satisfies ChartConfig;

  return (
    <Card title="Carga mensal" subtitle="Total de entregas por mês">
      {stats.length === 0 ? (
        <Empty />
      ) : (
        <ChartContainer config={config} className="h-[260px] w-full">
          <BarChart data={stats} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={11}
            />
            <YAxis tickLine={false} axisLine={false} fontSize={11} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="total" radius={[4, 4, 0, 0]}>
              {stats.map((_, i) => (
                <Cell key={i} fill="var(--color-total)" />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </Card>
  );
}

/* === 5. Tendência de atrasos === */
function TendenciaAtrasos({ rows }: { rows: ScheduleRow[] }) {
  const stats = useMemo(() => {
    // group by postage month
    const map = new Map<
      string,
      { total: number; atrasadas: number; pendentes: number }
    >();
    for (const r of rows) {
      const d = parseBrDate(r.dataPostagem) ?? parseBrDate(r.dataEntrega);
      if (!d) continue;
      const k = monthKey(d);
      if (!map.has(k)) map.set(k, { total: 0, atrasadas: 0, pendentes: 0 });
      const s = map.get(k)!;
      s.total++;
      if (isAtrasado(r)) s.atrasadas++;
      if (isPendente(r)) s.pendentes++;
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, s]) => {
        const [y, m] = k.split("-");
        return {
          label: `${MONTH_SHORT[parseInt(m, 10) - 1]}/${y.slice(2)}`,
          ...s,
        };
      });
  }, [rows]);

  const config = {
    atrasadas: { label: "Atrasadas", color: "var(--destructive)" },
    pendentes: { label: "Sem data", color: "var(--chart-4)" },
    total: { label: "Total", color: "var(--chart-2)" },
  } satisfies ChartConfig;

  return (
    <Card
      title="Tendência de atrasos ao longo do tempo"
      subtitle="Evolução mensal de OS atrasadas, sem data e total"
      full
    >
      {stats.length === 0 ? (
        <Empty />
      ) : (
        <ChartContainer config={config} className="h-[300px] w-full">
          <LineChart data={stats} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={11}
            />
            <YAxis tickLine={false} axisLine={false} fontSize={11} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="total"
              stroke="var(--color-total)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="atrasadas"
              stroke="var(--color-atrasadas)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="pendentes"
              stroke="var(--color-pendentes)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      )}
    </Card>
  );
}

function Empty() {
  return (
    <div className="text-center py-12 text-sm text-muted-foreground">
      Sem dados suficientes para esta análise.
    </div>
  );
}