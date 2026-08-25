/**
 * Script de Migração Retroativa: _lab-state.json (blob único) -> tabelas
 * relacionais (lab_os, lab_amostras, lab_ensaios)
 *
 * O labStore usava um único arquivo/registro com TODO o estado do
 * laboratório, sobrescrito por inteiro a cada mudança. Isso foi substituído
 * por uma linha por OS/amostra/ensaio. Este script lê o blob antigo (de
 * onde quer que ele esteja hoje - Drive, espelho no Supabase, ou backup
 * local) e faz upsert em cada tabela nova, preservando os IDs exatamente
 * como estão (eles já são referenciados por scope_id em lab_index e
 * report_approvals - trocar o formato do ID quebraria esses vínculos).
 *
 * Rodar UMA VEZ, depois de aplicar a migration SQL
 * `20260825010000_lab_os_amostras_ensaios_tabelas.sql` no Supabase:
 *
 *   npx tsx scripts/migrate-labstate-to-tables.ts
 *
 * É seguro rodar mais de uma vez (upsert por id) - não duplica linhas.
 */

import { config } from "dotenv";
config();

async function runMigration() {
  console.log("=== INICIANDO MIGRAÇÃO _lab-state.json -> lab_os/lab_amostras/lab_ensaios ===");

  const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
  const { loadLabStateFromDrive } = await import("../src/lib/labState.functions");

  const res = await loadLabStateFromDrive();
  if (!res.stateJson) {
    console.log("Nenhum estado de laboratório encontrado (Drive/Supabase/local). Nada para migrar.");
    return;
  }

  let parsed: { os?: any[] };
  try {
    parsed = JSON.parse(res.stateJson);
  } catch (err) {
    console.error("Falha ao interpretar o JSON do estado do laboratório:", err);
    return;
  }

  const osList = Array.isArray(parsed.os) ? parsed.os : [];
  console.log(`Encontradas ${osList.length} OS no estado antigo (fonte: ${res.fileId}).`);

  let osCount = 0;
  let amCount = 0;
  let enCount = 0;
  let errCount = 0;

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
      console.warn(`[Migração] Erro ao importar OS ${os.id} (${os.numero}):`, osErr.message);
      errCount++;
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
        console.warn(`[Migração] Erro ao importar amostra ${am.id} (OS ${os.numero}):`, amErr.message);
        errCount++;
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
          console.warn(`[Migração] Erro ao importar ensaio ${en.id} (amostra ${am.code || am.reportNumber}):`, enErr.message);
          errCount++;
          continue;
        }
        enCount++;
      }
    }
  }

  console.log(`=== MIGRAÇÃO CONCLUÍDA: ${osCount} OS, ${amCount} amostras, ${enCount} ensaios migrados (${errCount} erros) ===`);
}

runMigration().catch((err) => {
  console.error("Falha geral na migração:", err);
  process.exit(1);
});
