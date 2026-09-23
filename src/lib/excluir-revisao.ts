/**
 * Excluir uma revisão do laudo de verdade — o mesmo em todas as telas.
 *
 * Antes, o botão de lixeira só apagava a cópia guardada no navegador: o PDF
 * continuava no Drive e a revisão continuava no fluxo de aprovação. A próxima
 * revisão "pulava" o número ou reaparecia como revisão antiga. Agora o
 * servidor manda o PDF e a planilha para a lixeira do Drive (recuperável por
 * 30 dias), tira a revisão do fluxo e recalcula o status; só depois a cópia
 * local sai.
 */
import { toast } from "sonner";
import { excluirRevisao } from "./approvals.functions";

export async function excluirRevisaoDoLaudo(opts: {
  scopeId: string;
  rev: number;
  aprovada: boolean;
  apagarLocal: () => Promise<unknown>;
}): Promise<boolean> {
  const rotulo = `Rev-${String(opts.rev).padStart(2, "0")}`;
  const aviso =
    `Excluir a ${rotulo}?\n\n` +
    "O PDF vai para a lixeira do Google Drive (recuperável por 30 dias) e a revisão sai do fluxo de verificação e aprovação." +
    (opts.aprovada ? "\n\nATENÇÃO: esta revisão está APROVADA." : "");
  if (!confirm(aviso)) return false;
  const id = toast.loading(`Excluindo a ${rotulo}…`);
  try {
    const r = await excluirRevisao({ data: { scopeId: opts.scopeId, rev: opts.rev } });
    await opts.apagarLocal();
    toast.success(
      r.arquivos.length > 0
        ? `${rotulo} excluída — ${r.arquivos.length === 1 ? "o arquivo foi" : `${r.arquivos.length} arquivos foram`} para a lixeira do Drive.`
        : `${rotulo} excluída.`,
      { id },
    );
    return true;
  } catch (err) {
    toast.error(`A ${rotulo} não foi excluída: ${err instanceof Error ? err.message : String(err)}`, { id, duration: 10000 });
    return false;
  }
}
