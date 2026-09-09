/**
 * Painel "Revisões do Relatório" — histórico somente-leitura das versões em
 * PDF já salvas, com status de envio ao Drive por linha e o resultado da
 * aprovação de cada uma (quem verificou/aprovou/rejeitou e quando).
 *
 * De propósito NÃO tem nenhum botão que muda o fluxo (enviar pra
 * verificação, verificar, aprovar, rejeitar) — isso ficava duplicado com
 * os botões de cabeçalho de cada relatório (mesma ação, dois lugares
 * diferentes), o que fazia a tela parecer "dissociada": o cabeçalho dizia
 * uma coisa e uma linha antiga da tabela — de uma versão já superada,
 * quando uma revisão seguinte tinha sido salva antes dela ser enviada —
 * continuava oferecendo uma ação que não fazia mais sentido. Toda ação
 * agora mora só no cabeçalho de cada relatório; este painel só mostra o
 * que aconteceu.
 */
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Download,
  FileText,
  ExternalLink,
  RefreshCw,
  Cloud,
  CloudCheck,
  CloudAlert,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { ApprovalRow } from "@/lib/approvals.functions";

export interface ReportVersionLike {
  id: string;
  scopeId: string;
  rev: number;
  createdAt: string;
  filename: string;
  size: number;
  pdfBlob: Blob;
}

export interface DriveSyncStatusLike {
  entries: { rev: number | null; kind: string; status: string; error?: string | null; folder_id?: string | null }[];
}

interface ReportVersionsPanelProps {
  scopeId: string;
  versions: ReportVersionLike[];
  approvals: ApprovalRow[];
  driveFolderUrl: string | null;
  driveStatus: DriveSyncStatusLike | null;
  driveBusy: boolean;
  onSyncAll: () => Promise<void> | void;
  onOpenReport: () => void;
  onDownloadVersion: (v: ReportVersionLike) => void;
  onDeleteVersion: (id: string) => Promise<void> | void;
}

