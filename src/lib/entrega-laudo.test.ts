import { describe, expect, it } from "vitest";
import { marcarEntrega, situacaoDaEntrega } from "./entrega-laudo";

const marca = (em: string) => ({ em, por: "u1", porNome: "Ana" });

describe("entrega do laudo", () => {
  it("só com SOND e GDrive o laudo está entregue", () => {
    let e = marcarEntrega(null, 0, "sond", marca("2026-09-23T10:00:00Z"));
    expect(situacaoDaEntrega(e, 0).entregue).toBe(false);
    e = marcarEntrega(e, 0, "gdrive", marca("2026-09-23T11:00:00Z"));
    const s = situacaoDaEntrega(e, 0);
    expect(s.entregue).toBe(true);
    expect(s.entregueEm).toBe("2026-09-23T11:00:00Z");
  });

  it("nova revisão aprovada zera a entrega (precisa entregar de novo)", () => {
    const e = marcarEntrega(marcarEntrega(null, 0, "sond", marca("a")), 0, "gdrive", marca("b"));
    expect(situacaoDaEntrega(e, 1)).toMatchObject({ sond: null, gdrive: null, entregue: false });
    const nova = marcarEntrega(e, 1, "sond", marca("c"));
    expect(nova).toEqual({ rev: 1, sond: marca("c") });
  });

  it("desmarcar volta a faltar entregar", () => {
    const e = marcarEntrega(marcarEntrega(null, 2, "sond", marca("a")), 2, "gdrive", marca("b"));
    expect(situacaoDaEntrega(marcarEntrega(e, 2, "gdrive", null), 2).entregue).toBe(false);
  });

  it("laudo não aprovado não tem entrega", () => {
    expect(situacaoDaEntrega({ rev: 0, sond: marca("a"), gdrive: marca("b") }, null).entregue).toBe(
      false,
    );
  });
});
