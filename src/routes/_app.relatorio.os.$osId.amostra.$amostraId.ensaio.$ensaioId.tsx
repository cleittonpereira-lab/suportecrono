import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { registerEnsaioDraft } from "@/lib/driveSync.functions";
import { getLabEnsaioSnapshot } from "@/lib/lab-ensaios.functions";
import type { LabEnsaioSnapshot } from "@/lib/lab-ensaios.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { labStore, useAmostra, useEnsaio, useLabSyncStatus, useOS } from "@/features/lab/store";
import { ENSAIO_LABEL, type EnsaioTipo } from "@/features/lab/types";
import { LabEnsaioProvider } from "@/features/lab/context";
import { TriaxialCidPage as TriaxialCidPageInner } from "@/routes/_app.relatorio.triaxial-cid";
import { AdensamentoPage as AdensamentoPageInner } from "@/routes/_app.relatorio.adensamento";
import { CDPage as CDPageInner } from "@/routes/_app.relatorio.cisalhamento-direto";
import { MEspAEnsaioEditor } from "@/features/mesp-natural/editor";
import { MRPage as MRPageInner } from "@/routes/_app.relatorio.modulo-resiliencia";
import { UNPage as UNPageInner } from "@/routes/_app.relatorio.umidade-natural";
import { ASFPage as AsfDapPageInner } from "@/routes/_app.relatorio.asf-dap";
import { PermVPage as PermVPageInner } from "@/routes/_app.relatorio.perm-v";
import { CompressaoSimplesPage as CompressaoSimplesPageInner } from "@/routes/_app.relatorio.compressao-simples";

