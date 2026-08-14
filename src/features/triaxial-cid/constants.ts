// Paleta e constantes físicas para o módulo de Triaxial CID.
// Reaproveita a mesma linguagem visual da feature de adensamento.

export const BRAND = "#141414";   // preto Suporte
export const ACCENT = "#E5A832";  // amarelo Suporte
export const GRID = "#e5e7eb";
export const AXIS = "#111827";
export const SUB = "#6b7280";

// Cores para até 5 corpos de prova
export const CP_COLORS = [
  "#141414", // CP1 preto
  "#E5A832", // CP2 amarelo
  "#2563eb", // CP3 azul
  "#16a34a", // CP4 verde
  "#dc2626", // CP5 vermelho
];

// γw padrão [kN/m³]
export const GAMMA_W_KN = 9.81;
// γw [kPa/cm]
export const GAMMA_W_CM = 0.0981;

// Módulo e espessura de membrana típicos (látex) — ASTM D7181 §12.5
export const MEMBRANE_E_DEFAULT_KPA = 1400; // Em [kPa]
export const MEMBRANE_T_DEFAULT_MM = 0.3;   // tm [mm]

// Critério de saturação (B mínimo)
export const B_TARGET = 0.95;