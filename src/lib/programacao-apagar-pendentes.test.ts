import { beforeEach, describe, expect, it, vi } from "vitest";

// O leitor da planilha só reconhece linha com id no formato UUID.
const E1 = "11111111-1111-4111-8111-111111111111";
const E2 = "22222222-2222-4222-8222-222222222222";
const E3 = "33333333-3333-4333-8333-333333333333";
const A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// Planilha falsa: Ensaios (E1 aparece em 2 linhas — cópia antiga do mesmo id) e Programações.
const apagarLinhas = vi.fn(async (_aba: string, _posicoes: number[]) => {});
vi.mock("./programacao-planilha.server", () => ({
  planilhaConfigurada: () => true,
  lerAbasCruas: async () => [
    { aba: "Amostras", valores: [["id", "os_numero", "codigo_amostra"], [A1, "17808-26", "13298-05"]] },
    {
      aba: "Ensaios",
      valores: [
        ["id", "amostra_id", "tipo_ensaio_id", "status"],
        [E1, A1, T1, "pendente"],
        [E2, A1, T1, "pendente"],
        [E3, A1, T1, "pendente"],
        [E1, A1, T1, "pendente"],
      ],
    },
    { aba: "Programações", valores: [["id", "ensaio_id"], [P1, E3]] },
    { aba: "Tipos de Ensaio", valores: [["id", "nome"], [T1, "ADENS"]] },
  ],
  apagarLinhas: (aba: string, posicoes: number[]) => apagarLinhas(aba, posicoes),
  acrescentarLinhas: vi.fn(),
  gravarCabecalho: vi.fn(),
  gravarLinha: vi.fn(),
}));
vi.mock("./programacao-store.server", () => ({
  readStore: async () => ({}),
  atualizarStore: vi.fn(),
}));

const { apagarEnsaiosSemProgramacao } = await import("./programacao-fonte.server");

describe("apagarEnsaiosSemProgramacao", () => {
  beforeEach(() => apagarLinhas.mockClear());

  it("apaga numa chamada só, todas as linhas de cada id, e recusa quem tem programação", async () => {
    const r = await apagarEnsaiosSemProgramacao([E1, E2, E3, "nao-existe", E1]);
    expect(r).toEqual({ apagados: [E1, E2], recusados: [E3] });
    expect(apagarLinhas).toHaveBeenCalledTimes(1);
    const [aba, posicoes] = apagarLinhas.mock.calls[0];
    expect(aba).toBe("Ensaios");
    expect([...posicoes].sort()).toEqual([2, 3, 5]);
  });

  it("nada a apagar não chama a planilha", async () => {
    const r = await apagarEnsaiosSemProgramacao([E3]);
    expect(r).toEqual({ apagados: [], recusados: [E3] });
    expect(apagarLinhas).not.toHaveBeenCalled();
  });
});
