// ================================================================ 생성 중 시각화 (genviz.js)
// 생성 오버레이의 캔버스(#genRain, 높이 160px)에 열두 가지 연출 중 하나를 그린다. 생성할 때마다 무작위로
// 고르되 직전 것은 빼고 고른다(같은 그림이 연달아 나오면 '무작위'로 안 보인다). 후보는 원래 있던 '비'(사용자가
// 남기라고 함) + docs/시각화/모음/시각화_9가지_261101.html에서 고른 것 가운데 여덟 가지(탐색과정은 사용자가
// 뺐다, 2026-11-01) + GPT 갤러리의 성장하는 해(02-04)·교환의 성좌(01-07) + GPT '탐색의 심연'의 08 차원의 접힘
// (사용자 2026-11-02; 09 질서의 꽃은 넣었다가 "안 예쁘다"로 뺐다). 원본을 160px 상자에 맞게 줄였다.
//
// 지키는 것 — 열두 가지 모두 같다:
//  - 칸은 실제 생성 기록 순서로 놓는다(사용자 2026-11-02: "원본처럼, 원본 생성 순서처럼"). 원본들이 재생하는
//    기록(아래 TRACE — docs/시각화/claude_20261022/data/trace_sample_261022.json, 앱 샘플 명단 40명·2026년 10월,
//    tools/build_genviz_trace.py가 줄여 싣는다)을 그대로 재생한다: 파트장 → 야간전담 → 야간 블록 → 수면오프 →
//    주간 채우기 → 남은 칸 OFF → 수리·균등화(이미 놓인 칸이 바뀐다). 근무 글자·배치도 실제 엔진 결과라 규칙을 지킨다.
//    격자를 그리는 연출은 앞 14명(TRACE.rows)·31일만 쓰고, 교환의 성좌만 원본처럼 40명을 점으로 그린다.
//    사람 수·날짜는 이 기록 기준이라 화면의 명단 수·달과 다를 수 있다 — 연출이지 이번 달 표가 아니다.
//    (생성이 도는 동안은 Worker 안의 실제 순서를 알 수 없다. 그래서 같은 엔진의 기록 한 벌을 재생한다.)
//  - 등속(사용자 2026-11-02: "모두 등속도로"). 감속·가속 곡선(ease-out, 지수 스무딩, 앞당김 곡선)을 쓰지 않는다.
//    진행 = max(게이지, 경과시간/T)를 직선으로 — T(연출마다, 기본 5.5초) 동안 기록 전체를 일정한 빠르기로
//    재생한다. 생성은 보통 3~8초라(꼼꼼히는 30초) 5.5초면 대개 끝나기 전에 채움(기록의 앞 2/3, 약 3.7초)을 다
//    보고 수리 단계 일부까지 보인다. 처음부터 시간으로 움직이므로 게이지가 처음 1~2초 거의 안 움직여도 멈칫하지
//    않는다(사용자 11/2 "처음이 너무 느려 멈칫"). 게이지가 앞서 가면(꼼꼼히 만들기의 시도 단위 게이지) 2/T의
//    일정한 빠르기로 따라간다 — 확 건너뛰지 않는다. 낙하·회전·재생 점도 모두 일정한 빠르기다.
//  - 첫 1.5~3초 안에 무엇을 보여 주는지 드러난다: 파트장 줄·야간전담 줄·야간 블록이 그 안에 놓인다.
//  - 다크/라이트: 다크면 캔버스가 바탕을 칠한다. 라이트면 바탕을 칠하지 않고(clearRect) CSS(.gen-rain)에
//    맡기며, 글자·선은 밝은·어두운 바탕 양쪽에서 대비 3:1 이상인 중간 톤이다. 삼성 인터넷 다크 모드는
//    라이트 페이지를 강제로 어둡게 칠하면서 캔버스 픽셀은 그대로 둬, 캔버스가 바탕을 칠하면 비 상자만
//    하얗게 떴다(2026-10-31 사용자 캡처). 야경만은 원본이 밤 그림이라 라이트에서도 밤하늘을 칠한다.
//  - prefers-reduced-motion이면 움직임 없이 진행 상태만 0.5초마다 다시 그린다.
//  - 점검용 고정: window.__genVizForce = '야경'(이름이나 key, '비' 포함). 고른 것은 GenViz.current()로 읽는다.
// 이 파일은 그리기만 한다 — Worker·전송과 무관하다(app.js의 startGenViz가 부른다).
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  // 근무 색. D·E·N은 원래 값, 나머지(야간전담 NK·prn p·파트장 8A·수면오프 S/)는 클로드 갤러리 원본 색.
  // 라이트 값은 #EEF2F0·#FFFFFF와 #121212·#202124 양쪽에 3:1 이상(2026-11-01·11-02 계산).
  const PAL = {
    dark: {
      bg: "#0b0f19",
      col: { D: "#60A5FA", E: "#FB923C", N: "#A78BFA", "/": "#9AA4B8", NK: "#F472B6", p: "#4ADE80", "8A": "#CBD5E1", "S/": "#2DD4BF" },
      ink: "#E8EEF6", sub: "#8C98AC", dim: "#9AA4B8", label: "rgba(232,238,246,.42)", flash: "#FFFFFF",
      gold: "#FFD678", red: "#FF6E5A", sun: "#FFC857", moon: "#E6E9FF",
    },
    light: {
      clear: true,
      col: { D: "#2F7BE6", E: "#E0620F", N: "#7C6BE0", "/": "#7E888E", NK: "#D2489A", p: "#2F8F4E", "8A": "#6F8296", "S/": "#0E9488" },
      ink: "#7A8580", sub: "#7E888E", dim: "#7E888E", label: "rgba(126,136,142,.75)", flash: "#0D9488",
      gold: "#B7791F", red: "#D9483B", sun: "#B7791F", moon: "#7C6BE0",
    },
  };
  // GPT 갤러리(악보·궤도·성좌) 원본 색 — 다크는 원본 그대로, 라이트는 같은 색상의 중간 톤(위와 같은 3:1 기준)
  const GPT_COL = {
    dark: { D: "#51B9B0", E: "#EF986D", N: "#9985DB", NK: "#D59BD8", "/": "#8A9694", "S/": "#D6C79B", "8A": "#E0C36B", p: "#ACD19A" },
    light: { D: "#25918A", E: "#C9672F", N: "#7F6BD0", NK: "#B45BB8", "/": "#7E888E", "S/": "#8E7C40", "8A": "#9A7A18", p: "#478C35" },
  };
  const rgbCache = new Map();
  function rgba(hex, a) {
    let rgb = rgbCache.get(hex);
    if (!rgb) { const n = parseInt(hex.slice(1), 16); rgb = `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; rgbCache.set(hex, rgb); }
    return `rgba(${rgb},${a})`;
  }
  function rnd(i) { const x = Math.sin(i * 9301 + 49297) * 233280; return x - Math.floor(x); }
  function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // <<TRACE — tools/build_genviz_trace.py가 쓴다. 손으로 고치지 말 것.
  // 원자료: docs/시각화/claude_20261022/data/trace_sample_261022.json(앱 샘플 명단 40명 · 2026년 10월 · 시드 0) — 사건 1747건, 칸을 바꾼 단계 26개.
  // ev: 사건마다 4글자 = 단계·사람·날짜·근무(codes의 번호), 글자 하나 = ALPHA의 위치.
  const TRACE = {
    nS: 40, nD: 31, rows: 14,
    alpha: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-",
    codes: ["D", "E", "N", "NK", "/", "p", "8A", "S/"],
    weekend: "0011100011100000110000011000001",
    stages: ["파트장", "야간전담", "야간 블록", "수면오프", "주간 채우기", "남은 칸 OFF", "미달 수리", "퐁당퐁당 정리", "짧은 블록 늘리기", "짧은 블록 늘리기", "짧은 블록 늘리기", "짧은 블록 늘리기", "짧은 블록 늘리기", "OFF 고르게", "퐁당퐁당 정리", "퐁당퐁당 정리", "짧은 블록 늘리기", "짧은 블록 늘리기", "짧은 블록 늘리기", "짧은 블록 늘리기", "짧은 블록 늘리기", "퐁당퐁당(전역)", "2일 블록(전역)", "퐁당퐁당(전역)", "D/E 균형", "주말 맞교환"],
    ev: "000600160024003400440056006600760084009400a400b600c600d600e600f600g400h400i600j600k600l600m600n400o400p600q600r600s600t6"
      + "00u41a031a131a231a341a441a541a631a731a841a941aa41ab31ac31ad31ae41af41ag41ah31ai31aj41ak41al41am31an31ao31ap41aq41ar41as3"
      + "1at31au41c331c431c541c641c741c831c931ca31cb41cc41cd41ce31cf31cg41ch41ci31cj31ck31cl41cm41cn31co31cp41cq41cr31cs31ct31cu4"
      + "1c041c141c242m022m122m242m342B022B122B242B342o022o122o242o342f022f122f242f342w022w122w242w342g222g322g442g542p222p322p44"
      + "2p542i222i322i442i542u222u322u442u54212221322144215422422252226422742D422D522D642D742r422r522r642r742n422n522n642n742z42"
      + "2z522z642z742s522s622s742s842x622x722x842x9429622972298429942l622l722l842l942y622y722y842y942k722k822k942ka42782279227a4"
      + "27b42q822q922qa42qb42A822A922Aa42Ab42v822v922va42vb42ma22mb22mc42md423a223b223c223d423e428a228b228c428d42ta22tb22tc42td4"
      + "2ba22bb22bc42bd42gc22gd22ge42gf42Cc22Cd22Ce42Cf42jc22jd22je42jf426c226d226e426f421d221e221f421g422e222f222g422h42he22hf2"
      + "2hg42hh42oe22of22og42oh42we22wf22wg42wh42sf22sg22sh42si42ig22ih22ii42ij42fg22fh22fi42fj42pg22ph22pi42pj42Bg22Bh22Bi42Bj4"
      + "2zh22zi22zj42zk42ui22uj22uk42ul42Di22Dj22Dk42Dl42ni22nj22nk42nl42mj22mk22ml42mm42yj22yk22yl42ym429k229l229m429n42rk22rl2"
      + "2rm42rn42kk22kl22km42kn42gl22gm22gn42go427l227m227n427o42Al22Am22An42Ao421m221n221o421p42lm22ln22lo42lp422n222o222p422q4"
      + "28o228p228q428r42qo22qp22qq42qr42vo22vp22vq42vr42bp22bq22br42bs42jp22jq22jr42js42Cp22Cq22Cr42Cs42tq22tr22ts42tt426q226r2"
      + "26s426t42xq22xr22xs42xt42hr22hs22ht42hu423r223s223t223u42os22ot22ou42is22it22iu42ft22fu22nu229u22ku227u231q732r733073f47"
      + "3gp73i073mn73o474d004e0045004s004y004C004p004b004D0046014z014u014h014q014v0148014A014r0144054d104e1045104y104s104p104C10"
      + "4b104D1046114q114u114v114h114A1148114r114z11441545204e204d204y204C204D204s2046214h214r214b214A2148214z214q2145304e304d30"
      + "4C304y304n304s3046314h314b3142314A3148314q314x3149404j404w404t404l404m4043404k414x414B4147414v4149504t504l504w504j504m50"
      + "43504y504d5047514B514k514x514v5145514e514o514f5144554d604w604t604j604m6043604g6041604i6045614e614B614o614k6147614f614v61"
      + "4u61446541704d704g704i704j704t704w704q704A7045714e714u714B714o714f714m7143714p7144754g804d8041804i804D804r804C804o814581"
      + "4e814u814f814p8146814h814g904t904b904r904D904C90489041904m9143914u914h9146914p914i9149a04Da04ra04Ca04ja04wa04la046a14ha1"
      + "4pa14oa14xa14ya14na14za149b04lb04jb04wb04gb04rb04Db042b04kb04nb14xb14zb14yb14ob14hb14Bb14sb14db144b542c04lc04kc049c041c0"
      + "4wc047c04ec045c04nc14xc14zc14Bc14sc14dc14yc14oc14qc144c542d04ld047d04ed045d04kd049d04Ad04vd04nd14sd14zd14Bd14qd14xd14dd1"
      + "4yd14hd144d547e04ve04Ae04ee045e04ke04te048e04be04qe14Be14de14ie14ue14pe14fe14me14re144e54bf04tf048f04Af047f04vf04ef045f0"
      + "4lf04if14uf14pf14ff14mf14rf14qf14nf149f144f54bg04lg04tg04zg04vg04Ag048g04jg049g14mg14ng14ug14rg14xg143g14gh04jh04lh04th0"
      + "4Dh04bh048h043h14xh149h14mh14nh14rh14kh145h14gi04ji04yi04li042i041i04wi046i04Ci04ki14xi143i145i149i147i14ei14di14oi144i5"
      + "42j041j04Cj04wj046j04gj04jj04sj04hj047j14ej14dj14oj14xj14kj143j145j14rj144j542k04sk041k04Ck04wk046k04Ak04hk04ik047k14ek1"
      + "4dk14ok145k14Bk14pk14fk14vk144k542l04il04sl04Cl046l04wl04ll04hl04zl04pl14Bl14fl14vl14dl14el14ol148l14tl144l54im04zm04sm0"
      + "4hm04Dm04bm04qm04um04nm048m14Bm14pm14tm14fm14vm14jm14xm143m144m54qn04zn04un04Dn04bn04nn04in04wn04fn14Bn14jn14tn14xn143n1"
      + "48n14bo04wo04Co04zo04uo04Do04no043o14jo14to14xo14oo14yo14so14eo14mp046p04Dp04np04up04wp04Ap047p04kp04ep14yp14sp14op143p1"
      + "49p14pp14ip14Bp144p54mq04Aq047q04kq04hq04wq04gq04lq04zq049q14yq14pq14iq14sq14Bq14eq14oq14rq144q54gr04Ar04lr04mr047r04zr0"
      + "4kr041r04Dr049r14yr14pr14rr14ir14Br14sr14er14fr144r541s04gs04ls04As04Ds04ms047s04ks04zs04fs149s14rs14ps14Bs142s14qs14vs1"
      + "48s144s541t04gt04nt04lt04Dt04zt04bt04Ct04dt042t14qt14vt148t14rt145t14ut14jt14yt144t541u04du04Cu04bu04Du04wu04su04eu042u1"
      + "45u14yu14vu14qu14ju14uu15104511451a451b451h451l45204521452245284529452a452m4531453245334538453f453k453l453q4542454345444"
      + "5484549454a454g454h454n454o454u45544559455a455b455g455l455m455n455o455p455q455r455s4564456545664567456b456g456h456m456n4"
      + "56o456u45704571457245734577457g457h457t45844585458645874588458i458j458k458u4590459145924593459e459j459o459t45b445b545b64"
      + "5b745b845bi45bj45bk45bl45d445d945da45df45dg45dh45dm45dn45do45dp45dq45dr45ds45e445e945ea45eb45eg45eh45em45en45es45et45f94"
      + "5fa45fb45fc45fd45fo45fp45fq45g045g145ga45gg45gk45gu45h445h545h645h745hc45hi45hn45ho45hp45i145ia45ib45ic45id45io45j045j14"
      + "5j245j345j845j945jk45jl45k045k145k245k345kf45kg45ko45kt45l045l145l245l345le45lj45lk45lu45m845mi45mo45mt45mu45n045n145n24"
      + "5n845n945ne45nq45nr45ns45o945od45om45on45or45p645pb45pc45pd45pn45po45pt45pu45q445q545q645qg45qh45qi45qj45qk45ql45r345rc4"
      + "5rd45ri45ro45rp45ru45s445s945sa45se45sn45ss45st45t045t145t245t345t845ti45tj45tk45tp45tu45ua45ub45uc45ud45uh45uq45ur45us4"
      + "5v245v345v745vc45vh45vi45vj45vn45w845w945wd45wm45wr45ws45wt45x045x145x245xe45xf45xk45xl45xp45xu45y445ye45yf45yg45yh45yn4"
      + "5ys45z345z845z945ze45zf45zp45zu45A445A545A645Ac45Ah45Ai45Aj45At45Au45B845B945Ba45Bf45Bo45Bt45Bu45C445C545C645C745Cb45Cg4"
      + "5Ch45Cm45Cn45D345Dc45Dd45De45Df45Dg45Dq466346731664168346v3168416s3469306s417zt47wt084148g158zt085s08zu08b348b4188448831"
      + "88u18dt18ds18du18eu48Au08jt48ju08su48ut48gu08v048v1481118wt48wu48yt48Bs487s489s48yu484048g0587t08us181018zq48fq08Bt18gq4"
      + "89t185q095q49up49uq0983498419b449b319Bt49jt09Au49lt49hp09lu09ut1ab34ab41a844a831auq4anp4anq0aup0b834b841bb44bb31bnq4bup4"
      + "buq0bnp0cb34cb41c844c831cuq4cnp4cnq0cup0d184d280dg84db80do84dn81d1u4d6u0d3h4dqh1d754d651d954dC50de24dt20e194e290e3g4eqf4"
      + "eqg1e3f1e764e661eb44e834e841eb31ee34el30eg94ej90elu4e1u0en84eg81et24ee14ee20et10eC54e950fe04ft14ft00fe10g164gA60g284g880"
      + "g294g3i4g3h1g3j4gvj1g624g631g721glu0gt04ge21gt20gnq4gup4guq0gnp0gqh4gqi1gd84gh34g234gC70gd71g604g700gw90gCu4g201gm74gm80"
      + "g824g831h174hm64hm70h160h204h601h3f4hqg4hqf1h3g1h3h4hqi4hqh1h3i1ht24h804h810he31hCu0he11he24h220hlu4huq4hnp4hnq0hup0hCt4"
      + "hlt0ht01h634h621i164im74im60i170i221i814i821i210i3g4iqf4iqg1i3f1i3i4i3h1i704i200it04i834ih31iCt0ilt4ilu0it10ie01i624i631"
      + "inq4iup4iuq0inp0iqh4iqi1iCu4ib20ie54ib14i734i851j174jm64jm70j160j3f4jqg4jqf1j3g1j3h4jqi4jqh1j3i1j604j710j720je21j731j844"
      + "j854jb04jt14jt00jb11jb24je14je34je41jCu0jlu4juq4jnp4jnq0jup0jCt4jlt0jb51j801k164km74km60k170k3g4kqf4kqg1k3f1k3i4k3h1k804"
      + "k600k634k621k831kb14kb01kb54kb41ke24ke31ke44ke51kCt0klt4klu0knq4kup4kuq0knp0kqh4kqi1kt04kt11kCu4k734l174lm70l180lm84l3f4"
      + "lqg4lqf1l3g1l6u4lxu0l744l841lt14lt01le00le11le34l204l231llu4lwu0lqi4l3i1luq4l5q0lCt4lwt0lwn4lCn0l824lb21m700m821me21n184"
      + "nm80n170nm74n5q4nuq0nb04n801nt04nx01ntu0nxu4owa1oxa0owb1oxb0owc1oxc0oDb1oBb0ol51oo50ofr0oDs1oDa1ooa0oC71oBk0oBl0oC81ofk0"
      + "ofl0op70op80oC91op90oCa1opa0ol41oB40ooo0oop0oD01oxh0oD11oe10oD21oe20owk1owl1oBc0oBd0oll1olr1oli1ooi0oxg0ojh1oji1oxi0ojj1"
      + "oxj0ol31ols1oqs0og61og71orh0ogs1ogt1ou60ou70o7d1o7e1oBe0ofe0o7f1off0ovt0ovu0ob91obg1o3g0obh1o3h0owp1owq1owj1ooj0ov30oA71"
      + "oAk1o1c1oDt1oqt0oDu1oqu0ote1ore0otf1orf0otg1org0oth1odi0oCo1od70owi1oAs1ovs0o1i1oei0o1j1oej0o1k1oek0o8s0o8t0ogu1ob81ou80"
      + "ou90opk0opl0o3i0ooq0o610oq00o2k1o2l1om81oh80oja1oya0ojb1oyb0ozg1ods0o7t1oke1oyi1op11p731p7i4p851pb51pAh0p824pl21pl54pb24"
      + "px21px54pAd4pq34pqi1prd0prh4",
  };
  // TRACE>>

  // 기록 풀기 — 한 번만. ev = [단계, 사람, 날짜, 근무] 배열(단계 순서). final = 재생 끝의 표(40명).
  const TR = (() => {
    const A = TRACE.alpha, s = TRACE.ev, ev = [];
    for (let k = 0; k < s.length; k += 4) ev.push([A.indexOf(s[k]), A.indexOf(s[k + 1]), A.indexOf(s[k + 2]), TRACE.codes[A.indexOf(s[k + 3])]]);
    const final = Array.from({ length: TRACE.nS }, () => new Array(TRACE.nD).fill(""));
    for (const e of ev) final[e[1]][e[2]] = e[3];
    return { ev, final, weekend: Array.from(TRACE.weekend, c => c === "1"), stages: TRACE.stages,
             grid14: ev.filter(e => e[1] < TRACE.rows) };
  })();
  // 여정·파문·성장하는 해는 D·E·N·쉼 네 글자만 다룬다 — 기록의 근무를 그 넷으로(파트장 8A·prn은 낮, 야간전담은 밤, 수면오프는 쉼)
  const BASIC = { D: "D", E: "E", N: "N", NK: "N", "/": "/", p: "D", "8A": "D", "S/": "/" };
  // 칸에 쓰는 글자 — 근무 코드를 그대로 쓴다. 원본(갤러리 II 비)은 한 글자로 줄여 야간전담 NK가 'K', 8A가 '8',
  // 수면오프 S/가 'S'로 나와 "K라는 근무가 있다, 말이 안 된다"(사용자, 11/3). 두 글자 코드는 칸에 맞게 글씨를 줄인다.
  // 그다음 "글씨가 너무 작다 — NK는 그냥 N으로"(사용자, 11/3): 야간전담은 N(색은 NK색 그대로), 8A·S/만 두 글자.
  const glyph = (v) => (v === "NK" ? "N" : v);

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
  function crescent(x, cx, cy, r, fill) {
    x.save();
    x.beginPath(); x.rect(cx - r - 2, cy - r - 2, r * 2 + 4, r * 2 + 4); x.arc(cx + r * .45, cy - r * .3, r * .85, 0, TAU);
    x.clip("evenodd");
    x.fillStyle = fill; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    x.restore();
  }

  // ------------------------------------------------------------ 여정 — 한 사람이 날짜를 걸어간다
  // 원본: 개념1 여정 장면. 배경을 원본대로 — 하늘색이 지금 걷는 날의 근무를 따른다(낮 하늘색 / 저녁 보라→주황 /
  // 밤 남색과 별 / 쉼 회색), 이웃 날과 섞이며 바뀐다. 굽이치는 언덕, 날짜 이정표(가까울수록 크게), 해·노을·달·구름.
  // 단색 밤하늘 하나였을 때 "배경이 너무 단순해서 안 예쁘다"(사용자, 11/3). 그림이라 라이트 모드에서도 하늘을 칠한다.
  // 카드·설명은 뺐고, 아래 점 줄이 그 사람의 한 달 — 이것이 진행을 따른다.
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
    },
    draw(S) {
      const { x, w, h, P, nD } = S, row = S.L.row;
      // 걷는 사람은 시간으로 걷는다(일정한 빠르기, 초당 2.4일) — 진행(아래 점 줄)보다 8일 넘게 앞서지 않고,
      // 진행이 더 빠르면 진행을 따른다.
      const prog = S.ps * (nD - 1), pd = Math.min(nD - 1, Math.max(prog, Math.min(prog + 8, S.t / 1000 * 2.4)));
      const kind = v => { const b = BASIC[v] || "/"; return b; };
      const SKY = { D: ["#8ec5ff", "#dff0ff"], E: ["#3b2a5a", "#f59e6b"], N: ["#050816", "#1a2050"], "/": ["#5b6b84", "#c7d2e2"] };
      const mixHex = (a, b, t) => { const p = hex3(a), q = hex3(b); return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * t)).join(",")})`; };
      // 하늘 — 지금 날과 다음 날의 하늘을 섞는다
      const d0 = Math.floor(pd), d1 = Math.min(nD - 1, d0 + 1), f = pd - d0, s0 = SKY[kind(row[d0])], s1 = SKY[kind(row[d1])];
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, mixHex(s0[0], s1[0], f)); g.addColorStop(1, mixHex(s0[1], s1[1], f));
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      // 별 — 밤일수록 또렷하게
      const night = (kind(row[d0]) === "N" ? 1 - f : 0) + (kind(row[d1]) === "N" ? f : 0);
      for (let k = 0; k < 46; k++) {
        const a = (.06 + .74 * night) * (.3 + .7 * rnd(k + 9)) * (S.reduce ? 1 : .75 + .25 * Math.sin(S.now / 700 + k));
        x.fillStyle = `rgba(255,255,255,${a})`; x.fillRect(((rnd(k) * w * 2 - pd * 12) % w + w) % w, rnd(k + 1) * h * .5, 1.3, 1.3);
      }
      const sp = 50, cx = w * .4, groundY = h * .7;
      const hill = (sx) => { const d = (sx - cx) / sp + pd; return groundY + Math.sin(d * 1.7) * 4.5 + Math.sin(d * .6) * 7; };
      // 언덕
      x.fillStyle = "rgba(10,14,24,.85)"; x.beginPath(); x.moveTo(0, h);
      for (let sx = 0; sx <= w; sx += 6) x.lineTo(sx, hill(sx));
      x.lineTo(w, h); x.closePath(); x.fill();
      // 날짜마다 하늘의 표지와 이정표
      x.textAlign = "center"; x.textBaseline = "alphabetic";
      for (let d = 0; d < nD; d++) {
        const sx = cx + (d - pd) * sp;
        if (sx < -30 || sx > w + 30) continue;
        const v = row[d], kd = kind(v), near = Math.max(0, 1 - Math.abs(d - pd)), yg = hill(sx), yy = h * .2, reached = d <= pd + .5;
        x.globalAlpha = reached ? 1 : .35;
        if (kd === "D") { glowAt(x, sx, yy, 22, "#fde68a", .55); x.fillStyle = "#fde68a"; x.beginPath(); x.arc(sx, yy, 9, 0, TAU); x.fill(); }
        else if (kd === "E") { glowAt(x, sx, yy + 22, 22, "#fb923c", .5); x.fillStyle = "#fb923c"; x.beginPath(); x.arc(sx, yy + 22, 9, Math.PI, 0); x.fill(); }
        else if (kd === "N") { glowAt(x, sx, yy, 18, "#c7d2fe", .4); x.fillStyle = "#e5e7eb"; x.beginPath(); x.arc(sx, yy, 8, 0, TAU); x.fill();
          x.fillStyle = mixHex(s0[0], s1[0], f); x.beginPath(); x.arc(sx + 3.3, yy - 1.5, 7, 0, TAU); x.fill(); }
        else { x.fillStyle = "rgba(255,255,255,.75)"; for (let q = 0; q < 3; q++) { x.beginPath(); x.arc(sx - 7 + q * 7, yy + 3 - (q % 2) * 4, 6, 0, TAU); x.fill(); } }
        x.globalAlpha = 1;
        // 이정표 — 가까울수록 높고 숫자가 크다
        x.strokeStyle = `rgba(255,255,255,${.25 + .5 * near})`; x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(sx, yg); x.lineTo(sx, yg - 12 - 18 * near); x.stroke();
        x.fillStyle = `rgba(255,255,255,${.5 + .5 * near})`; x.font = `300 ${9 + 6 * near}px system-ui, sans-serif`;
        x.fillText(String(d + 1), sx, yg - 15 - 21 * near);   // 가까운 날 숫자는 걷는 사람 머리 위로
        if (v !== "/" && reached) { x.fillStyle = (S.dark ? PAL.dark : PAL.light).col[kd] || "#cbd5e1"; x.font = `700 ${8 + 2 * near}px ui-monospace, Menlo, monospace`; x.fillText(v === "NK" ? "N" : v, sx, yg + 11); }
      }
      // 걷는 사람
      const gy = hill(cx), moving = !S.reduce && pd < nD - 1 - .01, sw = moving ? Math.sin(S.now / 110) * 4 : 2, bob = moving ? Math.sin(S.now / 220) * .8 : 0;
      x.strokeStyle = "#fff"; x.fillStyle = "#fff"; x.lineWidth = 2; x.lineCap = "round";
      x.beginPath(); x.arc(cx, gy - 24 + bob, 3.6, 0, TAU); x.fill();
      x.beginPath(); x.moveTo(cx, gy - 20); x.lineTo(cx, gy - 9);
      x.moveTo(cx, gy - 9); x.lineTo(cx + sw, gy); x.moveTo(cx, gy - 9); x.lineTo(cx - sw, gy);
      x.moveTo(cx, gy - 17); x.lineTo(cx - sw, gy - 11); x.moveTo(cx, gy - 17); x.lineTo(cx + sw, gy - 11);
      x.stroke(); x.lineCap = "butt";
      // 한 달 점 줄 — 걸어온 날만 색
      const x0 = w * .3, x1 = w - 10, step = (x1 - x0) / nD;
      for (let d = 0; d < nD; d++) {
        const v = row[d], kd = kind(v), on = d <= prog + .5;
        x.fillStyle = on ? (kd === "/" ? "rgba(255,255,255,.35)" : (S.dark ? PAL.dark : PAL.light).col[kd]) : "rgba(255,255,255,.15)";
        x.beginPath(); x.arc(x0 + (d + .5) * step, h - 7, on && kd !== "/" ? 2 : 1.4, 0, TAU); x.fill();
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

  // 방금 바뀐 칸인지 — 0~1(1이면 방금). 직선으로 사라진다.
  function age01(S, key, dur) {
    if (S.reduce) return 1;
    const t0 = S.born.get(key);
    return t0 === undefined ? 1 : Math.min(1, (S.now - t0) / dur);
  }
  function roundRect(x, X, Y, W, H, r) {
    if (x.roundRect) { x.beginPath(); x.roundRect(X, Y, W, H, r); x.fill(); } else x.fillRect(X, Y, W, H);
  }

  // ------------------------------------------------------------ 나선 — 한 달이 계단처럼 감겨 올라간다
  // 원본: 갤러리3 drawHelix 그대로 — 날짜마다 .33라디안씩 돌며 위로(1일이 아래), 사람은 안쪽에서 바깥으로 겹,
  // 근무는 띠 높이(N이 가장 높다)와 색. 아직 안 놓인 칸은 어두운 띠로 길이 먼저 보이고, 칸은 기록 순서로 놓인다 —
  // 그래서 색깔별로 생긴다(파트장 8A → 야간전담 → 야간 N → 주간 D·E → 남은 OFF). 12초에 한 바퀴(원본과 같은 빠르기).
  const HELIX_LIFT = { D: 1, E: 1.6, N: 2.8, NK: 2.8, "/": 0, p: .9, "8A": .6, "S/": .3 };
  const helix = {
    key: "helix", name: "나선",
    init(S) {
      if (S.dark) { const g = S.x.createLinearGradient(0, 0, 0, S.h); g.addColorStop(0, "#090c18"); g.addColorStop(1, "#03040a"); S.L.bg = g; }
    },
    draw(S) {
      const { x, w, h, P, nS, nD } = S;
      paint(S, S.L.bg);
      // 원본 area()의 비율 그대로(기준 크기 U) 같은 투영(F 900, 거리 1300)으로 그리고 배율 k로 160px 상자 높이에 맞춘다 —
      // 원본은 나선이 화면 높이의 40%쯤이라 그대로 줄이면 160px에서 점만 해진다
      const ah = h - 12, cx = w / 2, cy = 3 + ah / 2, rot = S.reduce ? 0 : S.t / 12000 * TAU, F = 900;
      const U = 520, R0 = U * .12, DR = U * .55 / nS, HT = U * .9, k = ah / (U * .95);
      const quads = [];
      for (let d = 0; d < nD; d++) {
        const th = d * .33 + rot, th2 = (d + 1) * .33 + rot - .03, y = HT * (.5 - (d + .5) / nD);
        for (let i = 0; i < nS; i++) {
          const code = S.grid[i][d], r0 = R0 + i * DR, r1 = r0 + DR * .9;
          const lift = code && code !== "/" ? -HELIX_LIFT[code] * 6 : 0;
          const pt = (r, t) => {
            const X = Math.cos(t) * r, Z0 = Math.sin(t) * r, Y0 = y + lift, el = .55;
            const Y = Y0 * Math.cos(el) - Z0 * Math.sin(el), Z = Y0 * Math.sin(el) + Z0 * Math.cos(el) + 1300, sc = F / Z * k;
            return [cx + X * sc, cy + Y * sc, Z];
          };
          const p = [pt(r0, th), pt(r1, th), pt(r1, th2), pt(r0, th2)];
          quads.push({ z: (p[0][2] + p[2][2]) / 2, p, code, key: i * nD + d });
        }
      }
      quads.sort((a, b) => b.z - a.z);
      const edge = S.dark ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.25)";
      for (const q of quads) {
        // 깊이 음영(원본) — 라이트는 밝은 바탕 위라 같은 투명도가 바래 보여 뒤쪽도 60%까지만 옅게
        const d0 = Math.max(.25, 1.4 - q.z / 1500), depth = S.dark ? d0 : .6 + .4 * Math.min(1, d0), a = q.code ? age01(S, q.key, 700) : 1;
        if (q.code) x.fillStyle = rgba(P.col[q.code], (q.code === "/" ? .3 : .95) * depth * a);
        else x.fillStyle = S.dark ? rgba("#0f172a", .35 * depth) : rgba(P.dim, .1 * depth);
        x.beginPath(); x.moveTo(q.p[0][0], q.p[0][1]); for (let n = 1; n < 4; n++) x.lineTo(q.p[n][0], q.p[n][1]); x.closePath(); x.fill();
        x.strokeStyle = edge; x.lineWidth = .5; x.stroke();
      }
    },
  };

  // ------------------------------------------------------------ 야경 — 칸이 창문, 근무가 놓이면 불이 켜진다
  // 원본: 갤러리 drawCity 그대로 — 밤하늘에 반짝이는 별, 사람 × 날짜 격자의 창문, 놓인 칸은 근무색으로 빛나고 막
  // 켜진 창은 하얗게. 쉬는 칸은 흐린 점, 아직 빈 칸은 더 흐린 점(주말은 붉게). 위에 날짜. 켜지는 순서는 원본과 같은
  // 생성 기록 순서다. 예전의 빌딩·달·물가 그림은 걷어냈다(사용자 11/2: "도시처럼 말고 원본처럼 별 넣고").
  // 원본이 밤 그림이라 라이트 모드에서도 밤하늘을 칠한다(캔버스 바탕이 아니라 그림 속 하늘 — 강제 다크에서도 밤이다).
  // 빛 번짐은 원본의 shadowBlur 대신 옅은 큰 사각형 하나로 낸다 — 434칸에 매 프레임 그림자를 주면 폰이 버벅인다.
  const CITY_COL = { D: "#3b82f6", E: "#f97316", N: "#8b5cf6", NK: "#ec4899", p: "#22c55e", "8A": "#94a3b8", "S/": "#14b8a6" };
  const city = {
    key: "city", name: "야경",
    init(S) {
      const { w, h, nS, nD } = S, top = 12, bottom = 15;
      const cs = Math.min((w - 16) / nD, (h - top - bottom) / nS);
      S.L.g = { cs, ox: (w - cs * nD) / 2, oy: top + (h - top - bottom - cs * nS) / 2 };
    },
    draw(S) {
      const { x, w, h, nS, nD } = S, { cs, ox, oy } = S.L.g;
      x.fillStyle = "#04060b"; x.fillRect(0, 0, w, h);
      for (let k = 0; k < 90; k++) {
        const a = S.reduce ? .5 : .25 + .5 * Math.abs(Math.sin(S.now / 900 + k));
        x.fillStyle = `rgba(255,255,255,${a * .5})`; x.fillRect(rnd(k) * w, rnd(k + 1000) * h * .55, 1.2, 1.2);
      }
      for (let i = 0; i < nS; i++) for (let d = 0; d < nD; d++) {
        const code = S.grid[i][d], X = ox + d * cs, Y = oy + i * cs;
        if (!code || code === "/") {
          x.fillStyle = code ? "rgba(120,140,180,.22)" : (TR.weekend[d] ? "rgba(255,120,120,.14)" : "rgba(255,255,255,.07)");
          x.fillRect(X + cs * .38, Y + cs * .38, cs * .24, cs * .24); continue;
        }
        const col = CITY_COL[code], fa = 1 - age01(S, i * nD + d, 900);
        x.fillStyle = rgba(col, .2 + .35 * fa); x.fillRect(X + cs * .02, Y + cs * .02, cs * .96, cs * .96);
        x.fillStyle = fa > 0 ? rgba("#ffffff", .5 + .5 * fa) : col; x.fillRect(X + cs * .22, Y + cs * .22, cs * .56, cs * .56);
        if (fa > 0) { x.fillStyle = rgba(col, 1 - fa); x.fillRect(X + cs * .22, Y + cs * .22, cs * .56, cs * .56); }
      }
      x.font = `${Math.max(7, Math.min(9, cs * .7))}px system-ui, sans-serif`; x.textAlign = "center"; x.textBaseline = "alphabetic";
      for (let d = 0; d < nD; d++) if (d % 2 === 0 || TR.weekend[d]) {
        x.fillStyle = TR.weekend[d] ? "rgba(255,150,150,.8)" : "rgba(255,255,255,.4)";
        x.fillText(String(d + 1), ox + d * cs + cs / 2, oy - 2.5);
      }
    },
  };

  // ------------------------------------------------------------ 만다라 — 한 바퀴가 한 달, 동심원이 사람
  // 원본: 갤러리 drawRadial 그대로 — 1일이 12시 방향, 바깥에 날짜(주말은 붉게)와 주말 부채꼴, 쉬는 칸은 가는 원호.
  // 칸은 생성 기록 순서로 놓이고 막 놓인 칸은 하얗게 빛난다. 돌리지 않는다(사용자 11/1: 날짜가 돌면 어지럽다).
  // 가운데의 연·월은 뺐다 — 기록의 달(2026년 10월)이 지금 만드는 달과 달라 헷갈린다.
  const mandala = {
    key: "mandala", name: "만다라",
    init(S) {
      if (S.dark) { const g = S.x.createRadialGradient(S.w / 2, S.h / 2, 0, S.w / 2, S.h / 2, S.w * .6); g.addColorStop(0, "#0d1226"); g.addColorStop(1, "#04060b"); S.L.bg = g; }
    },
    draw(S) {
      const { x, w, h, P, nS, nD } = S;
      paint(S, S.L.bg);
      const cx = w / 2, cy = h / 2 - 1, R = h / 2 - 13, r0 = R * .22, rw = (R - r0) / nS, a0 = -Math.PI / 2, da = TAU / nD;
      for (let d = 0; d < nD; d++) if (TR.weekend[d]) {
        x.fillStyle = S.dark ? "rgba(255,120,120,.07)" : rgba(P.red, .07);
        x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R + 3, a0 + d * da, a0 + (d + 1) * da); x.closePath(); x.fill();
      }
      for (let i = 0; i < nS; i++) {
        const r = r0 + (i + .5) * rw;
        for (let d = 0; d < nD; d++) {
          const code = S.grid[i][d];
          if (!code) continue;
          // 막 놓인 칸은 0.3초 하얗다 — 원본은 0.9초였는데 이 크기에서는 한꺼번에 수십 칸이 하얘져 색이 안 보였다
          const fa = 1 - age01(S, i * nD + d, 600);
          x.beginPath(); x.arc(cx, cy, r, a0 + d * da + .012, a0 + (d + 1) * da - .012);
          x.lineWidth = rw * (code === "/" ? .35 : .82) * (1 + fa * .3);
          x.strokeStyle = fa > .5 ? P.flash : rgba(P.col[code], code === "/" ? .45 : .95); x.stroke();
        }
      }
      x.strokeStyle = rgba(P.dim, .2); x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, r0 - 3, 0, TAU); x.stroke();
      x.font = "7.5px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
      for (let d = 0; d < nD; d++) {
        const a = a0 + (d + .5) * da;
        x.fillStyle = TR.weekend[d] ? (S.dark ? "rgba(255,150,150,.9)" : P.red) : rgba(P.sub, S.dark ? .75 : 1);
        x.fillText(String(d + 1), cx + Math.cos(a) * (R + 7.5), cy + Math.sin(a) * (R + 7.5));
      }
    },
  };

  // ------------------------------------------------------------ 비 — 근무 글자가 캔버스 위에서 떨어져 제자리에 앉는다
  // 원본: 갤러리 II drawRain(보고서 11장 '비'와 같은 것) — 놓인 칸의 글자는 하얗게 떨어져 앉으면 제 색이 되고,
  // 아직 빈 칸 위로는 초록 글자 비가 내린다. 바꾼 것: 원본은 1.5칸 위에서 잠깐 내려왔는데 사용자가 "원본처럼 위에서
  // 내려오게"(11/2)라 캔버스 위 끝에서부터 일정한 빠르기(FALL px/초)로 떨어진다. 수리 단계에서 칸이 바뀌면 새 글자가
  // 다시 위에서 떨어져 옛 글자를 덮는다. 글자는 생성 기록 순서로 떨어진다. 아래 14px은 이름표 자리.
  const RAIN_COL = { dark: { D: "#BDD7EE", E: "#F8CBAD", N: "#8EA2EC", "/": "rgba(255,255,255,.28)", NK: "#F9A8D4", p: "#86EFAC", "8A": "#E2E8F0", "S/": "#99F6E4" },
                     light: { D: "#3B82F6", E: "#EA580C", N: "#6366F1", "/": "#8A949A", NK: "#D2489A", p: "#2F8F4E", "8A": "#6F8296", "S/": "#0E9488" } };
  const FALL = 260;   // px/초 — 맨 아래 줄까지 0.6초 남짓
  const rain = {
    key: "rain", name: "비",
    init(S) { S.L.g = gridLayout(S, 6, 5, 13); S.L.col = S.dark ? RAIN_COL.dark : RAIN_COL.light; },
    draw(S) {
      const { x, h, nS, nD } = S, { cs, ox, oy } = S.L.g, col = S.L.col;
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
            if (S.grid[i][d]) continue;
            x.fillStyle = `rgba(${drop},${k ? .2 - k * .02 : .55})`;
            x.fillText(chars[Math.floor(rnd(d * 31 + k + Math.floor(S.now / 90)) * 4)], ox + d * cs + cs / 2, yy + cs / 2);
          }
        }
      }
      const f1 = `700 ${Math.max(5, cs * .78)}px ui-monospace, Menlo, monospace`, f2 = `700 ${Math.max(5, cs * .64)}px ui-monospace, Menlo, monospace`;
      const put = (v, X, Y, white) => {
        const g = glyph(v);
        x.fillStyle = white ? land : col[v]; x.globalAlpha = v === "/" || v === "S/" ? .5 : 1;
        if (g.length > 1) x.font = f2;
        x.fillText(g, X, Y); x.globalAlpha = 1;
        if (g.length > 1) x.font = f1;
      };
      for (const [key, t0] of S.born) {
        const i = Math.floor(key / nD), d = key % nD, v = S.grid[i][d], X = ox + d * cs + cs / 2, ty = oy + i * cs + cs / 2;
        const y = S.reduce ? ty : -cs / 2 + (S.now - t0) / 1000 * FALL;
        if (y >= ty) { put(v, X, ty, false); continue; }
        const prev = S.prev.get(key);
        if (prev) put(prev, X, ty, false);
        put(v, X, y, true);
      }
    },
  };

  // ------------------------------------------------------------ 병동의 악보 — 사람이 오선, 같은 근무 연속이 긴 음표
  // 원본: GPT 01-03 그대로 — 한 줄이 한 사람, 같은 근무가 이어지면 둥근 막대 하나(쉼·수면오프는 쉼표 = 빈칸),
  // 막대 왼쪽 끝에 옅은 음표 머리, 주말은 옅은 띠, 마디선 = 7일. 음표는 생성 기록 순서로 적힌다: 파트장 줄이
  // 먼저 한 줄로, 야간 블록이 띄엄띄엄, 주간이 1일부터 날짜 순으로 채워지고, 수리 단계에서 막대가 끊기고 이어진다.
  // 원본의 재생선(단계마다 왼쪽→오른쪽)은 뺐다 — 단계 길이에 따라 빠르기가 달라져 등속이 아니고, 날짜 축 위의
  // 선이 '지금 그 날짜를 쓴다'로 읽혀 기록 순서(야간 먼저 등)와 어긋난다. 대신 막 적힌 칸이 잠깐 밝다.
  const score = {
    key: "score", name: "병동의 악보",
    draw(S) {
      const { x, w, h, nS, nD, P } = S, C = S.dark ? GPT_COL.dark : GPT_COL.light;
      paint(S);
      const x0 = 24, y0 = 7, aw = w - x0 - 8, ah = h - y0 - 17, dx = aw / nD, dy = ah / nS;
      for (let d = 0; d < nD; d++) {
        if (TR.weekend[d]) { x.fillStyle = S.dark ? "rgba(255,230,190,.05)" : "rgba(125,101,64,.07)"; x.fillRect(x0 + d * dx, y0, dx, ah); }
      }
      x.strokeStyle = rgba(P.dim, S.dark ? .22 : .3); x.lineWidth = .5; x.beginPath();
      for (let i = 0; i < nS; i++) { const y = Math.round(y0 + (i + .5) * dy) + .5; x.moveTo(x0, y); x.lineTo(x0 + aw, y); }
      x.stroke();
      x.strokeStyle = rgba(P.dim, .5); x.lineWidth = 1; x.beginPath();
      for (let d = 0; d < nD; d += 7) { const xx = Math.round(x0 + d * dx) + .5; x.moveTo(xx, y0 - 4); x.lineTo(xx, y0 + ah + 4); }
      x.stroke();
      x.font = "8px system-ui, sans-serif"; x.textAlign = "right"; x.textBaseline = "middle"; x.fillStyle = rgba(P.sub, .85);
      for (let i = 0; i < nS; i += 5) x.fillText(String(i + 1).padStart(2, "0"), x0 - 5, y0 + (i + .5) * dy);
      const head = S.dark ? "#FFFFFF" : "#493F40";
      for (let i = 0; i < nS; i++) {
        const y = y0 + (i + .5) * dy, row = S.grid[i];
        for (let a = 0; a < nD;) {
          const v = row[a]; let b = a + 1;
          while (b < nD && row[b] === v) b++;
          if (v && v !== "/" && v !== "S/") {
            const X = x0 + a * dx + 1.5, W = (b - a) * dx - 3;
            x.fillStyle = C[v]; roundRect(x, X, y - dy * .34, W, dy * .68, Math.min(3, dy * .3));
            x.fillStyle = rgba(head, .18); x.beginPath(); x.arc(X + 3, y, dy * .24, 0, TAU); x.fill();
          }
          a = b;
        }
      }
      // 막 적힌 칸 — 직선으로 사라지는 밝은 칸(놓인 칸이든 바뀐 칸이든)
      for (const e of S.log) {
        const f = 1 - age01(S, e[0] * nD + e[1], 600);
        if (f <= 0) continue;
        x.fillStyle = rgba(P.flash, .75 * f); x.fillRect(x0 + e[1] * dx + 1, y0 + e[0] * dy + dy * .12, dx - 2, dy * .76);
      }
    },
  };

  // ------------------------------------------------------------ 한 달의 궤도 — 동심 궤도 위 원호가 근무
  // 원본: GPT 01-04 그대로 — 안쪽부터 사람 하나에 궤도 하나, 12시에서 시계 방향으로 1~31일, 칸 하나가 원호 하나
  // (쉬는 칸은 옅게), 가운데는 채운 비율, 방금 바뀐 칸에 작은 빛 점. 칸은 생성 기록 순서로 놓인다. 원본에서 보이던
  // '다 채운 뒤의 교환' — 수리·균등화 단계에서 이미 놓인 칸의 색이 바뀌는 것 — 이 160px에서도 보이게, 바뀐 칸은
  // 원호가 하얗게 번쩍인 뒤 새 색이 되고 그 자리에 고리가 퍼진다. 오른쪽 아래에 지금 단계와 바뀐 칸 수.
  // 원본의 바늘(단계마다 한 바퀴)은 뺐다 — 악보의 재생선과 같은 이유(단계마다 빠르기가 달라 등속이 아니다).
  const orrery = {
    key: "orrery", name: "한 달의 궤도",
    init(S) {
      if (S.dark) { const g = S.x.createRadialGradient(S.w / 2, S.h / 2, 0, S.w / 2, S.h / 2, S.w * .6); g.addColorStop(0, "#161b33"); g.addColorStop(1, "#0b0e1c"); S.L.bg = g; }
    },
    draw(S) {
      const { x, w, h, nS, nD, P } = S, C = S.dark ? GPT_COL.dark : GPT_COL.light;
      paint(S, S.L.bg);
      const cx = w / 2, cy = h / 2 - 2, R = h / 2 - 15, r0 = R * .24, dr = (R - r0) / nS, a0 = -Math.PI / 2, da = TAU / nD;
      x.strokeStyle = rgba(S.dark ? "#666886" : P.dim, .25); x.lineWidth = .5;
      for (let i = 0; i < nS; i++) { x.beginPath(); x.arc(cx, cy, r0 + (i + .5) * dr, 0, TAU); x.stroke(); }
      let filled = 0;
      for (let i = 0; i < nS; i++) {
        const r = r0 + (i + .5) * dr;
        for (let d = 0; d < nD; d++) {
          const v = S.grid[i][d];
          if (!v) continue;
          filled++;
          const key = i * nD + d, a = age01(S, key, 900), changed = S.prev.has(key);
          x.lineWidth = dr * .68;
          x.strokeStyle = changed && a < .45 ? P.flash : rgba(C[v], (v === "/" ? .35 : .9) * (changed ? 1 : .25 + .75 * a));
          x.beginPath(); x.arc(cx, cy, r, a0 + d * da + .01, a0 + (d + 1) * da - .01); x.stroke();
        }
      }
      x.font = "7.5px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = rgba(P.sub, .9);
      for (let d = 0; d < nD; d += 5) { const a = a0 + (d + .5) * da; x.fillText(String(d + 1).padStart(2, "0"), cx + Math.cos(a) * (R + 8), cy + Math.sin(a) * (R + 8)); }
      // 방금 바뀐 칸 — 원본의 빛 점(최근 18칸). 다 채운 뒤 바뀐 칸에는 퍼지는 고리를 더한다(0.9초, 일정한 빠르기)
      const dot = S.dark ? "#FFF5D7" : P.flash;
      for (const e of S.log.slice(-18)) {
        const r = r0 + (e[0] + .5) * dr, a = a0 + (e[1] + .5) * da, px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        x.fillStyle = dot; x.beginPath(); x.arc(px, py, 1.7, 0, TAU); x.fill();
      }
      for (const e of S.log) {
        if (!e[4]) continue;
        const f = age01(S, e[0] * nD + e[1], 900);
        if (f >= 1) continue;
        const r = r0 + (e[0] + .5) * dr, a = a0 + (e[1] + .5) * da;
        x.strokeStyle = rgba(dot, .9 * (1 - f)); x.lineWidth = 1.2;
        x.beginPath(); x.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2 + 6 * f, 0, TAU); x.stroke();
      }
      x.fillStyle = S.dark ? "#EAE5F3" : P.ink; x.font = "300 15px Georgia, serif";
      x.fillText(String(Math.round(filled / (nS * nD) * 100)), cx, cy - 3);
      x.font = "7px system-ui, sans-serif"; x.fillStyle = P.sub; x.fillText("% 채움", cx, cy + 8);
      if (S.stage >= 0) caption(S, orrery.name, S.changed ? `${TR.stages[S.stage]} · 바뀐 칸 ${S.changed}` : TR.stages[S.stage], TR.stages[S.stage]);
    },
  };

  // ------------------------------------------------------------ 교환의 성좌 — 그 단계에서 바뀐 칸을 잇는 선
  // 원본: GPT 01-07을 거의 그대로(사용자 11/2: "원본이 좋아, 거의 그대로") — 왼쪽 점 = 직원 40명, 오른쪽 점 = 1~31일,
  // 곡선 하나 = 지금 단계에서 바뀐 칸 하나(직원 → 날짜, 색 = 바뀐 뒤 근무). 그 단계에 등장한 직원·날짜는 점이 커지고
  // 밝아지며, 최근 18칸 위로 작은 점이 곡선을 따라 흐른다. 단계가 넘어가면 선이 그 단계의 것으로 바뀐다 — 파트장
  // 단계는 점 하나에서 31일로 부채, 채움 단계는 촘촘한 그물, 수리 단계는 가느다란 선 몇 개. 아래 가운데는 단계 이름과
  // 순변경 수. 160px에 맞게 크기만 줄였다(원본 1000단위 좌표 → 이 상자). 예전 격자 + 맞교환 연출은 걷어냈다.
  // 재생도 원본처럼 단계 단위: 단계마다 원본의 머무는 시간(0.7초 + 바뀐 칸 × 5ms, 최대 2.7초)에 비례해 시간을 주고
  // 그 안에서 선을 일정한 빠르기로 더한다. 원본은 다 보는 데 26초쯤인데 생성은 3~8초라, 전체를 10초(T)로 줄였다 —
  // 채움 단계(파트장~남은 칸 OFF)가 3.7초쯤에 끝나고 그 뒤로 수리 단계가 0.3~0.5초씩 넘어간다.
  const constellation = {
    key: "constellation", name: "교환의 성좌", T: 10,
    init(S) {
      const st = [], ev = TR.ev;
      for (let k = 0; k < ev.length; k++) {
        const s = ev[k][0];
        if (!st.length || st[st.length - 1].s !== s) st.push({ s, from: k, n: 0 });
        st[st.length - 1].n++;
      }
      let t = 0;
      for (const o of st) { o.t0 = t; o.dur = Math.min(2.7, .7 + o.n * .005); t += o.dur; }
      S.L.st = st; S.L.total = t;
      const dk = S.dark;
      S.L.c = { bg: "#201729", fg: dk ? "#F4E6EC" : S.P.ink, muted: dk ? "#C6AABF" : "#93778C", left: dk ? "#F2C6D2" : "#B5577F",
                right: dk ? "#E8DAB3" : "#9A7A18", off: "#93778C", line: dk ? GPT_COL.dark : GPT_COL.light, boost: dk ? 1 : 1.6 };
    },
    draw(S) {
      const { x, w, h } = S, L = S.L, c = L.c, nS = TRACE.nS, nD = TRACE.nD;
      if (S.dark) { x.fillStyle = c.bg; x.fillRect(0, 0, w, h); } else x.clearRect(0, 0, w, h);
      // 지금 단계와 그 안에서 몇 칸까지 — 진행(직선) × 전체 시간
      const tau = S.ps * L.total;
      let k = 0;
      while (k < L.st.length - 1 && tau >= L.st[k].t0 + L.st[k].dur) k++;
      const o = L.st[k], f = S.ps >= 1 ? 1 : Math.max(0, Math.min(1, (tau - o.t0) / o.dur));
      const changes = TR.ev.slice(o.from, o.from + Math.floor(o.n * f + 1e-9));
      const xL = w * .1, xR = w * .9, y0 = 14, ah = h - y0 - 27, yL = (i) => y0 + i * ah / (nS - 1), yR = (d) => y0 + d * ah / (nD - 1);
      const c1 = xL + (xR - xL) * .3125, c2 = xL + (xR - xL) * .6875;   // 원본 350·650(100~900 사이)
      const aL = new Set(changes.map(e => e[1])), aR = new Set(changes.map(e => e[2]));
      x.lineWidth = 1;
      const al = Math.min(1, (changes.length > 100 ? .13 : .43) * c.boost);
      for (const e of changes) {
        const y1 = yL(e[1]), y2 = yR(e[2]);
        x.strokeStyle = rgba(c.line[e[3]], al);
        x.beginPath(); x.moveTo(xL + 4, y1); x.bezierCurveTo(c1, y1, c2, y2, xR - 4, y2); x.stroke();
      }
      const dotAt = (X, Y, on, col) => { x.fillStyle = on ? col : rgba(c.off, .4); x.beginPath(); x.arc(X, Y, on ? 2 : 1, 0, TAU); x.fill(); };
      for (let i = 0; i < nS; i++) dotAt(xL, yL(i), aL.has(i), c.left);
      for (let d = 0; d < nD; d++) dotAt(xR, yR(d), aR.has(d), c.right);
      // 최근 18칸 위를 흐르는 점 — 원본처럼 곡선 매개변수로 일정한 빠르기(5.6초에 한 번)
      const clock = S.reduce ? 0 : S.t / 1000;
      changes.slice(-18).forEach((e, n) => {
        const y1 = yL(e[1]), y2 = yR(e[2]), t = (clock * .18 + n * .071) % 1, u = 1 - t;
        const X = u * u * u * (xL + 4) + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * (xR - 4);
        const Y = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
        x.fillStyle = c.line[e[3]]; x.beginPath(); x.arc(X, Y, 1.6, 0, TAU); x.fill();
      });
      x.font = "8px system-ui, sans-serif"; x.textBaseline = "middle"; x.fillStyle = c.muted;
      x.textAlign = "right"; for (let i = 0; i < nS; i += 10) x.fillText(String(i + 1).padStart(2, "0"), xL - 6, yL(i));
      x.textAlign = "left"; for (let d = 0; d < nD; d += 10) x.fillText(String(d + 1).padStart(2, "0"), xR + 6, yR(d));
      x.textAlign = "center"; x.fillText("직원", xL, 6); x.fillText("날짜", xR, 6);
      x.textBaseline = "alphabetic"; x.fillStyle = c.fg; x.font = "600 10px system-ui, sans-serif";
      x.fillText(`${TR.stages[o.s]} · 순변경 ${changes.length}`, w / 2, h - 4);
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

  // ================================================================ 탐색의 심연 — 차원의 접힘
  // 원본: docs/시각화/gpt_20261023/02_sublime_14/탐색의_심연_14개_풍경.html의 drawManifold(01)·drawFlow(02)·
  // drawTesseract(08)·drawFlower(09)·drawSphere(10)·drawMembrane(14). 수식·색(PALETTES)·선 굵기·투영(proj: 세로축
  // 회전, 기울기 -.3, 원근 4.6)을 그대로 옮기고 160px 상자에 맞게 크기와 선 수만 줄였다 — 다공성 질서를 2D로 줄였을
  // 때 "차원이 너무 줄고 안 예쁘다"(사용자, 11/1)여서 3D 그대로다. 그 위에 근무표와 이어지는 움직임을 한 겹 얹었다
  // (사용자 11/1: "원본 유지하면서 이해되게 애니로"). 얹은 움직임은 3~5초 주기로 시간에 따라 돈다(처음 몇 초 안에 개념이
  // 보이게). 처음엔 여섯(01·02·08·09·10·14)을 모음 페이지 전용으로 넣었다가, 사용자가 둘(08 차원의 접힘·09 질서의
  // 꽃)만 남기고 생성 중 무작위에 넣으라고 했다(2026-11-02) — 나머지 넷의 코드는 걷어냈다(숨긴 코드는 남기지 않는다).
  // 색: 다크는 원본 바탕을 칠한다. 라이트는 바탕을 칠하지 않으므로(머리말) 원본의 밝은 선색 대신 같은 색상의 중간
  // 톤(#EEF2F0·#121212 양쪽에 3:1 이상)을 쓴다. 09·14는 원본이 밝은 종이 바탕이라 라이트에서 원본 색 그대로(14의
  // 구리색만 대비 때문에 조금 어둡게), 다크에서는 어두운 바탕에 같은 색을 밝힌 짝.
  const ABYSS = {
    tess:     { dark: ["#0d0f14", "#879cb9", "#f2ba91"], light: ["", "#56708F", "#C0703F"] },
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
    key: "tesseract", name: "차원의 접힘",
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

  // 열둘 모두 앱 생성 중 무작위 후보다(직전 것 제외). 모음 페이지는 __genVizForce로 하나씩 고정해 그린다.
  const VIZ = [rain, journey, ripple, helix, city, mandala, porous, growth, score, orrery, constellation, tesseract];
  const NAMES = VIZ.map(v => v.name);
  const LAST_KEY = "ns_genviz_last";
  const T_DEFAULT = 5.5;   // 초 — 기록 전체를 다 재생하는 시간(머리말 '등속'). 연출이 T를 가지면 그것을 쓴다.
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

  // opts: { progress: () => 0~1 } — 게이지 비율. 사람 수·날짜는 기록(TRACE)을 따른다(머리말).
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
    const nS = TRACE.rows, nD = TRACE.nD;
    // S.grid = 지금까지 재생한 표(빈 칸은 ""), S.plan = 완성표를 D·E·N·쉼으로(여정·파문·성장하는 해),
    // S.born = 칸마다 마지막으로 쓴 시각, S.prev = 다 놓인 칸이 바뀌었을 때 그 앞 근무, S.log = 최근에 쓴 칸
    // [사람, 날짜, 근무, 시각, 바뀐 칸인지], S.changed = 다 놓인 뒤 바뀐 칸 수, S.stage = 마지막으로 쓴 단계.
    const S = { x, w, h, dark, reduce, P: dark ? PAL.dark : PAL.light, nS, nD,
                grid: Array.from({ length: nS }, () => new Array(nD).fill("")),
                plan: TR.final.slice(0, nS).map(r => r.map(v => BASIC[v])),
                applied: 0, born: new Map(), prev: new Map(), log: [], changed: 0, stage: -1,
                p: 0, ps: 0, now: performance.now(), t: 0, L: {} };
    const viz = choose(), T = (viz.T || T_DEFAULT) * 1000, ev = TR.grid14;
    const me = { S, viz, raf: null, timer: null };
    run = me;
    GenViz.lastError = null;
    try { viz.init && viz.init(S); } catch (e) { fail(e, viz); return viz.name; }
    const t0 = S.now; let prev = S.now;
    const draw = (now) => {
      if (run !== me) return;
      // rAF의 now는 start()에서 읽은 performance.now()보다 이를 수 있다 — 음수 경과시간이면 다공성 질서의
      // 탐색자 위치가 -1이 돼 그리다 멈췄다(ui_smoke가 잡음). 0 아래로 내려가지 않게 한다.
      S.now = now; S.t = Math.max(0, now - t0);
      const dt = Math.max(0, Math.min(200, now - prev)); prev = Math.max(prev, now);
      // 진행 = max(시간/T, 게이지) — 둘 다 직선. 게이지가 앞서면 2/T의 일정한 빠르기로 따라간다(머리말 '등속').
      const target = Math.min(1, Math.max(S.t / T, Math.max(0, Math.min(1, Number(opts.progress()) || 0))));
      S.ps = reduce ? target : Math.max(Math.min(1, S.t / T), Math.min(target, S.ps + dt * 2 / T));
      S.p = S.ps;
      const upto = S.ps >= 1 ? ev.length : Math.floor(ev.length * S.ps);
      while (S.applied < upto) {
        const [stg, i, d, v] = ev[S.applied++], key = i * nD + d, old = S.grid[i][d];
        if (old) { S.prev.set(key, old); S.changed++; }
        S.grid[i][d] = v; S.born.set(key, now); S.stage = stg;
        S.log.push([i, d, v, now, !!old]);
      }
      if (S.log.length > 80) S.log.splice(0, S.log.length - 80);
      try {
        viz.draw(S);
        x.textAlign = "left"; x.textBaseline = "alphabetic"; x.font = "10px system-ui, sans-serif";
        x.fillStyle = viz === city ? "rgba(232,238,246,.5)" : S.P.label; x.fillText(viz.name, 7, h - 4);
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
    NAMES, start, stop, lastError: null,
    current: () => (run ? run.viz.name : null),
    // 점검용 — 진행(ps)·재생한 사건 수(applied/total)·바뀐 칸 수와 연출 내부 상태. 화면은 쓰지 않는다.
    debugState: () => (run ? { ps: run.S.ps, t: run.S.t, applied: run.S.applied, total: TR.grid14.length, changed: run.S.changed, L: run.S.L } : null),
  };
})();
