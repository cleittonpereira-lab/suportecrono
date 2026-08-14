import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  Camera,
  StopCircle,
  AlertTriangle,
  RefreshCw,
  FlaskConical,
  Plus,
  Trash2,
  Save,
  ClipboardList,
  CheckCircle2,
  ImageUp,
  FileText,
  Zap,
  ZapOff,
  ArrowLeft,
} from "lucide-react";
import { listRows } from "@/lib/programacao.functions";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { useSchedule } from "@/hooks/use-schedule";
import {
  listPendenciasDigitacao,
  atualizarPendenciaDigitacao,
  criarPendenciaDigitacao,
  type PendenciaDigitacao,
} from "@/lib/lab-pendencias.functions";
import { useServerFn } from "@tanstack/react-start";
import {
  calcDeterminacao,
  isMespANaturalTag,
  isAdensamentoTag,
  mediaValidas,
  RHO_PARAFINA,
  type DeterminacaoInput,
} from "@/features/mesp-natural/calc";
import { MEspAReport, generateMEspAPdf, renderMEspAPdfBlob } from "@/features/mesp-natural/report";
import { mirrorMEspAToLabStore } from "@/features/mesp-natural/lab-mirror";
import { nextRev, saveVersion } from "@/features/triaxial-cid/report-versions";
import { requestApproval } from "@/lib/approvals.functions";
import { mespIndexMetadata, syncMEspARevision } from "@/features/mesp-natural/drive-sync";

const SHEET_AMOSTRAS = "Amostras";
const SHEET_TIPOS = "Tipos de Ensaio";

type QrPayload = {
  amostra_sigla?: string;
  contrato_nome?: string;
  servico_nome?: string;
  ensaio_tag_nome?: string;
  ensaio_tag_descricao?: string;
  furo_nome?: string;
  furo_numero?: string | number;
  furo?: string;
  sondagem_nome?: string;
  sondagem?: string;
  profundidade?: string | number;
  profundidade_inicial?: string | number;
  profundidade_final?: string | number;
  prof_ini?: string | number;
  prof_fim?: string | number;
  [k: string]: unknown;
};

export type Identificacao = {
  os: string;
  amostraCodigo: string;
  amostraDescricao: string;
  tomador: string;
  obra: string;
  tipoEnsaioNome: string;
  tipoEnsaioCodigo: string;
  furo?: string;
  profundidade?: string;
};

function norm(s: string | null | undefined) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, "");
}

function parseQrPayload(text: string): QrPayload | null {
  const raw = (text || "").trim();
  if (!raw) return null;
  const attempts: string[] = [raw];
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded !== raw) attempts.push(decoded);
  } catch { /* ignora */ }
  try {
    const url = new URL(raw);
    for (const key of ["payload", "data", "qr", "q"]) {
      const value = url.searchParams.get(key);
      if (value) attempts.push(value);
    }
  } catch { /* não é URL */ }
  const objectStart = raw.indexOf("{");
  const objectEnd = raw.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) attempts.push(raw.slice(objectStart, objectEnd + 1));

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as QrPayload;
      if (parsed && typeof parsed === "object") return parsed;
    } catch { /* tenta o próximo formato */ }
  }
  return null;
}

/** Extrai o Furo/Sondagem do payload do QR, tolerando várias chaves. */
function extractFuro(p: QrPayload): string {
  const raw =
    p.furo_nome ?? p.furo ?? p.sondagem_nome ?? p.sondagem ?? p.furo_numero ?? "";
  return String(raw ?? "").trim();
}

/** Extrai a profundidade do payload do QR (ex.: "6,00 – 6,50"). */
function extractProfundidade(p: QrPayload): string {
  const single = p.profundidade;
  if (single != null && String(single).trim() !== "") return String(single).trim();
  const ini = p.profundidade_inicial ?? p.prof_ini;
  const fim = p.profundidade_final ?? p.prof_fim;
  if (ini != null && fim != null) return `${String(ini).trim()} – ${String(fim).trim()}`;
  if (ini != null) return String(ini).trim();
  if (fim != null) return String(fim).trim();
  return "";
}

function newDet(): DeterminacaoInput {
  return {
    id: `d_${Math.random().toString(36).slice(2, 9)}`,
    capsula: "",
    massaCapsula: null,
    massaCapsulaSoloUmido: null,
    massaCapsulaSoloSeco: null,
    massaCp: null,
    massaCpParafina: null,
    massaCpParafinaSubmerso: null,
  };
}

function fmt(n: number | null, dec = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ---------- rascunho local ----------
function draftKey(ident: Identificacao) {
  return `mesp-a://${ident.os}/${ident.amostraCodigo}`;
}
function persistLocal(ident: Identificacao, dets: DeterminacaoInput[], obs: string) {
  try {
    const payload = { ident, dets, obs, savedAt: new Date().toISOString() };
    window.localStorage.setItem(draftKey(ident), JSON.stringify(payload));
  } catch { /* ignora quota */ }
}
function loadLocal(ident: Identificacao): { dets: DeterminacaoInput[]; obs: string } | null {
  try {
    const raw = window.localStorage.getItem(draftKey(ident));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p?.dets) return null;
    return { dets: p.dets, obs: p.obs ?? "" };
  } catch { return null; }
}

const DET_SYNC_FIELDS: (keyof DeterminacaoInput)[] = [
  "capsula",
  "massaCapsula",
  "massaCapsulaSoloUmido",
  "massaCapsulaSoloSeco",
  "massaCp",
  "massaCpParafina",
  "massaCpParafinaSubmerso",
];

function hasDetValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function detHasAnyData(det: DeterminacaoInput | undefined): boolean {
  if (!det) return false;
  return DET_SYNC_FIELDS.some((field) => hasDetValue(det[field]));
}

function mergeDeterminations(
  current: DeterminacaoInput[],
  incoming: DeterminacaoInput[],
  options: { incomingWins?: boolean } = {},
): DeterminacaoInput[] {
  const usedIncoming = new Set<number>();
  const next = current.length ? current.map((det) => ({ ...det })) : [];
  const findIncomingIndex = (local: DeterminacaoInput, localIndex: number) => {
    const localCapsula = norm(local.capsula);
    if (localCapsula) {
      const byCapsula = incoming.findIndex(
        (candidate, idx) => !usedIncoming.has(idx) && norm(candidate.capsula) === localCapsula,
      );
      if (byCapsula >= 0) return byCapsula;
    }
    return !usedIncoming.has(localIndex) && incoming[localIndex] ? localIndex : -1;
  };

  next.forEach((local, localIndex) => {
    const incomingIndex = findIncomingIndex(local, localIndex);
    if (incomingIndex < 0) return;
    usedIncoming.add(incomingIndex);
    const source = incoming[incomingIndex];
    for (const field of DET_SYNC_FIELDS) {
      const sourceValue = source[field];
      if (!hasDetValue(sourceValue)) continue;
      const localValue = local[field];
      if (options.incomingWins || !hasDetValue(localValue)) {
        (local as Record<string, unknown>)[field] = sourceValue;
      }
    }
  });

  incoming.forEach((source, index) => {
    if (usedIncoming.has(index) || !detHasAnyData(source)) return;
    next.push({ ...newDet(), ...source, id: source.id || `d_${Math.random().toString(36).slice(2, 9)}` });
  });

  return next.length ? next : [newDet()];
}

