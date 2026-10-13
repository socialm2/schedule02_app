"use strict";

// ================================================================ 브라우저판 전용 배선 (Pyodide)
//
// 화면 코드(app.js)는 요청을 어떻게 보내는지 모른다 — 그건 여기서 정한다. 예전엔 로컬
// Flask판이 따로 있어 이 파일이 'fetch로 보내는 판'과 한 쌍이었고, 그 전엔 app.js 자체가
// 두 벌이라 차이가 295줄·14덩어리로 흩어져 "한쪽만 고치는" 사고가 반복됐다. 2026-10에
// Flask판을 없앴지만, 전송을 여기 모아 두는 구조는 그대로 둔다 — 화면 로직과 Worker
// 배선이 섞이면 한쪽을 고칠 때 다른 쪽이 깨진다. 여기 있는 것:
//
//   api(path, opts)                       요청 보내기        (Worker에 보내고 받기)
//   apiUpload(path, file)                 파일 올리기        (바이트로 바꿔 전달)
//   apiDownload(kind)                     파일 받기          (바이트+파일명 → blob 저장)
//   apiDownloadWantedTemplate(payload, filename)   양식 받기
//   bootPlatform()                        시작 준비          (Pyodide 부팅)
//
// 그 밖에: 접속 비밀번호 게이트와 서비스워커 등록(아래).

// ================================================================ 접속 비밀번호 게이트
// 서버가 없는 정적 배포판이라 "진짜 로그인"이 아니라 억제 수준의 문 — 링크를 모르고
// 우연히 들어오는 걸 막는 용도. 비밀번호를 바꾸려면 아래 새 해시로 교체하면 된다
// (브라우저 콘솔에서 다음처럼 뽑을 수 있다:
//   crypto.subtle.digest("SHA-256", new TextEncoder().encode("새비밀번호"))
//     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")))
// ).
const AUTH_HASH = "2cbbfffee7c0a89ffa87b2320543fb71b4bc5443c5ccc4d04723e17c59367355";
const AUTH_KEY = "ns_auth_ok";
// Log-out 버튼(showSignOut)은 지금 숨겨 둔다 — 2026-10-10, 헤더에 버튼이 하나 더 있는 게
// 보기 좋지 않다는 사용자 요청. 다시 보이게 하려면 이 값만 true로 바꾸면 된다(모양·위치는
// style.css에 그대로 있다). 숨긴 동안 공용 PC에서 나가려면 브라우저 사이트 데이터를 지워야 한다.
// 이 줄은 아래 initAuthGate()보다 위에 있어야 한다 — 그 함수가 즉시 실행되며 showSignOut()을
// 부르는데, const는 선언 줄 전에 읽으면 오류가 나서 화면 부팅 전체가 멈춘다(실제로 멈췄다).
const SHOW_SIGN_OUT_BUTTON = false;

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
    showSignOut();
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
      showSignOut();
    } else {
      document.getElementById("authError").style.display = "";
      input.value = "";
      input.focus();
    }
  });
})();

// 한 번 들어오면 브라우저 데이터를 지우기 전까지 계속 들어와 있다 — 공용 PC에서
// 다음 사람이 그대로 열 수 있다는 뜻이다. 나갈 방법을 화면에 둔다.
// (인증 자체가 이 브라우저 안에서만 이뤄지므로 이건 '조심해서 쓰는 길'이지 접근통제가
//  아니다. 진짜 통제는 서버·엣지 쪽에서 해야 한다 — 보안 안내에 그렇게 적혀 있다.)
function showSignOut() {
  if (!SHOW_SIGN_OUT_BUTTON) return;
  if (document.getElementById("signOutBtn")) return;
  // 헤더 맨 오른쪽, 설명서 버튼 바로 뒤에 붙인다 — 가로·세로 어느 화면에서든
  // [설명서][Log-out] 순서로 나란히 선다. 예전엔 h1 '안'에 넣었다가 세로 폰에서 이
  // 버튼만 다음 줄 왼쪽으로 툭 떨어졌고, 그 뒤 h1 '옆'으로 옮겼더니 넓은 화면에서는
  // 제목 바로 옆에 홀로 떨어져 있었다. 설명서 버튼이 없으면(화면 구조가 바뀐 경우)
  // 헤더 끝에, 헤더도 없으면 body 끝에 붙인다.
  const anchor = document.getElementById("infoBtn");
  const header = document.querySelector("header");
  const b = document.createElement("button");
  b.id = "signOutBtn";
  b.type = "button";
  b.className = "sign-out";
  b.textContent = "Log-out";
  b.title = "이 브라우저에서 나갑니다 — 다음에 열면 비밀번호를 다시 묻습니다";
  b.onclick = () => {
    try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* 아래에서 새로고침 */ }
    location.reload();
  };
  if (anchor) anchor.after(b); else (header || document.body).appendChild(b);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ================================================================ Pyodide 브릿지 (Web Worker)
