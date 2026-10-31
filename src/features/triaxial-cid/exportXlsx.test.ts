import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildSampleTriE005_382 } from "./samples/tri-e-005-382";
import { fitEnvelope, processSpecimen } from "./domain/calc";
import { buildTriaxialUuXlsxWorkbook, nomeDaAba, type ExportSample } from "./exportXlsx";
import type { TriaxialSample, TriaxialSpecimen } from "./types";

/** Ensaio UU de exemplo: 2 CPs do sample real do OWNTEC, sem fases de adensamento controladas. */
function montaParametros() {
  const sample = {
    client: "Cliente Teste",
    workNumber: "OBRA-TESTE",
    reportNumber: "AM-TESTE",
    borehole: "SH-01",
    depth: "1,00 – 1,50 m",
    local: "Local Teste",
    date: "2026-10-29",
    revision: "00",
    operator: "Operador Teste",
    technicalResp: "Engº Teste — CREA: 0000",
    typedBy: "Digitador Teste",
    description: "Argila siltosa marrom",
    code: "TRI-UU-001",
    os: "17700-26",
    granulometricDescription: "",
    condition: "natural",
    testType: "uu",
    sampleType: "Indeformada",
    equipment: "TRIAX-05 · OWNTEC",
    specDimensions: "50x100 mm",
    Gs: 2.7,
    rhoW: 1,
    applyMembrane: false,
    membraneE: 1400,
    membraneT: 0.5,
    coordN: "7400000",
    coordE: "300000",
    coordCota: "512",
    coordDatum: "SIRGAS 2000",
  } as unknown as ExportSample & TriaxialSample;

  const cp1: TriaxialSpecimen = { ...buildSampleTriE005_382(0), id: "CP1", displayId: "CP1", sigma3Target: 200, backPressure: 0 };
  const cp2: TriaxialSpecimen = { ...buildSampleTriE005_382(1), id: "CP2", displayId: "CP2", sigma3Target: 400, backPressure: 0 };
  const specimens = [cp1, cp2];
  const results = specimens.map((cp) => processSpecimen(cp, sample));
  const envelopePts = results
    .map((r, i) => (r.failure ? { pPrime: r.failure.pPrime, q: r.failure.q, cp: specimens[i].id } : null))
    .filter((x): x is { pPrime: number; q: number; cp: string } => x != null);
  const envelope = fitEnvelope(envelopePts);
  return { sample, specimens, results, envelope, envelopePts };
}

/** Textos de todas as células (texto simples e trechos formatados). */
function textosDaFolha(ws: ExcelJS.Worksheet): string[] {
  const textos: string[] = [];
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      const v = cell.value as unknown;
      if (typeof v === "string") textos.push(v);
      else if (v && typeof v === "object" && "richText" in (v as object)) {
        textos.push((v as { richText: { text: string }[] }).richText.map((t) => t.text).join(""));
      }
    });
  });
  return textos;
}

/** Quebras de página gravadas pelo exportador (o leitor do exceljs não as devolve). */
const quebrasDe = (ws: ExcelJS.Worksheet) => ((ws as unknown as { rowBreaks: { id: number }[] }).rowBreaks ?? []).map((q) => q.id);

