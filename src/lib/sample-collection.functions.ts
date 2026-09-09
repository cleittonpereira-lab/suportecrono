/**
 * Cargas de amostras coletadas/a coletar (extratos SOND/MAPS), pra análise
 * de pulmão. Cada upload vira um arquivo novo (histórico preservado, nada é
 * sobrescrito) — mesmo padrão Drive-JSON de os-hub.functions.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ensureFolderPath, readDriveJson, readDriveJsonById, writeDriveJson, listFilesInFolder } from "@/lib/driveStorage";

const FOLDER_UPLOADS = ["sample-uploads"];

/**
 * Lê em lotes em vez de disparar tudo de uma vez. O `Promise.all` sem limite
 * que estava aqui abria uma requisição ao Drive por arquivo simultaneamente,
 * ajudando a estourar o limite de recursos do Worker.
 */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export type CategoriaAmostra = "bloco" | "shelby" | "denison" | "outro";

export interface AmostraColetada {
  os: string;
  identificacao: string;
  tomador: string;
  codigoAmostra: string;
  tipo: string;
  categoria: CategoriaAmostra;
  topo: string;
  base: string;
  coletadoPor: string;
  dataColeta: string;
}

export interface AmostraAColetar {
  os: string;
  identificacao: string;
  tipo: string;
  categoria: CategoriaAmostra;
  latLong: string;
  status: string;
  dataFimOs: string;
  observacao: string;
}

export interface CargaAmostras {
  id: string;
  enviadoPor: string;
  enviadoEm: string;
  coletadas: AmostraColetada[];
  aColetar: AmostraAColetar[];
}

export type CargaAmostrasResumo = Pick<CargaAmostras, "id" | "enviadoPor" | "enviadoEm"> & {
  totalColetadas: number;
  totalAColetar: number;
};

function displayName(claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } | undefined) {
  return (
    (claims?.user_metadata?.full_name as string | undefined) ||
    (claims?.user_metadata?.name as string | undefined) ||
    (claims?.email ? claims.email.split("@")[0] : "Operador")
  );
}

const SalvarCargaInput = z.object({
  coletadas: z.array(z.record(z.unknown())),
  aColetar: z.array(z.record(z.unknown())),
});

export const salvarCargaAmostras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SalvarCargaInput.parse(i))
  .handler(async ({ context, data }) => {
    const nowIso = new Date().toISOString();
    const id = nowIso.replace(/[:.]/g, "-");
    const carga: CargaAmostras = {
      id,
      enviadoPor: displayName(context.claims),
      enviadoEm: nowIso,
      coletadas: data.coletadas as unknown as AmostraColetada[],
      aColetar: data.aColetar as unknown as AmostraAColetar[],
    };
    const folderId = await ensureFolderPath(FOLDER_UPLOADS);
    await writeDriveJson(`${id}.json`, carga, folderId);
    return { id };
  });

export const listarCargasAmostras = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<CargaAmostrasResumo[]> => {
    try {
      const folderId = await ensureFolderPath(FOLDER_UPLOADS);
      const files = await listFilesInFolder(folderId);
      const rows = await mapWithConcurrency(files, 8, (f) => readDriveJsonById<CargaAmostras>(f.id, f.name));
      return rows
        .filter((r): r is CargaAmostras => r !== null)
        .map((r) => ({
          id: r.id,
          enviadoPor: r.enviadoPor,
          enviadoEm: r.enviadoEm,
          totalColetadas: r.coletadas?.length ?? 0,
          totalAColetar: r.aColetar?.length ?? 0,
        }))
        .sort((a, b) => (a.enviadoEm < b.enviadoEm ? 1 : -1));
    } catch (err) {
      console.warn("[listarCargasAmostras] Falha:", err);
      return [];
    }
  });

const GetCargaInput = z.object({ id: z.string().min(1) });

export const getCargaAmostras = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => GetCargaInput.parse(i))
  .handler(async ({ data }): Promise<CargaAmostras | null> => {
    const folderId = await ensureFolderPath(FOLDER_UPLOADS);
    return readDriveJson<CargaAmostras>(`${data.id}.json`, folderId);
  });
