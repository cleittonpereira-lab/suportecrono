import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Beaker, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { labStore, useOS } from "@/features/lab/store";
import { ENSAIO_LABEL, type Amostra } from "@/features/lab/types";
import { EnsaioTag } from "@/features/lab/components/EnsaioTag";

export const Route = createFileRoute("/_app/relatorio/os/$osId/")({
  component: OSDetail,
});

function OSDetail() {
  const { osId } = Route.useParams();
  const os = useOS(osId);
  const navigate = useNavigate();
  const [dlgOpen, setDlgOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<Partial<Amostra>>({});

  if (!os) {
    return (
      <div className="px-6 py-6">
        <p className="text-sm text-muted-foreground">OS não encontrada.</p>
        <Button asChild variant="link"><Link to="/relatorio/os">← Voltar</Link></Button>
      </div>
    );
  }

  const set = (patch: Partial<typeof os>) => labStore.patchOS(os.id, patch);

  const abrirDialog = (base?: Partial<Amostra>) => {
    setForm(
      base ?? {
        reportNumber: `AM-${String(os.amostras.length + 1).padStart(2, "0")}`,
      },
    );
    setDlgOpen(true);
  };
  const salvarAmostra = () => {
    if (!form.reportNumber?.trim()) {
      toast.error("Informe o Nº da amostra.");
      return;
    }
    const am = labStore.addAmostra(os.id, form);
    setDlgOpen(false);
    toast.success("Amostra criada");
    if (am) {
      navigate({ to: "/relatorio/os/$osId/amostra/$amostraId", params: { osId: os.id, amostraId: am.id } });
    }
  };

  // Agrupa por (reportNumber || "" ) + "@@" + (depth || "")
  const grupos = useMemo(() => {
    const m = new Map<string, { key: string; reportNumber: string; depth: string; borehole?: string; amostras: Amostra[] }>();
    for (const a of os.amostras) {
      const rn = (a.reportNumber ?? "").trim();
      const dp = (a.depth ?? "").trim();
      const key = `${rn}@@${dp}`;
      const g = m.get(key);
      if (g) g.amostras.push(a);
      else m.set(key, { key, reportNumber: rn || "—", depth: dp, borehole: a.borehole, amostras: [a] });
    }
    return Array.from(m.values());
  }, [os.amostras]);

  const toggleGroup = (k: string) => setOpenGroups((s) => ({ ...s, [k]: !s[k] }));

  return (
    <div className="px-6 py-6">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/relatorio/os" search={{}} className="inline-flex items-center hover:text-foreground">
          <ArrowLeft className="mr-1 h-3 w-3" />
          Ordens de Serviço
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{os.numero}</span>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Identificação da OS</CardTitle>
          <CardDescription>Herdada por todas as amostras e relatórios desta OS.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Número da OS" value={os.numero} onChange={(v) => set({ numero: v })} />
          <Field label="Cliente" value={os.client ?? ""} onChange={(v) => set({ client: v })} />
          <Field label="Obra / Contrato" value={os.workNumber ?? ""} onChange={(v) => set({ workNumber: v })} />
          <Field label="Local" value={os.local ?? ""} onChange={(v) => set({ local: v })} />
          <Field label="Resp. Técnico" value={os.technicalResp ?? ""} onChange={(v) => set({ technicalResp: v })} />
          <Field label="Revisão" value={os.revision ?? ""} onChange={(v) => set({ revision: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-sm">Amostras</CardTitle>
            <CardDescription>
              {grupos.length} amostra{grupos.length === 1 ? "" : "s"} · {os.amostras.length} código{os.amostras.length === 1 ? "" : "s"}
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => abrirDialog()}>
            <Plus className="mr-1 h-3 w-3" />
            Nova amostra
          </Button>
        </CardHeader>
        <CardContent>
          {grupos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma amostra ainda. Clique em "Nova amostra" para começar.
            </p>
          ) : (
            <div className="divide-y">
              {grupos.map((g) => {
                const open = openGroups[g.key] ?? true;
                const totalEnsaios = g.amostras.reduce((s, a) => s + a.ensaios.length, 0);
                return (
                  <div key={g.key} className="py-2">
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.key)}
                      className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-accent"
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <Beaker className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{g.reportNumber}</span>
                      {g.depth && <span className="text-xs text-muted-foreground">· {g.depth} m</span>}
                      {g.borehole && <span className="text-xs text-muted-foreground">· {g.borehole}</span>}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {g.amostras.length} código{g.amostras.length === 1 ? "" : "s"} · {totalEnsaios} ensaio{totalEnsaios === 1 ? "" : "s"}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirDialog({
                            reportNumber: g.reportNumber === "—" ? "" : g.reportNumber,
                            depth: g.depth,
                            borehole: g.borehole,
                          });
                        }}
                        className="inline-flex h-6 items-center gap-1 rounded border border-border px-1.5 text-[10px] text-muted-foreground hover:bg-background"
                        title="Adicionar código a esta amostra"
                      >
                        <Plus className="h-3 w-3" />
                        código
                      </button>
                    </button>
                    {open && (
                      <div className="ml-6 mt-1 divide-y">
                        {g.amostras.map((a) => (
                          <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                            <Link
                              to="/relatorio/os/$osId/amostra/$amostraId"
                              params={{ osId: os.id, amostraId: a.id }}
                              search={{}}
                              className="min-w-0 flex-1"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs">{a.code || "sem código"}</span>
                                {a.description && (
                                  <span className="truncate text-xs text-muted-foreground">— {a.description}</span>
                                )}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {a.ensaios.length === 0 ? (
                                  <Badge variant="outline" className="text-[9px]">sem ensaios</Badge>
                                ) : (
                                  a.ensaios.map((e) => (
                                    <span key={e.id} className="inline-flex items-center gap-1">
                                      <EnsaioTag tipo={e.tipo} />
                                      <Badge variant="outline" className="text-[9px]">{e.status}</Badge>
                                    </span>
                                  ))
                                )}
                                {a.photos.length > 0 && (
                                  <Badge variant="outline" className="text-[9px]">
                                    {a.photos.length} foto{a.photos.length === 1 ? "" : "s"}
                                  </Badge>
                                )}
                              </div>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Remover o código ${a.code || a.id}?`)) {
                                  labStore.deleteAmostra(os.id, a.id);
                                  toast.success("Código removido");
                                }
                              }}
                              aria-label="Remover código"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova amostra</DialogTitle>
            <DialogDescription>
              Informe os dados de cabeçalho. Amostras com mesmo Nº e Profundidade são agrupadas; cada linha é um Código diferente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FieldDlg label="Nº da amostra *" value={form.reportNumber ?? ""} onChange={(v) => setForm({ ...form, reportNumber: v })} />
            <FieldDlg label="Furo" value={form.borehole ?? ""} onChange={(v) => setForm({ ...form, borehole: v })} />
            <FieldDlg label="Profundidade (m)" value={form.depth ?? ""} onChange={(v) => setForm({ ...form, depth: v })} />
            <FieldDlg label="Código" value={form.code ?? ""} onChange={(v) => setForm({ ...form, code: v })} />
            <div className="col-span-full">
              <Label className="text-xs">Descrição tátil-visual</Label>
              <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="col-span-full">
              <Label className="text-xs">Descrição granulométrica</Label>
              <Input value={form.granulometricDescription ?? ""} onChange={(e) => setForm({ ...form, granulometricDescription: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDlgOpen(false)}>Cancelar</Button>
            <Button onClick={salvarAmostra}>Criar amostra</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldDlg({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}