/**
 * Digitalização de Densidade Aparente (ASF.DAP) — DNIT 428/2022-ME.
 * Coleta de dados de campo (massas/paquímetro do corpo de prova asfáltico)
 * na bancada, logo após a leitura do QR. Sem cápsulas — este ensaio não
 * usa umidade por cápsula, então não entra na Central de Cápsulas.
 *
 * Primeira entrada real do registro genérico `digit-scan/registry.ts`
 * (Fase 6) — segue o mesmo padrão de `adens-scan/ui.tsx`, mas com
 * `dispatchAsfDap` como função standalone (chamada pelo registro, fora de
 * um componente React) em vez de uma closure interna do scanner.
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
import {
  ArrowLeft, Save, CheckCircle2, Plus, Trash2, Beaker,
  ImagePlus, Camera, AlertTriangle, Calculator,
} from "lucide-react";
import { fileToCompressedDataUrl, formatBytes } from "@/features/lab/photos";
import {
  atualizarPendenciaDigitacao,
  criarPendenciaDigitacao,
  listPendenciasDigitacao,
  type PendenciaDigitacao,
} from "@/lib/lab-pendencias.functions";
import { pctAguaAbsorvida, dPvc } from "./calc";

// -------- Tipos do payload de campo (ASF.DAP) --------
export type AsfDapTipoMistura = "densa" | "aberta";

export interface AsfDapCpInput {
  id: string;
  label?: string;
  // caso "densa" (§6.1/6.2):
  A: number | null; // massa seca ao ar [g] (reaproveitada como D se needsFilme)
  B: number | null; // massa imersa em água [g]
  C: number | null; // massa saturada superfície seca [g]
  needsFilme: boolean; // % água absorvida > 2% — precisa revestir com filme PVC
  E: number | null; // massa revestida seca ao ar [g]
  F: number | null; // massa revestida imersa em água [g]
  // caso "aberta" (§6.3):
  alturas: [number | null, number | null, number | null, number | null];
  diametros: [number | null, number | null, number | null, number | null];
  // opcional, qualquer caso:
  gmm: number | null;
}

export interface AsfDapPhoto {
  id: string;
  dataUrl: string;
  bytes: number;
  caption?: string;
}

export interface AsfDapFieldPayload {
  ident: {
    os: string;
    amostraCodigo: string;
    servicoNome?: string; // "26+000" — estaca/serviço da via, não furo/profundidade
    tipoEnsaioNome: string;
    tipoEnsaioCodigo: string; // "ASF.DAP"
    // Passthrough dos IDs numéricos do QR — não usados hoje em nenhum outro
    // lugar do sistema, guardados aqui pra uso futuro (ex.: link de volta).
    qrcodeEnsaioLabId?: number;
    ensaioId?: number;
    contratoId?: number;
    servicoId?: number;
    ensaioTagId?: number;
  };
  tipoMistura: AsfDapTipoMistura;
  dpa: number | null; // densidade do filme PVC — nível do lote, não por CP
  dpaCalibracao: { m1: number | null; m2: number | null; m3: number | null; m4: number | null };
  corposDeProva: AsfDapCpInput[];
  fotos: AsfDapPhoto[];
  obs: string;
}

function newCp(label?: string): AsfDapCpInput {
  return {
    id: `cp_${Math.random().toString(36).slice(2, 9)}`,
    label,
    A: null, B: null, C: null,
    needsFilme: false, E: null, F: null,
    alturas: [null, null, null, null],
    diametros: [null, null, null, null],
    gmm: null,
  };
}

function emptyDpaCalibracao() {
  return { m1: null, m2: null, m3: null, m4: null };
}

export function emptyAsfDapPayload(ident: AsfDapFieldPayload["ident"]): AsfDapFieldPayload {
  return {
    ident,
    tipoMistura: "densa",
    dpa: null,
    dpaCalibracao: emptyDpaCalibracao(),
    corposDeProva: [newCp("CP1"), newCp("CP2"), newCp("CP3")],
    fotos: [],
    obs: "",
  };
}

function draftKey(ident: AsfDapFieldPayload["ident"]) {
  return `asf-dap-scan://${ident.os}/${ident.amostraCodigo}`;
}
function persistLocal(data: AsfDapFieldPayload) {
  try {
    window.localStorage.setItem(
      draftKey(data.ident),
      JSON.stringify({ ...data, savedAt: new Date().toISOString() }),
    );
  } catch { /* ignora quota */ }
}
function loadLocal(ident: AsfDapFieldPayload["ident"]): AsfDapFieldPayload | null {
  try {
    const raw = window.localStorage.getItem(draftKey(ident));
    if (!raw) return null;
    const p = JSON.parse(raw) as AsfDapFieldPayload;
    if (!p?.ident || !Array.isArray(p?.corposDeProva)) return null;
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
 * a pendência de digitação para o QR de ASF.DAP e devolve pra onde navegar.
 * Standalone (sem `useServerFn`/hooks) pois é chamado fora de um componente
 * React, pelo `dispatch` do plugin em `digit-scan/registry.ts`.
 */
export async function dispatchAsfDap(payload: Record<string, unknown>): Promise<{ to: string; search: { pid: string } }> {
  const os = String(payload.contrato_nome ?? "").trim();
  const amostraCodigo = String(payload.amostra_sigla ?? "").trim();
  const servicoRaw = payload.servico_nome;
  const ident: AsfDapFieldPayload["ident"] = {
    os,
    amostraCodigo,
    servicoNome: servicoRaw != null ? String(servicoRaw).trim() : undefined,
    tipoEnsaioNome: "Densidade Aparente (ASF.DAP)",
    tipoEnsaioCodigo: "ASF.DAP",
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
      ensaio: "Densidade Aparente (ASF.DAP)",
      tipo_ensaio: "asf-dap",
      origem: "digitalizacao",
      payload: emptyAsfDapPayload(ident) as unknown as Record<string, unknown>,
    },
  });
  return { to: "/relatorio/digitalizacao/asf-dap", search: { pid: r.id } };
}

