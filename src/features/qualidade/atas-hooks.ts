/**
 * Consultas e gravações das atas. As edições são OTIMISTAS: a tela muda na
 * hora aplicando a mesma função pura que o servidor roda (aplicarOperacao), e
 * o servidor confirma. Várias edições seguidas não se atropelam: só relê do
 * servidor quando a última termina (a resposta de uma edição velha nunca
 * sobrescreve o que a pessoa acabou de digitar).
 */
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  excluirReuniao,
  listarPessoasDaQualidade,
  listarReunioes,
  operarReuniao,
  trazerPendencias,
} from "@/lib/atas-qualidade.functions";
import { aplicarOperacao, type OperacaoAta, type Reuniao } from "@/lib/atas-qualidade";
import { useAuth } from "@/hooks/use-auth";

export const CHAVE_ATAS = ["qualidade-atas"] as const;
const CHAVE_OPERACAO = ["qualidade-atas-operar"] as const;

export function useReunioes() {
  const fn = useServerFn(listarReunioes);
  return useQuery({ queryKey: CHAVE_ATAS, queryFn: () => fn() as Promise<Reuniao[]>, staleTime: 15_000 });
}

export function usePessoas() {
  const fn = useServerFn(listarPessoasDaQualidade);
  return useQuery({ queryKey: ["qualidade-pessoas"], queryFn: () => fn(), staleTime: 5 * 60_000 });
}

/** Grava operações numa reunião (qualquer uma, não só a aberta). */
export function useOperarReuniao() {
  const qc = useQueryClient();
  const fn = useServerFn(operarReuniao);
  const { displayName } = useAuth();

  const mut = useMutation({
    mutationKey: CHAVE_OPERACAO,
    mutationFn: (v: { reuniaoId: string; ops: OperacaoAta[] }) => fn({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: CHAVE_ATAS });
      const agora = new Date().toISOString();
      qc.setQueryData<Reuniao[]>(CHAVE_ATAS, (lista) =>
        lista?.map((r) => (r.id === v.reuniaoId ? v.ops.reduce((acc, o) => aplicarOperacao(acc, o, displayName, agora), r) : r)),
      );
    },
    onError: (e: Error) => toast.error(`Não salvou: ${e.message}`),
    onSettled: () => {
      // isMutating inclui esta própria; só relê quando for a última em andamento.
      if (qc.isMutating({ mutationKey: CHAVE_OPERACAO }) <= 1) void qc.invalidateQueries({ queryKey: CHAVE_ATAS });
    },
  });

  return useCallback(
    (reuniaoId: string, ...ops: OperacaoAta[]) => mut.mutate({ reuniaoId, ops }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mut.mutate],
  );
}

export function useTrazerPendencias() {
  const qc = useQueryClient();
  const fn = useServerFn(trazerPendencias);
  return useMutation({
    mutationFn: (v: { deReuniaoId: string; paraReuniaoId: string; itemIds: string[] }) => fn({ data: v }),
    onSuccess: (r) => {
      toast.success(r.trazidos === 1 ? "1 pendência trazida para esta reunião" : `${r.trazidos} pendências trazidas para esta reunião`);
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => void qc.invalidateQueries({ queryKey: CHAVE_ATAS }),
  });
}

export function useExcluirReuniao() {
  const qc = useQueryClient();
  const fn = useServerFn(excluirReuniao);
  return useMutation({
    mutationFn: (reuniaoId: string) => fn({ data: { reuniaoId } }),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => void qc.invalidateQueries({ queryKey: CHAVE_ATAS }),
  });
}
