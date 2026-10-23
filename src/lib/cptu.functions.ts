/**
 * Acompanhamento de CPTu (aba "Ensaios Especiais › CPTu"). Um documento só
 * (`cptu/acompanhamento.json`, no D1 como as outras pastas de dados) com
 * todos os CPTu: o que vem do extrato da SOND + o controle da equipe. As
 * regras de mescla e histórico ficam em `features/cptu/logic.ts`.
 *
 * Os dados das OS (tomador, obra, local) vêm da planilha de Cadastro de OS,
 * lida aqui direto das abas por mês ("January" … "December").
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth, exigirLogin } from "@/integrations/supabase/auth-middleware";
import { atualizarDriveJson, ensureFolderPath, readDriveJson } from "@/lib/driveStorage";
import { sheetsGetValues } from "@/lib/sheets-read.server";
import { isGoogleAuthConfigured } from "@/lib/google-auth.server";
import {
  CPTU_STATUS,
  RELATORIO_STATUS,
  aplicarPatch,
  chaveOs,
  docVazio,
  mesclarImportacao,
  normalizarTexto,
  type CptuDoc,
  type CptuImportacao,
  type CptuRegistro,
} from "@/features/cptu/logic";

const PASTA = ["cptu"];
const ARQUIVO = "acompanhamento.json";

function displayName(
  claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } | undefined,
) {
  return (
    (claims?.user_metadata?.full_name as string | undefined) ||
    (claims?.user_metadata?.name as string | undefined) ||
    (claims?.email ? claims.email.split("@")[0] : "Operador")
  );
}

export type CptuEstado = { registros: CptuRegistro[]; importacoes: CptuImportacao[] };

function paraEstado(doc: CptuDoc | null): CptuEstado {
  const d = doc ?? docVazio();
  return { registros: Object.values(d.registros), importacoes: d.importacoes };
}

export const getCptu = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const folderId = await ensureFolderPath(PASTA);
    return paraEstado(await readDriveJson<CptuDoc>(ARQUIVO, folderId));
  });

const LinhaSchema = z.object({
  os: z.string().min(1).max(60),
  identificacao: z.string().min(1).max(200),
  tipo: z.string().max(40),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  status: z.enum(CPTU_STATUS),
  desde: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  dataFimOs: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  profundidade: z.number().min(0).max(500),
  obsCampo: z.string().max(4000),
  criterio: z.string().max(4000),
});

const ImportarInput = z.object({
  arquivo: z.string().max(300),
  linhas: z.array(LinhaSchema).min(1).max(5000),
});

export const importarCptu = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((i: unknown) => ImportarInput.parse(i))
  .handler(async ({ context, data }) => {
    const folderId = await ensureFolderPath(PASTA);
    const meta = {
      em: new Date().toISOString(),
      por: displayName(context.claims),
      arquivo: data.arquivo,
    };
    let resumo: CptuImportacao | null = null;
    const doc = await atualizarDriveJson<CptuDoc>(ARQUIVO, folderId, (atual) => {
      const out = mesclarImportacao(atual, data.linhas, meta);
      resumo = out.resumo;
      return out.doc;
    });
    return { resumo: resumo as CptuImportacao | null, estado: paraEstado(doc) };
  });

const link = z
  .string()
  .max(2000)
  .refine(
    (s) => s === "" || /^https?:\/\//i.test(s),
    "O link precisa começar com http:// ou https://",
  );

const AtualizarInput = z.object({
  ids: z.array(z.string().min(1)).min(1).max(1000),
  patch: z
    .object({
      status: z.enum(CPTU_STATUS),
      recebimentoCampo: z.boolean(),
      verificacaoBrutos: z.boolean(),
      relatorio: z.enum(RELATORIO_STATUS),
      observacoes: z.string().max(4000),
      linkSondagemRef: link,
      linkDadosBrutos: link,
      atencaoVerificada: z.boolean(),
      atencaoNota: z.string().max(500),
    })
    .partial()
    .refine((p) => Object.keys(p).length > 0, "Nada para alterar."),
});

export const atualizarCptu = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((i: unknown) => AtualizarInput.parse(i))
  .handler(async ({ context, data }) => {
    const folderId = await ensureFolderPath(PASTA);
    const em = new Date().toISOString();
    const por = displayName(context.claims);
    const alterados: CptuRegistro[] = [];
    // Com trava: duas pessoas marcando colunas diferentes ao mesmo tempo não
    // apagam a marcação uma da outra.
    await atualizarDriveJson<CptuDoc>(ARQUIVO, folderId, (atual) => {
      if (!atual) return null;
      let mudou = false;
      for (const id of data.ids) {
        const r = atual.registros[id];
        if (!r) continue;
        const novo = aplicarPatch(r, data.patch, em, por);
        if (novo !== r) {
          atual.registros[id] = novo;
          alterados.push(novo);
          mudou = true;
        }
      }
      return mudou ? atual : null;
    });
    return { alterados };
  });

// ── Dados das OS (planilha de Cadastro de OS) ────────────────────────────────

const CADASTRO_ID = "1Qg_PG2EH7tjXXpLrlj5whc7qBdx3UdTKyJY7M05Zk_k";
const ABAS_MESES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export type CptuOsInfo = {
  os: string;
  tomador: string;
  sup: string;
  obra: string;
  local: string;
  dataEnvio: string;
  mes: string;
  /** Quantidade de CPTu na coluna CPTU do cadastro (0 se vazia). */
  cptuCadastro: number;
};

