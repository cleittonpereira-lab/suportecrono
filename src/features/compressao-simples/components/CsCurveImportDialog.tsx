/**
 * Importação da curva carga x deformação (resultado completo) — colar ou
 * carregar arquivo TXT/CSV/XLSX, mesmo padrão do CDImportDialog do
 * Cisalhamento Direto (features/cisalhamento-direto/components/
 * CDImportDialog.tsx), mas sem a reconstrução de deslocamento zerado que só
 * faz sentido pra prensa de cisalhamento.
 */
import { useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Upload, ClipboardPaste, CheckCircle2, FileSpreadsheet, Table as TableIcon } from "lucide-react";
import type { CsCargaUnidade, CsCurvaPonto } from "../types";
import { cargaParaN } from "../calc";

type ColOrder = "deformacao_carga" | "carga_deformacao";
type DispUnit = "mm" | "cm";

export function CsCurveImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (pontos: CsCurvaPonto[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<"paste" | "file">("paste");
  const [rawText, setRawText] = useState("");
  const [colOrder, setColOrder] = useState<ColOrder>("deformacao_carga");
  const [dispUnit, setDispUnit] = useState<DispUnit>("mm");
  const [forceUnit, setForceUnit] = useState<CsCargaUnidade>("kN");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (import.meta.env.SSR) return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        setRawText(XLSX.utils.sheet_to_csv(sheet, { FS: "\t" }));
      } else {
        setRawText(await file.text());
      }
      toast.success(`Arquivo "${file.name}" carregado.`);
    } catch (err) {
      toast.error("Erro ao ler arquivo: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const parsed = useMemo<CsCurvaPonto[]>(() => {
    if (!rawText.trim()) return [];
    const dispMult = dispUnit === "cm" ? 10 : 1;
    const out: CsCurvaPonto[] = [];
    let idx = 0;
    for (const rawLine of rawText.trim().split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (/^[A-Za-zÀ-ÿ]/.test(line)) continue; // ignora cabeçalho
      const parts = line.split(/[\t;, ]+/).map((p) => p.replace(",", "."));
      if (parts.length < 2) continue;
      const a = parseFloat(parts[0]);
      const b = parseFloat(parts[1]);
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      const deformacaoMm = (colOrder === "deformacao_carga" ? a : b) * dispMult;
      const cargaRaw = colOrder === "deformacao_carga" ? b : a;
      const cargaN = cargaParaN(cargaRaw, forceUnit);
      if (cargaN == null) continue;
      out.push({ id: `pt_${idx++}`, deformacaoMm, cargaN });
    }
    return out.sort((p1, p2) => p1.deformacaoMm - p2.deformacaoMm);
  }, [rawText, colOrder, dispUnit, forceUnit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ClipboardPaste className="h-5 w-5 text-primary" />
            Importar curva carga x deformação
          </DialogTitle>
          <DialogDescription className="text-xs">
            Cole os dados copiados do Excel/prensa, ou carregue um arquivo TXT, CSV ou XLSX.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <div className="flex items-center justify-between mb-2">
              <TabsList className="grid grid-cols-2 w-48 h-8">
                <TabsTrigger value="paste" className="text-xs"><ClipboardPaste className="h-3.5 w-3.5 mr-1" /> Colar</TabsTrigger>
                <TabsTrigger value="file" className="text-xs"><Upload className="h-3.5 w-3.5 mr-1" /> Arquivo</TabsTrigger>
              </TabsList>
              {parsed.length > 0 && (
                <Badge variant="outline" className="text-xs bg-muted/40 font-mono">{parsed.length} pontos</Badge>
              )}
            </div>
            <TabsContent value="paste" className="mt-0">
              <Textarea
                placeholder={"0.00\t0\n0.25\t1.85\n0.50\t3.40\n0.75\t4.62\n1.00\t5.10\n1.25\t4.95"}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="h-36 font-mono text-xs"
              />
            </TabsContent>
            <TabsContent value="file" className="mt-0">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border hover:border-primary/60 rounded-lg p-6 text-center cursor-pointer bg-muted/20 transition-colors"
              >
                <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="font-semibold text-xs text-foreground">Clique para selecionar arquivo TXT, CSV ou XLSX</p>
                <p className="text-[11px] text-muted-foreground mt-1">Exportação da prensa ou planilha</p>
                <input ref={fileInputRef} type="file" accept=".txt,.csv,.tsv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
              </div>
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-3 gap-2 bg-muted/20 p-2.5 rounded-lg border border-border/70">
            <div>
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Ordem das colunas</Label>
              <Select value={colOrder} onValueChange={(v) => setColOrder(v as ColOrder)}>
                <SelectTrigger className="h-7 text-xs mt-1 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deformacao_carga">Deformação · Carga</SelectItem>
                  <SelectItem value="carga_deformacao">Carga · Deformação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Unidade deformação</Label>
              <Select value={dispUnit} onValueChange={(v) => setDispUnit(v as DispUnit)}>
                <SelectTrigger className="h-7 text-xs mt-1 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mm">Milímetros (mm)</SelectItem>
                  <SelectItem value="cm">Centímetros (cm)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Unidade de carga</Label>
              <Select value={forceUnit} onValueChange={(v) => setForceUnit(v as CsCargaUnidade)}>
                <SelectTrigger className="h-7 text-xs mt-1 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="N">Newtons (N)</SelectItem>
                  <SelectItem value="kgf">Quilograma-força (kgf)</SelectItem>
                  <SelectItem value="kN">Quilonewtons (kN)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {parsed.length > 0 && (
            <div className="space-y-1.5">
              <span className="font-semibold text-xs flex items-center gap-1.5"><TableIcon className="h-3.5 w-3.5 text-primary" /> Prévia ({parsed.length} pontos)</span>
              <div className="border rounded-md max-h-36 overflow-y-auto bg-background">
                <table className="w-full text-xs font-mono border-collapse">
                  <thead className="bg-muted text-[10px] text-muted-foreground sticky top-0">
                    <tr><th className="p-1 text-center border-b">#</th><th className="p-1 text-right border-b">Deform. (mm)</th><th className="p-1 text-right border-b">Carga (N)</th></tr>
                  </thead>
                  <tbody>
                    {parsed.slice(0, 8).map((p, i) => (
                      <tr key={p.id} className="border-b border-border/40">
                        <td className="p-1 text-center text-muted-foreground">{i + 1}</td>
                        <td className="p-1 text-right font-semibold text-primary">{p.deformacaoMm.toFixed(3)}</td>
                        <td className="p-1 text-right">{p.cargaN.toFixed(1)}</td>
                      </tr>
                    ))}
                    {parsed.length > 8 && (
                      <tr><td colSpan={3} className="p-1 text-center text-[10px] text-muted-foreground">... mais {parsed.length - 8} pontos ...</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            size="sm"
            disabled={parsed.length === 0}
            onClick={() => { onImport(parsed); onOpenChange(false); }}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Importar {parsed.length} pontos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
