import { describe, expect, it } from "vitest";
import {
  areaCp, avg, calcCorpoDeProva, capsulaUmidadePct, cargaParaN, grauDeSaturacao,
  indiceDeVazios, isCompressaoDiametralTag, kpaParaMpa, massaEspecificaNatural,
  massaEspecificaSeca, mediaCps, nParaKgf, parseCompressaoDiametralTag, porosidade,
  teorUmidadeMedio, tensaoTracaoKPa, volumeCp,
} from "./calc";
import { newCdCorpoDeProva, type CdCapsula, type CdCorpoDeProva } from "./types";

const cp = (patch: Partial<CdCorpoDeProva>): CdCorpoDeProva => ({ ...newCdCorpoDeProva("CP01"), ...patch });
const capsula = (patch: Partial<CdCapsula>): CdCapsula => ({ numero: "1", tara: 0, wet: 0, dry: 0, ...patch });

describe("reconhecimento da etiqueta/QR", () => {
  it("ASF.CD (asfalto), sem idade de cura", () => {
    expect(parseCompressaoDiametralTag("ASF.CD")).toEqual({ amostraTipo: "asfalto", idadeCuraDias: null });
    expect(parseCompressaoDiametralTag("asf.cd")).toEqual({ amostraTipo: "asfalto", idadeCuraDias: null });
    expect(parseCompressaoDiametralTag(" ASF.CD ")).toEqual({ amostraTipo: "asfalto", idadeCuraDias: null });
  });
  it("COMP.D (dosagem), com e sem idade de cura", () => {
    expect(parseCompressaoDiametralTag("COMP.D")).toEqual({ amostraTipo: "dosagem", idadeCuraDias: null });
    expect(parseCompressaoDiametralTag("COMP.D.7")).toEqual({ amostraTipo: "dosagem", idadeCuraDias: 7 });
    expect(parseCompressaoDiametralTag("comp.d.28")).toEqual({ amostraTipo: "dosagem", idadeCuraDias: 28 });
  });
  it("rejeita siglas de outros ensaios (inclusive Compressão Simples, que também começa com COMP)", () => {
    expect(parseCompressaoDiametralTag("COMP.A")).toBeNull();
    expect(parseCompressaoDiametralTag("COMP.S.7")).toBeNull();
    expect(parseCompressaoDiametralTag("ASF.DAP")).toBeNull();
    expect(parseCompressaoDiametralTag(null)).toBeNull();
    expect(parseCompressaoDiametralTag("")).toBeNull();
  });
  it("isCompressaoDiametralTag espelha o parse", () => {
    expect(isCompressaoDiametralTag("ASF.CD")).toBe(true);
    expect(isCompressaoDiametralTag("COMP.D.3")).toBe(true);
    expect(isCompressaoDiametralTag("COMP.A")).toBe(false);
  });
});

describe("umidade das cápsulas", () => {
  it("teor de umidade de uma cápsula", () => {
    // tara 20, seco+tara 45 (ms=25), úmido+tara 50 (mw=5) -> w = 5/25*100 = 20%
    expect(capsulaUmidadePct(capsula({ tara: 20, wet: 50, dry: 45 }))).toBeCloseTo(20, 9);
  });
  it("cápsula sem massa seca válida devolve null", () => {
    expect(capsulaUmidadePct(capsula({ tara: 20, wet: 20, dry: 20 }))).toBeNull();
  });
  it("média ignora cápsulas inválidas", () => {
    const cs = [capsula({ tara: 20, wet: 50, dry: 45 }), capsula({ tara: 0, wet: 0, dry: 0 }), capsula({ tara: 10, wet: 40, dry: 34 })];
    // w1=20%, w2=inválida, w3=(40-34)/(34-10)*100=25%
    expect(teorUmidadeMedio(cs)).toBeCloseTo(22.5, 9);
  });
});

describe("geometria e massa específica", () => {
  it("área e volume a partir do diâmetro/altura médios", () => {
    expect(areaCp(10)).toBeCloseTo((Math.PI / 4) * 100, 9);
    expect(volumeCp(78.54, 5)).toBeCloseTo(392.7, 1);
  });
  it("massa específica natural e seca", () => {
    const gamaNat = massaEspecificaNatural(500, 250); // 2 g/cm3
    expect(gamaNat).toBeCloseTo(2, 9);
    expect(massaEspecificaSeca(gamaNat, 25)).toBeCloseTo(1.6, 9); // 2/(1+0.25)
  });
  it("índice de vazios, porosidade e grau de saturação", () => {
    const ei = indiceDeVazios(2.65, 1.6); // 2.65/1.6 - 1 = 0.65625
    expect(ei).toBeCloseTo(0.65625, 9);
    expect(porosidade(ei!)).toBeCloseTo((0.65625 / 1.65625) * 100, 6);
    expect(grauDeSaturacao(25, 2.65, ei!)).toBeCloseTo((25 * 2.65) / (0.65625 * 100) * 100, 6);
  });
  it("avg ignora valores não numéricos/≤0", () => {
    expect(avg([5, 6, 0, -1, NaN as unknown as number, 7])).toBeCloseTo(6, 9);
    expect(avg([])).toBeNull();
  });
});

