import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Modo offline (sem credenciais do Drive): tudo em `.data/` dentro de um
// diretório temporário, para não sujar a worktree.
vi.mock("./google-auth.server", () => ({
  getGoogleAccessToken: vi.fn(async () => "nao-usado"),
  isGoogleAuthConfigured: () => false,
}));

let dirOriginal: string;
let dirTeste: string;

beforeEach(() => {
  dirOriginal = process.cwd();
  dirTeste = fs.mkdtempSync(path.join(os.tmpdir(), "drive-offline-"));
  process.chdir(dirTeste);
});

afterEach(() => {
  process.chdir(dirOriginal);
  fs.rmSync(dirTeste, { recursive: true, force: true });
});

async function carregar() {
  vi.resetModules();
  return import("./driveStorage");
}

describe("atualizarDriveJson", () => {
  it("atualizações concorrentes no mesmo arquivo não se perdem", async () => {
    const { atualizarDriveJson, readDriveJson } = await carregar();
    await atualizarDriveJson<{ n: number }>("contador.json", "pasta", () => ({ n: 0 }));

    // Sem o lock envolvendo a LEITURA, várias leriam o mesmo n e gravariam n+1.
    await Promise.all(
      Array.from({ length: 10 }, () =>
        atualizarDriveJson<{ n: number }>("contador.json", "pasta", (atual) => ({ n: (atual?.n ?? 0) + 1 })),
      ),
    );

    await expect(readDriveJson<{ n: number }>("contador.json", "pasta")).resolves.toEqual({ n: 10 });
  });

  it("devolver null não grava nada", async () => {
    const { atualizarDriveJson, readDriveJson } = await carregar();
    await atualizarDriveJson("a.json", "pasta", () => ({ v: 1 }));
    await atualizarDriveJson("a.json", "pasta", () => null);
    await expect(readDriveJson("a.json", "pasta")).resolves.toEqual({ v: 1 });
  });

  it("erro dentro de `alterar` aborta sem gravar e libera o lock", async () => {
    const { atualizarDriveJson, readDriveJson } = await carregar();
    await atualizarDriveJson("b.json", "pasta", () => ({ v: 1 }));
    await expect(
      atualizarDriveJson("b.json", "pasta", () => {
        throw new Error("recusado");
      }),
    ).rejects.toThrow("recusado");
    // O lock foi liberado: a próxima atualização roda.
    await atualizarDriveJson<{ v: number }>("b.json", "pasta", (a) => ({ v: (a?.v ?? 0) + 1 }));
    await expect(readDriveJson("b.json", "pasta")).resolves.toEqual({ v: 2 });
  });
});

describe("modo offline", () => {
  it("o id de pasta é o mesmo depois de reiniciar o servidor", async () => {
    const primeiro = await (await carregar()).ensureFolderPath(["lab-ensaios"]);
    const depoisDeReiniciar = await (await carregar()).ensureFolderPath(["lab-ensaios"]);
    expect(depoisDeReiniciar).toBe(primeiro);
  });

  it("o que foi gravado continua listável depois de reiniciar", async () => {
    let m = await carregar();
    const pasta = await m.ensureFolderPath(["lab-ensaios"]);
    await m.writeDriveJson("x.json", { ok: true }, pasta);

    m = await carregar();
    const pastaDeNovo = await m.ensureFolderPath(["lab-ensaios"]);
    const nomes = (await m.listFilesInFolder(pastaDeNovo)).map((f) => f.name);
    expect(nomes).toContain("x.json");
  });

  it("arquivos de mesmo nome em pastas diferentes não colidem", async () => {
    const m = await carregar();
    await m.writeDriveJson("17960-26.json", { de: "os-hub" }, "pasta-hub");
    await m.writeDriveJson("17960-26.json", { de: "lab-os" }, "pasta-os");
    vi.useFakeTimers({ now: Date.now() + 5000 }); // fora do cache de 2s
    await expect(m.readDriveJson("17960-26.json", "pasta-hub")).resolves.toEqual({ de: "os-hub" });
    vi.useRealTimers();
  });

  it("apagar offline apaga de fato", async () => {
    const m = await carregar();
    await m.writeDriveJson("apagar.json", { v: 1 }, "pasta");
    const id = await m.findFileInFolder("apagar.json", "pasta");
    expect(id).toBeTruthy();
    await m.deleteDriveFile(id as string);
    await expect(m.findFileInFolder("apagar.json", "pasta")).resolves.toBeNull();
  });
});
