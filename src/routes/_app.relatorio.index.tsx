import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, Beaker, FlaskConical, ShieldCheck, Stamp, ArrowRight, Pencil, Sparkles } from "lucide-react";
import { useLabState } from "@/features/lab/store";
import { ENSAIO_LABEL, type EnsaioTipo } from "@/features/lab/types";
import { EnsaioTag } from "@/features/lab/components/EnsaioTag";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listEmissoes } from "@/lib/emissoes.functions";
import { listPendenciasDigitacao } from "@/lib/lab-pendencias.functions";
import { detectMethodology } from "@/features/mesp-natural/calc";

export const Route = createFileRoute("/_app/relatorio/")({
  ssr: false,
  component: EnsaiosDashboard,
  head: () => ({
    meta: [
      { title: "Ensaios de Laboratório — Suporte Infra" },
      {
        name: "description",
        content:
          "Plataforma de processamento e emissão de relatórios técnicos para ensaios geotécnicos — Adensamento, Triaxial CID e mais.",
      },
    ],
  }),
});

function EnsaiosDashboard() {
  const { os } = useLabState();
  const listFn = useServerFn(listEmissoes);
  const listPendsFn = useServerFn(listPendenciasDigitacao);

  const [queueCounts, setQueueCounts] = useState<{ verif: number; aprov: number } | null>(null);
  const [canSeeQueues, setCanSeeQueues] = useState(false);

  const { data: pendencias = [] } = useQuery({
    queryKey: ["lab-pendencias-home"],
    queryFn: () => listPendsFn(),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const [{ data: adm }, { data: ver }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: uid, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: uid, _role: "verificador" }),
      ]);
      if (cancelled) return;
      const allowed = Boolean(adm) || Boolean(ver);
      setCanSeeQueues(allowed);
      if (!allowed) return;
      try {
        const [v, a] = await Promise.all([
          listFn({ data: { workflowStatuses: ["aguardando_verificacao"] } }),
          listFn({ data: { workflowStatuses: ["aguardando_aprovacao"] } }),
        ]);
        if (!cancelled) setQueueCounts({ verif: v.length, aprov: a.length });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [listFn]);

  // Consolidacao de OSs
  const uniqueOsSet = useMemo(() => {
    const set = new Set<string>();
    for (const o of os) if (o.numero) set.add(o.numero.trim());
    for (const p of pendencias) if (p.os) set.add(p.os.trim());
    return set;
  }, [os, pendencias]);

  const nAmostras = useMemo(() => {
    const fromOs = os.reduce((a, o) => a + o.amostras.length, 0);
    const fromPends = pendencias.filter((p) => p.amostra).length;
    return Math.max(fromOs, fromPends);
  }, [os, pendencias]);

  const nEnsaios = useMemo(() => {
    const fromOs = os.reduce((a, o) => a + o.amostras.reduce((b, x) => b + x.ensaios.length, 0), 0);
    const fromPends = pendencias.length;
    return Math.max(fromOs, fromPends);
  }, [os, pendencias]);

  const rascunhos = useMemo(() => {
    const list: Array<{ id: string; osNum: string; amCode: string; tipo: EnsaioTipo; status: string; url?: string }> = [];
    
    // 1. Do labStore
    for (const o of os) {
      for (const a of o.amostras) {
        for (const e of a.ensaios) {
          if (e.status !== "concluido" && e.status !== "aprovado") {
            list.push({
              id: e.id,
              osNum: o.numero,
              amCode: a.reportNumber || a.code || "AM",
              tipo: e.tipo,
              status: e.status,
              url: `/relatorio/os/${o.id}/amostra/${a.id}/ensaio/${e.id}`,
            });
          }
        }
      }
    }

    // 2. Das pendencias na nuvem
    for (const p of pendencias) {
      if (p.status === "em_digitacao" || p.status === "pendente") {
        const metodo = (detectMethodology(p.ensaio, p.tipo_ensaio) || "cisalhamento-direto") as EnsaioTipo;
        const exists = list.some((l) => l.osNum === p.os && l.amCode === p.amostra && l.tipo === metodo);
        if (!exists) {
          list.push({
            id: p.id,
            osNum: p.os,
            amCode: p.amostra || "AM-01",
            tipo: metodo,
            status: p.status,
            url: `/relatorio/pendentes`,
          });
        }
      }
    }

    return list;
  }, [os, pendencias]);

  return (
    <div className="w-full px-4 sm:px-6 md:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Suporte LAB · Ensaios Especiais</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Bem-vindo de volta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe suas OS, ensaios em digitação e o fluxo de emissão dos relatórios.
        </p>
      </div>

      {/* Banner de Acesso à Nova Central de Relatórios */}
      <div className="mb-8 p-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-xl border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary text-primary-foreground text-[10px]">Novo</Badge>
            <h3 className="font-bold text-sm text-foreground">Central de Processamento de Relatórios & SLAs</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Veja a fila de ensaios finalizados na bancada (Gantt), gerencie o Kanban de digitação e acompanhe os tempos de SLA.
          </p>
        </div>
        <Button asChild className="gap-1.5 shrink-0 bg-primary text-primary-foreground shadow-sm">
          <Link to="/relatorio/pendentes" search={{ tab: undefined }}>
            Acessar Central <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* KPIs */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ordens de Serviço" value={uniqueOsSet.size} icon={FolderKanban} to="/relatorio/os" />
        <Kpi label="Amostras" value={nAmostras} icon={Beaker} to="/relatorio/os" />
        <Kpi label="Ensaios" value={nEnsaios} icon={FlaskConical} to="/relatorio/os" />
        <Kpi label="Em andamento" value={rascunhos.length} icon={Pencil} accent to="/relatorio/pendentes" />
      </div>

      {/* Filas de aprovação — verificador/admin */}
      {canSeeQueues && (
        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          <QueueCard
            to="/emissoes"
            icon={ShieldCheck}
            title="Aguardando verificação"
            count={queueCounts?.verif}
          />
          <QueueCard
            to="/emissoes"
            icon={Stamp}
            title="Aguardando aprovação"
            count={queueCounts?.aprov}
          />
        </div>
      )}

      {/* Ensaios em digitação */}
      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">Meus ensaios em andamento</h2>
            <p className="text-xs text-muted-foreground">
              Rascunhos ainda não enviados para verificação (sincronizados na nuvem).
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/relatorio/os" search={{}}>
              Ir para OS <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        {rascunhos.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nenhum ensaio em digitação — acesse a Central ou abra uma OS para começar.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {rascunhos.slice(0, 6).map((item) => (
              <Link
                key={item.id}
                to={item.url as any}
              >
                <Card className="transition hover:border-primary/60 hover:shadow-sm">
                  <CardContent className="flex items-center justify-between py-3 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <EnsaioTag tipo={item.tipo} />
                        <span className="truncate font-medium">{ENSAIO_LABEL[item.tipo] || item.tipo}</span>
                      </div>
                      <div className="mt-0.5 truncate text-muted-foreground">
                        {item.osNum} · <Beaker className="inline h-3 w-3" /> {item.amCode}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[9px] uppercase tracking-wide">{item.status}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  to,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof FolderKanban;
  to: string;
  accent?: boolean;
}) {
  return (
    <Link to={to} search={{}} className="block group">
      <Card className="h-full transition-colors group-hover:border-primary/60">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={`font-display text-2xl font-semibold tabular-nums ${accent ? "text-primary" : ""}`}>
              {value}
            </div>
          </div>
          <div className={`flex h-9 w-9 items-center justify-center rounded-md ${accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
            <Icon className="h-4 w-4" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QueueCard({
  to,
  title,
  count,
  icon: Icon,
}: {
  to: string;
  title: string;
  count: number | undefined;
  icon: typeof ShieldCheck;
}) {
  return (
    <Link to={to} search={{}} className="block group">
      <Card className="h-full transition-colors group-hover:border-primary/60">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4 text-primary" />
            {title}
          </CardTitle>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </CardHeader>
        <CardContent>
          <div className="font-display text-3xl font-semibold tabular-nums">
            {count === undefined ? "—" : count}
          </div>
          <div className="text-[11px] text-muted-foreground">Central de Emissões</div>
        </CardContent>
      </Card>
    </Link>
  );
}
