import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  PackagePlus,
  CheckCircle2,
  Send,
  RotateCcw,
  Sparkles,
  User,
  Calendar,
  Copy,
  Check,
  PlusCircle,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  createChegadaRegistroAsync,
  getTipoAmostraOptions,
  addTipoAmostraOption,
  getRecebidoOptions,
  addRecebidoOption,
  formatDateToday,
  deriveFlatFieldsFromAmostras,
  useChegadaRealtimeSync,
  CHEGADA_OPTIONS_EVENT,
  type Option,
  type AmostraItem,
} from "@/lib/chegada-amostras-store";
import { ChegadaMultiSelect } from "@/components/chegada/ChegadaMultiSelect";
import { AmostrasListEditor, novaAmostraVazia } from "@/components/chegada/AmostrasListEditor";
import { SignaturePad } from "@/components/chegada/SignaturePad";

export const Route = createFileRoute("/_app/chegada-amostras/registro")({
  head: () => ({
    meta: [
      { title: "Registro de Chegada de Amostras — Suporte INFRA" },
      { name: "description", content: "Formulário operacional para colaboradores registrarem entrada de amostras." },
    ],
  }),
  component: ChegadaAmostrasRegistroPage,
});

export function ChegadaAmostrasRegistroPage() {
  const { displayName, user, profile } = useAuth();
  const currentUserName =
    displayName || profile?.nome || user?.email?.split("@")[0] || "Colaborador";

  const [tipoOptions, setTipoOptions] = useState<Option[]>(() => getTipoAmostraOptions());
  const [recebidoOptions, setRecebidoOptions] = useState<Option[]>(() => getRecebidoOptions());

  // Sincronização em tempo real entre múltiplos dispositivos
  useChegadaRealtimeSync();

  // Form State
  const [osCliente, setOsCliente] = useState("");
  const [dataChegada, setDataChegada] = useState(formatDateToday());
  const [recebidoPor, setRecebidoPor] = useState<string[]>([]);
  const [sup, setSup] = useState("");
  const [amostras, setAmostras] = useState<AmostraItem[]>(() => [novaAmostraVazia()]);
  const [assinaturaCliente, setAssinaturaCliente] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [registeredSummary, setRegisteredSummary] = useState<{ os: string; time: string } | null>(null);

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

  const handleCopyMobileLink = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const directUrl = `${origin}/registro-amostra`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(directUrl);
      setCopiedLink(true);
      toast.success("Link para celular copiado!", {
        description: directUrl,
      });
      setTimeout(() => setCopiedLink(false), 3000);
    }
  };

  const handleResetForm = () => {
    setOsCliente("");
    setDataChegada(formatDateToday());
    setRecebidoPor([]);
    setSup("");
    setAmostras([novaAmostraVazia()]);
    setAssinaturaCliente(null);
    setIsSuccess(false);
    setRegisteredSummary(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Validações
    if (!osCliente.trim()) {
      toast.error("Por favor, preencha o campo OS / Cliente.");
      return;
    }
    if (amostras.every((a) => !a.tipo.trim())) {
      toast.error("Selecione o Tipo de ao menos uma amostra.");
      return;
    }
    if (recebidoPor.length === 0) {
      toast.error("Selecione quem recebeu as amostras no campo 'Recebido por'.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { tipoAmostra, relacaoAmostras, images } = deriveFlatFieldsFromAmostras(amostras);
      const assinatura = assinaturaCliente
        ? { imagemUrl: assinaturaCliente, nome: osCliente, assinadoEm: new Date().toISOString() }
        : null;

      // 2. Cria registro automático com persistência e sincronização em nuvem
      const created = await createChegadaRegistroAsync({
        osCliente,
        dataChegada,
        tipoAmostra,
        recebidoPor,
        sup,
        relacaoAmostras,
        images,
        amostras,
        assinaturaCliente: assinatura,
        priority: "media", // Prioridade padrão inicial para triagem administrativa
        criadoPor: currentUserName,
        origem: "colaborador",
      });

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      setRegisteredSummary({
        os: osCliente,
        time: `${dataChegada} às ${timeStr}`,
      });
      setIsSuccess(true);

      toast.success("Chegada de amostra registrada com sucesso! ✓", {
        description: `OS: ${osCliente} · Registrado na esteira de entrada.`,
        duration: 5000,
      });

      // Limpa formulário
      setOsCliente("");
      setRecebidoPor([]);
      setSup("");
      setAmostras([novaAmostraVazia()]);
      setAssinaturaCliente(null);
    } catch (err: any) {
      toast.error("Erro ao registrar chegada: " + (err?.message || err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto pb-16 px-3.5 sm:px-6">
      {/* Header Visual */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 pt-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-primary flex items-center gap-1.5 font-bold">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" /> ENTRADA DE MATERIAIS & AMOSTRAS
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Registro de Chegada de Amostras
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Preencha os dados da amostra para registrar a entrada física no laboratório.
          </p>
        </div>

        {/* Botão de Copiar Link Direto para Celular */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyMobileLink}
            className="text-xs gap-1.5 shadow-2xs"
          >
            {copiedLink ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>Link Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-primary" />
                <span>Copiar Link p/ Celular</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Banner Informativo */}
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

      {isSuccess ? (
        /* Tela de Confirmação de Sucesso */
        <Card className="border-emerald-500/30 bg-emerald-500/[0.03] shadow-md text-center py-8 px-4 sm:px-8 space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 shadow-sm animate-in zoom-in-95 duration-300">
              <CheckCircle2 className="h-9 w-9 stroke-[2.5]" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              Chegada Registrada com Sucesso!
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-md leading-relaxed">
              As informações e fotos da amostra <strong className="text-foreground">{registeredSummary?.os}</strong> foram enviadas automaticamente para a coluna <strong className="text-foreground">"Registro"</strong> do laboratório para abertura da OS.
            </p>
          </div>

          <div className="bg-background/80 rounded-lg p-3.5 border text-xs text-muted-foreground max-w-sm mx-auto space-y-1">
            <div className="flex justify-between">
              <span>Registrado por:</span>
              <strong className="text-foreground font-medium">{currentUserName}</strong>
            </div>
            <div className="flex justify-between">
              <span>Data / Hora:</span>
              <strong className="text-foreground font-medium">{registeredSummary?.time}</strong>
            </div>
          </div>

          <div className="pt-2">
            <Button
              size="lg"
              onClick={handleResetForm}
              className="w-full sm:w-auto px-8 gap-2 font-bold text-sm bg-primary text-primary-foreground shadow-md hover:bg-primary/90"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Registrar Nova Amostra</span>
            </Button>
          </div>
        </Card>
      ) : (
        /* Formulário de Registro */
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
                    Preencha as informações da entrega para envio à esteira do laboratório.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase font-semibold text-primary border-primary/30">
                  Auto-registro
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-6 space-y-5">
              {/* OS/Cliente & Data de Chegada */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="osCliente" className="text-xs font-semibold flex items-center gap-1 text-foreground">
                    OS / Cliente <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="osCliente"
                    value={osCliente}
                    onChange={(e) => setOsCliente(e.target.value)}
                    placeholder="Ex: Alfa Geotecnia / OS 1029 ou Vale S.A."
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

              {/* Recebido por */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center justify-between text-foreground">
                  <span className="flex items-center gap-1">
                    Recebido por <span className="text-destructive">*</span>
                  </span>
                </Label>
                <ChegadaMultiSelect
                  options={recebidoOptions}
                  selected={recebidoPor}
                  onChange={setRecebidoPor}
                  placeholder="Quem recebeu na bancada..."
                  searchPlaceholder="Filtrar colaboradores..."
                  createButtonLabel="+ Novo Responsável"
                  createInputPlaceholder="Nome do colaborador..."
                  onAddOption={handleAddRecebidoOption}
                  icon="user"
                />
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

              {/* Amostras (repetível: tipo/identificação/profundidade/quantidade + fotos próprias) */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  Amostras <span className="text-destructive">*</span>
                </Label>
                <AmostrasListEditor
                  amostras={amostras}
                  onChange={setAmostras}
                  tipoOptions={tipoOptions}
                  onAddTipoOption={handleAddTipoOption}
                />
              </div>

              {/* Assinatura do Cliente */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <PenLine className="h-3.5 w-3.5 text-primary" />
                  Assinatura de Recebimento
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground flex flex-col justify-center">
                    <span className="font-semibold text-foreground mb-0.5">Suporte Infra</span>
                    <span>Assinado digitalmente, recebido no laboratório.</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">{osCliente.trim() || "Cliente"}</span>
                    <SignaturePad onChange={setAssinaturaCliente} />
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter className="p-4 sm:p-6 border-t bg-muted/15 flex flex-col sm:flex-row items-center justify-between gap-3">
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

              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                className="text-xs sm:text-sm font-bold gap-2 px-7 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 w-full sm:w-auto h-10"
              >
                <Send className="h-4 w-4" />
                <span>{isSubmitting ? "Registrando..." : "Registrar Chegada"}</span>
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}
    </div>
  );
}
