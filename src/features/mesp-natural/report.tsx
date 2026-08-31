import { ReportPage, type ReportSample, type ReportNorm } from "@/components/report/ReportShell";
import { calcDeterminacao, mediaValidas, RHO_PARAFINA, type DeterminacaoInput } from "@/features/mesp-natural/calc";
import type { Identificacao } from "@/features/mesp-natural/ui";

const NORMS: ReportNorm[] = [
  { text: "ABNT NBR 16867:2020 — Método da balança hidrostática (corpo-de-prova parafinado)" },
];

const REPORT_TITLE = "MASSA ESPECÍFICA APARENTE NATURAL";

function fmt(n: number | null | undefined, dec = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function identToSample(ident: Identificacao, extra: Partial<ReportSample> = {}): ReportSample {
  return {
    client: ident.tomador,
    workNumber: ident.obra,
    os: ident.os,
    reportNumber: ident.amostraCodigo,
    code: ident.amostraCodigo,
    borehole: ident.furo ?? "",
    depth: ident.profundidade ?? "",
    local: "",
    revision: "00",
    description: ident.amostraDescricao,
    granulometricDescription: "",
    technicalResp: "Engº Maurício Silva · CREA-SP 000000",
    ...extra,
  };
}

function SectionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 rounded bg-[#e5e7eb] px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-wide text-[#141414]">
      {children}
    </div>
  );
}

/**
 * Relatório de Massa Específica Aparente Natural (M.ESP.A) — layout
 * padronizado com o mesmo cabeçalho e rodapé usados nos relatórios
 * Triaxial CID e Adensamento (ver `ReportShell`).
 */
