import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Calendar, CalendarX, Pencil } from "lucide-react";
import { parseBrDate, isPendente, isSetorIndefinido } from "@/lib/schedule-utils";
import type { ScheduleRow } from "@/lib/sheets.functions";
import { EditOsDialog } from "@/components/edit-os-dialog";
import { SetorBadges } from "@/components/setor-badges";
import { EscopoBadges } from "@/components/escopo-badges";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { CadastroDetailsDialog } from "@/components/cadastro-details-dialog";
import type { CadastroRow } from "@/lib/cadastro.functions";
import { SondButton } from "@/components/sond-button";
import { OsNotasArquivosButton } from "@/components/os-notas-arquivos-button";

export function PendentesView({ rows }: { rows: ScheduleRow[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [selected, setSelected] = useState<CadastroRow | null>(null);
  const { lookup } = useCadastroByOs();

  const pendentes = rows.filter((r) => isPendente(r) || isSetorIndefinido(r));
  const sorted = [...pendentes].sort((a, b) => {
    const da = parseBrDate(a.dataPostagem);
    const db = parseBrDate(b.dataPostagem);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!mounted) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        Carregando pendentes...
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
          <Calendar className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-semibold text-foreground">Nenhuma OS pendente</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Todas as OS filtradas possuem data de entrega definida.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-amber-500/5">
        <div className="flex items-center gap-2">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">OS sem data de entrega</h2>
            <p className="text-xs text-muted-foreground">
              {sorted.length}{" "}
              {sorted.length === 1 ? "ordem aguardando" : "ordens aguardando"}{" "}
              definição de setor ou prazo
            </p>
          </div>
        </div>
      </div>
      <ul className="divide-y">
        {sorted.map((r, idx) => {
          const post = parseBrDate(r.dataPostagem);
          const diasAberta = post
            ? Math.floor((today.getTime() - post.getTime()) / 86400000)
            : null;
          const urgent = diasAberta !== null && diasAberta >= 7;
          const cad = lookup(r.os);
          const tomadorDisplay = cad?.tomador || r.tomador;
          const clickable = !!cad;
          return (
            <li
              key={idx}
              className={`flex items-start gap-3 px-4 py-3 hover:bg-accent/40 transition-colors ${urgent ? "bg-destructive/5" : ""} ${clickable ? "cursor-pointer" : ""}`}
              onClick={() => cad && setSelected(cad)}
            >
              <div
                className={`mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  urgent
                    ? "bg-destructive/15 text-destructive"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                }`}
              >
                <CalendarX className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm truncate">
                    {tomadorDisplay}
                  </span>
                  {r.os && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      OS {r.os}
                    </Badge>
                  )}
                  {r.os && <SondButton os={r.os} />}
                  {r.os && <OsNotasArquivosButton os={r.os} />}
                  {isSetorIndefinido(r) ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    >
                      Setor a definir
                    </Badge>
                  ) : (
                    r.setor && <SetorBadges setor={r.setor} size="xs" />
                  )}
                  {cad?.sup && (
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      SUP {cad.sup}
                    </Badge>
                  )}
                </div>
                {r.escopo?.trim() && (
                  <div className="mt-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                      Possíveis ensaios
                    </p>
                    <EscopoBadges escopo={r.escopo} size="xs" />
                  </div>
                )}
                {r.laboratorio && (
                  <p
                    className="text-xs text-muted-foreground mt-1 line-clamp-2"
                    title={r.laboratorio}
                  >
                    {r.laboratorio}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                  <span>
                    Postada em{" "}
                    <span className="font-medium text-foreground">
                      {r.dataPostagem || "—"}
                    </span>
                  </span>
                  {diasAberta !== null && (
                    <span
                      className={
                        urgent
                          ? "text-destructive font-medium"
                          : "text-amber-600 dark:text-amber-400 font-medium"
                      }
                    >
                      {diasAberta}{" "}
                      {diasAberta === 1 ? "dia aberta" : "dias aberta"}
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant={urgent ? "destructive" : "outline"}
                className="h-7 shrink-0 gap-1.5 text-[11px]"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(r);
                }}
              >
                <Pencil className="h-3 w-3" />
                Definir data
              </Button>
            </li>
          );
        })}
      </ul>
      <EditOsDialog
        row={editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
      <CadastroDetailsDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}