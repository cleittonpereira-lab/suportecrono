import { Link } from "@tanstack/react-router";
import { Beaker, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLabState } from "@/features/lab/store";
import { ENSAIO_LABEL, type EnsaioTipo } from "@/features/lab/types";

export function EnsaioListByType({ tipo }: { tipo: EnsaioTipo }) {
  const state = useLabState();
  const rows: Array<{
    osId: string;
    amId: string;
    enId: string;
    osNumero: string;
    client?: string;
    amostra: string;
    depth?: string;
    code?: string;
    status: string;
    label?: string;
  }> = [];

  for (const os of state.os) {
    for (const am of os.amostras) {
      for (const en of am.ensaios) {
        if (en.tipo !== tipo) continue;
        rows.push({
          osId: os.id,
          amId: am.id,
          enId: en.id,
          osNumero: os.numero,
          client: os.client,
          amostra: am.reportNumber || "—",
          depth: am.depth,
          code: am.code,
          status: en.status,
          label: en.label,
        });
      }
    }
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
          {ENSAIO_LABEL[tipo]}
        </h2>
        <p className="text-sm text-muted-foreground">
          Ensaios de {ENSAIO_LABEL[tipo]} cadastrados em todas as OS.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ensaios cadastrados</CardTitle>
          <CardDescription>
            {rows.length === 0
              ? "Nenhum ensaio deste tipo. Crie via Ordens de Serviço → Amostra → Adicionar ensaio."
              : `${rows.length} ensaio${rows.length === 1 ? "" : "s"} encontrado${rows.length === 1 ? "" : "s"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Beaker className="mx-auto mb-2 h-6 w-6 opacity-50" />
              <Link to="/relatorio/os" className="underline">Ir para Ordens de Serviço</Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OS</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Amostra</TableHead>
                  <TableHead>Prof. (m)</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.enId}>
                    <TableCell className="font-medium">{r.osNumero}</TableCell>
                    <TableCell className="text-muted-foreground">{r.client || "—"}</TableCell>
                    <TableCell>{r.amostra}</TableCell>
                    <TableCell>{r.depth || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.code || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "concluido" ? "default" : "outline"} className="text-[9px]">
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId"
                        params={{ osId: r.osId, amostraId: r.amId, ensaioId: r.enId }}
                        className="text-xs text-primary underline"
                      >
                        Abrir
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}