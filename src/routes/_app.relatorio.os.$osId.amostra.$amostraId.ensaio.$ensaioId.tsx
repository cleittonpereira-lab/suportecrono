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

  const registerFn = useServerFn(registerEnsaioDraft);
  const snapshotFn = useServerFn(getLabEnsaioSnapshot);
  const registeredRef = useRef<string | null>(null);
  const restoreRef = useRef<string | null>(null);
  const scopeId = `os/${osId}/amostra/${amostraId}/ensaio/${ensaioId}`;

  // Detecta o tipo de ensaio a partir do ensaioId
  function detectTipo(): EnsaioTipo {
    const id = ensaioId.toLowerCase();
    if (id.includes("aden")) return "adensamento";
    if (id.includes("resil") || id.includes("modulo") || id.includes("mr.")) return "modulo-resiliencia";
    if (id.includes("umid")) return "umidade-natural";
    if (id.includes("triaxial-uu") || id.includes("tri.uu") || /\buu\b/.test(id)) return "triaxial-uu";
    if (id.includes("triaxial-ciu") || id.includes("tri.ciu") || /\bciu\b/.test(id)) return "triaxial-ciu";
    if (id.includes("tri") || id.includes("cid")) return "triaxial-cid";
    if (id.includes("mesp")) return "mesp-a";
    if (id.includes("asf") || id.includes("dap")) return "asf-dap";
    if (id.includes("perm")) return "perm-v";
    return "cisalhamento-direto";
  }

  // Auto-heal: cria a estrutura minima usando os IDs da URL para nao bloquear o usuario
  function forceAutoHeal() {
    const s = labStore.get();
    let o = s.os.find((x) => x.id === osId);
    if (!o) o = labStore.createOS({ numero: osId, client: "Nao informado" });
    let a = (o?.amostras ?? []).find((x) => x.id === amostraId);
    if (!a) a = labStore.addAmostra(o!.id, { reportNumber: amostraId, code: amostraId });
    const e = (a?.ensaios ?? []).find((x) => x.id === ensaioId);
    if (!e) {
      const tipo = detectTipo();
      labStore.addEnsaio(o!.id, a!.id, tipo, ENSAIO_LABEL[tipo] || tipo);
    }
  }

  // Restaura a partir do snapshot no Supabase quando os/amostra/ensaio nao estao no store
  useEffect(() => {
    if (os && amostra && ensaio) return;
    if (sync.status !== "salvo" && sync.status !== "erro") return;
    if (restoreRef.current === scopeId) return;
    restoreRef.current = scopeId;
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
        // Snapshot nao encontrado no lab_index - executa auto-heal
        forceAutoHeal();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn("[EnsaioEditor] Falha ao obter snapshot:", err);
        setRestoreError(err instanceof Error ? err.message : "Falha ao recuperar o ensaio.");
        forceAutoHeal();
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amostra, amostraId, ensaio, ensaioId, os, osId, scopeId, snapshotFn, sync.status]);

  // Timeout de seguranca: apenas se a chamada de rede travar completamente (15s)
  useEffect(() => {
    if (os && amostra && ensaio) return;
    const timer = setTimeout(() => {
      if (!os || !amostra || !ensaio) {
        console.warn("[EnsaioEditor] Timeout de carregamento atingido, acionando inicialização segura.");
        setRestoring(false);
        forceAutoHeal();
      }
    }, 15000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os, amostra, ensaio]);

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
            <span className="inline-flex items-center gap-2 font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Inicializando editor do ensaio...
            </span>
            {restoreError && (
              <p className="text-xs text-destructive">{restoreError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Se continuar carregando, clique abaixo para forcar a abertura.
            </p>
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={forceAutoHeal}
              >
                Forcar Inicializacao Imediata
              </Button>
            </div>
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
  if (norm.includes("mesp") || norm.includes("m.esp")) {
    return MEspAEnsaioEditor as unknown as React.FC;
  }
  return CDPageInner as unknown as React.FC;
}