import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  PackagePlus,
  CheckCircle2,
  Send,
  RotateCcw,
  Sparkles,
  User,
  Calendar,
  FileText,
  PlusCircle,
  Share2,
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
  CHEGADA_OPTIONS_EVENT,
  type Option,
} from "@/lib/chegada-amostras-store";
import { ChegadaMultiSelect } from "@/components/chegada/ChegadaMultiSelect";
import { ChegadaImageGallery } from "@/components/chegada/ChegadaImageGallery";
import { SuporteLogo } from "@/components/suporte-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import {
  RecebimentoReceiptPage,
  RecebimentoReceiptPhotosPage,
  type RecebimentoReceiptData,
} from "@/components/chegada/RecebimentoReceiptTemplate";

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
  const [tipoAmostra, setTipoAmostra] = useState<string[]>([]);
  const [recebidoPor, setRecebidoPor] = useState<string[]>([]);
  const [sup, setSup] = useState("");
  const [relacaoAmostras, setRelacaoAmostras] = useState("");
  const [images, setImages] = useState<string[]>([]);
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
    setTipoAmostra([]);
    setRecebidoPor([]);
    setSup("");
    setRelacaoAmostras("");
    setImages([]);
    setIsSuccess(false);
    setRegisteredSummary(null);
    setLastReceipt(null);
  };

  /** Rasteriza o comprovante (offscreen) e devolve como Blob PDF — mesma técnica já usada nos laudos técnicos. */
  const buildReceiptPdfBlob = async (): Promise<Blob> => {
    // O container offscreen só é montado pelo React depois que `lastReceipt` é setado —
    // espera até ~2s pelo commit em vez de falhar de cara quando chamado logo em seguida.
    // O container offscreen só é montado pelo React depois que `lastReceipt` é setado —
    // espera até ~2s pelo commit em vez de falhar de cara quando chamado logo em seguida.
    let el = receiptRef.current;
    for (let tries = 0; !el && tries < 40; tries++) {
      await new Promise((r) => setTimeout(r, 50));
      el = receiptRef.current;
    }
    if (!el) throw new Error("Comprovante ainda não está pronto.");

    const prevStyle = { position: el.style.position, top: el.style.top, left: el.style.left, opacity: el.style.opacity, zIndex: el.style.zIndex };
    Object.assign(el.style, { position: "fixed", top: "0", left: "0", zIndex: "2147483647", opacity: "1" });

    // Espera 2 frames de composição pra garantir que o layout offscreen já
    // aplicou os estilos acima — com um limite de tempo, pra não travar pra
    // sempre se a aba estiver em segundo plano (rAF pausa nesse caso).
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      requestAnimationFrame(() => requestAnimationFrame(finish));
      setTimeout(finish, 400);
    });
    await new Promise((r) => setTimeout(r, 150));

    try {
      const pages = Array.from(el.querySelectorAll<HTMLElement>(".printable-report"));
      if (pages.length === 0) throw new Error("Nenhuma página do comprovante encontrada.");

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      for (let i = 0; i < pages.length; i++) {
        const dataUrl = await toPng(pages[i], {
          pixelRatio: 2.5,
          cacheBust: true,
          backgroundColor: "#ffffff",
          style: { width: "210mm", boxSizing: "border-box" },
        });
        if (i > 0) pdf.addPage("a4", "portrait");
        pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
      }
      return pdf.output("blob");
    } finally {
      Object.assign(el.style, prevStyle);
    }
  };

  /** Gera o PDF e baixa (ou abre o compartilhamento nativo, quando disponível — ex.: WhatsApp no celular). */
  const handleGerarECompartilharPdf = async (receipt: RecebimentoReceiptData, autoShare: boolean) => {
    setPdfBusy(true);
    const tid = toast.loading("Gerando comprovante em PDF…");
    try {
      const blob = await buildReceiptPdfBlob();
      const filename = `Comprovante-Recebimento_${receipt.numeroControle}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });

      if (autoShare && typeof navigator !== "undefined" && (navigator as any).canShare?.({ files: [file] })) {
        try {
          await (navigator as any).share({
            files: [file],
            title: filename,
            text: `Comprovante de recebimento ${receipt.numeroControle} — ${receipt.osCliente}`,
          });
          toast.success("Comprovante pronto para compartilhar!", { id: tid });
          return;
        } catch (shareErr: any) {
          // Usuário cancelou o compartilhamento — não é erro, só cai no download normal.
          if (shareErr?.name === "AbortError") {
            toast.dismiss(tid);
            return;
          }
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Comprovante em PDF baixado com sucesso!", { id: tid });
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
      const numeroControle = gerarNumeroControle();

      // 2. Cria registro automático com persistência e sincronização em nuvem
      const created = await createChegadaRegistroAsync({
        osCliente,
        dataChegada,
        tipoAmostra,
        recebidoPor,
        sup,
        relacaoAmostras,
        images,
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
      };
      setLastReceipt(receipt);
      setIsSuccess(true);

      toast.success("Chegada de amostra registrada com sucesso! ✓", {
        description: `OS: ${osCliente} · Registrado na esteira de entrada.`,
        duration: 5000,
      });

      // Limpa dados em segundo plano para o próximo
      setOsCliente("");
      setTipoAmostra([]);
      setRecebidoPor([]);
      setSup("");
      setRelacaoAmostras("");
      setImages([]);

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

                {/* Grid: Tipo de Amostra & Recebido por */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        Tipo de Amostra <span className="text-destructive">*</span>
                      </span>
                    </Label>
                    <ChegadaMultiSelect
                      options={tipoOptions}
                      selected={tipoAmostra}
                      onChange={setTipoAmostra}
                      placeholder="Selecione os tipos..."
                      searchPlaceholder="Filtrar tipos..."
                      createButtonLabel="+ Novo Tipo de Amostra"
                      createInputPlaceholder="Nome do novo tipo..."
                      onAddOption={handleAddTipoOption}
                      icon="tag"
                    />
                  </div>

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
                </div>

                {/* Grid: Data de Chegada & SUP */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                </div>

                {/* Relação das Amostras */}
                <div className="space-y-1.5">
                  <Label htmlFor="relacaoAmostras" className="text-xs font-semibold text-foreground flex items-center gap-1">
                    Relação das Amostras <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="relacaoAmostras"
                    value={relacaoAmostras}
                    onChange={(e) => setRelacaoAmostras(e.target.value)}
                    placeholder="Descreva a quantidade e identificação dos materiais (Ex: 04 blocos BL-01 a BL-04 e 02 sacos de solo)."
                    className="text-xs min-h-[90px] bg-background shadow-2xs leading-relaxed"
                    required
                  />
                </div>

                {/* Fotos das Amostras (Câmera + Galeria) */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      Registros Fotográficos das Amostras
                    </Label>
                    <span className="text-[10px] text-muted-foreground">Tire fotos ou escolha da galeria</span>
                  </div>

                  <ChegadaImageGallery images={images} onChange={setImages} />
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
          <RecebimentoReceiptPage data={lastReceipt} />
          {Array.from({ length: Math.ceil(lastReceipt.images.length / 9) }).map((_, pageIndex) => (
            <RecebimentoReceiptPhotosPage
              key={pageIndex}
              data={lastReceipt}
              photos={lastReceipt.images.slice(pageIndex * 9, pageIndex * 9 + 9)}
              pageIndex={pageIndex}
              totalPages={1 + Math.ceil(lastReceipt.images.length / 9)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
