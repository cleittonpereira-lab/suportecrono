/**
 * Árvore OS → amostras → ensaios montada a partir das linhas soltas que o
 * servidor devolve (`syncLabTree`), e a cópia local dessas linhas que permite
 * pedir só o que mudou desde a última consulta.
 *
 * Sem React nem server functions: roda no servidor (`loadLabTree`) e no
 * navegador (labStore), e é testável isoladamente.
 */
import type { Amostra, Ensaio, OS } from "./types";
import type { SerializableJson } from "@/lib/lab-entities.functions";

export type LinhaOS = Omit<OS, "amostras">;
export type LinhaAmostra = Omit<Amostra, "ensaios"> & { osId: string };
export type LinhaEnsaio = Omit<Ensaio, "payload"> & { payload?: SerializableJson; amostraId: string };

export type EnsaioArvore = Omit<LinhaEnsaio, "amostraId">;
export type AmostraArvore = Omit<LinhaAmostra, "osId"> & { ensaios: EnsaioArvore[] };
export type OSArvore = LinhaOS & { amostras: AmostraArvore[] };
export type Arvore = { os: OSArvore[] };

/** Linha vinda de um arquivo do Drive, com a `version` dele (null = desconhecida: vem sempre). */
export type LinhaSync<T> = { fileId: string; version: string | null; dados: T };

export type RespostaSync = {
  /** Só as linhas de arquivos novos ou alterados desde `conhecidos`. */
  os: LinhaSync<LinhaOS>[];
  amostras: LinhaSync<LinhaAmostra>[];
  ensaios: LinhaSync<LinhaEnsaio>[];
  /** Todos os fileIds presentes agora em cada pasta, na ordem da listagem. */
  ordem: { os: string[]; amostras: string[]; ensaios: string[] };
};

export type CacheRemoto = {
  os: Map<string, LinhaSync<LinhaOS>>;
  amostras: Map<string, LinhaSync<LinhaAmostra>>;
  ensaios: Map<string, LinhaSync<LinhaEnsaio>>;
  ordem: RespostaSync["ordem"];
};

const PASTAS = ["os", "amostras", "ensaios"] as const;

export function cacheVazio(): CacheRemoto {
  return { os: new Map(), amostras: new Map(), ensaios: new Map(), ordem: { os: [], amostras: [], ensaios: [] } };
}

/** fileId → version de tudo que já está no cache — o `conhecidos` enviado ao `syncLabTree`. */
export function versoesConhecidas(cache: CacheRemoto): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pasta of PASTAS) {
    for (const [fileId, linha] of cache[pasta]) {
      if (linha.version) out[fileId] = linha.version;
    }
  }
  return out;
}

function mesmaOrdem(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function aplicarPasta<T>(atual: Map<string, LinhaSync<T>>, novas: LinhaSync<T>[], ordem: string[]): Map<string, LinhaSync<T>> {
  const presentes = new Set(ordem);
  const proximo = new Map<string, LinhaSync<T>>();
  for (const [fileId, linha] of atual) {
    if (presentes.has(fileId)) proximo.set(fileId, linha);
  }
  for (const linha of novas) proximo.set(linha.fileId, linha);
  return proximo;
}

/**
 * Aplica uma resposta do `syncLabTree`: linhas novas/alteradas entram, arquivos
 * que saíram da pasta saem. `mudou` é false quando a resposta não trouxe nada
 * novo — quem chama pode pular a fusão com o estado local e o re-render.
 */
export function aplicarSync(cache: CacheRemoto, resp: RespostaSync): { cache: CacheRemoto; mudou: boolean } {
  const mudou =
    resp.os.length + resp.amostras.length + resp.ensaios.length > 0 ||
    PASTAS.some((p) => !mesmaOrdem(cache.ordem[p], resp.ordem[p]));
  return {
    cache: {
      os: aplicarPasta(cache.os, resp.os, resp.ordem.os),
      amostras: aplicarPasta(cache.amostras, resp.amostras, resp.ordem.amostras),
      ensaios: aplicarPasta(cache.ensaios, resp.ensaios, resp.ordem.ensaios),
      ordem: resp.ordem,
    },
    mudou,
  };
}

/**
 * Monta a árvore na ordem recebida. Os campos de vínculo (`osId`, `amostraId`)
 * não entram no objeto final: a árvore sai exatamente como o `loadLabTree`
 * sempre entregou (a fusão do labStore compara os objetos por JSON). Ensaio de
 * amostra desconhecida, ou amostra de OS desconhecida, fica de fora — como antes.
 */
export function montarArvore(os: LinhaOS[], amostras: LinhaAmostra[], ensaios: LinhaEnsaio[]): Arvore {
  const ensaiosPorAmostra = new Map<string, EnsaioArvore[]>();
  for (const { amostraId, ...ensaio } of ensaios) {
    const lista = ensaiosPorAmostra.get(amostraId) ?? [];
    lista.push(ensaio);
    ensaiosPorAmostra.set(amostraId, lista);
  }

  const amostrasPorOS = new Map<string, AmostraArvore[]>();
  for (const { osId, ...amostra } of amostras) {
    const lista = amostrasPorOS.get(osId) ?? [];
    lista.push({ ...amostra, ensaios: ensaiosPorAmostra.get(amostra.id) ?? [] });
    amostrasPorOS.set(osId, lista);
  }

  return { os: os.map((o) => ({ ...o, amostras: amostrasPorOS.get(o.id) ?? [] })) };
}

function emOrdem<T>(mapa: Map<string, LinhaSync<T>>, ordem: string[]): T[] {
  const out: T[] = [];
  for (const fileId of ordem) {
    const linha = mapa.get(fileId);
    if (linha) out.push(linha.dados);
  }
  return out;
}

/** Árvore a partir do cache, na ordem da última listagem. */
export function arvoreDoCache(cache: CacheRemoto): Arvore {
  return montarArvore(
    emOrdem(cache.os, cache.ordem.os),
    emOrdem(cache.amostras, cache.ordem.amostras),
    emOrdem(cache.ensaios, cache.ordem.ensaios),
  );
}
