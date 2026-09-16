import { describe, expect, it } from "vitest";
import { niceAxis, niceTicks } from "./axisTicks";

/** Maior diferença entre os espaçamentos consecutivos das marcas. */
const maiorVariacaoDoPasso = (ticks: number[]) => {
  const passos = ticks.slice(1).map((v, i) => v - ticks[i]);
  return Math.max(...passos) - Math.min(...passos);
};

describe("eixo com divisões uniformes (niceAxis)", () => {
  it("as duas pontas do eixo são marcas — não sobra pedaço sem valor", () => {
    const eixo = niceAxis(0.031, 1.379, 6)!;
    expect(eixo.ticks[0]).toBe(eixo.domain[0]);
    expect(eixo.ticks[eixo.ticks.length - 1]).toBe(eixo.domain[1]);
  });

  it("todas as divisões têm o mesmo tamanho", () => {
    for (const [min, max] of [[0.031, 1.379], [0, 3200], [-0.5, 2.25], [12.5, 987]] as const) {
      const eixo = niceAxis(min, max, 6)!;
      expect(maiorVariacaoDoPasso(eixo.ticks)).toBeLessThan(1e-9);
    }
  });

  it("o domínio cobre os dados de ponta a ponta", () => {
    const eixo = niceAxis(0.031, 1.379, 6)!;
    expect(eixo.domain[0]).toBeLessThanOrEqual(0.031);
    expect(eixo.domain[1]).toBeGreaterThanOrEqual(1.379);
  });

  it("é o que niceTicks não garantia: lá as pontas ficavam de fora", () => {
    const min = 0.031, max = 1.379;
    const antigo = niceTicks(min, max, 6)!;
    // O defeito que o laboratório enxergava no laudo: a primeira marca não
    // coincide com o começo do eixo, então aquela divisão sai de outro tamanho.
    expect(antigo[0]).not.toBeCloseTo(min, 9);
    const novo = niceAxis(min, max, 6)!;
    expect(novo.ticks[0]).toBe(novo.domain[0]);
  });

  it("intervalo inválido não vira eixo", () => {
    expect(niceAxis(5, 5)).toBeUndefined();
    expect(niceAxis(10, 1)).toBeUndefined();
    expect(niceAxis(NaN, 10)).toBeUndefined();
  });
});
