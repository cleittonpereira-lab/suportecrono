import { describe, expect, it } from "vitest";
import { nomeDoArquivoDoLaudo } from "./nome-laudo";
import {
  laudoDeOutraAmostra,
  nomeAntigoDaPastaDaAmostra,
  nomeDaPastaDaAmostra,
  prefixoDoLaudo,
  type IdentidadeDoLaudo,
} from "./pasta-amostra";

// OS 17948-26 (08/10): duas amostras SH-02-189, códigos e profundidades diferentes.
const am02 = { reportNumber: "SH-02-189", code: "13690-02", borehole: "SH-02", depth: "2.00 – 2.80 m" };
const am03 = { reportNumber: "SH-02-189", code: "13690-03", borehole: "SH-02", depth: "5.00 – 5.80 m" };

function id(am: typeof am02): IdentidadeDoLaudo {
  return { os: "17948-26", amostra: am.reportNumber || am.code, furo: am.borehole, prof: am.depth, sigla: "PERM.V" };
}

function laudo(am: typeof am02, rev: number, ext: "pdf" | "xlsx" = "pdf"): string {
  return nomeDoArquivoDoLaudo({ ...id(am), rev, ext });
}

describe("pasta da amostra no Drive", () => {
  it("duas amostras de mesmo nome e códigos diferentes ganham pastas diferentes", () => {
    expect(nomeDaPastaDaAmostra(am02)).toBe("SH-02-189 (13690-02)");
    expect(nomeDaPastaDaAmostra(am03)).toBe("SH-02-189 (13690-03)");
  });

  it("a pasta antiga era a mesma para as duas", () => {
    expect(nomeAntigoDaPastaDaAmostra(am02)).toBe("SH-02-189");
    expect(nomeAntigoDaPastaDaAmostra(am03)).toBe("SH-02-189");
  });

  it("nome igual ao código (ou só um dos dois): continua a pasta antiga", () => {
    expect(nomeDaPastaDaAmostra({ reportNumber: "13314-089", code: "13314-089" })).toBe("13314-089");
    expect(nomeDaPastaDaAmostra({ reportNumber: " 13314-089 ", code: "13314-089" })).toBe("13314-089");
    expect(nomeDaPastaDaAmostra({ reportNumber: "", code: "13314-089" })).toBe("13314-089");
    expect(nomeDaPastaDaAmostra({ reportNumber: "SH-07", code: null })).toBe("SH-07");
    expect(nomeDaPastaDaAmostra({})).toBe("Amostra-sem-codigo");
  });

  it("tira os caracteres proibidos no Drive", () => {
    expect(nomeDaPastaDaAmostra({ reportNumber: "AM/01", code: "13690:04" })).toBe("AM-01 (13690-04)");
  });
});

describe("laudos de outra amostra na pasta antiga", () => {
  it("prefixo é o nome oficial sem a revisão", () => {
    expect(prefixoDoLaudo(id(am03))).toBe("17948-26_SH-02-189_SH-02_5.00-5.80_PERM.V");
  });

  it("separa as revisões das duas SH-02-189 pela profundidade do nome oficial", () => {
    const pasta = [laudo(am02, 0), laudo(am02, 0, "xlsx"), laudo(am02, 1), laudo(am03, 0)];
    const de03 = pasta.filter((f) => !laudoDeOutraAmostra(f, id(am03)));
    const de02 = pasta.filter((f) => !laudoDeOutraAmostra(f, id(am02)));
    expect(de03).toEqual([laudo(am03, 0)]);
    expect(de02).toEqual([laudo(am02, 0), laudo(am02, 0, "xlsx"), laudo(am02, 1)]);
  });

  it("pasta antiga de uma amostra só: todas as revisões continuam dela", () => {
    const pasta = ["17948-26_SH-02-189_SH-02_2.00-2.80_PERM.V_Rev-00.pdf", "17948-26_SH-02-189_SH-02_2.00-2.80_PERM.V_Rev-01.pdf"];
    expect(pasta.filter((f) => !laudoDeOutraAmostra(f, id(am02)))).toEqual(pasta);
  });

  it("nomes antigos de cada tela (fora do padrão oficial) continuam contando", () => {
    expect(laudoDeOutraAmostra("PERM-V_17948-26_Rev-00.pdf", id(am03))).toBe(false);
    expect(laudoDeOutraAmostra("ADENSAMENTO_17948-26_Rev00.pdf", id(am03))).toBe(false);
  });

  it("arquivo que não é revisão não conta como de outra amostra", () => {
    expect(laudoDeOutraAmostra("manifest.json", id(am03))).toBe(false);
  });

  it("maiúsculas/minúsculas e Rev sem hífen não mudam a decisão", () => {
    expect(laudoDeOutraAmostra("17948-26_sh-02-189_SH-02_5.00-5.80_perm.v_Rev01.PDF", id(am03))).toBe(false);
    expect(laudoDeOutraAmostra("17948-26_SH-02-189_SH-02_2.00-2.80_PERM.V_Rev01.pdf", id(am03))).toBe(true);
  });

  it("laudo de outra OS ou de outro ensaio não é tratado como outra amostra", () => {
    expect(laudoDeOutraAmostra("17000-26_SH-02-189_SH-02_2.00-2.80_PERM.V_Rev-00.pdf", id(am03))).toBe(false);
    expect(laudoDeOutraAmostra("17948-26_SH-02-189_SH-02_2.00-2.80_ADENS_Rev-00.pdf", id(am03))).toBe(false);
  });
});
