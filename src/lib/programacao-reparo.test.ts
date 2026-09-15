import { describe, expect, it } from "vitest";
import { cabecalhoDaAba, montarReparo, valoresDaAba, type Abas, type AbaDaPlanilha } from "./programacao-reparo";

const T1 = "2026-09-08T18:32:29.983Z";
const T2 = "2026-09-10T10:00:00.000Z";
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Ordem em que a importação antiga mandava o ensaio (e em que o banco o guardou).
const ensaioImportado = (id: string, amostra: string, tipo: string) => ({
  amostra_id: amostra,
  tipo_ensaio_id: tipo,
  status: "pendente",
  prioridade: "media",
  id,
  created_at: T1,
  updated_at: T1,
});

function cenario(): { banco: Abas; planilha: AbaDaPlanilha[] } {
  const banco: Abas = {
    Amostras: [{ id: "am-1", os_numero: "17588-26", codigo_amostra: "SH-01" }],
    Ensaios: [
      { id: "es-1", amostra_id: "am-1", tipo_ensaio_id: "te-triaxial", status: "planejado" },
      ensaioImportado(U(1), "am-1", U(90)), // tipo avulso "CD3.IN" (U90)
      { id: "es-velho", amostra_id: "am-1", tipo_ensaio_id: "te-triaxial", status: "pendente" },
    ],
    "Tipos de Ensaio": [
      { id: "te-triaxial", nome: "Triaxial UU / CU / CD" },
      { id: "te-cisalhamento", nome: "Cisalhamento Direto" },
      { id: U(90), nome: "CD3.IN", codigo: "CD3.IN", permite_paralelo: "FALSE", cor_gantt: "#F0B43C", created_at: T1, updated_at: T1 },
      { id: U(91), nome: "CD3.IN", codigo: "CD3.IN", permite_paralelo: "FALSE", cor_gantt: "#F0B43C", created_at: T1, updated_at: T1 },
      { id: U(95), nome: "ASF.XYZ", codigo: "ASF.XYZ", created_at: T1, updated_at: T1 },
    ],
  };
  const cabEnsaios = ["id", "amostra_id", "tipo_ensaio_id", "status", "prazo", "observacoes", "detalhes_tecnicos", "prioridade", "created_at", "updated_at"];
  const planilha: AbaDaPlanilha[] = [
    { aba: "Amostras", valores: [["id", "os_numero", "codigo_amostra"], ["am-1", "17588-26", "SH-01"]] },
    {
      aba: "Ensaios",
      valores: [
        cabEnsaios,
        ["es-1", "am-1", "te-triaxial", "planejado", "2026-08-30", "obs", "Setor: X"],
        // tortas: acrescentadas na ordem dos campos, não na do cabeçalho
        ["am-1", U(90), "pendente", "media", U(1), T1, T1],
        ["am-1", U(92), "pendente", "media", U(2), T1, T1], // só na planilha, tipo U92 também só lá
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
        ["CD3.IN", "CD3.IN", "FALSE", "#F0B43C", U(92), T1, T1],
      ],
    },
  ];
  return { banco, planilha };
}

