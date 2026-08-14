/**
 * Espelha um ensaio M.ESP.A digitalizado no `labStore`, criando OS/Amostra/Ensaio
 * se necessário e persistindo o payload {dets, obs}. Assim o ensaio aparece em
 * "OS / Amostras" e na lista dedicada de M.ESP.A, e pode ser reaberto pelo
 * editor padrão (rota `/relatorio/os/.../ensaio/...`).
 */
import { labStore } from "@/features/lab/store";
import type { DeterminacaoInput } from "./calc";
import type { Identificacao } from "./ui";

function norm(s?: string | null) {
  return (s || "").trim().toLowerCase();
}

export function mirrorMEspAToLabStore(
  ident: Identificacao,
  payload: { dets: DeterminacaoInput[]; obs: string },
  status: "rascunho" | "processando" | "concluido" = "processando",
): { osId: string; amId: string; enId: string } {
  const state = labStore.get();
  let os = state.os.find((o) => norm(o.numero) === norm(ident.os));
  if (!os) {
    os = labStore.createOS({
      numero: ident.os || "OS-M.ESP.A",
      client: ident.tomador || "",
      local: ident.obra || "",
    });
  }
  let am = os.amostras.find(
    (a) => norm(a.code) === norm(ident.amostraCodigo) || norm(a.reportNumber) === norm(ident.amostraCodigo),
  );
  if (!am) {
    am = labStore.addAmostra(os.id, {
      reportNumber: ident.amostraCodigo,
      code: ident.amostraCodigo,
      description: ident.amostraDescricao || "",
    });
  }
  let en = am.ensaios.find((e) => e.tipo === "mesp-a");
  if (!en) {
    en = labStore.addEnsaio(os.id, am.id, "mesp-a", "M.ESP.A · " + (ident.amostraCodigo || ""));
  }
  labStore.patchEnsaio(os.id, am.id, en.id, { payload, status });
  return { osId: os.id, amId: am.id, enId: en.id };
}