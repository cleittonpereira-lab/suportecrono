import { readDriveJson, writeDriveJson } from "./driveStorage";

export interface ScheduleEdit {
  rowIndex?: number;
  os?: string;
  dataPostagem?: string;
  tomador?: string;
  setor?: string;
  laboratorio?: string;
  dataEntrega?: string;
  escopo?: string;
  volumeComp?: string;
  volumeCaract?: string;
  mctc?: string;
  mrs?: string;
  movedToEntregues?: boolean;
}

export interface ScheduleStoreData {
  edits: Record<string, ScheduleEdit>; // key by os or rowIndex
  newRows: ScheduleEdit[];
  entreguesRows: ScheduleEdit[];
}

const DRIVE_FILENAME = "schedule_edits.json";

export async function readScheduleStore(): Promise<ScheduleStoreData> {
  try {
    const data = await readDriveJson<ScheduleStoreData>(DRIVE_FILENAME);
    if (data) return data;
  } catch (err) {
    console.error("Error reading schedule_edits.json from Drive:", err);
  }
  return { edits: {}, newRows: [], entreguesRows: [] };
}

export async function writeScheduleStore(data: ScheduleStoreData): Promise<void> {
  try {
    await writeDriveJson(DRIVE_FILENAME, data);
  } catch (err) {
    console.error("Error writing schedule_edits.json to Drive:", err);
  }
}
