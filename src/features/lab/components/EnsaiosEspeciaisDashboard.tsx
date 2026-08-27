/**
 * KPIs consolidados das OS de Ensaios Especiais — status dos ensaios, prazos
 * e quantidade, num relance.
 */
import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, FlaskConical, CalendarClock, AlertTriangle } from "lucide-react";
import { useEnsaiosEspeciaisRows } from "@/features/lab/components/EnsaiosEspeciaisView";

function parseLocalDate(dateOnly: string): Date {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function KpiCard({ icon: Icon, label, value, sub, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={`font-display text-2xl font-semibold tabular-nums ${accent ?? ""}`}>{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${accent ? "bg-primary/15" : "bg-muted"}`}>
          <Icon className={`h-4.5 w-4.5 ${accent ?? "text-muted-foreground"}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export function EnsaiosEspeciaisDashboard() {
  const rows = useEnsaiosEspeciaisRows();

  const stats = useMemo(() => {
    const ativas = rows.filter((r) => !r.arquivada);
    const totalEnsaios = ativas.reduce((a, r) => a + r.totalEnsaios, 0);
    const concluidosEnsaios = ativas.reduce((a, r) => a + r.concluidos, 0);
    const comPrazo = ativas.filter((r) => r.dataAcordadaAtual).length;
    const semPrazo = ativas.length - comPrazo;

    let atrasadas = 0, vencendoEmBreve = 0, noPrazo = 0;
    for (const r of ativas) {
      if (!r.dataAcordadaAtual) continue;
      const diff = Math.ceil((parseLocalDate(r.dataAcordadaAtual).getTime() - Date.now()) / 86_400_000);
      if (diff < 0) atrasadas++;
      else if (diff <= 3) vencendoEmBreve++;
      else noPrazo++;
    }

    return { totalOs: ativas.length, totalEnsaios, concluidosEnsaios, comPrazo, semPrazo, atrasadas, vencendoEmBreve, noPrazo };
  }, [rows]);

  const chartData = [
    { name: "No prazo", qtd: stats.noPrazo, fill: "#10b981" },
    { name: "Vence em ≤3d", qtd: stats.vencendoEmBreve, fill: "#f59e0b" },
    { name: "Atrasada", qtd: stats.atrasadas, fill: "#f43f5e" },
    { name: "Sem prazo", qtd: stats.semPrazo, fill: "#94a3b8" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Building} label="OS Especiais Ativas" value={stats.totalOs} />
        <KpiCard icon={FlaskConical} label="Ensaios" value={`${stats.concluidosEnsaios}/${stats.totalEnsaios}`} sub="concluídos / total" accent="text-primary" />
        <KpiCard icon={AlertTriangle} label="Atrasadas" value={stats.atrasadas} accent={stats.atrasadas > 0 ? "text-rose-600" : undefined} />
        <KpiCard icon={CalendarClock} label="Vencendo em ≤3 dias" value={stats.vencendoEmBreve} accent={stats.vencendoEmBreve > 0 ? "text-amber-600" : undefined} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">OS por situação de prazo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(v: number) => [v, "OS"]}
                />
                <Bar dataKey="qtd" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
