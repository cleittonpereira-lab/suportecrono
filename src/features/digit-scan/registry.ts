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

export type DigitScanPlugin = {
  /** Chave estável — normalmente o `codigo` cadastrado em Tipos de Ensaio. */
  key: string;
  /** Rótulo amigável, usado em mensagens de erro/confirmação. */
  label: string;
  /** Casa o código ou nome do tipo de ensaio (da planilha ou da tag do QR). */
  match: (codigoOuNome: string) => boolean;
  /** Rota da tela de campo (padrão `AdensPendenciaEditor`: recebe `?pid=`). */
  route: string;
};

function normTipo(s: string): string {
  return (s || "").trim().toLowerCase();
}

export const DIGIT_SCAN_REGISTRY: DigitScanPlugin[] = [
  // Exemplo de como uma próxima entrada fica, ao implementar a tela de
  // campo do tipo (mesma estrutura de adens-scan/ui.tsx):
  //
  // {
  //   key: "TRI.UU",
  //   label: "Triaxial UU",
  //   match: (v) => /triaxial\s*uu|^tri\.?\s*uu\b/i.test(normTipo(v)),
  //   route: "/relatorio/digitalizacao/triaxial-uu",
  // },
];

/** Encontra o plugin registrado para um código/nome de tipo de ensaio, se houver. */
export function findDigitScanPlugin(codigoOuNome: string | null | undefined): DigitScanPlugin | null {
  if (!codigoOuNome) return null;
  return DIGIT_SCAN_REGISTRY.find((p) => p.match(codigoOuNome)) ?? null;
}
