import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { updateScheduleRow, type ScheduleRow } from "@/lib/sheets.functions";
import {
  splitSetores,
  splitEscopo,
  joinEscopo,
  ESCOPO_TAGS,
  type EscopoTag,
} from "@/lib/schedule-utils";
import { ESCOPO_TONE } from "@/components/escopo-badges";

const SETOR_TAGS = ["Convencionais", "Especiais", "Dosagem"] as const;
const SETOR_TONE: Record<string, string> = {
  Convencionais:
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800",
  Especiais:
    "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-800",
  Dosagem:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800",
};

interface Props {
  row: ScheduleRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditOsDialog({ row, open, onOpenChange }: Props) {
  const [dataPostagem, setDataPostagem] = useState("");
  const [dataEntrega, setDataEntrega] = useState("");
  const [setores, setSetores] = useState<string[]>([]);
  const [setorExtra, setSetorExtra] = useState("");
  const [laboratorio, setLaboratorio] = useState("");
  const [escopoTags, setEscopoTags] = useState<EscopoTag[]>([]);
  const [escopoExtra, setEscopoExtra] = useState("");

  useEffect(() => {
    if (row) {
      setDataPostagem(row.dataPostagem ?? "");
      setDataEntrega(row.dataEntrega ?? "");
      const parts = splitSetores(row.setor ?? "");
      const known = parts.filter((p) => (SETOR_TAGS as readonly string[]).includes(p));
      const extra = parts.filter((p) => !(SETOR_TAGS as readonly string[]).includes(p));
      setSetores(known);
      setSetorExtra(extra.join(" / "));
      setLaboratorio(row.laboratorio ?? "");
      const { tags, extras } = splitEscopo(row.escopo ?? "");
      setEscopoTags(tags);
      setEscopoExtra(extras.join(" / "));
    }
  }, [row]);

  const updateFn = useServerFn(updateScheduleRow);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error("Sem linha");
      return updateFn({
        data: {
          rowIndex: row.rowIndex,
          dataPostagem,
          dataEntrega,
          setor: [
            ...setores,
            ...(setorExtra.trim() ? [setorExtra.trim()] : []),
          ].join(" / "),
          laboratorio,
          escopo: joinEscopo(
            escopoTags,
            escopoExtra.trim() ? [escopoExtra.trim()] : [],
          ),
        },
      });
    },
    onSuccess: async () => {
      toast.success("OS atualizada na planilha");
      await qc.invalidateQueries({ queryKey: ["schedule"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Falha ao salvar", { description: err.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="space-y-1.5">
              <DialogTitle>Editar OS</DialogTitle>
              <DialogDescription>
                Altere os dados abaixo. As mudanças serão gravadas direto na
                planilha do Google Sheets.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !row}
              >
                {mutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar alterações
              </Button>
            </div>
          </div>
        </DialogHeader>

        {row && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <span className="font-semibold text-sm">{row.tomador}</span>
              {row.os && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  OS {row.os}
                </Badge>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                Linha {row.rowIndex}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dataPostagem">Data postagem</Label>
                <Input
                  id="dataPostagem"
                  placeholder="dd/mm/aaaa"
                  value={dataPostagem}
                  onChange={(e) => setDataPostagem(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dataEntrega">Data entrega</Label>
                <Input
                  id="dataEntrega"
                  placeholder="dd/mm/aaaa"
                  value={dataEntrega}
                  onChange={(e) => setDataEntrega(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="setor">Setor</Label>
              <div className="flex flex-wrap gap-2">
                {SETOR_TAGS.map((t) => {
                  const active = setores.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setSetores((cur) =>
                          cur.includes(t)
                            ? cur.filter((x) => x !== t)
                            : [...cur, t],
                        )
                      }
                      className={`text-xs font-semibold rounded-md border px-3 py-1.5 transition ${
                        active
                          ? SETOR_TONE[t]
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <Input
                placeholder="Outro setor (opcional)"
                value={setorExtra}
                onChange={(e) => setSetorExtra(e.target.value)}
                className="mt-2"
              />
              <p className="text-[10px] text-muted-foreground">
                Selecione uma ou mais tags. Será salvo como{" "}
                <code className="font-mono">Convencionais / Especiais</code>.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="laboratorio">Laboratório (coluna F)</Label>
              <Textarea
                id="laboratorio"
                rows={3}
                value={laboratorio}
                onChange={(e) => setLaboratorio(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Escopo (coluna P)</Label>
              <div className="flex flex-wrap gap-2">
                {ESCOPO_TAGS.map((t) => {
                  const active = escopoTags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setEscopoTags((cur) =>
                          cur.includes(t)
                            ? cur.filter((x) => x !== t)
                            : [...cur, t],
                        )
                      }
                      className={`text-xs font-semibold rounded-md border px-3 py-1.5 transition ${
                        active
                          ? ESCOPO_TONE[t]
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <Input
                placeholder="Outro ensaio / escopo (opcional)"
                value={escopoExtra}
                onChange={(e) => setEscopoExtra(e.target.value)}
                className="mt-2"
              />
              <p className="text-[10px] text-muted-foreground">
                Selecione um ou mais ensaios. Será salvo na coluna P da planilha
                separado por <code className="font-mono">/</code>.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}