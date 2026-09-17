/**
 * Avisos do app (Fase 5, parte 2) — SÓ SERVIDOR (carregar com `import()`):
 * inscrições dos aparelhos por pessoa, caixa de avisos por pessoa e o envio
 * do push (sem conteúdo) aos aparelhos dela. Regras e texto em
 * lib/avisos-logica.ts; o service worker busca o texto em /api/avisos.
 *
 * A chave privada VAPID é o segredo `VAPID_PRIVATE_JWK` do Worker (JWK P-256
 * em JSON); a pública, que o navegador usa ao se inscrever, está em
 * lib/avisos-cliente.ts. Sem o segredo, os avisos ficam gravados e não saem.
 */
import { atualizarDriveJson, ensureFolderPath, readDriveJson } from "@/lib/driveStorage";
import {
  avisosNovos,
  cabecalhoVapid,
  descreverLaudo,
  destinatarios,
  montarAviso,
  type Aviso,
  type ChavePrivadaVapid,
  type EventoDoFluxo,
} from "@/lib/avisos-logica";

const PASTA = ["avisos"];
const CONTATO = "mailto:contato@suportesolos.com.br";
const MAX_AVISOS = 50;
const MAX_APARELHOS = 10;

export interface Inscricao {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  aparelho?: string;
  criadaEm: string;
}

type ArquivoInscricoes = { inscricoes: Inscricao[] };
type ArquivoCaixa = { avisos: Aviso[]; lidoAte?: string };

const nomeInscricoes = (userId: string) => `inscricoes-${userId}.json`;
const nomeCaixa = (userId: string) => `caixa-${userId}.json`;

function chavePrivada(): ChavePrivadaVapid | null {
  const env = (globalThis as { __env__?: { VAPID_PRIVATE_JWK?: string } }).__env__;
  const bruto = env?.VAPID_PRIVATE_JWK ?? (typeof process !== "undefined" ? process.env?.VAPID_PRIVATE_JWK : undefined);
  if (!bruto) return null;
  try {
    const j = JSON.parse(bruto) as Partial<ChavePrivadaVapid>;
    return j.d && j.x && j.y ? ({ kty: "EC", crv: "P-256", x: j.x, y: j.y, d: j.d } as ChavePrivadaVapid) : null;
  } catch {
    return null;
  }
}

export function avisosConfigurados(): boolean {
  return chavePrivada() !== null;
}

async function lerInscricoes(userId: string): Promise<Inscricao[]> {
  const pasta = await ensureFolderPath(PASTA);
  return (await readDriveJson<ArquivoInscricoes>(nomeInscricoes(userId), pasta))?.inscricoes ?? [];
}

export async function quantosAparelhos(userId: string): Promise<number> {
  return (await lerInscricoes(userId)).length;
}

export async function inscrever(userId: string, i: Omit<Inscricao, "criadaEm">): Promise<void> {
  const pasta = await ensureFolderPath(PASTA);
  await atualizarDriveJson<ArquivoInscricoes>(nomeInscricoes(userId), pasta, (atual) => {
    const outras = (atual?.inscricoes ?? []).filter((x) => x.endpoint !== i.endpoint);
    return { inscricoes: [...outras, { ...i, criadaEm: new Date().toISOString() }].slice(-MAX_APARELHOS) };
  });
}

export async function cancelar(userId: string, endpoint: string): Promise<void> {
  const pasta = await ensureFolderPath(PASTA);
  await atualizarDriveJson<ArquivoInscricoes>(nomeInscricoes(userId), pasta, (atual) => {
    if (!atual?.inscricoes.some((x) => x.endpoint === endpoint)) return null;
    return { inscricoes: atual.inscricoes.filter((x) => x.endpoint !== endpoint) };
  });
}

/** O que o service worker de um aparelho ainda não mostrou (ver `avisosNovos`). */
export async function avisosDesde(userId: string, desde: string | null): Promise<Aviso[]> {
  const pasta = await ensureFolderPath(PASTA);
  const caixa = await readDriveJson<ArquivoCaixa>(nomeCaixa(userId), pasta);
  return avisosNovos(caixa?.avisos ?? [], desde);
}

