import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
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
  PlusCircle,
  Share2,
  PenLine,
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
  createChegadaRegistroAsync,
  useChegadaRealtimeSync,
  gerarNumeroControle,
  deriveFlatFieldsFromAmostras,
  CHEGADA_OPTIONS_EVENT,
  type Option,
  type AmostraItem,
} from "@/lib/chegada-amostras-store";
import { ChegadaMultiSelect } from "@/components/chegada/ChegadaMultiSelect";
import { AmostrasListEditor, novaAmostraVazia } from "@/components/chegada/AmostrasListEditor";
import { SignaturePad } from "@/components/chegada/SignaturePad";
import { SuporteLogo } from "@/components/suporte-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  RecebimentoReceiptPage,
  RecebimentoReceiptPhotosPage,
  buildPhotoPages,
  type RecebimentoReceiptData,
} from "@/components/chegada/RecebimentoReceiptTemplate";
import { waitForOffscreenEl, rasterizeToPdfBlob, downloadOrShareBlob } from "@/components/chegada/recebimentoPdf";

export const Route = createFileRoute("/registro-amostra")({
  head: () => ({
    meta: [
      { title: "Registro de Chegada de Amostras — Suporte INFRA" },
      { name: "description", content: "Formulário operacional para registro de entrada de amostras no laboratório." },
      { name: "viewport", content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" },
    ],
  }),
  component: RegistroAmostraStandalonePage,
});

export function RegistroAmostraStandalonePage() {
  const { displayName, user, profile } = useAuth();
  const currentUserName =
    displayName || profile?.nome || user?.email?.split("@")[0] || "Colaborador";

  const [tipoOptions, setTipoOptions] = useState<Option[]>(() => getTipoAmostraOptions());
  const [recebidoOptions, setRecebidoOptions] = useState<Option[]>(() => getRecebidoOptions());

  // Sincronização em tempo real entre dispositivos
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
  const [registeredSummary, setRegisteredSummary] = useState<{ os: string; time: string } | null>(null);
  const [lastReceipt, setLastReceipt] = useState<RecebimentoReceiptData | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

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
    setRecebidoPor([]);
    setSup("");
    setAmostras([novaAmostraVazia()]);
    setAssinaturaCliente(null);
    setIsSuccess(false);
    setRegisteredSummary(null);
    setLastReceipt(null);
  };

  /** Gera o PDF e baixa (ou abre o compartilhamento nativo, quando disponível — ex.: WhatsApp no celular). */
  const handleGerarECompartilharPdf = async (receipt: RecebimentoReceiptData, autoShare: boolean) => {
    setPdfBusy(true);
    const tid = toast.loading("Gerando comprovante em PDF…");
    try {
      const el = await waitForOffscreenEl(() => receiptRef.current);
      const blob = await rasterizeToPdfBlob(el, (done, total) => {
        toast.loading(`Carregando fotos do comprovante… (${done}/${total})`, { id: tid });
      });
      const filename = `Comprovante-Recebimento_${receipt.numeroControle}.pdf`;
      const result = await downloadOrShareBlob(
        blob,
        filename,
        `Comprovante de recebimento ${receipt.numeroControle} — ${receipt.osCliente}`,
        autoShare
      );
      if (result === "shared") {
        toast.success("Comprovante pronto para compartilhar!", { id: tid });
      } else if (result === "share-cancelled") {
        toast.dismiss(tid);
      } else {
        toast.success("Comprovante em PDF baixado com sucesso!", { id: tid });
      }
    } catch (err: any) {
      toast.error("Erro ao gerar PDF: " + (err?.message || err), { id: tid });
    } finally {
      setPdfBusy(false);
    }
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
      const numeroControle = gerarNumeroControle();
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
        numeroControle,
      });

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      setRegisteredSummary({
        os: osCliente,
        time: `${dataChegada} às ${timeStr}`,
      });
      const receipt: RecebimentoReceiptData = {
        numeroControle: created.numeroControle || numeroControle,
        osCliente,
        dataChegada,
        horaRegistro: timeStr,
        registradoPor: currentUserName,
        tipoAmostra,
        recebidoPor,
        sup,
        relacaoAmostras,
        images,
        amostras,
        assinaturaCliente: assinatura,
      };
      setLastReceipt(receipt);
      setIsSuccess(true);

      toast.success("Chegada de amostra registrada com sucesso! ✓", {
        description: `OS: ${osCliente} · Registrado na esteira de entrada.`,
        duration: 5000,
      });

      // Limpa dados em segundo plano para o próximo
      setOsCliente("");
      setRecebidoPor([]);
      setSup("");
      setAmostras([novaAmostraVazia()]);
      setAssinaturaCliente(null);

      // 3. Gera e baixa o comprovante em PDF automaticamente.
      // (não tenta compartilhar aqui: navigator.share() exige um gesto do usuário
      // "fresco" e o await da gravação acima já pode ter consumido esse gesto — o
      // botão "Compartilhar Comprovante" da tela de sucesso cobre esse caso.)
      void handleGerarECompartilharPdf(receipt, false);
    } catch (err: any) {
      toast.error("Erro ao registrar chegada: " + (err?.message || err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/20 to-muted/40 pb-20">
      {/* Barra de Topo do Colaborador (Clean, Mobile First, Sem Links Administrativos) */}
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-md border-b px-4 py-3 shadow-2xs">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <SuporteLogo className="h-7 w-auto" />
            <div className="h-4 w-px bg-border hidden sm:block" />
            <span className="text-xs font-semibold text-muted-foreground hidden sm:inline">
              Entrada de Amostras
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-semibold text-primary border-primary/30 py-0.5">
              Portal do Colaborador
            </Badge>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Conteúdo Central */}
      <main className="max-w-2xl mx-auto px-3.5 sm:px-6 pt-5">
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
                As informações e fotos da amostra <strong className="text-foreground">{registeredSummary?.os}</strong> foram salvas e enviadas automaticamente para a coluna <strong className="text-foreground">"Registro"</strong> do laboratório para abertura da OS.
              </p>
            </div>

            <div className="bg-background/80 rounded-lg p-3.5 border text-xs text-muted-foreground max-w-sm mx-auto space-y-1">
              {lastReceipt && (
                <div className="flex justify-between">
                  <span>Nº de Controle:</span>
                  <strong className="text-foreground font-mono font-semibold">{lastReceipt.numeroControle}</strong>
                </div>
              )}
              <div className="flex justify-between">
                <span>Registrado por:</span>
                <strong className="text-foreground font-medium">{currentUserName}</strong>
              </div>
              <div className="flex justify-between">
                <span>Data / Hora:</span>
                <strong className="text-foreground font-medium">{registeredSummary?.time}</strong>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              {lastReceipt && (
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={pdfBusy}
                  onClick={() => handleGerarECompartilharPdf(lastReceipt, true)}
                  className="w-full sm:w-auto px-6 gap-2 font-bold text-sm"
                >
                  <Share2 className="h-4 w-4" />
                  <span>{pdfBusy ? "Gerando PDF..." : "Compartilhar Comprovante"}</span>
                </Button>
              )}
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-[0.18em] text-primary flex items-center gap-1.5 font-bold">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" /> RECEBIMENTO DE MATERIAIS
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Novo Registro de Chegada
              </h1>
              <p className="text-xs text-muted-foreground">
                Preencha os dados da amostra recebida na bancada.
              </p>
            </div>

            <Card className="shadow-sm border border-border/80">
              <CardHeader className="p-4 sm:p-5 pb-3 border-b bg-card">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <PackagePlus className="h-4 w-4 text-primary" />
                  Dados da Entrega
                </CardTitle>
                <CardDescription className="text-xs">
                  Os campos com <span className="text-destructive font-bold">*</span> são obrigatórios.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* OS / Cliente */}
                <div className="space-y-1.5">
                  <Label htmlFor="osCliente" className="text-xs font-semibold text-foreground flex items-center gap-1">
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

                {/* Grid: Recebido por & Data de Chegada */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        Recebido por <span className="text-destructive">*</span>
                      </span>
                    </Label>
                    <ChegadaMultiSelect
                      options={recebidoOptions}
                      selected={recebidoPor}
                      onChange={setRecebidoPor}
                      placeholder="Quem recebeu na bancada..."
                      searchPlaceholder="Filtrar responsáveis..."
                      createButtonLabel="+ Novo Responsável"
                      createInputPlaceholder="Nome do colaborador..."
                      onAddOption={handleAddRecebidoOption}
                      icon="user"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="dataChegada" className="text-xs font-semibold text-foreground flex items-center gap-1">
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

                {/* SUP / Contrato */}
                <div className="space-y-1.5">
                  <Label htmlFor="sup" className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>SUP / Contrato</span>
                    <span className="text-[10px] text-muted-foreground font-normal">Opcional</span>
                  </Label>
                  <Input
                    id="sup"
                    value={sup}
                    onChange={(e) => setSup(e.target.value)}
                    placeholder="Ex: SUP-001 ou CONTRATO-44"
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

              <CardFooter className="p-4 sm:p-5 border-t bg-muted/15 flex flex-col sm:flex-row items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetForm}
                  className="text-xs text-muted-foreground hover:text-foreground gap-1.5 w-full sm:w-auto"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Limpar</span>
                </Button>

                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className="text-xs sm:text-sm font-bold gap-2 px-6 bg-primary text-primary-foreground shadow-md hover:bg-primary/90 w-full sm:w-auto h-10"
                >
                  <Send className="h-4 w-4" />
                  <span>{isSubmitting ? "Registrando..." : "Salvar e Gerar PDF"}</span>
                </Button>
              </CardFooter>
            </Card>
          </form>
        )}
      </main>

      {/* Container offscreen usado apenas para rasterizar o comprovante em PDF */}
      {lastReceipt && (
        <div
          ref={receiptRef}
          style={{ position: "fixed", top: 0, left: "-9999px", opacity: 0, pointerEvents: "none" }}
        >
          {(() => {
            const photoPages = buildPhotoPages(lastReceipt);
            const totalPages = 1 + photoPages.length;
            return (
              <>
                <RecebimentoReceiptPage data={lastReceipt} total={totalPages} />
                {photoPages.map((groups, pageIndex) => (
                  <RecebimentoReceiptPhotosPage
                    key={pageIndex}
                    data={lastReceipt}
                    groups={groups}
                    pageIndex={pageIndex}
                    totalPages={totalPages}
                  />
                ))}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
