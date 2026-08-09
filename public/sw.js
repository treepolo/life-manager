const BUILD_VERSION = "__LIFE_MANAGER_BUILD_VERSION__";
const SHELL_CACHE = `life-manager-shell-${BUILD_VERSION}`;
const RUNTIME_CACHE = `life-manager-runtime-${BUILD_VERSION}`;
const SHELL_URLS = ["/", "/assets/app.css", "/assets/app.js", "/manifest.webmanifest", "/icon.svg", "/icon-maskable.svg"];

function canCacheResponse(response, requestUrl) {
  return response.ok && new URL(response.url).origin === requestUrl.origin;
}

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(SHELL_URLS.map(async (pathname) => {
    const requestUrl = new URL(pathname, self.location.origin);
    const request = new Request(requestUrl.href, { cache: "reload" });
    const response = await fetch(request);
    if (!canCacheResponse(response, requestUrl)) {
      throw new Error(`無法預快取同源app shell：${pathname}`);
    }
    await cache.put(request, response);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING_AFTER_OUTBOX_SAVED") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/oauth/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (canCacheResponse(response, url)) {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match("/"))));
    return;
  }
  event.respondWith(fetch(request).then((response) => {
    if (canCacheResponse(response, url)) caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error(`離線且沒有可用的靜態資產：${url.pathname}`);
  }));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: "重要期限", body: "你有一項重要期限需要處理。", url: "/deadlines" }; }
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    data: { url: payload.url },
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: `deadline:${payload.url}`,
    requireInteraction: true,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = String(event.notification.data?.url || "/deadlines");
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    const existing = windows[0];
    if (existing) { await existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  }));
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "life-manager-outbox") return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    for (const client of windows) client.postMessage({ type: "SYNC_OUTBOX" });
  }));
});
