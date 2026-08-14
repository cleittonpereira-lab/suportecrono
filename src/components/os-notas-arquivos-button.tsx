import { useState } from "react";
import { FolderOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OsArquivosPanel } from "@/components/os-arquivos-panel";

export function OsNotasArquivosButton({
  os,
  variant = "pill",
  className = "",
}: {
  os?: string;
  variant?: "pill" | "button";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!os) return null;

  const trigger =
    variant === "button" ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-accent-foreground ${className}`}
        title="Notas & arquivos da OS"
      >
        <FolderOpen className="h-3 w-3" /> Notas
      </button>
    ) : (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-accent-foreground ${className}`}
        title="Notas & arquivos da OS"
      >
        <FolderOpen className="h-2.5 w-2.5" /> Notas
      </button>
    );

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-4xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Notas & arquivos — OS {os}
            </DialogTitle>
          </DialogHeader>
          <OsArquivosPanel os={os} />
        </DialogContent>
      </Dialog>
    </>
  );
}