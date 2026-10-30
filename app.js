"use strict";

const SHIFT_CLASS = {D:"sd", E:"se", N:"sn", NK:"sk", prn:"sp", "8A":"sa", "9A":"sa9", "10A":"sa10",
                     "연차":"sy", OFF:"so", "S/":"ssl", "TW":"stw", "군":"smi", "T":"st",
                     "조":"sjo", "경":"sgyeong", "공":"sgong", "병":"sbyeong", "휴":"shyu", "승":"sseung",
                     "연1":"sy1", "연2":"sy2", "연3":"sy3", "연4":"sy4"};
const SHIFT_TEXT = {OFF:"·", "연차":"연", prn:"p"};
const ALL_SHIFTS = ["D","E","N","NK","prn","8A","9A","10A","T","TW","OFF","연차","연1","연2","연3","연4",
                    "S/","조","경","공","병","휴","승","군"];
// 누구에게나 고를 수 있는 휴가·교육 계열.
const REST_PICK = ["OFF", "연차", "연1", "연2", "연3", "연4", "S/", "군", "TW", "T",
                   "조", "경", "공", "병", "휴", "승"];
// 파트장에게만 막는 것 — 근무 다섯 가지뿐이고 나머지는 다 고를 수 있다.
// 막는 이유는 인원 계산이다: 최소인력·레벨 통계는 파트장을 빼고 세므로(computeDailyDutyRows),
// 파트장에게 D를 주면 그날 사람이 하나 더 있는 것처럼 보이는데 어느 숫자에도 안 잡힌다.
// NK도 같이 막는다 — 야간전담이라 이 앱은 어디서나 NK를 N으로 센다(COUNT_KEY).
// API(pyodide-app/py/bridge.py의 _PARTJANG_BLOCKED_SHIFTS)도 같은 다섯으로
// 한 번 더 막는다 — 화면에만 있는 잠금은 잠금이 아니다.
const PARTJANG_BLOCK = ["D", "E", "N", "NK", "prn"];

// '지정'은 근무유형이 아니라 "그날 지정 가능자가 몇 명 근무해야 하는가"다. 가능근무 칸에
// '지정'을 적은 사람이 그날 D·E·N·prn 중 무엇이든 서면 1명으로 세진다(엔진이 따로 고르지
// 않는다). 0이면 지정을 쓰지 않는 병동이라 규칙이 통째로 지나간다.
const MIN_STAFF_ROWS = [["D","D"],["E","E"],["N","N"],["prn","prn"],["지정","지정"]];
const MIN_STAFF_COLS = [["weekday","평일"],["saturday","토요일"],["sunday_holiday","일요일·공휴일"]];
const MIN_STAFF_DOWS = [["0","월"],["1","화"],["2","수"],["3","목"],["4","금"]];

// 한국 공휴일(관공서의 공휴일에 관한 규정 기준) — 확인된 연도만 정확한 음력 명절 포함,
// 그 외 연도는 고정일 공휴일만 기본 반영하고 나머지는 캘린더에서 직접 클릭해 조정.
const KR_HOLIDAYS = {
  2025: {
    holidays: [
      "2025-01-01", "2025-01-27", "2025-01-28", "2025-01-29", "2025-01-30",
      "2025-03-01", "2025-05-05", "2025-06-03", "2025-06-06", "2025-08-15",
      "2025-10-03", "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-09",
      "2025-12-25",
    ],
    substitutes: ["2025-03-03", "2025-05-06", "2025-10-08"],
  },
  2026: {
    holidays: [
      "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01",
      "2026-05-01", "2026-05-05", "2026-05-24", "2026-06-03", "2026-06-06",
      "2026-07-17", "2026-08-15", "2026-09-24", "2026-09-25", "2026-09-26",
      "2026-10-03", "2026-10-09", "2026-12-25",
    ],
    substitutes: ["2026-03-02", "2026-05-25", "2026-08-17", "2026-10-05"],
  },
  2027: {
    holidays: [
      "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08", "2027-03-01",
      "2027-05-01", "2027-05-05", "2027-05-13", "2027-06-06", "2027-07-17",
      "2027-08-15", "2027-09-14", "2027-09-15", "2027-09-16", "2027-10-03",
      "2027-10-09", "2027-12-25",
    ],
    substitutes: [
      "2027-02-09", "2027-05-03", "2027-07-19", "2027-08-16", "2027-10-04",
      "2027-10-11", "2027-12-27",
    ],
  },
  2028: {
    holidays: [
      "2028-01-01", "2028-01-26", "2028-01-27", "2028-01-28", "2028-03-01",
      "2028-04-12", "2028-05-01", "2028-05-02", "2028-05-05", "2028-06-06",
      "2028-07-17", "2028-08-15", "2028-10-02", "2028-10-03", "2028-10-04",
      "2028-10-09", "2028-12-25",
    ],
    substitutes: ["2028-10-05"],
  },
  2029: {
    holidays: [
      "2029-01-01", "2029-02-12", "2029-02-13", "2029-02-14", "2029-03-01",
      "2029-05-01", "2029-05-05", "2029-05-20", "2029-06-06", "2029-07-17",
      "2029-08-15", "2029-09-21", "2029-09-22", "2029-09-23", "2029-10-03",
      "2029-10-09", "2029-12-25",
    ],
    substitutes: ["2029-05-07", "2029-05-21", "2029-09-24"],
  },
  2030: {
    holidays: [
      "2030-01-01", "2030-02-02", "2030-02-03", "2030-02-04", "2030-03-01",
      "2030-04-03", "2030-05-01", "2030-05-05", "2030-05-09", "2030-06-06",
      "2030-06-12", "2030-07-17", "2030-08-15", "2030-09-11", "2030-09-12",
      "2030-09-13", "2030-10-03", "2030-10-09", "2030-12-25",
    ],
    substitutes: ["2030-02-05", "2030-05-06"],
  },
  2031: {
    holidays: [
      "2031-01-01", "2031-01-22", "2031-01-23", "2031-01-24", "2031-03-01",
      "2031-05-01", "2031-05-05", "2031-05-28", "2031-06-06", "2031-07-17",
      "2031-08-15", "2031-09-30", "2031-10-01", "2031-10-02", "2031-10-03",
      "2031-10-09", "2031-12-25",
    ],
    substitutes: ["2031-03-03"],
  },
  2032: {
    holidays: [
      "2032-01-01", "2032-02-10", "2032-02-11", "2032-02-12", "2032-03-01",
      "2032-04-14", "2032-05-01", "2032-05-05", "2032-05-16", "2032-06-06",
      "2032-07-17", "2032-08-15", "2032-09-18", "2032-09-19", "2032-09-20",
      "2032-10-03", "2032-10-09", "2032-12-25",
    ],
    substitutes: [
      "2032-05-03", "2032-05-17", "2032-07-19", "2032-08-16", "2032-09-21",
      "2032-10-04", "2032-10-11", "2032-12-27",
    ],
  },
  2033: {
    holidays: [
      "2033-01-01", "2033-01-30", "2033-01-31", "2033-02-01", "2033-03-01",
      "2033-05-01", "2033-05-05", "2033-05-06", "2033-06-06", "2033-07-17",
      "2033-08-15", "2033-09-07", "2033-09-08", "2033-09-09", "2033-10-03",
      "2033-10-09", "2033-12-25",
    ],
    substitutes: ["2033-02-02", "2033-05-02", "2033-07-18", "2033-10-10", "2033-12-26"],
  },
  2034: {
    holidays: [
      "2034-01-01", "2034-02-18", "2034-02-19", "2034-02-20", "2034-03-01",
      "2034-05-01", "2034-05-05", "2034-05-25", "2034-06-06", "2034-06-14",
      "2034-07-17", "2034-08-15", "2034-09-26", "2034-09-27", "2034-09-28",
      "2034-10-03", "2034-10-09", "2034-12-25",
    ],
    substitutes: ["2034-02-21"],
  },
  2035: {
    holidays: [
      "2035-01-01", "2035-02-07", "2035-02-08", "2035-02-09", "2035-03-01",
      "2035-04-04", "2035-05-01", "2035-05-05", "2035-05-15", "2035-06-06",
      "2035-07-17", "2035-08-15", "2035-09-15", "2035-09-16", "2035-09-17",
      "2035-10-03", "2035-10-09", "2035-12-25",
    ],
    substitutes: ["2035-05-07", "2035-09-18"],
  },
  2036: {
    holidays: [
      "2036-01-01", "2036-01-27", "2036-01-28", "2036-01-29", "2036-03-01",
      "2036-04-09", "2036-05-01", "2036-05-03", "2036-05-05", "2036-06-06",
      "2036-07-17", "2036-08-15", "2036-10-03", "2036-10-04", "2036-10-05",
      "2036-10-09", "2036-12-25",
    ],
    substitutes: ["2036-01-30", "2036-03-03", "2036-05-06", "2036-10-06", "2036-10-07"],
  },
  2037: {
    holidays: [
      "2037-01-01", "2037-02-14", "2037-02-15", "2037-02-16", "2037-03-01",
      "2037-05-01", "2037-05-05", "2037-05-22", "2037-06-06", "2037-07-17",
      "2037-08-15", "2037-09-23", "2037-09-24", "2037-09-25", "2037-10-03",
      "2037-10-09", "2037-12-25",
    ],
    substitutes: ["2037-02-17", "2037-03-02", "2037-08-17", "2037-10-05"],
  },
  2038: {
    holidays: [
      "2038-01-01", "2038-02-03", "2038-02-04", "2038-02-05", "2038-03-01",
      "2038-05-01", "2038-05-05", "2038-05-11", "2038-06-02", "2038-06-06",
      "2038-07-17", "2038-08-15", "2038-09-12", "2038-09-13", "2038-09-14",
      "2038-10-03", "2038-10-09", "2038-12-25",
    ],
    substitutes: [
      "2038-05-03", "2038-07-19", "2038-08-16", "2038-09-15", "2038-10-04",
      "2038-10-11", "2038-12-27",
    ],
  },
  2039: {
    holidays: [
      "2039-01-01", "2039-01-23", "2039-01-24", "2039-01-25", "2039-03-01",
      "2039-04-30", "2039-05-01", "2039-05-05", "2039-06-06", "2039-07-17",
      "2039-08-15", "2039-10-01", "2039-10-02", "2039-10-03", "2039-10-09",
      "2039-12-25",
    ],
    substitutes: [
      "2039-01-26", "2039-05-02", "2039-05-03", "2039-07-18", "2039-10-04",
      "2039-10-05", "2039-10-10", "2039-12-26",
    ],
  },
  2040: {
    holidays: [
      "2040-01-01", "2040-02-11", "2040-02-12", "2040-02-13", "2040-03-01",
      "2040-04-04", "2040-04-11", "2040-05-01", "2040-05-05", "2040-05-18",
      "2040-06-06", "2040-07-17", "2040-08-15", "2040-09-20", "2040-09-21",
      "2040-09-22", "2040-10-03", "2040-10-09", "2040-12-25",
    ],
    substitutes: ["2040-02-14", "2040-05-07"],
  },
};
// 신정·삼일절·노동절·어린이날·현충일·제헌절·광복절·개천절·한글날·성탄절
// (음력 명절·부처님오신날 제외 고정일)
const FIXED_HOLIDAYS_MMDD = ["01-01", "03-01", "05-05", "06-06", "08-15", "10-03", "10-09", "12-25"];
// 노동절(5/1)·제헌절(7/17)은 2026년 개정으로 관공서 공휴일이 됐다. 시행 전 연도에 소급하면
// 지난달 근무표의 휴일수가 실제와 달라지므로 시행연도 이후에만 붙인다.
const NEW_2026_HOLIDAYS_MMDD = ["05-01", "07-17"];

function seedHolidaysForYear(year) {
  const data = KR_HOLIDAYS[year];
  if (data) {
    formHolidays = [...data.holidays];
    formSubHolidays = [...data.substitutes];
  } else {
    const mmdds = year >= 2026
      ? FIXED_HOLIDAYS_MMDD.concat(NEW_2026_HOLIDAYS_MMDD)
      : FIXED_HOLIDAYS_MMDD;
    formHolidays = mmdds.map(mmdd => `${year}-${mmdd}`).sort();
    formSubHolidays = [];
  }
}

let ST = null;       // 생성 후 서버 상태 캐시
let attemptTableExpanded = false;   // 점수표 '나머지 시드 보기' 상태 — 다시 그려도 유지
let lastConfigWarning = null;  // set_config가 돌려준 경고(예: 연간근무표 이월 불일치) — 출력화면에 계속 보여줌
// set_config가 돌려준 인력 압박 진단(엔진의 staffing_pressure). 생성 대기화면과
// 출력화면에 함께 쓴다. 안내 문구는 엔진이 만든 것을 그대로 쓴다 — 화면이 두 벌이라
// 여기서 문구를 조립하면 언젠가 한쪽만 고쳐져 같은 상황에 다른 안내가 나간다.
let lastStaffing = null;
// 수정 보조(D-1·D-2). FRAGILE: 지금 회차의 취약 칸 지도({round, total, fixed, row_fixed,
// swap_only, cells}) — 생성·재생성 뒤 Worker에 따로 요청해 채운다(40명 병동에서 수 초).
// SWAP: 마지막 맞교환 탐색 결과 — 오른쪽 패널에 상대 목록으로 그린다.
let FRAGILE = null;
let SWAP = null;
let picker = null;
// 지금 고르는 중인 칸. 피커는 칸에서 떨어진 자리에 뜨는데다 칸 하나가 26px밖에 안 돼서,
// 옆 칸을 눌러도 피커가 거의 안 움직인다 — 칸 자체에 표시가 없으면 어느 칸을 눌렀는지
// 알 수가 없다("눌렀는데 반응이 없나?" → 같은 자리를 두 번 누르게 된다).
let pickerCell = null;
let formStaff = [];      // [{id, role, level, allowed:[...], flags:[...]}]
// 인원 명단을 어디서 받았는지 — 입력①(원티드표)는 '이번 달 명단(미래)', 입력②(연간근무표)은
// '지난달 실적(과거)'이라 성격이 다르다. 입력①이 이미 명단을 준 뒤에 입력②를 올려도
// 명단을 덮어쓰면 안 되고(전입자가 조용히 사라진다), 둘의 차이로 전입·전출을 판정한다.
// 파일마다 읽은 명단을 따로 보관하고, 실제로 쓸 명단은 항상 recomputeStaff() 한 곳에서
// 정한다. 예전에는 파일마다 formStaff를 직접 덮어써서, 업로드·재업로드·반영 해제 순서에
// 따라 "화면 설명과 실제 명단이 다른" 상태가 생겼다 — 예를 들어 입력① 반영을 해제해도
// 명단은 그대로 남는 식이었다.
let staffOfSample = [];  // 처음 열었을 때의 샘플 병동 명단(아무 파일도 없을 때만 쓰임)
let staffOfWanted = [];  // 입력① 원티드표에서 읽은 명단 — 이번 달 명단의 최종 기준
let staffOfAnnual = [];  // 입력② 연간근무표에서 읽은 명단(지난달 실적)
let staffFromWanted = false;   // 입력①이 명단을 채웠는가 (recomputeStaff가 갱신하는 파생값)
let prevRosterNames = [];      // 입력②(지난달)의 인원 이름들 — 대조용
// 입력② 비고에 '전입'이라 적혀 전 병동 근무기록을 가져온 사람들 — 이 사람들은 입력②에
// 행이 있으므로 명단 차집합으로는 안 잡힌다(대조 화면에서 따로 구분해 보여줘야 함).
let transferredInNames = [];
// 입력①(원티드표)의 '전입'·'전입일' 칸 — 입력②가 OCS 지난달 근무표로 들어오면 그
// 파일에는 전입 칸이 없어서, 여기가 전입 정보의 유일한 출처가 된다.
let wantedTransferredIn = [];
let wantedTransferInDates = {};
// 마지막으로 성공한 입력① 업로드가 어느 달 파일이었는지 — 새 파일이 반려됐을 때
// "그래서 지금 무엇이 쓰이고 있는가"를 화면에 그대로 적어주기 위한 꼬리표.
let wantedActiveTag = "";
// 마지막으로 성공한 입력①의 연월 — 화면 연월과 다르면 신청이 전부 다른 달 날짜가 된다.
let wantedYM = null;     // {year, month} 또는 null
// 입력①에서 읽은 신청·전입일을 파일의 연월 그대로 둔 원본. 실제로 쓰는 formRequests·
// wantedTransferInDates는 화면 연월에 맞춰 날짜를 다시 매긴 것이다(아래 rebaseWantedToScreen).
let wantedRequestsRaw = [];
let wantedTransferInDatesRaw = {};
let wantedDropped = [];   // 화면 달에 없는 날짜(예: 31일)라 뺀 신청 ["홍길동 31일 OFF", ...]
let formRequests = [];   // [{staff_id, date, type, priority}]
let formCarryover = [];  // [{staff_id, last_shift_type, consecutive_work_days, night_block_remaining_off, trailing_night_count}]
let formHolidays = [];      // ["YYYY-MM-DD", ...] 공휴일
let formSubHolidays = [];   // ["YYYY-MM-DD", ...] 대체공휴일
// 근무인력 "평일"을 요일별(월~금)로 따로 지정하는 중인지 — 병동 사정상 특정 요일만
// 근무인력이 다른 경우를 위한 선택 기능. 펼치면 5칸 각각 입력, 접으면 다시 공통값
// 하나로 돌아간다(그 시점의 월요일 값을 대표값으로 남김 — 접은 뒤엔 요일별 차이는
// 사라지는 게 자연스러운 동작이라 별도로 살려두지 않는다).
let minStaffWeekdayExpanded = false;

const $ = (sel) => document.querySelector(sel);
const gridPane = $("#gridPane");
const gridContent = $("#gridContent");
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

