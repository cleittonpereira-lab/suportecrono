import { describe, expect, it } from "vitest";
import { juntarDocs, lerAviso, lerMensagemDoCliente, listaDePresenca, outrosNoMesmoLugar, type Presente } from "./sala-logica";

const p = (id: string, userId: string, nome: string, onde: string | null): Presente => ({
  id,
  userId,
  nome,
  onde,
  desde: "2026-09-14T12:00:00Z",
});

describe("lerMensagemDoCliente", () => {
  it("aceita só a mensagem de onde a aba está", () => {
    expect(lerMensagemDoCliente(JSON.stringify({ t: "onde", onde: "os/1/amostra/2/ensaio/3" }))).toEqual({
      t: "onde",
      onde: "os/1/amostra/2/ensaio/3",
    });
    expect(lerMensagemDoCliente(JSON.stringify({ t: "onde", onde: null }))).toEqual({ t: "onde", onde: null });
  });

  it("ignora lixo, tipos desconhecidos e mensagens enormes", () => {
    expect(lerMensagemDoCliente("ping")).toBeNull();
    expect(lerMensagemDoCliente(JSON.stringify({ t: "apagar-tudo" }))).toBeNull();
    expect(lerMensagemDoCliente(JSON.stringify({ t: "onde", onde: 42 }))).toBeNull();
    expect(lerMensagemDoCliente("x".repeat(5000))).toBeNull();
    expect(lerMensagemDoCliente(new ArrayBuffer(4))).toBeNull();
  });
});

describe("aviso de gravação", () => {
  it("lê só documentos válidos", () => {
    expect(lerAviso({ docs: [{ pasta: "lab-ensaios", nome: "a.json" }, { pasta: 1 }, null] })).toEqual([
      { pasta: "lab-ensaios", nome: "a.json" },
    ]);
    expect(lerAviso(null)).toEqual([]);
    expect(lerAviso({ docs: "x" })).toEqual([]);
  });

  it("um aviso por documento, mesmo gravado várias vezes na mesma requisição", () => {
    expect(
      juntarDocs([
        { pasta: "lab-ensaios", nome: "a.json" },
        { pasta: "lab-pendencias", nome: "p.json" },
        { pasta: "lab-ensaios", nome: "a.json" },
      ]),
    ).toEqual([
      { pasta: "lab-ensaios", nome: "a.json" },
      { pasta: "lab-pendencias", nome: "p.json" },
    ]);
  });
});

describe("presença", () => {
  it("lista em ordem de nome, sem conexões inválidas", () => {
    expect(listaDePresenca([p("2", "u2", "Bruno", null), null, p("1", "u1", "Ana", null)]).map((x) => x.nome)).toEqual([
      "Ana",
      "Bruno",
    ]);
  });

  it("quem mais está no mesmo laudo: sem esta aba e sem a mesma pessoa em outra aba", () => {
    const lista = [
      p("a", "u1", "Ana", "laudo-1"), // esta aba
      p("b", "u1", "Ana", "laudo-1"), // Ana em outra aba
      p("c", "u2", "Bruno", "laudo-1"),
      p("d", "u3", "Carla", "laudo-2"),
    ];
    expect(outrosNoMesmoLugar(lista, { id: "a", userId: "u1" }, "laudo-1").map((x) => x.nome)).toEqual(["Bruno"]);
    expect(outrosNoMesmoLugar(lista, { id: "a", userId: "u1" }, null)).toEqual([]);
  });
});
