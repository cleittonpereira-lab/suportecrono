/**
 * Utilitário TEMPORÁRIO de migração — traz os dados que já existem no
 * mecanismo antigo (_lab-state.json) para os arquivos individuais no Drive
 * (lab-os/, lab-amostras/, lab-ensaios/). Protegido por segredo (não por
 * login, para poder ser disparado uma vez sem depender de sessão de
 * usuário). Remover este arquivo e a rota que o chama depois de confirmar
 * que a migração rodou com sucesso.
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
    const { hasDriveCredentials, ensureFolderPath, readDriveJson, uploadBytesToDrive, DRIVE_ROOT_FOLDER_ID } = await import("@/lib/driveStorage");
    const { isGoogleAuthConfigured, getGoogleAccessToken } = await import("@/lib/google-auth.server");
    const steps: string[] = [];
    steps.push(`hasDriveCredentials() [conector Lovable]: ${hasDriveCredentials()}`);
    steps.push(`isGoogleAuthConfigured() [conta de servico direta]: ${isGoogleAuthConfigured()}`);
    if (isGoogleAuthConfigured()) {
      try {
        const token = await getGoogleAccessToken(["https://www.googleapis.com/auth/drive"]);
        steps.push(`getGoogleAccessToken OK (token obtido, ${token.length} chars)`);
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${DRIVE_ROOT_FOLDER_ID}?fields=id,name,mimeType&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const text = await res.text();
        steps.push(`Chamada direta Drive API (pasta raiz): status ${res.status} - ${text.slice(0, 300)}`);
      } catch (err) {
        steps.push(`Conta de servico ERRO: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    try {
      const folderId = await ensureFolderPath(["_diagnostico"]);
      steps.push(`ensureFolderPath OK: folderId=${folderId}`);
      const testValue = { ping: Date.now() };
      const bytes = new TextEncoder().encode(JSON.stringify(testValue));
      try {
        const fileId = await uploadBytesToDrive({
          parentId: folderId,
          name: "_ping.json",
          mimeType: "application/json",
          bytes,
          overwrite: true,
        });
        steps.push(`uploadBytesToDrive OK: fileId=${fileId}`);
      } catch (uploadErr) {
        steps.push(`uploadBytesToDrive ERRO REAL: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)}`);
      }
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

    const { loadLabStateFromDrive } = await import("@/lib/labState.functions");
    const { hasDriveCredentials } = await import("@/lib/driveStorage");
    const { upsertOSFn, upsertAmostraFn, upsertEnsaioFn } = await import("@/lib/lab-entities.functions");

    const diag: string[] = [];
    diag.push(`hasDriveCredentials(): ${hasDriveCredentials()}`);

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
      try {
        await upsertOSFn({
          data: {
            id: os.id,
            numero: os.numero || "",
            client: os.client ?? undefined,
            workNumber: os.workNumber ?? undefined,
            local: os.local ?? undefined,
            operator: os.operator ?? undefined,
            technicalResp: os.technicalResp ?? undefined,
            revision: os.revision ?? undefined,
            createdAt: os.createdAt || new Date().toISOString(),
            updatedAt: os.updatedAt || new Date().toISOString(),
          },
        });
      } catch (err) {
        errors.push(`OS ${os.id} (${os.numero}): ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      osCount++;

      for (const am of os.amostras ?? []) {
        if (!am?.id) continue;
        try {
          await upsertAmostraFn({
            data: {
              id: am.id,
              osId: os.id,
              reportNumber: am.reportNumber ?? undefined,
              borehole: am.borehole ?? undefined,
              depth: am.depth ?? undefined,
              description: am.description ?? undefined,
              granulometricDescription: am.granulometricDescription ?? undefined,
              code: am.code ?? undefined,
              sampleType: am.sampleType ?? undefined,
              materialType: am.materialType ?? undefined,
              coords: am.coords ?? null,
              photos: am.photos ?? [],
              createdAt: am.createdAt || new Date().toISOString(),
              updatedAt: am.updatedAt || new Date().toISOString(),
            },
          });
        } catch (err) {
          errors.push(`Amostra ${am.id} (OS ${os.numero}): ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
        amCount++;

        for (const en of am.ensaios ?? []) {
          if (!en?.id) continue;
          try {
            await upsertEnsaioFn({
              data: {
                id: en.id,
                amostraId: am.id,
                tipo: en.tipo || "cisalhamento-direto",
                status: en.status ?? undefined,
                label: en.label ?? undefined,
                nome: en.nome ?? undefined,
                sigla: en.sigla ?? undefined,
                operator: en.operator ?? undefined,
                photos: en.photos ?? [],
                payload: en.payload ?? null,
                createdAt: en.createdAt || new Date().toISOString(),
                updatedAt: en.updatedAt || new Date().toISOString(),
              },
            });
          } catch (err) {
            errors.push(`Ensaio ${en.id} (amostra ${am.code || am.reportNumber}): ${err instanceof Error ? err.message : String(err)}`);
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
