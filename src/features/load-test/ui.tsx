/**
 * Digitalização de Point Load Test (ASTM D5731-16 / ISRM 2016). Coleta de
 * dados de campo na bancada, logo após a leitura do QR. Mesmo padrão de
 * `compressao-simples/ui.tsx`, simplificado: sem cápsula/índice físico (não
 * se aplica a rocha) e sem curva — só altura, diâmetro, carga e tipo do
 * teste por determinação. Nº de determinações é livre (não há limite de 10 —
 * isso era só o tamanho fixo da planilha de origem).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, CheckCircle2, Plus, Trash2, Gauge, ImagePlus, Camera } from "lucide-react";
import { fileToCompressedDataUrl, formatBytes } from "@/features/lab/photos";
import { atualizarPendenciaOuGuardar, criarPendenciaOuGuardar, usePendenciaDaBancada } from "@/lib/fila-offline";
import { getLabEnsaioSnapshot } from "@/lib/lab-ensaios.functions";
import type { Photo } from "@/features/lab/types";
import { calcularLinha, isPLTTag } from "./calc";
import { newPLTDeterminacao, type PLTDeterminacao, type PLTOrientacao, type PLTTipoTeste } from "./types";

// -------- Tipos do payload de campo (Point Load Test) --------
export interface PLTPhoto {
  id: string;
  dataUrl: string;
  bytes: number;
  /** A qual determinação esta foto pertence — "" = geral/não vinculada. */
  determinacaoNumero?: number;
  caption?: string;
}

export interface PLTFieldPayload {
  ident: {
    os: string;
    amostraCodigo: string;
    servicoNome?: string;
    tipoEnsaioNome: string;
    tipoEnsaioCodigo: string; // "LOAD.TEST"
    qrcodeEnsaioLabId?: number;
    ensaioId?: number;
    contratoId?: number;
    servicoId?: number;
    ensaioTagId?: number;
    furo?: string;
    profundidade?: string;
    operadorNome?: string;
  };
  determinacoes: PLTDeterminacao[];
  fotos: PLTPhoto[];
  obs: string;
  _linkedEnsaio?: { osId: string; amostraId: string; ensaioId: string };
}

export function emptyPLTPayload(ident: PLTFieldPayload["ident"]): PLTFieldPayload {
  return {
    ident,
    determinacoes: [newPLTDeterminacao(1)],
    fotos: [],
    obs: "",
  };
}

