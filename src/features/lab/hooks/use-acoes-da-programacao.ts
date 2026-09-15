/**
 * Iniciar e concluir uma programação pela bancada — o mesmo comportamento no
 * Leitor QR (programacao/scan) e na fila do técnico (digitalizacao/fila):
 * grava o tempo real, reagenda os seguintes em cascata (como o Gantt) e cria a
 * pendência de digitação (M.ESP.A ao iniciar; os demais ao concluir, com
 * atalho para a Digitalização).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { updateRow } from "@/lib/programacao.functions";
import { criarPendenciaDigitacao } from "@/lib/lab-pendencias.functions";
import { SHEET_PROGS, type Programacao } from "@/lib/programacao-model";
import { recalculateDownstream } from "@/lib/programacao-cascade";
import { endIsoFromDur } from "@/lib/business-days";

export const isMespATipo = (nome: string) => /m\.?\s*esp\.?\s*a|massa\s+espec[ií]fica\s+aparente/i.test(nome);
export const isAdensamentoTipo = (nome: string) => /adensamento|edométric|^aden\b/i.test(nome);

/** Hoje em "AAAA-MM-DD", no fuso do aparelho. */
export function isoHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** O que a pendência de digitação precisa saber do ensaio. */
export type ContextoDoEnsaio = { os: string; amostra: string | null; tipoNome: string };

export function useAcoesDaProgramacao(progs: Programacao[]) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const recarregar = () => {
    for (const k of ["programacoes", "programacoes_full", "fila-tecnico"]) qc.invalidateQueries({ queryKey: [k] });
  };

  const salvar = useMutation({
    mutationFn: (p: { id: string; row: Record<string, unknown> }) =>
      updateRow({ data: { sheet: SHEET_PROGS, id: p.id, patch: p.row } }),
    onSuccess: recarregar,
  });

  // Mesma cascata de reagendamento do Gantt: terminar antes puxa o próximo, depois atrasa.
  const runCascade = async (anchorProgId: string, anchorFinishIso: string) => {
    const { shifted } = await recalculateDownstream(anchorProgId, anchorFinishIso, progs, async (id, patch) => {
      await updateRow({ data: { sheet: SHEET_PROGS, id, patch } });
    });
    if (shifted > 0) {
      toast.info(`${shifted} ensaio(s) reagendado(s) automaticamente`);
      recarregar();
    }
  };

  /** `tecnico`: quem está iniciando — gravado só se a programação ainda não tem executor. */
  function iniciar(prog: Programacao, ctx: ContextoDoEnsaio, tecnico?: string | null) {
    const hoje = isoHoje();
    const novoFim = endIsoFromDur(hoje, prog.duracao_dias || 1, prog.incluir_fds);
    salvar.mutate(
      {
        id: prog.id,
        row: {
          data_inicio_real: hoje,
          inicio_real_ts: new Date().toISOString(),
          status: "em_execucao",
          progresso: 10,
          data_inicio: hoje,
          data_fim: novoFim,
          ...(tecnico && !prog.tecnico ? { tecnico } : {}),
        },
      },
      {
        onSuccess: async () => {
          toast.success("Ensaio iniciado");
          await runCascade(prog.id, novoFim);
          // Ponte → Relatório: M.ESP.A já vira pendência ao iniciar.
          if (isMespATipo(ctx.tipoNome)) {
            try {
              await criarPendenciaDigitacao({
                data: {
                  os: ctx.os,
                  amostra: ctx.amostra,
                  ensaio: ctx.tipoNome,
                  tipo_ensaio: ctx.tipoNome,
                  equipamento: null,
                  programacao_id: prog.id ?? null,
                  operador_nome: prog.tecnico || tecnico || null,
                },
              });
            } catch {
              /* não bloqueia o início se a ponte falhar */
            }
          }
        },
        onError: (e: any) => toast.error(e?.message || "Falha ao iniciar"),
      },
    );
  }

  function concluir(prog: Programacao, ctx: ContextoDoEnsaio) {
    const hoje = isoHoje();
    salvar.mutate(
      {
        id: prog.id,
        row: {
          data_fim_real: hoje,
          fim_real_ts: new Date().toISOString(),
          status: "concluido",
          progresso: 100,
          data_fim: hoje,
        },
      },
      {
        onSuccess: async () => {
          toast.success("Ensaio concluído");
          await runCascade(prog.id, hoje);
          // Ponte → Relatório (pendente de digitação). M.ESP.A já tem a sua,
          // criada ao iniciar — não duplica, igual ao Gantt.
          if (isMespATipo(ctx.tipoNome)) return;
          try {
            const pend = await criarPendenciaDigitacao({
              data: {
                os: ctx.os,
                amostra: ctx.amostra,
                ensaio: ctx.tipoNome,
                tipo_ensaio: ctx.tipoNome,
                equipamento: null,
                programacao_id: prog.id ?? null,
                operador_nome: prog.tecnico ?? null,
              },
            });
            // Depois de concluir na bancada, oferece ir direto para a digitação do mesmo ensaio.
            const isAdens = isAdensamentoTipo(ctx.tipoNome);
            toast.info("Pronto para digitalização de campo", {
              action: {
                label: "Ir para Digitalização",
                onClick: () =>
                  navigate(
                    isAdens
                      ? { to: "/relatorio/digitalizacao/adensamento", search: { pid: pend.id } }
                      : { to: "/relatorio/digitalizacao" },
                  ),
              },
            });
          } catch {
            /* não bloqueia a conclusão se a ponte falhar */
          }
        },
        onError: (e: any) => toast.error(e?.message || "Falha ao concluir"),
      },
    );
  }

  return { iniciar, concluir, salvando: salvar.isPending };
}
