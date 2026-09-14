import { useState } from "react";
import { AlertTriangle, History, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { DraftHistoryEntry } from "@/lib/lab-entities.functions";
import { useOutrosAqui } from "@/lib/tempo-real";

function timeAgoLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

function juntarNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * Aviso leve (não bloqueia) para reduzir o risco de duas pessoas editando o
 * mesmo ensaio ao mesmo tempo sem perceber:
 *  - quem está com este relatório aberto AGORA (tempo real — a presença é
 *    registrada por `useDraftActivity`), mesmo antes de salvar;
 *  - quem salvou este relatório nos últimos minutos.
 */
export function EditingPresenceBanner({
  lastSavedAt,
  lastSavedByName,
  lastSavedById,
  currentUserId,
  thresholdMs = 3 * 60 * 1000,
}: {
  lastSavedAt: string | null;
  lastSavedByName: string | null;
  lastSavedById: string | null;
  currentUserId?: string | null;
  thresholdMs?: number;
}) {
  const outros = useOutrosAqui();
  const nomesAgora = Array.from(new Set(outros.map((p) => p.nome)));

  const salvouRecente =
    !!lastSavedAt &&
    !!lastSavedByName &&
    !(lastSavedById && currentUserId && lastSavedById === currentUserId) &&
    Date.now() - new Date(lastSavedAt).getTime() <= thresholdMs &&
    // Quem está com o relatório aberto agora já aparece no aviso de cima.
    !nomesAgora.includes(lastSavedByName);

  if (nomesAgora.length === 0 && !salvouRecente) return null;

  return (
    <div className="flex flex-col gap-1">
      {nomesAgora.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-800 dark:text-amber-300">
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span>
            <b>{juntarNomes(nomesAgora)}</b> {nomesAgora.length === 1 ? "está" : "estão"} com este relatório aberto
            agora — combine antes de editar.
          </span>
        </div>
      )}
      {salvouRecente && lastSavedAt && (
        <div className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            <b>{lastSavedByName}</b> editou este relatório há {timeAgoLabel(lastSavedAt)} — confira antes de continuar.
          </span>
        </div>
      )}
    </div>
  );
}

function diffSummary(diff: DraftHistoryEntry["diff"]): string {
  const keys = Object.keys(diff || {});
  if (keys.length === 0) return "Sem alterações de campo detectadas.";
  return keys.slice(0, 6).join(", ") + (keys.length > 6 ? ` e mais ${keys.length - 6}…` : "");
}

/** Botão que abre um diálogo com o histórico de salvamentos do rascunho (quem, quando, o que mudou). */
export function DraftHistoryButton({ history }: { history: DraftHistoryEntry[] }) {
  const [open, setOpen] = useState(false);
  if (history.length === 0) return null;

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground" onClick={() => setOpen(true)}>
        <History className="h-3.5 w-3.5" /> Histórico de salvamentos
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Histórico de salvamentos</DialogTitle>
            <DialogDescription>Quem salvou este rascunho e quando, mais recente primeiro.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {history.map((h, i) => (
              <div key={i} className="rounded-md border p-2.5 text-xs">
                <div className="flex items-center justify-between font-medium text-foreground">
                  <span>{h.changedByName || "Operador"}</span>
                  <span className="text-muted-foreground">{new Date(h.changedAt).toLocaleString("pt-BR")}</span>
                </div>
                <div className="mt-1 text-muted-foreground">{diffSummary(h.diff)}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
