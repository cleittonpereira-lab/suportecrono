/**
 * Uma reunião: dados, participantes, o que ficou da reunião anterior e os
 * itens desta reunião como um quadro de demandas (situação, responsáveis,
 * prazo). Tudo grava na hora — dá para usar ao vivo, com a reunião acontecendo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft, ArrowRightFromLine, CalendarDays, Check, ChevronDown, ChevronRight, FileDown, Loader2,
  MapPin, MessageSquare, Pencil, Play, Plus, RotateCcw, Trash2, UserPlus, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { isoHoje } from "@/features/lab/hooks/use-acoes-da-programacao";
import {
  dataBr,
  diasParaPrazo,
  itemAtrasado,
  itemEmAberto,
  pendenciasAnteriores,
  pendenciasAteReuniao,
  resumirReuniao,
  reuniaoAnterior,
  STATUS_REUNIAO_LABEL,
  TIPO_LABEL,
  type CamposItem,
  type ItemAta,
  type Participante,
  type Reuniao,
  type TipoItem,
} from "@/lib/atas-qualidade";
import { useExcluirReuniao, useOperarReuniao, usePessoas, useReunioes, useTrazerPendencias } from "./atas-hooks";
import { PessoasPicker } from "./PessoasPicker";
import { Pessoas, StatusDoItem, pillDaReuniao } from "./atas-ui";
import { baixarBlob, gerarPdfDaAta } from "./ata-pdf";

const novoId = () => crypto.randomUUID();

/** Texto que grava ao sair do campo (não a cada letra) e acompanha mudanças feitas por outras pessoas. */
function TextoEditavel({
  valor, onSalvar, placeholder, className, linhas = 1, desabilitado,
}: {
  valor: string; onSalvar: (v: string) => void; placeholder?: string; className?: string; linhas?: number; desabilitado?: boolean;
}) {
  const [rascunho, setRascunho] = useState(valor);
  const focado = useRef(false);
  useEffect(() => { if (!focado.current) setRascunho(valor); }, [valor]);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [rascunho]);
  return (
    <textarea
      ref={ref}
      rows={linhas}
      value={rascunho}
      disabled={desabilitado}
      placeholder={placeholder}
      onFocus={() => { focado.current = true; }}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={() => {
        focado.current = false;
        if (rascunho !== valor) onSalvar(rascunho);
      }}
      className={cn(
        "w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors hover:border-input focus:border-ring focus:bg-background",
        className,
      )}
    />
  );
}

