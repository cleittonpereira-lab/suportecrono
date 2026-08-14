import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Wrench } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listRows, insertRow, updateRow, deleteRow } from "@/lib/programacao.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card, CardHeader, CardTitle, CardContent,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, ListChecks, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { equipColor } from "@/lib/equip-colors";

type Equipamento = {
  id: string;
  nome: string;
  codigo: string | null;
  tipo: string | null;
  fabricante: string | null;
  modelo: string | null;
  numero_serie: string | null;
  tempo_medio_ensaio_h: number | null;
  observacoes: string | null;
};

const SHEET = "Equipamentos";

function parseEquipamento(r: Record<string, string>): Equipamento {
  return {
    id: r.id,
    nome: r.nome ?? "",
    codigo: r.codigo || null,
    tipo: r.tipo || null,
    fabricante: r.fabricante || null,
    modelo: r.modelo || null,
    numero_serie: r.numero_serie || null,
    tempo_medio_ensaio_h: r.tempo_medio_ensaio_h ? Number(r.tempo_medio_ensaio_h) : null,
    observacoes: r.observacoes || null,
  };
}

export const Route = createFileRoute("/_app/programacao/equipamentos")({
  component: EquipamentosPage,
});

function EquipamentosPage() {
  const qc = useQueryClient();
  const { data: equipamentos = [], isLoading } = useQuery({
    queryKey: ["equipamentos"],
    queryFn: async () => {
      const rows = await listRows({ data: { sheet: SHEET } });
      return rows.map(parseEquipamento).sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Equipamento | null>(null);
  const [listEdit, setListEdit] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Partial<Equipamento>>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const draftOf = (eq: Equipamento, k: keyof Equipamento) => {
    const d = drafts[eq.id]?.[k];
    return d !== undefined ? (d as string | null) : (eq[k] as string | null);
  };
  const setDraft = (id: string, k: keyof Equipamento, v: string | null) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [k]: v } }));

  const upsert = useMutation({
    mutationFn: async (payload: Partial<Equipamento>) => {
      if (editing) {
        await updateRow({ data: { sheet: SHEET, id: editing.id, patch: payload as Record<string, unknown> } });
      } else {
        await insertRow({ data: { sheet: SHEET, row: payload as Record<string, unknown> } });
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Equipamento atualizado" : "Equipamento criado");
      qc.invalidateQueries({ queryKey: ["equipamentos"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  const patchRow = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      await updateRow({ data: { sheet: SHEET, id, patch } });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["equipamentos"] });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      toast.success("Atualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await deleteRow({ data: { sheet: SHEET, id } });
    },
    onSuccess: () => {
      toast.success("Equipamento removido");
      qc.invalidateQueries({ queryKey: ["equipamentos"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  const bulkDel = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await deleteRow({ data: { sheet: SHEET, id } });
      }
    },
    onSuccess: (_d, ids) => {
      toast.success(`${ids.length} equipamento(s) removido(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["equipamentos"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover em lote"),
  });

  return (
    <div className="space-y-6 w-full">
      <PageHeader
        eyebrow="Programação · Cadastro"
        icon={Wrench}
        title="Equipamentos"
        description="Cadastro dos equipamentos do laboratório utilizados na programação."
        actions={
          <>
          {listEdit && selected.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkDel.isPending}
              onClick={() => {
                if (confirm(`Remover ${selected.size} equipamento(s) selecionado(s)?`))
                  bulkDel.mutate(Array.from(selected));
              }}
            >
              <Trash2 className="h-4 w-4" /> Excluir {selected.size} selecionado(s)
            </Button>
          )}
          <Button
            size="sm"
            variant={listEdit ? "default" : "outline"}
            onClick={() => { setListEdit((v) => !v); setDrafts({}); setSelected(new Set()); }}
          >
            <ListChecks className="h-4 w-4" /> {listEdit ? "Concluir edição" : "Editar lista"}
          </Button>
          <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Novo equipamento
            </Button>
          </DialogTrigger>
          <EquipamentoForm
            key={editing?.id ?? "new"}
            equipamento={editing}
            onSubmit={(p) => upsert.mutate(p)}
            loading={upsert.isPending}
          />
          </Dialog>
          </>
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {equipamentos.length} equipamento{equipamentos.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : equipamentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum equipamento cadastrado ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {listEdit && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selected.size > 0 && selected.size === equipamentos.length}
                        onCheckedChange={(v) => {
                          if (v) setSelected(new Set(equipamentos.map((e) => e.id)));
                          else setSelected(new Set());
                        }}
                        aria-label="Selecionar todos"
                      />
                    </TableHead>
                  )}
                  {listEdit && <TableHead className="w-10" />}
                  <TableHead>Nome</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipamentos.map((eq) => (
                  <TableRow key={eq.id} data-selected={selected.has(eq.id) || undefined} className={selected.has(eq.id) ? "bg-destructive/5" : ""}>
                    {listEdit && (
                      <TableCell className="p-1">
                        <Checkbox
                          checked={selected.has(eq.id)}
                          onCheckedChange={() => toggleSel(eq.id)}
                          aria-label={`Selecionar ${eq.nome}`}
                        />
                      </TableCell>
                    )}
                    {listEdit && (
                      <TableCell className="p-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm(`Remover ${eq.nome}?`)) del.mutate(eq.id);
                          }}
                          title="Excluir linha"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      {listEdit ? (
                        <Input
                          value={(draftOf(eq, "nome") as string) ?? ""}
                          onChange={(e) => setDraft(eq.id, "nome", e.target.value)}
                          onBlur={() => {
                            const v = drafts[eq.id]?.nome;
                            if (v !== undefined && v !== eq.nome) {
                              patchRow.mutate({ id: eq.id, patch: { nome: v } });
                            }
                          }}
                          className="h-8"
                        />
                      ) : (
                        eq.nome
                      )}
                    </TableCell>
                    <TableCell>
                      {listEdit ? (
                        <Input
                          value={(draftOf(eq, "codigo") as string) ?? ""}
                          onChange={(e) => setDraft(eq.id, "codigo", e.target.value || null)}
                          onBlur={() => {
                            const v = drafts[eq.id]?.codigo;
                            if (v !== undefined && v !== eq.codigo) {
                              patchRow.mutate({ id: eq.id, patch: { codigo: v ?? "" } });
                            }
                          }}
                          className="h-8 w-32"
                        />
                      ) : (
                        eq.codigo ? (
                          <span
                            className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold"
                            style={{
                              backgroundColor: equipColor(eq.codigo).bg,
                              color: equipColor(eq.codigo).text,
                              borderColor: equipColor(eq.codigo).border,
                            }}
                          >
                            {eq.codigo}
                          </span>
                        ) : (
                          <span>—</span>
                        )
                      )}
                    </TableCell>
                    <TableCell>
                      {listEdit ? (
                        <Input
                          value={(draftOf(eq, "tipo") as string) ?? ""}
                          onChange={(e) => setDraft(eq.id, "tipo", e.target.value || null)}
                          onBlur={() => {
                            const v = drafts[eq.id]?.tipo;
                            if (v !== undefined && v !== eq.tipo) {
                              patchRow.mutate({ id: eq.id, patch: { tipo: v ?? "" } });
                            }
                          }}
                          className="h-8"
                        />
                      ) : (
                        eq.tipo ?? "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditing(eq);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remover ${eq.nome}?`)) del.mutate(eq.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EquipamentoForm({
  equipamento,
  onSubmit,
  loading,
}: {
  equipamento: Equipamento | null;
  onSubmit: (p: Partial<Equipamento>) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<Partial<Equipamento>>(equipamento ?? {});
  const set = <K extends keyof Equipamento>(k: K, v: Equipamento[K] | null) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {equipamento ? "Editar equipamento" : "Novo equipamento"}
        </DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Nome *</Label>
          <Input
            value={form.nome ?? ""}
            onChange={(e) => set("nome", e.target.value)}
          />
        </div>
        <div>
          <Label>Tag *</Label>
          <Input
            value={form.codigo ?? ""}
            placeholder="Ex.: AD-001, TR-002"
            onChange={(e) => set("codigo", e.target.value || null)}
          />
        </div>
        <div>
          <Label>Tipo</Label>
          <Input
            value={form.tipo ?? ""}
            placeholder="Ex.: Prensa, Edômetro, Triaxial"
            onChange={(e) => set("tipo", e.target.value || null)}
          />
        </div>
        <div>
          <Label>Fabricante</Label>
          <Input
            value={form.fabricante ?? ""}
            onChange={(e) => set("fabricante", e.target.value || null)}
          />
        </div>
        <div>
          <Label>Modelo</Label>
          <Input
            value={form.modelo ?? ""}
            onChange={(e) => set("modelo", e.target.value || null)}
          />
        </div>
        <div>
          <Label>Nº de série</Label>
          <Input
            value={form.numero_serie ?? ""}
            onChange={(e) => set("numero_serie", e.target.value || null)}
          />
        </div>
        <div>
          <Label>Tempo médio por ensaio (h)</Label>
          <Input
            type="number"
            value={form.tempo_medio_ensaio_h ?? ""}
            onChange={(e) =>
              set("tempo_medio_ensaio_h", e.target.value ? Number(e.target.value) : null)
            }
          />
        </div>
        <div className="col-span-2">
          <Label>Observações</Label>
          <Textarea
            value={form.observacoes ?? ""}
            onChange={(e) => set("observacoes", e.target.value || null)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!form.nome || loading}
          onClick={() => onSubmit(form)}
        >
          {loading ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}