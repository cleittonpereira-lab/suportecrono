/**
 * Reparo da programação (só administrador): mostra o que a planilha antiga
 * tem e o que viria para o app, e aplica. Depois do primeiro reparo, vira o
 * painel do espelho: quando a planilha foi regravada e o botão para regravar.
 * Regras em lib/programacao-reparo.ts.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import {
  diagnosticarProgramacao,
  espelharPlanilhaProgramacao,
  repararProgramacao,
} from "@/lib/programacao.functions";
import type { RelatorioReparo } from "@/lib/programacao-reparo";

const dataHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const CHAVES_DA_PROGRAMACAO = ["amostras", "ensaios", "tipos_ensaio", "tipos_ensaio_min", "programacoes", "programacoes_full", "equipamentos_min"];

export function ReparoProgramacaoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [manterSoNoApp, setManterSoNoApp] = useState(false);

  const diag = useQuery({
    queryKey: ["programacao-diagnostico", manterSoNoApp],
    queryFn: () => diagnosticarProgramacao({ data: { manterSoNoApp } }),
    enabled: open,
    staleTime: 0,
    retry: false,
  });

  const recarregar = () => {
    for (const k of CHAVES_DA_PROGRAMACAO) qc.invalidateQueries({ queryKey: [k] });
    qc.invalidateQueries({ queryKey: ["programacao-diagnostico"] });
  };

  const reparar = useMutation({
    mutationFn: () => repararProgramacao({ data: { manterSoNoApp } }),
    onSuccess: (r) => {
      recarregar();
      if ("erro" in r.espelho) {
        toast.warning(`Dados reparados, mas a planilha não foi regravada: ${r.espelho.erro}`);
      } else {
        toast.success(`Programação reparada. Planilha regravada (${r.espelho.linhas} linhas). Cópia do antes: ${r.copia}`);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha no reparo"),
  });

  const espelhar = useMutation({
    mutationFn: () => espelharPlanilhaProgramacao(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["programacao-diagnostico"] });
      toast.success(`Planilha regravada: ${r.abas} abas, ${r.linhas} linhas.`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao regravar a planilha"),
  });

  const d = diag.data;
  const jaReparado = !!d?.reparo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dados da programação</DialogTitle>
          <DialogDescription>
            O app lê e grava a programação só no próprio banco. A planilha do Google é uma cópia gerada pelo app
            todo dia às 06:00.
          </DialogDescription>
        </DialogHeader>

        {diag.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo a planilha e o banco…
          </p>
        )}
        {diag.error && <p className="text-sm text-destructive">{(diag.error as Error).message}</p>}

        {d && !d.planilhaConfigurada && (
          <p className="text-sm">A planilha não está configurada neste servidor — não há o que recuperar dela.</p>
        )}

        {d?.reparo && (
          <div className="rounded-md border p-3 text-sm space-y-1">
            <p>
              Reparada em <b>{dataHora(d.reparo.em)}</b> por {d.reparo.por}.
            </p>
            <p>
              Planilha regravada pela última vez em <b>{dataHora(d.reparo.ultimoEspelho?.em)}</b>
              {d.reparo.ultimoEspelho ? ` (${d.reparo.ultimoEspelho.linhas} linhas)` : ""}.
            </p>
            {d.reparo.ultimoErroEspelho && (
              <p className="text-destructive">
                Última falha ao regravar ({dataHora(d.reparo.ultimoErroEspelho.em)}): {d.reparo.ultimoErroEspelho.mensagem}
              </p>
            )}
            <Button size="sm" className="mt-2" onClick={() => espelhar.mutate()} disabled={espelhar.isPending}>
              {espelhar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Regravar a planilha agora
            </Button>
          </div>
        )}

        {d?.relatorio && (
          <Relatorio
            relatorio={d.relatorio}
            titulo={jaReparado ? "Conferência (planilha × app)" : "O que o reparo vai fazer"}
          />
        )}

        {d?.relatorio && !jaReparado && (
          <div className="space-y-3 border-t pt-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={manterSoNoApp} onCheckedChange={(v) => setManterSoNoApp(!!v)} className="mt-0.5" />
              <span>
                Manter também as linhas que só existem no app. Elas não apareciam nas telas, que liam a planilha — em
                geral são sobras de gravações que falharam ou de itens apagados. As que ainda estão em uso ficam de
                qualquer jeito.
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              Antes de mudar qualquer coisa, o app guarda uma cópia do banco e da planilha como estão agora.
            </p>
            <Button onClick={() => reparar.mutate()} disabled={reparar.isPending || diag.isFetching}>
              {reparar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aplicar o reparo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Relatorio({ relatorio, titulo }: { relatorio: RelatorioReparo; titulo: string }) {
  const naoReconhecidas = relatorio.abas.flatMap((a) => a.naoReconhecidas.map((n) => ({ aba: a.aba, ...n })));
  const t = relatorio.tipos;
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b text-left">
              <th className="py-1 pr-2">Aba</th>
              <th className="px-2 text-right">Na planilha</th>
              <th className="px-2 text-right">Desentortadas</th>
              <th className="px-2 text-right">Não reconhecidas</th>
              <th className="px-2 text-right">Vêm da planilha</th>
              <th className="px-2 text-right">Só no app</th>
              <th className="px-2 text-right">No app hoje</th>
              <th className="pl-2 text-right">Depois</th>
            </tr>
          </thead>
          <tbody>
            {relatorio.abas.map((a) => (
              <tr key={a.aba} className="border-b last:border-0">
                <td className="py-1 pr-2 font-medium">{a.aba}</td>
                {a.naPlanilhaExiste ? (
                  <>
                    <td className="px-2 text-right">{a.naPlanilha}</td>
                    <td className="px-2 text-right">{a.realinhadas}</td>
                    <td className={`px-2 text-right ${a.naoReconhecidas.length ? "text-destructive font-medium" : ""}`}>
                      {a.naoReconhecidas.length}
                    </td>
                    <td className="px-2 text-right">{a.soNaPlanilha}</td>
                    <td className="px-2 text-right">
                      {a.soNoApp}
                      {a.soNoAppMantidas ? ` (${a.soNoAppMantidas} em uso)` : ""}
                    </td>
                  </>
                ) : (
                  <td colSpan={5} className="px-2 text-muted-foreground">
                    não existe na planilha — fica como está no app
                  </td>
                )}
                <td className="px-2 text-right">{a.noApp}</td>
                <td className="pl-2 text-right font-medium">{a.resultado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-sm space-y-1">
        <p>
          <b>{t.corrigidos.length}</b> ensaio(s) passam ao tipo certo ·{" "}
          <b className={t.semTipo.length ? "text-destructive" : ""}>{t.semTipo.length}</b> sem tipo identificável ·{" "}
          <b>{t.avulsosRemovidos.length}</b> tipo(s) repetido(s) sai(em) da lista
          {relatorio.programacoesSemEnsaio ? ` · ${relatorio.programacoesSemEnsaio} programação(ões) sem ensaio` : ""}
        </p>
        {t.corrigidos.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">Ver os ensaios corrigidos</summary>
            <ul className="mt-1 max-h-48 overflow-y-auto text-xs space-y-0.5">
              {t.corrigidos.map((c) => (
                <li key={c.ensaio}>
                  {c.amostra}: <span className="font-mono">{c.de}</span> → {c.para}
                </li>
              ))}
            </ul>
          </details>
        )}
        {t.semTipo.length > 0 && (
          <details open>
            <summary className="cursor-pointer text-xs text-destructive">
              Ensaios sem tipo identificável (corrija o tipo na Central depois do reparo)
            </summary>
            <ul className="mt-1 max-h-48 overflow-y-auto text-xs space-y-0.5">
              {t.semTipo.map((s) => (
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
            {naoReconhecidas.length} linha(s) da planilha que o reparo não soube ler — ficam de fora, com os valores aqui
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
