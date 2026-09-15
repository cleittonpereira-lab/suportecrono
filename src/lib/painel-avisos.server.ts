/**
 * Avisos do Painel do coordenador — SÓ SERVIDOR (carregar com `import()`).
 *
 *  - Resumo da manhã: dias úteis, a partir das 7h de Brasília, uma vez por dia.
 *  - Entrega em risco ou atrasada: na checagem de 15 em 15 min, só no
 *    expediente; fora dele (e na checagem que mandou o resumo) só registra.
 *
 * Quem recebe: administradores e quem tem a permissão "Painel do coordenador",
 * cada um com as suas preferências. Chegam no celular pelo mesmo caminho dos
 * avisos do fluxo de aprovação (avisos.server.ts). Regras em painel-avisos-logica.ts.
 */
import { atualizarDriveJson, ensureFolderPath, readDriveJson, writeDriveJson } from "@/lib/driveStorage";
import {
  MAX_AVISOS_DE_RISCO,
  PREFERENCIAS_PADRAO,
  agoraEmBrasilia,
  avisoDeRisco,
  avisoDosDemais,
  destinatariosDoPainel,
  horaDoResumo,
  montarResumo,
  noExpediente,
  novosRiscos,
  type EstadoRiscos,
  type Preferencias,
} from "./painel-avisos-logica";

const PASTA_ESTADO = ["operacao"];
const ESTADO = "painel-avisos.json";
const PASTA_PREFERENCIAS = ["avisos"];
const PREFERENCIAS = "painel-preferencias.json";

type EstadoDosAvisos = { ultimoResumo: string | null; riscos: EstadoRiscos | null; atualizadoEm?: string };

async function lerPreferencias(): Promise<Record<string, Partial<Preferencias>>> {
  const pasta = await ensureFolderPath(PASTA_PREFERENCIAS);
  return (await readDriveJson<Record<string, Partial<Preferencias>>>(PREFERENCIAS, pasta)) ?? {};
}

export async function preferenciasDe(userId: string): Promise<Preferencias> {
  return { ...PREFERENCIAS_PADRAO, ...(await lerPreferencias())[userId] };
}

export async function salvarPreferencias(userId: string, p: Preferencias): Promise<void> {
  const pasta = await ensureFolderPath(PASTA_PREFERENCIAS);
  await atualizarDriveJson<Record<string, Partial<Preferencias>>>(PREFERENCIAS, pasta, (atual) => ({ ...(atual ?? {}), [userId]: p }));
}

async function destinatarios(tipo: keyof Preferencias): Promise<string[]> {
  const { listUsers } = await import("./user-store.server");
  return destinatariosDoPainel(await listUsers(), await lerPreferencias(), tipo);
}

/** A checagem do agendamento de 15 em 15 min. Devolve o que fez, para o registro. */
export async function checarAvisosDoPainel(agora: Date = new Date()): Promise<string> {
  const momento = agoraEmBrasilia(agora);
  const pasta = await ensureFolderPath(PASTA_ESTADO);
  const estado = (await readDriveJson<EstadoDosAvisos>(ESTADO, pasta)) ?? { ultimoResumo: null, riscos: null };
  const querResumo = horaDoResumo(momento, estado.ultimoResumo);
  const expediente = noExpediente(momento);
  // Fora do expediente não lê nada (economiza as leituras da noite); a primeira
  // checagem da manhã manda o resumo e registra a situação de uma vez.
  if (!querResumo && !expediente && estado.riscos) return "fora do expediente";

  const { montarPainelNoServidor } = await import("./painel-coordenador.server");
  const { avisarPessoas } = await import("./avisos.server");
  const modelo = await montarPainelNoServidor("todos", momento.hoje);
  const feito: string[] = [];

  if (querResumo) {
    const ids = await destinatarios("resumo");
    if (ids.length) await avisarPessoas(ids, montarResumo(modelo, agora));
    estado.ultimoResumo = momento.hoje;
    feito.push(`resumo para ${ids.length} pessoa(s)`);
  }

  const r = novosRiscos(modelo.prazos, estado.riscos);
  if (r.avisar.length && expediente && !querResumo) {
    const ids = await destinatarios("risco");
    if (ids.length) {
      for (const p of r.avisar.slice(0, MAX_AVISOS_DE_RISCO)) await avisarPessoas(ids, avisoDeRisco(p, agora));
      if (r.avisar.length > MAX_AVISOS_DE_RISCO) await avisarPessoas(ids, avisoDosDemais(r.avisar.slice(MAX_AVISOS_DE_RISCO), agora));
    }
    feito.push(`${r.avisar.length} OS em risco/atraso avisada(s) a ${ids.length} pessoa(s)`);
  }
  estado.riscos = r.estado;
  estado.atualizadoEm = agora.toISOString();
  await writeDriveJson(ESTADO, estado, pasta);
  return feito.join("; ") || `nada novo (${Object.keys(r.estado).length} OS em risco/atraso)`;
}

/** "Receber o resumo agora": só para quem pediu; não mexe no estado do agendamento. */
export async function enviarResumoPara(userId: string): Promise<{ enviado: boolean; aparelhos: number; previa: string }> {
  const { montarPainelNoServidor } = await import("./painel-coordenador.server");
  const { avisarPessoas, quantosAparelhos } = await import("./avisos.server");
  const agora = new Date();
  const aviso = montarResumo(await montarPainelNoServidor("todos", agoraEmBrasilia(agora).hoje), agora);
  const aparelhos = await quantosAparelhos(userId);
  if (aparelhos > 0) await avisarPessoas([userId], aviso);
  return { enviado: aparelhos > 0, aparelhos, previa: aviso.corpo };
}
