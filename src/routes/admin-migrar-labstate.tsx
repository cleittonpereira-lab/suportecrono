import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { runLabStateMigration, testDriveRoundTrip, importLabStateFromClient } from "@/lib/lab-migration-admin.functions";

export const Route = createFileRoute("/admin-migrar-labstate")({
  component: AdminMigrarLabState,
});

function AdminMigrarLabState() {
  const migrateFn = useServerFn(runLabStateMigration);
  const testDriveFn = useServerFn(testDriveRoundTrip);
  const importFn = useServerFn(importLabStateFromClient);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<Awaited<ReturnType<typeof importLabStateFromClient>> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function runImportFromBrowser() {
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem("lab://os-store/v1") : null;
      if (!raw) {
        setImportError("Nenhum dado encontrado no localStorage deste navegador (chave lab://os-store/v1).");
        return;
      }
      const res = await importFn({ data: { secret: "suportecrono-migrate-2026-lab-tables", stateJson: raw } });
      setImportResult(res);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }
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

          <div className="pt-4 border-t space-y-2">
            <p className="text-sm font-medium">
              Importar dados deste navegador (onde os dados reais realmente estão hoje)
            </p>
            <p className="text-xs text-muted-foreground">
              Abra esta página no navegador de quem usa o sistema normalmente (já logado), e clique abaixo.
              Lê o localStorage deste navegador e envia pros arquivos novos no Drive.
            </p>
            <Button onClick={runImportFromBrowser} disabled={importing} variant="secondary">
              {importing ? "Importando..." : "Importar do localStorage deste navegador"}
            </Button>
            {importError && <p className="text-sm text-destructive">Erro: {importError}</p>}
            {importResult && (
              <div className="text-sm space-y-2">
                <p className="font-medium">{importResult.message}</p>
                <p>OS: {importResult.os} · Amostras: {importResult.amostras} · Ensaios: {importResult.ensaios}</p>
                {importResult.errors.length > 0 && (
                  <ul className="list-disc pl-5 max-h-64 overflow-auto">
                    {importResult.errors.map((e, i) => (
                      <li key={i} className="text-xs text-muted-foreground">{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
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
