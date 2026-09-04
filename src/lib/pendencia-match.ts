/**
 * Normalização e casamento difuso (fuzzy) entre um ensaio/relatório e a
 * pendência de digitação correspondente (`lab-pendencias`). Extraído da
 * Central de Processamento de Relatórios para ser reaproveitado também
 * pelos editores de relatório, que precisam achar a mesma pendência para
 * manter o status sincronizado ao longo do fluxo de digitação/verificação/
 * aprovação.
 *
 * O casamento é difuso (não por uma chave exata) porque o texto do "ensaio"
 * na pendência normalmente vem da Planilha de Programação (Google Sheets),
 * fora do nosso controle direto.
 */
import type { PendenciaDigitacao } from "./lab-pendencias.functions";

export function normOs(val: string | null | undefined): string {
  if (!val) return "";
  return String(val).trim().replace(/^OS[-\s]*/i, "").toLowerCase();
}

export function normAmostra(val: string | null | undefined): string {
  if (!val) return "";
  return String(val).trim().toLowerCase();
}

export function normMethod(val: string | null | undefined): string {
  if (!val) return "";
  const s = String(val).toLowerCase();
  if (s.includes("asf.dap") || s.includes("asf-dap") || s.includes("asfdap") || s.includes("densidade aparente")) return "asf-dap";
  if (s.includes("perm.v") || s.includes("perm-v") || s.includes("permv") || s.includes("permeabilidade")) return "perm-v";
  if (s.includes("comp.a") || s.includes("comp.r") || s.includes("comp.s") || s.includes("compressao-simples") || s.includes("compressão simples") || s.includes("compressao simples")) return "compressao-simples";
  if (s.includes("cisalhamento") || s.includes("cd")) return "cisalhamento-direto";
  if (s.includes("adensamento") || s.includes("oed") || s.includes("adens")) return "adensamento";
  if (s.includes("triaxial") || s.includes("tri")) return "triaxial-cid";
  if (s.includes("m.esp") || s.includes("mesp") || s.includes("massa")) return "mesp-a";
  return s;
}

export function findMatchingPendencia(
  pendencias: PendenciaDigitacao[],
  target: { os: string | null | undefined; amostra: string | null | undefined; furo?: string | null | undefined; tipo: string | null | undefined },
): PendenciaDigitacao | undefined {
  const osNorm = normOs(target.os);
  const amNorm = normAmostra(target.amostra);
  const furoNorm = normAmostra(target.furo);
  const methNorm = normMethod(target.tipo);

  return (
    pendencias.find(
      (r) =>
        normOs(r.os) === osNorm &&
        (normAmostra(r.amostra) === amNorm || normAmostra(r.amostra) === furoNorm) &&
        (normMethod(r.ensaio) === methNorm || normMethod(r.tipo_ensaio) === methNorm),
    ) ||
    pendencias.find(
      (r) => normOs(r.os) === osNorm && (normAmostra(r.amostra) === amNorm || normAmostra(r.amostra) === furoNorm),
    )
  );
}
