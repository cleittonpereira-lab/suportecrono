import React from "react";
import { SectionBar } from './SectionBar';
import type { ReportSample, ReportNorm } from "@/components/report/ReportShell";
import { ReportHeader, ReportFooter, REPORT_PAGE_STYLE } from "@/components/report/ReportShell";

export interface CDPhoto {
  id: string;
  dataUrl: string;
  /** URL curta do arquivo real enviado ao Drive — preferir sempre que existir (ver `Photo.url` em `features/lab/types.ts`). */
  url?: string;
  kind: "moldagem" | "ruptura" | "outro";
  specimenId?: string;
  caption?: string;
}

export function CDPhotoPage({
  sample,
  page,
  total,
  title,
  norms,
  photos,
  specimens,
}: {
  sample: ReportSample;
  page: number;
  total: number;
  title: string;
  norms: ReportNorm[];
  photos: CDPhoto[];
  specimens: { id: string; displayId?: string }[];
}) {
  return (
    <div style={REPORT_PAGE_STYLE} className="printable-report">
      <ReportHeader sample={sample} page={page} total={total} title={title} norms={norms} />
      
      <div className="mt-2 flex-1">
        <SectionBar>Registro Fotográfico</SectionBar>
        
        <div className="mt-4 flex flex-col gap-6">
          {specimens.map((cp) => {
            const moldagem = photos.filter((p) => p.specimenId === cp.id && p.kind === "moldagem");
            const ruptura = photos.filter((p) => p.specimenId === cp.id && p.kind === "ruptura");
            const outros = photos.filter((p) => p.specimenId === cp.id && p.kind === "outro");

            if (moldagem.length === 0 && ruptura.length === 0 && outros.length === 0) return null;

            return (
              <div key={cp.id} className="space-y-3 break-inside-avoid">
                <div className="border-b border-[#141414]/20 pb-1 text-[10px] font-bold text-[#141414] uppercase">
                  Corpo-de-Prova: {cp.displayId ?? cp.id}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  {[...moldagem, ...ruptura, ...outros].map((photo) => (
                    <div key={photo.id} className="flex flex-col items-center gap-2 border border-[#141414]/20 p-2 rounded-sm bg-white shadow-sm">
                      <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/5">
                        <img
                          src={photo.url || photo.dataUrl}
                          alt={`Foto ${cp.displayId ?? cp.id}`}
                          className="h-full w-full object-contain"
                          crossOrigin="anonymous"
                        />
                      </div>
                      <div className="text-center leading-tight">
                        <div className="text-[9px] font-bold text-[#141414] uppercase">
                          {photo.kind === "moldagem" ? "Aspecto Inicial / Moldagem" : photo.kind === "ruptura" ? "Aspecto após Ruptura" : "Outro registro"}
                        </div>
                        {photo.caption && (
                          <div className="mt-0.5 text-[8.5px] text-[#141414]/70 italic">
                            {photo.caption}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {photos.length === 0 && (
          <div className="mt-20 text-center text-[10px] text-muted-foreground italic">
            Nenhum registro fotográfico anexado a esta revisão.
          </div>
        )}
      </div>

      <ReportFooter sample={sample} />
    </div>
  );
}
