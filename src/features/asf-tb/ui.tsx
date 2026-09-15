/**
 * Digitalização do ASF.TB — teor de betume (DNER-ME 053/94) e granulometria
 * do agregado extraído (DNIT 412/2025-ME). Tela de bancada aberta pela
 * leitura do QR (registro genérico `digit-scan/registry.ts`): o operador
 * digita as massas no celular e finaliza; o escritório recebe a pendência e o
 * editor do laudo abre pré-preenchido. Mesmo padrão de `asf-dap/ui.tsx`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Save, CheckCircle2, Trash2, Beaker, ImagePlus, Camera, Filter } from "lucide-react";
import { fileToCompressedDataUrl, formatBytes } from "@/features/lab/photos";
import { atualizarPendenciaOuGuardar, criarPendenciaOuGuardar, usePendenciaDaBancada } from "@/lib/fila-offline";
import { getLabEnsaioSnapshot } from "@/lib/lab-ensaios.functions";
import type { Photo } from "@/features/lab/types";
import {
  calcularGranulometria,
  formatarAbertura,
  massaBetume,
  massaInicialDoPeneiramento,
  teorBetume,
  TOLERANCIA_SOMA_PCT,
} from "./calc";
import {
  ASF_TB_CODIGO,
  ASF_TB_NOME,
  SOLVENTES_SUGERIDOS,
  emptyAsfTbPayload,
  normalizarMedidas,
  type AsfTbFieldPayload,
  type AsfTbMedidas,
  type AsfTbPeneira,
  type AsfTbPhoto,
} from "./types";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

function draftKey(ident: AsfTbFieldPayload["ident"]) {
  return `asf-tb-scan://${ident.os}/${ident.amostraCodigo}`;
}
function persistLocal(data: AsfTbFieldPayload) {
  try {
    window.localStorage.setItem(draftKey(data.ident), JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch { /* ignora quota */ }
}
function loadLocal(ident: AsfTbFieldPayload["ident"]): AsfTbFieldPayload | null {
  try {
    const raw = window.localStorage.getItem(draftKey(ident));
    if (!raw) return null;
    const p = JSON.parse(raw) as AsfTbFieldPayload;
    if (!p?.ident || !p?.medidas) return null;
    return p;
  } catch { return null; }
}

