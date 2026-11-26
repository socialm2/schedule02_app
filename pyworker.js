// ================================================================ Pyodide Web Worker
// Python(nurse_scheduler 엔진)을 메인 스레드가 아니라 별도 Worker 스레드에서 돌린다.
// 이렇게 하면 근무표 생성처럼 오래 걸리는 계산 중에도 화면(메인 스레드)이 얼어붙지
// 않고 계속 반응한다 — 스피너가 돌고, 스크롤도 되고, 브라우저가 "응답 없음"으로
// 오인하지 않는다.
//
// 이 파일 안에서는 window/document/localStorage에 접근할 수 없다(Worker 제약) —
// 그래서 달 사이의 이어짐은 파일(출력②→입력②)로만 간다(bridge.py 머리말 참고).

importScripts("vendor/pyodide/pyodide.js");

// 서버가 .wasm을 application/wasm이 아닌 MIME으로 내주면 WebAssembly.instantiateStreaming이 그 응답을 거부한다(사내 서버
// 점검 — IIS 등이 .wasm MIME을 모르면 octet-stream으로 준다). 그때는 통째로 받아서 컴파일한다(MIME을 안 본다) — 바이트가 진짜
// wasm이면 이렇게 하면 열린다. Pyodide가 loadPyodide 안에서 이 함수를 부르기 전에 끼워 둔다.
(function () {
  if (typeof WebAssembly === "undefined" || !WebAssembly.instantiateStreaming) return;
  var orig = WebAssembly.instantiateStreaming.bind(WebAssembly);
  WebAssembly.instantiateStreaming = function (source, imports) {
    return Promise.resolve(source).then(function (resp) {
      var ct = (resp && resp.headers && resp.headers.get("content-type")) || "";
      if (ct.indexOf("application/wasm") !== -1) return orig(resp, imports);
      return resp.arrayBuffer().then(function (buf) { return WebAssembly.instantiate(buf, imports); });
    });
  };
})();

let pyodide = null;
let bridge = null;

function report(msg) {
  postMessage({ type: "boot_progress", msg });
}

// 꼭 필요한 파일을 받되, 못 받으면(보안 장비 차단·서버에 없음) 영어 원문 대신 무엇을 못 받았는지 한국어로 말하고 멈춘다.
async function fetchOk(path, label) {
  let r;
  try { r = await fetch(path); }
  catch (e) { throw new Error(label + "을(를) 받지 못했습니다 — 네트워크가 끊겼거나 차단됐을 수 있습니다."); }
  if (!r.ok) throw new Error(label + "을(를) 받지 못했습니다(HTTP " + r.status + ") — 보안 장비가 막았거나 서버에 없을 수 있습니다.");
  return r;
}
// 받기는 했는데(200) 그 파일이 아닌 경우 — 사내 로그인이 끊겼을 때 서버가 로그인 화면을 200으로 주면 엔진 zip·실행 파일 자리에
// HTML이 온다. 그대로 넘기면 엔진 풀기에서 영어 원문(BadZipFile …)이 뜨거나 실행 환경이 "불러오는 중"에서 영영 멈춘다
// (2026-11-26 GPT 종합검증). 파일 머리 몇 바이트로 가려 무엇이 왔는지 한국어로 말한다.
function wrongContent(label) {
  return new Error(label + " 자리에 다른 내용이 왔습니다 — 회사 로그인이 끊겼거나 보안 장비가 안내 화면을 대신 보낸 것일 수 있습니다. " +
                   "로그인한 뒤 새로 고쳐 주세요.");
}
function startsWith(bytes, magic) {
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) if (bytes[i] !== magic[i]) return false;
  return true;
}
// 응답의 첫 조각만 읽어 본다(전체를 읽으면 10MB짜리 실행 파일을 두 번 받게 될 수 있다). 읽는 것은 복제본이라 원본은 그대로다.
async function headBytes(r, n) {
  try {
    const reader = r.clone().body.getReader();
    const first = await reader.read();
    reader.cancel().catch(() => {});
    return first.value ? first.value.subarray(0, n) : new Uint8Array(0);
  } catch (e) { return null; }     // 스트림을 못 읽는 환경 — 검사를 건너뛴다(예전 동작 그대로)
}

