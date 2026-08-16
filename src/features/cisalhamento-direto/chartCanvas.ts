import type { CDSpecimen, CDSpecimenResults, CDEnvelopeResult } from "./types";

const lineColors = ["#1e40af", "#b45309", "#15803d", "#7e22ce", "#b91c1c", "#0284c7"];

/**
 * Renderiza o gráfico da Envoltória de Mohr-Coulomb em alta resolução para largura total no Excel.
 */
export function generateMohrEnvelopeCanvas(
  results: CDSpecimenResults[],
  specimens: CDSpecimen[],
  envelope: CDEnvelopeResult | null,
  width = 1100,
  height = 550
): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.scale(2, 2);

  // Fundo branco com borda suave
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Margens amplas e equilibradas
  const margin = { top: 55, right: 35, bottom: 65, left: 80 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  // Limite X
  const sigmaVals = results.map((r) => r.sigmaN);
  const maxSigma = sigmaVals.length ? Math.max(...sigmaVals, 100) : 100;
  const xMax = Math.max(100, Math.ceil((maxSigma * 1.25) / 50) * 50);

  // Limite Y
  const tauVals = results.map((r) => r.tauPeak);
  const maxTau = Math.max(
    ...tauVals,
    envelope ? envelope.c + xMax * Math.tan((envelope.phiDeg * Math.PI) / 180) : 100,
    100
  );
  const yMax = Math.max(100, Math.ceil((maxTau * 1.15) / 20) * 20);

  const mapX = (val: number) => margin.left + (val / xMax) * plotW;
  const mapY = (val: number) => margin.top + plotH - (val / yMax) * plotH;

  // Grade (Grid)
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);

  // Linhas verticais
  const xStep = xMax <= 100 ? 25 : xMax <= 250 ? 50 : 100;
  for (let x = 0; x <= xMax; x += xStep) {
    const px = mapX(x);
    ctx.beginPath();
    ctx.moveTo(px, margin.top);
    ctx.lineTo(px, margin.top + plotH);
    ctx.stroke();
  }

  // Linhas horizontais
  const yStep = yMax <= 100 ? 20 : yMax <= 250 ? 50 : 100;
  for (let y = 0; y <= yMax; y += yStep) {
    const py = mapY(y);
    ctx.beginPath();
    ctx.moveTo(margin.left, py);
    ctx.lineTo(margin.left + plotW, py);
    ctx.stroke();
  }

  ctx.setLineDash([]); // Reset linha contínua

  // Eixos X e Y
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + plotH);
  ctx.lineTo(margin.left + plotW, margin.top + plotH);
  ctx.stroke();

  // Ticks e Rótulos Eixo X
  ctx.fillStyle = "#475569";
  ctx.font = "11.5px Calibri, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let x = 0; x <= xMax; x += xStep) {
    const px = mapX(x);
    ctx.beginPath();
    ctx.moveTo(px, margin.top + plotH);
    ctx.lineTo(px, margin.top + plotH + 5);
    ctx.stroke();
    ctx.fillText(String(x), px, margin.top + plotH + 8);
  }

  // Ticks e Rótulos Eixo Y
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = 0; y <= yMax; y += yStep) {
    const py = mapY(y);
    ctx.beginPath();
    ctx.moveTo(margin.left - 5, py);
    ctx.lineTo(margin.left, py);
    ctx.stroke();
    ctx.fillText(String(y), margin.left - 8, py);
  }

  // Títulos dos Eixos
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 13px Calibri, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Tensão Normal Efetiva σ'n [kPa]", margin.left + plotW / 2, height - 15);

  ctx.save();
  ctx.translate(22, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Tensão Cisalhante τ [kPa]", 0, 0);
  ctx.restore();

  // Reta da Envoltória
  if (envelope) {
    const y0 = envelope.c;
    const yEnd = envelope.c + xMax * Math.tan((envelope.phiDeg * Math.PI) / 180);

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(mapX(0), mapY(y0));
    ctx.lineTo(mapX(xMax), mapY(yEnd));
    ctx.stroke();
  }

  // Pontos Experimentais dos CPs (Sólidos, Discretos, com Borda Nítida)
  results.forEach((r, i) => {
    const color = specimens[i]?.color || lineColors[i % lineColors.length];
    const px = mapX(r.sigmaN);
    const py = mapY(r.tauPeak);

    ctx.beginPath();
    ctx.arc(px, py, 6, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#0f172a";
    ctx.stroke();
  });

  // Legenda no Topo
  ctx.font = "12px Calibri, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let curX = margin.left + 15;
  const legY = 25;

  if (envelope) {
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(curX, legY);
    ctx.lineTo(curX + 22, legY);
    ctx.stroke();
    curX += 28;

    ctx.fillStyle = "#1e293b";
    ctx.fillText(`Envoltória (c' = ${envelope.c.toFixed(2)} kPa, φ' = ${envelope.phiDeg.toFixed(2)}°)`, curX, legY);
    curX += 260;
  }

  results.forEach((r, i) => {
    const color = specimens[i]?.color || lineColors[i % lineColors.length];
    const name = `${specimens[i]?.displayId ?? `CP-${i + 1}`} (σn = ${r.sigmaN.toFixed(0)} kPa)`;

    ctx.beginPath();
    ctx.arc(curX + 5, legY, 5.5, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#0f172a";
    ctx.stroke();
    curX += 16;

    ctx.fillStyle = "#334155";
    ctx.fillText(name, curX, legY);
    curX += ctx.measureText(name).width + 25;
  });

  return canvas.toDataURL("image/png").split(",")[1];
}

/**
 * Renderiza o gráfico Tensão Cisalhante vs. Deformação Horizontal em alta resolução.
 */
export function generateStressStrainCanvas(
  results: CDSpecimenResults[],
  specimens: CDSpecimen[],
  width = 1100,
  height = 520
): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.scale(2, 2);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const margin = { top: 55, right: 35, bottom: 65, left: 80 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  let maxStrain = 15;
  let maxStress = 100;
  results.forEach((r) => {
    r.curve?.forEach((pt) => {
      if (pt.horizStrainPct > maxStrain) maxStrain = pt.horizStrainPct;
      if (pt.shearStress > maxStress) maxStress = pt.shearStress;
    });
  });
  const xMax = Math.ceil(maxStrain / 5) * 5;
  const yMax = Math.ceil((maxStress * 1.15) / 20) * 20;

  const mapX = (val: number) => margin.left + (val / xMax) * plotW;
  const mapY = (val: number) => margin.top + plotH - (val / yMax) * plotH;

  // Grade
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  for (let x = 0; x <= xMax; x += 2.5) {
    const px = mapX(x);
    ctx.beginPath();
    ctx.moveTo(px, margin.top);
    ctx.lineTo(px, margin.top + plotH);
    ctx.stroke();
  }
  for (let y = 0; y <= yMax; y += yMax <= 100 ? 20 : 50) {
    const py = mapY(y);
    ctx.beginPath();
    ctx.moveTo(margin.left, py);
    ctx.lineTo(margin.left + plotW, py);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Eixos
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + plotH);
  ctx.lineTo(margin.left + plotW, margin.top + plotH);
  ctx.stroke();

  // Ticks X
  ctx.fillStyle = "#475569";
  ctx.font = "11.5px Calibri, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let x = 0; x <= xMax; x += 2.5) {
    const px = mapX(x);
    ctx.beginPath();
    ctx.moveTo(px, margin.top + plotH);
    ctx.lineTo(px, margin.top + plotH + 5);
    ctx.stroke();
    ctx.fillText(x.toFixed(1) + "%", px, margin.top + plotH + 8);
  }

  // Ticks Y
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = 0; y <= yMax; y += yMax <= 100 ? 20 : 50) {
    const py = mapY(y);
    ctx.beginPath();
    ctx.moveTo(margin.left - 5, py);
    ctx.lineTo(margin.left, py);
    ctx.stroke();
    ctx.fillText(String(y), margin.left - 8, py);
  }

  // Títulos
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 13px Calibri, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Deformação Horizontal εh [%]", margin.left + plotW / 2, height - 15);

  ctx.save();
  ctx.translate(22, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Tensão Cisalhante τ [kPa]", 0, 0);
  ctx.restore();

  // Curvas dos CPs
  results.forEach((r, i) => {
    const color = specimens[i]?.color || lineColors[i % lineColors.length];
    if (!r.curve || r.curve.length === 0) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    r.curve.forEach((pt, pIdx) => {
      const px = mapX(pt.horizStrainPct);
      const py = mapY(pt.shearStress);
      if (pIdx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Ponto de pico
    const peakPt = r.curve.find((p) => Math.abs(p.shearStress - r.tauPeak) < 0.01) || r.curve[r.curve.length - 1];
    if (peakPt) {
      const px = mapX(peakPt.horizStrainPct);
      const py = mapY(peakPt.shearStress);
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#0f172a";
      ctx.stroke();
    }
  });

  // Legenda
  ctx.font = "12px Calibri, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let curX = margin.left + 20;
  const legY = 24;

  results.forEach((r, i) => {
    const color = specimens[i]?.color || lineColors[i % lineColors.length];
    const name = `${specimens[i]?.displayId ?? `CP-${i + 1}`} (σn = ${r.sigmaN.toFixed(0)} kPa)`;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(curX, legY);
    ctx.lineTo(curX + 22, legY);
    ctx.stroke();
    curX += 28;

    ctx.fillStyle = "#334155";
    ctx.fillText(name, curX, legY);
    curX += ctx.measureText(name).width + 30;
  });

  return canvas.toDataURL("image/png").split(",")[1];
}

/**
 * Renderiza o gráfico Variação Volumétrica (Deslocamento Vertical vs. Deformação Horizontal).
 */
export function generateVolumeChangeCanvas(
  results: CDSpecimenResults[],
  specimens: CDSpecimen[],
  width = 1100,
  height = 520
): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.scale(2, 2);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const margin = { top: 55, right: 35, bottom: 65, left: 80 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  let maxStrain = 15;
  let minVert = -0.1;
  let maxVert = 0.5;

  results.forEach((r) => {
    r.curve?.forEach((pt) => {
      if (pt.horizStrainPct > maxStrain) maxStrain = pt.horizStrainPct;
      if (pt.vertDispMm < minVert) minVert = pt.vertDispMm;
      if (pt.vertDispMm > maxVert) maxVert = pt.vertDispMm;
    });
  });

  const xMax = Math.ceil(maxStrain / 5) * 5;
  const yMin = Math.floor((minVert - 0.05) * 10) / 10;
  const yMax = Math.ceil((maxVert + 0.05) * 10) / 10;

  const mapX = (val: number) => margin.left + (val / xMax) * plotW;
  const mapY = (val: number) => margin.top + plotH - ((val - yMin) / (yMax - yMin)) * plotH;

  // Grade
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  for (let x = 0; x <= xMax; x += 2.5) {
    const px = mapX(x);
    ctx.beginPath();
    ctx.moveTo(px, margin.top);
    ctx.lineTo(px, margin.top + plotH);
    ctx.stroke();
  }
  for (let y = yMin; y <= yMax; y += 0.1) {
    const py = mapY(y);
    ctx.beginPath();
    ctx.moveTo(margin.left, py);
    ctx.lineTo(margin.left + plotW, py);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Linha Zero
  if (yMin <= 0 && yMax >= 0) {
    const py0 = mapY(0);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(margin.left, py0);
    ctx.lineTo(margin.left + plotW, py0);
    ctx.stroke();
  }

  // Eixos
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top);
  ctx.lineTo(margin.left, margin.top + plotH);
  ctx.lineTo(margin.left + plotW, margin.top + plotH);
  ctx.stroke();

  // Ticks X
  ctx.fillStyle = "#475569";
  ctx.font = "11.5px Calibri, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let x = 0; x <= xMax; x += 2.5) {
    const px = mapX(x);
    ctx.beginPath();
    ctx.moveTo(px, margin.top + plotH);
    ctx.lineTo(px, margin.top + plotH + 5);
    ctx.stroke();
    ctx.fillText(x.toFixed(1) + "%", px, margin.top + plotH + 8);
  }

  // Ticks Y
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = yMin; y <= yMax; y += 0.1) {
    const py = mapY(y);
    ctx.beginPath();
    ctx.moveTo(margin.left - 5, py);
    ctx.lineTo(margin.left, py);
    ctx.stroke();
    ctx.fillText(y.toFixed(2), margin.left - 8, py);
  }

  // Títulos
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 13px Calibri, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Deformação Horizontal εh [%]", margin.left + plotW / 2, height - 15);

  ctx.save();
  ctx.translate(22, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Deslocamento Vertical δv [mm]", 0, 0);
  ctx.restore();

  // Curvas
  results.forEach((r, i) => {
    const color = specimens[i]?.color || lineColors[i % lineColors.length];
    if (!r.curve || r.curve.length === 0) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    r.curve.forEach((pt, pIdx) => {
      const px = mapX(pt.horizStrainPct);
      const py = mapY(pt.vertDispMm);
      if (pIdx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });

  // Legenda
  ctx.font = "12px Calibri, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  let curX = margin.left + 20;
  const legY = 24;

  results.forEach((r, i) => {
    const color = specimens[i]?.color || lineColors[i % lineColors.length];
    const name = `${specimens[i]?.displayId ?? `CP-${i + 1}`} (σn = ${r.sigmaN.toFixed(0)} kPa)`;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(curX, legY);
    ctx.lineTo(curX + 22, legY);
    ctx.stroke();
    curX += 28;

    ctx.fillStyle = "#334155";
    ctx.fillText(name, curX, legY);
    curX += ctx.measureText(name).width + 30;
  });

  return canvas.toDataURL("image/png").split(",")[1];
}
