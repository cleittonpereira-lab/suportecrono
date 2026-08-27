/**
 * Lista de OS classificadas como especiais (mesma regra de
 * src/routes/_app.programacao.central.tsx), organizada por OS, com link pra
 * abrir o hub completo de cada uma (/relatorio/especiais/$osNumero).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Archive, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

  const rows = useMemo(() => {
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
    return rows.filter((r) => {
      if (!mostrarArquivadas && r.arquivada) return false;
      if (!q) return true;
      return r.osNumero.toLowerCase().includes(q) || r.cliente.toLowerCase().includes(q) || r.obra.toLowerCase().includes(q);
    });
  }, [rows, busca, mostrarArquivadas]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por OS, cliente ou obra..."
            className="pl-9 text-xs"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none shrink-0">
          <Switch checked={mostrarArquivadas} onCheckedChange={setMostrarArquivadas} />
          Mostrar arquivadas
        </label>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma OS especial encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-28">OS</TableHead>
                <TableHead>Cliente / Obra</TableHead>
                <TableHead className="w-40">Ensaios</TableHead>
                <TableHead className="w-44">Prazo</TableHead>
                <TableHead className="w-32 text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow
                  key={r.osNumero}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate({ to: "/relatorio/especiais/$osNumero", params: { osNumero: r.osNumero } })}
                >
                  <TableCell className="font-bold text-xs text-foreground">
                    <div className="flex items-center gap-1.5">
                      {r.osNumero}
                      {r.arquivada && <Archive className="h-3 w-3 text-muted-foreground" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-medium text-foreground truncate">{r.cliente}</div>
                    {r.obra && <div className="text-[11px] text-muted-foreground truncate">{r.obra}</div>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {r.concluidos}/{r.totalEnsaios} concluídos
                  </TableCell>
                  <TableCell>
                    <DeadlineBadge dataAcordadaAtual={r.dataAcordadaAtual} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                      Abrir <ArrowRight className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
