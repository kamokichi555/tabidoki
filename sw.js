/* ══════════════════════════════════════════════════════
   旅刻 — Service Worker
   ・パスはすべて相対（manifest の scope と整合させる）
   ・HTML(ナビゲーション)は network-first で確実に更新を配信
   ・静的アセットは cache-first（?v クエリでバージョン管理）
   ・外部API(天気/ジオ/施設)には介入しない
   Copyright © 鴨吉 All Rights Reserved.
   ══════════════════════════════════════════════════════ */
const CACHE_NAME = 'tabidoki-mk17-v1'; // ← リリースごとにバンプして旧キャッシュを破棄（ESM化以降はこれが唯一のキャッシュ無効化手段）
const CACHE_FILES = [
  './',
  './index.html',
  './tabidoki_manual.html',
  './manifest.json',
  './css/style.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/splash-title.png',
  './js/00-constants.js',
  './js/01-state.js',
  './js/02-utils.js',
  './js/03-storage.js',
  './js/04-weather.js',
  './js/05-stop.js',
  './js/06-day.js',
  './js/07-render.js',
  './js/08-mode.js',
  './js/09-drag.js',
  './js/10-pickers.js',
  './js/11-overlays.js',
  './js/12-debug.js',
  './js/13-init.js',
  './js/14-gps.js',
  './js/_expose.js'
];

// インストール時にプリキャッシュ（一部取得失敗でも install を壊さない）
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_FILES))
      .catch(err => console.warn('[旅刻 sw] プリキャッシュ失敗（実行時に補完）:', err))
  );
  self.skipWaiting();
});

// 古いキャッシュを削除してからクライアントを掌握
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // GET 以外（Overpass の POST 等）は介入しない
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  // 外部オリジン（Open-Meteo / wttr.in / 国土地理院 / Nominatim / Overpass 等）は素通し
  if (url.origin !== self.location.origin) return;

  // ナビゲーション(HTML)は network-first：更新を確実に配信、オフライン時のみキャッシュ
  const isNav = req.mode === 'navigate' || req.destination === 'document';
  if (isNav) {
    event.respondWith(
      fetch(req)
        .then(resp => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
          }
          return resp;
        })
        .catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // 静的アセットは cache-first（?v クエリでバージョン管理されるため新URL=新取得）
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        if (resp && resp.ok && /\.(css|js|png|jpg|jpeg|svg|ico|webp)$/.test(url.pathname)) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(() => {});
        }
        return resp;
      });
    }).catch(() => caches.match('./index.html'))
  );
});
