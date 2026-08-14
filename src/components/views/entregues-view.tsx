import { useMemo, useState, useEffect } from "react";
import { useEntregues } from "@/hooks/use-entregues";
import type { EntregueRow, ScheduleRow } from "@/lib/sheets.functions";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, X, Maximize2, ChevronRight, PackageSearch, Bell, History } from "lucide-react";
import { applyFilters, isPendente, isSetorIndefinido } from "@/lib/schedule-utils";
import { useSchedule } from "@/hooks/use-schedule";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  parseBrDate, splitSetores, splitEscopo, ESCOPO_TAGS,
} from "@/lib/schedule-utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SetorBadges } from "@/components/setor-badges";
import { EscopoBadges } from "@/components/escopo-badges";
import { OsFullDetailsDialog } from "@/components/os-full-details-dialog";
import { SondButton } from "@/components/sond-button";
import { OsNotasArquivosButton } from "@/components/os-notas-arquivos-button";

const HEADERS = [
  "ENTREGA", "DATA POSTAGEM", "TOMADOR", "OS", "SETOR", "ESCOPO",
  "LABORATÓRIO", "DATA PROGRAMADA", "VOL. COMP.", "VOL. CARACT.",
  "VOL. ESPEC.", "CAPACIDADE",
];

function deltaBadge(delta: string) {
  const n = parseInt(delta, 10);
  if (isNaN(n)) return delta ? <Badge variant="outline">{delta}</Badge> : "—";
  if (n > 5) return <Badge variant="destructive">{n}d atraso</Badge>;
  if (n > 0) return <Badge className="bg-amber-500 hover:bg-amber-500 text-white border-transparent">{n}d atraso</Badge>;
  if (n === 0) return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-transparent">No prazo</Badge>;
  return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-transparent">{Math.abs(n)}d adiantado</Badge>;
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}

function entregueToScheduleRow(e: EntregueRow): ScheduleRow {
  return {
    rowIndex: 0, delta: e.delta, dataPostagem: e.dataPostagem, tomador: e.tomador,
    os: e.os, setor: e.setor, laboratorio: e.laboratorio, dataEntrega: e.dataProgramada,
    volumeComp: e.volumeComp, volumeCaract: e.volumeCaract, mctc: e.volumeEspec,
    mrs: e.capacidade, escopo: e.escopo,
  };
}

