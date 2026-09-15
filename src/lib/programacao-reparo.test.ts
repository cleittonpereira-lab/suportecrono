import { describe, expect, it } from "vitest";
import { arrumarPlanilha, corrigirTipos, lerPlanilha, linhaParaPlanilha, type Abas, type AbaDaPlanilha } from "./programacao-reparo";

const T1 = "2026-09-08T18:32:29.983Z";
const T2 = "2026-09-10T10:00:00.000Z";
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Cópia do app: guardou o ensaio importado na ordem em que os campos foram para a planilha.
const banco: Abas = {
  Ensaios: [
    { amostra_id: "am-1", tipo_ensaio_id: U(90), status: "pendente", prioridade: "media", id: U(1), created_at: T1, updated_at: T1 },
  ],
};

const CAB_ENSAIOS = ["id", "amostra_id", "tipo_ensaio_id", "status", "prazo", "observacoes", "detalhes_tecnicos", "prioridade", "created_at", "updated_at"];

function planilha(): AbaDaPlanilha[] {
  return [
    { aba: "Amostras", valores: [["id", "os_numero", "codigo_amostra"], ["am-1", "17588-26", "SH-01"]] },
    {
      aba: "Ensaios",
      valores: [
        CAB_ENSAIOS,
        ["es-1", "am-1", "te-triaxial", "planejado", "2026-08-30", "obs", "Setor: X"],
        // tortas: acrescentadas na ordem dos campos, não na do cabeçalho
        ["am-1", U(90), "pendente", "media", U(1), T1, T1],
        [],
        ["am-1", U(92), "pendente", "media", U(2), T1, T1],
        ["am-1", "CD3.IN", "pendente", "media", U(3), T1, T1], // etiqueta crua no lugar do id do tipo
        ["lixo", "sem", "sentido"],
      ],
    },
    {
      aba: "Tipos de Ensaio",
      valores: [
        ["id", "nome", "cor_gantt", "equipamentos_ids"],
        ["te-triaxial", "Triaxial UU / CU / CD", "", ""],
        ["te-cisalhamento", "Cisalhamento Direto", "", ""],
        ["CD3.IN", "CD3.IN", "FALSE", "#F0B43C", U(90), T1, T1],
        ["CD3.IN", "CD3.IN", "FALSE", "#F0B43C", U(92), T1, T1],
      ],
    },
    { aba: "Equipamentos", valores: [["nome", "codigo"], ["Prensa", "P1"]] },
  ];
}

describe("lerPlanilha", () => {
  it("lê as linhas tortas pelo gabarito e guarda a linha de cada id", () => {
    const m = lerPlanilha(planilha(), banco);
    const ens = m.relatorio.find((r) => r.aba === "Ensaios")!;
    expect([ens.naPlanilha, ens.alinhadas, ens.realinhadas]).toEqual([5, 1, 3]);
    expect(ens.naoReconhecidas).toEqual([{ linha: 7, valores: ["lixo", "sem", "sentido"] }]);
    const u2 = m.dados.Ensaios.find((e) => e.id === U(2))!;
    expect([u2.amostra_id, u2.status, u2.prioridade]).toEqual(["am-1", "pendente", "media"]);
    expect(m.posicao.Ensaios.get(U(2))).toBe(5);
    expect(m.larguras.Ensaios.get(5)).toBe(7);
  });

  it("corrige o tipo na leitura: avulso ou etiqueta crua → tipo oficial, etiqueta guardada", () => {
    const m = lerPlanilha(planilha(), banco);
    for (const id of [U(1), U(2), U(3)]) {
      const e = m.dados.Ensaios.find((x) => x.id === id)!;
      expect([e.tipo_ensaio_id, e.etiqueta]).toEqual(["te-cisalhamento", "CD3.IN"]);
    }
    // na leitura, os tipos avulsos continuam na lista (quem decide apagar é a pessoa)
    expect(m.dados["Tipos de Ensaio"]).toHaveLength(4);
  });

  it("aba sem cabeçalho com id não é lida", () => {
    const m = lerPlanilha(planilha(), banco);
    expect(m.cabecalhos.Equipamentos).toBeUndefined();
    expect(m.relatorio.find((r) => r.aba === "Equipamentos")!.temCabecalho).toBe(false);
  });

  it("id repetido: vale a alteração mais recente", () => {
    const p = planilha();
    p[1].valores.push(["es-1", "am-1", "te-triaxial", "em_execucao", "", "", "", "", T1, T2]);
    const m = lerPlanilha(p, banco);
    expect(m.dados.Ensaios.find((e) => e.id === "es-1")!.status).toBe("em_execucao");
    expect(m.posicao.Ensaios.get("es-1")).toBe(8);
    expect(m.posicoes.Ensaios.get("es-1")).toEqual([2, 8]);
  });

  it("empate entre gabaritos diferentes não vira chute", () => {
    const b: Abas = {
      Dependências: [
        { a: "x", b: "y", id: U(7), created_at: T1, updated_at: T1 },
        { b: "y", a: "x", id: U(8), created_at: T1, updated_at: T1 },
      ],
    };
    const m = lerPlanilha([{ aba: "Dependências", valores: [["id", "a", "b", "created_at", "updated_at"], ["p", "q", U(9), T1, T1]] }], b);
    expect(m.relatorio[0].naoReconhecidas).toHaveLength(1);
  });
});

