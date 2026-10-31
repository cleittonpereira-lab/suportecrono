import { describe, expect, it } from "vitest";
import { semConteudoDasFotos, semImagensEmbutidas } from "./fotos-do-rascunho";

describe("semConteudoDasFotos", () => {
  it("tira o base64 das fotos que já têm arquivo próprio e mantém o resto do rascunho", () => {
    const rascunho = {
      sample: { description: "x" },
      photos: [
        { id: "f1", url: "/api/photo/abc", dataUrl: "data:image/jpeg;base64,AAAA", kind: "moldagem" },
        { id: "f2", dataUrl: "data:image/jpeg;base64,BBBB", kind: "ruptura" },
      ],
    };
    const r = semConteudoDasFotos(rascunho);
    expect(r.sample).toBe(rascunho.sample);
    expect(r.photos[0]).toEqual({ id: "f1", url: "/api/photo/abc", dataUrl: "", kind: "moldagem" });
    // Sem url, o dataUrl é a única cópia da foto: fica.
    expect(r.photos[1].dataUrl).toBe("data:image/jpeg;base64,BBBB");
    // Não altera o objeto original (é o estado da tela).
    expect(rascunho.photos[0].dataUrl).toBe("data:image/jpeg;base64,AAAA");
  });

  it("histórico de salvamentos perde as imagens embutidas e mantém o resto", () => {
    const item = {
      changedAt: "2026-10-30T20:00:00.000Z",
      diff: {
        photos: { de: [{ id: "f1", dataUrl: "data:image/jpeg;base64,AAAA" }], para: [] },
        "sample.description": { de: "antiga", para: "nova" },
      },
    };
    const r = semImagensEmbutidas(item);
    expect(r.diff.photos.de).toEqual([{ id: "f1", dataUrl: "" }]);
    expect(r.diff["sample.description"]).toEqual({ de: "antiga", para: "nova" });
    expect(r.changedAt).toBe(item.changedAt);
  });

  it("rascunho sem fotos passa igual", () => {
    const r = { a: 1 };
    expect(semConteudoDasFotos(r)).toBe(r);
    expect(semConteudoDasFotos(null)).toBeNull();
  });
});
