/**
 * Qualidade - LAB · Atas de reunião (lista), no jeito do Monday: as reuniões
 * em grupos por mês (em ordem de data — o número de cada uma também vem da
 * data), com a opção de ver em cards; e o quadro de pendências, agrupado por
 * responsável ou por reunião.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ClipboardCheck, Clock, LayoutGrid, Loader2, MapPin, Plus, Table as TableIcon, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  tituloDaReuniao,
  tituloProprio,
  type PendenciaAberta,
  type Reuniao,
} from "@/lib/atas-qualidade";
import { useOperarReuniao, useReunioes } from "./atas-hooks";
import { NovaReuniaoDialog } from "./NovaReuniaoDialog";
import { Bateria, CelulaStatus, CelulaStatusReuniao, COR, COR_DA_REUNIAO, Etiqueta, Grupo, Pessoas, Td, Th } from "./atas-ui";

const CORES_DOS_GRUPOS = [COR.azul, COR.roxo, COR.verde, COR.coral, COR.turquesa, COR.laranja];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (iso: string) => {
  const m = MESES[Number(iso.slice(5, 7)) - 1] ?? "";
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} de ${iso.slice(0, 4)}`;
};
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaDaSemana = (iso: string) => DIAS[new Date(`${iso}T12:00:00`).getDay()] ?? "";

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: number | string; cor?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4" style={cor ? { borderTop: `4px solid ${cor}` } : undefined}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</div>
      <div className="mt-1 text-3xl font-bold tabular-nums">{valor}</div>
    </div>
  );
}

function NumeroDaReuniao({ r }: { r: Reuniao }) {
  return (
    <span className="grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-xs font-bold text-white" style={{ background: COR_DA_REUNIAO[r.status] }}>
      {r.numero}
    </span>
  );
}

/** Quadro (Monday): um grupo por mês, uma linha por reunião. */
function QuadroDeReunioes({ reunioes, hoje }: { reunioes: Reuniao[]; hoje: string }) {
  const meses = useMemo(() => {
    const m = new Map<string, Reuniao[]>();
    for (const r of reunioes) m.set(r.data.slice(0, 7), [...(m.get(r.data.slice(0, 7)) ?? []), r]);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [reunioes]);

  return (
    <div className="space-y-6">
      {meses.map(([mes, lista], gi) => {
        const cor = CORES_DOS_GRUPOS[gi % CORES_DOS_GRUPOS.length];
        const ordenadas = ordenarReunioes(lista).reverse();
        return (
          <Grupo key={mes} cor={cor} titulo={nomeDoMes(`${mes}-01`)} detalhe={`${lista.length} reunião(ões)`}>
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr>
                  <Th className="w-[30%] text-left">Reunião</Th>
                  <Th className="w-28">Data</Th>
                  <Th className="w-28">Horário</Th>
                  <Th>Local</Th>
                  <Th className="w-32">Participantes</Th>
                  <Th className="w-32">Situação</Th>
                  <Th className="w-44">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((r) => {
                  const resumo = resumirReuniao(r, hoje);
                  const acoes = r.itens.filter((i) => i.tipo === "acao" && i.status !== "cancelada");
                  return (
                    <tr key={r.id} className="group hover:bg-muted/40">
                      <Td>
                        <Link to="/qualidade/atas/$reuniaoId" params={{ reuniaoId: r.id }} className="flex items-center gap-2.5 px-3 py-1.5">
                          <NumeroDaReuniao r={r} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium group-hover:underline">{tituloDaReuniao(r)}</span>
                            {tituloProprio(r) && <span className="block text-[11px] text-muted-foreground">Reunião nº {r.numero}</span>}
                          </span>
                        </Link>
                      </Td>
                      <Td className="text-center">
                        <span className="text-[13px]">{dataBr(r.data)}</span>
                        <span className="block text-[11px] text-muted-foreground">{diaDaSemana(r.data)}</span>
                      </Td>
                      <Td className="text-center text-[13px]">{r.horaInicio ? `${r.horaInicio}${r.horaFim ? `–${r.horaFim}` : ""}` : "—"}</Td>
                      <Td className="px-3 text-[13px]"><span className="line-clamp-2">{r.local || <span className="text-muted-foreground">—</span>}</span></Td>
                      <Td className="text-center"><Pessoas nomes={r.participantes.filter((p) => p.presente).map((p) => p.nome)} max={4} vazio="—" /></Td>
                      <Td><CelulaStatusReuniao status={r.status} /></Td>
                      <Td className="px-2">
                        {acoes.length === 0 ? (
                          <span className="block text-center text-xs text-muted-foreground">sem ações</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Bateria itens={acoes} hoje={hoje} className="h-5" />
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{resumo.concluidas}/{resumo.acoes}</span>
                          </div>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Grupo>
        );
      })}
    </div>
  );
}

function CartaoDaReuniao({ r, hoje }: { r: Reuniao; hoje: string }) {
  const resumo = resumirReuniao(r, hoje);
  const presentes = r.participantes.filter((p) => p.presente);
  const acoes = r.itens.filter((i) => i.tipo === "acao" && i.status !== "cancelada");
  return (
    <Link to="/qualidade/atas/$reuniaoId" params={{ reuniaoId: r.id }} className="group block focus:outline-none">
      <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring" style={{ borderTop: `4px solid ${COR_DA_REUNIAO[r.status]}` }}>
        <CardContent className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <NumeroDaReuniao r={r} />
              <h3 className="truncate text-base font-semibold">{tituloDaReuniao(r)}</h3>
            </div>
            <Etiqueta cor={COR_DA_REUNIAO[r.status]} className="shrink-0">{r.status === "agendada" ? "Agendada" : r.status === "em_andamento" ? "Em andamento" : "Encerrada"}</Etiqueta>
          </div>
          <dl className="grid gap-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0" />{dataBr(r.data)} ({diaDaSemana(r.data)}){r.horaInicio ? ` · ${r.horaInicio}${r.horaFim ? `–${r.horaFim}` : ""}` : ""}</div>
            <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{r.local || "Local não informado"}</span></div>
            <div className="flex items-center gap-2"><Users className="h-3.5 w-3.5 shrink-0" />{presentes.length} de {r.participantes.length} presentes</div>
          </dl>
          <Pessoas nomes={presentes.map((p) => p.nome)} max={6} vazio="" />
          <div className="mt-auto grid gap-1.5 pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{resumo.acoes === 0 ? "Nenhuma ação registrada" : `${resumo.concluidas} de ${resumo.acoes} ações concluídas`}</span>
              {resumo.atrasadas > 0 && <span className="font-semibold" style={{ color: COR.vermelho }}>{resumo.atrasadas} atrasada(s)</span>}
            </div>
            <Bateria itens={acoes} hoje={hoje} className="h-2 rounded-full" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function TabelaDePendencias({ linhas, hoje, mostrarReuniao = true }: { linhas: PendenciaAberta[]; hoje: string; mostrarReuniao?: boolean }) {
  const operar = useOperarReuniao();
  return (
    <table className="w-full min-w-[820px] border-collapse text-sm">
      <thead>
        <tr>
          <Th className="text-left">Ação</Th>
          <Th className="w-36">Responsáveis</Th>
          <Th className="w-36">Situação</Th>
          <Th className="w-32">Prazo</Th>
          {mostrarReuniao && <Th className="w-40">Reunião</Th>}
        </tr>
      </thead>
      <tbody>
        {linhas.map(({ reuniao, item }) => {
          const dias = diasParaPrazo(item.prazo, hoje);
          const atrasada = itemAtrasado(item, hoje);
          return (
            <tr key={`${reuniao.id}:${item.id}`} className="hover:bg-muted/40">
              <Td className="px-3 py-1.5"><span className="whitespace-pre-wrap">{item.descricao}</span></Td>
              <Td className="text-center"><Pessoas nomes={item.responsaveis} /></Td>
              <Td>
                <CelulaStatus item={item} hoje={hoje} onChange={(s) => operar(reuniao.id, { op: "item_alterar", itemId: item.id, campos: { status: s } })} />
              </Td>
              <Td className="text-center text-[13px]">
                {item.prazo ? (
                  <span style={atrasada ? { color: COR.vermelho, fontWeight: 600 } : undefined}>
                    {dataBr(item.prazo)}
                    {atrasada && dias ? <span className="block text-[11px]">{dias} d de atraso</span> : null}
                  </span>
                ) : <span className="text-muted-foreground">—</span>}
              </Td>
              {mostrarReuniao && (
                <Td className="text-center text-[13px]">
                  <Link to="/qualidade/atas/$reuniaoId" params={{ reuniaoId: reuniao.id }} className="hover:underline">nº {reuniao.numero} · {dataBr(reuniao.data)}</Link>
                </Td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function QuadroDePendencias({ reunioes, grupo, hoje }: { reunioes: Reuniao[]; grupo: string; hoje: string }) {
  const [agrupar, setAgrupar] = useState<"responsavel" | "reuniao">("responsavel");
  const todas = useMemo(() => pendenciasDoGrupo(reunioes, grupo), [reunioes, grupo]);

  const grupos = useMemo(() => {
    const porPrazo = (a: PendenciaAberta, b: PendenciaAberta) => (a.item.prazo ?? "9999").localeCompare(b.item.prazo ?? "9999");
    if (agrupar === "reuniao") {
      const m = new Map<string, PendenciaAberta[]>();
      for (const p of todas) m.set(p.reuniao.id, [...(m.get(p.reuniao.id) ?? []), p]);
      return [...m.values()]
        .sort((a, b) => b[0].reuniao.numero - a[0].reuniao.numero)
        .map((l) => ({ chave: l[0].reuniao.id, titulo: `Reunião nº ${l[0].reuniao.numero} · ${dataBr(l[0].reuniao.data)}`, linhas: l.sort(porPrazo) }));
    }
    const m = new Map<string, PendenciaAberta[]>();
    for (const p of todas) for (const n of p.item.responsaveis.length ? p.item.responsaveis : ["Sem responsável"]) m.set(n, [...(m.get(n) ?? []), p]);
    return [...m.entries()]
      .sort((a, b) => (a[0] === "Sem responsável" ? 1 : b[0] === "Sem responsável" ? -1 : a[0].localeCompare(b[0], "pt-BR")))
      .map(([n, l]) => ({ chave: n, titulo: n, linhas: l.sort(porPrazo) }));
  }, [todas, agrupar]);

  if (todas.length === 0) {
    return <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">Nada pendente neste grupo. 🎉</div>;
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{todas.length} ação(ões) definidas em reunião e ainda não concluídas.</p>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Agrupar por</span>
          <Select value={agrupar} onValueChange={(v) => setAgrupar(v as typeof agrupar)}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="responsavel">Responsável</SelectItem>
              <SelectItem value="reuniao">Reunião</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {grupos.map((g, i) => (
        <Grupo
          key={g.chave}
          cor={CORES_DOS_GRUPOS[i % CORES_DOS_GRUPOS.length]}
          titulo={g.titulo}
          detalhe={`${g.linhas.length} pendência(s)${g.linhas.some((l) => itemAtrasado(l.item, hoje)) ? ` · ${g.linhas.filter((l) => itemAtrasado(l.item, hoje)).length} atrasada(s)` : ""}`}
        >
          <TabelaDePendencias linhas={g.linhas} hoje={hoje} mostrarReuniao={agrupar === "responsavel"} />
        </Grupo>
      ))}
    </div>
  );
}

function lerVisao(): "quadro" | "cards" {
  try {
    return localStorage.getItem("atas-visao") === "cards" ? "cards" : "quadro";
  } catch {
    return "quadro";
  }
}

export function ListaDeAtas() {
  const { data: reunioes = [], isLoading, isError, error } = useReunioes();
  const hoje = isoHoje();
  const [grupoEscolhido, setGrupoEscolhido] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [visao, setVisaoState] = useState<"quadro" | "cards">(lerVisao);
  const setVisao = (v: "quadro" | "cards") => {
    setVisaoState(v);
    try { localStorage.setItem("atas-visao", v); } catch { /* sem armazenamento: só não lembra */ }
  };

  const grupos = useMemo(() => gruposExistentes(reunioes), [reunioes]);
  const grupo = grupoEscolhido ?? (grupos.includes(GRUPO_PADRAO) ? GRUPO_PADRAO : grupos[0] ?? GRUPO_PADRAO);
  const doGrupo = useMemo(() => ordenarReunioes(reunioes.filter((r) => r.grupo === grupo)).reverse(), [reunioes, grupo]);

  const totais = useMemo(() => {
    const resumos = doGrupo.map((r) => resumirReuniao(r, hoje));
    const pend = pendenciasDoGrupo(reunioes, grupo);
    const atrasadas = pend.filter((p) => itemAtrasado(p.item, hoje)).length;
    const acoes = resumos.reduce((s, r) => s + r.acoes, 0);
    const conc = resumos.reduce((s, r) => s + r.concluidas, 0);
    const proxima = ordenarReunioes(doGrupo).find((r) => r.data >= hoje && r.status !== "encerrada") ?? null;
    return { reunioes: doGrupo.length, abertas: pend.length, atrasadas, pct: acoes === 0 ? 0 : Math.round((conc / acoes) * 100), proxima };
  }, [doGrupo, reunioes, grupo, hoje]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Qualidade - LAB"
        icon={ClipboardCheck}
        title={grupo}
        description="Atas de reunião: decisões, responsáveis, prazos e o que ficou pendente."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {grupos.length > 1 && (
              <Select value={grupo} onValueChange={setGrupoEscolhido}>
                <SelectTrigger className="h-9 w-64 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Button onClick={() => setNova(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Nova reunião</Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
      ) : isError ? (
        <div className="text-sm text-destructive">Não foi possível carregar as atas: {(error as Error).message}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Numero rotulo="Reuniões" valor={totais.reunioes} cor={COR.azul} />
            <Numero rotulo="Ações em aberto" valor={totais.abertas} cor={COR.laranja} />
            <Numero rotulo="Atrasadas" valor={totais.atrasadas} cor={totais.atrasadas > 0 ? COR.vermelho : COR.cinza} />
            <Numero rotulo="Ações concluídas" valor={`${totais.pct}%`} cor={COR.verde} />
            <div className="col-span-2 rounded-lg border bg-card p-4 lg:col-span-1" style={{ borderTop: `4px solid ${COR.roxo}` }}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Próxima reunião</div>
              {totais.proxima ? (
                <Link to="/qualidade/atas/$reuniaoId" params={{ reuniaoId: totais.proxima.id }} className="mt-1 block hover:underline">
                  <span className="text-lg font-bold">{dataBr(totais.proxima.data)}</span>
                  <span className="block truncate text-xs text-muted-foreground">nº {totais.proxima.numero}{totais.proxima.horaInicio ? ` · ${totais.proxima.horaInicio}` : ""}{totais.proxima.local ? ` · ${totais.proxima.local}` : ""}</span>
                </Link>
              ) : <div className="mt-1 text-sm text-muted-foreground">Nenhuma agendada</div>}
            </div>
          </div>

          <Tabs defaultValue="reunioes">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger value="reunioes">Reuniões</TabsTrigger>
                <TabsTrigger value="pendencias" className="gap-1.5">
                  Pendências
                  {totais.abertas > 0 && <span className="rounded-full px-1.5 text-[11px] font-semibold text-white" style={{ background: totais.atrasadas ? COR.vermelho : COR.laranja }}>{totais.abertas}</span>}
                </TabsTrigger>
              </TabsList>
              <div className="inline-flex rounded-md border bg-card p-0.5">
                {([["quadro", TableIcon, "Quadro"], ["cards", LayoutGrid, "Cards"]] as const).map(([v, Icone, rot]) => (
                  <button key={v} type="button" onClick={() => setVisao(v)}
                    className={cn("inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium", visao === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                    <Icone className="h-3.5 w-3.5" /> {rot}
                  </button>
                ))}
              </div>
            </div>

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
              ) : visao === "quadro" ? (
                <QuadroDeReunioes reunioes={doGrupo} hoje={hoje} />
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
