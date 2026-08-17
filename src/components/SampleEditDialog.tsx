import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Edit3, Check, Beaker, MapPin, Building, Sparkles } from "lucide-react";
import { labStore } from "@/features/lab/store";
import { toast } from "sonner";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listRows } from "@/lib/programacao.functions";
import { normOs } from "@/lib/schedule-utils";

export interface SampleEditData {
  osId?: string;
  amostraId?: string;
  osNumero?: string;
  client?: string;
  workNumber?: string;
  local?: string;
  technicalResp?: string;
  revision?: string;
  reportNumber?: string;
  code?: string;
  borehole?: string;
  depth?: string;
  coordN?: number | string;
  coordE?: number | string;
  coordCota?: number | string;
  datum?: string;
  sampleType?: string; // Bloco indeformado, Tubo Shelby, etc.
  sampleState?: string; // indeformada, compactada, recompactada
  description?: string; // Caracterização tátil-visual
  granulometricDescription?: string; // Descrição granulométrica
  materialType?: string; // Argila, Silte, Areia, Solo Residual, etc.
  equipment?: string;
}

interface SampleEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: SampleEditData;
  onSave: (updated: SampleEditData) => void;
}

import { parseGanttSampleData } from "@/lib/sample-parser";

export function SampleEditDialog({
  open,
  onOpenChange,
  data,
  onSave,
}: SampleEditDialogProps) {
  const [form, setForm] = useState<SampleEditData>(data);
  const rowsFn = useServerFn(listRows);

  const { data: amostrasGantt = [] } = useQuery({
    queryKey: ["gantt-amostras-dialog"],
    queryFn: async () => rowsFn({ data: { sheet: "Amostras" } }),
    staleTime: 60_000,
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      let next = { ...data };
      if (!next.technicalResp || next.technicalResp.includes("Maurício Silva")) {
        next.technicalResp = "Engº Maurício Malanconi - CREA: 5063078630";
      }

      // Se faltar furo ou profundidade, resolve automaticamente a partir da tabela do Gantt
      if (amostrasGantt.length > 0) {
        const needle = (next.reportNumber || next.code || "").trim();
        const matchAm =
          amostrasGantt.find(
            (a) =>
              (a.codigo_amostra === needle || a.identificacao === needle || String(a.id) === needle) &&
              (!next.osNumero || normOs(a.os_numero || "") === normOs(next.osNumero)),
          ) ||
          amostrasGantt.find((a) => a.codigo_amostra === needle || a.identificacao === needle || String(a.id) === needle);

        if (matchAm) {
          const parsed = parseGanttSampleData(matchAm);
          if (!next.borehole && parsed.furo) next.borehole = parsed.furo;
          if (!next.depth && parsed.prof) next.depth = parsed.prof;
          if (!next.sampleType && parsed.tipo) next.sampleType = parsed.tipo;
          if (!next.description && parsed.desc) next.description = parsed.desc;
          if (!next.code && parsed.codigo) next.code = parsed.codigo;
        }
      }

      setForm(next);
    }
  }, [open, data, amostrasGantt]);

  const update = (key: keyof SampleEditData, val: any) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = () => {
    // 1. Atualiza no labStore se houver osId e amostraId
    if (form.osId) {
      labStore.patchOS(form.osId, {
        client: form.client,
        workNumber: form.workNumber,
        local: form.local,
        technicalResp: form.technicalResp,
        revision: form.revision,
      });

      if (form.amostraId) {
        labStore.patchAmostra(form.osId, form.amostraId, {
          reportNumber: form.reportNumber || form.code,
          code: form.code || form.reportNumber,
          borehole: form.borehole,
          depth: form.depth,
          description: form.description,
          granulometricDescription: form.granulometricDescription,
          coords: {
            N: Number(form.coordN) || 0,
            E: Number(form.coordE) || 0,
            cota: Number(form.coordCota) || 0,
            datum: form.datum || "SIRGAS 2000 / UTM 23S",
          },
        });
      }
    }

    onSave(form);
    toast.success("Dados da amostra e memorial atualizados com sucesso!");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader className="pb-2 border-b">
          <div className="flex items-center gap-2">
            <Edit3 className="h-5 w-5 text-primary" />
            <div>
              <DialogTitle className="text-base font-bold">
                Editar Cadastro da Amostra & Caracterização
              </DialogTitle>
              <DialogDescription className="text-xs">
                Edite os dados geológico-geotécnicos, caracterização tátil-visual, granulometria e localização da amostra.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-3 space-y-4">
          <Tabs defaultValue="amostra" className="w-full">
            <TabsList className="grid grid-cols-3 bg-muted/40 p-1 mb-3">
              <TabsTrigger value="amostra" className="text-xs">Identificação & Furo</TabsTrigger>
              <TabsTrigger value="material" className="text-xs">Caracterização do Material</TabsTrigger>
              <TabsTrigger value="obra" className="text-xs">Obra & Localização</TabsTrigger>
            </TabsList>

            {/* Aba 1: Identificação da Amostra & Furo */}
            <TabsContent value="amostra" className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Identificação da Amostra (Nº Laudo) *</Label>
                  <Input
                    className="h-8 text-xs font-mono font-bold"
                    placeholder="Ex: 11545-02"
                    value={form.reportNumber || ""}
                    onChange={(e) => update("reportNumber", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Código de Coleta</Label>
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder="Ex: AM-01"
                    value={form.code || ""}
                    onChange={(e) => update("code", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Furo de Sondagem</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Ex: SP-01 ou SH-402-01"
                    value={form.borehole || ""}
                    onChange={(e) => update("borehole", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Profundidade da Coleta (m)</Label>
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder="Ex: 2,00 – 5,00 m"
                    value={form.depth || ""}
                    onChange={(e) => update("depth", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Tipo de Amostragem</Label>
                  <Select
                    value={form.sampleType || "Bloco indeformado"}
                    onValueChange={(v) => update("sampleType", v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bloco indeformado">Bloco indeformado</SelectItem>
                      <SelectItem value="Tubo Shelby">Tubo Shelby (Paredes Finas)</SelectItem>
                      <SelectItem value="Denison">Amostrador Denison</SelectItem>
                      <SelectItem value="Amostra Deformada">Amostra Deformada (Saco)</SelectItem>
                      <SelectItem value="Trado helicoidal">Trado helicoidal</SelectItem>
                      <SelectItem value="Poço de inspeção">Poço de inspeção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Condição da Amostra</Label>
                  <Select
                    value={form.sampleState || "indeformada"}
                    onValueChange={(v) => update("sampleState", v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="indeformada">Indeformada</SelectItem>
                      <SelectItem value="compactada">Compactada em Laboratório</SelectItem>
                      <SelectItem value="recompactada">Recompactada</SelectItem>
                      <SelectItem value="deformada">Deformada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* Aba 2: Caracterização do Material & Granulometria */}
            <TabsContent value="material" className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Caracterização Tátil-Visual / Descrição Geológico-Geotécnica *</Label>
                <Textarea
                  className="text-xs min-h-[60px]"
                  placeholder="Ex: Argila siltosa com traços de areia fina, marrom-avermelhada, consistência rija, plástica, saturada."
                  value={form.description || ""}
                  onChange={(e) => update("description", e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Caracterização Granulométrica (Texto Resumido) *</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Ex: Argila (65%) · Silte (28%) · Areia fina (7%)"
                  value={form.granulometricDescription || ""}
                  onChange={(e) => update("granulometricDescription", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de Solo Predominante</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Ex: Argila Siltosa"
                    value={form.materialType || ""}
                    onChange={(e) => update("materialType", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Equipamento Utilizado</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Ex: CIS-001 / Prensa Automática"
                    value={form.equipment || ""}
                    onChange={(e) => update("equipment", e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Aba 3: Obra & Localização */}
            <TabsContent value="obra" className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-xs">Cliente / Tomador</Label>
                  <Input
                    className="h-8 text-xs"
                    value={form.client || ""}
                    onChange={(e) => update("client", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Obra / Projeto</Label>
                  <Input
                    className="h-8 text-xs"
                    value={form.workNumber || ""}
                    onChange={(e) => update("workNumber", e.target.value)}
                  />
                </div>

                <div className="space-y-1 col-span-full">
                  <Label className="text-xs">Localização Física / Trecho</Label>
                  <Input
                    className="h-8 text-xs text-emerald-800 dark:text-emerald-300 font-medium"
                    placeholder="Ex: Rodovia SP-079 - km 097,650 ao km 121,770"
                    value={form.local || ""}
                    onChange={(e) => update("local", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Coordenada Norte (N)</Label>
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder="Ex: 7482350.12"
                    value={String(form.coordN ?? "")}
                    onChange={(e) => update("coordN", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Coordenada Leste (E)</Label>
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder="Ex: 231540.55"
                    value={String(form.coordE ?? "")}
                    onChange={(e) => update("coordE", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Cota Altimétrica (m)</Label>
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder="Ex: 512.40"
                    value={String(form.coordCota ?? "")}
                    onChange={(e) => update("coordCota", e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Responsável Técnico</Label>
                  <Input
                    className="h-8 text-xs"
                    value={form.technicalResp || "Engº Maurício Malanconi - CREA: 5063078630"}
                    onChange={(e) => update("technicalResp", e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} className="gap-1.5 bg-primary text-primary-foreground">
            <Check className="h-4 w-4" /> Salvar Dados da Amostra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
