import { describe, expect, it } from "vitest";
import {
  calcularGranulometria,
  casasDoPassante,
  isAsfTbTag,
  massaBetume,
  massaInicialDoPeneiramento,
  teorBetume,
} from "./calc";
import { normalizarMedidas, normalizarPeneiras, novasPeneiras, SERIE_DNIT_412, type AsfTbPeneira } from "./types";

describe("teor de betume (DNER-ME 053/94)", () => {
  it("betume = amostra − agregado recuperado; P = betume / amostra × 100", () => {
    expect(massaBetume(1000, 945.3)).toBeCloseTo(54.7, 6);
    expect(teorBetume(1000, 945.3)).toBeCloseTo(5.47, 6);
  });

  it("sem dado ou com agregado maior que a amostra: sem resultado", () => {
    expect(teorBetume(null, 945)).toBeNull();
    expect(teorBetume(1000, null)).toBeNull();
    expect(teorBetume(1000, 1001)).toBeNull();
    expect(teorBetume(0, 0)).toBeNull();
  });
});

/** Exemplo do Anexo C da DNIT 412/2025-ME (5000 g, peneiras ASTM). */
const EXEMPLO_ANEXO_C: AsfTbPeneira[] = [
  [25, 0.0],
  [19, 20.3],
  [12.5, 925.4],
  [9.5, 704.6],
  [6.3, 579.3],
  [4.75, 740.2],
  [2.36, 429.8],
  [1.18, 335.6],
  [0.6, 255.2],
  [0.3, 194.6],
  [0.15, 375.3],
  [0.075, 224.7],
].map(([aberturaMm, retida]) => ({ aberturaMm, nome: String(aberturaMm), ativa: true, retida }));

describe("granulometria (DNIT 412/2025-ME)", () => {
  const r = calcularGranulometria({
    massaInicialGranulometria: 5000,
    massaAgregado: null,
    massaAposLavagem: null,
    peneiras: EXEMPLO_ANEXO_C,
    fundo: 215.0,
  })!;

  it("reproduz as porcentagens do Anexo C", () => {
    const passantes = r.linhas.map((l) => Number(l.pctPassante.toFixed(2)));
    expect(passantes).toEqual([100, 99.59, 81.09, 66.99, 55.41, 40.6, 32.01, 25.3, 20.19, 16.3, 8.79, 4.3]);
    expect(r.linhas[2].pctRetida).toBeCloseTo(18.508, 3);
    expect(r.fundo.pctRetida).toBeCloseTo(4.3, 6);
  });

  it("soma das massas confere com a massa inicial (§8b)", () => {
    expect(r.somaMassas).toBeCloseTo(5000, 6);
    expect(r.diferencaPct).toBeCloseTo(0, 6);
    expect(r.dentroDaTolerancia).toBe(true);
  });

  it("dimensão máxima característica e tamanho nominal máximo (§3.4, §3.8)", () => {
    // Acumulado: 1" 0 %, 3/4" 0,41 %, 1/2" 18,9 % → DMC 19 mm; 1/2" é a primeira > 10 % → TNM 19 mm.
    expect(r.dimensaoMaximaCaracteristica).toBe(19);
    expect(r.tamanhoNominalMaximo).toBe(19);
  });

  it("lavagem: base é a massa antes de lavar e o que saiu na água vai para o fundo (§8d)", () => {
    const lavado = calcularGranulometria({
      massaInicialGranulometria: 1000,
      massaAgregado: null,
      massaAposLavagem: 950,
      peneiras: [{ aberturaMm: 4.8, nome: "nº 4", ativa: true, retida: 600 }, { aberturaMm: 0.075, nome: "nº 200", ativa: true, retida: 340 }],
      fundo: 10,
    })!;
    expect(lavado.perdaLavagem).toBe(50);
    expect(lavado.fundo.massa).toBe(60);
    expect(lavado.linhas[1].pctPassante).toBeCloseTo(6, 6);
    expect(lavado.dentroDaTolerancia).toBe(true);
  });

  it("fora da tolerância de 0,3 % é apontado", () => {
    const perdido = calcularGranulometria({
      massaInicialGranulometria: 1000,
      massaAgregado: null,
      massaAposLavagem: null,
      peneiras: [{ aberturaMm: 4.8, nome: "nº 4", ativa: true, retida: 990 }],
      fundo: 5,
    })!;
    expect(perdido.diferencaPct).toBeCloseTo(0.5, 6);
    expect(perdido.dentroDaTolerancia).toBe(false);
  });

  it("peneira desligada não entra; em branco conta como zero", () => {
    const g = calcularGranulometria({
      massaInicialGranulometria: 100,
      massaAgregado: null,
      massaAposLavagem: null,
      peneiras: [
        { aberturaMm: 25, nome: '1"', ativa: false, retida: 50 },
        { aberturaMm: 19, nome: '3/4"', ativa: true, retida: null },
        { aberturaMm: 4.8, nome: "nº 4", ativa: true, retida: 40 },
      ],
      fundo: 60,
    })!;
    expect(g.linhas.map((l) => l.aberturaMm)).toEqual([19, 4.8]);
    expect(g.linhas[0].pctPassante).toBe(100);
    expect(g.linhas[1].pctPassante).toBeCloseTo(60, 6);
  });

  it("sem massa inicial digitada, usa o agregado recuperado da extração", () => {
    expect(massaInicialDoPeneiramento({ massaInicialGranulometria: null, massaAgregado: 945.3 })).toBe(945.3);
    expect(massaInicialDoPeneiramento({ massaInicialGranulometria: 900, massaAgregado: 945.3 })).toBe(900);
    expect(calcularGranulometria({ massaInicialGranulometria: null, massaAgregado: null, massaAposLavagem: null, peneiras: [], fundo: null })).toBeNull();
  });

  it("casas do laudo (§9d): inteiro; 0,075 mm abaixo de 10 % com 0,1", () => {
    expect(casasDoPassante(0.075, 4.3)).toBe(1);
    expect(casasDoPassante(0.075, 12)).toBe(0);
    expect(casasDoPassante(4.8, 4.3)).toBe(0);
  });
});

describe("série de peneiras e identificação", () => {
  it("série da Tabela A1: 17 peneiras; 25 mm para baixo ligadas", () => {
    const p = novasPeneiras();
    expect(p).toHaveLength(SERIE_DNIT_412.length);
    expect(p.filter((x) => x.ativa).map((x) => x.aberturaMm)[0]).toBe(25);
    expect(p.find((x) => x.aberturaMm === 0.075)?.nome).toBe("nº 200");
  });

  it("payload antigo ou parcial ganha a série completa sem perder o digitado", () => {
    const n = normalizarPeneiras([{ aberturaMm: 4.8, nome: "nº 4", ativa: true, retida: 123 }]);
    expect(n).toHaveLength(17);
    expect(n.find((x) => x.aberturaMm === 4.8)?.retida).toBe(123);
    expect(normalizarMedidas({ massaAmostra: 1000 }).peneiras).toHaveLength(17);
  });

  it("reconhece a tag do QR e o nome do tipo de ensaio", () => {
    expect(isAsfTbTag("ASF.TB")).toBe(true);
    expect(isAsfTbTag("Teor de Betume e Granulometria (ASF.TB)")).toBe(true);
    expect(isAsfTbTag("ASF.DAP")).toBe(false);
    expect(isAsfTbTag("Densidade Aparente")).toBe(false);
  });
});
