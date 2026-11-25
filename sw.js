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

const CACHE_NAME = "ns-sched-20261126-055247-eeb93dc";

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
const APP_FILES = ["./", "index.html", "app.js", "platform.js", "a11y.js", "genviz.js", "style.css", "pyworker.js",
                   "manifest.json", "py_app.zip",
                   "templates/annual_2026-08.xlsx",
                   // 입력② 달별 예시(tools/make_input2_examples.py) — 화면의 '예시(다운로드)'가 화면 연월에 맞는 것을 내준다
                   "templates/annual_example_2026-09.xlsx",
                   "templates/annual_example_2026-10.xlsx",
                   "templates/annual_example_2026-11.xlsx",
                   "templates/annual_example_2026-12.xlsx",
                   "templates/annual_example_2027-01.xlsx",
                   "templates/annual_example_2027-02.xlsx",
                   "templates/annual_example_2027-03.xlsx",
                   "templates/annual_example_2027-04.xlsx",
                   "templates/annual_example_2027-05.xlsx",
                   "templates/annual_example_2027-06.xlsx",
                   "templates/annual_example_2027-07.xlsx",
                   "templates/annual_example_2027-08.xlsx",
                   "templates/annual_example_2027-09.xlsx",
                   "templates/annual_example_2027-10.xlsx",
                   "templates/annual_example_2027-11.xlsx",
                   "templates/annual_example_2027-12.xlsx",
                   "templates/sample_wanted.xlsx"];
// 사용자 매뉴얼(manual.html)은 여기 넣지 않는다 — 화면 그림 70여 장이 든 5MB 파일이라, 넣으면 배포 때마다 모든 기기가 설치하면서
// 다시 받는다(addAll은 있든 없든 새로 받는다). 한 번 열면 아래 fetch 처리가 캐시에 넣어 두므로 그 뒤로는 오프라인에서도 열린다.

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
      // 우리 캐시(ns-sched-*)의 옛 판만 지운다 — 같은 도메인에 다른 사내 앱이 있으면(사내 도메인으로 이전) 그 앱의 캐시까지
      // 지우면 안 된다. 예전엔 CACHE_NAME을 뺀 전부를 지워, 공용 출처에서 남의 앱 오프라인 자료를 날릴 수 있었다(이전 점검).
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME && n.indexOf("ns-sched-") === 0).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// 정상 응답만 캐시에 넣는다 — 사내 로그인 뒤로 옮기면 세션이 만료됐을 때 서버가 로그인 페이지(200 HTML)·401·리다이렉트를
// 돌려줄 수 있는데, 그걸 캐시에 넣으면 오프라인에서 '앱' 대신 로그인 화면이 굳거나 만료 화면이 '최신'으로 남는다(이전 점검).
// basic = 같은 출처의 보통 응답(크로스 출처로 따라간 리다이렉트는 아니다), redirected = 로그인으로 돌려진 것.
function cacheable(res) {
  return !!res && res.ok && res.type === "basic" && !res.redirected;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // 화면 이동(주소창·새로고침·링크)은 네트워크 우선으로 보내고, 로그인 페이지·401·리다이렉트는 캐시에 남기지 않는다(세션 만료
  // 화면이 '앱'으로 굳지 않게). 네트워크가 끊겼을 때만 캐시의 첫 화면을 준다 — 병원 지하·비행기모드에서도 열리게(이 파일 머리말).
  // 사내 로그인이 만료 때 401을 '그대로' 주면 그 401이 보일 수 있다(서비스워커를 거친 요청은 'navigate' 표시가 떨어져 서버가
  // 로그인 대신 401을 줄 수 있다) — 로그인 시스템이 302로 로그인 화면에 돌려주면 괜찮다(전산 체크리스트). 완전히 안 가로채면
  // 오프라인 실행이 깨져서 이렇게 둔다.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        if (cacheable(res)) { const clone = res.clone(); caches.open(CACHE_NAME).then((c) => c.put("index.html", clone)); }
        return res;
      }).catch(() => caches.match("index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 외부 요청은 그대로 통과

  // pathname은 한글 파일명을 퍼센트 인코딩해서 돌려주므로(%EC%9E%85...) 먼저 되돌려 비교한다. 양식 파일 이름은 영문으로
  // 바꿨지만(이전 점검 — 서버가 한글 이름을 못 내주는 경우 대비), 캐시 조회는 그대로 안전하게 둔다.
  let path = url.pathname;
  try { path = decodeURIComponent(path); } catch (e) { /* 잘못된 인코딩이면 원본으로 비교 */ }
  const isHeavy = HEAVY_FILES.some((f) => path.endsWith(f));

  if (isHeavy) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (cacheable(res)) { const clone = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, clone)); }
        return res;
      }))
    );
  } else {
    // cache: "reload" — 브라우저의 일반 HTTP 캐시(Cache-Control/max-age)까지 건너뛰고
    // 항상 서버에서 새로 받는다. 이게 없으면 서비스워커는 "네트워크 우선"을 의도해도
    // fetch()가 브라우저 HTTP 캐시에 걸려 배포 직후에도 옛 파일이 나올 수 있다.
    event.respondWith(
      fetch(req, { cache: "reload" }).then((res) => {
        if (cacheable(res)) { const clone = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, clone)); }
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
