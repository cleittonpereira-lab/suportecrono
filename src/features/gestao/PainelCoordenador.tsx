/**
 * Painel do Coordenador (Fase 1) — a manhã do coordenador do laboratório: os
 * seis números do dia, a esteira da operação com o gargalo, os prazos com
 * previsão e risco, e os alertas que pedem ação. Cada número abre a lista que
 * o explica. Regras em lib/painel-coordenador.ts.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Gauge, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSchedule } from "@/hooks/use-schedule";
import { listRows } from "@/lib/programacao.functions";
import { SHEET_AMOSTRAS, SHEET_ENSAIOS, SHEET_PROGS, SHEET_TIPOS, parseProgramacaoRow } from "@/lib/programacao-model";
import { listPendenciasDigitacao } from "@/lib/lab-pendencias.functions";
import { fetchSharedChegadaState } from "@/lib/chegada-amostras.functions";
import { listarDatasAcordadas } from "@/lib/os-hub.functions";
import { isoHoje } from "@/features/lab/hooks/use-acoes-da-programacao";
import {
  SETORES,
  chaveOs,
  montarPainel,
  type Destino,
  type EtapaEsteira,
  type LinhaPrazo,
  type Setor,
} from "@/lib/painel-coordenador";

const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const ROTULO_SETOR: Record<Setor, string> = {
  todos: "Todos os setores",
  Especiais: "Especiais",
  Convencionais: "Convencionais",
  Dosagem: "Dosagem",
};

/** Link para um destino do painel (as rotas vêm da lógica, como texto). */
function Para({ destino, className, children }: { destino: Destino; className?: string; children: React.ReactNode }) {
  return (
    <Link to={destino.to as any} search={destino.search as any} className={className}>
      {children}
    </Link>
  );
}

function Tile({
  titulo,
  valor,
  detalhe,
  tom,
  destino,
}: {
  titulo: string;
  valor: number;
  detalhe: React.ReactNode;
  tom?: "crit" | "warn";
  destino: Destino;
}) {
  const borda = tom === "crit" && valor > 0 ? "border-rose-500/50" : "";
  const numero = tom === "crit" && valor > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground";
  return (
    <Para
      destino={destino}
      className={`group rounded-lg border bg-card p-3 grid gap-0.5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${borda}`}
    >
      <span className="text-[11px] leading-tight text-muted-foreground">{titulo}</span>
      <span className={`font-display text-3xl font-semibold tabular-nums ${numero}`}>{valor}</span>
      <span className="text-[11px] text-muted-foreground">{detalhe}</span>
    </Para>
  );
}

const Destaque = ({ n, tom, children }: { n: number; tom: "crit" | "warn"; children: React.ReactNode }) =>
  n > 0 ? (
    <b className={tom === "crit" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}>{children}</b>
  ) : (
    <>{children}</>
  );

