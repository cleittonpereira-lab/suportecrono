/**
 * App instalável (Fase 5): registro do service worker e limpeza das páginas
 * guardadas. O service worker é gerado no build (pwa/sw.plugin.ts) com a lista
 * dos arquivos daquela versão; em desenvolvimento não é registrado.
 */

/** Nome do cache das páginas (HTML) — o mesmo de pwa/sw-modelo.js. */
const CACHE_PAGINAS = "suporte-paginas";

/**
 * Válvula de segurança para suporte: abrir qualquer página com `?limpar-app`
 * remove o service worker e os caches do app neste aparelho. A fila da
 * bancada (IndexedDB) fica — é trabalho ainda não enviado.
 */
async function limparAppSePedido(): Promise<boolean> {
  if (!new URLSearchParams(window.location.search).has("limpar-app")) return false;
  const registros = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registros.map((r) => r.unregister()));
  for (const nome of await caches.keys()) {
    if (nome.startsWith("suporte-")) await caches.delete(nome);
  }
  console.info("[pwa] App limpo neste aparelho: service worker e caches removidos.");
  return true;
}

export function registrarServiceWorker(): void {
  if (import.meta.env.DEV || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const registrar = async () => {
    try {
      if (await limparAppSePedido()) return;
      await navigator.serviceWorker.register("/sw.js");
    } catch (err) {
      console.warn("[pwa] Service worker não registrado:", err);
    }
  };
  if (document.readyState === "complete") void registrar();
  else window.addEventListener("load", () => void registrar(), { once: true });
}

/** Apaga as páginas guardadas para uso sem rede (ao sair da conta). */
export async function esquecerPaginasGuardadas(): Promise<void> {
  try {
    if (typeof caches !== "undefined") await caches.delete(CACHE_PAGINAS);
  } catch {
    // sem Cache Storage: nada guardado
  }
}
