/**
 * Motor de reagendamento em cascata da Programação de Ensaios.
 *
 * Cobre os dois comportamentos pedidos com a mesma função: quando um ensaio
 * termina (ou é iniciado) antes do previsto, os sucessores avançam
 * ("puxa o início do outro"); quando termina depois do previsto, os
 * sucessores atrasam junto — é sempre a mesma pergunta ("dado que esta
 * âncora agora termina em X, quando o próximo pode começar?").
 *
 * "Sucessor direto" de um ensaio é: a cadeia real de `predecessor_id`
 * quando ela existir; se a linha não tiver predecessor definido, a próxima
 * linha ainda "planejado" no mesmo equipamento, por ordem de data prevista
 * (mesmo comportamento que já existia, preservado como fallback).
 *
 * Usado por `_app.programacao.gantt.tsx` (ao iniciar/terminar pelo painel
 * desktop) e `_app.programacao.scan.tsx` (ao iniciar/terminar pela leitura
 * de QR na bancada) — os dois caminhos devem se comportar de forma idêntica.
 *
 * Para atraso e para mudança de data/equipamento, use `cascataDoEquipamento`:
 * um equipamento faz um ensaio por vez, então os ensaios seguintes dele são
 * empurrados até não se sobreporem. Nunca puxa ninguém para antes.
 */
import { addBusinessOffsetIso, endIsoFromDur } from "@/lib/business-days";
import type { Programacao } from "@/lib/programacao-model";

function getDirectSuccessors(
  progId: string,
  allProgs: Programacao[],
  incluirMesmoEquipamento: boolean,
): Programacao[] {
  const chained = allProgs.filter((p) => p.predecessor_id === progId && p.status === "planejado");
  if (chained.length > 0) return chained;
  if (!incluirMesmoEquipamento) return [];

  const anchor = allProgs.find((p) => p.id === progId);
  if (!anchor?.equipamento_id) return [];
  const sameEquip = allProgs
    .filter(
      (p) =>
        p.id !== progId &&
        p.status === "planejado" &&
        p.equipamento_id === anchor.equipamento_id &&
        (p.data_inicio_prevista || "") > (anchor.data_inicio_prevista || ""),
    )
    .sort((a, b) => (a.data_inicio_prevista || "").localeCompare(b.data_inicio_prevista || ""));
  return sameEquip.length > 0 ? [sameEquip[0]] : [];
}

export type RecalculateDownstreamPatch = {
  data_inicio_prevista: string;
  data_inicio: string;
  data_fim: string;
};

/**
 * Caminha a cadeia de sucessores a partir de `anchorProgId`, recalculando o
 * início mais cedo possível de cada um a partir de `anchorFinishIso`. Só
 * grava (via `updateFn`) quando a data realmente muda, e só mexe em linhas
 * ainda "planejado" — execuções já iniciadas/concluídas são fato histórico,
 * não são reescritas.
 *
 * `apenasCadeia`: só segue a cadeia de `predecessor_id`, sem o fallback do
 * mesmo equipamento (que quem cuida é `cascataDoEquipamento`).
 */
export async function recalculateDownstream(
  anchorProgId: string,
  anchorFinishIso: string,
  allProgs: Programacao[],
  updateFn: (id: string, patch: RecalculateDownstreamPatch) => Promise<void>,
  opts: { apenasCadeia?: boolean } = {},
): Promise<{ shifted: number }> {
  let shifted = 0;
  const visited = new Set<string>([anchorProgId]);
  const queue: Array<{ progId: string; finishIso: string }> = [
    { progId: anchorProgId, finishIso: anchorFinishIso },
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const successors = getDirectSuccessors(cur.progId, allProgs, !opts.apenasCadeia);

    for (const succ of successors) {
      if (visited.has(succ.id)) continue; // guarda contra ciclos de predecessor_id
      visited.add(succ.id);

      const novoInicio = addBusinessOffsetIso(cur.finishIso, 1, succ.incluir_fds);
      const novoFim = endIsoFromDur(novoInicio, succ.duracao_dias || 1, succ.incluir_fds);

      if (novoInicio !== succ.data_inicio_prevista) {
        await updateFn(succ.id, {
          data_inicio_prevista: novoInicio,
          data_inicio: novoInicio,
          data_fim: novoFim,
        });
        shifted += 1;
        // Atualiza em memória pra próximos elos da cadeia usarem o valor novo
        // no mesmo passe, sem precisar reler o servidor.
        succ.data_inicio_prevista = novoInicio;
        succ.data_inicio = novoInicio;
        succ.data_fim = novoFim;
      }

      queue.push({ progId: succ.id, finishIso: novoFim });
    }
  }

  return { shifted };
}

