/**
 * Janela de importação dos dados brutos do triaxial: mostra cada ensaio (NT) do
 * arquivo com a tensão confinante, as etapas e o nº de leituras, e deixa escolher
 * para qual CP vai cada um. Já abre com a sugestão de `sugerirDestinos`.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OwnTecTestSummary } from "../importXlsx";
import type { TriaxialSpecimen } from "../types";
import {
  cpsRepetidos,
  serveParaOTipo,
  sigma3Confere,
  sigma3DoArquivo,
  sugerirDestinos,
  type TipoTriaxial,
} from "../importDestinos";

/** O que cada etapa do arquivo de dados significa, por tipo de ensaio. */
export const LEGENDA_ETAPAS: { tipo: TipoTriaxial; rotulo: string; texto: string }[] = [
  { tipo: "cid", rotulo: "CID (drenado)", texto: 'adensamento isotrópico + ruptura drenada ("Ruptura Dren.").' },
  { tipo: "ciu", rotulo: "CIU (não drenado)", texto: 'adensamento isotrópico + ruptura não drenada ("Ruptura N/Dren."), com poropressão.' },
  { tipo: "uu", rotulo: "UU (não consolidado não drenado)", texto: 'aplicação de TC (sem adensamento) + ruptura não drenada ("Ruptura N/Dren.").' },
];

const NAO_IMPORTAR = "__nao_importar__";

const kPa = (v: number | null) =>
  v == null ? "n/d" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kPa`;

export interface DestinoDeImportacao {
  nt: string;
  cpId: string;
}

export function ImportarDadosBrutosDialog({
  aberto,
  onFechar,
  arquivo,
  tests,
  specimens,
  tipo,
  cpDeOrigem,
  onImportar,
}: {
  aberto: boolean;
  onFechar: () => void;
  arquivo: string;
  tests: OwnTecTestSummary[];
  /** CPs na ordem da tela (com `displayId`). */
  specimens: TriaxialSpecimen[];
  tipo: TipoTriaxial;
  /** CP de onde a importação foi aberta (destino padrão quando o arquivo tem um só ensaio). */
  cpDeOrigem?: string;
  onImportar: (destinos: DestinoDeImportacao[]) => void;
}) {
  const [destinos, setDestinos] = useState(() => sugerirDestinos(tests, specimens, tipo, cpDeOrigem));
  const repetidos = cpsRepetidos(destinos);
  const escolhidos = tests.flatMap((t) => {
    const cpId = destinos[t.nt];
    return cpId ? [{ nt: t.nt, cpId }] : [];
  });
  const nomeDoCp = (id: string) => {
    const c = specimens.find((s) => s.id === id);
    return c?.displayId ?? c?.id ?? id;
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar dados brutos</DialogTitle>
          <DialogDescription>
            Arquivo <strong>{arquivo}</strong> —{" "}
            {tests.length === 1 ? "1 ensaio encontrado" : `${tests.length} ensaios encontrados`}. Confira o
            número do teste e a tensão confinante e escolha o CP que recebe cada um.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-xs">
          <div className="font-semibold text-foreground">Como ler as etapas do arquivo</div>
          {LEGENDA_ETAPAS.map((l) => (
            <div key={l.tipo} className={l.tipo === tipo ? "font-medium text-foreground" : "text-muted-foreground"}>
              <span className="font-semibold">{l.rotulo}:</span> {l.texto}
            </div>
          ))}
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {tests.map((t) => {
            const serve = serveParaOTipo(t, tipo);
            const s3 = sigma3DoArquivo(t);
            const destino = destinos[t.nt] ?? null;
            const cp = destino ? specimens.find((c) => c.id === destino) : undefined;
            return (
              <div key={t.nt} className={`rounded-md border p-3 ${serve ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold">Teste NT {t.nt}</div>
                    <div className="text-xs text-muted-foreground">
                      Tensão confinante: <span className="font-semibold text-foreground">{kPa(s3)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.etapas.map((e) => `${e.name} (${e.count} leituras)`).join(" · ")}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-muted-foreground">Importar para</div>
                    <Select
                      value={destino ?? NAO_IMPORTAR}
                      disabled={!serve}
                      onValueChange={(v) => setDestinos((d) => ({ ...d, [t.nt]: v === NAO_IMPORTAR ? null : v }))}
                    >
                      <SelectTrigger className="h-8 w-[240px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NAO_IMPORTAR} className="text-xs">Não importar</SelectItem>
                        {specimens.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            {c.displayId ?? c.id} · σ₃ = {c.sigma3Target} kPa{c.rawImport ? " · já tem dados" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!serve && (
                  <div className="mt-1 text-xs text-destructive">
                    {tipo === "cid"
                      ? 'Não tem "Ruptura Dren." — não serve para este ensaio CID.'
                      : `Não tem "Ruptura N/Dren." — não serve para este ensaio ${tipo.toUpperCase()}.`}
                  </div>
                )}
                {cp && !sigma3Confere(s3, cp.sigma3Target) && (
                  <div className="mt-1 text-xs text-amber-600">
                    O σ₃ do {cp.displayId ?? cp.id} ({cp.sigma3Target} kPa) é diferente do arquivo ({kPa(s3)}).
                  </div>
                )}
                {cp?.rawImport && (
                  <div className="mt-1 text-xs text-amber-600">
                    Substitui os dados já importados no {cp.displayId ?? cp.id} (NT {cp.rawImport.nt || "—"}).
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {repetidos.length > 0 && (
          <div className="text-xs text-destructive">
            {repetidos.map(nomeDoCp).join(", ")} recebeu mais de um ensaio — escolha um CP diferente para cada NT.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={escolhidos.length === 0 || repetidos.length > 0} onClick={() => onImportar(escolhidos)}>
            {escolhidos.length <= 1 ? "Importar" : `Importar ${escolhidos.length} ensaios`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
