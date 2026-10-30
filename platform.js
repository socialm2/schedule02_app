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

// ================================================================ 병렬 생성 (여러 코어)
// 생성(generate_best)은 시드 0·1·2를 차례로 돌려 고른다 — 어려운 달은 세 번을 다 돌고,
// 한 번에 5~10초씩이다. 코어가 넉넉한 PC에서는 도우미 Worker 둘(같은 pyworker.js, 각자
// Pyodide를 따로 부팅)에 시드 1·2를 맡기고 주 Worker는 시드 0을 돌린다. 끝나면 세 통계를
// 엔진의 판정(/api/pick_attempt)에 넣어 고르고, 시드 0이 아니면 그 시드를 한 번 더 돌린다.
// 그래서 어려운 달은 3회 → 최대 2회 시간이 되고, 쉬운 달(시드 0으로 끝)은 예전과 같다.
//
// 결정성: 고르는 규칙이 엔진 한 벌(choose_attempt)이라 순차와 **같은 표**가 나온다 — 병렬이든
// 아니든, PC든 폰이든. 도우미가 하나라도 실패하면 순차 길로 되돌아간다(결과는 같고 느릴 뿐).
//
// 폰·코어 적은 기기에서는 켜지 않는다. Pyodide 하나가 메모리 100MB 남짓이라 셋이면 폰이
// 버거워지고, 코어보다 Worker가 많으면 서로 CPU를 뺏어 오히려 늦어진다(CI에서 그랬다).
const PAR = { helpers: [], booting: null, busy: 0 };
const PARALLEL_PATHS = new Set(["/api/generate", "/api/apply", "/api/regenerate"]);

function parallelAllowed() {
  const cores = navigator.hardwareConcurrency || 1;
  const mem = navigator.deviceMemory;             // 크롬만 준다. 없으면 코어 수만 본다.
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  return cores >= 4 && !mobile && (mem === undefined || mem >= 4);
}

function rpc(w, path, opts) {
  return new Promise((resolve, reject) => {
    const id = ++w._reqId;
    w._pending.set(id, { resolve, reject });
    w.postMessage({ id, path, opts: opts || {} });
  });
}

function bootHelper() {
  return new Promise((resolve, reject) => {
    const w = new Worker("pyworker.js");
    w._reqId = 0;
    w._pending = new Map();
    w.onmessage = (ev) => {
      const d = ev.data;
      if (d.type === "boot_progress") return;
      if (d.type === "ready") {
        w.onmessage = (ev2) => {
          const { id, ok, raw, error } = ev2.data;
          const p = w._pending.get(id);
          if (!p) return;
          w._pending.delete(id);
          if (ok) p.resolve(raw); else p.reject(new Error(error));
        };
        resolve(w);
        return;
      }
      if (d.type === "boot_error") reject(new Error(d.error));
    };
    w.onerror = (e) => {
      for (const [, p] of w._pending) p.reject(new Error((e && e.message) || "도우미 Worker 중단"));
      w._pending.clear();
      reject(new Error((e && e.message) || "도우미 Worker 중단"));
    };
  });
}

// 주 Worker 부팅이 끝난 뒤 조용히 띄운다 — 첫 화면을 늦추지 않는다. 다 뜨기 전에 생성을
// 누르면 그 생성은 순차로 간다(결과는 같다).
// 점검 스크립트(tools/ui_smoke.py)가 도우미가 떴는지 보고 생성을 누르기 위한 창.
window.__parallelState = () => ({ allowed: parallelAllowed(), helpers: PAR.helpers.length, busy: PAR.busy });

function bootHelpersInBackground() {
  if (!parallelAllowed()) return;
  const n = Math.min(2, (navigator.hardwareConcurrency || 1) - 2);
  if (n < 1) return;
  PAR.booting = Promise.all(Array.from({ length: n }, bootHelper))
    .then(ws => { PAR.helpers = ws; })
    .catch(e => { console.warn("도우미 Worker 부팅 실패 — 순차 생성으로 갑니다", e); PAR.helpers = []; });
}

