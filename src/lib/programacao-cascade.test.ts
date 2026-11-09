import { describe, expect, it } from "vitest";
import { alvoAposMudanca, cascataDoEquipamento, recalculateDownstream } from "./programacao-cascade";
import type { Programacao } from "./programacao-model";

// Datas de março/2026 (sem feriado): 02 é segunda-feira.
const prog = (
  id: string,
  equipamento: string | null,
  ini: string,
  dur: number,
  extra: Partial<Programacao> = {},
): Programacao => ({
  id,
  ensaio_id: `ens-${id}`,
  equipamento_id: equipamento,
  data_inicio: ini,
  data_fim: null,
  data_inicio_prevista: ini,
  duracao_dias: dur,
  data_inicio_real: null,
  data_fim_real: null,
  inicio_real_ts: null,
  fim_real_ts: null,
  status: "planejado",
  progresso: 0,
  observacoes: null,
  tecnico: null,
  incluir_fds: false,
  predecessor_id: null,
  ...extra,
});

/** Muda a data de `base` para `ini` (como o formulário/arraste fazem) e devolve o alvo. */
const mover = (base: Programacao, ini: string, dur = base.duracao_dias) =>
  alvoAposMudanca(base, { data_inicio_prevista: ini, data_inicio: ini, duracao_dias: dur });

const pos = (mudancas: { id: string; patch: { data_inicio_prevista: string } }[]) =>
  Object.fromEntries(mudancas.map((m) => [m.id, m.patch.data_inicio_prevista]));

