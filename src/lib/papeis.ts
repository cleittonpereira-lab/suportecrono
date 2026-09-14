/**
 * Quem pode o quê no fluxo de aprovação — a mesma regra na tela e no servidor.
 *
 * Antes, a tela escondia os botões e o servidor aceitava qualquer conta ativa:
 * um digitador que chamasse o servidor direto verificava ou aprovava laudo. E
 * cada tela tinha a sua regra: os editores comparavam o papel geral com
 * "verificador" (valor que o papel geral nem tem — na prática, verificava quem
 * era gestor ou admin), a Central de Emissões olhava o papel do laboratório.
 *
 *  - Verificar: admin, gestor, ou papel de laboratório verificador/aprovador.
 *  - Aprovar como RT: admin ou papel de laboratório aprovador.
 *  - Marcar "Concluído fora (Excel)" / arquivar OS: quem verifica. Tira o laudo
 *    das filas sem passar pelo fluxo — decisão do usuário em 14/09.
 * (Contas em 14/09: 2 gestores verificadores, 1 admin aprovador, 1 gestor —
 * ninguém perdeu o que já fazia.)
 */

export type PapelDoUsuario = { role?: string | null; labRole?: string | null };
export type AcaoDoFluxo = "verificar" | "aprovar" | "concluir_fora";

export function podeVerificar(p: PapelDoUsuario | null | undefined): boolean {
  if (!p) return false;
  return p.role === "admin" || p.role === "gestor" || p.labRole === "verificador" || p.labRole === "aprovador";
}

export function podeAprovar(p: PapelDoUsuario | null | undefined): boolean {
  if (!p) return false;
  return p.role === "admin" || p.labRole === "aprovador";
}

/** "Concluído fora (Excel)": a mesma regra de quem verifica. */
export const podeConcluirFora = podeVerificar;

const RECUSA: Record<AcaoDoFluxo, string> = {
  verificar: "Sem permissão: só verificador, aprovador, gestor ou administrador verifica laudos.",
  aprovar: "Sem permissão: só o aprovador (responsável técnico) ou o administrador aprova laudos.",
  concluir_fora:
    "Sem permissão: só verificador, aprovador, gestor ou administrador marca laudo como concluído fora (Excel).",
};

/** Para o servidor: recusa a ação se o papel não permite. */
export function exigirPermissaoNoFluxo(p: PapelDoUsuario | null | undefined, acao: AcaoDoFluxo): void {
  const pode = acao === "aprovar" ? podeAprovar(p) : acao === "verificar" ? podeVerificar(p) : podeConcluirFora(p);
  if (!pode) throw new Error(RECUSA[acao]);
}
