/**
 * Pontos de atenção do acompanhamento de CPTu: o que foi cancelado com um
 * motivo que ainda deixa refazer o furo, e o que está como Concluído mas não
 * foi executado ou parou por impenetrável.
 *
 * As observações do extrato da SOND são texto livre. As regras abaixo foram
 * montadas lendo as descrições reais do extrato (33 textos distintos entre os
 * cancelados e os concluídos com sem acesso, impenetrável ou dissipação não
 * feita). Texto que nenhuma regra reconhece vira "Não classificado" e aparece
 * para revisão: não some em silêncio.
 */
import {
  normalizarTexto,
  profundidadePrevista,
  verificacaoVale,
  type CptuRegistro,
} from "./logic";

/** Impenetrável até esta profundidade é "raso": refazer em outro ponto ou com outra técnica. */
export const LIMITE_RASO_M = 1;
/** Concluído com menos que isto não foi executado (o extrato traz 0,01 m nesses casos). */
const LIMITE_NAO_EXECUTADO_M = 0.1;
/** Chegou a esta distância da profundidade prevista (ou além): o furo foi até o fim. */
const TOLERANCIA_PREVISTA_M = 0.2;

export type Possibilidade = "SIM" | "VERIFICAR" | "AVALIAR" | "DEPENDE" | "NAO";

export const POSSIBILIDADE_LABEL: Record<Possibilidade, string> = {
  SIM: "Pode refazer",
  VERIFICAR: "Verificar",
  AVALIAR: "Avaliar técnica",
  DEPENDE: "Depende de liberação",
  NAO: "Não refazer",
};

/** Ordem de exibição: primeiro o que dá para resolver já. */
export const POSSIBILIDADE_ORDEM: Possibilidade[] = ["SIM", "VERIFICAR", "AVALIAR", "DEPENDE", "NAO"];

export type Atencao = {
  /** Agrupamento para o resumo (ex.: "Acesso / logística", "Impenetrável"). */
  grupo: string;
  /** Motivo curto, em linguagem de campo. */
  motivo: string;
  possibilidade: Possibilidade;
  /** O que fazer com esse ponto. */
  acao: string;
  /** OS citada na descrição (ex.: "programação atualizada na OS 14277-23"). */
  osCitada?: string;
};

type Regra = {
  re: RegExp;
  grupo: string;
  motivo: string;
  possibilidade: Possibilidade;
  acao: string;
};

/**
 * Cancelados. A ordem importa: a primeira regra que bate vence. Os textos são
 * comparados já sem acento e em maiúsculas (normalizarTexto).
 */
