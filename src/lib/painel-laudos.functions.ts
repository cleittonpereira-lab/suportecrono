/**
 * Dados da aba Laudos do Painel do Coordenador: eventos do histórico de todos
 * os laudos (regra em lib/painel-laudos.ts). Uma leitura da pasta lab-ensaios.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureFolderPath, lerJsonsDaPasta } from "@/lib/driveStorage";
import { FOLDER_ENSAIOS, type EnsaioFile } from "@/lib/lab-entities.functions";
import { familiaDoEnsaio } from "@/lib/familia-ensaio";
import { eventosDoEnsaio, type DadosDoPainelDeLaudos } from "@/lib/painel-laudos";

export const lerPainelDeLaudos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<DadosDoPainelDeLaudos> => {
    const pasta = await ensureFolderPath(FOLDER_ENSAIOS);
    const ensaios = (await lerJsonsDaPasta<EnsaioFile>(pasta)).map((l) => l.data);
    const out: DadosDoPainelDeLaudos = { eventos: [], ciclos: [], aEntregar: 0 };
    for (const en of ensaios) {
      if (!en) continue;
      const r = eventosDoEnsaio(en as never, familiaDoEnsaio(en.tipo, en.sigla, en.nome));
      out.eventos.push(...r.eventos);
      if (r.ciclo) out.ciclos.push(r.ciclo);
      if (r.aEntregar) out.aEntregar++;
    }
    return out;
  });
