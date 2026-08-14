import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Beaker, Printer, Search, CheckCircle2, Zap } from "lucide-react";
import {
  listPendenciasDigitacao,
  atualizarPendenciaDigitacao,
  type PendenciaDigitacao,
} from "@/lib/lab-pendencias.functions";
import { useAuth } from "@/hooks/use-auth";
const logoAsset = { url: "/suporte-infra-logo.png" };

export const Route = createFileRoute("/_app/relatorio/digitalizacao/capsulas")({
  ssr: false,
  component: CapsulasPage,
});

// Uma "cápsula" é uma determinação (linha) dentro do payload de uma
// pendência de digitação. A Central agrega essas determinações vindas de
// TODOS os ensaios digitalizados (M.ESP.A hoje; demais no futuro).
type CapsulaRow = {
  key: string;
  pendenciaId: string;
  sourceKey: string; // caminho no payload (dets | capsulas | ...)
  detIndex: number;
  numero: string;
  os: string | null;
  amostra: string | null;
  tipo_ensaio: string | null;
  ensaio_codigo: string | null;
  determinacao: string;
  peso_inicial: number | null; // cápsula + solo úmido (Mcsu)
  peso_tara: number | null;    // massa da cápsula (Mc)
  peso_final: number | null;   // cápsula + solo seco (Mcss)
  data_inicial: string | null;
  data_final: string | null;
  operador_inicial_nome: string | null;
};

type Det = {
  capsula?: string | null;
  massaCapsula?: number | null;
  massaCapsulaSoloUmido?: number | null;
  massaCapsulaSoloSeco?: number | null;
};

/**
 * Fontes de cápsulas dentro do `payload` de uma pendência. Cada ensaio
 * digitalizado guarda suas cápsulas num caminho diferente — a Central
 * precisa consolidar TODAS elas (nunca "a primeira que encontrar"), senão
 * uma cápsula 343 do M.ESP.A "esconde" a 343 do Adensamento e a pesagem
 * final some do radar.
 *
 * Para adicionar um novo ensaio digitalizado, basta incluir a chave do
 * array de cápsulas + um rótulo curto da origem (aparece na coluna Det.).
 */
const CAPSULE_SOURCES: Array<{ key: string; label: (i: number) => string }> = [
  { key: "dets",           label: (i) => `Det. ${String(i + 1).padStart(2, "0")}` },      // M.ESP.A
  { key: "determinacoes",  label: (i) => `Det. ${String(i + 1).padStart(2, "0")}` },      // alias legado
  { key: "capsulas",       label: (i) => `Cáps. ${String(i + 1).padStart(2, "0")}` },     // Adensamento (moldagem inicial)
  { key: "capsulasIniciais", label: (i) => `Cáps.i ${String(i + 1).padStart(2, "0")}` },
  { key: "capsulasFinais", label: (i) => `Cáps.f ${String(i + 1).padStart(2, "0")}` },    // ex.: Adensamento pós-ensaio
];

/**
 * Resolve o índice real da determinação dentro do payload.
 * A UI da Central foi renderizada com um `detIndex` capturado num snapshot;
 * se outro operador editou o payload no meio-tempo (adicionou determinação,
 * reordenou), aquele índice pode apontar para a linha errada. Preferimos
 * casar pelo nº da cápsula quando ele estiver presente; só usamos o índice
 * como fallback quando o número não bate em nenhuma linha (ou está vazio).
 */
