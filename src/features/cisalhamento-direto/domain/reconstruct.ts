/**
 * Módulo de Reconstrução Linear, Reamostragem e Validação de Dados de Cisalhamento Direto (ASTM D3080).
 * 
 * Resolve casos onde o sistema de aquisição não gravou o deslocamento horizontal (coluna zerada/vazia),
 * reconstruindo os dados proporcionalmente ao tempo/índice de leitura e realizando a reamostragem
 * por interpolação linear contínua entre leituras adjacentes para todas as variáveis.
 */

import type { CDReading } from "../types";

export interface RawShearReading {
  timeMin?: number;
  horizDispMm?: number;
  vertDispMm?: number;
  shearForceN?: number;
  loadKgf?: number;
  shearStressKPa?: number;
}

export interface ReconstructParams {
  deltaIni: number;       // Deslocamento inicial (padrão: 0 mm)
  deltaFin: number;       // Deslocamento final (padrão: 12 mm, editável)
  deltaStep: number;      // Incremento desejado (padrão: 0.5 mm, editável)
  speedMmMin?: number;    // Velocidade de ensaio (mm/min, se houver coluna de tempo)
  useTimeIfAvailable?: boolean;
}

export interface ValidationReport {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  isHorizZeroOrConstant: boolean;
  hasTimeColumn: boolean;
  isTimeRegular: boolean;
  rawPointCount: number;
  resampledPointCount: number;
  timeIrregularities?: { index: number; type: "pause" | "jump" | "duplicate"; message: string }[];
  cpDiscrepancies?: { cpId: string; count: number; diffPct: number }[];
}

/**
 * Detecta se a coluna de deslocamento horizontal está integralmente zerada, constante ou vazia.
 */
export function detectZeroOrConstantHoriz(readings: RawShearReading[]): boolean {
  if (!readings || readings.length === 0) return true;
  const values = readings
    .map((r) => r.horizDispMm)
    .filter((v): v is number => v != null && isFinite(v));

  if (values.length === 0) return true;

  const min = Math.min(...values);
  const max = Math.max(...values);

  // Se todos são zero ou a variação é menor que 0.001 mm
  if (Math.abs(max - min) < 0.001) return true;

  // Se mais de 98% dos pontos forem exatamente 0
  const zeros = values.filter((v) => Math.abs(v) < 0.0001).length;
  if (zeros / values.length > 0.95) return true;

  return false;
}

/**
 * Analisa a regularidade da coluna de tempo (se presente).
 */
export function analyzeTimeColumn(readings: RawShearReading[]): {
  hasTime: boolean;
  isRegular: boolean;
  irregularities: { index: number; type: "pause" | "jump" | "duplicate"; message: string }[];
  medianDt?: number;
} {
  const withTime = readings.filter((r) => r.timeMin != null && isFinite(r.timeMin));
  if (withTime.length < 3) {
    return { hasTime: false, isRegular: false, irregularities: [] };
  }

  const dtList: number[] = [];
  const irregularities: { index: number; type: "pause" | "jump" | "duplicate"; message: string }[] = [];

  for (let i = 1; i < withTime.length; i++) {
    const tPrev = withTime[i - 1].timeMin!;
    const tCurr = withTime[i].timeMin!;
    const dt = tCurr - tPrev;

    if (dt <= 0) {
      irregularities.push({
        index: i,
        type: "duplicate",
        message: `Leitura duplicada ou tempo decrescente na linha ${i + 1} (dt = ${dt.toFixed(4)} min).`,
      });
    } else {
      dtList.push(dt);
    }
  }

  if (dtList.length === 0) {
    return { hasTime: true, isRegular: false, irregularities };
  }

  dtList.sort((a, b) => a - b);
  const medianDt = dtList[Math.floor(dtList.length / 2)];

  // Checa saltos ou pausas
  for (let i = 1; i < withTime.length; i++) {
    const dt = withTime[i].timeMin! - withTime[i - 1].timeMin!;
    if (dt > 2.5 * medianDt && medianDt > 0) {
      irregularities.push({
        index: i,
        type: "pause",
        message: `Possível pausa/salto na aquisição na linha ${i + 1} (intervalo de ${(dt * 60).toFixed(1)}s vs esperado ${(medianDt * 60).toFixed(1)}s).`,
      });
    }
  }

  return {
    hasTime: true,
    isRegular: irregularities.length === 0,
    irregularities,
    medianDt,
  };
}

