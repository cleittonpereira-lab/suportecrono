/**
 * Chat cronológico por OS — registro de diálogo com cliente / medições em
 * campo. Texto e/ou anexo (foto, PDF, planilha, documento), atribuído ao
 * usuário logado, mais antigo em cima.
 */
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, Paperclip, Loader2, X, FileText, FileSpreadsheet, File as FileIcon, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { postOsChatMessage, type ChatMessage } from "@/lib/os-hub.functions";
import { fileToCompressedDataUrl } from "@/features/lab/photos";
import { useAuth } from "@/hooks/use-auth";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

type PendingFile = { dataUrl: string; name: string; mimeType: string; isImage: boolean };

function attachmentOf(m: ChatMessage): { url: string; name: string; mimeType: string } | null {
  if (m.attachment) return m.attachment;
  if (m.photoUrl) return { url: m.photoUrl, name: "foto.jpg", mimeType: "image/jpeg" };
  return null;
}

function AttachmentPreview({ att, onOpenImage, onOpenPdf }: { att: { url: string; name: string; mimeType: string }; onOpenImage: (url: string) => void; onOpenPdf: (att: { url: string; name: string }) => void }) {
  if (att.mimeType.startsWith("image/")) {
    return (
      <img
        src={att.url}
        alt={att.name}
        onClick={() => onOpenImage(att.url)}
        className="mt-1.5 max-h-64 rounded-md border border-black/10 object-contain cursor-zoom-in hover:brightness-95 transition"
      />
    );
  }
  if (att.mimeType === "application/pdf") {
    return (
      <button
        type="button"
        onClick={() => onOpenPdf(att)}
        className="mt-1.5 flex items-center gap-2 rounded-md border border-black/10 bg-background/60 px-3 py-2 text-xs hover:bg-background transition w-full text-left"
      >
        <FileText className="h-5 w-5 text-rose-600 shrink-0" />
        <span className="truncate font-medium">{att.name}</span>
      </button>
    );
  }
  const isSheet = /sheet|excel|csv/i.test(att.mimeType) || /\.(xlsx?|csv)$/i.test(att.name);
  const Icon = isSheet ? FileSpreadsheet : FileIcon;
  return (
    <a
      href={att.url}
      download={att.name}
      className="mt-1.5 flex items-center gap-2 rounded-md border border-black/10 bg-background/60 px-3 py-2 text-xs hover:bg-background transition w-full"
    >
      <Icon className={`h-5 w-5 shrink-0 ${isSheet ? "text-emerald-600" : "text-muted-foreground"}`} />
      <span className="truncate font-medium flex-1">{att.name}</span>
      <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </a>
  );
}

export function OsChatPanel({
  osNumero,
  messages,
  onPosted,
}: {
  osNumero: string;
  messages: ChatMessage[];
  onPosted: () => void;
}) {
  const { user } = useAuth();
  const postFn = useServerFn(postOsChatMessage);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [processingFile, setProcessingFile] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string } | null>(null);

  const postMutation = useMutation({
    mutationFn: (vars: { text?: string; fileDataUrl?: string; fileName?: string }) =>
      postFn({ data: { osNumero, ...vars } }),
    onSuccess: () => {
      setText("");
      setPendingFile(null);
      onPosted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProcessingFile(true);
    try {
      const isImage = file.type.startsWith("image/");
      const dataUrl = isImage ? (await fileToCompressedDataUrl(file, 1280, 0.78)).dataUrl : await fileToDataUrl(file);
      setPendingFile({ dataUrl, name: file.name, mimeType: file.type || "application/octet-stream", isImage });
    } catch {
      toast.error("Não foi possível processar o arquivo.");
    } finally {
      setProcessingFile(false);
    }
  }

  function handleSend() {
    if (!text.trim() && !pendingFile) return;
    postMutation.mutate({
      text: text.trim() || undefined,
      fileDataUrl: pendingFile?.dataUrl,
      fileName: pendingFile?.name,
    });
  }

  return (
    <div className="flex flex-col h-[560px] rounded-lg border bg-card">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-6">
            Nenhuma mensagem ainda. Registre aqui conversas com o cliente e medições de campo — tudo fica salvo em ordem.
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.authorId === user?.id;
            const att = attachmentOf(m);
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <div className={`text-[11px] font-semibold mb-0.5 ${mine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {m.authorName}
                  </div>
                  {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                  {att && (
                    <AttachmentPreview
                      att={att}
                      onOpenImage={setLightboxUrl}
                      onOpenPdf={setPdfViewer}
                    />
                  )}
                  <div className={`text-[10px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {format(new Date(m.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t p-3 space-y-2">
        {pendingFile && (
          <div className="relative inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs max-w-full">
            {pendingFile.isImage ? (
              <img src={pendingFile.dataUrl} alt="Prévia" className="h-14 rounded" />
            ) : (
              <span className="flex items-center gap-1.5 truncate max-w-[220px]">
                <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" /> {pendingFile.name}
              </span>
            )}
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              className="h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handlePickFile} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            disabled={processingFile}
            onClick={() => fileInputRef.current?.click()}
            title="Anexar foto ou documento"
          >
            {processingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Escreva uma mensagem…"
            className="min-h-9 max-h-32 text-sm resize-none"
            rows={1}
          />
          <Button
            type="button"
            size="icon"
            className="shrink-0"
            disabled={postMutation.isPending || (!text.trim() && !pendingFile)}
            onClick={handleSend}
          >
            {postMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Lightbox de imagem */}
      <Dialog open={!!lightboxUrl} onOpenChange={(o) => !o && setLightboxUrl(null)}>
        <DialogContent className="sm:max-w-3xl p-2 bg-transparent border-none shadow-none">
          <DialogTitle className="sr-only">Foto anexada</DialogTitle>
          {lightboxUrl && <img src={lightboxUrl} alt="Foto ampliada" className="w-full h-auto max-h-[85vh] object-contain rounded-md" />}
        </DialogContent>
      </Dialog>

      {/* Visualizador de PDF */}
      <Dialog open={!!pdfViewer} onOpenChange={(o) => !o && setPdfViewer(null)}>
        <DialogContent className="sm:max-w-4xl h-[85vh] p-2 flex flex-col">
          <DialogTitle className="text-sm truncate pr-6">{pdfViewer?.name}</DialogTitle>
          {pdfViewer && <iframe src={pdfViewer.url} title={pdfViewer.name} className="flex-1 w-full rounded border" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
