import { describe, expect, it } from "vitest";
import { acharCopiasPendentes } from "./programacao-copias";

const amostras = new Map([
  ["a1", { os_numero: "17808-26", codigo_amostra: "13298-05" }],
  ["a1b", { os_numero: "17808-26", codigo_amostra: " 13298-05 " }], // amostra cadastrada de novo
  ["a2", { os_numero: "17808-26", codigo_amostra: "13298-06" }],
  ["s1", { os_numero: "17808-26", codigo_amostra: "" }],
  ["s2", { os_numero: "17808-26", codigo_amostra: "" }],
]);
const e = (id: string, amostra_id: string, tipo = "ADENS", status = "pendente") => ({
  id,
  amostra_id,
  tipo_ensaio_id: tipo,
  status,
});

describe("acharCopiasPendentes", () => {
  it("mantém o primeiro e marca os demais iguais como cópia", () => {
    const r = acharCopiasPendentes([e("1", "a1"), e("2", "a1"), e("3", "a1b"), e("4", "a2")], new Set(), amostras);
    expect([...r].sort()).toEqual(["2", "3"]);
  });

  it("o original é o que já tem programação, e ele nunca é marcado", () => {
    const r = acharCopiasPendentes([e("1", "a1"), e("2", "a1")], new Set(["2"]), amostras);
    expect([...r]).toEqual(["1"]);
  });

  it("tipo de ensaio diferente não é cópia", () => {
    expect(acharCopiasPendentes([e("1", "a1", "ADENS"), e("2", "a1", "TRI")], new Set(), amostras).size).toBe(0);
  });

  it("amostras sem código só são iguais pelo mesmo id", () => {
    expect(acharCopiasPendentes([e("1", "s1"), e("2", "s2")], new Set(), amostras).size).toBe(0);
    expect([...acharCopiasPendentes([e("1", "s1"), e("2", "s1")], new Set(), amostras)]).toEqual(["2"]);
  });

  it("ignora ensaios cancelados", () => {
    expect(acharCopiasPendentes([e("1", "a1", "ADENS", "cancelado"), e("2", "a1")], new Set(), amostras).size).toBe(0);
  });
});
