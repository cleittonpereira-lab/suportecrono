import { describe, expect, it } from "vitest";
import { d1EmMemoria } from "./d1-em-memoria.test-util";
import {
  apagarDocumento,
  atualizarDocumento,
  gravarDocumento,
  incluirSeNaoExiste,
  lerDocumento,
  lerDocumentos,
  listarDocumentos,
} from "./documentos-d1.server";

describe("documentos no D1", () => {
  it("grava, lê e sobe a revisão a cada gravação", async () => {
    const db = d1EmMemoria();
    expect(await gravarDocumento(db, "lab-os", "os_1.json", { numero: "17960-26" })).toBe(1);
    expect(await gravarDocumento(db, "lab-os", "os_1.json", { numero: "17960-26", client: "F.X." })).toBe(2);
    await expect(lerDocumento(db, "lab-os", "os_1.json")).resolves.toEqual({
      dados: { numero: "17960-26", client: "F.X." },
      rev: 2,
    });
    await expect(lerDocumento(db, "lab-os", "nao-existe.json")).resolves.toBeNull();
  });

  it("lista a pasta sem o conteúdo e lê vários de uma vez", async () => {
    const db = d1EmMemoria();
    await gravarDocumento(db, "lab-ensaios", "a.json", { n: 1 });
    await gravarDocumento(db, "lab-ensaios", "b.json", { n: 2 });
    await gravarDocumento(db, "lab-os", "c.json", { n: 3 });

    const lista = await listarDocumentos(db, "lab-ensaios");
    expect(lista.map((d) => [d.nome, d.rev])).toEqual([["a.json", 1], ["b.json", 1]]);

    const lidos = await lerDocumentos<{ n: number }>(db, "lab-ensaios", ["a.json", "b.json", "sumiu.json"]);
    expect([...lidos.entries()].map(([nome, d]) => [nome, d.dados.n])).toEqual([["a.json", 1], ["b.json", 2]]);
  });

  it("duas alterações simultâneas no mesmo documento: nenhuma se perde", async () => {
    // No Drive, as duas liam n=0 e a segunda gravava n=1 por cima da primeira.
    const db = d1EmMemoria();
    await gravarDocumento(db, "lab-pendencias", "p.json", { n: 0 });
    const somar = () =>
      atualizarDocumento<{ n: number }>(db, "lab-pendencias", "p.json", async (atual) => {
        await new Promise((r) => setTimeout(r, 5)); // as duas leem antes de qualquer uma gravar
        return { n: (atual?.n ?? 0) + 1 };
      });

    await Promise.all([somar(), somar(), somar()]);

    await expect(lerDocumento(db, "lab-pendencias", "p.json")).resolves.toMatchObject({ dados: { n: 3 } });
  });

  it("alterar devolvendo null não grava; documento novo nasce com rev 1", async () => {
    const db = d1EmMemoria();
    await atualizarDocumento(db, "lab-kv", "x.json", () => null);
    await expect(lerDocumento(db, "lab-kv", "x.json")).resolves.toBeNull();

    await atualizarDocumento(db, "lab-kv", "x.json", () => ({ v: 1 }));
    await expect(lerDocumento(db, "lab-kv", "x.json")).resolves.toEqual({ dados: { v: 1 }, rev: 1 });
  });

  it("importação nunca sobrescreve o que já está no banco", async () => {
    const db = d1EmMemoria();
    await gravarDocumento(db, "usuarios", "u.json", { nome: "atual" });
    expect(await incluirSeNaoExiste(db, "usuarios", "u.json", { nome: "do Drive" })).toBe(false);
    expect(await incluirSeNaoExiste(db, "usuarios", "v.json", { nome: "novo" })).toBe(true);
    await expect(lerDocumento(db, "usuarios", "u.json")).resolves.toMatchObject({ dados: { nome: "atual" } });
  });

  it("registro acima do limite do banco é recusado com mensagem clara", async () => {
    const db = d1EmMemoria();
    await expect(
      gravarDocumento(db, "lab-ensaios", "grande.json", { foto: "data:image/jpeg;base64," + "A".repeat(2_000_000) }),
    ).rejects.toThrow("Imagens precisam ir como arquivo");
  });

  it("apaga", async () => {
    const db = d1EmMemoria();
    await gravarDocumento(db, "os-hub", "17960-26.json", { arquivada: false });
    await apagarDocumento(db, "os-hub", "17960-26.json");
    await expect(lerDocumento(db, "os-hub", "17960-26.json")).resolves.toBeNull();
  });
});
