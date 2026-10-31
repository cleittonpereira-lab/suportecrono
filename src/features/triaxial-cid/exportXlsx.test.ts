import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildSampleTriE005_382 } from "./samples/tri-e-005-382";
import { fitEnvelope, processSpecimen } from "./domain/calc";
import JSZip from "jszip";
import { buildTriaxialUuXlsxWorkbook, gerarTriaxialUuXlsx, nomeDaAba, nomeDaAbaDoCp, type ExportSample } from "./exportXlsx";
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
  it("põe as nove folhas numa linha só, uma ao lado da outra (1 | 2 | 3 … | 9)", async () => {
    const wb = await buildTriaxialUuXlsxWorkbook({ ...montaParametros(), semGraficos: true });
    const ws = wb.getWorksheet("Laudo Triaxial UU");
    expect(ws).toBeDefined();
    // Uma faixa só, de 1084 px = 813 pt.
    expect(quebrasDe(ws!)).toEqual([1084]);
    const folhas = folhasNaGrade(ws!);
    const folha = (n: number) => folhas.find((f) => f.texto.endsWith(` ${n} / 9`))!;
    for (let n = 1; n <= 9; n++) {
      expect(folha(n).linha).toBe(folha(1).linha);
      // Folha n ocupa as colunas (n−1)·62+1 … (n−1)·62+60.
      expect(folha(n).coluna).toBeGreaterThan((n - 1) * 62);
      expect(folha(n).coluna).toBeLessThanOrEqual((n - 1) * 62 + 60);
    }
  });

  it("grava uma quebra de página entre cada folha e a área de impressão de todas", async () => {
    const bytes = await gerarTriaxialUuXlsx({ ...montaParametros(), semGraficos: true });
    const zip = await JSZip.loadAsync(bytes);
    const xml = (await zip.file("xl/worksheets/sheet1.xml")!.async("string"))!;
    const ids = [...xml.matchAll(/<colBreaks[^>]*>(.*?)<\/colBreaks>/g)][0][1].match(/id="(\d+)"/g)!.map((m) => Number(m.slice(4, -1)));
    expect(ids).toEqual([62, 124, 186, 248, 310, 372, 434, 496]);
    // O esquema do Excel exige <colBreaks> logo depois de <rowBreaks>.
    expect(xml.indexOf("<colBreaks")).toBeGreaterThan(xml.indexOf("</rowBreaks>"));
    const wbXml = await zip.file("xl/workbook.xml")!.async("string");
    // Até a coluna 556 = (9 − 1)·62 + 60 = "UJ".
    expect(wbXml).toMatch(/_xlnm\.Print_Area[^>]*>[^<]*\$A\$?1:\$UJ\$?1084</);
    // E o arquivo continua abrindo.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets.length).toBe(3);
  });

  it("nomeia as abas de dados brutos por CP e não repete nome", () => {
    const usados = new Set<string>();
    expect(nomeDaAbaDoCp({ id: "x", displayId: "CP01", sigma3Target: 50 }, usados)).toBe("Dados Brutos - CP01-50kPa");
    expect(nomeDaAbaDoCp({ id: "x", displayId: "CP01", sigma3Target: 50 }, usados)).toBe("Dados Brutos - CP01-50kPa (2)");
    expect(nomeDaAbaDoCp({ id: "x", displayId: "CP/03", sigma3Target: 12.5 }, usados)).toBe("Dados Brutos - CP-03-12.5kPa");
  });

  it("nomeia a aba do laudo como REL-(nome do arquivo), com no máximo 31 caracteres", () => {
    expect(nomeDaAba("18279-26_14198-02_SH-F-KM360-01_1.50-1.50_TRI.UU_Rev-00.xlsx")).toBe("REL-18279-26_14198-02_SH-F-KM36");
    expect(nomeDaAba("A/B:C.xlsx")).toBe("REL-A-B-C");
    expect(nomeDaAba()).toBe("Laudo Triaxial UU");
  });

  it("traz uma aba de dados brutos por CP, com as massas, as leituras e a altura", async () => {
    const wb = await buildTriaxialUuXlsxWorkbook({ ...montaParametros(), semGraficos: true });
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Laudo Triaxial UU",
      "Dados Brutos - CP1-200kPa",
      "Dados Brutos - CP2-400kPa",
    ]);
    const cp1 = textosDaFolha(wb.getWorksheet("Dados Brutos - CP1-200kPa")!).join("\n");
    expect(cp1).toContain("CP1 · σ₃ = 200 kPa");
    expect(cp1).not.toContain("CP2 · σ₃");
    expect(cp1).toContain("Cliente Teste");
    expect(cp1).toContain("Altura média inicial, H0");
    expect(cp1).toContain("Massa úmida do CP");
    expect(cp1).toContain("Velocidade de deformação");
    expect(cp1).toContain("Δh (mm)");
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
