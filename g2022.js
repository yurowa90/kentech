/* 2022학년도: 미션 켄텍 (발전소 배치) */
(function () {
  const KCP = window.KCP;
  const esc = KCP.esc;

  const ROWS = "ABCDEFGHIJ".split("");
  const TERR = [
    "~~~~~~~~~~",
    "~...~~...~",
    "~...~~...~",
    "~...~~...~",
    "~...~~~~~~",
    "~........~",
    "~....oo..~",
    "~........~",
    "~........~",
    "~~~~~~~~~~",
  ];
  const FEAT = {
    A3: "whale", A8: "fish", A9: "fish", A10: "oil", B4: "oil", B8: "farm", B9: "V배멧", B10: "fish",
    C1: "fish", C2: "farm", C3: "mtn", C6: "whale", C9: "heritage", C10: "fish", D1: "fish", D2: "V참살이", D3: "mtn",
    E1: "fish", E2: "mtn", E3: "mtn", F3: "farm", F4: "farm", F5: "oil", F7: "deer", G3: "farm", G4: "V빛가람", G8: "deer",
    H3: "mtn", H4: "mtn", H5: "mtn", H6: "mtn", I2: "bird", I3: "bird", I4: "bird", I5: "bird", I6: "bird",
    J3: "whale", J4: "whale", J6: "whale",
  };
  const FNAME = { whale: ["고", "야생동물 서식지(고래)"], fish: ["어", "물고기 서식지"], oil: ["유", "유전"], farm: ["농", "농경지"], mtn: ["산", "산악지대"], heritage: ["문", "문화재"], deer: ["동", "야생동물 서식지(사슴)"], bird: ["새", "야생동물 서식지(새)"] };
  const VILL = {
    배멧: { cell: "B9", need: 60, desc: "어족이 풍부한 해안가에 위치하여 어업과 농업이 발달했다. 출산율이 높은 편이지만 젊은 층의 인구 유출이 많이 일어나고 있다. 지난 KENTECH 시의원 선거 때 투표율은 40% 수준이다. 주민들은 건강에 관심이 많다." },
    참살이: { cell: "D2", need: 80, desc: "광물 산업과 어업 중심 사회이나, 갈수록 어획량이 줄어들어 새로운 산업적 활로 개척이 필요하다. 마을의 인구는 수 년 간 변화가 없고, 지난 KENTECH 시의원 선거 때 투표율은 60% 수준이다. 주민들은 산에서 야생 동물 사냥을 즐긴다." },
    빛가람: { cell: "G4", need: 100, desc: "내륙에 위치하고 자연경관이 아름다워 관광업과 농업이 발달했다. 지난 KENTECH 시의원 선거 때 투표율은 80% 수준이다. 자연을 보전하여 관광업을 유지하려는 사람들과 자연을 개발해서 더 많은 수익을 얻으려는 사람들이 대립중이다." },
  };
  const VCELL = Object.fromEntries(Object.entries(VILL).map(([n, v]) => [v.cell, n]));
  const SOLAR = [5, 5, 10, 10, 10, 15, 15, 15, 20, 20];
  const WIND = [
    "20 20 20 20 20 20 20 20 20 20",
    "20 10 10 10 20 20 10 10 10 20",
    "20 10 15 10 15 15 10 5 10 20",
    "20 10 15 10 15 15 10 10 10 20",
    "20 15 15 10 15 15 15 15 20 20",
    "20 10 5 10 10 10 10 10 10 20",
    "20 10 5 5 5 5 5 5 10 20",
    "20 10 15 15 15 15 5 5 10 20",
    "20 10 10 10 10 10 10 10 10 20",
    "20 20 20 20 20 20 20 20 20 20",
  ].map((r) => r.split(" ").map(Number));
  const WDIR = [
    "S SW SW SW S S SW SW SW SW", "S SW SW SW S S SW SW SW SW", "S SW S SW S S SW SW SW SW", "S SW S SW S S SW SW SW SW",
    "S SW W SW S S SW SW SW SW", "S SW SW SW SW SW SW SW SW SW", "S SW W W W W SW SW SW SW", "S SW W W W W SW SW SW SW",
    "S SW SW SW SW SW SW SW SW SW", "S W W W W W W W W W",
  ].map((r) => r.split(" "));
  const ROT = { S: 0, SW: 45, W: 90, N: 180, E: -90 };
  const ARROW = new Proxy({}, { get: (_, d) => (d === "NS" ? '<span class="arr">↕</span>' : `<span class="arr" style="transform:rotate(${ROT[d]}deg)">↓</span>`) });
  const CURR = {};
  "A1 A2 A3 A4".split(" ").forEach((c) => (CURR[c] = "E"));
  "A5 A6".split(" ").forEach((c) => (CURR[c] = "S"));
  "A7 A8 A9 A10".split(" ").forEach((c) => (CURR[c] = "W"));
  "B1 C1 D1 E1 F1 G1 H1 I1 J1".split(" ").forEach((c) => (CURR[c] = "N"));
  "B10 C10 D10".split(" ").forEach((c) => (CURR[c] = "N"));
  CURR.E10 = "NS";
  "F10 G10 H10 I10".split(" ").forEach((c) => (CURR[c] = "S"));
  "J2 J3 J4 J5 J6 J7 J8 J9 J10".split(" ").forEach((c) => (CURR[c] = "W"));
  "B5 C5 D5 B6 C6 D6".split(" ").forEach((c) => (CURR[c] = "S"));
  "E5 E6 E7 E8 E9".split(" ").forEach((c) => (CURR[c] = "E"));

  const PT = {
    fossil: { n: "화석 연료 발전소", s: "화", out: 60, cost: 15 },
    nuclear: { n: "원자력 발전소", s: "원", out: 90, cost: 15 },
    wind: { n: "풍력 발전소", s: "풍", cost: 2 },
    solar: { n: "태양광 발전소", s: "태", cost: 2 },
  };
  const CARDS = [
    ["화석 연료 발전소", "유전으로부터 채굴 및 정제한 화석연료를 이용하여 전기 에너지를 생산한다.", "유전이 위치한 좌표에만 설치할 수 있다.", "많은 양의 온실가스와 미세먼지를 발생시킨다. 미세먼지는 바람을 따라 이동한다."],
    ["원자력 발전소", "원자핵이 분열할 때 발생하는 열을 이용하여 전기 에너지를 생산한다.", "육상에만 설치할 수 있으며, 냉각을 위해 주변에 물이 있어야 한다.", "온실가스와 미세먼지를 거의 발생시키지 않는다. 사고시 방사성 물질이 유출되면 바람과 해류를 따라 이동하고, 유출지점에 가까울 수록 영향이 크다. 생물체가 방사성 물질에 지나치게 노출될 경우 치명적인 손상을 입을 수 있다."],
    ["풍력 발전소", "자연적으로 부는 바람을 이용하여 전기 에너지를 생산한다. 풍속이 클수록 전기 에너지 생산량이 크다.", "육상 및 해상에 모두 설치 가능하다.", "온실가스와 미세먼지를 거의 발생시키지 않는다."],
    ["태양광 발전소", "태양의 빛에너지를 이용하여 전기 에너지를 생산한다. 일사량이 클수록 전기 에너지 생산량이 크다.", "육상 및 해상에 모두 설치 가능하다.", "온실가스와 미세먼지를 거의 발생시키지 않는다."],
  ];

  /* 좌표 도구 */
  const rc = (id) => [ROWS.indexOf(id[0]), Number(id.slice(1)) - 1];
  const idOf = (r, c) => (r >= 0 && r < 10 && c >= 0 && c < 10 ? ROWS[r] + (c + 1) : null);
  const terr = (id) => { const [r, c] = rc(id); return { "~": "sea", ".": "land", o: "lake" }[TERR[r][c]]; };
  const out = (type, id) => { const [r, c] = rc(id); return type === "wind" ? WIND[r][c] : type === "solar" ? SOLAR[r] : PT[type].out; };
  const orth = (id) => { const [r, c] = rc(id); return [idOf(r - 1, c), idOf(r + 1, c), idOf(r, c - 1), idOf(r, c + 1)].filter(Boolean); };
  const around = (id) => { const [r, c] = rc(id); const o = []; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const x = idOf(r + dr, c + dc); if (x && x !== id) o.push(x); } return o; };
  const dist = (a, b) => { const [r1, c1] = rc(a); const [r2, c2] = rc(b); return Math.abs(r1 - r2) + Math.abs(c1 - c2); };
  const step = (id, dir) => { const [r, c] = rc(id); const d = { S: [1, 0], SW: [1, -1], W: [0, -1], N: [-1, 0], E: [0, 1] }[dir]; return idOf(r + d[0], c + d[1]); };

  function canPlace(type, id) {
    if (VCELL[id]) return "마을 좌표에는 발전소를 지을 수 없습니다 (연습실 규칙)";
    if (type === "fossil" && FEAT[id] !== "oil") return "화석 연료 발전소는 유전이 위치한 좌표에만 설치할 수 있습니다";
    if (type === "nuclear") {
      if (terr(id) !== "land") return "원자력 발전소는 육상에만 설치할 수 있습니다";
      if (!orth(id).some((n) => terr(n) !== "land")) return "원자력 발전소는 냉각을 위해 주변에 물이 있어야 합니다 (연습실 판정: 상하좌우 칸에 바다나 호수)";
    }
    return "";
  }

  function smog(id) {
    const path = [];
    let cur = id;
    for (let i = 0; i < 4; i++) {
      const [r, c] = rc(cur);
      cur = step(cur, WDIR[r][c]);
      if (!cur) break;
      path.push(cur);
    }
    return path;
  }
  function currentTrace(id) {
    const starts = orth(id).filter((n) => terr(n) === "sea");
    const seen = new Set();
    const q = starts.slice();
    while (q.length && seen.size < 60) {
      const c = q.shift();
      if (seen.has(c) || terr(c) !== "sea") continue;
      seen.add(c);
      const d = CURR[c];
      if (!d) continue;
      (d === "NS" ? ["N", "S"] : [d]).forEach((dd) => { const n = step(c, dd); if (n && !seen.has(n)) q.push(n); });
    }
    return Array.from(seen);
  }

  function analyze(plants) {
    const warn = [];
    const hit = new Set();
    plants.forEach((p) => {
      const f = FEAT[p.cell];
      const tag = `${PT[p.type].n} ${p.cell}`;
      if (p.type === "fossil") {
        const path = smog(p.cell);
        path.forEach((c) => hit.add(c));
        const vs = new Set();
        path.forEach((c) => { if (VCELL[c]) vs.add(VCELL[c]); around(c).forEach((n) => VCELL[n] && vs.add(VCELL[n])); });
        warn.push({ lv: "bad", t: `${tag}: 온실가스와 미세먼지를 많이 배출합니다.${vs.size ? ` 바람을 따라 미세먼지가 ${Array.from(vs).join(", ")} 마을로 향합니다.` : ""}` });
      }
      if (p.type === "nuclear") {
        const air = smog(p.cell);
        const sea = currentTrace(p.cell);
        air.forEach((c) => hit.add(c));
        sea.forEach((c) => hit.add("~" + c));
        const fishHit = sea.filter((c) => FEAT[c] === "fish" || FEAT[c] === "whale").length;
        const coast = new Set();
        sea.forEach((c) => orth(c).forEach((n) => VCELL[n] && coast.add(VCELL[n])));
        air.forEach((c) => { if (VCELL[c]) coast.add(VCELL[c]); around(c).forEach((n) => VCELL[n] && coast.add(VCELL[n])); });
        const near = Object.entries(VILL).filter(([, v]) => dist(v.cell, p.cell) <= 3).map(([n]) => n);
        let t = `${tag}: 사고가 나면 방사성 물질이 바람과 해류를 따라 이동합니다.`;
        if (sea.length) t += ` 해류가 ${sea.length}개 해역을 지나며 어장·고래 서식 해역 ${fishHit}곳에 닿습니다.`;
        else if (orth(p.cell).some((n) => terr(n) === "lake")) t += " 냉각수를 호수에서 끌어와 호수와 주변 농경·관광에 영향이 갑니다.";
        if (coast.size) t += ` 영향권 마을: ${Array.from(coast).join(", ")}.`;
        if (near.length) t += ` 유출 지점에서 가까운 마을(3칸 이내): ${near.join(", ")}.`;
        warn.push({ lv: coast.size || near.length ? "bad" : "warn", t });
      }
      if (f && FNAME[f] && f !== "oil") warn.push({ lv: "warn", t: `${tag}: ${FNAME[f][1]}에 설치했습니다.${f === "bird" && p.type === "wind" ? " 풍력 날개에 새가 부딪칠 수 있습니다." : ""}${f === "fish" ? " 주민들의 어업 활동 구역입니다." : ""}${f === "mtn" ? " 산림을 훼손하고 건설이 어렵습니다." : ""}` });
      if (terr(p.cell) === "lake") warn.push({ lv: "warn", t: `${tag}: 호수에 설치했습니다. 호수 생태와 빛가람 마을 관광에 영향을 줄 수 있습니다.` });
    });
    return { warn, hit };
  }

  const own = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);
  const isCell = c => typeof c === "string" && /^[A-J](10|[1-9])$/.test(c);
  const record = o => o && typeof o === "object" && !Array.isArray(o) ? o : {};
  const edgeKey = (a, b) => [a, b].sort().join(":");
  function wireEdges(raw) {
    const edges = new Map();
    (Array.isArray(raw) ? raw : []).forEach(e => {
      if (Array.isArray(e) && e.length === 2 && e.every(isCell) && dist(e[0], e[1]) === 1) {
        edges.set(edgeKey(...e), e.slice().sort());
      }
    });
    return [...edges.values()];
  }

  // kcp:v1:2022의 공통 저장 봉투는 유지하고 game.wireVersion=2로 전선 형식을 식별한다.
  // 옛 저장에는 경로가 없으므로 배치와 연결 마을만 보존한다. 경로를 임의 생성하지 않는다.
  function normalizeGame(raw) {
    const R = record(raw);
    let repaired = (R.q1 != null && record(R.q1) !== R.q1) ||
      (R.r1 != null && record(R.r1) !== R.r1) || (R.q2text != null && typeof R.q2text !== "string");
    const G = { ...R, mode: R.mode === "q2" ? "q2" : "q1",
      overlay: ["map", "solar", "wind", "current"].includes(R.overlay) ? R.overlay : "map",
      tool: own(PT, R.tool) || ["erase", "wire", "unwire"].includes(R.tool) ? R.tool : "wind",
      q1: {}, r1: {}, q2: [], q2text: typeof R.q2text === "string" ? R.q2text : "",
      wireVersion: 2, wires: wireEdges(R.wireVersion === 2 ? R.wires : []),
      wireNotice: ["migrated", "repaired"].includes(R.wireNotice) ? R.wireNotice : "" };
    if (R.twist !== undefined) {
      const t = record(R.twist);
      G.twist = { k: own(TWIST22, t.k) ? t.k : "",
        line: typeof t.line === "string" ? t.line.slice(0, 140) : "",
        keep: typeof t.keep === "string" ? t.keep.slice(0, 140) : "" };
    }
    const used1 = new Set(), used2 = new Set();
    Object.keys(PT).forEach(type => {
      const c = record(R.q1)[type];
      if (isCell(c) && !canPlace(type, c) && !used1.has(c)) { G.q1[type] = c; used1.add(c); }
      else if (c != null && c !== "") repaired = true;
      const reason = record(R.r1)[type];
      if (typeof reason === "string") G.r1[type] = reason;
    });
    (Array.isArray(R.q2) ? R.q2 : []).forEach(p => {
      if (!p || !own(PT, p.type) || !isCell(p.cell) || canPlace(p.type, p.cell) || used2.has(p.cell)) return;
      used2.add(p.cell);
      if (p.to != null && p.to !== "" && !own(VILL, p.to)) repaired = true;
      G.q2.push({ type: p.type, cell: p.cell, to: own(VILL, p.to) ? p.to : "" });
    });
    if (R.wireVersion !== 2 && G.q2.length) G.wireNotice = "migrated";
    if (repaired || (R.q2 != null && (!Array.isArray(R.q2) || R.q2.length !== G.q2.length)) ||
        (R.wireVersion === 2 && (!Array.isArray(R.wires) || R.wires.length !== G.wires.length))) G.wireNotice = "repaired";
    return G;
  }
  function g(state) { return (state.game = normalizeGame(state.game)); }

  // 성찰 전용 가정. 원문 예시·좌표를 읽지 않고 학생 계획만 비교한다.
  const TWIST22 = {
    wind: { title: "바람이 약한 날이 이어진다면", condition: "2주 동안 풍속이 평소의 절반이라고 가정한다. 과제 규칙(생산량 = 풍속)에 따라 풍력 생산량도 절반으로 센다." },
    solar: { title: "장마로 햇빛이 줄어든다면", condition: "장마로 한 달 동안 일사량이 평소의 절반이라고 가정한다. 과제 규칙에 따라 태양광 생산량도 절반으로 센다." },
    fossil: { title: "탄소 배출에 비용이 붙는다면", condition: "탄소 배출 비용을 더해 화석 연료 발전소 1기당 발전 비용이 15에서 30으로 오른다고 가정한다." },
    nuclear: { title: "원자력 발전소가 정기 점검에 들어간다면", condition: "정기 점검으로 원자력 발전소가 한 달 동안 모두 멈춘다고 가정한다. 그동안 원자력 생산량은 0으로 센다." },
    demand: { title: "빛가람의 관광객이 늘어난다면", condition: "관광객 증가로 빛가람의 전력 필요량이 100에서 130으로 늘어난다고 가정한다." },
    wire: { title: "전선을 놓는 비용이 오른다면", condition: "전선 1칸당 비용이 1에서 3으로 오른다고 가정한다. 공유 전선과 연결되지 않은 전선도 기존 규칙대로 센다." },
  };

  function twistPlan(G) {
    const q2 = G.q2.length > 0;
    const plants = q2 ? G.q2.map(p => ({ ...p })) : Object.entries(G.q1).map(([type, cell]) => ({ type, cell, to: "" }));
    const wires = q2 ? G.wires.map(e => e.slice()) : [];
    // 생산량이 큰 발전원부터, 동률은 고정 순서. 모든 발전원 후보를 보존한다.
    const keys = ["wind", "solar", "fossil", "nuclear"].filter(k => plants.some(p => p.type === k));
    const production = k => plants.filter(p => p.type === k).reduce((sum, p) => sum + out(p.type, p.cell), 0);
    keys.sort((a, b) => production(b) - production(a));
    if (plants.length) {
      const common = wires.length ? ["wire", "demand"] : ["demand", "wire"];
      // 2번 계획에는 수학적 사고 카드(공통) 하나를 늘 남긴다. 카드는 최대 4장이므로 생산량이 가장 작은 발전원 카드를 뺀다.
      if (q2 && keys.length >= 4) keys.length = 3;
      common.forEach(k => { if (keys.length < 4) keys.push(k); });
    }
    return { q2, plants, wires, keys };
  }

  function twistResult(plan, key) {
    // supply의 연결 판정을 재사용하며 계산 결과만 바꾼다. 저장·지도 자료는 불변이다.
    const before = supply(plan.plants, plan.wires);
    const after = { ...before, got: { ...before.got } };
    const need = Object.fromEntries(Object.entries(VILL).map(([v, data]) => [v, data.need]));
    let produced = 0, changed = 0;
    plan.plants.forEach((p, i) => {
      const amount = out(p.type, p.cell);
      const factor = p.type === key ? (key === "wind" || key === "solar" ? 0.5 : key === "nuclear" ? 0 : 1) : 1;
      produced += amount;
      changed += amount * factor;
      if (before.connected[i]) after.got[p.to] += amount * (factor - 1);
      if (key === "fossil" && p.type === "fossil") after.plantCost += 15;
    });
    if (key === "demand") need.빛가람 = 130;
    const wireCost = before.wire * (key === "wire" ? 3 : 1);
    after.total = after.plantCost + wireCost;
    let html = `<p><b>${esc(TWIST22[key].title)}</b> · 현재 ${plan.q2 ? "2번 계획" : "1번 배치"}에 적용</p>
      <p>전체 생산량: ${produced} → ${changed}</p>`;
    if (plan.q2) {
      html += Object.keys(VILL).map(v => `<p><b>${esc(v)}</b> · 공급 ${before.got[v]} → ${after.got[v]} / 필요 ${VILL[v].need} → ${need[v]} · 부족분 ${Math.max(0, VILL[v].need - before.got[v])} → ${Math.max(0, need[v] - after.got[v])}</p>`).join("");
      html += `<p>총비용: ${before.total} → ${after.total} (변화 ${after.total - before.total >= 0 ? "+" : ""}${after.total - before.total})<br>발전 ${before.plantCost} → ${after.plantCost}, 전선 ${before.wire}칸 비용 ${before.wire} → ${wireCost}</p>`;
    } else {
      html += `<p>1번은 공급 마을·전선을 정하는 계획이 아니므로 마을별 공급과 부족분은 계산하지 않습니다.</p>
        <p>배치한 발전소의 기당 비용 합: ${before.plantCost} → ${after.plantCost} (전선 비용 제외)</p>`;
      if (key === "demand") html += "<p>빛가람 필요량: 100 → 130 (증가 30). 공급 계획은 2번에서 정합니다.</p>";
      if (key === "wire") html += "<p>전선 1칸당 비용: 1 → 3 (증가 2). 1번 배치에는 전선이 없어 총비용은 계산하지 않습니다.</p>";
    }
    html += '<p class="small"><span class="tag-mine">재구성(기당)</span> ' + (plan.q2 ? '비용은 기당 발전 비용과 전선 비용의 합입니다. ' : '') + '달라진 조건 외의 값은 그대로 두며, 기간을 곱해 누적 전력량이나 누적 비용으로 바꾸지 않습니다.</p>';
    if (key === "wind") html += '<p class="small">이 과제에서는 생산량을 풍속과 같게 셉니다. 실제 풍력 발전기의 출력은 대략 풍속의 세제곱에 비례해, 풍속이 절반이면 약 1/8로 줄어듭니다.</p>';
    if (key === "nuclear") html += '<p class="small">점검 기간과 비용은 연습실 가정입니다. 멈춰도 기당 비용은 그대로 둡니다.</p>';
    return html;
  }

  function afterReflect22(root, state, save) {
    const next = KCP.$("#nextstep-2022", root)?.closest(".panel");
    if (!next) return;
    if (!KCP.$("#tw22", root)) next.insertAdjacentHTML("beforebegin", '<section class="panel" id="tw22" aria-labelledby="tw22-title" style="min-width:0;overflow-wrap:anywhere"></section>');
    const panel = KCP.$("#tw22", root);
    const G = normalizeGame(state.game), plan = twistPlan(G);
    let memo = G.twist || { k: "", line: "", keep: "" };
    const persist = () => {
      // 다른 성찰 처리에서 game을 정규화해도 이전 객체에 쓰지 않는다.
      state.game = { ...record(state.game), twist: { ...memo } };
      save();
    };
    const paint = () => {
      const stale = !!memo.k && !plan.keys.includes(memo.k);
      const hasPlan = plan.plants.length > 0;
      panel.innerHTML = `<h3 class="h-wrap" id="tw22-title">조건이 바뀐다면 <span class="tag-mine">연습실 질문</span></h3>
        <p>조건 하나를 골라 내 계획에서 얻는 것과 잃는 것을 살펴보세요.</p>
        ${hasPlan ? `<p class="small">${plan.q2 ? "2번 계획의 발전소·공급 마을·전선" : "2번 계획이 없어 1번 배치"}를 기준으로 비교합니다.</p>
          <div class="stack" role="group" aria-label="후속 조건 선택">${plan.keys.map(k => `<button type="button" class="btn" data-tw22="${k}" aria-pressed="${memo.k === k}" aria-controls="tw22-result" style="min-height:44px;min-width:44px;white-space:normal;text-align:left;display:block"><b>${esc(TWIST22[k].title)}</b><br><span class="tag-mine">연습실 가정</span> ${esc(TWIST22[k].condition)}</button>`).join("")}</div>` :
          '<p>준비실 계획이 없어 질문을 만들 수 없습니다.</p><button type="button" class="btn" id="tw22-prep" style="min-height:44px;min-width:44px">준비실로 가기</button>'}
        ${stale ? `<p id="tw22-stale"><b>이 메모를 쓸 때의 조건:</b> ${esc(TWIST22[memo.k].condition)} <span class="tag-mine">연습실 가정</span><br>지금 계획의 후보에는 없는 조건입니다. 적어 둔 글은 남겨 둡니다. 새 카드를 고르면 이 글도 새 조건에 연결됩니다.</p>` : ""}
        ${!memo.k && (memo.line || memo.keep) ? '<p>메모의 조건을 확인할 수 없어 글만 보존했습니다. 조건을 다시 골라 주세요.</p>' : ""}
        <div id="tw22-result" role="status" aria-live="polite" aria-atomic="true"></div>
        <p id="tw22-help" class="small">좌표·설비·전선 중 무엇을 어떻게 바꿀지 한 줄로 적으세요(각 140자 이내). 메모는 준비실 계획이나 장면을 바꾸지 않습니다.</p>
        <div class="field"><label for="tw22-line">내 계획 한 줄 수정</label><textarea class="note" id="tw22-line" rows="2" maxlength="140" aria-describedby="tw22-help" style="min-height:44px;min-width:0;outline:revert"${!memo.k ? " readonly" : ""}>${esc(memo.line)}</textarea></div>
        <div class="field"><label for="tw22-keep">바꾸지 않는다면 그 이유 (선택)</label><textarea class="note" id="tw22-keep" rows="2" maxlength="140" aria-describedby="tw22-help" style="min-height:44px;min-width:0;outline:revert"${!memo.k ? " readonly" : ""}>${esc(memo.keep)}</textarea></div>`;
      KCP.$("#tw22-result", panel).innerHTML = hasPlan && memo.k && !stale ? twistResult(plan, memo.k) : '<p>현재 계획의 조건 카드를 고르면 바뀐 수치를 보여 줍니다.</p>';
      KCP.$$("[data-tw22]", panel).forEach(b => {
        b.onclick = () => {
          const key = b.dataset.tw22;
          memo = { ...memo, k: key };
          persist();
          paint();
          KCP.$(`[data-tw22="${key}"]`, panel).focus();
        };
      });
      ["line", "keep"].forEach(field => KCP.$(`#tw22-${field}`, panel).addEventListener("input", e => {
        memo = { ...memo, [field]: e.target.value.slice(0, 140) };
        persist();
      }));
      const prep = KCP.$("#tw22-prep", panel);
      if (prep) prep.onclick = () => KCP.goPhase("prep");
    };
    paint();
  }

  // 단독 모형 검사에는 이벤트 버스가 없다. 실제 앱에서는 항상 등록한다.
  KCP.on?.("export:text", ({ year, state, parts }) => {
    if (year !== "2022") return;
    const t = normalizeGame(state.game).twist;
    if (!t || (!t.line && !t.keep)) return;
    const condition = t.k ? `${TWIST22[t.k].condition} (연습실 가정)` : "조건 확인 불가";
    parts.push(`\n■ 조건이 바뀐다면(연습실 질문)\n조건: ${condition}\n한 줄 수정: ${t.line}\n유지 이유: ${t.keep}\n`);
  });

  // 학생이 고른 직선만 한 칸 선분으로 편집한다. 꺾이는 곳도 학생이 지정한다.
  function editWire(G, from, to, erase = false) {
    if (!isCell(from) || !isCell(to)) return "지도 안의 좌표를 골라 주세요.";
    const [r1, c1] = rc(from), [r2, c2] = rc(to);
    if (r1 !== r2 && c1 !== c2) return "같은 행이나 열의 끝점을 고르세요. 꺾이는 곳은 나누어 잇습니다.";
    const edges = new Map(wireEdges(G.wires).map(e => [edgeKey(...e), e]));
    let r = r1, c = c1;
    while (r !== r2 || c !== c2) {
      const a = idOf(r, c);
      r += Math.sign(r2 - r); c += Math.sign(c2 - c);
      const b = idOf(r, c), key = edgeKey(a, b);
      if (erase) edges.delete(key); else edges.set(key, [a, b].sort());
    }
    G.wires = [...edges.values()];
    G.wireNotice = "";
    return "";
  }

  function supply(q2, wires = []) {
    const got = { 배멧: 0, 참살이: 0, 빛가람: 0 };
    const edges = wireEdges(wires), adj = new Map();
    edges.forEach(([a, b]) => {
      if (!adj.has(a)) adj.set(a, []);
      if (!adj.has(b)) adj.set(b, []);
      adj.get(a).push(b); adj.get(b).push(a);
    });
    const reached = Object.fromEntries(Object.entries(VILL).map(([n, v]) => {
      const seen = new Set([v.cell]), queue = [v.cell];
      for (let i = 0; i < queue.length; i++) (adj.get(queue[i]) || []).forEach(c => {
        if (!seen.has(c)) { seen.add(c); queue.push(c); }
      });
      return [n, seen];
    }));
    let plantCost = 0;
    const connected = q2.map((p) => {
      const linked = own(VILL, p.to) && reached[p.to].has(p.cell);
      if (linked) got[p.to] += out(p.type, p.cell);
      plantCost += PT[p.type].cost;
      return linked;
    });
    return { got, plantCost, wire: edges.length, total: plantCost + edges.length, connected, edges };
  }

  function gridHTML(G, plants, hit, interactive, wireStart = null, focusCell = "A1") {
    const pmap = {};
    plants.forEach((p) => (pmap[p.cell] = p));
    const connection = G.mode === "q2" ? supply(plants, G.wires).connected : [];
    const connected = Object.fromEntries(plants.map((p, i) => [p.cell, connection[i]]));
    // 데이터 화살표는 바람이 불어 가는 쪽이다(PDF p33). 이름은 불어오는 쪽으로 부르는 관례를 함께 쓴다.
    const windName = { S: "남쪽으로 부는 바람(북풍)", SW: "남서쪽으로 부는 바람(북동풍)", W: "서쪽으로 부는 바람(동풍)" };
    const currentName = { E: "동쪽으로 흐름", S: "남쪽으로 흐름", W: "서쪽으로 흐름", N: "북쪽으로 흐름", NS: "남북 양쪽으로 갈라져 흐름" };
    // 칸 이름에서 바람 경로의 출처(화석 미세먼지/원자력 사고)를 나눈다. analyze와 같은 smog 규칙.
    const fossilAir = new Set(plants.filter(p => p.type === "fossil").flatMap(p => smog(p.cell)));
    const nuclearAir = new Set(plants.filter(p => p.type === "nuclear").flatMap(p => smog(p.cell)));
    const segments = {};
    if (G.mode === "q2") wireEdges(G.wires).forEach(([a, b]) => {
      [[a, b], [b, a]].forEach(([from, to]) => {
        const [r, c] = rc(from), [rr, cc] = rc(to);
        (segments[from] ||= []).push({ to, x: 50 + (cc - c) * 50, y: 50 + (rr - r) * 50 });
      });
    });
    const summary = `예시 배치 지도: ${plants.map(p => `${p.cell} ${PT[p.type].n}`).join(", ")}${G.mode === "q2" ? `, 전선 ${wireEdges(G.wires).length}칸` : ""}`;
    let h = `<div class="mgrid" ${interactive ? 'role="grid" aria-label="KENTECH 도시 지도" aria-rowcount="11" aria-colcount="11" aria-describedby="grid-help"' : `role="img" aria-label="${esc(summary)}"`}>
      <div class="mgrid-row" ${interactive ? 'role="row"' : 'aria-hidden="true"'}><span class="hd" aria-hidden="true"></span>${Array.from({ length: 10 }, (_, c) => `<span class="hd" ${interactive ? `role="columnheader" aria-colindex="${c + 2}"` : ""}>${c + 1}</span>`).join("")}</div>`;
    ROWS.forEach((R, r) => {
      h += `<div class="mgrid-row" ${interactive ? 'role="row"' : 'aria-hidden="true"'}><span class="hd row-hd" ${interactive ? 'role="rowheader" aria-colindex="1"' : ""}>${R}</span>`;
      for (let c = 0; c < 10; c++) {
        const id = R + (c + 1);
        const t = terr(id);
        const f = FEAT[id];
        const v = VCELL[id];
        let label = v ? `<span class="ft" style="position:relative">${v}</span>` : f ? `<span class="ft" style="position:relative">${FNAME[f][0]}</span>` : "";
        let ov = "";
        if (G.overlay === "solar") ov = SOLAR[r];
        if (G.overlay === "wind") ov = `${WIND[r][c]}<br>${ARROW[WDIR[r][c]]}`;
        if (G.overlay === "current") ov = CURR[id] ? ARROW[CURR[id]] : "";
        const p = pmap[id];
        const title = `${id} · ${t === "sea" ? "바다" : t === "lake" ? "호수" : "육지"}${v ? " · " + v + " 마을" : f ? " · " + FNAME[f][1] : ""} · 일사량 ${SOLAR[r]} · 풍속 ${WIND[r][c]}`;
        const lines = segments[id] || [];
        const data = G.overlay === "solar" ? `일사량 ${SOLAR[r]}` : G.overlay === "wind" ? `풍속 ${WIND[r][c]}, ${windName[WDIR[r][c]]}` : G.overlay === "current" ? `해류 ${currentName[CURR[id]] || "표시 없음"}` : "";
        const name = [id, p ? `${PT[p.type].n}, 생산 ${out(p.type, id)}` : "", v ? `${v} 마을` : f ? FNAME[f][1] : "",
          t === "sea" ? "바다" : t === "lake" ? "호수" : "육지", data,
          G.mode === "q2" ? lines.length ? `전선 연결: ${lines.map(l => l.to).join(", ")}` : "전선 없음" : "",
          G.mode === "q2" && p ? p.to ? `${p.to} 마을 전선 ${connected[id] ? "연결됨" : "미연결"}` : "공급 마을 미지정" : "",
          hit.has(id) ? `${[fossilAir.has(id) ? "미세먼지" : "", nuclearAir.has(id) ? "사고 시 방사성 물질" : ""].filter(Boolean).join("·") || "영향"}의 바람 경로 (재구성)` : "", hit.has("~" + id) ? "사고 시 해류 경로 (재구성)" : "",
          wireStart === id ? "전선 시작점" : ""].filter(Boolean).join(" · ");
        const tag = interactive ? "button" : "div";
        h += `<${tag} class="cell ${t} ${v ? "vil" : ""} ${hit.has(id) ? "hit" : ""} ${hit.has("~" + id) ? "hit2" : ""} ${wireStart === id ? "wire-start" : ""}" ${interactive ? `type="button" role="gridcell" aria-colindex="${c + 2}" data-cell="${id}" tabindex="${id === focusCell ? 0 : -1}" aria-label="${esc(name)}"` : ""} title="${esc(title)}">
          ${lines.length ? `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">${lines.map(l => `<line x1="50" y1="50" x2="${l.x}" y2="${l.y}" stroke="var(--ink)" stroke-width="10"/><line x1="50" y1="50" x2="${l.x}" y2="${l.y}" stroke="var(--accent)" stroke-width="5"/>`).join("")}</svg>` : ""}
          ${ov !== "" ? `<span class="ov"><span class="map-value">${ov}</span></span>` : label}
          ${p ? `<span class="plant p-${p.type}">${PT[p.type].s}</span>` : ""}</${tag}>`;
      }
      h += "</div>";
    });
    return h + "</div>";
  }

  // 공개 지도 자료는 원본과 분리한 깊은 복사다. 중첩 배열·객체까지 동결한다.
  const MAP_DATA = (function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  })(JSON.parse(JSON.stringify({ ROWS, TERR, FEAT, VILL, SOLAR, WIND, WDIR, CURR })));

  KCP.games["2022"] = {
    model: { normalizeGame, supply, editWire, data: MAP_DATA },
    brief() {
      return `<div class="scenario">
          <p class="label">문제 상황</p>
          <p>KENTECH 도시의 세 마을에 전기 에너지 공급 계획을 수립하고자 한다. 아래 문제에서 주어진 상황에 따라 본인의 [발전 설비] 설치 계획을 말해보자. 모든 문제에서 <b>[지도], [데이터], [마을]의 특성을 고려하여 [발전 설비]의 종류와 위치를 결정</b>해야 한다.</p>
          <p>기본적으로 아래의 원칙만 준수하고 이유를 설명할 수 있다면 무엇이든 답변이 가능하다.</p>
          <ul class="rules">
            <li>답변은 창의적으로 자유롭게 제시할 수 있다. 일반적인 상식에 근거한 유추는 타당하다. 예: '해당 마을에는 고급 자동차가 많다'는 사실에서 '마을의 소득 수준이 높다'고 추론하는 것.</li>
            <li>제시된 정보들 이외에 필요하다고 생각하는 사항은 합리적인 수준에서 자유롭게 가정할 수 있다.</li>
          </ul>
        </div>
        <div class="task"><b>문제</b><ol>
          <li>KENTECH 도시에 4종류의 [발전 설비]를 1개씩 설치하려고 한다. 각 [발전 설비] 별로 경제, 사회, 환경 측면에서 설치하기에 적합하다고 생각하는 위치의 좌표(예: A,1)를 한 개씩 선택하고 이유를 설명하시오. (조건 1: 1개의 좌표에는 1개의 발전소만 설치. 조건 2: [발전 설비]와 [마을]을 전선으로 연결하는 비용은 무시.)</li>
          <li>[배멧 마을], [참살이 마을], [빛가람 마을]에 각각 60, 80, 100의 전기 에너지를 공급해야 한다. 경제적, 사회적, 환경적 측면을 종합적으로 고려하여 가장 적합하다고 생각하는 위치에 [발전 설비]를 설치하고 [마을]과 전선으로 연결하시오. (조건 1: 1개의 좌표에 1개의 발전소만 설치. 조건 2: [발전 설비] 종류와 개수는 자유. 조건 3: 전선은 가로 또는 세로로만 연결하며, 길이에 따라 비용 증가. 조건 4: [발전 설비] 카드 내용과 아래 표의 특성을 함께 고려.)</li></ol>
          <p class="small"><span class="tag-official">조건 3 그림 설명 · PDF p35</span> 하나의 전선에서 T자로 갈라지거나, 발전소를 거쳐 다음 발전소로 이어도 됩니다.</p></div>`;
    },

    renderPrep(root, state, save, next) {
      const G = g(state);
      let wireStart = null;
      // 초점은 화면에만 기억한다. 계획·저장 형식에는 넣지 않는다.
      let focusId = isCell(root._kcp2022Focus) ? root._kcp2022Focus : "A1";
      const savePlan = () => {
        G.wireNotice = "";
        const notice = KCP.$("#wire-notice", root);
        if (notice) notice.hidden = true;
        save();
      };
      root.innerHTML = `
        <div class="desk wide-left">
          <div class="stack">
            <section class="panel">
              <h3>지도 · KENTECH 도시</h3>
            ${G.wireNotice ? `<p class="hint" id="wire-notice" role="status">${G.wireNotice === "migrated" ? "옛 저장의 발전소·마을 선택·글을 옮겼습니다. 옛 저장에는 전선 경로가 없어 공급을 다시 확인해야 합니다. 전선 도구로 경로를 지정해 주세요." : "저장값에서 손상되거나 중복된 배치·전선 항목을 정리했습니다. 남아 있는 계획과 공급을 확인해 주세요."}</p>` : ""}
              <div class="toolbar" role="group" aria-label="데이터 겹쳐 보기" style="margin-bottom:8px">
                <span class="label" style="align-self:center">데이터</span>
                ${[["map", "지도"], ["solar", "평균 일사량"], ["wind", "평균 풍속·풍향"], ["current", "평균 해류 방향"]].map(([k, n]) => `<button class="btn small" data-ov="${k}" aria-pressed="${G.overlay === k}">${n}</button>`).join("")}
              </div>
              <div class="toolbar" role="group" aria-label="설치 도구" style="margin-bottom:10px">
                <span class="label" style="align-self:center">설치</span>
                ${Object.entries(PT).map(([k, v]) => `<button class="btn small" data-tool="${k}" aria-pressed="${G.tool === k}"><span class="plant p-${k}" style="position:static;width:18px;height:18px;display:inline-grid;font-size:10px">${v.s}</span>${v.n}</button>`).join("")}
                <button class="btn small" data-tool="erase" aria-pressed="${G.tool === "erase"}">지우개</button>
              </div>
              <div id="wire-tools" ${G.mode === "q2" ? "" : "hidden"}>
                <div class="toolbar" role="group" aria-label="전선 도구">
                  <button class="btn small" data-tool="wire" aria-pressed="${G.tool === "wire"}">전선 놓기</button>
                  <button class="btn small" data-tool="unwire" aria-pressed="${G.tool === "unwire"}">전선 지우기</button>
                  <button class="btn small ghost" id="wire-cancel">시작점 취소</button>
                </div>
                <p class="hint" id="wire-status"></p>
              </div>
              <div class="gridwrap" id="grid"></div>
              <p class="hint" id="grid-live" role="status" aria-live="polite" aria-atomic="true"></p>
              <p class="hint" id="grid-help">방향키로 이동, Home·End로 행 처음·끝, Ctrl+Home·End로 지도 처음·끝으로 이동합니다. Enter·Space로 현재 도구를 쓰고, Esc로 전선 시작점을 취소합니다. 좁은 화면에서는 지도를 옆으로 밀어 볼 수 있습니다.</p>
              <div class="legend" style="margin-top:8px">
                <span><i style="background:var(--sea)"></i>바다</span><span><i style="background:var(--land)"></i>육지</span><span><i style="background:var(--lake)"></i>호수</span>
                ${Object.values(FNAME).map(([s, n]) => `<span><b>${s}</b> ${n}</span>`).join("")}
                <span><i style="box-shadow:inset 0 0 0 2px var(--bad);background:transparent"></i>바람을 따라 이동하는 미세먼지·방사성 물질 (재구성)</span><span><i style="outline:2px dashed var(--warn);outline-offset:-2px;background:transparent"></i>사고 시 해류 경로 (재구성)</span>
              </div>
              <p class="hint" style="margin-top:6px">일사량 ${"A~B 5, C~E 10, F~H 15, I~J 20"}. 태양광 생산량은 일사량, 풍력 생산량은 풍속과 같습니다. 칸에 마우스를 올리면 좌표 정보가 보입니다.</p>
            </section>
            <section class="panel"><h3>카드 · 발전 설비와 마을</h3>
              <div class="cards7">
                ${CARDS.map(([n, d, c, e]) => `<div class="card7"><h5>${n}</h5><p>${d}</p><dl><dt>설치 조건</dt><dd>${c}</dd><dt>환경 영향</dt><dd>${e}</dd></dl></div>`).join("")}
                ${Object.entries(VILL).map(([n, v]) => `<div class="card7"><h5>${n} 마을 <span class="chip num">${v.cell}</span></h5><p>${v.desc}</p></div>`).join("")}
              </div>
              <div class="table-wrap" style="margin-top:10px"><table class="spec"><thead><tr><th></th><th>화석 연료</th><th>태양광</th><th>풍력</th><th>원자력</th></tr></thead>
                <tbody><tr><th>평균 전기 에너지 생산량</th><td class="num">60</td><td>일사량과 같음</td><td>풍속과 같음</td><td class="num">90</td></tr>
                <tr><th>평균 발전 비용</th><td class="num">15</td><td class="num">2</td><td class="num">2</td><td class="num">15</td></tr></tbody></table></div>
              <p class="hint"><span class="tag-mine">재구성(기당)</span> 평균 발전 비용 15·2·2·15는 원문에 단위가 없어 연습실에서는 발전소 1기당으로 계산합니다.</p>
            </section>
          </div>
          <div class="stack">
            <section class="panel">
              <div class="tabs" role="tablist">
                <button role="tab" data-mode="q1" aria-selected="${G.mode === "q1"}">1번 문제 · 4종 1개씩</button>
                <button role="tab" data-mode="q2" aria-selected="${G.mode === "q2"}">2번 문제 · 세 마을 공급</button>
              </div>
              <div id="work"></div>
            </section>
            <section class="panel"><h3>영향 분석 <span class="tag-mine">재구성</span></h3><ul class="log" id="warn"></ul>
              <p class="hint" style="margin-top:6px">미세먼지는 풍향을 따라 4칸, 사고 시 방사성 물질은 풍향 4칸과 해류 전체 경로로 추적합니다. 판단의 재료일 뿐 감점표가 아닙니다.</p></section>
            ${KCP.memoPanel(state, savePlan, "memo22")}
            <div class="row"><span class="spacer"></span><button class="btn primary" id="go22">면접실로 이동</button></div>
          </div>
        </div>`;

      const plantsNow = () => (G.mode === "q1" ? Object.entries(G.q1).filter(([, c]) => c).map(([type, cell]) => ({ type, cell })) : G.q2);
      const announce = (message, error = false) => {
        const live = KCP.$("#grid-live", root);
        live.textContent = "";
        // 같은 오류가 반복되어도 라이브 영역의 새 알림으로 전달한다.
        if (window.requestAnimationFrame) window.requestAnimationFrame(() => { live.textContent = message; });
        else live.textContent = message;
        if (error) KCP.toast(message);
      };
      const rememberFocus = (id) => {
        focusId = id;
        root._kcp2022Focus = id;
        KCP.$$("[data-cell]", KCP.$("#grid", root)).forEach(b => b.setAttribute("tabindex", b.dataset.cell === id ? "0" : "-1"));
      };
      const focusMapCell = (id) => {
        rememberFocus(id);
        const cell = KCP.$(`[data-cell="${id}"]`, KCP.$("#grid", root));
        cell.focus({ preventScroll: true });
        cell.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      };
      const paint = (focusCell) => {
        const active = typeof document !== "undefined" ? document.activeElement : null;
        const restore = focusCell || (active && KCP.$$("[data-cell]", KCP.$("#grid", root)).includes(active) ? active.dataset.cell : null);
        if (restore) { focusId = restore; root._kcp2022Focus = restore; }
        const plants = plantsNow();
        const an = analyze(plants);
        KCP.$("#grid", root).innerHTML = gridHTML(G, plants, an.hit, true, wireStart, focusId);
        KCP.$("#wire-tools", root).hidden = G.mode !== "q2";
        KCP.$("#wire-status", root).textContent = wireStart ? `${wireStart}에서 같은 행·열의 끝점을 누르세요. 같은 칸을 누르면 취소합니다.` : "전선 도구를 고른 뒤 시작점과 같은 행·열의 끝점을 누르세요. 꺾이는 곳은 구간을 나누어 놓습니다.";
        KCP.$$("[data-tool]", root).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === G.tool)));
        KCP.$("#warn", root).innerHTML = an.warn.map((w) => `<li style="color:${w.lv === "bad" ? "var(--bad)" : "inherit"}">${esc(w.t)}</li>`).join("") || "<li>설치한 발전소가 없습니다.</li>";
        KCP.$$("[data-cell]", KCP.$("#grid", root)).forEach((b) => {
          b.onfocus = () => rememberFocus(b.dataset.cell);
          b.onclick = () => { rememberFocus(b.dataset.cell); clickCell(b.dataset.cell); };
          b.onkeydown = (e) => {
            const id = b.dataset.cell, [r, c] = rc(id);
            let to;
            if (e.key === "ArrowUp") to = idOf(Math.max(0, r - 1), c);
            if (e.key === "ArrowDown") to = idOf(Math.min(9, r + 1), c);
            if (e.key === "ArrowLeft") to = idOf(r, Math.max(0, c - 1));
            if (e.key === "ArrowRight") to = idOf(r, Math.min(9, c + 1));
            if (e.key === "Home") to = e.ctrlKey ? "A1" : idOf(r, 0);
            if (e.key === "End") to = e.ctrlKey ? "J10" : idOf(r, 9);
            if (to) { e.preventDefault(); return focusMapCell(to); }
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); return clickCell(id); }
            if (e.key === "Escape") {
              e.preventDefault();
              if (wireStart) { wireStart = null; paint(id); announce("전선 시작점을 취소했습니다."); }
            }
          };
        });
        paintWork();
        if (restore) focusMapCell(restore);
      };
      const clickCell = (id) => {
        if (["wire", "unwire"].includes(G.tool)) {
          if (G.mode !== "q2") return;
          if (!wireStart) { wireStart = id; paint(id); return announce(`${id}에서 시작점. 같은 행·열의 끝점을 고르세요.`); }
          if (wireStart === id) { wireStart = null; paint(id); return announce("전선 시작점을 취소했습니다."); }
          const start = wireStart;
          const why = editWire(G, wireStart, id, G.tool === "unwire");
          if (why) return announce(`${id}: ${why}`, true);
          wireStart = null; savePlan(); paint(id);
          return announce(`${start}에서 ${id}까지 전선을 ${G.tool === "unwire" ? "지웠습니다" : "놓았습니다"}. 전체 전선 ${G.wires.length}칸.`);
        }
        if (G.tool === "erase") {
          const removed = plantsNow().find(p => p.cell === id);
          if (G.mode === "q1") Object.keys(G.q1).forEach((k) => G.q1[k] === id && delete G.q1[k]);
          else G.q2 = G.q2.filter((p) => p.cell !== id);
          savePlan(); paint(id);
          return announce(removed ? `${id}의 ${PT[removed.type].n}를 지웠습니다.` : `${id}에는 지울 발전소가 없습니다.`);
        }
        const why = canPlace(G.tool, id);
        if (why) return announce(`${id}: ${why}`, true);
        const occupied = G.mode === "q1" ? Object.entries(G.q1).find(([k, c]) => c === id && k !== G.tool) : G.q2.find((p) => p.cell === id);
        if (occupied) return announce(`${id}: 1개의 좌표에는 1개의 발전소만 설치할 수 있습니다.`, true);
        const previous = G.mode === "q1" ? G.q1[G.tool] : null;
        if (G.mode === "q1") G.q1[G.tool] = id;
        else G.q2.push({ type: G.tool, cell: id, to: "" });
        savePlan(); paint(id);
        announce(previous && previous !== id ? `${previous}의 ${PT[G.tool].n}를 ${id}로 옮겼습니다. 생산 ${out(G.tool, id)}.` : `${id}에 ${PT[G.tool].n}를 설치했습니다. 생산 ${out(G.tool, id)}.`);
      };
      const paintWork = () => {
        const w = KCP.$("#work", root);
        KCP.$$("[data-mode]", root).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === G.mode)));
        if (G.mode === "q1") {
          w.innerHTML = `<p class="small muted" style="margin-bottom:8px">도구를 고르고 지도를 누르면 그 종류의 발전소가 그 좌표로 옮겨집니다. 각 발전소마다 경제·사회·환경 측면의 이유를 적습니다.</p>
            <div class="stack">${Object.entries(PT).map(([k, v]) => `<div class="field"><label for="r1-${k}">${v.n} · <span class="num">${G.q1[k] || "미설치"}</span>${G.q1[k] ? ` · 생산 ${out(k, G.q1[k])}` : ""}</label>
              <textarea class="note" id="r1-${k}" data-r1="${k}" style="min-height:56px" placeholder="경제 · 사회 · 환경 측면의 이유">${esc(G.r1[k] || "")}</textarea></div>`).join("")}</div>`;
          KCP.$$("[data-r1]", w).forEach((t) => t.addEventListener("input", () => { G.r1[t.dataset.r1] = t.value; savePlan(); }));
        } else {
          const s = supply(G.q2, G.wires);
          w.innerHTML = `<p class="small muted" style="margin-bottom:8px">각 발전소가 전기를 보낼 마을을 직접 고르고, 전선 도구로 발전소와 마을을 이으세요. T자 분기와 발전소를 거치는 연결이 가능합니다. 겹친 전선은 한 번만 셉니다.</p>
            <p class="hint">연습실 규칙: 선이 만나는 칸은 연결점입니다. 한 발전소의 생산량은 지정한 한 마을에만 보내며 나누어 공급하지 않습니다. 지형에 따른 전선 제한은 두지 않습니다. 발전소를 지워도 전선은 남아 비용에 포함됩니다.</p>
            <div class="table-wrap"><table class="supply"><thead><tr><th>마을</th><th class="num">필요</th><th class="num">공급</th><th>상태</th></tr></thead><tbody>
              ${Object.entries(VILL).map(([n, v]) => `<tr><td>${n}</td><td class="num">${v.need}</td><td class="num">${s.got[n]}</td><td>${s.got[n] >= v.need ? '<span class="chip ok">충족</span>' : `<span class="chip bad">${v.need - s.got[n]} 부족</span>`}</td></tr>`).join("")}
            </tbody></table></div>
            <p class="small" style="margin-top:6px">발전 비용 <b class="num">${s.plantCost}</b> <span class="tag-mine">재구성(기당)</span> + 전선 길이 <b class="num">${s.wire}</b>칸 = 총비용 <b class="num">${s.total}</b> <span class="hint">(연습실 가정: 전선 1칸당 비용 1. 이웃한 칸 중심 사이를 1칸으로 세며, 미연결 전선도 포함)</span></p>
            <div class="table-wrap" style="margin-top:8px"><table class="supply"><thead><tr><th>발전소</th><th>좌표</th><th class="num">생산</th><th>공급 마을</th><th>연결 상태</th><th></th></tr></thead><tbody>
              ${G.q2.map((p, i) => `<tr><td>${PT[p.type].n}</td><td class="num">${p.cell}</td><td class="num">${out(p.type, p.cell)}</td>
                <td><select data-to="${i}" id="to-${i}" aria-label="${p.cell} 연결 마을"><option value="" ${!p.to ? "selected" : ""}>직접 선택</option>${Object.keys(VILL).map((n) => `<option ${p.to === n ? "selected" : ""}>${n}</option>`).join("")}</select></td>
                <td>${!p.to ? "마을 미지정" : s.connected[i] ? "연결됨" : "전선 미연결"}</td><td><button class="btn small ghost" data-del="${i}" aria-label="삭제">×</button></td></tr>`).join("") || '<tr><td colspan="6" class="small muted">아직 설치한 발전소가 없습니다.</td></tr>'}
            </tbody></table></div>
            <div class="field" style="margin-top:10px"><label for="q2t">계획 설명</label>
              <textarea class="note" id="q2t" style="min-height:110px" placeholder="어떤 발전소를 왜 골랐고, 어떤 발전소를 왜 포기했는지">${esc(G.q2text)}</textarea></div>`;
          KCP.$$("[data-to]", w).forEach((s2) => s2.addEventListener("change", () => { G.q2[s2.dataset.to].to = s2.value; savePlan(); paint(); }));
          KCP.$$("[data-del]", w).forEach((b) => (b.onclick = () => { G.q2.splice(Number(b.dataset.del), 1); savePlan(); paint(); }));
          KCP.$("#q2t", w).addEventListener("input", (e) => { G.q2text = e.target.value; savePlan(); });
        }
      };
      KCP.$$("[data-ov]", root).forEach((b) => (b.onclick = () => { G.overlay = b.dataset.ov; KCP.$$("[data-ov]", root).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); savePlan(); paint(); }));
      KCP.$$("[data-tool]", root).forEach((b) => (b.onclick = () => { G.tool = b.dataset.tool; wireStart = null; savePlan(); paint(); }));
      KCP.$$("[data-mode]", root).forEach((b) => (b.onclick = () => { G.mode = b.dataset.mode; wireStart = null; if (G.mode === "q1" && ["wire", "unwire"].includes(G.tool)) G.tool = "wind"; savePlan(); paint(); }));
      KCP.$("#wire-cancel", root).onclick = () => { wireStart = null; paint(); announce("전선 시작점을 취소했습니다."); };
      KCP.$("#go22", root).onclick = next;
      paint();
    },

    questions(state) {
      const G = g(state);
      const qs = [{ k: "22-q1", src: "report", tag: "1번 문제", q: "네 가지 발전 설비를 설치한 좌표와 그 이유를 경제, 사회, 환경 측면에서 설명해 주세요." }];
      if (G.q1.nuclear) qs.push({ k: "22-q1-nuc", tag: "1번 후속", q: `원자력 발전소를 ${G.q1.nuclear}에 두었습니다. 사고가 나면 바람과 해류는 방사성 물질을 어디로 옮기나요? 그 위험을 어떻게 줄일 수 있을까요?` });
      if (G.q1.fossil) qs.push({ k: "22-q1-fos", tag: "1번 후속", q: `화석 연료 발전소를 ${G.q1.fossil}에 두었습니다. 바람을 따라 미세먼지가 어느 마을에 영향을 줄지 설명하고, 그 마을 주민을 어떻게 설득할지 말해 주세요. (질문 소재: 보고서 PDF p12의 1번 예시 답변, 연습용 재구성)` });
      qs.push({ k: "22-q2", src: "report", tag: "2번 문제", q: "경제·사회·환경 측면을 종합적으로 고려하여 배멧·참살이·빛가람 마을에 각각 60, 80, 100의 전기 에너지를 공급할 발전 설비를 설치하고 마을과 전선으로 연결하는 계획을 설명해 주세요." });
      if (G.q2.length) {
        const s = supply(G.q2, G.wires);
        qs.push({ k: "22-q2-cost", tag: "2번 후속 · 수학적 사고", q: `원문의 평균 발전 비용 표를 어떤 가정으로 읽었나요? 기당인가요, 전력량당인가요? 연습실은 기당으로 발전 비용 ${s.plantCost}, 직접 놓은 공유 전선 ${s.wire}칸을 1칸당 비용 1로 계산합니다. 가정을 바꾸면 계획과 환경·주민에 대한 선택이 어떻게 달라지나요?` });
        const types = new Set(G.q2.map((p) => p.type));
        if (types.size === 1) qs.push({ k: "22-q2-one", tag: "2번 후속 · 유연성", q: `${PT[[...types][0]].n} 한 종류로만 공급합니다. 날씨나 사고로 이 발전 방식이 한 달 동안 멈춘다면 계획은 어떻게 바뀌어야 할까요?` });
      }
      qs.push({ k: "22-div-typhoon", tag: "발산적 사고", q: "태풍으로 바닷가의 풍력 발전기가 며칠 멈춘다는 조건이 추가된다면, 당신의 설치 계획은 어떻게 달라지나요?" });
      qs.push({ k: "22-hum-vote", tag: "인문적 통찰", q: "빛가람 마을은 자연을 보전하려는 사람들과 개발하려는 사람들이 대립 중이고 투표율이 80%입니다. 이 마을 주민 앞에서 당신의 계획을 발표하면 어떤 반응이 나올까요?" });
      qs.push({ k: "22-hum-future", tag: "인문적 통찰", q: "배멧 마을은 젊은 층의 인구 유출이 많고, 참살이 마을은 어획량이 줄어 새로운 산업이 필요합니다. 발전소 계획이 이 마을들의 미래에 도움이 될 수 있을까요?" });
      return qs;
    },

    recap(state) {
      const G = g(state);
      const s = supply(G.q2, G.wires);
      const q1 = Object.entries(PT).map(([k, v]) => `${v.n} ${G.q1[k] || "-"}${G.r1[k] ? ": " + G.r1[k] : ""}`);
      const q2 = G.q2.map((p, i) => `${PT[p.type].n} ${p.cell}(${out(p.type, p.cell)}) → ${p.to || "마을 미지정"} · ${s.connected[i] ? "연결됨" : "미연결"}`);
      return [
        { t: "1번 문제 · 배치와 이유", d: q1.join("\n"), text: "\n  " + q1.join("\n  ") },
        { t: "2번 문제 · 발전소와 연결", d: q2.join("\n") || "(없음)", text: q2.length ? "\n  " + q2.join("\n  ") : "(없음)" },
        { t: "2번 문제 · 공급과 비용", d: `배멧 ${s.got.배멧}/60 · 참살이 ${s.got.참살이}/80 · 빛가람 ${s.got.빛가람}/100 · 총비용 ${s.total} (발전 ${s.plantCost}: 재구성(기당), 전선 ${s.wire}칸: 연습실 가정 1칸당 비용 1)${G.wireNotice ? " · 저장 이전·정리 후 전선과 공급을 준비실에서 확인하세요." : ""}` },
        { t: "2번 문제 · 직접 놓은 전선", d: G.wires.map(e => e.join("–")).join(", ") || "(없음)" },
        { t: "2번 문제 · 설명", d: G.q2text },
      ];
    },

    afterReflect: afterReflect22,

    reflectExtra() {
      const ex = [{ type: "fossil", cell: "F5" }, { type: "nuclear", cell: "I9" }, { type: "solar", cell: "I7" }, { type: "wind", cell: "B1" }];
      const an = analyze(ex);
      // 예시 배치는 성찰에서만 만든다. 준비실·장면·모형은 이 데이터를 읽지 않는다.
      const ex2 = [
        ...["A1", "A2", "A4", "B1"].map(cell => ({ type: "wind", cell, to: "참살이" })),
        ...["A6", "A7", "B6"].map(cell => ({ type: "wind", cell, to: "배멧" })),
        ...["F1", "G1", "H1", "I1", "J1"].map(cell => ({ type: "wind", cell, to: "빛가람" })),
      ];
      const example = { mode: "q2", overlay: "map", wires: [] };
      // PDF p13의 파란 선을 전사. 최적화 결과가 아니다.
      [["A1", "A4"], ["A1", "B1"], ["A2", "D2"], ["A6", "A7"], ["A6", "B6"], ["B6", "B9"], ["F1", "J1"], ["G1", "G4"]]
        .forEach(([a, b]) => editWire(example, a, b));
      const exampleSupply = supply(ex2, example.wires);
      return `<details class="reveal" open><summary>1번 문항 예시 답변 <span class="tag-official">보고서 요약</span></summary>
          <div class="gridwrap">${gridHTML({ overlay: "map" }, ex, an.hit, false)}</div>
          <ul class="small" style="margin:8px 0 0;padding-left:1.1em">
            <li><b>화석 F5</b>: 어느 유전에 지어도 최소 1개 마을은 미세먼지 영향을 받는다. 배멧·참살이는 빛가람보다 젊은 층이 살아 도시의 미래를 위해 젊은 층의 건강을 우선했다.</li>
            <li><b>원자력 I9</b>: 반드시 해안이어야 한다. 해류를 보면 사고 시 배멧·빛가람 피해 가능성이 크지만, 마을에서 멀리 떨어뜨리고 풍향상 도시 하단부에 두어 영향을 줄였다.</li>
            <li><b>태양광 I7</b>: 일사량이 가장 높은 I·J 라인 중 해상(J)은 어렵고, I라인의 새 서식지를 피했다.</li>
            <li><b>풍력 B1</b>: 풍량이 가장 큰 곳은 바다. 어업과 생태계를 피해 마을에 가까운 곳을 골랐다.</li>
          </ul>
          <p class="hint">지도의 빨간 테두리와 점선은 보고서가 아니라 연습실의 영향 분석(재구성)입니다.</p>
          <p class="hint">보고서는 이것이 "모범답안이 아닌, 가능한 무수한 답변 조합 중 하나"라고 밝혔습니다.</p></details>
        <details class="reveal"><summary>2번 문항 예시 답변 · 극단적인 풍력 발전 선택 <span class="tag-official">보고서 요약</span></summary>
          <div class="gridwrap">${gridHTML(example, ex2, new Set(), false)}</div>
          <p class="hint">PDF p13 그림의 배치·경로를 옮겼습니다. 그림을 칸 중심 사이로 세면 참살이 7 + 배멧 5 + 빛가람 7 = ${exampleSupply.wire}칸입니다. 원문에 19칸이라는 수치가 적힌 것은 아니며, 가능한 답변 중 하나입니다. 연습실 가정으로 발전 ${exampleSupply.plantCost} + 전선 ${exampleSupply.wire} = 총비용 ${exampleSupply.total}입니다.</p>
          <ul class="small" style="margin:0;padding-left:1.1em">
            <li>화석: 적은 타일로 많은 전기 에너지를 생산할 수 있다는 장점이 있지만, 탄소 배출과 미세먼지가 마을로 가는 것을 막을 수 없어 제외.</li>
            <li>원자력: 친환경 에너지의 4배 이상을 생산하는 우수한 발전소이지만, 사고 시 해류를 타고 맵 전체를 순환하며, 어업에 종사하는 배멧·참살이의 건강과 생계에 치명적이라 제외.</li>
            <li>태양광: 일사량이 강한 곳에 새 서식지와 산맥이 있고, 피하면 마을까지 멀고 시설이 복잡해지는 단점이 있어 제외.</li>
            <li>풍력: 외곽 바다의 풍속이 높다. 어업 구역과 고래 출몰 지역을 피해, 배멧에는 A6·A7·B6 풍력으로 독립된 에너지망(20×3=60)을 만든다. 비슷하게 참살이와 빛가람도 풍력만으로 공급한다(보고서 지도: 참살이 A1·A2·A4·B1, 빛가람 F1~J1).</li>
          </ul>
          <p class="small" style="margin-top:6px"><span class="tag-mine">연습실 코멘트</span> 보고서에 후속 질문 예시는 없지만, 이런 극단적 선택에는 "바람이 멈추면?" 같은 질문을 예상해 볼 만합니다. 한 가지로 몰아간 선택일수록 한계와 보완책을 스스로 말할 준비가 필요합니다.</p></details>`;
    },
  };
})();
