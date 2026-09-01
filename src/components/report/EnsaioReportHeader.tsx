/**
 * Peças compartilhadas do cabeçalho "padrão" dos editores de relatório —
 * o mesmo visual já usado em Triaxial/Cisalhamento Direto/Adensamento
 * (badges de norma + status, título/descrição, cartão de amostra, barra de
 * responsáveis), extraído aqui pra não continuar sendo copiado à mão em
 * cada novo relatório (o que já tinha gerado pequenas divergências entre
 * eles). Cada página continua controlando seus próprios botões de ação —
 * eles entram como `children`, não como prop configurável.
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { WorkflowFarol } from "@/features/lab/components/WorkflowFarol";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { DraftHistoryButton } from "@/components/DraftActivityInfo";
import { useIsDirty, useIsSavingInFlight } from "@/lib/save-in-flight";
import { SaveNowButton, type DraftFlushResult } from "@/components/report/SaveNowButton";
import { User, FileEdit, ShieldCheck } from "lucide-react";

/** Linha de badges: normas técnicas + status do fluxo + sincronização + histórico. */
export function EnsaioBadgesRow({
  norms,
  status,
  lastSavedAt,
  history,
  onFlushDraft,
}: {
  norms: string[];
  status: string;
  lastSavedAt?: string | null;
  history?: React.ComponentProps<typeof DraftHistoryButton>["history"];
  /** Rascunho compartilhado da feature (ex.: `flushDraft` de `draftStore.ts`) — liga o botão "Salvar". */
  onFlushDraft?: () => Promise<DraftFlushResult | void>;
}) {
  const dirty = useIsDirty();
  const savingInFlight = useIsSavingInFlight();
  const syncState = dirty || savingInFlight ? "saving" : "synced";

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
      {norms.map((n) => (
        <Badge key={n} variant="outline">{n}</Badge>
      ))}
      <WorkflowFarol status={status} />
      <SyncStatusBadge state={syncState} lastSavedAt={lastSavedAt} />
      {history !== undefined && <DraftHistoryButton history={history} />}
      {onFlushDraft && <SaveNowButton onFlushDraft={onFlushDraft} />}
    </div>
  );
}

/** Título + descrição, mesma tipografia em todos os relatórios. */
export function EnsaioTitleBlock({ title, description }: { title: ReactNode; description: ReactNode }) {
  return (
    <>
      <h2 className="mt-2 text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </>
  );
}

/**
 * Cartão de identificação da amostra — mesma moldura (borda/fundo em tom
 * primário, título "Amostra X · OS Y") usada em Triaxial/Cisalhamento/
 * Adensamento. O conteúdo (campos editáveis, resumo somente-leitura, o que
 * fizer sentido pro ensaio) fica livre via `children` — em ensaios de
 * estágio único (Umidade Natural, Densidade Aparente, Módulo de
 * Resiliência) normalmente não há "condição do ensaio" nem corpos de prova
 * como etiquetas, então o cartão fica só com identificação básica.
 */
export function AmostraSummaryCard({
  reportNumber,
  osNumero,
  subtitle,
  onEditClick,
  children,
}: {
  reportNumber?: string;
  osNumero?: string;
  subtitle?: ReactNode;
  onEditClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <Card className="mb-4 border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">
              Amostra {reportNumber || "—"} · OS {osNumero || "—"}
            </CardTitle>
            {subtitle && <CardDescription className="text-xs">{subtitle}</CardDescription>}
          </div>
          {onEditClick && (
            <button
              type="button"
              onClick={onEditClick}
              className="text-xs text-primary hover:underline font-semibold cursor-pointer flex items-center gap-1 shrink-0"
            >
              editar amostra →
            </button>
          )}
        </div>
      </CardHeader>
      {children && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

/** Barra "Operador Bancada / Digitado por / Resp. Técnico", igual em todos os relatórios. */
export function ResponsaveisBar({
  operador,
  digitadoPor,
  respTecnico,
}: {
  operador: ReactNode;
  digitadoPor: ReactNode;
  respTecnico: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card/60 px-4 py-2.5 shadow-xs">
      <div className="flex items-center gap-2">
        <User className="h-4 w-4 text-primary" />
        <span className="text-xs text-muted-foreground font-medium">Operador Bancada:</span>
        <Badge variant="secondary" className="font-semibold text-xs text-foreground px-2 py-0.5">
          {operador}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <FileEdit className="h-4 w-4 text-primary" />
        <span className="text-xs text-muted-foreground font-medium">Digitado por:</span>
        <Badge variant="secondary" className="font-semibold text-xs text-foreground px-2 py-0.5">
          {digitadoPor}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <span className="text-xs text-muted-foreground font-medium">Resp. Técnico:</span>
        <span className="text-xs font-semibold text-foreground">{respTecnico}</span>
      </div>
    </div>
  );
}
