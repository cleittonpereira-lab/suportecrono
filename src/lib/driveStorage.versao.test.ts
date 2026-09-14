import { describe, expect, it, vi } from "vitest";

// Credenciais do Drive "configuradas", sem rede de verdade.
vi.mock("./google-auth.server", () => ({
  getGoogleAccessToken: vi.fn(async () => "token-de-teste"),
  isGoogleAuthConfigured: () => true,
}));

// Como em produção hoje: a tabela drive_file_cache não existe.
vi.mock("@/integrations/supabase/client.server", () => {
  const semTabela = { data: null, error: { message: 'relation "drive_file_cache" does not exist' } };
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: async () => semTabela,
    upsert: async () => semTabela,
    delete: () => ({ eq: async () => semTabela }),
  };
  return { supabaseAdmin: { from: () => consulta } };
});

type Arquivo = { id: string; name: string; version: string; conteudo: unknown };

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init });
const idDaUrl = (url: string) => url.split("/files/")[1].split("?")[0];

/** Drive falso: uma pasta com arquivos versionados; conta as chamadas por tipo. */
function driveFalso(arquivos: Arquivo[]) {
  const chamadas = { listagem: 0, download: 0, versao: 0, upload: [] as string[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith("https://upload.teste/")) {
        chamadas.upload.push(url);
        return json({ id: "novo-id" });
      }
      if (url.includes("/upload/drive/v3/files")) {
        chamadas.upload.push(url);
        if (url.includes("uploadType=resumable")) {
          return json({}, { headers: { Location: "https://upload.teste/sessao-1" } });
        }
        return json({ id: "novo-id" });
      }
      if (url.includes("alt=media")) {
        chamadas.download++;
        const a = arquivos.find((x) => x.id === idDaUrl(url));
        return a ? json(a.conteudo) : new Response("", { status: 404 });
      }
      if (url.includes("fields=version")) {
        chamadas.versao++;
        const a = arquivos.find((x) => x.id === idDaUrl(url));
        return a ? json({ version: a.version }) : new Response("", { status: 404 });
      }
      // Listagem da pasta ou busca por nome.
      chamadas.listagem++;
      const q = new URL(url).searchParams.get("q") ?? "";
      const porNome = q.match(/name = '([^']+)'/);
      const lista = porNome ? arquivos.filter((a) => a.name === porNome[1]) : arquivos;
      return json({ files: lista.map(({ id, name, version }) => ({ id, name, version })) });
    }),
  );
  return chamadas;
}

/** Módulo novo por teste: o cache de conteúdo é estado de módulo. */
async function carregar() {
  vi.resetModules();
  return import("./driveStorage");
}

describe("leitura em massa só baixa o que mudou", () => {
  it("com a mesma version, o segundo carregamento não baixa nada", async () => {
    const chamadas = driveFalso([
      { id: "f1", name: "a.json", version: "1", conteudo: { n: 1 } },
      { id: "f2", name: "b.json", version: "1", conteudo: { n: 2 } },
    ]);
    const { lerJsonsDaPasta } = await carregar();

    const primeira = await lerJsonsDaPasta<{ n: number }>("pasta");
    const segunda = await lerJsonsDaPasta<{ n: number }>("pasta");

    expect(primeira.map((l) => l.data.n)).toEqual([1, 2]);
    expect(segunda.map((l) => l.data.n)).toEqual([1, 2]);
    expect(chamadas.download).toBe(2); // antes: 4
  });

  it("baixa de novo só o arquivo cuja version subiu", async () => {
    const arquivos: Arquivo[] = [
      { id: "f1", name: "a.json", version: "1", conteudo: { n: 1 } },
      { id: "f2", name: "b.json", version: "1", conteudo: { n: 2 } },
    ];
    const chamadas = driveFalso(arquivos);
    const { lerJsonsDaPasta } = await carregar();

    await lerJsonsDaPasta("pasta");
    arquivos[1] = { ...arquivos[1], version: "2", conteudo: { n: 20 } };
    const depois = await lerJsonsDaPasta<{ n: number }>("pasta");

    expect(depois.map((l) => l.data.n)).toEqual([1, 20]);
    expect(chamadas.download).toBe(3);
  });

  it("arquivo apagado entre a listagem e o download fica de fora", async () => {
    driveFalso([{ id: "f1", name: "a.json", version: "1", conteudo: { n: 1 } }]);
    const { lerJsonsListados } = await carregar();

    const lidos = await lerJsonsListados([
      { id: "f1", name: "a.json", version: "1" },
      { id: "sumiu", name: "x.json", version: "1" },
    ]);
    expect(lidos.map((l) => l.arquivo.id)).toEqual(["f1"]);
  });
});

describe("readDriveJsonSeMudou (quadro de Chegada)", () => {
  it("consulta só a version e reaproveita o conteúdo enquanto ela não muda", async () => {
    const arquivos: Arquivo[] = [{ id: "c1", name: "_chegada-amostras.json", version: "7", conteudo: { rev: 7 } }];
    const chamadas = driveFalso(arquivos);
    const { readDriveJsonSeMudou } = await carregar();

    await expect(readDriveJsonSeMudou("_chegada-amostras.json", "raiz")).resolves.toEqual({ rev: 7 });
    await expect(readDriveJsonSeMudou("_chegada-amostras.json", "raiz")).resolves.toEqual({ rev: 7 });
    expect(chamadas.versao).toBe(2);
    expect(chamadas.download).toBe(1);

    arquivos[0] = { ...arquivos[0], version: "8", conteudo: { rev: 8 } };
    await expect(readDriveJsonSeMudou("_chegada-amostras.json", "raiz")).resolves.toEqual({ rev: 8 });
    expect(chamadas.download).toBe(2);
  });
});

describe("gravação", () => {
  it("JSON pequeno sai em uma requisição só (multipart)", async () => {
    const chamadas = driveFalso([]);
    const { writeDriveJson } = await carregar();

    await writeDriveJson("novo.json", { ok: true }, "pasta");

    expect(chamadas.upload).toHaveLength(1);
    expect(chamadas.upload[0]).toContain("uploadType=multipart");
  });

  it("JSON acima do limite do multipart continua no upload resumível", async () => {
    const chamadas = driveFalso([]);
    const { writeDriveJson } = await carregar();

    await writeDriveJson("grande.json", { foto: "x".repeat(5 * 1024 * 1024) }, "pasta");

    expect(chamadas.upload).toHaveLength(2);
    expect(chamadas.upload[0]).toContain("uploadType=resumable");
  });
});
