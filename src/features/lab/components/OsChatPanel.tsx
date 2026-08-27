/**
 * Chat cronológico por OS — registro de diálogo com cliente / medições em
 * campo. Texto e/ou foto, atribuído ao usuário logado, mais antigo em cima.
 */
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, Image as ImageIcon, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { postOsChatMessage, type ChatMessage } from "@/lib/os-hub.functions";
import { fileToCompressedDataUrl } from "@/features/lab/photos";
import { useAuth } from "@/hooks/use-auth";

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
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

  const postMutation = useMutation({
    mutationFn: (vars: { text?: string; photoDataUrl?: string }) =>
      postFn({ data: { osNumero, ...vars } }),
    onSuccess: () => {
      setText("");
      setPendingPhoto(null);
      onPosted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCompressing(true);
    try {
      const { dataUrl } = await fileToCompressedDataUrl(file, 1280, 0.78);
      setPendingPhoto(dataUrl);
    } catch {
      toast.error("Não foi possível processar a imagem.");
    } finally {
      setCompressing(false);
    }
  }

  function handleSend() {
    if (!text.trim() && !pendingPhoto) return;
    postMutation.mutate({ text: text.trim() || undefined, photoDataUrl: pendingPhoto ?? undefined });
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
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <div className={`text-[11px] font-semibold mb-0.5 ${mine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {m.authorName}
                  </div>
                  {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                  {m.photoUrl && (
                    <img
                      src={m.photoUrl}
                      alt="Anexo"
                      className="mt-1.5 max-h-64 rounded-md border border-black/10 object-contain"
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
        {pendingPhoto && (
          <div className="relative inline-block">
            <img src={pendingPhoto} alt="Prévia" className="h-20 rounded-md border" />
            <button
              type="button"
              onClick={() => setPendingPhoto(null)}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickFile} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            disabled={compressing}
            onClick={() => fileInputRef.current?.click()}
            title="Anexar foto"
          >
            {compressing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
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
            disabled={postMutation.isPending || (!text.trim() && !pendingPhoto)}
            onClick={handleSend}
          >
            {postMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