/**
 * Valida a consistência de múltiplos corpos de prova importados juntos.
 * Divergência > 5% no número de leituras deve gerar alerta.
 */
export function validateMultiSpecimenCounts(
  specimens: { cpId: string; readings: RawShearReading[] }[]
): { hasDivergence: boolean; details: { cpId: string; count: number; diffPct: number }[] } {
  if (!specimens || specimens.length < 2) {
    return { hasDivergence: false, details: [] };
  }

  const counts = specimens.map((s) => ({ cpId: s.cpId, count: s.readings.length }));
  const validCounts = counts.filter((c) => c.count > 0);
  if (validCounts.length < 2) return { hasDivergence: false, details: [] };

  const avgCount = validCounts.reduce((acc, c) => acc + c.count, 0) / validCounts.length;

  const details = validCounts.map((c) => {
    const diffPct = Math.abs((c.count - avgCount) / avgCount) * 100;
    return { ...c, diffPct };
  });

  const maxDiff = Math.max(...details.map((d) => d.diffPct));
  return {
    hasDivergence: maxDiff > 5,
    details,
  };
}

/**
 * Realiza a validação completa de parâmetros e dados de entrada.
 */
export function validateReconstructParams(
  readings: RawShearReading[],
  params: ReconstructParams
): ValidationReport {
  const warnings: string[] = [];
  const errors: string[] = [];

  const N = readings.length;
  const isHorizZero = detectZeroOrConstantHoriz(readings);
  const timeAnalysis = analyzeTimeColumn(readings);

  if (N < 2) {
    errors.push("O arquivo ou texto colado possui menos de 2 leituras válidas.");
  }

  if (params.deltaFin <= params.deltaIni) {
    errors.push(`Deslocamento final (${params.deltaFin} mm) deve ser maior que o inicial (${params.deltaIni} mm).`);
  }

  if (params.deltaStep <= 0) {
    errors.push(`O incremento de saída (${params.deltaStep} mm) deve ser maior que zero.`);
  }

  const span = params.deltaFin - params.deltaIni;
  if (span > 0 && params.deltaStep > span) {
    warnings.push(`O deslocamento final (${params.deltaFin} mm) é menor que o incremento (${params.deltaStep} mm).`);
  }

  const targetPointCount = span > 0 && params.deltaStep > 0
    ? Math.floor(span / params.deltaStep + 1e-6) + 1
    : 0;

  if (N > 0 && targetPointCount > N) {
    warnings.push(
      `O número de leituras brutas (${N}) é menor que o número de pontos a gerar (${targetPointCount}). Reamostragem para cima pode criar pontos artificiais.`
    );
  }

  if (timeAnalysis.hasTime && !timeAnalysis.isRegular) {
    warnings.push(
      `Identificadas ${timeAnalysis.irregularities.length} irregularidades na coluna de tempo (pausas ou leituras duplicadas). A reconstrução proporcional ao índice será utilizada.`
    );
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
    isHorizZeroOrConstant: isHorizZero,
    hasTimeColumn: timeAnalysis.hasTime,
    isTimeRegular: timeAnalysis.isRegular,
    rawPointCount: N,
    resampledPointCount: targetPointCount,
    timeIrregularities: timeAnalysis.irregularities,
  };
}

/**
 * Reconstrução do deslocamento horizontal por interpolação linear contínua.
 * 
 * δ_i = δ_ini + (δ_fin - δ_ini) * (i / (N - 1))
 * Ou se tempo estiver disponível e velocidade informada:
 * δ_i = v * t_i
 */
