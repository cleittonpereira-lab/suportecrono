/**
 * Aba "Entregas" da Central de Relatórios: laudos aprovados, agrupados por OS,
 * com os checks de SOND e GDrive do cliente. Com os dois, o laudo vira
 * Entregue e sai de "A entregar" (antes todo aprovado ficava empilhado em
 * "Concluídos" para sempre). A OS inteira pode ser marcada de uma vez.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, CloudUpload, Globe, PackageCheck, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SondButton } from "@/components/sond-button";
import { EnsaioTag } from "@/features/lab/components/EnsaioTag";
import { ENSAIO_LABEL, type EnsaioTipo } from "@/features/lab/types";
import type { EmissaoRow } from "@/lib/emissoes.functions";
import { useAuth } from "@/hooks/use-auth";
import { podeConcluirFora } from "@/lib/papeis";
import { useLaudosNoFluxo } from "@/features/lab/hooks/use-laudos-no-fluxo";
import { ChecksDeEntrega, useConfirmarEntrega } from "@/features/lab/components/ChecksDeEntrega";
import { cn } from "@/lib/utils";

type Filtro = "a-entregar" | "entregues" | "todos";
type Periodo = "60" | "todos";
const DIA = 86_400_000;

function nomeDoEnsaio(r: EmissaoRow) {
  return (
    (r.ensaio_tipo && ENSAIO_LABEL[r.ensaio_tipo as EnsaioTipo]) ||
    r.ensaio_nome ||
    r.ensaio_tipo ||
    "Ensaio"
  );
}
function fmtDia(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}
function rota(scopeId: string) {
  const p = scopeId.split("/");
  const i = (k: string) => p.indexOf(k);
  if (i("os") < 0 || i("amostra") < 0 || i("ensaio") < 0) return null;
  return { osId: p[i("os") + 1], amostraId: p[i("amostra") + 1], ensaioId: p[i("ensaio") + 1] };
}

export function EntregasView() {
  const { data: rows, isLoading } = useLaudosNoFluxo();
  const { role, profile } = useAuth();
  const podeMarcar = podeConcluirFora({ role, labRole: profile?.labRole });
  const { pedir, dialogo } = useConfirmarEntrega();
  const [filtro, setFiltro] = useState<Filtro>("a-entregar");
  const [periodo, setPeriodo] = useState<Periodo>("60");
  const [busca, setBusca] = useState("");

  const aprovados = useMemo(() => (rows ?? []).filter((r) => r.entrega != null), [rows]);
  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const agora = Date.now();
    const lista = aprovados.filter((r) => {
      const e = r.entrega!;
      if (filtro === "a-entregar" && e.entregue) return false;
      if (filtro === "entregues" && !e.entregue) return false;
      if (periodo === "60" && r.decided_at && agora - Date.parse(r.decided_at) > 60 * DIA)
        return false;
      if (!termo) return true;
      return [r.os_numero, r.os_cliente, r.amostra_code, nomeDoEnsaio(r)]
        .filter(Boolean)
        .some((t) => String(t).toLowerCase().includes(termo));
    });
    const porOs = new Map<string, EmissaoRow[]>();
    for (const r of lista) {
      const k = r.os_numero ?? "—";
      porOs.set(k, [...(porOs.get(k) ?? []), r]);
    }
    // OS com laudo aprovado há mais tempo sem entregar primeiro.
    return [...porOs.entries()]
      .map(([os, itens]) => ({
        os,
        cliente: itens[0]?.os_cliente ?? "",
        itens: itens.sort((a, b) => (a.amostra_code ?? "").localeCompare(b.amostra_code ?? "")),
        maisAntigo: Math.min(...itens.map((r) => Date.parse(r.decided_at ?? "") || agora)),
      }))
      .sort((a, b) => a.maisAntigo - b.maisAntigo);
  }, [aprovados, filtro, periodo, busca]);

  const pedirOs = (canal: "sond" | "gdrive", os: string, itens: EmissaoRow[]) => {
    const faltam = itens.filter((r) => !r.entrega![canal]);
    if (faltam.length === 0) return;
    pedir({
      canal,
      marcado: true,
      scopeIds: faltam.map((r) => r.scope_id),
      descricao: `OS ${os}: marcar ${faltam.length} laudo(s) aprovado(s) de uma vez.`,
    });
  };

  return (
    <div className="space-y-4">
      {dialogo}
      <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Marque <Globe className="inline h-3 w-3" /> <b>SOND</b> quando o laudo estiver postado para
        o cliente e <CloudUpload className="inline h-3 w-3" /> <b>GDrive</b> quando estiver na pasta
        do cliente. Com os dois, o laudo é <b>entregue</b> e sai das filas. Nova revisão aprovada
        volta para "A entregar".
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="OS, cliente, amostra, ensaio…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex rounded-md border p-0.5">
          {(
            [
              ["a-entregar", "A entregar"],
              ["entregues", "Entregues"],
              ["todos", "Todos"],
            ] as [Filtro, string][]
          ).map(([v, r]) => (
            <Button
              key={v}
              size="sm"
              variant={filtro === v ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setFiltro(v)}
            >
              {r}
            </Button>
          ))}
        </div>
        <div className="flex rounded-md border p-0.5">
          <Button
            size="sm"
            variant={periodo === "60" ? "secondary" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setPeriodo("60")}
          >
            Aprovados nos últimos 60 dias
          </Button>
          <Button
            size="sm"
            variant={periodo === "todos" ? "secondary" : "ghost"}
            className="h-7 text-xs"
            onClick={() => setPeriodo("todos")}
          >
            Todos
          </Button>
        </div>
        {!podeMarcar && (
          <span className="text-xs text-muted-foreground">Só quem verifica marca a entrega.</span>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Carregando laudos…
        </div>
      ) : grupos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          <PackageCheck className="mx-auto mb-2 h-6 w-6" />
          {filtro === "a-entregar"
            ? "Nada a entregar. Todos os laudos aprovados já foram entregues."
            : "Nenhum laudo aqui."}
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map((g) => {
            const entregues = g.itens.filter((r) => r.entrega!.entregue).length;
            const faltaSond = g.itens.some((r) => !r.entrega!.sond);
            const faltaGdrive = g.itens.some((r) => !r.entrega!.gdrive);
            return (
              <section key={g.os} className="overflow-hidden rounded-lg border bg-card">
                <header className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
                  <span className="font-bold">OS {g.os}</span>
                  <span className="truncate text-xs text-muted-foreground">{g.cliente}</span>
                  <SondButton os={g.os} variant="button" />
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      entregues === g.itens.length && "border-emerald-500/50 text-emerald-700",
                    )}
                  >
                    {entregues}/{g.itens.length} entregues
                  </Badge>
                  {podeMarcar && (
                    <div className="ml-auto flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        disabled={!faltaSond}
                        onClick={() => pedirOs("sond", g.os, g.itens)}
                      >
                        <Globe className="h-3.5 w-3.5" /> SOND na OS toda
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        disabled={!faltaGdrive}
                        onClick={() => pedirOs("gdrive", g.os, g.itens)}
                      >
                        <CloudUpload className="h-3.5 w-3.5" /> GDrive na OS toda
                      </Button>
                    </div>
                  )}
                </header>
                <div className="divide-y">
                  {g.itens.map((r) => {
                    const destino = rota(r.scope_id);
                    return (
                      <div
                        key={r.scope_id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-xs"
                      >
                        <div className="flex min-w-[220px] flex-1 items-center gap-2">
                          {r.ensaio_tipo && <EnsaioTag tipo={r.ensaio_tipo as EnsaioTipo} />}
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {r.amostra_code ?? "—"} · {nomeDoEnsaio(r)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              Rev-{String(r.rev ?? 0).padStart(2, "0")} aprovada em{" "}
                              {fmtDia(r.decided_at)}
                              {r.decided_by_name ? ` por ${r.decided_by_name}` : ""}
                            </div>
                          </div>
                        </div>
                        {r.entrega!.entregue && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Entregue{" "}
                            {fmtDia(r.entrega!.entregueEm)}
                          </span>
                        )}
                        <ChecksDeEntrega
                          scopeId={r.scope_id}
                          descricao={`OS ${g.os} · ${r.amostra_code ?? "—"} · ${nomeDoEnsaio(r)} (Rev-${String(r.rev ?? 0).padStart(2, "0")})`}
                          sond={r.entrega!.sond}
                          gdrive={r.entrega!.gdrive}
                          pedir={pedir}
                          podeMarcar={podeMarcar}
                        />
                        {destino && (
                          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                            <Link
                              to="/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId"
                              params={destino}
                            >
                              Abrir
                            </Link>
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