const REGRAS_CANCELADO: Regra[] = [
  {
    re: /BALSA/,
    grupo: "Acesso / logística",
    motivo: "Deslocamento por balsa",
    possibilidade: "SIM",
    acao: "Organizar o deslocamento por balsa e refazer o ponto.",
  },
  {
    re: /CANCELAD\w* PELO CLIENTE|SOLICITACAO DO CLIENTE|PEDIU O CANCELAMENTO|SOLICITOU CANCELAMENTO|A PEDIDO DO CLIENTE|AUTORIZACAO DO CLIENTE|CANCELAMENTO DESSA/,
    grupo: "Cliente cancelou",
    motivo: "Cancelado a pedido do cliente",
    possibilidade: "NAO",
    acao: "O cliente cancelou. Refazer só se ele pedir de novo.",
  },
  {
    re: /MOTIVOS CONTRATUAIS/,
    grupo: "Comercial",
    motivo: "Motivo contratual",
    possibilidade: "VERIFICAR",
    acao: "Confirmar com o comercial se o contrato ainda pede este ponto.",
  },
  {
    re: /PROGRAMACAO ATUALIZADA/,
    grupo: "Programação",
    motivo: "Programação atualizada",
    possibilidade: "VERIFICAR",
    acao: "Conferir se o ensaio já foi refeito na OS citada antes de reprogramar.",
  },
  {
    re: /APROVACAO DO ORCAMENTO|ORCAMENTO/,
    grupo: "Comercial",
    motivo: "Aguardando aprovação do orçamento",
    possibilidade: "DEPENDE",
    acao: "Refazer se o orçamento for aprovado (a OS nova é aberta nesse caso).",
  },
  {
    re: /PRAZO INFORMADO/,
    grupo: "Comercial",
    motivo: "Prazo não atendia o cliente",
    possibilidade: "DEPENDE",
    acao: "Refazer se o cliente aceitar outro prazo.",
  },
  {
    re: /AGUARDANDO LIBERACAO DO CLIENTE|NAO LIBERADA PELO CLIENTE|RETORNO DO CLIENTE/,
    grupo: "Liberação / autorização",
    motivo: "Aguardando liberação do cliente",
    possibilidade: "DEPENDE",
    acao: "Refazer quando o cliente liberar.",
  },
  {
    re: /LIBERACAO DA CETESB/,
    grupo: "Liberação / autorização",
    motivo: "Aguardando liberação da CETESB",
    possibilidade: "DEPENDE",
    acao: "Refazer quando a CETESB liberar.",
  },
  {
    re: /LINDEIRO|PROPRIEDADE|DESLOCAMENTO NAO AUTORIZADO|NAO AUTORIZAD|SEM AUTORIZACAO/,
    grupo: "Liberação / autorização",
    motivo: "Sem autorização do proprietário ou lindeiro",
    possibilidade: "DEPENDE",
    acao: "Refazer quando a autorização de acesso sair.",
  },
  {
    re: /CRITERIO NAO DEFINIDO/,
    grupo: "Liberação / autorização",
    motivo: "Critério não definido pelo cliente",
    possibilidade: "DEPENDE",
    acao: "Refazer depois que o cliente definir o critério.",
  },
  {
    re: /SOLO DE ALTA CAPACIDADE|NSTP/,
    grupo: "Avaliação técnica",
    motivo: "Solo de alta capacidade (NSTP alto)",
    possibilidade: "AVALIAR",
    acao: "Avaliar com a engenharia se cabe outro equipamento ou técnica.",
  },
  {
    re: /PARADAO/,
    grupo: "Operação",
    motivo: "Paradão de segurança",
    possibilidade: "SIM",
    acao: "Refazer quando o paradão for liberado.",
  },
  {
    re: /EMBARGO|FISCAL|DIFICIL ACESSO/,
    grupo: "Operação",
    motivo: "Embargo ou fiscalização em campo",
    possibilidade: "SIM",
    acao: "Incluir na programação da concessionária e refazer.",
  },
  {
    re: /QUEBROU/,
    grupo: "Equipamento",
    motivo: "Sonda quebrou (esteira) na tentativa",
    possibilidade: "SIM",
    acao: "Consertar a sonda e resolver o acesso antes de refazer.",
  },
  {
    re: /CAMINHO DE SERVICO/,
    grupo: "Acesso / logística",
    motivo: "Necessário caminho de serviço",
    possibilidade: "SIM",
    acao: "Abrir o caminho de serviço e refazer.",
  },
  {
    re: /INTERDICAO DE FAIXA|MUNCK/,
    grupo: "Acesso / logística",
    motivo: "Interdição de faixa e munck",
    possibilidade: "SIM",
    acao: "Pedir a interdição de faixa e o munck, depois refazer.",
  },
  {
    re: /ACESSO|SEM CONDICOES/,
    grupo: "Acesso / logística",
    motivo: "Sem condições de acesso",
    possibilidade: "SIM",
    acao: "Resolver o acesso ao local e refazer.",
  },
];

const OS_NA_DESCRICAO = /\b\d{4,6}-\d{2}\b/;