/** A caixa de avisos da pessoa, para o sino de notificações (não mexe em "entregue" do push). */
export async function minhaCaixa(userId: string): Promise<{ avisos: Aviso[]; lidoAte: string | null }> {
  const pasta = await ensureFolderPath(PASTA);
  const caixa = await readDriveJson<ArquivoCaixa>(nomeCaixa(userId), pasta);
  return { avisos: caixa?.avisos ?? [], lidoAte: caixa?.lidoAte ?? null };
}

/** Marca a caixa como lida até agora — o sino zera o contador de não lidos. */
export async function marcarCaixaLida(userId: string, ate: string): Promise<void> {
  const pasta = await ensureFolderPath(PASTA);
  await atualizarDriveJson<ArquivoCaixa>(nomeCaixa(userId), pasta, (atual) => {
    if (atual?.lidoAte && atual.lidoAte >= ate) return null;
    return { avisos: atual?.avisos ?? [], lidoAte: ate };
  });
}

/** Um push sem conteúdo para cada aparelho; inscrições vencidas (404/410) saem da lista. */
async function empurrar(userId: string, inscricoes: Inscricao[], chave: ChavePrivadaVapid): Promise<void> {
  const vencidas: string[] = [];
  for (const i of inscricoes) {
    try {
      const r = await fetch(i.endpoint, {
        method: "POST",
        headers: { Authorization: await cabecalhoVapid(i.endpoint, chave, CONTATO), TTL: "86400", Urgency: "normal" },
        body: "",
      });
      if (r.status === 404 || r.status === 410) vencidas.push(i.endpoint);
      else if (!r.ok) console.warn(`[avisos] Push recusado (${r.status}) por ${new URL(i.endpoint).host}`);
    } catch (err) {
      console.warn("[avisos] Push não enviado:", err);
    }
  }
  if (vencidas.length > 0) {
    const pasta = await ensureFolderPath(PASTA);
    await atualizarDriveJson<ArquivoInscricoes>(nomeInscricoes(userId), pasta, (atual) =>
      atual ? { inscricoes: atual.inscricoes.filter((x) => !vencidas.includes(x.endpoint)) } : null,
    );
  }
}

/**
 * Grava o aviso na caixa de cada pessoa que tem aparelho inscrito e toca os
 * aparelhos dela. Quem não ativou os avisos não gasta nada (nem gravação).
 */
export async function avisarPessoas(userIds: string[], aviso: Aviso): Promise<void> {
  const chave = chavePrivada();
  const pasta = await ensureFolderPath(PASTA);
  for (const id of new Set(userIds)) {
    const inscricoes = await lerInscricoes(id);
    if (inscricoes.length === 0) continue;
    await atualizarDriveJson<ArquivoCaixa>(nomeCaixa(id), pasta, (atual) => ({
      avisos: [aviso, ...(atual?.avisos ?? [])].slice(0, MAX_AVISOS),
    }));
    if (chave) await empurrar(id, inscricoes, chave);
  }
}

/**
 * Aviso de uma etapa do fluxo de aprovação. Vai para depois da resposta —
 * quem aprovou ou reprovou não espera — e nunca derruba a ação.
 */
export async function avisarFluxo(p: {
  evento: EventoDoFluxo;
  scopeId: string;
  laudo: { ensaio?: string | null; os?: string | null; amostra?: string | null; arquivo?: string | null; registro?: unknown };
  ator: { userId: string; nome: string };
  solicitante?: string | null;
  comentario?: string | null;
}): Promise<void> {
  const { depoisDaResposta } = await import("./depois-da-resposta");
  depoisDaResposta(
    (async () => {
      const { listUsers } = await import("./user-store.server");
      const ids = destinatarios(p.evento, await listUsers(), p.ator.userId, p.solicitante);
      if (ids.length === 0) return;
      const registro = (p.laudo.registro ?? null) as { nome?: string | null; sigla?: string | null } | null;
      const descricao = descreverLaudo({
        ensaio: p.laudo.ensaio ?? registro?.nome ?? registro?.sigla ?? null,
        os: p.laudo.os,
        amostra: p.laudo.amostra,
        arquivo: p.laudo.arquivo,
      });
      await avisarPessoas(ids, montarAviso(p.evento, { descricao, ator: p.ator.nome, comentario: p.comentario, scopeId: p.scopeId }));
    })(),
  );
}
