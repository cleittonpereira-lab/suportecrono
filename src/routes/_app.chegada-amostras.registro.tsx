import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  PackagePlus,
  ArrowLeft,
  CheckCircle2,
  Send,
  RotateCcw,
  Sparkles,
  ClipboardList,
  User,
  Calendar,
  Layers,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  createChegadaRegistro,
  getTipoAmostraOptions,
  addTipoAmostraOption,
  getRecebidoOptions,
  addRecebidoOption,
  formatDateToday,
  CHEGADA_OPTIONS_EVENT,
  type Option,
} from "@/lib/chegada-amostras-store";
import { ChegadaMultiSelect } from "@/components/chegada/ChegadaMultiSelect";
import { ChegadaImageGallery } from "@/components/chegada/ChegadaImageGallery";

export const Route = createFileRoute("/_app/chegada-amostras/registro")({
  component: ChegadaAmostrasRegistroPage,
});

export function ChegadaAmostrasRegistroPage() {
  const navigate = useNavigate();
  const { displayName, user, profile, role } = useAuth();
  const currentUserName =
    displayName || profile?.nome || user?.email?.split("@")[0] || "Colaborador";

  const [tipoOptions, setTipoOptions] = useState<Option[]>(() => getTipoAmostraOptions());
  const [recebidoOptions, setRecebidoOptions] = useState<Option[]>(() => getRecebidoOptions());

  // Form State
  const [osCliente, setOsCliente] = useState("");
  const [dataChegada, setDataChegada] = useState(formatDateToday());
  const [tipoAmostra, setTipoAmostra] = useState<string[]>([]);
  const [recebidoPor, setRecebidoPor] = useState<string[]>([]);
  const [sup, setSup] = useState("");
  const [relacaoAmostras, setRelacaoAmostras] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastRegisteredId, setLastRegisteredId] = useState<string | null>(null);

  // Sync options if updated elsewhere
  useEffect(() => {
    const handleOptionsUpdate = () => {
      setTipoOptions(getTipoAmostraOptions());
      setRecebidoOptions(getRecebidoOptions());
    };
    window.addEventListener(CHEGADA_OPTIONS_EVENT, handleOptionsUpdate);
    return () => window.removeEventListener(CHEGADA_OPTIONS_EVENT, handleOptionsUpdate);
  }, []);

  const handleAddTipoOption = (newOpt: string) => {
    const updated = addTipoAmostraOption(newOpt);
    setTipoOptions(updated);
    toast.success(`Tipo de amostra "${newOpt}" cadastrado com sucesso!`);
  };

  const handleAddRecebidoOption = (newOpt: string) => {
    const updated = addRecebidoOption(newOpt);
    setRecebidoOptions(updated);
    toast.success(`Responsável "${newOpt}" cadastrado com sucesso!`);
  };

  const handleResetForm = () => {
    setOsCliente("");
    setDataChegada(formatDateToday());
    setTipoAmostra([]);
    setRecebidoPor([]);
    setSup("");
    setRelacaoAmostras("");
    setImages([]);
    setLastRegisteredId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Validações
    if (!osCliente.trim()) {
      toast.error("Por favor, preencha o campo OS / Cliente.");
      return;
    }
    if (tipoAmostra.length === 0) {
      toast.error("Selecione ao menos um Tipo de Amostra.");
      return;
    }
    if (recebidoPor.length === 0) {
      toast.error("Selecione quem recebeu as amostras no campo 'Recebido por'.");
      return;
    }
    if (!relacaoAmostras.trim()) {
      toast.error("Informe a Relação das Amostras recebidas.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 2. Cria registro automático na coluna 'registro' com auditoria
      const created = createChegadaRegistro({
        osCliente,
        dataChegada,
        tipoAmostra,
        recebidoPor,
        sup,
        relacaoAmostras,
        images,
        priority: "media", // Prioridade padrão inicial, triada posteriormente pela administração
        criadoPor: currentUserName,
        origem: "colaborador",
      });

      setLastRegisteredId(created.id);
      toast.success("Chegada de amostra registrada com sucesso na coluna 'Registro'! ✓", {
        description: `OS: ${osCliente} · Registrado por ${currentUserName}`,
        duration: 5000,
      });

      // Limpa campos para permitir o próximo registro
      setOsCliente("");
      setTipoAmostra([]);
      setRecebidoPor([]);
      setSup("");
      setRelacaoAmostras("");
      setImages([]);
    } catch (err: any) {
      toast.error("Erro ao registrar chegada: " + (err?.message || err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto pb-16 px-3 sm:px-6">
      {/* Header com Navegação e Identidade Visual */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 pt-2">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            asChild
            className="h-9 w-9 shrink-0 shadow-2xs rounded-lg"
          >
            <Link to="/chegada-amostras">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-primary flex items-center gap-1.5 font-bold">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" /> ENTRADA DE MATERIAIS & AMOSTRAS
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Registro de Chegada de Amostras
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Tela operacional para colaboradores registrarem a entrada física de amostras no laboratório.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild className="text-xs gap-1.5 shadow-2xs">
            <Link to="/chegada-amostras">
              <ClipboardList className="h-3.5 w-3.5 text-primary" />
              <span>Ver Painel Geral</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Banner Informativo de Auditoria */}
      <div className="bg-muted/30 border border-border/70 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <User className="h-4 w-4 text-primary shrink-0" />
          <span>
            Registrando como: <strong className="text-foreground">{currentUserName}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-4 w-4 text-primary shrink-0" />
          <span>Data de entrada: <strong className="text-foreground">{dataChegada}</strong></span>
        </div>
      </div>

      {/* Formulário Principal de Registro */}
      <form onSubmit={handleSubmit}>
        <Card className="shadow-sm border border-border/80">
          <CardHeader className="p-4 sm:p-6 pb-3 border-b bg-card">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <PackagePlus className="h-5 w-5 text-primary" />
                  Dados da Amostra Recebida
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Preencha as informações da entrega. O registro será enviado automaticamente para a esteira administrativa.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase font-semibold text-primary border-primary/30">
                Auto-registro
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-6 space-y-5">
            {/* Grid: OS/Cliente & Data de Chegada */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="osCliente" className="text-xs font-semibold flex items-center gap-1 text-foreground">
                  OS / Cliente <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="osCliente"
                  value={osCliente}
                  onChange={(e) => setOsCliente(e.target.value)}
                  placeholder="Ex: Vale S.A. / OS 17628-26 ou Alfa Geotecnia"
                  className="text-xs h-9 bg-background shadow-2xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dataChegada" className="text-xs font-semibold flex items-center gap-1 text-foreground">
                  Data de Chegada <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="dataChegada"
                  value={dataChegada}
                  onChange={(e) => setDataChegada(e.target.value)}
                  placeholder="DD/MM/AAAA"
                  className="text-xs h-9 bg-background shadow-2xs"
                  required
                />
              </div>
            </div>

            {/* Grid: Tipo de Amostra & Recebido por */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center justify-between text-foreground">
                  <span className="flex items-center gap-1">
                    Tipo de Amostra <span className="text-destructive">*</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">Múltipla escolha</span>
                </Label>
                <ChegadaMultiSelect
                  options={tipoOptions}
                  selected={tipoAmostra}
                  onChange={setTipoAmostra}
                  placeholder="Selecione os tipos de amostra..."
                  searchPlaceholder="Filtrar tipos de amostra..."
                  createButtonLabel="+ Novo Tipo de Amostra"
                  createInputPlaceholder="Ex: DEF.80, BL.50, TUBO..."
                  onAddOption={handleAddTipoOption}
                  icon="tag"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center justify-between text-foreground">
                  <span className="flex items-center gap-1">
                    Recebido por <span className="text-destructive">*</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">Quem recebeu na bancada</span>
                </Label>
                <ChegadaMultiSelect
                  options={recebidoOptions}
                  selected={recebidoPor}
                  onChange={setRecebidoPor}
                  placeholder="Selecione quem recebeu..."
                  searchPlaceholder="Filtrar colaboradores..."
                  createButtonLabel="+ Novo Responsável"
                  createInputPlaceholder="Nome do colaborador..."
                  onAddOption={handleAddRecebidoOption}
                  icon="user"
                />
              </div>
            </div>

            {/* SUP / Contrato Financeiro */}
            <div className="space-y-1.5">
              <Label htmlFor="sup" className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Registro de Contrato / SUP</span>
                <span className="text-[10px] text-muted-foreground font-normal">Opcional</span>
              </Label>
              <Input
                id="sup"
                value={sup}
                onChange={(e) => setSup(e.target.value)}
                placeholder="Ex: SUP-2026-9812 ou CONTRATO-44"
                className="text-xs h-9 bg-background shadow-2xs"
              />
            </div>

            {/* Relação das Amostras */}
            <div className="space-y-1.5">
              <Label htmlFor="relacaoAmostras" className="text-xs font-semibold flex items-center gap-1 text-foreground">
                Relação das Amostras <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="relacaoAmostras"
                value={relacaoAmostras}
                onChange={(e) => setRelacaoAmostras(e.target.value)}
                placeholder="Ex: 04 blocos indeformados (BL-01 a BL-04), 02 tubos Shelby (ST-01, ST-02) e 5 sacos de amostras deformadas da Sondagem SP-03."
                className="text-xs min-h-[90px] bg-background shadow-2xs leading-relaxed"
                required
              />
            </div>

            {/* Registros Fotográficos (Câmera + Galeria + Lightbox) */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  Registros Fotográficos das Amostras
                </Label>
                <span className="text-[11px] text-muted-foreground">Tire fotos pelo celular ou anexe da galeria</span>
              </div>

              <ChegadaImageGallery images={images} onChange={setImages} />
            </div>
          </CardContent>

          <CardFooter className="p-4 sm:p-6 border-t bg-muted/15 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetForm}
                className="text-xs text-muted-foreground hover:text-foreground gap-1.5 w-full sm:w-auto"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Limpar Formulário</span>
              </Button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
                className="text-xs w-full sm:w-auto"
              >
                <Link to="/chegada-amostras">Cancelar</Link>
              </Button>

              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="text-xs font-bold gap-2 px-5 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 w-full sm:w-auto"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{isSubmitting ? "Registrando..." : "Registrar Chegada"}</span>
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
