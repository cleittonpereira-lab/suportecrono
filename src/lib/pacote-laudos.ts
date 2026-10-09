/**
 * Qual laudo entra no pacote de PDFs: de cada OS + amostra + ensaio, só o de
 * revisão maior. Duas linhas do mesmo ensaio aparecem quando a amostra foi
 * cadastrada em dobro (ex.: 13706-01 da OS 17959-26, com Rev-02 numa cópia e
 * Rev-01 na outra) — a mais velha não pode ir ao cliente.
 */
export type LaudoComRevisao = {
  rev: number | null;
  os_numero: string | null;
  amostra_code: string | null;
  ensaio_tipo: string | null;
  ensaio_nome: string | null;
};

export function chaveDoEnsaio(l: LaudoComRevisao): string {
  return [l.os_numero, l.amostra_code, l.ensaio_tipo, l.ensaio_nome]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .join("|");
}

/** Fica só a revisão maior de cada OS + amostra + ensaio; devolve também os que saíram. */
export function ultimaRevisaoDeCada<T extends LaudoComRevisao>(laudos: T[]): { manter: T[]; substituidos: T[] } {
  const melhor = new Map<string, T>();
  for (const l of laudos) {
    const atual = melhor.get(chaveDoEnsaio(l));
    if (!atual || (l.rev ?? -1) > (atual.rev ?? -1)) melhor.set(chaveDoEnsaio(l), l);
  }
  const ficam = new Set(melhor.values());
  return { manter: laudos.filter((l) => ficam.has(l)), substituidos: laudos.filter((l) => !ficam.has(l)) };
}
