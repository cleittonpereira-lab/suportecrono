/**
 * Upload dos extratos SOND (coletadas) e MAPS (a coletar) + análise de
 * pulmão: retrato atual por categoria de amostra e previsão das próximas
 * semanas, cruzando com o status real das OS no app.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Upload, Package, MapPin, History, Loader2, Box, Cylinder, Drill, Boxes } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listarCargasAmostras, getCargaAmostras, salvarCargaAmostras, type CategoriaAmostra } from "@/lib/sample-collection.functions";
import { parseColetadas, parseAColetar } from "@/features/lab/sample-analysis/parseUploads";
import { useOsGroups } from "@/features/lab/hooks/use-os-groups";
import { calcularRetratoAtual, calcularTaxaConclusaoOsPorSemana, projetarPulmaoOs, CATEGORIA_LABEL } from "@/lib/sample-collection-calc";

const CATEGORIA_ICON: Record<CategoriaAmostra, React.ComponentType<{ className?: string }>> = {
  bloco: Box,
  shelby: Cylinder,
  denison: Drill,
  outro: Boxes,
};

export function AnaliseAmostrasView() {
  const qc = useQueryClient();
  const { osGroups } = useOsGroups();

  const listFn = useServerFn(listarCargasAmostras);
  const getFn = useServerFn(getCargaAmostras);
  const salvarFn = useServerFn(salvarCargaAmostras);

  const { data: cargas = [], isLoading: loadingCargas } = useQuery({
    queryKey: ["sample-cargas"],
    queryFn: () => listFn(),
  });

  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [arqColetadas, setArqColetadas] = useState<File | null>(null);
  const [arqAColetar, setArqAColetar] = useState<File | null>(null);

  useEffect(() => {
    if (!selecionadaId && cargas.length > 0) setSelecionadaId(cargas[0].id);
  }, [cargas, selecionadaId]);

  const { data: cargaDetalhe, isLoading: loadingDetalhe } = useQuery({
    queryKey: ["sample-carga-detalhe", selecionadaId],
    queryFn: () => getFn({ data: { id: selecionadaId! } }),
    enabled: !!selecionadaId,
  });

  const enviarMutation = useMutation({
    mutationFn: async () => {
      if (!arqColetadas && !arqAColetar) throw new Error("Selecione ao menos uma planilha.");
      const coletadas = arqColetadas ? await parseColetadas(arqColetadas) : [];
      const aColetar = arqAColetar ? await parseAColetar(arqAColetar) : [];
      return salvarFn({ data: { coletadas, aColetar } });
    },
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["sample-cargas"] });
      setSelecionadaId(res.id);
      setArqColetadas(null);
      setArqAColetar(null);
      toast.success("Análise atualizada com a nova carga.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retrato = useMemo(() => {
    if (!cargaDetalhe) return null;
    return calcularRetratoAtual(cargaDetalhe.coletadas, cargaDetalhe.aColetar, osGroups);
  }, [cargaDetalhe, osGroups]);

  const taxaConclusao = useMemo(() => {
    if (!cargaDetalhe) return 0;
    return calcularTaxaConclusaoOsPorSemana(cargaDetalhe.coletadas, osGroups);
  }, [cargaDetalhe, osGroups]);

  const projecao = useMemo(() => {
    if (!cargaDetalhe) return [];
    return projetarPulmaoOs(cargaDetalhe.coletadas, cargaDetalhe.aColetar, osGroups);
  }, [cargaDetalhe, osGroups]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" /> Enviar Nova Carga
          </CardTitle>
          <CardDescription className="text-xs">
            Extratos do SOND/MAPS — cada envio fica salvo no histórico, sem apagar o anterior.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-lg border border-dashed p-3 cursor-pointer hover:border-primary/50 transition-colors text-xs">
              <Package className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="font-medium">Amostras Coletadas</div>
                <div className="text-muted-foreground truncate">{arqColetadas?.name || "Selecionar arquivo .xlsx"}</div>
              </div>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setArqColetadas(e.target.files?.[0] ?? null)} />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-dashed p-3 cursor-pointer hover:border-primary/50 transition-colors text-xs">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="font-medium">Amostras a Coletar</div>
                <div className="text-muted-foreground truncate">{arqAColetar?.name || "Selecionar arquivo .xlsx"}</div>
              </div>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setArqAColetar(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={(!arqColetadas && !arqAColetar) || enviarMutation.isPending}
            onClick={() => enviarMutation.mutate()}
          >
            {enviarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Analisar
          </Button>
        </CardContent>
      </Card>

      {cargas.length > 0 && (
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={selecionadaId ?? undefined} onValueChange={setSelecionadaId}>
            <SelectTrigger className="h-8 w-[340px] text-xs">
              <SelectValue placeholder="Selecionar carga" />
            </SelectTrigger>
            <SelectContent>
              {cargas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {format(new Date(c.enviadoEm), "dd/MM/yyyy HH:mm", { locale: ptBR })} · {c.enviadoPor} · {c.totalColetadas} coletadas / {c.totalAColetar} a coletar
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {loadingCargas || loadingDetalhe ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : !cargaDetalhe ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma carga enviada ainda — envie os extratos acima pra ver a análise.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {retrato?.map((r) => {
              const Icon = CATEGORIA_ICON[r.categoria];
              return (
                <Card key={r.categoria}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-primary" /> {CATEGORIA_LABEL[r.categoria]}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Coletadas:</span><strong>{r.totalColetado}</strong></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Pulmão em aberto:</span><strong className="text-amber-600">{r.pulmaoEmAberto}</strong></div>
                    <div className="flex justify-between pt-1.5 border-t"><span className="text-muted-foreground">A coletar (pendente):</span><strong>{r.totalAColetarPendente}</strong></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">A coletar (prioridade):</span><strong className="text-rose-600">{r.totalAColetarPrioridade}</strong></div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Projeção do Pulmão de OS (próximas 8 semanas)</CardTitle>
              <CardDescription className="text-xs">
                Baseado na taxa real de conclusão de OS observada no app (~{taxaConclusao.toFixed(1)} OS/semana) e nas datas de fim de campo previstas nas amostras a coletar. Estimativa por OS, não por amostra individual.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={projecao} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                    <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [v, "OS em aberto"]} />
                    <Line type="monotone" dataKey="pulmaoProjetado" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
