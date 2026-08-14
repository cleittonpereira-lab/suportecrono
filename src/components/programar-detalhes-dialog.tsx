import { useMemo, useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { updateRow } from "@/lib/programacao.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FlaskConical, CheckCircle2 } from "lucide-react";

type Amostra = { id: string; codigo_amostra: string | null };
type Ensaio = {
  id: string;
  amostra_id: string;
  tipo_ensaio_id: string;
  observacoes?: string | null;
  detalhes_tecnicos?: string | null;
};
type TipoEnsaio = { id: string; nome: string; cor_gantt: string | null };
type Programacao = { id: string; ensaio_id: string };

export function ProgramarDetalhesDialog({
  open,
  onOpenChange,
  os,
  amostras,
  ensaios,
  tipos,
  ensaiosSheet,
  programacoes = [],
  progsSheet,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  os: string;
  amostras: Amostra[];
  ensaios: Ensaio[];
  tipos: TipoEnsaio[];
  ensaiosSheet: string;
  programacoes?: Programacao[];
  progsSheet?: string;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateRow);

  const [tipoId, setTipoId] = useState<string>("");
  const [detalhes, setDetalhes] = useState<string>("");
  const [modo, setModo] = useState<"todas" | "especificas">("todas");
  const [sel, setSel] = useState<Set<string>>(new Set());

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setTipoId("");
      setDetalhes("");
      setModo("todas");
      setSel(new Set());
    }
  }, [open]);

  const tipoById = useMemo(() => new Map(tipos.map((t) => [t.id, t])), [tipos]);
  const amostraById = useMemo(() => new Map(amostras.map((a) => [a.id, a])), [amostras]);

  // Ensaios da OS agrupados por tipo
  const ensaiosOs = useMemo(
    () => ensaios.filter((e) => amostraById.has(e.amostra_id)),
    [ensaios, amostraById],
  );

  // Tipos presentes nesta OS
  const tiposDaOs = useMemo(() => {
    const set = new Set<string>();
    for (const e of ensaiosOs) set.add(e.tipo_ensaio_id);
    return Array.from(set)
      .map((id) => tipoById.get(id))
      .filter((t): t is TipoEnsaio => !!t)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [ensaiosOs, tipoById]);

  const progByEnsaio = useMemo(
    () => new Map(programacoes.map((p) => [p.ensaio_id, p])),
    [programacoes],
  );

  // Ensaios desse tipo, separando os pendentes (sem observação) e configurados
  const { pendentes, configurados } = useMemo(() => {
    const pend: Array<{ ensaio: Ensaio; amostra: Amostra }> = [];
    const conf: Array<{ ensaio: Ensaio; amostra: Amostra }> = [];
    if (!tipoId) return { pendentes: pend, configurados: conf };
    for (const e of ensaiosOs) {
      if (e.tipo_ensaio_id !== tipoId) continue;
      const a = amostraById.get(e.amostra_id);
      if (!a) continue;
      const cur = (e.observacoes ?? e.detalhes_tecnicos ?? "").trim();
      if (cur) conf.push({ ensaio: e, amostra: a });
      else pend.push({ ensaio: e, amostra: a });
    }
    const sortFn = (x: { amostra: Amostra }, y: { amostra: Amostra }) =>
      (x.amostra.codigo_amostra || "").localeCompare(y.amostra.codigo_amostra || "");
    pend.sort(sortFn);
    conf.sort(sortFn);
    return { pendentes: pend, configurados: conf };
  }, [ensaiosOs, tipoId, amostraById]);

  // Ao trocar tipo, marcar todos pendentes por padrão
  useEffect(() => {
    setSel(new Set(pendentes.map((p) => p.ensaio.id)));
  }, [tipoId, pendentes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const alvoIds = useMemo(() => {
    if (modo === "todas") {
      // Aplica em TODOS os ensaios deste tipo na OS (pendentes + já configurados).
      // O texto novo sobrescreve o anterior — foi isso que o usuário confirmou.
      return [...pendentes, ...configurados].map((p) => p.ensaio.id);
    }
    return pendentes.filter((p) => sel.has(p.ensaio.id)).map((p) => p.ensaio.id);
  }, [modo, sel, pendentes, configurados]);

  const mut = useMutation({
    mutationFn: async () => {
      let ok = 0;
      for (const id of alvoIds) {
        await updateFn({
          data: { sheet: ensaiosSheet, id, patch: { observacoes: detalhes } },
        });
        // Espelha a observação também na Programação vinculada (se existir).
        const p = progByEnsaio.get(id);
        if (p && progsSheet) {
          try {
            await updateFn({
              data: { sheet: progsSheet, id: p.id, patch: { observacoes: detalhes } },
            });
          } catch { /* ignora falha do espelho */ }
        }
        ok++;
      }
      return ok;
    },
    onSuccess: (n) => {
      toast.success(`Observações aplicadas a ${n} ensaio(s)`);
      qc.invalidateQueries({ queryKey: ["ensaios"] });
      qc.invalidateQueries({ queryKey: ["programacoes"] });
      qc.invalidateQueries({ queryKey: ["programacoes_full"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const canSubmit = tipoId && detalhes.trim().length > 0 && alvoIds.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Programar observações do ensaio — OS {os}
          </DialogTitle>
          <DialogDescription>
            Defina as observações técnicas e aplique de uma vez para várias amostras.
            {progsSheet ? " O texto é espelhado na programação do Gantt." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo de ensaio */}
          <div>
            <Label>Tipo de ensaio *</Label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um ensaio..." />
              </SelectTrigger>
              <SelectContent>
                {tiposDaOs.length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground">
                    Nenhum ensaio cadastrado nesta OS.
                  </div>
                ) : (
                  tiposDaOs.map((t) => {
                    const count = ensaiosOs.filter((e) => e.tipo_ensaio_id === t.id).length;
                    return (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          {t.cor_gantt && (
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.cor_gantt }} />
                          )}
                          {t.nome}
                          <span className="text-muted-foreground text-xs">({count})</span>
                        </span>
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Detalhes */}
          <div>
            <Label>Observações técnicas *</Label>
            <Textarea
              value={detalhes}
              onChange={(e) => setDetalhes(e.target.value)}
              placeholder="Ex: Degraus de carga: 25, 50, 100, 200, 400 kPa. Duração: 24h por estágio."
              rows={4}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Este texto é gravado no campo "observações" de cada ensaio selecionado e sincronizado com a programação do Gantt.
            </p>
          </div>

          {/* Abrangência */}
          {tipoId && (
            <div>
              <Label>Aplicar para</Label>
              <RadioGroup value={modo} onValueChange={(v) => setModo(v as any)} className="mt-2 space-y-2">
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="todas" id="modo-todas" className="mt-0.5" />
                  <label htmlFor="modo-todas" className="text-sm cursor-pointer">
                    Todas as amostras deste ensaio ({pendentes.length + configurados.length})
                    <span className="block text-[11px] text-muted-foreground">
                      Aplica em todos os ensaios deste tipo nesta OS
                      {configurados.length > 0
                        ? ` — sobrescreve as ${configurados.length} já configurada(s).`
                        : "."}
                    </span>
                  </label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="especificas" id="modo-esp" className="mt-0.5" />
                  <label htmlFor="modo-esp" className="text-sm cursor-pointer">
                    Selecionar amostras específicas
                  </label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Lista de checkboxes */}
          {tipoId && modo === "especificas" && (
            <div className="rounded-md border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="sel-all"
                    checked={pendentes.length > 0 && sel.size === pendentes.length}
                    onCheckedChange={(c) => {
                      if (c) setSel(new Set(pendentes.map((p) => p.ensaio.id)));
                      else setSel(new Set());
                    }}
                  />
                  <label htmlFor="sel-all" className="text-xs font-medium cursor-pointer">
                    Selecionar todos ({sel.size}/{pendentes.length})
                  </label>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                {pendentes.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic p-2">
                    Nenhuma amostra pendente — todas já foram configuradas.
                  </p>
                ) : (
                  pendentes.map(({ ensaio, amostra }) => (
                    <label
                      key={ensaio.id}
                      className="flex items-center gap-2 rounded px-2 py-1 hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={sel.has(ensaio.id)}
                        onCheckedChange={(c) => {
                          setSel((prev) => {
                            const next = new Set(prev);
                            if (c) next.add(ensaio.id);
                            else next.delete(ensaio.id);
                            return next;
                          });
                        }}
                      />
                      <span className="text-sm">{amostra.codigo_amostra || "sem código"}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Amostras já configuradas (informativo) */}
          {tipoId && configurados.length > 0 && (
            <details className="rounded-md border bg-muted/30 p-2">
              <summary className="cursor-pointer text-xs text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                {configurados.length} amostra(s) já configurada(s) — ocultas da lista
              </summary>
              <div className="mt-2 flex flex-wrap gap-1">
                {configurados.map(({ ensaio, amostra }) => (
                  <Badge key={ensaio.id} variant="secondary" className="text-[10px]">
                    {amostra.codigo_amostra || "—"}
                  </Badge>
                ))}
              </div>
            </details>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!canSubmit || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? "Aplicando..." : `Confirmar programação (${alvoIds.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}