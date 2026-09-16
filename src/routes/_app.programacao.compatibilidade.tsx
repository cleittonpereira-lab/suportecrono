import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Link2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listRows, updateRow } from "@/lib/programacao.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ENSAIO_DISPONIVEL, ENSAIO_LABEL, ENSAIO_TAG, type EnsaioTipo } from "@/features/lab/types";
import { laudoPelaSigla } from "@/lib/compatibilidade-laudos";

const SHEET_TIPOS = "Tipos de Ensaio";
const SHEET_EQUIPS = "Equipamentos";

type Tipo = {
  id: string;
  nome: string;
  codigo: string | null;
  equipamentos_ids: string[];
  tipo_relatorio: EnsaioTipo | null;
};
type Equip = { id: string; nome: string };

export const Route = createFileRoute("/_app/programacao/compatibilidade")({
  component: CompatPage,
});

function CompatPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");

  const { data: tipos = [] } = useQuery({
    queryKey: ["tipos_ensaio"],
    queryFn: async () => {
      const rows = await listRows({ data: { sheet: SHEET_TIPOS } });
      const parsed = rows.map((r) => ({
        id: r.id,
        nome: r.nome ?? "",
        codigo: r.codigo || null,
        equipamentos_ids: (r.equipamentos_ids || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        tipo_relatorio: (r.tipo_relatorio as EnsaioTipo) || null,
      })) as Tipo[];
      // Deduplica por código/nome (case-insensitive) mantendo o registro
      // mais completo e unindo os equipamentos vinculados. Evita que tipos
      // duplicados na planilha apareçam como linhas repetidas na matriz.
      const byKey = new Map<string, Tipo>();
      for (const t of parsed) {
        const key = (t.codigo || t.nome).trim().toUpperCase();
        if (!key) continue;
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, { ...t });
        } else {
          existing.equipamentos_ids = Array.from(
            new Set([...existing.equipamentos_ids, ...t.equipamentos_ids]),
          );
          if (!existing.tipo_relatorio && t.tipo_relatorio) existing.tipo_relatorio = t.tipo_relatorio;
        }
      }
      return Array.from(byKey.values()).sort((a, b) =>
        a.nome.localeCompare(b.nome),
      );
    },
  });
  const { data: equipamentos = [] } = useQuery({
    queryKey: ["equipamentos"],
    queryFn: async () => {
      const rows = await listRows({ data: { sheet: SHEET_EQUIPS } });
      return rows
        .map((r) => ({ id: r.id, nome: r.nome ?? "" }))
        .sort((a, b) => a.nome.localeCompare(b.nome)) as Equip[];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ tipo, equipId, on }: { tipo: Tipo; equipId: string; on: boolean }) => {
      const set = new Set(tipo.equipamentos_ids);
      if (on) set.add(equipId); else set.delete(equipId);
      await updateRow({
        data: {
          sheet: SHEET_TIPOS,
          id: tipo.id,
          patch: { equipamentos_ids: Array.from(set).join(",") },
        },
      });
    },
    onMutate: async ({ tipo, equipId, on }) => {
      await qc.cancelQueries({ queryKey: ["tipos_ensaio"] });
      const prev = qc.getQueryData<Tipo[]>(["tipos_ensaio"]);
      qc.setQueryData<Tipo[]>(["tipos_ensaio"], (old) =>
        (old ?? []).map((t) =>
          t.id !== tipo.id
            ? t
            : {
                ...t,
                equipamentos_ids: on
                  ? Array.from(new Set([...t.equipamentos_ids, equipId]))
                  : t.equipamentos_ids.filter((x) => x !== equipId),
              },
        ),
      );
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tipos_ensaio"], ctx.prev);
      toast.error(e?.message ?? "Falha ao atualizar");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tipos_ensaio"] }),
  });

  // Grava qual relatório abre para este tipo. Esta é a MESMA coluna que a
  // Central de Relatórios e a lista por tipo passaram a respeitar — por isso
  // invalida também a chave delas ("prox-ensaios-tipos"), senão a mudança só
  // apareceria aqui até a próxima recarga da página.
  const setRelatorio = useMutation({
    mutationFn: async ({ tipo, relatorio }: { tipo: Tipo; relatorio: EnsaioTipo | null }) => {
      await updateRow({
        data: {
          sheet: SHEET_TIPOS,
          id: tipo.id,
          patch: { tipo_relatorio: relatorio ?? "" },
        },
      });
    },
    onMutate: async ({ tipo, relatorio }) => {
      await qc.cancelQueries({ queryKey: ["tipos_ensaio"] });
      const prev = qc.getQueryData<Tipo[]>(["tipos_ensaio"]);
      qc.setQueryData<Tipo[]>(["tipos_ensaio"], (old) =>
        (old ?? []).map((t) => (t.id !== tipo.id ? t : { ...t, tipo_relatorio: relatorio })),
      );
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tipos_ensaio"], ctx.prev);
      toast.error(e?.message ?? "Falha ao atualizar");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tipos_ensaio"] });
      qc.invalidateQueries({ queryKey: ["prox-ensaios-tipos"] });
    },
  });

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return tipos;
    return tipos.filter(
      (t) => t.nome.toLowerCase().includes(q) || (t.codigo ?? "").toLowerCase().includes(q),
    );
  }, [tipos, busca]);

  const countByEquip = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tipos) for (const eq of t.equipamentos_ids) m.set(eq, (m.get(eq) ?? 0) + 1);
    return m;
  }, [tipos]);

  const semLaudoCount = useMemo(
    () =>
      tipos.filter((t) => !t.tipo_relatorio && !(laudoPelaSigla(t.codigo) ?? laudoPelaSigla(t.nome)))
        .length,
    [tipos],
  );

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="Programação · Cadastro"
        icon={Link2}
        title="Central de compatibilidade"
        description="Diga quais equipamentos executam cada ensaio e qual relatório cada sigla abre. As mudanças valem na cascata, no Gantt e na Central de Relatórios."
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder="Buscar tipo de ensaio..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-8 max-w-xs"
        />
        {semLaudoCount > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            {semLaudoCount} tipo(s) sem relatório — nem configurado, nem reconhecido pela sigla
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Sigla × relatório
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Quando não configurado aqui, a Central tenta reconhecer o relatório pela sigla — e avisa
            em vez de abrir o laudo errado quando não reconhece.
          </p>
        </CardHeader>
        <CardContent className="overflow-auto">
          {tipos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Cadastre tipos de ensaio primeiro.</p>
          ) : (
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-2 border-b min-w-[220px]">Tipo de ensaio</th>
                  <th className="text-left p-2 border-b min-w-[180px]">Reconhecido pela sigla</th>
                  <th className="text-left p-2 border-b min-w-[220px]">Relatório configurado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const pelaSigla = laudoPelaSigla(t.codigo) ?? laudoPelaSigla(t.nome);
                  const semLaudoNenhum = !t.tipo_relatorio && !pelaSigla;
                  return (
                    <tr key={t.id} className="hover:bg-accent/40">
                      <td className="p-2 border-b">
                        <div className="flex flex-col">
                          <span className="font-medium">{t.nome}</span>
                          {t.codigo && (
                            <span className="text-[10px] text-muted-foreground">{t.codigo}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 border-b">
                        {pelaSigla ? (
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${ENSAIO_TAG[pelaSigla].className}`}
                          >
                            {ENSAIO_TAG[pelaSigla].code}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {semLaudoNenhum ? "⚠ não reconhecido" : "— não reconhecido"}
                          </span>
                        )}
                      </td>
                      <td className="p-2 border-b">
                        <Select
                          value={t.tipo_relatorio ?? "__none__"}
                          onValueChange={(v) =>
                            setRelatorio.mutate({
                              tipo: t,
                              relatorio: v === "__none__" ? null : (v as EnsaioTipo),
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-52">
                            <SelectValue placeholder="Não mapeado — identifica por sigla" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Não mapeado — identifica por sigla</SelectItem>
                            {ENSAIO_DISPONIVEL.map((et) => (
                              <SelectItem key={et} value={et}>
                                {ENSAIO_LABEL[et]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Equipamento × ensaio — {tipos.length} tipo(s) · {equipamentos.length} equipamento(s)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto">
          {tipos.length === 0 || equipamentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Cadastre tipos de ensaio e equipamentos primeiro.
            </p>
          ) : (
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-background text-left p-2 border-b border-r min-w-[220px]">
                    Tipo de ensaio
                  </th>
                  {equipamentos.map((e) => (
                    <th
                      key={e.id}
                      className="p-2 border-b text-left align-bottom whitespace-nowrap"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold">{e.nome}</span>
                        <Badge variant="secondary" className="w-fit text-[10px]">
                          {countByEquip.get(e.id) ?? 0} ensaio(s)
                        </Badge>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-accent/40">
                    <td className="sticky left-0 z-10 bg-background p-2 border-b border-r">
                      <div className="flex flex-col">
                        <span className="font-medium">{t.nome}</span>
                        {t.codigo && (
                          <span className="text-[10px] text-muted-foreground">{t.codigo}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {t.equipamentos_ids.length} equip.
                        </span>
                      </div>
                    </td>
                    {equipamentos.map((e) => {
                      const on = t.equipamentos_ids.includes(e.id);
                      return (
                        <td key={e.id} className="p-2 border-b text-center">
                          <Checkbox
                            checked={on}
                            disabled={toggle.isPending}
                            onCheckedChange={(v) =>
                              toggle.mutate({ tipo: t, equipId: e.id, on: !!v })
                            }
                            aria-label={`${t.nome} × ${e.nome}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}