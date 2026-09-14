import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";
import { assinaturasDaAprovacao, carimbarAssinaturas } from "./assinaturas-pdf";

const SLOTS = [
  { tipo: "verificado", pagina: 0, x: 30, y: 270, w: 45, h: 2.4, fonte: 2 },
  { tipo: "aprovado", pagina: 0, x: 30, y: 273, w: 45, h: 2.4, fonte: 2 },
];

/** PDF como o gerado pelas telas: jsPDF, com (ou sem) as marcas dos campos. */
function pdfDoLaudo(marcado = true): Uint8Array {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.text("Laudo", 20, 20);
  if (marcado) pdf.setProperties({ keywords: "suportecrono-assinaturas:" + JSON.stringify({ v: 1, slots: SLOTS }) });
  return new Uint8Array(pdf.output("arraybuffer"));
}

async function keywords(bytes: Uint8Array): Promise<string> {
  return (await PDFDocument.load(bytes)).getKeywords() ?? "";
}

describe("assinaturasDaAprovacao", () => {
  const base = {
    verified_by_name: "Ana Souza",
    verified_at: "2026-09-14T15:00:00Z",
    decided_by_name: "cleitton pereira",
    decided_at: "2026-09-15T15:00:00Z",
  };

  it("aguardando verificação: nada a escrever", () => {
    expect(assinaturasDaAprovacao({ ...base, status: "pendente_verificacao" })).toEqual({ verificado: "", aprovado: "" });
  });

  it("verificado: só o verificador, com a data", () => {
    expect(assinaturasDaAprovacao({ ...base, status: "pendente_aprovacao" })).toEqual({
      verificado: "Ana Souza · 14/09/2026",
      aprovado: "",
    });
  });

  it("aprovado: verificador e aprovador (com o título do RT)", () => {
    expect(assinaturasDaAprovacao({ ...base, status: "aprovado" })).toEqual({
      verificado: "Ana Souza · 14/09/2026",
      aprovado: "Engº Geotécnico Cleitton Pereira · 15/09/2026",
    });
  });
});

describe("carimbarAssinaturas", () => {
  it("escreve, anota no PDF o que escreveu e não repete", async () => {
    const primeira = await carimbarAssinaturas(pdfDoLaudo(), { verificado: "Ana Souza · 14/09/2026", aprovado: "" });
    expect(primeira.mudou).toBe(true);
    expect(await keywords(primeira.bytes)).toContain("Ana Souza");

    const denovo = await carimbarAssinaturas(primeira.bytes, { verificado: "Ana Souza · 14/09/2026", aprovado: "" });
    expect(denovo.mudou).toBe(false);

    const aprovado = await carimbarAssinaturas(primeira.bytes, {
      verificado: "Ana Souza · 14/09/2026",
      aprovado: "Engº Geotécnico Cleitton Pereira · 15/09/2026",
    });
    expect(aprovado.mudou).toBe(true);
    const kw = await keywords(aprovado.bytes);
    expect(kw).toContain("Ana Souza");
    expect(kw).toContain("Cleitton Pereira");
    // Continua um PDF de uma página.
    expect((await PDFDocument.load(aprovado.bytes)).getPageCount()).toBe(1);
  });

  it("rejeição depois da verificação apaga o nome do verificador", async () => {
    const verificado = await carimbarAssinaturas(pdfDoLaudo(), { verificado: "Ana Souza · 14/09/2026", aprovado: "" });
    const rejeitado = await carimbarAssinaturas(verificado.bytes, { verificado: "", aprovado: "" });
    expect(rejeitado.mudou).toBe(true);
    expect(await keywords(rejeitado.bytes)).not.toContain("Ana Souza");
  });

  it("PDF antigo, sem as marcas, não é alterado", async () => {
    const original = pdfDoLaudo(false);
    const r = await carimbarAssinaturas(original, { verificado: "Ana Souza", aprovado: "" });
    expect(r).toMatchObject({ semMarcas: true, mudou: false });
    expect(r.bytes).toBe(original);
  });

  it("nome com letra fora da fonte padrão não quebra o carimbo", async () => {
    const r = await carimbarAssinaturas(pdfDoLaudo(), { verificado: "Łukasz Nowak", aprovado: "" });
    expect(r.mudou).toBe(true);
  });
});
