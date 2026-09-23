import { describe, expect, it } from "vitest";
import { podeRegravar, proximaRevisao, revisaoAprovada } from "./revisoes-regra";

describe("próxima revisão", () => {
  it("laudo sem nada começa na Rev-00", () => {
    expect(proximaRevisao([], [])).toBe(0);
  });

  it("depois de aprovada, a próxima é a maior + 1", () => {
    expect(proximaRevisao([{ rev: 0, status: "aprovado" }], [0])).toBe(1);
  });

  it("revisão ainda no fluxo é reaproveitada, não vira outra", () => {
    expect(proximaRevisao([{ rev: 0, status: "aprovado" }, { rev: 1, status: "pendente_verificacao" }], [0, 1])).toBe(1);
    expect(proximaRevisao([{ rev: 2, status: "rejeitado_verificacao" }], [0, 1, 2])).toBe(2);
    expect(proximaRevisao([{ rev: 1, status: "em_revisao" }, { rev: 0, status: "aprovado" }], [0])).toBe(1);
  });

  it("PDF avulso no Drive sem fluxo não é reaproveitado (pode ser um laudo antigo assinado)", () => {
    expect(proximaRevisao([], [0, 1])).toBe(2);
    expect(proximaRevisao([{ rev: 0, status: "aprovado" }], [0, 1])).toBe(2);
  });

  it("a ordem das linhas não importa — vale a de maior número", () => {
    expect(proximaRevisao([{ rev: 1, status: "aprovado" }, { rev: 0, status: "pendente_verificacao" }], [])).toBe(2);
  });
});

describe("o que pode ser regravado", () => {
  const linhas = [
    { rev: 0, status: "aprovado" },
    { rev: 1, status: "pendente_aprovacao" },
  ];
  it("revisão aprovada é imutável", () => {
    expect(revisaoAprovada(linhas, 0)).toBe(true);
    expect(podeRegravar(linhas, 0)).toBe(false);
  });
  it("revisão no fluxo e ainda não aprovada pode", () => {
    expect(podeRegravar(linhas, 1)).toBe(true);
  });
  it("revisão fora do fluxo (PDF avulso) não pode", () => {
    expect(podeRegravar(linhas, 2)).toBe(false);
  });
});
