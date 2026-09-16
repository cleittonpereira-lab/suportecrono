/**
 * Ajuste e filtragem de curvas de ensaio — núcleo puro (sem React, sem servidor).
 *
 * A curva medida em laboratório vem com ruído da célula de carga e do
 * transdutor. Este módulo filtra esse ruído e, opcionalmente, ajusta um modelo
 * de mecânica dos solos (Kondner, Duncan-Chang, Ohde/Janbu, sigmoides…) ao
 * resultado. Quem decide o método é o engenheiro — aqui só há matemática.
 *
 * CONTRATO (o que permite gravar o resultado de volta no ensaio):
 *   `ajustarCurva` devolve UM ponto para CADA ponto recebido, na MESMA ordem e
 *   com o MESMO x. Só o y muda. Isso é essencial: cada leitura de cisalhamento
 *   guarda, na mesma linha, a tensão, a poropressão e a variação volumétrica
 *   medidas no mesmo instante. Se o ajuste removesse ou reordenasse pontos
 *   (como faria um "dedupe and sort"), a tensão ajustada passaria a ser lida
 *   junto da poropressão de outro instante. Pontos não numéricos passam intactos.
 *
 * ENVELOPE — a parte que exige critério de engenharia:
 *   O filtro de percentil móvel com q > 0,5 **sobe** a curva de propósito: ele
 *   assume que o ruído derruba pontos de uma curva de endurecimento monotônica,
 *   e persegue o topo da nuvem. Isso é defensável para tensão (a resistência
 *   real não "cai e volta" a cada leitura), e é indefensável para poropressão,
 *   variação volumétrica ou deslocamento vertical, onde o ruído é simétrico e a
 *   curva legitimamente sobe e desce (dilatância inverte o sinal). Por isso cada
 *   variável tem um perfil, e só quem tem `permiteEnvelopeSuperior` aceita
 *   q > 0,5 — as demais usam mediana móvel (q = 0,5), que não enviesa.
 */

export type Ponto = { x: number; y: number };

export type MetodoAjuste =
  | "kondner-amolecimento" // Kondner + queda pós-pico
  | "kondner"              // hiperbólico puro
  | "duncan"               // Duncan-Chang com Rf
  | "ohde"                 // Ohde/Janbu (potência)
  | "logistica"
  | "gompertz"
  | "expsat"               // saturação exponencial (Hardin-Drnevich)
  | "weibull"              // endurecimento + amolecimento (pico)
  | "loghard"              // endurecimento logarítmico (Vermeer)
  | "polinomial"
  | "lowess"               // suavização estatística local
  | "mediana";             // só o filtro de mediana móvel, sem modelo

// ---------------------------------------------------------------------------
// Filtros estatísticos
// ---------------------------------------------------------------------------

/** Percentil móvel. q = 0,5 é mediana (simétrica); q > 0,5 persegue o topo. */
export function percentilMovel(valores: number[], janela: number, q: number): number[] {
  const meia = Math.floor(Math.max(1, janela) / 2);
  const saida: number[] = [];
  for (let i = 0; i < valores.length; i++) {
    const ini = Math.max(0, i - meia);
    const fim = Math.min(valores.length, i + meia + 1);
    const trecho = valores.slice(ini, fim).sort((a, b) => a - b);
    const pos = (trecho.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    saida.push(lo === hi ? trecho[lo] : trecho[lo] + (trecho[hi] - trecho[lo]) * (pos - lo));
  }
  return saida;
}

/** LOWESS: regressão linear local com peso tricúbico. */
export function lowess(x: number[], y: number[], fracao = 0.3): number[] {
  const n = x.length;
  if (n === 0) return [];
  const k = Math.max(2, Math.round(fracao * n));
  const saida = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const dists = x.map((xi) => Math.abs(xi - x[i]));
    const ordenadas = dists.slice().sort((a, b) => a - b);
    const h = ordenadas[Math.min(k, n - 1)] || 1e-9;
    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    for (let j = 0; j < n; j++) {
      const d = dists[j] / h;
      if (d >= 1) continue;
      const w = (1 - d ** 3) ** 3;
      sw += w; swx += w * x[j]; swy += w * y[j];
      swxx += w * x[j] * x[j]; swxy += w * x[j] * y[j];
    }
    const den = sw * swxx - swx * swx;
    if (Math.abs(den) < 1e-9) {
      saida[i] = sw > 0 ? swy / sw : y[i];
    } else {
      const b = (sw * swxy - swx * swy) / den;
      saida[i] = (swy - b * swx) / sw + b * x[i];
    }
  }
  return saida;
}

