import { describe, expect, it } from "vitest";
import {
  laudoDoEnsaio,
  laudoPelaSigla,
  montarMapa,
  normalizarSigla,
  siglasSemLaudo,
} from "./compatibilidade-laudos";

describe("sigla → laudo", () => {
  it("TRI4.CU abre o laudo CIU — o caso relatado na Central", () => {
    expect(laudoPelaSigla("TRI4.CU")).toBe("triaxial-ciu");
  });

  it("cada variante do triaxial vai para o seu laudo", () => {
    expect(laudoPelaSigla("TRI.CIU")).toBe("triaxial-ciu");
    expect(laudoPelaSigla("TRI.UU")).toBe("triaxial-uu");
    expect(laudoPelaSigla("TRI.CIDsat")).toBe("triaxial-cid-sat");
    expect(laudoPelaSigla("TRI.CIDnat")).toBe("triaxial-cid-nat");
    expect(laudoPelaSigla("TRI.CID")).toBe("triaxial-cid");
    expect(laudoPelaSigla("Triaxial CU")).toBe("triaxial-ciu");
  });

  it("CD é cisalhamento direto, nunca o 'cid' do triaxial", () => {
    expect(laudoPelaSigla("CD3.IN")).toBe("cisalhamento-direto");
    expect(laudoPelaSigla("CD")).toBe("cisalhamento-direto");
  });

  it("as demais siglas da casa", () => {
    expect(laudoPelaSigla("ADENS.I.9")).toBe("adensamento");
    expect(laudoPelaSigla("M.ESP.A")).toBe("mesp-a");
    expect(laudoPelaSigla("ASF.TB")).toBe("asf-tb");
    expect(laudoPelaSigla("ASF.DAP")).toBe("asf-dap");
    expect(laudoPelaSigla("PERM.V")).toBe("perm-v");
    expect(laudoPelaSigla("COMP.A")).toBe("compressao-simples");
  });

  it("Compressão Diametral (COMP.D/ASF.CD) não cai no catch-all de Compressão Simples", () => {
    expect(laudoPelaSigla("COMP.D")).toBe("compressao-diametral");
    expect(laudoPelaSigla("COMP.D.7")).toBe("compressao-diametral");
    expect(laudoPelaSigla("ASF.CD")).toBe("compressao-diametral");
  });

  it("sigla desconhecida não vira chute", () => {
    expect(laudoPelaSigla("XYZ.99")).toBeNull();
    expect(laudoPelaSigla("")).toBeNull();
    expect(laudoPelaSigla(null)).toBeNull();
  });
});

describe("a tabela do laboratório manda", () => {
  const mapa = montarMapa([
    { codigo: "XYZ.99", nome: "Ensaio da casa", tipo_relatorio: "adensamento" },
    { codigo: "TRI4.CU", nome: "Triaxial CU", tipo_relatorio: "triaxial-uu" },
    { codigo: "SEM.LAUDO", nome: "Sem laudo", tipo_relatorio: "" },
  ]);

  it("sigla que a heurística não conhece passa a abrir pelo que foi configurado", () => {
    expect(laudoDoEnsaio("XYZ.99", null, mapa)).toBe("adensamento");
  });

  it("a configuração vence a sigla, mesmo quando a sigla 'parece' outra coisa", () => {
    expect(laudoDoEnsaio("TRI4.CU", null, mapa)).toBe("triaxial-uu");
  });

  it("casa pelo nome do tipo também, e ignora pontuação e maiúsculas", () => {
    expect(laudoDoEnsaio(null, "ensaio da casa", mapa)).toBe("adensamento");
    expect(laudoDoEnsaio("xyz 99", null, mapa)).toBe("adensamento");
  });

  it("tipo com relatório em branco não entra no mapa", () => {
    expect(mapa[normalizarSigla("SEM.LAUDO")]).toBeUndefined();
  });

  it("sem configuração, cai no reconhecimento pela sigla", () => {
    expect(laudoDoEnsaio("TRI.CIU", null, {})).toBe("triaxial-ciu");
  });
});

describe("siglas pendentes de configuração", () => {
  it("lista só as que nem a tabela nem a sigla resolvem, sem repetir", () => {
    const mapa = montarMapa([{ codigo: "XYZ.99", tipo_relatorio: "adensamento" }]);
    const pendentes = siglasSemLaudo(
      [
        { sigla: "TRI4.CU" },
        { sigla: "XYZ.99" },
        { sigla: "ABC.1" },
        { sigla: "ABC.1" },
        { sigla: "QQQ" },
      ],
      mapa,
    );
    expect(pendentes).toEqual(["ABC.1", "QQQ"]);
  });
});
