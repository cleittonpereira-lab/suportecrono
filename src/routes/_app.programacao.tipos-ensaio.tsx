import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { FlaskConical } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listRows, insertRow, updateRow, deleteRow, ensureColumns } from "@/lib/programacao.functions";
import { useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Link2, X, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { equipColor } from "@/lib/equip-colors";
import { ENSAIO_DISPONIVEL, ENSAIO_LABEL, ENSAIO_TAG, type EnsaioTipo } from "@/features/lab/types";

type Tipo = {
  id: string;
  nome: string;
  codigo: string | null;
  categoria: string | null;
  equipamentos_ids: string[];
  tempo_medio_h: number | null;
  tempo_min_h: number | null;
  tempo_max_h: number | null;
  tempo_preparacao_h: number | null;
  tempo_desmontagem_h: number | null;
  permite_paralelo: boolean;
  cor_gantt: string | null;
  observacoes: string | null;
  /**
   * Qual editor/relatório este tipo de ensaio abre (ex.: "cisalhamento-direto",
   * "triaxial-uu"). Autoritativo: quando definido, a Central de Processamento
   * usa isso em vez de adivinhar pelo nome/sigla — evita um "TRI4.UU" cair
   * na fila errada por causa de uma sigla fora do padrão.
   */
  tipo_relatorio: EnsaioTipo | null;
};
type Dep = { id: string; tipo_predecessor_id: string; tipo_sucessor_id: string };

const SHEET_TIPOS = "Tipos de Ensaio";
const SHEET_DEPS = "Dependências";
const SHEET_EQUIPS = "Equipamentos";

const numOrNull = (s: string) => (s ? Number(s) : null);
const boolFrom = (s: string) => s?.toUpperCase() === "TRUE";

function parseTipo(r: Record<string, string>): Tipo {
  return {
    id: r.id,
    nome: r.nome ?? "",
    codigo: r.codigo || null,
    categoria: r.categoria || null,
    equipamentos_ids: (r.equipamentos_ids || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    tempo_medio_h: numOrNull(r.tempo_medio_h),
    tempo_min_h: numOrNull(r.tempo_min_h),
    tempo_max_h: numOrNull(r.tempo_max_h),
    tempo_preparacao_h: numOrNull(r.tempo_preparacao_h),
    tempo_desmontagem_h: numOrNull(r.tempo_desmontagem_h),
    permite_paralelo: boolFrom(r.permite_paralelo),
    cor_gantt: r.cor_gantt || null,
    observacoes: r.observacoes || null,
    tipo_relatorio: (r.tipo_relatorio as EnsaioTipo) || null,
  };
}

export const Route = createFileRoute("/_app/programacao/tipos-ensaio")({
  component: TiposEnsaioPage,
});

function TiposEnsaioPage() {
  const qc = useQueryClient();

  useEffect(() => {
    ensureColumns({ data: { sheet: SHEET_TIPOS, columns: ["equipamentos_ids", "tipo_relatorio"] } }).catch(() => {});
  }, []);

  const { data: tipos = [] } = useQuery({
    queryKey: ["tipos_ensaio"],
    queryFn: async () => {
      const rows = await listRows({ data: { sheet: SHEET_TIPOS } });
      return rows.map(parseTipo).sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
  const { data: equipamentos = [] } = useQuery({
    queryKey: ["equipamentos"],
    queryFn: async () => {
      const rows = await listRows({ data: { sheet: SHEET_EQUIPS } });
      return rows
        .map((r) => ({ id: r.id, nome: r.nome ?? "" }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
  const { data: deps = [] } = useQuery({
    queryKey: ["tipos_ensaio_deps"],
    queryFn: async () => {
      const rows = await listRows({ data: { sheet: SHEET_DEPS } });
      return rows.map((r) => ({
        id: r.id,
        tipo_predecessor_id: r.tipo_predecessor_id,
        tipo_sucessor_id: r.tipo_sucessor_id,
      })) as Dep[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tipo | null>(null);
  const [depOpen, setDepOpen] = useState<Tipo | null>(null);
  const [listEdit, setListEdit] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Partial<Tipo>>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const setDraft = (id: string, k: keyof Tipo, v: any) =>
    setDrafts((p) => ({ ...p, [id]: { ...(p[id] ?? {}), [k]: v } }));
  const draftOf = (t: Tipo, k: keyof Tipo) => {
    const d = drafts[t.id]?.[k];
    return d !== undefined ? d : (t[k] as any);
  };

  const upsert = useMutation({
    mutationFn: async (p: Partial<Tipo>) => {
      const payload: Record<string, unknown> = { ...p };
      if (Array.isArray((p as Tipo).equipamentos_ids)) {
        payload.equipamentos_ids = (p as Tipo).equipamentos_ids.join(",");
      }
      if (editing) {
        await updateRow({ data: { sheet: SHEET_TIPOS, id: editing.id, patch: payload } });
      } else {
        // Impede a criação de tipos duplicados por nome ou código
        // (case-insensitive, ignorando espaços).
        const norm = (s: unknown) =>
          String(s ?? "").trim().toUpperCase();
        const newNome = norm(payload.nome);
        const newCod = norm(payload.codigo);
        const clash = tipos.find(
          (t) =>
            (newNome && norm(t.nome) === newNome) ||
            (newCod && norm(t.codigo) === newCod),
        );
        if (clash) {
          throw new Error(
            `Já existe um tipo com esse nome/código: ${clash.nome}${clash.codigo ? ` (${clash.codigo})` : ""}`,
          );
        }
        await insertRow({ data: { sheet: SHEET_TIPOS, row: payload } });
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Tipo atualizado" : "Tipo criado");
      qc.invalidateQueries({ queryKey: ["tipos_ensaio"] });
      setOpen(false); setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const patchRow = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      await updateRow({ data: { sheet: SHEET_TIPOS, id, patch } });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["tipos_ensaio"] });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      toast.success("Atualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await deleteRow({ data: { sheet: SHEET_TIPOS, id } });
    },
    onSuccess: () => {
      toast.success("Tipo removido");
      qc.invalidateQueries({ queryKey: ["tipos_ensaio"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const bulkDel = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await deleteRow({ data: { sheet: SHEET_TIPOS, id } });
      }
    },
    onSuccess: (_d, ids) => {
      toast.success(`${ids.length} tipo(s) removido(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["tipos_ensaio"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover em lote"),
  });

  const equipMap = new Map(equipamentos.map((e) => [e.id, e.nome]));
  const tipoMap = new Map(tipos.map((t) => [t.id, t.nome]));

  return (
    <div className="space-y-6 w-full">
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <PageHeader
          eyebrow="Programação · Cadastro"
          icon={FlaskConical}
          title="Tipos de ensaio"
          description="Catálogo de ensaios, com tempos padrão, cor no Gantt e dependências."
          actions={
            <>
          <div className="flex items-center gap-2">
            {listEdit && selected.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                disabled={bulkDel.isPending}
                onClick={() => {
                  if (confirm(`Remover ${selected.size} tipo(s) selecionado(s)?`))
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
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" /> Novo tipo</Button>
            </DialogTrigger>
          </div>
            </>
          }
        />
          <TipoForm
            key={editing?.id ?? "new"}
            tipo={editing}
            equipamentos={equipamentos}
            onSubmit={(p) => upsert.mutate(p)}
            loading={upsert.isPending}
          />
        </Dialog>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {tipos.length} tipo{tipos.length === 1 ? "" : "s"} de ensaio
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tipos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum tipo cadastrado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {listEdit && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selected.size > 0 && selected.size === tipos.length}
                        onCheckedChange={(v) => {
                          if (v) setSelected(new Set(tipos.map((t) => t.id)));
                          else setSelected(new Set());
                        }}
                        aria-label="Selecionar todos"
                      />
                    </TableHead>
                  )}
                  {listEdit && <TableHead className="w-10" />}
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo de Relatório</TableHead>
                  <TableHead>Equipamentos</TableHead>
                  <TableHead>Paralelo</TableHead>
                  <TableHead>Cor</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tipos.map((t) => (
                  <TableRow key={t.id} className={selected.has(t.id) ? "bg-destructive/5" : ""}>
                    {listEdit && (
                      <TableCell className="p-1">
                        <Checkbox
                          checked={selected.has(t.id)}
                          onCheckedChange={() => toggleSel(t.id)}
                          aria-label={`Selecionar ${t.nome}`}
                        />
                      </TableCell>
                    )}
                    {listEdit && (
                      <TableCell className="p-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() => { if (confirm(`Remover ${t.nome}?`)) del.mutate(t.id); }}
                          title="Excluir linha"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                    <TableCell className="font-medium">
                      {listEdit ? (
                        <Input
                          value={(draftOf(t, "nome") as string) ?? ""}
                          onChange={(e) => setDraft(t.id, "nome", e.target.value)}
                          onBlur={() => {
                            const v = drafts[t.id]?.nome;
                            if (v !== undefined && v !== t.nome) {
                              patchRow.mutate({ id: t.id, patch: { nome: v } });
                            }
                          }}
                          className="h-8"
                        />
                      ) : (
                        t.nome
                      )}
                    </TableCell>
                    <TableCell>
                      {listEdit ? (
                        <Input
                          value={(draftOf(t, "codigo") as string) ?? ""}
                          onChange={(e) => setDraft(t.id, "codigo", e.target.value || null)}
                          onBlur={() => {
                            const v = drafts[t.id]?.codigo;
                            if (v !== undefined && v !== t.codigo) {
                              patchRow.mutate({ id: t.id, patch: { codigo: v ?? "" } });
                            }
                          }}
                          className="h-8 w-32"
                        />
                      ) : (
                        t.codigo ?? "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {listEdit ? (
                        <Select
                          value={(draftOf(t, "tipo_relatorio") as string) ?? "__none__"}
                          onValueChange={(v) => {
                            const value = v === "__none__" ? null : (v as EnsaioTipo);
                            setDraft(t.id, "tipo_relatorio", value);
                            patchRow.mutate({ id: t.id, patch: { tipo_relatorio: value ?? "" } });
                          }}
                        >
                          <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Não mapeado</SelectItem>
                            {ENSAIO_DISPONIVEL.map((et) => (
                              <SelectItem key={et} value={et}>{ENSAIO_LABEL[et]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : t.tipo_relatorio ? (
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${ENSAIO_TAG[t.tipo_relatorio].className}`}
                        >
                          {ENSAIO_TAG[t.tipo_relatorio].code}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">— identifica por nome</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.equipamentos_ids.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {t.equipamentos_ids.map((id) => (
                            (() => {
                              const label = equipMap.get(id) ?? id;
                              const c = equipColor(label);
                              return (
                                <span
                                  key={id}
                                  className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold"
                                  style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
                                >
                                  {label}
                                </span>
                              );
                            })()
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.permite_paralelo
                        ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Sim</Badge>
                        : <Badge variant="secondary">Não</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-4 w-6 rounded border"
                          style={{ backgroundColor: t.cor_gantt ?? "#F0B43C" }}
                        />
                        <span className="text-xs text-muted-foreground">{t.cor_gantt}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => setDepOpen(t)}>
                        <Link2 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost"
                        onClick={() => { if (confirm(`Remover ${t.nome}?`)) del.mutate(t.id); }}>
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

      {depOpen && (
        <DependenciasDialog
          tipo={depOpen}
          tipos={tipos}
          deps={deps}
          tipoMap={tipoMap}
          onClose={() => setDepOpen(null)}
          onChange={() => qc.invalidateQueries({ queryKey: ["tipos_ensaio_deps"] })}
        />
      )}
    </div>
  );
}

function TipoForm({
  tipo, equipamentos, onSubmit, loading,
}: {
  tipo: Tipo | null;
  equipamentos: { id: string; nome: string }[];
  onSubmit: (p: Partial<Tipo>) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<Partial<Tipo>>(
    tipo ?? { permite_paralelo: false, cor_gantt: "#F0B43C", equipamentos_ids: [] },
  );
  const set = <K extends keyof Tipo>(k: K, v: Tipo[K] | null) =>
    setForm((f) => ({ ...f, [k]: v }));
  const selectedEquips = form.equipamentos_ids ?? [];
  const toggleEquip = (id: string) => {
    const has = selectedEquips.includes(id);
    setForm((f) => ({
      ...f,
      equipamentos_ids: has ? selectedEquips.filter((x) => x !== id) : [...selectedEquips, id],
    }));
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{tipo ? "Editar tipo de ensaio" : "Novo tipo de ensaio"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Nome *</Label>
          <Input value={form.nome ?? ""} onChange={(e) => set("nome", e.target.value)} />
        </div>
        <div>
          <Label>Código</Label>
          <Input value={form.codigo ?? ""} onChange={(e) => set("codigo", e.target.value || null)} />
        </div>
        <div>
          <Label>Tipo de Relatório</Label>
          <Select
            value={form.tipo_relatorio ?? "__none__"}
            onValueChange={(v) => set("tipo_relatorio", v === "__none__" ? null : (v as EnsaioTipo))}
          >
            <SelectTrigger><SelectValue placeholder="Não mapeado — identifica por nome" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Não mapeado (identifica por nome)</SelectItem>
              {ENSAIO_DISPONIVEL.map((et) => (
                <SelectItem key={et} value={et}>{ENSAIO_LABEL[et]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Qual laudo/editor este tipo abre na Central de Processamento. Se a
            sigla no cadastro (ex.: "TRI4.UU") não bater com o nome esperado,
            defina aqui pra identificar certo em vez de adivinhar pelo nome.
          </p>
        </div>
        <div className="col-span-2">
          <Label>Equipamentos compatíveis</Label>
          {equipamentos.length === 0 ? (
            <p className="text-xs text-muted-foreground mt-1">
              Nenhum equipamento cadastrado ainda.
            </p>
          ) : (
            <div className="mt-1 grid grid-cols-2 gap-2 rounded-md border p-3 max-h-48 overflow-auto">
              {equipamentos.map((e) => {
                const checked = selectedEquips.includes(e.id);
                return (
                  <label key={e.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={checked} onCheckedChange={() => toggleEquip(e.id)} />
                    <span>{e.nome}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-end gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={!!form.permite_paralelo}
              onCheckedChange={(v) => set("permite_paralelo", v)}
            />
            <Label className="cursor-pointer">Permite execução simultânea</Label>
          </div>
        </div>
        <div>
          <Label>Cor no Gantt</Label>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={form.cor_gantt ?? "#F0B43C"}
              onChange={(e) => set("cor_gantt", e.target.value)}
              className="h-9 w-14 rounded border cursor-pointer"
            />
            <Input
              value={form.cor_gantt ?? ""}
              onChange={(e) => set("cor_gantt", e.target.value || null)}
            />
          </div>
        </div>
        <div className="col-span-2">
          <Label>Observações</Label>
          <Textarea value={form.observacoes ?? ""} onChange={(e) => set("observacoes", e.target.value || null)} />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={!form.nome || loading} onClick={() => onSubmit(form)}>
          {loading ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DependenciasDialog({
  tipo, tipos, deps, tipoMap, onClose, onChange,
}: {
  tipo: Tipo;
  tipos: Tipo[];
  deps: Dep[];
  tipoMap: Map<string, string>;
  onClose: () => void;
  onChange: () => void;
}) {
  const [newPred, setNewPred] = useState<string>("");
  const myPreds = deps.filter((d) => d.tipo_sucessor_id === tipo.id);

  const add = useMutation({
    mutationFn: async () => {
      if (!newPred) return;
      await insertRow({
        data: {
          sheet: SHEET_DEPS,
          row: { tipo_predecessor_id: newPred, tipo_sucessor_id: tipo.id },
        },
      });
    },
    onSuccess: () => { setNewPred(""); onChange(); toast.success("Dependência adicionada"); },
    onError: (e: any) => toast.error(e.message),
  });
  const rm = useMutation({
    mutationFn: async (id: string) => {
      await deleteRow({ data: { sheet: SHEET_DEPS, id } });
    },
    onSuccess: () => { onChange(); toast.success("Removida"); },
  });

  const candidates = tipos.filter(
    (t) => t.id !== tipo.id && !myPreds.some((d) => d.tipo_predecessor_id === t.id),
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dependências de {tipo.nome}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Este ensaio só poderá iniciar depois que os predecessores abaixo estiverem concluídos.
        </p>
        <div className="space-y-2">
          {myPreds.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma dependência.</p>
          ) : (
            myPreds.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                <span>{tipoMap.get(d.tipo_predecessor_id) ?? d.tipo_predecessor_id}</span>
                <Button size="icon" variant="ghost" onClick={() => rm.mutate(d.id)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Select value={newPred} onValueChange={setNewPred}>
            <SelectTrigger><SelectValue placeholder="Adicionar predecessor..." /></SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!newPred || add.isPending} onClick={() => add.mutate()}>
            Adicionar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}