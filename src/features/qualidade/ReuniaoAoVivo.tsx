/**
 * Uma reunião, no jeito do Monday: o que ficou da reunião anterior primeiro
 * (é por onde a reunião começa), depois os grupos Ações, Decisões e Informes —
 * cada linha com responsáveis, situação e prazo editáveis no lugar. Tudo grava
 * na hora; dá para usar ao vivo, com a reunião acontecendo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft, ArrowRightFromLine, CalendarDays, Check, Clock, CornerDownRight, FileDown, Loader2, MapPin, MessageSquare,
  MoreHorizontal, Pencil, Play, Plus, RotateCcw, Trash2, UserPlus, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
  tituloDaReuniao,
  tituloProprio,
  type CamposItem,
  type ItemAta,
  type Participante,
  type Reuniao,
  type TipoItem,
} from "@/lib/atas-qualidade";
import { useExcluirReuniao, useOperarReuniao, usePessoas, useReunioes, useTrazerPendencias } from "./atas-hooks";
import { PessoasPicker } from "./PessoasPicker";
import { Bateria, CelulaStatus, COR, COR_DA_REUNIAO, corDaPessoa, Etiqueta, Grupo, Pessoas, Td, Th } from "./atas-ui";
import { baixarBlob, gerarPdfDaAta } from "./ata-pdf";

const novoId = () => crypto.randomUUID();
type Pessoa = { nome: string; cargo?: string };

const GRUPOS_DA_REUNIAO: { tipo: TipoItem; titulo: string; cor: string; novo: string }[] = [
  { tipo: "acao", titulo: "Ações", cor: COR.azul, novo: "+ Adicionar ação" },
  { tipo: "decisao", titulo: "Decisões", cor: COR.roxo, novo: "+ Adicionar decisão" },
  { tipo: "informe", titulo: "Informes", cor: COR.turquesa, novo: "+ Adicionar informe" },
];

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

/** Linha "+ Adicionar …" no pé do grupo, como no Monday: escreve e tecla Enter. */
function LinhaNova({ placeholder, onAdicionar, colSpan }: { placeholder: string; onAdicionar: (t: string) => void; colSpan: number }) {
  const [t, setT] = useState("");
  const enviar = () => { if (t.trim()) { onAdicionar(t); setT(""); } };
  return (
    <tr>
      <Td colSpan={colSpan} className="border-r-0">
        <input
          value={t}
          onChange={(e) => setT(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } }}
          placeholder={placeholder}
          className="h-9 w-full bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus:bg-background"
        />
      </Td>
    </tr>
  );
}

