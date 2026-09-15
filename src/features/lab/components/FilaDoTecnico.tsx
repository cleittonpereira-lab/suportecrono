/**
 * "Minha fila" — o que o laboratorista tem para fazer, direto do Gantt: o que
 * está em execução, o que começa hoje (ou já devia ter começado) e os próximos
 * 7 dias. Iniciar e concluir aqui é o mesmo que no Gantt e no Leitor QR
 * (hooks/use-acoes-da-programacao.ts): tempo real, cascata e pendência de
 * digitação.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, CheckCircle2, FlaskConical, Loader2, PlayCircle, ScanLine } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listRows } from "@/lib/programacao.functions";
import {
  SHEET_AMOSTRAS,
  SHEET_ENSAIOS,
  SHEET_EQUIPS,
  SHEET_PROGS,
  SHEET_TIPOS,
  parseProgramacaoRow,
  type Programacao,
} from "@/lib/programacao-model";
import { useAuth } from "@/hooks/use-auth";
import { isoHoje, useAcoesDaProgramacao, type ContextoDoEnsaio } from "@/features/lab/hooks/use-acoes-da-programacao";

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** A programação guarda o NOME do executor, não a conta: compara nome inteiro ou primeiro nome. */
function ehDaPessoa(tecnico: string | null, nome: string): boolean {
  if (!tecnico || !nome) return false;
  const t = semAcento(tecnico);
  const n = semAcento(nome);
  if (t === n) return true;
  const primeiroT = t.split(/\s+/)[0];
  return !!primeiroT && primeiroT === n.split(/\s+/)[0];
}

function somaDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + dias);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

type Item = {
  prog: Programacao;
  ensaio: string;
  os: string;
  amostra: string;
  identificacao: string;
  equipamento: string;
  ctx: ContextoDoEnsaio;
  atrasado: boolean;
};

const lista = (sheet: string) => ({
  queryKey: ["fila-tecnico", sheet],
  queryFn: () => listRows({ data: { sheet } }),
  staleTime: 20_000,
});

