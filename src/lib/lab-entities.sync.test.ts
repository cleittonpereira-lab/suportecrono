import { describe, expect, it, vi } from "vitest";

// Credenciais do Drive "configuradas", sem rede de verdade.
vi.mock("./google-auth.server", () => ({
  getGoogleAccessToken: vi.fn(async () => "token-de-teste"),
  isGoogleAuthConfigured: () => true,
}));


type Arquivo = { id: string; name: string; version: string; conteudo: unknown };

const PASTAS: Record<string, string> = { "lab-os": "p-os", "lab-amostras": "p-am", "lab-ensaios": "p-en" };
const datas = { createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z" };

function acervo(versaoDoEnsaio = "4"): Record<string, Arquivo[]> {
  return {
    "p-os": [{ id: "f-os", name: "os_1.json", version: "1", conteudo: { id: "os_1", numero: "17960-26", rev: 1, ...datas } }],
    "p-am": [
      {
        id: "f-am",
        name: "os_1__am_1.json",
        version: "1",
        conteudo: { id: "am_1", osId: "os_1", reportNumber: "13735-02", photos: [], rev: 1, ...datas },
      },
    ],
    "p-en": [
      {
        id: "f-en",
        name: "am_1__en_1.json",
        version: versaoDoEnsaio,
        conteudo: { id: "en_1", amostraId: "am_1", tipo: "compressao-simples", status: "rascunho", photos: [], payload: { x: 1 }, rev: 1, ...datas },
      },
    ],
  };
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** Drive falso com as três pastas da árvore; conta listagens e downloads. */
function driveFalso(porPasta: Record<string, Arquivo[]>) {
  const chamadas = { listagem: 0, download: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("alt=media")) {
        chamadas.download++;
        const id = url.split("/files/")[1].split("?")[0];
        const a = Object.values(porPasta).flat().find((x) => x.id === id);
        return a ? json(a.conteudo) : new Response("", { status: 404 });
      }
      const q = new URL(url).searchParams.get("q") ?? "";
      if (q.includes("mimeType = 'application/vnd.google-apps.folder'")) {
        const nome = q.match(/name = '([^']+)'/)?.[1] ?? "";
        return json({ files: PASTAS[nome] ? [{ id: PASTAS[nome] }] : [] });
      }
      chamadas.listagem++;
      const pai = q.match(/'([^']+)' in parents/)?.[1] ?? "";
      return json({ files: (porPasta[pai] ?? []).map(({ id, name, version }) => ({ id, name, version })) });
    }),
  );
  return chamadas;
}

/** Módulo novo por teste: sem nada no cache de conteúdo da isolate. */
async function carregar() {
  vi.resetModules();
  return import("./lab-entities.functions");
}

describe("syncLabTree (montarRespostaSync)", () => {
  it("cliente sem nada: lê tudo e devolve a árvore toda", async () => {
    const chamadas = driveFalso(acervo());
    const { montarRespostaSync } = await carregar();

    const r = await montarRespostaSync({});

    expect(r.os.map((l) => l.dados.numero)).toEqual(["17960-26"]);
    expect(r.ensaios.map((l) => [l.dados.id, l.dados.amostraId, l.version])).toEqual([["en_1", "am_1", "4"]]);
    expect(chamadas.download).toBe(3);
  });

  it("cliente em dia: só as 3 listagens, nenhum download, nenhuma linha", async () => {
    const chamadas = driveFalso(acervo());
    const { montarRespostaSync } = await carregar();

    const r = await montarRespostaSync({ "f-os": "1", "f-am": "1", "f-en": "4" });

    expect(chamadas.listagem).toBe(3);
    expect(chamadas.download).toBe(0);
    expect([r.os, r.amostras, r.ensaios]).toEqual([[], [], []]);
    expect(r.ordem).toEqual({ os: ["f-os"], amostras: ["f-am"], ensaios: ["f-en"] });
  });

  it("só o ensaio alterado vem de novo", async () => {
    const chamadas = driveFalso(acervo("5"));
    const { montarRespostaSync } = await carregar();

    const r = await montarRespostaSync({ "f-os": "1", "f-am": "1", "f-en": "4" });

    expect(chamadas.download).toBe(1);
    expect(r.os).toEqual([]);
    expect(r.ensaios.map((l) => l.version)).toEqual(["5"]);
  });
});
