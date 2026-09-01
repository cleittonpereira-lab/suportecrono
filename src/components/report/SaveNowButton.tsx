/**
 * Botão "Salvar" explícito pros editores de relatório — em vez de depender
 * só do autosave (que grava com um pequeno atraso e não avisa se falhar),
 * dispara a gravação na hora e mostra o resultado de verdade. Reaproveita
 * `labStore.forceSaveNow()` (grava OS/amostra/ensaio/fotos pendentes) e,
 * opcionalmente, o `flushDraft` de cada feature (grava o rascunho
 * compartilhado — usado pra recuperação entre computadores).
 */
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { labStore } from "@/features/lab/store";

export interface DraftFlushResult {
  conflict?: boolean;
  success?: boolean;
  error?: string;
}

interface SaveNowButtonProps {
  onFlushDraft?: () => Promise<DraftFlushResult | void>;
  className?: string;
}

export function SaveNowButton({ onFlushDraft, className }: SaveNowButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    setBusy(true);
    try {
      const [, draftRes] = await Promise.all([
        labStore.forceSaveNow(),
        onFlushDraft ? onFlushDraft() : Promise.resolve(undefined),
      ]);
      if (draftRes?.conflict) {
        toast.warning("Atenção: relatório alterado em outro computador", {
          description: "Os dados foram atualizados no servidor por outro usuário — confira antes de continuar.",
        });
      } else if (draftRes?.error) {
        toast.error("Não foi possível confirmar o salvamento: " + draftRes.error);
      } else {
        toast.success("Salvo.");
      }
    } catch (err) {
      toast.error("Não foi possível salvar: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={busy} className={className}>
      {busy ? (
        <>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Salvando...
        </>
      ) : (
        <>
          <Save className="mr-1.5 h-3.5 w-3.5" /> Salvar
        </>
      )}
    </Button>
  );
}