/** Coeficiente de variação local (mediana dos CVs por janela) — mede o ruído. */
export function ruidoLocal(valores: number[], janela = 9): number {
  if (valores.length < 3) return 0;
  const meia = Math.floor(janela / 2);
  const cvs: number[] = [];
  for (let i = 0; i < valores.length; i++) {
    const ini = Math.max(0, i - meia);
    const fim = Math.min(valores.length, i + meia + 1);
    const trecho = valores.slice(ini, fim);
    const media = trecho.reduce((a, b) => a + b, 0) / trecho.length;
    if (Math.abs(media) < 1e-9) continue;
    const varia = trecho.reduce((a, b) => a + (b - media) ** 2, 0) / trecho.length;
    cvs.push(Math.sqrt(varia) / Math.abs(media));
  }
  if (!cvs.length) return 0;
  cvs.sort((a, b) => a - b);
  return cvs[Math.floor(cvs.length / 2)];
}

// ---------------------------------------------------------------------------
// Modelos da mecânica dos solos
// ---------------------------------------------------------------------------

/** Kondner + amolecimento sigmoide: σd = ε/(a+b·ε) − c/(1+e^(−k(ε−d))) */
export const modeloKondnerAmolecimento = (e: number, p: number[]) =>
  e / (p[0] + p[1] * e) - p[2] / (1 + Math.exp(-p[4] * (e - p[3])));

/** Kondner puro: σd = ε/(a+b·ε); 1/a = Ei, 1/b = σd,últ */
export const modeloKondner = (e: number, p: number[]) => e / (p[0] + p[1] * e);

/** Duncan-Chang com razão de ruptura Rf. */
export const modeloDuncan = (e: number, p: number[]) =>
  e / (1 / Math.max(p[0], 1e-9) + (p[2] * e) / Math.max(p[1], 1e-9));

/** Ohde / Janbu (potência): σd = a·ε^b */
export const modeloOhde = (e: number, p: number[]) => (e <= 0 ? 0 : p[0] * Math.pow(e, p[1]));

/** Logística: L/(1+e^(−k(ε−d))) */
export const modeloLogistica = (e: number, p: number[]) => p[0] / (1 + Math.exp(-p[1] * (e - p[2])));

/** Gompertz: A·exp(−exp(−k(ε−d))) */
export const modeloGompertz = (e: number, p: number[]) => p[0] * Math.exp(-Math.exp(-p[1] * (e - p[2])));

/** Saturação exponencial: A·(1 − e^(−k·ε)) */
export const modeloExpSat = (e: number, p: number[]) => (e <= 0 ? 0 : p[0] * (1 - Math.exp(-p[1] * e)));

/** Weibull (pico): A·(ε/εp)^m·exp(m(1−ε/εp)) — passa pelo pico A em ε = εp. */
export const modeloWeibull = (e: number, p: number[]) => {
  if (e <= 0 || p[1] <= 0) return 0;
  const r = e / p[1];
  return p[0] * Math.pow(r, p[2]) * Math.exp(p[2] * (1 - r));
};

/** Endurecimento logarítmico: A·ln(1+k·ε) */
export const modeloLogHard = (e: number, p: number[]) => (e <= 0 ? 0 : p[0] * Math.log(1 + p[1] * e));

