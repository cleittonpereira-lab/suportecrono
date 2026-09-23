/**
 * Painel do Coordenador — aba Laudos (regra pura; a leitura está em
 * painel-laudos.functions.ts e a tela em features/gestao/PainelLaudos.tsx).
 *
 * Os números vêm do histórico de cada laudo (approvalComments: quem enviou,
 * verificou, devolveu e aprovou, e quando) e dos checks de entrega. Assim a
 * contagem é por AÇÃO no dia em que aconteceu — uma devolução seguida de
 * reenvio conta duas digitações, como foi o trabalho de verdade.
 */
import { BUSINESS_DAY_MS, businessElapsedMs } from "./business-days";

export type TipoDeEvento = "enviado" | "verificado" | "devolvido" | "aprovado" | "entregue";

export type EventoDeLaudo = {
  tipo: TipoDeEvento;
  em: string;
  por: string | null;
  familia: string;
  /** Na devolução: quem tinha enviado a revisão devolvida (o digitador). */
  dono?: string | null;
};

/** Um laudo na revisão vigente: datas de cada etapa, para os tempos. */
export type CicloDeLaudo = {
  familia: string;
  enviado: string | null;
  verificado: string | null;
  aprovado: string | null;
  entregue: string | null;
};

export type DadosDoPainelDeLaudos = {
  eventos: EventoDeLaudo[];
  ciclos: CicloDeLaudo[];
  aEntregar: number;
};

const DIA = 86_400_000;

/** "AAAA-MM-DD" no fuso de Brasília. */
export function diaBr(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

/** Últimos `dias` dias (inclui hoje), do mais antigo para o mais novo. */
export function diasDaJanela(agora: number, dias: number): string[] {
  const out: string[] = [];
  for (let i = dias - 1; i >= 0; i--) out.push(diaBr(new Date(agora - i * DIA).toISOString()));
  return out;
}

function naJanela(e: EventoDeLaudo, agora: number, dias: number) {
  const t = Date.parse(e.em);
  return Number.isFinite(t) && agora - t < dias * DIA && t <= agora;
}

export function seriePorDia(
  eventos: readonly EventoDeLaudo[],
  tipo: TipoDeEvento,
  agora: number,
  dias = 30,
): { dia: string; n: number }[] {
  const conta = new Map<string, number>();
  for (const e of eventos) {
    if (e.tipo !== tipo || !naJanela(e, agora, dias)) continue;
    const d = diaBr(e.em);
    conta.set(d, (conta.get(d) ?? 0) + 1);
  }
  return diasDaJanela(agora, dias).map((dia) => ({ dia, n: conta.get(dia) ?? 0 }));
}

/** Quem mais fez `tipo` na janela, do maior para o menor (`campo: "dono"` = de quem era o laudo). */
export function porPessoa(
  eventos: readonly EventoDeLaudo[],
  tipo: TipoDeEvento,
  agora: number,
  dias = 30,
  campo: "por" | "dono" = "por",
): { nome: string; n: number }[] {
  const conta = new Map<string, number>();
  for (const e of eventos) {
    if (e.tipo !== tipo || !naJanela(e, agora, dias)) continue;
    const nome = e[campo]?.trim() || "Sem nome";
    conta.set(nome, (conta.get(nome) ?? 0) + 1);
  }
  return [...conta]
    .map(([nome, n]) => ({ nome, n }))
    .sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome));
}

export function porFamilia(
  eventos: readonly EventoDeLaudo[],
  tipo: TipoDeEvento,
  agora: number,
  dias = 30,
): { familia: string; n: number }[] {
  const conta = new Map<string, number>();
  for (const e of eventos) {
    if (e.tipo !== tipo || !naJanela(e, agora, dias)) continue;
    conta.set(e.familia, (conta.get(e.familia) ?? 0) + 1);
  }
  return [...conta].map(([familia, n]) => ({ familia, n })).sort((a, b) => b.n - a.n);
}

