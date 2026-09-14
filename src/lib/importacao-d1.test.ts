import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { d1EmMemoria } from "./d1-em-memoria.test-util";

vi.mock("./google-auth.server", () => ({
  getGoogleAccessToken: vi.fn(async () => "token-de-teste"),
  isGoogleAuthConfigured: () => true,
}));
vi.mock("@/integrations/supabase/client.server", () => {
  const semTabela = { data: null, error: { message: "sem tabela" } };
  const consulta = { select: () => consulta, eq: () => consulta, maybeSingle: async () => semTabela, upsert: async () => semTabela, delete: () => ({ eq: async () => semTabela }) };
  return { supabaseAdmin: { from: () => consulta } };
});

type Arquivo = { id: string; name: string; version: string; modifiedTime: string; conteudo: unknown };

const FOTO_GRANDE = "data:image/jpeg;base64," + "A".repeat(30_000);
/** Nome da pasta → ids das pastas com esse nome (o Drive permite homônimas). */
let PASTAS: Record<string, string[]>;
let porPasta: Record<string, Arquivo[]>;
let fotosEnviadas: string[];
let chamadasAoDrive: number;

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  fotosEnviadas = [];
  chamadasAoDrive = 0;
  PASTAS = { "lab-ensaios": ["p-en"], fotos: ["p-fotos"] };
  porPasta = {
    "p-en": [
      {
        id: "f1",
        name: "am_1__en_1.json",
        version: "3",
        modifiedTime: "2026-09-10T10:00:00Z",
        conteudo: { id: "en_1", photos: [{ id: "ph_1", dataUrl: FOTO_GRANDE, kind: "ruptura" }], payload: { x: 1 } },
      },
      // Homônimo mais antigo: não pode ganhar.
      { id: "f1-velho", name: "am_1__en_1.json", version: "1", modifiedTime: "2026-09-01T10:00:00Z", conteudo: { id: "en_1", velho: true } },
      { id: "f2", name: "am_1__en_2.json", version: "1", modifiedTime: "2026-09-11T10:00:00Z", conteudo: { id: "en_2", photos: [] } },
    ],
    "p-fotos": [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      chamadasAoDrive++;
      const url = String(input);
      if (url.includes("/upload/drive/v3/files")) {
        const id = `foto-${fotosEnviadas.length + 1}`;
        fotosEnviadas.push(id);
        return json({ id });
      }
      if (url.includes("alt=media")) {
        const id = url.split("/files/")[1].split("?")[0];
        const a = Object.values(porPasta).flat().find((x) => x.id === id);
        return a ? json(a.conteudo) : new Response("", { status: 404 });
      }
      const q = new URL(url).searchParams.get("q") ?? "";
      if (q.includes("mimeType = 'application/vnd.google-apps.folder'")) {
        const nome = q.match(/name = '([^']+)'/)?.[1] ?? "";
        return json({ files: (PASTAS[nome] ?? []).map((id) => ({ id })) });
      }
      const nome = q.match(/name = '([^']+)'/)?.[1];
      const pai = q.match(/'([^']+)' in parents/)?.[1] ?? "";
      const lista = (porPasta[pai] ?? []).filter((a) => !nome || a.name === nome);
      return json({ files: lista.map(({ id, name, version, modifiedTime }) => ({ id, name, version, modifiedTime })) });
    }),
  );
});

afterEach(() => {
  delete (globalThis as { __env__?: unknown }).__env__;
});

async function carregar(env: Record<string, unknown>) {
  (globalThis as { __env__?: unknown }).__env__ = env;
  vi.resetModules();
  return {
    imp: await import("./importacao-d1.server"),
    d1: await import("./documentos-d1.server"),
  };
}