function Etapa({ e, ultima }: { e: EtapaEsteira; ultima: boolean }) {
  return (
    <div className="relative">
      <Para
        destino={e.destino}
        className={`block h-full rounded-lg border p-3 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          e.gargalo ? "border-rose-500/60 bg-rose-500/5" : "bg-muted/30"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${e.gargalo ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
            {e.nome}
          </span>
          {e.gargalo && (
            <Badge variant="outline" className="border-rose-500/40 text-rose-600 dark:text-rose-400 text-[10px] px-1.5 py-0">
              gargalo
            </Badge>
          )}
        </div>
        <div className="font-display text-3xl font-semibold tabular-nums mt-1">{e.total}</div>
        <div className="text-[11px] text-muted-foreground">{e.rotuloTotal}</div>
        <div className="mt-1 text-[11px]">
          <Destaque n={e.parados} tom={e.gargalo || e.chave === "entrega" ? "crit" : "warn"}>
            {e.parados}
          </Destaque>{" "}
          <span className="text-muted-foreground">{e.rotuloParados}</span>
        </div>
      </Para>
      {!ultima && (
        <ChevronRight className="hidden md:block absolute -right-[13px] top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 z-10" aria-hidden />
      )}
    </div>
  );
}

function Situacao({ p }: { p: LinhaPrazo }) {
  if (p.situacao === "atraso") {
    return <Badge variant="outline" className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 text-[10px] whitespace-nowrap">{p.diasAtraso}d atraso</Badge>;
  }
  if (p.situacao === "risco") {
    return (
      <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] whitespace-nowrap" title={p.motivoRisco ?? undefined}>
        em risco
      </Badge>
    );
  }
  return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] whitespace-nowrap">no prazo</Badge>;
}

export function PainelCoordenador() {
  const qc = useQueryClient();
  const [setor, setSetor] = useState<Setor>("todos");
  const { data: schedule, isLoading: carregandoCronograma } = useSchedule();

  const datasFn = useServerFn(listarDatasAcordadas);
  const chegadaFn = useServerFn(fetchSharedChegadaState);
  const pendFn = useServerFn(listPendenciasDigitacao);
  const datas = useQuery({ queryKey: ["coordenacao", "datas-acordadas"], queryFn: () => datasFn(), staleTime: 60_000 });
  const chegada = useQuery({ queryKey: ["coordenacao", "chegada"], queryFn: () => chegadaFn(), staleTime: 60_000 });
  const pend = useQuery({ queryKey: ["lab-pendencias"], queryFn: () => pendFn(), refetchInterval: 60_000 });
  const aba = (sheet: string) => ({
    queryKey: ["coordenacao", sheet],
    queryFn: () => listRows({ data: { sheet } }),
    staleTime: 60_000,
  });
  const amostras = useQuery(aba(SHEET_AMOSTRAS));
  const ensaios = useQuery(aba(SHEET_ENSAIOS));
  const progs = useQuery(aba(SHEET_PROGS));
  const tipos = useQuery(aba(SHEET_TIPOS));

  const consultas = [datas, chegada, pend, amostras, ensaios, progs, tipos];
  const carregando = carregandoCronograma || consultas.some((q) => q.isLoading);
  const falha = consultas.find((q) => q.error)?.error as Error | undefined;

  const modelo = useMemo(() => {
    if (carregando) return null;
    const estado = chegada.data as { columns?: { id: string }[]; tasks?: Record<string, any[]> } | undefined;
    const chegadas = Object.entries(estado?.tasks ?? {}).flatMap(([coluna, lista]) =>
      (lista ?? []).map((t) => ({
        id: String(t.id),
        osCliente: String(t.osCliente ?? ""),
        dataChegada: String(t.dataChegada ?? ""),
        amostras: Array.isArray(t.amostras) && t.amostras.length ? t.amostras.length : 1,
        coluna,
      })),
    );
    const datasAcordadas = Object.fromEntries(
      Object.values(datas.data ?? {}).map((d) => [chaveOs(d.osNumero), { data: d.data, arquivada: d.arquivada }]),
    );
    return montarPainel({
      hoje: isoHoje(),
      setor,
      cronograma: schedule?.rows ?? [],
      datasAcordadas,
      chegadas,
      colunaFinal: estado?.columns?.at(-1)?.id ?? "os-sistema",
      amostras: (amostras.data ?? []).map((r: Record<string, string>) => ({
        id: r.id,
        os_numero: r.os_numero ?? "",
        codigo_amostra: r.codigo_amostra,
      })),
      ensaios: (ensaios.data ?? []).map((r: Record<string, string>) => ({
        id: r.id,
        amostra_id: r.amostra_id ?? "",
        tipo_ensaio_id: r.tipo_ensaio_id ?? "",
        status: r.status ?? "",
        created_at: r.created_at,
        etiqueta: r.etiqueta,
      })),
      programacoes: (progs.data ?? []).map(parseProgramacaoRow),
      tipos: (tipos.data ?? []).map((r: Record<string, string>) => ({ id: r.id, nome: r.nome ?? "" })),
      pendencias: pend.data ?? [],
    });
  }, [carregando, setor, schedule, datas.data, chegada.data, amostras.data, ensaios.data, progs.data, tipos.data, pend.data]);

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ["coordenacao"] });
    qc.invalidateQueries({ queryKey: ["lab-pendencias"] });
  };
  const hoje = isoHoje();

  return (
    <div className="space-y-6 w-full px-4 sm:px-6 md:px-8 py-6">
      <PageHeader
        eyebrow="Gestão · Coordenação do laboratório"
        icon={Gauge}
        title="Painel do coordenador"
        description="O que chegou, o que está parado, o que está rodando e o que vence — cada número abre a lista que o explica."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={atualizar}>
            <RefreshCw className={`h-4 w-4 ${consultas.some((q) => q.isFetching) ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-md border bg-muted/40 p-1" role="tablist" aria-label="Setor">
          {SETORES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={setor === s}
              onClick={() => setSetor(s)}
              className={`rounded px-3 py-1 text-xs transition-colors ${
                setor === s ? "bg-background shadow-sm text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {ROTULO_SETOR[s]}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          Hoje, {br(hoje)} · “parado” = 2 dias úteis ou mais na mesma situação
        </span>
      </div>

      {falha && <p className="text-sm text-destructive">Não foi possível ler parte dos dados: {falha.message}</p>}

      {!modelo ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lendo chegada, programação, cronograma e laudos…
        </p>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <Tile
              titulo="Amostras recebidas (7 dias)"
              valor={modelo.tiles.recebidas.amostras}
              detalhe={`${modelo.tiles.recebidas.registros} registro(s) de chegada`}
              destino={{ to: "/chegada-amostras" }}
            />
            <Tile
              titulo="Aguardando programação"
              valor={modelo.tiles.aguardandoProgramacao.total}
              detalhe={<><Destaque n={modelo.tiles.aguardandoProgramacao.parados} tom="warn">{modelo.tiles.aguardandoProgramacao.parados}</Destaque> há 2+ dias úteis</>}
              destino={{ to: "/programacao/gantt" }}
            />
            <Tile
              titulo="Ensaios em andamento"
              valor={modelo.tiles.emAndamento.total}
              detalhe={<><Destaque n={modelo.tiles.emAndamento.alemDoPrevisto} tom="warn">{modelo.tiles.emAndamento.alemDoPrevisto}</Destaque> além do fim previsto</>}
              destino={{ to: "/relatorio/digitalizacao/fila" }}
            />
            <Tile
              titulo="Entregas nos próximos 7 dias"
              valor={modelo.tiles.entregas7d.total}
              detalhe={<><Destaque n={modelo.tiles.entregas7d.emRisco} tom="warn">{modelo.tiles.entregas7d.emRisco}</Destaque> em risco</>}
              destino={{ to: "/entregas" }}
            />
            <Tile
              titulo="Entregas atrasadas"
              valor={modelo.tiles.atrasadas.total}
              detalhe={modelo.tiles.atrasadas.total ? <>maior atraso <Destaque n={1} tom="crit">{modelo.tiles.atrasadas.maiorAtraso} dias</Destaque></> : "nenhuma"}
              tom="crit"
              destino={{ to: "/entregas" }}
            />
            <Tile
              titulo="Laudos parados"
              valor={modelo.tiles.laudosParados.total}
              detalhe={modelo.tiles.laudosParados.total ? <>mais antigo: <Destaque n={1} tom="warn">{modelo.tiles.laudosParados.maisAntigoDias} dias úteis</Destaque></> : "nenhum há 2+ dias úteis"}
              destino={{ to: "/relatorio/pendentes", search: { tab: "fluxo-relatorios" } }}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-baseline justify-between gap-2 flex-wrap">
                Esteira da operação
                <span className="text-xs font-normal text-muted-foreground">o que está em cada etapa agora — e quanto está parado</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-5">
                {modelo.esteira.map((e, i) => (
                  <Etapa key={e.chave} e={e} ultima={i === modelo.esteira.length - 1} />
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr] items-start">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-baseline justify-between gap-2 flex-wrap">
                  Prazos · atrasadas e próximos 15 dias
                  <span className="text-xs font-normal text-muted-foreground">{modelo.prazos.length} OS · mais urgente primeiro</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {modelo.prazos.length === 0 ? (
                  <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhuma entrega em aberto nos próximos 15 dias.</p>
                ) : (
                  <div className="max-h-[520px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="w-24">OS</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead className="w-24">Entrega</TableHead>
                          <TableHead className="w-24">Previsão</TableHead>
                          <TableHead>O que falta</TableHead>
                          <TableHead className="w-24">Situação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {modelo.prazos.map((p) => (
                          <TableRow key={p.chave}>
                            <TableCell className="font-mono text-xs font-medium">{p.os}</TableCell>
                            <TableCell className="text-xs max-w-[200px] truncate" title={p.cliente}>{p.cliente || "—"}</TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {br(p.entrega)}
                              <div className="text-[10px] text-muted-foreground">
                                {p.fonte === "acordada" ? "acordada" : "cronograma"}
                                {p.divergente ? ` · cron. ${br(p.dataCronograma)}` : ""}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs tabular-nums">
                              {p.previsao ? br(p.previsao) : <span className="text-muted-foreground">sem previsão</span>}
                            </TableCell>
                            <TableCell className="text-xs">
                              {p.falta}
                              {p.motivoRisco && <div className="text-[10px] text-amber-700 dark:text-amber-400">{p.motivoRisco}</div>}
                            </TableCell>
                            <TableCell>
                              <Situacao p={p} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-baseline justify-between gap-2">
                  Alertas
                  <span className="text-xs font-normal text-muted-foreground">o que pede ação hoje</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {modelo.alertas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nada pedindo ação agora.</p>
                ) : (
                  <ul className="grid gap-2">
                    {modelo.alertas.map((a, i) => (
                      <li key={i}>
                        <Para
                          destino={a.destino}
                          className={`block rounded-md border-l-4 bg-muted/30 px-3 py-2 hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            a.nivel === "crit" ? "border-l-rose-500" : "border-l-amber-500"
                          }`}
                        >
                          <div className="text-sm leading-snug">{a.texto}</div>
                          <div className="text-[11px] text-muted-foreground">{a.detalhe}</div>
                        </Para>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
