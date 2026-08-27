/**
 * Produção do laboratório inteiro (não só Ensaios Especiais): quantos
 * ensaios foram digitados/verificados/aprovados por operador, num período
 * (dia/semana/mês/personalizado), com exportação em Excel.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { format, startOfDay, startOfWeek, startOfMonth, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";
import { listPendenciasDigitacao, type PendenciaDigitacao } from "@/lib/lab-pendencias.functions";

type Periodo = "hoje" | "semana" | "mes" | "custom";

type Evento = { tipo: "digitado" | "verificado" | "aprovado"; operador: string; data: Date };

function extrairEventos(p: PendenciaDigitacao): Evento[] {
  const payload = (p.payload as Record<string, any>) || {};
  const eventos: Evento[] = [];
  if (p.digitador_nome && payload.digitacao_finished_at) {
    eventos.push({ tipo: "digitado", operador: p.digitador_nome, data: new Date(payload.digitacao_finished_at) });
  }
  if (p.verificador_nome && payload.verificado_at) {
    eventos.push({ tipo: "verificado", operador: p.verificador_nome, data: new Date(payload.verificado_at) });
  }
  if (p.aprovador_nome && payload.aprovado_at) {
    eventos.push({ tipo: "aprovado", operador: p.aprovador_nome, data: new Date(payload.aprovado_at) });
  }
  return eventos.filter((e) => !isNaN(e.data.getTime()));
}

export function ProducaoView() {
  const listFn = useServerFn(listPendenciasDigitacao);
  const { data: pendencias = [] } = useQuery({
    queryKey: ["lab-pendencias"],
    queryFn: () => listFn(),
  });

  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [customDe, setCustomDe] = useState("");
  const [customAte, setCustomAte] = useState("");

  const { inicio, fim } = useMemo(() => {
    const now = new Date();
    if (periodo === "hoje") return { inicio: startOfDay(now), fim: endOfDay(now) };
    if (periodo === "semana") return { inicio: startOfWeek(now, { weekStartsOn: 1 }), fim: endOfDay(now) };
    if (periodo === "mes") return { inicio: startOfMonth(now), fim: endOfDay(now) };
    return {
      inicio: customDe ? startOfDay(new Date(customDe + "T00:00:00")) : startOfDay(now),
      fim: customAte ? endOfDay(new Date(customAte + "T00:00:00")) : endOfDay(now),
    };
  }, [periodo, customDe, customAte]);

  const eventos = useMemo(() => {
    const all = pendencias.flatMap(extrairEventos);
    return all.filter((e) => e.data >= inicio && e.data <= fim);
  }, [pendencias, inicio, fim]);

  const porOperador = useMemo(() => {
    const m = new Map<string, { operador: string; digitado: number; verificado: number; aprovado: number }>();
    for (const e of eventos) {
      const cur = m.get(e.operador) ?? { operador: e.operador, digitado: 0, verificado: 0, aprovado: 0 };
      cur[e.tipo]++;
      m.set(e.operador, cur);
    }
    return Array.from(m.values())
      .map((r) => ({ ...r, total: r.digitado + r.verificado + r.aprovado }))
      .sort((a, b) => b.total - a.total);
  }, [eventos]);

  const porDia = useMemo(() => {
    const m = new Map<string, { dia: string; digitado: number; verificado: number; aprovado: number }>();
    for (const e of eventos) {
      const key = format(e.data, "dd/MM");
      const cur = m.get(key) ?? { dia: key, digitado: 0, verificado: 0, aprovado: 0 };
      cur[e.tipo]++;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => (a.dia > b.dia ? 1 : -1));
  }, [eventos]);

  const totalGeral = porOperador.reduce((a, r) => a + r.total, 0);

  function handleExportar() {
    const rows = porOperador.map((r) => ({
      Operador: r.operador,
      Digitados: r.digitado,
      Verificados: r.verificado,
      Aprovados: r.aprovado,
      Total: r.total,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produção");
    const nome = `producao_${format(inicio, "yyyy-MM-dd")}_a_${format(fim, "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(wb, nome);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-md border text-xs">
          {(["hoje", "semana", "mes", "custom"] as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`px-3 py-1.5 rounded font-semibold transition-colors ${periodo === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {p === "hoje" ? "Hoje" : p === "semana" ? "Esta semana" : p === "mes" ? "Este mês" : "Personalizado"}
            </button>
          ))}
        </div>

        {periodo === "custom" && (
          <div className="flex items-center gap-2">
            <div className="space-y-0.5">
              <Label className="text-[10px]">De</Label>
              <Input type="date" value={customDe} onChange={(e) => setCustomDe(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[10px]">Até</Label>
              <Input type="date" value={customAte} onChange={(e) => setCustomAte(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">
            {format(inicio, "dd/MM/yyyy", { locale: ptBR })} – {format(fim, "dd/MM/yyyy", { locale: ptBR })}
          </span>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleExportar} disabled={porOperador.length === 0}>
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total no período</div>
            <div className="font-display text-2xl font-semibold tabular-nums text-primary">{totalGeral}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Digitados</div>
            <div className="font-display text-2xl font-semibold tabular-nums">{porOperador.reduce((a, r) => a + r.digitado, 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Verificados</div>
            <div className="font-display text-2xl font-semibold tabular-nums">{porOperador.reduce((a, r) => a + r.verificado, 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Aprovados</div>
            <div className="font-display text-2xl font-semibold tabular-nums">{porOperador.reduce((a, r) => a + r.aprovado, 0)}</div>
          </CardContent>
        </Card>
      </div>

      {porDia.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Produção por dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porDia} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="digitado" name="Digitados" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="verificado" name="Verificados" stackId="a" fill="#8b5cf6" />
                  <Bar dataKey="aprovado" name="Aprovados" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Operador</TableHead>
              <TableHead className="text-center">Digitados</TableHead>
              <TableHead className="text-center">Verificados</TableHead>
              <TableHead className="text-center">Aprovados</TableHead>
              <TableHead className="text-center">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {porOperador.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  Nenhuma produção registrada nesse período.
                </TableCell>
              </TableRow>
            ) : (
              porOperador.map((r) => (
                <TableRow key={r.operador}>
                  <TableCell className="font-medium text-sm">{r.operador}</TableCell>
                  <TableCell className="text-center text-sm tabular-nums">{r.digitado}</TableCell>
                  <TableCell className="text-center text-sm tabular-nums">{r.verificado}</TableCell>
                  <TableCell className="text-center text-sm tabular-nums">{r.aprovado}</TableCell>
                  <TableCell className="text-center text-sm font-semibold tabular-nums">{r.total}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
