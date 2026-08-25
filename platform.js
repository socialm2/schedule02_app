"use strict";

// ================================================================ 브라우저판 전용 배선 (Pyodide)
//
// 이 파일과 webapp/static/platform.js는 **같은 이름의 함수를 서로 다르게 구현한 한 쌍**이다.
// 나머지 화면 코드(app.js)는 두 판이 한 글자도 다르지 않다 — 예전엔 app.js가 두 벌이었고,
// 그 두 벌의 차이가 295줄·14덩어리로 흩어져 있어서 "한쪽만 고치는" 사고가 반복됐다.
// 갈리는 것은 딱 다섯 가지뿐이라 여기로 모았다:
//
//   api(path, opts)                       요청 보내기        (워커 ↔ fetch)
//   apiUpload(path, file)                 파일 올리기        (바이트 ↔ FormData)
//   apiDownload(kind)                     파일 받기          (워커+blob ↔ 링크 이동)
//   apiDownloadWantedTemplate(payload, filename)   양식 받기
//   bootPlatform()                        시작 준비          (Pyodide 부팅 ↔ 할 일 없음)
//
// 그 외에 브라우저판에만 있는 것: 접속 비밀번호 게이트와 서비스워커 등록(아래).

// ================================================================ 접속 비밀번호 게이트
// 서버가 없는 정적 배포판이라 "진짜 로그인"이 아니라 억제 수준의 문 — 링크를 모르고
// 우연히 들어오는 걸 막는 용도. 비밀번호를 바꾸려면 아래 새 해시로 교체하면 된다
// (브라우저 콘솔에서 다음처럼 뽑을 수 있다:
//   crypto.subtle.digest("SHA-256", new TextEncoder().encode("새비밀번호"))
//     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")))
// ).
const AUTH_HASH = "2cbbfffee7c0a89ffa87b2320543fb71b4bc5443c5ccc4d04723e17c59367355";
const AUTH_KEY = "ns_auth_ok";

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

(function initAuthGate() {
  const gate = document.getElementById("authGate");
  // 저장소 접근이 막힌 환경에서도 문(gate) 자체는 떠야 한다 — 예전엔 여기서 던진
  // SecurityError가 초기화 전체를 멈춰 화면이 빈 채로 남았다.
  let alreadyIn = false;
  try { alreadyIn = localStorage.getItem(AUTH_KEY) === "1"; } catch (e) { alreadyIn = false; }
  if (alreadyIn) {
    gate.style.display = "none";
    return;
  }
  // crypto.subtle은 보안 컨텍스트(https 또는 localhost)에서만 존재한다. 사내망에 http로
  // 올리는 경우 등 이게 없으면 비밀번호 확인 자체가 불가능하므로, 조용히 먹통되는 대신
  // 폼을 아예 안 보여주고 이유를 바로 알려준다.
  if (!window.crypto || !window.crypto.subtle) {
    document.getElementById("authForm").style.display = "none";
    document.getElementById("authUnsupported").style.display = "";
    return;
  }
  document.getElementById("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("authInput");
    let hash;
    try {
      hash = await sha256Hex(input.value);
    } catch (err) {
      document.getElementById("authForm").style.display = "none";
      document.getElementById("authUnsupported").style.display = "";
      return;
    }
    if (hash === AUTH_HASH) {
      try { localStorage.setItem(AUTH_KEY, "1"); } catch (err) { /* 다음에 또 물어볼 뿐 */ }
      gate.style.display = "none";
    } else {
      document.getElementById("authError").style.display = "";
      input.value = "";
      input.focus();
    }
  });
})();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ================================================================ Pyodide 브릿지 (Web Worker)
// 서버(Flask) 없이 브라우저 안에서 Python(nurse_scheduler 엔진)을 직접 돌리되,
// 계산 자체는 별도 Worker 스레드(pyworker.js)에서 실행한다. 근무표 생성처럼
// 오래 걸리는 계산 중에도 이 메인 스레드(화면)는 얼어붙지 않고 계속 반응한다.
// api(path, opts)의 시그니처는 원래 fetch 버전과 동일하게 유지해서, 이 함수를
// 호출하는 나머지 코드는 전혀 손대지 않아도 되게 만들었다.

let worker = null;
let _reqId = 0;
const _pending = new Map();

const HISTORY_PREFIX = "ns_history_";

// 브라우저 저장소는 항상 쓸 수 있는 게 아니다 — 사내 정책이나 브라우저 설정으로 접근
// 자체가 막히면(SecurityError) 예전엔 앱 초기화가 통째로 멈췄고, 용량이 꽉 차면
// (QuotaExceededError) 확정 저장이 조용히 실패했다. 저장이 안 되는 것보다 나쁜 건
// "왜 안 되는지 모르는 것"이라, 실패해도 앱은 계속 돌리되 이유를 알려준다.
let storageWarned = false;
function _storageFailed(e, what) {
  console.warn("localStorage", what, e);
  if (storageWarned) return;
  storageWarned = true;
  const quota = e && (e.name === "QuotaExceededError" || e.code === 22);
  showToast(quota
    ? "브라우저 저장공간이 가득 차 지난달 기록을 저장하지 못했습니다 — 오래된 기록을 지우거나 다른 브라우저를 쓰세요. 근무표 생성·다운로드는 그대로 됩니다."
    : "이 브라우저에서는 저장소를 쓸 수 없어 지난달 기록이 남지 않습니다(사내 정책·시크릿 모드 등) — 근무표 생성·다운로드는 그대로 됩니다.",
    true);
}

