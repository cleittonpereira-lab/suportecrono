/**
 * Qual laudo abre para cada sigla de ensaio.
 *
 * Antes, isso era decidido só por pedaços de texto cravados no código
 * (`detectMethodology`): a sigla precisava conter "tri.cid", "tricid" ou
 * "triaxial"+"cid". Uma sigla de casa como "TRI4.CU" não casava com nada e a
 * Central dizia "não há laudo no app" — mesmo o laboratório tendo declarado,
 * em Programação → Tipos de Ensaio, qual relatório aquele tipo usa.
 *
 * Aqui a ordem se inverte: **a tabela do laboratório manda**. O reconhecimento
 * por sigla é só a reserva, para tipos ainda não configurados.
 *
 * O outro defeito coberto aqui: CID, CIU e UU são relatórios diferentes
 * (o editor triaxial muda norma, título e cálculo conforme a variante), mas a
 * detecção antiga só sabia devolver "triaxial-cid". Agora devolve a variante.
 */
import type { EnsaioTipo } from "@/features/lab/types";

/** Chave de comparação: sem acento, sem espaço e sem pontuação. */
export function normalizarSigla(bruta: string | null | undefined): string {
  return (bruta ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Sigla (ou nome do tipo) → relatório, como o laboratório declarou. */
export type MapaDeCompatibilidade = Record<string, EnsaioTipo>;

/**
 * Monta o mapa a partir das linhas de "Tipos de Ensaio". Cada tipo entra pelo
 * código E pelo nome, porque a programação às vezes traz um, às vezes o outro.
 */
export function montarMapa(
  linhas: { nome?: string | null; codigo?: string | null; tipo_relatorio?: string | null }[],
): MapaDeCompatibilidade {
  const mapa: MapaDeCompatibilidade = {};
  for (const l of linhas) {
    const destino = (l.tipo_relatorio ?? "").trim();
    if (!destino) continue;
    for (const chave of [l.codigo, l.nome]) {
      const k = normalizarSigla(chave);
      if (k) mapa[k] = destino as EnsaioTipo;
    }
  }
  return mapa;
}

/**
 * Variante do triaxial pela sigla. A ordem importa: "CIU" e "CU" antes de
 * "UU" e de "CID", senão "TRI.CIU" cairia na regra errada.
 */
function varianteTriaxial(t: string): EnsaioTipo {
  if (t.includes("ciu") || t.includes("cu")) return "triaxial-ciu";
  if (t.includes("uu")) return "triaxial-uu";
  if (t.includes("nat")) return "triaxial-cid-nat";
  if (t.includes("sat")) return "triaxial-cid-sat";
  return "triaxial-cid";
}

/**
 * Reconhecimento por sigla — reserva de quando o tipo não está configurado.
 * Devolve null quando não reconhece: dizer "não sei" é melhor que abrir o
 * laudo errado, que foi o que já aconteceu antes (Triaxial no lugar do
 * Cisalhamento e vice-versa).
 */
export function laudoPelaSigla(bruta: string | null | undefined): EnsaioTipo | null {
  const t = normalizarSigla(bruta);
  if (!t) return null;

  // Triaxial antes de tudo: "tri" é inconfundível e carrega a variante.
  if (t.startsWith("tri") || t.includes("triaxial")) return varianteTriaxial(t);

  // Cisalhamento direto: "CD"/"CIS" — nunca confundir com o "cid" do triaxial.
  if (t.startsWith("cd") || t.startsWith("cis") || t.includes("cisalhamento")) return "cisalhamento-direto";

  if (t.startsWith("adens") || t.includes("adensamento") || t.includes("oedom") || t.includes("edom")) return "adensamento";
  if (t.includes("mespa") || t.includes("massaespecifica")) return "mesp-a";
  if (t.includes("asftb") || t.includes("betume")) return "asf-tb";
  if (t.includes("asfdap") || t.includes("densidadeaparente")) return "asf-dap";
  if (t.startsWith("permv") || t.includes("permeabilidade")) return "perm-v";
  if (t.startsWith("comp") || t.includes("compressao")) return "compressao-simples";
  if (t.includes("resiliencia") || t.startsWith("mr")) return "modulo-resiliencia";
  if (t.includes("umid")) return "umidade-natural";
  if (t.includes("loadtest") || t.includes("pointload")) return "load-test";
  return null;
}

/**
 * Decide o laudo de um ensaio. A tabela do laboratório vem primeiro; a sigla é
 * a reserva. `null` significa "não sei" — a tela avisa em vez de adivinhar.
 */
export function laudoDoEnsaio(
  sigla: string | null | undefined,
  tipoEnsaio: string | null | undefined,
  mapa: MapaDeCompatibilidade = {},
): EnsaioTipo | null {
  for (const candidata of [sigla, tipoEnsaio]) {
    const k = normalizarSigla(candidata);
    if (k && mapa[k]) return mapa[k];
  }
  return laudoPelaSigla(sigla) ?? laudoPelaSigla(tipoEnsaio);
}

/**
 * Siglas em uso que ninguém configurou e a sigla não explica — é o que a tela
 * de compatibilidade precisa mostrar para o laboratório resolver.
 */
export function siglasSemLaudo(
  emUso: { sigla?: string | null; tipoEnsaio?: string | null }[],
  mapa: MapaDeCompatibilidade = {},
): string[] {
  const faltando = new Set<string>();
  for (const u of emUso) {
    if (laudoDoEnsaio(u.sigla, u.tipoEnsaio, mapa)) continue;
    const rotulo = (u.sigla || u.tipoEnsaio || "").trim();
    if (rotulo) faltando.add(rotulo);
  }
  return [...faltando].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
