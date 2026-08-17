/**
 * Utilitários para cálculo e gestão de SLA da Central de Relatórios.
 *
 * Etapas monitoradas:
 * 1. Fila de Espera: Fim da Execução (Gantt) -> Início da Digitação (meta: <= 24h)
 * 2. Digitação: Início da Digitação -> Envio para Verificação (meta: <= 48h)
 * 3. Verificação: Envio -> Conclusão da Verificação (meta: <= 24h)
 * 4. Aprovação: Verificação -> Aprovação do RT (meta: <= 24h)
 * 5. Lead Time Total (Execução -> Aprovação Final).
 */

export interface SlaTimes {
  execucaoConcluidaAt?: string | null;
  digitacaoIniciadaAt?: string | null;
  digitacaoConcluidaAt?: string | null;
  verificadoAt?: string | null;
  aprovadoAt?: string | null;
}

export type SlaStatus = "no_prazo" | "alerta" | "atrasado";

export interface SlaStageMetric {
  label: string;
  hoursElapsed: number;
  targetHours: number;
  status: SlaStatus;
  formattedDuration: string;
}

export const SLA_TARGETS = {
  espera_digitacao_h: 24, // Máximo 24h para iniciar digitação após fim da bancada
  tempo_digitacao_h: 48,  // Máximo 48h para concluir cálculo e digitação
  verificacao_h: 24,      // Máximo 24h para verificação técnica
  aprovacao_h: 24,        // Máximo 24h para aprovação do RT
  lead_time_total_h: 120, // Máximo 5 dias úteis (120h) total
};

/**
 * Calcula a diferença em horas entre duas datas ISO. Se `endIso` for nulo, usa `now`.
 */
export function calcHoursDiff(startIso?: string | null, endIso?: string | null): number {
  if (!startIso) return 0;
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  if (isNaN(start) || isNaN(end) || end < start) return 0;
  return (end - start) / (1000 * 60 * 60);
}

/**
 * Formata quantidade de horas em texto legível (ex: "4h 30m", "2d 5h", "45m").
 */
export function formatHours(hours: number): string {
  if (hours <= 0 || !isFinite(hours)) return "—";
  if (hours < 1) {
    const min = Math.round(hours * 60);
    return `${min} min`;
  }
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const days = Math.floor(hours / 24);
  const remH = Math.round(hours % 24);
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}

/**
 * Avalia o status do SLA com base no tempo decorrido e na meta em horas.
 * - `no_prazo`: <= 75% da meta
 * - `alerta`: > 75% e <= 100% da meta
 * - `atrasado`: > 100% da meta
 */
export function getSlaStatus(elapsedHours: number, targetHours: number): SlaStatus {
  if (elapsedHours <= 0) return "no_prazo";
  if (elapsedHours <= targetHours * 0.75) return "no_prazo";
  if (elapsedHours <= targetHours) return "alerta";
  return "atrasado";
}

export interface SlaSummary {
  esperaDigitacao: SlaStageMetric;
  digitacao: SlaStageMetric;
  verificacao: SlaStageMetric;
  aprovacao: SlaStageMetric;
  totalLeadTime: SlaStageMetric;
  overallStatus: SlaStatus;
}

export function evaluateSla(times: SlaTimes): SlaSummary {
  // 1. Espera para digitar
  const esperaH = times.execucaoConcluidaAt
    ? calcHoursDiff(times.execucaoConcluidaAt, times.digitacaoIniciadaAt)
    : 0;
  const esperaStatus = getSlaStatus(esperaH, SLA_TARGETS.espera_digitacao_h);

  // 2. Digitação
  const digitacaoH = times.digitacaoIniciadaAt
    ? calcHoursDiff(times.digitacaoIniciadaAt, times.digitacaoConcluidaAt)
    : 0;
  const digitacaoStatus = getSlaStatus(digitacaoH, SLA_TARGETS.tempo_digitacao_h);

  // 3. Verificação
  const verificacaoH = times.digitacaoConcluidaAt
    ? calcHoursDiff(times.digitacaoConcluidaAt, times.verificadoAt)
    : 0;
  const verificacaoStatus = getSlaStatus(verificacaoH, SLA_TARGETS.verificacao_h);

  // 4. Aprovação
  const aprovacaoH = times.verificadoAt
    ? calcHoursDiff(times.verificadoAt, times.aprovadoAt)
    : 0;
  const aprovacaoStatus = getSlaStatus(aprovacaoH, SLA_TARGETS.aprovacao_h);

  // 5. Total
  const totalH = times.execucaoConcluidaAt
    ? calcHoursDiff(times.execucaoConcluidaAt, times.aprovadoAt)
    : times.digitacaoIniciadaAt
      ? calcHoursDiff(times.digitacaoIniciadaAt, times.aprovadoAt)
      : 0;
  const totalStatus = getSlaStatus(totalH, SLA_TARGETS.lead_time_total_h);

  const statuses = [esperaStatus, digitacaoStatus, verificacaoStatus, aprovacaoStatus, totalStatus];
  const overallStatus: SlaStatus = statuses.includes("atrasado")
    ? "atrasado"
    : statuses.includes("alerta")
      ? "alerta"
      : "no_prazo";

  return {
    esperaDigitacao: {
      label: "Espera Digitação",
      hoursElapsed: esperaH,
      targetHours: SLA_TARGETS.espera_digitacao_h,
      status: esperaStatus,
      formattedDuration: formatHours(esperaH),
    },
    digitacao: {
      label: "Tempo de Digitação",
      hoursElapsed: digitacaoH,
      targetHours: SLA_TARGETS.tempo_digitacao_h,
      status: digitacaoStatus,
      formattedDuration: formatHours(digitacaoH),
    },
    verificacao: {
      label: "Verificação Técnica",
      hoursElapsed: verificacaoH,
      targetHours: SLA_TARGETS.verificacao_h,
      status: verificacaoStatus,
      formattedDuration: formatHours(verificacaoH),
    },
    aprovacao: {
      label: "Aprovação RT",
      hoursElapsed: aprovacaoH,
      targetHours: SLA_TARGETS.aprovacao_h,
      status: aprovacaoStatus,
      formattedDuration: formatHours(aprovacaoH),
    },
    totalLeadTime: {
      label: "Lead Time Total",
      hoursElapsed: totalH,
      targetHours: SLA_TARGETS.lead_time_total_h,
      status: totalStatus,
      formattedDuration: formatHours(totalH),
    },
    overallStatus,
  };
}
