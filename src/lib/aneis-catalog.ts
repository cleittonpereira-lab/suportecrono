export interface AnelItem {
  id: string;
  numero: string; // Ex: "1", "AN-01", "3", "AD-R01"
  ensaio: "cisalhamento" | "adensamento" | "ambos";
  secao: "circular" | "quadrada";
  diametro_mm?: number; // Para circular (ex: 50.10, 61.67, 71.20)
  lado_mm?: number; // Para quadrada (ex: 60.14, 60.26)
  altura_mm: number; // Ex: 20.02, 19.70
  massa_g: number; // Massa do anel vazio em gramas (tara)
  area_cm2: number;
  volume_cm3: number;
  material?: string; // Ex: "Aço Inox", "Latão", "Alumínio"
  observacoes?: string;
}

const STORAGE_KEY = "suporte_infra_catalogo_aneis_v2";

export function calculateRingGeometry(
  secao: "circular" | "quadrada",
  dimensao_mm: number,
  altura_mm: number,
): { area_cm2: number; volume_cm3: number } {
  let area_cm2 = 0;
  if (secao === "circular") {
    const raio_cm = (dimensao_mm / 10) / 2;
    area_cm2 = Math.PI * Math.pow(raio_cm, 2);
  } else {
    const lado_cm = dimensao_mm / 10;
    area_cm2 = Math.pow(lado_cm, 2);
  }
  const altura_cm = altura_mm / 10;
  const volume_cm3 = area_cm2 * altura_cm;

  return {
    area_cm2: Number(area_cm2.toFixed(4)),
    volume_cm3: Number(volume_cm3.toFixed(4)),
  };
}

export const USER_INITIAL_ANEIS: Omit<AnelItem, "id" | "area_cm2" | "volume_cm3">[] = [
  { numero: "1", ensaio: "adensamento", secao: "circular", diametro_mm: 50.10, altura_mm: 20.02, massa_g: 107.31, observacoes: "Anel Adensamento Ø50mm" },
  { numero: "3", ensaio: "adensamento", secao: "circular", diametro_mm: 71.20, altura_mm: 20.20, massa_g: 149.78, observacoes: "Anel Adensamento Ø70mm" },
  { numero: "4", ensaio: "adensamento", secao: "circular", diametro_mm: 79.60, altura_mm: 20.12, massa_g: 193.28, observacoes: "Anel Adensamento Ø80mm" },
  { numero: "6", ensaio: "cisalhamento", secao: "quadrada", lado_mm: 60.14, altura_mm: 19.70, massa_g: 95.43, observacoes: "Anel Quadrado 60x60mm" },
  { numero: "8", ensaio: "cisalhamento", secao: "circular", diametro_mm: 61.67, altura_mm: 17.67, massa_g: 35.94, observacoes: "Anel Cisalhamento Ø60mm" },
  { numero: "9", ensaio: "cisalhamento", secao: "circular", diametro_mm: 61.04, altura_mm: 17.97, massa_g: 36.56, observacoes: "Anel Cisalhamento Ø60mm" },
  { numero: "11", ensaio: "cisalhamento", secao: "circular", diametro_mm: 61.88, altura_mm: 19.71, massa_g: 41.72, observacoes: "Anel Cisalhamento Ø60mm" },
  { numero: "12", ensaio: "cisalhamento", secao: "circular", diametro_mm: 61.60, altura_mm: 19.64, massa_g: 43.85, observacoes: "Anel Cisalhamento Ø60mm" },
  { numero: "13", ensaio: "cisalhamento", secao: "circular", diametro_mm: 61.39, altura_mm: 19.90, massa_g: 42.73, observacoes: "Anel Cisalhamento Ø60mm" },
  { numero: "15", ensaio: "cisalhamento", secao: "circular", diametro_mm: 61.51, altura_mm: 19.85, massa_g: 44.21, observacoes: "Anel Cisalhamento Ø60mm" },
  { numero: "16", ensaio: "cisalhamento", secao: "circular", diametro_mm: 61.54, altura_mm: 19.66, massa_g: 42.44, observacoes: "Anel Cisalhamento Ø60mm" },
  { numero: "17", ensaio: "ambos", secao: "circular", diametro_mm: 50.21, altura_mm: 19.93, massa_g: 46.85, observacoes: "Anel Ø50mm (Adensamento / Cisalhamento)" },
  { numero: "18", ensaio: "ambos", secao: "circular", diametro_mm: 50.09, altura_mm: 19.93, massa_g: 46.85, observacoes: "Anel Ø50mm (Adensamento / Cisalhamento)" },
  { numero: "19", ensaio: "cisalhamento", secao: "quadrada", lado_mm: 60.26, altura_mm: 19.40, massa_g: 51.55, observacoes: "Anel Quadrado 60x60mm" },
  { numero: "20", ensaio: "cisalhamento", secao: "quadrada", lado_mm: 60.20, altura_mm: 20.19, massa_g: 100.12, observacoes: "Anel Quadrado 60x60mm" },
];

