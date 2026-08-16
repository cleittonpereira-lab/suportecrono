import React, { useState } from "react";
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
import { AlertCircle, CheckCircle2, ClipboardPaste, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
  const [tab, setTab] = useState<"pasteSingle" | "manageSequence">("pasteSingle");
  const [singleText, setSingleText] = useState("");
  const [targetStageIdx, setTargetStageIdx] = useState(selectedStageIndex);
  
  // Gestão da sequência de tensões
  const [seqStages, setSeqStages] = useState<OedStage[]>(() => JSON.parse(JSON.stringify(stages)));

  // Atualiza quando o diálogo abre
  React.useEffect(() => {
    if (open) {
      setSeqStages(JSON.parse(JSON.stringify(stages)));
      setTargetStageIdx(selectedStageIndex);
      setSingleText("");
    }
  }, [open, stages, selectedStageIndex]);

  // Parser para colar dados de tempo x leitura
  const handleParseSingle = () => {
    if (!singleText.trim()) {
      toast.error("Cole os dados no campo de texto.");
      return;
    }
    const lines = singleText.trim().split(/\r?\n/);
    const readings: OedStageReading[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      // Aceita separadores tab, ponto-e-vírgula, vírgula ou espaço
      const parts = line.split(/[\t;,\s]+/).map((p) => p.replace(",", "."));
      if (parts.length < 2) continue;

      const t = parseFloat(parts[0]);
      const d = parseFloat(parts[1]);

      if (!isNaN(t) && !isNaN(d)) {
        readings.push({ t, d });
      }
    }

    if (readings.length === 0) {
      toast.error("Nenhum par de valores válidos (Tempo e Recalque) foi encontrado.");
      return;
    }

    // Ordena por tempo crescente
    readings.sort((a, b) => a.t - b.t);

    if (onImportSingleStageReadings) {
      onImportSingleStageReadings(targetStageIdx, readings);
    } else {
      const updated = [...stages];
      if (updated[targetStageIdx]) {
        updated[targetStageIdx] = {
          ...updated[targetStageIdx],
          readings,
          finalDial: readings[readings.length - 1].d,
        };
        onImportStages(updated);
      }
    }

    toast.success(`${readings.length} leituras importadas para o Estágio ${targetStageIdx + 1} (${stages[targetStageIdx]?.sigma} kPa)!`);
    onOpenChange(false);
  };

  const handleAddStage = () => {
    const last = seqStages[seqStages.length - 1];
    const newSigma = last ? last.sigma * 2 : 10;
    setSeqStages([
      ...seqStages,
      {
        sigma: newSigma,
        readings: [],
        finalDial: last ? last.finalDial : 0,
        isSeatingStage: false,
      },
    ]);
  };

  const handleRemoveStage = (idx: number) => {
    if (seqStages.length <= 1) {
      toast.error("O ensaio deve conter no mínimo 1 estágio.");
      return;
    }
    setSeqStages(seqStages.filter((_, i) => i !== idx));
  };

  const handleSaveSequence = () => {
    onImportStages(seqStages);
    toast.success("Sequência de tensões atualizada com sucesso!");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="h-5 w-5 text-primary" />
            Importação e Configuração de Estágios de Tensão
          </DialogTitle>
          <DialogDescription>
            Cole dados brutos copiados do Excel ou configure a sequência de carregamento e assentamento.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v: any) => setTab(v)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pasteSingle">Colar Leituras do Estágio</TabsTrigger>
            <TabsTrigger value="manageSequence">Sequência de Tensões & Assentamento</TabsTrigger>
          </TabsList>

          {/* ABA 1: Colar leituras de um estágio */}
          <TabsContent value="pasteSingle" className="space-y-4 py-3 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-4">
              <Label className="text-xs font-semibold">Estágio de Destino:</Label>
              <select
                className="h-8 rounded border border-input bg-background px-3 text-xs"
                value={targetStageIdx}
                onChange={(e) => setTargetStageIdx(Number(e.target.value))}
              >
                {stages.map((st, i) => (
                  <option key={i} value={i}>
                    Estágio {i + 1} — σ = {st.sigma} kPa {st.isSeatingStage ? "(Assentamento)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <Label className="text-xs text-muted-foreground mb-1">
                Copie duas colunas do Excel (<b>Tempo [min]</b> e <b>Leitura / Recalque [mm]</b>) e cole abaixo:
              </Label>
              <Textarea
                value={singleText}
                onChange={(e) => setSingleText(e.target.value)}
                placeholder={`0.10\t0.0450\n0.25\t0.0820\n0.50\t0.1150\n1.00\t0.1520\n2.00\t0.1980\n4.00\t0.2450\n8.00\t0.2910\n15.0\t0.3340\n30.0\t0.3720\n60.0\t0.4050\n120\t0.4320\n240\t0.4560\n1440\t0.4850`}
                className="flex-1 min-h-[180px] font-mono text-xs"
              />
            </div>

            <div className="rounded border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
              💡 <b>Dica:</b> O sistema aceita valores separados por tabulação (Ctrl+C do Excel), vírgula, ponto-e-vírgula ou espaços, reconhecendo vírgulas e pontos decimais automaticamente.
            </div>

            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleParseSingle} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Importar Leituras
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* ABA 2: Gerenciar Sequência de Tensões */}
          <TabsContent value="manageSequence" className="space-y-3 py-2 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Tabela de Estágios de Carregamento & Descarregamento</Label>
              <Button size="sm" variant="outline" onClick={handleAddStage} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" /> Adicionar Estágio
              </Button>
            </div>

            <div className="flex-1 overflow-auto border rounded-md max-h-[280px]">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 sticky top-0 border-b">
                  <tr>
                    <th className="p-2 text-center w-12">#</th>
                    <th className="p-2 text-left">Tensão σ' (kPa)</th>
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
                            const val = parseFloat(e.target.value) || 0;
                            const u = [...seqStages];
                            u[idx].sigma = val;
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
                            const val = parseFloat(e.target.value) || 0;
                            const u = [...seqStages];
                            u[idx].finalDial = val;
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
              📌 <b>Estágio de Assentamento:</b> Estágios marcados como assentamento têm seu recalque registrado na ficha, mas são automaticamente desconsiderados nos cálculos da reta virgem e pré-adensamento.
            </div>

            <DialogFooter className="pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleSaveSequence} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Salvar Sequência
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