/** Polinômio de grau N por equações normais + eliminação de Gauss. */
export function ajustarPolinomio(x: number[], y: number[], grau: number): number[] {
  const n = x.length;
  const m = grau + 1;
  const A: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  const B: number[] = new Array(m).fill(0);
  const pot = x.map((xi) => {
    const linha = [1];
    for (let k = 1; k < 2 * m; k++) linha.push(linha[k - 1] * xi);
    return linha;
  });
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let r = 0; r < n; r++) s += pot[r][i + j];
      A[i][j] = s;
    }
    let s = 0;
    for (let r = 0; r < n; r++) s += pot[r][i] * y[r];
    B[i] = s;
  }
  for (let i = 0; i < m; i++) {
    let piv = i;
    for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]];
    [B[i], B[piv]] = [B[piv], B[i]];
    if (Math.abs(A[i][i]) < 1e-12) continue;
    for (let r = i + 1; r < m; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < m; c++) A[r][c] -= f * A[i][c];
      B[r] -= f * B[i];
    }
  }
  const coef = new Array(m).fill(0);
  for (let i = m - 1; i >= 0; i--) {
    let s = B[i];
    for (let j = i + 1; j < m; j++) s -= A[i][j] * coef[j];
    coef[i] = A[i][i] !== 0 ? s / A[i][i] : 0;
  }
  return coef;
}

export function avaliarPolinomio(x: number, coef: number[]): number {
  let s = 0;
  for (let i = coef.length - 1; i >= 0; i--) s = s * x + coef[i];
  return s;
}

/** Otimizador por gradiente numérico com passo adaptativo. */
export function ajustarModelo(
  x: number[],
  y: number[],
  modelo: (xi: number, p: number[]) => number,
  p0: number[],
  limites: (idx: number, v: number) => number,
  iteracoes = 4000,
): number[] {
  let p = p0.slice();
  let passo = 1e-3;
  const h = 1e-5;
  const erro = (q: number[]) => {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += (modelo(x[i], q) - y[i]) ** 2;
    return s;
  };
  let anterior = erro(p);
  for (let it = 0; it < iteracoes; it++) {
    const grad: number[] = [];
    for (let j = 0; j < p.length; j++) {
      const pp = p.slice(); pp[j] += h;
      const pm = p.slice(); pm[j] -= h;
      grad.push((erro(pp) - erro(pm)) / (2 * h));
    }
    const novo = p.map((v, j) => limites(j, v - passo * grad[j] * (v === 0 ? 1 : Math.abs(v))));
    const atual = erro(novo);
    if (atual < anterior) { p = novo; anterior = atual; passo *= 1.1; }
    else passo *= 0.5;
    if (passo < 1e-12) break;
  }
  return p;
}

// ---------------------------------------------------------------------------
// Perfis por variável — onde mora o critério de engenharia
// ---------------------------------------------------------------------------

export type VariavelAjustavel =
  | "tensao-desviadora"
  | "poropressao"
  | "variacao-volumetrica"
  | "tensao-cisalhante"
  | "deslocamento-vertical";

export type PerfilVariavel = {
  rotulo: string;
  unidade: string;
  eixoX: string;
  /** Percentil padrão do filtro. 0,5 = mediana (não enviesa). */
  percentilPadrao: number;
  /** Se falso, o percentil fica travado em 0,5 — ver cabeçalho do arquivo. */
  permiteEnvelopeSuperior: boolean;
  metodoPadrao: MetodoAjuste;
  metodos: MetodoAjuste[];
  forcarZeroInicial: boolean;
  permiteNegativo: boolean;
  /** Por que esta variável tem este tratamento — mostrado na tela. */
  nota: string;
};

/** Modelos paramétricos só fazem sentido em curva que sobe de zero. */
const MODELOS_DE_RESISTENCIA: MetodoAjuste[] = [
  "kondner-amolecimento", "kondner", "duncan", "ohde",
  "logistica", "gompertz", "expsat", "weibull", "loghard",
  "polinomial", "lowess", "mediana",
];

/** Curva livre (sobe, desce, muda de sinal): só suavização. */
const SO_SUAVIZACAO: MetodoAjuste[] = ["lowess", "mediana", "polinomial"];

