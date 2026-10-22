import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sheetsGetValues } from "./sheets-read.server";
import { isGoogleAuthConfigured } from "./google-auth.server";
import {
  ABA_POR_MES,
  MESES,
  parseAbaCadastro,
  type CadastroRow,
  type Mes,
  type Servico,
} from "./cadastro-abas";

export { SERVICOS, MESES, ABA_POR_MES } from "./cadastro-abas";
export type { Servico, Mes, CadastroRow } from "./cadastro-abas";

const SPREADSHEET_ID = "1Qg_PG2EH7tjXXpLrlj5whc7qBdx3UdTKyJY7M05Zk_k";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

export interface CadastroOsResult {
  rows: CadastroRow[];
  // true quando são dados de exemplo (Google não configurado)
  exemplo?: boolean;
  // mensagem para a interface quando alguma aba não pôde ser lida
  aviso?: string;
}

async function fetchSheet(
  mes: Mes,
  lovableKey: string,
  sheetsKey: string,
): Promise<{ mes: Mes; rows: CadastroRow[]; erro?: string }> {
  try {
    const range = `${ABA_POR_MES[mes]}!A1:Z2000`;
    const url = `${GATEWAY_URL}/spreadsheets/${SPREADSHEET_ID}/values/${range}`;
    const data = await sheetsGetValues(url, {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
    });
    return { mes, rows: parseAbaCadastro(mes, data.values ?? []) };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error(`[cadastro] falha ao ler aba ${ABA_POR_MES[mes]}:`, erro);
    return { mes, rows: [], erro };
  }
}

function generateFallbackCadastro(): CadastroRow[] {
  const sampleTomadores = [
    { tomador: "EPR Litoral Pioneiro", os: "17797-26", obra: "Rodovia BR-277", local: "KM 45 a 80" },
    { tomador: "Motiva Sorocabana", os: "17723-26", obra: "Contorno de Sorocaba", local: "Lote 02" },
    { tomador: "Motiva RioSP", os: "17586-26", obra: "Duplicação Dutra SH-504", local: "Trecho Baixada" },
    { tomador: "EPR Litoral Pioneiro", os: "17588-26", obra: "Manutenção de Pontes", local: "Ponte sobre Rio Itiberê" },
    { tomador: "ViaAppia Concessionária", os: "17590-26", obra: "Trecho Sul KM 45", local: "Campinas - SP" },
    { tomador: "Motiva RioSP", os: "17592-26", obra: "Contenção de Encosta", local: "Serra das Araras" },
  ];

  const rows: CadastroRow[] = [];
  MESES.forEach((mes, mIdx) => {
    const mm = String(mIdx + 1).padStart(2, "0");
    sampleTomadores.forEach((item, tIdx) => {
      const servicos: Partial<Record<Servico, number>> = {
        ST: 12 + tIdx * 4,
        SH: 8 + mIdx * 2,
        SP: tIdx % 2 === 0 ? 15 : 0,
      };
      let total = 0;
      Object.values(servicos).forEach((v) => (total += v || 0));

      rows.push({
        mes,
        tomador: item.tomador,
        os: item.os,
        sup: "SUP-01",
        obra: item.obra,
        local: item.local,
        dataEnvio: `0${tIdx + 1}/${mm}/2026`,
        dataCriacao: `01/${mm}/2026`,
        primeiroSuporte: `0${tIdx + 2}/${mm}/2026`,
        primeiroCliente: `0${tIdx + 3}/${mm}/2026`,
        segundoSuporte: "",
        segundoCliente: "",
        terceiroSuporte: "",
        terceiroCliente: "",
        servicos,
        totalHoras: total,
      });
    });
  });
  return rows;
}

export const fetchCadastroOs = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(
  async (): Promise<CadastroOsResult> => {
    const lovableKey = process.env.LOVABLE_API_KEY ?? "";
    const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY ?? "";
    if (!isGoogleAuthConfigured() && (!lovableKey || !sheetsKey)) {
      return {
        rows: generateFallbackCadastro(),
        exemplo: true,
        aviso: "Google não configurado: exibindo dados de exemplo.",
      };
    }
    const abas = await Promise.all(
      MESES.map((m) => fetchSheet(m, lovableKey, sheetsKey)),
    );
    const rows = abas.flatMap((a) => a.rows);
    const falhas = abas.filter((a) => a.erro).map((a) => a.mes);
    if (falhas.length === MESES.length) {
      return {
        rows: [],
        aviso: "Não foi possível ler a planilha de Cadastro de OS. Tente novamente mais tarde.",
      };
    }
    if (falhas.length > 0) {
      return {
        rows,
        aviso: `Não foi possível ler as abas de: ${falhas.join(", ")}. Os dados desses meses estão faltando.`,
      };
    }
    return { rows };
  },
);
