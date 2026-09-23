/**
 * "Gerar nova revisão" de um laudo aprovado — o mesmo em todos os editores.
 *
 * Antes o botão gerava o PDF e mandava direto para aprovação, com a numeração
 * do navegador: pulava a verificação, às vezes caía em cima da revisão
 * aprovada e o laudo ficava "aguardando aprovação" no título e "aprovado" no
 * status. Agora ele só REABRE o laudo para correção (servidor:
 * abrirNovaRevisao): os dados destravam, e quem corrige envia para
 * verificação como qualquer revisão.
 */
import { useState } from "react";
import { FilePenLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { abrirNovaRevisao } from "@/lib/approvals.functions";

export function BotaoNovaRevisao({
  scopeId,
  disabled,
  aoAbrir,
}: {
  scopeId: string;
  disabled?: boolean;
  /** Recarrega o fluxo na tela (refreshApprovals do editor). */
  aoAbrir: () => unknown;
}) {
  const [busy, setBusy] = useState(false);
  const abrir = async () => {
    if (
      !confirm(
        "Abrir uma nova revisão deste laudo?\n\n" +
          "Os dados voltam para a digitação. Depois de corrigir, use \"Enviar para verificação\" — " +
          "a nova revisão passa por verificação e aprovação como a primeira. A revisão aprovada continua no Drive.",
      )
    )
      return;
    setBusy(true);
    const id = toast.loading("Abrindo nova revisão…");
    try {
      const r = await abrirNovaRevisao({ data: { scopeId } });
      const rotulo = `Rev-${String(r.rev).padStart(2, "0")}`;
      await aoAbrir();
      toast.success(
        r.reaproveitada
          ? `A ${rotulo} ainda não foi aprovada — continue nela.`
          : `${rotulo} aberta para correção. Ao terminar, envie para verificação.`,
        { id, duration: 8000 },
      );
    } catch (err) {
      toast.error(`Não foi possível abrir a nova revisão: ${err instanceof Error ? err.message : String(err)}`, { id });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={() => void abrir()} disabled={disabled || busy} className="text-xs gap-1.5">
      <FilePenLine className="h-3.5 w-3.5" /> {busy ? "Abrindo…" : "Gerar nova revisão"}
    </Button>
  );
}
