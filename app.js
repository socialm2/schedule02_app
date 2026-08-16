"use strict";

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

const SHIFT_CLASS = {D:"sd", E:"se", N:"sn", NK:"sk", prn:"sp", "8A":"sa", "9A":"sa9", "10A":"sa10",
                     "연차":"sy", OFF:"so", "S/":"ssl", "TW":"stw", "군":"smi", "T":"st",
                     "조":"sjo", "경":"sgyeong", "공":"sgong", "병":"sbyeong", "휴":"shyu", "승":"sseung",
                     "연1":"sy1", "연2":"sy2", "연3":"sy3", "연4":"sy4"};
const SHIFT_TEXT = {OFF:"·", "연차":"연", prn:"p"};
const ALL_SHIFTS = ["D","E","N","NK","prn","8A","9A","10A","T","TW","OFF","연차","연1","연2","연3","연4",
                    "S/","조","경","공","병","휴","승","군"];
const MIN_STAFF_ROWS = [["D","D"],["E","E"],["N","N"],["prn","prn"]];
const MIN_STAFF_COLS = [["weekday","평일"],["saturday","토요일"],["sunday_holiday","일요일·공휴일"]];

// 한국 공휴일(관공서의 공휴일에 관한 규정 기준) — 확인된 연도만 정확한 음력 명절 포함,
// 그 외 연도는 고정일 공휴일만 기본 반영하고 나머지는 캘린더에서 직접 클릭해 조정.
const KR_HOLIDAYS = {
  2025: {
    holidays: [
      "2025-01-01", "2025-01-27", "2025-01-28", "2025-01-29", "2025-01-30",
      "2025-03-01", "2025-05-05", "2025-06-06", "2025-08-15",
      "2025-10-03", "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-09", "2025-12-25",
    ],
    substitutes: ["2025-03-03", "2025-05-06", "2025-10-08"],
  },
  2026: {
    holidays: [
      "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18",
      "2026-03-01", "2026-05-05", "2026-05-24", "2026-06-06", "2026-08-15",
      "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-09", "2026-12-25",
    ],
    substitutes: ["2026-03-02", "2026-05-25", "2026-08-17", "2026-10-05"],
  },
  2027: {
    holidays: [
      "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08",
      "2027-03-01", "2027-05-05", "2027-05-13", "2027-06-06", "2027-08-15",
      "2027-09-14", "2027-09-15", "2027-09-16", "2027-10-03", "2027-10-09", "2027-12-25",
    ],
    substitutes: ["2027-02-09", "2027-08-16", "2027-10-04", "2027-10-11", "2027-12-27"],
  },
  2028: {
    holidays: [
      "2028-01-01", "2028-01-26", "2028-01-27", "2028-01-28", "2028-03-01",
      "2028-05-02", "2028-05-05", "2028-06-06", "2028-08-15", "2028-10-02",
      "2028-10-03", "2028-10-04", "2028-10-09", "2028-12-25",
    ],
    substitutes: ["2028-10-05"],
  },
  2029: {
    holidays: [
      "2029-01-01", "2029-02-12", "2029-02-13", "2029-02-14", "2029-03-01",
      "2029-05-05", "2029-05-20", "2029-06-06", "2029-08-15", "2029-09-21",
      "2029-09-22", "2029-09-23", "2029-10-03", "2029-10-09", "2029-12-25",
    ],
    substitutes: ["2029-05-07", "2029-05-21", "2029-09-24"],
  },
  2030: {
    holidays: [
      "2030-01-01", "2030-02-02", "2030-02-03", "2030-02-04", "2030-03-01",
      "2030-05-05", "2030-05-09", "2030-06-06", "2030-08-15", "2030-09-11",
      "2030-09-12", "2030-09-13", "2030-10-03", "2030-10-09", "2030-12-25",
    ],
    substitutes: ["2030-02-05", "2030-05-06"],
  },
  2031: {
    holidays: [
      "2031-01-01", "2031-01-22", "2031-01-23", "2031-01-24", "2031-03-01",
      "2031-05-05", "2031-05-28", "2031-06-06", "2031-08-15", "2031-09-30",
      "2031-10-01", "2031-10-02", "2031-10-03", "2031-10-09", "2031-12-25",
    ],
    substitutes: ["2031-03-03"],
  },
  2032: {
    holidays: [
      "2032-01-01", "2032-02-10", "2032-02-11", "2032-02-12", "2032-03-01",
      "2032-05-05", "2032-05-16", "2032-06-06", "2032-08-15", "2032-09-18",
      "2032-09-19", "2032-09-20", "2032-10-03", "2032-10-09", "2032-12-25",
    ],
    substitutes: ["2032-05-17", "2032-08-16", "2032-09-21", "2032-10-04", "2032-10-11", "2032-12-27"],
  },
  2033: {
    holidays: [
      "2033-01-01", "2033-01-30", "2033-01-31", "2033-02-01", "2033-03-01",
      "2033-05-05", "2033-05-06", "2033-06-06", "2033-08-15", "2033-09-07",
      "2033-09-08", "2033-09-09", "2033-10-03", "2033-10-09", "2033-12-25",
    ],
    substitutes: ["2033-02-02", "2033-10-10", "2033-12-26"],
  },
  2034: {
    holidays: [
      "2034-01-01", "2034-02-18", "2034-02-19", "2034-02-20", "2034-03-01",
      "2034-05-05", "2034-05-25", "2034-06-06", "2034-08-15", "2034-09-26",
      "2034-09-27", "2034-09-28", "2034-10-03", "2034-10-09", "2034-12-25",
    ],
    substitutes: ["2034-02-21"],
  },
  2035: {
    holidays: [
      "2035-01-01", "2035-02-07", "2035-02-08", "2035-02-09", "2035-03-01",
      "2035-05-05", "2035-05-15", "2035-06-06", "2035-08-15", "2035-09-15",
      "2035-09-16", "2035-09-17", "2035-10-03", "2035-10-09", "2035-12-25",
    ],
    substitutes: ["2035-05-07", "2035-09-18"],
  },
  2036: {
    holidays: [
      "2036-01-01", "2036-01-27", "2036-01-28", "2036-01-29", "2036-03-01",
      "2036-05-03", "2036-05-05", "2036-06-06", "2036-08-15", "2036-10-03",
      "2036-10-04", "2036-10-05", "2036-10-09", "2036-12-25",
    ],
    substitutes: ["2036-01-30", "2036-03-03", "2036-05-06", "2036-10-06", "2036-10-07"],
  },
  2037: {
    holidays: [
      "2037-01-01", "2037-02-14", "2037-02-15", "2037-02-16", "2037-03-01",
      "2037-05-05", "2037-05-22", "2037-06-06", "2037-08-15", "2037-09-23",
      "2037-09-24", "2037-09-25", "2037-10-03", "2037-10-09", "2037-12-25",
    ],
    substitutes: ["2037-02-17", "2037-03-02", "2037-08-17", "2037-10-05"],
  },
  2038: {
    holidays: [
      "2038-01-01", "2038-02-03", "2038-02-04", "2038-02-05", "2038-03-01",
      "2038-05-05", "2038-05-11", "2038-06-06", "2038-08-15", "2038-09-12",
      "2038-09-13", "2038-09-14", "2038-10-03", "2038-10-09", "2038-12-25",
    ],
    substitutes: ["2038-08-16", "2038-09-15", "2038-10-04", "2038-10-11", "2038-12-27"],
  },
  2039: {
    holidays: [
      "2039-01-01", "2039-01-23", "2039-01-24", "2039-01-25", "2039-03-01",
      "2039-04-30", "2039-05-05", "2039-06-06", "2039-08-15", "2039-10-01",
      "2039-10-02", "2039-10-03", "2039-10-09", "2039-12-25",
    ],
    substitutes: ["2039-01-26", "2039-05-02", "2039-10-04", "2039-10-05", "2039-10-10", "2039-12-26"],
  },
  2040: {
    holidays: [
      "2040-01-01", "2040-02-11", "2040-02-12", "2040-02-13", "2040-03-01",
      "2040-05-05", "2040-05-18", "2040-06-06", "2040-08-15", "2040-09-20",
      "2040-09-21", "2040-09-22", "2040-10-03", "2040-10-09", "2040-12-25",
    ],
    substitutes: ["2040-02-14", "2040-05-07"],
  },
};
// 신정·삼일절·어린이날·현충일·광복절·개천절·한글날·성탄절 (음력 명절·부처님오신날 제외 고정일)
const FIXED_HOLIDAYS_MMDD = ["01-01", "03-01", "05-05", "06-06", "08-15", "10-03", "10-09", "12-25"];

function seedHolidaysForYear(year) {
  const data = KR_HOLIDAYS[year];
  if (data) {
    formHolidays = [...data.holidays];
    formSubHolidays = [...data.substitutes];
  } else {
    formHolidays = FIXED_HOLIDAYS_MMDD.map(mmdd => `${year}-${mmdd}`);
    formSubHolidays = [];
  }
}

let ST = null;       // 생성 후 서버 상태 캐시
let lastConfigWarning = null;  // set_config가 돌려준 경고(예: 연간근무표 이월 불일치) — 출력화면에 계속 보여줌
let picker = null;
let formStaff = [];      // [{id, role, level, allowed:[...], flags:[...]}]
// 인원 명단을 어디서 받았는지 — 입력②(원티드표)는 '이번 달 명단(미래)', 입력③(연간근무표)은
// '지난달 실적(과거)'이라 성격이 다르다. 입력②가 이미 명단을 준 뒤에 입력③을 올려도
// 명단을 덮어쓰면 안 되고(전입자가 조용히 사라진다), 둘의 차이로 전입·전출을 판정한다.
// 파일마다 읽은 명단을 따로 보관하고, 실제로 쓸 명단은 항상 recomputeStaff() 한 곳에서
// 정한다. 예전에는 파일마다 formStaff를 직접 덮어써서, 업로드·재업로드·반영 해제 순서에
// 따라 "화면 설명과 실제 명단이 다른" 상태가 생겼다 — 예를 들어 입력② 반영을 해제해도
// 명단은 그대로 남거나, 입력② 뒤에 입력①을 다시 올리면 명단은 입력①인데 프로그램은
// 입력②가 준 것으로 알고 전입·전출을 잘못 판정했다.
let staffOfInput1 = [];  // 입력① 병동인력표에서 읽은 명단(과도기 지원용)
let staffOfWanted = [];  // 입력② 원티드표에서 읽은 명단 — 이번 달 명단의 최종 기준
let staffOfAnnual = [];  // 입력③ 연간근무표에서 읽은 명단(지난달 실적)
let staffFromWanted = false;   // 입력②가 명단을 채웠는가 (recomputeStaff가 갱신하는 파생값)
let prevRosterNames = [];      // 입력③(지난달)의 인원 이름들 — 대조용
// 입력③ 비고에 '전입'이라 적혀 전 병동 근무기록을 가져온 사람들 — 이 사람들은 입력③에
// 행이 있으므로 명단 차집합으로는 안 잡힌다(대조 화면에서 따로 구분해 보여줘야 함).
let transferredInNames = [];
let formRequests = [];   // [{staff_id, date, type, priority}]
let formCarryover = [];  // [{staff_id, last_shift_type, consecutive_work_days, night_block_remaining_off, trailing_night_count}]
let formHolidays = [];      // ["YYYY-MM-DD", ...] 공휴일
let formSubHolidays = [];   // ["YYYY-MM-DD", ...] 대체공휴일

