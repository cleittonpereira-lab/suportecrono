import { createFileRoute } from "@tanstack/react-router";
import { useSchedule } from "@/hooks/use-schedule";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarX,
  Clock,
  Sun,
  Moon,
  Sunrise,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  isAtrasado,
  isHoje,
  isPendente,
  parseBrDate,
  splitSetores,
} from "@/lib/schedule-utils";
import { SetorBadges } from "@/components/setor-badges";
import type { ScheduleRow } from "@/lib/sheets.functions";
import { OsFullDetailsDialog } from "@/components/os-full-details-dialog";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { RailCard } from "@/components/rail-card";

const TAG_OPTIONS = ["Convencionais", "Especiais", "Dosagem"] as const;
type Tag = (typeof TAG_OPTIONS)[number];

function rowTags(r: ScheduleRow): string[] {
  return splitSetores(r.setor);
}

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard | LabFlow" }],
  }),
  component: Dashboard,
});


function greetingFor(d: Date): { text: string; Icon: typeof Sun } {
  const h = d.getHours();
  if (h < 12) return { text: "Bom dia", Icon: Sunrise };
  if (h < 18) return { text: "Boa tarde", Icon: Sun };
  return { text: "Boa noite", Icon: Moon };
}

function formatLongDate(d: Date) {
  return d
    .toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    })
    .replace(/^./, (c) => c.toUpperCase());
}

