import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, Download } from "lucide-react";
import { fetchOsFileContent } from "@/lib/os-arquivos.functions";
import type { DriveFile } from "@/lib/os-arquivos.functions";

export function FileViewerDialog({
  file,
  open,
  onOpenChange,
}: {
  file: DriveFile | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const fetchFn = useServerFn(fetchOsFileContent);
  const q = useQuery({
    queryKey: ["os-file-content", file?.id],
    queryFn: () => fetchFn({ data: { fileId: file!.id } }),
    enabled: !!file && open,
    staleTime: 5 * 60_000,
  });

  const blobUrl = useMemo(() => {
    if (!q.data) return null;
    const bin = Uint8Array.from(atob(q.data.base64), (c) => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bin], { type: q.data.mimeType }));
  }, [q.data]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const mime = q.data?.mimeType ?? file?.mimeType ?? "";
  const isImage = mime.startsWith("image/");
  const isPdf = mime.includes("pdf");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="truncate text-sm">{file?.name ?? "Arquivo"}</DialogTitle>
            <div className="ml-auto flex items-center gap-1">
              {blobUrl && (
                <Button size="sm" variant="ghost" asChild className="h-7">
                  <a href={blobUrl} download={file?.name}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Baixar
                  </a>
                </Button>
              )}
              {file?.webViewLink && (
                <Button size="sm" variant="ghost" asChild className="h-7">
                  <a href={file.webViewLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Drive
                  </a>
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>
        <div className="bg-muted/30 flex items-center justify-center" style={{ height: "78vh" }}>
          {q.isLoading || !blobUrl ? (
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando...
            </div>
          ) : q.error ? (
            <p className="text-sm text-destructive px-4 text-center">
              Falha ao carregar: {(q.error as Error).message}
            </p>
          ) : isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={blobUrl} alt={file?.name || ""} className="max-h-full max-w-full object-contain" />
          ) : isPdf ? (
            <iframe src={blobUrl} title={file?.name || "PDF"} className="w-full h-full border-0" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-sm">
              <p>Prévia não suportada para este tipo de arquivo.</p>
              <Button size="sm" asChild>
                <a href={blobUrl} download={file?.name}>
                  <Download className="h-4 w-4 mr-1" /> Baixar arquivo
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}