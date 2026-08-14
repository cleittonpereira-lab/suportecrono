import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSchedule } from "@/hooks/use-schedule";
import { useEntregues } from "@/hooks/use-entregues";
import {
  applyFilters,
  emptyFilters,
  isAtrasado,
  isHoje,
  isSetorIndefinido,
  isPendente,
  parseBrDate,
} from "@/lib/schedule-utils";
import { ScheduleFilterBar } from "@/components/schedule-filter-bar";
import { ScheduleTable } from "@/components/views/schedule-table";
import { CalendarView } from "@/components/views/calendar-view";
import { PendentesView } from "@/components/views/pendentes-view";
import { EntreguesView } from "@/components/views/entregues-view";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  Calendar as CalendarIcon,
  Table as TableIcon,
  PlusCircle,
  PackageSearch,
  Bell,
  History,
} from "lucide-react";
import { CreateEntregaDialog } from "@/components/create-entrega-dialog";
import { PageHeader } from "@/components/page-header";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/entregas")({
  head: () => ({ meta: [{ title: "Entregas | Suporte INFRA" }] }),
  component: Page,
});

type TabKey = "cronograma" | "pendentes" | "historico";
type ViewMode = "tabela" | "calendario";

function initialTab(): TabKey {
  if (typeof window === "undefined") return "cronograma";
  const v = new URLSearchParams(window.location.search).get("tab");
  if (v === "pendentes" || v === "historico") return v;
  return "cronograma";
}

function Page() {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [filters, setFilters] = useState(emptyFilters);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== tab) {
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url);
    }
  }, [tab]);

  const eyebrow =
    tab === "cronograma"
      ? "Entregas · Cronograma"
      : tab === "pendentes"
      ? "Entregas · Backlog"
      : "Entregas · Histórico";
  const title =
    tab === "cronograma"
      ? "Cronograma de entregas"
      : tab === "pendentes"
      ? "OS Pendentes"
      : "OS Entregues";
  const description =
    tab === "cronograma"
      ? "Monitoramento e gestão do fluxo de entregas"
      : tab === "pendentes"
      ? "Ordens sem data de entrega definida"
      : "Histórico de ordens já entregues";

  return (
    <div className="space-y-6 w-full">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={
          <Button size="sm" className="h-8" onClick={() => setCreateOpen(true)}>
            <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
            Nova entrega
          </Button>
        }
      />
      <CreateEntregaDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="h-10">
          <TabsTrigger value="cronograma" className="gap-1.5">
            <PackageSearch className="h-3.5 w-3.5" /> Cronograma
          </TabsTrigger>
          <TabsTrigger value="pendentes" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Pendentes
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5">
            <History className="h-3.5 w-3.5" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cronograma" className="mt-5 focus-visible:outline-none ring-0">
          <CronogramaView onTabChange={setTab} filters={filters} onFiltersChange={setFilters} />
        </TabsContent>
        <TabsContent value="pendentes" className="mt-5 focus-visible:outline-none ring-0">
          <PendentesTab onTabChange={setTab} filters={filters} onFiltersChange={setFilters} />
        </TabsContent>
        <TabsContent value="historico" className="mt-5 focus-visible:outline-none ring-0">
          <EntreguesView onTabChange={setTab} filters={filters} onFiltersChange={setFilters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PendentesTab({ 
  onTabChange, 
  filters, 
  onFiltersChange 
}: { 
  onTabChange: (t: TabKey) => void;
  filters: typeof emptyFilters;
  onFiltersChange: (f: typeof emptyFilters) => void;
}) {
  const { data: scheduleData } = useSchedule();
  const { data: historyData } = useEntregues();
  
  if (!scheduleData) return <div className="text-muted-foreground">Carregando...</div>;
  
  const filtered = applyFilters(scheduleData.rows, filters).filter(
    (r) => isPendente(r) || isSetorIndefinido(r)
  );

  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground">
        <span className="text-foreground font-medium tabular-nums">{filtered.length}</span> de{" "}
        <span className="text-foreground font-medium tabular-nums">{scheduleData.rows.length}</span> registros
      </div>
      <ScheduleFilterBar
        rows={scheduleData.rows}
        filters={filters}
        onChange={onFiltersChange}
        filteredCount={filtered.length}
        totalCount={scheduleData.rows.length}
      />

      {filters.search.trim() && filtered.length === 0 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed p-8 text-center bg-muted/20">
            <PackageSearch className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-20" />
            <h3 className="text-sm font-medium text-foreground">Nenhum resultado em Pendentes</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-[280px] mx-auto">
              A OS "{filters.search}" não foi encontrada no backlog de pendentes.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SearchAlert
              title="Verificar no Cronograma"
              count={applyFilters(scheduleData.rows.filter(r => !isPendente(r) && !isSetorIndefinido(r)), filters).length}
              onClick={() => onTabChange("cronograma")}
              icon={<PackageSearch className="h-4 w-4" />}
            />
            <SearchAlert
              title="Verificar no Histórico"
              count={historyData ? applyFilters(historyData.rows.map((h: any) => ({ ...h, rowIndex: 0, dataEntrega: h.dataProgramada })), filters).length : 0}
              onClick={() => onTabChange("historico")}
              icon={<History className="h-4 w-4" />}
            />
          </div>
        </div>
      )}

      <PendentesView rows={filtered} />
    </div>
  );
}