function Prazo({ item, hoje, onChange }: { item: ItemAta; hoje: string; onChange: (v: string | null) => void }) {
  const atrasado = itemAtrasado(item, hoje);
  const dias = diasParaPrazo(item.prazo, hoje);
  return (
    <div className="flex flex-col">
      <input
        type="date"
        value={item.prazo ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Prazo"
        className={cn(
          "h-8 w-[8.5rem] rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-input focus:border-ring",
          atrasado && "font-semibold text-destructive",
        )}
      />
      {atrasado && dias ? <span className="px-2 text-[11px] text-destructive">{dias} d de atraso</span> : null}
    </div>
  );
}

function LinhaDoItem({
  item, hoje, pessoas, onAlterar, onRemover, desabilitado,
}: {
  item: ItemAta; hoje: string; pessoas: { nome: string; cargo?: string }[];
  onAlterar: (c: CamposItem) => void;
  onRemover: () => void; desabilitado?: boolean;
}) {
  const [nota, setNota] = useState(!!item.observacao);
  return (
    <>
      <tr className={cn("border-b align-top", item.status === "concluida" && "bg-emerald-500/5", item.status === "cancelada" && "opacity-60")}>
        <td className="w-[7.5rem] p-1.5">
          <Select value={item.tipo} onValueChange={(v) => onAlterar({ tipo: v as TipoItem })} disabled={desabilitado}>
            <SelectTrigger className="h-8 border-transparent bg-transparent px-2 text-xs shadow-none hover:border-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TIPO_LABEL) as TipoItem[]).map((t) => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </td>
        <td className="min-w-[16rem] p-1.5">
          <TextoEditavel valor={item.descricao} onSalvar={(v) => v.trim() && onAlterar({ descricao: v })} desabilitado={desabilitado}
            className={cn(item.status === "concluida" && "text-muted-foreground line-through")} />
          {item.origem && (
            <div className="px-2 text-[11px] text-muted-foreground">↪ vem da reunião nº {item.origem.reuniaoNumero} ({dataBr(item.origem.reuniaoData)})</div>
          )}
          {item.status === "concluida" && item.concluidoEm && (
            <div className="px-2 text-[11px] text-emerald-700 dark:text-emerald-400">
              Concluída em {dataBr(item.concluidoEm.slice(0, 10))}{item.concluidoPor ? ` por ${item.concluidoPor}` : ""}
            </div>
          )}
        </td>
        <td className="w-44 p-1.5">
          {item.tipo === "acao" ? (
            <PessoasPicker value={item.responsaveis} opcoes={pessoas} onChange={(n) => onAlterar({ responsaveis: n })}>
              <button type="button" disabled={desabilitado} className="flex h-8 min-w-[8rem] items-center gap-1 rounded-md border border-transparent px-2 hover:border-input focus:border-ring focus:outline-none">
                <Pessoas nomes={item.responsaveis} />
              </button>
            </PessoasPicker>
          ) : <span className="px-2 text-xs text-muted-foreground">—</span>}
        </td>
        <td className="w-40 p-1.5">{item.tipo === "acao" ? <Prazo item={item} hoje={hoje} onChange={(v) => onAlterar({ prazo: v })} /> : <span className="px-2 text-xs text-muted-foreground">—</span>}</td>
        <td className="w-44 p-1.5">
          {item.tipo === "acao" ? <StatusDoItem item={item} hoje={hoje} disabled={desabilitado} onChange={(s) => onAlterar({ status: s })} /> : null}
        </td>
        <td className="w-20 p-1.5 text-right">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Observação" onClick={() => setNota((v) => !v)} aria-label="Observação">
            <MessageSquare className={cn("h-3.5 w-3.5", item.observacao && "text-primary")} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Remover" onClick={onRemover} aria-label="Remover item" disabled={desabilitado}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </td>
      </tr>
      {nota && (
        <tr className="border-b bg-muted/30">
          <td />
          <td colSpan={5} className="p-1.5">
            <TextoEditavel valor={item.observacao} placeholder="Observação sobre este item…" onSalvar={(v) => onAlterar({ observacao: v })} desabilitado={desabilitado} className="text-xs" />
          </td>
        </tr>
      )}
    </>
  );
}

function EditarDadosDialog({ r, aberto, onAbertoChange }: { r: Reuniao; aberto: boolean; onAbertoChange: (v: boolean) => void }) {
  const operar = useOperarReuniao();
  const [f, setF] = useState({ titulo: r.titulo, grupo: r.grupo, data: r.data, horaInicio: r.horaInicio, horaFim: r.horaFim, local: r.local, redator: r.redator });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dados da reunião</DialogTitle>
          <DialogDescription>Título, horário, local e quem redige a ata.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>Título</Label><Input value={f.titulo} onChange={set("titulo")} /></div>
          <div className="grid gap-1.5"><Label>Grupo</Label><Input value={f.grupo} onChange={set("grupo")} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5"><Label>Data</Label><Input type="date" value={f.data} onChange={set("data")} /></div>
            <div className="grid gap-1.5"><Label>Início</Label><Input type="time" value={f.horaInicio} onChange={set("horaInicio")} /></div>
            <div className="grid gap-1.5"><Label>Término</Label><Input type="time" value={f.horaFim} onChange={set("horaFim")} /></div>
          </div>
          <div className="grid gap-1.5"><Label>Local</Label><Input value={f.local} onChange={set("local")} /></div>
          <div className="grid gap-1.5"><Label>Redator da ata</Label><Input value={f.redator} onChange={set("redator")} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onAbertoChange(false)}>Cancelar</Button>
          <Button onClick={() => { operar(r.id, { op: "dados", campos: f }); onAbertoChange(false); }}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Participantes({ r, pessoas }: { r: Reuniao; pessoas: { nome: string; cargo?: string }[] }) {
  const operar = useOperarReuniao();
  const salvar = (lista: Participante[]) => operar(r.id, { op: "participantes", participantes: lista });
  const presentes = r.participantes.filter((p) => p.presente).length;
  const nomes = r.participantes.map((p) => p.nome);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Participantes <span className="text-sm font-normal text-muted-foreground">{presentes} de {r.participantes.length} presentes</span></CardTitle>
        <PessoasPicker
          value={nomes}
          opcoes={pessoas}
          onChange={(novos) =>
            salvar(novos.map((n) => r.participantes.find((p) => p.nome.toLowerCase() === n.toLowerCase())
              ?? { nome: n, presente: true, funcao: "", externo: !pessoas.some((x) => x.nome.toLowerCase() === n.toLowerCase()) }))
          }
        >
          <Button variant="outline" size="sm" className="gap-1.5"><UserPlus className="h-3.5 w-3.5" /> Adicionar</Button>
        </PessoasPicker>
      </CardHeader>
      <CardContent>
        {r.participantes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém adicionado. Use “Adicionar” para incluir quem participa.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {r.participantes.map((p) => (
              <span key={p.nome} className={cn("inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2 text-sm", p.presente ? "bg-background" : "bg-muted/50 text-muted-foreground")}>
                <button
                  type="button"
                  title={p.presente ? "Presente — clique para marcar ausente" : "Ausente — clique para marcar presente"}
                  onClick={() => salvar(r.participantes.map((x) => (x.nome === p.nome ? { ...x, presente: !x.presente } : x)))}
                  className={cn("grid h-5 w-5 place-items-center rounded-full border", p.presente ? "border-emerald-600 bg-emerald-600 text-white" : "border-muted-foreground/40")}
                >
                  {p.presente && <Check className="h-3 w-3" />}
                </button>
                <span className={cn(!p.presente && "line-through")}>{p.nome}</span>
                {p.externo && <span className="text-xs text-muted-foreground">(externo)</span>}
                <button type="button" aria-label={`Remover ${p.nome}`} className="text-muted-foreground hover:text-destructive" onClick={() => salvar(r.participantes.filter((x) => x.nome !== p.nome))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** O que ficou da(s) reunião(ões) anterior(es): é por aqui que a reunião nova começa. */
function AlinhadoAntes({ r, todas, hoje, desabilitado }: { r: Reuniao; todas: Reuniao[]; hoje: string; desabilitado: boolean }) {
  const operar = useOperarReuniao();
  const trazer = useTrazerPendencias();
  const anterior = reuniaoAnterior(todas, r);
  const [aberto, setAberto] = useState(true);
  if (!anterior) return null;

  const daAnterior = anterior.itens.filter((i) => i.tipo !== "informe");
  const antigas = pendenciasAnteriores(todas, r).filter((p) => p.reuniao.id !== anterior.id);
  const abertasDaAnterior = daAnterior.filter(itemEmAberto);
  const totalAbertas = abertasDaAnterior.length + antigas.length;
  const jaTrazida = (it: ItemAta) => r.itens.some((x) => x.origem?.reuniaoId === anterior.id && x.origem.itemId === it.id);

  const trazerDe = (reuniaoId: string, ids: string[]) => trazer.mutate({ deReuniaoId: reuniaoId, paraReuniaoId: r.id, itemIds: ids });
  const trazerTudo = () => {
    if (abertasDaAnterior.length) trazerDe(anterior.id, abertasDaAnterior.map((i) => i.id));
    const porReuniao = new Map<string, string[]>();
    for (const p of antigas) porReuniao.set(p.reuniao.id, [...(porReuniao.get(p.reuniao.id) ?? []), p.item.id]);
    for (const [id, ids] of porReuniao) trazerDe(id, ids);
  };

  const Linha = ({ reuniao, it }: { reuniao: Reuniao; it: ItemAta }) => {
    const dias = diasParaPrazo(it.prazo, hoje);
    return (
      <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-background p-2.5">
        <div className="min-w-[12rem] flex-1">
          <div className="text-sm">{it.descricao}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span>{TIPO_LABEL[it.tipo]}</span>
            {it.prazo && <span className={cn(itemAtrasado(it, hoje) && "font-semibold text-destructive")}>prazo {dataBr(it.prazo)}{itemAtrasado(it, hoje) && dias ? ` (${dias} d de atraso)` : ""}</span>}
            {reuniao.id !== anterior.id && <span>da reunião nº {reuniao.numero} ({dataBr(reuniao.data)})</span>}
          </div>
        </div>
        <Pessoas nomes={it.responsaveis} />
        {it.tipo === "acao" && (
          <StatusDoItem item={it} hoje={hoje} disabled={desabilitado} onChange={(s) => operar(reuniao.id, { op: "item_alterar", itemId: it.id, campos: { status: s } })} />
        )}
        {itemEmAberto(it) && !jaTrazida(it) && (
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={desabilitado || trazer.isPending} onClick={() => trazerDe(reuniao.id, [it.id])}>
            <ArrowRightFromLine className="h-3.5 w-3.5" /> Trazer para esta reunião
          </Button>
        )}
        {it.status === "transferida" && it.transferidaPara?.reuniaoId === r.id && <span className="text-xs font-medium text-sky-700 dark:text-sky-400">Trazida para esta reunião ↓</span>}
      </li>
    );
  };

  return (
    <Collapsible open={aberto} onOpenChange={setAberto}>
      <Card className="border-primary/40">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-2 text-left">
                {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <CardTitle className="text-base">Alinhado na reunião anterior <span className="text-sm font-normal text-muted-foreground">nº {anterior.numero} · {dataBr(anterior.data)}</span></CardTitle>
              </button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2 text-sm">
              <span className={cn("font-medium", totalAbertas > 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400")}>
                {totalAbertas === 0 ? "Nenhuma pendência em aberto" : `${totalAbertas} pendência(s) em aberto`}
              </span>
              {totalAbertas > 0 && (
                <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" disabled={desabilitado || trazer.isPending} onClick={trazerTudo}>
                  {trazer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightFromLine className="h-3.5 w-3.5" />} Trazer todas as pendências
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="grid gap-4 pt-0">
            {daAnterior.length === 0 ? (
              <p className="text-sm text-muted-foreground">A reunião anterior não registrou ações nem decisões.</p>
            ) : (
              <ul className="grid gap-2">{daAnterior.map((it) => <Linha key={it.id} reuniao={anterior} it={it} />)}</ul>
            )}
            {antigas.length > 0 && (
              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pendências de reuniões mais antigas</div>
                <ul className="grid gap-2">{antigas.map((p) => <Linha key={`${p.reuniao.id}:${p.item.id}`} reuniao={p.reuniao} it={p.item} />)}</ul>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function ReuniaoAoVivo({ reuniaoId }: { reuniaoId: string }) {
  const navigate = useNavigate();
  const { displayName } = useAuth();
  const { data: todas = [], isLoading } = useReunioes();
  const { data: pessoas = [] } = usePessoas();
  const operar = useOperarReuniao();
  const excluir = useExcluirReuniao();
  const hoje = isoHoje();

  const r = todas.find((x) => x.id === reuniaoId) ?? null;
  const [editando, setEditando] = useState(false);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [desc, setDesc] = useState("");
  const [tipo, setTipo] = useState<TipoItem>("acao");
  const [resp, setResp] = useState<string[]>([]);
  const [prazo, setPrazo] = useState("");
  const campoRef = useRef<HTMLInputElement>(null);

  const resumo = useMemo(() => (r ? resumirReuniao(r, hoje) : null), [r, hoje]);
  const opcoesPessoas = useMemo(() => {
    const nomes = new Map(pessoas.map((p) => [p.nome.toLowerCase(), p]));
    for (const p of r?.participantes ?? []) if (!nomes.has(p.nome.toLowerCase())) nomes.set(p.nome.toLowerCase(), { nome: p.nome, cargo: p.funcao });
    return [...nomes.values()];
  }, [pessoas, r]);

  if (isLoading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  if (!r || !resumo) {
    return (
      <div className="space-y-3 p-6">
        <p className="text-sm">Reunião não encontrada — talvez tenha sido excluída.</p>
        <Button asChild variant="outline"><Link to="/qualidade/atas"><ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar às atas</Link></Button>
      </div>
    );
  }

  const adicionar = () => {
    if (!desc.trim()) return;
    operar(r.id, {
      op: "item_novo",
      id: novoId(),
      item: { descricao: desc, tipo, responsaveis: tipo === "acao" ? resp : [], prazo: tipo === "acao" && prazo ? prazo : null },
    });
    setDesc(""); setResp([]); setPrazo("");
    campoRef.current?.focus();
  };

  const exportar = async () => {
    setGerando(true);
    try {
      const { blob, nome } = await gerarPdfDaAta({
        reuniao: r,
        anterior: reuniaoAnterior(todas, r),
        pendencias: pendenciasAteReuniao(todas, r),
        hoje,
        geradoPor: displayName,
      });
      baixarBlob(blob, nome);
      toast.success("Ata exportada em PDF");
    } catch (e) {
      toast.error(`Não foi possível gerar o PDF: ${(e as Error).message}`);
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
        <Link to="/qualidade/atas"><ArrowLeft className="h-4 w-4" /> Atas de reunião</Link>
      </Button>

      <PageHeader
        eyebrow={`${r.grupo} · reunião nº ${r.numero}`}
        title={r.titulo}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{dataBr(r.data)}{r.horaInicio ? ` · ${r.horaInicio}${r.horaFim ? `–${r.horaFim}` : ""}` : ""}</span>
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{r.local || "Local não informado"}</span>
            <span className={pillDaReuniao(r.status)}>{STATUS_REUNIAO_LABEL[r.status]}</span>
            <span className="text-xs">Redator: {r.redator || r.criadaPor}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditando(true)}><Pencil className="h-3.5 w-3.5" /> Dados</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportar} disabled={gerando}>
              {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} Exportar PDF
            </Button>
            {r.status === "agendada" && <Button size="sm" className="gap-1.5" onClick={() => operar(r.id, { op: "status", status: "em_andamento" })}><Play className="h-3.5 w-3.5" /> Iniciar reunião</Button>}
            {r.status === "em_andamento" && <Button size="sm" className="gap-1.5" onClick={() => operar(r.id, { op: "status", status: "encerrada" })}><Check className="h-3.5 w-3.5" /> Encerrar ata</Button>}
            {r.status === "encerrada" && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => operar(r.id, { op: "status", status: "em_andamento" })}><RotateCcw className="h-3.5 w-3.5" /> Reabrir</Button>}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Excluir reunião" onClick={() => setConfirmaExcluir(true)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        }
      />

      {r.status === "encerrada" && (
        <div className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm">
          Ata encerrada{r.encerradaPor ? ` por ${r.encerradaPor}` : ""}{r.encerradaEm ? ` em ${new Date(r.encerradaEm).toLocaleString("pt-BR")}` : ""}. As pendências continuam acompanháveis e podem ser trazidas para a próxima reunião.
        </div>
      )}

      <Participantes r={r} pessoas={opcoesPessoas} />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Pauta</CardTitle></CardHeader>
        <CardContent>
          <TextoEditavel valor={r.pauta} placeholder="Assuntos da reunião…" linhas={2} onSalvar={(v) => operar(r.id, { op: "dados", campos: { pauta: v } })} className="border-input" />
        </CardContent>
      </Card>

      <AlinhadoAntes r={r} todas={todas} hoje={hoje} desabilitado={false} />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="text-base">Decisões e ações desta reunião</CardTitle>
          <div className="text-xs text-muted-foreground">
            {resumo.acoes} ação(ões) · {resumo.concluidas} concluída(s) · {resumo.emAberto} em aberto{resumo.atrasadas > 0 && <span className="font-semibold text-destructive"> · {resumo.atrasadas} atrasada(s)</span>} · {resumo.decisoes} decisão(ões)
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2">Responsáveis</th><th className="px-3 py-2">Prazo</th><th className="px-3 py-2">Situação</th><th />
                </tr>
              </thead>
              <tbody>
                {r.itens.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">Nada registrado ainda. Escreva abaixo o que for sendo decidido e tecle Enter.</td></tr>
                )}
                {r.itens.map((it) => (
                  <LinhaDoItem key={it.id} item={it} hoje={hoje} pessoas={opcoesPessoas}
                    onAlterar={(campos) => operar(r.id, { op: "item_alterar", itemId: it.id, campos })}
                    onRemover={() => operar(r.id, { op: "item_remover", itemId: it.id })} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 p-3">
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoItem)}>
              <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(TIPO_LABEL) as TipoItem[]).map((t) => <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>)}</SelectContent>
            </Select>
            <Input ref={campoRef} value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }}
              placeholder={tipo === "acao" ? "Nova ação… (Enter para adicionar)" : tipo === "decisao" ? "Nova decisão… (Enter para adicionar)" : "Novo informe… (Enter para adicionar)"} className="h-9 min-w-[14rem] flex-1" />
            {tipo === "acao" && (
              <>
                <PessoasPicker value={resp} opcoes={opcoesPessoas} onChange={setResp}>
                  <Button type="button" variant="outline" className="h-9 gap-1.5 text-xs">
                    {resp.length ? <Pessoas nomes={resp} /> : <><UserPlus className="h-3.5 w-3.5" /> Responsável</>}
                  </Button>
                </PessoasPicker>
                <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="h-9 w-40" aria-label="Prazo" />
              </>
            )}
            <Button onClick={adicionar} disabled={!desc.trim()} className="h-9 gap-1.5"><Plus className="h-4 w-4" /> Adicionar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Observações gerais</CardTitle></CardHeader>
        <CardContent>
          <TextoEditavel valor={r.observacoes} placeholder="Observações, próximos passos, data da próxima reunião…" linhas={2} onSalvar={(v) => operar(r.id, { op: "dados", campos: { observacoes: v } })} className="border-input" />
        </CardContent>
      </Card>

      {editando && <EditarDadosDialog r={r} aberto={editando} onAbertoChange={setEditando} />}

      <AlertDialog open={confirmaExcluir} onOpenChange={setConfirmaExcluir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a reunião nº {r.numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              A ata e todos os seus itens serão apagados. Pendências que já foram trazidas para outras reuniões continuam lá, mas perdem a ligação com esta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => excluir.mutate(r.id, { onSuccess: () => { toast.success("Reunião excluída"); void navigate({ to: "/qualidade/atas" }); } })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
