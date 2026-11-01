// ================================================================ 생성 중 시각화 (genviz.js)
// 생성 오버레이의 캔버스(#genRain, 높이 160px)에 열한 가지 연출 중 하나를 그린다. 생성할 때마다 무작위로
// 고르되 직전 것은 빼고 고른다(같은 그림이 연달아 나오면 '무작위'로 안 보인다). 후보는 원래 있던 '비'(사용자가
// 남기라고 함) + docs/시각화/모음/시각화_9가지_261101.html에서 고른 것 가운데 여덟 가지(탐색과정은 사용자가
// 뺐다, 2026-11-01) + GPT 갤러리의 성장하는 해(02-04)·교환의 성좌(01-07). 원본을 160px 상자에서 눈에 보이게
// 줄였고, 뒤의 둘은 근무표와의 연결이 한눈에 보이게 다시 그렸다(사용자: '이해가 잘되게').
//  - 생성은 보통 3~10초라, 진행과 별개로 시간으로 도는 움직임(걷기·회전·재생선·탐색자·맞교환)을 3~5초 주기로
//    두어 처음 2~3초 안에 무엇을 보여 주는지 드러나게 했다(사용자). 진행에 묶인 것은 '채워지는' 부분이다.
//  - 그 밖에 GPT '탐색의 심연'(02)의 01·02·08·09·10·14 여섯이 random: false로 들어 있다 — 모음 페이지
//    (docs/시각화/모음/생성화면_17가지_261101.html)에서 __genVizForce로만 그리고 앱 생성 무작위에는 안 나온다
//    (사용자는 HTML 파일만 말했다, 2026-11-01). GenViz.NAMES는 무작위 후보 열하나, EXTRA_NAMES가 이 여섯.
//
// 지키는 것 — 열일곱 가지 모두 같다:
//  - 근무 글자·배치는 rosterRow() 한 곳에서 나온다. 칸마다 무작위로 뽑으면 N 4연속·E 8연속처럼 실제
//    근무표에 없는 줄이 나온다(사용자). 그래서 사람마다 블록으로 짠다 — 야간 2~3일 뒤 OFF 2일, 주간·저녁
//    3~5일 뒤 OFF(E로 끝나면 2일, E→D 없음).
//  - 진행은 게이지(#genProgressFill)의 비율 하나를 따른다(app.js가 progress()로 넘긴다). 실제 엔진의 칸
//    배치 순서가 아니라(Worker가 도는 동안은 알 수 없다) 날짜 순서로 놓는 연출이다(성장하는 해만 뿌리에서
//    가까운 칸부터). 게이지는 끝나기 전 98%에서 멈추므로 app.js가 98%를 1로 넘긴다. 끝까지 차면 완성된 모습.
//  - 다크/라이트: 다크면 캔버스가 바탕을 칠한다. 라이트면 바탕을 칠하지 않고(clearRect) CSS(.gen-rain)에
//    맡기며, 글자·선은 밝은·어두운 바탕 양쪽에서 대비 3:1 이상인 중간 톤이다. 삼성 인터넷 다크 모드는
//    라이트 페이지를 강제로 어둡게 칠하면서 캔버스 픽셀은 그대로 둬, 캔버스가 바탕을 칠하면 비 상자만
//    하얗게 떴다(2026-10-31 사용자 캡처).
//  - prefers-reduced-motion이면 움직임 없이 진행 상태만 0.5초마다 다시 그린다.
//  - 점검용 고정: window.__genVizForce = '야경'(이름이나 key, '비' 포함). 고른 것은 GenViz.current()로 읽는다.
// 이 파일은 그리기만 한다 — Worker·전송과 무관하다(app.js의 startGenViz가 부른다).
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  // 라이트 값은 #EEF2F0·#FFFFFF와 #121212·#202124 양쪽에 3:1 이상(2026-11-01 계산).
  const PAL = {
    dark: {
      bg: "#0b0f19", col: { D: "#60A5FA", E: "#FB923C", N: "#A78BFA", "/": "#9AA4B8" },
      ink: "#E8EEF6", sub: "#8C98AC", dim: "#9AA4B8", label: "rgba(232,238,246,.42)", flash: "#FFFFFF",
      gold: "#FFD678", red: "#FF6E5A", sun: "#FFC857", moon: "#E6E9FF",
      seek: ["#9FD8FF", "#C9B6FF", "#C7F5A8"], wall: ["#7FA88F", "#B9B07A", "#D6B06A"],
    },
    light: {
      clear: true, col: { D: "#2F7BE6", E: "#E0620F", N: "#7C6BE0", "/": "#7E888E" },
      ink: "#7A8580", sub: "#7E888E", dim: "#7E888E", label: "rgba(126,136,142,.75)", flash: "#0D9488",
      gold: "#B7791F", red: "#D9483B", sun: "#B7791F", moon: "#7C6BE0",
      seek: ["#2F7BE6", "#8B6FD6", "#4D9A3A"], wall: ["#7E888E", "#7A8580", "#B7791F"],
    },
  };
  const rgbCache = new Map();
  function rgba(hex, a) {
    let rgb = rgbCache.get(hex);
    if (!rgb) { const n = parseInt(hex.slice(1), 16); rgb = `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; rgbCache.set(hex, rgb); }
    return `rgba(${rgb},${a})`;
  }
  function rnd(i) { const x = Math.sin(i * 9301 + 49297) * 233280; return x - Math.floor(x); }
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // 한 사람의 한 달 — 열한 가지가 모두 이 줄을 쓴다(위 머리말). 연속근무는 5일을 넘지 않는다.
  function rosterRow(i, nD) {
    const out = []; let k = 0;
    const r = () => rnd(i * 977 + (k++) * 13 + 5);
    const push = (v, n) => { for (let j = 0; j < n; j++) out.push(v); };
    push("/", Math.floor(r() * 3));                    // 줄마다 시작을 어긋나게
    while (out.length < nD) {
      const t = r();
      if (t < .27) { push("N", 2 + Math.floor(r() * 2)); push("/", 2); continue; }
      const len = 3 + Math.floor(r() * 3);
      const dLen = t < .58 ? len : t < .8 ? 0 : 1 + Math.floor(r() * (len - 1));
      for (let j = 0; j < len; j++) out.push(j < dLen ? "D" : "E");
      push("/", dLen < len ? 2 : 1 + Math.floor(r() * 2));
    }
    return out.slice(0, nD);
  }
  // 같은 근무가 이어지는 구간 — 악보의 긴 음표, 궤도의 원호
  function runsOf(row) {
    const out = [];
    for (let d = 0; d < row.length; d++) {
      const v = row[d];
      if (v === "/") continue;
      const last = out[out.length - 1];
      if (last && last.v === v && last.d1 === d - 1) last.d1 = d; else out.push({ v, d0: d, d1: d });
    }
    return out;
  }

  // rosterRow가 지키는 줄 규칙 — 맞교환(교환의 성좌)이 이것을 깨면 그 교환은 하지 않는다.
  // E 다음 D 없음, E-OFF-D 없음, 야간은 2~3일 뒤 OFF 2일(달 끝은 예외), 연속근무 5일 이하.
  function validRow(r) {
    let work = 0;
    for (let d = 0; d < r.length; d++) {
      const v = r[d];
      work = v === "/" ? 0 : work + 1;
      if (work > 5) return false;
      if (v === "E" && (r[d + 1] === "D" || (r[d + 1] === "/" && r[d + 2] === "D"))) return false;
      if (v === "N" && r[d + 1] !== "N") {
        let n = 1; while (d - n >= 0 && r[d - n] === "N") n++;
        if (n > 3) return false;
        for (let k = 1; k <= 2 && d + k < r.length; k++) if (r[d + k] !== "/") return false;
      }
    }
    return true;
  }

  function paint(S, fill) {
    if (S.P.clear) S.x.clearRect(0, 0, S.w, S.h);
    else { S.x.fillStyle = fill || S.P.bg; S.x.fillRect(0, 0, S.w, S.h); }
  }
  function stars(S, n, maxY) {
    if (!S.dark) return;
    const x = S.x;
    for (let k = 0; k < n; k++) {
      const a = S.reduce ? .45 : .25 + .45 * Math.abs(Math.sin(S.now / 900 + k));
      x.fillStyle = `rgba(255,255,255,${a * .6})`;
      x.fillRect(rnd(k + 300) * S.w, rnd(k + 900) * maxY, 1.2, 1.2);
    }
  }
  // 칸 격자 — 아래 14px은 이름표 자리
  function gridLayout(S, padX, top, bottom) {
    const cs = Math.min((S.w - padX * 2) / S.nD, (S.h - top - bottom) / S.nS);
    return { cs, ox: (S.w - cs * S.nD) / 2, oy: top + (S.h - top - bottom - cs * S.nS) / 2 };
  }
  // 방금 놓인 칸은 잠깐 밝게(0~1, 1이면 방금)
  function fresh(S, key, dur) {
    if (S.reduce) return 0;
    const t0 = S.born.get(key);
    return t0 === undefined ? 0 : Math.max(0, 1 - (S.now - t0) / dur);
  }
  function crescent(x, cx, cy, r, fill) {
    x.save();
    x.beginPath(); x.rect(cx - r - 2, cy - r - 2, r * 2 + 4, r * 2 + 4); x.arc(cx + r * .45, cy - r * .3, r * .85, 0, TAU);
    x.clip("evenodd");
    x.fillStyle = fill; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    x.restore();
  }

  // ------------------------------------------------------------ 여정 — 한 사람이 날짜를 걸어간다
  // 원본: 개념1 여정 장면. 줄인 것: 카드·설명을 빼고, 해(D)·노을(E)·달(N)·쉼을 날짜 눈금 위에만 둔다.
  // 걸어온 날만 하늘에 뜬다. 아래 점 줄이 그 사람의 한 달 — 이것이 진행을 따른다(끝까지 가면 다 찬다).
  const journey = {
    key: "journey", name: "여정",
    init(S) {
      // 밤이 섞인 줄을 고른다 — 해만 뜨는 사람은 여정이 심심하다
      let best = 0, score = -1;
      for (let i = 0; i < S.nS; i++) {
        const row = S.plan[i], n = row.filter(v => v === "N").length, e = row.filter(v => v === "E").length;
        const s = Math.min(n, 6) + Math.min(e, 6) - (row[0] === "/" ? 1 : 0);
        if (s > score) { score = s; best = i; }
      }
      S.L.row = S.plan[best];
      if (S.dark) {
        const g = S.x.createLinearGradient(0, 0, 0, S.h);
        g.addColorStop(0, "#070b1f"); g.addColorStop(.62, "#1a2050"); g.addColorStop(1, "#0b1026");
        S.L.sky = g;
      }
    },
    draw(S) {
      const { x, w, h, P, nD } = S, row = S.L.row;
      paint(S, S.L.sky);
      stars(S, 26, h * .5);
      // 걷는 사람은 시간으로 걷는다(초당 2.4일) — 생성이 3초 만에 끝나도 해·노을·달을 몇 개 지나가야 한다.
      // 다만 진행(아래 점 줄)보다 8일 넘게 앞서지는 않고, 진행이 더 빠르면 진행을 따른다.
      const prog = S.ps * (nD - 1), pd = Math.min(nD - 1, Math.max(prog, Math.min(prog + 8, S.t / 1000 * 2.4)));
      const hy = h * .66, sp = 46, wx = w * .36;
      const ground = (sx) => hy + 3.5 * Math.sin((sx + pd * sp) / 70);
      // 지평선
      x.beginPath();
      for (let sx = 0; sx <= w; sx += 6) { const y = ground(sx); if (sx) x.lineTo(sx, y); else x.moveTo(sx, y); }
      if (S.dark) { x.lineTo(w, h); x.lineTo(0, h); x.closePath(); x.fillStyle = "#0d1330"; x.fill(); }
      else { x.strokeStyle = rgba(P.dim, .7); x.lineWidth = 1.2; x.stroke(); }
      x.textAlign = "center"; x.textBaseline = "middle";
      const cur = Math.round(pd);
      for (let d = 0; d < nD; d++) {
        const sx = wx + (d - pd) * sp;
        if (sx < -20 || sx > w + 20) continue;
        const gy = ground(sx), v = row[d], reached = d <= pd + .5, big = d === cur ? 1.25 : 1;
        x.strokeStyle = rgba(P.dim, reached ? .6 : .3); x.lineWidth = 1;
        x.beginPath(); x.moveTo(sx, gy - 1); x.lineTo(sx, gy - 8); x.stroke();
        x.font = `${d === cur ? 700 : 400} 10px system-ui, sans-serif`;
        x.fillStyle = d === cur ? P.ink : rgba(P.sub, reached ? .9 : .5);
        x.fillText(String(d + 1), sx, gy + 11);
        if (!reached) { x.strokeStyle = rgba(P.dim, .35); x.beginPath(); x.arc(sx, 30, 2.5, 0, TAU); x.stroke(); continue; }
        if (v !== "/") { x.font = "700 9px ui-monospace, Menlo, monospace"; x.fillStyle = P.col[v]; x.fillText(v, sx, gy + 22); }
        if (v === "D") {
          const r = 6.5 * big;
          x.strokeStyle = P.sun; x.lineWidth = 1.3;
          for (let k = 0; k < 8; k++) { const a = k * TAU / 8 + (S.reduce ? 0 : S.now / 4000); x.beginPath(); x.moveTo(sx + Math.cos(a) * r * 1.35, 28 + Math.sin(a) * r * 1.35); x.lineTo(sx + Math.cos(a) * r * 1.75, 28 + Math.sin(a) * r * 1.75); x.stroke(); }
          x.fillStyle = P.sun; x.beginPath(); x.arc(sx, 28, r, 0, TAU); x.fill();
        } else if (v === "E") {
          const r = 8 * big, cy = gy - 12;
          x.fillStyle = P.col.E; x.beginPath(); x.arc(sx, cy, r, Math.PI, TAU); x.closePath(); x.fill();
          x.strokeStyle = rgba(P.col.E, .7); x.lineWidth = 1; x.beginPath(); x.moveTo(sx - r * 1.5, cy + 2); x.lineTo(sx + r * 1.5, cy + 2); x.stroke();
        } else if (v === "N") {
          crescent(x, sx, 28, 7 * big, P.moon);
        } else {
          x.font = "10px system-ui, sans-serif"; x.fillStyle = rgba(P.sub, .9); x.fillText("쉼", sx, 29);
        }
      }
      // 걷는 사람
      const gy = ground(wx), moving = !S.reduce && pd < nD - 1 - .01, sw = moving ? Math.sin(S.now / 110) * 4.5 : 2;
      x.strokeStyle = P.ink; x.fillStyle = P.ink; x.lineWidth = 2; x.lineCap = "round";
      x.beginPath(); x.arc(wx, gy - 27, 4, 0, TAU); x.fill();
      x.beginPath(); x.moveTo(wx, gy - 22); x.lineTo(wx, gy - 11);
      x.moveTo(wx, gy - 11); x.lineTo(wx + sw, gy - 1); x.moveTo(wx, gy - 11); x.lineTo(wx - sw, gy - 1);
      x.moveTo(wx, gy - 19); x.lineTo(wx - sw, gy - 13); x.moveTo(wx, gy - 19); x.lineTo(wx + sw, gy - 13);
      x.stroke(); x.lineCap = "butt";
      // 한 달 점 줄 — 걸어온 날만 색
      const x0 = w * .3, x1 = w - 10, step = (x1 - x0) / nD;
      for (let d = 0; d < nD; d++) {
        const v = row[d], on = d <= prog + .5;
        x.fillStyle = on ? (v === "/" ? rgba(P.dim, .5) : P.col[v]) : rgba(P.dim, .18);
        x.beginPath(); x.arc(x0 + (d + .5) * step, h - 7, on && v !== "/" ? 2 : 1.4, 0, TAU); x.fill();
      }
    },
  };

  // ------------------------------------------------------------ 파문 — 완성된 표에서 칸 하나를 누르면 묶인 칸이 번진다
  // 원본: 개념1 파문 장면(완성표의 칸을 누르면 그 칸이 묶인 규칙이 번져 나감). 사용자(11/1): "완성된 표를 넣고
  // 클릭하면 하얗게 후보들이 나오면서 퍼지는 걸". 그래서 표는 처음부터 완성된 채로 두고, 2.4초마다 칸 하나를
  // 누른다(손끝 표시). 그 칸과 묶인 칸 — 같은 근무 블록, 이어진 연속근무, 밤 블록 뒤 이틀 쉼, 같은 날 같은 조 —
  // 이 가까운 것부터 하얀 테두리로 켜지며 퍼진다(원본과 같은 규칙, 거리만큼 늦게). 진행 막대와는 따로 돈다.
  const ripple = {
    key: "ripple", name: "파문",
    init(S) { S.L.g = gridLayout(S, 8, 6, 14); S.L.tap = null; S.L.n = -1; },
    // 원본 analyze()의 줄임 — 칸 하나에 묶인 칸과 거리(퍼지는 순서)
    related(S, i, d) {
      const row = S.plan[i], v = row[d], out = [], nD = S.nD;
      let a = d, b = d; while (a > 0 && row[a - 1] === v) a--; while (b < nD - 1 && row[b + 1] === v) b++;
      for (let k = a; k <= b; k++) if (k !== d) out.push([i, k, Math.abs(k - d)]);
      if (v === "N") for (let k = b + 1; k <= Math.min(nD - 1, b + 2); k++) out.push([i, k, k - d]);
      let s0 = d, e0 = d; while (s0 > 0 && row[s0 - 1] !== "/") s0--; while (e0 < nD - 1 && row[e0 + 1] !== "/") e0++;
      for (let k = s0; k <= e0; k++) if (row[k] !== v) out.push([i, k, Math.abs(k - d) + 1]);
      for (let j = 0; j < S.nS; j++) if (j !== i && S.plan[j][d] === v) out.push([j, d, 1 + Math.abs(j - i) * .6]);
      return out;
    },
    draw(S) {
      const { x, P, nS, nD } = S, { cs, ox, oy } = S.L.g, white = S.dark ? "#FFFFFF" : P.flash;
      paint(S);
      // 2.4초마다 다음 칸을 누른다 — 근무 칸만, 매번 다른 자리
      const n = S.reduce ? 0 : Math.floor((S.t + 2100) / 2400);
      if (n !== S.L.n) {
        S.L.n = n;
        let i, d, k = 0;
        do { i = Math.floor(rnd(n * 17 + k) * nS); d = 3 + Math.floor(rnd(n * 29 + k + 5) * (nD - 6)); k++; } while (S.plan[i][d] === "/" && k < 40);
        S.L.tap = { i, d, t0: S.reduce ? -1e9 : S.now, rel: ripple.related(S, i, d) };
      }
      const tap = S.L.tap, age = Math.max(0, (S.now - tap.t0) / 1000), lit = new Map();
      for (const [i, d, dist] of tap.rel) if (age * 7 > dist) lit.set(i * nD + d, dist);
      for (let i = 0; i < nS; i++) for (let d = 0; d < nD; d++) {
        const key = i * nD + d, v = S.plan[i][d], cx = ox + d * cs, cy = oy + i * cs, on = lit.has(key) || (i === tap.i && d === tap.d);
        const dim = age > .15 && !on ? .38 : 1;
        if (v === "/") { x.fillStyle = rgba(P.dim, .3 * dim); x.fillRect(cx + cs * .36, cy + cs * .36, cs * .28, cs * .28); }
        else { x.fillStyle = rgba(P.col[v], dim); x.fillRect(cx + cs * .12, cy + cs * .12, cs * .76, cs * .76); }
        if (lit.has(key)) {
          const fl = Math.max(0, 1 - (age * 7 - lit.get(key)) / 4);   // 막 켜진 칸은 더 밝게
          x.strokeStyle = rgba(white, .65 + .35 * fl); x.lineWidth = 1.2 + fl;
          x.strokeRect(cx + .6, cy + .6, cs - 1.2, cs - 1.2);
        }
      }
      // 누른 칸 — 굵은 테두리와 번지는 동그라미 셋, 손끝 표시
      const tx = ox + (tap.d + .5) * cs, ty = oy + (tap.i + .5) * cs;
      x.strokeStyle = white; x.lineWidth = 2.2; x.strokeRect(ox + tap.d * cs - .5, oy + tap.i * cs - .5, cs + 1, cs + 1);
      if (!S.reduce) for (let k = 0; k < 3; k++) {
        const r = ((age * 70 + k * 35) % 120); x.strokeStyle = rgba(white, Math.max(0, .55 - r / 120 * .55)); x.lineWidth = 1.4;
        x.beginPath(); x.arc(tx, ty, r + 2, 0, TAU); x.stroke();
      }
      const press = age < .25 ? 1 - age / .25 : 0;
      x.fillStyle = rgba(white, .35 + .4 * press); x.beginPath(); x.arc(tx + cs * .9, ty + cs * .9, 4 + 3 * press, 0, TAU); x.fill();
      x.textAlign = "right"; x.textBaseline = "alphabetic"; x.font = "10px system-ui, sans-serif"; x.fillStyle = S.P.label;
      x.fillText("칸을 누르면 묶인 칸이 번집니다", S.w - 7, S.h - 4);
    },
  };

  // ------------------------------------------------------------ 나선 — 한 달이 감겨 올라간다
  // 원본: 갤러리3 drawHelix(3D 계단). 줄인 것: 세 바퀴짜리 나선 하나, 사람은 나선 띠의 겹, 날짜가 지날수록
  // 위로. 놓인 칸만 띠가 되고, 아직 안 놓인 길은 옅은 선으로 미리 보인다. 5초에 한 바퀴 돈다.
  const helix = {
    key: "helix", name: "나선",
    init(S) {
      if (S.dark) { const g = S.x.createLinearGradient(0, 0, 0, S.h); g.addColorStop(0, "#090c18"); g.addColorStop(1, "#03040a"); S.L.bg = g; }
    },
    draw(S) {
      const { x, w, h, P, nS, nD } = S;
      paint(S, S.L.bg);
      const turns = 3, tilt = .2, Ro = Math.min(w * .4, 150), Ri = Ro * .45, band = (Ro - Ri) / nS;
      const ry = Ro * tilt, top = 6, bot = h - 14, rise = bot - top - ry * 2, cx = w / 2;
      const rot = S.reduce ? 0 : S.t / 5000 * TAU, TH = turns * TAU;
      const pt = (th, r) => { const a = th + rot; return [cx + Math.cos(a) * r, bot - ry - (th / TH) * rise + Math.sin(a) * r * tilt]; };
      // 갈 길(옅게)
      x.strokeStyle = rgba(P.dim, .16); x.lineWidth = 1; x.beginPath();
      for (let k = 0; k <= 180; k++) { const [px, py] = pt(k / 180 * TH, (Ri + Ro) / 2); if (k) x.lineTo(px, py); else x.moveTo(px, py); }
      x.stroke();
      const quads = [];
      for (let d = 0; d < nD; d++) {
        const th0 = d / nD * TH, th1 = (d + 1) / nD * TH - .03, z = Math.sin((th0 + th1) / 2 + rot);
        for (let i = 0; i < nS; i++) {
          const key = i * nD + d;
          if (S.rank[key] >= S.settled) continue;
          quads.push({ z, th0, th1, i, d, key });
        }
      }
      quads.sort((a, b) => a.z - b.z);
      for (const q of quads) {
        const v = S.plan[q.i][q.d], r0 = Ri + q.i * band, r1 = r0 + band * .85;
        const a = pt(q.th0, r0), b = pt(q.th0, r1), c = pt(q.th1, r1), e = pt(q.th1, r0);
        const depth = .4 + .6 * (q.z + 1) / 2, f = fresh(S, q.key, 600);
        x.fillStyle = f > .4 ? P.flash : rgba(P.col[v], (v === "/" ? .3 : 1) * depth);
        x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c[0], c[1]); x.lineTo(e[0], e[1]); x.closePath(); x.fill();
      }
    },
  };

  // ------------------------------------------------------------ 야경 — 밤의 도시, 근무가 놓이면 창에 불이 켜진다
  // 원본: 갤러리 drawCity. 사용자(11/1): "좀 더 야경스럽게 — 건물인지도 몰랐다, 달·별도 뜨고". 그래서 밤하늘
  // (그라데이션)·초승달·반짝이는 별·가끔 별똥별, 뒤편 먼 건물 실루엣, 앞에 한 주가 한 채인 빌딩(층 = 사람,
  // 창 = 그날 근무; 지붕·옥상 철탑·깜빡이는 항공등), 아래 물에 비친 불빛. 야경은 '그림'이라 라이트 모드에서도
  // 밤하늘을 칠한다(캔버스 바탕이 아니라 그림 속 하늘 — 강제 다크에서도 그대로 밤이다).
  const city = {
    key: "city", name: "야경",
    init(S) {
      const { x, w, h, nS, nD } = S;
      const sky = x.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#050816"); sky.addColorStop(.62, "#14183a"); sky.addColorStop(1, "#2a2350");
      const weeks = Math.ceil(nD / 7), gap = 9, water = 16;
      // 하늘을 위쪽 40% 남짓 남긴다 — 건물이 꽉 차면 달·별이 가려 '밤'으로 안 보였다
      const cs = Math.min((w - 40 - gap * (weeks - 1)) / nD, (h - water - Math.max(46, h * .36)) / nS);
      const W = cs * nD + gap * (weeks - 1), ground = h - water;
      const bld = [];
      for (let k = 0; k < weeks; k++) {
        const d0 = k * 7, d1 = Math.min(nD, d0 + 7), extra = 4 + rnd(k + 7) * 18;
        bld.push({ d0, d1, extra, roof: Math.floor(rnd(k + 31) * 3), mast: rnd(k + 53) > .4 });
      }
      const far = []; for (let k = 0, xx = 0; xx < w; k++) { const bw = 10 + rnd(k + 400) * 22, bh = 18 + rnd(k + 500) * 34; far.push([xx, bw, bh]); xx += bw + 1; }
      S.L.g = { sky, cs, ox: (w - W) / 2, ground, gap, oy: ground - cs * nS - 2, bld, far, water };
    },
    draw(S) {
      const { x, w, h, P, nS, nD } = S, g = S.L.g, { cs, ox, ground, gap, oy } = g;
      x.fillStyle = g.sky; x.fillRect(0, 0, w, h);
      // 별 — 반짝임, 가끔 별똥별
      for (let k = 0; k < 46; k++) {
        const a = S.reduce ? .5 : .25 + .55 * Math.abs(Math.sin(S.now / (700 + k * 23) + k));
        x.fillStyle = `rgba(255,255,255,${a * .8})`; const sz = rnd(k + 77) > .85 ? 1.8 : 1.1;
        x.fillRect(rnd(k + 300) * w, rnd(k + 900) * (oy - 10), sz, sz);
      }
      if (!S.reduce) { const c = (S.t % 4200) / 900; if (c < 1) { const sx = w * .2 + c * w * .35, sy = 8 + c * 22;
        const gr = x.createLinearGradient(sx - 26, sy - 9, sx, sy); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(255,255,255,.85)");
        x.strokeStyle = gr; x.lineWidth = 1.3; x.beginPath(); x.moveTo(sx - 26, sy - 9); x.lineTo(sx, sy); x.stroke(); } }
      // 달 — 은은한 빛무리와 초승달
      const mx = w - 30, my = 18, glow = x.createRadialGradient(mx, my, 2, mx, my, 34);
      glow.addColorStop(0, "rgba(255,244,214,.35)"); glow.addColorStop(1, "rgba(255,244,214,0)");
      x.fillStyle = glow; x.fillRect(mx - 34, my - 34, 68, 68); crescent(x, mx, my, 9, "#FFF4D6");
      // 먼 건물 실루엣
      x.fillStyle = "#0e1230"; for (const [fx, fw, fh] of g.far) x.fillRect(fx, ground - fh, fw, fh);
      const dx = (d) => ox + d * cs + Math.floor(d / 7) * gap;
      // 빌딩 — 한 주가 한 채
      g.bld.forEach((b, k) => {
        const bx = dx(b.d0) - 3, bw = (b.d1 - b.d0) * cs + 6, top = oy - 3 - b.extra;
        x.fillStyle = "#1a2047"; x.fillRect(bx, top, bw, ground - top);
        x.fillStyle = "#283066"; x.fillRect(bx, top, 2, ground - top); x.fillRect(bx, top, bw, 1.5);                     // 모서리 빛
        if (b.roof === 1) { x.fillStyle = "#1a2047"; x.fillRect(bx + bw * .2, top - 5, bw * .6, 5); }
        if (b.roof === 2) { x.fillStyle = "#1a2047"; x.beginPath(); x.moveTo(bx, top); x.lineTo(bx + bw / 2, top - 8); x.lineTo(bx + bw, top); x.fill(); }
        if (b.mast) {
          const mxx = bx + bw * .7, mt = top - (b.roof ? 16 : 12);
          x.strokeStyle = "#2b3263"; x.lineWidth = 1; x.beginPath(); x.moveTo(mxx, top - (b.roof === 1 ? 5 : 0)); x.lineTo(mxx, mt); x.stroke();
          const on = S.reduce || Math.floor((S.t + k * 370) / 600) % 2 === 0;
          if (on) { x.fillStyle = "rgba(255,80,80,.95)"; x.beginPath(); x.arc(mxx, mt, 1.6, 0, TAU); x.fill();
            x.fillStyle = "rgba(255,80,80,.18)"; x.beginPath(); x.arc(mxx, mt, 4.5, 0, TAU); x.fill(); }
        }
      });
      // 창문 — 층 = 사람, 칸 = 그날. 근무가 놓이면 불이 켜진다(색 = D·E·N), 쉬는 날은 꺼진 창
      const warm = { D: "#9cc9ff", E: "#ffc27a", N: "#c8b2ff" };
      for (let i = 0; i < nS; i++) for (let d = 0; d < nD; d++) {
        const key = i * nD + d, wx = dx(d), wy = oy + i * cs, v = S.plan[i][d];
        const placed = S.rank[key] < S.settled;
        if (!placed || v === "/") { x.fillStyle = "#0a0d22"; x.fillRect(wx + cs * .22, wy + cs * .22, cs * .56, cs * .56); continue; }
        const f = fresh(S, key, 700), c = warm[v];
        x.fillStyle = rgba(c, .16 + .3 * f); x.fillRect(wx - cs * .08, wy - cs * .08, cs * 1.16, cs * 1.16);
        x.fillStyle = f > .45 ? "#ffffff" : c; x.fillRect(wx + cs * .2, wy + cs * .2, cs * .6, cs * .6);
      }
      // 물가 — 불빛이 흔들리며 비친다
      x.fillStyle = "#070a1c"; x.fillRect(0, ground, w, h - ground);
      for (let i = nS - 1; i >= Math.max(0, nS - 6); i--) for (let d = 0; d < nD; d++) {
        const key = i * nD + d, v = S.plan[i][d];
        if (v === "/" || S.rank[key] >= S.settled) continue;
        const ry = ground + (nS - 1 - i) * cs * .55 + 2, wob = S.reduce ? 0 : Math.sin(S.now / 260 + d + i) * 1.2;
        x.fillStyle = rgba(warm[v], .22 - (nS - 1 - i) * .03); x.fillRect(dx(d) + cs * .2 + wob, ry, cs * .6, 1.4);
      }
      x.fillStyle = "rgba(255,255,255,.06)"; x.fillRect(0, ground, w, 1);
    },
  };

  // ------------------------------------------------------------ 만다라 — 한 바퀴가 한 달, 동심원이 사람
  // 원본: 갤러리 drawRadial. 줄인 것: 날짜 숫자는 주마다 하나(1·8·15·22·29), 가운데는 달 이름. 주말은
  // 옅은 부채꼴. 날짜는 고정 — 돌리면 어지럽다(사용자, 11/1). 1일이 12시 방향.
  const mandala = {
    key: "mandala", name: "만다라",
    init(S) {
      if (S.dark) { const g = S.x.createRadialGradient(S.w / 2, S.h / 2, 0, S.w / 2, S.h / 2, S.w * .6); g.addColorStop(0, "#111833"); g.addColorStop(1, "#05070d"); S.L.bg = g; }
    },
    draw(S) {
      const { x, w, h, P, nS, nD } = S;
      paint(S, S.L.bg);
      const cx = w / 2, cy = h / 2, R = h / 2 - 14, r0 = R * .24, rw = (R - r0) / nS;
      const a0 = -Math.PI / 2, da = TAU / nD;   // 돌리지 않는다 — 날짜가 돌면 어지럽다(사용자 11/1). 1일은 늘 12시 방향
      if (S.dow0 !== null) for (let d = 0; d < nD; d++) {
        const wd = (S.dow0 + d) % 7;
        if (wd !== 0 && wd !== 6) continue;
        x.fillStyle = rgba(P.red, S.dark ? .08 : .07);
        x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R + 3, a0 + d * da, a0 + (d + 1) * da); x.closePath(); x.fill();
      }
      x.strokeStyle = rgba(P.dim, .18); x.lineWidth = 1;
      x.beginPath(); x.arc(cx, cy, r0 - 3, 0, TAU); x.stroke();
      x.beginPath(); x.arc(cx, cy, R + 3, 0, TAU); x.stroke();
      for (let i = 0; i < nS; i++) {
        const r = r0 + (i + .5) * rw;
        for (let d = 0; d < nD; d++) {
          const key = i * nD + d;
          if (S.rank[key] >= S.settled) continue;
          const v = S.plan[i][d], f = fresh(S, key, 600);
          x.strokeStyle = f > .4 ? P.flash : rgba(P.col[v], v === "/" ? .4 : 1);
          x.lineWidth = rw * (v === "/" ? .3 : .82);
          x.beginPath(); x.arc(cx, cy, r, a0 + d * da + .012, a0 + (d + 1) * da - .012); x.stroke();
        }
      }
      x.textAlign = "center"; x.textBaseline = "middle"; x.font = "9px system-ui, sans-serif";
      for (let d = 0; d < nD; d += 7) {
        const a = a0 + (d + .5) * da;
        x.fillStyle = d ? rgba(P.sub, .8) : P.ink;
        x.fillText(String(d + 1), cx + Math.cos(a) * (R + 10), cy + Math.sin(a) * (R + 10));
      }
      if (S.month) { x.font = "600 11px system-ui, sans-serif"; x.fillStyle = P.ink; x.fillText(`${S.month}월`, cx, cy); }
    },
  };

  // ------------------------------------------------------------ 비 — 지금까지의 연출 그대로
  // 보고서 11장 '비'의 축소판 — 근무 글자가 위에서 떨어져 제자리에 앉는다. 사용자가 아홉 가지를 더하면서
  // 이것도 후보로 남기라고 했다(2026-11-01). 색·움직임은 그대로이고, 아래 14px만 이름표 자리로 비웠다.
  const RAIN_COL = { dark: { D: "#BDD7EE", E: "#F8CBAD", N: "#8EA2EC", "/": "rgba(255,255,255,.28)" },
                     light: { D: "#3B82F6", E: "#EA580C", N: "#6366F1", "/": "#8A949A" } };
  const rain = {
    key: "rain", name: "비",
    init(S) { S.L.g = gridLayout(S, 6, 5, 13); S.L.col = S.dark ? RAIN_COL.dark : RAIN_COL.light; },
    draw(S) {
      const { x, h, nS, nD } = S, { cs, ox, oy } = S.L.g;
      if (S.dark) { x.fillStyle = S.reduce ? "#0b0f19" : "rgba(11,15,25,.45)"; x.fillRect(0, 0, S.w, h); }
      else x.clearRect(0, 0, S.w, h);
      x.font = `700 ${Math.max(5, cs * .78)}px ui-monospace, Menlo, monospace`;
      x.textAlign = "center"; x.textBaseline = "middle";
      const drop = S.dark ? "74,222,128" : "20,150,140", land = S.dark ? "#fff" : "#0D9488", chars = "DEN/";
      if (!S.reduce) {
        for (let d = 0; d < nD; d++) {
          const speed = 55 + 45 * rnd(d), head = ((S.now / 1000) * speed + rnd(d + 50) * 400) % (h + 160) - 80;
          for (let k = 0; k < 7; k++) {
            const yy = oy + head - k * cs;
            if (yy < oy || yy > oy + cs * nS) continue;
            const i = Math.floor((yy - oy) / cs);
            if (S.rank[i * nD + d] < S.settled) continue;
            x.fillStyle = `rgba(${drop},${k ? .2 - k * .02 : .55})`;
            x.fillText(chars[Math.floor(rnd(d * 31 + k + Math.floor(S.now / 90)) * 4)], ox + d * cs + cs / 2, yy + cs / 2);
          }
        }
      }
      for (const [key, t0] of S.born) {
        const i = Math.floor(key / nD), d = key % nD, v = S.plan[i][d];
        const a = S.reduce ? 1 : Math.min(1, (S.now - t0) / 450), e = 1 - Math.pow(1 - a, 3);
        x.fillStyle = a < 1 ? land : S.L.col[v];
        x.globalAlpha = v === "/" ? .5 : 1;
        x.fillText(v, ox + d * cs + cs / 2, oy + i * cs + cs / 2 - (1 - e) * cs * 1.5);
        x.globalAlpha = 1;
      }
    },
  };

  // ------------------------------------------------------------ 다공성 질서 — 원본 3D 자이로이드 속 세 갈래 탐색
  // 원본: GPT 02-12 자이로이드(돌아가는 3D 점군) + 모음/만들기.py의 GYROID_PATCH(세 갈래 탐색자). 처음엔 2D 단면으로
  // 줄였다가 "차원이 너무 줄었고 안 예쁘다 — 원래 애니로"(사용자, 11/1)라 원본 3D를 그대로 쓴다. 점군과 이웃
  // 그래프는 한 번만 만들어 둔다(다음 생성부터는 바로 그린다). 탐색자 셋이 바깥에서 가운데 출구를 찾아가고, 옆길에
  // 들어갔다 막히면 되돌아온다(붉은 흔적). 셋이 다 닿으면 가장 짧게 닿은 길이 금빛. 한 바퀴 약 5초(사용자: 처음
  // 몇 초 안에 개념이 보여야). 점군 밝기가 진행을 따른다. 경로는 연출이며 실제 탐색 기록이 아니다.
  const GY = { pts: null, graph: null };
  function gyroidPoints() {
    if (GY.pts) return GY.pts;
    const pts = [], n = 84;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      const X = (i / (n - 1) - .5) * 5.7, Y = (j / (n - 1) - .5) * 5.7, Z = (k / (n - 1) - .5) * 5.7;
      if (X * X + Y * Y + Z * Z > 7.9) continue;
      const f = Math.sin(X) * Math.cos(Y) + Math.sin(Y) * Math.cos(Z) + Math.sin(Z) * Math.cos(X);
      if (Math.abs(f) < .066) {
        const nx = Math.cos(X) * Math.cos(Y) - Math.sin(Z) * Math.sin(X), ny = -Math.sin(X) * Math.sin(Y) + Math.cos(Y) * Math.cos(Z), nz = -Math.sin(Y) * Math.sin(Z) + Math.cos(Z) * Math.cos(X);
        pts.push([X / 2.4, Y / 2.4, Z / 2.4, nx, ny, nz]);
      }
    }
    return (GY.pts = pts);
  }
  function gyroidGraph() {
    if (GY.graph) return GY.graph;
    const all = gyroidPoints(), step = Math.max(1, Math.floor(all.length / 5200)), P = [];
    for (let i = 0; i < all.length; i += step) P.push(all[i]);
    const R = .085, cell = new Map(), key = (a, b, c) => a + "," + b + "," + c, cx = v => Math.floor(v / R);
    P.forEach((q, i) => { const k = key(cx(q[0]), cx(q[1]), cx(q[2])); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i); });
    const nb = P.map((q, i) => { const out = [], a = cx(q[0]), b = cx(q[1]), c = cx(q[2]);
      for (let dx = -1; dx < 2; dx++) for (let dy = -1; dy < 2; dy++) for (let dz = -1; dz < 2; dz++) { const l = cell.get(key(a + dx, b + dy, c + dz)); if (!l) continue;
        for (const j of l) { if (j === i) continue; const o = P[j]; if ((o[0] - q[0]) ** 2 + (o[1] - q[1]) ** 2 + (o[2] - q[2]) ** 2 < R * R) out.push(j); } }
      return out; });
    const d0 = q => Math.hypot(q[0], q[1], q[2]); let target = 0;
    P.forEach((q, i) => { if (nb[i].length > 3 && d0(q) < d0(P[target])) target = i; });
    const dist = new Array(P.length).fill(-1); dist[target] = 0; const qq = [target];
    for (let hh = 0; hh < qq.length; hh++) { const u = qq[hh]; for (const v of nb[u]) if (dist[v] < 0) { dist[v] = dist[u] + 1; qq.push(v); } }
    return (GY.graph = { P, nb, target, dist });
  }
  // 바깥 세 곳에서 출구까지 — 출구 쪽으로 끌리되 곧장 가지 않고, 가끔 옆길에 들어갔다 되돌아온다
  function gyroidPaths(G, seed) {
    const { P, nb, target, dist } = G, dirs = [[1, 0], [-.5, .87], [-.5, -.87]];
    return dirs.map((dv, sIdx) => {
      const r = mulberry(seed * 7919 + sIdx * 104729 + 1);
      const rot = r() * TAU, cx = Math.cos(rot) * dv[0] - Math.sin(rot) * dv[1], cz = Math.sin(rot) * dv[0] + Math.cos(rot) * dv[1];
      let start = -1, best = -1e9;
      P.forEach((q, i) => { if (dist[i] < 0) return; const sc = q[0] * cx + q[2] * cz - Math.abs(q[1]) * .4; if (sc > best) { best = sc; start = i; } });
      const path = [[start, 0]], seen = new Set([start]), stack = [start]; let guard = 0;
      while (stack.length && stack[stack.length - 1] !== target && guard++ < 6000) {
        const cur = stack[stack.length - 1];
        if (dist[cur] > 5 && r() < .07) {
          const side = []; let at = cur;
          for (let k = 0, K = 4 + Math.floor(r() * 6); k < K; k++) { const c = nb[at].filter(j => !seen.has(j) && dist[j] >= dist[at]); if (!c.length) break; at = c[Math.floor(r() * c.length)]; seen.add(at); side.push(at); path.push([at, 0]); }
          for (let k = side.length - 2; k >= 0; k--) path.push([side[k], 1]);
          if (side.length) path.push([cur, 1]);
          continue;
        }
        const cand = nb[cur].filter(j => !seen.has(j) && dist[j] >= 0);
        if (!cand.length) { stack.pop(); if (stack.length) path.push([stack[stack.length - 1], 1]); continue; }
        let pick; if (r() < .2) pick = cand[Math.floor(r() * cand.length)]; else { let bs = 1e9; for (const j of cand) { const sc = dist[j] + r() * 4; if (sc < bs) { bs = sc; pick = j; } } }
        seen.add(pick); stack.push(pick); path.push([pick, 0]);
      }
      return path;
    });
  }
  const porous = {
    key: "porous", name: "다공성 질서",
    init(S) {
      S.L.G = gyroidGraph(); S.L.round = -1;
      S.L.seekCol = S.dark ? ["#9FD8FF", "#C9B6FF", "#C7F5A8"] : ["#2F7BE6", "#8B6FD6", "#4D9A3A"];
    },
    draw(S) {
      const { x, w, h, P } = S, G = S.L.G;
      paint(S, S.dark ? "#0a1111" : null);
      const rot = (S.reduce ? 0 : S.t / 1000 * .16) + .4, tilt = -.3, ct = Math.cos(tilt), st = Math.sin(tilt), cr = Math.cos(rot), sr = Math.sin(rot);
      const size = Math.min(w, h) * .43, cxs = w / 2, cys = h * .5 - 2;
      const proj = (q) => { const xx = q[0] * cr + q[2] * sr, zz0 = -q[0] * sr + q[2] * cr, yy = q[1] * ct - zz0 * st, zz = q[1] * st + zz0 * ct, k = 4.6 / (4.6 + zz); return [cxs + xx * size * k, cys + yy * size * k, zz, k]; };
      // 점군 — 깊이·법선으로 음영, 밝기는 진행을 따른다
      const pts = gyroidPoints(), bright = .55 + .45 * S.ps, c1 = S.dark ? [146, 183, 169] : [95, 140, 123], c2 = S.dark ? [228, 189, 131] : [183, 121, 31];
      const pr = pts.map(q => [proj(q), q]); pr.sort((a, b) => b[0][2] - a[0][2]);
      for (const [a, q] of pr) {
        const shade = Math.max(0, Math.min(1, (q[3] * .3 - q[4] * .8 + q[5] * .2 + 1.5) / 3)), depth = Math.max(0, Math.min(1, (1.3 - a[2]) / 2.6));
        const al = (.16 + .5 * depth) * bright * (S.dark ? 1 : 1.25);
        x.fillStyle = `rgba(${Math.round(c1[0] + (c2[0] - c1[0]) * shade)},${Math.round(c1[1] + (c2[1] - c1[1]) * shade)},${Math.round(c1[2] + (c2[2] - c1[2]) * shade)},${Math.min(1, al)})`;
        x.fillRect(a[0], a[1], 1.25 * a[3], 1.25 * a[3]);
      }
      // 탐색자 — 한 바퀴(경로 + 도착 후 1.2초)마다 새 출발점
      const P3 = G.P.map(proj);
      const SPEED = 46;   // 걸음/초 — 한 바퀴 약 4~6초
      if (!S.L.paths || S.L.round < 0) { S.L.paths = gyroidPaths(G, 1); S.L.round = 0; S.L.rt0 = S.t; }
      const maxLen = Math.max(...S.L.paths.map(q => q.length)), lap = maxLen / SPEED * 1000 + 1200;
      if (!S.reduce && S.t - S.L.rt0 > lap) { S.L.round++; S.L.paths = gyroidPaths(G, S.L.round + 1); S.L.rt0 = S.t; }
      const el = S.reduce ? 1e9 : (S.t - S.L.rt0) / 1000 * SPEED, paths = S.L.paths;
      const lens = paths.map(q => q.length), win = lens.indexOf(Math.min(...lens)), done = paths.every(q => el >= q.length - 1);
      x.lineCap = "round";
      paths.forEach((path, sIdx) => {
        const head = Math.min(path.length - 1, el), hi = Math.floor(head), col = S.L.seekCol[sIdx], isWin = done && sIdx === win;
        for (let i = 1; i <= hi; i++) {
          const A = P3[path[i][0]], B = P3[path[i - 1][0]], back = path[i][1];
          x.strokeStyle = back ? rgba(P.red, .75) : isWin ? rgba(P.gold, .95) : rgba(col, done ? .35 : .9);
          x.lineWidth = (back ? 1.1 : isWin ? 2.2 : 1.5) * Math.min(A[3], B[3]);
          x.beginPath(); x.moveTo(B[0], B[1]); x.lineTo(A[0], A[1]); x.stroke();
        }
        const i0 = path[hi][0], i1 = path[Math.min(path.length - 1, hi + 1)][0], f = head - hi, X = P3[i0][0] + (P3[i1][0] - P3[i0][0]) * f, Y = P3[i0][1] + (P3[i1][1] - P3[i0][1]) * f;
        x.fillStyle = rgba(isWin ? P.gold : col, .3); x.beginPath(); x.arc(X, Y, 6, 0, TAU); x.fill();
        x.fillStyle = S.dark ? "#fff" : col; x.beginPath(); x.arc(X, Y, 2, 0, TAU); x.fill();
      });
      const T = P3[G.target], pulse = done ? 1 + .25 * Math.sin(S.now / 160) : 1;
      x.fillStyle = rgba(P.gold, done ? .32 : .16); x.beginPath(); x.arc(T[0], T[1], (done ? 13 : 8) * pulse, 0, TAU); x.fill();
      x.strokeStyle = rgba(P.gold, .85); x.lineWidth = 1.2; x.beginPath(); x.arc(T[0], T[1], 5 * pulse, 0, TAU); x.stroke();
      x.textAlign = "right"; x.textBaseline = "alphabetic"; x.font = "10px system-ui, sans-serif"; x.fillStyle = S.P.label;
      x.fillText(done ? "가장 짧게 닿은 길 = 금빛" : "세 갈래가 출구를 찾는 중 · 붉은 선 = 되돌아온 길", w - 7, h - 4);
    },
  };

  // ------------------------------------------------------------ 병동의 악보 — 사람이 오선, 같은 근무 연속이 긴 음표
  // 원본: GPT 01-03. 줄인 것: 줄 하나가 한 사람, 같은 근무가 이어지면 막대 하나(낮은 위·저녁 가운데·밤 아래로
  // 조금씩 비켜 음높이처럼), 쉬는 날은 쉼표(빈칸). 진행만큼 악보가 적히고(점선), 금빛 재생선은 4초마다 지나간다. 마디 = 한 주.
  const score = {
    key: "score", name: "병동의 악보",
    init(S) { S.L.runs = S.plan.map(runsOf); },
    draw(S) {
      const { x, w, h, P, nS, nD } = S;
      paint(S);
      const ox = 10, ow = w - 20, top = 7, bottom = 16, pitch = (h - top - bottom) / nS, cw = ow / nD;
      // 적는 자리(W)는 진행을 따르고, 재생선(X)은 시간으로 4초에 한 번 왼쪽→오른쪽을 지나간다 — 생성이
      // 3초 만에 끝나도 '재생선이 악보를 읽고 지나간다'가 보이게. 재생선이 지나가는 음표는 머리가 밝아진다.
      const W = ox + S.ps * ow, X = S.reduce ? W : ox + ((S.t / 4000) % 1) * ow, off = { D: -.2, E: 0, N: .2 };
      x.strokeStyle = rgba(P.dim, .2); x.lineWidth = 1;
      x.beginPath();
      for (let i = 0; i < nS; i++) { const y = Math.round(top + (i + .5) * pitch) + .5; x.moveTo(ox, y); x.lineTo(ox + ow, y); }
      for (let d = 0; d <= nD; d += 7) { const xx = Math.round(ox + d * cw) + .5; x.moveTo(xx, top); x.lineTo(xx, h - bottom); }
      x.stroke();
      x.lineCap = "round";
      for (let i = 0; i < nS; i++) {
        const y0 = top + (i + .5) * pitch;
        for (const r of S.L.runs[i]) {
          const x0 = ox + r.d0 * cw + 1.5, xe = ox + (r.d1 + 1) * cw - 1.5, x1 = Math.min(xe, W);
          if (x0 >= W) break;
          const y = y0 + off[r.v] * pitch, lw = Math.max(2, pitch * .42), playing = !S.reduce && X >= x0 - 2 && X <= xe + 2;
          x.strokeStyle = P.col[r.v]; x.lineWidth = lw;
          x.beginPath(); x.moveTo(x0 + lw / 2, y); x.lineTo(Math.max(x0 + lw / 2, x1 - lw / 2), y); x.stroke();
          x.fillStyle = playing ? P.flash : P.col[r.v];
          x.beginPath(); x.arc(x0 + lw / 2, y, lw * (playing ? .85 : .62), 0, TAU); x.fill();
        }
      }
      x.lineCap = "butt";
      if (S.ps < .999) { x.strokeStyle = rgba(P.dim, .5); x.lineWidth = 1; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(W, top - 2); x.lineTo(W, h - bottom + 2); x.stroke(); x.setLineDash([]); }
      if (S.dark) { x.fillStyle = rgba(P.gold, .12); x.fillRect(X - 4, top - 3, 8, h - top - bottom + 6); }
      x.strokeStyle = P.gold; x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(X, top - 3); x.lineTo(X, h - bottom + 3); x.stroke();
      x.fillStyle = P.gold; x.beginPath(); x.arc(X, top - 3, 2.2, 0, TAU); x.fill();
    },
  };

  // ------------------------------------------------------------ 한 달의 궤도 — 동심 궤도 위 원호가 근무
  // 원본: GPT 01-04. 줄인 것: 열 사람까지 궤도 하나씩, 같은 근무가 이어지면 원호 하나. 진행만큼 원호가
  // 그려지고 그 끝에 행성(그날의 근무색). 궤도는 저마다 다른 속도로 돈다. 가운데는 진행 %.
  const orrery = {
    key: "orrery", name: "한 달의 궤도",
    init(S) {
      S.L.nR = Math.min(10, S.nS); S.L.runs = S.plan.slice(0, S.L.nR).map(runsOf);
      if (S.dark) { const g = S.x.createRadialGradient(S.w / 2, S.h / 2, 0, S.w / 2, S.h / 2, S.w * .6); g.addColorStop(0, "#0f1530"); g.addColorStop(1, "#05070f"); S.L.bg = g; }
    },
    draw(S) {
      const { x, w, h, P, nD } = S, nR = S.L.nR;
      paint(S, S.L.bg);
      const cx = w / 2, cy = h / 2, R = h / 2 - 9, r0 = R * .36, gap = (R - r0) / Math.max(1, nR - 1);
      const sweep = S.ps * TAU, da = TAU / nD, lw = Math.max(2, gap * .55);
      // 궤도마다 제 속도로 돈다(안쪽 3초·바깥 6초에 한 바퀴) — 생성이 3초면 끝나도 '도는 궤도'로 보이게.
      // 그려지는 양(sweep)은 진행을 따른다. 바늘·가운데 %도 진행.
      const spin = (i) => -Math.PI / 2 + (S.reduce ? 0 : S.t / 1000 * TAU / (3 + 3 * i / Math.max(1, nR - 1)));
      x.strokeStyle = rgba(P.dim, .16); x.lineWidth = 1;
      for (let i = 0; i < nR; i++) { x.beginPath(); x.arc(cx, cy, r0 + i * gap, 0, TAU); x.stroke(); }
      x.lineCap = "round";
      for (let i = 0; i < nR; i++) {
        const r = r0 + i * gap, a0 = spin(i);
        for (const run of S.L.runs[i]) {
          const s = a0 + run.d0 * da + .05, e = Math.min(a0 + (run.d1 + 1) * da - .05, a0 + sweep);
          if (e <= s) continue;
          x.strokeStyle = P.col[run.v]; x.lineWidth = lw;
          x.beginPath(); x.arc(cx, cy, r, s, e); x.stroke();
        }
      }
      x.lineCap = "butt";
      const day = Math.min(nD - 1, Math.floor(S.ps * nD));
      if (S.ps < .999) for (let i = 0; i < nR; i++) {
        const r = r0 + i * gap, v = S.plan[i][day], a = spin(i) + sweep;
        x.fillStyle = v === "/" ? rgba(P.dim, .7) : (S.dark ? P.flash : P.col[v]);
        x.beginPath(); x.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, v === "/" ? 1.4 : 2, 0, TAU); x.fill();
      }
      x.textAlign = "center"; x.textBaseline = "middle";
      x.fillStyle = P.ink; x.font = "600 15px system-ui, sans-serif";
      x.fillText(String(Math.round(S.ps * 100)), cx, cy - 2);
      x.font = "8px system-ui, sans-serif"; x.fillStyle = P.sub; x.fillText("%", cx, cy + 10);
    },
  };

  // ------------------------------------------------------------ 성장하는 해 — 빈 자리를 찾아 가지가 자라며 채운다
  // 원본: GPT 02-04 공간 점유 성장(가지가 끌림점 쪽으로 자람). 이해되게 바꾼 것: 끌림점이 곧 근무표의 빈 칸이다.
  // 바닥 가운데 뿌리에서, 아직 안 채운 칸(옅은 점)으로 가장 가까운 가지가 뻗어 가고, 닿으면 그 칸에 근무 글자가
  // 켜진다. 가까운 칸부터 채우므로 나무가 바깥으로 퍼진다. 채운 칸 수 = 진행.
  const growth = {
    key: "growth", name: "성장하는 해",
    init(S) {
      const { nS, nD, w, h } = S;
      const g = gridLayout(S, 8, 5, 24), root = [w / 2, h - 3];
      const centre = (key) => [g.ox + (key % nD + .5) * g.cs, g.oy + (Math.floor(key / nD) + .5) * g.cs];
      const keys = Array.from({ length: nS * nD }, (_, k) => k);
      const dist = keys.map(k => { const [px, py] = centre(k); return Math.hypot(px - root[0], (py - root[1]) * 1.4) + rnd(k * 3 + 1) * 26; });
      keys.sort((a, b) => dist[a] - dist[b]);
      // 가지: 이미 있는 마디 가운데 가장 가까운 곳에서 7px씩 뻗는다(살짝 휘게)
      const nodes = [root, [w / 2, h - 16]], trunk = [[root, nodes[1]]], branches = [];
      for (const key of keys) {
        const tgt = centre(key);
        let best = 0, bd = 1e9;
        for (let n = 1; n < nodes.length; n++) { const q = nodes[n], dd = (q[0] - tgt[0]) ** 2 + (q[1] - tgt[1]) ** 2; if (dd < bd) { bd = dd; best = n; } }
        let at = nodes[best];
        const segs = [];
        for (let k = 0; k < 40; k++) {
          const dx = tgt[0] - at[0], dy = tgt[1] - at[1], L0 = Math.hypot(dx, dy);
          if (L0 < g.cs * .45) break;
          const st = Math.min(7, L0 - g.cs * .4), wob = (rnd(key * 11 + k) - .5) * .5;
          const nx = at[0] + (dx / L0) * st - (dy / L0) * st * wob, ny = at[1] + (dy / L0) * st + (dx / L0) * st * wob;
          const nn = [nx, ny]; segs.push([at, nn]); nodes.push(nn); at = nn;
        }
        branches.push({ key, segs });
      }
      S.L = Object.assign(S.L, { g, branches, trunk, centre });
    },
    draw(S) {
      const { x, P, nS, nD } = S, L = S.L, { cs } = L.g, total = nS * nD;
      paint(S);
      const n = Math.min(total, Math.floor(total * S.p));
      if (!L.born) L.born = new Float64Array(total).fill(-1);
      for (let k = 0; k < n; k++) if (L.born[k] < 0) L.born[k] = S.now;
      const GROW = 380;
      // 빈 칸(끌림점) — 아직 안 닿은 자리
      x.fillStyle = rgba(P.dim, .28);
      for (let k = n; k < total; k++) { const [px, py] = L.centre(L.branches[k].key); x.fillRect(px - .9, py - .9, 1.8, 1.8); }
      // 가지
      // 다 자랄수록 가지를 옅게 — 글자(채운 칸)가 가지에 묻히지 않게
      x.strokeStyle = rgba(P.gold, (S.dark ? .55 : .7) * (1 - .45 * n / total)); x.lineWidth = 1; x.lineCap = "round";
      x.beginPath();
      for (const [a, b] of L.trunk) { x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); }
      const tips = [];
      for (let k = 0; k < n; k++) {
        const br = L.branches[k], f = S.reduce ? 1 : Math.min(1, (S.now - L.born[k]) / GROW), m = br.segs.length * f;
        for (let j = 0; j < br.segs.length && j < m; j++) {
          const [a, b] = br.segs[j], part = Math.min(1, m - j);
          x.moveTo(a[0], a[1]); x.lineTo(a[0] + (b[0] - a[0]) * part, a[1] + (b[1] - a[1]) * part);
          if (f < 1 && j + 1 >= m) tips.push([a[0] + (b[0] - a[0]) * part, a[1] + (b[1] - a[1]) * part]);
        }
      }
      x.stroke(); x.lineCap = "butt";
      x.fillStyle = S.dark ? P.flash : P.gold;
      for (const [tx, ty] of tips) { x.beginPath(); x.arc(tx, ty, 1.8, 0, TAU); x.fill(); }
      // 닿은 칸에 근무 글자
      x.font = `700 ${Math.max(6, cs * .8)}px ui-monospace, Menlo, monospace`; x.textAlign = "center"; x.textBaseline = "middle";
      for (let k = 0; k < n; k++) {
        const age = S.reduce ? 1e9 : S.now - L.born[k];
        if (age < GROW) continue;
        const key = L.branches[k].key, v = S.plan[Math.floor(key / nD)][key % nD], [px, py] = L.centre(key);
        x.fillStyle = age < GROW + 300 ? P.flash : (v === "/" ? rgba(P.dim, .55) : P.col[v]);
        x.fillText(v, px, py + .5);
      }
    },
  };

  // ------------------------------------------------------------ 교환의 성좌 — 같은 날 두 사람이 근무를 맞바꾼다
  // 원본: GPT 01-07(왼쪽 점=사람, 오른쪽 점=날짜, 선=그 단계에서 바뀐 칸). 이해되게 바꾼 것: 근무표 격자를 그대로
  // 두고, 같은 날 두 사람의 E와 D가 선으로 이어진 채 자리를 바꾼다(글자가 위아래로 엇갈려 움직인다). 바꾼 자리는
  // 별로 남아 선이 쌓이면 성좌가 된다. 맞교환은 위 validRow를 깨지 않는 것만 한다(E→D·E-OFF-D가 생기면 안 함).
  // 1.4초마다 하나 — 생성이 3초면 끝나도 두 번은 보인다. 격자 채움은 진행(날짜 순서)을 따른다.
  // 맞교환은 이미 다 놓인 날짜(그 날의 칸이 모두 채워진 열)에서만 한다 — 예전엔 진행과 무관하게 1~7일에서
  // 바꿔 "근무표가 나오기 전부터 바뀌고 있다"(사용자, 11/2). 다 놓인 날이 생길 때까지는 기다린다.
  const swaps = {
    key: "swaps", name: "교환의 성좌",
    init(S) {
      S.L.g = gridLayout(S, 22, 5, 16);
      S.L.cur = S.plan.map(r => r.slice());
      S.L.done = []; S.L.sw = null; S.L.next = 250;
    },
    // 그 날의 칸이 모두 놓인 날짜 수(날짜 순서로 놓으므로 앞에서부터 이어진다)
    fullDays(S) {
      let n = 0;
      while (n < S.nD) { let all = true; for (let i = 0; i < S.nS; i++) if (S.rank[i * S.nD + n] >= S.settled) { all = false; break; } if (!all) break; n++; }
      return n;
    },
    pick(S, slot) {
      const { nS } = S, cur = S.L.cur, maxD = swaps.fullDays(S) - 1;
      const cand = [];
      for (let d = 0; d <= maxD; d++) for (let a = 0; a < nS; a++) {
        if (cur[a][d] !== "E") continue;
        for (let b = 0; b < nS; b++) {
          if (cur[b][d] !== "D") continue;
          const ra = cur[a].slice(), rb = cur[b].slice(); ra[d] = "D"; rb[d] = "E";
          if (validRow(ra) && validRow(rb)) cand.push([a, b, d]);
        }
      }
      if (!cand.length) return null;
      // 최근 날짜 쪽을 더 자주 — 지금 채우는 자리 근처에서 고치는 것처럼
      cand.sort((p, q) => q[2] - p[2]);
      const c = cand[Math.floor(Math.pow(rnd(slot * 7 + 3), 2) * cand.length)];
      return { a: c[0], b: c[1], d: c[2] };
    },
    draw(S) {
      const { x, w, h, P, nS, nD } = S, L = S.L, { cs, ox, oy } = L.g, cur = L.cur;
      paint(S);
      const PERIOD = 1400, MOVE = 900, t = S.reduce ? 0 : S.t;
      // 다음 맞교환 — 앞 것이 끝나고(1.4초) 바꿀 수 있는 날이 있을 때만. 없으면 매 프레임 다시 본다.
      if (!S.reduce && t >= L.next) {
        const nx = swaps.pick(S, Math.floor(t / PERIOD));
        if (nx) {
          if (L.sw && L.sw.applied) { L.done.push(L.sw); if (L.done.length > 14) L.done.shift(); }
          nx.t0 = t; L.sw = nx; L.next = t + PERIOD;
        }
      }
      const sw = L.sw, ph = sw ? (t - sw.t0) / MOVE : 1, moving = sw && ph < 1;
      if (sw && !moving && !sw.applied) {
        // 다시 확인하고 바꾼다 — 고른 뒤에 다른 교환이 끼어들 일은 없지만, 규칙을 깨는 줄은 한 프레임도 안 그린다
        const ra = cur[sw.a].slice(), rb = cur[sw.b].slice(); ra[sw.d] = "D"; rb[sw.d] = "E";
        if (validRow(ra) && validRow(rb)) { cur[sw.a] = ra; cur[sw.b] = rb; sw.applied = true; } else L.sw = null;
      }
      const cx = (d) => ox + (d + .5) * cs, cy = (i) => oy + (i + .5) * cs;
      // 사람 줄 이름(짝수만) — 왼쪽 여백
      x.font = "8px system-ui, sans-serif"; x.textAlign = "right"; x.textBaseline = "middle"; x.fillStyle = rgba(P.sub, .8);
      for (let i = 0; i < nS; i += 2) x.fillText(String(i + 1).padStart(2, "0"), ox - 3, cy(i));
      // 쌓인 성좌 — 지난 맞교환의 선과 별
      const arc = (sw2, alpha, lw) => {
        const xa = cx(sw2.d), ya = cy(sw2.a), yb = cy(sw2.b), bend = 10 + Math.abs(sw2.a - sw2.b) * cs * .25;
        x.strokeStyle = rgba(P.gold, alpha); x.lineWidth = lw;
        x.beginPath(); x.moveTo(xa + cs * .45, ya); x.quadraticCurveTo(xa + bend, (ya + yb) / 2, xa + cs * .45, yb); x.stroke();
      };
      L.done.forEach((p, k) => arc(p, .18 + .3 * k / L.done.length, 1));
      // 격자 — 진행만큼 날짜 순서로 채운다. 맞교환 중인 두 칸은 진행과 무관하게 보인다.
      x.font = `700 ${Math.max(6, cs * .78)}px ui-monospace, Menlo, monospace`; x.textAlign = "center";
      for (let i = 0; i < nS; i++) for (let d = 0; d < nD; d++) {
        const key = i * nD + d, mine = sw && sw.d === d && (sw.a === i || sw.b === i);
        if (S.rank[key] >= S.settled) { x.fillStyle = rgba(P.dim, .16); x.fillRect(cx(d) - .8, cy(i) - .8, 1.6, 1.6); continue; }
        if (mine && moving) continue;
        const v = cur[i][d], star = L.done.some(p => p.d === d && (p.a === i || p.b === i));
        if (star) { x.fillStyle = rgba(P.gold, S.dark ? .22 : .18); x.fillRect(cx(d) - cs / 2 + .5, cy(i) - cs / 2 + .5, cs - 1, cs - 1); }
        x.fillStyle = v === "/" ? rgba(P.dim, .5) : P.col[v];
        x.fillText(v, cx(d), cy(i) + .5);
      }
      if (sw && (moving || sw.applied)) {
        const e = moving ? .5 - .5 * Math.cos(Math.PI * Math.min(1, Math.max(0, (ph - .15) / .85))) : 1;
        arc(sw, .95, 1.6);
        const xa = cx(sw.d), ya = cy(sw.a), yb = cy(sw.b);
        for (const [y0, y1, v, side] of [[ya, yb, moving ? "E" : cur[sw.a][sw.d], -1], [yb, ya, moving ? "D" : cur[sw.b][sw.d], 1]]) {
          const yy = moving ? y0 + (y1 - y0) * e : y0, xx = xa + (moving ? side * Math.sin(Math.PI * e) * cs * .8 : 0);
          x.fillStyle = rgba(P.flash, S.dark ? .25 : .18); x.fillRect(xx - cs / 2, yy - cs / 2, cs, cs);
          x.fillStyle = P.col[v]; x.fillText(v, xx, yy + .5);
        }
        x.font = "600 10px system-ui, sans-serif"; x.textAlign = "right"; x.textBaseline = "alphabetic"; x.fillStyle = P.ink;
        x.fillText(`${sw.d + 1}일 맞교환 · 이름${String(sw.a + 1).padStart(2, "0")} E ↔ 이름${String(sw.b + 1).padStart(2, "0")} D`, w - 7, h - 4);
      }
    },
  };

  // ================================================================ 탐색의 심연 여섯 — 모음 페이지 전용(random: false)
  // 원본: docs/시각화/gpt_20261023/02_sublime_14/탐색의_심연_14개_풍경.html의 drawManifold(01)·drawFlow(02)·
  // drawTesseract(08)·drawFlower(09)·drawSphere(10)·drawMembrane(14). 수식·색(PALETTES)·선 굵기·투영(proj: 세로축
  // 회전, 기울기 -.3, 원근 4.6)을 그대로 옮기고 160px 상자에 맞게 크기와 선 수만 줄였다 — 다공성 질서를 2D로 줄였을
  // 때 "차원이 너무 줄고 안 예쁘다"(사용자, 11/1)여서 3D 그대로다. 그 위에 근무표와 이어지는 움직임을 한 겹 얹었다
  // (사용자 11/1: "원본 유지하면서 이해되게 애니로"). 얹은 움직임은 3~5초 주기로 시간에 따라 돈다(처음 몇 초 안에 개념이
  // 보이게). 앱 생성 중 무작위에는 넣지 않는다 — 사용자는 HTML 파일만 말했다. __genVizForce로만 고른다.
  // 색: 다크는 원본 바탕을 칠한다. 라이트는 바탕을 칠하지 않으므로(머리말) 원본의 밝은 선색 대신 같은 색상의 중간
  // 톤(#EEF2F0·#121212 양쪽에 3:1 이상)을 쓴다. 09·14는 원본이 밝은 종이 바탕이라 라이트에서 원본 색 그대로(14의
  // 구리색만 대비 때문에 조금 어둡게), 다크에서는 어두운 바탕에 같은 색을 밝힌 짝.
  const ABYSS = {
    manifold: { dark: ["#070d15", "#88b9df", "#e6b880"], light: ["", "#3E7BB0", "#B7791F"] },
    flow:     { dark: ["#081513", "#99cebe", "#dfbd84"], light: ["", "#2F8A74", "#B07A2A"] },
    tess:     { dark: ["#0d0f14", "#879cb9", "#f2ba91"], light: ["", "#56708F", "#C0703F"] },
    flower:   { dark: ["#0e0f14", "#9AA6C4", "#E3A97F"], light: ["", "#606a81", "#b47c59"] },
    sphere:   { dark: ["#0a1016", "#7fb1c2", "#ead3a7"], light: ["", "#3A8296", "#A8772C"] },
    membrane: { dark: ["#0e1013", "#9AA8B3", "#E6B784"], light: ["", "#717f8a", "#AD7A4C"] },
  };
  const HEX3 = new Map();
  function hex3(h) {
    let c = HEX3.get(h);
    if (!c) { const n = parseInt(h.slice(1), 16); c = [n >> 16 & 255, n >> 8 & 255, n & 255]; HEX3.set(h, c); }
    return c;
  }
  const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  // 원본 color(a,b,t,alpha) — 두 색 사이를 t만큼
  function mixc(a, b, t, al) {
    const A = hex3(a), B = hex3(b), u = cl01(t);
    return `rgba(${Math.round(A[0] + (B[0] - A[0]) * u)},${Math.round(A[1] + (B[1] - A[1]) * u)},${Math.round(A[2] + (B[2] - A[2]) * u)},${cl01(al).toFixed(3)})`;
  }
  function abyssInit(S, key, boost) {
    const pal = ABYSS[key][S.dark ? "dark" : "light"];
    S.L.pal = pal; S.L.ab = S.dark ? 1 : boost || 1.5;   // 라이트는 밝은 바탕 위라 같은 투명도가 더 옅어 보인다
    if (S.dark) {
      const g = S.x.createRadialGradient(S.w * .5, S.h * .46, 0, S.w * .5, S.h * .46, Math.max(S.w, S.h) * .65);
      g.addColorStop(0, pal[1] + "12"); g.addColorStop(1, pal[1] + "00"); S.L.glow = g;
    }
  }
  function abyssBg(S) {
    paint(S, S.L.pal[0]);
    if (S.L.glow) { S.x.fillStyle = S.L.glow; S.x.fillRect(0, 0, S.w, S.h); }
  }
  // 원본 proj()와 같은 투영 — 세로축으로 rot만큼 돌리고 tilt만큼 숙인 뒤 원근 4.6. out = [x, y, 깊이, 원근배율]
  function abyssProj(rot, tilt, size, cx, cy) {
    const c = Math.cos(rot), s = Math.sin(rot), ct = Math.cos(tilt), st = Math.sin(tilt);
    return (X, Y, Z, out) => {
      const xx = X * c + Z * s, z0 = -X * s + Z * c, yy = Y * ct - z0 * st, zz = Y * st + z0 * ct, k = 4.6 / (4.6 + zz);
      out[0] = cx + xx * size * k; out[1] = cy + yy * size * k; out[2] = zz; out[3] = k; return out;
    };
  }
  function glowAt(x, X, Y, r, hex, a) {
    const g = x.createRadialGradient(X, Y, 0, X, Y, r);
    g.addColorStop(0, rgba(hex, a)); g.addColorStop(1, rgba(hex, 0));
    x.fillStyle = g; x.fillRect(X - r, Y - r, r * 2, r * 2);
  }
  // 오른쪽 아래 한 줄 — 왼쪽 이름표와 겹치면 짧은 문구로
  function caption(S, name, long, short) {
    const x = S.x;
    x.font = "10px system-ui, sans-serif";
    const room = S.w - 30 - x.measureText(name).width;
    x.textAlign = "right"; x.textBaseline = "alphabetic"; x.fillStyle = S.P.label;
    x.fillText(x.measureText(long).width <= room ? long : short, S.w - 7, S.h - 4);
  }
  // 매개변수 곡면의 섬유 nA개(선마다 nB+1점)를 원본처럼 평균 깊이로 뒤에서부터 긋는다. pos(a, b, out)이 점을 낸다.
  function fibers(S, slot, nA, nB, pos, colorOf, width, sorted) {
    const n1 = nB + 1, need = nA * n1 * 2, x = S.x, o = [0, 0, 0, 0];
    let buf = S.L[slot];
    if (!buf || buf.length !== need) buf = S.L[slot] = new Float32Array(need);
    const zs = new Float32Array(nA), idx = [];
    for (let a = 0; a < nA; a++) {
      let zsum = 0;
      for (let b = 0; b <= nB; b++) { pos(a, b, o); const q = (a * n1 + b) * 2; buf[q] = o[0]; buf[q + 1] = o[1]; zsum += o[2]; }
      zs[a] = zsum / n1; idx.push(a);
    }
    if (sorted) idx.sort((p, q) => zs[q] - zs[p]);
    x.lineWidth = width;
    for (const a of idx) {
      x.strokeStyle = colorOf(a, zs[a]);
      x.beginPath();
      const q0 = a * n1 * 2;
      x.moveTo(buf[q0], buf[q0 + 1]);
      for (let b = 1; b <= nB; b++) x.lineTo(buf[q0 + b * 2], buf[q0 + b * 2 + 1]);
      x.stroke();
    }
  }

  // ------------------------------------------------------------ 휘어진 가능성(01) — 접힌 토러스 위 빛줄기 셋
  // 원본 그대로: 변형 토러스의 섬유(긴 방향 100 → 64줄, 짧은 방향 48줄)와 그 위를 떠도는 금빛 점, 접힘 세기 ← 진행.
  // 얹은 것: 빛줄기 셋이 섬유를 따라 흐른다(4초에 한 바퀴). 앞길에 붉은 점(조건에 막힌 칸)이 나타나면 옆 섬유로 꺾어
  // 비켜 간다 — 좁은 통로를 따라 조금씩 고쳐 가는 탐색. 길과 막힌 점은 연출이다(실제 탐색 기록이 아님).
  const MANI_LANES = 24, MANI_U = 48, MANI_SPEED = 12;   // 섬유 24가닥, 한 바퀴 48칸, 초당 12칸
  function maniStreaks() {
    return [[3, 0], [11, 17], [19, 33]].map(([lane0, i0], s) => {
      const r = mulberry(4241 + s * 977), pts = [[i0, lane0]], blocks = [];
      let lane = lane0, i = i0, since = 0;
      for (let k = 0; k < MANI_U * 12; k++) {
        if (since > 4 && r() < .065) { blocks.push([i + 1, lane, k]); lane += r() < .5 ? 1 : -1; since = 0; } else since++;
        i++; pts.push([i, lane]);
      }
      return { pts, blocks };
    });
  }
  const manifold = {
    key: "manifold", name: "휘어진 가능성", random: false,
    // 라이트에서는 빛줄기를 앱의 강조색(청록)으로 — 원본 금빛은 금빛 섬유에 묻혔다
    init(S) { abyssInit(S, "manifold", 1.1); S.L.st = maniStreaks(); S.L.beam = S.dark ? S.L.pal[2] : S.P.flash; },
    draw(S) {
      const { x, w, h } = S, L = S.L, [, p1, p2] = L.pal, ab = L.ab, sec = S.reduce ? 0 : S.t / 1000;
      abyssBg(S);
      const fill = S.ps, size = Math.min(w * .3, (h - 12) * .43);
      const P = abyssProj(.35 + sec * .09, -.3, size, w / 2, h * .47);
      const pos = (u, v, o) => {
        const r = .73 + .24 * Math.cos(v * 3 + u * 2) + .09 * Math.sin(u * 5), R = r + .29 * Math.cos(v);
        return P(R * Math.cos(u), R * Math.sin(u) * .73, .34 * Math.sin(v) + (.15 + .12 * fill) * Math.sin(3 * u), o);
      };
      fibers(S, "fa", 64, 110, (a, b, o) => pos(b / 110 * TAU, a / 64 * TAU, o),
        (a, z) => mixc(p1, p2, (Math.sin(a * 100 / 64 * .06) + 1) / 2, (.25 + .3 * (1 - z)) * ab), .55, true);
      fibers(S, "fb", 48, 44, (a, b, o) => pos(a / 48 * TAU, b / 44 * TAU, o), () => mixc(p1, p2, 0, .13 * ab), .45, false);
      // 빛줄기 — 꼬리 1.5초, 막힌 점은 닿기 1.2초 전에 나타나 지나가면 사라진다
      const o = [0, 0, 0, 0], head = S.reduce ? 30 : sec * MANI_SPEED + 4, TRAIL = 18, lit = S.dark ? "#FFFFFF" : L.beam, beam = L.beam, rb = S.dark ? 1 : 1.4;
      const at = (pt, f, nx) => pos((pt[0] + (nx[0] - pt[0]) * f) / MANI_U * TAU, (pt[1] + (nx[1] - pt[1]) * f) / MANI_LANES * TAU, o);
      if (S.dark) x.globalCompositeOperation = "lighter";
      x.lineCap = "round";
      for (const st of L.st) {
        for (const [bi, bl, k] of st.blocks) {
          const a = cl01((head - (k - 14)) / 4) * cl01((k + 22 - head) / 8);
          if (a <= 0) continue;
          pos(bi / MANI_U * TAU, bl / MANI_LANES * TAU, o);
          const hit = Math.abs(head - k) < 1.2 ? 1 - Math.abs(head - k) / 1.2 : 0;
          glowAt(x, o[0], o[1], 6 + 4 * hit, S.P.red, .35 * a);
          x.fillStyle = rgba(S.P.red, .9 * a); x.beginPath(); x.arc(o[0], o[1], (1.7 + hit) * o[3] * rb, 0, TAU); x.fill();
        }
        const hi = Math.floor(head), t0 = Math.max(0, head - TRAIL);
        let px = null, py = null;
        for (let s = t0; s <= head + 1e-6; s += 1 / 3) {
          const k = Math.min(st.pts.length - 2, Math.floor(s)), f = s - k;
          at(st.pts[k], f, st.pts[k + 1]);
          if (px !== null) {
            const age = (head - s) / TRAIL, depth = cl01((1.2 - o[2]) / 2.4);
            x.strokeStyle = rgba(beam, (1 - age) * (.35 + .65 * depth));
            x.lineWidth = (2.2 - 1.4 * age) * o[3] * rb;
            x.beginPath(); x.moveTo(px, py); x.lineTo(o[0], o[1]); x.stroke();
          }
          px = o[0]; py = o[1];
        }
        at(st.pts[Math.min(st.pts.length - 2, hi)], head - hi, st.pts[Math.min(st.pts.length - 1, hi + 1)]);
        glowAt(x, o[0], o[1], 9, beam, .5);
        x.fillStyle = lit; x.beginPath(); x.arc(o[0], o[1], 1.9 * o[3], 0, TAU); x.fill();
      }
      x.lineCap = "butt";
      // 원본의 떠도는 금빛 점 38개
      for (let j = 0; j < 38; j++) {
        pos((j * .731 + sec * .13) % TAU, j * .628, o);
        x.fillStyle = p2 + "b0"; x.beginPath(); x.arc(o[0], o[1], 1.1, 0, TAU); x.fill();
      }
      x.globalCompositeOperation = "source-over";
      caption(S, manifold.name, "빛 = 조건을 지키며 가는 길 · 붉은 점에 막히면 옆 섬유로", "붉은 점에 막히면 옆 섬유로");
    },
  };

  // ------------------------------------------------------------ 보이지 않는 강(02) — 고정 칸을 비켜 흐르는 유선
  // 원본 그대로: 회전장 다섯·반발 영역 셋 사이로 유선 720개(같은 씨앗 302 — 원본과 같은 선), 선 위를 흐르는 점.
  // 얹은 것: 반발 영역 셋이 고정·지정 칸(네모)이다. 4.2초마다 새 배정 한 칸(금빛 네모)이 강에 놓이면 그 둘레의
  // 유선이 휘어 비켜 가고(놓기 전·후 유선을 미리 계산해 두고 그 사이를 옮겨 간다), 칸이 빠지면 되돌아온다 — 한 배정이
  // 주변 흐름을 바꾼다. 강을 따라 흐르는 근무 글자(D·E·N)는 진행만큼 늘어난다. 유선은 실제 후보 궤적이 아니다.
  const FLOW_NEW = [[-1.18, -.42], [.38, .58], [1.2, -.12]];    // 새 배정이 놓이는 자리 — 유선이 지나는 곳
  const FLOW_FIXED = [[-.6, .23, "N"], [.05, .23 * Math.cos(3), "/"], [.7, .23 * Math.cos(6), "D"]];
  const FLOW = { sets: null };
  function flowLines(extra) {
    const random = mulberry(302), out = [];
    for (let i = 0; i < 720; i++) {
      let x = random() * 3.4 - 1.7, y = random() * 2.2 - 1.1;
      const pts = [];
      for (let k = 0; k < 92; k++) {
        pts.push(x, y);
        let vx = .62, vy = .13 * Math.sin(x * 2);
        for (let j = 0; j < 5; j++) { const ax = Math.cos(j * 2.399) * .85, ay = Math.sin(j * 2.399) * .67, dx = x - ax, dy = y - ay, den = .055 + dx * dx + dy * dy; vx += (-dy / den) * .34; vy += (dx / den) * .34; }
        for (let j = 0; j < 3; j++) { const ax = -.6 + j * .65, ay = .23 * Math.cos(j * 3), dx = x - ax, dy = y - ay, den = dx * dx + dy * dy; vx += dx * .021 / (.006 + den * den); vy += dy * .021 / (.006 + den * den); }
        if (extra) { const dx = x - extra[0], dy = y - extra[1], den = dx * dx + dy * dy; vx += dx * .021 / (.006 + den * den); vy += dy * .021 / (.006 + den * den); }
        const len = Math.hypot(vx, vy); x += vx / len * .023; y += vy / len * .023;
        if (Math.abs(x) > 2.1 || Math.abs(y) > 1.4) break;
      }
      out.push(new Float32Array(pts));
    }
    return out;
  }
  // 놓기 전(0)과 새 칸 셋을 놓은 뒤(1~3)의 유선, 그리고 새 칸마다 눈에 띄게(0.5px 넘게) 휘는 유선 표시(moved).
  // 720줄을 매 프레임 다 그으면 폰에서 무거워서, 유선 그림은 미리 그려 두고(아래 off) 휘는 동안에만 휘는 선을 긋는다.
  function flowSets() {
    if (FLOW.sets) return FLOW;
    const sets = [flowLines(null)].concat(FLOW_NEW.map(flowLines)), A = sets[0];
    FLOW.moved = sets.slice(1).map(B => Uint8Array.from(A, (a, i) => {
      const b = B[i];
      if (a.length !== b.length) return 1;
      for (let j = 0; j < a.length; j++) if (Math.abs(a[j] - b[j]) > .01) return 1;
      return 0;
    }));
    FLOW.sets = sets;
    return FLOW;
  }
  const flow = {
    key: "flow", name: "보이지 않는 강", random: false,
    init(S) { abyssInit(S, "flow", 1.3); const F = flowSets(); S.L.sets = F.sets; S.L.moved = F.moved; S.L.off = {}; },
    draw(S) {
      const { x, w, h, P } = S, L = S.L, [, p1, p2] = L.pal, ab = L.ab, sec = S.reduce ? 0 : S.t / 1000;
      abyssBg(S);
      const sy = Math.min(w / 3.9, (h - 10) / 2.9), sx = Math.min(w / 4.1, sy * 1.35), cx = w / 2, cy = h * .47;
      const sp = (X, Y) => [cx + X * sx, cy + Y * sy];
      // 4.2초 주기: 0.3~1.1초 칸이 놓이며 유선이 휨, 3.3~3.9초 칸이 빠지며 되돌아옴
      const PER = 4.2, cyc = sec / PER, k = Math.floor(cyc) % 3, ph = (cyc - Math.floor(cyc)) * PER;
      const ease = (v) => { v = cl01(v); return v * v * (3 - 2 * v); };
      const m = S.reduce ? 0 : ease((ph - .3) / .8) * (1 - ease((ph - 3.3) / .6));
      const A = L.sets[0], B = L.sets[1 + k];
      const lineAt = (i, j) => {   // 유선 i의 j번째 점 — 놓기 전(A)과 후(B) 사이 m
        const a = A[i], b = B[i], ja = Math.min(j, a.length / 2 - 1) * 2, jb = Math.min(j, b.length / 2 - 1) * 2;
        return [a[ja] + (b[jb] - a[ja]) * m, a[ja + 1] + (b[jb + 1] - a[ja + 1]) * m];
      };
      const nOf = (i) => Math.round((m < .5 ? A[i].length : B[i].length) / 2), moved = L.moved[k];
      // 원본 색은 (i%17, i%5)로만 갈린다 — 같은 색끼리 한 번에 긋는다. which: 0 = 전부, 1 = 휘는 선만, 2 = 안 휘는 선만
      const strokeLines = (cx2, which) => {
        cx2.lineWidth = .65;
        for (let g = 0; g < 85; g++) {
          cx2.strokeStyle = mixc(p1, p2, (g % 17) / 17, (.12 + (g % 5) * .045) * ab);
          cx2.beginPath();
          for (let i = g; i < 720; i += 85) {
            if ((which === 1 && !moved[i]) || (which === 2 && moved[i])) continue;
            const n = nOf(i);
            for (let j = 0; j < n; j++) { const q = lineAt(i, j), X = cx + q[0] * sx, Y = cy + q[1] * sy; if (j) cx2.lineTo(X, Y); else cx2.moveTo(X, Y); }
          }
          cx2.stroke();
        }
      };
      // 미리 그린 그림: 놓기 전 전부(a), 놓은 뒤 전부(b+k), 안 휘는 선만(u+k). 휘는 동안만 휘는 선을 매 프레임 긋는다.
      const still = m < .001 ? "a" : m > .999 ? "b" + k : null, key = still || "u" + k;
      if (!L.off[key]) {
        const dpr = x.getTransform().a || 1, oc = document.createElement("canvas");
        oc.width = Math.round(w * dpr); oc.height = Math.round(h * dpr);
        const ox = oc.getContext("2d"); ox.setTransform(dpr, 0, 0, dpr, 0, 0); strokeLines(ox, still ? 0 : 2); L.off[key] = oc;
      }
      x.drawImage(L.off[key], 0, 0, w, h);
      if (!still) strokeLines(x, 1);
      // 흐르는 점(원본) + 근무 글자(진행만큼)
      const nLet = Math.round(24 * (.2 + .8 * S.ps));
      x.font = "700 8px ui-monospace, Menlo, monospace"; x.textAlign = "center"; x.textBaseline = "middle";
      for (let i = 0; i < 720; i += 6) {
        const n = nOf(i), q = lineAt(i, Math.floor((sec * 20 + i * 7) % n)), X = cx + q[0] * sx, Y = cy + q[1] * sy;
        if (i % 30 === 0 && i / 30 < nLet) { const v = "DEN"[(i / 30) % 3]; x.fillStyle = P.col[v]; x.fillText(v, X, Y); continue; }
        x.fillStyle = p2 + "b0"; x.beginPath(); x.arc(X, Y, .9, 0, TAU); x.fill();
      }
      // 고정·지정 칸(반발 영역)과 새 배정 칸
      const cell = (X, Y, sz, v, edge, al) => {
        x.fillStyle = S.dark ? rgba(L.pal[0], .85 * al) : `rgba(255,255,255,${.75 * al})`;
        x.fillRect(X - sz / 2, Y - sz / 2, sz, sz);
        x.strokeStyle = rgba(edge, al); x.lineWidth = 1.2; x.strokeRect(X - sz / 2 + .5, Y - sz / 2 + .5, sz - 1, sz - 1);
        x.fillStyle = rgba(v === "/" ? P.dim : P.col[v], al); x.font = `700 ${Math.round(sz * .7)}px ui-monospace, Menlo, monospace`; x.fillText(v, X, Y + .5);
      };
      for (const [fx, fy, v] of FLOW_FIXED) { const [X, Y] = sp(fx, fy); cell(X, Y, 10, v, p1, .9); }
      if (m > .01) {
        const [X, Y] = sp(FLOW_NEW[k][0], FLOW_NEW[k][1]);
        if (ph < 1.6) { const r = (ph - .3) * 26; if (r > 0) { x.strokeStyle = rgba(P.gold, Math.max(0, .6 - r / 40)); x.lineWidth = 1.2; x.beginPath(); x.arc(X, Y, r + 5, 0, TAU); x.stroke(); } }
        cell(X, Y, 6 + 5 * m, "EDN"[k], P.gold, m);
      }
      caption(S, flow.name, "네모 = 고정·지정 칸 · 금빛 칸(새 배정)이 놓이면 물길이 휩니다", "새 배정이 놓이면 물길이 휩니다");
    },
  };

  // ------------------------------------------------------------ 차원의 접힘(08) — 4차원 테서랙트, 축 넷 = 네 관점
  // 원본 그대로: 크기가 다른 테서랙트 26겹을 세 평면에서 4차원 회전해 투영, 밝게 드러나는 겹 수 ← 진행(원본은 단계).
  // 회전은 원본의 약 3배 빠르기 — 몇 초 안에 축이 접혔다 펴지는 것이 보이게. 얹은 것: 4차원의 축 넷에 '횟수·주말·
  // 숙련도·지정' 이름을 붙이고 오른쪽 막대 넷에 그 축이 화면에 드러난 길이를 보인다. 한 축이 4번째 차원 쪽으로
  // 돌면 그 축은 가운데로 접혀 막대가 줄고 다른 축이 드러난다 — 한 관점만 보면 다른 관점이 흔들린다. 진행이 차면
  // 막대 넷이 함께 올라오며 덜 흔들린다(여러 관점을 함께 맞춰 감). 막대는 앱 점수가 아니다.
  const TESS_AX = ["횟수", "주말", "숙련도", "지정"];
  function tessRotate(a, t, shell) {
    for (const [u, v, ang] of [[0, 3, t + shell * .045], [1, 2, t * .43], [2, 3, .5 + t * .3]]) {
      const X = a[u], Y = a[v], c = Math.cos(ang), s = Math.sin(ang);
      a[u] = X * c - Y * s; a[v] = X * s + Y * c;
    }
    return a;
  }
  const tesseract = {
    key: "tesseract", name: "차원의 접힘", random: false,
    init(S) {
      abyssInit(S, "tess");
      S.L.axCol = S.dark ? ["#9FD8FF", "#C9B6FF", "#C7F5A8", "#FFD678"] : ["#2F7BE6", "#8B6FD6", "#4D9A3A", "#B7791F"];
    },
    draw(S) {
      const { x, w, h } = S, L = S.L, [, p1, p2] = L.pal, ab = L.ab, sec = S.reduce ? 0 : S.t / 1000, t = 1.2 + sec * .3;
      abyssBg(S);
      const panel = 118, size = Math.min((h - 10) * .185, (w - panel) * .2), cx = Math.min(w / 2, (w - panel) / 2 + 6), cy = h * .47;
      const Pj = abyssProj(.4, -.3, size, cx, cy), o = [0, 0, 0, 0], lit = S.ps * 26, pts = [];
      for (let shell = 25; shell >= 0; shell--) {
        const sz = .23 + shell * .029;
        for (let i = 0; i < 16; i++) {
          const a = tessRotate([0, 1, 2, 3].map(j => ((i >> j) & 1 ? 1 : -1) * sz), t, shell), k = 2.8 / (2.8 - a[3]);
          Pj(a[0] * k, a[1] * k, a[2] * k, o); pts[i] = [o[0], o[1]];
        }
        x.strokeStyle = mixc(p1, p2, shell / 26, (shell < lit ? .27 : .10) * ab); x.lineWidth = .55;
        x.beginPath();
        for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { const b = i ^ (1 << j); if (b > i) { x.moveTo(pts[i][0], pts[i][1]); x.lineTo(pts[b][0], pts[b][1]); } }
        x.stroke();
        if (shell === 25) { x.fillStyle = p2; for (const q of pts) { x.beginPath(); x.arc(q[0], q[1], 1.5, 0, TAU); x.fill(); } }
      }
      glowAt(x, cx, cy, h * .2, p1, .07);
      // 축 넷 — 바깥 겹과 같이 돈다. 4번째 차원으로 돌아 들어간 축은 가운데로 접힌다
      const L0 = (.23 + 25 * .029) * 1.35, vis = [], tips = [];
      for (let i = 0; i < 4; i++) {
        const e = [0, 0, 0, 0]; e[i] = L0; tessRotate(e, t, 25);
        const k = 2.8 / (2.8 - e[3]); Pj(e[0] * k, e[1] * k, e[2] * k, o);
        tips.push([o[0], o[1]]); vis.push(Math.hypot(o[0] - cx, o[1] - cy) / (L0 * size * 1.25));
      }
      x.font = "600 9px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
      tips.forEach(([X, Y], i) => {
        const a = .35 + .65 * cl01(vis[i]), col = L.axCol[i];
        x.strokeStyle = rgba(col, .55 * a); x.lineWidth = 1; x.setLineDash([2, 2]);
        x.beginPath(); x.moveTo(cx, cy); x.lineTo(X, Y); x.stroke(); x.setLineDash([]);
        x.fillStyle = col; x.beginPath(); x.arc(X, Y, 2, 0, TAU); x.fill();
        const dx = X - cx, dy = Y - cy, d = Math.hypot(dx, dy) || 1;
        x.fillStyle = rgba(col, a); x.fillText(TESS_AX[i], X + dx / d * 13, Y + dy / d * 9);
      });
      // 막대 넷 — 그 축이 드러난 길이(돌면 바뀐다) + 진행만큼 함께 올라옴
      const mean = (vis[0] + vis[1] + vis[2] + vis[3]) / 4, bx = w - panel + 40, bw = panel - 52, by = 14;
      x.font = "9px system-ui, sans-serif"; x.textAlign = "right";
      for (let i = 0; i < 4; i++) {
        const v = cl01(.2 + .6 * S.ps + (vis[i] - mean) * .9 * (1 - .65 * S.ps)), y = by + i * 14;
        x.fillStyle = rgba(S.P.dim, .2); x.fillRect(bx, y - 3, bw, 6);
        x.fillStyle = L.axCol[i]; x.fillRect(bx, y - 3, bw * v, 6);
        x.fillStyle = S.P.sub; x.fillText(TESS_AX[i], bx - 5, y);
      }
      caption(S, tesseract.name, "축 넷 = 네 관점 · 한 축이 접히면 다른 축이 드러납니다", "한 축이 접히면 다른 축이 드러남");
    },
  };

  // ------------------------------------------------------------ 질서의 꽃(09) — 슈퍼포뮬러 주름 곡면, 꽃잎 = 사람
  // 원본 그대로: 슈퍼포뮬러(m=7) 곡면의 위도선 105 → 72줄·경도선 70 → 52줄, 위도별 주름(폭 ← 진행), 같은 회전.
  // 얹은 것: 꽃잎 일곱이 일곱 사람이고 꽃잎 길이가 그 사람의 밤 근무 수다(꽃잎 끝 숫자). 1.7초마다 밤이 가장 많은
  // 꽃잎에서 가장 적은 꽃잎으로 달 하나가 건너가 길이가 고르게 펴진다(진행이 앞서면 진행만큼). 다 펴져도 꽃잎마다
  // 주름·기울기는 제각각 — 모두를 같은 모양으로 만들지 않는 균등. 실제 탄성 물리·실제 배정 기록이 아니다.
  function superR(a, m, n1, n2, n3) { return (Math.abs(Math.cos(m * a / 4)) ** n2 + Math.abs(Math.sin(m * a / 4)) ** n3) ** (-1 / n1); }
  const flower = {
    key: "flower", name: "질서의 꽃", random: false,
    init(S) {
      abyssInit(S, "flower");
      // 밤 수가 고르지 않은 일곱 사람 — 많은 사람과 적은 사람을 번갈아 둘러 놓는다
      const cnt = S.plan.map(r => r.filter(v => v === "N").length), ord = cnt.map((_, i) => i).sort((a, b) => cnt[b] - cnt[a] || a - b);
      const pick = [ord[0], ord[ord.length - 1], ord[1], ord[ord.length - 2], ord[2], ord[ord.length - 3], ord[Math.floor(ord.length / 2)]];
      let b = pick.map(i => cnt[i]);
      if (Math.max(...b) - Math.min(...b) < 4) b = [9, 3, 7, 4, 8, 2, 6];   // 명단이 이미 고르면 연출이 안 보인다
      const states = [b.slice()], moves = [];
      for (let g = 0; g < 30; g++) {
        const hi = b.indexOf(Math.max(...b)), lo = b.indexOf(Math.min(...b));
        if (b[hi] - b[lo] <= 1) break;
        b = b.slice(); b[hi]--; b[lo]++; moves.push([hi, lo]); states.push(b);
      }
      S.L.who = pick; S.L.states = states; S.L.moves = moves;
      S.L.mean = states[0].reduce((s, v) => s + v, 0) / 7;
    },
    draw(S) {
      const { x, w, h, P } = S, L = S.L, [, p1, p2] = L.pal, ab = L.ab, sec = S.reduce ? 0 : S.t / 1000;
      abyssBg(S);
      // 몇 번째 건너감인지 — 시간(1.7초마다)과 진행 가운데 앞선 쪽
      const K = L.moves.length, eff = Math.min(K, Math.max(S.reduce ? 0 : Math.max(0, sec - .5) / 1.7, S.ps * K)), n = Math.floor(eff), ph = eff - n;
      const land = n < K ? cl01((ph - .55) / .3) : 0, cur = L.states[n], nxt = L.states[Math.min(K, n + 1)];
      const sc = cur.map((v, i) => Math.max(.6, Math.min(1.4, 1 + .1 * ((v + (nxt[i] - v) * land) - L.mean))));
      const scAt = (u) => { const f = ((u / (TAU / 7)) % 7 + 7) % 7, k0 = Math.floor(f), fr = f - k0, s = fr * fr * (3 - 2 * fr); return sc[k0] * (1 - s) + sc[(k0 + 1) % 7] * s; };
      const size = Math.min(w * .3, (h - 12) * .45), Pj = abyssProj(.3 + sec * .055, -.3, size, w / 2, h * .47), wav = .04 + .03 * S.ps;
      // u(둘레)마다 변하지 않는 값(슈퍼포뮬러 반지름 등)은 표로 한 번만 — 점이 만 개 넘어 매번 거듭제곱하면 무거웠다
      const U = L.utab || (L.utab = new Map()), ut = (u) => {
        let e = U.get(u);
        if (!e) { e = [Math.cos(u), Math.sin(u), superR(u, 7, .47, 1.4, 1.4), Math.cos(7 * u), u * 21, 0, -1]; U.set(u, e); }
        if (e[6] !== S.now) { e[5] = scAt(u); e[6] = S.now; }
        return e;
      };
      const pos = (u, v, o) => {
        const e = ut(u), r = e[2] * e[5], cv = Math.cos(v), wave = wav * Math.sin(e[4] + v * 9 + sec * .25) * cv * cv;
        return Pj((r * .75 + wave) * cv * e[0], (r * .75 + wave) * cv * e[1], .65 * Math.sin(v) + .16 * e[3] * cv * cv, o);
      };
      fibers(S, "fa", 72, 140, (a, b, o) => pos(b / 140 * TAU, (a / 71 - .5) * Math.PI, o),
        (a, z) => mixc(p1, p2, a / 72, (.16 + .27 * cl01((1 - z) / 2)) * ab), .65, true);
      fibers(S, "fb", 52, 52, (a, b, o) => pos(a / 52 * TAU, (b / 52 - .5) * Math.PI, o), () => rgba(p1, .145 * ab), .5, false);
      // 꽃잎 끝 — 밤 근무 수
      const o = [0, 0, 0, 0], tips = [], ctr = Pj(0, 0, 0, [0, 0, 0, 0]);
      for (let k = 0; k < 7; k++) { pos(k * TAU / 7, 0, o); tips.push([o[0], o[1]]); }
      x.font = "700 9px ui-monospace, Menlo, monospace"; x.textAlign = "center"; x.textBaseline = "middle";
      const mv = n < K ? L.moves[n] : null;
      tips.forEach(([X, Y], k) => {
        const dx = X - ctr[0], dy = Y - ctr[1], d = Math.hypot(dx, dy) || 1, v = land > .5 ? nxt[k] : cur[k];
        const tx = Math.max(8, Math.min(w - 8, X + dx / d * 9)), ty = Math.max(7, Math.min(h - 19, Y + dy / d * 7)), hot = mv && (mv[0] === k || mv[1] === k) && ph < .9;
        x.fillStyle = hot ? P.col.N : S.P.sub; x.fillText(String(v), tx, ty);
      });
      // 건너가는 달 — 많은 꽃잎에서 적은 꽃잎으로
      if (mv && !S.reduce && ph < .6) {
        const f = cl01(ph / .55), e = f * f * (3 - 2 * f), [ax, ay] = tips[mv[0]], [bx, by] = tips[mv[1]];
        const mx = (ax + bx) / 2, my = (ay + by) / 2, ox = mx - ctr[0], oy = my - ctr[1], od = Math.hypot(ox, oy) || 1, lift = 18;
        const qx = mx + ox / od * lift, qy = my + oy / od * lift;
        const X = (1 - e) * (1 - e) * ax + 2 * (1 - e) * e * qx + e * e * bx, Y = (1 - e) * (1 - e) * ay + 2 * (1 - e) * e * qy + e * e * by;
        x.strokeStyle = rgba(P.col.N, .35); x.lineWidth = 1; x.setLineDash([2, 3]);
        x.beginPath(); x.moveTo(ax, ay); x.quadraticCurveTo(qx, qy, bx, by); x.stroke(); x.setLineDash([]);
        crescent(x, X, Y, 4, S.dark ? P.moon : P.col.N);
      }
      const done = eff >= K;
      caption(S, flower.name, done ? "고르게 폈지만 꽃잎마다 모양은 제각각" : "꽃잎 = 한 사람, 길이 = 밤 근무 · 많은 쪽 밤을 적은 쪽으로",
        done ? "고르게, 그러나 제각각" : "꽃잎 = 사람, 숫자 = 밤 근무");
    },
  };

  // ------------------------------------------------------------ 회복의 파동(10) — 구면 위 수리가 이웃으로 번진다
  // 원본 그대로: 위도선 100 → 80줄의 구면, 두 지점에서 퍼지는 거리 기반 파동 둘(진폭 ← 단계 변경 수 → 여기선 진행이
  // 찰수록 잦아듦), 같은 회전. 파동 속도만 2.5배 — 몇 초 안에 퍼지는 것이 보이게. 얹은 것: 구면의 점 84개가 근무
  // 칸이다(진행만큼 근무색으로 켜짐). 3.8초마다 앞쪽 칸 하나를 '수리'(금빛 고리)하면 그 자리에서 둥근 물결이
  // 구면을 따라 퍼지고, 물결이 닿은 이웃 칸이 흔들렸다 가라앉는다. 앱의 실제 영향 전파를 계산한 것이 아니다.
  const SPH_N = 84, SPH_A = 80, SPH_B = 120;
  // 구면 격자 점과 원본 두 파원까지의 거리는 늘 같다 — 한 번만 만든다(점마다 매 프레임 acos 셋은 폰에서 무거웠다)
  const SPH = { g: null };
  function sphereGrid() {
    if (SPH.g) return SPH.g;
    const n = SPH_A * (SPH_B + 1), g = { X: new Float32Array(n), Y: new Float32Array(n), Z: new Float32Array(n), d1: new Float32Array(n), d2: new Float32Array(n) };
    const ac = (v) => Math.acos(Math.max(-1, Math.min(1, v)));
    for (let j = 0; j < SPH_A; j++) for (let i = 0; i <= SPH_B; i++) {
      const q = j * (SPH_B + 1) + i, phi = (j / (SPH_A - 1) - .5) * Math.PI, u = i / SPH_B * TAU;
      const X = Math.cos(phi) * Math.cos(u), Y = Math.sin(phi), Z = Math.cos(phi) * Math.sin(u);
      g.X[q] = X; g.Y[q] = Y; g.Z[q] = Z; g.d1[q] = ac(X * .5 + Y * .7 + Z * .51); g.d2[q] = ac(-X * .7 + Y * .4 - Z * .59);
    }
    return (SPH.g = g);
  }
  const sphere = {
    key: "sphere", name: "회복의 파동", random: false,
    init(S) {
      abyssInit(S, "sphere");
      const cells = [], ga = Math.PI * (3 - Math.sqrt(5));
      for (let c = 0; c < SPH_N; c++) {
        const y = 1 - (c + .5) / SPH_N * 2, r = Math.sqrt(1 - y * y), a = c * ga;
        cells.push({ p: [r * Math.cos(a), y, r * Math.sin(a)], key: Math.floor(c * S.nS * S.nD / SPH_N) });
      }
      S.L.cells = cells; S.L.pulse = null; S.L.G = sphereGrid();
    },
    draw(S) {
      const { x, w, h, P, nD } = S, L = S.L, [, p1, p2] = L.pal, ab = L.ab, sec = S.reduce ? 0 : S.t / 1000;
      abyssBg(S);
      const size = Math.min(w * .3, (h - 12) * .4), rot = 2.2 + sec * .09, Pj = abyssProj(rot, -.3, size, w / 2, h * .47), o = [0, 0, 0, 0];
      // 수리 — 3.8초마다 앞쪽(보이는 쪽) 칸 하나
      const PER = 3.8, n = Math.floor(sec / PER), age = S.reduce ? 1.2 : sec - n * PER, W0 = 1.25;
      if (!L.pulse || L.pulse.n !== n) {
        const front = L.cells.filter(c => { Pj(c.p[0], c.p[1], c.p[2], o); return o[2] < -.45; });
        const c = front[Math.floor(rnd(n * 13 + 7) * front.length)] || L.cells[0];
        const G = L.G, ds = new Float32Array(G.X.length);
        for (let q = 0; q < ds.length; q++) ds[q] = Math.acos(Math.max(-1, Math.min(1, G.X[q] * c.p[0] + G.Y[q] * c.p[1] + G.Z[q] * c.p[2])));
        L.pulse = { n, c, ds };
      }
      const src = L.pulse.c.p, amp = .55 + .45 * (1 - S.ps), fade = Math.exp(-age * .45);
      const dist = (X, Y, Z) => Math.acos(Math.max(-1, Math.min(1, X * src[0] + Y * src[1] + Z * src[2])));
      const G = L.G, ds = L.pulse.ds, front = W0 * age;
      fibers(S, "fa", SPH_A, SPH_B, (j, i, out) => {
        const q = j * (SPH_B + 1) + i, dd = (ds[q] - front) / .13;
        let wv = amp * Math.sin(G.d1[q] * 13 - sec * 1.75) * .042 + Math.sin(G.d2[q] * 17 - sec * 1.25) * .025;
        if (dd > -3 && dd < 3) wv += .07 * Math.exp(-dd * dd) * fade;
        const R = 1 + wv;
        return Pj(G.X[q] * R, G.Y[q] * R, G.Z[q] * R, out);
      }, (j, z) => mixc(p1, p2, j / SPH_A, (.13 + .43 * cl01((1 - z) / 2)) * ab), .65, true);
      glowAt(x, w / 2, h * .47, h * .22, p1, .07);
      // 칸 — 물결이 닿으면 흔들렸다 가라앉는다
      for (const c of L.cells) {
        const th = dist(c.p[0], c.p[1], c.p[2]), tau = age - th / W0;
        const jig = tau > 0 ? Math.exp(-tau * 3) * Math.sin(tau * 16) * .06 * fade : 0, fl = tau > 0 ? Math.exp(-tau * 4) * fade : 0;
        const R = 1.03 + jig; Pj(c.p[0] * R, c.p[1] * R, c.p[2] * R, o);
        if (o[2] > .35) continue;                       // 뒤쪽은 숨긴다
        const depth = cl01((.35 - o[2]) / .9), i = Math.floor(c.key / nD), d = c.key % nD, v = S.plan[i][d], placed = S.rank[c.key] < S.settled;
        const col = !placed ? S.P.dim : v === "/" ? S.P.dim : P.col[v];
        x.fillStyle = rgba(col, (placed ? (v === "/" ? .45 : .95) : .25) * depth);
        x.beginPath(); x.arc(o[0], o[1], (placed && v !== "/" ? 2 : 1.3) * o[3] * (1 + fl * .6), 0, TAU); x.fill();
        if (fl > .05) { x.strokeStyle = rgba(S.dark ? "#FFFFFF" : P.flash, .8 * fl * depth); x.lineWidth = 1; x.beginPath(); x.arc(o[0], o[1], 3.5 + 2 * fl, 0, TAU); x.stroke(); }
      }
      // 수리한 칸
      Pj(src[0] * 1.03, src[1] * 1.03, src[2] * 1.03, o);
      const pr = S.reduce ? 0 : Math.max(0, 1 - age / .5);
      glowAt(x, o[0], o[1], 12 + 6 * pr, P.gold, .45);
      x.strokeStyle = P.gold; x.lineWidth = 1.6; x.beginPath(); x.arc(o[0], o[1], 4 + 2 * pr, 0, TAU); x.stroke();
      x.font = "600 9px system-ui, sans-serif"; x.textAlign = "left"; x.textBaseline = "middle"; x.fillStyle = P.gold;
      x.fillText("수리", o[0] + 8, o[1] - 7);
      caption(S, sphere.name, "금빛 = 고친 칸 · 물결이 닿은 이웃 칸이 흔들렸다 가라앉음", "고친 칸의 물결이 이웃으로");
    },
  };

  // ------------------------------------------------------------ 끝나지 않은 균형(14) — 진동막, 남는 흔들림
  // 원본 그대로: 원판 진동막(두 정재파 sin8x·sin5y + sin8y·sin5x)의 점 격자, 마디선 근처 점을 밝고 크게, 같은 기울임·
  // 회전 흔들림. 점 수만 원본 134²에서 상자에 맞춰 55~75²로 — 원본 수를 160px에 넣으면 점이 겹쳐 마디선이 굵은 띠가
  // 됐다(원본처럼 점 간격이 점 크기의 두 배쯤). 진동 주기만 원본 45초 → 4초(몇 초 안에 떨림이 보이게), 기울기는 -.3 → -.48(떨림이 보이게).
  // 얹은 것: 막의 떨림이 진행만큼 잦아든다. 고리 여덟 곳은 따로 흔들리는 자리(남은 추가 검토) — 진행이 차며 하나씩
  // 가라앉지만 세 곳은 끝까지 남는다. 마지막 해는 완벽의 증명이 아니라 계속 관찰할 것이 남은 상태. 최적성 증명이 아니다.
  const MEM = new Map();
  function membranePoints(n) {
    if (MEM.has(n)) return MEM.get(n);
    const xs = [], r = mulberry(1414);
    const spots = [];
    while (spots.length < 8) {
      const a = r() * TAU, d = .25 + r() * .7, sx = Math.cos(a) * d, sy = Math.sin(a) * d;
      if (spots.every(s => Math.hypot(s.x - sx, s.y - sy) > .45)) spots.push({ x: sx, y: sy, w: 3.2 + r() * 2.4, ph: r() * TAU });
    }
    spots.forEach((s, k) => { s.thr = k < 5 ? .18 + k * .16 : 9; });   // 다섯은 진행 18~82%에서 가라앉고 셋은 남는다
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const X = (i / (n - 1) - .5) * 2.4, Y = (j / (n - 1) - .5) * 2.4;
      if (Math.hypot(X, Y) > 1.2) continue;
      const m = Math.sin(X * 8) * Math.sin(Y * 5) + Math.sin(Y * 8) * Math.sin(X * 5), v = cl01(1 - Math.abs(m) * .9);
      const near = [];
      spots.forEach((s, k) => { const d2 = (X - s.x) ** 2 + (Y - s.y) ** 2; if (d2 < .09) near.push(k, Math.exp(-d2 / .018)); });
      xs.push({ X, Y, m, v, near });
    }
    xs.sort((a, b) => a.v - b.v);   // 밝은(마디) 점이 위에 오게 — 원본은 매 프레임 깊이로 정렬
    const out = { pts: xs, spots }; MEM.set(n, out); return out;
  }
  const membrane = {
    key: "membrane", name: "끝나지 않은 균형", random: false,
    init(S) {
      abyssInit(S, "membrane");
      const [, p1, p2] = S.L.pal, ab = S.L.ab;
      S.L.size = Math.min(S.w * .26, (S.h - 12) * .4);
      S.L.M = membranePoints(Math.max(40, Math.min(110, Math.round(2.4 * S.L.size / 2.5))));
      S.L.cols = Array.from({ length: 128 }, (_, i) => mixc(p1, p2, i / 127, (.12 + (i / 127) ** 5 * .73) * ab));
    },
    draw(S) {
      const { x, w, h } = S, L = S.L, [, , p2] = L.pal, sec = S.reduce ? 0 : S.t / 1000, M = L.M;
      abyssBg(S);
      const size = L.size, rot = .13 + .1 * S.ps + Math.sin(sec * .2) * .13;
      const Pj = abyssProj(rot, -.48, size, w / 2, h * .47), o = [0, 0, 0, 0];
      const A = .15 * (1.35 - 1.1 * S.ps), osc = S.reduce ? .7 : Math.cos(sec * 1.6);
      const alive = M.spots.map(s => cl01((s.thr - S.ps) / .06)), sw = M.spots.map((s, k) => alive[k] * .16 * Math.sin(sec * s.w + s.ph));
      for (const q of M.pts) {
        let z = q.m * A * osc;
        for (let k = 0; k < q.near.length; k += 2) z += sw[q.near[k]] * q.near[k + 1];
        Pj(q.X, q.Y, z, o);
        const big = q.v > .83, s = big ? 1.45 : .75;
        x.fillStyle = L.cols[Math.floor(q.v * 127)]; x.fillRect(o[0], o[1], s, s);
      }
      // 남은 흔들림 — 고리
      let left = 0;
      M.spots.forEach((s, k) => {
        if (alive[k] <= 0) return;
        left++;
        Pj(s.x, s.y, sw[k], o);
        const pulse = S.reduce ? 0 : .5 + .5 * Math.sin(sec * s.w + s.ph);
        x.strokeStyle = rgba(S.P.red, (.45 + .4 * pulse) * alive[k]); x.lineWidth = 1.2;
        x.beginPath(); x.arc(o[0], o[1], 5 + 2.5 * pulse, 0, TAU); x.stroke();
        x.fillStyle = rgba(p2, .9 * alive[k]); x.beginPath(); x.arc(o[0], o[1], 1.4, 0, TAU); x.fill();
      });
      const done = S.ps >= .999;
      caption(S, membrane.name, done ? `떨림은 잦아들었고 ${left}곳이 남았습니다 — 계속 지켜봅니다` : `떨림이 잦아드는 중 · 고리 = 아직 흔들리는 곳 ${left}`,
        done ? `남은 흔들림 ${left}곳 — 계속 관찰` : `고리 = 흔들리는 곳 ${left}`);
    },
  };

  // 앞 열하나는 앱 생성 중 무작위 후보, 뒤 여섯(random: false)은 모음 페이지에서 __genVizForce로만 그린다.
  const VIZ = [rain, journey, ripple, helix, city, mandala, porous, growth, score, orrery, swaps,
    manifold, flow, tesseract, flower, sphere, membrane];
  const NAMES = VIZ.filter(v => v.random !== false).map(v => v.name);
  const EXTRA_NAMES = VIZ.filter(v => v.random === false).map(v => v.name);
  const LAST_KEY = "ns_genviz_last";
  let last = null;
  try { last = localStorage.getItem(LAST_KEY); } catch (e) { /* 저장 막힘 — 이 탭 안에서만 직전 제외 */ }
  let run = null;   // { S, viz, raf, timer }

  function choose() {
    const force = window.__genVizForce;
    if (force) {
      const f = VIZ.find(v => v.name === force || v.key === force);
      if (f) return f;
    }
    const pool = VIZ.filter(v => v.random !== false && v.key !== last);
    const v = pool[Math.floor(Math.random() * pool.length)];
    last = v.key;
    try { localStorage.setItem(LAST_KEY, v.key); } catch (e) { /* 위와 같음 */ }
    return v;
  }

  function stop() {
    if (!run) return;
    if (run.raf) cancelAnimationFrame(run.raf);
    if (run.timer) clearInterval(run.timer);
    run = null;
  }

  // opts: { nS, nD, year, month, progress: () => 0~1 }
  function start(cv, opts) {
    stop();
    const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const dark = !(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 300, h = cv.clientHeight || 160;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const x = cv.getContext("2d");
    if (!x) return null;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const nS = opts.nS, nD = opts.nD;
    const plan = Array.from({ length: nS }, (_, i) => rosterRow(i, nD));
    // 놓는 순서: 날짜 순서, 같은 날 안에서는 섞어서
    const order = [], rank = new Int32Array(nS * nD);
    for (let d = 0; d < nD; d++) {
      const rows = Array.from({ length: nS }, (_, i) => i).sort((a, b) => rnd(a * 7 + d) - rnd(b * 7 + d));
      for (const i of rows) { rank[i * nD + d] = order.length; order.push(i * nD + d); }
    }
    const dow0 = opts.year && opts.month ? new Date(opts.year, opts.month - 1, 1).getDay() : null;
    const S = { x, w, h, dark, reduce, P: dark ? PAL.dark : PAL.light, nS, nD, plan, order, rank,
                born: new Map(), settled: 0, p: 0, ps: 0, now: performance.now(), t: 0, month: opts.month || null, dow0, L: {} };
    const viz = choose();
    const me = { S, viz, raf: null, timer: null };
    run = me;
    GenViz.lastError = null;
    try { viz.init && viz.init(S); } catch (e) { fail(e, viz); return viz.name; }
    const t0 = S.now; let prev = S.now;
    const draw = (now) => {
      if (run !== me) return;
      const p = Math.max(0, Math.min(1, Number(opts.progress()) || 0));
      // rAF의 now는 start()에서 읽은 performance.now()보다 이를 수 있다 — 음수 경과시간이면 다공성 질서의
      // 탐색자 위치가 -1이 돼 그리다 멈췄다(ui_smoke가 잡음). 0 아래로 내려가지 않게 한다.
      S.p = p; S.now = now; S.t = Math.max(0, now - t0);
      const dt = Math.max(0, Math.min(200, now - prev)); prev = Math.max(prev, now);
      S.ps = reduce ? p : (p < S.ps ? p : S.ps + (p - S.ps) * (1 - Math.exp(-dt / 220)));
      if (p >= 1 && S.ps > .995) S.ps = 1;
      const target = Math.min(order.length, Math.floor(order.length * p));
      while (S.settled < target) { S.born.set(order[S.settled], now); S.settled++; }
      try {
        viz.draw(S);
        x.textAlign = "left"; x.textBaseline = "alphabetic"; x.font = "10px system-ui, sans-serif";
        x.fillStyle = S.P.label; x.fillText(viz.name, 7, h - 4);
      } catch (e) { fail(e, viz); }
    };
    if (reduce) { draw(performance.now()); me.timer = setInterval(() => draw(performance.now()), 500); return viz.name; }
    const frame = (now) => { draw(now); if (run === me) me.raf = requestAnimationFrame(frame); };
    me.raf = requestAnimationFrame(frame);
    return viz.name;
  }
  // 그리다 오류가 나면 그 연출만 멈춘다(생성은 계속) — 매 프레임 같은 오류를 쏟지 않게 한 번만 알린다.
  function fail(e, viz) {
    GenViz.lastError = `${viz.name}: ${e && e.message ? e.message : e}`;
    stop();
    console.error("생성 중 시각화 오류 —", GenViz.lastError, e && e.stack);
  }

  const GenViz = window.GenViz = {
    NAMES, EXTRA_NAMES, start, stop, rosterRow, validRow, lastError: null,
    current: () => (run ? run.viz.name : null),
    // 점검용 — 지금 연출의 내부 상태(교환의 성좌가 바꾼 줄이 규칙을 지키는지 등). 화면은 쓰지 않는다.
    debugState: () => (run ? run.S.L : null),
  };
})();
