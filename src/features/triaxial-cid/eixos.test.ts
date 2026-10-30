import { describe, expect, it } from "vitest";
import { baseQueCobre, escalaIgual, niceCeil, topoQueCobre } from "./eixos";

describe("eixos que cobrem os dados", () => {
  it("arredonda o topo para um valor redondo acima do dado", () => {
    expect(niceCeil(19.9)).toBe(20);
    expect(niceCeil(46)).toBe(50);
    expect(niceCeil(118.06)).toBe(120);
    expect(niceCeil(0.7)).toBe(0.7);
  });

  it("limite digitado menor que os dados (εa máx 1 % com dados até 20 %) é ignorado", () => {
    expect(topoQueCobre(1, 19.9)).toBe(20);
  });

  it("limite digitado que cobre os dados é respeitado", () => {
    expect(topoQueCobre(25, 19.9)).toBe(25);
  });

  it("0 = automático: vai até o redondo acima do dado", () => {
    expect(topoQueCobre(0, 46)).toBe(50);
  });

  /** kPa por px de cada eixo, descontada a sobra que vira margem. */
  const escalas = (e: ReturnType<typeof escalaIgual>, w: number, h: number) => [
    e.xMax / (w - e.sobraW),
    e.yMax / (h - e.sobraH),
  ];

  it("escala 1:1: mesmo kPa/px nos dois eixos, cobrindo os dados", () => {
    // Faixa larga e baixa (600 × 200 px) com σ até 285 e τ até 48 (os círculos do UU).
    const e = escalaIgual(600, 200, 285, 48);
    const [kx, ky] = escalas(e, 600, 200);
    expect(kx).toBeCloseTo(ky, 9);
    expect(e.xMax).toBeGreaterThanOrEqual(285);
    expect(e.yMax).toBeGreaterThanOrEqual(48);
    expect(e.ticksX[1] - e.ticksX[0]).toBe(e.ticksY[1] - e.ticksY[0]);
  });

  it("os dois eixos terminam exatamente num tick (sem ponta sobrando)", () => {
    for (const [w, h, x, y] of [[640, 200, 299, 48], [600, 100, 50, 80], [700, 260, 120, 30], [500, 500, 90, 40]]) {
      const e = escalaIgual(w, h, x, y);
      expect(e.ticksX[e.ticksX.length - 1]).toBeCloseTo(e.xMax, 9);
      expect(e.ticksY[e.ticksY.length - 1]).toBeCloseTo(e.yMax, 9);
      const [kx, ky] = escalas(e, w, h);
      expect(kx).toBeCloseTo(ky, 9);
      expect(e.xMax).toBeGreaterThanOrEqual(x);
      expect(e.yMax).toBeGreaterThanOrEqual(y);
    }
  });

  it("não deixa o eixo y curto demais: escolhe passo menor quando sobra muito espaço", () => {
    // O caso da foto: σ até ~300, τ até ~48 numa faixa de 640 × 200 px.
    const e = escalaIgual(640, 200, 299, 48);
    expect(e.sobraH).toBeLessThan(60);
  });

  it("base negativa cobre poropressão negativa", () => {
    expect(baseQueCobre(0, -19.4)).toBe(-20);
    expect(baseQueCobre(0, 3)).toBe(0);
    expect(baseQueCobre(-30, -19.4)).toBe(-30);
    expect(baseQueCobre(-10, -19.4)).toBe(-20);
  });
});
