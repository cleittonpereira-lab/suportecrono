/**
 * Formato canônico do identificador de escopo (scopeId) usado em lab_index,
 * report_approvals e lab_draft_history para localizar um ensaio de forma
 * única. Todas as telas devem montar essa string por aqui — nunca montar
 * "na mão" — para não divergir (ex: usar só o id do ensaio, sem os/amostra).
 */
export function buildScopeId(osId: string, amostraId: string, ensaioId: string): string {
  return `os/${osId}/amostra/${amostraId}/ensaio/${ensaioId}`;
}