function fmtM(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** A observação sem as aspas soltas que o extrato às vezes traz no lugar de vazio. */
function textoObs(obs: string): string {
  return (obs ?? "").replace(/["\\']+/g, " ").replace(/\s+/g, " ").trim();
}

function analisarCancelado(obs: string): Atencao {
  const limpo = textoObs(obs);
  const t = normalizarTexto(limpo);
  if (!t) {
    return {
      grupo: "Sem motivo",
      motivo: "Cancelado sem motivo registrado",
      possibilidade: "VERIFICAR",
      acao: "Confirmar o motivo com o campo e registrar na SOND.",
    };
  }
  const osCitada = OS_NA_DESCRICAO.exec(limpo)?.[0];
  const regra = REGRAS_CANCELADO.find((r) => r.re.test(t));
  if (!regra) {
    return {
      grupo: "Não classificado",
      motivo: limpo.slice(0, 120),
      possibilidade: "VERIFICAR",
      acao: "Descrição nova: ler e classificar.",
      osCitada,
    };
  }
  return {
    grupo: regra.grupo,
    motivo: regra.motivo,
    possibilidade: regra.possibilidade,
    acao: regra.acao,
    osCitada,
  };
}

function analisarConcluido(
  status: CptuRegistro["status"],
  obs: string,
  profundidade: number,
  criterio: string,
): Atencao | null {
  const t = normalizarTexto(textoObs(obs));

  if (status === "CONCLUIDO" && profundidade < LIMITE_NAO_EXECUTADO_M) {
    const acesso = /ACESSO|CHEGAR|ACESSAR|LOCAL/.test(t);
    return {
      grupo: "Concluído sem execução",
      motivo: acesso ? "Concluído, mas sem acesso ao ponto" : "Concluído, mas não executado",
      possibilidade: "SIM",
      acao: "Está como Concluído sem ter sido executado: voltar para Pendente e reprogramar.",
    };
  }

  if (/PRE FURO SOMENTE|APENAS PRE FURO|NAO AUTORIZOU|PARALISADO POR SOLICITACAO DO FISCAL/.test(t)) {
    return {
      grupo: "Ensaio incompleto",
      motivo: "Só o pré-furo, ou paralisado pelo fiscal",
      possibilidade: "VERIFICAR",
      acao: "Completar o ensaio ou confirmar com o fiscal.",
    };
  }

  const dissipacaoNaoFeita =
    /DISSIPACAO/.test(t) && /MUITO RESISTENTE|NAO FOI POSSIVEL/.test(t) && !/IMPENETR/.test(t);
  if (dissipacaoNaoFeita) {
    return {
      grupo: "Ensaio incompleto",
      motivo: "Dissipação não feita (camada resistente)",
      possibilidade: "VERIFICAR",
      acao: "Confirmar se a dissipação é necessária. Se for, refazer em outro ponto.",
    };
  }

  if (/IMPENETR|PARALISAD|RESISTENCIA|RESISTENTE|CAPACIDADE DE CRAVACAO|ROCHA|MATACAO/.test(t)) {
    const previsto = profundidadePrevista(criterio);
    // Chegou à profundidade prevista: a parada foi no fim do furo, não é pendência.
    if (previsto != null && profundidade >= previsto - TOLERANCIA_PREVISTA_M) return null;
    const deslocado = /DESLOCAMENTO|DESLCOAMENTO|DESLOCAMENTOS/.test(t);
    if (profundidade < LIMITE_RASO_M) {
      return {
        grupo: "Impenetrável",
        motivo: `Impenetrável a ${fmtM(profundidade)} m`,
        possibilidade: "AVALIAR",
        acao: deslocado
          ? "Deslocamento já feito: confirmar se o ensaio completou no novo ponto."
          : "Refazer em ponto próximo ou com outra técnica (pré-furo). Confirmar a profundidade.",
      };
    }
    return {
      grupo: "Impenetrável",
      motivo: `Paralisado a ${fmtM(profundidade)} m por impenetrável ou resistência`,
      possibilidade: "VERIFICAR",
      acao: deslocado
        ? "Deslocamento já feito: confirmar se o ensaio completou no novo ponto."
        : "Confirmar se a profundidade prevista foi atingida. Se não, refazer com deslocamento.",
    };
  }

  return null;
}

/**
 * Diz se um CPTu precisa de atenção e por quê. Devolve null quando o registro
 * está em ordem (executado sem problema, pendente, ou só com observação
 * informativa, como "coordenadas devem ser confirmadas").
 */
export function analisarAtencao(
  r: Pick<CptuRegistro, "status" | "profundidade" | "obsCampo" | "criterio">,
): Atencao | null {
  if (r.status === "CANCELADO") return analisarCancelado(r.obsCampo);
  if (r.status === "CONCLUIDO" || r.status === "EXECUTADO") {
    return analisarConcluido(r.status, r.obsCampo, r.profundidade, r.criterio);
  }
  return null;
}

export type ItemAtencao = { registro: CptuRegistro; atencao: Atencao; verificada: boolean };

/**
 * Ponto de atenção que ainda não teve a baixa. A baixa some sozinha se a SOND
 * mudar o status ou a descrição (ver snapshotAtencao em logic.ts).
 */
export const aguardaBaixa = (r: Pick<CptuRegistro, "status" | "profundidade" | "obsCampo" | "criterio" | "atencaoVerificadaEm" | "atencaoSnapshot">) =>
  analisarAtencao(r) !== null && !verificacaoVale(r);

/** Só os registros com ponto de atenção, na ordem de ação (o que dá para resolver primeiro). */
export function pontosDeAtencao(registros: CptuRegistro[]): ItemAtencao[] {
  const ordem = (p: Possibilidade) => POSSIBILIDADE_ORDEM.indexOf(p);
  return registros
    .flatMap((registro) => {
      const atencao = analisarAtencao(registro);
      return atencao ? [{ registro, atencao, verificada: verificacaoVale(registro) }] : [];
    })
    .sort(
      (a, b) =>
        ordem(a.atencao.possibilidade) - ordem(b.atencao.possibilidade) ||
        a.atencao.grupo.localeCompare(b.atencao.grupo, "pt-BR") ||
        a.registro.os.localeCompare(b.registro.os, "pt-BR", { numeric: true }) ||
        a.registro.identificacao.localeCompare(b.registro.identificacao, "pt-BR", { numeric: true }),
    );
}

/** Contagem por possibilidade e por grupo, para o cabeçalho da aba. */
export function resumoAtencao(itens: ItemAtencao[]) {
  const porPossibilidade = Object.fromEntries(POSSIBILIDADE_ORDEM.map((p) => [p, 0])) as Record<
    Possibilidade,
    number
  >;
  const porGrupo = new Map<string, number>();
  let verificadas = 0;
  for (const { atencao, verificada } of itens) {
    porPossibilidade[atencao.possibilidade]++;
    porGrupo.set(atencao.grupo, (porGrupo.get(atencao.grupo) ?? 0) + 1);
    if (verificada) verificadas++;
  }
  return {
    total: itens.length,
    verificadas,
    aguardandoBaixa: itens.length - verificadas,
    porPossibilidade,
    porGrupo,
  };
}
