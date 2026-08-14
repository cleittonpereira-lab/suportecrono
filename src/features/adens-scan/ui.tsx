/**
 * Digitalização de Adensamento (edométrico) — coleta de dados de campo
 * (moldagem + cápsulas iniciais). Segue o padrão M.ESP.A: scanner mobile,
 * pop-up de confirmação, cards horizontais, autosave, envio para
 * Digitação & Emissões (`lab_pendencias_digitacao` com tipo="adensamento").
 *
 * Nota arquitetural: quando ganharmos um 3º ensaio digitalizado (Triaxial UU),
 * extrair scanner + workspace para uma registry genérica (`digit-scan/`)
 * e substituir mesp-natural/ui.tsx + adens-scan/ui.tsx por plugins.
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
import { ArrowLeft, Save, CheckCircle2, Plus, Trash2, FlaskConical } from "lucide-react";
import { ImagePlus, Camera } from "lucide-react";
import { fileToCompressedDataUrl, formatBytes } from "@/features/lab/photos";
import {
  atualizarPendenciaDigitacao,
  criarPendenciaDigitacao,
  listPendenciasDigitacao,
  type PendenciaDigitacao,
} from "@/lib/lab-pendencias.functions";

// -------- Tipos do payload de campo (Adensamento) --------
export interface CapsulaInicialInput {
  id: string;
  capsula: string;         // nº cápsula
  massaCapsula: number | null;         // Mc [g]  (tara)
  massaCapsulaSoloUmido: number | null; // Mcsu [g]
  massaCapsulaSoloSeco: number | null;  // Mcss [g] (preenchida na Central de Cápsulas)
}

export interface AdensMoldagem {
  anelNumero: string;
  diametroMm: number | null;   // D [mm]
  alturaMm: number | null;     // H0 [mm]
  massaAnel: number | null;    // [g]
  massaAnelSoloUmido: number | null; // [g] (Mnat)
}

export interface AdensDesmontagem {
  massaCpFinal: number | null; // massa do CP após ensaio [g]
}

export interface AdensPhoto {
  id: string;
  dataUrl: string;
  bytes: number;
  caption?: string;
}

export interface AdensFieldPayload {
  ident: {
    os: string;
    amostraCodigo: string;
    amostraDescricao?: string;
    tomador?: string;
    obra?: string;
    furo?: string;
    profundidade?: string;
    tipoEnsaioNome: string; // ex.: "Adensamento Edométrico"
    tipoEnsaioCodigo: string; // "ADENS"
  };
  moldagem: AdensMoldagem;
  capsulas: CapsulaInicialInput[];
  capsulasFinais: CapsulaInicialInput[];
  desmontagem: AdensDesmontagem;
  fotosMoldagem: AdensPhoto[];
  fotosDesmontagem: AdensPhoto[];
  obs: string;
}

function newCap(): CapsulaInicialInput {
  return {
    id: `c_${Math.random().toString(36).slice(2, 9)}`,
    capsula: "",
    massaCapsula: null,
    massaCapsulaSoloUmido: null,
    massaCapsulaSoloSeco: null,
  };
}

function emptyMoldagem(): AdensMoldagem {
  return {
    anelNumero: "",
    diametroMm: null,
    alturaMm: null,
    massaAnel: null,
    massaAnelSoloUmido: null,
  };
}

export function emptyAdensPayload(ident: AdensFieldPayload["ident"]): AdensFieldPayload {
  return {
    ident,
    moldagem: emptyMoldagem(),
    capsulas: [newCap(), newCap(), newCap()],
    capsulasFinais: [newCap(), newCap(), newCap()],
    desmontagem: { massaCpFinal: null },
    fotosMoldagem: [],
    fotosDesmontagem: [],
    obs: "",
  };
}

function draftKey(ident: AdensFieldPayload["ident"]) {
  return `adens-scan://${ident.os}/${ident.amostraCodigo}`;
}
function persistLocal(data: AdensFieldPayload) {
  try {
    window.localStorage.setItem(
      draftKey(data.ident),
      JSON.stringify({ ...data, savedAt: new Date().toISOString() }),
    );
  } catch { /* ignora quota */ }
}
function loadLocal(ident: AdensFieldPayload["ident"]): AdensFieldPayload | null {
  try {
    const raw = window.localStorage.getItem(draftKey(ident));
    if (!raw) return null;
    const p = JSON.parse(raw) as AdensFieldPayload;
    if (!p?.ident || !p?.moldagem) return null;
    return p;
  } catch { return null; }
}

