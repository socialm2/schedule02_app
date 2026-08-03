// ================================================================ 서비스워커 (오프라인 캐싱)
// 이 앱은 서버가 없는 정적 페이지라, 한 번 열어본 뒤엔 서비스워커가 파일을 캐싱해
// 인터넷 없이도(비행기모드 등) 계속 쓸 수 있게 해준다.
//
// 전략을 둘로 나눈다:
//   - 큰 정적 파일(Pyodide/wheel 등, 배포 후 거의 안 바뀜) → 캐시 우선 (빠르고 오프라인도 됨)
//   - 앱 코드(index.html/app.js/style.css/pyworker.js, 업데이트가 잦음) → 네트워크 우선,
//     오프라인일 때만 캐시로 폴백 (온라인이면 항상 최신 버전을 받는다)
//
// CACHE_NAME을 올릴 때마다(버전업 시) 예전 캐시를 자동으로 정리한다.
//
// ⚠ 중요: HEAVY_FILES(vendor/pyodide, vendor/wheels 등)는 "캐시에 있으면 무조건 그걸 쓰고
// 다시 안 받는다"는 뜻이다. 그래서 이 파일들 내용을 바꾸는 경우(Pyodide/openpyxl 버전을
// 올리는 등) 아래 CACHE_NAME을 반드시 같이 올려야 한다 — 안 그러면 이미 앱을 설치/캐시한
// 사용자는 새로 배포해도 계속 옛날 파일을 쓰게 된다(직접 캐시를 지우기 전까지 영구히).
// 앱 코드(APP_FILES)만 고친 경우는 네트워크 우선이라 안 올려도 된다.

const CACHE_NAME = "ns-sched-v1";

const APP_FILES = ["./", "index.html", "app.js", "style.css", "pyworker.js", "manifest.json"];

const HEAVY_FILES = [
  "py_app.zip", "sample_input.xlsx",
  "vendor/pyodide/pyodide.js", "vendor/pyodide/pyodide.mjs",
  "vendor/pyodide/pyodide.asm.js", "vendor/pyodide/pyodide.asm.wasm",
  "vendor/pyodide/python_stdlib.zip", "vendor/pyodide/pyodide-lock.json",
  "vendor/pyodide/micropip-0.6.0-py3-none-any.whl",
  "vendor/pyodide/packaging-23.2-py3-none-any.whl",
  "vendor/wheels/et_xmlfile-2.0.0-py3-none-any.whl",
  "vendor/wheels/openpyxl-3.1.5-py2.py3-none-any.whl",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([...APP_FILES, ...HEAVY_FILES]))
      .then(() => self.skipWaiting())
      .catch(() => {}) // 캐싱 실패해도 앱 자체는 계속 동작해야 하므로 조용히 무시
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 외부 요청은 그대로 통과

  const isHeavy = HEAVY_FILES.some((f) => url.pathname.endsWith(f));

  if (isHeavy) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        return res;
      }))
    );
  } else {
    event.respondWith(
      fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
