/**
 * Meus laudos — um lugar só para ver o que falta verificar, aprovar e corrigir.
 * Primeira aba (a padrão) da Central de Relatórios.
 *
 * Quadro do fluxo (devolvidos · em correção · a verificar · a aprovar ·
 * aprovados) com todos os laudos que têm revisão enviada, lidos do mesmo
 * arquivo por ensaio que as outras telas usam. "Só o que é comigo" deixa só o
 * que pede ação de quem está logado. A regra de filas está em
 * lib/mesa-de-laudos.ts.
 */
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  FilePenLine,
  Inbox,
  MessageSquareWarning,
  RefreshCw,
  Search,
  ShieldCheck,
  Stamp,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EmissaoRow } from "@/lib/emissoes.functions";
import { useLaudosNoFluxo } from "@/features/lab/hooks/use-laudos-no-fluxo";
import { ChecksDeEntrega, useConfirmarEntrega } from "@/features/lab/components/ChecksDeEntrega";
import { completarPdfDaRevisao } from "@/lib/approvals-com-pdf";
import { podeAprovar, podeConcluirFora, podeVerificar } from "@/lib/papeis";
import { useAuth } from "@/hooks/use-auth";
import { BUSINESS_DAY_MS, businessElapsedMs } from "@/lib/business-days";
import { desdeQuando, FILAS, montarMesa, pedeMinhaAcao, type Fila } from "@/lib/mesa-de-laudos";
import { EnsaioTag } from "@/features/lab/components/EnsaioTag";
import { ENSAIO_LABEL, type EnsaioTipo } from "@/features/lab/types";
import { cn } from "@/lib/utils";
import { familiaDoEnsaio, type Familia } from "@/lib/familia-ensaio";

const INFO: Record<
  Fila,
  {
    titulo: string;
    vazio: string;
    Icon: typeof Inbox;
    cor: string;
    barra: string;
    acao: string;
    sla: number | null;
  }
> = {
  devolvido: {
    titulo: "Devolvidos para correção",
    vazio: "Nenhum laudo devolvido.",
    Icon: MessageSquareWarning,
    cor: "text-rose-700 dark:text-rose-300",
    barra: "bg-rose-500",
    acao: "Corrigir",
    sla: 1,
  },
  correcao: {
    titulo: "Em correção (nova revisão)",
    vazio: "Nenhuma revisão reaberta.",
    Icon: FilePenLine,
    cor: "text-blue-700 dark:text-blue-300",
    barra: "bg-blue-500",
    acao: "Continuar",
    sla: 1.5,
  },
  verificar: {
    titulo: "A verificar",
    vazio: "Nada aguardando verificação.",
    Icon: ShieldCheck,
    cor: "text-violet-700 dark:text-violet-300",
    barra: "bg-violet-500",
    acao: "Verificar",
    sla: 1.5,
  },
  aprovar: {
    titulo: "A aprovar",
    vazio: "Nada aguardando aprovação.",
    Icon: Stamp,
    cor: "text-indigo-700 dark:text-indigo-300",
    barra: "bg-indigo-500",
    acao: "Aprovar",
    sla: 1.5,
  },
  aprovado: {
    titulo: "A entregar (SOND · GDrive)",
    vazio: "Nenhum laudo aprovado esperando entrega.",
    Icon: CheckCircle2,
    cor: "text-emerald-700 dark:text-emerald-300",
    barra: "bg-emerald-500",
    acao: "Abrir",
    sla: null,
  },
};

/** Ordem do quadro: o que volta para quem digita, depois o que avança. */
const ORDEM_DO_QUADRO: Fila[] = ["devolvido", "correcao", "verificar", "aprovar", "aprovado"];

