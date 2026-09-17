import { useEffect } from "react";
import { Loader2 } from "lucide-react";

/**
 * Tela cheia bloqueante durante salvar/verificar/aprovar — substitui o toast
 * de canto nessas operações porque um toast não impede a pessoa de navegar
 * ou clicar em outra coisa no meio do processo (perdendo a foto/edição que
 * ainda não terminou de subir). Sem botão de fechar de propósito: só some
 * quando `open` vira `false` (a operação terminou, com sucesso ou erro).
 */
export function BlockingOverlay({ open, message }: { open: boolean; message: string }) {
  useEffect(() => {
    if (!open) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[1px]"
      role="alertdialog"
      aria-busy="true"
      aria-live="assertive"
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.preventDefault()}
    >
      <div className="flex flex-col items-center gap-3 rounded-lg bg-background px-8 py-6 shadow-xl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="max-w-xs text-center text-sm font-medium text-foreground">{message}</p>
        <p className="max-w-xs text-center text-[11px] text-muted-foreground">
          Não feche nem saia desta tela até terminar.
        </p>
      </div>
    </div>
  );
}
