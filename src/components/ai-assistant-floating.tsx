import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiAssistant } from "@/components/ai-assistant";
import { cn } from "@/lib/utils";

export function AiAssistantFloating() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen((v) => !v)}
        size="icon"
        className={cn(
          "fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full shadow-lg",
          "hover:scale-105 transition-transform",
        )}
        aria-label="Abrir Assistente IA"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </Button>

      {open && (
        <div className="fixed bottom-20 right-5 z-40 w-[380px] max-w-[calc(100vw-2.5rem)] h-[600px] max-h-[calc(100vh-7rem)] rounded-lg border bg-card shadow-2xl overflow-hidden">
          <AiAssistant variant="floating" />
        </div>
      )}
    </>
  );
}