// -------- Editor mobile-first (usado após leitura do QR) --------
export function AsfDapWorkspace({
  initial,
  pendenciaId,
  onBack,
}: {
  initial: AsfDapFieldPayload;
  pendenciaId: string | null;
  onBack: () => void;
}) {
  const [data, setData] = useState<AsfDapFieldPayload>(initial);
  const [pid, setPid] = useState<string | null>(pendenciaId);
  const criarFn = useServerFn(criarPendenciaDigitacao);
  const atualizarFn = useServerFn(atualizarPendenciaDigitacao);
  const navigate = useNavigate();
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
            data: {
              os: snap.ident.os,
              amostra: snap.ident.amostraCodigo || null,
              ensaio: "Densidade Aparente (ASF.DAP)",
              tipo_ensaio: "asf-dap",
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
    if (prev) setData({ ...prev, ident: initial.ident });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    persistLocal(data);
  }, [data]);

  function updateCp(i: number, p: Partial<AsfDapCpInput>) {
    setData((d) => {
      const cps = d.corposDeProva.slice();
      const merged = { ...cps[i], ...p };
      // Recalcula ao vivo se a mistura for "densa" e A/B/C tiverem mudado.
      if (d.tipoMistura === "densa" && merged.A != null && merged.B != null && merged.C != null) {
        const pct = pctAguaAbsorvida(merged.A, merged.B, merged.C);
        merged.needsFilme = pct != null && pct > 2;
      }
      cps[i] = merged;
      return { ...d, corposDeProva: cps };
    });
  }
  function updateCpAltura(i: number, idx: number, v: number | null) {
    setData((d) => {
      const cps = d.corposDeProva.slice();
      const alturas = [...cps[i].alturas] as AsfDapCpInput["alturas"];
      alturas[idx] = v;
      cps[i] = { ...cps[i], alturas };
      return { ...d, corposDeProva: cps };
    });
  }
  function updateCpDiametro(i: number, idx: number, v: number | null) {
    setData((d) => {
      const cps = d.corposDeProva.slice();
      const diametros = [...cps[i].diametros] as AsfDapCpInput["diametros"];
      diametros[idx] = v;
      cps[i] = { ...cps[i], diametros };
      return { ...d, corposDeProva: cps };
    });
  }
  function addCp() {
    setData((d) => ({ ...d, corposDeProva: [...d.corposDeProva, newCp(`CP${d.corposDeProva.length + 1}`)] }));
    queueMicrotask(saveToServer);
  }
  function removeCp(i: number) {
    setData((d) => {
      if (d.corposDeProva.length <= 1) return { ...d, corposDeProva: [newCp("CP1")] };
      const cps = d.corposDeProva.slice();
      cps.splice(i, 1);
      return { ...d, corposDeProva: cps };
    });
    queueMicrotask(saveToServer);
  }

  function setTipoMistura(tipoMistura: AsfDapTipoMistura) {
    setData((d) => ({ ...d, tipoMistura }));
    queueMicrotask(saveToServer);
  }

  // Mini-calculadora de Dpa (§6.2.4) a partir da calibração do cilindro.
  function patchDpaCalibracao(p: Partial<AsfDapFieldPayload["dpaCalibracao"]>) {
    setData((d) => {
      const cal = { ...d.dpaCalibracao, ...p };
      const { m1, m2, m3, m4 } = cal;
      let dpa = d.dpa;
      if (m1 != null && m2 != null && m3 != null && m4 != null) {
        const calc = dPvc(m1, m2, m3, m4);
        if (calc != null) dpa = calc;
      }
      return { ...d, dpaCalibracao: cal, dpa };
    });
  }

  async function handlePhotos(files: FileList | null) {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const { dataUrl, bytes } = await fileToCompressedDataUrl(f);
        const photo: AsfDapPhoto = { id: `p_${Math.random().toString(36).slice(2, 9)}`, dataUrl, bytes, caption: "" };
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

  async function saveDraft() {
    persistLocal(data);
    const payload = data as unknown as Record<string, unknown>;
    if (!pid) {
      try {
        const r = await criarFn({
          data: {
            os: data.ident.os,
            amostra: data.ident.amostraCodigo || null,
            ensaio: "Densidade Aparente (ASF.DAP)",
            tipo_ensaio: "asf-dap",
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
            ensaio: "Densidade Aparente (ASF.DAP)",
            tipo_ensaio: "asf-dap",
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

  const algumCpPrecisaFilme = data.corposDeProva.some((cp) => cp.needsFilme);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <Badge variant="secondary" className="ml-auto">ASF.DAP · Densidade Aparente</Badge>
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
          <CardTitle className="text-base">Tipo de mistura</CardTitle>
          <CardDescription className="text-xs">
            Densa (padrão) faz imersão em água. Aberta (vazios ≥ 10%) usa só massa seca + paquímetro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={data.tipoMistura === "densa" ? "default" : "outline"}
              size="sm"
              onClick={() => setTipoMistura("densa")}
            >
              Densa (padrão)
            </Button>
            <Button
              type="button"
              variant={data.tipoMistura === "aberta" ? "default" : "outline"}
              size="sm"
              onClick={() => setTipoMistura("aberta")}
            >
              Aberta (vazios ≥ 10%)
            </Button>
          </div>
        </CardContent>
      </Card>

      {data.tipoMistura === "densa" && algumCpPrecisaFilme && (
        <Card className="border-amber-500/40 bg-amber-500/[0.04]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Densidade do filme PVC (Dpa)
            </CardTitle>
            <CardDescription className="text-xs">
              Algum CP passou de 2% de água absorvida — precisa ser revestido com filme PVC (§6.2). Informe o Dpa diretamente ou calcule a partir da calibração do cilindro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 max-w-xs">
              <FieldNum
                label="Dpa (adimensional)"
                value={data.dpa}
                onChange={(v) => setData((d) => ({ ...d, dpa: v }))}
                onCommit={saveToServer}
              />
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer flex items-center gap-1.5 text-muted-foreground">
                <Calculator className="h-3.5 w-3.5" /> Calcular a partir da calibração do cilindro
              </summary>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                <FieldNum label="m1 · cilindro seco [g]" value={data.dpaCalibracao.m1} onChange={(v) => patchDpaCalibracao({ m1: v })} onCommit={saveToServer} />
                <FieldNum label="m2 · cilindro na água [g]" value={data.dpaCalibracao.m2} onChange={(v) => patchDpaCalibracao({ m2: v })} onCommit={saveToServer} />
                <FieldNum label="m3 · revestido seco [g]" value={data.dpaCalibracao.m3} onChange={(v) => patchDpaCalibracao({ m3: v })} onCommit={saveToServer} />
                <FieldNum label="m4 · revestido na água [g]" value={data.dpaCalibracao.m4} onChange={(v) => patchDpaCalibracao({ m4: v })} onCommit={saveToServer} />
              </div>
            </details>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Corpos de prova</span>
            <Button size="sm" variant="outline" onClick={addCp}>
              <Plus className="h-3.5 w-3.5 mr-1" /> CP
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.corposDeProva.map((cp, i) => {
            const pct = data.tipoMistura === "densa" && cp.A != null && cp.B != null && cp.C != null
              ? pctAguaAbsorvida(cp.A, cp.B, cp.C)
              : null;
            return (
              <div key={cp.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <FieldText label="Identificação do CP" value={cp.label ?? ""} onChange={(v) => updateCp(i, { label: v })} onCommit={saveToServer} />
                  <Button variant="ghost" size="icon" onClick={() => removeCp(i)} title="Remover" className="mt-4">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {data.tipoMistura === "densa" ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <FieldNum label="A · massa seca ao ar [g]" value={cp.A} onChange={(v) => updateCp(i, { A: v })} onCommit={saveToServer} />
                      <FieldNum label="B · massa imersa [g]" value={cp.B} onChange={(v) => updateCp(i, { B: v })} onCommit={saveToServer} />
                      <FieldNum label="C · massa saturada sup. seca [g]" value={cp.C} onChange={(v) => updateCp(i, { C: v })} onCommit={saveToServer} />
                    </div>
                    {pct != null && (
                      <Badge variant={pct > 2 ? "destructive" : "secondary"} className="text-[10px]">
                        Água absorvida: {pct.toFixed(1)}% {pct > 2 ? "— precisa de filme PVC" : ""}
                      </Badge>
                    )}
                    {cp.needsFilme && (
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t mt-2">
                        <FieldNum label="E · revestido seco ao ar [g]" value={cp.E} onChange={(v) => updateCp(i, { E: v })} onCommit={saveToServer} />
                        <FieldNum label="F · revestido imerso [g]" value={cp.F} onChange={(v) => updateCp(i, { F: v })} onCommit={saveToServer} />
                      </div>
                    )}
                  </>
                ) : (
                  <FieldNum label="A · massa seca ao ar [g]" value={cp.A} onChange={(v) => updateCp(i, { A: v })} onCommit={saveToServer} />
                )}

                <div className="pt-1 border-t mt-2">
                  <Label className="text-xs">Alturas (paquímetro) [cm]</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {cp.alturas.map((v, idx) => (
                      <FieldNum key={idx} label={`H${idx + 1}`} value={v} onChange={(nv) => updateCpAltura(i, idx, nv)} onCommit={saveToServer} />
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Diâmetros (paquímetro) [cm]</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {cp.diametros.map((v, idx) => (
                      <FieldNum key={idx} label={`D${idx + 1}`} value={v} onChange={(nv) => updateCpDiametro(i, idx, nv)} onCommit={saveToServer} />
                    ))}
                  </div>
                </div>

                <FieldNum
                  label="Gmm — cruzamento de vazios (opcional)"
                  value={cp.gmm}
                  onChange={(v) => updateCp(i, { gmm: v })}
                  onCommit={saveToServer}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <PhotoBlock
        title="Fotos do ensaio"
        description="Registre os corpos de prova e a pesagem hidrostática."
        photos={data.fotos}
        onAdd={handlePhotos}
        onRemove={removePhoto}
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
export function AsfDapPendenciaEditor({ pendenciaId, onBack }: { pendenciaId: string | null; onBack: () => void }) {
  const listFn = useServerFn(listPendenciasDigitacao);
  const { data: pendencias = [] } = useQuery({
    queryKey: ["asf_dap_scan_pendencias"],
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
  const initial: AsfDapFieldPayload = pendencia?.payload
    ? (pendencia.payload as unknown as AsfDapFieldPayload)
    : emptyAsfDapPayload({
        os: pendencia?.os ?? "",
        amostraCodigo: pendencia?.amostra ?? "",
        tipoEnsaioNome: "Densidade Aparente (ASF.DAP)",
        tipoEnsaioCodigo: "ASF.DAP",
      });
  const safe: AsfDapFieldPayload = {
    ident: initial.ident ?? { os: pendencia?.os ?? "", amostraCodigo: pendencia?.amostra ?? "", tipoEnsaioNome: "Densidade Aparente (ASF.DAP)", tipoEnsaioCodigo: "ASF.DAP" },
    tipoMistura: initial.tipoMistura ?? "densa",
    dpa: initial.dpa ?? null,
    dpaCalibracao: initial.dpaCalibracao ?? emptyDpaCalibracao(),
    corposDeProva: Array.isArray(initial.corposDeProva) && initial.corposDeProva.length ? initial.corposDeProva : [newCp("CP1"), newCp("CP2"), newCp("CP3")],
    fotos: Array.isArray(initial.fotos) ? initial.fotos : [],
    obs: initial.obs ?? "",
  };
  return <AsfDapWorkspace initial={safe} pendenciaId={pendenciaId} onBack={onBack} />;
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
  photos: AsfDapPhoto[];
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