function _readHistorySnapshot() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(HISTORY_PREFIX)) out[k] = localStorage.getItem(k);
    }
  } catch (e) { _storageFailed(e, "read"); }
  return out;
}

function _applyHistoryPatch(patch) {
  if (!patch) return;
  try {
    for (const [k, v] of Object.entries(patch)) localStorage.setItem(k, v);
  } catch (e) { _storageFailed(e, "write"); }
}

async function bootPyodide() {
  const msg = document.getElementById("loadingMsg");
  worker = new Worker("pyworker.js");
  await new Promise((resolve, reject) => {
    worker.onmessage = (ev) => {
      const d = ev.data;
      if (d.type === "boot_progress") { msg.textContent = d.msg; return; }
      if (d.type === "ready") { resolve(); return; }
      if (d.type === "boot_error") { reject(new Error(d.error)); return; }
    };
    worker.onerror = (e) => reject(new Error(e.message || "Worker 로딩 실패"));
  });
  // 부팅 완료 후 메시지 핸들러를 요청/응답(RPC) 방식으로 교체
  worker.onmessage = (ev) => {
    const { id, ok, raw, error, binary } = ev.data;
    const p = _pending.get(id);
    if (!p) return;
    _pending.delete(id);
    if (ok) p.resolve({ raw, binary }); else p.reject(new Error(error));
  };
  // 연간 근무표 기록(localStorage)은 Worker 안에서 직접 못 읽으므로, 부팅 직후
  // 현재 스냅샷을 한 번 넣어준다.
  await callWorker("/api/_bootstrap_history", { body: JSON.stringify(_readHistorySnapshot()) });
}

function callWorker(path, opts) {
  return new Promise((resolve, reject) => {
    const id = ++_reqId;
    _pending.set(id, { resolve, reject });
    worker.postMessage({ id, path, opts: opts || {} });
  });
}

async function api(path, opts) {
  let raw, binary;
  try {
    ({ raw, binary } = await callWorker(path, opts));
  } catch (e) {
    const message = (e && e.message) ? e.message.split("\n")[0] : String(e);
    showToast(message, true);
    throw e;
  }
  if (binary) return raw; // 바이너리(xlsx) 응답은 JSON이 아니므로 그대로 반환
  const data = JSON.parse(raw);
  if (data && data.error) {
    showToast(data.error, true);
    throw new Error(data.error);
  }
  if (data && data._history_patch) {
    _applyHistoryPatch(data._history_patch);
    delete data._history_patch;
  }
  return data;
}

function triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ---------------------------------------------------------------- 화면이 쓰는 다섯 가지

async function apiUpload(path, file) {
  // 워커에는 File 객체를 그대로 못 넘긴다(구조화 복제 대상이 아님) — 바이트로 바꿔 보낸다.
  const bytes = new Uint8Array(await file.arrayBuffer());
  return api(path, { _fileBytes: bytes });
}

function triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// 다운로드는 JSON이 아니라 순수 바이너리를 그대로 돌려주므로,
// JSON.parse를 하는 api() 대신 callWorker()로 원본 응답을 직접 받는다.
// 파일명(병동명·회차 포함)은 bridge.py가 만들어 준다 — Flask판이 헤더로 내려주는 것과 같은 값.
async function apiDownload(kind) {
  const { raw: bytes } = await callWorker(`/api/download/${kind}`);
  const { raw: filename } = await callWorker(`/api/download_filename/${kind}`);
  triggerDownload(bytes, filename, XLSX_MIME);
}

async function apiDownloadWantedTemplate(payload, filename) {
  const { raw: bytes } = await callWorker("/api/download/wanted_template",
                                          { body: JSON.stringify(payload) });
  triggerDownload(bytes, filename, XLSX_MIME);
}

// 브라우저 안에서 Python을 돌리므로 화면을 열기 전에 Pyodide를 부팅해야 한다.
// 실패하면 false를 돌려주고 로딩 화면에 이유를 띄운다 — app.js는 그 뒤를 진행하지 않는다.
async function bootPlatform() {
  try {
    await bootPyodide();
  } catch (e) {
    console.error(e);
    document.getElementById("loadingMsg").textContent =
      "불러오기 실패: " + (e && e.message ? e.message : String(e));
    document.querySelector(".loading-box").classList.add("err");
    return false;
  }
  document.getElementById("loadingOverlay").style.display = "none";
  document.getElementById("app").style.display = "";
  return true;
}
