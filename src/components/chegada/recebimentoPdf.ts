import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

/** Espera até ~2s o container offscreen aparecer no DOM (o React só o monta depois do setState que dispara a geração). */
export async function waitForOffscreenEl(getEl: () => HTMLElement | null): Promise<HTMLElement> {
  let el = getEl();
  for (let tries = 0; !el && tries < 40; tries++) {
    await new Promise((r) => setTimeout(r, 50));
    el = getEl();
  }
  if (!el) throw new Error("Comprovante ainda não está pronto.");
  return el;
}

/** Rasteriza as páginas `.printable-report` dentro de `el` e devolve um PDF multi-página A4. */
export async function rasterizeToPdfBlob(el: HTMLElement): Promise<Blob> {
  const prevStyle = {
    position: el.style.position,
    top: el.style.top,
    left: el.style.left,
    opacity: el.style.opacity,
    zIndex: el.style.zIndex,
  };
  Object.assign(el.style, { position: "fixed", top: "0", left: "0", zIndex: "2147483647", opacity: "1" });

  // Espera 2 frames de composição pra garantir que o layout offscreen já aplicou
  // os estilos acima — com um limite de tempo, pra não travar pra sempre se a
  // aba estiver em segundo plano (rAF pausa nesse caso, ex.: usuário trocou de
  // app no celular logo depois de disparar a geração).
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 400);
  });
  await new Promise((r) => setTimeout(r, 150));

  try {
    const pages = Array.from(el.querySelectorAll<HTMLElement>(".printable-report"));
    if (pages.length === 0) throw new Error("Nenhuma página do comprovante encontrada.");

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    for (let i = 0; i < pages.length; i++) {
      const dataUrl = await toPng(pages[i], {
        pixelRatio: 2.5,
        cacheBust: true,
        backgroundColor: "#ffffff",
        style: { width: "210mm", boxSizing: "border-box" },
      });
      if (i > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
    }
    return pdf.output("blob");
  } finally {
    Object.assign(el.style, prevStyle);
  }
}

export type PdfDeliveryResult = "shared" | "downloaded" | "share-cancelled";

/** Baixa o PDF e, se possível e desejado, tenta o compartilhamento nativo (mobile) antes. */
export async function downloadOrShareBlob(
  blob: Blob,
  filename: string,
  shareText: string,
  autoShare: boolean
): Promise<PdfDeliveryResult> {
  const file = new File([blob], filename, { type: "application/pdf" });

  if (autoShare && typeof navigator !== "undefined" && (navigator as any).canShare?.({ files: [file] })) {
    try {
      await (navigator as any).share({ files: [file], title: filename, text: shareText });
      return "shared";
    } catch (shareErr: any) {
      if (shareErr?.name === "AbortError") return "share-cancelled";
      // outros erros de compartilhamento: cai pro download normal abaixo
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return "downloaded";
}
