/* ============================================================
   英语陪练 · Service Worker  (sw.js)
   ------------------------------------------------------------
   策略：
   - 应用外壳（HTML/CSS/JS/图标）：预缓存 + 缓存优先（保证秒开、离线可用）
   - 导航请求：网络优先，失败回退缓存首页（保证离线能打开 App）
   - 其余请求：网络优先并写入缓存
   修改版本号即可触发客户端更新。
   ============================================================ */
var VERSION = 'eng-trainer-v2.0.0';
var SHELL_CACHE = VERSION + '-shell';
var RUNTIME_CACHE = VERSION + '-runtime';

/* 预缓存清单：必须与目录中的文件一一对应 */
var SHELL_FILES = [
  './',
  './index.html',
  './admin.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/store.js',
  './assets/js/speech.js',
  './assets/js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png'
];

/* ---------- 安装：预缓存外壳 ---------- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      // 单个失败不影响整体（用 addAll 的兼容写法）
      return Promise.all(SHELL_FILES.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function (e) {
          console.warn('[SW] 预缓存失败: ' + url, e);
        });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* ---------- 激活：清理旧版本缓存 ---------- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL_CACHE && k !== RUNTIME_CACHE) {
          return caches.delete(k);
        }
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---------- 请求拦截 ---------- */
self.addEventListener('fetch', function (event) {
  var req = event.request;

  // 只处理 GET；非 GET（理论上没有）直接放行
  if (req.method !== 'GET') return;

  // 只对同源资源做缓存，避免第三方请求干扰
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1) 导航请求（打开页面）：网络优先，断网回退首页缓存 → 保证离线可打开
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        caches.open(RUNTIME_CACHE).then(function (c) { c.put(req, res.clone()); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (cached) {
          return cached || caches.match('./') || new Response('离线中，请联网后重试', {
            status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      })
    );
    return;
  }

  // 2) 应用外壳静态资源：缓存优先（快 + 离线可用），后台顺带更新
  var isShell = SHELL_FILES.some(function (f) {
    return url.pathname.indexOf(f.replace('./', '')) > -1;
  });

  if (isShell) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.status === 200) {
            caches.open(SHELL_CACHE).then(function (c) { c.put(req, res.clone()); });
          }
          return res;
        }).catch(function () { return cached; });
        return cached || network;
      })
    );
    return;
  }

  // 3) 其他同源资源：网络优先，写入运行时缓存
  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200) {
        caches.open(RUNTIME_CACHE).then(function (c) { c.put(req, res.clone()); });
      }
      return res;
    }).catch(function () {
      return caches.match(req);
    })
  );
});

/* ---------- 客户端主动更新 ---------- */
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
