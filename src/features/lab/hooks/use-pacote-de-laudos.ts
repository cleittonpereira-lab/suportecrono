/**
 * Pacote (.zip) com os PDFs (e/ou planilhas) dos laudos escolhidos — sempre o arquivo ORIGINAL do
 * Drive (o arquivo assinado/carimbado, não um PDF refeito na hora) e sempre a
 * última revisão aprovada de cada laudo.
 *
 * Regras:
 * - Cada laudo baixa exatamente a maior revisão APROVADA (`rev_aprovada`), mesmo
 *   com uma revisão nova em digitação.
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
import { getRevisionPdfBase64, getRevisionXlsxBase64 } from "@/lib/driveSync.functions";
import type { EmissaoRow } from "@/lib/emissoes.functions";
import { ultimaRevisaoDeCada } from "@/lib/pacote-laudos";

export type LaudoDoPacote = Pick<
  EmissaoRow,
  "scope_id" | "rev" | "rev_aprovada" | "os_numero" | "os_cliente" | "amostra_code" | "ensaio_tipo" | "ensaio_nome" | "decided_at"
>;

export type ConteudoDoPacote = "pdf" | "pdf_xlsx" | "xlsx";

const rotuloRev = (rev: number | null) => `Rev-${String(rev ?? 0).padStart(2, "0")}`;

function base64ParaBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function limpar(v: string): string {
  return v.replace(/[\\/:*?"<>|]+/g, "-").trim();
}

function salvar(blob: Blob, nome: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function usePacoteDeLaudos() {
  const pdfFn = useServerFn(getRevisionPdfBase64);
  const xlsxFn = useServerFn(getRevisionXlsxBase64);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);

  /** Um arquivo só, direto (sem .zip): o PDF ou a planilha ORIGINAL do Drive, na maior revisão aprovada. */
  async function baixarUm(laudo: LaudoDoPacote, tipo: "pdf" | "xlsx" = "pdf") {
    if (laudo.rev_aprovada == null) {
      toast.error("Este laudo ainda não tem revisão aprovada.");
      return;
    }
    const rev = laudo.rev_aprovada;
    const id = toast.loading(tipo === "pdf" ? "Baixando o PDF do Drive…" : "Baixando a planilha do Drive…");
    try {
      const r = tipo === "pdf"
        ? await pdfFn({ data: { scopeId: laudo.scope_id, rev } })
        : await xlsxFn({ data: { scopeId: laudo.scope_id, rev } });
      if (!r.base64) {
        toast.error(`A ${rotuloRev(rev)} deste laudo não tem planilha original no Drive.`, { id });
        return;
      }
      const mime = tipo === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      salvar(
        new Blob([base64ParaBytes(r.base64)], { type: mime }),
        limpar(r.nome || `${laudo.os_numero}_${laudo.amostra_code}_${rotuloRev(rev)}.${tipo}`),
      );
      toast.success(`${tipo === "pdf" ? "PDF" : "Planilha"} baixado (${rotuloRev(rev)}).`, { id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), { id });
    }
  }

  /**
   * `conteudo`: "pdf" (padrão), "pdf_xlsx" ou "xlsx". A planilha também é a
   * ORIGINAL do Drive (gravada junto com o PDF da revisão); se a revisão não
   * tem planilha no Drive, ela fica de fora e vai para o LEIA-ME — nunca entra
   * uma planilha genérica no lugar.
   */
  async function baixar(laudosPedidos: LaudoDoPacote[], conteudo: ConteudoDoPacote = "pdf") {
    if (laudosPedidos.length === 0 || progresso) return;
    const querPdf = conteudo !== "xlsx";
    const querXlsx = conteudo !== "pdf";
    // Só o que tem revisão aprovada; a revisão do pacote é a maior aprovada,
    // mesmo com uma revisão nova em digitação.
    const semAprovada = laudosPedidos.filter((l) => l.rev_aprovada == null);
    const laudos = laudosPedidos.filter((l) => l.rev_aprovada != null).map((l) => ({ ...l, rev: l.rev_aprovada }));
    if (laudos.length === 0) {
      toast.error("Nenhum dos laudos escolhidos tem revisão aprovada.");
      return;
    }
    const { manter, substituidos } = ultimaRevisaoDeCada(laudos);
    const variasOs = new Set(manter.map((l) => l.os_numero)).size > 1;
    const zip = new JSZip();
    const usados = new Set<string>();
    const falhas: { laudo: LaudoDoPacote; erro: string }[] = [];
    const semPlanilha: LaudoDoPacote[] = [];
    const ok: { laudo: LaudoDoPacote; arquivo: string }[] = [];
    let feitos = 0;
    setProgresso({ feitos: 0, total: manter.length });

    const guardar = (l: LaudoDoPacote, nomeDrive: string | null, ext: "pdf" | "xlsx", b64: string) => {
      const pasta = variasOs ? `OS ${limpar(l.os_numero ?? "sem-OS")}/` : "";
      const base = limpar(nomeDrive || `${l.os_numero}_${l.amostra_code}_${rotuloRev(l.rev)}.${ext}`).replace(/\.(pdf|xlsx)$/i, "");
      let nome = `${base}.${ext}`;
      // Nome repetido no pacote não pode apagar o outro arquivo.
      for (let i = 2; usados.has(pasta + nome); i++) nome = `${base} (${i}).${ext}`;
      usados.add(pasta + nome);
      zip.file(pasta + nome, base64ParaBytes(b64), { binary: true });
      ok.push({ laudo: l, arquivo: pasta + nome });
    };

    const fila = [...manter];
    async function trabalhador() {
      for (let l = fila.shift(); l; l = fila.shift()) {
        try {
          if (querPdf) {
            const r = await pdfFn({ data: { scopeId: l.scope_id, rev: l.rev ?? 0 } });
            guardar(l, r.nome, "pdf", r.base64);
          }
          if (querXlsx) {
            const x = await xlsxFn({ data: { scopeId: l.scope_id, rev: l.rev ?? 0 } });
            if (x.base64) guardar(l, x.nome, "xlsx", x.base64);
            else semPlanilha.push(l);
          }
        } catch (e) {
          falhas.push({ laudo: l, erro: e instanceof Error ? e.message : String(e) });
        }
        setProgresso({ feitos: ++feitos, total: manter.length });
      }
    }

    try {
      await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
      const linha = (l: LaudoDoPacote) => `OS ${l.os_numero} · ${l.amostra_code ?? "—"} · ${l.ensaio_nome || l.ensaio_tipo || "Ensaio"} · ${rotuloRev(l.rev)}`;
      if (ok.length === 0) {
        toast.error(
          falhas[0]?.erro ??
            (semPlanilha.length
              ? `Nenhuma planilha original no Drive para estes laudos (${semPlanilha.length}). Só o Cisalhamento Direto, a Compressão Simples e o Adensamento gravam planilha, e só nas revisões enviadas a partir desta versão.`
              : "Nada baixado."),
          { duration: 12_000 },
        );
        return;
      }

      const leiame = [
        `PACOTE DE LAUDOS — arquivos ORIGINAIS do Drive (${conteudo === "xlsx" ? "planilhas" : conteudo === "pdf_xlsx" ? "PDFs e planilhas" : "PDFs"}), última revisão aprovada`,
        `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        "",
        `No pacote (${ok.length}):`,
        ...ok.map((o) => `  ${linha(o.laudo)}  →  ${o.arquivo}`),
        ...(falhas.length ? ["", `NÃO baixados (${falhas.length}):`, ...falhas.map((f) => `  ${linha(f.laudo)}  —  ${f.erro}`)] : []),
        ...(semPlanilha.length
          ? ["", `Sem planilha original no Drive para esta revisão (${semPlanilha.length}):`, ...semPlanilha.map((s) => `  ${linha(s)}`)]
          : []),
        ...(semAprovada.length
          ? ["", `Sem revisão aprovada — fora do pacote (${semAprovada.length}):`, ...semAprovada.map((s) => `  ${linha(s)}`)]
          : []),
        ...(substituidos.length
          ? ["", `Fora por haver revisão mais nova do mesmo ensaio (${substituidos.length}):`, ...substituidos.map((s) => `  ${linha(s)}`)]
          : []),
      ].join("\r\n");
      zip.file("LEIA-ME.txt", leiame);

      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const dia = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const unicaOs = !variasOs ? manter[0]?.os_numero : null;
      const prefixo = conteudo === "xlsx" ? "Planilhas" : "Laudos";
      salvar(blob, unicaOs ? `${prefixo}_OS-${limpar(unicaOs)}_${dia}.zip` : `${prefixo}_${dia}.zip`);

      const faltas = falhas.length + semPlanilha.length;
      if (faltas) {
        toast.warning(`${ok.length} arquivo(s) no pacote; ${faltas} ficaram de fora — veja o LEIA-ME.txt.`, { duration: 10_000 });
      } else {
        toast.success(`${ok.length} arquivo(s) no pacote.`);
      }
    } finally {
      setProgresso(null);
    }
  }

  return { baixar, baixarUm, progresso };
}