// -------- Dispatch (chamado pelo registro genérico digit-scan/registry.ts) --------
function toNumOrUndef(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/**
 * Cria (ou reaproveita, de forma idempotente — ver `criarPendenciaDigitacao`)
 * a pendência de digitação para o QR de ASF.TB e devolve pra onde navegar.
 * Standalone (sem hooks): roda fora de um componente React.
 */
export async function dispatchAsfTb(payload: Record<string, unknown>): Promise<{ to: string; search: { pid: string } }> {
  const os = String(payload.contrato_nome ?? "").trim();
  const amostraCodigo = String(payload.amostra_sigla ?? "").trim();
  const servicoRaw = payload.servico_nome;
  const ident: AsfTbFieldPayload["ident"] = {
    os,
    amostraCodigo,
    servicoNome: servicoRaw != null ? String(servicoRaw).trim() : undefined,
    tipoEnsaioNome: ASF_TB_NOME,
    tipoEnsaioCodigo: ASF_TB_CODIGO,
    qrcodeEnsaioLabId: toNumOrUndef(payload.qrcode_ensaio_lab_id),
    ensaioId: toNumOrUndef(payload.ensaio_id),
    contratoId: toNumOrUndef(payload.contrato_id),
    servicoId: toNumOrUndef(payload.servico_id),
    ensaioTagId: toNumOrUndef(payload.ensaio_tag_id),
  };
  const r = await criarPendenciaOuGuardar({
    data: {
      os,
      amostra: amostraCodigo || null,
      ensaio: ASF_TB_NOME,
      tipo_ensaio: "asf-tb",
      origem: "digitalizacao",
      payload: emptyAsfTbPayload(ident) as unknown as Record<string, unknown>,
    },
  });
  return { to: "/relatorio/digitalizacao/asf-tb", search: { pid: r.id } };
}

// -------- Editor mobile-first (usado após leitura do QR) --------
export function AsfTbWorkspace({
  initial,
  pendenciaId,
  onBack,
  officePhotos = [],
}: {
  initial: AsfTbFieldPayload;
  pendenciaId: string | null;
  onBack: () => void;
  /** Fotos já adicionadas no relatório do escritório — só leitura aqui. */
  officePhotos?: Photo[];
}) {
  const [data, setData] = useState<AsfTbFieldPayload>(initial);
  const [pid, setPid] = useState<string | null>(pendenciaId);
  // Sem rede, gravam no aparelho e saem quando a rede volta (lib/fila-offline.ts).
  const criarFn = criarPendenciaOuGuardar;
  const atualizarFn = atualizarPendenciaOuGuardar;
  const navigate = useNavigate();
  const loadedRef = useRef(false);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const pidRef = useRef<string | null>(pid);
  useEffect(() => { pidRef.current = pid; }, [pid]);

  /** Cria a pendência (primeira gravação) — devolve o id. */
  async function criarPendencia(snap: AsfTbFieldPayload): Promise<string> {
    const r = await criarFn({
      data: {
        os: snap.ident.os,
        amostra: snap.ident.amostraCodigo || null,
        ensaio: ASF_TB_NOME,
        tipo_ensaio: "asf-tb",
        origem: "digitalizacao",
        payload: snap as unknown as Record<string, unknown>,
      },
    });
    return r.id;
  }

  async function saveToServer() {
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true;
    try {
      const snap = dataRef.current;
      if (!pidRef.current) {
        try {
          const id = await criarPendencia(snap);
          pidRef.current = id;
          setPid(id);
        } catch { /* silencioso: rascunho local já foi salvo */ }
      } else {
        try {
          await atualizarFn({ data: { id: pidRef.current, status: "em_digitacao", payload: snap as unknown as Record<string, unknown> } });
        } catch { /* silencioso */ }
      }
    } finally {
      savingRef.current = false;
      if (pendingRef.current) { pendingRef.current = false; void saveToServer(); }
    }
  }

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const prev = loadLocal(initial.ident);
    if (prev) setData({ ...prev, ident: initial.ident, medidas: normalizarMedidas(prev.medidas) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    persistLocal(data);
  }, [data]);

  function patchMedidas(p: Partial<AsfTbMedidas>) {
    setData((d) => ({ ...d, medidas: { ...d.medidas, ...p } }));
  }
  function patchPeneira(i: number, p: Partial<AsfTbPeneira>) {
    setData((d) => {
      const peneiras = d.medidas.peneiras.slice();
      peneiras[i] = { ...peneiras[i], ...p };
      return { ...d, medidas: { ...d.medidas, peneiras } };
    });
  }

  async function handlePhotos(files: FileList | null) {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const { dataUrl, bytes } = await fileToCompressedDataUrl(f);
        const photo: AsfTbPhoto = { id: `p_${Math.random().toString(36).slice(2, 9)}`, dataUrl, bytes, caption: "" };
        setData((d) => ({ ...d, fotos: [...d.fotos, photo] }));
      } catch {
        toast.error("Falha ao processar imagem");
      }
    }
    queueMicrotask(saveToServer);
  }
  function removePhoto(id: string) {
    setData((d) => ({ ...d, fotos: d.fotos.filter((p) => p.id !== id) }));
    queueMicrotask(saveToServer);
  }

  const m = data.medidas;
  const betume = massaBetume(m.massaAmostra, m.massaAgregado);
  const teor = teorBetume(m.massaAmostra, m.massaAgregado);
  const granulo = useMemo(() => calcularGranulometria(m), [m]);
  const passantePorAbertura = useMemo(
    () => new Map((granulo?.linhas ?? []).map((l) => [l.aberturaMm, l.pctPassante])),
    [granulo],
  );
  const massaInicialPadrao = massaInicialDoPeneiramento({ massaInicialGranulometria: null, massaAgregado: m.massaAgregado });

  async function saveDraft() {
    persistLocal(data);
    if (!pid) {
      try {
        setPid(await criarPendencia(data));
      } catch (e: unknown) {
        toast.error("Rascunho salvo só no dispositivo: " + (e instanceof Error ? e.message : String(e)));
        return;
      }
    } else {
      try { await atualizarFn({ data: { id: pid, status: "em_digitacao", payload: data as unknown as Record<string, unknown> } }); }
      catch { /* silencia */ }
    }
    toast.success("Rascunho salvo");
  }

  async function finalize() {
    if (teor == null) {
      toast.error("Informe a massa da amostra e a do agregado recuperado (o agregado não pode passar da amostra).");
      return;
    }
    if (
      granulo &&
      !granulo.dentroDaTolerancia &&
      !window.confirm(
        `A soma das massas do peneiramento difere ${fmt(granulo.diferencaPct, 2)}% da massa inicial (a norma aceita até ${fmt(TOLERANCIA_SOMA_PCT, 1)}%). Finalizar mesmo assim?`,
      )
    ) {
      return;
    }
    persistLocal(data);
    let curPid = pid;
    if (!curPid) {
      try {
        curPid = await criarPendencia(data);
        setPid(curPid);
      } catch (e: unknown) {
        toast.error("Falha ao enviar: " + (e instanceof Error ? e.message : String(e)));
        return;
      }
    }
    try {
      const r = await atualizarFn({
        data: { id: curPid, status: "pendente", observacao: data.obs || null, payload: data as unknown as Record<string, unknown> },
      });
      if (r.guardada) {
        toast.success("Execução finalizada — guardada no aparelho; vai para a Central quando a rede voltar");
        navigate({ to: "/relatorio/digitalizacao" });
      } else {
        toast.success("Execução finalizada — enviada para Digitação & Emissões");
        navigate({ to: "/relatorio/pendentes", search: { tab: "enviados" } });
      }
    } catch (e: unknown) {
      toast.error("Falha ao gravar: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <Badge variant="secondary" className="ml-auto">ASF.TB · Teor de Betume</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Beaker className="h-4 w-4 text-primary" />
            {data.ident.amostraCodigo || "—"} · OS {data.ident.os || "—"}
          </CardTitle>
          <CardDescription className="text-xs">
            {data.ident.servicoNome ? `Serviço/Estaca ${data.ident.servicoNome}` : "Identificação do QR"}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Beaker className="h-4 w-4 text-primary" /> Teor de betume
          </CardTitle>
          <CardDescription className="text-xs">
            DNER-ME 053/94 · extrator centrífugo, amostra de cerca de 1 000 g. Agregado seco em estufa até constância de peso.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <FieldNum label="Massa da amostra total [g]" value={m.massaAmostra} onChange={(v) => patchMedidas({ massaAmostra: v })} onCommit={saveToServer} />
            <FieldNum label="Agregado recuperado seco [g]" value={m.massaAgregado} onChange={(v) => patchMedidas({ massaAgregado: v })} onCommit={saveToServer} />
          </div>
          <div>
            <Label className="text-xs">Solvente</Label>
            <Input
              list="asf-tb-solventes"
              value={m.solvente}
              onChange={(e) => patchMedidas({ solvente: e.target.value })}
              onBlur={() => saveToServer()}
            />
            <datalist id="asf-tb-solventes">
              {SOLVENTES_SUGERIDOS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          {teor != null ? (
            <Badge variant="secondary" className="text-[11px]">
              Betume extraído: {fmt(betume, 1)} g · Teor de betume: {fmt(teor, 2)}%
            </Badge>
          ) : m.massaAmostra != null && m.massaAgregado != null ? (
            <Badge variant="destructive" className="text-[11px]">O agregado recuperado não pode passar da massa da amostra</Badge>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" /> Granulometria do agregado extraído
          </CardTitle>
          <CardDescription className="text-xs">
            DNIT 412/2025-ME · massa retida em cada peneira. Desmarque as peneiras que não foram usadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <FieldNum
              label="Massa seca inicial [g]"
              value={m.massaInicialGranulometria}
              placeholder={massaInicialPadrao != null ? `${fmt(massaInicialPadrao, 1)} (agregado)` : undefined}
              onChange={(v) => patchMedidas({ massaInicialGranulometria: v })}
              onCommit={saveToServer}
            />
            <FieldNum
              label="Após lavagem na 0,075 [g] (se lavou)"
              value={m.massaAposLavagem}
              onChange={(v) => patchMedidas({ massaAposLavagem: v })}
              onCommit={saveToServer}
            />
          </div>

          <div className="rounded-md border divide-y">
            {m.peneiras.map((p, i) => {
              const passante = passantePorAbertura.get(p.aberturaMm);
              return (
                <div key={p.aberturaMm} className={`flex items-center gap-2 px-2 py-1.5 ${p.ativa ? "" : "opacity-50"}`}>
                  <Checkbox
                    checked={p.ativa}
                    onCheckedChange={(v) => { patchPeneira(i, { ativa: v === true }); queueMicrotask(saveToServer); }}
                    aria-label={`Usar a peneira ${p.nome}`}
                  />
                  <div className="w-20 shrink-0 text-xs leading-tight">
                    <div className="font-medium">{p.nome}</div>
                    <div className="text-muted-foreground">{formatarAbertura(p.aberturaMm)} mm</div>
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    disabled={!p.ativa}
                    placeholder="retida [g]"
                    value={p.retida ?? ""}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => saveToServer()}
                    onChange={(e) => {
                      const raw = e.target.value;
                      patchPeneira(i, { retida: raw === "" ? null : Number(raw.replace(",", ".")) });
                    }}
                    className="h-9 flex-1 min-w-0"
                  />
                  <div className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">
                    {p.ativa && passante != null ? `${fmt(passante, 1)}%` : ""}
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="w-4 shrink-0" />
              <div className="w-20 shrink-0 text-xs font-medium">Fundo</div>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="massa [g]"
                value={m.fundo ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={() => saveToServer()}
                onChange={(e) => {
                  const raw = e.target.value;
                  patchMedidas({ fundo: raw === "" ? null : Number(raw.replace(",", ".")) });
                }}
                className="h-9 flex-1 min-w-0"
              />
              <div className="w-14 shrink-0" />
            </div>
          </div>

          {granulo && (
            <Badge variant={granulo.dentroDaTolerancia ? "secondary" : "destructive"} className="text-[11px]">
              Soma {fmt(granulo.somaMassas, 1)} g de {fmt(granulo.massaInicial, 1)} g · diferença {fmt(granulo.diferencaPct, 2)}%
              {granulo.dentroDaTolerancia ? " (dentro de 0,3%)" : " — acima de 0,3%"}
            </Badge>
          )}
        </CardContent>
      </Card>

      <PhotoBlock
        title="Fotos do ensaio"
        description="Registre a amostra, a extração e o agregado nas peneiras."
        photos={data.fotos}
        onAdd={handlePhotos}
        onRemove={removePhoto}
      />

      {officePhotos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" /> Já no relatório (escritório)
            </CardTitle>
            <CardDescription className="text-xs">
              Adicionadas por lá — só pra conferência aqui, não editáveis nesta tela.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {officePhotos.map((p) => (
                <div key={p.id} className="relative rounded-md border overflow-hidden">
                  <div className="aspect-[3/4] bg-black/5 flex items-center justify-center">
                    <img src={p.url || p.dataUrl} alt="" className="max-h-full max-w-full object-contain" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Observações</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={data.obs}
            onChange={(e) => setData((d) => ({ ...d, obs: e.target.value }))}
            onBlur={() => saveToServer()}
            rows={3}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={saveDraft}>
          <Save className="h-4 w-4 mr-2" /> Salvar rascunho
        </Button>
        <Button className="ml-auto" onClick={finalize}>
          <CheckCircle2 className="h-4 w-4 mr-2" /> Finalizar execução
        </Button>
      </div>
    </div>
  );
}

function FieldNum({
  label, value, onChange, onCommit, placeholder,
}: { label: string; value: number | null; onChange: (v: number | null) => void; onCommit?: () => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        placeholder={placeholder}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => onCommit?.()}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? null : Number(raw.replace(",", ".")));
        }}
      />
    </div>
  );
}

// -------- Loader por pendenciaId (usado na rota) --------
export function AsfTbPendenciaEditor({ pendenciaId, onBack }: { pendenciaId: string | null; onBack: () => void }) {
  const snapshotFn = useServerFn(getLabEnsaioSnapshot);
  // A do servidor ou, sem rede, a guardada no aparelho (lib/fila-offline.ts).
  const { pendencia, carregando } = usePendenciaDaBancada(pendenciaId, "asf_tb_scan_pendencias");
  const inicial = pendencia?.payload as unknown as Partial<AsfTbFieldPayload> | undefined;
  const linked = inicial?._linkedEnsaio;
  const { data: officeSnapshot } = useQuery({
    queryKey: ["asf_tb_linked_ensaio_photos", linked?.osId, linked?.amostraId, linked?.ensaioId],
    queryFn: () => snapshotFn({ data: { scopeId: `os/${linked!.osId}/amostra/${linked!.amostraId}/ensaio/${linked!.ensaioId}` } }),
    enabled: !!linked,
    staleTime: 15_000,
  });
  const officePhotos: Photo[] = officeSnapshot?.ensaio?.photos ?? [];

  if (pendenciaId && !pendencia) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        {carregando ? "Carregando pendência…" : "Pendência não encontrada — sem rede e sem cópia neste aparelho."}
      </div>
    );
  }
  const safe: AsfTbFieldPayload = {
    ident: inicial?.ident ?? {
      os: pendencia?.os ?? "",
      amostraCodigo: pendencia?.amostra ?? "",
      tipoEnsaioNome: ASF_TB_NOME,
      tipoEnsaioCodigo: ASF_TB_CODIGO,
    },
    medidas: normalizarMedidas(inicial?.medidas),
    fotos: Array.isArray(inicial?.fotos) ? inicial.fotos : [],
    obs: inicial?.obs ?? "",
    _linkedEnsaio: linked,
  };
  return <AsfTbWorkspace initial={safe} pendenciaId={pendenciaId} onBack={onBack} officePhotos={officePhotos} />;
}

// -------- Bloco simples de fotos --------
function PhotoBlock({
  title,
  description,
  photos,
  onAdd,
  onRemove,
}: {
  title: string;
  description?: string;
  photos: AsfTbPhoto[];
  onAdd: (files: FileList | null) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            {title}
          </span>
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
            <ImagePlus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => { onAdd(e.target.files); if (inputRef.current) inputRef.current.value = ""; }}
          />
        </CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        {photos.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma foto — toque em "Adicionar" para incluir.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="relative rounded-md border overflow-hidden">
                <div className="aspect-[3/4] bg-black/5 flex items-center justify-center">
                  <img src={p.dataUrl} alt="" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="flex items-center justify-between p-1 text-[10px] text-muted-foreground">
                  <span>{formatBytes(p.bytes)}</span>
                  <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive" onClick={() => onRemove(p.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
