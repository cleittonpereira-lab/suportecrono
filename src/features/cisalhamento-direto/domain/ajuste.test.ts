import { describe, expect, it } from "vitest";
import {
  ADAPTADOR_DESLOCAMENTO_VERTICAL, ADAPTADOR_TENSAO_CISALHANTE,
  coeficientesDaTensaoCisalhante, forcaDeTau,
} from "./ajuste";
import { processSpecimen } from "./calc";
import type { CDReading, CDSample, CDSpecimen } from "../types";

const AMOSTRA: CDSample = {
  client: "—", workNumber: "1", reportNumber: "1", os: "OS-1", borehole: "F-1",
  code: "AM-1", depth: "1,00", local: "—", date: "2026-09-17", operator: "—",
  technicalResp: "—", typedBy: "—", description: "argila siltosa",
  geometry: "circular", dimensionMm: 63.5, Gs: 2.67, rhoW: 1,
  testCondition: "inundado", applyMembrane: false, membraneE: 0, membraneT: 0,
  sampleState: "indeformada",
};

/** Cisalhamento sintético: força crescente com um ponto espúrio no meio. */
const LEITURAS: CDReading[] = [
  { horizDispMm: 0.0, shearForce: 0, vertDispMm: 0.00 },
  { horizDispMm: 0.5, shearForce: 60, vertDispMm: -0.05 },
  { horizDispMm: 1.0, shearForce: 110, vertDispMm: -0.08 },
  { horizDispMm: 2.0, shearForce: 170, vertDispMm: -0.02 },
  { horizDispMm: 3.0, shearForce: 90, vertDispMm: 0.05 }, // queda espúria do sensor
  { horizDispMm: 4.0, shearForce: 210, vertDispMm: 0.12 },
  { horizDispMm: 6.0, shearForce: 225, vertDispMm: 0.20 },
  { horizDispMm: 8.0, shearForce: 230, vertDispMm: 0.25 },
];

const cpCom = (patch: Partial<CDSpecimen> = {}): CDSpecimen => ({
  id: "CP1", height0Mm: 25, wetMass: 210, wetMassCPAnel: 0, ringMass: 0,
  capsules: [], w0Pct: 18.0, finalCapsules: [],
  normalStressTarget: 100, failureCriterion: "max_tau",
  consolidationData: [{ timeMin: 0, settlementMm: 0 }, { timeMin: 120, settlementMm: 0.8 }],
  shearData: LEITURAS,
  ...patch,
});

const tausDe = (cp: CDSpecimen, am = AMOSTRA) =>
  ADAPTADOR_TENSAO_CISALHANTE.serie(cp, am).map((p) => p.y);

describe("inversa τ → força (cisalhamento direto)", () => {
  it("τ é mesmo linear na força (a hipótese da inversa)", () => {
    const cp = cpCom();
    const coefs = coeficientesDaTensaoCisalhante(cp, AMOSTRA);
    coefs.forEach((c, i) => {
      expect(c.alfa).toBeGreaterThan(0);
      const prova = tausDe(cpCom({ shearData: cp.shearData.map((r) => ({ ...r, shearForce: 5000 })) }))[i];
      expect(c.alfa * 5000 + c.beta).toBeCloseTo(prova, 6);
    });
  });

  it("aplicar a própria curva de volta não muda nada", () => {
    const cp = cpCom();
    const alvo = tausDe(cp);
    const novas = ADAPTADOR_TENSAO_CISALHANTE.aplicar(cp, AMOSTRA, alvo);
    tausDe(cpCom({ shearData: novas })).forEach((v, i) => expect(v).toBeCloseTo(alvo[i], 9));
    novas.forEach((r, i) => {
      if (alvo[i] > 0) expect(r.shearForce).toBeCloseTo(LEITURAS[i].shearForce, 6);
    });
  });

  it("linha que guarda kgf continua guardando kgf", () => {
    const cp = cpCom({
      shearData: LEITURAS.map((r, i) => (i % 2 === 0 ? { ...r, loadKgf: r.shearForce / 9.80665 } : r)),
    });
    const alvo = tausDe(cp);
    const novas = ADAPTADOR_TENSAO_CISALHANTE.aplicar(cp, AMOSTRA, alvo);
    expect(novas[2].loadKgf).toBeDefined();
    expect(novas[2].shearForce).toBe(LEITURAS[2].shearForce); // campo não usado fica intacto
    expect(novas[3].loadKgf).toBeUndefined();
    tausDe(cpCom({ shearData: novas })).forEach((v, i) => expect(v).toBeCloseTo(alvo[i], 9));
  });

  it("valor não numérico deixa a leitura intacta", () => {
    const cp = cpCom();
    const alvo = tausDe(cp);
    alvo[4] = NaN;
    const novas = ADAPTADOR_TENSAO_CISALHANTE.aplicar(cp, AMOSTRA, alvo);
    expect(novas[4]).toEqual(LEITURAS[4]);
  });

  it("coeficiente degenerado não gera força infinita", () => {
    expect(forcaDeTau(undefined, 100)).toBe(0);
    expect(forcaDeTau({ alfa: 0, beta: 10 }, 100)).toBe(0);
    expect(forcaDeTau({ alfa: 1, beta: 0 }, -50)).toBe(0);
  });

  it("restaurar devolve exatamente os valores originais", () => {
    const cp = cpCom();
    const originais = ADAPTADOR_TENSAO_CISALHANTE.originais(cp);
    const ajustadas = ADAPTADOR_TENSAO_CISALHANTE.aplicar(cp, AMOSTRA, tausDe(cp).map((v) => v * 1.2));
    expect(ajustadas[6].shearForce).not.toBe(LEITURAS[6].shearForce);
    const voltou = ADAPTADOR_TENSAO_CISALHANTE.restaurar({ ...cp, shearData: ajustadas }, originais);
    voltou.forEach((r, i) => expect(r.shearForce).toBe(LEITURAS[i].shearForce));
  });
});