describe("importação Drive → banco", () => {
  it("simular não grava nada nem envia foto, mas relata o que aconteceria", async () => {
    const db = d1EmMemoria();
    const { imp } = await carregar({ DB: db });

    const rel = await imp.importarAlvo("simular", "lab-ensaios");

    expect(rel).toMatchObject({ noDrive: 3, homonimos: 1, incluidos: 2, fotosMovidas: 1, erros: [], proximo: null });
    expect(rel.bytesDepois).toBeLessThan(rel.bytesAntes);
    expect(fotosEnviadas).toEqual([]);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM documentos").get()).toEqual({ n: 0 });
  });

  it("incluir grava o homônimo mais recente e troca a foto embutida por arquivo no Drive", async () => {
    const db = d1EmMemoria();
    const { imp, d1 } = await carregar({ DB: db });

    const rel = await imp.importarAlvo("incluir", "lab-ensaios");

    expect(rel).toMatchObject({ incluidos: 2, fotosMovidas: 1, erros: [] });
    const en1 = await d1.lerDocumento<{ velho?: boolean; photos: { url?: string; dataUrl: string }[] }>(db, "lab-ensaios", "am_1__en_1.json");
    expect(en1?.dados.velho).toBeUndefined();
    expect(en1?.dados.photos[0]).toMatchObject({ url: "/api/photo/foto-1", dataUrl: "" });
  });

  it("repetir a importação não baixa de novo, não sobrescreve nem envia a foto outra vez", async () => {
    const db = d1EmMemoria();
    const { imp } = await carregar({ DB: db });

    await imp.importarAlvo("incluir", "lab-ensaios");
    const downloadsAntes = chamadasAoDrive;
    const segunda = await imp.importarAlvo("incluir", "lab-ensaios");

    expect(segunda).toMatchObject({ incluidos: 0, jaExistiam: 2 });
    expect(fotosEnviadas).toHaveLength(1);
    // Só pastas e listagens: nenhum download dos documentos que já estão no banco.
    expect(chamadasAoDrive - downloadsAntes).toBeLessThanOrEqual(3);
  });

  it("pasta grande vai em partes, cada uma dentro do limite de chamadas, e termina com tudo", async () => {
    porPasta["p-en"] = Array.from({ length: 95 }, (_, i) => ({
      id: `g${i}`,
      name: `am_x__en_${String(i).padStart(3, "0")}.json`,
      version: "1",
      modifiedTime: "2026-09-10T10:00:00Z",
      conteudo: { id: `en_${i}` },
    }));
    const db = d1EmMemoria();
    const { imp } = await carregar({ DB: db });

    let inicio: number | null = 0;
    let partes = 0;
    let incluidos = 0;
    while (inicio !== null) {
      const antes = chamadasAoDrive;
      const parte = await imp.importarAlvo("incluir", "lab-ensaios", inicio);
      expect(chamadasAoDrive - antes).toBeLessThanOrEqual(imp.LIMITE_CHAMADAS_POR_PARTE + 2);
      incluidos += parte.incluidos;
      inicio = parte.proximo;
      partes++;
    }

    expect(partes).toBeGreaterThan(1);
    expect(incluidos).toBe(95);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM documentos").get()).toEqual({ n: 95 });
  });

  it("pastas homônimas (as 16 os-hub) são lidas todas; de cada nome fica o mais recente", async () => {
    PASTAS["os-hub"] = ["hub-antiga-vazia", "hub-com-dados", "hub-outra"];
    porPasta["hub-antiga-vazia"] = [];
    porPasta["hub-com-dados"] = [
      { id: "h1", name: "17960-26.json", version: "2", modifiedTime: "2026-08-28T15:09:02Z", conteudo: { osNumero: "17960-26", messages: [1, 2] } },
    ];
    porPasta["hub-outra"] = [
      { id: "h1-velho", name: "17960-26.json", version: "1", modifiedTime: "2026-08-20T10:00:00Z", conteudo: { osNumero: "17960-26", messages: [] } },
      { id: "h2", name: "16797-25.json", version: "1", modifiedTime: "2026-08-27T11:14:58Z", conteudo: { osNumero: "16797-25" } },
    ];
    const db = d1EmMemoria();
    const { imp, d1 } = await carregar({ DB: db });

    const rel = await imp.importarAlvo("incluir", "os-hub");

    expect(rel).toMatchObject({ noDrive: 3, homonimos: 1, incluidos: 2, erros: [] });
    await expect(d1.lerDocumento(db, "os-hub", "17960-26.json")).resolves.toMatchObject({ dados: { messages: [1, 2] } });
  });

  it("sincronizar é recusado com o banco já ligado", async () => {
    const { imp } = await carregar({ DB: d1EmMemoria(), DADOS_NO_D1: "1" });
    await expect(imp.importarAlvo("sincronizar", "lab-ensaios")).rejects.toThrow("Use Incluir");
  });

  it("pasta que não existe no Drive não é criada lá: só relata zero", async () => {
    const { imp } = await carregar({ DB: d1EmMemoria() });
    const rel = await imp.importarAlvo("incluir", "lab-capsulas");
    expect(rel).toMatchObject({ noDrive: 0, incluidos: 0, erros: [], proximo: null });
  });

  it("situação do banco conta os documentos por pasta", async () => {
    const db = d1EmMemoria();
    const { imp } = await carregar({ DB: db });
    await imp.importarAlvo("incluir", "lab-ensaios");

    const s = await imp.situacaoDoBanco();
    expect(s).toMatchObject({ configurado: true, ligado: false, erro: null });
    expect(s.porPasta).toEqual([expect.objectContaining({ pasta: "lab-ensaios", documentos: 2 })]);
  });
});