const $ = (sel) => document.querySelector(sel);
const gridPane = $("#gridPane");
const gridContent = $("#gridContent");
const annualPane = $("#annualPane");
const sidePane = $("#sidePane");
const toast = $("#toast");

let _toastHideTimer = null;
function showToast(msg, isErr) {
  toast.textContent = msg;
  toast.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(_toastHideTimer);
  // 오류 메시지는 어느 시트/행/칸이 문제인지까지 구체적으로 적혀 있어 길어질 수
  // 있어서, 일반 안내(2.8초)보다 오래(7초) 붙잡아둔다.
  _toastHideTimer = setTimeout(() => { toast.className = "toast"; }, isErr ? 7000 : 2800);
}

// 업로드 실패는 토스트(7초, 자동으로 사라짐)만으로는 부족할 수 있다 — 어느 시트/행/
// 칸이 문제인지 구체적으로 적힌 긴 메시지를 천천히 읽고 파일을 고치는 동안에도
// 계속 보이도록, 해당 업로드 칸 바로 아래 상태 텍스트에 지속적으로 남겨둔다.
function showUploadError(statusEl, err) {
  const msg = (err && err.message) ? err.message : String(err);
  statusEl.textContent = "⚠ " + msg;
  statusEl.classList.add("upload-error");
}
function clearUploadError(statusEl) {
  statusEl.classList.remove("upload-error");
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

// 다운로드는 JSON이 아니라 순수 바이너리를 그대로 돌려주므로,
// JSON.parse를 하는 api() 대신 callWorker()로 원본 응답을 직접 받는다.
// 파일명(병동명 포함, 회차 포함)은 서버(bridge.py) 쪽에서 만들어서 그대로 쓴다.
window.downloadXlsx = async function () {
  const { raw: bytes } = await callWorker("/api/download/xlsx");
  const { raw: filename } = await callWorker("/api/download_filename/xlsx");
  triggerDownload(bytes, filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
};
window.downloadXlsxOcs = async function () {
  const { raw: bytes } = await callWorker("/api/download/xlsx_ocs");
  const { raw: filename } = await callWorker("/api/download_filename/xlsx_ocs");
  triggerDownload(bytes, filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
};
window.downloadStaffTable = async function () {
  const { raw: bytes } = await callWorker("/api/download/staff_table");
  const { raw: filename } = await callWorker("/api/download_filename/staff_table");
  triggerDownload(bytes, filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
};
// 입력② 원티드표 양식 — "설정"의 연/월과 지금 알고 있는 인원 목록으로 매번 새로
// 만든다(달마다 일수가 다르므로 고정 파일로는 못 맞춘다). 별도 선택 없이 "설정"
// 연/월을 그대로 쓴다 — 원티드표는 늘 같은 달 것이라 따로 고를 필요가 없다. 인원의
// 직급·숙련도·가능근무·비고까지 현재 값으로 미리 채워 내려줘서, 다시 올릴 때 필요한
// 부분만 고치면 된다.
window.downloadWantedTemplate = async function () {
  const year = parseInt($("#f_year").value, 10);
  const month = parseInt($("#f_month").value, 10);
  const staff = formStaff.map(s => ({ id: s.id, role: s.role, level: s.level,
                                      allowed_shifts: s.allowed, flags: s.flags }));
  const { raw: bytes } = await callWorker("/api/download/wanted_template",
    { body: JSON.stringify({ year, month, staff, team_b_names: teamBNamesFromForm() }) });
  triggerDownload(bytes, `입력2_원티드표_${year}-${String(month).padStart(2, "0")}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
};

function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
// 속성값 안에 들어가므로 따옴표를 반드시 둘 다 막는다 — 큰따옴표를 빼먹으면
// 이름에 `홍길동" onclick="...` 같은 걸 넣었을 때 없던 속성이 만들어진다.
function escAttr(s) { return esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

// ================================================================ 정보 모달

// 사용법 팝업은 입력 화면/결과 화면에서 각각 그 화면에 맞는 내용을 보여준다
// (버튼 위치는 헤더에 하나뿐이지만 클릭 시점의 화면 상태를 보고 내용을 갈아끼움).
const INFO_SHIFT_LEGEND = `
<h3>근무 색상</h3>
<ul>
<li><span class="kbd">D</span> 주간 · <span class="kbd">E</span> 저녁 · <span class="kbd">N</span> 야간 ·
<span class="kbd">NK</span> 야간전담 · <span class="kbd">prn</span> 정규 · <span class="kbd">8A</span>/<span class="kbd">9A</span> 파트장·리더 상근 ·
<span class="kbd">연차</span> · <span class="kbd">S/</span> 수면오프 · <span class="kbd">TW</span> 반근무+반교육 · <span class="kbd">군</span> 군공가 ·
<span class="kbd">/</span> 일반오프 · <span class="kbd">X</span> 원티드오프</li>
</ul>
`;

const INFO_RULES = `
<h3>지켜지는 핵심 규칙 (하드 제약 — 절대 위반 없음)</h3>
<ul>
<li>일별 최소 인력(D/E/N/prn) 충족</li>
<li>야간 연속 2~3일 블록, 야간 후 반드시 휴식 2일</li>
<li>연속근무 5일 이하, 저녁(E) 다음날 주간/정규 근무 금지</li>
<li>월 최소 휴무일수 확보, NK 전담자는 월 15일(2월 14일) 야간 고정</li>
<li>임부·야간불가 인력 야간 배정 금지</li>
</ul>

<h3>소프트 제약 (권장 — 위반돼도 기록만 하고 진행)</h3>
<ul>
<li>야간 횟수·휴무·근무일수 균등 분배, 주말 휴무 공평 분배</li>
<li>근무별 숙련도 3레벨 이상 최소 1명, 신청 휴무 전날 야간 배제 등</li>
</ul>
`;

const INFO_NEXT_MONTH = `
<h3>다음 달로 넘어갈 때</h3>
<p>근무표를 다 만든 뒤 <b>연간근무표</b>를 다운로드해서 보관해두면, 다음 달엔 그 파일 하나를
<b>입력③</b>으로 다시 올리기만 하면 마지막 근무·연속근무일·야간블록 등 <b>이월정보</b>와, 사람별
누적 OFF·야간·근무일 등 <b>형평성 지표</b>가 둘 다 자동으로 이어집니다.</p>
`;

// 더 긴 설명이 필요할 때 볼 문서들(별도 창). 서비스워커가 한 번 연 뒤엔 캐시해두므로
// 오프라인에서도 다시 열린다.
const INFO_MORE = `
<h3>더 자세한 문서</h3>
<ul>
<li><a href="guide/quick-start.html" target="_blank" rel="noopener">상세 사용법</a> — 화면 순서대로 따라 하는 안내(전입자 근무기록 붙여넣기 포함)</li>
<li><a href="guide/one-pager.html" target="_blank" rel="noopener">한 장 요약</a> — 인쇄해서 옆에 두고 보는 요약본</li>
<li><a href="guide/security.html" target="_blank" rel="noopener">보안 · 개인정보</a> — 업로드한 파일이 어디까지 가는지</li>
</ul>
`;

const INFO_HTML_INPUT = `
<h3>이 프로그램은 무엇을 하나요</h3>
<p>병동의 인원·직급·숙련도·근무 가능 유형과 일별 최소 인력 기준을 입력하면,
법정·안전 규칙(하드 제약)을 반드시 지키면서 한 달치 근무표를 자동으로 만들어 줍니다.
야간(N) 연속 근무 제한, 연속근무 5일 제한, 월 최소 휴무일수, 신청(원티드) 반영 등을 알아서 계산합니다.</p>

<h3>입력① 병동인력표 — 설정 · 근무인력</h3>
<p>샘플 데이터가 기본으로 채워져 있어 그대로 <b>바로 생성</b>을 눌러도 되고, 엑셀을 업로드해
통째로 바꿔도 됩니다. 화면에서 직접 고칠 수도 있습니다.</p>
<ul>
<li><b>병동명 / 연월</b> — 이번에 만들 근무표의 병동과 연·월입니다.</li>
<li><b>월 최대야간</b> — 한 사람이 한 달에 설 수 있는 야간(N) 최대 횟수입니다.</li>
<li><b>연속근무제한</b> — 며칠까지 연속 근무를 허용할지입니다(법정 상한 5일 이하로 설정).</li>
<li><b>야간목표하한 / 야간목표상한</b> — 사람마다 이번 달 야간을 몇 회~몇 회 사이로 맞출지 목표
범위입니다. 실제 배정은 이 범위 안에서 인원 간 형평성을 최대한 맞춥니다.</li>
<li><b>근무인력</b> — 평일·토요일·일요일/공휴일별로 D/E/N 등 근무유형마다 최소 몇 명이 있어야
하는지입니다. 근무표는 이 인원수를 반드시 채웁니다.</li>
</ul>

<h3>입력② 원티드표 — 인원 정보 · 신청</h3>
<p>직급·숙련도·가능근무·비고 등 <b>사람 정보는 여기서만</b> 받습니다. "양식(다운로드)"으로 현재
인원 기준 빈 양식을 내려받아, 이번 달 휴무·근무 신청(원티드)을 채워 다시 올리세요.</p>

<h3>입력③ 연간근무표 — 전월 이월정보</h3>
<p>지난달 만든 근무표(연간근무표 다운로드 파일)를 그대로 올리면, 마지막 근무·연속근무일·야간블록
등 이월정보와 사람별 누적 지표가 자동으로 이어집니다. 첫 달이거나 이월할 게 없으면 생략해도
됩니다.</p>
<p>⚠ <b>'전입'·'전입일' 열이 없는 예전 양식은 받지 않습니다.</b> 그 파일로는 전입자를 표시할
방법이 없어 전입자가 조용히 누락되기 때문입니다. 반려되면 <b>양식(다운로드)</b>로 새 양식을
받으시거나, 이번 달 근무표를 만든 뒤 받은 <b>출력②(연간근무표)</b>를 올려주세요.</p>

<h3>전입·전출 (인사이동)</h3>
<p><b>입력②는 이번 달 명단(앞으로), 입력③은 지난달 실적(지나간 것)</b>입니다. 그래서 입력③을 나중에
올려도 명단을 덮어쓰지 않고, 두 파일의 <b>차이</b>로 인사이동을 판정합니다 — 입력②에만 있으면
<b>전입</b>, 입력③에만 있으면 <b>전출</b>. 둘 다 올리면 입력③ 아래에 대조 결과가 바로 표시되니
생성 전에 확인하세요.</p>
<ul>
<li><b>전입자</b> — 지난달 기록이 없어 잔휴·연속근무 이월정보가 없습니다(0에서 시작). 야간 형평성만은
0으로 두면 첫 달부터 야간을 몰아 받게 되므로 재직자 중앙값에서 출발합니다.</li>
<li><b>전출자</b> — 이번 달 배정에서 빠지고, 누적 이력은 출력②(연간근무표)의 '전출' 칸에 보존됩니다.</li>
<li>⚠ <b>이름이 한 글자라도 다르면 다른 사람으로 봅니다</b>(공백·오타 포함). 계속 근무 중인데 전입으로
잡혔다면 입력②·③의 이름을 같게 맞춰 다시 올리세요.</li>
</ul>

<h3>전입자가 전 병동 근무기록을 가져온 경우</h3>
<p>이력을 붙여넣으면 전입자도 계속 근무해온 사람과 똑같이 이어집니다. <b>안전 문제라 권장합니다</b> —
전 병동에서 야간을 서고 온 사람에게 1일부터 근무를 넣으면 야간 후 휴식 규칙이 깨지는데, 이력이
있으면 자동으로 막힙니다.</p>
<ol>
<li>출력②(연간근무표)를 받아 엽니다.</li>
<li><b>기존 인원 목록 바로 아래</b>(맨 아래 '레벨평균' 통계 줄보다 위)에 행을 추가합니다 —
통계 줄 뒤에 넣으면 읽히지 않습니다(넣으면 경고로 알려드립니다).</li>
<li><b>'전입' 칸에서 '전입'을 고릅니다</b>(드롭다운).</li>
<li><b>월중에 온 사람이면 '전입일' 칸에 날짜</b>를 넣습니다(날짜 셀). 비우면 1일자 전입.
날짜가 있어야 입사 전 날짜가 배정에서 빠지고, 이월정보가 입사 전날 기준으로 잡히며,
잔휴도 재직 기간분만 적립됩니다.</li>
<li>날짜 칸에 전 병동 근무기록을 날짜 맞춰 붙여넣습니다(<b>최소 1개월, 3개월 권장</b>).</li>
<li><b>잔휴 칸에 전 병동에서 받은 숫자</b>를 적습니다 — 잔휴만은 근무표로 계산할 수 없어 사람이
넣어야 합니다(비우면 0으로 진행하고 경고).</li>
</ol>
<p>누적통계 칸은 비워둬도 됩니다 — 부서 누적 실적은 우리 병동 입사 시점부터 0에서 시작합니다.
모르는 근무표기가 있으면 그 칸만 빈칸 처리하고 목록으로 알려드립니다.</p>

<h3>생성 이후</h3>
<p>"근무표 생성" 버튼을 누르면 자동 배정된 결과 화면으로 넘어갑니다. 그 화면에서는 같은 자리에
<b>출력정보 설명서</b>가 대신 나와 편집·다운로드 방법을 안내합니다.</p>

${INFO_RULES}
${INFO_NEXT_MONTH}
${INFO_MORE}
`;

const INFO_HTML_OUTPUT = `
<h3>근무표가 만들어졌습니다</h3>
<ul>
<li><b>편집</b> — 그리드에서 칸을 클릭해 근무를 바꾸면 오른쪽에 스테이징됩니다(주황 점선 테두리).
바꾼 칸과 관련된 규칙 위반이 있으면 바로 알려줍니다. 파트장 칸은 잠겨 있어 화면에서 직접
수정할 수 없습니다.</li>
<li><b>재생성 적용</b> — 스테이징한 편집을 고정한 채 나머지를 다시 배정합니다. 고정된 칸은 빨간
실선 테두리로 표시되고, <b>이후 몇 번을 더 수정해도 이전 고정은 계속 유지됩니다.</b> 편집을
스테이징한 상태(재생성 적용 전)에는 아래 두 다운로드 버튼이 잠시 비활성화됩니다 — 재생성
적용으로 확정한 뒤 다시 눌러야 받을 수 있습니다.</li>
<li><b>다운로드</b> — <b>월간근무표</b>(병원 OCS 형식, 부서 배포·기록용)와 <b>연간근무표</b>(다음 달
입력③으로 바로 재사용 — 이월정보·형평성 지표가 여기 하나로 이어짐) 두 파일을 꼭 둘 다 받아 보관하세요.</li>
</ul>

<h3>근무표 그리드의 계산열</h3>
<p>날짜 칸 앞뒤로 병원 OCS 파일과 같은 자리에 계산열을 보여줍니다. 칸을 수정하면 재생성 적용을
누르기 전에도 바로 값이 바뀝니다.</p>
<ul>
<li><b>잔휴전월 / 잔휴이후</b> — 이월된 잔여 휴무 기준으로 자동 계산됩니다.</li>
<li><b>D / E / N</b> — 이번 달 근무유형별 횟수입니다.</li>
<li><b>® / ⓡ</b> — 병원 HR 전용 항목이라 이 앱은 값을 몰라 항상 빈칸입니다(다운로드 파일과 동일).</li>
<li><b>금월</b> — 이번 달 휴일수(전 직원 공통) · <b>Lv</b> — 직급입니다.</li>
</ul>

${INFO_SHIFT_LEGEND}

<h3>"개인별 OFF·야간·근무일" 표의 야간편차</h3>
<p>일반 간호사 평균(파트장·NK 제외) 야간근무 대비 편차를 보여줍니다. ±2일 이상이면 색으로
강조되니, 다음 달 야간 배정을 공평하게 나눌 때 참고하세요.</p>

${INFO_RULES}
${INFO_NEXT_MONTH}
${INFO_MORE}
`;

// 입력화면·결과화면에서 버튼 라벨과 모달 내용이 함께 바뀐다(같은 자리, 화면에 맞는 설명서).
function updateInfoLabel(isOutput) {
  $("#infoBtn").textContent = isOutput ? "📗 출력정보 설명서" : "📘 입력정보 설명서";
}
$("#infoBtn").onclick = () => {
  const isOutput = $("#intake").style.display === "none";
  $("#infoModalTitle").textContent = isOutput ? "출력정보 설명서" : "입력정보 설명서";
  $("#infoBody").innerHTML = isOutput ? INFO_HTML_OUTPUT : INFO_HTML_INPUT;
  $("#infoModalBackdrop").classList.add("show");
};
$("#closeInfoBtn").onclick = () => $("#infoModalBackdrop").classList.remove("show");
$("#infoModalBackdrop").onclick = (e) => { if (e.target.id === "infoModalBackdrop") e.currentTarget.classList.remove("show"); };

// ================================================================ 입력 폼 채우기

function populateYearMonthSelects() {
  const curYear = new Date().getFullYear();
  $("#f_year").innerHTML = Array.from({ length: 7 }, (_, i) => curYear - 1 + i)
    .map(y => `<option value="${y}">${y}년</option>`).join("");
  $("#f_month").innerHTML = Array.from({ length: 12 }, (_, i) => i + 1)
    .map(m => `<option value="${m}">${m}월</option>`).join("");
}
populateYearMonthSelects();

$("#f_year").onchange = () => { seedHolidaysForYear(parseInt($("#f_year").value, 10)); renderHolidayCalendar(); };
$("#f_month").onchange = () => renderHolidayCalendar();

function renderHolidayCalendar() {
  const y = parseInt($("#f_year").value, 10);
  const m = parseInt($("#f_month").value, 10);
  if (!y || !m) return;
  const startDow = new Date(y, m - 1, 1).getDay();   // 0=일
  const numDays = new Date(y, m, 0).getDate();
  const holSet = new Set(formHolidays);
  const subSet = new Set(formSubHolidays);
  const todayIso = new Date().toISOString().slice(0, 10);

  let html = '<table class="cal-table"><thead><tr>';
  for (const w of ["일", "월", "화", "수", "목", "금", "토"]) html += `<th>${w}</th>`;
  html += "</tr></thead><tbody><tr>";
  for (let i = 0; i < startDow; i++) html += '<td class="cal-empty"></td>';
  let col = startDow;
  for (let day = 1; day <= numDays; day++) {
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dow = col % 7;
    let cls = "cal-day";
    if (dow === 0) cls += " cal-sun";
    if (dow === 6) cls += " cal-sat";
    if (holSet.has(iso)) cls += " cal-hol";
    else if (subSet.has(iso)) cls += " cal-sub";
    if (iso === todayIso) cls += " cal-today";
    html += `<td class="${cls}" onclick="toggleHolidayDate('${iso}')">${day}</td>`;
    col++;
    if (col % 7 === 0 && day !== numDays) html += "</tr><tr>";
  }
  if (col % 7 !== 0) for (let i = col % 7; i < 7; i++) html += '<td class="cal-empty"></td>';
  html += "</tr></tbody></table>";
  $("#holidayCalendar").innerHTML = html;
}

window.toggleHolidayDate = function (iso) {
  if (formHolidays.includes(iso)) {
    formHolidays = formHolidays.filter(d => d !== iso);
    formSubHolidays.push(iso);
  } else if (formSubHolidays.includes(iso)) {
    formSubHolidays = formSubHolidays.filter(d => d !== iso);
  } else {
    formHolidays.push(iso);
  }
  renderHolidayCalendar();
};

function fillForm(cfg) {
  $("#f_ward").value = cfg.ward_id || "";
  $("#f_year").value = cfg.year;
  $("#f_month").value = cfg.month;
  const p = cfg.params || {};
  $("#f_maxnights").value = p.off_max_per_month ?? 6;
  $("#f_maxconsecutive").value = p.max_consecutive_work ?? 5;
  $("#f_nightquota_low").value = p.night_quota_low ?? 4;
  $("#f_nightquota_high").value = p.night_quota_high ?? 6;
  $("#f_advanced_track").value = (p.advanced_track_staff || []).join("\n");
  updateAdvancedTrackCount();
  formHolidays = [...(p.holidays || [])];
  formSubHolidays = [...(p.substitute_holidays || [])];
  renderHolidayCalendar();

  // 입력①에도 인원 정보가 있으면 일단 반영한다 — 다만 입력②가 이미 명단을 줬다면
  // 그쪽이 이긴다(입력①의 인원 기능은 과도기 지원용). 우선순위 판단은 recomputeStaff()가
  // 한다 — 여기서 formStaff를 직접 덮어쓰면 입력② 다음에 입력①을 올렸을 때 명단 출처가
  // 어긋난다.
  staffOfInput1 = (cfg.staff || []).map(s => ({
    id: s.id, role: s.role, level: s.level,
    allowed: [...(s.allowed_shifts || [])], flags: [...(s.flags || [])],
  }));
  recomputeStaff();

  $("#f_team_b").value = (p.team_b_names || []).join("\n");
  updateTeamBCount();

  const ms = p.min_staff || {};
  for (const [key] of MIN_STAFF_ROWS) {
    for (const [col] of MIN_STAFF_COLS) {
      const el = document.getElementById(`ms_${key}_${col}`);
      if (el) el.value = (ms[col] && ms[col][key] !== undefined) ? ms[col][key] : 0;
    }
  }

  formRequests = (cfg.requests || []).map(r => ({ ...r, priority: r.priority ?? 1 }));

  formCarryover = Object.entries(cfg.prev_month_carryover || {}).map(([sid, v]) => ({
    staff_id: sid, last_shift_type: v.last_shift_type || "OFF",
    consecutive_work_days: v.consecutive_work_days || 0,
    night_block_remaining_off: v.night_block_remaining_off || 0,
    trailing_night_count: v.trailing_night_count || 0,
  }));
}

function renderMinStaffTable() {
  const tbody = $("#minStaffTable tbody");
  tbody.innerHTML = MIN_STAFF_ROWS.map(([key, label]) => {
    const cells = MIN_STAFF_COLS.map(([col, colLabel]) =>
      `<td data-label="${colLabel}"><input type="number" min="0" id="ms_${key}_${col}" value="0"></td>`).join("");
    return `<tr><td data-label="근무"><b>${label}</b></td>${cells}</tr>`;
  }).join("");
}
renderMinStaffTable();

// 인원(직급/숙련도/가능근무/비고) · 원티드 신청 · 전월이월은 더 이상 화면에서 직접
// 타이핑하지 않는다 — 인원+원티드는 입력②, 전월이월은 입력③이 전담한다(둘 다 파일
// 업로드로만 채워짐). formStaff/formRequests/formCarryover는 여전히 그 업로드 결과를
// 담는 내부 상태로 남아있고, 아래 요약 텍스트로만 화면에 반영 상태를 보여준다.
function renderStaffSummary() {
  const el = $("#staffSummary");
  if (!el) return;
  el.textContent = formStaff.length ? `현재 인원: ${formStaff.length}명` : "";
}

function updateTeamBCount() {
  const n = teamBNamesFromForm().length;
  $("#teamBCount").textContent = n ? `${n}명` : "";
}
function teamBNamesFromForm() {
  return $("#f_team_b").value.split("\n").map(s => s.trim()).filter(Boolean);
}
$("#f_team_b").oninput = updateTeamBCount;

function updateAdvancedTrackCount() {
  const n = advancedTrackFromForm().length;
  $("#advancedTrackCount").textContent = n ? `${n}명` : "";
}
function advancedTrackFromForm() {
  return $("#f_advanced_track").value.split("\n").map(s => s.trim()).filter(Boolean);
}
$("#f_advanced_track").oninput = updateAdvancedTrackCount;

function buildCfgFromForm() {
  const holidays = [...formHolidays];
  const subhol = [...formSubHolidays];
  const minStaff = {};
  for (const [col] of MIN_STAFF_COLS) {
    minStaff[col] = {};
    for (const [key] of MIN_STAFF_ROWS) {
      minStaff[col][key] = parseInt(document.getElementById(`ms_${key}_${col}`).value || "0", 10);
    }
  }
  const nkCount = formStaff.filter(s => s.flags.includes("night_only")).length;
  const carry = {};
  for (const c of formCarryover) {
    if (!c.staff_id) continue;
    carry[c.staff_id] = {
      last_shift_type: c.last_shift_type, consecutive_work_days: c.consecutive_work_days,
      night_block_remaining_off: c.night_block_remaining_off,
      night_block_in_progress: c.trailing_night_count === 1,
      trailing_night_count: c.trailing_night_count,
    };
  }
  return {
    ward_id: $("#f_ward").value,
    year: parseInt($("#f_year").value, 10),
    month: parseInt($("#f_month").value, 10),
    staff: formStaff.map(s => ({ id: s.id, role: s.role, level: s.level,
                                 allowed_shifts: s.allowed, flags: s.flags })),
    params: {
      nk_count: nkCount, min_staff: minStaff,
      leader_8a_as_prn: false,  // 웹 UI에 없는 설정이라 항상 기본값
      off_max_per_month: parseInt($("#f_maxnights").value || "6", 10),
      max_consecutive_work: parseInt($("#f_maxconsecutive").value || "5", 10),
      night_quota_low: parseInt($("#f_nightquota_low").value || "4", 10),
      night_quota_high: parseInt($("#f_nightquota_high").value || "6", 10),
      holidays, substitute_holidays: subhol,
      advanced_track_staff: advancedTrackFromForm(),
      team_b_names: teamBNamesFromForm(),
    },
    prev_month_carryover: carry,
    requests: formRequests.filter(r => r.staff_id && r.date),
  };
}

// ================================================================ 업로드 / 생성
// "업로드"·"양식(다운로드)" 둘 다 일부러 진짜 <button>으로 통일했다 — 삼성인터넷
// 등에서 헤더의 "프로그램 정보·사용법"(진짜 <button>)은 다크모드에서 색이 살아있는데
// <label>/<a>로 만들었던 이전 버전은 오히려 투명하게 보이는 문제가 있었다. <button>
// 끼리는 브라우저가 뭘 하든 최소한 서로 똑같이 처리되므로, 둘 다 <button>으로
// 맞추는 쪽이 "둘이 서로 다르게 보이는" 문제를 가장 확실하게 막는다.
document.querySelectorAll(".upload-btn[data-target]").forEach(btn => {
  btn.onclick = () => $("#" + btn.dataset.target).click();
});
// "양식(다운로드)" — <a download>였던 걸 <button>으로 바꿨으니, 클릭 시 임시 <a>를
// 만들어 다운로드를 대신 트리거한다(파일명 지정 등 기존 동작은 그대로 유지).
document.querySelectorAll(".upload-btn[data-href]").forEach(btn => {
  btn.onclick = () => {
    const a = document.createElement("a");
    a.href = btn.dataset.href;
    a.download = btn.dataset.download || "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
});

$("#fileInput").onchange = async () => {
  const f = $("#fileInput").files[0];
  if (!f) return;
  const statusEl = $("#uploadStatus");
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const data = await api("/api/upload", { _fileBytes: bytes });
    fillForm(data.cfg);  // 표를 통째로 새 값으로 덮어씀 — 재업로드해도 이전 값이 안 섞인다
    clearUploadError(statusEl);
    statusEl.textContent = `"${f.name}" 값으로 표를 채웠습니다 — 검토 후 생성을 누르세요`;
    $("#fileClearBtn").style.display = "";
    showToast("업로드한 값으로 표를 채웠습니다");
  } catch (e) {
    // 업로드가 반려돼도(값은 그대로) 화면엔 오류 문구가 계속 남으므로, 지울 방법이
    // 있어야 한다 — 반영 해제 버튼을 오류 지우기 용도로 그대로 재사용한다.
    showUploadError(statusEl, e);
    $("#fileClearBtn").style.display = "";
  } finally { $("#fileInput").value = ""; }
};

$("#fileClearBtn").onclick = () => {
  const statusEl = $("#uploadStatus");
  if (statusEl.classList.contains("upload-error")) {
    clearUploadError(statusEl);
    statusEl.textContent = "";
    $("#fileClearBtn").style.display = "none";
    return;
  }
  // 입력①이 준 명단만 걷어낸다 — 입력②·③이 준 명단까지 같이 지우면 안 된다.
  staffOfInput1 = [];
  recomputeStaff();
  statusEl.textContent = "반영 해제했습니다 — 인원표를 다시 올리세요.";
  $("#fileClearBtn").style.display = "none";
  showToast("입력① 반영을 해제했습니다");
};

// 실제로 쓸 인원 명단을 한 곳에서 정한다 — 입력②(이번 달 명단) > 입력③(지난달 명단)
// > 입력①(과도기) 순. 파일을 올리거나 반영을 해제할 때마다 이 함수만 부르면 되고,
// 그래서 업로드 순서에 따라 상태가 꼬이지 않는다.
function recomputeStaff() {
  staffFromWanted = staffOfWanted.length > 0;
  formStaff = staffFromWanted ? staffOfWanted
            : (staffOfAnnual.length ? staffOfAnnual : staffOfInput1);
  renderStaffSummary();
  renderRosterDiff();
}

// 입력②(이번 달 명단)와 입력③(지난달 명단)을 대조해 전입·전출을 화면에 명시한다.
// 둘 다 올라와 있을 때만 의미가 있다(한쪽만 있으면 비교 대상이 없음).
function renderRosterDiff() {
  const box = $("#rosterDiff");
  if (!box) return;
  if (!staffFromWanted || !prevRosterNames.length) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }
  const prev = new Set(prevRosterNames);
  const cur = new Set(formStaff.map(s => s.id));
  const incoming = formStaff.map(s => s.id).filter(n => !prev.has(n));
  const outgoing = prevRosterNames.filter(n => !cur.has(n));
  // 전 병동 기록을 가져온 전입자는 입력③에도 행이 있어 차집합에 안 잡힌다 — 따로 센다.
  const withHistory = transferredInNames.filter(n => cur.has(n));
  if (!incoming.length && !outgoing.length && !withHistory.length) {
    box.style.display = "";
    box.className = "roster-diff same";
    box.innerHTML = `✓ 인원 변동 없음 — 입력②·③ 명단 ${cur.size}명이 모두 일치합니다.`;
    return;
  }
  let html = "";
  if (incoming.length) {
    html += `<div><b>전입 ${incoming.length}명</b> (입력②에만 있음): ${incoming.map(esc).join(", ")}`
         +  `<span class="hint"> — 이월정보(잔휴·연속근무)가 없습니다. 전 병동 근무기록이 있으면 입력③에 행을 추가하고 비고에 '전입'이라 적어 붙여넣으세요. 이름 오타라면 입력②·③을 같게 맞춰주세요.</span></div>`;
  }
  if (withHistory.length) {
    html += `<div><b>전입(이력 반영) ${withHistory.length}명</b>: ${withHistory.map(esc).join(", ")}`
         +  `<span class="hint"> — 붙여넣은 전 병동 기록으로 이월정보·야간 형평성을 계산합니다. 부서 누적 실적은 이번 달부터 0에서 시작합니다.</span></div>`;
  }
  if (outgoing.length) {
    html += `<div><b>전출 ${outgoing.length}명</b> (입력③에만 있음): ${outgoing.map(esc).join(", ")}`
         +  `<span class="hint"> — 이번 달 배정에서 빠지고, 누적 이력은 연간근무표에 보존됩니다.</span></div>`;
  }
  box.style.display = "";
  box.className = "roster-diff";
  box.innerHTML = html;
}

$("#wantedInput").onchange = async () => {
  const f = $("#wantedInput").files[0];
  if (!f) return;
  const statusEl = $("#wantedStatus");
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const data = await api("/api/upload_wanted", { _fileBytes: bytes });
    // 화면에 설정된 연/월과 파일의 연/월이 다르면 받지 않는다. 신청 날짜는 엔진이
    // 어차피 반려하지만 '인원 명단'은 조용히 반영돼, 지난달 명단으로 이번 달 근무표가
    // 만들어질 수 있다(이번 달 전입자가 통째로 빠진다).
    const selY = parseInt($("#f_year").value, 10);
    const selM = parseInt($("#f_month").value, 10);
    if (data.year !== selY || data.month !== selM) {
      throw new Error(
        `이 파일은 ${data.year}년 ${data.month}월 표인데 지금 설정은 ${selY}년 ${selM}월입니다 — ` +
        `설정의 연·월을 파일에 맞추시거나, "양식(다운로드)"로 ${selY}년 ${selM}월 양식을 ` +
        `새로 받아 채워 올려주세요.`);
    }
    formRequests = data.requests.map(r => ({ ...r, priority: 1 }));  // 이전 신청 목록을 통째로 대체
    // 이 파일에 인원 정보(직급·숙련도·가능근무·비고)가 있으면 항상 우선해서 덮어쓴다 —
    // 입력②는 '이번 달 명단(미래)'이라 명단의 최종 기준이다(입력①·③보다 항상 우선).
    const staffUpdated = (data.staff || []).length > 0;
    if (staffUpdated) {
      staffOfWanted = data.staff.map(s => ({
        id: s.id, role: s.role, level: s.level,
        allowed: [...(s.allowed_shifts || [])], flags: [...(s.flags || [])],
      }));
      recomputeStaff();
    }
    const teamB = data.team_b_names || [];
    if (teamB.length) {
      $("#f_team_b").value = teamB.join("\n");
      updateTeamBCount();
    }
    const unk = (data.unknown_marks || []).length;
    clearUploadError(statusEl);
    statusEl.textContent =
      `${data.year}년 ${data.month}월 표에서 신청 ${formRequests.length}건` +
      (staffUpdated ? `, 인원 ${data.staff.length}명 인식` : " 인식") +
      (teamB.length ? `, B팀 ${teamB.length}명 인식` : "") +
      (unk ? ` (인식 못 한 표시 ${unk}개: ${data.unknown_marks.join(", ")})` : "");
    $("#wantedClearBtn").style.display = "";
    showToast(data.warning ||
      `원티드 ${formRequests.length}건${staffUpdated ? `, 인원 ${data.staff.length}명` : ""}` +
      `${teamB.length ? `, B팀 ${teamB.length}명` : ""}을 자동으로 채웠습니다`,
      !!data.warning);
  } catch (e) {
    // 업로드가 반려돼도(값은 그대로) 화면엔 오류 문구가 계속 남으므로, 지울 방법이
    // 있어야 한다 — 반영 해제 버튼을 오류 지우기 용도로 그대로 재사용한다.
    showUploadError(statusEl, e);
    $("#wantedClearBtn").style.display = "";
  } finally { $("#wantedInput").value = ""; }
};

$("#wantedClearBtn").onclick = () => {
  const statusEl = $("#wantedStatus");
  if (statusEl.classList.contains("upload-error")) {
    clearUploadError(statusEl);
    statusEl.textContent = "";
    $("#wantedClearBtn").style.display = "none";
    return;
  }
  // 신청만 지우고 끝내면, 입력②가 채운 '명단'은 그대로 남아 해제했다고 생각한 명단으로
  // 계속 근무표가 만들어진다 — 신청·명단·B팀을 함께 되돌리고, 입력③(없으면 입력①)이
  // 준 명단으로 복원한다.
  formRequests = [];
  staffOfWanted = [];
  recomputeStaff();
  $("#f_team_b").value = "";
  updateTeamBCount();
  statusEl.textContent = formStaff.length
    ? `반영 해제했습니다 — 명단은 ${staffOfAnnual.length ? "입력③" : "입력①"}(${formStaff.length}명) 기준으로 돌아갔습니다.`
    : "반영 해제했습니다 — 현재 인원 명단이 없습니다.";
  $("#wantedClearBtn").style.display = "none";
  showToast("입력② 반영을 해제했습니다");
};

async function refreshStaffTableStatus() {
  let s;
  try { s = await api("/api/staff_table_status"); } catch (e) { return; }
  const banner = $("#staffTableActive");
  const clearBtn = $("#staffTableClearBtn");
  if (s.loaded) {
    banner.style.display = "";
    banner.style.color = "var(--warn)";
    banner.style.fontWeight = "700";
    banner.textContent = `⚠ 연간근무표 반영 중 — ${s.staff_count}명, ${s.last_date || "?"}까지` +
      ` (연간 ${s.annual_days}일치). "생성"을 누르면 이 값이 계속 자동으로 쓰입니다.` +
      ` 최신 연간근무표를 다시 안 올렸다면 확인하세요.`;
    clearBtn.style.display = "";
  } else {
    banner.style.display = "none";
    clearBtn.style.display = "none";
  }
}

$("#staffTableClearBtn").onclick = async () => {
  const statusEl = $("#staffTableStatus");
  if (statusEl.classList.contains("upload-error")) {
    clearUploadError(statusEl);
    statusEl.textContent = "";
    // 서버 쪽에 실제로 반영된 값이 없을 수도 있으니(업로드가 반려됐던 경우),
    // 진짜 상태를 다시 물어봐서 버튼을 그 상태에 맞게 되돌린다.
    await refreshStaffTableStatus();
    return;
  }
  try {
    await api("/api/clear_staff_table", { method: "POST" });
    await refreshStaffTableStatus();
    prevRosterNames = [];
    transferredInNames = [];
    // 입력③이 준 명단도 같이 걷어낸다 — 안 그러면 해제한 파일의 명단이 그대로 남아
    // 입력①까지 해제해도 인원이 사라지지 않는다.
    staffOfAnnual = [];
    recomputeStaff();
    statusEl.textContent = "반영 해제했습니다 — 이번 생성은 처음부터 시작합니다.";
    showToast("연간근무표 반영을 해제했습니다");
  } catch (e) {}
};

$("#staffTableInput").onchange = async () => {
  const f = $("#staffTableInput").files[0];
  if (!f) return;
  const statusEl = $("#staffTableStatus");
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const data = await api("/api/upload_staff_table", { _fileBytes: bytes });
    // 입력③은 '지난달 실적(과거)'이다. 입력②(이번 달 명단, 미래)가 이미 명단을 채웠다면
    // 절대 덮어쓰지 않는다 — 덮어쓰면 이번 달 전입자가 조용히 사라진다. 이 경우 여기서
    // 읽은 명단은 전입·전출 대조용으로만 쓴다. 입력②가 아직 없을 때만 출발점으로 채운다.
    prevRosterNames = (data.staff || []).map(s => s.id);
    transferredInNames = data.transferred_in || [];
    staffOfAnnual = (data.staff || []).map(s => ({
      id: s.id, role: s.role, level: s.level,
      allowed: [...(s.allowed_shifts || [])], flags: [...(s.flags || [])],
    }));
    recomputeStaff();
    const teamB = data.team_b_names || [];
    if (teamB.length) {
      $("#f_team_b").value = teamB.join("\n");
      updateTeamBCount();
    }
    clearUploadError(statusEl);
    const kept = staffFromWanted
      ? `명단은 입력②(${formStaff.length}명) 기준 유지, 누적 통계·이월정보만 반영`
      : `인원 ${formStaff.length}명, 누적 통계·이월정보 반영`;
    const dep = (data.departed_names || []).length;
    const stranded = (data.rows_after_summary || []);
    statusEl.textContent =
      `${kept} (연간 근무표 ${data.annual_days}일치 포함)` +
      (teamB.length ? `, B팀 ${teamB.length}명 인식` : "") +
      (transferredInNames.length ? `, 전입(이력) ${transferredInNames.length}명 인식` : "") +
      (dep ? `, 기존 전출자 ${dep}명 이력 보존` : "") +
      (stranded.length
        ? ` — ⚠ 맨 아래 통계 줄 뒤의 행 ${stranded.length}건(${stranded.join(", ")})은 읽지 못했습니다. 사람 행은 통계 줄 위에 넣어주세요.`
        : "");
    await refreshStaffTableStatus();
    showToast(staffFromWanted
      ? "연간근무표에서 누적 통계·전월 이월정보를 불러왔습니다 (명단은 입력② 기준 유지)"
      : "연간근무표에서 인원 명단·누적 통계·전월 이월정보를 불러왔습니다");
  } catch (e) {
    // 업로드가 반려돼도(값은 그대로) 화면엔 오류 문구가 계속 남으므로, 지울 방법이
    // 있어야 한다 — 반영 해제 버튼을 오류 지우기 용도로 그대로 재사용한다.
    showUploadError(statusEl, e);
    $("#staffTableClearBtn").style.display = "";
  } finally { $("#staffTableInput").value = ""; }
};

// 생성/재생성은 인원이 많으면 수십 초~1~2분 걸릴 수 있다. Worker 덕분에 화면
// 자체는 멈추지 않지만, 진행 상황을 안내하는 오버레이는 그대로 띄워준다.
//
// 진행 게이지: 서버가 진행률을 알려주지 않으므로(생성이 끝나야 응답이 옴) 실제
// 진행률이 아니라 "경과시간 vs time_budget"으로 추정해서 보여준다 — nurse_scheduler
// /generator.py의 generate_best() 기본 time_budget(10초)과 맞춰뒀다. 대부분의
// 실사용 규모는 이 안에서 끝나 게이지가 자연스럽게 92%까지 차고, 인원이 많아
// 시간예산을 넘기는 드문 경우엔 92~98% 사이에서 천천히 계속 채워서 "멈춘 게
// 아니라 아직 계산 중"임을 보여준다(실제 100%는 응답이 와서 오버레이가 닫힐 때뿐).
const GEN_TIME_BUDGET_SEC = 10;
let genProgressTimer = null;
function showGenOverlay(msg) {
  $("#genOverlayMsg").textContent = msg;
  $("#genOverlay").style.display = "";
  const fill = $("#genProgressFill");
  fill.style.width = "0%";
  const t0 = Date.now();
  clearInterval(genProgressTimer);
  genProgressTimer = setInterval(() => {
    const elapsed = (Date.now() - t0) / 1000;
    const pct = elapsed <= GEN_TIME_BUDGET_SEC
      ? (elapsed / GEN_TIME_BUDGET_SEC) * 92
      : 92 + Math.min(6, (elapsed - GEN_TIME_BUDGET_SEC) * 0.5);
    fill.style.width = pct.toFixed(1) + "%";
  }, 200);
}
function hideGenOverlay() {
  $("#genOverlay").style.display = "none";
  clearInterval(genProgressTimer);
  genProgressTimer = null;
}

// 입력①②③ 중 하나라도 업로드가 반려된 채(빨간 오류 문구가 아직 안 지워진 채)
// 남아있으면, 그 파일은 반영되지 않았다는 뜻이다 — 이 상태에서 그냥 생성하면
// 사용자가 방금 올린 값이 반영됐다고 착각한 채 옛 값으로 근무표가 만들어질 수
// 있으므로, 생성 자체를 막고 어느 입력에 문제가 남아있는지 알려준다.
function unresolvedUploadErrors() {
  return [["#uploadStatus", "입력①"], ["#wantedStatus", "입력②"], ["#staffTableStatus", "입력③"]]
    .filter(([sel]) => $(sel)?.classList.contains("upload-error"))
    .map(([, label]) => label);
}

async function runGenerate(btn, statusEl) {
  const unresolved = unresolvedUploadErrors();
  if (unresolved.length) {
    showToast(`${unresolved.join(", ")}에 아직 해결되지 않은 업로드 오류가 있습니다 — 오류 문구를 ` +
      `지우거나(반영 해제) 파일을 고쳐 다시 올린 뒤 생성하세요`, true);
    return;
  }
  const btns = [$("#generateBtn"), $("#generateBtnMid")].filter(Boolean);
  btns.forEach(b => b.disabled = true);
  if (statusEl) statusEl.textContent = "생성 중...";
  showGenOverlay("근무표를 생성하는 중입니다…");
  try {
    const cfg = buildCfgFromForm();
    const cfgResult = await api("/api/set_config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    lastConfigWarning = cfgResult.warning || null;
    ST = await api("/api/generate", { method: "POST" });
    render();
    showToast(lastConfigWarning || "근무표 생성 완료", !!lastConfigWarning);
  } catch (e) {
    if (statusEl) statusEl.textContent = "";
  } finally {
    btns.forEach(b => b.disabled = false);
    // "생성 중..."은 진행 표시일 뿐이라 성공/실패와 무관하게 항상 지운다.
    // (예전엔 성공 시 남겨뒀는데, 결과 화면에서 "입력으로 돌아가기"를 누르면
    //  그 문구가 그대로 남아 있어 다시 생성 중인 것처럼 보였다.)
    if (statusEl) statusEl.textContent = "";
    hideGenOverlay();
  }
}
$("#generateBtn").onclick = () => runGenerate($("#generateBtn"), $("#genStatus"));
const generateBtnMid = $("#generateBtnMid");
if (generateBtnMid) {
  generateBtnMid.onclick = () => runGenerate(generateBtnMid, $("#genStatusMid"));
}

// 페이지 로드 시: Pyodide(브라우저 안 Python) 부팅 → 샘플 데이터로 폼 기본 채움
(async function boot() {
  try {
    await bootPyodide();
  } catch (e) {
    console.error(e);
    document.getElementById("loadingMsg").textContent =
      "불러오기 실패: " + (e && e.message ? e.message : String(e));
    document.querySelector(".loading-box").classList.add("err");
    return;
  }
  document.getElementById("loadingOverlay").style.display = "none";
  document.getElementById("app").style.display = "";
  try {
    const cfg = await api("/api/sample");
    fillForm(cfg);
  } catch (e) {
    showToast("샘플 로드 실패 — 직접 입력해주세요", true);
  }
  refreshStaffTableStatus();
})();

// ================================================================ 그리드 렌더 (생성 후)

function shiftClass(v) { return SHIFT_CLASS[v] || ""; }
// OFF는 "·" 대신 원티드오프="X" / 일반오프="/"로 표시(병원 표준 표기) — 셀의 실제 값(v)은
// 편집·순환·드롭다운이 기준으로 쓰는 "OFF" 그대로 유지되고, 화면 표시 글자만 바뀐다.
function shiftText(v, isWanted) {
  if (v === "OFF") return isWanted ? "X" : "/";
  return SHIFT_TEXT[v] !== undefined ? SHIFT_TEXT[v] : v;
}

function render() {
  if (!ST) return;
  $("#intake").style.display = "none";
  gridContent.style.display = "block";
  sidePane.style.display = "block";
  updateInfoLabel(true);
  renderGrid();
  renderSide();
  // 모바일은 화면 전체가 스크롤되는 구조라, 생성 전 스크롤 위치가 그대로
  // 남으면 결과 화면이 맨 아래에서 시작한 것처럼 보인다 — 맨 위(근무표)로 리셋.
  window.scrollTo(0, 0);
  gridPane.scrollTop = 0;
}

function renderGrid() {
  const lockedSet = new Set(ST.locked);
  const pendingSet = new Set(ST.pending);
  const wantedSet = new Set(ST.wanted || []);
  // 위반 목록(사이드바)엔 있는데 그리드 어디인지 셀 하나하나 세어봐야 했던 문제 —
  // staff_id+day가 둘 다 있는 위반(H1-1/H1-4/H1-5처럼 특정 칸이 아니라 "그날 전체"를
  // 가리키는 항목은 staff_id가 없어 자연히 빠짐)만 해당 칸에 표시로 옮겨 붙인다.
  // H6-1처럼 "블록" 단위 규칙은 위반 데이터에 블록 시작일만 기록돼 있어, 지금은
  // 그 시작일 칸에만 표시된다(블록 전체가 아님 — 추후 필요하면 개선).
  const violMap = new Map();
  for (const v of (ST.report && ST.report.hard) || []) {
    if (!v.staff_id || !v.day) continue;
    const key = `${v.staff_id}:${v.day - 1}`;
    let ent = violMap.get(key);
    if (!ent) { ent = { strict: false, msgs: [] }; violMap.set(key, ent); }
    if (!v.best_effort) ent.strict = true;
    ent.msgs.push(`${v.rule} ${v.message}`);
  }

  let html = '<h2 class="output-title">2. 근무표 출력</h2>';
  const wardLabel = ST.ward_id ? `${esc(ST.ward_id)} · ` : "";
  html += `<p class="output-subtitle">${wardLabel}${ST.year}년 ${ST.month}월</p>`;
  if (lastConfigWarning) {
    html += `<p class="carry-warning">⚠ ${esc(lastConfigWarning)}</p>`;
  }
  html += '<div class="legend">';
  const legendItems = [["D","#BDD7EE"],["E","#F8CBAD"],["N","#1F3864"],["NK","#7030A0"],
                       ["prn","#C6E0B4"],["8A","#D9D9D9"],["9A","#BFBFBF"],["10A","#A6A6A6"],
                       ["T","#B4C7E7"],["연차","#FFE699"],["연1~4","#FFF2CC"],
                       ["S/","#9DC3E6"],["TW","#A9D18E"],["군","#C9C9C9"],
                       ["조","#808080"],["경","#F4B6C2"],["공","#D0CECE"],["병","#F8C9C4"],
                       ["휴","#BFBFBF"],["승","#DDEBF7"]];
  for (const [k, c] of legendItems) html += `<span class="sw"><span class="box" style="background:${c}"></span>${k}</span>`;
  html += `<span class="sw">/ = 오프 · X = 원티드오프</span>`;
  html += `<span class="sw"><span style="outline:2px solid var(--hard);width:13px;height:13px;display:inline-block"></span>확정(고정)</span>`;
  html += `<span class="sw"><span style="outline:2px dashed var(--warn);width:13px;height:13px;display:inline-block"></span>미적용 편집</span>`;
  html += `<span class="sw"><span class="box wanted-swatch"></span>원티드 반영</span>`;
  html += `<span class="sw"><span class="viol-swatch viol-hard-swatch"></span>필수위반</span>`;
  html += `<span class="sw"><span class="viol-swatch viol-soft-swatch"></span>최선노력위반</span>`;
  html += `<button id="backToInputBtn" class="small" style="margin-left:auto">← 입력으로 돌아가기(새로 만들기)</button>`;
  html += "</div>";

  // OCS 형식과 같은 계산열(잔휴·D/E/N·금월·Lv) — 전부 현재 화면 그리드(미적용 편집 포함)로
  // 매번 다시 계산하므로, 칸을 수정하면 재생성 없이도 즉시 값이 바뀐다.
  // ®·ⓡ·T연·R연·부서는 병원 OCS 원본에도 있는 열이라 자리(헤더)는 맞춰서 보여주지만,
  // 이 앱이 추적하지 않는 병원 HR 전용 데이터라 값은 항상 빈칸이다(다운로드 파일과 동일하게
  // ®·ⓡ 자리는 표시하고, T연·R연·부서는 어차피 안 쓰는 인사행정 항목이라 생략).
  // 그리드 자체 스크롤 컨테이너(.grid-scroll)로 감싸지 않으면, 계산열이 늘어 넓어진 표가
  // 모바일에서 페이지 전체를 옆으로 밀어버려(#gridPane이 모바일 화면에서는 overflow:visible이라
  // 표 폭이 그대로 새어나감) 사용법 팝업 같은 position:fixed 요소의 위치가 틀어지는 부작용이 있었다.
  const holCount = ST.days.filter(d => d.weekend).length;
  html += '<div class="grid-scroll"><table class="grid"><thead><tr><th class="nm">이름</th>' +
    '<th class="stat-col">잔휴<br>전월</th><th class="stat-col">잔휴<br>이후</th>';
  for (const d of ST.days) html += `<th class="${d.weekend ? "we" : ""}">${d.n}<br>${d.dow}</th>`;
  html += '<th class="stat-col">D</th><th class="stat-col">E</th><th class="stat-col">N</th>' +
    '<th class="stat-col" title="병원 HR 전용 항목 — 이 앱은 값을 추적하지 않아 항상 빈칸입니다">®</th>' +
    '<th class="stat-col" title="병원 HR 전용 항목 — 이 앱은 값을 추적하지 않아 항상 빈칸입니다">ⓡ</th>' +
    '<th class="stat-col">금월</th><th class="stat-col">Lv</th>';
  html += "</tr></thead><tbody>";

  for (const s of ST.staff) {
    const row = ST.grid[s.id];
    let dCnt = 0, eCnt = 0, nCnt = 0, offCnt = 0;
    for (const v of row) {
      if (v === "D") dCnt++;
      else if (v === "E") eCnt++;
      else if (v === "N" || v === "NK") nCnt++;
      else if (v === "OFF") offCnt++;
    }
    const offBefore = s.off_balance || 0;
    const offAfter = Math.round((offBefore + holCount - offCnt) * 100) / 100;
    html += `<tr><td class="nm">${esc(s.id)}<span class="role">${s.role} Lv${s.level}</span></td>` +
      `<td class="stat-col">${offBefore}</td><td class="stat-col">${offAfter}</td>`;
    for (let d = 0; d < ST.num_days; d++) {
      const v = row[d];
      const key = `${s.id}:${d}`;
      const cls = ["cell", shiftClass(v)];
      const isWanted = wantedSet.has(key);
      if (lockedSet.has(key)) cls.push("locked");
      if (pendingSet.has(key)) cls.push("pending");
      if (isWanted) cls.push("wanted");
      const viol = violMap.get(key);
      let title = "";
      if (viol) {
        cls.push(viol.strict ? "viol-hard" : "viol-soft");
        title = ` title="${escAttr(viol.msgs.join("\n"))}"`;
      }
      const disabled = s.is_partjang;
      if (disabled) cls.push("disabled");
      html += `<td class="${cls.join(" ")}" data-sid="${escAttr(s.id)}" data-day="${d}"${title} ${disabled ? "" : `onclick="openPicker(event,'${escAttr(s.id)}',${d})"`}>` +
              `<span>${esc(shiftText(v, isWanted))}</span></td>`;
    }
    html += `<td class="stat-col">${dCnt}</td><td class="stat-col">${eCnt}</td><td class="stat-col">${nCnt}</td>` +
      `<td class="stat-col">–</td><td class="stat-col">–</td>` +
      `<td class="stat-col">${holCount}</td><td class="stat-col">${s.level}</td>`;
    html += "</tr>";
  }
  // B팀(신입) — 스케줄링에는 전혀 관여하지 않는 이름뿐인 목록이라 서버 grid에 없다.
  // 화면에는 구분행 + 빈칸 행으로만 보여준다(파트장이 엑셀에서 직접 배정하는 용도라
  // 여기서는 편집 대상이 아니다 — 파트장 행과 같은 disabled 처리).
  if (ST.team_b && ST.team_b.length) {
    const totalCols = 3 + ST.num_days + 7;  // 이름 + 잔휴2 + 날짜 + 계산열7
    html += `<tr class="team-b-divider"><td colspan="${totalCols}">B팀(신입)</td></tr>`;
    for (const name of ST.team_b) {
      html += `<tr><td class="nm">${esc(name)}<span class="role">B팀</span></td>` +
        `<td class="stat-col">–</td><td class="stat-col">–</td>`;
      for (let d = 0; d < ST.num_days; d++) {
        html += `<td class="cell disabled"><span></span></td>`;
      }
      html += `<td class="stat-col">–</td><td class="stat-col">–</td><td class="stat-col">–</td>` +
        `<td class="stat-col">–</td><td class="stat-col">–</td><td class="stat-col">–</td><td class="stat-col">–</td>`;
      html += "</tr>";
    }
  }
  html += renderDailyLevelFootRows();
  html += "</tbody></table></div>";
  gridContent.innerHTML = html;
  $("#backToInputBtn").onclick = () => {
    ST = null;
    gridContent.style.display = "none";
    gridContent.innerHTML = "";
    annualPane.style.display = "none";
    annualPane.innerHTML = "";
    $("#intake").style.display = "block";
    sidePane.style.display = "none";
    updateInfoLabel(false);
  };
}

// 날짜별 레벨 통계 — 그 날 실제로 근무(D/E/N(NK 포함)/prn(8A 포함))에 배정된 사람들의
// 평균 레벨과, 고랩(Lv4-5)·저랩(Lv1-3) 인원수를 화면 그리드(미적용 편집 포함)에서
// 매번 다시 계산해 그리드 맨 아래 행으로 붙인다 — 잔휴·D/E/N 칸과 같은 패턴으로,
// 파트장이 칸을 수정하면 재생성 없이 즉시 갱신된다.
const LEVEL_SHIFT_KEY = { D: "D", E: "E", N: "N", NK: "N", prn: "prn", "8A": "prn" };

function computeDailyLevelStats() {
  const generals = ST.staff.filter(s => !s.is_partjang);
  const days = [];
  for (let d = 0; d < ST.num_days; d++) {
    const levels = [];
    for (const s of generals) {
      const v = ST.grid[s.id][d];
      if (LEVEL_SHIFT_KEY[v]) levels.push(s.level);
    }
    days.push({
      avg: levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null,
      hi: levels.filter(l => l >= 4).length,
      lo: levels.filter(l => l <= 3).length,
    });
  }
  return days;
}

function renderDailyLevelFootRows() {
  const days = computeDailyLevelStats();
  const blankTail = '<td class="stat-col">–</td>'.repeat(7);
  const blankHead = '<td class="stat-col">–</td><td class="stat-col">–</td>';
  const rowHtml = (label, fmt) =>
    `<tr class="level-foot-row"><td class="nm">${label}</td>${blankHead}` +
    days.map(d => `<td class="stat-col">${fmt(d)}</td>`).join("") +
    `${blankTail}</tr>`;
  // B팀 구분행과 같은 스타일로, 통계 3행 위에도 제목 행을 붙인다.
  const totalCols = 3 + ST.num_days + 7;  // 이름 + 잔휴2 + 날짜 + 계산열7
  const divider = `<tr class="team-b-divider"><td colspan="${totalCols}">통계</td></tr>`;
  return divider +
    rowHtml("레벨평균", d => (d.avg === null ? "–" : d.avg.toFixed(1))) +
    rowHtml("Lv4-5", d => d.hi) +
    rowHtml("Lv1-3", d => d.lo);
}

window.openPicker = function (ev, sid, day) {
  closePicker();
  const staff = ST.staff.find(s => s.id === sid);
  const allowed = new Set(["OFF", "연차", "연1", "연2", "연3", "연4", "S/", "군", "TW", "T",
                           "조", "경", "공", "병", "휴", "승", ...staff.allowed]);
  const cur = ST.grid[sid][day];
  const rect = ev.target.closest("td").getBoundingClientRect();

  const div = document.createElement("div");
  div.className = "picker";
  div.style.left = Math.min(rect.left, window.innerWidth - 230) + "px";
  div.style.top = (rect.bottom + 4) + "px";
  for (const sh of ALL_SHIFTS) {
    if (!allowed.has(sh)) continue;
    const b = document.createElement("button");
    b.textContent = shiftText(sh);
    if (sh === cur) b.classList.add("current");
    b.onclick = (e) => { e.stopPropagation(); stageEdit(sid, day, sh); closePicker(); };
    div.appendChild(b);
  }
  document.body.appendChild(div);
  picker = div;
  ev.stopPropagation();
  setTimeout(() => document.addEventListener("click", closePicker, { once: true }), 0);
};
function closePicker() { if (picker) { picker.remove(); picker = null; } }

async function stageEdit(sid, day, shift) {
  try {
    ST = await api("/api/edit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: sid, day, shift }),
    });
    render();
    refreshFeedback();
  } catch (e) {}
}

async function undoEdit(sid, day) {
  ST = await api("/api/edit/undo", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staff_id: sid, day }),
  });
  render();
  refreshFeedback();
}
window.undoEdit = undoEdit;

// ================================================================ 사이드 패널 (생성 후 정보)

// 검증 요약 상단에 붙일 상태 배너 — "이게 최선인지 아예 안 되는 건지"를 숫자 대신
// 말로 바로 알려준다. hard_count(안전·필수 규칙 위반)와 r.hard.length(최선노력
// 규칙까지 합친 전체 위반) 차이로 셋 중 하나를 가른다:
//   hard_count > 0            → 안전 규칙조차 못 지킴(불가능에 가까움)
//   hard_count === 0 && 잔여 > 0 → 안전 규칙은 다 지켰고 패턴 규칙만 일부 남음(최선)
//   전부 0                     → 완벽 배정
function feasibilityBanner(r) {
  const total = r.hard.length;
  if (r.hard_count > 0) {
    return `<p class="status-banner bad">⚠ 이 조건(인원수·근무인력 기준)으로는 안전 규칙까지
      전부 만족하는 배정을 찾지 못했습니다 — 필수 위반 ${r.hard_count}건이 남았습니다.
      인원을 늘리거나 근무인력 기준을 낮추는 것을 검토해 주세요.</p>`;
  }
  if (total > 0) {
    return `<p class="status-banner warn">이 조건에서 안전 규칙은 모두 지켰습니다. 다만 근무
      패턴 규칙(연속 근무 블록 길이 등) ${total}건은 완벽히 맞추지 못했습니다 — 지금 이게
      찾을 수 있는 최선의 배정입니다.</p>`;
  }
  return "";
}

function renderSide() {
  const r = ST.report;
  const hardCls = r.hard_count === 0 ? "ok" : "bad";

  let html = "";
  html += `<div class="side-sec"><h3>검증 요약</h3>`;
  if (r.timed_out) {
    html += `<p class="status-banner warn">⏱ 시간 제한으로 자동 중단되었습니다 — 지금 결과는
      그 시간 안에서 찾은 최선입니다. 더 나은 결과를 원하면 "근무표 생성"을 다시 눌러보세요
      (무작위 재시도라 결과가 달라질 수 있습니다).</p>`;
  }
  html += feasibilityBanner(r);
  html += `<div class="kpi-row">
    <div class="kpi"><div class="v ${hardCls}">${r.hard_count}</div><div class="l">하드 위반</div></div>
    <div class="kpi"><div class="v">${r.soft_count}</div><div class="l">소프트</div></div>
    <div class="kpi"><div class="v">${ST.round}</div><div class="l">회차</div></div>
  </div>`;
  if (r.hard.length > 0) {
    // 정말 못 채운 것(빨강)과 최선노력 규칙만 남은 것(노랑)을 구분해서 보여준다 —
    // 둘 다 같은 class="hard"로만 나가서 구분이 안 되던 것을 고침.
    // 예전엔 slice(0,8)로 앞 8건만 보여줘서, 위반이 많은 달엔 뒤쪽(특히 날짜순 정렬상
    // 뒤로 밀리는 H6-1 등)이 아무 표시 없이 통째로 안 보였다 — 파트장이 "이건 위반이
    // 아닌가 보다"로 오해할 수 있어, 전부 보여주되 스크롤로 감당한다.
    html += '<ul class="issue-list issue-list-scroll">' + r.hard.map(v =>
      `<li class="${v.best_effort ? "soft" : "hard"}"><span class="rule">${esc(v.rule)}</span>${esc(v.message)}</li>`).join("") + "</ul>";
  }
  html += "</div>";

  // 편집한 게 없는데 "편집 중"이라고 뜨면 혼선을 주므로, 스테이징된 편집이 있을 때만
  // 그 제목을 쓰고 평소엔 그냥 "편집"이라고만 표시한다.
  const hasPending = ST.pending.length > 0;
  html += `<div class="side-sec" id="pendingSec"><h3>${hasPending ? "편집 중 (미적용)" : "편집"}</h3><div id="pendingBody"></div></div>`;

  html += `<div class="side-sec"><h3>다운로드</h3><div class="download-row">
    <button onclick="downloadXlsxOcs()" ${hasPending ? "disabled" : ""}>월간근무표</button>
    <button onclick="downloadStaffTable()" ${hasPending ? "disabled" : ""}>연간근무표</button>
  </div>
  ${hasPending ? '<p class="hint">적용 안 한 편집이 있습니다 — "재생성 적용"을 눌러야 다운로드할 수 있습니다.</p>' : ""}
  </div>`;

  // 입력 요약
  const ps = ST.params_summary;
  html += `<div class="side-sec"><h3>입력 요약</h3><ul class="issue-list" style="font-size:12px">
    <li style="background:var(--code-bg)">${ST.year}년 ${ST.month}월 · ${ST.staff.length}명 ·
    월최대야간 ${ps.max_nights}일 · NK ${ps.nk_count}명 · 공휴일 ${ps.holidays.length}개</li>
  </ul></div>`;

  // 개인별 — 공정 배분 참고용으로 "야간편차"(일반 간호사 평균 대비, 파트장·NK 제외)를 같이 보여준다.
  const staffById = {};
  for (const s of ST.staff) staffById[s.id] = s;
  const nightPool = r.per_person.filter(p => {
    const s = staffById[p.id];
    return s && !s.is_partjang && !s.is_nk;
  });
  const avgNights = nightPool.length
    ? nightPool.reduce((sum, p) => sum + p.nights, 0) / nightPool.length : 0;

  html += '<div class="side-sec"><h3>개인별 OFF·야간·근무일</h3>' +
    `<p class="hint">야간편차 = 일반 간호사 평균(${avgNights.toFixed(1)}일, 파트장·NK 제외) 대비 —
    ±2일 이상이면 다음 달 배정에서 우선 조정 대상으로 참고하면 좋습니다.</p>` +
    '<div style="overflow-x:auto"><table class="person-table"><tr><th>이름</th><th>OFF</th><th>야간</th><th>야간편차</th><th>근무</th></tr>' +
    r.per_person.map(p => {
      const s = staffById[p.id];
      const inPool = s && !s.is_partjang && !s.is_nk;
      let devText = "—", devCls = "";
      if (inPool) {
        const dev = Math.round((p.nights - avgNights) * 10) / 10;
        devText = dev > 0 ? `+${dev}` : `${dev}`;
        if (dev >= 2) devCls = "badge-bad";
        else if (dev <= -2) devCls = "badge-ok";
      }
      return `<tr class="${p.off_ok ? "" : "warn-row"}"><td>${esc(p.id)}</td><td>${p.off}</td>` +
        `<td>${p.nights}</td><td class="${devCls}">${devText}</td><td>${p.workdays}</td></tr>`;
    }).join("") +
    "</table></div></div>";

  // 일별 근무인력
  html += `<div class="side-sec"><h3>일별 근무인력 <span class="count-badge">${r.bad_days_count === 0 ? "전일 충족" : r.bad_days_count + "일 미달"}</span></h3>`;
  if (r.bad_days_count > 0) {
    html += '<table class="mini-table"><tr><th>일</th><th>D</th><th>E</th><th>N</th><th>prn</th></tr>' +
      r.daily.filter(d => !d.ok).map(d =>
        `<tr><td>${d.day}</td><td class="${d.counts.D < d.min.D ? "badge-bad" : ""}">${d.counts.D}/${d.min.D}</td>` +
        `<td class="${d.counts.E < d.min.E ? "badge-bad" : ""}">${d.counts.E}/${d.min.E}</td>` +
        `<td class="${d.counts.N < d.min.N ? "badge-bad" : ""}">${d.counts.N}/${d.min.N}</td>` +
        `<td class="${d.counts.prn < d.min.prn ? "badge-bad" : ""}">${d.counts.prn}/${d.min.prn}</td></tr>`
      ).join("") + "</table>";
  }
  html += "</div>";

  // 야간블록 히스토그램
  const blockH = Object.entries(r.night_block_hist).map(([k, v]) => `${k}일×${v}`).join(", ") || "없음";
  const gapH = Object.entries(r.night_gap_hist).map(([k, v]) => `${k}일×${v}`).join(", ") || "없음";
  html += `<div class="side-sec"><h3>야간 패턴</h3><ul class="issue-list" style="font-size:11.5px">
    <li style="background:var(--code-bg)">블록 길이 분포: ${esc(blockH)}</li>
    <li style="background:var(--code-bg)">블록 간격 분포: ${esc(gapH)}</li>
  </ul></div>`;

  // 원티드 신청 전체
  if (r.requests_all.length > 0) {
    html += `<div class="side-sec"><h3>원티드 신청 <span class="count-badge">${r.requests.accepted}/${r.requests.total} 반영</span></h3>` +
      '<table class="mini-table"><tr><th>이름</th><th>날짜</th><th>유형</th><th>결과</th></tr>' +
      r.requests_all.map(q => `<tr><td>${esc(q.staff_id)}</td><td>${esc(q.date)}</td><td>${esc(q.type)}</td>` +
        `<td class="${q.accepted ? "badge-ok" : "badge-bad"}">${q.accepted ? "수용" :
          `반려<br><span style="font-weight:400;font-size:10px;color:var(--sub)">${esc(q.reason || "")}</span>`}</td></tr>`).join("") +
      "</table></div>";
  }

  // 처리 로그
  if (r.logs.length > 0) {
    html += `<div class="side-sec"><h3>처리 로그 <span class="count-badge">${r.logs.length}건</span></h3>` +
      `<div class="log-box">${r.logs.map(esc).join("\n")}</div></div>`;
  }

  sidePane.innerHTML = html;
  renderPending();
}

function renderAnnualPane() {
  annualPane.innerHTML = `<div class="annual-pane-box">
    <div class="annual-pane-head">
      <h2>연간 근무표</h2>
      <p class="hint">이번 달을 확정 저장하면 다음에 볼 때 최근 달로 계속 쌓여 보입니다.</p>
    </div>
    <button id="finalizeBtn" class="small">📌 이번 달 확정 저장</button>
    <div id="annualBody" style="margin-top:12px"></div>
  </div>`;
  $("#finalizeBtn").onclick = async () => {
    try {
      const r = await api("/api/finalize", { method: "POST" });
      showToast(`${r.saved} 확정 저장 — 연간 근무표에 반영됨`);
      loadAnnualView();
    } catch (e) {}
  };
  loadAnnualView();
}

function renderCompactMonth(m) {
  let html = `<div class="annual-month"><div class="annual-month-title">${m.year}년 ${m.month}월</div>`;
  html += '<div class="annual-grid-wrap"><table class="grid compact-grid"><thead><tr><th class="nm"></th>';
  for (const d of m.days) html += `<th class="${d.weekend ? "we" : ""}">${d.n}</th>`;
  html += '<th class="annual-sum-h">OFF·야간</th></tr></thead><tbody>';
  for (const s of m.staff) {
    const row = m.grid[s.id] || [];
    html += `<tr><td class="nm">${esc(s.id)}</td>`;
    for (let d = 0; d < m.num_days; d++) {
      const v = row[d];
      html += `<td class="cell ${shiftClass(v)}"><span>${esc(shiftText(v))}</span></td>`;
    }
    const sum = m.summary[s.id] || { off: 0, night: 0, workday: 0 };
    html += `<td class="annual-sum">${sum.off} · ${sum.night}</td></tr>`;
  }
  html += "</tbody></table></div></div>";
  return html;
}

async function loadAnnualView() {
  const box = $("#annualBody");
  if (!box) return;
  box.innerHTML = '<p style="color:var(--sub);font-size:12px">불러오는 중...</p>';
  let data;
  try {
    data = await api("/api/annual");
  } catch (e) {
    box.innerHTML = '<p style="color:var(--sub);font-size:12px">연간 근무표를 불러오지 못했습니다.</p>';
    return;
  }
  const months = [data.current, ...data.history];
  let html = '<div class="annual-months">' + months.map(renderCompactMonth).join("") + "</div>";

  const generalIds = data.current.staff.filter(s => !s.is_nk).map(s => s.id);
  const nkIds = data.current.staff.filter(s => s.is_nk).map(s => s.id);
  const avgs = generalIds.map(sid => {
    const c = data.cumulative[sid];
    return c && c.months > 0 ? c.night / c.months : 0;
  }).filter(v => v > 0);
  const teamAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;

  html += `<h4 class="annual-sub">누적 합계 (표시된 ${months.length}개월) — 다음달 배치 참고용</h4>` +
    '<table class="mini-table"><tr><th>이름</th><th>OFF</th><th>야간</th><th>근무</th>' +
    '<th>월평균야간</th><th>주말야간</th><th>2일블록</th><th>3일블록</th></tr>';
  for (const sid of generalIds) {
    const c = data.cumulative[sid] || { off: 0, night: 0, workday: 0, months: 0,
      weekend_night: 0, blocks_2: 0, blocks_3: 0, blocks_other: 0 };
    const avg = c.months > 0 ? c.night / c.months : 0;
    const dev = c.months > 1 && teamAvg > 0 && (avg - teamAvg) >= 1.5;
    html += `<tr><td>${esc(sid)}</td><td>${c.off}</td><td>${c.night}</td><td>${c.workday}</td>` +
      `<td class="${dev ? "badge-bad" : ""}">${avg.toFixed(1)}${dev ? " 야간多" : ""}</td>` +
      `<td>${c.weekend_night}</td><td>${c.blocks_2}</td>` +
      `<td class="${c.blocks_3 > 0 ? "badge-bad" : ""}">${c.blocks_3}</td></tr>`;
  }
  html += "</table>";

  if (nkIds.length) {
    html += `<h4 class="annual-sub">야간전담(NK) 누적 — 참고용, 2:3 블록 혼합이 정상</h4>` +
      '<table class="mini-table"><tr><th>이름</th><th>OFF</th><th>야간</th>' +
      '<th>월평균야간</th><th>주말야간</th><th>2일블록</th><th>3일블록</th></tr>';
    for (const sid of nkIds) {
      const c = data.cumulative[sid] || { off: 0, night: 0, months: 0,
        weekend_night: 0, blocks_2: 0, blocks_3: 0 };
      const avg = c.months > 0 ? c.night / c.months : 0;
      html += `<tr><td>${esc(sid)}</td><td>${c.off}</td><td>${c.night}</td>` +
        `<td>${avg.toFixed(1)}</td><td>${c.weekend_night}</td>` +
        `<td>${c.blocks_2}</td><td>${c.blocks_3}</td></tr>`;
    }
    html += "</table>";
  }
  box.innerHTML = html;
}

function renderPending() {
  const body = $("#pendingBody");
  if (!body) return;
  if (ST.pending.length === 0) {
    body.innerHTML = '<p style="color:var(--sub);font-size:12.5px;margin:0 0 8px">아직 스테이징된 편집이 없습니다. 그리드 셀을 클릭해 근무를 바꿔보세요.</p>';
    return;
  }
  let html = '<ul class="edit-list">';
  for (const key of ST.pending) {
    const i = key.lastIndexOf(":");
    const sid = key.slice(0, i), day = parseInt(key.slice(i + 1), 10);
    const cur = ST.grid[sid][day];
    html += `<li><span>${esc(sid)} ${day + 1}일 → <b>${esc(cur)}</b></span>` +
            `<button onclick="undoEdit('${escAttr(sid)}',${day})">취소</button></li>`;
  }
  html += "</ul>";
  html += '<div id="feedbackBox"><p style="color:var(--sub);font-size:12px">피드백 확인 중...</p></div>';
  html += '<div class="action-row">' +
          '<button class="danger" onclick="discardAll()">전체 취소</button>' +
          '<button class="primary" onclick="applyEdits()">재생성 적용</button>' +
          "</div>";
  body.innerHTML = html;
}

async function refreshFeedback() {
  const box = $("#feedbackBox");
  if (!box) return;
  if (ST.pending.length === 0) { box.innerHTML = ""; return; }
  const fb = await api("/api/feedback", { method: "POST" });
  let html = "";
  if (fb.hard.length === 0 && fb.soft.length === 0) {
    html = '<ul class="issue-list"><li class="none">관련 이상 없음 — 재생성해도 안전할 가능성이 높습니다.</li></ul>';
  } else {
    html = '<ul class="issue-list">';
    for (const v of fb.hard) html += `<li class="hard"><span class="rule">${esc(v.rule)}</span>${esc(v.message)}</li>`;
    for (const v of fb.soft) html += `<li class="soft"><span class="rule">${esc(v.rule)}</span>${esc(v.message)}</li>`;
    html += "</ul>";
  }
  box.innerHTML = html;
}

window.discardAll = async function () {
  ST = await api("/api/discard", { method: "POST" });
  render();
};

window.applyEdits = async function () {
  showGenOverlay("수정 사항을 반영해 다시 계산하는 중입니다…");
  try {
    ST = await api("/api/apply", { method: "POST" });
    render();
    showToast(`${ST.round}회차로 재생성 완료`);
  } catch (e) {
  } finally {
    hideGenOverlay();
  }
};