function lerAba(mes: string, rows: string[][]): CptuOsInfo[] {
  // Linha 2 = cabeçalho principal, linha 3 = siglas dos serviços (SP, ST, CPTU…).
  if (rows.length < 4) return [];
  const cab1 = (rows[1] ?? []).map(normalizarTexto);
  const cab2 = (rows[2] ?? []).map(normalizarTexto);
  const col = (nome: string) => cab1.indexOf(nome);
  const iOs = col("OS");
  if (iOs === -1) return [];
  const iTomador = col("TOMADOR");
  const iSup = col("SUP");
  const iObra = col("OBRA");
  const iLocal = col("LOCAL");
  const iEnvio = col("DATA ENVIO");
  const iCptu = cab2.indexOf("CPTU");
  const v = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").toString().trim() : "");
  const out: CptuOsInfo[] = [];
  for (const r of rows.slice(3)) {
    const os = v(r, iOs);
    if (!os) continue;
    const n = Number(v(r, iCptu).replace(",", "."));
    out.push({
      os,
      tomador: v(r, iTomador),
      sup: v(r, iSup),
      obra: v(r, iObra),
      local: v(r, iLocal),
      dataEnvio: v(r, iEnvio),
      mes,
      cptuCadastro: Number.isFinite(n) ? n : 0,
    });
  }
  return out;
}

export const getCadastroCptu = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    if (!isGoogleAuthConfigured())
      return {
        porOs: {} as Record<string, CptuOsInfo>,
        aviso: "Leitura da planilha de Cadastro de OS não configurada no servidor.",
      };
    const abas = await Promise.all(
      ABAS_MESES.map(async (mes) => {
        try {
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${CADASTRO_ID}/values/${encodeURIComponent(`${mes}!A1:Z3000`)}`;
          const data = await sheetsGetValues(url);
          return lerAba(mes, data.values ?? []);
        } catch {
          return [];
        }
      }),
    );
    // Se a mesma OS aparecer em dois meses, fica a do mês mais recente.
    const porOs: Record<string, CptuOsInfo> = {};
    for (const linha of abas.flat()) porOs[chaveOs(linha.os)] = linha;
    return {
      porOs,
      aviso:
        Object.keys(porOs).length === 0
          ? "Não consegui ler a planilha de Cadastro de OS agora."
          : null,
    };
  });
