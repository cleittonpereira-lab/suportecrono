/**
 * Utilitário TEMPORÁRIO de migração — traz os dados que já existem no
 * mecanismo antigo (_lab-state.json) para as tabelas novas (lab_os,
 * lab_amostras, lab_ensaios). Protegido por segredo (não por login, para
 * poder ser disparado uma vez sem depender de sessão de usuário). Remover
 * este arquivo e a rota que o chama depois de confirmar que a migração
 * rodou com sucesso.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({ secret: z.string() });

export const testDriveRoundTrip = createServerFn({ method: "GET" })
  .validator((v: unknown) => Input.parse(v))
  .handler(async ({ data }) => {
    if (data.secret !== "suportecrono-migrate-2026-lab-tables") {
      throw new Error("unauthorized");
    }
    const { hasDriveCredentials, ensureFolderPath, writeDriveJson, readDriveJson } = await import("@/lib/driveStorage");
    const steps: string[] = [];
    steps.push(`hasDriveCredentials(): ${hasDriveCredentials()}`);
    try {
      const folderId = await ensureFolderPath(["_diagnostico"]);
      steps.push(`ensureFolderPath OK: folderId=${folderId}`);
      const testValue = { ping: Date.now() };
      const w = await writeDriveJson("_ping.json", testValue, folderId);
      steps.push(`writeDriveJson OK: ${JSON.stringify(w)}`);
      const r = await readDriveJson<typeof testValue>("_ping.json", folderId);
      steps.push(`readDriveJson: ${JSON.stringify(r)}`);
      const roundTripOk = r?.ping === testValue.ping;
      steps.push(`Round-trip bateu: ${roundTripOk}`);
    } catch (err) {
      steps.push(`ERRO: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { steps };
  });

export const runLabStateMigration = createServerFn({ method: "GET" })
  .validator((v: unknown) => Input.parse(v))
  .handler(async ({ data }) => {
    if (data.secret !== "suportecrono-migrate-2026-lab-tables") {
      throw new Error("unauthorized");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadLabStateFromDrive } = await import("@/lib/labState.functions");
    const { hasDriveCredentials } = await import("@/lib/driveStorage");

    // Diagnóstico: testa cada camada do mecanismo antigo separadamente para
    // entender exatamente onde os dados estão (ou não estão). Não chama
    // readDriveJson diretamente aqui (trava/demora demais em paralelo com a
    // chamada já feita dentro de loadLabStateFromDrive logo abaixo).
    const diag: string[] = [];
    diag.push(`hasDriveCredentials(): ${hasDriveCredentials()}`);
    try {
      const { data: globalRow, error: globalErr } = await supabaseAdmin
        .from("lab_index")
        .select("extra, updated_at")
        .eq("scope_id", "__global_lab_state__")
        .maybeSingle();
      if (globalErr) diag.push(`Supabase lab_index GLOBAL: ERRO - ${globalErr.message}`);
      else if (globalRow?.extra) {
        const asAny = globalRow.extra as any;
        diag.push(`Supabase lab_index GLOBAL: encontrado (${Array.isArray(asAny?.os) ? asAny.os.length : "?"} OS, atualizado ${globalRow.updated_at})`);
      } else diag.push(`Supabase lab_index GLOBAL: vazio/não encontrado`);
    } catch (err) {
      diag.push(`Supabase lab_index GLOBAL: ERRO - ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      const { count, error: cntErr } = await supabaseAdmin.from("lab_pendencias_digitacao").select("*", { count: "exact", head: true });
      diag.push(`lab_pendencias_digitacao (referência - deve ter dados reais): ${cntErr ? `ERRO - ${cntErr.message}` : `${count} linhas`}`);
    } catch (err) {
      diag.push(`lab_pendencias_digitacao: ERRO - ${err instanceof Error ? err.message : String(err)}`);
    }

    const timeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout (${ms}ms) em ${label}`)), ms)),
      ]);

    let res: { stateJson: string | null; fileId: string | null };
    try {
      res = await timeout(loadLabStateFromDrive(), 20_000, "loadLabStateFromDrive");
    } catch (err) {
      diag.push(`loadLabStateFromDrive: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: true, message: "loadLabStateFromDrive travou/expirou. Veja o diagnóstico.", os: 0, amostras: 0, ensaios: 0, errors: diag };
    }
    if (!res.stateJson) {
      return { ok: true, message: "Nenhum estado de laboratório encontrado. Nada para migrar.", os: 0, amostras: 0, ensaios: 0, errors: diag };
    }

    let parsed: { os?: any[] };
    try {
      parsed = JSON.parse(res.stateJson);
    } catch (err) {
      return { ok: false, message: `Falha ao interpretar JSON: ${err instanceof Error ? err.message : String(err)}`, os: 0, amostras: 0, ensaios: 0, errors: [] as string[] };
    }

    const osList = Array.isArray(parsed.os) ? parsed.os : [];
    let osCount = 0;
    let amCount = 0;
    let enCount = 0;
    const errors: string[] = [];

    for (const os of osList) {
      if (!os?.id) continue;
      const { error: osErr } = await supabaseAdmin.from("lab_os").upsert({
        id: os.id,
        numero: os.numero || "",
        client: os.client ?? null,
        work_number: os.workNumber ?? null,
        local: os.local ?? null,
        operator: os.operator ?? null,
        technical_resp: os.technicalResp ?? null,
        revision: os.revision ?? null,
        created_at: os.createdAt || new Date().toISOString(),
        updated_at: os.updatedAt || new Date().toISOString(),
      });
      if (osErr) {
        errors.push(`OS ${os.id} (${os.numero}): ${osErr.message}`);
        continue;
      }
      osCount++;

      for (const am of os.amostras ?? []) {
        if (!am?.id) continue;
        const { error: amErr } = await supabaseAdmin.from("lab_amostras").upsert({
          id: am.id,
          os_id: os.id,
          report_number: am.reportNumber ?? null,
          borehole: am.borehole ?? null,
          depth: am.depth ?? null,
          description: am.description ?? null,
          granulometric_description: am.granulometricDescription ?? null,
          code: am.code ?? null,
          sample_type: am.sampleType ?? null,
          material_type: am.materialType ?? null,
          coords: am.coords ?? null,
          photos: am.photos ?? [],
          created_at: am.createdAt || new Date().toISOString(),
          updated_at: am.updatedAt || new Date().toISOString(),
        });
        if (amErr) {
          errors.push(`Amostra ${am.id} (OS ${os.numero}): ${amErr.message}`);
          continue;
        }
        amCount++;

        for (const en of am.ensaios ?? []) {
          if (!en?.id) continue;
          const { error: enErr } = await supabaseAdmin.from("lab_ensaios").upsert({
            id: en.id,
            amostra_id: am.id,
            tipo: en.tipo || "cisalhamento-direto",
            status: en.status ?? null,
            label: en.label ?? null,
            nome: en.nome ?? null,
            sigla: en.sigla ?? null,
            operator: en.operator ?? null,
            photos: en.photos ?? [],
            payload: en.payload ?? null,
            created_at: en.createdAt || new Date().toISOString(),
            updated_at: en.updatedAt || new Date().toISOString(),
          });
          if (enErr) {
            errors.push(`Ensaio ${en.id} (amostra ${am.code || am.reportNumber}): ${enErr.message}`);
            continue;
          }
          enCount++;
        }
      }
    }

    return {
      ok: true,
      message: `Migração concluída: ${osCount} OS, ${amCount} amostras, ${enCount} ensaios (fonte: ${res.fileId}).`,
      os: osCount,
      amostras: amCount,
      ensaios: enCount,
      errors,
    };
  });
