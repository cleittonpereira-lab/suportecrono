/**
 * Formulações e convenções do Triaxial UU (ASTM D2850), usadas pelo
 * PDF e pelo Excel do relatório. Ensaio em tensões totais, sem adensamento,
 * sem drenagem e sem poropressão: o volume do CP não muda (εv = 0).
 */

export interface LinhaGlossario {
  sym: string;
  nome: string;
  formula: string;
  unidade?: string;
  ref?: string;
}

export interface GrupoGlossario {
  titulo: string;
  linhas: LinhaGlossario[];
}

export const GLOSSARIO_UU_1: GrupoGlossario[] = [
  {
    titulo: "Moldagem — Índices Físicos Iniciais",
    linhas: [
      { sym: "A₀", nome: "Área inicial", formula: "A₀ = π·D₀²/4", unidade: "cm²" },
      { sym: "V₀", nome: "Volume inicial", formula: "V₀ = A₀·H₀", unidade: "cm³" },
      { sym: "w₀", nome: "Umidade inicial (cápsulas)", formula: "w = (m_úmida − m_seca)/(m_seca − tara)·100", unidade: "%" },
      { sym: "γ", nome: "Peso específico natural", formula: "γ = (m_úmida/V₀)·9,81", unidade: "kN/m³" },
      { sym: "γd", nome: "Peso específico seco", formula: "γd = (m_seca/V₀)·9,81", unidade: "kN/m³" },
      { sym: "e₀", nome: "Índice de vazios inicial", formula: "e₀ = Gs·γw/γd − 1", unidade: "—" },
      { sym: "Sr₀", nome: "Saturação inicial", formula: "Sr = (w·Gs)/e · 100", unidade: "%" },
    ],
  },
  {
    titulo: "Cisalhamento — Deformação e Área (volume constante)",
    linhas: [
      { sym: "εa", nome: "Deformação axial específica", formula: "εa = Δh / H₀ · 100", unidade: "%" },
      { sym: "εv", nome: "Deformação volumétrica", formula: "εv = 0 (ensaio não drenado: o volume não muda)", unidade: "%" },
      { sym: "A", nome: "Área corrigida (volume constante)", formula: "A = A₀ / (1 − εa)", unidade: "cm²", ref: "ASTM D2850 §11" },
      { sym: "Dc", nome: "Diâmetro corrigido", formula: "Dc = √(4·A/π)", unidade: "mm" },
    ],
  },
];

export const GLOSSARIO_UU_2: GrupoGlossario[] = [
  {
    titulo: "Cisalhamento — Correções ISO 17892-9 (membrana e papel filtro)",
    linhas: [
      { sym: "(Δσv)m", nome: "Correção de membrana (vertical)", formula: "4·tm·Em/Dc · εa   (εv = 0)", unidade: "kPa", ref: "ISO §7.2.3 (5)" },
      { sym: "(Δσv)fp", nome: "Papel filtro (εsv ≤ 2%)", formula: "εa·Kfp·Pfp / (0,005·Dc) ;  Pfp = π·Dc", unidade: "kPa", ref: "ISO §7.2.4 (7)" },
      { sym: "(Δσv)fp", nome: "Papel filtro (εsv > 2%)", formula: "Kfp·Pfp / (0,25·Dc)", unidade: "kPa", ref: "ISO §7.2.4 (8)" },
    ],
  },
  {
    titulo: "Cisalhamento — Tensões totais (sem poropressão)",
    linhas: [
      { sym: "P", nome: "Força axial (célula de carga)", formula: "P [N] = leitura [kgf] · 9,80665", unidade: "N" },
      { sym: "F_atr", nome: "Atrito do pistão (desconto em P)", formula: "P_ef = P − F_atr[kgf]·9,80665", unidade: "N", ref: "ASTM §11.4" },
      { sym: "σ₃", nome: "Tensão confinante (total)", formula: "σ₃ = σ₃,alvo  (ou σ₃ corrigida lida)", unidade: "kPa" },
      { sym: "σd", nome: "Tensão desviadora", formula: "σd = (P_ef + K)/A·10 − σ₃·a/A − (Δσv)m − (Δσv)fp", unidade: "kPa" },
      { sym: "σ₁", nome: "Tensão principal maior (total)", formula: "σ₁ = σ₃ + σd", unidade: "kPa" },
    ],
  },
  {
    titulo: "Cisalhamento — Invariantes (t–s, tensões totais)",
    linhas: [
      { sym: "t", nome: "Semi-desvio", formula: "t = (σ₁ − σ₃)/2 = σd/2", unidade: "kPa", ref: "ISO Anexo B" },
      { sym: "s", nome: "Tensão média total", formula: "s = (σ₁ + σ₃)/2", unidade: "kPa", ref: "ISO Anexo B" },
      { sym: "σ₁/σ₃", nome: "Razão de tensões totais", formula: "σ₁ / σ₃", unidade: "—" },
      { sym: "E", nome: "Módulo de deformabilidade secante", formula: "E = q / εa   (εa em fração)", unidade: "MPa" },
    ],
  },
  {
    titulo: "Envoltória — Resistência não drenada (φu = 0)",
    linhas: [
      { sym: "Su", nome: "Resistência não drenada do CP", formula: "Su = (σ₁ − σ₃)_f / 2 = t_f", unidade: "kPa", ref: "ASTM D2850" },
      { sym: "cu", nome: "Coesão não drenada (envoltória)", formula: "cu = Su médio = Σ Su / n", unidade: "kPa" },
      { sym: "φu", nome: "Ângulo de atrito não drenado", formula: "φu = 0 (envoltória horizontal)", unidade: "°" },
      { sym: "s(Su)", nome: "Desvio padrão de Su", formula: "√[ Σ (Su − cu)² / (n − 1) ]", unidade: "kPa" },
    ],
  },
  {
    titulo: "Etapa final — Cápsulas e índices",
    linhas: [
      { sym: "w_f", nome: "Umidade final (média das cápsulas)", formula: "w_f = média[(m_úmida−m_seca)/(m_seca−tara)]·100", unidade: "%" },
      { sym: "e_f", nome: "Índice de vazios final", formula: "e_f = e₀   (volume constante)", unidade: "—" },
      { sym: "Sr,f", nome: "Saturação final", formula: "Sr,f = w_f·Gs / e_f · 100", unidade: "%" },
    ],
  },
];

export const GLOSSARIO_UU_CONVENCAO =
  "Convenção de unidades: dimensões em mm/cm, massas em g, volumes em cm³, forças em kN, tensões em kPa, ângulos em graus. Deformações εa em %; nas fórmulas entram em fração (dividir por 100). γw = 9,81 kN/m³. Ensaio em tensões totais: σ e τ sem descontar poropressão; convenção MIT (diagrama t–s) conforme ISO 17892-9:2018 Anexo B.";

export const GLOSSARIO_UU_REFERENCIAS =
  "Referências normativas: ASTM D2850-15 — Unconsolidated-Undrained Triaxial Compression Test on Cohesive Soils (correções de membrana e papel filtro conforme ISO 17892-9:2018; Anexo B para a convenção MIT).";
