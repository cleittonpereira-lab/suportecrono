import { describe, expect, it } from "vitest";
import {
  eventosDoEnsaio,
  porFamilia,
  porPessoa,
  seriePorDia,
  temposDasEtapas,
  total,
  type EventoDeLaudo,
} from "./painel-laudos";

const agora = Date.parse("2026-09-23T18:00:00Z");
const ev = (
  tipo: EventoDeLaudo["tipo"],
  em: string,
  por = "Ana",
  familia = "triaxial",
): EventoDeLaudo => ({
  tipo,
  em,
  por,
  familia,
});

describe("painel de laudos", () => {
  const eventos = [
    ev("enviado", "2026-09-23T12:00:00Z", "Ana"),
    ev("enviado", "2026-09-23T13:00:00Z", "Bia", "adensamento"),
    ev("enviado", "2026-09-22T13:00:00Z", "Ana"),
    ev("aprovado", "2026-09-22T15:00:00Z", "RT"),
    ev("enviado", "2026-07-01T13:00:00Z", "Ana"), // fora da janela de 30 dias
  ];

  it("conta por dia no fuso de Brasília, com dias vazios", () => {
    const s = seriePorDia(eventos, "enviado", agora, 3);
    expect(s).toEqual([
      { dia: "2026-09-21", n: 0 },
      { dia: "2026-09-22", n: 1 },
      { dia: "2026-09-23", n: 2 },
    ]);
  });

  it("ranking por pessoa e por tipo só na janela", () => {
    expect(porPessoa(eventos, "enviado", agora)).toEqual([
      { nome: "Ana", n: 2 },
      { nome: "Bia", n: 1 },
    ]);
    expect(porFamilia(eventos, "enviado", agora)).toEqual([
      { familia: "triaxial", n: 2 },
      { familia: "adensamento", n: 1 },
    ]);
    expect(total(eventos, "aprovado", agora)).toBe(1);
  });

  it("tempo mediano das etapas em dias úteis", () => {
    const t = temposDasEtapas(
      [
        {
          familia: "triaxial",
          enviado: "2026-09-21T12:00:00Z",
          verificado: "2026-09-22T12:00:00Z",
          aprovado: "2026-09-22T15:00:00Z",
          entregue: null,
        },
      ],
      agora,
    );
    expect(t.amostra).toBe(1);
    expect(t.verificacao).toBeGreaterThan(0.9);
    expect(t.entrega).toBeNull();
  });

  it("devolução conta para quem enviou a revisão, não para o verificador", () => {
    const r = eventosDoEnsaio(
      {
        approvalComments: [
          {
            action: "rejected_verification",
            created_at: "2026-09-22T12:00:00Z",
            author_name: "Verificador",
          },
          { action: "send_verification", created_at: "2026-09-22T10:00:00Z", author_name: "Bia" },
        ],
      },
      "triaxial",
    );
    expect(porPessoa(r.eventos, "devolvido", agora, 30, "dono")).toEqual([{ nome: "Bia", n: 1 }]);
  });
});