function draftKey(ident: PLTFieldPayload["ident"]) {
  return `load-test-scan://${ident.os}/${ident.amostraCodigo}`;
}
function persistLocal(data: PLTFieldPayload) {
  try {
    window.localStorage.setItem(draftKey(data.ident), JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch { /* ignora quota */ }
}
function loadLocal(ident: PLTFieldPayload["ident"]): PLTFieldPayload | null {
  try {
    const raw = window.localStorage.getItem(draftKey(ident));
    if (!raw) return null;
    const p = JSON.parse(raw) as PLTFieldPayload;
    if (!p?.ident || !Array.isArray(p?.determinacoes)) return null;
    return p;
  } catch { return null; }
}

// -------- Dispatch (chamado pelo registro genérico digit-scan/registry.ts) --------
function toNumOrUndef(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function extractFuro(p: Record<string, unknown>): string {
  const raw = p.furo_nome ?? p.furo ?? p.sondagem_nome ?? p.sondagem ?? p.furo_numero ?? "";
  return String(raw ?? "").trim();
}
function extractProfundidade(p: Record<string, unknown>): string {
  const single = p.profundidade;
  if (single != null && String(single).trim() !== "") return String(single).trim();
  const ini = p.profundidade_inicial ?? p.prof_ini;
  const fim = p.profundidade_final ?? p.prof_fim;
  if (ini != null && fim != null) return `${String(ini).trim()} – ${String(fim).trim()}`;
  if (ini != null) return String(ini).trim();
  if (fim != null) return String(fim).trim();
  return "";
}

export async function dispatchLoadTest(
  payload: Record<string, unknown>,
): Promise<{ to: string; search: { pid: string } }> {
  const os = String(payload.contrato_nome ?? "").trim();
  const amostraCodigo = String(payload.amostra_sigla ?? "").trim();
  const servicoRaw = payload.servico_nome;
  const servicoNome = servicoRaw != null ? String(servicoRaw).trim() : undefined;
  const ident: PLTFieldPayload["ident"] = {
    os,
    amostraCodigo,
    servicoNome,
    tipoEnsaioNome: "Point Load Test",
    tipoEnsaioCodigo: "LOAD.TEST",
    qrcodeEnsaioLabId: toNumOrUndef(payload.qrcode_ensaio_lab_id),
    ensaioId: toNumOrUndef(payload.ensaio_id),
    contratoId: toNumOrUndef(payload.contrato_id),
    servicoId: toNumOrUndef(payload.servico_id),
    ensaioTagId: toNumOrUndef(payload.ensaio_tag_id),
    furo: extractFuro(payload) || undefined,
    profundidade: extractProfundidade(payload) || undefined,
    operadorNome: (payload._operador_logado_nome as string | undefined)?.trim() || undefined,
  };
  const r = await criarPendenciaOuGuardar({
    data: {
      os,
      amostra: amostraCodigo || null,
      ensaio: ident.tipoEnsaioNome,
      tipo_ensaio: "load-test",
      origem: "digitalizacao",
      payload: emptyPLTPayload(ident) as unknown as Record<string, unknown>,
    },
  });
  return { to: "/relatorio/digitalizacao/load-test", search: { pid: r.id } };
}

export { isPLTTag };

const TIPO_LABEL: Record<PLTTipoTeste, string> = {
  d: "Diametral",
  a: "Axial",
  b: "Bloco",
  i: "Amostra irregular",
};
const ORIENTACAO_LABEL: Record<PLTOrientacao, string> = {
  "": "—",
  perpendicular: "Perpendicular ao plano de fraqueza",
  paralelo: "Paralelo ao plano de fraqueza",
};

// -------- Editor mobile-first (usado após leitura do QR) --------
export function LoadTestWorkspace({
  initial,
  pendenciaId,
  onBack,
  officePhotos = [],
}: {
  initial: PLTFieldPayload;
  pendenciaId: string | null;
  onBack: () => void;
  /** Fotos já adicionadas no relatório do escritório — só leitura aqui. */
  officePhotos?: Photo[];
}) {
  const [data, setData] = useState<PLTFieldPayload>(initial);
  const [pid, setPid] = useState<string | null>(pendenciaId);
  const [activeDet, setActiveDet] = useState(0);
  const criarFn = criarPendenciaOuGuardar;
  const atualizarFn = atualizarPendenciaOuGuardar;
  const loadedRef = useRef(false);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const pidRef = useRef<string | null>(pid);
  useEffect(() => { pidRef.current = pid; }, [pid]);

  async function saveToServer() {
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true;
    try {
      const snap = dataRef.current;
      const payload = snap as unknown as Record<string, unknown>;
      if (!pidRef.current) {
        try {
          const r = await criarFn({
            data: { os: snap.ident.os, amostra: snap.ident.amostraCodigo || null, ensaio: snap.ident.tipoEnsaioNome, tipo_ensaio: "load-test", origem: "digitalizacao", payload },
          });
          pidRef.current = r.id;
          setPid(r.id);
        } catch { /* silencioso: rascunho local já foi salvo */ }
      } else {
        try { await atualizarFn({ data: { id: pidRef.current, status: "em_digitacao", payload } }); }
        catch { /* silencioso */ }
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
    if (prev) setData({ ...prev, ident: initial.ident });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { persistLocal(data); }, [data]);
  useEffect(() => {
    if (activeDet >= data.determinacoes.length) setActiveDet(Math.max(0, data.determinacoes.length - 1));
  }, [data.determinacoes.length, activeDet]);

  const det = data.determinacoes[activeDet] ?? data.determinacoes[0];

  function updateDet(patch: Partial<PLTDeterminacao>) {
    setData((d) => ({
      ...d,
      determinacoes: d.determinacoes.map((c, i) => (i === activeDet ? { ...c, ...patch } : c)),
    }));
  }
  function addDet() {
    setData((d) => ({ ...d, determinacoes: [...d.determinacoes, newPLTDeterminacao(d.determinacoes.length + 1)] }));
    setActiveDet(data.determinacoes.length);
    queueMicrotask(saveToServer);
  }
  function removeDet(idx: number) {
    if (data.determinacoes.length <= 1) { toast.error("Deve haver ao menos uma determinação"); return; }
    setData((d) => ({ ...d, determinacoes: d.determinacoes.filter((_, i) => i !== idx) }));
    queueMicrotask(saveToServer);
  }

  async function handlePhotos(files: FileList | null) {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const { dataUrl, bytes } = await fileToCompressedDataUrl(f);
        const photo: PLTPhoto = {
          id: `p_${Math.random().toString(36).slice(2, 9)}`, dataUrl, bytes,
          determinacaoNumero: det.numero, caption: "",
        };
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

  async function persistAndGetPid(): Promise<string | null> {
    persistLocal(data);
    const payload = data as unknown as Record<string, unknown>;
    if (pid) {
      try { await atualizarFn({ data: { id: pid, status: "em_digitacao", payload } }); } catch { /* silencia */ }
      return pid;
    }
    try {
      const r = await criarFn({
        data: { os: data.ident.os, amostra: data.ident.amostraCodigo || null, ensaio: data.ident.tipoEnsaioNome, tipo_ensaio: "load-test", origem: "digitalizacao", payload },
      });
      setPid(r.id);
      return r.id;
    } catch (e: unknown) {
      toast.error("Rascunho salvo só no dispositivo: " + (e instanceof Error ? e.message : String(e)));
      return null;
    }
  }

  async function saveDraft() {
    const ok = await persistAndGetPid();
    if (ok) toast.success("Rascunho salvo");
  }

  async function finalize() {
    persistLocal(data);
    const payload = data as unknown as Record<string, unknown>;
    let curPid = pid;
    if (!curPid) {
      try {
        const r = await criarFn({
          data: { os: data.ident.os, amostra: data.ident.amostraCodigo || null, ensaio: data.ident.tipoEnsaioNome, tipo_ensaio: "load-test", origem: "digitalizacao", payload },
        });
        curPid = r.id;
        setPid(r.id);
      } catch (e: unknown) {
        toast.error("Falha ao enviar: " + (e instanceof Error ? e.message : String(e)));
        return;
      }
    }
    try {
      const r = await atualizarFn({ data: { id: curPid!, status: "pendente", observacao: data.obs || null, payload } });
      toast.success(
        r.guardada
          ? "Execução finalizada — guardada no aparelho; vai para a Central quando a rede voltar"
          : "Execução finalizada — enviada para Digitação & Emissões",
      );
      onBack();
    } catch (e: unknown) {
      toast.error("Falha ao gravar: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  const fotosDaDeterminacao = useMemo(
    () => data.fotos.filter((p) => p.determinacaoNumero === det?.numero),
    [data.fotos, det?.numero],
  );
  const resultado = det ? calcularLinha(det) : null;

  if (!det) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>Voltar</Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {data.ident.tipoEnsaioCodigo} · Point Load Test
        </span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            {data.ident.amostraCodigo || "—"} · OS {data.ident.os || "—"}
          </CardTitle>
          <CardDescription className="text-xs">
            {data.ident.servicoNome ? `Serviço/Estaca ${data.ident.servicoNome}` : "Identificação do QR"}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex items-center gap-2">
        <Tabs value={String(activeDet)} onValueChange={(v) => setActiveDet(Number(v))} className="flex-1">
          <TabsList className="flex-wrap h-auto">
            {data.determinacoes.map((d, i) => (
              <TabsTrigger key={d.id} value={String(i)} className="text-xs">
                CP {d.numero}{d.excluidaDaMedia ? "*" : ""}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button size="sm" variant="outline" onClick={addDet}><Plus className="h-3.5 w-3.5 mr-1" /> CP</Button>
        {data.determinacoes.length > 1 && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeDet(activeDet)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">CP {det.numero} — ensaio</CardTitle>
          <CardDescription className="text-xs">
            d = diametral · a = axial · b = bloco · i = amostra irregular.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tipo do teste</Label>
              <Select value={det.tipo} onValueChange={(v) => { updateDet({ tipo: v as PLTTipoTeste }); queueMicrotask(saveToServer); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABEL) as PLTTipoTeste[]).map((t) => (
                    <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Orientação</Label>
              <Select value={det.orientacao} onValueChange={(v) => { updateDet({ orientacao: v as PLTOrientacao }); queueMicrotask(saveToServer); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ORIENTACAO_LABEL) as PLTOrientacao[]).map((o) => (
                    <SelectItem key={o || "none"} value={o}>{ORIENTACAO_LABEL[o]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FieldNum label="Altura w (mm)" value={det.alturaMm} onChange={(v) => updateDet({ alturaMm: v })} onCommit={saveToServer} />
            <FieldNum label="Diâmetro D (mm)" value={det.diametroMm} onChange={(v) => updateDet({ diametroMm: v })} onCommit={saveToServer} />
            <FieldNum label="Carga P (kN)" value={det.cargaKn} onChange={(v) => updateDet({ cargaKn: v })} onCommit={saveToServer} />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={det.excluidaDaMedia} onCheckedChange={(v) => { updateDet({ excluidaDaMedia: !!v }); queueMicrotask(saveToServer); }} />
            Ruptura não válida — excluir esta determinação das médias
          </label>
          {resultado && (
            <div className="grid grid-cols-2 gap-2 rounded border bg-muted/30 p-2 text-xs sm:grid-cols-4">
              <div><span className="text-muted-foreground">Is</span><br /><b>{resultado.is != null ? resultado.is.toFixed(2) : "—"}</b> MPa</div>
              <div><span className="text-muted-foreground">Is(50)</span><br /><b>{resultado.is50 != null ? resultado.is50.toFixed(2) : "—"}</b> MPa</div>
              <div><span className="text-muted-foreground">Fator F</span><br /><b>{resultado.fatorF != null ? resultado.fatorF.toFixed(3) : "—"}</b></div>
              <div><span className="text-muted-foreground">Res. estimada</span><br /><b>{resultado.resistencia != null ? resultado.resistencia.toFixed(1) : "—"}</b> MPa</div>
            </div>
          )}
        </CardContent>
      </Card>

      <PhotoBlock title={`Fotos — CP ${det.numero}`} photos={fotosDaDeterminacao} onAdd={handlePhotos} onRemove={removePhoto} />

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
                  <div className="p-1 text-[10px] text-center text-muted-foreground">
                    {p.caption || "Registro fotográfico"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Observações</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={data.obs} onChange={(e) => setData((d) => ({ ...d, obs: e.target.value }))} onBlur={() => saveToServer()} rows={3} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={saveDraft}><Save className="h-4 w-4 mr-2" /> Salvar rascunho</Button>
        <Button className="ml-auto" onClick={finalize}><CheckCircle2 className="h-4 w-4 mr-2" /> Finalizar execução</Button>
      </div>
    </div>
  );
}

function FieldNum({
  label, value, onChange, onCommit, disabled,
}: { label: string; value: number | null; onChange: (v: number | null) => void; onCommit?: () => void; disabled?: boolean }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number" inputMode="decimal" value={value ?? ""} disabled={disabled}
        onFocus={(e) => e.currentTarget.select()} onBlur={() => onCommit?.()}
        onChange={(e) => { const raw = e.target.value; onChange(raw === "" ? null : Number(raw.replace(",", "."))); }}
      />
    </div>
  );
}

// -------- Loader por pendenciaId (usado na rota) --------
export function LoadTestPendenciaEditor({ pendenciaId, onBack }: { pendenciaId: string | null; onBack: () => void }) {
  const snapshotFn = useServerFn(getLabEnsaioSnapshot);
  const { pendencia, carregando } = usePendenciaDaBancada(pendenciaId, "load_test_scan_pendencias");
  const linked = (pendencia?.payload as unknown as PLTFieldPayload | undefined)?._linkedEnsaio;
  const { data: officeSnapshot } = useQuery({
    queryKey: ["load_test_linked_ensaio_photos", linked?.osId, linked?.amostraId, linked?.ensaioId],
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
  const fallbackIdent: PLTFieldPayload["ident"] = {
    os: pendencia?.os ?? "",
    amostraCodigo: pendencia?.amostra ?? "",
    tipoEnsaioNome: "Point Load Test",
    tipoEnsaioCodigo: "LOAD.TEST",
  };
  const initial: PLTFieldPayload = pendencia?.payload
    ? (pendencia.payload as unknown as PLTFieldPayload)
    : emptyPLTPayload(fallbackIdent);
  const safe: PLTFieldPayload = {
    ident: initial.ident ?? fallbackIdent,
    determinacoes: Array.isArray(initial.determinacoes) && initial.determinacoes.length
      ? initial.determinacoes
      : [newPLTDeterminacao(1)],
    fotos: Array.isArray(initial.fotos) ? initial.fotos : [],
    obs: initial.obs ?? "",
  };
  return <LoadTestWorkspace initial={safe} pendenciaId={pendenciaId} onBack={onBack} officePhotos={officePhotos} />;
}

// -------- Bloco simples de fotos --------
function PhotoBlock({
  title, photos, onAdd, onRemove,
}: { title: string; photos: PLTPhoto[]; onAdd: (files: FileList | null) => void; onRemove: (id: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2"><Camera className="h-4 w-4 text-primary" />{title}</span>
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}><ImagePlus className="h-3.5 w-3.5 mr-1" /> Adicionar</Button>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
            onChange={(e) => { onAdd(e.target.files); if (inputRef.current) inputRef.current.value = ""; }} />
        </CardTitle>
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
                  <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive" onClick={() => onRemove(p.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