function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
// 속성값 안에 들어가므로 따옴표를 반드시 둘 다 막는다 — 큰따옴표를 빼먹으면
// 이름에 `홍길동" onclick="...` 같은 걸 넣었을 때 없던 속성이 만들어진다.
function escAttr(s) { return esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

// 이름·날짜를 onclick="..." 안의 JavaScript 문자열로 조립하지 않는다. HTML 이스케이프는
// JavaScript 문맥을 지켜주지 못한다 — 브라우저가 &#39;를 다시 '로 되돌린 뒤에야 JavaScript
// 파서가 보기 때문에, 이름에 작은따옴표가 있으면 거기서 문자열이 끝나고 그 뒤가 코드가 된다
// (실제로 "간호사');...//" 같은 이름으로 재현했다). 값은 data-*에만 담고, 클릭은 위임으로 받는다.
function delegateClick(root, selector, handler) {
  if (!root) return;
  root.addEventListener("click", (ev) => {
    const el = ev.target.closest(selector);
    if (el && root.contains(el)) handler(el, ev);
  });
}

// ================================================================ 정보 모달

// 사용법 팝업은 입력 화면/결과 화면에서 각각 그 화면에 맞는 내용을 보여준다
// (버튼 위치는 헤더에 하나뿐이지만 클릭 시점의 화면 상태를 보고 내용을 갈아끼움).
const INFO_SHIFT_LEGEND = `
<h3>근무 색상</h3>
<ul>
<li><span class="kbd">D</span> 주간 · <span class="kbd">E</span> 저녁 · <span class="kbd">N</span> 야간 ·
<span class="kbd">NK</span> 야간전담 · <span class="kbd">prn</span> 정규 · <span class="kbd">8A</span>/<span class="kbd">9A</span>/<span class="kbd">10A</span> 오전 상근(prn으로 셉니다) ·
<span class="kbd">연차</span> · <span class="kbd">S/</span> 수면오프 · <span class="kbd">TW</span> 반근무+반교육 · <span class="kbd">군</span> 군공가 ·
<span class="kbd">/</span> 일반오프 · <span class="kbd">X</span> 원티드오프</li>
</ul>
`;

const INFO_RULES = `
<h3>지켜지는 핵심 규칙 (하드 제약 — 절대 위반 없음)</h3>
<ul>
<li>일별 최소 인력(D/E/N/prn) 충족</li>
<li>야간은 <b>연속 2일 블록이 기본</b>(가능근무에 3N을 적었거나 야간목표가 홀수인 달에는 3일까지),
야간 후 반드시 휴식 2일</li>
<li>연속근무 5일 이하, 저녁(E) 다음날 주간/정규 근무 금지</li>
<li>월 최소 휴무일수 확보, NK 전담자는 월 15일(2월 14일) 야간 고정</li>
<li>쉬는 날이 <b>연속 14일을 넘지 않음</b> — 원티드표에 15일 넘게 이어 적으면
15일째부터 반려됩니다(앞의 14일은 반영)</li>
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
<b>입력②</b>으로 다시 올리기만 하면 마지막 근무·연속근무일·야간블록 등 <b>이월정보</b>와, 사람별
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

<h3>기본 사항 — 설정 · 근무인력</h3>
<p>화면에서 직접 입력합니다. 한 번 고쳐두면 <b>이 브라우저에 저장</b>돼 다음에 열 때 그대로
뜹니다(처음에는 샘플 병동 값이 채워져 있어 그대로 <b>바로 생성</b>을 눌러볼 수도 있습니다).
<b>근무정보</b> 맨 위의 <b>마지막 설정값 저장</b> 버튼이 켜져 있어야 기억합니다 — 공용 PC처럼 남기면 안 되는
자리에서는 체크를 끄면 되고, 끄는 순간 이미 저장돼 있던 값도 함께 지웁니다. 값만 처음으로
되돌리려면 그 아래 <b>저장한 설정 지우기</b>를 누릅니다.</p>
<p>저장하는 것은 <b>근무정보와 근무인력</b>뿐입니다 — 인원 명단·원티드 신청·전입은 저장하지
않습니다. 지난달 것이 남아 있으면 오류 하나 없이 틀린 근무표가 나오기 때문입니다.</p>
<ul>
<li><b>병동명 / 연월</b> — 이번에 만들 근무표의 병동과 연·월입니다.</li>
<li><b>월 최대야간</b> — 한 사람이 한 달에 설 수 있는 야간(N) 최대 횟수입니다.</li>
<li><b>연속근무제한</b> — 며칠까지 연속 근무를 허용할지입니다(법정 상한 5일 이하로 설정).</li>
<li><b>야간목표하한 / 야간목표상한</b> — 사람마다 이번 달 야간을 몇 회~몇 회 사이로 맞출지 목표
범위입니다. 실제 배정은 이 범위 안에서 인원 간 형평성을 최대한 맞춥니다.</li>
<li><b>근무인력</b> — 평일·토요일·일요일/공휴일별로 D/E/N 등 근무유형마다 최소 몇 명이 있어야
하는지입니다. 근무표는 이 인원수를 반드시 채웁니다.</li>
<li><b>지정</b> — 근무인력 표의 맨 아랫줄입니다. 그날 <b>'지정' 가능자가 몇 명 근무해야 하는지</b>를
적습니다. 지정을 쓰지 않는 병동은 <b>0</b>으로 두면 이 규칙이 통째로 지나갑니다.</li>
</ul>

<h3>야간리더 칸 — 밤을 맡길 수 있는 사람</h3>
<p>입력①·입력②의 <b>가능근무 바로 옆</b>에 '야간리더' 칸이 있습니다. 해당자에게만
<b>O</b>를 적습니다(비우면 아님).</p>
<ul>
<li>밤에는 <b>숙련도 4 이상이 한 명은 반드시 있어야 합니다</b>(필수 규칙). 그런데 리더가
주간 상근인 병동에서는 밤에 세울 Lv4·Lv5가 한두 명뿐이라, 아무리 잘 짜도 매일 밤을
채울 수가 없습니다 — 그 달 야간이 통째로 빨개집니다.</li>
<li><b>O를 적은 분이 선 밤은 숙련도와 상관없이 그 조건을 채운 것으로 봅니다.</b>
결과 화면에서 이름 옆에 파란 <b>밤</b> 표가 붙습니다.</li>
<li><b>야간 횟수가 늘지는 않습니다</b> — 표시했다고 그분만 밤을 더 서지 않습니다.</li>
<li><b>몇 분이나 표시해야 하나</b> — 밤마다 한 분씩 필요하고 한 분이 월 6회까지 서므로 <b>그 달 날수 ÷ 6</b>이 최소선입니다(30일이면 5분). 밤을 서는 Lv4·Lv5가 이미 있으면 그만큼 빼셔도 됩니다. 한두 분만 표시하면 효과가 작습니다.</li>
<li>낮(D·E)에는 적용되지 않습니다. 거기는 그대로 숙련도로 봅니다.</li>
<li>쓰지 않는 병동은 <b>전부 비워 두면</b> 지금까지와 똑같이 돌아갑니다.</li>
</ul>

<h3>가능근무 칸에 적는 세 가지 — 지정 · 2N · 3N</h3>
<p>입력①·입력②의 <b>가능근무</b> 칸에는 근무코드(D·E·N·prn 등) 말고 다음 세 가지를 함께 적을 수
있습니다. 근무가 아니라 <b>그 사람의 성질</b>이라 근무표 칸에는 찍히지 않습니다.</p>
<ul>
<li><b>지정</b> — 위 '지정' 인원으로 셀 수 있는 사람이라는 표시입니다. 그날 D·E·N·prn 중
무엇이든 서면 자동으로 한 명으로 세집니다(이름 옆에 <b>지</b> 표가 붙습니다). 이미 D·E·N·prn
인원에도 들어 있는 사람이라 인력을 더 쓰는 값이 아니라, <b>그 자리를 누가 채웠는지</b>를 따로
보는 줄입니다.</li>
<li><b>2N · 3N</b> — 야간을 며칠씩 묶어 설지입니다. <b>안 적으면 2N</b>이라 기존 파일을 그대로
올려도 결과가 안 바뀝니다. 3N을 적으면 그 사람만 3일 블록까지 허용되고, 월 야간이
<b>야간목표상한(기본 6회)으로 고정</b>됩니다 — 3일 블록으로는 하한 4를 만들 수 없기 때문입니다.
그래서 3N은 상한이 3·6·9처럼 3의 배수일 때 가장 깔끔하게 동작합니다. 2N과 3N을 함께 적으면
뜻이 갈리므로 반려합니다.
<b>3N은 '되는 한 3일로 묶는다'는 희망값입니다</b> — 달 안에 3일을 넣을 자리가 없으면(쉬는 날 신청,
최소인력, 월 경계 등) 2일 블록이 섞여 나올 수 있고 그건 규칙 위반이 아닙니다. 반드시 3일이어야
하는 경우라면 그 사람의 야간 날짜를 원티드표에 직접 적어주세요.</li>
</ul>
<p>예: <code>D,E,N,지정</code> · <code>D,E,N,prn,3N</code> · <code>D,E,N,2N</code>.
샘플 명단에도 이렇게 적혀 있으니 그대로 보고 옮겨 적으시면 됩니다. 이 표시들은 출력②의 가능근무
칸에 다시 적혀 나가므로, 다음 달 입력②로 올리면 <b>그대로 이어집니다</b>.</p>

<h3>입력① 원티드표 — 인원 정보 · 신청</h3>
<p>직급·숙련도·가능근무·비고·<b>전입·전입일</b> 등 <b>사람 정보는 여기서만</b> 받습니다.
"양식(다운로드)"으로 현재 인원 기준 빈 양식을 내려받아, 이번 달 휴무·근무 신청(원티드)을
채워 다시 올리세요.</p>
<p>날짜 칸은 <b>OCS 화면에서 그대로 복사해 붙여넣어도 됩니다</b> — 말일 칸 오른쪽에 딸려온
D/E/N·®·ⓡ·금월·T연·R연·부서 칸은 읽지 않습니다. 표기는 <b>X = 원티드 오프</b>,
<b>근무코드 뒤의 * = 원티드 근무</b>(예: D*, E*, 연*)이고, 반영된 칸은 화면과 다운로드
파일에서 <b>노란색</b>으로 표시됩니다.</p>
<p>이 파일의 <b>연·월이 곧 만들 달</b>입니다 — 올리면 화면의 연월이 파일에 맞춰집니다.
(일수가 다른 달이면 신청 날짜가 어긋나므로 반려합니다.)</p>
<p><b>같은 날에 신청이 몰리면 누구부터 받나.</b> 자리(그날 최소인력)보다 신청이 많으면
<b>명단 순서가 아니라</b> 아래 순서로 받습니다. 예전에는 파일에 적힌 행 순서대로여서
명단 위쪽 사람이 매달 이겼습니다.</p>
<ul>
<li><b>그 달에 원티드를 적게 적은 분부터</b>입니다. 열 칸 적은 분이 두 칸 적은 분의
자리를 가져가지 않습니다(휴무·근무를 전부 세고, 원티드표에서 눈으로 세는 수와 같습니다)</li>
<li>신청 수가 같으면 <b>그날 조의 숙련도가 고르게 되는 쪽</b>입니다 — 휴무는 같은
숙련도가 많이 남는 분부터 내보내고, 근무는 그 조에 모자란 숙련도부터 채웁니다</li>
<li>밀린 분에게는 "며칠 무슨 근무가 자리 몇 명보다 많아 밀렸다"고 이유가 붙고,
결과 화면 아래 <b>노란 목록에 날짜별로</b> 누가 몇 명 밀렸는지 함께 뜹니다</li>
</ul>

<h3>입력② 연간근무표 — 전월 이월정보</h3>
<p>지난달 만든 근무표(연간근무표 다운로드 파일)를 그대로 올리면, 마지막 근무·연속근무일·야간블록
등 이월정보와 사람별 누적 지표가 자동으로 이어집니다. 첫 달이거나 이월할 게 없으면 생략해도
됩니다.</p>
<p><b>이 프로그램을 처음 쓰는 달</b>이라 연간근무표가 아직 없으면, <b>OCS의 지난달 근무표</b>를
그대로 올려도 됩니다 — 두 형태는 자동으로 구분합니다. 다만 그 파일에는 부서 누적 실적이
없으므로 <b>누적 통계는 이번 달부터 0에서 시작</b>하고, 지난달 근무표에서 실제로 계산할 수
있는 것(연속근무일·야간블록·이월OFF·잔휴)만 이어받습니다. 다음 달부터는 출력②(연간근무표)를
올리면 그대로 쌓입니다.</p>
<p>⚠ <b>'전입'·'전입일' 열이 없는 예전 양식은 받지 않습니다.</b> 그 파일로는 전입자를 표시할
방법이 없어 전입자가 조용히 누락되기 때문입니다. 반려되면 <b>양식(다운로드)</b>로 새 양식을
받으시거나, 이번 달 근무표를 만든 뒤 받은 <b>출력②(연간근무표)</b>를 올려주세요.</p>

<h3>전입·전출 (인사이동)</h3>
<p><b>입력①은 이번 달 명단(앞으로), 입력②는 지난달 실적(지나간 것)</b>입니다. 그래서 입력②를 나중에
올려도 명단을 덮어쓰지 않고, 두 파일의 <b>차이</b>로 인사이동을 판정합니다 — 입력①에만 있으면
<b>전입</b>, 입력②에만 있으면 <b>전출</b>. 둘 다 올리면 입력② 아래에 대조 결과가 바로 표시되니
생성 전에 확인하세요.</p>
<ul>
<li><b>전입자</b> — 지난달 기록이 없어 잔휴·연속근무 이월정보가 없습니다(0에서 시작). 야간 형평성만은
0으로 두면 첫 달부터 야간을 몰아 받게 되므로 재직자 중앙값에서 출발합니다.</li>
<li><b>전출자</b> — 이번 달 배정에서 빠지고, 누적 이력은 출력②(연간근무표)의 '전출' 칸에 보존됩니다.</li>
<li>⚠ <b>이름이 한 글자라도 다르면 다른 사람으로 봅니다</b>(공백·오타 포함). 계속 근무 중인데 전입으로
잡혔다면 입력①·②의 이름을 같게 맞춰 다시 올리세요.</li>
</ul>

<h3>전입자가 전 병동 근무기록을 가져온 경우</h3>
<p>이력을 붙여넣으면 전입자도 계속 근무해온 사람과 똑같이 이어집니다. <b>안전 문제라 권장합니다</b> —
전 병동에서 야간을 서고 온 사람에게 1일부터 근무를 넣으면 야간 후 휴식 규칙이 깨지는데, 이력이
있으면 자동으로 막힙니다.</p>
<ol>
<li>출력②(연간근무표)를 받아 엽니다.</li>
<li><b>기존 인원 목록 바로 아래</b>(맨 아래 'D 인원'~'Lv1-3' 통계 줄보다 위)에 행을 추가합니다 —
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
<li><b>편집</b> — 그리드에서 칸을 클릭해 근무를 바꾸면 오른쪽 목록에 '적용 대기'로 쌓입니다(주황 점선 테두리).
바꾼 칸과 관련된 규칙 위반이 있으면 바로 알려줍니다. 파트장 칸은 <b>D·E·N·NK·prn만 막고</b>
연차·병가·교육·8A 등은 고를 수 있습니다(휴가 신청이 8A에 덮이지 않게 잠급니다).
B팀(신입) 칸은 누르면 바로 반영되고, 재생성 대기 목록에 쌓이지 않습니다.</li>
<li><b>재생성 적용</b> — 적용 대기 중인 편집을 고정한 채 나머지를 다시 배정합니다. 고정된 칸은 빨간
실선 테두리로 표시되고, <b>이후 몇 번을 더 수정해도 이전 고정은 계속 유지됩니다.</b> 고친 칸이
적용 대기로 남아 있는 동안(재생성 적용 전)에는 아래 두 다운로드 버튼이 잠시 비활성화됩니다 — 재생성
적용으로 확정한 뒤 다시 눌러야 받을 수 있습니다.</li>
<li><b>다운로드</b> — <b>월간근무표</b>(병원 OCS 형식, 부서 배포·기록용)와 <b>연간근무표</b>(다음 달
입력②로 바로 재사용 — 이월정보·형평성 지표가 여기 하나로 이어짐) 두 파일을 꼭 둘 다 받아 보관하세요.</li>
<li><b>수정 엑셀 파일 업로드</b> — 내려받은 <b>출력① 월간근무표</b>를 엑셀에서 고쳐 그대로 올리면
<b>다시 계산하지 않고</b> 그 값이 화면에 들어옵니다(엑셀에서 손으로 맞춘 배치를 재생성이
갈아엎지 않게). 바뀐 칸은 확정(고정)으로 잠기고, 규칙 위반이 생겨도 막지 않고 표시만 합니다.
행을 지우거나 더하지 말고 <b>근무 칸만</b> 고쳐주세요 — 다른 달·다른 명단 파일은 반려됩니다.
올린 직후에만 <b>① 즉시 다운로드</b>(고친 그대로)와 <b>② 재생성 후 다운로드</b>(고친 칸은 두고
나머지를 다시 배정) 두 갈래가 뜹니다.</li>
<li><b>시도 점수표</b> — 같은 입력을 시드 셋(찾는 규칙이 조금씩 다름: 시드 옆 글자 W 주말 몫 우선·S 고연차 먼저)으로
돌려 운영 필수 → 숙련도 → 공평성 → 전체 위반 순으로 견줘 가장 좋은 표를 보여줍니다. 점수표 줄을 누르면 그 시드의 표로
바뀝니다(다운로드도 그 표). <b>🔍 꼼꼼히 만들기</b>를 켜고 생성하면 평소 3개 만들어 고르던 것을 9개 만들어 고릅니다 — 위반이 남는 달에
켜 보세요(일반 생성 약 10초 대비 20~30초, 빠듯한 달은 몇 분. 진행 중 '여기까지 결과로 멈추기' 가능).</li>
<li><b>검증 요약의 항목을 누르면</b> 그 칸(사람이 없는 항목은 그날 열)으로 이동해 잠깐 깜빡입니다. 수정 대기 칸이 있는
동안 요약 숫자는 <b>확정표 기준</b>이고, '재생성 적용' 뒤 다시 계산됩니다.</li>
<li><b>날짜 머리칸을 누르면</b> 그날 병동(누가 어디서 일하는지)이 뜨고, 거기서 이름을 누르면 그 사람의 한 달 여정이 뜹니다.
패널 맨 아래 <b>월간 근무 보고(HTML) 받기</b>는 첫 장 요약(확인할 항목·부담 분포)과 검증·일별 인원·원티드·점수표·시각화를
한 파일로 묶어 줍니다 — 열어서 인쇄하면 PDF.</li>
<li><b>D·E 배분</b> — D와 E는 사람마다 비슷한 비율로 나뉩니다(한 사람은 D만, 다른 사람은 E만 서지
않게). 생성 마지막에 같은 날 D인 사람과 E인 사람을 맞바꿔 맞추므로 그날 인원·근무일·휴무는 그대로입니다.
<b>원티드로 신청한 칸과 직접 고친(고정) 칸은 건드리지 않아</b>, D나 E를 많이 신청한 분은 그만큼 치우칠 수 있습니다.</li>
</ul>

<h3>위반이 어느 칸인지 — 모서리 삼각형</h3>
<p>사람·날짜가 특정되는 위반은 그 칸 오른쪽 위에 작은 삼각형으로 표시됩니다.
<b>빨강은 필수위반</b>, <b>주황은 최선노력위반</b>이고, 칸에 마우스를 올리면 규칙과 내용이 뜹니다.
그날 전체 인원수를 가리키는 위반(H1-1 등)이나 월 전체 집계 위반은 특정 칸이 없어
오른쪽 목록에만 남습니다.</p>

<h3>근무표 그리드의 계산열</h3>
<p>날짜 칸 앞뒤로 병원 OCS 파일과 같은 자리에 계산열을 보여줍니다. 칸을 수정하면 재생성 적용을
누르기 전에도 바로 값이 바뀝니다.</p>
<ul>
<li><b>잔휴전월 / 잔휴이후</b> — 이월된 잔여 휴무 기준으로 자동 계산됩니다.</li>
<li><b>D / E / N … (듀티별 횟수)</b> — 이번 달에 그 근무 코드가 적힌 날 수입니다. D·E·N은 항상 보이고,
NK·8A·OFF·연차처럼 이 달 표에 나온 코드만 열로 더 붙습니다. 다운로드 엑셀의 '듀티별 횟수' 블록과 같은 값입니다.</li>
<li><b>주말 / 연속 / 야간</b> — 사람별 부담입니다. 주말·공휴일 근무 날 수, 이번 달 가장 길게 이어진 연속근무
(전월 말에서 이어진 것 포함, 상한을 넘으면 빨강), 야간 횟수/개인 목표(다르면 노랑). 오른쪽 '부담 요약'이
같은 숫자로 손봐야 할 사람을 추려 줍니다(연간근무표를 올렸으면 지난달 대비 늘어난 사람도). 이 세 열은 화면에만 있고
다운로드 엑셀에는 없습니다.</li>
<li><b>미달 날 채울 수 있는 사람</b> — 오른쪽 '일별 근무인력'에 미달 날이 있으면, 그날 쉬는 사람 중 그 근무를 설 수 있고
넣어도 새 필수 위반이 없는 사람을 날짜마다 적어 줍니다. 추천일 뿐이라 다른 사람을 넣어도 되고(그 칸이 빨강·노랑으로
표시될 뿐), 위반이 남은 채로 확정·다운로드도 됩니다.</li>
<li><b>주말·공휴일 근무자</b> — 오른쪽에 접힌 표로, 주말마다 D·E·N에 누가 서는지와 최소인력 대비 인원을 보여줍니다.</li>
<li><b>® / ⓡ</b> — 병원 HR 전용 항목이라 이 앱은 값을 몰라 항상 빈칸입니다(다운로드 파일과 동일).</li>
<li><b>금월</b> — 이번 달 휴일수(전 직원 공통) · <b>Lv</b> — 직급입니다.</li>
</ul>

<h3>그리드 맨 아래 "통계" 줄</h3>
<p>날짜마다 그날 몇 명이 서는지를 세어 보여줍니다. 칸을 수정하면 재생성 적용 전에도 바로 다시 셉니다.</p>
<ul>
<li><b>근무 코드마다 한 줄</b> — 이달 표에 나온 코드(D·E·N·NK·8A·prn·연차·OFF…)마다 그날 그 코드인
사람 수입니다. 오른쪽 '듀티별 횟수' 열과 같은 코드 목록을 눕힌 것입니다(열은 사람별 횟수, 줄은 날짜별 인원).</li>
<li><b>최소인력 기준이 걸리는 줄</b> — D·E는 그 코드 줄에 바로 걸립니다. 야간전담(NK)이 있는 병동은
N·NK를 따로 세고 그 아래 <b>N+NK</b> 줄에 N 기준이 걸립니다. 8A·9A·10A·prn·반일 코드는 각자 사람 수로
세고, 그 아래 <b>prn 합계</b> 줄에 prn 기준이 걸립니다 — 이 줄만 반일(8AH·9AH·9H*)을 <b>0.5명</b>으로
세서 "2.5" 같은 값이 뜰 수 있습니다(반나절만 서는 사람을 온종일 선 것으로 세면 못 채운 날이 채운
날처럼 보이기 때문입니다).</li>
<li><b>점선 아래</b>는 최소인력에 안 세는 코드(교육·OFF·연차 같은 휴가·OCS 코드)입니다.</li>
<li><b>지정 인원</b> — 근무인력 표의 '지정' 값이 0보다 클 때만 나옵니다. 가능근무 칸에
'지정'을 적은 사람이 그날 D·E·N·prn 중 무엇이든 서면 한 명으로 세집니다(이름 옆에
<span class="kbd">지</span> 표가 붙습니다). 이미 위의 근무 줄에도 들어 있는
사람이라, 인력을 더 쓰는 값이 아니라 <b>그 자리를 누가 채웠는지</b>를 따로 보는 줄입니다.
반일이어도 1명입니다 — 그 사람이 그날 병동에 있느냐를 보는 값이라서요.</li>
<li><b>파트장은 빼고 셉니다</b> — 최소인력 기준 자체가 파트장을 뺀 숫자라서, 같이 세면 파트장의 8A가
prn으로 잡혀 못 채운 날이 채운 날처럼 보입니다.</li>
<li><b>빨간 칸 = 그날 최소인력에 못 미침, 노란 칸 = 기준보다 한 명 이상 많음</b>(상한 초과 — 결과창의
'추가 검토'에도 같은 날이 뜹니다). 칸에 마우스를 올리면 "3일 N+NK 5명 (기준 6명 — 미달)"처럼
실제 인원과 기준이 같이 뜹니다. 평일·토요일·일요일·공휴일마다 기준이 다르므로, 같은 숫자라도
어떤 날은 빨갛고 어떤 날은 아닙니다.</li>
<li><b>D 레벨 · E 레벨 · N 레벨</b> — <b>근무조마다</b> 그날 선 사람들의 평균 숙련도입니다.
예전엔 전체를 섞은 '레벨평균' 한 줄이었는데, 섞으면 어느 조가 얇은지 안 보입니다 —
평균이 3.1이어도 그날 E조는 전원 저연차일 수 있어서요. <b>숙련도 4 이상이 한 명도 없는
조는 칸이 빨개집니다</b>(필수 규칙). 아무도 안 선 조는 <b>–</b>입니다.
<b>N 줄에는 예외가 하나 있습니다</b> — 입력① '야간리더' 칸에 O를 적은 분이 그 밤에 서 있으면
숙련도와 상관없이 충족으로 보므로 빨개지지 않습니다(평균 숫자는 실제 숙련도 그대로입니다).
D·E에는 이 예외가 없습니다.</li>
<li><b>Lv4-5 · Lv1-3</b> — 그날 근무자 중 숙련도 4~5인 분과 1~3인 분이 각각 몇 명인지입니다.</li>
</ul>
<p>같은 줄이 <b>월간근무표</b> 맨 아래에도 붙습니다(기준 미달은 거기서도 빨갛게 표시됩니다).
<b>연간근무표</b>에도 숫자는 들어가지만 빨간 칠은 없습니다 — 그 파일은 다음 달 입력②로 다시
올리는 파일이라 여러 달치가 쌓이는데, 지난 달 기준으로 칠한 빨강이 남아 있으면 이번 달을
잘못 읽게 됩니다.</p>

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
// Esc로도 닫힌다 — 근무 선택기는 Esc로 닫히는데 설명서만 안 닫혀, 키보드로 쓰는 사람은
// ✕ 버튼까지 Tab으로 가야 했다(2026-10-13 화면 훑기). 선택기가 열려 있으면 그쪽이 먼저다.
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || picker) return;
  const bd = $("#infoModalBackdrop");
  if (bd.classList.contains("show")) { bd.classList.remove("show"); $("#infoBtn").focus(); }
});

// ================================================================ 입력 폼 채우기

function populateYearMonthSelects() {
  const curYear = new Date().getFullYear();
  $("#f_year").innerHTML = Array.from({ length: 7 }, (_, i) => curYear - 1 + i)
    .map(y => `<option value="${y}">${y}년</option>`).join("");
  $("#f_month").innerHTML = Array.from({ length: 12 }, (_, i) => i + 1)
    .map(m => `<option value="${m}">${m}월</option>`).join("");
}
populateYearMonthSelects();

function noteYearMonthEdit() {
  if (wantedYM) rebaseWantedToScreen();
  renderSourceBadges();
  const y = $("#f_year").value, m = $("#f_month").value;
  if (ymMismatch()) {
    showToast(`연월 → ${y}년 ${m}월: 화면 연월로 만듭니다 — 입력① 파일(${wantedYM.year}년 ${wantedYM.month}월)의 ` +
              `신청 ${formRequests.length}건은 날짜의 '일'만 보고 ${m}월에 적용합니다` +
              (wantedDropped.length ? ` (${m}월에 없는 날짜 ${wantedDropped.length}건은 뺌)` : ""));
  } else {
    showToast(`연월 → ${y}년 ${m}월: 화면에서 고른 값이 쓰입니다`);
  }
}
$("#f_year").onchange = () => { seedHolidaysForYear(parseInt($("#f_year").value, 10)); renderHolidayCalendar(); noteYearMonthEdit(); };
$("#f_month").onchange = () => { renderHolidayCalendar(); noteYearMonthEdit(); };

// 연/월을 코드에서 바꿀 때 쓴다. 연도 목록은 올해 기준 7년치뿐이라, 그 밖의 해를
// 그냥 대입하면 select가 조용히 안 바뀐다 — 없으면 항목을 만들어 넣는다.
function setFormYearMonth(year, month) {
  const ySel = $("#f_year");
  if (!Array.from(ySel.options).some(o => Number(o.value) === year)) {
    const opt = document.createElement("option");
    opt.value = String(year);
    opt.textContent = `${year}년`;
    ySel.appendChild(opt);
    Array.from(ySel.options).sort((a, b) => Number(a.value) - Number(b.value))
      .forEach(o => ySel.appendChild(o));
  }
  ySel.value = String(year);
  $("#f_month").value = String(month);
  seedHolidaysForYear(year);
  renderHolidayCalendar();
  saveSettings();
}

// 입력① 원티드표 양식 — "설정"의 연/월과 지금 알고 있는 인원 목록으로 매번 새로
// 만든다(달마다 일수가 다르므로 고정 파일로는 못 맞춘다). 별도 선택 없이 "설정"
// 연/월을 그대로 쓴다 — 원티드표는 늘 같은 달 것이라 따로 고를 필요가 없다. 인원의
// 직급·숙련도·가능근무·비고까지 현재 값으로 미리 채워 내려줘서, 다시 올릴 때 필요한
// 부분만 고치면 된다.
window.downloadWantedTemplate = async function () {
  const year = parseInt($("#f_year").value, 10);
  const month = parseInt($("#f_month").value, 10);
  const staff = formStaff.map(s => ({ id: s.id, role: s.role, level: s.level,
                                      allowed_shifts: s.allowed, flags: s.flags }));
  await apiDownloadWantedTemplate(
    { year, month, staff, team_b_names: teamBNamesFromForm() },
    `입력1_원티드표_${year}-${String(month).padStart(2, "0")}.xlsx`);
};

// 결과 화면의 다운로드 두 개 — 어느 판이냐에 따라 받는 방법이 다르다(platform.js).
// 엑셀에서 고친 월간근무표를 되올린다 — 재생성 없이 그 값 그대로 화면에 반영.
// 올린 직후에만 '즉시/재생성' 두 갈래를 띄운다. 그 '직후'를 시각이 아니라 **회차**로
// 잡는다 — 시각으로 잡았더니 한 번 올린 뒤로는 생성·재생성·되돌리기를 해도 배너가
// 계속 떠 있었고, "올린 수정본이 반영되었습니다"라는 문구가 사실이 아닌 채로 남았다.
// 늘 떠 있으면 '② 재생성'이 눌리기 쉬운데 그건 고정 칸 말고 표 전체를 다시 짜는,
// 되돌릴 수 없는 동작이다.
let uploadedMonthRound = -1;
const monthUploadJustApplied = () => ST && ST.round === uploadedMonthRound;

window.uploadMonth = () => $("#monthInput").click();

window.downloadBothOutputs = async function () {
  // 기존 다운로드 버튼 두 개는 필수 위반이 남아 있으면 한 번 묻는다. 이 분기만
  // 그 확인을 안 거치면, 새로 생긴 길로는 못 채운 칸이 있는 근무표가 아무 경고 없이
  // 나간다 — 같은 파일을 받는 동작이 어느 버튼을 눌렀느냐로 갈리면 안 된다.
  if (!confirmDownloadWithViolations()) return;
  await apiDownload("xlsx_ocs");
  // 두 번째를 곧바로 시작하지 않고 한 박자 쉰다. 브라우저에 따라 짧은 간격의 연속
  // 다운로드를 하나로 묶거나 두 번째를 막는다 — 그러면 출력①만 받고 끝난 줄 안다.
  await new Promise(r => setTimeout(r, 400));
  await apiDownload("staff_table");
};

window.regenerateThenDownload = async function () {
  showGenOverlay("고친 칸은 두고 나머지를 다시 짜는 중입니다…", thoroughOn(), true);
  if (lastStaffing && lastStaffing.level && lastStaffing.level !== "ok") {
    markGenOverlaySlow("인원이 빠듯해 평소보다 오래 걸립니다 — 다시 계산 중입니다…");
  }
  const before = (ST && ST.grid) || {};
  try {
    ST = await api("/api/regenerate", genOpts());
    let moved = 0;
    for (const sid in ST.grid) {
      const a = before[sid];
      if (!a) continue;
      const b = ST.grid[sid];
      for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) moved++;
    }
    uploadedMonthRound = -1;
    SWAP = null;
    render();
    showToast(`${ST.round}회차로 재생성 완료 — ${moved}칸 바뀜`);
    refreshFragile();
    await downloadBothOutputs();
  } catch (e) {
  } finally {
    hideGenOverlay();
  }
};

window.applyUploadedMonth = async function (f) {
  showGenOverlay("올린 근무표를 화면에 반영하는 중입니다…");
  const before = (ST && ST.grid) || {};
  try {
    const beforeB = (ST && ST.team_b_grid) || {};
    const next = await apiUpload("/api/upload_month", f);
    let moved = 0;
    for (const sid in next.grid) {
      const a = before[sid];
      if (!a) continue;
      const b = next.grid[sid];
      for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) moved++;
    }
    // 신입(B팀) 행은 엔진 grid에 없다 — 여기서 안 세면 신입만 고친 파일을 올렸을 때
    // "바뀐 칸이 없습니다"가 떠서, 반영은 됐는데 안 된 것처럼 보인다.
    for (const name in next.team_b_grid || {}) {
      const a = beforeB[name] || [];
      const b = next.team_b_grid[name] || [];
      for (let i = 0; i < b.length; i++) if ((a[i] || "") !== (b[i] || "")) moved++;
    }
    ST = next;
    uploadedMonthRound = next.round;
    render();
    showToast(moved ? `${moved}칸을 화면에 반영했습니다` : "바뀐 칸이 없습니다");
  } catch (e) {
  } finally {
    hideGenOverlay();
  }
};

window.downloadXlsxOcs = () => apiDownload("xlsx_ocs");
window.downloadStaffTable = () => apiDownload("staff_table");

function renderHolidayCalendar() {
  const y = parseInt($("#f_year").value, 10);
  const m = parseInt($("#f_month").value, 10);
  if (!y || !m) return;
  const startDow = new Date(y, m - 1, 1).getDay();   // 0=일
  const numDays = new Date(y, m, 0).getDate();
  const holSet = new Set(formHolidays);
  const subSet = new Set(formSubHolidays);
  // toISOString()은 UTC라 한국시간 0~9시에는 '오늘'이 어제로 칠해진다 — 현지 날짜로 만든다.
  const _t = new Date();
  const todayIso = `${_t.getFullYear()}-${String(_t.getMonth() + 1).padStart(2, "0")}-${String(_t.getDate()).padStart(2, "0")}`;

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
    html += `<td class="${cls}" data-iso="${iso}">${day}</td>`;
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

// 이 앱으로 만드는 것은 늘 '다음 달' 근무표다 — 열 때마다 그 달로 맞춰준다.
function nextMonth() {
  const d = new Date();
  d.setDate(1);                 // 31일에 열면 달이 두 칸 건너뛰는 것을 막는다
  d.setMonth(d.getMonth() + 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function fillForm(cfg) {
  $("#f_ward").value = cfg.ward_id || "";
  const nm = nextMonth();
  $("#f_year").value = nm.year;
  $("#f_month").value = nm.month;
  const p = cfg.params || {};
  $("#f_maxnights").value = p.off_max_per_month ?? 6;
  $("#f_maxconsecutive").value = p.max_consecutive_work ?? 5;
  $("#f_nightquota_low").value = p.night_quota_low ?? 4;
  $("#f_nightquota_high").value = p.night_quota_high ?? 6;
  $("#f_advanced_track").value = (p.advanced_track_staff || []).join("\n");
  updateAdvancedTrackCount();
  // 공휴일은 서버가 준 값이 아니라 화면이 고른 '그 해'로 다시 잡는다. 예전엔 샘플이
  // 준 값을 그대로 썼는데, 샘플의 연월과 위 nextMonth()가 고른 연월이 다른 달에는
  // (샘플을 구운 달이 지나면 항상 그렇다) 달력에 공휴일이 하나도 안 뜨거나 남의 달
  // 공휴일이 떴다. 휴일수는 잔휴·주말야간 계산의 기준이라 조용히 틀리면 안 된다.
  seedHolidaysForYear(nm.year);
  renderHolidayCalendar();

  // 샘플 명단은 아무것도 안 올린 상태에서 '바로 생성'이 되게 하는 용도다. 입력①이
  // 명단을 주면 그쪽이 항상 이긴다 — 판단은 recomputeStaff() 한 곳에서만 한다.
  staffOfSample = (cfg.staff || []).map(s => ({
    id: s.id, role: s.role, level: s.level,
    allowed: [...(s.allowed_shifts || [])], flags: [...(s.flags || [])],
  }));
  recomputeStaff();

  $("#f_team_b").value = (p.team_b_names || []).join("\n");
  updateTeamBCount();

  const ms = p.min_staff || {};
  const byDow = ms.weekday_by_dow || {};
  minStaffWeekdayExpanded = Object.keys(byDow).length > 0;
  renderMinStaffTable();
  for (const [key] of MIN_STAFF_ROWS) {
    for (const [col] of MIN_STAFF_COLS) {
      if (col === "weekday" && minStaffWeekdayExpanded) continue;
      const el = document.getElementById(`ms_${key}_${col}`);
      if (el) el.value = (ms[col] && ms[col][key] !== undefined) ? ms[col][key] : 0;
    }
    if (minStaffWeekdayExpanded) {
      for (const [dow] of MIN_STAFF_DOWS) {
        const day = byDow[dow] || ms.weekday || {};
        const el = document.getElementById(`ms_${key}_weekday_${dow}`);
        if (el) el.value = day[key] !== undefined ? day[key] : 0;
      }
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
  const thead = $("#minStaffTable thead");
  const tbody = $("#minStaffTable tbody");
  let headHtml = "<tr><th>근무</th>";
  if (minStaffWeekdayExpanded) {
    headHtml += MIN_STAFF_DOWS.map(([, dowLabel]) => `<th>${dowLabel}</th>`).join("");
  } else {
    headHtml += "<th>평일</th>";
  }
  headHtml += `<th>토요일</th><th>일요일·공휴일</th></tr>`;
  thead.innerHTML = headHtml;

  tbody.innerHTML = MIN_STAFF_ROWS.map(([key, label]) => {
    let cells = "";
    if (minStaffWeekdayExpanded) {
      cells += MIN_STAFF_DOWS.map(([dow, dowLabel]) =>
        `<td data-label="${dowLabel}"><input type="number" min="0" step="1" required placeholder="0" id="ms_${key}_weekday_${dow}" value="0"></td>`).join("");
    } else {
      cells += `<td data-label="평일"><input type="number" min="0" step="1" required placeholder="0" id="ms_${key}_weekday" value="0"></td>`;
    }
    cells += `<td data-label="토요일"><input type="number" min="0" step="1" required placeholder="0" id="ms_${key}_saturday" value="0"></td>`;
    cells += `<td data-label="일요일·공휴일"><input type="number" min="0" step="1" required placeholder="0" id="ms_${key}_sunday_holiday" value="0"></td>`;
    return `<tr><td data-label="근무"><b>${label}</b></td>${cells}</tr>`;
  }).join("");

  updateMinStaffDowToggle();
}

// 표 밖의 버튼·설명 문구 — 무엇을 하는 기능인지, 지금 어떤 상태인지 글로 알려준다
// (예전엔 "평일 ▾" 헤더를 눌러야 펼쳐지는 숨은 토글이라 처음 쓰는 사람은 알 수 없었다).
function updateMinStaffDowToggle() {
  const btn = $("#msWeekdayToggle");
  const hint = $("#msWeekdayHint");
  if (!btn) return;
  if (minStaffWeekdayExpanded) {
    btn.textContent = "↩ 평일 하나로 합치기";
    if (hint) hint.textContent = "월~금을 따로 지정하는 중입니다. 합치면 월요일 값으로 통일됩니다.";
  } else {
    btn.textContent = "＋ 평일을 요일별로 나누기";
    if (hint) hint.textContent = "평일 근무인력이 요일마다 다르면 눌러서 월~금을 각각 입력할 수 있습니다.";
  }
  btn.onclick = () => toggleMinStaffWeekdayExpand(!minStaffWeekdayExpanded);
}

// 펼치기: 지금 "평일" 공통값을 5칸에 그대로 채워 넣어(값이 갑자기 0으로 안 보이게)
// 시작한다. 접기: 월요일 칸 값을 대표값으로 남긴다(요일별 차이는 접으면 사라짐 —
// "다시 공통값 하나로 돌아간다"는 의도된 동작이라 별도 로직으로 살리지 않는다).
function toggleMinStaffWeekdayExpand(expand) {
  if (expand === minStaffWeekdayExpanded) return;
  // 표를 통째로 다시 그리므로 모든 칸이 value="0"으로 새로 만들어진다 — 평일뿐
  // 아니라 토요일·일요일 칸도 반드시 같이 담아뒀다 되돌려놔야 한다(예전엔 평일만
  // 복원해서, 펼치기만 눌러도 토/일 인력이 조용히 0으로 리셋됐다).
  const weekday = {};
  const rest = {};
  for (const [key] of MIN_STAFF_ROWS) {
    weekday[key] = expand
      ? (document.getElementById(`ms_${key}_weekday`)?.value || "0")
      : (document.getElementById(`ms_${key}_weekday_0`)?.value || "0");
    for (const col of ["saturday", "sunday_holiday"]) {
      rest[`${key}_${col}`] = document.getElementById(`ms_${key}_${col}`)?.value || "0";
    }
  }
  minStaffWeekdayExpanded = expand;
  renderMinStaffTable();
  for (const [key] of MIN_STAFF_ROWS) {
    if (expand) {
      for (const [dow] of MIN_STAFF_DOWS) {
        document.getElementById(`ms_${key}_weekday_${dow}`).value = weekday[key];
      }
    } else {
      document.getElementById(`ms_${key}_weekday`).value = weekday[key];
    }
    for (const col of ["saturday", "sunday_holiday"]) {
      document.getElementById(`ms_${key}_${col}`).value = rest[`${key}_${col}`];
    }
  }
}
renderMinStaffTable();

// 인원(직급/숙련도/가능근무/비고) · 원티드 신청 · 전월이월은 더 이상 화면에서 직접
// 타이핑하지 않는다 — 인원+원티드는 입력①, 전월이월은 입력②가 전담한다(둘 다 파일
// 업로드로만 채워짐). formStaff/formRequests/formCarryover는 여전히 그 업로드 결과를
// 담는 내부 상태로 남아있고, 아래 요약 텍스트로만 화면에 반영 상태를 보여준다.
function renderStaffSummary() {
  const el = $("#staffSummary");
  if (!el) return;
  if (!formStaff.length) { el.textContent = ""; return; }
  const src = staffFromWanted ? `입력①${wantedActiveTag ? `(${wantedActiveTag})` : ""}에서 반영`
            : (staffOfAnnual.length ? "입력②(연간근무표)에서 반영" : "샘플 명단 — 입력①을 올리면 바뀝니다");
  el.textContent = `현재 인원: ${formStaff.length}명 — ${src}`;
}

// ================================================================ 값의 출처 표시
// 어느 값이 어디서 왔고 지금 무엇이 쓰이는지를 화면에 늘 적어 둔다. 파일을 올리면 설정도 따라올
// 거라 믿고 화면 값을 안 본 채 생성해, 연속근무제한 2로 전원 이틀씩 끊긴 12월 근무표가 나간 적이
// 있다. 파일이 주는 것(연월·인원·신청)과 화면이 주는 것(설정·근무인력)을 갈라서 보여주고, 화면에서
// 바꾸면 "그 값이 쓰인다"고 그 자리에서 말한다. 연월만은 둘 다 줄 수 있어 어긋나면 노랗게 켠다.
let settingsSource = "sample";   // sample | saved | screen | empty
let lastScreenEdit = "";         // "연속근무제한 → 4"
const FIELD_LABELS = { f_ward: "병동명", f_maxnights: "월 최대야간", f_maxconsecutive: "연속근무제한",
                       f_nightquota_low: "야간목표하한", f_nightquota_high: "야간목표상한" };
const DOW_SHORT = ["월", "화", "수", "목", "금"];
function fieldLabel(el) {
  if (!el || !el.id) return "";
  if (FIELD_LABELS[el.id]) return FIELD_LABELS[el.id];
  const m = /^ms_(.+?)_(weekday|saturday|sunday_holiday)(?:_(\d))?$/.exec(el.id);
  if (!m) return "";
  const col = (MIN_STAFF_COLS.find(([c]) => c === m[2]) || [])[1] || m[2];
  return `근무인력 ${col}${m[3] !== undefined ? ` ${DOW_SHORT[Number(m[3])]}요일` : ""} ${m[1]}`;
}
function screenYM() {
  return { year: parseInt($("#f_year").value, 10), month: parseInt($("#f_month").value, 10) };
}
function ymMismatch() {
  if (!wantedYM) return false;
  const s = screenYM();
  return wantedYM.year !== s.year || wantedYM.month !== s.month;
}
// 입력①의 신청·전입일을 화면 연월에 맞춰 다시 매긴다 — 날짜의 '일'만 살리고 연·월은 화면 것.
// 화면 달에 없는 날(30일 달의 31일)은 빼고 wantedDropped에 적어 화면이 말하게 한다.
function rebaseWantedToScreen() {
  const s = screenYM();
  const nd = new Date(s.year, s.month, 0).getDate();
  const ym = `${s.year}-${String(s.month).padStart(2, "0")}`;
  wantedDropped = [];
  formRequests = [];
  for (const r of wantedRequestsRaw) {
    const day = parseInt(String(r.date).slice(8, 10), 10);
    if (!(day >= 1 && day <= nd)) { wantedDropped.push(`${r.staff_id} ${day}일 ${shiftText(r.type, true)}`); continue; }
    formRequests.push({ ...r, date: `${ym}-${String(day).padStart(2, "0")}` });
  }
  wantedTransferInDates = {};
  for (const [sid, ds] of Object.entries(wantedTransferInDatesRaw)) {
    const day = parseInt(String(ds).slice(8, 10), 10);
    if (day >= 1 && day <= nd) wantedTransferInDates[sid] = `${ym}-${String(day).padStart(2, "0")}`;
  }
}
function renderYmNotice() {
  const box = $("#ymNotice");
  if (!box) return;
  if (!wantedYM || !ymMismatch()) { box.style.display = "none"; box.innerHTML = ""; return; }
  const s = screenYM();
  const dropped = wantedDropped.length
    ? `<p class="ym-notice-sub">⚠ ${s.month}월에 없는 날짜라 뺀 신청 ${wantedDropped.length}건: ${esc(wantedDropped.slice(0, 6).join(", "))}${wantedDropped.length > 6 ? " 외 " + (wantedDropped.length - 6) + "건" : ""}</p>`
    : "";
  box.style.display = "";
  box.innerHTML =
    `<div class="ym-notice-head">파일과 화면의 연월이 다릅니다</div>` +
    `<div class="ym-notice-flow">` +
      `<span class="ym-chip file">📄 입력① 파일 <b>${wantedYM.year}년 ${wantedYM.month}월</b></span>` +
      `<span class="ym-arrow">→</span>` +
      `<span class="ym-chip screen">🖥 화면 연월 <b>${s.year}년 ${s.month}월</b></span>` +
    `</div>` +
    `<p class="ym-notice-sub">근무표는 <b>화면 연월 ${s.year}년 ${s.month}월</b>로 만듭니다. 파일의 신청 ${formRequests.length}건은 날짜의 '일'만 보고 ${s.month}월에 적용합니다.</p>` +
    dropped +
    `<button type="button" class="small" id="ymAdoptFileBtn">화면 연월을 파일에 맞추기 (${wantedYM.year}년 ${wantedYM.month}월)</button>`;
  $("#ymAdoptFileBtn").onclick = () => {
    setFormYearMonth(wantedYM.year, wantedYM.month);
    rebaseWantedToScreen();
    renderSourceBadges();
    showToast(`화면 연월을 입력①과 같은 ${wantedYM.year}년 ${wantedYM.month}월로 맞췄습니다`);
  };
}
function renderSourceBadges() {
  const ym = $("#ymSource");
  if (ym) {
    if (!wantedYM) { ym.className = "src-badge"; ym.textContent = ""; }
    else if (ymMismatch()) {
      ym.className = "src-badge warn show";
      ym.textContent = `화면 연월로 만듭니다 — 입력① 파일은 ${wantedYM.year}년 ${wantedYM.month}월`;
    } else { ym.className = "src-badge show"; ym.textContent = `입력①과 같은 달(${wantedYM.year}년 ${wantedYM.month}월)`; }
  }
  renderYmNotice();
  const head = "이 값들은 파일에서 오지 않습니다 — ";
  const text = {
    sample: head + "지금은 샘플 병동 기본값입니다. 우리 병동 값으로 고쳐 쓰세요.",
    saved: head + "지금은 이 브라우저에 저장해 둔 값(마지막으로 고친 값)입니다.",
    empty: head + "지금은 비어 있습니다. 우리 병동 값을 채워 넣으세요.",
    screen: `화면에서 바꾼 값이 쓰입니다 — 마지막 변경: ${lastScreenEdit}` +
            (settingsSaveEnabled() ? " (이 브라우저에 저장됨)" : " (저장 꺼짐 — 이번 생성에만)"),
  }[settingsSource];
  for (const sel of ["#settingsSource", "#minStaffSource"]) {
    const el = $(sel);
    if (!el) continue;
    el.textContent = text;
    el.classList.toggle("screen", settingsSource === "screen");
  }
  renderStaffSummary();
}
function noteScreenEdit(el) {
  const label = fieldLabel(el);
  if (!label) return;
  const v = (el.value ?? "").toString().trim();
  lastScreenEdit = `${label} → ${v === "" ? "(빈칸)" : v}`;
  settingsSource = "screen";
  renderSourceBadges();
  showToast(`${lastScreenEdit}: 화면에서 바꾼 값이 쓰입니다` +
            (settingsSaveEnabled() ? " (이 브라우저에 저장됨)" : " (저장 꺼짐 — 이번 생성에만)"));
}
document.querySelector(".info-section")?.addEventListener("change", (ev) => {
  const el = ev.target;
  if (!(el instanceof HTMLInputElement)) return;   // 연월(select)은 아래에서 따로 말한다
  noteScreenEdit(el);
});

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

// 최소인력 칸을 '있는 그대로' 읽는다 — 빈칸이나 소수를 다른 정수로 바꾸지 않는다.
// 예전엔 parseInt(값 || "0")이라 D를 지우면 0명, E에 1.9를 적으면 1명이 됐다. 인원 기준을
// 낮춰놓고도 "입력 기준을 모두 지켰습니다"라는 결과가 나오는 게 이 앱에서 제일 나쁜 종류의
// 실패다. 못 읽는 값은 고쳐 읽지 말고 어느 칸이 왜 문제인지 말하고 멈춘다.
let minStaffErrors = [];
function readMinStaffCell(id, label) {
  const el = document.getElementById(id);
  const raw = (el ? el.value : "").trim();
  if (raw === "") {
    minStaffErrors.push(`${label} 칸이 비어 있습니다`);
    return 0;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    minStaffErrors.push(`${label} 칸의 "${raw}"을(를) 숫자로 읽을 수 없습니다`);
    return 0;
  }
  if (!Number.isInteger(n)) {
    minStaffErrors.push(`${label} 칸의 ${raw}은(는) 정수가 아닙니다 — 사람 수는 소수일 수 없습니다`);
    return 0;
  }
  if (n < 0) {
    minStaffErrors.push(`${label} 칸의 ${raw}은(는) 0보다 작습니다`);
    return 0;
  }
  return n;
}

// 연속근무제한은 3 이상만 받는다(워커 _validate_params와 같은 하한). 2 이하면 주간 블록
// 3~4일(H6-1)과 동시에 지킬 수 없어, 오류 없이 전원이 '근무 2일·쉼 1일'로 끊긴 근무표가
// 나온다 — 실제로 그렇게 만든 12월 근무표가 파트장에게 갔다. 칸 이름만 보고 '야간 연속
// 2일' 같은 뜻으로 넣기 쉬워서, 생성 전에 이유를 말하며 멈춘다.
const MIN_CONSECUTIVE_LIMIT = 3;
function readConsecutiveLimit() {
  const before = minStaffErrors.length;
  const n = readMinStaffCell("f_maxconsecutive", "연속근무제한");
  if (minStaffErrors.length === before && n < MIN_CONSECUTIVE_LIMIT) {
    minStaffErrors.push(`연속근무제한 칸의 ${n}은(는) ${MIN_CONSECUTIVE_LIMIT}보다 작습니다 — ` +
      "2 이하면 주간 블록 3~4일(H6-1)을 지킬 수 없어 모든 근무가 2일씩 끊기고 최소인력도 모자랍니다(보통은 5)");
  }
  return n;
}

function buildCfgFromForm() {
  const holidays = [...formHolidays];
  const subhol = [...formSubHolidays];
  const minStaff = {};
  minStaffErrors = [];
  for (const [col, colLabel] of MIN_STAFF_COLS) {
    if (col === "weekday" && minStaffWeekdayExpanded) continue;
    minStaff[col] = {};
    for (const [key] of MIN_STAFF_ROWS) {
      minStaff[col][key] = readMinStaffCell(`ms_${key}_${col}`, `근무인력 ${colLabel} ${key}`);
    }
  }
  if (minStaffWeekdayExpanded) {
    // "weekday"는 하위호환 기본값으로 월요일 값을 채워 넣는다(백엔드가 이 키를
    // 항상 요구하고, weekday_by_dow를 모르는 옛 코드도 이 값으로 동작할 수 있게).
    minStaff.weekday = {};
    minStaff.weekday_by_dow = {};
    for (const [key] of MIN_STAFF_ROWS) {
      minStaff.weekday[key] = readMinStaffCell(`ms_${key}_weekday_0`, `근무인력 월요일 ${key}`);
    }
    for (const [dow, dowLabel] of MIN_STAFF_DOWS) {
      minStaff.weekday_by_dow[dow] = {};
      for (const [key] of MIN_STAFF_ROWS) {
        minStaff.weekday_by_dow[dow][key] =
          readMinStaffCell(`ms_${key}_weekday_${dow}`, `근무인력 ${dowLabel} ${key}`);
      }
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
      // 비었을 때 조용히 기본값을 쓰지 않는다 — '저장한 설정 지우기'로 비운 뒤
      // 그대로 생성하면, 우리 병동과 상관없는 숫자로 만든 근무표가 나온다.
      off_max_per_month: readMinStaffCell("f_maxnights", "월 최대야간"),
      max_consecutive_work: readConsecutiveLimit(),
      night_quota_low: readMinStaffCell("f_nightquota_low", "야간목표하한"),
      night_quota_high: readMinStaffCell("f_nightquota_high", "야간목표상한"),
      holidays, substitute_holidays: subhol,
      advanced_track_staff: advancedTrackFromForm(),
      team_b_names: teamBNamesFromForm(),
    },
    prev_month_carryover: carry,
    requests: formRequests.filter(r => r.staff_id && r.date),
    wanted_transferred_in: wantedTransferredIn,
    wanted_transfer_in_dates: wantedTransferInDates,
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

// 실제로 쓸 인원 명단을 한 곳에서 정한다 — 입력①(이번 달 명단) > 입력②(지난달 명단)
// > 샘플 순. 파일을 올리거나 반영을 해제할 때마다 이 함수만 부르면 되고,
// 그래서 업로드 순서에 따라 상태가 꼬이지 않는다.
function recomputeStaff() {
  staffFromWanted = staffOfWanted.length > 0;
  formStaff = staffFromWanted ? staffOfWanted
            : (staffOfAnnual.length ? staffOfAnnual : staffOfSample);
  renderStaffSummary();
  renderRosterDiff();
}

// 입력①(이번 달 명단)와 입력②(지난달 명단)을 대조해 전입·전출을 화면에 명시한다.
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
  // 전 병동 기록을 가져온 전입자는 입력②에도 행이 있어 차집합에 안 잡힌다 — 따로 센다.
  const withHistory = transferredInNames.filter(n => cur.has(n));
  if (!incoming.length && !outgoing.length && !withHistory.length) {
    box.style.display = "";
    box.className = "roster-diff same";
    box.innerHTML = `✓ 인원 변동 없음 — 입력①·② 명단 ${cur.size}명이 모두 일치합니다.`;
    return;
  }
  let html = "";
  if (incoming.length) {
    html += `<div><b>전입 ${incoming.length}명</b> (입력①에만 있음): ${incoming.map(esc).join(", ")}`
         +  `<span class="hint"> — 이월정보(잔휴·연속근무)가 없습니다. 전 병동 근무기록이 있으면 입력②에 행을 추가하고 비고에 '전입'이라 적어 붙여넣으세요. 이름 오타라면 입력①·②를 같게 맞춰주세요.</span></div>`;
  }
  if (withHistory.length) {
    html += `<div><b>전입(이력 반영) ${withHistory.length}명</b>: ${withHistory.map(esc).join(", ")}`
         +  `<span class="hint"> — 붙여넣은 전 병동 기록으로 이월정보·야간 형평성을 계산합니다. 부서 누적 실적은 이번 달부터 0에서 시작합니다.</span></div>`;
  }
  if (outgoing.length) {
    html += `<div><b>전출 ${outgoing.length}명</b> (입력②에만 있음): ${outgoing.map(esc).join(", ")}`
         +  `<span class="hint"> — 이번 달 배정에서 빠지고, 누적 이력은 연간근무표에 보존됩니다.</span></div>`;
  }
  box.style.display = "";
  box.className = "roster-diff";
  box.innerHTML = html;
}

// 업로드 결과 메시지는 세 단계다 — 섞어 보여주면 파트장은 "지금 뭘 해야 하지"에 답을
// 얻지 못한다. 고쳐야 하는지, 봐두기만 하면 되는지가 안 보이기 때문이다.
//   ✔ 안내(초록) "이해했고, 다음엔 이렇게 써주세요"  → 뜻대로 반영됨. 할 일 없음.
//   ? 확인(노랑) "이건 무슨 의미인가요"             → 못 읽어 그 칸만 빠짐. 고치면 반영.
//   ✕ 오류(빨강) "이게 틀렸어요"                   → 파일을 못 씀(기존 오류 경로).
// 토스트가 아니라 칸 아래에 남긴다 — 토스트는 사라져서 표준 표기를 다시 볼 수 없다.
function renderUploadMessages(statusEl, data) {
  const host = statusEl.parentElement;
  // 다시 올리면 지난번 것이 남아 쌓인다 — 먼저 지운다.
  host.querySelectorAll(".upload-notice, .upload-unclear").forEach(n => n.remove());
  let after = statusEl;
  const add = (cls, mark, text) => {
    const p = document.createElement("p");
    p.className = "hint " + cls;
    p.textContent = mark + " " + text;
    after.insertAdjacentElement("afterend", p);
    after = p;
  };
  if (data.unclear) add("upload-unclear", "\u26A0", data.unclear);
  if (data.notice) add("upload-notice", "\u2714", data.notice);
}

$("#monthInput").onchange = async () => {
  const el = $("#monthInput");
  const f = el.files[0];
  // 같은 파일을 고쳐서 다시 올리는 일이 잦다 — 값을 비워두지 않으면 onchange가
  // 안 걸려 "올렸는데 아무 일도 안 일어난다"가 된다.
  el.value = "";
  if (f) await applyUploadedMonth(f);
};

$("#wantedInput").onchange = async () => {
  const f = $("#wantedInput").files[0];
  if (!f) return;
  const statusEl = $("#wantedStatus");
  try {
    const data = await apiUpload("/api/upload_wanted", f);
    // 만드는 달은 **화면 연월**이다(사용자 결정, 2026-10-29). 파일 제목의 연월은 참고일 뿐이고,
    // 다르면 화면이 그 사실을 또렷이 알리고 파일의 신청은 날짜(일)만 보고 화면 달에 적용한다.
    // 예전엔 반대로 화면을 파일에 맞췄는데, 파일 제목이 지난달 것인 채로 복붙한 원티드표가
    // 올라오면 화면 연월이 소리 없이 지난달로 돌아가 한 달 어긋난 근무표가 나올 수 있었다.
    wantedRequestsRaw = data.requests.map(r => ({ ...r, priority: 1 }));  // 이전 신청 목록을 통째로 대체
    // 이 파일에 인원 정보(직급·숙련도·가능근무·비고)가 있으면 항상 우선해서 덮어쓴다 —
    // 입력①은 '이번 달 명단(미래)'이라 명단의 최종 기준이다(병동인력표·연간근무표보다 항상 우선).
    // 전입·전입일은 입력①에서만 받을 수도 있다(입력②가 OCS 지난달 근무표면 그 파일에
    // 전입 칸이 아예 없다). 생성할 때 서버로 같이 넘긴다.
    wantedTransferredIn = data.transferred_in || [];
    wantedTransferInDatesRaw = data.transfer_in_dates || {};
    wantedYM = { year: data.year, month: data.month };
    rebaseWantedToScreen();
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
    wantedActiveTag = `${data.year}년 ${data.month}월`;
    renderSourceBadges();
    $("#wantedClearBtn").style.display = "";
    // 관대하게 읽어준 값이 있으면 무엇을 무엇으로 읽었는지 칸 아래에 남긴다. 토스트는
    // 몇 초 뒤 사라져서, 표준 표기를 확인하려고 다시 볼 수가 없다.
    renderUploadMessages(statusEl, data);
    showToast(data.warning ||
      `원티드 ${formRequests.length}건${staffUpdated ? `, 인원 ${data.staff.length}명` : ""}` +
      `${teamB.length ? `, B팀 ${teamB.length}명` : ""}을 자동으로 채웠습니다`,
      !!data.warning);
  } catch (e) {
    // 업로드가 반려돼도(값은 그대로) 화면엔 오류 문구가 계속 남으므로, 지울 방법이
    // 있어야 한다 — 반영 해제 버튼을 오류 지우기 용도로 그대로 재사용한다.
    // 반려됐다는 사실만 알려주면 "그럼 지금 뭐가 쓰이지?"에 답이 없다. 직전에 성공한
    // 입력①이 살아 있으면 그걸 함께 적어준다.
    showUploadError(statusEl, e);
    const active = wantedActiveSummary();
    if (active) statusEl.textContent += "\n" + active;
    $("#wantedClearBtn").style.display = "";
  } finally { $("#wantedInput").value = ""; }
};

// 지금 실제로 쓰이고 있는 입력① 값을 한 줄로. 빈 문자열이면 활성 입력이 없다는 뜻.
function wantedActiveSummary() {
  const parts = [];
  if (staffOfWanted.length) parts.push(`인원 ${staffOfWanted.length}명`);
  if (formRequests.length) parts.push(`신청 ${formRequests.length}건`);
  if (!parts.length) return "";
  return `이전에 올린 입력①${wantedActiveTag ? ` (${wantedActiveTag})` : ""}을 계속 쓰는 중 — ` +
         `${parts.join(", ")}. 이 값으로 근무표가 만들어집니다.`;
}

$("#wantedClearBtn").onclick = () => {
  const statusEl = $("#wantedStatus");
  if (statusEl.classList.contains("upload-error")) {
    // 오류 문구만 지운다. 여기서 화면을 텅 비우면 "새 파일도 실패했고 반영도 해제했다"고
    // 읽히는데 실제로는 직전에 성공한 파일이 그대로 살아 있다 — 사용자가 지웠다고 믿는
    // 명단·신청으로 근무표가 만들어진다. 그래서 남아 있는 값을 반드시 적어 보여준다.
    clearUploadError(statusEl);
    const active = wantedActiveSummary();
    statusEl.textContent = active;
    $("#wantedClearBtn").style.display = active ? "" : "none";
    return;
  }
  // 신청만 지우고 끝내면, 입력①이 채운 '명단'은 그대로 남아 해제했다고 생각한 명단으로
  // 계속 근무표가 만들어진다 — 신청·명단·B팀을 함께 되돌리고, 입력②(없으면 병동인력표)이
  // 준 명단으로 복원한다.
  formRequests = [];
  wantedRequestsRaw = [];
  wantedDropped = [];
  staffOfWanted = [];
  wantedActiveTag = "";
  wantedYM = null;
  wantedTransferredIn = [];
  wantedTransferInDates = {};
  wantedTransferInDatesRaw = {};
  recomputeStaff();
  $("#f_team_b").value = "";
  updateTeamBCount();
  statusEl.textContent = formStaff.length
    ? `반영 해제했습니다 — 명단은 ${staffOfAnnual.length ? "입력②" : "샘플"}(${formStaff.length}명) 기준으로 돌아갔습니다.`
    : "반영 해제했습니다 — 현재 인원 명단이 없습니다.";
  $("#wantedClearBtn").style.display = "none";
  renderSourceBadges();
  showToast("입력① 반영을 해제했습니다");
};

async function refreshStaffTableStatus() {
  let s;
  try { s = await api("/api/staff_table_status"); } catch (e) { return; }
  const banner = $("#staffTableActive");
  const clearBtn = $("#staffTableClearBtn");
  // 예전엔 여기에 "⚠ 연간근무표 반영 중 — N명, YYYY-MM-DD까지…"를 띄웠다. 그런데 바로
  // 아래 '반영 해제' 옆 줄이 같은 내용을 더 자세히("명단은 입력①(40명) 기준 유지, 누적
  // 통계·이월정보만 반영 … 전월잔휴 40명분 확인") 보여줘서, 같은 말이 두 번 나왔다.
  // 노란 글씨가 두 줄 겹치면 정작 읽어야 할 쪽(못 읽은 값 안내)이 묻힌다.
  //
  // 반영 상태를 잊는 사고는 이 배너 없이도 막힌다 — 파일을 다시 읽어들이는 것은 워커
  // 메모리라 새로고침하면 사라지고(그때는 배너도 어차피 안 떴다), 반영 중일 때는 '반영
  // 해제' 버튼이 계속 보여서 그 자체가 상태 표시가 된다.
  banner.style.display = "none";
  clearBtn.style.display = s.loaded ? "" : "none";
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
    // 입력②가 준 명단도 같이 걷어낸다 — 안 그러면 해제한 파일의 명단이 그대로 남아
    // 병동인력표까지 해제해도 인원이 사라지지 않는다.
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
    const data = await apiUpload("/api/upload_staff_table", f);
    // 입력②는 '지난달 실적(과거)'이다. 입력①(이번 달 명단, 미래)가 이미 명단을 채웠다면
    // 절대 덮어쓰지 않는다 — 덮어쓰면 이번 달 전입자가 조용히 사라진다. 이 경우 여기서
    // 읽은 명단은 전입·전출 대조용으로만 쓴다. 입력①이 아직 없을 때만 출발점으로 채운다.
    // 연간근무표가 아니라 OCS 지난달 근무표로 들어오면 직급·숙련도가 없어 명단으로는
    // 쓸 수 없다(반쪽짜리 명단이 화면을 덮으면 안 된다). 이름만 전출 대조에 쓴다.
    const fromPrevMonth = data.source === "prev_month";
    prevRosterNames = data.roster_names || (data.staff || []).map(s => s.id);
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
    const kept = fromPrevMonth
      ? `지난달 근무표(${prevRosterNames.length}명)로 이월정보만 반영 — 누적 통계는 이번 달부터 0에서 시작합니다`
      : (staffFromWanted
          ? `명단은 입력①(${formStaff.length}명) 기준 유지, 누적 통계·이월정보만 반영`
          : `인원 ${formStaff.length}명, 누적 통계·이월정보 반영`);
    const dep = (data.departed_names || []).length;
    const stranded = (data.rows_after_summary || []);
    // 전월잔휴는 이번 달 오프 배분의 출발점이라, 비어 있으면 0으로 보고 진행하되
    // 반드시 눈에 띄게 알려준다 — 조용히 0이 되면 그 사람만 오프가 밀리는데
    // 근무표만 봐서는 원인을 찾을 수 없다. 막지는 않는다(파트장 판단에 맡김).
    const noBal = (data.off_balance_blank || []);
    // '잔휴'(엔진이 실제로 쓰는 값)와 '전월잔휴'(파트장이 OCS에서 옮겨 적는 칸)는
    // 다른 칸이라 따로 알려야 어느 칸을 채워야 할지 알 수 있다. 그리고 정상일 때도
    // 몇 명분을 읽었는지 한 줄 보여준다 — 아무 말이 없으면 확인이 된 건지 알 수 없다.
    const noPrev = fromPrevMonth ? [] : (data.prev_off_balance_missing || []);
    const prevColMissing = !fromPrevMonth && data.has_prev_off_balance_col === false;
    const prevBalOk = !fromPrevMonth && !prevColMissing && noPrev.length === 0
      ? `전월잔휴 ${(data.staff || []).length}명분 확인` : "";
    // 모르는 근무표기는 빈칸(=OFF)으로 읽힌다 — 조용히 넘어가면 그 사람의 연속근무일수·
    // 야간블록 이월이 틀어진 채로 다음 달이 만들어진다.
    const unknownCodes = data.unknown_grid_marks || [];
    renderUploadMessages(statusEl, data);
    statusEl.textContent =
      `${kept} (연간 근무표 ${data.annual_days}일치 포함)` +
      (teamB.length ? `, B팀 ${teamB.length}명 인식` : "") +
      (transferredInNames.length ? `, 전입(이력) ${transferredInNames.length}명 인식` : "") +
      (dep ? `, 기존 전출자 ${dep}명 이력 보존` : "") +
      (noBal.length
        ? ` — ⚠ 전월잔휴가 비어 있어 0으로 보고 진행합니다: ${noBal.length}명(${noBal.join(", ")}). 실제 잔휴가 있으면 파일의 '잔휴' 칸을 채워 다시 올려주세요.`
        : "") +
      (prevBalOk ? `, ${prevBalOk}` : "") +
      (prevColMissing
        ? " — ⚠ 이 연간근무표에는 '전월잔휴' 열이 없습니다. 전원 0으로 보고 진행하니, 이번 달 출력②를 받아 그 칸을 채워 쓰시면 다음 달부터 이어집니다."
        : (noPrev.length
            ? ` — ⚠ '전월잔휴'가 비어 있는 ${noPrev.length}명(${noPrev.slice(0, 5).join(", ")}${noPrev.length > 5 ? " 외 " + (noPrev.length - 5) + "명" : ""})은 0으로 보고 진행합니다. 실제 값이 있으면 '전월잔휴' 칸에 적어 다시 올려주세요.`
            : "")) +
      (unknownCodes.length
        ? ` — ⚠ 인식 못 한 근무표기 ${unknownCodes.length}건(${unknownCodes.slice(0, 5).join(", ")}${unknownCodes.length > 5 ? " 외 " + (unknownCodes.length - 5) + "건" : ""})은 빈칸으로 읽었습니다. 이월정보(연속근무·야간블록)가 그만큼 달라질 수 있으니 표기를 확인해주세요.`
        : "") +
      (stranded.length
        ? ` — ⚠ 맨 아래 통계 줄 뒤의 행 ${stranded.length}건(${stranded.join(", ")})은 읽지 못했습니다. 사람 행은 통계 줄 위에 넣어주세요.`
        : "");
    if (noBal.length) {
      showToast(`전월잔휴가 비어 있는 인원 ${noBal.length}명은 0으로 보고 진행합니다 — 확인해주세요`, true);
    }
    await refreshStaffTableStatus();
    showToast(fromPrevMonth
      ? "지난달 근무표에서 전월 이월정보를 불러왔습니다 (누적 통계는 이번 달부터 쌓입니다)"
      : (staffFromWanted
          ? "연간근무표에서 누적 통계·전월 이월정보를 불러왔습니다 (명단은 입력① 기준 유지)"
          : "연간근무표에서 인원 명단·누적 통계·전월 이월정보를 불러왔습니다"));
  } catch (e) {
    // 업로드가 반려돼도(값은 그대로) 화면엔 오류 문구가 계속 남으므로, 지울 방법이
    // 있어야 한다 — 반영 해제 버튼을 오류 지우기 용도로 그대로 재사용한다.
    showUploadError(statusEl, e);
    $("#staffTableClearBtn").style.display = "";
  } finally { $("#staffTableInput").value = ""; }
};

// 생성/재생성은 인원이 빠듯한 달에 수십 초까지 걸릴 수 있다. 그동안 화면이 멈춘 것처럼
// 보이지 않도록 안내 오버레이를 띄운다(브라우저판은 Worker 덕분에 화면 자체는 안 멈춘다).
//
// 진행 게이지: 엔진이 진행률을 알려주지 않으므로(생성이 끝나야 응답이 온다) 실제
// 진행률이 아니라 "경과시간 vs 아래 기준 시간"으로 추정해서 보여준다. 대부분의
// 실사용 규모는 기준 시간 안에서 끝나 게이지가 자연스럽게 92%까지 차고, 인원이
// 빠듯해 기준을 넘기는 경우엔 92~98% 사이에서 천천히 계속 채워서 "멈춘 게 아니라
// 아직 계산 중"임을 보여준다(실제 100%는 응답이 와서 오버레이가 닫힐 때뿐).
//
// ⚠ 이 기준 시간은 게이지를 그리려고 두는 값일 뿐 엔진이 멈추는 기준이 아니다.
// 엔진은 '최대 3회 시도'로 멈춘다(generator.py의 generate_best) — 시간으로 멈추면
// 같은 입력이 기기에 따라 다른 근무표를 내기 때문이다. generate_best의 30초도
// 상한이 아니라 병리적 입력용 안전판이라 여기에 맞출 값이 아니다.
//
// 여유로운 달은 1회차에서 끝난다(브라우저 실측 1.2~3초). 그래서 기본값은 짧게 잡는다.
const GEN_TIME_BUDGET_SEC = 8;
// 인력이 빠듯한 달은 '시도 1회' 자체가 훨씬 오래 걸린다. 브라우저에서 직접 잰 값:
// 여유로운 40명은 1.2초인데 빠듯한 36명은 25.7초다(네이티브로는 각각 0.53초/12.8초 —
// Pyodide가 2.0~2.3배 느리다). 게이지 예산을 짧게 두면 금방 92%에 닿은 뒤 한참을
// 기어가서, 사용자는 앱이 멈춘 줄 알고 새로고침한다(그러면 처음부터 다시다).
// 엔진의 안전판이 30초이고 시도 1회가 그보다 길어질 수 있으니 그보다 넉넉히 잡는다.
const GEN_TIME_BUDGET_TIGHT_SEC = 45;
// 진행 바 아래 보조문구의 기본값. index.html에 적힌 것과 같은 문장을 여기에도 두는
// 이유는 markGenOverlaySlow가 이 자리를 갈아끼우기 때문이다 — 되돌릴 원본이 필요하다.
//
// 예전 문구는 "인원이 많은 병동은 더 걸릴 수 있어요"였는데 원인을 거꾸로 말하고 있었다.
// 브라우저 실측으로 여유로운 40명이 1.2초, 빠듯한 36명이 25.7초다 — 느리게 만드는 건
// 인원이 많아서가 아니라 모자라서다(경우의 수를 다 뒤져도 최소인력이 안 채워져 수리
// 로직이 계속 돈다). 틀린 원인을 알려주면 파트장이 엉뚱한 조치를 한다.
const GEN_SUB_DEFAULT = "보통 몇 초면 끝납니다. 창을 닫지 말고 잠시만 기다려주세요.";
const GEN_SUB_TIGHT = "인원이 빠듯한 달은 맞는 배치를 찾기 어려워 오래 걸립니다" +
  "(기기에 따라 10~40초). 새로고침하면 처음부터 다시 하니 그대로 기다려주세요.";
let genProgressTimer = null;
let genProgressT0 = 0;
let genProgressBudget = GEN_TIME_BUDGET_SEC;

// ---------------------------------------------------------------- 꼼꼼히 만들기 (시도 9회)
// 같은 규칙으로 3회 대신 9회 만들어 점수표로 고른다. 기준선 201개 달 실측(docs/report_v0.86/bench/
// baseline_seeds12_261030.json): 12회 중 최선이 3회 중 최선보다 154개 달에서 좋았고, 그 개선의 대부분이
// 6~9회째에서 나와 9로 정했다(12회는 83→82로 거의 평평한데 시간은 1/3 더). 기본 3회는 그대로다 —
// 시간이 3배라 매번 켜 두면 폰에서 몇 분이 걸린다. 체크 상태는 저장하지 않는다(새로 열면 꺼짐).
// 시도 수는 platform.js가 body의 attempts로 읽어 시드 큐로 돌리고, 시도 하나가 끝날 때마다 onProgress로
// 알려 준다. 재생성·편집 적용도 같은 옵션을 쓴다 — 켜 둔 사람은 그 표를 다시 짤 때도 꼼꼼히를 원한다.
const THOROUGH_ATTEMPTS = 9;
// 점수표의 시드 옆 전략 글자 설명 — 정의는 엔진(generator.py _STRATEGY_MIX)에 있고 여기는 사람 말로만.
const STRATEGY_HELP = {
  W: "주말 몫 우선 — 주말·공휴일 칸을 채울 때 주말 근무가 적은 사람을 블록 이어가기보다 먼저",
  S: "고연차 먼저 — 주간 칸을 채울 때 그 조에 숙련도 4 이상이 없으면 고연차를 숙련도·주말·형평성보다 먼저",
  SW: "고연차 먼저 + 주말 몫 우선",
  SB: "고연차 먼저 + 블록 이어가기 먼저(1~2일째 주간 블록을 모든 날에서 먼저 이어 짧은 블록을 줄임)",
  BW: "블록 이어가기 먼저 + 주말 몫 우선",
  B: "블록 이어가기 먼저 — 1~2일째 주간 블록을 모든 날에서 먼저 이어 짧은 블록을 줄임",
};
const GEN_SUB_THOROUGH = `평소에는 근무표 3개를 만들어 고르는데, 지금은 ${THOROUGH_ATTEMPTS}개를 만들어 고릅니다. ` +
  "일반 생성(40명대 약 10초) 대비 약 2~3배인 20~30초가 걸리고, 인원이 빠듯한 달은 몇 분이 걸릴 수 있습니다. 창을 닫지 말고 기다려주세요.";
let genDriven = null;   // 꼼꼼히 만들기 진척 {done,total,at,avg} — 게이지를 시간 추정 대신 시도 수로 그린다
let genThorough = false;
function thoroughOn() { const c = $("#thoroughChk"); return !!(c && c.checked); }
function genOpts() {
  if (!thoroughOn()) return { method: "POST" };
  return { method: "POST", body: JSON.stringify({ attempts: THOROUGH_ATTEMPTS }), onProgress: onGenProgress };
}
// attempt_key와 같은 순서(운영 필수 → 숙련도 → 공평성 → 전체 → 앞 시드, 2026-10-30). 화면 표시(지금까지 최선·점수표
// 접기)에만 쓴다 — 최종 선택은 엔진(choose_attempt) 한 벌이다.
function attemptBetter(a, b) {
  const key = x => [x.blocking, x.h15, Math.round((x.fairness || 0) * 100), x.hard, x.seed];
  const ka = key(a), kb = key(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i];
  return false;
}
function fmtSec(s) {
  s = Math.max(1, Math.round(s));
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`;
}
function onGenProgress(p) {
  const step = $("#genOverlayStep");
  if (!step) return;
  genDriven = { done: p.done, total: p.total, at: Date.now(), avg: p.done ? p.elapsed / p.done : null };
  const best = p.stats.length ? p.stats.reduce((a, b) => (attemptBetter(b, a) ? b : a)) : null;
  let txt = `근무표 ${p.done}/${p.total}개`;
  if (p.workers > 1) txt += ` (${p.workers}개 동시)`;
  if (!p.done) txt += " — 첫 근무표 만드는 중…";
  if (best) txt += ` · 지금까지 최선: 운영 필수 ${best.blocking} · 숙련도 ${best.h15} · 전체 ${best.hard}`;
  if (p.stopping) txt += " · 돌고 있는 시도가 끝나면 멈춥니다";
  else if (p.done && p.done < p.total) txt += ` · 약 ${fmtSec((p.total - p.done) * (p.elapsed / p.done))} 남음`;
  step.textContent = txt;
}
$("#genStopBtn").onclick = () => {
  const btn = $("#genStopBtn");
  if (requestGenStop()) { btn.disabled = true; btn.textContent = "돌고 있는 시도가 끝나면 멈춥니다…"; }
};

