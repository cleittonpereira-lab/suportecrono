import { useMemo, useRef, useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, X, ChevronDown, ChevronRight } from "lucide-react";
import { insertRow, ensureColumns } from "@/lib/programacao.functions";

const SHEET_AMOSTRAS = "Amostras";
const SHEET_ENSAIOS = "Ensaios";
const SHEET_TIPOS = "Tipos de Ensaio";

type Tipo = { id: string; nome: string };

interface ParsedRow {
  key: string; // unique
  identificacao: string;
  codigo_amostra: string;
  tipo: string;
  topo: string;
  base: string;
  amostra_coletada: string;
  tag: string; // um único tag de ensaio
  os?: string;
}

function normTag(s: string) {
  return s.trim().toUpperCase();
}

function parseFile(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, {
          defval: "",
          raw: false,
        });
        const rows: ParsedRow[] = [];
        json.forEach((r, idx) => {
          const get = (keys: string[]) => {
            for (const k of keys) {
              for (const key of Object.keys(r)) {
                if (key.trim().toLowerCase() === k.toLowerCase()) {
                  const val = String(r[key] ?? "").trim();
                  if (val) return val;
                }
              }
            }
            return "";
          };

          const identificacao = get([
            "Identificação", "Identificacao", "Identificação da Amostra", "Identificacao da Amostra",
            "Descrição", "Descricao", "Ponto", "Sondagem", "Furo", "Furo / Sondagem", "Origem", "Local", "Descrição da Amostra"
          ]);
          let codigo = get([
            "Código Amostra", "Codigo Amostra", "Código da Amostra", "Codigo da Amostra",
            "Código", "Codigo", "Amostra", "Amostra Code", "Amostra Nº", "Nº Amostra", "Numero Amostra",
            "Code", "Sample", "ID", "Rótulo", "Rotulo", "Etiqueta"
          ]);
          if (!codigo && identificacao) {
            codigo = identificacao;
          }
          if (!codigo) {
            codigo = `Amostra ${idx + 1}`;
          }

          const tipo = get(["Tipo", "Tipo Amostra", "Tipo de Amostra", "Material"]) || "ST";
          const topo = get(["Topo (m)", "Topo", "Profundidade Inicial", "Prof. Inicial", "De (m)", "De"]);
          const base = get(["Base (m)", "Base", "Profundidade Final", "Prof. Final", "Até (m)", "Ate (m)", "Até", "Ate"]);
          const coletada = get(["Amostra coletada", "Amostra Coletada", "Coleta", "Data Coleta", "Data da Coleta"]);
          const osInSheet = get(["OS", "O.S.", "Número OS", "Numero OS", "Nº OS", "Ordem de Serviço", "Ordem de Servico", "OS_Numero"]);

          const ensaios = get([
            "Ensaios laboratório", "Ensaios laboratorio", "Ensaios Laboratorio", "Ensaios", "Ensaio",
            "Tipo de Ensaio", "Tipos de Ensaio", "Escopo", "Método", "Metodo", "Ensaio Solicitado",
            "Ensaios Solicitados", "Serviço", "Servico", "Sigla"
          ]);

          const detectedTags: string[] = [];
          if (ensaios) {
            detectedTags.push(...ensaios.split(/[\s,;+/|]+/).map(normTag).filter(Boolean));
          } else {
            const KNOWN_FLAGS = ["CD", "CISALHAMENTO", "ADENSAMENTO", "EDOMETRO", "TRIAXIAL", "UU", "CU", "CBR", "CARACTERIZACAO", "MESP", "MR", "DP", "MCT", "PERMEABILIDADE", "COMPRESSAO"];
            for (const [colName, colVal] of Object.entries(r)) {
              const cleanCol = colName.trim().toUpperCase();
              const valStr = String(colVal ?? "").trim().toUpperCase();
              if (valStr === "X" || valStr === "SIM" || valStr === "1" || valStr === "OK" || valStr === "TRUE") {
                if (KNOWN_FLAGS.some((f) => cleanCol.includes(f))) {
                  detectedTags.push(normTag(cleanCol));
                }
              }
            }
          }

          if (detectedTags.length === 0) {
            detectedTags.push("ENSAIO");
          }

          detectedTags.forEach((tag, ti) => {
            rows.push({
              key: `${idx}-${ti}`,
              identificacao: identificacao || codigo,
              codigo_amostra: codigo,
              tipo,
              topo,
              base,
              amostra_coletada: coletada,
              tag,
              os: osInSheet,
            });
          });
        });
        resolve(rows);
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

