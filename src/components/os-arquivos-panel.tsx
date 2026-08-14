import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listOsFiles,
  uploadOsFile,
  deleteOsFile,
  getOsNotes,
  saveOsNotes,
  type DriveFile,
} from "@/lib/os-arquivos.functions";
import { Button } from "@/components/ui/button";
import {
  Paperclip,
  ExternalLink,
  Trash2,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  File as FileIcon,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { NotesEditor } from "@/components/notes-editor";
import { FileViewerDialog } from "@/components/file-viewer-dialog";

const ACCEPT = ".jpg,.jpeg,.png,.gif,.webp,.pdf,.xlsx,.xls,.docx,.doc,.csv,.txt";
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return <ImageIcon className="h-4 w-4" />;
  if (mime.includes("pdf")) return <FileText className="h-4 w-4" />;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv"))
    return <FileSpreadsheet className="h-4 w-4" />;
  if (mime.includes("word") || mime.includes("document")) return <FileText className="h-4 w-4" />;
  return <FileIcon className="h-4 w-4" />;
}

function fmtSize(s?: string) {
  if (!s) return "";
  const n = Number(s);
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const s = String(reader.result || "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    reader.readAsDataURL(file);
  });
}

export function OsArquivosPanel({ os }: { os: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listOsFiles);
  const uploadFn = useServerFn(uploadOsFile);
  const deleteFn = useServerFn(deleteOsFile);
  const getNotesFn = useServerFn(getOsNotes);
  const saveNotesFn = useServerFn(saveOsNotes);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSavedRef = useRef<string | null>(null);
  const notesRef = useRef("");
  const osRef = useRef(os);
  const saveFnRef = useRef(saveNotesFn);
  const [dragOver, setDragOver] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [viewerFile, setViewerFile] = useState<DriveFile | null>(null);
  // Uploads em andamento: preview local + status
  type Pending = { key: string; name: string; previewUrl: string | null; mime: string };
  const [pending, setPending] = useState<Pending[]>([]);

  const q = useQuery({
    queryKey: ["os-arquivos", os],
    queryFn: () => listFn({ data: { os } }),
    enabled: !!os,
    staleTime: 30_000,
    retry: false,
  });

  const notesQ = useQuery({
    queryKey: ["os-notas", os],
    queryFn: () => getNotesFn({ data: { os } }),
    enabled: !!os,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });

  useEffect(() => {
    setNotes("");
    notesRef.current = "";
    lastSavedRef.current = null;
    setNotesLoaded(false);
    setSaveState("idle");
  }, [os]);

  useEffect(() => {
    if (!notesQ.isSuccess) return;
    const serverNotes = notesQ.data?.notes || "";
    const hasUnsavedLocalChange =
      lastSavedRef.current !== null && lastSavedRef.current !== notesRef.current;

    if (!hasUnsavedLocalChange) {
      setNotes(serverNotes);
      notesRef.current = serverNotes;
      lastSavedRef.current = serverNotes;
    }
    setNotesLoaded(true);
  }, [notesQ.data?.notes, notesQ.isSuccess]);

  // Autosave debounced das notas
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    osRef.current = os;
  }, [os]);
  useEffect(() => {
    saveFnRef.current = saveNotesFn;
  }, [saveNotesFn]);

  const flushNotes = useCallback(async () => {
    const current = notesRef.current;
    const o = osRef.current;
    if (!o) return;
    if (lastSavedRef.current === current) return;
    try {
      setSaveState("saving");
      await saveFnRef.current({ data: { os: o, notes: current } });
      lastSavedRef.current = current;
      qc.setQueryData(["os-notas", o], { notes: current });
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (e: any) {
      setSaveState("idle");
      toast.error(e?.message ?? "Falha ao salvar notas");
    }
  }, [qc]);

  useEffect(() => {
    if (!notesLoaded || !os) return;
    if (lastSavedRef.current === notes) return;
    const t = setTimeout(() => {
      void flushNotes();
    }, 700);
    return () => clearTimeout(t);
  }, [notes, notesLoaded, os, flushNotes]);

  // Flush ao desmontar (fechar o dialog) ou sair da aba
  useEffect(() => {
    const onHide = () => {
      const current = notesRef.current;
      const o = osRef.current;
      if (lastSavedRef.current !== current && o) {
        lastSavedRef.current = current;
        qc.setQueryData(["os-notas", o], { notes: current });
        void saveFnRef.current({ data: { os: o, notes: current } }).catch((e: any) => {
          lastSavedRef.current = null;
          toast.error(e?.message ?? "Falha ao salvar notas");
        });
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("beforeunload", onHide);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      onHide();
    };
  }, [qc]);

  const del = useMutation({
    mutationFn: (fileId: string) => deleteFn({ data: { fileId } }),
    onSuccess: () => {
      toast.success("Arquivo removido");
      qc.invalidateQueries({ queryKey: ["os-arquivos", os] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover"),
  });

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      let ok = 0;
      for (const f of arr) {
        if (f.size > MAX_SIZE) {
          toast.error(`${f.name}: acima de 20MB`);
          continue;
        }
        const key = `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const isImg = f.type.startsWith("image/");
        const previewUrl = isImg ? URL.createObjectURL(f) : null;
        setPending((p) => [...p, { key, name: f.name, previewUrl, mime: f.type }]);
        try {
          const base64 = await fileToBase64(f);
          await uploadFn({
            data: {
              os,
              name: f.name,
              mimeType: f.type || "application/octet-stream",
              base64,
            },
          });
          ok++;
        } catch (e: any) {
          toast.error(`${f.name}: ${e?.message ?? "falha no upload"}`);
        } finally {
          setPending((p) => {
            const item = p.find((x) => x.key === key);
            if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
            return p.filter((x) => x.key !== key);
          });
        }
      }
      if (ok > 0) {
        qc.invalidateQueries({ queryKey: ["os-arquivos", os] });
      }
    },
    [os, uploadFn, qc],
  );

  // Suporta colar screenshot (Ctrl+V) enquanto o dialog está aberto
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs: File[] = [];
      for (const it of items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            const ext = (f.type.split("/")[1] || "png").replace("jpeg", "jpg");
            const named = new File([f], f.name || `print-${Date.now()}.${ext}`, { type: f.type });
            imgs.push(named);
          }
        }
      }
      if (imgs.length) {
        e.preventDefault();
        handleFiles(imgs);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFiles]);

  const files: DriveFile[] = (q.data?.files ?? []).filter(
    (f) => f.name !== "_notas.md",
  );
  const err = q.error as Error | null;
  const uploading = pending.length > 0;

  return (
    <div
      className="space-y-3"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
      }}
    >
      {/* Notas / observações da OS */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Notas da OS</span>
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            {saveState === "saving" ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> salvando…
              </>
            ) : saveState === "saved" ? (
              <>
                <Check className="h-3 w-3 text-green-600" /> salvo
              </>
            ) : notesLoaded ? (
              "auto-save"
            ) : null}
          </span>
        </div>
        <NotesEditor
          value={notes}
          onChange={setNotes}
          placeholder="Escreva observações, comentários, links, tensões, condições especiais..."
        />
        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 text-[11px] px-2"
            onClick={() => void flushNotes()}
            disabled={saveState === "saving" || lastSavedRef.current === notes}
            title="Salvar agora"
          >
            {saveState === "saving" ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Check className="h-3 w-3 mr-1" />
            )}
            Salvar
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 text-[11px] px-1.5"
            onClick={() => inputRef.current?.click()}
            title="Anexar arquivo — ou cole print (Ctrl+V) e arraste"
          >
            <Paperclip className="h-3.5 w-3.5 mr-1" /> Anexar
          </Button>
          {dragOver && (
            <span className="text-[11px] text-primary">solte para anexar…</span>
          )}
          {uploading && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> enviando {pending.length}…
            </span>
          )}
        </div>
      </div>

      {/* Prévias dos uploads pendentes (colar/arrastar) */}
      {pending.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {pending.map((p) => (
            <div key={p.key} className="relative rounded-md border overflow-hidden bg-muted/30">
              {p.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.previewUrl} alt={p.name} className="h-24 w-full object-cover opacity-80" />
              ) : (
                <div className="h-24 flex items-center justify-center text-muted-foreground">
                  {iconFor(p.mime)}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-background/40">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
              <div className="p-1 text-[10px] truncate" title={p.name}>{p.name}</div>
            </div>
          ))}
        </div>
      )}

      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {err.message}
        </div>
      )}

      {q.isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando arquivos...</p>
      ) : files.length === 0 && !err && !uploading ? (
        <p className="text-xs text-muted-foreground italic">Nenhum arquivo nesta pasta ainda.</p>
      ) : files.length > 0 ? (
        <>
          {q.data?.folderUrl && (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" asChild className="h-6 text-[11px]">
                <a href={q.data.folderUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" /> Abrir pasta no Drive
                </a>
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {files.map((f) => (
              <div key={f.id} className="group relative rounded-md border overflow-hidden bg-card">
                <button
                  type="button"
                  onClick={() => setViewerFile(f)}
                  className="block w-full text-left"
                >
                  {f.thumbnailLink ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.thumbnailLink}
                      alt={f.name}
                      className="h-24 w-full object-cover bg-muted"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-24 flex items-center justify-center bg-muted text-muted-foreground">
                      {iconFor(f.mimeType)}
                    </div>
                  )}
                  <div className="p-1.5">
                    <div className="flex items-center gap-1 text-[11px] font-medium truncate">
                      {iconFor(f.mimeType)}
                      <span className="truncate" title={f.name}>{f.name}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {fmtSize(f.size)}
                      {f.modifiedTime && ` • ${new Date(f.modifiedTime).toLocaleDateString("pt-BR")}`}
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    if (confirm(`Remover "${f.name}" do Drive?`)) del.mutate(f.id);
                  }}
                  className="absolute top-1 right-1 rounded-md bg-background/90 border p-1 opacity-0 group-hover:opacity-100 transition"
                  aria-label="Remover"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <FileViewerDialog
        file={viewerFile}
        open={!!viewerFile}
        onOpenChange={(v) => !v && setViewerFile(null)}
      />
    </div>
  );
}