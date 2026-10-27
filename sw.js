/* 冰島四方案 plans.html 的離線快取（只控制 plans.html，不影響 index.html） */
const V = 'v1', APP = 'app-' + V, TILE = 'tiles', DATA = 'data';
const SHELL = ['./plans.html', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'];
const MAXT = 6000; // 地圖圖磚最多保留張數（約 100 MB 內）

self.addEventListener('install', e => {
  // 單一檔案抓不到也不影響安裝，之後瀏覽時會再補存
  e.waitUntil(caches.open(APP).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('app-') && k !== APP).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

let added = 0;
async function trim() {
  const c = await caches.open(TILE), ks = await c.keys();
  for (let i = 0; i < ks.length - MAXT; i++) await c.delete(ks[i]);
}
// 先上網，失敗才用快取（行程頁、路況、路線）
async function netFirst(req, name, key) {
  const c = await caches.open(name);
  try {
    const r = await fetch(req);
    if (r.ok) await c.put(key || req, r.clone());
    return r;
  } catch (e) {
    const m = await c.match(key || req);
    if (m) return m;
    throw e;
  }
}
// 先用快取，沒有才上網（地圖圖磚、程式庫）
async function cacheFirst(req, name) {
  const c = await caches.open(name), m = await c.match(req);
  if (m) return m;
  const r = await fetch(req);
  if (r.ok) {
    await c.put(req, r.clone());
    if (name === TILE && ++added % 200 === 0) trim();
  }
  return r;
}

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.hostname === 'tile.openstreetmap.org') return e.respondWith(cacheFirst(r, TILE));
  if (u.hostname === 'cdnjs.cloudflare.com') return e.respondWith(cacheFirst(r, APP));
  if (u.hostname === 'router.project-osrm.org') return e.respondWith(netFirst(r, DATA));
  if (u.origin === location.origin) {
    if (u.pathname.endsWith('/road.json')) return e.respondWith(netFirst(r, DATA, new URL('road.json', self.registration.scope).href));
    if (r.mode === 'navigate' || u.pathname.endsWith('/plans.html')) return e.respondWith(netFirst(r, APP, new URL('plans.html', self.registration.scope).href));
  }
});