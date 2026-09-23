import { describe, expect, it } from "vitest";
import {
  combinarEtapas,
  etapaDasAprovacoes,
  etapaParaPendencia,
  normalizarEtapa,
  pendenciaParaEtapa,
  rotuloEtapa,
} from "./etapa-laudo";

describe("etapaDasAprovacoes", () => {
  it("usa a revisão mais recente, não a primeira da lista", () => {
    expect(
      etapaDasAprovacoes([
        { rev: 0, status: "aprovado" },
        { rev: 1, status: "pendente_verificacao" },
      ]),
    ).toBe("aguardando_verificacao");
  });

  it("verificado/pendente de aprovação → aguardando aprovação", () => {
    expect(etapaDasAprovacoes([{ rev: 2, status: "pendente_aprovacao" }])).toBe("aguardando_aprovacao");
    expect(etapaDasAprovacoes([{ rev: 2, status: "verificado" }])).toBe("aguardando_aprovacao");
  });

  it("devolvida pelo verificador ou reaberta volta para a digitação (mesma coluna da pendência)", () => {
    expect(etapaDasAprovacoes([{ rev: 1, status: "rejeitado_verificacao" }])).toBe("em_digitacao");
    expect(
      etapaDasAprovacoes([
        { rev: 0, status: "aprovado" },
        { rev: 1, status: "em_revisao" },
      ]),
    ).toBe("em_digitacao");
  });

  it("sem revisão enviada devolve null para quem chama usar o status gravado", () => {
    expect(etapaDasAprovacoes([])).toBeNull();
    expect(etapaDasAprovacoes(undefined)).toBeNull();
  });
});

describe("normalizarEtapa", () => {
  it("traduz os vocabulários de todas as telas para a mesma etapa", () => {
    expect(normalizarEtapa("digitado")).toBe("aguardando_verificacao");
    expect(normalizarEtapa("aguardando_verificacao")).toBe("aguardando_verificacao");
    expect(normalizarEtapa("verificado")).toBe("aguardando_aprovacao");
    expect(normalizarEtapa("aguardando_aprovacao")).toBe("aguardando_aprovacao");
    expect(normalizarEtapa("concluido")).toBe("aprovado");
    expect(normalizarEtapa("rascunho")).toBe("em_digitacao");
    expect(normalizarEtapa("digitacao")).toBe("em_digitacao");
    expect(normalizarEtapa("rejeitado_verificacao")).toBe("em_digitacao");
    expect(normalizarEtapa("em_revisao")).toBe("em_digitacao");
    expect(normalizarEtapa("qualquer-coisa")).toBeNull();
  });
});

describe("combinarEtapas", () => {
  it("fluxo formal vence a pendência — inclusive para voltar de etapa numa revisão nova", () => {
    expect(combinarEtapas("aguardando_verificacao", "aprovado")).toBe("aguardando_verificacao");
    expect(combinarEtapas("aprovado", "digitado" as never)).toBe("aprovado");
  });

  it("não rebaixa: a visão por OS trocava 'aguardando aprovação' por 'aguardando verificação'", () => {
    expect(combinarEtapas("aguardando_aprovacao", "aguardando_verificacao")).toBe("aguardando_aprovacao");
  });

  it("fora do fluxo formal vale a etapa mais avançada", () => {
    expect(combinarEtapas("em_digitacao", "aguardando_verificacao")).toBe("aguardando_verificacao");
    expect(combinarEtapas("em_digitacao", "pendente")).toBe("em_digitacao");
    expect(combinarEtapas(null, null)).toBe("pendente");
  });

  it("concluído fora da Central vale enquanto não há fluxo formal", () => {
    expect(combinarEtapas("em_digitacao", "concluido_externo")).toBe("concluido_externo");
    expect(combinarEtapas("aprovado", "concluido_externo")).toBe("aprovado");
  });
});

describe("pendência ↔ etapa", () => {
  it("ida e volta preserva o status", () => {
    for (const s of ["pendente", "em_digitacao", "digitado", "verificado", "aprovado", "concluido_externo"] as const) {
      expect(etapaParaPendencia(pendenciaParaEtapa(s))).toBe(s);
    }
  });

  it("rótulo igual em todas as telas", () => {
    expect(rotuloEtapa(pendenciaParaEtapa("digitado"))).toBe("Aguardando verificação");
    expect(rotuloEtapa(pendenciaParaEtapa("verificado"))).toBe("Aguardando aprovação");
  });
});
