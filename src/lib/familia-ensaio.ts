/**
 * Família do ensaio para o filtro por tipo da Central de Relatórios.
 *
 * Os textos variam por origem — tipo do laudo ("triaxial-ciu"), sigla da
 * programação ("TRI.UU", "CD3.IN"), nome ("Adensamento Oedométrico") — e o
 * mesmo filtro precisa valer em todas as abas. Agrupa as variantes (CID, CIU,
 * UU) numa família só, como o laboratório pensa.
 */
import { normMethod } from "./pendencia-match";

export const FAMILIAS = [
  { id: "cisalhamento-direto", rotulo: "Cisalhamento" },
  { id: "adensamento", rotulo: "Adensamento" },
  { id: "triaxial", rotulo: "Triaxial" },
  { id: "mesp-a", rotulo: "M.ESP.A" },
  { id: "asf-dap", rotulo: "ASF.DAP" },
  { id: "asf-tb", rotulo: "ASF.TB" },
  { id: "perm-v", rotulo: "PERM.V" },
  { id: "compressao-simples", rotulo: "Compressão simples" },
  { id: "compressao-diametral", rotulo: "Compressão diametral" },
  { id: "modulo-resiliencia", rotulo: "Módulo de resiliência" },
  { id: "umidade-natural", rotulo: "Umidade natural" },
  { id: "load-test", rotulo: "Point Load" },
] as const;

export type Familia = (typeof FAMILIAS)[number]["id"] | "outros";

const IDS = new Set<string>(FAMILIAS.map((f) => f.id));

/** A primeira pista que identificar a família vale (tipo, sigla, nome...). */
export function familiaDoEnsaio(...pistas: (string | null | undefined)[]): Familia {
  for (const p of pistas) {
    if (!p) continue;
    const s = p.toLowerCase().trim();
    if (s.startsWith("tri") || s.includes("triaxial")) return "triaxial";
    const m = normMethod(p);
    if (m === "triaxial-cid") return "triaxial";
    if (IDS.has(m)) return m as Familia;
  }
  return "outros";
}

export function rotuloDaFamilia(f: Familia): string {
  return FAMILIAS.find((x) => x.id === f)?.rotulo ?? "Outros";
}
