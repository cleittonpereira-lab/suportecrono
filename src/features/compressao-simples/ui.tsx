/**
 * Digitalização de Compressão Simples — solo (NBR 12770), rocha (NBR
 * 15845-5) e dosagem/solo-cimento (NBR 12025). Coleta de dados de campo na
 * bancada, logo após a leitura do QR. Mesmo padrão de `perm-v/ui.tsx`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Save, CheckCircle2, Plus, Trash2, Gauge,
  ImagePlus, Camera, Upload,
} from "lucide-react";
import { fileToCompressedDataUrl, formatBytes } from "@/features/lab/photos";
import {
  atualizarPendenciaDigitacao,
  criarPendenciaDigitacao,
  listPendenciasDigitacao,
  type PendenciaDigitacao,
} from "@/lib/lab-pendencias.functions";
import { capsulaUmidadePct, parseCompressaoSimplesTag } from "./calc";
import type { CsAmostraTipo, CsCapsula, CsCargaUnidade, CsCurvaPonto, CsResultadoModo } from "./types";
import { newCsCapsula } from "./types";
import { CsCurveImportDialog } from "./components/CsCurveImportDialog";

// -------- Tipos do payload de campo (Compressão Simples) --------
export interface CsPhoto {
  id: string;
  dataUrl: string;
  bytes: number;
  fase: "antes" | "depois";
  caption?: string;
}

export interface CsFieldPayload {
  ident: {
    os: string;
    amostraCodigo: string;
    servicoNome?: string;
    tipoEnsaioNome: string;
    tipoEnsaioCodigo: string; // "COMP.A" | "COMP.R" | "COMP.S"
    qrcodeEnsaioLabId?: number;
    ensaioId?: number;
    contratoId?: number;
    servicoId?: number;
    ensaioTagId?: number;
  };
  amostraTipo: CsAmostraTipo;
  resultadoModo: CsResultadoModo;
  idadeCuraDias: number | null;
  alturas: number[];
  diametros: number[];
  massaInicial: number | null;
  capsulas: CsCapsula[];
  massaEspecificaGraos: number | null;
  picoCarga: number | null;
  picoCargaUnidade: CsCargaUnidade;
  curva: CsCurvaPonto[];
  fotos: CsPhoto[];
  obs: string;
}

export function emptyCsPayload(
  ident: CsFieldPayload["ident"],
  amostraTipo: CsAmostraTipo = "solo",
  idadeCuraDias: number | null = null,
): CsFieldPayload {
  return {
    ident,
    amostraTipo,
    resultadoModo: "simplificado",
    idadeCuraDias,
    alturas: [0, 0, 0, 0],
    diametros: [0, 0, 0, 0],
    massaInicial: null,
    capsulas: [newCsCapsula(), newCsCapsula(), newCsCapsula()],
    massaEspecificaGraos: 2.65,
    picoCarga: null,
    picoCargaUnidade: "kN",
    curva: [],
    fotos: [],
    obs: "",
  };
}

function draftKey(ident: CsFieldPayload["ident"]) {
  return `compressao-simples-scan://${ident.os}/${ident.amostraCodigo}`;
}
function persistLocal(data: CsFieldPayload) {
  try {
    window.localStorage.setItem(draftKey(data.ident), JSON.stringify({ ...data, savedAt: new Date().toISOString() }));
  } catch { /* ignora quota */ }
}
function loadLocal(ident: CsFieldPayload["ident"]): CsFieldPayload | null {
  try {
    const raw = window.localStorage.getItem(draftKey(ident));
    if (!raw) return null;
    const p = JSON.parse(raw) as CsFieldPayload;
    if (!p?.ident || !Array.isArray(p?.alturas)) return null;
    return p;
  } catch { return null; }
}

