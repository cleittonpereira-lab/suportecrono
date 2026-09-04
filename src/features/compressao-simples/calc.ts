import type { CsAmostraTipo, CsCapsula, CsCargaUnidade, CsCurvaPonto } from "./types";

const KGF_PER_N = 1 / 9.80665;

/** Teor de umidade de uma cápsula (%) — mesma fórmula usada em Triaxial/PERM.V. */
export function capsulaUmidadePct(c: CsCapsula): number | null {
  const ms = c.dry - c.tara;
  const mw = c.wet - c.dry;
  if (!(ms > 0)) return null;
  const w = (mw / ms) * 100;
  return Number.isFinite(w) ? w : null;
}

/** Teor de umidade médio (%) — média das cápsulas válidas. */
export function teorUmidadeMedio(capsulas: CsCapsula[]): number | null {
  const valid = capsulas.map(capsulaUmidadePct).filter((v): v is number => v != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * Reconhece e decompõe a etiqueta/QR de Compressão Simples usada em campo:
 * COMP.A = solo (compressão axial), COMP.R = rocha, COMP.S[.dias] = dosagem
 * (ex.: "COMP.S.7" = solo-cimento rompido aos 7 dias). Não usa um prefixo
 * "COMP" genérico de propósito — colidiria com etiquetas de Compactação
 * (ex. "COMP.EN.5"), um ensaio diferente, ainda não implementado no app.
 */
export function parseCompressaoSimplesTag(
  raw: string | null | undefined,
): { amostraTipo: CsAmostraTipo; idadeCuraDias: number | null } | null {
  if (!raw) return null;
  const t = raw.toUpperCase().trim().replace(/\s+/g, "");
  if (t === "COMP.A" || t.startsWith("COMP.A.")) return { amostraTipo: "solo", idadeCuraDias: null };
  if (t === "COMP.R" || t.startsWith("COMP.R.")) return { amostraTipo: "rocha", idadeCuraDias: null };
  const dosagem = t.match(/^COMP\.S(?:\.(\d+))?$/);
  if (dosagem) {
    const dias = dosagem[1] ? Number(dosagem[1]) : null;
    return { amostraTipo: "dosagem", idadeCuraDias: Number.isFinite(dias as number) ? dias : null };
  }
  return null;
}

export function isCompressaoSimplesTag(raw: string | null | undefined): boolean {
  return parseCompressaoSimplesTag(raw) != null;
}

/** Média de um array de leituras (mm/cm), ignorando valores não numéricos/≤0. */
export function avg(vals: (number | null | undefined)[]): number | null {
  const valid = vals.filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** Área da seção do CP (cm²) a partir do diâmetro médio (cm). */
export function areaCp(diametroMedioCm: number | null): number | null {
  if (diametroMedioCm == null || !(diametroMedioCm > 0)) return null;
  return (Math.PI / 4) * diametroMedioCm ** 2;
}

/** Volume do CP (cm³). */
export function volumeCp(areaCm2: number | null, alturaMedioCm: number | null): number | null {
  if (areaCm2 == null || alturaMedioCm == null || !(alturaMedioCm > 0)) return null;
  return areaCm2 * alturaMedioCm;
}

/** Massa específica aparente natural (g/cm³). */
export function massaEspecificaNatural(massaInicialG: number | null, volumeCm3: number | null): number | null {
  if (massaInicialG == null || volumeCm3 == null || !(volumeCm3 > 0)) return null;
  const v = massaInicialG / volumeCm3;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Massa específica aparente seca (g/cm³), a partir da natural e do teor de umidade (%). */
export function massaEspecificaSeca(gamaNat: number | null, wPct: number | null): number | null {
  if (gamaNat == null || wPct == null) return null;
  const v = gamaNat / (1 + wPct / 100);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Índice de vazios — exige Gs (massa específica dos grãos, g/cm³). */
export function indiceDeVazios(gs: number | null, gamaD: number | null): number | null {
  if (gs == null || gamaD == null || !(gamaD > 0)) return null;
  const e = gs / gamaD - 1;
  return Number.isFinite(e) && e >= 0 ? e : null;
}

export function porosidade(e: number | null): number | null {
  if (e == null) return null;
  const n = e / (1 + e);
  return Number.isFinite(n) ? n * 100 : null; // %
}

/** Grau de saturação (%) — exige Gs. */
export function grauDeSaturacao(wPct: number | null, gs: number | null, e: number | null): number | null {
  if (wPct == null || gs == null || e == null || !(e > 0)) return null;
  const sr = (wPct * gs) / (e * 100);
  return Number.isFinite(sr) ? sr * 100 : null; // %
}

/** Converte uma carga pra Newtons, a partir da unidade escolhida no formulário. */
export function cargaParaN(valor: number | null, unidade: CsCargaUnidade): number | null {
  if (valor == null || !Number.isFinite(valor)) return null;
  if (unidade === "N") return valor;
  if (unidade === "kN") return valor * 1000;
  return valor / KGF_PER_N; // kgf -> N
}

export function nParaKgf(n: number): number {
  return n * KGF_PER_N;
}

/** Tensão de ruptura (kPa) a partir da carga (N) e área (cm²). 1 N/cm² = 10 kPa. */
export function tensaoKPa(cargaN: number | null, areaCm2: number | null): number | null {
  if (cargaN == null || areaCm2 == null || !(areaCm2 > 0)) return null;
  const v = (cargaN / areaCm2) * 10;
  return Number.isFinite(v) && v >= 0 ? v : null;
}

export function kpaParaMpa(kpa: number | null): number | null {
  if (kpa == null) return null;
  return kpa / 1000;
}

/** Curva tensão (kPa) x deformação axial (%) a partir dos pontos brutos (carga N, deformação mm). */
export function curvaTensaoDeformacao(
  curva: CsCurvaPonto[],
  areaCm2: number | null,
  alturaMedioCm: number | null,
): { deformacaoPct: number; tensaoKPa: number }[] {
  if (areaCm2 == null || alturaMedioCm == null || !(alturaMedioCm > 0)) return [];
  const alturaMm = alturaMedioCm * 10;
  return curva
    .map((p) => ({
      deformacaoPct: (p.deformacaoMm / alturaMm) * 100,
      tensaoKPa: tensaoKPa(p.cargaN, areaCm2) ?? 0,
    }))
    .sort((a, b) => a.deformacaoPct - b.deformacaoPct);
}

/** Ponto de pico (tensão máxima) da curva tensão x deformação — é o qu do ensaio. */
export function picoDaCurva(
  pontos: { deformacaoPct: number; tensaoKPa: number }[],
): { deformacaoPct: number; tensaoKPa: number } | null {
  if (!pontos.length) return null;
  return pontos.reduce((max, p) => (p.tensaoKPa > max.tensaoKPa ? p : max), pontos[0]);
}
