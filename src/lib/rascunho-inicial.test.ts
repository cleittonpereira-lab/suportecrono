import { describe, expect, it } from "vitest";
import { escolherRascunhoInicial } from "./rascunho-inicial";

type Rascunho = { sample: { description: string }; rev?: number; savedAt?: string };

describe("escolherRascunhoInicial", () => {
  it("cópia do labStore mais velha que o rascunho local NÃO apaga a edição", () => {
    // Cenário do bug: o usuário editou o cadastro da amostra, o rascunho foi ao
    // servidor (rev 8) e o local ficou com rev 8. A cópia do ensaio no labStore
    // ficou na versão anterior (backup do labStore sem espaço no localStorage,
    // ou leitura atrasada do servidor). Ao recarregar, a busca remota não traz
    // nada (8 <= 8) — então o estado inicial decide o que aparece na tela.
    const doEnsaio: Rascunho = { sample: { description: "antiga" }, rev: 6, savedAt: "2026-10-30T20:40:00.000Z" };
    const local: Rascunho = { sample: { description: "nova" }, rev: 8, savedAt: "2026-10-30T20:46:00.000Z" };
    expect(escolherRascunhoInicial(doEnsaio, local)?.sample.description).toBe("nova");
  });

  it("rascunho que veio do servidor (rev maior) vence o local antigo", () => {
    const doEnsaio: Rascunho = { sample: { description: "de outro computador" }, rev: 9, savedAt: "2026-10-30T20:50:00.000Z" };
    const local: Rascunho = { sample: { description: "velha" }, rev: 4, savedAt: "2026-10-29T10:00:00.000Z" };
    expect(escolherRascunhoInicial(doEnsaio, local)?.sample.description).toBe("de outro computador");
  });

  it("mesma rev: vence o salvo por último", () => {
    const doEnsaio: Rascunho = { sample: { description: "antes" }, rev: 5, savedAt: "2026-10-30T20:00:00.000Z" };
    const local: Rascunho = { sample: { description: "depois" }, rev: 5, savedAt: "2026-10-30T20:05:00.000Z" };
    expect(escolherRascunhoInicial(doEnsaio, local)?.sample.description).toBe("depois");
    expect(escolherRascunhoInicial(local, doEnsaio)?.sample.description).toBe("depois");
  });

  it("payload do ensaio sem rev/savedAt (gravado pela própria tela) não vence o rascunho local", () => {
    const doEnsaio: Rascunho = { sample: { description: "antiga" } };
    const local: Rascunho = { sample: { description: "nova" }, rev: 3, savedAt: "2026-10-30T20:46:00.000Z" };
    expect(escolherRascunhoInicial(doEnsaio, local)?.sample.description).toBe("nova");
  });

  it("só uma fonte disponível: usa ela", () => {
    const r: Rascunho = { sample: { description: "x" } };
    expect(escolherRascunhoInicial(r, null)).toBe(r);
    expect(escolherRascunhoInicial(undefined, r)).toBe(r);
    expect(escolherRascunhoInicial(undefined, null)).toBeUndefined();
  });
});
