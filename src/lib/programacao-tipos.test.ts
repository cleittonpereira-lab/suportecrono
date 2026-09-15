import { describe, expect, it } from "vitest";
import { ehTipoAvulso, resolverTipo } from "./programacao-tipos";

const TIPOS = [
  { id: "te-adensamento", nome: "Ensaio de Adensamento (Edômetro)" },
  { id: "te-cisalhamento", nome: "Cisalhamento Direto" },
  { id: "te-triaxial", nome: "Triaxial UU / CU / CD" },
  { id: "te-caracterizacao", nome: "Caracterização Comp/CBR" },
  { id: "te-mrdp", nome: "Módulo de Resiliência (MR / DP)" },
  { id: "te-mctc", nome: "MCT-C (Mini-MCV)" },
  { id: "te-permv", nome: "Permeabilidade (PERM.V)" },
  { id: "te-compressao", nome: "Compressão Simples / Diâmetro" },
  { id: "x-asf", nome: "Teor de Betume", codigo: "ASF.TB" },
];

const id = (tag: string) => resolverTipo(tag, TIPOS)?.id ?? null;

describe("resolverTipo", () => {
  it("etiqueta de campo com nº de CPs e condição cai no tipo do código canônico", () => {
    expect(id("CD3.IN")).toBe("te-cisalhamento");
    expect(id("cd3.nat")).toBe("te-cisalhamento");
  });

  it("código cadastrado vale antes de tudo", () => {
    expect(id("ASF.TB")).toBe("x-asf");
  });

  it("apelidos para etiquetas fora do padrão", () => {
    expect(id("TRI.UU")).toBe("te-triaxial");
    expect(id("ADENS")).toBe("te-adensamento");
    expect(id("MCT.C")).toBe("te-mctc");
    expect(id("PERM.V")).toBe("te-permv");
  });

  it("compressão não cai em 'Caracterização Comp/CBR'", () => {
    expect(id("COMP.S.7")).toBe("te-compressao");
    expect(id("CBR")).toBe("te-caracterizacao");
  });

  it("etiqueta desconhecida ou vazia: null", () => {
    expect(id("XYZ.99")).toBeNull();
    expect(id("  ")).toBeNull();
  });
});

describe("ehTipoAvulso", () => {
  it("nome igual ao código = criado pela importação com a etiqueta crua", () => {
    expect(ehTipoAvulso({ id: "1", nome: "CD3.IN", codigo: "cd3.in" })).toBe(true);
    expect(ehTipoAvulso({ id: "2", nome: "Cisalhamento Direto", codigo: "CD" })).toBe(false);
    expect(ehTipoAvulso({ id: "3", nome: "Cisalhamento Direto" })).toBe(false);
  });
});