/** Células com o rodapé "Folha: n / total", com a linha e a coluna onde estão na grade. */
function folhasNaGrade(ws: ExcelJS.Worksheet) {
  const achados: { linha: number; coluna: number; texto: string }[] = [];
  ws.eachRow((row, linha) => {
    row.eachCell((cell, coluna) => {
      const v = cell.value as unknown;
      const texto = typeof v === "string"
        ? v
        : v && typeof v === "object" && "richText" in v
          ? (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("")
          : "";
      if (texto.startsWith("Folha:")) achados.push({ linha, coluna, texto });
    });
  });
  return achados;
}

describe("exportXlsx — Triaxial UU", () => {
  it("organiza as nove folhas em cinco faixas, a folha da esquerda ao lado da da direita", async () => {
    const wb = await buildTriaxialUuXlsxWorkbook({ ...montaParametros(), semGraficos: true });
    const ws = wb.getWorksheet("Laudo Triaxial UU");
    expect(ws).toBeDefined();
    // 9 folhas em pares (1|2, 3|4, 5|6, 7|8, 9): uma quebra por faixa, 1084 px = 813 pt cada.
    expect(quebrasDe(ws!)).toEqual([1084, 2168, 3252, 4336, 5420]);
    const folhas = folhasNaGrade(ws!);
    const folha = (n: number) => folhas.find((f) => f.texto.endsWith(` ${n} / 9`))!;
    expect(folha(1).coluna).toBeLessThanOrEqual(60);
    expect(folha(2).coluna).toBeGreaterThan(60);
    expect(folha(2).linha).toBe(folha(1).linha);
    expect(folha(3).linha).toBeGreaterThan(1084);
    expect(folha(4).linha).toBe(folha(3).linha);
    expect(folha(4).coluna).toBeGreaterThan(60);
  });

  it("nomeia a aba do laudo como REL-(nome do arquivo), com no máximo 31 caracteres", () => {
    expect(nomeDaAba("18279-26_14198-02_SH-F-KM360-01_1.50-1.50_TRI.UU_Rev-00.xlsx")).toBe("REL-18279-26_14198-02_SH-F-KM36");
    expect(nomeDaAba("A/B:C.xlsx")).toBe("REL-A-B-C");
    expect(nomeDaAba()).toBe("Laudo Triaxial UU");
  });

  it("traz a aba Dados Brutos com as massas, as leituras e a altura de cada CP", async () => {
    const wb = await buildTriaxialUuXlsxWorkbook({ ...montaParametros(), semGraficos: true });
    const ws = wb.getWorksheet("Dados Brutos");
    expect(ws).toBeDefined();
    const todo = textosDaFolha(ws!).join("\n");
    expect(todo).toContain("CP1 · σ₃ = 200 kPa");
    expect(todo).toContain("Altura média inicial, H0");
    expect(todo).toContain("Massa úmida do CP");
    expect(todo).toContain("Δh (mm)");
  });

  it("cada folha soma exatamente 813 pt de linhas (uma folha A4 do PDF)", async () => {
    const wb = await buildTriaxialUuXlsxWorkbook({ ...montaParametros(), semGraficos: true });
    const ws = wb.getWorksheet("Laudo Triaxial UU")!;
    let inicio = 1;
    for (const fim of quebrasDe(ws)) {
      let soma = 0;
      for (let r = inicio; r <= fim; r++) soma += ws.getRow(r).height ?? 0;
      expect(soma).toBeCloseTo(813, 0);
      inicio = fim + 1;
    }
  });

  it("traz os textos e números do relatório (cabeçalho, capa, resumo, glossário)", async () => {
    const wb = await buildTriaxialUuXlsxWorkbook({ ...montaParametros(), semGraficos: true });
    const todo = textosDaFolha(wb.getWorksheet("Laudo Triaxial UU")!).join("\n");
    expect(todo).toContain("ENSAIO TRIAXIAL NÃO CONSOLIDADO NÃO DRENADO (UU)");
    expect(todo).toContain("Compressão Triaxial Não Consolidado Não Drenado - UU");
    expect(todo).toContain("ASTM D2850:2015");
    expect(todo).not.toContain("NBR 12770");
    expect(todo).toContain("QUADRO RESUMO DOS RESULTADOS");
    expect(todo).toContain("CP1 · σ₃=200 kPa");
    expect(todo).toContain("CP2 · σ₃=400 kPa");
    expect(todo).toContain("FORMULAÇÕES E CONVENÇÕES (2/2)");
    expect(todo).toContain("Caracterização Tátil-Visual");
    expect(todo).toContain("Folha:");
  });

  it("não traz variação de volume nem poropressão (o UU não tem essas grandezas)", async () => {
    const wb = await buildTriaxialUuXlsxWorkbook({ ...montaParametros(), semGraficos: true });
    const todo = textosDaFolha(wb.getWorksheet("Laudo Triaxial UU")!).join("\n");
    expect(todo).not.toContain("Controle Volumétrico");
    expect(todo).not.toContain("Variação Volumétrica");
    expect(todo).not.toContain("REDUÇÃO DE VOLUME");
    expect(todo).not.toContain("Adensamento (isotrópico)");
    expect(todo).toContain("A = A₀ / (1 − εa)");
    expect(todo).toContain("POROPRESSÃO (U) VERSUS DEFORMAÇÃO AXIAL ESPECÍFICA — CP1");
    expect(todo).toContain("REGISTRO FOTOGRÁFICO APÓS A RUPTURA");
  });
});
