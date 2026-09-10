/**
 * Normalização e casamento entre um ensaio/relatório e a pendência de
 * digitação correspondente (`lab-pendencias`). Usado pela Central de
 * Processamento de Relatórios, pelos editores de relatório e pelo fluxo de
 * aprovação, que precisam achar a mesma pendência para manter o status
 * sincronizado ao longo de digitação/verificação/aprovação.
 *
 * O texto do "ensaio" na pendência normalmente vem da Planilha de Programação
 * (Google Sheets), fora do nosso controle direto — daí a normalização.
 *
 * Tudo aqui é puro (sem Drive nem server function), para poder ser testado.
 */
import type { PendenciaDigitacao } from "./lab-pendencias.functions";

export function normOs(val: string | null | undefined): string {
  if (!val) return "";
  return String(val).trim().replace(/^OS[-\s]*/i, "").toLowerCase();
}

export function normAmostra(val: string | null | undefined): string {
  if (!val) return "";
  return String(val).trim().toLowerCase();
}

export function normMethod(val: string | null | undefined): string {
  if (!val) return "";
  const s = String(val).toLowerCase().trim();
  if (s.includes("asf.dap") || s.includes("asf-dap") || s.includes("asfdap") || s.includes("densidade aparente")) return "asf-dap";
  if (s.includes("perm.v") || s.includes("perm-v") || s.includes("permv") || s.includes("permeabilidade")) return "perm-v";
  if (s.includes("comp.a") || s.includes("comp.r") || s.includes("comp.s") || s.includes("compressao-simples") || s.includes("compressão simples") || s.includes("compressao simples")) return "compressao-simples";
  // Triaxial ANTES de cisalhamento, e só pelo prefixo da sigla: a sigla
  // "TRI4.CD" (triaxial consolidado drenado) contém "cd", e o teste antigo
  // `includes("cd")` a classificava como cisalhamento direto — o editor de
  // cisalhamento podia marcar a pendência do triaxial. Pelo mesmo motivo, o
  // antigo `includes("tri")` casava qualquer texto com "tri" no meio.
  if (s.includes("triaxial") || /^tri\d/.test(s)) return "triaxial-cid";
  if (s.includes("cisalhamento") || /^cd\d/.test(s)) return "cisalhamento-direto";
  if (s.includes("adensamento") || s.includes("oed") || s.includes("adens")) return "adensamento";
  if (s.includes("m.esp") || s.includes("mesp") || s.includes("massa")) return "mesp-a";
  if (s.includes("umidade") || /^umid/.test(s)) return "umidade-natural";
  if (s.includes("resilien") || /^mr[.\d]/.test(s)) return "modulo-resiliencia";
  return s;
}

export function findMatchingPendencia(
  pendencias: PendenciaDigitacao[],
  target: { os: string | null | undefined; amostra: string | null | undefined; furo?: string | null | undefined; tipo: string | null | undefined },
): PendenciaDigitacao | undefined {
  const osNorm = normOs(target.os);
  const amNorm = normAmostra(target.amostra);
  const furoNorm = normAmostra(target.furo);
  const methNorm = normMethod(target.tipo);

  // Sem casamento de reserva que ignore o tipo de ensaio: numa amostra com
  // cisalhamento + adensamento + triaxial, ele devolvia a pendência de OUTRO
  // ensaio da mesma amostra, e o editor atualizava o status errado.
  return pendencias.find(
    (r) =>
      normOs(r.os) === osNorm &&
      (normAmostra(r.amostra) === amNorm || (!!furoNorm && normAmostra(r.amostra) === furoNorm)) &&
      (normMethod(r.ensaio) === methNorm || normMethod(r.tipo_ensaio) === methNorm),
  );
}

/** Id do ensaio ao qual a pendência já foi vinculada (gravado ao abri-la no escritório). */
export function ensaioVinculado(p: PendenciaDigitacao): string | null {
  const payload = p.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const vinculo = (payload as Record<string, unknown>)._linkedEnsaio;
  if (!vinculo || typeof vinculo !== "object") return null;
  const id = (vinculo as Record<string, unknown>).ensaioId;
  return typeof id === "string" && id ? id : null;
}

export type EscolhaPendencia =
  | { tipo: "encontrada"; pendencia: PendenciaDigitacao }
  | { tipo: "nenhuma" }
  | { tipo: "ambigua"; ids: string[] };

