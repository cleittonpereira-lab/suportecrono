import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { registerEnsaioDraft } from "@/lib/driveSync.functions";
import { getLabEnsaioSnapshot } from "@/lib/lab-ensaios.functions";
import type { LabEnsaioSnapshot } from "@/lib/lab-ensaios.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { labStore, useAmostra, useEnsaio, useLabSyncStatus, useOS } from "@/features/lab/store";
import { ENSAIO_LABEL, type EnsaioTipo } from "@/features/lab/types";
import { LabEnsaioProvider } from "@/features/lab/context";
import { TriaxialCidPage as TriaxialCidPageInner } from "@/routes/_app.relatorio.triaxial-cid";
import { AdensamentoPage as AdensamentoPageInner } from "@/routes/_app.relatorio.adensamento";
import { CDPage as CDPageInner } from "@/routes/_app.relatorio.cisalhamento-direto";
import { MEspAEnsaioEditor } from "@/features/mesp-natural/editor";

export const Route = createFileRoute(
  "/_app/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId",
)({
  head: () => ({
    meta: [
      { title: "Editor de Ensaio — Suporte INFRA" },
      {
        name: "description",
        content: "Editor técnico para digitação, revisão e emissão de ensaios laboratoriais.",
      },
      { property: "og:title", content: "Editor de Ensaio — Suporte INFRA" },
      {
        property: "og:description",
        content: "Editor técnico para digitação, revisão e emissão de ensaios laboratoriais.",
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

  const registerFn = useServerFn(registerEnsaioDraft);
  const snapshotFn = useServerFn(getLabEnsaioSnapshot);
  const registeredRef = useRef<string | null>(null);
  const restoreRef = useRef<string | null>(null);
  const scopeId = `os/${osId}/amostra/${amostraId}/ensaio/${ensaioId}`;

  useEffect(() => {
    if (os && amostra && ensaio) return;
    if (sync.status !== "salvo" && sync.status !== "erro") return;
    if (restoreRef.current === scopeId) return;
    restoreRef.current = scopeId;
    setRestoring(true);
    setRestoreError(null);
    void snapshotFn({ data: { scopeId } })
      .then((value) => {
        const snapshot = value as LabEnsaioSnapshot | null;
        if (snapshot) {
          labStore.ensureEnsaioFromSnapshot(snapshot);
          return;
        }
        // Auto-heal: cria a estrutura mínima para não travar o usuário
        const state = labStore.get();
        let targetOs = state.os.find((o) => o.id === osId || (o.numero ?? "").trim() === osId.trim());
        if (!targetOs) {
          targetOs = labStore.createOS({ numero: osId, client: "Não informado" });
        }
        let targetAm = targetOs.amostras.find((a) => a.id === amostraId || (a.reportNumber ?? a.code ?? "").trim() === amostraId.trim());
        if (!targetAm) {
          targetAm = labStore.addAmostra(targetOs.id, { reportNumber: amostraId, code: amostraId });
        }
        if (targetAm) {
          let targetEn = targetAm.ensaios.find((e) => e.id === ensaioId || e.tipo === ensaioId);
          if (!targetEn) {
            const tipoFinal: EnsaioTipo = ensaioId.includes("tri")
              ? "triaxial-cid"
              : ensaioId.includes("aden")
                ? "adensamento"
                : ensaioId.includes("mesp")
                  ? "mesp-a"
                  : "cisalhamento-direto";
            labStore.addEnsaio(targetOs.id, targetAm.id, tipoFinal, ENSAIO_LABEL[tipoFinal] || tipoFinal);
          }
        }
      })
      .catch((err: unknown) => {
        setRestoreError(err instanceof Error ? err.message : "Falha ao recuperar o ensaio.");
      })
      .finally(() => setRestoring(false));
  }, [amostra, amostraId, ensaio, ensaioId, os, osId, scopeId, snapshotFn, sync.status]);

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
      // silencioso: não impede o editor de abrir
      registeredRef.current = null;
    });
  }, [os, amostra, ensaio, registerFn]);

  if (!os || !amostra || !ensaio) {
    const waitingForHydration = sync.status === "idle" || sync.status === "carregando" || restoring;
    return (
      <div className="w-full px-6 py-8">
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground space-y-3">
            <span className="inline-flex items-center gap-2 font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Inicializando editor do ensaio…
            </span>
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const state = labStore.get();
                  let o = state.os.find((x) => x.id === osId);
                  if (!o) o = labStore.createOS({ numero: osId, client: "Não informado" });
                  let a = o.amostras.find((x) => x.id === amostraId);
                  if (!a) a = labStore.addAmostra(o.id, { reportNumber: amostraId, code: amostraId });
                  if (a) {
                    let e = a.ensaios.find((x) => x.id === ensaioId);
                    if (!e) labStore.addEnsaio(o.id, a.id, "cisalhamento-direto", "Cisalhamento Direto");
                  }
                }}
              >
                Forçar Inicialização Imediata
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Componentes atuais dos editores; carregamos por tipo.
  // Nota: TriaxialCidPage e AdensamentoPage já são componentes standalone;
  // aqui apenas envelopamos com o provider de contexto para que possam
  // ler identificação/coordenadas/fotos herdadas da amostra.
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
          <span>·</span>
          <span>OS {os.numero}</span>
          <span>·</span>
          <span>Amostra {amostra.reportNumber || "—"}</span>
          <span>·</span>
          <span className="font-medium text-foreground">{ENSAIO_LABEL[ensaio.tipo]}</span>
        </div>
      </div>
      <EditorErrorBoundary>
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
              Recarregar Página
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
  if (norm.includes("mesp") || norm.includes("m.esp")) {
    return MEspAEnsaioEditor as unknown as React.FC;
  }
  return CDPageInner as unknown as React.FC;
}