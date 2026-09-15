/**
 * Painel do coordenador no servidor — SÓ SERVIDOR (carregar com `import()`).
 * Junta as mesmas fontes que a tela usa, sem depender de sessão, para o
 * agendamento (resumo da manhã e aviso de risco). Lógica em painel-coordenador.ts.
 */
import { ensureFolderPath, lerJsonsDaPasta } from "@/lib/driveStorage";
import { entradaDasFontes, montarPainel, type EntradaPainel, type FontesDoPainel, type PainelModelo, type Setor } from "./painel-coordenador";
import { SHEET_AMOSTRAS, SHEET_ENSAIOS, SHEET_EQUIPS, SHEET_PROGS, SHEET_TIPOS, parseProgramacaoRow } from "./programacao-model";
import type { OsHubData } from "./os-hub.functions";

export type DataAcordada = { osNumero: string; data: string | null; arquivada: boolean };

/** Data acordada e arquivamento de todas as OS numa leitura só (pasta os-hub). */
export async function lerDatasAcordadas(): Promise<Record<string, DataAcordada>> {
  const folderId = await ensureFolderPath(["os-hub"]);
  const docs = await lerJsonsDaPasta<OsHubData>(folderId);
  const out: Record<string, DataAcordada> = {};
  for (const { data } of docs) {
    if (!data?.osNumero) continue;
    out[data.osNumero] = { osNumero: data.osNumero, data: data.dataAcordadaAtual ?? null, arquivada: !!data.arquivada };
  }
  return out;
}

export async function entradaNoServidor(setor: Setor, hoje: string): Promise<EntradaPainel> {
  const [{ lerCronogramaSemCache }, { lerAba }, { handleFetchSharedChegadaState }, { listarPendencias }] = await Promise.all([
    import("./cronograma.server"),
    import("./programacao-fonte.server"),
    import("./chegada-amostras.functions"),
    import("./lab-pendencias-leitura.server"),
  ]);
  const [cronograma, datasAcordadas, chegada, pendencias, amostras, ensaios, progs, tipos, equipamentos] = await Promise.all([
    lerCronogramaSemCache(),
    lerDatasAcordadas(),
    handleFetchSharedChegadaState(),
    listarPendencias(),
    lerAba(SHEET_AMOSTRAS),
    lerAba(SHEET_ENSAIOS),
    lerAba(SHEET_PROGS),
    lerAba(SHEET_TIPOS),
    lerAba(SHEET_EQUIPS),
  ]);
  return entradaDasFontes({
    hoje,
    setor,
    cronograma: cronograma.rows,
    datasAcordadas,
    chegada: chegada as FontesDoPainel["chegada"],
    amostras,
    ensaios,
    programacoes: progs.map(parseProgramacaoRow),
    tipos,
    equipamentos,
    pendencias,
  });
}

export async function montarPainelNoServidor(setor: Setor, hoje: string): Promise<PainelModelo> {
  return montarPainel(await entradaNoServidor(setor, hoje));
}
