import type { CdAmostraTipo, CdCapsula, CdCargaUnidade, CdCorpoDeProva } from "./types";

const KGF_PER_N = 1 / 9.80665;

/** Teor de umidade de uma cápsula (%) — mesma fórmula usada em Compressão Simples/Triaxial/PERM.V. */
export function capsulaUmidadePct(c: CdCapsula): number | null {
  const ms = c.dry - c.tara;
  const mw = c.wet - c.dry;
  if (!(ms > 0)) return null;
  const w = (mw / ms) * 100;
  return Number.isFinite(w) ? w : null;
}

/** Teor de umidade médio (%) — média das cápsulas válidas. */
export function teorUmidadeMedio(capsulas: CdCapsula[]): number | null {
  const valid = capsulas.map(capsulaUmidadePct).filter((v): v is number => v != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * Reconhece e decompõe a etiqueta/QR de Compressão Diametral usada em
 * campo: ASF.CD = misturas asfálticas (DNER-ME 138/94), COMP.D[.dias] =
 * solo-cimento (DNIT 136/2010-ME; ex. "COMP.D.7" = rompido aos 7 dias).
 */
export function parseCompressaoDiametralTag(
  raw: string | null | undefined,
): { amostraTipo: CdAmostraTipo; idadeCuraDias: number | null } | null {
  if (!raw) return null;
  const t = raw.toUpperCase().trim().replace(/\s+/g, "");
  if (t === "ASF.CD" || t.startsWith("ASF.CD.")) return { amostraTipo: "asfalto", idadeCuraDias: null };
  const dosagem = t.match(/^COMP\.D(?:\.(\d+))?$/);
  if (dosagem) {
    const dias = dosagem[1] ? Number(dosagem[1]) : null;
    return { amostraTipo: "dosagem", idadeCuraDias: Number.isFinite(dias as number) ? dias : null };
  }
  return null;
}

export function isCompressaoDiametralTag(raw: string | null | undefined): boolean {
  return parseCompressaoDiametralTag(raw) != null;
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
export function cargaParaN(valor: number | null, unidade: CdCargaUnidade): number | null {
  if (valor == null || !Number.isFinite(valor)) return null;
  if (unidade === "N") return valor;
  if (unidade === "kN") return valor * 1000;
  return valor / KGF_PER_N; // kgf -> N
}

export function nParaKgf(n: number): number {
  return n * KGF_PER_N;
}

/**
 * Tensão de tração por compressão diametral (kPa) — RT = 2P/(πDH), a
 * fórmula do "ensaio brasileiro" (DNER-ME 138/94 · DNIT 136/2010-ME).
 * P em N, D e H em cm; 1 N/cm² = 10 kPa.
 */
export function tensaoTracaoKPa(
  cargaN: number | null,
  diametroCm: number | null,
  alturaCm: number | null,
): number | null {
  if (cargaN == null || diametroCm == null || alturaCm == null || !(diametroCm > 0) || !(alturaCm > 0)) return null;
  const v = ((2 * cargaN) / (Math.PI * diametroCm * alturaCm)) * 10;
  return Number.isFinite(v) && v >= 0 ? v : null;
}

export function kpaParaMpa(kpa: number | null): number | null {
  if (kpa == null) return null;
  return kpa / 1000;
}

export interface CdCpResult {
  id: string;
  label: string;
  alturaMedia: number | null;
  diametroMedia: number | null;
  area: number | null;
  volume: number | null;
  gamaNat: number | null;
  w: number | null;
  gamaD: number | null;
  ei: number | null;
  n: number | null;
  sr: number | null;
  rtKPa: number | null;
  rtMPa: number | null;
}

/** Calcula dimensões, índices físicos (se dosagem) e resultado de UM corpo de prova. */
export function calcCorpoDeProva(
  cp: CdCorpoDeProva,
  opts: { comIndices: boolean; gs: number | null },
): CdCpResult {
  const alturaMedia = avg(cp.alturas);
  const diametroMedia = avg(cp.diametros);
  const area = areaCp(diametroMedia);
  const volume = volumeCp(area, alturaMedia);
  const gamaNat = massaEspecificaNatural(cp.massaInicial, volume);
  const w = opts.comIndices ? teorUmidadeMedio(cp.capsulas) : null;
  const gamaD = opts.comIndices ? massaEspecificaSeca(gamaNat, w) : null;
  const ei = opts.comIndices ? indiceDeVazios(opts.gs, gamaD) : null;
  const n = porosidade(ei);
  const sr = opts.comIndices ? grauDeSaturacao(w, opts.gs, ei) : null;

  const rtKPa = tensaoTracaoKPa(cargaParaN(cp.picoCarga, cp.picoCargaUnidade), diametroMedia, alturaMedia);
  const rtMPa = kpaParaMpa(rtKPa);

  return {
    id: cp.id, label: cp.label, alturaMedia, diametroMedia, area, volume,
    gamaNat, w, gamaD, ei, n, sr, rtKPa, rtMPa,
  };
}

/** Média entre CPs (RT, γd e w) — só faz sentido mostrar quando há mais de um CP. */
export function mediaCps(results: CdCpResult[]): { rtKPa: number | null; rtMPa: number | null; gamaD: number | null; w: number | null } {
  const rtKPa = avg(results.map((r) => r.rtKPa));
  const gamaD = avg(results.map((r) => r.gamaD));
  const w = avg(results.map((r) => r.w));
  return { rtKPa, rtMPa: kpaParaMpa(rtKPa), gamaD, w };
}
