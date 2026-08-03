// ================================================================ Pyodide Web Worker
// Python(nurse_scheduler 엔진)을 메인 스레드가 아니라 별도 Worker 스레드에서 돌린다.
// 이렇게 하면 근무표 생성처럼 오래 걸리는 계산 중에도 화면(메인 스레드)이 얼어붙지
// 않고 계속 반응한다 — 스피너가 돌고, 스크롤도 되고, 브라우저가 "응답 없음"으로
// 오인하지 않는다.
//
// 이 파일 안에서는 window/document/localStorage에 접근할 수 없다(Worker 제약).
// localStorage가 필요한 연간 근무표 기록은 bootstrap_history()/"_history_patch"로
// 메인 스레드와 데이터를 주고받는다 (bridge.py 쪽 설명 참고).

importScripts("vendor/pyodide/pyodide.js");

let pyodide = null;
let bridge = null;

function report(msg) {
  postMessage({ type: "boot_progress", msg });
}

async function boot() {
  pyodide = await loadPyodide({ indexURL: "vendor/pyodide/" });

  report("필요한 패키지를 설치하는 중…");
  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  await micropip.install("vendor/wheels/et_xmlfile-2.0.0-py3-none-any.whl");
  await micropip.install("vendor/wheels/openpyxl-3.1.5-py2.py3-none-any.whl");

  report("근무표 생성 엔진을 불러오는 중…");
  const zipBuf = await (await fetch("py_app.zip")).arrayBuffer();
  pyodide.unpackArchive(zipBuf, "zip");

  const sampleBuf = await (await fetch("sample_input.xlsx")).arrayBuffer();
  pyodide.FS.writeFile("/sample_input.xlsx", new Uint8Array(sampleBuf));

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
    case "/api/upload": return bridge.api_upload(opts._fileBytes);
    case "/api/upload_prev_month": return bridge.api_upload_prev_month(opts._fileBytes);
    case "/api/upload_staff_table": return bridge.api_upload_staff_table(opts._fileBytes);
    case "/api/staff_table_status": return bridge.api_staff_table_status();
    case "/api/clear_staff_table": return bridge.api_clear_staff_table();
    case "/api/set_config": return bridge.api_set_config(opts.body);
    case "/api/generate": return bridge.api_generate();
    case "/api/state": return bridge.api_state();
    case "/api/edit": return bridge.api_edit(opts.body);
    case "/api/edit/undo": return bridge.api_edit_undo(opts.body);
    case "/api/discard": return bridge.api_discard();
    case "/api/feedback": return bridge.api_feedback();
    case "/api/apply": return bridge.api_apply();
    case "/api/finalize": return bridge.api_finalize();
    case "/api/annual": return bridge.api_annual();
    case "/api/_bootstrap_history": return bridge.bootstrap_history(opts.body);
    case "/api/download_tag": return bridge.download_tag();
    case "/api/download/report": return bridge.api_download_report();
    case "/api/download/carryover": return bridge.api_download_carryover();
    case "/api/download/xlsx": {
      const py = bridge.api_download_xlsx();
      return py ? py.toJs() : null;
    }
    case "/api/download/staff_table": {
      const py = bridge.api_download_staff_table();
      return py ? py.toJs() : null;
    }
    default: throw new Error("알 수 없는 경로: " + path);
  }
}

const BINARY_PATHS = new Set(["/api/download/xlsx", "/api/download/staff_table"]);

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
