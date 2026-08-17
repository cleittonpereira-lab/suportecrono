import type { CSSProperties, ReactNode } from "react";
import assinaturaMauricio from "@/assets/assinatura-mauricio.png";

const logoUrl = "/suporte-infra-logo.png";

/**
 * Formata o nome de quem assinou (Verificado por / Aprovado por).
 * Se o nome corresponder a signatários com título profissional conhecido,
 * prefixa o título correspondente. Caso contrário, devolve o próprio nome.
 */
function formatSignerName(name?: string | null): string {
  const raw = (name ?? "").trim();
  if (!raw) return "";
  if (/cleitton/i.test(raw) && /pereira/i.test(raw)) {
    return "Engº Geotécnico Cleitton Pereira";
  }
  return raw;
}

/**
 * ReportShell — cabeçalho + rodapé A4 padrão Suporte Infra.
 * Reaproveita o layout consolidado no relatório de Adensamento
 * (ver mem://design/report-header-footer.md).
 *
 * O miolo entre o header e o footer muda por ensaio; header e footer
 * permanecem idênticos para todos os relatórios da Suporte Infra.
 */

export interface ReportSample {
  client?: string;
  workNumber?: string;
  reportNumber?: string;
  borehole?: string;
  depth?: string | number;
  local?: string;
  revision?: string | number;
  operator?: string;
  technicalResp?: string;
  /** Digitado por — laboratorista/técnico que digitou o relatório. */
  typedBy?: string;
  /** Verificado por — nome de quem verificou a última revisão. */
  verifiedBy?: string;
  /** Aprovado por — nome de quem aprovou a última revisão. */
  approvedBy?: string;
  description?: string;
  code?: string;
  os?: string;
  granulometricDescription?: string;
  // Coordenadas topográficas (opcional)
  coordN?: number | string;
  coordE?: number | string;
  coordCota?: number | string;
  coordDatum?: string;
}

export interface ReportNorm {
  text: string;
  italic?: boolean;
}

export const REPORT_PAGE_STYLE: CSSProperties = {
  width: "210mm",
  height: "297mm",
  maxWidth: "210mm",
  maxHeight: "297mm",
  padding: "5mm 8mm",
  background: "#fff",
  color: "#0f172a",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 11,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  position: "relative",
  overflow: "hidden",
};

