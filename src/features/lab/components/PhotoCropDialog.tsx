import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Photo } from "../types";

/**
 * Editor de recorte simples, com aspecto fixo 3:4 (retrato — 3 na horizontal, 4 na vertical).
 * Controles: zoom, deslocamento X e Y. Salva um JPEG 3:4 (1200×1600)
 * usando as dimensões originais da imagem para preservar máxima nitidez e qualidade técnica.
 */
const ASPECT = 3 / 4;
const OUT_W = 1200;
const OUT_H = 1600;

export function PhotoCropDialog({
  open,
  photo,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  photo: Photo;
  onOpenChange: (o: boolean) => void;
  onSave: (dataUrl: string, bytes: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [ox, setOx] = useState(50);
  const [oy, setOy] = useState(50);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);

  // Foto já enviada ao Drive tem `dataUrl` vazio e só `url` — preferir sempre
  // que existir, senão o recorte de uma foto já salva carregaria em branco.
  const photoSrc = photo.url || photo.dataUrl;

  useEffect(() => {
    if (!open) return;
    setZoom(1);
    setOx(50);
    setOy(50);
    const img = new Image();
    img.onload = () => setImgDims({ w: img.width, h: img.height });
    img.src = photoSrc;
  }, [open, photoSrc]);

  const crop = useMemo(() => {
    if (!imgDims) return null;
    const srcAspect = imgDims.w / imgDims.h;
    let baseW: number, baseH: number;
    if (srcAspect > ASPECT) {
      baseH = imgDims.h;
      baseW = baseH * ASPECT;
    } else {
      baseW = imgDims.w;
      baseH = baseW / ASPECT;
    }
    const cropW = baseW / zoom;
    const cropH = baseH / zoom;
    const cx = (ox / 100) * imgDims.w;
    const cy = (oy / 100) * imgDims.h;
    let sx = cx - cropW / 2;
    let sy = cy - cropH / 2;
    sx = Math.max(0, Math.min(imgDims.w - cropW, sx));
    sy = Math.max(0, Math.min(imgDims.h - cropH, sy));
    return { sx, sy, cropW, cropH };
  }, [imgDims, zoom, ox, oy]);

  const previewBoxH = 460;
  const previewBoxW = Math.round(previewBoxH * ASPECT); // 345px
  const preview = useMemo(() => {
    if (!imgDims || !crop) return null;
    const scale = previewBoxW / crop.cropW;
    return {
      width: imgDims.w * scale,
      height: imgDims.h * scale,
      left: -crop.sx * scale,
      top: -crop.sy * scale,
    };
  }, [imgDims, crop, previewBoxW]);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current || !imgDims || !crop) return;
    const dx = e.clientX - dragging.current.x;
    const dy = e.clientY - dragging.current.y;
    dragging.current = { x: e.clientX, y: e.clientY };
    // 1px de tela = (crop.cropW/previewBoxW) px da imagem original
    const scale = crop.cropW / previewBoxW;
    const newCxPx = (ox / 100) * imgDims.w - dx * scale;
    const newCyPx = (oy / 100) * imgDims.h - dy * scale;
    setOx(Math.max(0, Math.min(100, (newCxPx / imgDims.w) * 100)));
    setOy(Math.max(0, Math.min(100, (newCyPx / imgDims.h) * 100)));
  };
  const stopDrag = () => {
    dragging.current = null;
  };

  const doSave = async () => {
    if (!imgDims || !crop) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Falha ao carregar imagem"));
      img.src = photoSrc;
    });
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    ctx.drawImage(img, crop.sx, crop.sy, crop.cropW, crop.cropH, 0, 0, OUT_W, OUT_H);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    const bytes = Math.round((dataUrl.length - "data:image/jpeg;base64,".length) * 0.75);
    onSave(dataUrl, bytes);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Ajustar enquadramento da foto</DialogTitle>
          <DialogDescription>
            Arraste sobre a imagem para reposicionar e use o zoom para aproximar.
          </DialogDescription>
        </DialogHeader>

        <div
          ref={containerRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          className="relative mx-auto select-none overflow-hidden rounded border border-border bg-black"
          style={{ width: previewBoxW, height: previewBoxH, cursor: dragging.current ? "grabbing" : "grab" }}
        >
          {preview && (
            <img
              src={photoSrc}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                width: preview.width,
                height: preview.height,
                left: preview.left,
                top: preview.top,
                maxWidth: "none",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          )}
          {/* Overlay grade 3:4 (terços) */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/3 top-0 h-full w-px bg-white/30" />
            <div className="absolute left-2/3 top-0 h-full w-px bg-white/30" />
            <div className="absolute top-1/3 left-0 w-full h-px bg-white/30" />
            <div className="absolute top-2/3 left-0 w-full h-px bg-white/30" />
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <Label className="text-xs">Zoom · {zoom.toFixed(2)}×</Label>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Horizontal</Label>
              <input
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={ox}
                onChange={(e) => setOx(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <Label className="text-xs">Vertical</Label>
              <input
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={oy}
                onChange={(e) => setOy(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={doSave} disabled={!imgDims}>
            Salvar recorte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}