// ---------------------------------------------------------------- 생성 중 비 (오버레이 애니메이션)
// 보고서 11장 '비'의 축소판 — 근무 글자가 위에서 떨어져 제자리에 앉는다. 어느 칸이 앉았는지는 진행
// 게이지(#genProgressFill)의 비율을 그대로 따른다: 게이지가 40%면 칸의 40%가 앉아 있다. 실제 엔진의
// 칸 배치 순서를 받는 게 아니라(Worker가 돌고 있는 동안은 알 수 없다) 날짜 순서로 앉히는 연출이다.
// 명단 수·달의 날수는 입력 화면 값을 쓴다. 깜빡임을 끈 사람(prefers-reduced-motion)에게는 비 없이
// 앉은 칸만 그린다. 캔버스는 이 파일(화면 로직)에서만 그리고 Worker·전송과는 무관하다.
let genRainRAF = null, genRainTimer = null;
const RAIN_COL = { D: "#BDD7EE", E: "#F8CBAD", N: "#3B5BA5", "/": "rgba(255,255,255,.28)" };
function rainRnd(i) { const x = Math.sin(i * 9301 + 49297) * 233280; return x - Math.floor(x); }
function startGenRain() {
  const cv = $("#genRain");
  if (!cv) return;
  stopGenRain();
  const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  // 명단이 길면 앞 14명만 — 40명을 160px에 넣으면 글자가 점이 된다(연출이지 표가 아니다)
  const nS = Math.min(14, Math.max(6, (typeof formStaff !== "undefined" && formStaff.length) || 14));
  const y = Number($("#f_year")?.value), m = Number($("#f_month")?.value);
  const nD = (y && m) ? new Date(y, m, 0).getDate() : 30;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = cv.clientWidth || 300, h = cv.clientHeight || 118;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const x = cv.getContext("2d");
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = 6, cs = Math.min((w - pad * 2) / nD, (h - pad * 2) / nS), ox = (w - cs * nD) / 2, oy = (h - cs * nS) / 2;
  // 칸마다 글자(D·E·N·OFF 비율 3:3:1.5:2.5)와 앉는 순서(날짜 순, 같은 날 안에서는 섞어서)
  const letter = (i, d) => { const r = rainRnd(i * 31 + d); return r < .3 ? "D" : r < .6 ? "E" : r < .75 ? "N" : "/"; };
  const order = [];
  for (let d = 0; d < nD; d++) {
    const rows = Array.from({ length: nS }, (_, i) => i).sort((a, b) => rainRnd(a * 7 + d) - rainRnd(b * 7 + d));
    for (const i of rows) order.push(i * nD + d);
  }
  const born = new Map();
  let settled = 0;
  const chars = "DEN/";
  const draw = (now) => {
    const pct = parseFloat(($("#genProgressFill") || {}).style?.width || "0") || 0;
    const target = Math.min(order.length, Math.floor(order.length * pct / 100));
    while (settled < target) { born.set(order[settled], now); settled++; }
    x.fillStyle = reduce ? "#0b0f19" : "rgba(11,15,25,.45)";
    x.fillRect(0, 0, w, h);
    x.font = `700 ${Math.max(5, cs * .78)}px ui-monospace, Menlo, monospace`;
    x.textAlign = "center"; x.textBaseline = "middle";
    if (!reduce) {
      for (let d = 0; d < nD; d++) {
        const speed = 55 + 45 * rainRnd(d), head = ((now / 1000) * speed + rainRnd(d + 50) * 400) % (h + 160) - 80;
        for (let k = 0; k < 7; k++) {
          const yy = oy + head - k * cs;
          if (yy < oy || yy > oy + cs * nS) continue;
          const i = Math.floor((yy - oy) / cs);
          if (born.has(i * nD + d)) continue;
          x.fillStyle = `rgba(74,222,128,${k ? .2 - k * .02 : .55})`;
          x.fillText(chars[Math.floor(rainRnd(d * 31 + k + Math.floor(now / 90)) * 4)], ox + d * cs + cs / 2, yy + cs / 2);
        }
      }
    }
    for (const [key, t0] of born) {
      const i = Math.floor(key / nD), d = key % nD, v = letter(i, d);
      const a = reduce ? 1 : Math.min(1, (now - t0) / 450), e = 1 - Math.pow(1 - a, 3);
      const yy = oy + i * cs + cs / 2 - (1 - e) * cs * 1.5;
      x.fillStyle = a < 1 ? "#fff" : RAIN_COL[v];
      x.globalAlpha = v === "/" ? .5 : 1;
      x.fillText(v, ox + d * cs + cs / 2, yy);
      x.globalAlpha = 1;
    }
  };
  if (reduce) { draw(performance.now()); genRainTimer = setInterval(() => draw(performance.now()), 500); return; }
  const frame = (now) => { draw(now); genRainRAF = requestAnimationFrame(frame); };
  genRainRAF = requestAnimationFrame(frame);
}
function stopGenRain() {
  if (genRainRAF) cancelAnimationFrame(genRainRAF);
  if (genRainTimer) clearInterval(genRainTimer);
  genRainRAF = genRainTimer = null;
}

// thorough: 생성·재생성·편집 적용에서 꼼꼼히 만들기가 켜져 있을 때 — 진척 줄과 멈추기 단추를 보인다.
// 다른 오버레이(시드 바꾸기·보고서)는 넘기지 않으므로 숨긴다.
function showGenOverlay(msg, thorough, rain) {
  $("#genOverlayMsg").textContent = msg;
  const rc = $("#genRain");
  if (rc) rc.style.display = rain ? "" : "none";
  const sub = $("#genOverlaySub");
  if (sub) sub.textContent = thorough ? GEN_SUB_THOROUGH : GEN_SUB_DEFAULT;   // 지난번 '느림' 문구가 남아있지 않게
  genThorough = !!thorough;
  genDriven = null;
  const step = $("#genOverlayStep"), stopBtn = $("#genStopBtn");
  if (step) { step.style.display = thorough ? "" : "none"; step.textContent = thorough ? `근무표 0/${THOROUGH_ATTEMPTS}개 — 준비 중…` : ""; }
  if (stopBtn) { stopBtn.style.display = thorough ? "" : "none"; stopBtn.disabled = false; stopBtn.textContent = "여기까지 결과로 멈추기"; }
  $("#genOverlay").style.display = "";
  const fill = $("#genProgressFill");
  fill.style.width = "0%";
  if (rain) startGenRain();
  genProgressT0 = Date.now();
  genProgressBudget = GEN_TIME_BUDGET_SEC;
  clearInterval(genProgressTimer);
  genProgressTimer = setInterval(() => {
    const elapsed = (Date.now() - genProgressT0) / 1000;
    const budget = genProgressBudget;
    let pct;
    if (genDriven && genDriven.total) {
      // 시도 수로 그린다. 끝난 시도 사이는 지난 시도의 평균 시간만큼 천천히 채운다(멈춘 게 아니라는 표시).
      const since = (Date.now() - genDriven.at) / 1000;
      const partial = genDriven.done < genDriven.total ? Math.min(0.9, since / (genDriven.avg || budget)) : 0;
      pct = Math.min(98, ((genDriven.done + partial) / genDriven.total) * 98);
    } else {
      pct = elapsed <= budget
        ? (elapsed / budget) * 92
        : 92 + Math.min(6, (elapsed - budget) * 0.5);
    }
    fill.style.width = pct.toFixed(1) + "%";
  }, 200);
}
// 생성이 이미 시작된 뒤(set_config 응답을 받은 뒤)에야 인력난인지 알 수 있으므로,
// 그때 문구와 게이지 예산을 갈아끼운다. 경과시간(genProgressT0)은 일부러 건드리지
// 않는다 — 다시 0부터 채우면 앞서 지난 시간이 없던 일이 돼 더 느려 보인다.
function markGenOverlaySlow(msg) {
  const el = $("#genOverlayMsg");
  if (el) el.textContent = msg;
  const sub = $("#genOverlaySub");
  if (sub) sub.textContent = genThorough ? GEN_SUB_THOROUGH + " 인원이 빠듯해 더 오래 걸립니다." : GEN_SUB_TIGHT;
  genProgressBudget = GEN_TIME_BUDGET_TIGHT_SEC;
}
function hideGenOverlay() {
  $("#genOverlay").style.display = "none";
  stopGenRain();
  clearInterval(genProgressTimer);
  genProgressTimer = null;
}

// 입력①② 중 하나라도 업로드가 반려된 채(빨간 오류 문구가 아직 안 지워진 채)
// 남아있으면, 그 파일은 반영되지 않았다는 뜻이다 — 이 상태에서 그냥 생성하면
// 사용자가 방금 올린 값이 반영됐다고 착각한 채 옛 값으로 근무표가 만들어질 수
// 있으므로, 생성 자체를 막고 어느 입력에 문제가 남아있는지 알려준다.
function unresolvedUploadErrors() {
  return [["#wantedStatus", "입력①"], ["#staffTableStatus", "입력②"]]
    .filter(([sel]) => $(sel)?.classList.contains("upload-error"))
    .map(([, label]) => label);
}

// ✕ 오류(빨강) — 생성이 반려된 이유. 예전엔 토스트로만 띄웠는데 몇 초 뒤 사라져서,
// 그 순간 화면을 안 보고 있으면 "눌렀는데 아무 일도 안 일어났다"로 보였다. 무엇을
// 고쳐야 하는지가 적힌 줄이라 남아 있어야 한다(업로드의 초록·노랑과 같은 취급).
function clearGenError(statusEl) {
  if (!statusEl || !statusEl.parentElement) return;
  statusEl.parentElement.querySelectorAll(".gen-error").forEach(n => n.remove());
}
function showGenError(statusEl, text) {
  if (!statusEl || !statusEl.parentElement || !text) return;
  clearGenError(statusEl);
  const p = document.createElement("p");
  p.className = "hint gen-error";
  p.textContent = "\u2716 " + text;
  statusEl.insertAdjacentElement("afterend", p);
}

async function runGenerate(btn, statusEl) {
  clearGenError(statusEl);
  const unresolved = unresolvedUploadErrors();
  if (unresolved.length) {
    const msg = `${unresolved.join(", ")}에 아직 해결되지 않은 업로드 오류가 있습니다 — 오류 문구를 ` +
      `지우거나(반영 해제) 파일을 고쳐 다시 올린 뒤 생성하세요`;
    showToast(msg, true);
    showGenError(statusEl, msg);
    return;
  }
  // 최소인력 칸을 먼저 읽어본다 — 못 읽는 칸이 있으면 생성하지 않는다. 대충 0으로 채워
  // 만들면 "그 근무가 아무도 없어도 되는 달"이 조용히 만들어진다.
  const preCfg = buildCfgFromForm();
  if (minStaffErrors.length) {
    const msg = `근무인력·설정 칸을 확인해주세요 — ${minStaffErrors.join(" / ")}`;
    // 칸이 많이 비어 있으면(설정을 지운 직후 19칸) 토스트가 화면 반을 덮고 생성 버튼까지
    // 가린다 — 토스트는 몇 칸인지만, 어느 칸인지는 아래 빨간 안내에 그대로 둔다.
    showToast(minStaffErrors.length > 3
      ? `근무인력·설정 칸 ${minStaffErrors.length}개가 비어 있거나 잘못됐습니다 — 생성 버튼 아래 빨간 안내에서 어느 칸인지 확인해주세요`
      : msg, true);
    showGenError(statusEl, msg);
    return;
  }
  const btns = [$("#generateBtn"), $("#generateBtnMid")].filter(Boolean);
  btns.forEach(b => b.disabled = true);
  if (statusEl) statusEl.textContent = "생성 중...";
  showGenOverlay("근무표를 생성하는 중입니다…", thoroughOn(), true);
  try {
    const cfg = preCfg;
    const cfgResult = await api("/api/set_config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    lastConfigWarning = cfgResult.warning || null;
    lastStaffing = cfgResult.staffing || null;
    if (lastStaffing && lastStaffing.level && lastStaffing.level !== "ok") {
      markGenOverlaySlow("인원이 빠듯해 평소보다 오래 걸립니다 — 계산 중입니다…");
    }
    if (lastStaffing && lastStaffing.designated && lastStaffing.designated.message) {
      showToast(lastStaffing.designated.message, true);
    }
    ST = await api("/api/generate", genOpts());
    SWAP = null;
    render();
    showToast(lastConfigWarning || "근무표 생성 완료", !!lastConfigWarning);
    refreshFragile();
  } catch (e) {
    if (statusEl) statusEl.textContent = "";
    showGenError(statusEl, (e && e.message) ? e.message : String(e));
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

// 페이지 로드 시: 판별 준비(브라우저판은 Pyodide 부팅) → 샘플 데이터로 폼 기본 채움
(async function boot() {
  if (!(await bootPlatform())) return;   // 실패 사유는 platform.js가 화면에 띄운다
  try {
    const cfg = await api("/api/sample");
    // 샘플 기본값 위에 이 브라우저에 저장해둔 설정을 덮어쓴다 — 병동인력표 파일(옛 입력①)이 없어진
    // 뒤로는 이게 "지난번에 맞춰둔 값"을 되찾는 유일한 길이다.
    // 저장을 꺼둔 상태면 남아 있는 값이 있어도 쓰지 않는다(끈 사람에게 옛 값이
    // 되살아나면 안 된다).
    const useSaved = restoreSaveToggle() && !!loadSettings();
    fillForm(useSaved ? withSavedSettings(cfg) : cfg);
    settingsSource = useSaved ? "saved" : "sample";
  } catch (e) {
    showToast("샘플 로드 실패 — 직접 입력해주세요", true);
  }
  settingsReady = true;
  renderSourceBadges();
  refreshStaffTableStatus();
})();


// ================================================================ 설정 브라우저 저장
// 병동인력표 엑셀(옛 입력①)을 없애면서, 설정·근무인력을 매달 손으로 다시 채우는 일이
// 없도록 이 브라우저에 저장한다. 저장하는 것은 '달이 바뀌어도 그대로인 것'뿐이다 —
// 병동명·연월·상한값·근무인력 표. 사람 명단·원티드 신청·전입 같은 '그 달의 내용'은
// 절대 저장하지 않는다. 지난달 것이 남아 있으면 오류 하나 없이 틀린 근무표가 나온다.
// 저장을 켤지 끌지는 '마지막 설정값 저장' 버튼이 정한다. 기본은 켜짐이지만, 공용 PC처럼
// 남기면 안 되는 자리도 있어서 끌 수 있어야 한다. 스위치 상태 자체도 같이 기억한다 —
// 껐는데 다음에 열면 다시 켜져 있으면 끈 의미가 없다.
const SETTINGS_KEY = "ns_settings_v1";
const SETTINGS_ON_KEY = "ns_settings_on";

// 브라우저 저장소는 사내 정책·시크릿 모드에서 아예 막힐 수 있다(SecurityError). 저장이
// 안 되는 것보다 나쁜 건 "왜 안 되는지 모르는 것"이라, 실패해도 앱은 계속 돌리되 한
// 번은 알려준다. (예전엔 여기서 pyodide 판에만 있는 함수를 불러서, 저장소가 막힌 바로
// 그 순간에 옛 Flask 판이 ReferenceError로 넘어졌다 — 하필 알려야 할 때 말이 없었다.)
let settingsStorageWarned = false;
function settingsStorageFailed(e, what) {
  console.warn("localStorage", what, e);
  if (settingsStorageWarned) return;
  settingsStorageWarned = true;
  showToast("이 브라우저에서는 저장소를 쓸 수 없어 설정이 저장되지 않습니다"
    + "(사내 정책·시크릿 모드 등) — 근무표 생성·다운로드는 그대로 됩니다.", true);
}

// 켜짐/꺼짐은 버튼의 aria-pressed가 유일한 출처다 — 화면에 보이는 눌린 모양과 실제
// 동작이 갈라지지 않게, 별도 변수를 두지 않고 이 값만 읽고 쓴다.
function settingsSaveEnabled() {
  const btn = $("#saveSettingsBtn");
  return btn ? btn.getAttribute("aria-pressed") === "true" : true;
}

function saveSettings() {
  if (!settingsReady) return;   // 화면을 채우는 중에 반쪽짜리 값이 저장되는 것을 막는다
  if (!settingsSaveEnabled()) return;
  try {
    const cfg = buildCfgFromForm();
    // 못 읽는 칸이 있는 상태를 저장하면, 다음에 앱을 열었을 때 그 잘못된 값이 되살아난다.
    if (minStaffErrors.length) return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      ward_id: cfg.ward_id, year: cfg.year, month: cfg.month,
      params: {
        min_staff: cfg.params.min_staff,
        off_max_per_month: cfg.params.off_max_per_month,
        max_consecutive_work: cfg.params.max_consecutive_work,
        night_quota_low: cfg.params.night_quota_low,
        night_quota_high: cfg.params.night_quota_high,
      },
    }));
  } catch (e) { settingsStorageFailed(e, "write"); }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { settingsStorageFailed(e, "read"); return null; }
}