function Dashboard() {
  const { data } = useSchedule();
  const { profile, user } = useAuth();
  const [selected, setSelected] = useState<Tag[]>([]);
  const [detailRow, setDetailRow] = useState<ScheduleRow | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    if (selected.length === 0) return data.rows;
    return data.rows.filter((r) => {
      const tags = rowTags(r);
      return selected.every((s) => tags.includes(s));
    });
  }, [data, selected]);

  if (!data)
    return (
      <div className="text-center py-12 text-muted-foreground">
        Carregando...
      </div>
    );

  const total = rows.length;
  const atrasados = rows.filter(isAtrasado);
  const hoje = rows.filter(isHoje);
  const pendentes = rows.filter(isPendente);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);
  const proximas7Dias = rows.filter((r) => {
    const d = parseBrDate(r.dataEntrega);
    return d && d >= today && d <= in7;
  });

  function toggle(t: Tag) {
    setSelected((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
    );
  }

  const tagCounts: Record<Tag, number> = {
    Convencionais: 0,
    Especiais: 0,
    Dosagem: 0,
  };
  for (const r of data.rows) {
    for (const t of rowTags(r)) {
      if (t in tagCounts) tagCounts[t as Tag]++;
    }
  }

  // Header: saudação + resumo em uma frase
  const now = new Date();
  const { text: hello, Icon: HelloIcon } = greetingFor(now);
  const nome =
    profile?.nome?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "";
  const emAndamento = rows.filter((r) => !isPendente(r)).length;
  const semana = proximas7Dias.length;

  // KPI "hero" — Entregas na semana com progresso do dia da semana (0-6)
  const weekdayIdx = now.getDay(); // 0=Dom..6=Sab
  const weekProgress = Math.round(((weekdayIdx + 1) / 7) * 100);

  const pctAtraso = total > 0 ? Math.round((atrasados.length / total) * 100) : 0;

  return (
    <div className="space-y-5 w-full">
      {/* Saudação / breadcrumb ao estilo Portal Aura */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80 flex items-center gap-1.5">
            <HelloIcon className="h-3 w-3" />
            Meu painel · Visão geral
          </div>
          <h1 className="text-3xl md:text-[32px] font-bold tracking-tight mt-1">
            {hello}
            {nome ? `, ${nome}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {formatLongDate(now)} ·{" "}
            <span className="text-foreground font-medium tabular-nums">
              {emAndamento}
            </span>{" "}
            OS em andamento ·{" "}
            <span className="text-foreground font-medium tabular-nums">
              {semana}
            </span>{" "}
            entregas na semana
          </p>
        </div>

        {/* Filtros de tag (chips discretos, alinhados à direita) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {TAG_OPTIONS.map((t) => {
            const active = selected.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggle(t)}
                className={`text-[11px] font-semibold rounded-full border px-2.5 py-1 transition ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted text-muted-foreground"
                }`}
              >
                {t}
                <span className="ml-1.5 tabular-nums opacity-70">
                  {tagCounts[t]}
                </span>
              </button>
            );
          })}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-[11px] text-muted-foreground hover:text-foreground px-1.5"
            >
              limpar
            </button>
          )}
        </div>
      </div>

      {/* Linha 1 — KPI "hero" (Entregas na semana) + Atrasadas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RailCard
          eyebrow="Operação · 7 dias"
          title="Entregas na semana"
          icon={CalendarClock}
          footerHref="/entregas"
          footerLabel="Ver cronograma"
        >
          <div className="flex items-baseline gap-3 mt-1">
            <div className="text-[56px] leading-none font-bold tabular-nums tracking-tight">
              {semana}
            </div>
            <div className="text-xs text-muted-foreground">
              entregas previstas · {hoje.length} para hoje
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${weekProgress}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {7 - weekdayIdx - 1 > 0
              ? `Restam ${7 - weekdayIdx - 1} dias na semana`
              : "Último dia da semana"}
          </div>
        </RailCard>

        <RailCard
          eyebrow="Operação · Prazos"
          title={
            atrasados.length === 0
              ? "Nenhuma OS atrasada"
              : `${atrasados.length} OS com atraso`
          }
          icon={AlertTriangle}
          tone={atrasados.length > 0 ? "destructive" : "amber"}
          footerHref="/gestao"
          footerLabel="Gestão de entregas"
        >
          {atrasados.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Confira as próximas entregas para se antecipar.
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-3 mt-1">
                <div className="text-[56px] leading-none font-bold tabular-nums tracking-tight text-destructive">
                  {atrasados.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  {pctAtraso}% da carteira · {pendentes.length} sem data
                </div>
              </div>
              <ul className="mt-4 divide-y">
                {atrasados
                  .slice()
                  .sort((a, b) => {
                    const na = parseInt(a.delta.match(/\d+/)?.[0] ?? "0", 10);
                    const nb = parseInt(b.delta.match(/\d+/)?.[0] ?? "0", 10);
                    return nb - na;
                  })
                  .slice(0, 3)
                  .map((r, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 py-2 cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded transition"
                      onClick={() => setDetailRow(r)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {r.tomador || "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          OS {r.os || "—"} · entrega {r.dataEntrega || "—"}
                        </div>
                      </div>
                      <Badge
                        variant="destructive"
                        className="text-[10px] shrink-0 tabular-nums"
                      >
                        {r.delta.match(/\d+/)?.[0] ?? "?"}d
                      </Badge>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </RailCard>
      </div>

      {/* Linha 2 — três cards de lista */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RailCard
          eyebrow="Operação · Hoje"
          title="Entregas de hoje"
          icon={Clock}
          tone="primary"
          footerHref="/entregas"
          footerLabel="Abrir cronograma"
        >
          {hoje.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nada programado para hoje.
            </div>
          ) : (
            <ul className="divide-y">
              {hoje.slice(0, 5).map((r, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 py-2 cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded transition"
                  onClick={() => setDetailRow(r)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.tomador || "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <span>OS {r.os || "—"}</span>
                      <SetorBadges setor={r.setor} size="xs" />
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-primary font-semibold shrink-0">
                    hoje
                  </span>
                </li>
              ))}
            </ul>
          )}
        </RailCard>

        <RailCard
          eyebrow="Operação · Próximos 7 dias"
          title="Próximas entregas"
          icon={CalendarClock}
          footerHref="/entregas"
          footerLabel="Ver calendário"
        >
          {proximas7Dias.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nada para os próximos 7 dias.
            </div>
          ) : (
            <ul className="divide-y">
              {proximas7Dias
                .slice()
                .sort((a, b) => {
                  const da = parseBrDate(a.dataEntrega)?.getTime() ?? 0;
                  const db = parseBrDate(b.dataEntrega)?.getTime() ?? 0;
                  return da - db;
                })
                .slice(0, 5)
                .map((r, i) => {
                  const d = parseBrDate(r.dataEntrega);
                  const diff = d
                    ? Math.max(
                        0,
                        Math.round(
                          (d.getTime() - today.getTime()) /
                            (1000 * 60 * 60 * 24),
                        ),
                      )
                    : null;
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-3 py-2 cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded transition"
                      onClick={() => setDetailRow(r)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {r.tomador || "—"}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                          <span>OS {r.os || "—"}</span>
                          <SetorBadges setor={r.setor} size="xs" />
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {diff === 0 ? "hoje" : `${diff}d`}
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </RailCard>

        <RailCard
          eyebrow="Operação · Backlog"
          title="Pendentes sem data"
          icon={CalendarX}
          tone="amber"
          footerHref="/pendentes"
          footerLabel="Definir datas"
        >
          <div className="flex items-baseline gap-3 mt-1">
            <div className="text-[44px] leading-none font-bold tabular-nums tracking-tight">
              {pendentes.length}
            </div>
            <div className="text-xs text-muted-foreground">
              OS aguardando programação
            </div>
          </div>
          {pendentes.length > 0 && (
            <ul className="mt-4 divide-y">
              {pendentes.slice(0, 3).map((r, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 py-2 cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded transition"
                  onClick={() => setDetailRow(r)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.tomador || "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      OS {r.os || "—"}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400 font-semibold shrink-0">
                    definir
                  </span>
                </li>
              ))}
            </ul>
          )}
        </RailCard>
      </div>

      <OsFullDetailsDialog
        row={detailRow}
        open={!!detailRow}
        onOpenChange={(v) => !v && setDetailRow(null)}
      />
    </div>
  );
}