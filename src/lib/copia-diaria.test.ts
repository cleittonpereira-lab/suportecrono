import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { d1EmMemoria } from "./d1-em-memoria.test-util";

vi.mock("./google-auth.server", () => ({
  getGoogleAccessToken: vi.fn(async () => "token-de-teste"),
  isGoogleAuthConfigured: () => true,
}));

let enviados: { url: string; corpo: string }[];
let apagados: string[];
let copiasNaPasta: { id: string; name: string }[];

beforeEach(() => {
  enviados = [];
  apagados = [];
  copiasNaPasta = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/upload/drive/v3/files")) {
        enviados.push({ url, corpo: new TextDecoder().decode(init?.body as Uint8Array) });
        return new Response(JSON.stringify({ id: "copia-hoje" }), { status: 200 });
      }
      if (init?.method === "DELETE") {
        apagados.push(url.split("/files/")[1].split("?")[0]);
        return new Response(null, { status: 204 });
      }
      const q = new URL(url).searchParams.get("q") ?? "";
      if (q.includes("mimeType = 'application/vnd.google-apps.folder'")) {
        return new Response(JSON.stringify({ files: [{ id: "p-copias" }] }), { status: 200 });
      }
      if (q.includes("name = '")) return new Response(JSON.stringify({ files: [] }), { status: 200 });
      return new Response(JSON.stringify({ files: copiasNaPasta }), { status: 200 });
    }),
  );
});

afterEach(() => {
  delete (globalThis as { __env__?: unknown }).__env__;
});

async function carregar() {
  const db = d1EmMemoria();
  (globalThis as { __env__?: unknown }).__env__ = { DB: db, DADOS_NO_D1: "1" };
  vi.resetModules();
  const d1 = await import("./documentos-d1.server");
  await d1.gravarDocumento(db, "lab-os", "os_1.json", { numero: "17960-26" });
  await d1.gravarDocumento(db, "raiz", "_chegada-amostras.json", { rev: 3, tasks: {} });
  return import("./copia-diaria.server");
}

describe("cópia diária do banco no Drive", () => {
  it("grava um JSON válido com todos os documentos, nomeado pela data", async () => {
    const { gerarCopiaDoBanco } = await carregar();

    const r = await gerarCopiaDoBanco(new Date("2026-09-15T09:00:00Z"));

    expect(r).toMatchObject({ arquivo: "banco-2026-09-15.json", documentos: 2, apagadas: 0 });
    expect(enviados).toHaveLength(1);
    const corpo = enviados[0].corpo;
    const json = JSON.parse(corpo.slice(corpo.indexOf("{\"geradaEm\""), corpo.lastIndexOf("}") + 1));
    expect(json.documentos).toBe(2);
    expect(json.registros.map((x: { pasta: string; nome: string }) => `${x.pasta}/${x.nome}`)).toEqual([
      "lab-os/os_1.json",
      "raiz/_chegada-amostras.json",
    ]);
    expect(json.registros[0].dados).toEqual({ numero: "17960-26" });
  });

  it("mantém só as 30 cópias mais recentes", async () => {
    copiasNaPasta = Array.from({ length: 32 }, (_, i) => {
      const dia = new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10);
      return { id: `c-${dia}`, name: `banco-${dia}.json` };
    });
    const { gerarCopiaDoBanco } = await carregar();

    const r = await gerarCopiaDoBanco(new Date("2026-09-15T09:00:00Z"));

    expect(r.apagadas).toBe(2);
    expect(apagados).toEqual(["c-2026-08-02", "c-2026-08-01"]);
  });
});

describe("agendamento", () => {
  it("só o horário da cópia diária dispara a cópia", async () => {
    const gerar = vi.fn(async () => ({ arquivo: "x", documentos: 0, bytes: 0, apagadas: 0 }));
    vi.resetModules();
    vi.doMock("../lib/copia-diaria.server", () => ({ gerarCopiaDoBanco: gerar }));
    const plugin = await import("../server/copia-diaria.plugin");

    await plugin.aoDisparoAgendado({ controller: { cron: "*/5 * * * *" } });
    expect(gerar).not.toHaveBeenCalled();

    await plugin.aoDisparoAgendado({ controller: { cron: plugin.CRON_COPIA_DIARIA } });
    expect(gerar).toHaveBeenCalledTimes(1);
    vi.doUnmock("../lib/copia-diaria.server");
  });
});