/* ---------------------------------------------------------------------------
 * Cascata por equipamento
 *
 * Um equipamento faz um ensaio por vez. Quando um ensaio atrasa ou tem a data
 * ou o equipamento alterados, os ensaios planejados do mesmo equipamento que
 * vêm depois dele são empurrados, em ordem de data, até não se sobreporem.
 * Cada um começa no dia útil seguinte ao fim do anterior; ensaios fracionados
 * (menos de 1 dia) podem dividir o dia, desde que a soma não passe de 1 dia.
 *
 * Não puxa ninguém para antes, não mexe em ensaios de outro equipamento, não
 * mexe nos anteriores ao alvo e não reescreve ensaios já iniciados/concluídos
 * (eles ocupam o equipamento, mas são fato consumado).
 * ------------------------------------------------------------------------- */

/** Campos do ensaio que a cascata precisa para ocupar o equipamento. */
export type AlvoCascata = Pick<
  Programacao,
  | "id"
  | "equipamento_id"
  | "status"
  | "duracao_dias"
  | "incluir_fds"
  | "data_inicio_prevista"
  | "data_inicio"
  | "data_fim"
> & {
  /**
   * Início previsto ANTES da mudança, quando o ensaio continua no mesmo
   * equipamento. Com ele, se o início foi adiado, os que vinham depois do
   * alvo na sequência original também são empurrados. Null = ensaio novo,
   * trocou de equipamento ou foi adiantado: vale só a sobreposição.
   */
  inicio_anterior?: string | null;
};

export type ReprogramacaoCascata = { id: string; patch: RecalculateDownstreamPatch };

/**
 * Estado do ensaio depois de uma mudança. `row` traz só os campos alterados;
 * o que não vier continua como estava. `base` null = ensaio novo (id "").
 */
export function alvoAposMudanca(base: AlvoCascata | null, row: Partial<AlvoCascata>): AlvoCascata {
  const equipamento_id =
    row.equipamento_id !== undefined ? row.equipamento_id || null : (base?.equipamento_id ?? null);
  const inicioBase = base ? base.data_inicio_prevista || base.data_inicio || null : null;
  return {
    id: base?.id ?? "",
    equipamento_id,
    status: row.status ?? base?.status ?? "planejado",
    duracao_dias: row.duracao_dias ?? base?.duracao_dias ?? 1,
    incluir_fds: row.incluir_fds ?? base?.incluir_fds ?? false,
    data_inicio_prevista:
      row.data_inicio_prevista !== undefined ? row.data_inicio_prevista : (base?.data_inicio_prevista ?? null),
    data_inicio: row.data_inicio !== undefined ? row.data_inicio : (base?.data_inicio ?? null),
    data_fim: row.data_fim !== undefined ? row.data_fim : (base?.data_fim ?? null),
    inicio_anterior: inicioBase && base?.equipamento_id === equipamento_id ? inicioBase : null,
  };
}

/** Intervalo de dias (datas inclusive) que um ensaio ocupa no equipamento. */
type Ocupacao = { ini: string; fim: string; dur: number; incl: boolean };

const EPS = 1e-6;
/** Quantas tentativas de dia útil seguinte antes de desistir de achar janela. */
const MAX_TENTATIVAS = 732;

function ocupacao(ini: string, dur: number, incl: boolean, fim?: string | null): Ocupacao {
  return { ini, fim: fim || endIsoFromDur(ini, dur, incl), dur, incl };
}

/** Quanto do equipamento a ocupação usa no dia. Fracionado (< 1 dia) usa só o dia de início. */
function cargaNoDia(o: Ocupacao, dia: string): number {
  if (o.dur < 1) return o.ini === dia ? o.dur : 0;
  return dia >= o.ini && dia <= o.fim ? 1 : 0;
}

