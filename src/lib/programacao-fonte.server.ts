/**
 * De onde a programação é lida e onde é gravada — SÓ SERVIDOR.
 *
 * Com a planilha configurada (produção), ELA é a fonte, aba por aba: as telas
 * leem a planilha (linhas tortas pelo gabarito, tipos corrigidos na leitura —
 * programacao-reparo.ts) e cada gravação vai para a linha certa, na coluna do
 * cabeçalho. Aba que não existe na planilha, ou sem cabeçalho com "id", segue
 * na cópia do app — como sempre foi.
 *
 * Sem planilha (teste local), tudo na cópia do app (programacao_db.json).
 *
 * A cópia do app NÃO é a fonte em produção: nasceu da semente de exemplo
 * (programacao-store.server.ts) e ficou para trás. Mostrá-la no lugar da
 * planilha foi o erro da versão 17ea204 (Gantt com as 23 programações de
 * exemplo). Aqui ela só empresta os gabaritos das linhas tortas.
 */
import {
  ABAS_DA_PROGRAMACAO,
  linhaParaPlanilha,
  lerPlanilha,
  type Abas,
  type Linha,
  type ModeloDaPlanilha,
} from "./programacao-reparo";
import {
  acrescentarLinhas,
  apagarLinhas,
  gravarCabecalho,
  gravarLinha,
  lerAbasCruas,
  planilhaConfigurada,
} from "./programacao-planilha.server";
import { atualizarStore, readStore, type DadosProgramacao } from "./programacao-store.server";
import { planejarImportacao, type PedidoImportacao, type ResumoImportacao } from "./programacao-importacao";

type Estado = { modelo: ModeloDaPlanilha; banco: DadosProgramacao };

// Uma página abre 5 abas de uma vez: a mesma leitura serve a todas por 2 s.
const VALIDADE_MS = 2000;
let emCache: { em: number; estado: Promise<Estado> } | null = null;

async function lerEstado(): Promise<Estado> {
  const [planilha, banco] = await Promise.all([lerAbasCruas(ABAS_DA_PROGRAMACAO), readStore()]);
  const b = banco as DadosProgramacao;
  return { modelo: lerPlanilha(planilha, b as Abas), banco: b };
}

function estado(fresco = false): Promise<Estado> {
  if (!fresco && emCache && Date.now() - emCache.em < VALIDADE_MS) return emCache.estado;
  const p = lerEstado();
  emCache = { em: Date.now(), estado: p };
  p.catch(() => {
    if (emCache?.estado === p) emCache = null;
  });
  return p;
}

const esquecer = () => {
  emCache = null;
};

const naPlanilha = (e: Estado, aba: string) => !!e.modelo.cabecalhos[aba];

export async function lerAba(aba: string): Promise<Linha[]> {
  if (!planilhaConfigurada()) return ((await readStore()) as DadosProgramacao)[aba] ?? [];
  const e = await estado();
  return naPlanilha(e, aba) ? e.modelo.dados[aba] ?? [] : e.banco[aba] ?? [];
}

export async function inserir(aba: string, nova: Linha): Promise<void> {
  if (planilhaConfigurada()) {
    const e = await estado(true);
    if (naPlanilha(e, aba)) {
      const l = linhaParaPlanilha(e.modelo.cabecalhos[aba], nova);
      if (l.cabecalhoMudou) await gravarCabecalho(aba, l.cabecalho);
      await acrescentarLinhas(aba, [l.valores]);
      esquecer();
      return;
    }
  }
  await atualizarStore((d) => ({ ...d, [aba]: [...(d[aba] ?? []), nova] }));
  esquecer();
}

