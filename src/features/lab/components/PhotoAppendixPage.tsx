import { ReportPage, type ReportSample, type ReportNorm } from "@/components/report/ReportShell";
import type { Photo } from "../types";

/**
 * Página do relatório com o registro fotográfico da Moldagem e da Ruptura
 * dos corpos de prova. Renderiza uma grade 2×N por seção. Se ambas as
 * categorias estiverem vazias, o pai deve omitir esta página.
 */
export function PhotoAppendixPage({
  sample,
  page,
  total,
  title,
  norms,
  photos,
}: {
  sample: ReportSample;
  page: number;
  total: number;
  title: string;
  norms: ReportNorm[];
  photos: Photo[];
}) {
  const hasSpecimen = photos.some((p) => p.specimenId);

  return (
    <ReportPage sample={sample} page={page} total={total} title={title} norms={norms}>
      <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#141414]">
        Registro Fotográfico
      </div>
      {hasSpecimen ? (
        // Triaxial: agrupa por CP e, dentro do CP, por categoria.
        Object.entries(groupBy(photos, (p) => p.specimenId ?? "—")).map(([cp, list]) => (
          <div key={cp} className="mt-2">
            <div className="mb-1 text-[10px] font-semibold text-[#141414]">Corpo de prova {cp}</div>
            <PhotoSection heading="Moldagem" items={list.filter((p) => p.kind === "moldagem")} />
            <PhotoSection heading="Ruptura" items={list.filter((p) => p.kind === "ruptura")} />
            <PhotoSection heading="Outros registros" items={list.filter((p) => p.kind === "outro")} />
          </div>
        ))
      ) : (
        <>
          <PhotoSection heading="Moldagem do CP" items={photos.filter((p) => p.kind === "moldagem")} />
          <PhotoSection heading="Ruptura do CP" items={photos.filter((p) => p.kind === "ruptura")} />
          <PhotoSection heading="Outros registros" items={photos.filter((p) => p.kind === "outro")} />
        </>
      )}
    </ReportPage>
  );
}

function groupBy<T, K extends string>(arr: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = key(item);
    (out[k] ||= []).push(item);
  }
  return out;
}

function PhotoSection({ heading, items }: { heading: string; items: Photo[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="mb-1 text-[10px] font-semibold text-[#141414]">{heading}</div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((p) => (
          <figure key={p.id} className="overflow-hidden rounded border border-[#141414]/40">
            <div className="flex h-[65mm] w-full items-center justify-center bg-white">
              <img
                src={p.dataUrl}
                alt={p.caption ?? heading}
                className="max-h-full max-w-full object-contain"
                crossOrigin="anonymous"
              />
            </div>
            <figcaption className="border-t border-[#141414]/30 px-2 py-1 text-[8.5px] leading-tight text-[#141414]/80">
              {p.caption || heading}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}