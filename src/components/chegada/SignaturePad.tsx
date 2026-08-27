/**
 * Campo de assinatura por toque/mouse — canvas simples, sem biblioteca
 * externa. `onChange` recebe a assinatura como PNG data URL (fundo
 * transparente) sempre que o traçado muda, ou `null` quando limpa.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

function getPos(canvas: HTMLCanvasElement, e: MouseEvent | TouchEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const point = "touches" in e ? e.touches[0] ?? (e as TouchEvent).changedTouches[0] : (e as MouseEvent);
  return {
    x: ((point.clientX - rect.left) / rect.width) * canvas.width,
    y: ((point.clientY - rect.top) / rect.height) * canvas.height,
  };
}

export function SignaturePad({
  onChange,
  height = 160,
}: {
  onChange: (dataUrl: string | null) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1e293b";
    };
    resize();

    let lastX = 0;
    let lastY = 0;

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      drawingRef.current = true;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const point = "touches" in e ? e.touches[0] : (e as MouseEvent);
      lastX = ((point.clientX - rect.left) / rect.width) * canvas.width / dpr;
      lastY = ((point.clientY - rect.top) / rect.height) * canvas.height / dpr;
    };
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const point = "touches" in e ? e.touches[0] : (e as MouseEvent);
      const x = ((point.clientX - rect.left) / rect.width) * canvas.width / dpr;
      const y = ((point.clientY - rect.top) / rect.height) * canvas.height / dpr;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
      lastX = x;
      lastY = y;
      hasDrawnRef.current = true;
      setEmpty(false);
    };
    const end = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      if (hasDrawnRef.current) onChange(canvas.toDataURL("image/png"));
    };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);

    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function limpar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="space-y-1.5">
      <div className="relative rounded-md border-2 border-dashed border-border bg-white" style={{ height }}>
        <canvas ref={canvasRef} className="w-full h-full touch-none cursor-crosshair rounded-md" />
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground pointer-events-none">
            Assine aqui com o dedo ou o mouse
          </div>
        )}
      </div>
      <Button type="button" size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={limpar} disabled={empty}>
        <Eraser className="h-3.5 w-3.5" /> Limpar assinatura
      </Button>
    </div>
  );
}
