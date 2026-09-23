/**
 * Dados do laudo travados fora da digitação — o mesmo em todos os editores.
 *
 * Enquanto o laudo está aguardando verificação, aguardando aprovação ou
 * aprovado, os campos não mudam: o que o verificador confere é o que está no
 * PDF. Antes qualquer um alterava os dados no meio da verificação e o PDF do
 * Drive ficava diferente da tela até alguém lembrar de clicar em "Atualizar".
 *
 *  - Verificador/aprovador pode "Destravar para corrigir" enquanto confere;
 *    ao verificar/aprovar, o PDF é refeito com as correções
 *    (useRegerarPdfNoFluxo).
 *  - Laudo aprovado só muda por "Gerar nova revisão".
 *  - Devolvido pelo verificador: mostra o motivo em destaque.
 *
 * Navegar entre abas, abrir seções e ver/baixar continua livre. Um botão que
 * não altera dados pode ser liberado com `data-livre`.
 */
import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { Lock, LockOpen, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { podeVerificar } from "@/lib/papeis";
import type { StatusDoEditor } from "@/lib/status-do-editor";

type Aprovacao = { rev: number; status?: string | null; verification_comment?: string | null; verified_by_name?: string | null };

const LIVRE = '[role="tab"], [data-livre], a[href], button[aria-expanded]:not([aria-haspopup]):not([role="combobox"])';
const CONTROLE =
  'button, input, select, textarea, label, [role="checkbox"], [role="combobox"], [role="switch"], [role="slider"], [role="radio"], [contenteditable="true"]';
const TEXTO = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]), textarea';
/** Teclas que não mudam o conteúdo de um campo de texto. */
const TECLAS_LIVRES = new Set(["Tab", "ArrowLeft", "ArrowRight", "Home", "End", "Shift", "Control", "Meta", "Alt", "Escape"]);

const rotuloRev = (rev: number) => `Rev-${String(rev).padStart(2, "0")}`;

