"use strict";

const SHIFT_CLASS = {D:"sd", E:"se", N:"sn", NK:"sk", prn:"sp", "8A":"sa", "연차":"sy", OFF:"so"};
const SHIFT_TEXT = {OFF:"·", "연차":"연", prn:"p"};
const ALL_SHIFTS = ["D","E","N","NK","prn","8A","OFF","연차"];
const ALLOWED_OPTIONS = ["D","E","N","NK","prn","8A"];
const FLAG_OPTIONS = [
  ["", "없음"], ["night_only", "야간전담(NK)"], ["pregnant", "임부(야간금지)"], ["no_night", "야간금지"],
];
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
let picker = null;
let formStaff = [];      // [{id, role, level, allowed:[...], flags:[...]}]
let formRequests = [];   // [{staff_id, date, type, priority}]
let formCarryover = [];  // [{staff_id, last_shift_type, consecutive_work_days, night_block_remaining_off, trailing_night_count}]
let formHolidays = [];      // ["YYYY-MM-DD", ...] 공휴일
let formSubHolidays = [];   // ["YYYY-MM-DD", ...] 대체공휴일

const $ = (sel) => document.querySelector(sel);
const gridContent = $("#gridContent");
const annualPane = $("#annualPane");
const sidePane = $("#sidePane");
const toast = $("#toast");

function showToast(msg, isErr) {
  toast.textContent = msg;
  toast.className = "toast show" + (isErr ? " err" : "");
  setTimeout(() => { toast.className = "toast"; }, 2800);
}

// ================================================================ Pyodide 브릿지
// 서버(Flask) 없이 브라우저 안에서 Python(nurse_scheduler 엔진)을 직접 돌린다.
// api(path, opts)의 시그니처는 원래 fetch 버전과 동일하게 유지해서, 이 함수를
// 호출하는 나머지 코드는 전혀 손대지 않아도 되게 만들었다.

let pyodide = null;
let bridge = null;

async function bootPyodide() {
  const msg = document.getElementById("loadingMsg");
  pyodide = await loadPyodide({ indexURL: "vendor/pyodide/" });

  msg.textContent = "필요한 패키지를 설치하는 중…";
  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  await micropip.install("vendor/wheels/et_xmlfile-2.0.0-py3-none-any.whl");
  await micropip.install("vendor/wheels/openpyxl-3.1.5-py2.py3-none-any.whl");

  msg.textContent = "근무표 생성 엔진을 불러오는 중…";
  const zipBuf = await (await fetch("py_app.zip")).arrayBuffer();
  pyodide.unpackArchive(zipBuf, "zip");

  const sampleBuf = await (await fetch("sample_input.xlsx")).arrayBuffer();
  pyodide.FS.writeFile("/sample_input.xlsx", new Uint8Array(sampleBuf));

  pyodide.runPython("import sys\nif '/' not in sys.path: sys.path.insert(0, '/')");
  bridge = pyodide.pyimport("bridge");
  window.bridge = bridge; // 다운로드 함수 등에서 사용
}

async function callBridge(path, opts) {
  opts = opts || {};
  switch (path) {
    case "/api/sample": return bridge.api_sample();
    case "/api/upload": return bridge.api_upload(opts._fileBytes);
    case "/api/upload_prev_month": return bridge.api_upload_prev_month(opts._fileBytes);
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
    default: throw new Error("알 수 없는 경로: " + path);
  }
}