async function boot() {
  // loadPyodide가 안에서 받는 핵심 실행 파일(.wasm)은 받기에 실패해도 Pyodide가 조용히 삼키고 "불러오는 중"에서 영영 멈춘다
  // (사내 도메인 이전 점검 — 병원 보안 장비가 .wasm을 막는 경우). 그래서 loadPyodide 전에 여기서 먼저 받아 막혔는지 본다.
  // 받아 둔 응답은 서비스워커가 캐시에 넣으므로(캐시 우선) loadPyodide가 다시 받을 때 네트워크를 또 쓰지 않는다.
  const wasmHead = await headBytes(await fetchOk("vendor/pyodide/pyodide.asm.wasm", "실행 환경(.wasm)"), 4);
  // 첫 조각이 4바이트가 안 되면(드문 일) 가릴 수 없다 — 그때는 예전처럼 그대로 넘긴다
  if (wasmHead && wasmHead.length >= 4 && !startsWith(wasmHead, [0x00, 0x61, 0x73, 0x6d])) throw wrongContent("실행 환경(.wasm)");     // "\0asm"

  pyodide = await loadPyodide({ indexURL: "vendor/pyodide/" });

  report("필요한 패키지를 설치하는 중…");
  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  await micropip.install("vendor/wheels/et_xmlfile-2.0.0-py3-none-any.whl");
  await micropip.install("vendor/wheels/openpyxl-3.1.5-py2.py3-none-any.whl");

  report("근무표 생성 엔진을 불러오는 중…");
  const zipBuf = await (await fetchOk("py_app.zip", "근무표 엔진")).arrayBuffer();
  if (!startsWith(new Uint8Array(zipBuf, 0, Math.min(4, zipBuf.byteLength)), [0x50, 0x4b])) throw wrongContent("근무표 엔진");   // zip은 "PK"로 시작한다
  pyodide.unpackArchive(zipBuf, "zip");

  // 화면 첫 기본값(예제 값)의 '명단' — 파트장이 실제로 쓰는 양식(원티드표)과 같은 형식이다. 설정·최소인력은 파일이 아니라
  // nurse_scheduler/sample_defaults.py에서 온다. 파일 이름은 영문이다 — 서버가 한글 이름을 못 내주는 경우에 대비(이전 점검).
  // 받는 이름(화면의 '양식/예시')은 app.js가 한글로 붙인다. 못 받아도(차단 등) 앱은 열린다 — 그때는 예제 값이 비고
  // bridge의 api_sample이 실패해 화면이 "샘플 로드 실패"를 알린다(치명적이지 않다).
  const ROSTER = "sample_wanted.xlsx";
  try {
    const rosterBuf = await (await fetchOk("templates/" + ROSTER, "예제 명단")).arrayBuffer();
    pyodide.FS.writeFile("/" + ROSTER, new Uint8Array(rosterBuf));
  } catch (e) { /* 예제 명단은 없어도 앱은 열린다 */ }

  pyodide.runPython("import sys\nif '/' not in sys.path: sys.path.insert(0, '/')");
  bridge = pyodide.pyimport("bridge");
}

const bootPromise = boot()
  .then(() => postMessage({ type: "ready" }))
  .catch(e => postMessage({ type: "boot_error", error: (e && e.message) ? e.message : String(e) }));

