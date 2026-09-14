import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { d1EmMemoria } from "./d1-em-memoria.test-util";

// Credenciais do Drive "configuradas": qualquer ida ao Drive passa pelo fetch abaixo.
vi.mock("./google-auth.server", () => ({
  getGoogleAccessToken: vi.fn(async () => "token-de-teste"),
  isGoogleAuthConfigured: () => true,
}));

const RAIZ = "0AB6VPuj1fWHEUk9PVA";
let chamadasAoDrive: string[];

beforeEach(() => {
  chamadasAoDrive = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      chamadasAoDrive.push(String(input));
      // Qualquer busca de pasta devolve uma pasta; qualquer busca de arquivo, nada.
      const q = new URL(String(input)).searchParams.get("q") ?? "";
      const pasta = q.includes("mimeType = 'application/vnd.google-apps.folder'");
      return new Response(JSON.stringify({ files: pasta ? [{ id: "pasta-drive" }] : [] }), { status: 200 });
    }),
  );
});

afterEach(() => {
  delete (globalThis as { __env__?: unknown }).__env__;
});

async function carregar(env: Record<string, unknown>) {
  (globalThis as { __env__?: unknown }).__env__ = env;
  vi.resetModules();
  return import("./driveStorage");
}

describe("com o D1 ligado", () => {
  it("dados das pastas do app vão ao banco, sem nenhuma chamada ao Drive", async () => {
    const db = d1EmMemoria();
    const s = await carregar({ DB: db, DADOS_NO_D1: "1" });

    const pasta = await s.ensureFolderPath(["lab-ensaios"]);
    expect(pasta).toBe("d1:lab-ensaios");

    await s.writeDriveJson("am_1__en_1.json", { id: "en_1", status: "rascunho" }, pasta);
    await s.atualizarDriveJson<{ id: string; status: string }>("am_1__en_1.json", pasta, (a) => ({ ...a!, status: "aprovado" }));
    await expect(s.readDriveJson("am_1__en_1.json", pasta)).resolves.toEqual({ id: "en_1", status: "aprovado" });

    const lista = await s.listFilesInFolder(pasta);
    expect(lista.map((a) => a.name)).toEqual(["am_1__en_1.json"]);
    expect(lista[0].version).toMatch(/^2@/);
    const lidos = await s.lerJsonsDaPasta<{ status: string }>(pasta);
    expect(lidos.map((l) => l.data.status)).toEqual(["aprovado"]);
    await expect(s.readDriveJsonById(lista[0].id)).resolves.toMatchObject({ status: "aprovado" });

    const id = await s.findFileInFolder("am_1__en_1.json", pasta);
    await s.deleteDriveFile(id!);
    await expect(s.readDriveJson("am_1__en_1.json", pasta)).resolves.toBeNull();

    expect(chamadasAoDrive).toEqual([]);
  });

  it("documentos da raiz listados (quadro de Chegada) vão ao banco", async () => {
    const db = d1EmMemoria();
    const s = await carregar({ DB: db, DADOS_NO_D1: "1" });

    await s.writeDriveJson("_chegada-amostras.json", { rev: 4 }, RAIZ);
    await expect(s.readDriveJsonSeMudou("_chegada-amostras.json", RAIZ)).resolves.toEqual({ rev: 4 });
    expect(chamadasAoDrive).toEqual([]);
  });

  it("fotos e pastas das OS continuam no Drive", async () => {
    const db = d1EmMemoria();
    const s = await carregar({ DB: db, DADOS_NO_D1: "1" });

    await expect(s.ensureFolderPath(["fotos"])).resolves.toBe("pasta-drive");
    expect(chamadasAoDrive.length).toBeGreaterThan(0);
  });

  it("dentro de lendoDoDrive, até as pastas de dados vão ao Drive (é assim que a importação lê o original)", async () => {
    const db = d1EmMemoria();
    const s = await carregar({ DB: db, DADOS_NO_D1: "1" });
    const { lendoDoDrive } = await import("./documentos-d1.server");

    await expect(lendoDoDrive(() => s.ensureFolderPath(["lab-ensaios"]))).resolves.toBe("pasta-drive");
  });
});

describe("com o D1 desligado", () => {
  it("sem DADOS_NO_D1=1, tudo continua no Drive como antes", async () => {
    const s = await carregar({ DB: d1EmMemoria() });
    await expect(s.ensureFolderPath(["lab-ensaios"])).resolves.toBe("pasta-drive");
  });

  it("sem o binding DB, a chave sozinha não liga nada", async () => {
    const s = await carregar({ DADOS_NO_D1: "1" });
    await expect(s.ensureFolderPath(["lab-ensaios"])).resolves.toBe("pasta-drive");
  });
});
