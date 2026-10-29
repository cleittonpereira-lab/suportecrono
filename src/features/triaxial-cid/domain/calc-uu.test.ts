import { describe, expect, it } from "vitest";
import { processSpecimen, circleArea, envoltoriaUU } from "./calc";
import type { TriaxialSample, TriaxialSpecimen } from "../types";

// Ensaio UU sem drenagem: o volume do CP não muda, então o que o operador
// digitar de ΔV ou poropressão não pode alterar a área nem as tensões totais.
const sample = {
  Gs: 2.7,
  rhoW: 1,
  testType: "uu",
  applyMembrane: false,
  membraneE: 1400,
  membraneT: 0.5,
  filterPaperResistance: 0,
  condition: "natural",
} as unknown as TriaxialSample;

const cp = (extra: Partial<TriaxialSpecimen> = {}): TriaxialSpecimen => ({
  id: "CP1",
  D0: 50,
  H0: 100,
  wetMass: 353.4,
  dryMass: 282.72,
  w0Pct: 25,
  sigma3Target: 100,
  backPressure: 0,
  saturation: [],
  consolidation: [{ t: 10, dv: 5 }],
  shear: [
    { eaPct: 0, F: 0, dvPct: 3 },
    { eaPct: 5, F: 1000, dvPct: 3, dVcm3: 2, uPore: 40 },
  ],
  failureCriterion: "max_q",
  ...extra,
});

describe("Triaxial UU — contas sem variação de volume", () => {
  it("área corrigida é A0 / (1 − εa), com volume constante", () => {
    const r = processSpecimen(cp(), sample);
    const A0 = circleArea(50);
    expect(r.Ac).toBeCloseTo(A0, 10);
    expect(r.shearCurve[1].A).toBeCloseTo(A0 / (1 - 0.05), 10);
  });

  it("ignora ΔV de adensamento e de cisalhamento: εv = 0 e volume final = V0", () => {
    const r = processSpecimen(cp(), sample);
    expect(r.dVcons).toBe(0);
    expect(r.Vc).toBeCloseTo(r.V0, 10);
    expect(r.shearCurve.every((p) => p.evPct === 0)).toBe(true);
  });

  it("tensões totais: σ1 = σ3 + σd, sem descontar poropressão", () => {
    const r = processSpecimen(cp(), sample);
    const p = r.shearCurve[1];
    expect(p.sigma1).toBeCloseTo(100 + p.sigmaD, 6);
    expect(p.sigma3Prime).toBeCloseTo(100, 6);
    expect(p.sigma1Prime).toBeCloseTo(p.sigma1, 6);
    expect(p.q).toBeCloseTo(p.sigmaD / 2, 6);
  });

  it("a poropressão lida não entra no UU (mesma tensão com ou sem uPore)", () => {
    const comU = processSpecimen(cp(), sample).shearCurve[1];
    const semU = processSpecimen(
      cp({ shear: [{ eaPct: 0, F: 0, dvPct: 0 }, { eaPct: 5, F: 1000, dvPct: 0 }] }),
      sample,
    ).shearCurve[1];
    expect(comU.sigmaD).toBeCloseTo(semU.sigmaD, 9);
    expect(comU.sigma1).toBeCloseTo(semU.sigma1, 9);
  });

  it("envoltória horizontal: φu = 0 e cu = Su = média de (σ1 − σ3)/2 na ruptura", () => {
    // q de ruptura dos CPs do exemplo do usuário: 23, 9 e 42 kPa.
    const env = envoltoriaUU([
      { pPrime: 73, q: 23, cp: "CP1" },
      { pPrime: 109, q: 9, cp: "CP2" },
      { pPrime: 242, q: 42, cp: "CP3" },
    ])!;
    expect(env.phiDeg).toBe(0);
    expect(env.M).toBe(0);
    expect(env.cPrime).toBeCloseTo(74 / 3, 9);
    expect(env.a).toBeCloseTo(74 / 3, 9);
    expect(env.desvioPadrao).toBeCloseTo(Math.sqrt(((23 - 74 / 3) ** 2 + (9 - 74 / 3) ** 2 + (42 - 74 / 3) ** 2) / 2), 9);
    expect(Number.isNaN(env.r2)).toBe(true);
  });

  it("um só CP já dá Su (desvio padrão 0); sem CP não há envoltória", () => {
    expect(envoltoriaUU([{ pPrime: 60, q: 15, cp: "CP1" }])).toMatchObject({ cPrime: 15, phiDeg: 0, desvioPadrao: 0 });
    expect(envoltoriaUU([])).toBeNull();
  });

  it("no CID a mesma leitura ainda usa ΔV e poropressão (não muda o comportamento drenado)", () => {
    const cid = { ...sample, testType: "cid" } as unknown as TriaxialSample;
    const r = processSpecimen(cp(), cid);
    expect(r.shearCurve[1].evPct).toBe(3);
    expect(r.shearCurve[1].A).not.toBeCloseTo(circleArea(50) / (1 - 0.05), 3);
  });
});
