/**
 * Liga o tempo real da aba (Fase 3) e atualiza na hora as consultas que
 * dependem dos documentos avisados. A árvore do laboratório (labStore) ouve os
 * avisos por conta própria — ver features/lab/store.ts.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { aoMudar, iniciarTempoReal, pararTempoReal } from "@/lib/tempo-real";

/** Pasta do banco → consultas (React Query) a atualizar quando algo nela muda. */
const CONSULTAS_POR_PASTA: Record<string, string[][]> = {
  "lab-pendencias": [["lab-pendencias"]],
  "lab-ensaios": [["emissoes-os"]],
  "os-hub": [["os-hub"]],
  raiz: [["chegada-shared-state"]],
};

export function TempoRealSync() {
  const qc = useQueryClient();
  // Só com conta (Fase 4): sem login o servidor recusa a conexão, e o
  // formulário público de chegada não tem o que ouvir.
  const logado = !!useAuth().user;

  useEffect(() => {
    if (!logado) return;
    iniciarTempoReal();
    return pararTempoReal;
  }, [logado]);

  useEffect(
    () =>
      aoMudar((docs) => {
        const chaves = new Map<string, string[]>();
        for (const d of docs) for (const k of CONSULTAS_POR_PASTA[d.pasta] ?? []) chaves.set(k.join("|"), k);
        for (const k of chaves.values()) void qc.invalidateQueries({ queryKey: k });
      }),
    [qc],
  );
  return null;
}