describe("montarReparo", () => {
  it("desentorta as linhas acrescentadas e traz o que só estava na planilha", () => {
    const { banco, planilha } = cenario();
    const { dados, relatorio } = montarReparo(banco, planilha, { manterSoNoApp: false });
    const ens = relatorio.abas.find((a) => a.aba === "Ensaios")!;
    expect(ens.alinhadas).toBe(1);
    expect(ens.realinhadas).toBe(3);
    expect(ens.naoReconhecidas).toEqual([{ linha: 6, valores: ["lixo", "sem", "sentido"] }]);
    expect(ens.soNaPlanilha).toBe(2);
    expect(ens.soNoApp).toBe(1); // es-velho: as telas não o mostravam
    const porId = new Map(dados.Ensaios.map((e) => [e.id, e]));
    expect(porId.has("es-velho")).toBe(false);
    expect(porId.get(U(2))!.amostra_id).toBe("am-1");
    expect(porId.get(U(2))!.status).toBe("pendente");
  });

  it("manterSoNoApp guarda o que só existia no banco", () => {
    const { banco, planilha } = cenario();
    const { dados } = montarReparo(banco, planilha, { manterSoNoApp: true });
    expect(dados.Ensaios.some((e) => e.id === "es-velho")).toBe(true);
  });

  it("linha só do banco que ainda está em uso fica (sem criar órfãos)", () => {
    const { banco, planilha } = cenario();
    const { dados, relatorio } = montarReparo(banco, planilha, { manterSoNoApp: false });
    const tipos = relatorio.abas.find((a) => a.aba === "Tipos de Ensaio")!;
    expect(tipos.soNoApp).toBe(3); // U90, U91, U95
    expect(tipos.soNoAppMantidas).toBe(1); // U90: tipo do ensaio U(1)
    expect(dados.Ensaios.find((e) => e.id === U(1))!.tipo_ensaio_id).toBe("te-cisalhamento");
    expect(relatorio.tipos.semTipo).toEqual([]);
  });

  it("passa os ensaios de tipo avulso ou etiqueta crua ao tipo oficial e guarda a etiqueta", () => {
    const { banco, planilha } = cenario();
    const { dados, relatorio } = montarReparo(banco, planilha, { manterSoNoApp: true });
    for (const id of [U(1), U(2), U(3)]) {
      const e = dados.Ensaios.find((x) => x.id === id)!;
      expect(e.tipo_ensaio_id).toBe("te-cisalhamento");
      expect(e.etiqueta).toBe("CD3.IN");
    }
    expect(relatorio.tipos.corrigidos).toHaveLength(3);
    expect(relatorio.tipos.corrigidos[0].amostra).toBe("OS 17588-26 · SH-01");
    // os três "CD3.IN" somem (repetidos do oficial e sem uso); o avulso sem oficial fica
    expect(relatorio.tipos.avulsosRemovidos).toEqual(["CD3.IN", "CD3.IN", "CD3.IN"]);
    expect(dados["Tipos de Ensaio"].map((t) => t.id)).toEqual(["te-triaxial", "te-cisalhamento", U(95)]);
  });

  it("linha nos dois lados: vale a alteração mais recente", () => {
    const { banco, planilha } = cenario();
    const ens = planilha.find((p) => p.aba === "Ensaios")!;
    ens.valores.push(["es-1", "am-1", "te-triaxial", "em_execucao", "", "", "", "", T1, T2]);
    const { dados, relatorio } = montarReparo(banco, planilha, { manterSoNoApp: false });
    expect(dados.Ensaios.find((e) => e.id === "es-1")!.status).toBe("em_execucao");
    expect(relatorio.abas.find((a) => a.aba === "Ensaios")!.planilhaMaisNova).toBe(1);
  });

  it("aba que não existe na planilha fica como está no banco", () => {
    const { banco, planilha } = cenario();
    banco.Equipamentos = [{ id: "eq-1", nome: "Prensa" }];
    const { dados, relatorio } = montarReparo(banco, planilha, { manterSoNoApp: false });
    expect(dados.Equipamentos).toEqual([{ id: "eq-1", nome: "Prensa" }]);
    expect(relatorio.abas.find((a) => a.aba === "Equipamentos")!.naPlanilhaExiste).toBe(false);
  });

  it("empate entre gabaritos diferentes não vira chute", () => {
    const banco: Abas = {
      Dependências: [
        { a: "x", b: "y", id: U(7), created_at: T1, updated_at: T1 },
        { b: "y", a: "x", id: U(8), created_at: T1, updated_at: T1 },
      ],
    };
    const planilha: AbaDaPlanilha[] = [{ aba: "Dependências", valores: [["p", "q", U(9), T1, T1]] }];
    const { relatorio } = montarReparo(banco, planilha, { manterSoNoApp: true });
    expect(relatorio.abas[0].naoReconhecidas).toHaveLength(1);
  });
});

describe("espelho", () => {
  it("cabeçalho fixo: id, colunas conhecidas, as demais, datas no fim", () => {
    const cab = cabecalhoDaAba("Ensaios", [{ updated_at: T1, extra: "1", id: "a", tipo_ensaio_id: "t", created_at: T1 }]);
    expect(cab[0]).toBe("id");
    expect(cab.slice(-3)).toEqual(["extra", "created_at", "updated_at"]);
    expect(cab.indexOf("amostra_id")).toBe(1);
  });

  it("cada valor na sua coluna, booleano como TRUE/FALSE", () => {
    const v = valoresDaAba("Equipamentos", [{ nome: "Prensa", id: "eq-1", ativo: true as unknown as string }]);
    expect(v[0]).toEqual(["id", "nome", "codigo", "ativo", "created_at", "updated_at"]);
    expect(v[1]).toEqual(["eq-1", "Prensa", "", "TRUE", "", ""]);
  });
});
