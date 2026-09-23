/**
 * Entrega do laudo ao cliente — regra pura (o servidor está em
 * entrega-laudos.functions.ts).
 *
 * Depois de aprovado, o laudo precisa ser postado na SOND (portal do cliente)
 * e colocado na pasta do cliente no Google Drive. Antes nada registrava isso e
 * todo laudo aprovado ficava para sempre empilhado em "Concluídos". Agora cada
 * canal tem um check (quem marcou e quando); com os dois, o laudo está
 * ENTREGUE e sai das filas.
 *
 * O check vale para a revisão aprovada em que foi feito: se sair uma revisão
 * nova e ela for aprovada, a entrega precisa ser refeita.
 */

export type CanalDeEntrega = "sond" | "gdrive";
export const CANAIS: CanalDeEntrega[] = ["sond", "gdrive"];

export const ROTULO_CANAL: Record<CanalDeEntrega, string> = {
  sond: "SOND",
  gdrive: "GDrive do cliente",
};

export type MarcaDeEntrega = { em: string; por: string | null; porNome: string | null };

/** Gravado no arquivo do ensaio (`entregaLaudo`). */
export type EntregaDoLaudo = {
  rev: number;
  sond?: MarcaDeEntrega | null;
  gdrive?: MarcaDeEntrega | null;
};

export type SituacaoDaEntrega = {
  sond: MarcaDeEntrega | null;
  gdrive: MarcaDeEntrega | null;
  /** Os dois canais marcados para a revisão aprovada atual. */
  entregue: boolean;
  /** Quando ficou entregue (o check mais recente dos dois). */
  entregueEm: string | null;
};

/** Revisão aprovada vigente: a mais recente, se ela estiver aprovada. */
export function revisaoAprovadaVigente(
  approvals: readonly { rev: number; status?: string | null }[] | null | undefined,
): number | null {
  if (!approvals || approvals.length === 0) return null;
  const ultima = approvals.reduce((a, b) => (b.rev > a.rev ? b : a));
  return ultima.status === "aprovado" ? ultima.rev : null;
}

/** Situação da entrega para a revisão aprovada `revAprovada` (null = laudo ainda não aprovado). */
export function situacaoDaEntrega(
  entrega: EntregaDoLaudo | null | undefined,
  revAprovada: number | null,
): SituacaoDaEntrega {
  const valida = entrega != null && revAprovada != null && entrega.rev === revAprovada;
  const sond = valida ? (entrega.sond ?? null) : null;
  const gdrive = valida ? (entrega.gdrive ?? null) : null;
  const entregue = sond != null && gdrive != null;
  return {
    sond,
    gdrive,
    entregue,
    entregueEm: entregue ? (sond.em > gdrive.em ? sond.em : gdrive.em) : null,
  };
}

/** Aplica um check (ou o desfaz) — começa do zero se a revisão aprovada mudou. */
export function marcarEntrega(
  atual: EntregaDoLaudo | null | undefined,
  revAprovada: number,
  canal: CanalDeEntrega,
  marca: MarcaDeEntrega | null,
): EntregaDoLaudo {
  const base: EntregaDoLaudo =
    atual && atual.rev === revAprovada ? { ...atual } : { rev: revAprovada };
  base[canal] = marca;
  return base;
}
