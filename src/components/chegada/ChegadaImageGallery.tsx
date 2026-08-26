import React, { useState, useRef, useEffect, useCallback } from "react";
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
  FlipHorizontal,
  Check,
  Sparkles,
  RefreshCw,
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
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraFlash, setCameraFlash] = useState(false);
  const [sessionPhotosCount, setSessionPhotosCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Stop camera stream safely
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Start camera stream
  const startCameraStream = useCallback(async (facing: "environment" | "user") => {
    stopCameraStream();
    setCameraLoading(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Câmera direta não suportada pelo navegador.");
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraLoading(false);
    } catch (err: any) {
      console.warn("Could not start live camera, falling back to native file input:", err);
      setCameraLoading(false);
      stopCameraStream();
      setIsLiveCameraOpen(false);

      // Fallback para input nativo com capture
      if (cameraInputRef.current) {
        cameraInputRef.current.click();
      } else {
        toast.error("Não foi possível acessar a câmera: " + (err?.message || "Permissão negada."));
      }
    }
  }, [stopCameraStream]);

  // Open live camera modal
  const handleOpenLiveCamera = () => {
    setSessionPhotosCount(0);
    setIsLiveCameraOpen(true);
    startCameraStream(cameraFacing);
  };

  // Close live camera modal
  const handleCloseLiveCamera = () => {
    stopCameraStream();
    setIsLiveCameraOpen(false);
    if (sessionPhotosCount > 0) {
      toast.success(
        `${sessionPhotosCount} ${sessionPhotosCount === 1 ? "foto capturada" : "fotos capturadas"} com sucesso!`
      );
    }
  };

  // Switch between front and back camera
  const handleToggleCameraFacing = () => {
    const next = cameraFacing === "environment" ? "user" : "environment";
    setCameraFacing(next);
    startCameraStream(next);
  };

  // Capture frame from live video
  const handleCapturePhoto = () => {
    if (!videoRef.current || !onChange) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Trigger visual flash
    setCameraFlash(true);
    setTimeout(() => setCameraFlash(false), 200);

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL("image/jpeg", 0.85);

    if (base64Image) {
      onChange([...images, base64Image]);
      setSessionPhotosCount((prev) => prev + 1);
    }
  };

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

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

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxDim = 1280;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !onChange) return;

    const fileArray = Array.from(files);
    const validFiles = fileArray.filter((f) => {
      if (!f.type.startsWith("image/")) {
        toast.error(`O arquivo "${f.name}" não é uma imagem válida.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    try {
      const compressed = await Promise.all(validFiles.map(compressImage));
      onChange([...images, ...compressed]);
      toast.success(
        `${compressed.length} ${
          compressed.length === 1 ? "foto adicionada e otimizada" : "fotos adicionadas e otimizadas"
        } com sucesso!`
      );
    } catch {
      toast.error("Erro ao processar imagens.");
    }
  };

  const handleNativeCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
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
          {/* Botão Câmera Direta (Abre Visor de Câmera em Tempo Real) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenLiveCamera}
            className="gap-2 text-xs font-bold h-9 bg-primary/10 hover:bg-primary/20 border-primary/40 text-primary shadow-2xs transition-all flex-1 sm:flex-initial"
          >
            <Camera className="h-4 w-4 text-primary stroke-[2.5]" />
            <span>Tirar Foto (Câmera)</span>
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

          {/* Hidden File Inputs (Nativo com capture=environment estrito e galeria) */}
          <input
            type="file"
            ref={cameraInputRef}
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={handleNativeCameraCapture}
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
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2.5 p-2.5 bg-muted/20 rounded-lg border border-border/60">
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
              onClick={handleOpenLiveCamera}
              className="aspect-square rounded-md border-2 border-dashed border-primary/40 hover:border-primary bg-primary/5 hover:bg-primary/10 flex flex-col items-center justify-center text-primary cursor-pointer transition-all gap-1 p-2 text-center"
            >
              <Camera className="h-5 w-5 stroke-[2.5]" />
              <span className="text-[10px] font-bold leading-tight">+ Tirar Foto</span>
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
                Toque em <strong>"Tirar Foto"</strong> para abrir a câmera ou anexe imagens da galeria.
              </p>
            </div>
          </div>
        )
      )}

      {/* Modal de Câmera ao Vivo em Tela Cheia (Visor Direto com Botão de Disparo Rápido) */}
      <Dialog open={isLiveCameraOpen} onOpenChange={(open) => !open && handleCloseLiveCamera()}>
        <DialogContent className="max-w-md w-[96vw] p-3 sm:p-4 bg-black text-white border-0 shadow-2xl rounded-2xl z-50 overflow-hidden">
          <DialogTitle className="sr-only">Câmera de Amostras</DialogTitle>

          <div className="relative flex flex-col items-center justify-between min-h-[420px] max-h-[85vh] bg-black rounded-xl overflow-hidden">
            {/* Header da Câmera */}
            <div className="w-full flex items-center justify-between p-2 z-10 bg-gradient-to-b from-black/80 to-transparent">
              <Badge variant="outline" className="bg-black/60 text-white border-white/20 text-xs px-2.5 py-1">
                {sessionPhotosCount > 0 ? `${sessionPhotosCount} capturadas` : "Câmera ao Vivo"}
              </Badge>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleCameraFacing}
                  className="h-8 w-8 text-white bg-black/40 hover:bg-white/20 rounded-full"
                  title="Inverter Câmera (Frontal / Traseira)"
                >
                  <FlipHorizontal className="h-4 w-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleCloseLiveCamera}
                  className="h-8 w-8 text-white bg-black/40 hover:bg-white/20 rounded-full"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Visor do Vídeo da Câmera */}
            <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden bg-zinc-950">
              {cameraFlash && (
                <div className="absolute inset-0 bg-white z-20 animate-out fade-out duration-200 pointer-events-none" />
              )}

              {/*
                O <video> fica SEMPRE montado (nunca escondido atrás de um
                if/ternário) — senão, quando o stream da câmera chega
                (getUserMedia resolve depois de um tempo assíncrono),
                `videoRef.current` ainda é null porque o elemento não existe
                no DOM enquanto o spinner de carregamento está no lugar dele.
                O resultado era um vídeo nunca conectado ao stream: a
                permissão era concedida, mas a tela ficava preta.
                O spinner agora fica por cima, como overlay, sem desmontar o vídeo.
              */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover select-none"
              />

              {cameraLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70 bg-zinc-950">
                  <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-xs">Iniciando câmera...</span>
                </div>
              )}
            </div>

            {/* Barra de Controles Inferiores (Disparador de Fotos) */}
            <div className="w-full flex items-center justify-between px-6 py-4 z-10 bg-gradient-to-t from-black/90 to-transparent">
              <div className="w-12 text-left">
                {sessionPhotosCount > 0 && (
                  <div className="flex flex-col">
                    <span className="text-[10px] text-white/60">Total</span>
                    <span className="text-xs font-bold text-emerald-400">+{sessionPhotosCount}</span>
                  </div>
                )}
              </div>

              {/* Botão de Disparo Estilo Shutter */}
              <button
                type="button"
                onClick={handleCapturePhoto}
                disabled={cameraLoading}
                className="h-16 w-16 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:scale-90 transition-transform shadow-lg focus:outline-none"
                title="Tirar Foto"
              >
                <div className="h-12 w-12 rounded-full bg-white transition-colors" />
              </button>

              <div className="w-12 text-right">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCloseLiveCamera}
                  className="h-8 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 px-3 rounded-full"
                >
                  <Check className="h-3.5 w-3.5 mr-1" /> OK
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
