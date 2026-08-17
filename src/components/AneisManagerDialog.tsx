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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit2, CircleDot, Check, Scale, Calculator } from "lucide-react";
import {
  getAneisCatalog,
  saveAnelToCatalog,
  deleteAnelFromCatalog,
  calculateRingGeometry,
  type AnelItem,
} from "@/lib/aneis-catalog";
import { toast } from "sonner";

interface AneisManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ensaioFiltro?: "cisalhamento" | "adensamento" | "ambos";
  onSelectAnel?: (anel: AnelItem) => void;
}

export function AneisManagerDialog({
  open,
  onOpenChange,
  ensaioFiltro,
  onSelectAnel,
}: AneisManagerDialogProps) {
  const [aneis, setAneis] = useState<AnelItem[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [numero, setNumero] = useState("");
  const [ensaio, setEnsaio] = useState<"cisalhamento" | "adensamento" | "ambos">("cisalhamento");
  const [secao, setSecao] = useState<"circular" | "quadrada">("circular");
  const [dimensaoMm, setDimensaoMm] = useState("60");
  const [alturaMm, setAlturaMm] = useState("20");
  const [massaG, setMassaG] = useState("112.45");
  const [material, setMaterial] = useState("Aço Inox");
  const [observacoes, setObservacoes] = useState("");

  const reload = () => {
    setAneis(getAneisCatalog());
  };

  useEffect(() => {
    if (open) {
      reload();
      if (ensaioFiltro) setEnsaio(ensaioFiltro);
    }
  }, [open, ensaioFiltro]);

  const geoPreview = calculateRingGeometry(
    secao,
    parseFloat(dimensaoMm) || 60,
    parseFloat(alturaMm) || 20,
  );

  const handleSave = () => {
    if (!numero.trim()) {
      toast.error("Informe o número / código do anel (ex: AN-01)");
      return;
    }
    const d = parseFloat(dimensaoMm) || 60;
    const h = parseFloat(alturaMm) || 20;
    const m = parseFloat(massaG) || 0;

    saveAnelToCatalog({
      id: editingId || undefined,
      numero: numero.trim().toUpperCase(),
      ensaio,
      secao,
      diametro_mm: secao === "circular" ? d : undefined,
      lado_mm: secao === "quadrada" ? d : undefined,
      altura_mm: h,
      massa_g: m,
      material,
      observacoes,
    });

    toast.success(editingId ? "Anel atualizado!" : "Novo anel cadastrado com sucesso!");
    reload();
    setFormOpen(false);
    setEditingId(null);
  };

  const handleEdit = (a: AnelItem) => {
    setEditingId(a.id);
    setNumero(a.numero);
    setEnsaio(a.ensaio);
    setSecao(a.secao);
    setDimensaoMm(String(a.diametro_mm || a.lado_mm || 60));
    setAlturaMm(String(a.altura_mm || 20));
    setMassaG(String(a.massa_g || 0));
    setMaterial(a.material || "Aço Inox");
    setObservacoes(a.observacoes || "");
    setFormOpen(true);
  };

  const handleDelete = (id: string) => {
    deleteAnelFromCatalog(id);
    toast.success("Anel removido do catálogo.");
    reload();
  };

  const startNew = () => {
    setEditingId(null);
    setNumero(`AN-${String(aneis.length + 1).padStart(2, "0")}`);
    setSecao("circular");
    setDimensaoMm("60");
    setAlturaMm("20");
    setMassaG("112.50");
    setMaterial("Aço Inox");
    setObservacoes("");
    setFormOpen(true);
  };

  const filteredAneis = aneis.filter((a) => {
    if (!ensaioFiltro || ensaioFiltro === "ambos") return true;
    return a.ensaio === ensaioFiltro || a.ensaio === "ambos";
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="pb-2 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CircleDot className="h-5 w-5 text-primary" />
              <div>
                <DialogTitle className="text-base font-bold">
                  Catálogo de Anéis de Moldagem & Adensamento
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Cadastre e selecione os anéis padronizados com massa de tara, dimensões e cálculo automático de área e volume.
                </DialogDescription>
              </div>
            </div>
            {!formOpen && (
              <Button size="sm" onClick={startNew} className="h-8 gap-1.5 bg-primary text-xs">
                <Plus className="h-3.5 w-3.5" /> Novo Anel
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-3 space-y-4">
          {formOpen ? (
            <div className="border rounded-lg p-4 bg-muted/20 space-y-4">
              <div className="font-semibold text-xs text-primary flex items-center justify-between">
                <span>{editingId ? "Editar Anel" : "Cadastrar Novo Anel"}</span>
                <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)} className="h-6 text-xs">
                  Voltar à Lista
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Número / Código *</Label>
                  <Input
                    className="h-8 text-xs font-mono font-bold"
                    placeholder="Ex: AN-01"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">Aplicação</Label>
                  <Select value={ensaio} onValueChange={(v: any) => setEnsaio(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cisalhamento">Cisalhamento Direto</SelectItem>
                      <SelectItem value="adensamento">Adensamento</SelectItem>
                      <SelectItem value="ambos">Ambos os Ensaios</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">Tipo de Seção</Label>
                  <Select value={secao} onValueChange={(v: any) => setSecao(v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="circular">Circular (Ø)</SelectItem>
                      <SelectItem value="quadrada">Quadrada (Lado)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">
                    {secao === "circular" ? "Diâmetro Ø (mm) *" : "Lado (mm) *"}
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-8 text-xs text-right font-mono"
                    value={dimensaoMm}
                    onChange={(e) => setDimensaoMm(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">Altura H₀ (mm) *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-8 text-xs text-right font-mono"
                    value={alturaMm}
                    onChange={(e) => setAlturaMm(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">Massa do Anel Vazio / Tara (g) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-8 text-xs text-right font-mono font-semibold text-primary"
                    value={massaG}
                    onChange={(e) => setMassaG(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">Material</Label>
                  <Input
                    className="h-8 text-xs"
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">Observações</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="Ex: Anel moldagem"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                  />
                </div>
              </div>

              {/* Prévia dos Cálculos Geométricos */}
              <div className="p-3 bg-background rounded border grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground text-[10px] block">Área da Seção (A₀):</span>
                  <span className="font-mono font-bold text-primary">{geoPreview.area_cm2.toFixed(2)} cm²</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] block">Volume Inicial (V₀):</span>
                  <span className="font-mono font-bold text-primary">{geoPreview.volume_cm3.toFixed(2)} cm³</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] block">Massa de Tara:</span>
                  <span className="font-mono font-bold text-foreground">{(parseFloat(massaG) || 0).toFixed(2)} g</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] block">Material:</span>
                  <span className="font-medium text-foreground">{material || "Aço Inox"}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleSave} className="gap-1.5">
                  <Check className="h-4 w-4" /> Salvar Anel
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 text-[11px]">
                    <TableHead className="w-24">Código</TableHead>
                    <TableHead>Seção / Dimensão</TableHead>
                    <TableHead className="text-right">Altura (mm)</TableHead>
                    <TableHead className="text-right">Área (cm²)</TableHead>
                    <TableHead className="text-right">Volume (cm³)</TableHead>
                    <TableHead className="text-right">Massa Tara (g)</TableHead>
                    <TableHead className="text-right w-28">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAneis.map((a) => (
                    <TableRow key={a.id} className="text-xs hover:bg-muted/20">
                      <TableCell className="font-mono font-bold text-primary">
                        {a.numero}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {a.secao === "circular" ? `Ø ${a.diametro_mm} mm (Circular)` : `${a.lado_mm}x${a.lado_mm} mm (Quadrada)`}
                        </div>
                        {a.observacoes && <div className="text-[10px] text-muted-foreground">{a.observacoes}</div>}
                      </TableCell>
                      <TableCell className="text-right font-mono">{a.altura_mm?.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{a.area_cm2?.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{a.volume_cm3?.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {a.massa_g?.toFixed(2)} g
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onSelectAnel && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10"
                              onClick={() => {
                                onSelectAnel(a);
                                onOpenChange(false);
                              }}
                            >
                              <Check className="h-3 w-3" /> Usar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => handleEdit(a)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(a.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t flex justify-between items-center sm:justify-between">
          <div className="text-[11px] text-muted-foreground">
            Total de {filteredAneis.length} anéis disponíveis para este ensaio.
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