// 저장된 설정을 샘플 cfg 위에 덮어쓴다 — 저장된 적 없는 항목(인원 명단 등)은 샘플
// 값이 그대로 남는다. 저장본이 깨졌거나 없으면 샘플만 쓰고 조용히 넘어간다.
function withSavedSettings(cfg) {
  const saved = loadSettings();
  if (!saved) return cfg;
  const out = { ...cfg, params: { ...(cfg.params || {}) } };
  if (saved.ward_id !== undefined) out.ward_id = saved.ward_id;
  // 연월은 일부러 되살리지 않는다 — 아래 nextMonth()가 항상 다음 달로 잡는다.
  // 만드는 것은 늘 다음 달 근무표인데 지난달 값이 되살아나면, 화면 연월을 안 보고
  // 그대로 만들었다가 한 달 어긋난 근무표가 나온다.
  for (const k of ["min_staff", "off_max_per_month", "max_consecutive_work",
                   "night_quota_low", "night_quota_high"]) {
    if (saved.params && saved.params[k] !== undefined) out.params[k] = saved.params[k];
  }
  return out;
}

let settingsReady = false;
// 설정·근무인력 칸은 개수가 많고 표는 다시 그려지기까지 한다 — 칸마다 핸들러를 다는
// 대신 감싸는 영역 하나에서 이벤트를 받는다(표를 다시 그려도 계속 동작).
document.querySelector(".info-section")?.addEventListener("input", saveSettings);
document.querySelector(".info-section")?.addEventListener("change", saveSettings);

// 스위치를 켜면 지금 화면 값을 바로 한 번 저장한다 — 켠 뒤에 아무 칸도 안 건드리면
// 저장이 안 된 채로 "켜져 있는데 왜 기억을 못 하지"가 되기 때문. 끄면 이미 저장된
// 값까지 지운다(끄는 사람은 '남기지 마라'는 뜻이지 '이제부터만'이 아니다).
$("#saveSettingsBtn").onclick = () => {
  const on = !settingsSaveEnabled();
  $("#saveSettingsBtn").setAttribute("aria-pressed", on ? "true" : "false");
  try { localStorage.setItem(SETTINGS_ON_KEY, on ? "1" : "0"); }
  catch (e) { settingsStorageFailed(e, "toggle"); }
  if (on) {
    saveSettings();
    showToast("마지막 설정값 저장을 켰습니다 — 다음에 열면 지금 값이 그대로 채워집니다");
  } else {
    try { localStorage.removeItem(SETTINGS_KEY); }
    catch (e) { settingsStorageFailed(e, "clear"); }
    showToast("마지막 설정값 저장을 껐습니다 — 저장돼 있던 값도 지웠습니다");
  }
};

// 저장해둔 스위치 상태를 화면에 되살린다(폼을 채우기 전에 불러야 저장 여부가 정해진다).
function restoreSaveToggle() {
  let on = true;
  try { on = localStorage.getItem(SETTINGS_ON_KEY) !== "0"; }
  catch (e) { settingsStorageFailed(e, "read"); }
  const btn = $("#saveSettingsBtn");
  if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false");
  return on;
}

// 지우기는 '샘플 값으로 되돌리기'가 아니라 말 그대로 '비우기'다. 샘플 숫자를 다시
// 채워 넣으면 그게 우리 병동 값인 줄 알고 그대로 만들 수 있다 — 지운 뒤에는 빈 칸이
// 보여야 무엇을 채워야 하는지 알 수 있다. 병동명처럼 회색 자리표시(0)만 남긴다.
// 묻지 않고 바로 지운다 — 되돌릴 대상이 '내가 방금 적은 값'뿐이고, 다시 채우는 데
// 몇 초면 되는 화면이라 확인창이 매번 걸리는 쪽이 더 성가시다.
$("#resetSettingsBtn").onclick = () => {
  try { localStorage.removeItem(SETTINGS_KEY); } catch (e) { settingsStorageFailed(e, "clear"); }
  settingsReady = false;
  $("#f_ward").value = "";
  for (const el of document.querySelectorAll('.info-section input[type="number"]')) el.value = "";
  const nm = nextMonth();
  $("#f_year").value = nm.year;
  $("#f_month").value = nm.month;
  seedHolidaysForYear(nm.year);
  renderHolidayCalendar();
  settingsReady = true;
  settingsSource = "empty";
  renderSourceBadges();
  showToast("저장한 설정을 지웠습니다 — 우리 병동 값으로 채워 넣어주세요");
};

// ================================================================ 그리드 렌더 (생성 후)

function shiftClass(v) { return SHIFT_CLASS[v] || ""; }
// OFF는 "·" 대신 원티드오프="X" / 일반오프="/"로 표시(병원 표준 표기) — 셀의 실제 값(v)은
// 편집·순환·드롭다운이 기준으로 쓰는 "OFF" 그대로 유지되고, 화면 표시 글자만 바뀐다.
function shiftText(v, isWanted) {
  if (v === "OFF") return isWanted ? "X" : "/";
  return SHIFT_TEXT[v] !== undefined ? SHIFT_TEXT[v] : v;
}

// 미적용 편집이 없던 마지막 순간의 하단 통계 값 — "이 숫자는 내가 고쳐서 달라진 것"을
// 가려내는 기준. 서버 응답에는 편집이 반영된 값만 오므로 화면이 직접 기억한다.
let BASE_FOOT = null;

// 표를 다시 그리면 .grid-scroll이 통째로 새 요소로 바뀌므로 가로 스크롤이 1일로,
// 페이지 스크롤도 맨 위로 되돌아간다. 생성 직후엔 그게 맞지만(결과를 처음 보는 순간),
// 칸 하나 고쳤을 때는 파트장이 보던 자리를 잃는다 — 모바일은 한 화면에 며칠치만
// 보여서 "20일을 고쳤는데 표가 1일로 튀는" 것으로 보인다. 그래서 편집 경로에서는
// 다시 그리기 전 위치를 재어 두었다가 그대로 돌려놓는다.
function captureScroll() {
  const inner = gridContent.querySelector(".grid-scroll");
  return {
    y: window.scrollY || window.pageYOffset || 0,
    paneTop: gridPane.scrollTop, paneLeft: gridPane.scrollLeft,
    innerTop: inner ? inner.scrollTop : 0, innerLeft: inner ? inner.scrollLeft : 0,
  };
}

function restoreScroll(pos) {
  const inner = gridContent.querySelector(".grid-scroll");
  if (inner) { inner.scrollTop = pos.innerTop; inner.scrollLeft = pos.innerLeft; }
  gridPane.scrollTop = pos.paneTop;
  gridPane.scrollLeft = pos.paneLeft;
  window.scrollTo(0, pos.y);
}

// ---------------------------------------------------------------- 수정 보조 (D-1·D-2)
// 지도는 "채택된 표" 기준이라 미적용 편집이 있는 동안은 그 칸의 표시가 낡을 수 있다 —
// 적용하면 표가 새로 만들어지고 지도도 새로 받는다.
async function refreshFragile() {
  if (!ST) return;
  const round = ST.round;
  FRAGILE = { round, loading: true, done: false, total: 0, cells: {} };
  paintFragile();
  // 사람·반달 단위로 나눠 받는다 — 한 번에 받으면 Worker가 수 초 동안 막혀 그 사이 누른
  // 칸 편집이 기다린다. 조각마다 빗금을 바로 얹어 진행이 보이게 한다.
  const half = Math.ceil(ST.num_days / 2);
  try {
    for (const s of ST.staff) {
      for (const [d0, d1] of [[0, half], [half, ST.num_days]]) {
        const part = await api("/api/fragile_map", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ staff_id: s.id, day_from: d0, day_to: d1 }),
        });
        if (!ST || ST.round !== round) return;     // 그 사이 다시 생성됐으면 버린다
        Object.assign(FRAGILE.cells, part.cells);
        FRAGILE.total = part.total;
        if (part.done) {
          Object.assign(FRAGILE, { done: true, fixed: part.fixed, row_fixed: part.row_fixed, swap_only: part.swap_only });
        }
        paintFragile();
      }
    }
    FRAGILE.loading = false;
  } catch (e) {
    FRAGILE = null;
  }
  paintFragile();
}

function fragileTitle(info) {
  if (info.row) return "고정 칸 — 어느 근무로 바꿔도 이 사람 행의 규칙(" + info.rules.join(", ") + ")을 깹니다. 맞교환도 안 됩니다";
  if (info.alts === 0) return "맞교환으로만 — 혼자 바꾸면 그날 인원·숙련도 규칙(" + info.rules.join(", ") + ")이 깨집니다";
  return "바꿀 수 있는 근무가 하나뿐입니다";
}

function paintFragile() {
  const box = $("#fragileBox");
  const grid = document.getElementById("gridContent");
  if (!grid) return;
  grid.querySelectorAll("td.fragile-row, td.fragile-day, td.fragile-1").forEach(td => {
    td.classList.remove("fragile-row", "fragile-day", "fragile-1");
    if (td.dataset.fragileTitle !== undefined) {
      td.title = td.dataset.baseTitle || "";
      delete td.dataset.fragileTitle;
    }
  });
  if (!FRAGILE || !ST || FRAGILE.round !== ST.round) {
    if (box) box.innerHTML = '<p class="fragile-note">생성 뒤에 점검합니다.</p>';
    return;
  }
  for (const key in FRAGILE.cells) {
    const info = FRAGILE.cells[key];
    const i = key.lastIndexOf(":");
    const sid = key.slice(0, i), day = key.slice(i + 1);
    const td = grid.querySelector(`td[data-pick="1"][data-sid="${CSS.escape(sid)}"][data-day="${CSS.escape(day)}"]`);
    if (!td) continue;
    td.classList.add(info.row ? "fragile-row" : (info.alts === 0 ? "fragile-day" : "fragile-1"));
    if (td.dataset.fragileTitle === undefined) td.dataset.baseTitle = td.title || "";
    td.dataset.fragileTitle = "1";
    td.title = (td.dataset.baseTitle ? td.dataset.baseTitle + "\n" : "") + fragileTitle(info);
  }
  if (box && !FRAGILE.done) {
    box.innerHTML = '<p class="fragile-note">건드리면 안 되는 칸을 점검하는 중입니다… (수 초, 빗금이 차례로 얹힙니다)</p>';
  } else if (box) {
    const pct = FRAGILE.total ? Math.round(100 * FRAGILE.fixed / FRAGILE.total) : 0;
    const free = FRAGILE.total - FRAGILE.fixed;
    const warn = pct >= 60 ? ' <span class="warn-text">— 인원이 빠듯한 달입니다. 손 수정보다 맞교환이나 재생성이 안전합니다.</span>' : "";
    box.innerHTML =
      `<ul class="issue-list" style="font-size:12px">` +
      `<li class="hard"><span class="rule">고정</span>${FRAGILE.row_fixed}칸 — 어느 근무로 바꿔도 그 사람 행의 규칙이 깨짐(맞교환도 불가)</li>` +
      `<li class="soft"><span class="rule">교환만</span>${FRAGILE.swap_only}칸 — 혼자 바꾸면 그날 인원·숙련도 규칙이 깨짐(맞교환은 가능할 수 있음)</li>` +
      `<li class="none"><span class="rule">자유</span>${free}칸 — 혼자 바꿔도 새 필수 위반 없음</li>` +
      `</ul><p class="fragile-note">전체 ${FRAGILE.total}칸 중 ${pct}%가 혼자서는 못 바꾸는 칸${warn}</p>`;
  }
}

async function findSwap(sid, day, shift) {
  try {
    SWAP = await api("/api/swap_candidates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: sid, day, shift }),
    });
  } catch (e) { return; }
  renderSide();
  const sec = $("#swapSec");
  if (sec) sec.scrollIntoView({ block: "nearest" });
  if (!SWAP.candidates.length) showToast(SWAP.reason || "맞교환 상대가 없습니다", true);
}

function renderSwap() {
  if (!SWAP) return "";
  const s = SWAP;
  let html = `<div class="side-sec" id="swapSec"><h3>맞교환 상대 <span class="count-badge">${s.candidates.length}명</span></h3>`;
  html += `<p class="fragile-note">${esc(s.staff_id)} ${s.day + 1}일 ${esc(s.current)} → ${esc(s.want)}. ` +
          `그 날 ${esc(s.want)}인 사람과 둘의 하루만 바꿉니다(두 칸). 새 필수 위반이 없는 상대만 보입니다.</p>`;
  if (!s.candidates.length) {
    html += `<p class="fragile-note">${esc(s.reason || "상대가 없습니다")}</p>`;
  } else {
    html += '<ul class="swap-list">';
    for (const c of s.candidates) {
      const eq = c.equity_delta > 0 ? `형평 ${c.equity_delta > 0 ? "+" : ""}${c.equity_delta}` : (c.equity_delta < 0 ? `형평 ${c.equity_delta}` : "형평 변화 없음");
      const tags = [eq];
      if (c.breaks_wish) tags.push("상대 희망 칸 깨짐");
      if (c.warnings.length) tags.push("경고 " + c.warnings.join("·"));
      html += `<li><button class="swap-pick" data-sid="${escAttr(s.staff_id)}" data-day="${s.day}" data-partner="${escAttr(c.partner)}">` +
              `${esc(c.partner)} <span class="lv">Lv${c.partner_level}</span></button>` +
              `<span class="swap-meta">${esc(c.partner)} ${esc(c.partner_shift)}→${esc(c.my_shift)} · ${esc(tags.join(" · "))}</span></li>`;
    }
    html += "</ul>";
  }
  const skipped = [];
  if (s.skipped_locked) skipped.push(`잠김·편집 중 ${s.skipped_locked}`);
  if (s.skipped_fragile) skipped.push(`고정 칸 ${s.skipped_fragile}`);
  if (s.skipped_cannot) skipped.push(`그 근무 불가 ${s.skipped_cannot}`);
  html += `<p class="fragile-note">검사 ${s.checked}명${skipped.length ? " · 제외: " + esc(skipped.join(", ")) : ""}</p>`;
  html += '<div class="action-row"><button class="swap-close">닫기</button></div></div>';
  return html;
}

async function stageSwap(sid, day, partner) {
  const before = snapshotGrid();
  try {
    ST = await api("/api/swap_stage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: sid, day, partner }),
    });
    SWAP = null;
    render({ keepScroll: true });
    flashChanges(before);
    refreshFeedback();
    showToast(`${sid} ↔ ${partner} ${day + 1}일 맞교환을 편집 목록에 올렸습니다 — 두 칸만 바뀝니다`);
  } catch (e) {}
}

function render(opts) {
  if (!ST) return;
  // 미달 날 후보는 Worker에 따로 묻는다(수 십 ms~수 백 ms) — 그리기가 끝난 뒤 채운다.
  setTimeout(refreshFillHints, 0);
  const keepScroll = !!(opts && opts.keepScroll);
  const pos = keepScroll ? captureScroll() : null;
  // 미적용 편집이 하나도 없는 상태 = 지금 화면이 곧 기준값이다. 이 순간의 하단 통계를
  // 적어 두었다가, 편집으로 값이 달라진 칸에 점선을 둘러 보여준다(아래 통계 행).
  if (!(ST.pending && ST.pending.length)) BASE_FOOT = computeFootValues();
  $("#intake").style.display = "none";
  gridContent.style.display = "block";
  sidePane.style.display = "block";
  updateInfoLabel(true);
  renderGrid();
  renderSide();
  paintFragile();
  restorePendingFocus();
  if (pos) {
    restoreScroll(pos);
    // 표가 커서 레이아웃이 한 박자 늦게 끝나거나(40명 × 31일), 브라우저의 스크롤
    // 앵커링이 뒤늦게 위치를 건드리는 경우가 있어 다음 프레임에 한 번 더 맞춘다.
    requestAnimationFrame(() => restoreScroll(pos));
    return;
  }
  // 모바일은 화면 전체가 스크롤되는 구조라, 생성 전 스크롤 위치가 그대로
  // 남으면 결과 화면이 맨 아래에서 시작한 것처럼 보인다 — 맨 위(근무표)로 리셋.
  window.scrollTo(0, 0);
  gridPane.scrollTop = 0;
}

// 바뀐 칸 깜빡이기 — 표가 제자리에 남게 되니(위) 이번엔 "눌렀는데 뭐가 달라졌지"가
// 문제가 된다. 고친 근무 칸과, 그 때문에 값이 달라진 하단 인원 숫자를 두세 번
// 깜빡여 둘의 연결을 눈으로 보여준다(인원 행은 표 맨 아래라 같이 안 보일 때가
// 많지만, 스크롤해 내려가도 애니메이션이 끝나기 전이면 여전히 깜빡이고 있다).
function snapshotGrid() {
  const grid = {};
  if (ST && ST.grid) for (const sid in ST.grid) grid[sid] = ST.grid[sid].slice();
  // 신입 칸도 같이 담는다 — 안 담으면 그 칸만 깜빡임 없이 조용히 바뀐다.
  if (ST && ST.team_b_grid) for (const n in ST.team_b_grid) grid[n] = ST.team_b_grid[n].slice();
  return { grid, foot: ST ? computeFootValues() : {} };
}

function blinkCell(el) {
  // 같은 칸을 연달아 고쳐도 매번 처음부터 깜빡이게 — 클래스를 그대로 두면
  // 브라우저가 "이미 그 애니메이션 중"으로 보고 다시 시작하지 않는다.
  el.classList.remove("flash-change");
  void el.offsetWidth;
  el.classList.add("flash-change");
}

function flashChanges(before) {
  if (!before || !ST || !ST.grid) return;
  const changed = new Set();
  const now = Object.assign({}, ST.grid, ST.team_b_grid || {});
  for (const sid in now) {
    const a = before.grid[sid];
    if (!a) continue;
    const b = now[sid];
    for (let d = 0; d < b.length; d++) if (a[d] !== b[d]) changed.add(sid + ":" + d);
  }
  if (!changed.size) return;
  gridContent.querySelectorAll("td[data-sid][data-day]").forEach(td => {
    if (changed.has(td.dataset.sid + ":" + td.dataset.day)) blinkCell(td);
  });
  const after = computeFootValues();
  gridContent.querySelectorAll("td[data-stat][data-day]").forEach(td => {
    const d = Number(td.dataset.day), k = td.dataset.stat;
    const a = before.foot[k], b = after[k];
    if (a && b && a[d] !== b[d]) blinkCell(td);
  });
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
  // 인력난 안내는 결과를 볼 때도 남아 있어야 한다 — 위반이 왜 남았는지에 대한 답이라,
  // 대기화면에서 스쳐 지나가고 말면 파트장은 "왜 위반이 있지"만 보게 된다.
  if (lastStaffing && lastStaffing.message) {
    html += `<p class="carry-warning">⚠ ${esc(lastStaffing.message)}</p>`;
  }
  // 지정 인원을 산술적으로 못 채우는 경우 — 인력 압박과 별개로 알려준다. 하드 규칙이라
  // 못 채우면 위반이 남는데, 인원이 모자라서 못 채우는 것은 다시 돌려도 안 된다.
  if (lastStaffing && lastStaffing.designated && lastStaffing.designated.message) {
    html += `<p class="carry-warning">⚠ ${esc(lastStaffing.designated.message)}</p>`;
  }
  // 어떤 배정으로도 남는 위반의 하한(엔진 feasibility_bounds) — "다시 만들면 되나"에 대한
  // 답이라 결과 화면에 붙인다. 문구는 엔진이 만든 것을 그대로 쓴다.
  if (lastStaffing && lastStaffing.bounds && lastStaffing.bounds.message) {
    html += `<p class="carry-warning">⚠ ${esc(lastStaffing.bounds.message)}</p>`;
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
  html += `<span class="sw"><span class="box fragile-row-swatch"></span>고정 칸(수정 불가)</span>`;
  html += `<span class="sw"><span class="box fragile-day-swatch"></span>맞교환으로만</span>`;
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
  ST.days.forEach((d, i) => { html += `<th class="day-head ${d.weekend ? "we" : ""}" data-day="${i}" role="button" tabindex="0" title="누르면 그날 병동 보기">${d.n}<br>${d.dow}</th>`; });
  // 듀티별 횟수 — D·E·N만이 아니라 이 달 표에 나온 모든 근무 코드를 열로 붙인다.
  // 다운로드 엑셀의 '듀티별 횟수' 블록과 같은 순서·같은 셈법(코드가 적힌 날 수)이다.
  const dutyCols = dutyColumns();
  for (const code of dutyCols) {
    html += `<th class="stat-col" title="${escAttr(`이번 달 ${code} 횟수(코드가 적힌 날 수)`)}">${esc(code)}</th>`;
  }
  html += '<th class="stat-col burden" title="주말·공휴일에 근무한 날 수">주말</th>' +
    '<th class="stat-col burden" title="이번 달 가장 길게 이어진 연속근무 일수(전월 말에서 이어진 것 포함). 상한을 넘으면 빨강">연속</th>' +
    '<th class="stat-col burden" title="야간 횟수 / 개인 목표(4 또는 6, 야간전담 15). 목표와 다르면 노랑">야간</th>';
  html +=
    '<th class="stat-col" title="병원 HR 전용 항목 — 이 앱은 값을 추적하지 않아 항상 빈칸입니다">®</th>' +
    '<th class="stat-col" title="병원 HR 전용 항목 — 이 앱은 값을 추적하지 않아 항상 빈칸입니다">ⓡ</th>' +
    '<th class="stat-col">금월</th><th class="stat-col">Lv</th>';
  html += "</tr></thead><tbody>";

  for (const s of ST.staff) {
    const row = ST.grid[s.id];
    const dutyCnt = {};
    for (const code of dutyCols) dutyCnt[code] = 0;
    let offCnt = 0;
    for (const v of row) {
      if (v === "OFF") offCnt++;
      if (v in dutyCnt) dutyCnt[v]++;
    }
    const offBefore = s.off_balance || 0;
    const offAfter = Math.round((offBefore + holCount - offCnt) * 100) / 100;
    // 지정 가능자는 이름 옆에 작은 '지' 표를 단다. .role(직급·Lv)은 폰에서 숨기지만
    // 이건 안 숨긴다 — 하단 '지정 인원' 행이 미달로 빨개졌을 때, 누구를 넣으면 되는지
    // 찾을 수 있는 유일한 단서라서다.
    const desigMark = s.is_designated
      ? '<span class="desig-mark" title="지정 가능(가능근무에 &#39;지정&#39;)">지</span>' : "";
    // 야간리더도 같은 이유로 이름 옆에 단다 — N조 레벨 줄이 빨개졌을 때 누구를
    // 밤에 넣으면 풀리는지 찾을 단서가 이것뿐이다.
    const nlMark = s.is_night_leader
      ? '<span class="desig-mark nl-mark" title="야간리더 — 이 사람이 선 밤은 숙련도 4 이상 조건을 채운 것으로 봅니다">밤</span>' : "";
    // 이름을 누르면 그 사람의 한 달을 '여정'으로 본다(개념 I에서 옮겨 옴). 값은 data-*에만.
    html += `<tr><td class="nm" data-journey="${escAttr(s.id)}" tabindex="0" role="button" title="누르면 이 사람의 한 달을 여정으로 봅니다">${esc(s.id)}${desigMark}${nlMark}` +
      `<span class="role">${s.role} Lv${s.level}</span></td>` +
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
      // 파트장 행도 고칠 수 있다. 근무는 평일 8A로 고정 배정되지만 파트장도 연차·
      // 병가를 쓰므로, 표에 그렇게 적을 길이 있어야 한다 — 예전엔 이 행만 회색으로
      // 잠겨 있어 파트장이 쉬는 날을 근무표에 넣을 방법이 아예 없었다.
      // 고를 수 있는 것은 휴가 계열과 8A뿐이다(D/E/N은 파트장 자리가 아니다 —
      // openPicker에서 거르고, 서버도 같은 기준으로 한 번 더 막는다).
      // 마우스 없이도 고칠 수 있어야 한다 — 예전엔 td에 클릭만 걸려 있어 키보드만
      // 쓰는 사람은 이 앱의 핵심 기능(칸 수정)에 아예 닿을 수 없었다.
      const aria = `${s.id} ${d + 1}일 ${shiftText(v, isWanted) || "빈칸"}`;
      html += `<td class="${cls.join(" ")}" data-sid="${escAttr(s.id)}" data-day="${d}"${title}` +
              ` data-pick="1" tabindex="0" role="button" aria-label="${escAttr(aria)}">` +
              `<span>${esc(shiftText(v, isWanted))}</span></td>`;
    }
    html += dutyCols.map(code => `<td class="stat-col">${dutyCnt[code]}</td>`).join("");
    if (s.is_partjang) {
      html += '<td class="stat-col">–</td><td class="stat-col">–</td><td class="stat-col">–</td>';
    } else {
      const b = burdenOf(s, row);
      const maxC = (ST.params_summary && ST.params_summary.max_consecutive_work) || 5;
      const runCls = b.maxRun > maxC ? " stat-short" : "";
      const tgt = s.night_target;
      const nightTxt = tgt == null ? String(b.nights) : `${b.nights}/${tgt}`;
      const nightCls = (tgt != null && b.nights !== tgt) ? " stat-warn" : "";
      const pv = (ST.prev_burden || {})[s.id];
      const wkTip = `주말·공휴일 근무 ${b.weekend}일` + (pv ? ` (지난달 ${pv.weekend}일)` : "");
      html += `<td class="stat-col burden" data-burden="weekend" title="${escAttr(wkTip)}">${b.weekend}</td>` +
        `<td class="stat-col burden${runCls}" data-burden="run" title="${escAttr(`최장 연속근무 ${b.maxRun}일 (상한 ${maxC}일)`)}">${b.maxRun}</td>` +
        `<td class="stat-col burden${nightCls}" data-burden="night" title="${escAttr((tgt == null ? `야간 ${b.nights}회` : `야간 ${b.nights}회 / 목표 ${tgt}회`) + (pv ? ` (지난달 ${pv.nights}회)` : ""))}">${nightTxt}</td>`;
    }
    html += `<td class="stat-col">–</td><td class="stat-col">–</td>` +
      `<td class="stat-col">${holCount}</td><td class="stat-col">${s.level}</td>`;
    html += "</tr>";
  }
  // B팀(신입) — 스케줄링에는 전혀 관여하지 않는 이름뿐인 목록이라 서버 grid에 없다.
  // 화면에는 구분행 + 빈칸 행으로만 보여준다(파트장이 엑셀에서 직접 배정하는 용도라
  // 여기서는 편집 대상이 아니다 — 파트장 행과 같은 disabled 처리).
  if (ST.team_b && ST.team_b.length) {
    const totalCols = 3 + ST.num_days + tailStatCount();  // 이름 + 잔휴2 + 날짜 + 계산열
    html += `<tr class="team-b-divider"><td colspan="${totalCols}">B팀(신입)</td></tr>`;
    for (const name of ST.team_b) {
      const bRow = (ST.team_b_grid && ST.team_b_grid[name]) || [];
      html += `<tr><td class="nm">${esc(name)}<span class="role">B팀</span></td>` +
        `<td class="stat-col">–</td><td class="stat-col">–</td>`;
      for (let d = 0; d < ST.num_days; d++) {
        const v = bRow[d] || "";
        // 신입 칸은 파트장이 직접 채운다 — 엔진이 배정하지 않으므로 고쳐도 다시 계산할
        // 것이 없고, 그래서 '미적용 편집'으로 쌓지 않고 바로 반영한다(data-teamb).
        html += `<td class="cell ${shiftClass(v)}" data-sid="${escAttr(name)}" data-day="${d}"` +
                ` data-teamb="1" data-pick="1" tabindex="0" role="button"` +
                ` aria-label="${escAttr(`${name} ${d + 1}일 ${shiftText(v) || "빈칸"}`)}">` +
                `<span>${esc(shiftText(v))}</span></td>`;
      }
      html += blankTailCells();
      html += "</tr>";
    }
  }
  html += renderDailyLevelFootRows();
  html += "</tbody></table></div>";
  gridContent.innerHTML = html;
  $("#backToInputBtn").onclick = () => {
    // 손으로 고친 칸(미적용 편집·되올린 수정본의 고정 칸)은 돌아가는 순간 사라지고,
    // 다시 생성해도 돌아오지 않는다 — 같은 입력이면 같은 근무표가 나오지만 고친 칸은
    // 입력이 아니다. 예전엔 묻지 않고 지웠다(2026-10-13 화면 훑기).
    const edited = (ST.pending && ST.pending.length) || (ST.locked && ST.locked.length);
    if (edited && !confirm(
        `손으로 고친 칸이 ${(ST.pending || []).length + (ST.locked || []).length}개 있습니다 — ` +
        `입력으로 돌아가면 이 수정은 사라지고, 다시 생성해도 돌아오지 않습니다.\n` +
        `남겨두려면 먼저 "재생성 적용" 뒤 내려받아 두세요.\n\n그래도 돌아가시겠습니까?`)) return;
    ST = null;
    gridContent.style.display = "none";
    gridContent.innerHTML = "";
    $("#intake").style.display = "block";
    sidePane.style.display = "none";
    updateInfoLabel(false);
  };
}

// 날짜별 레벨 통계 — 그 날 실제로 근무(D/E/N(NK 포함)/prn(8A 포함))에 배정된 사람들의
// 평균 레벨과, 고랩(Lv4-5)·저랩(Lv1-3) 인원수를 화면 그리드(미적용 편집 포함)에서
// 매번 다시 계산해 그리드 맨 아래 행으로 붙인다 — 잔휴·D/E/N 칸과 같은 패턴으로,
// 파트장이 칸을 수정하면 재생성 없이 즉시 갱신된다.
// prn으로 세는 근무코드 — 8A·9A·10A와 8H·9H·10H, 그리고 그 변형까지 전부 한 덩어리다
// (시작시각만 다른 같은 근무라 파트장 눈에는 하나다). 이 목록은 파이썬
// nurse_scheduler/models.py의 PRN_LIKE_SHIFTS와 **한 글자도 다르면 안 된다** —
// tests/test_pyodide_sync.py가 두 곳을 대조한다. 어긋나면 화면과 엑셀이 같은 날
// 다른 인원을 표시하게 되는데, 어느 쪽이 맞는지 사용자는 알 방법이 없다.
const PRN_FULL_CODES = ["10A", "10H", "8A", "8A(10", "8A*", "8A◎", "8H", "9A", "9H", "prn"];
// 반일 근무 — 인원 수에서 0.5명으로 센다(실제 근무가 4시간대다).
const PRN_HALF_CODES = ["8AH", "9AH", "9H*"];

const LEVEL_SHIFT_KEY = { D: "D", E: "E", N: "N", NK: "N" };
// 레벨 통계는 **사람 단위로 1명씩** 센다 — 반일도 그 사람은 그날 그 근무에 있으므로
// 고랩 유무 판정에는 온전히 들어간다. 0.5는 아래 인원 수에서만 쓴다.
for (const c of PRN_FULL_CODES.concat(PRN_HALF_CODES)) LEVEL_SHIFT_KEY[c] = "prn";

// 근무조(D/E/N)마다 따로 낸다. 예전엔 그날 근무자 전체를 섞어 평균 하나만 보여줬는데,
// 조마다 숙련도 구성이 다르므로 섞으면 **어느 조가 얇은지 안 보인다** — 평균이 3.1이어도
// 그날 E조는 전원 저연차일 수 있다. H1-5(그 조에 Lv4+ 1명)가 근무별로 걸리는 규칙이니
// 화면도 근무별이어야 파트장이 고칠 자리를 찾는다.
// prn은 레벨 줄에 따로 두지 않는다 — H1-5가 prn을 보지 않고(시간대가 짧다), 줄만 늘어난다.
function computeDailyLevelStats() {
  const generals = ST.staff.filter(s => !s.is_partjang);
  const days = [];
  for (let d = 0; d < ST.num_days; d++) {
    const byKey = { D: [], E: [], N: [] };
    const all = [];
    let nightLeaderOn = false;
    for (const s of generals) {
      const k = LEVEL_SHIFT_KEY[ST.grid[s.id][d]];
      if (!k) continue;
      all.push(s.level);
      if (byKey[k]) byKey[k].push(s.level);
      if (k === "N" && s.is_night_leader) nightLeaderOn = true;
    }
    const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    days.push({
      D: avg(byKey.D), E: avg(byKey.E), N: avg(byKey.N),
      // 그 조에 Lv4+가 하나도 없으면 H1-5 위반이다 — 칸을 빨갛게 해서 바로 보이게 한다.
      // N조는 '야간리더'가 서 있어도 충족이다(검사기 H1-5와 같은 판정) — 화면과
      // 검사가 다르면 파트장이 빨간 칸을 보고 고쳤는데 위반 목록은 그대로가 된다.
      short: { D: byKey.D.length > 0 && !byKey.D.some(l => l >= 4),
               E: byKey.E.length > 0 && !byKey.E.some(l => l >= 4),
               N: byKey.N.length > 0 && !byKey.N.some(l => l >= 4)
                  && !nightLeaderOn },
      hi: all.filter(l => l >= 4).length,
      lo: all.filter(l => l <= 3).length,
    });
  }
  return days;
}