// -------- Dispatch (chamado pelo registro genérico digit-scan/registry.ts) --------
function toNumOrUndef(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

const AMOSTRA_TIPO_LABEL: Record<CsAmostraTipo, string> = {
  solo: "Solo",
  rocha: "Rocha",
  dosagem: "Dosagem",
};

export async function dispatchCompressaoSimples(
  payload: Record<string, unknown>,
): Promise<{ to: string; search: { pid: string } }> {
  const os = String(payload.contrato_nome ?? "").trim();
  const amostraCodigo = String(payload.amostra_sigla ?? "").trim();
  const servicoRaw = payload.servico_nome;
  const servicoNome = servicoRaw != null ? String(servicoRaw).trim() : undefined;
  // A tag do QR já diz solo/rocha/dosagem (e a idade de cura, se dosagem) —
  // pré-preenche o formulário, mas o operador ainda confere/edita na tela.
  const parsedTag = parseCompressaoSimplesTag(servicoNome) ?? parseCompressaoSimplesTag(payload.ensaio_tag_codigo as string | undefined);
  const amostraTipo = parsedTag?.amostraTipo ?? "solo";
  const ident: CsFieldPayload["ident"] = {
    os,
    amostraCodigo,
    servicoNome,
    tipoEnsaioNome: `Compressão Simples — ${AMOSTRA_TIPO_LABEL[amostraTipo]}`,
    tipoEnsaioCodigo: amostraTipo === "rocha" ? "COMP.R" : amostraTipo === "dosagem" ? "COMP.S" : "COMP.A",
    qrcodeEnsaioLabId: toNumOrUndef(payload.qrcode_ensaio_lab_id),
    ensaioId: toNumOrUndef(payload.ensaio_id),
    contratoId: toNumOrUndef(payload.contrato_id),
    servicoId: toNumOrUndef(payload.servico_id),
    ensaioTagId: toNumOrUndef(payload.ensaio_tag_id),
  };
  const r = await criarPendenciaDigitacao({
    data: {
      os,
      amostra: amostraCodigo || null,
      ensaio: ident.tipoEnsaioNome,
      tipo_ensaio: "compressao-simples",
      origem: "digitalizacao",
      payload: emptyCsPayload(ident, amostraTipo, parsedTag?.idadeCuraDias ?? null) as unknown as Record<string, unknown>,
    },
  });
  return { to: "/relatorio/digitalizacao/compressao-simples", search: { pid: r.id } };
}

// -------- Editor mobile-first (usado após leitura do QR) --------
export function CompressaoSimplesWorkspace({
  initial,
  pendenciaId,
  onBack,
}: {
  initial: CsFieldPayload;
  pendenciaId: string | null;
  onBack: () => void;
}) {
  const [data, setData] = useState<CsFieldPayload>(initial);
  const [pid, setPid] = useState<string | null>(pendenciaId);
  const [curveDialogOpen, setCurveDialogOpen] = useState(false);
  const criarFn = useServerFn(criarPendenciaDigitacao);
  const atualizarFn = useServerFn(atualizarPendenciaDigitacao);
  const loadedRef = useRef(false);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const pidRef = useRef<string | null>(pid);
  useEffect(() => { pidRef.current = pid; }, [pid]);

  const isSolo = data.amostraTipo === "solo";
  const isRocha = data.amostraTipo === "rocha";
  const isDosagem = data.amostraTipo === "dosagem";
  const comIndicesFisicos = isSolo || isDosagem;
  const isCompleto = comIndicesFisicos && data.resultadoModo === "completo";

  async function saveToServer() {
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true;
    try {
      const snap = dataRef.current;
      const payload = snap as unknown as Record<string, unknown>;
      if (!pidRef.current) {
        try {
          const r = await criarFn({
            data: { os: snap.ident.os, amostra: snap.ident.amostraCodigo || null, ensaio: snap.ident.tipoEnsaioNome, tipo_ensaio: "compressao-simples", origem: "digitalizacao", payload },
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

  function updateCapsula(i: number, p: Partial<CsCapsula>) {
    setData((d) => {
      const capsulas = d.capsulas.slice();
      capsulas[i] = { ...capsulas[i], ...p };
      return { ...d, capsulas };
    });
    queueMicrotask(saveToServer);
  }
  function updateAltura(i: number, v: number) {
    setData((d) => { const alturas = d.alturas.slice(); alturas[i] = v; return { ...d, alturas }; });
  }
  function updateDiametro(i: number, v: number) {
    setData((d) => { const diametros = d.diametros.slice(); diametros[i] = v; return { ...d, diametros }; });
  }

  async function handlePhotos(fase: "antes" | "depois", files: FileList | null) {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const { dataUrl, bytes } = await fileToCompressedDataUrl(f);
        const photo: CsPhoto = { id: `p_${Math.random().toString(36).slice(2, 9)}`, dataUrl, bytes, fase, caption: "" };
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
        data: { os: data.ident.os, amostra: data.ident.amostraCodigo || null, ensaio: data.ident.tipoEnsaioNome, tipo_ensaio: "compressao-simples", origem: "digitalizacao", payload },
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
          data: { os: data.ident.os, amostra: data.ident.amostraCodigo || null, ensaio: data.ident.tipoEnsaioNome, tipo_ensaio: "compressao-simples", origem: "digitalizacao", payload },
        });
        curPid = r.id;
        setPid(r.id);
      } catch (e: unknown) {
        toast.error("Falha ao enviar: " + (e instanceof Error ? e.message : String(e)));
        return;
      }
    }
    try {
      await atualizarFn({ data: { id: curPid!, status: "pendente", observacao: data.obs || null, payload } });
      toast.success("Execução finalizada — enviada para Digitação & Emissões");
      onBack();
    } catch (e: unknown) {
      toast.error("Falha ao gravar: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  const fotosAntes = data.fotos.filter((p) => p.fase === "antes");
  const fotosDepois = data.fotos.filter((p) => p.fase === "depois");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>Voltar</Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {data.ident.tipoEnsaioCodigo} · Compressão Simples
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
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Compressão simples em</Label>
            <Select value={data.amostraTipo} onValueChange={(v) => { setData((d) => ({ ...d, amostraTipo: v as CsAmostraTipo })); queueMicrotask(saveToServer); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solo">Solo</SelectItem>
                <SelectItem value="rocha">Rocha</SelectItem>
                <SelectItem value="dosagem">Dosagem (solo-cimento)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {comIndicesFisicos && (
            <div>
              <Label className="text-xs">Resultado</Label>
              <Select value={data.resultadoModo} onValueChange={(v) => { setData((d) => ({ ...d, resultadoModo: v as CsResultadoModo })); queueMicrotask(saveToServer); }}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simplificado">Simplificado (só o pico)</SelectItem>
                  <SelectItem value="completo">Completo (curva tensão x deformação)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {isDosagem && (
            <FieldNum label="Idade de cura (dias)" value={data.idadeCuraDias} onChange={(v) => setData((d) => ({ ...d, idadeCuraDias: v }))} onCommit={saveToServer} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Corpo de prova — dimensões e massa</CardTitle>
          <CardDescription className="text-xs">4 leituras de altura e 4 de diâmetro (cm).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {data.alturas.map((v, i) => (
              <div key={i}>
                <Label className="text-[10px]">Altura {i + 1} (cm)</Label>
                <Input type="number" inputMode="decimal" className="h-8 text-xs" value={v || ""} onFocus={(e) => e.currentTarget.select()} onBlur={saveToServer}
                  onChange={(e) => updateAltura(i, Number(e.target.value.replace(",", ".")) || 0)} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {data.diametros.map((v, i) => (
              <div key={i}>
                <Label className="text-[10px]">Diâmetro {i + 1} (cm)</Label>
                <Input type="number" inputMode="decimal" className="h-8 text-xs" value={v || ""} onFocus={(e) => e.currentTarget.select()} onBlur={saveToServer}
                  onChange={(e) => updateDiametro(i, Number(e.target.value.replace(",", ".")) || 0)} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldNum label="Massa do corpo de prova (g)" value={data.massaInicial} onChange={(v) => setData((d) => ({ ...d, massaInicial: v }))} onCommit={saveToServer} />
            {comIndicesFisicos && (
              <FieldNum label="Massa específica dos grãos — Gs (g/cm³)" value={data.massaEspecificaGraos} onChange={(v) => setData((d) => ({ ...d, massaEspecificaGraos: v }))} onCommit={saveToServer} />
            )}
          </div>
        </CardContent>
      </Card>

      {comIndicesFisicos && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cápsulas de umidade</CardTitle>
            <CardDescription className="text-xs">3 determinações, mesmo padrão do Triaxial CID/PERM.V.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full border-collapse text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="border p-1.5 text-left">Determinação</th>
                  {data.capsulas.map((_, i) => <th key={i} className="border p-1.5 text-center w-24">Cápsula {i + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border p-1.5 font-medium">Nº Cápsula</td>
                  {data.capsulas.map((c, i) => (
                    <td key={i} className="border p-1"><Input className="h-7 text-xs text-center" value={c.numero ?? ""} onChange={(e) => updateCapsula(i, { numero: e.target.value })} placeholder={`#${i + 1}`} /></td>
                  ))}
                </tr>
                <tr>
                  <td className="border p-1.5 font-medium">Tara (g)</td>
                  {data.capsulas.map((c, i) => (
                    <td key={i} className="border p-1"><Input type="number" className="h-7 text-xs text-center" value={c.tara} onChange={(e) => updateCapsula(i, { tara: Number(e.target.value.replace(",", ".")) || 0 })} /></td>
                  ))}
                </tr>
                <tr>
                  <td className="border p-1.5 font-medium">Solo Úmido + Tara (g)</td>
                  {data.capsulas.map((c, i) => (
                    <td key={i} className="border p-1"><Input type="number" className="h-7 text-xs text-center" value={c.wet} onChange={(e) => updateCapsula(i, { wet: Number(e.target.value.replace(",", ".")) || 0 })} /></td>
                  ))}
                </tr>
                <tr>
                  <td className="border p-1.5 font-medium">Solo Seco + Tara (g)</td>
                  {data.capsulas.map((c, i) => (
                    <td key={i} className="border p-1"><Input type="number" className="h-7 text-xs text-center" value={c.dry} onChange={(e) => updateCapsula(i, { dry: Number(e.target.value.replace(",", ".")) || 0 })} /></td>
                  ))}
                </tr>
                <tr className="bg-muted/30">
                  <td className="border p-1.5 font-medium">Umidade (%)</td>
                  {data.capsulas.map((c, i) => { const w = capsulaUmidadePct(c); return <td key={i} className="border p-1.5 text-center font-semibold">{w != null ? w.toFixed(2) : "—"}</td>; })}
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ruptura</CardTitle>
          <CardDescription className="text-xs">
            {isCompleto ? "Pico da curva importada abaixo." : "Pico de carga na ruptura."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isCompleto && (
            <div className="grid grid-cols-2 gap-3">
              <FieldNum label="Pico de carga na ruptura" value={data.picoCarga} onChange={(v) => setData((d) => ({ ...d, picoCarga: v }))} onCommit={saveToServer} />
              <div>
                <Label className="text-xs">Unidade</Label>
                <Select value={data.picoCargaUnidade} onValueChange={(v) => { setData((d) => ({ ...d, picoCargaUnidade: v as CsCargaUnidade })); queueMicrotask(saveToServer); }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="N">Newtons (N)</SelectItem>
                    <SelectItem value="kgf">Quilograma-força (kgf)</SelectItem>
                    <SelectItem value="kN">Quilonewtons (kN)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {isCompleto && (
            <div className="space-y-2">
              <Button size="sm" variant="outline" onClick={() => setCurveDialogOpen(true)}>
                <Upload className="h-3.5 w-3.5 mr-1" /> {data.curva.length > 0 ? "Reimportar curva" : "Importar curva"}
              </Button>
              <p className="text-xs text-muted-foreground">
                {data.curva.length > 0 ? `${data.curva.length} pontos importados.` : "Nenhuma curva importada ainda."}
              </p>
              <CsCurveImportDialog
                open={curveDialogOpen}
                onOpenChange={setCurveDialogOpen}
                onImport={(pontos) => { setData((d) => ({ ...d, curva: pontos })); queueMicrotask(saveToServer); }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <PhotoBlock title="Fotos — antes do ensaio" photos={fotosAntes} onAdd={(f) => handlePhotos("antes", f)} onRemove={removePhoto} />
      <PhotoBlock title="Fotos — após a ruptura" photos={fotosDepois} onAdd={(f) => handlePhotos("depois", f)} onRemove={removePhoto} />

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
export function CompressaoSimplesPendenciaEditor({ pendenciaId, onBack }: { pendenciaId: string | null; onBack: () => void }) {
  const listFn = useServerFn(listPendenciasDigitacao);
  const { data: pendencias = [] } = useQuery({
    queryKey: ["compressao_simples_scan_pendencias"],
    queryFn: () => listFn(),
    staleTime: 5_000,
  });
  const pendencia = useMemo(
    () => (pendencias as PendenciaDigitacao[]).find((p) => p.id === pendenciaId) ?? null,
    [pendencias, pendenciaId],
  );
  if (pendenciaId && !pendencia) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Carregando pendência…</div>;
  }
  const fallbackIdent: CsFieldPayload["ident"] = {
    os: pendencia?.os ?? "",
    amostraCodigo: pendencia?.amostra ?? "",
    tipoEnsaioNome: "Compressão Simples",
    tipoEnsaioCodigo: "COMP.A",
  };
  const initial: CsFieldPayload = pendencia?.payload
    ? (pendencia.payload as unknown as CsFieldPayload)
    : emptyCsPayload(fallbackIdent);
  const safe: CsFieldPayload = {
    ident: initial.ident ?? fallbackIdent,
    amostraTipo: initial.amostraTipo ?? "solo",
    resultadoModo: initial.resultadoModo ?? "simplificado",
    idadeCuraDias: initial.idadeCuraDias ?? null,
    alturas: Array.isArray(initial.alturas) && initial.alturas.length === 4 ? initial.alturas : [0, 0, 0, 0],
    diametros: Array.isArray(initial.diametros) && initial.diametros.length === 4 ? initial.diametros : [0, 0, 0, 0],
    massaInicial: initial.massaInicial ?? null,
    capsulas: Array.isArray(initial.capsulas) && initial.capsulas.length ? initial.capsulas : [newCsCapsula(), newCsCapsula(), newCsCapsula()],
    massaEspecificaGraos: initial.massaEspecificaGraos ?? 2.65,
    picoCarga: initial.picoCarga ?? null,
    picoCargaUnidade: initial.picoCargaUnidade ?? "kN",
    curva: Array.isArray(initial.curva) ? initial.curva : [],
    fotos: Array.isArray(initial.fotos) ? initial.fotos : [],
    obs: initial.obs ?? "",
  };
  return <CompressaoSimplesWorkspace initial={safe} pendenciaId={pendenciaId} onBack={onBack} />;
}

// -------- Bloco simples de fotos --------
function PhotoBlock({
  title, photos, onAdd, onRemove,
}: { title: string; photos: CsPhoto[]; onAdd: (files: FileList | null) => void; onRemove: (id: string) => void }) {
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
