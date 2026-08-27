/**
 * Lista de OS classificadas como especiais (mesma regra de
 * src/routes/_app.programacao.central.tsx), organizada por OS, com link pra
 * abrir o hub completo de cada uma (/relatorio/especiais/$osNumero).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Archive, Search, Building, FlaskConical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

type PrazoInfo = { label: string; badgeClass: string; borderClass: string };

function prazoInfo(dataAcordadaAtual: string | null): PrazoInfo {
  if (!dataAcordadaAtual) {
    return { label: "Sem data acordada", badgeClass: "bg-muted text-muted-foreground border-border", borderClass: "border-l-slate-300 dark:border-l-slate-700" };
  }
  const diffDays = Math.ceil((parseLocalDate(dataAcordadaAtual).getTime() - Date.now()) / 86_400_000);
  if (diffDays < 0) {
    return { label: `Atrasada ${Math.abs(diffDays)}d`, badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30", borderClass: "border-l-rose-500" };
  }
  if (diffDays <= 3) {
    return { label: `Vence em ${diffDays}d`, badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30", borderClass: "border-l-amber-500" };
  }
  return { label: `No prazo · ${diffDays}d`, badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", borderClass: "border-l-emerald-500" };
}

export function useEnsaiosEspeciaisRows() {
  const { data: scheduleData } = useSchedule();
  const { osGroups } = useOsGroups();
  const getOsHubFn = useServerFn(getOsHub);

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

  return useMemo(() => {
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
}

export function EnsaiosEspeciaisView() {
  const navigate = useNavigate();
  const rows = useEnsaiosEspeciaisRows();

  const [busca, setBusca] = useState("");
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);

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
        <div className="space-y-2.5">
          {filtered.map((r) => {
            const prazo = prazoInfo(r.dataAcordadaAtual);
            return (
              <div
                key={r.osNumero}
                role="button"
                tabIndex={0}
                onClick={() => navigate({ to: "/relatorio/especiais/$osNumero", params: { osNumero: r.osNumero } })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate({ to: "/relatorio/especiais/$osNumero", params: { osNumero: r.osNumero } });
                  }
                }}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 rounded-lg border border-l-4 ${prazo.borderClass} bg-card px-4 py-3.5 shadow-xs cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-primary/30`}
              >
                <div className="min-w-0 sm:w-48 shrink-0">
                  <div className="flex items-center gap-1.5 font-bold text-base text-foreground">
                    {r.osNumero}
                    {r.arquivada && <Archive className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                    <Building className="h-3 w-3 shrink-0" /> {r.cliente}
                  </div>
                </div>

                <div className="min-w-0 flex-1 text-xs text-muted-foreground truncate">
                  {r.obra || "—"}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <FlaskConical className="h-3.5 w-3.5" />
                  <span className="font-semibold text-foreground tabular-nums">{r.concluidos}/{r.totalEnsaios}</span> concluídos
                </div>

                <Badge variant="outline" className={`${prazo.badgeClass} shrink-0 justify-center w-32`}>{prazo.label}</Badge>

                <div className="flex items-center gap-1 shrink-0 text-xs font-semibold text-primary">
                  Abrir <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
