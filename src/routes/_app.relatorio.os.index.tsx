import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FolderPlus, FileText, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { labStore, useLabState } from "@/features/lab/store";
import { ENSAIO_LABEL } from "@/features/lab/types";

export const Route = createFileRoute("/_app/relatorio/os/")({
  component: OSList,
  head: () => ({
    meta: [
      { title: "Ordens de Serviço — Suporte LAB" },
      { name: "description", content: "Gestão de OS, amostras e ensaios do laboratório." },
    ],
  }),
});

function OSList() {
  const { os } = useLabState();
  const navigate = useNavigate();

  const criar = () => {
    const nova = labStore.createOS();
    navigate({ to: "/relatorio/os/$osId", params: { osId: nova.id }, search: {} });
  };

  return (
    <div className="px-6 py-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">Ordens de Serviço</h2>
          <p className="text-sm text-muted-foreground">
            Cada OS agrupa várias amostras, e cada amostra pode conter múltiplos ensaios.
          </p>
        </div>
        <Button onClick={criar}>
          <FolderPlus className="mr-2 h-4 w-4" />
          Nova OS
        </Button>
      </div>

      {os.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma OS cadastrada — clique em "Nova OS" para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {os.map((o) => {
            const nAm = o.amostras.length;
            const nEn = o.amostras.reduce((a, x) => a + x.ensaios.length, 0);
            return (
              <Link key={o.id} to="/relatorio/os/$osId" params={{ osId: o.id }} search={{}}>
                <Card className="transition hover:border-primary/50 hover:shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-sm">
                      <span className="truncate">{o.numero}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-xs">
                    <div className="truncate font-medium text-foreground">{o.client || "—"}</div>
                    <div className="text-muted-foreground">
                      Obra: {o.workNumber || "—"} · {o.local || "—"}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Badge variant="secondary">
                        <FileText className="mr-1 h-3 w-3" />
                        {nAm} amostra{nAm === 1 ? "" : "s"}
                      </Badge>
                      <Badge variant="outline">{nEn} ensaio{nEn === 1 ? "" : "s"}</Badge>
                    </div>
                    {o.amostras.length > 0 && (
                      <div className="pt-2 text-[10px] text-muted-foreground">
                        {o.amostras
                          .flatMap((a) => a.ensaios.map((e) => ENSAIO_LABEL[e.tipo]))
                          .slice(0, 3)
                          .join(" · ") || "sem ensaios"}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}