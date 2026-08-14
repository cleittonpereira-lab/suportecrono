// Cor determinística e única por equipamento — cada nome completo gera
// um matiz próprio, então AD-001 e AD-002 terão cores diferentes.
export function equipColor(label: string): { bg: string; text: string; border: string } {
  const key = (label || "").trim().toUpperCase();
  // FNV-1a 32-bit — melhor dispersão que hash multiplicativo simples
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Golden-angle para maximizar separação visual entre matizes vizinhos
  const hue = Math.round(((h % 360) * 137.508) % 360);
  const sat = 65 + (h % 20); // 65–84
  return {
    bg: `hsl(${hue} ${sat}% 92%)`,
    text: `hsl(${hue} ${Math.min(70, sat)}% 28%)`,
    border: `hsl(${hue} ${sat - 10}% 68%)`,
  };
}