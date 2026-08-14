import { useRef, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, Truck, ExternalLink } from "lucide-react";
import { SetorBadges } from "@/components/setor-badges";
import { EscopoBadges } from "@/components/escopo-badges";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { isAtrasado } from "@/lib/schedule-utils";
import { SERVICOS } from "@/lib/cadastro.functions";
import type { ScheduleRow } from "@/lib/sheets.functions";
import { EntregasTable, useOsEntregas } from "@/components/os-entregas-panel";
import { RegistrarEntregaButton } from "@/components/registrar-entrega-button";
import { RemoverEntregaButton } from "@/components/remover-entrega-button";
import { OsArquivosPanel } from "@/components/os-arquivos-panel";
import { FolderOpen } from "lucide-react";
import { ProgramacaoOsPanel } from "@/components/programacao-os-badge";

const suporteLogoUrl = "/suporte-infra-logo.png";

export function OsFullDetailsDialog({
  row,
  open,
  onOpenChange,
  hideRegistrar = false,
  extraSection,
}: {
  row: ScheduleRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hideRegistrar?: boolean;
  extraSection?: ReactNode;
}) {
  const { lookup } = useCadastroByOs();
  const printRef = useRef<HTMLDivElement>(null);

  const cad = row ? lookup(row.os) : undefined;
  const { passadas, futuras } = useOsEntregas({
    os: row?.os || "",
    excludeProgramada: row?.dataEntrega,
    excludeLaboratorio: row?.laboratorio,
  });
  const totalEntregas = passadas.length + futuras.length;

  const handlePrint = () => {
    if (!printRef.current || !row) return;
    const html = printRef.current.innerHTML;
    const win = window.open("", "_blank", "width=900,height=1100");
    if (!win) return;
    const title = `OS ${row.os || "-"} - ${row.tomador || ""}`.trim();
    const logoUrl = `${window.location.origin}${suporteLogoUrl}`;
    win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; margin: 24px; font-size: 12px; line-height: 1.45; }
  .doc-header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #F0B43C; padding-bottom: 10px; margin-bottom: 14px; }
  .doc-header img { height: 48px; width: auto; }
  .doc-header .kicker { font-size: 10px; text-transform: uppercase; letter-spacing: .2em; color: #777; margin-bottom: 2px; }
  .doc-header .title-block { flex: 1; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .06em; color: #444; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
  .meta { color: #555; font-size: 11px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 16px; }
  .grid > div .lbl { font-size: 10px; text-transform: uppercase; color: #777; letter-spacing: .04em; }
  .grid > div .val { font-size: 12px; font-weight: 500; }
  .col-2 { grid-column: span 2; }
  .col-4 { grid-column: span 4; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
  th, td { border: 1px solid #ddd; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #555; }
  .tag { display: inline-block; border: 1px solid #ccc; border-radius: 4px; padding: 2px 6px; font-size: 10px; margin: 0 4px 4px 0; background: #fafafa; }
  .badge-danger { background: #fee; border-color: #f99; color: #b00; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .lab { white-space: pre-wrap; background: #fafafa; border: 1px solid #eee; padding: 6px 8px; border-radius: 4px; }

  /* Regras de Impressão Limpa — Texto Puro sem Ícones ou Fotos */
  svg { display: none !important; }
  button, input, textarea, select, .no-print, .print\\:hidden, .notes-toolbar, [role="toolbar"], .sr-only { display: none !important; }
  img:not(.doc-header img) { display: none !important; }
  .notes-editor-container { border: 1px solid #e2e8f0; background: #fff; padding: 6px 10px; border-radius: 4px; }
  .ProseMirror { font-size: 11px; line-height: 1.5; color: #1e293b; min-height: auto !important; }
  .ProseMirror p { margin: 4px 0; }
  .group.relative.rounded-md.border { border: 1px solid #e2e8f0; padding: 4px 8px; background: #fff; margin-bottom: 3px; display: inline-block; width: 100%; }
  .group.relative.rounded-md.border .h-24 { display: none !important; }

  @media print {
    body { margin: 12mm; }
    h2 { page-break-after: avoid; }
    tr, td, th { page-break-inside: avoid; }
    .doc-header { position: running(header); }
  }
</style>
</head>
<body>
<div class="doc-header">
  <img src="${logoUrl}" alt="Suporte INFRA" onerror="this.style.display='none'" />
  <div class="title-block">
    <div class="kicker">Detalhes de OS</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Gerado em ${new Date().toLocaleString("pt-BR")}</div>
  </div>
</div>
${html}
<script>
window.onload = function(){
  var img = document.querySelector('.doc-header img');
  var go = function(){ setTimeout(function(){ window.print(); }, 150); };
  if (img && !img.complete) { img.onload = go; img.onerror = go; }
  else { go(); }
};
</script>
</body>
</html>`);
    win.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4 pr-8">
            <DialogTitle>Detalhes completos da OS</DialogTitle>
            <div className="flex items-center gap-2">
              {!hideRegistrar && (
                <RegistrarEntregaButton
                  row={row}
                  onDone={() => onOpenChange(false)}
                />
              )}
              {!hideRegistrar && (
                <RemoverEntregaButton
                  row={row}
                  onDone={() => onOpenChange(false)}
                />
              )}
              {row?.os && (
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`https://sond.com.br/servicos/os-numero/${row.os}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> SOND
                  </a>
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handlePrint} disabled={!row}>
                <Printer className="h-3.5 w-3.5 mr-1.5" /> Gerar PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        {row && (
          <div ref={printRef} className="space-y-5 text-sm">
            {/* Cabeçalho */}
            <section>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-base">{row.tomador || "—"}</span>
                <Badge variant="outline" className="font-mono">
                  OS {row.os || "—"}
                </Badge>
                <SetorBadges setor={row.setor} size="xs" />
                {isAtrasado(row) && (
                  <Badge variant="destructive" className="badge-danger">
                    {row.delta}
                  </Badge>
                )}
                {cad?.sup && (
                  <span className="tag">SUP {cad.sup}</span>
                )}
              </div>
            </section>

            {row.os && (
              <section>
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5" />
                  Arquivos & notas da OS
                </h2>
                <OsArquivosPanel os={row.os} />
              </section>
            )}

            {row.os && (
              <section className="print:hidden">
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Programação de ensaios
                </h2>
                <ProgramacaoOsPanel os={row.os} />
              </section>
            )}

            {/* Cronograma desta entrega */}
            <section>
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Cronograma — entrega atual
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 grid">
                <Field label="Data postagem" value={row.dataPostagem} />
                <Field label="Data entrega" value={row.dataEntrega} />
                <Field label="Setor" value={row.setor} />
                <Field label="Delta" value={row.delta} />
                <Field label="Vol. comp." value={row.volumeComp} />
                <Field label="Vol. caract." value={row.volumeCaract} />
                <Field label="MCT.C" value={row.mctc} />
                <Field label="MR.S" value={row.mrs} />
              </div>
              {row.escopo && (
                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Escopo
                  </div>
                  <EscopoBadges escopo={row.escopo} />
                </div>
              )}
              {row.laboratorio && (
                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Laboratório
                  </div>
                  <div className="rounded-md border bg-muted/30 p-2 whitespace-pre-wrap lab">
                    {row.laboratorio}
                  </div>
                </div>
              )}
            </section>

            {/* Cadastro */}
            {cad && (
              <section>
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Cadastro da OS
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 grid">
                  <Field label="Mês" value={cad.mes} />
                  <Field label="SUP" value={cad.sup} />
                  <Field label="Data criação" value={cad.dataCriacao} />
                  <Field label="Data envio" value={cad.dataEnvio} />
                  <div className="col-span-2 md:col-span-4 col-4">
                    <Field label="Obra" value={cad.obra} />
                  </div>
                  {cad.local && (
                    <div className="col-span-2 md:col-span-4 col-4">
                      <Field label="Local" value={cad.local} />
                    </div>
                  )}
                </div>
                {Object.keys(cad.servicos).length > 0 && (
                  <div className="mt-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                      Serviços contratados
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {SERVICOS.filter((s) => cad.servicos[s]).map((s) => (
                        <span
                          key={s}
                          className="tag inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold bg-background"
                        >
                          <span>{s}</span>
                          <span className="opacity-70 tabular-nums">
                            {cad.servicos[s]}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Entregas */}
            <section>
              <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                Todas as entregas desta OS ({totalEntregas})
              </h2>
              {totalEntregas === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma entrega registrada para esta OS.
                </p>
              ) : (
                <div className="space-y-4">
                  <EntregasTable
                    title={`Realizadas / Atrasadas (${passadas.length})`}
                    rows={passadas}
                  />
                  {futuras.length > 0 && (
                    <EntregasTable
                      title={`Futuras (${futuras.length})`}
                      rows={futuras}
                      highlight
                    />
                  )}
                </div>
              )}
            </section>

            {extraSection}

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground lbl">
        {label}
      </div>
      <div className="text-sm val">{value || "—"}</div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

