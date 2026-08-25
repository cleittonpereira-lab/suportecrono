import { useBlocker } from "@tanstack/react-router";
import { useIsDirty, waitUntilSaved } from "@/lib/save-in-flight";

export { waitUntilSaved };

/**
 * Bloqueia a navegação (dentro do app e fechamento/recarregamento da aba)
 * só quando há edição não salva de verdade (não a cada gravação silenciosa
 * em segundo plano). Ao tentar sair com algo pendente, devolve um "resolver"
 * (como Excel/Word): o chamador decide como perguntar "salvar e sair" ou
 * "sair sem salvar" — ver <ExitSaveDialog />.
 */
export function useBlockExitWhileSaving() {
  const dirty = useIsDirty();
  return useBlocker({ condition: dirty });
}