async function generateParallel(path, opts) {
  const mode = path === "/api/generate" ? "generate" : path === "/api/apply" ? "apply" : "regenerate";
  const plan = JSON.parse(await callWorker("/api/generate_plan", { body: JSON.stringify({ mode }) }).then(r => r.raw));
  if (plan.error) throw new Error(plan.error);
  const helperSeeds = plan.seeds.slice(1, 1 + PAR.helpers.length);
  PAR.busy++;
  const helperRuns = PAR.helpers.slice(0, helperSeeds.length).map((w, i) =>
    rpc(w, "/api/generate_attempt",
        { body: JSON.stringify({ cfg: plan.cfg, fixed: plan.fixed, seed: helperSeeds[i] }) })
      .then(raw => JSON.parse(raw)));
  let main;
  try {
    main = await callWorker(path, { body: JSON.stringify({ seed: plan.seeds[0] }) }).then(r => r.raw);
  } finally {
    Promise.allSettled(helperRuns).then(() => { PAR.busy--; });
  }
  const data = JSON.parse(main);
  if (data.error || !data.attempt) return main;
  // 세 시드를 다 기다려 점수표로 고른다 — 동시에 돌므로 다 기다려도 가장 느린 하나만큼이다.
  const others = await Promise.all(helperRuns);          // 실패하면 throw → 호출부가 순차로
  if (others.some(o => o.error)) throw new Error(others.find(o => o.error).error);
  const stats = [data.attempt, ...others];
  const pick = JSON.parse(await callWorker("/api/pick_attempt",
    { body: JSON.stringify({ stats, h15_floor: plan.h15_floor }) }).then(r => r.raw));
  if (pick.error) throw new Error(pick.error);
  window.__genMode = `parallel:seed${pick.seed}`;
  // 점수표는 pick이 세션에 남겼다 — 시드 0이 이겼으면 상태만 다시 받고, 아니면 그 시드를 한 번 더 돌린다.
  if (pick.seed === plan.seeds[0]) return callWorker("/api/state", {}).then(r => r.raw);
  return callWorker("/api/generate_seed", { body: JSON.stringify({ seed: pick.seed }) }).then(r => r.raw);
}

// ================================================================ 꼼꼼히 찾기 (시도 N회)
// 화면의 '꼼꼼히 찾기'는 시도 수(attempts)를 9로 보낸다. 기준선 201개 실측(docs/report_v0.86/bench/
// baseline_seeds12_261030.json): 12개 중 최선은 3개 중 최선보다 154개 달에서 더 좋았고(운영 필수↓ 9,
// 숙련도↓ 62, 전체↓ 80), 그 개선의 대부분이 6~9개째에서 나온다. 대신 시간이 3배라, 기본은 3 그대로다.
//
// 3회는 위의 generateParallel/순차 길을 그대로 쓴다(바이트 하나 안 바뀜). 3회를 넘으면 이 길이다:
// 시드를 큐에 넣고 주 Worker(+도우미)가 하나씩 꺼내 돈다. 시드마다 걸리는 시간이 들쭉날쭉해서(같은
// 달 안에서도 2~10배) 시드를 미리 나누면 가장 느린 Worker를 기다리게 되고, 큐에서 꺼내면 빠른
// Worker가 더 가져간다. 시도 하나가 끝날 때마다 화면에 진척(onProgress)을 알리고, 사용자가 '여기까지
// 결과로 멈추기'를 누르면 새 시드를 꺼내지 않는다(돌고 있는 것은 끝까지 — Pyodide는 중간에 못 끊는다).
//
// 결정성은 그대로다: 고르는 규칙은 엔진 한 벌(choose_attempt)이고 시드 집합이 같으면 같은 표다. 멈추기를
// 눌렀을 때만 시드 집합이 그때까지 끝난 것으로 줄어들고, 점수표에 몇 개를 봤는지 남는다.
const DEFAULT_ATTEMPTS = 3;
const GEN = { stop: null };

function genAttemptsOf(opts) {
  try {
    const a = opts && opts.body ? JSON.parse(opts.body).attempts : null;
    return a ? Math.max(1, Number(a)) : DEFAULT_ATTEMPTS;
  } catch (e) { return DEFAULT_ATTEMPTS; }
}

// 화면의 '여기까지 결과로 멈추기'. 돌고 있는 시도가 끝나면 그때까지의 점수표로 고른다.
function requestGenStop() { if (GEN.stop) GEN.stop.requested = true; return !!GEN.stop; }

