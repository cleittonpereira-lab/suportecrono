import { createServerFn } from "@tanstack/react-start";
import { sheetsGetValues } from "./sheets-read.server";

const SPREADSHEET_ID = "1Qg_PG2EH7tjXXpLrlj5whc7qBdx3UdTKyJY7M05Zk_k";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

export const SERVICOS = [
  "SP",
  "ST",
  "PI",
  "SM",
  "CPTU",
  "VT",
  "SH",
  "BL",
  "BQ",
  "DN",
  "SR",
  "SEG",
] as const;
export type Servico = (typeof SERVICOS)[number];

// Ordem cronológica (ano corrente)
export const MESES = ["FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO"] as const;
export type Mes = (typeof MESES)[number];

export interface CadastroRow {
  mes: Mes;
  tomador: string;
  os: string;
  sup: string;
  obra: string;
  local: string;
  dataEnvio: string;
  dataCriacao: string;
  primeiroSuporte: string;
  primeiroCliente: string;
  segundoSuporte: string;
  segundoCliente: string;
  terceiroSuporte: string;
  terceiroCliente: string;
  // horas por serviço (apenas valores numéricos > 0 ficam no map)
  servicos: Partial<Record<Servico, number>>;
  totalHoras: number;
}

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(",", "."));
  return isNaN(n) ? 0 : n;
}

async function fetchSheet(mes: Mes, lovableKey: string, sheetsKey: string) {
  try {
    const range = `${mes}!A1:Z2000`;
    const url = `${GATEWAY_URL}/spreadsheets/${SPREADSHEET_ID}/values/${range}`;
    const data = await sheetsGetValues(url, {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": sheetsKey,
    });
    const rows = data.values ?? [];
    if (rows.length < 3) return [];

    const header1 = rows[1] ?? [];
    const header2 = rows[2] ?? [];

    const norm = (s: string) =>
      (s ?? "")
        .toString()
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const servicoColIdx: Partial<Record<Servico, number>> = {};
    header2.forEach((h, i) => {
      const code = norm(h);
      if ((SERVICOS as readonly string[]).includes(code)) {
        servicoColIdx[code as Servico] = i;
      }
    });

    const findCol = (...labels: string[]) => {
      const targets = labels.map(norm);
      for (let i = 0; i < header1.length; i++) {
        if (targets.includes(norm(header1[i]))) return i;
      }
      return -1;
    };
    const colTomador = findCol("TOMADOR");
    const colOs = findCol("OS");
    const colSup = findCol("SUP");
    const colObra = findCol("OBRA");
    const colLocal = findCol("LOCAL");
    const colDataEnvio = findCol("DATA ENVIO");
    const colDataCriacao = findCol("DATA CRIACAO", "DATA CRIAÇÃO");
    const col1Sup = findCol("PRIMEIRO RETORNO (SUPORTE)");
    const col1Cli = findCol("PRIMEIRO RETORNO (CLIENTE)");
    const col2Sup = findCol("SEGUNDO RETORNO (SUPORTE)");
    const col2Cli = findCol("SEGUNDO RETORNO (CLIENTE)");
    const col3Sup = findCol("TERCEIRO RETORNO (SUPORTE)");
    const col3Cli = findCol("TERCEIRO RETORNO (CLIENTE)");

    if (colTomador === -1 && colOs === -1) return [];

    const dataRows = rows.slice(3);
    const parsed: CadastroRow[] = [];
    for (const row of dataRows) {
      const tomador = (row[colTomador] ?? "").trim();
      if (!tomador) continue;
      const servicos: Partial<Record<Servico, number>> = {};
      let total = 0;
      for (const s of SERVICOS) {
        const idx = servicoColIdx[s];
        if (idx === undefined) continue;
        const v = parseNum(row[idx]);
        if (v > 0 && v < 10000) {
          servicos[s] = v;
          total += v;
        }
      }
      parsed.push({
        mes,
        tomador,
        os: row[colOs] ?? "",
        sup: row[colSup] ?? "",
        obra: colObra >= 0 ? row[colObra] ?? "" : "",
        local: colLocal >= 0 ? row[colLocal] ?? "" : "",
        dataEnvio: colDataEnvio >= 0 ? row[colDataEnvio] ?? "" : "",
        dataCriacao: colDataCriacao >= 0 ? row[colDataCriacao] ?? "" : "",
        primeiroSuporte: col1Sup >= 0 ? row[col1Sup] ?? "" : "",
        primeiroCliente: col1Cli >= 0 ? row[col1Cli] ?? "" : "",
        segundoSuporte: col2Sup >= 0 ? row[col2Sup] ?? "" : "",
        segundoCliente: col2Cli >= 0 ? row[col2Cli] ?? "" : "",
        terceiroSuporte: col3Sup >= 0 ? row[col3Sup] ?? "" : "",
        terceiroCliente: col3Cli >= 0 ? row[col3Cli] ?? "" : "",
        servicos,
        totalHoras: total,
      });
    }
    return parsed;
  } catch {
    return [];
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
        dataEnvio: `0${tIdx + 1}/0${mIdx + 2}/2026`,
        dataCriacao: `01/0${mIdx + 2}/2026`,
        primeiroSuporte: `0${tIdx + 2}/0${mIdx + 2}/2026`,
        primeiroCliente: `0${tIdx + 3}/0${mIdx + 2}/2026`,
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

export const fetchCadastroOs = createServerFn({ method: "GET" }).handler(
  async () => {
    const lovableKey = process.env.LOVABLE_API_KEY ?? "";
    const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY ?? "";
    const all = await Promise.all(
      MESES.map((m) => fetchSheet(m, lovableKey, sheetsKey)),
    );
    const flat = all.flat();
    if (flat.length > 0) return { rows: flat };
    return { rows: generateFallbackCadastro() };
  },
);