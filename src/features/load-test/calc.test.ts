import { describe, expect, it } from "vitest";
import {
  calcularLinha, calcularMedias, diametroEquivalente, fatorF, fatorK,
  indiceIs, indiceIs50, isPLTTag, resistenciaEstimada,
} from "./calc";
import { newPLTDeterminacao, type PLTDeterminacao } from "./types";

const det = (patch: Partial<PLTDeterminacao>): PLTDeterminacao => ({ ...newPLTDeterminacao(1), ...patch });

/**
 * Valores conferidos direto na planilha real do laboratório (PLT.xlsm, aba
 * "PLT (0)", linha 1 — furo SM-T-385): G26=50.81 (altura), J26=50.79
 * (diâmetro), M26=11.28827 (carga), tipo "a ⟂". Resultado esperado na
 * própria planilha: De=50.79, Is=4.3759360133129475, F=1.0070793567274288,
 * K=23.006832, Is(50)=4.4069148253675925, Resistência=100.67642470104074.
 */
describe("bate com a planilha real (PLT (0), linha 1)", () => {
  const d = det({ tipo: "a", alturaMm: 50.81, diametroMm: 50.79, cargaKn: 11.28827 });

  it("diâmetro equivalente usa o diâmetro (D) no ensaio axial", () => {
    expect(diametroEquivalente(d)).toBeCloseTo(50.79, 9);
  });
  it("Is", () => expect(indiceIs(d)).toBeCloseTo(4.3759360133129475, 9));
  it("Fator F", () => expect(fatorF(d)).toBeCloseTo(1.0070793567274288, 9));
  it("Fator K", () => expect(fatorK(d)).toBeCloseTo(23.006832, 9));
  it("Is(50)", () => expect(indiceIs50(d)).toBeCloseTo(4.4069148253675925, 9));
  it("Resistência estimada", () => expect(resistenciaEstimada(d)).toBeCloseTo(100.67642470104074, 9));
});

describe("bate com a planilha real (PLT (0), linha 2)", () => {
  const d = det({ tipo: "a", alturaMm: 50.78, diametroMm: 50.65, cargaKn: 7.923368 });
  it("todas as colunas", () => {
    const r = calcularLinha(d);
    expect(r.de).toBeCloseTo(50.65, 9);
    expect(r.is).toBeCloseTo(3.088523625250812, 9);
    expect(r.fatorF).toBeCloseTo(1.0058292255671768, 9);
    expect(r.fatorK).toBeCloseTo(22.98152, 9);
    expect(r.is50).toBeCloseTo(3.1065273261319537, 9);
    expect(r.resistencia).toBeCloseTo(70.97896746417403, 9);
  });
});

describe("diâmetro equivalente no ensaio não-axial", () => {
  it("diametral/bloco/irregular usam a altura (w), não o diâmetro", () => {
    const d = det({ tipo: "d", alturaMm: 40, diametroMm: 999 });
    expect(diametroEquivalente(d)).toBe(40);
  });
});

describe("médias e exclusão de ruptura inválida (PLT (1), CP 1-4, o 4 é '*')", () => {
  const cps: PLTDeterminacao[] = [
    det({ numero: 1, tipo: "a", alturaMm: 50.78, diametroMm: 50.81, cargaKn: 13.23395443 }),
    det({ numero: 2, tipo: "a", alturaMm: 50.69, diametroMm: 50.69, cargaKn: 12.82192612 }),
    det({ numero: 3, tipo: "a", alturaMm: 50.44, diametroMm: 50.51, cargaKn: 13.30916595 }),
    det({ numero: 4, tipo: "a", alturaMm: 50.56, diametroMm: 50.61, cargaKn: 6.827896118, excluidaDaMedia: true }),
  ];

  it("Is médio / Is(50) médio / Resistência média ignoram a determinação excluída", () => {
    const m = calcularMedias(cps);
    expect(m.isMedio).toBeCloseTo(5.110981892678816, 6);
    expect(m.is50Medio).toBeCloseTo(5.141633255832996, 6);
    expect(m.resistenciaMedia).toBeCloseTo(117.47557672551089, 6);
  });

  it("sem exclusão nenhuma, a 4ª entra e muda a média", () => {
    const semExclusao = cps.map((c) => ({ ...c, excluidaDaMedia: false }));
    const m = calcularMedias(semExclusao);
    expect(m.isMedio).not.toBeCloseTo(5.110981892678816, 3);
  });
});

describe("entradas incompletas não quebram o cálculo", () => {
  it("sem altura, tudo fica null (equivalente ao '-' da planilha)", () => {
    const d = det({ alturaMm: null, diametroMm: 50, cargaKn: 10 });
    expect(diametroEquivalente(d)).toBeNull();
    expect(indiceIs(d)).toBeNull();
    expect(indiceIs50(d)).toBeNull();
    expect(resistenciaEstimada(d)).toBeNull();
  });

  it("determinação vazia não entra na média (nem quebra a conta)", () => {
    const m = calcularMedias([newPLTDeterminacao(1)]);
    expect(m.isMedio).toBeNull();
    expect(m.is50Medio).toBeNull();
    expect(m.resistenciaMedia).toBeNull();
  });

  it("lista vazia de determinações", () => {
    const m = calcularMedias([]);
    expect(m).toEqual({ isMedio: null, is50Medio: null, resistenciaMedia: null });
  });
});

describe("reconhecimento da etiqueta/QR", () => {
  it("aceita variações de caixa e espaço", () => {
    expect(isPLTTag("LOAD.TEST")).toBe(true);
    expect(isPLTTag("load.test")).toBe(true);
    expect(isPLTTag(" Load.Test ")).toBe(true);
  });
  it("rejeita outras siglas", () => {
    expect(isPLTTag("COMP.A")).toBe(false);
    expect(isPLTTag(null)).toBe(false);
    expect(isPLTTag("")).toBe(false);
  });
});
