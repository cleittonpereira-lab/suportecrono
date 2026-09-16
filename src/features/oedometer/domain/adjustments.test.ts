import { describe, expect, it } from "vitest";
import { findTaylorT90 } from "./adjustments";
import type { Stage } from "@/lib/oedometer";

/**
 * Mesma curva sintética de `lib/oedometer.test.ts` ("Cv por Taylor"): reta
 * inicial de inclinação 0,1 até √t = 4, achatando para 0,02 depois — o
 * cruzamento real com a reta de 90% (inclinação 0,1/1,15) fica perto de
 * √t ≈ 4,8, ou seja, t90 ≈ 23 min.
 */
const curva = (perturbarPrimeiro = 0): Stage => {
  const ts = [0.25, 0.5, 1, 2, 4, 8, 15, 30, 60, 120, 240];
  const readings = ts.map((t) => {
    const x = Math.sqrt(t);
    const d = x <= 4 ? 0.1 * x : 0.4 + 0.02 * (x - 4);
    return { t, d };
  });
  readings[0].d += perturbarPrimeiro;
  return { sigma: 100, readings, finalDial: readings[readings.length - 1].d };
};

describe("findTaylorT90 (reencontrar t90 após ajuste manual da reta)", () => {
  it("acha o mesmo cruzamento descendente que o cálculo automático", () => {
    const t90 = findTaylorT90(curva(), 0, 0.1 / 1.15, 999);
    expect(t90).toBeGreaterThan(15);
    expect(t90).toBeLessThan(35);
  });

  it("ruído no primeiro ponto não cria um t90 quase nulo — mesma trava do cvTaylor", () => {
    // Antes desta correção, `f1 * f2 <= 0` aceitava o cruzamento ASCENDENTE
    // criado pelo ruído logo no início e devolvia t90 ≈ 0 — reabrindo, no
    // ajuste manual, o defeito já corrigido no cálculo automático.
    const t90 = findTaylorT90(curva(-0.01), 0, 0.1 / 1.15, 999);
    expect(t90).toBeGreaterThan(5);
  });

  it("sem cruzamento algum, devolve o fallback em vez de inventar", () => {
    const stage: Stage = {
      sigma: 100,
      readings: [0.25, 0.5, 1, 2, 4, 8].map((t) => ({ t, d: 0.1 * Math.sqrt(t) })),
      finalDial: 0.28,
    };
    expect(findTaylorT90(stage, 0, 100, 42)).toBe(42);
  });
});