/** Atualiza campos de um registro. Devolve false se o id não existe na aba. */
export async function atualizar(aba: string, id: string, patch: Record<string, unknown>): Promise<boolean> {
  const agora = new Date().toISOString();
  if (planilhaConfigurada()) {
    const e = await estado(true);
    if (naPlanilha(e, aba)) {
      const atual = e.modelo.dados[aba]?.find((r) => r.id === id);
      const pos = e.modelo.posicao[aba]?.get(id);
      if (!atual || !pos) return false;
      const l = linhaParaPlanilha(e.modelo.cabecalhos[aba], { ...atual, ...patch, updated_at: agora });
      if (l.cabecalhoMudou) await gravarCabecalho(aba, l.cabecalho);
      // Linha torta pode ser mais larga que o cabeçalho: completa com vazio para não sobrar valor velho.
      const largura = e.modelo.larguras[aba]?.get(pos) ?? 0;
      const valores = [...l.valores, ...Array(Math.max(0, largura - l.valores.length)).fill("")];
      await gravarLinha(aba, pos, valores);
      esquecer();
      return true;
    }
  }
  let achou = false;
  await atualizarStore((d) => {
    const linhas = d[aba] ?? [];
    const i = linhas.findIndex((r) => r.id === id);
    achou = i !== -1;
    if (!achou) return null;
    const novas = [...linhas];
    novas[i] = { ...linhas[i], ...patch, updated_at: agora } as Linha;
    return { ...d, [aba]: novas };
  });
  esquecer();
  return achou;
}

export async function apagar(aba: string, id: string): Promise<void> {
  if (planilhaConfigurada()) {
    const e = await estado(true);
    if (naPlanilha(e, aba)) {
      // Todas as linhas com o id — senão uma cópia antiga "volta" depois.
      await apagarLinhas(aba, e.modelo.posicoes[aba]?.get(id) ?? []);
      esquecer();
      return;
    }
  }
  await atualizarStore((d) => {
    const linhas = d[aba] ?? [];
    const restantes = linhas.filter((r) => r.id !== id);
    return restantes.length === linhas.length ? null : { ...d, [aba]: restantes };
  });
  esquecer();
}

const ABAS_DA_IMPORTACAO = ["Tipos de Ensaio", "Amostras", "Ensaios"] as const;

/**
 * Importação de ensaios: decide tudo de uma vez sobre o que as telas veem e
 * acrescenta as linhas novas — tipos, depois amostras, depois ensaios, uma ida
 * por aba, cada valor na coluna do cabeçalho.
 */
export async function importar(pedido: PedidoImportacao): Promise<ResumoImportacao> {
  const novoId = () => crypto.randomUUID();
  const agora = new Date().toISOString();

  if (!planilhaConfigurada()) {
    let resumo!: ResumoImportacao;
    await atualizarStore((d) => {
      const r = planejarImportacao(d, pedido, novoId, agora);
      resumo = r.resumo;
      return r.dados as DadosProgramacao;
    });
    return resumo;
  }

  const e = await estado(true);
  const atual: Abas = {};
  for (const aba of ABAS_DA_IMPORTACAO) atual[aba] = naPlanilha(e, aba) ? e.modelo.dados[aba] ?? [] : e.banco[aba] ?? [];
  const r = planejarImportacao(atual, pedido, novoId, agora);

  for (const aba of ABAS_DA_IMPORTACAO) {
    const antes = new Set(atual[aba].map((x) => x.id));
    const novas = (r.dados[aba] ?? []).filter((x) => !antes.has(x.id));
    if (novas.length === 0) continue;
    if (naPlanilha(e, aba)) {
      let cab = e.modelo.cabecalhos[aba];
      for (const n of novas) cab = linhaParaPlanilha(cab, n).cabecalho;
      if (cab.length !== e.modelo.cabecalhos[aba].length) await gravarCabecalho(aba, cab);
      await acrescentarLinhas(aba, novas.map((n) => linhaParaPlanilha(cab, n).valores));
    } else {
      await atualizarStore((d) => ({ ...d, [aba]: [...(d[aba] ?? []), ...novas] }));
    }
  }
  esquecer();
  return r.resumo;
}
