/**
 * Importação de leituras do adensamento.
 *
 * Três caminhos: colar um estágio do Excel, carregar o arquivo da prensa (que
 * traz o ensaio inteiro) e editar a sequência de tensões. A leitura dos números
 * e a conversão para a convenção do cálculo ficam em domain/importacao.ts —
 * aqui só tem interface.
 */
import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, ClipboardPaste, FileUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  completarFinal,
  lerColagem,
  lerCsvDaPrensa,
  paraAcumulado,
  TEMPOS_FINAIS,
  type ModoDeslocamento,
  type SinalCompressao,
} from "../domain/importacao";
import type { OedStage, OedStageReading } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: OedStage[];
  onImportStages: (stages: OedStage[]) => void;
  selectedStageIndex?: number;
  onImportSingleStageReadings?: (stageIndex: number, readings: OedStageReading[]) => void;
}

export function OedImportDialog({
  open,
  onOpenChange,
  stages,
  onImportStages,
  selectedStageIndex = 0,
  onImportSingleStageReadings,
}: Props) {
  const [tab, setTab] = useState<"pasteSingle" | "prensa" | "manageSequence">("pasteSingle");

  /**
   * Texto colado POR ESTÁGIO. Antes era um campo só, limpo toda vez que o
   * diálogo abria — quem conferia um estágio perdia o que tinha colado.
   */
  const [textos, setTextos] = useState<Record<number, string>>({});
  const [targetStageIdx, setTargetStageIdx] = useState(selectedStageIndex);
  const [modo, setModo] = useState<ModoDeslocamento>("acumulado");
  const [sinal, setSinal] = useState<SinalCompressao>("positivo");
  const [completar, setCompletar] = useState(false);
  const [csv, setCsv] = useState("");
  const [seqStages, setSeqStages] = useState<OedStage[]>(() => JSON.parse(JSON.stringify(stages)));

  React.useEffect(() => {
    if (open) {
      setSeqStages(JSON.parse(JSON.stringify(stages)));
      setTargetStageIdx(selectedStageIndex);
    }
  }, [open, stages, selectedStageIndex]);

  const texto = textos[targetStageIdx] ?? "";
  const setTexto = (v: string) => setTextos((t) => ({ ...t, [targetStageIdx]: v }));

  /** Recalque acumulado até o fim do estágio anterior — base do modo "reinicia". */
  const acumuladoAnterior = useMemo(() => {
    const anterior = stages[targetStageIdx - 1];
    return anterior ? anterior.finalDial || 0 : 0;
  }, [stages, targetStageIdx]);

  const previa = useMemo(() => {
    const lidas = lerColagem(texto);
    if (lidas.length === 0) return { leituras: [] as OedStageReading[], estimadas: 0 };
    const convertidas = paraAcumulado(lidas, { modo, sinal, anterior: acumuladoAnterior });
    const finais = completar ? completarFinal(convertidas) : convertidas;
    return { leituras: finais, estimadas: finais.filter((l: any) => l.interpolada).length };
  }, [texto, modo, sinal, acumuladoAnterior, completar]);

  const importarEstagio = () => {
    if (previa.leituras.length === 0) {
      toast.error("Nenhum par de valores (tempo e recalque) foi encontrado.");
      return;
    }
    const leituras = previa.leituras;
    const finalDial = leituras[leituras.length - 1].d;
    if (onImportSingleStageReadings) {
      onImportSingleStageReadings(targetStageIdx, leituras);
    } else {
      const novos = [...stages];
      if (novos[targetStageIdx]) {
        novos[targetStageIdx] = { ...novos[targetStageIdx], readings: leituras, finalDial };
        onImportStages(novos);
      }
    }
    toast.success(
      `${leituras.length} leituras no Estágio ${targetStageIdx + 1}` +
        (previa.estimadas > 0 ? ` (${previa.estimadas} estimadas no fim da curva)` : ""),
    );
    onOpenChange(false);
  };

  const estagiosDoCsv = useMemo(() => (csv.trim() ? lerCsvDaPrensa(csv) : []), [csv]);

  const importarCsv = () => {
    if (estagiosDoCsv.length === 0) {
      toast.error("Não encontrei a coluna Etapa neste arquivo.");
      return;
    }
    const novos: OedStage[] = estagiosDoCsv.map((e) => {
      const convertidas = paraAcumulado(e.leituras, { modo, sinal });
      const leituras = completar ? completarFinal(convertidas) : convertidas;
      return {
        sigma: +e.sigma.toFixed(2),
        readings: leituras,
        finalDial: leituras.length ? leituras[leituras.length - 1].d : 0,
        isSeatingStage: false,
      };
    });
    onImportStages(novos);
    toast.success(`${novos.length} estágios importados do arquivo da prensa.`);
    onOpenChange(false);
  };

  const lerArquivo = (arquivo?: File | null) => {
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => setCsv(String(leitor.result ?? ""));
    leitor.onerror = () => toast.error("Não consegui ler o arquivo.");
    // A prensa grava em Windows-1252; latin1 preserva os acentos do cabeçalho.
    leitor.readAsText(arquivo, "latin1");
  };

  const handleAddStage = () => {
    const last = seqStages[seqStages.length - 1];
    setSeqStages([
      ...seqStages,
      { sigma: last ? last.sigma * 2 : 10, readings: [], finalDial: last ? last.finalDial : 0, isSeatingStage: false },
    ]);
  };

  const handleRemoveStage = (idx: number) => {
    if (seqStages.length <= 1) {
      toast.error("O ensaio deve conter no mínimo 1 estágio.");
      return;
    }
    setSeqStages(seqStages.filter((_, i) => i !== idx));
  };

  const ControlesDeLeitura = (
    <div className="grid gap-3 rounded border bg-muted/30 p-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold">Como a prensa registra o deslocamento</Label>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={modo === "acumulado" ? "default" : "outline"}
            className="h-7 flex-1 text-[11px]"
            onClick={() => setModo("acumulado")}
          >
            Leitura contínua
          </Button>
          <Button
            size="sm"
            variant={modo === "porEstagio" ? "default" : "outline"}
            className="h-7 flex-1 text-[11px]"
            onClick={() => setModo("porEstagio")}
          >
            Reinicia a cada estágio
          </Button>
        </div>
        {modo === "porEstagio" && (
          <p className="text-[10px] leading-snug text-muted-foreground">
            Soma o acumulado do estágio anterior ({acumuladoAnterior.toFixed(4)} mm).
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold">Sinal da compressão</Label>
        <div className="flex items-center gap-2 rounded border bg-background px-2 py-1">
          <Switch
            checked={sinal === "negativo"}
            onCheckedChange={(c) => setSinal(c ? "negativo" : "positivo")}
            disabled={modo !== "porEstagio"}
          />
          <span className="text-[11px]">
            {sinal === "negativo" ? "Compressão negativa (inverte)" : "Compressão positiva"}
          </span>
        </div>
        <p className="text-[10px] leading-snug text-muted-foreground">
          {modo === "porEstagio"
            ? "Algumas prensas registram recalque com sinal negativo."
            : "Só se aplica quando a leitura reinicia a cada estágio."}
        </p>
      </div>

      <div className="sm:col-span-2 flex items-center gap-2 rounded border bg-background px-2 py-1.5">
        <Switch checked={completar} onCheckedChange={setCompletar} />
        <span className="text-[11px]">
          Completar o fim da curva ({TEMPOS_FINAIS.map((t) => `${t / 60} h`).join(" · ")}) por extrapolação
        </span>
      </div>
      {completar && (
        <p className="sm:col-span-2 text-[10px] leading-snug text-amber-700 dark:text-amber-400">
          Os pontos criados são estimados pela reta do adensamento secundário sobre as últimas leituras
          medidas — ficam marcados como estimados e não substituem leitura feita.
        </p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5 text-primary" />
            Importação e Configuração de Estágios de Tensão
          </DialogTitle>
          <DialogDescription>
            Cole um estágio do Excel, carregue o arquivo da prensa ou configure a sequência de carregamento.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v: any) => setTab(v)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pasteSingle">Colar Leituras do Estágio</TabsTrigger>
            <TabsTrigger value="prensa">Arquivo da Prensa</TabsTrigger>
            <TabsTrigger value="manageSequence">Sequência de Tensões</TabsTrigger>
          </TabsList>

          <TabsContent value="pasteSingle" className="space-y-3 py-3 flex-1 flex flex-col min-h-0 overflow-auto">
            <div className="flex items-center justify-between gap-4">
              <Label className="text-xs font-semibold">Estágio de Destino:</Label>
              <select
                className="h-8 rounded border border-input bg-background px-3 text-xs"
                value={targetStageIdx}
                onChange={(e) => setTargetStageIdx(Number(e.target.value))}
              >
                {stages.map((st, i) => (
                  <option key={i} value={i}>
                    Estágio {i + 1} — s = {st.sigma} kPa {st.isSeatingStage ? "(Assentamento)" : ""}
                    {textos[i] ? " - colado" : ""}
                  </option>
                ))}
              </select>
            </div>

            {ControlesDeLeitura}

            <div className="flex-1 flex flex-col min-h-0">
              <Label className="text-xs text-muted-foreground mb-1">
                Duas colunas (<b>Tempo [min]</b> e <b>Leitura / Recalque [mm]</b>) — vírgula ou ponto decimal:
              </Label>
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="flex-1 min-h-[150px] font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {previa.leituras.length > 0
                  ? `${previa.leituras.length} leituras reconhecidas` +
                    (previa.estimadas > 0 ? ` · ${previa.estimadas} estimadas no fim` : "")
                  : "Nada reconhecido ainda."}
              </p>
            </div>

            <DialogFooter className="pt-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={importarEstagio} className="gap-1.5" disabled={previa.leituras.length === 0}>
                <CheckCircle2 className="h-4 w-4" /> Importar Leituras
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="prensa" className="space-y-3 py-3 flex-1 flex flex-col min-h-0 overflow-auto">
            <div className="rounded border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
              O arquivo da prensa traz o ensaio inteiro: a coluna <b>Etapa</b> separa os estágios de
              carregamento e descarregamento, na ordem. A etapa 0 é o assentamento e é descartada.
              <b> Isto substitui todos os estágios atuais.</b>
            </div>

            <input
              type="file"
              accept=".csv,.txt"
              onChange={(e) => lerArquivo(e.target.files?.[0])}
              className="block w-full cursor-pointer rounded border border-input bg-background p-2 text-xs file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1 file:text-xs file:text-primary-foreground"
            />

            {ControlesDeLeitura}

            <div className="flex-1 flex flex-col min-h-0">
              <Label className="text-xs text-muted-foreground mb-1">Ou cole o conteúdo do arquivo:</Label>
              <Textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                className="flex-1 min-h-[120px] font-mono text-[10px]"
              />
            </div>

            {estagiosDoCsv.length > 0 && (
              <div className="max-h-[140px] overflow-auto rounded border">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr>
                      <th className="p-1.5 text-left">Etapa</th>
                      <th className="p-1.5 text-right">Tensao (kPa)</th>
                      <th className="p-1.5 text-right">Leituras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estagiosDoCsv.map((e) => (
                      <tr key={e.etapa} className="border-t">
                        <td className="p-1.5">{e.etapa}</td>
                        <td className="p-1.5 text-right tabular-nums">{e.sigma.toFixed(1)}</td>
                        <td className="p-1.5 text-right tabular-nums">{e.leituras.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <DialogFooter className="pt-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={importarCsv} className="gap-1.5" disabled={estagiosDoCsv.length === 0}>
                <FileUp className="h-4 w-4" />
                Importar {estagiosDoCsv.length > 0 ? `${estagiosDoCsv.length} estágios` : "estágios"}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="manageSequence" className="space-y-3 py-2 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Tabela de Estágios de Carregamento e Descarregamento</Label>
              <Button size="sm" variant="outline" onClick={handleAddStage} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" /> Adicionar Estágio
              </Button>
            </div>

            <div className="flex-1 overflow-auto border rounded-md max-h-[280px]">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 sticky top-0 border-b">
                  <tr>
                    <th className="p-2 text-center w-12">#</th>
                    <th className="p-2 text-left">Tensao (kPa)</th>
                    <th className="p-2 text-center w-36">Assentamento / Contato</th>
                    <th className="p-2 text-right">Recalque Final (mm)</th>
                    <th className="p-2 text-center w-12">Excluir</th>
                  </tr>
                </thead>
                <tbody>
                  {seqStages.map((st, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/30">
                      <td className="p-2 text-center font-bold text-muted-foreground">{idx + 1}</td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={st.sigma}
                          onChange={(e) => {
                            const u = [...seqStages];
                            u[idx].sigma = parseFloat(e.target.value) || 0;
                            setSeqStages(u);
                          }}
                          className="h-7 text-xs w-28"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={st.isSeatingStage === true}
                            onCheckedChange={(c) => {
                              const u = [...seqStages];
                              u[idx].isSeatingStage = c;
                              setSeqStages(u);
                            }}
                          />
                          <span className="text-[10px] text-muted-foreground">
                            {st.isSeatingStage ? "Sim (Desconsiderar)" : "Não"}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          step="0.0001"
                          value={st.finalDial}
                          onChange={(e) => {
                            const u = [...seqStages];
                            u[idx].finalDial = parseFloat(e.target.value) || 0;
                            setSeqStages(u);
                          }}
                          className="h-7 text-xs w-24 text-right ml-auto"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveStage(idx)}
                          className="h-6 w-6 p-0 text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded border bg-blue-50/60 dark:bg-blue-950/30 p-2 text-[11px] text-blue-800 dark:text-blue-300">
              <b>Estágio de Assentamento:</b> tem o recalque registrado na ficha, mas fica fora dos
              cálculos da reta virgem e do pré-adensamento.
            </div>

            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                onClick={() => {
                  onImportStages(seqStages);
                  toast.success("Sequência de tensões atualizada.");
                  onOpenChange(false);
                }}
                className="gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" /> Salvar Sequência
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
