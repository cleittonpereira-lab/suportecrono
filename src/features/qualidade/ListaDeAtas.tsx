/**
 * Qualidade - LAB · Atas de reunião (lista): as reuniões do grupo em cards e o
 * quadro de pendências (tudo que foi definido e ainda não foi concluído).
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ClipboardCheck, Clock, Loader2, MapPin, Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { isoHoje } from "@/features/lab/hooks/use-acoes-da-programacao";
import {
  dataBr,
  diasParaPrazo,
  GRUPO_PADRAO,
  gruposExistentes,
  itemAtrasado,
  ordenarReunioes,
  pendenciasDoGrupo,
  resumirReuniao,
  STATUS_REUNIAO_LABEL,
  type Reuniao,
} from "@/lib/atas-qualidade";
import { useOperarReuniao, useReunioes } from "./atas-hooks";
import { NovaReuniaoDialog } from "./NovaReuniaoDialog";
import { Pessoas, StatusDoItem, pillDaReuniao } from "./atas-ui";

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: number | string; destaque?: "alerta" | "ok" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</div>
        <div
          className={cn(
            "mt-1 text-3xl font-bold tabular-nums",
            destaque === "alerta" && "text-destructive",
            destaque === "ok" && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {valor}
        </div>
      </CardContent>
    </Card>
  );
}

function CartaoDaReuniao({ r, hoje }: { r: Reuniao; hoje: string }) {
  const resumo = resumirReuniao(r, hoje);
  const presentes = r.participantes.filter((p) => p.presente).length;
  return (
    <Link to="/qualidade/atas/$reuniaoId" params={{ reuniaoId: r.id }} className="group block focus:outline-none">
      <Card className="h-full transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardContent className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reunião nº {r.numero}</div>
              <h3 className="truncate text-base font-semibold">{r.titulo}</h3>
            </div>
            <span className={cn(pillDaReuniao(r.status), "shrink-0")}>{STATUS_REUNIAO_LABEL[r.status]}</span>
          </div>

          <dl className="grid gap-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span>
                {dataBr(r.data)}
                {r.horaInicio ? ` · ${r.horaInicio}${r.horaFim ? `–${r.horaFim}` : ""}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{r.local || "Local não informado"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {r.participantes.length === 0
                  ? "Sem participantes"
                  : `${presentes} de ${r.participantes.length} presentes`}
              </span>
            </div>
          </dl>

          {r.participantes.length > 0 && (
            <Pessoas nomes={r.participantes.filter((p) => p.presente).map((p) => p.nome)} max={5} />
          )}

          <div className="mt-auto grid gap-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {resumo.acoes === 0 ? "Nenhuma ação registrada" : `${resumo.concluidas} de ${resumo.acoes} ações concluídas`}
              </span>
              {resumo.atrasadas > 0 && <span className="font-semibold text-destructive">{resumo.atrasadas} atrasada(s)</span>}
            </div>
            <Progress value={resumo.percentualConcluido} className="h-1.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuadroDePendencias({ reunioes, grupo, hoje }: { reunioes: Reuniao[]; grupo: string; hoje: string }) {
  const operar = useOperarReuniao();
  const [quem, setQuem] = useState("todos");
  const todas = useMemo(() => pendenciasDoGrupo(reunioes, grupo), [reunioes, grupo]);
  const responsaveis = useMemo(
    () => [...new Set(todas.flatMap((p) => p.item.responsaveis))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [todas],
  );
  const linhas = useMemo(() => {
    const f = todas.filter((p) =>
      quem === "todos" ? true : quem === "__sem__" ? p.item.responsaveis.length === 0 : p.item.responsaveis.includes(quem),
    );
    // Atrasadas primeiro (as mais antigas no topo), depois por prazo, sem prazo no fim.
    return f.sort((a, b) => {
      const pa = a.item.prazo ?? "9999-99-99";
      const pb = b.item.prazo ?? "9999-99-99";
      return pa.localeCompare(pb);
    });
  }, [todas, quem]);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
          <p className="text-sm text-muted-foreground">
            {todas.length === 0
              ? "Nada pendente neste grupo."
              : `${todas.length} ação(ões) definidas em reuniões e ainda não concluídas.`}
          </p>
          {todas.length > 0 && (
            <Select value={quem} onValueChange={setQuem}>
              <SelectTrigger className="h-8 w-52 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os responsáveis</SelectItem>
                <SelectItem value="__sem__">Sem responsável</SelectItem>
                {responsaveis.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {linhas.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Ação</TableHead>
                  <TableHead>Responsáveis</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Reunião</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map(({ reuniao, item }) => {
                  const dias = diasParaPrazo(item.prazo, hoje);
                  return (
                    <TableRow key={`${reuniao.id}:${item.id}`}>
                      <TableCell>
                        <Checkbox
                          aria-label="Marcar como concluída"
                          onCheckedChange={() => operar(reuniao.id, { op: "item_alterar", itemId: item.id, campos: { status: "concluida" } })}
                        />
                      </TableCell>
                      <TableCell className="max-w-[28rem] whitespace-pre-wrap">{item.descricao}</TableCell>
                      <TableCell><Pessoas nomes={item.responsaveis} /></TableCell>
                      <TableCell className={cn("whitespace-nowrap text-sm", itemAtrasado(item, hoje) && "font-semibold text-destructive")}>
                        {item.prazo ? dataBr(item.prazo) : <span className="text-muted-foreground">—</span>}
                        {dias !== null && dias > 0 && <span className="ml-1 text-xs">({dias} d)</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <Link to="/qualidade/atas/$reuniaoId" params={{ reuniaoId: reuniao.id }} className="hover:underline">
                          nº {reuniao.numero} · {dataBr(reuniao.data)}
                        </Link>
                        {item.origem && <div className="text-xs text-muted-foreground">vem da nº {item.origem.reuniaoNumero}</div>}
                      </TableCell>
                      <TableCell>
                        <StatusDoItem
                          item={item}
                          hoje={hoje}
                          onChange={(s) => operar(reuniao.id, { op: "item_alterar", itemId: item.id, campos: { status: s } })}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ListaDeAtas() {
  const { data: reunioes = [], isLoading, isError, error } = useReunioes();
  const hoje = isoHoje();
  const [grupoEscolhido, setGrupoEscolhido] = useState<string | null>(null);
  const [nova, setNova] = useState(false);

  const grupos = useMemo(() => gruposExistentes(reunioes), [reunioes]);
  const grupo = grupoEscolhido ?? (grupos.includes(GRUPO_PADRAO) ? GRUPO_PADRAO : grupos[0] ?? GRUPO_PADRAO);
  const doGrupo = useMemo(() => ordenarReunioes(reunioes.filter((r) => r.grupo === grupo)).reverse(), [reunioes, grupo]);

  const totais = useMemo(() => {
    const resumos = doGrupo.map((r) => resumirReuniao(r, hoje));
    const pend = pendenciasDoGrupo(reunioes, grupo);
    const atrasadas = pend.filter((p) => itemAtrasado(p.item, hoje)).length;
    const acoes = resumos.reduce((s, r) => s + r.acoes, 0);
    const conc = resumos.reduce((s, r) => s + r.concluidas, 0);
    return { reunioes: doGrupo.length, abertas: pend.length, atrasadas, pct: acoes === 0 ? 0 : Math.round((conc / acoes) * 100) };
  }, [doGrupo, reunioes, grupo, hoje]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Qualidade - LAB"
        icon={ClipboardCheck}
        title="Atas de reunião"
        description="Reuniões do grupo de trabalho com decisões, responsáveis e prazos — e o que ficou pendente."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {grupos.length > 1 && (
              <Select value={grupo} onValueChange={setGrupoEscolhido}>
                <SelectTrigger className="h-9 w-64 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button onClick={() => setNova(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Nova reunião
            </Button>
          </div>
        }
      />

      <div className="text-sm font-medium text-muted-foreground">{grupo}</div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
      ) : isError ? (
        <div className="text-sm text-destructive">Não foi possível carregar as atas: {(error as Error).message}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Numero rotulo="Reuniões" valor={totais.reunioes} />
            <Numero rotulo="Ações em aberto" valor={totais.abertas} />
            <Numero rotulo="Atrasadas" valor={totais.atrasadas} destaque={totais.atrasadas > 0 ? "alerta" : undefined} />
            <Numero rotulo="Ações concluídas" valor={`${totais.pct}%`} destaque={totais.pct >= 80 ? "ok" : undefined} />
          </div>

          <Tabs defaultValue="reunioes">
            <TabsList>
              <TabsTrigger value="reunioes">Reuniões</TabsTrigger>
              <TabsTrigger value="pendencias" className="gap-1.5">
                Pendências
                {totais.abertas > 0 && <span className="rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold">{totais.abertas}</span>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="reunioes" className="mt-4">
              {doGrupo.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
                    <Clock className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <div className="font-semibold">Nenhuma reunião registrada neste grupo</div>
                      <p className="text-sm text-muted-foreground">Crie a primeira e registre as decisões ao vivo.</p>
                    </div>
                    <Button onClick={() => setNova(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Nova reunião</Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {doGrupo.map((r) => <CartaoDaReuniao key={r.id} r={r} hoje={hoje} />)}
                </div>
              )}
            </TabsContent>

            <TabsContent value="pendencias" className="mt-4">
              <QuadroDePendencias reunioes={reunioes} grupo={grupo} hoje={hoje} />
            </TabsContent>
          </Tabs>
        </>
      )}

      {nova && <NovaReuniaoDialog aberto={nova} onAbertoChange={setNova} reunioes={reunioes} grupoInicial={grupo} />}
    </div>
  );
}

