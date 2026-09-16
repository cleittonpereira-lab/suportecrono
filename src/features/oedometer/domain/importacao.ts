/**
 * Leitura de dados de adensamento vindos de fora: colagem do Excel e arquivo
 * da prensa. Núcleo puro — sem React, sem DOM — para poder ser testado.
 *
 * Duas prensas do laboratório escrevem número de formas diferentes (vírgula ou
 * ponto decimal) e registram o deslocamento de formas diferentes (reiniciando a
 * cada estágio ou acumulado desde o início). O cálculo do ensaio trabalha
 * sempre com deslocamento ACUMULADO e compressão POSITIVA; é aqui que tudo é
 * convertido para essa convenção.
 */

export type ModoDeslocamento = "acumulado" | "porEstagio";
export type SinalCompressao = "positivo" | "negativo";

export type Leitura = { t: number; d: number };

/** Leitura marcada como interpolada — não foi medida pela prensa. */
export type LeituraLida = Leitura & { interpolada?: boolean };

/**
 * Quebra uma linha em números, resolvendo o conflito da vírgula.
 *
 * A vírgula pode ser separador de coluna OU decimal, e o parser antigo tratava
 * as duas coisas ao mesmo tempo (`split(/[\t;,\s]+/)`), o que quebrava
 * "0,10  0,0450" em quatro pedaços. A regra aqui é explícita, na ordem:
 *  1. Se a linha tem TAB ou `;`, são eles os separadores e a vírgula é decimal.
 *  2. Senão, se tem espaço, o espaço separa e a vírgula é decimal.
 *  3. Senão, a vírgula separa — e aí o decimal só pode ser o ponto.
 * No caso 3, um número par de campos maior que 2 indica vírgula decimal sem
 * outro separador ("0,10,0,0450"): os campos são remontados dois a dois.
 */
export function numerosDaLinha(linha: string): number[] {
  const texto = linha.trim();
  if (!texto) return [];

  let campos: string[];
  if (/[\t;]/.test(texto)) campos = texto.split(/[\t;]+/);
  else if (/\s/.test(texto)) campos = texto.split(/\s+/);
  else {
    campos = texto.split(",");
    if (campos.length > 2 && campos.length % 2 === 0) {
      const remontados: string[] = [];
      for (let i = 0; i < campos.length; i += 2) remontados.push(`${campos[i]}.${campos[i + 1]}`);
      campos = remontados;
    }
  }

  return campos
    .map((c) => c.trim().replace(",", "."))
    .map((c) => Number(c))
    .filter((v) => Number.isFinite(v));
}

/** Lê a colagem "tempo / leitura", uma linha por leitura. */
export function lerColagem(texto: string): Leitura[] {
  const leituras: Leitura[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    const nums = numerosDaLinha(linha);
    if (nums.length < 2) continue;
    leituras.push({ t: nums[0], d: nums[1] });
  }
  return leituras.sort((a, b) => a.t - b.t);
}

/**
 * Converte as leituras para a convenção do cálculo: deslocamento ACUMULADO
 * desde o início do ensaio e compressão POSITIVA.
 *
 * @param anterior Deslocamento acumulado ao fim do estágio anterior [mm].
 *                 Só é somado quando a prensa reinicia a cada estágio.
 */
export function paraAcumulado(
  leituras: Leitura[],
  opcoes: { modo: ModoDeslocamento; sinal: SinalCompressao; anterior?: number },
): Leitura[] {
  const { modo, sinal, anterior = 0 } = opcoes;
  const giro = sinal === "negativo" ? -1 : 1;
  return leituras.map((l) => ({
    t: l.t,
    d: modo === "porEstagio" ? anterior + l.d * giro : l.d * giro,
  }));
}

/** Tempos que o laboratório costuma exigir no fim do estágio [min]. */
export const TEMPOS_FINAIS = [360, 720, 1440];

/**
 * Completa o fim da curva por extrapolação na reta do adensamento secundário
 * (recalque × log do tempo), que é onde o trecho final do estágio se comporta
 * como reta. Usa as últimas leituras medidas.
 *
 * Os pontos criados vêm marcados com `interpolada: true`: são estimativa, não
 * medida, e o laudo precisa poder dizer isso.
 */
