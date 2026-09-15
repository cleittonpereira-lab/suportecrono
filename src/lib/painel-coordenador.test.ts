import { describe, expect, it } from "vitest";
import { chaveOs, diasUteisEntre, montarPainel, osDaChegada, paraIso, type EntradaPainel } from "./painel-coordenador";

// Terça-feira.
const HOJE = "2026-09-15";

function base(): EntradaPainel {
  return {
    hoje: HOJE,
    setor: "todos",
    colunaFinal: "os-sistema",
    cronograma: [
      { os: "17700-26", tomador: "Tetra Tech", setor: "Especiais", dataEntrega: "27/08/2026", dataPostagem: "" },
      { os: "17891-26", tomador: "Quadrante", setor: "Especiais", dataEntrega: "20/09/2026", dataPostagem: "" },
      { os: "17962-26", tomador: "Motiva", setor: "Convencionais", dataEntrega: "17/09/2026", dataPostagem: "" },
      { os: "17588-26", tomador: "EPR", setor: "Especiais / Dosagem", dataEntrega: "24/09/2026", dataPostagem: "" },
      { os: "17000-25", tomador: "Entregue", setor: "Especiais", dataEntrega: "10/09/2026", dataPostagem: "09/09/2026" },
      { os: "18000-26", tomador: "Longe", setor: "Especiais", dataEntrega: "30/10/2026", dataPostagem: "" },
    ],
    datasAcordadas: {
      "17891-26": { data: "2026-09-18", arquivada: false },
      "17588-26": { data: null, arquivada: true },
    },
    chegadas: [
      { id: "c1", osCliente: "Motiva / 17962-26", dataChegada: "11/09/2026", amostras: 3, coluna: "registro" },
      { id: "c2", osCliente: "Quadrante OS 17891-26", dataChegada: "14/09/2026", amostras: 2, coluna: "os-sistema" },
      { id: "c3", osCliente: "Cliente antigo", dataChegada: "01/08/2026", amostras: 1, coluna: "os-sistema" },
    ],
    amostras: [
      { id: "a1", os_numero: "17891-26", codigo_amostra: "SH-01" },
      { id: "a2", os_numero: "17962-26", codigo_amostra: "ST-02" },
    ],
    ensaios: [
      { id: "e1", amostra_id: "a1", tipo_ensaio_id: "te-adensamento", status: "em_execucao" },
      { id: "e2", amostra_id: "a2", tipo_ensaio_id: "te-caracterizacao", status: "pendente", created_at: "2026-09-10T10:00:00Z" },
      { id: "e3", amostra_id: "a2", tipo_ensaio_id: "te-cisalhamento", status: "pendente", created_at: "2026-09-15T08:00:00Z" },
    ],
    programacoes: [{ id: "p1", ensaio_id: "e1", status: "em_execucao", data_fim: "2026-09-19", tecnico: "Rodrigo" }],
    tipos: [
      { id: "te-adensamento", nome: "Adensamento" },
      { id: "te-caracterizacao", nome: "Caracterização" },
    ],
    pendencias: [
      { id: "l1", os: "17700-26", ensaio: "Triaxial CID", status: "digitado", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-10T00:00:00Z" },
      { id: "l2", os: "17891-26", ensaio: "Adensamento", status: "em_digitacao", created_at: "2026-09-15T00:00:00Z", updated_at: "2026-09-15T00:00:00Z" },
      { id: "l3", os: "17588-26", ensaio: "CD", status: "aprovado", created_at: "2026-09-01T00:00:00Z" },
    ],
  };
}

describe("datas e OS", () => {
  it("dias úteis contam só seg–sex, depois do dia inicial", () => {
    expect(diasUteisEntre("2026-09-11", HOJE)).toBe(2); // sex → ter
    expect(diasUteisEntre(HOJE, HOJE)).toBe(0);
  });
  it("datas do Brasil e ISO viram AAAA-MM-DD", () => {
    expect(paraIso("5/9/26")).toBe("2026-09-05");
    expect(paraIso("2026-09-15T10:00:00Z")).toBe("2026-09-15");
    expect(paraIso("sem data")).toBeNull();
  });
  it("acha a OS no texto livre da chegada", () => {
    expect(osDaChegada("Alfa Geotecnia / OS 1029")).toBe("1029");
    expect(osDaChegada("EPR 017588-26 lote 2")).toBe("17588-26");
    expect(osDaChegada("Cliente sem número")).toBeNull();
    expect(chaveOs("OS 017588-26")).toBe("17588-26");
  });
});

describe("montarPainel", () => {
  it("números do dia", () => {
    const { tiles } = montarPainel(base());
    expect(tiles.recebidas).toEqual({ amostras: 5, registros: 2 });
    expect(tiles.aguardandoProgramacao).toEqual({ total: 2, parados: 1 });
    expect(tiles.emAndamento).toEqual({ total: 1, alemDoPrevisto: 0 });
    expect(tiles.atrasadas).toEqual({ total: 1, maiorAtraso: 19 });
    expect(tiles.laudosParados).toEqual({ total: 1, maisAntigoDias: 3 });
  });

  it("prazos: vale a data acordada, previsão pelo Gantt, risco antes do atraso", () => {
    const { prazos } = montarPainel(base());
    // Atrasada primeiro; entre as em risco, a entrega mais próxima (17/09 antes de 18/09).
    expect(prazos.map((p) => p.os)).toEqual(["17700-26", "17962-26", "17891-26"]);

    const [tetra, motiva, quadrante] = prazos;
    expect([tetra.situacao, tetra.diasAtraso]).toEqual(["atraso", 19]);

    expect(quadrante.entrega).toBe("2026-09-18");
    expect(quadrante.fonte).toBe("acordada");
    expect(quadrante.divergente).toBe(true);
    expect(quadrante.previsao).toBe("2026-09-19");
    expect([quadrante.situacao, quadrante.motivoRisco]).toEqual(["risco", "ensaios terminam 19/09"]);

    expect(motiva.previsao).toBeNull();
    expect(motiva.falta).toBe("2 sem programação");
    expect([motiva.situacao, motiva.motivoRisco]).toEqual(["risco", "ensaio sem programação"]);
  });

  it("fora dos prazos: entregue, arquivada e além de 15 dias", () => {
    const os = montarPainel(base()).prazos.map((p) => p.os);
    expect(os).not.toContain("17000-25");
    expect(os).not.toContain("17588-26");
    expect(os).not.toContain("18000-26");
  });

  it("esteira marca o gargalo pela maior proporção parada", () => {
    const { esteira } = montarPainel(base());
    const porChave = Object.fromEntries(esteira.map((e) => [e.chave, e]));
    expect([porChave.recebimento.total, porChave.recebimento.parados]).toEqual([1, 1]);
    expect(porChave.recebimento.gargalo).toBe(true);
    expect(esteira.filter((e) => e.gargalo)).toHaveLength(1);
  });

  it("alertas: o grave primeiro", () => {
    const { alertas } = montarPainel(base());
    expect(alertas[0]).toMatchObject({ nivel: "crit", texto: "OS 17891-26: ensaios terminam 19/09, entrega em 18/09" });
    expect(alertas[1]).toMatchObject({ nivel: "crit", texto: "1 entrega atrasada" });
    expect(alertas.slice(2).every((a) => a.nivel === "warn")).toBe(true);
    expect(alertas.some((a) => a.texto.includes("diferente do Cronograma"))).toBe(true);
  });

  it("filtro de setor", () => {
    const e = base();
    e.setor = "Convencionais";
    const m = montarPainel(e);
    expect(m.prazos.map((p) => p.os)).toEqual(["17962-26"]);
    expect(m.tiles.recebidas.registros).toBe(1);
    expect(m.tiles.emAndamento.total).toBe(0);
  });
});