export const Route = createFileRoute(
  "/_app/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId",
)({
  head: () => ({
    meta: [
      { title: "Editor de Ensaio - Suporte INFRA" },
      {
        name: "description",
        content: "Editor tecnico para digitacao, revisao e emissao de ensaios laboratoriais.",
      },
      { property: "og:title", content: "Editor de Ensaio - Suporte INFRA" },
      {
        property: "og:description",
        content: "Editor tecnico para digitacao, revisao e emissao de ensaios laboratoriais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EnsaioEditor,
});

function EnsaioEditor() {
  const { osId, amostraId, ensaioId } = Route.useParams();
  const os = useOS(osId);
  const amostra = useAmostra(osId, amostraId);
  const ensaio = useEnsaio(osId, amostraId, ensaioId);
  const sync = useLabSyncStatus();
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  const registerFn = useServerFn(registerEnsaioDraft);
  const snapshotFn = useServerFn(getLabEnsaioSnapshot);
  const registeredRef = useRef<string | null>(null);
  const restoreRef = useRef<string | null>(null);
  const scopeId = `os/${osId}/amostra/${amostraId}/ensaio/${ensaioId}`;

  // Havia aqui um "auto-heal" que, quando o ensaio não era achado, criava uma
  // OS + amostra + ensaio NOVOS. Os ids dessas entidades são aleatórios e nunca
  // coincidiam com os da URL, então o editor continuava sem achar nada — e o
  // timer de 15s criava outro trio, indefinidamente, gravando entidades-fantasma
  // no Drive ("Nao informado"). Agora a tela diz o que houve e oferece tentar
  // de novo; nada é criado.
  function tentarDeNovo() {
    restoreRef.current = null;
    setRestoreError(null);
    setNaoEncontrado(false);
    setTentativa((t) => t + 1);
  }

  // Restaura a partir do snapshot no Drive quando os/amostra/ensaio nao estao no store
  useEffect(() => {
    if (os && amostra && ensaio) return;
    if (sync.status !== "salvo" && sync.status !== "erro") return;
    const chave = `${scopeId}#${tentativa}`;
    if (restoreRef.current === chave) return;
    restoreRef.current = chave;
    setRestoring(true);
    setRestoreError(null);

    let cancelled = false;

    void snapshotFn({ data: { scopeId } })
      .then((value) => {
        if (cancelled) return;
        const snapshot = value as LabEnsaioSnapshot | null;
        if (snapshot) {
          labStore.ensureEnsaioFromSnapshot(snapshot);
          return;
        }
        setNaoEncontrado(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn("[EnsaioEditor] Falha ao obter snapshot:", err);
        setRestoreError(err instanceof Error ? err.message : "Falha ao recuperar o ensaio.");
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amostra, amostraId, ensaio, ensaioId, os, osId, scopeId, snapshotFn, sync.status, tentativa]);

  // Se a chamada travar por completo, para de girar e avisa — sem criar nada.
  useEffect(() => {
    if (os && amostra && ensaio) return;
    const timer = setTimeout(() => {
      if (!os || !amostra || !ensaio) {
        setRestoring(false);
        setRestoreError((atual) => atual ?? "O carregamento do ensaio passou de 15 segundos.");
      }
    }, 15000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os, amostra, ensaio, tentativa]);

  // loadLabTree (o carregamento em massa que popula os/amostra/ensaio a
  // partir do labStore) devolve fotos "leves" (sem dataUrl) — o conteúdo
  // de cada foto some intencionalmente da resposta em massa pra não
  // sobrecarregar o Worker (ver comentário em lab-entities.functions.ts).
  // Assim que o ensaio sendo aberto de fato é resolvido, busca o
  // conteúdo completo só dele (leitura O(1), sem varrer pasta) e
  // preenche cada foto pelo id — nunca substitui a lista inteira, então
  // uma foto adicionada localmente enquanto essa busca está em voo (e
  // que ainda não existe no Drive) não é apagada.
  const photosHydratedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!os || !amostra || !ensaio) return;
    const hasPlaceholder = (ensaio.photos ?? []).some((p) => !p.dataUrl && !p.url);
    if (!hasPlaceholder) return;
    const currentScopeId = `os/${os.id}/amostra/${amostra.id}/ensaio/${ensaio.id}`;
    if (photosHydratedForRef.current === currentScopeId) return;
    photosHydratedForRef.current = currentScopeId;
    void snapshotFn({ data: { scopeId: currentScopeId } })
      .then((value) => {
        const snapshot = value as LabEnsaioSnapshot | null;
        for (const fp of snapshot?.ensaio?.photos ?? []) {
          if (fp.dataUrl) {
            labStore.updateEnsaioPhoto(os.id, amostra.id, ensaio.id, fp.id, {
              dataUrl: fp.dataUrl, url: fp.url, bytes: fp.bytes,
            });
          }
        }
      })
      .catch((err) => {
        console.warn("[EnsaioEditor] Falha ao carregar fotos completas:", err);
        photosHydratedForRef.current = null;
      });
  }, [os, amostra, ensaio, snapshotFn]);

  useEffect(() => {
    if (!os || !amostra || !ensaio) return;
    const currentScopeId = `os/${os.id}/amostra/${amostra.id}/ensaio/${ensaio.id}`;
    if (registeredRef.current === currentScopeId) return;
    registeredRef.current = currentScopeId;
    void registerFn({
      data: {
        scopeId: currentScopeId,
        os: { numero: os.numero ?? "", cliente: os.client ?? "" },
        amostra: { code: amostra.reportNumber ?? amostra.code ?? "" },
        ensaio: { tipo: ensaio.tipo, nome: ensaio.label ?? "" },
      },
    }).catch(() => {
      // silencioso: nao impede o editor de abrir
      registeredRef.current = null;
    });
  }, [os, amostra, ensaio, registerFn]);

  if (!os || !amostra || !ensaio) {
    return (
      <div className="w-full px-6 py-8">
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-3">
            {naoEncontrado ? (
              <p className="font-medium text-foreground">Este ensaio não foi encontrado no Drive.</p>
            ) : (
              <span className="inline-flex items-center gap-2 font-medium">
                {(restoring || !restoreError) && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                {restoreError ? "Não foi possível carregar o ensaio." : "Carregando o ensaio..."}
              </span>
            )}
            {restoreError && (
              <p className="text-xs text-destructive">{restoreError}</p>
            )}
            {(restoreError || naoEncontrado) && (
              <div>
                <Button size="sm" variant="outline" onClick={tentarDeNovo} disabled={restoring}>
                  Tentar de novo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const Editor = pickEditor(ensaio.tipo);

  return (
    <LabEnsaioProvider
      value={{
        os,
        amostra,
        ensaio,
        photos: ensaio.photos ?? [],
        coords: amostra.coords,
        onPayloadChange: (payload) => {
          const currentStatus = ensaio.status;
          const nextStatus = (currentStatus as string) === "pendente_digitacao" || (currentStatus as string) === "agendado" ? "em_digitacao" : currentStatus;
          labStore.patchEnsaio(os.id, amostra.id, ensaio.id, { payload, status: nextStatus });
        },
        addPhoto: (p) => labStore.addEnsaioPhoto(os.id, amostra.id, ensaio.id, p),
        removePhoto: (id) => labStore.removeEnsaioPhoto(os.id, amostra.id, ensaio.id, id),
        updatePhoto: (id, patch) => labStore.updateEnsaioPhoto(os.id, amostra.id, ensaio.id, id, patch),
      }}
    >
      <div className="border-b border-border bg-muted/30 px-6 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <Button variant="ghost" size="sm" asChild className="-ml-2 h-7">
            <Link to="/relatorio/os/$osId/amostra/$amostraId" params={{ osId: os.id, amostraId: amostra.id }} search={{}}>
              <ArrowLeft className="mr-1 h-3 w-3" />
              Amostra
            </Link>
          </Button>
          <span>.</span>
          <span>OS {os.numero}</span>
          <span>.</span>
          <span>Amostra {amostra.reportNumber || "-"}</span>
          <span>.</span>
          <span className="font-medium text-foreground">{ENSAIO_LABEL[ensaio.tipo]}</span>
        </div>
      </div>
      <EditorErrorBoundary key={ensaio.id}>
        <Editor />
      </EditorErrorBoundary>
    </LabEnsaioProvider>
  );
}

import React, { Component, type ErrorInfo, type ReactNode } from "react";

class EditorErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[EditorErrorBoundary] Erro no editor:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-xl mx-auto my-12 text-center bg-card border rounded-xl shadow-xs space-y-4">
          <div className="text-destructive font-bold text-base">Erro ao renderizar o editor do ensaio</div>
          <p className="text-xs text-muted-foreground">
            {this.state.error?.message || "Ocorreu um erro inesperado ao carregar os dados deste ensaio."}
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button size="sm" onClick={() => window.location.reload()}>
              Recarregar Pagina
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.history.back()}>
              Voltar
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function pickEditor(tipo: string): React.FC {
  const norm = (tipo || "").toLowerCase();
  if (norm.includes("tri") || norm.includes("tx")) {
    return TriaxialCidPageInner as unknown as React.FC;
  }
  if (norm.includes("aden") || norm.includes("oed")) {
    return AdensamentoPageInner as unknown as React.FC;
  }
  if (norm.includes("resiliencia") || norm.includes("resiliência") || norm.includes("modulo-resiliencia")) {
    return MRPageInner as unknown as React.FC;
  }
  if (norm.includes("umidade-natural")) {
    return UNPageInner as unknown as React.FC;
  }
  if (norm.includes("asf") || norm.includes("dap")) {
    return AsfDapPageInner as unknown as React.FC;
  }
  if (norm.includes("perm")) {
    return PermVPageInner as unknown as React.FC;
  }
  if (norm.includes("compressao") || norm.includes("compressão") || norm.includes("comp.")) {
    return CompressaoSimplesPageInner as unknown as React.FC;
  }
  if (norm.includes("mesp") || norm.includes("m.esp")) {
    return MEspAEnsaioEditor as unknown as React.FC;
  }
  return CDPageInner as unknown as React.FC;
}