/**
 * Gestão das OS de Ensaios Especiais — só administrador. Numa tela, por OS:
 * a próxima entrega do cronograma, o andamento dos ensaios, os relatórios em
 * cada etapa da esteira e as emissões (aguardando verificação/aprovação e
 * emitidas). Só leitura: cada linha abre o hub da OS.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRight, Building, CheckCircle2, FileText, ShieldCheck, Stamp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSchedule } from "@/hooks/use-schedule";
import { normOs, parseBrDate } from "@/lib/schedule-utils";
import { listPendenciasDigitacao } from "@/lib/lab-pendencias.functions";
import { listEmissoes } from "@/lib/emissoes.functions";
import { useEnsaiosEspeciaisRows } from "./EnsaiosEspeciaisView";

const DIA = 86_400_000;
const hoje = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

type Entrega = { data: Date; texto: string; atrasoDias: number } | null;

function Farol({ entrega, entregue }: { entrega: Entrega; entregue: boolean }) {
  if (!entrega) {
    return entregue ? (
      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
        Entregue
      </Badge>
    ) : (
      <span className="text-xs text-muted-foreground">Sem data no cronograma</span>
    );
  }
  const { atrasoDias } = entrega;
  const [classe, rotulo] =
    atrasoDias > 0
      ? ["bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30", `${atrasoDias}d atraso`]
      : atrasoDias === 0
        ? ["bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", "Hoje"]
        : atrasoDias >= -3
          ? ["bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", `em ${-atrasoDias}d`]
          : ["bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", `em ${-atrasoDias}d`];
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-medium tabular-nums">{entrega.texto}</div>
      <Badge variant="outline" className={`${classe} text-[10px]`}>
        {rotulo}
      </Badge>
    </div>
  );
}

function Kpi({ icone: Icone, rotulo, valor, destaque }: { icone: React.ComponentType<{ className?: string }>; rotulo: string; valor: number; destaque?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
          <div className={`font-display text-2xl font-semibold tabular-nums ${valor > 0 && destaque ? destaque : ""}`}>{valor}</div>
        </div>
        <Icone className="h-4 w-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

const n = (v: number) => (v > 0 ? <b className="tabular-nums">{v}</b> : <span className="text-muted-foreground">0</span>);

export function GestaoEspeciaisView() {
  const navigate = useNavigate();
  const [verArquivadas, setVerArquivadas] = useState(false);
  const osRows = useEnsaiosEspeciaisRows();
  const { data: scheduleData } = useSchedule();

  const listPendFn = useServerFn(listPendenciasDigitacao);
  const { data: pendencias = [] } = useQuery({
    queryKey: ["lab-pendencias"],
    queryFn: () => listPendFn(),
    refetchInterval: 30_000,
  });
  const listEmissoesFn = useServerFn(listEmissoes);
  const { data: emissoes = [] } = useQuery({
    queryKey: ["gestao-especiais-emissoes"],
    queryFn: () => listEmissoesFn({ data: {} }),
    staleTime: 60_000,
  });

  const linhas = useMemo(() => {
    const zero = hoje().getTime();
    return osRows
      .filter((o) => verArquivadas || !o.arquivada)
      .map((o) => {
        const k = normOs(o.osNumero);
        // Entrega: a próxima linha do cronograma ainda sem data de postagem.
        const doCronograma = (scheduleData?.rows ?? []).filter((r) => normOs(r.os) === k);
        const abertas = doCronograma
          .filter((r) => !(r.dataPostagem ?? "").trim())
          .map((r) => ({ r, d: parseBrDate(r.dataEntrega) }))
          .filter((x): x is { r: (typeof doCronograma)[number]; d: Date } => !!x.d)
          .sort((a, b) => a.d.getTime() - b.d.getTime());
        const prox = abertas[0];
        const entrega: Entrega = prox
          ? { data: prox.d, texto: prox.r.dataEntrega, atrasoDias: Math.round((zero - prox.d.getTime()) / DIA) }
          : null;
        const entregue = doCronograma.length > 0 && abertas.length === 0;

        const pend = pendencias.filter((p) => normOs(p.os) === k);
        const conta = (...st: string[]) => pend.filter((p) => st.includes(p.status)).length;
        const relatorios = {
          digitacao: conta("pendente", "em_digitacao"),
          verificacao: conta("digitado"),
          aprovacao: conta("verificado"),
          concluidos: conta("aprovado", "concluido_externo"),
        };

        const emi = emissoes.filter((e) => normOs(e.os_numero ?? "") === k);
        const emissao = {
          aguardandoVerificacao: emi.filter((e) => e.workflow_status === "aguardando_verificacao").length,
          aguardandoAprovacao: emi.filter((e) => e.workflow_status === "aguardando_aprovacao").length,
          emitidos: emi.filter((e) => e.workflow_status === "aprovado").length,
        };
        return { ...o, entrega, entregue, relatorios, emissao };
      })
      .sort((a, b) => {
        // Mais urgente primeiro: atrasadas (maior atraso), depois a entrega mais próxima, sem data por último.
        const da = a.entrega ? a.entrega.atrasoDias : -Infinity;
        const db = b.entrega ? b.entrega.atrasoDias : -Infinity;
        return db - da;
      });
  }, [osRows, scheduleData, pendencias, emissoes, verArquivadas]);

  const totais = useMemo(
    () => ({
      os: linhas.filter((l) => !l.arquivada).length,
      atrasadas: linhas.filter((l) => l.entrega && l.entrega.atrasoDias > 0).length,
      esteira: linhas.reduce((s, l) => s + l.relatorios.digitacao + l.relatorios.verificacao + l.relatorios.aprovacao, 0),
      verificacao: linhas.reduce((s, l) => s + l.emissao.aguardandoVerificacao, 0),
      aprovacao: linhas.reduce((s, l) => s + l.emissao.aguardandoAprovacao, 0),
      emitidos: linhas.reduce((s, l) => s + l.emissao.emitidos, 0),
    }),
    [linhas],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Kpi icone={Building} rotulo="OS especiais ativas" valor={totais.os} />
        <Kpi icone={AlertTriangle} rotulo="Entregas atrasadas" valor={totais.atrasadas} destaque="text-rose-600" />
        <Kpi icone={FileText} rotulo="Laudos na esteira" valor={totais.esteira} />
        <Kpi icone={ShieldCheck} rotulo="Aguardando verificação" valor={totais.verificacao} destaque="text-violet-600" />
        <Kpi icone={Stamp} rotulo="Aguardando aprovação" valor={totais.aprovacao} destaque="text-indigo-600" />
        <Kpi icone={CheckCircle2} rotulo="Laudos emitidos" valor={totais.emitidos} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Por OS, da mais urgente para a menos. Clique numa linha para abrir a OS.
        </p>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <Switch checked={verArquivadas} onCheckedChange={setVerArquivadas} /> Mostrar arquivadas
        </label>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-28">OS</TableHead>
              <TableHead>Cliente / obra</TableHead>
              <TableHead className="w-32">Próxima entrega</TableHead>
              <TableHead className="w-24 text-center">Ensaios</TableHead>
              <TableHead className="w-48 text-center">Relatórios (dig. · verif. · aprov.)</TableHead>
              <TableHead className="w-44 text-center">Emissões (aguardando · emitidos)</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma OS especial encontrada no cronograma.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((l) => (
                <TableRow
                  key={l.osNumero}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => navigate({ to: "/relatorio/especiais/$osNumero", params: { osNumero: l.osNumero } })}
                >
                  <TableCell className="font-semibold text-xs">
                    {l.osNumero}
                    {l.arquivada && (
                      <Badge variant="outline" className="ml-1 text-[9px]">
                        arquivada
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-medium truncate max-w-[260px]">{l.cliente}</div>
                    {l.obra && <div className="text-[10px] text-muted-foreground truncate max-w-[260px]">{l.obra}</div>}
                  </TableCell>
                  <TableCell>
                    <Farol entrega={l.entrega} entregue={l.entregue} />
                  </TableCell>
                  <TableCell className="text-center text-xs tabular-nums">
                    {l.concluidos}/{l.totalEnsaios}
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    {n(l.relatorios.digitacao)} · {n(l.relatorios.verificacao)} · {n(l.relatorios.aprovacao)}
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    {n(l.emissao.aguardandoVerificacao + l.emissao.aguardandoAprovacao)} · {n(l.emissao.emitidos)}
                  </TableCell>
                  <TableCell>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
