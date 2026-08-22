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
// ⚠ CACHE_NAME은 손으로 올리지 않는다 — 배포할 때 GitHub Actions가 실제 배포 시각과
// 커밋 해시로 바꿔 박는다(.github/workflows/deploy.yml, 빌드시각 박는 자리 바로 옆).
// 저장소 파일의 값은 그냥 자리표시자다.
//
// 손으로 올리는 규칙이었을 때 실제로 사고가 났다. HEAVY_FILES(vendor/pyodide 등)는
// "캐시에 있으면 무조건 그걸 쓴다"이고, 앱 코드는 네트워크 우선이라 안 올려도 된다고
// 적어뒀는데 — 그게 틀렸다. CACHE_NAME이 그대로면 sw.js 자체가 한 바이트도 안 바뀌어
// 브라우저가 "서비스워커 갱신 없음"으로 보고, 이미 설치한 기기는 옛 app.js를 계속 쓴다.
// index.html의 빌드시각만 새것으로 바뀌니 "최신 버전인데 고친 게 하나도 안 보인다"가
// 된다. 하루치 수정이 통째로 안 보인 채 나갔었다.

const CACHE_NAME = "ns-sched-20260822-145544-17acdec";

// py_app.zip은 엔진 코드라 배포마다 바뀌므로 APP_FILES(네트워크 우선)로 둔다 —
// HEAVY_FILES(캐시 우선)에 있으면, 서비스워커가 갱신되는 그 페이지 로드에서조차
// 옛 zip을 계속 쓰게 되어(다음 로드에야 새 SW가 넘겨받음) 배포 후 한 번 더
// 새로고침해야 반영되는 혼란이 생긴다.
//
// 양식(templates/)도 APP_FILES에 둔다 — 몇십 KB밖에 안 되는데 열이 늘거나 안내가 바뀌면
// 화면 설명과 어긋나면 안 되는 파일이라, 온라인이면 항상 최신을 받게 하는 편이 안전하다.
// (여기 있어도 설치 때 미리 받아두므로 오프라인에서도 그대로 열린다)
//
// 도움말 3종도 여기에 있어야 한다. 앱 안 '설명서'에서 링크로 여는 페이지인데, 목록에
// 없으면 한 번도 열어본 적 없는 기기에서는 오프라인일 때 그냥 안 열린다 — 정작 도움말이
// 가장 필요한 순간(비행기모드·병원 지하·데이터 없음)에 없는 셈이다. 합쳐 60KB 남짓이다.
const APP_FILES = ["./", "index.html", "app.js", "style.css", "pyworker.js",
                   "manifest.json", "py_app.zip",
                   "templates/입력2_연간근무표_2026-08.xlsx",
                   "templates/입력1_원티드표_샘플.xlsx",
                   "guide/quick-start.html", "guide/one-pager.html", "guide/security.html"];

const HEAVY_FILES = [
  "vendor/pyodide/pyodide.js", "vendor/pyodide/pyodide.mjs",
  "vendor/pyodide/pyodide.asm.js", "vendor/pyodide/pyodide.asm.wasm",
  "vendor/pyodide/python_stdlib.zip", "vendor/pyodide/pyodide-lock.json",
  "vendor/pyodide/micropip-0.6.0-py3-none-any.whl",
  "vendor/pyodide/packaging-23.2-py3-none-any.whl",
  "vendor/wheels/et_xmlfile-2.0.0-py3-none-any.whl",
  "vendor/wheels/openpyxl-3.1.5-py2.py3-none-any.whl",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-512-maskable.png",
  "icons/icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_FILES);
        // 무거운 파일(Pyodide 런타임 등 14MB)은 이미 캐시에 있으면 다시 받지 않는다.
        // addAll은 있든 없든 전부 새로 받아오기 때문에, 이 파일들이 하나도 안 바뀐
        // 배포에서도 서비스워커만 고치면 14MB를 다시 내려받게 된다 — 폰 데이터로 쓰는
        // 사람에게는 그냥 손해다. 내용이 바뀌는 배포에서는 CACHE_NAME을 올리므로
        // 캐시가 통째로 새로 만들어져 어차피 다시 받는다.
        await Promise.all(HEAVY_FILES.map(async (f) => {
          if (!(await cache.match(f))) await cache.add(f);
        }));
      })
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

  // pathname은 한글 파일명을 퍼센트 인코딩해서 돌려주므로(%EC%9E%85...) 먼저 되돌려
  // 비교한다 — 안 그러면 한글 이름 파일은 목록에 넣어도 캐시 우선이 걸리지 않는다.
  let path = url.pathname;
  try { path = decodeURIComponent(path); } catch (e) { /* 잘못된 인코딩이면 원본으로 비교 */ }
  const isHeavy = HEAVY_FILES.some((f) => path.endsWith(f));

  if (isHeavy) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        return res;
      }))
    );
  } else {
    // cache: "reload" — 브라우저의 일반 HTTP 캐시(Cache-Control/max-age)까지 건너뛰고
    // 항상 서버에서 새로 받는다. 이게 없으면 서비스워커는 "네트워크 우선"을 의도해도
    // fetch()가 브라우저 HTTP 캐시에 걸려 배포 직후에도 옛 파일이 나올 수 있다.
    event.respondWith(
      fetch(req, { cache: "reload" }).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