// 그리드 오른쪽 '듀티별 횟수' 열 — 이 달 표에 실제로 나온 근무 코드만, 고정 순서로.
// D·E·N은 비어 있어도 항상 앞에 둔다(그 셋이 없으면 파트장이 표를 못 알아본다).
// 안 쓰는 코드까지 전부 늘어놓으면 24열이 0으로 채워져 보려던 값이 묻힌다.
// 순서는 다운로드 엑셀(excel_export.duty_codes_present)과 같다: D·E·N·NK → 엔진 Shift 선언 순
// → 그 외(표에 모르는 코드가 있을 때)는 글자순.
// DUTY_ORDER는 엔진의 excel_export._DUTY_ORDER와 같아야 한다 — tests/test_pyodide_sync.py가 대조한다.
const DUTY_ORDER = ["D", "E", "N", "NK", "8A", "9A", "10A", "prn", "OFF", "연차", "T", "조", "경", "연1", "연2", "연3", "연4", "공", "병", "휴", "승", "S/", "TW", "군", "5A", "5AH", "5M", "6A", "7A", "7A(10", "7A(11", "7H", "8A(10", "8A*", "8AH", "8A◎", "8H", "9AH", "9H", "9H*", "10H", "11A", "11*", "13H", "1P", "1P*", "MD", "DH", "EH", "TDH", "TEH", "TH", "DP", "EP", "RD", "RE", "RP", "D◎", "E◎", "8공연", "연6", "공4", "격", "원", "포", "힐", "가", "난", "생", "근", "유", "출", "특", "결*", "조*", "R", "사", "산전", "상", "육법", "육법*", "육연", "출산"];
function dutyColumns() {
  const seen = new Set(["D", "E", "N"]);
  for (const s of ST.staff) for (const v of (ST.grid[s.id] || [])) if (v) seen.add(v);
  const out = DUTY_ORDER.filter(c => seen.has(c));
  for (const c of [...seen].sort()) if (!out.includes(c)) out.push(c);
  return out;
}
// 날짜 뒤에 붙는 계산열 수 — 듀티별 횟수 + ®·ⓡ·금월·Lv. 하단 통계 행과 B팀 행의 빈칸
// 수, 구분행의 colspan이 전부 이 값을 써야 열이 어긋나지 않는다.
// 사람별 부담 열 세 개(주말·연속·야간) — 듀티별 횟수 뒤, ®·ⓡ·금월·Lv 앞.
const BURDEN_COLS = ["주말", "연속", "야간"];
function tailStatCount() { return dutyColumns().length + BURDEN_COLS.length + 4; }
// 근무로 세는 코드 — 엔진 WORK_SHIFTS와 같은 뜻으로, 화면에서는 '휴무 계열이 아니면 근무'로 본다
// (빈칸은 휴무). 연속근무·주말 근무 횟수를 그리드에서 바로 세는 데 쓴다.
function isWorkCode(v) { return !!v && !REST_PICK.includes(v); }
// 한 사람의 부담 숫자: 주말·공휴일 근무 횟수, 이번 달 최장 연속근무(전월 말에서 이어진 것 포함),
// 야간 횟수. 칸을 고치면 다른 계산열처럼 그 자리에서 다시 센다.
function burdenOf(s, row) {
  let weekend = 0, nights = 0, run = s.carry_run || 0, maxRun = run;
  for (let d = 0; d < ST.num_days; d++) {
    const v = row[d];
    if (isWorkCode(v)) {
      if (ST.days[d].weekend) weekend++;
      run++;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
    if (v === "N" || v === "NK") nights++;
  }
  return { weekend, maxRun, nights };
}
function blankTailCells() { return '<td class="stat-col">–</td>'.repeat(tailStatCount()); }

// 날짜별 인원(듀티별) — 이달 표에 나온 코드마다 한 줄. 오른쪽 '듀티별 횟수' 열과 같은 코드 목록을
// 눕힌 것이다(열 = 사람별 횟수, 줄 = 날짜별 인원). 예전엔 D·E·N·prn 네 줄뿐이라 N 줄에 NK가,
// prn 줄에 8A·9A·10A·반일이 섞여 "그날 누가 무슨 근무로 섰나"가 안 보였다(파트장 지적).
//
// 파트장은 뺀다: 최소인력이 파트장을 빼고 잡는 값이라(H1-1도 그렇게 본다) 같이 세면 파트장의 8A가
// prn으로 잡혀 못 채운 날이 채운 것처럼 보인다. 코드 목록도 파트장을 빼고 만든다 — 파트장만 쓰는
// 8A가 있으면 0만 늘어선 줄이 하나 생긴다.
//
// 최소인력 기준은 기준이 걸린 줄에만 칠한다. 빨강 = 미달(H1-1), 노랑 = 초과(H1-4, 검사기와 같은
// '기준+1 이상' — 반일 0.5 때문에 기준보다 0.5 많은 것은 초과가 아니다).
//   D·E   코드 줄 그대로.
//   밤    NK가 있는 병동은 N·NK 줄은 그냥 세고, 그 아래 'N+NK' 줄에 기준. NK가 없으면 N 줄에.
//   prn   8A·9A·10A·prn·반일 코드 줄은 사람 수(반일도 1명 — 오른쪽 횟수 열과 같은 셈법),
//         그 아래 'prn 합계' 줄은 반일을 0.5명으로 세고 거기에 기준.
//   지정  '지정 인원' 줄 — 미달만(H1-6에는 상한이 없다).
// 그 아래 점선부터는 최소인력에 안 세는 코드(교육·OFF·휴가·OCS 코드)다.
//
// 출력① 엑셀 맨 아래도 같은 구성이다(excel_export.daily_duty_row_specs). 두 쪽이 다르면 화면과
// 내려받은 파일이 다른 숫자를 말한다 — tests/test_pyodide_sync.py가 같은 입력으로 대조한다.
const COUNT_KEY = { D: "D", E: "E", N: "N", NK: "N" };
const COUNT_WEIGHT = { D: 1, E: 1, N: 1, NK: 1 };
for (const c of PRN_FULL_CODES) { COUNT_KEY[c] = "prn"; COUNT_WEIGHT[c] = 1; }
for (const c of PRN_HALF_CODES) { COUNT_KEY[c] = "prn"; COUNT_WEIGHT[c] = 0.5; }
const PRN_FAMILY = PRN_FULL_CODES.concat(PRN_HALF_CODES);
// 주간 블록(H6-1)을 이루는 근무 — 엔진 DAY_WORK_SHIFTS와 같은 목록. 8A*·9H 같은 변형은 블록을 끊는다.
const DAY_BLOCK_CODES = ["D", "E", "prn", "8A", "9A", "10A"];
const isCounted = v => Object.prototype.hasOwnProperty.call(COUNT_KEY, v);

// 줄 구성 — {label, codes: Map(코드→몇 명치)|null, need: 최소인력 키|null, upper: 초과도 칠하나,
// kind: "code"|"total"|"designated"|"other"}. 순서와 조건이 엑셀과 한 벌이다.
function dailyDutyRowSpecsFor(codesSeen, anyNeed) {
  const seen = new Set(["D", "E", "N"]);
  for (const c of codesSeen) if (c) seen.add(c);
  const ordered = DUTY_ORDER.filter(c => seen.has(c))
    .concat([...seen].filter(c => !DUTY_ORDER.includes(c)).sort());
  const hasNK = seen.has("NK");
  const prnCodes = ordered.filter(c => PRN_FAMILY.includes(c));
  const one = c => new Map([[c, 1]]);
  const rows = [
    { label: "D", codes: one("D"), need: "D", upper: true, kind: "code" },
    { label: "E", codes: one("E"), need: "E", upper: true, kind: "code" },
    { label: "N", codes: one("N"), need: hasNK ? null : "N", upper: !hasNK, kind: "code" },
  ];
  if (hasNK) {
    rows.push({ label: "NK", codes: one("NK"), need: null, upper: false, kind: "code" });
    rows.push({ label: "N+NK", codes: new Map([["N", 1], ["NK", 1]]), need: "N", upper: true, kind: "total" });
  }
  for (const c of prnCodes) rows.push({ label: c, codes: one(c), need: null, upper: false, kind: "code" });
  if (prnCodes.length || anyNeed("prn")) {
    rows.push({ label: "prn 합계", codes: new Map(PRN_FAMILY.map(c => [c, COUNT_WEIGHT[c]])),
                need: "prn", upper: true, kind: "total" });
  }
  if (anyNeed("지정")) rows.push({ label: "지정 인원", codes: null, need: "지정", upper: false, kind: "designated" });
  for (const c of ordered) {
    if (["D", "E", "N", "NK"].includes(c) || PRN_FAMILY.includes(c)) continue;
    rows.push({ label: c, codes: one(c), need: null, upper: false, kind: "other" });
  }
  return rows;
}
function dailyDutyRowSpecs() {
  const seen = [];
  for (const s of ST.staff) if (!s.is_partjang) seen.push(...(ST.grid[s.id] || []));
  const anyNeed = k => (ST.days || []).some(d => d.min && (d.min[k] || 0) > 0);
  return dailyDutyRowSpecsFor(seen, anyNeed);
}
function computeDailyDutyRows(specs) {
  const people = ST.staff.filter(s => !s.is_partjang);
  return specs.map(sp => {
    const vals = [];
    for (let d = 0; d < ST.num_days; d++) {
      let n = 0;
      for (const s of people) {
        const v = (ST.grid[s.id] || [])[d];
        // 지정은 **사람 수**다 — 반일이어도 그 사람은 그날 병동에 있으므로 1명이다. 이미 위의
        // 근무 줄에 세어진 사람이라 인력을 더 쓰는 값이 아니라 "그 자리를 누가 채웠나"를 본다.
        if (sp.kind === "designated") { if (s.is_designated && isCounted(v)) n += 1; }
        else n += sp.codes.get(v) || 0;
      }
      vals.push(n);
    }
    return vals;
  });
}
function dutyRowTip(sp) {
  if (sp.label === "N+NK") return "밤 합계 — N과 NK(야간전담)를 더한 수. 최소인력 N 기준이 이 줄에 걸립니다(빨강 미달·노랑 초과).";
  if (sp.kind === "total") return "prn 계열 합계 — 8A·9A·10A·prn 등을 더한 수(반일 8AH·9AH·9H*는 0.5명). 최소인력 prn 기준이 이 줄에 걸립니다(빨강 미달·노랑 초과).";
  if (sp.kind === "designated") return "가능근무에 '지정'을 적은 사람 중 그날 D·E·N·prn 어딘가에 선 수(반일도 1명). 최소인력 '지정' 기준 — 미달만 빨강.";
  if (sp.kind === "other") return `${sp.label} — 그날 이 코드인 사람 수(파트장 제외). 최소인력에는 안 셉니다.`;
  if (sp.need) return `${sp.label} — 그날 이 코드인 사람 수(파트장 제외). 최소인력 ${sp.need} 기준이 이 줄에 걸립니다(빨강 미달·노랑 초과).`;
  return `${sp.label} — 그날 이 코드인 사람 수(파트장 제외). 기준은 아래 ${sp.label === "N" || sp.label === "NK" ? "N+NK" : "prn 합계"} 줄.`;
}
// 그날 그 줄의 기준 판정 — 화면 색과 월간 보고가 같이 쓴다. need가 null이면 기준이 없는 줄.
function dutyNeedState(sp, d, c) {
  const min = ST.days[d] && ST.days[d].min;
  if (!sp.need || !min) return { need: null, short: false, over: false };
  const need = min[sp.need] || 0;
  return { need, short: c < need, over: sp.upper && c >= need + 1 };
}

// 하단 통계(날짜별 인원 줄 + 레벨평균·Lv4-5·Lv1-3)의 '화면에 보이는 값' 한 벌.
// 숫자가 아니라 글자로 두는 이유는 레벨평균 때문이다 — 소수 한 자리로 반올림해 보여주므로
// 숫자로 비교하면 눈에는 똑같은 3.4인데 "바뀌었다"고 표시하게 된다.
function computeFootValues() {
  const specs = dailyDutyRowSpecs();
  const vals = computeDailyDutyRows(specs);
  const lv = computeDailyLevelStats();
  const out = {};
  specs.forEach((sp, i) => { out[sp.label] = vals[i].map(String); });
  for (const k of ["D", "E", "N"]) {
    out[`${k} 레벨`] = lv.map(d => (d[k] === null ? "–" : d[k].toFixed(1)));
  }
  out["Lv4-5"] = lv.map(d => String(d.hi));
  out["Lv1-3"] = lv.map(d => String(d.lo));
  return out;
}

// 그 날 그 조에 Lv4+가 없는지 — 레벨 줄을 빨갛게 칠할지 판단용(H1-5).
function computeLevelShortFlags() {
  const lv = computeDailyLevelStats();
  const out = {};
  for (const k of ["D", "E", "N"]) out[`${k} 레벨`] = lv.map(d => d.short[k]);
  for (const k of ["Lv4-5", "Lv1-3"]) out[k] = lv.map(() => false);
  return out;
}

function renderDailyStaffCountRows(foot) {
  const specs = dailyDutyRowSpecs();
  const vals = computeDailyDutyRows(specs);
  const blankTail = blankTailCells();
  const blankHead = '<td class="stat-col">–</td><td class="stat-col">–</td>';
  let otherStarted = false;
  return specs.map((sp, i) => {
    const k = sp.label;
    const rowCls = ["level-foot-row", "duty-row", `duty-${sp.kind}`];
    if (sp.kind === "other" && !otherStarted) { rowCls.push("duty-other-first"); otherStarted = true; }
    return `<tr class="${rowCls.join(" ")}"><td class="nm" title="${escAttr(dutyRowTip(sp))}">${esc(k)}</td>${blankHead}` +
      vals[i].map((c, d) => {
        // days[d].min이 없는 옛 응답(캐시된 예전 화면 등)에서는 색만 빠지고 숫자는 나온다.
        const st = dutyNeedState(sp, d, c);
        // 미적용 편집 때문에 달라진 숫자는 바뀐 근무 칸과 같은 점선으로 묶어 준다 —
        // 깜빡임은 몇 초면 끝나므로, 반영/취소할 때까지 남는 표시가 따로 있어야
        // "내가 고쳐서 이렇게 된 숫자"를 나중에도 알아볼 수 있다. 기준 미달의 빨강은
        // 그대로 둔다(배경색과 테두리라 서로 가리지 않는다).
        const moved = BASE_FOOT && BASE_FOOT[k] && BASE_FOOT[k][d] !== foot[k][d];
        const cls = "stat-col" + (st.short ? " stat-short" : st.over ? " stat-over" : "") +
          (moved ? " count-changed" : "");
        const base = moved ? `\n수정 전 ${BASE_FOOT[k][d]}명 → 지금 ${c}명` : "";
        const judge = st.need === null ? ""
          : ` (기준 ${st.need}명${st.short ? " — 미달" : st.over ? " — 초과" : ""})`;
        const title = st.need === null && !moved ? ""
          : ` title="${escAttr(`${d + 1}일 ${k} ${c}명` + judge + base)}"`;
        // data-stat/data-day: 근무를 고쳤을 때 값이 달라진 칸만 찾아 깜빡이기 위한 표식.
        return `<td class="${cls}" data-stat="${escAttr(k)}" data-day="${d}"${title}>${c}</td>`;
      }).join("") + `${blankTail}</tr>`;
  }).join("");
}

function renderDailyLevelFootRows() {
  const foot = computeFootValues();
  const shortFlags = computeLevelShortFlags();
  const blankTail = blankTailCells();
  const blankHead = '<td class="stat-col">–</td><td class="stat-col">–</td>';
  // 레벨평균·Lv4-5·Lv1-3도 인원 행과 똑같이 다룬다. 근무를 하나 바꾸면 그날 누가
  // 서 있는지가 바뀌므로 이 셋도 같이 움직이는데, 표시가 없으면 조용히 달라진다 —
  // 레벨 균형은 파트장이 근무를 고칠 때 실제로 보는 값이라 놓치면 안 된다.
  const rowHtml = (label) =>
    `<tr class="level-foot-row"><td class="nm">${label}</td>${blankHead}` +
    foot[label].map((v, d) => {
      const moved = BASE_FOOT && BASE_FOOT[label] && BASE_FOOT[label][d] !== v;
      const isShort = shortFlags[label] && shortFlags[label][d];
      const tip = (isShort ? `${d + 1}일 ${label.slice(0, 1)}조에 숙련도 4 이상이 없습니다` : "")
        + (moved ? `${isShort ? " · " : ""}${d + 1}일 ${label} 수정 전 ${BASE_FOOT[label][d]} → 지금 ${v}` : "");
      const title = tip ? ` title="${escAttr(tip)}"` : "";
      return `<td class="stat-col${moved ? " count-changed" : ""}${isShort ? " short" : ""}" ` +
             `data-stat="${label}" data-day="${d}"${title}>${v}</td>`;
    }).join("") + `${blankTail}</tr>`;
  // B팀 구분행과 같은 스타일로, 통계 3행 위에도 제목 행을 붙인다.
  const totalCols = 3 + ST.num_days + tailStatCount();  // 이름 + 잔휴2 + 날짜 + 계산열
  const divider = `<tr class="team-b-divider"><td colspan="${totalCols}">통계 · 날짜별 인원(파트장 제외) — 빨강 미달 · 노랑 초과 · 점선 아래는 최소인력에 안 세는 코드</td></tr>`;
  return divider +
    renderDailyStaffCountRows(foot) +
    rowHtml("D 레벨") + rowHtml("E 레벨") + rowHtml("N 레벨") +
    rowHtml("Lv4-5") + rowHtml("Lv1-3");
}

// 그리드·사이드 패널·공휴일 달력은 통째로 다시 그려지므로, 개별 요소가 아니라 바뀌지 않는
// 상위 컨테이너에 한 번만 리스너를 건다(다시 그려도 계속 동작한다).
delegateClick(document.getElementById("gridContent"), 'td[data-pick="1"]',
  (td, ev) => openPicker(ev, td.dataset.sid, Number(td.dataset.day)));
// 키보드로도 같은 자리를 연다. 클릭과 마찬가지로 상위 컨테이너에 한 번만 건다.
document.getElementById("gridContent").addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" && ev.key !== " ") return;
  const td = ev.target.closest('td[data-pick="1"]');
  if (!td) return;
  ev.preventDefault();                     // Space가 화면을 스크롤하지 않게
  openPicker(ev, td.dataset.sid, Number(td.dataset.day));
});
// 점수표의 줄을 누르면 그 시드의 표로 바꾼다. 미적용 편집은 버려지므로 먼저 묻는다 — 바꾼 표에는
// 그 편집이 뜻이 없다(다른 표의 칸이다). 고정 칸(재생성 때 잠근 것)은 그대로 적용돼 있다.
delegateClick(document.getElementById("gridPane"), "th.day-head[data-day]", (th) => openDiorama(Number(th.dataset.day)));
delegateClick(document.getElementById("gridContent"), "td.nm[data-journey]", (td) => openJourney(td.dataset.journey));
document.getElementById("gridContent").addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" && ev.key !== " ") return;
  const td = ev.target.closest("td.nm[data-journey]");
  if (!td) return;
  ev.preventDefault();
  openJourney(td.dataset.journey);
});
document.getElementById("gridPane").addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" && ev.key !== " ") return;
  const th = ev.target.closest("th.day-head[data-day]");
  if (!th) return;
  ev.preventDefault();
  openDiorama(Number(th.dataset.day));
});
delegateClick(document.getElementById("sidePane"), "table.attempt-table tr[data-seed]", async (tr) => {
  const seed = Number(tr.dataset.seed);
  if (!ST || seed === ST.current_seed) return;
  if (ST.pending && ST.pending.length) {
    const kept = (ST.locked && ST.locked.length) ? `\n적용(고정)한 ${ST.locked.length}칸은 새 표에도 그대로 들어갑니다.` : "";
    if (!confirm(`시드 ${seed}의 표로 바꾸면 지금 표에서 손으로 고친 ${ST.pending.length}칸이 사라집니다.${kept}\n바꿀까요?`)) return;
  }
  showGenOverlay(`시드 ${seed}의 근무표로 바꾸는 중입니다…`);
  try {
    ST = await api("/api/select_attempt", { method: "POST", body: JSON.stringify({ seed }) });
    SWAP = null;
    render();
    showToast(`시드 ${seed}의 근무표를 보고 있습니다`);
    refreshFragile();
  } finally {
    hideGenOverlay();
  }
});
// 검증 요약의 위반 항목 → 그 칸으로. 사람이 있으면 그 사람의 그날 칸, 없으면 그날의 머리칸을 가운데로
// 끌어와 잠깐 깜빡인다(기존 flash-change 애니메이션 재사용).
function jumpToCell(sid, day) {
  const sel = sid ? `td[data-sid="${CSS.escape(sid)}"][data-day="${day}"]` : `th.day-head[data-day="${day}"]`;
  const el = document.querySelector(sel);
  if (!el) return false;
  el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  el.classList.remove("flash-change"); void el.offsetWidth; el.classList.add("flash-change");
  setTimeout(() => el.classList.remove("flash-change"), 3200);
  return true;
}
delegateClick(document.getElementById("sidePane"), "ul.issue-list li[data-day]", (li) => {
  jumpToCell(li.dataset.sid || "", Number(li.dataset.day));
});
// 점수표 접기/펴기 — 다시 그리지 않고 표의 class만 바꾼다(스크롤 위치가 튀지 않게).
delegateClick(document.getElementById("sidePane"), "button.attempt-more", (btn) => {
  const tbl = btn.closest(".side-sec").querySelector("table.attempt-table");
  attemptTableExpanded = !attemptTableExpanded;
  tbl.classList.toggle("expanded", attemptTableExpanded);
  btn.textContent = attemptTableExpanded ? "점수 상위 3줄만 보기" : `나머지 ${btn.dataset.n}개 시드 보기`;
});
document.getElementById("sidePane").addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" && ev.key !== " ") return;
  const tr = ev.target.closest("table.attempt-table tr[data-seed]");
  if (!tr) return;
  ev.preventDefault();
  tr.click();
});

delegateClick(document.getElementById("sidePane"), "button.undo-edit",
  (b) => undoEdit(b.dataset.sid, Number(b.dataset.day)));
delegateClick(document.getElementById("sidePane"), "button.swap-pick",
  (b) => stageSwap(b.dataset.sid, Number(b.dataset.day), b.dataset.partner));
delegateClick(document.getElementById("sidePane"), "button.swap-close",
  () => { SWAP = null; renderSide(); paintFragile(); });
delegateClick(document.getElementById("holidayCalendar"), "td[data-iso]",
  (td) => toggleHolidayDate(td.dataset.iso));

// ================================================================ 그날 병동(디오라마)
// 날짜 머리칸을 누르면 그날 누가 어느 방에 있는지 평면도로 본다 — 표의 세로줄을 읽는 것보다
// "오늘 밤에 누가 있나"가 한눈에 들어온다. 데모(네 가지 개념 II)에서 옮겨 왔고, 걷는 동작은 뺐다.
let DIO = null;   // {day}
function roomOfCode(v) {
  if (!v) return "home";
  if (v === "E") return "E";
  if (v === "N" || v === "NK") return "N";
  if (isWorkCode(v)) return "D";
  return "home";
}
function openDiorama(day) {
  DIO = { day };
  let bd = document.getElementById("dioModalBackdrop");
  if (!bd) {
    bd = document.createElement("div");
    bd.className = "modal-backdrop"; bd.id = "dioModalBackdrop";
    bd.innerHTML = '<div class="modal dio-modal" role="dialog" aria-modal="true" aria-label="그날 병동">' +
      '<div class="modal-head"><h2 id="dioTitle"></h2><div class="dio-nav"><button data-dio="prev" title="전날">◀</button><button data-dio="next" title="다음날">▶</button><button data-dio="close" title="닫기">✕</button></div></div>' +
      '<div class="modal-body dio-body"><div class="dio-rooms" id="dioRooms"></div><p class="hint dio-hint" id="dioHint"></p></div></div>';
    document.body.appendChild(bd);
    bd.addEventListener("click", (e) => { if (e.target === bd) closeDiorama(); });
    delegateClick(bd, "button[data-dio]", (b) => {
      if (b.dataset.dio === "close") closeDiorama();
      else if (DIO) { DIO.day = (DIO.day + (b.dataset.dio === "next" ? 1 : ST.num_days - 1)) % ST.num_days; drawDiorama(); }
    });
    // 사람을 누르면 그 사람의 여정으로 — 디오라마는 닫는다(모달 둘이 겹치면 폰에서 길을 잃는다)
    delegateClick(bd, ".dio-person[data-sid]", (el) => { const sid = el.dataset.sid; closeDiorama(); openJourney(sid, DIO_LAST_DAY); });
    bd.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDiorama();
      if (e.key === "ArrowRight" && DIO) { DIO.day = (DIO.day + 1) % ST.num_days; drawDiorama(); }
      if (e.key === "ArrowLeft" && DIO) { DIO.day = (DIO.day + ST.num_days - 1) % ST.num_days; drawDiorama(); }
    });
  }
  bd.classList.add("show");
  drawDiorama();
  const first = bd.querySelector("button[data-dio='next']");
  if (first) first.focus();
}
let DIO_LAST_DAY = 0;
function closeDiorama() {
  const bd = document.getElementById("dioModalBackdrop");
  if (bd) bd.classList.remove("show");
  if (DIO) DIO_LAST_DAY = DIO.day;
  DIO = null;
}
// 캔버스가 아니라 DOM으로 그린다 — 캔버스는 폰 가로·세로에서 방 네 개가 한 줄에 눌려 이름이
// 겹치고 별이 글자 위에 찍혔다(파트장 지적). DOM이면 방이 화면 폭에 맞춰 접히고, 사람 칩이
// 줄바꿈되고, 이름은 제 칸 안에서 줄임표로 끝난다. 색·별·크기는 전과 같은 뜻이다.
const DIO_ROOMS = [
  ["home", "집 · 쉼", "🏠"], ["D", "낮 D", "☀️"], ["E", "저녁 E", "🌇"], ["N", "밤 N·NK", "🌙"]];
function dioCodeColor(code, dark) {
  return code === "D" ? "#3b82f6" : code === "E" ? "#f97316" : code === "N" ? "#7c3aed" : code === "NK" ? "#db2777"
       : isWorkCode(code) ? "#16a34a" : (dark ? "#475569" : "#9ca3af");
}
function drawDiorama() {
  if (!DIO || !ST) return;
  const day = DIO.day, d = ST.days[day], min = d.min || {};
  const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const groups = { home: [], D: [], E: [], N: [] };
  for (const s of ST.staff) { if (s.is_partjang) continue; groups[roomOfCode((ST.grid[s.id] || [])[day])].push(s); }
  let html = "";
  for (const [k, label, icon] of DIO_ROOMS) {
    const need = k === "D" ? min.D : k === "E" ? min.E : k === "N" ? min.N : undefined;
    const n = groups[k].length;
    const short = need !== undefined && n < need, over = need !== undefined && n >= need + 1;
    const sub = k === "D" ? '<span class="dio-sub">prn·8A 포함</span>' : "";
    html += `<section class="dio-room dio-${k}${short ? " short" : ""}">` +
      `<header><span class="dio-icon">${icon}</span><b>${label}</b>${sub}` +
      `<span class="dio-count${short ? " bad" : over ? " over" : ""}">${need !== undefined ? `${n}<small>/${need}명</small>` : `${n}<small>명</small>`}${short ? " 미달" : ""}</span></header>` +
      `<div class="dio-people">` +
      groups[k].map(s => {
        const code = (ST.grid[s.id] || [])[day], lv = s.level || 1;
        const h = 18 + lv * 3;   // 키가 클수록 숙련도가 높다
        return `<button type="button" class="dio-person" data-sid="${escAttr(s.id)}" title="${escAttr(`${s.id} · Lv${lv} · ${shiftText(code) || "쉼"} — 누르면 여정`)}">` +
          `<span class="dio-fig" style="--h:${h}px;--c:${dioCodeColor(code, dark)}">${lv >= 4 ? '<i class="dio-star">★</i>' : ""}<span class="dio-head"></span><span class="dio-torso"></span></span>` +
          `<span class="dio-name">${esc(s.id)}</span><span class="dio-code">${esc(shiftText(code) || "")}</span></button>`;
      }).join("") +
      (n ? "" : '<span class="dio-empty">아무도 없음</span>') +
      `</div></section>`;
  }
  document.getElementById("dioRooms").innerHTML = html;
  document.getElementById("dioTitle").textContent = `${ST.month}월 ${d.n}일 (${d.dow})${d.weekend ? " · 주말·공휴일" : ""}`;
  document.getElementById("dioHint").textContent = "키가 클수록 높은 숙련도, ★는 Lv4 이상. 사람을 누르면 그 사람의 한 달(여정). ◀ ▶ 또는 ←→로 날짜를 넘깁니다. 파트장은 뺐습니다.";
}

