/**
 * Ponte entre o ajuste de curvas e o cálculo do triaxial.
 *
 * O engenheiro ajusta a curva que ele lê — tensão desviadora σd × εa. Mas o
 * ensaio guarda leitura bruta (força na célula de carga), e é dela que
 * `processShear` deriva σd, a ruptura, a envoltória e os círculos de Mohr. Se
 * gravássemos σd direto, passaríamos a ter duas fontes de verdade.
 *
 * Então convertemos de volta: dada a σd desejada numa linha, qual força a
 * produziria? Dentro de uma linha, σd é LINEAR na força — a área corrigida, o
 * peso do pistão e as correções de membrana e papel filtro dependem só de εa,
 * εv e u, que a linha já traz. Logo σd = α·F + β, e F = (σd − β)/α.
 *
 * α e β não são recopiados da fórmula: são MEDIDOS chamando o próprio
 * `processShear` com duas forças de sondagem. Assim a inversa não pode divergir
 * do cálculo do laudo se a norma mudar — se `processShear` mudar, ela acompanha.
 */
import type { Ponto, VariavelAjustavel } from "@/lib/ajuste-curvas";
import type { ShearReading, TriaxialSample, TriaxialSpecimen } from "../types";
import { processGeometry, processShear } from "./calc";

/** kgf → N (mesma constante de `processShear`). */
const G = 9.80665;

/**
 * Forças de sondagem [N]. Altas o suficiente para os limitadores de
 * `processShear` — max(0, F − atrito) e max(0, σd) — ficarem inativos, que é
 * o que garante a linearidade usada aqui.
 */
const SONDA_A = 1e4;
const SONDA_B = 2e4;

export type CoefDaLinha = { alfa: number; beta: number };

/** σd = α·F + β por linha de cisalhamento, medido em `processShear`. */
export function coeficientesDaTensao(cp: TriaxialSpecimen, sample: TriaxialSample): CoefDaLinha[] {
  const geom = processGeometry(cp, sample);
  const comForca = (F: number) =>
    processShear(
      { ...cp, shear: cp.shear.map((r) => ({ ...r, F, loadKgf: undefined })) },
      geom,
      sample,
    );
  const a = comForca(SONDA_A);
  const b = comForca(SONDA_B);
  return cp.shear.map((_, i) => {
    const alfa = (b[i].sigmaD - a[i].sigmaD) / (SONDA_B - SONDA_A);
    return { alfa, beta: a[i].sigmaD - alfa * SONDA_A };
  });
}

/** Força axial bruta [N] que produz a tensão desviadora desejada. */
export function forcaDeSigmaD(coef: CoefDaLinha | undefined, sigmaD: number): number {
  if (!coef || !Number.isFinite(coef.alfa) || Math.abs(coef.alfa) < 1e-12) return 0;
  const f = (sigmaD - coef.beta) / coef.alfa;
  return Number.isFinite(f) ? Math.max(0, f) : 0;
}

/**
 * Adaptador de uma variável ajustável do triaxial: como lê-la, como gravar o
 * ajuste nas leituras e como desfazer.
 *
 * `originais` devolve os valores do campo que será de fato substituído (não a
 * grandeza exibida): restaurar volta ao número medido, sem passar pela inversa
 * e sem acumular erro de arredondamento.
 */
export type AdaptadorDeCurva = {
  variavel: VariavelAjustavel;
  /** Série que o engenheiro vê e ajusta. */
  serie: (cp: TriaxialSpecimen, sample: TriaxialSample) => Ponto[];
  /** Valores brutos que o ajuste vai substituir. */
  originais: (cp: TriaxialSpecimen) => number[];
  /** Grava a curva ajustada, devolvendo as leituras novas. */
  aplicar: (cp: TriaxialSpecimen, sample: TriaxialSample, yAjustado: number[]) => ShearReading[];
  /** Devolve as leituras ao estado medido. */
  restaurar: (cp: TriaxialSpecimen, originais: number[]) => ShearReading[];
};

/** A linha guarda a carga em kgf ou a força em N — respeitamos o que já existe. */
const usaKgf = (r: ShearReading) => r.loadKgf != null && Number.isFinite(r.loadKgf);

export const ADAPTADOR_TENSAO: AdaptadorDeCurva = {
  variavel: "tensao-desviadora",

  serie: (cp, sample) => {
    const curva = processShear(cp, processGeometry(cp, sample), sample);
    return curva.map((p) => ({ x: p.eaPct, y: p.sigmaD }));
  },

  originais: (cp) => cp.shear.map((r) => (usaKgf(r) ? r.loadKgf! : r.F)),

  aplicar: (cp, sample, yAjustado) => {
    const coefs = coeficientesDaTensao(cp, sample);
    return cp.shear.map((r, i) => {
      const alvo = yAjustado[i];
      if (alvo == null || !Number.isFinite(alvo)) return r;
      const forca = forcaDeSigmaD(coefs[i], alvo);
      return usaKgf(r) ? { ...r, loadKgf: forca / G } : { ...r, F: forca };
    });
  },

  restaurar: (cp, originais) =>
    cp.shear.map((r, i) => {
      const v = originais[i];
      if (v == null || !Number.isFinite(v)) return r;
      return usaKgf(r) ? { ...r, loadKgf: v } : { ...r, F: v };
    }),
};

/** Adaptadores disponíveis no editor triaxial. */
export const ADAPTADORES: Partial<Record<VariavelAjustavel, AdaptadorDeCurva>> = {
  "tensao-desviadora": ADAPTADOR_TENSAO,
};
