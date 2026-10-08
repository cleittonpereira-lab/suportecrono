import { describe, expect, it } from "vitest";
import { acharAmostra, mesmaAmostra, normProfundidade } from "./identidade-amostra";

// O caso real (OS 17948-26, 08/10): duas coletas do furo SH-02-189.
const am02 = { id: "a", reportNumber: "SH-02-189", code: "13690-02", depth: "2.00 – 2.80 m" };
const am03 = { id: "b", reportNumber: "SH-02-189", code: "13690-03", depth: "5.00 – 5.80 m" };
// Amostra criada pelo Gantt antes de alguém dar nome: nome = código.
const legado = { id: "c", reportNumber: "13690-04", code: "13690-04", depth: "7.00 – 7.80 m" };

describe("normProfundidade", () => {
  it("compara pelos números, não pelo formato", () => {
    expect(normProfundidade("5.00 – 5.80 m")).toBe(normProfundidade("5,00-5,8"));
    expect(normProfundidade("5.00 – 5.80 m")).not.toBe(normProfundidade("2.00 – 2.80 m"));
    expect(normProfundidade("")).toBe("");
  });
});

describe("mesmaAmostra", () => {
  it("mesmo nome, outro código e outra profundidade: amostras diferentes", () => {
    expect(mesmaAmostra(am02, { nome: "SH-02-189", codigo: "13690-03", prof: "5.00 – 5.80 m" })).toBe(false);
  });

  it("mesmo nome e código, profundidade diferente: amostras diferentes", () => {
    expect(mesmaAmostra(am02, { nome: "SH-02-189", codigo: "13690-02", prof: "5.00 – 5.80 m" })).toBe(false);
  });

  it("o Gantt manda código e profundidade: acha a amostra mesmo com nome dado depois", () => {
    expect(mesmaAmostra(am03, { codigo: "13690-03", prof: "5.00 – 5.80 m" })).toBe(true);
  });

  it("amostra antiga com nome = código aceita o nome novo quando o código bate", () => {
    expect(mesmaAmostra(legado, { nome: "SH-03-189", codigo: "13690-04", prof: "7.00-7.80" })).toBe(true);
  });

  it("só o nome não basta para casar com uma amostra de outro código", () => {
    expect(mesmaAmostra(am02, { nome: "SH-02-189", codigo: "13690-99" })).toBe(false);
  });
});

describe("acharAmostra", () => {
  const amostras = [am02, am03, legado];

  it("acha pelo conjunto código + nome + profundidade", () => {
    const r = acharAmostra(amostras, { nome: "SH-02-189", codigo: "13690-03", prof: "5.00 – 5.80 m" });
    expect(r).toEqual({ tipo: "encontrada", amostra: am03 });
  });

  it("coleta nova com nome repetido: nenhuma (cria outra amostra, não grava por cima)", () => {
    const r = acharAmostra(amostras, { nome: "SH-02-189", codigo: "13690-05", prof: "8.00 – 8.80 m" });
    expect(r.tipo).toBe("nenhuma");
  });

  it("pendência antiga só com o nome repetido: ambígua, não escolhe", () => {
    const r = acharAmostra(amostras, { qualquer: "SH-02-189" });
    expect(r.tipo).toBe("ambigua");
  });

  it("pendência antiga com o código: acha a única", () => {
    expect(acharAmostra(amostras, { qualquer: "13690-02" })).toEqual({ tipo: "encontrada", amostra: am02 });
  });
});
