/**
 * O que trazer do Drive para a lista de versões deste navegador (regra pura,
 * testável — a execução está em revisoes-do-drive.ts).
 *
 * A lista de versões de cada tela é guardada no navegador (IndexedDB). Em
 * outro computador ela aparecia vazia, e a cópia local de quem gerou o PDF
 * ficava sem as assinaturas que o PDF do Drive recebe depois.
 */

/** Marca, na versão local, de qual cópia do Drive ela veio (data de modificação no Drive). */
export const MARCA_DO_DRIVE = "drive:";

/** Diferença mínima para considerar que o PDF do Drive mudou depois de a cópia local ser gerada. */
const FOLGA_MS = 120_000;

export type VersaoLocalMin = { id: string; rev: number; createdAt: string; filename: string; note?: string };
export type RevisaoRemota = { rev: number; filename: string; size: number; updatedAt: string; criadoEm?: string };

export type AcaoDeSincronizacao<L extends VersaoLocalMin = VersaoLocalMin> =
  /** Baixar o PDF do Drive (e trocar a cópia local, se houver). */
  | { tipo: "baixar"; remota: RevisaoRemota; substitui?: L }
  /** Mesmo PDF, só o nome local mudou para o nome oficial do Drive. */
  | { tipo: "renomear"; remota: RevisaoRemota; local: L };

export function planoDeSincronizacao<L extends VersaoLocalMin>(locais: L[], remotas: RevisaoRemota[]): AcaoDeSincronizacao<L>[] {
  const acoes: AcaoDeSincronizacao<L>[] = [];
  for (const remota of remotas) {
    const local = locais.find((v) => v.rev === remota.rev);
    if (!local) {
      acoes.push({ tipo: "baixar", remota });
      continue;
    }
    if (local.note?.startsWith(MARCA_DO_DRIVE)) {
      // Cópia já trazida do Drive: só baixa de novo se o arquivo do Drive mudou.
      if (local.note !== MARCA_DO_DRIVE + remota.updatedAt) acoes.push({ tipo: "baixar", remota, substitui: local });
      continue;
    }
    // Cópia gerada neste navegador: o Drive mudou depois (assinaturas, reemissão)?
    const mudouDepois = Date.parse(remota.updatedAt) - Date.parse(local.createdAt) > FOLGA_MS;
    if (mudouDepois) acoes.push({ tipo: "baixar", remota, substitui: local });
    else acoes.push({ tipo: "renomear", remota, local });
  }
  return acoes;
}
