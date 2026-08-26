import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScanLine, Camera, StopCircle, PlayCircle, CheckCircle2, AlertTriangle, RefreshCw, FlaskConical, SwitchCamera } from "lucide-react";
import { listRows, updateRow } from "@/lib/programacao.functions";
import { toast } from "sonner";
import { criarPendenciaDigitacao } from "@/lib/lab-pendencias.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SHEET_AMOSTRAS,
  SHEET_ENSAIOS,
  SHEET_PROGS,
  SHEET_TIPOS,
  parseProgramacaoRow,
  type Programacao,
} from "@/lib/programacao-model";
import { recalculateDownstream } from "@/lib/programacao-cascade";
import { endIsoFromDur } from "@/lib/business-days";

const isMespATipo = (nome: string) => /m\.?\s*esp\.?\s*a|massa\s+espec[ií]fica\s+aparente/i.test(nome);
const isAdensamentoTipo = (nome: string) => /adensamento|edométric|^aden\b/i.test(nome);

export const Route = createFileRoute("/_app/programacao/scan")({
  component: ScanPage,
});

type QrPayload = {
  amostra_sigla?: string;
  contrato_nome?: string;
  servico_nome?: string;
  ensaio_tag_nome?: string;
  ensaio_tag_descricao?: string;
  sigla?: string;
  [k: string]: unknown;
};