export const PERFIS: Record<VariavelAjustavel, PerfilVariavel> = {
  "tensao-desviadora": {
    rotulo: "Tensão desviadora (σd)",
    unidade: "kPa",
    eixoX: "εa [%]",
    percentilPadrao: 0.8,
    permiteEnvelopeSuperior: true,
    metodoPadrao: "kondner-amolecimento",
    metodos: MODELOS_DE_RESISTENCIA,
    forcarZeroInicial: true,
    permiteNegativo: false,
    nota: "Curva de endurecimento: o ruído derruba pontos, então o envelope superior persegue o topo da nuvem.",
  },
  poropressao: {
    rotulo: "Poropressão (u)",
    unidade: "kPa",
    eixoX: "εa [%]",
    percentilPadrao: 0.5,
    permiteEnvelopeSuperior: false,
    metodoPadrao: "lowess",
    metodos: SO_SUAVIZACAO,
    forcarZeroInicial: false,
    permiteNegativo: true,
    nota: "u parte da contrapressão e cai na dilatância: ruído simétrico, curva não monotônica. Só mediana/LOWESS — envelope superior enviesaria a resistência efetiva.",
  },
  "variacao-volumetrica": {
    rotulo: "Variação volumétrica (εv)",
    unidade: "%",
    eixoX: "εa [%]",
    percentilPadrao: 0.5,
    permiteEnvelopeSuperior: false,
    metodoPadrao: "lowess",
    metodos: SO_SUAVIZACAO,
    forcarZeroInicial: false,
    permiteNegativo: true,
    nota: "Compressão e dilatação invertem o sinal de εv; suavização simétrica preserva a inversão.",
  },
  "tensao-cisalhante": {
    rotulo: "Tensão cisalhante (τ)",
    unidade: "kPa",
    eixoX: "δh [mm]",
    percentilPadrao: 0.8,
    permiteEnvelopeSuperior: true,
    metodoPadrao: "weibull",
    metodos: MODELOS_DE_RESISTENCIA,
    forcarZeroInicial: true,
    permiteNegativo: false,
    nota: "Curva de resistência com pico e queda residual — modelos com amolecimento se aplicam.",
  },
  "deslocamento-vertical": {
    rotulo: "Deslocamento vertical (δv)",
    unidade: "mm",
    eixoX: "δh [mm]",
    percentilPadrao: 0.5,
    permiteEnvelopeSuperior: false,
    metodoPadrao: "lowess",
    metodos: SO_SUAVIZACAO,
    forcarZeroInicial: false,
    permiteNegativo: true,
    nota: "Recalque é negativo e a dilatância inverte o sinal: suavização simétrica, sem forçar zero.",
  },
};

// ---------------------------------------------------------------------------
// Ajuste
// ---------------------------------------------------------------------------

export type OpcoesAjuste = {
  metodo?: MetodoAjuste;
  janela?: number;
  percentil?: number;
  fracaoLowess?: number;
  forcarZeroInicial?: boolean;
  iteracoes?: number;
  grauPolinomio?: number;
  /** Quando falso, valores negativos são levados a zero. */
  permiteNegativo?: boolean;
};

export type PontoAjustado = { x: number; yBruto: number; yEnvelope: number; yAjustado: number };

export type ResultadoAjuste = {
  pontos: PontoAjustado[];
  metodo: MetodoAjuste;
  params?: number[];
  nomesParams?: string[];
  /** Distância entre a curva ajustada e os dados MEDIDOS (não o envelope). */
  rmse: number;
  r2: number;
};

export const NOMES_DOS_METODOS: Record<MetodoAjuste, string> = {
  "kondner-amolecimento": "Kondner + amolecimento",
  kondner: "Kondner (hiperbólico)",
  duncan: "Duncan-Chang (Rf)",
  ohde: "Ohde / Janbu (potência)",
  logistica: "Logística",
  gompertz: "Gompertz",
  expsat: "Saturação exponencial",
  weibull: "Weibull (pico)",
  loghard: "Endurecimento logarítmico",
  polinomial: "Polinomial",
  lowess: "LOWESS (suavização local)",
  mediana: "Mediana móvel",
};

