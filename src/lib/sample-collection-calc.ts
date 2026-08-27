/**
 * Cálculo do "pulmão" (retrato atual + previsão) a partir de uma carga de
 * amostras (SOND/MAPS) cruzada com o status das OS já conhecidas pelo app.
 *
 * Limitação importante, documentada de propósito: o extrato do SOND não diz
 * se uma amostra específica já foi ensaiada, e o tipo de amostra (BL/SH/DN)
 * não corresponde 1:1 a um tipo de ensaio do app (uma amostra pode virar
 * vários corpos de prova, de vários ensaios diferentes). Por isso o cálculo
 * aqui é por OS, não por amostra individual: uma amostra coletada "conta"
 * como pulmão em aberto enquanto a OS dela ainda tiver algum ensaio não
 * concluído no app — é uma aproximação, não um cruzamento exato.
 */
import type { AmostraColetada, AmostraAColetar, CategoriaAmostra } from "@/lib/sample-collection.functions";
import type { OsGroup } from "@/features/lab/hooks/use-os-groups";
import { normOs } from "@/lib/schedule-utils";

export interface RetratoCategoria {
  categoria: CategoriaAmostra;
  totalColetado: number;
  totalAColetarPendente: number;
  totalAColetarPrioridade: number;
  pulmaoEmAberto: number;
}

export interface SemanaProjetada {
  semana: string;
  pulmaoProjetado: number;
}

const CATEGORIAS: CategoriaAmostra[] = ["bloco", "shelby", "denison", "outro"];

function osConcluida(osNumero: string, osGroups: OsGroup[]): boolean {
  const g = osGroups.find((x) => normOs(x.osNumero) === normOs(osNumero));
  if (!g || g.ensaios.length === 0) return false;
  return g.ensaios.every((e) => e.status === "aprovado" || e.status === "concluido_externo");
}

export function calcularRetratoAtual(
  coletadas: AmostraColetada[],
  aColetar: AmostraAColetar[],
  osGroups: OsGroup[],
): RetratoCategoria[] {
  return CATEGORIAS.map((categoria) => {
    const coletadasCat = coletadas.filter((c) => c.categoria === categoria);
    const aColetarCat = aColetar.filter((c) => c.categoria === categoria);
    const pulmaoEmAberto = coletadasCat.filter((c) => !osConcluida(c.os, osGroups)).length;

    return {
      categoria,
      totalColetado: coletadasCat.length,
      totalAColetarPendente: aColetarCat.filter((c) => c.status.toUpperCase() === "PENDENTE").length,
      totalAColetarPrioridade: aColetarCat.filter((c) => c.status.toUpperCase() === "PRIORIDADE").length,
      pulmaoEmAberto,
    };
  });
}

/** Quantas OS (dentre as que aparecem na carga) foram concluídas nas últimas `semanas` semanas — usada como taxa real de vazão, em vez de um número assumido. */
export function calcularTaxaConclusaoOsPorSemana(
  coletadas: AmostraColetada[],
  osGroups: OsGroup[],
  semanas = 4,
): number {
  const osUnicas = Array.from(new Set(coletadas.map((c) => normOs(c.os))));
  const concluidas = osUnicas.filter((os) => osConcluida(os, osGroups));
  return concluidas.length / semanas;
}

export function projetarPulmaoOs(
  coletadas: AmostraColetada[],
  aColetar: AmostraAColetar[],
  osGroups: OsGroup[],
  semanasProjecao = 8,
): SemanaProjetada[] {
  const osUnicas = Array.from(new Set(coletadas.map((c) => normOs(c.os))));
  let pulmaoOs = osUnicas.filter((os) => !osConcluida(os, osGroups)).length;
  const taxaConclusao = calcularTaxaConclusaoOsPorSemana(coletadas, osGroups);

  // Chegadas futuras esperadas, pela data prevista de fim de campo de cada OS a coletar
  const chegadasPorSemana = new Map<number, number>();
  const hoje = new Date();
  for (const item of aColetar) {
    const d = parseDataBr(item.dataFimOs);
    if (!d) continue;
    const semanasAteChegada = Math.floor((d.getTime() - hoje.getTime()) / (7 * 86_400_000));
    if (semanasAteChegada >= 0 && semanasAteChegada < semanasProjecao) {
      chegadasPorSemana.set(semanasAteChegada, (chegadasPorSemana.get(semanasAteChegada) ?? 0) + 1);
    }
  }

  const out: SemanaProjetada[] = [];
  for (let i = 0; i < semanasProjecao; i++) {
    pulmaoOs = Math.max(0, pulmaoOs + (chegadasPorSemana.get(i) ?? 0) - taxaConclusao);
    const dataSemana = new Date(hoje.getTime() + i * 7 * 86_400_000);
    out.push({ semana: dataSemana.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }), pulmaoProjetado: Math.round(pulmaoOs * 10) / 10 });
  }
  return out;
}

function parseDataBr(s: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

export const CATEGORIA_LABEL: Record<CategoriaAmostra, string> = {
  bloco: "Blocos Indeformados (BL)",
  shelby: "Amostrador Shelby (SH)",
  denison: "Denison (DN)",
  outro: "Outras Amostras",
};
