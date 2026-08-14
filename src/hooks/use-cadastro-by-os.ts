import { useMemo } from "react";
import { useCadastroOs } from "@/hooks/use-cadastro-os";
import type { CadastroRow } from "@/lib/cadastro.functions";
import { normOs } from "@/lib/schedule-utils";

export function useCadastroByOs() {
  const { data, isLoading } = useCadastroOs();
  const map = useMemo(() => {
    const m = new Map<string, CadastroRow>();
    if (!data) return m;
    for (const r of data.rows) {
      const key = normOs(r.os);
      if (!key) continue;
      // Mantém o primeiro encontrado (mais antigo) — evita sobrescrever
      if (!m.has(key)) m.set(key, r);
    }
    return m;
  }, [data]);

  return {
    isLoading,
    lookup: (os: string): CadastroRow | undefined => map.get(normOs(os)),
  };
}