export function MEspAReport({
  ident,
  dets,
  obs,
  extra,
}: {
  ident: Identificacao;
  dets: DeterminacaoInput[];
  obs: string;
  extra?: Partial<ReportSample>;
}) {
  const results = dets.map(calcDeterminacao);
  const gammaNatMed = mediaValidas(results.map((r) => r.gammaNat));
  const gammaSecMed = mediaValidas(results.map((r) => r.gammaSec));
  const umidadeMed = mediaValidas(results.map((r) => r.umidade));
  const sample = identToSample(ident, extra);
  const rows: { label: string; get: (d: DeterminacaoInput, i: number) => string; dec?: number }[] = [
    { label: "Nº da Cápsula", get: (d) => d.capsula || "—" },
    { label: "Massa da Cápsula (Mc) [g]", get: (d) => fmt(d.massaCapsula, 2) },
    { label: "Cápsula + Solo Úmido (Mcsu) [g]", get: (d) => fmt(d.massaCapsulaSoloUmido, 2) },
    { label: "Cápsula + Solo Seco (Mcss) [g]", get: (d) => fmt(d.massaCapsulaSoloSeco, 2) },
    { label: "Massa CP (Mcp) [g]", get: (d) => fmt(d.massaCp, 2) },
    { label: "Massa CP + Parafina [g]", get: (d) => fmt(d.massaCpParafina, 2) },
    { label: "CP + Parafina Submerso [g]", get: (d) => fmt(d.massaCpParafinaSubmerso, 2) },
  ];
  const calc: { label: string; get: (r: ReturnType<typeof calcDeterminacao>) => string; strong?: boolean }[] = [
    { label: "Massa da Parafina [g]", get: (r) => fmt(r.massaParafina, 2) },
    { label: "Volume da Parafina [cm³]", get: (r) => fmt(r.volumeParafina, 2) },
    { label: "Volume Total (CP+par) [cm³]", get: (r) => fmt(r.volumeTotal, 2) },
    { label: "Volume do CP [cm³]", get: (r) => fmt(r.volumeCp, 2) },
    { label: "Umidade (w) [%]", get: (r) => fmt(r.umidade, 2), strong: true },
    { label: "ρ natural (úmida) [g/cm³]", get: (r) => fmt(r.gammaNat, 3), strong: true },
    { label: "ρ seca [g/cm³]", get: (r) => fmt(r.gammaSec, 3), strong: true },
  ];
  const cellHeader = "border border-[#141414] bg-[#f3f4f6] px-2 py-[3px] text-center text-[10px] font-semibold text-[#141414]";
  const cell = "border border-[#141414]/60 px-2 py-[3px] text-[10px] text-[#141414]";
  return (
    <div data-pdf-page>
      <ReportPage sample={sample} page={1} total={1} title={REPORT_TITLE} norms={NORMS}>
        <div className="flex h-full flex-col gap-2 text-[10px] text-[#141414]">
          <SectionBar>Dados de Ensaio — Determinações</SectionBar>
          <div className="text-[9px] text-[#141414]/70">
            Densidade da parafina adotada: <b>{RHO_PARAFINA.toLocaleString("pt-BR")} g/cm³</b>.
            ρ<sub>water</sub> = 1,00 g/cm³.
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${cellHeader} text-left`}>Parâmetro</th>
                {dets.map((_, i) => (
                  <th key={`h${i}`} className={cellHeader}>Det. {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  <td className={`${cell} bg-[#fafafa]`}>{row.label}</td>
                  {dets.map((d, i) => (
                    <td key={i} className={`${cell} text-center font-mono`}>{row.get(d, i)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <SectionBar>Resultados Calculados</SectionBar>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${cellHeader} text-left`}>Grandeza</th>
                {dets.map((_, i) => (
                  <th key={`hc${i}`} className={cellHeader}>Det. {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calc.map((row, ri) => (
                <tr key={ri}>
                  <td className={`${cell} bg-[#fafafa] ${row.strong ? "font-semibold" : ""}`}>{row.label}</td>
                  {results.map((r, i) => (
                    <td
                      key={i}
                      className={`${cell} text-center font-mono ${row.strong ? "bg-[#fff8e6] font-semibold" : ""}`}
                    >
                      {row.get(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <SectionBar>Resultado Final (média das determinações válidas)</SectionBar>
          <div className="grid grid-cols-3 gap-2">
            <ResultBox label="Umidade média (w)" value={`${fmt(umidadeMed, 2)} %`} />
            <ResultBox label="ρ natural média" value={`${fmt(gammaNatMed, 3)} g/cm³`} highlight />
            <ResultBox label="ρ seca média" value={`${fmt(gammaSecMed, 3)} g/cm³`} highlight />
          </div>

          <SectionBar>Formulações Utilizadas</SectionBar>
          <table className="w-full border-collapse text-[9.5px]">
            <tbody>
              <FormulaRow sym="w" name="Umidade" formula="w = (Mcsu − Mcss) / (Mcss − Mc) × 100" unit="%" />
              <FormulaRow sym="Mpar" name="Massa da parafina" formula="Mpar = M(cp+par) − Mcp" unit="g" />
              <FormulaRow sym="Vpar" name="Volume da parafina" formula="Vpar = Mpar / ρpar (ρpar = 0,78 g/cm³)" unit="cm³" />
              <FormulaRow sym="Vt" name="Volume total (empuxo)" formula="Vt = (M(cp+par) − Msub) / ρágua" unit="cm³" />
              <FormulaRow sym="Vcp" name="Volume do CP" formula="Vcp = Vt − Vpar" unit="cm³" />
              <FormulaRow sym="ρnat" name="Massa esp. aparente natural" formula="ρnat = Mcp / Vcp" unit="g/cm³" />
              <FormulaRow sym="ρsec" name="Massa esp. seca" formula="ρsec = ρnat / (1 + w/100)" unit="g/cm³" />
            </tbody>
          </table>

          <SectionBar>Observações</SectionBar>
          <div className="min-h-[36px] whitespace-pre-wrap rounded border border-[#141414]/40 bg-white px-2 py-1 text-[10px]">
            {obs?.trim() || "—"}
          </div>
        </div>
      </ReportPage>
    </div>
  );
}

function ResultBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded border px-3 py-2 ${
        highlight ? "border-[#141414] bg-[#fff8e6]" : "border-[#141414]/60 bg-white"
      }`}
    >
      <div className="text-[9px] uppercase tracking-wide text-[#141414]/70">{label}</div>
      <div className="mt-[2px] font-mono text-[13px] font-semibold text-[#141414]">{value}</div>
    </div>
  );
}

function FormulaRow({ sym, name, formula, unit }: { sym: string; name: string; formula: string; unit?: string }) {
  return (
    <tr className="border-b border-[#e5e7eb] align-top">
      <td className="w-[10%] py-[2px] pr-1 font-semibold">{sym}</td>
      <td className="w-[32%] py-[2px] pr-2">{name}</td>
      <td className="w-[50%] py-[2px] pr-2 font-mono">{formula}</td>
      <td className="w-[8%] py-[2px] text-[#141414]/70">{unit ?? ""}</td>
    </tr>
  );
}

/**
 * Gera o PDF do relatório M.ESP.A a partir de uma renderização
 * offscreen. Segue a mesma abordagem do relatório de Adensamento
 * (html-to-image + jsPDF) para garantir consistência visual.
 */
export async function generateMEspAPdf(container: HTMLElement, filename: string) {
  const blob = await renderMEspAPdfBlob(container);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Renderiza o relatório M.ESP.A e devolve o PDF como Blob (sem baixar).
 * Usado no fluxo Finalizar → Verificação, para salvar como versão + enviar
 * para aprovação (mesmo padrão do Triaxial CID).
 */
export async function renderMEspAPdfBlob(container: HTMLElement): Promise<Blob> {
  if (import.meta.env.SSR) throw new Error("renderMEspAPdfBlob só roda no navegador");
  const [{ toCanvas }, { default: jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);
  const pages = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-page]"));
  if (!pages.length) throw new Error("Nenhuma página do relatório foi renderizada");
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const W = 210, H = 297;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const rect = page.getBoundingClientRect();
    const canvas = await toCanvas(page, {
      backgroundColor: "#ffffff",
      pixelRatio: 3,
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
      cacheBust: true,
      skipAutoScale: true,
      style: { background: "#ffffff", color: "#0f172a", transform: "none" },
    });
    const dataUrl = canvas.toDataURL("image/png");
    if (i > 0) pdf.addPage();
    pdf.addImage(dataUrl, "PNG", 0, 0, W, H, undefined, "FAST");
  }
  return pdf.output("blob");
}