/** Chutes iniciais a partir do envelope. */
function chute(metodo: MetodoAjuste, x: number[], env: number[]): number[] {
  const yMax = Math.max(...env, 1e-6);
  const xMax = x[x.length - 1] || 1;
  let iPico = 0;
  for (let i = 1; i < env.length; i++) if (env[i] > env[iPico]) iPico = i;
  switch (metodo) {
    case "kondner-amolecimento": return [xMax / yMax, 1 / yMax, 0.05 * yMax, x[iPico] || xMax * 0.5, 1];
    case "kondner": return [xMax / yMax, 1 / yMax];
    case "duncan": return [(2 * yMax) / xMax, yMax * 1.1, 0.9];
    case "ohde": return [yMax / Math.pow(xMax || 1, 0.5), 0.5];
    case "logistica": return [yMax, 1, xMax * 0.4];
    case "gompertz": return [yMax, 1, xMax * 0.35];
    case "expsat": return [yMax, 3 / Math.max(xMax, 1e-6)];
    case "weibull": return [env[iPico] || yMax, x[iPico] || xMax * 0.5, 2];
    case "loghard": return [yMax / Math.log(1 + xMax), 1];
    default: return [];
  }
}

const POSITIVO = (_: number, v: number) => Math.max(1e-6, v);

const MODELOS: Partial<Record<MetodoAjuste, {
  fn: (x: number, p: number[]) => number;
  nomes: string[];
  limites: (i: number, v: number) => number;
}>> = {
  "kondner-amolecimento": {
    fn: modeloKondnerAmolecimento,
    nomes: ["a", "b", "c", "d", "k"],
    limites: (i, v) => (i === 2 ? Math.max(0, v) : Math.max(1e-6, v)),
  },
  kondner: { fn: modeloKondner, nomes: ["a (=1/Ei)", "b (=1/σd,últ)"], limites: POSITIVO },
  duncan: {
    fn: modeloDuncan,
    nomes: ["Ei", "σdf", "Rf"],
    limites: (i, v) => (i === 2 ? Math.min(0.99, Math.max(0.1, v)) : Math.max(1e-6, v)),
  },
  ohde: {
    fn: modeloOhde,
    nomes: ["a", "b (expoente)"],
    limites: (i, v) => (i === 1 ? Math.min(2, Math.max(0.05, v)) : Math.max(1e-6, v)),
  },
  logistica: { fn: modeloLogistica, nomes: ["L (assíntota)", "k", "d (ε de inflexão)"], limites: POSITIVO },
  gompertz: { fn: modeloGompertz, nomes: ["A (assíntota)", "k", "d (ε de inflexão)"], limites: POSITIVO },
  expsat: { fn: modeloExpSat, nomes: ["A (assíntota)", "k (taxa)"], limites: POSITIVO },
  weibull: {
    fn: modeloWeibull,
    nomes: ["A (pico)", "εp (ε do pico)", "m (esbeltez)"],
    limites: (i, v) => (i === 2 ? Math.max(0.3, Math.min(10, v)) : Math.max(1e-6, v)),
  },
  loghard: { fn: modeloLogHard, nomes: ["A", "k"], limites: POSITIVO },
};

/**
 * Filtra e ajusta uma curva. Devolve um ponto para cada ponto recebido, na
 * mesma ordem e com o mesmo x — ver CONTRATO no cabeçalho do arquivo.
 */