export function DadosTravados({
  fluxo,
  approvals,
  children,
}: {
  fluxo: StatusDoEditor;
  approvals: readonly Aprovacao[];
  children: ReactNode;
}) {
  const { role, profile } = useAuth();
  const podeDestravar = podeVerificar({ role, labRole: profile?.labRole }) && !fluxo.isAprovado;
  const [destravado, setDestravado] = useState(false);
  // Mudou de etapa (verificou, aprovou, devolveu): trava de novo.
  useEffect(() => setDestravado(false), [fluxo.rawSt, fluxo.rev]);
  const ativo = fluxo.travado && !destravado;

  const ultimoAviso = useRef(0);
  const avisar = () => {
    if (Date.now() - ultimoAviso.current < 2500) return;
    ultimoAviso.current = Date.now();
    toast.info(
      fluxo.isAprovado
        ? "Laudo aprovado: os dados estão travados. Para alterar, use \"Gerar nova revisão\"."
        : podeDestravar
          ? "Dados travados durante o fluxo. Use \"Destravar para corrigir\" no aviso acima."
          : "Dados travados: o laudo está com o verificador. Se precisar corrigir, peça para ele devolver.",
    );
  };
  const alvo = (e: SyntheticEvent) => (e.target instanceof Element ? e.target : null);
  const bloquear = (e: SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    avisar();
  };
  /** Clique/toque em controle que altera dado. Campo de texto pode receber foco (selecionar, copiar). */
  const aoApontar = (e: SyntheticEvent) => {
    if (!ativo) return;
    const t = alvo(e);
    if (!t || t.closest(LIVRE) || !t.closest(CONTROLE) || t.closest(TEXTO)) return;
    bloquear(e);
  };
  const aoEditar = (e: SyntheticEvent) => {
    if (!ativo) return;
    const t = alvo(e);
    if (t?.closest(LIVRE)) return;
    bloquear(e);
  };
  const aoTeclar = (e: React.KeyboardEvent) => {
    if (!ativo) return;
    const t = alvo(e);
    if (!t || t.closest(LIVRE)) return;
    if (TECLAS_LIVRES.has(e.key) || ((e.ctrlKey || e.metaKey) && ["c", "a"].includes(e.key.toLowerCase()))) return;
    if (t.closest(TEXTO) || ((e.key === "Enter" || e.key === " ") && t.closest(CONTROLE))) bloquear(e);
  };

  const ultima = approvals.length > 0 ? approvals.reduce((a, b) => (b.rev > a.rev ? b : a)) : null;

  return (
    <div className="space-y-4">
      {fluxo.devolvida && (
        <div className="flex items-start gap-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm">
          <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div>
            <div className="font-semibold text-rose-800 dark:text-rose-300">
              {rotuloRev(fluxo.rev)} devolvida para correção{ultima?.verified_by_name ? ` por ${ultima.verified_by_name}` : ""}
            </div>
            {ultima?.verification_comment && (
              <div className="mt-0.5 text-rose-900/90 dark:text-rose-200/90">“{ultima.verification_comment}”</div>
            )}
            <div className="mt-1 text-xs text-muted-foreground">
              Corrija os dados e clique em "Enviar para verificação". A mesma {rotuloRev(fluxo.rev)} é refeita — não abre
              outra revisão.
            </div>
          </div>
        </div>
      )}
      {fluxo.reaberta && (
        <div className="rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
          <b>{rotuloRev(fluxo.rev)} aberta para correção.</b> Altere o que for preciso e clique em "Enviar para
          verificação" — ela passa por verificação e aprovação como a primeira.
        </div>
      )}
      {fluxo.travado && (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-md border px-4 py-2.5 text-sm ${
            ativo
              ? "border-slate-400/50 bg-slate-500/10 text-slate-800 dark:text-slate-200"
              : "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          }`}
        >
          {ativo ? <Lock className="h-4 w-4 shrink-0" /> : <LockOpen className="h-4 w-4 shrink-0" />}
          <div className="flex-1 min-w-[240px]">
            {ativo ? (
              fluxo.isAprovado ? (
                <>
                  <b>Laudo aprovado ({rotuloRev(fluxo.rev)}) — dados travados.</b> Para alterar, use "Gerar nova revisão"
                  no topo.
                </>
              ) : (
                <>
                  <b>
                    {fluxo.isAguardandoVerif ? "Aguardando verificação" : "Aguardando aprovação"} ({rotuloRev(fluxo.rev)}) —
                    dados travados
                  </b>{" "}
                  para que o PDF conferido seja o mesmo da tela.
                </>
              )
            ) : (
              <>
                <b>Destravado para correção.</b> Ao {fluxo.isAguardandoVerif ? "verificar" : "aprovar"}, o PDF da{" "}
                {rotuloRev(fluxo.rev)} é refeito automaticamente com as alterações.
              </>
            )}
          </div>
          {podeDestravar &&
            (ativo ? (
              <Button size="sm" variant="outline" className="h-7 text-xs" data-livre onClick={() => setDestravado(true)}>
                <LockOpen className="mr-1 h-3.5 w-3.5" /> Destravar para corrigir
              </Button>
            ) : (
              <Button size="sm" variant="ghost" className="h-7 text-xs" data-livre onClick={() => setDestravado(false)}>
                <Lock className="mr-1 h-3.5 w-3.5" /> Travar de novo
              </Button>
            ))}
        </div>
      )}
      <div
        className={ativo ? "space-y-4 [&_input]:cursor-default [&_textarea]:cursor-default" : "space-y-4"}
        aria-readonly={ativo || undefined}
        onPointerDownCapture={aoApontar}
        onClickCapture={aoApontar}
        onBeforeInputCapture={aoEditar}
        onPasteCapture={aoEditar}
        onCutCapture={aoEditar}
        onDropCapture={aoEditar}
        onKeyDownCapture={aoTeclar}
      >
        {children}
      </div>
    </div>
  );
}
