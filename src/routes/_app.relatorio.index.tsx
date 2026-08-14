import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, Beaker, FlaskConical, ShieldCheck, Stamp, ArrowRight, Pencil } from "lucide-react";
import { useLabState } from "@/features/lab/store";
import { ENSAIO_LABEL } from "@/features/lab/types";
import { EnsaioTag } from "@/features/lab/components/EnsaioTag";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { listEmissoes } from "@/lib/emissoes.functions";

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
  const [queueCounts, setQueueCounts] = useState<{ verif: number; aprov: number } | null>(null);
  const [canSeeQueues, setCanSeeQueues] = useState(false);

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
      } catch {
        /* silencia */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listFn]);

  const nAmostras = os.reduce((a, o) => a + o.amostras.length, 0);
  const nEnsaios = os.reduce((a, o) => a + o.amostras.reduce((b, x) => b + x.ensaios.length, 0), 0);
  const rascunhos = os.flatMap((o) =>
    o.amostras.flatMap((a) => a.ensaios.filter((e) => e.status !== "concluido").map((e) => ({ os: o, a, e }))),
  );
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Suporte LAB · Ensaios Especiais</div>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Bem-vindo de volta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe suas OS, ensaios em digitação e o fluxo de emissão dos relatórios.
        </p>
      </div>

      {/* KPIs */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Ordens de Serviço" value={os.length} icon={FolderKanban} to="/relatorio/os" />
        <Kpi label="Amostras" value={nAmostras} icon={Beaker} to="/relatorio/os" />
        <Kpi label="Ensaios" value={nEnsaios} icon={FlaskConical} to="/relatorio/os" />
        <Kpi label="Em andamento" value={rascunhos.length} icon={Pencil} accent to="/relatorio/os" />
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

      {/* Ensaios em digitação (locais) */}
      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">Meus ensaios em andamento</h2>
            <p className="text-xs text-muted-foreground">
              Rascunhos ainda não enviados para verificação.
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
              Nenhum ensaio em digitação — abra uma OS para começar.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {rascunhos.slice(0, 6).map(({ os: o, a, e }) => (
              <Link
                key={e.id}
                to="/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId"
                params={{ osId: o.id, amostraId: a.id, ensaioId: e.id }}
                search={{}}
              >
                <Card className="transition hover:border-primary/60 hover:shadow-sm">
                  <CardContent className="flex items-center justify-between py-3 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <EnsaioTag tipo={e.tipo} />
                        <span className="truncate font-medium">{ENSAIO_LABEL[e.tipo]}</span>
                      </div>
                      <div className="mt-0.5 truncate text-muted-foreground">
                        {o.numero} · <Beaker className="inline h-3 w-3" /> {a.reportNumber || "AM"}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[9px] uppercase tracking-wide">{e.status}</Badge>
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