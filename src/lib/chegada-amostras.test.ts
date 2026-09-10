import { describe, expect, it, vi } from "vitest";
import { handleCreateSharedChegadaTask, readLocalChegadaState } from "./chegada-amostras.functions";

// Uma leitura do quadro que falha não pode resultar em gravar o quadro padrão
// (vazio) por cima das chegadas já registradas.

const { readDriveJson, writeDriveJson } = vi.hoisted(() => ({
  readDriveJson: vi.fn(async (..._a: unknown[]): Promise<unknown> => null),
  writeDriveJson: vi.fn(async (..._a: unknown[]) => ({ ok: true })),
}));

vi.mock("@/lib/driveStorage", () => ({
  DRIVE_ROOT_FOLDER_ID: "raiz",
  readDriveJson,
  writeDriveJson,
}));

describe("chegada de amostras", () => {
  it("falha de leitura estoura em vez de devolver o quadro padrão", async () => {
    readDriveJson.mockRejectedValue(new Error("HTTP 503"));

    await expect(readLocalChegadaState()).rejects.toThrow("HTTP 503");
  });

  it("registrar chegada com leitura falha NÃO grava nada", async () => {
    readDriveJson.mockRejectedValue(new Error("HTTP 503"));
    writeDriveJson.mockClear();

    await expect(
      handleCreateSharedChegadaTask({
        osCliente: "Cliente X",
        recebidoPor: [],
        tipoAmostra: [],
        relacaoAmostras: "",
        sup: "",
        priority: "media",
        images: [],
      } as never),
    ).rejects.toThrow();
    expect(writeDriveJson).not.toHaveBeenCalled();
  });

  it("quadro realmente inexistente (primeiro uso) ainda cai no padrão", async () => {
    readDriveJson.mockResolvedValue(null);

    const s = await readLocalChegadaState();
    expect(s.rev).toBe(0);
    expect(Array.isArray(s.columns)).toBe(true);
  });
});