function CelulaPrazo({ item, hoje, onChange }: { item: ItemAta; hoje: string; onChange: (v: string | null) => void }) {
  const atrasado = itemAtrasado(item, hoje);
  const dias = diasParaPrazo(item.prazo, hoje);
  return (
    <div className="flex flex-col items-center justify-center">
      <input
        type="date"
        value={item.prazo ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Prazo"
        className="h-7 w-[8.25rem] rounded border border-transparent bg-transparent px-1 text-center text-[13px] outline-none hover:border-input focus:border-ring"
        style={atrasado ? { color: COR.vermelho, fontWeight: 600 } : undefined}
      />
      {atrasado && dias ? <span className="text-[10px] leading-none" style={{ color: COR.vermelho }}>{dias} d de atraso</span> : null}
    </div>
  );
}

function MenuDoItem({
  item, onAlterar, onRemover, onNota,
}: { item: ItemAta; onAlterar: (c: CamposItem) => void; onRemover: () => void; onNota: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label="Mais opções do item">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onNota}><MessageSquare className="mr-2 h-4 w-4" /> {item.observacao ? "Ver observação" : "Adicionar observação"}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Mover para</DropdownMenuLabel>
        {(Object.keys(TIPO_LABEL) as TipoItem[]).filter((t) => t !== item.tipo).map((t) => (
          <DropdownMenuItem key={t} onSelect={() => onAlterar({ tipo: t })}>
            <span className="mr-2 h-3 w-3 rounded-sm" style={{ background: GRUPOS_DA_REUNIAO.find((g) => g.tipo === t)?.cor }} />
            {GRUPOS_DA_REUNIAO.find((g) => g.tipo === t)?.titulo}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRemover} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Uma linha de item (ação, decisão ou informe). */
function LinhaDoItem({
  item, hoje, pessoas, onAlterar, onRemover, extra, comColunas, preencher,
}: {
  item: ItemAta; hoje: string; pessoas: Pessoa[];
  onAlterar: (c: CamposItem) => void; onRemover?: () => void;
  /** Conteúdo a mais na célula final (ex.: botão "Trazer"). */
  extra?: React.ReactNode;
  /** Ações têm responsáveis, situação e prazo; decisões e informes não. */
  comColunas: boolean;
  /** Linha sem colunas numa tabela que tem: completa com células vazias. */
  preencher?: boolean;
}) {
  const [nota, setNota] = useState(false);
  const colunas = comColunas || preencher ? 5 : 2;
  return (
    <>
      <tr className={cn("group hover:bg-muted/30", item.status === "cancelada" && "opacity-60")}>
        <Td className="py-0.5">
          <TextoEditavel
            valor={item.descricao}
            onSalvar={(v) => v.trim() && onAlterar({ descricao: v })}
            className={cn(item.status === "concluida" && "text-muted-foreground line-through")}
          />
          {(item.origem || item.observacao || (item.status === "concluida" && item.concluidoEm)) && (
            <div className="flex flex-wrap gap-x-3 px-2 pb-1 text-[11px] text-muted-foreground">
              {item.origem && <span className="inline-flex items-center gap-1"><CornerDownRight className="h-3 w-3" /> vem da reunião nº {item.origem.reuniaoNumero} ({dataBr(item.origem.reuniaoData)})</span>}
              {item.status === "concluida" && item.concluidoEm && (
                <span className="inline-flex items-center gap-1" style={{ color: COR.verde }}><Check className="h-3 w-3" /> concluída em {dataBr(item.concluidoEm.slice(0, 10))}{item.concluidoPor ? ` por ${item.concluidoPor}` : ""}</span>
              )}
              {item.observacao && !nota && (
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setNota(true)}>
                  <MessageSquare className="h-3 w-3" /> observação
                </button>
              )}
            </div>
          )}
        </Td>
        {comColunas && (
          <>
            <Td className="text-center">
              <PessoasPicker value={item.responsaveis} opcoes={pessoas} onChange={(n) => onAlterar({ responsaveis: n })}>
                <button type="button" className="flex h-full min-h-9 w-full items-center justify-center hover:bg-muted/50 focus:outline-none" aria-label="Responsáveis">
                  {item.responsaveis.length ? <Pessoas nomes={item.responsaveis} /> : <UserPlus className="h-4 w-4 text-muted-foreground/60" />}
                </button>
              </PessoasPicker>
            </Td>
            <Td><CelulaStatus item={item} hoje={hoje} onChange={(s) => onAlterar({ status: s })} /></Td>
            <Td><CelulaPrazo item={item} hoje={hoje} onChange={(v) => onAlterar({ prazo: v })} /></Td>
          </>
        )}
        {!comColunas && preencher && (
          <>
            <Td className="text-center text-xs text-muted-foreground">—</Td>
            <Td className="text-center text-xs text-muted-foreground">—</Td>
            <Td className="text-center text-xs text-muted-foreground">—</Td>
          </>
        )}
        <Td className="w-[1%] whitespace-nowrap px-1 text-right">
          <div className="flex items-center justify-end gap-1">
            {extra}
            {onRemover && <MenuDoItem item={item} onAlterar={onAlterar} onRemover={onRemover} onNota={() => setNota((v) => !v)} />}
          </div>
        </Td>
      </tr>
      {nota && (
        <tr className="bg-muted/30">
          <Td colSpan={colunas}>
            <div className="flex items-start gap-1 p-1">
              <MessageSquare className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <TextoEditavel valor={item.observacao} placeholder="Observação sobre este item…" onSalvar={(v) => onAlterar({ observacao: v })} className="text-xs" />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setNota(false)} aria-label="Fechar observação"><X className="h-3.5 w-3.5" /></Button>
            </div>
          </Td>
        </tr>
      )}
    </>
  );
}

function CabecalhoDaTabela({ comColunas, primeira = "Item" }: { comColunas: boolean; primeira?: string }) {
  return (
    <thead>
      <tr>
        <Th className="text-left">{primeira}</Th>
        {comColunas && (
          <>
            <Th className="w-36">Responsáveis</Th>
            <Th className="w-36">Situação</Th>
            <Th className="w-40">Prazo</Th>
          </>
        )}
        <Th className="w-12" />
      </tr>
    </thead>
  );
}

/** Rodapé do grupo de ações: a "bateria" sob a coluna de situação. */
function RodapeBateria({ itens, hoje }: { itens: ItemAta[]; hoje: string }) {
  const contaveis = itens.filter((i) => i.status !== "cancelada");
  if (contaveis.length === 0) return null;
  return (
    <tr className="bg-muted/20">
      <Td className="border-r-0" />
      <Td className="border-r-0" />
      <Td className="px-1.5 py-1"><Bateria itens={contaveis} hoje={hoje} /></Td>
      <Td className="border-r-0" />
      <Td />
    </tr>
  );
}

function EditarDadosDialog({ r, aberto, onAbertoChange }: { r: Reuniao; aberto: boolean; onAbertoChange: (v: boolean) => void }) {
  const operar = useOperarReuniao();
  const [f, setF] = useState({ titulo: tituloProprio(r), grupo: r.grupo, data: r.data, horaInicio: r.horaInicio, horaFim: r.horaFim, local: r.local, redator: r.redator });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dados da reunião</DialogTitle>
          <DialogDescription>O número da reunião segue a data: mudar a data pode renumerar as outras do grupo.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>Título (opcional)</Label><Input value={f.titulo} placeholder={`Reunião nº ${r.numero}`} onChange={set("titulo")} /></div>
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

function Participantes({ r, pessoas }: { r: Reuniao; pessoas: Pessoa[] }) {
  const operar = useOperarReuniao();
  const salvar = (lista: Participante[]) => operar(r.id, { op: "participantes", participantes: lista });
  const presentes = r.participantes.filter((p) => p.presente).length;
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span className="font-semibold">Participantes</span>
          <span className="text-sm text-muted-foreground">{presentes} de {r.participantes.length} presentes · clique para marcar ausência</span>
        </div>
        <PessoasPicker
          value={r.participantes.map((p) => p.nome)}
          opcoes={pessoas}
          onChange={(novos) =>
            salvar(novos.map((n) => r.participantes.find((p) => p.nome.toLowerCase() === n.toLowerCase())
              ?? { nome: n, presente: true, funcao: "", externo: !pessoas.some((x) => x.nome.toLowerCase() === n.toLowerCase()) }))
          }
        >
          <Button variant="outline" size="sm" className="gap-1.5"><UserPlus className="h-3.5 w-3.5" /> Adicionar</Button>
        </PessoasPicker>
      </div>
      {r.participantes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém adicionado. Use “Adicionar” para incluir quem participa.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {r.participantes.map((p) => (
            <span key={p.nome} className={cn("group inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 text-sm transition-colors", p.presente ? "bg-background" : "border-dashed bg-muted/40 text-muted-foreground")}>
              <button
                type="button"
                title={p.presente ? "Presente — clique para marcar ausente" : "Ausente — clique para marcar presente"}
                onClick={() => salvar(r.participantes.map((x) => (x.nome === p.nome ? { ...x, presente: !x.presente } : x)))}
                className="relative grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold text-white"
                style={{ background: p.presente ? corDaPessoa(p.nome) : "#b0b0b0" }}
              >
                {p.nome.split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase()}
                <span className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-background" style={{ background: p.presente ? COR.verde : COR.cinza }}>
                  {p.presente ? <Check className="h-2 w-2" /> : null}
                </span>
              </button>
              <span className={cn(!p.presente && "line-through")}>{p.nome}</span>
              {p.externo && <span className="text-xs text-muted-foreground">externo</span>}
              <button type="button" aria-label={`Remover ${p.nome}`} className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100" onClick={() => salvar(r.participantes.filter((x) => x.nome !== p.nome))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/** O que ficou da(s) reunião(ões) anterior(es): é por aqui que a reunião nova começa. */
function AlinhadoAntes({ r, todas, hoje, pessoas }: { r: Reuniao; todas: Reuniao[]; hoje: string; pessoas: Pessoa[] }) {
  const operar = useOperarReuniao();
  const trazer = useTrazerPendencias();
  const anterior = reuniaoAnterior(todas, r);
  if (!anterior) return null;

  const daAnterior = anterior.itens.filter((i) => i.tipo !== "informe");
  const antigas = pendenciasAnteriores(todas, r).filter((p) => p.reuniao.id !== anterior.id);
  const abertasDaAnterior = daAnterior.filter(itemEmAberto);
  const totalAbertas = abertasDaAnterior.length + antigas.length;

  const trazerDe = (reuniaoId: string, ids: string[]) => trazer.mutate({ deReuniaoId: reuniaoId, paraReuniaoId: r.id, itemIds: ids });
  const trazerTudo = () => {
    if (abertasDaAnterior.length) trazerDe(anterior.id, abertasDaAnterior.map((i) => i.id));
    const porReuniao = new Map<string, string[]>();
    for (const p of antigas) porReuniao.set(p.reuniao.id, [...(porReuniao.get(p.reuniao.id) ?? []), p.item.id]);
    for (const [id, ids] of porReuniao) trazerDe(id, ids);
  };
  const botaoTrazer = (reuniaoId: string, it: ItemAta) =>
    itemEmAberto(it) ? (
      <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" disabled={trazer.isPending} onClick={() => trazerDe(reuniaoId, [it.id])} title="Trazer para esta reunião">
        <ArrowRightFromLine className="h-3.5 w-3.5" /> Trazer
      </Button>
    ) : null;

  return (
    <div className="space-y-5">
      <Grupo
        cor={COR.coral}
        titulo={`Alinhado na reunião anterior · nº ${anterior.numero} (${dataBr(anterior.data)})`}
        detalhe={totalAbertas === 0 ? "nenhuma pendência em aberto" : `${totalAbertas} pendência(s) em aberto — comece por aqui`}
        acoes={totalAbertas > 0 && (
          <Button size="sm" className="h-7 gap-1.5 text-xs text-white hover:opacity-90" style={{ background: COR.coral }} disabled={trazer.isPending} onClick={trazerTudo}>
            {trazer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightFromLine className="h-3.5 w-3.5" />} Trazer todas as pendências
          </Button>
        )}
      >
        {daAnterior.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">A reunião anterior não registrou ações nem decisões.</p>
        ) : (
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <CabecalhoDaTabela comColunas />
            <tbody>
              {daAnterior.map((it) => (
                <LinhaDoItem key={it.id} item={it} hoje={hoje} pessoas={pessoas} comColunas={it.tipo === "acao"} preencher
                  onAlterar={(c) => operar(anterior.id, { op: "item_alterar", itemId: it.id, campos: c })}
                  extra={it.tipo === "decisao" ? <span className="px-2 text-[11px] font-medium" style={{ color: COR.roxo }}>Decisão</span> : botaoTrazer(anterior.id, it)} />
              ))}
            </tbody>
          </table>
        )}
      </Grupo>

      {antigas.length > 0 && (
        <Grupo cor={COR.vermelho} titulo="Pendências de reuniões mais antigas" detalhe={`${antigas.length} em aberto`}>
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <CabecalhoDaTabela comColunas />
            <tbody>
              {antigas.map((p) => (
                <LinhaDoItem key={`${p.reuniao.id}:${p.item.id}`} item={p.item} hoje={hoje} pessoas={pessoas} comColunas
                  onAlterar={(c) => operar(p.reuniao.id, { op: "item_alterar", itemId: p.item.id, campos: c })}
                  extra={<><span className="px-1 text-[11px] text-muted-foreground">nº {p.reuniao.numero}</span>{botaoTrazer(p.reuniao.id, p.item)}</>} />
              ))}
            </tbody>
          </table>
        </Grupo>
      )}
    </div>
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

  const resumo = useMemo(() => (r ? resumirReuniao(r, hoje) : null), [r, hoje]);
  const opcoesPessoas = useMemo(() => {
    const nomes = new Map<string, Pessoa>(pessoas.map((p) => [p.nome.toLowerCase(), p]));
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

  const adicionar = (tipo: TipoItem, descricao: string) => operar(r.id, { op: "item_novo", id: novoId(), item: { descricao, tipo } });

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
    <div className="space-y-6 p-4 sm:p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-muted-foreground">
        <Link to="/qualidade/atas"><ArrowLeft className="h-4 w-4" /> {r.grupo}</Link>
      </Button>

      {/* Cabeçalho da reunião */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-12 min-w-12 place-items-center rounded-lg px-2 text-xl font-bold text-white" style={{ background: COR_DA_REUNIAO[r.status] }} title={`Reunião nº ${r.numero} (pela data)`}>
            {r.numero}
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">Reunião nº {r.numero} · {r.grupo}</div>
            <h1 className="truncate text-2xl font-bold tracking-tight md:text-[28px]">{tituloDaReuniao(r)}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{dataBr(r.data)}</span>
              {r.horaInicio && <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{r.horaInicio}{r.horaFim ? `–${r.horaFim}` : ""}</span>}
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{r.local || "Local não informado"}</span>
              <Etiqueta cor={COR_DA_REUNIAO[r.status]}>{STATUS_REUNIAO_LABEL[r.status]}</Etiqueta>
              <span className="text-xs">Redator: {r.redator || r.criadaPor}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditando(true)}><Pencil className="h-3.5 w-3.5" /> Dados</Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportar} disabled={gerando}>
            {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} Exportar PDF
          </Button>
          {r.status === "agendada" && <Button size="sm" className="gap-1.5" onClick={() => operar(r.id, { op: "status", status: "em_andamento" })}><Play className="h-3.5 w-3.5" /> Iniciar reunião</Button>}
          {r.status === "em_andamento" && <Button size="sm" className="gap-1.5 text-white hover:opacity-90" style={{ background: COR.verde }} onClick={() => operar(r.id, { op: "status", status: "encerrada" })}><Check className="h-3.5 w-3.5" /> Encerrar ata</Button>}
          {r.status === "encerrada" && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => operar(r.id, { op: "status", status: "em_andamento" })}><RotateCcw className="h-3.5 w-3.5" /> Reabrir</Button>}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Excluir reunião" onClick={() => setConfirmaExcluir(true)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </header>

      {r.status === "encerrada" && (
        <div className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: `${COR.verde}55`, background: `${COR.verde}14` }}>
          Ata encerrada{r.encerradaPor ? ` por ${r.encerradaPor}` : ""}{r.encerradaEm ? ` em ${new Date(r.encerradaEm).toLocaleString("pt-BR")}` : ""}. As pendências continuam acompanháveis e podem ser trazidas para a próxima reunião.
        </div>
      )}

      {/* Resumo rápido */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rot: "Ações", val: resumo.acoes, cor: COR.azul },
          { rot: "Concluídas", val: resumo.concluidas, cor: COR.verde },
          { rot: "Em aberto", val: resumo.emAberto, cor: COR.laranja },
          { rot: "Atrasadas", val: resumo.atrasadas, cor: resumo.atrasadas ? COR.vermelho : COR.cinza },
        ].map((k) => (
          <div key={k.rot} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
            <span className="h-8 w-1.5 rounded-full" style={{ background: k.cor }} />
            <div>
              <div className="text-2xl font-bold tabular-nums leading-none">{k.val}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{k.rot}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Participantes r={r} pessoas={opcoesPessoas} />
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-2 font-semibold">Pauta</div>
          <TextoEditavel valor={r.pauta} placeholder="Assuntos da reunião…" linhas={3} onSalvar={(v) => operar(r.id, { op: "dados", campos: { pauta: v } })} className="border-input" />
        </section>
      </div>

      <AlinhadoAntes r={r} todas={todas} hoje={hoje} pessoas={opcoesPessoas} />

      {GRUPOS_DA_REUNIAO.map((g) => {
        const itens = r.itens.filter((i) => i.tipo === g.tipo);
        const comColunas = g.tipo === "acao";
        return (
          <Grupo key={g.tipo} cor={g.cor} titulo={g.titulo}
            detalhe={g.tipo === "acao"
              ? `${resumo.acoes} · ${resumo.concluidas} concluída(s) · ${resumo.emAberto} em aberto${resumo.atrasadas ? ` · ${resumo.atrasadas} atrasada(s)` : ""}`
              : `${itens.length} item(ns)`}>
            <table className={cn("w-full border-collapse text-sm", comColunas && "min-w-[760px]")}>
              <CabecalhoDaTabela comColunas={comColunas} primeira={g.tipo === "acao" ? "Ação" : g.tipo === "decisao" ? "Decisão" : "Informe"} />
              <tbody>
                {itens.map((it) => (
                  <LinhaDoItem key={it.id} item={it} hoje={hoje} pessoas={opcoesPessoas} comColunas={comColunas}
                    onAlterar={(campos) => operar(r.id, { op: "item_alterar", itemId: it.id, campos })}
                    onRemover={() => operar(r.id, { op: "item_remover", itemId: it.id })} />
                ))}
                <LinhaNova placeholder={g.novo} colSpan={comColunas ? 5 : 2} onAdicionar={(t) => adicionar(g.tipo, t)} />
                {comColunas && <RodapeBateria itens={itens} hoje={hoje} />}
              </tbody>
            </table>
          </Grupo>
        );
      })}

      <section className="rounded-lg border bg-card p-4">
        <div className="mb-2 font-semibold">Observações gerais</div>
        <TextoEditavel valor={r.observacoes} placeholder="Observações, próximos passos, data da próxima reunião…" linhas={2} onSalvar={(v) => operar(r.id, { op: "dados", campos: { observacoes: v } })} className="border-input" />
      </section>

      {editando && <EditarDadosDialog r={r} aberto={editando} onAbertoChange={setEditando} />}

      <AlertDialog open={confirmaExcluir} onOpenChange={setConfirmaExcluir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a reunião nº {r.numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              A ata e todos os seus itens serão apagados, e as reuniões seguintes do grupo serão renumeradas. Pendências que já foram trazidas para outras reuniões continuam lá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => excluir.mutate(r.id, { onSuccess: () => { toast.success("Reunião excluída"); void navigate({ to: "/qualidade/atas" }); } })}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
