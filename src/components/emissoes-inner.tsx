import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listEmissoes, type EmissaoRow } from "@/lib/emissoes.functions";
import {
  verifyApproval,
  decideApproval,
  listApprovalComments,
  addApprovalComment,
  type ApprovalCommentRow,
} from "@/lib/approvals.functions";
import { useAuth } from "@/hooks/use-auth";
import { getRevisionPdfBase64 } from "@/lib/driveSync.functions";
import { getLabEnsaioSnapshot, type LabEnsaioSnapshot } from "@/lib/lab-ensaios.functions";
import { EnsaioTag } from "@/features/lab/components/EnsaioTag";
import type { EnsaioTipo } from "@/features/lab/types";
import { MEspAReport, renderMEspAPdfBlob } from "@/features/mesp-natural/report";
import type { DeterminacaoInput } from "@/features/mesp-natural/calc";
import type { Identificacao } from "@/features/mesp-natural/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Inbox,
  ShieldCheck,
  Stamp,
  Clock,
  MessageSquare,
  ExternalLink,
  Eye,
} from "lucide-react";
import { BUSINESS_DAY_MS, businessElapsedMs } from "@/lib/business-days";



type TabKey = "verificacao" | "aprovacao" | "aprovados";

const WORKFLOW_BY_TAB: Record<TabKey, string[]> = {
  verificacao: ["aguardando_verificacao"],
  aprovacao: ["aguardando_aprovacao"],
  aprovados: ["aprovado"],
};

/** SLA alvo (dias úteis) por etapa — usado para pintar a coluna. */
const SLA_TARGET_DAYS = {
  digitacao: 1.5, // digitação → envio p/ verificação (meta: 1,5 dias úteis)
  verifAprov: 1.5, // verificação + aprovação (meta: 1,5 dias úteis)
  total: 3, // término total (digitação → aprovado)
};

function fmtDur(ms: number): string {
  if (!isFinite(ms) || ms < 0) return "—";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin % (60 * 24)) / 60);
  const m = totalMin % 60;
  if (d >= 1) return `${d}d ${h}h`;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

