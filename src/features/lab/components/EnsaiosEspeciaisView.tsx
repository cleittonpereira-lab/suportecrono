/**
 * Aba "Ensaios Especiais" — grid de OS classificadas como especiais (mesma
 * regra de src/routes/_app.programacao.central.tsx), organizado por OS, com
 * link pra abrir o hub completo de cada uma (/relatorio/especiais/$osNumero).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, ArrowRight, Archive, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSchedule } from "@/hooks/use-schedule";
import { classifyEspeciaisOs, normOs } from "@/lib/schedule-utils";
import { useOsGroups } from "@/features/lab/hooks/use-os-groups";
import { getOsHub } from "@/lib/os-hub.functions";

function parseLocalDate(dateOnly: string): Date {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function DeadlineBadge({ dataAcordadaAtual }: { dataAcordadaAtual: string | null }) {
  if (!dataAcordadaAtual) {
    return <Badge variant="outline" className="text-[10px]">Sem data acordada</Badge>;
  }
  const diffDays = Math.ceil((parseLocalDate(dataAcordadaAtual).getTime() - Date.now()) / 86_400_000);
  if (diffDays < 0) {
    return <Badge className="text-[10px] bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30">Atrasada {Math.abs(diffDays)}d</Badge>;
  }
  if (diffDays <= 3) {
    return <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">Vence em {diffDays}d</Badge>;
  }
  return <Badge className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">No prazo · {diffDays}d</Badge>;
}

export function EnsaiosEspeciaisView() {
  const navigate = useNavigate();
  const { data: scheduleData } = useSchedule();
  const { osGroups } = useOsGroups();
  const getOsHubFn = useServerFn(getOsHub);

  const [busca, setBusca] = useState("");
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);

  const especiaisOsNumeros = useMemo(
    () => Array.from(classifyEspeciaisOs(scheduleData?.rows ?? [])).sort(),
    [scheduleData],
  );

  const hubQueries = useQueries({
    queries: especiaisOsNumeros.map((osNumero) => ({
      queryKey: ["os-hub", osNumero],
      queryFn: () => getOsHubFn({ data: { osNumero } }),
      staleTime: 30_000,
    })),
  });

  const cards = useMemo(() => {
    return especiaisOsNumeros.map((osNumero, i) => {
      const group = osGroups.find((g) => normOs(g.osNumero) === normOs(osNumero));
      const hub = hubQueries[i]?.data;
      const totalEnsaios = group?.ensaios.length ?? 0;
      const concluidos = group?.ensaios.filter((e) => e.status === "aprovado" || e.status === "concluido_externo").length ?? 0;
      return {
        osNumero,
        cliente: group?.cliente || `OS ${osNumero}`,
        obra: group?.obra || "",
        totalEnsaios,
        concluidos,
        arquivada: hub?.arquivada ?? false,
        dataAcordadaAtual: hub?.dataAcordadaAtual ?? null,
      };
    });
  }, [especiaisOsNumeros, osGroups, hubQueries]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return cards.filter((c) => {
      if (!mostrarArquivadas && c.arquivada) return false;
      if (!q) return true;
      return c.osNumero.toLowerCase().includes(q) || c.cliente.toLowerCase().includes(q) || c.obra.toLowerCase().includes(q);
    });
  }, [cards, busca, mostrarArquivadas]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" /> Ensaios Especiais
          </h2>
          <p className="text-xs text-muted-foreground">
            Cisalhamento, Triaxiais e Adensamento — mesma classificação usada em Programação · Central.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <Switch checked={mostrarArquivadas} onCheckedChange={setMostrarArquivadas} />
            Mostrar arquivadas
          </label>
        </div>
      </div>

      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar por OS, cliente ou obra..."
          className="pl-9 text-xs"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma OS especial encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.osNumero} className="hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">OS {c.osNumero}</CardTitle>
                  {c.arquivada && (
                    <Badge variant="outline" className="text-[9px] gap-1">
                      <Archive className="h-2.5 w-2.5" /> Arquivada
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{c.cliente}</div>
                {c.obra && <div className="text-[11px] text-muted-foreground truncate">{c.obra}</div>}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Ensaios</span>
                  <span className="font-semibold tabular-nums">{c.concluidos}/{c.totalEnsaios} concluídos</span>
                </div>
                <DeadlineBadge dataAcordadaAtual={c.dataAcordadaAtual} />
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => navigate({ to: "/relatorio/especiais/$osNumero", params: { osNumero: c.osNumero } })}
                >
                  Abrir OS <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