export function reconstructShearReadings(
  readings: RawShearReading[],
  params: ReconstructParams
): CDReading[] {
  const N = readings.length;
  if (N === 0) return [];
  if (N === 1) {
    return [
      {
        horizDispMm: params.deltaIni,
        vertDispMm: readings[0].vertDispMm ?? 0,
        loadKgf: readings[0].loadKgf ?? (readings[0].shearForceN ? readings[0].shearForceN / 9.80665 : 0),
        shearForce: readings[0].shearForceN ?? (readings[0].loadKgf ? readings[0].loadKgf * 9.80665 : 0),
      },
    ];
  }

  const isHorizZero = detectZeroOrConstantHoriz(readings);
  const timeAnalysis = analyzeTimeColumn(readings);

  // 1. Reconstruir a coluna de deslocamento horizontal
  const withHoriz: { h: number; v: number; fN: number; fKgf: number }[] = readings.map((r, i) => {
    let h = r.horizDispMm ?? 0;

    if (isHorizZero) {
      if (params.useTimeIfAvailable && timeAnalysis.hasTime && timeAnalysis.isRegular && params.speedMmMin && params.speedMmMin > 0) {
        // Reconstrução alternativa confiável: δ = v * t
        const t0 = readings[0].timeMin ?? 0;
        const t = (r.timeMin ?? 0) - t0;
        h = params.deltaIni + params.speedMmMin * t;
      } else {
        // Distribuição linear padrão: δ_i = δ_ini + (δ_fin - δ_ini) * (i / (N - 1))
        h = params.deltaIni + (params.deltaFin - params.deltaIni) * (i / (N - 1));
      }
    }

    const v = r.vertDispMm ?? 0;
    const fN = r.shearForceN ?? (r.loadKgf != null ? r.loadKgf * 9.80665 : 0);
    const fKgf = r.loadKgf ?? (fN / 9.80665);

    return { h, v, fN, fKgf };
  });

  // Se não foi solicitado reamostragem com deltaStep ou step é <= 0, retorna direto os pontos reconstruídos
  if (!params.deltaStep || params.deltaStep <= 0) {
    return withHoriz.map((row) => ({
      horizDispMm: Number(row.h.toFixed(4)),
      vertDispMm: Number(row.v.toFixed(4)),
      shearForce: Number(row.fN.toFixed(2)),
      loadKgf: Number(row.fKgf.toFixed(2)),
    }));
  }

  // 2. Reamostragem nos deslocamentos-alvo (0, 0.5, 1.0, ... deltaFin)
  // Aplicando interpolação linear contínua entre as duas leituras adjacentes para TODAS as colunas
  const targetDisplacements: number[] = [];
  const span = params.deltaFin - params.deltaIni;
  const numPoints = Math.floor(span / params.deltaStep + 1e-6) + 1;

  for (let k = 0; k < numPoints; k++) {
    const targetH = params.deltaIni + k * params.deltaStep;
    targetDisplacements.push(Number(targetH.toFixed(4)));
  }

  // Garante que o último ponto seja exatamente deltaFin
  if (targetDisplacements[targetDisplacements.length - 1] < params.deltaFin - 1e-5) {
    targetDisplacements.push(params.deltaFin);
  }

  const resampled: CDReading[] = [];

  for (const targetH of targetDisplacements) {
    // Localiza o intervalo [k, k+1] onde withHoriz[k].h <= targetH <= withHoriz[k+1].h
    let interpolatedV = 0;
    let interpolatedFN = 0;
    let interpolatedFKgf = 0;

    if (targetH <= withHoriz[0].h) {
      interpolatedV = withHoriz[0].v;
      interpolatedFN = withHoriz[0].fN;
      interpolatedFKgf = withHoriz[0].fKgf;
    } else if (targetH >= withHoriz[withHoriz.length - 1].h) {
      const last = withHoriz[withHoriz.length - 1];
      interpolatedV = last.v;
      interpolatedFN = last.fN;
      interpolatedFKgf = last.fKgf;
    } else {
      let idx = 0;
      while (idx < withHoriz.length - 1 && withHoriz[idx + 1].h < targetH) {
        idx++;
      }

      const p0 = withHoriz[idx];
      const p1 = withHoriz[Math.min(idx + 1, withHoriz.length - 1)];

      const dh = p1.h - p0.h;
      const factor = dh > 1e-9 ? (targetH - p0.h) / dh : 0;

      // Interpolação linear contínua para todas as variáveis
      interpolatedV = p0.v + factor * (p1.v - p0.v);
      interpolatedFN = p0.fN + factor * (p1.fN - p0.fN);
      interpolatedFKgf = p0.fKgf + factor * (p1.fKgf - p0.fKgf);
    }

    resampled.push({
      horizDispMm: Number(targetH.toFixed(3)),
      vertDispMm: Number(interpolatedV.toFixed(4)),
      shearForce: Number(interpolatedFN.toFixed(2)),
      loadKgf: Number(interpolatedFKgf.toFixed(2)),
    });
  }

  return resampled;
}
