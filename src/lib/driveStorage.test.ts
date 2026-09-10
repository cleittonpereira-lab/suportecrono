import { beforeEach, describe, expect, it, vi } from "vitest";

// Credenciais do Drive "configuradas", sem rede de verdade.
vi.mock("./google-auth.server", () => ({
  getGoogleAccessToken: vi.fn(async () => "token-de-teste"),
  isGoogleAuthConfigured: () => true,
}));

// Supabase como está em produção hoje: a tabela drive_file_cache não existe.
// O supabase-js NÃO lança nesse caso — devolve { error }.
const chamadasSupabase = { total: 0 };
vi.mock("@/integrations/supabase/client.server", () => {
  const semTabela = { data: null, error: { message: 'relation "drive_file_cache" does not exist' } };
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: async () => {
      chamadasSupabase.total++;
      return semTabela;
    },
    upsert: async () => {
      chamadasSupabase.total++;
      return semTabela;
    },
    delete: () => ({
      eq: async () => {
        chamadasSupabase.total++;
        return semTabela;
      },
    }),
  };
  return { supabaseAdmin: { from: () => consulta } };
});

type Resposta = { status: number; body?: unknown };

/** Mock de fetch roteado por tipo de chamada do Drive, com fila de respostas. */
function mockDrive(opts: { busca?: Resposta[]; download?: Resposta[] }) {
  const fila = { busca: [...(opts.busca ?? [])], download: [...(opts.download ?? [])] };
  const chamadas = { busca: 0, download: 0 };
  const responder = (r: Resposta | undefined) => {
    const res = r ?? { status: 200, body: {} };
    return new Response(res.body === undefined ? "" : JSON.stringify(res.body), { status: res.status });
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("alt=media")) {
        chamadas.download++;
        return responder(fila.download.length > 1 ? fila.download.shift() : fila.download[0]);
      }
      chamadas.busca++;
      return responder(fila.busca.length > 1 ? fila.busca.shift() : fila.busca[0]);
    }),
  );
  return chamadas;
}

/** Cada teste recebe um módulo novo: o disjuntor é estado de módulo. */
async function carregar() {
  vi.resetModules();
  return import("./driveStorage");
}

beforeEach(() => {
  chamadasSupabase.total = 0;
});

describe("Fase 0 — disjuntor do cache durável", () => {
  it("consulta o Supabase uma única vez quando a tabela não existe", async () => {
    mockDrive({
      busca: [{ status: 200, body: { files: [{ id: "arquivo-1" }] } }],
      download: [{ status: 200, body: { ok: true } }],
    });
    const { readDriveJson } = await carregar();

    for (let i = 0; i < 5; i++) {
      await readDriveJson(`ensaio-${i}.json`, "pasta-teste");
    }

    // Antes: 5 leituras = 5 idas ao Supabase (+5 upserts). Agora: 1, e desliga.
    expect(chamadasSupabase.total).toBe(1);
  });

  it("continua lendo do Drive normalmente com o cache desligado", async () => {
    mockDrive({
      busca: [{ status: 200, body: { files: [{ id: "arquivo-1" }] } }],
      download: [{ status: 200, body: { valor: 42 } }],
    });
    const { readDriveJson } = await carregar();

    await expect(readDriveJson("a.json", "pasta")).resolves.toEqual({ valor: 42 });
    await expect(readDriveJson("b.json", "pasta")).resolves.toEqual({ valor: 42 });
  });
});

describe("Fase 0 — só repete falha que pode dar certo na segunda vez", () => {
  it("403 falha na hora, sem tentar de novo", async () => {
    const chamadas = mockDrive({ download: [{ status: 403 }] });
    const { readDriveJsonById } = await carregar();

    await expect(readDriveJsonById("id-1", "x.json")).rejects.toThrow("HTTP 403");
    expect(chamadas.download).toBe(1);
  });

  it("503 é transitório: repete e recupera", async () => {
    const chamadas = mockDrive({
      download: [{ status: 503 }, { status: 200, body: { recuperado: true } }],
    });
    const { readDriveJsonById } = await carregar();

    await expect(readDriveJsonById("id-1")).resolves.toEqual({ recuperado: true });
    expect(chamadas.download).toBe(2);
  });

  it("404 é ausência real: devolve null sem repetir", async () => {
    const chamadas = mockDrive({ download: [{ status: 404 }] });
    const { readDriveJsonById } = await carregar();

    await expect(readDriveJsonById("id-1")).resolves.toBeNull();
    expect(chamadas.download).toBe(1);
  });

  it("listagem de pasta com 403 falha na hora, sem tentar de novo", async () => {
    const chamadas = mockDrive({ busca: [{ status: 403 }] });
    const { listFilesInFolder } = await carregar();

    await expect(listFilesInFolder("pasta")).rejects.toThrow("HTTP 403");
    expect(chamadas.busca).toBe(1);
  });
});
