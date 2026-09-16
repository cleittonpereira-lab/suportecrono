import { describe, expect, it } from "vitest";
import { cvCasagrande, cvTaylor, physicalIndices, ringArea, ringVolume, type MoistureCapsule, type SampleProps, type Stage } from "./oedometer";

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

describe("Cv por Taylor (raiz do tempo)", () => {
  /**
   * Curva sintética com t90 conhecido: segue a reta inicial (inclinação 0,1)
   * até √t = 4 e depois achata (0,02). O cruzamento com a reta de 90%
   * (inclinação 0,1/1,15) cai em √t ≈ 4,8 → t90 ≈ 23 min.
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

  it("acha o t90 no cruzamento descendente da curva com a reta de 90%", () => {
    const r = cvTaylor(curva(), 10);
    expect(r).not.toBeNull();
    expect(r!.t90).toBeGreaterThan(15);
    expect(r!.t90).toBeLessThan(35);
    expect(r!.cv).toBeCloseTo((0.848 * 1 * 1) / (r!.t90 * 60), 12);
  });

  it("ruído no primeiro ponto não cria um t90 quase nulo", () => {
    // Este é o defeito relatado pelo laboratório: a reta cruzava a curva no
    // lugar certo no gráfico, mas o cálculo mordia um cruzamento PARA CIMA no
    // início e devolvia t90 ≈ 0, inflando o Cv.
    const r = cvTaylor(curva(-0.01), 10);
    expect(r).not.toBeNull();
    expect(r!.t90).toBeGreaterThan(5);
    // Fica na mesma ordem de grandeza do caso limpo. Não exigimos igualdade:
    // perturbar o primeiro ponto muda o ajuste por mínimos quadrados da reta
    // inicial e desloca o cruzamento de verdade — é por isso que a tela
    // oferece ajuste manual da reta (cvAdjust).
    const limpo = cvTaylor(curva(), 10)!;
    expect(Math.abs(r!.t90 - limpo.t90) / limpo.t90).toBeLessThan(0.3);
  });

  it("curva que nunca cruza a reta de 90% devolve null em vez de chute", () => {
    const readings = [0.25, 0.5, 1, 2, 4, 8].map((t) => ({ t, d: 0.1 * Math.sqrt(t) }));
    expect(cvTaylor({ sigma: 100, readings, finalDial: 0.28 }, 10)).toBeNull();
  });
});

describe("Cv por Casagrande (log do tempo)", () => {
  const ts = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256];

  /** Recalque em S no log do tempo, como num estágio de carregamento. */
  const carregamento: Stage = {
    sigma: 100,
    readings: ts.map((t) => ({ t, d: 0.05 + 0.45 / (1 + Math.pow(10 / t, 1.5)) })),
    finalDial: 0.5,
  };

  /** Descarregamento: o CP expande, o recalque DIMINUI com o tempo. */
  const descarregamento: Stage = {
    sigma: 12.5,
    readings: ts.map((t) => ({ t, d: 0.5 - 0.02 * Math.log10(t + 1) })),
    finalDial: 0.45,
  };

  it("estágio de carregamento devolve t50 plausível e Cv coerente", () => {
    const r = cvCasagrande(carregamento, 10);
    expect(r).not.toBeNull();
    expect(r!.t50).toBeGreaterThan(0.5);
    expect(r!.t50).toBeLessThan(256);
    expect(r!.cv).toBeCloseTo((0.197 * 1 * 1) / (r!.t50 * 60), 12);
    expect(r!.d100).toBeGreaterThan(r!.d0);
  });

  it("descarregamento não inventa reta de compressão: devolve null", () => {
    // Antes, `best` começava numa reta fictícia (m=0, b=0) que nunca era
    // substituída quando todas as inclinações são negativas, e o d100 saía do
    // cruzamento com essa reta inexistente.
    expect(cvCasagrande(descarregamento, 10)).toBeNull();
  });

  it("poucas leituras não viram resultado", () => {
    expect(cvCasagrande({ sigma: 100, readings: [{ t: 1, d: 0.1 }], finalDial: 0.1 }, 10)).toBeNull();
  });
});
