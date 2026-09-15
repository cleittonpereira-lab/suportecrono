/**
 * Reparo e espelho da programação — SÓ SERVIDOR (carregar com `import()`).
 * Lógica em programacao-reparo.ts; planilha em programacao-planilha.server.ts.
 *
 * Reparar: guarda uma cópia do banco E da planilha como estavam
 * ("operacao/programacao-antes-do-reparo-<data>.json"), junta as duas no
 * banco e regrava a planilha como espelho.
 *
 * O espelho (botão e agendamento diário) só roda depois do primeiro reparo:
 * antes disso a planilha ainda tem linhas que só existem nela, e regravá-la a
 * partir do banco as apagaria. Depois do primeiro reparo o banco é a verdade:
 * um reparo novo nunca descarta o que só está no app.
 */
import { ensureFolderPath, readDriveJson, writeDriveJson } from "@/lib/driveStorage";
import { ABAS_DA_PROGRAMACAO, montarReparo, valoresDaAba, type RelatorioReparo } from "./programacao-reparo";
import { lerAbasCruas, planilhaConfigurada, regravarAbas } from "./programacao-planilha.server";
import { atualizarStore, readStore, type DadosProgramacao } from "./programacao-store.server";

const PASTA = ["operacao"];
const MARCA = "programacao-reparo.json";

export type ResultadoEspelho = { abas: number; linhas: number };

export type MarcaDoReparo = {
  em: string;
  por: string;
  ultimoEspelho?: ({ em: string } & ResultadoEspelho) | null;
  ultimoErroEspelho?: { em: string; mensagem: string } | null;
};

export type Diagnostico = {
  planilhaConfigurada: boolean;
  reparo: MarcaDoReparo | null;
  relatorio: RelatorioReparo | null;
};

export type ResultadoReparo = {
  relatorio: RelatorioReparo;
  copia: string;
  espelho: ResultadoEspelho | { erro: string };
};

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function pastaEMarca(): Promise<{ pasta: string; marca: MarcaDoReparo | null }> {
  const pasta = await ensureFolderPath(PASTA);
  return { pasta, marca: await readDriveJson<MarcaDoReparo>(MARCA, pasta) };
}

/** Simulação: o que o reparo faria agora, sem gravar nada. */
export async function diagnosticar(opcoes: { manterSoNoApp: boolean }): Promise<Diagnostico> {
  const { marca } = await pastaEMarca();
  if (!planilhaConfigurada()) return { planilhaConfigurada: false, reparo: marca, relatorio: null };
  const [banco, planilha] = await Promise.all([readStore(), lerAbasCruas(ABAS_DA_PROGRAMACAO)]);
  const manterSoNoApp = marca ? true : opcoes.manterSoNoApp;
  return {
    planilhaConfigurada: true,
    reparo: marca,
    relatorio: montarReparo(banco as DadosProgramacao, planilha, { manterSoNoApp }).relatorio,
  };
}

export async function reparar(opcoes: { manterSoNoApp: boolean }, por: string): Promise<ResultadoReparo> {
  if (!planilhaConfigurada()) throw new Error("A planilha da programação não está configurada neste servidor.");
  const { pasta, marca } = await pastaEMarca();
  const manterSoNoApp = marca ? true : opcoes.manterSoNoApp;
  const planilha = await lerAbasCruas(ABAS_DA_PROGRAMACAO);
  const agora = new Date().toISOString();

  // A cópia vem antes de mexer em qualquer coisa: se ela falhar, nada muda.
  const copia = `programacao-antes-do-reparo-${agora.replace(/[:.]/g, "-")}.json`;
  await writeDriveJson(copia, { em: agora, por, banco: await readStore(), planilha }, pasta);

  let relatorio!: RelatorioReparo;
  await atualizarStore((atual) => {
    const r = montarReparo(atual, planilha, { manterSoNoApp });
    relatorio = r.relatorio;
    return r.dados as DadosProgramacao;
  });
  await writeDriveJson(MARCA, { ...(marca ?? {}), em: agora, por } satisfies MarcaDoReparo, pasta);

  const espelho = await espelhar().catch((e) => ({ erro: mensagem(e) }));
  return { relatorio, copia, espelho };
}

/** Regrava a planilha inteira a partir do banco — cada valor na coluna do cabeçalho. */
export async function espelhar(): Promise<ResultadoEspelho> {
  const { pasta, marca } = await pastaEMarca();
  if (!marca) {
    throw new Error("Repare a programação antes de regravar a planilha: ela ainda tem linhas que só existem nela.");
  }
  const dados = (await readStore()) as DadosProgramacao;
  const abas = [...new Set<string>([...ABAS_DA_PROGRAMACAO, ...Object.keys(dados)])].filter((a) => Array.isArray(dados[a]));
  const valores = abas.map((aba) => ({ aba, valores: valoresDaAba(aba, dados[aba]) }));
  try {
    await regravarAbas(valores);
  } catch (e) {
    await writeDriveJson(MARCA, { ...marca, ultimoErroEspelho: { em: new Date().toISOString(), mensagem: mensagem(e) } }, pasta);
    throw e;
  }
  const r: ResultadoEspelho = { abas: abas.length, linhas: valores.reduce((s, a) => s + a.valores.length - 1, 0) };
  await writeDriveJson(
    MARCA,
    { ...marca, ultimoEspelho: { em: new Date().toISOString(), ...r }, ultimoErroEspelho: null } satisfies MarcaDoReparo,
    pasta,
  );
  return r;
}

/** Para o agendamento diário: só espelha depois do primeiro reparo, e só com a planilha configurada. */
export async function espelharSeLiberado(): Promise<string> {
  if (!planilhaConfigurada()) return "planilha não configurada — nada a fazer";
  const { marca } = await pastaEMarca();
  if (!marca) return "aguardando o primeiro reparo — planilha intocada";
  const r = await espelhar();
  return `${r.abas} abas, ${r.linhas} linhas`;
}
