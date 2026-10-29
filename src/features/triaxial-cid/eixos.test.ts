import { describe, expect, it } from "vitest";
import { baseQueCobre, niceCeil, topoQueCobre } from "./eixos";

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

  it("base negativa cobre poropressão negativa", () => {
    expect(baseQueCobre(0, -19.4)).toBe(-20);
    expect(baseQueCobre(0, 3)).toBe(0);
    expect(baseQueCobre(-30, -19.4)).toBe(-30);
    expect(baseQueCobre(-10, -19.4)).toBe(-20);
  });
});