describe("conversão de carga e tensão de tração (RT = 2P/(πDH))", () => {
  it("carga em kN/kgf/N vira N", () => {
    expect(cargaParaN(1, "kN")).toBeCloseTo(1000, 9);
    expect(cargaParaN(1, "N")).toBeCloseTo(1, 9);
    expect(nParaKgf(cargaParaN(1, "kgf")!)).toBeCloseTo(1, 9);
  });
  it("RT bate com a fórmula do ensaio brasileiro, D=10cm, H=5cm, P=10000N", () => {
    // RT = 2*10000/(pi*10*5) = 127.3239545 N/cm2 = 1273.239545 kPa
    const rt = tensaoTracaoKPa(10000, 10, 5);
    expect(rt).toBeCloseTo(1273.2395447351628, 6);
    expect(kpaParaMpa(rt)).toBeCloseTo(1.2732395447351628, 6);
  });
  it("sem diâmetro/altura válidos, devolve null", () => {
    expect(tensaoTracaoKPa(1000, null, 5)).toBeNull();
    expect(tensaoTracaoKPa(1000, 10, 0)).toBeNull();
  });
});

describe("calcCorpoDeProva — asfalto (sem índices físicos)", () => {
  it("não calcula w/γd/e/SR mesmo com cápsulas preenchidas", () => {
    const c = cp({
      alturas: [5, 5, 5, 5], diametros: [10, 10, 10, 10], massaInicial: 900,
      capsulas: [capsula({ tara: 20, wet: 50, dry: 45 })],
      picoCarga: 10, picoCargaUnidade: "kN",
    });
    const r = calcCorpoDeProva(c, { comIndices: false, gs: 2.65 });
    expect(r.alturaMedia).toBeCloseTo(5, 9);
    expect(r.diametroMedia).toBeCloseTo(10, 9);
    expect(r.w).toBeNull();
    expect(r.gamaD).toBeNull();
    expect(r.ei).toBeNull();
    expect(r.sr).toBeNull();
    expect(r.rtKPa).toBeCloseTo(1273.2395447351628, 6);
  });
});

describe("calcCorpoDeProva — dosagem (com índices físicos)", () => {
  it("calcula w/γnat/γd/e/n/SR a partir das cápsulas e do Gs informado", () => {
    const volume = (Math.PI / 4) * 10 ** 2 * 5; // area * altura, D=10cm H=5cm
    const c = cp({
      alturas: [5, 5, 5, 5], diametros: [10, 10, 10, 10], massaInicial: 2.5 * volume, // gamaNat exato = 2.5
      capsulas: [capsula({ tara: 20, wet: 50, dry: 45 })], // w = 20%
      picoCarga: 8, picoCargaUnidade: "kN",
    });
    const r = calcCorpoDeProva(c, { comIndices: true, gs: 2.7 });
    expect(r.gamaNat).toBeCloseTo(2.5, 6);
    expect(r.w).toBeCloseTo(20, 9);
    expect(r.gamaD).toBeCloseTo(2.5 / 1.2, 3); // gamaNat/(1+w/100)
    expect(r.ei).not.toBeNull();
    expect(r.n).not.toBeNull();
    expect(r.sr).not.toBeNull();
    expect(r.rtKPa).toBeCloseTo(1018.5916357881303, 3); // 2*8000/(pi*10*5)*10
  });
});

describe("mediaCps", () => {
  it("média de RT e γd/w entre CPs", () => {
    const r1 = calcCorpoDeProva(cp({ alturas: [5, 5, 5, 5], diametros: [10, 10, 10, 10], picoCarga: 8, picoCargaUnidade: "kN" }), { comIndices: false, gs: null });
    const r2 = calcCorpoDeProva(cp({ alturas: [5, 5, 5, 5], diametros: [10, 10, 10, 10], picoCarga: 10, picoCargaUnidade: "kN" }), { comIndices: false, gs: null });
    const m = mediaCps([r1, r2]);
    expect(m.rtKPa).toBeCloseTo((r1.rtKPa! + r2.rtKPa!) / 2, 6);
  });
  it("lista vazia devolve tudo null", () => {
    expect(mediaCps([])).toEqual({ rtKPa: null, rtMPa: null, gamaD: null, w: null });
  });
});
