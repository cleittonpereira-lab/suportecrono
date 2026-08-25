import { useBlocker } from "@tanstack/react-router";
import { toast } from "sonner";
import { isSavingInFlight, useIsSavingInFlight } from "@/lib/save-in-flight";

/**
 * Bloqueia a navegação (dentro do app e fechamento/recarregamento da aba)
 * enquanto houver um rascunho ou versão ainda sendo salvo no Drive, para
 * não perder o que o usuário acabou de digitar.
 */
export function useBlockExitWhileSaving(): void {
  const isSaving = useIsSavingInFlight();

  useBlocker({
    shouldBlockFn: () => {
      if (!isSavingInFlight()) return false;
      toast.warning("Rascunho sendo salvo no Drive…", {
        description: "Aguarde alguns segundos antes de sair para não perder as informações.",
      });
      return true;
    },
    enableBeforeUnload: isSaving,
  });
}