function resolveDetIndex(
  dets: Det[],
  numeroEsperado: string,
  hintIndex: number,
): number {
  const alvo = (numeroEsperado ?? "").toString().trim().toLowerCase();
  if (alvo) {
    const atHint = (dets[hintIndex]?.capsula ?? "").toString().trim().toLowerCase();
    if (atHint === alvo) return hintIndex;
    const byNumero = dets.findIndex(
      (d) => (d?.capsula ?? "").toString().trim().toLowerCase() === alvo,
    );
    if (byNumero >= 0) return byNumero;
  }
  return hintIndex;
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function extractCapsulas(pendencias: PendenciaDigitacao[]): CapsulaRow[] {
  const rows: CapsulaRow[] = [];
  for (const p of pendencias) {
    const payload = (p.payload ?? null) as Record<string, unknown> | null;
    if (!payload) continue;
    const savedAt = (payload.savedAt as string | undefined) ?? p.updated_at ?? p.data_conclusao;
    for (const src of CAPSULE_SOURCES) {
      const arr = payload[src.key];
      if (!Array.isArray(arr)) continue;
      (arr as Det[]).forEach((d, i) => {
        const numero = (d?.capsula ?? "").toString().trim();
        if (!numero) return;
        const inicial = toNum(d?.massaCapsulaSoloUmido);
        const tara = toNum(d?.massaCapsula);
        const final = toNum(d?.massaCapsulaSoloSeco);
        rows.push({
          key: `${p.id}:${src.key}:${i}`,
          pendenciaId: p.id,
          sourceKey: src.key,
          detIndex: i,
          numero,
          os: p.os ?? null,
          amostra: p.amostra ?? null,
          tipo_ensaio: p.tipo_ensaio ?? null,
          ensaio_codigo: p.ensaio ?? null,
          determinacao: src.label(i),
          peso_inicial: inicial,
          peso_tara: tara,
          peso_final: final,
          data_inicial: savedAt ?? null,
          data_final: final != null ? savedAt ?? null : null,
          operador_inicial_nome: p.operador_nome ?? null,
        });
      });
    }
  }
  return rows;
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function fmtNum(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(2);
}
function sigla(tipo: string | null | undefined): string {
  if (!tipo) return "—";
  const t = tipo.trim();
  const map: Record<string, string> = {
    "Massa Específica Aparente Natural": "M.ESP.A",
    "Massa Específica Aparente": "M.ESP.A",
    "Adensamento Oedométrico": "ADENS",
    "Adensamento": "ADENS",
    "Triaxial CID Saturado": "TRI.CIDsat",
    "Triaxial CID Natural": "TRI.CIDnat",
    "Triaxial CID": "TRI.CID",
    "Triaxial CIU": "TRI.CIU",
    "Triaxial UU": "TRI.UU",
    "Cisalhamento Direto": "CD",
  };
  return map[t] ?? (t.length <= 12 ? t : t.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 6));
}
function umidade(c: CapsulaRow): number | null {
  const { peso_inicial, peso_tara, peso_final } = c;
  if (peso_inicial == null || peso_tara == null || peso_final == null) return null;
  const denom = peso_final - peso_tara;
  if (denom <= 0) return null;
  return ((peso_inicial - peso_final) / denom) * 100;
}

function CapsulasPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [busca, setBusca] = useState("");
  const [finalOpen, setFinalOpen] = useState<CapsulaRow | null>(null);
  const [continuaOpen, setContinuaOpen] = useState(false);
  const [tab, setTab] = useState<"pendentes" | "concluidas" | "todas">("pendentes");

  const { data: pendencias = [], isLoading } = useQuery({
    queryKey: ["lab-pendencias-digitacao"],
    queryFn: () => listPendenciasDigitacao(),
  });

  const capsulas = useMemo(() => extractCapsulas(pendencias), [pendencias]);

  const pendentes = useMemo(
    () => capsulas.filter((c) => c.peso_final == null),
    [capsulas],
  );
  const concluidas = useMemo(
    () => capsulas.filter((c) => c.peso_final != null),
    [capsulas],
  );

  const buscaNorm = busca.trim().toLowerCase();
  const base = tab === "pendentes" ? pendentes : tab === "concluidas" ? concluidas : capsulas;
  const filtered = useMemo(() => {
    if (!buscaNorm) return base;
    return base.filter((c) =>
      [c.numero, c.os, c.amostra, c.tipo_ensaio, c.ensaio_codigo, c.determinacao]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(buscaNorm)),
    );
  }, [base, buscaNorm]);

  // Sugestões de pendentes com o mesmo número digitado
  const sugestoesPendentes = useMemo(() => {
    if (!buscaNorm) return [];
    return pendentes.filter((c) => c.numero.toLowerCase().includes(buscaNorm));
  }, [pendentes, buscaNorm]);

  function printLista() {
    const impressoPor = profile?.nome ?? profile?.email ?? "—";
    const agora = new Date().toLocaleString("pt-BR");
    const logoUrl = `${window.location.origin}${logoAsset.url}`;
    const rows = pendentes
      .slice()
      .sort((a, b) => (a.data_inicial ?? "").localeCompare(b.data_inicial ?? ""))
      .map(
        (c) => `
        <tr>
          <td>${c.numero ?? ""}</td>
          <td>${fmtDate(c.data_inicial)}</td>
          <td>${c.os ?? ""}</td>
          <td>${c.amostra ?? ""}</td>
          <td>${sigla(c.tipo_ensaio)}</td>
          <td>${c.ensaio_codigo ?? ""}</td>
          <td>${c.determinacao ?? ""}</td>
          <td>${fmtNum(c.peso_inicial)}</td>
          <td>${fmtNum(c.peso_tara)}</td>
          <td>${c.operador_inicial_nome ?? ""}</td>
          <td style="border-bottom:1px solid #000;min-width:60px">&nbsp;</td>
        </tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cápsulas pendentes de pesagem final</title>
      <style>
        @page { size: A4 landscape; margin: 8mm; }
        *{box-sizing:border-box}
        body{font-family:system-ui,-apple-system,Arial,sans-serif;font-size:10px;color:#141414;margin:0;padding:0}
        .frame{border:1px solid #141414}
        .header{display:flex;align-items:center;border-bottom:1px solid #141414}
        .header .logo{width:20%;padding:6px 8px;border-right:1px solid #141414;display:flex;align-items:center;justify-content:center}
        .header .logo img{height:44px;width:auto;object-fit:contain}
        .header .title{flex:1;padding:6px 8px;text-align:center;line-height:1.2}
        .header .title .t1{font-size:12px;font-weight:700;text-decoration:underline}
        .header .title .t2{font-size:12px;font-weight:700;margin-top:2px}
        .header .title .t3{font-size:10px;margin-top:2px;color:#141414;opacity:.8}
        .meta{display:flex;justify-content:space-between;padding:4px 8px;font-size:9.5px;border-bottom:1px solid #141414;background:#f3f4f6}
        .meta b{font-weight:600}
        table{width:100%;border-collapse:collapse}
        thead th{background:#141414;color:#fff;font-size:9.5px;font-weight:600;padding:4px 6px;text-align:left;border:1px solid #141414}
        tbody td{border:1px solid #141414;border-color:rgba(20,20,20,.6);padding:3px 6px;font-size:9.5px;vertical-align:top}
        tbody tr:nth-child(even) td{background:#fafafa}
        .foot{margin-top:6px;background:#141414;color:#fff;padding:5px 10px;font-size:8px;display:flex;justify-content:space-between}
        .foot .l{font-weight:700;letter-spacing:.02em}
        .stamp{position:fixed;right:8mm;bottom:2mm;font-size:7px;color:rgba(20,20,20,.55)}
      </style></head><body>
      <div class="frame">
        <div class="header">
          <div class="logo"><img src="${logoUrl}" alt="Suporte Infra" crossorigin="anonymous"/></div>
          <div class="title">
            <div class="t1">CENTRAL DE CÁPSULAS</div>
            <div class="t2">Cápsulas pendentes de pesagem final (cápsula + solo seco)</div>
            <div class="t3">NBR 6457 · Preparação de amostras e determinação de umidade</div>
          </div>
        </div>
        <div class="meta">
          <span><b>Impresso por:</b> ${impressoPor}</span>
          <span><b>Data/hora:</b> ${agora}</span>
          <span><b>Total de cápsulas:</b> ${pendentes.length}</span>
        </div>
        <table>
          <thead><tr>
            <th>Nº</th><th>Data inicial</th><th>OS</th><th>Amostra</th><th>Ensaio</th>
            <th>Código</th><th>Det.</th><th style="text-align:right">P. inicial (g)</th>
            <th style="text-align:right">Tara (g)</th><th>Operador (inicial)</th><th>P. final (g)</th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="11" style="text-align:center;padding:16px;color:#666">Nenhuma cápsula pendente.</td></tr>`}</tbody>
        </table>
      </div>
      <div class="foot">
        <div class="l">SUPORTE INFRA — LABORATÓRIO DE ENSAIOS ESPECIAIS</div>
        <div>www.suportesolos.com.br · contato@suportesolos.com.br</div>
      </div>
      <div class="stamp">Emitido em ${agora} · Impresso por ${impressoPor}</div>
    </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Bloqueado pelo navegador");
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Beaker className="h-5 w-5 text-primary" /> Central de Cápsulas
              </CardTitle>
              <CardDescription>
                Consolida as cápsulas registradas nas digitalizações de ensaios
                (M.ESP.A e demais). Digite o número da cápsula para localizar
                pendências de pesagem final (cápsula + solo seco).
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setContinuaOpen(true)} disabled={pendentes.length === 0}>
                <Zap className="h-4 w-4 mr-2" /> Digitação contínua
              </Button>
              <Button variant="outline" size="sm" onClick={printLista} disabled={pendentes.length === 0}>
                <Printer className="h-4 w-4 mr-2" /> Imprimir pendentes ({pendentes.length})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="pendentes">Pendentes ({pendentes.length})</TabsTrigger>
              <TabsTrigger value="concluidas">Concluídas ({concluidas.length})</TabsTrigger>
              <TabsTrigger value="todas">Todas ({capsulas.length})</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-4 space-y-4">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite o número da cápsula (ex.: 22) ou OS, amostra, ensaio…"
              className="pl-9 h-11 text-base"
              autoFocus
            />
          </div>

          {tab !== "concluidas" && sugestoesPendentes.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
                {sugestoesPendentes.length} cápsula(s) pendente(s) com "{busca}":
              </p>
              <div className="grid gap-2">
                {sugestoesPendentes.map((c) => (
                  <div
                    key={c.key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2 text-xs"
                  >
                    <div className="flex-1 min-w-[240px]">
                      <div className="font-semibold text-sm">
                        Nº {c.numero}
                        {c.determinacao && <span className="text-muted-foreground"> · {c.determinacao}</span>}
                      </div>
                      <div className="text-muted-foreground">
                        {c.os || "—"} · {c.amostra || "—"} · {sigla(c.tipo_ensaio)}
                        {c.ensaio_codigo && ` · ${c.ensaio_codigo}`}
                      </div>
                      <div className="text-muted-foreground">
                        Inicial: {fmtNum(c.peso_inicial)}g · Tara: {fmtNum(c.peso_tara)}g ·{" "}
                        {fmtDate(c.data_inicial)} · {c.operador_inicial_nome || "—"}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => setFinalOpen(c)}>
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Pesagem final
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>OS · Amostra</TableHead>
                  <TableHead>Ensaio · Det.</TableHead>
                  <TableHead className="text-right">Inicial</TableHead>
                  <TableHead className="text-right">Tara</TableHead>
                  <TableHead className="text-right">Final</TableHead>
                  <TableHead className="text-right">w (%)</TableHead>
                  <TableHead>Data inicial</TableHead>
                  <TableHead>Data final</TableHead>
                  <TableHead>Operadores</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-6">
                      Carregando…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-6">
                      Nenhuma cápsula nesta lista.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((c) => {
                  const w = umidade(c);
                  const pend = c.peso_final == null;
                  return (
                    <TableRow key={c.key} className={pend ? "bg-amber-500/5" : ""}>
                      <TableCell className="font-semibold">{c.numero}</TableCell>
                      <TableCell>
                        {pend ? (
                          <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400">
                            Aguarda final
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Concluída</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{c.os || "—"}</div>
                        <div className="text-muted-foreground">{c.amostra || "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-mono font-semibold">{sigla(c.tipo_ensaio)}</div>
                        <div className="text-muted-foreground">
                          {c.ensaio_codigo || "—"}
                          {c.determinacao ? ` · ${c.determinacao}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(c.peso_inicial)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(c.peso_tara)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(c.peso_final)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {w == null ? "—" : w.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-xs">{fmtDate(c.data_inicial)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(c.data_final)}</TableCell>
                      <TableCell className="text-xs">
                        <div>{c.operador_inicial_nome || "—"}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        {pend ? (
                          <Button size="sm" variant="outline" onClick={() => setFinalOpen(c)}>
                            Final
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <PesagemFinalDialog
        capsula={finalOpen}
        pendencias={pendencias}
        onClose={() => setFinalOpen(null)}
        operadorNome={profile?.nome ?? null}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["lab-pendencias-digitacao"] });
          setFinalOpen(null);
        }}
      />

      <DigitacaoContinuaDialog
        open={continuaOpen}
        onClose={() => setContinuaOpen(false)}
        pendentes={pendentes}
        pendencias={pendencias}
        operadorNome={profile?.nome ?? null}
        onSaved={() => qc.invalidateQueries({ queryKey: ["lab-pendencias-digitacao"] })}
      />
    </div>
  );
}

function PesagemFinalDialog({
  capsula,
  pendencias,
  onClose,
  operadorNome,
  onSaved,
}: {
  capsula: CapsulaRow | null;
  pendencias: PendenciaDigitacao[];
  onClose: () => void;
  operadorNome: string | null;
  onSaved: () => void;
}) {
  const [pesoFinal, setPesoFinal] = useState("");
  const [pesoTara, setPesoTara] = useState("");

  useMemo(() => {
    if (capsula) {
      setPesoFinal("");
      setPesoTara(capsula.peso_tara != null ? String(capsula.peso_tara) : "");
    }
  }, [capsula]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!capsula) return;
      const p = pendencias.find((x) => x.id === capsula.pendenciaId);
      if (!p) throw new Error("Pendência não encontrada");
      const payload = { ...((p.payload ?? {}) as Record<string, unknown>) };
      const detsKey = capsula.sourceKey;
      const dets = Array.isArray((payload as any)[detsKey])
        ? [...((payload as any)[detsKey] as Det[])]
        : [];
      const idx = resolveDetIndex(dets, capsula.numero, capsula.detIndex);
      const cur = { ...(dets[idx] ?? {}) } as Det;
      if (!cur.capsula) cur.capsula = capsula.numero;
      cur.massaCapsulaSoloSeco = Number(pesoFinal.replace(",", "."));
      if (pesoTara) cur.massaCapsula = Number(pesoTara.replace(",", "."));
      dets[idx] = cur;
      (payload as any)[detsKey] = dets;
      (payload as any).capsulaFinalOperador = operadorNome ?? null;
      (payload as any).capsulaFinalAt = new Date().toISOString();
      await atualizarPendenciaDigitacao({
        data: { id: p.id, status: p.status, payload: payload as never },
      });
    },
    onSuccess: () => {
      toast.success("Pesagem final registrada");
      onSaved();
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Falha ao salvar"),
  });

  if (!capsula) return null;
  const w =
    pesoFinal && pesoTara && capsula.peso_inicial != null
      ? ((capsula.peso_inicial - Number(pesoFinal.replace(",", "."))) /
          (Number(pesoFinal.replace(",", ".")) - Number(pesoTara.replace(",", ".")))) *
        100
      : null;

  return (
    <Dialog open={!!capsula} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pesagem final — cápsula {capsula.numero}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
            <div><b>OS:</b> {capsula.os || "—"} · <b>Amostra:</b> {capsula.amostra || "—"}</div>
            <div><b>Ensaio:</b> {capsula.tipo_ensaio || "—"} {capsula.ensaio_codigo ? `· ${capsula.ensaio_codigo}` : ""}</div>
            {capsula.determinacao && <div><b>Det.:</b> {capsula.determinacao}</div>}
            <div>
              <b>Peso inicial:</b> {fmtNum(capsula.peso_inicial)}g · <b>Data:</b>{" "}
              {fmtDate(capsula.data_inicial)}
            </div>
            <div><b>Operador (inicial):</b> {capsula.operador_inicial_nome || "—"}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Peso final (g) *"
              value={pesoFinal}
              onChange={setPesoFinal}
              inputMode="decimal"
              autoFocus
            />
            <Field label="Tara (g)" value={pesoTara} onChange={setPesoTara} inputMode="decimal" />
          </div>
          {w != null && Number.isFinite(w) && (
            <div className="text-center rounded-md border p-2 bg-primary/5">
              <span className="text-xs text-muted-foreground">Umidade calculada</span>
              <div className="text-lg font-semibold">{w.toFixed(2)}%</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!pesoFinal || mut.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoFocus?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoFocus={autoFocus}
        className="h-9"
      />
    </div>
  );
}

function DigitacaoContinuaDialog({
  open,
  onClose,
  pendentes,
  pendencias,
  operadorNome,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  pendentes: CapsulaRow[];
  pendencias: PendenciaDigitacao[];
  operadorNome: string | null;
  onSaved: () => void;
}) {
  const [numero, setNumero] = useState("");
  const [pesoFinal, setPesoFinal] = useState("");
  const [pesoTara, setPesoTara] = useState("");
  const [seletor, setSeletor] = useState<string | null>(null); // key da cápsula escolhida
  const [ultimas, setUltimas] = useState<{ numero: string; w: number | null; at: string }[]>([]);
  const numeroRef = useRef<HTMLInputElement>(null);
  const finalRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setNumero("");
      setPesoFinal("");
      setPesoTara("");
      setSeletor(null);
      setTimeout(() => numeroRef.current?.focus(), 50);
    }
  }, [open]);

  const buscaNorm = numero.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!buscaNorm) return [];
    return pendentes.filter((c) => c.numero.toLowerCase() === buscaNorm);
  }, [pendentes, buscaNorm]);
  const parciais = useMemo(() => {
    if (!buscaNorm || matches.length > 0) return [];
    return pendentes.filter((c) => c.numero.toLowerCase().includes(buscaNorm)).slice(0, 6);
  }, [pendentes, buscaNorm, matches]);

  const alvo: CapsulaRow | null = useMemo(() => {
    if (seletor) return pendentes.find((c) => c.key === seletor) ?? null;
    if (matches.length === 1) return matches[0];
    return null;
  }, [seletor, matches, pendentes]);

  useEffect(() => {
    if (alvo) {
      setPesoTara(alvo.peso_tara != null ? String(alvo.peso_tara) : "");
      setTimeout(() => finalRef.current?.focus(), 30);
    }
  }, [alvo]);

  const w =
    alvo && pesoFinal && pesoTara && alvo.peso_inicial != null
      ? ((alvo.peso_inicial - Number(pesoFinal.replace(",", "."))) /
          (Number(pesoFinal.replace(",", ".")) - Number(pesoTara.replace(",", ".")))) *
        100
      : null;

  const mut = useMutation({
    mutationFn: async () => {
      if (!alvo) return;
      const p = pendencias.find((x) => x.id === alvo.pendenciaId);
      if (!p) throw new Error("Pendência não encontrada");
      const payload = { ...((p.payload ?? {}) as Record<string, unknown>) };
      const detsKey = alvo.sourceKey;
      const dets = Array.isArray((payload as any)[detsKey])
        ? [...((payload as any)[detsKey] as Det[])]
        : [];
      const idx = resolveDetIndex(dets, alvo.numero, alvo.detIndex);
      const cur = { ...(dets[idx] ?? {}) } as Det;
      if (!cur.capsula) cur.capsula = alvo.numero;
      cur.massaCapsulaSoloSeco = Number(pesoFinal.replace(",", "."));
      if (pesoTara) cur.massaCapsula = Number(pesoTara.replace(",", "."));
      dets[idx] = cur;
      (payload as any)[detsKey] = dets;
      (payload as any).capsulaFinalOperador = operadorNome ?? null;
      (payload as any).capsulaFinalAt = new Date().toISOString();
      await atualizarPendenciaDigitacao({
        data: { id: p.id, status: p.status, payload: payload as never },
      });
      return { numero: alvo.numero, w };
    },
    onSuccess: (res) => {
      toast.success(`Cápsula ${res?.numero ?? ""} registrada`);
      setUltimas((u) => [
        { numero: res?.numero ?? "", w: res?.w ?? null, at: new Date().toISOString() },
        ...u,
      ].slice(0, 8));
      setNumero("");
      setPesoFinal("");
      setPesoTara("");
      setSeletor(null);
      onSaved();
      setTimeout(() => numeroRef.current?.focus(), 30);
    },
    onError: (e: unknown) => toast.error((e as Error)?.message || "Falha ao salvar"),
  });

  function onNumeroKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && matches.length === 1) {
      e.preventDefault();
      finalRef.current?.focus();
    }
  }
  function onFinalKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && pesoFinal && alvo) {
      e.preventDefault();
      mut.mutate();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" /> Digitação contínua de pesagens finais
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Nº da cápsula</Label>
            <Input
              ref={numeroRef}
              value={numero}
              onChange={(e) => {
                setNumero(e.target.value);
                setSeletor(null);
              }}
              onKeyDown={onNumeroKey}
              placeholder="Digite o número e pressione Enter"
              className="h-14 text-2xl font-semibold tracking-wider"
              inputMode="numeric"
              autoComplete="off"
            />
            {buscaNorm && matches.length === 0 && parciais.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Nenhuma cápsula pendente com esse número.
              </p>
            )}
            {parciais.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {parciais.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => {
                      setNumero(c.numero);
                      setSeletor(c.key);
                    }}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  >
                    {c.numero} · {sigla(c.tipo_ensaio)}
                  </button>
                ))}
              </div>
            )}
            {matches.length > 1 && !seletor && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">
                  {matches.length} cápsulas com esse número — selecione:
                </p>
                {matches.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setSeletor(c.key)}
                    className="block w-full text-left rounded-md border p-2 text-xs hover:bg-muted"
                  >
                    <b>{sigla(c.tipo_ensaio)}</b> · {c.os || "—"} · {c.amostra || "—"} ·{" "}
                    {c.determinacao} · Inicial {fmtNum(c.peso_inicial)}g · {fmtDate(c.data_inicial)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {alvo && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
              <div className="flex flex-wrap gap-x-3">
                <span><b>{sigla(alvo.tipo_ensaio)}</b></span>
                <span>OS: {alvo.os || "—"}</span>
                <span>Amostra: {alvo.amostra || "—"}</span>
                <span>{alvo.determinacao}</span>
              </div>
              <div>
                Inicial: <b>{fmtNum(alvo.peso_inicial)}g</b> · Tara: {fmtNum(alvo.peso_tara)}g ·{" "}
                {fmtDate(alvo.data_inicial)} · {alvo.operador_inicial_nome || "—"}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Peso final — cápsula + solo seco (g) *</Label>
              <Input
                ref={finalRef}
                value={pesoFinal}
                onChange={(e) => setPesoFinal(e.target.value)}
                onKeyDown={onFinalKey}
                disabled={!alvo}
                inputMode="decimal"
                className="h-14 text-2xl font-semibold tabular-nums"
                placeholder="0,00"
              />
            </div>
            <div>
              <Label className="text-xs">Tara (g)</Label>
              <Input
                value={pesoTara}
                onChange={(e) => setPesoTara(e.target.value)}
                disabled={!alvo}
                inputMode="decimal"
                className="h-14 text-lg tabular-nums"
              />
            </div>
          </div>

          {w != null && Number.isFinite(w) && (
            <div className="rounded-md border p-2 bg-primary/5 text-center">
              <span className="text-xs text-muted-foreground">Umidade calculada</span>
              <div className="text-xl font-semibold">{w.toFixed(2)}%</div>
            </div>
          )}

          {ultimas.length > 0 && (
            <div className="rounded-md border p-2">
              <p className="text-xs font-semibold mb-1">Últimas registradas nesta sessão</p>
              <div className="flex flex-wrap gap-1">
                {ultimas.map((u, i) => (
                  <Badge key={i} variant="secondary" className="text-[11px]">
                    Nº {u.numero}
                    {u.w != null ? ` · w=${u.w.toFixed(2)}%` : ""}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={() => mut.mutate()} disabled={!alvo || !pesoFinal || mut.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-2" /> Salvar massa final (Enter)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}