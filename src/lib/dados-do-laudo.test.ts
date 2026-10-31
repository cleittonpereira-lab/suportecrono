import { describe, expect, it } from "vitest";
import { hashDadosDoLaudo, serializaEstavel } from "./dados-do-laudo";

describe("serializaEstavel", () => {
  it("ignora a ordem das chaves e trata campos indefinidos como nulos", () => {
    expect(serializaEstavel({ b: 1, a: { d: 2, c: [1, undefined, 3] } })).toBe(
      serializaEstavel({ a: { c: [1, null, 3], d: 2 }, b: 1 }),
    );
  });
});

describe("hashDadosDoLaudo", () => {
  const base = {
    sample: { code: "14198-02", Gs: 2.7 },
    specimens: [{ id: "CP1", H0: 70 }],
    selectedCpId: "CP1",
    tab: "relatorio",
    savedAt: "2026-10-30T12:00:00.000Z",
    rev: 3,
  };
  const fotos = [{ id: "f1", kind: "moldagem", specimenId: "CP1", url: "/a.jpg" }];

  it("não muda quando só mudam a aba, o CP selecionado, a hora ou a revisão do rascunho", async () => {
    const antes = await hashDadosDoLaudo(base, fotos);
    const depois = await hashDadosDoLaudo(
      { ...base, selectedCpId: "CP2", tab: "cisalhamento", savedAt: "2026-10-31T09:00:00.000Z", rev: 9 },
      fotos,
    );
    expect(depois).toBe(antes);
  });

  it("muda quando muda um dado do laudo", async () => {
    const antes = await hashDadosDoLaudo(base, fotos);
    const depois = await hashDadosDoLaudo({ ...base, specimens: [{ id: "CP1", H0: 71 }] }, fotos);
    expect(depois).not.toBe(antes);
  });

  it("muda quando troca uma foto", async () => {
    const antes = await hashDadosDoLaudo(base, fotos);
    const depois = await hashDadosDoLaudo(base, [{ ...fotos[0], url: "/nova.jpg" }]);
    expect(depois).not.toBe(antes);
  });

  it("é um SHA-256 em hexadecimal, com 64 caracteres", async () => {
    expect(await hashDadosDoLaudo(base, fotos)).toMatch(/^[0-9a-f]{64}$/);
  });
});
