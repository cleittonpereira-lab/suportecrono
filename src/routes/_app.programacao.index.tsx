import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { CalendarRange, Wrench, FlaskConical, ListTree, LayoutDashboard, Link2, ScanLine } from "lucide-react";
import { useMemo } from "react";
import { useSchedule } from "@/hooks/use-schedule";
import { splitSetores, splitEscopo } from "@/lib/schedule-utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_app/programacao/")({
  component: ProgramacaoHome,
});

const cards = [
  {
    to: "/programacao/equipamentos",
    icon: Wrench,
    title: "Equipamentos",
    desc: "Cadastro dos equipamentos disponíveis para programação.",
    ready: true,
  },
  {
    to: "/programacao/tipos-ensaio",
    icon: FlaskConical,
    title: "Tipos de ensaio",
    desc: "Catálogo de ensaios, tempos, cores e dependências.",
    ready: true,
  },
  {
    to: "/programacao/compatibilidade",
    icon: Link2,
    title: "Compatibilidade",
    desc: "Matriz que define quais equipamentos podem executar cada ensaio.",
    ready: true,
  },
  {
    to: "/programacao/central",
    icon: ListTree,
    title: "Central de programação",
    desc: "Amostras e ensaios por OS + fila de ensaios sem programação.",
    ready: true,
  },
  {
    to: "/programacao/gantt",
    icon: CalendarRange,
    title: "Gantt de execução",
    desc: "Linha do tempo por equipamento com barras arrastáveis por data.",
    ready: true,
  },
  {
    to: "/programacao/dashboard",
    icon: LayoutDashboard,
    title: "Dashboard operacional",
    desc: "Ocupação, atrasos e carga por equipamento.",
    ready: true,
  },
  {
    to: "/programacao/scan",
    icon: ScanLine,
    title: "Leitor QR (mobile)",
    desc: "Escaneie o QR da amostra para iniciar ou concluir o ensaio direto do celular.",
    ready: true,
  },
] as const;

function ProgramacaoHome() {
  return (
    <div className="space-y-6 w-full">
      <PageHeader
        eyebrow="Programação · Visão geral"
        icon={CalendarRange}
        title="Programação de ensaios"
        description="Módulo estilo Microsoft Project para planejar e acompanhar a execução dos ensaios do laboratório."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const body = (
            <Card className={`h-full transition ${c.ready ? "hover:border-primary/60 hover:shadow-md" : "opacity-60"}`}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{c.title}</CardTitle>
                </div>
                <CardDescription>{c.desc}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {c.ready ? "Disponível agora" : "Próximas fases"}
              </CardContent>
            </Card>
          );
          return c.ready ? (
            <Link key={c.title} to={c.to}>{body}</Link>
          ) : (
            <div key={c.title}>{body}</div>
          );
        })}
      </div>
      <OsEspeciaisList />
      <OsDefinirList />
    </div>
  );
}

function OsEspeciaisList() {
  const { data, isLoading } = useSchedule();
  const rows = data?.rows ?? [];

  const especiais = useMemo(() => {
    const seen = new Map<
      string,
      { os: string; tomador: string; setor: string; escopo: string[]; dataEntrega: string }
    >();
    for (const r of rows) {
      const setores = splitSetores(r.setor);
      if (!setores.includes("Especiais")) continue;
      if (!r.os) continue;
      const { tags } = splitEscopo(r.escopo || "");
      const prev = seen.get(r.os);
      if (prev) {
        for (const t of tags) if (!prev.escopo.includes(t)) prev.escopo.push(t);
      } else {
        seen.set(r.os, {
          os: r.os,
          tomador: r.tomador,
          setor: r.setor,
          escopo: [...tags],
          dataEntrega: r.dataEntrega,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.os.localeCompare(b.os));
  }, [rows]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> OS com ensaios especiais
          <Badge variant="secondary">{especiais.length}</Badge>
        </CardTitle>
        <CardDescription>
          Filtradas do cronograma pelo setor <b>Especiais</b>. Use como fila de
          entrada para programação.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : especiais.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma OS com tag Especiais no cronograma.
          </p>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>OS</TableHead>
                  <TableHead>Tomador</TableHead>
                  <TableHead>Escopo</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {especiais.map((o) => (
                  <TableRow key={o.os}>
                    <TableCell className="font-medium">{o.os}</TableCell>
                    <TableCell className="text-xs">{o.tomador || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {o.escopo.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          o.escopo.map((t) => (
                            <Badge
                              key={t}
                              variant="outline"
                              className="text-xs bg-primary/5"
                            >
                              {t}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{o.dataEntrega || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        to="/programacao/central"
                        className="text-xs text-primary hover:underline"
                      >
                        Programar →
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OsDefinirList() {
  const { data, isLoading } = useSchedule();
  const rows = data?.rows ?? [];

  // Também precisamos ignorar OS que já aparecem na lista de Especiais
  const especiaisOs = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      const setores = splitSetores(r.setor);
      if (setores.includes("Especiais") && r.os) s.add(r.os);
    }
    return s;
  }, [rows]);

  const definir = useMemo(() => {
    const seen = new Map<
      string,
      {
        os: string;
        tomador: string;
        setor: string;
        escopo: string[];
        extras: string[];
        dataEntrega: string;
      }
    >();
    for (const r of rows) {
      if (!r.os) continue;
      const setorNorm = (r.setor || "").trim().toLowerCase();
      const isSemSetor = !setorNorm;
      const isDefinir = /defin/.test(setorNorm);
      if (!isSemSetor && !isDefinir) continue;
      if (especiaisOs.has(r.os)) continue; // não duplica
      const { tags, extras } = splitEscopo(r.escopo || "");
      // Só interessa se aponta para possível Convencional/Especial (tem algum escopo)
      if (tags.length === 0 && extras.length === 0) continue;
      const prev = seen.get(r.os);
      if (prev) {
        for (const t of tags) if (!prev.escopo.includes(t)) prev.escopo.push(t);
        for (const e of extras) if (!prev.extras.includes(e)) prev.extras.push(e);
      } else {
        seen.set(r.os, {
          os: r.os,
          tomador: r.tomador,
          setor: r.setor || "—",
          escopo: [...tags],
          extras: [...extras],
          dataEntrega: r.dataEntrega,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.os.localeCompare(b.os));
  }, [rows, especiaisOs]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" /> OS aguardando definição de setor
          <Badge variant="secondary">{definir.length}</Badge>
        </CardTitle>
        <CardDescription>
          Linhas do Cronograma sem setor ou com <b>Setor = Definir</b> — possíveis
          Convencionais e Especiais, exibidas pelos seus possíveis ensaios e áreas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : definir.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma OS pendente de definição de setor.
          </p>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>OS</TableHead>
                  <TableHead>Tomador</TableHead>
                  <TableHead>Possíveis ensaios / áreas</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {definir.map((o) => (
                  <TableRow key={o.os}>
                    <TableCell className="font-medium">{o.os}</TableCell>
                    <TableCell className="text-xs">{o.tomador || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {o.escopo.map((t) => (
                          <Badge
                            key={t}
                            variant="outline"
                            className="text-xs bg-primary/5"
                          >
                            {t}
                          </Badge>
                        ))}
                        {o.extras.map((e, i) => (
                          <Badge
                            key={`x-${i}`}
                            variant="outline"
                            className="text-xs bg-muted"
                          >
                            {e}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{o.dataEntrega || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        to="/entregas"
                        className="text-xs text-primary hover:underline"
                      >
                        Definir →
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}