/** Cabe o ensaio em [ini, fim] sem passar de 1 dia de equipamento por dia? */
function cabe(ini: string, fim: string, dur: number, ocupados: Ocupacao[]): boolean {
  if (dur < 1) {
    const carga = ocupados.reduce((soma, o) => soma + cargaNoDia(o, ini), 0);
    return carga + dur <= 1 + EPS;
  }
  for (let dia = ini; dia <= fim; dia = addBusinessOffsetIso(dia, 1, true)) {
    if (ocupados.some((o) => cargaNoDia(o, dia) > EPS)) return false;
  }
  return true;
}

/**
 * Empurra, no equipamento de `alvo`, os ensaios planejados que vêm depois dele
 * e ficaram sobrepostos. `alvo` já deve estar com a data nova (ver
 * `alvoAposMudanca`); `fimAlvo` sobrescreve o fim do alvo (ex.: terminou em
 * hoje). Devolve só as linhas que mudam de data.
 */
export function cascataDoEquipamento(
  outros: Programacao[],
  alvo: AlvoCascata,
  fimAlvo?: string | null,
): ReprogramacaoCascata[] {
  if (!alvo.equipamento_id) return [];
  const durAlvo = alvo.duracao_dias || 1;
  const iniAlvo =
    alvo.status === "planejado"
      ? alvo.data_inicio_prevista || alvo.data_inicio
      : alvo.data_inicio || alvo.data_inicio_prevista;
  if (!iniAlvo) return [];
  const fimCalc = endIsoFromDur(iniAlvo, durAlvo, alvo.incluir_fds);
  const fimA = fimAlvo || (alvo.status !== "planejado" && alvo.data_fim) || fimCalc;

  const ocupados: Ocupacao[] = [ocupacao(iniAlvo, durAlvo, alvo.incluir_fds, fimA)];
  // Início adiado no mesmo equipamento: seguintes = os que vinham depois do alvo
  // na sequência original (inclusive os que ele ultrapassou). Caso contrário,
  // seguintes = os que terminam depois do novo início (sobreposição).
  const seguidosA = alvo.inicio_anterior && iniAlvo > alvo.inicio_anterior ? alvo.inicio_anterior : null;
  const seq: Programacao[] = [];
  for (const p of outros) {
    if (p.id === alvo.id || p.equipamento_id !== alvo.equipamento_id) continue;
    if (p.status === "planejado") {
      if (!p.data_inicio_prevista) continue;
      const oc = ocupacao(p.data_inicio_prevista, p.duracao_dias || 1, p.incluir_fds);
      const seguinte = seguidosA ? p.data_inicio_prevista >= seguidosA : oc.fim >= iniAlvo;
      if (seguinte) seq.push(p);
      else ocupados.push(oc);
    } else {
      const ini = p.data_inicio || p.data_inicio_prevista;
      if (ini) ocupados.push(ocupacao(ini, p.duracao_dias || 1, p.incluir_fds, p.data_fim));
    }
  }

  seq.sort(
    (a, b) =>
      (a.data_inicio_prevista ?? "").localeCompare(b.data_inicio_prevista ?? "") || a.id.localeCompare(b.id),
  );

  const mudancas: ReprogramacaoCascata[] = [];
  let cursor = fimA;
  for (const p of seq) {
    const original = p.data_inicio_prevista as string;
    const dur = p.duracao_dias || 1;
    const incl = p.incluir_fds;
    let ini = original > cursor ? original : cursor;
    let fim = endIsoFromDur(ini, dur, incl);
    let tentativas = 0;
    while (!cabe(ini, fim, dur, ocupados) && tentativas < MAX_TENTATIVAS) {
      tentativas += 1;
      ini = addBusinessOffsetIso(ini, 1, incl);
      fim = endIsoFromDur(ini, dur, incl);
    }
    if (!cabe(ini, fim, dur, ocupados)) continue; // sem janela: deixa como está

    ocupados.push(ocupacao(ini, dur, incl, fim));
    if (fim > cursor) cursor = fim;
    if (ini !== original) {
      mudancas.push({ id: p.id, patch: { data_inicio_prevista: ini, data_inicio: ini, data_fim: fim } });
    }
  }
  return mudancas;
}
