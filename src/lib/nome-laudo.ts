/**
 * Nome oficial do arquivo do laudo — o mesmo em todas as telas e no Drive:
 *
 *   OS_Amostra_Furo_Prof_Sigla_Rev-NN.pdf
 *   ex.: 17700-26_13314-089_SH-07_6.00-6.70_PERM.V_Rev-00.pdf
 *
 * Quem dá o nome é o servidor, ao gravar a revisão no Drive (driveSync), a
 * partir dos registros da OS, da amostra e do ensaio. Cada tela tinha o seu
 * padrão ("PERM-V_17700-26_Rev-00.pdf", "ADENSAMENTO_…_Rev00.pdf"…). Parte
 * vazia (sem furo, sem profundidade) é omitida, sem deixar "__".
 */

/** Sigla por tipo de ensaio, quando o registro não traz a sigla do Gantt. */
const SIGLA_POR_TIPO: Record<string, string> = {
  "perm-v": "PERM.V",
  "asf-dap": "ASF.DAP",
  "asf-tb": "ASF.TB",
  "mesp-a": "M.ESP.A",
  "umidade-natural": "UMID.NAT",
  "compressao-simples": "COMP.S",
  "modulo-resiliencia": "MR",
  adensamento: "ADENS",
  "cisalhamento-direto": "CD",
  "triaxial-cid": "TRI.CID",
  "triaxial-cid-sat": "TRI.CID",
  "triaxial-cid-nat": "TRI.CID",
  "triaxial-uu": "TRI.UU",
  "triaxial-ciu": "TRI.CIU",
};

/** Uma parte do nome: sem caracteres proibidos em nomes de arquivo, sem espaços e sem "_" (o separador). */
export function limparParte(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFC")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/[\\/:*?"<>|_]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/** Profundidade: "6.00 – 6.70 m" → "6.00-6.70". */
export function limparProfundidade(valor: unknown): string {
  return limparParte(String(valor ?? "").replace(/\s*m\.?\s*$/i, ""));
}

/** Sigla com ponto em maiúsculas dentro de um texto: "Permeabilidade … (PERM.V)" → "PERM.V". */
const SIGLA_NO_TEXTO = /\b([A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)+)\b/;

export function siglaDoEnsaio(en: {
  sigla?: string | null;
  label?: string | null;
  nome?: string | null;
  tipo?: string | null;
}): string {
  const sigla = (en.sigla ?? "").trim();
  // A sigla do Gantt (ex.: CD4.IN, TRI3.UU, ADENS.I.9) vale como está.
  if (sigla && !/\s/.test(sigla) && sigla.length <= 16) return limparParte(sigla).toUpperCase();
  for (const texto of [sigla, en.label, en.nome]) {
    const m = SIGLA_NO_TEXTO.exec(texto ?? "");
    if (m) return m[1];
  }
  const tipo = (en.tipo ?? "").trim();
  return SIGLA_POR_TIPO[tipo] ?? (limparParte(tipo).toUpperCase() || "ENSAIO");
}

export function nomeDoArquivoDoLaudo(p: {
  os?: string | null;
  amostra?: string | null;
  furo?: string | null;
  prof?: string | null;
  sigla: string;
  rev: number;
  ext: "pdf" | "xlsx";
}): string {
  const partes = [
    limparParte(p.os),
    limparParte(p.amostra),
    limparParte(p.furo),
    limparProfundidade(p.prof),
    limparParte(p.sigla),
  ].filter(Boolean);
  return `${partes.join("_")}_Rev-${String(p.rev).padStart(2, "0")}.${p.ext}`;
}
