import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2 } from "lucide-react";
import { moveScheduleRowToEntregues, type ScheduleRow } from "@/lib/sheets.functions";

interface Props {
  row: ScheduleRow | null;
  size?: ButtonProps["size"];
  className?: string;
  onDone?: () => void;
}

function todayIso(): string {
  const n = new Date();
  const yyyy = n.getFullYear();
  const mm = String(n.getMonth() + 1).padStart(2, "0");
  const dd = String(n.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoToBr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function RegistrarEntregaButton({
  row,
  size = "sm",
  className,
  onDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const [dateIso, setDateIso] = useState(todayIso());
  const moveFn = useServerFn(moveScheduleRowToEntregues);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error("Sem linha");
      const br = isoToBr(dateIso);
      if (!br) throw new Error("Data inválida");
      return moveFn({
        data: {
          rowIndex: row.rowIndex,
          dataPostagem: br,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Entrega registrada — movida para OS Entregues");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["schedule"] }),
        qc.invalidateQueries({ queryKey: ["entregues"] }),
      ]);
      setOpen(false);
      onDone?.();
    },
    onError: (err: Error) => {
      toast.error("Falha ao registrar entrega", { description: err.message });
    },
  });

  return (
    <>
      <Button
        size={size}
        onClick={() => {
          setDateIso(todayIso());
          setOpen(true);
        }}
        disabled={!row}
        className={
          "bg-emerald-600 hover:bg-emerald-700 text-white " + (className ?? "")
        }
      >
        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Registrar Entrega
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar registro de entrega</DialogTitle>
            <DialogDescription>
              A OS <strong>{row?.os || "—"}</strong> ({row?.tomador || "—"})
              será movida para <em>OS Entregues</em> com a data de postagem
              abaixo. Você pode ajustar para registrar entregas retroativas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dataPostagemEntrega">Data de postagem</Label>
            <Input
              id="dataPostagemEntrega"
              type="date"
              value={dateIso}
              max={todayIso()}
              onChange={(e) => setDateIso(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Pré-preenchida com a data de hoje ({new Date().toLocaleDateString("pt-BR")}).
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !dateIso}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirmar entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}