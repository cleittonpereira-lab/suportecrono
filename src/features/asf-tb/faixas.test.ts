import { describe, expect, it } from "vitest";
import { FAIXAS_DNIT_031, foraDaFaixa, limiteNaPeneira } from "./faixas";
import { SERIE_DNIT_412 } from "./types";

describe("faixas DNIT 031/2024-ES (Tabela 1)", () => {
  it("todas as peneiras das faixas existem na série da DNIT 412", () => {
    const serie = new Set(SERIE_DNIT_412.map((p) => p.aberturaMm));
    for (const f of Object.values(FAIXAS_DNIT_031)) {
      for (const l of f.limites) expect(serie.has(l.aberturaMm)).toBe(true);
    }
  });

  it("limites conferidos com a tabela", () => {
    expect(limiteNaPeneira("C", 19)).toMatchObject({ min: 100, max: 100 });
    expect(limiteNaPeneira("C", 4.8)).toMatchObject({ min: 44, max: 72 });
    expect(limiteNaPeneira("B", 0.075)).toMatchObject({ min: 2, max: 8 });
    expect(limiteNaPeneira("A", 0.075)).toMatchObject({ min: 1, max: 7 });
    expect(limiteNaPeneira("C", 25)).toBeNull();
    // 2,0 mm e 0,43 mm são da DNIT 412, sem limite na DNIT 031.
    expect(limiteNaPeneira("C", 2)).toBeNull();
  });

  it("limites crescem com a abertura (curva coerente)", () => {
    for (const f of Object.values(FAIXAS_DNIT_031)) {
      const asc = [...f.limites].sort((a, b) => a.aberturaMm - b.aberturaMm);
      for (let i = 1; i < asc.length; i++) {
        expect(asc[i].min).toBeGreaterThanOrEqual(asc[i - 1].min);
        expect(asc[i].max).toBeGreaterThanOrEqual(asc[i - 1].max);
      }
    }
  });

  it("fora da faixa usa o valor como sai no laudo", () => {
    expect(foraDaFaixa("C", 9.5, 89.4)).toBe(false); // impresso 89
    expect(foraDaFaixa("C", 9.5, 89.6)).toBe(true); // impresso 90
    expect(foraDaFaixa("C", 0.075, 1.96)).toBe(false); // impresso 2,0
    expect(foraDaFaixa("C", 0.075, 1.94)).toBe(true); // impresso 1,9
    expect(foraDaFaixa("C", 2, 50)).toBeNull();
  });
});
