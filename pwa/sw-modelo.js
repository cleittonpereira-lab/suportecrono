/*
 * Service worker do Suporte INFRA — app instalável (Fase 5).
 * Gerado a cada build por pwa/sw.plugin.ts, que preenche as constantes VERSAO
 * e ARQUIVOS com a versão e a lista de arquivos do build — o conteúdo muda a
 * cada publicação e o navegador instala o novo sozinho.
 *
 *  - Arquivos do app (/assets, ícones): guardados na instalação, servidos do aparelho.
 *  - Páginas: sempre da rede; sem rede, a última cópia guardada daquela página.
 *  - Dados (/_serverFn, /api): nunca guardados aqui — sem rede, quem trata é o
 *    app (fila da bancada em src/lib/fila-offline.ts).
 *  - Avisos (push): o push chega sem conteúdo; aqui se busca /api/avisos com a
 *    sessão da pessoa e se mostra a notificação. Tocar abre o laudo.
 */
const VERSAO = __VERSAO__;
const ARQUIVOS = __ARQUIVOS__;
const CACHE_APP = "suporte-app-" + VERSAO;
const CACHE_PAGINAS = "suporte-paginas";
/** Só a hora do último aviso mostrado neste aparelho (ver o evento "push"). */
const CACHE_AVISOS = "suporte-avisos";
const FIXOS = [
  "/manifest.webmanifest",
  "/favicon.png",
  "/suporte-infra-logo.png",
  "/suporte-infra-logo-dark.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];
/** A bancada (leitura do QR) é o que precisa abrir sem sinal. */
const PAGINAS_INICIAIS = ["/relatorio/digitalizacao"];
const MAX_PAGINAS = 40;

/** Baixa em lotes pequenos: centenas de pedidos de uma vez travam celular fraco. */
async function guardarEmLotes(cache, urls, porVez) {
  for (let i = 0; i < urls.length; i += porVez) {
    await Promise.all(urls.slice(i, i + porVez).map((u) => cache.add(u).catch(() => {})));
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_APP);
      await guardarEmLotes(cache, FIXOS.concat(ARQUIVOS), 6);
      const paginas = await caches.open(CACHE_PAGINAS);
      await guardarEmLotes(paginas, PAGINAS_INICIAIS, 2);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Mantém a versão anterior: uma aba aberta antes da atualização ainda pode pedir arquivos dela.
      const antigas = (await caches.keys()).filter((n) => n.startsWith("suporte-app-") && n !== CACHE_APP);
      for (const n of antigas.slice(0, -1)) await caches.delete(n);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_serverFn") || url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    event.respondWith(pagina(req, url));
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || FIXOS.includes(url.pathname)) {
    event.respondWith(arquivo(req));
  }
});

async function arquivo(req) {
  const guardado = await caches.match(req);
  if (guardado) return guardado;
  const resp = await fetch(req);
  if (resp.ok) {
    const cache = await caches.open(CACHE_APP);
    cache.put(req, resp.clone()).catch(() => {});
  }
  return resp;
}

async function pagina(req, url) {
  try {
    const resp = await fetch(req);
    const html = (resp.headers.get("content-type") || "").includes("text/html");
    if (resp.ok && html && !resp.redirected) {
      const cache = await caches.open(CACHE_PAGINAS);
      await cache.put(url.pathname, resp.clone());
      const chaves = await cache.keys();
      for (const k of chaves.slice(0, Math.max(0, chaves.length - MAX_PAGINAS))) await cache.delete(k);
    }
    return resp;
  } catch (err) {
    const cache = await caches.open(CACHE_PAGINAS);
    const mesma = await cache.match(url.pathname);
    if (mesma) return mesma;
    const temBancada = !!(await cache.match("/relatorio/digitalizacao"));
    return new Response(paginaSemRede(temBancada), {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

function paginaSemRede(temBancada) {
  const link = temBancada
    ? '<p><a href="/relatorio/digitalizacao" style="color:#1d4ed8">Abrir a bancada (leitura do QR)</a> — funciona sem sinal.</p>'
    : "";
  return (
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    "<title>Sem conexão — Suporte INFRA</title></head>" +
    '<body style="font-family:system-ui,sans-serif;padding:32px;max-width:520px;margin:auto;color:#141414">' +
    "<h1 style=\"font-size:20px\">Sem conexão</h1>" +
    "<p>Esta página ainda não foi aberta neste aparelho com internet, então não há cópia dela aqui.</p>" +
    link +
    '<p><button onclick="location.reload()" style="padding:8px 14px">Tentar de novo</button></p>' +
    "</body></html>"
  );
}

// ---------------- Avisos (Web Push) ----------------

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      // Cada aparelho guarda a hora do último aviso que mostrou e pede só os mais novos.
      const marca = await caches.open(CACHE_AVISOS);
      const guardada = await marca.match("/_ultimo-aviso");
      const desde = guardada ? await guardada.text() : "";
      let avisos = [];
      try {
        const r = await fetch("/api/avisos?desde=" + encodeURIComponent(desde), { credentials: "same-origin", cache: "no-store" });
        if (r.ok) avisos = (await r.json()).avisos || [];
      } catch (err) {
        // sem rede ou sem sessão: cai no aviso genérico abaixo
      }
      if (avisos.length > 0) {
        const maisNovo = avisos.reduce((m, a) => (a.criadoEm > m ? a.criadoEm : m), desde);
        await marca.put("/_ultimo-aviso", new Response(maisNovo));
      }
      // O navegador exige uma notificação por push; sem detalhes, uma genérica.
      if (avisos.length === 0) {
        avisos = [{ id: "suporte-aviso", titulo: "Suporte Lab", corpo: "Há novidade nos laudos — toque para abrir.", url: "/relatorio/pendentes" }];
      }
      for (const a of avisos.slice(0, 5)) {
        await self.registration.showNotification(a.titulo, {
          body: a.corpo,
          tag: a.id,
          data: { url: a.url },
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          lang: "pt-BR",
        });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const j of janelas) {
        if (j.url.startsWith(self.location.origin)) {
          await j.focus();
          if ("navigate" in j) await j.navigate(destino).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
