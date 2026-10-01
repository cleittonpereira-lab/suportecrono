import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { gerarPdfDaAta, paraLatin1 } from "./ata-pdf";
import { novoItem, type Reuniao } from "@/lib/atas-qualidade";

const AGORA = "2026-10-01T12:00:00.000Z";

function reuniao(p: Partial<Reuniao> & { id: string; numero: number; data: string }): Reuniao {
  return {
    grupo: "Grupo de trabalho ISO 17025", titulo: `Reunião nº ${p.numero}`, horaInicio: "09:00", horaFim: "10:30",
    local: "Sala de reuniões", pauta: "Revisão dos POPs", observacoes: "Próxima reunião em 15 dias.",
    participantes: [
      { nome: "Ana Souza", presente: true, funcao: "Qualidade", externo: false },
      { nome: "Caio Lima", presente: false, funcao: "", externo: true },
    ],
    itens: [], status: "encerrada", redator: "Ana Souza", criadaPor: "Ana Souza", criadaEm: AGORA, atualizadaEm: AGORA,
    encerradaEm: AGORA, encerradaPor: "Ana Souza", ...p,
  };
}

function logoDeTeste() {
  const png = readFileSync("public/suporte-infra-logo.png");
  return { url: `data:image/png;base64,${png.toString("base64")}`, w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
}

describe("PDF da ata", () => {
  it("gera um PDF válido com os dados, os itens e as pendências", async () => {
    const itens = Array.from({ length: 30 }, (_, i) =>
      novoItem(
        { descricao: `Ação ${i + 1}: revisar o procedimento de calibração número ${i + 1} e registrar evidências → conforme ≥ requisito`, responsaveis: ["Ana Souza", "Caio Lima"], prazo: "2026-09-20", status: i % 3 === 0 ? "concluida" : "pendente" },
        "Ana Souza", AGORA, `item-${i}-xxxxxxxx`,
      ),
    );
    const anterior = reuniao({ id: "r1xxxxxxxx", numero: 1, data: "2026-09-01", itens: [novoItem({ descricao: "Decidir o escopo", tipo: "decisao" }, "Ana", AGORA, "d1xxxxxxxx")] });
    const atual = reuniao({ id: "r2xxxxxxxx", numero: 2, data: "2026-10-01", itens });
    const { blob, nome } = await gerarPdfDaAta({
      reuniao: atual, anterior,
      pendencias: itens.filter((i) => i.status === "pendente").map((item) => ({ reuniao: atual, item })),
      hoje: "2026-10-01", geradoPor: "Teste", logo: logoDeTeste(),
    });
    expect(nome).toBe("Ata_Grupo_de_trabalho_ISO_17025_02_2026-10-01.pdf");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const texto = new TextDecoder("latin1").decode(bytes);
    expect(texto.startsWith("%PDF-")).toBe(true);
    expect((texto.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
    expect(texto).toContain("ATA DE REUNI");
    expect(texto).toContain("SUPORTE INFRA");
    expect(texto).not.toContain("ENSAIOS ESPECIAIS");
    expect(texto).toContain("Caio Lima");
    expect(texto).toContain("Ausente");
    if (process.env.SALVAR_PDF_DE_TESTE) writeFileSync(process.env.SALVAR_PDF_DE_TESTE, bytes);
  });

  it("troca o que a fonte do PDF não desenha", () => {
    expect(paraLatin1("a → b ≥ c “x” ação")).toBe('a -> b >= c "x" ação');
  });
});
