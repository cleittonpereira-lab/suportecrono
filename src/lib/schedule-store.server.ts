import fs from "fs";
import path from "path";

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

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE_PATH = path.join(DATA_DIR, "schedule_edits.json");

export function readScheduleStore(): ScheduleStoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(FILE_PATH)) {
      const content = fs.readFileSync(FILE_PATH, "utf-8");
      return JSON.parse(content) as ScheduleStoreData;
    }
  } catch (err) {
    console.error("Error reading schedule_edits.json:", err);
  }
  return { edits: {}, newRows: [], entreguesRows: [] };
}

export function writeScheduleStore(data: ScheduleStoreData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing schedule_edits.json:", err);
  }
}
