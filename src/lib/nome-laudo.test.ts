import { describe, expect, it } from "vitest";
import { limparProfundidade, nomeDoArquivoDoLaudo, siglaDoEnsaio } from "./nome-laudo";

describe("nome oficial do arquivo do laudo", () => {
  it("OS_Amostra_Furo_Prof_Sigla_Rev-NN", () => {
    expect(
      nomeDoArquivoDoLaudo({
        os: "17700-26",
        amostra: "13314-089",
        furo: "SH-07",
        prof: "6.00 – 6.70 m",
        sigla: siglaDoEnsaio({ label: "Permeabilidade a Carga Variável (PERM.V)", tipo: "perm-v" }),
        rev: 0,
        ext: "pdf",
      }),
    ).toBe("17700-26_13314-089_SH-07_6.00-6.70_PERM.V_Rev-00.pdf");
  });

  it("parte vazia é omitida, sem '__'", () => {
    expect(nomeDoArquivoDoLaudo({ os: "17700-26", amostra: "13314-089", furo: "", prof: null, sigla: "PERM.V", rev: 2, ext: "pdf" })).toBe(
      "17700-26_13314-089_PERM.V_Rev-02.pdf",
    );
  });

  it("tira caracteres proibidos e o separador de dentro das partes", () => {
    expect(nomeDoArquivoDoLaudo({ os: "17700/26", amostra: "AM_01", furo: "SP 03", prof: "1,00 a 1,45", sigla: "CD4.IN", rev: 1, ext: "xlsx" })).toBe(
      "17700-26_AM-01_SP-03_1,00-a-1,45_CD4.IN_Rev-01.xlsx",
    );
  });

  it("continua reconhecido como revisão pelo servidor (Rev-NN.pdf no fim)", () => {
    const nome = nomeDoArquivoDoLaudo({ os: "1", amostra: "2", sigla: "AD", rev: 12, ext: "pdf" });
    expect(/Rev-?(\d+)\.pdf$/i.exec(nome)?.[1]).toBe("12");
  });

  it("profundidade sem a unidade", () => {
    expect(limparProfundidade("6.00 – 6.70 m")).toBe("6.00-6.70");
    expect(limparProfundidade("2,5m")).toBe("2,5");
  });
});

describe("sigla do ensaio", () => {
  it("usa a sigla do Gantt quando o registro tem", () => {
    expect(siglaDoEnsaio({ sigla: "CD4.IN", tipo: "cisalhamento-direto" })).toBe("CD4.IN");
    expect(siglaDoEnsaio({ sigla: "adens.i.9" })).toBe("ADENS.I.9");
  });

  it("acha a sigla no nome do ensaio", () => {
    expect(siglaDoEnsaio({ label: "Densidade Aparente — ASF.DAP (DNIT 428/2022-ME)", tipo: "asf-dap" })).toBe("ASF.DAP");
    expect(siglaDoEnsaio({ sigla: "Massa Específica Aparente Natural (M.ESP.A)" })).toBe("M.ESP.A");
  });

  it("sem sigla, usa a do tipo", () => {
    expect(siglaDoEnsaio({ tipo: "adensamento", label: "Adensamento Edométrico" })).toBe("ADENS");
    expect(siglaDoEnsaio({ tipo: "tipo-novo" })).toBe("TIPO-NOVO");
  });
});
