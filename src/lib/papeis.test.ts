import { describe, expect, it } from "vitest";
import { exigirPermissaoNoFluxo, podeAprovar, podeVerificar } from "./papeis";

describe("papéis no fluxo de aprovação", () => {
  it("digitador não verifica nem aprova", () => {
    const digitador = { role: "usuario", labRole: "digitador" };
    expect(podeVerificar(digitador)).toBe(false);
    expect(podeAprovar(digitador)).toBe(false);
    expect(() => exigirPermissaoNoFluxo(digitador, "aprovar")).toThrow(/Sem permissão/);
    expect(() => exigirPermissaoNoFluxo(digitador, "verificar")).toThrow(/Sem permissão/);
  });

  it("verificador verifica mas não aprova", () => {
    const verificador = { role: "usuario", labRole: "verificador" };
    expect(podeVerificar(verificador)).toBe(true);
    expect(podeAprovar(verificador)).toBe(false);
  });

  it("aprovador e admin fazem os dois", () => {
    for (const p of [{ role: "usuario", labRole: "aprovador" }, { role: "admin", labRole: "nenhum" }]) {
      expect(podeVerificar(p)).toBe(true);
      expect(podeAprovar(p)).toBe(true);
    }
  });

  it("as contas de hoje mantêm o que já faziam", () => {
    expect(podeVerificar({ role: "gestor", labRole: "verificador" })).toBe(true);
    expect(podeVerificar({ role: "gestor", labRole: "nenhum" })).toBe(true);
    expect(podeAprovar({ role: "gestor", labRole: "verificador" })).toBe(false);
    expect(podeAprovar({ role: "admin", labRole: "aprovador" })).toBe(true);
  });

  it("convidado ou sem identidade: nada", () => {
    expect(podeVerificar({})).toBe(false);
    expect(podeAprovar(null)).toBe(false);
    expect(() => exigirPermissaoNoFluxo(undefined, "verificar")).toThrow();
  });
});
