/**
 * Cálculos de Densidade Relativa Aparente e Massa Específica Aparente de
 * corpos de prova compactados de misturas asfálticas — DNIT 428/2022-ME.
 *
 * γ_água a (25 ± 1) °C = 0,9971 g/cm³ — usada nas Eq.7/9/11 da norma.
 */
const DENSIDADE_AGUA_25C = 0.9971;

/** Reconhece a tag/descrição do QR ou do cadastro de Tipos de Ensaio como ASF.DAP. */
export function isAsfDapTag(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const t = raw.toLowerCase().trim();
  if (t.replace(/\s+/g, "") === "asf.dap" || t.replace(/\s+/g, "") === "asfdap") return true;
  return t.includes("densidade aparente") && t.includes("mistura");
}

/** § 6.1.4, Eq.1 — % de água absorvida (caso denso, A/B/C). */
export function pctAguaAbsorvida(A: number, B: number, C: number): number | null {
  const den = C - B;
  if (!(den > 0)) return null;
  const w = (100 * (C - A)) / den;
  return Number.isFinite(w) ? w : null;
}

/** § 7.1, Eq.6 — Gmb do caso padrão (vazios < 10%, absorção ≤ 2%). */
export function gmbDensa(A: number, B: number, C: number): number | null {
  const den = C - B;
  if (!(den > 0)) return null;
  const g = A / den;
  return Number.isFinite(g) && g > 0 ? g : null;
}

/** Eq.7/9/11 — converte Gmb (adimensional) em massa específica aparente (g/cm³). */
export function meaFromGmb(gmb: number): number {
  return DENSIDADE_AGUA_25C * gmb;
}

/** § 6.2.4, Eq.2 — densidade do cilindro de calibração. */
export function dCil(m1: number, m2: number): number | null {
  const den = m1 - m2;
  if (!(den > 0)) return null;
  const d = m1 / den;
  return Number.isFinite(d) && d > 0 ? d : null;
}

/** § 6.2.4, Eq.3 — densidade do filme PVC, a partir da calibração do cilindro. */
export function dPvc(m1: number, m2: number, m3: number, m4: number): number | null {
  const dcil = dCil(m1, m2);
  if (dcil == null) return null;
  const den = m3 - m4 - m1 / dcil;
  if (!(den > 0)) return null;
  const d = (m3 - m1) / den;
  return Number.isFinite(d) && d > 0 ? d : null;
}

/** § 7.2, Eq.8 — Gmb do caso revestido com filme PVC (absorção > 2%). */
export function gmbComFilme(D: number, E: number, F: number, Dpa: number): number | null {
  if (!(Dpa > 0)) return null;
  const den = E - F - (E - D) / Dpa;
  if (!(den > 0)) return null;
  const g = D / den;
  return Number.isFinite(g) && g > 0 ? g : null;
}

/** § 6.3.2, Eq.5 — volume do CP a partir de leituras médias de altura e diâmetro (cm → cm³). */
export function volumeCaliper(alturas: (number | null)[], diametros: (number | null)[]): number | null {
  const H = mediaValida(alturas);
  const D = mediaValida(diametros);
  if (H == null || D == null) return null;
  const v = H * Math.PI * (D / 2) ** 2;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** § 7.3, Eq.10 — massa específica aparente do caso "vazios ≥ 10%" (mistura aberta). */
export function meaAberta(A: number, V: number): number | null {
  if (!(V > 0)) return null;
  const mea = A / V;
  return Number.isFinite(mea) && mea > 0 ? mea : null;
}

/** § 7.3, Eq.11 — Gmb derivado de MEa (caso "vazios ≥ 10%"). */
export function gmbFromMea(mea: number): number {
  return mea / DENSIDADE_AGUA_25C;
}

/** § 7.4, Eq.12 — % de vazios, cruzamento opcional com Gmm (digitado manualmente). */
export function vvPct(gmb: number, gmm: number): number | null {
  if (!(gmm > 0)) return null;
  const vv = (1 - gmb / gmm) * 100;
  return Number.isFinite(vv) ? vv : null;
}

function mediaValida(vals: (number | null)[]): number | null {
  const valid = vals.filter((v): v is number => v != null && Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
