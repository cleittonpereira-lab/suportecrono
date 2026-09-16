/**
 * Ajuste e filtragem de curvas do ensaio triaxial (CID/CIU/UU) — só admin e gestor.
 *
 * O que este diálogo faz de verdade: substitui a LEITURA BRUTA do corpo de
 * prova pela curva filtrada. Não existe curva "ajustada" paralela — depois de
 * aplicar, a tela, o laudo, a envoltória e os círculos de Mohr vêm do mesmo
 * `processSpecimen` de sempre, porque o dado que os alimenta é que mudou.
 *
 * Duas regras que evitam erro de engenharia:
 *  1. O ajuste SEMPRE parte do dado medido. Se a curva já tinha sido ajustada,
 *     o original é restaurado antes de recalcular — senão dois ajustes seguidos
 *     se acumulariam e ninguém saberia de onde veio a curva final.
 *  2. Antes de confirmar, a aba "Impacto" mostra o que muda em c', φ' e na
 *     ruptura de cada CP. Filtrar curva altera resistência; quem aplica tem de
 *     ver o tamanho do efeito.
 */
import { useMemo, useState } from "react";
import {
  CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis, Label as RLabel,
} from "recharts";
import { SlidersHorizontal, Sparkles, RotateCcw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  NOMES_DOS_METODOS, PERFIS, ajustarCurva, sugerirMetodo,
  type MetodoAjuste, type OpcoesAjuste, type RegistroDeAjuste, type Sugestao, type VariavelAjustavel,
} from "@/lib/ajuste-curvas";
import { ACCENT, BRAND, CP_COLORS, GRID, SUB } from "../constants";
import { ADAPTADORES } from "../domain/ajuste";
import { fitEnvelope, mohrCirclePoints, processSpecimen } from "../domain/calc";
import type { TriaxialSample, TriaxialSpecimen } from "../types";

const n = (v: number | null | undefined, d = 2) =>
  v == null || !isFinite(v) ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Envoltória a partir dos pontos de ruptura de cada CP. */
function envoltoriaDe(cps: TriaxialSpecimen[], amostra: TriaxialSample) {
  const resultados = cps.map((cp) => processSpecimen(cp, amostra));
  const pontos = resultados
    .map((r, i) => (r.failure ? { pPrime: r.failure.pPrime, q: r.failure.q, cp: cps[i].id } : null))
    .filter((p): p is { pPrime: number; q: number; cp: string } => p != null);
  return { resultados, envelope: fitEnvelope(pontos) };
}

