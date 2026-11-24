/*
 * 指示ビラ・レイアウトシミュレータ用 Service Worker
 * - 一度開けば、電波がなくても同じページを開ける（オフライン対応）
 * - 開くたびに裏で最新版を取りに行き、内容が変わっていたらページに知らせる
 * - index.html と同じフォルダに置くこと
 * - この sw.js 自体を書き換えた時は、下の CACHE 名の数字を上げる
 */
const CACHE = 'indicator-sim-v1';
const CORE = ['./', './index.html'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function notifyUpdated() {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.postMessage('updated'));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });

    /* 裏で最新版を取得して保存（電波がなければ何もしない） */
    const refresh = fetch(req).then(async res => {
      if (res && res.ok) {
        if (cached) {
          const [a, b] = await Promise.all([cached.clone().text(), res.clone().text()]);
          if (a !== b) await notifyUpdated();
        }
        await cache.put(req, res.clone());
      }
      return res;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(refresh);
      return cached;
    }
    const res = await refresh;
    if (res) return res;
    /* 未保存かつ電波なし：画面の移動なら保存済みの index.html を返す */
    if (req.mode === 'navigate') {
      const fallback = (await cache.match('./index.html')) || (await cache.match('./'));
      if (fallback) return fallback;
    }
    return Response.error();
  })());
});
