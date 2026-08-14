import { ENSAIO_TAG, type EnsaioTipo } from "@/features/lab/types";
import { cn } from "@/lib/utils";

/**
 * Etiqueta colorida (tag) que identifica o tipo de ensaio de forma
 * compacta em listas: ADENS, TRI.CIDsat, TRI.CIDnat, TRI.CIU, etc.
 */
export function EnsaioTag({
  tipo,
  className,
}: {
  tipo: EnsaioTipo;
  className?: string;
}) {
  const info = ENSAIO_TAG[tipo];
  if (!info) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none tracking-wide",
        info.className,
        className,
      )}
    >
      {info.code}
    </span>
  );
}