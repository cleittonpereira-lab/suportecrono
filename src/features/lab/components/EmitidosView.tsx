/**
 * "Todos os laudos emitidos" — todo laudo com revisão aprovada vigente, do
 * mais recente para o mais antigo, com a situação da entrega (SOND/GDrive),
 * o PDF oficial e o atalho para abrir o laudo.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Eye, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EnsaioTag } from "@/features/lab/components/EnsaioTag";
import { ENSAIO_LABEL, type EnsaioTipo } from "@/features/lab/types";
import type { EmissaoRow } from "@/lib/emissoes.functions";
import { completarPdfDaRevisao } from "@/lib/approvals-com-pdf";
import { useLaudosNoFluxo } from "@/features/lab/hooks/use-laudos-no-fluxo";
import { familiaDoEnsaio, type Familia } from "@/lib/familia-ensaio";
import { cn } from "@/lib/utils";

type Periodo = "30" | "90" | "365" | "todos";
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

export function EmitidosView({ familia }: { familia: Familia | "all" }) {
  const { data: rows, isLoading } = useLaudosNoFluxo();
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("90");
  const [pdf, setPdf] = useState<{ url: string; titulo: string } | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const agora = Date.now();
    return (rows ?? [])
      .filter((r) => r.entrega != null)
      .filter((r) => familia === "all" || familiaDoEnsaio(r.ensaio_tipo, r.ensaio_nome) === familia)
      .filter(
        (r) =>
          periodo === "todos" ||
          !r.decided_at ||
          agora - Date.parse(r.decided_at) <= Number(periodo) * DIA,
      )
      .filter(
        (r) =>
          !termo ||
          [
            r.os_numero,
            r.os_cliente,
            r.amostra_code,
            r.amostra_numero,
            nomeDoEnsaio(r),
            r.decided_by_name,
          ]
            .filter(Boolean)
            .some((t) => String(t).toLowerCase().includes(termo)),
      )
      .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
  }, [rows, busca, periodo, familia]);

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="OS, cliente, amostra, ensaio, aprovador…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex rounded-md border p-0.5">
          {(
            [
              ["30", "30 dias"],
              ["90", "90 dias"],
              ["365", "12 meses"],
              ["todos", "Todos"],
            ] as [Periodo, string][]
          ).map(([v, r]) => (
            <Button
              key={v}
              size="sm"
              variant={periodo === v ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setPeriodo(v)}
            >
              {r}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{lista.length} laudo(s)</span>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-24">Aprovado</TableHead>
              <TableHead>OS / Cliente</TableHead>
              <TableHead>Amostra · Ensaio</TableHead>
              <TableHead className="w-16 text-center">Rev</TableHead>
              <TableHead className="w-40">Aprovado por</TableHead>
              <TableHead className="w-40 text-center">Entrega</TableHead>
              <TableHead className="w-36 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : lista.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum laudo emitido para os filtros escolhidos.
                </TableCell>
              </TableRow>
            ) : (
              lista.map((r) => {
                const destino = rota(r.scope_id);
                const e = r.entrega!;
                return (
                  <TableRow key={r.scope_id}>
                    <TableCell className="text-xs tabular-nums">{fmtDia(r.decided_at)}</TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold">OS {r.os_numero ?? "—"}</div>
                      <div
                        className="max-w-[220px] truncate text-[11px] text-muted-foreground"
                        title={r.os_cliente ?? ""}
                      >
                        {r.os_cliente ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs">
                        {r.ensaio_tipo && <EnsaioTag tipo={r.ensaio_tipo as EnsaioTipo} />}
                        <span className="font-medium">
                          {r.amostra_numero || r.amostra_code || "—"}
                        </span>
                        <span className="truncate text-muted-foreground">· {nomeDoEnsaio(r)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs">
                      {String(r.rev ?? 0).padStart(2, "0")}
                    </TableCell>
                    <TableCell className="text-xs">{r.decided_by_name ?? "—"}</TableCell>
                    <TableCell className="text-center">
                      {e.entregue ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Entregue {fmtDia(e.entregueEm)}
                        </span>
                      ) : (
                        <div className="flex justify-center gap-1 text-[10px] font-semibold">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5",
                              e.sond
                                ? "bg-emerald-500/15 text-emerald-700"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            SOND {e.sond ? "✓" : "—"}
                          </span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5",
                              e.gdrive
                                ? "bg-emerald-500/15 text-emerald-700"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            GDrive {e.gdrive ? "✓" : "—"}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs"
                          disabled={abrindo === r.scope_id}
                          onClick={() => void verPdf(r)}
                        >
                          <Eye className="h-3.5 w-3.5" /> {abrindo === r.scope_id ? "…" : "PDF"}
                        </Button>
                        {destino && (
                          <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                            <Link
                              to="/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId"
                              params={destino}
                            >
                              Abrir
                            </Link>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

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
              Cópia oficial do Drive, com as assinaturas.
            </DialogDescription>
          </DialogHeader>
          {pdf && <iframe src={pdf.url} title="Laudo em PDF" className="w-full flex-1 border-0" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