describe("deslocamento vertical é independente de τ (sem ordem entre as duas)", () => {
  it("a série é o próprio vertDispMm", () => {
    const cp = cpCom();
    const serie = ADAPTADOR_DESLOCAMENTO_VERTICAL.serie(cp, AMOSTRA);
    serie.forEach((p, i) => expect(p.y).toBe(LEITURAS[i].vertDispMm));
  });

  it("aplicar muda vertDispMm sem tocar shearForce/loadKgf", () => {
    const cp = cpCom();
    const alvo = LEITURAS.map((r) => r.vertDispMm + 0.5);
    const novas = ADAPTADOR_DESLOCAMENTO_VERTICAL.aplicar(cp, AMOSTRA, alvo);
    novas.forEach((r, i) => {
      expect(r.vertDispMm).toBeCloseTo(alvo[i], 9);
      expect(r.shearForce).toBe(LEITURAS[i].shearForce);
    });
  });

  it("restaurar devolve exatamente o vertDispMm medido", () => {
    const cp = cpCom();
    const originais = ADAPTADOR_DESLOCAMENTO_VERTICAL.originais(cp);
    const ajustadas = ADAPTADOR_DESLOCAMENTO_VERTICAL.aplicar(cp, AMOSTRA, LEITURAS.map(() => 9.9));
    const voltou = ADAPTADOR_DESLOCAMENTO_VERTICAL.restaurar({ ...cp, shearData: ajustadas }, originais);
    voltou.forEach((r, i) => expect(r.vertDispMm).toBe(LEITURAS[i].vertDispMm));
  });

  it("mudar δv NÃO desatualiza uma τ já ajustada (área não depende de δv)", () => {
    const cp = cpCom();
    const tauAntes = tausDe(cp);
    const comTauAjustada = { ...cp, shearData: ADAPTADOR_TENSAO_CISALHANTE.aplicar(cp, AMOSTRA, tauAntes) };
    const comDvAjustado = {
      ...comTauAjustada,
      shearData: ADAPTADOR_DESLOCAMENTO_VERTICAL.aplicar(comTauAjustada, AMOSTRA, LEITURAS.map((r) => r.vertDispMm + 1)),
    };
    const tauDepois = tausDe(comDvAjustado);
    tauDepois.forEach((v, i) => expect(v).toBeCloseTo(tauAntes[i], 9));
  });
});

describe("a cascata chega no pico do CP", () => {
  it("corrigir a queda espúria muda a τ daquele ponto na curva", () => {
    const cp = cpCom();
    const antes = processSpecimen(cp, AMOSTRA);
    const alvo = tausDe(cp);
    alvo[4] = (alvo[3] + alvo[5]) / 2;
    const depois = processSpecimen({ ...cp, shearData: ADAPTADOR_TENSAO_CISALHANTE.aplicar(cp, AMOSTRA, alvo) }, AMOSTRA);
    expect(depois.curve[4].shearStress).toBeGreaterThan(antes.curve[4].shearStress);
    // O pico global desta ficha vem do último ponto (fora do "vale" corrigido); a
    // correção só passa a valer se, em algum outro ensaio, o pico caísse ali.
    expect(depois.tauPeak).toBeCloseTo(antes.tauPeak, 6);
  });

  it("subir a curva inteira sobe o pico", () => {
    const cp = cpCom();
    const antes = processSpecimen(cp, AMOSTRA);
    const depois = processSpecimen(
      { ...cp, shearData: ADAPTADOR_TENSAO_CISALHANTE.aplicar(cp, AMOSTRA, tausDe(cp).map((v) => v * 1.1)) },
      AMOSTRA,
    );
    expect(depois.tauPeak).toBeGreaterThan(antes.tauPeak);
    expect(depois.tauPeak / antes.tauPeak).toBeCloseTo(1.1, 3);
  });
});
