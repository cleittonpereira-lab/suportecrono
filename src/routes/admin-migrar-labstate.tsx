import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { runLabStateMigration, testDriveRoundTrip, importLabStateFromClient, migrateUsersFromSupabase } from "@/lib/lab-migration-admin.functions";
import { gerarCopiaDoBancoAgora, importarDadosParaD1, situacaoDoBancoD1, tirarImagensDoQuadroChegada } from "@/lib/importacao-d1.functions";
import type { ResultadoCopia } from "@/lib/copia-diaria.server";
import type { ModoImportacao, RelatorioPasta, SituacaoDoBanco } from "@/lib/importacao-d1.server";
import type { RelatorioChegada } from "@/lib/chegada-fotos.server";

export const Route = createFileRoute("/admin-migrar-labstate")({
  component: AdminMigrarLabState,
});

function mensagemDeErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const kb = (n: number) => `${Math.round(n / 1024).toLocaleString("pt-BR")} KB`;

/** Junta as partes de uma mesma pasta num relatório só. */
function somarPartes(a: RelatorioPasta, b: RelatorioPasta): RelatorioPasta {
  return {
    ...b,
    noDrive: a.noDrive + b.noDrive,
    homonimos: a.homonimos + b.homonimos,
    incluidos: a.incluidos + b.incluidos,
    atualizados: a.atualizados + b.atualizados,
    jaExistiam: a.jaExistiam + b.jaExistiam,
    fotosMovidas: a.fotosMovidas + b.fotosMovidas,
    bytesAntes: a.bytesAntes + b.bytesAntes,
    bytesDepois: a.bytesDepois + b.bytesDepois,
    grandesDemais: [...a.grandesDemais, ...b.grandesDemais],
    erros: [...a.erros, ...b.erros],
  };
}

const CONFIRMACAO: Record<Exclude<ModoImportacao, "simular">, string> = {
  incluir: "Incluir no banco os documentos do Drive que ainda não estão lá? O que já está no banco não é alterado.",
  sincronizar:
    "Sobrescrever o banco com o conteúdo atual do Drive? Use só antes de ligar o banco (DADOS_NO_D1), para trazer o que mudou desde a última importação.",
};