async function api(path, opts) {
  let raw;
  try {
    raw = await callBridge(path, opts);
  } catch (e) {
    const message = (e && e.message) ? e.message.split("\n")[0] : String(e);
    showToast(message, true);
    throw e;
  }
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

window.downloadXlsx = function () {
  const bytes = bridge.api_download_xlsx().toJs();
  triggerDownload(bytes, `schedule_${bridge.download_tag()}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
};
window.downloadReport = function () {
  triggerDownload(bridge.api_download_report(), `report_${bridge.download_tag()}.txt`,
    "text/plain;charset=utf-8");
};
window.downloadCarryover = function () {
  triggerDownload(bridge.api_download_carryover(), `carryover_next_${bridge.download_tag()}.json`,
    "application/json");
};

function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function escAttr(s) { return esc(s).replace(/'/g, "&#39;"); }

// ================================================================ 정보 모달

const INFO_HTML = `
<h3>이 프로그램은 무엇을 하나요</h3>
<p>병동의 인원·직급·숙련도·근무 가능 유형과 일별 최소 인력 기준을 입력하면,
법정·안전 규칙(하드 제약)을 반드시 지키면서 한 달치 근무표를 자동으로 만들어 줍니다.
야간(N) 연속 근무 제한, 연속근무 5일 제한, 월 최소 휴무일수, 신청(원티드) 반영 등을 알아서 계산합니다.</p>

<h3>사용 순서</h3>
<ul>
<li><b>입력</b> — 화면에 샘플 데이터가 기본으로 채워져 있습니다. 그대로 써도 되고,
엑셀을 업로드해 통째로 바꾸거나, 표를 직접 고쳐도 됩니다.</li>
<li><b>생성</b> — "근무표 생성" 버튼 한 번으로 자동 배정됩니다.</li>
<li><b>편집</b> — 생성된 그리드에서 칸을 클릭해 근무를 바꾸면 오른쪽에 스테이징됩니다(주황 점선).
바꾼 칸과 관련된 규칙 위반이 있으면 바로 알려줍니다.</li>
<li><b>재생성 적용</b> — 스테이징한 편집을 고정한 채 나머지를 다시 배정합니다.
고정된 칸은 빨간 실선 테두리로 표시되고, <b>이후 몇 번을 더 수정해도 이전 고정은 계속 유지됩니다.</b></li>
<li><b>다운로드</b> — 근무표 엑셀, 검증 리포트, 다음 달 생성용 이월 데이터를 받을 수 있습니다.</li>
</ul>

<h3>근무 색상</h3>
<ul>
<li><span class="kbd">D</span> 주간 · <span class="kbd">E</span> 저녁 · <span class="kbd">N</span> 야간 ·
<span class="kbd">NK</span> 야간전담 · <span class="kbd">prn</span> 정규 · <span class="kbd">8A</span> 파트장 상근 ·
<span class="kbd">연차</span> · <span class="kbd">·(OFF)</span></li>
</ul>

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

<h3>여러 번 수정할 때</h3>
<p>이전에 CLI(명령줄) 방식에서는 파일을 잘못 지정하면 이전 수정이 사라지는 문제가 있었지만,
이 화면은 서버가 지금까지 고정한 모든 칸을 계속 기억하므로 몇 번을 다시 만들어도 이전 수정이 사라지지 않습니다.</p>

<h3>다음 달로 넘어갈 때</h3>
<p>"전월이월" 표에 <b>지난달 확정 엑셀을 업로드</b>하면 마지막 근무·연속근무일·야간블록 등을
자동으로 읽어 채워줍니다. 근무표를 다 만든 뒤 "이번 달 확정 저장"을 눌러두면, 다음 달 화면
아래쪽 <b>연간 근무표</b>에 최근 달들이 계속 쌓여 보이고, 사람별 누적 OFF·야간·근무일도 같이 확인할 수 있습니다.</p>
`;

$("#infoBtn").onclick = () => {
  $("#infoBody").innerHTML = INFO_HTML;
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
  $("#f_leader8a").checked = !!p.leader_8a_as_prn;
  formHolidays = [...(p.holidays || [])];
  formSubHolidays = [...(p.substitute_holidays || [])];
  renderHolidayCalendar();

  formStaff = (cfg.staff || []).map(s => ({
    id: s.id, role: s.role, level: s.level,
    allowed: [...(s.allowed_shifts || [])], flags: [...(s.flags || [])],
  }));
  renderStaffTable();

  const ms = p.min_staff || {};
  for (const [key] of MIN_STAFF_ROWS) {
    for (const [col] of MIN_STAFF_COLS) {
      const el = document.getElementById(`ms_${key}_${col}`);
      if (el) el.value = (ms[col] && ms[col][key] !== undefined) ? ms[col][key] : 0;
    }
  }

  formRequests = (cfg.requests || []).map(r => ({ ...r, priority: r.priority ?? 1 }));
  renderReqTable();

  formCarryover = Object.entries(cfg.prev_month_carryover || {}).map(([sid, v]) => ({
    staff_id: sid, last_shift_type: v.last_shift_type || "OFF",
    consecutive_work_days: v.consecutive_work_days || 0,
    night_block_remaining_off: v.night_block_remaining_off || 0,
    trailing_night_count: v.trailing_night_count || 0,
  }));
  renderCarryTable();
}

function renderMinStaffTable() {
  const tbody = $("#minStaffTable tbody");
  tbody.innerHTML = MIN_STAFF_ROWS.map(([key, label]) => {
    const cells = MIN_STAFF_COLS.map(([col]) =>
      `<td><input type="number" min="0" id="ms_${key}_${col}" value="0"></td>`).join("");
    return `<tr><td><b>${label}</b></td>${cells}</tr>`;
  }).join("");
}
renderMinStaffTable();

function flagsToTag(flags) {
  if (flags.includes("night_only")) return "night_only";
  if (flags.includes("pregnant")) return "pregnant";
  if (flags.includes("no_night")) return "no_night";
  return "";
}

function renderStaffTable() {
  const body = $("#staffBody");
  body.innerHTML = formStaff.map((s, i) => {
    const chk = ALLOWED_OPTIONS.map(sh =>
      `<label><input type="checkbox" data-i="${i}" data-sh="${sh}" class="allowedChk" ${s.allowed.includes(sh) ? "checked" : ""}>${sh}</label>`
    ).join("");
    const flagTag = flagsToTag(s.flags);
    const flagSel = `<select data-i="${i}" class="flagSel">` +
      FLAG_OPTIONS.map(([v, l]) => `<option value="${v}" ${v === flagTag ? "selected" : ""}>${l}</option>`).join("") +
      `</select>`;
    return `<tr>
      <td>${i + 1}</td>
      <td><input type="text" data-i="${i}" class="nameInp" value="${escAttr(s.id)}"></td>
      <td><select data-i="${i}" class="roleSel">
            <option ${s.role === "파트장" ? "selected" : ""}>파트장</option>
            <option ${s.role === "리더" ? "selected" : ""}>리더</option>
            <option ${s.role === "간호사" ? "selected" : ""}>간호사</option>
          </select></td>
      <td><input type="number" data-i="${i}" class="levelInp" min="1" max="5" value="${s.level}" style="width:44px"></td>
      <td><div class="chk-group">${chk}</div></td>
      <td>${flagSel}</td>
      <td><button class="row-del" data-i="${i}" onclick="delStaff(${i})">삭제</button></td>
    </tr>`;
  }).join("");
  $("#staffCount").textContent = formStaff.length + "명";

  body.querySelectorAll(".nameInp").forEach(el => el.oninput = e => formStaff[+e.target.dataset.i].id = e.target.value);
  body.querySelectorAll(".roleSel").forEach(el => el.onchange = e => formStaff[+e.target.dataset.i].role = e.target.value);
  body.querySelectorAll(".levelInp").forEach(el => el.oninput = e => formStaff[+e.target.dataset.i].level = parseInt(e.target.value || "1", 10));
  body.querySelectorAll(".allowedChk").forEach(el => el.onchange = e => {
    const i = +e.target.dataset.i, sh = e.target.dataset.sh;
    const s = formStaff[i];
    if (e.target.checked) { if (!s.allowed.includes(sh)) s.allowed.push(sh); }
    else { s.allowed = s.allowed.filter(x => x !== sh); }
  });
  body.querySelectorAll(".flagSel").forEach(el => el.onchange = e => {
    const i = +e.target.dataset.i, v = e.target.value;
    formStaff[i].flags = v ? [v] : [];
    if (v === "night_only") formStaff[i].allowed = ["NK"];
  });
}
window.delStaff = (i) => { formStaff.splice(i, 1); renderStaffTable(); };

$("#addStaffBtn").onclick = () => {
  formStaff.push({ id: `새간호사${formStaff.length + 1}`, role: "간호사", level: 2,
                   allowed: ["D", "E", "N", "prn"], flags: [] });
  renderStaffTable();
};

function renderReqTable() {
  const body = $("#reqBody");
  const staffOptions = formStaff.map(s => `<option value="${escAttr(s.id)}">${esc(s.id)}</option>`).join("");
  body.innerHTML = formRequests.map((r, i) => `<tr>
    <td><select data-i="${i}" class="rq_sid">${staffOptions}</select></td>
    <td><input type="text" data-i="${i}" class="rq_date" value="${escAttr(r.date || "")}" placeholder="YYYY-MM-DD" style="width:110px"></td>
    <td><select data-i="${i}" class="rq_type">
      ${["OFF","연차","D","E","N","prn"].map(t => `<option ${r.type===t?"selected":""}>${t}</option>`).join("")}
    </select></td>
    <td><input type="number" data-i="${i}" class="rq_pri" value="${r.priority}" style="width:44px"></td>
    <td><button class="row-del" onclick="delReq(${i})">삭제</button></td>
  </tr>`).join("");
  $("#reqCount").textContent = formRequests.length + "건";
  body.querySelectorAll(".rq_sid").forEach(el => { el.value = formRequests[+el.dataset.i].staff_id; el.onchange = e => formRequests[+e.target.dataset.i].staff_id = e.target.value; });
  body.querySelectorAll(".rq_date").forEach(el => el.oninput = e => formRequests[+e.target.dataset.i].date = e.target.value);
  body.querySelectorAll(".rq_type").forEach(el => el.onchange = e => formRequests[+e.target.dataset.i].type = e.target.value);
  body.querySelectorAll(".rq_pri").forEach(el => el.oninput = e => formRequests[+e.target.dataset.i].priority = parseInt(e.target.value || "1", 10));
}
window.delReq = (i) => { formRequests.splice(i, 1); renderReqTable(); };
$("#addReqBtn").onclick = () => {
  const first = formStaff[0]?.id || "";
  formRequests.push({ staff_id: first, date: "", type: "OFF", priority: 1 });
  renderReqTable();
};

function renderCarryTable() {
  const body = $("#carryBody");
  const staffOptions = formStaff.map(s => `<option value="${escAttr(s.id)}">${esc(s.id)}</option>`).join("");
  body.innerHTML = formCarryover.map((c, i) => `<tr>
    <td><select data-i="${i}" class="cy_sid">${staffOptions}</select></td>
    <td><select data-i="${i}" class="cy_last">
      ${["OFF","D","E","N","NK","prn","연차"].map(t => `<option ${c.last_shift_type===t?"selected":""}>${t}</option>`).join("")}
    </select></td>
    <td><input type="number" data-i="${i}" class="cy_cons" value="${c.consecutive_work_days}" style="width:50px"></td>
    <td><input type="number" data-i="${i}" class="cy_roff" value="${c.night_block_remaining_off}" style="width:50px"></td>
    <td><input type="number" data-i="${i}" class="cy_trail" value="${c.trailing_night_count}" style="width:50px"></td>
    <td><button class="row-del" onclick="delCarry(${i})">삭제</button></td>
  </tr>`).join("");
  $("#carryCount").textContent = formCarryover.length + "건";
  body.querySelectorAll(".cy_sid").forEach(el => { el.value = formCarryover[+el.dataset.i].staff_id; el.onchange = e => formCarryover[+e.target.dataset.i].staff_id = e.target.value; });
  body.querySelectorAll(".cy_last").forEach(el => el.onchange = e => formCarryover[+e.target.dataset.i].last_shift_type = e.target.value);
  body.querySelectorAll(".cy_cons").forEach(el => el.oninput = e => formCarryover[+e.target.dataset.i].consecutive_work_days = parseInt(e.target.value || "0", 10));
  body.querySelectorAll(".cy_roff").forEach(el => el.oninput = e => formCarryover[+e.target.dataset.i].night_block_remaining_off = parseInt(e.target.value || "0", 10));
  body.querySelectorAll(".cy_trail").forEach(el => el.oninput = e => formCarryover[+e.target.dataset.i].trailing_night_count = parseInt(e.target.value || "0", 10));
}
window.delCarry = (i) => { formCarryover.splice(i, 1); renderCarryTable(); };
$("#addCarryBtn").onclick = () => {
  const first = formStaff[0]?.id || "";
  formCarryover.push({ staff_id: first, last_shift_type: "OFF", consecutive_work_days: 0,
                       night_block_remaining_off: 0, trailing_night_count: 0 });
  renderCarryTable();
};

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
      leader_8a_as_prn: $("#f_leader8a").checked,
      off_max_per_month: parseInt($("#f_maxnights").value || "6", 10),
      holidays, substitute_holidays: subhol, advanced_track_staff: [],
    },
    prev_month_carryover: carry,
    requests: formRequests.filter(r => r.staff_id && r.date),
  };
}

// ================================================================ 업로드 / 생성

$("#uploadBtn").onclick = async () => {
  const f = $("#fileInput").files[0];
  if (!f) { showToast("파일을 선택하세요", true); return; }
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const data = await api("/api/upload", { _fileBytes: bytes });
    fillForm(data.cfg);
    $("#uploadStatus").textContent = `"${f.name}" 값으로 표를 채웠습니다 — 검토 후 생성을 누르세요`;
    showToast("업로드한 값으로 표를 채웠습니다");
  } catch (e) {}
};

$("#prevMonthBtn").onclick = async () => {
  const f = $("#prevMonthInput").files[0];
  if (!f) { showToast("파일을 선택하세요", true); return; }
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const data = await api("/api/upload_prev_month", { _fileBytes: bytes });
    const staffIds = new Set(formStaff.map(s => s.id));
    let matched = 0, skipped = 0;
    formCarryover = [];
    for (const [sid, v] of Object.entries(data.carryover)) {
      if (!staffIds.has(sid)) { skipped++; continue; }
      matched++;
      formCarryover.push({
        staff_id: sid, last_shift_type: v.last_shift_type,
        consecutive_work_days: v.consecutive_work_days,
        night_block_remaining_off: v.night_block_remaining_off,
        trailing_night_count: v.trailing_night_count,
      });
    }
    renderCarryTable();
    $("#prevMonthStatus").textContent =
      `${data.year}년 ${data.month}월 근무표에서 ${matched}명 반영` +
      (skipped ? ` (현재 인원명단과 이름이 안 맞는 ${skipped}명 제외)` : "");
    showToast(data.warning || `${matched}명 이월정보를 자동으로 채웠습니다`, !!data.warning);
  } catch (e) {}
};

$("#generateBtn").onclick = async () => {
  const btn = $("#generateBtn");
  btn.disabled = true;
  $("#genStatus").textContent = "생성 중...";
  try {
    const cfg = buildCfgFromForm();
    await api("/api/set_config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    ST = await api("/api/generate", { method: "POST" });
    render();
    showToast("근무표 생성 완료");
  } catch (e) {
    $("#genStatus").textContent = "";
  } finally {
    btn.disabled = false;
    if (!ST) $("#genStatus").textContent = "";
  }
};

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
})();

// ================================================================ 그리드 렌더 (생성 후)

function shiftClass(v) { return SHIFT_CLASS[v] || ""; }
function shiftText(v) { return SHIFT_TEXT[v] !== undefined ? SHIFT_TEXT[v] : v; }

function render() {
  if (!ST) return;
  $("#intake").style.display = "none";
  gridContent.style.display = "block";
  annualPane.style.display = "block";
  sidePane.style.display = "block";
  renderGrid();
  renderSide();
  renderAnnualPane();
}

function renderGrid() {
  const lockedSet = new Set(ST.locked);
  const pendingSet = new Set(ST.pending);

  let html = '<div class="legend">';
  const legendItems = [["D","#BDD7EE"],["E","#F8CBAD"],["N","#1F3864"],["NK","#7030A0"],
                       ["prn","#C6E0B4"],["8A","#D9D9D9"],["연차","#FFE699"]];
  for (const [k, c] of legendItems) html += `<span class="sw"><span class="box" style="background:${c}"></span>${k}</span>`;
  html += `<span class="sw">· = OFF</span>`;
  html += `<span class="sw"><span style="outline:2px solid var(--hard);width:13px;height:13px;display:inline-block"></span>확정(고정)</span>`;
  html += `<span class="sw"><span style="outline:2px dashed var(--warn);width:13px;height:13px;display:inline-block"></span>미적용 편집</span>`;
  html += `<button id="backToInputBtn" class="small" style="margin-left:auto">← 입력으로 돌아가기(새로 만들기)</button>`;
  html += "</div>";

  html += '<table class="grid"><thead><tr><th class="nm">이름</th>';
  for (const d of ST.days) html += `<th class="${d.weekend ? "we" : ""}">${d.n}<br>${d.dow}</th>`;
  html += "</tr></thead><tbody>";

  for (const s of ST.staff) {
    html += `<tr><td class="nm">${esc(s.id)}<span class="role">${s.role} Lv${s.level}</span></td>`;
    const row = ST.grid[s.id];
    for (let d = 0; d < ST.num_days; d++) {
      const v = row[d];
      const key = `${s.id}:${d}`;
      const cls = ["cell", shiftClass(v)];
      if (lockedSet.has(key)) cls.push("locked");
      if (pendingSet.has(key)) cls.push("pending");
      const disabled = s.is_partjang;
      if (disabled) cls.push("disabled");
      html += `<td class="${cls.join(" ")}" data-sid="${escAttr(s.id)}" data-day="${d}" ${disabled ? "" : `onclick="openPicker(event,'${escAttr(s.id)}',${d})"`}>` +
              `<span>${esc(shiftText(v))}</span></td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  gridContent.innerHTML = html;
  $("#backToInputBtn").onclick = () => {
    ST = null;
    gridContent.style.display = "none";
    gridContent.innerHTML = "";
    annualPane.style.display = "none";
    annualPane.innerHTML = "";
    $("#intake").style.display = "block";
    sidePane.style.display = "none";
  };
}

window.openPicker = function (ev, sid, day) {
  closePicker();
  const staff = ST.staff.find(s => s.id === sid);
  const allowed = new Set(["OFF", "연차", ...staff.allowed]);
  const cur = ST.grid[sid][day];
  const rect = ev.target.closest("td").getBoundingClientRect();

  const div = document.createElement("div");
  div.className = "picker";
  div.style.left = Math.min(rect.left, window.innerWidth - 230) + "px";
  div.style.top = (rect.bottom + 4) + "px";
  for (const sh of ALL_SHIFTS) {
    if (!allowed.has(sh)) continue;
    const b = document.createElement("button");
    b.textContent = sh;
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

function renderSide() {
  const r = ST.report;
  const hardCls = r.hard_count === 0 ? "ok" : "bad";

  let html = "";
  html += `<div class="side-sec"><h3>검증 요약</h3><div class="kpi-row">
    <div class="kpi"><div class="v ${hardCls}">${r.hard_count}</div><div class="l">하드 위반</div></div>
    <div class="kpi"><div class="v">${r.soft_count}</div><div class="l">소프트</div></div>
    <div class="kpi"><div class="v">${ST.round}</div><div class="l">회차</div></div>
  </div>`;
  if (r.hard_count > 0) {
    html += '<ul class="issue-list">' + r.hard.slice(0, 8).map(v =>
      `<li class="hard"><span class="rule">${esc(v.rule)}</span>${esc(v.message)}</li>`).join("") + "</ul>";
  }
  html += "</div>";

  html += '<div class="side-sec" id="pendingSec"><h3>편집 중 (미적용)</h3><div id="pendingBody"></div></div>';

  html += `<div class="side-sec"><h3>다운로드</h3><div class="download-row">
    <button onclick="downloadXlsx()">근무표 엑셀</button>
    <button onclick="downloadReport()">검증 리포트 (txt)</button>
    <button onclick="downloadCarryover()">익월 이월 JSON</button>
  </div></div>`;

  // 입력 요약
  const ps = ST.params_summary;
  html += `<div class="side-sec"><h3>입력 요약</h3><ul class="issue-list" style="font-size:12px">
    <li style="background:var(--code-bg)">${ST.year}년 ${ST.month}월 · ${ST.staff.length}명 ·
    월최대야간 ${ps.max_nights}일 · NK ${ps.nk_count}명 · 공휴일 ${ps.holidays.length}개</li>
  </ul></div>`;

  // 개인별
  html += '<div class="side-sec"><h3>개인별 OFF·야간·근무일</h3><div style="overflow-x:auto"><table class="person-table"><tr><th>이름</th><th>OFF</th><th>야간</th><th>근무</th></tr>' +
    r.per_person.map(p => `<tr class="${p.off_ok ? "" : "warn-row"}"><td>${esc(p.id)}</td><td>${p.off}</td><td>${p.nights}</td><td>${p.workdays}</td></tr>`).join("") +
    "</table></div></div>";

  // 일별 최소인력
  html += `<div class="side-sec"><h3>일별 최소인력 <span class="count-badge">${r.bad_days_count === 0 ? "전일 충족" : r.bad_days_count + "일 미달"}</span></h3>`;
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
        `<td class="${q.accepted ? "badge-ok" : "badge-bad"}" title="${escAttr(q.reason)}">${q.accepted ? "수용" : "반려"}</td></tr>`).join("") +
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

  const staffOrder = data.current.staff.map(s => s.id);
  const avgs = staffOrder.map(sid => {
    const c = data.cumulative[sid];
    return c && c.months > 0 ? c.night / c.months : 0;
  }).filter(v => v > 0);
  const teamAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;

  html += `<h4 class="annual-sub">누적 합계 (표시된 ${months.length}개월)</h4>` +
    '<table class="mini-table"><tr><th>이름</th><th>OFF</th><th>야간</th><th>근무</th><th>월평균야간</th></tr>';
  for (const sid of staffOrder) {
    const c = data.cumulative[sid] || { off: 0, night: 0, workday: 0, months: 0 };
    const avg = c.months > 0 ? c.night / c.months : 0;
    const dev = c.months > 1 && teamAvg > 0 && (avg - teamAvg) >= 1.5;
    html += `<tr><td>${esc(sid)}</td><td>${c.off}</td><td>${c.night}</td><td>${c.workday}</td>` +
      `<td class="${dev ? "badge-bad" : ""}">${avg.toFixed(1)}${dev ? " 야간多" : ""}</td></tr>`;
  }
  html += "</table>";
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
  try {
    ST = await api("/api/apply", { method: "POST" });
    render();
    showToast(`${ST.round}회차로 재생성 완료`);
  } catch (e) {}
};