async function generateDriven(path, attempts, onProgress) {
  const mode = path === "/api/generate" ? "generate" : path === "/api/apply" ? "apply" : "regenerate";
  const plan = JSON.parse(await callWorker("/api/generate_plan", { body: JSON.stringify({ mode, attempts }) }).then(r => r.raw));
  if (plan.error) return JSON.stringify(plan);          // 입력 오류 — 호출부가 그대로 보여준다
  const seeds = plan.seeds, queue = seeds.slice(1), stats = [], t0 = Date.now();
  const stop = { requested: false, stateMade: false };
  GEN.stop = stop;
  const workers = 1 + PAR.helpers.length;
  const report = () => {
    if (typeof onProgress !== "function") return;
    try { onProgress({ done: stats.length, total: seeds.length, stats: stats.slice(), workers, stopping: stop.requested, elapsed: (Date.now() - t0) / 1000 }); }
    catch (e) { console.warn("진척 표시 실패", e); }
  };
  const drain = async (call) => {
    while (queue.length && !stop.requested) {
      const seed = queue.shift();
      const st = JSON.parse(await call(JSON.stringify({ cfg: plan.cfg, fixed: plan.fixed, seed })));
      if (st.error) throw new Error(st.error);
      stats.push(st); report();
    }
  };
  let mainRaw = null;
  const mainRun = async () => {
    // 주 Worker: 시드 0은 상태를 만드는 길(generate/apply/regenerate)로, 그 뒤는 상태 없는 generate_attempt로
    mainRaw = await callWorker(path, { body: JSON.stringify({ seed: seeds[0] }) }).then(r => r.raw);
    const main = JSON.parse(mainRaw);
    if (main.error || !main.attempt) throw Object.assign(new Error(main.error || "시도 통계 없음"), { mainRaw });
    stop.stateMade = true;
    stats.push(main.attempt); report();
    await drain(body => callWorker("/api/generate_attempt", { body }).then(r => r.raw));
  };
  PAR.busy++;
  try {
    report();
    await Promise.all([mainRun(), ...PAR.helpers.map(w => drain(body => rpc(w, "/api/generate_attempt", { body })))]);
  } catch (e) {
    if (e && e.mainRaw && !stop.stateMade) return e.mainRaw;   // 주 Worker의 입력 오류 — 호출부가 보여준다
    e.stateMade = stop.stateMade;
    throw e;
  } finally {
    PAR.busy--;
    GEN.stop = null;
  }
  const pick = JSON.parse(await callWorker("/api/pick_attempt",
    { body: JSON.stringify({ stats, h15_floor: plan.h15_floor }) }).then(r => r.raw));
  if (pick.error) throw new Error(pick.error);
  window.__genMode = `${PAR.helpers.length ? "parallel" : "sequential"}:thorough${stats.length}:seed${pick.seed}`;
  if (pick.seed === seeds[0]) return callWorker("/api/state", {}).then(r => r.raw);
  return callWorker("/api/generate_seed", { body: JSON.stringify({ seed: pick.seed }) }).then(r => r.raw);
}

async function api(path, opts) {
  let raw, binary;
  const attempts = PARALLEL_PATHS.has(path) ? genAttemptsOf(opts) : DEFAULT_ATTEMPTS;
  // onProgress는 함수라 Worker에 보낼 수 없다(postMessage가 복제 못 함) — 여기서 떼어 둔다.
  const onProgress = opts && opts.onProgress;
  if (onProgress) { opts = Object.assign({}, opts); delete opts.onProgress; }
  try {
    if (PARALLEL_PATHS.has(path) && parallelAllowed()) {
      // 도우미가 아직 뜨는 중이면 기다린다(부팅 몇 초) — 그래야 PC에서는 언제 눌러도 세 시드다.
      if (PAR.booting && !PAR.helpers.length) { try { await PAR.booting; } catch (e) { /* 아래서 순차 */ } }
    }
    if (PARALLEL_PATHS.has(path) && attempts > DEFAULT_ATTEMPTS) {
      try {
        raw = await generateDriven(path, attempts, onProgress);
      } catch (e) {
        // 도우미 중단 등 — 주 Worker 혼자 N회를 차례로 돈다(같은 시드 집합이라 같은 표, 느릴 뿐).
        console.warn("꼼꼼히 찾기(분산) 실패 — 주 Worker에서 차례로 다시 계산합니다", e);
        window.__genMode = `sequential:thorough${attempts}:fallback`;
        const body = JSON.stringify({ attempts });
        raw = (await callWorker(e && e.stateMade ? "/api/generate_seed" : path, { body })).raw;
      }
    } else if (PARALLEL_PATHS.has(path) && PAR.helpers.length && !PAR.busy) {
      try {
        raw = await generateParallel(path, opts);
      } catch (e) {
        // 병렬 길이 막히면(도우미 중단 등) 순차로. 주 Worker가 이미 시드 0 상태를 만들었어도
        // generate_seed(seed 없음)는 처음부터 세 시드를 다시 돌려 같은 표를 만든다.
        console.warn("병렬 생성 실패 — 순차로 다시 계산합니다", e);
        window.__genMode = "sequential:fallback";
        raw = (await callWorker("/api/generate_seed", { body: "{}" })).raw;
      }
    } else {
      // 코어가 적은 기기(폰)도 세 시드를 차례로 다 돌린다 — 사용자 결정(2026-10-22, 모바일 테스트
      // 뒤). 세 배 기다리는 대신 PC와 같은 표가 나오고, 점수표에서 세 표를 바꿔 볼 수 있다.
      if (PARALLEL_PATHS.has(path)) window.__genMode = "sequential";
      ({ raw, binary } = await callWorker(path, opts));
    }
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

// 화면이 만든 글(HTML 등)을 파일로 내려받는 길 — 월간지 같은 자체 생성 문서용. 파일 I/O는 여기(platform)만.
function downloadText(content, filename, mime) { triggerDownload(content, filename, mime || "text/html;charset=utf-8"); }

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
  bootHelpersInBackground();
  return true;
}
