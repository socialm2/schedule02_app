// ================================================================ 접근성 보강 (a11y.js)
// app.js·platform.js를 건드리지 않고 **밖에서** 붙이는 보조기술·키보드 지원. 화면 로직과
// 섞지 않는 이유: 모달이 셋(설명서·그날 병동·여정)이고 근무인력 표는 다시 그려질 때마다
// 새 input이 생기는데, 각자 안에 같은 코드를 세 번 적으면 한 군데만 고쳐지는 사고가 난다
// (이 저장소의 반복 사고). 여기서는 DOM만 보고(MutationObserver·이벤트 위임) 일을 한다.
//
// 하는 일(2026-10-31 검토 C 3-2·3-3·3-5):
//   1. 모달이 열리면 포커스를 안으로 옮기고, Tab이 밖으로 못 나가게 가두고, 닫히면
//      열었던 요소로 되돌린다 — 설명서는 열어도 포커스가 버튼에 남아 Tab 6번이 전부
//      모달 밖으로 갔고, 디오라마·여정은 Esc 뒤 포커스가 body로 떨어져 키보드 사용자가
//      표에서의 자리를 잃었다.
//   2. 동적으로 만들어지는 모달에 aria-labelledby(제목)·버튼 aria-label(title에서)·
//      장식 캔버스 aria-hidden을 붙인다.
//   3. 근무인력 표의 숫자 칸 15개에 "D 평일 최소인력" 식 aria-label을 붙인다(th로만
//      암시돼 스크린리더에는 이름 없는 칸 15개였다).
//   4. 생성 진행 게이지에 aria-valuenow를 따라 적는다.
(function () {
  "use strict";
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return (r.width > 0 || r.height > 0) && getComputedStyle(el).visibility !== "hidden";
  }
  function focusables(root) {
    return [...root.querySelectorAll(FOCUSABLE)].filter(visible);
  }
  function openModals() {
    return [...document.querySelectorAll(".modal-backdrop.show")];
  }

  // ---- 1. 열림/닫힘 감시 — class="show"가 붙고 떨어지는 것을 본다(app.js의 열고 닫는 길이 여럿이라
  //         함수를 가로채지 않고 결과(DOM)만 본다).
  const opener = new WeakMap();       // backdrop → 열 때 포커스가 있던 요소
  const openerKey = new WeakMap();    // 표가 다시 그려져 그 노드가 사라졌을 때 좌표로 되찾기 위한 단서

  // 모달 밖에서 마지막으로 포커스를 가졌던 요소. MutationObserver는 app.js가 모달 안 첫 버튼에
  // focus()를 준 **뒤**에 돌기 때문에, 그 시점의 activeElement는 이미 모달 안이다 — 열기 전
  // 자리는 focusin으로 미리 적어 둬야 안다(처음엔 이걸 몰라 디오라마가 닫혀도 th로 못 돌아갔다).
  let lastOutside = null;
  document.addEventListener("focusin", (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (t.closest(".modal-backdrop, .picker")) return;
    lastOutside = t;
  }, true);

  function keyOf(el) {
    if (!el || el === document.body) return null;
    if (el.matches && el.matches("th.day-head[data-day]")) return { sel: `th.day-head[data-day="${CSS.escape(el.dataset.day)}"]` };
    if (el.matches && el.matches("td.nm[data-journey]")) return { sel: `td.nm[data-journey="${CSS.escape(el.dataset.journey)}"]` };
    if (el.id) return { sel: "#" + CSS.escape(el.id) };
    return null;
  }

  function onShow(bd) {
    const modal = bd.querySelector(".modal");
    if (!modal) return;
    const active = document.activeElement;
    // 모달 안에서 다른 모달로 넘어간 경우(디오라마 → 여정)는 원래 열었던 자리를 이어받는다.
    const from = openModals().find(o => o !== bd && o.contains(active));
    const src = from ? (opener.get(from) || lastOutside) : (bd.contains(active) ? lastOutside : active);
    opener.set(bd, src);
    openerKey.set(bd, from ? openerKey.get(from) : keyOf(src));
    decorate(bd, modal);
    // app.js가 스스로 첫 버튼에 포커스를 주는 모달(디오라마·여정)은 그대로 두고, 안 주는
    // 설명서만 닫기 버튼으로 옮긴다. 한 프레임 뒤에 보는 이유: 열자마자 app.js가 focus()를
    // 부르는 순서보다 늦어야 한다.
    requestAnimationFrame(() => {
      if (!bd.classList.contains("show")) return;
      if (modal.contains(document.activeElement)) return;
      const close = modal.querySelector("#closeInfoBtn, [data-dio='close'], [data-jour='close']");
      const first = close || focusables(modal)[0] || modal;
      if (first === modal) modal.setAttribute("tabindex", "-1");
      first.focus();
    });
  }

  function onHide(bd) {
    const src = opener.get(bd);
    const key = openerKey.get(bd);
    opener.delete(bd); openerKey.delete(bd);
    // 다른 모달이 아직 열려 있으면(디오라마 → 여정) 그쪽이 포커스를 가진다.
    if (openModals().length) return;
    requestAnimationFrame(() => {
      const still = openModals().length;
      if (still) return;
      const act = document.activeElement;
      // app.js가 이미 어딘가(설명서 → #infoBtn, 피커 → 칸)로 되돌렸으면 존중한다.
      if (act && act !== document.body && !bd.contains(act)) return;
      let target = (src && src.isConnected && visible(src)) ? src : null;
      if (!target && key) target = document.querySelector(key.sel);
      if (target && target.focus) target.focus();
    });
  }

  // ---- 2. 이름·역할 보강
  function decorate(bd, modal) {
    if (!modal.getAttribute("role")) modal.setAttribute("role", "dialog");
    if (!modal.getAttribute("aria-modal")) modal.setAttribute("aria-modal", "true");
    const h2 = modal.querySelector(".modal-head h2");
    if (h2 && !modal.getAttribute("aria-labelledby")) {
      if (!h2.id) h2.id = (bd.id || "modal") + "Title";
      modal.setAttribute("aria-labelledby", h2.id);
    }
    // ◀ ▶ ✕ 같은 기호 버튼은 title만 있었다 — 접근성 이름으로 올린다(터치에서는 title이 안 보인다).
    for (const b of modal.querySelectorAll(".modal-head button, .dio-nav button")) {
      if (!b.getAttribute("aria-label") && b.title) b.setAttribute("aria-label", b.title);
    }
    // 여정 캔버스는 장식(정보는 옆 카드에 글로 있다).
    const cv = modal.querySelector("canvas");
    if (cv && !cv.hasAttribute("aria-hidden")) cv.setAttribute("aria-hidden", "true");
  }

  const attrObs = new MutationObserver((muts) => {
    for (const m of muts) {
      const bd = m.target;
      const now = bd.classList.contains("show");
      const was = (m.oldValue || "").split(/\s+/).includes("show");
      if (now && !was) onShow(bd);
      else if (!now && was) onHide(bd);
    }
  });
  function watchBackdrop(bd) {
    if (bd.__a11yWatched) return;
    bd.__a11yWatched = true;
    attrObs.observe(bd, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    if (bd.classList.contains("show")) onShow(bd);
  }
  for (const bd of document.querySelectorAll(".modal-backdrop")) watchBackdrop(bd);
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.classList.contains("modal-backdrop")) watchBackdrop(n);
      else for (const bd of n.querySelectorAll(".modal-backdrop")) watchBackdrop(bd);
    }
  }).observe(document.body, { childList: true, subtree: true });

  // ---- 1b. Tab 가두기 — 모달이 열려 있고 피커(자기 가둠이 있다)가 없을 때.
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Tab" || document.querySelector(".picker")) return;
    const open = openModals();
    if (!open.length) return;
    const bd = open[open.length - 1];
    const modal = bd.querySelector(".modal") || bd;
    const list = focusables(modal);
    if (!list.length) { ev.preventDefault(); return; }
    const i = list.indexOf(document.activeElement);
    let next;
    if (i < 0) next = ev.shiftKey ? list[list.length - 1] : list[0];
    else if (ev.shiftKey) next = i === 0 ? list[list.length - 1] : list[i - 1];
    else next = i === list.length - 1 ? list[0] : list[i + 1];
    ev.preventDefault();
    next.focus();
  }, true);

  // ---- 3. 근무인력 숫자 칸 이름 — 행 첫 칸(근무)과 열 머리(td의 data-label)로 만든다.
  function labelMinStaff() {
    const table = document.getElementById("minStaffTable");
    if (!table) return;
    for (const tr of table.querySelectorAll("tbody tr")) {
      const row = (tr.firstElementChild && tr.firstElementChild.textContent || "").trim();
      for (const inp of tr.querySelectorAll("input")) {
        const td = inp.closest("td");
        const col = td && td.dataset.label ? td.dataset.label : "";
        const label = `${row} ${col} 최소인력`.replace(/\s+/g, " ").trim();
        if (inp.getAttribute("aria-label") !== label) inp.setAttribute("aria-label", label);
      }
    }
  }
  const ms = document.getElementById("minStaffTable");
  if (ms) {
    labelMinStaff();
    new MutationObserver(labelMinStaff).observe(ms, { childList: true, subtree: true });
  }

  // ---- 4. 진행 게이지 값
  const fill = document.getElementById("genProgressFill");
  const bar = fill && fill.parentElement;
  if (fill && bar) {
    const sync = () => {
      const w = parseFloat(fill.style.width);
      if (!isNaN(w)) bar.setAttribute("aria-valuenow", String(Math.round(w)));
    };
    sync();
    new MutationObserver(sync).observe(fill, { attributes: true, attributeFilter: ["style"] });
  }
})();
