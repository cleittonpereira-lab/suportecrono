import { describe, expect, it } from "vitest";
import { filaDoLaudo, montarMesa, pedeMinhaAcao, type LinhaDaMesa } from "./mesa-de-laudos";

const linha = (scope: string, status: string, extra: Partial<LinhaDaMesa> = {}): LinhaDaMesa => ({
  scope_id: scope,
  rev: 0,
  status,
  requested_by: "u1",
  requested_at: "2026-09-20T10:00:00Z",
  verified_at: null,
  decided_at: null,
  updated_at: "2026-09-20T10:00:00Z",
  ...extra,
});

describe("mesa de laudos", () => {
  it("cada status cai numa fila só", () => {
    expect(filaDoLaudo("pendente_verificacao")).toBe("verificar");
    expect(filaDoLaudo("rejeitado")).toBe("verificar");
    expect(filaDoLaudo("pendente_aprovacao")).toBe("aprovar");
    expect(filaDoLaudo("rejeitado_verificacao")).toBe("devolvido");
    expect(filaDoLaudo("em_revisao")).toBe("correcao");
    expect(filaDoLaudo("aprovado")).toBe("aprovado");
    expect(filaDoLaudo("digitacao")).toBeNull();
  });

  it("laudo sem revisão fica de fora; aprovado antigo também", () => {
    const agora = Date.parse("2026-09-23T12:00:00Z");
    const mesa = montarMesa(
      [
        linha("a", "digitacao", { rev: null }),
        linha("b", "aprovado", { decided_at: "2026-09-22T10:00:00Z" }),
        linha("c", "aprovado", { decided_at: "2026-06-01T10:00:00Z" }),
      ],
      agora,
    );
    expect(mesa.aprovado.map((l) => l.scope_id)).toEqual(["b"]);
    expect(mesa.verificar).toEqual([]);
  });

  it("o que espera há mais tempo vem primeiro", () => {
    const mesa = montarMesa(
      [
        linha("novo", "pendente_verificacao", { requested_at: "2026-09-22T10:00:00Z" }),
        linha("velho", "pendente_verificacao", { requested_at: "2026-09-18T10:00:00Z" }),
      ],
      Date.parse("2026-09-23T12:00:00Z"),
    );
    expect(mesa.verificar.map((l) => l.scope_id)).toEqual(["velho", "novo"]);
  });

  it("quem precisa agir", () => {
    const dig = { verifica: false, aprova: false, userId: "u1" };
    const ver = { verifica: true, aprova: false, userId: "u2" };
    const l = linha("x", "rejeitado_verificacao");
    expect(pedeMinhaAcao(l, "devolvido", dig)).toBe(true);
    expect(pedeMinhaAcao(l, "devolvido", { ...dig, userId: "u9" })).toBe(false);
    expect(pedeMinhaAcao(l, "verificar", ver)).toBe(true);
    expect(pedeMinhaAcao(l, "aprovar", ver)).toBe(false);
  });
});
