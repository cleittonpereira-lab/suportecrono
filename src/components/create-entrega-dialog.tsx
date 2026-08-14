import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Search,
  Check,
  History,
  AlertTriangle,
  Plus,
  Trash2,
} from "lucide-react";
import { createScheduleRow, updateScheduleRow } from "@/lib/sheets.functions";
import {
  ESCOPO_TAGS,
  formatEscopoP,
  parseEntregaMeta,
  parseBrDate,
  splitEscopo,
  splitSetores,
  type EscopoTag,
  type TipoEntrega,
} from "@/lib/schedule-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ESCOPO_TONE } from "@/components/escopo-badges";
import { useSchedule } from "@/hooks/use-schedule";
import { useEntregues } from "@/hooks/use-entregues";
import { useCadastroOs } from "@/hooks/use-cadastro-os";

const SETOR_TAGS = ["Convencionais", "Especiais", "Dosagem"] as const;
const SETOR_TONE: Record<string, string> = {
  Convencionais:
    "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-800",
  Especiais:
    "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-800",
  Dosagem:
    "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Uma entrega individual dentro do dialog. Para "Parcial" o usuário pode
// adicionar várias; para "Final" e "Revisão" só existe uma.
interface EntregaDraft {
  tipo: "Parcial" | "Final";
  dataEntrega: string;
  laboratorio: string;
  escopoTags: EscopoTag[];
  escopoExtra: string;
  volumeComp: string;
  volumeCaract: string;
  mctc: string;
  mrs: string;
}

function emptyDraft(): EntregaDraft {
  return {
    tipo: "Parcial",
    dataEntrega: "",
    laboratorio: "",
    escopoTags: [],
    escopoExtra: "",
    volumeComp: "",
    volumeCaract: "",
    mctc: "",
    mrs: "",
  };
}

export function CreateEntregaDialog({ open, onOpenChange }: Props) {
  const schedule = useSchedule();
  const entregues = useEntregues();
  const cadastro = useCadastroOs();

  const [os, setOs] = useState("");
  const [tomador, setTomador] = useState("");
  const [setores, setSetores] = useState<string[]>([]);
  const [setorExtra, setSetorExtra] = useState("");
  // Modo do dialog: "PF" = fluxo Parcial/Final (permite múltiplas entregas,
  // cada uma com seu próprio tipo); "Revisão" = uma única linha simples.
  const [modo, setModo] = useState<"PF" | "Revisão">("PF");
  const [drafts, setDrafts] = useState<EntregaDraft[]>([emptyDraft()]);

  useEffect(() => {
    if (open) {
      setOs("");
      setTomador("");
      setSetores([]);
      setSetorExtra("");
      setModo("PF");
      setDrafts([emptyDraft()]);
    }
  }, [open]);

  // Revisão só aceita uma única entrada; colapsa se voltar do modo PF.
  useEffect(() => {
    if (modo === "Revisão" && drafts.length > 1) {
      setDrafts((cur) => [{ ...cur[0], tipo: "Parcial" }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  const updateDraft = (i: number, patch: Partial<EntregaDraft>) => {
    setDrafts((cur) => cur.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  };
  const addDraft = () =>
    setDrafts((cur) => {
      // Nova entrega entra como Parcial; a anterior deixa de ser "última"
      // (mantém o tipo escolhido pelo usuário).
      return [...cur, emptyDraft()];
    });
  const removeDraft = (i: number) =>
    setDrafts((cur) => (cur.length > 1 ? cur.filter((_, idx) => idx !== i) : cur));

  // Sugestões de OS a partir de todas as fontes
  const osIndex = useMemo(() => {
    const map = new Map<
      string,
      { os: string; tomador: string; sources: Set<string> }
    >();
    const add = (osRaw: string, tom: string, source: string) => {
      const key = String(osRaw ?? "").trim();
      if (!key) return;
      const cur = map.get(key) ?? {
        os: key,
        tomador: tom || "",
        sources: new Set<string>(),
      };
      if (!cur.tomador && tom) cur.tomador = tom;
      cur.sources.add(source);
      map.set(key, cur);
    };
    schedule.data?.rows.forEach((r) => add(r.os, r.tomador, "cronograma"));
    entregues.data?.rows.forEach((r) => add(r.os, r.tomador, "entregues"));
    cadastro.data?.rows.forEach((r) => add(r.os, r.tomador, "cadastro"));
    return Array.from(map.values());
  }, [schedule.data, entregues.data, cadastro.data]);

  const osQuery = os.trim();
  const suggestions = useMemo(() => {
    if (!osQuery) return [] as typeof osIndex;
    const q = osQuery.toLowerCase();
    return osIndex
      .filter((r) => r.os.toLowerCase().includes(q))
      .slice(0, 8);
  }, [osIndex, osQuery]);

  const exactMatch = useMemo(
    () => osIndex.find((r) => r.os === osQuery),
    [osIndex, osQuery],
  );

  // Histórico de entregas (cronograma + entregues) para a OS digitada
  interface HistItem {
    fonte: "Cronograma" | "Entregue";
    data: string;
    escopo: string;
    tipo: string;
    laboratorio: string;
    rowIndex?: number; // apenas cronograma
    dateObj: Date | null;
  }
  const historico = useMemo<HistItem[]>(() => {
    if (!osQuery) return [] as {
      fonte: "Cronograma" | "Entregue";
      data: string;
      escopo: string;
      tipo: string;
      laboratorio: string;
      rowIndex?: number;
      dateObj: Date | null;
    }[];
    const list: HistItem[] = [];
    schedule.data?.rows
      .filter((r) => r.os === osQuery)
      .forEach((r) => {
        const meta = parseEntregaMeta(r.escopo);
        list.push({
          fonte: "Cronograma",
          data: r.dataEntrega,
          escopo: r.escopo,
          laboratorio: r.laboratorio ?? "",
          rowIndex: r.rowIndex,
          dateObj: parseBrDate(r.dataEntrega),
          tipo: meta.tipo
            ? meta.tipo === "Parcial"
              ? `Parcial${meta.numero ? ` ${meta.numero}` : ""}`
              : meta.tipo
            : "—",
        });
      });
    entregues.data?.rows
      .filter((r) => r.os === osQuery)
      .forEach((r) => {
        const meta = parseEntregaMeta(r.escopo);
        list.push({
          fonte: "Entregue",
          data: r.dataPostagem,
          escopo: r.escopo,
          laboratorio: r.laboratorio ?? "",
          dateObj: parseBrDate(r.dataPostagem),
          tipo: meta.tipo
            ? meta.tipo === "Parcial"
              ? `Parcial${meta.numero ? ` ${meta.numero}` : ""}`
              : meta.tipo
            : "—",
        });
      });
    return list;
  }, [osQuery, schedule.data, entregues.data]);

  // Laboratórios distintos usados nesta OS
  const laboratorioHistorico = useMemo(() => {
    const set = new Map<string, number>();
    for (const h of historico) {
      const key = (h.laboratorio ?? "").trim();
      if (!key) continue;
      set.set(key, (set.get(key) ?? 0) + 1);
    }
    return Array.from(set.entries()).sort((a, b) => b[1] - a[1]);
  }, [historico]);

  // (ranking cronológico é calculado abaixo, considerando múltiplos drafts)

  const selectOs = (osKey: string) => {
    setOs(osKey);
    applyOsData(osKey);
  };

  const applyOsData = (osKey: string) => {
    // Prioridade: cronograma (mais recente) > entregues > cadastro
    const sched = schedule.data?.rows.find((r) => r.os === osKey);
    const ent = entregues.data?.rows.find((r) => r.os === osKey);
    const cad = cadastro.data?.rows.find((r) => r.os === osKey);
    const source = sched ?? ent ?? null;
    const tom = source?.tomador ?? cad?.tomador ?? "";
    setTomador(tom);
    if (source) {
      const parts = splitSetores(source.setor ?? "");
      const known = parts.filter((p) =>
        (SETOR_TAGS as readonly string[]).includes(p),
      );
      const extra = parts.filter(
        (p) => !(SETOR_TAGS as readonly string[]).includes(p),
      );
      setSetores(known);
      setSetorExtra(extra.join(" / "));
      const { tags, extras } = splitEscopo(source.escopo ?? "");
      setDrafts((cur) =>
        cur.map((d, i) =>
          i === 0
            ? { ...d, escopoTags: tags, escopoExtra: extras.join(" / ") }
            : d,
        ),
      );
    } else {
      // OS não encontrada em nenhuma aba — limpa auto-fills anteriores
      setSetores([]);
      setSetorExtra("");
      setDrafts((cur) =>
        cur.map((d, i) =>
          i === 0 ? { ...d, escopoTags: [], escopoExtra: "" } : d,
        ),
      );
    }
  };

  // Sempre que a OS digitada muda, re-aplica (ou limpa) os auto-fills
  // para evitar que dados de uma OS anterior persistam quando o usuário
  // apaga/edita o número e o resultado deixa de existir em qualquer aba.
  useEffect(() => {
    applyOsData(osQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osQuery, schedule.data, entregues.data, cadastro.data]);

  // ---------- Ranking para múltiplas parciais + shifts ----------
  // Para cada draft (só quando Parcial), determina o número final baseado
  // na ordem cronológica combinada (histórico + novos). Também identifica
  // linhas do cronograma existentes que precisam ser renumeradas.
  interface Assignment {
    draftIndex: number;
    number: number;
  }
  const { assignments, shifts } = useMemo(() => {
    // Numeração de Parciais: considera apenas drafts marcados como "Parcial"
    // (modo PF) — em modo Revisão nenhum draft é parcial.
    const parcialDraftIdxs =
      modo === "PF"
        ? drafts
            .map((d, i) => (d.tipo === "Parcial" ? i : -1))
            .filter((i) => i >= 0)
        : [];
    if (parcialDraftIdxs.length === 0) {
      return { assignments: [] as Assignment[], shifts: [] as {
        rowIndex: number; escopo: string; data: string; oldNumber: number; newNumber: number;
      }[] };
    }
    // Só considera histórico marcado como Parcial (numeração é por tipo)
    const histParciais = historico
      .filter((h) => h.dateObj && parseEntregaMeta(h.escopo).tipo === "Parcial")
      .map((h, i) => ({
        kind: "hist" as const,
        histIdx: i,
        rowIndex: h.rowIndex,
        fonte: h.fonte,
        escopo: h.escopo,
        data: h.data,
        time: h.dateObj!.getTime(),
      }));
    const newItems = parcialDraftIdxs.map((i) => ({
      kind: "new" as const,
      draftIdx: i,
      time:
        parseBrDate(drafts[i].dataEntrega)?.getTime() ??
        Number.POSITIVE_INFINITY,
    }));
    // Ordena: por data; empates → novos ficam DEPOIS dos existentes;
    // entre novos, mantém a ordem que o usuário adicionou.
    const combined = [...histParciais, ...newItems].sort((a, b) => {
      if (a.time !== b.time) return a.time - b.time;
      if (a.kind === b.kind) return 0;
      return a.kind === "hist" ? -1 : 1;
    });
    const assigns: Assignment[] = [];
    const shiftList: {
      rowIndex: number; escopo: string; data: string; oldNumber: number; newNumber: number;
    }[] = [];
    combined.forEach((item, idx) => {
      const number = idx + 1;
      if (item.kind === "new") {
        assigns.push({ draftIndex: item.draftIdx, number });
      } else if (item.fonte === "Cronograma" && item.rowIndex) {
        const oldNum = parseEntregaMeta(item.escopo).numero;
        if (oldNum !== number) {
          shiftList.push({
            rowIndex: item.rowIndex,
            escopo: item.escopo,
            data: item.data,
            oldNumber: oldNum ?? 0,
            newNumber: number,
          });
        }
      }
    });
    // Reordena assignments na ordem visual dos drafts
    assigns.sort((a, b) => a.draftIndex - b.draftIndex);
    return { assignments: assigns, shifts: shiftList };
  }, [modo, drafts, historico]);

  const createFn = useServerFn(createScheduleRow);
  const updateFn = useServerFn(updateScheduleRow);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      const setorStr = [
        ...setores,
        ...(setorExtra.trim() ? [setorExtra.trim()] : []),
      ].join(" / ");
      const created: { rowIndex: number }[] = [];
      for (let i = 0; i < drafts.length; i++) {
        const d = drafts[i];
        const tipoDraft: TipoEntrega =
          modo === "Revisão" ? "Revisão" : d.tipo;
        const numero =
          tipoDraft === "Parcial"
            ? assignments.find((a) => a.draftIndex === i)?.number ?? null
            : null;
        const isParcial = tipoDraft === "Parcial";
        const escopoFinal = formatEscopoP(
          d.escopoTags,
          d.escopoExtra.trim() ? [d.escopoExtra.trim()] : [],
          { tipo: tipoDraft, numero },
        );
        const row = await createFn({
          data: {
            tomador: tomador.trim(),
            os: os.trim(),
            setor: setorStr,
            laboratorio: d.laboratorio,
            dataEntrega: d.dataEntrega,
            volumeComp: isParcial ? d.volumeComp : "",
            volumeCaract: isParcial ? d.volumeCaract : "",
            mctc: isParcial ? d.mctc : "",
            mrs: isParcial ? d.mrs : "",
            escopo: escopoFinal,
          },
        });
        created.push(row);
      }
      for (const sh of shifts) {
        const meta = parseEntregaMeta(sh.escopo);
        if (!meta.tipo) continue;
        const escopoOnly = String(sh.escopo).split("||")[0].trim();
        const { tags, extras } = splitEscopo(escopoOnly);
        const newEscopo = formatEscopoP(tags, extras, {
          tipo: meta.tipo,
          numero: sh.newNumber,
        });
        await updateFn({
          data: { rowIndex: sh.rowIndex, escopo: newEscopo },
        });
      }
      return created;
    },
    onSuccess: async (res) => {
      toast.success(
        res.length === 1
          ? `Entrega criada na linha ${res[0].rowIndex}`
          : `${res.length} entregas criadas`,
      );
      await qc.invalidateQueries({ queryKey: ["schedule"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Falha ao criar entrega", { description: err.message });
    },
  });

  const disabled =
    mutation.isPending ||
    !tomador.trim() ||
    !os.trim() ||
    drafts.some((d) => !d.dataEntrega.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="space-y-1.5">
              <DialogTitle>Criar Entrega</DialogTitle>
              <DialogDescription>
                Nova linha no CRONOGRAMA — inserida após a última linha com
                delta preenchido (coluna A).
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => mutation.mutate()}
                disabled={disabled}
              >
                {mutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Salvar entrega
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Busca de OS */}
          <div className="space-y-1.5">
            <Label htmlFor="os">
              OS <span className="text-xs text-muted-foreground">(busca)</span>
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="os"
                className="pl-8"
                placeholder="Digite o número da OS…"
                value={os}
                onChange={(e) => setOs(e.target.value)}
              />
            </div>
            {osQuery && suggestions.length > 0 && !exactMatch && (
              <div className="mt-1 rounded-md border bg-popover shadow-sm max-h-52 overflow-auto">
                {suggestions.map((s) => (
                  <button
                    key={s.os}
                    type="button"
                    onClick={() => selectOs(s.os)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-mono font-semibold">{s.os}</span>
                    <span className="text-muted-foreground truncate">
                      {s.tomador}
                    </span>
                    <span className="ml-auto flex gap-1">
                      {Array.from(s.sources).map((src) => (
                        <Badge
                          key={src}
                          variant="outline"
                          className="text-[9px] uppercase"
                        >
                          {src}
                        </Badge>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {exactMatch && (
              <div className="mt-1 flex items-center gap-2 rounded-md border bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 text-xs">
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-800 dark:text-emerald-300">
                  OS encontrada — dados preenchidos automaticamente
                </span>
                <span className="ml-auto flex gap-1">
                  {Array.from(exactMatch.sources).map((src) => (
                    <Badge
                      key={src}
                      variant="outline"
                      className="text-[9px] uppercase"
                    >
                      {src}
                    </Badge>
                  ))}
                </span>
              </div>
            )}
          </div>

          {/* Histórico */}
          {osQuery && historico.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Histórico de entregas ({historico.length})
              </div>
              <div className="space-y-1">
                {historico.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs rounded-sm bg-background px-2 py-1"
                  >
                    <Badge
                      variant={h.fonte === "Entregue" ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {h.fonte}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {h.tipo}
                    </Badge>
                    <span className="text-muted-foreground">
                      {h.data || "sem data"}
                    </span>
                    <span className="ml-auto truncate max-w-[50%] text-muted-foreground">
                      {h.escopo || "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tomador">Tomador</Label>
              <Input
                id="tomador"
                value={tomador}
                onChange={(e) => setTomador(e.target.value)}
              />
            </div>
          </div>

          {/* Modo do dialog */}
          <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
            <Label>Tipo de entrega</Label>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { key: "PF", label: "Parcial / Final", tone: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-800" },
                  { key: "Revisão", label: "Revisão", tone: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800" },
                ] as const
              ).map((opt) => {
                const active = modo === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setModo(opt.key as "PF" | "Revisão")}
                    className={`text-xs font-semibold rounded-md border px-3 py-1.5 transition ${
                      active ? opt.tone : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {modo === "PF"
                ? "Cada entrega é marcada individualmente como Parcial ou Final — volumes aparecem só nas Parciais."
                : "Revisão: uma única linha com data / escopo / laboratório."}
            </p>
          </div>

          {/* Setor (comum a todas as entregas) */}
          <div className="space-y-1.5">
            <Label>Setor</Label>
            <div className="flex flex-wrap gap-2">
              {SETOR_TAGS.map((t) => {
                const active = setores.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setSetores((cur) =>
                        cur.includes(t)
                          ? cur.filter((x) => x !== t)
                          : [...cur, t],
                      )
                    }
                    className={`text-xs font-semibold rounded-md border px-3 py-1.5 transition ${
                      active
                        ? SETOR_TONE[t]
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <Input
              placeholder="Outro setor (opcional)"
              value={setorExtra}
              onChange={(e) => setSetorExtra(e.target.value)}
              className="mt-2"
            />
          </div>

          {/* Drafts (entregas) */}
          <div className="space-y-3">
            {modo === "PF" && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {drafts.length} entrega{drafts.length > 1 ? "s" : ""} nesta criação
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addDraft}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar nova entrega
                </Button>
              </div>
            )}
            {drafts.map((d, i) => {
              const draftTipo: TipoEntrega =
                modo === "Revisão" ? "Revisão" : d.tipo;
              const isParcial = draftTipo === "Parcial";
              const number = isParcial
                ? assignments.find((a) => a.draftIndex === i)?.number
                : null;
              return (
                <div
                  key={i}
                  className="space-y-3 rounded-md border bg-card p-3"
                >
                  <div className="flex items-center gap-2">
                    {modo === "PF" ? (
                      <div className="inline-flex rounded-md border overflow-hidden">
                        {(["Parcial", "Final"] as const).map((t) => {
                          const on = d.tipo === t;
                          const tone =
                            t === "Parcial"
                              ? "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200";
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => updateDraft(i, { tipo: t })}
                              className={`text-[11px] font-semibold px-2.5 py-1 transition ${
                                on ? tone : "bg-background text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Revisão
                      </Badge>
                    )}
                    {number ? (
                      <Badge variant="outline" className="text-[10px]">
                        #{number}
                      </Badge>
                    ) : null}
                    {drafts.length > 1 && (
                      <span className="text-xs text-muted-foreground">
                        Entrega {i + 1} de {drafts.length}
                      </span>
                    )}
                    {drafts.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-auto text-destructive"
                        onClick={() => removeDraft(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover
                      </Button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Data prevista de entrega</Label>
                    <Input
                      placeholder="dd/mm/aaaa"
                      value={d.dataEntrega}
                      onChange={(e) =>
                        updateDraft(i, { dataEntrega: e.target.value })
                      }
                      className="max-w-xs"
                    />
                  </div>

                  {isParcial && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Volumes de ensaio
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Vol. Comp. (H)</Label>
                          <Input
                            value={d.volumeComp}
                            onChange={(e) =>
                              updateDraft(i, { volumeComp: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Vol. Caract. (I)</Label>
                          <Input
                            value={d.volumeCaract}
                            onChange={(e) =>
                              updateDraft(i, { volumeCaract: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">MCT.C (J)</Label>
                          <Input
                            value={d.mctc}
                            onChange={(e) =>
                              updateDraft(i, { mctc: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">MR.S (K)</Label>
                          <Input
                            value={d.mrs}
                            onChange={(e) =>
                              updateDraft(i, { mrs: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>Escopo</Label>
                    <div className="flex flex-wrap gap-2">
                      {ESCOPO_TAGS.map((t) => {
                        const active = d.escopoTags.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() =>
                              updateDraft(i, {
                                escopoTags: active
                                  ? d.escopoTags.filter((x) => x !== t)
                                  : [...d.escopoTags, t],
                              })
                            }
                            className={`text-xs font-semibold rounded-md border px-3 py-1.5 transition ${
                              active
                                ? ESCOPO_TONE[t]
                                : "bg-background text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                    <Input
                      placeholder="Outro ensaio / escopo (opcional)"
                      value={d.escopoExtra}
                      onChange={(e) =>
                        updateDraft(i, { escopoExtra: e.target.value })
                      }
                      className="mt-2"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Laboratório</Label>
                      {laboratorioHistorico.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" size="sm" variant="outline">
                              <History className="mr-1.5 h-3.5 w-3.5" />
                              Usar do histórico
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="max-w-sm max-h-72 overflow-auto"
                          >
                            {laboratorioHistorico.map(([lab, count]) => (
                              <DropdownMenuItem
                                key={lab}
                                onSelect={() =>
                                  updateDraft(i, { laboratorio: lab })
                                }
                                className="items-start whitespace-normal"
                              >
                                <span className="text-xs leading-tight">
                                  {lab}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="ml-auto text-[10px]"
                                >
                                  {count}×
                                </Badge>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <Textarea
                      rows={3}
                      placeholder="Descreva os ensaios / laboratório desta entrega…"
                      value={d.laboratorio}
                      onChange={(e) =>
                        updateDraft(i, { laboratorio: e.target.value })
                      }
                    />
                  </div>
                </div>
              );
            })}

            {shifts.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-[11px]">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-600 shrink-0" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-amber-800 dark:text-amber-200">
                    {shifts.length} parcial(is) do cronograma serão renumeradas
                  </div>
                  {shifts.map((s) => (
                    <div
                      key={s.rowIndex}
                      className="text-amber-700 dark:text-amber-300"
                    >
                      linha {s.rowIndex} ({s.data}): #{s.oldNumber} → #{s.newNumber}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}