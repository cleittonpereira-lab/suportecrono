/**
 * Painel "Revisões do Relatório" — tabela de versões em PDF, status de envio
 * ao Drive por linha, e aprovação/rejeição controlada por papel (verificador/
 * responsável técnico). Extraído do que já existia (só) em
 * `src/routes/_app.relatorio.triaxial-cid.tsx`, pra Umidade Natural, Módulo
 * de Resiliência e ASF.DAP ganharem o mesmo nível de acompanhamento sem
 * duplicar ~200 linhas de JSX à mão em cada um.
 *
 * Fica "burro" de propósito pra coisas específicas de cada relatório
 * (sincronizar com o Drive, baixar, excluir, abrir o relatório) — essas
 * entram como callbacks; só aprovação/verificação (`requestApproval`/
 * `verifyApproval`/`decideApproval`) é chamada direto aqui porque é
 * genuinamente compartilhada entre todos os ensaios.
 */
import { useState } from "react";
import {
  Send,
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
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { requestApproval, verifyApproval, decideApproval, type ApprovalRow } from "@/lib/approvals.functions";

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
  onRefreshApprovals: () => Promise<void> | void;
  isAdmin: boolean;
  isVerificador: boolean;
  driveFolderUrl: string | null;
  driveStatus: DriveSyncStatusLike | null;
  driveBusy: boolean;
  onSyncAll: () => Promise<void> | void;
  onOpenReport: () => void;
  onDownloadVersion: (v: ReportVersionLike) => void;
  onDeleteVersion: (id: string) => Promise<void> | void;
}

