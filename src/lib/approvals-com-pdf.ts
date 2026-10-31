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
import { toast } from "sonner";
import {
  verifyApproval as verificarNoServidor,
  decideApproval as decidirNoServidor,
  listApprovals as listarNoServidor,
  type ApprovalRow,
} from "./approvals.functions";
import { getRevisionPdfBase64, substituirPdfDaRevisao } from "./driveSync.functions";
import { assinaturasDaAprovacao, carimbarAssinaturas, type AprovacaoDoPdf } from "./assinaturas-pdf";

export {
  requestApproval,
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

/*
 * O PDF da revisão NÃO é refeito na verificação/aprovação. Antes, a tela de
 * quem decidia gerava um PDF novo e ele substituía o do Drive: o que ia para o
 * Drive era o que estava na tela daquela pessoa — com uma foto que não tinha
 * carregado ou um rascunho antigo guardado no navegador, o laudo oficial perdia
 * fotos ou dados e ficava diferente do que o verificador tinha conferido. Com a
 * trava de dados (exigirDadosInalterados em approvals.functions.ts), qualquer
 * correção já exige reenviar a revisão; então o PDF enviado é o oficial e só
 * recebe as assinaturas.
 */

// Tipos soltos de propósito: quem valida a entrada é o servidor (zod), como antes.
type EntradaDecisao = { scopeId: string; rev: number; decision: string; comment?: string };

export async function verifyApproval(opts: { data: EntradaDecisao }) {
  const linha = await verificarNoServidor({ data: opts.data });
  if (!linha) throw new Error("O servidor não confirmou a verificação (resposta vazia). Recarregue a tela antes de tentar de novo.");
  completarEmSegundoPlano(opts.data.scopeId, opts.data.rev, linha, opts.data.decision !== "verificado");
  return linha;
}

export async function decideApproval(opts: { data: EntradaDecisao }) {
  const linha = await decidirNoServidor({ data: opts.data });
  if (!linha) throw new Error("O servidor não confirmou a decisão (resposta vazia). Recarregue a tela antes de tentar de novo.");
  completarEmSegundoPlano(opts.data.scopeId, opts.data.rev, linha, opts.data.decision !== "aprovado");
  return linha;
}

/**
 * Lista de aprovações que nunca chega `undefined` à tela. Quando o servidor não
 * responde (Worker no limite), a função devolvia `undefined`, as telas guardavam
 * isso no estado e o editor quebrava em `approvals.find` ("Erro ao renderizar o
 * editor do ensaio"). Agora é erro: quem chama mantém a lista que já tinha.
 */
export async function listApprovals(opts: { data: { scopeId: string } }): Promise<ApprovalRow[]> {
  const linhas: unknown = await listarNoServidor(opts);
  if (!Array.isArray(linhas)) throw new Error("O servidor não devolveu as aprovações (resposta vazia). Tente de novo.");
  return linhas as ApprovalRow[];
}
