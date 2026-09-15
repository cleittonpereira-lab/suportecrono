/**
 * Painel do Coordenador (Fase 1) — a manhã do coordenador do laboratório: os
 * seis números do dia, a esteira da operação com o gargalo, os prazos com
 * previsão e risco, e os alertas que pedem ação. Cada número abre a lista que
 * o explica. Regras em lib/painel-coordenador.ts.
 */
import { Fragment, useMemo, useState } from "react";
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
import { SHEET_AMOSTRAS, SHEET_ENSAIOS, SHEET_EQUIPS, SHEET_PROGS, SHEET_TIPOS, parseProgramacaoRow } from "@/lib/programacao-model";
import { listPendenciasDigitacao } from "@/lib/lab-pendencias.functions";
import { fetchSharedChegadaState } from "@/lib/chegada-amostras.functions";
import { listarDatasAcordadas } from "@/lib/os-hub.functions";
import { isoHoje } from "@/features/lab/hooks/use-acoes-da-programacao";
import { useEntregues } from "@/hooks/use-entregues";
import { AvisosDoPainel } from "@/features/gestao/AvisosDoPainel";
import { montarDesempenho, type Desempenho, type SerieSemanal } from "@/lib/painel-desempenho";
import {
  SETORES,
  entradaDasFontes,
  montarPainel,
  type Bancada as BancadaModelo,
  type CargaTecnico,
  type Destino,
  type EnsaioLongo,
  type EstadoDia,
  type EtapaDeLaudo,
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

/* ------------------------------ Fase 2 ------------------------------ */

const DIA_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const rotuloDia = (iso: string) => `${DIA_DA_SEMANA[new Date(`${iso}T12:00:00`).getDay()]} ${iso.slice(8, 10)}`;
const COR_DO_DIA: Record<EstadoDia, string> = {
  livre: "bg-muted",
  ocupado: "bg-primary/40",
  atrasado: "bg-rose-500/70",
};

function GradeOcupacao({ bancada }: { bancada: BancadaModelo }) {
  if (bancada.equipamentos.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum equipamento com ensaio neste setor.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div
          className="grid items-center gap-[3px] text-[11px] min-w-[560px]"
          style={{ gridTemplateColumns: "minmax(150px,1.7fr) repeat(7, minmax(34px,1fr)) minmax(92px,auto)" }}
          role="table"
          aria-label="Ocupação dos equipamentos por dia útil"
        >
          <span />
          {bancada.dias.map((d, i) => (
            <span key={d} className={`text-center text-[10px] ${i === 0 ? "font-semibold text-primary" : "text-muted-foreground"}`}>
              {rotuloDia(d)}
            </span>
          ))}
          <span className="text-right text-[10px] text-muted-foreground">livre a partir de</span>
          {bancada.equipamentos.map((q) => (
            <Fragment key={q.id}>
              <span className="truncate pr-2" title={`${q.nome} · ${q.ensaios} ensaio(s) na janela`}>
                {q.nome}
              </span>
              {q.dias.map((s, i) => (
                <span
                  key={i}
                  className={`h-5 rounded-sm ${COR_DO_DIA[s]}`}
                  title={`${rotuloDia(bancada.dias[i])}: ${s === "livre" ? "livre" : s === "ocupado" ? "ocupado" : "ensaio além do fim previsto"}`}
                />
              ))}
              <span className={`text-right tabular-nums ${q.comAtraso ? "text-rose-600 dark:text-rose-400 font-medium" : "text-muted-foreground"}`}>
                {q.comAtraso ? "ensaio atrasado" : q.dias[0] === "livre" ? "livre hoje" : br(q.livreEm)}
              </span>
            </Fragment>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className={`inline-block h-2.5 w-2.5 rounded-sm ${COR_DO_DIA.ocupado}`} />ocupado</span>
        <span className="flex items-center gap-1.5"><i className={`inline-block h-2.5 w-2.5 rounded-sm ${COR_DO_DIA.livre}`} />livre</span>
        <span className="flex items-center gap-1.5"><i className={`inline-block h-2.5 w-2.5 rounded-sm ${COR_DO_DIA.atrasado}`} />ensaio passou do fim previsto</span>
      </div>
    </div>
  );
}

/** Os mais adiantados primeiro; o resto fica na Minha fila / Gantt. */
const LONGOS_VISIVEIS = 8;

function ListaLongos({ longos }: { longos: EnsaioLongo[] }) {
  if (longos.length === 0) return <p className="text-sm text-muted-foreground">Nenhum ensaio longo em execução.</p>;
  const resto = longos.length - LONGOS_VISIVEIS;
  return (
    <ul className="grid gap-3">
      {resto > 0 && (
        <li className="-mt-1 text-[11px] text-muted-foreground">
          Os {LONGOS_VISIVEIS} mais adiantados de {longos.length} ·{" "}
          <Para destino={{ to: "/relatorio/digitalizacao/fila" }} className="underline underline-offset-2 hover:text-foreground">
            ver todos na fila
          </Para>
        </li>
      )}
      {longos.slice(0, LONGOS_VISIVEIS).map((l) => {
        const pct = Math.min(100, Math.round((l.dia / Math.max(1, l.de)) * 100));
        return (
          <li key={l.id} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium truncate">{l.ensaio}</span>
              <span className={`text-xs tabular-nums whitespace-nowrap ${l.atrasado ? "text-rose-600 dark:text-rose-400 font-medium" : ""}`}>
                dia {l.dia} de {l.de}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${l.atrasado ? "bg-rose-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              OS {l.os} · {l.amostra} · {l.equipamento}
              {l.tecnico ? ` · ${l.tecnico}` : ""}
              {l.fimPrevisto ? ` · fim previsto ${br(l.fimPrevisto)}` : ""}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TabelaTecnicos({ tecnicos }: { tecnicos: CargaTecnico[] }) {
  if (tecnicos.length === 0) {
    return <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum ensaio em execução ou programado para os próximos dias.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>Técnico</TableHead>
            <TableHead className="text-right">Em execução</TableHead>
            <TableHead className="text-right">Programados (7 dias úteis)</TableHead>
            <TableHead className="text-right">Além do previsto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tecnicos.map((t) => (
            <TableRow key={t.nome}>
              <TableCell className={`text-xs ${t.nome === "Sem técnico" ? "italic text-muted-foreground" : "font-medium"}`}>{t.nome}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{t.emExecucao}</TableCell>
              <TableCell className="text-right text-xs tabular-nums">{t.programados}</TableCell>
              <TableCell className={`text-right text-xs tabular-nums ${t.alemDoPrevisto ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
                {t.alemDoPrevisto}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ColunasLaudos({ etapas }: { etapas: EtapaDeLaudo[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {etapas.map((et) => (
        <Para
          key={et.chave}
          destino={{ to: "/relatorio/pendentes", search: { tab: "fluxo-relatorios" } }}
          className="grid content-start gap-2 rounded-lg border bg-muted/20 p-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold">{et.nome}</span>
            <span className="font-display text-xl font-semibold tabular-nums">{et.total}</span>
          </div>
          <div className="text-[11px]">
            {et.parados ? (
              <b className="text-amber-600 dark:text-amber-400">{et.parados} parado(s) há 2+ dias úteis</b>
            ) : (
              <span className="text-muted-foreground">nenhum parado</span>
            )}
          </div>
          {et.itens.length > 0 && (
            <ul className="grid gap-1.5 border-t pt-2">
              {et.itens.map((i) => (
                <li key={i.id} className="text-[11px] leading-snug">
                  <div className="flex justify-between gap-2">
                    <span className="truncate font-medium">{i.ensaio}</span>
                    <span
                      className={`whitespace-nowrap tabular-nums ${i.idade >= 2 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                      title="dias úteis na mesma etapa"
                    >
                      {i.idade}d
                    </span>
                  </div>
                  <div className="truncate text-muted-foreground">
                    OS {i.os}
                    {i.amostra ? ` · ${i.amostra}` : ""}
                    {i.pessoa ? ` · ${i.papel} ${i.pessoa}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Para>
      ))}
    </div>
  );
}

/* ------------------------------ Fase 3 ------------------------------ */

const fmtMedia = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Uma medida por semana: número da semana atual, média e barras (a atual em destaque). */
function MiniSerie({ s, semanas }: { s: SerieSemanal; semanas: string[] }) {
  const max = Math.max(1, ...s.valores);
  return (
    <Para
      destino={s.destino}
      className="grid content-start gap-2 rounded-lg border bg-card p-3 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="text-[11px] leading-tight text-muted-foreground">{s.nome}</span>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-2xl font-semibold tabular-nums">{s.atual}</span>
        <span className="text-[11px] text-muted-foreground">nesta semana · média {fmtMedia(s.media)}</span>
      </div>
      <div className="flex h-14 items-end gap-[2px]" role="img" aria-label={`${s.nome} por semana: ${s.valores.join(", ")}`}>
        {s.valores.map((v, i) => (
          <div key={semanas[i]} className="group relative flex h-full flex-1 items-end">
            <div
              className={`w-full rounded-t-[3px] ${v === 0 ? "bg-muted" : i === s.valores.length - 1 ? "bg-primary" : "bg-primary/40"}`}
              style={{ height: v === 0 ? "3px" : `${Math.max(8, (v / max) * 100)}%` }}
            />
            <span className="pointer-events-none absolute -top-6 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border bg-popover px-1.5 py-0.5 text-[10px] text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              sem. {br(semanas[i])}: {v}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{br(semanas[0])}</span>
        <span>esta semana</span>
      </div>
    </Para>
  );
}

function BlocoDesempenho({ d }: { d: Desempenho }) {
  const { pct, noPrazo, total, pctAnterior } = d.noPrazo;
  const diferenca = pct !== null && pctAnterior !== null ? pct - pctAnterior : null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {d.series.map((s) => (
        <MiniSerie key={s.chave} s={s} semanas={d.semanas} />
      ))}
      <div className="grid content-start gap-1 rounded-lg border bg-card p-3">
        <span className="text-[11px] text-muted-foreground">Entregas no prazo</span>
        <span className="font-display text-3xl font-semibold tabular-nums">{pct === null ? "—" : `${pct}%`}</span>
        <span className="text-[11px] text-muted-foreground">
          {total ? `${noPrazo} de ${total} entregas nas 8 semanas` : "sem entregas com data programada"}
        </span>
        {diferenca !== null && (
          <span className={`text-[11px] font-medium ${diferenca >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {diferenca >= 0 ? "▲" : "▼"} {Math.abs(diferenca)} p.p. vs. as 8 semanas anteriores ({pctAnterior}%)
          </span>
        )}
      </div>
      <div className="grid content-start gap-1 rounded-lg border bg-card p-3">
        <span className="text-[11px] text-muted-foreground">Da chegada à entrega</span>
        <span className="font-display text-3xl font-semibold tabular-nums">
          {d.tempoAteEntrega.mediana === null ? "—" : `${d.tempoAteEntrega.mediana} dias`}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {d.tempoAteEntrega.n ? `mediana de ${d.tempoAteEntrega.n} OS entregues` : "registre o Nº da OS na chegada para medir"}
        </span>
      </div>
    </div>
  );
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
  const equips = useQuery(aba(SHEET_EQUIPS));

  const consultas = [datas, chegada, pend, amostras, ensaios, progs, tipos, equips];
  const carregando = carregandoCronograma || consultas.some((q) => q.isLoading);
  const falha = consultas.find((q) => q.error)?.error as Error | undefined;

  const entregues = useEntregues();

  // As mesmas fontes que o servidor usa no agendamento (lib/painel-coordenador.ts → entradaDasFontes).
  const entrada = useMemo(() => {
    if (carregando) return null;
    return entradaDasFontes({
      hoje: isoHoje(),
      setor,
      cronograma: schedule?.rows ?? [],
      datasAcordadas: datas.data ?? {},
      chegada: chegada.data as { columns?: { id: string }[]; tasks?: Record<string, unknown[]> } | undefined,
      amostras: amostras.data ?? [],
      ensaios: ensaios.data ?? [],
      programacoes: (progs.data ?? []).map(parseProgramacaoRow),
      tipos: tipos.data ?? [],
      equipamentos: equips.data ?? [],
      pendencias: pend.data ?? [],
    });
  }, [carregando, setor, schedule, datas.data, chegada.data, amostras.data, ensaios.data, progs.data, tipos.data, equips.data, pend.data]);
  const modelo = useMemo(() => (entrada ? montarPainel(entrada) : null), [entrada]);
  const desempenho = useMemo(
    () => (entrada ? montarDesempenho(entrada, entregues.data?.rows ?? []) : null),
    [entrada, entregues.data],
  );

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
          <div className="flex flex-wrap items-center gap-2">
            <AvisosDoPainel />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={atualizar}>
            <RefreshCw className={`h-4 w-4 ${consultas.some((q) => q.isFetching) ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
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

          <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr] items-start">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-baseline justify-between gap-2 flex-wrap">
                  Bancada · ocupação dos equipamentos
                  <span className="text-xs font-normal text-muted-foreground">próximos {modelo.bancada.dias.length} dias úteis</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GradeOcupacao bancada={modelo.bancada} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-baseline justify-between gap-2">
                  Ensaios longos em curso
                  <span className="text-xs font-normal text-muted-foreground">3 dias ou mais</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ListaLongos longos={modelo.bancada.longos} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.55fr] items-start">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Técnicos · carga de trabalho</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <TabelaTecnicos tecnicos={modelo.bancada.tecnicos} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-baseline justify-between gap-2 flex-wrap">
                  Laudos · com quem estão
                  <span className="text-xs font-normal text-muted-foreground">idade = dias úteis na mesma etapa</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ColunasLaudos etapas={modelo.laudos} />
              </CardContent>
            </Card>
          </div>

          {desempenho && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-baseline justify-between gap-2 flex-wrap">
                  Desempenho · últimas 8 semanas
                  <span className="text-xs font-normal text-muted-foreground">semanas de segunda a domingo · a última ainda em curso</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BlocoDesempenho d={desempenho} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
