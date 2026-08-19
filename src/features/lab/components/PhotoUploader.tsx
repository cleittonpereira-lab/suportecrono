import { useRef, useState } from "react";
import { Camera, Crop, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Photo } from "../types";
import { fileToCompressedDataUrl, formatBytes } from "../photos";
import { PhotoCropDialog } from "./PhotoCropDialog";

interface Props {
  title: string;
  kind: Photo["kind"];
  photos: Photo[];
  onAdd: (p: Omit<Photo, "id" | "createdAt">) => void;
  onRemove: (photoId: string) => void;
  onUpdate: (photoId: string, patch: Partial<Photo>) => void;
}

export function PhotoUploader({ title, kind, photos = [], onAdd, onRemove, onUpdate }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const items = (photos || []).filter((p) => p && p.kind === kind);
  const [editing, setEditing] = useState<Photo | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{
    dataUrl: string;
    bytes: number;
    kind: Photo["kind"];
    caption?: string;
  } | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const f = files[0];
    if (!f.type.startsWith("image/")) {
      toast.error(`${f.name}: não é uma imagem`);
      return;
    }
    try {
      const { dataUrl, bytes } = await fileToCompressedDataUrl(f);
      // Abre o diálogo de recorte 4:3 imediatamente para ajuste fino
      setPendingUpload({ dataUrl, bytes, kind, caption: "" });
    } catch (e) {
      toast.error(`Falha ao processar ${f.name}`);
      console.error(e);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-[10px] text-muted-foreground">
            {items.length} foto{items.length === 1 ? "" : "s"}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="mr-1 h-3 w-3" />
          Adicionar Foto
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Nenhuma foto — clique em "Adicionar Foto" para incluir.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((p) => (
            <div key={p.id} className="group relative overflow-hidden rounded-md border border-border bg-card">
              <div className="flex aspect-[3/4] w-full items-center justify-center bg-black/5 overflow-hidden">
                <img
                  src={p.dataUrl}
                  alt={p.caption ?? title}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-2">
                <Label className="text-[10px] text-muted-foreground">Legenda</Label>
                <Input
                  value={p.caption ?? ""}
                  onChange={(e) => onUpdate(p.id, { caption: e.target.value })}
                  placeholder="Ex.: Ruptura CP2 — face frontal"
                  className="h-7 text-xs"
                />
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{formatBytes(p.bytes)}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5"
                      onClick={() => setEditing(p)}
                      aria-label="Editar recorte"
                      title="Editar enquadramento"
                    >
                      <Crop className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-destructive hover:text-destructive"
                      onClick={() => onRemove(p.id)}
                      aria-label="Remover foto"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recorte ao fazer upload de nova imagem */}
      {pendingUpload && (
        <PhotoCropDialog
          open={!!pendingUpload}
          photo={{
            id: "pending",
            dataUrl: pendingUpload.dataUrl,
            bytes: pendingUpload.bytes,
            kind: pendingUpload.kind,
            caption: pendingUpload.caption,
            createdAt: new Date().toISOString(),
          }}
          onOpenChange={(o) => { if (!o) setPendingUpload(null); }}
          onSave={(dataUrl, bytes) => {
            onAdd({ dataUrl, bytes, kind: pendingUpload.kind, caption: pendingUpload.caption });
            setPendingUpload(null);
            toast.success("Foto adicionada e enquadrada com sucesso!");
          }}
        />
      )}

      {/* Recorte de foto já existente */}
      {editing && (
        <PhotoCropDialog
          open={!!editing}
          photo={editing}
          onOpenChange={(o) => { if (!o) setEditing(null); }}
          onSave={(dataUrl, bytes) => {
            onUpdate(editing.id, { dataUrl, bytes });
            setEditing(null);
            toast.success("Recorte atualizado");
          }}
        />
      )}
    </div>
  );
}