function norm(s: string | null | undefined) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, "");
}
function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ScanPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [payload, setPayload] = useState<QrPayload | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const containerId = "qr-reader-container";
  const scannerRef = useRef<any>(null);

  // Dados
  const { data: amostras = [] } = useQuery({
    queryKey: ["amostras"],
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
  const { data: ensaios = [] } = useQuery({
    queryKey: ["ensaios"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_ENSAIOS } })).map((r) => ({
        id: r.id,
        amostra_id: r.amostra_id ?? "",
        tipo_ensaio_id: r.tipo_ensaio_id ?? "",
        status: r.status || "pendente",
      })),
  });
  const { data: tipos = [] } = useQuery({
    queryKey: ["tipos_ensaio_min"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_TIPOS } })).map((r) => ({
        id: r.id,
        nome: r.nome ?? "",
        codigo: r.codigo || "",
      })),
  });
  const { data: progs = [] } = useQuery({
    queryKey: ["programacoes"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_PROGS } })).map(parseProgramacaoRow),
  });

  const savProg = useMutation({
    mutationFn: async (p: { id: string; row: Record<string, unknown> }) =>
      updateRow({ data: { sheet: SHEET_PROGS, id: p.id, patch: p.row } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["programacoes"] });
    },
  });

  // Mesma cascata de reagendamento do Gantt desktop — iniciar/concluir pelo
  // celular deve se comportar de forma idêntica a iniciar/concluir pela tela
  // do escritório.
  const runCascade = async (anchorProgId: string, anchorFinishIso: string) => {
    const { shifted } = await recalculateDownstream(anchorProgId, anchorFinishIso, progs, async (id, patch) => {
      await updateRow({ data: { sheet: SHEET_PROGS, id, patch } });
    });
    if (shifted > 0) {
      toast.info(`${shifted} ensaio(s) reagendado(s) automaticamente`);
      qc.invalidateQueries({ queryKey: ["programacoes"] });
    }
  };

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enumerate cameras once (desktop support: choose webcam)
  useEffect(() => {
    (async () => {
      try {
        const mod = await import("html5-qrcode");
        const devices = await mod.Html5Qrcode.getCameras();
        const list = devices.map((d) => ({ id: d.id, label: d.label || "Câmera" }));
        setCameras(list);
        // Prefer rear camera if available
        const rear = list.find((c) => /back|rear|environment|traseira/i.test(c.label));
        setCameraId((rear || list[0])?.id || "");
      } catch {
        // sem permissão ainda — pediremos ao iniciar
      }
    })();
  }, []);

  async function startScanner() {
    setScanError(null);
    try {
      const mod = await import("html5-qrcode");
      const Html5Qrcode = mod.Html5Qrcode;
      // aguarda o div montar
      await new Promise((r) => setTimeout(r, 30));
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      setScanning(true);
      // Estratégia: câmera selecionada → traseira → qualquer câmera
      const configs: any[] = [];
      if (cameraId) configs.push({ deviceId: { exact: cameraId } });
      configs.push({ facingMode: { ideal: "environment" } });
      configs.push(true);
      let started = false;
      let lastErr: any = null;
      for (const cfg of configs) {
        try {
          await scanner.start(
            cfg,
            { fps: 10, qrbox: { width: 260, height: 260 } },
            (decoded: string) => handleDecoded(decoded),
            () => {},
          );
          started = true;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!started) throw lastErr || new Error("Nenhuma câmera disponível");
      // Após iniciar (permissão concedida), atualiza lista de câmeras com labels
      if (cameras.length === 0) {
        try {
          const devices = await mod.Html5Qrcode.getCameras();
          setCameras(devices.map((d) => ({ id: d.id, label: d.label || "Câmera" })));
        } catch {}
      }
    } catch (e: any) {
      setScanning(false);
      setScanError(e?.message || "Não foi possível iniciar a câmera. Verifique permissões.");
    }
  }

  async function switchCamera(newId: string) {
    setCameraId(newId);
    if (scanning) {
      await stopScanner();
      // pequena espera antes de reiniciar
      setTimeout(() => startScanner(), 100);
    }
  }

  async function stopScanner() {
    const s = scannerRef.current;
    if (!s) return;
    try {
      if (s.isScanning) await s.stop();
      await s.clear();
    } catch {}
    scannerRef.current = null;
    setScanning(false);
  }

  function handleDecoded(text: string) {
    let parsed: QrPayload | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      setScanError("QR não é um JSON válido.");
      return;
    }
    setPayload(parsed);
    setScanError(null);
    stopScanner();
  }

  function handleManual() {
    if (!rawInput.trim()) return;
    handleDecoded(rawInput.trim());
  }

  // Matching
  const match = useMemo(() => {
    if (!payload) return null;
    const sigla = norm(payload.amostra_sigla);
    const os = norm(payload.contrato_nome);
    const tag = norm(payload.ensaio_tag_nome);

    // 1. Amostra
    let amostra = amostras.find(
      (a) => norm(a.codigo_amostra) === sigla && norm(a.os_numero) === os,
    );
    if (!amostra) amostra = amostras.find((a) => norm(a.codigo_amostra) === sigla);
    if (!amostra) amostra = amostras.find((a) => norm(a.os_numero) === os && sigla && norm(a.codigo_amostra).endsWith(sigla));
    if (!amostra) return { error: "amostra" as const };

    // 2. Tipo de ensaio
    let tipo = tipos.find((t) => norm(t.codigo) === tag);
    if (!tipo) tipo = tipos.find((t) => norm(t.nome) === tag);
    if (!tipo) tipo = tipos.find((t) => norm(t.nome).includes(tag) || norm(t.codigo).includes(tag));
    if (!tipo) return { error: "tipo" as const, amostra };

    // 3. Ensaio
    const ensaio = ensaios.find(
      (e) => e.amostra_id === amostra!.id && e.tipo_ensaio_id === tipo!.id,
    );
    if (!ensaio) return { error: "ensaio" as const, amostra, tipo };

    // 4. Programação (opcional)
    const prog = progs.find((p) => p.ensaio_id === ensaio.id) || null;
    return { amostra, tipo, ensaio, prog };
  }, [payload, amostras, ensaios, tipos, progs]);

  function reset() {
    setPayload(null);
    setRawInput("");
    setScanError(null);
  }

  function iniciar() {
    if (!match || !("prog" in match) || !match.prog) return;
    const hoje = isoToday();
    const nowTs = new Date().toISOString();
    const prog = match.prog;
    const novoFim = endIsoFromDur(hoje, prog.duracao_dias || 1, prog.incluir_fds);
    savProg.mutate(
      {
        id: prog.id,
        row: {
          data_inicio_real: hoje,
          inicio_real_ts: nowTs,
          status: "em_execucao",
          progresso: 10,
          data_inicio: hoje,
          data_fim: novoFim,
        },
      },
      {
        onSuccess: async () => {
          toast.success("Ensaio iniciado");
          await runCascade(prog.id, novoFim);
          // Ponte Scan -> Relatório: M.ESP.A já vira pendência ao iniciar.
          try {
            if (match && "amostra" in match && match.amostra && match.tipo) {
              if (isMespATipo(match.tipo.nome)) {
                await criarPendenciaDigitacao({
                  data: {
                    os: match.amostra.os_numero,
                    amostra: match.amostra.codigo_amostra ?? null,
                    ensaio: match.tipo.nome,
                    tipo_ensaio: match.tipo.nome,
                    equipamento: null,
                    programacao_id: prog.id ?? null,
                    operador_nome: prog.tecnico ?? null,
                  },
                });
              }
            }
          } catch { /* silencia */ }
        },
        onError: (e: any) => toast.error(e?.message || "Falha ao iniciar"),
      },
    );
  }
  function concluir() {
    if (!match || !("prog" in match) || !match.prog) return;
    const hoje = isoToday();
    const nowTs = new Date().toISOString();
    const prog = match.prog;
    savProg.mutate(
      {
        id: prog.id,
        row: {
          data_fim_real: hoje,
          fim_real_ts: nowTs,
          status: "concluido",
          progresso: 100,
          data_fim: hoje,
        },
      },
      {
        onSuccess: async () => {
          toast.success("Ensaio concluído");
          // Termina antes do previsto -> puxa o início do próximo; termina
          // depois -> atrasa o próximo. Mesma cascata do Gantt desktop.
          await runCascade(prog.id, hoje);
          // Ponte Scan -> Relatório (Pendente de digitação). M.ESP.A já tem
          // sua própria pendência criada ao iniciar — não duplicamos aqui,
          // igual ao Gantt desktop faz ao concluir uma programação.
          try {
            if (match && "amostra" in match && match.amostra && match.tipo && !isMespATipo(match.tipo.nome)) {
              const pend = await criarPendenciaDigitacao({
                data: {
                  os: match.amostra.os_numero,
                  amostra: match.amostra.codigo_amostra ?? null,
                  ensaio: match.tipo.nome,
                  tipo_ensaio: match.tipo.nome,
                  equipamento: null,
                  programacao_id: prog.id ?? null,
                  operador_nome: prog.tecnico ?? null,
                },
              });
              // Encadeia os dois fluxos mobile: depois de concluir na
              // bancada, oferece ir direto pra digitação de campo do mesmo
              // ensaio, em vez de deixar a pessoa navegar manualmente.
              const isAdens = isAdensamentoTipo(match.tipo.nome);
              toast.info("Pronto para digitalização de campo", {
                action: {
                  label: "Ir para Digitalização",
                  onClick: () =>
                    navigate(
                      isAdens
                        ? { to: "/relatorio/digitalizacao/adensamento", search: { pid: pend.id } }
                        : { to: "/relatorio/digitalizacao" },
                    ),
                },
              });
            }
          } catch { /* não bloqueia se a ponte falhar */ }
        },
        onError: (e: any) => toast.error(e?.message || "Falha ao concluir"),
      },
    );
  }

  return (
    <div className="space-y-4 max-w-lg mx-auto pb-24 px-1 sm:px-0">
      <PageHeader
        eyebrow="Operação · Mobile"
        icon={ScanLine}
        title="Leitor de QR · Ensaios"
        description="Escaneie o QR da amostra pelo celular ou webcam para iniciar ou concluir o ensaio."
      />

      {!payload && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" /> Câmera
            </CardTitle>
            <CardDescription>
              Aponte a câmera (traseira do celular ou webcam) para o QR da amostra.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cameras.length > 1 && (
              <div className="flex items-center gap-2">
                <SwitchCamera className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={cameraId} onValueChange={switchCamera}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecionar câmera" />
                  </SelectTrigger>
                  <SelectContent>
                    {cameras.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div
              id={containerId}
              className="aspect-square w-full rounded-lg border bg-black/90 overflow-hidden"
            />
            {!scanning ? (
              <Button className="w-full" size="lg" onClick={startScanner}>
                <PlayCircle className="h-4 w-4 mr-2" /> Iniciar câmera
              </Button>
            ) : (
              <Button variant="secondary" className="w-full" size="lg" onClick={stopScanner}>
                <StopCircle className="h-4 w-4 mr-2" /> Parar
              </Button>
            )}
            {scanError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {scanError}
              </p>
            )}
            <div className="pt-2 border-t space-y-2">
              <p className="text-xs text-muted-foreground">
                Sem câmera? Cole o conteúdo do QR abaixo:
              </p>
              <Textarea
                rows={3}
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder='{"amostra_sigla":"13257-04", ...}'
                className="text-xs font-mono"
              />
              <Button variant="outline" size="sm" className="w-full" onClick={handleManual}>
                Processar manualmente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {payload && match && "error" in match && match.error === "amostra" && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Amostra / Código não cadastrado
            </CardTitle>
            <CardDescription>
              Amostra <b>{payload.amostra_sigla}</b> (OS {payload.contrato_nome}) não está
              cadastrada na programação. Solicite o cadastro ao supervisor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={reset} variant="outline" className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" /> Escanear outro
            </Button>
          </CardContent>
        </Card>
      )}

      {payload && match && "error" in match && (match.error === "tipo" || match.error === "ensaio") && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" /> Ensaio não programado
            </CardTitle>
            <CardDescription>
              A amostra <b>{payload.amostra_sigla}</b> existe, mas o ensaio{" "}
              <b>{payload.ensaio_tag_nome}</b> não está cadastrado/programado. Solicite o
              cadastro ao supervisor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/programacao/central">Abrir Central de programação</Link>
            </Button>
            <Button onClick={reset} variant="ghost" size="sm" className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" /> Escanear outro
            </Button>
          </CardContent>
        </Card>
      )}

      {payload && match && !("error" in match) && (
        <EnsaioCard
          match={match}
          payload={payload}
          onIniciar={iniciar}
          onConcluir={concluir}
          onReset={reset}
          saving={savProg.isPending}
        />
      )}
    </div>
  );
}

