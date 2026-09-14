import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { assertPdfValido } from "./report-pdf";

function pdfCom(paginas: number): Blob {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  for (let p = 0; p < paginas; p++) {
    if (p > 0) pdf.addPage();
    for (let l = 0; l < 60; l++) pdf.text(`Página ${p + 1} — linha ${l} de conteúdo do laudo de ensaio`, 10, 10 + l * 4);
  }
  return pdf.output("blob");
}

describe("assertPdfValido", () => {
  it("aceita um PDF real com o número de páginas esperado", async () => {
    await expect(assertPdfValido(pdfCom(3), "teste", 3)).resolves.toBeUndefined();
  });

  it("recusa o 'PDF' de 45 bytes que o adensamento gravava quando a captura falhava", async () => {
    const falso = new Blob(["%PDF-1.4 ... Relatório Oficial Suporte INFRA"], { type: "application/pdf" });
    await expect(assertPdfValido(falso, "Adensamento")).rejects.toThrow(/vazio/);
  });

  it("recusa arquivo que não é PDF", async () => {
    const png = new Blob([new Uint8Array(10_000)], { type: "image/png" });
    await expect(assertPdfValido(png, "teste")).rejects.toThrow(/não é um PDF/);
  });

  it("recusa PDF com menos páginas que o laudo renderizou", async () => {
    await expect(assertPdfValido(pdfCom(1), "teste", 3)).rejects.toThrow(/1 página/);
  });
});
