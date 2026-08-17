import { useMemo } from "react";
import { useCadastroOs } from "@/hooks/use-cadastro-os";
import { useSchedule } from "@/hooks/use-schedule";
import type { CadastroRow } from "@/lib/cadastro.functions";
import { normOs } from "@/lib/schedule-utils";

export function useCadastroByOs() {
  const { data: cadData, isLoading: l1 } = useCadastroOs();
  const { data: schedData, isLoading: l2 } = useSchedule();

  const map = useMemo(() => {
    const m = new Map<string, CadastroRow>();

    // 1. Cadastros de OS (prioridade máxima por conter local, sup, etc.)
    if (cadData) {
      for (const r of cadData.rows) {
        const key = normOs(r.os);
        if (!key) continue;
        if (!m.has(key)) m.set(key, r);
      }
    }

    // 2. Cronograma (fallback quando a OS não estiver na planilha do ano corrente)
    if (schedData) {
      for (const s of schedData.rows) {
        const key = normOs(s.os);
        if (!key) continue;
        if (!m.has(key) && s.tomador) {
          m.set(key, {
            mes: "JUN" as any,
            tomador: s.tomador || "",
            os: s.os,
            sup: "",
            obra: (s as any).obra || "",
            local: "",
            dataEnvio: "",
            dataCriacao: "",
            primeiroSuporte: "",
            primeiroCliente: "",
            segundoSuporte: "",
            segundoCliente: "",
            terceiroSuporte: "",
            terceiroCliente: "",
            servicos: {},
            totalHoras: 0,
          });
        }
      }
    }

    return m;
  }, [cadData, schedData]);

  return {
    isLoading: l1 || l2,
    lookup: (os: string): CadastroRow | undefined => {
      const clean = normOs(os);
      if (map.has(clean)) return map.get(clean);
      // Fallback para casamento parcial de OS (ex: 16797-25 casando com 16797)
      const baseNum = os.replace(/[^\d]/g, "");
      if (baseNum.length >= 4) {
        for (const [k, v] of map.entries()) {
          const kDigits = k.replace(/[^\d]/g, "");
          if (kDigits === baseNum || (kDigits.length >= 4 && (kDigits.startsWith(baseNum) || baseNum.startsWith(kDigits)))) {
            return v;
          }
        }
      }
      return undefined;
    },
  };
}