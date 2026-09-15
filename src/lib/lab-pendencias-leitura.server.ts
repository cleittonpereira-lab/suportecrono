/**
 * Lista das pendências de digitação — SÓ SERVIDOR. Usada pela server function
 * da Central de Relatórios e pelo Painel do coordenador no agendamento, onde
 * não há sessão.
 */
import { ensureFolderPath, lerJsonsDaPasta } from "@/lib/driveStorage";
import type { PendenciaDigitacao } from "./lab-pendencias.functions";

const FOLDER_PENDENCIAS = ["lab-pendencias"];

export async function listarPendencias(): Promise<PendenciaDigitacao[]> {
  const folderId = await ensureFolderPath(FOLDER_PENDENCIAS);
  // Consultada a cada 30s por aba aberta: baixa só as pendências que mudaram
  // desde a última leitura (ver lerJsonsDaPasta), 8 em voo por vez.
  const rows = (await lerJsonsDaPasta<PendenciaDigitacao>(folderId)).map((l) => l.data);
  // O nome do arquivo é determinístico por (os, amostra, ensaio), mas duas
  // gravações quase simultâneas já criaram dois arquivos com o mesmo `id`
  // lógico. Fica só o mais recente de cada `id`: nunca "pendência duplicada".
  const byId = new Map<string, PendenciaDigitacao>();
  for (const r of rows) {
    if (!r) continue;
    const prev = byId.get(r.id);
    if (!prev || prev.updated_at < r.updated_at) byId.set(r.id, r);
  }
  return Array.from(byId.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
