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
  | { tipo: "renomear"; remota: RevisaoRemota; local: L }
  /** Duplicata da mesma revisão (duas chamadas concorrentes já tratou a rev): só apaga. */
  | { tipo: "remover_duplicata"; local: L }
  /** Cópia trazida do Drive cuja revisão foi excluída lá (lixeira): sai daqui também. */
  | { tipo: "remover_excluida"; local: L };

/**
 * `pastaExiste`: a pasta `relatorios` do ensaio foi encontrada no Drive. Só
 * então uma revisão ausente lá conta como excluída — sem a pasta (Drive fora
 * do ar, ensaio renomeado), a lista vazia não apaga nada daqui.
 */
export function planoDeSincronizacao<L extends VersaoLocalMin>(
  locais: L[],
  remotas: RevisaoRemota[],
  pastaExiste = false,
): AcaoDeSincronizacao<L>[] {
  const acoes: AcaoDeSincronizacao<L>[] = [];
  if (pastaExiste) {
    const noDrive = new Set(remotas.map((r) => r.rev));
    for (const local of locais) {
      if (local.note?.startsWith(MARCA_DO_DRIVE) && !noDrive.has(local.rev)) {
        acoes.push({ tipo: "remover_excluida", local });
      }
    }
  }
  for (const remota of remotas) {
    // Duas chamadas concorrentes a sincronizarVersoesComDrive (ex.: o aviso em
    // tempo real disparando enquanto o mount ainda está sincronizando) podiam
    // ler a mesma lista local "antes" e cada uma gravar sua própria cópia —
    // gerando várias linhas idênticas para a mesma revisão. Entre duplicatas,
    // prefere a que já foi marcada como vinda do Drive (mais completa); as
    // demais são só lixo a apagar.
    const candidatos = locais.filter((v) => v.rev === remota.rev);
    const local = candidatos.find((v) => v.note?.startsWith(MARCA_DO_DRIVE)) ?? candidatos[0];
    for (const extra of candidatos) {
      if (extra !== local) acoes.push({ tipo: "remover_duplicata", local: extra });
    }
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