export function completarFinal(
  leituras: Leitura[],
  alvos: number[] = TEMPOS_FINAIS,
  usarUltimas = 3,
): LeituraLida[] {
  const medidas = leituras.filter((l) => l.t > 0).sort((a, b) => a.t - b.t);
  if (medidas.length < 2) return medidas.slice();

  const cauda = medidas.slice(-Math.max(2, usarUltimas));
  const xs = cauda.map((l) => Math.log10(l.t));
  const ys = cauda.map((l) => l.d);
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sxx = xs.reduce((a, x) => a + x * x, 0);
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return medidas.slice();
  const m = (n * sxy - sx * sy) / den;
  const b = (sy - m * sx) / n;

  const ultimo = medidas[medidas.length - 1].t;
  const novos: LeituraLida[] = alvos
    .filter((t) => t > ultimo)
    .map((t) => ({ t, d: +(m * Math.log10(t) + b).toFixed(6), interpolada: true }));

  return [...medidas, ...novos];
}

// ---------------------------------------------------------------------------
// Arquivo da prensa (CSV)
// ---------------------------------------------------------------------------

export type EstagioImportado = {
  etapa: number;
  sigma: number;
  leituras: Leitura[];
};

/**
 * Lê o CSV exportado pela prensa.
 *
 * Formato: cabeçalho solto (linhas "campo;valor"), depois uma linha de títulos
 * contendo "Etapa", e então uma linha por leitura. Separador `;`, decimal
 * vírgula, deslocamento ACUMULADO desde o início e tempo reiniciando a cada
 * etapa. A etapa 0 é o assentamento/zero e não vira estágio.
 */
export function lerCsvDaPrensa(texto: string): EstagioImportado[] {
  const linhas = texto.split(/\r?\n/);
  const iTitulos = linhas.findIndex((l) => /(^|;)\s*Etapa\s*(;|$)/i.test(l));
  if (iTitulos < 0) return [];

  const titulos = linhas[iTitulos].split(";").map((t) => t.trim().toLowerCase());
  const coluna = (procura: string) => titulos.findIndex((t) => t.startsWith(procura));
  const cEtapa = coluna("etapa");
  const cTensao = titulos.findIndex((t) => t.includes("tensao") || t.includes("tensão"));
  const cTempo = titulos.findIndex((t) => t.includes("tempo"));
  const cDesloc = titulos.findIndex((t) => t.includes("deslocamento"));
  if (cEtapa < 0 || cTempo < 0 || cDesloc < 0) return [];

  const numero = (v?: string) => {
    const n = Number((v ?? "").trim().replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };

  const porEtapa = new Map<number, { sigmas: number[]; leituras: Leitura[] }>();
  for (const linha of linhas.slice(iTitulos + 1)) {
    if (!linha.trim()) continue;
    const c = linha.split(";");
    const etapa = numero(c[cEtapa]);
    const t = numero(c[cTempo]);
    const d = numero(c[cDesloc]);
    if (!Number.isFinite(etapa) || etapa <= 0) continue; // etapa 0 = assentamento
    if (!Number.isFinite(t) || !Number.isFinite(d)) continue;
    if (!porEtapa.has(etapa)) porEtapa.set(etapa, { sigmas: [], leituras: [] });
    const alvo = porEtapa.get(etapa)!;
    alvo.leituras.push({ t, d });
    const sigma = cTensao >= 0 ? numero(c[cTensao]) : NaN;
    if (Number.isFinite(sigma)) alvo.sigmas.push(sigma);
  }

  return [...porEtapa.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([etapa, { sigmas, leituras }]) => ({
      etapa,
      // A tensão oscila leitura a leitura (célula de carga): a do estágio é a
      // mediana, que não se deixa levar pelo pico do início do carregamento.
      sigma: sigmas.length ? mediana(sigmas) : 0,
      leituras: leituras.sort((a, b) => a.t - b.t),
    }));
}

function mediana(v: number[]): number {
  const o = [...v].sort((a, b) => a - b);
  const meio = Math.floor(o.length / 2);
  return o.length % 2 ? o[meio] : (o[meio - 1] + o[meio]) / 2;
}
