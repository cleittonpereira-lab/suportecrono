import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FlaskConical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { labStore, useAmostra, useOS } from "@/features/lab/store";
import { ENSAIO_LABEL, ENSAIO_DISPONIVEL, type EnsaioTipo } from "@/features/lab/types";
import { EnsaioTag } from "@/features/lab/components/EnsaioTag";
import { WorkflowFarol } from "@/features/lab/components/WorkflowFarol";
import { getWorkflowStatuses } from "@/lib/driveSync.functions";

export const Route = createFileRoute("/_app/relatorio/os/$osId/amostra/$amostraId/")({
  component: AmostraDetail,
});

function AmostraDetail() {
  const { osId, amostraId } = Route.useParams();
  const os = useOS(osId);
  const am = useAmostra(osId, amostraId);
  const navigate = useNavigate();
  const [novoTipo, setNovoTipo] = useState<EnsaioTipo>("triaxial-cid-sat");
  const [workflowMap, setWorkflowMap] = useState<Record<string, string>>({});

  // Busca o farol (workflow_status) de todos os ensaios da amostra.
  useEffect(() => {
    if (!am || am.ensaios.length === 0) {
      setWorkflowMap({});
      return;
    }
    const ids = am.ensaios.map((e) => e.id);
    let cancelled = false;
    getWorkflowStatuses({ data: { scopeIds: ids } })
      .then((res) => { if (!cancelled) setWorkflowMap(res.statuses ?? {}); })
      .catch(() => { /* silencioso — farol vira "Em digitação" por padrão */ });
    return () => { cancelled = true; };
  }, [am?.id, am?.ensaios.length]);

  if (!os || !am) {
    return (
      <div className="px-6 py-6 text-sm text-muted-foreground">
        Amostra não encontrada. <Link to="/relatorio/os" className="underline">Voltar</Link>
      </div>
    );
  }

  const set = (patch: Partial<typeof am>) => labStore.patchAmostra(os.id, am.id, patch);
  const setCoord = (k: "N" | "E" | "cota" | "datum", v: string) => {
    const coords = { ...(am.coords ?? {}) };
    if (k === "datum") coords.datum = v;
    else {
      const n = v === "" ? undefined : Number(v);
      coords[k] = Number.isFinite(n) ? (n as number) : undefined;
    }
    set({ coords });
  };

  const criarEnsaio = () => {
    const en = labStore.addEnsaio(os.id, am.id, novoTipo);
    navigate({
      to: "/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId",
      params: { osId: os.id, amostraId: am.id, ensaioId: en.id },
    });
  };

  return (
    <div className="px-6 py-6">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/relatorio/os" search={{}} className="hover:text-foreground">Ordens de Serviço</Link>
        <span>/</span>
        <Link to="/relatorio/os/$osId" params={{ osId: os.id }} search={{}} className="hover:text-foreground">{os.numero}</Link>
        <span>/</span>
        <span className="font-medium text-foreground">{am.reportNumber || "Amostra"}</span>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Amostra {am.reportNumber || "—"}</h2>
          <p className="text-sm text-muted-foreground">
            {os.client || "—"} · Obra {os.workNumber || "—"}
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link to="/relatorio/os/$osId" params={{ osId: os.id }} search={{}}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Voltar à OS
          </Link>
        </Button>
      </div>

      {/* Identificação */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Identificação</CardTitle>
          <CardDescription>Comum a todos os ensaios desta amostra.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <F label="Nº da amostra" v={am.reportNumber ?? ""} on={(v) => set({ reportNumber: v })} />
          <F label="Furo" v={am.borehole ?? ""} on={(v) => set({ borehole: v })} />
          <F label="Profundidade (m)" v={am.depth ?? ""} on={(v) => set({ depth: v })} />
          <F label="Código" v={am.code ?? ""} on={(v) => set({ code: v })} />
          <div className="col-span-full">
            <Label className="text-xs">Descrição tátil-visual</Label>
            <Input value={am.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="col-span-full">
            <Label className="text-xs">Descrição granulométrica</Label>
            <Input value={am.granulometricDescription ?? ""} onChange={(e) => set({ granulometricDescription: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      {/* Coordenadas */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Coordenadas topográficas</CardTitle>
          <CardDescription>Aparecem no cabeçalho do relatório de cada ensaio desta amostra.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <F label="N (m)" v={am.coords?.N?.toString() ?? ""} on={(v) => setCoord("N", v)} type="number" />
          <F label="E (m)" v={am.coords?.E?.toString() ?? ""} on={(v) => setCoord("E", v)} type="number" />
          <F label="Cota (m)" v={am.coords?.cota?.toString() ?? ""} on={(v) => setCoord("cota", v)} type="number" />
          <F label="Datum" v={am.coords?.datum ?? ""} on={(v) => setCoord("datum", v)} placeholder="SIRGAS 2000 / UTM 23S" />
        </CardContent>
      </Card>

      {/* Registro fotográfico agora fica no Ensaio (moldagem/ruptura variam por CP e por ensaio). */}

      {/* Ensaios */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-sm">Ensaios</CardTitle>
            <CardDescription>{am.ensaios.length} cadastrado{am.ensaios.length === 1 ? "" : "s"}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={novoTipo} onValueChange={(v) => setNovoTipo(v as EnsaioTipo)}>
              <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENSAIO_DISPONIVEL.map((t) => (
                  <SelectItem key={t} value={t}>{ENSAIO_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={criarEnsaio}>
              <Plus className="mr-1 h-3 w-3" />
              Adicionar ensaio
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {am.ensaios.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum ensaio ainda. Escolha o tipo e clique em "Adicionar".
            </p>
          ) : (
            <div className="divide-y">
              {am.ensaios.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-3 py-3">
                  <Link
                    to="/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId"
                    params={{ osId: os.id, amostraId: am.id, ensaioId: e.id }}
                    search={{}}
                    className="flex-1 min-w-0"
                  >
                     <div className="flex items-center gap-2">
                       <FlaskConical className="h-4 w-4 text-muted-foreground" />
                       <EnsaioTag tipo={e.tipo} />
                       <span className="text-sm font-medium">{ENSAIO_LABEL[e.tipo]}</span>
                       <WorkflowFarol status={workflowMap[e.id] ?? "digitacao"} size="xs" />
                    </div>
                    {e.label && <div className="mt-0.5 text-xs text-muted-foreground">{e.label}</div>}
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Remover ensaio ${ENSAIO_LABEL[e.tipo]}?`)) {
                        labStore.deleteEnsaio(os.id, am.id, e.id);
                        toast.success("Ensaio removido");
                      }
                    }}
                    aria-label="Remover ensaio"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function F({
  label,
  v,
  on,
  type = "text",
  placeholder,
}: {
  label: string;
  v: string;
  on: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={v} onChange={(e) => on(e.target.value)} type={type} placeholder={placeholder} />
    </div>
  );
}