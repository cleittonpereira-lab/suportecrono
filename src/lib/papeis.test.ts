import { describe, expect, it } from "vitest";
import { exigirPermissaoNoFluxo, podeAprovar, podeConcluirFora, podeVerificar } from "./papeis";

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

  it("'concluído fora (Excel)': quem verifica, sim; digitador, não", () => {
    expect(podeConcluirFora({ role: "gestor", labRole: "nenhum" })).toBe(true);
    expect(podeConcluirFora({ role: "usuario", labRole: "verificador" })).toBe(true);
    expect(podeConcluirFora({ role: "usuario", labRole: "digitador" })).toBe(false);
    expect(() => exigirPermissaoNoFluxo({ role: "usuario", labRole: "digitador" }, "concluir_fora")).toThrow(
      /concluído fora/,
    );
    expect(() => exigirPermissaoNoFluxo({ role: "gestor", labRole: "nenhum" }, "concluir_fora")).not.toThrow();
  });

  it("convidado ou sem identidade: nada", () => {
    expect(podeVerificar({})).toBe(false);
    expect(podeAprovar(null)).toBe(false);
    expect(() => exigirPermissaoNoFluxo(undefined, "verificar")).toThrow();
  });
});