export function ReportHeader({
  sample,
  page,
  total,
  title,
  norms,
}: {
  sample: ReportSample;
  page: number;
  total: number;
  title: string;
  norms: ReportNorm[];
}) {
  const cell = "px-2 py-[3px] text-[10px] text-[#141414] align-middle";
  const Field = ({
    label,
    value,
    className = "",
  }: {
    label: string;
    value: ReactNode;
    className?: string;
  }) => (
    <td className={`${cell} ${className}`}>
      <span className="font-semibold">{label}</span> <span>{value ?? ""}</span>
    </td>
  );
  return (
    <div className="border border-[#141414] text-[#141414]">
      <div className="flex items-center px-2">
        <div className="flex w-[27%] items-center justify-center px-4 py-2">
          <img
            src={logoUrl}
            alt="Suporte Infra"
            crossOrigin="anonymous"
            className="h-10 w-auto max-w-full object-contain"
          />
        </div>
        <div className="w-[1px] self-stretch my-2 bg-[#141414]" />
        <div className="flex-1 px-4 py-1.5 text-center leading-tight">
          <div className="text-[12px] font-bold underline">RELATÓRIO DE ENSAIO</div>
          <div className="text-[11.5px] font-bold">{title}</div>
          {norms.map((n, i) => (
            <div key={i} className={`mt-0.5 text-[9.5px] ${n.italic ? "italic" : ""}`}>
              {n.text}
            </div>
          ))}
        </div>
      </div>

      <table className="w-full border-collapse border-t border-[#141414]">
        <tbody>
          <tr>
            <Field label="Cliente:" value={sample.client} className="w-1/3" />
            <Field label="Furo:" value={sample.borehole} className="w-1/3" />
            <Field label="Prof. (m):" value={sample.depth} className="w-1/3" />
          </tr>
          <tr>
            <Field label="Obra:" value={sample.workNumber} />
            <Field label="Código:" value={sample.code} />
            <Field label="O.S.:" value={sample.os} />
          </tr>
          <tr>
            <Field label="Local:" value={sample.local} />
            <Field label="Amostra:" value={sample.reportNumber} />
            <Field label="Revisão:" value={sample.revision} />
          </tr>
          {(sample.coordN != null || sample.coordE != null || sample.coordCota != null) && (
            <tr>
              <Field label="N (m):" value={sample.coordN ?? "—"} />
              <Field label="E (m):" value={sample.coordE ?? "—"} />
              <Field label="Cota (m):" value={sample.coordCota ?? "—"} />
            </tr>
          )}
          <tr className="border-t border-[#141414]">
            <td className={cell} colSpan={3}>
              <span className="font-semibold">Descrição Tátil-Visual:</span>{" "}
              {sample.description}
            </td>
          </tr>
          <tr>
            <td className={cell} colSpan={2}>
              <span className="font-semibold">Descrição Granulométrica:</span>{" "}
              {sample.granulometricDescription}
            </td>
            <td className={`${cell} text-right`}>
              <span className="font-semibold">Folha:</span> {page} / {total}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ReportFooter({ sample }: { sample: ReportSample }) {
  const months = [
    "janeiro","fevereiro","março","abril","maio","junho",
    "julho","agosto","setembro","outubro","novembro","dezembro",
  ];
  const spParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => spParts.find((p) => p.type === t)?.value ?? "";
  const day = parseInt(get("day"), 10);
  const month = parseInt(get("month"), 10) - 1;
  const year = parseInt(get("year"), 10);
  const hour = get("hour");
  const minute = get("minute");
  const todayPt = `${day} de ${months[month]} de ${year}`;
  const stampPt = `${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${year} ${hour}:${minute}`;
  return (
    <div className="mt-auto pt-1">
      <div className="grid grid-cols-12 gap-x-5 border-t border-[#141414]/30 pt-1">
        <div className="col-span-4 flex flex-col justify-end text-[8.5px] text-[#141414]">
          <div className="font-medium">São Paulo, {todayPt}</div>
          <div className="text-[8px] text-[#141414]/70">
            Contrato nº {sample.workNumber ?? "—"} · Revisão {sample.revision ?? "—"}
          </div>
          <div className="mt-[2px] space-y-[1px] text-[7.5px] leading-[1.2] text-[#141414]/80">
            <div><span className="text-[#141414]/60">Operador (Laboratorista):</span> {sample.operator ?? ""}</div>
            <div><span className="text-[#141414]/60">Digitado por:</span> {sample.typedBy ?? ""}</div>
            <div><span className="text-[#141414]/60">Verificado por:</span> {formatSignerName(sample.verifiedBy)}</div>
            <div><span className="text-[#141414]/60">Aprovado por:</span> {formatSignerName(sample.approvedBy)}</div>
            <div><span className="text-[#141414]/60">Gerente de Laboratório:</span> Tecnº Geotécnico Carlos Christian da Silva</div>
          </div>
        </div>
        <div className="col-span-4 flex flex-col items-center justify-end">
          <img
            src={assinaturaMauricio}
            alt="Assinatura Resp. Técnico"
            className="h-[28px] object-contain"
          />
          <div className="w-full border-t border-[#141414]/70" />
          <div className="mt-[1px] text-[7.5px] uppercase tracking-wide text-[#141414]/60">
            Responsável Técnico
          </div>
          <div className="text-[8px] font-medium text-[#141414] text-center leading-tight">
            {sample.technicalResp}
          </div>
        </div>
        <div className="col-span-4 text-[7.5px] leading-[1.25] text-[#141414]/75">
          <div className="mb-[1px] text-[7.5px] font-semibold uppercase tracking-wide text-[#141414]">
            Nota
          </div>
          Os resultados apresentados referem-se exclusivamente à amostra ensaiada. A
          reprodução deste documento somente poderá ser feita na íntegra, após
          aprovação prévia e por escrito da empresa.
        </div>
      </div>
      <div className="mt-1 flex items-start justify-between bg-[#141414] px-3 py-[4px] text-[7.5px] text-white">
        <div>
          <div className="font-bold tracking-wide">SUPORTE INFRA — LABORATÓRIO DE ENSAIOS ESPECIAIS</div>
          <div>Av. Camélia Borges Narciso, 582 · Bela São Pedro · São Pedro/SP · CEP 13.520-000</div>
        </div>
        <div className="text-right">
          <div>http://www.suportesolos.com.br</div>
          <div>contato@suportesolos.com.br</div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: "3mm",
          bottom: "1.5mm",
          fontSize: "5.5px",
          letterSpacing: "0.02em",
          color: "rgba(20,20,20,0.45)",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        Relatório gerado em: São Paulo, SP - Brasil · {stampPt}
      </div>
    </div>
  );
}

/** Página A4 pronta com header, footer e miolo customizável. */
export function ReportPage({
  sample,
  page,
  total,
  title,
  norms,
  children,
}: {
  sample: ReportSample;
  page: number;
  total: number;
  title: string;
  norms: ReportNorm[];
  children: ReactNode;
}) {
  return (
    <div style={REPORT_PAGE_STYLE} className="printable-report">
      <ReportHeader sample={sample} page={page} total={total} title={title} norms={norms} />
      <div className="mt-1 flex-1 overflow-hidden report-content-area relative min-h-0">
        {children}
      </div>
      <ReportFooter sample={sample} />
    </div>
  );
}