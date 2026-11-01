// ================================================================ 생성 중 시각화 (genviz.js)
// 생성 오버레이의 캔버스(#genRain, 높이 160px)에 열한 가지 연출 중 하나를 그린다. 생성할 때마다 무작위로
// 고르되 직전 것은 빼고 고른다(같은 그림이 연달아 나오면 '무작위'로 안 보인다). 후보는 원래 있던 '비'(사용자가
// 남기라고 함) + docs/시각화/모음/시각화_9가지_261101.html에서 고른 것 가운데 여덟 가지(탐색과정은 사용자가
// 뺐다, 2026-11-01) + GPT 갤러리의 성장하는 해(02-04)·교환의 성좌(01-07). 원본을 160px 상자에서 눈에 보이게
// 줄였고, 뒤의 둘은 근무표와의 연결이 한눈에 보이게 다시 그렸다(사용자: '이해가 잘되게').
//  - 생성은 보통 3~10초라, 진행과 별개로 시간으로 도는 움직임(걷기·회전·재생선·탐색자·맞교환)을 3~5초 주기로
//    두어 처음 2~3초 안에 무엇을 보여 주는지 드러나게 했다(사용자). 진행에 묶인 것은 '채워지는' 부분이다.
//
// 지키는 것 — 열한 가지 모두 같다:
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
  const swaps = {
    key: "swaps", name: "교환의 성좌",
    init(S) {
      S.L.g = gridLayout(S, 22, 5, 16);
      S.L.cur = S.plan.map(r => r.slice());
      S.L.done = []; S.L.slot = -1; S.L.sw = null;
    },
    pick(S, slot) {
      const { nS, nD } = S, cur = S.L.cur, maxD = Math.min(nD - 1, Math.max(6, Math.floor(S.p * nD)));
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
      const PERIOD = 1400, MOVE = 900, t = S.reduce ? 0 : S.t - 250, slot = Math.floor(t / PERIOD), ph = (t - slot * PERIOD) / MOVE;
      if (!S.reduce && t >= 0 && slot !== L.slot) {
        if (L.sw && L.sw.applied) { L.done.push(L.sw); if (L.done.length > 14) L.done.shift(); }
        L.slot = slot; L.sw = swaps.pick(S, slot);
      }
      const sw = L.sw, moving = sw && ph < 1;
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
        if (S.rank[key] >= S.settled && !mine) { x.fillStyle = rgba(P.dim, .16); x.fillRect(cx(d) - .8, cy(i) - .8, 1.6, 1.6); continue; }
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

  const VIZ = [rain, journey, ripple, helix, city, mandala, porous, growth, score, orrery, swaps];
  const NAMES = VIZ.map(v => v.name);
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
    const pool = VIZ.filter(v => v.key !== last);
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
    NAMES, start, stop, rosterRow, validRow, lastError: null,
    current: () => (run ? run.viz.name : null),
    // 점검용 — 지금 연출의 내부 상태(교환의 성좌가 바꾼 줄이 규칙을 지키는지 등). 화면은 쓰지 않는다.
    debugState: () => (run ? run.S.L : null),
  };
})();
