import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { runLabStateMigration, testDriveRoundTrip } from "@/lib/lab-migration-admin.functions";

export const Route = createFileRoute("/admin-migrar-labstate")({
  component: AdminMigrarLabState,
});

function AdminMigrarLabState() {
  const migrateFn = useServerFn(runLabStateMigration);
  const testDriveFn = useServerFn(testDriveRoundTrip);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof runLabStateMigration>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [driveTest, setDriveTest] = useState<string[] | null>(null);
  const [driveTesting, setDriveTesting] = useState(false);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await migrateFn({ data: { secret: "suportecrono-migrate-2026-lab-tables" } });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function runDriveTest() {
    setDriveTesting(true);
    setDriveTest(null);
    try {
      const res = await testDriveFn({ data: { secret: "suportecrono-migrate-2026-lab-tables" } });
      setDriveTest(res.steps);
    } catch (err) {
      setDriveTest([`ERRO: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setDriveTesting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto my-16 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Migração: _lab-state.json → tabelas relacionais</CardTitle>
          <CardDescription>
            Ferramenta temporária de migração única. Traz OS/amostras/ensaios do mecanismo antigo
            para lab_os/lab_amostras/lab_ensaios. Seguro rodar mais de uma vez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={runDriveTest} disabled={driveTesting} variant="outline">
              {driveTesting ? "Testando..." : "Testar Drive (ler/escrever)"}
            </Button>
            <Button onClick={run} disabled={running}>
              {running ? "Migrando..." : "Rodar migração"}
            </Button>
          </div>
          {driveTest && (
            <ul className="text-xs space-y-1 bg-muted/30 rounded p-3">
              {driveTest.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-destructive">Erro: {error}</p>}
          {result && (
            <div className="text-sm space-y-2">
              <p className="font-medium">{result.message}</p>
              <p>OS: {result.os} · Amostras: {result.amostras} · Ensaios: {result.ensaios}</p>
              {result.errors.length > 0 && (
                <div>
                  <p className="font-medium text-destructive">Erros ({result.errors.length}):</p>
                  <ul className="list-disc pl-5 max-h-64 overflow-auto">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-xs text-muted-foreground">{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
