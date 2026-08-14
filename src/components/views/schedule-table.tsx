import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Eye, ExternalLink } from "lucide-react";
import { useState } from "react";
import { EditOsDialog } from "@/components/edit-os-dialog";
import { SetorBadges } from "@/components/setor-badges";
import { EscopoBadges } from "@/components/escopo-badges";
import { OsEntregasPanel } from "@/components/os-entregas-panel";
import { ProgramacaoOsChip, ProgramacaoOsPanel } from "@/components/programacao-os-badge";
import { OsFullDetailsDialog } from "@/components/os-full-details-dialog";
import { RegistrarEntregaButton } from "@/components/registrar-entrega-button";
import { RemoverEntregaButton } from "@/components/remover-entrega-button";
import { OsNotasArquivosButton } from "@/components/os-notas-arquivos-button";
import { Maximize2 } from "lucide-react";
import { isAtrasado, isHoje } from "@/lib/schedule-utils";
import type { ScheduleRow } from "@/lib/sheets.functions";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import type { CadastroRow } from "@/lib/cadastro.functions";
import { SERVICOS } from "@/lib/cadastro.functions";

const HEADERS = [
  "DELTA",
  "DATA POSTAGEM",
  "TOMADOR",
  "OS",
  "SETOR",
  "ESCOPO",
  "LABORATÓRIO",
  "DATA ENTREGA",
  "VOL. COMP.",
  "VOL. CARACT.",
  "MCT.C",
  "MR.S",
];

export function ScheduleTable({
  rows,
  flush = false,
}: {
  rows: ScheduleRow[];
  flush?: boolean;
}) {
  const [details, setDetails] = useState<ScheduleRow | null>(null);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [fullDetails, setFullDetails] = useState<ScheduleRow | null>(null);
  const { lookup } = useCadastroByOs();
  const detailsCad = details ? lookup(details.os) : undefined;
  return (
    <div
      className={
        flush
          ? "overflow-hidden"
          : "rounded-lg border bg-card overflow-hidden"
      }
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border/60">
              {HEADERS.map((h) => (
                <TableHead
                  key={h}
                  className="whitespace-nowrap font-semibold text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={HEADERS.length}
                  className="text-center py-12 text-muted-foreground"
                >
                  Nenhum resultado encontrado
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, idx) => (
                <Row
                  key={idx}
                  row={row}
                  cad={lookup(row.os)}
                  onOpen={() => setDetails(row)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
                  {details.os && (
                    <Button
                      size="sm"
                      variant="outline"
                      asChild
                    >
                      <a
                        href={`https://sond.com.br/servicos/os-numero/${details.os}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> SOND
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditing(details);
                      setDetails(null);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                  </Button>
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
              {detailsCad ? (
                <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Cadastro de OS
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="SUP" value={detailsCad.sup} />
                    <Field label="Mês" value={detailsCad.mes} />
                    <div className="col-span-2">
                      <Field label="Obra" value={detailsCad.obra} />
                    </div>
                    {detailsCad.local && (
                      <div className="col-span-2">
                        <Field label="Local" value={detailsCad.local} />
                      </div>
                    )}
                  </div>
                  {Object.keys(detailsCad.servicos).length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                        Serviços
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {SERVICOS.filter((s) => detailsCad.servicos[s]).map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold bg-background"
                          >
                            <span>{s}</span>
                            <span className="opacity-70 tabular-nums">
                              {detailsCad.servicos[s]}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : details.os ? (
                <div className="text-[11px] text-muted-foreground italic">
                  Sem correspondência no Cadastro de OS para esta OS.
                </div>
              ) : null}
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
              {details.os && <ProgramacaoOsPanel os={details.os} />}
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

function Row({
  row,
  cad,
  onOpen,
}: {
  row: ScheduleRow;
  cad?: CadastroRow;
  onOpen: () => void;
}) {
  const atraso = isAtrasado(row);
  const hoje = isHoje(row);
  let badge: React.ReactNode = null;
  if (atraso) {
    const m = row.delta.match(/(\d+)/);
    badge = (
      <Badge variant="destructive" className="text-xs">
        {m ? `${m[1]}d atraso` : "atraso"}
      </Badge>
    );
  } else if (hoje) {
    badge = (
      <Badge variant="default" className="text-xs">
        Hoje
      </Badge>
    );
  } else if (row.delta) {
    badge = (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        {row.delta}
      </Badge>
    );
  }

  return (
    <TableRow
      onClick={onOpen}
      className={`cursor-pointer hover:bg-muted/40 ${atraso ? "bg-destructive/5" : ""}`}
    >
      <TableCell className="whitespace-nowrap">{badge || "—"}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
        {row.dataPostagem || "—"}
      </TableCell>
      <TableCell className="font-medium text-sm min-w-[200px]">
        <div>{row.tomador}</div>
        {cad?.obra && (
          <div
            className="text-[11px] text-muted-foreground truncate max-w-[260px]"
            title={cad.obra}
          >
            {cad.obra}
          </div>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm font-mono">
        <div className="flex items-center gap-1.5">
          <div className="flex flex-col">
            <span>{row.os || "—"}</span>
            {cad?.sup && (
              <span className="text-[10px] text-muted-foreground">{cad.sup}</span>
            )}
          </div>
          {row.os && (
            <a
              href={`https://sond.com.br/servicos/os-numero/${row.os}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              title="Abrir no SOND"
            >
              SOND
            </a>
          )}
          {row.os && <OsNotasArquivosButton os={row.os} />}
        </div>
          {row.os && <ProgramacaoOsChip os={row.os} />}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <SetorBadges setor={row.setor} />
      </TableCell>
      <TableCell className="min-w-[160px] max-w-[260px]">
        {row.escopo ? <EscopoBadges escopo={row.escopo} size="xs" /> : "—"}
      </TableCell>
      <TableCell
        className="text-sm min-w-[300px] max-w-[400px] truncate"
        title={row.laboratorio}
      >
        {row.laboratorio || "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm font-medium">
        {row.dataEntrega || "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground text-right">
        {row.volumeComp || "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground text-right">
        {row.volumeCaract || "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground text-right">
        {row.mctc || "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground text-right">
        {row.mrs || "—"}
      </TableCell>
    </TableRow>
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