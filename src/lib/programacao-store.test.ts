import { describe, expect, it, vi } from "vitest";
import { readStore, writeStore } from "./programacao-store.server";

const { readDriveJson, writeDriveJson } = vi.hoisted(() => ({
  readDriveJson: vi.fn(async (..._a: unknown[]): Promise<unknown> => null),
  writeDriveJson: vi.fn(async (..._a: unknown[]) => ({ ok: true })),
}));

vi.mock("@/lib/driveStorage", () => ({ readDriveJson, writeDriveJson }));

describe("programação", () => {
  it("falha de leitura estoura — não serve a semente como se fosse a programação real", async () => {
    readDriveJson.mockRejectedValue(new Error("HTTP 503"));
    await expect(readStore()).rejects.toThrow("HTTP 503");
  });

  it("arquivo inexistente (primeira instalação) usa a semente", async () => {
    readDriveJson.mockResolvedValue(null);
    const d = await readStore();
    expect(d).toBeTruthy();
  });

  it("dado existente é devolvido como está", async () => {
    const real = { Amostras: [{ id: "am-1" }], Ensaios: [], Equipamentos: [] };
    readDriveJson.mockResolvedValue(real);
    await expect(readStore()).resolves.toBe(real);
  });

  it("falha de gravação estoura — não finge que salvou", async () => {
    writeDriveJson.mockRejectedValue(new Error("HTTP 500"));
    await expect(writeStore({} as never)).rejects.toThrow("HTTP 500");
  });
});