export function ReportVersionsPanel({
  scopeId,
  versions,
  approvals,
  onRefreshApprovals,
  isAdmin,
  isVerificador,
  driveFolderUrl,
  driveStatus,
  driveBusy,
  onSyncAll,
  onOpenReport,
  onDownloadVersion,
  onDeleteVersion,
}: ReportVersionsPanelProps) {
  const [previewVersion, setPreviewVersion] = useState<{ url: string; filename: string; rev: number } | null>(null);
  const [decideOpen, setDecideOpen] = useState<null | {
    rev: number;
    stage: "verify" | "approve";
    decision: "verificado" | "rejeitado_verificacao" | "aprovado" | "rejeitado";
  }>(null);
  const [decideComment, setDecideComment] = useState("");
  const [decideBusy, setDecideBusy] = useState(false);

  const openPreviewVersion = (v: ReportVersionLike) => {
    if (previewVersion) URL.revokeObjectURL(previewVersion.url);
    const url = URL.createObjectURL(v.pdfBlob);
    setPreviewVersion({ url, filename: v.filename, rev: v.rev });
  };
  const closePreviewVersion = () => {
    if (previewVersion) URL.revokeObjectURL(previewVersion.url);
    setPreviewVersion(null);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Revisões do Relatório</CardTitle>
            <CardDescription>
              Cada clique em <b>Salvar Versão</b> cria uma nova revisão (Rev 00, 01, 02…) armazenada localmente e enviada ao <b>Google Drive da Suporte</b> (PDF · dados · fotos).
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
              <FileText className="h-4 w-4" /> Abrir Relatório
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhuma revisão salva ainda. Abra o relatório e clique em <b>Salvar Versão</b>.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Prévia / Revisão</TableHead>
                  <TableHead>Data / Hora</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="text-right">Tamanho</TableHead>
                  <TableHead className="w-28 text-center">Drive</TableHead>
                  <TableHead className="w-56 text-center">Aprovação</TableHead>
                  <TableHead className="w-56 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((v) => {
                  const appr = approvals.find((a) => a.rev === v.rev) ?? null;
                  const isApproved = appr?.status === "aprovado";
                  const label = isApproved
                    ? `Rev ${String(v.rev).padStart(2, "0")}`
                    : `Prévia ${String(v.rev).padStart(2, "0")}`;
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-semibold">{label}</TableCell>
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
                        <ApprovalCell
                          approval={appr}
                          isAdmin={isAdmin}
                          isVerificador={isVerificador}
                          onRequest={async () => {
                            try {
                              await requestApproval({ data: { scopeId, rev: v.rev, filename: v.filename } });
                              toast.success(`Aprovação solicitada para Rev ${String(v.rev).padStart(2, "0")}`);
                              await onRefreshApprovals();
                            } catch (err) {
                              toast.error(`Falha: ${(err as Error).message}`);
                            }
                          }}
                          onDecide={(stage, decision) => {
                            setDecideComment("");
                            setDecideOpen({ rev: v.rev, stage, decision });
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => openPreviewVersion(v)} title="Visualizar PDF">
                            <Eye className="h-3 w-3" /> Visualizar
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
              Visualização — Rev {String(previewVersion?.rev ?? 0).padStart(2, "0")} · {previewVersion?.filename}
            </DialogTitle>
          </DialogHeader>
          {previewVersion && <iframe src={previewVersion.url} title="Relatório PDF" className="flex-1 w-full border-0" />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!decideOpen} onOpenChange={(o) => !o && setDecideOpen(null)}>
        <DialogContent className="sm:max-w-md">
          {(() => {
            if (!decideOpen) return null;
            const isVerifyStage = decideOpen.stage === "verify";
            const isPositive = decideOpen.decision === "verificado" || decideOpen.decision === "aprovado";
            const requireComment = !isPositive;
            const title = isVerifyStage
              ? isPositive ? "Verificar Revisão" : "Rejeitar Verificação"
              : isPositive ? "Aprovar Revisão" : "Rejeitar Aprovação";
            const desc = isVerifyStage
              ? isPositive
                ? "Confirme que os dados do relatório foram verificados. O comentário é opcional."
                : "Descreva o que precisa ser corrigido pelo laboratorista antes de reenviar."
              : isPositive
                ? "Aprovação técnica final. O comentário é opcional e ficará registrado."
                : "Descreva o motivo da rejeição pelo Responsável Técnico.";
            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {title} — Rev {String(decideOpen.rev).padStart(2, "0")}
                  </DialogTitle>
                  <DialogDescription>{desc}</DialogDescription>
                </DialogHeader>
                <Textarea
                  value={decideComment}
                  onChange={(e) => setDecideComment(e.target.value)}
                  placeholder={isPositive ? "Comentário (opcional)…" : "Motivo (obrigatório)…"}
                  rows={4}
                />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setDecideOpen(null)} disabled={decideBusy}>Cancelar</Button>
                  <Button
                    disabled={decideBusy || (requireComment && !decideComment.trim())}
                    onClick={async () => {
                      setDecideBusy(true);
                      try {
                        const payload = { scopeId, rev: decideOpen.rev, comment: decideComment.trim() || undefined };
                        if (isVerifyStage) {
                          await verifyApproval({ data: { ...payload, decision: decideOpen.decision as "verificado" | "rejeitado_verificacao" } });
                          toast.success(isPositive ? "Verificação registrada — aguardando aprovação" : "Verificação rejeitada");
                        } else {
                          await decideApproval({ data: { ...payload, decision: decideOpen.decision as "aprovado" | "rejeitado" } });
                          toast.success(isPositive ? "Revisão aprovada" : "Revisão rejeitada");
                        }
                        setDecideOpen(null);
                        await onRefreshApprovals();
                      } catch (err) {
                        toast.error(`Falha: ${(err as Error).message}`);
                      } finally {
                        setDecideBusy(false);
                      }
                    }}
                    className={isPositive ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-destructive hover:bg-destructive/90"}
                  >
                    {decideBusy ? "Enviando…" : `Confirmar ${isPositive ? (isVerifyStage ? "Verificação" : "Aprovação") : "Rejeição"}`}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApprovalCell({
  approval,
  isAdmin,
  isVerificador,
  onRequest,
  onDecide,
}: {
  approval: ApprovalRow | null;
  isAdmin: boolean;
  isVerificador: boolean;
  onRequest: () => void;
  onDecide: (
    stage: "verify" | "approve",
    decision: "verificado" | "rejeitado_verificacao" | "aprovado" | "rejeitado",
  ) => void;
}) {
  if (!approval) {
    return (
      <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={onRequest} title="Enviar para verificação">
        <Send className="h-3 w-3" /> Enviar p/ verificação
      </Button>
    );
  }
  const fmt = (iso?: string | null) =>
    iso
      ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso))
      : "";

  const status = approval.status === "pendente" ? "pendente_verificacao" : approval.status;
  const isFinal = status === "aprovado" || status === "rejeitado" || status === "rejeitado_verificacao";

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

      {isVerificador && status === "pendente_verificacao" && (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px] text-sky-700 border-sky-500/40 hover:bg-sky-500/10" onClick={() => onDecide("verify", "verificado")}>
            <ShieldCheck className="h-3 w-3" /> Verificar
          </Button>
          <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px] text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => onDecide("verify", "rejeitado_verificacao")}>
            <XCircle className="h-3 w-3" /> Rejeitar
          </Button>
        </div>
      )}

      {isAdmin && status === "pendente_aprovacao" && (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px] text-emerald-700 border-emerald-500/40 hover:bg-emerald-500/10" onClick={() => onDecide("approve", "aprovado")}>
            <CheckCircle2 className="h-3 w-3" /> Aprovar
          </Button>
          <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px] text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => onDecide("approve", "rejeitado")}>
            <XCircle className="h-3 w-3" /> Rejeitar
          </Button>
        </div>
      )}

      {isFinal && (
        <Button size="sm" variant="ghost" className="h-6 gap-1 text-[10px]" onClick={onRequest} title="Reenviar para verificação">
          <Send className="h-3 w-3" /> Reenviar
        </Button>
      )}

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
