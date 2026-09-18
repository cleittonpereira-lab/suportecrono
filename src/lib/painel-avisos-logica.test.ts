import { describe, expect, it } from "vitest";
import {
  agoraEmBrasilia,
  avisoDeRisco,
  destinatariosDoPainel,
  horaDoResumo,
  montarResumo,
  noExpediente,
  novosRiscos,
} from "./painel-avisos-logica";
import type { LinhaPrazo, PainelModelo } from "./painel-coordenador";

const AGORA = new Date("2026-09-16T10:30:00Z"); // 07:30 de quarta em Brasília

function prazo(p: Partial<LinhaPrazo> & Pick<LinhaPrazo, "chave" | "situacao">): LinhaPrazo {
  return {
    os: p.chave,
    cliente: "EPR",
    entrega: "2026-09-18",
    fonte: "acordada",
    dataCronograma: "2026-09-18",
    divergente: false,
    previsao: "2026-09-19",
    falta: "1 em bancada",
    diasAtraso: 0,
    motivoRisco: null,
    ensaiosDetalhe: [],
    laudosDetalhe: [],
    ...p,
  };
}

function modelo(tiles: Partial<PainelModelo["tiles"]> = {}, gargalo?: string): PainelModelo {
  return {
    tiles: {
      recebidas: { amostras: 0, registros: 0 },
      aguardandoProgramacao: { total: 0, parados: 0 },
      emAndamento: { total: 12, alemDoPrevisto: 0 },
      entregas7d: { total: 4, emRisco: 0 },
      atrasadas: { total: 0, maiorAtraso: 0 },
      laudosParados: { total: 0, maisAntigoDias: 0 },
      ...tiles,
    },
    esteira: gargalo ? [{ chave: "laudo", nome: gargalo, total: 5, parados: 3, rotuloTotal: "", rotuloParados: "", gargalo: true, destino: { to: "/" } }] : [],
    prazos: [],
    alertas: [],
    bancada: { dias: [], equipamentos: [], tecnicos: [], longos: [] },
    laudos: [],
    detalhes: { recebidas: [], noRecebimento: [], aguardandoProgramacao: [], emAndamento: [], laudosParados: [] },
  };
}

describe("hora em Brasília", () => {
  it("converte o horário do agendamento (UTC)", () => {
    expect(agoraEmBrasilia(AGORA)).toEqual({ hoje: "2026-09-16", hora: 7, diaDaSemana: 3 });
    expect(agoraEmBrasilia(new Date("2026-09-16T02:00:00Z"))).toEqual({ hoje: "2026-09-15", hora: 23, diaDaSemana: 2 });
  });
  it("resumo: dia útil, das 7h às 12h, uma vez por dia", () => {
    const m = agoraEmBrasilia(AGORA);
    expect(horaDoResumo(m, null)).toBe(true);
    expect(horaDoResumo(m, "2026-09-16")).toBe(false);
    expect(horaDoResumo({ ...m, hora: 6 }, null)).toBe(false);
    expect(horaDoResumo({ ...m, diaDaSemana: 6 }, null)).toBe(false);
  });
  it("aviso de risco só no expediente", () => {
    expect(noExpediente({ hoje: "x", hora: 18, diaDaSemana: 5 })).toBe(true);
    expect(noExpediente({ hoje: "x", hora: 19, diaDaSemana: 5 })).toBe(false);
    expect(noExpediente({ hoje: "x", hora: 10, diaDaSemana: 0 })).toBe(false);
  });
});

describe("resumo da manhã", () => {
  it("lista só o que pede atenção, com o gargalo", () => {
    const a = montarResumo(
      modelo({ atrasadas: { total: 2, maiorAtraso: 19 }, entregas7d: { total: 4, emRisco: 1 }, laudosParados: { total: 1, maisAntigoDias: 3 } }, "Laudo"),
      AGORA,
    );
    expect(a.titulo).toBe("Bom dia — resumo do laboratório");
    expect(a.corpo).toBe("2 entregas atrasadas · 1 em risco nos próximos 7 dias · 1 laudo parado. Gargalo: laudo.");
    expect(a.url).toBe("/coordenacao");
  });
  it("sem nada parado, diz isso", () => {
    expect(montarResumo(modelo(), AGORA).corpo).toBe("Nada parado. 12 ensaios em andamento, 4 entregas nos próximos 7 dias.");
  });
});

describe("aviso de risco", () => {
  it("primeira checagem só registra; depois, avisa o que mudou", () => {
    const hoje = [prazo({ chave: "A", situacao: "atraso", diasAtraso: 3 }), prazo({ chave: "B", situacao: "ok" })];
    const primeira = novosRiscos(hoje, null);
    expect(primeira.avisar).toEqual([]);
    expect(primeira.estado).toEqual({ A: "atraso|2026-09-18" });

    const depois = [prazo({ chave: "A", situacao: "atraso", diasAtraso: 4 }), prazo({ chave: "B", situacao: "risco", motivoRisco: "ensaios terminam 19/09" })];
    const r = novosRiscos(depois, primeira.estado);
    expect(r.avisar.map((p) => p.chave)).toEqual(["B"]); // A continua atrasada: não repete
  });
  it("risco que vira atraso avisa de novo; resolvida sai do estado", () => {
    const antes = { A: "risco|2026-09-18", B: "atraso|2026-09-10" };
    const r = novosRiscos([prazo({ chave: "A", situacao: "atraso", diasAtraso: 1 }), prazo({ chave: "B", situacao: "ok" })], antes);
    expect(r.avisar.map((p) => p.chave)).toEqual(["A"]);
    expect(r.estado).toEqual({ A: "atraso|2026-09-18" });
  });
  it("texto do aviso", () => {
    const a = avisoDeRisco(prazo({ chave: "17891-26", situacao: "risco", motivoRisco: "ensaios terminam 19/09" }), AGORA);
    expect(a.titulo).toBe("OS 17891-26 em risco");
    expect(a.corpo).toBe("EPR — Entrega em 18/09: ensaios terminam 19/09. Falta: 1 em bancada.");
  });
});

describe("quem recebe", () => {
  const usuarios = [
    { id: "adm", role: "admin", status: "ativo", tabs: [] },
    { id: "coord", role: "gestor", status: "ativo", tabs: ["painel_coordenador"] },
    { id: "tec", role: "usuario", status: "ativo", tabs: ["digitalizacao"] },
    { id: "bloq", role: "admin", status: "bloqueado", tabs: [] },
  ];
  it("admin e quem tem o painel, contas ativas, respeitando a preferência", () => {
    expect(destinatariosDoPainel(usuarios, {}, "resumo")).toEqual(["adm", "coord"]);
    expect(destinatariosDoPainel(usuarios, { coord: { resumo: false } }, "resumo")).toEqual(["adm"]);
    expect(destinatariosDoPainel(usuarios, { coord: { resumo: false } }, "risco")).toEqual(["adm", "coord"]);
  });
});