export function ImportEnsaiosDialog({
  open,
  onOpenChange,
  osNumero,
  tomador,
  obra,
  tipos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  osNumero: string;
  tomador: string;
  obra: string;
  tipos: Tipo[];
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [tipoFilter, setTipoFilter] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Limpa tudo ao fechar o dialog
  useEffect(() => {
    if (!open) {
      setRows([]);
      setSelected(new Set());
      setFilter("");
      setTagFilter(new Set());
      setTipoFilter(new Set());
      setCollapsed(new Set());
    }
  }, [open]);

  const uniqueTags = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.tag));
    return Array.from(s).sort();
  }, [rows]);

  const uniqueTipos = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      const t = (r.tipo || "").trim().toUpperCase();
      if (t) s.add(t);
    });
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (tagFilter.size && !tagFilter.has(r.tag)) return false;
      if (tipoFilter.size && !tipoFilter.has((r.tipo || "").trim().toUpperCase())) return false;
      if (!q) return true;
      return (
        r.identificacao.toLowerCase().includes(q) ||
        r.codigo_amostra.toLowerCase().includes(q) ||
        (r.tipo || "").toLowerCase().includes(q) ||
        r.tag.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, tagFilter, tipoFilter]);

  // Agrupa por código de amostra (fallback identificação)
  const grouped = useMemo(() => {
    const g = new Map<string, { key: string; codigo: string; identificacao: string; tipo: string; topo: string; base: string; coleta: string; itens: ParsedRow[] }>();
    for (const r of filtered) {
      // Normaliza para não separar por diferenças de caixa/espaço/acentos
      const rawKey = r.codigo_amostra || r.identificacao || "—";
      const key = rawKey.trim().toUpperCase().replace(/\s+/g, " ");
      const cur = g.get(key);
      if (cur) cur.itens.push(r);
      else
        g.set(key, {
          key,
          codigo: r.codigo_amostra || rawKey,
          identificacao: r.identificacao,
          tipo: r.tipo,
          topo: r.topo,
          base: r.base,
          coleta: r.amostra_coletada,
          itens: [r],
        });
    }
    return Array.from(g.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [filtered]);

  async function handleFile(file: File) {
    try {
      const parsed = await parseFile(file);
      if (parsed.length === 0) {
        toast.error("Nenhuma linha com ensaios encontrada");
        return;
      }
      setRows(parsed);
      setSelected(new Set(parsed.map((r) => r.key)));
      toast.success(`${parsed.length} linhas de ensaio detectadas`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao ler o arquivo");
    }
  }

  const toggleAllFiltered = (v: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((r) => (v ? next.add(r.key) : next.delete(r.key)));
      return next;
    });
  };

  const toggleGroup = (keys: string[], v: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (v ? next.add(k) : next.delete(k)));
      return next;
    });
  };

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const collapseAll = () => setCollapsed(new Set(grouped.map((g) => g.key)));
  const expandAll = () => setCollapsed(new Set());

  const importMut = useMutation({
    mutationFn: async () => {
      const chosen = rows.filter((r) => selected.has(r.key));
      if (chosen.length === 0) throw new Error("Nada selecionado");
      // garante colunas extras
      await ensureColumns({
        data: {
          sheet: SHEET_AMOSTRAS,
          columns: [
            "os_numero",
            "codigo_amostra",
            "descricao",
            "tomador",
            "obra",
            "prioridade",
            "tipo",
            "topo_m",
            "base_m",
            "amostra_coletada",
          ],
        },
      });
      // agrupa por identificação+codigo
      const tipoByNome = new Map(tipos.map((t) => [t.nome.trim().toUpperCase(), t]));
      const amostraKeyToId = new Map<string, string>();

      const ensureTipo = async (tag: string): Promise<string> => {
        const cleanTag = tag.trim().toUpperCase();
        // 1. Procura por nome exato ou código
        let found = tipos.find(
          (t) =>
            t.nome.trim().toUpperCase() === cleanTag ||
            (t as any).codigo?.trim().toUpperCase() === cleanTag,
        );
        // 2. Procura por aliases comuns (CD -> Cisalhamento, AD -> Adensamento, TR -> Triaxial, etc.)
        if (!found) {
          if (cleanTag.includes("CD") || cleanTag.includes("CISALHA")) {
            found = tipos.find((t) => t.nome.toLowerCase().includes("cisalha"));
          } else if (cleanTag.includes("ADENS") || cleanTag.includes("EDOM") || cleanTag.includes("OED")) {
            found = tipos.find((t) => t.nome.toLowerCase().includes("adens"));
          } else if (cleanTag.includes("TRIAX") || cleanTag.includes("UU") || cleanTag.includes("CU")) {
            found = tipos.find((t) => t.nome.toLowerCase().includes("triax"));
          } else if (cleanTag.includes("CARACT") || cleanTag.includes("CBR")) {
            found = tipos.find((t) => t.nome.toLowerCase().includes("caract") || t.nome.toLowerCase().includes("cbr"));
          } else if (cleanTag.includes("MR") || cleanTag.includes("DP")) {
            found = tipos.find((t) => t.nome.toLowerCase().includes("resili") || t.nome.toLowerCase().includes("mr"));
          } else if (cleanTag.includes("MCT")) {
            found = tipos.find((t) => t.nome.toLowerCase().includes("mct"));
          } else if (cleanTag.includes("PERM")) {
            found = tipos.find((t) => t.nome.toLowerCase().includes("perm"));
          } else if (cleanTag.includes("COMP")) {
            found = tipos.find((t) => t.nome.toLowerCase().includes("comp"));
          }
        }
        if (found) return found.id;

        const res: any = await insertRow({
          data: {
            sheet: SHEET_TIPOS,
            row: {
              nome: tag,
              codigo: tag,
              permite_paralelo: false,
              cor_gantt: "#F0B43C",
            },
          },
        });
        return res.id;
      };

      let count = 0;
      for (const r of chosen) {
        const targetOs = osNumero || r.os || "Geral";
        const normId = (r.identificacao || "").trim().toUpperCase().replace(/\s+/g, " ");
        const normCod = (r.codigo_amostra || "").trim().toUpperCase().replace(/\s+/g, " ");
        const key = `${targetOs}||${normId}||${normCod}`;
        let amostraId = amostraKeyToId.get(key);
        if (!amostraId) {
          const desc = [
            r.identificacao,
            r.amostra_coletada ? `Coleta: ${r.amostra_coletada}` : "",
          ]
            .filter(Boolean)
            .join(" — ");
          const res: any = await insertRow({
            data: {
              sheet: SHEET_AMOSTRAS,
              row: {
                os_numero: targetOs,
                codigo_amostra: r.codigo_amostra || r.identificacao || `Amostra ${count + 1}`,
                descricao: desc || r.codigo_amostra || "",
                tomador: tomador || "",
                obra: obra || "",
                prioridade: "media",
                tipo: r.tipo || "ST",
                topo_m: r.topo || "",
                base_m: r.base || "",
                amostra_coletada: r.amostra_coletada || "",
              },
            },
          });
          amostraId = res.id;
          amostraKeyToId.set(key, amostraId!);
        }
        const tipoId = await ensureTipo(r.tag);
        await insertRow({
          data: {
            sheet: SHEET_ENSAIOS,
            row: {
              amostra_id: amostraId,
              tipo_ensaio_id: tipoId,
              status: "pendente",
              prioridade: "media",
            },
          },
        });
        count++;
      }
      return count;
    },
    onSuccess: (n) => {
      toast.success(`${n} ensaio(s) importado(s)`);
      qc.invalidateQueries({ queryKey: ["amostras"] });
      qc.invalidateQueries({ queryKey: ["ensaios"] });
      qc.invalidateQueries({ queryKey: ["tipos_ensaio"] });
      qc.invalidateQueries({ queryKey: ["tipos_ensaio_min"] });
      qc.invalidateQueries({ queryKey: ["programacoes"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao importar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base">Importar ensaios — OS {osNumero}</DialogTitle>
          <DialogDescription className="text-xs">
            Faça o upload de um CSV/XLSX. Cada tag em <b>Ensaios laboratório</b>{" "}
            vira um ensaio, agrupado por código de amostra.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-2 flex flex-wrap gap-2 items-center border-b">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" className="h-7" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Selecionar arquivo
          </Button>
          {rows.length > 0 && (
            <>
              <Badge variant="secondary" className="gap-1 h-6">
                <FileSpreadsheet className="h-3 w-3" /> {grouped.length} amostras · {rows.length} ensaios
              </Badge>
              <Input
                placeholder="Filtrar por texto..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-7 w-56 text-xs"
              />
              {uniqueTipos.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tipo:</span>
                  {uniqueTipos.map((t) => {
                    const active = tipoFilter.has(t);
                    return (
                      <button
                        key={t}
                        onClick={() =>
                          setTipoFilter((prev) => {
                            const next = new Set(prev);
                            active ? next.delete(t) : next.add(t);
                            return next;
                          })
                        }
                        className={`text-[11px] rounded border px-1.5 py-0 leading-5 transition ${
                          active
                            ? "bg-sky-500/20 border-sky-500 text-foreground"
                            : "bg-muted hover:bg-accent"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                  {tipoFilter.size > 0 && (
                    <button
                      onClick={() => setTipoFilter(new Set())}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Ensaio:</span>
                {uniqueTags.map((t) => {
                  const active = tagFilter.has(t);
                  return (
                    <button
                      key={t}
                      onClick={() =>
                        setTagFilter((prev) => {
                          const next = new Set(prev);
                          active ? next.delete(t) : next.add(t);
                          return next;
                        })
                      }
                      className={`text-[11px] rounded border px-1.5 py-0 leading-5 transition ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted hover:bg-accent"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
                {tagFilter.size > 0 && (
                  <button
                    onClick={() => setTagFilter(new Set())}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center"
                  >
                    <X className="h-3 w-3" /> limpar
                  </button>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {(() => {
                  const total = filtered.length;
                  const sel = filtered.filter((r) => selected.has(r.key)).length;
                  const allOn = total > 0 && sel === total;
                  const someOn = sel > 0 && !allOn;
                  return (
                    <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                      <Checkbox
                        checked={allOn ? true : someOn ? "indeterminate" : false}
                        onCheckedChange={(v) => toggleAllFiltered(!!v)}
                      />
                      Selecionar tudo
                    </label>
                  );
                })()}
                <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={expandAll}>Expandir</Button>
                <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={collapseAll}>Recolher</Button>
                <span className="text-[11px] text-muted-foreground">{selected.size} sel.</span>
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-auto px-3 py-2 space-y-1">
          {rows.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-16">
              Nenhum arquivo carregado. Selecione um CSV/XLSX no formato do modelo
              (Identificação, Código Amostra, Tipo, Topo, Base, Amostra coletada,
              Ensaios laboratório).
            </div>
          ) : (
            grouped.map((g) => {
              const keys = g.itens.map((i) => i.key);
              const selCount = keys.filter((k) => selected.has(k)).length;
              const allOn = selCount === keys.length;
              const someOn = selCount > 0 && !allOn;
              const isCollapsed = collapsed.has(g.key);
              return (
                <div key={g.key} className="rounded border overflow-hidden">
                  <div className="flex items-center gap-2 bg-muted/40 px-2 py-1">
                    <button
                      onClick={() => toggleCollapse(g.key)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    <Checkbox
                      checked={allOn ? true : someOn ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleGroup(keys, !!v)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs">{g.codigo || "sem código"}</span>
                        {g.identificacao && g.identificacao !== g.codigo && (
                          <span className="text-[11px] text-muted-foreground">· {g.identificacao}</span>
                        )}
                        {g.tipo && <Badge variant="outline" className="text-[10px] h-4 px-1">{g.tipo}</Badge>}
                        {(g.topo || g.base) && (
                          <span className="text-[11px] text-muted-foreground">
                            {g.topo}–{g.base} m
                          </span>
                        )}
                        {g.coleta && (
                          <span className="text-[11px] text-muted-foreground">Coleta: {g.coleta}</span>
                        )}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                      {selCount}/{keys.length}
                    </Badge>
                  </div>
                  {!isCollapsed && (
                    <div className="px-2 py-1 flex flex-wrap gap-1">
                      {g.itens.map((r) => {
                        const on = selected.has(r.key);
                        return (
                          <button
                            key={r.key}
                            onClick={() =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                on ? next.delete(r.key) : next.add(r.key);
                                return next;
                              })
                            }
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-4 transition ${
                              on
                                ? "bg-primary/10 border-primary/60 text-foreground"
                                : "bg-background hover:bg-muted text-muted-foreground"
                            }`}
                          >
                            <Checkbox checked={on} className="h-3 w-3" onCheckedChange={() => {}} />
                            <span className="font-mono">{r.tag}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="p-3 border-t gap-2">
          {rows.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => toggleAllFiltered(false)}>
              Limpar seleção
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={selected.size === 0 || importMut.isPending}
            onClick={() => importMut.mutate()}
          >
            {importMut.isPending
              ? "Importando..."
              : `Importar ${selected.size} ensaio(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}