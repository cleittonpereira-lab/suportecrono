import { describe, expect, it } from "vitest";
import { ADAPTADOR_TENSAO, coeficientesDaTensao, forcaDeSigmaD } from "./ajuste";
import { processSpecimen } from "./calc";
import type { ShearReading, TriaxialSample, TriaxialSpecimen } from "../types";

const AMOSTRA: TriaxialSample = {
  client: "—", workNumber: "1", reportNumber: "1", borehole: "F-1", depth: "1,00",
  local: "—", date: "2026-09-15", revision: "0", operator: "—", technicalResp: "—",
  description: "argila siltosa", code: "AM-1", os: "OS-1", granulometricDescription: "—",
  condition: "saturado", Gs: 2.67, rhoW: 1,
  applyMembrane: true, membraneE: 1400, membraneT: 0.3,
};

/** Cisalhamento sintético: força crescente com um ponto espúrio no meio. */
const LEITURAS: ShearReading[] = [
  { eaPct: 0.0, F: 0, dvPct: 0.0 },
  { eaPct: 0.5, F: 120, dvPct: 0.10 },
  { eaPct: 1.0, F: 210, dvPct: 0.22 },
  { eaPct: 2.0, F: 330, dvPct: 0.41 },
  { eaPct: 3.0, F: 180, dvPct: 0.58 }, // queda espúria do sensor
  { eaPct: 4.0, F: 430, dvPct: 0.72 },
  { eaPct: 6.0, F: 470, dvPct: 0.95 },
  { eaPct: 8.0, F: 485, dvPct: 1.12 },
];

const cpCom = (patch: Partial<TriaxialSpecimen> = {}): TriaxialSpecimen => ({
  id: "CP1", D0: 50, H0: 100,
  wetMass: 380, dryMass: 320, w0Pct: 18.75,
  sigma3Target: 100, backPressure: 300,
  saturation: [], consolidation: [{ t: 0, dv: 0 }, { t: 120, dv: 2.5 }],
  shear: LEITURAS, failureCriterion: "max_q",
  ...patch,
});

const sigmasDe = (cp: TriaxialSpecimen, am = AMOSTRA) =>
  ADAPTADOR_TENSAO.serie(cp, am).map((p) => p.y);

describe("inversa σd → força", () => {
  it("σd é mesmo linear na força (a hipótese da inversa)", () => {
    const cp = cpCom();
    const coefs = coeficientesDaTensao(cp, AMOSTRA);
    coefs.forEach((c, i) => {
      expect(c.alfa).toBeGreaterThan(0);
      // Conferindo contra o cálculo real numa força qualquer:
      const prova = sigmasDe(cpCom({ shear: cp.shear.map((r) => ({ ...r, F: 5000 })) }))[i];
      expect(c.alfa * 5000 + c.beta).toBeCloseTo(prova, 6);
    });
  });

  it("aplicar a própria curva de volta não muda nada", () => {
    const cp = cpCom();
    const alvo = sigmasDe(cp);
    const novas = ADAPTADOR_TENSAO.aplicar(cp, AMOSTRA, alvo);
    // A σd resultante é idêntica...
    sigmasDe(cpCom({ shear: novas })).forEach((v, i) => expect(v).toBeCloseTo(alvo[i], 9));
    // ...e a força volta ao valor medido onde a leitura não estava no limitador.
    // Na primeira linha, σd já era 0 por corte em max(0, σd): várias forças
    // produzem σd = 0, então só a tensão tem de bater, não a força.
    novas.forEach((r, i) => {
      if (alvo[i] > 0) expect(r.F).toBeCloseTo(LEITURAS[i].F, 6);
    });
  });

  it("vale com correção de pistão e papel filtro ligadas", () => {
    const amostra: TriaxialSample = { ...AMOSTRA, applyPistonCorrection: true, filterPaperResistance: 0.19 };
    const cp = cpCom({ aPistao: 2.0, hTopcap: 1.5, mSobreCP: 250, fAtritoPistao: 0.4 });
    const alvo = sigmasDe(cp, amostra);
    const novas = ADAPTADOR_TENSAO.aplicar(cp, amostra, alvo);
    sigmasDe(cpCom({ ...cp, shear: novas }), amostra).forEach((v, i) =>
      expect(v).toBeCloseTo(alvo[i], 9),
    );
  });

  it("linha que guarda kgf continua guardando kgf", () => {
    const cp = cpCom({
      shear: LEITURAS.map((r, i) => (i % 2 === 0 ? { ...r, loadKgf: r.F / 9.80665 } : r)),
    });
    const alvo = sigmasDe(cp);
    const novas = ADAPTADOR_TENSAO.aplicar(cp, AMOSTRA, alvo);
    expect(novas[2].loadKgf).toBeDefined();
    expect(novas[2].F).toBe(LEITURAS[2].F); // campo não usado fica intacto
    expect(novas[3].loadKgf).toBeUndefined();
    sigmasDe(cpCom({ shear: novas })).forEach((v, i) => expect(v).toBeCloseTo(alvo[i], 9));
  });

  it("valor não numérico deixa a leitura intacta", () => {
    const cp = cpCom();
    const alvo = sigmasDe(cp);
    alvo[4] = NaN;
    const novas = ADAPTADOR_TENSAO.aplicar(cp, AMOSTRA, alvo);
    expect(novas[4]).toEqual(LEITURAS[4]);
  });

  it("coeficiente degenerado não gera força infinita", () => {
    expect(forcaDeSigmaD(undefined, 100)).toBe(0);
    expect(forcaDeSigmaD({ alfa: 0, beta: 10 }, 100)).toBe(0);
    expect(forcaDeSigmaD({ alfa: 1, beta: 0 }, -50)).toBe(0);
  });
});

