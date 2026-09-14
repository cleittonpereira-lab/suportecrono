import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { d1EmMemoria } from "./d1-em-memoria.test-util";
import { imagensEmbutidas, trocarImagens, type Quadro } from "./chegada-fotos.server";

vi.mock("./google-auth.server", () => ({
  getGoogleAccessToken: vi.fn(async () => "token-de-teste"),
  isGoogleAuthConfigured: () => true,
}));

const FOTO = "data:image/jpeg;base64," + "A".repeat(20_000);
const ASSINATURA = "data:image/png;base64," + "B".repeat(12_000);

function quadroAntigo(): Quadro {
  return {
    rev: 41,
    columns: [],
    tasks: {
      "os-sistema": [
        {
          id: "amostra_mtbk53nm_yl7n0",
          images: [FOTO, "/api/photo/ja-arquivo"],
          // Campo novo: a mesma foto de `images` (os campos antigos são derivados destes).
          amostras: [{ id: "a1", fotos: [{ url: FOTO, capturedAt: "x" }] }],
          assinaturaCliente: { imagemUrl: ASSINATURA, nome: "Cliente", assinadoEm: "x" },
        },
      ],
      registro: [{ id: "amostra_nova", images: ["/api/photo/nova"], amostras: [] }],
    },
  };
}

describe("imagens do quadro de Chegada", () => {
  it("acha as imagens em texto sem repetir a que aparece em dois campos", () => {
    const imgs = imagensEmbutidas(quadroAntigo());
    expect(imgs.map((i) => i.mimeType)).toEqual(["image/jpeg", "image/png"]);
    expect(imgs[0].nome).toMatch(/^migr_chegada_amostra_mtbk53nm_yl7n0_[0-9a-z]+\.jpeg$/);
  });

  it("troca em todos os campos; o que já é arquivo não muda", () => {
    const enderecos = new Map([
      [FOTO, "/api/photo/f1"],
      [ASSINATURA, "/api/photo/s1"],
    ]);
    const { quadro, trocadas } = trocarImagens(quadroAntigo(), enderecos);
    const t = quadro.tasks["os-sistema"][0];
    expect(trocadas).toBe(3);
    expect(t.images).toEqual(["/api/photo/f1", "/api/photo/ja-arquivo"]);
    expect(t.amostras?.[0].fotos?.[0]).toEqual({ url: "/api/photo/f1", capturedAt: "x" });
    expect(t.assinaturaCliente).toEqual({ imagemUrl: "/api/photo/s1", nome: "Cliente", assinadoEm: "x" });
    expect(quadro.tasks.registro[0].images).toEqual(["/api/photo/nova"]);
  });
});

describe("tirar as imagens do quadro (com o banco ligado)", () => {
  let enviadas: string[];

  beforeEach(() => {
    enviadas = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("/upload/drive/v3/files")) {
          enviadas.push(url);
          return new Response(JSON.stringify({ id: `arq-${enviadas.length}` }), { status: 200 });
        }
        const q = new URL(url).searchParams.get("q") ?? "";
        const pasta = q.includes("mimeType = 'application/vnd.google-apps.folder'");
        return new Response(JSON.stringify({ files: pasta ? [{ id: "p-fotos" }] : [] }), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    delete (globalThis as { __env__?: unknown }).__env__;
  });

  it("envia cada imagem uma vez, troca no quadro, sobe a revisão e não deixa texto de imagem", async () => {
    const db = d1EmMemoria();
    (globalThis as { __env__?: unknown }).__env__ = { DB: db, DADOS_NO_D1: "1" };
    vi.resetModules();
    const { gravarDocumento, lerDocumento } = await import("./documentos-d1.server");
    const { tirarImagensDoQuadro } = await import("./chegada-fotos.server");
    await gravarDocumento(db, "raiz", "_chegada-amostras.json", quadroAntigo());

    const simulado = await tirarImagensDoQuadro(true);
    expect(simulado).toMatchObject({ imagensEmbutidas: 2, enviadas: 0, restantes: 2 });
    expect(enviadas).toEqual([]);

    const r = await tirarImagensDoQuadro(false);
    expect(r).toMatchObject({ imagensEmbutidas: 2, enviadas: 2, trocadas: 3, restantes: 0 });
    expect(r.bytesDepois).toBeLessThan(2_000);

    const doc = await lerDocumento<Quadro>(db, "raiz", "_chegada-amostras.json");
    expect(doc?.dados.rev).toBe(42);
    expect(JSON.stringify(doc?.dados)).not.toContain("data:image");

    // Repetir não envia nada nem muda o quadro.
    const denovo = await tirarImagensDoQuadro(false);
    expect(denovo).toMatchObject({ imagensEmbutidas: 0, trocadas: 0 });
    expect(enviadas).toHaveLength(2);
  });
});
