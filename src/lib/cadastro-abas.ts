// Leitura pura das abas da planilha de Cadastro de OS (sem acesso à rede),
// separada para poder ser testada sem o servidor.

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

// Ordem cronológica (ano corrente). Rótulos curtos em PT para a interface.
export const MESES = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
] as const;
export type Mes = (typeof MESES)[number];

// Nome real de cada aba na planilha (as abas estão em inglês).
export const ABA_POR_MES: Record<Mes, string> = {
  JAN: "January",
  FEV: "February",
  MAR: "March",
  ABR: "April",
  MAI: "May",
  JUN: "June",
  JUL: "July",
  AGO: "August",
  SET: "September",
  OUT: "October",
  NOV: "November",
  DEZ: "December",
};

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

const norm = (s: string) =>
  (s ?? "")
    .toString()
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Converte os valores de uma aba mensal em linhas de cadastro.
 * Linha 2 = cabeçalho (TOMADOR, OS, SUP…), linha 3 = siglas dos serviços,
 * dados a partir da linha 4.
 */
export function parseAbaCadastro(mes: Mes, rows: string[][]): CadastroRow[] {
  if (rows.length < 3) return [];

  const header1 = rows[1] ?? [];
  const header2 = rows[2] ?? [];

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

  if (colTomador === -1) return [];

  const cell = (row: string[], idx: number) => (idx >= 0 ? row[idx] ?? "" : "");

  const parsed: CadastroRow[] = [];
  for (const row of rows.slice(3)) {
    const tomador = cell(row, colTomador).trim();
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
      os: cell(row, colOs),
      sup: cell(row, colSup),
      obra: cell(row, colObra),
      local: cell(row, colLocal),
      dataEnvio: cell(row, colDataEnvio),
      dataCriacao: cell(row, colDataCriacao),
      primeiroSuporte: cell(row, col1Sup),
      primeiroCliente: cell(row, col1Cli),
      segundoSuporte: cell(row, col2Sup),
      segundoCliente: cell(row, col2Cli),
      terceiroSuporte: cell(row, col3Sup),
      terceiroCliente: cell(row, col3Cli),
      servicos,
      totalHoras: total,
    });
  }
  return parsed;
}
