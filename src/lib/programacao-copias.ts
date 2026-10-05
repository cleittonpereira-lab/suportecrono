/**
 * Ensaios pendentes que são CÓPIA de outro: mesma OS, mesma amostra (pelo
 * código, para pegar também amostra cadastrada duas vezes) e mesmo tipo de
 * ensaio. Em cada grupo fica um original — o que já tem programação, senão o
 * primeiro da lista (ordem da planilha = ordem de cadastro); os demais
 * pendentes do grupo são cópias.
 */
export interface EnsaioParaCopia {
  id: string;
  amostra_id: string;
  tipo_ensaio_id: string;
  status?: string | null;
}

export interface AmostraParaCopia {
  os_numero?: string | null;
  codigo_amostra?: string | null;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");

export function acharCopiasPendentes(
  ensaios: EnsaioParaCopia[],
  idsComProgramacao: Set<string>,
  amostraById: Map<string, AmostraParaCopia>,
): Set<string> {
  const grupos = new Map<string, EnsaioParaCopia[]>();
  for (const e of ensaios) {
    if (e.status === "cancelado") continue;
    const a = amostraById.get(e.amostra_id);
    const codigo = norm(a?.codigo_amostra);
    // Sem código de amostra não dá para afirmar que é a mesma amostra: só o mesmo id conta.
    const amostra = codigo ? `${norm(a?.os_numero)}|${codigo}` : `id:${e.amostra_id}`;
    const chave = `${amostra}|${e.tipo_ensaio_id}`;
    const g = grupos.get(chave) ?? [];
    g.push(e);
    grupos.set(chave, g);
  }

  const copias = new Set<string>();
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    const original = g.find((e) => idsComProgramacao.has(e.id)) ?? g[0];
    for (const e of g) {
      if (e !== original && !idsComProgramacao.has(e.id)) copias.add(e.id);
    }
  }
  return copias;
}
