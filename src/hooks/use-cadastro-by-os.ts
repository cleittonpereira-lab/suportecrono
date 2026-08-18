import { useMemo } from "react";
import { useCadastroOs } from "@/hooks/use-cadastro-os";
import { useSchedule } from "@/hooks/use-schedule";
import { useEntregues } from "@/hooks/use-entregues";
import type { CadastroRow } from "@/lib/cadastro.functions";
import { normOs } from "@/lib/schedule-utils";
import { labStore } from "@/features/lab/store";

export function useCadastroByOs() {
  const { data: cadData, isLoading: l1 } = useCadastroOs();
  const { data: schedData, isLoading: l2 } = useSchedule();
  const { data: entreguesData, isLoading: l3 } = useEntregues();

  const map = useMemo(() => {
    const m = new Map<string, CadastroRow>();

    // 1. Cadastros de OS (prioridade máxima por conter local, sup, etc.)
    if (cadData?.rows) {
      for (const r of cadData.rows) {
        const key = normOs(r.os);
        if (!key) continue;
        if (!m.has(key)) m.set(key, r);
      }
    }

    // 2. Cronograma (fallback quando a OS não estiver na planilha do ano corrente)
    if (schedData?.rows) {
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

    // 3. OS Entregues (para puxar tomadores de OSs já entregues como Souli, etc.)
    if (entreguesData?.rows) {
      for (const e of entreguesData.rows) {
        const key = normOs(e.os);
        if (!key) continue;
        if (!m.has(key) && e.tomador) {
          m.set(key, {
            mes: "JUN" as any,
            tomador: e.tomador || "",
            os: e.os,
            sup: "",
            obra: "",
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

    // 4. labStore (caso tenha sido criada localmente)
    try {
      const state = labStore.get();
      for (const o of state.os) {
        const key = normOs(o.numero);
        if (!key) continue;
        if (!m.has(key) && (o.client || o.workNumber)) {
          m.set(key, {
            mes: "JUN" as any,
            tomador: o.client || "",
            os: o.numero,
            sup: "",
            obra: o.workNumber || "",
            local: o.local || "",
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
    } catch {}

    return m;
  }, [cadData, schedData, entreguesData]);

  return {
    isLoading: l1 || l2 || l3,
    lookup: (os: string): CadastroRow | undefined => {
      if (!os) return undefined;
      const clean = normOs(os);
      if (map.has(clean)) return map.get(clean);
      // Fallback para casamento parcial de OS (ex: 17831-26 casando com 17831)
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
