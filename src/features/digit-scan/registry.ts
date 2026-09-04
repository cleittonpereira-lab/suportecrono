/**
 * Registro genérico dos tipos de ensaio com digitalização de campo por QR.
 *
 * M.ESP.A e Adensamento continuam com sua lógica própria e testada em
 * `mesp-natural/ui.tsx` e `adens-scan/ui.tsx` — não foram reescritos aqui
 * (risco desnecessário para código que já funciona). Este registro serve
 * como o PONTO DE EXTENSÃO: o scanner compartilhado (`ScannerCard`, em
 * `mesp-natural/ui.tsx`) consulta esta lista depois de checar M.ESP.A e
 * Adensamento — cada novo tipo de ensaio digitalizado só precisa de uma
 * entrada aqui (identificação por código do Tipo de Ensaio) + sua própria
 * tela de campo (mesmo padrão de `adens-scan/ui.tsx`), sem tocar no
 * scanner ou na lógica dos ensaios já existentes.
 */
import { isAsfDapTag } from "@/features/asf-dap/calc";
import { dispatchAsfDap } from "@/features/asf-dap/ui";
import { isPermVTag } from "@/features/perm-v/calc";
import { dispatchPermV } from "@/features/perm-v/ui";
import { isCompressaoSimplesTag } from "@/features/compressao-simples/calc";
import { dispatchCompressaoSimples } from "@/features/compressao-simples/ui";

export type DigitScanPlugin = {
  /** Chave estável — normalmente o `codigo` cadastrado em Tipos de Ensaio. */
  key: string;
  /** Rótulo amigável, usado em mensagens de erro/confirmação. */
  label: string;
  /** Casa o código ou nome do tipo de ensaio (da planilha ou da tag do QR). */
  match: (codigoOuNome: string) => boolean;
  /** Rota da tela de campo (padrão `AdensPendenciaEditor`: recebe `?pid=`). */
  route: string;
  /**
   * Cria/reaproveita a pendência de digitação e devolve pra onde navegar —
   * chamado pelo scanner assim que o `match` acerta. Deve ser uma função
   * standalone (sem hooks), já que roda fora de um componente React.
   */
  dispatch: (payload: Record<string, unknown>) => Promise<{ to: string; search?: Record<string, unknown> }>;
};

export const DIGIT_SCAN_REGISTRY: DigitScanPlugin[] = [
  {
    key: "ASF.DAP",
    label: "Densidade Aparente do CP (ASF.DAP)",
    match: isAsfDapTag,
    route: "/relatorio/digitalizacao/asf-dap",
    dispatch: dispatchAsfDap,
  },
  {
    key: "PERM.V",
    label: "Permeabilidade a Carga Variável (PERM.V)",
    match: isPermVTag,
    route: "/relatorio/digitalizacao/perm-v",
    dispatch: dispatchPermV,
  },
  {
    key: "COMP",
    label: "Compressão Simples (COMP.A / COMP.R / COMP.S)",
    match: isCompressaoSimplesTag,
    route: "/relatorio/digitalizacao/compressao-simples",
    dispatch: dispatchCompressaoSimples,
  },
];

/** Encontra o plugin registrado para um código/nome de tipo de ensaio, se houver. */
export function findDigitScanPlugin(codigoOuNome: string | null | undefined): DigitScanPlugin | null {
  if (!codigoOuNome) return null;
  return DIGIT_SCAN_REGISTRY.find((p) => p.match(codigoOuNome)) ?? null;
}
