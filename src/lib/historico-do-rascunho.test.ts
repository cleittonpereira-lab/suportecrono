import { describe, expect, it } from "vitest";
import { computeJsonDiff } from "./draft.functions";
import { diffSemValoresGrandes, resumoDoValor } from "./historico-do-rascunho";
import { falhaDaGravacao } from "./falha-da-gravacao";

/** CP do Triaxial com os dados brutos importados (milhares de leituras). */
function cpComDadosBrutos(id: string, ajuste = 0) {
  return {
    id,
    sigma3Target: 50,
    shear: Array.from({ length: 2500 }, (_, i) => ({ t: i, eaPct: i / 100 + ajuste, q: i * 1.5, u: 10, dV: 0 })),
  };
}

describe("histórico de salvamentos sem valores grandes", () => {
  it("40 autosaves de um ensaio com dados brutos cabem no registro do banco", () => {
    let payload: Record<string, unknown> = { sample: { os: "18279-26" }, specimens: [cpComDadosBrutos("cp1"), cpComDadosBrutos("cp2")] };
    const historico: unknown[] = [];
    for (let i = 1; i <= 40; i++) {
      const proximo = { ...payload, specimens: [cpComDadosBrutos("cp1", i), cpComDadosBrutos("cp2")] };
      historico.unshift({ changedAt: "x", diff: diffSemValoresGrandes(computeJsonDiff(payload, proximo)) });
      payload = proximo;
    }
    const registro = JSON.stringify({ payload, draftHistory: historico });
    // Limite do D1 usado em documentos-d1.server.ts (LIMITE_BYTES).
    expect(registro.length).toBeLessThan(1_900_000);

    // Sem o resumo, o mesmo histórico passava (muito) do limite — o salvamento parava.
    const semResumo = JSON.stringify(
      computeJsonDiff({ specimens: [cpComDadosBrutos("cp1")] }, { specimens: [cpComDadosBrutos("cp1", 1)] }),
    );
    expect(semResumo.length * 40).toBeGreaterThan(1_900_000);
  });

  it("valor pequeno fica como está; grande vira resumo legível", () => {
    expect(resumoDoValor("CP1")).toBe("CP1");
    expect(resumoDoValor([1, 2])).toEqual([1, 2]);
    expect(resumoDoValor(null)).toBeNull();
    expect(resumoDoValor(Array.from({ length: 1000 }, (_, i) => i))).toMatch(/^\(lista com 1000 itens/);
  });
});

describe("falhaDaGravacao", () => {
  it("sem resposta ou recusado é falha; gravado ou conflito, não", () => {
    expect(falhaDaGravacao(undefined)).toMatch(/não respondeu/);
    expect(falhaDaGravacao({ success: false, error: "acima do limite" })).toBe("acima do limite");
    expect(falhaDaGravacao({ success: true, rev: 4 })).toBeNull();
    expect(falhaDaGravacao({ success: false, conflict: true })).toBeNull();
  });
});