/** Importação Drive → banco (Fase 1). Uma pasta por vez, com relatório de cada uma. */
function SecaoBancoD1() {
  const situacaoFn = useServerFn(situacaoDoBancoD1);
  const importarFn = useServerFn(importarDadosParaD1);
  const [situacao, setSituacao] = useState<SituacaoDoBanco | null>(null);
  const [rodando, setRodando] = useState<ModoImportacao | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioPasta[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const atualizarSituacao = useCallback(async () => {
    try {
      setSituacao(await situacaoFn());
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
  }, [situacaoFn]);

  useEffect(() => {
    void atualizarSituacao();
  }, [atualizarSituacao]);

  async function rodar(modo: ModoImportacao) {
    if (!situacao) return;
    if (modo !== "simular" && !window.confirm(CONFIRMACAO[modo])) return;
    setRodando(modo);
    setErro(null);
    setRelatorio([]);
    try {
      // Cada pasta vai em partes (limite de chamadas por requisição do
      // Cloudflare): repete até o servidor dizer que terminou (proximo = null).
      for (const pasta of situacao.alvos) {
        let inicio: number | null = 0;
        let acumulado: RelatorioPasta | null = null;
        while (inicio !== null) {
          const parte: RelatorioPasta = await importarFn({ data: { modo, pasta, inicio } });
          const total: RelatorioPasta = acumulado ? somarPartes(acumulado, parte) : parte;
          acumulado = total;
          setRelatorio((anterior) => [...anterior.filter((r) => r.pasta !== pasta), total]);
          // Sem avanço, repetir seria um laço sem fim: para e mostra o que houve.
          if (parte.proximo !== null && parte.proximo <= inicio) {
            throw new Error(`A importação de ${pasta} não avançou (parou no documento ${inicio + 1}).`);
          }
          inicio = parte.proximo;
        }
      }
      await atualizarSituacao();
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setRodando(null);
    }
  }

  const pronto = !!situacao?.configurado && !situacao.erro;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Banco de dados (D1)</CardTitle>
        <CardDescription>
          Traz OS, amostras, ensaios, pendências, usuários e demais dados do app do Drive para o banco. Fotos
          embutidas viram arquivo na pasta de fotos do Drive. Rode Simular primeiro.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!situacao && !erro && <p className="text-sm text-muted-foreground">Consultando o banco…</p>}
        {situacao && !situacao.configurado && (
          <p className="text-sm text-destructive">Este servidor ainda não tem o banco (binding DB) configurado.</p>
        )}
        {situacao?.erro && (
          <p className="text-sm text-destructive">
            O banco respondeu com erro — a migração das tabelas pode não ter sido aplicada: {situacao.erro}
          </p>
        )}
        {pronto && situacao && (
          <div className="text-sm space-y-1">
            <p>
              Fonte dos dados agora:{" "}
              <strong>{situacao.ligado ? "banco (DADOS_NO_D1 ligado)" : "Google Drive (banco ainda desligado)"}</strong>
            </p>
            <p className="text-muted-foreground">
              {situacao.porPasta.length === 0
                ? "O banco está vazio."
                : situacao.porPasta.map((p) => `${p.pasta}: ${p.documentos}`).join(" · ")}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => rodar("simular")} disabled={!pronto || !!rodando} variant="outline">
            {rodando === "simular" ? "Simulando…" : "Simular"}
          </Button>
          <Button onClick={() => rodar("incluir")} disabled={!pronto || !!rodando}>
            {rodando === "incluir" ? "Importando…" : "Importar o que falta"}
          </Button>
          <Button onClick={() => rodar("sincronizar")} disabled={!pronto || !!rodando || situacao?.ligado} variant="secondary">
            {rodando === "sincronizar" ? "Sincronizando…" : "Sincronizar do Drive"}
          </Button>
        </div>

        {erro && <p className="text-sm text-destructive">Erro: {erro}</p>}

        {relatorio.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3">Pasta</th>
                  <th className="py-1 pr-3">No Drive</th>
                  <th className="py-1 pr-3">Incluídos</th>
                  <th className="py-1 pr-3">Atualizados</th>
                  <th className="py-1 pr-3">Já no banco</th>
                  <th className="py-1 pr-3">Fotos movidas</th>
                  <th className="py-1 pr-3">Tamanho</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.map((r) => (
                  <tr key={r.pasta} className="border-t align-top">
                    <td className="py-1 pr-3 font-mono">{r.pasta}</td>
                    <td className="py-1 pr-3">
                      {r.noDrive}
                      {r.homonimos > 0 && ` (${r.homonimos} cópias repetidas ignoradas)`}
                    </td>
                    <td className="py-1 pr-3">{r.incluidos}</td>
                    <td className="py-1 pr-3">{r.atualizados}</td>
                    <td className="py-1 pr-3">{r.jaExistiam}</td>
                    <td className="py-1 pr-3">{r.fotosMovidas}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">
                      {kb(r.bytesAntes)} → {kb(r.bytesDepois)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {relatorio.flatMap((r) => [
              ...r.grandesDemais.map((g) => `${r.pasta}/${g}: grande demais para o banco, ficou de fora`),
              ...r.erros.map((e) => `${r.pasta}: ${e}`),
            ]).map((linha) => (
              <p key={linha} className="text-xs text-destructive mt-1">
                {linha}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Cópia do banco no Drive: automática todo dia às 06:00, ou agora pelo botão. */
function SecaoCopiaDoBanco() {
  const gerarFn = useServerFn(gerarCopiaDoBancoAgora);
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCopia | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setRodando(true);
    setErro(null);
    try {
      setResultado(await gerarFn());
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setRodando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cópia do banco no Drive</CardTitle>
        <CardDescription>
          Todo dia às 06:00 (Brasília) um arquivo com todos os dados do banco é salvo na pasta copias-do-banco do
          Drive. Ficam as 30 cópias mais recentes. Use o botão antes de qualquer operação arriscada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={gerar} disabled={rodando} variant="outline">
          {rodando ? "Gerando…" : "Gerar cópia agora"}
        </Button>
        {erro && <p className="text-sm text-destructive">Erro: {erro}</p>}
        {resultado && (
          <p className="text-sm">
            Cópia salva: <span className="font-mono">{resultado.arquivo}</span> · {resultado.documentos} documentos ·{" "}
            {kb(resultado.bytes)}
            {resultado.apagadas > 0 && ` · ${resultado.apagadas} cópia(s) antiga(s) apagada(s)`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Tira do quadro de Chegada as imagens antigas guardadas como texto. */
function SecaoImagensChegada() {
  const tirarFn = useServerFn(tirarImagensDoQuadroChegada);
  const [rodando, setRodando] = useState<"simular" | "aplicar" | null>(null);
  const [relatorio, setRelatorio] = useState<(RelatorioChegada & { simulado: boolean }) | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function rodar(simular: boolean) {
    if (!simular && !window.confirm("Salvar as imagens antigas do quadro como arquivo no Drive e trocar no quadro pelo endereço do arquivo?")) return;
    setRodando(simular ? "simular" : "aplicar");
    setErro(null);
    try {
      let r = await tirarFn({ data: { simular } });
      const inicial = r;
      // Em lotes (limite de chamadas por requisição): repete até não sobrar imagem.
      while (!simular && r.restantes > 0 && r.enviadas > 0) {
        r = await tirarFn({ data: { simular: false } });
      }
      setRelatorio({ ...r, bytesAntes: inicial.bytesAntes, imagensEmbutidas: inicial.imagensEmbutidas, simulado: simular });
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setRodando(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quadro de Chegada: imagens antigas</CardTitle>
        <CardDescription>
          Registros de 26/08 a 02/09 guardam fotos e assinaturas como texto dentro do quadro, que ficou perto do
          limite do banco. Salva essas imagens como arquivo no Drive, como as chegadas novas já fazem. A tela e o
          PDF do comprovante não mudam.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => rodar(true)} disabled={!!rodando} variant="outline">
            {rodando === "simular" ? "Simulando…" : "Simular"}
          </Button>
          <Button onClick={() => rodar(false)} disabled={!!rodando}>
            {rodando === "aplicar" ? "Salvando…" : "Tirar imagens do quadro"}
          </Button>
        </div>
        {erro && <p className="text-sm text-destructive">Erro: {erro}</p>}
        {relatorio && (
          <p className="text-sm">
            {relatorio.simulado ? "Simulação: " : ""}
            {relatorio.imagensEmbutidas} imagens em texto
            {relatorio.simulado ? "" : `, ${relatorio.trocadas} referências trocadas`} · quadro {kb(relatorio.bytesAntes)} →{" "}
            {kb(relatorio.bytesDepois)}
            {!relatorio.simulado && relatorio.restantes > 0 && ` · ainda restam ${relatorio.restantes}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AdminMigrarLabState() {
  const migrateFn = useServerFn(runLabStateMigration);
  const testDriveFn = useServerFn(testDriveRoundTrip);
  const importFn = useServerFn(importLabStateFromClient);
  const migrateUsersFn = useServerFn(migrateUsersFromSupabase);
  const [migratingUsers, setMigratingUsers] = useState(false);
  const [usersResult, setUsersResult] = useState<Awaited<ReturnType<typeof migrateUsersFromSupabase>> | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);

  async function runUsersMigration() {
    setMigratingUsers(true);
    setUsersError(null);
    setUsersResult(null);
    try {
      const res = await migrateUsersFn({ data: { secret: "suportecrono-migrate-2026-lab-tables" } });
      setUsersResult(res);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : String(err));
    } finally {
      setMigratingUsers(false);
    }
  }
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
    <div className="max-w-3xl mx-auto my-16 px-4 space-y-6">
      <SecaoBancoD1 />
      <SecaoCopiaDoBanco />
      <SecaoImagensChegada />
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
          <div className="pt-4 border-t space-y-2">
            <p className="text-sm font-medium">Migrar usuários do Supabase pro Drive</p>
            <p className="text-xs text-muted-foreground">
              Traz nome/cargo/papel/permissões de cada conta que ainda estiver no Supabase. Não copia
              senha — cada conta migrada precisa de senha nova, definida em Gestão de usuários.
            </p>
            <Button onClick={runUsersMigration} disabled={migratingUsers} variant="secondary">
              {migratingUsers ? "Migrando..." : "Migrar usuários"}
            </Button>
            {usersError && <p className="text-sm text-destructive">Erro: {usersError}</p>}
            {usersResult && (
              <div className="text-sm space-y-2">
                <p className="font-medium">{usersResult.message}</p>
                {usersResult.errors.length > 0 && (
                  <ul className="list-disc pl-5 max-h-64 overflow-auto">
                    {usersResult.errors.map((e, i) => (
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