export function total(
  eventos: readonly EventoDeLaudo[],
  tipo: TipoDeEvento,
  agora: number,
  dias = 30,
): number {
  return eventos.filter((e) => e.tipo === tipo && naJanela(e, agora, dias)).length;
}

function mediana(vals: number[]): number | null {
  if (vals.length === 0) return null;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Tempo mediano (dias úteis) de cada etapa, nos laudos aprovados na janela:
 * espera pela verificação, pela aprovação e pela entrega.
 */
export function temposDasEtapas(ciclos: readonly CicloDeLaudo[], agora: number, dias = 90) {
  const recentes = ciclos.filter((c) => c.aprovado && agora - Date.parse(c.aprovado) < dias * DIA);
  const uteis = (a: string | null, b: string | null) =>
    a && b && Date.parse(b) >= Date.parse(a) ? businessElapsedMs(a, b) / BUSINESS_DAY_MS : null;
  const coleta = (f: (c: CicloDeLaudo) => number | null) =>
    recentes.map(f).filter((v): v is number => v != null);
  return {
    amostra: recentes.length,
    verificacao: mediana(coleta((c) => uteis(c.enviado, c.verificado))),
    aprovacao: mediana(coleta((c) => uteis(c.verificado, c.aprovado))),
    entrega: mediana(coleta((c) => uteis(c.aprovado, c.entregue))),
    total: mediana(coleta((c) => uteis(c.enviado, c.aprovado))),
  };
}

/** Ação gravada no histórico do laudo (approvalComments.action) → evento do painel. */
const ACAO: Record<string, TipoDeEvento> = {
  send_verification: "enviado",
  send_approval: "enviado",
  verified: "verificado",
  rejected_verification: "devolvido",
  approved: "aprovado",
};

type ArquivoDoEnsaio = {
  approvalComments?: { action?: string; created_at?: string; author_name?: string | null }[];
  reportApprovals?: {
    rev: number;
    status?: string | null;
    requested_at?: string | null;
    verified_at?: string | null;
    decided_at?: string | null;
  }[];
  entregaLaudo?: {
    rev: number;
    sond?: { em: string; porNome: string | null } | null;
    gdrive?: { em: string; porNome: string | null } | null;
  } | null;
};

/** Eventos e ciclo de um ensaio (arquivo lab-ensaios). */
export function eventosDoEnsaio(
  en: ArquivoDoEnsaio,
  familia: string,
): { eventos: EventoDeLaudo[]; ciclo: CicloDeLaudo | null; aEntregar: boolean } {
  const eventos: EventoDeLaudo[] = [];
  const historico = [...(en.approvalComments ?? [])].sort((a, b) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );
  let ultimoEnvio: string | null = null;
  for (const c of historico) {
    const tipo = c.action ? ACAO[c.action] : undefined;
    if (!tipo || !c.created_at) continue;
    const por = c.author_name ?? null;
    if (tipo === "enviado") ultimoEnvio = por;
    eventos.push({
      tipo,
      em: c.created_at,
      por,
      familia,
      ...(tipo === "devolvido" ? { dono: ultimoEnvio } : {}),
    });
  }
  const aprovs = en.reportApprovals ?? [];
  const ultima = aprovs.length ? aprovs.reduce((a, b) => (b.rev > a.rev ? b : a)) : null;
  if (!ultima || ultima.status !== "aprovado") return { eventos, ciclo: null, aEntregar: false };
  const e = en.entregaLaudo && en.entregaLaudo.rev === ultima.rev ? en.entregaLaudo : null;
  let entregue: string | null = null;
  if (e?.sond && e?.gdrive) {
    const ultimaMarca = e.sond.em > e.gdrive.em ? e.sond : e.gdrive;
    entregue = ultimaMarca.em;
    eventos.push({ tipo: "entregue", em: entregue, por: ultimaMarca.porNome, familia });
  }
  return {
    eventos,
    ciclo: {
      familia,
      enviado: ultima.requested_at ?? null,
      verificado: ultima.verified_at ?? null,
      aprovado: ultima.decided_at ?? null,
      entregue,
    },
    aEntregar: entregue == null,
  };
}
