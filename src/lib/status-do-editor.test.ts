import { describe, expect, it } from "vitest";
import { statusDoEditor } from "./status-do-editor";

describe("status do cabeçalho do editor", () => {
  it("o fluxo gravado vence o status otimista da tela", () => {
    const s = statusDoEditor([{ rev: 1, status: "pendente_verificacao" }, { rev: 0, status: "aprovado" }], "aprovado");
    expect(s.isAguardandoVerif).toBe(true);
    expect(s.isAprovado).toBe(false);
    expect(s.rev).toBe(1);
    expect(s.travado).toBe(true);
  });

  it("devolvida pelo verificador volta para a digitação, destravada", () => {
    const s = statusDoEditor([{ rev: 2, status: "rejeitado_verificacao" }], "aguardando_verificacao");
    expect(s.isEmDigitacao).toBe(true);
    expect(s.devolvida).toBe(true);
    expect(s.travado).toBe(false);
    expect(s.rawSt).toBe("rejeitado_verificacao");
  });

  it("revisão reaberta fica em digitação com o número novo", () => {
    const s = statusDoEditor([{ rev: 0, status: "aprovado" }, { rev: 1, status: "em_revisao" }], null);
    expect(s.isEmDigitacao).toBe(true);
    expect(s.reaberta).toBe(true);
    expect(s.rev).toBe(1);
  });

  it("sem revisão enviada usa o status gravado", () => {
    expect(statusDoEditor([], "aguardando_aprovacao").isAguardandoAprov).toBe(true);
    expect(statusDoEditor([], null, "concluido").isAprovado).toBe(true);
    expect(statusDoEditor(undefined, null).isEmDigitacao).toBe(true);
  });
});
