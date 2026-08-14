import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listRows } from "@/lib/programacao.functions";
import { endIsoFromDur, parseIncluirFds } from "@/lib/business-days";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  LayoutDashboard, AlertTriangle, CheckCircle2, Clock, Wrench, FlaskConical, Timer,
} from "lucide-react";

const SHEET_AMOSTRAS = "Amostras";
const SHEET_ENSAIOS = "Ensaios";
const SHEET_PROGS = "Programações";
const SHEET_TIPOS = "Tipos de Ensaio";
const SHEET_EQUIPS = "Equipamentos";

type Ensaio = {
  id: string; amostra_id: string; tipo_ensaio_id: string;
  status: "pendente" | "programado" | "em_execucao" | "concluido" | "cancelado";
  prazo: string | null;
};
type Programacao = {
  id: string; ensaio_id: string; equipamento_id: string | null;
  status: "planejado" | "em_execucao" | "concluido";
  data_inicio_prevista: string | null;
  duracao_dias: number;
  data_inicio_real: string | null;
  data_fim_real: string | null;
  data_fim: string | null;
  incluir_fds: boolean;
};

type EfStatus =
  | "pendente"
  | "atrasado"
  | "programado"
  | "em_execucao"
  | "concluido"
  | "cancelado";

const EF_COLOR: Record<EfStatus, string> = {
  pendente: "#f59e0b",
  atrasado: "#ef4444",
  programado: "#0ea5e9",
  em_execucao: "#8b5cf6",
  concluido: "#10b981",
  cancelado: "#94a3b8",
};
const EF_LABEL: Record<EfStatus, string> = {
  pendente: "Programação pendente",
  atrasado: "Não iniciado e atrasado",
  programado: "Programado",
  em_execucao: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const Route = createFileRoute("/_app/programacao/dashboard")({
  component: DashPage,
});

function DashPage() {
  const { data: amostras = [] } = useQuery({
    queryKey: ["amostras"],
    queryFn: async () => await listRows({ data: { sheet: SHEET_AMOSTRAS } }),
  });
  const { data: ensaios = [] } = useQuery({
    queryKey: ["ensaios"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_ENSAIOS } })).map((r) => ({
        id: r.id,
        amostra_id: r.amostra_id ?? "",
        tipo_ensaio_id: r.tipo_ensaio_id ?? "",
        status: (r.status || "pendente") as Ensaio["status"],
        prazo: r.prazo || null,
      })) as Ensaio[],
  });
  const { data: progs = [] } = useQuery({
    queryKey: ["programacoes_full"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_PROGS } })).map((r) => ({
        id: r.id,
        ensaio_id: r.ensaio_id ?? "",
        equipamento_id: r.equipamento_id || null,
        status: (r.status || "planejado") as Programacao["status"],
        data_inicio_prevista: r.data_inicio_prevista || r.data_inicio || null,
        duracao_dias: Number(r.duracao_dias || 1),
        data_inicio_real: r.data_inicio_real || null,
        data_fim_real: r.data_fim_real || null,
        data_fim: r.data_fim || null,
        incluir_fds: parseIncluirFds(r.incluir_fds),
      })) as Programacao[],
  });
  const { data: tipos = [] } = useQuery({
    queryKey: ["tipos_ensaio_min"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_TIPOS } })).map((r) => ({
        id: r.id, nome: r.nome ?? "",
      })),
  });
  const { data: equipamentos = [] } = useQuery({
    queryKey: ["equipamentos_min"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_EQUIPS } })).map((r) => ({
        id: r.id, nome: r.nome ?? "",
      })),
  });

  const tipoNome = useMemo(() => new Map(tipos.map((t) => [t.id, t.nome])), [tipos]);
  const equipNome = useMemo(() => new Map(equipamentos.map((e) => [e.id, e.nome])), [equipamentos]);
  const ensaioById = useMemo(() => new Map(ensaios.map((e) => [e.id, e])), [ensaios]);
  const progByEnsaio = useMemo(() => new Map(progs.map((p) => [p.ensaio_id, p])), [progs]);

  const hoje = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);
  const todayIso = useMemo(() => hoje.toISOString().slice(0, 10), [hoje]);

  /* ---------- Status derivado (igual à Central / Gantt) ---------- */
  const effStatus = (e: Ensaio): EfStatus => {
    if (e.status === "concluido" || e.status === "cancelado") return e.status;
    const p = progByEnsaio.get(e.id);
    if (!p) return "pendente";
    if (p.status === "concluido") return "concluido";
    if (p.status === "em_execucao") return "em_execucao";
    if (p.data_inicio_prevista && p.data_inicio_prevista < todayIso) return "atrasado";
    return "programado";
  };
  const effByEnsaio = useMemo(
    () => new Map(ensaios.map((e) => [e.id, effStatus(e)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ensaios, progByEnsaio, todayIso],
  );

  /* ---------- KPIs ---------- */
  const total = ensaios.length;
  const countBy = (s: EfStatus) =>
    ensaios.reduce((n, e) => (effByEnsaio.get(e.id) === s ? n + 1 : n), 0);
  const concluidos = countBy("concluido");
  const emExecucao = countBy("em_execucao");
  const programados = countBy("programado");
  const atrasados = countBy("atrasado");
  const semProgramacao = countBy("pendente");
  const emDia = programados;

  /* ---------- Distribuição por status ---------- */
  const statusData = useMemo(() => {
    const order: EfStatus[] = ["pendente", "atrasado", "programado", "em_execucao", "concluido", "cancelado"];
    return order
      .map((s) => ({ name: EF_LABEL[s], value: countBy(s), color: EF_COLOR[s] }))
      .filter((d) => d.value > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensaios, effByEnsaio]);

  /* ---------- Carga por equipamento (nº de ensaios programados) ---------- */
  const cargaEquip = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of progs) {
      const k = p.equipamento_id || "__sem__";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([k, v]) => ({
        nome: k === "__sem__" ? "Sem equipamento" : equipNome.get(k) || "—",
        ensaios: v,
      }))
      .sort((a, b) => b.ensaios - a.ensaios);
  }, [progs, equipNome]);

  /* ---------- Ocupação diária por equipamento (próximos 30 dias) ---------- */
  const ocupacao = useMemo(() => {
    const dias: { dia: string; date: Date }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(hoje); d.setDate(hoje.getDate() + i);
      dias.push({ dia: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, date: d });
    }
    return dias.map(({ dia, date }) => {
      const ativos = progs.filter((p) => {
        const inicio = p.data_inicio_real || p.data_inicio_prevista;
        if (!inicio) return false;
        const fimStr =
          p.data_fim_real ||
          p.data_fim ||
          endIsoFromDur(inicio, p.duracao_dias || 1, p.incluir_fds);
        const i = new Date(inicio + "T00:00:00");
        const f = new Date(fimStr + "T00:00:00");
        return date >= i && date <= f;
      }).length;
      return { dia, ativos };
    });
  }, [progs, hoje]);

  /* ---------- Distribuição por tipo de ensaio ---------- */
  const porTipo = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of ensaios) {
      const k = e.tipo_ensaio_id || "__none__";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([k, v]) => ({ nome: tipoNome.get(k) || "—", qtd: v }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 10);
  }, [ensaios, tipoNome]);

  /* ---------- Lista de atrasados ---------- */
  const listaAtrasados = useMemo(() => {
    return ensaios
      .filter((e) => effByEnsaio.get(e.id) === "atrasado")
      .map((e) => {
        const p = progByEnsaio.get(e.id);
        const ref = p?.data_inicio_prevista || p?.data_fim || e.prazo || todayIso;
        const diasAtraso = Math.max(
          0,
          Math.floor((hoje.getTime() - new Date(ref + "T00:00:00").getTime()) / 86400000),
        );
        const amostra = amostras.find((a) => a.id === e.amostra_id);
        return {
          id: e.id,
          tipo: tipoNome.get(e.tipo_ensaio_id) || "Ensaio",
          amostra: (amostra?.codigo_amostra as string) || "—",
          os: (amostra?.os_numero as string) || "—",
          equipamento: p?.equipamento_id ? equipNome.get(p.equipamento_id) || "—" : "Sem equipamento",
          fim: ref, diasAtraso, status: e.status,
        };
      })
      .sort((a, b) => b.diasAtraso - a.diasAtraso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensaios, progByEnsaio, effByEnsaio, amostras, tipoNome, equipNome, hoje, todayIso]);

  return (
    <div className="space-y-6 w-full">
      <PageHeader
        eyebrow="Programação · Análise"
        icon={LayoutDashboard}
        title="Dashboard operacional"
        description="Ocupação, atrasos e carga por equipamento — dados vindos direto da planilha."
      />

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <KPI title="Amostras" value={amostras.length} icon={FlaskConical} />
        <KPI title="Ensaios" value={total} icon={ClipboardIcon} />
        <KPI title="Em execução" value={emExecucao} icon={Timer} tone="violet" />
        <KPI title="Concluídos" value={concluidos} icon={CheckCircle2} tone="emerald" />
        <KPI title="Atrasados" value={atrasados} icon={AlertTriangle} tone="red" />
        <KPI title="Programação pendente" value={semProgramacao} icon={Clock} tone="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Distribuição por status</CardTitle>
            <CardDescription>Total de ensaios em cada situação.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {statusData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Carga por equipamento
            </CardTitle>
            <CardDescription>Quantidade de ensaios programados por equipamento.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {cargaEquip.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cargaEquip} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="nome" width={140} />
                  <Tooltip />
                  <Bar dataKey="ensaios" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">Ocupação diária (próximos 30 dias)</CardTitle>
          <CardDescription>Ensaios ativos em cada dia da janela.</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          {progs.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ocupacao} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="dia" fontSize={10} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="ativos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Top tipos de ensaio</CardTitle>
            <CardDescription>Ensaios cadastrados por tipo.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {porTipo.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porTipo} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="nome" width={160} />
                  <Tooltip />
                  <Bar dataKey="qtd" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Ensaios atrasados
            </CardTitle>
            <CardDescription>
              {listaAtrasados.length} ensaio(s) passaram do prazo/data-fim.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-64 overflow-y-auto p-0">
            {listaAtrasados.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhum atraso registrado. 🎉</p>
            ) : (
              <ul className="divide-y">
                {listaAtrasados.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {r.tipo} <span className="text-muted-foreground">• {r.amostra}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        OS {r.os} • {r.equipamento} • prazo {r.fim}
                      </div>
                    </div>
                    <Badge className="bg-red-500/15 text-red-700 dark:text-red-300 shrink-0">
                      {r.diasAtraso}d
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground">
        Programados (em dia): {emDia} • Total: {total}
      </div>
    </div>
  );
}

function KPI({
  title, value, icon: Icon, tone,
}: {
  title: string; value: number; icon: any; tone?: "violet" | "emerald" | "red" | "amber";
}) {
  const toneCls =
    tone === "violet" ? "text-violet-600 dark:text-violet-400" :
    tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
    tone === "red" ? "text-red-600 dark:text-red-400" :
    tone === "amber" ? "text-amber-600 dark:text-amber-400" :
    "text-primary";
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{title}</span>
          <Icon className={`h-4 w-4 ${toneCls}`} />
        </div>
        <div className={`mt-1 text-2xl font-semibold ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ClipboardIcon(props: any) {
  return <FlaskConical {...props} />;
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Sem dados suficientes.
    </div>
  );
}