// ================================================================ 여정(한 사람의 한 달)
// 이름(표 첫 열)이나 디오라마의 사람을 누르면 그 사람의 한 달을 1인칭으로 걷는다 — 해·노을·달이 뜨고,
// 카드에 그 칸이 왜 거기 놓였는지(이 칸은 왜와 같은 간단 판정) 적힌다. 개념 I '여정'에서 옮겨 옴.
let JOUR = null;   // {sid, day, pos, play, last, raf}
const JOUR_C = { D: "#60a5fa", E: "#fb923c", N: "#a78bfa", NK: "#f472b6", OFF: "#94a3b8", prn: "#4ade80", "8A": "#cbd5e1", "S/": "#2dd4bf" };
const JOUR_NAME = { D: "낮(D)", E: "저녁(E)", N: "밤(N)", NK: "밤(야간전담)", OFF: "쉼", prn: "prn", "S/": "수면오프" };
function jourSky(code) {
  return code === "D" ? ["#8ec5ff", "#dff0ff"] : code === "E" ? ["#3b2a5a", "#f59e6b"]
       : (code === "N" || code === "NK") ? ["#050816", "#1a2050"] : code === "S/" ? ["#1f2937", "#475569"]
       : isWorkCode(code) ? ["#6b8fb3", "#d6e6f5"] : ["#5b6b84", "#c7d2e2"];
}
function jourRnd(i) { const x = Math.sin(i * 9301 + 49297) * 233280; return x - Math.floor(x); }
function openJourney(sid, day) {
  if (!ST || !ST.grid[sid]) return;
  const row = ST.grid[sid];
  let d0 = Number.isInteger(day) ? day : row.findIndex(v => isWorkCode(v));
  if (d0 < 0) d0 = 0;
  JOUR = { sid, day: d0, pos: d0, play: false, last: 0, raf: 0 };
  let bd = document.getElementById("jourModalBackdrop");
  if (!bd) {
    bd = document.createElement("div");
    bd.className = "modal-backdrop"; bd.id = "jourModalBackdrop";
    bd.innerHTML = '<div class="modal jour-modal" role="dialog" aria-modal="true" aria-label="여정">' +
      '<div class="modal-head"><h2 id="jourTitle"></h2><div class="dio-nav"><button data-jour="prev" title="전날">◀</button><button data-jour="play" title="걷기">▶ 걷기</button><button data-jour="next" title="다음날">▶</button><button data-jour="close" title="닫기">✕</button></div></div>' +
      '<div class="modal-body jour-body"><div class="jour-stage"><canvas id="jourCanvas"></canvas><div class="jour-card" id="jourCard"></div></div><p class="hint" id="jourHint">◀ ▶·←→·휠로 날짜를 넘깁니다. 해는 낮, 노을은 저녁, 달은 밤. 카드에 그 칸이 왜 거기 놓였는지 적힙니다.</p></div></div>';
    document.body.appendChild(bd);
    bd.addEventListener("click", (e) => { if (e.target === bd) closeJourney(); });
    delegateClick(bd, "button[data-jour]", (b) => {
      if (!JOUR) return;
      const k = b.dataset.jour;
      if (k === "close") closeJourney();
      else if (k === "play") { JOUR.play = !JOUR.play; b.textContent = JOUR.play ? "⏸ 멈춤" : "▶ 걷기"; }
      else { JOUR.day = Math.max(0, Math.min(ST.num_days - 1, JOUR.day + (k === "next" ? 1 : -1))); JOUR.play = false; bd.querySelector("button[data-jour='play']").textContent = "▶ 걷기"; }
    });
    bd.addEventListener("keydown", (e) => {
      if (!JOUR) return;
      if (e.key === "Escape") closeJourney();
      if (e.key === "ArrowRight") { JOUR.day = Math.min(ST.num_days - 1, JOUR.day + 1); JOUR.play = false; }
      if (e.key === "ArrowLeft") { JOUR.day = Math.max(0, JOUR.day - 1); JOUR.play = false; }
    });
    bd.querySelector("#jourCanvas").addEventListener("wheel", (e) => {
      if (!JOUR) return; e.preventDefault();
      JOUR.day = Math.max(0, Math.min(ST.num_days - 1, JOUR.day + Math.sign(e.deltaY))); JOUR.play = false;
    }, { passive: false });
  }
  bd.classList.add("show");
  bd.querySelector("button[data-jour='play']").textContent = "▶ 걷기";
  const s = ST.staff.find(x => x.id === sid);
  document.getElementById("jourTitle").textContent = `${sid} · ${s ? `${s.role} Lv${s.level}` : ""} — ${ST.year}년 ${ST.month}월의 여정`;
  const first = bd.querySelector("button[data-jour='next']");
  if (first) first.focus();
  cancelAnimationFrame(JOUR.raf);
  JOUR.raf = requestAnimationFrame(drawJourney);
}
function closeJourney() {
  const bd = document.getElementById("jourModalBackdrop");
  if (bd) bd.classList.remove("show");
  if (JOUR) cancelAnimationFrame(JOUR.raf);
  JOUR = null;
}
function drawJourney(now) {
  if (!JOUR || !ST) return;
  const cv = document.getElementById("jourCanvas"), ctx = cv.getContext("2d");
  const W = Math.max(280, cv.parentElement.clientWidth || 600), H = Math.max(220, Math.min(420, Math.round(W * 0.56)));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px"; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const row = ST.grid[JOUR.sid] || [], nd = ST.num_days;
  if (JOUR.play && now - JOUR.last > 1500) { JOUR.last = now; JOUR.day = (JOUR.day + 1) % nd; }
  JOUR.pos += (JOUR.day - JOUR.pos) * .1;
  const pos = JOUR.pos, colW = Math.min(170, W * .3), cx = W * .42;
  const k = Math.max(0, Math.min(nd - 1, Math.round(pos))), sky = jourSky(row[k]);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const night = row[k] === "N" || row[k] === "NK";
  for (let s = 0; s < 60; s++) { ctx.fillStyle = `rgba(255,255,255,${(night ? .8 : .08) * (0.3 + 0.7 * jourRnd(s + 9))})`; ctx.fillRect(((jourRnd(s) * W * 2 - pos * 30) % W + W) % W, jourRnd(s + 1) * H * .5, 1.5, 1.5); }
  const ground = H * .72;
  const hill = x => { const t = (x - cx) / colW + pos; return ground + Math.sin(t * 1.7) * 10 + Math.sin(t * .6) * 16; };
  ctx.fillStyle = "rgba(10,14,24,.85)"; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 8) ctx.lineTo(x, hill(x)); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  ctx.textAlign = "center";
  for (let d = 0; d < nd; d++) {
    const x = cx + (d - pos) * colW; if (x < -colW || x > W + colW) continue;
    const code = row[d], near = Math.max(0, 1 - Math.abs(d - pos)), yg = hill(x), yy = H * .22;
    if (code === "D") { ctx.fillStyle = "#fde68a"; ctx.shadowBlur = 30; ctx.shadowColor = "#fde68a"; ctx.beginPath(); ctx.arc(x, yy, 20, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    else if (code === "E") { ctx.fillStyle = "#fb923c"; ctx.shadowBlur = 30; ctx.shadowColor = "#fb923c"; ctx.beginPath(); ctx.arc(x, yy + 48, 20, Math.PI, 0); ctx.fill(); ctx.shadowBlur = 0; }
    else if (code === "N" || code === "NK") { ctx.fillStyle = "#e5e7eb"; ctx.shadowBlur = 24; ctx.shadowColor = "#c7d2fe"; ctx.beginPath(); ctx.arc(x, yy, 17, 0, 7); ctx.fill(); ctx.fillStyle = jourSky(code)[0]; ctx.beginPath(); ctx.arc(x + 7, yy - 3, 15, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    else if (isWorkCode(code)) { ctx.fillStyle = "#fef3c7"; ctx.shadowBlur = 16; ctx.shadowColor = "#fde68a"; ctx.beginPath(); ctx.arc(x, yy + 8, 14, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    else { ctx.fillStyle = "rgba(255,255,255,.75)"; for (let q = 0; q < 3; q++) { ctx.beginPath(); ctx.arc(x - 14 + q * 14, yy + 6 - (q % 2) * 8, 12, 0, 7); ctx.fill(); } }
    ctx.strokeStyle = `rgba(255,255,255,${.25 + .5 * near})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, yg); ctx.lineTo(x, yg - 32 - 24 * near); ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${.5 + .5 * near})`; ctx.font = `300 ${14 + 14 * near}px Georgia, "Noto Serif KR", serif`; ctx.fillText(`${d + 1}`, x, yg - 40 - 24 * near);
    ctx.fillStyle = JOUR_C[code] || (isWorkCode(code) ? "#e5e7eb" : "#94a3b8"); ctx.font = `600 ${11 + 3 * near}px system-ui, sans-serif`; ctx.fillText(JOUR_NAME[code] || code || "", x, yg + 18);
    if (ST.days[d].weekend) { ctx.fillStyle = "rgba(252,165,165,.9)"; ctx.font = "10px system-ui, sans-serif"; ctx.fillText("주말", x, yg + 32); }
  }
  // 걷는 사람
  const gy = hill(cx);
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, gy - 22 + Math.sin(now / 250) * 2, 6, 0, 7); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, gy - 16); ctx.lineTo(cx, gy + 1); ctx.moveTo(cx, gy + 1); ctx.lineTo(cx - 6 + Math.sin(now / 250) * 5, gy + 13); ctx.moveTo(cx, gy + 1); ctx.lineTo(cx + 6 - Math.sin(now / 250) * 5, gy + 13); ctx.stroke();
  // 카드 — '이 칸은 왜'와 같은 판정
  if (JOUR.cardDay !== JOUR.day) {
    JOUR.cardDay = JOUR.day;
    const code = row[JOUR.day], why = explainCell(JOUR.sid, JOUR.day).lines;
    const nights = row.filter(v => v === "N" || v === "NK").length, wk = row.filter((v, d) => isWorkCode(v) && ST.days[d].weekend).length, offs = row.filter(v => v === "OFF").length;
    document.getElementById("jourCard").innerHTML =
      `<div class="jour-day">${JOUR.day + 1}일 <span style="color:${JOUR_C[code] || "#e5e7eb"}">${esc(JOUR_NAME[code] || code || "—")}</span>${ST.days[JOUR.day].weekend ? ' <small>주말·공휴일</small>' : ""}</div>` +
      `<div class="jour-why">${why.length ? why.map(esc).join("<br>") : "입력에서 정해진 칸이거나 쉬는 날입니다."}</div>` +
      `<div class="jour-sum">이달 밤 ${nights}회 · 주말 ${wk}일 · 쉼 ${offs}일</div>`;
  }
  JOUR.raf = requestAnimationFrame(drawJourney);
}

// ================================================================ 월간 보고(파트장용, 실험 기능)
// 확정 뒤 파트장이 받는 한 장짜리 보고서 — 화면 오른쪽 패널에 흩어진 것(검증·일별 인원·주말 명단·사람별
// 집계·부담·원티드·고정 칸·야간 분포·점수표·로그)을 한 파일에 모아 인쇄·전달할 수 있게. 숫자는 전부
// 화면과 같은 계산(burdenOf·dutyColumns·report)이라 따로 맞춰 볼 필요가 없다. 파일 하나(HTML)라 카톡으로
// 보내도 열리고, 브라우저에서 인쇄하면 PDF가 된다. 실험 기능이라 패널 맨 아래 작은 글씨로만 연다.
function magazineHtml(trace) {
  const r = ST.report || {}, days = ST.days, nd = ST.num_days;
  const row = s => ST.grid[s.id] || [];
  const holCount = days.filter(d => d.weekend).length;
  const maxC = (ST.params_summary && ST.params_summary.max_consecutive_work) || 5;
  const dutyCols = dutyColumns().filter(c => c !== "OFF");   // OFF는 뒤에 따로 센다
  const people = ST.staff.filter(s => !s.is_partjang);
  const generals = people.filter(s => !s.is_nk);
  const nightPool = generals.filter(s => (s.allowed || []).includes("N"));
  const att = ST.attempt_table || [], chosen = att.find(a => a.chosen);
  const hardAll = r.hard || [], strict = hardAll.filter(v => !v.best_effort), bestEffort = hardAll.filter(v => v.best_effort);
  const lockedList = (ST.locked || []).map(k => { const [sid, d] = k.split(":"); return { sid, d: Number(d), v: (ST.grid[sid] || [])[Number(d)] }; }).sort((a, b) => a.d - b.d || a.sid.localeCompare(b.sid));
  const stats = people.map(s => {
    const rw = row(s), b = burdenOf(s, rw), cnt = {};
    for (const c of dutyCols) cnt[c] = rw.filter(v => v === c).length;
    const offCnt = rw.filter(v => v === "OFF").length, work = rw.filter(v => isWorkCode(v)).length;
    const offBefore = s.off_balance || 0, offAfter = Math.round((offBefore + holCount - offCnt) * 100) / 100;
    const pp = (r.per_person || []).find(x => x.id === s.id) || {};
    return { s, rw, b, cnt, offCnt, work, offBefore, offAfter, offOk: pp.off_ok !== false };
    });
  const mean = (arr, f) => arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : 0;
  const wkMean = mean(stats.filter(x => !x.s.is_nk), x => x.b.weekend);
  const td = (v, cls) => `<td${cls ? ` class="${cls}"` : ""}>${v}</td>`;
  const dayLabel = d => `${days[d].n}일(${days[d].dow})`;
  // --- 머리
  const wardLabel = ST.ward_id ? `${esc(ST.ward_id)} ` : "";
  const head = `<div class="kicker">${wardLabel}월간 근무 보고 · 파트장용</div><h1>${ST.year}년 ${ST.month}월</h1>
    <p class="lead">전체 ${ST.staff.length}명 — 일반 ${generals.length}·야간전담 ${people.length - generals.length}·파트장 ${ST.staff.length - people.length}${(ST.team_b || []).length ? `·신입(B팀) ${ST.team_b.length}` : ""}. ${ST.round ? `${ST.round}회차` : "첫 생성"}${chosen ? `, 시드 ${chosen.seed}${chosen.strategy && chosen.strategy !== "-" ? `(${chosen.strategy})` : ""} 선택(${att.length}개 시드 중)` : ""}. 보고서 작성 ${new Date().toLocaleString("ko-KR")} — 근무표를 만든 시각이 아니라 이 문서를 받은 시각.</p>`;
  const numsHtml = `<h3 class="nums-h">운영 지표</h3><div class="nums">
      <div class="num ${strict.length ? "bad" : "good"}"><b>${strict.length}</b><span>필수 위반</span></div>
      <div class="num ${bestEffort.length ? "warn" : ""}"><b>${bestEffort.length}</b><span>추가 검토(최선노력)</span></div>
      <div class="num ${r.bad_days_count ? "bad" : "good"}"><b>${r.bad_days_count || 0}</b><span>최소인력 미달 날</span></div>
      <div class="num"><b>${(r.requests && r.requests.total) ? `${r.requests.accepted}/${r.requests.total}` : "–"}</b><span>원티드 반영</span></div>
      <div class="num"><b>${lockedList.length}</b><span>손본(고정) 칸</span></div>
      <div class="num"><b>${mean(nightPool.map(s => stats.find(x => x.s === s)), x => x.b.nights).toFixed(1)}</b><span>1인 평균 밤(일반)</span></div>
      <div class="num"><b>${wkMean.toFixed(1)}</b><span>1인 평균 주말·공휴일</span></div>
      <div class="num"><b>${mean(stats.filter(x => !x.s.is_nk), x => x.offCnt).toFixed(1)}</b><span>1인 평균 OFF (허용 ${r.off_range ? `${r.off_range.lower}~${r.off_range.upper}` : "–"})</span></div>
    </div>`;
  const colors = { D: "#93c5fd", E: "#fdba74", N: "#c4b5fd", NK: "#f9a8d4", OFF: "#eeeeee", prn: "#86efac", "8A": "#d1d5db", "S/": "#99f6e4" };
  const cs = 1000 / nd, rh = Math.max(4, Math.min(8, 240 / ST.staff.length));
  const svg = `<svg viewBox="0 0 1000 ${(rh * ST.staff.length).toFixed(0)}" width="100%" style="display:block;margin:8px 0 2px">` + ST.staff.map((s, i) => row(s).map((v, d) => v ? `<rect x="${(d * cs + .5).toFixed(1)}" y="${(i * rh).toFixed(1)}" width="${(cs - 1).toFixed(1)}" height="${(rh - 1).toFixed(1)}" fill="${colors[v] || (isWorkCode(v) ? "#a3a3a3" : "#f5f5f4")}"/>` : "").join("")).join("") + "</svg>";
  // --- 0 이번 달 요약 — 첫 장에서 "지금 검토해야 하는가 → 어디를 보나 → 다음 행동"이 끝나게(10/30 GPT 검토 M01·M02).
  // 숫자의 출처는 1절(위반 목록)·2절(일별 인원)·6절(원티드)·5절(부담)과 같은 r·stats다 — 따로 세지 않는다.
  const strictDays = [...new Set(strict.filter(v => v.day).map(v => v.day))].sort((a, b) => a - b);
  const shortDays = (r.daily || []).filter(x => x.ok === false).map(x => x.day).filter(Boolean);
  const reqTot = (r.requests && r.requests.total) || 0, reqAcc = (r.requests && r.requests.accepted) || 0;
  const ACTION = { "H1-1": "최소인력 미달 — 2절 일별 인원에서 그날 그 근무의 칸을 채우거나 기준을 확인", "H1-5": "조에 숙련도 4 이상이 없음 — 그날 Lv4+(밤은 야간리더)를 배치하거나 생성 전 하한 안내 확인",
    "H1-6": "지정 가능자 부족 — 그날 지정 가능자가 근무하도록 조정", "H2-4": "하루짜리 야간 — 블록(2~3일)으로 묶기", "H2-5": "야간 뒤 휴식 부족 — 블록 뒤 이틀을 비우기", "H3-1": "연속근무 초과 — 블록 사이 OFF", "H3-2": "E 다음날 D — 이음새 바꾸기", "H6-3": "E→OFF→D — 이음새 바꾸기" };
  const ruleLabel = rule => ACTION[rule] || "1절의 내용대로 그 칸을 확인";
  const grouped = [];
  for (const v of strict) {
    const k = `${v.day}|${v.rule}`; let g = grouped.find(x => x.k === k);
    if (!g) grouped.push(g = { k, day: v.day, rule: v.rule, n: 0, who: [] });
    g.n++; if (v.staff_id && !g.who.includes(v.staff_id)) g.who.push(v.staff_id);
  }
  grouped.sort((a, b) => (a.day || 0) - (b.day || 0) || a.rule.localeCompare(b.rule));
  const actRows = grouped.slice(0, 8).map(g => `<tr><td class="w">${g.day ? `${g.day}일` : "월 전체"} · ${esc(g.rule)}${g.n > 1 ? ` ×${g.n}` : ""}</td><td class="a">${esc(ruleLabel(g.rule))}${g.who.length ? ` <span class="sub">(${g.who.slice(0, 3).map(esc).join(", ")}${g.who.length > 3 ? ` 외 ${g.who.length - 3}` : ""})</span>` : ""}</td></tr>`).join("");
  const histBars = (vals, label) => { const c = {}; for (const v of vals) c[v] = (c[v] || 0) + 1; const keys = Object.keys(c).map(Number).sort((a, b) => a - b); const mx = Math.max(1, ...keys.map(k => c[k]));
    return keys.length ? `<div class="dist"><b>${label}</b> <span class="sub">(${vals.length}명)</span>${keys.map(k => `<div class="row"><span class="lab">${k}회</span><div class="bar"><i style="width:${(c[k] / mx * 100).toFixed(0)}%"></i></div><span class="n">${c[k]}명</span></div>`).join("")}</div>` : ""; };
  const nightVals = nightPool.map(s => stats.find(x => x.s === s).b.nights), wkVals = generals.map(s => stats.find(x => x.s === s).b.weekend);
  const statusCls = strict.length ? "bad" : bestEffort.length ? "warn" : "ok";
  const statusTag = strict.length ? "확인 필요" : bestEffort.length ? "추가 검토" : "이상 없음";
  const statusTitle = strict.length ? `확정 전, ${strictDays.length ? `${strictDays.length}일 ` : ""}${strict.length}건을 먼저 확인하세요.`
    : bestEffort.length ? `필수 위반은 없고 추가 검토 ${bestEffort.length}건만 남았습니다.` : "검사 범위 안에서 위반이 없습니다.";
  const statusSub = strict.length ? grouped.slice(0, 3).map(g => `${g.day ? `${g.day}일 ` : ""}${g.rule}${g.n > 1 ? `×${g.n}` : ""}`).join(" · ") + (grouped.length > 3 ? ` 외 ${grouped.length - 3}` : "")
    : "'이상 없음'은 이 앱에 설정된 규칙 검사의 결과이고, 최종 검토는 파트장이 합니다.";
  const sec0 = `<h2 id="s0">0. 이번 달 요약</h2><div class="brief">
    <div class="status ${statusCls}"><span class="tag">${statusTag}</span><div><b class="t">${statusTitle}</b><span class="sub">${esc(statusSub)}</span></div></div>
    <div class="kp">
      <div><b class="${strict.length ? "bad" : "good"}">${strict.length}<span> 건</span></b><span>필수 검토</span><small>${strictDays.length ? `영향 날짜 ${strictDays.length}일` : "영향 날짜 없음"}</small></div>
      <div><b class="${shortDays.length ? "bad" : "good"}">${shortDays.length}<span> 일</span></b><span>최소인력 미달</span><small>${shortDays.length ? shortDays.slice(0, 4).map(d => `${d}일`).join("·") + (shortDays.length > 4 ? " 외" : "") : "모든 날 충족"}</small></div>
      <div><b>${reqTot ? Math.round(reqAcc / reqTot * 100) : "–"}<span>${reqTot ? " %" : ""}</span></b><span>원티드 반영</span><small>${reqTot ? `${reqAcc} / ${reqTot}건 · 미반영 ${reqTot - reqAcc}건` : "신청 없음"}</small></div>
      <div><b class="${bestEffort.length ? "warn" : "good"}">${bestEffort.length}<span> 건</span></b><span>추가 검토</span><small>${bestEffort.length ? [...new Set(bestEffort.map(v => v.rule))].slice(0, 3).join("·") : "없음"}</small></div>
    </div>
    <div class="two"><div><h3>지금 확인할 항목</h3>${actRows ? `<table class="act">${actRows}</table>${grouped.length > 8 ? `<p class="sub">외 ${grouped.length - 8}건 — 1절 전체 목록</p>` : ""}` : `<p class="sub">필수 항목 없음.${bestEffort.length ? " 추가 검토는 1절 노란 표." : ""}</p>`}<p class="sub">판정은 현재 규칙 검사 결과입니다. 최종 검토는 파트장이 합니다.</p></div>
    <div><h3>부담 분포</h3>${histBars(nightVals, "야간 횟수")}${histBars(wkVals, "주말·공휴일 근무")}<p class="sub">파트장·야간전담 제외. 가능근무·전입 조건이 다른 사람은 5절에서 집단별로.</p></div></div>
    <div class="one">원티드 ${reqTot ? `${reqTot}건 중 ${reqAcc}건을 반영했습니다` : "신청이 없었습니다"}. ${strict.length ? `필수 ${strict.length}건(${strictDays.length}일)을 확인한 뒤 결과를 다시 보세요.` : bestEffort.length ? `필수 위반 없이 추가 검토 ${bestEffort.length}건만 남았습니다.` : "필수·추가 검토 모두 없습니다."}
      <span class="sub">전월 비교: ${(ST.prev_burden && Object.keys(ST.prev_burden).length) ? "입력② 이력 기준(5절)" : "자료 없음"} · 검토자: 미기록 · 기준: 화면 연월·근무인력 설정, ${ST.round ? `${ST.round}회차` : "첫 생성"}</span></div>
  </div>${numsHtml}${svg}<p class="sub">표 한눈에 — 파랑 D, 주황 E, 보라 N, 분홍 NK, 초록 prn, 흰 OFF. 위에서부터 명단 순.</p>`;
  // --- 1 확인할 것
  const vRow = v => `<tr>${td(v.day ? `${v.day}일` : "")}${td(esc(v.rule))}${td(esc(v.staff_id || ""))}${td(esc(v.message))}</tr>`;
  const sec1 = `<h2>1. 확인할 것</h2>
    ${strict.length ? `<p class="bad">필수 위반 ${strict.length}건 — 이대로 확정하면 그날 병동이 규칙대로 돌아가지 않는다.</p><table class="t"><tr><th>날</th><th>규칙</th><th>사람</th><th>내용</th></tr>${strict.map(vRow).join("")}</table>` : `<p class="good">필수 위반 없음.</p>`}
    ${bestEffort.length ? `<p>추가 검토 ${bestEffort.length}건 — 최선노력 규칙(${BEST_EFFORT_NAMES}). 원칙이지만 인원 사정상 못 맞출 수 있는 항목. 조의 숙련도(H1-5)는 여기 아니라 위 필수에 든다.</p><table class="t small"><tr><th>날</th><th>규칙</th><th>사람</th><th>내용</th></tr>${bestEffort.map(vRow).join("")}</table>` : ""}
    ${(r.soft || []).length ? `<p class="sub">권장 사항 ${r.soft.length}건은 생략(화면 결과창 참고).</p>` : ""}`;
  // --- 2 일별 인원 — 화면 맨 아래 '날짜별 인원' 줄과 같은 구성(dailyDutyRowSpecs)·같은 판정(dutyNeedState).
  // 예전엔 D·E·N·prn 합계 넷에 Lv4+를 "1·3·2"처럼 한 칸에 붙여 적어서, 근무 코드별 인원이 아니라
  // 그날의 레벨 구성이 적힌 것처럼 읽혔다(파트장 지적). 코드마다 한 줄, Lv4+는 조마다 한 줄로 푼다.
  const specs = dailyDutyRowSpecs(), dutyVals = computeDailyDutyRows(specs);
  const dayHead = `<tr><th></th>${days.map(d => `<th class="${d.weekend ? "we" : ""}">${d.n}<br>${d.dow}</th>`).join("")}</tr>`;
  let otherSeen = false;
  const dutyRowsHtml = specs.map((sp, i) => {
    const sep = sp.kind === "other" && !otherSeen; if (sp.kind === "other") otherSeen = true;
    const cls = [sp.kind === "other" ? "other" : "", sp.kind === "total" || sp.kind === "designated" ? "tot" : "", sep ? "sep" : ""].filter(Boolean).join(" ");
    return `<tr${cls ? ` class="${cls}"` : ""}><th>${esc(sp.label)}</th>${dutyVals[i].map((c, d) => {
      const stt = dutyNeedState(sp, d, c), we = days[d].weekend ? "we " : "";
      if (stt.need === null) return `<td class="${we}">${c ? c : ""}</td>`;
      return `<td class="${we}${stt.short ? "bad" : stt.over ? "over" : ""}">${c}<span class="sub">/${stt.need}</span></td>`;
    }).join("")}</tr>`;
  }).join("");
  const lvFlags = computeDailyLevelStats();
  const lvRow = (k, name) => `<tr class="lv${k === "D" ? " lv1" : ""}"><th>Lv4+ ${name}</th>${days.map((d, i) => {
    const n = people.filter(s => s.level >= 4 && (row(s)[i] === k || (k === "N" && row(s)[i] === "NK"))).length;
    return `<td class="${d.weekend ? "we " : ""}${lvFlags[i].short[k] ? "bad" : ""}">${n}</td>`;
  }).join("")}</tr>`;
  const sec2 = `<h2>2. 날짜별 근무인력 — 듀티별</h2><table class="t tiny">${dayHead}${dutyRowsHtml}
    ${lvRow("D", "D조")}${lvRow("E", "E조")}${lvRow("N", "N조")}</table>
    <p class="sub">코드마다 그날 그 코드인 사람 수(파트장 제외). "인원/기준"이 적힌 줄에 최소인력이 걸린다 — 빨강 미달, 노랑 초과.
    밤은 N+NK 줄(야간전담이 없으면 N 줄), prn은 prn 합계 줄(반일 0.5명). 점선 아래는 최소인력에 안 세는 코드.
    마지막 세 줄은 그날 그 조에 선 Lv4 이상 수 — 빨강이면 그 조에 고연차가 없다(H1-5, 밤은 야간리더가 서면 충족).</p>`;
  // --- 3 주말·공휴일 근무자
  const weRows = days.map((d, i) => ({ d, i })).filter(x => x.d.weekend).map(({ d, i }) => { const who = k => people.filter(s => row(s)[i] === k || (k === "N" && row(s)[i] === "NK")).map(s => esc(s.id)).join(", "); return `<tr>${td(dayLabel(i))}${td(who("D"))}${td(who("E"))}${td(who("N"))}</tr>`; }).join("");
  const sec3 = weRows ? `<h2>3. 주말·공휴일 근무자</h2><table class="t small"><tr><th>날</th><th>D</th><th>E</th><th>N·NK</th></tr>${weRows}</table>` : "";
  // --- 4 사람별 집계
  const sec4 = `<h2>4. 사람별 집계</h2><table class="t small"><tr><th>이름</th><th>직급·Lv</th>${dutyCols.map(c => `<th>${esc(c)}</th>`).join("")}<th>근무</th><th>OFF</th><th>잔휴 전월→이후</th><th>주말</th><th>최장 연속</th><th>야간/목표</th></tr>
    ${stats.map(x => `<tr${x.s.is_nk ? ' class="nk"' : ""}><td>${esc(x.s.id)}${x.s.is_designated ? " <i>지</i>" : ""}${x.s.is_night_leader ? " <i>밤</i>" : ""}</td>${td(`${esc(x.s.role)} Lv${x.s.level}`)}${dutyCols.map(c => td(x.cnt[c] || "")).join("")}${td(x.work)}${td(x.offCnt, x.offOk ? "" : "warn")}${td(`${x.offBefore} → ${x.offAfter}`)}${td(x.b.weekend, Math.abs(x.b.weekend - wkMean) >= 2 && !x.s.is_nk ? "warn" : "")}${td(x.b.maxRun, x.b.maxRun > maxC ? "bad" : "")}${td(x.s.night_target != null ? `${x.b.nights}/${x.s.night_target}` : x.b.nights, x.s.night_target != null && x.b.nights !== x.s.night_target ? "warn" : "")}</tr>`).join("")}</table>
    <p class="sub">노랑 = 평균과 2일 이상 차이(주말), OFF 허용범위 밖, 야간 목표와 다름. 빨강 = 연속근무 ${maxC}일 초과. 잔휴는 전월 잔휴 + 이달 휴일수 − OFF.</p>`;
  // --- 5 부담 요약
  const wkTop = stats.filter(x => !x.s.is_nk && x.b.weekend - wkMean >= 2).sort((a, b) => b.b.weekend - a.b.weekend);
  const wkLow = stats.filter(x => !x.s.is_nk && wkMean - x.b.weekend >= 2).sort((a, b) => a.b.weekend - b.b.weekend);
  const nightOff = stats.filter(x => x.s.night_target != null && x.b.nights !== x.s.night_target);
  const runOver = stats.filter(x => x.b.maxRun > maxC);
  const seniors = people.filter(s => s.level >= 4), soleCnt = {};
  for (const s of seniors) soleCnt[s.id] = 0;
  for (let d = 0; d < nd; d++) for (const codes of [["D"], ["E"], ["N", "NK"]]) { const hi = seniors.filter(s => codes.includes(row(s)[d])); if (hi.length === 1) soleCnt[hi[0].id]++; }
  const soleMean = seniors.length ? Object.values(soleCnt).reduce((a, b) => a + b, 0) / seniors.length : 0;
  const soleTop = seniors.filter(s => soleCnt[s.id] - soleMean >= 2).sort((a, b) => soleCnt[b.id] - soleCnt[a.id]);
  const li = [];
  if (wkTop.length) li.push(`<li>주말·공휴일 근무 많음(평균 ${wkMean.toFixed(1)}일): ${wkTop.map(x => `<b>${esc(x.s.id)}</b> ${x.b.weekend}일`).join(", ")}</li>`);
  if (wkLow.length) li.push(`<li>주말·공휴일 근무 적음: ${wkLow.map(x => `<b>${esc(x.s.id)}</b> ${x.b.weekend}일`).join(", ")}</li>`);
  if (nightOff.length) li.push(`<li>야간이 목표와 다름: ${nightOff.map(x => `<b>${esc(x.s.id)}</b> ${x.b.nights}/${x.s.night_target}`).join(", ")}</li>`);
  if (runOver.length) li.push(`<li>연속근무 ${maxC}일 초과: ${runOver.map(x => `<b>${esc(x.s.id)}</b> ${x.b.maxRun}일`).join(", ")}</li>`);
  if (soleTop.length) li.push(`<li>혼자 Lv4+인 조에 많이 섬(고연차 평균 ${soleMean.toFixed(1)}회): ${soleTop.map(s => `<b>${esc(s.id)}</b> ${soleCnt[s.id]}회`).join(", ")}</li>`);
  const prev = ST.prev_burden || {}, prevMonth = Object.values(prev)[0] && Object.values(prev)[0].month;
  const wkUp = stats.filter(x => prev[x.s.id] && x.b.weekend - prev[x.s.id].weekend >= 2), nightUp = stats.filter(x => prev[x.s.id] && x.b.nights - prev[x.s.id].nights >= 2);
  if (wkUp.length) li.push(`<li>지난달(${esc(prevMonth)})보다 주말이 2일 이상 는 사람: ${wkUp.map(x => `<b>${esc(x.s.id)}</b> ${prev[x.s.id].weekend}→${x.b.weekend}`).join(", ")}</li>`);
  if (nightUp.length) li.push(`<li>지난달보다 야간이 2회 이상 는 사람: ${nightUp.map(x => `<b>${esc(x.s.id)}</b> ${prev[x.s.id].nights}→${x.b.nights}`).join(", ")}</li>`);
  const sec5 = `<h2>5. 부담 요약</h2>${li.length ? `<ul>${li.join("")}</ul>` : "<p class='good'>주말·야간·연속근무 어느 쪽도 눈에 띄게 쏠린 사람이 없다.</p>"}`;
  // --- 6 원티드
  const rq = r.requests || {}, rejected = rq.rejected || [];
  const sec6 = `<h2>6. 원티드</h2><p>신청 ${rq.total || 0}건 중 반영 ${rq.accepted || 0}건${rq.total ? ` (${Math.round((rq.accepted || 0) / rq.total * 100)}%)` : ""}.${rejected.length ? ` 반려 ${rejected.length}건:` : " 반려 없음."}</p>
    ${rejected.length ? `<table class="t small"><tr><th>사람</th><th>날짜</th><th>신청</th><th>사유</th></tr>${rejected.map(q => `<tr>${td(esc(q.staff_id))}${td(esc(q.date))}${td(esc(q.type))}${td(esc(q.reason || ""))}</tr>`).join("")}</table>` : ""}`;
  // --- 7 손본 칸
  const sec7 = `<h2>7. 손본(고정) 칸</h2>${lockedList.length ? `<p>${lockedList.length}칸 — 파트장이 바꿔 잠근 칸. 재생성해도 유지된다.</p><p class="small">${lockedList.map(x => `${esc(x.sid)} ${x.d + 1}일 <b>${esc(shiftText(x.v) || x.v || "빈칸")}</b>`).join(" · ")}</p>` : "<p>없음 — 엔진이 만든 그대로다.</p>"}`;
  // --- 8 야간
  const hist = (h, unit) => Object.keys(h || {}).sort((a, b) => a - b).map(k => `${k}${unit} ×${h[k]}`).join(", ") || "–";
  const endN = people.filter(s => row(s)[nd - 1] === "N" || row(s)[nd - 1] === "NK").map(s => { let k = nd - 1; while (k > 0 && (row(s)[k - 1] === "N" || row(s)[k - 1] === "NK")) k--; return `${esc(s.id)}(${nd - k}일째)`; });
  const sec8 = `<h2>8. 야간</h2><ul><li>블록 길이 분포: ${hist(r.night_block_hist, "일")}</li><li>블록 간격 분포: ${hist(r.night_gap_hist, "일")} (기준 7일)</li><li>월말 밤으로 끝나는 사람(다음 달 1일로 이어짐): ${endN.length ? endN.join(", ") : "없음"}</li><li>야간전담: ${people.filter(s => s.is_nk).map(s => `${esc(s.id)} ${stats.find(x => x.s === s).b.nights}회`).join(", ") || "없음"}</li></ul>`;
  // --- 9 시도 점수표
  const sec9 = att.length ? `<h2>9. 시도 점수표</h2><table class="t small"><tr><th>시드</th><th>운영필수</th><th>숙련도</th><th>공평성</th><th>전체 하드</th><th>횟수</th><th>주말</th><th>조구성</th><th>단독</th><th>미반영</th></tr>${att.map(a => `<tr${a.chosen ? ' class="chosen"' : ""}>${td(`${a.seed}${a.chosen ? " ✓" : ""}`)}${td(a.blocking)}${td(a.h15)}${td(`<b>${a.fairness}</b>`)}${td(a.hard)}${td(a.count ?? "–")}${td(a.weekend ?? "–")}${td(a.mix ?? "–")}${td(a.sole ?? "–")}${td(a.wanted ?? "–")}</tr>`).join("")}</table><p class="sub">앞 열부터 견줘 다르면 뒤 열은 보지 않는다(운영 필수 → 숙련도 → 공평성 → 전체 하드). 공평성 = 2×횟수 + 주말 + 조구성 + 단독 + 미반영(낮을수록 고름) — 뒤 다섯 열이 그 구성이다.</p>` : "";
  // --- 10 처리 기록
  const logs = (r.logs || []).filter(l => /\[수리\]|\[균등\]|\[보완\]|\[H2-9\]|\[H5-2\]|\[H1-1\]|\[전입\]/.test(l)).slice(0, 25);
  const sec10 = `<h2>10. 처리 기록(발췌)</h2>${logs.length ? `<pre class="log">${logs.map(esc).join("\n")}</pre>` : "<p>수리·균등 기록 없음.</p>"}<p class="sub">전체 ${(r.logs || []).length}건은 화면 결과창 '처리 로그'에.</p>`;
  // --- 11 시각화 — 여정(클로드 개념 I)·비(클로드 갤러리 II)·한 달의 궤도(지피티 01-04)를 이달 표로, 그리고
  // /api/trace가 준 '서치 과정'(단계별 칸 쓰기)을 재생한다. 기록이 없으면(실패) 완성표만 그린다.
  // 화면용(캔버스)이라 인쇄에는 안 나온다. 데이터는 명단·날짜·표·기록뿐이고, 그리는 코드는 아래 한 덩어리.
  const vizCode = v => v === "OFF" ? "/" : v === "prn" ? "p" : (v || "");
  const vizData = JSON.stringify({
    year: ST.year, month: ST.month,
    staff: people.map(s => ({ id: s.id, level: s.level || 1, nk: !!s.is_nk, partjang: false })),
    days: days.map(d => ({ n: d.n, dow: d.dow, weekend: !!d.weekend })),
    grid: Object.fromEntries(people.map(s => [s.id, row(s).map(vizCode)])),
    min: { D: days.map(d => (d.min || {}).D ?? 0), E: days.map(d => (d.min || {}).E ?? 0), N: days.map(d => (d.min || {}).N ?? 0) },
    trace: trace && trace.events ? { staff: trace.staff, events: trace.events, stages: trace.stages, final: trace.final, seed: trace.seed } : null,
  }).replace(/<\//g, "<\\/");
  const transport = `<div class="viz-tr"><button data-tr="first" title="처음">⏮</button><button data-tr="prev" title="이전 단계">◀</button><button class="big" data-tr="play">▶ 재생</button><button data-tr="next" title="다음 단계">▶</button><label>속도 <input type="range" data-tr="speed" min="1" max="60" value="14"></label><span class="viz-stage"></span><span class="viz-kpi"></span><div class="viz-bar"><i></i></div></div>`;
  const sec11 = `<h2 class="viz-h">11. 시각화 <span class="sub">(화면용 — 인쇄에는 안 나옴${trace && trace.events ? `. 시드 ${trace.seed}의 생성 과정 ${trace.events.length}단계 쓰기를 재생` : ". 생성 기록을 못 받아 완성표만 그림"})</span></h2>
    <div class="viz" id="viz">
    <section class="vizb" id="viz-jour"><h3>여정 — 한 사람의 한 달</h3><div class="viz-ctl"><label>사람 <select id="vzWho"></select></label><button id="vzPrev">◀</button><button id="vzPlay">▶ 걷기</button><button id="vzNext">▶</button><button class="viz-open" data-open="viz-jour">↗ 새 창에서 크게</button><span class="sub">←→·휠로 날짜. 해는 낮, 노을은 저녁, 달은 밤. 카드에 그 칸이 어느 단계에서 왜 놓였는지.</span></div><canvas id="vzJour"></canvas><div class="viz-card" id="vzCard"></div></section>
    <section class="vizb" id="viz-rain"><h3>비 — 근무 글자가 떨어져 제자리에</h3><div class="viz-ctl"><button class="viz-open" data-open="viz-rain">↗ 새 창에서 크게</button><span class="sub">위에서부터 명단 순, 왼쪽부터 1일. 엔진이 칸을 놓는 순서대로 글자가 내려앉고, 아직 빈 칸 위로는 글자 비가 내린다.</span></div>${transport}<canvas id="vzRain"></canvas></section>
    <section class="vizb" id="viz-orb"><h3>한 달의 궤도</h3><div class="viz-ctl"><button class="viz-open" data-open="viz-orb">↗ 새 창에서 크게</button><span class="sub">안쪽부터 명단 순 · 시계 방향 = 1~${nd}일 · 원호 색 = 근무(파랑 D·주황 E·보라 N·분홍 NK·초록 prn·회색 쉼). 가운데는 채운 비율, 바늘은 진행, 반짝임은 방금 놓인 칸.</span></div>${transport}<canvas id="vzOrb"></canvas></section>
    </div>
    <script id="vizData" type="application/json">${vizData}</script>
    <script id="vizSrc" type="text/plain">${magazineVizScript()}</script>
    <script>new Function(document.getElementById("vizSrc").textContent)();</script>`;
  // --- 목차 — 맨 위에서 절로 바로 가는 링크. 절 제목(<h2>N. …)에 id를 붙이고, 같은 제목으로 목차를 만든다.
  const body = [sec0, sec1, sec2, sec3, sec4, sec5, sec6, sec7, sec8, sec9, sec10, sec11].join("")
    .replace(/<h2>(\d+)\. /g, '<h2 id="s$1">$1. ');
  const tocItems = [...body.matchAll(/<h2 id="s(\d+)">\d+\. ([^<]+)/g)].map(m => `<a href="#s${m[1]}"><b>${m[1]}</b> ${m[2].trim()}</a>`);
  tocItems.push(`<a href="#viz-jour" class="vz"><b>▶</b> 여정</a>`, `<a href="#viz-rain" class="vz"><b>▶</b> 비</a>`, `<a href="#viz-orb" class="vz"><b>▶</b> 궤도</a>`);
  // 목차는 sticky로 고정한다. sticky를 못 하는 브라우저(일부 인앱 브라우저)를 위해 스크롤로 자리를
  // 지나면 fixed로 바꾸는 보강을 둔다 — 자리표시자가 높이를 지켜 본문이 튀지 않는다.
  const toc = `<div class="toc-ph" id="tocPh"></div><nav class="toc" id="toc">${tocItems.join("")}</nav>
<script>(function(){var t=document.getElementById("toc"),ph=document.getElementById("tocPh");if(!t)return;var top0=null;
function chk(){var r=ph.getBoundingClientRect();if(top0===null){top0=t.offsetTop}var st=window.pageYOffset||document.documentElement.scrollTop;var on=st>top0;if(on&&!t.classList.contains("pinned")){ph.style.height=t.offsetHeight+"px";ph.classList.add("on");t.classList.add("pinned")}else if(!on&&t.classList.contains("pinned")){t.classList.remove("pinned");ph.classList.remove("on")}}
var sup=(window.CSS&&CSS.supports&&(CSS.supports("position","sticky")||CSS.supports("position","-webkit-sticky")));if(!sup){window.addEventListener("scroll",chk,{passive:true});chk()}})();</script>`;
  // --- 표 한눈에(모자이크)
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${wardLabel}${ST.year}년 ${ST.month}월 월간 근무 보고</title>
<style>body{margin:0;background:#f3f4f6;color:#111827;font-family:"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;font-size:14px;line-height:1.55}
.pg{max-width:1040px;margin:24px auto 60px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.12);padding:36px 44px}
.kicker{letter-spacing:.2em;font-size:11px;color:#6b7280}h1{font-size:34px;margin:2px 0 6px}h2{font-size:16px;margin:28px 0 8px;padding-top:8px;border-top:2px solid #111827}.lead{margin:0 0 10px;color:#374151}
.nums{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}.num{border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px}.num b{display:block;font-size:24px}.num span{font-size:11px;color:#6b7280}.num.bad b{color:#dc2626}.num.good b{color:#16a34a}.num.warn b{color:#ca8a04}
table.t{border-collapse:collapse;width:100%;margin:6px 0 4px}table.t th,table.t td{border:1px solid #e5e7eb;padding:4px 6px;text-align:left;vertical-align:top}table.t th{background:#f9fafb;font-weight:600}table.t.small{font-size:12px}table.t.tiny{font-size:10.5px}table.t.tiny td,table.t.tiny th{padding:3px 2px;text-align:center;white-space:nowrap}
td.bad{background:#fee2e2;color:#991b1b;font-weight:700}td.warn{background:#fef9c3}td.over{background:#fef3c7}
tr.sep th,tr.sep td{border-top:2px dashed #9ca3af}tr.tot th,tr.tot td{border-top:1.5px solid #6b7280}tr.other th{color:#6b7280;font-weight:500}tr.lv th{color:#5b21b6}tr.lv1 th,tr.lv1 td{border-top:2px solid #111827}td.we,th.we{background:#fff1f2}td.we.bad{background:#fee2e2}td.we.over{background:#fef3c7}td.we.warn{background:#fef9c3}tr.nk td{color:#6b21a8}tr.chosen td{background:#ecfdf5}
.bad{color:#dc2626;font-weight:600}.good{color:#16a34a}.sub{color:#6b7280;font-size:11px}.small{font-size:12px}i{font-style:normal;font-size:10px;color:#7c3aed;border:1px solid #c4b5fd;border-radius:3px;padding:0 3px}
ul{margin:6px 0;padding-left:18px}li{margin:3px 0}pre.log{font-size:11px;background:#f9fafb;border:1px solid #e5e7eb;padding:8px;white-space:pre-wrap;line-height:1.5}
.foot{margin-top:28px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:8px}.nums-h{margin:14px 0 4px;font-size:13px;color:#374151}
.brief{border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;margin:10px 0 6px;background:#fafafa}.brief .status{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}.brief .status .tag{flex:0 0 auto;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700}.brief .status.bad .tag{background:#fee2e2;color:#991b1b}.brief .status.ok .tag{background:#dcfce7;color:#166534}.brief .status.warn .tag{background:#fef9c3;color:#854d0e}.brief .status b.t{display:block;font-size:17px}.brief .status .sub{display:block;margin-top:2px}
.brief .kp{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}.brief .kp div{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px}.brief .kp b{display:block;font-size:22px}.brief .kp b.bad{color:#dc2626}.brief .kp b.good{color:#16a34a}.brief .kp b.warn{color:#ca8a04}.brief .kp span{font-size:11px;color:#6b7280}.brief .kp small{display:block;font-size:11px;color:#374151;margin-top:2px}
.brief .two{display:grid;grid-template-columns:3fr 2fr;gap:12px;margin-top:6px}.brief h3{margin:4px 0 6px;font-size:14px}.brief table.act{width:100%;border-collapse:collapse}.brief table.act td{padding:5px 6px;border-top:1px solid #eee;vertical-align:top;font-size:12.5px}.brief table.act td.w{white-space:nowrap;color:#991b1b;font-weight:600}.brief table.act td.a{color:#374151}
.brief .dist{font-size:12px}.brief .dist .row{display:grid;grid-template-columns:34px 1fr 40px;gap:6px;align-items:center;margin:3px 0}.brief .dist .bar{height:12px;background:#e5e7eb;border-radius:999px;overflow:hidden}.brief .dist .bar i{display:block;height:100%;background:#0f6e6b;border-radius:999px}.brief .dist .lab{color:#374151}.brief .dist .n{text-align:right;color:#374151}
.brief .one{margin:10px 0 0;padding:10px 12px;background:#ecfdf5;border-radius:8px;font-size:13px}.brief .one .sub{display:block;margin-top:4px}
@media (max-width:640px){.pg{padding:16px 14px;margin:0}.nums,.brief .kp{grid-template-columns:repeat(2,1fr)}.brief .two{grid-template-columns:1fr}h1{font-size:26px}table.t.tiny{font-size:10px}}
.toc{position:-webkit-sticky;position:sticky;top:0;z-index:5;background:#fff;display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;white-space:nowrap;padding:8px 0;margin:8px 0 6px;border-bottom:1px solid #e5e7eb;scrollbar-width:thin}.toc a{flex:0 0 auto;text-decoration:none;color:#111827;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:999px;padding:4px 11px;font-size:12px}.toc a b{color:#0f6e6b;margin-right:3px}.toc a:hover{border-color:#0f6e6b;color:#0f6e6b}.toc.pinned{position:fixed;left:0;right:0;padding-left:16px;padding-right:16px;box-shadow:0 2px 8px rgba(0,0,0,.08)}.toc-ph{display:none}.toc-ph.on{display:block}.toc a.vz{background:#0b1020;color:#fff;border-color:#0b1020}.toc a.vz b{color:#4ade80}h2,.vizb{scroll-margin-top:56px}
.viz-open{margin-left:auto;background:#fff!important;color:#000!important;font-weight:700}
.vizb{margin:0 0 18px;padding-top:4px}.vizb h3{margin:0 0 8px;font-family:Georgia,"Noto Serif KR",serif;font-weight:300;font-size:20px;letter-spacing:.04em;color:#fff}
.viz-tr{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 8px;font-size:12px}.viz-tr button.big{background:#fff;color:#000;font-weight:700}.viz-tr label{color:#9aa3b2;display:flex;gap:6px;align-items:center}.viz-tr input[type=range]{width:110px;accent-color:#fff}.viz-stage{color:#fff;font-family:Georgia,serif;font-size:14px}.viz-kpi{color:#9aa3b2;font-size:11px;letter-spacing:.06em}.viz-bar{flex-basis:100%;height:3px;background:rgba(255,255,255,.12);position:relative;cursor:pointer}.viz-bar i{position:absolute;left:0;top:0;bottom:0;background:#fff;width:0}.viz-bar b{position:absolute;top:-2px;width:1px;height:7px;background:rgba(255,255,255,.35)}
body.full{background:#05070c}body.full .pg{max-width:none;margin:0;padding:10px;box-shadow:none;background:#05070c;min-height:100vh}body.full .viz{padding:8px}body.full .vizb:not(.full-on){display:none}body.full .viz-card{max-width:720px}
.viz{background:#0b1020;border-radius:12px;padding:12px;color:#eef2f7}.viz-tab,.viz-sub,.viz-ctl button,.viz-tr button{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#e5e7eb;border-radius:999px;padding:6px 13px;font-size:12.5px;cursor:pointer}.viz-tab.on,.viz-sub.on{background:#fff;color:#000;font-weight:700}.viz-ctl{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;font-size:12px}.viz-ctl .sub{color:#9aa3b2}.viz select{background:#111827;color:#fff;border:1px solid #374151;border-radius:8px;padding:4px 8px;font-size:12px}.viz canvas{display:block;width:100%;border-radius:8px;background:#05070c}.viz-card{margin-top:8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.55}.viz-card .d{font-family:Georgia,serif;font-weight:300;font-size:22px}.viz-card .m{color:#9aa3b2;font-size:11px;margin-top:6px}
@media print{body{background:#fff}.pg{box-shadow:none;margin:0;max-width:none;padding:0}h2{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}.viz,h2.viz-h,.toc,.brief-print-hide{display:none}}</style></head><body><div class="pg">
${head}${toc}
${body}
<div class="foot">SMC Fair Shift · 화면과 같은 계산 · 실험 기능 — 인쇄하면 PDF로 저장할 수 있다</div></div></body></html>`;
}
// 월간 보고 11절의 그리기 코드 — 보고서 파일 안에서만 도는 독립 스크립트(앱 전역을 쓰지 않는다).
// 여정·비·바람·궤도 셋을 한 덩어리로 두고, 보이는 탭만 애니메이션한다(안 보이는 캔버스까지 돌면 폰이 뜨거워진다).
function magazineVizScript() {
  return String.raw`(function(){
var D=JSON.parse(document.getElementById("vizData").textContent),TR=D.trace,nD=D.days.length;
var P=TR?TR.staff:D.staff,nS=P.length;
var FINAL=TR?TR.final:P.map(function(s){return D.grid[s.id]});
var C={D:"#60a5fa",E:"#fb923c",N:"#a78bfa",NK:"#f472b6","/":"#475569",p:"#4ade80","8A":"#cbd5e1","9A":"#cbd5e1","10A":"#cbd5e1","S/":"#2dd4bf"};
var NAME={D:"낮(D)",E:"저녁(E)",N:"밤(N)",NK:"밤(야간전담)","/":"쉼",p:"prn","S/":"수면오프","8A":"8A"};
var REST={"/":1,"연차":1,"연1":1,"연2":1,"연3":1,"연4":1,"S/":1,"군":1,"TW":1,"T":1,"휴":1,"병":1,"공":1,"조":1,"경":1,"승":1};
function work(v){return !!v&&!REST[v]} function isN(v){return v==="N"||v==="NK"} function col(v){return C[v]||(work(v)?"#e5e7eb":"#64748b")}
function rnd(i){var x=Math.sin(i*9301+49297)*233280;return x-Math.floor(x)} function ease(x){return 1-Math.pow(1-Math.min(1,Math.max(0,x)),3)}
function hex(c,a){var n=parseInt(c.slice(1),16);return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+a+")"}
var FULL=window.VIZ_FULL||null; if(FULL){var fb=document.getElementById(FULL);if(fb)fb.classList.add("full-on")}
function fit(cv,ratio,maxH){var w=cv.clientWidth||600,h=FULL?Math.max(240,window.innerHeight-(cv.getBoundingClientRect().top|0)-(FULL==="viz-jour"?130:16)):Math.max(220,Math.min(maxH||560,Math.round(w*ratio),Math.round(window.innerHeight*.82))),dpr=Math.min(2,window.devicePixelRatio||1);if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);cv.style.height=h+"px"}var x=cv.getContext("2d");x.setTransform(dpr,0,0,dpr,0,0);return [x,w,h]}
// --- 재생 상태(기록이 있을 때) — 원본 데모(갤러리 II)의 applyTo·단계 머무름 그대로
var grid,pos=0,playing=false,born=new Map(),dwellUntil=0,dwellStage=-1,speed=14,recent=[],t0=performance.now();
var EV=TR?TR.events:[],STG=TR?TR.stages:[];
function resetGrid(){grid=[];for(var i=0;i<nS;i++){grid.push([]);for(var d=0;d<nD;d++)grid[i].push("")}pos=0;born.clear();recent=[]}
function stageOf(p){var i=0;while(i<STG.length&&STG[i].end<=p)i++;return Math.min(i,STG.length-1)}
function applyTo(target){if(target<pos)resetGrid();var now=performance.now();while(pos<target&&pos<EV.length){var e=EV[pos];grid[e[1]][e[2]]=e[3];born.set(e[1]+":"+e[2],now);recent.push([e[1],e[2],now]);pos++}if(recent.length>80)recent.splice(0,recent.length-80);updateText()}
function age(i,d,now,ms){var b=born.get(i+":"+d);return b===undefined?1:ease((now-b)/(ms||800))}
if(TR){resetGrid()}else{grid=FINAL.map(function(r){return r.slice()})}
// --- 재생 조작(블록마다 하나, 같은 상태를 본다)
var TRS=[].slice.call(document.querySelectorAll(".viz-tr"));
function setPlay(){TRS.forEach(function(t){t.querySelector("[data-tr=play]").textContent=playing?"⏸ 멈춤":"▶ 재생"})}
function updateText(){if(!TR)return;var k=stageOf(Math.max(0,pos-1)),st=STG[k]||{};var frac=EV.length?pos/EV.length:1;
 TRS.forEach(function(t){t.querySelector(".viz-stage").textContent=(k+1)+"/"+STG.length+" "+(st.name||"")+(st.desc?" — "+st.desc:"");t.querySelector(".viz-kpi").textContent="필수 위반 "+st.strict+" · 노랑 "+st.soft+" · 공평성 "+st.fair+" · 채움 "+Math.round(100*(st.filled||0)/(nS*nD))+"%";t.querySelector(".viz-bar i").style.width=(frac*100)+"%"})}
TRS.forEach(function(t){
 if(!TR){t.style.display="none";return}
 var bar=t.querySelector(".viz-bar");STG.forEach(function(st){var m=document.createElement("b");m.style.left=(100*st.end/Math.max(1,EV.length))+"%";bar.appendChild(m)});
 bar.onclick=function(ev){var r=bar.getBoundingClientRect();playing=false;setPlay();applyTo(Math.round(EV.length*(ev.clientX-r.left)/r.width))};
 t.querySelector("[data-tr=play]").onclick=function(){if(pos>=EV.length)applyTo(0);playing=!playing;setPlay();dwellUntil=0};
 t.querySelector("[data-tr=first]").onclick=function(){playing=false;setPlay();applyTo(0)};
 t.querySelector("[data-tr=next]").onclick=function(){playing=false;setPlay();var c=stageOf(pos);applyTo(STG[c].end===pos&&c+1<STG.length?STG[c+1].end:STG[c].end)};
 t.querySelector("[data-tr=prev]").onclick=function(){playing=false;setPlay();var c=stageOf(pos);applyTo(c?STG[c-1].end:0)};
 t.querySelector("[data-tr=speed]").oninput=function(){speed=+this.value;TRS.forEach(function(o){o.querySelector("[data-tr=speed]").value=speed})}});
if(TR){applyTo(0);playing=true;setPlay()}
// --- 보이는 캔버스만 그린다
var vis={};var io=("IntersectionObserver" in window)?new IntersectionObserver(function(es){es.forEach(function(e){vis[e.target.id]=e.isIntersecting})},{threshold:.05}):null;
["vzJour","vzRain","vzOrb"].forEach(function(id){vis[id]=true;if(io)io.observe(document.getElementById(id))});
// --- 1 여정 — 완성표 위를 걷고, 카드는 그 칸을 놓은 단계(PROV)를 말한다
var jc=document.getElementById("vzJour"),who=0,jday=0,jpos=0,jplay=false,jlast=0,cardDay=-1;
var PROV=[];for(var i0=0;i0<nS;i0++){PROV.push([]);for(var d0=0;d0<nD;d0++)PROV[i0].push(-1)}EV.forEach(function(e){PROV[e[1]][e[2]]=e[0]});
var sel=document.getElementById("vzWho");P.forEach(function(s,i){if(s.partjang)return;var o=document.createElement("option");o.value=i;o.textContent=s.id+" (Lv"+s.level+(s.nk?", 야간전담":"")+")";sel.appendChild(o)});who=+sel.value||0;
sel.onchange=function(){who=+sel.value;jday=0;jpos=0;cardDay=-1};
document.getElementById("vzPlay").onclick=function(){jplay=!jplay;this.textContent=jplay?"⏸ 멈춤":"▶ 걷기"};
document.getElementById("vzNext").onclick=function(){jday=Math.min(nD-1,jday+1);jplay=false};document.getElementById("vzPrev").onclick=function(){jday=Math.max(0,jday-1);jplay=false};
jc.addEventListener("wheel",function(e){e.preventDefault();jday=Math.max(0,Math.min(nD-1,jday+Math.sign(e.deltaY)));jplay=false},{passive:false});
document.addEventListener("keydown",function(e){if(!vis.vzJour)return;if(e.key==="ArrowRight")jday=Math.min(nD-1,jday+1);if(e.key==="ArrowLeft")jday=Math.max(0,jday-1)});
function sky(v){return v==="D"?["#8ec5ff","#dff0ff"]:v==="E"?["#3b2a5a","#f59e6b"]:isN(v)?["#050816","#1a2050"]:v==="S/"?["#1f2937","#475569"]:work(v)?["#6b8fb3","#d6e6f5"]:["#5b6b84","#c7d2e2"]}
function why(row,d){var v=row[d],out=[];if(isN(v)){var a=d,b=d;while(a>0&&isN(row[a-1]))a--;while(b<nD-1&&isN(row[b+1]))b++;out.push("밤 블록 "+(b-a+1)+"일("+(a+1)+"~"+(b+1)+"일). 뒤 이틀은 휴식(H2-5).");var up=0;for(var k=0;k<=d;k++)if(isN(row[k]))up++;out.push("이번 달 "+up+"번째 밤.")}
 else if(work(v)){var p=d,q=d;while(p>0&&work(row[p-1])&&!isN(row[p-1]))p--;while(q<nD-1&&work(row[q+1])&&!isN(row[q+1]))q++;out.push("주간 블록 "+(q-p+1)+"일("+(p+1)+"~"+(q+1)+"일) — 3~4일이 기준(H6-1).");var r=0,m=0;for(var k2=0;k2<nD;k2++){r=work(row[k2])?r+1:0;if(k2===d)m=r}out.push("연속근무 "+m+"일째.")}
 else{var pn=d>=1&&(isN(row[d-1])||(d>=2&&isN(row[d-2])&&!work(row[d-1])));out.push(pn?"밤 블록 뒤의 휴식(H2-5).":"쉬는 날.")}
 if(work(v)&&D.days[d].weekend){var w=0;for(var k3=0;k3<=d;k3++)if(work(row[k3])&&D.days[k3].weekend)w++;out.push("주말·공휴일 근무 "+w+"번째.")}return out}
function drawJour(now){var r=fit(jc,.52,480),x=r[0],w=r[1],h=r[2],row=FINAL[who];if(jplay&&now-jlast>1500){jlast=now;jday=(jday+1)%nD}jpos+=(jday-jpos)*.1;
 var colW=Math.min(170,w*.3),cx=w*.42,k=Math.max(0,Math.min(nD-1,Math.round(jpos))),s=sky(row[k]),g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,s[0]);g.addColorStop(1,s[1]);x.fillStyle=g;x.fillRect(0,0,w,h);
 var night=isN(row[k]);for(var i=0;i<60;i++){x.fillStyle="rgba(255,255,255,"+((night?.8:.08)*(.3+.7*rnd(i+9)))+")";x.fillRect(((rnd(i)*w*2-jpos*30)%w+w)%w,rnd(i+1)*h*.5,1.5,1.5)}
 var ground=h*.72;function hill(px){var t=(px-cx)/colW+jpos;return ground+Math.sin(t*1.7)*10+Math.sin(t*.6)*16}
 x.fillStyle="rgba(10,14,24,.85)";x.beginPath();x.moveTo(0,h);for(var px=0;px<=w;px+=8)x.lineTo(px,hill(px));x.lineTo(w,h);x.closePath();x.fill();x.textAlign="center";
 for(var d=0;d<nD;d++){var xx=cx+(d-jpos)*colW;if(xx<-colW||xx>w+colW)continue;var v=row[d],near=Math.max(0,1-Math.abs(d-jpos)),yg=hill(xx),yy=h*.22;
  if(v==="D"){x.fillStyle="#fde68a";x.shadowBlur=30;x.shadowColor="#fde68a";x.beginPath();x.arc(xx,yy,20,0,7);x.fill();x.shadowBlur=0}
  else if(v==="E"){x.fillStyle="#fb923c";x.shadowBlur=30;x.shadowColor="#fb923c";x.beginPath();x.arc(xx,yy+48,20,Math.PI,0);x.fill();x.shadowBlur=0}
  else if(isN(v)){x.fillStyle="#e5e7eb";x.shadowBlur=24;x.shadowColor="#c7d2fe";x.beginPath();x.arc(xx,yy,17,0,7);x.fill();x.fillStyle=sky(v)[0];x.beginPath();x.arc(xx+7,yy-3,15,0,7);x.fill();x.shadowBlur=0}
  else if(work(v)){x.fillStyle="#fef3c7";x.shadowBlur=16;x.shadowColor="#fde68a";x.beginPath();x.arc(xx,yy+8,14,0,7);x.fill();x.shadowBlur=0}
  else{x.fillStyle="rgba(255,255,255,.75)";for(var q=0;q<3;q++){x.beginPath();x.arc(xx-14+q*14,yy+6-(q%2)*8,12,0,7);x.fill()}}
  x.strokeStyle="rgba(255,255,255,"+(.25+.5*near)+")";x.lineWidth=2;x.beginPath();x.moveTo(xx,yg);x.lineTo(xx,yg-32-24*near);x.stroke();
  x.fillStyle="rgba(255,255,255,"+(.5+.5*near)+")";x.font="300 "+(14+14*near)+"px Georgia,serif";x.fillText(String(d+1),xx,yg-40-24*near);
  x.fillStyle=col(v);x.font="600 "+(11+3*near)+"px system-ui,sans-serif";x.fillText(NAME[v]||v||"",xx,yg+18);if(D.days[d].weekend){x.fillStyle="rgba(252,165,165,.9)";x.font="10px system-ui";x.fillText("주말",xx,yg+32)}}
 var gy=hill(cx);x.fillStyle="#fff";x.beginPath();x.arc(cx,gy-22+Math.sin(now/250)*2,6,0,7);x.fill();x.strokeStyle="#fff";x.lineWidth=3;x.beginPath();x.moveTo(cx,gy-16);x.lineTo(cx,gy+1);x.moveTo(cx,gy+1);x.lineTo(cx-6+Math.sin(now/250)*5,gy+13);x.moveTo(cx,gy+1);x.lineTo(cx+6-Math.sin(now/250)*5,gy+13);x.stroke();
 if(cardDay!==jday){cardDay=jday;var v2=row[jday],st=PROV[who][jday]>=0?STG[PROV[who][jday]]:null,ni=row.filter(isN).length,wk=row.filter(function(z,i2){return work(z)&&D.days[i2].weekend}).length,of=row.filter(function(z){return z==="/"}).length;
  var prov=st?'<b>'+st.name+'</b> 단계에서 놓였습니다.'+(st.desc?' <span class="m" style="display:inline">'+st.desc+'</span>':''):(TR?'입력에서 정해진 칸(고정·이월)입니다.':'');
  document.getElementById("vzCard").innerHTML='<div class="d">'+(jday+1)+'일 <span style="color:'+col(v2)+'">'+(NAME[v2]||v2||"—")+'</span></div>'+(prov?'<div>'+prov+'</div>':'')+'<div style="margin-top:6px">'+why(row,jday).join("<br>")+'</div><div class="m">'+P[who].id+' · 이달 밤 '+ni+'회 · 주말 '+wk+'일 · 쉼 '+of+'일</div>'}}
// --- 2 비 — 원본(갤러리 II 5번) 그대로: 놓인 칸은 흰색으로 떨어져 제 색으로, 빈 칸 위로는 초록 글자 비
var rc=document.getElementById("vzRain");
function drawRain(now){var r=fit(rc,.8,760),x=r[0],w=r[1],h=r[2];x.fillStyle="rgba(5,7,12,.35)";x.fillRect(0,0,w,h);
 var pad=14,cs=Math.min((w-pad*2)/nD,(h-pad*2)/nS),ox=(w-cs*nD)/2,oy=(h-cs*nS)/2;x.font="700 "+(cs*.72)+"px 'JetBrains Mono',monospace";x.textAlign="center";x.textBaseline="middle";var chars="DEN/pDEN";
 for(var d=0;d<nD;d++){var speed2=60+50*rnd(d),head=((now/1000)*speed2+rnd(d+50)*600)%(h+300)-150;for(var k=0;k<10;k++){var y=oy+head-k*cs;if(y<oy||y>oy+cs*nS)continue;var i=Math.floor((y-oy)/cs);if(grid[i]&&grid[i][d])continue;x.fillStyle="rgba(74,222,128,"+(k?.22-k*.02:.6)+")";x.fillText(chars[Math.floor(rnd(d*31+k+Math.floor(now/90))*8)],ox+d*cs+cs/2,y+cs/2)}}
 for(var i2=0;i2<nS;i2++)for(var d2=0;d2<nD;d2++){var v=grid[i2][d2];if(!v)continue;var s=age(i2,d2,now,500),yy=oy+i2*cs+cs/2-(1-s)*cs*1.5;x.fillStyle=s<1?"#fff":col(v);x.globalAlpha=v==="/"?.3:1;x.shadowBlur=v==="/"?0:6;x.shadowColor=col(v);x.fillText(v==="NK"?"K":v==="/"?"/":v[0],ox+d2*cs+cs/2,yy);x.shadowBlur=0;x.globalAlpha=1}
 x.textBaseline="alphabetic"}
// --- 3 한 달의 궤도 — 원본(지피티 01-04) 그대로: 놓인 칸이 원호로, 가운데 채운 비율, 바늘은 진행, 방금 놓인 칸은 반짝
var oc=document.getElementById("vzOrb");
function drawOrb(now){var r=fit(oc,.95,760),x=r[0],w=r[1],h=r[2];x.fillStyle="#121629";x.fillRect(0,0,w,h);var cx=w/2,cy=h/2,R=Math.min(w,h)*.43,r0=R*.19,dr=(R-r0)/nS,filled=0;
 for(var i=0;i<nS;i++){var rr=r0+(i+.5)*dr;x.strokeStyle="#666886";x.lineWidth=.5;x.globalAlpha=.2;x.beginPath();x.arc(cx,cy,rr,0,Math.PI*2);x.stroke();x.globalAlpha=1;
  for(var d=0;d<nD;d++){var v=grid[i][d];if(!v)continue;filled++;var a=d/nD*Math.PI*2-Math.PI/2+.01,b=(d+1)/nD*Math.PI*2-Math.PI/2-.01;x.strokeStyle=col(v);x.globalAlpha=(v==="/"?.35:.9)*age(i,d,now,600);x.lineWidth=dr*.68;x.beginPath();x.arc(cx,cy,rr,a,b);x.stroke();x.globalAlpha=1}}
 x.fillStyle="#ada9c4";x.font=(w<600?"11px":"12px")+" system-ui";x.textAlign="center";x.textBaseline="middle";for(var d2=0;d2<nD;d2+=(w<600?5:3)){var a2=(d2+.5)/nD*Math.PI*2-Math.PI/2;x.fillText(String(d2+1).padStart(2,"0"),cx+Math.cos(a2)*(R+18),cy+Math.sin(a2)*(R+18))}
 var frac=TR?(EV.length?pos/EV.length:1):((now/900)%nD)/nD,ah=frac*Math.PI*2-Math.PI/2;x.strokeStyle="#eee4c5";x.globalAlpha=.6;x.lineWidth=.9;x.beginPath();x.moveTo(cx+Math.cos(ah)*r0,cy+Math.sin(ah)*r0);x.lineTo(cx+Math.cos(ah)*(R+12),cy+Math.sin(ah)*(R+12));x.stroke();x.globalAlpha=1;
 x.fillStyle="#eae5f3";x.font="300 "+(w<600?26:30)+"px Georgia,serif";x.fillText(String(Math.round(filled/(nS*nD)*100)),cx,cy-4);x.fillStyle="#ada9c4";x.font="11px system-ui";x.fillText("% 채움 · "+D.year+"년 "+D.month+"월",cx,cy+18);
 recent.forEach(function(e){var rr2=r0+(e[0]+.5)*dr,a3=(e[1]+.5)/nD*Math.PI*2-Math.PI/2,al=Math.max(0,1-(now-e[2])/1500);if(al<=0)return;x.fillStyle="rgba(255,245,215,"+al+")";x.beginPath();x.arc(cx+Math.cos(a3)*rr2,cy+Math.sin(a3)*rr2,2.2,0,Math.PI*2);x.fill()});x.textBaseline="alphabetic"}
// --- 새 창에서 크게 — 이 보고서의 데이터·그리기 코드·마크업을 그대로 담은 페이지를 Blob으로 열어 그 블록만 창을 꽉 채운다
document.querySelectorAll(".viz-open").forEach(function(b){b.onclick=function(){
 var k=b.dataset.open,title=document.title+" — "+document.querySelector("#"+k+" h3").textContent;
 var css="";document.querySelectorAll("style").forEach(function(s){css+=s.textContent});
 var vizEl=document.getElementById("viz").cloneNode(true);vizEl.querySelectorAll(".viz-open").forEach(function(x){x.remove()});vizEl.querySelectorAll("select").forEach(function(x){x.innerHTML=""});vizEl.querySelectorAll(".viz-bar b").forEach(function(x){x.remove()});
 var html='<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>'+css+'</style></head><body class="full"><div class="pg">'+vizEl.outerHTML+'</div>'+
  '<script id="vizData" type="application/json">'+document.getElementById("vizData").textContent+'<\/script>'+
  '<script id="vizSrc" type="text/plain">'+document.getElementById("vizSrc").textContent+'<\/script>'+
  '<script>window.VIZ_FULL='+JSON.stringify(k)+';new Function(document.getElementById("vizSrc").textContent)();<\/script></body></html>';
 var url=URL.createObjectURL(new Blob([html],{type:"text/html"}));var w=window.open(url,"_blank");if(!w)location.href=url}});
// --- 루프: 재생은 원본과 같은 걸음(속도/5 이벤트씩, 단계 끝에서 잠깐 머무름), 그리기는 보이는 캔버스만
function frame(now){
 if(TR&&playing){if(pos>=EV.length){playing=false;setPlay()}else if(now>=dwellUntil){var cur=stageOf(pos),end=STG[cur].end;applyTo(Math.min(end,pos+Math.max(1,Math.round(speed/5))));if(pos===end&&dwellStage!==cur){dwellStage=cur;dwellUntil=now+Math.max(300,1800-speed*25)}}}
 if(vis.vzJour&&(!FULL||FULL==="viz-jour"))drawJour(now);if(vis.vzRain&&(!FULL||FULL==="viz-rain"))drawRain(now);if(vis.vzOrb&&(!FULL||FULL==="viz-orb"))drawOrb(now);requestAnimationFrame(frame)}
requestAnimationFrame(frame);
})();`;
}
async function downloadMagazine() {
  if (!ST) return;
  // 11절(시각화)이 재생할 생성 기록 — 고른 시드를 한 번 더 돌리므로 생성 한 번 값의 시간이 든다.
  // 못 받으면(오류) 완성표만 그린 보고서를 그대로 준다 — 기록은 장식이지 보고서의 본체가 아니다.
  let trace = null;
  showGenOverlay("월간 보고의 시각화 기록을 만드는 중입니다…");
  try { trace = await api("/api/trace"); } catch (e) { trace = null; }
  finally { hideGenOverlay(); }
  downloadText(magazineHtml(trace), `월간근무보고_${ST.year}-${String(ST.month).padStart(2, "0")}.html`);
}

// 이 칸이 묶여 있는 규칙 — 파트장이 "왜 이 칸이냐"를 물을 때 누르는 자리(근무 선택기)에 같이 띄운다.
// 데모(여섯 가지 개념 '파문')에서 옮겨 온 간단 판정이다: 같은 블록·연속근무·같은 날 같은 조·밤 뒤 휴식.
// 엔진의 검사기를 부르지 않는다(동기·즉시). 그래서 '간단 판정'이라고 적는다 — 실제 위반 여부는 결과창.
function explainCell(sid, day) {
  const s = ST.staff.find(x => x.id === sid);
  const row = ST.grid[sid] || [];
  const nd = ST.num_days, code = row[day];
  const lines = [], cells = [];
  const push = (id, d, dist, kind) => cells.push({ sid: id, day: d, dist, kind });
  const isN = v => v === "N" || v === "NK";
  const dayLabel = d => `${d + 1}일`;
  if (!s || !code) return { lines, cells };
  // 가로: 같은 근무 블록
  let a = day, b = day;
  while (a > 0 && row[a - 1] === code) a--;
  while (b < nd - 1 && row[b + 1] === code) b++;
  for (let k = a; k <= b; k++) if (k !== day) push(sid, k, Math.abs(k - day), "block");
  const len = b - a + 1;
  if (isN(code)) {
    lines.push(`밤 블록 ${len}일(${dayLabel(a)}~${dayLabel(b)}). 뒤 이틀은 휴식(H2-5).`);
    for (let k = b + 1; k <= Math.min(nd - 1, b + 2); k++) push(sid, k, k - day, "rest");
    let gap = 0;
    for (let k = a - 1; k >= 0 && !isN(row[k]); k--) gap++;
    if (a > 0 && gap < a) lines.push(`앞 밤 블록과 간격 ${gap}일(기준 7일).`);
  } else if (DAY_BLOCK_CODES.includes(code)) {
    // 엔진(_day_work_blocks·_day_block_cap)과 같은 잣대: D·E·prn·8A·9A·10A가 이어진 것이
    // 한 블록이고, prn 계열이 하루라도 끼면 상한이 5일이다. 같은 코드끼리만 묶으면
    // D·D·8A·8A·8A를 "D 2일"로 보여 주고 3~4일이라고 말해 엔진 판정과 어긋난다.
    let p = day, q = day;
    while (p > 0 && DAY_BLOCK_CODES.includes(row[p - 1])) p--;
    while (q < nd - 1 && DAY_BLOCK_CODES.includes(row[q + 1])) q++;
    for (let k = p; k <= q; k++) if (k < a || k > b) push(sid, k, Math.abs(k - day), "block");
    const n = q - p + 1;
    const cap = row.slice(p, q + 1).some(v => PRN_FAMILY.includes(v)) ? 5 : 4;
    const rule = cap === 5 ? "prn 계열이 끼어 3~5일까지 됨(H6-1)" : "3~4일이 좋음(H6-1)";
    lines.push(n === 1 ? `하루짜리 ${shiftText(code)} — 주간 블록은 ${rule}.`
      : `주간 블록 ${n}일(${dayLabel(p)}~${dayLabel(q)}) — ${rule}.`);
  } else if (isWorkCode(code)) {
    lines.push(len === 1 ? `하루짜리 ${shiftText(code)}.` : `${shiftText(code)} ${len}일(${dayLabel(a)}~${dayLabel(b)}).`);
  }
  // 연속근무
  if (isWorkCode(code)) {
    let s0 = day, e0 = day;
    while (s0 > 0 && isWorkCode(row[s0 - 1])) s0--;
    while (e0 < nd - 1 && isWorkCode(row[e0 + 1])) e0++;
    for (let k = s0; k <= e0; k++) if (k !== day && row[k] !== code) push(sid, k, Math.abs(k - day) + 1, "run");
    const maxC = (ST.params_summary && ST.params_summary.max_consecutive_work) || 5;
    const runLen = e0 - s0 + 1 + (s0 === 0 ? (s.carry_run || 0) : 0);
    lines.push(`연속근무 ${runLen}일 구간(상한 ${maxC}일)${runLen >= maxC ? " — 한도에 닿음" : ""}.`);
    // 세로: 같은 날 같은 조
    const sameTeam = v => v === code || (isN(code) && isN(v));   // 밤 조는 N·NK가 한 조
    const team = ST.staff.filter(x => x.id !== sid && !x.is_partjang && sameTeam((ST.grid[x.id] || [])[day]));
    team.forEach(x => push(x.id, day, 1, "team"));
    const key = code === "NK" ? "N" : code;
    const min = ST.days[day] && ST.days[day].min ? ST.days[day].min[key] : undefined;
    if (min !== undefined) {
      lines.push(`${dayLabel(day)} ${shiftText(code)} ${team.length + 1}명 / 최소 ${min}명` +
        (team.length + 1 <= min ? " — 비우면 최소인력 미달(H1-1)." : " — 한 명 빠져도 됨."));
    }
    if (key === "D" || key === "E" || key === "N") {
      const seniors = team.filter(x => x.level >= 4).length;
      if (s.level >= 4) lines.push(seniors === 0 ? "이 조의 Lv4+는 이 사람뿐 — 빠지면 H1-5 위반." : `이 조 Lv4+ ${seniors + 1}명.`);
      else if (seniors === 0) lines.push("이 조에 Lv4+가 없음(H1-5).");
    }
    if (ST.days[day].weekend) {
      const wk = row.filter((v, d) => isWorkCode(v) && ST.days[d].weekend).length;
      lines.push(`주말·공휴일 근무 — 이달 ${wk}일째.`);
    }
  } else if (code === "OFF") {
    const prevN = (day >= 1 && isN(row[day - 1])) || (day >= 2 && isN(row[day - 2]) && row[day - 1] === "OFF");
    if (prevN) lines.push("밤 블록 뒤의 휴식(H2-5).");
    const short = ["D", "E", "N"].filter(k => {
      const need = ST.days[day] && ST.days[day].min ? ST.days[day].min[k] || 0 : 0;
      const have = ST.staff.filter(x => !x.is_partjang && ((ST.grid[x.id] || [])[day] === k || (k === "N" && (ST.grid[x.id] || [])[day] === "NK"))).length;
      return have < need && s.allowed.includes(k);
    });
    if (short.length) lines.push(`이날 ${short.join("·")}이(가) 모자람 — 이 사람이 후보.`);
  }
  if (isN(code) && s.night_target != null) {
    const nights = row.filter(isN).length;
    lines.push(`이달 밤 ${nights}회(목표 ${s.night_target}).`);
  }
  return { lines, cells };
}
function clearRipple() {
  document.querySelectorAll("table.grid td.rip").forEach(td => { td.classList.remove("rip", "rip-team", "rip-rest", "rip-run"); td.style.removeProperty("--rd"); });
}
function showRipple(cells) {
  clearRipple();
  for (const c of cells) {
    const td = document.querySelector(`table.grid td[data-sid="${CSS.escape(c.sid)}"][data-day="${c.day}"]`);
    if (!td) continue;
    td.classList.add("rip", c.kind === "team" ? "rip-team" : c.kind === "rest" ? "rip-rest" : "rip-run");
    td.style.setProperty("--rd", (c.dist * 70) + "ms");
  }
}

window.openPicker = function (ev, sid, day) {
  closePicker();
  const td = ev.target.closest("td");
  const isTeamB = td && td.dataset.teamb === "1";
  // 신입은 엔진이 배정하지 않는다 = 인원 수에도 안 잡힌다. 그래서 무엇을 골라도
  // 다른 사람 근무표에 영향이 없어, 파트장이 쓰는 그대로 다 열어둔다(지우기 포함).
  const staff = isTeamB
    ? { id: sid, allowed: ALL_SHIFTS, is_partjang: false }
    : ST.staff.find(s => s.id === sid);
  // 전원 공통 휴가 계열 + 그 사람의 허용 근무. 파트장은 여기서 근무 다섯만 뺀다.
  const allowed = new Set([...REST_PICK, ...staff.allowed]);
  if (staff.is_partjang) {
    // 기본 배정값(평일 상근)으로 되돌릴 길은 명단에 뭐라 적혀 있든 항상 열어둔다.
    allowed.add("8A");
    for (const k of PARTJANG_BLOCK) allowed.delete(k);
  }
  const cur = isTeamB ? ((ST.team_b_grid[sid] || [])[day] || "") : ST.grid[sid][day];
  const rect = td.getBoundingClientRect();

  const div = document.createElement("div");
  div.className = "picker";
  // 마우스 없이도 닫고 고를 수 있어야 한다 — 역할을 밝히고, 열 때 첫 버튼으로 포커스를
  // 옮기고, Esc로 닫으면 누른 칸으로 되돌린다. 안 하면 키보드 사용자는 이 상자를
  // 열자마자 갇힌다(배경이 그대로 조작되고, 닫을 방법도 없다).
  div.setAttribute("role", "dialog");
  div.setAttribute("aria-modal", "true");
  div.setAttribute("aria-label", `${sid} ${day + 1}일 근무 고르기`);
  div.style.left = Math.min(rect.left, window.innerWidth - 230) + "px";
  div.style.top = (rect.bottom + 4) + "px";
  for (const sh of ALL_SHIFTS) {
    if (!allowed.has(sh)) continue;
    const b = document.createElement("button");
    b.textContent = shiftText(sh);
    if (sh === cur) b.classList.add("current");
    b.onclick = (e) => { e.stopPropagation(); stageEdit(sid, day, sh, isTeamB); closePicker(); };
    div.appendChild(b);
  }
  // 맞교환 줄 — 그 날 그 근무를 가진 사람과 둘의 하루만 바꾼다(두 칸). 파트장·신입은
  // 엔진 인원에 안 들어가므로 바꿀 상대가 없다.
  if (!isTeamB && !staff.is_partjang) {
    const sep = document.createElement("div");
    sep.className = "picker-sep";
    sep.textContent = "맞교환 상대 찾기 (두 칸만 바뀜)";
    div.appendChild(sep);
    for (const sh of ["D", "E", "N", "NK", "prn", "8A", "OFF"]) {
      if (!allowed.has(sh) || sh === cur) continue;
      const b = document.createElement("button");
      b.className = "swap";
      b.textContent = "↔ " + shiftText(sh);
      b.title = `${sid} ${day + 1}일을 ${shiftText(sh)}로 — 그 날 ${shiftText(sh)}인 사람과 맞바꿀 상대를 찾습니다`;
      b.onclick = (e) => { e.stopPropagation(); findSwap(sid, day, sh); closePicker(); };
      div.appendChild(b);
    }
  }
  if (!isTeamB) {
    const why = explainCell(sid, day);
    if (why.lines.length) {
      const box = document.createElement("div");
      box.className = "picker-why";
      box.innerHTML = `<b>이 칸은</b> ` + why.lines.map(esc).join(" ") + ` <span class="dim">(간단 판정)</span>`;
      div.appendChild(box);
      showRipple(why.cells);
    }
  }
  if (isTeamB) {
    const b = document.createElement("button");
    b.textContent = "지움";
    if (!cur) b.classList.add("current");
    b.onclick = (e) => { e.stopPropagation(); stageEdit(sid, day, "", true); closePicker(); };
    div.appendChild(b);
  }
  document.body.appendChild(div);
  trapPickerKeys(div);
  const first = div.querySelector("button");
  if (first) first.focus();
  picker = div;
  pickerCell = td;
  td.classList.add("picking");
  ev.stopPropagation();
  setTimeout(() => document.addEventListener("click", closePicker, { once: true }), 0);
};
function closePicker() {
  // 포커스를 상자 안에 둔 채로 지우면 body로 튄다 — 그러면 키보드 사용자는 다음 칸으로
  // 갈 수가 없다. 누른 칸으로 되돌리되, **노드가 아니라 좌표로** 되돌린다: 근무를 고르면
  // 표가 통째로 다시 그려져 그 td는 이미 다른 노드다(잡아둔 참조는 화면 밖 것이 된다).
  const inside = picker && picker.contains(document.activeElement);
  const back = inside && pickerCell
    ? { sid: pickerCell.dataset.sid, day: pickerCell.dataset.day } : null;
  if (picker) { picker.remove(); picker = null; }
  if (pickerCell) { pickerCell.classList.remove("picking"); pickerCell = null; }
  clearRipple();
  if (back) focusCell(back.sid, back.day);
}

// 근무를 고르면 stageEdit가 서버를 다녀온 뒤 표를 통째로 다시 그린다 — 그 사이 잡아둔
// td는 화면 밖 노드가 된다. 그래서 좌표만 남겨두고 **다시 그린 다음** 되돌린다.
// 안 하면 한 칸 고칠 때마다 포커스가 body로 튀어 키보드로는 다음 칸에 갈 수가 없다.
let pendingFocus = null;

function focusCell(sid, day) {
  pendingFocus = { sid, day };
  restorePendingFocus();
}

function restorePendingFocus() {
  if (!pendingFocus) return;
  const el = document.querySelector(
    `td[data-pick="1"][data-sid="${CSS.escape(pendingFocus.sid)}"]` +
    `[data-day="${CSS.escape(pendingFocus.day)}"]`);
  if (el) el.focus();
}

function trapPickerKeys(div) {
  div.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { ev.preventDefault(); closePicker(); return; }
    if (ev.key !== "Tab") return;
    // Tab이 상자 밖으로 나가면 배경을 조작하게 된다 — 안에서 돌게 한다.
    const btns = [...div.querySelectorAll("button")];
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement);
    const next = ev.shiftKey ? (i <= 0 ? btns.length - 1 : i - 1)
                             : (i === btns.length - 1 ? 0 : i + 1);
    ev.preventDefault();
    btns[next].focus();
  });
}

async function stageEdit(sid, day, shift, isTeamB) {
  const before = snapshotGrid();
  try {
    ST = await api(isTeamB ? "/api/edit/team_b" : "/api/edit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staff_id: sid, day, shift }),
    });
    render({ keepScroll: true });
    flashChanges(before);
    refreshFeedback();
  } catch (e) {}
}

async function undoEdit(sid, day) {
  const before = snapshotGrid();
  ST = await api("/api/edit/undo", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ staff_id: sid, day }),
  });
  render({ keepScroll: true });
  flashChanges(before);
  refreshFeedback();
}
window.undoEdit = undoEdit;

// ================================================================ 사이드 패널 (생성 후 정보)

// 검증 요약 상단에 붙일 상태 배너 — "이게 최선인지 아예 안 되는 건지"를 숫자 대신
// 말로 바로 알려준다. hard_count(필수 위반)와 r.hard.length(추가 검토 항목까지 합친
// 전체) 차이로 셋 중 하나를 가른다:
//   hard_count > 0            → 필수 위반이 남음(그대로 확정하면 안 됨)
//   hard_count === 0 && 잔여 > 0 → 필수는 다 지켰고 추가 검토 항목만 남음
//   전부 0                     → 완벽 배정
//
// "안전 규칙은 모두 지켰습니다"라고 쓰지 않는다. 노란색으로 남는 항목에는 월 OFF 하한(H4-1),
// 야간 6회 이상일 때의 수면오프(H7-1)처럼 사람의 안전과 직결되는 것들이 섞여 있다. (조의
// 숙련도 H1-5는 v0.85부터 필수(빨강)다 — 문구에 Lv4+를 노랑 예시로 적지 말 것. 10/30 GPT 검토 M06.) '안전'이라고 뭉뚱그리면 상세 규칙을 모르는 사람이 노란
// 목록을 안 읽고 승인한다 — 사실만 적는다: 무엇이 몇 건 남았는지.
// 필수 위반이 남은 근무표를 그대로 내려받아 확정하는 것을 막는다. 빨간 경고가 화면에
// 떠 있어도 다운로드 버튼은 그대로 눌렸고, 파일로 나가는 순간 그 근무표가 확정본이 된다.
// 무엇이 몇 건 남았는지 다시 한 번 보여주고 사람이 명시적으로 승인하게 한다.
// 최선노력(노랑) 규칙의 이름 — 엔진 _BEST_EFFORT_RULES {H6-1, H6-4, H4-1, H1-4, H4-2, H7-1}와 짝.
// 분류는 엔진이 report.hard[].best_effort로 보내므로 여기는 사람 말 설명만 둔다. 엔진 목록이 바뀌면
// tests/test_pyodide_sync.py가 잡게 이 상수 이름을 그대로 둘 것.
const BEST_EFFORT_NAMES = "주간 블록 길이(H6-1)·야간 목표 횟수(H6-4)·월 OFF 하한(H4-1)·최소인력 상한(H1-4)·긴 연속 휴무(H4-2)·수면오프(H7-1)";

function confirmDownloadWithViolations() {
  const r = ST && ST.report;
  if (!r || !r.hard_count) return true;
  const lines = r.hard.filter(v => !v.best_effort).slice(0, 5)
    .map(v => `  · ${v.rule} ${v.message}`).join("\n");
  const more = r.hard_count > 5 ? `\n  … 외 ${r.hard_count - 5}건` : "";
  return confirm(
    `필수 위반 ${r.hard_count}건이 남아 있는 근무표입니다.\n\n${lines}${more}\n\n` +
    `이 파일을 그대로 확정하면 위 칸은 사람이 직접 채워야 합니다.\n` +
    `그래도 내려받으시겠습니까?`);
}

function feasibilityBanner(r) {
  const total = r.hard.length;
  if (r.hard_count > 0) {
    return `<p class="status-banner bad">⚠ 필수 위반 ${r.hard_count}건이 남았습니다 — 이 조건
      (인원수·근무인력 기준)으로는 전부 만족하는 배정을 찾지 못했습니다. <b>이대로 확정하면
      안 됩니다.</b> 아래 빨간 목록을 확인해 해당 칸을 직접 고치거나, 인원을 늘리거나 근무인력
      기준을 낮춘 뒤 다시 생성해 주세요.</p>`;
  }
  if (total > 0) {
    return `<p class="status-banner warn">필수 규칙(최소인력·야간 블록·연속근무 등)은 모두
      지켰습니다. 다만 <b>추가 검토 ${total}건</b>이 남았습니다 — ${BEST_EFFORT_NAMES}처럼
      지키는 게 원칙이지만 인원 사정상 못 맞출 수 있는 항목입니다. 아래 노란
      목록을 확인한 뒤 확정해 주세요.</p>`;
  }
  return "";
}

function renderSide() {
  const r = ST.report;
  const hardCls = r.hard_count === 0 ? "ok" : "bad";

  let html = "";
  html += `<div class="side-sec"><h3>검증 요약</h3>`;
  if (ST.pending && ST.pending.length) {
    // 표에는 수정 대기 칸이 보이지만 아래 숫자는 확정표(마지막 생성·적용) 기준이다 — 둘의 기준이 다른
    // 것을 적어 두지 않으면 "고쳤는데 왜 위반이 그대로냐"가 된다(10/30 GPT 검토 U06, 재현됨).
    html += `<p class="hint scope-note">📌 아래는 <b>확정표 기준</b> 검사입니다 — 수정 대기 ${ST.pending.length}칸은 아직 반영되지 않았습니다.
      칸별 영향은 '편집 중' 목록의 관련 규칙으로, 전체는 '재생성 적용' 뒤 다시 계산됩니다.</p>`;
  }
  if (r.timed_out) {
    // 시도는 시드 0·1·2(전략 -,W,S)로 고정이라 같은 입력이면 같은 결과다. 예전 문구는 "무작위 재시도라
    // 다시 누르면 달라질 수 있다"였는데 사실이 아니어서, 같은 버튼을 계속 누르게 만들었다.
    // 시간 제한에 걸리는 건 기기가 느릴 때라, 빠른 기기에서는 끝까지 시도한다.
    html += `<p class="status-banner warn">⏱ 시간 제한(30초)으로 시도를 다 마치지 못하고
      멈췄습니다 — 지금 결과는 그 안에서 찾은 최선입니다. 같은 입력으로 다시 눌러도 결과는
      같습니다. 더 빠른 기기(PC)에서 열면 끝까지 시도합니다.</p>`;
  }
  html += feasibilityBanner(r);
  html += `<div class="kpi-row">
    <div class="kpi"><div class="v ${hardCls}">${r.hard_count}</div><div class="l">필수 위반</div></div>
    <div class="kpi"><div class="v">${r.hard.length - r.hard_count}</div><div class="l">추가 검토</div></div>
    <div class="kpi"><div class="v">${ST.round}</div><div class="l">회차</div></div>
  </div>`;
  if (r.hard.length > 0) {
    // 정말 못 채운 것(빨강)과 최선노력 규칙만 남은 것(노랑)을 구분해서 보여준다 —
    // 둘 다 같은 class="hard"로만 나가서 구분이 안 되던 것을 고침.
    // 예전엔 slice(0,8)로 앞 8건만 보여줘서, 위반이 많은 달엔 뒤쪽(특히 날짜순 정렬상
    // 뒤로 밀리는 H6-1 등)이 아무 표시 없이 통째로 안 보였다 — 파트장이 "이건 위반이
    // 아닌가 보다"로 오해할 수 있어, 전부 보여주되 스크롤로 감당한다.
    // 항목을 누르면 그 칸(사람·날)으로, 사람이 없는 항목(최소인력·숙련도·지정)은 그날 열로 간다 — 목록과 표를
    // 오가며 찾던 것을 없앤다(10/30 GPT 검토 U04). 값은 data-*에만 두고 클릭은 sidePane에서 위임받는다.
    html += '<ul class="issue-list issue-list-scroll">' + r.hard.map(v =>
      `<li class="${v.best_effort ? "soft" : "hard"}"${v.day ? ` data-day="${v.day - 1}"` : ""}${v.staff_id ? ` data-sid="${escAttr(v.staff_id)}"` : ""}` +
      `${v.day ? ' role="button" tabindex="0" title="누르면 그 칸으로 이동"' : ""}><span class="rule">${esc(v.rule)}</span>${esc(v.message)}</li>`).join("") + "</ul>";
  }
  html += "</div>";

  // 편집한 게 없는데 "편집 중"이라고 뜨면 혼선을 주므로, 스테이징된 편집이 있을 때만
  // 그 제목을 쓰고 평소엔 그냥 "편집"이라고만 표시한다.
  const hasPending = ST.pending.length > 0;
  html += renderSwap();
  html += `<div class="side-sec" id="pendingSec"><h3>${hasPending ? "편집 중 (미적용)" : "편집"}</h3><div id="pendingBody"></div></div>`;
  html += `<div class="side-sec"><h3>수정 전 점검 — 건드리면 안 되는 칸</h3><div id="fragileBox"></div></div>`;

  // 파일에도 화면에도 같은 번호를 쓴다 — 받는 파일 이름이 "출력1_월간근무표…"인데
  // 버튼에는 번호가 없어서, 파트장이 "출력②를 입력②로 올리세요"라는 안내를 읽고도
  // 어느 버튼인지 되짚어야 했다. 번호가 곧 다음 달 입력 번호다(출력② → 입력②).
  html += `<div class="side-sec"><h3>다운로드</h3><div class="download-row">
    <button onclick="if (confirmDownloadWithViolations()) downloadXlsxOcs()" ${hasPending ? "disabled" : ""}><span class="io-tag">출력①</span>월간근무표</button>
    <button onclick="if (confirmDownloadWithViolations()) downloadStaffTable()" ${hasPending ? "disabled" : ""}><span class="io-tag">출력②</span>연간근무표</button>
  </div>
  ${hasPending
    ? '<p class="hint">적용 안 한 편집이 있습니다 — "재생성 적용"을 눌러야 다운로드할 수 있습니다.</p>'
    : '<p class="hint">출력②(연간근무표)를 보관해두면 다음 달에 <b>입력②</b>로 그대로 올려 이월정보를 이어갈 수 있습니다.</p>'}
  </div>`;

  // 엑셀에서 고친 월간근무표를 되올리는 자리. 다운로드 바로 아래에 둔다 —
  // 내려받아 고쳐서 되올리는 한 흐름이라 두 버튼이 떨어져 있으면 찾지 못한다.
  html += `<div class="side-sec"><h3>수정 엑셀 파일 업로드</h3>
    <button class="wide" onclick="uploadMonth()">수정 엑셀 파일 업로드</button>
    <p class="hint">내려받아 엑셀에서 고친 <b>출력① 월간근무표</b>를 올리면 그 값 그대로
    화면에 반영되고, 바뀐 칸은 확정(고정)으로 잠깁니다.</p>`;
  if (monthUploadJustApplied()) {
    // 올린 직후에만 두 갈래를 띄운다. 평소에 늘 떠 있으면 '재생성'이 눌리기 쉬운데,
    // 그건 고정 칸 말고는 표 전체를 다시 짜는 동작이라 되돌릴 수 없다.
    html += `<div class="upload-branch">
      <p class="branch-title">올린 수정본이 반영되었습니다 — 이제 어떻게 할까요?</p>
      <button class="wide" onclick="downloadBothOutputs()">① 즉시 다운로드</button>
      <p class="hint">고친 그대로 출력①·출력②를 내려받습니다. <b>다시 계산하지 않습니다.</b></p>
      <button class="wide" onclick="regenerateThenDownload()">② 재생성 후 다운로드</button>
      <p class="hint">고친 칸은 그대로 두고 <b>나머지를 규칙에 맞게 다시 짭니다</b> —
      고정하지 않은 칸은 사람이 바뀔 수 있습니다.</p>
    </div>`;
  }
  html += "</div>";

  // 입력 요약
  const ps = ST.params_summary;
  html += `<div class="side-sec"><h3>입력 요약</h3><ul class="issue-list" style="font-size:12px">
    <li style="background:var(--code-bg)">${ST.year}년 ${ST.month}월 · ${ST.staff.length}명 ·
    월최대야간 ${ps.max_nights}일 · NK ${ps.nk_count}명 · 공휴일 ${ps.holidays.length}개</li>` +
  `</ul></div>`;

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
    // 아래 그리드 통계와 같은 이름으로 — 엔진의 N은 NK를 더한 값이고, prn은 prn 계열 합계(반일 0.5)다.
    const nLabel = ST.staff.some(s => s.is_nk && !s.is_partjang) ? "N+NK" : "N";
    html += `<table class="mini-table"><tr><th>일</th><th>D</th><th>E</th><th>${nLabel}</th><th title="prn 계열 합계(반일 0.5명)">prn 합계</th></tr>` +
      r.daily.filter(d => !d.ok).map(d =>
        `<tr><td>${d.day}</td><td class="${d.counts.D < d.min.D ? "badge-bad" : ""}">${d.counts.D}/${d.min.D}</td>` +
        `<td class="${d.counts.E < d.min.E ? "badge-bad" : ""}">${d.counts.E}/${d.min.E}</td>` +
        `<td class="${d.counts.N < d.min.N ? "badge-bad" : ""}">${d.counts.N}/${d.min.N}</td>` +
        `<td class="${d.counts.prn < d.min.prn ? "badge-bad" : ""}">${d.counts.prn}/${d.min.prn}</td></tr>`
      ).join("") + "</table>" +
      // 미달 (날짜, 근무)마다 "누구를 넣으면 채워지나" — 생성 뒤 Worker에 따로 물어 채운다
      '<div id="fillHintsBox" class="side-note">채울 수 있는 사람을 찾는 중…</div>';
  }
  html += "</div>";

  // 주말·공휴일 근무자 명단 — "이번 주말에 누가 서나"를 그리드를 훑지 않고 본다
  html += renderWeekendRoster();

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

  // 부담 요약 — 파트장이 손봐야 할 사람이 누군지 한눈에. 그리드 오른쪽 부담 열과 같은 숫자를
  // 사람별로 추린다: 주말 근무가 많은 순, 야간이 목표와 다른 사람, D·E가 한쪽으로 쏠린 사람.
  // 숫자는 그리드에서 그 자리에서 세므로 칸을 고치면 재생성 전에도 바뀐다.
  html += renderBurdenSummary();

  // 시도 점수표 — 시드마다 어떤 숫자로 견줘 어느 것을 골랐는지. 앞 열이 다르면 뒤 열은 보지 않는다
  // (운영 필수 → 숙련도 → 공평성 → 전체 하드, 2026-10-30 결정). 공평성은 주말·야간·D/E·원티드 미반영의 합(사람·일 수).
  if (ST.attempt_table && ST.attempt_table.length > 0) {
    const rows = ST.attempt_table;
    // 꼼꼼히 만들기(9회)면 줄이 아홉이라 옆 칸이 길어진다 — 점수 상위 3줄(+지금 보는 표)만 펴고 나머지는 접는다.
    const ranked = [...rows].sort((a, b) => (attemptBetter(a, b) ? -1 : attemptBetter(b, a) ? 1 : 0));
    const shown = new Set(ranked.slice(0, 3).map(a => a.seed));
    shown.add(ST.current_seed);
    const folded = rows.filter(a => !shown.has(a.seed)).length;
    const thoroughRun = (window.__genMode || "").includes("thorough");
    html += `<div class="side-sec"><h3>시도 점수표 <span class="count-badge">시드 ${rows.length}개</span>` +
      `<span class="tap-hint">줄을 누르면 그 시드의 표로 바뀝니다(다운로드도 그 표)</span></h3>` +
      `<table class="mini-table attempt-table${attemptTableExpanded ? " expanded" : ""}"><tr><th>시드</th><th title="최소인력·지정·연속근무 등 그날 병동이 못 돌아가는 필수 위반">운영필수</th>` +
      '<th title="조에 숙련도 4 이상이 없는 횟수(H1-5)">숙련도</th><th title="2×횟수+주말+조구성+단독+미반영 — 전체 하드보다 먼저 본다">공평성</th><th title="최선노력 규칙까지 포함한 전체 하드 위반">전체</th>' +
      '<th title="같은 조건끼리 D·E·N 횟수가 가능일 비례 목표에서 벗어난 날수의 합(×2로 가장 무겁게)">횟수</th>' +
      '<th title="같은 조건끼리 주말 근무가 평균에서 벗어난 날수">주말</th>' +
      '<th title="날짜·조마다 레벨 띠(1-2·3·4-5) 구성이 병동 비율에서 벗어난 사람 수의 합">조구성</th>' +
      '<th title="혼자 Lv4+인 조에 선 횟수가 고연차 평균에서 벗어난 횟수의 합">단독</th>' +
      '<th title="반려된 원티드 신청 건수">미반영</th></tr>' +
      rows.map(a => {
        const cur = a.seed === ST.current_seed;
        const cls = (a.chosen ? "chosen " : "") + (cur ? "current " : "") + (shown.has(a.seed) ? "" : "attempt-fold");
        const mark = (a.chosen ? " ✓" : "") + (cur ? " ◀" : "");
        const v = k => (a[k] === undefined ? "–" : a[k]);
        return `<tr class="${cls}" data-seed="${a.seed}" role="button" tabindex="0" ` +
          `title="${escAttr(cur ? "지금 보는 표" : `시드 ${a.seed}의 표로 바꿔 보기`)}"><td>${a.seed}${a.strategy && a.strategy !== "-" ? `<small class="strat" title="${escAttr(STRATEGY_HELP[a.strategy] || a.strategy)}">${a.strategy}</small>` : ""}${mark}</td><td>${a.blocking}</td><td>${a.h15}</td><td><b>${a.fairness}</b></td><td>${a.hard}</td>` +
          `<td>${v("count")}</td><td>${v("weekend")}</td><td>${v("mix")}</td><td>${v("sole")}</td><td>${v("wanted")}</td></tr>`;
      }).join("") +
      '</table>' +
      (folded ? `<p class="side-note"><button class="linklike attempt-more" data-n="${folded}">${attemptTableExpanded ? "점수 상위 3줄만 보기" : `나머지 ${folded}개 시드 보기`}</button></p>` : "") +
      `<p class="side-note">앞 열부터 견줘 다르면 뒤 열은 보지 않습니다 — 운영 필수 → 숙련도 → 공평성 → 전체(노랑 포함). 공평성 = 2×횟수 + 주말 + 조구성 + 단독 + 미반영(단위: 사람·일, 낮을수록 좋음), 뒤 다섯 열이 그 구성. ` +
      `시드 옆 글자는 그 시도의 탐색 전략(W 주말 몫 우선 · S 고연차 먼저 · B 블록 이어가기 먼저 — 글자에 마우스를 올리면 설명). ` +
      `✓ = 점수가 가장 좋은 시드(기본값), ◀ = 지금 보는 표. <b>줄을 누르면 그 시드의 표로 바뀝니다</b>(다운로드도 그 표). ` +
      `${thoroughRun ? `🔍 꼼꼼히 만들기로 근무표 ${rows.length}개를 만들어 골랐습니다${rows.length < THOROUGH_ATTEMPTS ? "(중간에 멈춤)" : ""}. ` : ""}` +
      `${(window.__genMode || "").startsWith("parallel") ? `시드 ${rows.length}개를 여러 코어로 동시에 계산했습니다.` : ""}</p></div>`;
  }

  // 처리 로그
  if (r.logs.length > 0) {
    html += `<div class="side-sec"><h3>처리 로그 <span class="count-badge">${r.logs.length}건</span></h3>` +
      `<div class="log-box">${r.logs.map(esc).join("\n")}</div></div>`;
  }

  // 실험 기능 — 눈에 안 띄는 맨 아래. 월간 근무 보고(HTML 한 장)를 받는다. 다운로드 게이트는 출력①②와 같다.
  html += `<div class="side-sec side-exp"><p class="side-note">실험 기능 · <button class="linklike" onclick="if (confirmDownloadWithViolations()) downloadMagazine()" ${ST.pending.length ? "disabled" : ""} title="검증·일별 인원·주말 명단·사람별 집계·부담·원티드·고정 칸·야간·점수표·처리 기록을 한 파일에 — 열어서 인쇄하면 PDF">월간 근무 보고(HTML) 받기</button>${ST.pending.length ? " — 적용 안 한 편집이 있으면 받을 수 없습니다" : ""}</p></div>`;
  sidePane.innerHTML = html;
  renderPending();
}


// 미달 날 채울 후보 — 서버(new_hard_keys)가 "넣어도 새 필수 위반이 없는 사람"을 골라 준다.
async function refreshFillHints() {
  const box = document.getElementById("fillHintsBox");
  if (!box || !ST) return;
  try {
    const r = await api("/api/fill_hints", { method: "POST" });
    const items = (r && r.items) || [];
    if (!items.length) { box.textContent = ""; return; }
    box.className = "";
    box.innerHTML = '<ul class="burden-list">' + items.map(it => {
      const ok = it.ok.map(c => `<span class="who" title="${escAttr(c.warnings.length ? "최선노력 위반 생김: " + c.warnings.join(", ") : "새 위반 없음")}">${esc(c.id)}</span>` +
        (c.warnings.length ? `<small>(${esc(c.warnings.join(","))})</small>` : "")).join(", ");
      const bl = it.blocked.length ? ` <small>· 넣으면 필수 위반 ${it.blocked.length}명(${esc([...new Set(it.blocked.flatMap(b => b.rules))].join(","))})</small>` : "";
      return `<li>${it.day}일 ${esc(it.key)} ${it.have}/${it.need}명 → 위반 없이 넣을 수 있는 사람: ${ok || "<b>없음</b>"}${bl}</li>`;
    }).join("") + "</ul>" +
      '<p class="side-note">추천일 뿐입니다 — 다른 사람을 넣어도 됩니다(그 칸이 빨강·노랑으로 표시될 뿐, 확정·다운로드는 됩니다). ' +
      '목록은 쉬는 사람 중 그 근무를 설 수 있고 넣어도 새 필수 위반이 없는 사람이고, 괄호는 생기는 최선노력 위반입니다. 잠긴 칸·원티드는 뺐습니다.</p>';
  } catch (e) {
    box.textContent = "";
  }
}

// 주말·공휴일마다 누가 서는지 — D·E·N 이름과 최소인력 대비 인원
function renderWeekendRoster() {
  const days = (ST.days || []).map((d, i) => ({ ...d, i })).filter(d => d.weekend);
  if (!days.length) return "";
  const generals = ST.staff.filter(s => !s.is_partjang);
  const rows = days.map(d => {
    const who = { D: [], E: [], N: [] };
    for (const s of generals) {
      const v = (ST.grid[s.id] || [])[d.i];
      if (v === "D") who.D.push(s.id); else if (v === "E") who.E.push(s.id); else if (v === "N" || v === "NK") who.N.push(s.id);
    }
    const cell = k => {
      const need = (d.min && d.min[k]) || 0;
      const short = need && who[k].length < need;
      return `<td class="${short ? "badge-bad" : ""}" title="${escAttr(who[k].join(", ") || "없음")}">${who[k].length}${need ? `/${need}` : ""}<br><small>${esc(who[k].join(" "))}</small></td>`;
    };
    return `<tr><td>${d.n}일 ${esc(d.dow)}</td>${cell("D")}${cell("E")}${cell("N")}</tr>`;
  }).join("");
  return `<details class="side-sec"><summary><h3 style="display:inline">주말·공휴일 근무자 <span class="count-badge">${days.length}일</span></h3></summary>` +
    '<table class="mini-table weekend-roster"><tr><th>날</th><th>D</th><th>E</th><th>N</th></tr>' + rows + "</table>" +
    '<p class="side-note">인원/최소인력과 이름. 빨강은 미달. 접어 두면 자리를 안 차지합니다.</p></details>';
}

function renderBurdenSummary() {
  const people = ST.staff.filter(s => !s.is_partjang);
  if (!people.length) return "";
  const rows = people.map(s => {
    const row = ST.grid[s.id] || [];
    const b = burdenOf(s, row);
    const dCnt = row.filter(v => v === "D").length, eCnt = row.filter(v => v === "E").length;
    return { s, ...b, dCnt, eCnt };
  });
  // 주말: 같은 조건끼리 견주는 것이 정확하지만 화면은 단순하게 전체 평균과 견준다 —
  // 평균보다 2일 이상 많은 사람만 올린다(없으면 줄 자체를 안 그린다).
  const wkMean = rows.reduce((a, r) => a + r.weekend, 0) / rows.length;
  const wkTop = rows.filter(r => r.weekend - wkMean >= 2).sort((a, b) => b.weekend - a.weekend || a.s.id.localeCompare(b.s.id)).slice(0, 5);
  const wkLow = rows.filter(r => wkMean - r.weekend >= 2).sort((a, b) => a.weekend - b.weekend || a.s.id.localeCompare(b.s.id)).slice(0, 5);
  // 야간: 목표(4·6)와 다른 사람. 야간전담은 15일 고정이라 다르면 그 자체가 문제다.
  const nightOff = rows.filter(r => r.s.night_target != null && r.nights !== r.s.night_target)
    .sort((a, b) => Math.abs(b.nights - b.s.night_target) - Math.abs(a.nights - a.s.night_target) || a.s.id.localeCompare(b.s.id));
  // D·E 쏠림: D와 E를 둘 다 설 수 있는 사람 중 병동 비율에서 2회 넘게 벗어난 사람.
  const de = rows.filter(r => !r.s.is_nk && r.s.allowed.includes("D") && r.s.allowed.includes("E"));
  const totD = de.reduce((a, r) => a + r.dCnt, 0), tot = de.reduce((a, r) => a + r.dCnt + r.eCnt, 0);
  const ratio = tot ? totD / tot : 0;
  const deOff = de.map(r => ({ ...r, dev: r.dCnt - ratio * (r.dCnt + r.eCnt) }))
    .filter(r => Math.abs(r.dev) > 2).sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev)).slice(0, 5);
  // 연속근무 상한 초과(필수 위반이기도 하다 — 위 위반 목록에도 뜨지만 여기서는 사람 단위로)
  const maxC = (ST.params_summary && ST.params_summary.max_consecutive_work) || 5;
  const runOver = rows.filter(r => r.maxRun > maxC).sort((a, b) => b.maxRun - a.maxRun);
  // 단독 고연차: 그 조에 Lv4+가 자기뿐인 횟수 — 고연차끼리 평균에서 2회 이상 많은 사람
  const soleCnt = {};
  const seniors = people.filter(s => s.level >= 4);
  for (const s of seniors) soleCnt[s.id] = 0;
  for (let d = 0; d < ST.num_days; d++) {
    for (const codes of [["D"], ["E"], ["N", "NK"]]) {
      const hi = seniors.filter(s => codes.includes((ST.grid[s.id] || [])[d]));
      if (hi.length === 1) soleCnt[hi[0].id]++;
    }
  }
  const soleMean = seniors.length ? Object.values(soleCnt).reduce((a, b) => a + b, 0) / seniors.length : 0;
  const soleTop = seniors.filter(s => soleCnt[s.id] - soleMean >= 2).sort((a, b) => soleCnt[b.id] - soleCnt[a.id]).slice(0, 5);
  // 지난달 대비(연간근무표가 있을 때) — 주말이 2일 이상 늘거나 야간이 늘어난 사람
  const prev = ST.prev_burden || {};
  const prevMonth = Object.values(prev)[0] && Object.values(prev)[0].month;
  const wkUp = rows.filter(r => prev[r.s.id] && r.weekend - prev[r.s.id].weekend >= 2)
    .sort((a, b) => (b.weekend - prev[b.s.id].weekend) - (a.weekend - prev[a.s.id].weekend)).slice(0, 6);
  const nightUp = rows.filter(r => prev[r.s.id] && r.nights - prev[r.s.id].nights >= 2)
    .sort((a, b) => (b.nights - prev[b.s.id].nights) - (a.nights - prev[a.s.id].nights)).slice(0, 6);
  const items = [];
  if (wkUp.length) items.push(`<li>지난달(${esc(prevMonth)})보다 주말이 2일 이상 는 사람: ${wkUp.map(r => `<span class="who">${esc(r.s.id)}</span> ${prev[r.s.id].weekend}→${r.weekend}`).join(", ")}</li>`);
  if (nightUp.length) items.push(`<li>지난달보다 야간이 2회 이상 는 사람: ${nightUp.map(r => `<span class="who">${esc(r.s.id)}</span> ${prev[r.s.id].nights}→${r.nights}`).join(", ")}</li>`);
  if (wkTop.length) items.push(`<li>주말 근무 많음(평균 ${wkMean.toFixed(1)}일): ${wkTop.map(r => `<span class="who">${esc(r.s.id)}</span> ${r.weekend}일`).join(", ")}</li>`);
  if (wkLow.length) items.push(`<li>주말 근무 적음: ${wkLow.map(r => `<span class="who">${esc(r.s.id)}</span> ${r.weekend}일`).join(", ")}</li>`);
  if (nightOff.length) items.push(`<li>야간이 목표와 다름: ${nightOff.slice(0, 6).map(r => `<span class="who">${esc(r.s.id)}</span> ${r.nights}/${r.s.night_target}`).join(", ")}${nightOff.length > 6 ? ` 외 ${nightOff.length - 6}명` : ""}</li>`);
  if (deOff.length) items.push(`<li>D·E 쏠림(병동 D 비율 ${(ratio * 100).toFixed(0)}%): ${deOff.map(r => `<span class="who">${esc(r.s.id)}</span> D${r.dCnt}·E${r.eCnt}`).join(", ")}</li>`);
  if (runOver.length) items.push(`<li>연속근무 ${maxC}일 초과: ${runOver.map(r => `<span class="who">${esc(r.s.id)}</span> ${r.maxRun}일`).join(", ")}</li>`);
  if (soleTop.length) items.push(`<li>혼자 Lv4+인 조에 많이 섬(고연차 평균 ${soleMean.toFixed(1)}회): ${soleTop.map(s => `<span class="who">${esc(s.id)}</span> ${soleCnt[s.id]}회`).join(", ")}</li>`);
  const body = items.length ? `<ul class="burden-list">${items.join("")}</ul>`
    : '<p class="side-note">주말·야간·D/E·연속근무 어느 쪽도 눈에 띄게 쏠린 사람이 없습니다.</p>';
  return `<div class="side-sec"><h3>부담 요약 <span class="count-badge">${items.length}항목</span></h3>${body}` +
    '<p class="side-note">그리드 오른쪽 주말·연속·야간 열과 같은 숫자입니다. 칸을 고치면 바로 다시 셉니다. ' +
    '주말은 전체 평균과 2일 이상 차이 나는 사람만, D·E는 병동 비율에서 2회 넘게 벗어난 사람만 올립니다.</p></div>';
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
            `<button class="undo-edit" data-sid="${escAttr(sid)}" data-day="${day}">취소</button></li>`;
  }
  html += "</ul>";
  html += '<div id="feedbackBox"><p style="color:var(--sub);font-size:12px">피드백 확인 중...</p></div>';
  // 재생성은 고친 칸만 손보는 것이 아니라 표 전체를 다시 짠다. 한 칸만 바꿨다고
  // 생각하고 눌렀다가 다른 사람 근무가 통째로 움직여 있으면 그때는 되돌릴 수 없다.
  html += '<p class="apply-warn">누르면 <b>표 전체를 다시 짭니다</b> — ' +
          '고친 칸만 바뀌는 것이 아니라 다른 사람 근무도 함께 움직입니다. ' +
          '지금 표를 남겨두려면 먼저 내려받아 두세요.</p>';
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
  render({ keepScroll: true });
};

window.applyEdits = async function () {
  showGenOverlay("수정 사항을 반영해 다시 계산하는 중입니다…", thoroughOn(), true);
  // 재생성도 같은 엔진을 같은 입력으로 돌리므로 빠듯하면 똑같이 오래 걸린다.
  if (lastStaffing && lastStaffing.level && lastStaffing.level !== "ok") {
    markGenOverlaySlow("인원이 빠듯해 평소보다 오래 걸립니다 — 다시 계산 중입니다…");
  }
  // 몇 칸이 실제로 움직였는지 세어 보여준다 — "한 칸 고쳤을 뿐"이라는 오해를
  // 눌러본 직후에 깨는 것이 사후에 표를 대조하는 것보다 훨씬 싸다.
  const before = ST.grid || {};
  try {
    ST = await api("/api/apply", genOpts());
    SWAP = null;
    refreshFragile();
    let moved = 0;
    for (const sid in ST.grid) {
      const a = before[sid];
      if (!a) continue;
      const b = ST.grid[sid];
      for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) moved++;
    }
    render({ keepScroll: true });
    showToast(`${ST.round}회차로 재생성 완료 — ${moved}칸 바뀜`);
  } catch (e) {
  } finally {
    hideGenOverlay();
  }
};