export function EntreguesView({ 
  onTabChange, 
  filters: globalFilters, 
  onFiltersChange 
}: { 
  onTabChange?: (t: any) => void;
  filters?: any;
  onFiltersChange?: (f: any) => void;
}) {
  const { data, isLoading } = useEntregues();
  const { data: scheduleData } = useSchedule();
  const [q, setQ] = useState(globalFilters?.search || "");
  const [details, setDetails] = useState<EntregueRow | null>(null);
  const [fullDetails, setFullDetails] = useState<EntregueRow | null>(null);
  const [setor, setSetor] = useState("all");
  const [escopo, setEscopo] = useState<string>("all");
  const [dateField, setDateField] = useState<"postagem" | "programada">("programada");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<
    "postagem_desc" | "postagem_asc" | "programada_desc" | "programada_asc" | "os_asc" | "os_desc"
  >("postagem_desc");

  useEffect(() => {
    if (globalFilters?.search !== undefined && globalFilters.search !== q) {
      setQ(globalFilters.search);
    }
  }, [globalFilters?.search]);

  useEffect(() => {
    if (onFiltersChange && q !== globalFilters?.search) {
      onFiltersChange({ ...globalFilters, search: q });
    }
  }, [q]);

  const setores = useMemo(() => {
    if (!data) return [] as string[];
    const CANON = ["Convencionais", "Especiais", "Dosagem"];
    const present = new Set(data.rows.flatMap((r) => splitSetores(r.setor)));
    return CANON.filter((c) => present.has(c));
  }, [data]);

  const from = dateFrom ? new Date(dateFrom + "T00:00:00") : null;
  const to = dateTo ? new Date(dateTo + "T23:59:59") : null;

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    const list = data.rows.filter((r) => {
      if (setor !== "all" && !splitSetores(r.setor).includes(setor)) return false;
      if (escopo !== "all") {
        const tags = splitEscopo(r.escopo).tags as string[];
        if (!tags.includes(escopo)) return false;
      }
      if (from || to) {
        const raw = dateField === "postagem" ? r.dataPostagem : r.dataProgramada;
        const d = parseBrDate(raw);
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      if (!term) return true;
      return [r.tomador, r.os, r.setor, r.laboratorio, r.dataPostagem, r.dataProgramada]
        .join(" ").toLowerCase().includes(term);
    });
    const sorted = [...list];
    const dateKey = sortBy.startsWith("postagem") ? "dataPostagem"
      : sortBy.startsWith("programada") ? "dataProgramada" : null;
    if (dateKey) {
      const dir = sortBy.endsWith("desc") ? -1 : 1;
      sorted.sort((a, b) => {
        const da = parseBrDate(a[dateKey] as string);
        const db = parseBrDate(b[dateKey] as string);
        const ta = da ? da.getTime() : -Infinity;
        const tb = db ? db.getTime() : -Infinity;
        return (ta - tb) * dir;
      });
    } else {
      const dir = sortBy === "os_desc" ? -1 : 1;
      sorted.sort((a, b) =>
        (a.os || "").localeCompare(b.os || "", "pt-BR", { numeric: true }) * dir,
      );
    }
    return sorted;
  }, [data, q, setor, escopo, dateField, dateFrom, dateTo, from, to, sortBy]);

  const hasActive = !!q.trim() || setor !== "all" || escopo !== "all"
    || !!dateFrom || !!dateTo || sortBy !== "postagem_desc";

  function clearFilters() {
    setQ(""); setSetor("all"); setEscopo("all");
    setDateFrom(""); setDateTo(""); setSortBy("postagem_desc");
  }

  if (isLoading || !data) return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground">
        <span className="text-foreground font-medium tabular-nums">{filtered.length}</span> de{" "}
        <span className="text-foreground font-medium tabular-nums">{data.rows.length}</span> registros
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="relative md:col-span-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por tomador, OS, setor, laboratório..." className="pl-9" />
        </div>
        <div className="md:col-span-2">
          <Select value={setor} onValueChange={setSetor}>
            <SelectTrigger><SelectValue placeholder="Setor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os setores</SelectItem>
              {setores.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-3">
          <Select value={escopo} onValueChange={setEscopo}>
            <SelectTrigger><SelectValue placeholder="Escopo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os escopos</SelectItem>
              {ESCOPO_TAGS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Select value={dateField} onValueChange={(v) => setDateField(v as "postagem" | "programada")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="programada">Data programada</SelectItem>
              <SelectItem value="postagem">Data postagem</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2"><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
        <div className="md:col-span-2"><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        <div className="md:col-span-3">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger><SelectValue placeholder="Ordenar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="postagem_desc">Postagem (mais recente)</SelectItem>
              <SelectItem value="postagem_asc">Postagem (mais antiga)</SelectItem>
              <SelectItem value="programada_desc">Programada (mais recente)</SelectItem>
              <SelectItem value="programada_asc">Programada (mais antiga)</SelectItem>
              <SelectItem value="os_asc">OS (crescente)</SelectItem>
              <SelectItem value="os_desc">OS (decrescente)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasActive && (
          <div className="md:col-span-12">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1.5" /> Limpar filtros
            </Button>
          </div>
        )}
      </div>

      {q.trim() && filtered.length === 0 && onTabChange && scheduleData && (
        <div className="space-y-4 mb-6">
          <div className="rounded-lg border border-dashed p-8 text-center bg-muted/20">
            <PackageSearch className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-20" />
            <h3 className="text-sm font-medium text-foreground">Nenhum resultado no Histórico</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-[280px] mx-auto">
              A OS "{q}" não foi encontrada no histórico de entregas.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => onTabChange("cronograma")}
              className="flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-accent/50 transition-all text-left group w-full"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <PackageSearch className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Verificar no Cronograma</div>
                  <div className="text-[11px] text-muted-foreground">
                    {(() => {
                      const count = applyFilters(scheduleData.rows.filter(r => !isPendente(r) && !isSetorIndefinido(r)), { ...globalFilters, search: q }).length;
                      return count > 0 ? `${count} correspondências encontradas` : "Clique para pesquisar nesta aba";
                    })()}
                  </div>
                </div>
              </div>
              <div className="h-6 w-6 rounded-full border flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <ChevronRight className="h-3 w-3" />
              </div>
            </button>
            <button
              onClick={() => onTabChange("pendentes")}
              className="flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-accent/50 transition-all text-left group w-full"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Verificar em Pendentes</div>
                  <div className="text-[11px] text-muted-foreground">
                    {(() => {
                      const count = applyFilters(scheduleData.rows.filter(r => isPendente(r) || isSetorIndefinido(r)), { ...globalFilters, search: q }).length;
                      return count > 0 ? `${count} correspondências encontradas` : "Clique para pesquisar nesta aba";
                    })()}
                  </div>
                </div>
              </div>
              <div className="h-6 w-6 rounded-full border flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <ChevronRight className="h-3 w-3" />
              </div>
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {HEADERS.map((h) => (
                  <TableHead key={h} className="whitespace-nowrap font-semibold text-xs uppercase tracking-wide">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={HEADERS.length} className="text-center py-12 text-muted-foreground">Nenhum resultado encontrado</TableCell></TableRow>
              ) : (
                filtered.map((row, idx) => (
                  <TableRow key={idx} onClick={() => setDetails(row)} className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="whitespace-nowrap">{deltaBadge(row.delta)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{row.dataPostagem || "—"}</TableCell>
                    <TableCell className="font-medium text-sm min-w-[200px]">{row.tomador}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm font-mono">
                      <div className="flex items-center gap-1.5">
                        <span>{row.os || "—"}</span>
                        {row.os && <SondButton os={row.os} />}
                        {row.os && <OsNotasArquivosButton os={row.os} />}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap"><SetorBadges setor={row.setor} /></TableCell>
                    <TableCell className="min-w-[160px] max-w-[240px]">{row.escopo ? <EscopoBadges escopo={row.escopo} size="xs" /> : "—"}</TableCell>
                    <TableCell className="text-sm min-w-[240px] max-w-[360px] truncate" title={row.laboratorio}>{row.laboratorio || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm font-medium">{row.dataProgramada || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground text-right">{row.volumeComp || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground text-right">{row.volumeCaract || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground text-right">{row.volumeEspec || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground text-right">{row.capacidade || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalhes da OS entregue</DialogTitle></DialogHeader>
          {details && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{details.tomador}</span>
                <Badge variant="outline" className="font-mono text-[10px]">OS {details.os || "—"}</Badge>
                {details.os && <SondButton os={details.os} variant="button" />}
                <SetorBadges setor={details.setor} size="xs" />
                {deltaBadge(details.delta)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Data postagem" value={details.dataPostagem} />
                <Field label="Data programada" value={details.dataProgramada} />
                <Field label="Vol. comp." value={details.volumeComp} />
                <Field label="Vol. caract." value={details.volumeCaract} />
                <Field label="Vol. espec." value={details.volumeEspec} />
                <Field label="Capacidade" value={details.capacidade} />
              </div>
              {details.escopo && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Escopo</div>
                  <EscopoBadges escopo={details.escopo} />
                </div>
              )}
              {details.laboratorio && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Laboratório</div>
                  <div className="rounded-md border bg-muted/30 p-2 whitespace-pre-wrap">{details.laboratorio}</div>
                </div>
              )}
              <div className="flex justify-end pt-2">
                <Button variant="secondary" className="mr-auto" onClick={() => { setFullDetails(details); setDetails(null); }}>
                  <Maximize2 className="h-3.5 w-3.5 mr-1.5" /> Detalhes OS
                </Button>
                <Button variant="outline" onClick={() => setDetails(null)}>Fechar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <OsFullDetailsDialog
        row={fullDetails ? entregueToScheduleRow(fullDetails) : null}
        open={!!fullDetails}
        onOpenChange={(o) => !o && setFullDetails(null)}
        hideRegistrar
      />
    </div>
  );
}