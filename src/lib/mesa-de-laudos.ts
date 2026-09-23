/**
 * "Meus laudos": em que fila cada laudo está e quem precisa agir (regra pura;
 * a tela está em routes/_app.relatorio.meus-laudos.tsx).
 *
 * Antes não havia um lugar só: uns laudos apareciam na lista do tipo de
 * ensaio, outros só na OS, outros só na Central — e ninguém tinha certeza do
 * que faltava verificar, aprovar ou corrigir. Aqui vale a revisão mais recente
 * de cada laudo (a mesma regra de etapa-laudo.ts).
 */

export type Fila = "verificar" | "aprovar" | "devolvido" | "correcao" | "aprovado";

export const FILAS: Fila[] = ["verificar", "aprovar", "devolvido", "correcao", "aprovado"];

export type LinhaDaMesa = {
  scope_id: string;
  rev: number | null;
  status: string;
  requested_by: string | null;
  requested_at: string | null;
  verified_at: string | null;
  decided_at: string | null;
  updated_at: string | null;
};

export function filaDoLaudo(status: string): Fila | null {
  switch (status) {
    case "pendente_verificacao":
    case "rejeitado":
      return "verificar";
    case "pendente_aprovacao":
    case "verificado":
      return "aprovar";
    case "rejeitado_verificacao":
      return "devolvido";
    case "em_revisao":
      return "correcao";
    case "aprovado":
      return "aprovado";
    default:
      return null;
  }
}

/** Desde quando o laudo está parado na fila atual. */
export function desdeQuando(l: LinhaDaMesa, fila: Fila): string | null {
  switch (fila) {
    case "verificar":
    case "correcao":
      return l.requested_at ?? l.updated_at;
    case "aprovar":
    case "devolvido":
      return l.verified_at ?? l.requested_at ?? l.updated_at;
    case "aprovado":
      return l.decided_at ?? l.updated_at;
  }
}

export type Papel = { verifica: boolean; aprova: boolean; userId: string | null };

/**
 * A fila pede ação desta pessoa? Verificar → quem verifica; aprovar → quem
 * aprova; devolvido/em correção → quem enviou a revisão (e quem verifica, que
 * acompanha a correção).
 */
export function pedeMinhaAcao(l: LinhaDaMesa, fila: Fila, p: Papel): boolean {
  switch (fila) {
    case "verificar":
      return p.verifica;
    case "aprovar":
      return p.aprova;
    case "devolvido":
    case "correcao":
      return (p.userId != null && l.requested_by === p.userId) || p.verifica;
    case "aprovado":
      return false;
  }
}

const DIA_MS = 86_400_000;

/**
 * Monta as filas: só laudos com revisão no fluxo; aprovados só os dos últimos
 * `diasAprovados` dias. Cada fila em ordem do mais antigo parado para o mais
 * novo (o que está esperando há mais tempo primeiro); aprovados, do mais novo.
 */
export function montarMesa<L extends LinhaDaMesa>(
  linhas: readonly L[],
  agora: number,
  diasAprovados = 30,
): Record<Fila, L[]> {
  const mesa: Record<Fila, L[]> = { verificar: [], aprovar: [], devolvido: [], correcao: [], aprovado: [] };
  for (const l of linhas) {
    if (l.rev == null) continue;
    const fila = filaDoLaudo(l.status);
    if (!fila) continue;
    if (fila === "aprovado") {
      const quando = Date.parse(desdeQuando(l, fila) ?? "");
      if (!Number.isFinite(quando) || agora - quando > diasAprovados * DIA_MS) continue;
    }
    mesa[fila].push(l);
  }
  const t = (l: L, f: Fila) => Date.parse(desdeQuando(l, f) ?? "") || 0;
  for (const f of FILAS) {
    mesa[f].sort((a, b) => (f === "aprovado" ? t(b, f) - t(a, f) : t(a, f) - t(b, f)));
  }
  return mesa;
}