// (예전엔 여기서 '확정 저장' 기록을 localStorage에 넣고 빼는 코드가 있었다 — 그 길은
//  2026-08부터 화면에서 숨겨진 채였고 2026-10-13에 걷어냈다. 이어짐은 파일로만 간다.)
// 서버 없이 브라우저 안에서 Python(nurse_scheduler 엔진)을 직접 돌리되,
// 계산 자체는 별도 Worker 스레드(pyworker.js)에서 실행한다. 근무표 생성처럼
// 오래 걸리는 계산 중에도 이 메인 스레드(화면)는 얼어붙지 않고 계속 반응한다.
// api(path, opts)의 시그니처는 원래 fetch 버전과 동일하게 유지해서, 이 함수를
// 호출하는 나머지 코드는 전혀 손대지 않아도 되게 만들었다.

let worker = null;
let _reqId = 0;
const _pending = new Map();

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
  // 부팅 뒤에 Worker가 죽으면(런타임 오류·메모리 부족 등) 보낸 요청의 응답이 영영
  // 안 온다. 예전엔 onerror가 부팅용 reject만 가리키고 있어서, 생성 중에 죽으면
  // **로딩 화면이 그대로 멈춰 있었다** — 사용자는 앱이 느린 줄 알고 몇 분을 기다린다
  // (v0.84 독립 QA, QA-04). 기다리는 요청을 전부 실패로 끝내고 이유를 알린다.
  worker.onerror = (e) => {
    const why = (e && e.message) || "브라우저에서 계산이 중단됐습니다";
    for (const [, p] of _pending) p.reject(new Error(why));
    _pending.clear();
    showToast(`${why} — 새로고침한 뒤 다시 시도해 주세요. `
      + `받아두신 엑셀 파일은 그대로 쓰실 수 있습니다.`, true);
  };
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

// (triggerDownload는 위에 한 벌만 둔다 — 같은 함수가 두 번 선언돼 있었다. JS는 뒤 선언이
//  이기므로 동작엔 차이가 없었지만, 한쪽만 고치면 고친 쪽이 조용히 무시되는 자리였다.)

// 다운로드는 JSON이 아니라 순수 바이너리를 그대로 돌려주므로,
// JSON.parse를 하는 api() 대신 callWorker()로 원본 응답을 직접 받는다.
// 파일명(병동명·회차 포함)은 bridge.py가 만들어 준다.
async function apiDownload(kind) {
  const { raw: bytes } = await callWorker(`/api/download/${kind}`);
  // bridge는 생성 전이면 None을 돌려준다 — 그대로 Blob에 넣으면 내용이 "null" 네 글자인
  // 엑셀 파일이 받아진다(열면 깨진 파일). 화면 버튼은 생성 뒤에만 있지만, 이 함수는
  // 다른 길로도 불리므로 여기서 막는다(2026-10-13 화면 훑기).
  if (!bytes) { showToast("아직 생성된 근무표가 없습니다 — 먼저 근무표를 생성해주세요", true); return; }
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
