import { describe, expect, it } from "vitest";
import {
  aplicarOperacao,
  type OperacaoAta,
  copiaParaReuniaoNova,
  diasParaPrazo,
  itemAtrasado,
  nomeDoArquivoDaAta,
  novoItem,
  pendenciasAnteriores,
  pendenciasDoGrupo,
  proximoNumero,
  resumirReuniao,
  reuniaoAnterior,
  renumerarPorData,
  tituloDaReuniao,
  type ItemAta,
  type Reuniao,
} from "./atas-qualidade";

const AGORA = "2026-10-01T12:00:00.000Z";
const HOJE = "2026-10-01";

function item(p: Partial<ItemAta> & { id: string }): ItemAta {
  return novoItem({ descricao: `Item ${p.id}`, ...p }, "Ana", AGORA, p.id);
}

function reuniao(p: Partial<Reuniao> & { id: string; numero: number; data: string }): Reuniao {
  return {
    grupo: "GT",
    titulo: `Reunião ${p.numero}`,
    horaInicio: "09:00",
    horaFim: "",
    local: "Sala 1",
    pauta: "",
    observacoes: "",
    participantes: [],
    itens: [],
    status: "encerrada",
    redator: "Ana",
    criadaPor: "Ana",
    criadaEm: AGORA,
    atualizadaEm: AGORA,
    encerradaEm: null,
    encerradaPor: null,
    ...p,
  };
}

describe("situação dos itens", () => {
  it("só ação pendente ou em andamento vence", () => {
    expect(itemAtrasado({ tipo: "acao", status: "pendente", prazo: "2026-09-30" }, HOJE)).toBe(true);
    expect(itemAtrasado({ tipo: "acao", status: "pendente", prazo: "2026-10-01" }, HOJE)).toBe(false);
    expect(itemAtrasado({ tipo: "acao", status: "concluida", prazo: "2026-09-01" }, HOJE)).toBe(false);
    expect(itemAtrasado({ tipo: "decisao", status: "pendente", prazo: "2026-09-01" }, HOJE)).toBe(false);
    expect(itemAtrasado({ tipo: "acao", status: "pendente", prazo: null }, HOJE)).toBe(false);
  });

  it("dias para o prazo: positivo é atraso", () => {
    expect(diasParaPrazo("2026-09-28", HOJE)).toBe(3);
    expect(diasParaPrazo("2026-10-04", HOJE)).toBe(-3);
    expect(diasParaPrazo(null, HOJE)).toBeNull();
  });

  it("o resumo ignora ações transferidas e canceladas", () => {
    const r = reuniao({
      id: "a", numero: 1, data: "2026-09-01",
      itens: [
        item({ id: "1", status: "concluida" }),
        item({ id: "2", status: "pendente", prazo: "2026-09-10" }),
        item({ id: "3", status: "transferida" }),
        item({ id: "4", status: "cancelada" }),
        item({ id: "5", tipo: "decisao" }),
        item({ id: "6", tipo: "informe" }),
      ],
    });
    expect(resumirReuniao(r, HOJE)).toEqual({
      acoes: 2, concluidas: 1, emAberto: 1, atrasadas: 1, decisoes: 1, informes: 1, percentualConcluido: 50,
    });
  });
});

describe("encadeamento das reuniões", () => {
  const r1 = reuniao({ id: "r1", numero: 1, data: "2026-08-01", itens: [item({ id: "a", status: "pendente" }), item({ id: "b", status: "concluida" })] });
  const r2 = reuniao({ id: "r2", numero: 2, data: "2026-09-01", itens: [item({ id: "c", status: "em_andamento" })] });
  const r3 = reuniao({ id: "r3", numero: 3, data: "2026-10-01", status: "em_andamento" });
  const outro = reuniao({ id: "x1", numero: 1, data: "2026-09-15", grupo: "Outro", itens: [item({ id: "z" })] });
  const todas = [r3, outro, r1, r2];

  it("acha a reunião anterior só dentro do mesmo grupo", () => {
    expect(reuniaoAnterior(todas, r3)?.id).toBe("r2");
    expect(reuniaoAnterior(todas, r1)).toBeNull();
    expect(reuniaoAnterior(todas, outro)).toBeNull();
  });

  it("lista as pendências abertas das anteriores, mais antigas primeiro", () => {
    expect(pendenciasAnteriores(todas, r3).map((p) => p.item.id)).toEqual(["a", "c"]);
    expect(pendenciasDoGrupo(todas, "GT").map((p) => p.item.id)).toEqual(["a", "c"]);
  });

  it("numera a próxima reunião por grupo", () => {
    expect(proximoNumero(todas, "GT")).toBe(4);
    expect(proximoNumero(todas, "Outro")).toBe(2);
    expect(proximoNumero(todas, "Novo")).toBe(1);
  });
});

