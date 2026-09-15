/**
 * Arrumar a planilha da programação (só administrador): mostra quantas linhas
 * estão tortas, os tipos de ensaio a corrigir e o que não foi reconhecido, e
 * endireita a planilha. As telas já leem certo mesmo antes — isto deixa a
 * planilha certa também para quem a abre no Google. Regras em
 * lib/programacao-reparo.ts.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { arrumarPlanilhaProgramacao, diagnosticarProgramacao } from "@/lib/programacao.functions";
import type { RelatorioAba, RelatorioTipos } from "@/lib/programacao-reparo";

const dataHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const CHAVES_DA_PROGRAMACAO = ["amostras", "ensaios", "tipos_ensaio", "tipos_ensaio_min", "programacoes", "programacoes_full", "equipamentos_min"];

export function ReparoProgramacaoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();

  const diag = useQuery({
    queryKey: ["programacao-diagnostico"],
    queryFn: () => diagnosticarProgramacao(),
    enabled: open,
    staleTime: 0,
    retry: false,
  });

  const arrumar = useMutation({
    mutationFn: () => arrumarPlanilhaProgramacao(),
    onSuccess: (r) => {
      for (const k of CHAVES_DA_PROGRAMACAO) qc.invalidateQueries({ queryKey: [k] });
      qc.invalidateQueries({ queryKey: ["programacao-diagnostico"] });
      toast.success(
        r.abas.length
          ? `Planilha arrumada (${r.abas.join(", ")}). Cópia do antes: ${r.copia}`
          : "A planilha já estava arrumada — nada foi regravado.",
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao arrumar a planilha"),
  });

  const d = diag.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Planilha da programação</DialogTitle>
          <DialogDescription>
            A programação vem da planilha do Google. Linhas gravadas com as colunas trocadas já aparecem certas nas
            telas; arrumar a planilha as endireita de vez, no mesmo lugar, e passa os ensaios ao tipo certo.
          </DialogDescription>
        </DialogHeader>

        {diag.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo a planilha…
          </p>
        )}
        {diag.error && <p className="text-sm text-destructive">{(diag.error as Error).message}</p>}

        {d && !d.planilhaConfigurada && (
          <p className="text-sm">A planilha não está configurada neste servidor — a programação fica na cópia do app.</p>
        )}

        {d?.ultimaArrumacao && (
          <p className="text-sm text-muted-foreground">
            Última arrumação em {dataHora(d.ultimaArrumacao.em)} por {d.ultimaArrumacao.por} (
            {d.ultimaArrumacao.abas.join(", ")}). Cópia do antes: {d.ultimaArrumacao.copia}
          </p>
        )}

        {d?.planilhaConfigurada && d.tipos && (
          <>
            <Relatorio relatorio={d.relatorio} tipos={d.tipos} />
            <div className="space-y-2 border-t pt-3">
              {d.abasParaArrumar.length ? (
                <p className="text-sm">
                  Abas que serão regravadas: <b>{d.abasParaArrumar.join(", ")}</b>. Nenhuma linha some: as que não
                  foram reconhecidas ficam como estão. Antes, o app guarda uma cópia da planilha como está agora.
                </p>
              ) : (
                <p className="text-sm">A planilha já está arrumada.</p>
              )}
              <Button
                onClick={() => arrumar.mutate()}
                disabled={arrumar.isPending || diag.isFetching || d.abasParaArrumar.length === 0}
              >
                {arrumar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Arrumar a planilha
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Relatorio({ relatorio, tipos }: { relatorio: RelatorioAba[]; tipos: RelatorioTipos }) {
  const naoReconhecidas = relatorio.flatMap((a) => a.naoReconhecidas.map((n) => ({ aba: a.aba, ...n })));
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Aba</th>
              <th className="px-2 text-right">Linhas</th>
              <th className="px-2 text-right">No lugar</th>
              <th className="px-2 text-right">Tortas</th>
              <th className="px-2 text-right">Id repetido</th>
              <th className="pl-2 text-right">Não reconhecidas</th>
            </tr>
          </thead>
          <tbody>
            {relatorio.map((a) => (
              <tr key={a.aba} className="border-b last:border-0">
                <td className="py-1 pr-2 font-medium">{a.aba}</td>
                {a.temCabecalho ? (
                  <>
                    <td className="px-2 text-right">{a.naPlanilha}</td>
                    <td className="px-2 text-right">{a.alinhadas}</td>
                    <td className={`px-2 text-right ${a.realinhadas ? "font-medium" : ""}`}>{a.realinhadas}</td>
                    <td className="px-2 text-right">{a.repetidas}</td>
                    <td className={`pl-2 text-right ${a.naoReconhecidas.length ? "text-destructive font-medium" : ""}`}>
                      {a.naoReconhecidas.length}
                    </td>
                  </>
                ) : (
                  <td colSpan={5} className="px-2 text-muted-foreground">
                    sem cabeçalho com "id" — lida da cópia do app, não é mexida
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-sm space-y-1">
        <p>
          <b>{tipos.corrigidos.length}</b> ensaio(s) passam ao tipo certo ·{" "}
          <b className={tipos.semTipo.length ? "text-destructive" : ""}>{tipos.semTipo.length}</b> sem tipo identificável
        </p>
        {tipos.corrigidos.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">Ver os ensaios corrigidos</summary>
            <ul className="mt-1 max-h-48 overflow-y-auto text-xs space-y-0.5">
              {tipos.corrigidos.map((c) => (
                <li key={c.ensaio}>
                  {c.amostra}: <span className="font-mono">{c.de}</span> → {c.para}
                </li>
              ))}
            </ul>
          </details>
        )}
        {tipos.semTipo.length > 0 && (
          <details open>
            <summary className="cursor-pointer text-xs text-destructive">
              Ensaios sem tipo identificável (corrija o tipo na Central)
            </summary>
            <ul className="mt-1 max-h-48 overflow-y-auto text-xs space-y-0.5">
              {tipos.semTipo.map((s) => (
                <li key={s.ensaio}>
                  {s.amostra}: <span className="font-mono">{s.valor || "(vazio)"}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {naoReconhecidas.length > 0 && (
        <details open>
          <summary className="cursor-pointer text-sm text-destructive">
            {naoReconhecidas.length} linha(s) que o app não soube ler — não aparecem nas telas e ficam como estão
          </summary>
          <ul className="mt-1 max-h-56 overflow-y-auto text-xs font-mono space-y-0.5">
            {naoReconhecidas.map((n) => (
              <li key={`${n.aba}-${n.linha}`}>
                {n.aba}, linha {n.linha}: {n.valores.join(" | ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