function EnsaioCard({
  match,
  payload,
  onIniciar,
  onConcluir,
  onReset,
  saving,
}: {
  match: {
    amostra: { id: string; os_numero: string; codigo_amostra: string; descricao: string; tomador: string; obra: string };
    tipo: { id: string; nome: string; codigo: string };
    ensaio: { id: string; status: string };
    prog: Programacao | null;
  };
  payload: QrPayload;
  onIniciar: () => void;
  onConcluir: () => void;
  onReset: () => void;
  saving: boolean;
}) {
  const { amostra, tipo, prog } = match;
  const status = prog?.status || "planejado";
  const statusLabel =
    status === "concluido" ? "Concluído" : status === "em_execucao" ? "Em execução" : "Planejado";
  const statusClass =
    status === "concluido"
      ? "status-pill status-concluido"
      : status === "em_execucao"
      ? "status-pill status-execucao"
      : "status-pill status-programado";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              {tipo.codigo || tipo.nome}
            </CardTitle>
            <CardDescription className="mt-1">{tipo.nome}</CardDescription>
          </div>
          <span className={statusClass}>{statusLabel}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border p-3 space-y-1 text-sm bg-muted/30">
          <Row label="Amostra" value={amostra.codigo_amostra || payload.amostra_sigla || "—"} strong />
          <Row label="OS" value={amostra.os_numero || payload.contrato_nome || "—"} />
          {amostra.tomador && <Row label="Tomador" value={amostra.tomador} />}
          {amostra.obra && <Row label="Obra" value={amostra.obra} />}
          {amostra.descricao && <Row label="Descrição" value={amostra.descricao} />}
          {payload.servico_nome && <Row label="Serviço" value={String(payload.servico_nome)} />}
        </div>

        {!prog && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            Ensaio cadastrado, mas ainda sem programação no Gantt. Solicite ao supervisor.
          </div>
        )}

        {prog?.data_inicio_real && (
          <p className="text-xs text-muted-foreground">
            Início real: <b>{prog.data_inicio_real}</b>
            {prog.data_fim_real && <> · Fim: <b>{prog.data_fim_real}</b></>}
          </p>
        )}

        <div className="grid gap-2">
          {prog && status === "planejado" && (
            <Button size="lg" className="w-full" onClick={onIniciar} disabled={saving}>
              <PlayCircle className="h-5 w-5 mr-2" /> Iniciar ensaio (hoje)
            </Button>
          )}
          {prog && status === "em_execucao" && (
            <Button size="lg" className="w-full" onClick={onConcluir} disabled={saving}>
              <CheckCircle2 className="h-5 w-5 mr-2" /> Concluir ensaio (hoje)
            </Button>
          )}
          {prog && status === "concluido" && (
            <Badge variant="secondary" className="w-full justify-center py-2">
              Este ensaio já foi finalizado
            </Badge>
          )}
          <Button variant="outline" size="lg" className="w-full" onClick={onReset}>
            <RefreshCw className="h-4 w-4 mr-2" /> Escanear próximo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold text-right" : "text-right"}>{value}</span>
    </div>
  );
}