describe("operações", () => {
  const base = reuniao({ id: "r", numero: 1, data: "2026-10-01", status: "em_andamento" });

  it("adiciona item uma vez só mesmo se a tela repetir o envio", () => {
    const o: OperacaoAta = { op: "item_novo", id: "i1", item: { descricao: "  Revisar POP-01 ", responsaveis: ["Bia", " bia ", ""] } };
    const um = aplicarOperacao(base, o, "Ana", AGORA);
    const dois = aplicarOperacao(um, o, "Ana", AGORA);
    expect(dois.itens).toHaveLength(1);
    expect(dois.itens[0]).toMatchObject({ descricao: "Revisar POP-01", responsaveis: ["Bia"], status: "pendente", tipo: "acao" });
  });

  it("ignora item sem descrição", () => {
    const r = aplicarOperacao(base, { op: "item_novo", id: "i1", item: { descricao: "   " } }, "Ana", AGORA);
    expect(r.itens).toHaveLength(0);
  });

  it("concluir grava quem e quando; reabrir apaga", () => {
    let r = aplicarOperacao(base, { op: "item_novo", id: "i1", item: { descricao: "X" } }, "Ana", AGORA);
    r = aplicarOperacao(r, { op: "item_alterar", itemId: "i1", campos: { status: "concluida" } }, "Caio", "2026-10-02T10:00:00.000Z");
    expect(r.itens[0]).toMatchObject({ status: "concluida", concluidoPor: "Caio", concluidoEm: "2026-10-02T10:00:00.000Z" });
    r = aplicarOperacao(r, { op: "item_alterar", itemId: "i1", campos: { status: "pendente" } }, "Caio", AGORA);
    expect(r.itens[0]).toMatchObject({ status: "pendente", concluidoPor: null, concluidoEm: null });
  });

  it("não deixa marcar manualmente como transferida", () => {
    let r = aplicarOperacao(base, { op: "item_novo", id: "i1", item: { descricao: "X" } }, "Ana", AGORA);
    r = aplicarOperacao(r, { op: "item_alterar", itemId: "i1", campos: { status: "transferida" } }, "Ana", AGORA);
    expect(r.itens[0].status).toBe("pendente");
  });

  it("descrição vazia na edição mantém a anterior", () => {
    let r = aplicarOperacao(base, { op: "item_novo", id: "i1", item: { descricao: "Original" } }, "Ana", AGORA);
    r = aplicarOperacao(r, { op: "item_alterar", itemId: "i1", campos: { descricao: "  " } }, "Ana", AGORA);
    expect(r.itens[0].descricao).toBe("Original");
  });

  it("participantes: tira repetidos e vazios", () => {
    const r = aplicarOperacao(
      base,
      {
        op: "participantes",
        participantes: [
          { nome: " Ana  Souza ", presente: true, funcao: "", externo: false },
          { nome: "ana souza", presente: false, funcao: "", externo: false },
          { nome: "", presente: true, funcao: "", externo: false },
        ],
      },
      "Ana",
      AGORA,
    );
    expect(r.participantes).toEqual([{ nome: "Ana Souza", presente: true, funcao: "", externo: false }]);
  });

  it("encerrar grava quem e quando; reabrir limpa", () => {
    let r = aplicarOperacao(base, { op: "status", status: "encerrada" }, "Ana", AGORA);
    expect(r).toMatchObject({ status: "encerrada", encerradaEm: AGORA, encerradaPor: "Ana" });
    r = aplicarOperacao(r, { op: "status", status: "em_andamento" }, "Ana", AGORA);
    expect(r).toMatchObject({ status: "em_andamento", encerradaEm: null, encerradaPor: null });
  });

  it("data inválida não troca a data da reunião", () => {
    const r = aplicarOperacao(base, { op: "dados", campos: { data: "amanhã" } }, "Ana", AGORA);
    expect(r.data).toBe("2026-10-01");
  });
});

