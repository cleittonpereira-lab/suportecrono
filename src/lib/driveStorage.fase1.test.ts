import { describe, expect, it, vi } from "vitest";

// Fase 1 — falha de leitura nunca é "não existe".

vi.mock("./google-auth.server", () => ({
  getGoogleAccessToken: vi.fn(async () => "token-de-teste"),
  isGoogleAuthConfigured: () => true,
}));

// Cache durável desligado de saída: aqui só interessa o comportamento do Drive.
vi.mock("@/integrations/supabase/client.server", () => {
  const erro = { data: null, error: { message: "sem tabela" } };
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => erro,
    upsert: async () => erro,
    delete: () => ({ eq: async () => erro }),
  };
  return { supabaseAdmin: { from: () => q } };
});

type Resposta = { status: number; body?: unknown };

function mockDrive(roteador: (url: string) => Resposta) {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      urls.push(url);
      const r = roteador(url);
      return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status });
    }),
  );
  return urls;
}

async function carregar() {
  vi.resetModules();
  return import("./driveStorage");
}

describe("readDriveJson", () => {
  it("download com 500 persistente ESTOURA — não devolve null", async () => {
    mockDrive((url) =>
      url.includes("alt=media") ? { status: 500 } : { status: 200, body: { files: [{ id: "arq" }] } },
    );
    const { readDriveJson } = await carregar();

    // Antes: null. Quem gravava em seguida tratava como "arquivo novo" e
    // sobrescrevia o laudo com reportApprovals/fotos/payload vazios.
    await expect(readDriveJson("ensaio.json", "pasta")).rejects.toThrow("HTTP 500");
  });

  it("busca por nome com 403 ESTOURA — não responde 'não existe'", async () => {
    mockDrive(() => ({ status: 403 }));
    const { readDriveJson } = await carregar();

    await expect(readDriveJson("ensaio.json", "pasta")).rejects.toThrow("HTTP 403");
  });

  it("arquivo realmente ausente (busca vazia) devolve null", async () => {
    mockDrive(() => ({ status: 200, body: { files: [] } }));
    const { readDriveJson } = await carregar();

    await expect(readDriveJson("nao-existe.json", "pasta")).resolves.toBeNull();
  });

  it("id resolvido que dá 404 é buscado de novo, não declarado inexistente", async () => {
    // O arquivo foi recriado por fora: o 1º id encontrado já não existe.
    let buscas = 0;
    const urls = mockDrive((url) => {
      if (url.includes("alt=media")) {
        if (url.includes("/files/arq-velho")) return { status: 404 };
        return { status: 200, body: { conteudo: "atual" } };
      }
      buscas++;
      return { status: 200, body: { files: [{ id: buscas === 1 ? "arq-velho" : "arq-novo" }] } };
    });
    const { readDriveJson } = await carregar();

    await expect(readDriveJson("x.json", "pasta")).resolves.toEqual({ conteudo: "atual" });
    expect(urls.some((u) => u.includes("/files/arq-novo"))).toBe(true);
  });
});

describe("ensureFolderPath / findFolder", () => {
  it("busca de pasta que falha ESTOURA em vez de criar pasta duplicada", async () => {
    const urls = mockDrive(() => ({ status: 403 }));
    const { ensureFolderPath } = await carregar();

    await expect(ensureFolderPath(["lab-ensaios"])).rejects.toThrow("HTTP 403");
    // Nenhum POST de criação de pasta foi feito.
    expect(urls.every((u) => !u.endsWith("/files?fields=id&supportsAllDrives=true"))).toBe(true);
  });
});
