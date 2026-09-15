import { describe, expect, it } from "vitest";
import { chaveDaPendencia } from "./pendencia-chave";

describe("chave da pendência", () => {
  it("é a mesma que o servidor sempre gerou", () => {
    expect(chaveDaPendencia("17700-26", "13314-089", "Densidade Aparente (ASF.DAP)")).toBe(
      "17700-26__13314-089__densidade_aparente_asf.dap_",
    );
  });

  it("amostra vazia, nula ou com espaços dá a mesma chave", () => {
    const a = chaveDaPendencia(" 17700-26 ", null, "PERM.V");
    expect(chaveDaPendencia("17700-26", "", "PERM.V")).toBe(a);
    expect(chaveDaPendencia("17700-26", "   ", "PERM.V")).toBe(a);
    expect(a).toBe("17700-26____perm.v");
  });
});
