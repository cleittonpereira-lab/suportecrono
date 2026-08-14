import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SERVICOS, type Servico } from "@/lib/cadastro.functions";
import type { CadastroRow } from "@/lib/cadastro.functions";
import { SondButton } from "@/components/sond-button";

const SERVICO_TONE: Record<Servico, string> = {
  SP: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  ST: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900",
  PI: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900",
  SM: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  CPTU: "bg-lime-100 text-lime-800 border-lime-200 dark:bg-lime-950/40 dark:text-lime-300 dark:border-lime-900",
  VT: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900",
  SH: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  BL: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900",
  BQ: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  DN: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:border-fuchsia-900",
  SR: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
  SEG: "bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
};

export function CadastroDetailsDialog({
  row,
  onClose,
}: {
  row: CadastroRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-base">{row.os || "—"}</span>
                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted">{row.mes}</span>
                {row.os && <SondButton os={row.os} variant="button" />}
              </DialogTitle>
              <DialogDescription className="text-base font-medium text-foreground">
                {row.tomador}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 mt-2">
              <section>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Identificação</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Field label="SUP" value={row.sup} mono />
                  <Field label="Data de criação" value={row.dataCriacao} />
                  <Field label="Data de envio" value={row.dataEnvio} />
                </div>
              </section>

              <section>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Obra</h3>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <Field label="Obra" value={row.obra} />
                  <Field label="Local" value={row.local} />
                </div>
              </section>

              <section>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Serviços contratados
                </h3>
                <div className="flex flex-wrap gap-2">
                  {SERVICOS.filter((s) => row.servicos[s]).map((s) => (
                    <span
                      key={s}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${SERVICO_TONE[s]}`}
                    >
                      <span>{s}</span>
                      <span className="opacity-80 tabular-nums">{row.servicos[s]}</span>
                    </span>
                  ))}
                  {Object.keys(row.servicos).length === 0 && (
                    <span className="text-sm text-muted-foreground">Nenhum serviço informado</span>
                  )}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Total: <span className="font-semibold text-foreground tabular-nums">
                    {row.totalHoras.toLocaleString("pt-BR")}
                  </span>
                </div>
              </section>

              <section>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Retornos</h3>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left text-[10px] uppercase tracking-wider px-3 py-2">Etapa</th>
                        <th className="text-left text-[10px] uppercase tracking-wider px-3 py-2">Suporte</th>
                        <th className="text-left text-[10px] uppercase tracking-wider px-3 py-2">Cliente</th>
                      </tr>
                    </thead>
                    <tbody>
                      <RetornoRow label="1º retorno" sup={row.primeiroSuporte} cli={row.primeiroCliente} />
                      <RetornoRow label="2º retorno" sup={row.segundoSuporte} cli={row.segundoCliente} />
                      <RetornoRow label="3º retorno" sup={row.terceiroSuporte} cli={row.terceiroCliente} />
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  const v = (value ?? "").trim();
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className={`${mono ? "font-mono" : ""} ${v ? "" : "text-muted-foreground"}`}>
        {v || "—"}
      </div>
    </div>
  );
}

function RetornoRow({ label, sup, cli }: { label: string; sup: string; cli: string }) {
  const s = (sup ?? "").trim();
  const c = (cli ?? "").trim();
  const empty = (v: string) => !v || v === "-";
  return (
    <tr className="border-t">
      <td className="px-3 py-2 text-xs font-medium">{label}</td>
      <td className={`px-3 py-2 text-xs ${empty(s) ? "text-muted-foreground" : ""}`}>{empty(s) ? "—" : s}</td>
      <td className={`px-3 py-2 text-xs ${empty(c) ? "text-muted-foreground" : ""}`}>{empty(c) ? "—" : c}</td>
    </tr>
  );
}