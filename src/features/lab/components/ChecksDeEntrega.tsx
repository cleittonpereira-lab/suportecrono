/**
 * Checks de entrega do laudo (SOND e GDrive do cliente), com confirmação.
 * Serve para um laudo ou para vários de uma vez (a OS inteira).
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, CloudUpload, Globe } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { marcarEntregaDosLaudos } from "@/lib/entrega-laudos.functions";
import { ROTULO_CANAL, type CanalDeEntrega, type MarcaDeEntrega } from "@/lib/entrega-laudo";
import { CHAVE_LAUDOS_NO_FLUXO } from "@/features/lab/hooks/use-laudos-no-fluxo";
import { cn } from "@/lib/utils";

const ICONE: Record<CanalDeEntrega, typeof Globe> = { sond: Globe, gdrive: CloudUpload };

function fmt(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

export type Pedido = {
  canal: CanalDeEntrega;
  marcado: boolean;
  scopeIds: string[];
  descricao: string;
};

/** Diálogo de confirmação + gravação. `pedir` abre o diálogo. */
export function useConfirmarEntrega() {
  const fn = useServerFn(marcarEntregaDosLaudos);
  const qc = useQueryClient();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [gravando, setGravando] = useState(false);

  const confirmar = async () => {
    if (!pedido) return;
    setGravando(true);
    try {
      const r = await fn({
        data: { scopeIds: pedido.scopeIds, canal: pedido.canal, marcado: pedido.marcado },
      });
      await qc.invalidateQueries({ queryKey: CHAVE_LAUDOS_NO_FLUXO });
      const canal = ROTULO_CANAL[pedido.canal];
      if (r.recusados.length > 0) {
        toast.warning(
          `${r.feitos.length} registrado(s); ${r.recusados.length} não: ${[...new Set(r.recusados.map((x) => x.motivo))].join(", ")}.`,
        );
      } else {
        toast.success(pedido.marcado ? `${canal} marcado.` : `${canal} desmarcado.`);
      }
      setPedido(null);
    } catch (e) {
      toast.error("Não foi possível registrar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGravando(false);
    }
  };

  const dialogo = (
    <AlertDialog open={!!pedido} onOpenChange={(o) => !o && !gravando && setPedido(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pedido?.marcado ? "Confirmar entrega" : "Desfazer entrega"} —{" "}
            {pedido ? ROTULO_CANAL[pedido.canal] : ""}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>{pedido?.descricao}</p>
              <p className="text-muted-foreground">
                {pedido?.marcado
                  ? pedido?.canal === "sond"
                    ? "Confirme que o laudo aprovado já está postado na SOND para o cliente."
                    : "Confirme que o laudo aprovado já está na pasta do cliente no Google Drive."
                  : 'O laudo volta para "A entregar" neste canal.'}{" "}
                Com SOND e GDrive marcados, o laudo passa a <b>Entregue</b> e sai das filas.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={gravando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={gravando}
            onClick={(e) => {
              e.preventDefault();
              void confirmar();
            }}
          >
            {gravando ? "Registrando…" : pedido?.marcado ? "Confirmar" : "Desfazer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { pedir: setPedido, dialogo };
}

/** Os dois checks de um laudo. */
export function ChecksDeEntrega({
  scopeId,
  descricao,
  sond,
  gdrive,
  pedir,
  podeMarcar,
  compacto = false,
}: {
  scopeId: string;
  descricao: string;
  sond: MarcaDeEntrega | null;
  gdrive: MarcaDeEntrega | null;
  pedir: (p: Pedido) => void;
  podeMarcar: boolean;
  compacto?: boolean;
}) {
  const marcas: Record<CanalDeEntrega, MarcaDeEntrega | null> = { sond, gdrive };
  return (
    <div className="flex flex-wrap gap-1.5">
      {(["sond", "gdrive"] as CanalDeEntrega[]).map((canal) => {
        const m = marcas[canal];
        const Icone = ICONE[canal];
        return (
          <Button
            key={canal}
            type="button"
            size="sm"
            variant="outline"
            disabled={!podeMarcar}
            title={
              m
                ? `${ROTULO_CANAL[canal]}: marcado por ${m.porNome ?? "—"} em ${fmt(m.em)}${podeMarcar ? " — clique para desfazer" : ""}`
                : podeMarcar
                  ? `Marcar ${ROTULO_CANAL[canal]} como entregue`
                  : "Só quem verifica marca a entrega"
            }
            onClick={() => pedir({ canal, marcado: !m, scopeIds: [scopeId], descricao })}
            className={cn(
              "gap-1 font-semibold",
              compacto ? "h-6 px-1.5 text-[10px]" : "h-7 px-2 text-xs",
              m
                ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                : "border-dashed text-muted-foreground",
            )}
          >
            {m ? <Check className="h-3.5 w-3.5" /> : <Icone className="h-3.5 w-3.5" />}
            {canal === "sond" ? "SOND" : "GDrive"}
          </Button>
        );
      })}
    </div>
  );
}
