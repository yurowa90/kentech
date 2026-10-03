/* 섬 전력망 건설(#build) — GRID TYCOON 시안
 * 육각 섬 지도(캔버스 2.5D)에 발전소·배터리·송전선을 짓고, 정책 카드(최대 2장)와 미션 2개를 고른 뒤
 * 1주·1달·3달을 빨리 감아 결과를 본다. 계산은 단순한 가상 모형이다(시간 단위, 시드로 날씨 고정).
 * 저장: localStorage 'kcp-build-v1'(건설·정책·미션·시드)만 쓴다. KCP 게임 상태와 다른 키는 건드리지 않는다.
 * 라우트를 떠나면(route:change) RAF·타이머·리스너를 모두 정리한다.
 */
(function () {
  "use strict";
  const KCP = window.KCP;
  if (!KCP || typeof KCP.route !== "function") return;
  const esc = KCP.esc;
  const html = document.documentElement;
  const KEY = "kcp-build-v1";
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (x, d = 0) => {
    const v = Math.round(x * 10 ** d) / 10 ** d;
    return v.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const hh = h => String(h).padStart(2, "0") + ":00";

  /* =====================================================================
   * 1. 섬 지도(손으로 그린 15×11 육각, 뾰족한 위, 홀수 행이 반 칸 오른쪽)
   * ===================================================================== */
  const COLS = 15, ROWS = 11, SQ3 = Math.sqrt(3);
  const MAP = [
    "~~~~~~~~~~~~~~~",
    "~~~~~bbhpb~~~~~",
    "~~~bppp1mhbb~~~",
    "~~bpfffpmmhfbb~",
    "~bpffphmmhppp3b",
    "~2ppfphmhpfffpb",
    "~bpppfhmhppfpb~",
    "~~bpfphhppppb~~",
    "~~~bppfppppb~~~",
    "~~~~bbp4pbb~~~~",
    "~~~~~~~~~~~~~~~"
  ];
  const TER = { "~": "sea", b: "beach", p: "plain", f: "forest", h: "hill", m: "mount" };
  const TNAME = { sea: "바다", beach: "해안", plain: "평지", forest: "숲", hill: "언덕", mount: "산 능선", town: "마을" };
  const HGT = { sea: 0, beach: 0.14, plain: 0.3, forest: 0.34, hill: 0.72, mount: 1.2, town: 0.3 };
  const TOWNS = [
    { id: "F1", name: "병원", note: "필수시설", c: 7, r: 2, prio: 0, pop: 300, kind: "hospital" },
    { id: "F2", name: "서부 마을", note: "고령층 많음", c: 1, r: 5, prio: 1, pop: 1400, kind: "village" },
    { id: "F3", name: "동부 신도시", note: "", c: 13, r: 4, prio: 2, pop: 4200, kind: "city" },
    { id: "F4", name: "항구 산업", note: "", c: 7, r: 9, prio: 3, pop: 600, kind: "port" }
  ];
  function hash(a, b, k) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(k | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const tix = (c, r) => r * COLS + c;
  const NB_E = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  const NB_O = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
  const TILES = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = MAP[r][c];
    const town = /[1-4]/.test(ch) ? +ch - 1 : -1;
    TILES.push({ i: tix(c, r), c, r, t: town >= 0 ? "town" : TER[ch], town, X: SQ3 * (c + 0.5 * (r & 1)), Y: 1.5 * r });
  }
  TILES.forEach(T => {
    T.nb = [];
    for (const [dc, dr] of (T.r & 1 ? NB_O : NB_E)) {
      const c = T.c + dc, r = T.r + dr;
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) T.nb.push(tix(c, r));
    }
    T.land = T.t !== "sea";
    T.coast = T.land && T.nb.some(j => TILES[j].t === "sea");
  });
  TOWNS.forEach(W => { W.tile = tix(W.c, W.r); });
  const cube = T => { const x = T.c - (T.r - (T.r & 1)) / 2; return [x, -x - T.r, T.r]; };
  function hexDist(a, b) {
    const A = cube(TILES[a]), B = cube(TILES[b]);
    return Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2]));
  }
  // 타일 자료: 평균 풍속(서풍이 우세해 서쪽 해안·능선이 세다), 일사 계수, 주민 밀도
  const WBASE = { beach: 6.4, plain: 5.0, forest: 4.2, hill: 6.3, mount: 8.3, town: 4.8 };
  const SBASE = { beach: 0.96, plain: 0.92, forest: 0.8, hill: 0.9, mount: 0.7, town: 0.9 };
  TILES.forEach(T => {
    if (!T.land) { T.wind = 0; T.sun = 0; T.pop = 0; T.near = 0; return; }
    const w = WBASE[T.t] + Math.max(0, 6 - T.X) * 0.22 + (T.coast && T.t !== "beach" ? 0.5 : 0) + (hash(T.c, T.r, 3) - 0.5) * 0.6;
    T.wind = Math.round(clamp(w, 4, 9) * 10) / 10;
    const nearMount = T.t !== "mount" && T.nb.some(j => TILES[j].t === "mount");
    const s = SBASE[T.t] + (hash(T.c, T.r, 5) - 0.5) * 0.06 - (nearMount ? 0.06 : 0) + (T.r - 5) * 0.006;
    T.sun = Math.round(clamp(s, 0.6, 1) * 100) / 100;
    T.pop = TOWNS.reduce((a, W) => a + W.pop * Math.exp(-hexDist(T.i, W.tile) / 1.2), 0);
    T.near = TOWNS.reduce((a, W) => a + (hexDist(T.i, W.tile) <= 2 ? W.pop : 0), 0);
  });

  /* =====================================================================
   * 2. 가상 모형
   * ===================================================================== */
  const M = {
    budget: 100,
    solarMW: 2, windMW: 2, rated: 12, cutout: 25,
    dieselMW: 3, dieselMin: 1, batMW: 4, batMWh: 16, batEff: 0.95, socFloor: 0.1,
    lossPerHex: 0.015, co2: 0.75, fuel: 0.01, taxMul: 1.5,
    drMW: 1.5, drCost: 0.05, shareCost: 0.1, save: 0.05,
    wxSun: [1, 0.45, 0.2]
  };
  const BLD = {
    solar: { name: "태양광", spec: "2 MW", cost: 8, ok: { beach: 1, plain: 1, hill: 1, forest: 1 } },
    wind: { name: "풍력", spec: "2 MW", cost: 10, ok: { beach: 1, plain: 1, hill: 1, forest: 1, mount: 1 } },
    diesel: { name: "디젤", spec: "3 MW", cost: 6, ok: { beach: 1, plain: 1, hill: 1, forest: 1 } },
    battery: { name: "배터리", spec: "4 MW/16 MWh", cost: 12, ok: { beach: 1, plain: 1, hill: 1, forest: 1 } }
  };
  const LINE_COST = 0.5, CLEAR_COST = 2;
  const WX = [{ k: "sun", name: "맑음" }, { k: "cloud", name: "흐림" }, { k: "rain", name: "비" }];
  const TR = [[0.62, 0.28, 0.10], [0.35, 0.42, 0.23], [0.30, 0.42, 0.28]];
  const POLICIES = [
    { id: "tax", name: "탄소세", icon: "co2", eff: "디젤 연료비 ×1.5", cost: "0억/일" },
    { id: "dr", name: "수요반응 계약", icon: "clock", eff: "F4 −1.5 MW (18–21시)", cost: "0.05억/일" },
    { id: "share", name: "주민 이익공유", icon: "people", eff: "풍력·태양광 민원 ½", cost: "0.1억/일" },
    { id: "save", name: "절전 캠페인", icon: "bolt", eff: "수요 −5% · 만족 −5", cost: "0억/일" }
  ];
  const costTarget = days => Math.round(50 + 0.5 * days);
  const MISSIONS = [
    { id: "outage", name: "정전 최소", icon: "bolt", goal: () => "못 보낸 전력 ≤ 0.5% · 병원 0시간" },
    { id: "cost", name: "비용 최소", icon: "coin", goal: () => "총비용 ≤ 50억 + 0.5억×일수" },
    { id: "co2", name: "CO₂ 최소", icon: "co2", goal: () => "하루 평균 ≤ 45 t" },
    { id: "complaint", name: "주민 민원 최소", icon: "alert", goal: () => "민원 ≤ 1건 · 최저 만족 ≥ 60" }
  ];
  const TIPS = [
    "송전 손실은 거리에 비례해 쌓인다 — 발전소를 수요지 가까이?",
    "풍속이 2배면 풍력 출력은 약 8배(v³).",
    "태양광은 저녁 피크 전에 끝난다 — 배터리가 시간을 옮긴다.",
    "디젤 연기는 바람을 따라 동쪽으로 간다.",
    "전력량(MWh) = 전력(MW) × 시간(h).",
    "한 전원에만 기대면 그 조건이 무너질 때 다 멈춘다.",
    "평균에 강한 계획 ≠ 최악의 날에 강한 계획.",
    "결론 먼저, 근거는 두세 개.",
    "얻는 것과 잃는 것을 한 문장에 함께.",
    "배터리는 전기를 만들지 않는다 — 남는 전기를 옮길 뿐.",
    "충전·방전마다 조금씩 잃는다(여기서는 각 95%).",
    "흐린 날 태양광은 맑은 날의 절반도 안 된다.",
    "버린 전력도 비용이다 — 건설비는 이미 냈다.",
    "능선과 서쪽 해안은 바람이 세다 — 풍속 지도를 켜 보라.",
    "짧게 보면 연료가 싸고, 길게 보면 연료 없는 발전이 싸질 수 있다.",
    "전기가 모자라면 병원은 마지막까지 받는다 — 우선순위가 있다."
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 90일치를 항상 같은 순서로 뽑는다. 그래서 1주는 1달의 앞부분과 같다.
  function weather(seed) {
    const rnd = mulberry32(seed >>> 0), out = [];
    let w = 0;
    for (let d = 0; d < 90; d++) {
      const u = rnd();
      if (d > 0) { const p = TR[w]; w = u < p[0] ? 0 : u < p[0] + p[1] ? 1 : 2; }
      let mult = 0.5 + rnd();
      if (w === 2) mult = Math.min(1.5, mult + 0.15);
      const hot = rnd() < (w === 0 ? 0.5 : w === 1 ? 0.15 : 0);
      const noise = [];
      for (let h = 0; h < 24; h++) noise.push(1 + (rnd() * 2 - 1) * 0.15);
      out.push({ w, mult, hot, noise });
    }
    return out;
  }
  function demand(ti, h, hot, pol) {
    let v;
    if (ti === 0) v = 1.0;
    else if (ti === 1) v = 1.2 + (h >= 18 && h < 22 ? 0.8 : 0);
    else if (ti === 2) v = 1.5 + (h >= 7 && h < 9 ? 0.5 : 0) + (h >= 18 && h < 22 ? 1.0 : 0);
    else {
      v = h >= 8 && h < 21 ? 2.0 : 0.8;
      if (pol.dr && h >= 18 && h < 21) v -= M.drMW;
    }
    if (hot && h >= 13 && h < 18) v *= 1.15;
    if (pol.save) v *= 1 - M.save;
    return v;
  }
  const peakDemand = pol => { let p = 0; for (let h = 0; h < 24; h++) p = Math.max(p, TOWNS.reduce((a, W, ti) => a + demand(ti, h, false, pol), 0)); return p; };
  const polOf = st => ({ tax: st.policies.includes("tax"), dr: st.policies.includes("dr"), share: st.policies.includes("share"), save: st.policies.includes("save") });

  const stepMul = T => (T.t === "sea" ? 3 : T.t === "mount" ? 2 : 1);
  const buildCost = (t, i) => BLD[t].cost + (TILES[i].t === "forest" ? CLEAR_COST : 0);
  function lineCost(p) { let s = 0; for (let k = 1; k < p.length; k++) s += LINE_COST * stepMul(TILES[p[k]]); return s; }
  const capex = st => st.builds.reduce((a, b) => a + buildCost(b.t, b.i), 0) + st.lines.reduce((a, L) => a + lineCost(L.p), 0);

  // 가장 싼 육각 경로(육지 1, 산 2, 바다 3배)
  function routePath(a, b) {
    const N = TILES.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    dist[a] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === b) break;
      done[u] = 1;
      for (const v of TILES[u].nb) {
        const nd = dist[u] + stepMul(TILES[v]);
        if (nd < dist[v] - 1e-9) { dist[v] = nd; prev[v] = u; }
      }
    }
    if (!isFinite(dist[b])) return null;
    const p = [b];
    while (p[0] !== a) p.unshift(prev[p[0]]);
    return p;
  }

  // 송전망: 선이 지나는 타일이 연결 그래프, 건물·마을은 선 위에 있거나 선 끝과 이웃하면 붙는다.
  function network(st) {
    const adj = new Map(), edges = [], eKey = new Map(), ends = new Set();
    const link = (a, b) => {
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a).add(b); adj.get(b).add(a);
      const k = a < b ? a + "-" + b : b + "-" + a;
      if (!eKey.has(k)) { eKey.set(k, edges.length); edges.push([Math.min(a, b), Math.max(a, b)]); }
    };
    st.lines.forEach(L => { for (let k = 1; k < L.p.length; k++) link(L.p[k - 1], L.p[k]); ends.add(L.p[0]); ends.add(L.p[L.p.length - 1]); });
    // 선 타일 덩어리 번호
    const lab = new Map();
    let nc = 0;
    adj.forEach((_, s) => {
      if (lab.has(s)) return;
      const q = [s]; lab.set(s, nc);
      while (q.length) { const u = q.pop(); adj.get(u).forEach(v => { if (!lab.has(v)) { lab.set(v, nc); q.push(v); } }); }
      nc++;
    });
    const par = Array.from({ length: nc }, (_, i) => i);
    const find = x => (par[x] === x ? x : (par[x] = find(par[x])));
    const nodes = [];
    TOWNS.forEach((W, ti) => nodes.push({ kind: "town", tile: W.tile, ti, prio: W.prio }));
    st.builds.forEach((B, bi) => nodes.push({ kind: B.t, tile: B.i, bi }));
    nodes.forEach(n => {
      n.att = [];
      if (adj.has(n.tile)) n.att.push([n.tile, 0]);
      TILES[n.tile].nb.forEach(j => { if (ends.has(j)) n.att.push([j, 1]); });
      const cs = n.att.map(a => lab.get(a[0]));
      for (let k = 1; k < cs.length; k++) { const A = find(cs[0]), B = find(cs[k]); if (A !== B) par[A] = B; }
    });
    const comps = new Map();
    nodes.forEach(n => {
      n.comp = n.att.length ? find(lab.get(n.att[0][0])) : -1;
      if (n.comp < 0) return;
      if (!comps.has(n.comp)) comps.set(n.comp, { towns: [], ren: [], bat: [], dsl: [] });
      const C = comps.get(n.comp);
      if (n.kind === "town") C.towns.push(n);
      else if (n.kind === "battery") C.bat.push(n);
      else if (n.kind === "diesel") C.dsl.push(n);
      else C.ren.push(n);
    });
    // 노드마다 선 위 거리(0-1 시작점이 섞인 다익스트라)
    function bfs(n) {
      const dist = new Map(), from = new Map(), q = [];
      n.att.forEach(([t, d]) => { if (!dist.has(t) || dist.get(t) > d) { dist.set(t, d); from.set(t, -1); q.push(t); } });
      while (q.length) {
        q.sort((x, y) => dist.get(y) - dist.get(x));
        const u = q.pop(), du = dist.get(u);
        adj.get(u).forEach(v => { if (!dist.has(v) || dist.get(v) > du + 1) { dist.set(v, du + 1); from.set(v, u); q.push(v); } });
      }
      return { dist, from };
    }
    nodes.forEach(n => { if (n.att.length) n.bf = bfs(n); });
    function pair(g, l) {
      let best = Infinity, bt = -1;
      l.att.forEach(([t, dl]) => { const dg = g.bf.dist.get(t); if (dg !== undefined && dg + dl < best) { best = dg + dl; bt = t; } });
      if (bt < 0) return null;
      const path = [];
      let u = bt;
      while (g.bf.from.get(u) !== -1) {
        const p = g.bf.from.get(u);
        path.push([eKey.get(p < u ? p + "-" + u : u + "-" + p), p < u ? 1 : -1]);
        u = p;
      }
      const d = best;
      return { g, l, d, eff: Math.max(0.4, 1 - M.lossPerHex * d), path };
    }
    const byPrio = (a, b) => (a.l.prio - b.l.prio) || (a.d - b.d);
    comps.forEach(C => {
      const mk = (gs, ls) => { const out = []; gs.forEach(g => ls.forEach(l => { const P = pair(g, l); if (P) out.push(P); })); return out; };
      C.RL = mk(C.ren, C.towns).sort(byPrio);
      C.RB = mk(C.ren, C.bat).sort((a, b) => a.d - b.d);
      C.BL = mk(C.bat, C.towns).sort(byPrio);
      C.DL = mk(C.dsl, C.towns).sort(byPrio);
    });
    // 쓸모 있는 연결: 같은 덩어리에 마을과 발전원이 함께 있어야 한다.
    nodes.forEach(n => {
      const C = n.comp >= 0 ? comps.get(n.comp) : null;
      n.live = !!C && (n.kind === "town" ? C.ren.length + C.bat.length + C.dsl.length > 0 : C.towns.length > 0);
    });
    return { adj, edges, nodes, comps: Array.from(comps.values()), ends };
  }

  function complaints(st, runFrac) {
    const share = st.policies.includes("share"), items = [];
    TOWNS.forEach((W, ti) => {
      const TT = TILES[W.tile];
      st.builds.forEach((B, bi) => {
        const d = hexDist(B.i, W.tile), BT = TILES[B.i];
        if (B.t === "diesel") {
          const f = runFrac ? runFrac[bi] || 0 : 0.6;
          if (d <= 2 && TT.X - BT.X >= -0.01) items.push({ ti, kind: "smoke", bi, pts: (d <= 1 ? 30 : 18) * f });
          else if (d <= 1) items.push({ ti, kind: "noise", bi, pts: 6 * f });
        } else if (B.t === "wind") {
          if (d <= 1) items.push({ ti, kind: "noise", bi, pts: share ? 7 : 14 });
          else if (d === 2) items.push({ ti, kind: "view", bi, pts: share ? 2.5 : 5 });
        } else if (B.t === "solar" && d <= 1) items.push({ ti, kind: "view", bi, pts: share ? 2 : 4 });
        if (BT.t === "forest" && d <= 3) items.push({ ti, kind: "green", bi, pts: 3 });
      });
    });
    // 민원 건수: 마을×종류별 합이 5점 이상이면 1건
    const groups = new Map();
    items.forEach(it => {
      const k = it.ti + ":" + it.kind, G = groups.get(k) || { pts: 0, top: null };
      G.pts += it.pts;
      if (!G.top || it.pts > G.top.pts) G.top = it;
      groups.set(k, G);
    });
    let issues = 0;
    const list = [];
    groups.forEach((G, k) => { if (G.pts >= 5) { issues++; const [ti, kind] = k.split(":"); list.push({ ti: +ti, kind, pts: G.pts, src: st.builds[G.top.bi].t }); } });
    list.sort((a, b) => b.pts - a.pts);
    return { items, issues, list };
  }

  function simulate(st, days) {
    const N = network(st), W = weather(st.seed), H = days * 24, pol = polOf(st);
    const gens = N.nodes.filter(n => n.kind !== "town");
    const E = N.edges.length;
    const flow = new Float32Array(Math.max(1, H * E));
    const hrDem = new Float32Array(H), hrSup = new Float32Array(H), hrUns = new Float32Array(H * 4), hrWind = new Float32Array(H), hrDiesel = new Uint32Array(H);
    const town = TOWNS.map(() => ({ dem: 0, uns: 0, outH: 0, eveH: 0, cloudH: 0, dayOut: new Float32Array(days) }));
    const tot = { diesel: 0, waste: 0, curt: 0, loss: 0, ren: 0, renAvail: 0, idle: 0, batOut: 0, dem: 0, sup: 0 };
    let dk = 0;
    gens.forEach(g => {
      g.runH = 0;
      if (g.kind === "battery") { g.soc = M.batMWh * 0.5; g.floor = M.batMWh * M.socFloor; }
      if (g.kind === "diesel") g.dk = dk++;
    });
    const addFlow = (P, sent, k) => { const o = k * E; for (const [e, s] of P.path) flow[o + e] += s * sent; };
    for (let d = 0; d < days; d++) {
      const wx = W[d];
      for (let h = 0; h < 24; h++) {
        const k = d * 24 + h, vMul = wx.mult * wx.noise[h];
        hrWind[k] = vMul;
        const sunP = h >= 6 && h < 18 ? Math.max(0, Math.sin(Math.PI * (h + 0.5 - 6) / 12)) : 0;
        gens.forEach(g => {
          g.av = 0;
          if (g.kind === "solar") g.av = M.solarMW * sunP * M.wxSun[wx.w] * TILES[g.tile].sun;
          else if (g.kind === "wind") { const v = TILES[g.tile].wind * vMul; g.av = v > M.cutout ? 0 : M.windMW * Math.min(1, (v / M.rated) ** 3); }
          else if (g.kind === "diesel") g.out = 0;
          else if (g.kind === "battery") { g.chg = 0; g.dis = 0; }
          if (g.kind === "solar" || g.kind === "wind") { if (g.live) tot.renAvail += g.av; else tot.idle += g.av; }
        });
        const rem = TOWNS.map((_, ti) => demand(ti, h, wx.hot, pol));
        const dem0 = rem.reduce((a, b) => a + b, 0);
        let deliv = 0;
        for (const C of N.comps) {
          if (!C.towns.length) continue;
          for (const P of C.RL) {
            const g = P.g, ti = P.l.ti;
            if (g.av <= 1e-6 || rem[ti] <= 1e-6) continue;
            const give = Math.min(g.av * P.eff, rem[ti]), sent = give / P.eff;
            g.av -= sent; rem[ti] -= give; deliv += give; tot.loss += sent - give; tot.ren += sent; addFlow(P, sent, k);
          }
          for (const P of C.RB) {
            const g = P.g, b = P.l;
            if (g.av <= 1e-6) continue;
            const room = Math.min(M.batMW - b.chg, (M.batMWh - b.soc) / M.batEff);
            if (room <= 1e-6) continue;
            const give = Math.min(g.av * P.eff, room), sent = give / P.eff;
            g.av -= sent; b.chg += give; b.soc += give * M.batEff; tot.loss += sent - give; tot.ren += sent; addFlow(P, sent, k);
          }
          C.ren.forEach(g => { tot.curt += Math.max(0, g.av); });
          for (const P of C.BL) {
            const b = P.g, ti = P.l.ti;
            if (rem[ti] <= 1e-6 || b.chg > 0) continue;
            const can = Math.min(M.batMW - b.dis, (b.soc - b.floor) * M.batEff);
            if (can <= 1e-6) continue;
            const give = Math.min(can * P.eff, rem[ti]), sent = give / P.eff;
            b.dis += sent; b.soc -= sent / M.batEff; rem[ti] -= give; deliv += give; tot.loss += sent - give; tot.batOut += sent; addFlow(P, sent, k);
          }
          for (const P of C.DL) {
            const u = P.g, ti = P.l.ti;
            if (rem[ti] <= 1e-6) continue;
            const can = M.dieselMW - u.out;
            if (can <= 1e-6) continue;
            const give = Math.min(can * P.eff, rem[ti]), sent = give / P.eff;
            u.out += sent; rem[ti] -= give; deliv += give; tot.loss += sent - give; addFlow(P, sent, k);
          }
          C.dsl.forEach(u => {
            if (u.out <= 1e-6) return;
            if (u.out < M.dieselMin) { tot.waste += M.dieselMin - u.out; u.out = M.dieselMin; }
            tot.diesel += u.out; u.runH++;
            if (u.dk < 32) hrDiesel[k] |= 1 << u.dk;
          });
        }
        rem.forEach((r, ti) => {
          const D = town[ti], dm = demand(ti, h, wx.hot, pol);
          D.dem += dm;
          hrUns[k * 4 + ti] = Math.max(0, r);
          if (r > 0.05) {
            D.uns += r; D.outH++; D.dayOut[d]++;
            if (h >= 17 && h < 23) D.eveH++;
            if (wx.w > 0) D.cloudH++;
          } else if (r > 0) D.uns += r;
        });
        hrDem[k] = dem0; hrSup[k] = deliv; tot.dem += dem0; tot.sup += deliv;
      }
    }
    const runFrac = st.builds.map((B, bi) => { const g = gens.find(n => n.bi === bi); return g && B.t === "diesel" ? g.runH / H : 0; });
    const cp = complaints(st, runFrac);
    const fuelMul = pol.tax ? M.taxMul : 1;
    const cost = {
      capex: capex(st),
      fuel: tot.diesel * M.fuel * fuelMul,
      policy: days * ((pol.dr ? M.drCost : 0) + (pol.share ? M.shareCost : 0))
    };
    cost.total = cost.capex + cost.fuel + cost.policy;
    const sat = TOWNS.map((W, ti) => {
      const D = town[ti];
      const outPen = Math.min(80, (D.outH / H) * 300 * (ti === 0 ? 2 : ti === 1 ? 1.3 : 1));
      const cpPen = cp.items.filter(it => it.ti === ti).reduce((a, it) => a + it.pts, 0);
      return Math.round(clamp(100 - outPen - cpPen - (pol.save ? 5 : 0), 0, 100));
    });
    const res = {
      days, H, E, edges: N.edges, flow, hrDem, hrSup, hrUns, hrWind, hrDiesel, wx: W.slice(0, days),
      town, tot, cost, co2: tot.diesel * M.co2, cp, sat, pol, seed: st.seed,
      unsTotal: town.reduce((a, D) => a + D.uns, 0), outTotal: town.reduce((a, D) => a + D.outH, 0)
    };
    res.missions = judge(st, res);
    res.news = headlines(st, res, N);
    res.questions = questions(st, res, N);
    return res;
  }

  function judge(st, R) {
    const target = costTarget(R.days);
    const all = {
      outage: { ok: R.unsTotal <= 0.005 * R.tot.dem && R.town[0].outH === 0, val: `못 보낸 전력 ${fmt(100 * R.unsTotal / Math.max(1, R.tot.dem), 1)}% · 병원 ${R.town[0].outH}시간` },
      cost: { ok: R.cost.total <= target, val: `총비용 ${fmt(R.cost.total, 1)}억 / 목표 ${target}억` },
      co2: { ok: R.co2 / R.days <= 45, val: `하루 ${fmt(R.co2 / R.days, 1)} t / 목표 45 t` },
      complaint: { ok: R.cp.issues <= 1 && Math.min(...R.sat) >= 60, val: `민원 ${R.cp.issues}건 · 최저 만족 ${Math.min(...R.sat)}` }
    };
    return MISSIONS.map(m => ({ id: m.id, name: m.name, icon: m.icon, chosen: st.missions.includes(m.id), ...all[m.id] }));
  }

  function headlines(st, R, N) {
    const out = [];
    const add = (score, text) => out.push({ score, text });
    const worst = R.town.map((D, ti) => ({ ti, ...D })).sort((a, b) => b.outH - a.outH)[0];
    if (R.town[0].outH > 0) add(100, `병원 ${R.town[0].outH}시간 정전… "비상발전기 또 돌렸다"`);
    if (worst.outH > 0) {
      const W = TOWNS[worst.ti];
      // 흐린 날이 사흘 이상 이어지며 정전이 난 구간
      let streak = 0, bestStreak = 0, hit = false, bestHit = false;
      R.wx.forEach((w, d) => {
        if (w.w > 0) { streak++; hit = hit || worst.dayOut[d] > 0; } else { streak = 0; hit = false; }
        if (streak >= 3 && hit && streak > bestStreak) { bestStreak = streak; bestHit = true; }
      });
      const eve = worst.eveH / worst.outH > 0.6;
      if (bestHit) add(80 + worst.outH / 10, `흐린 ${bestStreak === 3 ? "사흘" : bestStreak + "일"}간 ${W.name}${eve ? " 저녁" : ""} 정전`);
      else if (eve) add(70 + worst.outH / 10, `${W.name}, 해 지면 불 꺼져… 저녁 정전 ${worst.outH}시간`);
      else add(65 + worst.outH / 10, `${W.name} 정전 ${worst.outH}시간… "전기가 안 온다"`);
    }
    R.cp.list.forEach(c => {
      const W = TOWNS[c.ti];
      if (c.kind === "smoke") add(60 + c.pts, `${W.name}, 디젤 매연 민원 이어져`);
      else if (c.kind === "noise") add(50 + c.pts, c.src === "wind" ? `${W.name} "풍차 소리에 잠 못 자"… 소음 민원` : `${W.name} "디젤 엔진 소리 밤새 울려"`);
      else if (c.kind === "view") add(30 + c.pts, `${W.name} "창밖이 발전소"… 경관 민원`);
      else if (c.kind === "green") add(28 + c.pts, `${W.name} 뒷숲 깎여… 녹지 훼손 논란`);
    });
    if (R.tot.renAvail > 1 && R.tot.curt / R.tot.renAvail > 0.12) add(55, `남는 전기 ${fmt(R.tot.curt)} MWh 버려져… "담아 둘 곳이 없다"`);
    if (R.co2 / R.days > 30) add(R.pol.tax ? 58 : 62, R.pol.tax ? `탄소세에 연료비 껑충… 디젤 ${fmt(R.cost.fuel, 1)}억` : `섬 하늘에 CO₂ ${fmt(R.co2)} t… 탄소세 도입 논의`);
    const lossShare = R.tot.loss / Math.max(1, R.tot.sup + R.tot.loss);
    if (lossShare > 0.06) add(45, `먼 송전선에서 전기 ${fmt(100 * lossShare, 1)}% 새어 나가`);
    if (R.outTotal === 0 && R.tot.dem > 0) add(75, `${R.days}일 무정전 운영… "불 한 번 안 꺼졌다"`);
    if (R.co2 / R.days <= 5 && R.outTotal < R.H * 0.02) add(52, `디젤 거의 안 쓰고 섬을 밝혔다`);
    const idleG = N.nodes.filter(n => n.kind !== "town" && !n.live).length;
    if (idleG) add(57, `선 없는 발전소 ${idleG}곳… "지어 놓고 못 쓴다"`);
    if (!out.length) add(1, `${R.days}일 운영 끝… 섬 전력망 첫 성적표`);
    return out.sort((a, b) => b.score - a.score).slice(0, 3).map(o => o.text);
  }

  const HINT_STYLE = ["기준 먼저", "자료 숫자", "얻고 잃는 것"];
  function questions(st, R, N) {
    const qs = [];
    const add = (score, q, hints) => qs.push({ score, q, hints });
    const worst = R.town.map((D, ti) => ({ ti, ...D })).sort((a, b) => b.outH - a.outH)[0];
    if (worst.outH > 0) {
      const W = TOWNS[worst.ti];
      add(90, `${W.name}이 ${worst.outH}시간 정전됐습니다. 다시 짓는다면 무엇을 먼저 바꾸겠습니까?`,
        [`정전이 주로 언제였나(저녁 ${worst.eveH}시간)`, `못 보낸 전력 ${fmt(worst.uns, 1)} MWh`, "고치면 늘어나는 비용·민원은?"]);
    }
    const nearTown = R.cp.list.find(c => c.kind === "noise" || c.kind === "smoke");
    if (nearTown) {
      const W = TOWNS[nearTown.ti], what = nearTown.src === "wind" ? "풍력 발전기를" : "디젤 발전기를";
      add(80, `${what} ${W.name} 가까이 지었습니다. 주민이 반대하면 어떻게 하겠습니까?`,
        ["누구의 불편을 먼저 볼지 정하기", `${W.name} 만족도 ${R.sat[nearTown.ti]}점`, "옮기면 송전 손실·비용은?"]);
    }
    if (R.co2 / R.days > 30 && !R.pol.tax) add(75, `CO₂가 ${fmt(R.co2)} t 나왔는데 탄소세를 고르지 않았습니다. 왜였나요?`,
      ["섬 안 부담 vs 지구 부담", `하루 ${fmt(R.co2 / R.days, 1)} t`, "탄소세를 걸면 누가 더 내나?"]);
    const spent = capex(st);
    if (spent >= M.budget - 6) add(70, `예산 ${fmt(spent, 1)}억을 거의 다 썼습니다. 같은 돈으로 더 나은 조합이 있었을까요?`,
      ["무엇을 가장 중요하게 봤나", `연료비 ${fmt(R.cost.fuel, 1)}억 · 건설비 ${fmt(R.cost.capex, 1)}억`, "기간이 길어지면 답이 바뀌나?"]);
    if (R.tot.renAvail > 1 && R.tot.curt / R.tot.renAvail > 0.12) add(65, `남아서 버린 전력이 ${fmt(R.tot.curt)} MWh입니다. 어떻게 쓸 수 있었을까요?`,
      ["언제 남고 언제 모자랐나", `버린 전력 ${fmt(R.tot.curt)} MWh`, "배터리 1대 12억의 값어치는?"]);
    const lost = R.missions.filter(m => m.chosen && !m.ok);
    if (lost.length) add(60, `'${lost[0].name}' 미션을 놓쳤습니다. 무엇과 바꾼 결과입니까?`,
      ["두 미션 중 무엇을 먼저 봤나", lost[0].val, "다른 미션에서 얻은 것"]);
    add(40, `가장 힘들었던 날은 언제였고, 그날을 버티려면 무엇이 필요합니까?`,
      ["평균 말고 최악의 날로 보기", `흐림·비 ${R.wx.filter(w => w.w > 0).length}일 / ${R.days}일`, "대비하는 데 드는 돈"]);
    add(35, `이 섬에 전원을 하나만 더 짓는다면 무엇을 어디에 짓겠습니까?`,
      ["판단 기준 한 줄", "그 타일의 일사·풍속 숫자", "그 선택의 대가"]);
    return qs.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  /* ---------- 저장 ---------- */
  function blank() { return { v: 1, seed: 2026, builds: [], lines: [], policies: [], missions: [] }; }
  function sanitize(o) {
    const st = blank();
    if (!o || typeof o !== "object") return st;
    if (Number.isInteger(o.seed) && o.seed > 0) st.seed = o.seed >>> 0;
    const used = new Set();
    (Array.isArray(o.builds) ? o.builds : []).forEach(b => {
      if (!b || !Object.hasOwn(BLD, b.t) || !Number.isInteger(b.i) || !TILES[b.i]) return;
      const T = TILES[b.i];
      if (used.has(b.i) || !BLD[b.t].ok[T.t]) return;
      used.add(b.i);
      st.builds.push({ t: b.t, i: b.i });
    });
    (Array.isArray(o.lines) ? o.lines : []).forEach(L => {
      const p = L && Array.isArray(L.p) ? L.p : null;
      if (!p || p.length < 2 || p.length > 80) return;
      for (let k = 0; k < p.length; k++) {
        if (!Number.isInteger(p[k]) || !TILES[p[k]]) return;
        if (k && !TILES[p[k - 1]].nb.includes(p[k])) return;
      }
      st.lines.push({ p: p.slice() });
    });
    st.policies = (Array.isArray(o.policies) ? o.policies : []).filter((id, k, a) => POLICIES.some(P => P.id === id) && a.indexOf(id) === k).slice(0, 2);
    st.missions = (Array.isArray(o.missions) ? o.missions : []).filter((id, k, a) => MISSIONS.some(P => P.id === id) && a.indexOf(id) === k).slice(0, 2);
    while (capex(st) > M.budget + 1e-9 && (st.lines.length || st.builds.length)) { if (st.lines.length) st.lines.pop(); else st.builds.pop(); }
    return st;
  }
  function loadState() {
    try { const raw = window.localStorage.getItem(KEY); return raw ? sanitize(JSON.parse(raw)) : blank(); } catch (e) { return blank(); }
  }
  function saveState(st) { try { window.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 저장 없이도 동작한다 */ } }

  KCP.buildGame = { simulate, sanitize, network, complaints, weather, demand, routePath, capex, TILES, TOWNS, M, BLD, MAP, TIPS };

  /* =====================================================================
   * 3. 아이콘
   * ===================================================================== */
  const IC = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    wind: '<path d="M12 11v10M9 21h6"/><circle cx="12" cy="9" r="1.5"/><path d="M12 7.5V2.5M13.3 9.8l4.4 2.4M10.7 9.8l-4.4 2.4"/>',
    diesel: '<path d="M3 21V12l5 3v-3l5 3V8h2.5V3h3v18z"/><path d="M2 21h20"/>',
    battery: '<rect x="2.5" y="7" width="17" height="11" rx="2"/><path d="M21.5 11v3M12 9l-2.5 4h3.2L10.3 17"/>',
    line: '<path d="M8 21l4-17 4 17M5.5 8h13M7.2 13h9.6M9 18.5l6-5.5M15 18.5l-6-5.5"/>',
    remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    coin: '<circle cx="12" cy="12" r="8.5"/><path d="M8 9l1.8 6 2.2-5 2.2 5L16 9M7.5 12h9"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    bolt: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
    co2: '<path d="M7 18.5h10a4 4 0 0 0 .6-8 6 6 0 0 0-11.4 1.6A3.4 3.4 0 0 0 7 18.5z"/>',
    alert: '<path d="M4 10v4h3l6 4V6L7 10z"/><path d="M16.5 9.5a3.6 3.6 0 0 1 0 5M19 7a7.2 7.2 0 0 1 0 10"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15.6 14.2A4.5 4.5 0 0 1 21 18.6"/>',
    map: '<path d="M3 6l6-2.5 6 2.5 6-2.5v14.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 3.5v14.5M15 6v14.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.8M12 17.2h.01"/>',
    cards: '<rect x="4" y="6.5" width="12" height="14.5" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v12"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .6-8 6 6 0 0 0-11.4 1.6A3.4 3.4 0 0 0 7 18z"/>',
    rain: '<path d="M7 14.5h10a3.6 3.6 0 0 0 .6-7.2 5.4 5.4 0 0 0-10.3 1.4A3 3 0 0 0 7 14.5z"/><path d="M8 17.5l-1 3M12 17.5l-1 3M16 17.5l-1 3"/>',
    news: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 12.5h6M7 15.5h4"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    reroll: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    skip: '<path d="M5 5v14l8-7zM13 5v14l8-7z" fill="currentColor"/>',
    hammer: '<path d="M14 6l4 4M3 21l9-9M11 7l3-3 6 6-3 3z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>'
  };
  const ico = (k, cls = "v2-ico") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${IC[k] || ""}</svg>`;
  const TOOLS = [
    { id: "solar", icon: "sun", name: "태양광", cost: "8억" },
    { id: "wind", icon: "wind", name: "풍력", cost: "10억" },
    { id: "diesel", icon: "diesel", name: "디젤", cost: "6억" },
    { id: "battery", icon: "battery", name: "배터리", cost: "12억" },
    { id: "line", icon: "line", name: "송전선", cost: "0.5억/칸" },
    { id: "remove", icon: "remove", name: "철거", cost: "환불" }
  ];
  const LAYERS = [
    { id: "map", icon: "map", name: "지도" },
    { id: "sun", icon: "sun", name: "일사" },
    { id: "wind", icon: "wind", name: "풍속" },
    { id: "pop", icon: "people", name: "주민" }
  ];

  /* =====================================================================
   * 4. 화면 상태
   * ===================================================================== */
  let S = null; // 라우트가 살아 있는 동안의 화면 상태
  const reduced = () => (KCP.v2 && KCP.v2.reduced ? KCP.v2.reduced() : !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches));
  const dprOf = () => Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const $ = sel => (S ? S.root.querySelector(sel) : null);

  /* ---------- 투영(2.5D) ---------- */
  const SQ = 0.62, HZ = 0.42, BASE = -0.3;
  const V = { S: 20, ox: 0, oy: 0, rot: 0, zoom: 1, panX: 0, panY: 0, area: { l: 0, t: 0, r: 100, b: 100 }, W: 100, H: 100, bw: 1, bh: 1 };
  // 세계 좌표(X 동쪽, Y 남쪽) → 화면 평면(u 오른쪽, v 아래). 세로 화면에서는 90° 돌려 서쪽이 위로 간다.
  const uv = (X, Y) => (V.rot ? [-Y, X] : [X, Y]);
  function scr(X, Y, h) { const [u, v] = uv(X, Y); return [V.ox + u * V.S, V.oy + v * SQ * V.S - h * HZ * V.S]; }
  const tileTop = (T, extra = 0) => scr(T.X, T.Y, HGT[T.t] + extra);
  const corner = k => { const a = (60 * k - 90) * Math.PI / 180; return [Math.cos(a), Math.sin(a)]; };
  const CORN = [0, 1, 2, 3, 4, 5].map(corner);
  function topPoly(T, h = HGT[T.t], shrink = 0.985) { return CORN.map(([cx, cy]) => scr(T.X + cx * shrink, T.Y + cy * shrink, h)); }
  let ORDER = [];
  function computeOrder() {
    ORDER = TILES.slice().sort((a, b) => { const A = uv(a.X, a.Y), B = uv(b.X, b.Y); return (A[1] - B[1]) || (A[0] - B[0]); });
  }
  function fitView() {
    const a = V.area;
    const aw = Math.max(50, a.r - a.l), ah = Math.max(50, a.b - a.t);
    V.rot = ah > aw * 1.15 ? 1 : 0;
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    TILES.forEach(T => { if (!T.land) return; const [u, v] = uv(T.X, T.Y); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
    const pad = 1.25;
    V.bw = u1 - u0 + 2 * pad;
    V.bh = (v1 - v0 + 2 * pad) * SQ + 1.3 * HZ + 0.5;
    const s = Math.min(aw / V.bw, ah / V.bh);
    V.S = Math.max(6, s * V.zoom);
    const mx = Math.max(0, (V.bw * V.S - aw) / 2 + 20), my = Math.max(0, (V.bh * V.S - ah) / 2 + 20);
    V.panX = clamp(V.panX, -mx, mx); V.panY = clamp(V.panY, -my, my);
    V.ox = (a.l + a.r) / 2 - ((u0 + u1) / 2) * V.S + V.panX;
    V.oy = (a.t + a.b) / 2 - (((v0 + v1) / 2) * SQ - 0.35) * V.S + V.panY;
    if (V.lastRot !== V.rot) { V.lastRot = V.rot; computeOrder(); }
  }

  /* ---------- 색 ---------- */
  const hex2 = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgb = (c, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`);
  const mul = (c, f) => [clamp(c[0] * f, 0, 255), clamp(c[1] * f, 0, 255), clamp(c[2] * f, 0, 255)];
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const PAL = {
    beach: hex2("#e6d39e"), plain: hex2("#84c060"), forest: hex2("#5b9c4b"), hill: hex2("#a8bd6c"), mount: hex2("#9b9a8f"), town: hex2("#a3c886"),
    earth: hex2("#8b6a45"), sand: hex2("#c7ab74"), rock: hex2("#77756c")
  };
  function ramp(stops, t) {
    t = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    return mix(stops[i], stops[i + 1], t - i);
  }
  const RAMPS = {
    sun: ["#33415f", "#7d6a4a", "#e0a63a", "#ffe08a"].map(hex2),
    wind: ["#27395c", "#2f6f8f", "#4fc0d6", "#d9fbff"].map(hex2),
    pop: ["#2b3a4e", "#6b4a6b", "#d9706a", "#ffc49a"].map(hex2)
  };
  const layerVal = (T, L) => (L === "sun" ? (T.sun - 0.6) / 0.4 : L === "wind" ? (T.wind - 4) / 5 : Math.sqrt(T.pop / 4200));
  const layerTxt = (T, L) => (L === "sun" ? T.sun.toFixed(2).replace(/^0/, "") : L === "wind" ? T.wind.toFixed(1) : T.t === "town" ? fmt(TOWNS[T.town].pop / 1000, 1) + "k" : T.pop >= 50 ? fmt(T.pop / 1000, 1) + "k" : "");

  /* =====================================================================
   * 5. 그리기
   * ===================================================================== */
  function polyPath(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.closePath(); }
  function fillPoly(g, pts, col) { polyPath(g, pts); g.fillStyle = col; g.fill(); }
  function shadow(g, x, y, rx, ry, a = 0.2) { g.beginPath(); g.ellipse(x + rx * 0.25, y + ry * 0.3, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = `rgba(10,24,30,${a})`; g.fill(); }
  // 화면 정렬 상자(정면 + 오른쪽 옆면 + 지붕)
  function box(g, x, y, w, d, h, top, front, side) {
    const dx = d * 0.55, dy = d * 0.42;
    fillPoly(g, [[x + w / 2, y], [x + w / 2 + dx, y - dy], [x + w / 2 + dx, y - dy - h], [x + w / 2, y - h]], side);
    g.fillStyle = front; g.fillRect(x - w / 2, y - h, w, h);
    fillPoly(g, [[x - w / 2, y - h], [x + w / 2, y - h], [x + w / 2 + dx, y - dy - h], [x - w / 2 + dx, y - dy - h]], top);
  }
  function pine(g, x, y, s, shade = 1) {
    shadow(g, x, y, s * 0.42, s * 0.16, 0.18);
    g.fillStyle = "#5a4630"; g.fillRect(x - s * 0.05, y - s * 0.25, s * 0.1, s * 0.25);
    const L = rgb(mul([70, 140, 72], shade)), R = rgb(mul([44, 102, 58], shade));
    for (let k = 0; k < 2; k++) {
      const by = y - s * (0.2 + k * 0.38), hw = s * (0.42 - k * 0.1), ty = by - s * 0.62;
      fillPoly(g, [[x - hw, by], [x, ty], [x, by]], L);
      fillPoly(g, [[x, ty], [x + hw, by], [x, by]], R);
    }
  }
  function roundTree(g, x, y, s) {
    shadow(g, x, y, s * 0.4, s * 0.15, 0.18);
    g.fillStyle = "#5a4630"; g.fillRect(x - s * 0.05, y - s * 0.3, s * 0.1, s * 0.3);
    g.beginPath(); g.arc(x, y - s * 0.5, s * 0.32, 0, Math.PI * 2); g.fillStyle = "#4f9a4a"; g.fill();
    g.beginPath(); g.arc(x - s * 0.1, y - s * 0.58, s * 0.16, 0, Math.PI * 2); g.fillStyle = "#73b764"; g.fill();
  }
  function peak(g, x, y, w, h, snow) {
    fillPoly(g, [[x - w, y], [x - w * 0.08, y - h], [x + w * 0.12, y]], "#b9b7ab");
    fillPoly(g, [[x - w * 0.08, y - h], [x + w, y], [x + w * 0.12, y]], "#73716a");
    if (snow) {
      fillPoly(g, [[x - w * 0.08, y - h], [x - w * 0.32, y - h * 0.66], [x - w * 0.14, y - h * 0.72], [x + w * 0.02, y - h * 0.62], [x + w * 0.2, y - h * 0.7]], "#f3f6f8");
    }
  }
  function house(g, x, y, s, roof) {
    const w = s * 0.42, h = s * 0.26, d = s * 0.3;
    shadow(g, x, y, w * 0.8, s * 0.12, 0.2);
    box(g, x, y, w, d, h, "#d9cdb8", "#f1e8d8", "#c4b69e");
    const dx = d * 0.55, dy = d * 0.42;
    fillPoly(g, [[x - w / 2 - 1, y - h], [x, y - h - s * 0.2], [x + w / 2 + 1, y - h]], rgb(mul(roof, 1.08)));
    fillPoly(g, [[x, y - h - s * 0.2], [x + w / 2 + 1, y - h], [x + w / 2 + dx + 1, y - h - dy], [x + dx, y - h - dy - s * 0.2]], rgb(mul(roof, 0.82)));
    return [x - w * 0.22, y - h * 0.72, w * 0.18, h * 0.32];
  }

  // 마을: 정적 그림 + 밤 창문 자리 기록
  function drawTown(g, T, rec) {
    const W = TOWNS[T.town], [x, y] = tileTop(T), s = V.S;
    const wins = [];
    const at = (dx, dy) => scr(T.X + dx, T.Y + dy, HGT.town);
    if (W.kind === "hospital") {
      const [px, py] = at(-0.45, 0.25);
      g.beginPath(); g.ellipse(px, py, s * 0.24, s * 0.24 * SQ, 0, 0, Math.PI * 2); g.fillStyle = "#4b5966"; g.fill();
      g.fillStyle = "#f4f6f8"; g.font = `700 ${Math.max(7, s * 0.24)}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("H", px, py + 0.5);
      const [bx, by] = at(0.18, 0.1);
      shadow(g, bx, by, s * 0.5, s * 0.16, 0.22);
      box(g, bx, by, s * 0.72, s * 0.4, s * 0.42, "#e9eef3", "#fbfdff", "#c9d3dc");
      box(g, bx - s * 0.05, by - s * 0.42, s * 0.36, s * 0.3, s * 0.2, "#e9eef3", "#f7fafc", "#c9d3dc");
      g.fillStyle = "#e0485a";
      const cx = bx - s * 0.05, cy = by - s * 0.52, a = s * 0.07;
      g.fillRect(cx - a * 1.5, cy - a / 2, a * 3, a); g.fillRect(cx - a / 2, cy - a * 1.5, a, a * 3);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) wins.push([bx - s * 0.3 + c * s * 0.17, by - s * 0.34 + r * s * 0.15, s * 0.09, s * 0.08]);
    } else if (W.kind === "village") {
      const spots = [[-0.42, -0.3, "#c8553d"], [0.32, -0.38, "#d7843d"], [-0.05, 0.05, "#b5483a"], [0.45, 0.25, "#d7843d"], [-0.45, 0.38, "#c8553d"]];
      spots.sort((p, q) => uv(p[0], p[1])[1] - uv(q[0], q[1])[1]).forEach(([dx, dy, rc], k) => {
        const [hx, hy] = at(dx, dy);
        const w = house(g, hx, hy, s * 0.95, hex2(rc));
        wins.push(w, [w[0] + s * 0.17, w[1], w[2], w[3]]);
        if (k === 1) roundTree(g, hx + s * 0.32, hy + s * 0.08, s * 0.5);
      });
    } else if (W.kind === "city") {
      const towers = [[-0.35, -0.25, 1.2], [0.3, -0.35, 1.55], [0.42, 0.28, 0.95], [-0.25, 0.32, 0.8], [0.0, 0.0, 1.9]];
      towers.sort((p, q) => uv(p[0], p[1])[1] - uv(q[0], q[1])[1]).forEach(([dx, dy, hgt]) => {
        const [tx, ty] = at(dx, dy), w = s * 0.32, h = s * 0.62 * hgt;
        shadow(g, tx, ty, w * 0.9, s * 0.13, 0.22);
        box(g, tx, ty, w, s * 0.26, h, "#d5dee8", "#b9c9d8", "#8ea2b6");
        g.fillStyle = "rgba(60,96,130,0.55)";
        const rows = Math.max(2, Math.floor(h / (s * 0.14)));
        for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) {
          const wx = tx - w * 0.32 + c * w * 0.38, wy = ty - h + s * 0.06 + r * (h - s * 0.1) / rows;
          g.fillRect(wx, wy, w * 0.24, s * 0.06);
          wins.push([wx, wy, w * 0.24, s * 0.06]);
        }
      });
    } else {
      // 항구: 부두, 창고, 크레인, 컨테이너
      const [qx, qy] = at(0.15, 0.62);
      g.fillStyle = "#7a5b3c"; g.fillRect(qx - s * 0.5, qy - s * 0.06, s * 1.0, s * 0.12);
      const [wx0, wy0] = at(-0.32, -0.2);
      shadow(g, wx0, wy0, s * 0.45, s * 0.15, 0.22);
      box(g, wx0, wy0, s * 0.62, s * 0.36, s * 0.3, "#9fb3c4", "#c4d3df", "#8397a9");
      for (let c = 0; c < 3; c++) wins.push([wx0 - s * 0.24 + c * s * 0.18, wy0 - s * 0.2, s * 0.1, s * 0.07]);
      const cols = ["#d0533f", "#3f7fd0", "#e3b23c", "#3fae84"];
      for (let k = 0; k < 4; k++) { const [cx, cy] = at(0.15 + (k % 2) * 0.3, 0.05 + Math.floor(k / 2) * 0.24); box(g, cx, cy, s * 0.26, s * 0.14, s * 0.12, rgb(mul(hex2(cols[k]), 1.15)), cols[k], rgb(mul(hex2(cols[k]), 0.75))); }
      const [kx, ky] = at(0.55, -0.25);
      g.strokeStyle = "#e5b33a"; g.lineWidth = Math.max(1.5, s * 0.05); g.lineCap = "round";
      g.beginPath(); g.moveTo(kx, ky); g.lineTo(kx, ky - s * 0.9); g.lineTo(kx - s * 0.55, ky - s * 0.8); g.moveTo(kx, ky - s * 0.9); g.lineTo(kx + s * 0.2, ky - s * 0.82); g.stroke();
      g.lineWidth = 1; g.strokeStyle = "#3a3f46"; g.beginPath(); g.moveTo(kx - s * 0.45, ky - s * 0.81); g.lineTo(kx - s * 0.45, ky - s * 0.5); g.stroke();
    }
    if (rec) rec.wins.push({ ti: T.town, list: wins, x, y });
  }

  // 플레이어 건물(정적 부분). rec가 있으면 움직이는 부분의 위치를 기록한다.
  function drawBuilding(g, type, T, rec, bi) {
    const [x, y] = tileTop(T), s = V.S;
    if (type === "solar") {
      shadow(g, x, y + s * 0.05, s * 0.62, s * 0.2, 0.2);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
        const px = x - s * 0.42 + c * s * 0.46 + r * s * 0.06, py = y - s * 0.12 + r * s * 0.26 - c * s * 0.02;
        const w = s * 0.4, hgt = s * 0.2, sk = s * 0.08;
        g.fillStyle = "#59636d"; g.fillRect(px + w * 0.45, py - 1, 1.5, s * 0.1);
        fillPoly(g, [[px, py], [px + w, py], [px + w + sk, py - hgt], [px + sk, py - hgt]], "#d6e1ea");
        fillPoly(g, [[px + 1.2, py - 1], [px + w - 1.2, py - 1], [px + w + sk - 1.5, py - hgt + 1.2], [px + sk + 1.5, py - hgt + 1.2]], "#284b8c");
        g.strokeStyle = "rgba(160,200,255,0.45)"; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(px + w * 0.5, py - 1); g.lineTo(px + w * 0.5 + sk, py - hgt + 1); g.moveTo(px + sk * 0.5 + 1, py - hgt / 2); g.lineTo(px + w + sk * 0.5 - 1, py - hgt / 2); g.stroke();
        fillPoly(g, [[px + w * 0.55, py - 1], [px + w * 0.75, py - 1], [px + w * 0.82 + sk, py - hgt + 1.2], [px + w * 0.66 + sk, py - hgt + 1.2]], "rgba(255,255,255,0.14)");
      }
    } else if (type === "wind") {
      const H = s * 1.45;
      shadow(g, x, y, s * 0.2, s * 0.08, 0.25);
      g.strokeStyle = "rgba(10,24,30,0.18)"; g.lineWidth = Math.max(1, s * 0.05);
      g.beginPath(); g.moveTo(x + s * 0.05, y + s * 0.02); g.lineTo(x + s * 0.75, y + s * 0.28); g.stroke();
      fillPoly(g, [[x - s * 0.055, y], [x + s * 0.055, y], [x + s * 0.025, y - H], [x - s * 0.025, y - H]], "#eef3f7");
      fillPoly(g, [[x + s * 0.005, y], [x + s * 0.055, y], [x + s * 0.025, y - H], [x + s * 0.005, y - H]], "#bcc7d1");
      g.fillStyle = "#dfe6ec"; g.fillRect(x - s * 0.1, y - H - s * 0.06, s * 0.2, s * 0.09);
      if (rec) rec.hubs.push({ x, y: y - H - s * 0.02, len: s * 0.72, tile: T.i, bi });
    } else if (type === "diesel") {
      shadow(g, x, y, s * 0.5, s * 0.17, 0.24);
      box(g, x - s * 0.04, y + s * 0.04, s * 0.62, s * 0.38, s * 0.34, "#a9b2bb", "#8d96a0", "#6b737c");
      g.fillStyle = "#5c646d";
      for (let k = 0; k < 3; k++) g.fillRect(x - s * 0.28 + k * s * 0.2, y - s * 0.2, s * 0.12, s * 0.12);
      const cx = x + s * 0.22, cy = y - s * 0.22;
      g.fillStyle = "#e8ecef"; g.fillRect(cx - s * 0.05, cy - s * 0.62, s * 0.1, s * 0.62);
      g.fillStyle = "#c9473b"; g.fillRect(cx - s * 0.05, cy - s * 0.62, s * 0.1, s * 0.1); g.fillRect(cx - s * 0.05, cy - s * 0.4, s * 0.1, s * 0.08);
      if (rec) rec.stacks.push({ x: cx, y: cy - s * 0.64, bi, tile: T.i });
    } else if (type === "battery") {
      shadow(g, x, y, s * 0.52, s * 0.18, 0.22);
      for (let k = 1; k >= 0; k--) {
        const bx = x - s * 0.05 + k * s * 0.1, by = y - s * 0.02 + k * -s * 0.16 + s * 0.16;
        box(g, bx, by, s * 0.66, s * 0.22, s * 0.26, "#62cbbd", "#2ea395", "#21796f");
        g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 0.8;
        for (let r = 1; r < 4; r++) { g.beginPath(); g.moveTo(bx - s * 0.33 + r * s * 0.165, by - s * 0.26); g.lineTo(bx - s * 0.33 + r * s * 0.165, by); g.stroke(); }
      }
      g.fillStyle = "#ffe07a";
      const bx = x - s * 0.05, by = y + s * 0.02;
      fillPoly(g, [[bx + s * 0.03, by - s * 0.24], [bx - s * 0.07, by - s * 0.1], [bx, by - s * 0.1], [bx - s * 0.04, by - s * 0.01], [bx + s * 0.07, by - s * 0.15], [bx, by - s * 0.15]], "#ffe07a");
    }
  }
  function pylonTop(T) { const [x, y] = tileTop(T); return [x, y - V.S * 0.55]; }
  function drawPylon(g, T) {
    const [x, y] = tileTop(T), s = V.S, h = s * 0.55;
    if (T.t === "sea") { g.beginPath(); g.ellipse(x, y, s * 0.16, s * 0.07, 0, 0, Math.PI * 2); g.fillStyle = "#6c7680"; g.fill(); }
    g.strokeStyle = "#39434e"; g.lineWidth = Math.max(1, s * 0.04);
    g.beginPath();
    g.moveTo(x - s * 0.09, y); g.lineTo(x, y - h); g.lineTo(x + s * 0.09, y);
    g.moveTo(x - s * 0.17, y - h * 0.82); g.lineTo(x + s * 0.17, y - h * 0.82);
    g.moveTo(x - s * 0.06, y - h * 0.4); g.lineTo(x + s * 0.06, y - h * 0.4);
    g.stroke();
  }
  function wirePath(g, A, B, sag) {
    g.moveTo(A[0], A[1]);
    g.quadraticCurveTo((A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + sag, B[0], B[1]);
  }

  function drawTile(g, T, layer) {
    const h = HGT[T.t];
    const top = topPoly(T, h), bot = topPoly(T, BASE);
    const [cu, cv] = uv(T.X, T.Y);
    if (T.t === "sea") {
      const shallow = T.nb.some(j => TILES[j].land);
      polyPath(g, topPoly(T, 0, 1.0));
      g.fillStyle = shallow ? "rgba(140,225,235,0.32)" : "rgba(255,255,255,0.025)";
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.06)"; g.lineWidth = 1; g.stroke();
      return;
    }
    let base = PAL[T.t];
    if (layer !== "map") base = ramp(RAMPS[layer], layerVal(T, layer));
    const jit = layer === "map" ? 1 + (hash(T.c, T.r, 9) - 0.5) * 0.07 : 1;
    const sideC = T.t === "beach" ? PAL.sand : T.t === "mount" ? PAL.rock : PAL.earth;
    // 보이는 옆면(화면 아래쪽을 향하는 변)
    for (let k = 0; k < 6; k++) {
      const j = (k + 1) % 6;
      const mu = (uv(T.X + (CORN[k][0] + CORN[j][0]) / 2, T.Y + (CORN[k][1] + CORN[j][1]) / 2));
      const nv = mu[1] - cv, nu = mu[0] - cu;
      if (nv < 0.05) continue;
      const f = nu > 0.2 ? 0.66 : nu < -0.2 ? 0.86 : 0.76;
      fillPoly(g, [top[k], top[j], bot[j], bot[k]], rgb(mul(sideC, f)));
      // 물가 거품 띠
      g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(bot[k][0], bot[k][1] - V.S * 0.12); g.lineTo(bot[j][0], bot[j][1] - V.S * 0.12); g.stroke();
    }
    polyPath(g, top);
    g.fillStyle = rgb(mul(base, jit)); g.fill();
    g.strokeStyle = layer === "map" ? "rgba(20,40,30,0.18)" : "rgba(10,20,40,0.35)"; g.lineWidth = 1; g.stroke();
    // 위쪽 변 하이라이트
    g.strokeStyle = "rgba(255,255,255,0.16)";
    g.beginPath(); g.moveTo(top[5][0], top[5][1]); g.lineTo(top[0][0], top[0][1]); g.lineTo(top[1][0], top[1][1]); g.stroke();
  }
  function drawDeco(g, T, layer) {
    if (!T.land) return;
    const s = V.S, at = (dx, dy, e = 0) => scr(T.X + dx, T.Y + dy, HGT[T.t] + e);
    const soft = layer !== "map";
    if (soft) g.globalAlpha = 0.55;
    if (T.t === "forest") {
      [[-0.38, -0.28], [0.34, -0.3], [0.0, 0.05], [-0.4, 0.38], [0.38, 0.36]].sort((p, q) => uv(p[0], p[1])[1] - uv(q[0], q[1])[1]).forEach(([dx, dy], k) => {
        const [x, y] = at(dx + (hash(T.c, T.r, k) - 0.5) * 0.15, dy);
        pine(g, x, y, s * (0.5 + hash(T.c, T.r, k + 20) * 0.18), 0.92 + hash(T.r, T.c, k) * 0.16);
      });
    } else if (T.t === "mount") {
      const [x2, y2] = at(0.3, -0.25); peak(g, x2, y2, s * 0.42, s * 0.65, false);
      const [x, y] = at(-0.08, 0.1); peak(g, x, y, s * 0.62, s * 1.0, true);
    } else if (T.t === "hill") {
      [[-0.3, -0.1, 0.42], [0.3, 0.2, 0.34]].forEach(([dx, dy, r]) => {
        const [x, y] = at(dx, dy);
        g.beginPath(); g.ellipse(x, y, s * r, s * r * 0.55, 0, Math.PI, 0); g.fillStyle = soft ? "rgba(255,255,255,0.12)" : "#b9cd7d"; g.fill();
        g.beginPath(); g.ellipse(x + s * r * 0.35, y, s * r * 0.6, s * r * 0.4, 0, Math.PI * 1.1, 0); g.fillStyle = soft ? "rgba(0,0,0,0.08)" : "#93a95c"; g.fill();
      });
      if (!soft && hash(T.c, T.r, 4) > 0.5) { const [x, y] = at(0.35, -0.35); roundTree(g, x, y, s * 0.45); }
    } else if (T.t === "plain" && !soft) {
      if (hash(T.c, T.r, 6) > 0.55) {
        // 밭 줄무늬
        const p = [[-0.5, -0.1], [0.2, -0.45], [0.55, 0.0], [-0.15, 0.35]].map(([dx, dy]) => at(dx, dy));
        polyPath(g, p); g.fillStyle = hash(T.c, T.r, 8) > 0.5 ? "rgba(214,196,96,0.55)" : "rgba(120,170,70,0.6)"; g.fill();
        g.strokeStyle = "rgba(80,110,40,0.35)"; g.lineWidth = 1;
        for (let k = 1; k < 4; k++) { const a = mixP(p[0], p[3], k / 4), b = mixP(p[1], p[2], k / 4); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      } else if (hash(T.c, T.r, 7) > 0.4) { const [x, y] = at(0.3, 0.2); roundTree(g, x, y, s * 0.45); }
    } else if (T.t === "beach" && !soft && hash(T.c, T.r, 2) > 0.62) {
      const [x, y] = at(0.2, 0);
      g.strokeStyle = "#8a6a44"; g.lineWidth = Math.max(1, s * 0.05);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + s * 0.12, y - s * 0.3, x + s * 0.05, y - s * 0.55); g.stroke();
      g.fillStyle = "#4f9a4a";
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.7; g.beginPath(); g.ellipse(x + s * 0.05 + Math.cos(a) * s * 0.16, y - s * 0.55 + Math.sin(a) * s * 0.08 + s * 0.04, s * 0.17, s * 0.05, a, 0, Math.PI * 2); g.fill(); }
    }
    if (soft) g.globalAlpha = 1;
  }
  const mixP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

  // 정적 층: 지형·마을·건물·전선. 바뀔 때만 다시 그린다.
  function paintStatic() {
    const st = S.st, layer = S.layer, dpr = dprOf();
    const c = S.base;
    const PW = Math.round(V.W * dpr), PH = Math.round(V.H * dpr);
    if (c.width !== PW) c.width = PW;
    if (c.height !== PH) c.height = PH;
    const g = c.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, PW, PH);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineJoin = "round";
    const rec = { hubs: [], stacks: [], wins: [], pylons: new Map() };
    const bAt = new Map(st.builds.map((b, bi) => [b.i, bi]));
    const lineTiles = new Set();
    st.lines.forEach(L => L.p.forEach(i => lineTiles.add(i)));
    for (const T of ORDER) {
      drawTile(g, T, layer);
      if (T.t === "town") drawTown(g, T, rec);
      else if (bAt.has(T.i)) { const bi = bAt.get(T.i); drawBuilding(g, st.builds[bi].t, T, rec, bi); }
      else drawDeco(g, T, layer);
      if (lineTiles.has(T.i)) { drawPylon(g, T); rec.pylons.set(T.i, pylonTop(T)); }
    }
    // 전선(모든 타일 위)
    g.strokeStyle = "rgba(24,30,38,0.85)"; g.lineWidth = Math.max(1, V.S * 0.035);
    g.beginPath();
    st.lines.forEach(L => { for (let k = 1; k < L.p.length; k++) wirePath(g, rec.pylons.get(L.p[k - 1]), rec.pylons.get(L.p[k]), V.S * 0.08); });
    g.stroke();
    // 데이터 층 숫자
    if (layer !== "map" && V.S >= 21) {
      g.font = `600 ${Math.round(clamp(V.S * 0.36, 9, 13))}px "IBM Plex Mono", ui-monospace, monospace`;
      g.textAlign = "center"; g.textBaseline = "middle";
      TILES.forEach(T => {
        if (!T.land) return;
        const t = layerTxt(T, layer);
        if (!t) return;
        const [x, y] = tileTop(T);
        g.lineWidth = 3; g.strokeStyle = "rgba(6,16,30,0.85)"; g.strokeText(t, x, y + V.S * 0.32);
        g.fillStyle = "#f4f8fc"; g.fillText(t, x, y + V.S * 0.32);
      });
    }
    // 표시: 숲 정리, 연결 안 됨
    st.builds.forEach((b, bi) => {
      const T = TILES[b.i], [x, y] = tileTop(T), s = V.S;
      if (T.t === "forest") {
        const lx = x - s * 0.55, ly = y - s * 0.05;
        g.beginPath(); g.arc(lx, ly, Math.max(5, s * 0.17), 0, Math.PI * 2); g.fillStyle = "#1d5a33"; g.fill();
        g.strokeStyle = "#ffffff"; g.lineWidth = 1.4; g.stroke();
        g.strokeStyle = "#ffffff"; g.beginPath(); g.moveTo(lx - s * 0.08, ly); g.lineTo(lx + s * 0.08, ly); g.stroke();
      }
      const n = S.net.nodes.find(nd => nd.bi === bi);
      if (n && !n.live) {
        const bx = x + s * 0.5, by = y - s * 0.75;
        g.beginPath(); g.arc(bx, by, Math.max(6, s * 0.2), 0, Math.PI * 2); g.fillStyle = "#dc4f6a"; g.fill();
        g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = "#fff"; g.font = `700 ${Math.max(9, s * 0.28)}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("!", bx, by + 0.5);
      }
    });
    S.rec = rec;
  }

  /* ---------- 움직이는 층 ---------- */
  function paintSea(g, t, night) {
    const grd = g.createLinearGradient(0, 0, 0, V.H);
    grd.addColorStop(0, "#1b5f86"); grd.addColorStop(0.55, "#2378a0"); grd.addColorStop(1, "#175274");
    g.fillStyle = grd; g.fillRect(0, 0, V.W, V.H);
    const step = 46;
    g.lineWidth = 1.4; g.lineCap = "round";
    for (let y = -step, row = 0; y < V.H + step; y += step * 0.6, row++) {
      for (let x = -step + (row % 2) * step * 0.5; x < V.W + step; x += step) {
        const hsh = hash(x | 0, row, 31), ph = t * (0.5 + hsh * 0.6) + hsh * 6.28;
        const a = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(ph));
        const ox = Math.sin(ph * 0.7) * 5;
        g.strokeStyle = `rgba(200,240,255,${a.toFixed(3)})`;
        g.beginPath(); g.moveTo(x + ox - 7, y + hsh * 20); g.quadraticCurveTo(x + ox, y + hsh * 20 - 3, x + ox + 7, y + hsh * 20); g.stroke();
      }
    }
  }
  function curHour() {
    const R = S.run;
    if (!R) return null;
    const k = clamp(R.k, 0, R.res.H - 1);
    return { k, d: Math.floor(k / 24), h: k % 24 };
  }
  function paintDynamic(g, t) {
    const st = S.st, R = S.run, ch = curHour(), s = V.S, rm = reduced();
    const anim = rm ? 0 : t;
    // 풍력 날개
    S.rec.hubs.forEach(hb => {
      let v = TILES[hb.tile].wind;
      if (ch) v *= R.res.hrWind[ch.k];
      const w = v > M.cutout ? 0 : 0.5 + v * 0.32;
      const a0 = anim * w + hb.tile;
      g.strokeStyle = "#f5f8fa"; g.lineWidth = Math.max(1.4, s * 0.06); g.lineCap = "round";
      g.beginPath();
      for (let k = 0; k < 3; k++) { const a = a0 + k * 2.094; g.moveTo(hb.x, hb.y); g.lineTo(hb.x + Math.cos(a) * hb.len, hb.y + Math.sin(a) * hb.len); }
      g.stroke();
      g.beginPath(); g.arc(hb.x, hb.y, Math.max(1.6, s * 0.06), 0, Math.PI * 2); g.fillStyle = "#c9d3dc"; g.fill();
    });
    // 디젤 연기: 서풍이라 동쪽으로 흐른다(세로 화면에서는 아래쪽)
    const [ex, ey] = (() => { const A = scr(0, 0, 0), B = scr(1, 0, 0); const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1; return [(B[0] - A[0]) / L, (B[1] - A[1]) / L]; })();
    S.rec.stacks.forEach(sk => {
      let on = true;
      if (ch) { const n = S.runNet.dk[sk.bi]; on = n !== undefined && n < 32 && (R.res.hrDiesel[ch.k] & (1 << n)) !== 0; }
      if (!on) return;
      for (let k = 0; k < 7; k++) {
        const ph = rm ? k / 7 : ((anim * 0.32 + k / 7 + sk.bi * 0.13) % 1);
        const dist = ph * s * 2.2;
        const x = sk.x + ex * dist + Math.sin(ph * 6 + k) * s * 0.05, y = sk.y + ey * dist - ph * s * 0.55;
        const r = s * (0.09 + ph * 0.3);
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = `rgba(${ch ? "92,92,96" : "120,124,130"},${((1 - ph) * (ch ? 0.5 : 0.32)).toFixed(3)})`;
        g.fill();
      }
    });
    if (!ch) return;
    const wx = R.res.wx[ch.d];
    // 구름·비
    if (wx.w > 0) {
      const n = wx.w === 1 ? 6 : 9;
      for (let k = 0; k < n; k++) {
        const span = V.W + 260, sp = 14 + hash(k, ch.d, 3) * 18;
        const x = ((hash(k, ch.d, 1) * span + anim * sp) % span) - 130;
        const y = V.area.t + hash(k, ch.d, 2) * (V.area.b - V.area.t) * 0.85;
        const r = 26 + hash(k, ch.d, 4) * 26;
        g.beginPath(); g.ellipse(x + 30, y + 70, r * 1.5, r * 0.5, 0, 0, Math.PI * 2); g.fillStyle = "rgba(8,20,32,0.12)"; g.fill();
        g.fillStyle = wx.w === 1 ? "rgba(236,242,248,0.78)" : "rgba(168,180,194,0.85)";
        g.beginPath();
        [[0, 0, 1], [-0.8, 0.25, 0.7], [0.85, 0.2, 0.75], [0.3, -0.35, 0.7]].forEach(([dx, dy, rr]) => { g.moveTo(x + dx * r + rr * r, y + dy * r); g.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2); });
        g.fill();
      }
      if (wx.w === 2) {
        g.strokeStyle = "rgba(200,225,245,0.35)"; g.lineWidth = 1;
        g.beginPath();
        for (let k = 0; k < 90; k++) {
          const x = (hash(k, 1, 5) * V.W + anim * 60) % V.W, y = (hash(k, 2, 5) * V.H + anim * 380) % V.H;
          g.moveTo(x, y); g.lineTo(x - 4, y + 12);
        }
        g.stroke();
      }
    }
    // 낮·밤
    const e = Math.sin(Math.PI * (ch.h + 0.5 - 6) / 12);
    const dark = e <= 0 ? 0.55 : clamp(0.55 - e * 1.7, 0, 0.55);
    if (e > -0.15 && e < 0.4) { g.fillStyle = `rgba(255,140,70,${(0.13 * (1 - Math.abs(e - 0.1) / 0.4)).toFixed(3)})`; g.fillRect(0, 0, V.W, V.H); }
    if (dark > 0.01) { g.fillStyle = `rgba(6,14,40,${dark.toFixed(3)})`; g.fillRect(0, 0, V.W, V.H); }
    // 전력 흐름
    const res = R.res, E = res.E;
    if (E) {
      g.lineCap = "round";
      res.edges.forEach(([a, b], e2) => {
        const f = res.flow[ch.k * E + e2];
        const af = Math.abs(f);
        if (af < 0.03) return;
        const A = S.rec.pylons.get(a), B = S.rec.pylons.get(b);
        if (!A || !B) return;
        const w = 1.2 + Math.min(7, af * 1.3);
        g.strokeStyle = "rgba(113,220,235,0.4)"; g.lineWidth = w + 3;
        g.beginPath(); wirePath(g, A, B, s * 0.08); g.stroke();
        g.strokeStyle = "rgba(200,250,255,0.9)"; g.lineWidth = Math.max(1, w * 0.4);
        g.beginPath(); wirePath(g, A, B, s * 0.08); g.stroke();
        const [P0, P1] = f > 0 ? [A, B] : [B, A];
        for (let j = 0; j < 2; j++) {
          const u = rm ? (j + 0.5) / 2 : ((anim * (0.7 + af * 0.12) + j / 2 + e2 * 0.17) % 1);
          const mx = (P0[0] + P1[0]) / 2, my = (P0[1] + P1[1]) / 2 + s * 0.08;
          const x = (1 - u) * (1 - u) * P0[0] + 2 * (1 - u) * u * mx + u * u * P1[0];
          const y = (1 - u) * (1 - u) * P0[1] + 2 * (1 - u) * u * my + u * u * P1[1];
          g.beginPath(); g.arc(x, y, 1.6 + Math.min(3, af * 0.5), 0, Math.PI * 2); g.fillStyle = "#f2feff"; g.fill();
        }
      });
    }
    // 창문·정전 표시
    const blink = rm ? 1 : (Math.sin(t * 9) > 0 ? 1 : 0.25);
    S.rec.wins.forEach(W => {
      const uns = res.hrUns[ch.k * 4 + W.ti] > 0.05;
      if (dark > 0.12) {
        if (!uns) {
          const gl = g.createRadialGradient(W.x, W.y - s * 0.3, 2, W.x, W.y - s * 0.3, s * 1.3);
          gl.addColorStop(0, `rgba(255,214,120,${(dark * 0.6).toFixed(3)})`); gl.addColorStop(1, "rgba(255,214,120,0)");
          g.fillStyle = gl; g.fillRect(W.x - s * 1.4, W.y - s * 1.7, s * 2.8, s * 2.8);
        }
        g.fillStyle = uns ? "rgba(20,24,40,0.95)" : "#ffd36b";
        W.list.forEach(([x, y, w, h]) => g.fillRect(x, y, w, h));
      }
      if (uns) {
        g.strokeStyle = `rgba(255,90,120,${(0.85 * blink).toFixed(3)})`; g.lineWidth = 2.5;
        g.beginPath(); g.ellipse(W.x, W.y, s * 0.95, s * 0.95 * SQ, 0, 0, Math.PI * 2); g.stroke();
      }
    });
  }
  function paintCursor(g, t) {
    if (S.run) return;
    const hov = S.hover;
    const rm = reduced();
    // 송전선 미리보기
    const pv = S.pending ? S.pending.p : S.preview ? S.preview.p : null;
    if (pv) {
      g.save();
      g.setLineDash([6, 5]); g.lineDashOffset = rm ? 0 : -t * 20;
      g.strokeStyle = S.pending ? "#ecd083" : "rgba(236,208,131,0.8)"; g.lineWidth = 3; g.lineCap = "round";
      g.beginPath();
      pv.forEach((i, k) => { const [x, y] = pylonTop(TILES[i]); if (k) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
      g.restore();
      pv.forEach(i => { const [x, y] = pylonTop(TILES[i]); g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fillStyle = "#ecd083"; g.fill(); });
    }
    if (S.lineStart != null) {
      const T = TILES[S.lineStart];
      const pulse = rm ? 1 : 0.75 + 0.25 * Math.sin(t * 5);
      polyPath(g, topPoly(T)); g.lineWidth = 3; g.strokeStyle = `rgba(236,208,131,${pulse.toFixed(3)})`; g.stroke();
    }
    const show = hov != null ? hov : null;
    if (show == null) return;
    const T = TILES[show];
    const chk = S.tool && S.tool !== "line" && S.tool !== "remove" ? canPlace(S.tool, show) : null;
    polyPath(g, topPoly(T));
    g.fillStyle = chk ? (chk.ok ? "rgba(123,227,180,0.22)" : "rgba(220,120,144,0.25)") : "rgba(255,255,255,0.12)";
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = chk ? (chk.ok ? "#7be3b4" : "#ff8fa6") : S.kbd ? "#ecd083" : "rgba(255,255,255,0.85)";
    g.stroke();
    if (chk && chk.ok) { g.globalAlpha = 0.6; drawBuilding(g, S.tool, T, null, -1); g.globalAlpha = 1; }
  }
  function paintFloaters(g, now) {
    S.floaters = S.floaters.filter(f => now - f.t0 < 1100);
    S.floaters.forEach(f => {
      const p = (now - f.t0) / 1100;
      g.globalAlpha = 1 - p;
      g.font = `700 14px "IBM Plex Mono", ui-monospace, monospace`; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 3; g.strokeStyle = "rgba(6,16,30,0.9)";
      g.strokeText(f.text, f.x, f.y - p * 28); g.fillStyle = f.col; g.fillText(f.text, f.x, f.y - p * 28);
      g.globalAlpha = 1;
    });
  }

  function frame(now) {
    if (!S || !S.alive) return;
    S.raf = 0;
    if (S.dirtyLayout) layout();
    if (S.dirtyStatic) { paintStatic(); S.dirtyStatic = false; }
    const g = S.g, t = (now - S.born) / 1000, dpr = dprOf();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (S.run && !S.run.done) stepRun(now);
    const ch = curHour();
    paintSea(g, reduced() ? 0 : t, ch);
    g.drawImage(S.base, 0, 0, V.W, V.H);
    paintDynamic(g, t);
    paintCursor(g, t);
    if (S.floaters.length) paintFloaters(g, now);
    placeBanners();
    const keep = !reduced() && !document.hidden;
    if (keep || S.floaters.length) S.raf = requestAnimationFrame(frame);
  }
  function request() { if (S && S.alive && !S.raf) S.raf = requestAnimationFrame(frame); }

  /* =====================================================================
   * 6. 조작
   * ===================================================================== */
  const budgetLeft = () => M.budget - capex(S.st);
  function canPlace(type, i) {
    const T = TILES[i];
    if (!T.land) return { ok: false, why: "바다에는 못 지음" };
    if (T.t === "town") return { ok: false, why: "마을 자리" };
    if (S.st.builds.some(b => b.i === i)) return { ok: false, why: "이미 있음" };
    if (!BLD[type].ok[T.t]) return { ok: false, why: T.t === "mount" ? "산 능선: 풍력만" : "못 지음" };
    const cost = buildCost(type, i);
    if (cost > budgetLeft() + 1e-9) return { ok: false, why: `예산 부족(${fmt(cost)}억)`, cost };
    return { ok: true, cost, clear: T.t === "forest" };
  }
  function changed(msg) {
    saveState(S.st);
    S.net = network(S.st);
    S.result = null;
    S.dirtyStatic = true;
    refreshHUD();
    renderDrawer();
    placeBannerValues();
    updateAria();
    if (msg) announce(msg);
    request();
  }
  function floater(i, text, col) {
    if (reduced()) return;
    const [x, y] = tileTop(TILES[i]);
    S.floaters.push({ x, y: y - V.S * 0.6, text, col, t0: performance.now() });
  }
  function place(type, i) {
    const chk = canPlace(type, i);
    if (!chk.ok) { toast(chk.why); return; }
    S.st.builds.push({ t: type, i });
    floater(i, `−${fmt(chk.cost)}억`, "#ecd083");
    changed(`${BLD[type].name} 설치 · ${fmt(chk.cost)}억${chk.clear ? " (숲 정리 포함)" : ""}`);
  }
  function removeAt(i) {
    const bi = S.st.builds.findIndex(b => b.i === i);
    if (bi >= 0) {
      const b = S.st.builds[bi], c = buildCost(b.t, b.i);
      S.st.builds.splice(bi, 1);
      floater(i, `+${fmt(c)}억`, "#7be3b4");
      changed(`${BLD[b.t].name} 철거 · ${fmt(c)}억 환불`);
      return;
    }
    const keep = S.st.lines.filter(L => !L.p.includes(i));
    if (keep.length !== S.st.lines.length) {
      const back = S.st.lines.filter(L => L.p.includes(i)).reduce((a, L) => a + lineCost(L.p), 0);
      S.st.lines = keep;
      floater(i, `+${fmt(back, 1)}억`, "#7be3b4");
      changed(`송전선 철거 · ${fmt(back, 1)}억 환불`);
      return;
    }
    toast("철거할 것이 없다");
  }
  const onLine = i => S.st.lines.some(L => L.p.includes(i));
  const validStart = i => TILES[i].t === "town" || S.st.builds.some(b => b.i === i) || onLine(i);
  function lineClick(i) {
    if (S.pending) {
      if (i === S.pending.end) { confirmLine(); return; }
    }
    if (S.lineStart == null) {
      if (!validStart(i)) { toast("시작: 발전소·마을·송전선"); return; }
      S.lineStart = i; S.pending = null; S.preview = null;
      announce("시작점 선택. 끝점을 고르세요.");
      showConfirm();
      request();
      return;
    }
    if (i === S.lineStart) { cancelLine(); return; }
    if (!TILES[i].land) { toast("끝점은 육지"); return; }
    const p = routePath(S.lineStart, i);
    if (!p) { toast("길이 없다"); return; }
    S.pending = { p, end: i, cost: lineCost(p) };
    S.preview = null;
    showConfirm();
    announce(`송전선 ${p.length - 1}칸 · ${fmt(S.pending.cost, 1)}억. 확인하려면 다시 누르거나 Enter.`);
    request();
  }
  function confirmLine() {
    const P = S.pending;
    if (!P) return;
    if (P.cost > budgetLeft() + 1e-9) { toast(`예산 부족(${fmt(P.cost, 1)}억)`); return; }
    S.st.lines.push({ p: P.p });
    floater(P.end, `−${fmt(P.cost, 1)}억`, "#ecd083");
    S.pending = null; S.lineStart = null; S.preview = null;
    showConfirm();
    changed(`송전선 연결 · ${P.p.length - 1}칸 · ${fmt(P.cost, 1)}억`);
  }
  function cancelLine() {
    S.pending = null; S.lineStart = null; S.preview = null;
    showConfirm();
    request();
  }
  function act(i) {
    const tool = S.tool;
    if (!tool) { showTip(i); return; }
    if (tool === "remove") removeAt(i);
    else if (tool === "line") lineClick(i);
    else place(tool, i);
    showTip(i);
  }
  function setTool(id) {
    S.tool = S.tool === id ? null : id;
    cancelLine();
    S.sel = null;
    S.root.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === S.tool)));
    S.root.dataset.mode = S.tool || "";
    if (S.hover != null) showTip(S.hover);
    request();
  }
  function hit(x, y) {
    for (let k = ORDER.length - 1; k >= 0; k--) {
      const T = ORDER[k], p = topPoly(T, HGT[T.t], 1);
      let inside = false;
      for (let a = 0, b = 5; a < 6; b = a++) {
        if ((p[a][1] > y) !== (p[b][1] > y) && x < (p[b][0] - p[a][0]) * (y - p[a][1]) / (p[b][1] - p[a][1]) + p[a][0]) inside = !inside;
      }
      if (inside) return T.i;
    }
    return null;
  }
  function setHover(i, kbd) {
    if (S.hover === i && !!kbd === !!S.kbd) return;
    S.hover = i; S.kbd = !!kbd;
    if (i != null && S.tool === "line" && S.lineStart != null && !S.pending && TILES[i].land && i !== S.lineStart) {
      const p = routePath(S.lineStart, i);
      S.preview = p ? { p, end: i, cost: lineCost(p) } : null;
      showConfirm();
    } else if (S.preview) { S.preview = null; showConfirm(); }
    if (i == null) hideTip(); else showTip(i);
    request();
  }

  /* ---------- 지도 포인터 ---------- */
  function bindCanvas(cv) {
    let down = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    on(cv, "pointerdown", e => {
      if (S.run) return;
      const [x, y] = pos(e);
      down = { x, y, px: V.panX, py: V.panY, id: e.pointerId, moved: false, type: e.pointerType };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    });
    on(cv, "pointermove", e => {
      const [x, y] = pos(e);
      if (down && down.id === e.pointerId) {
        const dx = x - down.x, dy = y - down.y;
        if (!down.moved && Math.hypot(dx, dy) > 8 && V.zoom > 1) down.moved = true;
        if (down.moved) { V.panX = down.px + dx; V.panY = down.py + dy; S.dirtyLayout = true; hideTip(); request(); return; }
      }
      if (S.run || e.pointerType === "touch") return;
      setHover(hit(x, y), false);
    });
    on(cv, "pointerup", e => {
      if (!down || down.id !== e.pointerId) return;
      const d = down; down = null;
      if (d.moved || S.run) return;
      const [x, y] = pos(e);
      const i = hit(x, y);
      if (i == null) { setHover(null); return; }
      if (d.type === "touch" && S.tool && S.tool !== "line" && S.sel !== i) {
        // 손가락: 첫 탭은 미리보기, 같은 타일을 한 번 더 누르면 설치
        S.sel = i; setHover(i, false);
        return;
      }
      S.sel = null;
      setHover(i, false);
      act(i);
    });
    on(cv, "pointercancel", () => { down = null; });
    on(cv, "pointerleave", e => { if (e.pointerType !== "touch" && !S.kbd) setHover(null); });
    on(cv, "keydown", e => {
      if (S.run) return;
      const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (dirs[e.key]) {
        e.preventDefault();
        const cur = S.hover != null ? S.hover : TOWNS[0].tile;
        const nx = S.hover == null ? cur : stepFrom(cur, dirs[e.key]);
        setHover(nx, true);
        const T = TILES[nx];
        announce(`${T.town >= 0 ? TOWNS[T.town].name : TNAME[T.t]}${T.land ? `, 일사 ${T.sun}, 풍속 ${T.wind} m/s` : ""}`);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (S.pending && (S.hover == null || S.hover === S.pending.end)) { confirmLine(); return; }
        if (S.hover != null) act(S.hover);
        return;
      }
      if (e.key === "Escape") {
        if (S.lineStart != null || S.pending) { e.preventDefault(); cancelLine(); announce("송전선 취소"); }
        else if (S.tool) { e.preventDefault(); setTool(S.tool); announce("도구 해제"); }
      }
    });
    on(cv, "focus", () => { if (S.hover == null && cv.matches(":focus-visible")) setHover(TOWNS[0].tile, true); });
    on(cv, "blur", () => { if (S.kbd) { S.kbd = false; hideTip(); request(); } });
  }
  function stepFrom(i, [dx, dy]) {
    const T = TILES[i], A = scr(T.X, T.Y, 0);
    let best = i, bd = 0.35;
    T.nb.forEach(j => {
      const B = scr(TILES[j].X, TILES[j].Y, 0), vx = B[0] - A[0], vy = B[1] - A[1], L = Math.hypot(vx, vy) || 1;
      const d = (vx * dx + vy * dy) / L;
      if (d > bd) { bd = d; best = j; }
    });
    return best;
  }

  /* =====================================================================
   * 7. 시뮬레이션 재생
   * ===================================================================== */
  const RUN_MS = 8000;
  function startRun(days) {
    if (S.run) return;
    if (S.st.missions.length !== 2) {
      openDrawer("mission");
      toast("미션 2개를 먼저 고르세요");
      return;
    }
    cancelLine();
    hideTip();
    S.hover = null;
    const res = simulate(S.st, days);
    // 화면용: 디젤 건물 번호 → 비트 위치
    const dk = {};
    let n = 0;
    S.st.builds.forEach((b, bi) => { if (b.t === "diesel") dk[bi] = n++; });
    S.runNet = { dk };
    S.run = { res, days, t0: performance.now(), k: 0, done: false, tip: -1, tipBase: S.tipSeq++ };
    S.result = null;
    html.classList.add("bd-running");
    closeDrawer(true);
    const panel = $("#bd-run");
    panel.hidden = false;
    $("#bd-run-len").textContent = days === 7 ? "1주" : days === 30 ? "1달" : "3달";
    S.root.querySelectorAll("[data-run]").forEach(b => { b.disabled = true; });
    if (reduced()) {
      // 움직임 줄이기: 짧은 진행 막대 뒤 결과로 건너뛴다.
      let p = 0;
      const tick = () => {
        if (!S || !S.alive || !S.run) return;
        p = Math.min(1, p + 0.25);
        S.run.k = Math.floor(p * (res.H - 1));
        updateRunPanel(p);
        if (p >= 1) { S.timers.push(setTimeout(() => finishRun(), 120)); return; }
        S.timers.push(setTimeout(tick, 150));
      };
      tick();
      request();
    } else request();
    $("#bd-skip").focus({ preventScroll: true });
    announce(`${days}일 운영 시작`);
  }
  function stepRun(now) {
    const R = S.run, p = clamp((now - R.t0) / RUN_MS, 0, 1);
    R.k = Math.min(R.res.H - 1, Math.floor(p * R.res.H));
    updateRunPanel(p);
    if (p >= 1) finishRun();
  }
  function updateRunPanel(p) {
    const R = S.run, ch = curHour();
    const wx = R.res.wx[ch.d];
    const tick = `Day ${ch.d + 1} · ${hh(ch.h)}`;
    if (S.lastTick !== tick) {
      S.lastTick = tick;
      $("#bd-run-day").textContent = tick;
      $("#bd-run-wx").innerHTML = ico(WX[wx.w].k) + `<span>${WX[wx.w].name}${wx.hot ? " · 폭염" : ""}</span>`;
      const bar = $("#bd-run-bar");
      bar.style.width = `${Math.round(p * 100)}%`;
      $("#bd-run-prog").setAttribute("aria-valuenow", String(Math.round(p * 100)));
      paintSpark();
      refreshHUD();
      placeBannerValues();
    }
    const tipK = reduced() ? 0 : Math.floor((performance.now() - R.t0) / 3000);
    if (tipK !== R.tip) {
      R.tip = tipK;
      const el = $("#bd-run-tip");
      el.textContent = TIPS[(R.tipBase * 3 + tipK) % TIPS.length];
    }
  }
  function paintSpark() {
    const c = $("#bd-spark"), R = S.run;
    if (!c || !R) return;
    const box = c.getBoundingClientRect();
    if (!box.width) return;
    const dpr = dprOf(), W = box.width, H = box.height;
    if (c.width !== Math.round(W * dpr)) c.width = Math.round(W * dpr);
    if (c.height !== Math.round(H * dpr)) c.height = Math.round(H * dpr);
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const k1 = R.k, k0 = Math.max(0, k1 - 71), n = 72;
    let mx = 1;
    for (let k = k0; k <= k1; k++) mx = Math.max(mx, R.res.hrDem[k], R.res.hrSup[k]);
    mx *= 1.1;
    const X = k => 2 + (k - (k1 - n + 1)) / (n - 1) * (W - 4), Y = v => H - 3 - v / mx * (H - 8);
    // 부족분
    g.fillStyle = "rgba(255,120,150,0.35)";
    g.beginPath();
    for (let k = k0; k <= k1; k++) g.lineTo(X(k), Y(R.res.hrDem[k]));
    for (let k = k1; k >= k0; k--) g.lineTo(X(k), Y(R.res.hrSup[k]));
    g.fill();
    const line = (arr, col, wd) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); for (let k = k0; k <= k1; k++) { const x = X(k), y = Y(arr[k]); if (k === k0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); };
    line(R.res.hrDem, "rgba(237,244,252,0.85)", 1.4);
    line(R.res.hrSup, "#71dceb", 2);
  }
  function finishRun() {
    if (!S || !S.run) return;
    const R = S.run;
    R.done = true;
    S.result = R.res;
    S.run = null;
    S.lastTick = "";
    html.classList.remove("bd-running");
    $("#bd-run").hidden = true;
    S.root.querySelectorAll("[data-run]").forEach(b => { b.disabled = false; });
    refreshHUD();
    placeBannerValues();
    S.drawerTab = "result";
    renderDrawer();
    openDrawer("result");
    const head = $("#bd-res-title");
    if (head) head.focus({ preventScroll: true });
    announce(`운영 끝. 정전 ${R.res.outTotal}시간, 총비용 ${fmt(R.res.cost.total, 1)}억, CO₂ ${fmt(R.res.co2)} t.`);
    request();
  }

  /* =====================================================================
   * 8. DOM: HUD, 도구, 서랍, 말풍선
   * ===================================================================== */
  function on(el, type, fn, opt) { el.addEventListener(type, fn, opt); S.off.push(() => el.removeEventListener(type, fn, opt)); }
  const cap = (k, icon, name, tone) => `<span class="v2-cap bd-cap${tone ? " tone-" + tone : ""}" data-cap="${k}">${ico(icon)}<span class="v2-cap-txt"><span class="v2-cap-k">${name}</span><span class="v2-cap-v" data-v></span></span></span>`;
  function shell(app) {
    const root = document.createElement("div");
    root.className = "bd-root";
    root.id = "bd-root";
    root.innerHTML = `
      <div class="bd-stage">
        <canvas class="bd-canvas" id="bd-canvas" tabindex="0" role="application" aria-roledescription="섬 지도" aria-describedby="bd-keys"></canvas>
        <div class="bd-banners" id="bd-banners" aria-hidden="true"></div>
        <div class="bd-tip" id="bd-tip" hidden></div>
      </div>
      <p id="bd-keys" class="bd-sr">화살표로 타일 이동, Enter로 설치, Esc로 취소.</p>
      <header class="bd-hud" id="bd-hud">
        <a class="bd-back" href="#home" aria-label="연습실 홈으로">${ico("back")}</a>
        <div class="bd-title"><p class="v2-kicker">GRID TYCOON</p><h1>섬 전력망 건설</h1></div>
        <div class="bd-caps">
          ${cap("budget", "coin", "예산", "gold")}
          ${cap("time", "clock", "시간", "sky")}
          ${cap("power", "bolt", "공급/수요", "mint")}
          ${cap("co2", "co2", "CO₂")}
          ${cap("cp", "alert", "민원")}
        </div>
        <span class="bd-virtual">가상 모형</span>
        <button type="button" class="bd-help" id="bd-help" aria-label="도움말과 팁">${ico("help")}</button>
      </header>
      <div class="bd-mapbar" id="bd-mapbar">
        <div class="bd-layers" role="group" aria-label="자료 지도">
          ${LAYERS.map(L => `<button type="button" class="bd-layer" data-layer="${L.id}" aria-pressed="false">${ico(L.icon)}<span>${L.name}</span></button>`).join("")}
        </div>
        <div class="bd-zoom" role="group" aria-label="확대">
          <button type="button" class="bd-zbtn" data-zoom="-1" aria-label="축소">${ico("minus")}</button>
          <button type="button" class="bd-zbtn" data-zoom="1" aria-label="확대">${ico("plus")}</button>
        </div>
        <span class="bd-windchip" id="bd-windchip" role="img" aria-label="우세풍: 서풍, 서쪽에서 동쪽으로"><svg class="v2-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12h15M14 7l5 5-5 5"/></svg><span>서풍</span></span>
        <div class="bd-legend" id="bd-legend" hidden></div>
      </div>
      <aside class="bd-drawer" id="bd-drawer" aria-label="정책·미션·결과">
        <div class="bd-drawer-head">
          <div class="bd-tabs" role="group" aria-label="서랍">
            <button type="button" class="bd-tab" data-tab="policy" aria-pressed="true">${ico("cards")}<span>정책</span><b class="bd-count" data-count="policy"></b></button>
            <button type="button" class="bd-tab" data-tab="mission" aria-pressed="false">${ico("flag")}<span>미션</span><b class="bd-count" data-count="mission"></b></button>
            <button type="button" class="bd-tab" data-tab="result" aria-pressed="false">${ico("news")}<span>결과</span></button>
          </div>
          <button type="button" class="bd-x" id="bd-drawer-x" aria-label="서랍 닫기">${ico("x")}</button>
        </div>
        <div class="bd-drawer-body" id="bd-drawer-body"></div>
      </aside>
      <div class="bd-confirm" id="bd-confirm" hidden></div>
      <section class="bd-run" id="bd-run" hidden aria-label="운영 중">
        <div class="bd-run-top">
          <span class="bd-run-len" id="bd-run-len"></span>
          <b class="bd-run-day num" id="bd-run-day" aria-live="off"></b>
          <span class="bd-run-wx" id="bd-run-wx"></span>
          <button type="button" class="bd-skip" id="bd-skip">${ico("skip")}<span>결과 보기</span></button>
        </div>
        <div class="bd-run-prog" id="bd-run-prog" role="progressbar" aria-label="진행" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="bd-run-bar"></span></div>
        <div class="bd-run-mid">
          <canvas class="bd-spark" id="bd-spark" aria-hidden="true"></canvas>
          <p class="bd-spark-key"><span class="k-dem">수요</span><span class="k-sup">공급</span><span class="k-uns">부족</span></p>
        </div>
        <p class="bd-run-tip"><span class="bd-tip-b">TIP</span><span id="bd-run-tip"></span></p>
      </section>
      <nav class="bd-dock" id="bd-dock" aria-label="건설 도구">
        <div class="bd-tools">
          ${TOOLS.map(T => `<button type="button" class="bd-tool" data-tool="${T.id}" aria-pressed="false">${ico(T.icon)}<span class="bd-tool-n">${T.name}</span><span class="bd-tool-c num">${T.cost}</span></button>`).join("")}
        </div>
        <div class="bd-runs">
          <button type="button" class="bd-pm" id="bd-pm" aria-expanded="false" aria-controls="bd-drawer">${ico("cards")}<span>정책·미션</span></button>
          <span class="bd-run-lbl" aria-hidden="true">${ico("play")}</span>
          <button type="button" class="bd-go" data-run="7">1주</button>
          <button type="button" class="bd-go" data-run="30">1달</button>
          <button type="button" class="bd-go" data-run="90">3달</button>
        </div>
      </nav>
      <p class="bd-toast" id="bd-toast" role="status" aria-live="polite"></p>
      <p class="bd-sr" id="bd-live" aria-live="polite"></p>`;
    app.append(root);
    return root;
  }

  function refreshHUD() {
    const set = (k, v, tone) => {
      const el = S.root.querySelector(`[data-cap="${k}"]`);
      if (!el) return;
      const vEl = el.querySelector("[data-v]");
      if (vEl.textContent !== v) vEl.textContent = v;
      if (tone !== undefined) el.classList.toggle("tone-danger", tone === "danger");
    };
    const left = budgetLeft();
    set("budget", `${fmt(left, Math.abs(left % 1) > 1e-9 ? 1 : 0)}억`, left < 6 ? "danger" : "");
    const R = S.run, res = S.result;
    if (R) {
      const ch = curHour();
      set("time", `D${ch.d + 1} ${hh(ch.h)}`);
      set("power", `${fmt(R.res.hrSup[ch.k], 1)}/${fmt(R.res.hrDem[ch.k], 1)}`, R.res.hrSup[ch.k] + 0.05 < R.res.hrDem[ch.k] ? "danger" : "");
      let co2 = 0;
      // 누적 CO₂(디젤 가동 비트 수로 근사하지 않고 결과 비율로 보간)
      co2 = R.res.co2 * (ch.k + 1) / R.res.H;
      set("co2", `${fmt(co2)} t`);
      set("cp", `${R.res.cp.issues}건`, R.res.cp.issues > 1 ? "danger" : "");
    } else if (res) {
      set("time", `${res.days}일 끝`);
      set("power", `정전 ${res.outTotal}h`, res.outTotal > 0 ? "danger" : "");
      set("co2", `${fmt(res.co2)} t`);
      set("cp", `${res.cp.issues}건`, res.cp.issues > 1 ? "danger" : "");
    } else {
      const capMW = S.net.nodes.filter(n => n.kind !== "town" && n.live).reduce((a, n) => a + (n.kind === "diesel" ? M.dieselMW : n.kind === "battery" ? M.batMW : M.solarMW), 0);
      const peak = peakDemand(polOf(S.st));
      set("time", "건설 중");
      set("power", `${fmt(capMW, 0)}/${fmt(peak, 1)}`, capMW < peak ? "danger" : "");
      set("co2", "—");
      const cp = complaints(S.st, null);
      set("cp", `${cp.issues}건`, cp.issues > 1 ? "danger" : "");
    }
    const pk = S.root.querySelector('[data-cap="power"] .v2-cap-k'), mode = R ? "run" : res ? "res" : "build";
    if (pk.dataset.mode !== mode) { pk.dataset.mode = mode; pk.innerHTML = R ? '공급/수요<span class="bd-unit"> MW</span>' : res ? "결과" : '설비/피크<span class="bd-unit"> MW</span>'; }
  }

  /* ---------- 배너(마을 이름) ---------- */
  function buildBanners() {
    const box = $("#bd-banners");
    box.innerHTML = TOWNS.map((W, ti) => `<div class="bd-banner" data-ti="${ti}"><span class="bd-bn-code">${W.id}</span><span class="bd-bn-name">${esc(W.name)}</span>${W.note ? `<span class="bd-bn-note">${esc(W.note)}</span>` : ""}<span class="bd-bn-val num" data-bv></span></div>`).join("");
    S.banners = Array.from(box.children);
  }
  function placeBanners() {
    if (!S.banners) return;
    const key = `${V.ox.toFixed(1)},${V.oy.toFixed(1)},${V.S.toFixed(2)},${V.rot}`;
    if (S.bannerKey === key) return;
    S.bannerKey = key;
    S.banners.forEach((el, ti) => {
      const T = TILES[TOWNS[ti].tile];
      const lift = TOWNS[ti].kind === "city" ? 1.45 : TOWNS[ti].kind === "port" ? 1.05 : 0.95;
      const [x, y] = tileTop(T, 0);
      const w = el.offsetWidth, h = el.offsetHeight;
      const bx = clamp(x - w / 2, 4, V.W - w - 4), by = clamp(y - V.S * lift - h - 8, 4, V.H - h - 4);
      el.style.transform = `translate(${Math.round(bx)}px, ${Math.round(by)}px)`;
    });
  }
  function placeBannerValues() {
    if (!S.banners) return;
    const R = S.run, ch = curHour();
    S.banners.forEach((el, ti) => {
      const v = el.querySelector("[data-bv]");
      let txt = "", state = "";
      if (R) {
        const uns = R.res.hrUns[ch.k * 4 + ti];
        const dm = demand(ti, ch.h, R.res.wx[ch.d].hot, R.res.pol);
        txt = `${fmt(dm, 1)} MW`;
        state = uns > 0.05 ? "out" : "ok";
      } else if (S.result) {
        txt = `${S.result.town[ti].outH}h`;
        state = S.result.town[ti].outH > 0 ? "out" : "ok";
      } else {
        const n = S.net.nodes.find(nd => nd.kind === "town" && nd.ti === ti);
        state = n && n.live ? "ok" : "off";
        txt = n && n.live ? "" : "선 없음";
      }
      if (v.textContent !== txt) { v.textContent = txt; S.bannerKey = ""; }
      if (el.dataset.state !== state) el.dataset.state = state;
    });
  }

  /* ---------- 말풍선(타일 정보) ---------- */
  function showTip(i) {
    const el = $("#bd-tip");
    if (!el || S.run) return;
    const T = TILES[i];
    let verdict = "";
    if (S.tool && S.tool !== "line" && S.tool !== "remove") {
      const c = canPlace(S.tool, i);
      verdict = c.ok ? `<p class="ok">${ico("check")}${BLD[S.tool].name} ${fmt(c.cost)}억${c.clear ? " · 숲 정리" : ""}${S.sel === i ? " · 한 번 더" : ""}</p>` : `<p class="no">${ico("x")}${esc(c.why)}</p>`;
    } else if (S.tool === "line") {
      const P = S.pending || S.preview;
      if (S.lineStart == null) verdict = validStart(i) ? `<p class="ok">${ico("line")}여기서 시작</p>` : `<p class="no">${ico("x")}시작: 발전소·마을·선</p>`;
      else if (P && P.end === i) verdict = `<p class="ok">${ico("line")}${P.p.length - 1}칸 · ${fmt(P.cost, 1)}억</p>`;
    } else if (S.tool === "remove") {
      const b = S.st.builds.find(x => x.i === i);
      verdict = b ? `<p class="ok">${ico("remove")}${BLD[b.t].name} +${fmt(buildCost(b.t, i))}억</p>` : onLine(i) ? `<p class="ok">${ico("remove")}송전선 철거</p>` : "";
    }
    const name = T.town >= 0 ? `${TOWNS[T.town].id} ${TOWNS[T.town].name}` : TNAME[T.t];
    const b = S.st.builds.find(x => x.i === i);
    el.innerHTML = `<p class="bd-tip-h"><b>${esc(name)}</b>${b ? `<span>${BLD[b.t].name}</span>` : ""}${T.t === "mount" ? "<span>선 ×2</span>" : !T.land ? "<span>선 ×3</span>" : ""}</p>` +
      (T.land ? `<p class="bd-tip-row"><span>${ico("sun")}×${T.sun.toFixed(2)}</span><span>${ico("wind")}${T.wind.toFixed(1)} m/s</span><span>${ico("people")}${fmt(T.near)}</span></p>` : "") + verdict;
    el.hidden = false;
    const [x, y] = tileTop(T);
    const w = el.offsetWidth, h = el.offsetHeight;
    let tx = x + V.S * 0.8, ty = y - h - V.S * 0.5;
    if (tx + w > V.W - 8) tx = x - w - V.S * 0.8;
    tx = clamp(tx, 8, V.W - w - 8);
    ty = clamp(ty, V.area.t, V.H - h - 8);
    el.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px)`;
  }
  function hideTip() { const el = $("#bd-tip"); if (el) el.hidden = true; }

  function showConfirm() {
    const el = $("#bd-confirm");
    if (!el) return;
    if (S.pending) {
      const P = S.pending, ok = P.cost <= budgetLeft() + 1e-9;
      el.innerHTML = `<span class="bd-cf-t">${ico("line")}<b>${P.p.length - 1}칸</b><span class="num">${fmt(P.cost, 1)}억</span>${ok ? "" : '<span class="bd-cf-no">예산 부족</span>'}</span>
        <button type="button" class="bd-cf-ok" id="bd-cf-ok"${ok ? "" : " disabled"}>${ico("check")}<span>연결</span></button>
        <button type="button" class="bd-cf-no-btn" id="bd-cf-x">${ico("x")}<span>취소</span></button>`;
      el.hidden = false;
      el.querySelector("#bd-cf-ok").onclick = confirmLine;
      el.querySelector("#bd-cf-x").onclick = () => { cancelLine(); S.canvas.focus({ preventScroll: true }); };
    } else if (S.lineStart != null) {
      const P = S.preview;
      el.innerHTML = `<span class="bd-cf-t">${ico("line")}<b>끝점 선택</b>${P ? `<span class="num">${P.p.length - 1}칸 · ${fmt(P.cost, 1)}억</span>` : ""}</span>
        <button type="button" class="bd-cf-no-btn" id="bd-cf-x">${ico("x")}<span>취소</span></button>`;
      el.hidden = false;
      el.querySelector("#bd-cf-x").onclick = () => { cancelLine(); S.canvas.focus({ preventScroll: true }); };
    } else { el.hidden = true; el.innerHTML = ""; }
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $("#bd-toast");
    if (!el) return;
    el.textContent = msg;
    el.dataset.show = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (S && S.alive) { const e2 = $("#bd-toast"); if (e2) e2.dataset.show = "false"; } }, 2200);
    S.timers.push(toastTimer);
  }
  function announce(msg) { const el = $("#bd-live"); if (el) el.textContent = msg; }
  function updateAria() {
    const live = S.net.nodes.filter(n => n.kind === "town" && n.live).length;
    const counts = {};
    S.st.builds.forEach(b => { counts[b.t] = (counts[b.t] || 0) + 1; });
    const parts = Object.keys(counts).map(k => `${BLD[k].name} ${counts[k]}`);
    const lbl = `섬 지도. ${parts.length ? parts.join(", ") : "건물 없음"}, 송전선 ${S.st.lines.length}개. 전기가 닿는 마을 ${live}/4. 예산 잔액 ${fmt(budgetLeft(), 1)}억.` +
      (S.result ? ` 최근 운영: 정전 ${S.result.outTotal}시간, CO₂ ${fmt(S.result.co2)} t.` : "");
    S.canvas.setAttribute("aria-label", lbl);
  }

  /* ---------- 서랍 ---------- */
  const isMobile = () => (window.matchMedia ? matchMedia("(max-width: 760px)").matches : window.innerWidth <= 760);
  function openDrawer(tab) {
    if (tab) S.drawerTab = tab;
    S.drawerOpen = true;
    html.classList.add("bd-drawer-open");
    $("#bd-pm").setAttribute("aria-expanded", "true");
    renderDrawer();
    S.dirtyLayout = true;
    request();
  }
  function closeDrawer(silent) {
    S.drawerOpen = false;
    html.classList.remove("bd-drawer-open");
    $("#bd-pm").setAttribute("aria-expanded", "false");
    S.dirtyLayout = true;
    request();
    if (!silent) $("#bd-pm").focus({ preventScroll: true });
  }
  function renderDrawer() {
    const body = $("#bd-drawer-body");
    if (!body) return;
    S.root.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === S.drawerTab)));
    S.root.querySelector('[data-count="policy"]').textContent = `${S.st.policies.length}/2`;
    S.root.querySelector('[data-count="mission"]').textContent = `${S.st.missions.length}/2`;
    const tab = S.drawerTab;
    if (tab === "policy") {
      const full = S.st.policies.length >= 2;
      body.innerHTML = `<p class="bd-sub">${ico("cards")}정책 카드 <b>최대 2장</b></p>
        <div class="bd-cards">${POLICIES.map(P => {
          const onP = S.st.policies.includes(P.id);
          return `<button type="button" class="bd-card" data-pol="${P.id}" aria-pressed="${onP}"${!onP && full ? " disabled" : ""}>
            <span class="bd-card-ico">${ico(P.icon)}</span>
            <span class="bd-card-txt"><b>${P.name}</b><span>${P.eff}</span></span>
            <span class="bd-card-cost num">${P.cost}</span></button>`;
        }).join("")}</div>`;
    } else if (tab === "mission") {
      body.innerHTML = `<p class="bd-sub">${ico("flag")}이번 운영 미션 <b>2개</b></p>
        <div class="bd-cards">${MISSIONS.map(m => {
          const onM = S.st.missions.includes(m.id);
          return `<button type="button" class="bd-card mis" data-mis="${m.id}" aria-pressed="${onM}"${!onM && S.st.missions.length >= 2 ? " disabled" : ""}>
            <span class="bd-card-ico">${ico(m.icon)}</span>
            <span class="bd-card-txt"><b>${m.name}</b><span>${m.goal()}</span></span>
            <span class="bd-card-mark" aria-hidden="true">${onM ? ico("check") : ""}</span></button>`;
        }).join("")}</div>
        <p class="bd-note">고른 2개만 성공·실패를 따진다. 나머지는 '대신 잃은 것'으로 본다.</p>`;
    } else body.innerHTML = renderResult();
    if (tab === "result" && S.result) {
      const q = body.querySelector("#bd-q"), again = body.querySelector("#bd-again"), rr = body.querySelector("#bd-reroll");
      if (q) q.onclick = () => openQuestions(q);
      if (again) again.onclick = rebuild;
      if (rr) rr.onclick = () => { S.st.seed = (S.st.seed % 99991) + 1; saveState(S.st); toast(`다른 날씨(시드 ${S.st.seed})`); rebuild(); };
    }
  }
  function satBar(v) {
    const tone = v >= 70 ? "ok" : v >= 40 ? "mid" : "bad";
    return `<span class="bd-sat" data-tone="${tone}"><span style="width:${v}%"></span></span><b class="num">${v}</b>`;
  }
  function renderResult() {
    const R = S.result;
    if (!R) return `<div class="bd-empty">${ico("play", "v2-ico bd-empty-ico")}<p><b>아직 운영 기록 없음</b></p><p>아래 1주·1달·3달을 누르면 결과가 여기 뜬다.</p></div>`;
    const len = R.days === 7 ? "1주" : R.days === 30 ? "1달" : "3달";
    const chosen = R.missions.filter(m => m.chosen), others = R.missions.filter(m => !m.chosen);
    const lostElse = others.filter(m => !m.ok);
    return `<h2 class="bd-res-title" id="bd-res-title" tabindex="-1">${len} 운영 성적표 <span class="bd-tag">가상 모형 · 시드 ${R.seed}</span></h2>
      <ul class="bd-news">${R.news.map(t => `<li>${ico("news")}<span>${esc(t)}</span></li>`).join("")}</ul>
      <div class="bd-mis">${chosen.map(m => `<p class="bd-mis-row" data-ok="${m.ok}"><span class="bd-mis-mark" aria-label="${m.ok ? "성공" : "실패"}">${ico(m.ok ? "check" : "x")}</span><b>${m.name}</b><span class="num">${esc(m.val)}</span></p>`).join("")}
        ${lostElse.length ? `<p class="bd-trade"><b>대신 잃은 것</b> ${lostElse.map(m => esc(m.val)).join(" · ")}</p>` : `<p class="bd-trade"><b>대신 잃은 것</b> 없음 — 다른 목표도 지켰다</p>`}</div>
      <div class="bd-kpis">
        <p><span>총비용</span><b class="num">${fmt(R.cost.total, 1)}억</b><small>건설 ${fmt(R.cost.capex, 1)} + 연료 ${fmt(R.cost.fuel, 1)} + 정책 ${fmt(R.cost.policy, 1)}</small></p>
        <p><span>CO₂</span><b class="num">${fmt(R.co2)} t</b><small>디젤 ${fmt(R.tot.diesel)} MWh</small></p>
        <p><span>버린 전력</span><b class="num">${fmt(R.tot.curt)} MWh</b><small>송전 손실 ${fmt(R.tot.loss)} MWh</small></p>
      </div>
      <table class="bd-towns"><thead><tr><th scope="col">마을</th><th scope="col">정전</th><th scope="col">못 받은 전력</th><th scope="col">만족</th></tr></thead>
        <tbody>${TOWNS.map((W, ti) => `<tr><th scope="row"><span class="bd-bn-code">${W.id}</span>${esc(W.name)}</th><td class="num${R.town[ti].outH ? " bad" : ""}">${R.town[ti].outH}h</td><td class="num">${fmt(R.town[ti].uns, 1)} MWh</td><td class="bd-sat-cell">${satBar(R.sat[ti])}</td></tr>`).join("")}</tbody></table>
      <div class="bd-res-acts">
        <button type="button" class="v2-btn" id="bd-again">${ico("hammer")}<span>다시 짓기</span></button>
        <button type="button" class="v2-btn primary" id="bd-q">${ico("mic")}<span>면접관 질문 3개</span></button>
        <button type="button" class="v2-btn bd-reroll" id="bd-reroll">${ico("reroll")}<span>다른 날씨</span></button>
      </div>`;
  }
  function rebuild() {
    S.result = null;
    S.drawerTab = "policy";
    if (isMobile()) closeDrawer(true); else renderDrawer();
    refreshHUD(); placeBannerValues(); updateAria();
    S.dirtyStatic = true;
    request();
    const first = S.root.querySelector('[data-tool="solar"]');
    if (first) first.focus({ preventScroll: true });
  }

  /* ---------- 큰 창: 도움말, 면접관 질문 ---------- */
  function makeDialog(id, kicker, title) {
    if (KCP.v2 && KCP.v2.dialog) {
      const d = KCP.v2.dialog({ id, kicker, title, className: "bd-modal" });
      S.root.append(d.el);
      return d;
    }
    return null;
  }
  function openHelp(from) {
    if (!S.help) {
      S.help = makeDialog("bd-help-dlg", "HOW TO PLAY", "섬 전력망 건설");
      if (!S.help) return;
      S.help.body.innerHTML = `<ol class="bd-steps">
          <li>${ico("hammer")}<b>짓기</b><span>도구 → 타일</span></li>
          <li>${ico("line")}<b>잇기</b><span>발전소 ↔ 마을</span></li>
          <li>${ico("cards")}<b>고르기</b><span>정책 ≤2 · 미션 2</span></li>
          <li>${ico("play")}<b>돌리기</b><span>1주·1달·3달</span></li>
        </ol>
        <h3 class="bd-h3">${ico("help")}팁</h3>
        <ul class="bd-tiplist">${TIPS.slice(0, 6).map(t => `<li>${esc(t)}</li>`).join("")}</ul>
        <details class="bd-model"><summary>가상 모형 숫자</summary>
          <ul>
            <li>태양광 2 MW × 일사(맑음 1 · 흐림 0.45 · 비 0.2) × 타일 계수</li>
            <li>풍력 2 MW × (풍속/12)³, 25 m/s 넘으면 정지</li>
            <li>디젤 3 MW(켜면 최소 1 MW) · CO₂ 0.75 t/MWh · 연료 0.01억/MWh</li>
            <li>배터리 4 MW/16 MWh · 충전·방전 각 95% · 바닥 10%</li>
            <li>송전 손실 1.5%/칸 · 선 0.5억/칸(산 ×2 · 바다 ×3)</li>
            <li>모자라면 F4 → F3 → F2 → F1 순으로 끊는다</li>
          </ul>
          <p>연습용으로 단순하게 만든 수치다. 실제 섬 전력망 자료가 아니다.</p>
        </details>`;
    }
    S.help.open(from);
  }
  function openQuestions(from) {
    const R = S.result;
    if (!R) return;
    if (!S.qdlg) S.qdlg = makeDialog("bd-q-dlg", "INTERVIEW", "면접관 질문 3개");
    if (!S.qdlg) return;
    S.qdlg.body.innerHTML = `<ol class="bd-qs">${R.questions.map((q, k) => `<li>
        <p class="bd-q">${esc(q.q)}</p>
        <button type="button" class="bd-hint-btn" aria-expanded="false" aria-controls="bd-hint-${k}">${ico("help")}<span>힌트</span></button>
        <ul class="bd-hint" id="bd-hint-${k}" hidden>${q.hints.map((h, j) => `<li><b>${HINT_STYLE[j]}</b>${esc(h)}</li>`).join("")}</ul></li>`).join("")}</ol>
      <p class="bd-note">답은 결론 한 줄 → 근거 숫자 두세 개 → 얻고 잃는 것 순서로.</p>`;
    S.qdlg.body.querySelectorAll(".bd-hint-btn").forEach(b => {
      b.onclick = () => {
        const open = b.getAttribute("aria-expanded") !== "true";
        b.setAttribute("aria-expanded", String(open));
        S.qdlg.body.querySelector("#" + b.getAttribute("aria-controls")).hidden = !open;
      };
    });
    S.qdlg.open(from);
  }

  /* ---------- 배치 계산 ---------- */
  function layout() {
    S.dirtyLayout = false;
    const W = window.innerWidth, H = window.innerHeight;
    V.W = W; V.H = H;
    S.g = (KCP.v2 && KCP.v2.fit) ? KCP.v2.fit(S.canvas, W, H) : S.canvas.getContext("2d");
    const hud = $("#bd-hud").getBoundingClientRect();
    const bar = $("#bd-mapbar").getBoundingClientRect();
    const dock = $("#bd-dock").getBoundingClientRect();
    const mob = isMobile();
    html.style.setProperty("--bd-top", `${Math.round(hud.bottom + 8)}px`);
    html.style.setProperty("--bd-dock", `${Math.round(H - $("#bd-dock").getBoundingClientRect().top)}px`);
    let r = W - 8;
    if (S.drawerOpen && !mob) { const dr = $("#bd-drawer").getBoundingClientRect(); if (dr.width) r = dr.left - 8; }
    V.area = { l: 8, t: Math.max(hud.bottom, bar.bottom) + 6, r, b: (dock.height ? dock.top : H) - 6 };
    fitView();
    const wc = $("#bd-windchip svg");
    if (wc) wc.style.transform = V.rot ? "rotate(90deg)" : "";
    S.dirtyStatic = true;
    S.bannerKey = "";
    if (S.hover != null && !S.run) showTip(S.hover);
  }
  function setLayer(id) {
    S.layer = id;
    S.root.querySelectorAll("[data-layer]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.layer === id)));
    const lg = $("#bd-legend");
    if (id === "map") { lg.hidden = true; }
    else {
      const R = RAMPS[id], lab = id === "sun" ? ["×0.6", "×1.0", "일사 계수"] : id === "wind" ? ["4", "9 m/s", "평균 풍속"] : ["적음", "많음", "주민"];
      lg.innerHTML = `<span class="bd-lg-k">${lab[2]}</span><span class="num">${lab[0]}</span><span class="bd-lg-bar" style="background:linear-gradient(90deg,${R.map(c => rgb(c)).join(",")})"></span><span class="num">${lab[1]}</span>`;
      lg.hidden = false;
    }
    S.dirtyStatic = true;
    S.dirtyLayout = true;
    request();
  }

  /* =====================================================================
   * 9. 라우트
   * ===================================================================== */
  function teardown() {
    if (!S) return;
    S.alive = false;
    if (S.raf) cancelAnimationFrame(S.raf);
    S.timers.forEach(t => clearTimeout(t));
    S.off.forEach(f => f());
    if (S.ro) S.ro.disconnect();
    [S.help, S.qdlg].forEach(d => { if (d) d.close(); });
    html.classList.remove("bd-on", "bd-running", "bd-drawer-open");
    html.style.removeProperty("--bd-top");
    html.style.removeProperty("--bd-dock");
    S = null;
  }
  KCP.on("route:change", teardown);
  // 검사용 읽기 도구: 화면 위 타일 좌표, 살아 있는지
  KCP.buildGame.tileXY = (c, r) => (S ? tileTop(TILES[tix(c, r)]) : null);
  KCP.buildGame.active = () => !!S;

  KCP.route("build", app => {
    teardown();
    document.title = "섬 전력망 건설 · 켄텍 창의성 면접 연습실";
    html.classList.add("bd-on");
    const st = loadState();
    const root = shell(app);
    S = {
      alive: true, root, st, net: network(st), canvas: root.querySelector("#bd-canvas"), base: document.createElement("canvas"),
      g: null, raf: 0, born: performance.now(), off: [], timers: [], ro: null, layer: "map", tool: null, hover: null, kbd: false, sel: null,
      lineStart: null, pending: null, preview: null, run: null, result: null, drawerOpen: false, drawerTab: "policy",
      floaters: [], rec: { hubs: [], stacks: [], wins: [], pylons: new Map() }, dirtyStatic: true, dirtyLayout: true, banners: null, bannerKey: "",
      tipSeq: 0, lastTick: "", help: null, qdlg: null, runNet: { dk: {} }
    };
    V.zoom = 1; V.panX = 0; V.panY = 0; V.lastRot = -1;
    buildBanners();
    bindCanvas(S.canvas);
    root.querySelectorAll("[data-tool]").forEach(b => on(b, "click", () => setTool(b.dataset.tool)));
    root.querySelectorAll("[data-layer]").forEach(b => on(b, "click", () => setLayer(b.dataset.layer)));
    root.querySelectorAll("[data-zoom]").forEach(b => on(b, "click", () => {
      const steps = [1, 1.5, 2.2], k = steps.indexOf(V.zoom);
      const nk = clamp((k < 0 ? 0 : k) + +b.dataset.zoom, 0, steps.length - 1);
      V.zoom = steps[nk];
      if (V.zoom === 1) { V.panX = 0; V.panY = 0; }
      S.dirtyLayout = true; hideTip(); request();
    }));
    root.querySelectorAll("[data-run]").forEach(b => on(b, "click", () => startRun(+b.dataset.run)));
    root.querySelectorAll("[data-tab]").forEach(b => on(b, "click", () => { S.drawerTab = b.dataset.tab; renderDrawer(); }));
    on(root.querySelector("#bd-pm"), "click", () => (S.drawerOpen ? closeDrawer() : openDrawer()));
    on(root.querySelector("#bd-drawer-x"), "click", () => closeDrawer());
    on(root.querySelector("#bd-help"), "click", e => openHelp(e.currentTarget));
    on(root.querySelector("#bd-skip"), "click", () => { if (S.run) finishRun(); });
    on(root.querySelector("#bd-drawer-body"), "click", e => {
      const p = e.target.closest("[data-pol]"), m = e.target.closest("[data-mis]");
      if (p && !p.disabled) {
        const id = p.dataset.pol, list = S.st.policies;
        if (list.includes(id)) list.splice(list.indexOf(id), 1); else if (list.length < 2) list.push(id);
        changed(); S.root.querySelector(`[data-pol="${id}"]`).focus({ preventScroll: true });
      } else if (m && !m.disabled) {
        const id = m.dataset.mis, list = S.st.missions;
        if (list.includes(id)) list.splice(list.indexOf(id), 1); else if (list.length < 2) list.push(id);
        changed(); S.root.querySelector(`[data-mis="${id}"]`).focus({ preventScroll: true });
      }
    });
    on(document, "keydown", e => {
      if (e.key !== "Escape" || !S || e.defaultPrevented) return;
      if (document.querySelector("dialog[open]")) return;
      if (S.drawerOpen && isMobile()) { closeDrawer(); e.preventDefault(); }
    });
    on(window, "resize", () => { S.dirtyLayout = true; request(); });
    on(document, "visibilitychange", () => request());
    if (window.ResizeObserver) { S.ro = new ResizeObserver(() => { if (S) { S.dirtyLayout = true; request(); } }); S.ro.observe(root.querySelector("#bd-hud")); S.ro.observe(root.querySelector("#bd-dock")); S.ro.observe(root.querySelector("#bd-drawer")); }
    renderDrawer();
    refreshHUD();
    placeBannerValues();
    updateAria();
    setLayer("map");
    layout();
    request();
  });
})();
