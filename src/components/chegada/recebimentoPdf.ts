import { toPng } from "html-to-image";

/** Rejeita se `promise` não resolver em `timeoutMs` — usado pra nunca deixar a geração travada pra sempre. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

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

async function fetchAsDataUrl(url: string, timeoutMs = 20_000): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } finally {
    clearTimeout(t);
  }
}

async function fetchWithRetry(url: string, attempts = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchAsDataUrl(url);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * Pré-carrega toda foto (`/api/photo/...`) dentro de `el` como data URL, com
 * retry e concorrência limitada, ANTES de rasterizar. O `html-to-image`
 * (usado abaixo) também tenta carregar `<img>` por conta própria, mas sem
 * timeout, sem retry e sem nenhuma visibilidade pro nosso código — numa rede
 * ruim (celular em campo), uma foto que falha silenciosamente só fica em
 * branco no PDF final, sem erro nenhum aparecer. Isso troca esse
 * carregamento oculto por um explícito, que a gente controla.
 *
 * Devolve uma função que desfaz a troca (restaura os `src` originais).
 */
async function preloadPhotosInElement(
  el: HTMLElement,
  onProgress?: (done: number, total: number) => void,
): Promise<() => void> {
  const imgs = Array.from(el.querySelectorAll<HTMLImageElement>('img[src^="/api/photo/"]'));
  const originalSrcs = imgs.map((img) => img.getAttribute("src") || "");
  if (imgs.length === 0) return () => {};

  let done = 0;
  let nextIndex = 0;
  const CONCURRENCY = 3;

  async function worker() {
    while (nextIndex < imgs.length) {
      const i = nextIndex++;
      try {
        const dataUrl = await fetchWithRetry(originalSrcs[i]);
        imgs[i].src = dataUrl;
      } catch {
        // Esgotou as tentativas — segue com a foto em branco em vez de
        // travar o comprovante inteiro por causa de uma foto só.
      }
      done++;
      onProgress?.(done, imgs.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, imgs.length) }, worker));

  return () => {
    imgs.forEach((img, i) => img.setAttribute("src", originalSrcs[i]));
  };
}

/** Rasteriza as páginas `.printable-report` dentro de `el` e devolve um PDF multi-página A4. */
export async function rasterizeToPdfBlob(
  el: HTMLElement,
  onPhotoProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  if (import.meta.env.SSR) throw new Error("rasterizeToPdfBlob só roda no navegador");
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

  let restorePhotoSrcs: () => void = () => {};
  try {
    const pages = Array.from(el.querySelectorAll<HTMLElement>(".printable-report"));
    if (pages.length === 0) throw new Error("Nenhuma página do comprovante encontrada.");

    // Carrega toda foto ANTES de rasterizar, com retry — pode demorar mais
    // num celular com sinal ruim, mas garante que a foto realmente sai no
    // PDF em vez de ficar em branco silenciosamente.
    restorePhotoSrcs = await preloadPhotosInElement(el, onPhotoProgress);

    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    for (let i = 0; i < pages.length; i++) {
      // A lib espera um requestAnimationFrame internamente pra terminar de
      // carregar a página rasterizada — se o navegador pausar rAF (ex.:
      // usuário trocou de app no celular logo após tocar em "gerar"), isso
      // travaria pra sempre sem esse timeout.
      const dataUrl = await withTimeout(
        toPng(pages[i], {
          pixelRatio: 2.5,
          cacheBust: false,
          backgroundColor: "#ffffff",
          style: { width: "210mm", boxSizing: "border-box" },
          // O comprovante usa só fontes de sistema (`system-ui`) — sem isso, a
          // lib tenta embutir TODA fonte referenciada no documento (ex.: a
          // "Sora" do resto do app, carregada via Google Fonts), o que inclui
          // um fetch() sem timeout que pode travar a geração inteira pra
          // sempre numa rede ruim/CORS bloqueado, mesmo sem nenhuma foto.
          skipFonts: true,
        }),
        45_000,
        "Tempo esgotado ao renderizar a página do comprovante. Volte ao aplicativo e tente novamente.",
      );
      if (i > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
    }
    return pdf.output("blob");
  } finally {
    restorePhotoSrcs();
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
