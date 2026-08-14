import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Activity as ActivityIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useSchedule } from "@/hooks/use-schedule";
import {
  parseBrDate,
  dateKey,
  MONTH_NAMES,
  WEEK_DAYS,
  uniqueSorted,
} from "@/lib/schedule-utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FlaskConical, Layers, Activity } from "lucide-react";

export const Route = createFileRoute("/_app/saturacao")({
  head: () => ({ meta: [{ title: "Avaliação de Saturação | LabFlow" }] }),
  component: Page,
});

function parseNum(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

const COMP_COLOR = "hsl(217 91% 60%)";
const CARACT_COLOR = "hsl(280 75% 60%)";

function Page() {
  const { data, isLoading, error } = useSchedule();
  const rows = data?.rows ?? [];

  const years = useMemo(() => {
    const ys = new Set<number>();
    rows.forEach((r) => {
      const d = parseBrDate(r.dataEntrega);
      if (d) ys.add(d.getFullYear());
    });
    return Array.from(ys).sort((a, b) => b - a);
  }, [rows]);

  const setores = useMemo(() => uniqueSorted(rows.map((r) => r.setor)), [rows]);

  const now = new Date();
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [month, setMonth] = useState<string>(String(now.getMonth()));
  const [setor, setSetor] = useState<string>("all");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const d = parseBrDate(r.dataEntrega);
      if (!d) return false;
      if (year !== "all" && d.getFullYear() !== parseInt(year, 10)) return false;
      if (month !== "all" && d.getMonth() !== parseInt(month, 10)) return false;
      if (setor !== "all" && r.setor !== setor) return false;
      return true;
    });
  }, [rows, year, month, setor]);

  const byDay = useMemo(() => {
    const map = new Map<
      string,
      { date: Date; comp: number; caract: number }
    >();
    filtered.forEach((r) => {
      const d = parseBrDate(r.dataEntrega);
      if (!d) return;
      const k = dateKey(d);
      const cur = map.get(k) ?? { date: d, comp: 0, caract: 0 };
      cur.comp += parseNum(r.volumeComp);
      cur.caract += parseNum(r.volumeCaract);
      map.set(k, cur);
    });
    return Array.from(map.entries())
      .map(([k, v]) => ({ key: k, ...v, total: v.comp + v.caract }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filtered]);

  const totals = useMemo(() => {
    const comp = byDay.reduce((s, d) => s + d.comp, 0);
    const caract = byDay.reduce((s, d) => s + d.caract, 0);
    const dias = byDay.filter((d) => d.total > 0).length;
    return {
      comp,
      caract,
      total: comp + caract,
      dias,
      mediaDia: dias > 0 ? (comp + caract) / dias : 0,
      picoDia: byDay.reduce(
        (max, d) => (d.total > max.total ? d : max),
        { total: 0, key: "", date: new Date() } as { total: number; key: string; date: Date },
      ),
    };
  }, [byDay]);

  const chartData = byDay.map((d) => ({
    label: `${String(d.date.getDate()).padStart(2, "0")}/${String(d.date.getMonth() + 1).padStart(2, "0")}`,
    Compactação: d.comp,
    Caracterização: d.caract,
    weekday: WEEK_DAYS[d.date.getDay()],
  }));

  return (
    <div className="space-y-6 w-full">
      <PageHeader
        eyebrow="Análises · Operação"
        icon={ActivityIcon}
        title="Avaliação de Saturação"
        description="Quantidade de ensaios por dia — Compactação e Caracterização"
      />

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Ano</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mês</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Setor</Label>
            <Select value={setor} onValueChange={setSetor}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {setores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ensaios</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.total.toLocaleString("pt-BR")}</div>
            <p className="text-xs text-muted-foreground">
              em {totals.dias} dia(s)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compactação</CardTitle>
            <Layers className="h-4 w-4" style={{ color: COMP_COLOR }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.comp.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Caracterização</CardTitle>
            <FlaskConical className="h-4 w-4" style={{ color: CARACT_COLOR }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.caract.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Média / dia</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totals.mediaDia.toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}
            </div>
            {totals.picoDia.total > 0 && (
              <p className="text-xs text-muted-foreground">
                Pico: {totals.picoDia.total} em{" "}
                {totals.picoDia.date.toLocaleDateString("pt-BR")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compactação por dia</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : error ? (
            <div className="text-sm text-destructive">
              Erro ao carregar dados
            </div>
          ) : chartData.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Sem ensaios no período selecionado.
            </div>
          ) : (
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Compactação" fill={COMP_COLOR} />
                  <ReferenceLine
                    y={80}
                    stroke="#000000"
                    strokeDasharray="6 4"
                    strokeWidth={2}
                    label={{
                      value: "Meta máx. 80",
                      position: "insideTopRight",
                      fill: "#000000",
                      fontSize: 11,
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Caracterização por dia</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : error ? (
            <div className="text-sm text-destructive">
              Erro ao carregar dados
            </div>
          ) : chartData.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Sem ensaios no período selecionado.
            </div>
          ) : (
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Caracterização" fill={CARACT_COLOR} />
                  <ReferenceLine
                    y={80}
                    stroke="#000000"
                    strokeDasharray="6 4"
                    strokeWidth={2}
                    label={{
                      value: "Meta máx. 80",
                      position: "insideTopRight",
                      fill: "#000000",
                      fontSize: 11,
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalhamento diário</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Dia</TableHead>
                  <TableHead className="text-right">Compactação</TableHead>
                  <TableHead className="text-right">Caracterização</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byDay.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Sem dados
                    </TableCell>
                  </TableRow>
                ) : (
                  byDay.map((d) => (
                    <TableRow key={d.key}>
                      <TableCell>{d.date.toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell>{WEEK_DAYS[d.date.getDay()]}</TableCell>
                      <TableCell className="text-right">{d.comp.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right">{d.caract.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right font-semibold">{d.total.toLocaleString("pt-BR")}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}