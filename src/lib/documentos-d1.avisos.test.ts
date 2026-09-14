import { describe, expect, it } from "vitest";
import { d1EmMemoria } from "./d1-em-memoria.test-util";
import { apagarDocumento, atualizarDocumento, gravarDocumento, incluirSeNaoExiste } from "./documentos-d1.server";
import { coletandoMudancas } from "./avisos-mudanca";

describe("gravações no banco entram no aviso de tempo real da requisição", () => {
  it("registra o que mudou; atualização sem mudança e inclusão repetida não", async () => {
    const db = d1EmMemoria();
    const { docs } = await coletandoMudancas(async () => {
      await gravarDocumento(db, "lab-ensaios", "a.json", { n: 1 });
      await atualizarDocumento<{ n: number }>(db, "lab-ensaios", "a.json", (a) => ({ n: (a?.n ?? 0) + 1 }));
      await atualizarDocumento(db, "lab-ensaios", "a.json", () => null);
      await incluirSeNaoExiste(db, "lab-os", "o.json", {});
      await incluirSeNaoExiste(db, "lab-os", "o.json", {});
      await apagarDocumento(db, "lab-pendencias", "p.json");
    });
    expect(docs).toEqual([
      { pasta: "lab-ensaios", nome: "a.json" },
      { pasta: "lab-ensaios", nome: "a.json" },
      { pasta: "lab-os", nome: "o.json" },
      { pasta: "lab-pendencias", nome: "p.json" },
    ]);
  });
});
