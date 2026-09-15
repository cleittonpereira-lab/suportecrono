/**
 * Leitura do Cronograma do laboratório (aba "CRONOGRAMA LABORATÓRIO" e aba
 * "OS ENTREGUES") — SÓ SERVIDOR. Usada pelas server functions de
 * sheets.functions.ts (que guardam o cache de 15 s) e pelo Painel do
 * coordenador no agendamento, onde não há sessão.
 */
import { fetchDirectGoogleSheet } from "./sheets-read.server";
import { readScheduleStore } from "./schedule-store.server";
import { isGoogleAuthConfigured } from "./google-auth.server";
import {
  DEFAULT_SCHEDULE_ROWS,
  ENTREGUES_SHEET_NAME,
  SHEET_NAME,
  SPREADSHEET_ID,
  normalizeSetor,
  type EntregueRow,
  type ScheduleRow,
} from "./sheets.functions";

export async function lerCronogramaSemCache(): Promise<{ title: string; sheetName: string; headers: string[]; rows: ScheduleRow[] }> {
  let parsed: ScheduleRow[] = [];
  if (isGoogleAuthConfigured()) {
    try {
      const data = await fetchDirectGoogleSheet(SPREADSHEET_ID, SHEET_NAME);
      const rows = data.values ?? [];
      const dataRows = rows.slice(4);

      parsed = dataRows
        .map((row, idx) => ({ row, sheetRow: idx + 5 }))
        .filter(({ row }) => (row[2] && row[2].trim()) || (row[3] && row[3].trim()) || (row[5] && row[5].trim()) || (row[6] && row[6].trim()))
        .map(({ row, sheetRow }) => ({
          rowIndex: sheetRow,
          delta: row[0] ?? "",
          dataPostagem: row[1] ?? "",
          tomador: row[2] ?? "",
          os: row[3] ?? "",
          setor: normalizeSetor(row[4] ?? ""),
          laboratorio: row[5] ?? "",
          dataEntrega: row[6] ?? "",
          volumeComp: row[7] ?? "",
          volumeCaract: row[8] ?? "",
          mctc: row[9] ?? "",
          mrs: row[10] ?? "",
          escopo: row[15] ?? "",
        }));
    } catch {
      parsed = [...DEFAULT_SCHEDULE_ROWS];
    }
  } else {
    parsed = [...DEFAULT_SCHEDULE_ROWS];
  }

  const store = await readScheduleStore();
  const finalRows = parsed
    .filter((r) => {
      const edit = store.edits[String(r.rowIndex)] || store.edits[r.os];
      return !edit?.movedToEntregues;
    })
    .map((r) => {
      const edit = store.edits[String(r.rowIndex)] || store.edits[r.os];
      if (edit) {
        return {
          ...r,
          dataPostagem: edit.dataPostagem !== undefined ? edit.dataPostagem : r.dataPostagem,
          setor: edit.setor !== undefined ? normalizeSetor(edit.setor) : r.setor,
          laboratorio: edit.laboratorio !== undefined ? edit.laboratorio : r.laboratorio,
          dataEntrega: edit.dataEntrega !== undefined ? edit.dataEntrega : r.dataEntrega,
          escopo: edit.escopo !== undefined ? edit.escopo : r.escopo,
        };
      }
      return r;
    });

  // Adiciona linhas novas criadas localmente
  store.newRows.forEach((nr, idx) => {
    if (!nr.movedToEntregues) {
      finalRows.push({
        rowIndex: nr.rowIndex || 999000 + idx,
        delta: "",
        dataPostagem: nr.dataPostagem || "",
        tomador: nr.tomador || "",
        os: nr.os || "",
        setor: normalizeSetor(nr.setor || ""),
        laboratorio: nr.laboratorio || "",
        dataEntrega: nr.dataEntrega || "",
        volumeComp: nr.volumeComp || "",
        volumeCaract: nr.volumeCaract || "",
        mctc: nr.mctc || "",
        mrs: nr.mrs || "",
        escopo: nr.escopo || "",
      });
    }
  });

  return {
    title: "GERAL - CRONOGRAMAS (LAB)",
    sheetName: SHEET_NAME,
    headers: [
      "DELTA",
      "DATA POSTAGEM",
      "TOMADOR",
      "OS",
      "SETOR",
      "LABORATÓRIO",
      "DATA ENTREGA",
      "VOL. COMP.",
      "VOL. CARACT.",
      "MCT.C",
      "MR.S",
      "ESCOPO",
    ],
    rows: finalRows,
  };
}

export async function lerEntregues(): Promise<{ title: string; sheetName: string; rows: EntregueRow[] }> {
  let parsed: EntregueRow[] = [];
  if (isGoogleAuthConfigured()) {
    try {
      const data = await fetchDirectGoogleSheet(SPREADSHEET_ID, ENTREGUES_SHEET_NAME);
      const rows = data.values ?? [];
      const dataRows = rows.slice(2);

      parsed = dataRows
        .filter((row) => (row[2] && row[2].trim()) || (row[3] && row[3].trim()) || (row[5] && row[5].trim()))
        .map((row) => ({
          delta: row[0] ?? "",
          dataPostagem: row[1] ?? "",
          tomador: row[2] ?? "",
          os: row[3] ?? "",
          setor: normalizeSetor(row[4] ?? ""),
          laboratorio: row[5] ?? "",
          dataProgramada: row[6] ?? "",
          volumeComp: row[7] ?? "",
          volumeCaract: row[8] ?? "",
          volumeEspec: row[9] ?? "",
          capacidade: row[10] ?? "",
          escopo: row[11] ?? "",
        }));
    } catch {
      parsed = [];
    }
  }

  // Mescla itens movidos para entregues no armazenamento persistente
  const store = await readScheduleStore();
  store.entreguesRows.forEach((r) => {
    parsed.push({
      delta: r.volumeComp || "",
      dataPostagem: r.dataPostagem || "",
      tomador: r.tomador || "",
      os: r.os || "",
      setor: normalizeSetor(r.setor || ""),
      laboratorio: r.laboratorio || "",
      dataProgramada: r.dataEntrega || "",
      volumeComp: r.volumeComp || "",
      volumeCaract: r.volumeCaract || "",
      volumeEspec: "",
      capacidade: "",
      escopo: r.escopo || "",
    });
  });

  return { title: "OS ENTREGUES", sheetName: ENTREGUES_SHEET_NAME, rows: parsed };
}