export function ajustarCurva(pontos: Ponto[], opcoes: OpcoesAjuste = {}): ResultadoAjuste {
  const {
    metodo = "lowess",
    janela = 7,
    percentil = 0.5,
    fracaoLowess = 0.3,
    forcarZeroInicial = false,
    iteracoes = 4000,
    grauPolinomio = 5,
    permiteNegativo = true,
  } = opcoes;

  // Índices dos pontos numéricos, em ordem crescente de x. Os filtros de
  // janela pressupõem a sequência ordenada; a saída volta à ordem original.
  const validos = pontos
    .map((p, i) => i)
    .filter((i) => Number.isFinite(pontos[i]?.x) && Number.isFinite(pontos[i]?.y))
    .sort((a, b) => pontos[a].x - pontos[b].x);

  const saida: PontoAjustado[] = pontos.map((p) => ({
    x: p?.x, yBruto: p?.y, yEnvelope: p?.y, yAjustado: p?.y,
  }));
  if (validos.length === 0) return { pontos: saida, metodo, rmse: 0, r2: 0 };

  const x = validos.map((i) => pontos[i].x);
  const y = validos.map((i) => pontos[i].y);
  const envelope = percentilMovel(y, Math.max(1, janela), percentil);

  let ajustada: number[];
  let params: number[] | undefined;
  let nomesParams: string[] | undefined;

  const m = MODELOS[metodo];
  if (m) {
    params = ajustarModelo(x, envelope, m.fn, chute(metodo, x, envelope), m.limites, iteracoes);
    nomesParams = m.nomes;
    ajustada = x.map((xi) => m.fn(xi, params!));
  } else if (metodo === "polinomial") {
    const g = Math.max(2, Math.min(8, Math.round(grauPolinomio)));
    params = ajustarPolinomio(x, envelope, g);
    nomesParams = params.map((_, i) => `c${i}`);
    ajustada = x.map((xi) => avaliarPolinomio(xi, params!));
  } else if (metodo === "mediana") {
    ajustada = envelope.slice();
  } else {
    ajustada = lowess(x, envelope, fracaoLowess);
  }

  if (!permiteNegativo) ajustada = ajustada.map((v) => Math.max(0, v));
  if (forcarZeroInicial && ajustada.length) ajustada[0] = 0;

  // Qualidade medida contra o dado REAL, não contra o envelope: um ajuste pode
  // colar no envelope e ainda assim estar longe do que o laboratório mediu.
  let sse = 0;
  const media = y.reduce((a, b) => a + b, 0) / y.length;
  let sst = 0;
  for (let i = 0; i < y.length; i++) {
    sse += (ajustada[i] - y[i]) ** 2;
    sst += (y[i] - media) ** 2;
  }
  const rmse = Math.sqrt(sse / y.length);
  const r2 = sst > 0 ? 1 - sse / sst : 1;

  validos.forEach((orig, k) => {
    saida[orig] = {
      x: x[k],
      yBruto: y[k],
      yEnvelope: envelope[k],
      yAjustado: Math.round(ajustada[k] * 1e4) / 1e4,
    };
  });

  return { pontos: saida, metodo, params, nomesParams, rmse, r2 };
}

// ---------------------------------------------------------------------------
// Sugestão automática de método
// ---------------------------------------------------------------------------

export type MetodoNoRanking = {
  metodo: MetodoAjuste;
  nome: string;
  rmse: number;
  nParams: number;
  score: number; // menor = melhor
  percentil: number;
  grauPolinomio?: number;
  ressalva?: string;
};

export type Sugestao = {
  melhor: MetodoAjuste;
  justificativa: string;
  ranking: MetodoNoRanking[];
  temPico: boolean;
  ruido: number;
  janela: number;
  percentil: number;
  grauPolinomio: number;
};

const COM_AMOLECIMENTO: MetodoAjuste[] = ["kondner-amolecimento", "weibull"];

/**
 * Testa os métodos que o perfil da variável permite e escolhe o melhor.
 * Score = aderência a um envelope de referência fixo + penalidade por oscilação
 * e por número de parâmetros. O envelope de referência é fixo para não premiar
 * configurações que achatam a própria referência.
 */
