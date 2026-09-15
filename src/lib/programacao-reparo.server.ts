/**
 * Arrumar a planilha da programação — SÓ SERVIDOR (carregar com `import()`).
 * Lógica em programacao-reparo.ts.
 *
 * As telas já leem as linhas tortas certo (programacao-fonte.server.ts); isto
 * endireita a planilha de vez, para quem a abre direto no Google. Antes de
 * regravar, guarda os valores como estavam em
 * "operacao/programacao-planilha-antes-<data>.json".
 */
import { ensureFolderPath, readDriveJson, writeDriveJson } from "@/lib/driveStorage";
import { ABAS_DA_PROGRAMACAO, arrumarPlanilha, type Abas, type RelatorioAba, type RelatorioTipos } from "./programacao-reparo";
import { lerAbasCruas, planilhaConfigurada, regravarAbas } from "./programacao-planilha.server";
import { readStore } from "./programacao-store.server";

const PASTA = ["operacao"];
const MARCA = "programacao-arrumacao.json";

export type MarcaDaArrumacao = { em: string; por: string; copia: string; abas: string[] };

export type Diagnostico = {
  planilhaConfigurada: boolean;
  ultimaArrumacao: MarcaDaArrumacao | null;
  /** Abas que a arrumação regravaria agora. */
  abasParaArrumar: string[];
  relatorio: RelatorioAba[];
  tipos: RelatorioTipos | null;
};

export type ResultadoArrumacao = { abas: string[]; copia: string | null; relatorio: RelatorioAba[]; tipos: RelatorioTipos };

async function lerTudo() {
  const [planilha, banco] = await Promise.all([lerAbasCruas(ABAS_DA_PROGRAMACAO), readStore()]);
  return { planilha, banco: banco as unknown as Abas };
}

/** Simulação: o que a arrumação faria agora, sem gravar nada. */
export async function diagnosticar(): Promise<Diagnostico> {
  const pasta = await ensureFolderPath(PASTA);
  const ultimaArrumacao = await readDriveJson<MarcaDaArrumacao>(MARCA, pasta);
  if (!planilhaConfigurada()) {
    return { planilhaConfigurada: false, ultimaArrumacao, abasParaArrumar: [], relatorio: [], tipos: null };
  }
  const { planilha, banco } = await lerTudo();
  const a = arrumarPlanilha(planilha, banco);
  return {
    planilhaConfigurada: true,
    ultimaArrumacao,
    abasParaArrumar: a.abas.map((x) => x.aba),
    relatorio: a.relatorio,
    tipos: a.tipos,
  };
}

export async function arrumar(por: string): Promise<ResultadoArrumacao> {
  if (!planilhaConfigurada()) throw new Error("A planilha da programação não está configurada neste servidor.");
  const pasta = await ensureFolderPath(PASTA);
  const { planilha, banco } = await lerTudo();
  const a = arrumarPlanilha(planilha, banco);
  if (a.abas.length === 0) return { abas: [], copia: null, relatorio: a.relatorio, tipos: a.tipos };

  // A cópia vem antes de mexer: se ela falhar, a planilha fica como está.
  const agora = new Date().toISOString();
  const copia = `programacao-planilha-antes-${agora.replace(/[:.]/g, "-")}.json`;
  await writeDriveJson(copia, { em: agora, por, planilha }, pasta);
  await regravarAbas(a.abas);
  const marca: MarcaDaArrumacao = { em: agora, por, copia, abas: a.abas.map((x) => x.aba) };
  await writeDriveJson(MARCA, marca, pasta);
  return { abas: marca.abas, copia, relatorio: a.relatorio, tipos: a.tipos };
}
