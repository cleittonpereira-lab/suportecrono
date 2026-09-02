/**
 * Cálculos de Permeabilidade a Carga Variável — Método B, ABNT NBR
 * 14545:2021 (§ 8). Fórmulas e Tabela 1 transcritas diretamente da norma.
 */
import type { PermVBuretaPonto, PermVCalibracao, PermVCapsula, PermVLeitura, PermVSample } from "./types";

/** Umidade de uma cápsula (%). w = (úmido−seco)/(seco−tara) · 100, mesmo cálculo de Umidade Natural/Triaxial. */
export function capsulaUmidadePct(c: PermVCapsula): number | null {
  const ms = c.dry - c.tara;
  const mw = c.wet - c.dry;
  if (!(ms > 0)) return null;
  const w = (mw / ms) * 100;
  return Number.isFinite(w) ? w : null;
}

/** Teor de umidade inicial médio (%) — média das cápsulas válidas. */
export function teorUmidadeMedio(capsulas: PermVCapsula[]): number | null {
  const valid = capsulas.map(capsulaUmidadePct).filter((v): v is number => v != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** Reconhece a tag/descrição do QR ou do cadastro de Tipos de Ensaio como PERM.V. */
export function isPermVTag(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const t = raw.toLowerCase().trim();
  if (t.replace(/\s+/g, "") === "perm.v" || t.replace(/\s+/g, "") === "permv" || t.replace(/\s+/g, "") === "perm-v") return true;
  return t.includes("permeabilidade") && (t.includes("variável") || t.includes("variavel"));
}

/** § 8.1.1, Eq.1 — massa seca (dos sólidos) do corpo de prova. */
export function massaSeca(massaUmida: number, teorUmidade: number): number | null {
  const ms = (massaUmida / (100 + teorUmidade)) * 100;
  return Number.isFinite(ms) ? ms : null;
}

/** Volume do CP a partir do diâmetro e altura iniciais (cm³). */
export function volumeCp(diametroCm: number, alturaCm: number): number | null {
  const v = (Math.PI / 4) * diametroCm * diametroCm * alturaCm;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Área do CP a partir do diâmetro (cm²). */
export function areaCp(diametroCm: number): number | null {
  const a = (Math.PI / 4) * diametroCm * diametroCm;
  return Number.isFinite(a) && a > 0 ? a : null;
}

/** § 8.1.2, Eq.2 — massa específica aparente seca inicial (g/cm³). */
export function massaEspecificaAparenteSeca(ms: number, vcp: number): number | null {
  const rd = ms / vcp;
  return Number.isFinite(rd) && rd > 0 ? rd : null;
}

/** § 8.1.2, Eq.3 — índice de vazios inicial. */
export function indiceDeVazios(rhoS: number, rhoD: number): number | null {
  const e = rhoS / rhoD - 1;
  return Number.isFinite(e) ? e : null;
}

/** § 8.1.2, Eq.4 — grau de saturação inicial (%). ρw = 1 g/cm³. */
export function grauDeSaturacao(rhoS: number, teorUmidade: number, ei: number): number | null {
  if (!(ei > 0)) return null;
  const sr = (rhoS * teorUmidade) / (1 * ei);
  return Number.isFinite(sr) ? sr : null;
}

/** Área interna da bureta (a, cm²), a partir da calibração informada. Não se aplica ao modo "curva" (ver `areaBuretaSegmento`). */
export function areaBureta(cal: PermVCalibracao): number | null {
  if (cal.modo === "volume") {
    if (cal.volumeReferenciaMl != null && cal.alturaReferenciaCm != null && cal.alturaReferenciaCm > 0) {
      const a = cal.volumeReferenciaMl / cal.alturaReferenciaCm;
      return Number.isFinite(a) && a > 0 ? a : null;
    }
    return null;
  }
  if (cal.modo === "curva") return null;
  if (cal.areaBuretaCm2 != null && cal.areaBuretaCm2 > 0) return cal.areaBuretaCm2;
  if (cal.diametroInternoBuretaMm != null) {
    const dCm = cal.diametroInternoBuretaMm / 10;
    const a = (Math.PI / 4) * dCm * dCm;
    return Number.isFinite(a) && a > 0 ? a : null;
  }
  return null;
}

/** Interpola a curva de calibração (leitura -> altura acumulada, cm) — linear entre os dois pontos vizinhos, extrapola nas pontas. */
export function interpolarCurvaBureta(curva: PermVBuretaPonto[], leitura: number): number | null {
  if (curva.length < 2) return null;
  const sorted = [...curva].sort((a, b) => a.leitura - b.leitura);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let p0 = first, p1 = sorted[1];
  if (leitura <= first.leitura) {
    p0 = sorted[0]; p1 = sorted[1];
  } else if (leitura >= last.leitura) {
    p0 = sorted[sorted.length - 2]; p1 = sorted[sorted.length - 1];
  } else {
    for (let i = 0; i < sorted.length - 1; i++) {
      if (leitura >= sorted[i].leitura && leitura <= sorted[i + 1].leitura) {
        p0 = sorted[i]; p1 = sorted[i + 1];
        break;
      }
    }
  }
  if (p1.leitura === p0.leitura) return p0.alturaAcumuladaCm;
  const t = (leitura - p0.leitura) / (p1.leitura - p0.leitura);
  const h = p0.alturaAcumuladaCm + t * (p1.alturaAcumuladaCm - p0.alturaAcumuladaCm);
  return Number.isFinite(h) ? h : null;
}

/**
 * Área efetiva da bureta (a, cm²) entre duas leituras específicas — igual à
 * `areaBureta` para os modos "volume"/"comprimento" (área constante), mas no
 * modo "curva" é derivada localmente do trecho da curva entre as duas
 * leituras (mL percolado / cm de altura naquele trecho), já que a bureta
 * pode não ter seção perfeitamente uniforme.
 */
export function areaBuretaSegmento(cal: PermVCalibracao, leituraAnterior: number, leituraAtual: number): number | null {
  if (cal.modo !== "curva") return areaBureta(cal);
  const h1 = interpolarCurvaBureta(cal.curva, leituraAnterior);
  const h2 = interpolarCurvaBureta(cal.curva, leituraAtual);
  if (h1 == null || h2 == null) return null;
  const deltaLeitura = Math.abs(leituraAtual - leituraAnterior);
  const deltaAltura = Math.abs(h2 - h1);
  if (!(deltaAltura > 0)) return null;
  const a = deltaLeitura / deltaAltura;
  return Number.isFinite(a) && a > 0 ? a : null;
}

/**
 * Converte a leitura bruta da bureta em carga hidráulica h (cm).
 *
 * Modo "volume": a leitura é cumulativa a partir de 0 (água que já saiu da
 * bureta) — a carga cai conforme a água sai, então h = H₀ − leitura/a (a
 * leitura convertida pra cm de altura). Modo "comprimento": a régua ao lado
 * da bureta já mostra a carga direto, sem precisar de H₀.
 */
export function cargaHidraulica(leituraBruta: number, cal: PermVCalibracao, cargaInicial: number | null): number | null {
  if (cal.modo === "comprimento") return leituraBruta;
  if (cargaInicial == null) return null;
  if (cal.modo === "curva") {
    const alturaInterp = interpolarCurvaBureta(cal.curva, leituraBruta);
    if (alturaInterp == null) return null;
    const h = cargaInicial - alturaInterp;
    return Number.isFinite(h) ? h : null;
  }
  const a = areaBureta(cal);
  if (a == null) return null;
  const h = cargaInicial - leituraBruta / a;
  return Number.isFinite(h) ? h : null;
}

/**
 * Tabela 1 — relação entre a viscosidade da água à temperatura de ensaio
 * e a viscosidade da água a 20 °C (R_T). Linhas 8 °C a 31 °C, colunas em
 * décimos de grau (0,0 a 0,9).
 */
const TABELA1_RT: Record<number, number[]> = {
  8: [1.374, 1.370, 1.366, 1.362, 1.358, 1.354, 1.352, 1.348, 1.344, 1.340],
  9: [1.336, 1.332, 1.328, 1.325, 1.321, 1.318, 1.314, 1.310, 1.306, 1.302],
  10: [1.298, 1.294, 1.292, 1.288, 1.284, 1.281, 1.277, 1.273, 1.269, 1.266],
  11: [1.262, 1.259, 1.256, 1.252, 1.249, 1.245, 1.241, 1.238, 1.234, 1.231],
  12: [1.227, 1.224, 1.221, 1.218, 1.215, 1.211, 1.208, 1.205, 1.202, 1.198],
  13: [1.195, 1.192, 1.189, 1.186, 1.183, 1.180, 1.177, 1.174, 1.170, 1.167],
  14: [1.165, 1.162, 1.159, 1.156, 1.153, 1.150, 1.147, 1.144, 1.141, 1.138],
  15: [1.135, 1.132, 1.129, 1.126, 1.123, 1.121, 1.118, 1.115, 1.112, 1.109],
  16: [1.106, 1.103, 1.100, 1.098, 1.095, 1.092, 1.089, 1.086, 1.084, 1.081],
  17: [1.078, 1.075, 1.073, 1.070, 1.067, 1.064, 1.062, 1.059, 1.056, 1.054],
  18: [1.051, 1.048, 1.046, 1.043, 1.041, 1.038, 1.035, 1.033, 1.030, 1.028],
  19: [1.025, 1.023, 1.020, 1.018, 1.015, 1.013, 1.010, 1.008, 1.005, 1.003],
  20: [1.000, 0.998, 0.995, 0.993, 0.991, 0.989, 0.986, 0.984, 0.982, 0.979],
  21: [0.975, 0.973, 0.971, 0.968, 0.966, 0.964, 0.961, 0.959, 0.957, 0.954],
  22: [0.952, 0.950, 0.948, 0.945, 0.943, 0.941, 0.939, 0.937, 0.934, 0.932],
  23: [0.930, 0.928, 0.926, 0.923, 0.921, 0.919, 0.917, 0.915, 0.912, 0.910],
  24: [0.908, 0.906, 0.904, 0.902, 0.900, 0.898, 0.895, 0.893, 0.891, 0.889],
  25: [0.887, 0.885, 0.883, 0.881, 0.879, 0.877, 0.875, 0.873, 0.871, 0.869],
  26: [0.867, 0.865, 0.863, 0.861, 0.859, 0.857, 0.855, 0.853, 0.851, 0.849],
  27: [0.847, 0.845, 0.843, 0.841, 0.839, 0.838, 0.836, 0.834, 0.832, 0.830],
  28: [0.828, 0.826, 0.825, 0.823, 0.821, 0.820, 0.818, 0.816, 0.814, 0.813],
  29: [0.811, 0.809, 0.807, 0.806, 0.804, 0.802, 0.800, 0.798, 0.797, 0.795],
  30: [0.793, 0.791, 0.789, 0.788, 0.786, 0.784, 0.782, 0.780, 0.779, 0.777],
  31: [0.776, 0.775, 0.773, 0.772, 0.770, 0.768, 0.767, 0.765, 0.763, 0.762],
};
const TABELA1_MIN_TEMP = 8;
const TABELA1_MAX_TEMP = 31.9;

/** § 8.4.2 — R_T (Tabela 1), por interpolação/arredondamento a 0,1 °C. Fora da faixa 8–31 °C, usa o extremo mais próximo (a norma não cobre além disso). */
export function fatorRT(temperaturaC: number): number | null {
  if (!Number.isFinite(temperaturaC)) return null;
  const clamped = Math.min(Math.max(temperaturaC, TABELA1_MIN_TEMP), TABELA1_MAX_TEMP);
  const tenths = Math.round(clamped * 10);
  const row = Math.floor(tenths / 10);
  const col = tenths - row * 10;
  const linha = TABELA1_RT[row];
  if (!linha) return null;
  return linha[Math.min(col, 9)];
}

export interface PermVDeterminacao {
  leituraInicial: PermVLeitura;
  leituraFinal: PermVLeitura;
  deltaT: number | null; // s
  h1: number | null; // cm
  h2: number | null; // cm
  k: number | null; // cm/s, à temperatura de ensaio
  k20: number | null; // cm/s, referido a 20°C
  rt: number | null;
  temperaturaMedia: number | null; // °C, média das duas leituras
  volumePercoladoCm3: number | null; // ΔV desde a leitura anterior
}

/**
 * § 8.4 — calcula uma determinação de k a partir de duas leituras
 * consecutivas. `H` e `A` são a altura e a área INICIAIS do corpo de
 * prova (método B usa sempre os valores iniciais, sem adensamento).
 */
export function calcDeterminacao(
  anterior: PermVLeitura,
  atual: PermVLeitura,
  cal: PermVCalibracao,
  H: number | null,
  A: number | null,
  cargaInicial: number | null,
): PermVDeterminacao {
  const a = anterior.leituraBruta != null && atual.leituraBruta != null
    ? areaBuretaSegmento(cal, anterior.leituraBruta, atual.leituraBruta)
    : null;
  const h1 = anterior.leituraBruta != null ? cargaHidraulica(anterior.leituraBruta, cal, cargaInicial) : null;
  const h2 = atual.leituraBruta != null ? cargaHidraulica(atual.leituraBruta, cal, cargaInicial) : null;
  const deltaT =
    anterior.tSegundos != null && atual.tSegundos != null ? atual.tSegundos - anterior.tSegundos : null;

  let k: number | null = null;
  if (a != null && H != null && A != null && deltaT != null && deltaT > 0 && h1 != null && h2 != null && h1 > 0 && h2 > 0) {
    const kCalc = ((a * H) / (A * deltaT)) * Math.log(h1 / h2);
    k = Number.isFinite(kCalc) && kCalc > 0 ? kCalc : null;
  }

  const temps = [anterior.temperatura, atual.temperatura].filter((t): t is number => t != null);
  const tMedia = temps.length ? temps.reduce((s, v) => s + v, 0) / temps.length : null;
  const rt = tMedia != null ? fatorRT(tMedia) : null;
  const k20 = k != null && rt != null ? rt * k : null;

  let volumePercoladoCm3: number | null = null;
  if (anterior.leituraBruta != null && atual.leituraBruta != null) {
    const deltaLeitura = Math.abs(atual.leituraBruta - anterior.leituraBruta);
    volumePercoladoCm3 = cal.modo === "volume" || cal.modo === "curva" ? deltaLeitura : a != null ? deltaLeitura * a : null;
  }

  return { leituraInicial: anterior, leituraFinal: atual, deltaT, h1, h2, k, k20, rt, temperaturaMedia: tMedia, volumePercoladoCm3 };
}

/** Todas as determinações (uma por par de leituras consecutivas válidas), em ordem. */
export function calcDeterminacoes(sample: PermVSample): PermVDeterminacao[] {
  const H = sample.alturaInicial;
  const A = sample.diametroInicial != null ? areaCp(sample.diametroInicial) : null;
  const ordenadas = [...sample.leituras]
    .filter((l) => l.tSegundos != null)
    .sort((x, y) => (x.tSegundos ?? 0) - (y.tSegundos ?? 0));
  const out: PermVDeterminacao[] = [];
  for (let i = 1; i < ordenadas.length; i++) {
    out.push(calcDeterminacao(ordenadas[i - 1], ordenadas[i], sample.calibracao, H, A, sample.cargaHidraulicaInicial));
  }
  return out;
}

/** Volume de água percolado acumulado até cada determinação (cm³). */
export function volumeAcumulado(determinacoes: PermVDeterminacao[]): number[] {
  let acc = 0;
  return determinacoes.map((d) => {
    acc += d.volumePercoladoCm3 ?? 0;
    return acc;
  });
}

/** § 8.5.2, Eq.13 — volume de vazios do corpo de prova (cm³). No método B, V = Vcp(i) e e = índice de vazios inicial. */
export function volumeDeVazios(v: number, e: number): number | null {
  if (!(e >= 0)) return null;
  const vv = v * (e / (1 + e));
  return Number.isFinite(vv) ? vv : null;
}

/** k20 médio das determinações válidas — usar para o item 9.b do relatório. */
export function k20Medio(determinacoes: PermVDeterminacao[]): number | null {
  const vals = determinacoes.map((d) => d.k20).filter((v): v is number => v != null);
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

/** Formata k em notação exponencial (base 10) com 2 algarismos significativos, ex.: "1,2 × 10⁻⁵". */
export function fmtK(k: number | null): string {
  if (k == null || !Number.isFinite(k) || k <= 0) return "—";
  let exp = Math.floor(Math.log10(k));
  let mantRounded = Math.round((k / Math.pow(10, exp)) * 10) / 10;
  if (mantRounded >= 10) {
    mantRounded = 1;
    exp += 1;
  }
  const superscripts: Record<string, string> = {
    "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  };
  const expStr = String(exp).split("").map((c) => superscripts[c] ?? c).join("");
  return `${mantRounded.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} × 10${expStr}`;
}

/**
 * Faixas de permeabilidade (k, cm/s) segundo A. Casagrande e R. E. Fadum —
 * referência clássica de geotecnia para classificar o solo pelo coeficiente
 * de permeabilidade obtido. Da direita (menos permeável) pra esquerda.
 */
export interface PermFaixa {
  nome: string;
  expMin: number; // 10^expMin (cm/s)
  expMax: number; // 10^expMax (cm/s)
}
export const PERM_FAIXAS: PermFaixa[] = [
  { nome: "Argila", expMin: -8, expMax: -6 },
  { nome: "Areias muito finas e siltes, mistura de ambos e argila", expMin: -6, expMax: -2 },
  { nome: "Areia", expMin: -2, expMax: 1 },
  { nome: "Pedregulho", expMin: 1, expMax: 2 },
];

/** Nome da faixa (Casagrande/Fadum) em que o coeficiente de permeabilidade k cai. */
export function classificarPermeabilidade(k: number | null): string | null {
  if (k == null || !(k > 0)) return null;
  const exp = Math.log10(k);
  for (const f of PERM_FAIXAS) {
    if (exp >= f.expMin && exp < f.expMax) return f.nome;
  }
  return exp < PERM_FAIXAS[0].expMin ? PERM_FAIXAS[0].nome : PERM_FAIXAS[PERM_FAIXAS.length - 1].nome;
}

/** Posição (0 a 1, da esquerda/10² pra direita/10⁻⁸) de k na escala log da faixa de classificação — para desenhar o marcador no gráfico. */
export function posicaoNaFaixaPermeabilidade(k: number | null): number | null {
  if (k == null || !(k > 0)) return null;
  const MIN_EXP = -8, MAX_EXP = 2;
  const exp = Math.min(Math.max(Math.log10(k), MIN_EXP), MAX_EXP);
  return (MAX_EXP - exp) / (MAX_EXP - MIN_EXP);
}