export function sugerirMetodo(pontos: Ponto[], perfil: PerfilVariavel): Sugestao | null {
  const limpos = pontos.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    .slice().sort((a, b) => a.x - b.x);
  if (limpos.length < 5) return null;

  const y = limpos.map((p) => p.y);
  const ruido = ruidoLocal(y, 9);
  const janela = ruido > 0.3 ? 9 : ruido > 0.15 ? 7 : 5;

  const qRef = perfil.permiteEnvelopeSuperior ? 0.9 : 0.5;
  const ref = percentilMovel(y, Math.max(3, Math.min(7, limpos.length - 2)), qRef);
  const refSuave = ref.map((_, i) => {
    const s = Math.max(0, i - 1), e = Math.min(ref.length, i + 2);
    let soma = 0;
    for (let j = s; j < e; j++) soma += ref[j];
    return soma / (e - s);
  });
  const escala = Math.max(...refSuave.map(Math.abs), 1e-6);

  let iMax = 0;
  for (let i = 1; i < refSuave.length; i++) if (refSuave[i] > refSuave[iMax]) iMax = i;
  const temPico =
    iMax < refSuave.length - Math.max(2, Math.floor(refSuave.length * 0.15)) &&
    (refSuave[iMax] - refSuave[refSuave.length - 1]) / Math.max(1e-6, Math.abs(refSuave[iMax])) > 0.08;

  const distancia = (curva: number[]) => {
    let s = 0;
    for (let i = 0; i < curva.length; i++) s += ((curva[i] - refSuave[i]) / escala) ** 2;
    return Math.sqrt(s / curva.length);
  };
  const rugosidade = (curva: number[]) => {
    if (curva.length < 3) return 0;
    let s = 0;
    for (let i = 1; i < curva.length - 1; i++) s += Math.abs(curva[i + 1] - 2 * curva[i] + curva[i - 1]);
    return s / (escala * (curva.length - 2));
  };

  const percentis = perfil.permiteEnvelopeSuperior ? [0.7, 0.75, 0.8, 0.85, 0.9] : [0.5];
  const graus = [3, 4, 5, 6];
  const melhores = new Map<MetodoAjuste, MetodoNoRanking>();

  for (const metodo of perfil.metodos) {
    for (const pct of percentis) {
      for (const g of metodo === "polinomial" ? graus : [5]) {
        try {
          const r = ajustarCurva(limpos, {
            metodo, janela, percentil: pct, grauPolinomio: g,
            fracaoLowess: 0.3,
            forcarZeroInicial: perfil.forcarZeroInicial,
            permiteNegativo: perfil.permiteNegativo,
          });
          const curva = r.pontos.map((p) => p.yAjustado);
          const d = distancia(curva);
          if (!Number.isFinite(d)) continue;
          const k = metodo === "polinomial" ? g + 1 : (r.params?.length ?? 2);
          let score = d + 6 * rugosidade(curva) + 0.002 * k;
          let ressalva: string | undefined;
          if (temPico && !COM_AMOLECIMENTO.includes(metodo) && perfil.permiteEnvelopeSuperior) {
            score += 0.15;
            ressalva = "não captura o pico";
          }
          if (metodo === "polinomial") {
            score += 0.05;
            ressalva = ressalva ?? "pode oscilar nas bordas";
          }
          const anterior = melhores.get(metodo);
          if (!anterior || score < anterior.score) {
            melhores.set(metodo, {
              metodo, nome: NOMES_DOS_METODOS[metodo], rmse: r.rmse, nParams: k,
              score, percentil: pct, ressalva,
              grauPolinomio: metodo === "polinomial" ? g : undefined,
            });
          }
        } catch {
          // modelo divergiu com estes dados — segue para o próximo
        }
      }
    }
  }

  const ranking = [...melhores.values()].sort((a, b) => a.score - b.score);
  if (!ranking.length) return null;
  const melhor = ranking[0];

  const partes = [
    temPico
      ? "A curva tem pico com queda depois — modelos com amolecimento levam vantagem."
      : "A curva é monotônica, sem pico claro.",
    ruido > 0.25
      ? `Ruído alto (CV≈${(ruido * 100).toFixed(0)}%): modelo paramétrico é mais robusto que suavização.`
      : `Ruído moderado (CV≈${(ruido * 100).toFixed(0)}%).`,
    `Escolhido: ${melhor.nome} (RMSE ${melhor.rmse.toFixed(2)}, ${melhor.nParams} parâmetros).`,
  ];

  return {
    melhor: melhor.metodo,
    justificativa: partes.join(" "),
    ranking, temPico, ruido, janela,
    percentil: melhor.percentil,
    grauPolinomio: melhor.grauPolinomio ?? 5,
  };
}

// ---------------------------------------------------------------------------
// Registro do ajuste (auditoria)
// ---------------------------------------------------------------------------

/**
 * O que fica guardado no corpo de prova quando um ajuste é aplicado.
 * `original` só é gravado na PRIMEIRA aplicação: assim "restaurar original"
 * devolve sempre o dado medido, mesmo depois de vários ajustes seguidos.
 */
export type RegistroDeAjuste = {
  variavel: VariavelAjustavel;
  original: number[];
  metodo: MetodoAjuste;
  params?: number[];
  opcoes: OpcoesAjuste;
  rmse: number;
  r2: number;
  aplicadoPor: string;
  aplicadoPorId?: string;
  aplicadoEm: string;
  observacao?: string;
};
