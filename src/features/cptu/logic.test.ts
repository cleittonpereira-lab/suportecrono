import { describe, expect, it } from "vitest";
import {
  aplicarPatch,
  cotasDissipacao,
  lerExtratoSond,
  mesclarImportacao,
  parseCsvSond,
  preFuro,
  profundidadePrevista,
  resumir,
} from "./logic";

const CAB =
  '"Ordem de Serviço (OS)";"Identificação";"Tipo";"Latitude";"Longitude";"Status";"Desde (dd/mm/aaaa)";"Data Fim OS (dd/mm/aaaa)";"Prof. Total (m)";"Observação de campo";"Critério de Paralisação"';

function csv(...linhas: string[]) {
  return "\uFEFF" + [CAB, ...linhas].join("\r\n");
}

const L1 =
  '"18205-26";"0053 CPTU-00101-094";"CPTU";"-25.53439937";"-49.31666491";"PENDENTE";"08/10/2026";"";"0,00";"";"PENETRAÇÃO PREVISTA DO CPTU ATÉ 10,0 METROS DE PROFUNDIDADE,COM ENSAIOS DE DISSIPAÇÃO NAS COTAS # 2,5m / 4,5m / 8,0m # ."';
const L2 =
  '"17981-26";"CPTu 1+740 Sec. 1 ";"CPTU";"-25.5499";"-48.5501";"EXECUTADO";"29/09/2026";"";"27,60";"";"**NECESSÁRIA REALIZAÇÃO DE PRÉ FURO DE 9 METROS** PENETRAÇÃO PREVISTA DO CPTU ATÉ 24 METROS"';
const TESTE = '"TESTE";"CPTu-02";"CPTU";"-22.58";"-47.92";"PENDENTE";"08/01/2026";"";"0,00";"";""';
const SPT = '"18205-26";"SP-01";"SPT";"-22.58";"-47.92";"PENDENTE";"08/01/2026";"";"0,00";"";""';

const META = { em: "2026-10-22T10:00:00.000Z", por: "Ana", arquivo: "mapa.csv" };

describe("leitura do extrato da SOND", () => {
  it("interpreta números com vírgula, datas e ignora teste e outros tipos", () => {
    const r = lerExtratoSond(parseCsvSond(csv(L1, L2, TESTE, SPT)));
    expect(r.erro).toBeUndefined();
    expect(r.ignoradas).toBe(2);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toMatchObject({
      os: "18205-26",
      lat: -25.53439937,
      status: "PENDENTE",
      desde: "2026-10-08",
      profundidade: 0,
    });
    expect(r.linhas[1]).toMatchObject({
      identificacao: "CPTu 1+740 Sec. 1",
      status: "EXECUTADO",
      profundidade: 27.6,
    });
  });

  it("acusa arquivo que não é o extrato", () => {
    expect(
      lerExtratoSond([
        ["a", "b"],
        ["1", "2"],
      ]).erro,
    ).toBeTruthy();
  });

  it("extrai profundidade prevista, pré-furo e cotas do critério", () => {
    expect(
      profundidadePrevista("PENETRAÇÃO PREVISTA DO CPTU ATÉ **6 METROS** DE PROFUNDIDADE"),
    ).toBe(6);
    expect(profundidadePrevista("ATÉ 10,0 METROS DE PROFUNDIDADE")).toBe(10);
    expect(profundidadePrevista("ATÉ A LIMITAÇÃO DO EQUIPAMENTO")).toBeNull();
    expect(preFuro("**NECESSIDADE DE ABERTURA DE PRÉ-FURO 14,09 METROS**")).toBe(14.09);
    expect(preFuro("REALIZAR PRÉ-FURO DE 1,5 METRO")).toBe(1.5);
    expect(cotasDissipacao("NAS COTAS # 2,5m / 4,5m / 8,0m # .")).toEqual(["2,5m", "4,5m", "8,0m"]);
  });
});

describe("mescla de importações", () => {
  const primeira = lerExtratoSond(parseCsvSond(csv(L1, L2))).linhas;

  it("cria tudo com os pontos de controle em Não", () => {
    const { doc, resumo } = mesclarImportacao(null, primeira, META);
    expect(resumo).toMatchObject({ total: 2, novos: 2, statusAlterados: 0, ausentes: 0 });
    for (const r of Object.values(doc.registros)) {
      expect(r).toMatchObject({
        recebimentoCampo: false,
        verificacaoBrutos: false,
        relatorio: "NAO",
        observacoes: "",
      });
    }
  });

  it("atualiza status da SOND mas preserva anotações e status internos", () => {
    let { doc } = mesclarImportacao(null, primeira, META);
    const [id1, id2] = Object.keys(doc.registros);
    doc.registros[id1] = aplicarPatch(
      doc.registros[id1],
      { observacoes: "ligar pro cliente", recebimentoCampo: true },
      META.em,
      "Ana",
    );
    doc.registros[id2] = aplicarPatch(doc.registros[id2], { status: "CANCELADO" }, META.em, "Ana");

    const segunda = primeira.map((l) => ({
      ...l,
      status: "EXECUTADO" as const,
      profundidade: 9.5,
    }));
    const out = mesclarImportacao(doc, segunda, { ...META, em: "2026-10-23T10:00:00.000Z" });
    doc = out.doc;
    expect(doc.registros[id1]).toMatchObject({
      status: "EXECUTADO",
      observacoes: "ligar pro cliente",
      recebimentoCampo: true,
      profundidade: 9.5,
    });
    // L2 já era EXECUTADO na SOND — sem mudança lá, o Cancelado da equipe fica.
    expect(doc.registros[id2].status).toBe("CANCELADO");
    expect(out.resumo.statusAlterados).toBe(1);
  });

  it("marca como ausente quem saiu do mapa, sem apagar", () => {
    const { doc } = mesclarImportacao(null, primeira, META);
    const out = mesclarImportacao(doc, primeira.slice(0, 1), META);
    expect(out.resumo.ausentes).toBe(1);
    expect(Object.values(out.doc.registros).filter((r) => r.ausenteNaSond)).toHaveLength(1);
  });
});

describe("edição e resumo", () => {
  it("anota no histórico só o que mudou", () => {
    const { doc } = mesclarImportacao(null, lerExtratoSond(parseCsvSond(csv(L1))).linhas, META);
    const r = Object.values(doc.registros)[0];
    expect(aplicarPatch(r, { observacoes: "" }, META.em, "Ana")).toBe(r);
    const r2 = aplicarPatch(r, { relatorio: "SIM_SOND" }, META.em, "Ana");
    expect(r2.historico.at(-1)).toMatchObject({
      campo: "relatório",
      de: "Não",
      para: "Sim, na Sond",
    });
  });

  it("soma metros executados e previstos dos pendentes", () => {
    const { doc } = mesclarImportacao(null, lerExtratoSond(parseCsvSond(csv(L1, L2))).linhas, META);
    const res = resumir(Object.values(doc.registros), new Date(2026, 9, 22));
    expect(res.pendentes).toBe(1);
    expect(res.metrosExecutados).toBeCloseTo(27.6);
    expect(res.metrosPrevistosPendentes).toBe(10);
    expect(res.semRecebimento).toBe(1);
  });
});
