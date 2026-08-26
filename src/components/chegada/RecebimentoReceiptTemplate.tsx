import { SuporteLogo } from "@/components/suporte-logo";

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
  minHeight: "297mm",
  padding: "12mm 14mm",
  background: "#fff",
  color: "#0f172a",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 11,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded border border-[#141414]/30 bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#141414] mr-1 mb-1">
      {children}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5 py-1 border-b border-[#141414]/10">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#141414]/60 shrink-0 w-[150px]">
        {label}
      </span>
      <span className="text-[12px] font-medium text-[#141414]">{value || "—"}</span>
    </div>
  );
}

/**
 * Página 1 — cabeçalho, número de controle e dados do recebimento.
 * As fotos ficam em página(s) separadas via `RecebimentoReceiptPhotosPage`.
 */
export function RecebimentoReceiptPage({ data }: { data: RecebimentoReceiptData }) {
  return (
    <div style={PAGE_STYLE} className="printable-report">
      <div className="flex items-start justify-between border-b-2 border-[#141414] pb-3 mb-4">
        <div className="flex items-center gap-3">
          <SuporteLogo forceTheme="light" />
          <div>
            <div className="text-[15px] font-bold uppercase tracking-tight">
              Comprovante de Recebimento de Amostras
            </div>
            <div className="text-[10px] text-[#141414]/60">
              Laboratório de Ensaios Especiais · Suporte Infra
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[9px] uppercase tracking-wide text-[#141414]/60">Nº de Controle</div>
          <div className="text-[16px] font-bold font-mono tracking-tight">{data.numeroControle}</div>
        </div>
      </div>

      <div className="space-y-0.5 mb-4">
        <InfoRow label="OS / Cliente" value={data.osCliente} />
        <InfoRow label="Data de Chegada" value={data.dataChegada} />
        <InfoRow label="Hora do Registro" value={data.horaRegistro} />
        <InfoRow label="Registrado por" value={data.registradoPor} />
        {data.sup && <InfoRow label="SUP / Contrato" value={data.sup} />}
        <InfoRow
          label="Tipo de Amostra"
          value={data.tipoAmostra.map((t) => <Chip key={t}>{t}</Chip>)}
        />
        <InfoRow
          label="Recebido por"
          value={data.recebidoPor.map((r) => <Chip key={r}>{r}</Chip>)}
        />
      </div>

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

      <div className="mt-auto pt-3 border-t border-[#141414]/20 text-[8px] text-[#141414]/60 flex items-center justify-between">
        <span>Documento gerado automaticamente pelo sistema Suporte Infra — não requer assinatura.</span>
        <span>Folha 1 {data.images.length > 0 ? `de ${1 + Math.ceil(data.images.length / 9)}` : ""}</span>
      </div>
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
      <div className="flex items-center justify-between border-b border-[#141414]/30 pb-2 mb-3">
        <div className="text-[11px] font-bold uppercase tracking-wide">
          Registros Fotográficos — {data.numeroControle}
        </div>
        <div className="text-[10px] text-[#141414]/60">{data.osCliente}</div>
      </div>
      <div className="grid grid-cols-3 gap-3 flex-1">
        {photos.map((src, i) => (
          <div
            key={i}
            className="aspect-square rounded border border-[#141414]/20 overflow-hidden bg-[#f3f4f6] flex items-center justify-center"
          >
            <img src={src} alt={`Foto ${i + 1}`} crossOrigin="anonymous" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
      <div className="mt-auto pt-3 border-t border-[#141414]/20 text-[8px] text-[#141414]/60 flex items-center justify-between">
        <span>Documento gerado automaticamente pelo sistema Suporte Infra — não requer assinatura.</span>
        <span>Folha {pageIndex + 2} de {totalPages}</span>
      </div>
    </div>
  );
}
