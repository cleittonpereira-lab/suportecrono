/**
 * Cálculos para Massa Específica Aparente Natural — ABNT NBR 16867:2020
 * Método da balança hidrostática (corpo-de-prova parafinado).
 *
 * Constantes:
 *   ρ_parafina = 0,78 g/cm³
 *   ρ_água    = 1,00 g/cm³
 */

export const RHO_PARAFINA = 0.78;
export const RHO_AGUA = 1.0;

export interface DeterminacaoInput {
  id: string;
  capsula: string;
  massaCapsula: number | null;         // Mc [g]
  massaCapsulaSoloUmido: number | null; // Mcsu [g]
  massaCapsulaSoloSeco: number | null;  // Mcss [g]
  massaCp: number | null;               // Mcp [g] (corpo-de-prova sem parafina)
  massaCpParafina: number | null;       // Mcp+par [g]
  massaCpParafinaSubmerso: number | null; // submerso [g]
}

export interface DeterminacaoResult {
  umidade: number | null;         // w [%]
  volumeParafina: number | null;  // [cm³]
  volumeTotal: number | null;     // volume do CP parafinado [cm³]
  volumeCp: number | null;        // volume do CP [cm³]
  gammaNat: number | null;        // ρ natural úmida [g/cm³]
  gammaSec: number | null;        // ρ seca [g/cm³]
  massaParafina: number | null;   // [g]
}

function safeDiv(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return a / b;
}

export function calcDeterminacao(d: DeterminacaoInput): DeterminacaoResult {
  const { massaCapsula: mc, massaCapsulaSoloUmido: mcsu, massaCapsulaSoloSeco: mcss } = d;
  const { massaCp, massaCpParafina, massaCpParafinaSubmerso: msub } = d;

  // Umidade: w = (Mcsu - Mcss) / (Mcss - Mc) * 100
  let umidade: number | null = null;
  if (mc != null && mcsu != null && mcss != null) {
    const num = mcsu - mcss;
    const den = mcss - mc;
    const w = safeDiv(num, den);
    umidade = w == null ? null : w * 100;
  }

  // Massa da parafina
  let massaParafina: number | null = null;
  if (massaCp != null && massaCpParafina != null) {
    massaParafina = massaCpParafina - massaCp;
  }

  // Volume da parafina = Mparafina / ρ_par
  const volumeParafina = massaParafina != null ? massaParafina / RHO_PARAFINA : null;

  // Volume total do CP parafinado (empuxo): V = (Mcp+par - Msub) / ρ_agua
  let volumeTotal: number | null = null;
  if (massaCpParafina != null && msub != null) {
    volumeTotal = (massaCpParafina - msub) / RHO_AGUA;
  }

  // Volume do CP (sem parafina)
  let volumeCp: number | null = null;
  if (volumeTotal != null && volumeParafina != null) {
    volumeCp = volumeTotal - volumeParafina;
  }

  // ρ natural (úmida): Mcp / Vcp
  let gammaNat: number | null = null;
  if (massaCp != null && volumeCp != null && volumeCp > 0) {
    gammaNat = massaCp / volumeCp;
  }

  // ρ seca: ρnat / (1 + w/100)
  let gammaSec: number | null = null;
  if (gammaNat != null && umidade != null) {
    gammaSec = gammaNat / (1 + umidade / 100);
  }

  return { umidade, volumeParafina, volumeTotal, volumeCp, gammaNat, gammaSec, massaParafina };
}

export function mediaValidas(vals: (number | null)[]): number | null {
  const ok = vals.filter((v): v is number => v != null && Number.isFinite(v));
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => a + b, 0) / ok.length;
}

/** true se o tag/nome do ensaio corresponde a Massa Específica Aparente Natural. */
export function isMespANaturalTag(raw: string | null | undefined): boolean {
  const t = (raw ?? "").toLowerCase().replace(/\s+/g, "");
  if (!t) return false;
  return (
    t.includes("m.esp.a") ||
    t.includes("mespa") ||
    t.includes("massaespecificaaparente") ||
    t.includes("massaespaparente") ||
    t.includes("massaespecíficaaparente") ||
    (t.includes("massaesp") && t.includes("natural")) ||
    t.includes("balancahidrostatica") ||
    t.includes("balançahidrostática")
  );
}

/** true se o ensaio for Triaxial CID (adensado isotropicamente drenado). */
export function isTriaxialCidTag(raw: string | null | undefined): boolean {
  const t = (raw ?? "").toLowerCase().replace(/\s+/g, "");
  if (!t) return false;
  return (
    t.includes("tri.cid") ||
    t.includes("tricid") ||
    (t.includes("triaxial") && t.includes("cid")) ||
    (t.includes("triaxial") && t.includes("adensado") && t.includes("drenado"))
  );
}

/** true se o ensaio for Adensamento (edométrico). */
export function isAdensamentoTag(raw: string | null | undefined): boolean {
  const t = (raw ?? "").toLowerCase().replace(/\s+/g, "");
  if (!t) return false;
  return (
    t.includes("adensamento") ||
    t.includes("adens.") ||
    t.includes("edometric") ||
    t.includes("edométric") ||
    t.includes("oedometric") ||
    t.startsWith("aden") ||
    t === "ad" || t === "adns"
  );
}

/** true se o ensaio for Cisalhamento Direto. */
export function isCisalhamentoDiretoTag(raw: string | null | undefined): boolean {
  const t = (raw ?? "").toLowerCase().replace(/\s+/g, "");
  if (!t) return false;
  return (
    t.includes("cisalhamento") ||
    t.includes("cisalh.") ||
    t.includes("directshear") ||
    t.includes("cdinun") ||
    t.includes("cdnat") ||
    t === "cd" ||
    t === "cdin"
  );
}

/** true se o ensaio for Densidade Aparente de misturas asfálticas (ASF.DAP). */
export function isAsfDapEnsaioTag(raw: string | null | undefined): boolean {
  const t = (raw ?? "").toLowerCase().replace(/\s+/g, "");
  if (!t) return false;
  return (
    t.includes("asf.dap") ||
    t.includes("asf-dap") ||
    t.includes("asfdap") ||
    t.includes("densidadeaparente")
  );
}

/** Metodologias com processamento/relatório disponíveis hoje. */
export type SupportedMethodology = "mesp-a" | "triaxial-cid" | "adensamento" | "cisalhamento-direto" | "asf-dap";

export function detectMethodology(
  ensaio: string | null | undefined,
  tipoEnsaio?: string | null,
): SupportedMethodology | null {
  const candidates = [ensaio, tipoEnsaio];
  if (candidates.some((c) => isCisalhamentoDiretoTag(c))) return "cisalhamento-direto";
  if (candidates.some((c) => isMespANaturalTag(c))) return "mesp-a";
  if (candidates.some((c) => isTriaxialCidTag(c))) return "triaxial-cid";
  if (candidates.some((c) => isAdensamentoTag(c))) return "adensamento";
  if (candidates.some((c) => isAsfDapEnsaioTag(c))) return "asf-dap";
  return null;
}

export function methodologyRoute(m: SupportedMethodology): string {
  switch (m) {
    case "cisalhamento-direto": return "/relatorio/cisalhamento-direto";
    case "mesp-a": return "/relatorio/mesp-a";
    case "triaxial-cid": return "/relatorio/triaxial-cid";
    case "adensamento": return "/relatorio/adensamento";
    case "asf-dap": return "/relatorio/asf-dap";
  }
}