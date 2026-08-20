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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Edit2, CircleDot, Check, FileSpreadsheet, Upload, Layers } from "lucide-react";
import {
  getAneisCatalog,
  fetchRemoteAneisCatalog,
  saveAnelToCatalog,
  saveMultipleAneisToCatalog,
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
  const [viewTab, setViewTab] = useState<"lista" | "importar" | "novo">("lista");
  const [categoryFilter, setCategoryFilter] = useState<"todos" | "adensamento" | "cisalhamento">(
    ensaioFiltro && ensaioFiltro !== "ambos" ? ensaioFiltro : "todos"
  );

  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [numero, setNumero] = useState("");
  const [ensaio, setEnsaio] = useState<"cisalhamento" | "adensamento" | "ambos">("adensamento");
  const [secao, setSecao] = useState<"circular" | "quadrada">("circular");
  const [dimensaoMm, setDimensaoMm] = useState("50.10");
  const [alturaMm, setAlturaMm] = useState("20.02");
  const [massaG, setMassaG] = useState("107.31");
  const [material, setMaterial] = useState("Aço Inox");
  const [observacoes, setObservacoes] = useState("");

  // Import / Paste State
  const [pastedText, setPastedText] = useState("");
  const [importDefaultEnsaio, setImportDefaultEnsaio] = useState<"adensamento" | "cisalhamento" | "ambos">("adensamento");
  const [importReplace, setImportReplace] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<Omit<AnelItem, "id" | "area_cm2" | "volume_cm3">[]>([]);

  const reload = () => {
    setAneis(getAneisCatalog());
    fetchRemoteAneisCatalog().then((remoteList) => {
      if (remoteList && remoteList.length > 0) setAneis(remoteList);
    });
  };

  useEffect(() => {
    if (open) {
      reload();
      if (ensaioFiltro && ensaioFiltro !== "ambos") {
        setCategoryFilter(ensaioFiltro);
        setEnsaio(ensaioFiltro);
        setImportDefaultEnsaio(ensaioFiltro);
      }
    }
  }, [open, ensaioFiltro]);

  const geoPreview = calculateRingGeometry(
    secao,
    parseFloat(dimensaoMm) || 50,
    parseFloat(alturaMm) || 20,
  );

  const handleSave = () => {
    if (!numero.trim()) {
      toast.error("Informe o número / código do anel (ex: 1, AN-01)");
      return;
    }
    const d = parseFloat(dimensaoMm.replace(",", ".")) || 50;
    const h = parseFloat(alturaMm.replace(",", ".")) || 20;
    const m = parseFloat(massaG.replace(",", ".")) || 0;

    saveAnelToCatalog({
      id: editingId || undefined,
      numero: numero.trim(),
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
    setViewTab("lista");
    setEditingId(null);
  };

  const handleEdit = (a: AnelItem) => {
    setEditingId(a.id);
    setNumero(a.numero);
    setEnsaio(a.ensaio);
    setSecao(a.secao);
    setDimensaoMm(String(a.diametro_mm || a.lado_mm || 50));
    setAlturaMm(String(a.altura_mm || 20));
    setMassaG(String(a.massa_g || 0));
    setMaterial(a.material || "Aço Inox");
    setObservacoes(a.observacoes || "");
    setViewTab("novo");
  };

  const handleDelete = (id: string) => {
    deleteAnelFromCatalog(id);
    toast.success("Anel removido do catálogo.");
    reload();
  };

  const startNew = () => {
    setEditingId(null);
    setNumero(String(aneis.length + 1));
    setSecao("circular");
    setDimensaoMm("50.00");
    setAlturaMm("20.00");
    setMassaG("100.00");
    setMaterial("Aço Inox");
    setObservacoes("");
    setViewTab("novo");
  };

  // Parser de Planilha Colada (Ctrl + V)
  useEffect(() => {
    if (!pastedText.trim()) {
      setParsedPreview([]);
      return;
    }

    const lines = pastedText.split(/\r?\n/);
    const parsed: Omit<AnelItem, "id" | "area_cm2" | "volume_cm3">[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Detecta separadores (tabulação, vírgula, ponto-e-vírgula ou múltiplos espaços)
      const cols = line.includes("\t")
        ? line.split("\t").map((c) => c.trim())
        : line.includes(";")
        ? line.split(";").map((c) => c.trim())
        : line.split(/\s{2,}/).map((c) => c.trim());

      if (cols.length < 3) continue;

      // Pula cabeçalhos comuns
      const c0Lower = cols[0].toLowerCase();
      if (c0Lower.includes("número") || c0Lower.includes("numero") || c0Lower.includes("código") || c0Lower.includes("anel")) {
        continue;
      }

      // Extrai colunas
      // Formato esperado: NÚMERO | TIPO (C/Q) | MASSA (g) | ALTURA (mm) | DIMENSÃO (mm)
      const numStr = cols[0];
      let tipoStr = cols[1]?.toUpperCase() || "C";
      let massaStr = cols[2];
      let alturaStr = cols[3];
      let dimStr = cols[4];

      // Caso tenha apenas 4 colunas (NÚMERO, MASSA, ALTURA, DIMENSÃO)
      if (cols.length === 4 && (tipoStr.includes(",") || !isNaN(parseFloat(tipoStr)))) {
        dimStr = cols[3];
        alturaStr = cols[2];
        massaStr = cols[1];
        tipoStr = "C";
      }

      if (!numStr || !massaStr) continue;

      const isQuad = tipoStr.startsWith("Q");
      const secao: "circular" | "quadrada" = isQuad ? "quadrada" : "circular";

      const massaVal = parseFloat(massaStr.replace(",", "."));
      const alturaVal = parseFloat((alturaStr || "20").replace(",", "."));
      const dimVal = parseFloat((dimStr || "60").replace(",", "."));

      if (isNaN(massaVal) || isNaN(alturaVal) || isNaN(dimVal)) continue;

      // Determina sugestão de ensaio por dimensao/formato
      let ensaioSug: "adensamento" | "cisalhamento" | "ambos" = importDefaultEnsaio;
      if (isQuad) {
        ensaioSug = "cisalhamento";
      } else if (dimVal >= 70) {
        ensaioSug = "adensamento";
      } else if (dimVal <= 51 && massaVal > 100) {
        ensaioSug = "adensamento";
      } else if (dimVal >= 60 && dimVal <= 65) {
        ensaioSug = "cisalhamento";
      }

      parsed.push({
        numero: numStr,
        ensaio: ensaioSug,
        secao,
        diametro_mm: secao === "circular" ? dimVal : undefined,
        lado_mm: secao === "quadrada" ? dimVal : undefined,
        altura_mm: alturaVal,
        massa_g: massaVal,
        material: "Aço Inox",
        observacoes: `Anel ${secao === "circular" ? "Ø" + dimVal : dimVal + "x" + dimVal}mm (${tipoStr})`,
      });
    }

    setParsedPreview(parsed);
  }, [pastedText, importDefaultEnsaio]);

  const handleExecuteImport = () => {
    if (parsedPreview.length === 0) {
      toast.error("Nenhum dado válido identificado para importação.");
      return;
    }

    saveMultipleAneisToCatalog(parsedPreview, importReplace);
    toast.success(`${parsedPreview.length} anéis importados com sucesso!`);
    reload();
    setPastedText("");
    setParsedPreview([]);
    setViewTab("lista");
  };

  const filteredAneis = aneis.filter((a) => {
    if (categoryFilter === "todos") return true;
    return a.ensaio === categoryFilter || a.ensaio === "ambos";
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-3 border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                <CircleDot className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  Gerenciamento Central de Anéis
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Cadastre, filtre e importe anéis de <b>Adensamento</b> e <b>Cisalhamento</b> com tara, geometria e cálculo automático.
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={viewTab === "importar" ? "default" : "outline"}
                onClick={() => setViewTab("importar")}
                className="h-8 gap-1.5 text-xs"
              >
                <Upload className="h-3.5 w-3.5 text-amber-500" /> Importar Planilha
              </Button>
              <Button
                size="sm"
                variant={viewTab === "novo" ? "default" : "outline"}
                onClick={startNew}
                className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Novo Anel
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Abas de Navegação & Filtros de Ensaio */}
        <div className="flex items-center justify-between pt-2">
          <Tabs value={viewTab} onValueChange={(v: any) => setViewTab(v)} className="w-full">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <TabsList className="h-9 bg-muted/60 p-1">
                <TabsTrigger value="lista" className="text-xs gap-1.5 font-semibold">
                  <Layers className="h-3.5 w-3.5" /> Catálogo de Anéis ({aneis.length})
                </TabsTrigger>
                <TabsTrigger value="importar" className="text-xs gap-1.5 font-semibold">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Colar Planilha
                </TabsTrigger>
                <TabsTrigger value="novo" className="text-xs gap-1.5 font-semibold">
                  <Plus className="h-3.5 w-3.5" /> {editingId ? "Editar Anel" : "Cadastro Manual"}
                </TabsTrigger>
              </TabsList>

              {viewTab === "lista" && (
                <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-md border border-border/60">
                  <span className="text-[11px] font-semibold text-muted-foreground px-2">Filtrar:</span>
                  <Button
                    size="sm"
                    variant={categoryFilter === "todos" ? "default" : "ghost"}
                    className="h-7 text-xs px-2.5"
                    onClick={() => setCategoryFilter("todos")}
                  >
                    Todos ({aneis.length})
                  </Button>
                  <Button
                    size="sm"
                    variant={categoryFilter === "adensamento" ? "default" : "ghost"}
                    className="h-7 text-xs px-2.5"
                    onClick={() => setCategoryFilter("adensamento")}
                  >
                    Adensamento ({aneis.filter((a) => a.ensaio === "adensamento" || a.ensaio === "ambos").length})
                  </Button>
                  <Button
                    size="sm"
                    variant={categoryFilter === "cisalhamento" ? "default" : "ghost"}
                    className="h-7 text-xs px-2.5"
                    onClick={() => setCategoryFilter("cisalhamento")}
                  >
                    Cisalhamento ({aneis.filter((a) => a.ensaio === "cisalhamento" || a.ensaio === "ambos").length})
                  </Button>
                </div>
              )}
            </div>

            {/* TAB 1: LISTAGEM DE ANÉIS */}
            <TabsContent value="lista" className="m-0 space-y-3 flex-1 overflow-hidden flex flex-col">
              <div className="rounded-lg border overflow-y-auto max-h-[50vh] relative shadow-2xs">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur-xs z-10 shadow-2xs">
                    <TableRow className="bg-muted/90 text-[11px] hover:bg-muted/90">
                      <TableHead className="w-20 font-bold">Nº / Cód.</TableHead>
                      <TableHead className="w-32">Aplicação</TableHead>
                      <TableHead>Seção / Geometria</TableHead>
                      <TableHead className="text-right">Altura (mm)</TableHead>
                      <TableHead className="text-right">Área (cm²)</TableHead>
                      <TableHead className="text-right">Volume (cm³)</TableHead>
                      <TableHead className="text-right">Massa Tara (g)</TableHead>
                      <TableHead className="text-right w-28">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAneis.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
                          Nenhum anel cadastrado para o filtro selecionado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAneis.map((a) => (
                        <TableRow key={a.id} className="text-xs hover:bg-muted/20">
                          <TableCell className="font-mono font-bold text-primary text-sm">
                            {a.numero}
                          </TableCell>
                          <TableCell>
                            {a.ensaio === "adensamento" ? (
                              <Badge variant="outline" className="border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-50/50 text-[10px]">
                                Adensamento
                              </Badge>
                            ) : a.ensaio === "cisalhamento" ? (
                              <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-50/50 text-[10px]">
                                Cisalhamento
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 text-[10px]">
                                Ambos
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground">
                              {a.secao === "circular" ? `Ø ${a.diametro_mm} mm (Circular)` : `${a.lado_mm} × ${a.lado_mm} mm (Quadrada)`}
                            </div>
                            {a.observacoes && <div className="text-[10px] text-muted-foreground">{a.observacoes}</div>}
                          </TableCell>
                          <TableCell className="text-right font-mono">{a.altura_mm?.toFixed(2)}</TableCell>
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
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* TAB 2: IMPORTAR / COLAR PLANILHA */}
            <TabsContent value="importar" className="m-0 space-y-4 overflow-y-auto max-h-[55vh] pr-1">
              <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <FileSpreadsheet className="h-4 w-4" /> Colar Linhas da Planilha Excel
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Copie do Excel as colunas <b>NÚMERO | TIPO (C/Q) | MASSA (g) | ALTURA (mm) | DIMENSÃO (mm)</b> e cole no campo abaixo (Ctrl + V).
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={importReplace}
                        onChange={(e) => setImportReplace(e.target.checked)}
                        className="rounded border-border"
                      />
                      <span>Substituir catálogo existente</span>
                    </label>
                  </div>
                </div>

                <Textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`Cole aqui os dados do Excel... Exemplo:\n1\tC\t107,31\t20,02\t50,10\n6\tQ\t95,43\t19,70\t60,14`}
                  className="font-mono text-xs h-32 bg-background"
                />

                {parsedPreview.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-600">
                        ✓ {parsedPreview.length} anéis identificados com sucesso na prévia:
                      </span>
                      <Button size="sm" onClick={handleExecuteImport} className="h-8 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 text-xs">
                        <Check className="h-3.5 w-3.5" /> Confirmar Importação ({parsedPreview.length} anéis)
                      </Button>
                    </div>

                    <div className="max-h-48 overflow-y-auto rounded border bg-background">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[10px] bg-muted/50">
                            <TableHead className="w-16">Nº</TableHead>
                            <TableHead className="w-24">Ensaio</TableHead>
                            <TableHead className="w-20">Seção</TableHead>
                            <TableHead className="text-right">Dimensão (mm)</TableHead>
                            <TableHead className="text-right">Altura (mm)</TableHead>
                            <TableHead className="text-right">Massa (g)</TableHead>
                            <TableHead className="text-right">Área (cm²)</TableHead>
                            <TableHead className="text-right">Volume (cm³)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsedPreview.map((item, idx) => {
                            const dim = item.secao === "circular" ? item.diametro_mm : item.lado_mm;
                            const geo = calculateRingGeometry(item.secao, dim || 60, item.altura_mm);
                            return (
                              <TableRow key={idx} className="text-[11px]">
                                <TableCell className="font-mono font-bold text-primary">{item.numero}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[9px]">
                                    {item.ensaio}
                                  </Badge>
                                </TableCell>
                                <TableCell>{item.secao === "circular" ? "Circular" : "Quadrada"}</TableCell>
                                <TableCell className="text-right font-mono">{dim?.toFixed(2)}</TableCell>
                                <TableCell className="text-right font-mono">{item.altura_mm.toFixed(2)}</TableCell>
                                <TableCell className="text-right font-mono font-bold text-emerald-600">{item.massa_g.toFixed(2)} g</TableCell>
                                <TableCell className="text-right font-mono">{geo.area_cm2.toFixed(2)}</TableCell>
                                <TableCell className="text-right font-mono">{geo.volume_cm3.toFixed(2)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB 3: CADASTRO MANUAL / EDIÇÃO */}
            <TabsContent value="novo" className="m-0 space-y-4 overflow-y-auto max-h-[55vh] pr-1">
              <div className="border rounded-lg p-4 bg-muted/20 space-y-4">
                <div className="font-semibold text-xs text-primary flex items-center justify-between">
                  <span>{editingId ? "Editar Anel" : "Cadastrar Novo Anel"}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Número / Código *</Label>
                    <Input
                      className="h-8 text-xs font-mono font-bold"
                      placeholder="Ex: 1, 3, AN-01"
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
                        <SelectItem value="adensamento">Adensamento</SelectItem>
                        <SelectItem value="cisalhamento">Cisalhamento Direto</SelectItem>
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
                      type="text"
                      className="h-8 text-xs text-right font-mono"
                      value={dimensaoMm}
                      onChange={(e) => setDimensaoMm(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Altura H₀ (mm) *</Label>
                    <Input
                      type="text"
                      className="h-8 text-xs text-right font-mono"
                      value={alturaMm}
                      onChange={(e) => setAlturaMm(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Massa Tara Anel Vazio (g) *</Label>
                    <Input
                      type="text"
                      className="h-8 text-xs text-right font-mono font-bold text-primary"
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
                      placeholder="Ex: Anel padrão"
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
                    <span className="font-mono font-bold text-foreground">{(parseFloat(massaG.replace(",", ".")) || 0).toFixed(2)} g</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] block">Material:</span>
                    <span className="font-medium text-foreground">{material || "Aço Inox"}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setViewTab("lista")}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSave} className="gap-1.5">
                    <Check className="h-4 w-4" /> Salvar Anel
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="pt-2 border-t flex justify-between items-center sm:justify-between">
          <div className="text-[11px] text-muted-foreground">
            Total de {filteredAneis.length} anéis no catálogo filtrado.
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
