import { useMemo, useState } from "react";
import { useCadastroOs } from "@/hooks/use-cadastro-os";
import {
  SERVICOS,
  MESES,
  type Servico,
  type Mes,
} from "@/lib/cadastro.functions";
import type { CadastroRow } from "@/lib/cadastro.functions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Search, X } from "lucide-react";
import { SondButton } from "@/components/sond-button";

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

export function CadastroListView() {
  const { data, isLoading } = useCadastroOs();
  const [q, setQ] = useState("");
  const [mes, setMes] = useState<"all" | Mes>("all");
  const [servico, setServico] = useState<"all" | Servico>("all");
  const [selected, setSelected] = useState<CadastroRow | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (mes !== "all" && r.mes !== mes) return false;
      if (servico !== "all" && !(servico in r.servicos)) return false;
      if (!term) return true;
      return [r.tomador, r.os, r.sup, r.obra, r.local]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [data, q, mes, servico]);

  const totals = useMemo(() => {
    const acc: Record<Servico, { horas: number; os: number }> = Object.fromEntries(
      SERVICOS.map((s) => [s, { horas: 0, os: 0 }]),
    ) as Record<Servico, { horas: number; os: number }>;
    for (const r of filtered) {
      for (const s of SERVICOS) {
        const v = r.servicos[s];
        if (v && v > 0) {
          acc[s].horas += v;
          acc[s].os += 1;
        }
      }
    }
    return acc;
  }, [filtered]);

  const hasActive = !!q.trim() || mes !== "all" || servico !== "all";

  if (isLoading || !data)
    return <div className="text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-5">
      {/* Resumo compacto por serviço */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
        {SERVICOS.map((s) => {
          const t = totals[s];
          const active = servico === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setServico(active ? "all" : s)}
              className={`text-left rounded-md border p-2 transition ${SERVICO_TONE[s]} ${
                active ? "ring-2 ring-primary" : "hover:opacity-90"
              }`}
            >
              <div className="text-[10px] font-bold tracking-wide">{s}</div>
              <div className="text-base font-bold tabular-nums leading-tight">
                {t.horas.toLocaleString("pt-BR")}
              </div>
              <div className="text-[10px] opacity-70">{t.os} OS</div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="relative md:col-span-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por tomador, OS, SUP, obra, local..."
            className="pl-9"
          />
        </div>
        <div className="md:col-span-3">
          <Select value={mes} onValueChange={(v) => setMes(v as "all" | Mes)}>
            <SelectTrigger>
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
        <div className="md:col-span-3">
          <Select value={servico} onValueChange={(v) => setServico(v as "all" | Servico)}>
            <SelectTrigger>
              <SelectValue placeholder="Serviço" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os serviços</SelectItem>
              {SERVICOS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasActive && (
          <div className="md:col-span-1 flex">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setQ("");
                setMes("all");
                setServico("all");
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 border-b">
                <TableHead className="text-[10px] uppercase tracking-wider">Mês</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">SUP</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">OS</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Tomador</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Obra</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Data criação</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Serviços (qtd)</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    Nenhum resultado encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r, i) => (
                  <TableRow
                    key={i}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell className="text-xs font-mono font-semibold">{r.mes}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">{r.sup || "—"}</TableCell>
                    <TableCell className="text-xs font-mono whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{r.os || "—"}</span>
                        {r.os && <SondButton os={r.os} />}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium min-w-[180px]">{r.tomador}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={r.obra}>
                      {r.obra || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.dataCriacao || r.dataEnvio || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {SERVICOS.filter((s) => r.servicos[s]).map((s) => (
                          <span
                            key={s}
                            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${SERVICO_TONE[s]}`}
                            title={`${s}: ${r.servicos[s]}`}
                          >
                            <span>{s}</span>
                            <span className="opacity-80 tabular-nums">{r.servicos[s]}</span>
                          </span>
                        ))}
                        {Object.keys(r.servicos).length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-right tabular-nums whitespace-nowrap">
                      {r.totalHoras.toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <DetailsDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function DetailsDialog({ row, onClose }: { row: CadastroRow | null; onClose: () => void }) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-base">{row.os || "—"}</span>
                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted">{row.mes}</span>
                {row.os && <SondButton os={row.os} variant="button" />}
              </DialogTitle>
              <DialogDescription className="text-base font-medium text-foreground">
                {row.tomador}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 mt-2">
              <section>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Identificação</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="SUP" value={row.sup} mono />
                  <Field label="Data de criação" value={row.dataCriacao} />
                  <Field label="Data de envio" value={row.dataEnvio} />
                </div>
              </section>

              <section>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Obra</h3>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <Field label="Obra" value={row.obra} />
                  <Field label="Local" value={row.local} />
                </div>
              </section>

              <section>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Serviços contratados</h3>
                <div className="flex flex-wrap gap-2">
                  {SERVICOS.filter((s) => row.servicos[s]).map((s) => (
                    <span
                      key={s}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${SERVICO_TONE[s]}`}
                    >
                      <span>{s}</span>
                      <span className="opacity-80 tabular-nums">{row.servicos[s]}</span>
                    </span>
                  ))}
                  {Object.keys(row.servicos).length === 0 && (
                    <span className="text-sm text-muted-foreground">Nenhum serviço informado</span>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Total:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {row.totalHoras.toLocaleString("pt-BR")}
                  </span>
                </div>
              </section>

              <section>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Retornos</h3>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left text-[10px] uppercase tracking-wider px-3 py-2">Etapa</th>
                        <th className="text-left text-[10px] uppercase tracking-wider px-3 py-2">Suporte</th>
                        <th className="text-left text-[10px] uppercase tracking-wider px-3 py-2">Cliente</th>
                      </tr>
                    </thead>
                    <tbody>
                      <RetornoRow label="1º retorno" sup={row.primeiroSuporte} cli={row.primeiroCliente} />
                      <RetornoRow label="2º retorno" sup={row.segundoSuporte} cli={row.segundoCliente} />
                      <RetornoRow label="3º retorno" sup={row.terceiroSuporte} cli={row.terceiroCliente} />
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  const v = (value ?? "").trim();
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className={`${mono ? "font-mono" : ""} ${v ? "" : "text-muted-foreground"}`}>{v || "—"}</div>
    </div>
  );
}

function RetornoRow({ label, sup, cli }: { label: string; sup: string; cli: string }) {
  const s = (sup ?? "").trim();
  const c = (cli ?? "").trim();
  const empty = (v: string) => !v || v === "-";
  return (
    <tr className="border-t">
      <td className="px-3 py-2 text-xs font-medium">{label}</td>
      <td className={`px-3 py-2 text-xs ${empty(s) ? "text-muted-foreground" : ""}`}>{empty(s) ? "—" : s}</td>
      <td className={`px-3 py-2 text-xs ${empty(c) ? "text-muted-foreground" : ""}`}>{empty(c) ? "—" : c}</td>
    </tr>
  );
}