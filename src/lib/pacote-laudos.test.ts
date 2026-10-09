import { describe, expect, it } from "vitest";
import { ultimaRevisaoDeCada } from "./pacote-laudos";

const l = (amostra: string, rev: number, ensaio_nome = "Teor de Betume e Granulometria (ASF.TB)") => ({
  rev,
  os_numero: "17959-26",
  amostra_code: amostra,
  ensaio_tipo: "asf-tb",
  ensaio_nome,
});

describe("ultimaRevisaoDeCada", () => {
  it("amostra cadastrada em dobro: só a revisão mais nova entra", () => {
    const rev2 = l("13706-01", 2);
    const rev1 = l("13706-01", 1);
    const outra = l("13706-02", 0);
    const r = ultimaRevisaoDeCada([rev1, rev2, outra]);
    expect(r.manter).toEqual([rev2, outra]);
    expect(r.substituidos).toEqual([rev1]);
  });

  it("ensaios diferentes na mesma amostra entram os dois", () => {
    const tb = l("13706-01", 0);
    const dap = { ...l("13706-01", 0, "Densidade Aparente (ASF.DAP)"), ensaio_tipo: "asf-dap" };
    expect(ultimaRevisaoDeCada([tb, dap]).substituidos).toEqual([]);
  });
});