function fmtEspera(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min`;
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

function fmtData(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

function rotaDoLaudo(scopeId: string) {
  const p = scopeId.split("/");
  const iOs = p.indexOf("os");
  const iAm = p.indexOf("amostra");
  const iEn = p.indexOf("ensaio");
  if (iOs === -1 || iAm === -1 || iEn === -1) return null;
  return { osId: p[iOs + 1], amostraId: p[iAm + 1], ensaioId: p[iEn + 1] };
}

function nomeDoEnsaio(r: EmissaoRow) {
  return (
    (r.ensaio_tipo && ENSAIO_LABEL[r.ensaio_tipo as EnsaioTipo]) ||
    r.ensaio_nome ||
    r.ensaio_tipo ||
    "Ensaio"
  );
}

export function MesaDeLaudos({ familia = "all" }: { familia?: Familia | "all" }) {
  const { role, profile, user } = useAuth();
  const papel = useMemo(
    () => ({
      verifica: podeVerificar({ role, labRole: profile?.labRole }),
      aprova: podeAprovar({ role, labRole: profile?.labRole }),
      userId: user?.id ?? null,
    }),
    [role, profile?.labRole, user?.id],
  );
  const consulta = useLaudosNoFluxo();
  const rows = consulta.data ?? null;
  const carregando = consulta.isFetching;
  const podeEntregar = podeConcluirFora({ role, labRole: profile?.labRole });
  const { pedir, dialogo } = useConfirmarEntrega();
  const [soComigo, setSoComigo] = useState(true);
  const [busca, setBusca] = useState("");
  const [pdf, setPdf] = useState<{ url: string; titulo: string } | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);

  const recarregar = () => consulta.refetch();

  const agora = Date.now();
  // Aprovado e já entregue (SOND + GDrive) sai do quadro: está na aba Entregas.
  const mesaCompleta = useMemo(
    () =>
      montarMesa(
        (rows ?? []).filter(
          (r) =>
            !(r.status === "aprovado" && r.entrega?.entregue) &&
            (familia === "all" || familiaDoEnsaio(r.ensaio_tipo, r.ensaio_nome) === familia),
        ),
        agora,
        60,
      ),
    [rows, familia], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const comigo = useMemo(() => {
    const out = {} as Record<Fila, number>;
    for (const f of FILAS)
      out[f] = mesaCompleta[f].filter((l) => pedeMinhaAcao(l, f, papel)).length;
    return out;
  }, [mesaCompleta, papel]);
  const totalComigo = FILAS.reduce((s, f) => s + comigo[f], 0);

  const mesa = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const out = {} as Record<Fila, EmissaoRow[]>;
    for (const f of FILAS) {
      out[f] = mesaCompleta[f].filter((l) => {
        if (soComigo && f !== "aprovado" && !pedeMinhaAcao(l, f, papel)) return false;
        if (!termo) return true;
        return [l.os_numero, l.os_cliente, l.amostra_code, nomeDoEnsaio(l), l.requested_by_name]
          .filter(Boolean)
          .some((t) => String(t).toLowerCase().includes(termo));
      });
    }
    return out;
  }, [mesaCompleta, soComigo, busca, papel]);

  const verPdf = async (r: EmissaoRow) => {
    if (r.rev == null) return;
    setAbrindo(r.scope_id);
    try {
      const { bytes } = await completarPdfDaRevisao(r.scope_id, r.rev, r);
      const buf = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buf).set(bytes);
      if (pdf) URL.revokeObjectURL(pdf.url);
      setPdf({
        url: URL.createObjectURL(new Blob([buf], { type: "application/pdf" })),
        titulo: `OS ${r.os_numero ?? "—"} · ${r.amostra_code ?? "—"} · ${nomeDoEnsaio(r)} · Rev-${String(r.rev).padStart(2, "0")}`,
      });
    } catch (e) {
      toast.error("Não foi possível abrir o PDF: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAbrindo(null);
    }
  };

  const papelTexto = papel.aprova
    ? "Você verifica e aprova"
    : papel.verifica
      ? "Você verifica"
      : "Você digita";

  return (
    <div className="flex flex-col gap-5">
      {dialogo}

      {/* Resumo: o que é comigo */}
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-3 pr-2">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold",
                totalComigo > 0
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {rows == null ? "…" : totalComigo}
            </div>
            <div>
              <div className="text-sm font-semibold">
                {totalComigo === 1 ? "laudo precisa de você" : "laudos precisam de você"}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <UserRound className="h-3 w-3" /> {papelTexto}
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-wrap gap-2">
            {ORDEM_DO_QUADRO.filter((f) => f !== "aprovado").map((f) => {
              const I = INFO[f];
              return (
                <a
                  key={f}
                  href={`#fila-${f}`}
                  className={cn(
                    "flex min-w-[140px] flex-1 items-center gap-2 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/60",
                    comigo[f] > 0 ? "border-border" : "border-dashed opacity-70",
                  )}
                >
                  <I.Icon className={cn("h-4 w-4 shrink-0", I.cor)} />
                  <span className="text-xs leading-tight">{I.titulo}</span>
                  <span
                    className={cn(
                      "ml-auto text-lg font-bold tabular-nums",
                      comigo[f] > 0 ? I.cor : "text-muted-foreground",
                    )}
                  >
                    {comigo[f]}
                  </span>
                </a>
              );
            })}
          </div>
        </div>
        {/* Barra do fluxo: onde estão todos os laudos agora */}
        {rows && (
          <div className="mt-4">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              {ORDEM_DO_QUADRO.map((f) => {
                const n = mesaCompleta[f].length;
                const total = FILAS.reduce((s, x) => s + mesaCompleta[x].length, 0) || 1;
                return n > 0 ? (
                  <div
                    key={f}
                    className={INFO[f].barra}
                    style={{ width: `${(n / total) * 100}%` }}
                    title={`${INFO[f].titulo}: ${n}`}
                  />
                ) : null;
              })}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {ORDEM_DO_QUADRO.map((f) => (
                <span key={f} className="inline-flex items-center gap-1">
                  <span className={cn("inline-block h-2 w-2 rounded-full", INFO[f].barra)} />
                  {INFO[f].titulo}:{" "}
                  <b className="text-foreground tabular-nums">{mesaCompleta[f].length}</b>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar OS, cliente, amostra, ensaio…"
            className="h-9 pl-8"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={soComigo} onCheckedChange={setSoComigo} />
          Só o que é comigo
        </label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void recarregar()}
          disabled={carregando}
          className="ml-auto gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", carregando && "animate-spin")} /> Atualizar
        </Button>
        {!soComigo && (
          <span className="text-xs text-muted-foreground">Mostrando todos os laudos no fluxo.</span>
        )}
      </div>

      {/* Quadro */}
      {rows == null ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Carregando laudos…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {ORDEM_DO_QUADRO.map((f) => {
            const I = INFO[f];
            const lista = mesa[f];
            return (
              <section
                key={f}
                id={`fila-${f}`}
                className="flex min-w-0 flex-col rounded-xl border bg-muted/20"
              >
                <header className="flex items-center gap-2 border-b px-3 py-2.5">
                  <span className={cn("h-2.5 w-2.5 rounded-full", I.barra)} />
                  <h2 className={cn("text-sm font-semibold", I.cor)}>{I.titulo}</h2>
                  <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-xs font-bold tabular-nums">
                    {lista.length}
                  </span>
                </header>
                <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
                  {lista.length === 0 ? (
                    <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                      {soComigo && f !== "aprovado" && mesaCompleta[f].length > 0
                        ? `Nada com você (${mesaCompleta[f].length} com outras pessoas).`
                        : I.vazio}
                    </div>
                  ) : (
                    lista.map((r) => (
                      <CartaoDoLaudo
                        key={r.scope_id}
                        r={r}
                        fila={f}
                        agora={agora}
                        meu={pedeMinhaAcao(r, f, papel)}
                        abrindo={abrindo === r.scope_id}
                        onVerPdf={() => void verPdf(r)}
                        entrega={
                          f === "aprovado" && r.entrega ? (
                            <ChecksDeEntrega
                              scopeId={r.scope_id}
                              descricao={`OS ${r.os_numero ?? "—"} · ${r.amostra_code ?? "—"} · ${nomeDoEnsaio(r)} (Rev-${String(r.rev ?? 0).padStart(2, "0")})`}
                              sond={r.entrega.sond}
                              gdrive={r.entrega.gdrive}
                              pedir={pedir}
                              podeMarcar={podeEntregar}
                              compacto
                            />
                          ) : null
                        }
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!pdf}
        onOpenChange={(o) => {
          if (!o && pdf) {
            URL.revokeObjectURL(pdf.url);
            setPdf(null);
          }
        }}
      >
        <DialogContent className="flex h-[92vh] w-[95vw] max-w-[95vw] flex-col p-0">
          <DialogHeader className="border-b px-4 py-2">
            <DialogTitle className="text-sm">{pdf?.titulo}</DialogTitle>
            <DialogDescription className="text-xs">
              Cópia oficial do Drive, com as assinaturas já registradas.
            </DialogDescription>
          </DialogHeader>
          {pdf && <iframe src={pdf.url} title="Laudo em PDF" className="w-full flex-1 border-0" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CartaoDoLaudo({
  r,
  fila,
  agora,
  meu,
  abrindo,
  onVerPdf,
  entrega,
}: {
  entrega?: React.ReactNode;
  r: EmissaoRow;
  fila: Fila;
  agora: number;
  meu: boolean;
  abrindo: boolean;
  onVerPdf: () => void;
}) {
  const I = INFO[fila];
  const desde = desdeQuando(r, fila);
  // Espera em horas corridas (o que a pessoa entende); atraso pelo SLA em horas úteis.
  const esperaMs = desde ? agora - Date.parse(desde) : NaN;
  const uteisMs = desde ? businessElapsedMs(desde, new Date(agora).toISOString()) : NaN;
  const atrasado = I.sla != null && Number.isFinite(uteisMs) && uteisMs > I.sla * BUSINESS_DAY_MS;
  const rota = rotaDoLaudo(r.scope_id);
  const rev = r.rev ?? 0;
  const temPdf = fila !== "correcao";

  return (
    <article
      className={cn(
        "rounded-lg border bg-card p-2.5 text-xs shadow-sm",
        meu && fila !== "aprovado" && "border-l-4",
        meu && fila === "devolvido" && "border-l-rose-500",
        meu && fila === "correcao" && "border-l-blue-500",
        meu && fila === "verificar" && "border-l-violet-500",
        meu && fila === "aprovar" && "border-l-indigo-500",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-foreground">
            OS {r.os_numero ?? "—"}
            <span className="font-normal text-muted-foreground"> · {r.amostra_code ?? "—"}</span>
          </div>
          <div className="truncate text-[11px] text-muted-foreground" title={r.os_cliente ?? ""}>
            {r.os_cliente ?? "—"}
          </div>
        </div>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold">
          Rev-{String(rev).padStart(2, "0")}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        {r.ensaio_tipo && <EnsaioTag tipo={r.ensaio_tipo as EnsaioTipo} />}
        <span className="truncate" title={nomeDoEnsaio(r)}>
          {nomeDoEnsaio(r)}
        </span>
      </div>

      {fila === "devolvido" && r.verification_comment && (
        <div className="mt-1.5 rounded bg-rose-500/10 px-2 py-1 text-[11px] text-rose-900 dark:text-rose-200">
          “{r.verification_comment}”
          {r.verified_by_name && (
            <span className="text-muted-foreground"> — {r.verified_by_name}</span>
          )}
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        {fila === "aprovado" ? (
          <span>
            Aprovado {fmtData(r.decided_at)}
            {r.decided_by_name ? ` por ${r.decided_by_name}` : ""}
          </span>
        ) : (
          <>
            <span
              className={cn(atrasado && "font-semibold text-destructive")}
              title={desde ? fmtData(desde) : ""}
            >
              há {fmtEspera(esperaMs)}
              {atrasado ? " · atrasado" : ""}
            </span>
            {r.requested_by_name && <span>· enviado por {r.requested_by_name}</span>}
            {fila === "aprovar" && r.verified_by_name && (
              <span>· verificado por {r.verified_by_name}</span>
            )}
          </>
        )}
      </div>

      <div className="mt-2 flex gap-1.5">
        {rota && (
          <Button
            asChild
            size="sm"
            variant={meu && fila !== "aprovado" ? "default" : "outline"}
            className="h-7 flex-1 text-xs"
          >
            <Link to="/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId" params={rota}>
              {meu ? I.acao : "Abrir"}
            </Link>
          </Button>
        )}
        {temPdf && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            disabled={abrindo}
            onClick={onVerPdf}
          >
            <Eye className="h-3.5 w-3.5" /> {abrindo ? "…" : "PDF"}
          </Button>
        )}
      </div>
      {entrega && <div className="mt-2 border-t pt-2">{entrega}</div>}
    </article>
  );
}
