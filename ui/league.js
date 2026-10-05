/* 멀티플레이 리그 화면: #league(로비) · #league/host(진행자 판) · #league/team(팀 = 도시 건설 화면 + 리그 띠)
 * 진행자 기기가 규칙(league-core)으로 상태를 정하고 4초마다·바뀔 때마다 모두에게 알린다. 팀 기기는 자기 도시만 짓고
 * 계획·판매 단가·연계선 요청을 보낸다. 학생 이름은 받지 않는다(팀 = 도시).
 */
(function () {
  "use strict";
  const KCP = window.KCP;
  if (!KCP || typeof KCP.route !== "function" || !KCP.leagueCore || !KCP.leagueNet || !KCP.buildGame) return;
  const C = KCP.leagueCore, NET = KCP.leagueNet, BG = KCP.buildGame, esc = KCP.esc;
  const REGION = "south";
  // K_TEAM: 이 기기에서 마지막으로 쓴 팀(이어서 하기). K_TAB(sessionStorage): 이 탭의 팀·토큰 — 한 PC에서 탭 여러 개로 시연해도 섞이지 않게.
  // 팀 자료(건설·일지)는 방·팀마다 따로: K_DATA + ":" + 방 + ":" + 팀
  const K_NET = "kcp-league-net-v1", K_HOST = "kcp-league-host-v1", K_TEAM = "kcp-league-team-v1", K_TAB = "kcp-league-tab-v1", K_DATA = "kcp-league-data-v1";
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const SEASON_NAME = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };
  const PHASE_NAME = { lobby: "준비", plan: "계획·협상", run: "운영 중", review: "결과·일지", end: "끝" };
  const JQ = [
    { k: "why", q: "우리 도시는 무엇을, 왜 지었나요?" },
    { k: "nb", q: "우리 선택이 이웃 도시에 준 영향은?" },
    { k: "next", q: "다음 라운드에 바꿀 것 하나와 이유" }
  ];
  const store = {
    get(k) { try { return JSON.parse(window.localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v, replacer) { try { window.localStorage.setItem(k, JSON.stringify(v, replacer)); return true; } catch (e) { return false; } },
    del(k) { try { window.localStorage.removeItem(k); } catch (e) { /* 무시 */ } }
  };
  const tab = {
    get() { try { return JSON.parse(window.sessionStorage.getItem(K_TAB)); } catch (e) { return null; } },
    set(v) { try { window.sessionStorage.setItem(K_TAB, JSON.stringify(v)); } catch (e) { /* 무시 */ } }
  };
  const dataKey = () => `${K_DATA}:${L.room}:${L.team}`;
  const tdata = () => { const d = L?.role === "solo" ? L.interview || {} : store.get(dataKey()) || {}; d.docs = d.docs || {}; d.journal = d.journal || {}; return d; };
  const R = () => C.regionOf(REGION);
  // 이 방에 참가한 도시(2~6곳). 상태 S나 공개 상태 V 둘 다 받는다.
  const actT = X => { const ids = X && Array.isArray(X.active) && X.active.length ? X.active : X && X.teams ? Object.keys(X.teams) : R().teams.map(t => t.id); return R().teams.filter(t => ids.includes(t.id)); };
  const teamName = id => (C.teamDef(R(), id) || { name: id }).name;
  const teamCol = id => (C.teamDef(R(), id) || { color: "#888" }).color;
  const fmt = (x, d = 0) => (typeof x === "number" && isFinite(x) ? x.toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: 0 }) : "–");
  const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  let codeTime = 0;
  function code(n) {
    if (window.crypto?.getRandomValues) {
      const values = window.crypto.getRandomValues(new Uint32Array(n));
      return Array.from(values, v => ALPHA[v % ALPHA.length]).join("");
    }
    // 방 코드만 새로 만든다. 판 안의 사건·컴퓨터 난수는 저장된 코드를 씨앗으로 쓴다.
    codeTime = Math.max(Date.now(), codeTime + 1);
    let value = codeTime;
    return Array.from({ length: n }, () => { const ch = ALPHA[value % ALPHA.length]; value = Math.floor(value / ALPHA.length); return ch; }).join("");
  }
  const validRoom = r => typeof r === "string" && /^[A-Z2-9]{4,6}$/.test(r);
  const netCfg = () => store.get(K_NET) || { kind: "local", url: "", key: "" };
  const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

  let L = null; // { role, room, net, conn, S?(진행자 상태), snap?(받은 공개 상태), team?, token?, timers[] }
  function close() {
    if (!L) return;
    saveSolo();
    L.timers.forEach(t => clearInterval(t));
    clearTimeout(L.planT); clearTimeout(L.pending);
    if (L.conn) L.conn.close();
    L = null;
  }
  KCP.on("route:change", ({ name, arg }) => {
    if (name !== "league") { close(); return; }
    if (L && L.role === "host" && arg !== "host" && !/^view\//.test(arg || "")) close();
    if (L && L.role === "host") L.viewing = /^view\//.test(arg || "") ? arg.slice(5) : null;
    if (L && L.role === "team" && !/^team/.test(arg)) close();
    if (L && L.role === "solo" && arg !== "solo") close();
  });

  const QUESTIONS = {
  "lg-c-site": "이번 달 가장 큰 설비를 그 자리에 지은 이유를 지도 숫자 하나로 말해 보세요.",
  "lg-c-balance": "지금까지 우리 도시는 균형과 집중 가운데 어느 쪽이었나요?",
  "lg-c-hidden": "화면에 숫자로 보이지 않는데 결과를 바꾼 것이 있었다면 무엇이라고 짐작하나요?",
  "lg-p-predict": "예측한 정전 변화와 실제 결과가 달랐습니다. 무엇이 예측을 빗나가게 했을까요?",
  "lg-p-line": "처음 선언한 '지킬 선'을 넘었습니다. 선과 계획 가운데 무엇을 바꾸겠습니까?",
  "lg-i-overbuild": "남는 공급 능력이 수요보다 꽤 큽니다. 일부러 여유를 둔 것인가요?",
  "lg-i-smoke": "화력 설비 가까운 마을의 민원이 늘었습니다. 그 주민에게 어떻게 설명하겠습니까?",
  "lg-i-timing": "연구나 큰 투자를 지금 시작한 것은 이른가요, 늦은가요?",
  "lg-i-lab": "연구소의 연구가 실제 도입까지 가기 전에 게임이 끝난다면, 그래도 지을 가치가 있나요?",
  "lg-i-gap": "주민이 {nb} 쪽으로 빠져나갔습니다. 우리가 못한 것과 {nb}가 잘한 것 중 무엇이 더 컸을까요?",
  "lg-i-cause": "이번 달 뉴스 세 개를 원인에서 결과 순서로 놓아 보세요. 어느 연결이 가장 약한가요?",
  "lg-i-offer": "기업 이전 조건 가운데 우리가 못 맞춘 하나를 맞추려면 무엇을 포기해야 하나요?",
  "lg-r-co2": "환경단체의 반문: \"정전은 줄었지만 CO₂가 늘었습니다. 어느 쪽을 지키겠습니까?\" 고치나요, 유지하나요?",
  "lg-r-outage": "직장인의 반문: \"CO₂는 줄었지만 정전이 늘었습니다. 공장이 멈추면 일자리는요?\" 고치나요, 유지하나요?",
  "lg-r-tax": "노년층의 반문: \"세금을 올려 돈은 모였는데 우리 생활은 나아졌나요?\" 고치나요, 유지하나요?",
  "lg-r-free": "청년층의 반문: \"세금을 내리고 서비스를 늘리면 좋지만, 빚은 누가 갚나요?\" 고치나요, 유지하나요?",
  "lg-r-tie": "{nb}의 반문: \"연계선을 거절해서 우리 정전이 늘었습니다. 이웃은 남인가요?\" 고치나요, 유지하나요?",
  "lg-f-typhoon": "태풍으로 연계선 하나가 한 달 끊긴다면, 우리 계획에서 가장 먼저 무너질 곳은 어디인가요?",
  "lg-f-lag": "정책 효과가 바로 나타난다면 이번 결정은 달라졌을까요?",
  "lg-d-headline": "다음 달 우리 도시 신문 1면 제목을 하나 지어 보세요. 그 제목이 나오려면 지금 무엇을 해야 하나요?",
  "lg-e-weights": "점수표에서 우리 순위를 가장 많이 올린 항목과 깎은 항목은? 그 가중치는 공정한가요?",
  "lg-h-approval": "주민 평가 결과가 나왔습니다. 가장 낮은 집단을 다음 해에 어떻게 대하겠습니까?",
  "lg-h-criterion": "이 리그 점수표에 항목 하나를 더한다면 무엇을 넣겠습니까?"
};
  /* 경제 화면 계산. 표시용 추정은 엔진 결과와 구분한다. */
  const SCORE_NAMES = { pop: "주민", ind: "산업", fin: "재정", co2: "탄소", appr: "지지", rel: "전력 신뢰" };
  const PART_NAMES = { rel: "전력 신뢰", price: "전기요금", air: "공기", jobs: "일자리", svc: "공공서비스", tax: "세금", crowd: "집값·혼잡", A: "산업 여건", out: "산출", taxI: "산업 세금", ren: "재생", co2: "탄소" };
  // G: 질문 빈도·문턱은 ECON-UI U4와 INTERVIEW §4의 화면 가정이다. 엔진 계수가 아니다.
  const IQ = { large: 0.2, co2Up: 0.05, spare: 0.3, gapWide: 40, gapNarrow: 10, approval: 3, rank: 2, quarter: 3, target: 6, max: 8, line: 50 };
  const END_Q = ["우리 계획을 기준 먼저, 2분 동안 설명해 보세요.", "가장 어려웠던 결정에서 무엇을 포기했나요?", "예측과 결과가 가장 크게 어긋난 달은 언제였나요?", "받은 반문 하나에 대해 고치거나 유지하는 최종 이유는?", "이 리그 점수표에 항목 하나를 더한다면 무엇을 넣겠습니까?"];
  const params = k => KCP.ECON_DATA.params[k].v;
  const signed = (x, d = 0) => `${x > 0 ? "+" : ""}${fmt(x, d)}`;
  function reweightScore(score, weights) {
    const total = Object.values(weights).reduce((a, x) => a + Math.max(0, Number(x) || 0), 0);
    const rows = (score?.rank || []).map((r, i) => ({ ...r, order: i, score: total ? Object.keys(SCORE_NAMES).reduce((a, k) => a + (r.parts[k] || 0) * Math.max(0, Number(weights[k]) || 0), 0) / total : r.score }));
    return rows.sort((a, b) => b.score - a.score || a.order - b.order).map((r, i) => ({ ...r, rank: i + 1 }));
  }
  function causeBreakdown(before, after, weights, actual, proportional) {
    const total = Object.values(weights).reduce((a, x) => a + x, 0) || 1;
    const all = Object.keys(weights).map(k => ({ key: k, value: ((after[k] || 0) - (before[k] || 0)) * weights[k] / total }));
    if (proportional) {
      const sum = all.reduce((a, x) => a + x.value, 0);
      // 주민 이동은 비선형이므로 기여 비율로 나누고 나머지를 별도로 표시한다.
      if (Math.abs(sum) > Number.EPSILON) all.forEach(x => { x.value *= actual / sum; });
      else all.push({ key: "other", value: actual });
    } else {
      const residual = actual - all.reduce((a, x) => a + x.value, 0);
      if (Math.abs(residual) > Number.EPSILON) all.push({ key: "other", value: residual });
    }
    return all.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }
  function chooseQuestion(x) {
    const tests = {
      "lg-c-site": x.large, "lg-c-balance": x.quarter && (x.spread >= IQ.gapWide || x.spread <= IQ.gapNarrow),
      "lg-c-hidden": x.quarter && Math.abs(x.dApproval) > IQ.approval && !x.policyQuarter,
      "lg-p-predict": x.miss, "lg-p-line": x.crossed,
      "lg-i-overbuild": x.spare >= x.peak * IQ.spare && x.peak > 0 && x.uns === 0,
      "lg-i-smoke": x.complaints > 0 || x.lowGroup === "green", "lg-i-timing": x.firstResearch || x.left <= IQ.quarter && x.large,
      "lg-i-lab": x.labPending && x.left <= IQ.quarter + 1, "lg-i-gap": x.outflow,
      "lg-i-cause": x.news >= IQ.quarter, "lg-i-offer": x.offerFail === 1,
      "lg-r-co2": x.dUns < 0 && x.co2Growth >= IQ.co2Up, "lg-r-outage": x.dUns > 0 && x.co2Growth <= -IQ.co2Up,
      "lg-r-tax": x.tax >= 1 && x.dSenior < 0, "lg-r-free": x.tax <= -1 && x.service >= 1 && x.balance < 0,
      "lg-r-tie": x.rejected && x.neighborWorse, "lg-f-typhoon": x.quarter && x.tradeShare >= IQ.large && x.ties > 0,
      "lg-f-lag": x.policyPrevious, "lg-d-headline": x.quarter,
      "lg-e-weights": x.quarter && Math.abs(x.dRank) >= IQ.rank,
      "lg-h-approval": x.evaluation, "lg-h-criterion": x.end
    };
    const candidates = Object.keys(tests).filter(k => tests[k] && k !== x.last && (!x.allowed || x.allowed.some(prefix => k.startsWith(prefix))));
    const priority = x.crit?.includes("rel") ? ["lg-r-co2", "lg-r-outage"] : x.crit?.includes("co2") ? ["lg-r-outage", "lg-r-co2"] : [];
    return [...priority, ...candidates.filter(k => k.startsWith("lg-r-")), "lg-p-line", "lg-p-predict", ...candidates].find(k => candidates.includes(k)) || null;
  }
  function putData(d) {
    if (L.role === "solo") soloMutate(() => { L.interview = d; });
    else store.set(dataKey(), d);
  }
  function monthNote() {
    const d = tdata(), rd = L.snap?.round || 0;
    d.interview = d.interview || {}; d.interview.months = d.interview.months || {};
    d.interview.months[rd] = d.interview.months[rd] || {};
    return { d, n: d.interview.months[rd] };
  }
  function curtailEvents(V, round, id) {
    const reg = C.regionOf(V.region || REGION);
    return (V.events || []).filter(ev => ev.round === round && ev.id === "light_load_curtailment")
      .map(ev => ({ ev, E: C.eventDef(reg, ev.id) }))
      .filter(({ E }) => E && (!id || C.hits(reg, E, id)));
  }
  function curtailHTML(V, res, id, monthMWh) {
    if (!V.econ) return "";
    if (!res?.team[id]) return `<section class="lg-curtail"><h4>버린 재생 전기</h4><p class="lg-hint">첫 운영 뒤에 표시됩니다.</p></section>`;
    const r = res.team[id], rd = C.roundsOf(V)[res.round - 1];
    // B18 결과는 대표 일수, 경제 보고서는 월 MWh. 월 값 0도 그대로 우선한다.
    const mwh = monthMWh ?? res.econ?.grid?.[id]?.curtailMWh ??
      (r.curtailMWh == null ? undefined : r.curtailMWh * (rd.mdays || rd.days) / rd.days);
    const events = curtailEvents(V, res.round, id);
    const eventText = events.map(({ ev, E }) => {
      const o = (E.opts || []).find(o => o.id === V.teams[id]?.resp?.[res.round + ":" + E.id]);
      const dv = o && typeof o.dev === "number" && (!o.knobs || o.knobs.includes("solarMul")) ? o.dev : 1;
      const mul = Math.max(0, 1 + (E.effect.solarMul - 1) * (typeof ev.x === "number" ? ev.x : 1) * dv);
      return `<div><dt>출력제어 사건</dt><dd>${esc(`사건: 태양광 ${pct((mul - 1) * 100)}%`)}${typeof ev.x === "number" ? "" : " (기본 크기)"}</dd><small>현상 <span class="tag-official">${esc(E.grade || "G")}</span> · 크기 <span class="tag-mine">G</span></small></div>`;
    }).join("");
    // renPct는 수요 대비 재생 공급(배터리 포함)의 반올림 값이라 발전량 분모로 쓰지 않는다. 대신 그 달 수요 대비 비율을 보인다.
    const demMonth = r.dem > 0 ? r.dem * (rd.mdays || rd.days) / rd.days : 0;
    const share = demMonth > 0 && typeof mwh === "number" ? `그 달 전기 수요의 ${fmt(100 * mwh / demMonth, 2)}%` : "–";
    return `<section class="lg-curtail" aria-label="버린 재생 전기"><h4>버린 재생 전기</h4><p class="lg-hint">${esc(resLabel(res))} · 월 기준</p>
      <dl><div><dt>계통 접속 출력제어</dt><dd>${esc(fmt(mwh, 2))} MWh</dd><small>${esc(share)} · <span class="tag-mine">G</span></small></div>
      ${eventText || `<div><dt>출력제어 사건</dt><dd>이번 달 사건 없음</dd></div>`}</dl>
      <p class="lg-hint">전력망 접속 여유가 모자라거나 전기가 남는 봄·가을에는 재생 전기를 버립니다. 배터리와 연계선이 있으면 덜 버려요.</p></section>`;
  }
  function cityHTML(V) {
    const E = V.econ, c = E.cities[L.team], rep = E.report, f = rep?.fiscal[L.team], g = rep?.groups[L.team];
    const h = c.hist, prev = E.before?.[L.team], dp = rep?.cities[L.team]?.dPop || 0, di = rep?.cities[L.team]?.dInd || 0;
    const groups = Object.keys(c.groups), low = groups.slice().sort((a, b) => c.groups[a] - c.groups[b])[0];
    const pol = V.teams[L.team].econPol || c.policy || {}, open = V.phase === "plan";
    const every = params("reviewEvery"), remaining = every - E.t % every;
    const grid = c.grid || V.grid?.[L.team];
    const revenues = { subsidy: "재정지원금", resTax: "주민세", indTax: "산업세", tariff: "전기요금 차익", trade: "전력 판매", bonus: "사건 지원금", salvage: "철거 회수" };
    const expenses = { capex: "건설", fuel: "연료", opex: "운영", service: "공공서비스", incentive: "유치 보조", interest: "이자", trade: "전력 구매", polChange: "정책 변경", policy: "시위 중 정책 변경" };
    const money = (title, vals, names) => `<h4>${title}</h4><dl class="lg-money">${Object.keys(vals || {}).map(k => `<div><dt>${esc(names[k] || k)}</dt><dd>${esc(fmt(vals[k], 2))}억</dd></div>`).join("")}</dl>`;
    return `<section id="lg-city" class="lg-sec"><h3>${esc(c.name)} 도시 <span class="tag-official">시작값: 공식 통계</span></h3>
      <dl class="lg-kpi"><div><dt>주민</dt><dd>${esc(fmt(c.pop))}명</dd><small>지난달 ${esc(signed(dp))}명</small></div><div><dt>종사자</dt><dd>${esc(fmt(c.ind))}명</dd><small>지난달 ${esc(signed(di))}명</small></div><div><dt>${c.cash < 0 ? "지방채" : "현금"}</dt><dd>${esc(fmt(c.cash, 1))}억</dd><small>지방채 한도 ${esc(fmt(c.debtCap, 1))}억</small></div><div><dt>지지율</dt><dd>${esc(fmt(c.approval, 1))}%</dd><small>다음 평가 ${esc(fmt(remaining))}달 뒤 · 통과 ≥ ${esc(fmt(c.approval0 - params("approvalDrop"), 1))}%</small></div></dl>
      <section id="lg-grid" aria-label="재생 접속과 출력제어"><dl><div><dt>재생 접속 여유(남은/전체)</dt><dd>${esc(fmt(grid?.headroomMW, 1))} / ${esc(fmt(grid?.hostMW, 1))} MW</dd></div><div><dt>접속 대기</dt><dd data-waiting="${grid?.waitingMW > 0}">${esc(fmt(grid?.waitingMW, 1))} MW</dd></div></dl>${curtailHTML(V, V.results.at(-1), L.team)}<p class="lg-hint">재생 설비는 지어도 전력망 접속 여유가 있어야 발전합니다. ESS와 연계선이 여유를 늘립니다. <span class="tag-mine">G · 접속·출력제어</span> <span class="tag-official">O* · ESS 충전 상한</span></p></section>
      <h4>집단 만족</h4>${groups.map(k => `<div class="lg-grp" data-g="${esc(k)}"><button type="button" data-group="${esc(k)}" aria-expanded="${L.group === k}">${esc(KCP.ECON_DATA.groups[k].name)} · 비중 ${esc(fmt(c.shares[k] * 100, 1))}% · 만족 ${esc(fmt(c.groups[k], 1))}점</button><meter min="0" max="100" value="${esc(c.groups[k])}" aria-label="${esc(KCP.ECON_DATA.groups[k].name)} 만족"></meter>${k === low && g?.why ? `<p class="lg-why">왜? ${esc(g.why.text)}</p>` : ""}${L.group === k ? groupCauseHTML(c, k, rep, prev) : ""}</div>`).join("")}
      <section id="lg-econpol"><h4>정책 <span class="tag-mine">G</span></h4>${[["taxRes", "주민 세율", "세입↑ / 주민 매력↓"], ["taxInd", "산업 세율", "세입↑ / 기업 매력↓"], ["service", "공공서비스", "생활 만족↑ / 지출↑"], ["incentive", "기업 유치 보조", "기업 매력↑ / 지출↑"]].map(([k, name, help]) => `<label class="lg-policy"><span>${name} <output>${esc(fmt(pol[k] || 0, 1))}${k === "incentive" ? "억/달" : "단계"}</output></span><input type="range" data-pol="${k}" min="${k === "incentive" ? 0 : -2}" max="${k === "incentive" ? 20 : 2}" step="1" value="${esc(pol[k] || 0)}" ${open ? "" : "disabled"}><small>얻는 것 / 잃는 것: ${help}</small></label>`).join("")}</section>
      <section id="lg-fiscal"><h4>지난달 돈</h4>${f ? `${money("세입", f.rev, revenues)}${money("세출", f.exp, expenses)}<p>운영 수지(건설 제외) ${esc(signed(f.revTotal - f.expTotal + f.exp.capex, 2))}억</p><p class="lg-hint">연료 ${esc(fmt((V.results.at(-1)?.team[L.team]?.cost.fuel || 0) * (rep.weekMul || 1), 2))}억(전기요금 차익에 이미 반영). 총 전기 매출(참고) ${esc(fmt(f.tariffGross, 2))}억</p>` : `<p class="lg-hint">첫 운영 뒤에 표시됩니다.</p>`}</section>
      <section id="lg-moves"><h4>지난달 이주·이전</h4>${movesHTML(rep, L.team)}</section>
      <section id="lg-offers"><h4>기업 이전 희망</h4>${E.offers.length ? E.offers.map(o => { const e = o.eval?.by[L.team]; return `<article class="lg-offer" data-offer="${esc(o.id)}"><b>${esc(o.name)} · ${esc(fmt(o.workers))}명</b>${e ? `<p>조건 충족 도시 우선 순위 ${esc(e.rank)}위</p>${Object.entries(e.checks).map(([k, v]) => `<p data-check="${esc(k)}" data-ok="${v.ok ? "true" : "false"}">${v.ok ? "✓" : "✗"} ${esc({ mw: "여유 전력", re: "재생", rel: "정전", workers: "구직 인력" }[k])}: 우리 ${esc(fmt(v.have, 1))}${esc({ mw: " MW", re: "%", rel: "%", workers: "명" }[k])} / 조건 ${k === "rel" ? "≤" : "≥"} ${esc(fmt(v.need, 1))}${esc({ mw: " MW", re: "%", rel: "%", workers: "명" }[k])}</p>`).join("")}` : `<p>운영 뒤 조건 평가가 표시됩니다.</p>`}</article>`; }).join("") : `<p class="lg-hint">열린 제안이 없습니다.</p>`}</section>
      <p class="lg-hint">이주 속도 ×${esc(fmt(E.eduSpeed, 2))}(수업용 배속, 실제보다 빠름) <span class="tag-mine">G · 수업용 배속</span></p></section>`;
  }
  function groupCauseHTML(c, key, rep, prev) {
    const weights = params("groupW")[key], parts = c.groupParts || {}, target = rep?.cities[L.team]?.Lparts || {};
    const bars = causeBreakdown({}, parts, weights, 0, false).filter(x => x.key !== "other");
    return `<div class="lg-cause"><p class="lg-hint">생활 항목이 만족도에 더한 점수 · 옅은 글 상자: 앞으로 반영될 변화(G)</p>${bars.map(x => `<div>${esc(PART_NAMES[x.key] || x.key)} ${esc(fmt(x.value, 1))}점<meter min="0" max="100" value="${esc(Math.max(0, x.value))}" aria-label="현재 기여"></meter>${target[x.key] != null ? `<span class="lg-pending">앞으로 반영될 변화 ${esc(signed((target[x.key] - (parts[x.key] || 0)) * weights[x.key], 1))}점</span>` : ""}</div>`).join("")}</div>`;
  }
  function movesHTML(rep, id) {
    const rows = ["pop", "ind"].flatMap(k => (rep?.flows[k] || []).filter(f => !id || f.from === id || f.to === id).map(f => ({ ...f, kind: k })));
    return rows.length ? `<ul class="lg-movelist">${rows.map(f => `<li>${esc(teamName(f.from))} → ${esc(teamName(f.to))} ${esc(fmt(f.n))}명(${f.kind === "pop" ? "주민" : "종사자"}): ${esc(f.why)}</li>`).join("")}</ul>` : `<p class="lg-hint">지난달 보고된 흐름이 없습니다.</p>`;
  }
  function rankHTML(E, nearby) {
    const rows = E.score?.rank || [], own = rows.findIndex(r => r.id === L.team), prev = E.previousScore?.by || {};
    const leaders = Object.fromEntries(Object.keys(SCORE_NAMES).map(k => [k, Math.max(...rows.map(r => r.parts[k]))]));
    return `<section id="lg-rank" class="lg-sec"><h2>${L.snap?.phase === "end" ? "최종 순위" : "도시 순위"} <span class="tag-mine">모형 점수 · G</span></h2><div class="lg-rankrows">${rows.map((r, i) => {
      const shown = !nearby || Math.abs(i - own) <= 1, delta = prev[r.id] ? prev[r.id].rank - r.rank : 0;
      return `<article class="lg-rankrow" data-team="${esc(r.id)}" data-rank="${esc(r.rank)}" data-me="${r.id === L.team}"><h3>${esc(r.rank)}위 ${shown ? esc(r.name) : ""} <small>${delta ? `${delta > 0 ? "▲" : "▼"}${esc(Math.abs(delta))}` : "–"}</small></h3>${shown ? `<b data-total>${esc(fmt(r.score, 1))}점</b><p>지역 전체의 성장을 빼고 본 변화: 주민 ${esc(signed((E.cities[r.id].pop / E.cities[r.id].pop0 / (E.totals.pop / E.totals.pop0) - 1) * 100, 2))}% · 산업 ${esc(signed((E.cities[r.id].ind / E.cities[r.id].ind0 / (E.totals.ind / E.totals.ind0) - 1) * 100, 2))}%</p><div class="lg-scoreparts">${Object.keys(SCORE_NAMES).map(k => `<div data-part="${k}" data-leader="${r.parts[k] === leaders[k]}"><span>${SCORE_NAMES[k]} ${esc(fmt(r.parts[k], 1))}점 ${r.parts[k] === leaders[k] ? "· 1위(동점 포함)" : ""}</span><meter min="0" max="100" value="${esc(r.parts[k])}" aria-label="${SCORE_NAMES[k]} 부분 점수"></meter></div>`).join("")}</div>` : ""}</article>`;
    }).join("")}</div>${nearby ? `<p class="lg-hint">내 도시와 바로 위·아래 도시의 이름을 보여 줍니다.</p>` : ""}</section>`;
  }
  function tickerHTML(V) {
    const E = V.econ;
    const I = E.intl || {}, exports = Object.values(I.export || {}), ex = exports.length ? exports.reduce((a, x) => a + x, 0) / exports.length : 1;
    const curtail = curtailEvents(V, V.round).length ? `<p class="lg-curtail-news">출력제어: 남는 재생 전기를 버렸어요 — 저장·연계선이 있으면 덜 버립니다 <small>현상 <span class="tag-official">O</span> · 크기·대응 <span class="tag-mine">G</span></small></p>` : "";
    return `<section id="lg-ticker" class="lg-ticker" aria-label="국제 지수와 뉴스"><div class="lg-indices">${[["lng", "LNG", I.lng], ["fx", "환율", I.fx], ["export", "수출(부문 평균)", ex], ["ship", "해운", I.ship]].map(([k, name, v]) => `<span data-index="${k}" data-direction="${v >= 1 ? "up" : "down"}">${name} ${esc(fmt(v, 2))} ${v >= 1 ? "▲" : "▼"}</span>`).join("")}</div><p class="lg-hint">지수 1 = 기준</p>${curtail}${(E.intlActive || []).map(x => `<p>${esc((KCP.ECON_DATA.intl.events.find(e => e.id === x.id) || x).name || x.id)}</p>`).join("")}${(E.report?.news || []).slice(0, IQ.quarter).map(x => `<p>${esc(x)}</p>`).join("")}</section>`;
  }
  function criterionDraft(V) {
    const { n } = monthNote(), firstYear = curRound().year === C.roundsOf(V)[0].year;
    const crit = L.pendingCrit || n.crit || V.teams[L.team].crit || { chips: [], line: IQ.line, choice: "keep" };
    // 새해 1월에는 지난해 유지/바꾸기 선택을 이어받지 않는다.
    return { chips: crit.chips.slice(), line: crit.line, choice: curRound().month === 1 && !firstYear && !n.crit ? null : crit.choice };
  }
  const validCritLine = value => Number.isFinite(value) && value >= 0 && value <= 100;
  function critHTML(V) {
    if (V.phase !== "plan" || curRound().month !== 1) return "";
    const crit = criterionDraft(V), { n } = monthNote(), firstYear = curRound().year === C.roundsOf(V)[0].year;
    return `<section id="lg-crit" class="lg-sec"><h3>${L.role === "solo" ? "내 기준" : "우리 기준"}</h3><p>도시가 가장 지키고 싶은 항목 1~2개를 고르세요. 첫 항목의 부분 점수를 지킬 선으로 둡니다.</p><div class="lg-acts">${Object.entries(SCORE_NAMES).map(([k, name]) => `<button type="button" class="v2-btn" data-crit="${k}" aria-pressed="${crit.chips.includes(k)}">${name}</button>`).join("")}</div><label class="lg-field">${esc(SCORE_NAMES[crit.chips[0]] || "선택 첫 항목")} 지킬 선(점 이상)<input id="lg-crit-line" type="number" min="0" max="100" value="${esc(validCritLine(crit.line) ? crit.line : "")}"></label>${firstYear ? "" : `<div class="lg-acts"><button class="v2-btn" type="button" data-crit-choice="keep" aria-pressed="${crit.choice === "keep"}">유지</button><button class="v2-btn" type="button" data-crit-choice="change" aria-pressed="${crit.choice === "change"}">바꾸기</button></div>`}<label class="lg-jq">이유 한 줄(기기에만)<textarea data-note="critReason" rows="2" maxlength="1000">${esc(n.critReason || "")}</textarea></label><p class="lg-hint">정해진 항목·숫자·유지/바꿈만 진행자에게 보냅니다. 고르지 않으면 기준 미선택으로 둡니다.</p></section>`;
  }
  function predictionHTML(V) {
    const { n } = monthNote();
    if (V.phase !== "plan" || !largeDecision()) return "";
    return `<section id="lg-predict" class="lg-sec"><h3>기준 먼저 · 예측(선택)</h3><label class="lg-jq">이번 결정의 기준: 무엇 때문에 무엇을 골랐나요?<textarea data-note="decision" rows="2" maxlength="1000">${esc(n.decision || "")}</textarea></label>${[["uns", "정전"], ["cash", "현금"]].map(([k, name]) => `<label class="lg-field">이번 달 ${name} 방향<select data-pred="${k}"><option value="">건너뛰기</option>${[["up", "늘 것"], ["down", "줄 것"], ["same", "같을 것"]].map(([v, label]) => `<option value="${v}" ${n.pred?.[k] === v ? "selected" : ""}>${label}</option>`).join("")}</select></label>`).join("")}<p class="lg-hint">세입과 생활, 전력 신뢰와 탄소에서 얻는 것 / 잃는 것을 함께 보세요.</p>${L.awaitReady ? `<button class="v2-btn primary" type="button" id="lg-ready-confirm">이 기준으로 준비</button><button class="v2-btn" type="button" id="lg-predict-skip">건너뛰고 준비</button>` : ""}</section>`;
  }
  function largeDecision() {
    const V = L.snap, { n } = monthNote(), me = V?.teams[L.team];
    if (!V?.econ || V.phase !== "plan") return false;
    const st = BG.current(), old = (me.base || []).reduce((a, x) => a + (x.c || 0), 0);
    return !!n.big || !!st && Math.max(0, BG.capex(st) - old) >= me.budget * IQ.large;
  }
  function questionContext(V) {
    const E = V.econ, rep = E.report, res = V.results.at(-1), prevRes = V.results.at(-2), r = res?.team[L.team], p = prevRes?.team[L.team], c = E.cities[L.team], prev = E.before?.[L.team], { d, n } = monthNote();
    const inv = d.interview?.months || {}, keys = Object.keys(inv).map(Number).sort((a, b) => a - b), last = keys.filter(k => k < V.round).map(k => inv[k].ask).filter(Boolean).at(-1);
    const parts = E.score.by[L.team].parts, pol = V.teams[L.team].econPol || c.policy;
    const dir = x => x > 0 ? "up" : x < 0 ? "down" : "same";
    const outflow = (rep?.flows.pop || []).filter(f => f.from === L.team).sort((a, b) => b.n - a.n)[0];
    const quarterMonths = keys.filter(k => k > V.round - IQ.quarter && k <= V.round);
    return { large: !!n.big, quarter: V.round % IQ.quarter === 0, spread: Math.max(...Object.values(parts)) - Math.min(...Object.values(parts)), dApproval: c.approval - (prev?.approval ?? c.approval), policyQuarter: quarterMonths.some(k => inv[k].policy), miss: n.pred?.uns && p && n.pred.uns !== dir(r.unsPct - p.unsPct), crossed: V.teams[L.team].crit && parts[V.teams[L.team].crit.chips[0]] < V.teams[L.team].crit.line && !keys.some(k => k < V.round && inv[k].crossed), spare: r?.spareMW || 0, peak: r && BG.peakDemand ? BG.peakDemand(Object.fromEntries((BG.current()?.policies || []).map(k => [k, true])), BG.current()?.fab2) : 0, uns: r?.unsPct, complaints: r?.cp || 0, lowGroup: Object.keys(c.groups).sort((a, b) => c.groups[a] - c.groups[b])[0], left: C.roundsOf(V).length - V.round, firstResearch: !!n.research, labPending: (BG.current()?.builds || []).some(b => b.t === "lab") && Object.keys(V.teams[L.team].rs?.prog || {}).length > 0, outflow: !!outflow, nb: outflow?.to || actT(V).find(t => t.id !== L.team)?.id, news: rep?.news.length || 0, offerFail: E.offers.map(o => o.eval?.by[L.team]?.fail.length).find(x => x === 1), dUns: p ? r.unsPct - p.unsPct : 0, co2Growth: p?.co2Prod ? r.co2Prod / p.co2Prod - 1 : 0, tax: pol.taxRes || 0, service: pol.service || 0, dSenior: c.groups.senior - (prev?.groups.senior ?? c.groups.senior), balance: rep ? rep.fiscal[L.team].revTotal - rep.fiscal[L.team].expTotal + rep.fiscal[L.team].exp.capex : 0, rejected: !!n.rejected, neighborWorse: !!n.rejectedOther && p && res.team[n.rejectedOther]?.unsPct > prevRes.team[n.rejectedOther]?.unsPct, ties: V.ties.filter(t => t.st === "built").length, tradeShare: rep ? (rep.fiscal[L.team].rev.trade || 0) / Math.max(1, rep.fiscal[L.team].revTotal) : 0, policyPrevious: !!inv[V.round - 1]?.policy, dRank: (E.previousScore?.by[L.team]?.rank || 0) - E.score.by[L.team].rank, evaluation: !!rep?.review?.[L.team], end: V.phase === "end", last, crit: V.teams[L.team].crit?.chips };
  }
  const questionText = (key, x = {}) => (QUESTIONS[key] || "").replaceAll("{city}", teamName(L.team)).replaceAll("{nb}", teamName(x.nb || L.team));
  function causeHTML(V) {
    const E = V.econ, c = E.cities[L.team], prev = E.before?.[L.team], rep = E.report;
    if (!rep || !prev) return "";
    const pop = causeBreakdown(prev.lagL, c.lagL, params("wL"), rep.net[L.team].pop, true);
    const weights = {};
    Object.keys(c.shares).forEach(g => {
      const gw = params("groupW")[g], sum = Object.values(gw).reduce((a, v) => a + v, 0) || 1;
      Object.keys(gw).forEach(k => { weights[k] = (weights[k] || 0) + c.shares[g] * gw[k] / sum; });
    });
    const approval = causeBreakdown(prev.groupParts || {}, c.groupParts || {}, weights, c.approval - prev.approval, false);
    const bars = (rows, unit, groups) => rows.slice(0, IQ.quarter).map(x => `<div data-cause="${esc(x.key)}"><span>${esc(PART_NAMES[x.key] || (groups ? "지연·집단 반응" : "처음 인구 비중과 이웃 도시의 상황"))}: ${esc(signed(x.value, 1))}${unit}</span><meter min="0" max="${esc(Math.max(1, ...rows.map(y => Math.abs(y.value))))}" value="${esc(Math.abs(x.value))}" aria-label="기여 크기"></meter></div>`).join("");
    return `<section id="lg-causes" class="lg-sec lg-cause"><h3>무엇이 결과를 만들었나</h3><p class="lg-why">왜? ${esc(rep.groups[L.team].why.text)}</p><h4>주민 이동 ${esc(signed(rep.net[L.team].pop))}명</h4>${bars(pop, "명", false)}<p class="lg-hint">항목별 점수 변화의 비중으로 나눈 설명용 추정(G). 처음 인구 비중, 이웃 도시의 상황, 자연 증가 ${esc(fmt(rep.net[L.team].growPop))}명도 작용합니다.</p><h4>지지율 ${esc(signed(c.approval - prev.approval, 1))}%p</h4>${bars(approval, "%p", true)}<p class="lg-hint">생활 항목의 변화와 집단별 중요도·비중을 곱한 설명입니다. 반영 지연·병원 정전·시위·점수 범위 제한에서 생긴 차이는 나머지 영향으로 모아 표시합니다(G).</p></section>`;
  }
  function resultInterviewHTML(V) {
    if (!V.econ || !["review", "end"].includes(V.phase)) return "";
    const { d, n } = monthNote(), x = questionContext(V), months = d.interview.months, asked = Object.values(months).filter(m => m.ask).length;
    if (!n.ask && asked < IQ.max && (x.crossed || x.miss || V.round % Math.max(1, Math.ceil(C.roundsOf(V).length / IQ.target)) === 0)) {
      const key = chooseQuestion(x); if (key) { n.ask = key; n.nb = key === "lg-r-tie" ? n.rejectedOther : x.nb; } putData(d);
    }
    if (x.crossed && !n.crossed) { n.crossed = true; putData(d); }
    const res = V.results.at(-1)?.team[L.team], prev = V.results.at(-2)?.team[L.team], c = V.econ.cities[L.team];
    const pred = n.pred ? `<section class="lg-pred"><h3>예측과 결과</h3>${[["uns", "정전", prev ? res.unsPct - prev.unsPct : null, "%p"], ["cash", "현금", c.cash - (V.econ.before?.[L.team]?.cash ?? c.cash), "억"]].map(([k, name, change, unit]) => `<p>${name} 예측: ${esc({ up: "늘 것", down: "줄 것", same: "같을 것" }[n.pred[k]] || "건너뜀")} / 결과: ${change == null ? "첫 달 기준 없음" : `${esc(signed(change, 2))}${unit}`}</p>`).join("")}</section>` : "";
    return `${causeHTML(V)}${pred}${n.ask ? `<section class="lg-ask lg-sec" data-question="${esc(n.ask)}"><h3>반문 한 장 <span class="tag-mine">연습용</span></h3><p>정전 ${esc(fmt(res?.unsPct, 2))}% · CO₂ ${esc(fmt(res?.co2Prod))} t · 현금 ${esc(fmt(c.cash, 1))}억</p><p>${esc(questionText(n.ask, { nb: n.nb }))}</p><div class="lg-acts">${[["revise", "고치겠다"], ["keep", "유지하겠다"]].map(([k, name]) => `<button class="v2-btn" type="button" data-answer="${k}" aria-pressed="${n.answer === k}">${name}</button>`).join("")}</div><label class="lg-jq">이유 한 줄(기기에만)<textarea data-note="askReason" rows="2" maxlength="1000" placeholder="${esc(KCP.STARTERS?.[n.answer || "keep"]?.[0] || "이 판단의 이유는…")}">${esc(n.askReason || "")}</textarea></label></section>` : ""}`;
  }
  function quarterHTML(V) {
    if (!V.econ || V.round % IQ.quarter !== 0 || !["review", "end"].includes(V.phase)) return "";
    const { d, n } = monthNote(), x = questionContext(V);
    if (!n.quarterKey) {
      const eligible = chooseQuestion({ ...x, last: null, allowed: ["lg-c-", "lg-i-"] });
      n.quarterKey = x.evaluation ? "lg-h-approval" : V.round / IQ.quarter % 2 === 0 ? "lg-d-headline" : eligible || "lg-d-headline"; putData(d);
    }
    const c = V.econ.cities[L.team], hist = c.hist, old = hist.at(-IQ.quarter - 1) || V.econ.before?.[L.team];
    return `<label class="lg-jq" id="lg-quarter" data-question="${esc(n.quarterKey)}"><span>분기 질문: ${esc(questionText(n.quarterKey, x))}</span><small>주민 ${esc(signed(c.pop - (old?.pop || c.pop)))}명 · 지지율 ${esc(fmt(c.approval, 1))}% · 현재 ${esc(V.econ.score.by[L.team].rank)}위${x.evaluation ? ` · 주민 평가 ${V.econ.report.review[L.team].pass ? "통과" : "미통과"}` : ""}</small><textarea data-note="quarterAnswer" rows="3" maxlength="1000">${esc(n.quarterAnswer || "")}</textarea></label>${L.role === "solo" ? `<button class="v2-btn" type="button" id="lg-quarter-skip">분기 질문 건너뛰기</button>` : ""}`;
  }
  function debriefHTML(E) {
    const top = E.score?.rank[0], cards = ["주민이 가장 많이 들어온 도시와 순위 1위 도시가 다릅니다. 무엇이 둘을 갈랐을까요?", "연계선으로 이웃의 정전을 줄인 도시가 있습니다. 그 대가는 누가 졌나요?", "점수 가중치를 탄소 0.30으로 바꾸면 순위가 어떻게 바뀔까요?", "가장 늦게 효과가 나타난 결정은 무엇이었나요?", "이 게임이 현실과 가장 다른 점 하나를 꼽는다면?"];
    return `<section id="lg-debrief" class="lg-sec"><h2>디브리핑</h2><p>종합 1위 ${esc(top?.name || "")} · 이주 속도(수업용) ×${esc(fmt(E.eduSpeed, 2))}(G)</p><div class="lg-debriefcards">${cards.map((q, i) => `<article class="lg-card" data-debrief="${i + 1}"><h3>${i + 1}. ${esc(q)}</h3></article>`).join("")}</div><p>${esc((E.report?.news || []).slice(0, IQ.quarter).join(" → "))}</p><section id="lg-wsim"><h3>가중치를 바꾸면?</h3><p class="lg-hint">화면에서만 다시 계산합니다. 원래 점수와 엔진 상태는 유지됩니다. 모두 0이면 원래 점수를 씁니다.</p>${Object.entries(SCORE_NAMES).map(([k, name]) => `<label class="lg-policy"><span>${name} <output data-weight-value="${k}">${esc(fmt(params("wScore")[k], 2))}</output></span><input type="range" data-weight="${k}" min="0" max="1" step="0.05" value="${esc(params("wScore")[k])}"></label>`).join("")}<ol id="lg-wrank">${reweightScore(E.score, params("wScore")).map(r => `<li>${esc(r.name)} ${esc(fmt(r.score, 1))}점</li>`).join("")}</ol></section></section>`;
  }
  function endHTML(V) {
    const { d } = monthNote(), inv = d.interview, end = inv.end || {}, rep = V.econ.report;
    const crit = V.teams[L.team].crit, reasons = [rep?.groups[L.team]?.why.text, ...(rep?.flows.pop || []).filter(f => f.from === L.team || f.to === L.team).map(f => f.why), ...(rep?.news || [])].filter(Boolean).slice(0, IQ.quarter);
    while (reasons.length < IQ.quarter) reasons.push("지난달 보고된 추가 원인 문구가 없습니다.");
    return `${rankHTML(V.econ, L.role !== "solo")}<section id="lg-final-causes" class="lg-sec"><h3>무엇이 이 결과를 만들었나</h3>${reasons.map(x => `<p>${esc(x)}</p>`).join("")}</section>${L.role === "solo" ? debriefHTML(V.econ) : ""}<section id="lg-reflect" class="lg-sec"><h3>끝 성찰</h3><button class="v2-btn" type="button" id="lg-speak">말로 해 보기 · 2분</button><output id="lg-speak-time" aria-live="off">2:00</output><p>선언한 기준: ${esc(crit?.chips.map(k => SCORE_NAMES[k]).join(" · ") || "미선택")} · 지킬 선 ${esc(crit?.line ?? "–")}점</p><p>건너뛴 분기 질문 ${esc(Object.values(inv.months).filter(m => m.quarterSkip).length)}개</p>${END_Q.map((q, i) => `<label class="lg-jq"><span>${esc(L.role === "solo" ? q.replaceAll("우리", "내") : q)}</span><textarea data-end="${i}" rows="3" maxlength="1000">${esc(end[i] || "")}</textarea></label>`).join("")}<fieldset class="lg-pick"><legend>자기 점검 <span class="tag-mine">연습용 평가 기준</span></legend>${(KCP.HABITS || []).map(h => `<label class="lg-radio"><span><input type="checkbox" data-habit="${esc(h.k)}" ${inv.habits?.[h.k] ? "checked" : ""}>${esc(h.n)}</span></label>`).join("")}</fieldset><button class="v2-btn" type="button" id="lg-jcopy">활동지로 복사</button></section>`;
  }
  function worksheet(V) {
    const d = tdata(), inv = d.interview || {}, c = V.econ?.cities[L.team], lines = [`[${R().name} 전력 리그] ${teamName(L.team)}`];
    if (c) lines.push(`최종 지표: 주민 ${fmt(c.pop)}명 · 종사자 ${fmt(c.ind)}명 · 현금 ${fmt(c.cash, 1)}억 · 지지율 ${fmt(c.approval, 1)}%`, ...Object.entries(V.econ.score.by[L.team].parts).map(([k, v]) => `${SCORE_NAMES[k]} ${fmt(v, 1)}점`));
    Object.entries(inv.months || {}).forEach(([rd, n]) => { lines.push(`■ ${rd}달`, n.crit ? `기준 ${n.crit.chips.map(k => SCORE_NAMES[k]).join(" · ")} / ${n.crit.line}점 / ${n.crit.choice === "keep" ? "유지" : "바꿈"}\n${n.critReason || ""}` : "", n.decision || "", n.pred ? `예측: ${JSON.stringify(n.pred)}` : "", n.ask ? `${questionText(n.ask, { nb: n.nb })}\n${n.answer === "revise" ? "고침" : n.answer === "keep" ? "유지" : "미응답"}: ${n.askReason || ""}` : "", n.quarterKey ? `${questionText(n.quarterKey)}\n${n.quarterAnswer || (n.quarterSkip ? "건너뜀" : "")}` : "", ...JQ.map(q => `${q.q}\n${d.journal?.[rd]?.[q.k] || ""}`)); });
    (KCP.HABITS || []).forEach(h => lines.push(`${inv.habits?.[h.k] ? "✓" : "□"} ${h.n}`));
    END_Q.forEach((q, i) => lines.push(`■ ${q}\n${inv.end?.[i] || ""}`));
    return lines.filter(Boolean).join("\n\n");
  }
  function weightSimulation(E, weights) {
    if (!E.scoreState || !KCP.econ) return reweightScore(E.score, weights);
    const total = Object.values(weights).reduce((a, v) => a + Math.max(0, v), 0);
    if (!total) return E.score.rank;
    const data = { ...KCP.ECON_DATA, params: { ...KCP.ECON_DATA.params, wScore: { ...KCP.ECON_DATA.params.wScore, v: weights } } };
    return KCP.econ.score(E.scoreState, data).rank;
  }
  function updateWeights(root, E) {
    const weights = Object.fromEntries([...root.querySelectorAll("[data-weight]")].map(el => [el.dataset.weight, +el.value]));
    root.querySelectorAll("[data-weight-value]").forEach(el => { el.textContent = fmt(weights[el.dataset.weightValue], 2); });
    const target = root.querySelector("#lg-wrank"); if (target) target.innerHTML = weightSimulation(E, weights).map(r => `<li>${esc(r.name)} ${esc(fmt(r.score, 1))}점</li>`).join("");
  }

  const K_SOLO = "kcp-league-solo-v1";
  let pendingSolo = null, soloNotice = "";
  let soloSaveFailed = false, soloSaveWarned = false;
  function warnSoloSave() {
    if (!soloSaveFailed || soloSaveWarned || !document.getElementById("lg-bar")) return;
    soloSaveWarned = true;
    BG.toast("진행을 저장하지 못했습니다. 브라우저 저장 공간·설정을 확인하세요.");
  }
  function writeSolo(save) {
    // JSON은 -0을 0으로 쓴다. 경제 보고서의 원본 값도 맞춰 저장·복원 비교가 같게 한다.
    if (!store.set(K_SOLO, save, function (key, value) {
      if (Object.is(value, -0)) { this[key] = 0; return 0; }
      return value;
    })) soloSaveFailed = true;
    warnSoloSave();
  }
  function saveSolo() {
    if (L?.role === "solo") writeSolo({ v: 1, state: L.S, team: L.team, style: L.style, interview: L.interview, aiRound: L.aiRound || 0 });
  }
  // 실패 응답·예외·중첩 요청에서도 마지막 상태를 저장한다. 멀티는 기존 경로를 그대로 쓴다.
  function soloMutate(fn) {
    const session = L;
    if (session?.role !== "solo") return fn();
    session.mutating = (session.mutating || 0) + 1;
    // 예외면 반쯤 바뀐 상태를 저장하지 않는다(새로고침하면 마지막 정상 저장으로 돌아간다).
    let ok = false;
    try { const r = fn(); ok = true; return r; }
    finally { if (--session.mutating === 0 && L === session && ok) saveSolo(); }
  }
  window.addEventListener("pagehide", saveSolo);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveSolo(); });
  function startSolo(app, fresh) {
    let validSave = false;
    try {
      const save = fresh || pendingSolo || store.get(K_SOLO);
      pendingSolo = null;
      const object = x => !!x && typeof x === "object" && !Array.isArray(x);
      const valid = save?.state?.region === REGION && object(save.state.teams) && C.validTeams(R(), Object.keys(save.state.teams)).ok
        && typeof save.team === "string" && Object.hasOwn(save.state.teams, save.team) && object(save.state.teams[save.team])
        && actT(save.state).some(t => t.id === save.team) && object(save.interview)
        && object(save.state.econ?.cities) && Object.hasOwn(save.state.econ.cities, save.team) && object(save.state.econ.cities[save.team]);
      if (!valid) throw new Error("solo-save");
      validSave = true;
      if (L?.role !== "solo") {
        close();
        L = { role: "solo", room: save.state.room, S: save.state, team: save.team, style: save.style || "balanced", token: save.state.teams[save.team].token, timers: [], snap: null, rev: 0, planT: 0, skew: 0, interview: save.interview || { docs: {}, journal: {} }, aiRound: save.aiRound || 0 };
        const listeners = {}, session = L;
        L.conn = { kind: "solo", status: () => "open", close() {}, on(ev, fn) { listeners[ev] = fn; }, onStatus(fn) { fn("open"); }, send(ev, m) {
          if (ev !== "req" || L !== session) return;
          soloMutate(() => {
            const result = C.reduce(L.S, m, 0, BG);
            if (!result.ok) { listeners.nack?.({ ...m, err: result.err }); return; }
            if (m.type === "tie" && L.S.phase === "plan") C.computerPlans(L.S, BG, L.team, L.style, true);
            BG.selectPack(C.teamDef(R(), L.team).pack, "league");
            queueMicrotask(() => { if (L === session) soloMutate(() => listeners.snap?.(C.publicView(L.S, Date.now()))); });
          });
        } };
        L.conn.on("snap", onSnap); L.conn.on("nack", nack);
      }
      L.app = app;
      soloMutate(() => {
        if (L.S.phase === "lobby") { C.host(L.S, "next", 0); L.S.ends = null; }
        soloComputers();
        L.snap = C.publicView(L.S, Date.now());
        mountCity(app);
        if (L.S.phase === "end" || L.S.phase === "review") openPanel("result");
        else if (curRound().month === 1) openPanel("journal");
      });
      warnSoloSave();
    } catch (e) {
      close(); pendingSolo = null;
      // 정상 저장을 읽은 뒤의 컴퓨터 계산·화면 오류는 진행 기록을 지우지 않는다.
      if (validSave) soloNotice = "혼자 하기 화면을 열지 못했습니다. 저장된 진행은 유지됩니다.";
      else { store.del(K_SOLO); soloNotice = "저장값을 읽지 못해 지웠습니다. 새로 시작하세요."; }
      if (location.hash !== "#league") location.hash = "#league"; else lobby(app);
    }
  }
  function soloComputers() {
    if (L.S.phase !== "plan" || L.aiRound === L.S.round) return;
    soloMutate(() => {
      if (KCP.leagueAI?.plan) {
        C.computerPlans(L.S, BG, L.team, L.style, false);
        // 뒤 도시가 보낸 제안에도 앞 도시가 답할 수 있도록 응답을 한 번 더 통과시킨다.
        C.computerPlans(L.S, BG, L.team, L.style, true);
        L.aiRound = L.S.round;
      }
      BG.selectPack(C.teamDef(R(), L.team).pack, "league");
    });
  }
  function soloNext() {
    if (L.busy || L.S.phase === "end") return;
    L.busy = true;
    try {
      soloMutate(() => {
        clearTimeout(L.planT);
        if (L.S.phase === "plan") {
          sendPlan(); soloComputers(); C.computerPlans(L.S, BG, L.team, L.style, true);
          C.reduce(L.S, { type: "ready", team: L.team, token: L.token, ready: true }, 0, BG);
          C.run(L.S, BG, 0);
          const { d, n } = monthNote(); n.big = n.big || largeDecision(); putData(d);
        } else C.host(L.S, "next", 0);
        L.S.ends = null; soloComputers();
        BG.selectPack(C.teamDef(R(), L.team).pack, "league");
        onSnap(C.publicView(L.S, Date.now()));
      });
    } finally { L.busy = false; }
  }
  function readyAction(skip) {
    const V = L.snap;
    if (!V) return;
    const { d, n } = monthNote();
    if (!skip && !L.awaitReady && V.econ && V.phase === "plan" && largeDecision() && !n.confirmed) { L.awaitReady = true; openPanel("journal"); renderBar(); return; }
    if (V.econ && V.phase === "plan") {
      const crit = criterionDraft(V), el = document.getElementById("lg-crit-line");
      if (el) crit.line = el.valueAsNumber;
      if (crit.chips.length) {
        if (!validCritLine(crit.line)) { BG.toast("지킬 선은 0~100점으로 적으세요"); return; }
        if (!crit.choice) { BG.toast("올해 기준을 유지할지 바꿀지 고르세요"); openPanel("journal"); return; }
        if (curRound().month === 1 && crit.choice === "change" && !n.critReason?.trim()) { BG.toast("기준을 바꾸는 이유를 한 줄 적으세요"); openPanel("journal"); return; }
        n.crit = crit; send("crit", crit);
      }
    }
    n.confirmed = true; n.big = n.big || largeDecision();
    putData(d); L.awaitReady = false; renderBar();
    if (L.role === "solo") soloNext();
    else { clearTimeout(L.planT); sendPlan(); send("ready", { ready: !V.teams[L.team].ready }); }
  }
  function restartSolo() {
    close(); store.del(K_SOLO); location.hash = "#league";
  }

  function econClick(e) {
    if (!L.snap?.econ) return false;
    if (e.target.closest("#lg-speak")) {
      const session = L; L.speakUntil = Date.now() + 2 * 60 * 1000;
      if (L.speakTimer) clearInterval(L.speakTimer);
      L.speakTimer = setInterval(() => { if (L !== session) return; const out = document.getElementById("lg-speak-time"); if (out) out.textContent = mmss(L.speakUntil - Date.now()); if (Date.now() >= L.speakUntil) clearInterval(L.speakTimer); }, 1000);
      L.timers.push(L.speakTimer); return true;
    }
    const V = L.snap, { d, n } = monthNote(), chip = e.target.closest("[data-crit]"), choice = e.target.closest("[data-crit-choice]");
    if (chip || choice) {
      if (V.phase !== "plan") return true;
      const old = criterionDraft(V), crit = { ...old, chips: old.chips.slice() };
      if (chip) {
        const key = chip.dataset.crit;
        if (crit.chips.includes(key)) { if (crit.chips.length === 1) return true; crit.chips = crit.chips.filter(k => k !== key); }
        else { if (crit.chips.length === 2) crit.chips.shift(); crit.chips.push(key); }
      }
      if (choice) crit.choice = choice.dataset.critChoice;
      const el = document.getElementById("lg-crit-line"); if (el) crit.line = el.valueAsNumber;
      if (!validCritLine(crit.line)) { BG.toast("지킬 선은 0~100점으로 적으세요"); return true; }
      L.pendingCrit = crit; n.crit = crit; putData(d);
      if (crit.chips.length && crit.choice) send("crit", crit);
      renderPanel(); return true;
    }
    const group = e.target.closest("[data-group]");
    if (group) { L.group = L.group === group.dataset.group ? null : group.dataset.group; renderPanel(); return true; }
    const answer = e.target.closest("[data-answer]");
    if (answer) { n.answer = answer.dataset.answer; putData(d); renderPanel(); return true; }
    if (e.target.closest("#lg-ready-confirm") || e.target.closest("#lg-predict-skip")) { readyAction(true); return true; }
    if (e.target.closest("#lg-quarter-skip")) { n.quarterSkip = true; putData(d); BG.toast("분기 질문을 건너뛰었습니다"); return true; }
    return false;
  }
  function econChange(e) {
    if (!L.snap?.econ) return false;
    const pol = e.target.closest("[data-pol]"), line = e.target.closest("#lg-crit-line"), note = e.target.closest("[data-note]"), pred = e.target.closest("[data-pred]"), end = e.target.closest("[data-end]"), weight = e.target.closest("[data-weight]"), habit = e.target.closest("[data-habit]");
    const { d, n } = monthNote();
    if (habit) { d.interview.habits = d.interview.habits || {}; d.interview.habits[habit.dataset.habit] = habit.checked; putData(d); return true; }
    if (pol) {
      const policy = Object.fromEntries([...document.querySelectorAll("#lg-econpol [data-pol]")].map(el => [el.dataset.pol, +el.value]));
      n.big = true; n.policy = true; n.confirmed = false; putData(d); send("econ", policy); return true;
    }
    if (line) {
      if (e.type !== "input" || L.snap.phase !== "plan") return true;
      const crit = { ...criterionDraft(L.snap), line: line.valueAsNumber };
      L.pendingCrit = crit; n.crit = crit; putData(d); return true;
    }
    if (note) { n[note.dataset.note] = note.value.slice(0, 1000); putData(d); return true; }
    if (pred) { n.pred = n.pred || {}; n.pred[pred.dataset.pred] = pred.value; putData(d); return true; }
    if (end) { d.interview.end = d.interview.end || {}; d.interview.end[end.dataset.end] = end.value.slice(0, 1000); putData(d); return true; }
    if (weight) { updateWeights(document.getElementById("lg-panel"), L.snap.econ); return true; }
    return false;
  }

  /* ================= 로비 ================= */
  function lobby(app, joinArg) {
    let pre = null;
    if (joinArg) { try { pre = JSON.parse(b64d(joinArg)); } catch (e) { pre = null; } }
    if (pre && pre.n && pre.n.kind === "supabase") store.set(K_NET, { kind: "supabase", url: String(pre.n.url || ""), key: String(pre.n.key || "") });
    const soloSave = store.get(K_SOLO);
    const net = netCfg(), hostSave = store.get(K_HOST), lastTeam = store.get(K_TEAM);
    const reg = R();
    app.innerHTML = `
      <main class="lg-lobby">
        <header class="lg-lhead">
          <a class="lg-back" href="#home">← 연습실 홈</a>
          <p class="v2-kicker">GRID TYCOON · ${esc(reg.short)}</p>
          <h1>${esc(reg.name)} 전력 리그</h1>
          <p class="lg-sub">6팀이 도시 하나씩 맡아 전력망을 짓고, 남는 전기를 이웃과 사고팝니다. 계절마다 한 라운드.</p>
          <ul class="lg-cities">${reg.teams.map(t => `<li style="--c:${t.color}">${esc(t.name)}</li>`).join("")}</ul>
        </header>
        <section class="lg-cards">
          <article class="lg-card" id="lg-solo"><h2>혼자 하기</h2><p class="lg-hint">${esc(soloNotice || "한 탭에서 컴퓨터 도시와 1달씩 진행합니다. 준비 버튼으로 운영합니다.")}</p>
            <label class="lg-field">내 도시<select id="lg-solo-city">${reg.teams.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select></label>
            <fieldset class="lg-pick"><legend>함께할 도시(컴퓨터 포함 2~6곳)</legend><div class="lg-solo-cities">${reg.teams.map(t => `<label class="lg-pickcity"><input type="checkbox" data-solo-city="${esc(t.id)}" checked ${(reg.must || []).includes(t.id) ? "disabled" : ""}>${esc(t.name)}</label>`).join("")}</div></fieldset>
            <label class="lg-field">게임 길이<select id="lg-solo-turns">${[12, 24, 36].map(n => `<option value="${n}">${n}달</option>`).join("")}</select></label>
            <label class="lg-field">컴퓨터 성향<select id="lg-solo-style"><option value="careful">신중</option><option value="balanced" selected>균형</option><option value="bold">공격</option></select></label>
            <button class="v2-btn primary lg-big" type="button" id="lg-solo-start">혼자 시작</button>${soloSave?.state ? `<a class="v2-btn lg-big" id="lg-solo-resume" href="#league/solo">이어서 하기</a><button class="v2-btn" type="button" id="lg-solo-reset">처음부터</button>` : ""}
          </article>
          <article class="lg-card">
            <h2>팀으로 참가</h2>
            <label class="lg-field"><span>방 코드</span><input id="lg-code" inputmode="text" autocomplete="off" maxlength="6" value="${esc(pre && validRoom(pre.r) ? pre.r : "")}" placeholder="예: K7QH2" aria-describedby="lg-code-h"></label>
            <p class="lg-hint" id="lg-code-h">진행자 화면에 보이는 4~6글자</p>
            <button type="button" class="v2-btn primary lg-big" id="lg-join">참가하기</button>
            ${lastTeam && validRoom(lastTeam.room) && lastTeam.team ? `<button type="button" class="v2-btn lg-big" id="lg-rejoin">이어서: ${esc(teamName(lastTeam.team))} 팀 · 방 ${esc(lastTeam.room)}</button>` : ""}
          </article>
          <article class="lg-card">
            <h2>진행자(교사)</h2>
            <p class="lg-hint">방을 만들고 라운드를 넘깁니다. 프로젝터에 띄우기 좋은 화면입니다.</p>
            <fieldset class="lg-pick">
              <legend>참가 도시 <b id="lg-pickn"></b></legend>
              <div class="lg-presets" role="group" aria-label="인원별 추천">${[2, 3, 4, 5, 6].map(n => `<button type="button" class="lg-preset" data-preset="${n}" aria-pressed="${n === 6}">${n}팀</button>`).join("")}</div>
              <div class="lg-pickc">${reg.teams.map(t => { const must = (reg.must || []).includes(t.id); return `<label class="lg-pickcity" style="--c:${t.color}"><input type="checkbox" value="${t.id}" checked ${must ? "disabled" : ""}><span>${esc(t.name)}${must ? " <small>필수</small>" : ""}</span></label>`; }).join("")}</div>
              <p class="lg-hint" id="lg-pickmsg">${esc((reg.must || []).map(teamName).join(" · "))}은(는) 꼭 들어가고, 고른 도시끼리 이웃해야 합니다.</p>
            </fieldset>
            <fieldset class="lg-pick">
              <legend>게임 길이</legend>
              <div class="lg-presets" role="group" aria-label="게임 길이">${[[0, "계절 4라운드"], [12, "12달(1년)"], [24, "24달"], [36, "36달"]].map(([n, t]) => `<button type="button" class="lg-preset" data-turns="${n}" aria-pressed="${n === 12}">${t}</button>`).join("")}</div>
              <p class="lg-hint" id="lg-turnmsg">1턴 = 1달. 해마다 1월에 국가 재정지원금, 달마다 세금. 주민·기업은 살기 좋은 도시로 옮겨 갑니다.</p>
            </fieldset>
            <button type="button" class="v2-btn primary lg-big" id="lg-host">새 방 만들기</button>
            ${hostSave && validRoom(hostSave.room) ? `<button type="button" class="v2-btn lg-big" id="lg-rehost">이어서 진행: 방 ${esc(hostSave.room)}</button>` : ""}
          </article>
        </section>
        <details class="lg-net" ${net.kind === "supabase" ? "open" : ""}>
          <summary>연결 방식: <b id="lg-net-now">${net.kind === "supabase" ? "온라인(태블릿마다)" : "이 기기(탭끼리)"}</b></summary>
          <fieldset class="lg-radio">
            <legend class="lg-sr">연결 방식</legend>
            <label><input type="radio" name="lg-net" value="local" ${net.kind !== "supabase" ? "checked" : ""}> 이 기기(같은 브라우저의 탭끼리 — 시연·연습)</label>
            <label><input type="radio" name="lg-net" value="supabase" ${net.kind === "supabase" ? "checked" : ""}> 온라인(Supabase Realtime — 태블릿마다)</label>
          </fieldset>
          <div class="lg-sb" ${net.kind === "supabase" ? "" : "hidden"}>
            <label class="lg-field"><span>프로젝트 주소</span><input id="lg-url" autocomplete="off" placeholder="https://xxxx.supabase.co" value="${esc(net.url || "")}"></label>
            <label class="lg-field"><span>공개 키(publishable / anon)</span><input id="lg-key" autocomplete="off" value="${esc(net.key || "")}"></label>
            <p class="lg-hint">서버에 저장하지 않는 실시간 중계만 씁니다. 학생 이름·개인정보는 오가지 않습니다. 비밀(service) 키는 넣지 마세요.</p>
          </div>
        </details>
        <p class="lg-err" id="lg-err" role="alert"></p>
      </main>`;
    const $ = s => app.querySelector(s);
    const errEl = $("#lg-err");
    const readNet = () => {
      const kind = app.querySelector("input[name=lg-net]:checked").value;
      const cfg = { kind, url: $("#lg-url").value.trim(), key: $("#lg-key").value.trim() };
      if (kind === "supabase") {
        if (!NET.wsUrl(cfg.url, cfg.key) || !cfg.key) { errEl.textContent = "Supabase 프로젝트 주소와 공개 키를 확인하세요."; return null; }
        if (/service_role|sb_secret_/.test(cfg.key)) { errEl.textContent = "비밀 키는 쓰면 안 됩니다. 공개(publishable/anon) 키를 넣으세요."; return null; }
      }
      store.set(K_NET, cfg);
      return cfg;
    };
    app.querySelectorAll("input[name=lg-net]").forEach(r => r.addEventListener("change", () => {
      const sb = r.value === "supabase" && r.checked;
      $(".lg-sb").hidden = !sb && r.checked ? true : $(".lg-sb").hidden;
      if (r.checked) { $(".lg-sb").hidden = r.value !== "supabase"; $("#lg-net-now").textContent = r.value === "supabase" ? "온라인(태블릿마다)" : "이 기기(탭끼리)"; }
    }));
    soloNotice = "";
    $("#lg-solo-start").addEventListener("click", () => {
      const player = $("#lg-solo-city").value, ids = [...app.querySelectorAll("[data-solo-city]:checked")].map(b => b.dataset.soloCity);
      if (!ids.includes(player)) ids.push(player);
      const check = C.validTeams(reg, ids);
      if (!check.ok) { errEl.textContent = check.err; return; }
      const state = C.newState(code(6), REGION, 0, check.ids, { turns: +$("#lg-solo-turns").value });
      check.ids.forEach(id => C.reduce(state, { type: "claim", team: id, token: `solo-city-${id}` }, 0, BG));
      close(); pendingSolo = { v: 1, state, team: player, style: $("#lg-solo-style").value, interview: { docs: {}, journal: {} } }; writeSolo(pendingSolo);
      location.hash = "#league/solo";
    });
    $("#lg-solo-reset")?.addEventListener("click", () => { store.del(K_SOLO); lobby(app); });
    $("#lg-join").addEventListener("click", () => {
      const room = $("#lg-code").value.trim().toUpperCase();
      if (!validRoom(room)) { errEl.textContent = "방 코드는 4~6글자(영문·숫자)입니다."; $("#lg-code").focus(); return; }
      const n = readNet();
      if (!n) return;
      const cur = tab.get();
      tab.set(cur && cur.room === room ? cur : { room, net: n, team: null, token: code(16) });
      location.hash = "#league/team";
    });
    const rj = $("#lg-rejoin");
    if (rj) rj.addEventListener("click", () => { tab.set({ room: lastTeam.room, net: lastTeam.net, team: lastTeam.team, token: lastTeam.token }); location.hash = "#league/team"; });
    $("#lg-host").addEventListener("click", () => {
      const n = readNet();
      if (!n) return;
      if (hostSave && hostSave.state && hostSave.state.phase !== "end" && !window.confirm(`진행 중인 방 ${hostSave.room}을 닫고 새로 만들까요?`)) return;
      const V = C.validTeams(reg, picked());
      if (!V.ok) { errEl.textContent = V.err; return; }
      const room = code(5);
      const tb = app.querySelector("[data-turns][aria-pressed=true]"), turns = tb ? +tb.dataset.turns : 0;
      store.set(K_HOST, { room, net: n, state: C.newState(room, REGION, Date.now(), V.ids, turns ? { turns } : null) });
      location.hash = "#league/host";
    });
    app.querySelectorAll("[data-turns]").forEach(b => b.addEventListener("click", () => {
      app.querySelectorAll("[data-turns]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      const m = $("#lg-turnmsg"); if (m) m.textContent = +b.dataset.turns ? "1턴 = 1달. 해마다 1월에 국가 재정지원금, 달마다 세금. 주민·기업은 살기 좋은 도시로 옮겨 갑니다." : "봄·여름·가을·겨울 4라운드(라운드마다 예산이 25%씩 늘어남). 경제(주민·세금)는 없습니다.";
    }));
    // 참가 도시 고르기
    const boxes = [...app.querySelectorAll(".lg-pickc input")];
    const picked = () => boxes.filter(b => b.checked).map(b => b.value);
    const showPick = () => {
      const V = C.validTeams(reg, picked());
      $("#lg-pickn").textContent = `${V.ids.length}팀`;
      $("#lg-pickmsg").textContent = V.ok ? `${V.ids.map(teamName).join(" · ")}` : V.err;
      $("#lg-pickmsg").dataset.bad = String(!V.ok);
      app.querySelectorAll("[data-preset]").forEach(b => b.setAttribute("aria-pressed", String(JSON.stringify((reg.presets[b.dataset.preset] || []).slice().sort()) === JSON.stringify(V.ids.slice().sort()))));
    };
    boxes.forEach(b => b.addEventListener("change", showPick));
    app.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => { const set = reg.presets[b.dataset.preset] || []; boxes.forEach(x => { x.checked = set.includes(x.value) || x.disabled; }); showPick(); }));
    showPick();
    const rh = $("#lg-rehost");
    if (rh) rh.addEventListener("click", () => { location.hash = "#league/host"; });
  }

  /* ================= 진행자 ================= */
  function hostView(app) {
    if (!hostInit()) { location.hash = "#league"; return; }
    L.app = app;
    L.viewing = null;
    renderHost(true);
    pushSnap();
  }
  function hostInit() {
    const save = store.get(K_HOST);
    if (!save || !validRoom(save.room) || !save.state) return false;
    if (!L || L.role !== "host" || L.room !== save.room) {
      close();
      const S = save.state;
      // 저장본 바로잡기: 지역·팀이 맞지 않으면 새로
      const ok = S && S.region === REGION && S.teams && actT(S).length >= 2 && actT(S).every(t => S.teams[t.id]);
      L = { role: "host", room: save.room, net: save.net, S: ok ? S : C.newState(save.room, REGION, Date.now()), timers: [], pending: 0 };
      L.conn = NET.open(Object.assign({ room: save.room }, save.net));
      L.conn.on("req", m => {
        const r = C.reduce(L.S, m, Date.now(), BG);
        // 규칙 검사가 다른 도시 지도로 바꿔 놓았을 수 있다 — 보고 있는 도시로 되돌린다.
        if (L.viewing) BG.selectPack(C.teamDef(R(), L.viewing).pack, "league");
        if (!r.ok && m && typeof m.team === "string") L.conn.send("nack", { team: m.team, type: m.type, err: r.err });
        if (r.ok && !r.quiet) changed();
        else if (r.ok && m.type === "claim") pushSnap();
      });
      L.conn.onStatus(s => { const el = document.getElementById("lg-conn"); if (el) { el.dataset.s = s; el.textContent = connLabel(s); } });
      L.timers.push(setInterval(() => { pushSnap(); renderHost(); }, 4000));
      L.timers.push(setInterval(tickTimer, 1000));
    }
    return true;
  }
  const connLabel = s => ({ open: "연결됨", connecting: "연결 중", reconnecting: "다시 연결 중", error: "연결 오류", closed: "닫힘" }[s] || s);
  function saveHost() { store.set(K_HOST, { room: L.room, net: L.net, state: L.S }); }
  function pushSnap() { if (L && L.role === "host") L.conn.send("snap", C.publicView(L.S, Date.now())); }
  function changed() {
    saveHost();
    if (L.viewing) updateView();
    clearTimeout(L.pending);
    L.pending = setTimeout(() => { pushSnap(); renderHost(); }, 150);
  }
  function tickTimer() {
    const el = document.getElementById("lg-timer");
    if (!el || !L) return;
    const S = L.S || L.snap, now = L.S ? Date.now() : Date.now() + (L.skew || 0);
    el.textContent = S && S.ends ? mmss(S.ends - now) : "";
    el.dataset.low = String(!!(S && S.ends && S.ends - now < 60000));
  }
  function nextLabel(S) {
    const n = C.roundsOf(L.S).length;
    if (S.phase === "lobby") return "1라운드 시작";
    if (S.phase === "plan") return `${S.round}라운드 운영`;
    if (S.phase === "review") return S.round >= n ? "최종 결과" : `${S.round + 1}라운드 시작`;
    return "";
  }
  function hostNext() {
    const S = L.S, now = Date.now();
    if (S.phase === "plan") {
      const btn = document.getElementById("lg-next");
      if (btn) { btn.disabled = true; btn.textContent = "운영 중…"; }
      setTimeout(() => { C.run(S, BG, now); L.flash = S.round; changed(); renderHost(true); }, 30);
      return;
    }
    if (C.host(S, "next", now)) { changed(); renderHost(true); }
  }
  function joinLink() {
    const n = L.net && L.net.kind === "supabase" ? { kind: "supabase", url: L.net.url, key: L.net.key } : { kind: "local" };
    return `${location.origin}${location.pathname}#league/j=${b64e(JSON.stringify({ r: L.room, n }))}`;
  }
  function renderHost(full) {
    if (!L || L.role !== "host" || !L.app || !L.app.isConnected || L.viewing) return;
    const S = L.S, reg = R(), now = Date.now(), V = C.publicView(S, now);
    const res = S.results[S.results.length - 1] || null;
    const RS0 = C.roundsOf(S), rd = S.round ? RS0[S.round - 1] : RS0[0];
    if (full || !L.app.querySelector(".lg-host")) {
      L.app.innerHTML = `
        <main class="lg-host" data-econ="${!!V.econ}">
          <header class="lg-hbar">
            <a class="lg-back" href="#league" aria-label="로비로">←</a>
            <div class="lg-room"><span>방 코드</span><b id="lg-roomcode">${esc(L.room)}</b></div>
            <div class="lg-hmeta">
              <p class="v2-kicker">${esc(reg.short)} · ${esc(reg.name)}</p>
              <h1 id="lg-h1"></h1>
            </div>
            <span class="lg-conn" id="lg-conn" data-s="${esc(L.conn.status())}">${connLabel(L.conn.status())}</span>
            <b class="lg-timer num" id="lg-timer" aria-live="off"></b>
            <button type="button" class="v2-btn" id="lg-extend">+1분</button>
            <button type="button" class="v2-btn primary" id="lg-next"></button>
            <button type="button" class="v2-btn" id="lg-link">참가 링크 복사</button>
          </header>
          ${V.econ ? `<div id="lg-host-ticker">${tickerHTML(V)}</div>` : ""}
          <section class="lg-evbox" id="lg-evbox" aria-live="polite"></section>
          <section class="lg-hgrid">
            <figure class="lg-mapbox">${R().board ? `<canvas class="lg-map lg-mapc" id="lg-mapc" role="img" aria-label="광역 지도: 여섯 도시 지도를 합친 지도와 연계선"></canvas><nav class="lg-mapnav" aria-label="도시 지도 보기">${actT(S).map(t => `<a href="#league/view/${t.id}" style="--c:${t.color}">${esc(t.name)}</a>`).join("")}</nav>` : `<svg class="lg-map" id="lg-map" viewBox="0 0 600 470" role="img" aria-label="지역 지도와 연계선"></svg>`}
              <figcaption id="lg-mapcap"></figcaption></figure>
            <div class="lg-teams" id="lg-teams"></div>
          </section>
          ${V.econ ? `<div id="lg-host-rank"></div><div id="lg-host-debrief"></div>` : ""}
          <section class="lg-results" id="lg-results"></section>
          <section class="lg-logbox"><h2>기록</h2><ol class="lg-log" id="lg-log"></ol></section>
          <p class="lg-sr" id="lg-live" aria-live="polite"></p>
        </main>`;
      const $ = s => L.app.querySelector(s);
      $("#lg-next").addEventListener("click", hostNext);
      const mc = $("#lg-mapc");
      if (mc) {
        mc.addEventListener("click", e => { const id = boardHit(mc, e); if (id && Object.hasOwn(L.S.teams, id)) location.hash = `#league/view/${id}`; });
        mc.addEventListener("mousemove", e => { const id = boardHit(mc, e); mc.style.cursor = id && Object.hasOwn(L.S.teams, id) ? "pointer" : "default"; mc.title = id ? `${teamName(id)} 지도 보기` : ""; });
      }
      $("#lg-extend").addEventListener("click", () => { if (C.host(L.S, "extend", Date.now())) changed(); });
      $("#lg-link").addEventListener("click", () => copyText(joinLink(), "참가 링크를 복사했습니다", $("#lg-link")));
      $("#lg-teams").addEventListener("click", e => {
        const k = e.target.closest("[data-kick]");
        if (k && window.confirm(`${teamName(k.dataset.kick)} 자리를 비울까요? (다른 기기가 그 팀으로 들어올 수 있게 됩니다)`)) { C.host(L.S, "kick", Date.now(), k.dataset.kick); changed(); }
      });
    }
    const $ = s => L.app.querySelector(s);
    $("#lg-h1").textContent = S.phase === "lobby" ? "팀 입장 기다리는 중" : S.phase === "end" ? "리그 끝 — 최종 결과" : `${turnLabel(rd, S.round, C.roundsOf(S).length)} · ${PHASE_NAME[S.phase]}`;
    const nx = $("#lg-next"), lab = nextLabel(S);
    nx.hidden = !lab; nx.disabled = false; nx.textContent = lab;
    $("#lg-extend").hidden = !S.ends;
    tickTimer();
    const ev = S.round ? evCards(V, S.round) : "";
    $("#lg-evbox").innerHTML = ev ? `<h2>${S.round}라운드 사건</h2>${ev}` : "";
    if ($("#lg-mapc")) renderBoard($("#lg-mapc"), V, res, L.flash === S.round); else renderMap($("#lg-map"), V, res, L.flash === S.round);
    $("#lg-mapcap").textContent = (res ? `${resLabel(res)} 도시 사이 전력 거래 · 선 굵기 = 용량` : "점선 = 제안된 연계선, 실선 = 연결된 연계선") + (R().board ? " · 도시를 누르면 그 도시 지도" : "");
    $("#lg-teams").innerHTML = actT(S).map(t => teamCard(t, V.teams[t.id], res && res.team[t.id], S)).join("");
    $("#lg-teams").querySelectorAll("canvas[data-thumb]").forEach(cv => thumb(cv, cv.dataset.thumb, V.teams[cv.dataset.thumb].plan));
    $("#lg-results").innerHTML = res ? resultsTable(S, res) : `<p class="lg-hint">라운드를 운영하면 여기에 도시별 결과가 나옵니다. 팀은 <b>방 코드 ${esc(L.room)}</b>로 들어옵니다.</p>`;
    if (V.econ) {
      const ticker = $("#lg-host-ticker"), rank = $("#lg-host-rank"), debrief = $("#lg-host-debrief");
      if (ticker) ticker.innerHTML = tickerHTML(V);
      if (rank) rank.innerHTML = rankHTML(V.econ, false);
      if (debrief && S.phase === "end" && !debrief.querySelector("#lg-debrief")) {
        debrief.innerHTML = debriefHTML(V.econ);
        debrief.addEventListener("input", () => updateWeights(debrief, C.publicView(L.S, Date.now()).econ));
      }
      const top = (V.econ.report?.flows.pop || []).slice().sort((a, b) => b.n - a.n).slice(0, IQ.quarter);
      $("#lg-mapcap").textContent += top.map(f => ` · ${teamName(f.from)} → ${teamName(f.to)} ${fmt(f.n)}명: ${f.why}`).join("");
    }
    $("#lg-log").innerHTML = S.log.slice(-8).reverse().map(x => `<li>${esc(x.t)}</li>`).join("");
  }
  function teamCard(t, v, r, S) {
    const plan = v.plan || { builds: [], lines: [] };
    const cnt = {};
    plan.builds.forEach(b => { cnt[b.t] = (cnt[b.t] || 0) + 1; });
    const B = BG.BLD;
    const items = Object.keys(cnt).map(k => `<span class="lg-chip">${esc((B[k] || { name: k }).name)} ${cnt[k]}</span>`).join("") || `<span class="lg-hint">아직 건설 없음</span>`;
    const st = !v.seated ? "빈 자리" : v.online ? "접속" : "끊김";
    const H = v.hist || [], last = H[H.length - 1];
    const ago = last ? Math.max(0, Math.round((Date.now() - last.t) / 1000)) : null;
    return `<article class="lg-tcard" style="--c:${t.color}" data-team="${t.id}">
      <a class="lg-thumb" href="#league/view/${t.id}" aria-label="${esc(t.name)} 지도 크게 보기"><canvas data-thumb="${t.id}" width="232" height="150"></canvas><span>지도 보기</span></a>
      <div class="lg-speed">${spark(H, v.budget)}<span>${last ? `투자 <b class="num">${fmt(last.cap)}억</b> · 설비 ${last.n} · 선 ${last.l}${ago != null ? ` · <i>${ago < 60 ? `${ago}초` : `${Math.round(ago / 60)}분`} 전 변경</i>` : ""}` : "아직 계획 없음"}</span></div>
      <header><h3>${esc(t.name)}</h3><span class="lg-seat" data-s="${!v.seated ? "empty" : v.online ? "on" : "off"}">${st}</span>${v.ready ? `<span class="lg-ready">준비 ✓</span>` : ""}</header>
      <p class="lg-tline"><span>예산 <b class="num">${fmt(v.budget)}억</b></span><span>판매 단가 <b class="num">${fmt(v.price, 3)}</b></span><span>송전선 <b class="num">${plan.lines.length}</b></span></p>
      ${S.econ ? `<p class="lg-tline">주민 ${esc(signed(S.econRep?.cities[t.id]?.dPop || 0))}명 · 지지율 ${esc(fmt(S.econ.cities[t.id].approval, 1))}%</p><div class="lg-chips">${v.crit?.chips?.length ? v.crit.chips.map(k => `<span class="lg-chip">기준: ${esc(SCORE_NAMES[k])}</span>`).join("") : `<span class="lg-chip">기준 미선택</span>`}</div>` : ""}
      <div class="lg-chips">${items}</div>
      ${r ? `<p class="lg-tline lg-tres"><span>정전 <b class="num" data-bad="${r.unsPct > 0.5}">${fmt(r.unsPct, 2)}%</b></span><span>CO₂ <b class="num">${fmt(r.co2Prod)} t</b></span><span>수입/수출 <b class="num">${fmt(r.imp, 1)}/${fmt(r.exp, 1)}</b></span></p>` : ""}
      ${v.seated ? `<button type="button" class="lg-kick" data-kick="${t.id}">자리 비우기</button>` : ""}
    </article>`;
  }
  function resultsTable(S, res) {
    const g = C.goalsOf(S), act = actT(S).filter(t => res.team[t.id]);
    const rows = act.map(t => {
      const r = res.team[t.id];
      return `<tr style="--c:${t.color}"><th scope="row">${esc(t.name)}</th>
        <td class="num" data-bad="${r.unsPct > g.unsPct}">${fmt(r.unsPct, 2)}%</td><td class="num" data-bad="${r.hospH > 0}">${r.hospH}</td>
        <td class="num">${fmt(r.cost.inv != null ? r.cost.inv : r.cost.capex, 1)} / ${fmt(r.cost.opex != null ? r.cost.opex : r.cost.fuel, 1)}</td><td class="num">${fmt(r.co2Prod)}</td><td class="num">${fmt(r.co2Cons)}</td>
        <td class="num">${fmt(r.imp, 1)} / ${fmt(r.exp, 1)}</td><td class="num">${fmt(r.earn - r.pay, 2)}</td><td class="num">${r.sat}</td></tr>`;
    }).join("");
    const maxC = Math.max(1, ...act.map(t => Math.max(res.team[t.id].co2Prod, res.team[t.id].co2Cons)));
    const bars = act.map(t => { const r = res.team[t.id]; return `<li style="--c:${t.color}"><span>${esc(t.name)}</span><i style="width:${(100 * r.co2Prod / maxC).toFixed(1)}%" class="p"></i><i style="width:${(100 * r.co2Cons / maxC).toFixed(1)}%" class="c"></i></li>`; }).join("");
    return `<h2>${resLabel(res)} 결과</h2>
      <p class="lg-goals"><span data-ok="${res.region.ok.uns}">지역 정전 ${fmt(res.region.unsPct, 2)}% (목표 ≤ ${g.unsPct}%)</span><span data-ok="${res.region.ok.co2}">지역 CO₂ ${fmt(res.region.co2)} t (목표 ≤ ${fmt(g.co2)} t)</span></p>
      <div class="lg-tablewrap"><table class="lg-table"><thead><tr><th scope="col">팀</th><th scope="col">정전</th><th scope="col">병원 정전(h)</th><th scope="col">새 투자 / 운영(억)</th><th scope="col">CO₂ 생산(t)</th><th scope="col">CO₂ 소비(t)</th><th scope="col">수입/수출(MWh)</th><th scope="col">거래 수지(억)</th><th scope="col">최저 만족</th></tr></thead><tbody>${rows}</tbody></table></div>
      <figure class="lg-co2"><figcaption>CO₂ — <b class="p">생산 기준</b>(발전소가 있는 곳) vs <b class="c">소비 기준</b>(전기를 쓴 곳)</figcaption><ul>${bars}</ul></figure>`;
  }

  /* ---------- 라운드 사건 카드 ---------- */
  const SCOPE = { region: "지역 전체", "kind:coastal": "바다에 닿은 도시", "kind:industrial": "대형 공장이 있는 도시", "kind:coal": "석탄 발전소가 있는 도시", "kind:metro_south": "경기 남부 도시", "kind:chungcheong": "충남 도시", "kind:inland": "내륙 도시" };
  // 예보 범위(계획 때)와 실제 크기(운영 뒤). 배수 손잡이마다 "수요 +6~18%".
  const KNOB = { demandMul: "수요", solarMul: "태양광", windMul: "육상풍력", offshoreMul: "해상풍력", tidalMul: "조력", coalCapMul: "석탄 출력", lngCapMul: "LNG 출력" };
  const pct = v => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))}`;
  function evSize(E, ev, nx) {
    const f = E.effect || {}, fc = E.fc || 0;
    return C.MUL.filter(k => typeof f[k] === "number").map(k => {
      const d = (f[k] - 1) * 100;
      if (typeof ev.x === "number") return `${KNOB[k]} ${pct(d * ev.x)}%`;
      if (nx) { const a = d * nx[0], b = d * nx[1]; return `${KNOB[k]} ${pct(Math.min(a, b))}~${pct(Math.max(a, b)).replace("+", "")}%`; }
      if (!fc) return `${KNOB[k]} ${pct(d)}%`;
      const a = d * (1 - fc), b = d * (1 + fc);
      return `${KNOB[k]} ${pct(Math.min(a, b))}~${pct(Math.max(a, b)).replace("+", "")}%`;
    }).join(" · ");
  }
  // resp = {plan 단계의 내 대응}이 있으면 대응 버튼을 단다.
  function evCards(X, round, me, act) {
    const reg = R(), list = (X.events || []).filter(x => x.round === round).map(ev => ({ ev, E: C.eventDef(reg, ev.id) })).filter(x => x.E);
    if (!list.length) return "";
    const myT = me && X.teams && X.teams[me];
    return `<ul class="lg-evs">${list.map(({ ev, E }) => {
      const sc = E.scope || "region", who = SCOPE[sc] || (sc.startsWith("team:") ? teamName(sc.slice(5)) : sc);
      const mine = me ? C.hits(reg, E, me) : null, nx = mine && myT && myT.fcx ? myT.fcx[E.id] || null : null;
      const size = evSize(E, ev, nx), known = typeof ev.x === "number";
      const cur = myT && myT.resp ? myT.resp[round + ":" + E.id] || "none" : "none", opts = Array.isArray(E.opts) ? E.opts : [];
      const choose = act && mine && opts.length ? `<div class="lg-evopts" role="group" aria-label="${esc(E.name)} 대응">${[{ id: "none", name: "대응 안 함", cost: 0 }, ...opts].map(o => `<button type="button" class="lg-evopt" data-resp="${o.id}" data-ev="${esc(E.id)}" aria-pressed="${cur === o.id}"${o.note ? ` title="${esc(o.note)}"` : ""}>${esc(o.name)}${o.cost ? ` <b class="num">${fmt(o.cost)}억</b>` : ""}</button>`).join("")}</div>${cur !== "none" ? `<small class="lg-evnote">${esc((opts.find(o => o.id === cur) || {}).note || "")}</small>` : ""}` : "";
      const co = opts.find(o => o.id === cur), after = known && co && typeof co.dev === "number" && !co.knobs ? evSize(E, { x: ev.x * co.dev }) : "";
      const picked = !act && mine && cur !== "none" ? `<small class="lg-evnote">우리 대응: ${esc((co || {}).name || "")}${after ? ` → ${esc(after)}` : ""}</small>`
        : !me && X.teams && opts.length ? (() => { const who = Object.keys(X.teams).map(id => { const o = opts.find(q => q.id === (X.teams[id].resp || {})[round + ":" + E.id]); return o ? `${teamName(id)} ${o.name}` : ""; }).filter(Boolean); return `<small class="lg-evnote">대응: ${esc(who.join(" · ") || "아직 없음")}</small>`; })() : "";
      return `<li class="lg-ev" data-mine="${mine}"><b>${esc(E.name)}</b><span>${esc(E.text || "")}</span>
        ${size ? `<span class="lg-evsize"><i>${known ? "실제" : nx ? "정밀 예보" : E.fc ? "예보" : "크기"}</i> ${esc(size)}</span>` : ""}
        ${E.tip && mine !== false ? `<small class="lg-evnote">${esc(E.tip)}</small>` : ""}${choose}${picked}
        <small>${esc(who)}${mine === true ? " · 우리 도시 해당" : mine === false ? " · 우리 도시 해당 없음" : ""} · <abbr title="현상은 실제 기록·보도(O), 크기와 대응 효과는 게임 가정(G)">근거 ${esc(E.grade || "G")}·크기 G</abbr></small></li>`;
    }).join("")}</ul>`;
  }

  /* ---------- 팀 카드: 건설 속도(투자 누적)와 축소 지도 ---------- */
  function spark(H, budget) {
    if (!H || H.length < 2) return `<svg class="lg-spark" viewBox="0 0 120 30" aria-hidden="true"></svg>`;
    const max = Math.max(1, budget || 0, ...H.map(p => p.cap)), t0 = H[0].t, t1 = Math.max(t0 + 1, H[H.length - 1].t);
    const pts = H.map(p => `${(4 + 112 * (p.t - t0) / (t1 - t0)).toFixed(1)},${(27 - 24 * p.cap / max).toFixed(1)}`).join(" ");
    return `<svg class="lg-spark" viewBox="0 0 120 30" role="img" aria-label="투자 누적 변화"><line x1="4" x2="116" y1="3" y2="3" class="lg-spark-b"/><polyline points="${pts}"/></svg>`;
  }
  const TCOL = { sea: "#3d7fb3", beach: "#d8cf9c", plain: "#9cc86a", forest: "#3f8a4f", hill: "#a9a07a", mount: "#7d6c55", urban: "#babac2", river: "#2f8fe0", lake: "#5ab0e6", out: "#59625e", grid: "#f0c83c", town: "#babac2" };
  const BCOL = { solar: "#ffd23f", roof: "#ff9f1c", wind: "#ffffff", offshore: "#cfe8ff", tidal: "#62d2c4", hydro: "#38b6ff", diesel: "#4a3b2c", biomass: "#8a6a2a", battery: "#9b6bff" };
  function thumb(cv, id, plan) {
    const t = C.teamDef(R(), id);
    if (!t || !cv.getContext) return;
    BG.selectPack(t.pack, "league");
    const T = BG.TILES, dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.width, Hh = cv.height;
    cv.width = W * dpr; cv.height = Hh * dpr; cv.style.aspectRatio = `${W} / ${Hh}`;
    const g = cv.getContext("2d");
    g.scale(dpr, dpr);
    const xs = T.map(x => x.X), ys = T.map(x => x.Y), x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
    const k = Math.min(W / (x1 - x0), Hh / (y1 - y0)), ox = (W - k * (x1 - x0)) / 2 - k * x0, oy = (Hh - k * (y1 - y0)) / 2 - k * y0;
    const P = (X, Y) => [ox + k * X, oy + k * Y];
    T.forEach(tile => {
      const [cx, cy] = P(tile.X, tile.Y);
      g.beginPath();
      for (let a = 0; a < 6; a++) { const ang = Math.PI / 180 * (60 * a - 90); const px = cx + k * 0.98 * Math.cos(ang), py = cy + k * 0.98 * Math.sin(ang); if (a) g.lineTo(px, py); else g.moveTo(px, py); }
      g.closePath(); g.fillStyle = tile.t === "river" ? TCOL.plain : tile.t === "out" && tile.vt === "river" ? TCOL.out : TCOL[tile.t] || "#888"; g.fill();
    });
    // 강은 물줄기 띠로(호수는 물 면 그대로)
    const wet = x => ["river", "lake", "sea"].includes(x.vt || x.t);
    g.strokeStyle = TCOL.river; g.lineWidth = Math.max(1, k * 0.55); g.lineCap = "round";
    T.forEach(tile => { if ((tile.vt || tile.t) !== "river") return; const [cx, cy] = P(tile.X, tile.Y); g.beginPath(); g.arc(cx, cy, g.lineWidth / 2, 0, Math.PI * 2); (tile.nb || []).map(j => T[j]).filter(o => o && wet(o)).forEach(o => { const [ox2, oy2] = P((tile.X + o.X) / 2, (tile.Y + o.Y) / 2); g.moveTo(cx, cy); g.lineTo(ox2, oy2); }); g.stroke(); });
    const pl = plan || { builds: [], lines: [] };
    g.strokeStyle = "#1b2430"; g.lineWidth = Math.max(1.2, k * 0.28); g.lineJoin = "round";
    (pl.lines || []).forEach(L0 => { if (!Array.isArray(L0.p)) return; g.beginPath(); L0.p.forEach((i, n) => { const tt = T[i]; if (!tt) return; const [x, y] = P(tt.X, tt.Y); if (n) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); });
    BG.SITES.forEach(s0 => { const tt = T[s0.tile]; if (!tt || s0.kind === "gridpt") return; const [x, y] = P(tt.X, tt.Y); g.fillStyle = "#fff"; g.strokeStyle = "#333"; g.lineWidth = 1; g.fillRect(x - k * 0.35, y - k * 0.35, k * 0.7, k * 0.7); g.strokeRect(x - k * 0.35, y - k * 0.35, k * 0.7, k * 0.7); });
    (pl.builds || []).forEach(b => { const tt = T[b.i]; if (!tt) return; const [x, y] = P(tt.X, tt.Y); g.beginPath(); g.arc(x, y, k * 0.55, 0, Math.PI * 2); g.fillStyle = BCOL[b.t] || "#f0f"; g.fill(); g.lineWidth = 1; g.strokeStyle = "#111"; g.stroke(); });
  }

  /* ---------- 진행자: 도시 지도 크게 보기(#league/view/<팀>) ---------- */
  function viewCity(app, id) {
    if (!hostInit()) { location.hash = "#league"; return; }
    const t = C.teamDef(R(), id);
    if (!t || !Object.hasOwn(L.S.teams, id)) { location.hash = "#league/host"; return; }
    L.app = app; L.viewing = id;
    const S = L.S, RS0 = C.roundsOf(S), rd = RS0[Math.max(0, S.round - 1)] || RS0[0];
    BG.selectPack(t.pack, "league");
    const st = BG.sanitize(S.teams[id].plan || {}, 1e9);
    st.season = rd.season;
    BG.mount(app, {
      packs: [t.pack], league: true,
      load: () => ({ v: 2, map: t.pack, maps: { [t.pack]: st }, runs: 0, jAuto: true, journal: [] }),
      save: () => {},
      locked: () => "진행자 보기 전용 — 짓기는 팀 기기에서",
      season: () => rd.season,
      onMount: root => { viewBar(root, id); window.dispatchEvent(new Event("resize")); }
    });
  }
  function viewBar(root, id) {
    const ids = actT(L.S).map(t => t.id), k = ids.indexOf(id), prev = ids[(k - 1 + ids.length) % ids.length], next = ids[(k + 1) % ids.length];
    const bar = document.createElement("div");
    bar.className = "lg-bar lg-viewbar"; bar.id = "lg-bar"; bar.style.setProperty("--c", teamCol(id));
    bar.innerHTML = `<a class="lg-bbtn" href="#league/host">← 진행자 판</a><a class="lg-bbtn" href="#league/view/${prev}" aria-label="이전 도시">‹</a>
      <span class="lg-bteam">${esc(teamName(id))}</span><span class="lg-bphase">보기 전용</span><span id="lg-vstat"></span>
      <a class="lg-bbtn" href="#league/view/${next}" aria-label="다음 도시">›</a>`;
    root.append(bar);
    viewStat();
  }
  function viewStat() {
    const el = document.getElementById("lg-vstat");
    if (!el || !L || !L.viewing) return;
    const v = C.publicView(L.S, Date.now()).teams[L.viewing], H = v.hist || [], last = H[H.length - 1];
    el.textContent = `예산 ${fmt(v.budget)}억 · 투자 ${last ? fmt(last.cap) : 0}억 · ${!v.seated ? "빈 자리" : v.online ? "접속" : "끊김"}`;
  }
  // 보고 있는 도시의 계획이 바뀌면 화면을 다시 띄우지 않고 그 자리에서 바꾼다(확대·위치 유지).
  function updateView() {
    const st = BG.current();
    if (!st || !L.viewing) return;
    const t = C.teamDef(R(), L.viewing), plan = L.S.teams[L.viewing].plan;
    if (!plan) return;
    BG.selectPack(t.pack, "league");
    const clean = BG.sanitize(plan, 1e9);
    Object.assign(st, { builds: clean.builds, lines: clean.lines, policies: clean.policies, shed: clean.shed, fab2: clean.fab2 });
    BG.refresh();
    viewStat();
  }

  /* ---------- 지역 지도(개략) ---------- */
  // 경도·위도 → 화면. 지명 위치는 대략(시·군 중심). 바다·호수는 모양만 흉내 낸 개략도.
  const GEO = { hwaseong: [126.86, 37.17], pyeongtaek: [127.0, 36.99], anseong: [127.3, 37.03], dangjin: [126.68, 36.8], asan: [126.98, 36.78], cheonan: [127.2, 36.82] };
  const P = ([lon, lat]) => [Math.round((lon - 126.45) * 600 / 1.05), Math.round((37.32 - lat) * 470 / 0.72)];
  const SEA = [[126.45, 37.32], [126.74, 37.32], [126.72, 37.2], [126.78, 37.1], [126.92, 37.03], [126.98, 36.97], [126.86, 36.95], [126.74, 36.98], [126.62, 37.0], [126.45, 37.02]];
  const LAKES = [{ n: "삽교호", at: [126.83, 36.88], r: [16, 7] }, { n: "아산호", at: [126.98, 36.9], r: [20, 6] }, { n: "화성호", at: [126.75, 37.12], r: [12, 6] }, { n: "예당호", at: [126.8, 36.63], r: [12, 6] }];
  // 광역 지도: R().board = 여섯 도시 지도를 합친 한 장. 팀마다 도시 창(BUILD_MAPS[pack].win)에서 지은 선·설비를 제자리에 그린다.
  const SQ3 = Math.sqrt(3);
  const TER = { "~": "#2f6f9f", b: "#d9cc95", p: "#93c26a", f: "#4e8e4f", h: "#a3a26e", m: "#857563", u: "#b4b6bc", r: "#2f8fe0", l: "#5ab0e6", g: "#f0c83c", ".": "#c3c8bf" };
  let boardCache = null;
  function boardInfo() {
    const B = R().board;
    if (!B) return null;
    if (boardCache && boardCache.B === B) return boardCache;
    const cells = [], sum = {};
    B.rows.forEach((row, r) => [...row].forEach((ch, c) => {
      const x = SQ3 * (c + 0.5 * (r & 1)) + SQ3 / 2, y = 1.5 * r + 1, team = B.letters[B.own[r][c]] || null;
      cells.push({ c, r, ch, x, y, team });
      if (team) { const S0 = sum[team] = sum[team] || [0, 0, 0]; S0[0] += x; S0[1] += y; S0[2]++; }
    }));
    const cen = {};
    Object.keys(sum).forEach(k => { cen[k] = [sum[k][0] / sum[k][2], sum[k][1] / sum[k][2]]; });
    boardCache = { B, cells, cen, W: SQ3 * (B.cols + 0.5), H: 1.5 * (B.rows.length - 1) + 2, at: (c, r) => cells[r * B.cols + c] };
    return boardCache;
  }
  // 도시 창의 칸 번호 → 광역 칸 좌표(x, y)
  function winXY(id, i) {
    const t = C.teamDef(R(), id), P = KCP.BUILD_MAPS[t.pack], cols = P.rows[0].length, w = P.win || [0, 0];
    const c = (i % cols) + w[0], r = Math.floor(i / cols) + w[1];
    return [SQ3 * (c + 0.5 * (r & 1)) + SQ3 / 2, 1.5 * r + 1];
  }
  function gateXY(id, other) {
    const t = C.teamDef(R(), id), P = KCP.BUILD_MAPS[t.pack], g = (P.gates || []).find(x => x.to.includes(other));
    if (!g) return null;
    const w = P.win || [0, 0], c = g.c + w[0], r = g.r + w[1];
    return [SQ3 * (c + 0.5 * (r & 1)) + SQ3 / 2, 1.5 * r + 1];
  }
  function renderBoard(cv, V, res, flash) {
    const G = boardInfo(), reg = R(), on = new Set(actT(V).map(t => t.id)), goals = V.goals || reg.goals;
    const cssW = cv.clientWidth || 600, k = cssW / G.W, cssH = Math.round(G.H * k), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) { cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); cv.style.height = cssH + "px"; }
    const g = cv.getContext("2d");
    g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    g.clearRect(0, 0, G.W, G.H);
    const NB_E = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]], NB_O = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
    const hex = (x, y, rr) => { g.beginPath(); for (let a = 0; a < 6; a++) { const t = Math.PI / 180 * (60 * a - 90); const px = x + rr * Math.cos(t), py = y + rr * Math.sin(t); if (a) g.lineTo(px, py); else g.moveTo(px, py); } g.closePath(); };
    // 강 칸은 땅 위에 물줄기(이웃 강·호수·바다 칸까지 잇는 띠)로 그려 호수(물 면 전체)와 구별한다.
    const WET = ch => ch === "r" || ch === "l" || ch === "~", nbOf = cl => (cl.r & 1 ? NB_O : NB_E).map(([dc, dr]) => { const o = G.at(cl.c + dc, cl.r + dr); return o && o.c === cl.c + dc ? o : null; }).filter(Boolean);
    G.cells.forEach(cl => { hex(cl.x, cl.y, 1.03); g.fillStyle = cl.ch === "r" ? TER.p : TER[cl.ch] || TER.p; g.fill(); });
    g.lineCap = "round"; g.lineJoin = "round";
    [["rgba(230,244,255,0.9)", 0.95], [TER.r, 0.62]].forEach(([col, w]) => {
      g.strokeStyle = col; g.lineWidth = w;
      G.cells.forEach(cl => { if (cl.ch !== "r") return; const ns = nbOf(cl).filter(o => WET(o.ch)); g.beginPath(); if (!ns.length) g.arc(cl.x, cl.y, w / 2, 0, Math.PI * 2); ns.forEach(o => { g.moveTo(cl.x, cl.y); g.lineTo((cl.x + o.x) / 2, (cl.y + o.y) / 2); }); g.stroke(); });
    });
    G.cells.forEach(cl => { if (cl.team && !on.has(cl.team)) { hex(cl.x, cl.y, 1.03); g.fillStyle = "rgba(200,204,196,0.72)"; g.fill(); } });
    // 도시 경계(팀 색 굵은 선)
    const B = G.B;
    g.lineCap = "round";
    G.cells.forEach(cl => {
      if (!cl.team) return;
      (cl.r & 1 ? NB_O : NB_E).forEach(([dc, dr]) => {
        const o = G.at(cl.c + dc, cl.r + dr) || null, ot = o && o.c === cl.c + dc ? o.team : null;
        if (ot === cl.team) return;
        const nx = SQ3 * (cl.c + dc + 0.5 * ((cl.r + dr) & 1)) + SQ3 / 2, ny = 1.5 * (cl.r + dr) + 1, mx = (cl.x + nx) / 2, my = (cl.y + ny) / 2, dx = (ny - cl.y) / 2 / SQ3, dy = -(nx - cl.x) / 2 / SQ3;
        g.strokeStyle = on.has(cl.team) ? teamCol(cl.team) : "#9aa096"; g.lineWidth = ot ? 0.32 : 0.42;
        g.beginPath(); g.moveTo(mx + dx, my + dy); g.lineTo(mx - dx, my - dy); g.stroke();
      });
    });
    // 팀마다 지은 송전선·설비
    on.forEach(id => {
      const plan = V.teams[id] && V.teams[id].plan;
      if (!plan) return;
      g.strokeStyle = "#1b2430"; g.lineWidth = 0.34; g.lineJoin = "round";
      (plan.lines || []).forEach(L0 => { if (!Array.isArray(L0.p)) return; g.beginPath(); L0.p.forEach((i, n) => { const [x, y] = winXY(id, i); if (n) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); });
      (plan.builds || []).forEach(b0 => { const [x, y] = winXY(id, b0.i); g.beginPath(); g.arc(x, y, 0.62, 0, Math.PI * 2); g.fillStyle = BCOL[b0.t] || "#f0f"; g.fill(); g.lineWidth = 0.15; g.strokeStyle = "#111"; g.stroke(); });
    });
    // 연계선: 실제 연결점(노란 칸)끼리
    let flows = 0;
    reg.ties.filter(D => on.has(D.a) && on.has(D.b)).forEach(D => {
      const A = gateXY(D.a, D.b), Bq = gateXY(D.b, D.a);
      if (!A || !Bq) return;
      const T = V.ties.find(x => x.a === D.a && x.b === D.b), F = res && T && res.flow[C.tieId(T)], net = F ? F.ab - F.ba : 0;
      g.setLineDash(!T ? [0.5, 0.9] : T.st === "prop" ? [1.2, 0.8] : []);
      g.strokeStyle = !T ? "rgba(40,50,60,0.55)" : T.st === "prop" ? "#d08a1c" : "#1d2430"; g.lineWidth = !T ? 0.3 : T.cap === 4 ? 0.95 : 0.6;
      g.beginPath(); g.moveTo(...A); g.lineTo(...Bq); g.stroke(); g.setLineDash([]);
      if (F && Math.abs(net) > 0.05) {
        g.setLineDash([0.9, 1.1]); g.lineDashOffset = -(performance.now() / 120) % 4; g.strokeStyle = "#ffd23f"; g.lineWidth = flash ? 0.7 : 0.5;
        g.beginPath(); if (net >= 0) { g.moveTo(...A); g.lineTo(...Bq); } else { g.moveTo(...Bq); g.lineTo(...A); } g.stroke(); g.setLineDash([]);
        g.font = "700 1.35px sans-serif"; g.textAlign = "center"; g.lineWidth = 0.35; g.strokeStyle = "#fff"; g.fillStyle = "#1d2430";
        const mx = (A[0] + Bq[0]) / 2, my = (A[1] + Bq[1]) / 2 - 0.9, tx = `${fmt(Math.abs(net), 0)} MWh`;
        g.strokeText(tx, mx, my); g.fillText(tx, mx, my); flows++;
      }
    });
    // 이름표(도시·호수)
    g.textAlign = "center";
    (B.labels || []).forEach(L0 => { const x = SQ3 * (L0.c + 0.5 * (L0.r & 1)) + SQ3 / 2, y = 1.5 * L0.r + 1; g.font = "600 1.2px sans-serif"; g.fillStyle = "rgba(20,40,60,0.75)"; g.fillText(L0.t, x, y); });
    reg.teams.forEach(t => {
      const c0 = G.cen[t.id]; if (!c0) return;
      const act = on.has(t.id), r0 = res && res.team[t.id], v = V.teams[t.id];
      g.font = `800 ${act ? 2.6 : 2.0}px sans-serif`; g.lineWidth = 0.6; g.strokeStyle = act ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.7)"; g.fillStyle = act ? "#fff" : "#6a6f66";
      g.strokeText(t.name, c0[0], c0[1]); g.fillText(t.name, c0[0], c0[1]);
      const sub = !act ? "" : r0 ? `정전 ${fmt(r0.unsPct, 1)}%` : v && !v.seated ? "빈 자리" : "";
      if (sub) { g.font = "700 1.5px sans-serif"; g.lineWidth = 0.45; g.strokeText(sub, c0[0], c0[1] + 2.2); g.fillStyle = r0 && r0.unsPct > goals.unsPct ? "#ffb3a8" : "#fff"; g.fillText(sub, c0[0], c0[1] + 2.2); }
    });
    if (V.econ) {
      const top = (V.econ.report?.flows.pop || []).slice().sort((a, b) => b.n - a.n).slice(0, IQ.quarter), max = Math.max(1, ...top.map(f => f.n));
      top.forEach(f => {
        const A = G.cen[f.from], B = G.cen[f.to]; if (!A || !B) return;
        const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy); if (!len) return;
        const x = B[0] - dx / len * 4, y = B[1] - dy / len * 4;
        g.setLineDash([]); g.lineWidth = 0.4 + f.n / max; g.strokeStyle = "#8d2755";
        g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(x, y); g.stroke();
        g.fillStyle = "#8d2755"; g.beginPath(); g.moveTo(x, y); g.lineTo(x - dx / len * 2 + dy / len, y - dy / len * 2 - dx / len); g.lineTo(x - dx / len * 2 - dy / len, y - dy / len * 2 + dx / len); g.closePath(); g.fill();
      });
      cv.dataset.moves = String(top.length);
    }
    cv.dataset.k = String(k); cv.dataset.flows = String(flows);
  }
  function boardHit(cv, ev) {
    const G = boardInfo(), rect = cv.getBoundingClientRect(), k = rect.width / G.W, x = (ev.clientX - rect.left) / k, y = (ev.clientY - rect.top) / k;
    let best = null, bd = Infinity;
    G.cells.forEach(cl => { const d = (cl.x - x) ** 2 + (cl.y - y) ** 2; if (d < bd) { bd = d; best = cl; } });
    return best && bd < 1.2 ? best.team : null;
  }
  function renderMap(svg, V, res, flash) {
    const reg = R(), pts = SEA.map(P).map(p => p.join(",")).join(" ");
    const on = new Set(actT(V).map(t => t.id)), G = V.goals || reg.goals;
    const tieSvg = reg.ties.filter(D => on.has(D.a) && on.has(D.b)).map(D => {
      const T = V.ties.find(x => x.a === D.a && x.b === D.b);
      const [x1, y1] = P(GEO[D.a]), [x2, y2] = P(GEO[D.b]);
      const F = res && T && res.flow[C.tieId(T)];
      const net = F ? F.ab - F.ba : 0, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const st = !T ? "none" : T.st;
      const lab = F && (F.ab + F.ba) > 0.05 ? `<text class="lg-flowlab" x="${mx}" y="${my - 6}">${fmt(Math.abs(net), 1)} MWh ${net >= 0 ? "→" : "←"}</text>` : "";
      const dir = net >= 0 ? `M${x1},${y1} L${x2},${y2}` : `M${x2},${y2} L${x1},${y1}`;
      return `<g class="lg-tie" data-st="${st}" data-kind="${D.kind}"><path d="M${x1},${y1} L${x2},${y2}" stroke-width="${T ? (T.cap === 4 ? 7 : 4) : 2}"/>${F && Math.abs(net) > 0.05 ? `<path class="lg-flow${flash ? " lg-flash" : ""}" d="${dir}"/>` : ""}${lab}<title>${esc(teamName(D.a))}–${esc(teamName(D.b))} (${esc(D.name)}) ${!T ? "후보" : T.st === "built" ? `${T.cap} MW 연결` : `${T.cap} MW 제안`}</title></g>`;
    }).join("");
    const cities = reg.teams.map(t => {
      const [x, y] = P(GEO[t.id]), v = V.teams[t.id], r = res && res.team[t.id];
      if (!on.has(t.id)) return `<g class="lg-city" data-off="true"><circle cx="${x}" cy="${y}" r="26"/><text x="${x}" y="${y + 5}" class="lg-cname">${esc(t.name)}</text></g>`;
      const ring = r ? (r.unsPct > G.unsPct ? "bad" : "ok") : "none";
      return `<a href="#league/view/${t.id}" class="lg-citylink"><g class="lg-city" data-ring="${ring}" style="--c:${t.color}"><circle cx="${x}" cy="${y}" r="34"/><text x="${x}" y="${y + 5}" class="lg-cname">${esc(t.name)}</text>${v.seated ? "" : `<text x="${x}" y="${y + 22}" class="lg-cempty">빈 자리</text>`}</g><title>${esc(t.name)} 지도 보기</title></a>`;
    }).join("");
    svg.innerHTML = `<rect width="600" height="470" class="lg-land"/><polygon points="${pts}" class="lg-sea"/>
      ${LAKES.map(l => { const [x, y] = P(l.at); return `<ellipse cx="${x}" cy="${y}" rx="${l.r[0]}" ry="${l.r[1]}" class="lg-lake"/><text x="${x}" y="${y + 18}" class="lg-lname">${l.n}</text>`; }).join("")}
      <ellipse cx="${P([126.63, 37.17])[0]}" cy="${P([126.63, 37.17])[1]}" rx="7" ry="4" class="lg-isle"/><text x="${P([126.63, 37.17])[0]}" y="${P([126.63, 37.17])[1] - 8}" class="lg-lname">제부도</text>
      <text x="40" y="60" class="lg-seaname">서해</text><text x="${P([126.84, 37.0])[0]}" y="${P([126.84, 37.0])[1] + 4}" class="lg-seaname s">아산만</text>
      ${tieSvg}${cities}`;
  }

  /* ================= 팀 ================= */
  function teamView(app) {
    const save = tab.get();
    if (!save || !validRoom(save.room) || typeof save.token !== "string") { location.hash = "#league"; return; }
    if (!L || L.role !== "team" || L.room !== save.room) {
      close();
      L = { role: "team", room: save.room, net: save.net || { kind: "local" }, team: save.team || null, token: save.token, snap: null, timers: [], rev: 0, planT: 0, skew: 0, lastPhase: null, lastRound: 0 };
      L.conn = NET.open(Object.assign({ room: save.room }, L.net));
      L.conn.on("snap", onSnap);
      L.conn.on("nack", m => { if (m && m.team === L.team) nack(m); });
      L.conn.onStatus(s => { const el = document.getElementById("lg-conn"); if (el) { el.dataset.s = s; el.textContent = connLabel(s); } if (s === "open" && L.team) send("claim"); });
      L.timers.push(setInterval(() => { if (L.team) { send("hello"); if (L.snap && L.snap.teams[L.team] && L.snap.teams[L.team].rev < L.rev) sendPlan(); } }, 5000));
      L.timers.push(setInterval(tickTimer, 1000));
    }
    L.app = app;
    if (!L.team) seatPicker(app); else mountCity(app);
  }
  function send(type, extra) {
    if (type === "crit") L.pendingCrit = { chips: extra.chips.slice(), line: extra.line, choice: extra.choice };
    L.conn.send("req", Object.assign({ type, team: L.team, token: L.token }, extra || {}));
  }
  function teamSave() { if (L.role === "solo") { saveSolo(); return; } const s = { room: L.room, net: L.net, team: L.team, token: L.token }; tab.set(s); if (L.team) store.set(K_TEAM, s); }
  function seatPicker(app) {
    const reg = R(), V = L.snap;
    app.innerHTML = `<main class="lg-lobby">
      <header class="lg-lhead"><a class="lg-back" href="#league">← 로비</a><p class="v2-kicker">방 ${esc(L.room)}</p><h1>우리 팀 도시 고르기</h1>
        <p class="lg-sub" id="lg-wait">${V ? "빈 도시를 고르세요." : "진행자 화면을 찾는 중… 방 코드와 연결 방식이 맞는지 확인하세요."}</p></header>
      <div class="lg-seats">${(V ? actT(V) : reg.teams).map(t => { const v = V && V.teams[t.id]; const taken = v && v.seated; return `<button type="button" class="lg-seatbtn" style="--c:${t.color}" data-seat="${t.id}" ${!V || taken ? "disabled" : ""}><b>${esc(t.name)}</b><span>${!V ? "…" : taken ? "다른 팀이 맡음" : "비어 있음"}</span></button>`; }).join("")}</div>
      <p class="lg-err" id="lg-err" role="alert"></p></main>`;
    app.querySelectorAll("[data-seat]").forEach(b => b.addEventListener("click", () => {
      L.team = b.dataset.seat;
      L.claiming = true;
      teamSave();
      send("claim");
      app.querySelector("#lg-wait").textContent = `${teamName(L.team)} 자리를 요청했습니다…`;
    }));
  }
  function nack(m) {
    if (m.type === "claim" || m.err === "seat") {
      L.team = null; L.claiming = false; teamSave();
      if (L.app && L.app.isConnected) { location.hash !== "#league/team" ? (location.hash = "#league/team") : seatPicker(L.app); const e = L.app.querySelector("#lg-err"); if (e) e.textContent = m.err === "taken" ? "다른 기기가 이미 그 팀을 맡았습니다." : "자리가 비워졌습니다. 다시 고르세요."; }
      return;
    }
    const msg = { phase: "지금 단계에서는 바꿀 수 없습니다.", built: "이미 연결된 연계선입니다.", noprop: "제안이 없습니다.", notie: "이웃이 아닙니다.", noev: "이번 라운드 우리 도시 사건이 아닙니다.", noopt: "없는 대응입니다." }[m.err] || (String(m.err).startsWith("budget:") ? `${teamName(String(m.err).slice(7))} 예산이 모자랍니다.` : "요청을 처리하지 못했습니다.");
    BG.toast(msg);
  }
  function onSnap(V) {
    if (!V || V.room !== L.room || V.region !== REGION || !V.teams) return;
    return soloMutate(() => {
      const prev = L.snap;
      L.snap = V; L.skew = V.now - Date.now();
      if (!L.team) { if (L.app && L.app.isConnected && L.app.querySelector(".lg-seats")) seatPicker(L.app); return; }
      const me = V.teams[L.team];
      if (prev && prev.round !== V.round) L.pendingCrit = null;
      const pending = L.pendingCrit, crit = me?.crit;
      if (pending && crit && pending.line === crit.line && pending.choice === crit.choice && pending.chips.length === crit.chips.length && pending.chips.every((k, i) => k === crit.chips[i])) L.pendingCrit = null;
      if (prev && (prev.phase !== V.phase || prev.round !== V.round)) L.awaitReady = false;
      if (L.claiming && me.seated) { L.claiming = false; if (L.app && L.app.isConnected) mountCity(L.app); return; }
      if (!L.app || !L.app.isConnected || !document.getElementById("lg-bar")) return;
      // 내 도시를 다른 기기에서 처음 여는 경우: 진행자에게 남은 계획을 가져온다.
      if (me.plan && me.rev > L.rev && L.rev === 0 && isEmptyDoc()) adoptPlan(me);
      const rd = curRound();
      BG.setSeason(rd.season);
      BG.refresh();
      if (prev && (prev.phase !== V.phase || prev.round !== V.round)) phaseChanged(V);
      else if (!prev && V.econ && V.phase === "plan" && curRound().month === 1) openPanel("journal");
      renderBar();
      if (L.panel) renderPanel();
    });
  }
  // 턴 이름: 달 턴이면 "2027년 3월 (3/12)", 계절 라운드면 "2 / 4라운드 · 여름"
  function turnLabel(rd, n, tot, short) {
    if (rd && rd.month) return short ? `${String(rd.year).slice(2)}.${rd.month}월 ${n}/${tot}` : `${rd.year}년 ${rd.month}월 (${n}/${tot}턴) · ${SEASON_NAME[rd.season]}`;
    return short ? `${n}/${tot}R · ${SEASON_NAME[rd.season]}` : `${n} / ${tot}라운드 · ${SEASON_NAME[rd.season]}`;
  }
  const resLabel = res => (res.month ? `${res.year}년 ${res.month}월(대표 ${res.days}일 운영)` : `${res.round}라운드 · ${SEASON_NAME[res.season]} ${res.days}일`);
  function curRound() { const V = L.snap, RS0 = V ? C.roundsOf(V) : R().rounds; return RS0[Math.max(0, (V ? V.round : 1) - 1)] || RS0[0]; }
  function isEmptyDoc() { const d = L.doc, st = d && d.maps[d.map]; return !st || (!st.builds.length && !st.lines.length); }
  function adoptPlan(me) {
    const st = L.doc.maps[L.doc.map];
    Object.assign(st, { builds: me.plan.builds || [], lines: me.plan.lines || [], policies: me.plan.policies || [], shed: me.plan.shed || "home", fab2: !!me.plan.fab2 });
    L.rev = me.rev;
    mountCity(L.app);
  }
  function phaseChanged(V) {
    const live = document.getElementById("lg-live");
    const evn = (V.events || []).filter(x => x.round === V.round).map(x => (C.eventDef(R(), x.id) || {}).name).filter(Boolean);
    const t = V.phase === "plan" ? `${V.round}라운드 계획 시작${evn.length ? ` · 사건: ${evn.join(", ")}` : " — 짓고 협상하세요"}` : V.phase === "review" ? `${V.round}라운드 결과가 나왔습니다` : V.phase === "end" ? "리그가 끝났습니다" : PHASE_NAME[V.phase];
    BG.toast(t);
    if (live) live.textContent = t;
    if (V.phase === "plan" && V.econ) {
      const { d, n } = monthNote(); n.startPolicy = V.teams[L.team].econPol || V.econ.cities[L.team].policy; putData(d);
    }
    if (V.phase === "review" || V.phase === "end") openPanel("result");
    else if (V.phase === "plan" && V.econ && curRound().month === 1) openPanel("journal");
    else if (V.phase === "plan" && evn.length) openPanel("deal");
  }
  function lockMsg() {
    const V = L && L.snap;
    if (!V) return "";
    return V.phase === "lobby" || V.phase === "plan" ? "" : V.phase === "end" ? "리그가 끝났습니다" : "지금은 운영·결과 단계 — 다음 라운드 계획 때 지을 수 있어요";
  }
  function mountCity(app) {
    teamSave();
    const reg = R(), t = C.teamDef(reg, L.team), s = tdata();
    const raw = s.docs[t.pack];
    // 건설 화면의 저장 문서 모양({v, map, maps, journal ...})을 이 도시 하나로 쓴다.
    BG.selectPack(t.pack, "league");
    const st = BG.sanitize(raw && raw.maps ? raw.maps[t.pack] : null, 1e9);
    L.doc = { v: 2, map: t.pack, maps: { [t.pack]: st }, runs: raw && Number.isInteger(raw.runs) ? raw.runs : 0, jAuto: true, journal: raw && Array.isArray(raw.journal) ? raw.journal : [] };
    L.rev = Math.max(L.rev, s.rev || 0);
    BG.mount(app, {
      packs: [t.pack], league: true,
      load: () => L.doc,
      save: doc => { const z = tdata(); z.docs[t.pack] = { maps: doc.maps, runs: doc.runs, journal: doc.journal }; z.rev = L.rev; putData(z); },
      // 남은 예산 = 예산 − 철거 손실·사건 대응(fixed) − 이번에 지난 라운드 것을 뜯어 생긴 손실
      budget: () => { const me = L.snap && L.snap.teams[L.team]; return me ? me.budget - (me.fixed || 0) - C.lossOf(me.base, BG.current()) : C.budget({ round: 1, ties: [], region: REGION }, L.team); },
      research: () => { const me = L.snap && L.snap.teams[L.team]; return (me && me.rs) || { prog: {}, stage: {}, adoptR: {} }; },
      salvage: key => { const me = L.snap && L.snap.teams[L.team]; return me && (me.base || []).some(x => x.k === key) ? C.SALV : 1; },
      locked: lockMsg,
      season: () => curRound().season,
      onChange: () => {
        if (L.snap?.econ) { const { d, n } = monthNote(); n.confirmed = false; n.research = (BG.current()?.builds || []).some(b => ["uni", "lab"].includes(b.t) && !(L.snap.teams[L.team].base || []).some(item => item.k === C.itemKey("b", b))); putData(d); }
        L.rev++; const z = tdata(); z.rev = L.rev; putData(z); clearTimeout(L.planT);
        // 혼자 하기는 같은 탭에서 즉시 반영한다. 이탈 때 취소되는 전송 타이머를 기다리지 않는다.
        if (L.role === "solo") sendPlan(); else L.planT = setTimeout(sendPlan, 400); },
      onMount: root => { addBar(root); window.dispatchEvent(new Event("resize")); }
    });
    send("claim");
    sendPlan();
    if (L.snap?.econ && L.snap.phase === "plan" && curRound().month === 1 && !L.panel) openPanel("journal");
  }
  function sendPlan() {
    const st = BG.current();
    if (!st || !L.team) return;
    send("plan", { rev: L.rev, plan: { builds: st.builds, lines: st.lines, policies: st.policies, shed: st.shed, fab2: st.fab2, missions: st.missions, seed: st.seed, season: st.season, rq: st.rq || [] } });
  }
  function addBar(root) {
    const bar = document.createElement("div");
    bar.className = "lg-bar";
    bar.dataset.econ = String(!!L.snap?.econ);
    bar.id = "lg-bar";
    bar.style.setProperty("--c", teamCol(L.team));
    bar.innerHTML = `<span class="lg-bteam">${esc(teamName(L.team))}</span>
      <span class="lg-bround" id="lg-bround"></span>
      <span class="lg-bphase" id="lg-bphase"></span><b class="lg-timer num" id="lg-timer"></b>
      <span class="lg-conn" id="lg-conn" data-s="${esc(L.conn.status())}">${connLabel(L.conn.status())}</span>
      <button type="button" class="lg-bbtn" data-panel="deal">이웃·거래<b class="lg-badge" id="lg-badge" hidden></b></button>
      <button type="button" class="lg-bbtn" data-panel="result">결과</button>
      <button type="button" class="lg-bbtn" data-panel="journal">일지</button>
      ${L.snap?.econ ? `<button type="button" class="lg-bbtn" data-panel="city">도시</button><button type="button" class="lg-bbtn" data-panel="rank">순위</button>` : ""}
      ${L.role === "solo" ? `<button type="button" class="lg-bbtn" id="lg-solo-restart">처음부터</button>` : ""}
      <button type="button" class="lg-bbtn lg-readybtn" id="lg-ready" aria-pressed="false">준비</button>
      <p class="lg-sr" id="lg-live" aria-live="polite"></p>`;
    root.append(bar);
    const panel = document.createElement("aside");
    panel.className = "lg-panel";
    panel.dataset.econ = String(!!L.snap?.econ);
    panel.id = "lg-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "리그");
    root.append(panel);
    bar.addEventListener("click", e => {
      const p = e.target.closest("[data-panel]");
      if (p) { L.panel === p.dataset.panel ? closePanel() : openPanel(p.dataset.panel); return; }
      if (e.target.closest("#lg-ready")) readyAction(false);
      if (e.target.closest("#lg-solo-restart")) restartSolo();
    });
    panel.addEventListener("click", onPanelClick);
    panel.addEventListener("change", onPanelChange);
    panel.addEventListener("input", e => { if (e.target.matches("#lg-crit-line, [data-note], [data-pred], [data-end], [data-weight]")) econChange(e); if (e.target.matches("[data-j]")) onPanelChange(e); const r = e.target.closest("#lg-price"); if (r) { const o = document.getElementById("lg-price-v"); if (o) o.textContent = (+r.value).toFixed(3); } });
    renderBar();
  }
  function renderBar() {
    const V = L.snap, reg = R();
    const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    if (!V) { set("lg-bround", "진행자 연결 대기"); set("lg-bphase", ""); return; }
    const rd = curRound();
    const RS0 = C.roundsOf(V);
    set("lg-bround", V.round ? turnLabel(rd, V.round, RS0.length, true) : `준비 · ${turnLabel(RS0[0], 1, RS0.length, true)}`);
    set("lg-bphase", PHASE_NAME[V.phase]);
    const me = V.teams[L.team], rb = document.getElementById("lg-ready");
    for (const id of ["lg-bar", "lg-panel"]) { const el = document.getElementById(id); if (el) el.dataset.econ = String(!!V.econ); }
    if (rb) rb.style.minHeight = V.econ ? "44px" : "";
    if (rb) { rb.setAttribute("aria-pressed", String(!!me.ready)); rb.textContent = V.econ && V.phase === "plan" && L.awaitReady ? "건너뛰고 준비" : L.role === "solo" && V.phase === "review" ? V.round === C.roundsOf(V).length ? "최종 결과" : "다음 달" : me.ready ? "준비 ✓" : "준비"; rb.disabled = V.phase === "end" || V.phase === "run" || !!V.econ && L.role !== "solo" && V.phase !== "plan" && V.phase !== "lobby"; }
    if (V.econ && !document.querySelector('.lg-bar [data-panel="city"]')) {
      const bar = document.getElementById("lg-bar"), b = document.createElement("button"); b.type = "button"; b.className = "lg-bbtn"; b.dataset.panel = "city"; b.textContent = "도시"; bar?.insertBefore(b, rb);
      const rank = b.cloneNode(true); rank.dataset.panel = "rank"; rank.textContent = "순위"; bar?.insertBefore(rank, rb);
    }
    const inc = V.ties.filter(T => T.st === "prop" && T.by !== L.team && (T.a === L.team || T.b === L.team)).length;
    const bd = document.getElementById("lg-badge");
    if (bd) { bd.hidden = !inc; bd.textContent = String(inc); }
    tickTimer();
  }
  function openPanel(tab) { L.panel = tab; const p = document.getElementById("lg-panel"); if (!p) return; p.hidden = false; renderPanel(); document.querySelectorAll(".lg-bar [data-panel]").forEach(b => b.setAttribute("aria-expanded", String(b.dataset.panel === tab))); }
  function closePanel() { L.panel = null; const p = document.getElementById("lg-panel"); if (p) p.hidden = true; document.querySelectorAll(".lg-bar [data-panel]").forEach(b => b.setAttribute("aria-expanded", "false")); }
  // 내 도시 안에서 그 이웃 쪽 외부 연결점까지 선이 이어졌나
  function gateLinked(other) {
    const st = BG.current();
    if (!st) return false;
    const N = BG.network(st);
    return N.nodes.some(n => n.kind === "import" && (BG.SITES[n.si].to || []).includes(other) && n.comp >= 0 && n.att.length > 0 && N.comps.some(Cc => Cc.disp.includes(n) && (Cc.towns.length || Cc.ren.length || Cc.disp.length > 1)));
  }
  function renderPanel() {
    const p = document.getElementById("lg-panel");
    if (!p || !L.panel) return;
    const V = L.snap, reg = R(), tab = L.panel;
    const focused = document.activeElement, focusKey = focused && p.contains(focused) ? ["data-note", "data-j", "data-end", "data-pol", "id"].find(k => focused.hasAttribute(k)) : null;
    const focusValue = focusKey ? focused.getAttribute(focusKey) : null, cursor = focusKey && focused.tagName === "TEXTAREA" ? [focused.selectionStart, focused.selectionEnd] : null;
    let body = "";
    if (!V) body = `<p class="lg-hint">진행자 연결을 기다리는 중입니다.</p>`;
    else if (tab === "city" && V.econ) body = cityHTML(V);
    else if (tab === "rank" && V.econ) body = tickerHTML(V) + rankHTML(V.econ, L.role !== "solo");
    else if (tab === "deal") {
      const me = V.teams[L.team], open = V.phase === "lobby" || V.phase === "plan";
      const nbs = reg.ties.filter(D => (D.a === L.team || D.b === L.team) && V.teams[D.a] && V.teams[D.b]);
      const st0 = BG.current(), spent = st0 ? BG.capex(st0) : 0, loss = (me.fixed || 0) + C.lossOf(me.base, st0), left = me.budget - spent - loss;
      const evh = V.round ? evCards(V, V.round, L.team, V.phase === "plan") : "";
      body = `${evh ? `<section class="lg-sec"><h3>이번 라운드 사건</h3>${evh}</section>` : ""}<p class="lg-left">남은 예산 <b class="num" data-bad="${left < 6}">${fmt(left, 1)}억</b> <small>(예산 ${fmt(me.budget, 1)}억 − 건설 ${fmt(spent, 1)}억${loss > 0.05 ? ` − 철거 손실·사건 대응 ${fmt(loss, 1)}억` : ""} · 연계선은 두 도시가 반씩 · 지난 라운드 것을 철거하면 ${Math.round(C.SALV * 100)}%만 회수)</small></p>
        <section class="lg-sec"><h3>내 전기 판매 단가</h3>
          <p class="lg-hint">이웃이 모자랄 때 남는 전기를 이 값에 팝니다(MWh당 억). 화력 여유분은 연료비보다 비쌀 때만 팝니다.</p>
          <label class="lg-price"><input type="range" id="lg-price" min="${C.PRICE.min}" max="${C.PRICE.max}" step="0.001" value="${me.price}" ${open ? "" : "disabled"} aria-label="판매 단가"><b class="num" id="lg-price-v">${me.price.toFixed(3)}</b></label></section>
        <section class="lg-sec"><h3>이웃 연계선</h3><ul class="lg-nbs">${nbs.map(D => {
          const other = D.a === L.team ? D.b : D.a, T = V.ties.find(x => x.a === D.a && x.b === D.b);
          const half2 = D.cost / 2, half4 = D.cost * 1.6 / 2, linked = gateLinked(other);
          let st = "", act = "";
          if (!T) { st = "없음"; act = open ? `<button type="button" class="v2-btn" data-tie="propose" data-other="${other}" data-cap="2">2 MW 제안 (내 몫 ${fmt(half2, 1)}억)</button><button type="button" class="v2-btn" data-tie="propose" data-other="${other}" data-cap="4">4 MW 제안 (${fmt(half4, 1)}억)</button>` : ""; }
          else if (T.st === "built") st = `${T.cap} MW 연결됨`;
          else if (T.by === L.team) { st = `${T.cap} MW 제안함 · 답 기다림`; act = open ? `<button type="button" class="v2-btn" data-tie="cancel" data-other="${other}">제안 거두기</button>` : ""; }
          else { st = `${teamName(T.by)}이(가) ${T.cap} MW 제안`; act = open ? `<button type="button" class="v2-btn primary" data-tie="accept" data-other="${other}">수락 (내 몫 ${fmt(C.tieCost(reg, T) / 2, 1)}억)</button>` : ""; }
          return `<li style="--c:${teamCol(other)}"><div class="lg-nbh"><b>${esc(teamName(other))}</b><span>${esc(D.name)} · ${D.kind === "sea" ? "해저" : D.kind === "bay" ? "만 횡단" : "육상"}</span><span class="lg-gate" data-ok="${linked}">${linked ? "연결점까지 선 이음" : "연결점(노란 칸)까지 선 필요"}</span></div>
            <p class="lg-nbs-st">${esc(st)}</p><div class="lg-acts">${act}</div></li>`;
        }).join("")}</ul></section>`;
    } else if (tab === "result") {
      const res = V.results[V.results.length - 1];
      if (!res) body = `<p class="lg-hint">라운드를 운영하면 결과가 여기에 나옵니다. 그 전에는 아래 [1주] 버튼으로 <b>우리 도시만</b> 시험 운전해 볼 수 있습니다(이웃 거래 없이).</p>`;
      else {
        const r = res.team[L.team], g = V.goals || reg.goals;
        const rd = C.roundsOf(V)[res.round - 1];
        const curtailMWh = res.econ?.grid?.[L.team]?.curtailMWh ??
          (r.curtailMWh == null ? undefined : r.curtailMWh * (rd.mdays || rd.days) / rd.days);
        const rank = actT(V).filter(t => res.team[t.id]).map(t => ({ t, r: res.team[t.id] }));
        body = `<section class="lg-sec"><h3>${resLabel(res)} — ${esc(teamName(L.team))}</h3>
          <dl class="lg-kpi">
            <div><dt>정전</dt><dd class="num" data-bad="${r.unsPct > g.unsPct}">${fmt(r.unsPct, 2)}%</dd><small>혼자였다면 ${fmt(100 * r.isolated.uns / Math.max(1e-9, r.dem), 2)}%</small></div>
            <div><dt>병원 정전</dt><dd class="num" data-bad="${r.hospH > 0}">${r.hospH}시간</dd></div>
            <div><dt>사 온 전기 / 판 전기</dt><dd class="num">${fmt(r.imp, 1)} / ${fmt(r.exp, 1)} MWh</dd><small>거래 수지 ${fmt(r.earn - r.pay, 2)}억</small></div>
            <div><dt>CO₂ 생산 / 소비 기준</dt><dd class="num">${fmt(r.co2Prod)} / ${fmt(r.co2Cons)} t</dd></div>
            <div><dt>이번 라운드 돈</dt><dd class="num">${fmt(r.cost.total, 1)}억</dd><small>새 투자 ${fmt(r.cost.inv != null ? r.cost.inv : r.cost.capex, 1)} + 운영 ${fmt(r.cost.opex != null ? r.cost.opex : r.cost.fuel, 1)}(연료·정책·대응${r.cost.research ? "·연구소" : ""}·거래) · 누적 투자 ${fmt(r.cost.stock != null ? r.cost.stock : r.cost.capex, 1)}</small></div>
            <div><dt>최저 만족 · 민원</dt><dd class="num">${r.sat} · ${r.cp}건</dd></div>
          </dl>
          ${curtailHTML(V, res, L.team, curtailMWh)}
          ${res.events && res.events.length ? `<div class="lg-evres">${evCards(V, res.round, L.team)}</div>` : ""}${res.tieDown ? `<p class="lg-warn">고장 난 연계선: ${res.tieDown.split("~").map(teamName).map(esc).join("–")}</p>` : ""}
          ${r.unlinked.length ? `<p class="lg-warn">연계선이 있어도 연결점까지 선이 없어 거래 못 함: ${r.unlinked.map(teamName).map(esc).join(", ")}</p>` : ""}
          <p class="lg-goals"><span data-ok="${res.region.ok.uns}">지역 정전 ${fmt(res.region.unsPct, 2)}%</span><span data-ok="${res.region.ok.co2}">지역 CO₂ ${fmt(res.region.co2)} t / ${fmt(g.co2)} t</span></p></section>
          <section class="lg-sec"><h3>다른 도시</h3><table class="lg-table lg-mini"><thead><tr><th scope="col">팀</th><th scope="col">정전</th><th scope="col">CO₂ 생산</th><th scope="col">수입/수출</th></tr></thead><tbody>
          ${rank.map(x => `<tr style="--c:${x.t.color}" ${x.t.id === L.team ? 'data-me="true"' : ""}><th scope="row">${esc(x.t.name)}</th><td class="num">${fmt(x.r.unsPct, 2)}%</td><td class="num">${fmt(x.r.co2Prod)}</td><td class="num">${fmt(x.r.imp, 1)}/${fmt(x.r.exp, 1)}</td></tr>`).join("")}</tbody></table></section>`;
      }
    } else {
      const J = tdata().journal[V.round || 0] || {};
      body = `<section class="lg-sec"><h3>${V.round ? `${V.round}라운드` : "준비"} 일지</h3><p class="lg-hint">이 기기에만 저장됩니다.</p>
        ${JQ.map(q => `<label class="lg-jq"><span>${esc(L.role === "solo" ? q.q.replaceAll("우리", "내") : q.q)}</span><textarea data-j="${q.k}" rows="3" maxlength="1000">${esc(J[q.k] || "")}</textarea></label>`).join("")}
        <button type="button" class="v2-btn" id="lg-jcopy">활동지로 복사</button></section>`;
    }
    if (V?.econ) {
      if (tab === "result") {
        const interview = resultInterviewHTML(V), start = interview.indexOf('<section class="lg-ask ');
        body = (start < 0 ? interview : interview.slice(0, start)) + body + (start < 0 ? "" : interview.slice(start)) + (V.phase === "end" ? endHTML(V) : "");
      }
      if (tab === "journal") body = critHTML(V) + predictionHTML(V) + body.replace('<button type="button" class="v2-btn" id="lg-jcopy">', quarterHTML(V) + '<button type="button" class="v2-btn" id="lg-jcopy">');
    }
    p.innerHTML = `<div class="lg-ptabs" role="group" aria-label="리그 서랍">${[["deal", "이웃·거래"], ["result", "결과"], ["journal", "일지"], ...(V?.econ ? [["city", "도시"], ["rank", "순위"]] : [])].map(([k, n]) => `<button type="button" class="lg-ptab" data-ptab="${k}" aria-pressed="${k === tab}">${n}</button>`).join("")}<button type="button" class="lg-px" data-pclose aria-label="닫기">×</button></div><div class="lg-pbody">${body}</div>`;
    restorePanelFocus(p, focusKey, focusValue, cursor);
  }
  function restorePanelFocus(p, key, value, cursor) {
    if (!key) return;
    const target = [...p.querySelectorAll(`[${key}]`)].find(el => el.getAttribute(key) === value);
    if (target) { target.focus({ preventScroll: true }); if (cursor) target.setSelectionRange(...cursor); }
  }
  function onPanelClick(e) {
    if (econClick(e)) return;
    const t = e.target.closest("[data-ptab]"), x = e.target.closest("[data-pclose]"), tie = e.target.closest("[data-tie]");
    if (x) { closePanel(); return; }
    if (t) { openPanel(t.dataset.ptab); return; }
    if (tie && L.snap?.econ) {
      const { d, n } = monthNote(), other = tie.dataset.other;
      const X = L.snap.ties.find(x => x.st === "prop" && (x.a === L.team && x.b === other || x.b === L.team && x.a === other));
      n.big = true; n.confirmed = false;
      if (tie.dataset.tie === "cancel" && X && X.by !== L.team) { n.rejected = true; n.rejectedOther = other; }
      putData(d);
    }
    if (tie) { send("tie", { op: tie.dataset.tie, other: tie.dataset.other, cap: +tie.dataset.cap || 2 }); tie.disabled = true; return; }
    const rs = e.target.closest("[data-resp]");
    if (rs) { send("respond", { ev: rs.dataset.ev, opt: rs.dataset.resp }); rs.closest(".lg-evopts").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === rs))); return; }
    if (e.target.closest("#lg-jcopy") && L.snap?.econ) { copyText(worksheet(L.snap), "활동지를 복사했습니다", e.target.closest("#lg-jcopy")); return; }
    if (e.target.closest("#lg-jcopy")) {
      const V = L.snap, J = tdata().journal[V ? V.round : 0] || {}, res = V && V.results[V.results.length - 1];
      const r = res && res.team[L.team];
      const txt = [`[${R().name} 전력 리그] ${teamName(L.team)} · ${V && V.round ? `${V.round}라운드` : "준비"}`,
        r ? `결과: 정전 ${fmt(r.unsPct, 2)}% · 병원 정전 ${r.hospH}h · CO₂ 생산 ${fmt(r.co2Prod)} t / 소비 ${fmt(r.co2Cons)} t · 수입 ${fmt(r.imp, 1)} / 수출 ${fmt(r.exp, 1)} MWh` : "",
        ...JQ.map(q => `■ ${q.q}\n${J[q.k] || ""}`)].filter(Boolean).join("\n\n");
      copyText(txt, "일지를 복사했습니다", e.target.closest("#lg-jcopy"));
    }
  }
  function onPanelChange(e) {
    if (econChange(e)) return;
    const pr = e.target.closest("#lg-price");
    if (pr) { send("price", { price: +pr.value }); return; }
    const j = e.target.closest("[data-j]");
    if (j) {
      const s = tdata(), rd = L.snap ? L.snap.round : 0;
      s.journal[rd] = s.journal[rd] || {}; s.journal[rd][j.dataset.j] = j.value.slice(0, 1000);
      putData(s);
    }
  }
  function copyText(text, ok, btn) {
    const done = () => { if (btn) { const o = btn.textContent; btn.textContent = ok; setTimeout(() => { btn.textContent = o; }, 1600); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => window.prompt("복사하세요", text));
    else window.prompt("복사하세요", text);
  }

  KCP.route("league", (app, arg) => {
    if (arg === "solo") startSolo(app);
    else if (arg === "host") hostView(app);
    else if (/^view\//.test(arg || "")) viewCity(app, arg.slice(5));
    else if (arg === "team") teamView(app);
    else lobby(app, /^j=/.test(arg || "") ? arg.slice(2) : null);
  });
  // 검사용
  KCP.league = {
    state: () => (L ? { role: L.role, room: L.room, team: L.team, S: L.S, snap: L.snap, rev: L.rev } : null),
    next: () => L && (L.role === "solo" ? soloNext() : L.role === "host" && hostNext()),
    uiMath: { causeBreakdown, reweightScore, chooseQuestion, weightSimulation },
    // 팀 기기에서 계획을 코드로 고친다(검사·시연 녹화용). 화면 조작과 같은 길(rev 올림 → 진행자에게 보냄).
    plan: fn => { const st = BG.current(); if (!st || !L || !["team", "solo"].includes(L.role) || lockMsg()) return false; fn(st); L.rev++; sendPlan(); BG.refresh(); return true; }
  };
})();
