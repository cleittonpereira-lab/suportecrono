import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useCadastroOs } from "@/hooks/use-cadastro-os";
import { useSchedule } from "@/hooks/use-schedule";
import { useEntregues } from "@/hooks/use-entregues";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Siren, CalendarClock, AlertTriangle } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CadastroDetailsDialog } from "@/components/cadastro-details-dialog";
import { MESES, type Mes } from "@/lib/cadastro.functions";
import {
  SERVICOS,
  type Servico,
  type CadastroRow,
} from "@/lib/cadastro.functions";
import type { EntregueRow, ScheduleRow } from "@/lib/sheets.functions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, Truck, Layers, ListOrdered } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SetorBadges } from "@/components/setor-badges";
import { splitSetores, normOs } from "@/lib/schedule-utils";
import { SondButton } from "@/components/sond-button";
import { OsNotasArquivosButton } from "@/components/os-notas-arquivos-button";

export const Route = createFileRoute("/_app/ordens-servico")({
  head: () => ({ meta: [{ title: "OS's: Ordens de Serviço | LabFlow" }] }),
  component: Page,
});

const SERVICO_TONE: Record<Servico, string> = {
  SP: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  ST: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900",
  PI: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900",
  SM: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  CPTU: "bg-lime-100 text-lime-800 border-lime-200 dark:bg-lime-950/40 dark:text-lime-300 dark:border-lime-900",
  VT: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900",
  SH: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  BL: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
  BQ: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  DN: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:border-fuchsia-900",
  SR: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
  SEG: "bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
};

function extractYear(s?: string): string | null {
  if (!s) return null;
  const m = String(s).match(/(19|20)\d{2}/);
  return m ? m[0] : null;
}

interface OsAggregate {
  key: string;
  os: string;
  cadastro?: CadastroRow;
  entregas: EntregueRow[];
  cronograma: ScheduleRow[];
  setores: string[];
  tomador: string;
  sup: string;
  ano: string;
}

