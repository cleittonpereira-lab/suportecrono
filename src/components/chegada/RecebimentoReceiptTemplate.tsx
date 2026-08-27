import type { AmostraItem, AmostraFoto, AssinaturaCapturada } from "@/lib/chegada-amostras-store";

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
  /** Amostras detalhadas — quando ausente/vazio (registros antigos), sintetiza uma única a partir dos campos planos acima. */
  amostras?: AmostraItem[];
  assinaturaCliente?: AssinaturaCapturada | null;
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

/** Registro antigo (sem `amostras[]`) vira uma amostra única sintetizada a partir dos campos planos, pra manter o PDF funcionando. */
function getAmostrasEfetivas(data: RecebimentoReceiptData): AmostraItem[] {
  if (data.amostras && data.amostras.length > 0) return data.amostras;
  return [
    {
      id: "legacy",
      tipo: data.tipoAmostra.join(", ") || "—",
      identificacao: "",
      profundidade: "",
      quantidadeVolume: data.relacaoAmostras || "—",
      fotos: data.images.map((url) => ({ url, capturedAt: "", lat: null, lng: null })),
    },
  ];
}

function formatCapturedAt(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

function formatCoords(lat?: number | null, lng?: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export interface PhotoPageGroup {
  titulo: string;
  fotos: AmostraFoto[];
}

/** Empacota as fotos das amostras em páginas, agrupadas por amostra (com título repetido "(cont.)" quando uma amostra precisa de mais de uma página). */
export function paginatePhotosByAmostra(
  amostras: { titulo: string; fotos: AmostraFoto[] }[],
  maxPerPage = 6,
): PhotoPageGroup[][] {
  const pages: PhotoPageGroup[][] = [];
  let currentPage: PhotoPageGroup[] = [];
  let currentCount = 0;

  for (const group of amostras) {
    if (group.fotos.length === 0) continue;
    let remaining = group.fotos;
    let first = true;
    while (remaining.length > 0) {
      const spaceLeft = maxPerPage - currentCount;
      if (spaceLeft <= 0) {
        pages.push(currentPage);
        currentPage = [];
        currentCount = 0;
        continue;
      }
      const chunk = remaining.slice(0, spaceLeft);
      remaining = remaining.slice(spaceLeft);
      currentPage.push({ titulo: first ? group.titulo : `${group.titulo} (cont.)`, fotos: chunk });
      currentCount += chunk.length;
      first = false;
    }
  }
  if (currentPage.length > 0) pages.push(currentPage);
  return pages;
}

/** Monta as páginas de fotos (agrupadas por amostra) prontas pra passar direto pra `RecebimentoReceiptPhotosPage`. */
export function buildPhotoPages(data: RecebimentoReceiptData, maxPerPage = 6): PhotoPageGroup[][] {
  const amostras = getAmostrasEfetivas(data);
  const grupos = amostras.map((a) => ({
    titulo: a.identificacao ? `${a.tipo || "Amostra"} — ${a.identificacao}` : a.tipo || "Amostra",
    fotos: a.fotos,
  }));
  return paginatePhotosByAmostra(grupos, maxPerPage);
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

function ResumoQuantidades({ amostras }: { amostras: AmostraItem[] }) {
  const porTipo = new Map<string, AmostraItem[]>();
  for (const a of amostras) {
    const tipo = a.tipo || "Não especificado";
    if (!porTipo.has(tipo)) porTipo.set(tipo, []);
    porTipo.get(tipo)!.push(a);
  }
  return (
    <div className="mb-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#141414]/60 mb-1">
        Resumo de Quantidades
      </div>
      <table className="w-full border-collapse border border-[#141414]/20 text-[10px]">
        <thead>
          <tr className="bg-[#f3f4f6]">
            <th className="border border-[#141414]/20 px-2 py-1 text-left font-semibold">Tipo de Amostra</th>
            <th className="border border-[#141414]/20 px-2 py-1 text-left font-semibold w-[60px]">Qtd.</th>
            <th className="border border-[#141414]/20 px-2 py-1 text-left font-semibold">Volume / Quantidade</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(porTipo.entries()).map(([tipo, lista]) => (
            <tr key={tipo}>
              <td className="border border-[#141414]/20 px-2 py-1">{tipo}</td>
              <td className="border border-[#141414]/20 px-2 py-1">{lista.length}</td>
              <td className="border border-[#141414]/20 px-2 py-1">
                {lista.map((a) => a.quantidadeVolume).filter(Boolean).join("; ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListaAmostras({ amostras }: { amostras: AmostraItem[] }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#141414]/60 mb-1">
        Lista de Amostras
      </div>
      <table className="w-full border-collapse border border-[#141414]/20 text-[10px]">
        <thead>
          <tr className="bg-[#f3f4f6]">
            <th className="border border-[#141414]/20 px-2 py-1 text-left font-semibold w-[24px]">#</th>
            <th className="border border-[#141414]/20 px-2 py-1 text-left font-semibold">Tipo</th>
            <th className="border border-[#141414]/20 px-2 py-1 text-left font-semibold">Identificação</th>
            <th className="border border-[#141414]/20 px-2 py-1 text-left font-semibold">Profundidade</th>
            <th className="border border-[#141414]/20 px-2 py-1 text-left font-semibold">Qtd. / Volume</th>
          </tr>
        </thead>
        <tbody>
          {amostras.map((a, i) => (
            <tr key={a.id || i}>
              <td className="border border-[#141414]/20 px-2 py-1">{i + 1}</td>
              <td className="border border-[#141414]/20 px-2 py-1">{a.tipo || "—"}</td>
              <td className="border border-[#141414]/20 px-2 py-1">{a.identificacao || "—"}</td>
              <td className="border border-[#141414]/20 px-2 py-1">{a.profundidade || "—"}</td>
              <td className="border border-[#141414]/20 px-2 py-1">{a.quantidadeVolume || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Assinaturas({ data }: { data: RecebimentoReceiptData }) {
  return (
    <div className="mb-1">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#141414]/60 mb-1">Assinaturas</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-[#141414]/20 p-2.5">
          <div className="text-[10px] font-semibold mb-1">Suporte Infra</div>
          <div className="flex h-[56px] items-center justify-center text-center text-[10px] italic text-[#141414]/70">
            Assinado digitalmente — recebido no laboratório
          </div>
          <div className="text-[9px] text-[#141414]/60 border-t border-[#141414]/10 pt-1 mt-1">
            {data.registradoPor} · {data.dataChegada} {data.horaRegistro}
          </div>
        </div>
        <div className="rounded border border-[#141414]/20 p-2.5">
          <div className="text-[10px] font-semibold mb-1">Cliente</div>
          <div className="flex h-[56px] items-center justify-center">
            {data.assinaturaCliente?.imagemUrl ? (
              <img
                src={data.assinaturaCliente.imagemUrl}
                alt="Assinatura do cliente"
                crossOrigin="anonymous"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-[10px] text-[#141414]/40 italic">Não assinado</span>
            )}
          </div>
          <div className="text-[9px] text-[#141414]/60 border-t border-[#141414]/10 pt-1 mt-1">
            {data.assinaturaCliente?.nome || data.osCliente || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Página 1 — cabeçalho, resumo de quantidades, lista de amostras e assinaturas.
 * As fotos ficam em página(s) separadas via `RecebimentoReceiptPhotosPage`, agrupadas por amostra.
 */
export function RecebimentoReceiptPage({ data, total }: { data: RecebimentoReceiptData; total?: number }) {
  const amostras = getAmostrasEfetivas(data);
  const totalPages = total ?? 1 + buildPhotoPages(data).length;
  const semFotos = amostras.every((a) => a.fotos.length === 0);
  return (
    <div style={PAGE_STYLE} className="printable-report">
      <ReceiptHeader data={data} page={1} total={totalPages} />

      <div className="mt-2 flex-1 overflow-hidden relative min-h-0">
        <ResumoQuantidades amostras={amostras} />
        <ListaAmostras amostras={amostras} />
        <Assinaturas data={data} />

        {semFotos && <div className="text-[10px] text-[#141414]/50 mt-1">Nenhum registro fotográfico anexado.</div>}
      </div>

      <ReceiptFooter />
    </div>
  );
}

/** Página adicional de fotos, agrupadas por amostra, com legenda de data/hora e localização (quando disponível). */
export function RecebimentoReceiptPhotosPage({
  data,
  groups,
  pageIndex,
  totalPages,
}: {
  data: RecebimentoReceiptData;
  groups: PhotoPageGroup[];
  pageIndex: number;
  totalPages: number;
}) {
  return (
    <div style={PAGE_STYLE} className="printable-report">
      <ReceiptHeader data={data} page={pageIndex + 2} total={totalPages} />
      <div className="mt-2 flex-1 overflow-hidden relative min-h-0 space-y-3">
        {groups.map((group, gi) => (
          <div key={gi}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#141414]/60 mb-1.5">
              Registros Fotográficos — {group.titulo}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {group.fotos.map((foto, i) => {
                const caption = formatCapturedAt(foto.capturedAt);
                const coords = formatCoords(foto.lat, foto.lng);
                return (
                  <div key={i} className="rounded border border-[#141414]/20 overflow-hidden bg-[#f3f4f6]">
                    <div className="aspect-square flex items-center justify-center bg-[#f3f4f6]">
                      <img src={foto.url} alt={`Foto ${i + 1}`} crossOrigin="anonymous" className="w-full h-full object-cover" />
                    </div>
                    {(caption || coords) && (
                      <div className="px-1.5 py-1 text-[8px] leading-tight text-[#141414]/70 bg-white border-t border-[#141414]/10">
                        {caption && <div>{caption}</div>}
                        {coords && <div className="text-[#141414]/50">{coords}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <ReceiptFooter />
    </div>
  );
}