function SearchAlert({ title, count, onClick, icon }: { title: string; count: number; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-accent/50 transition-all text-left group w-full"
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-[11px] text-muted-foreground">
            {count > 0 ? `${count} ${count === 1 ? "correspondência encontrada" : "correspondências encontradas"}` : "Clique para pesquisar nesta aba"}
          </div>
        </div>
      </div>
      <div className="h-6 w-6 rounded-full border flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
        <ChevronDown className="h-3 w-3 -rotate-90" />
      </div>
    </button>
  );
}

function CronogramaView({ 
  onTabChange, 
  filters, 
  onFiltersChange 
}: { 
  onTabChange: (t: TabKey) => void;
  filters: typeof emptyFilters;
  onFiltersChange: (f: typeof emptyFilters) => void;
}) {
  const { data: scheduleData } = useSchedule();
  const { data: historyData } = useEntregues();
  const [view, setView] = useState<ViewMode>("tabela");
  const [open, setOpen] = useState<Record<string, boolean>>({
    atrasadas: true,
    hoje: true,
    futuras: true,
    definir: true,
  });

  useEffect(() => {
    if (filters.search.trim() || filters.setor !== "all" || filters.tomador !== "all" || filters.status !== "all" || (filters.escopo && filters.escopo.length > 0)) {
      setOpen({
        atrasadas: true,
        hoje: true,
        futuras: true,
        definir: true,
      });
    }
  }, [filters]);

  if (!scheduleData) return <div className="text-muted-foreground">Carregando...</div>;

  const filtered = applyFilters(scheduleData.rows, filters).filter(
    (r) => !isSetorIndefinido(r),
  );

  const atrasadas = filtered.filter(isAtrasado);
  const hoje = filtered.filter((r) => !isAtrasado(r) && isHoje(r));
  const semData = filtered.filter((r) => {
    if (parseBrDate(r.dataEntrega)) return false;
    return true;
  });
  const semDataSet = new Set(semData.map((r) => r.rowIndex));
  const futuras = filtered.filter(
    (r) => !isAtrasado(r) && !isHoje(r) && !semDataSet.has(r.rowIndex),
  );
  const groups = [
    { key: "atrasadas", title: "Entregas atrasadas", description: "Pedidos com prazo de entrega já vencido",
      tone: "text-destructive", accent: "bg-destructive",
      pill: "bg-destructive/10 text-destructive border-destructive/20", rows: atrasadas },
    { key: "hoje", title: "Entregas para hoje", description: "Pedidos cuja entrega vence hoje",
      tone: "text-primary", accent: "bg-primary",
      pill: "bg-primary/10 text-primary border-primary/20", rows: hoje },
    { key: "futuras", title: "Entregas futuras", description: "Pedidos com prazo a vencer",
      tone: "text-foreground", accent: "bg-muted-foreground/40",
      pill: "bg-muted/60 text-muted-foreground border-border", rows: futuras },
    { key: "definir", title: "Data a Definir", description: "Pedidos com escopo definido, mas sem data de entrega",
      tone: "text-amber-600 dark:text-amber-400", accent: "bg-amber-500",
      pill: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30", rows: semData },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium tabular-nums">{filtered.length}</span> de{" "}
          <span className="text-foreground font-medium tabular-nums">{scheduleData.rows.length}</span> registros
        </div>
        <div className="inline-flex items-center rounded-md border border-border bg-card p-0.5">
          <Button size="sm" variant={view === "tabela" ? "default" : "ghost"} className="h-8 px-3" onClick={() => setView("tabela")}>
            <TableIcon className="h-3.5 w-3.5 mr-1.5" /> Tabela
          </Button>
          <Button size="sm" variant={view === "calendario" ? "default" : "ghost"} className="h-8 px-3" onClick={() => setView("calendario")}>
            <CalendarIcon className="h-3.5 w-3.5 mr-1.5" /> Calendário
          </Button>
        </div>
      </div>

      <ScheduleFilterBar
        rows={scheduleData.rows}
        filters={filters}
        onChange={onFiltersChange}
        filteredCount={filtered.length}
        totalCount={scheduleData.rows.length}
      />

      {filters.search.trim() && filtered.length === 0 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed p-8 text-center bg-muted/20">
            <PackageSearch className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-20" />
            <h3 className="text-sm font-medium text-foreground">Nenhum resultado no Cronograma</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-[280px] mx-auto">
              A OS "{filters.search}" não foi encontrada no fluxo ativo de entregas.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SearchAlert
              title="Verificar em Pendentes"
              count={applyFilters(scheduleData.rows.filter(r => isPendente(r) || isSetorIndefinido(r)), filters).length}
              onClick={() => onTabChange("pendentes")}
              icon={<Bell className="h-4 w-4" />}
            />
            <SearchAlert
              title="Verificar no Histórico"
              count={historyData ? applyFilters(historyData.rows.map((h: any) => ({ ...h, rowIndex: 0, dataEntrega: h.dataProgramada })), filters).length : 0}
              onClick={() => onTabChange("historico")}
              icon={<History className="h-4 w-4" />}
            />
          </div>
        </div>
      )}

      {view === "calendario" ? (
        <CalendarView rows={filtered} />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Collapsible
              key={g.key}
              open={open[g.key]}
              onOpenChange={(v) => setOpen((s) => ({ ...s, [g.key]: v }))}
              asChild
            >
              <section className="bg-card/60 border border-border rounded-xl overflow-hidden transition-colors">
                <CollapsibleTrigger className="group relative flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-muted/40 transition-colors cursor-pointer">
                  <span className={`absolute left-0 top-0 bottom-0 w-1 ${g.accent}`} aria-hidden />
                  <div className="flex items-center gap-3 pl-3">
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open[g.key] ? "" : "-rotate-90"}`} />
                    <div>
                      <h2 className={`text-base font-semibold tracking-tight ${g.tone}`}>{g.title}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>
                    </div>
                  </div>
                  <span className={`text-[11px] font-semibold tabular-nums uppercase tracking-wider px-2.5 py-1 rounded-full border ${g.pill}`}>
                    {g.rows.length} {g.rows.length === 1 ? "registro" : "registros"}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                  <div className="border-t border-border">
                    <ScheduleTable rows={g.rows} flush />
                  </div>
                </CollapsibleContent>
              </section>
            </Collapsible>
          ))}
        </div>
      )}
    </div>
  );
}
