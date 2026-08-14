import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Send, Loader2, Bot, User, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { askAssistant } from "@/lib/ai-chat.functions";
import { useSchedule } from "@/hooks/use-schedule";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Quantas OS estão atrasadas hoje?",
  "Quais são as 5 próximas entregas?",
  "Qual tomador tem mais OS em aberto?",
  "Resuma os atrasos críticos do setor Especiais",
];

interface Props {
  variant?: "floating" | "embedded";
}

export function AiAssistant({ variant = "embedded" }: Props) {
  const { data } = useSchedule();
  const ask = useServerFn(askAssistant);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const rows = (data?.rows ?? []).map((r) => ({
        os: r.os,
        tomador: r.tomador,
        setor: r.setor,
        laboratorio: r.laboratorio,
        dataPostagem: r.dataPostagem,
        dataEntrega: r.dataEntrega,
        delta: r.delta,
        volumeComp: r.volumeComp,
        volumeCaract: r.volumeCaract,
      }));
      const res = await ask({ data: { messages: next, rows } });
      setMessages((m) => [...m, { role: "assistant", content: res.text }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `⚠️ Falha: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const container =
    variant === "embedded"
      ? "flex flex-col h-[calc(100vh-8rem)] rounded-lg border bg-card"
      : "flex flex-col h-full";

  return (
    <div className={container}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">Assistente IA</div>
            <div className="text-xs text-muted-foreground">
              Pergunte sobre suas OS, prazos e entregas
            </div>
          </div>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMessages([])}
            disabled={loading}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Olá! Posso responder perguntas sobre o cronograma do laboratório.
              Experimente:
            </p>
            <div className="grid gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm rounded-md border bg-background px-3 py-2 hover:bg-accent transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "flex gap-2",
              m.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {m.role === "assistant" && (
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              {m.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <span className="whitespace-pre-wrap">{m.content}</span>
              )}
            </div>
            {m.role === "user" && (
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-muted-foreground">Pensando...</span>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t p-3 flex gap-2 items-end"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Pergunte algo sobre suas OS..."
          rows={1}
          className="min-h-[40px] max-h-32 resize-none"
          disabled={loading}
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}