export function ReportVersionsPanel({
  scopeId: _scopeId,
  versions,
  approvals,
  driveFolderUrl,
  driveStatus,
  driveBusy,
  onSyncAll,
  onOpenReport,
  onDownloadVersion,
  onDeleteVersion,
}: ReportVersionsPanelProps) {
  const [previewVersion, setPreviewVersion] = useState<{ url: string; filename: string; rev: number } | null>(null);

  const openPreviewVersion = (v: ReportVersionLike) => {
    if (previewVersion) URL.revokeObjectURL(previewVersion.url);
    const url = URL.createObjectURL(v.pdfBlob);
    setPreviewVersion({ url, filename: v.filename, rev: v.rev });
  };
  const closePreviewVersion = () => {
    if (previewVersion) URL.revokeObjectURL(previewVersion.url);
    setPreviewVersion(null);
  };

  const latestRev = versions.length > 0 ? Math.max(...versions.map((v) => v.rev)) : null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Histórico de Versões do Relatório</CardTitle>
            <CardDescription>
              Cada versão é uma cópia estática (arquivo PDF) salva num momento — <b>não</b> muda depois. Pra ver os
              dados atuais da tela (mesmo sem salvar), use <b>Pré-visualizar Dados Atuais</b>. As ações de enviar,
              verificar e aprovar ficam nos botões no topo do relatório, não aqui.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {driveFolderUrl && (
              <a href={driveFolderUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Abrir pasta no Drive
              </a>
            )}
            <Button variant="outline" size="sm" onClick={() => void onSyncAll()} disabled={driveBusy} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${driveBusy ? "animate-spin" : ""}`} />
              {driveBusy ? "Enviando…" : "Sincronizar com Drive"}
            </Button>
            <Button onClick={onOpenReport} className="gap-2">
              <FileText className="h-4 w-4" /> Pré-visualizar Dados Atuais
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhuma versão salva ainda. Use os botões no topo do relatório pra gerar e enviar a primeira.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Versão</TableHead>
                  <TableHead>Data / Hora</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="text-right">Tamanho</TableHead>
                  <TableHead className="w-28 text-center">Drive</TableHead>
                  <TableHead className="w-56 text-center">Resultado</TableHead>
                  <TableHead className="w-44 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((v) => {
                  const appr = approvals.find((a) => a.rev === v.rev) ?? null;
                  const isCurrent = v.rev === latestRev;
                  // "Versão" (não "Revisão"/"Rev") de propósito — esse número é
                  // só quantas vezes o PDF foi (re)gerado, não a revisão da
                  // amostra (campo separado, impresso no próprio documento).
                  const label = `Versão ${String(v.rev).padStart(2, "0")}`;
                  return (
                    <TableRow key={v.id} className={isCurrent ? "bg-primary/5" : undefined}>
                      <TableCell className="font-semibold">
                        {label}
                        {isCurrent && (
                          <span className="ml-1.5 inline-block rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary align-middle">
                            atual
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Intl.DateTimeFormat("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          dateStyle: "short",
                          timeStyle: "medium",
                        }).format(new Date(v.createdAt))}
                      </TableCell>
                      <TableCell className="text-xs">{v.filename}</TableCell>
                      <TableCell className="text-right text-xs">{(v.size / 1024).toFixed(0)} KB</TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const entry = driveStatus?.entries.find((e) => e.rev === v.rev && e.kind === "pdf");
                          if (!entry) return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Cloud className="h-3 w-3" /> —</span>;
                          if (entry.status === "ok") return <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600"><CloudCheck className="h-3 w-3" /> ok</span>;
                          return <span className="inline-flex items-center gap-1 text-[10px] text-destructive" title={entry.error ?? ""}><CloudAlert className="h-3 w-3" /> erro</span>;
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        <ApprovalStatusBadge approval={appr} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => openPreviewVersion(v)} title="Ver o PDF salvo desta versão">
                            <Eye className="h-3 w-3" /> Ver
                          </Button>
                          <Button size="sm" variant="secondary" className="gap-1" onClick={() => onDownloadVersion(v)}>
                            <Download className="h-3 w-3" /> Baixar
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void onDeleteVersion(v.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!previewVersion} onOpenChange={(o) => !o && closePreviewVersion()}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] p-0 flex flex-col">
          <DialogHeader className="px-4 py-2 border-b">
            <DialogTitle className="text-sm">
              Versão {String(previewVersion?.rev ?? 0).padStart(2, "0")} · {previewVersion?.filename}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Arquivo PDF salvo neste momento — não reflete nenhuma edição feita depois.
            </DialogDescription>
          </DialogHeader>
          {previewVersion && <iframe src={previewVersion.url} title="Relatório PDF" className="flex-1 w-full border-0" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Badge somente-leitura — mostra o resultado da aprovação desta versão, sem nenhuma ação. */
function ApprovalStatusBadge({ approval }: { approval: ApprovalRow | null }) {
  if (!approval) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <Clock className="h-3 w-3" /> Não enviada
      </span>
    );
  }
  const fmt = (iso?: string | null) =>
    iso
      ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso))
      : "";

  const status = approval.status === "pendente" ? "pendente_verificacao" : approval.status;

  const badgeMap: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    pendente_verificacao: { label: "Aguardando verificação", cls: "bg-amber-500/15   text-amber-700   dark:text-amber-400", Icon: Clock },
    pendente_aprovacao: { label: "Aguardando aprovação", cls: "bg-sky-500/15     text-sky-700     dark:text-sky-400", Icon: Clock },
    verificado: { label: "Verificado", cls: "bg-sky-500/15     text-sky-700     dark:text-sky-400", Icon: ShieldCheck },
    rejeitado_verificacao: { label: "Rejeitado na verificação", cls: "bg-destructive/15 text-destructive", Icon: XCircle },
    aprovado: { label: "Aprovado", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", Icon: CheckCircle2 },
    rejeitado: { label: "Rejeitado", cls: "bg-destructive/15 text-destructive", Icon: XCircle },
  };
  const b = badgeMap[status] ?? badgeMap.pendente_verificacao;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${b.cls}`}>
        <b.Icon className="h-3 w-3" /> {b.label}
      </span>
      <div className="text-[9px] text-muted-foreground leading-tight text-center">
        <div>sol. {approval.requested_by_name ?? "—"} · {fmt(approval.requested_at)}</div>
        {approval.verified_by_name && <div>ver. {approval.verified_by_name} · {fmt(approval.verified_at)}</div>}
        {approval.decided_by_name && <div>apr. {approval.decided_by_name} · {fmt(approval.decided_at)}</div>}
      </div>
      {approval.verification_comment && (
        <div className="text-[10px] italic text-muted-foreground text-center max-w-[220px] truncate" title={approval.verification_comment}>
          Verif.: "{approval.verification_comment}"
        </div>
      )}
      {approval.comment && (
        <div className="text-[10px] italic text-muted-foreground text-center max-w-[220px] truncate" title={approval.comment}>
          Aprov.: "{approval.comment}"
        </div>
      )}
    </div>
  );
}
