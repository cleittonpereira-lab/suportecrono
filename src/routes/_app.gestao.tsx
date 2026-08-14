import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useEntregues } from "@/hooks/use-entregues";
import { parseBrDate, MONTH_NAMES, uniqueSorted } from "@/lib/schedule-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_app/gestao")({
  head: () => ({ meta: [{ title: "Dashboard de Gestão | LabFlow" }] }),
  component: Page,
});

type Farol = "verde" | "amarelo" | "vermelho";

function classify(delta: string): Farol | null {
  const n = parseInt(delta, 10);
  if (isNaN(n)) return null;
  if (n <= 0) return "verde";
  if (n <= 5) return "amarelo";
  return "vermelho";
}

const FAROL_COLORS: Record<Farol, string> = {
  verde: "hsl(142 71% 45%)",
  amarelo: "hsl(45 93% 47%)",
  vermelho: "hsl(0 72% 51%)",
};

const FAROL_LABELS: Record<Farol, string> = {
  verde: "Na data ou antes",
  amarelo: "Atraso ≤ 5 dias",
  vermelho: "Atraso > 5 dias",
};

function Page() {
  const { data, isLoading } = useEntregues();
  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [setor, setSetor] = useState<string>("all");
  const [tomador, setTomador] = useState<string>("all");

  const rowsWithMeta = useMemo(() => {
    if (!data) return [];
    return data.rows.map((r) => {
      const d = parseBrDate(r.dataProgramada) ?? parseBrDate(r.dataPostagem);
      return {
        ...r,
        _farol: classify(r.delta),
        _year: d ? d.getFullYear() : null,
        _month: d ? d.getMonth() : null,
      };
    });
  }, [data]);

  const years = useMemo(
    () =>
      uniqueSorted(
        rowsWithMeta.map((r) => (r._year ? String(r._year) : "")),
      ).reverse(),
    [rowsWithMeta],
  );
  const setores = useMemo(
    () => uniqueSorted(rowsWithMeta.map((r) => r.setor)),
    [rowsWithMeta],
  );
  const tomadores = useMemo(
    () => uniqueSorted(rowsWithMeta.map((r) => r.tomador)),
    [rowsWithMeta],
  );

  const filtered = useMemo(() => {
    return rowsWithMeta.filter((r) => {
      if (year !== "all" && String(r._year) !== year) return false;
      if (month !== "all" && String(r._month) !== month) return false;
      if (setor !== "all" && r.setor !== setor) return false;
      if (tomador !== "all" && r.tomador !== tomador) return false;
      return r._farol !== null;
    });
  }, [rowsWithMeta, year, month, setor, tomador]);

  const counts = useMemo(() => {
    const c = { verde: 0, amarelo: 0, vermelho: 0 };
    filtered.forEach((r) => {
      if (r._farol) c[r._farol]++;
    });
    return c;
  }, [filtered]);

  const total = counts.verde + counts.amarelo + counts.vermelho;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const pieData = [
    { name: FAROL_LABELS.verde, value: counts.verde, key: "verde" },
    { name: FAROL_LABELS.amarelo, value: counts.amarelo, key: "amarelo" },
    { name: FAROL_LABELS.vermelho, value: counts.vermelho, key: "vermelho" },
  ];

  // Por setor
  const porSetor = useMemo(() => {
    const map = new Map<string, { verde: number; amarelo: number; vermelho: number }>();
    filtered.forEach((r) => {
      const key = r.setor || "—";
      if (!map.has(key)) map.set(key, { verde: 0, amarelo: 0, vermelho: 0 });
      if (r._farol) map.get(key)![r._farol]++;
    });
    return Array.from(map.entries())
      .map(([setor, v]) => ({ setor, ...v, total: v.verde + v.amarelo + v.vermelho }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filtered]);

  // Top tomadores com atraso
  const topAtrasos = useMemo(() => {
    const map = new Map<string, { atrasos: number; total: number }>();
    filtered.forEach((r) => {
      const key = r.tomador || "—";
      if (!map.has(key)) map.set(key, { atrasos: 0, total: 0 });
      const v = map.get(key)!;
      v.total++;
      if (r._farol === "amarelo" || r._farol === "vermelho") v.atrasos++;
    });
    return Array.from(map.entries())
      .map(([tomador, v]) => ({ tomador, ...v, pct: v.total ? (v.atrasos / v.total) * 100 : 0 }))
      .filter((x) => x.atrasos > 0)
      .sort((a, b) => b.atrasos - a.atrasos)
      .slice(0, 10);
  }, [filtered]);

  if (isLoading || !data)
    return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 w-full">
      <PageHeader
        eyebrow="Análises · Gestão"
        title="Dashboard de Gestão"
        description={
          <>
            Faróis de entrega baseados em OS Entregues ·{" "}
            <span className="text-foreground font-medium tabular-nums">{total}</span> ordens analisadas
          </>
        }
      />

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Ano</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mês</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Setor</Label>
            <Select value={setor} onValueChange={setSetor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {setores.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tomador</Label>
            <Select value={tomador} onValueChange={setTomador}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {tomadores.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Faróis */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FarolCard
          farol="verde"
          icon={<CheckCircle2 className="h-5 w-5" />}
          count={counts.verde}
          pct={pct(counts.verde)}
        />
        <FarolCard
          farol="amarelo"
          icon={<AlertTriangle className="h-5 w-5" />}
          count={counts.amarelo}
          pct={pct(counts.amarelo)}
        />
        <FarolCard
          farol="vermelho"
          icon={<XCircle className="h-5 w-5" />}
          count={counts.vermelho}
          pct={pct(counts.vermelho)}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição geral</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.key} fill={FAROL_COLORS[d.key as Farol]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Faróis por setor (top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porSetor}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="setor" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="verde" stackId="a" fill={FAROL_COLORS.verde} name="Verde" />
                  <Bar dataKey="amarelo" stackId="a" fill={FAROL_COLORS.amarelo} name="Amarelo" />
                  <Bar dataKey="vermelho" stackId="a" fill={FAROL_COLORS.vermelho} name="Vermelho" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top tomadores com atrasos</CardTitle>
        </CardHeader>
        <CardContent>
          {topAtrasos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum atraso no filtro atual.</p>
          ) : (
            <div className="space-y-2">
              {topAtrasos.map((t) => (
                <div
                  key={t.tomador}
                  className="flex items-center justify-between gap-3 py-2 border-b last:border-0"
                >
                  <span className="text-sm font-medium truncate">{t.tomador}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="destructive">{t.atrasos} atrasos</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t.pct.toFixed(0)}% de {t.total}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FarolCard({
  farol,
  icon,
  count,
  pct,
}: {
  farol: Farol;
  icon: React.ReactNode;
  count: number;
  pct: number;
}) {
  const color = FAROL_COLORS[farol];
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5" style={{ background: color }} />
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color }}>
              {FAROL_LABELS[farol]}
            </p>
            <p className="text-3xl font-bold mt-1 tabular-nums">{count}</p>
            <p className="text-xs text-muted-foreground mt-1">{pct}% do total</p>
          </div>
          <div
            className="h-12 w-12 rounded-full flex items-center justify-center"
            style={{ background: `${color}20`, color }}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}