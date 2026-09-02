/**
 * Buretas cadastradas (presets locais) — cada bureta física pode ter uma
 * seção levemente irregular, então em vez de uma área constante, guarda-se
 * uma curva de calibração (leitura -> altura acumulada) medida uma vez com
 * régua e reaproveitada em todos os ensaios que usarem aquela bureta.
 *
 * Fica só no localStorage do computador da bancada — não é dado do ensaio
 * em si (ver `PermVCalibracao.curva`, que é copiada de um preset ao
 * selecionar uma bureta, mas pode ser ajustada por ensaio se necessário).
 */
import type { PermVBureta } from "./types";

const KEY = "perm-v:buretas-cadastradas";

export function listBuretas(): PermVBureta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBureta(bureta: PermVBureta): void {
  if (typeof window === "undefined") return;
  const all = listBuretas();
  const idx = all.findIndex((b) => b.id === bureta.id);
  if (idx >= 0) all[idx] = bureta;
  else all.push(bureta);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

export function deleteBureta(id: string): void {
  if (typeof window === "undefined") return;
  const all = listBuretas().filter((b) => b.id !== id);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}
