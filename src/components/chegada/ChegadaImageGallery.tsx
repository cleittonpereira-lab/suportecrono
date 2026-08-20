import React, { useState, useRef, useEffect } from "react";
import {
  Camera,
  Image as ImageIcon,
  Plus,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Download,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface ChegadaImageGalleryProps {
  images: string[];
  onChange?: (newImages: string[]) => void;
  readOnly?: boolean;
  className?: string;
}

export function ChegadaImageGallery({
  images,
  onChange,
  readOnly = false,
  className,
}: ChegadaImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Keyboard navigation in lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setLightboxIndex((prev) =>
          prev !== null ? (prev > 0 ? prev - 1 : images.length - 1) : null
        );
      } else if (e.key === "ArrowRight") {
        setLightboxIndex((prev) =>
          prev !== null ? (prev < images.length - 1 ? prev + 1 : 0) : null
        );
      } else if (e.key === "Escape") {
        setLightboxIndex(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, images.length]);

  const processFiles = (files: FileList | null) => {
    if (!files || files.length === 0 || !onChange) return;

    const fileArray = Array.from(files);
    let loadedCount = 0;
    const newBase64Images: string[] = [];

    fileArray.forEach((file) => {
      // Basic size / format validation
      if (!file.type.startsWith("image/")) {
        toast.error(`O arquivo "${file.name}" não é uma imagem válida.`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (result) {
          newBase64Images.push(result);
        }
        loadedCount++;
        if (loadedCount === fileArray.length) {
          onChange([...images, ...newBase64Images]);
          toast.success(
            `${newBase64Images.length} ${
              newBase64Images.length === 1 ? "foto adicionada" : "fotos adicionadas"
            } com sucesso!`
          );
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleGallerySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const handleRemoveImage = (indexToRemove: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onChange) return;
    const updated = images.filter((_, i) => i !== indexToRemove);
    onChange(updated);
    if (lightboxIndex !== null) {
      if (updated.length === 0) {
        setLightboxIndex(null);
      } else if (lightboxIndex >= updated.length) {
        setLightboxIndex(updated.length - 1);
      }
    }
    toast.info("Foto removida.");
  };

  return (
    <div className={`space-y-3 ${className || ""}`}>
      {/* Botões de Ação para Celular e Desktop (Tirar Foto vs Selecionar da Galeria) */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Botão Tirar Foto (Câmera Mobile) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => cameraInputRef.current?.click()}
            className="gap-2 text-xs font-semibold h-9 bg-background hover:bg-muted/50 border-primary/30 text-primary hover:text-primary shadow-2xs transition-all flex-1 sm:flex-initial"
          >
            <Camera className="h-4 w-4 text-primary" />
            <span>Tirar Foto</span>
          </Button>

          {/* Botão Selecionar da Galeria (Múltiplas Fotos) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => galleryInputRef.current?.click()}
            className="gap-2 text-xs font-semibold h-9 bg-background hover:bg-muted/50 shadow-2xs transition-all flex-1 sm:flex-initial"
          >
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <span>Selecionar da Galeria</span>
          </Button>

          {/* Contador de Imagens */}
          {images.length > 0 && (
            <Badge variant="secondary" className="text-[11px] font-medium h-7 px-2.5 ml-auto">
              {images.length} {images.length === 1 ? "foto anexada" : "fotos anexadas"}
            </Badge>
          )}

          {/* Hidden File Inputs */}
          <input
            type="file"
            ref={cameraInputRef}
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={handleCameraCapture}
          />
          <input
            type="file"
            ref={galleryInputRef}
            className="hidden"
            accept="image/*"
            multiple
            onChange={handleGallerySelect}
          />
        </div>
      )}

      {/* Grade Padronizada de Miniaturas Compactas */}
      {images.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 p-2 bg-muted/20 rounded-lg border border-border/60">
          {images.map((img, idx) => (
            <div
              key={idx}
              onClick={() => setLightboxIndex(idx)}
              className="group relative aspect-square rounded-md overflow-hidden bg-background border border-border/80 shadow-2xs hover:shadow-md cursor-pointer transition-all hover:border-primary/50"
            >
              <img
                src={img}
                alt={`Amostra ${idx + 1}`}
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
              />

              {/* Overlay de Hover e Zoom */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                <div className="bg-background/90 text-foreground p-1 rounded-full shadow-sm">
                  <ZoomIn className="h-3.5 w-3.5" />
                </div>
              </div>

              {/* Badge com Número da Foto */}
              <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.2 rounded backdrop-blur-xs">
                #{idx + 1}
              </span>

              {/* Botão de Remover Foto */}
              {!readOnly && (
                <button
                  type="button"
                  onClick={(e) => handleRemoveImage(idx, e)}
                  title="Remover foto"
                  className="absolute top-1 right-1 bg-destructive text-destructive-foreground p-1 rounded-full shadow-md opacity-90 hover:opacity-100 hover:scale-110 transition-all z-10"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}

          {/* Card para Adicionar Mais (se não for readOnly) */}
          {!readOnly && (
            <div
              onClick={() => galleryInputRef.current?.click()}
              className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/30 hover:border-primary/60 bg-muted/30 hover:bg-primary/5 flex flex-col items-center justify-center text-muted-foreground hover:text-primary cursor-pointer transition-all gap-1 p-2 text-center"
            >
              <Plus className="h-5 w-5 stroke-[2.5]" />
              <span className="text-[10px] font-semibold leading-tight">+ Adicionar</span>
            </div>
          )}
        </div>
      ) : (
        !readOnly && (
          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted rounded-lg bg-muted/10 text-center gap-2">
            <div className="p-2.5 rounded-full bg-primary/10 text-primary">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Nenhuma foto anexada ainda</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Use a câmera do celular ou selecione fotos da galeria para documentar a amostra.
              </p>
            </div>
          </div>
        )
      )}

      {/* Modal Lightbox Ampliado para Visualização Individual e Navegação */}
      <Dialog
        open={lightboxIndex !== null}
        onOpenChange={(isOpen) => !isOpen && setLightboxIndex(null)}
      >
        <DialogContent className="max-w-4xl w-[95vw] p-2 sm:p-4 bg-background/95 backdrop-blur-md border border-border shadow-2xl rounded-xl z-50">
          <DialogTitle className="sr-only">Visualizador de Fotos da Amostra</DialogTitle>

          {lightboxIndex !== null && images[lightboxIndex] && (
            <div className="flex flex-col gap-3">
              {/* Header do Lightbox */}
              <div className="flex items-center justify-between px-2 pt-1 border-b pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-semibold text-xs text-primary border-primary/30">
                    Foto {lightboxIndex + 1} de {images.length}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    asChild
                  >
                    <a
                      href={images[lightboxIndex]}
                      target="_blank"
                      rel="noreferrer"
                      download={`amostra-foto-${lightboxIndex + 1}.jpg`}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Baixar</span>
                    </a>
                  </Button>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                      onClick={(e) => handleRemoveImage(lightboxIndex, e)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Remover</span>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => setLightboxIndex(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Área Central da Foto Ampliada */}
              <div className="relative flex items-center justify-center min-h-[300px] max-h-[70vh] bg-black/5 dark:bg-black/40 rounded-lg overflow-hidden p-1">
                <img
                  src={images[lightboxIndex]}
                  alt={`Amostra Foto ${lightboxIndex + 1}`}
                  className="max-h-[68vh] w-auto max-w-full object-contain rounded select-none shadow-sm"
                />

                {/* Botão Anterior */}
                {images.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex((prev) =>
                        prev !== null ? (prev > 0 ? prev - 1 : images.length - 1) : null
                      );
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full shadow-lg transition-all focus:outline-none"
                    title="Foto anterior"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}

                {/* Botão Próximo */}
                {images.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex((prev) =>
                        prev !== null ? (prev < images.length - 1 ? prev + 1 : 0) : null
                      );
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full shadow-lg transition-all focus:outline-none"
                    title="Próxima foto"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* Faixa de Miniaturas no Rodapé do Lightbox */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto p-1.5 justify-center custom-scrollbar">
                  {images.map((thumb, tIdx) => (
                    <button
                      key={tIdx}
                      type="button"
                      onClick={() => setLightboxIndex(tIdx)}
                      className={`h-12 w-12 rounded overflow-hidden border-2 transition-all shrink-0 ${
                        tIdx === lightboxIndex
                          ? "border-primary ring-2 ring-primary/30 scale-105"
                          : "border-transparent opacity-60 hover:opacity-100"
                      }`}
                    >
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