/**
 * Qual pendência corresponde a um ensaio — sem chute.
 *
 * 1. A que foi vinculada explicitamente a este ensaio (`_linkedEnsaio`).
 * 2. Senão, mesma OS + mesmo código de amostra + mesmo tipo de ensaio,
 *    desconsiderando as já vinculadas a OUTRO ensaio.
 *
 * Mais de um candidato é ambíguo e não devolve nenhum: deixar uma pendência
 * desatualizada é recuperável; atualizar a pendência errada não é.
 */
export function escolherPendenciaDoEnsaio(
  pendencias: PendenciaDigitacao[],
  alvo: {
    ensaioId: string;
    osNumero: string | null | undefined;
    amostraCodigos: (string | null | undefined)[];
    tipoEnsaio: string | null | undefined;
  },
): EscolhaPendencia {
  const vinculadas = pendencias.filter((p) => ensaioVinculado(p) === alvo.ensaioId);
  if (vinculadas.length === 1) return { tipo: "encontrada", pendencia: vinculadas[0] };
  if (vinculadas.length > 1) return { tipo: "ambigua", ids: vinculadas.map((p) => p.id) };

  const osN = normOs(alvo.osNumero);
  const codigos = new Set(alvo.amostraCodigos.map(normAmostra).filter(Boolean));
  const metodo = normMethod(alvo.tipoEnsaio);
  if (!osN || codigos.size === 0 || !metodo) return { tipo: "nenhuma" };

  const candidatas = pendencias.filter((p) => {
    const outroEnsaio = ensaioVinculado(p);
    if (outroEnsaio && outroEnsaio !== alvo.ensaioId) return false;
    return (
      normOs(p.os) === osN &&
      codigos.has(normAmostra(p.amostra)) &&
      (normMethod(p.ensaio) === metodo || normMethod(p.tipo_ensaio) === metodo)
    );
  });
  if (candidatas.length === 1) return { tipo: "encontrada", pendencia: candidatas[0] };
  if (candidatas.length > 1) return { tipo: "ambigua", ids: candidatas.map((p) => p.id) };
  return { tipo: "nenhuma" };
}

type StatusPendencia = PendenciaDigitacao["status"];

/**
 * Aplica uma mudança de status à pendência: carimba o horário da etapa no
 * payload e registra quem fez (digitador/verificador/aprovador). Mesma regra
 * usada pela ação manual do Kanban e pela sincronização vinda da aprovação.
 */
export function aplicarStatusPendencia(
  existente: PendenciaDigitacao,
  status: StatusPendencia,
  ator: { userId: string; nome: string },
  agoraIso: string,
  extra: { observacao?: string; payload?: Record<string, unknown> } = {},
): PendenciaDigitacao {
  const anterior =
    existente.payload && typeof existente.payload === "object" && !Array.isArray(existente.payload)
      ? (existente.payload as Record<string, unknown>)
      : {};
  const payload = {
    ...anterior,
    ...(extra.payload ?? {}),
    ...(status === "em_digitacao" ? { digitacao_started_at: anterior.digitacao_started_at || agoraIso } : {}),
    ...(status === "digitado" ? { digitacao_finished_at: agoraIso } : {}),
    ...(status === "verificado" ? { verificado_at: agoraIso } : {}),
    ...(status === "aprovado" ? { aprovado_at: agoraIso } : {}),
    ...(status === "concluido_externo" ? { concluido_externo_at: agoraIso } : {}),
  };

  const proxima: PendenciaDigitacao = {
    ...existente,
    status,
    payload: payload as PendenciaDigitacao["payload"],
    updated_at: agoraIso,
    rev: (existente.rev ?? 0) + 1,
  };
  if (extra.observacao !== undefined) proxima.observacao = extra.observacao;
  if (status === "em_digitacao" || status === "digitado") {
    proxima.digitador_user_id = ator.userId;
    proxima.digitador_nome = ator.nome;
  }
  if (status === "verificado") {
    proxima.verificador_user_id = ator.userId;
    proxima.verificador_nome = ator.nome;
  }
  if (status === "aprovado") {
    proxima.aprovador_user_id = ator.userId;
    proxima.aprovador_nome = ator.nome;
  }
  return proxima;
}

/**
 * Próximo estado da pendência quando o fluxo de aprovação do ensaio avança —
 * ou `null` se não há o que gravar. Uma pendência concluída fora da Central
 * (`concluido_externo`) nunca é reaberta por aqui.
 */
export function proximaPendencia(
  existente: PendenciaDigitacao,
  status: StatusPendencia,
  ator: { userId: string; nome: string },
  agoraIso: string,
): PendenciaDigitacao | null {
  if (existente.status === "concluido_externo") return null;
  if (existente.status === status) return null;
  return aplicarStatusPendencia(existente, status, ator, agoraIso);
}
