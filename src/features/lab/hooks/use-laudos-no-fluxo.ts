/**
 * Todos os laudos com a situação do fluxo e da entrega — uma consulta só para
 * a Central de Relatórios (quadro "Meus laudos", aba Entregas e contadores).
 * Atualiza sozinha quando um laudo muda em outro computador.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEmissoes } from "@/lib/emissoes.functions";
import { aoMudar } from "@/lib/tempo-real";

export const CHAVE_LAUDOS_NO_FLUXO = ["laudos-no-fluxo"] as const;

export function useLaudosNoFluxo() {
  const listFn = useServerFn(listEmissoes);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: CHAVE_LAUDOS_NO_FLUXO,
    queryFn: () => listFn({ data: {} }),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const parar = aoMudar((docs) => {
      if (!docs.some((d) => d.pasta === "lab-ensaios")) return;
      clearTimeout(timer);
      timer = setTimeout(() => void qc.invalidateQueries({ queryKey: CHAVE_LAUDOS_NO_FLUXO }), 500);
    });
    return () => {
      clearTimeout(timer);
      parar();
    };
  }, [qc]);
  return q;
}
