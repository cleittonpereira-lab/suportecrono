const logoUrl = "/suporte-infra-logo.png";

export interface RecebimentoReceiptData {
  numeroControle: string;
  osCliente: string;
  dataChegada: string;
  horaRegistro: string;
  registradoPor: string;
  tipoAmostra: string[];
  recebidoPor: string[];
  sup?: string;
  relacaoAmostras: string;
  images: string[];
}

const PAGE_STYLE: React.CSSProperties = {
  width: "210mm",
  height: "297mm",
  maxWidth: "210mm",
  maxHeight: "297mm",
  padding: "8mm 10mm",
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

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded border border-[#141414]/30 bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#141414] mr-1 mb-1">
      {children}
    </span>
  );
}

/** Cabeçalho padrão Suporte Infra — mesma caixa/logo/tabela usada nos laudos técnicos, adaptado aos campos do comprovante de recebimento. */
function ReceiptHeader({ data, page, total }: { data: RecebimentoReceiptData; page: number; total: number }) {
  const cell = "px-2 py-[3px] text-[10px] text-[#141414] align-middle";
  const Field = ({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) => (
    <td className={`${cell} ${className}`}>
      <span className="font-semibold">{label}</span> <span>{value ?? "—"}</span>
    </td>
  );
  return (
    <div className="border border-[#141414] text-[#141414]">
      <div className="flex items-center px-2">
        <div className="flex w-[27%] items-center justify-center px-4 py-2">
          <img src={logoUrl} alt="Suporte Infra" crossOrigin="anonymous" className="h-10 w-auto max-w-full object-contain" />
        </div>
        <div className="w-[1px] self-stretch my-2 bg-[#141414]" />
        <div className="flex-1 px-4 py-1.5 text-center leading-tight">
          <div className="text-[12px] font-bold underline">COMPROVANTE DE RECEBIMENTO DE AMOSTRAS</div>
          <div className="text-[11.5px] font-bold">Nº de Controle: {data.numeroControle}</div>
          <div className="mt-0.5 text-[9.5px] italic">Documento operacional — Portal do Colaborador</div>
        </div>
      </div>

      <table className="w-full border-collapse border-t border-[#141414]">
        <tbody>
          <tr>
            <Field label="OS / Cliente:" value={data.osCliente} className="w-1/3" />
            <Field label="Data de Chegada:" value={data.dataChegada} className="w-1/3" />
            <Field label="Hora do Registro:" value={data.horaRegistro} className="w-1/3" />
          </tr>
          <tr>
            <Field label="Registrado por:" value={data.registradoPor} />
            <Field label="SUP / Contrato:" value={data.sup} />
            <td className={`${cell} text-right`}>
              <span className="font-semibold">Folha:</span> {page} / {total}
            </td>
          </tr>
          <tr className="border-t border-[#141414]">
            <td className={`${cell} w-1/2`} colSpan={1}>
              <span className="font-semibold">Tipo de Amostra:</span>{" "}
              {data.tipoAmostra.length > 0 ? data.tipoAmostra.map((t) => <Chip key={t}>{t}</Chip>) : "—"}
            </td>
            <td className={`${cell} w-1/2`} colSpan={2}>
              <span className="font-semibold">Recebido por:</span>{" "}
              {data.recebidoPor.length > 0 ? data.recebidoPor.map((r) => <Chip key={r}>{r}</Chip>) : "—"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Rodapé padrão Suporte Infra — mesma barra preta com dados da empresa usada nos laudos técnicos. */
function ReceiptFooter() {
  const months = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
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
      <div className="border-t border-[#141414]/30 pt-1 text-[8.5px] text-[#141414]">
        <div className="font-medium">São Paulo, {todayPt}</div>
        <div className="text-[8px] text-[#141414]/70">
          Documento gerado automaticamente pelo sistema Suporte Infra — não requer assinatura.
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

/**
 * Página 1 — cabeçalho, número de controle e dados do recebimento.
 * As fotos ficam em página(s) separadas via `RecebimentoReceiptPhotosPage`.
 */
export function RecebimentoReceiptPage({ data, total }: { data: RecebimentoReceiptData; total?: number }) {
  const totalPages = total ?? (1 + Math.ceil(data.images.length / 9));
  return (
    <div style={PAGE_STYLE} className="printable-report">
      <ReceiptHeader data={data} page={1} total={totalPages} />

      <div className="mt-2 flex-1 overflow-hidden relative min-h-0">
        <div className="mb-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#141414]/60 mb-1">
            Relação das Amostras
          </div>
          <div className="rounded border border-[#141414]/20 bg-[#f9fafb] p-2.5 text-[11px] leading-relaxed whitespace-pre-line">
            {data.relacaoAmostras || "—"}
          </div>
        </div>

        {data.images.length === 0 && (
          <div className="text-[10px] text-[#141414]/50 mt-2">Nenhum registro fotográfico anexado.</div>
        )}
      </div>

      <ReceiptFooter />
    </div>
  );
}

/** Página adicional só com grade de fotos (até 9 por página). */
export function RecebimentoReceiptPhotosPage({
  data,
  photos,
  pageIndex,
  totalPages,
}: {
  data: RecebimentoReceiptData;
  photos: string[];
  pageIndex: number;
  totalPages: number;
}) {
  return (
    <div style={PAGE_STYLE} className="printable-report">
      <ReceiptHeader data={data} page={pageIndex + 2} total={totalPages} />
      <div className="mt-2 flex-1 overflow-hidden relative min-h-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#141414]/60 mb-1.5">
          Registros Fotográficos
        </div>
        <div className="grid grid-cols-3 gap-3">
          {photos.map((src, i) => (
            <div
              key={i}
              className="aspect-square rounded border border-[#141414]/20 overflow-hidden bg-[#f3f4f6] flex items-center justify-center"
            >
              <img src={src} alt={`Foto ${i + 1}`} crossOrigin="anonymous" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
      <ReceiptFooter />
    </div>
  );
}