export function AjusteCurvasDialog({
  sample,
  specimens,
  selecionadoId,
  autor,
  onGravar,
}: {
  sample: TriaxialSample;
  specimens: TriaxialSpecimen[];
  selecionadoId: string;
  autor: { id?: string; nome?: string };
  onGravar: (cpId: string, patch: Partial<TriaxialSpecimen>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [cpId, setCpId] = useState(selecionadoId);
  const [variavel, setVariavel] = useState<VariavelAjustavel>("tensao-desviadora");
  const [confirmando, setConfirmando] = useState(false);
  const [sugestao, setSugestao] = useState<Sugestao | null>(null);
  const [pensando, setPensando] = useState(false);

  const perfil = PERFIS[variavel];
  const [opcoes, setOpcoes] = useState<OpcoesAjuste>({
    metodo: perfil.metodoPadrao,
    janela: 7,
    percentil: perfil.percentilPadrao,
    fracaoLowess: 0.3,
    grauPolinomio: 5,
    forcarZeroInicial: perfil.forcarZeroInicial,
    permiteNegativo: perfil.permiteNegativo,
  });

  const mexer = (patch: Partial<OpcoesAjuste>) => setOpcoes((o) => ({ ...o, ...patch }));

  const adaptador = ADAPTADORES[variavel]!;
  const cpAtual = specimens.find((c) => c.id === cpId) ?? specimens[0];
  const registroAtual = cpAtual?.ajustesDeCurva?.[variavel];

  /**
   * Base do ajuste: SEMPRE o dado medido. Se já houve ajuste nesta curva,
   * desfazemos antes de recalcular (ver regra 1 no cabeçalho).
   */
  const cpBase = useMemo(() => {
    if (!cpAtual) return null;
    if (!registroAtual) return cpAtual;
    return { ...cpAtual, shear: adaptador.restaurar(cpAtual, registroAtual.original) };
  }, [cpAtual, registroAtual, adaptador]);

  const serie = useMemo(
    () => (cpBase ? adaptador.serie(cpBase, sample) : []),
    [cpBase, sample, adaptador],
  );

  const resultado = useMemo(() => ajustarCurva(serie, opcoes), [serie, opcoes]);

  /** Como ficariam TODOS os CPs se este ajuste fosse aplicado. */
  const previsao = useMemo(() => {
    if (!cpBase) return null;
    const novasLeituras = adaptador.aplicar(cpBase, sample, resultado.pontos.map((p) => p.yAjustado));
    const depois = specimens.map((c) => (c.id === cpBase.id ? { ...c, shear: novasLeituras } : c));
    const antes = specimens.map((c) => (c.id === cpBase.id ? cpBase : c));
    return {
      novasLeituras,
      antes: envoltoriaDe(antes, sample),
      depois: envoltoriaDe(depois, sample),
      cpsDepois: depois,
    };
  }, [cpBase, specimens, sample, resultado, adaptador]);

  const pontosMexidos = resultado.pontos.filter(
    (p) => Number.isFinite(p.yAjustado) && Math.abs(p.yAjustado - p.yBruto) > 1e-6,
  ).length;

  const rodarSugestao = () => {
    setPensando(true);
    // setTimeout deixa o "pensando" pintar antes do grid de modelos travar a UI.
    setTimeout(() => {
      try {
        const s = sugerirMetodo(serie, perfil);
        setSugestao(s);
        if (s) {
          mexer({
            metodo: s.melhor, janela: s.janela, percentil: s.percentil,
            grauPolinomio: s.grauPolinomio,
          });
          toast.success(`Sugerido: ${NOMES_DOS_METODOS[s.melhor]}`);
        } else {
          toast.info("Poucos pontos para sugerir um método.");
        }
      } finally {
        setPensando(false);
      }
    }, 30);
  };

  const aplicar = () => {
    if (!cpBase || !previsao) return;
    const registro: RegistroDeAjuste = {
      variavel,
      // O original é gravado uma vez só: restaurar sempre volta ao dado medido.
      original: registroAtual?.original ?? adaptador.originais(cpBase),
      metodo: resultado.metodo,
      params: resultado.params,
      opcoes,
      rmse: resultado.rmse,
      r2: resultado.r2,
      aplicadoPor: autor.nome || "—",
      aplicadoPorId: autor.id,
      aplicadoEm: new Date().toISOString(),
    };
    onGravar(cpBase.id, {
      shear: previsao.novasLeituras,
      ajustesDeCurva: { ...(cpAtual.ajustesDeCurva ?? {}), [variavel]: registro },
    });
    setConfirmando(false);
    toast.success(`Curva de ${perfil.rotulo.toLowerCase()} substituída no ${cpAtual.displayId ?? cpAtual.id}.`);
  };

  const restaurar = () => {
    if (!cpAtual || !registroAtual) return;
    const resto = { ...(cpAtual.ajustesDeCurva ?? {}) };
    delete resto[variavel];
    onGravar(cpAtual.id, {
      shear: adaptador.restaurar(cpAtual, registroAtual.original),
      ajustesDeCurva: Object.keys(resto).length ? resto : undefined,
    });
    toast.success("Dados originais restaurados.");
  };

  const corDoCp = (i: number) => specimens[i]?.color ?? CP_COLORS[i % CP_COLORS.length];
  const envAntes = previsao?.antes.envelope;
  const envDepois = previsao?.depois.envelope;

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAberto(true)}>
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Ajustar curvas
        {specimens.some((c) => c.ajustesDeCurva && Object.keys(c.ajustesDeCurva).length > 0) && (
          <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">ativo</Badge>
        )}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] p-0 flex flex-col gap-0">
          <DialogHeader className="border-b px-5 py-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-4 w-4" />
              Ajuste e filtragem de curvas
            </DialogTitle>
            <DialogDescription className="text-xs">
              Substitui a leitura bruta do corpo de prova pela curva filtrada. O dado medido fica guardado
              e pode ser restaurado. Registrado na aba Versões — não sai impresso no laudo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-end gap-3 border-b bg-muted/30 px-5 py-2.5">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Corpo de prova</Label>
              <Select value={cpId} onValueChange={setCpId}>
                <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {specimens.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.displayId ?? c.id} · σ₃={n(c.sigma3Target, 0)} kPa
                      {c.ajustesDeCurva?.[variavel] ? " · ajustada" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Curva</Label>
              <Select value={variavel} onValueChange={(v) => setVariavel(v as VariavelAjustavel)}>
                <SelectTrigger className="h-8 w-[230px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ADAPTADORES) as VariavelAjustavel[]).map((v) => (
                    <SelectItem key={v} value={v} className="text-xs">{PERFIS[v].rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {registroAtual && (
              <div className="flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px]">
                <TriangleAlert className="h-3.5 w-3.5 text-amber-600" />
                <span>
                  Curva já ajustada por <b>{registroAtual.aplicadoPor}</b> em{" "}
                  {new Date(registroAtual.aplicadoEm).toLocaleDateString("pt-BR")} ·{" "}
                  {NOMES_DOS_METODOS[registroAtual.metodo]}
                </span>
                <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={restaurar}>
                  <RotateCcw className="h-3 w-3" /> Restaurar original
                </Button>
              </div>
            )}
          </div>

          <Tabs defaultValue="curva" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-5 mt-2 self-start">
              <TabsTrigger value="curva" className="text-xs">Curva</TabsTrigger>
              <TabsTrigger value="impacto" className="text-xs">
                Impacto no ensaio
                {envAntes && envDepois &&
                  Math.abs(envDepois.phiDeg - envAntes.phiDeg) > 0.05 && (
                    <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                      φ' {envDepois.phiDeg > envAntes.phiDeg ? "+" : ""}
                      {n(envDepois.phiDeg - envAntes.phiDeg, 1)}°
                    </Badge>
                  )}
              </TabsTrigger>
            </TabsList>

            {/* ---------------- CURVA ---------------- */}
            <TabsContent value="curva" className="mt-0 min-h-0 flex-1 overflow-auto px-5 pb-4">
              <div className="grid h-full gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="flex min-h-[320px] flex-col">
                  <div className="min-h-0 flex-1">
                    <ResponsiveContainer>
                      <ComposedChart data={resultado.pontos} margin={{ top: 12, right: 16, bottom: 34, left: 8 }}>
                        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                        <XAxis type="number" dataKey="x" domain={["auto", "auto"]} tick={{ fontSize: 11 }}>
                          <RLabel value={perfil.eixoX} position="insideBottom" offset={-20} fontSize={11} />
                        </XAxis>
                        <YAxis type="number" domain={["auto", "auto"]} tick={{ fontSize: 11 }}>
                          <RLabel value={`${perfil.rotulo} [${perfil.unidade}]`} angle={-90}
                            position="insideLeft" offset={10} fontSize={11} />
                        </YAxis>
                        <Tooltip formatter={(v: number) => n(v, 2)} labelFormatter={(v) => `${perfil.eixoX} ${n(Number(v), 2)}`} />
                        <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="top" />
                        <Scatter dataKey="yBruto" name="Medido" fill={SUB} shape="circle" />
                        <Line dataKey="yEnvelope" name="Envelope" stroke={SUB} strokeDasharray="4 3"
                          strokeWidth={1.2} dot={false} isAnimationActive={false} type="monotone" />
                        <Line dataKey="yAjustado" name="Ajustada" stroke={ACCENT} strokeWidth={2.4}
                          dot={false} isAnimationActive={false} type="monotone" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-1 rounded bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
                    {perfil.nota}
                  </p>
                </div>

                {/* Controles */}
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Método</Label>
                    <Select value={opcoes.metodo}
                      onValueChange={(v) => mexer({ metodo: v as MetodoAjuste })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {perfil.metodos.map((m) => (
                          <SelectItem key={m} value={m} className="text-xs">{NOMES_DOS_METODOS[m]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button variant="secondary" size="sm" className="w-full gap-1.5 text-xs"
                    onClick={rodarSugestao} disabled={pensando || serie.length < 5}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {pensando ? "Testando modelos…" : "Sugerir método"}
                  </Button>
                  {sugestao && (
                    <p className="rounded bg-muted/50 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                      {sugestao.justificativa}
                    </p>
                  )}

                  <div className="space-y-1">
                    <Label className="flex justify-between text-[11px]">
                      <span>Janela do filtro</span><span className="text-muted-foreground">{opcoes.janela}</span>
                    </Label>
                    <Slider min={3} max={21} step={2} value={[opcoes.janela ?? 7]}
                      onValueChange={([v]) => mexer({ janela: v })} />
                  </div>

                  <div className="space-y-1">
                    <Label className="flex justify-between text-[11px]">
                      <span>Percentil do envelope</span>
                      <span className="text-muted-foreground">{n(opcoes.percentil, 2)}</span>
                    </Label>
                    <Slider min={0.5} max={0.95} step={0.05} value={[opcoes.percentil ?? 0.5]}
                      disabled={!perfil.permiteEnvelopeSuperior}
                      onValueChange={([v]) => mexer({ percentil: v })} />
                    {!perfil.permiteEnvelopeSuperior && (
                      <p className="text-[10px] leading-snug text-muted-foreground">
                        Travado na mediana: subir o envelope enviesaria esta grandeza.
                      </p>
                    )}
                  </div>

                  {opcoes.metodo === "lowess" && (
                    <div className="space-y-1">
                      <Label className="flex justify-between text-[11px]">
                        <span>Suavização (LOWESS)</span>
                        <span className="text-muted-foreground">{n(opcoes.fracaoLowess, 2)}</span>
                      </Label>
                      <Slider min={0.1} max={0.8} step={0.05} value={[opcoes.fracaoLowess ?? 0.3]}
                        onValueChange={([v]) => mexer({ fracaoLowess: v })} />
                    </div>
                  )}

                  {opcoes.metodo === "polinomial" && (
                    <div className="space-y-1">
                      <Label className="flex justify-between text-[11px]">
                        <span>Grau do polinômio</span>
                        <span className="text-muted-foreground">{opcoes.grauPolinomio}</span>
                      </Label>
                      <Slider min={2} max={8} step={1} value={[opcoes.grauPolinomio ?? 5]}
                        onValueChange={([v]) => mexer({ grauPolinomio: v })} />
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded border px-2 py-1.5">
                    <Label className="text-[11px]">Começar em zero</Label>
                    <Switch checked={!!opcoes.forcarZeroInicial}
                      onCheckedChange={(v) => mexer({ forcarZeroInicial: v })} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded border bg-muted/30 p-2 text-[11px]">
                    <div><span className="text-muted-foreground">RMSE</span><br /><b>{n(resultado.rmse, 2)}</b> {perfil.unidade}</div>
                    <div><span className="text-muted-foreground">R²</span><br /><b>{n(resultado.r2, 3)}</b></div>
                    <div className="col-span-2 text-muted-foreground">
                      {pontosMexidos} de {resultado.pontos.length} pontos mudam
                    </div>
                    {resultado.params && resultado.nomesParams && (
                      <div className="col-span-2 leading-snug text-muted-foreground">
                        {resultado.nomesParams.map((nm, i) => `${nm}=${n(resultado.params![i], 3)}`).join(" · ")}
                      </div>
                    )}
                  </div>

                  <Button className="w-full text-xs" disabled={!pontosMexidos}
                    onClick={() => setConfirmando(true)}>
                    Substituir dados da curva
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ---------------- IMPACTO ---------------- */}
            <TabsContent value="impacto" className="mt-0 min-h-0 flex-1 overflow-auto px-5 pb-4">
              <div className="grid gap-4 xl:grid-cols-3">
                <GraficoImpacto titulo="Tensão desviadora × deformação axial" alturaClasse="h-[300px]">
                  <ComposedChart margin={{ top: 8, right: 12, bottom: 28, left: 8 }}>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="eaPct" domain={[0, "auto"]} tick={{ fontSize: 10 }}>
                      <RLabel value="εa [%]" position="insideBottom" offset={-18} fontSize={10} />
                    </XAxis>
                    <YAxis type="number" domain={[0, "auto"]} tick={{ fontSize: 10 }}>
                      <RLabel value="σd [kPa]" angle={-90} position="insideLeft" offset={10} fontSize={10} />
                    </YAxis>
                    <Tooltip formatter={(v: number) => n(v, 1)} />
                    <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" />
                    {previsao?.antes.resultados.map((r, i) => (
                      specimens[i].id === cpId ? (
                        <Line key={`antes-${i}`} data={r.shearCurve} dataKey="sigmaD" name="Antes (medido)"
                          stroke={SUB} strokeDasharray="5 3" strokeWidth={1.4} dot={false}
                          type="monotone" isAnimationActive={false} />
                      ) : null
                    ))}
                    {previsao?.depois.resultados.map((r, i) => (
                      <Line key={`depois-${i}`} data={r.shearCurve} dataKey="sigmaD"
                        name={`${specimens[i].displayId ?? specimens[i].id}${specimens[i].id === cpId ? " (ajustada)" : ""}`}
                        stroke={specimens[i].id === cpId ? ACCENT : corDoCp(i)}
                        strokeWidth={specimens[i].id === cpId ? 2.4 : 1.6}
                        dot={false} type="monotone" isAnimationActive={false} />
                    ))}
                  </ComposedChart>
                </GraficoImpacto>

                <GraficoImpacto titulo="Círculos de Mohr e envoltória" alturaClasse="h-[300px]">
                  <ScatterChart margin={{ top: 8, right: 14, bottom: 28, left: 8 }}>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="sigma" domain={[0, "auto"]} tick={{ fontSize: 10 }}>
                      <RLabel value="σ' [kPa]" position="insideBottom" offset={-18} fontSize={10} />
                    </XAxis>
                    <YAxis type="number" dataKey="tau" domain={[0, "auto"]} tick={{ fontSize: 10 }}>
                      <RLabel value="τ [kPa]" angle={-90} position="insideLeft" offset={10} fontSize={10} />
                    </YAxis>
                    <Tooltip formatter={(v: number) => n(v, 1)} />
                    <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" />
                    {previsao?.depois.resultados.map((r, i) =>
                      r.failure ? (
                        <Scatter key={`c-${i}`}
                          data={mohrCirclePoints(r.failure.sigma3Prime, r.failure.sigma1Prime)}
                          name={specimens[i].displayId ?? specimens[i].id}
                          line={{ stroke: specimens[i].id === cpId ? ACCENT : corDoCp(i), strokeWidth: 1.8 }}
                          shape={() => <g />} fill={specimens[i].id === cpId ? ACCENT : corDoCp(i)} />
                      ) : null,
                    )}
                    {envAntes && (
                      <Scatter data={retaDaEnvoltoria(envAntes, previsao!.depois.resultados)}
                        name={`Antes: φ'=${n(envAntes.phiDeg, 1)}° c'=${n(envAntes.cPrime, 1)}`}
                        line={{ stroke: SUB, strokeWidth: 1.4, strokeDasharray: "5 3" }}
                        shape={() => <g />} fill={SUB} />
                    )}
                    {envDepois && (
                      <Scatter data={retaDaEnvoltoria(envDepois, previsao!.depois.resultados)}
                        name={`Depois: φ'=${n(envDepois.phiDeg, 1)}° c'=${n(envDepois.cPrime, 1)}`}
                        line={{ stroke: BRAND, strokeWidth: 2 }}
                        shape={() => <g />} fill={BRAND} />
                    )}
                  </ScatterChart>
                </GraficoImpacto>

                <GraficoImpacto titulo="Trajetória de tensões (t–s')" alturaClasse="h-[300px]">
                  <ComposedChart margin={{ top: 8, right: 12, bottom: 28, left: 8 }}>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="pPrime" domain={[0, "auto"]} tick={{ fontSize: 10 }}>
                      <RLabel value="s' [kPa]" position="insideBottom" offset={-18} fontSize={10} />
                    </XAxis>
                    <YAxis type="number" dataKey="q" domain={[0, "auto"]} tick={{ fontSize: 10 }}>
                      <RLabel value="t [kPa]" angle={-90} position="insideLeft" offset={10} fontSize={10} />
                    </YAxis>
                    <Tooltip formatter={(v: number) => n(v, 1)} />
                    <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" />
                    {previsao?.depois.resultados.map((r, i) => (
                      <Line key={`tp-${i}`} data={r.shearCurve} dataKey="q"
                        name={specimens[i].displayId ?? specimens[i].id}
                        stroke={specimens[i].id === cpId ? ACCENT : corDoCp(i)}
                        strokeWidth={specimens[i].id === cpId ? 2.2 : 1.5}
                        dot={false} type="monotone" isAnimationActive={false} />
                    ))}
                  </ComposedChart>
                </GraficoImpacto>
              </div>

              <TabelaAntesDepois
                specimens={specimens}
                antes={previsao?.antes}
                depois={previsao?.depois}
                cpId={cpId}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir os dados da curva original?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  A leitura medida de <b>{perfil.rotulo.toLowerCase()}</b> do{" "}
                  <b>{cpAtual?.displayId ?? cpAtual?.id}</b> passa a ser a curva ajustada por{" "}
                  <b>{NOMES_DOS_METODOS[resultado.metodo]}</b> ({pontosMexidos} pontos).
                </p>
                {envAntes && envDepois && (
                  <p className="rounded bg-muted px-2 py-1.5 text-xs">
                    Efeito na envoltória: φ' {n(envAntes.phiDeg, 2)}° → <b>{n(envDepois.phiDeg, 2)}°</b> ·
                    c' {n(envAntes.cPrime, 2)} → <b>{n(envDepois.cPrime, 2)} kPa</b>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  O dado medido fica guardado e pode ser restaurado a qualquer momento. Fica registrado
                  quem aplicou, quando e por qual método.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={aplicar}>Substituir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Dois pontos que desenham a reta de Mohr-Coulomb até o maior σ' em tela. */
function retaDaEnvoltoria(
  env: { phiDeg: number; cPrime: number },
  resultados: ReturnType<typeof processSpecimen>[],
) {
  const sigmaMax = Math.max(
    1,
    ...resultados.map((r) => (r.failure ? r.failure.sigma1Prime : 0)),
  ) * 1.1;
  return [
    { sigma: 0, tau: env.cPrime },
    { sigma: sigmaMax, tau: env.cPrime + Math.tan((env.phiDeg * Math.PI) / 180) * sigmaMax },
  ];
}

function GraficoImpacto({
  titulo, alturaClasse, children,
}: { titulo: string; alturaClasse: string; children: React.ReactElement }) {
  return (
    <div className="rounded border p-2">
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">{titulo}</p>
      <div className={alturaClasse}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

function TabelaAntesDepois({
  specimens, antes, depois, cpId,
}: {
  specimens: TriaxialSpecimen[];
  antes?: ReturnType<typeof envoltoriaDe>;
  depois?: ReturnType<typeof envoltoriaDe>;
  cpId: string;
}) {
  if (!antes || !depois) return null;
  const linha = (rotulo: string, a: number | null | undefined, b: number | null | undefined, casas = 2, un = "") => {
    const mudou = a != null && b != null && Math.abs(a - b) > 10 ** -casas;
    return (
      <tr className={mudou ? "bg-amber-500/5" : ""}>
        <td className="px-2 py-1">{rotulo}</td>
        <td className="px-2 py-1 text-right text-muted-foreground">{n(a, casas)}{un}</td>
        <td className="px-2 py-1 text-right font-medium">{n(b, casas)}{un}</td>
      </tr>
    );
  };
  return (
    <div className="mt-4 max-w-2xl overflow-x-auto rounded border">
      <table className="w-full text-xs">
        <thead className="bg-muted/60">
          <tr>
            <th className="px-2 py-1 text-left font-medium">Resultado</th>
            <th className="px-2 py-1 text-right font-medium">Antes</th>
            <th className="px-2 py-1 text-right font-medium">Depois</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {linha("Ângulo de atrito φ'", antes.envelope?.phiDeg, depois.envelope?.phiDeg, 2, "°")}
          {linha("Intercepto coesivo c'", antes.envelope?.cPrime, depois.envelope?.cPrime, 2, " kPa")}
          {linha("R² da envoltória", antes.envelope?.r2, depois.envelope?.r2, 3)}
          {specimens.map((cp, i) =>
            <tr key={cp.id} className={cp.id === cpId ? "bg-amber-500/5" : ""}>
              <td className="px-2 py-1">
                Ruptura {cp.displayId ?? cp.id} — t<sub>f</sub>
              </td>
              <td className="px-2 py-1 text-right text-muted-foreground">
                {n(antes.resultados[i]?.failure?.q, 1)} kPa
              </td>
              <td className="px-2 py-1 text-right font-medium">
                {n(depois.resultados[i]?.failure?.q, 1)} kPa
              </td>
            </tr>,
          )}
        </tbody>
      </table>
    </div>
  );
}
