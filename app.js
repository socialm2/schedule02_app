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
// 막는 이유는 인원 계산이다: 최소인력·레벨 통계는 파트장을 빼고 세므로(computeDailyStaffCounts),
// 파트장에게 D를 주면 그날 사람이 하나 더 있는 것처럼 보이는데 어느 숫자에도 안 잡힌다.
// NK도 같이 막는다 — 야간전담이라 이 앱은 어디서나 NK를 N으로 센다(COUNT_KEY).
// 서버(webapp/app.py·pyodide-app/py/bridge.py의 _PARTJANG_BLOCKED_SHIFTS)도 같은 다섯으로
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
      "2025-03-01", "2025-05-05", "2025-06-06", "2025-08-15", "2025-10-03",
      "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-09", "2025-12-25",
    ],
    substitutes: ["2025-03-03", "2025-05-06", "2025-10-08"],
  },
  2026: {
    holidays: [
      "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01",
      "2026-05-01", "2026-05-05", "2026-05-24", "2026-06-06", "2026-07-17",
      "2026-08-15", "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03",
      "2026-10-09", "2026-12-25",
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
      "2027-02-09", "2027-05-03", "2027-07-19", "2027-08-16",
      "2027-10-04", "2027-10-11", "2027-12-27",
    ],
  },
  2028: {
    holidays: [
      "2028-01-01", "2028-01-26", "2028-01-27", "2028-01-28", "2028-03-01",
      "2028-05-01", "2028-05-02", "2028-05-05", "2028-06-06", "2028-07-17",
      "2028-08-15", "2028-10-02", "2028-10-03", "2028-10-04", "2028-10-09",
      "2028-12-25",
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
      "2030-05-01", "2030-05-05", "2030-05-09", "2030-06-06", "2030-07-17",
      "2030-08-15", "2030-09-11", "2030-09-12", "2030-09-13", "2030-10-03",
      "2030-10-09", "2030-12-25",
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
      "2032-05-01", "2032-05-05", "2032-05-16", "2032-06-06", "2032-07-17",
      "2032-08-15", "2032-09-18", "2032-09-19", "2032-09-20", "2032-10-03",
      "2032-10-09", "2032-12-25",
    ],
    substitutes: [
      "2032-05-03", "2032-05-17", "2032-07-19", "2032-08-16",
      "2032-09-21", "2032-10-04", "2032-10-11", "2032-12-27",
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
      "2034-05-01", "2034-05-05", "2034-05-25", "2034-06-06", "2034-07-17",
      "2034-08-15", "2034-09-26", "2034-09-27", "2034-09-28", "2034-10-03",
      "2034-10-09", "2034-12-25",
    ],
    substitutes: ["2034-02-21"],
  },
  2035: {
    holidays: [
      "2035-01-01", "2035-02-07", "2035-02-08", "2035-02-09", "2035-03-01",
      "2035-05-01", "2035-05-05", "2035-05-15", "2035-06-06", "2035-07-17",
      "2035-08-15", "2035-09-15", "2035-09-16", "2035-09-17", "2035-10-03",
      "2035-10-09", "2035-12-25",
    ],
    substitutes: ["2035-05-07", "2035-09-18"],
  },
  2036: {
    holidays: [
      "2036-01-01", "2036-01-27", "2036-01-28", "2036-01-29", "2036-03-01",
      "2036-05-01", "2036-05-03", "2036-05-05", "2036-06-06", "2036-07-17",
      "2036-08-15", "2036-10-03", "2036-10-04", "2036-10-05", "2036-10-09",
      "2036-12-25",
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
      "2038-05-01", "2038-05-05", "2038-05-11", "2038-06-06", "2038-07-17",
      "2038-08-15", "2038-09-12", "2038-09-13", "2038-09-14", "2038-10-03",
      "2038-10-09", "2038-12-25",
    ],
    substitutes: [
      "2038-05-03", "2038-07-19", "2038-08-16", "2038-09-15",
      "2038-10-04", "2038-10-11", "2038-12-27",
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
      "2039-01-26", "2039-05-02", "2039-05-03", "2039-07-18",
      "2039-10-04", "2039-10-05", "2039-10-10", "2039-12-26",
    ],
  },
  2040: {
    holidays: [
      "2040-01-01", "2040-02-11", "2040-02-12", "2040-02-13", "2040-03-01",
      "2040-05-01", "2040-05-05", "2040-05-18", "2040-06-06", "2040-07-17",
      "2040-08-15", "2040-09-20", "2040-09-21", "2040-09-22", "2040-10-03",
      "2040-10-09", "2040-12-25",
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
let lastConfigWarning = null;  // set_config가 돌려준 경고(예: 연간근무표 이월 불일치) — 출력화면에 계속 보여줌
// set_config가 돌려준 인력 압박 진단(엔진의 staffing_pressure). 생성 대기화면과
// 출력화면에 함께 쓴다. 안내 문구는 엔진이 만든 것을 그대로 쓴다 — 화면이 두 벌이라
// 여기서 문구를 조립하면 언젠가 한쪽만 고쳐져 같은 상황에 다른 안내가 나간다.
let lastStaffing = null;
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
<span class="kbd">NK</span> 야간전담 · <span class="kbd">prn</span> 정규 · <span class="kbd">8A</span>/<span class="kbd">9A</span> 파트장·리더 상근 ·
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
뜻이 갈리므로 반려합니다.</li>
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
<li><b>편집</b> — 그리드에서 칸을 클릭해 근무를 바꾸면 오른쪽에 스테이징됩니다(주황 점선 테두리).
바꾼 칸과 관련된 규칙 위반이 있으면 바로 알려줍니다. 파트장 칸은 <b>D·E·N·NK·prn만 막고</b>
연차·병가·교육·8A 등은 고를 수 있습니다(휴가 신청이 8A에 덮이지 않게 잠급니다).
B팀(신입) 칸은 누르면 바로 반영되고, 재생성 대기 목록에 쌓이지 않습니다.</li>
<li><b>재생성 적용</b> — 스테이징한 편집을 고정한 채 나머지를 다시 배정합니다. 고정된 칸은 빨간
실선 테두리로 표시되고, <b>이후 몇 번을 더 수정해도 이전 고정은 계속 유지됩니다.</b> 편집을
스테이징한 상태(재생성 적용 전)에는 아래 두 다운로드 버튼이 잠시 비활성화됩니다 — 재생성
적용으로 확정한 뒤 다시 눌러야 받을 수 있습니다.</li>
<li><b>다운로드</b> — <b>월간근무표</b>(병원 OCS 형식, 부서 배포·기록용)와 <b>연간근무표</b>(다음 달
입력②로 바로 재사용 — 이월정보·형평성 지표가 여기 하나로 이어짐) 두 파일을 꼭 둘 다 받아 보관하세요.</li>
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
<li><b>D / E / N</b> — 이번 달 근무유형별 횟수입니다.</li>
<li><b>® / ⓡ</b> — 병원 HR 전용 항목이라 이 앱은 값을 몰라 항상 빈칸입니다(다운로드 파일과 동일).</li>
<li><b>금월</b> — 이번 달 휴일수(전 직원 공통) · <b>Lv</b> — 직급입니다.</li>
</ul>

<h3>그리드 맨 아래 "통계" 줄</h3>
<p>날짜마다 그날 몇 명이 서는지를 세어 보여줍니다. 칸을 수정하면 재생성 적용 전에도 바로 다시 셉니다.</p>
<ul>
<li><b>D · E · N · prn 인원</b> — 그날 각 근무에 서는 사람 수입니다. <b>N 인원에는 NK가, prn 인원에는
8A·9A·10A와 8H·9H·10H, 그리고 그 변형(8A*·8A◎ 등)이 함께 들어갑니다.</b>
반일 근무(8AH·9AH·9H*)만 <b>0.5명</b>으로 세기 때문에 "2.5" 같은 값이 뜰 수 있습니다 —
반나절만 서는 사람을 온종일 선 것으로 세면 못 채운 날이 채운 날처럼 보이기 때문입니다.</li>
<li><b>지정 인원</b> — 근무인력 표의 '지정' 값이 0보다 클 때만 나옵니다. 가능근무 칸에
'지정'을 적은 사람이 그날 D·E·N·prn 중 무엇이든 서면 한 명으로 세집니다(이름 옆에
<span class="kbd">지</span> 표가 붙습니다). 이미 위의 D·E·N·prn 인원에도 들어 있는
사람이라, 인력을 더 쓰는 값이 아니라 <b>그 자리를 누가 채웠는지</b>를 따로 보는 줄입니다.
반일이어도 1명입니다 — 그 사람이 그날 병동에 있느냐를 보는 값이라서요.</li>
<li><b>파트장은 빼고 셉니다</b> — 최소인력 기준 자체가 파트장을 뺀 숫자라서, 같이 세면 파트장의 8A가
prn으로 잡혀 못 채운 날이 채운 날처럼 보입니다.</li>
<li><b>빨간 칸 = 그날 최소인력에 못 미침</b>입니다. 칸에 마우스를 올리면 "3일 N 4명 (기준 5명)"처럼
실제 인원과 기준이 같이 뜹니다. 평일·토요일·일요일·공휴일마다 기준이 다르므로, 같은 숫자라도
어떤 날은 빨갛고 어떤 날은 아닙니다.</li>
<li><b>레벨평균 · Lv4-5 · Lv1-3</b> — 그날 근무자의 숙련도 평균과, 고랩·저랩이 각각 몇 명인지입니다.
특정 날에 저랩만 몰리지 않았는지 볼 때 씁니다.</li>
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
      max_consecutive_work: readMinStaffCell("f_maxconsecutive", "연속근무제한"),
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

$("#wantedInput").onchange = async () => {
  const f = $("#wantedInput").files[0];
  if (!f) return;
  const statusEl = $("#wantedStatus");
  try {
    const data = await apiUpload("/api/upload_wanted", f);
    // 이 파일의 연월이 곧 '생성할 달'이다 — 파트장이 OCS에서 그 달 날짜를 복붙해
    // 만들기 때문. 예전엔 화면 설정과 다르면 반려했는데, 그러면 파일을 올리기 전에
    // 화면 연월부터 맞춰야 해서 순서를 틀리기 쉬웠다. 이제 화면을 파일에 맞춘다.
    // (일수가 다른 달이면 서버가 먼저 반려한다 — 신청 날짜가 어긋나기 때문.)
    const selY = parseInt($("#f_year").value, 10);
    const selM = parseInt($("#f_month").value, 10);
    const monthChanged = (data.year !== selY || data.month !== selM);
    if (monthChanged) setFormYearMonth(data.year, data.month);
    formRequests = data.requests.map(r => ({ ...r, priority: 1 }));  // 이전 신청 목록을 통째로 대체
    // 이 파일에 인원 정보(직급·숙련도·가능근무·비고)가 있으면 항상 우선해서 덮어쓴다 —
    // 입력①은 '이번 달 명단(미래)'이라 명단의 최종 기준이다(병동인력표·연간근무표보다 항상 우선).
    // 전입·전입일은 입력①에서만 받을 수도 있다(입력②가 OCS 지난달 근무표면 그 파일에
    // 전입 칸이 아예 없다). 생성할 때 서버로 같이 넘긴다.
    wantedTransferredIn = data.transferred_in || [];
    wantedTransferInDates = data.transfer_in_dates || {};
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
      (unk ? ` (인식 못 한 표시 ${unk}개: ${data.unknown_marks.join(", ")})` : "") +
      (monthChanged ? ` — 화면의 연월을 ${data.year}년 ${data.month}월로 맞췄습니다.` : "");
    wantedActiveTag = `${data.year}년 ${data.month}월`;
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
  staffOfWanted = [];
  wantedActiveTag = "";
  wantedTransferredIn = [];
  wantedTransferInDates = {};
  recomputeStaff();
  $("#f_team_b").value = "";
  updateTeamBCount();
  statusEl.textContent = formStaff.length
    ? `반영 해제했습니다 — 명단은 ${staffOfAnnual.length ? "입력②" : "샘플"}(${formStaff.length}명) 기준으로 돌아갔습니다.`
    : "반영 해제했습니다 — 현재 인원 명단이 없습니다.";
  $("#wantedClearBtn").style.display = "none";
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
function showGenOverlay(msg) {
  $("#genOverlayMsg").textContent = msg;
  const sub = $("#genOverlaySub");
  if (sub) sub.textContent = GEN_SUB_DEFAULT;   // 지난번 '느림' 문구가 남아있지 않게
  $("#genOverlay").style.display = "";
  const fill = $("#genProgressFill");
  fill.style.width = "0%";
  genProgressT0 = Date.now();
  genProgressBudget = GEN_TIME_BUDGET_SEC;
  clearInterval(genProgressTimer);
  genProgressTimer = setInterval(() => {
    const elapsed = (Date.now() - genProgressT0) / 1000;
    const budget = genProgressBudget;
    const pct = elapsed <= budget
      ? (elapsed / budget) * 92
      : 92 + Math.min(6, (elapsed - budget) * 0.5);
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
  if (sub) sub.textContent = GEN_SUB_TIGHT;
  genProgressBudget = GEN_TIME_BUDGET_TIGHT_SEC;
}
function hideGenOverlay() {
  $("#genOverlay").style.display = "none";
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
    const msg = `근무인력 칸을 확인해주세요 — ${minStaffErrors.join(" / ")}`;
    showToast(msg, true);
    showGenError(statusEl, msg);
    return;
  }
  const btns = [$("#generateBtn"), $("#generateBtnMid")].filter(Boolean);
  btns.forEach(b => b.disabled = true);
  if (statusEl) statusEl.textContent = "생성 중...";
  showGenOverlay("근무표를 생성하는 중입니다…");
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
    ST = await api("/api/generate", { method: "POST" });
    render();
    showToast(lastConfigWarning || "근무표 생성 완료", !!lastConfigWarning);
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
    fillForm(restoreSaveToggle() ? withSavedSettings(cfg) : cfg);
  } catch (e) {
    showToast("샘플 로드 실패 — 직접 입력해주세요", true);
  }
  settingsReady = true;
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
// 그 순간에 Flask 판이 ReferenceError로 넘어졌다 — 하필 알려야 할 때 말이 없었다.)
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

function render(opts) {
  if (!ST) return;
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
    // 지정 가능자는 이름 옆에 작은 '지' 표를 단다. .role(직급·Lv)은 폰에서 숨기지만
    // 이건 안 숨긴다 — 하단 '지정 인원' 행이 미달로 빨개졌을 때, 누구를 넣으면 되는지
    // 찾을 수 있는 유일한 단서라서다.
    const desigMark = s.is_designated
      ? '<span class="desig-mark" title="지정 가능(가능근무에 &#39;지정&#39;)">지</span>' : "";
    html += `<tr><td class="nm">${esc(s.id)}${desigMark}` +
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
      html += `<td class="${cls.join(" ")}" data-sid="${escAttr(s.id)}" data-day="${d}"${title} data-pick="1">` +
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
      const bRow = (ST.team_b_grid && ST.team_b_grid[name]) || [];
      html += `<tr><td class="nm">${esc(name)}<span class="role">B팀</span></td>` +
        `<td class="stat-col">–</td><td class="stat-col">–</td>`;
      for (let d = 0; d < ST.num_days; d++) {
        const v = bRow[d] || "";
        // 신입 칸은 파트장이 직접 채운다 — 엔진이 배정하지 않으므로 고쳐도 다시 계산할
        // 것이 없고, 그래서 '미적용 편집'으로 쌓지 않고 바로 반영한다(data-teamb).
        html += `<td class="cell ${shiftClass(v)}" data-sid="${escAttr(name)}" data-day="${d}"` +
                ` data-teamb="1" data-pick="1"><span>${esc(shiftText(v))}</span></td>`;
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

// 날짜별 D·E·N·prn 인원 — 레벨 통계와 같은 방식으로 화면 그리드에서 매번 다시 센다.
// 파트장은 뺀다: 최소인력이 파트장을 빼고 잡는 값이라(H1-1도 그렇게 본다) 같이 세면
// 파트장의 8A가 prn으로 잡혀 못 채운 날이 채운 것처럼 보인다.
const COUNT_KEY = { D: "D", E: "E", N: "N", NK: "N" };
const COUNT_WEIGHT = { D: 1, E: 1, N: 1, NK: 1 };
for (const c of PRN_FULL_CODES) { COUNT_KEY[c] = "prn"; COUNT_WEIGHT[c] = 1; }
for (const c of PRN_HALF_CODES) { COUNT_KEY[c] = "prn"; COUNT_WEIGHT[c] = 0.5; }
const COUNT_ROWS = ["D", "E", "N", "prn", "지정"];

function computeDailyStaffCounts() {
  const generals = ST.staff.filter(s => !s.is_partjang);
  const days = [];
  for (let d = 0; d < ST.num_days; d++) {
    const c = { D: 0, E: 0, N: 0, prn: 0, "지정": 0 };
    for (const s of generals) {
      const v = ST.grid[s.id][d];
      const k = COUNT_KEY[v];
      if (k) c[k] += COUNT_WEIGHT[v];
      // 지정은 **사람 수**다 — 반일이어도 그 사람은 그날 병동에 있으므로 1명이다.
      // 그리고 이미 위에서 D·E·N·prn 어딘가에 세어진 사람이라, 인력을 더 쓰는 값이
      // 아니라 "그 자리를 누가 채웠나"를 따로 보여주는 값이다.
      if (k && s.is_designated) c["지정"] += 1;
    }
    days.push(c);
  }
  return days;
}

// 하단 통계 7행(D·E·N·prn 인원 + 레벨평균·Lv4-5·Lv1-3)의 '화면에 보이는 값' 한 벌.
// 숫자가 아니라 글자로 두는 이유는 레벨평균 때문이다 — 소수 한 자리로 반올림해 보여주므로
// 숫자로 비교하면 눈에는 똑같은 3.4인데 "바뀌었다"고 표시하게 된다.
function computeFootValues() {
  const counts = computeDailyStaffCounts();
  const lv = computeDailyLevelStats();
  const out = {};
  for (const k of COUNT_ROWS) out[k] = counts.map(c => String(c[k]));
  out["레벨평균"] = lv.map(d => (d.avg === null ? "–" : d.avg.toFixed(1)));
  out["Lv4-5"] = lv.map(d => String(d.hi));
  out["Lv1-3"] = lv.map(d => String(d.lo));
  return out;
}

function renderDailyStaffCountRows(foot) {
  const counts = computeDailyStaffCounts();
  const blankTail = '<td class="stat-col">–</td>'.repeat(7);
  const blankHead = '<td class="stat-col">–</td><td class="stat-col">–</td>';
  // '지정' 행은 쓰는 병동에서만 붙인다 — 안 쓰는 병동에는 0만 늘어선 줄이 하나 더
  // 생길 뿐이고, 무슨 값인지 물어볼 일만 생긴다. 다운로드 엑셀도 같은 조건으로
  // 붙이고(_write_daily_staff_count_rows) 화면 안내도 그렇게 적혀 있는데, 화면만
  // 항상 붙이고 있었다 — 셋이 같은 말을 해야 한다.
  const usesDesignated = (ST.days || []).some(
    d => d.min && (d.min["지정"] || 0) > 0);
  return COUNT_ROWS.filter(k => k !== "지정" || usesDesignated).map(k =>
    `<tr class="level-foot-row"><td class="nm">${k} 인원</td>${blankHead}` +
    counts.map((c, d) => {
      // days[d].min이 없는 옛 응답(캐시된 예전 화면 등)에서는 색만 빠지고 숫자는 나온다.
      const need = (ST.days[d] && ST.days[d].min) ? (ST.days[d].min[k] || 0) : null;
      const short = need !== null && c[k] < need;
      // 미적용 편집 때문에 달라진 숫자는 바뀐 근무 칸과 같은 점선으로 묶어 준다 —
      // 깜빡임은 몇 초면 끝나므로, 반영/취소할 때까지 남는 표시가 따로 있어야
      // "내가 고쳐서 이렇게 된 숫자"를 나중에도 알아볼 수 있다. 기준 미달의 빨강은
      // 그대로 둔다(배경색과 테두리라 서로 가리지 않는다).
      const moved = BASE_FOOT && BASE_FOOT[k] && BASE_FOOT[k][d] !== foot[k][d];
      const cls = "stat-col" + (short ? " stat-short" : "") + (moved ? " count-changed" : "");
      const base = moved ? `\n수정 전 ${BASE_FOOT[k][d]}명 → 지금 ${c[k]}명` : "";
      const title = need === null && !moved ? ""
        : ` title="${escAttr(`${d + 1}일 ${k} ${c[k]}명` + (need === null ? "" : ` (기준 ${need}명)`) + base)}"`;
      // data-stat/data-day: 근무를 고쳤을 때 값이 달라진 칸만 찾아 깜빡이기 위한 표식.
      return `<td class="${cls}" data-stat="${k}" data-day="${d}"${title}>${c[k]}</td>`;
    }).join("") + `${blankTail}</tr>`).join("");
}

function renderDailyLevelFootRows() {
  const foot = computeFootValues();
  const blankTail = '<td class="stat-col">–</td>'.repeat(7);
  const blankHead = '<td class="stat-col">–</td><td class="stat-col">–</td>';
  // 레벨평균·Lv4-5·Lv1-3도 인원 행과 똑같이 다룬다. 근무를 하나 바꾸면 그날 누가
  // 서 있는지가 바뀌므로 이 셋도 같이 움직이는데, 표시가 없으면 조용히 달라진다 —
  // 레벨 균형은 파트장이 근무를 고칠 때 실제로 보는 값이라 놓치면 안 된다.
  const rowHtml = (label) =>
    `<tr class="level-foot-row"><td class="nm">${label}</td>${blankHead}` +
    foot[label].map((v, d) => {
      const moved = BASE_FOOT && BASE_FOOT[label] && BASE_FOOT[label][d] !== v;
      const title = moved
        ? ` title="${escAttr(`${d + 1}일 ${label} 수정 전 ${BASE_FOOT[label][d]} → 지금 ${v}`)}"` : "";
      return `<td class="stat-col${moved ? " count-changed" : ""}" ` +
             `data-stat="${label}" data-day="${d}"${title}>${v}</td>`;
    }).join("") + `${blankTail}</tr>`;
  // B팀 구분행과 같은 스타일로, 통계 3행 위에도 제목 행을 붙인다.
  const totalCols = 3 + ST.num_days + 7;  // 이름 + 잔휴2 + 날짜 + 계산열7
  const divider = `<tr class="team-b-divider"><td colspan="${totalCols}">통계</td></tr>`;
  return divider +
    renderDailyStaffCountRows(foot) +
    rowHtml("레벨평균") + rowHtml("Lv4-5") + rowHtml("Lv1-3");
}

// 그리드·사이드 패널·공휴일 달력은 통째로 다시 그려지므로, 개별 요소가 아니라 바뀌지 않는
// 상위 컨테이너에 한 번만 리스너를 건다(다시 그려도 계속 동작한다).
delegateClick(document.getElementById("gridContent"), 'td[data-pick="1"]',
  (td, ev) => openPicker(ev, td.dataset.sid, Number(td.dataset.day)));
delegateClick(document.getElementById("sidePane"), "button.undo-edit",
  (b) => undoEdit(b.dataset.sid, Number(b.dataset.day)));
delegateClick(document.getElementById("holidayCalendar"), "td[data-iso]",
  (td) => toggleHolidayDate(td.dataset.iso));

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
  if (isTeamB) {
    const b = document.createElement("button");
    b.textContent = "지움";
    if (!cur) b.classList.add("current");
    b.onclick = (e) => { e.stopPropagation(); stageEdit(sid, day, "", true); closePicker(); };
    div.appendChild(b);
  }
  document.body.appendChild(div);
  picker = div;
  pickerCell = td;
  td.classList.add("picking");
  ev.stopPropagation();
  setTimeout(() => document.addEventListener("click", closePicker, { once: true }), 0);
};
function closePicker() {
  if (picker) { picker.remove(); picker = null; }
  if (pickerCell) { pickerCell.classList.remove("picking"); pickerCell = null; }
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
// "안전 규칙은 모두 지켰습니다"라고 쓰지 않는다. 노란색으로 남는 항목에는 레벨4+ 배치
// (H1-5), 월 OFF 하한(H4-1), 야간 6회 이상일 때의 수면오프(H7-1)처럼 사람의 안전과
// 직결되는 것들이 섞여 있다. '안전'이라고 뭉뚱그리면 상세 규칙을 모르는 사람이 노란
// 목록을 안 읽고 승인한다 — 사실만 적는다: 무엇이 몇 건 남았는지.
// 필수 위반이 남은 근무표를 그대로 내려받아 확정하는 것을 막는다. 빨간 경고가 화면에
// 떠 있어도 다운로드 버튼은 그대로 눌렸고, 파일로 나가는 순간 그 근무표가 확정본이 된다.
// 무엇이 몇 건 남았는지 다시 한 번 보여주고 사람이 명시적으로 승인하게 한다.
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

// 확정 저장은 다운로드보다 무겁다 — 그 달을 기록에 넣는 동작이고, 그 기록이 다음 달
// 형평성 계산의 출발점이 된다. 못 채운 자리가 있는 채로 확정하면 "실제로는 못 돌아간
// 근무표"가 다음 달의 기준이 되는 셈이라, 무엇이 남았는지 보여주고 한 번 묻는다.
// 막지는 않는다 — 지정 미달처럼 하루가 구조적으로 안 채워지는 달이 실제로 나오는데,
// 막아버리면 파트장은 이월을 이어갈 방법이 없어진다.
function confirmFinalizeWithViolations() {
  const r = ST && ST.report;
  if (!r || !r.hard_count) return true;
  const lines = r.hard.filter(v => !v.best_effort).slice(0, 5)
    .map(v => `  · ${v.rule} ${v.message}`).join("\n");
  const more = r.hard_count > 5 ? `\n  … 외 ${r.hard_count - 5}건` : "";
  return confirm(
    `필수 위반 ${r.hard_count}건이 남아 있는 근무표입니다.\n\n${lines}${more}\n\n` +
    `확정 저장하면 이 값이 다음 달 형평성 계산의 출발점이 됩니다.\n` +
    `(연간 보기에서 그 달에 ⚠ 표시가 남습니다.)\n\n` +
    `그래도 확정하시겠습니까?`);
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
      지켰습니다. 다만 <b>추가 검토 ${total}건</b>이 남았습니다 — 레벨4+ 배치, 월 OFF 하한,
      수면오프처럼 지키는 게 원칙이지만 인원 사정상 못 맞출 수 있는 항목입니다. 아래 노란
      목록을 확인한 뒤 확정해 주세요.</p>`;
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
    html += '<ul class="issue-list issue-list-scroll">' + r.hard.map(v =>
      `<li class="${v.best_effort ? "soft" : "hard"}"><span class="rule">${esc(v.rule)}</span>${esc(v.message)}</li>`).join("") + "</ul>";
  }
  html += "</div>";

  // 편집한 게 없는데 "편집 중"이라고 뜨면 혼선을 주므로, 스테이징된 편집이 있을 때만
  // 그 제목을 쓰고 평소엔 그냥 "편집"이라고만 표시한다.
  const hasPending = ST.pending.length > 0;
  html += `<div class="side-sec" id="pendingSec"><h3>${hasPending ? "편집 중 (미적용)" : "편집"}</h3><div id="pendingBody"></div></div>`;

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
    if (!confirmFinalizeWithViolations()) return;
    try {
      // 위반이 남아 있어도 확인창에서 동의했으면 그대로 확정한다 — 잠금은 서버가 걸고
      // (api_finalize), 화면은 사용자의 동의를 전달만 한다.
      const r = await api("/api/finalize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      showToast(`${r.saved} 확정 저장 — 연간 근무표에 반영됨`);
      loadAnnualView();
    } catch (e) {}
  };
  loadAnnualView();
}

function renderCompactMonth(m) {
  // 위반이 남은 채로 확정한 달은 그렇게 표시한다 — 저장하고 나면 그 사실이 사라져,
  // 두 달 뒤에 "이 달 숫자가 왜 이렇지"를 되짚을 단서가 없었다.
  const warn = m.hard_count
    ? ` <span class="annual-hard" title="확정할 때 필수 위반 ${m.hard_count}건이 남아 있었습니다">⚠ 위반 ${m.hard_count}건</span>`
    : "";
  let html = `<div class="annual-month"><div class="annual-month-title">${m.year}년 ${m.month}월${warn}</div>`;
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
    '<th>월평균야간</th><th>주말야간</th>' +
    '<th title="야간을 2일 연속으로 선 횟수(일수가 아니라 건수)">2일 블록 야간</th>' +
    '<th title="야간을 3일 연속으로 선 횟수(일수가 아니라 건수)">3일 블록 야간</th></tr>';
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
      '<th>월평균야간</th><th>주말야간</th>' +
    '<th title="야간을 2일 연속으로 선 횟수(일수가 아니라 건수)">2일 블록 야간</th>' +
    '<th title="야간을 3일 연속으로 선 횟수(일수가 아니라 건수)">3일 블록 야간</th></tr>';
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
  showGenOverlay("수정 사항을 반영해 다시 계산하는 중입니다…");
  // 재생성도 같은 엔진을 같은 입력으로 돌리므로 빠듯하면 똑같이 오래 걸린다.
  if (lastStaffing && lastStaffing.level && lastStaffing.level !== "ok") {
    markGenOverlaySlow("인원이 빠듯해 평소보다 오래 걸립니다 — 다시 계산 중입니다…");
  }
  // 몇 칸이 실제로 움직였는지 세어 보여준다 — "한 칸 고쳤을 뿐"이라는 오해를
  // 눌러본 직후에 깨는 것이 사후에 표를 대조하는 것보다 훨씬 싸다.
  const before = ST.grid || {};
  try {
    ST = await api("/api/apply", { method: "POST" });
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
