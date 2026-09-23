import { describe, expect, it } from "vitest";
import { familiaDoEnsaio } from "./familia-ensaio";

describe("família do ensaio", () => {
  it("junta as variantes do triaxial", () => {
    expect(familiaDoEnsaio("triaxial-ciu")).toBe("triaxial");
    expect(familiaDoEnsaio("TRI.UU")).toBe("triaxial");
    expect(familiaDoEnsaio("TRI4.CD")).toBe("triaxial");
    expect(familiaDoEnsaio("triaxial-cid-sat")).toBe("triaxial");
  });

  it("reconhece sigla, tipo e nome", () => {
    expect(familiaDoEnsaio("CD3.IN")).toBe("cisalhamento-direto");
    expect(familiaDoEnsaio("ADENS.I.9")).toBe("adensamento");
    expect(familiaDoEnsaio("asf-dap")).toBe("asf-dap");
    expect(familiaDoEnsaio("COMP.D.7")).toBe("compressao-diametral");
    expect(familiaDoEnsaio("Point Load Test")).toBe("load-test");
  });

  it("usa a próxima pista quando a primeira não serve", () => {
    expect(familiaDoEnsaio(null, "xyz", "perm-v")).toBe("perm-v");
    expect(familiaDoEnsaio("xyz")).toBe("outros");
  });
});