export function FilaDoTecnico() {
  const { displayName } = useAuth();
  const { data: progsCruas = [], isLoading } = useQuery(lista(SHEET_PROGS));
  const { data: ensaios = [] } = useQuery(lista(SHEET_ENSAIOS));
  const { data: amostras = [] } = useQuery(lista(SHEET_AMOSTRAS));
  const { data: tipos = [] } = useQuery(lista(SHEET_TIPOS));
  const { data: equipamentos = [] } = useQuery(lista(SHEET_EQUIPS));

  const progs = useMemo(() => progsCruas.map(parseProgramacaoRow), [progsCruas]);
  const { iniciar, concluir, salvando } = useAcoesDaProgramacao(progs);

  const tecnicos = useMemo(
    () => [...new Set(progs.map((p) => (p.tecnico ?? "").trim()).filter(Boolean))].sort(),
    [progs],
  );
  const temMinhas = useMemo(() => progs.some((p) => ehDaPessoa(p.tecnico, displayName)), [progs, displayName]);
  // Sem nada no nome da pessoa, começa mostrando tudo — senão a fila pareceria vazia.
  const [quem, setQuem] = useState<string | null>(null);
  const filtro = quem ?? (temMinhas ? "__minhas" : "__todos");

  const grupos = useMemo(() => {
    const hoje = isoHoje();
    const limite = somaDias(hoje, 7);
    const enPorId = new Map(ensaios.map((e) => [e.id, e]));
    const amPorId = new Map(amostras.map((a) => [a.id, a]));
    const tpPorId = new Map(tipos.map((t) => [t.id, t]));
    const eqPorId = new Map(equipamentos.map((e) => [e.id, e]));
    const g = { execucao: [] as Item[], hoje: [] as Item[], proximos: [] as Item[] };

    for (const p of progs) {
      if (p.status === "concluido") continue;
      if (filtro === "__minhas" && !ehDaPessoa(p.tecnico, displayName)) continue;
      if (filtro !== "__minhas" && filtro !== "__todos" && (p.tecnico ?? "").trim() !== filtro) continue;

      const e = enPorId.get(p.ensaio_id);
      const a = e ? amPorId.get(e.amostra_id) : undefined;
      const t = e ? tpPorId.get(e.tipo_ensaio_id) : undefined;
      const tipoNome = t?.nome || e?.etiqueta || "Tipo não identificado";
      const item = (atrasado: boolean): Item => ({
        prog: p,
        ensaio: tipoNome,
        os: a?.os_numero || "—",
        amostra: a?.codigo_amostra || a?.identificacao || "—",
        identificacao: (a?.descricao || "").split(" — ")[0] || a?.identificacao || "",
        equipamento: (p.equipamento_id && eqPorId.get(p.equipamento_id)?.nome) || "Sem equipamento",
        ctx: { os: a?.os_numero || "", amostra: a?.codigo_amostra ?? null, tipoNome },
        atrasado,
      });

      if (p.status === "em_execucao") {
        g.execucao.push(item(!!p.data_fim && p.data_fim < hoje));
        continue;
      }
      const inicio = p.data_inicio;
      if (!inicio) continue;
      if (inicio <= hoje) g.hoje.push(item(inicio < hoje));
      else if (inicio <= limite) g.proximos.push(item(false));
    }
    const porData = (a: Item, b: Item) => (a.prog.data_inicio ?? "").localeCompare(b.prog.data_inicio ?? "");
    g.execucao.sort((a, b) => (a.prog.data_fim ?? "").localeCompare(b.prog.data_fim ?? ""));
    g.hoje.sort(porData);
    g.proximos.sort(porData);
    return g;
  }, [progs, ensaios, amostras, tipos, equipamentos, filtro, displayName]);

  const total = grupos.execucao.length + grupos.hoje.length + grupos.proximos.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          O que está programado no Gantt para a bancada. Iniciar e concluir aqui atualiza o Gantt na hora.
        </p>
        <Select value={filtro} onValueChange={setQuem}>
          <SelectTrigger className="h-9 w-[220px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__minhas">Minha fila ({displayName})</SelectItem>
            <SelectItem value="__todos">Todos os técnicos</SelectItem>
            {tecnicos.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lendo a programação…
        </p>
      ) : total === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nada programado {filtro === "__minhas" ? "para você" : "nesta fila"} até os próximos 7 dias.
          </CardContent>
        </Card>
      ) : (
        <>
          <Secao
            titulo="Em execução"
            icone={FlaskConical}
            itens={grupos.execucao}
            vazio="Nenhum ensaio em execução."
            acao={(it) => (
              <Button size="sm" className="gap-1.5" disabled={salvando} onClick={() => concluir(it.prog, it.ctx)}>
                <CheckCircle2 className="h-4 w-4" /> Concluir
              </Button>
            )}
            extra={() => (
              <Button size="sm" variant="outline" className="gap-1.5" asChild>
                <Link to="/relatorio/digitalizacao">
                  <ScanLine className="h-4 w-4" /> Digitalizar
                </Link>
              </Button>
            )}
          />
          <Secao
            titulo="Para hoje"
            icone={CalendarClock}
            itens={grupos.hoje}
            vazio="Nada para começar hoje."
            acao={(it) => (
              <Button size="sm" className="gap-1.5" disabled={salvando} onClick={() => iniciar(it.prog, it.ctx, displayName)}>
                <PlayCircle className="h-4 w-4" /> Iniciar
              </Button>
            )}
          />
          <Secao
            titulo="Próximos 7 dias"
            icone={CalendarClock}
            itens={grupos.proximos}
            vazio="Nada programado para os próximos dias."
            acao={(it) => (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={salvando} onClick={() => iniciar(it.prog, it.ctx, displayName)}>
                <PlayCircle className="h-4 w-4" /> Iniciar antes
              </Button>
            )}
          />
        </>
      )}
    </div>
  );
}

function Secao({
  titulo,
  icone: Icone,
  itens,
  vazio,
  acao,
  extra,
}: {
  titulo: string;
  icone: React.ComponentType<{ className?: string }>;
  itens: Item[];
  vazio: string;
  acao: (it: Item) => React.ReactNode;
  extra?: (it: Item) => React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icone className="h-4 w-4 text-primary" /> {titulo}
        <Badge variant="secondary" className="text-[10px]">
          {itens.length}
        </Badge>
      </h2>
      {itens.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-6">{vazio}</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {itens.map((it) => (
            <Card key={it.prog.id} className={it.atrasado ? "border-rose-500/40" : undefined}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{it.ensaio}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      OS {it.os} · {it.amostra}
                      {it.identificacao && it.identificacao !== it.amostra ? ` · ${it.identificacao}` : ""}
                    </div>
                  </div>
                  {it.atrasado && (
                    <Badge variant="outline" className="shrink-0 gap-1 bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 text-[10px]">
                      <AlertTriangle className="h-3 w-3" /> Atrasado
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 text-[11px] text-muted-foreground">
                  <span>Equipamento: <b className="text-foreground font-medium">{it.equipamento}</b></span>
                  <span>Técnico: <b className="text-foreground font-medium">{it.prog.tecnico || "—"}</b></span>
                  <span>Início: {dataBr(it.prog.data_inicio)}</span>
                  <span>Fim previsto: {dataBr(it.prog.data_fim)}</span>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  {extra?.(it)}
                  {acao(it)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
