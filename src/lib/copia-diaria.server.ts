/**
 * Cópia do banco (D1) no Google Drive — um arquivo por dia na pasta
 * `copias-do-banco`, com todos os documentos do app.
 *
 * Com o banco ligado, o que é gravado não vai mais para os JSON antigos do
 * Drive. Esta cópia é o que mantém os dados também no Drive, legíveis por
 * qualquer pessoa com acesso, independentes do Cloudflare. (O D1 ainda guarda
 * 30 dias de histórico próprio para restauração.)
 *
 * Roda pelo agendamento do Cloudflare (ver server/copia-diaria.plugin.ts) e
 * pelo botão da tela de administração.
 */
import { deleteDriveFile, ensureFolderPath, listFilesInFolder, uploadBytesToDrive } from "./driveStorage";
import { exigirD1 } from "./documentos-d1.server";

export const PASTA_COPIAS = ["copias-do-banco"];
/** Cópias guardadas; as mais antigas são apagadas. */
export const COPIAS_MANTIDAS = 30;
const PADRAO_NOME = /^banco-\d{4}-\d{2}-\d{2}\.json$/;

export type ResultadoCopia = { arquivo: string; documentos: number; bytes: number; apagadas: number };

type Linha = { pasta: string; nome: string; rev: number; criado_em: string; atualizado_em: string; dados: string };

export async function gerarCopiaDoBanco(agora: Date = new Date()): Promise<ResultadoCopia> {
  const { results = [] } = await exigirD1()
    .prepare("SELECT pasta, nome, rev, criado_em, atualizado_em, dados FROM documentos ORDER BY pasta, nome")
    .all<Linha>();

  // Montado como texto: `dados` já é JSON no banco, e reprocessar ~2 MB só para
  // escrever de novo gastaria o pouco tempo de CPU que o Worker tem.
  const registros = results.map(
    (r) =>
      `{"pasta":${JSON.stringify(r.pasta)},"nome":${JSON.stringify(r.nome)},"rev":${Number(r.rev)},` +
      `"criadoEm":${JSON.stringify(r.criado_em)},"atualizadoEm":${JSON.stringify(r.atualizado_em)},"dados":${r.dados}}`,
  );
  const texto = `{"geradaEm":${JSON.stringify(agora.toISOString())},"documentos":${results.length},"registros":[\n${registros.join(",\n")}\n]}\n`;
  const bytes = new TextEncoder().encode(texto);

  const arquivo = `banco-${agora.toISOString().slice(0, 10)}.json`;
  const pasta = await ensureFolderPath(PASTA_COPIAS);
  // Mesmo dia = mesmo arquivo: rodar de novo atualiza a cópia do dia.
  await uploadBytesToDrive({ parentId: pasta, name: arquivo, mimeType: "application/json", bytes, overwrite: true });

  const antigas = (await listFilesInFolder(pasta))
    .filter((a) => PADRAO_NOME.test(a.name))
    .sort((a, b) => (a.name < b.name ? 1 : -1))
    .slice(COPIAS_MANTIDAS);
  for (const a of antigas) await deleteDriveFile(a.id);

  return { arquivo, documentos: results.length, bytes: bytes.length, apagadas: antigas.length };
}
