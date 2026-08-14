/**
 * Catálogos simples (equipamentos, operadores) persistidos em localStorage.
 * Escopo global do app — compartilhado entre todos os ensaios.
 */
import { useSyncExternalStore } from "react";

type CatalogKind = "equipments" | "operators" | "typists";

const KEY = "suporte-infra:catalogs";
const DEFAULTS: Record<CatalogKind, string[]> = {
  equipments: ["Triaxial"],
  operators: ["Rosângela de Oliveira"],
  typists: ["Rosângela de Oliveira"],
};

type State = Record<CatalogKind, string[]>;

function read(): State {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      equipments: unique([...(parsed.equipments ?? []), ...DEFAULTS.equipments]),
      operators: unique([...(parsed.operators ?? []), ...DEFAULTS.operators]),
      typists: unique([...((parsed as State).typists ?? []), ...DEFAULTS.typists]),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function unique(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const t = s.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

let state: State = read();
const listeners = new Set<() => void>();

function emit() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignora quota */
  }
  listeners.forEach((l) => l());
}

export const catalog = {
  get(kind: CatalogKind): string[] {
    return state[kind];
  },
  add(kind: CatalogKind, value: string) {
    const v = value.trim();
    if (!v) return;
    if (state[kind].some((s) => s.toLowerCase() === v.toLowerCase())) return;
    state = { ...state, [kind]: [...state[kind], v] };
    emit();
  },
  remove(kind: CatalogKind, value: string) {
    state = { ...state, [kind]: state[kind].filter((s) => s !== value) };
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useCatalog(kind: CatalogKind): string[] {
  return useSyncExternalStore(
    catalog.subscribe,
    () => catalog.get(kind),
    () => DEFAULTS[kind],
  );
}