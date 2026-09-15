/**
 * Saúde do servidor (Fase 6) — SÓ SERVIDOR (carregar com `import()`): anota
 * exceções e requisições lentas (middleware em src/start.ts) e, de 15 em 15
 * minutos (src/server/saude.plugin.ts), avisa os administradores no celular
 * quando passa do limite. Regras em lib/saude-logica.ts.
 *
 * As anotações ficam num documento só ("operacao/ocorrencias.json"),
 * aparado para as últimas 24 h — gravar só acontece quando algo deu errado.
 */
import { atualizarDriveJson, ensureFolderPath, readDriveJson, writeDriveJson } from "@/lib/driveStorage";
import { aparar, avaliarSaude, podeAlertarDeNovo, type Ocorrencia } from "@/lib/saude-logica";

const PASTA = ["operacao"];
const OCORRENCIAS = "ocorrencias.json";
const ULTIMO_ALERTA = "ultimo-alerta.json";

type ArquivoOcorrencias = { ocorrencias: Ocorrencia[] };

/** Anota para depois da resposta — quem fez a requisição não espera a gravação. */
export async function anotarOcorrencia(o: Omit<Ocorrencia, "em">): Promise<void> {
  const { depoisDaResposta } = await import("./depois-da-resposta");
  depoisDaResposta(gravar({ ...o, mensagem: o.mensagem?.slice(0, 300), em: new Date().toISOString() }));
}

async function gravar(o: Ocorrencia): Promise<void> {
  const pasta = await ensureFolderPath(PASTA);
  await atualizarDriveJson<ArquivoOcorrencias>(OCORRENCIAS, pasta, (atual) => ({
    ocorrencias: aparar([...(atual?.ocorrencias ?? []), o]),
  }));
}

/** A checagem periódica: avalia os últimos 15 min e avisa os administradores se preciso. */
export async function verificarSaude(agora = new Date()): Promise<{ alertou: boolean; resumo: string }> {
  const pasta = await ensureFolderPath(PASTA);
  const arquivo = await readDriveJson<ArquivoOcorrencias>(OCORRENCIAS, pasta);
  const avaliacao = avaliarSaude(arquivo?.ocorrencias ?? [], agora);
  if (!avaliacao.alerta) return { alertou: false, resumo: avaliacao.resumo };

  const ultimo = await readDriveJson<{ em: string }>(ULTIMO_ALERTA, pasta);
  if (!podeAlertarDeNovo(ultimo?.em ?? null, agora)) {
    return { alertou: false, resumo: `${avaliacao.resumo} (já alertado há menos de 1 h)` };
  }

  const { listUsers } = await import("./user-store.server");
  const admins = (await listUsers()).filter((u) => u.role === "admin" && u.status === "ativo").map((u) => u.id);
  const { avisarPessoas } = await import("./avisos.server");
  await avisarPessoas(admins, {
    id: `saude_${agora.getTime().toString(36)}`,
    titulo: avaliacao.alerta.titulo,
    corpo: avaliacao.alerta.corpo,
    url: "/",
    criadoEm: agora.toISOString(),
  });
  await writeDriveJson(ULTIMO_ALERTA, { em: agora.toISOString(), ...avaliacao.alerta }, pasta);
  return { alertou: true, resumo: avaliacao.resumo };
}
