/* 2024학년도: 켄트로늄 정착 시뮬레이터 (내부 계산식은 재구성) */
(function () {
  const KCP = window.KCP;
  const esc = KCP.esc;

  const TER = {
    L: { n: "용암", k: 18, feat: "제한적으로 에너지 생산에 유리 · 고온으로 인해 주거 제한", rel: "신소재 연구소, 냉난방시설" },
    W: { n: "호수", k: 10, feat: "제한적으로 에너지 생산에 유리 · 수중 시설 건설 가능, 주거 제한", rel: "수소에너지 연구소, 수중기지" },
    M: { n: "갯벌", k: 6, feat: "일반적으로 양호한 에너지 생산 · 약한 지반으로 인해 주거 제한", rel: "" },
    D: { n: "사막", k: 5, feat: "일반적으로 양호한 에너지 생산 · 고온 건조한 환경으로 주거 제한", rel: "" },
    F: { n: "숲", k: 4, feat: "일반적으로 낮은 에너지 생산 · 거주 여건 좋음", rel: "" },
    G: { n: "초원", k: 3, feat: "일반적으로 낮은 에너지 생산 · 거주 여건 좋음", rel: "" },
  };
  /* 보고서 6쪽 '정착지 지역 배치도'(133칸). 위아래 변이 평평한 육각형이며 짝수 열(0, 2, …)은 반 칸 아래에 놓인다. */
  const MAP = [
    "....LLD...L....",
    "...LDDFMMDDLL..",
    "...DGFFWWMMDL..",
    "..LGGFWMMWDDM..",
    "LLFGFGFFFMDDW..",
    "LFFFWFFFFDDWWWW",
    "LFFFWWMGGGGGGGG",
    ".FMWWWWMGGFWGGG",
    "..DDDDMMFFWMGG.",
    "..DDDDDDMWWM...",
    "..LMWMMDMWMM...",
    "...LLW.DDMLD...",
    ".........L.....",
  ];
  const TCOL = { L: "#c8483a", W: "#72cdc4", M: "#7a6152", D: "#e1b870", F: "#3f8a4c", G: "#b9dc5a" };
  const MAX_TILES = 7;
  const MAX_ITEMS = 10;
  const MAP_V = 2;
  const MAP_NOTICE = "정착지 지도가 보고서 배치도로 바뀌어, 예전에 고른 정착지·확정·시뮬레이션 기록을 비웠습니다. 특별 아이템과 써 둔 글은 그대로 있습니다. 새 지도에서 정착지를 다시 골라 주세요.";

  const ITEMS = [
    { id: "eng", n: "엔지니어", up: 0, max: 6, d: "켄트로늄 채굴 기술자. 채굴한 켄트로늄에서 한 명당 10% 효율로 에너지를 생산한다." },
    { id: "medP", n: "의료전문가", up: 2, cat: "med", d: "질병 진단 및 치료를 통해 기대 수명을 높인다. 의료시설을 갖출 시 외과 수술을 포함해 대부분의 의료 행위가 가능해진다." },
    { id: "medF", n: "의료시설", up: 3, cat: "med", d: "다양한 진단과 수술이 가능한 의료 로봇을 갖춘 전문 의료시설이다. 의료전문가만 의료시설을 효과적으로 사용할 수 있다." },
    { id: "admP", n: "행정전문가", up: 2, cat: "adm", d: "탐험대의 자치 행정을 가능하게 하고 자원을 적재적소에 활용할 수 있게 하며 치안을 향상시킨다." },
    { id: "admF", n: "행정시설", up: 3, cat: "adm", d: "자치행정과 사회 시스템 유지에 필요한 각종 시설이다. 행정전문가가 활용할 경우 치안 유지나 자원 관리 효율도 극대화된다." },
    { id: "eduP", n: "교육전문가", up: 2, cat: "edu", d: "정착민과 새로 태어날 아이들의 교육을 담당하며, 정착지에서 획득한 지식과 생활 노하우의 기록 및 전수를 가능케 한다." },
    { id: "eduF", n: "교육시설", up: 3, cat: "edu", d: "행성 거주에 필요한 지식과 기술을 효과적으로 개발할 수 있다. 교육전문가는 교육시설을 효과적으로 활용할 수 있다." },
    { id: "armP", n: "무기전문가", up: 2, cat: "arm", d: "유일하게 무기 사용이 허용된 전문가 집단으로, 예상치 못한 외계 생명체나 위험 요소에 대한 대응력이 높아진다." },
    { id: "armF", n: "무장시설", up: 3, cat: "arm", d: "정착지에 막강한 무장 능력을 제공하며, 목적에 따라 다양한 폭파 시설이나 무기도 제작할 수 있다." },
    { id: "funP", n: "여가 및 문화 전문가", up: 2, cat: "fun", d: "정착지에서 탐험대의 고립감과 정신적 스트레스를 해소하고, 협동심과 공동체 의식을 높이며 창의적 문제 해결력을 키워준다." },
    { id: "funF", n: "여가 및 문화시설", up: 3, cat: "fun", d: "탐험대의 정신적 스트레스를 해소하고 체력 관리에 활용할 수 있다." },
    { id: "ccs", n: "온실가스 포집기", up: 3, cat: "env", d: "대기 중의 온실효과를 유발하는 기체를 다양한 방식으로 포집하여 저장 및 활용한다." },
    { id: "hvac", n: "냉난방시설", up: 1, d: "정착 시설의 실내 온도를 조절할 수 있는 장치로 항상 일정한 온도와 습도를 유지하는 것이 가능해진다." },
    { id: "bomb", n: "폭파장치", up: 2, d: "무기 전문가가 사용할 경우 인위적인 폭발을 일으킬 수 있으며 켄트로늄 채굴량도 늘릴 수 있게 한다." },
    { id: "sub", n: "수중기지", up: 3, d: "호수 지역이나 물속에서 장비와 시설을 사용할 수 있고 켄트로늄 채굴도 가능하게 한다." },
    { id: "seed", n: "종자보관소", up: 1, d: "신선한 채소와 가축의 종자를 동결 보관하고 있는 종자 보관소이다. 종자 해동과 성장을 위한 인큐베이터도 탑재하고 있다." },
    { id: "h2", n: "수소에너지 연구소", up: 1, lab: true, d: "수소에너지의 적극적인 활용을 통해 물에서 켄트로늄을 통한 에너지 생산 효율이 50% 증가한다." },
    { id: "grid", n: "차세대그리드 연구소", up: 2, lab: true, d: "효율적인 에너지 공급망을 구축하여 손실로 인한 에너지 소비량을 30% 절감한다." },
    { id: "ai", n: "에너지AI 연구소", up: 8, lab: true, d: "인공지능과 자율 로봇을 활용하여 켄트로늄 채굴량이 30% 증가한다." },
    { id: "envlab", n: "환경기후기술 연구소", up: 5, lab: true, cat: "env", d: "켄트로늄 채굴로 인한 환경오염을 줄일 수 있으며 온실가스 포집도 가능해진다." },
    { id: "mat", n: "신소재 연구소", up: 5, lab: true, d: "고온에 견디며 열을 차단하는 소재를 비롯해 각종 신물질을 개발할 수 있다." },
  ];
  const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  const ATTR = ["행복", "건강", "치안", "안전", "교육", "환경"];

  /* 헥스 좌표 (even-q: 짝수 열이 반 칸 아래) */
  const tiles = [];
  MAP.forEach((row, r) => row.split("").forEach((t, c) => { if (t !== ".") tiles.push({ r, c, t, id: r + "-" + c }); }));
  const TILE = Object.fromEntries(tiles.map((t) => [t.id, t]));
  const dy = (r, c) => 2 * r + (c % 2 === 0 ? 1 : 0);
  const nbrs = (r, c) => {
    const y = dy(r, c);
    return [[0, -2], [0, 2], [-1, -1], [-1, 1], [1, -1], [1, 1]]
      .map(([dc, dd]) => { const cc = c + dc, yy = y + dd; return (yy - (cc % 2 === 0 ? 1 : 0)) / 2 + "-" + cc; })
      .filter((id) => TILE[id]);
  };
  const connected = (ids) => {
    if (ids.length <= 1) return true;
    const set = new Set(ids);
    const seen = new Set([ids[0]]);
    const st = [ids[0]];
    while (st.length) {
      const t = TILE[st.pop()];
      nbrs(t.r, t.c).forEach((n) => { if (set.has(n) && !seen.has(n)) { seen.add(n); st.push(n); } });
    }
    return seen.size === ids.length;
  };

  /* 재구성한 시뮬레이션 */
  function simulate(sel, items) {
    const has = (id) => (items[id] || 0) > 0;
    const cnt = { L: 0, W: 0, M: 0, D: 0, F: 0, G: 0 };
    sel.forEach((id) => cnt[TILE[id].t]++);
    const log = [];
    let lakeK = cnt.W * TER.W.k;
    if (cnt.W && !has("sub")) { lakeK *= 0.5; log.push("수중기지가 없어 호수 지역의 켄트로늄을 절반만 채굴할 수 있다."); }
    const landK = cnt.L * 18 + cnt.M * 6 + cnt.D * 5 + cnt.F * 4 + cnt.G * 3;
    let K = landK + lakeK;
    if (has("ai")) K *= 1.3;
    let boom = 1;
    if (has("bomb") && has("armP")) boom = 1.2;
    K *= boom;
    const eng = items.eng || 0;
    let prod = K * 0.1 * eng;
    if (has("h2") && cnt.W) prod += lakeK * (has("ai") ? 1.3 : 1) * boom * 0.1 * eng * 0.5;
    let cons = ITEMS.reduce((a, it) => a + (items[it.id] || 0) * it.up, 0);
    if (has("grid")) cons *= 0.7;

    const A = { 행복: 1, 건강: 1, 치안: 1, 안전: 1, 교육: 1, 환경: 1 };
    const pair = (p, f, attr) => {
      if (has(p)) A[attr] += 2;
      if (has(f)) A[attr] += has(p) ? 2 : 0.5;
    };
    pair("medP", "medF", "건강");
    pair("admP", "admF", "치안");
    pair("eduP", "eduF", "교육");
    pair("armP", "armF", "안전");
    pair("funP", "funF", "행복");
    if (has("medF") && !has("medP")) log.push("의료시설을 효과적으로 사용할 의료전문가가 없다.");
    if (has("admF") && !has("admP")) log.push("행정시설을 운영할 행정전문가가 없어 자원 관리 효율이 낮다.");
    if (has("eduF") && !has("eduP")) log.push("교육시설을 효과적으로 활용할 교육전문가가 없다.");
    if (has("funP")) A["교육"] += 0.5;
    if (has("seed")) { A["건강"] += 1; A["환경"] += 0.5; }
    if (has("h2")) A["환경"] += 0.5;
    ["h2", "grid", "ai", "envlab", "mat"].forEach((l) => { if (has(l)) A["교육"] += 0.5; });
    if (has("ccs")) A["환경"] += 1.5;
    if (has("envlab")) A["환경"] += 1.5;
    if (has("bomb")) {
      if (has("armP")) { A["안전"] += 0.5; log.push("무기전문가가 폭파장치로 켄트로늄 채굴량을 20% 늘렸다."); }
      else { A["안전"] -= 1; log.push("폭파장치를 다룰 무기전문가가 없어 사고 위험이 있다."); }
    }

    A["환경"] += cnt.F * 0.4 + cnt.M * 0.5;
    A["안전"] += cnt.F * 0.25 - cnt.M * 0.4;
    A["건강"] += cnt.G * 0.5 + (cnt.W ? 1 : 0);
    A["행복"] += cnt.G * 0.3 + cnt.F * 0.2;
    if (cnt.L) {
      if (!has("mat")) { A["안전"] -= 1 + cnt.L * 0.5; log.push("용암 분출로 인한 위험 요소가 있다."); }
      else log.push("신소재 연구소의 내열 소재로 용암 지역의 채굴 위험을 줄였다.");
    }
    if ((cnt.L || cnt.D) && !has("hvac")) { A["행복"] -= cnt.L * 0.6 + cnt.D * 0.4; log.push("고온으로 인해 주거가 제한되어 생활이 불편하다."); }
    if (cnt.M) log.push("갯벌의 약한 지반으로 인해 주거가 제한된다. 대신 갯벌은 생태적 기능이 크다.");
    if (sel.length && !(cnt.F + cnt.G)) { A["행복"] -= 1.5; A["건강"] -= 0.5; log.push("거주 여건이 좋은 숲이나 초원이 없어 정착민이 머물 곳이 부족하다."); }

    const pollution = K / 18;
    const offset = (has("envlab") ? 1.5 : 0) + (has("ccs") ? 1 : 0);
    A["환경"] -= Math.max(0, pollution - offset);
    if (pollution > 1.5 && offset < pollution) log.push("켄트로늄 채굴로 인한 환경오염이 쌓이고 있다.");

    ATTR.forEach((k) => (A[k] = Math.max(0, Math.min(5, A[k]))));
    const low = {
      행복: "고립된 환경에서 탐험대가 정서적 안정을 취하기 어려울 수 있다.",
      건강: "질병이나 부상에 대응하기 어려워 탐험대의 건강을 유지하기 어렵다.",
      치안: "정착지의 질서 유지나 치안 유지에 어려움이 있을 수 있다.",
      안전: "예상치 못한 외계 생명체나 위험 요소로부터 정착지를 지키기 어렵다.",
      교육: "정착지의 노하우와 기술, 지식을 다음 세대에 전달하기 어렵다.",
      환경: "행성의 기후 환경을 유지하기 어렵다.",
    };
    ATTR.forEach((k) => { if (A[k] < 1.5) log.push(low[k]); });
    if (eng === 0) log.push("엔지니어가 없어 채굴한 켄트로늄을 에너지로 바꿀 수 없다.");
    return { K, prod, cons, A, log, cnt, eng };
  }
  const level = (v) => (v < 1 ? "매우 부족" : v < 2 ? "부족" : v < 3 ? "보통" : v < 4 ? "양호" : "우수");
  const r1 = (v) => Math.round(v * 10) / 10;

  function g(state) {
    const plain = (o) => o !== null && typeof o === "object" && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
    const old = plain(state.game) ? state.game : {};
    state.game = Object.assign({ sel: [], items: {}, runs: [], showK: true, locked: null, matched: "" }, old);
    const G = state.game;
    /* 같은 칸 번호라도 지도 판이 다르면 지형과 이웃 관계가 달라진다. */
    if (G.mapV !== MAP_V) {
      if ((Array.isArray(G.sel) && G.sel.length) || G.locked || (Array.isArray(G.runs) && G.runs.length) || G.matched) G.mapNotice = true;
      else delete G.mapNotice;
      G.sel = [];
      G.locked = null;
      G.matched = "";
      G.runs = [];
      G.mapV = MAP_V;
    }
    const valid = (a) => Array.isArray(a) && a.length <= MAX_TILES && a.every((id) => Object.hasOwn(TILE, id)) && connected(a);
    const validItem = (id, n) => Object.hasOwn(ITEM, id) && Number.isInteger(n) && n >= 0 && n <= (ITEM[id].max || 1);
    const validItems = (o) => plain(o) && Object.entries(o).every(([id, n]) => validItem(id, n));
    if (!valid(G.sel)) G.sel = [];
    G.items = Object.fromEntries(plain(G.items) ? Object.entries(G.items).filter(([id, n]) => validItem(id, n)) : []);
    if (G.locked && (!valid(G.locked.sel) || !validItems(G.locked.items))) G.locked = null;
    if (G.locked) delete G.mapNotice;
    if (!G.locked) G.matched = "";
    if (!Array.isArray(G.runs)) G.runs = [];
    return G;
  }
  const itemCount = (items) => Object.values(items).reduce((a, b) => a + (b || 0), 0);

  function mapSVG(G, disabled) {
    const s = 18, h = Math.sqrt(3) * s, m = 6;
    let out = "";
    tiles.forEach((t) => {
      const cx = m + s + 1.5 * s * t.c;
      const cy = m + (h / 2) * (dy(t.r, t.c) + 1);
      const pts = [0, 1, 2, 3, 4, 5].map((i) => {
        const a = (Math.PI / 180) * (60 * i);
        return (cx + s * Math.cos(a)).toFixed(1) + "," + (cy + s * Math.sin(a)).toFixed(1);
      }).join(" ");
      const on = G.sel.includes(t.id);
      out += `<g><polygon class="t-${t.t} ${on ? "sel" : ""}" points="${pts}" data-hex="${t.id}" tabindex="${disabled ? -1 : 0}" role="button" aria-pressed="${on}" aria-label="${TER[t.t].n} ${TER[t.t].k}K"><title>${TER[t.t].n} · 연간 채굴가능량 ${TER[t.t].k}K</title></polygon>${G.showK ? `<text x="${cx}" y="${cy + 3.5}" text-anchor="middle">${TER[t.t].k}</text>` : ""}</g>`;
    });
    const W = m * 2 + s * 2 + 1.5 * s * 14, H = m * 2 + (h / 2) * 26;
    return `<svg class="hexmap" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" role="group" aria-label="정착지 지역 배치도">${out}</svg>`;
  }

  KCP.games["2024"] = {
    brief() {
      return `<div class="scenario">
          <p class="label">임무</p>
          <p>새로운 외계 정착 후보지에 대한 정보가 일부 확보되었다. 제공된 정보를 바탕으로 탐험대의 정착지를 결정하고 탐험선에 탑재할 특별 아이템을 10가지 이내로 선택하여 본인만의 탐험 계획을 수립하라. 에너지 수급을 충족하고 다양한 요소를 고려하여 지속 가능한 거주 여건을 마련해야 한다. 특별 아이템 이외에 외계 정착에 필요한 기본적인 장비는 함께 탑재되며, 외계 행성의 환경은 지구와 유사하다.</p>
          <ul class="rules">
            <li>합리적인 근거가 있거나 상식적인 내용은 자유롭게 창의적으로 고려할 수 있다.</li>
            <li>준비 시간 동안 외계 정착 시뮬레이션을 여러 번 시도할 수 있다. 탐사계획을 확정하면 바꿀 수 없고, 그 계획을 토대로 최대 8개 문항이 제시된다.</li>
            <li>재구성: 원래 시험은 준비 종료 5분 전부터 확정할 수 있었습니다. 연습실에서는 언제든 확정할 수 있고, 정착지는 붙어 있는 칸 최대 ${MAX_TILES}개로 정했습니다. 행복·건강 등 속성의 계산식은 비공개여서 새로 설계했습니다.</li>
          </ul>
        </div>
        <div class="task"><b>답변 방식</b><p>문항별 답변 권장 시간(약 2~4분)에 맞춰 발산적 사고력, 문제해결능력, 인문적 통찰 역량이 담긴 생각을 명료하게 표현합니다. 몇 개 문항에 답했는지보다 문항별 답의 질이 중요합니다.</p></div>`;
    },

    renderPrep(root, state, save, next) {
      const G = g(state);
      const locked = !!G.locked;
      root.innerHTML = `
        ${G.mapNotice ? `<p class="caution small" id="map-notice24" role="status">${esc(MAP_NOTICE)}</p>` : ""}
        <div class="desk">
          <div class="stack">
            <section class="panel ${locked ? "locked" : ""}">
              <h3>정착지 <span class="chip num" id="tcount"></span><span class="spacer"></span>
                <label class="small row" style="gap:4px"><input type="checkbox" id="showK" ${G.showK ? "checked" : ""}> 연간 켄트로늄 채굴가능량 보기</label></h3>
              <div class="hexwrap" id="map"></div>
              <div class="table-wrap" style="margin-top:10px"><table class="spec"><thead><tr><th>지역</th><th>채굴가능량</th><th>지역 특성</th><th>연관 특별 아이템</th></tr></thead><tbody>
                ${Object.entries(TER).map(([k, v]) => `<tr><td><span class="legend"><span><i style="background:${TCOL[k]}"></i>${v.n}</span></span></td><td class="num">${v.k}K</td><td class="small">${v.feat}</td><td class="small">${v.rel || "(해당 없음)"}</td></tr>`).join("")}
              </tbody></table></div>
            </section>
            <section class="panel ${locked ? "locked" : ""}">
              <h3>특별 아이템 리스트 <span class="chip num" id="icount"></span></h3>
              <div class="items" id="items"></div>
            </section>
          </div>
          <div class="stack">
            <section class="panel">
              <h3>나의 탐사계획 ${locked ? '<span class="chip accent">확정됨</span>' : ""}</h3>
              <div class="energy" id="energy"></div>
              <div class="gauges" id="gauges" style="margin-top:10px"></div>
              <ul class="log" id="log" style="margin-top:10px"></ul>
              <div class="row" style="margin-top:12px">
                <button class="btn" id="sim" ${locked ? "disabled" : ""}>외계 정착 시뮬레이션</button>
                <span class="small muted" id="runs"></span>
                <span class="spacer"></span>
                ${locked ? '<button class="btn ghost" id="unlock">다시 계획하기</button>' : '<button class="btn primary" id="lock">탐사계획 확정</button>'}
              </div>
              <p class="hint" style="margin-top:6px">에너지 생산량과 소비량은 화면에 바로 표시됩니다. 여섯 가지 속성은 원래 시험처럼 시뮬레이션을 돌려야 보입니다.</p>
            </section>
            ${locked ? `<section class="panel"><h3>각각의 시뮬레이션 결과가 본인의 생각이나 예상과 잘 일치했나요?</h3>
              <div class="seg" role="group" aria-label="예상 일치 여부">
                <button data-match="yes" aria-pressed="${G.matched === "yes"}">예</button><button data-match="no" aria-pressed="${G.matched === "no"}">아니오</button></div>
              <p class="hint" style="margin-top:6px">이 선택에 따라 면접실의 5번 질문이 달라집니다.</p></section>` : ""}
            <section class="panel"><h3>탐험 계획 설명 초안</h3>
              <textarea class="note" id="plan24" style="min-height:120px" placeholder="정착지와 특별 아이템을 고른 이유, 포기한 것과 그 이유">${esc(G.plan || "")}</textarea></section>
            ${KCP.memoPanel(state, save, "memo24")}
            <div class="row"><span class="spacer"></span><button class="btn primary" id="go24" ${locked ? "" : "disabled"}>면접실로 이동</button></div>
            ${locked ? "" : '<p class="hint" style="text-align:right">탐사계획을 확정해야 맞춤형 질문이 만들어집니다.</p>'}
          </div>
        </div>`;

      if (G.mapNotice) {
        delete G.mapNotice;
        save();
      }

      const src = () => (locked ? G.locked : { sel: G.sel, items: G.items });
      const paintMap = () => {
        const s = src();
        KCP.$("#map", root).innerHTML = mapSVG({ sel: s.sel, showK: G.showK }, locked);
        KCP.$("#tcount", root).textContent = `${s.sel.length} / ${MAX_TILES}칸`;
        if (locked) return;
        KCP.$$("[data-hex]", root).forEach((p) => {
          const act = () => {
            const id = p.dataset.hex;
            if (G.sel.includes(id)) {
              const rest = G.sel.filter((x) => x !== id);
              if (!connected(rest)) return KCP.toast("정착지가 둘로 나뉘어 뺄 수 없습니다");
              G.sel = rest;
            } else {
              if (G.sel.length >= MAX_TILES) return KCP.toast(`정착지는 최대 ${MAX_TILES}칸입니다`);
              const t = TILE[id];
              if (G.sel.length && !nbrs(t.r, t.c).some((n) => G.sel.includes(n))) return KCP.toast("이미 고른 칸과 붙어 있는 칸만 고를 수 있습니다");
              G.sel = G.sel.concat(id);
            }
            save(); paintMap(); paintStatus(false);
          };
          p.addEventListener("click", act);
          p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
        });
      };
      const paintItems = () => {
        const s = src();
        KCP.$("#icount", root).textContent = `${itemCount(s.items)} / ${MAX_ITEMS}개`;
        KCP.$("#items", root).innerHTML = ITEMS.map((it) => {
          const n = s.items[it.id] || 0;
          const multi = (it.max || 1) > 1;
          return `<div class="item" aria-pressed="${n > 0}" ${multi ? "" : `data-toggle="${it.id}" role="button" tabindex="${locked ? -1 : 0}"`} title="${esc(it.d)}">
            <b>${esc(it.n)}</b>
            <span class="muted">${it.up ? `유지비 ${it.up}K/년` : "유지비 없음"} · ${it.lab ? "연구소" : multi ? `최대 ${it.max}명` : "1개"}</span>
            ${multi ? `<span class="cnt"><button data-dec="${it.id}" aria-label="${esc(it.n)} 빼기" ${locked ? "disabled" : ""}>−</button><span class="num">${n}</span><button data-inc="${it.id}" aria-label="${esc(it.n)} 더하기" ${locked ? "disabled" : ""}>+</button></span>` : ""}
            <span class="small">${esc(it.d)}</span>
          </div>`;
        }).join("");
        if (locked) return;
        const setN = (id, v) => {
          const it = ITEM[id];
          v = Math.max(0, Math.min(it.max || 1, v));
          const next = Object.assign({}, G.items, { [id]: v });
          if (itemCount(next) > MAX_ITEMS) return KCP.toast(`특별 아이템은 ${MAX_ITEMS}개 이내입니다`);
          G.items = next; save(); paintItems(); paintStatus(false);
        };
        KCP.$$("[data-toggle]", root).forEach((b) => {
          const act = () => setN(b.dataset.toggle, (G.items[b.dataset.toggle] || 0) ? 0 : 1);
          b.addEventListener("click", act);
          b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
        });
        KCP.$$("[data-inc]", root).forEach((b) => (b.onclick = () => setN(b.dataset.inc, (G.items[b.dataset.inc] || 0) + 1)));
        KCP.$$("[data-dec]", root).forEach((b) => (b.onclick = () => setN(b.dataset.dec, (G.items[b.dataset.dec] || 0) - 1)));
      };
      const paintStatus = (showAttrs) => {
        const s = src();
        const r = simulate(s.sel, s.items);
        const ok = r.prod >= r.cons;
        KCP.$("#energy", root).innerHTML = `
          <div><span class="label">연간 켄트로늄 채굴량</span><b>${r1(r.K)}K</b></div>
          <div><span class="label">연간 에너지 생산량</span><b style="color:${ok ? "var(--ok)" : "var(--bad)"}">${r1(r.prod)}</b></div>
          <div><span class="label">연간 에너지 소비량</span><b>${r1(r.cons)}</b></div>`;
        const show = showAttrs || locked;
        KCP.$("#gauges", root).innerHTML = show
          ? ATTR.map((a) => `<div class="gauge"><span class="small"><b>${a}</b> · ${level(r.A[a])}</span><div class="bar"><i style="width:${(r.A[a] / 5) * 100}%;background:${r.A[a] < 1.5 ? "var(--bad)" : r.A[a] < 3 ? "var(--warn)" : "var(--ok)"}"></i></div></div>`).join("")
          : `<p class="small muted">행복 · 건강 · 치안 · 안전 · 교육 · 환경은 시뮬레이션을 실행하면 표시됩니다.</p>`;
        const msgs = (ok ? [] : ["에너지 생산량이 소비량보다 적어 정착에 필요한 에너지를 확보하지 못한다."]).concat(show ? r.log : []);
        KCP.$("#log", root).innerHTML = msgs.map((m) => `<li>${esc(m)}</li>`).join("") || (show ? "<li>큰 위험 요소가 보고되지 않았다.</li>" : "");
        KCP.$("#runs", root).textContent = G.runs.length ? `시뮬레이션 ${G.runs.length}회` : "";
      };
      KCP.$("#showK", root).onchange = (e) => { G.showK = e.target.checked; save(); paintMap(); };
      KCP.$("#sim", root).onclick = () => {
        if (!G.sel.length) return KCP.toast("정착지를 먼저 고르세요");
        const r = simulate(G.sel, G.items);
        G.runs.push({ at: Date.now(), prod: r1(r.prod), cons: r1(r.cons) });
        save(); paintStatus(true);
      };
      if (!locked) {
        KCP.$("#lock", root).onclick = () => {
          if (!G.sel.length || !itemCount(G.items)) return KCP.toast("정착지와 아이템을 먼저 고르세요");
          G.locked = { sel: G.sel.slice(), items: Object.assign({}, G.items) };
          save(); KCP.games["2024"].renderPrep(root, state, save, next);
        };
      } else {
        KCP.$("#unlock", root).onclick = () => { G.locked = null; G.matched = ""; save(); KCP.games["2024"].renderPrep(root, state, save, next); };
        KCP.$$("[data-match]", root).forEach((b) => (b.onclick = () => {
          G.matched = b.dataset.match;
          KCP.$$("[data-match]", root).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          save();
        }));
      }
      KCP.$("#plan24", root).addEventListener("input", (e) => { G.plan = e.target.value; save(); });
      KCP.$("#go24", root).onclick = next;
      paintMap(); paintItems(); paintStatus(G.runs.length > 0);
    },

    questions(state) {
      const G = g(state);
      const qs = [
        { k: "24-c1", src: "report", tag: "공통 1", q: "본인의 탐험 계획을 설명해 주세요. 최종적으로 고른 정착지와 특별 아이템을 선택한 이유는 무엇인가요?", time: "약 2~4분" },
        { k: "24-c2", src: "report", tag: "공통 2", q: "성공적인 정착 계획을 수립하려면 다양한 요소를 고려해야 합니다. 잠재적인 위험 요인은 어떤 것들을 예상했으며, 어떻게 대응할 수 있을까요?", time: "약 2~4분" },
        { k: "24-c3", src: "report", tag: "공통 3", q: "탐험 계획을 수립하려면 다양한 상황과 조건 속에서 단 하나의 최종 선택을 결정해야 합니다. 탐험 계획을 수립하는데 결정이 어려웠던 부분은 특히 무엇이었으며 이 상황에서 본인은 어디에 우선순위를 두었나요?", time: "약 2~4분" },
        { k: "24-c4", src: "report", tag: "공통 4", q: "수립한 탐험 계획을 수행하려면 대중과 탐험위원회를 설득해야 합니다. 본인의 계획을 알리고 지지를 받기 위해서 1년이 주어진다면 어떻게 할 것인가요?" },
        G.matched === "yes"
          ? { k: "24-c5-yes", src: "report", tag: "공통 5 (예)", q: "의사결정 과정에서 모두가 자기 생각과 같은 이야기를 해준다면, 최선의 결론을 내리기 위해 추가로 할 수 있는 것은 어떤 것이 있을까요?", time: "약 2~4분" }
          : { k: "24-c5-diff", src: "report", tag: G.matched === "no" ? "공통 5 (아니오)" : "공통 5", q: "시뮬레이션의 결과와 자신의 예상이 어떤 부분이 달랐나요? 둘 중 어느 것이 더 타당하다고 생각하며, 그 이유는 무엇인가요?", time: "약 2~4분" },
        { k: "24-c6", src: "report", tag: "공통 6", q: "성공적인 임무 수행에 필요할 것으로 예상되는 아이템 한 가지를 추가로 자유롭게 제안해 보세요.", time: "약 2~4분" },
      ];
      if (!G.locked) return qs;
      const { sel, items } = G.locked;
      const r = simulate(sel, items);
      const has = (id) => (items[id] || 0) > 0;
      const indiv = [];
      if (r.prod < r.cons) indiv.push({ k: "24-i-energy-short", tag: "개별 · 에너지", q: "탐험대가 정착에 필요한 에너지를 충분히 확보하지 못하여 정착에 실패했습니다. 성공적인 탐험 계획을 수립하지 못한 이유는 무엇이라고 생각하나요?" });
      else if (r.eng > 0 && simulate(sel, Object.assign({}, items, { eng: r.eng - 1 })).prod >= r.cons) indiv.push({ k: "24-i-energy-over", tag: "개별 · 에너지", q: "탐험 계획에 의하면, 엔지니어를 한 명 더 적게 선택해도 필요한 소비량을 충분히 공급할 수 있습니다. 그럼에도 불구하고 엔지니어를 더 선택한 이유는 무엇인가요? 의도적으로 에너지를 초과 생산하는 것인가요?" });
      const labs = ITEMS.filter((it) => it.lab && has(it.id));
      if (labs.length) indiv.push({ k: "24-i-lab", tag: "개별 · 연구소", q: `탐험대에 ${labs[0].n}를 포함한 이유를 자세히 설명해 주세요. 에너지 수급과 지속 가능한 정착 생활을 위해 어떤 역할을 할 수 있을 것으로 생각하나요?` });
      else indiv.push({ k: "24-i-nolab", tag: "개별 · 연구소", q: "탐험대에 연구소를 포함하지 않아서 향후 에너지 기술 개발에 어려움이 예상됩니다. 본인의 탐험 계획에 연구소를 포함하지 않은 이유와 정착지의 에너지 생산 기술을 획기적으로 개선할 수 있는 대안을 설명해 주세요." });
      const cats = ["med", "adm", "edu", "arm", "fun", "env"];
      const allCats = cats.every((c) => ITEMS.some((it) => it.cat === c && has(it.id)));
      const HIGH = { 행복: ["행복과 정서적 안정을 보장하는 것", "행복이"], 건강: ["건강을 보장하는 것", "건강 보장이"], 치안: ["치안을 보장하는 것", "치안 유지가"], 안전: ["안전을 보장하는 것", "안전 보장이"], 교육: ["교육 여건을 보장하는 것", "교육이"], 환경: ["기후 환경을 보장하는 것", "정착지 기후와 환경이"] };
      const LOW = { 행복: ["탐험대가 정서적 안정을 취하기 어려워 보입니다", "탐험대의 행복을 위해"], 건강: ["탐험대의 건강을 유지하기 어려워 보입니다", "탐험대의 건강을 위해"], 치안: ["정착지의 치안을 유지하기 어려워 보입니다", "탐험대의 질서 유지와 치안을 위해"], 안전: ["정착지의 안전을 유지하기 어려워 보입니다", "탐험대의 안전 보장을 위해"], 교육: ["정착지의 노하우 및 기술과 지식 전달이 어려워 보입니다", "탐험대의 역량 향상과 기술 발전을 위해"], 환경: ["정착지의 기후 환경을 유지하기 어려워 보입니다", "행성의 기후 환경을 관리하기 위해"] };
      const sorted = ATTR.slice().sort((a, b) => r.A[b] - r.A[a]);
      if (allCats) indiv.push({ k: "24-i-attr-all", tag: "개별 · 속성", q: "탐험 계획에 따르면 의료, 행정, 교육, 무장, 여가 및 문화, 환경을 모두 고르게 고려한 것으로 파악됩니다. 그중에서 정착민의 지속 가능한 외계 행성 거주를 위해 가장 중요한 요소 세 가지는 무엇이라고 생각하나요?" });
      else if (r.A[sorted[0]] >= 3.5) indiv.push({ k: "24-i-attr-high", tag: "개별 · 속성", q: `탐험 계획에 따르면 탐험대의 ${HIGH[sorted[0]][0]}을 중요하게 생각한 것으로 판단됩니다. ${HIGH[sorted[0]][1]} 탐험대의 성공적인 정착에 특히 중요한 이유는 무엇인가요?` });
      else { const lo = sorted[sorted.length - 1]; indiv.push({ k: "24-i-attr-low", tag: "개별 · 속성", q: `탐험 계획에 따르면 ${LOW[lo][0]}. ${LOW[lo][1]} 정착지에서 어떤 방안을 마련할 수 있을까요?` }); }
      return qs.concat(indiv.slice(0, 2).map((x) => Object.assign(x, { time: "약 2~4분" })));
    },

    recap(state) {
      const G = g(state);
      const s = G.locked || { sel: G.sel, items: G.items };
      const cnt = {};
      s.sel.forEach((id) => { const n = TER[TILE[id].t].n; cnt[n] = (cnt[n] || 0) + 1; });
      const r = simulate(s.sel, s.items);
      return [
        ...(G.mapNotice ? [{ t: "안내", d: MAP_NOTICE }] : []),
        { t: "상태", d: G.locked ? "탐사계획 확정" : "아직 확정하지 않음" },
        { t: "정착지", d: Object.entries(cnt).map(([k, v]) => `${k} ${v}칸`).join(", ") || "(없음)" },
        { t: "특별 아이템", d: ITEMS.filter((it) => s.items[it.id]).map((it) => (it.max > 1 ? `${it.n} ${s.items[it.id]}명` : it.n)).join(", ") || "(없음)" },
        { t: "에너지", d: `채굴 ${r1(r.K)}K · 생산 ${r1(r.prod)} · 소비 ${r1(r.cons)} (${r.prod >= r.cons ? "자급" : "부족"})` },
        { t: "시뮬레이션 횟수", d: String(G.runs.length) },
        { t: "탐험 계획 설명", d: G.plan || "" },
      ];
    },

    /* 성찰은 recap을 직접 표시하지 않으므로 예시 답안의 열림 여부와 무관하게 안내한다. */
    afterReflect(root, state) {
      const notice = this.recap(state)[0];
      if (notice.t === "안내") root.insertAdjacentHTML("afterbegin", `<p class="caution small" id="map-notice24" role="status">${esc(notice.d)}</p>`);
    },

    reflectExtra() {
      const ex = [
        ["공통 1 · 탐험 계획", "숲 4칸, 갯벌·초원·호수 각 1칸. 용암은 채굴량이 많지만 분출 위험과 주거 제한으로 과감히 제외. 호수는 물 자원 때문에 반드시 포함. 엔지니어 3명, 의료·행정·여가 및 문화·교육 전문가, 수중기지, 차세대그리드 연구소."],
        ["공통 2 · 위험 요인", "내부(시설 고장, 사람 사이의 갈등)와 외부(외계인 조우)로 나눠 생각. 우주왕복선 소프트웨어가 최신보다 안정성을 택한다는 배경지식으로 범용 장비의 장점을 설명."],
        ["공통 3 · 우선순위", "모든 것을 만족시키는 조합은 없었음. 고립된 환경에서의 정서적·심리적 안정과 건강을 우선. 그래서 의료전문가와 의료시설을 우선 포함."],
        ["공통 4 · 설득", "먼저 내 계획이 감이나 간접 근거로 정한 것은 아닌지 다시 검토하고, 틀린 부분은 공개적으로 수정. 그다음 공청회·설명회로 직접 설명."],
        ["공통 5 · 예상과 다른 결과", "무기전문가 대신 행정전문가를 택함. 무기전문가의 효과는 외계 문명을 만날 때만 나타나는 '변수'이고, 행정전문가의 효과는 늘 작동하는 '상수'라고 비유."],
        ["공통 6 · 추가 아이템", "모든 재료로 모든 제품을 만드는 3D 프린터. 사막의 규소로 반도체를, 유기물로 식량을 만들 수 있다고 확장."],
        ["개별 7 · 차세대그리드 연구소", "아이템 수가 제한되어 연구소는 하나만 고름. 정착지가 넓어질수록 에너지 수송이 중요해지고, 손실을 줄이는 것은 그만큼 에너지를 생산한 것과 같은 효과라고 설명."],
        ["개별 8 · 건강", "코로나19 확산으로 사회 경제가 멈춘 경험을 근거로, 시설과 장비도 결국 사람이 온전히 존재하기 위한 도구라고 봄. 그래서 의료전문가와 의료시설을 모두 포함."],
      ];
      return `<p class="small muted" style="margin-bottom:8px">보고서의 예시 답안 요약입니다. 내 답과 비교할 때 논리 구조(분류, 비유, 자기 검토)를 눈여겨보세요.</p>
        ${ex.map(([t, d]) => `<details class="reveal"><summary>${esc(t)} <span class="tag-official">보고서 요약</span></summary><p class="small">${esc(d)}</p></details>`).join("")}
        <details class="reveal"><summary>이 시뮬레이터의 계산 규칙 <span class="tag-mine">재구성</span></summary>
          <ul class="small" style="margin:0;padding-left:1.1em">
            <li>에너지 생산 = 연간 채굴량 × 0.1 × 엔지니어 수. 에너지AI 연구소는 채굴량 +30%, 수소에너지 연구소는 호수 몫의 생산 +50%.</li>
            <li>에너지 소비 = 아이템 유지비 합계. 차세대그리드 연구소는 소비 −30%.</li>
            <li>폭파장치는 무기전문가가 함께 있을 때 채굴량 +20%. 보고서에는 '채굴량도 늘릴 수 있게 한다'고만 적혀 있고 수치는 없습니다.</li>
            <li>수중기지 없이는 호수 채굴량이 절반. 신소재 연구소 없이 용암을 고르면 안전 하락. 냉난방시설 없이 용암·사막을 고르면 행복 하락.</li>
            <li>전문가와 시설을 짝지으면 해당 속성이 크게 오릅니다. 시설만 있으면 효과가 작습니다.</li>
            <li>공통 1 예시 답안에 적힌 조합(숲 4칸, 갯벌·초원·호수 각 1칸, 엔지니어 3명, 의료·행정·여가 및 문화·교육 전문가, 수중기지, 차세대그리드 연구소)은 이 계산식으로 생산 10.5, 소비 9.1입니다. 공통 3·개별 8 예시 답안처럼 의료시설까지 더하면 소비가 11.2로 생산보다 많아집니다. 보고서는 생산량·소비량 수치를 공개하지 않았으므로 원래 시험의 결과와 같다는 뜻은 아닙니다.</li>
          </ul></details>`;
    },
  };
})();
