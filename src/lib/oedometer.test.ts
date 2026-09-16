import { describe, expect, it } from "vitest";
import { physicalIndices, ringArea, ringVolume, type MoistureCapsule, type SampleProps } from "./oedometer";

/** Cápsula que resulta exatamente na umidade `w` (%): ms = 100 g. */
const capsulaDe = (w: number): MoistureCapsule => ({ tara: 0, dry: 100, wet: 100 + w });

const BASE: SampleProps = {
  project: "—", client: "—", workNumber: "17700-26", reportNumber: "1",
  borehole: "SH-03", depth: "1,00", local: "—", date: "2026-07-21", revision: "0",
  operator: "—", technicalResp: "—", description: "argila siltosa", code: "13314-075",
  os: "17700-26", granulometricDescription: "—",
  // Anel do ensaio real do laboratório (CIS-001):
  ringDiameter: 50.21,
  ringHeight: 19.93,
  wetMassInitial: 66.6,
  wetMassFinal: 52.0,
  dryMass: 0,
  Gs: 2.67,
  rhoW: 1,
};

describe("índices físicos do adensamento", () => {
  it("massa seca vem da massa aparente FINAL com a umidade das cápsulas finais", () => {
    const p = physicalIndices(
      { ...BASE, capsules: [capsulaDe(50)], finalCapsules: [capsulaDe(36.15)] },
      { hFinalMm: 8.64 },
    );
    // m_s = m_úmida,final / (1 + w_f)
    expect(p.dryMass).toBeCloseTo(52.0 / 1.3615, 6);
    expect(p.wf).toBeCloseTo(36.15, 6);
    // A umidade inicial é a das cápsulas, não a derivada das massas.
    expect(p.wi).toBeCloseTo(50, 6);
  });

  it("volume final vem da altura final medida — e daí saem ρ final, e_f e Sr_f", () => {
    const hFinal = 8.64;
    const p = physicalIndices(
      { ...BASE, capsules: [capsulaDe(50)], finalCapsules: [capsulaDe(36.15)] },
      { hFinalMm: hFinal },
    );
    const Vfinal = ringVolume(BASE.ringDiameter, hFinal);
    expect(p.hFinal).toBe(hFinal);
    expect(p.Vfinal).toBeCloseTo(Vfinal, 6);
    expect(p.rho_f).toBeCloseTo(52.0 / Vfinal, 6);
    expect(p.rho_d_final).toBeCloseTo(p.dryMass / Vfinal, 6);
    // e_f pelo volume final, não por hipótese de saturação:
    expect(p.ef).toBeCloseTo(Vfinal / p.Vs - 1, 6);
    // Sr_f coerente com e_f — nunca mais o zero de antes.
    expect(p.Srf).toBeCloseTo(((p.wf / 100) * BASE.Gs) / p.ef * 100, 6);
    expect(p.Srf).toBeGreaterThan(0);
  });

  it("descarregamento: o CP recupera altura e o índice de vazios final sobe junto", () => {
    const comuns = { ...BASE, capsules: [capsulaDe(50)], finalCapsules: [capsulaDe(36.15)] };
    const carregado = physicalIndices(comuns, { hFinalMm: 8.64 });
    const descarregado = physicalIndices(comuns, { hFinalMm: 9.2 });
    expect(descarregado.ef).toBeGreaterThan(carregado.ef);
    expect(descarregado.rho_f).toBeLessThan(carregado.rho_f);
  });

  it("sem altura final informada, cai em H₀ e e_f iguala e₀", () => {
    const p = physicalIndices({ ...BASE, capsules: [capsulaDe(50)], finalCapsules: [capsulaDe(36.15)] });
    expect(p.hFinal).toBe(BASE.ringHeight);
    expect(p.ef).toBeCloseTo(p.e0, 9);
  });

  it("ficha antiga sem cápsulas nem massa final: usa a massa seca digitada e não quebra", () => {
    const p = physicalIndices({ ...BASE, wetMassFinal: 0, dryMass: 44.2 }, { hFinalMm: 8.64 });
    expect(p.dryMass).toBe(44.2);
    expect(Number.isFinite(p.e0)).toBe(true);
    expect(Number.isFinite(p.Sr0)).toBe(true);
  });

  it("avisa quando as cápsulas discordam das massas em vez de imprimir índice impossível", () => {
    // Caso real que gerou Sr₀ = 254,58% no laudo: cápsula de 131,53% convivendo
    // com massas que indicam ~50%.
    const p = physicalIndices(
      { ...BASE, capsules: [capsulaDe(131.53)], finalCapsules: [capsulaDe(36.15)] },
      { hFinalMm: 8.64 },
    );
    expect(p.avisos.length).toBeGreaterThan(0);
    expect(p.avisos.join(" ")).toMatch(/não confere|impossível/i);
  });

  it("dado coerente não gera aviso nenhum", () => {
    // Massas, cápsulas e altura final contando a MESMA história: CP ainda
    // saturado no fim, com e_f = w_f·Gs.
    const dry = 44.2;
    const wf = 36.15;
    const wi = ((BASE.wetMassInitial - dry) / dry) * 100; // ≈ 50,7 %
    const Vs = dry / BASE.Gs;
    const Vfinal = (1 + (wf / 100) * BASE.Gs) * Vs;
    const hFinal = (Vfinal / ringArea(BASE.ringDiameter)) * 10;
    const p = physicalIndices(
      {
        ...BASE,
        wetMassFinal: dry * (1 + wf / 100),
        capsules: [capsulaDe(wi)],
        finalCapsules: [capsulaDe(wf)],
      },
      { hFinalMm: hFinal },
    );
    expect(p.avisos).toEqual([]);
    expect(p.Sr0).toBeLessThanOrEqual(105);
    expect(p.Srf).toBeCloseTo(100, 6);
  });

  it("altura final incompatível com a umidade final é acusada, não escondida", () => {
    // O ensaio real que motivou a correção: H final de 8,64 mm deixa o CP quase
    // sem vazios (e_f ≈ 0,03), o que não convive com 36% de umidade. Antes, o
    // laudo saía com Sr_f = 0 — o problema ficava invisível.
    const p = physicalIndices(
      { ...BASE, capsules: [capsulaDe(50.7)], finalCapsules: [capsulaDe(36.15)] },
      { hFinalMm: 8.64 },
    );
    expect(p.ef).toBeLessThan(0.3); // quase sem vazios
    expect(p.Srf).toBeGreaterThan(105); // fisicamente impossível
    expect(p.avisos.join(" ")).toMatch(/saturação final impossível/i);
  });
});