describe("arrumarPlanilha", () => {
  it("endireita cada linha no mesmo lugar, sem perder a vazia nem a não reconhecida", () => {
    const a = arrumarPlanilha(planilha(), banco);
    // Tipos de Ensaio também tem linhas tortas (os "CD3.IN" acrescentados pela importação).
    expect(a.abas.map((x) => x.aba)).toEqual(["Ensaios", "Tipos de Ensaio"]);
    const tipos = a.abas[1].valores;
    expect(tipos[0]).toEqual(["id", "nome", "cor_gantt", "equipamentos_ids", "codigo", "permite_paralelo", "created_at", "updated_at"]);
    expect(tipos[3]).toEqual([U(90), "CD3.IN", "#F0B43C", "", "CD3.IN", "FALSE", T1, T1]);
    const [cab, ...linhas] = a.abas[0].valores;
    expect(cab).toEqual([...CAB_ENSAIOS, "etiqueta"]);
    expect(linhas).toHaveLength(6);
    expect(linhas[0]).toEqual(["es-1", "am-1", "te-triaxial", "planejado", "2026-08-30", "obs", "Setor: X"]);
    expect(linhas[1]).toEqual([U(1), "am-1", "te-cisalhamento", "pendente", "", "", "", "media", T1, T1, "CD3.IN"]);
    expect(linhas[2]).toEqual([]);
    expect(linhas[5]).toEqual(["lixo", "sem", "sentido"]);
  });

  it("planilha já arrumada: nada a regravar", () => {
    const primeira = arrumarPlanilha(planilha(), banco);
    const p = planilha().map((x) => primeira.abas.find((a) => a.aba === x.aba) ?? x);
    expect(arrumarPlanilha(p, banco).abas).toEqual([]);
  });
});

describe("linhaParaPlanilha", () => {
  it("cada valor na coluna do cabeçalho; campo novo vira coluna no fim", () => {
    const l = linhaParaPlanilha(["id", "nome"], { nome: "Prensa", id: "eq-1", ativo: true });
    expect(l).toEqual({ cabecalho: ["id", "nome", "ativo"], valores: ["eq-1", "Prensa", "TRUE"], cabecalhoMudou: true });
  });
});

describe("corrigirTipos com removerAvulsos", () => {
  it("tira da lista só o avulso repetido que ficou sem uso", () => {
    const dados: Abas = {
      Ensaios: [{ id: "e1", amostra_id: "", tipo_ensaio_id: "t-cd" }],
      "Tipos de Ensaio": [
        { id: "te-cisalhamento", nome: "Cisalhamento Direto" },
        { id: "t-cd", nome: "CD3.IN", codigo: "CD3.IN" },
        { id: "t-x", nome: "ASF.XYZ", codigo: "ASF.XYZ" },
      ],
    };
    const r = corrigirTipos(dados);
    expect(dados.Ensaios[0].tipo_ensaio_id).toBe("te-cisalhamento");
    expect(r.avulsosRemovidos).toEqual(["CD3.IN"]);
    expect(dados["Tipos de Ensaio"].map((t) => t.id)).toEqual(["te-cisalhamento", "t-x"]);
  });
});
