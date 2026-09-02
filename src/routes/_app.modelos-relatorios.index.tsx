import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Beaker, FlaskConical, FileText, Gauge, Droplets, Layers } from "lucide-react";

export const Route = createFileRoute("/_app/modelos-relatorios/")({
  ssr: false,
  component: ModelosRelatoriosIndex,
  head: () => ({
    meta: [
      { title: "Modelos de Relatórios — Suporte INFRA" },
      {
        name: "description",
        content:
          "Modelos oficiais dos relatórios de ensaios laboratoriais. Espelho fiel dos templates em uso — qualquer alteração no relatório reflete aqui.",
      },
    ],
  }),
});

const MODELOS = [
  {
    to: "/relatorio/adensamento" as const,
    titulo: "Adensamento Edométrico",
    descricao:
      "Modelo do relatório de adensamento (Casagrande, Pacheco Silva, Taylor). Espelho vivo do template oficial.",
    norma: "NBR 12007 / ASTM D2435",
    icon: Beaker,
    tag: "ADENS",
  },
  {
    to: "/relatorio/triaxial-cid" as const,
    titulo: "Triaxial CID",
    descricao:
      "Modelo do relatório de compressão triaxial consolidado drenado. Reflete o template atualmente em produção.",
    norma: "NBR 16853 / ASTM D7181",
    icon: FlaskConical,
    tag: "TRI.CID",
  },
  {
    to: "/relatorio/mesp-a-natural" as const,
    titulo: "Massa Específica Aparente · Natural",
    descricao:
      "Modelo do relatório de M.ESP.A Natural. Espelha 1:1 o template usado nas emissões.",
    norma: "NBR 16867:2020",
    icon: FlaskConical,
    tag: "M.ESP.A",
  },
  {
    to: "/modelos-relatorios/cisalhamento-direto" as const,
    titulo: "Cisalhamento Direto",
    descricao:
      "Modelo do relatório de cisalhamento direto (CD). Reflete o template atualmente em produção.",
    norma: "ASTM D3080 / NBR 16853",
    icon: Beaker,
    tag: "CD",
  },
  {
    to: "/modelos-relatorios/triaxial-uu" as const,
    titulo: "Triaxial UU",
    descricao:
      "Modelo do relatório de compressão triaxial não consolidado não drenado. Mesmo editor do CID, com o seletor de tipo em UU.",
    norma: "ASTM D2850 / NBR 12770",
    icon: FlaskConical,
    tag: "TRI.UU",
  },
  {
    to: "/modelos-relatorios/triaxial-ciu" as const,
    titulo: "Triaxial CIU",
    descricao:
      "Modelo do relatório de compressão triaxial consolidado não drenado. Mesmo editor do CID, com o seletor de tipo em CIU.",
    norma: "ASTM D4767 / ISO 17892-9",
    icon: FlaskConical,
    tag: "TRI.CIU",
  },
  {
    to: "/modelos-relatorios/modulo-resiliencia" as const,
    titulo: "Módulo de Resiliência",
    descricao:
      "Modelo do relatório de Módulo de Resiliência de solos, com sequência de tensões e ajuste do modelo composto.",
    norma: "DNIT 134/2018-ME",
    icon: Gauge,
    tag: "MR",
  },
  {
    to: "/modelos-relatorios/umidade-natural" as const,
    titulo: "Umidade Natural",
    descricao:
      "Modelo do relatório de teor de umidade natural por cápsulas.",
    norma: "NBR 6457",
    icon: Droplets,
    tag: "UMID",
  },
  {
    to: "/modelos-relatorios/asf-dap" as const,
    titulo: "Densidade Aparente (ASF.DAP)",
    descricao:
      "Modelo do relatório de densidade relativa aparente e massa específica aparente de misturas asfálticas compactadas.",
    norma: "DNIT 428/2022-ME",
    icon: Layers,
    tag: "ASF.DAP",
  },
  {
    to: "/modelos-relatorios/perm-v" as const,
    titulo: "Permeabilidade a Carga Variável (PERM.V)",
    descricao:
      "Modelo do relatório de permeabilidade a carga variável, Método B (bureta graduada). Espelho vivo do template oficial.",
    norma: "ABNT NBR 14545:2021",
    icon: Droplets,
    tag: "PERM.V",
  },
];

function ModelosRelatoriosIndex() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Modelos de Relatórios</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Acesso administrativo aos modelos oficiais dos relatórios de ensaio. Cada
            modelo é um espelho vivo do template em produção — qualquer alteração no
            relatório se reflete imediatamente aqui.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MODELOS.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.to} className="flex flex-col">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="rounded-md bg-muted p-2">
                    <Icon className="h-4 w-4" />
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {m.tag}
                  </Badge>
                </div>
                <CardTitle className="text-base">{m.titulo}</CardTitle>
                <CardDescription className="text-xs">{m.norma}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col justify-between gap-4 flex-1">
                <p className="text-sm text-muted-foreground">{m.descricao}</p>
                <Button asChild size="sm" className="w-full">
                  <Link to={m.to}>
                    Abrir modelo <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}