function callBridge(path, opts) {
  opts = opts || {};
  switch (path) {
    case "/api/sample": return bridge.api_sample();
    case "/api/sample_requests": return bridge.api_sample_requests(opts.body);
    case "/api/upload_wanted": return bridge.api_upload_wanted(opts._fileBytes);
    case "/api/upload_staff_table": return bridge.api_upload_staff_table(opts._fileBytes);
    case "/api/upload_month": return bridge.api_upload_month(opts._fileBytes);
    case "/api/upload_month/cancel": return bridge.api_upload_month_cancel();
    case "/api/staff_table_status": return bridge.api_staff_table_status();
    case "/api/clear_staff_table": return bridge.api_clear_staff_table();
    case "/api/set_config": return bridge.api_set_config(opts.body);
    case "/api/generate": return bridge.api_generate(opts.body);
    // 병렬 생성(여러 코어) — 도우미 Worker가 쓰는 상태 없는 길과 주 Worker의 마무리
    case "/api/generate_plan": return bridge.api_generate_plan(opts.body);
    case "/api/generate_attempt": return bridge.api_generate_attempt(opts.body);
    case "/api/pick_attempt": return bridge.api_pick_attempt(opts.body);
    case "/api/generate_seed": return bridge.api_generate_seed(opts.body);
    case "/api/select_attempt": return bridge.api_select_attempt(opts.body);
    case "/api/state": return bridge.api_state();
    case "/api/edit": return bridge.api_edit(opts.body);
    case "/api/edit/team_b": return bridge.api_edit_team_b(opts.body);
    case "/api/edit/undo": return bridge.api_edit_undo(opts.body);
    case "/api/discard": return bridge.api_discard();
    case "/api/feedback": return bridge.api_feedback();
    case "/api/apply": return bridge.api_apply(opts.body);
    case "/api/apply_only": return bridge.api_apply_only(opts.body);
    case "/api/swap_candidates": return bridge.api_swap_candidates(opts.body);
    case "/api/swap_stage": return bridge.api_swap_stage(opts.body);
    case "/api/fragile_map": return bridge.api_fragile_map(opts.body);
    case "/api/fill_hints": return bridge.api_fill_hints();
    case "/api/regenerate": return bridge.api_regenerate(opts.body);
    case "/api/history/undo": return bridge.api_history_undo(opts.body);
    case "/api/history/reset": return bridge.api_history_reset(opts.body);
    case "/api/night_stage": return bridge.api_night_stage(opts.body);
    case "/api/confirm_nights": return bridge.api_confirm_nights(opts.body);
    case "/api/download_filename/xlsx": return bridge.download_filename_schedule();
    case "/api/download_filename/xlsx_ocs": return bridge.download_filename_schedule_ocs();
    case "/api/download_filename/staff_table": return bridge.download_filename_staff_table();
    case "/api/download/xlsx": {
      const py = bridge.api_download_xlsx();
      return py ? py.toJs() : null;
    }
    case "/api/download/xlsx_ocs": {
      const py = bridge.api_download_xlsx_ocs();
      return py ? py.toJs() : null;
    }
    case "/api/download/staff_table": {
      const py = bridge.api_download_staff_table();
      return py ? py.toJs() : null;
    }
    case "/api/download/wanted_template": {
      const py = bridge.api_download_wanted_template(opts.body);
      return py ? py.toJs() : null;
    }
    // 문의 파일(zip) — 현상 글 + 지금 상태 + 작업 기록 + 올린 파일. 생성 전에도 만들어진다.
    case "/api/download/voc": {
      const py = bridge.api_download_voc(opts.body);
      return py ? py.toJs() : null;
    }
    case "/api/download_filename/voc": return bridge.api_download_filename_voc();
    // 문의 파일 다시 보기 — 받은 zip을 올리면 기록된 요청을 다시 밟아 그 사람이 보던 화면을 만든다.
    case "/api/voc_load": return bridge.api_voc_load(opts._fileBytes);
    default: throw new Error("알 수 없는 경로: " + path);
  }
}

const BINARY_PATHS = new Set(["/api/download/xlsx", "/api/download/xlsx_ocs", "/api/download/staff_table",
  "/api/download/wanted_template", "/api/download/voc"]);

self.onmessage = async (ev) => {
  const { id, path, opts } = ev.data;
  await bootPromise;
  try {
    const raw = callBridge(path, opts);
    if (BINARY_PATHS.has(path) && raw) {
      // Uint8Array는 구조화 복제로도 전달되지만, transferable로 넘기면 복사 비용이 없다.
      postMessage({ id, ok: true, raw, binary: true }, [raw.buffer]);
    } else {
      postMessage({ id, ok: true, raw });
    }
  } catch (e) {
    postMessage({ id, ok: false, error: (e && e.message) ? e.message : String(e) });
  }
};
