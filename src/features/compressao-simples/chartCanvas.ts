/**
 * Renderiza a curva Tensão × Deformação Axial (resultado completo) em Canvas
 * puro — mesmo padrão de features/oedometer/chartCanvas.ts — pra ancorar
 * como imagem na planilha Excel exportada.
 */
export function generateStressStrainCanvas(
  pontos: { deformacaoPct: number; tensaoKPa: number }[],
  picoPct: number | null,
  picoKPa: number | null,
  width = 1000,
  height = 460,
): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const padLeft = 70;
  const padRight = 40;
  const padTop = 30;
  const padBottom = 55;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  if (pontos.length === 0) return canvas.toDataURL("image/png");

  const maxDef = Math.max(...pontos.map((p) => p.deformacaoPct), 1) * 1.05;
  const maxTensao = Math.max(...pontos.map((p) => p.tensaoKPa), 1) * 1.1;

  const toX = (d: number) => padLeft + (d / maxDef) * plotW;
  const toY = (t: number) => padTop + plotH - (t / maxTensao) * plotH;

  // Grade de fundo
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  const stepsX = 8;
  for (let i = 0; i <= stepsX; i++) {
    const d = (maxDef / stepsX) * i;
    const x = toX(d);
    ctx.beginPath();
    ctx.moveTo(x, padTop);
    ctx.lineTo(x, padTop + plotH);
    ctx.stroke();
    ctx.fillStyle = "#475569";
    ctx.font = "10px Calibri, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(d.toFixed(1), x, padTop + plotH + 16);
  }
  const stepsY = 6;
  for (let i = 0; i <= stepsY; i++) {
    const t = (maxTensao / stepsY) * i;
    const y = toY(t);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();
    ctx.fillStyle = "#475569";
    ctx.font = "10px Calibri, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(t.toFixed(0), padLeft - 8, y + 3);
  }

  // Bordas
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(padLeft, padTop, plotW, plotH);

  // Rótulos dos eixos
  ctx.fillStyle = "#141414";
  ctx.font = "bold 12px Calibri, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Deformação Axial — ε (%)", padLeft + plotW / 2, height - 12);
  ctx.save();
  ctx.translate(20, padTop + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Tensão — σ (kPa)", 0, 0);
  ctx.restore();

  // Curva
  ctx.beginPath();
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2.5;
  pontos.forEach((p, i) => {
    const x = toX(p.deformacaoPct);
    const y = toY(p.tensaoKPa);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Pico
  if (picoPct != null && picoKPa != null) {
    const x = toX(picoPct);
    const y = toY(picoKPa);
    ctx.beginPath();
    ctx.fillStyle = "#dc2626";
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#dc2626";
    ctx.font = "bold 10px Calibri, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`qu = ${picoKPa.toFixed(0)} kPa`, x + 8, y - 6);
  }

  return canvas.toDataURL("image/png");
}