function sameDeterminations(a: DeterminacaoInput[], b: DeterminacaoInput[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((det, index) => {
    const other = b[index];
    if (!other) return false;
    return DET_SYNC_FIELDS.every((field) => det[field] === other[field]);
  });
}

/**
 * Workspace comum: renderiza um "source" (scanner ou pendências) e, uma vez
 * identificada a amostra, mostra o formulário M.ESP.A. Usado pelas duas
 * sub-rotas da Digitalização (QR e Pendências).
 */
export function MEspAWorkspace({
  source,
  emptySource,
  initialData,
}: {
  source: (onIdentified: (id: Identificacao, pendenciaId: string | null) => void) => React.ReactNode;
  emptySource?: React.ReactNode;
  initialData?: { dets: DeterminacaoInput[]; obs: string } | null;
}) {
  const [ident, setIdent] = useState<Identificacao | null>(null);
  const [dets, setDets] = useState<DeterminacaoInput[]>([newDet()]);
  const [obs, setObs] = useState("");
  const [pendenciaId, setPendenciaId] = useState<string | null>(null);
  const atualizarFn = useServerFn(atualizarPendenciaDigitacao);
  const criarFn = useServerFn(criarPendenciaDigitacao);
  const listPendFn = useServerFn(listPendenciasDigitacao);
  const requestApprovalFn = useServerFn(requestApproval);
  const navigate = useNavigate();

  const { data: pendenciasParaHidratar = [] } = useQuery({
    queryKey: ["mesp-a-workspace-pendencia", pendenciaId],
    enabled: Boolean(pendenciaId),
    queryFn: () => listPendFn(),
    staleTime: 5_000,
  });

  // Hidrata a partir do payload da pendência (fluxo do relatório).
  useEffect(() => {
    if (initialData && initialData.dets?.length) {
      setDets((cur) => {
        const merged = mergeDeterminations(cur, initialData.dets, { incomingWins: true });
        return sameDeterminations(cur, merged) ? cur : merged;
      });
      setObs(initialData.obs ?? "");
    }
  }, [initialData]);

  useEffect(() => {
    if (!pendenciaId) return;
    const pendencia = (pendenciasParaHidratar as PendenciaDigitacao[]).find((p) => p.id === pendenciaId);
    const payload = pendencia?.payload as { dets?: DeterminacaoInput[]; obs?: string } | null | undefined;
    if (!payload || !Array.isArray(payload.dets) || payload.dets.length === 0) return;
    const payloadDets = payload.dets;
    setDets((cur) => {
      const merged = mergeDeterminations(cur, payloadDets, { incomingWins: true });
      return sameDeterminations(cur, merged) ? cur : merged;
    });
    if (payload.obs !== undefined) setObs(payload.obs ?? "");
  }, [pendenciaId, pendenciasParaHidratar]);

  function reset() {
    setIdent(null);
    setDets([newDet()]);
    setObs("");
    setPendenciaId(null);
  }

  if (!ident) {
    return (
      <>
        {source((id, pid) => {
          setIdent(id);
          setPendenciaId(pid);
        })}
        {emptySource}
      </>
    );
  }

  return (
    <FormMEspA
      ident={ident}
      dets={dets}
      setDets={setDets}
      obs={obs}
      setObs={setObs}
      onBack={reset}
      onSaveDraft={async () => {
        persistLocal(ident, dets, obs);
        const payload = { ident, dets, obs } as unknown as Record<string, unknown>;
        let pid = pendenciaId;
        // Se ainda não existe pendência (digitalizador saindo antes de
        // finalizar), cria uma agora em "em_digitacao" para nada se perder.
        if (!pid) {
          try {
            const r = await criarFn({
              data: {
                os: ident.os,
                amostra: ident.amostraCodigo || null,
                ensaio: "Massa Específica Aparente Natural",
                tipo_ensaio: "M.ESP.A",
                equipamento: null,
                origem: "digitalizacao",
                payload,
              },
            });
            pid = r.id;
            setPendenciaId(r.id);
          } catch (e: unknown) {
            toast.error(
              "Rascunho salvo só no dispositivo — falha ao gravar no servidor: " +
                (e instanceof Error ? e.message : String(e)),
            );
            return;
          }
        }
        if (pid) {
          try {
            await atualizarFn({
              data: { id: pid, status: "em_digitacao", payload },
            });
          } catch { /* silencia */ }
        }
        toast.success("Rascunho salvo");
      }}
      onFinalize={async (buildPdfBlob) => {
        persistLocal(ident, dets, obs);
        // Espelha no labStore para aparecer em "OS / Amostras" e em M.ESP.A Natural,
        // e obter osId/amId/enId para montar o scopeId usado pela fila de Verificação.
        let mirror: { osId: string; amId: string; enId: string } | null = null;
        try { mirror = mirrorMEspAToLabStore(ident, { dets, obs }, "concluido"); } catch { /* silencia */ }
        let pid = pendenciaId;
        const payload = { ident, dets, obs } as unknown as Record<string, unknown>;
        // Se a pendência já existe (fluxo do relatório: "Iniciar digitação"
        // vindo da hub), avançar para "digitado" para que apareça na
        // verificação. Caso contrário (QR direto), criar como "pendente"
        // para aparecer em "Enviados p/ digitação".
        const nextStatus: "pendente" | "digitado" = pid ? "digitado" : "pendente";
        if (!pid) {
          try {
            const r = await criarFn({
              data: {
                os: ident.os,
                amostra: ident.amostraCodigo || null,
                ensaio: "Massa Específica Aparente Natural",
                tipo_ensaio: "M.ESP.A",
                equipamento: null,
                origem: "digitalizacao",
                payload,
              },
            });
            pid = r.id;
            setPendenciaId(r.id);
          } catch (e: unknown) {
            toast.error(
              "Falha ao enviar para digitação: " +
                (e instanceof Error ? e.message : String(e)) +
                ". Os dados continuam nesta tela — tente novamente.",
            );
            return; // NÃO resetar — mantém o formulário para o usuário reenviar
          }
        }
        if (!pid) {
          toast.error("Não foi possível registrar o envio. Tente novamente.");
          return;
        }
        try {
          // Se está sendo enviado para Verificação, também gera o PDF,
          // salva como versão local (IndexedDB) e cria o registro em
          // `lab_report_approvals` — mesmo padrão do Triaxial CID.
          if (nextStatus === "digitado") {
            if (!mirror) {
              toast.error("Não foi possível preparar o ensaio para Verificação. Tente finalizar novamente.");
              return;
            }
            try {
              const blob = await buildPdfBlob();
              const scopeId = `os/${mirror.osId}/amostra/${mirror.amId}/ensaio/${mirror.enId}`;
              const rev = await nextRev(scopeId);
              const base = `${ident.os || "OS"}_${ident.amostraCodigo || "amostra"}`.replace(/[^\w.-]+/g, "-");
              const filename = `M-ESP-A_${base}_Rev-${String(rev).padStart(2, "0")}.pdf`;
              await saveVersion({ scopeId, rev, filename, size: blob.size, pdfBlob: blob });
              try {
                await syncMEspARevision({ scopeId, rev, filename, pdfBlob: blob, ident, dets, obs });
              } catch (e: unknown) {
                toast.warning(
                  "Relatório enviado para Verificação, mas a prévia no Drive pode demorar/estar indisponível: " +
                    (e instanceof Error ? e.message : String(e)),
                );
              }
              await requestApprovalFn({ data: { scopeId, rev, filename, index: mespIndexMetadata(ident) } });
            } catch (e: unknown) {
              toast.error(
                "Digitação salva, mas falhou ao enviar para Verificação: " +
                  (e instanceof Error ? e.message : String(e)),
              );
              return;
            }
          }
          await atualizarFn({
            data: { id: pid, status: nextStatus, observacao: obs || null, payload },
          });
          toast.success(
            nextStatus === "digitado"
              ? "Digitação concluída — enviada para Verificação"
              : "Enviado para Digitação & Emissões",
          );
          reset();
          // Vai direto para a hub, aba certa por status.
          navigate({
            to: "/relatorio/pendentes",
            search: { tab: nextStatus === "digitado" ? "verificacao" : "enviados" },
          });
        } catch (e: unknown) {
          toast.error(
            "Pendência criada, mas falhou ao gravar os dados: " +
              (e instanceof Error ? e.message : String(e)),
          );
        }
      }}
    />
  );
}

// =====================================================================
// Scanner
// =====================================================================
export function ScannerCard({ onIdentified }: { onIdentified: (id: Identificacao, pendenciaId: string | null) => void }) {
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [notFoundMsg, setNotFoundMsg] = useState<string | null>(null);
  const [inIframe, setInIframe] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [engine, setEngine] = useState<"native" | "html5qr" | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [confirmState, setConfirmState] = useState<
    | null
    | { kind: "new"; ident: Identificacao }
    | { kind: "existing"; ident: Identificacao; pendencia: PendenciaDigitacao }
  >(null);
  const autoCloseRef = useRef<number | null>(null);
  const { displayName } = useAuth();
  const listPendFn = useServerFn(listPendenciasDigitacao);
  const { data: pendenciasAll = [] } = useQuery({
    queryKey: ["lab_pendencias_scan_check"],
    queryFn: () => listPendFn(),
    staleTime: 30_000,
  });
  const containerId = "digitalizacao-qr";
  const scannerRef = useRef<{ isScanning?: boolean; stop: () => Promise<void>; clear: () => Promise<void> } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const criarPendenciaFn = useServerFn(criarPendenciaDigitacao);
  const navigate = useNavigate();
  const decodedLockRef = useRef(false);
  const nativeVideoRef = useRef<HTMLVideoElement | null>(null);
  const nativeStreamRef = useRef<MediaStream | null>(null);
  const nativeTrackRef = useRef<MediaStreamTrack | null>(null);
  const nativeRafRef = useRef<number | null>(null);

  const { data: amostras = [] } = useQuery({
    queryKey: ["digit_amostras"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_AMOSTRAS } })).map((r) => ({
        id: r.id,
        os_numero: r.os_numero ?? "",
        codigo_amostra: r.codigo_amostra || "",
        descricao: r.descricao || "",
        tomador: r.tomador || "",
        obra: r.obra || "",
      })),
  });
  const { data: tipos = [] } = useQuery({
    queryKey: ["digit_tipos"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_TIPOS } })).map((r) => ({
        id: r.id,
        nome: r.nome ?? "",
        codigo: r.codigo || "",
      })),
  });
  const { lookup: lookupCadastro } = useCadastroByOs();
  const { data: scheduleData } = useSchedule();

  useEffect(() => {
    return () => { void stopScanner(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (autoCloseRef.current != null) window.clearTimeout(autoCloseRef.current);
    };
  }, []);

  useEffect(() => {
    try { setInIframe(window.self !== window.top); } catch { setInIframe(true); }
  }, []);

  async function stopScanner() {
    // Native path teardown
    if (nativeRafRef.current != null) {
      cancelAnimationFrame(nativeRafRef.current);
      nativeRafRef.current = null;
    }
    if (nativeStreamRef.current) {
      try { nativeStreamRef.current.getTracks().forEach((t) => t.stop()); } catch { /* ignora */ }
      nativeStreamRef.current = null;
      nativeTrackRef.current = null;
    }
    if (nativeVideoRef.current) {
      try { nativeVideoRef.current.srcObject = null; } catch { /* ignora */ }
    }
    const s = scannerRef.current;
    if (s) {
      try { if (s.isScanning) await s.stop(); await s.clear(); } catch { /* ignora */ }
      scannerRef.current = null;
    }
    setScanning(false);
    setStartingCamera(false);
    setTorchOn(false);
    setTorchSupported(false);
    setEngine(null);
  }

  async function startScanner() {
    if (startingCamera || scanning) return;
    setStartingCamera(true);
    setScanError(null);
    setNotFoundMsg(null);
    decodedLockRef.current = false;
    // Pré-checagens que dão mensagens mais úteis do que "NotAllowedError"
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setScanError("A câmera exige HTTPS. Abra o app em um endereço https:// e tente novamente.");
      setStartingCamera(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError("Este navegador não expõe câmera (getUserMedia indisponível). Use Chrome/Safari atualizado.");
      setStartingCamera(false);
      return;
    }
    setScanning(true);
    // 1) Caminho preferencial: BarcodeDetector nativa (Chrome/Edge/Android/iOS 17+)
    //    Muito mais fluido que html5-qrcode — usa GPU/aceleração do navegador.
    const BD = (window as unknown as { BarcodeDetector?: {
      new (opts?: { formats?: string[] }): { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
      getSupportedFormats?: () => Promise<string[]>;
    } }).BarcodeDetector;
    if (BD) {
      try {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
        const video = nativeVideoRef.current;
        if (!video) throw new Error("Área da câmera ainda não foi montada.");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        nativeStreamRef.current = stream;
        const track = stream.getVideoTracks()[0] ?? null;
        nativeTrackRef.current = track;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play().catch(() => { /* alguns browsers exigem gesto — o clique já é um */ });
        // Detecta suporte a lanterna (torch)
        try {
          const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
          if (caps.torch) setTorchSupported(true);
        } catch { /* ignora */ }
        const detector = new BD({ formats: ["qr_code"] });
        const tick = async () => {
          if (!nativeStreamRef.current || decodedLockRef.current) return;
          if (video.readyState >= 2) {
            try {
              const found = await detector.detect(video);
              if (found && found.length > 0 && found[0].rawValue) {
                handleDecoded(found[0].rawValue);
                return;
              }
            } catch { /* frame ocasionalmente falha — segue */ }
          }
          nativeRafRef.current = requestAnimationFrame(tick);
        };
        nativeRafRef.current = requestAnimationFrame(tick);
        setEngine("native");
        setStartingCamera(false);
        return;
      } catch (e) {
        // Fallback silencioso para html5-qrcode
        try {
          if (nativeStreamRef.current) {
            nativeStreamRef.current.getTracks().forEach((t) => t.stop());
            nativeStreamRef.current = null;
          }
        } catch { /* ignora */ }
        console.warn("[QR] BarcodeDetector falhou, caindo para html5-qrcode:", e);
      }
    }
    try {
      // O html5-qrcode exige que o elemento exista no DOM ANTES de criar a
      // instância. Como o container só aparece quando `scanning=true`, precisamos
      // aguardar o React renderizar; sem isso o app mostra exatamente:
      // "HTML Element with id=digitalizacao-qr not found".
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
      if (!document.getElementById(containerId)) {
        throw new Error("Área da câmera ainda não foi montada. Toque novamente em Ler QR Code.");
      }
      const mod = await import("html5-qrcode");
      await new Promise((r) => setTimeout(r, 30));
      const scanner = new mod.Html5Qrcode(containerId);
      scannerRef.current = scanner as unknown as typeof scannerRef.current;
      const readerConfig = {
        fps: 24,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.max(240, Math.min(360, Math.floor(minEdge * 0.82)));
          return { width: size, height: size };
        },
        aspectRatio: 1.0,
        disableFlip: true,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      };
      // Opção principal: câmera dinâmica. O navegador escolhe a câmera traseira
      // disponível sem exigir que o usuário selecione deviceId manualmente.
      const configs: unknown[] = [
        { facingMode: { exact: "environment" } },
        { facingMode: "environment" },
        { facingMode: { ideal: "environment" } },
        true,
      ];
      // Se a câmera dinâmica falhar, aí sim tentamos uma câmera física conhecida,
      // priorizando a traseira principal e evitando grande-angular/macro.
      try {
        const cameras = await mod.Html5Qrcode.getCameras();
        const backs = cameras.filter((c) => /back|rear|environment|traseir/i.test(c.label));
        const pool = backs.length ? backs : cameras;
        const isSecondary = (label: string) =>
          /ultra|wide.?angle|grande.?angular|tele|zoom|macro|depth|0\.5x|2x|3x|5x/i.test(label);
        const main =
          pool.find((c) => !isSecondary(c.label) && /(^|[^0-9])0(\D|$)|main|principal|1x/i.test(c.label)) ??
          pool.find((c) => !isSecondary(c.label)) ??
          pool[0];
        if (main?.id) configs.push(main.id, { deviceId: { exact: main.id } });
      } catch { /* a câmera dinâmica acima continua sendo a opção principal */ }
      let started = false;
      let lastErr: unknown = null;
      for (const cfg of configs) {
        try {
          await scanner.start(cfg as never, readerConfig as never, (decoded: string) => handleDecoded(decoded), () => { /* ignora frames sem QR */ });
          started = true;
          setStartingCamera(false);
          break;
        } catch (err) { lastErr = err; }
      }
      if (!started) throw lastErr || new Error("Nenhuma câmera disponível");
      setEngine("html5qr");
    } catch (e: unknown) {
      try { await stopScanner(); } catch { /* ignora */ }
      setScanning(false);
      setStartingCamera(false);
      const msg = e instanceof Error ? e.message : String(e);
      setScanError(
        `Não foi possível iniciar a câmera: ${msg}. ` +
          (inIframe ? "Tente abrir em nova aba (botão abaixo)." : "Verifique se outra aba/app não está usando a câmera."),
      );
    }
  }

  async function toggleTorch() {
    const track = nativeTrackRef.current;
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as unknown as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch (e) {
      console.warn("[QR] torch não suportado:", e);
      setTorchSupported(false);
    }
  }

  function handleDecoded(text: string) {
    if (decodedLockRef.current) return;
    const parsed = parseQrPayload(text);
    if (!parsed) {
      setScanError("QR lido, mas o conteúdo não está no formato esperado. Confira se é o QR da amostra.");
      return;
    }
    decodedLockRef.current = true;
    void stopScanner();
    // Pequena pausa de 1,5s antes de decidir o que fazer com a leitura.
    setPreparing(true);
    window.setTimeout(() => {
      setPreparing(false);
      tryIdentify(parsed);
    }, 1500);
  }

  async function handlePhoto(file: File) {
    if (readingPhoto) return;
    setReadingPhoto(true);
    setScanError(null);
    setNotFoundMsg(null);
    decodedLockRef.current = false;
    await stopScanner();
    try {
      const mod = await import("html5-qrcode");
      // Precisa de um container montado para instanciar; usamos um div temporário oculto
      const photoContainerId = `${containerId}-photo`;
      let host = document.getElementById(photoContainerId);
      let temp = false;
      if (!host) {
        host = document.createElement("div");
        host.id = photoContainerId;
        host.style.display = "none";
        document.body.appendChild(host);
        temp = true;
      }
      const scanner = new mod.Html5Qrcode(photoContainerId);
      try {
        const decoded = await scanner.scanFile(file, true);
        // Foto: identifica direto, sem contagem de 2s
        const parsed = parseQrPayload(decoded);
        if (!parsed) {
          setScanError("A foto foi lida, mas o conteúdo do QR não está no formato esperado. Confira se é o QR da amostra.");
          return;
        }
        tryIdentify(parsed);
      } finally {
        try { await scanner.clear(); } catch { /* ignora */ }
        if (temp && host?.parentNode) host.parentNode.removeChild(host);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setScanError(`Não foi possível ler o QR na foto: ${msg}. Tente novamente com boa iluminação e o QR centralizado.`);
    } finally {
      setReadingPhoto(false);
    }
  }

  function tryIdentify(payload: QrPayload) {
    const sigla = norm(payload.amostra_sigla);
    const os = norm(payload.contrato_nome);
    const tag = norm(payload.ensaio_tag_nome);

    const isMesp = isMespANaturalTag(payload.ensaio_tag_nome) || isMespANaturalTag(payload.ensaio_tag_descricao);
    const isAdens = isAdensamentoTag(payload.ensaio_tag_nome) || isAdensamentoTag(payload.ensaio_tag_descricao);
    if (!isMesp && !isAdens) {
      setNotFoundMsg(
        `Este QR é do ensaio "${payload.ensaio_tag_nome ?? "?"}". A digitalização atual cobre Massa Específica Aparente Natural (M.ESP.A) e Adensamento (ADENS).`,
      );
      return;
    }

    // Dispatch Adensamento — cria/upsert pendência e leva o operador para o
    // formulário Adens (moldagem + cápsulas iniciais).
    if (isAdens) {
      void dispatchAdens(payload).catch((e: unknown) => {
        setScanError("Falha ao registrar Adensamento: " + (e instanceof Error ? e.message : String(e)));
        decodedLockRef.current = false;
      });
      return;
    }

    // O QR é a fonte da verdade para OS e código da amostra.
    // Só casamos com a planilha para enriquecer tomador/obra/descrição — e
    // apenas quando o código da amostra bate (nunca por OS sozinha, senão
    // pegaríamos outra amostra da mesma OS e sobrescreveríamos o código).
    let amostra = amostras.find((a) => norm(a.codigo_amostra) === sigla && norm(a.os_numero) === os);
    if (!amostra) amostra = amostras.find((a) => norm(a.codigo_amostra) === sigla);

    // Busca tomador/obra pela OS (Cadastro de OS) — fonte principal.
    // A planilha de amostras é fallback.
    const cad = lookupCadastro((payload.contrato_nome ?? "").toString());

    // Fallback adicional: Cronograma (planilha "OS Pendentes" — casa apenas
    // Tomador; não tem coluna de Obra). Ajuda quando a OS não está na
    // planilha "Cadastro de OS" (ex.: meses fora do range carregado).
    const schedRows = scheduleData?.rows ?? [];
    const sched = schedRows.find((r) => norm(r.os) === os);

    const tipo =
      tipos.find((t) => norm(t.codigo) === tag) ??
      tipos.find((t) => isMespANaturalTag(t.codigo) || isMespANaturalTag(t.nome));

    const tomadorFinal = cad?.tomador || sched?.tomador || amostra?.tomador || "";
    const obraFinal = cad?.obra || amostra?.obra || "";

    if (!tomadorFinal && !obraFinal) {
      setNotFoundMsg(
        `OS ${payload.contrato_nome ?? "?"} não encontrada nas planilhas (Cadastro de OS, Cronograma, Amostras). Preencha manualmente ou solicite o cadastro ao supervisor.`,
      );
    }

    const ident: Identificacao = {
      // Nunca sobrescrever com dados da planilha: o QR manda.
      os: (payload.contrato_nome ?? "").toString().trim(),
      amostraCodigo: (payload.amostra_sigla ?? "").toString().trim(),
      amostraDescricao: amostra?.descricao ?? "",
      tomador: tomadorFinal,
      obra: obraFinal,
      tipoEnsaioNome: tipo?.nome || "Massa Específica Aparente Natural",
      tipoEnsaioCodigo: tipo?.codigo || "M.ESP.A",
      furo: extractFuro(payload),
      profundidade: extractProfundidade(payload),
    };

    // Verifica se já existe pendência para este ensaio (leitura repetida).
    const existing = (pendenciasAll as PendenciaDigitacao[]).find((p) => {
      const sameOs = norm(p.os) === norm(ident.os);
      const sameAmostra = norm(p.amostra ?? "") === norm(ident.amostraCodigo);
      const isMesp = isMespANaturalTag(p.ensaio) || isMespANaturalTag(p.tipo_ensaio);
      return sameOs && sameAmostra && isMesp;
    });

    if (existing) {
      setConfirmState({ kind: "existing", ident, pendencia: existing });
      // Fecha o aviso e segue para a digitação em 3s.
      if (autoCloseRef.current != null) window.clearTimeout(autoCloseRef.current);
      autoCloseRef.current = window.setTimeout(() => {
        setConfirmState(null);
        onIdentified(ident, existing.id);
      }, 3000);
    } else {
      setConfirmState({ kind: "new", ident });
    }
  }

  async function dispatchAdens(payload: QrPayload) {
    const osStr = (payload.contrato_nome ?? "").toString().trim();
    const amostraStr = (payload.amostra_sigla ?? "").toString().trim();
    const cad = lookupCadastro(osStr);
    const schedRows = scheduleData?.rows ?? [];
    const sched = schedRows.find((r) => norm(r.os) === norm(osStr));
    const amostraRow = amostras.find((a) => norm(a.codigo_amostra) === norm(amostraStr));
    const ident = {
      os: osStr,
      amostraCodigo: amostraStr,
      amostraDescricao: amostraRow?.descricao ?? "",
      tomador: cad?.tomador || sched?.tomador || amostraRow?.tomador || "",
      obra: cad?.obra || amostraRow?.obra || "",
      furo: extractFuro(payload),
      profundidade: extractProfundidade(payload),
      tipoEnsaioNome: "Adensamento Edométrico",
      tipoEnsaioCodigo: "ADENS",
    };
    // Existe pendência para (os, amostra, adens)?
    const existing = (pendenciasAll as PendenciaDigitacao[]).find((p) => {
      const sameOs = norm(p.os) === norm(ident.os);
      const sameAmostra = norm(p.amostra ?? "") === norm(ident.amostraCodigo);
      const isAd = isAdensamentoTag(p.ensaio) || isAdensamentoTag(p.tipo_ensaio);
      return sameOs && sameAmostra && isAd;
    });
    let pid: string;
    if (existing) {
      pid = existing.id;
    } else {
      const r = await criarPendenciaFn({
        data: {
          os: ident.os,
          amostra: ident.amostraCodigo || null,
          ensaio: "Adensamento Edométrico",
          tipo_ensaio: "adensamento",
          equipamento: null,
          origem: "digitalizacao",
          payload: { ident, moldagem: {}, capsulas: [], obs: "" } as unknown as Record<string, unknown>,
        },
      });
      pid = r.id;
    }
    void navigate({ to: "/relatorio/digitalizacao/adensamento", search: { pid } });
  }

  return (
    <>
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Camera className="h-4 w-4 text-primary" /> Leitor de QR
        </CardTitle>
        <CardDescription>Aponte a câmera para o QR da amostra.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {scanning && (
          <div className="relative aspect-square w-full max-w-md mx-auto rounded-lg border bg-black/90 overflow-hidden">
            {/* Engine nativa: renderiza vídeo direto */}
            <video
              ref={nativeVideoRef}
              className={`w-full h-full object-cover ${engine === "native" ? "" : "hidden"}`}
              playsInline
              muted
            />
            {/* Engine html5-qrcode: usa o container próprio */}
            <div id={containerId} className={`w-full h-full ${engine === "html5qr" ? "" : "hidden"}`} />
            {/* Overlay do viewfinder (guia visual) para o modo nativo */}
            {engine === "native" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-[70%] aspect-square rounded-lg border-2 border-amber-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            )}
            {torchSupported && (
              <Button
                type="button"
                size="sm"
                variant={torchOn ? "default" : "secondary"}
                className="absolute top-2 right-2 h-8"
                onClick={toggleTorch}
              >
                {torchOn ? <ZapOff className="h-3.5 w-3.5 mr-1" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
                {torchOn ? "Apagar" : "Lanterna"}
              </Button>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void handlePhoto(f);
          }}
        />
        {!scanning ? (
          <div className="space-y-2">
            <Button className="h-12 w-full text-base" onClick={startScanner} disabled={startingCamera || readingPhoto}>
              <Camera className="h-4 w-4 mr-2" />{startingCamera ? "Abrindo câmera…" : "Ler QR Code"}
            </Button>
            <Button className="w-full" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={startingCamera || readingPhoto}>
              <ImageUp className="h-4 w-4 mr-2" />{readingPhoto ? "Lendo foto…" : "Tirar foto do QR"}
            </Button>
          </div>
        ) : (
          <Button className="w-full" variant="secondary" onClick={stopScanner} disabled={startingCamera}>
            <StopCircle className="h-4 w-4 mr-2" />Parar
          </Button>
        )}
        {scanError && (
          <div className="space-y-2">
            <p className="text-xs text-destructive flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{scanError}</span>
            </p>
            {inIframe && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.open(window.location.href, "_blank", "noopener")}
              >
                Abrir em nova aba
              </Button>
            )}
          </div>
        )}
        {notFoundMsg && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-800 dark:text-amber-300">
            {notFoundMsg}
          </div>
        )}
        {preparing && (
          <p className="text-xs text-muted-foreground text-center">Processando leitura…</p>
        )}
      </CardContent>
    </Card>

    {/* Confirmação: primeira leitura → pergunta ao operador. */}
    <Dialog
      open={confirmState?.kind === "new"}
      onOpenChange={(o) => {
        if (!o) {
          setConfirmState(null);
          decodedLockRef.current = false;
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Iniciar execução do ensaio?</DialogTitle>
          <DialogDescription>
            {confirmState?.kind === "new" && (
              <>
                <b>{displayName}</b>, deseja iniciar a execução do ensaio{" "}
                <b>{confirmState.ident.tipoEnsaioCodigo}</b> ({confirmState.ident.tipoEnsaioNome}) da amostra{" "}
                <b>{confirmState.ident.amostraCodigo || "—"}</b>?
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {confirmState?.kind === "new" && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">OS:</span> <b>{confirmState.ident.os || "—"}</b></div>
            <div><span className="text-muted-foreground">Amostra:</span> <b>{confirmState.ident.amostraCodigo || "—"}</b></div>
            {confirmState.ident.obra && (
              <div><span className="text-muted-foreground">Obra:</span> {confirmState.ident.obra}</div>
            )}
            {confirmState.ident.tomador && (
              <div><span className="text-muted-foreground">Tomador:</span> {confirmState.ident.tomador}</div>
            )}
            {confirmState.ident.furo && (
              <div><span className="text-muted-foreground">Furo:</span> {confirmState.ident.furo}</div>
            )}
            {confirmState.ident.profundidade && (
              <div><span className="text-muted-foreground">Profundidade:</span> {confirmState.ident.profundidade}</div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setConfirmState(null);
              decodedLockRef.current = false;
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (confirmState?.kind === "new") {
                const ident = confirmState.ident;
                setConfirmState(null);
                onIdentified(ident, null);
              }
            }}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />Iniciar execução
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Leitura repetida: ensaio já iniciado — mostra por 3s e segue. */}
    <Dialog open={confirmState?.kind === "existing"}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ensaio já iniciado</DialogTitle>
          <DialogDescription>
            {confirmState?.kind === "existing" && (
              <>
                O ensaio <b>{confirmState.ident.tipoEnsaioCodigo}</b> da amostra{" "}
                <b>{confirmState.ident.amostraCodigo || "—"}</b> (OS{" "}
                <b>{confirmState.ident.os || "—"}</b>) já foi iniciado em{" "}
                <b>
                  {new Date(confirmState.pendencia.created_at).toLocaleString("pt-BR", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </b>
                . Abrindo a digitação…
              </>
            )}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
    </>
  );
}

// =====================================================================
// Pendências
// =====================================================================
export function PendenciasCard({ onPick }: { onPick: (p: PendenciaDigitacao, id: Identificacao) => void }) {
  const listFn = useServerFn(listPendenciasDigitacao);
  const atualizarFn = useServerFn(atualizarPendenciaDigitacao);
  const navigate = useNavigate();

  const { data: pendencias = [], refetch } = useQuery({
    queryKey: ["lab_pendencias_digitalizacao_page"],
    queryFn: () => listFn(),
  });

  const pendenciasDigit = useMemo(
    () => (pendencias as PendenciaDigitacao[]).filter(
      (p) =>
        isMespANaturalTag(p.ensaio) || isMespANaturalTag(p.tipo_ensaio) ||
        isAdensamentoTag(p.ensaio) || isAdensamentoTag(p.tipo_ensaio),
    ),
    [pendencias],
  );

  const { data: amostras = [] } = useQuery({
    queryKey: ["digit_amostras_pick"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_AMOSTRAS } })).map((r) => ({
        os_numero: r.os_numero ?? "",
        codigo_amostra: r.codigo_amostra || "",
        descricao: r.descricao || "",
        tomador: r.tomador || "",
        obra: r.obra || "",
      })),
  });

  async function pick(p: PendenciaDigitacao) {
    // Adens vai para o formulário dedicado.
    if (isAdensamentoTag(p.ensaio) || isAdensamentoTag(p.tipo_ensaio)) {
      if (p.status === "pendente") {
        try { await atualizarFn({ data: { id: p.id, status: "em_digitacao" } }); refetch(); }
        catch { /* silencia */ }
      }
      void navigate({ to: "/relatorio/digitalizacao/adensamento", search: { pid: p.id } });
      return;
    }
    const a = amostras.find(
      (x) => norm(x.codigo_amostra) === norm(p.amostra ?? "") && norm(x.os_numero) === norm(p.os),
    );
    const id: Identificacao = {
      os: p.os,
      amostraCodigo: p.amostra ?? "",
      amostraDescricao: a?.descricao ?? "",
      tomador: a?.tomador ?? "",
      obra: a?.obra ?? "",
      tipoEnsaioNome: p.tipo_ensaio ?? p.ensaio,
      tipoEnsaioCodigo: p.ensaio,
    };
    onPick(p, id);
    if (p.status === "pendente") {
      try { await atualizarFn({ data: { id: p.id, status: "em_digitacao" } }); refetch(); }
      catch { /* silencia */ }
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" /> Pendências (M.ESP.A · ADENS)
        </CardTitle>
        <CardDescription>
          Ensaios iniciados ou concluídos no Gantt que chegaram para digitação. Clique para abrir o formulário já pré-preenchido.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[640px] overflow-auto">
        {pendenciasDigit.length === 0 && (
          <p className="text-xs text-muted-foreground py-6 text-center">
            Nenhuma pendência digitalizada. Assim que um ensaio for iniciado ou concluído no Gantt ele aparece aqui.
          </p>
        )}
        {pendenciasDigit.map((p) => {
          const isAd = isAdensamentoTag(p.ensaio) || isAdensamentoTag(p.tipo_ensaio);
          return (
          <button
            key={p.id}
            onClick={() => pick(p)}
            className="w-full text-left rounded-md border p-2 hover:bg-accent transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {p.amostra || "—"} <span className="text-muted-foreground">· OS {p.os}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    {isAd ? "ADENS" : "M.ESP.A"}
                  </Badge>
                  <span className="truncate">{p.tipo_ensaio || p.ensaio}</span>
                </div>
              </div>
              <Badge variant="outline" className="capitalize text-[10px]">{p.status.replace("_", " ")}</Badge>
            </div>
          </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// Formulário
// =====================================================================
export function FormMEspA({
  ident, dets, setDets, obs, setObs, onBack, onSaveDraft, onFinalize, onIdentPatch, variant = "scanner",
}: {
  ident: Identificacao;
  dets: DeterminacaoInput[];
  setDets: (d: DeterminacaoInput[]) => void;
  obs: string;
  setObs: (s: string) => void;
  onBack: () => void;
  onSaveDraft: () => Promise<void> | void;
  onFinalize: (buildPdfBlob: () => Promise<Blob>) => Promise<void> | void;
  /** Se fornecido, os campos Furo / Profundidade viram editáveis. */
  onIdentPatch?: (p: Partial<Identificacao>) => void;
  /**
   * "scanner" (padrão) mostra o rodapé completo com "Escanear outra" e o
   * atalho para Digitação & Emissões, adequado ao fluxo de leitura de QR.
   * "editor" esconde esses botões — o editor OS → Amostra → Ensaio já
   * possui sua própria barra de fluxo (Verificação/Aprovação/PDF) no topo.
   */
  variant?: "scanner" | "editor";
}) {
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const prev = loadLocal(ident);
    if (prev && prev.dets.length > 0) {
      const merged = mergeDeterminations(dets, prev.dets);
      setDets(sameDeterminations(dets, merged) ? dets : merged);
      setObs(obs || prev.obs);
    }
  }, [dets, ident, obs, setDets, setObs]);

  const results = useMemo(() => dets.map(calcDeterminacao), [dets]);
  const mediaGammaNat = mediaValidas(results.map((r) => r.gammaNat));
  const mediaGammaSec = mediaValidas(results.map((r) => r.gammaSec));
  const mediaUmidade = mediaValidas(results.map((r) => r.umidade));
  // No modo "scanner" (uso no celular / campo) escondemos os resultados
  // calculados — a digitalização é apenas ENTRADA de dados. Os resultados
  // aparecem no fluxo de Digitação (Relatório → Digitação & Emissões).
  const showResults = variant !== "scanner";

  function updateDet(i: number, patch: Partial<DeterminacaoInput>) {
    const next = dets.slice();
    next[i] = { ...next[i], ...patch };
    setDets(next);
  }
  function addDet() { setDets([...dets, newDet()]); }
  function removeDet(i: number) {
    if (dets.length <= 1) { setDets([newDet()]); return; }
    setDets(dets.filter((_, idx) => idx !== i));
  }

  const printRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // Prepara o container offscreen para captura (força modo claro, viewport A4).
  async function withPrintable<T>(fn: (el: HTMLElement) => Promise<T>): Promise<T> {
    const el = printRef.current;
    if (!el) throw new Error("Relatório não montado.");
    const htmlEl = document.documentElement;
    const wasDark = htmlEl.classList.contains("dark");
    if (wasDark) htmlEl.classList.remove("dark");
    htmlEl.classList.add("force-light");
    const original = {
      position: el.style.position, top: el.style.top, left: el.style.left,
      width: el.style.width, background: el.style.background,
      pointerEvents: el.style.pointerEvents, zIndex: el.style.zIndex,
      opacity: el.style.opacity, visibility: el.style.visibility,
    };
    Object.assign(el.style, {
      position: "fixed", top: "0", left: "0", width: "210mm",
      background: "#ffffff", pointerEvents: "none",
      zIndex: "2147483647", opacity: "1", visibility: "visible",
    });
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
      return await fn(el);
    } finally {
      Object.assign(el.style, original);
      if (wasDark) htmlEl.classList.add("dark");
      htmlEl.classList.remove("force-light");
    }
  }

  async function handleDownloadPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const base = `${ident.os || "OS"}_${ident.amostraCodigo || "amostra"}`.replace(/[^\w.-]+/g, "-");
      await withPrintable((el) => generateMEspAPdf(el, `M-ESP-A_${base}.pdf`));
      toast.success("Relatório PDF gerado");
    } catch (e) {
      toast.error("Falha ao gerar PDF: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPdfBusy(false);
    }
  }

  /** Constrói o PDF (Blob) do relatório atual — usado no Finalizar → Verificação. */
  const buildPdfBlob = () => withPrintable((el) => renderMEspAPdfBlob(el));

  // Autosave local com debounce — protege contra fechamento acidental do
  // navegador enquanto o operador digita. O envio para servidor continua
  // acontecendo em "Salvar rascunho" / "Finalizar".
  useEffect(() => {
    const h = window.setTimeout(() => persistLocal(ident, dets, obs), 500);
    return () => window.clearTimeout(h);
  }, [ident, dets, obs]);

  return (
    <div className="space-y-4">
      {variant === "scanner" && (
        <div className="flex items-center">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />Voltar
          </Button>
        </div>
      )}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                {ident.tipoEnsaioCodigo} · {ident.tipoEnsaioNome}
              </CardTitle>
              <CardDescription>ABNT NBR 16867:2020 · Método da balança hidrostática</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onBack}>Trocar amostra</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Cabeçalho principal: Obra em destaque (vem da planilha via OS). */}
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Obra</div>
            <div className="text-lg font-semibold leading-tight truncate">{ident.obra || "—"}</div>
            {ident.tomador && (
              <div className="text-xs text-muted-foreground mt-0.5 truncate">{ident.tomador}</div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <IdentField label="OS" value={ident.os} strong />
            <IdentField label="Amostra" value={ident.amostraCodigo} strong />
            {onIdentPatch ? (
              <>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">ID do Furo</Label>
                  <Input
                    value={ident.furo ?? ""}
                    onChange={(e) => onIdentPatch({ furo: e.target.value })}
                    placeholder="Ex.: SP-01"
                    className="h-8 mt-1 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Profundidade</Label>
                  <Input
                    value={ident.profundidade ?? ""}
                    onChange={(e) => onIdentPatch({ profundidade: e.target.value })}
                    placeholder="Ex.: 6,00 – 6,50"
                    className="h-8 mt-1 text-sm"
                  />
                </div>
              </>
            ) : (
              <>
                <IdentField label="ID do Furo" value={ident.furo || "—"} />
                <IdentField label="Profundidade" value={ident.profundidade || "—"} />
              </>
            )}
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Descrição da amostra</Label>
            <p className="text-sm mt-1">{ident.amostraDescricao || "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Determinações</CardTitle>
            <CardDescription>
              Densidade da parafina considerada: <b>{RHO_PARAFINA.toLocaleString("pt-BR")} g/cm³</b>.
              Umidade e ρ<sub>nat</sub> calculados automaticamente.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={addDet}><Plus className="h-4 w-4 mr-1" />Nova determinação</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {variant === "scanner" ? (
            <DetsScannerCards
              dets={dets}
              updateDet={updateDet}
              removeDet={removeDet}
            />
          ) : (
            <DetsHorizontalTable
              dets={dets}
              results={results}
              updateDet={updateDet}
              removeDet={removeDet}
              showResults={showResults}
            />
          )}

          {showResults && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Médias (determinações válidas)</div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Result label="Umidade média" value={mediaUmidade} unit="%" dec={2} highlight />
                <Result label="ρ natural média" value={mediaGammaNat} unit="g/cm³" dec={3} highlight />
                <Result label="ρ seca média" value={mediaGammaSec} unit="g/cm³" dec={3} highlight />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} className="mt-1 text-sm" />
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-2 z-10 flex flex-wrap gap-2 rounded-lg border bg-background/80 backdrop-blur p-2">
        <Button variant="secondary" onClick={onSaveDraft}><Save className="h-4 w-4 mr-2" />Salvar rascunho</Button>
        {variant !== "scanner" && (
          <Button variant="secondary" onClick={handleDownloadPdf} disabled={pdfBusy}>
            <FileText className="h-4 w-4 mr-2" />
            {pdfBusy ? "Gerando PDF…" : "Baixar PDF"}
          </Button>
        )}
        <Button className="ml-auto" onClick={() => onFinalize(buildPdfBlob)}><CheckCircle2 className="h-4 w-4 mr-2" />{variant === "scanner" ? "Finalizar execução" : "Finalizar digitação"}</Button>
        {variant === "scanner" && (
          <Button variant="ghost" asChild>
            <Link to="/relatorio/pendentes" search={{ tab: "visao-geral" }}>Ir para Digitação & Emissões</Link>
          </Button>
        )}
      </div>

      {/* Container offscreen usado apenas para renderizar o relatório e
          capturá-lo como PDF. Mesma abordagem dos relatórios Triaxial CID
          e Adensamento — cabeçalho/rodapé compartilhados do ReportShell. */}
      <div
        ref={printRef}
        style={{ position: "fixed", top: "-10000px", left: "-10000px", width: "210mm", background: "#fff", pointerEvents: "none", opacity: 0, visibility: "hidden" }}
      >
        <MEspAReport ident={ident} dets={dets} obs={obs} />
      </div>
    </div>
  );
}

function IdentField({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <p className={`text-sm mt-1 ${strong ? "font-semibold" : ""}`}>{value || "—"}</p>
    </div>
  );
}
function FieldText({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 mt-1 text-sm" />
    </div>
  );
}
function FieldNum({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [raw, setRaw] = useState(value == null ? "" : String(value).replace(".", ","));
  useEffect(() => { setRaw(value == null ? "" : String(value).replace(".", ",")); }, [value]);
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        inputMode="decimal"
        value={raw}
        onChange={(e) => {
          const s = e.target.value;
          setRaw(s);
          if (s.trim() === "") { onChange(null); return; }
          const n = Number(s.replace(",", "."));
          onChange(Number.isFinite(n) ? n : null);
        }}
        className="h-8 mt-1 text-sm font-mono"
      />
    </div>
  );
}
function Result({ label, value, unit, dec, highlight }: { label: string; value: number | null; unit: string; dec: number; highlight?: boolean }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 ${highlight ? "bg-primary/5 border-primary/30" : "bg-background"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-mono font-semibold">
        {fmt(value, dec)} <span className="text-[10px] font-normal text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

/**
 * Tabela horizontal — cada determinação é uma COLUNA. Rolagem horizontal
 * quando muitas determinações são adicionadas. Linhas fixas à esquerda
 * exibem o rótulo do parâmetro / resultado.
 */
function DetsHorizontalTable({
  dets,
  results,
  updateDet,
  removeDet,
  showResults = true,
}: {
  dets: DeterminacaoInput[];
  results: ReturnType<typeof calcDeterminacao>[];
  updateDet: (i: number, patch: Partial<DeterminacaoInput>) => void;
  removeDet: (i: number) => void;
  showResults?: boolean;
}) {
  type NumKey =
    | "massaCapsula"
    | "massaCapsulaSoloUmido"
    | "massaCapsulaSoloSeco"
    | "massaCp"
    | "massaCpParafina"
    | "massaCpParafinaSubmerso";
  const inputRows: { key: NumKey; label: string }[] = [
    { key: "massaCapsula", label: "Massa da Cápsula [g]" },
    { key: "massaCapsulaSoloUmido", label: "Cápsula + Solo Úmido [g]" },
    { key: "massaCapsulaSoloSeco", label: "Cápsula + Solo Seco [g]" },
    { key: "massaCp", label: "Massa CP [g]" },
    { key: "massaCpParafina", label: "Massa CP + Parafina [g]" },
    { key: "massaCpParafinaSubmerso", label: "CP + Parafina · Submerso [g]" },
  ];
  const resultRows: {
    key: keyof ReturnType<typeof calcDeterminacao>;
    label: string;
    unit: string;
    dec: number;
    highlight?: boolean;
  }[] = [
    { key: "umidade",        label: "Umidade w",        unit: "%",     dec: 2 },
    { key: "massaParafina",  label: "M. parafina",      unit: "g",     dec: 2 },
    { key: "volumeParafina", label: "V. parafina",      unit: "cm³",   dec: 2 },
    { key: "volumeTotal",    label: "V. total (CP+par)", unit: "cm³",  dec: 2 },
    { key: "volumeCp",       label: "V. CP",            unit: "cm³",   dec: 2 },
    { key: "gammaNat",       label: "ρ natural",        unit: "g/cm³", dec: 3, highlight: true },
    { key: "gammaSec",       label: "ρ seca",           unit: "g/cm³", dec: 3 },
  ];
  const colWidth = "min-w-[160px] w-[160px]";
  const labelCol = "sticky left-0 z-10 bg-card min-w-[220px] w-[220px] px-3 py-2 text-xs font-medium text-muted-foreground border-r";

  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className={`${labelCol} text-left`}>Parâmetro</th>
            {dets.map((d, i) => (
              <th key={d.id} className={`${colWidth} px-2 py-2 border-l align-bottom`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-foreground">Determinação {i + 1}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeDet(i)}
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    title="Remover determinação"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Nº da cápsula (texto) */}
          <tr className="border-b">
            <td className={labelCol}>Nº da Cápsula</td>
            {dets.map((d, i) => (
              <td key={d.id} className={`${colWidth} px-2 py-1 border-l`}>
                <Input
                  value={d.capsula}
                  onChange={(e) => updateDet(i, { capsula: e.target.value })}
                  className="h-8 text-sm"
                />
              </td>
            ))}
          </tr>
          {/* Linhas de entrada numérica */}
          {inputRows.map((row) => (
            <tr key={row.key} className="border-b">
              <td className={labelCol}>{row.label}</td>
              {dets.map((d, i) => (
                <td key={d.id} className={`${colWidth} px-2 py-1 border-l`}>
                  <NumCell value={d[row.key]} onChange={(v) => updateDet(i, { [row.key]: v } as Partial<DeterminacaoInput>)} />
                </td>
              ))}
            </tr>
          ))}
          {/* Separador de resultados */}
          {showResults && (<>
          <tr>
            <td className={`${labelCol} bg-muted/30 text-[10px] uppercase tracking-wider`}>Resultados</td>
            {dets.map((d) => (
              <td key={d.id} className={`${colWidth} border-l bg-muted/30`} />
            ))}
          </tr>
          {resultRows.map((row) => (
            <tr key={String(row.key)} className="border-b">
              <td className={`${labelCol} ${row.highlight ? "text-primary" : ""}`}>{row.label}</td>
              {dets.map((d, i) => {
                const value = results[i]?.[row.key] as number | null | undefined;
                return (
                  <td key={d.id} className={`${colWidth} px-2 py-1 border-l`}>
                    <div
                      className={`rounded-md border px-2 py-1 text-right font-mono text-sm ${
                        row.highlight ? "bg-primary/5 border-primary/30 font-semibold" : "bg-background"
                      }`}
                    >
                      {fmt(value ?? null, row.dec)}
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">{row.unit}</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
          </>)}
        </tbody>
      </table>
    </div>
  );
}

function NumCell({ value, onChange, onKeyDown, large }: {
  value: number | null;
  onChange: (v: number | null) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  large?: boolean;
}) {
  const [raw, setRaw] = useState(value == null ? "" : String(value).replace(".", ","));
  useEffect(() => { setRaw(value == null ? "" : String(value).replace(".", ",")); }, [value]);
  return (
    <Input
      inputMode="decimal"
      value={raw}
      onChange={(e) => {
        const v = e.target.value;
        setRaw(v);
        const norm = v.replace(",", ".").trim();
        if (norm === "") onChange(null);
        else {
          const n = Number(norm);
          if (!Number.isNaN(n)) onChange(n);
        }
      }}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={onKeyDown}
      className={`${large ? "h-10 text-base" : "h-8 text-sm"} text-right font-mono`}
    />
  );
}

/**
 * Layout dedicado ao modo scanner (celular / operador em campo).
 * Cada determinação vira um cartão com os campos dispostos em grid
 * horizontal (2 colunas no celular, 3 no tablet) — evita a rolagem
 * vertical longa da tabela e mostra vários campos ao mesmo tempo.
 */
function DetsScannerCards({
  dets,
  updateDet,
  removeDet,
}: {
  dets: DeterminacaoInput[];
  updateDet: (i: number, patch: Partial<DeterminacaoInput>) => void;
  removeDet: (i: number) => void;
}) {
  const fields: { key: keyof DeterminacaoInput; label: string; numeric?: boolean }[] = [
    { key: "capsula", label: "Nº Cápsula" },
    { key: "massaCapsula", label: "M. Cápsula [g]", numeric: true },
    { key: "massaCapsulaSoloUmido", label: "Cáp + Solo Úmido [g]", numeric: true },
    { key: "massaCapsulaSoloSeco", label: "Cáp + Solo Seco [g]", numeric: true },
    { key: "massaCp", label: "Massa CP [g]", numeric: true },
    { key: "massaCpParafina", label: "CP + Parafina [g]", numeric: true },
    { key: "massaCpParafinaSubmerso", label: "CP + Par. Submerso [g]", numeric: true },
  ];
  // Enter avança para o próximo input do mesmo cartão (fluxo ágil no celular).
  function handleEnterAdvance(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const card = (e.currentTarget.closest("[data-det-card]") as HTMLElement | null);
    if (!card) return;
    const inputs = Array.from(card.querySelectorAll<HTMLInputElement>("input"));
    const idx = inputs.indexOf(e.currentTarget);
    const next = inputs[idx + 1];
    if (next) { next.focus(); next.select?.(); }
    else (e.currentTarget as HTMLInputElement).blur();
  }
  return (
    <div className="space-y-3">
      {dets.map((d, i) => (
        <div key={d.id} data-det-card className="rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Determinação {i + 1}</div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeDet(i)}
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title="Remover determinação"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {fields.map((f) => (
              <div key={String(f.key)} className="min-w-0">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {f.label}
                </Label>
                {f.numeric ? (
                  <NumCell
                    value={d[f.key] as number | null}
                    onChange={(v) => updateDet(i, { [f.key]: v } as Partial<DeterminacaoInput>)}
                    onKeyDown={handleEnterAdvance}
                    large
                  />
                ) : (
                  <Input
                    value={(d[f.key] as string) ?? ""}
                    onChange={(e) => updateDet(i, { [f.key]: e.target.value } as Partial<DeterminacaoInput>)}
                    className="h-10 text-base mt-1"
                    onKeyDown={handleEnterAdvance}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}