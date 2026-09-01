/**
 * Digitalização de Permeabilidade a Carga Variável — Método B (ABNT NBR
 * 14545:2021). Coleta de dados de campo (índices físicos, calibração da
 * bureta, leituras de carga hidráulica × tempo × temperatura) na bancada,
 * logo após a leitura do QR. Mesmo padrão de `asf-dap/ui.tsx`.
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Save, CheckCircle2, Plus, Trash2, Droplets,
  ImagePlus, Camera, Ruler,
} from "lucide-react";
import { fileToCompressedDataUrl, formatBytes } from "@/features/lab/photos";
import {
  atualizarPendenciaDigitacao,
  criarPendenciaDigitacao,
  listPendenciasDigitacao,
  type PendenciaDigitacao,
} from "@/lib/lab-pendencias.functions";
import { areaBureta, cargaHidraulica, capsulaUmidadePct } from "./calc";
import type { PermVCalibracao, PermVCalibracaoModo, PermVCapsula, PermVLeitura } from "./types";
import { newPermVLeitura, newPermVCapsula } from "./types";

// -------- Tipos do payload de campo (PERM.V) --------
export interface PermVPhoto {
  id: string;
  dataUrl: string;
  bytes: number;
  caption?: string;
}

export interface PermVFieldPayload {
  ident: {
    os: string;
    amostraCodigo: string;
    servicoNome?: string;
    tipoEnsaioNome: string;
    tipoEnsaioCodigo: string; // "PERM.V"
    qrcodeEnsaioLabId?: number;
    ensaioId?: number;
    contratoId?: number;
    servicoId?: number;
    ensaioTagId?: number;
  };
  naturezaAgua: string;
  gradienteHidraulico: number | null;
  massaUmida: number | null;
  capsulas: PermVCapsula[];
  massaEspecificaGraos: number | null;
  diametroInicial: number | null;
  alturaInicial: number | null;
  cargaHidraulicaInicial: number | null;
  calibracao: PermVCalibracao;
  leituras: PermVLeitura[];
  fotos: PermVPhoto[];
  obs: string;
}

function emptyCalibracao(): PermVCalibracao {
  return {
    modo: "volume",
    volumeReferenciaMl: 1,
    alturaReferenciaCm: 1,
    areaBuretaCm2: null,
    diametroInternoBuretaMm: null,
  };
}

export function emptyPermVPayload(ident: PermVFieldPayload["ident"]): PermVFieldPayload {
  return {
    ident,
    naturezaAgua: "Destilada / deairada",
    gradienteHidraulico: null,
    massaUmida: null,
    capsulas: [newPermVCapsula(), newPermVCapsula(), newPermVCapsula()],
    massaEspecificaGraos: null,
    diametroInicial: null,
    alturaInicial: null,
    cargaHidraulicaInicial: null,
    calibracao: emptyCalibracao(),
    leituras: [newPermVLeitura(), newPermVLeitura(), newPermVLeitura(), newPermVLeitura()],
    fotos: [],
    obs: "",
  };
}

function draftKey(ident: PermVFieldPayload["ident"]) {
  return `perm-v-scan://${ident.os}/${ident.amostraCodigo}`;
}
function persistLocal(data: PermVFieldPayload) {
  try {
    window.localStorage.setItem(
      draftKey(data.ident),
      JSON.stringify({ ...data, savedAt: new Date().toISOString() }),
    );
  } catch { /* ignora quota */ }
}
function loadLocal(ident: PermVFieldPayload["ident"]): PermVFieldPayload | null {
  try {
    const raw = window.localStorage.getItem(draftKey(ident));
    if (!raw) return null;
    const p = JSON.parse(raw) as PermVFieldPayload;
    if (!p?.ident || !Array.isArray(p?.leituras)) return null;
    return p;
  } catch { return null; }
}

