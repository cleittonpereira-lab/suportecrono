export interface AnelItem {
  id: string;
  numero: string; // Ex: "AN-01", "AN-02", "AD-R01"
  ensaio: "cisalhamento" | "adensamento" | "ambos";
  secao: "circular" | "quadrada";
  diametro_mm?: number; // Para circular (ex: 50.0, 60.0, 70.0, 100.0)
  lado_mm?: number; // Para quadrada (ex: 60.0, 100.0)
  altura_mm: number; // Ex: 20.0, 25.0
  massa_g: number; // Massa do anel vazio em gramas (tara)
  area_cm2: number;
  volume_cm3: number;
  material?: string; // Ex: "Aço Inox", "Latão", "Alumínio"
  observacoes?: string;
}

const STORAGE_KEY = "suporte_infra_catalogo_aneis_v1";

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

export const DEFAULT_ANEIS: AnelItem[] = [
  {
    id: "anel_cd_01",
    numero: "AN-01",
    ensaio: "cisalhamento",
    secao: "circular",
    diametro_mm: 60.0,
    altura_mm: 20.0,
    massa_g: 112.45,
    area_cm2: 28.2743,
    volume_cm3: 56.5487,
    material: "Aço Inox",
    observacoes: "Anel Padrão Cisalhamento Direto Ø60mm",
  },
  {
    id: "anel_cd_02",
    numero: "AN-02",
    ensaio: "cisalhamento",
    secao: "circular",
    diametro_mm: 60.0,
    altura_mm: 20.0,
    massa_g: 113.10,
    area_cm2: 28.2743,
    volume_cm3: 56.5487,
    material: "Aço Inox",
    observacoes: "Anel Padrão Cisalhamento Direto Ø60mm",
  },
  {
    id: "anel_cd_03",
    numero: "AN-03",
    ensaio: "cisalhamento",
    secao: "circular",
    diametro_mm: 60.0,
    altura_mm: 20.0,
    massa_g: 112.80,
    area_cm2: 28.2743,
    volume_cm3: 56.5487,
    material: "Aço Inox",
    observacoes: "Anel Padrão Cisalhamento Direto Ø60mm",
  },
  {
    id: "anel_cd_04",
    numero: "AN-04",
    ensaio: "cisalhamento",
    secao: "circular",
    diametro_mm: 50.0,
    altura_mm: 20.0,
    massa_g: 94.30,
    area_cm2: 19.6350,
    volume_cm3: 39.2699,
    material: "Aço Inox",
    observacoes: "Anel Cisalhamento Direto Ø50mm",
  },
  {
    id: "anel_cd_05",
    numero: "AN-QUAD-01",
    ensaio: "cisalhamento",
    secao: "quadrada",
    lado_mm: 60.0,
    altura_mm: 20.0,
    massa_g: 128.50,
    area_cm2: 36.0000,
    volume_cm3: 72.0000,
    material: "Aço Inox",
    observacoes: "Anel Seção Quadrada 60x60mm",
  },
  {
    id: "anel_ad_01",
    numero: "AD-R01",
    ensaio: "adensamento",
    secao: "circular",
    diametro_mm: 70.0,
    altura_mm: 20.0,
    massa_g: 135.20,
    area_cm2: 38.4845,
    volume_cm3: 76.9690,
    material: "Aço Inox",
    observacoes: "Anel Padrão Adensamento Edométrico Ø70mm",
  },
  {
    id: "anel_ad_02",
    numero: "AD-R02",
    ensaio: "adensamento",
    secao: "circular",
    diametro_mm: 50.0,
    altura_mm: 20.0,
    massa_g: 98.40,
    area_cm2: 19.6350,
    volume_cm3: 39.2699,
    material: "Aço Inox",
    observacoes: "Anel Adensamento Edométrico Ø50mm",
  },
];

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

export function deleteAnelFromCatalog(id: string): void {
  const list = getAneisCatalog();
  const next = list.filter((a) => a.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
