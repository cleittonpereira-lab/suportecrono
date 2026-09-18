/**
 * Painel do Coordenador — a manhã do coordenador do laboratório: os seis
 * números do dia, a esteira da operação com o gargalo, os prazos com
 * previsão e risco, os alertas que pedem ação, a bancada e os laudos.
 *
 * Fase 4 (interatividade): cada quadro abre um painel de detalhe (Sheet) ao
 * clicar — a lista por trás do número, com mais linhas, mais colunas e (na
 * bancada) uma janela de dias maior — em vez de navegar direto pra outra
 * página. O link para a página cheia continua disponível dentro do detalhe,
 * pra quem quiser agir (reprogramar, editar prazo etc.). Regras em
 * lib/painel-coordenador.ts.
 */
import { Fragment, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight, ChevronRight, Gauge, Loader2, RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
  JANELA_ENTREGAS,
  SETORES,
  entradaDasFontes,
  montarBancadaComJanela,
  montarPainel,
  somaDias,
  type Bancada as BancadaModelo,
  type CargaTecnico,
  type Destino,
  type EnsaioLongo,
  type EstadoDia,
  type EtapaDeLaudo,
  type EtapaEsteira,
  type ItemBancada,
  type LaudoNaEtapa,
  type LinhaPrazo,
  type PainelModelo,
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

/* --------------------------- Fase 4: o detalhe --------------------------- */

/** Qual painel de detalhe está aberto — cada quadro clicável vira um destes. */
type DetalheAberto =
  | { tipo: "recebidas" }
  | { tipo: "recebimento" }
  | { tipo: "aguardandoProgramacao" }
  | { tipo: "emAndamento" }
  | { tipo: "entregas7d" }
  | { tipo: "atrasadas" }
  | { tipo: "laudosParados" }
  | { tipo: "laudoEtapa"; chave: EtapaDeLaudo["chave"] }
  | { tipo: "prazo"; chave: string }
  | { tipo: "equipamento"; id: string }
  | { tipo: "tecnico"; nome: string }
  | { tipo: "semana"; chave: SerieSemanal["chave"] };

const JANELAS_BANCADA = [7, 14, 30] as const;

function SeletorJanela({ dias, onChange }: { dias: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1 rounded-md border bg-muted/40 p-0.5" role="tablist" aria-label="Dias úteis exibidos">
      {JANELAS_BANCADA.map((n) => (
        <button
          key={n}
          type="button"
          role="tab"
          aria-selected={dias === n}
          onClick={() => onChange(n)}
          className={`rounded px-2 py-1 text-[11px] transition-colors ${
            dias === n ? "bg-background shadow-sm text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {n}d
        </button>
      ))}
    </div>
  );
}

function LinhaVazia({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Tabela de itens de bancada (equipamento ou técnico) — reaproveitada nos dois detalhes. */
function TabelaItensBancada({ itens, coluna }: { itens: ItemBancada[]; coluna: "equipamento" | "tecnico" }) {
  if (itens.length === 0) return <LinhaVazia>Nada nesta janela de dias.</LinhaVazia>;
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40">
          <TableHead>Ensaio</TableHead>
          <TableHead>OS · Amostra</TableHead>
          <TableHead>{coluna === "equipamento" ? "Técnico" : "Equipamento"}</TableHead>
          <TableHead>Início</TableHead>
          <TableHead>Fim previsto</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {itens.map((i) => (
          <TableRow key={i.id}>
            <TableCell className="text-xs font-medium">{i.ensaio}</TableCell>
            <TableCell className="text-xs">
              {i.os}
              <div className="text-[10px] text-muted-foreground">{i.amostra}</div>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {coluna === "equipamento" ? i.tecnico || "—" : i.equipamento}
            </TableCell>
            <TableCell className="text-xs tabular-nums">{br(i.inicio)}</TableCell>
            <TableCell className={`text-xs tabular-nums ${i.atrasado ? "text-rose-600 dark:text-rose-400 font-medium" : ""}`}>
              {br(i.fim)}
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={`text-[10px] ${i.atrasado ? "border-rose-500/40 text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}
              >
                {i.atrasado ? "atrasado" : i.status === "em_execucao" ? "em execução" : "programado"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TabelaLaudos({ itens }: { itens: LaudoNaEtapa[] }) {
  if (itens.length === 0) return <LinhaVazia>Nada aqui agora.</LinhaVazia>;
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40">
          <TableHead>Ensaio</TableHead>
          <TableHead>OS · Amostra</TableHead>
          <TableHead>Com quem</TableHead>
          <TableHead className="text-right">Idade</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {itens.map((i) => (
          <TableRow key={i.id}>
            <TableCell className="text-xs font-medium">{i.ensaio}</TableCell>
            <TableCell className="text-xs">
              {i.os}
              {i.amostra ? <div className="text-[10px] text-muted-foreground">{i.amostra}</div> : null}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{i.pessoa ? `${i.papel} ${i.pessoa}` : "—"}</TableCell>
            <TableCell className={`text-right text-xs tabular-nums ${i.idade >= 2 ? "text-amber-600 dark:text-amber-400 font-medium" : ""}`}>
              {i.idade}d
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TabelaPrazos({ linhas, onLinha }: { linhas: LinhaPrazo[]; onLinha: (chave: string) => void }) {
  if (linhas.length === 0) return <LinhaVazia>Nenhuma OS nesta lista.</LinhaVazia>;
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40">
          <TableHead>OS</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Entrega</TableHead>
          <TableHead>O que falta</TableHead>
          <TableHead>Situação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((p) => (
          <TableRow key={p.chave} className="cursor-pointer hover:bg-muted/50" onClick={() => onLinha(p.chave)}>
            <TableCell className="font-mono text-xs font-medium">{p.os}</TableCell>
            <TableCell className="text-xs max-w-[160px] truncate" title={p.cliente}>{p.cliente || "—"}</TableCell>
            <TableCell className="text-xs tabular-nums">{br(p.entrega)}</TableCell>
            <TableCell className="text-xs max-w-[220px] truncate" title={p.falta}>{p.falta}</TableCell>
            <TableCell><Situacao p={p} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** O conteúdo do painel de detalhe — muda conforme o quadro que foi clicado. */
function ConteudoDetalhe({
  aberto, modelo, bancadaJanela, diasBancada, onDiasBancada, desempenho, onAbrirPrazo,
}: {
  aberto: DetalheAberto;
  modelo: PainelModelo;
  bancadaJanela: BancadaModelo;
  diasBancada: number;
  onDiasBancada: (n: number) => void;
  desempenho: Desempenho | null;
  onAbrirPrazo: (chave: string) => void;
}) {
  switch (aberto.tipo) {
    case "recebidas":
      return (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>OS</TableHead><TableHead>Cliente</TableHead><TableHead>Chegada</TableHead><TableHead className="text-right">Amostras</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modelo.detalhes.recebidas.length === 0 ? (
              <TableRow><TableCell colSpan={4}><LinhaVazia>Nenhuma chegada nos últimos 7 dias.</LinhaVazia></TableCell></TableRow>
            ) : modelo.detalhes.recebidas.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.os}</TableCell>
                <TableCell className="text-xs max-w-[200px] truncate" title={c.cliente}>{c.cliente || "—"}</TableCell>
                <TableCell className="text-xs tabular-nums">{br(c.data)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{c.amostras}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    case "recebimento":
      return (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>OS</TableHead><TableHead>Cliente</TableHead><TableHead>Chegada</TableHead><TableHead className="text-right">Amostras</TableHead><TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modelo.detalhes.noRecebimento.length === 0 ? (
              <TableRow><TableCell colSpan={5}><LinhaVazia>Nada no fluxo de chegada agora.</LinhaVazia></TableCell></TableRow>
            ) : modelo.detalhes.noRecebimento.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.os}</TableCell>
                <TableCell className="text-xs max-w-[180px] truncate" title={c.cliente}>{c.cliente || "—"}</TableCell>
                <TableCell className="text-xs tabular-nums">{br(c.data)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{c.amostras}</TableCell>
                <TableCell>
                  {c.parado ? <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 text-[10px]">parado</Badge> : <span className="text-[11px] text-muted-foreground">em dia</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    case "aguardandoProgramacao":
      return (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Ensaio</TableHead><TableHead>OS · Amostra</TableHead><TableHead>Criado em</TableHead><TableHead className="text-right">Dias parado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modelo.detalhes.aguardandoProgramacao.length === 0 ? (
              <TableRow><TableCell colSpan={4}><LinhaVazia>Nada esperando programação.</LinhaVazia></TableCell></TableRow>
            ) : modelo.detalhes.aguardandoProgramacao.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="text-xs font-medium">{i.ensaio}</TableCell>
                <TableCell className="text-xs">{i.os}<div className="text-[10px] text-muted-foreground">{i.amostra}</div></TableCell>
                <TableCell className="text-xs tabular-nums">{br(i.criadoEm)}</TableCell>
                <TableCell className={`text-right text-xs tabular-nums ${i.diasParado >= 2 ? "text-amber-600 dark:text-amber-400 font-medium" : ""}`}>{i.diasParado}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    case "emAndamento":
      return (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Ensaio</TableHead><TableHead>OS · Amostra</TableHead><TableHead>Equipamento</TableHead><TableHead>Técnico</TableHead><TableHead>Fim previsto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modelo.detalhes.emAndamento.length === 0 ? (
              <TableRow><TableCell colSpan={5}><LinhaVazia>Nada em execução agora.</LinhaVazia></TableCell></TableRow>
            ) : modelo.detalhes.emAndamento.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="text-xs font-medium">{i.ensaio}</TableCell>
                <TableCell className="text-xs">{i.os}<div className="text-[10px] text-muted-foreground">{i.amostra}</div></TableCell>
                <TableCell className="text-xs text-muted-foreground">{i.equipamento}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{i.tecnico || "—"}</TableCell>
                <TableCell className={`text-xs tabular-nums ${i.alemDoPrevisto ? "text-rose-600 dark:text-rose-400 font-medium" : ""}`}>
                  {br(i.fimPrevisto)}{i.alemDoPrevisto ? " · vencido" : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    case "entregas7d": {
      const limite = somaDias(isoHoje(), JANELA_ENTREGAS);
      const lista = modelo.prazos.filter((p) => p.situacao !== "atraso" && p.entrega <= limite);
      return <TabelaPrazos linhas={lista} onLinha={onAbrirPrazo} />;
    }
    case "atrasadas":
      return <TabelaPrazos linhas={modelo.prazos.filter((p) => p.situacao === "atraso")} onLinha={onAbrirPrazo} />;
    case "laudosParados":
      return <TabelaLaudos itens={modelo.detalhes.laudosParados} />;
    case "laudoEtapa": {
      const etapa = modelo.laudos.find((l) => l.chave === aberto.chave);
      return <TabelaLaudos itens={etapa?.itens ?? []} />;
    }
    case "prazo": {
      const p = modelo.prazos.find((x) => x.chave === aberto.chave);
      if (!p) return <LinhaVazia>OS não encontrada — pode ter saído da lista.</LinhaVazia>;
      return (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-semibold">OS {p.os}</span>
              <Situacao p={p} />
            </div>
            <div className="text-xs text-muted-foreground">{p.cliente || "Cliente não informado"}</div>
            <div className="text-xs">
              Entrega <b>{br(p.entrega)}</b> ({p.fonte === "acordada" ? "data acordada" : "cronograma"})
              {p.divergente ? <span className="text-amber-700 dark:text-amber-400"> · cronograma diz {br(p.dataCronograma)}</span> : null}
            </div>
            {p.motivoRisco && <div className="text-xs text-amber-700 dark:text-amber-400">{p.motivoRisco}</div>}
          </div>
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ensaios da OS</h4>
            {p.ensaiosDetalhe.length === 0 ? (
              <LinhaVazia>Nenhum ensaio desta OS na Programação.</LinhaVazia>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Ensaio</TableHead><TableHead>Status</TableHead><TableHead>Técnico</TableHead><TableHead>Início</TableHead><TableHead>Fim</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.ensaiosDetalhe.map((en) => (
                    <TableRow key={en.id}>
                      <TableCell className="text-xs font-medium">{en.ensaio}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{en.status === "sem_programacao" ? "sem programação" : en.status}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{en.tecnico || "—"}</TableCell>
                      <TableCell className="text-xs tabular-nums">{br(en.inicio)}</TableCell>
                      <TableCell className="text-xs tabular-nums">{br(en.fim)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Laudos em andamento</h4>
            <TabelaLaudos itens={p.laudosDetalhe} />
          </div>
        </div>
      );
    }
    case "equipamento": {
      const eq = bancadaJanela.equipamentos.find((q) => q.id === aberto.id);
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Janela de dias úteis exibida</span>
            <SeletorJanela dias={diasBancada} onChange={onDiasBancada} />
          </div>
          {!eq ? <LinhaVazia>Equipamento não encontrado nesta janela.</LinhaVazia> : (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{eq.ensaios} ensaio(s) na janela</span>
                {eq.comAtraso ? (
                  <Badge variant="outline" className="border-rose-500/40 text-rose-600 dark:text-rose-400">ensaio atrasado preso no equipamento</Badge>
                ) : (
                  <span>livre a partir de {eq.dias[0] === "livre" ? "hoje" : br(eq.livreEm)}</span>
                )}
              </div>
              <TabelaItensBancada itens={eq.itens} coluna="equipamento" />
            </>
          )}
        </div>
      );
    }
    case "tecnico": {
      const tec = bancadaJanela.tecnicos.find((t) => t.nome === aberto.nome);
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Janela de dias úteis exibida</span>
            <SeletorJanela dias={diasBancada} onChange={onDiasBancada} />
          </div>
          {!tec ? <LinhaVazia>Técnico não encontrado nesta janela.</LinhaVazia> : (
            <>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>{tec.emExecucao} em execução</span>
                <span>{tec.programados} programado(s)</span>
                {tec.alemDoPrevisto > 0 && <span className="text-rose-600 dark:text-rose-400 font-medium">{tec.alemDoPrevisto} além do previsto</span>}
              </div>
              <TabelaItensBancada itens={tec.itens} coluna="tecnico" />
            </>
          )}
        </div>
      );
    }
    case "semana": {
      const s = desempenho?.series.find((x) => x.chave === aberto.chave);
      if (!s || !desempenho) return <LinhaVazia>Sem dados de desempenho ainda.</LinhaVazia>;
      return (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40"><TableHead>Semana</TableHead><TableHead className="text-right">{s.nome}</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {desempenho.semanas.map((sem, i) => (
              <TableRow key={sem} className={i === desempenho.semanas.length - 1 ? "bg-primary/5" : undefined}>
                <TableCell className="text-xs">
                  semana de {br(sem)}{i === desempenho.semanas.length - 1 ? <span className="ml-1.5 text-[10px] text-primary">(atual)</span> : null}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums font-medium">{s.valores[i]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }
    default:
      return null;
  }
}

const TITULOS_DETALHE: Record<DetalheAberto["tipo"], (a: DetalheAberto, modelo: PainelModelo) => { titulo: string; subtitulo?: string; destino?: Destino }> = {
  recebidas: () => ({ titulo: "Amostras recebidas (7 dias)", destino: { to: "/chegada-amostras" } }),
  recebimento: () => ({ titulo: "Recebimento", subtitulo: "tudo que ainda está no fluxo de chegada", destino: { to: "/chegada-amostras" } }),
  aguardandoProgramacao: () => ({ titulo: "Aguardando programação", subtitulo: "ensaios ativos sem data no Gantt", destino: { to: "/programacao/gantt" } }),
  emAndamento: () => ({ titulo: "Ensaios em andamento", subtitulo: "em execução agora na bancada", destino: { to: "/relatorio/digitalizacao/fila" } }),
  entregas7d: () => ({ titulo: "Entregas nos próximos dias", destino: { to: "/entregas" } }),
  atrasadas: () => ({ titulo: "Entregas atrasadas", destino: { to: "/entregas" } }),
  laudosParados: () => ({ titulo: "Laudos parados", subtitulo: "2 ou mais dias úteis na mesma etapa", destino: { to: "/relatorio/pendentes", search: { tab: "fluxo-relatorios" } } }),
  laudoEtapa: (a, modelo) => {
    const et = a.tipo === "laudoEtapa" ? modelo.laudos.find((l) => l.chave === a.chave) : undefined;
    return { titulo: et?.nome ?? "Laudos", destino: { to: "/relatorio/pendentes", search: { tab: "fluxo-relatorios" } } };
  },
  prazo: (a) => ({ titulo: a.tipo === "prazo" ? `OS ${a.chave}` : "OS", destino: { to: "/entregas" } }),
  equipamento: (a, modelo) => {
    const nome = a.tipo === "equipamento" ? modelo.bancada.equipamentos.find((q) => q.id === a.id)?.nome : undefined;
    return { titulo: nome ?? "Equipamento", subtitulo: "ocupação e programações", destino: { to: "/programacao/gantt" } };
  },
  tecnico: (a) => ({ titulo: a.tipo === "tecnico" ? a.nome : "Técnico", subtitulo: "agenda na bancada", destino: { to: "/programacao/gantt" } }),
  semana: () => ({ titulo: "Desempenho por semana", destino: { to: "/analises" } }),
};

function PainelDeDetalhe({
  aberto, onClose, modelo, bancadaJanela, diasBancada, onDiasBancada, desempenho, onAbrirPrazo,
}: {
  aberto: DetalheAberto | null;
  onClose: () => void;
  modelo: PainelModelo | null;
  bancadaJanela: BancadaModelo | null;
  diasBancada: number;
  onDiasBancada: (n: number) => void;
  desempenho: Desempenho | null;
  onAbrirPrazo: (chave: string) => void;
}) {
  const info = aberto && modelo ? TITULOS_DETALHE[aberto.tipo](aberto, modelo) : null;
  return (
    <Sheet open={!!aberto} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        {info && (
          <SheetHeader className="mb-4 text-left">
            <div className="flex items-start justify-between gap-2">
              <div>
                <SheetTitle>{info.titulo}</SheetTitle>
                {info.subtitulo && <SheetDescription>{info.subtitulo}</SheetDescription>}
              </div>
            </div>
            {info.destino && (
              <Para destino={info.destino} className="inline-flex w-fit items-center gap-1 text-xs text-primary hover:underline">
                Abrir página completa <ArrowUpRight className="h-3 w-3" />
              </Para>
            )}
          </SheetHeader>
        )}
        {aberto && modelo && bancadaJanela && (
          <ConteudoDetalhe
            aberto={aberto}
            modelo={modelo}
            bancadaJanela={bancadaJanela}
            diasBancada={diasBancada}
            onDiasBancada={onDiasBancada}
            desempenho={desempenho}
            onAbrirPrazo={onAbrirPrazo}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------ Quadros clicáveis ------------------------------ */

function Tile({
  titulo, valor, detalhe, tom, onClick,
}: {
  titulo: string; valor: number; detalhe: React.ReactNode; tom?: "crit" | "warn"; onClick: () => void;
}) {
  const borda = tom === "crit" && valor > 0 ? "border-rose-500/50" : "";
  const numero = tom === "crit" && valor > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-lg border bg-card p-3 grid gap-0.5 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${borda}`}
    >
      <span className="text-[11px] leading-tight text-muted-foreground">{titulo}</span>
      <span className={`font-display text-3xl font-semibold tabular-nums ${numero}`}>{valor}</span>
      <span className="text-[11px] text-muted-foreground">{detalhe}</span>
    </button>
  );
}

const Destaque = ({ n, tom, children }: { n: number; tom: "crit" | "warn"; children: React.ReactNode }) =>
  n > 0 ? (
    <b className={tom === "crit" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}>{children}</b>
  ) : (
    <>{children}</>
  );

function Etapa({ e, ultima, onClick }: { e: EtapaEsteira; ultima: boolean; onClick: () => void }) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        className={`block h-full w-full text-left rounded-lg border p-3 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
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
      </button>
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

function GradeOcupacao({
  bancada, diasBancada, onDiasBancada, onEquipamento,
}: {
  bancada: BancadaModelo; diasBancada: number; onDiasBancada: (n: number) => void; onEquipamento: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">clique num equipamento para ver o detalhe</span>
        <SeletorJanela dias={diasBancada} onChange={onDiasBancada} />
      </div>
      {bancada.equipamentos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum equipamento com ensaio neste setor.</p>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <div
              className="grid items-center gap-[3px] text-[11px]"
              style={{ gridTemplateColumns: `minmax(150px,1.7fr) repeat(${bancada.dias.length}, minmax(28px,1fr)) minmax(92px,auto)`, minWidth: `${560 + Math.max(0, bancada.dias.length - 7) * 30}px` }}
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
                  <button
                    type="button"
                    onClick={() => onEquipamento(q.id)}
                    className="truncate pr-2 text-left hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                    title={`${q.nome} · ${q.ensaios} ensaio(s) na janela — clique para ver o detalhe`}
                  >
                    {q.nome}
                  </button>
                  {q.dias.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onEquipamento(q.id)}
                      className={`h-5 rounded-sm ${COR_DO_DIA[s]} hover:ring-2 hover:ring-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                      title={`${rotuloDia(bancada.dias[i])}: ${s === "livre" ? "livre" : s === "ocupado" ? "ocupado" : "ensaio além do fim previsto"}`}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => onEquipamento(q.id)}
                    className={`text-right tabular-nums hover:underline ${q.comAtraso ? "text-rose-600 dark:text-rose-400 font-medium" : "text-muted-foreground"}`}
                  >
                    {q.comAtraso ? "ensaio atrasado" : q.dias[0] === "livre" ? "livre hoje" : br(q.livreEm)}
                  </button>
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
      )}
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

function TabelaTecnicos({ tecnicos, onTecnico }: { tecnicos: CargaTecnico[]; onTecnico: (nome: string) => void }) {
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
            <TableHead className="text-right">Programados</TableHead>
            <TableHead className="text-right">Além do previsto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tecnicos.map((t) => (
            <TableRow key={t.nome} className="cursor-pointer hover:bg-muted/50" onClick={() => onTecnico(t.nome)}>
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

function ColunasLaudos({ etapas, onEtapa }: { etapas: EtapaDeLaudo[]; onEtapa: (chave: EtapaDeLaudo["chave"]) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {etapas.map((et) => (
        <button
          key={et.chave}
          type="button"
          onClick={() => onEtapa(et.chave)}
          className="grid content-start gap-2 text-left rounded-lg border bg-muted/20 p-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
              {et.itens.slice(0, 5).map((i) => (
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
              {et.itens.length > 5 && (
                <li className="text-[10px] text-muted-foreground">+{et.itens.length - 5} mais — clique para ver todos</li>
              )}
            </ul>
          )}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Fase 3 ------------------------------ */

const fmtMedia = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Uma medida por semana: número da semana atual, média e barras (a atual em destaque). */
function MiniSerie({ s, semanas, onClick }: { s: SerieSemanal; semanas: string[]; onClick: () => void }) {
  const max = Math.max(1, ...s.valores);
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid content-start gap-2 text-left rounded-lg border bg-card p-3 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
    </button>
  );
}

function BlocoDesempenho({ d, onSemana }: { d: Desempenho; onSemana: (chave: SerieSemanal["chave"]) => void }) {
  const { pct, noPrazo, total, pctAnterior } = d.noPrazo;
  const diferenca = pct !== null && pctAnterior !== null ? pct - pctAnterior : null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {d.series.map((s) => (
        <MiniSerie key={s.chave} s={s} semanas={d.semanas} onClick={() => onSemana(s.chave)} />
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
  const [diasBancada, setDiasBancada] = useState<number>(7);
  const [detalhe, setDetalhe] = useState<DetalheAberto | null>(null);
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
  const bancadaJanela = useMemo(
    () => (entrada ? montarBancadaComJanela(entrada, diasBancada) : null),
    [entrada, diasBancada],
  );
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
        description="O que chegou, o que está parado, o que está rodando e o que vence — clique em qualquer quadro para ver o detalhe."
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

      {!modelo || !bancadaJanela ? (
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
              onClick={() => setDetalhe({ tipo: "recebidas" })}
            />
            <Tile
              titulo="Aguardando programação"
              valor={modelo.tiles.aguardandoProgramacao.total}
              detalhe={<><Destaque n={modelo.tiles.aguardandoProgramacao.parados} tom="warn">{modelo.tiles.aguardandoProgramacao.parados}</Destaque> há 2+ dias úteis</>}
              onClick={() => setDetalhe({ tipo: "aguardandoProgramacao" })}
            />
            <Tile
              titulo="Ensaios em andamento"
              valor={modelo.tiles.emAndamento.total}
              detalhe={<><Destaque n={modelo.tiles.emAndamento.alemDoPrevisto} tom="warn">{modelo.tiles.emAndamento.alemDoPrevisto}</Destaque> além do fim previsto</>}
              onClick={() => setDetalhe({ tipo: "emAndamento" })}
            />
            <Tile
              titulo="Entregas nos próximos 7 dias"
              valor={modelo.tiles.entregas7d.total}
              detalhe={<><Destaque n={modelo.tiles.entregas7d.emRisco} tom="warn">{modelo.tiles.entregas7d.emRisco}</Destaque> em risco</>}
              onClick={() => setDetalhe({ tipo: "entregas7d" })}
            />
            <Tile
              titulo="Entregas atrasadas"
              valor={modelo.tiles.atrasadas.total}
              detalhe={modelo.tiles.atrasadas.total ? <>maior atraso <Destaque n={1} tom="crit">{modelo.tiles.atrasadas.maiorAtraso} dias</Destaque></> : "nenhuma"}
              tom="crit"
              onClick={() => setDetalhe({ tipo: "atrasadas" })}
            />
            <Tile
              titulo="Laudos parados"
              valor={modelo.tiles.laudosParados.total}
              detalhe={modelo.tiles.laudosParados.total ? <>mais antigo: <Destaque n={1} tom="warn">{modelo.tiles.laudosParados.maisAntigoDias} dias úteis</Destaque></> : "nenhum há 2+ dias úteis"}
              onClick={() => setDetalhe({ tipo: "laudosParados" })}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-baseline justify-between gap-2 flex-wrap">
                Esteira da operação
                <span className="text-xs font-normal text-muted-foreground">o que está em cada etapa agora — clique numa etapa pra ver a lista</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-5">
                {modelo.esteira.map((e, i) => (
                  <Etapa
                    key={e.chave}
                    e={e}
                    ultima={i === modelo.esteira.length - 1}
                    onClick={() =>
                      setDetalhe(
                        e.chave === "recebimento" ? { tipo: "recebimento" }
                          : e.chave === "programacao" ? { tipo: "aguardandoProgramacao" }
                          : e.chave === "bancada" ? { tipo: "emAndamento" }
                          : e.chave === "laudo" ? { tipo: "laudosParados" }
                          : { tipo: "entregas7d" },
                      )
                    }
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr] items-start">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-baseline justify-between gap-2 flex-wrap">
                  Prazos · atrasadas e próximos 15 dias
                  <span className="text-xs font-normal text-muted-foreground">{modelo.prazos.length} OS · clique numa linha pra ver o detalhe</span>
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
                          <TableRow
                            key={p.chave}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setDetalhe({ tipo: "prazo", chave: p.chave })}
                          >
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
                  <span className="text-xs font-normal text-muted-foreground">próximos {bancadaJanela.dias.length} dias úteis</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <GradeOcupacao
                  bancada={bancadaJanela}
                  diasBancada={diasBancada}
                  onDiasBancada={setDiasBancada}
                  onEquipamento={(id) => setDetalhe({ tipo: "equipamento", id })}
                />
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
                <ListaLongos longos={bancadaJanela.longos} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.55fr] items-start">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Técnicos · carga de trabalho</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <TabelaTecnicos tecnicos={bancadaJanela.tecnicos} onTecnico={(nome) => setDetalhe({ tipo: "tecnico", nome })} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-baseline justify-between gap-2 flex-wrap">
                  Laudos · com quem estão
                  <span className="text-xs font-normal text-muted-foreground">idade = dias úteis na mesma etapa · clique numa coluna</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ColunasLaudos etapas={modelo.laudos} onEtapa={(chave) => setDetalhe({ tipo: "laudoEtapa", chave })} />
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
                <BlocoDesempenho d={desempenho} onSemana={(chave) => setDetalhe({ tipo: "semana", chave })} />
              </CardContent>
            </Card>
          )}

          <PainelDeDetalhe
            aberto={detalhe}
            onClose={() => setDetalhe(null)}
            modelo={modelo}
            bancadaJanela={bancadaJanela}
            diasBancada={diasBancada}
            onDiasBancada={setDiasBancada}
            desempenho={desempenho}
            onAbrirPrazo={(chave) => setDetalhe({ tipo: "prazo", chave })}
          />
        </>
      )}
    </div>
  );
}
