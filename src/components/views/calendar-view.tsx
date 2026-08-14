import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Pencil, Eye } from "lucide-react";
import { EditOsDialog } from "@/components/edit-os-dialog";
import { SetorBadges } from "@/components/setor-badges";
import { EscopoBadges } from "@/components/escopo-badges";
import { OsEntregasPanel } from "@/components/os-entregas-panel";
import { OsFullDetailsDialog } from "@/components/os-full-details-dialog";
import { RegistrarEntregaButton } from "@/components/registrar-entrega-button";
import { RemoverEntregaButton } from "@/components/remover-entrega-button";
import { Maximize2 } from "lucide-react";
import { SondButton } from "@/components/sond-button";
import { OsNotasArquivosButton } from "@/components/os-notas-arquivos-button";
import {
  MONTH_NAMES,
  WEEK_DAYS,
  dateKey,
  parseBrDate,
  isAtrasado,
  getFeriados,
  isWeekend,
} from "@/lib/schedule-utils";
import type { ScheduleRow } from "@/lib/sheets.functions";

export function CalendarView({ rows }: { rows: ScheduleRow[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleRow[]>();
    for (const r of rows) {
      const d = parseBrDate(r.dataEntrega);
      if (!d) continue;
      const k = dateKey(d);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return map;
  }, [rows]);

  const initialMonth = useMemo(() => {
    const dates = rows
      .map((r) => parseBrDate(r.dataEntrega))
      .filter((d): d is Date => d !== null);
    if (dates.length === 0)
      return new Date(today.getFullYear(), today.getMonth(), 1);
    const min = dates.reduce((a, b) => (a < b ? a : b));
    return new Date(min.getFullYear(), min.getMonth(), 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const [cursor, setCursor] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [details, setDetails] = useState<ScheduleRow | null>(null);
  const [fullDetails, setFullDetails] = useState<ScheduleRow | null>(null);

  if (!mounted) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
        Carregando calendário...
      </div>
    );
  }

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const feriados = getFeriados(year);

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedRows = selectedDay ? byDay.get(selectedDay) ?? [] : [];
  const selectedDate = selectedDay ? new Date(selectedDay + "T00:00:00") : null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
            }
          >
            Hoje
          </Button>
        </div>
        <h2 className="text-lg font-semibold">
          {MONTH_NAMES[month]} {year}
        </h2>
        <div className="text-sm text-muted-foreground">
          {rows.filter((r) => parseBrDate(r.dataEntrega)).length} entregas
        </div>
      </div>

      <div className="grid grid-cols-7 border-b bg-muted/30">
        {WEEK_DAYS.map((w, i) => (
          <div
            key={w}
            className={`text-xs font-semibold text-center py-2 uppercase tracking-wide ${
              i === 0 || i === 6 ? "text-rose-500" : "text-muted-foreground"
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) {
            return (
              <div
                key={i}
                className="min-h-[110px] border-r border-b bg-muted/10"
              />
            );
          }
          const k = dateKey(d);
          const dayRows = byDay.get(k) ?? [];
          const isToday = d.getTime() === today.getTime();
          const isPast = d.getTime() < today.getTime();
          const hasAtraso = dayRows.some(isAtrasado);
          const feriadoNome = feriados.get(k);
          const weekend = isWeekend(d);
          return (
            <button
              key={i}
              type="button"
              onClick={() => dayRows.length && setSelectedDay(k)}
              className={`text-left min-h-[110px] border-r border-b p-1.5 transition-colors ${
                dayRows.length
                  ? "hover:bg-accent cursor-pointer"
                  : "cursor-default"
              } ${
                isToday
                  ? "bg-primary/5"
                  : feriadoNome
                    ? "bg-amber-100/60 dark:bg-amber-900/20"
                    : weekend
                      ? "bg-rose-50/60 dark:bg-rose-950/20"
                      : ""
              }`}
              title={feriadoNome ?? undefined}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-semibold inline-flex items-center justify-center h-6 w-6 rounded-full ${
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : feriadoNome
                        ? "text-amber-700 dark:text-amber-400"
                        : weekend
                          ? "text-rose-500"
                          : isPast
                            ? "text-muted-foreground"
                            : ""
                  }`}
                >
                  {d.getDate()}
                </span>
                {dayRows.length > 0 && (
                  <Badge
                    variant={hasAtraso ? "destructive" : "secondary"}
                    className="text-[10px] h-5 px-1.5"
                  >
                    {dayRows.length}
                  </Badge>
                )}
              </div>
              {feriadoNome && (
                <div className="text-[10px] font-medium text-amber-700 dark:text-amber-400 truncate mb-0.5">
                  {feriadoNome}
                </div>
              )}
              <div className="space-y-1">
                {dayRows.slice(0, 3).map((r, idx) => {
                  const atraso = isAtrasado(r);
                  return (
                    <div
                      key={idx}
                      className={`text-[11px] truncate rounded px-1.5 py-0.5 ${
                        atraso
                          ? "bg-destructive/10 text-destructive"
                          : "bg-primary/10 text-primary"
                      }`}
                      title={`OS ${r.os} — ${r.tomador}`}
                    >
                      {r.os ? `OS ${r.os}` : r.tomador}
                    </div>
                  );
                })}
                {dayRows.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1.5">
                    +{dayRows.length - 3} mais
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-t text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900" />
          Final de semana
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-800" />
          Feriado (Nacional / SP / São Pedro)
        </div>
      </div>

      <Dialog
        open={!!selectedDay}
        onOpenChange={(o) => !o && setSelectedDay(null)}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Entregas em{" "}
              {selectedDate &&
                `${String(selectedDate.getDate()).padStart(2, "0")}/${String(
                  selectedDate.getMonth() + 1,
                ).padStart(2, "0")}/${selectedDate.getFullYear()}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedRows.map((r, idx) => {
              const atraso = isAtrasado(r);
              return (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 ${atraso ? "border-destructive/30 bg-destructive/5" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-semibold text-sm">{r.tomador}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        OS {r.os || "—"}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <SetorBadges setor={r.setor} />
                      {atraso && (
                        <Badge variant="destructive" className="text-xs">
                          {r.delta}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {r.laboratorio && (
                    <div className="text-sm text-muted-foreground">
                      {r.laboratorio}
                    </div>
                  )}
                  <div className="mt-3 flex justify-end gap-2">
                    {r.os && <OsNotasArquivosButton os={r.os} variant="button" />}
                    {r.os && <SondButton os={r.os} variant="button" />}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDetails(r)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" /> Detalhes
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setEditing(r)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-8">
              <DialogTitle>Detalhes da OS</DialogTitle>
              {details && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <RegistrarEntregaButton
                    row={details}
                    size="sm"
                    onDone={() => setDetails(null)}
                  />
                  <RemoverEntregaButton
                    row={details}
                    size="sm"
                    onDone={() => setDetails(null)}
                  />
                </div>
              )}
            </div>
          </DialogHeader>
          {details && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{details.tomador}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  OS {details.os || "—"}
                </Badge>
                {details.os && <SondButton os={details.os} variant="button" />}
                {details.os && <OsNotasArquivosButton os={details.os} variant="button" />}
                <SetorBadges setor={details.setor} size="xs" />
                {isAtrasado(details) && (
                  <Badge variant="destructive" className="text-[10px]">
                    {details.delta}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Data postagem" value={details.dataPostagem} />
                <Field label="Data entrega" value={details.dataEntrega} />
                <Field label="Vol. comp." value={details.volumeComp} />
                <Field label="Vol. caract." value={details.volumeCaract} />
                <Field label="MCT.C" value={details.mctc} />
                <Field label="MR.S" value={details.mrs} />
              </div>
              {details.escopo && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Escopo
                  </div>
                  <EscopoBadges escopo={details.escopo} />
                </div>
              )}
              {details.laboratorio && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Laboratório
                  </div>
                  <div className="rounded-md border bg-muted/30 p-2 whitespace-pre-wrap">
                    {details.laboratorio}
                  </div>
                </div>
              )}
              {details.os && (
                <OsEntregasPanel
                  os={details.os}
                  excludeProgramada={details.dataEntrega}
                  excludeLaboratorio={details.laboratorio}
                />
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDetails(null)}>
                  Fechar
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setFullDetails(details);
                    setDetails(null);
                  }}
                >
                  <Maximize2 className="h-3.5 w-3.5 mr-1.5" /> Detalhes OS
                </Button>
                <Button
                  onClick={() => {
                    setEditing(details);
                    setDetails(null);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <OsFullDetailsDialog
        row={fullDetails}
        open={!!fullDetails}
        onOpenChange={(o) => !o && setFullDetails(null)}
      />

      <EditOsDialog
        row={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}