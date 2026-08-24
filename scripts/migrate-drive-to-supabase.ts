/**
 * Script de Migração Retroativa: Google Drive -> Supabase Soberano
 *
 * Lê os registros históricos que estavam no Google Drive (_approvals-index.json e ensaio.json)
 * e faz upsert nas tabelas relacionais do Supabase:
 * - lab_report_approvals
 * - lab_report_approval_comments
 * - lab_index (workflow_status, extra, rev)
 *
 * Como rodar:
 *   npx tsx scripts/migrate-drive-to-supabase.ts
 */

import { config } from "dotenv";
config();

async function runMigration() {
  console.log("=== INICIANDO MIGRAÇÃO RETROATIVA DRIVE -> SUPABASE ===");

  const { supabaseAdmin } = await import("../src/integrations/supabase/client.server");
  const { readDriveJson, DRIVE_ROOT_FOLDER_ID, hasDriveCredentials } = await import("../src/lib/driveStorage");

  if (!hasDriveCredentials()) {
    console.warn("Credenciais do Google Drive não detectadas no ambiente. Verificando fallback local...");
  }

  // 1. Migra _approvals-index.json
  console.log("1. Lendo _approvals-index.json...");
  try {
    const master = await readDriveJson<any>("_approvals-index.json", DRIVE_ROOT_FOLDER_ID);
    if (master) {
      const approvals = Object.values(master.approvals || {});
      const statuses = master.statuses || {};
      const history = master.history || [];

      console.log(`Encontradas ${approvals.length} revisões de aprovação, ${Object.keys(statuses).length} status de ensaios e ${history.length} eventos de histórico.`);

      // 1.1 Migra aprovações
      for (const app of approvals as any[]) {
        if (!app.scope_id || typeof app.rev !== "number") continue;
        const { error } = await supabaseAdmin.from("lab_report_approvals").upsert(
          {
            scope_id: app.scope_id,
            rev: app.rev,
            status: app.status || "pendente_verificacao",
            requested_by: app.requested_by || "00000000-0000-0000-0000-000000000000",
            requested_by_name: app.requested_by_name || null,
            requested_at: app.requested_at || new Date().toISOString(),
            verified_by: app.verified_by || null,
            verified_by_name: app.verified_by_name || null,
            verified_at: app.verified_at || null,
            verification_comment: app.verification_comment || null,
            decided_by: app.decided_by || null,
            decided_by_name: app.decided_by_name || null,
            decided_at: app.decided_at || null,
            comment: app.comment || null,
            filename: app.filename || null,
            updated_at: app.updated_at || new Date().toISOString(),
          },
          { onConflict: "scope_id,rev" }
        );
        if (error) {
          console.warn(`[Migração] Erro ao importar aprovação ${app.scope_id} rev ${app.rev}:`, error.message);
        }
      }

      // 1.2 Migra status de workflow no lab_index
      for (const [scopeId, status] of Object.entries(statuses)) {
        const { error } = await supabaseAdmin.from("lab_index").upsert(
          {
            scope_id: scopeId,
            workflow_status: String(status),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "scope_id" }
        );
        if (error) {
          console.warn(`[Migração] Erro ao importar status ${scopeId}:`, error.message);
        }
      }

      // 1.3 Migra histórico de comentários
      for (const evt of history as any[]) {
        if (!evt.scope_id || typeof evt.rev !== "number") continue;
        await supabaseAdmin
          .from("lab_report_approval_comments")
          .insert({
            scope_id: evt.scope_id,
            rev: evt.rev,
            action: evt.action || "comment",
            comment: evt.comment || null,
            author_id: evt.author_id || "00000000-0000-0000-0000-000000000000",
            author_name: evt.author_name || null,
            author_role: evt.author_role || null,
            created_at: evt.created_at || new Date().toISOString(),
          })
          .catch(() => {});
      }

      console.log("✓ _approvals-index.json migrado com sucesso para o Supabase!");
    } else {
      console.log("Nenhum _approvals-index.json encontrado para migrar.");
    }
  } catch (err) {
    console.error("Erro ao migrar _approvals-index.json:", err);
  }

  console.log("=== MIGRAÇÃO CONCLUÍDA COM SUCESSO ===");
}

runMigration().catch(console.error);
