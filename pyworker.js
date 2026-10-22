// ================================================================ Pyodide Web Worker
// Python(nurse_scheduler 엔진)을 메인 스레드가 아니라 별도 Worker 스레드에서 돌린다.
// 이렇게 하면 근무표 생성처럼 오래 걸리는 계산 중에도 화면(메인 스레드)이 얼어붙지
// 않고 계속 반응한다 — 스피너가 돌고, 스크롤도 되고, 브라우저가 "응답 없음"으로
// 오인하지 않는다.
//
// 이 파일 안에서는 window/document/localStorage에 접근할 수 없다(Worker 제약) —
// 그래서 달 사이의 이어짐은 파일(출력②→입력②)로만 간다(bridge.py 머리말 참고).

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

  // 화면 첫 기본값의 '명단' — 파트장이 실제로 쓰는 양식(원티드표)과 같은 형식이다.
  // 설정·최소인력은 파일이 아니라 nurse_scheduler/sample_defaults.py에서 온다.
  const ROSTER = "입력1_원티드표_샘플.xlsx";
  const rosterBuf = await (await fetch("templates/" + ROSTER)).arrayBuffer();
  pyodide.FS.writeFile("/" + ROSTER, new Uint8Array(rosterBuf));

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
    case "/api/upload_wanted": return bridge.api_upload_wanted(opts._fileBytes);
    case "/api/upload_staff_table": return bridge.api_upload_staff_table(opts._fileBytes);
    case "/api/upload_month": return bridge.api_upload_month(opts._fileBytes);
    case "/api/upload_handover": return bridge.api_upload_handover(opts._fileBytes);
    case "/api/clear_handover": return bridge.api_clear_handover();
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
    case "/api/swap_candidates": return bridge.api_swap_candidates(opts.body);
    case "/api/swap_stage": return bridge.api_swap_stage(opts.body);
    case "/api/fragile_map": return bridge.api_fragile_map(opts.body);
    case "/api/regenerate": return bridge.api_regenerate(opts.body);
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
    default: throw new Error("알 수 없는 경로: " + path);
  }
}

const BINARY_PATHS = new Set(["/api/download/xlsx", "/api/download/xlsx_ocs", "/api/download/staff_table",
  "/api/download/wanted_template"]);

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
