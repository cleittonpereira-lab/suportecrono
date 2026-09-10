import { describe, expect, it } from "vitest";
import {
  aplicarStatusPendencia,
  escolherPendenciaDoEnsaio,
  findMatchingPendencia,
  normMethod,
  proximaPendencia,
} from "./pendencia-match";
import type { PendenciaDigitacao } from "./lab-pendencias.functions";

function pend(id: string, extra: Partial<PendenciaDigitacao> = {}): PendenciaDigitacao {
  return {
    id,
    os: "17960-26",
    amostra: "13735-010",
    ensaio: "Compressão Simples — Solo",
    tipo_ensaio: "compressao-simples",
    equipamento: null,
    data_conclusao: "2026-09-09T00:00:00.000Z",
    status: "em_digitacao",
    origem: "digitalizacao",
    operador_user_id: null,
    observacao: null,
    payload: {},
    created_at: "2026-09-09T00:00:00.000Z",
    updated_at: "2026-09-09T00:00:00.000Z",
    rev: 3,
    ...extra,
  };
}

describe("normMethod", () => {
  it("sigla de triaxial com 'CD' NÃO vira cisalhamento (pendência real: tri4.cd)", () => {
    expect(normMethod("TRI4.CD")).toBe("triaxial-cid");
    expect(normMethod("tri3.cu")).toBe("triaxial-cid");
  });

  it("siglas de cisalhamento continuam reconhecidas", () => {
    expect(normMethod("CD4.IN")).toBe("cisalhamento-direto");
    expect(normMethod("cd6.in")).toBe("cisalhamento-direto");
    expect(normMethod("Cisalhamento Direto Inundado")).toBe("cisalhamento-direto");
  });

  it("'tri' no meio de outra palavra não é triaxial", () => {
    expect(normMethod("matriz")).not.toBe("triaxial-cid");
  });

  it("demais métodos", () => {
    expect(normMethod("adens.i.9")).toBe("adensamento");
    expect(normMethod("Compressão Simples — Solo")).toBe("compressao-simples");
    expect(normMethod("compressao-simples")).toBe("compressao-simples");
    expect(normMethod("PERM.V")).toBe("perm-v");
    expect(normMethod("ASF.DAP")).toBe("asf-dap");
    expect(normMethod("umidade-natural")).toBe("umidade-natural");
    expect(normMethod("modulo-resiliencia")).toBe("modulo-resiliencia");
  });
});

describe("findMatchingPendencia", () => {
  it("não devolve a pendência de OUTRO ensaio da mesma amostra", () => {
    const soAdensamento = [pend("p-adens", { ensaio: "adens.i.9", tipo_ensaio: "adensamento" })];

    // Antes: o casamento de reserva ignorava o tipo e devolvia p-adens.
    expect(
      findMatchingPendencia(soAdensamento, { os: "17960-26", amostra: "13735-010", tipo: "cisalhamento-direto" }),
    ).toBeUndefined();
  });

  it("acha a pendência certa pelo tipo", () => {
    const lista = [
      pend("p-adens", { ensaio: "adens.i.9", tipo_ensaio: "adensamento" }),
      pend("p-cd", { ensaio: "CD4.IN", tipo_ensaio: "cisalhamento-direto" }),
    ];
    expect(findMatchingPendencia(lista, { os: "OS-17960-26", amostra: "13735-010", tipo: "cisalhamento-direto" })?.id).toBe(
      "p-cd",
    );
  });
});

describe("escolherPendenciaDoEnsaio", () => {
  const alvo = {
    ensaioId: "en_1",
    osNumero: "17960-26",
    amostraCodigos: ["13735-010"],
    tipoEnsaio: "compressao-simples",
  };

  it("a pendência vinculada explicitamente ao ensaio vence", () => {
    const vinculada = pend("p-vinc", { amostra: "outro-codigo", payload: { _linkedEnsaio: { ensaioId: "en_1" } } });
    const r = escolherPendenciaDoEnsaio([pend("p-texto"), vinculada], alvo);
    expect(r).toEqual({ tipo: "encontrada", pendencia: vinculada });
  });

  it("sem vínculo, casa por OS + amostra + tipo", () => {
    const r = escolherPendenciaDoEnsaio([pend("p1"), pend("p2", { amostra: "13735-011" })], alvo);
    expect(r.tipo === "encontrada" && r.pendencia.id).toBe("p1");
  });

  it("aceita o código alternativo da amostra", () => {
    const r = escolherPendenciaDoEnsaio([pend("p1", { amostra: "SM-12" })], {
      ...alvo,
      amostraCodigos: ["13735-010", "SM-12"],
    });
    expect(r.tipo).toBe("encontrada");
  });

  it("ignora pendência já vinculada a OUTRO ensaio", () => {
    const deOutro = pend("p-outro", { payload: { _linkedEnsaio: { ensaioId: "en_2" } } });
    expect(escolherPendenciaDoEnsaio([deOutro], alvo)).toEqual({ tipo: "nenhuma" });
  });

  it("dois candidatos = ambíguo, não escolhe nenhum", () => {
    const r = escolherPendenciaDoEnsaio([pend("p1"), pend("p2")], alvo);
    expect(r).toEqual({ tipo: "ambigua", ids: ["p1", "p2"] });
  });

  it("sem OS ou sem código de amostra, não arrisca", () => {
    expect(escolherPendenciaDoEnsaio([pend("p1")], { ...alvo, osNumero: null })).toEqual({ tipo: "nenhuma" });
    expect(escolherPendenciaDoEnsaio([pend("p1")], { ...alvo, amostraCodigos: [null, ""] })).toEqual({ tipo: "nenhuma" });
  });
});

describe("aplicarStatusPendencia / proximaPendencia", () => {
  const ator = { userId: "u1", nome: "Cleitton" };
  const agora = "2026-09-10T10:00:00.000Z";

  it("aprovar registra aprovador, carimba o horário e sobe a revisão", () => {
    const r = aplicarStatusPendencia(pend("p1"), "aprovado", ator, agora);
    expect(r.status).toBe("aprovado");
    expect(r.aprovador_nome).toBe("Cleitton");
    expect((r.payload as Record<string, unknown>).aprovado_at).toBe(agora);
    expect(r.rev).toBe(4);
  });

  it("preserva o payload anterior", () => {
    const r = aplicarStatusPendencia(pend("p1", { payload: { ident: { os: "17960-26" } } }), "digitado", ator, agora);
    expect((r.payload as Record<string, unknown>).ident).toEqual({ os: "17960-26" });
  });

  it("não reabre pendência concluída fora da Central", () => {
    expect(proximaPendencia(pend("p1", { status: "concluido_externo" }), "aprovado", ator, agora)).toBeNull();
  });

  it("não grava quando o status já é o mesmo", () => {
    expect(proximaPendencia(pend("p1", { status: "aprovado" }), "aprovado", ator, agora)).toBeNull();
  });

  it("uma nova revisão de laudo já aprovado volta para 'digitado'", () => {
    expect(proximaPendencia(pend("p1", { status: "aprovado" }), "digitado", ator, agora)?.status).toBe("digitado");
  });
});
