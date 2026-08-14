import { useMemo, useState } from "react";
import { useCadastroOs } from "@/hooks/use-cadastro-os";
import {
  SERVICOS,
  MESES,
  type Servico,
  type Mes,
} from "@/lib/cadastro.functions";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Users, UserCog, Layers, TrendingUp } from "lucide-react";
import { RailCard } from "@/components/rail-card";

const SERVICO_COLOR: Record<Servico, string> = {
  SP: "#3b82f6", ST: "#06b6d4", PI: "#14b8a6", SM: "#10b981",
  CPTU: "#84cc16", VT: "#eab308", SH: "#f59e0b", BL: "#f97316",
  BQ: "#f43f5e", DN: "#d946ef", SR: "#8b5cf6", SEG: "#64748b",
};

export function CadastroDashboardView() {
  const { data, isLoading } = useCadastroOs();
  const [mes, setMes] = useState<"all" | Mes>("all");

  const rows = useMemo(() => {
    if (!data) return [];
    return mes === "all" ? data.rows : data.rows.filter((r) => r.mes === mes);
  }, [data, mes]);

  const stats = useMemo(() => {
    const totalOs = rows.length;
    const totalQtd = rows.reduce((a, r) => a + r.totalHoras, 0);
    const tomadores = new Set(rows.map((r) => r.tomador.trim()).filter(Boolean));
    const sups = new Set(rows.map((r) => r.sup.trim()).filter(Boolean));
    const media = totalOs > 0 ? totalQtd / totalOs : 0;
    return { totalOs, totalQtd, tomadores: tomadores.size, sups: sups.size, media };
  }, [rows]);

  const porMes = useMemo(() => {
    if (!data) return [];
    return MESES.map((m) => {
      const list = data.rows.filter((r) => r.mes === m);
      return { mes: m, os: list.length, qtd: list.reduce((a, r) => a + r.totalHoras, 0) };
    });
  }, [data]);

  const porServico = useMemo(() => {
    return SERVICOS.map((s) => {
      let qtd = 0, os = 0;
      for (const r of rows) {
        const v = r.servicos[s];
        if (v && v > 0) { qtd += v; os += 1; }
      }
      return { servico: s, qtd, os, fill: SERVICO_COLOR[s] };
    }).sort((a, b) => b.qtd - a.qtd);
  }, [rows]);

  const topTomadores = useMemo(() => {
    const map = new Map<string, { os: number; qtd: number }>();
    for (const r of rows) {
      const k = r.tomador.trim() || "—";
      const cur = map.get(k) ?? { os: 0, qtd: 0 };
      cur.os += 1; cur.qtd += r.totalHoras;
      map.set(k, cur);
    }
    return [...map.entries()]
      .map(([tomador, v]) => ({ tomador, ...v }))
      .sort((a, b) => b.os - a.os)
      .slice(0, 10);
  }, [rows]);

  const topSups = useMemo(() => {
    const map = new Map<string, { os: number; qtd: number }>();
    for (const r of rows) {
      const k = r.sup.trim() || "—";
      const cur = map.get(k) ?? { os: 0, qtd: 0 };
      cur.os += 1; cur.qtd += r.totalHoras;
      map.set(k, cur);
    }
    return [...map.entries()]
      .map(([sup, v]) => ({ sup, ...v }))
      .sort((a, b) => b.os - a.os)
      .slice(0, 10);
  }, [rows]);

  if (isLoading || !data)
    return <div className="text-muted-foreground">Carregando...</div>;

  const kpis = [
    { label: "OS cadastradas", value: stats.totalOs, icon: FileText },
    { label: "Quantidade total", value: stats.totalQtd.toLocaleString("pt-BR"), icon: Layers },
    { label: "Tomadores únicos", value: stats.tomadores, icon: Users },
    { label: "SUPs atuantes", value: stats.sups, icon: UserCog },
    { label: "Média qtd/OS", value: stats.media.toFixed(1), icon: TrendingUp },
  ];

  return (
    <div className="space-y-5">
      {/* Filtro Mês */}
      <div className="flex items-center justify-end">
        <Select value={mes} onValueChange={(v) => setMes(v as "all" | Mes)}>
          <SelectTrigger className="h-8 w-[160px]">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {MESES.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((k, i) => (
          <RailCard
            key={k.label}
            tone={i === 0 ? "primary" : i === 1 ? "amber" : "muted"}
            eyebrow={k.label}
            icon={k.icon}
            title=""
            bodyClassName="pt-0 pb-4"
          >
            <div className="text-[28px] leading-none font-bold tabular-nums tracking-tight">
              {k.value}
            </div>
          </RailCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">OS por mês</h2>
            <span className="text-xs text-muted-foreground">
              {porMes.reduce((a, m) => a + m.os, 0)} OS no período
            </span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porMes} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, name: string) => [v.toLocaleString("pt-BR"), name === "os" ? "OS" : "Qtd"]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="os" name="OS" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="qtd" name="Qtd" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Distribuição por serviço</h2>
            <span className="text-xs text-muted-foreground">
              {porServico.reduce((a, s) => a + s.qtd, 0).toLocaleString("pt-BR")} qtd total
            </span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porServico} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="servico" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => v.toLocaleString("pt-BR")}
              />
              <Bar dataKey="qtd" name="Qtd" radius={[4, 4, 0, 0]}>
                {porServico.map((s) => (
                  <Cell key={s.servico} fill={s.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Top 10 tomadores</h2>
          <div className="space-y-2">
            {topTomadores.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center">Sem dados</div>
            )}
            {topTomadores.map((t) => {
              const max = topTomadores[0].os;
              const pct = (t.os / max) * 100;
              return (
                <div key={t.tomador} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="truncate font-medium" title={t.tomador}>{t.tomador}</span>
                    <span className="tabular-nums text-muted-foreground whitespace-nowrap ml-2">
                      {t.os} OS · {t.qtd.toLocaleString("pt-BR")} qtd
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">OS por SUP</h2>
          <div className="space-y-2">
            {topSups.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center">Sem dados</div>
            )}
            {topSups.map((s) => {
              const max = topSups[0].os;
              const pct = (s.os / max) * 100;
              return (
                <div key={s.sup} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="truncate font-medium" title={s.sup}>{s.sup}</span>
                    <span className="tabular-nums text-muted-foreground whitespace-nowrap ml-2">
                      {s.os} OS · {s.qtd.toLocaleString("pt-BR")} qtd
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">Participação por serviço (qtd)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={porServico.filter((s) => s.qtd > 0)}
                dataKey="qtd"
                nameKey="servico"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
              >
                {porServico.filter((s) => s.qtd > 0).map((s) => (
                  <Cell key={s.servico} fill={s.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => v.toLocaleString("pt-BR")}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {porServico.filter((s) => s.qtd > 0).map((s) => {
              const total = porServico.reduce((a, x) => a + x.qtd, 0) || 1;
              const pct = ((s.qtd / total) * 100).toFixed(1);
              return (
                <div key={s.servico} className="flex items-center gap-2 text-xs">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.fill }} />
                  <span className="font-semibold">{s.servico}</span>
                  <span className="text-muted-foreground tabular-nums ml-auto">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}