describe("restaurar o dado medido", () => {
  it("devolve exatamente os valores originais", () => {
    const cp = cpCom();
    const originais = ADAPTADOR_TENSAO.originais(cp);
    const ajustadas = ADAPTADOR_TENSAO.aplicar(cp, AMOSTRA, sigmasDe(cp).map((v) => v * 1.2));
    expect(ajustadas[6].F).not.toBe(LEITURAS[6].F);
    const voltou = ADAPTADOR_TENSAO.restaurar({ ...cp, shear: ajustadas }, originais);
    voltou.forEach((r, i) => expect(r.F).toBe(LEITURAS[i].F));
  });

  it("restaura também quando a leitura usa kgf", () => {
    const cp = cpCom({ shear: LEITURAS.map((r) => ({ ...r, loadKgf: r.F / 9.80665 })) });
    const originais = ADAPTADOR_TENSAO.originais(cp);
    const ajustadas = ADAPTADOR_TENSAO.aplicar(cp, AMOSTRA, sigmasDe(cp).map((v) => v * 0.8));
    const voltou = ADAPTADOR_TENSAO.restaurar({ ...cp, shear: ajustadas }, originais);
    voltou.forEach((r, i) => expect(r.loadKgf).toBe(cp.shear[i].loadKgf));
  });
});

describe("a cascata chega na ruptura", () => {
  it("corrigir a queda espúria muda o ponto de ruptura do CP", () => {
    const cp = cpCom();
    const antes = processSpecimen(cp, AMOSTRA);
    // Curva sem o ponto espúrio (interpolando entre os vizinhos):
    const alvo = sigmasDe(cp);
    alvo[4] = (alvo[3] + alvo[5]) / 2;
    const depois = processSpecimen({ ...cp, shear: ADAPTADOR_TENSAO.aplicar(cp, AMOSTRA, alvo) }, AMOSTRA);
    expect(depois.shearCurve[4].sigmaD).toBeGreaterThan(antes.shearCurve[4].sigmaD);
    // O pico e a envoltória vêm de findFailure sobre a mesma curva:
    expect(depois.failure).not.toBeNull();
    expect(depois.failure!.q).toBeGreaterThanOrEqual(antes.failure!.q);
  });

  it("subir a curva inteira sobe a tensão de ruptura", () => {
    const cp = cpCom();
    const antes = processSpecimen(cp, AMOSTRA);
    const depois = processSpecimen(
      { ...cp, shear: ADAPTADOR_TENSAO.aplicar(cp, AMOSTRA, sigmasDe(cp).map((v) => v * 1.1)) },
      AMOSTRA,
    );
    expect(depois.failure!.q).toBeGreaterThan(antes.failure!.q);
    expect(depois.failure!.q / antes.failure!.q).toBeCloseTo(1.1, 3);
  });
});