describe("trazer pendência para a reunião nova", () => {
  it("a cópia fica pendente, ligada à origem e com o mesmo prazo e responsáveis", () => {
    const antiga = reuniao({ id: "r1", numero: 1, data: "2026-08-01" });
    const it0 = item({ id: "a", responsaveis: ["Bia"], prazo: "2026-09-01", status: "em_andamento" });
    const c = copiaParaReuniaoNova(antiga, it0, "Ana", AGORA, "nova");
    expect(c).toMatchObject({
      id: "nova",
      status: "em_andamento",
      prazo: "2026-09-01",
      responsaveis: ["Bia"],
      origem: { reuniaoId: "r1", itemId: "a", reuniaoNumero: 1, reuniaoData: "2026-08-01" },
    });
  });
});

describe("nome do arquivo", () => {
  it("sem acento e com número de dois dígitos", () => {
    expect(nomeDoArquivoDaAta({ grupo: "Grupo de trabalho ISO 17025", numero: 3, data: "2026-10-01" })).toBe(
      "Ata_Grupo_de_trabalho_ISO_17025_03_2026-10-01.pdf",
    );
  });
});

describe("numeração pela data", () => {
  it("a mais antiga é a nº 1, mesmo criada depois; e acerta as referências dos itens", () => {
    const nova = reuniao({ id: "b", numero: 1, data: "2026-10-10", criadaEm: "2026-09-01T00:00:00.000Z" });
    const velha = reuniao({
      id: "a", numero: 2, data: "2026-09-24", criadaEm: "2026-09-30T00:00:00.000Z",
      itens: [{ ...item({ id: "x", status: "transferida" }), transferidaPara: { reuniaoId: "b", reuniaoNumero: 1, reuniaoData: "2026-10-10" } }],
    });
    const nova2 = { ...nova, itens: [item({ id: "y", origem: { reuniaoId: "a", itemId: "x", reuniaoNumero: 2, reuniaoData: "2026-09-24" } })] };
    const outra = reuniao({ id: "c", numero: 7, data: "2026-01-01", grupo: "Outro" });
    const r = renumerarPorData([nova2, velha, outra]);
    const por = Object.fromEntries(r.map((x) => [x.id, x]));
    expect(por.a.numero).toBe(1);
    expect(por.b.numero).toBe(2);
    expect(por.c.numero).toBe(1);
    expect(por.b.itens[0].origem?.reuniaoNumero).toBe(1);
    expect(por.a.itens[0].transferidaPara?.reuniaoNumero).toBe(2);
  });

  it("no mesmo dia, a de horário mais cedo vem antes", () => {
    const r = renumerarPorData([
      reuniao({ id: "t", numero: 1, data: "2026-10-01", horaInicio: "14:00" }),
      reuniao({ id: "m", numero: 2, data: "2026-10-01", horaInicio: "08:30" }),
    ]);
    expect(r.find((x) => x.id === "m")?.numero).toBe(1);
  });
});

describe("título", () => {
  it("o padrão antigo segue o número pela data; título próprio fica", () => {
    expect(tituloDaReuniao({ titulo: "Reunião nº 2", numero: 1 })).toBe("Reunião nº 1");
    expect(tituloDaReuniao({ titulo: "", numero: 3 })).toBe("Reunião nº 3");
    expect(tituloDaReuniao({ titulo: "Análise crítica", numero: 3 })).toBe("Análise crítica");
  });
});
