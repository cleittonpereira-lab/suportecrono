/**
 * Lista repetível de amostras dentro de um registro de chegada — cada uma
 * com tipo/identificação/profundidade/quantidade-volume e suas próprias
 * fotos (com data/hora e localização, melhor esforço). Substitui o antigo
 * trio "multi-select de tipo + texto livre de relação + galeria única".
 */
import { Plus, Trash2, MapPin, MapPinOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChegadaMultiSelect, type Option } from "./ChegadaMultiSelect";
import { ChegadaImageGallery } from "./ChegadaImageGallery";
import type { AmostraItem, AmostraFoto } from "@/lib/chegada-amostras-store";

export function novaAmostraVazia(): AmostraItem {
  return {
    id: "am_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    tipo: "",
    identificacao: "",
    profundidade: "",
    quantidadeVolume: "",
    fotos: [],
  };
}

function tryGetGeolocation(timeoutMs = 6000): Promise<{ lat: number | null; lng: number | null }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ lat: null, lng: null });
      return;
    }
    const timer = setTimeout(() => resolve({ lat: null, lng: null }), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve({ lat: null, lng: null });
      },
      { timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** Casa o array de URLs (vindo do ChegadaImageGallery) de volta com os
 * metadados (data/hora/geo) já conhecidos, por posição — a galeria troca o
 * base64 local pela URL curta no MESMO índice assim que o upload termina,
 * então casar por posição preserva os metadados certos durante essa troca. */
function mergeFotos(prevFotos: AmostraFoto[], newUrls: string[]): AmostraFoto[] {
  if (newUrls.length < prevFotos.length) {
    const newSet = new Set(newUrls);
    return prevFotos.filter((f) => newSet.has(f.url));
  }
  return newUrls.map((url, i) =>
    i < prevFotos.length ? { ...prevFotos[i], url } : { url, capturedAt: new Date().toISOString(), lat: null, lng: null },
  );
}

type AmostrasUpdater = (updater: AmostraItem[] | ((prev: AmostraItem[]) => AmostraItem[])) => void;

export function AmostrasListEditor({
  amostras,
  onChange,
  tipoOptions,
  onAddTipoOption,
}: {
  amostras: AmostraItem[];
  /** Passe o setState bruto (`setAmostras`) do componente pai — precisa aceitar
   * a forma funcional `(prev) => next`, senão a geolocalização assíncrona
   * pode sobrescrever edições feitas enquanto ela ainda está resolvendo. */
  onChange: AmostrasUpdater;
  tipoOptions: Option[];
  onAddTipoOption: (value: string) => void;
}) {
  function addAmostra() {
    onChange((prev) => [...prev, novaAmostraVazia()]);
  }

  function removeAmostra(id: string) {
    onChange((prev) => prev.filter((a) => a.id !== id));
  }

  function updateAmostra(id: string, patch: Partial<AmostraItem>) {
    onChange((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function handleFotosChange(id: string, newUrls: string[]) {
    const atual = amostras.find((a) => a.id === id);
    if (!atual) return;
    const prevLen = atual.fotos.length;
    updateAmostra(id, { fotos: mergeFotos(atual.fotos, newUrls) });

    // Geolocalização é melhor esforço — nunca bloqueia o anexo da foto.
    if (newUrls.length > prevLen) {
      for (let idx = prevLen; idx < newUrls.length; idx++) {
        void tryGetGeolocation().then(({ lat, lng }) => {
          onChange((prev) =>
            prev.map((a) => {
              if (a.id !== id || !a.fotos[idx]) return a;
              const fotos = a.fotos.slice();
              fotos[idx] = { ...fotos[idx], lat, lng };
              return { ...a, fotos };
            }),
          );
        });
      }
    }
  }

  return (
    <div className="space-y-3">
      {amostras.map((amostra, i) => (
        <Card key={amostra.id} className="border-border/80">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Amostra {i + 1}</span>
              {amostras.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                  onClick={() => removeAmostra(amostra.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <ChegadaMultiSelect
                  options={tipoOptions}
                  selected={amostra.tipo ? [amostra.tipo] : []}
                  onChange={(vals) => updateAmostra(amostra.id, { tipo: vals[vals.length - 1] ?? "" })}
                  placeholder="Selecione o tipo..."
                  createButtonLabel="+ Novo Tipo de Amostra"
                  onAddOption={onAddTipoOption}
                  icon="tag"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Identificação</Label>
                <Input
                  value={amostra.identificacao}
                  onChange={(e) => updateAmostra(amostra.id, { identificacao: e.target.value })}
                  placeholder="Ex.: BL-01, SM-A-482-02..."
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Profundidade</Label>
                <Input
                  value={amostra.profundidade}
                  onChange={(e) => updateAmostra(amostra.id, { profundidade: e.target.value })}
                  placeholder="Ex.: 1,00 – 1,50 m"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantidade / Volume</Label>
                <Input
                  value={amostra.quantidadeVolume}
                  onChange={(e) => updateAmostra(amostra.id, { quantidadeVolume: e.target.value })}
                  placeholder="Ex.: 2 sacos, 1 bloco 30x30x30cm..."
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Fotos desta amostra</Label>
                {amostra.fotos.length > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {amostra.fotos.every((f) => f.lat != null) ? (
                      <>
                        <MapPin className="h-3 w-3 text-emerald-600" /> localização registrada
                      </>
                    ) : (
                      <>
                        <MapPinOff className="h-3 w-3" /> localização indisponível para alguma foto
                      </>
                    )}
                  </span>
                )}
              </div>
              <ChegadaImageGallery
                images={amostra.fotos.map((f) => f.url)}
                onChange={(urls) => handleFotosChange(amostra.id, urls)}
              />
            </div>
          </CardContent>
        </Card>
      ))}

      <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 border-dashed" onClick={addAmostra}>
        <Plus className="h-4 w-4" /> Adicionar Amostra
      </Button>
    </div>
  );
}
