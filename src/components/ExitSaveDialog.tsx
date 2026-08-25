import { useState } from "react";
import type { useBlocker } from "@tanstack/react-router";
import { Loader2, Save, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { waitUntilSaved } from "@/lib/save-in-flight";

type BlockerResolver = ReturnType<typeof useBlocker>;

/**
 * Diálogo "estilo Excel": ao tentar sair com algo ainda não salvo, pergunta
 * se quer salvar antes de sair ou sair sem salvar — em vez de ficar
 * avisando/bloqueando o tempo todo enquanto o usuário ainda está na tela.
 */
export function ExitSaveDialog({ resolver }: { resolver: BlockerResolver }) {
  const [saving, setSaving] = useState(false);
  const open = resolver.status === "blocked";

  const handleSaveAndExit = async () => {
    setSaving(true);
    await waitUntilSaved();
    setSaving(false);
    resolver.proceed?.();
  };

  const handleExitWithoutSaving = () => {
    resolver.proceed?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) resolver.reset?.(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Salvar alterações antes de sair?</AlertDialogTitle>
          <AlertDialogDescription>
            Este relatório tem alterações que ainda não foram confirmadas como salvas no Drive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <Button variant="outline" onClick={handleExitWithoutSaving} disabled={saving} className="gap-1.5">
            <LogOut className="h-4 w-4" /> Sair sem salvar
          </Button>
          <Button onClick={handleSaveAndExit} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar e sair
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
