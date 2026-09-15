import { describe, expect, it } from "vitest";
import { planejarImportacao, type LinhaImportada } from "./programacao-importacao";

const AGORA = "2026-09-15T12:00:00.000Z";
const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};
const linha = (codigo: string, tag: string): LinhaImportada => ({
  identificacao: `Furo ${codigo}`,
  codigo_amostra: codigo,
  tipo: "SH",
  topo: "1,00",
  base: "1,50",
  amostra_coletada: "",
  tag,
});

const base = () => ({
  Amostras: [{ id: "am-1", os_numero: "17588-26", codigo_amostra: "SH-01" }],
  Ensaios: [] as Record<string, string>[],
  "Tipos de Ensaio": [
    { id: "te-cisalhamento", nome: "Cisalhamento Direto" },
    { id: "te-triaxial", nome: "Triaxial UU / CU / CD" },
  ],
});

describe("planejarImportacao", () => {
  it("cada ensaio sai com o tipo oficial e a etiqueta original", () => {
    const { dados, resumo } = planejarImportacao(
      base(),
      { osNumero: "17588-26", tomador: "EPR", obra: "Pontes", linhas: [linha("SH-02", "CD3.IN"), linha("SH-02", "TRI.UU")] },
      ids(),
      AGORA,
    );
    expect(resumo).toEqual({ ensaios: 2, amostrasNovas: 1, amostrasExistentes: 0, repetidos: 0, tiposNovos: [] });
    const [a, b] = dados.Ensaios;
    expect([a.tipo_ensaio_id, a.etiqueta, a.status]).toEqual(["te-cisalhamento", "CD3.IN", "pendente"]);
    expect(b.tipo_ensaio_id).toBe("te-triaxial");
    expect(a.amostra_id).toBe(b.amostra_id);
    expect(dados.Amostras[1]).toMatchObject({ os_numero: "17588-26", codigo_amostra: "SH-02", tomador: "EPR", tipo: "SH" });
  });

  it("reaproveita a amostra que já existe na OS (mesmo código, sem diferença de caixa)", () => {
    const { dados, resumo } = planejarImportacao(
      base(),
      { osNumero: "17588-26", tomador: "", obra: "", linhas: [linha("sh-01", "CD")] },
      ids(),
      AGORA,
    );
    expect(resumo.amostrasExistentes).toBe(1);
    expect(dados.Amostras).toHaveLength(1);
    expect(dados.Ensaios[0].amostra_id).toBe("am-1");
  });

  it("etiqueta sem tipo cria UM tipo novo, reusado nas linhas seguintes", () => {
    const { dados, resumo } = planejarImportacao(
      base(),
      { osNumero: "1", tomador: "", obra: "", linhas: [linha("A", "XYZ.9"), linha("B", "XYZ.9"), linha("C", "xyz.9")] },
      ids(),
      AGORA,
    );
    expect(resumo.tiposNovos).toEqual(["XYZ.9"]);
    expect(dados["Tipos de Ensaio"]).toHaveLength(3);
    expect(new Set(dados.Ensaios.map((e) => e.tipo_ensaio_id)).size).toBe(1);
  });

  it("importar de novo a mesma planilha não duplica ensaios", () => {
    const pedido = { osNumero: "17588-26", tomador: "", obra: "", linhas: [linha("SH-02", "CD3.IN")] };
    const primeira = planejarImportacao(base(), pedido, ids(), AGORA);
    const segunda = planejarImportacao(primeira.dados, pedido, ids(), AGORA);
    expect(segunda.resumo).toMatchObject({ ensaios: 0, repetidos: 1, amostrasNovas: 0, amostrasExistentes: 1 });
    expect(segunda.dados.Ensaios).toHaveLength(1);
  });
});
