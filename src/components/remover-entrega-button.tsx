import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, Loader2 } from "lucide-react";
import {
  deleteScheduleRow,
  updateScheduleRow,
  type ScheduleRow,
} from "@/lib/sheets.functions";
import {
  parseEntregaMeta,
  formatEscopoP,
  splitEscopo,
  parseBrDate,
} from "@/lib/schedule-utils";

interface Props {
  row: ScheduleRow | null;
  size?: ButtonProps["size"];
  className?: string;
  onDone?: () => void;
}

export function RemoverEntregaButton({
  row,
  size = "sm",
  className,
  onDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const deleteFn = useServerFn(deleteScheduleRow);
  const updateFn = useServerFn(updateScheduleRow);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error("Sem linha");

      // 1) Renumera Parciais restantes da MESMA OS ANTES de excluir
      //    (rowIndex ainda é válido enquanto a linha não foi apagada).
      const cache = qc.getQueryData<{ rows: ScheduleRow[] }>(["schedule"]);
      const allRows = cache?.rows ?? [];
      const wasParcial = parseEntregaMeta(row.escopo).tipo === "Parcial";
      let shifted = 0;
      if (wasParcial && row.os) {
        const remaining = allRows
          .filter(
            (r) =>
              r.rowIndex !== row.rowIndex &&
              r.os === row.os &&
              parseEntregaMeta(r.escopo).tipo === "Parcial",
          )
          .map((r) => ({ r, t: parseBrDate(r.dataEntrega)?.getTime() ?? Infinity }))
          .sort((a, b) => a.t - b.t);

        for (let i = 0; i < remaining.length; i++) {
          const cur = remaining[i].r;
          const meta = parseEntregaMeta(cur.escopo);
          const newNumber = i + 1;
          if (meta.numero === newNumber) continue;
          const escopoOnly = String(cur.escopo ?? "").split("||")[0].trim();
          const { tags, extras } = splitEscopo(escopoOnly);
          const newEscopo = formatEscopoP(tags, extras, {
            tipo: "Parcial",
            numero: newNumber,
          });
          await updateFn({
            data: { rowIndex: cur.rowIndex, escopo: newEscopo },
          });
          shifted++;
        }
      }

      // 2) Agora exclui a linha
      await deleteFn({ data: { rowIndex: row.rowIndex } });
      return { shifted };
    },
    onSuccess: async (res) => {
      toast.success(
        res && res.shifted > 0
          ? `Entrega removida — ${res.shifted} parcial(is) renumerada(s)`
          : "Entrega removida do cronograma",
      );
      await qc.invalidateQueries({ queryKey: ["schedule"] });
      setOpen(false);
      onDone?.();
    },
    onError: (err: Error) => {
      toast.error("Falha ao remover entrega", { description: err.message });
    },
  });

  return (
    <>
      <Button
        size={size}
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={!row}
        className={
          "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40 " +
          (className ?? "")
        }
      >
        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remover
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover entrega do cronograma?</AlertDialogTitle>
            <AlertDialogDescription>
              A linha da OS <strong>{row?.os || "—"}</strong> (
              {row?.tomador || "—"}) será excluída permanentemente do
              CRONOGRAMA. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
              disabled={mutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirmar exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}