describe("cascataDoEquipamento", () => {
  it("empurra os seguintes do mesmo equipamento quando o ensaio atrasa", () => {
    const A = prog("A", "CIS", "2026-03-02", 3); // seg–qua
    const B = prog("B", "CIS", "2026-03-05", 2); // qui–sex
    const C = prog("C", "CIS", "2026-03-09", 1); // seg
    const P = prog("P", "CIS", "2026-02-20", 2); // antes do alvo: não mexe
    const outros = [A, B, C, P];

    const mudancas = cascataDoEquipamento(outros, mover(A, "2026-03-09"));

    expect(pos(mudancas)).toEqual({ B: "2026-03-12", C: "2026-03-16" });
    expect(mudancas.find((m) => m.id === "B")?.patch).toEqual({
      data_inicio_prevista: "2026-03-12",
      data_inicio: "2026-03-12",
      data_fim: "2026-03-13",
    });
  });

  it("não mexe quando ainda sobra folga entre os ensaios", () => {
    const A = prog("A", "CIS", "2026-03-02", 1);
    const B = prog("B", "CIS", "2026-03-10", 1);

    expect(cascataDoEquipamento([A, B], mover(A, "2026-03-03"))).toEqual([]);
  });

  it("adiantar um ensaio não puxa o seguinte para antes", () => {
    const A = prog("A", "CIS", "2026-03-09", 1);
    const B = prog("B", "CIS", "2026-03-10", 1);

    expect(cascataDoEquipamento([A, B], mover(A, "2026-03-02"))).toEqual([]);
  });

  it("ignora ensaios de outro equipamento", () => {
    const A = prog("A", "CIS", "2026-03-02", 3);
    const X = prog("X", "TRIAX", "2026-03-03", 2);

    expect(cascataDoEquipamento([A, X], mover(A, "2026-03-09"))).toEqual([]);
  });

  it("não sobrepõe um ensaio já em andamento no equipamento", () => {
    const A = prog("A", "CIS", "2026-03-02", 1);
    const B = prog("B", "CIS", "2026-03-02", 1);
    const F = prog("F", "CIS", "2026-03-03", 4, {
      status: "em_execucao",
      data_inicio_real: "2026-03-03",
      data_inicio: "2026-03-03",
      data_fim: "2026-03-06",
    });

    // B só cabe depois de F (03 a 06), que não se mexe; 07–08 é fim de semana.
    expect(pos(cascataDoEquipamento([A, B, F], mover(A, "2026-03-02")))).toEqual({ B: "2026-03-09" });
  });

  it("ensaios fracionados dividem o dia até somar 1 dia de equipamento", () => {
    const A = prog("A", "CIS", "2026-03-02", 0.25);
    const B = prog("B", "CIS", "2026-03-02", 0.5); // 0,25 + 0,5 = 0,75: cabe no dia
    const C = prog("C", "CIS", "2026-03-02", 0.75); // 0,75 + 0,75 > 1: vai para o dia seguinte

    expect(pos(cascataDoEquipamento([A, B, C], mover(A, "2026-03-02")))).toEqual({ C: "2026-03-03" });
  });

  it("ensaio inteiro não divide o dia com um fracionado", () => {
    const A = prog("A", "CIS", "2026-03-02", 0.25);
    const B = prog("B", "CIS", "2026-03-02", 1);

    expect(pos(cascataDoEquipamento([A, B], mover(A, "2026-03-02")))).toEqual({ B: "2026-03-03" });
  });

  it("um ensaio em andamento que terminou depois do previsto empurra o seguinte", () => {
    const A = prog("A", "CIS", "2026-03-02", 2, {
      status: "em_execucao",
      data_inicio_real: "2026-03-02",
      data_inicio: "2026-03-02",
    });
    const B = prog("B", "CIS", "2026-03-04", 1);

    // A terminou em 05 (previsto para 03): B, que estava em 04, vai para 06.
    const mudancas = cascataDoEquipamento([A, B], alvoAposMudanca(A, { data_fim: "2026-03-05" }), "2026-03-05");
    expect(pos(mudancas)).toEqual({ B: "2026-03-06" });
  });

  it("trocar de equipamento não empurra os que vinham depois no equipamento antigo", () => {
    const A = prog("A", "CIS", "2026-03-02", 1);
    const C = prog("C", "CIS", "2026-03-05", 1); // depois de A, mas no equipamento antigo
    const Y = prog("Y", "TRIAX", "2026-03-23", 1); // no novo equipamento, depois do novo início

    const alvo = alvoAposMudanca(A, { equipamento_id: "TRIAX", data_inicio_prevista: "2026-03-20", data_inicio: "2026-03-20" });
    expect(cascataDoEquipamento([A, C, Y], alvo)).toEqual([]);
  });

  it("ensaio novo inserido no meio empurra o que sobrepõe", () => {
    const B = prog("B", "CIS", "2026-03-02", 2); // 02–03
    const novo = alvoAposMudanca(null, { equipamento_id: "CIS", data_inicio_prevista: "2026-03-03", duracao_dias: 2 });

    // Novo ocupa 03–04; B precisa começar depois, em 05.
    expect(pos(cascataDoEquipamento([B], novo))).toEqual({ B: "2026-03-05" });
  });

  it("sem equipamento não há cascata", () => {
    const A = prog("A", null, "2026-03-02", 3);
    const B = prog("B", null, "2026-03-03", 1);

    expect(cascataDoEquipamento([A, B], mover(A, "2026-03-09"))).toEqual([]);
  });
});

describe("alvoAposMudanca", () => {
  it("mantém o que não foi alterado e converte equipamento vazio em null", () => {
    const A = prog("A", "CIS", "2026-03-02", 3);
    const novo = alvoAposMudanca(A, { equipamento_id: "" });

    expect(novo.equipamento_id).toBeNull();
    expect(novo.data_inicio_prevista).toBe("2026-03-02");
    expect(novo.duracao_dias).toBe(3);
  });

  it("sem base (ensaio novo) usa o id vazio e os valores padrão", () => {
    const novo = alvoAposMudanca(null, { equipamento_id: "CIS", data_inicio_prevista: "2026-03-02" });

    expect(novo).toMatchObject({ id: "", equipamento_id: "CIS", status: "planejado", duracao_dias: 1 });
  });
});

describe("recalculateDownstream com apenasCadeia", () => {
  it("segue só a cadeia de predecessor_id e ignora o mesmo equipamento", async () => {
    const A = prog("A", "CIS", "2026-03-02", 1);
    const B = prog("B", "OUTRO", "2026-03-10", 1, { predecessor_id: "A" });
    const C = prog("C", "CIS", "2026-03-05", 1); // mesmo equipamento de A, sem predecessor
    const chamadas: string[] = [];

    await recalculateDownstream("A", "2026-03-06", [A, B, C], async (id) => {
      chamadas.push(id);
    }, { apenasCadeia: true });

    expect(chamadas).toEqual(["B"]);
  });
});