function Page() {
  const { data: cadData, isLoading: cadLoading } = useCadastroOs();
  const { data: schedData, isLoading: schedLoading } = useSchedule();
  const { data: entrData, isLoading: entrLoading } = useEntregues();
  const [q, setQ] = useState("");
  const currentYear = String(new Date().getFullYear());
  const [yearFilter, setYearFilter] = useState<string>(currentYear);
  const [setorFilter, setSetorFilter] = useState<string>("all");
  const [tomadorFilter, setTomadorFilter] = useState<string>("all");

  const aggregates = useMemo<OsAggregate[]>(() => {
    const map = new Map<string, OsAggregate>();
    const ensure = (rawOs: string): OsAggregate | null => {
      const key = normOs(rawOs);
      if (!key) return null;
      let agg = map.get(key);
      if (!agg) {
        agg = {
          key,
          os: rawOs.trim(),
          entregas: [],
          cronograma: [],
          setores: [],
          tomador: "",
          sup: "",
          ano: "",
        };
        map.set(key, agg);
      }
      return agg;
    };

    if (cadData) {
      for (const r of cadData.rows) {
        const agg = ensure(r.os);
        if (!agg) continue;
        if (!agg.cadastro) agg.cadastro = r;
        if (!agg.tomador) agg.tomador = r.tomador;
        if (!agg.sup) agg.sup = r.sup;
      }
    }
    if (entrData) {
      for (const r of entrData.rows) {
        const agg = ensure(r.os);
        if (!agg) continue;
        agg.entregas.push(r);
        if (!agg.tomador) agg.tomador = r.tomador;
      }
    }
    if (schedData) {
      for (const r of schedData.rows) {
        const agg = ensure(r.os);
        if (!agg) continue;
        agg.cronograma.push(r);
        if (!agg.tomador) agg.tomador = r.tomador;
      }
    }

    // setores únicos
    for (const agg of map.values()) {
      const set = new Set<string>();
      for (const e of agg.entregas)
        for (const p of splitSetores(e.setor)) set.add(p);
      for (const c of agg.cronograma)
        for (const p of splitSetores(c.setor)) set.add(p);
      agg.setores = Array.from(set);
      // ano: tenta cadastro (dataCriacao/Envio), depois entregas, depois cronograma
      const candidates: (string | undefined)[] = [
        agg.cadastro?.dataCriacao,
        agg.cadastro?.dataEnvio,
        ...agg.entregas.map((e) => e.dataPostagem),
        ...agg.entregas.map((e) => e.dataProgramada),
        ...agg.cronograma.map((c) => c.dataPostagem),
        ...agg.cronograma.map((c) => c.dataEntrega),
      ];
      for (const c of candidates) {
        const y = extractYear(c);
        if (y) {
          agg.ano = y;
          break;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.os.localeCompare(b.os, "pt-BR", { numeric: true }),
    );
  }, [cadData, schedData, entrData]);

  const anos = useMemo(() => {
    const set = new Set<string>();
    for (const a of aggregates) if (a.ano) set.add(a.ano);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [aggregates]);

  const setores = useMemo(() => {
    const set = new Set<string>();
    for (const a of aggregates) for (const s of a.setores) set.add(s);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [aggregates]);

  const tomadores = useMemo(() => {
    const set = new Set<string>();
    for (const a of aggregates) if (a.tomador) set.add(a.tomador);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [aggregates]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return aggregates.filter((a) => {
      if (yearFilter !== "all" && a.ano !== yearFilter) return false;
      if (setorFilter !== "all" && !a.setores.includes(setorFilter))
        return false;
      if (tomadorFilter !== "all" && a.tomador !== tomadorFilter) return false;
      if (term) {
        const hay = [a.os, a.tomador, a.sup, a.cadastro?.obra, a.cadastro?.local]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [aggregates, q, yearFilter, setorFilter, tomadorFilter]);

  const hasActive =
    !!q.trim() ||
    yearFilter !== currentYear ||
    setorFilter !== "all" ||
    tomadorFilter !== "all";

  const loading = cadLoading || schedLoading || entrLoading;
  if (loading && aggregates.length === 0)
    return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 w-full">
      <PageHeader
        eyebrow="Ordens de serviço · Consolidado"
        icon={ListOrdered}
        title="Painel de OS"
        description="Visão consolidada de cada Ordem de Serviço"
      />

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5 md:col-span-1">
              <Label className="text-xs">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="OS, tomador, SUP, obra, local..."
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ano</Label>
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {anos.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Setor</Label>
              <Select value={setorFilter} onValueChange={setSetorFilter}>
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
            <div className="space-y-1.5">
              <Label className="text-xs">Tomador</Label>
              <Select value={tomadorFilter} onValueChange={setTomadorFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {tomadores.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {hasActive && (
            <div className="flex items-center justify-between text-sm text-muted-foreground pt-1">
              <span>
                {filtered.length} de {aggregates.length} resultados
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQ("");
                  setYearFilter(currentYear);
                  setSetorFilter("all");
                  setTomadorFilter("all");
                }}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Limpar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="painel" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="painel" className="gap-2">
            <ListOrdered className="h-4 w-4" /> Painel de OS
          </TabsTrigger>
          <TabsTrigger value="alertas" className="gap-2">
            <AlertTriangle className="h-4 w-4" /> Alertas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="painel" className="mt-6 space-y-6">
          <div className="rounded-lg border bg-card">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhuma OS encontrada
          </div>
        ) : (
          <Accordion type="multiple" className="w-full">
            {filtered.map((agg) => (
              <OsItem key={agg.key} agg={agg} />
            ))}
          </Accordion>
        )}
      </div>
        </TabsContent>

        <TabsContent value="alertas" className="mt-6">
          <AlertsTabContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// ALERTAS TAB CONTENT (Ported from _app.alertas.tsx)
// =============================================================================

type AlertTabKey = "programacao" | "aprovadas15d";
const COLETA_SERVICOS = ["ST", "PI", "SH", "DN", "BL"] as const;
const CONVENCIONAIS = new Set(["ST", "PI"]);
const ESPECIAIS = new Set(["SH", "DN", "BL"]);

function parseDataBR(s: string): Date | null {
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

type TagTipo = "Convencional" | "Especial";
interface AlertRow extends CadastroRow {
  coletaServicos: Servico[];
  tags: TagTipo[];
}

function AlertsTabContent() {
  const [tab, setTab] = useState<AlertTabKey>("programacao");
  const { data: cadData, isLoading: cadLoading } = useCadastroOs();
  const { data: schedData, isLoading: schedLoading } = useSchedule();
  const { data: entrData, isLoading: entrLoading } = useEntregues();

  const scheduledOs = useMemo(() => {
    const set = new Set<string>();
    if (!schedData) return set;
    for (const r of schedData.rows) {
      const k = normOs(r.os);
      if (k) set.add(k);
    }
    return set;
  }, [schedData]);

  const deliveredOs = useMemo(() => {
    const set = new Set<string>();
    if (!entrData) return set;
    for (const r of entrData.rows) {
      const k = normOs(r.os);
      if (k) set.add(k);
    }
    return set;
  }, [entrData]);

  const alerts = useMemo<AlertRow[]>(() => {
    if (!cadData) return [];
    const out: AlertRow[] = [];
    for (const r of cadData.rows) {
      const key = normOs(r.os);
      if (!key) continue;
      if (scheduledOs.has(key)) continue;
      if (deliveredOs.has(key)) continue;
      const coletaServicos = (Object.keys(r.servicos) as Servico[]).filter(
        (s) => COLETA_SERVICOS.includes(s as any) && (r.servicos[s] ?? 0) > 0,
      );
      if (coletaServicos.length === 0) continue;
      const tags = new Set<TagTipo>();
      for (const s of coletaServicos) {
        if (CONVENCIONAIS.has(s)) tags.add("Convencional");
        if (ESPECIAIS.has(s)) tags.add("Especial");
      }
      out.push({ ...r, coletaServicos, tags: Array.from(tags) });
    }
    return out;
  }, [cadData, scheduledOs, deliveredOs]);

  const ready = !cadLoading && !schedLoading && !entrLoading && !!cadData;

  if (!ready) return <div className="text-muted-foreground text-sm py-8">Carregando alertas...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">Alertas de programação</h2>
        <p className="text-sm text-muted-foreground">
          {tab === "programacao"
            ? "OS cadastradas com coleta sem programação nem entrega"
            : "OS aprovadas recentemente (15d) sem programação"}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as AlertTabKey)}>
        <TabsList className="h-9">
          <TabsTrigger value="programacao" className="gap-1.5 text-xs">
            <Siren className="h-3.5 w-3.5" /> Programação de OS
          </TabsTrigger>
          <TabsTrigger value="aprovadas15d" className="gap-1.5 text-xs">
            <CalendarClock className="h-3.5 w-3.5" /> Aprovadas (15d)
          </TabsTrigger>
        </TabsList>
        <div className="mt-4">
          {tab === "programacao" ? (
            <AlertsView alerts={alerts} />
          ) : (
            <AprovadasView alerts={alerts} />
          )}
        </div>
      </Tabs>
    </div>
  );
}

function AlertsView({ alerts }: { alerts: AlertRow[] }) {
  const [q, setQ] = useState("");
  const [mes, setMes] = useState<"all" | Mes>("all");
  const [tag, setTag] = useState<"all" | TagTipo>("all");
  const [selected, setSelected] = useState<CadastroRow | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return alerts.filter((r) => {
      if (mes !== "all" && r.mes !== mes) return false;
      if (tag !== "all" && !r.tags.includes(tag)) return false;
      if (!term) return true;
      return [r.tomador, r.os, r.sup, r.obra, r.local].join(" ").toLowerCase().includes(term);
    });
  }, [alerts, q, mes, tag]);

  return (
    <div className="space-y-5">
      <AlertsSummary alerts={alerts} tag={tag} setTag={setTag} />
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." className="pl-9 h-9" />
        </div>
        <Select value={mes} onValueChange={(v) => setMes(v as any)}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Mês" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos meses</SelectItem>
            {MESES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tag} onValueChange={(v) => setTag(v as any)}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            <SelectItem value="Convencional">Convencionais</SelectItem>
            <SelectItem value="Especial">Especiais</SelectItem>
          </SelectContent>
        </Select>
        {(q || mes !== "all" || tag !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); setMes("all"); setTag("all"); }} className="h-9">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <AlertsTable filtered={filtered} onSelect={setSelected} />
      <CadastroDetailsDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AprovadasView({ alerts }: { alerts: AlertRow[] }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<"all" | TagTipo>("all");
  const [selected, setSelected] = useState<CadastroRow | null>(null);

  const JANELA_DIAS = 15;
  const filteredJanela = useMemo(() => {
    const agora = Date.now();
    const limiteMs = JANELA_DIAS * 24 * 60 * 60 * 1000;
    return alerts.filter((r) => {
      const dt = parseDataBR(r.dataEnvio) ?? parseDataBR(r.dataCriacao);
      if (!dt) return false;
      const diff = agora - dt.getTime();
      return diff >= 0 && diff <= limiteMs;
    });
  }, [alerts]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return filteredJanela.filter((r) => {
      if (tag !== "all" && !r.tags.includes(tag)) return false;
      if (!term) return true;
      return [r.tomador, r.os, r.sup, r.obra, r.local].join(" ").toLowerCase().includes(term);
    });
  }, [filteredJanela, q, tag]);

  return (
    <div className="space-y-5">
      <AlertsSummary alerts={filteredJanela} tag={tag} setTag={setTag} />
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." className="pl-9 h-9" />
        </div>
        <Select value={tag} onValueChange={(v) => setTag(v as any)}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos tipos</SelectItem>
            <SelectItem value="Convencional">Convencionais</SelectItem>
            <SelectItem value="Especial">Especiais</SelectItem>
          </SelectContent>
        </Select>
        {(q || tag !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); setTag("all"); }} className="h-9">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <AlertsTable filtered={filtered} onSelect={setSelected} />
      <CadastroDetailsDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AlertsSummary({ alerts, tag, setTag }: { alerts: AlertRow[], tag: string, setTag: any }) {
  const totalConv = alerts.filter(r => r.tags.includes("Convencional")).length;
  const totalEsp = alerts.filter(r => r.tags.includes("Especial")).length;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="rounded-lg border bg-card p-4">
        <div className="text-[10px] uppercase font-semibold text-muted-foreground">Total de alertas</div>
        <div className="text-2xl font-bold mt-0.5">{alerts.length}</div>
      </div>
      <button onClick={() => setTag(tag === "Convencional" ? "all" : "Convencional")} className={`text-left rounded-lg border p-4 transition bg-cyan-50 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-900 ${tag === "Convencional" ? "ring-2 ring-primary" : ""}`}>
        <div className="text-[10px] uppercase font-semibold text-cyan-800 dark:text-cyan-400">Convencionais (ST/PI)</div>
        <div className="text-2xl font-bold mt-0.5 text-cyan-950 dark:text-cyan-200">{totalConv}</div>
      </button>
      <button onClick={() => setTag(tag === "Especial" ? "all" : "Especial")} className={`text-left rounded-lg border p-4 transition bg-fuchsia-50 dark:bg-fuchsia-950/20 border-fuchsia-200 dark:border-fuchsia-900 ${tag === "Especial" ? "ring-2 ring-primary" : ""}`}>
        <div className="text-[10px] uppercase font-semibold text-fuchsia-800 dark:text-fuchsia-400">Especiais (SH/DN/BL)</div>
        <div className="text-2xl font-bold mt-0.5 text-fuchsia-950 dark:text-fuchsia-200">{totalEsp}</div>
      </button>
    </div>
  );
}

function AlertsTable({ filtered, onSelect }: { filtered: AlertRow[], onSelect: any }) {
  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[80px]">Mês</TableHead>
            <TableHead className="w-[100px]">OS</TableHead>
            <TableHead>Tomador</TableHead>
            <TableHead>Serviços</TableHead>
            <TableHead>Tags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Sem alertas</TableCell></TableRow>
          ) : (
            filtered.map((r, i) => (
              <TableRow key={i} className="cursor-pointer hover:bg-muted/30" onClick={() => onSelect(r)}>
                <TableCell className="text-xs font-mono">{r.mes}</TableCell>
                <TableCell className="text-xs font-mono font-bold">{r.os}</TableCell>
                <TableCell className="text-sm font-medium">{r.tomador}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.coletaServicos.map(s => <span key={s} className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-bold">{s}</span>)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {r.tags.map(t => <span key={t} className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${t === "Convencional" ? "bg-cyan-100 text-cyan-800" : "bg-fuchsia-100 text-fuchsia-800"}`}>{t}</span>)}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function OsItem({ agg }: { agg: OsAggregate }) {
  return (
    <AccordionItem value={agg.key} className="px-4">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex flex-1 items-center gap-3 flex-wrap pr-3">
          <span className="font-mono text-sm font-semibold whitespace-nowrap">
            {agg.os || "—"}
          </span>
          {agg.os && <SondButton os={agg.os} />}
          {agg.os && <OsNotasArquivosButton os={agg.os} />}
          <span className="text-sm font-medium min-w-0 truncate">
            {agg.tomador || "—"}
          </span>
          {agg.sup && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">
              SUP {agg.sup}
            </span>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" />
              {agg.entregas.length}
            </span>
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              {agg.setores.length}
            </span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-5 pb-4">
          {/* Identificação / Cadastro */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Informações da OS
            </h3>
            {agg.cadastro ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Field label="Mês" value={agg.cadastro.mes} mono />
                <Field label="SUP" value={agg.cadastro.sup} mono />
                <Field label="Data criação" value={agg.cadastro.dataCriacao} />
                <Field label="Data envio" value={agg.cadastro.dataEnvio} />
                <div className="col-span-2 md:col-span-4">
                  <Field label="Obra" value={agg.cadastro.obra} />
                </div>
                <div className="col-span-2 md:col-span-4">
                  <Field label="Local" value={agg.cadastro.local} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                OS não encontrada na planilha de Cadastro.
              </p>
            )}
          </section>

          {/* Serviços contratados */}
          {agg.cadastro && (
            <section>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Serviços contratados
              </h3>
              <div className="flex flex-wrap gap-2">
                {SERVICOS.filter((s) => agg.cadastro!.servicos[s]).map((s) => (
                  <span
                    key={s}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${SERVICO_TONE[s]}`}
                  >
                    <span>{s}</span>
                    <span className="opacity-80 tabular-nums">
                      {agg.cadastro!.servicos[s]}
                    </span>
                  </span>
                ))}
                {Object.keys(agg.cadastro.servicos).length === 0 && (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>
            </section>
          )}

          {/* Setores */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Setores envolvidos
            </h3>
            {agg.setores.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum setor registrado em Cronograma ou Entregues.
              </p>
            ) : (
              <SetorBadges setor={agg.setores.join(" / ")} />
            )}
          </section>

          {/* Entregas */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Entregas ({agg.entregas.length})
            </h3>
            {agg.entregas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma entrega registrada para esta OS.
              </p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <Th>Data postagem</Th>
                      <Th>Data programada</Th>
                      <Th>Setor</Th>
                      <Th>Laboratório</Th>
                      <Th className="text-right">Vol. comp.</Th>
                      <Th className="text-right">Vol. caract.</Th>
                      <Th className="text-right">Vol. espec.</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {agg.entregas.map((e, i) => (
                      <tr key={i} className="border-t">
                        <Td>{e.dataPostagem || "—"}</Td>
                        <Td>{e.dataProgramada || "—"}</Td>
                        <Td>
                          {e.setor ? (
                            <SetorBadges setor={e.setor} size="xs" />
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td>{e.laboratorio || "—"}</Td>
                        <Td className="text-right tabular-nums">
                          {e.volumeComp || "—"}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {e.volumeCaract || "—"}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {e.volumeEspec || "—"}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Cronograma (linhas em programação) */}
          {agg.cronograma.length > 0 && (
            <section>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Em cronograma ({agg.cronograma.length})
              </h3>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <Th>Data postagem</Th>
                      <Th>Data entrega</Th>
                      <Th>Setor</Th>
                      <Th>Laboratório</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {agg.cronograma.map((c, i) => (
                      <tr key={i} className="border-t">
                        <Td>{c.dataPostagem || "—"}</Td>
                        <Td>{c.dataEntrega || "—"}</Td>
                        <Td>
                          {c.setor ? (
                            <SetorBadges setor={c.setor} size="xs" />
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td>{c.laboratorio || "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Retornos */}
          {agg.cadastro && (
            <section>
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Retornos
              </h3>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <Th>Etapa</Th>
                      <Th>Suporte</Th>
                      <Th>Cliente</Th>
                    </tr>
                  </thead>
                  <tbody>
                    <RetornoRow
                      label="1º retorno"
                      sup={agg.cadastro.primeiroSuporte}
                      cli={agg.cadastro.primeiroCliente}
                    />
                    <RetornoRow
                      label="2º retorno"
                      sup={agg.cadastro.segundoSuporte}
                      cli={agg.cadastro.segundoCliente}
                    />
                    <RetornoRow
                      label="3º retorno"
                      sup={agg.cadastro.terceiroSuporte}
                      cli={agg.cadastro.terceiroCliente}
                    />
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-left text-[10px] uppercase tracking-wider px-3 py-2 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 text-xs ${className}`}>{children}</td>;
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  const v = (value ?? "").trim();
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </div>
      <div
        className={`${mono ? "font-mono" : ""} text-sm ${v ? "" : "text-muted-foreground"}`}
      >
        {v || "—"}
      </div>
    </div>
  );
}

function RetornoRow({
  label,
  sup,
  cli,
}: {
  label: string;
  sup: string;
  cli: string;
}) {
  const s = (sup ?? "").trim();
  const c = (cli ?? "").trim();
  const empty = (v: string) => !v || v === "-";
  return (
    <tr className="border-t">
      <td className="px-3 py-2 text-xs font-medium">{label}</td>
      <td
        className={`px-3 py-2 text-xs ${empty(s) ? "text-muted-foreground" : ""}`}
      >
        {empty(s) ? "—" : s}
      </td>
      <td
        className={`px-3 py-2 text-xs ${empty(c) ? "text-muted-foreground" : ""}`}
      >
        {empty(c) ? "—" : c}
      </td>
    </tr>
  );
}