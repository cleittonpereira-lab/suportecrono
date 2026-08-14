import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { MEspAWorkspace, PendenciasCard, type Identificacao } from "@/features/mesp-natural/ui";
import type { DeterminacaoInput } from "@/features/mesp-natural/calc";
import {
  listPendenciasDigitacao,
  type PendenciaDigitacao,
} from "@/lib/lab-pendencias.functions";
import { listRows } from "@/lib/programacao.functions";
import { FlaskConical, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const search = z.object({ pendencia: z.string().optional() });

export const Route = createFileRoute("/_app/relatorio/mesp-a")({
  ssr: false,
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Relatório · M.ESP.A — Suporte INFRA" },
      {
        name: "description",
        content: "Processamento e emissão do relatório de Massa Específica Aparente Natural (NBR 16867:2020).",
      },
    ],
  }),
  component: MEspARelatorioPage,
});

function norm(s: string) {
  return (s ?? "").trim().toLowerCase();
}

function MEspARelatorioPage() {
  const { pendencia: pendenciaId } = Route.useSearch();
  const [initial, setInitial] = useState<{ dets: DeterminacaoInput[]; obs: string } | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader
        icon={FlaskConical}
        eyebrow="Relatório · Laboratório"
        title="M.ESP.A — Massa Específica Aparente Natural"
        description="Processamento, planilha e emissão do laudo (NBR 16867:2020). A digitalização apenas recebe dados; o relatório vive aqui."
      />
      <MEspAWorkspace
        initialData={initial}
        source={(onIdentified) =>
          pendenciaId ? (
            <PendenciaAutoLoad
              pendenciaId={pendenciaId}
              onIdentified={(id, pid, data) => {
                setInitial(data);
                onIdentified(id, pid);
              }}
            />
          ) : (
            <PendenciasCard onPick={(p, id) => onIdentified(id, p.id)} />
          )
        }
      />
    </div>
  );
}

/**
 * Quando a página é aberta com ?pendencia=<id> (ex.: navegação vinda de
 * "Digitação & Emissões · Iniciar digitação"), monta o Identificacao a
 * partir dos dados da pendência + amostras e chama onIdentified para
 * abrir o formulário direto.
 */
function PendenciaAutoLoad({
  pendenciaId,
  onIdentified,
}: {
  pendenciaId: string;
  onIdentified: (
    id: Identificacao,
    pendenciaId: string | null,
    initial: { dets: DeterminacaoInput[]; obs: string } | null,
  ) => void;
}) {
  const listFn = useServerFn(listPendenciasDigitacao);
  const { data: pendencias = [], isLoading } = useQuery({
    queryKey: ["lab_pendencias_digit_mespa_route"],
    queryFn: () => listFn(),
  });
  const { data: amostras = [] } = useQuery({
    queryKey: ["digit_amostras_mespa_route"],
    queryFn: async () =>
      (await listRows({ data: { sheet: "Amostras" } })).map((r) => ({
        os_numero: r.os_numero ?? "",
        codigo_amostra: r.codigo_amostra || "",
        descricao: r.descricao || "",
        tomador: r.tomador || "",
        obra: r.obra || "",
      })),
  });

  const pend = useMemo(
    () => (pendencias as PendenciaDigitacao[]).find((p) => p.id === pendenciaId) ?? null,
    [pendencias, pendenciaId],
  );

  useEffect(() => {
    if (!pend) return;
    const a = amostras.find(
      (x) => norm(x.codigo_amostra) === norm(pend.amostra ?? "") && norm(x.os_numero) === norm(pend.os),
    );
    const id: Identificacao = {
      os: pend.os,
      amostraCodigo: pend.amostra ?? "",
      amostraDescricao: a?.descricao ?? "",
      tomador: a?.tomador ?? "",
      obra: a?.obra ?? "",
      tipoEnsaioNome: pend.tipo_ensaio ?? pend.ensaio,
      tipoEnsaioCodigo: pend.ensaio,
    };
    // Se a pendência veio da Digitalização com dados brutos, entrega para
    // o Workspace pré-preencher o formulário.
    const p = pend.payload as { dets?: DeterminacaoInput[]; obs?: string } | null;
    const initial =
      p && Array.isArray(p.dets) && p.dets.length
        ? { dets: p.dets, obs: p.obs ?? "" }
        : null;
    onIdentified(id, pend.id, initial);
    // hydrate uma única vez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pend?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando pendência…
      </div>
    );
  }
  if (!pend) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Pendência não encontrada</AlertTitle>
        <AlertDescription>
          A pendência #{pendenciaId} não está mais disponível. Volte a "Digitação & Emissões" e escolha outro ensaio.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}