function slaColor(elapsedMs: number, targetDays: number, done: boolean): string {
  const targetMs = targetDays * BUSINESS_DAY_MS;
  const ratio = elapsedMs / targetMs;
  if (done) {
    if (ratio <= 1) return "text-emerald-600 dark:text-emerald-400";
    return "text-amber-600 dark:text-amber-400";
  }
  if (ratio >= 1) return "text-destructive font-medium";
  if (ratio >= 0.75) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

function scopeToEnsaioPath(scopeId: string): {
  to: "/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId";
  params: { osId: string; amostraId: string; ensaioId: string };
} | null {
  // scope_id convencionado como "os/<osId>/amostra/<amostraId>/ensaio/<ensaioId>"
  const parts = scopeId.split("/");
  const iOs = parts.indexOf("os");
  const iAm = parts.indexOf("amostra");
  const iEn = parts.indexOf("ensaio");
  if (iOs === -1 || iAm === -1 || iEn === -1) return null;
  return {
    to: "/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId",
    params: { osId: parts[iOs + 1], amostraId: parts[iAm + 1], ensaioId: parts[iEn + 1] },
  };
}

export function EmissoesInner({
  embedded = false,
  singleTab,
  hideHeader = false,
}: { embedded?: boolean; singleTab?: TabKey; hideHeader?: boolean } = {}) {
  const [tab, setTab] = useState<TabKey>(singleTab ?? "verificacao");
  useEffect(() => {
    if (singleTab) setTab(singleTab);
  }, [singleTab]);
  const { role, profile } = useAuth();
  const isAdmin = role === "admin";
  const isVerificador = isAdmin || profile?.labRole === "verificador";
  const [rows, setRows] = useState<EmissaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [decideOpen, setDecideOpen] = useState<{
    stage: "verify" | "approve";
    decision: "ok" | "reject";
    row: EmissaoRow;
  } | null>(null);
  const [comment, setComment] = useState("");
  const [historyOpen, setHistoryOpen] = useState<EmissaoRow | null>(null);
  const [previewOpen, setPreviewOpen] = useState<EmissaoRow | null>(null);

  const listFn = useServerFn(listEmissoes);
  const verifyFn = useServerFn(verifyApproval);
  const decideFn = useServerFn(decideApproval);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listFn({ data: { workflowStatuses: WORKFLOW_BY_TAB[tab] } });
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [listFn, tab]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const counts = useMemo(() => {
    return { current: rows.length };
  }, [rows]);

  async function submitDecision() {
    if (!decideOpen) return;
    if (decideOpen.decision === "reject" && !comment.trim()) {
      toast.error("Comentário obrigatório para rejeitar.");
      return;
    }
    const { row, stage, decision } = decideOpen;
    if (row.rev === null) {
      toast.error("Esta linha ainda não possui revisão para decidir.");
      return;
    }
    try {
      if (stage === "verify") {
        await verifyFn({
          data: {
            scopeId: row.scope_id,
            rev: row.rev,
            decision: decision === "ok" ? "verificado" : "rejeitado_verificacao",
            comment: comment.trim() || undefined,
          },
        });
      } else {
        await decideFn({
          data: {
            scopeId: row.scope_id,
            rev: row.rev,
            decision: decision === "ok" ? "aprovado" : "rejeitado",
            comment: comment.trim() || undefined,
          },
        });
      }
      toast.success("Registro atualizado.");
      setDecideOpen(null);
      setComment("");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar decisão.");
    }
  }

  const canVerify = isVerificador || isAdmin;
  const canApprove = isAdmin;

  const body = (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
      {!singleTab && (
      <TabsList className="grid grid-cols-3 w-full max-w-xl">
        <TabsTrigger value="verificacao" className="gap-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          Aguardando Verificação
        </TabsTrigger>
        <TabsTrigger value="aprovacao" className="gap-1">
          <Clock className="h-3.5 w-3.5" />
          Aguardando Aprovação
        </TabsTrigger>
        <TabsTrigger value="aprovados" className="gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Aprovados
        </TabsTrigger>
      </TabsList>
      )}

      {(["verificacao", "aprovacao", "aprovados"] as TabKey[]).map((k) => (
              <TabsContent key={k} value={k} className="mt-4">
                {rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Inbox className="h-10 w-10 mb-2 opacity-40" />
                    <p className="text-sm">Nenhum registro nesta aba.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>OS</TableHead>
                          <TableHead>Amostra</TableHead>
                          <TableHead>Ensaio</TableHead>
                          <TableHead>Rev.</TableHead>
                          <TableHead>Solicitado por</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Verificado por</TableHead>
                          <TableHead>Aprovado por</TableHead>
                          <TableHead>SLA</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow key={r.scope_id + ":" + (r.rev ?? "-")}>
                            <TableCell className="text-xs">
                              <div className="font-medium">{r.os_numero ?? "—"}</div>
                              <div className="text-muted-foreground truncate max-w-[160px]">{r.os_cliente ?? ""}</div>
                            </TableCell>
                            <TableCell className="text-xs">{r.amostra_code ?? "—"}</TableCell>
                            <TableCell className="text-xs">
                              <div className="flex items-center gap-1.5">
                                {r.ensaio_tipo ? (
                                  <EnsaioTag tipo={r.ensaio_tipo as EnsaioTipo} />
                                ) : (
                                  <span>—</span>
                                )}
                              </div>
                              <div className="text-muted-foreground truncate max-w-[160px]">{r.ensaio_nome ?? ""}</div>
                            </TableCell>
                            <TableCell className="text-xs">
                              {r.rev === null ? "—" : `rev ${String(r.rev).padStart(2, "0")}`}
                            </TableCell>
                            <TableCell className="text-xs">{r.requested_by_name ?? "—"}</TableCell>
                            <TableCell className="text-xs">{fmtDate(r.requested_at ?? r.updated_at)}</TableCell>
                            <TableCell className="text-xs">
                              {r.verified_by_name ? (
                                <div>
                                  <div>{r.verified_by_name}</div>
                                  <div className="text-muted-foreground">{fmtDate(r.verified_at)}</div>
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {r.decided_by_name ? (
                                <div>
                                  <div>{r.decided_by_name}</div>
                                  <div className="text-muted-foreground">{fmtDate(r.decided_at)}</div>
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              <SlaCell row={r} />
                            </TableCell>
                            <TableCell><StatusBadge status={r.workflow_status} /></TableCell>
                            <TableCell className="text-right">
                              <RowActions
                                row={r}
                                canVerify={canVerify}
                                canApprove={canApprove}
                                onAction={(stage, decision) => {
                                  setDecideOpen({ stage, decision, row: r });
                                  setComment("");
                                }}
                                onHistory={() => setHistoryOpen(r)}
                                onPreview={() => setPreviewOpen(r)}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground mt-2">
                  {counts.current} registro(s).
                </div>
              </TabsContent>
      ))}
    </Tabs>
  );

  const header = (
    <div className="flex flex-row items-center justify-between gap-2">
      <div>
        <div className="flex items-center gap-2 font-semibold">
          <Stamp className="h-5 w-5 text-primary" />
          Central de Emissões
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Fluxo: Verificação → Aprovação. SLA alvo: digitação {SLA_TARGET_DAYS.digitacao}d · verif+aprov {SLA_TARGET_DAYS.verifAprov}d · total {SLA_TARGET_DAYS.total}d.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
        <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
        Atualizar
      </Button>
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-4">
        {!hideHeader && header}
        {body}
        <DecideDialogs
          decideOpen={decideOpen}
          setDecideOpen={setDecideOpen}
          comment={comment}
          setComment={setComment}
          submitDecision={submitDecision}
          historyOpen={historyOpen}
          setHistoryOpen={setHistoryOpen}
          previewOpen={previewOpen}
          setPreviewOpen={setPreviewOpen}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Card>
        <CardHeader className="space-y-0">{header}</CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
      <DecideDialogs
        decideOpen={decideOpen}
        setDecideOpen={setDecideOpen}
        comment={comment}
        setComment={setComment}
        submitDecision={submitDecision}
        historyOpen={historyOpen}
        setHistoryOpen={setHistoryOpen}
        previewOpen={previewOpen}
        setPreviewOpen={setPreviewOpen}
      />
    </div>
  );
}

function DecideDialogs({
  decideOpen,
  setDecideOpen,
  comment,
  setComment,
  submitDecision,
  historyOpen,
  setHistoryOpen,
  previewOpen,
  setPreviewOpen,
}: {
  decideOpen: { stage: "verify" | "approve"; decision: "ok" | "reject"; row: EmissaoRow } | null;
  setDecideOpen: (v: { stage: "verify" | "approve"; decision: "ok" | "reject"; row: EmissaoRow } | null) => void;
  comment: string;
  setComment: (v: string) => void;
  submitDecision: () => Promise<void>;
  historyOpen: EmissaoRow | null;
  setHistoryOpen: (v: EmissaoRow | null) => void;
  previewOpen: EmissaoRow | null;
  setPreviewOpen: (v: EmissaoRow | null) => void;
}) {
  return (
    <>
      <Dialog open={!!decideOpen} onOpenChange={(o) => !o && setDecideOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decideOpen?.stage === "verify"
                ? decideOpen.decision === "ok"
                  ? "Confirmar verificação"
                  : "Rejeitar verificação"
                : decideOpen?.decision === "ok"
                  ? "Aprovar relatório"
                  : "Rejeitar aprovação"}
            </DialogTitle>
            <DialogDescription>
              {decideOpen?.stage === "verify"
                ? "Ao verificar, o relatório segue para aprovação do Responsável Técnico."
                : decideOpen?.decision === "ok"
                  ? "Aprovação técnica final — a revisão é publicada e o PDF fica disponível na aba Versões do ensaio."
                  : "A rejeição devolve o ensaio para a verificação com o comentário registrado."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              Comentário {decideOpen?.decision === "reject" ? "(obrigatório)" : "(opcional)"}
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              placeholder="Observações…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecideOpen(null)}>
              Cancelar
            </Button>
            <Button
              onClick={submitDecision}
              variant={decideOpen?.decision === "reject" ? "destructive" : "default"}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HistoryDialog row={historyOpen} onClose={() => setHistoryOpen(null)} />
      <PreviewDialog row={previewOpen} onClose={() => setPreviewOpen(null)} />
    </>
  );
}

function SlaCell({ row }: { row: EmissaoRow }) {
  const nowIso = new Date().toISOString();
  const decided = row.decided_at ? new Date(row.decided_at).getTime() : null;
  const isApproved = row.workflow_status === "aprovado";

  const digitacaoStart = row.pendencia_started_at ?? row.pendencia_created_at;
  const digitacaoEnd = row.pendencia_finished_at ?? row.requested_at ?? (row.workflow_status === "digitacao" ? nowIso : null);
  const digitacaoDone = !!row.requested_at;
  const digitacaoMs = businessElapsedMs(digitacaoStart, digitacaoEnd);

  const verifAprovStart = row.requested_at;
  const verifAprovEnd = row.decided_at ?? (isApproved ? row.decided_at : nowIso);
  const verifAprovMs = businessElapsedMs(verifAprovStart, verifAprovEnd);
  const verifAprovDone = !!decided;

  const totalStart = digitacaoStart ?? row.requested_at;
  const totalEnd = row.decided_at ?? nowIso;
  const totalMs = businessElapsedMs(totalStart, totalEnd);
  const totalDone = !!decided;

  return (
    <div className="flex flex-col gap-0.5 whitespace-nowrap">
      <div className="flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-14">Digit.</span>
        <span className={slaColor(digitacaoMs, SLA_TARGET_DAYS.digitacao, digitacaoDone)}>
          {fmtDur(digitacaoMs)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-14">Ver+Apr</span>
        <span className={slaColor(verifAprovMs, SLA_TARGET_DAYS.verifAprov, verifAprovDone)}>
          {fmtDur(verifAprovMs)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-14">Total</span>
        <span className={slaColor(totalMs, SLA_TARGET_DAYS.total, totalDone)}>
          {fmtDur(totalMs)}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    digitacao: { label: "Em digitação", cls: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30" },
    aguardando_verificacao: { label: "Aguardando verificação", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
    aguardando_aprovacao: { label: "Aguardando aprovação", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
    pendente_verificacao: { label: "Aguardando verificação", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
    pendente_aprovacao: { label: "Aguardando aprovação", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
    aprovado: { label: "Aprovado", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
    rejeitado_verificacao: { label: "Rejeitado (verificação)", cls: "bg-destructive/15 text-destructive border-destructive/30" },
    rejeitado: { label: "Rejeitado", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const s = map[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={`text-[10px] ${s.cls}`}>{s.label}</Badge>;
}

function RowActions({
  row,
  canVerify,
  canApprove,
  onAction,
  onHistory,
  onPreview,
}: {
  row: EmissaoRow;
  canVerify: boolean;
  canApprove: boolean;
  onAction: (stage: "verify" | "approve", decision: "ok" | "reject") => void;
  onHistory: () => void;
  onPreview: () => void;
}) {
  const path = scopeToEnsaioPath(row.scope_id);
  const openBtn = path ? (
    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
      <Link to={path.to} params={path.params}>
        <ExternalLink className="h-3 w-3" /> Ir para ensaio
      </Link>
    </Button>
  ) : null;
  const previewBtn = row.rev !== null ? (
    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onPreview}>
      <Eye className="h-3 w-3" /> Ver prévia
    </Button>
  ) : null;
  const historyBtn = (
    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onHistory}>
      <MessageSquare className="h-3 w-3" /> Histórico
    </Button>
  );

  const decideBtns =
    row.workflow_status === "aguardando_verificacao" && canVerify ? (
      <>
        <Button size="sm" className="h-7 text-xs" onClick={() => onAction("verify", "ok")}>
          Verificar
        </Button>
        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => onAction("verify", "reject")}>
          Rejeitar
        </Button>
      </>
    ) : row.workflow_status === "aguardando_aprovacao" && canApprove ? (
      <>
        <Button size="sm" className="h-7 text-xs" onClick={() => onAction("approve", "ok")}>
          Aprovar
        </Button>
        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => onAction("approve", "reject")}>
          Rejeitar
        </Button>
      </>
    ) : null;

  return (
    <div className="flex flex-wrap gap-1 justify-end">
      {openBtn}
      {previewBtn}
      {historyBtn}
      {decideBtns}
    </div>
  );
}

type MespPreviewData = {
  ident: Identificacao;
  dets: DeterminacaoInput[];
  obs: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toMespDeterminations(value: unknown): DeterminacaoInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const d = asRecord(item);
    return {
      id: asText(d.id) || `det-${index + 1}`,
      capsula: asText(d.capsula),
      massaCapsula: asNumberOrNull(d.massaCapsula),
      massaCapsulaSoloUmido: asNumberOrNull(d.massaCapsulaSoloUmido),
      massaCapsulaSoloSeco: asNumberOrNull(d.massaCapsulaSoloSeco),
      massaCp: asNumberOrNull(d.massaCp),
      massaCpParafina: asNumberOrNull(d.massaCpParafina),
      massaCpParafinaSubmerso: asNumberOrNull(d.massaCpParafinaSubmerso),
    };
  });
}

function mespPreviewFromSnapshot(snapshot: LabEnsaioSnapshot | null): MespPreviewData | null {
  if (!snapshot || snapshot.ensaio.tipo !== "mesp-a") return null;
  const payload = asRecord(snapshot.ensaio.payload);
  const payloadIdent = asRecord(payload.ident);
  const dets = toMespDeterminations(payload.dets);
  if (dets.length === 0) return null;
  const ident: Identificacao = {
    os: asText(payloadIdent.os) || snapshot.os.numero,
    amostraCodigo: asText(payloadIdent.amostraCodigo) || snapshot.amostra.reportNumber || snapshot.amostra.code || "",
    amostraDescricao: asText(payloadIdent.amostraDescricao) || snapshot.amostra.description || "",
    tomador: asText(payloadIdent.tomador) || snapshot.os.client || "",
    obra: asText(payloadIdent.obra) || snapshot.os.local || snapshot.os.workNumber || "",
    tipoEnsaioNome: asText(payloadIdent.tipoEnsaioNome) || snapshot.ensaio.label || "Massa Específica Aparente Natural",
    tipoEnsaioCodigo: asText(payloadIdent.tipoEnsaioCodigo) || "M.ESP.A",
    furo: asText(payloadIdent.furo) || snapshot.amostra.borehole || undefined,
    profundidade: asText(payloadIdent.profundidade) || snapshot.amostra.depth || undefined,
  };
  return { ident, dets, obs: asText(payload.obs) };
}

function PreviewDialog({ row, onClose }: { row: EmissaoRow | null; onClose: () => void }) {
  const fetchFn = useServerFn(getRevisionPdfBase64);
  const snapshotFn = useServerFn(getLabEnsaioSnapshot);
  const renderRef = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackData, setFallbackData] = useState<MespPreviewData | null>(null);

  useEffect(() => {
    if (!row) {
      if (url) URL.revokeObjectURL(url);
      setUrl(null);
      setError(null);
      setFallbackData(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setFallbackData(null);
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const r = await fetchFn({
          data: { scopeId: row.scope_id, rev: row.rev ?? undefined },
        });
        if (cancelled) return;
        const bin = atob(r.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const arrayBuffer = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(arrayBuffer).set(bytes);
        const blob = new Blob([arrayBuffer], { type: "application/pdf" });
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (e) {
        if (cancelled) return;
        const tipo = (row.ensaio_tipo || "").toLowerCase();
        if (tipo === "mesp-a" || tipo === "m.esp.a") {
          try {
            const snapshot = await snapshotFn({ data: { scopeId: row.scope_id } });
            const fallback = mespPreviewFromSnapshot(snapshot as LabEnsaioSnapshot | null);
            if (fallback) {
              setFallbackData(fallback);
              return;
            }
          } catch {
            // Mantém a mensagem original abaixo.
          }
        }
        setError(e instanceof Error ? e.message : "Falha ao carregar prévia");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row]);

  useEffect(() => {
    if (!fallbackData || !row) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    void (async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const element = renderRef.current;
      if (!element) throw new Error("Falha ao renderizar a prévia do M.ESP.A.");
      const blob = await renderMEspAPdfBlob(element);
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })()
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Falha ao reconstruir a prévia do M.ESP.A.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fallbackData, row]);

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 py-2 border-b">
          <DialogTitle className="text-sm">
            Prévia — {row?.ensaio_tipo} · {row?.amostra_code} · OS {row?.os_numero}
            {row?.rev !== null && row?.rev !== undefined && (
              <span className="text-muted-foreground font-normal ml-2">
                Rev {String(row.rev).padStart(2, "0")}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted/30">
          {loading && (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Carregando prévia do PDF…
            </div>
          )}
          {error && (
            <div className="h-full flex items-center justify-center text-sm text-destructive px-6 text-center">
              {error}
            </div>
          )}
          {url && !loading && !error && (
            <iframe src={url} title="Prévia do relatório" className="w-full h-full border-0" />
          )}
        </div>
        {fallbackData && (
          <div className="fixed -left-[10000px] top-0 bg-white" aria-hidden="true">
            <div ref={renderRef}>
              <MEspAReport ident={fallbackData.ident} dets={fallbackData.dets} obs={fallbackData.obs} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ row, onClose }: { row: EmissaoRow | null; onClose: () => void }) {
  const listFn = useServerFn(listApprovalComments);
  const addFn = useServerFn(addApprovalComment);
  const [items, setItems] = useState<ApprovalCommentRow[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!row) return;
    try {
      const data = await listFn({ data: { scopeId: row.scope_id } });
      setItems(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar histórico");
    }
  }, [row, listFn]);

  useEffect(() => {
    if (row) void reload();
    else setItems([]);
  }, [row, reload]);

  const actionLabel: Record<string, string> = {
    send_verification: "enviou para verificação",
    verified: "verificou",
    rejected_verification: "rejeitou na verificação",
    approved: "aprovou",
    rejected: "rejeitou (devolveu p/ verificação)",
    comment: "comentou",
    reopened: "reabriu para edição",
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico de verificações e comentários</DialogTitle>
          <DialogDescription className="text-xs">
            {row?.ensaio_tipo} · {row?.amostra_code} · OS {row?.os_numero}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
          {items.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">Sem eventos registrados.</div>
          ) : (
            items.map((it) => (
              <div key={it.id} className="rounded border border-border p-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {it.author_name ?? "—"}{" "}
                    <span className="text-muted-foreground font-normal">
                      · {it.author_role ?? "usuário"} · {actionLabel[it.action] ?? it.action}
                    </span>
                    {typeof it.rev === "number" && (
                      <span className="text-muted-foreground font-normal"> · Rev {String(it.rev).padStart(2, "0")}</span>
                    )}
                  </div>
                  <div className="text-muted-foreground">{fmtDate(it.created_at)}</div>
                </div>
                {it.comment && <div className="mt-1 whitespace-pre-wrap">{it.comment}</div>}
              </div>
            ))
          )}
        </div>
        <div className="space-y-2 border-t pt-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Adicionar comentário…"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={busy || !text.trim() || !row || row.rev === null}
              onClick={async () => {
                if (!row || row.rev === null) return;
                setBusy(true);
                try {
                  await addFn({ data: { scopeId: row.scope_id, rev: row.rev, comment: text.trim() } });
                  setText("");
                  await reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao comentar");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Enviar comentário
            </Button>
          </div>
          {row?.rev === null && (
            <div className="text-[11px] text-muted-foreground">
              Comentários são anexados a uma revisão — envie para verificação primeiro.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
