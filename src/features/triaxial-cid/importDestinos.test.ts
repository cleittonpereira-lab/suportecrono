import { describe, expect, it } from "vitest";
import { cpsRepetidos, sigma3Confere, sugerirDestinos } from "./importDestinos";
import type { OwnTecTestSummary } from "./importXlsx";

// Resumos iguais aos dos arquivos TRI-E-005-638 (NT 638) e TRI-E-005-639 (NT 639 e 640).
const ensaio = (nt: string, sigma: number, naoDrenado = true): OwnTecTestSummary => ({
  nt,
  code: nt,
  etapas: [],
  hasDrained: !naoDrenado,
  hasUndrained: naoDrenado,
  sigmaRupture: sigma,
  sigmaAdens: null,
  sheet: "Plan1",
});
const cps = [
  { id: "CP1", sigma3Target: 50 },
  { id: "CP2", sigma3Target: 100 },
  { id: "CP3", sigma3Target: 200 },
];

describe("sugerirDestinos", () => {
  it("arquivo com dois NTs: cada um vai para o CP de σ₃ correspondente", () => {
    const d = sugerirDestinos([ensaio("639", 100.57), ensaio("640", 50.57)], cps, "uu", "CP3");
    expect(d).toEqual({ "639": "CP2", "640": "CP1" });
  });

  it("arquivo com um NT: vai para o CP de onde a importação foi aberta", () => {
    expect(sugerirDestinos([ensaio("638", 200.56)], cps, "uu", "CP1")).toEqual({ "638": "CP1" });
  });

  it("NT sem CP de σ₃ parecido fica sem destino", () => {
    const d = sugerirDestinos([ensaio("700", 400), ensaio("701", 50)], cps, "uu");
    expect(d).toEqual({ "700": null, "701": "CP1" });
  });

  it("ensaio drenado não é sugerido para UU nem CIU", () => {
    const d = sugerirDestinos([ensaio("650", 100, false), ensaio("651", 50)], cps, "uu");
    expect(d).toEqual({ "650": null, "651": "CP1" });
  });

  it("dois NTs com o mesmo σ₃ não vão para o mesmo CP", () => {
    const d = sugerirDestinos([ensaio("1", 100), ensaio("2", 101)], cps, "ciu");
    expect(d).toEqual({ "1": "CP2", "2": null });
  });
});

describe("sigma3Confere e cpsRepetidos", () => {
  it("aceita até 5 kPa ou 10 % de diferença", () => {
    expect(sigma3Confere(54, 50)).toBe(true);
    expect(sigma3Confere(108, 100)).toBe(true);
    expect(sigma3Confere(120, 100)).toBe(false);
    expect(sigma3Confere(null, 100)).toBe(false);
  });

  it("aponta CP escolhido para mais de um NT", () => {
    expect(cpsRepetidos({ a: "CP1", b: "CP1", c: "CP2", d: null })).toEqual(["CP1"]);
  });
});
