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

  it("escala 1:1 preenche a área: mesmo kPa/px nos dois eixos", () => {
    // Faixa larga e baixa (600 × 200 px) com σ até 285 e τ até 48 (os círculos do UU).
    const e = escalaIgual(600, 200, 285, 48);
    expect(e.xMax).toBe(300);
    expect(e.xMax / 600).toBeCloseTo(e.yMax / 200, 9);
    expect(e.yMax).toBeGreaterThanOrEqual(48);
    expect(e.ticksX[1] - e.ticksX[0]).toBe(e.ticksY[1] - e.ticksY[0]);
  });

  it("escala 1:1 estica o x quando o y necessário não cabe", () => {
    const e = escalaIgual(600, 100, 50, 80);
    expect(e.yMax).toBe(80);
    expect(e.xMax / 600).toBeCloseTo(e.yMax / 100, 9);
  });

  it("base negativa cobre poropressão negativa", () => {
    expect(baseQueCobre(0, -19.4)).toBe(-20);
    expect(baseQueCobre(0, 3)).toBe(0);
    expect(baseQueCobre(-30, -19.4)).toBe(-30);
    expect(baseQueCobre(-10, -19.4)).toBe(-20);
  });
});
