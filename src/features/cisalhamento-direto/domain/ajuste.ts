/**
 * Ponte entre o ajuste de curvas e o cálculo do cisalhamento direto.
 *
 * O engenheiro ajusta a curva que ele lê — tensão cisalhante τ × deslocamento
 * horizontal δh. Mas o ensaio guarda leitura bruta (força de cisalhamento), e
 * é dela que `processSpecimen` deriva τ, o pico/residual e a envoltória. Se
 * gravássemos τ direto, passaríamos a ter duas fontes de verdade.
 *
 * Então convertemos de volta: dado o τ desejado numa linha, qual força a
 * produziria? Dentro de uma linha, τ é LINEAR na força — a área corrigida
 * depende só de δh (a caixa de cisalhamento perde área de contato conforme
 * desloca, ASTM D3080), que a linha já traz. Logo τ = α·F + β, e
 * F = (τ − β)/α. Ao contrário do triaxial, a área aqui NÃO depende do
 * deslocamento vertical — então ajustar δv não desatualiza um ajuste de τ já
 * feito (nem o contrário): as duas curvas desta ficha são independentes.
 *
 * α e β não são recopiados da fórmula: são MEDIDOS chamando o próprio
 * `processSpecimen` com duas forças de sondagem. Assim a inversa não pode
 * divergir do cálculo do laudo se a norma mudar — se `processSpecimen`
 * mudar, ela acompanha.
 */
import type { Ponto, VariavelAjustavel } from "@/lib/ajuste-curvas";
import type { CDReading, CDSample, CDSpecimen } from "../types";
import { processSpecimen } from "./calc";

/** kgf → N (mesma constante de `processSpecimen`). */
const G = 9.80665;

/** Forças de sondagem [N] — altas o suficiente pro limitador `max(0, τ)` ficar inativo. */
const SONDA_A = 1e4;
const SONDA_B = 2e4;

export type CoefDaLinha = { alfa: number; beta: number };

/** τ = α·F + β por linha de cisalhamento, medido em `processSpecimen`. */
export function coeficientesDaTensaoCisalhante(cp: CDSpecimen, sample: CDSample): CoefDaLinha[] {
  const comForca = (F: number) =>
    processSpecimen(
      { ...cp, shearData: cp.shearData.map((r) => ({ ...r, shearForce: F, loadKgf: undefined })) },
      sample,
    ).curve;
  const a = comForca(SONDA_A);
  const b = comForca(SONDA_B);
  return cp.shearData.map((_, i) => {
    const alfa = (b[i].shearStress - a[i].shearStress) / (SONDA_B - SONDA_A);
    return { alfa, beta: a[i].shearStress - alfa * SONDA_A };
  });
}

/** Força de cisalhamento bruta [N] que produz a tensão cisalhante desejada. */
export function forcaDeTau(coef: CoefDaLinha | undefined, tau: number): number {
  if (!coef || !Number.isFinite(coef.alfa) || Math.abs(coef.alfa) < 1e-12) return 0;
  const f = (tau - coef.beta) / coef.alfa;
  return Number.isFinite(f) ? Math.max(0, f) : 0;
}

/**
 * Adaptador de uma variável ajustável do cisalhamento direto: como lê-la,
 * como gravar o ajuste nas leituras e como desfazer. Mesmo contrato do
 * triaxial (ver `features/triaxial-cid/domain/ajuste.ts`).
 */
export type AdaptadorDeCurvaCD = {
  variavel: VariavelAjustavel;
  serie: (cp: CDSpecimen, sample: CDSample) => Ponto[];
  originais: (cp: CDSpecimen) => number[];
  aplicar: (cp: CDSpecimen, sample: CDSample, yAjustado: number[]) => CDReading[];
  restaurar: (cp: CDSpecimen, originais: number[]) => CDReading[];
};

/** A linha guarda a carga em kgf ou a força em N — respeitamos o que já existe. */
const usaKgf = (r: CDReading) => r.loadKgf != null && Number.isFinite(r.loadKgf);

export const ADAPTADOR_TENSAO_CISALHANTE: AdaptadorDeCurvaCD = {
  variavel: "tensao-cisalhante",

  serie: (cp, sample) =>
    processSpecimen(cp, sample).curve.map((p) => ({ x: p.horizDispMm, y: p.shearStress })),

  originais: (cp) => cp.shearData.map((r) => (usaKgf(r) ? r.loadKgf! : r.shearForce)),

  aplicar: (cp, sample, yAjustado) => {
    const coefs = coeficientesDaTensaoCisalhante(cp, sample);
    return cp.shearData.map((r, i) => {
      const alvo = yAjustado[i];
      if (alvo == null || !Number.isFinite(alvo)) return r;
      const forca = forcaDeTau(coefs[i], alvo);
      return usaKgf(r) ? { ...r, loadKgf: forca / G } : { ...r, shearForce: forca };
    });
  },

  restaurar: (cp, originais) =>
    cp.shearData.map((r, i) => {
      const v = originais[i];
      if (v == null || !Number.isFinite(v)) return r;
      return usaKgf(r) ? { ...r, loadKgf: v } : { ...r, shearForce: v };
    }),
};

/**
 * Deslocamento vertical (δv) — lido direto de `vertDispMm`, sem inversão:
 * `processSpecimen` copia essa leitura pra curva sem transformar (não entra
 * na área corrigida, que depende só de δh). Ajustar esta curva não afeta τ.
 */
export const ADAPTADOR_DESLOCAMENTO_VERTICAL: AdaptadorDeCurvaCD = {
  variavel: "deslocamento-vertical",

  serie: (cp) => cp.shearData.map((r) => ({ x: r.horizDispMm, y: r.vertDispMm })),

  originais: (cp) => cp.shearData.map((r) => r.vertDispMm),

  aplicar: (cp, _sample, yAjustado) =>
    cp.shearData.map((r, i) => {
      const alvo = yAjustado[i];
      return alvo == null || !Number.isFinite(alvo) ? r : { ...r, vertDispMm: alvo };
    }),

  restaurar: (cp, originais) =>
    cp.shearData.map((r, i) => {
      const v = originais[i];
      return v == null || !Number.isFinite(v) ? r : { ...r, vertDispMm: v };
    }),
};

/** Adaptadores disponíveis no editor de cisalhamento direto. */
export const ADAPTADORES: Partial<Record<VariavelAjustavel, AdaptadorDeCurvaCD>> = {
  "tensao-cisalhante": ADAPTADOR_TENSAO_CISALHANTE,
  "deslocamento-vertical": ADAPTADOR_DESLOCAMENTO_VERTICAL,
};
