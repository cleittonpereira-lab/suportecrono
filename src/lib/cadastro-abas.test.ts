import { describe, expect, it } from "vitest";
import { ABA_POR_MES, MESES, parseAbaCadastro } from "./cadastro-abas";

describe("abas da planilha de Cadastro de OS", () => {
  it("cobre o ano todo, de JAN a DEZ, em ordem", () => {
    expect(MESES).toEqual(["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"]);
  });

  it("cada mês aponta para a aba em inglês da planilha", () => {
    expect(MESES.map((m) => ABA_POR_MES[m])).toEqual([
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ]);
  });
});

describe("leitura de uma aba mensal", () => {
  // Coluna A vazia, linha 1 título, linha 2 cabeçalho, linha 3 siglas, dados a partir da linha 4.
  const aba: string[][] = [
    ["", "CADASTRO DE OS"],
    ["", "TOMADOR", "OS", "SUP", "SONDAGEM", "", "OBRA", "LOCAL", "DATA ENVIO", "PRIMEIRO RETORNO (SUPORTE)", "DATA CRIAÇÃO"],
    ["", "", "", "", "SP", "CPTU"],
    ["", "Motiva RioSP", "17586-26", "SUP-02", "12", "3,5", "Dutra", "Baixada", "02/03/2026", "04/03/2026", "01/03/2026"],
    ["", "", "17587-26"],
    ["", "EPR", "17588-26", "", "x", "0"],
  ];

  it("lê cabeçalho, siglas e linhas com tomador", () => {
    const rows = parseAbaCadastro("MAR", aba);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      mes: "MAR",
      tomador: "Motiva RioSP",
      os: "17586-26",
      sup: "SUP-02",
      obra: "Dutra",
      local: "Baixada",
      dataEnvio: "02/03/2026",
      primeiroSuporte: "04/03/2026",
      dataCriacao: "01/03/2026",
      servicos: { SP: 12, CPTU: 3.5 },
      totalHoras: 15.5,
    });
    expect(rows[1]).toMatchObject({ tomador: "EPR", servicos: {}, totalHoras: 0 });
  });

  it("aba vazia ou sem cabeçalho não gera linhas", () => {
    expect(parseAbaCadastro("JAN", [])).toEqual([]);
    expect(parseAbaCadastro("JAN", [[""], ["", "OUTRA"], [""], ["", "x"]])).toEqual([]);
  });
});