// -------- Dispatch (chamado pelo registro genérico digit-scan/registry.ts) --------
function toNumOrUndef(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

export async function dispatchPermV(payload: Record<string, unknown>): Promise<{ to: string; search: { pid: string } }> {
  const os = String(payload.contrato_nome ?? "").trim();
  const amostraCodigo = String(payload.amostra_sigla ?? "").trim();
  const servicoRaw = payload.servico_nome;
  const ident: PermVFieldPayload["ident"] = {
    os,
    amostraCodigo,
    servicoNome: servicoRaw != null ? String(servicoRaw).trim() : undefined,
    tipoEnsaioNome: "Permeabilidade a Carga Variável (PERM.V)",
    tipoEnsaioCodigo: "PERM.V",
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
      ensaio: "Permeabilidade a Carga Variável (PERM.V)",
      tipo_ensaio: "perm-v",
      origem: "digitalizacao",
      payload: emptyPermVPayload(ident) as unknown as Record<string, unknown>,
    },
  });
  return { to: "/relatorio/digitalizacao/perm-v", search: { pid: r.id } };
}

// -------- Editor mobile-first (usado após leitura do QR) --------
export function PermVWorkspace({
  initial,
  pendenciaId,
  onBack,
}: {
  initial: PermVFieldPayload;
  pendenciaId: string | null;
  onBack: () => void;
}) {
  const [data, setData] = useState<PermVFieldPayload>(initial);
  const [pid, setPid] = useState<string | null>(pendenciaId);
  const criarFn = useServerFn(criarPendenciaDigitacao);
  const atualizarFn = useServerFn(atualizarPendenciaDigitacao);
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
              ensaio: "Permeabilidade a Carga Variável (PERM.V)",
              tipo_ensaio: "perm-v",
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

  function patchCalibracao(p: Partial<PermVCalibracao>) {
    setData((d) => ({ ...d, calibracao: { ...d.calibracao, ...p } }));
    queueMicrotask(saveToServer);
  }
  function updateCapsula(i: number, p: Partial<PermVCapsula>) {
    setData((d) => {
      const capsulas = d.capsulas.slice();
      capsulas[i] = { ...capsulas[i], ...p };
      return { ...d, capsulas };
    });
    queueMicrotask(saveToServer);
  }
  function updateLeitura(i: number, p: Partial<PermVLeitura>) {
    setData((d) => {
      const leituras = d.leituras.slice();
      leituras[i] = { ...leituras[i], ...p };
      return { ...d, leituras };
    });
  }
  function addLeitura() {
    setData((d) => ({ ...d, leituras: [...d.leituras, newPermVLeitura()] }));
    queueMicrotask(saveToServer);
  }
  function removeLeitura(i: number) {
    setData((d) => {
      if (d.leituras.length <= 2) return d;
      const leituras = d.leituras.slice();
      leituras.splice(i, 1);
      return { ...d, leituras };
    });
    queueMicrotask(saveToServer);
  }

  async function handlePhotos(files: FileList | null) {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const { dataUrl, bytes } = await fileToCompressedDataUrl(f);
        const photo: PermVPhoto = { id: `p_${Math.random().toString(36).slice(2, 9)}`, dataUrl, bytes, caption: "" };
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
            ensaio: "Permeabilidade a Carga Variável (PERM.V)",
            tipo_ensaio: "perm-v",
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
            ensaio: "Permeabilidade a Carga Variável (PERM.V)",
            tipo_ensaio: "perm-v",
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
      onBack();
    } catch (e: unknown) {
      toast.error("Falha ao gravar: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  const a = useMemo(() => areaBureta(data.calibracao), [data.calibracao]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          Voltar
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">PERM.V · Carga Variável (Método B)</span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Droplets className="h-4 w-4 text-primary" />
            {data.ident.amostraCodigo || "—"} · OS {data.ident.os || "—"}
          </CardTitle>
          <CardDescription className="text-xs">
            {data.ident.servicoNome ? `Serviço/Estaca ${data.ident.servicoNome}` : "Identificação do QR"}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Índices físicos iniciais do corpo de prova</CardTitle>
          <CardDescription className="text-xs">§ 8.1 da norma — usados para índice de vazios e volume de vazios.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <FieldNum label="Massa úmida do CP — Mu (g)" value={data.massaUmida} onChange={(v) => setData((d) => ({ ...d, massaUmida: v }))} onCommit={saveToServer} />
          <FieldNum label="Massa específica dos grãos — ρs (g/cm³)" value={data.massaEspecificaGraos} onChange={(v) => setData((d) => ({ ...d, massaEspecificaGraos: v }))} onCommit={saveToServer} />
          <FieldNum label="Diâmetro inicial do CP (cm)" value={data.diametroInicial} onChange={(v) => setData((d) => ({ ...d, diametroInicial: v }))} onCommit={saveToServer} />
          <FieldNum label="Altura inicial do corpo de prova — H (cm)" value={data.alturaInicial} onChange={(v) => setData((d) => ({ ...d, alturaInicial: v }))} onCommit={saveToServer} />
          <FieldNum label="Gradiente hidráulico (2 a 15)" value={data.gradienteHidraulico} onChange={(v) => setData((d) => ({ ...d, gradienteHidraulico: v }))} onCommit={saveToServer} />
          <FieldNum label="Carga hidráulica inicial — H₀ (cm)" value={data.cargaHidraulicaInicial} onChange={(v) => setData((d) => ({ ...d, cargaHidraulicaInicial: v }))} onCommit={saveToServer} />
          <div className="col-span-2">
            <FieldText label="Natureza da água" value={data.naturezaAgua} onChange={(v) => setData((d) => ({ ...d, naturezaAgua: v }))} onCommit={saveToServer} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cápsulas de umidade (teor de umidade inicial — w)</CardTitle>
          <CardDescription className="text-xs">3 determinações, mesmo padrão do Triaxial CID.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full border-collapse text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="border p-1.5 text-left">Determinação</th>
                {data.capsulas.map((_, i) => (
                  <th key={i} className="border p-1.5 text-center w-24">Cápsula {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border p-1.5 font-medium">Nº Cápsula</td>
                {data.capsulas.map((c, i) => (
                  <td key={i} className="border p-1">
                    <Input className="h-7 text-xs text-center" value={c.numero ?? ""} onChange={(e) => updateCapsula(i, { numero: e.target.value })} placeholder={`#${i + 1}`} />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border p-1.5 font-medium">Tara (g)</td>
                {data.capsulas.map((c, i) => (
                  <td key={i} className="border p-1">
                    <Input type="number" className="h-7 text-xs text-center" value={c.tara} onChange={(e) => updateCapsula(i, { tara: Number(e.target.value.replace(",", ".")) || 0 })} />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border p-1.5 font-medium">Solo Úmido + Tara (g)</td>
                {data.capsulas.map((c, i) => (
                  <td key={i} className="border p-1">
                    <Input type="number" className="h-7 text-xs text-center" value={c.wet} onChange={(e) => updateCapsula(i, { wet: Number(e.target.value.replace(",", ".")) || 0 })} />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="border p-1.5 font-medium">Solo Seco + Tara (g)</td>
                {data.capsulas.map((c, i) => (
                  <td key={i} className="border p-1">
                    <Input type="number" className="h-7 text-xs text-center" value={c.dry} onChange={(e) => updateCapsula(i, { dry: Number(e.target.value.replace(",", ".")) || 0 })} />
                  </td>
                ))}
              </tr>
              <tr className="bg-muted/30">
                <td className="border p-1.5 font-medium">Umidade (%)</td>
                {data.capsulas.map((c, i) => {
                  const w = capsulaUmidadePct(c);
                  return (
                    <td key={i} className="border p-1.5 text-center font-semibold">{w != null ? w.toFixed(2) : "—"}</td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Ruler className="h-4 w-4 text-primary" /> Calibração da bureta
          </CardTitle>
          <CardDescription className="text-xs">
            § 4.2.2 — se a bureta é graduada em volume, correlacione a leitura com o comprimento (ex.: cada 1 mL = 1 cm) pra converter em carga hidráulica.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Bureta graduada em</Label>
            <Select
              value={data.calibracao.modo}
              onValueChange={(v) => patchCalibracao({ modo: v as PermVCalibracaoModo })}
            >
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="volume">Volume (mL) — precisa correlacionar</SelectItem>
                <SelectItem value="comprimento">Comprimento (cm) — leitura já é a carga</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {data.calibracao.modo === "volume" ? (
            <div className="grid grid-cols-2 gap-3">
              <FieldNum
                label="Cada quantos mL da bureta..."
                value={data.calibracao.volumeReferenciaMl}
                onChange={(v) => patchCalibracao({ volumeReferenciaMl: v })}
                onCommit={saveToServer}
              />
              <FieldNum
                label="...correspondem a quantos cm de altura"
                value={data.calibracao.alturaReferenciaCm}
                onChange={(v) => patchCalibracao({ alturaReferenciaCm: v })}
                onCommit={saveToServer}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <FieldNum
                label="Área interna da bureta — a (cm²)"
                value={data.calibracao.areaBuretaCm2}
                onChange={(v) => patchCalibracao({ areaBuretaCm2: v })}
                onCommit={saveToServer}
              />
              <FieldNum
                label="...ou diâmetro interno (mm)"
                value={data.calibracao.diametroInternoBuretaMm}
                onChange={(v) => patchCalibracao({ diametroInternoBuretaMm: v })}
                onCommit={saveToServer}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Área calibrada (a): <strong className="text-foreground">{a != null ? a.toFixed(4) : "—"} cm²</strong>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Leituras (carga hidráulica × tempo × temperatura)</span>
            <Button size="sm" variant="outline" onClick={addLeitura}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Leitura
            </Button>
          </CardTitle>
          <CardDescription className="text-xs">
            Registre o tempo decorrido (s), a leitura bruta da bureta e a temperatura da água. Pelo menos 5 leituras, pra chegar a 4 determinações de k.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-24">Tempo (s)</TableHead>
                  <TableHead className="w-28">Leitura bureta</TableHead>
                  <TableHead className="w-24">h (cm)</TableHead>
                  <TableHead className="w-24">Temp. (°C)</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.leituras.map((l, i) => {
                  const h = l.leituraBruta != null ? cargaHidraulica(l.leituraBruta, data.calibracao, data.cargaHidraulicaInicial) : null;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-7 text-xs"
                          value={l.tSegundos ?? ""}
                          onChange={(e) => updateLeitura(i, { tSegundos: e.target.value === "" ? null : Number(e.target.value) })}
                          onBlur={saveToServer}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-7 text-xs"
                          value={l.leituraBruta ?? ""}
                          onChange={(e) => updateLeitura(i, { leituraBruta: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) })}
                          onBlur={saveToServer}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{h != null ? h.toFixed(2) : "—"}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-7 text-xs"
                          value={l.temperatura ?? ""}
                          onChange={(e) => updateLeitura(i, { temperatura: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) })}
                          onBlur={saveToServer}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeLeitura(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PhotoBlock
        title="Fotos do ensaio"
        description="Registre a montagem, a bureta e o corpo de prova."
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
export function PermVPendenciaEditor({ pendenciaId, onBack }: { pendenciaId: string | null; onBack: () => void }) {
  const listFn = useServerFn(listPendenciasDigitacao);
  const { data: pendencias = [] } = useQuery({
    queryKey: ["perm_v_scan_pendencias"],
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
  const initial: PermVFieldPayload = pendencia?.payload
    ? (pendencia.payload as unknown as PermVFieldPayload)
    : emptyPermVPayload({
        os: pendencia?.os ?? "",
        amostraCodigo: pendencia?.amostra ?? "",
        tipoEnsaioNome: "Permeabilidade a Carga Variável (PERM.V)",
        tipoEnsaioCodigo: "PERM.V",
      });
  const safe: PermVFieldPayload = {
    ident: initial.ident ?? { os: pendencia?.os ?? "", amostraCodigo: pendencia?.amostra ?? "", tipoEnsaioNome: "Permeabilidade a Carga Variável (PERM.V)", tipoEnsaioCodigo: "PERM.V" },
    naturezaAgua: initial.naturezaAgua ?? "Destilada / deairada",
    gradienteHidraulico: initial.gradienteHidraulico ?? null,
    massaUmida: initial.massaUmida ?? null,
    capsulas: Array.isArray(initial.capsulas) && initial.capsulas.length ? initial.capsulas : [newPermVCapsula(), newPermVCapsula(), newPermVCapsula()],
    massaEspecificaGraos: initial.massaEspecificaGraos ?? null,
    diametroInicial: initial.diametroInicial ?? null,
    alturaInicial: initial.alturaInicial ?? null,
    cargaHidraulicaInicial: initial.cargaHidraulicaInicial ?? null,
    calibracao: initial.calibracao ?? emptyCalibracao(),
    leituras: Array.isArray(initial.leituras) && initial.leituras.length ? initial.leituras : [newPermVLeitura(), newPermVLeitura(), newPermVLeitura(), newPermVLeitura()],
    fotos: Array.isArray(initial.fotos) ? initial.fotos : [],
    obs: initial.obs ?? "",
  };
  return <PermVWorkspace initial={safe} pendenciaId={pendenciaId} onBack={onBack} />;
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
  photos: PermVPhoto[];
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
