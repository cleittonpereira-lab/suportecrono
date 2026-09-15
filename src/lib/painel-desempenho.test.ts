import { describe, expect, it } from "vitest";
import { montarDesempenho, segundaDaSemana, type Entrega } from "./painel-desempenho";
import type { EntradaPainel } from "./painel-coordenador";

const HOJE = "2026-09-15"; // terça

function entrada(): EntradaPainel {
  return {
    hoje: HOJE,
    setor: "todos",
    colunaFinal: "os-sistema",
    cronograma: [
      { os: "17000-25", tomador: "A", setor: "Especiais", dataEntrega: "10/09/2026", dataPostagem: "09/09/2026" },
      { os: "17962-26", tomador: "B", setor: "Convencionais", dataEntrega: "17/09/2026", dataPostagem: "" },
    ],
    datasAcordadas: {},
    chegadas: [
      { id: "c1", osCliente: "B / 17962-26", dataChegada: "11/09/2026", amostras: 3, coluna: "registro" },
      { id: "c2", osCliente: "B", osNumero: "17962-26", dataChegada: "14/09/2026", amostras: 2, coluna: "registro" },
      { id: "c3", osCliente: "A", osNumero: "17000-25", dataChegada: "01/09/2026", amostras: 1, coluna: "os-sistema" },
    ],
    amostras: [{ id: "a1", os_numero: "17962-26" }],
    ensaios: [{ id: "e1", amostra_id: "a1", tipo_ensaio_id: "t", status: "concluido" }],
    programacoes: [
      {
        id: "p1",
        ensaio_id: "e1",
        status: "concluido",
        data_inicio: "2026-09-10",
        data_fim: "2026-09-15",
        data_inicio_real: "2026-09-10",
        data_fim_real: "2026-09-15",
        duracao_dias: 3,
        incluir_fds: false,
        equipamento_id: null,
        tecnico: null,
      },
    ],
    tipos: [],
    equipamentos: [],
    pendencias: [
      { id: "l1", os: "17000-25", ensaio: "CD", status: "aprovado", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-08T12:00:00Z" },
      { id: "l2", os: "17962-26", ensaio: "CBR", status: "digitado", created_at: "2026-09-10T00:00:00Z" },
    ],
  };
}

const ENTREGAS: Entrega[] = [
  // a mesma entrega do Cronograma, pela aba OS ENTREGUES: não conta duas vezes
  { os: "17000-25", setor: "Especiais", dataPostagem: "09/09/2026", dataProgramada: "10/09/2026" },
  { os: "16999-25", setor: "Especiais", dataPostagem: "14/09/2026", dataProgramada: "12/09/2026" },
  { os: "16000-25", setor: "Dosagem", dataPostagem: "01/07/2026", dataProgramada: "10/07/2026" }, // 8 semanas anteriores
];

describe("montarDesempenho", () => {
  it("semanas de segunda a domingo, a última é a atual", () => {
    expect(segundaDaSemana(HOJE)).toBe("2026-09-14");
    expect(segundaDaSemana("2026-09-13")).toBe("2026-09-07"); // domingo fica na semana anterior
    const d = montarDesempenho(entrada(), ENTREGAS);
    expect(d.semanas).toHaveLength(8);
    expect(d.semanas[0]).toBe("2026-07-27");
    expect(d.semanas[7]).toBe("2026-09-14");
  });

  it("contagens por semana", () => {
    const d = montarDesempenho(entrada(), ENTREGAS);
    const s = Object.fromEntries(d.series.map((x) => [x.chave, x]));
    expect(s.recebidas.valores.slice(-3)).toEqual([1, 3, 2]); // 01/09, 11/09, 14/09
    expect(s.recebidas.atual).toBe(2);
    expect(s.concluidos.valores.slice(-1)).toEqual([1]);
    expect(s.aprovados.valores.slice(-2)).toEqual([1, 0]);
    expect(s.entregues.valores.slice(-2)).toEqual([1, 1]);
    expect(s.recebidas.media).toBe(0.8);
  });

  it("no prazo e comparação com as 8 semanas anteriores", () => {
    const d = montarDesempenho(entrada(), ENTREGAS);
    expect(d.noPrazo).toEqual({ pct: 50, noPrazo: 1, total: 2, pctAnterior: 100 });
  });

  it("da chegada à entrega, só com a chegada da OS registrada", () => {
    const d = montarDesempenho(entrada(), ENTREGAS);
    expect(d.tempoAteEntrega).toEqual({ mediana: 8, n: 1 }); // 17000-25: 01/09 → 09/09
  });

  it("filtro de setor", () => {
    const e = entrada();
    e.setor = "Convencionais";
    const d = montarDesempenho(e, ENTREGAS);
    const s = Object.fromEntries(d.series.map((x) => [x.chave, x]));
    expect(s.recebidas.valores.slice(-3)).toEqual([0, 3, 2]);
    expect(s.entregues.valores.every((v) => v === 0)).toBe(true);
  });
});
