/**
 * Verificar/aprovar com o PDF da revisão completado em seguida.
 *
 * As telas importam `verifyApproval`/`decideApproval` daqui, e não de
 * `approvals.functions`: a decisão é registrada no servidor como antes e,
 * com ela gravada, o PDF da mesma revisão no Drive recebe o nome e a data de
 * quem verificou/aprovou (ver src/lib/assinaturas-pdf.ts). A atualização do
 * PDF roda em segundo plano: se falhar, a decisão continua valendo e o PDF é
 * completado da próxima vez que alguém abrir a revisão (painel de versões ou
 * prévia da Central de Emissões).
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { verifyApproval as verificarNoServidor, decideApproval as decidirNoServidor } from "./approvals.functions";
import { getRevisionPdfBase64, substituirPdfDaRevisao } from "./driveSync.functions";
import { assinaturasDaAprovacao, carimbarAssinaturas, type AprovacaoDoPdf } from "./assinaturas-pdf";

export {
  requestApproval,
  listApprovals,
  getWorkflowStatuses,
  listApprovalComments,
  addApprovalComment,
} from "./approvals.functions";
export type { ApprovalRow, ApprovalCommentRow, ApprovalStatus } from "./approvals.functions";

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesParaBase64(bytes: Uint8Array): string {
  let bin = "";
  const PASSO = 0x8000;
  for (let i = 0; i < bytes.length; i += PASSO) bin += String.fromCharCode(...bytes.subarray(i, i + PASSO));
  return btoa(bin);
}

export type SituacaoPdf = "atualizado" | "ja-estava-completo" | "sem-marcas";

/**
 * Deixa o PDF da revisão no Drive com as assinaturas que a aprovação já tem e
 * devolve os bytes finais, para quem vai mostrar o PDF. `base64` evita baixar
 * de novo quando quem chama já baixou.
 */
export async function completarPdfDaRevisao(
  scopeId: string,
  rev: number,
  aprovacao: AprovacaoDoPdf | null,
  base64?: string,
): Promise<{ bytes: Uint8Array; situacao: SituacaoPdf; erroAoGravar?: string }> {
  let base64Final = base64;
  if (base64Final === undefined) {
    const resp = await getRevisionPdfBase64({ data: { scopeId, rev } });
    if (!resp?.base64) throw new Error("O servidor não devolveu o PDF (resposta vazia — provável instabilidade momentânea).");
    base64Final = resp.base64;
  }
  const original = base64ParaBytes(base64Final);
  const r = await carimbarAssinaturas(original, assinaturasDaAprovacao(aprovacao));
  if (r.semMarcas) return { bytes: original, situacao: "sem-marcas" };
  if (!r.mudou) return { bytes: original, situacao: "ja-estava-completo" };
  try {
    await substituirPdfDaRevisao({ data: { scopeId, rev, base64: bytesParaBase64(r.bytes) } });
    return { bytes: r.bytes, situacao: "atualizado" };
  } catch (err) {
    return { bytes: r.bytes, situacao: "atualizado", erroAoGravar: err instanceof Error ? err.message : String(err) };
  }
}

function completarEmSegundoPlano(scopeId: string, rev: number, aprovacao: AprovacaoDoPdf, rejeicao: boolean) {
  const rotulo = `Rev-${String(rev).padStart(2, "0")}`;
  // Rejeição só apaga assinatura já escrita (quase sempre não há nenhuma): sem aviso de progresso.
  const id = rejeicao ? undefined : toast.loading(`Atualizando o PDF da ${rotulo} no Drive…`);
  completarPdfDaRevisao(scopeId, rev, aprovacao)
    .then(({ situacao, erroAoGravar }) => {
      if (erroAoGravar) {
        toast.error(`A decisão foi registrada, mas o PDF da ${rotulo} não foi atualizado no Drive: ${erroAoGravar}`, { id });
      } else if (situacao === "atualizado") {
        toast.success(`PDF da ${rotulo} atualizado no Drive com as assinaturas.`, { id });
      } else if (situacao === "sem-marcas" && !rejeicao) {
        toast.warning(
          `O PDF da ${rotulo} foi gerado antes desta atualização e não tem os campos de assinatura marcados. ` +
            "As próximas revisões já saem com verificador e aprovador.",
          { id },
        );
      } else if (id !== undefined) {
        toast.dismiss(id);
      }
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (/não foi encontrad|Nenhum PDF/i.test(msg)) {
        if (id !== undefined) toast.warning(`Não há PDF da ${rotulo} no Drive para receber as assinaturas.`, { id });
        return;
      }
      toast.error(
        `A decisão foi registrada, mas o PDF da ${rotulo} não foi atualizado: ${msg}. ` +
          "Ele será completado quando alguém abrir esta revisão.",
        { id },
      );
    });
}

/* ─────────── PDF refeito com os dados atuais ao verificar/aprovar ─────────── */

/**
 * O editor aberto registra aqui como gerar o PDF do laudo. Ao verificar ou
 * aprovar, o PDF da revisão é refeito com os dados da tela ANTES de a decisão
 * ser gravada — sem precisar clicar em "Atualizar PDF". Uma correção feita
 * durante a verificação entra no PDF que vai para o Drive. Depois vem o
 * carimbo das assinaturas, sobre o PDF novo (em sequência, sem corrida).
 * Fora do editor (Central de Emissões), não há o que refazer: só o carimbo.
 */
const regeradores = new Map<string, () => Promise<Blob>>();

export function useRegerarPdfNoFluxo(scopeId: string, gerarPdf: () => Promise<Blob>): void {
  const atual = useRef(gerarPdf);
  useEffect(() => {
    atual.current = gerarPdf;
  });
  useEffect(() => {
    if (!scopeId) return;
    const fn = () => atual.current();
    regeradores.set(scopeId, fn);
    return () => {
      if (regeradores.get(scopeId) === fn) regeradores.delete(scopeId);
    };
  }, [scopeId]);
}

async function regerarAntesDaDecisao(scopeId: string, rev: number): Promise<void> {
  const gerar = regeradores.get(scopeId);
  if (!gerar) return;
  const rotulo = `Rev-${String(rev).padStart(2, "0")}`;
  const id = toast.loading(`Refazendo o PDF da ${rotulo} com os dados atuais…`);
  try {
    const blob = await gerar();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await substituirPdfDaRevisao({ data: { scopeId, rev, base64: bytesParaBase64(bytes) } });
    toast.success(`PDF da ${rotulo} refeito com os dados atuais.`, { id });
  } catch (err) {
    toast.dismiss(id);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`O PDF da ${rotulo} não pôde ser refeito com os dados atuais, e a decisão NÃO foi registrada: ${msg}`);
  }
}

// Tipos soltos de propósito: quem valida a entrada é o servidor (zod), como antes.
type EntradaDecisao = { scopeId: string; rev: number; decision: string; comment?: string };

export async function verifyApproval(opts: { data: EntradaDecisao }) {
  if (opts.data.decision === "verificado") await regerarAntesDaDecisao(opts.data.scopeId, opts.data.rev);
  const linha = await verificarNoServidor({ data: opts.data });
  completarEmSegundoPlano(opts.data.scopeId, opts.data.rev, linha, opts.data.decision !== "verificado");
  return linha;
}

export async function decideApproval(opts: { data: EntradaDecisao }) {
  if (opts.data.decision === "aprovado") await regerarAntesDaDecisao(opts.data.scopeId, opts.data.rev);
  const linha = await decidirNoServidor({ data: opts.data });
  completarEmSegundoPlano(opts.data.scopeId, opts.data.rev, linha, opts.data.decision !== "aprovado");
  return linha;
}
