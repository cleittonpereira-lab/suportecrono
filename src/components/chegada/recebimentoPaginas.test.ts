import { describe, expect, it } from "vitest";
import { paginatePhotosByAmostra } from "./RecebimentoReceiptTemplate";

const foto = (n: number) => ({ url: `/api/photo/${n}`, capturedAt: "", lat: null, lng: null });

describe("paginatePhotosByAmostra", () => {
  it("8 amostras de 1 foto: 6 na primeira folha, 2 na segunda, nenhuma perdida", () => {
    const amostras = Array.from({ length: 8 }, (_, i) => ({ titulo: `BL-${i}`, fotos: [foto(i)] }));
    const pages = paginatePhotosByAmostra(amostras);
    const porPagina = pages.map((p) => p.reduce((s, g) => s + g.fotos.length, 0));
    expect(porPagina).toEqual([6, 2]);
    const urls = pages.flat().flatMap((g) => g.fotos.map((f) => f.url));
    expect(urls).toEqual(amostras.map((a) => a.fotos[0].url));
  });

  it("amostra que passa de uma folha continua na seguinte com o mesmo título", () => {
    const pages = paginatePhotosByAmostra([
      { titulo: "A", fotos: [foto(1), foto(2), foto(3), foto(4)] },
      { titulo: "B", fotos: [foto(5), foto(6), foto(7)] },
    ]);
    expect(pages.map((p) => p.map((g) => `${g.titulo}:${g.fotos.length}`))).toEqual([["A:4", "B:2"], ["B:1"]]);
  });

  it("ignora amostras sem foto", () => {
    expect(paginatePhotosByAmostra([{ titulo: "A", fotos: [] }])).toEqual([]);
  });
});
