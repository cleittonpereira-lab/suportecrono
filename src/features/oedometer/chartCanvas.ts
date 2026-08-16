import type {
  OedStageCalculated,
  CasResult,
  PsResult,
  TaylorResult,
  CgrTimeResult,
} from "./types";

/**
 * Renderiza a Curva de Compressão Edométrica (e × log σ') com construções gráficas em puro Canvas.
 */
export function generateOedCompressionCanvas(
  eCurve: { sigma: number; e: number; phase: string }[],
  cas: CasResult | null,
  ps: PsResult | null,
  width = 1100,
  height = 550
): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const padLeft = 80;
  const padRight = 50;
  const padTop = 40;
  const padBottom = 60;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const minLog = 0; // 1 kPa = 10^0
  const maxLog = 4; // 10000 kPa = 10^4
  
  let minE = 0.4;
  let maxE = 1.6;
  if (eCurve.length > 0) {
    const eValues = eCurve.map((p) => p.e);
    minE = Math.floor((Math.min(...eValues) - 0.05) * 10) / 10;
    maxE = Math.ceil((Math.max(...eValues) + 0.05) * 10) / 10;
  }

  const toX = (sigma: number) => {
    const logVal = Math.log10(Math.max(1, sigma));
    return padLeft + ((logVal - minLog) / (maxLog - minLog)) * plotW;
  };
  const toY = (e: number) => {
    return padTop + ((maxE - e) / (maxE - minE)) * plotH;
  };

  // Grade de fundo (Grid)
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;

  // Grade vertical logarítmica (décadas e subdivisões)
  for (let dec = minLog; dec <= maxLog; dec++) {
    for (let sub = 1; sub <= 9; sub++) {
      const val = sub * Math.pow(10, dec);
      if (val > Math.pow(10, maxLog)) break;
      const x = toX(val);
      ctx.beginPath();
      ctx.strokeStyle = sub === 1 ? "#cbd5e1" : "#f1f5f9";
      ctx.lineWidth = sub === 1 ? 1.5 : 1;
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();

      if (sub === 1) {
        ctx.fillStyle = "#475569";
        ctx.font = "bold 11px Calibri, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(val >= 1000 ? `${val / 1000}k` : `${val}`, x, padTop + plotH + 18);
      }
    }
  }

  // Grade horizontal linear de índice de vazios e
  const eStep = (maxE - minE) <= 0.6 ? 0.05 : 0.1;
  for (let e = minE; e <= maxE + 0.001; e += eStep) {
    const y = toY(e);
    ctx.beginPath();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();

    ctx.fillStyle = "#475569";
    ctx.font = "11px Calibri, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(e.toFixed(2), padLeft - 10, y + 4);
  }

  // Bordas do gráfico
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(padLeft, padTop, plotW, plotH);

  // Rótulos dos Eixos
  ctx.fillStyle = "#141414";
  ctx.font = "bold 13px Calibri, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Tensão Vertical Efetiva — σ' [kPa] (Escala Logarítmica)", padLeft + plotW / 2, height - 15);

  ctx.save();
  ctx.translate(25, padTop + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Índice de Vazios — e", 0, 0);
  ctx.restore();

  // Curva de Ensaio (Carregamento / Descarregamento)
  if (eCurve.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = "#1e40af"; // Azul corporativo
    ctx.lineWidth = 2.5;
    eCurve.forEach((p, i) => {
      const x = toX(p.sigma);
      const y = toY(p.e);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Pontos medidos
    eCurve.forEach((p) => {
      const x = toX(p.sigma);
      const y = toY(p.e);
      ctx.beginPath();
      ctx.fillStyle = p.phase === "unload" ? "#dc2626" : "#1e40af";
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  // Traçado Casagrande (Bissetriz e Reta Virgem)
  if (cas) {
    // Ponto P
    const px = toX(Math.pow(10, cas.point.x));
    const py = toY(cas.point.y);
    ctx.fillStyle = "#059669";
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();

    // Reta virgem
    ctx.beginPath();
    ctx.strokeStyle = "#059669";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    const xStart = toX(10);
    const xEnd = toX(10000);
    const yStart = toY(cas.virgin.m * Math.log10(10) + cas.virgin.b);
    const yEnd = toY(cas.virgin.m * Math.log10(10000) + cas.virgin.b);
    ctx.moveTo(xStart, yStart);
    ctx.lineTo(xEnd, yEnd);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ponto sigmaP
    const sPx = toX(cas.sigmaP);
    const sPy = toY(cas.intersection.y);
    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.arc(sPx, sPy, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toDataURL("image/png");
}

/**
 * Renderiza o gráfico de Coeficiente de Adensamento (Cv) e Permeabilidade (k) vs. Tensão.
 */
export function generateCvPermeabilityCanvas(
  stagesCalc: OedStageCalculated[],
  width = 1100,
  height = 480
): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const padLeft = 80;
  const padRight = 80;
  const padTop = 40;
  const padBottom = 60;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const validCv = stagesCalc.filter((s) => s.cvTaylor != null && s.cvTaylor > 0);
  if (validCv.length === 0) return canvas.toDataURL("image/png");

  const minLogSigma = 1; // 10 kPa
  const maxLogSigma = 4; // 10000 kPa
  const minLogCv = -5;   // 10^-5 cm2/s
  const maxLogCv = -1;   // 10^-1 cm2/s

  const toX = (s: number) => padLeft + ((Math.log10(Math.max(1, s)) - minLogSigma) / (maxLogSigma - minLogSigma)) * plotW;
  const toY = (cv: number) => padTop + ((maxLogCv - Math.log10(Math.max(1e-8, cv))) / (maxLogCv - minLogCv)) * plotH;

  // Grade de fundo
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  for (let dec = minLogCv; dec <= maxLogCv; dec++) {
    const y = toY(Math.pow(10, dec));
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();

    ctx.fillStyle = "#475569";
    ctx.font = "11px Calibri, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`10^${dec}`, padLeft - 10, y + 4);
  }

  // Bordas do gráfico
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(padLeft, padTop, plotW, plotH);

  // Rótulos dos Eixos
  ctx.fillStyle = "#141414";
  ctx.font = "bold 13px Calibri, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Tensão Vertical Efetiva — σ' [kPa]", padLeft + plotW / 2, height - 15);

  ctx.save();
  ctx.translate(25, padTop + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Coeficiente de Adensamento — Cv [cm²/s]", 0, 0);
  ctx.restore();

  // Curva Cv Taylor
  ctx.beginPath();
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2.5;
  validCv.forEach((s, i) => {
    const x = toX(s.sigma);
    const y = toY(s.cvTaylor!);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  validCv.forEach((s) => {
    const x = toX(s.sigma);
    const y = toY(s.cvTaylor!);
    ctx.beginPath();
    ctx.fillStyle = "#2563eb";
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  return canvas.toDataURL("image/png");
}
