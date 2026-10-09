/**
 * Pacote (.zip) com os PDFs dos laudos escolhidos — sempre o PDF ORIGINAL do
 * Drive (o arquivo assinado/carimbado, não um PDF refeito na hora) e sempre a
 * última revisão aprovada de cada laudo.
 *
 * Regras:
 * - Cada laudo baixa exatamente a revisão aprovada vigente (`rev` da linha).
 *   Se ela não estiver no Drive, o laudo fica de fora e é avisado — nunca entra
 *   outra revisão no lugar.
 * - Dois laudos do mesmo ensaio na mesma amostra (OS + amostra + ensaio): só
 *   entra o de revisão maior; o outro é listado como substituído.
 * - Um PDF por chamada ao servidor (o plano gratuito do Cloudflare limita as
 *   chamadas externas por requisição), três de cada vez.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import JSZip from "jszip";
import { toast } from "sonner";
import { getRevisionPdfBase64 } from "@/lib/driveSync.functions";
import type { EmissaoRow } from "@/lib/emissoes.functions";
import { ultimaRevisaoDeCada } from "@/lib/pacote-laudos";

export type LaudoDoPacote = Pick<
  EmissaoRow,
  "scope_id" | "rev" | "os_numero" | "os_cliente" | "amostra_code" | "ensaio_tipo" | "ensaio_nome" | "decided_at"
>;

const rotuloRev = (rev: number | null) => `Rev-${String(rev ?? 0).padStart(2, "0")}`;

function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function limpar(v: string): string {
  return v.replace(/[\\/:*?"<>|]+/g, "-").trim();
}

export function usePacoteDeLaudos() {
  const pdfFn = useServerFn(getRevisionPdfBase64);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);

  async function baixar(laudos: LaudoDoPacote[]) {
    if (laudos.length === 0 || progresso) return;
    const { manter, substituidos } = ultimaRevisaoDeCada(laudos);
    const variasOs = new Set(manter.map((l) => l.os_numero)).size > 1;
    const zip = new JSZip();
    const usados = new Set<string>();
    const falhas: { laudo: LaudoDoPacote; erro: string }[] = [];
    const ok: { laudo: LaudoDoPacote; arquivo: string }[] = [];
    let feitos = 0;
    setProgresso({ feitos: 0, total: manter.length });

    const fila = [...manter];
    async function trabalhador() {
      for (let l = fila.shift(); l; l = fila.shift()) {
        try {
          const r = await pdfFn({ data: { scopeId: l.scope_id, rev: l.rev ?? 0 } });
          const pasta = variasOs ? `OS ${limpar(l.os_numero ?? "sem-OS")}/` : "";
          const base = limpar(r.nome || `${l.os_numero}_${l.amostra_code}_${rotuloRev(l.rev)}.pdf`).replace(/\.pdf$/i, "");
          let nome = `${base}.pdf`;
          // Nome repetido no pacote não pode apagar o outro arquivo.
          for (let i = 2; usados.has(pasta + nome); i++) nome = `${base} (${i}).pdf`;
          usados.add(pasta + nome);
          zip.file(pasta + nome, base64ParaBytes(r.base64), { binary: true });
          ok.push({ laudo: l, arquivo: pasta + nome });
        } catch (e) {
          falhas.push({ laudo: l, erro: e instanceof Error ? e.message : String(e) });
        }
        setProgresso({ feitos: ++feitos, total: manter.length });
      }
    }

    try {
      await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
      if (ok.length === 0) {
        toast.error(`Nenhum PDF baixado. ${falhas[0]?.erro ?? ""}`);
        return;
      }

      const linha = (l: LaudoDoPacote) => `OS ${l.os_numero} · ${l.amostra_code ?? "—"} · ${l.ensaio_nome || l.ensaio_tipo || "Ensaio"} · ${rotuloRev(l.rev)}`;
      const leiame = [
        "PACOTE DE LAUDOS — PDFs originais do Drive, última revisão aprovada",
        `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        "",
        `No pacote (${ok.length}):`,
        ...ok.map((o) => `  ${linha(o.laudo)}  →  ${o.arquivo}`),
        ...(falhas.length ? ["", `NÃO baixados (${falhas.length}):`, ...falhas.map((f) => `  ${linha(f.laudo)}  —  ${f.erro}`)] : []),
        ...(substituidos.length
          ? ["", `Fora por haver revisão mais nova do mesmo ensaio (${substituidos.length}):`, ...substituidos.map((s) => `  ${linha(s)}`)]
          : []),
      ].join("\r\n");
      zip.file("LEIA-ME.txt", leiame);

      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const dia = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const unicaOs = !variasOs ? manter[0]?.os_numero : null;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = unicaOs ? `Laudos_OS-${limpar(unicaOs)}_${dia}.zip` : `Laudos_${dia}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);

      if (falhas.length) {
        toast.warning(`${ok.length} PDF(s) no pacote; ${falhas.length} não baixado(s) — veja o LEIA-ME.txt.`, { duration: 10_000 });
      } else {
        toast.success(`${ok.length} PDF(s) no pacote.`);
      }
    } finally {
      setProgresso(null);
    }
  }

  return { baixar, progresso };
}
