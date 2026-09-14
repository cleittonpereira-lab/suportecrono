import { describe, expect, it } from "vitest";
import { coletandoMudancas, registrarMudanca } from "./avisos-mudanca";

describe("registro das gravações de uma requisição", () => {
  it("fora de uma requisição, registrar não faz nada", () => {
    expect(() => registrarMudanca("lab-ensaios", "a.json")).not.toThrow();
  });

  it("junta o que foi gravado, inclusive depois de esperas", async () => {
    const { resultado, docs } = await coletandoMudancas(async () => {
      registrarMudanca("lab-ensaios", "a.json");
      await new Promise((r) => setTimeout(r, 5));
      await Promise.all([
        (async () => registrarMudanca("lab-pendencias", "p.json"))(),
        (async () => {
          await Promise.resolve();
          registrarMudanca("lab-ensaios", "b.json");
        })(),
      ]);
      return 42;
    });
    expect(resultado).toBe(42);
    expect(docs).toEqual([
      { pasta: "lab-ensaios", nome: "a.json" },
      { pasta: "lab-pendencias", nome: "p.json" },
      { pasta: "lab-ensaios", nome: "b.json" },
    ]);
  });

  it("requisições simultâneas não misturam o que cada uma gravou", async () => {
    const [a, b] = await Promise.all([
      coletandoMudancas(async () => {
        await new Promise((r) => setTimeout(r, 5));
        registrarMudanca("lab-os", "a.json");
      }),
      coletandoMudancas(async () => {
        registrarMudanca("lab-os", "b.json");
      }),
    ]);
    expect(a.docs).toEqual([{ pasta: "lab-os", nome: "a.json" }]);
    expect(b.docs).toEqual([{ pasta: "lab-os", nome: "b.json" }]);
  });
});