export const DEFAULT_ANEIS: AnelItem[] = USER_INITIAL_ANEIS.map((a, idx) => {
  const dim = a.secao === "circular" ? (a.diametro_mm || 60) : (a.lado_mm || 60);
  const geo = calculateRingGeometry(a.secao, dim, a.altura_mm);
  return {
    ...a,
    id: `anel_${idx + 1}_${a.numero}`,
    area_cm2: geo.area_cm2,
    volume_cm3: geo.volume_cm3,
    material: "Aço Inox",
  };
});

export function getAneisCatalog(): AnelItem[] {
  if (typeof window === "undefined") return DEFAULT_ANEIS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ANEIS));
      return DEFAULT_ANEIS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return DEFAULT_ANEIS;
  } catch {
    return DEFAULT_ANEIS;
  }
}

export function saveAnelToCatalog(item: Omit<AnelItem, "id" | "area_cm2" | "volume_cm3"> & { id?: string }): AnelItem {
  const list = getAneisCatalog();
  const dim = item.secao === "circular" ? (item.diametro_mm || 60) : (item.lado_mm || 60);
  const geo = calculateRingGeometry(item.secao, dim, item.altura_mm || 20);

  let updated: AnelItem;
  if (item.id) {
    updated = {
      ...item,
      id: item.id,
      area_cm2: geo.area_cm2,
      volume_cm3: geo.volume_cm3,
    };
    const next = list.map((a) => (a.id === item.id ? updated : a));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } else {
    updated = {
      ...item,
      id: `anel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      area_cm2: geo.area_cm2,
      volume_cm3: geo.volume_cm3,
    };
    const next = [...list, updated];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return updated;
}

export function saveMultipleAneisToCatalog(items: Omit<AnelItem, "id" | "area_cm2" | "volume_cm3">[], replaceAll: boolean = false): AnelItem[] {
  const list = replaceAll ? [] : getAneisCatalog();
  const created: AnelItem[] = items.map((item, idx) => {
    const dim = item.secao === "circular" ? (item.diametro_mm || 60) : (item.lado_mm || 60);
    const geo = calculateRingGeometry(item.secao, dim, item.altura_mm || 20);
    return {
      ...item,
      id: `anel_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      area_cm2: geo.area_cm2,
      volume_cm3: geo.volume_cm3,
    };
  });

  const next = [...list, ...created];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteAnelFromCatalog(id: string): void {
  const list = getAneisCatalog();
  const next = list.filter((a) => a.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function syncAneisToRemote(list: AnelItem[]) {
  try {
    import("@/lib/draft.functions").then((mod) => {
      mod.saveSharedDraft({ data: { scopeId: "config/aneis_catalog", payload: { aneis: list } } });
    });
  } catch {}
}

export async function fetchRemoteAneisCatalog(): Promise<AnelItem[] | null> {
  try {
    const mod = await import("@/lib/draft.functions");
    const res = await mod.loadSharedDraft({ data: { scopeId: "config/aneis_catalog" } });
    if (res?.success && res.payload?.aneis && Array.isArray(res.payload.aneis)) {
      if (typeof window !== "undefined") {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(res.payload.aneis)); } catch {}
      }
      return res.payload.aneis as AnelItem[];
    }
  } catch {}
  return null;
}