// -------- Editor mobile-first (usado após leitura do QR) --------
export function AdensWorkspace({
  initial,
  pendenciaId,
  onBack,
}: {
  initial: AdensFieldPayload;
  pendenciaId: string | null;
  onBack: () => void;
}) {
  const [data, setData] = useState<AdensFieldPayload>(initial);
  const [pid, setPid] = useState<string | null>(pendenciaId);
  const criarFn = useServerFn(criarPendenciaDigitacao);
  const atualizarFn = useServerFn(atualizarPendenciaDigitacao);
  const navigate = useNavigate();
  const loadedRef = useRef(false);
  // Ref sempre com o payload mais recente — usado pelo autosave onBlur,
  // pois setState é assíncrono e o handler de blur precisa enviar o valor atual.
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const pidRef = useRef<string | null>(pid);
  useEffect(() => { pidRef.current = pid; }, [pid]);

  // Autosave para o servidor: dispara ao sair do campo (onBlur). Se já houver
  // um save em andamento, agenda um novo assim que o anterior terminar
  // (coalesce), garantindo que o último valor sempre chegue ao servidor.
  async function saveToServer() {
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true;
    try {
      const snap = dataRef.current;
      const payload = snap as unknown as Record<string, unknown>;
      if (!pidRef.current) {
        try {
          const r = await criarFn({
            data: {
              os: snap.ident.os,
              amostra: snap.ident.amostraCodigo || null,
              ensaio: "Adensamento Edométrico",
              tipo_ensaio: "adensamento",
              equipamento: null,
              origem: "digitalizacao",
              payload,
            },
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
    if (prev) {
      // Merge: preserva campos preenchidos localmente; ident vem do QR/pendência
      setData({ ...prev, ident: initial.ident });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave local a cada mudança
  useEffect(() => {
    persistLocal(data);
  }, [data]);

  function patchMoldagem(p: Partial<AdensMoldagem>) {
    setData((d) => ({ ...d, moldagem: { ...d.moldagem, ...p } }));
  }
  function updateCap(i: number, p: Partial<CapsulaInicialInput>) {
    setData((d) => {
      const caps = d.capsulas.slice();
      caps[i] = { ...caps[i], ...p };
      return { ...d, capsulas: caps };
    });
  }
  function addCap() { setData((d) => ({ ...d, capsulas: [...d.capsulas, newCap()] })); queueMicrotask(saveToServer); }
  function removeCap(i: number) {
    setData((d) => {
      if (d.capsulas.length <= 1) return { ...d, capsulas: [newCap()] };
      const caps = d.capsulas.slice();
      caps.splice(i, 1);
      return { ...d, capsulas: caps };
    });
    queueMicrotask(saveToServer);
  }

  function updateCapFinal(i: number, p: Partial<CapsulaInicialInput>) {
    setData((d) => {
      const caps = d.capsulasFinais.slice();
      caps[i] = { ...caps[i], ...p };
      return { ...d, capsulasFinais: caps };
    });
  }
  function addCapFinal() { setData((d) => ({ ...d, capsulasFinais: [...d.capsulasFinais, newCap()] })); queueMicrotask(saveToServer); }
  function removeCapFinal(i: number) {
    setData((d) => {
      if (d.capsulasFinais.length <= 1) return { ...d, capsulasFinais: [newCap()] };
      const caps = d.capsulasFinais.slice();
      caps.splice(i, 1);
      return { ...d, capsulasFinais: caps };
    });
    queueMicrotask(saveToServer);
  }

  async function handlePhotos(files: FileList | null, target: "fotosMoldagem" | "fotosDesmontagem") {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const { dataUrl, bytes } = await fileToCompressedDataUrl(f);
        const photo: AdensPhoto = { id: `p_${Math.random().toString(36).slice(2, 9)}`, dataUrl, bytes, caption: "" };
        setData((d) => ({ ...d, [target]: [...d[target], photo] } as AdensFieldPayload));
      } catch (e) {
        toast.error("Falha ao processar imagem");
      }
    }
    queueMicrotask(saveToServer);
  }
  function removePhoto(id: string, target: "fotosMoldagem" | "fotosDesmontagem") {
    setData((d) => ({ ...d, [target]: d[target].filter((p) => p.id !== id) } as AdensFieldPayload));
    queueMicrotask(saveToServer);
  }

  async function saveDraft() {
    persistLocal(data);
    const payload = data as unknown as Record<string, unknown>;
    if (!pid) {
      try {
        const r = await criarFn({
          data: {
            os: data.ident.os,
            amostra: data.ident.amostraCodigo || null,
            ensaio: "Adensamento Edométrico",
            tipo_ensaio: "adensamento",
            equipamento: null,
            origem: "digitalizacao",
            payload,
          },
        });
        setPid(r.id);
      } catch (e: unknown) {
        toast.error("Rascunho salvo só no dispositivo: " + (e instanceof Error ? e.message : String(e)));
        return;
      }
    } else {
      try { await atualizarFn({ data: { id: pid, status: "em_digitacao", payload } }); }
      catch { /* silencia */ }
    }
    toast.success("Rascunho salvo");
  }

  async function finalize() {
    persistLocal(data);
    const payload = data as unknown as Record<string, unknown>;
    let curPid = pid;
    if (!curPid) {
      try {
        const r = await criarFn({
          data: {
            os: data.ident.os,
            amostra: data.ident.amostraCodigo || null,
            ensaio: "Adensamento Edométrico",
            tipo_ensaio: "adensamento",
            equipamento: null,
            origem: "digitalizacao",
            payload,
          },
        });
        curPid = r.id;
        setPid(r.id);
      } catch (e: unknown) {
        toast.error("Falha ao enviar: " + (e instanceof Error ? e.message : String(e)));
        return;
      }
    }
    try {
      await atualizarFn({
        data: { id: curPid!, status: "pendente", observacao: data.obs || null, payload },
      });
      toast.success("Execução finalizada — enviada para Digitação & Emissões");
      navigate({ to: "/relatorio/pendentes", search: { tab: "enviados" } });
    } catch (e: unknown) {
      toast.error("Falha ao gravar: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <div className="space-y-4">
      {/* Topo com voltar + identificação */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <Badge variant="secondary" className="ml-auto">ADENS · Adensamento</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            {data.ident.amostraCodigo || "—"} · OS {data.ident.os || "—"}
          </CardTitle>
          <CardDescription className="text-xs">
            {data.ident.obra || data.ident.tomador || "Identificação do QR"}
            {data.ident.furo ? ` · Furo ${data.ident.furo}` : ""}
            {data.ident.profundidade ? ` · Prof ${data.ident.profundidade}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Furo / Profundidade editáveis */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">ID do Furo</Label>
              <Input
                value={data.ident.furo ?? ""}
                onChange={(e) => setData((d) => ({ ...d, ident: { ...d.ident, furo: e.target.value } }))}
                onBlur={() => saveToServer()}
              />
            </div>
            <div>
              <Label className="text-xs">Profundidade</Label>
              <Input
                value={data.ident.profundidade ?? ""}
                onChange={(e) => setData((d) => ({ ...d, ident: { ...d.ident, profundidade: e.target.value } }))}
                onBlur={() => saveToServer()}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Moldagem do CP */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Moldagem do corpo-de-prova</CardTitle>
          <CardDescription className="text-xs">Anel edométrico · dimensões e massas de campo.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <FieldText label="Nº anel" value={data.moldagem.anelNumero} onChange={(v) => patchMoldagem({ anelNumero: v })} onCommit={saveToServer} />
            <FieldNum label="Ø [mm]" value={data.moldagem.diametroMm} onChange={(v) => patchMoldagem({ diametroMm: v })} onCommit={saveToServer} />
            <FieldNum label="H₀ [mm]" value={data.moldagem.alturaMm} onChange={(v) => patchMoldagem({ alturaMm: v })} onCommit={saveToServer} />
            <FieldNum label="M. anel [g]" value={data.moldagem.massaAnel} onChange={(v) => patchMoldagem({ massaAnel: v })} onCommit={saveToServer} />
            <FieldNum label="M. anel+solo úmido [g]" value={data.moldagem.massaAnelSoloUmido} onChange={(v) => patchMoldagem({ massaAnelSoloUmido: v })} onCommit={saveToServer} />
          </div>
        </CardContent>
      </Card>

      {/* Cápsulas de umidade inicial */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Umidade inicial — cápsulas do CP moldado</span>
            <Button size="sm" variant="outline" onClick={addCap}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Cápsula
            </Button>
          </CardTitle>
          <CardDescription className="text-xs">
            Pese a cápsula vazia (tara) e a cápsula com o solo úmido. A massa seca (após 24h em estufa) é lançada depois na <b>Central de Cápsulas</b>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.capsulas.map((c, i) => (
            <div key={c.id} className="rounded-md border p-2 grid grid-cols-4 gap-2 items-end">
              <FieldText label={`#${i + 1} Cápsula`} value={c.capsula} onChange={(v) => updateCap(i, { capsula: v })} onCommit={saveToServer} />
              <FieldNum label="Tara da cápsula [g]" value={c.massaCapsula} onChange={(v) => updateCap(i, { massaCapsula: v })} onCommit={saveToServer} />
              <FieldNum label="Cápsula + solo úmido [g]" value={c.massaCapsulaSoloUmido} onChange={(v) => updateCap(i, { massaCapsulaSoloUmido: v })} onCommit={saveToServer} />
              <div className="flex gap-2 items-end">
                <FieldNum label="Cápsula + solo seco [g]" value={c.massaCapsulaSoloSeco} onChange={(v) => updateCap(i, { massaCapsulaSoloSeco: v })} disabled />
                <Button variant="ghost" size="icon" onClick={() => removeCap(i)} title="Remover">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Fotos da moldagem */}
      <PhotoBlock
        title="Fotos da moldagem do CP"
        description="Registre o corpo-de-prova recém moldado dentro do anel."
        photos={data.fotosMoldagem}
        onAdd={(files) => handlePhotos(files, "fotosMoldagem")}
        onRemove={(id) => removePhoto(id, "fotosMoldagem")}
      />

      {/* Desmontagem do CP */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Desmontagem do CP (após o ensaio)</CardTitle>
          <CardDescription className="text-xs">Massa do CP retirado do anel ao final do ensaio.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <FieldNum
              label="Massa do CP final [g]"
              value={data.desmontagem.massaCpFinal}
              onChange={(v) => setData((d) => ({ ...d, desmontagem: { ...d.desmontagem, massaCpFinal: v } }))}
              onCommit={saveToServer}
            />
          </div>
        </CardContent>
      </Card>

      {/* Cápsulas de umidade final */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Umidade final — cápsulas do CP desmontado</span>
            <Button size="sm" variant="outline" onClick={addCapFinal}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Cápsula
            </Button>
          </CardTitle>
          <CardDescription className="text-xs">
            Mesmo esquema das iniciais: tara + cápsula com solo úmido; a massa seca vem depois na Central.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.capsulasFinais.map((c, i) => (
            <div key={c.id} className="rounded-md border p-2 grid grid-cols-4 gap-2 items-end">
              <FieldText label={`#${i + 1} Cápsula`} value={c.capsula} onChange={(v) => updateCapFinal(i, { capsula: v })} onCommit={saveToServer} />
              <FieldNum label="Tara da cápsula [g]" value={c.massaCapsula} onChange={(v) => updateCapFinal(i, { massaCapsula: v })} onCommit={saveToServer} />
              <FieldNum label="Cápsula + solo úmido [g]" value={c.massaCapsulaSoloUmido} onChange={(v) => updateCapFinal(i, { massaCapsulaSoloUmido: v })} onCommit={saveToServer} />
              <div className="flex gap-2 items-end">
                <FieldNum label="Cápsula + solo seco [g]" value={c.massaCapsulaSoloSeco} onChange={(v) => updateCapFinal(i, { massaCapsulaSoloSeco: v })} disabled />
                <Button variant="ghost" size="icon" onClick={() => removeCapFinal(i)} title="Remover">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Fotos da desmontagem */}
      <PhotoBlock
        title="Fotos da desmontagem do CP"
        description="Registre o CP e o anel ao final do ensaio."
        photos={data.fotosDesmontagem}
        onAdd={(files) => handlePhotos(files, "fotosDesmontagem")}
        onRemove={(id) => removePhoto(id, "fotosDesmontagem")}
      />

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

function FieldText({ label, value, onChange, onCommit }: { label: string; value: string; onChange: (v: string) => void; onCommit?: () => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => onCommit?.()}
      />
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
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        disabled={disabled}
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
export function AdensPendenciaEditor({ pendenciaId, onBack }: { pendenciaId: string | null; onBack: () => void }) {
  const listFn = useServerFn(listPendenciasDigitacao);
  const { data: pendencias = [] } = useQuery({
    queryKey: ["adens_scan_pendencias"],
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
  const initial: AdensFieldPayload = pendencia?.payload
    ? (pendencia.payload as unknown as AdensFieldPayload)
    : emptyAdensPayload({
        os: pendencia?.os ?? "",
        amostraCodigo: pendencia?.amostra ?? "",
        tipoEnsaioNome: "Adensamento Edométrico",
        tipoEnsaioCodigo: "ADENS",
      });
  // Garante shape mínimo caso o payload salvo esteja incompleto
  const safe: AdensFieldPayload = {
    ident: initial.ident ?? { os: pendencia?.os ?? "", amostraCodigo: pendencia?.amostra ?? "", tipoEnsaioNome: "Adensamento Edométrico", tipoEnsaioCodigo: "ADENS" },
    moldagem: initial.moldagem ?? emptyMoldagem(),
    capsulas: Array.isArray(initial.capsulas) && initial.capsulas.length ? initial.capsulas : [newCap(), newCap(), newCap()],
    capsulasFinais: Array.isArray(initial.capsulasFinais) && initial.capsulasFinais.length ? initial.capsulasFinais : [newCap(), newCap(), newCap()],
    desmontagem: initial.desmontagem ?? { massaCpFinal: null },
    fotosMoldagem: Array.isArray(initial.fotosMoldagem) ? initial.fotosMoldagem : [],
    fotosDesmontagem: Array.isArray(initial.fotosDesmontagem) ? initial.fotosDesmontagem : [],
    obs: initial.obs ?? "",
  };
  return <AdensWorkspace initial={safe} pendenciaId={pendenciaId} onBack={onBack} />;
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
  photos: AdensPhoto[];
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