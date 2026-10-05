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

  let lobbyStop = null;
  let L = null; // { role, room, net, conn, S?(진행자 상태), snap?(받은 공개 상태), team?, token?, timers[] }
  function close() {
    if (!L) return;
    saveSolo();
    L.regionObserver?.disconnect(); L.hudObserver?.disconnect();
    L.timers.forEach(t => clearInterval(t));
    clearTimeout(L.planT); clearTimeout(L.pending);
    if (L.conn) L.conn.close();
    L = null;
  }
  KCP.on("route:change", ({ name, arg }) => {
    lobbyStop?.(); lobbyStop = null;
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
  "lg-f-event": "예보와 확정된 사건 크기를 비교해 보세요. 우리 대응을 다음 달에도 유지할지, 무엇을 고칠지 말해 보세요.",
  "lg-f-lag": "정책 효과가 바로 나타난다면 이번 결정은 달라졌을까요?",
  "lg-d-headline": "다음 달 우리 도시 신문 1면 제목을 하나 지어 보세요. 그 제목이 나오려면 지금 무엇을 해야 하나요?",
  "lg-e-weights": "점수표에서 우리 순위를 가장 많이 올린 항목과 깎은 항목은? 그 가중치는 공정한가요?",
  "lg-h-approval": "주민 평가 결과가 나왔습니다. 가장 낮은 집단을 다음 해에 어떻게 대하겠습니까?",
  "lg-h-criterion": "이 리그 점수표에 항목 하나를 더한다면 무엇을 넣겠습니까?"
};
  /* 경제 화면 계산. 표시용 추정은 엔진 결과와 구분한다. */
  // Realtime은 객체 키를 재정렬한다. 표시·동률 순서는 공개 상태가 아닌 명세·로컬 자료에서 읽는다.
  const SCORE_KEYS = ["pop", "ind", "fin", "co2", "appr", "rel"];
  const GROUP_KEYS = Object.keys(KCP.ECON_DATA.groups);
  const EXPORT_KEYS = Object.keys(KCP.ECON_DATA.intl.base.export);
  const OFFER_CHECK_KEYS = ["mw", "re", "rel", "workers"];
  const SCORE_NAMES = { pop: "주민", ind: "산업", fin: "재정", co2: "탄소", appr: "지지", rel: "전력 신뢰" };
  const PART_NAMES = { rel: "전력 신뢰", price: "전기요금", air: "공기", jobs: "일자리", svc: "공공서비스", tax: "세금", crowd: "집값·혼잡", A: "산업 여건", out: "산출", taxI: "산업 세금", ren: "재생", co2: "탄소" };
  // G: 질문 빈도·문턱은 ECON-UI U4와 INTERVIEW §4의 화면 가정이다. 엔진 계수가 아니다.
  const IQ = { large: 0.2, co2Up: 0.05, spare: 0.3, gapWide: 40, gapNarrow: 10, approval: 3, rank: 2, quarter: 3, target: 6, max: 8, line: 50 };
  const END_Q = ["우리 계획을 기준 먼저, 2분 동안 설명해 보세요.", "가장 어려웠던 결정에서 무엇을 포기했나요?", "예측과 결과가 가장 크게 어긋난 달은 언제였나요?", "받은 반문 하나에 대해 고치거나 유지하는 최종 이유는?", "이 리그 점수표에 항목 하나를 더한다면 무엇을 넣겠습니까?"];
  const params = k => KCP.ECON_DATA.params[k].v;
  const signed = (x, d = 0) => `${x > 0 ? "+" : ""}${fmt(x, d)}`;
  const lowestGroup = groups => GROUP_KEYS.filter(k => Object.hasOwn(groups, k)).sort((a, b) => groups[a] - groups[b] || GROUP_KEYS.indexOf(a) - GROUP_KEYS.indexOf(b))[0];
  function reweightScore(score, weights) {
    const total = Object.values(weights).reduce((a, x) => a + Math.max(0, Number(x) || 0), 0);
    const rows = (score?.rank || []).map((r, i) => ({ ...r, order: i, score: total ? SCORE_KEYS.reduce((a, k) => a + (r.parts[k] || 0) * Math.max(0, Number(weights[k]) || 0), 0) / total : r.score }));
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
      "lg-i-smoke": x.smoke, "lg-i-timing": x.firstResearch || x.left <= IQ.quarter && x.large,
      "lg-i-lab": x.labPending && x.left <= IQ.quarter + 1, "lg-i-gap": x.outflow,
      "lg-i-cause": x.news >= IQ.quarter, "lg-i-offer": x.offerFail === 1,
      "lg-r-co2": x.dUns < 0 && x.co2Growth >= IQ.co2Up, "lg-r-outage": x.dUns > 0 && x.co2Growth <= -IQ.co2Up,
      "lg-r-tax": x.tax >= 1 && x.dSenior < 0, "lg-r-free": x.tax <= -1 && x.service >= 1 && x.balance < 0,
      "lg-r-tie": x.rejected && x.neighborWorse, "lg-f-typhoon": x.quarter && x.tradeShare >= IQ.large && x.ties > 0,
      "lg-f-event": x.event, "lg-f-lag": x.policyPrevious, "lg-d-headline": x.quarter,
      "lg-e-weights": x.quarter && Math.abs(x.dRank) >= IQ.rank,
      "lg-h-approval": x.evaluation, "lg-h-criterion": x.end
    };
    const candidates = Object.keys(tests).filter(k => tests[k] && k !== x.last && (!x.used || x.used.indexOf(k) === x.used.lastIndexOf(k)) && (!x.allowed || x.allowed.some(prefix => k.startsWith(prefix))));
    if (x.event && !x.allowed) return candidates.includes("lg-f-event") ? "lg-f-event" : null;
    const priority = x.crit?.includes("rel") ? ["lg-r-co2", "lg-r-outage"] : x.crit?.includes("co2") ? ["lg-r-outage", "lg-r-co2"] : [];
    return ["lg-f-event", ...priority, ...candidates.filter(k => k.startsWith("lg-r-")), "lg-p-line", "lg-p-predict", ...candidates].find(k => candidates.includes(k)) || null;
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
  const ASSUMPTIONS = '표시 없는 수치·계수는 게임 가정(G)';
  function sourceHTML(id) {
    const start = KCP.ECON_DATA.start[id], names = { pop0: "시작 주민", ind0: "시작 종사자", fsr0: "시작 재정자립도" };
    if (!start?.src) return `<p class="lg-hint">시작 자료: ${esc(start?.note || "출처 자료 준비 중")}</p>`;
    return `<details id="lg-start-src"><summary>시작 자료·출처</summary>${Object.entries(start.src).map(([key, src]) => {
      if (!src || typeof src !== "object") return "";
      const field = ({ pop: "pop0", ind: "ind0", fsr: "fsr0" })[key] || key;
      const value = field === "fsr0" ? start[field] * 100 : start[field];
      return `<p>${esc(names[field] || key)} ${esc(fmt(value, 1))}${esc(src.unit || (field === "fsr0" ? "%" : "명"))} · ${esc(src.year || "기준연도 없음")} · ${esc(src.source || src.note || "게임 가정")} <span class="${src.grade === "G" ? "tag-mine" : "tag-official"}">${esc(src.grade || "G")}</span></p>`;
    }).join("")}</details>`;
  }
  function cityHTML(V) {
    const E = V.econ, c = E.cities[L.team], rep = E.report, f = rep?.fiscal[L.team], g = rep?.groups[L.team];
    const h = c.hist, prev = E.before?.[L.team], dp = rep?.cities[L.team]?.dPop || 0, di = rep?.cities[L.team]?.dInd || 0;
    const groups = GROUP_KEYS.filter(k => Object.hasOwn(c.groups, k)), low = lowestGroup(c.groups);
    const pol = L.pendingPol || V.teams[L.team].econPol || c.policy || {}, open = V.phase === "plan";
    const every = params("reviewEvery"), remaining = every - E.t % every;
    const grid = c.grid || V.grid?.[L.team];
    const revenues = { subsidy: "재정지원금", resTax: "주민세", indTax: "산업세", tariff: "전기요금 차익", trade: "전력 판매", bonus: "사건 지원금", salvage: "철거 회수" };
    const expenses = { capex: "건설", fuel: "연료", opex: "운영", service: "공공서비스", incentive: "유치 보조", interest: "이자", trade: "전력 구매", polChange: "정책 변경", policy: "시위 중 정책 변경" };
    const money = (title, vals, names) => `<h4>${title}</h4><dl class="lg-money">${Object.keys(names).filter(k => Object.hasOwn(vals || {}, k)).map(k => `<div><dt>${esc(names[k] || k)}</dt><dd>${esc(fmt(vals[k], 2))}억</dd></div>`).join("")}</dl>`;
    return `<section id="lg-city" class="lg-sec"><h3>${esc(c.name)} 도시</h3>${sourceHTML(L.team)}
      <p class="lg-left">남은 돈 <b data-money="left">${esc(fmt(V.teams[L.team].left, 1))}억</b></p><p class="lg-hint">억 = 게임 단위(실제 시 예산 아님) · ${ASSUMPTIONS}</p><dl class="lg-kpi"><div><dt>주민</dt><dd>${esc(fmt(c.pop))}명</dd><small>지난달 ${esc(signed(dp))}명</small></div><div><dt>종사자</dt><dd>${esc(fmt(c.ind))}명</dd><small>지난달 ${esc(signed(di))}명</small></div><div><dt>현금</dt><dd>${esc(fmt(c.cash, 1))}억</dd><small>지방채 한도 ${esc(fmt(c.debtCap, 1))}억</small></div><div><dt>지지율</dt><dd>${esc(fmt(c.approval, 1))}%</dd><small>다음 평가 ${esc(fmt(remaining))}달 뒤 · 통과 ≥ ${esc(fmt(c.approval0 - params("approvalDrop"), 1))}%</small></div></dl>
      <section id="lg-grid" aria-label="재생 접속과 출력제어"><dl><div><dt>재생 접속 여유(남은/전체)</dt><dd>${esc(fmt(grid?.headroomMW, 1))} / ${esc(fmt(grid?.hostMW, 1))} MW</dd></div><div><dt>접속 대기</dt><dd data-waiting="${grid?.waitingMW > 0}">${esc(fmt(grid?.waitingMW, 1))} MW</dd></div></dl>${curtailHTML(V, V.results.at(-1), L.team)}<p class="lg-hint">재생 설비는 지어도 전력망 접속 여유가 있어야 발전합니다. ESS와 연계선이 여유를 늘립니다. <span class="tag-mine">G · 접속·출력제어</span> <span class="tag-official">O* · ESS 충전 상한</span></p></section>
      <h4>집단 만족</h4>${groups.map(k => `<div class="lg-grp" data-g="${esc(k)}"><button type="button" data-group="${esc(k)}" aria-expanded="${L.group === k}">${esc(KCP.ECON_DATA.groups[k].name)} · 비중 ${esc(fmt(c.shares[k] * 100, 1))}% · 만족 ${esc(fmt(c.groups[k], 1))}점</button><meter min="0" max="100" value="${esc(c.groups[k])}" aria-label="${esc(KCP.ECON_DATA.groups[k].name)} 만족"></meter>${k === low && g?.why ? `<p class="lg-why">왜? ${esc(g.why.text)}</p>` : ""}${L.group === k ? groupCauseHTML(c, k, rep, prev) : ""}</div>`).join("")}
      <section id="lg-econpol"><h4>정책 <span class="tag-mine">G</span></h4>${[["taxRes", "주민 세율", "세입↑ / 주민 매력↓"], ["taxInd", "산업 세율", "세입↑ / 기업 매력↓"], ["service", "공공서비스", "생활 만족↑ / 지출↑"], ["incentive", "기업 유치 보조", "기업 매력↑ / 지출↑"]].map(([k, name, help]) => `<label class="lg-policy"><span>${name} <output>${esc(fmt(pol[k] || 0, 1))}${k === "incentive" ? "억/달" : "단계"}</output></span><input type="range" data-pol="${k}" min="${k === "incentive" ? 0 : -2}" max="${k === "incentive" ? 20 : 2}" step="1" value="${esc(pol[k] || 0)}" ${open ? "" : "disabled"}><small>얻는 것 / 잃는 것: ${help}</small></label>`).join("")}</section>
      <section id="lg-fiscal"><h4>지난달 돈</h4>${f ? `${money("세입", f.rev, revenues)}${money("세출", f.exp, expenses)}<p>운영 수지(건설 제외) ${esc(signed(f.revTotal - f.expTotal + f.exp.capex, 2))}억</p><p class="lg-hint">연료 ${esc(fmt((V.results.at(-1)?.team[L.team]?.cost.fuel || 0) * (rep.weekMul || 1), 2))}억(전기요금 차익에 이미 반영). 총 전기 매출(참고) ${esc(fmt(f.tariffGross, 2))}억</p>` : `<p class="lg-hint">첫 운영 뒤에 표시됩니다.</p>`}</section>
      <section id="lg-moves"><h4>지난달 이주·이전</h4>${movesHTML(rep, L.team)}</section>
      <section id="lg-offers"><h4>기업 이전 희망</h4>${E.offers.length ? E.offers.map(o => { const e = o.eval?.by[L.team]; return `<article class="lg-offer" data-offer="${esc(o.id)}"><b>${esc(o.name)} · ${esc(fmt(o.workers))}명</b>${e ? `<p>조건 충족 도시 우선 순위 ${esc(e.rank)}위</p>${OFFER_CHECK_KEYS.filter(k => Object.hasOwn(e.checks, k)).map(k => [k, e.checks[k]]).map(([k, v]) => `<p data-check="${esc(k)}" data-ok="${v.ok ? "true" : "false"}">${v.ok ? "✓" : "✗"} ${esc({ mw: "여유 전력", re: "재생", rel: "정전", workers: "구직 인력" }[k])}: 우리 ${esc(fmt(v.have, 1))}${esc({ mw: " MW", re: "%", rel: "%", workers: "명" }[k])} / 조건 ${k === "rel" ? "≤" : "≥"} ${esc(fmt(v.need, 1))}${esc({ mw: " MW", re: "%", rel: "%", workers: "명" }[k])}</p>`).join("")}` : `<p>운영 뒤 조건 평가가 표시됩니다.</p>`}</article>`; }).join("") : `<p class="lg-hint">열린 제안이 없습니다.</p>`}</section>
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
  // 기술 표시는 공개 연구 상태를 그대로 읽는다. 칭호는 점수에 더하지 않는다.
  // T2 화면 연출 시간(게임 계수 아님): 0.8초. CSS의 lg-tech-reveal과 일치한다.
  const TECH_FLIP_MS = 800;
  const techData = () => KCP.TECH_DATA;
  const techCard = id => techData()?.cards.find(c => c.id === id);
  const techResearch = (V, id) => V.teams?.[id]?.research || V.econ?.cities?.[id]?.research || V.teams?.[id]?.rs || {};
  function techTitlesHTML(rs) {
    return (rs.titles || []).map(id => techData()?.titles.find(t => t.id === id)).filter(Boolean)
      .map(t => `<span class="lg-tech-title" title="칭호는 점수에 더하지 않습니다">◇ ${esc(t.name)}</span>`).join("");
  }
  function techIconsHTML(rs) {
    return (rs.adopted || []).map(techCard).filter(Boolean).map(c => `<span class="lg-tech-icon" data-tech-adopted="${esc(c.id)}" title="${esc(c.name)}"><span aria-hidden="true">◆</span> ${esc(c.name)}</span>`).join("");
  }
  function techNewsHTML(V) {
    const res = V.results?.at(-1);
    return actT(V).flatMap(t => (res?.team[t.id]?.research?.completed || []).map(techCard).filter(Boolean)
      .map(c => `<p class="lg-tech-news">${esc(t.name)}, ${esc(c.name)} 개발 · 다음 턴 도입</p>`)).join("");
  }
  function techState(V, id, c) {
    const rs = techResearch(V, id), queue = rs.queue || V.teams[id].plan?.rq || [];
    const other = techData().pairs.find(pair => pair.includes(c.id))?.find(k => k !== c.id);
    const selected = [...(rs.adopted || []), ...queue, ...Object.keys(rs.stage || {}).filter(k => rs.stage[k]), ...Object.keys(rs.adoptR || {})];
    if (rs.adopted?.includes(c.id)) return { key: "adopted", text: "도입", blocked: true };
    if (rs.stage?.[c.id] === "done" || rs.adoptR?.[c.id] > V.round) return { key: "pending", text: "다음 턴 도입", blocked: true };
    if (rs.stage?.[c.id] === "demo") return { key: "demo", text: "실증 중", blocked: true };
    if (queue.includes(c.id)) return { key: rs.current === c.id || (!rs.current && queue[0] === c.id) ? "progress" : "queued", text: rs.current === c.id || (!rs.current && queue[0] === c.id) ? "진행 중" : "연구 대기", blocked: false };
    if (other && selected.includes(other)) return { key: "locked", text: "잠김", why: `${techCard(other)?.name || other} 선택 · 둘 중 하나`, blocked: true };
    const req = c.req || [], adopted = rs.adopted || [];
    if (req.length && !(c.id === "mass" ? req.some(k => adopted.includes(k)) : req.every(k => adopted.includes(k))))
      return { key: "locked", text: "잠김", why: `${req.map(k => techCard(k)?.name || k).join(c.id === "mass" ? " 또는 " : " · ")} 도입 필요`, blocked: true };
    if (c.id === "re100" && (V.results?.at(-1)?.team[id]?.renPct || 0) < techData().params.re100Need.v)
      return { key: "locked", text: "잠김", why: `직전 운영 재생 비중 ${fmt(techData().params.re100Need.v)}% 이상 필요`, blocked: true };
    const donors = actT(V).filter(t => t.id !== id && techResearch(V, t.id).adopted?.includes(c.id));
    return { key: donors.length ? "transfer" : "available", text: donors.length ? "다른 도시 도입 · 이전 가능" : "가능", blocked: false };
  }
  function techScaleHTML(c) {
    // 배속을 새로 가정하지 않는다. 효과의 현실 대비 축소 설명은 등급 있는 자료의 note에서 읽는다.
    const keys = { hvdc: "hvdcLoss", scable: "scableCap", sic: "sicOutput", tandem: "tandemOutput", nbat: "nbatCapacity", mass: "massCost", h2store: "h2Efficiency", h2mix: "h2Co2", ccu: "ccuCo2", smr: "smrTurns", vpp: "drEffect" };
    const p = techData()?.params[keys[c.id]];
    return `<p class="lg-tech-scale">교육용 배속 · 효과 크기: ${esc(p?.note || "현실 대비 효과 비율은 미제공 · 게임 가정")}${p ? ` (${esc(p.grade)})` : " (G)"}. 연구·실증 시간은 턴 단위로 압축합니다(G).</p>`;
  }
  function techDetailHTML(V, c) {
    const rs = techResearch(V, L.team), state = techState(V, L.team, c), queue = rs.queue || [], open = !lockMsg() && !L.techPending;
    const donors = actT(V).filter(t => t.id !== L.team && techResearch(V, t.id).adopted?.includes(c.id));
    const peers = actT(V).filter(t => t.id !== L.team && !techState(V, t.id, c).blocked);
    const peer = peers.find(t => t.id === rs.joint?.[c.id]?.other) || peers.find(t => t.id === L.techPeer) || peers[0];
    const license = rs.licensedFrom?.[c.id], joint = rs.joint?.[c.id], p = techData().params;
    const pair = techData().pairs.find(pair => pair.includes(c.id));
    const source = (c.sources || []).filter(s => typeof s === "string");
    const links = source.map(s => /^(https?:\/\/|docs\/)[^\s]+$/.test(s) ? `<a href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(s.startsWith("docs/") ? s.split("/").at(-1) : new URL(s).hostname)}</a>` : esc(s));
    const unlocked = (c.unlock?.builds || []).map(k => BG.BLD[k]?.name || k);
    if (c.unlock?.tie) unlocked.push("HVDC 연계선");
    if (c.unlock?.policy) unlocked.push("RE100 산단 정책");
    return `<article class="lg-tech-detail" id="lg-tech-detail" data-tech-detail="${esc(c.id)}" aria-label="기술 상세">
      <h3>${esc(c.name)}</h3><p>켄텍 12대 연구분야: <b>${esc(c.field)}</b></p>
      <p class="lg-tech-effect">효과: ${esc(c.eff)} <span class="tag-paper">${esc(c.grade)}</span></p>${techScaleHTML(c)}
      <p>${esc(c.why)}</p><p class="lg-tech-source">출처: ${links.join(" · ")} · 분야 이름은 공식 목록(O)</p>
      <p>필요 연구량 ${esc(fmt(c.need))} · 실증비 ${esc(fmt(c.demo))}억${c.numbers?.demo ? ` (${esc(c.numbers.demo.grade)})` : ""}</p>
      <p>유레카: ${esc(techData().eureka[c.id])}${rs.eureka?.includes(c.id) ? " · 달성" : ` · 남은 연구량의 ${esc(fmt(p.eurekaFrac.v * 100, 1))}% 추가 진척(G)`}</p>
      ${pair ? `<p>둘 중 하나: ${pair.map(k => esc(techCard(k)?.name || k)).join(" / ")}</p>` : ""}
      ${state.why ? `<p>${esc(state.why)}</p>` : ""}${unlocked.length ? `<p>해금: ${unlocked.map(esc).join(" · ")} · 도입 후 건설 도구에서 선택</p>` : ""}
      ${license ? `<p>이전 원 개발 도시: ${esc(teamName(license))}</p>` : ""}
      ${joint ? `<p>공동 연구: ${esc(teamName(joint.other))} · ${joint.active ? "함께 진행(연결이 끊기면 대기)" : "상대 도시의 같은 카드 요청 대기"}</p>` : ""}
      <div class="lg-tech-actions"><button type="button" data-tech-action="research" data-card="${esc(c.id)}" ${open && !state.blocked && !queue.includes(c.id) ? "" : "disabled"}>연구 순서에 넣기</button>
      <label>이전 도시<select id="lg-tech-donor" ${open && donors.length && !state.blocked && !joint && !license ? "" : "disabled"}>${donors.length ? donors.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("") : `<option value="">도입 도시 없음</option>`}</select></label>
      <button type="button" data-tech-action="license" data-card="${esc(c.id)}" ${open && donors.length && !state.blocked && !joint && !license ? "" : "disabled"}>기술 이전</button>
      <label>공동 연구 도시<select id="lg-tech-peer" ${open && peers.length && !state.blocked && !license ? "" : "disabled"}>${peers.length ? peers.map(t => `<option value="${esc(t.id)}" ${t.id === peer?.id ? "selected" : ""}>${esc(t.name)}</option>`).join("") : `<option value="">대상 도시 없음</option>`}</select></label>
      <button type="button" data-tech-action="joint" data-card="${esc(c.id)}" ${open && peers.length && !state.blocked && !license ? "" : "disabled"}>공동 연구</button></div>
      <p class="lg-hint">기술 이전: 필요 연구량 ${esc(fmt(p.licenseNeed.v * 100))}% · 사용료 ${esc(fmt(p.royalty.v, 1))}억/${V.econ ? "달" : "턴"}, 최대 ${esc(fmt(p.royaltyMonths.v))}${V.econ ? "달" : "턴"} · 도시별 수입 상한 ${esc(fmt(p.royaltyCap.v))}억(G).</p>
      <p class="lg-hint">공동 연구는 양쪽 도시의 내부 전력망까지 이어진 연계선과 같은 카드 요청이 필요합니다. 합산 인력으로 진행하고 실증비는 ${esc(fmt(p.jointShare.v * 100))}%씩 부담합니다(G). 서버가 조건과 예산을 확인합니다.</p>
      ${lockMsg() ? `<p>${esc(lockMsg())}</p>` : ""}</article>`;
  }
  function techHTML(V) {
    const data = techData();
    if (!data) return `<p class="lg-hint">연구 자료가 없습니다.</p>`;
    const rs = techResearch(V, L.team), builds = V.teams[L.team].plan?.builds || [], queue = rs.queue || [];
    const chosen = techCard(L.techCard) || techCard(rs.current) || data.cards[0];
    const progress = id => Math.max(0, Math.min(100, rs.progress?.[id] || 0));
    return `<section id="lg-tech" class="lg-tech-panel"><h2>연구 기술 트리</h2>
      <p class="lg-tech-staff">연구 인력: 대학 ${esc(fmt(builds.filter(b => b.t === "uni").length))}곳 · 연구소 ${esc(fmt(builds.filter(b => b.t === "lab").length))}곳 · 인력 ${esc(fmt(rs.staff))}명 · 유효 인력 ${esc(fmt(rs.eff))}명</p>
      <p class="lg-hint">새 대학은 운영을 마친 뒤 인력에 반영됩니다. ${V.econ ? "한 달" : "한 턴"}에 인력당 ${esc(fmt(rs.stepsPerTurn))}주치 진척 · 연구 예약 비용 ${esc(fmt(rs.reservedCost, 1))}억. 인력이 없으면 진척이 멈춥니다.</p>
      <div class="lg-tech-titles">${techTitlesHTML(rs)}</div><p class="lg-tech-queue">연구 순서: ${queue.length ? queue.map((k, i) => `${esc(i + 1)}. ${esc(techCard(k)?.name || k)}`).join(" → ") : "아직 없음"}</p>
      <p class="lg-hint">근거 등급: O 공식 원문 · O* 공식 자료의 검색 요약 · P 논문·보고서 · M 모형 계산 · G 게임 가정.</p>
      <p class="lg-hint">트리 안에서 좌우로 스크롤해 여섯 갈래를 볼 수 있습니다. 카드를 눌러 상세를 확인하세요.</p>
      <div class="lg-tech-scroll" tabindex="0" role="region" aria-label="여섯 갈래 기술 트리, 좌우 스크롤"><div class="lg-tech-tree">${data.branches.map(b => `<section class="lg-tech-branch" data-branch="${esc(b.id)}"><h3>${esc(b.name)}</h3>${data.cards.filter(c => c.branch === b.id).map(c => {
        const state = techState(V, L.team, c), pair = data.pairs.find(pair => pair.includes(c.id));
        return `<button class="lg-tech-card" type="button" data-tech-card="${esc(c.id)}" data-state="${esc(state.key)}" aria-pressed="${c.id === chosen.id}"><strong>${esc(c.name)}</strong><span>${state.key === "locked" ? "🔒 " : state.key === "adopted" ? "◆ " : ""}${esc(state.text)}</span>${["progress", "queued", "demo", "pending"].includes(state.key) ? `<progress max="100" value="${esc(progress(c.id))}" aria-label="${esc(c.name)} 진척"></progress><small>${esc(fmt(progress(c.id), 1))}%${state.key === "demo" ? " · 효과 도입 전 실증" : ""}</small>` : ""}${c.req?.length ? `<small>↑ ${c.req.map(k => esc(techCard(k)?.name || k)).join(c.id === "mass" ? " 또는 " : " · ")}</small>` : ""}${pair ? `<small>둘 중 하나 · ${esc(techCard(pair.find(k => k !== c.id))?.name)}</small>` : ""}</button>`;
      }).join("")}</section>`).join("")}</div></div>
      <p id="lg-tech-status" class="lg-tech-status" role="status">${esc(L.techError || (L.techPending ? "연구 요청을 확인하는 중입니다." : ""))}</p>${techDetailHTML(V, chosen)}</section>`;
  }
  function techResultHTML(V) {
    const res = V.results?.at(-1), rs = res?.team[L.team]?.research;
    if (!rs) return "";
    const completed = (rs.completed || []).map(techCard).filter(Boolean), eureka = (rs.eurekaNow || []).map(techCard).filter(Boolean);
    const key = `${res.round}:${completed.map(c => c.id).join(",")}`;
    // 같은 결과를 다시 그려도 시작 시각을 보존해 반복해서 뒤집지 않는다.
    if (completed.length && L.techReveal?.key !== key) L.techReveal = { key, at: Date.now() };
    const elapsed = Math.max(0, Date.now() - (L.techReveal?.at || 0));
    const animate = completed.length && elapsed < TECH_FLIP_MS;
    return `<section class="lg-tech-results" aria-label="이번 턴 연구 소식">${completed.map(c => `<article class="lg-tech-complete ${animate ? "lg-tech-flip" : ""}" data-tech-completed="${esc(c.id)}"${animate ? ` style="animation-delay:-${esc(elapsed)}ms"` : ""}><p>연구 완료 · 다음 턴 도입</p><h3>${esc(c.name)}</h3><p>${esc(c.eff)} <span class="tag-paper">${esc(c.grade)}</span></p><p>켄텍 연구분야: ${esc(c.field)}</p></article>`).join("")}${eureka.map(c => `<p class="lg-tech-eureka" role="status">유레카! ${esc(c.name)} 연구가 빨라졌습니다 · ${esc(techData().eureka[c.id])}</p>`).join("")}</section>`;
  }
  function techErrorText(error) {
    const text = { exclusive: "둘 중 하나만 선택할 수 있습니다. 연구 순서를 확인하세요.", renewable: `직전 운영의 재생 비중이 ${fmt(techData()?.params.re100Need.v)}% 이상이어야 합니다.`, research: "이미 실증·도입한 카드이거나 연구 순서가 올바르지 않습니다.", license: "상대 도시의 도입 여부와 공동 연구 여부를 확인하세요. 원 개발 도시는 자기 기술을 이전받을 수 없습니다.", joint: "공동 연구를 시작할 수 없습니다. 양쪽 내부 전력망까지 연결된 연계선, 같은 카드 요청, 상대 도시의 연구 상태를 확인하세요.", phase: "지금 단계에서는 연구를 바꿀 수 없습니다.", stale: "턴이나 단계가 바뀌었습니다. 현재 화면에서 다시 요청하세요." };
    if (String(error).startsWith("prerequisite:")) return `${techCard(String(error).split(":")[1])?.name || "이 카드"}의 선행 기술을 먼저 도입해야 합니다.`;
    if (String(error).startsWith("budget:")) return `${teamName(String(error).slice(7))} 예산이 모자랍니다. 실증비와 사용료 예약액을 확인하세요.`;
    return text[error] || `연구 요청을 처리하지 못했습니다 (${String(error)}).`;
  }
  function techClick(e) {
    const card = e.target.closest("[data-tech-card]");
    if (card) { L.techCard = card.dataset.techCard; renderPanel(); return true; }
    const button = e.target.closest("[data-tech-action]");
    if (!button) return false;
    if (button.disabled || lockMsg() || L.techPending) return true;
    const type = button.dataset.techAction, key = button.dataset.card, rs = techResearch(L.snap, L.team);
    const other = document.getElementById(type === "license" ? "lg-tech-donor" : "lg-tech-peer")?.value;
    if (type !== "research" && !other) return true;
    // 미전송 건설 계획을 먼저 보내고, 승인된 rq를 로컬 계획에도 반영한다.
    clearTimeout(L.planT); sendPlan();
    const extra = type === "research" ? { queue: [...(rs.queue || []).filter(k => k !== key), key] } : { other, card: key };
    L.techPending = { type, extra, rev: L.rev, round: L.snap.round, phase: L.snap.phase };
    L.techPeer = type === "joint" ? other : L.techPeer; L.techError = "";
    send(type, extra); renderPanel();
    return true;
  }
  function syncTechQueue(V, me) {
    if (!me || !techData()) return;
    const pending = L.techPending, rs = techResearch(V, L.team), queue = me.plan?.rq || rs.queue || [];
    const accepted = pending && (pending.type === "research" ? JSON.stringify(queue) === JSON.stringify(pending.extra.queue) :
      pending.type === "license" ? !!rs.licensedFrom?.[pending.extra.card] : rs.joint?.[pending.extra.card]?.other === pending.extra.other);
    if (pending && !accepted && (pending.round !== V.round || pending.phase !== V.phase)) {
      L.techPending = null; L.techError = "턴이나 단계가 바뀌었습니다. 연구 순서를 확인하세요.";
    }
    if (pending && !accepted && L.techPending) return;
    const st = L.away ? L.doc?.maps[L.doc.map] : BG.current();
    if (accepted || me.rev >= L.rev) {
      if (st) st.rq = queue.slice();
      // 승인 대기 중 편집도 새 서버 판본보다 앞서야 다음 plan 요청이 무시되지 않는다.
      const edits = accepted ? Math.max(0, L.rev - pending.rev) : 0;
      L.rev = Math.max(L.rev, me.rev + edits);
      if (accepted) { L.techPending = null; L.techError = "연구 요청이 반영되었습니다."; }
      if (edits && !L.away) sendPlan();
    }
  }
  function rankHTML(E, nearby) {
    const rows = E.score?.rank || [], own = rows.findIndex(r => r.id === L.team), prev = E.previousScore?.by || {};
    const leaders = Object.fromEntries(SCORE_KEYS.map(k => [k, Math.max(...rows.map(r => r.parts[k]))]));
    return `<section id="lg-rank" class="lg-sec"><h2>${L.snap?.phase === "end" ? "최종 순위" : "도시 순위"} <span class="tag-mine">모형 점수 · G</span></h2><div class="lg-rankrows">${rows.map((r, i) => {
      const shown = !nearby || Math.abs(i - own) <= 1, delta = prev[r.id] ? prev[r.id].rank - r.rank : 0;
      return `<article class="lg-rankrow" data-team="${esc(r.id)}" data-rank="${esc(r.rank)}" data-me="${r.id === L.team}"><h3>${esc(r.rank)}위 ${shown ? esc(r.name) : ""} <small>${delta ? `${delta > 0 ? "▲" : "▼"}${esc(Math.abs(delta))}` : "–"}</small></h3>${shown ? `${techTitlesHTML(E.cities[r.id].research || {})}<b data-total>${esc(fmt(r.score, 1))}점</b><p>지역 전체의 성장을 빼고 본 변화: 주민 ${esc(signed((E.cities[r.id].pop / E.cities[r.id].pop0 / (E.totals.pop / E.totals.pop0) - 1) * 100, 2))}% · 산업 ${esc(signed((E.cities[r.id].ind / E.cities[r.id].ind0 / (E.totals.ind / E.totals.ind0) - 1) * 100, 2))}%</p><div class="lg-scoreparts">${SCORE_KEYS.map(k => `<div data-part="${k}" data-leader="${r.parts[k] === leaders[k]}"><span>${SCORE_NAMES[k]} ${esc(fmt(r.parts[k], 1))}점 ${r.parts[k] === leaders[k] ? "· 1위(동점 포함)" : ""}</span><meter min="0" max="100" value="${esc(r.parts[k])}" aria-label="${SCORE_NAMES[k]} 부분 점수"></meter></div>`).join("")}</div>` : ""}</article>`;
    }).join("")}</div>${nearby ? `<p class="lg-hint">내 도시와 바로 위·아래 도시의 이름을 보여 줍니다.</p>` : ""}</section>`;
  }
  function tickerHTML(V) {
    const E = V.econ;
    const I = E.intl || {}, exports = EXPORT_KEYS.filter(k => Object.hasOwn(I.export || {}, k)).map(k => I.export[k]), ex = exports.length ? exports.reduce((a, x) => a + x, 0) / exports.length : 1;
    const curtailDef = curtailEvents(V, V.round).map(x => x.E);
    const curtail = curtailDef.length ? `<p class="lg-curtail-news">출력제어: 남는 재생 전기를 버렸어요 — 저장·연계선이 있으면 덜 버립니다 <small>현상 <span class="tag-official">${esc([...new Set(curtailDef.map(e => e?.grade || "G"))].join("·"))}</span> · 크기·대응 <span class="tag-mine">G</span></small></p>` : "";
    return `<section id="lg-ticker" class="lg-ticker" aria-label="국제 지수와 뉴스"><div class="lg-indices">${[["lng", "LNG", I.lng], ["fx", "환율", I.fx], ["export", "수출(부문 평균)", ex], ["ship", "해운", I.ship]].map(([k, name, v]) => `<span data-index="${k}" data-direction="${v >= 1 ? "up" : "down"}">${name} ${esc(fmt(v, 2))} ${v >= 1 ? "▲" : "▼"}</span>`).join("")}</div><p class="lg-hint">1 = 2026년 수준 · 가상 변동(G)</p>${curtail}${techNewsHTML(V)}${(E.intlActive || []).map(x => `<p>${esc((KCP.ECON_DATA.intl.events.find(e => e.id === x.id) || x).name || x.id)}</p>`).join("")}${(E.report?.news || []).slice(0, IQ.quarter).map(x => `<p>${esc(x)}</p>`).join("")}</section>`;
  }
  function criterionDraft(V) {
    const { n } = monthNote(), firstYear = curRound().year === C.roundsOf(V)[0].year;
    const crit = n.crit || V.teams[L.team].crit || { chips: [], line: IQ.line, choice: "keep" };
    // 새해 1월에는 지난해 유지/바꾸기 선택을 이어받지 않는다.
    return { chips: crit.chips.slice(), line: crit.line, choice: curRound().month === 1 && !firstYear && !n.crit ? null : crit.choice };
  }
  const validCritLine = value => Number.isInteger(value) && value >= 0 && value <= 100;
  function queueCrit(crit) {
    L.pendingCrit = validCritLine(crit.line) && crit.chips.length && crit.choice
      ? { chips: crit.chips.slice(), line: crit.line, choice: crit.choice, rid: L.reqSeq = (L.reqSeq || 0) + 1 } : null;
  }
  const readyAllowed = V => V && V.phase !== "end" && V.phase !== "run" &&
    (!V.econ || L.role === "solo" || V.phase === "plan" || V.phase === "lobby");
  function critHTML(V) {
    if (V.phase !== "plan" || curRound().month !== 1) return "";
    const crit = criterionDraft(V), { n } = monthNote(), firstYear = curRound().year === C.roundsOf(V)[0].year;
    return `<section id="lg-crit" class="lg-sec"><h3>${L.role === "solo" ? "내 기준" : "우리 기준"}</h3><p>도시가 가장 지키고 싶은 항목 1~2개를 고르세요. 첫 항목의 부분 점수를 지킬 선으로 둡니다.</p><div class="lg-acts">${SCORE_KEYS.map(k => [k, SCORE_NAMES[k]]).map(([k, name]) => `<button type="button" class="v2-btn" data-crit="${k}" aria-pressed="${crit.chips.includes(k)}">${name}</button>`).join("")}</div><label class="lg-field">${esc(SCORE_NAMES[crit.chips[0]] || "선택 첫 항목")} 지킬 선(점 이상)<input id="lg-crit-line" type="number" min="0" max="100" value="${esc(validCritLine(crit.line) ? crit.line : "")}"></label>${firstYear ? "" : `<div class="lg-acts"><button class="v2-btn" type="button" data-crit-choice="keep" aria-pressed="${crit.choice === "keep"}">유지</button><button class="v2-btn" type="button" data-crit-choice="change" aria-pressed="${crit.choice === "change"}">바꾸기</button></div>`}<label class="lg-jq">이유 한 줄(기기에만)<textarea data-note="critReason" rows="2" maxlength="1000">${esc(n.critReason || "")}</textarea></label><p class="lg-hint">정해진 항목·숫자·유지/바꿈만 진행자에게 보냅니다. 고르지 않으면 기준 미선택으로 둡니다.</p></section>`;
  }
  const EVIDENCE_NAMES = { evening: "저녁 수요", grid: "접속 여유", fuel: "연료비", neighbor: "이웃 정전" };
  const direction = x => x > 0 ? "up" : x < 0 ? "down" : "same";
  const DIRECTION_NAMES = { up: "늘 것", down: "줄 것", same: "같을 것" };
  function evidenceOptions(V) {
    const c = V.econ.cities[L.team], grid = c.grid || V.grid?.[L.team], other = actT(V).find(t => t.id !== L.team);
    const pol = Object.fromEntries((BG.current()?.policies || []).map(k => [k, true]));
    // build.demand의 저녁 창(18–22시) 시작 시각. 새 계수가 아니라 기존 모형의 시간 좌표다.
    const day = { hot: false, winter: curRound().season === "winter", m: curRound().month };
    const evening = BG.TOWNS.reduce((sum, w, ti) => sum + BG.demand(ti, 18, day, pol, BG.current()?.fab2) * (/^(factory_big|industry|port)$/.test(w.kind) ? c.ind / c.ind0 : c.pop / c.pop0), 0);
    const lng = V.econ.intl?.lng;
    return [
      { key: "evening", text: `${EVIDENCE_NAMES.evening}: ${fmt(evening, 2)} MW`, value: evening },
      { key: "grid", text: `${EVIDENCE_NAMES.grid}: ${fmt(grid?.headroomMW, 2)} MW`, value: grid?.headroomMW },
      { key: "fuel", text: `${EVIDENCE_NAMES.fuel}: LNG 지수 ${fmt(lng, 2)}`, value: lng },
      { key: "neighbor", text: `${other ? teamName(other.id) + " · " : ""}${EVIDENCE_NAMES.neighbor}: ${fmt(V.results.at(-1)?.team[other?.id]?.unsPct, 2)}%`, value: V.results.at(-1)?.team[other?.id]?.unsPct }
    ];
  }
  function firstStrategy(V) { return !(V.results || []).length; }
  function needsLoop(V) { return !!V.econ && V.phase === "plan"; }
  function needsExplanation(V) { return firstStrategy(V) || largeDecision(); }
  function loopComplete(n) { return !n.skipped && !!n.evidence && !!n.pred?.uns && !!n.compared && !!n.answer && !!n.askReason?.trim(); }
  function predictionHTML(V) {
    const { n } = monthNote();
    if (!needsLoop(V)) return "";
    return `<section id="lg-predict" class="lg-sec"><h3>기준 먼저 · 예측</h3><h4>근거 데이터 하나 고르기</h4><div id="lg-evidence" class="lg-acts">${evidenceOptions(V).map(x => `<button class="v2-btn" type="button" data-evidence="${x.key}" aria-pressed="${n.evidence?.key === x.key}" ${Number.isFinite(x.value) ? "" : "disabled"}>${esc(x.text)}</button>`).join("")}</div>${needsExplanation(V) ? `<label class="lg-jq">이번 결정의 기준: 무엇 때문에 무엇을 골랐나요?<textarea data-note="decision" rows="2" maxlength="1000">${esc(n.decision || "")}</textarea></label>` : ""}${[["uns", "정전(이번 달)"], ["cash", "현금(월말 잔액)"]].map(([k, name]) => `<label class="lg-field">${name} 방향 예측<select data-pred="${k}"><option value="">선택하세요</option>${Object.entries(DIRECTION_NAMES).map(([v, label]) => `<option value="${v}" ${n.pred?.[k] === v ? "selected" : ""}>${label}</option>`).join("")}</select></label>`).join("")}<p class="lg-hint">선택한 근거로 예측하고, 운영 뒤 실제와 비교한 다음 유지·수정을 정합니다. 학습 미션은 이 고리를 마치면 달성합니다. ${ASSUMPTIONS}</p>${L.awaitReady ? `<button class="v2-btn primary" type="button" id="lg-ready-confirm">이 기준으로 준비</button>${L.role === "solo" ? '<button class="v2-btn" type="button" id="lg-predict-skip">건너뛰고 준비</button>' : ""}` : ""}</section>`;
  }
  function newBuildCost(V, st = BG.current()) {
    const base = new Set((V.teams[L.team].base || []).map(b => b.k));
    // 새 설비만: 기존 설비 철거·선·정책 변경을 새 건설로 세지 않는다.
    return (st?.builds || []).filter(b => !base.has(C.itemKey("b", b))).reduce((a, b) => {
      const approved = V.teams[L.team].plan?.builds?.find(item => C.itemKey("b", item) === C.itemKey("b", b));
      const item = Number.isFinite(approved?.paidCost) ? { ...b, paidCost: approved.paidCost } : b;
      return a + BG.capex({ ...st, builds: [item], lines: [] });
    }, 0);
  }
  function largeDecision() {
    const V = L.snap, { n } = monthNote(), me = V?.teams[L.team];
    if (!V?.econ || V.phase !== "plan") return false;
    return !!n.big || newBuildCost(V) > 0 && newBuildCost(V) >= me.budget * IQ.large;
  }

  function questionContext(V) {
    const E = V.econ, rep = E.report, res = V.results.at(-1), prevRes = V.results.at(-2), r = res?.team[L.team], p = prevRes?.team[L.team], c = E.cities[L.team], prev = E.before?.[L.team], { d, n } = monthNote();
    const inv = d.interview?.months || {}, keys = Object.keys(inv).map(Number).sort((a, b) => a - b), last = keys.filter(k => k < V.round).map(k => inv[k].ask || inv[k].quarterKey).filter(Boolean).at(-1);
    const parts = E.score.by[L.team].parts, pol = V.teams[L.team].econPol || c.policy;
    const dir = x => x > 0 ? "up" : x < 0 ? "down" : "same";
    const outflow = (rep?.flows.pop || []).filter(f => f.from === L.team).sort((a, b) => b.n - a.n)[0];
    const quarterMonths = keys.filter(k => k > V.round - IQ.quarter && k <= V.round);
    return { large: (n.buildCost || 0) > 0 && n.buildCost >= (n.buildBudget || 0) * IQ.large, event: (V.events || []).some(ev => ev.round === V.round && C.eventDef(R(), ev.id) && C.hits(R(), C.eventDef(R(), ev.id), L.team)), used: Object.values(inv).map(m => m.ask || m.quarterKey).filter(Boolean), smoke: (r?.cpList || []).some(cp => cp.kind === "smoke" && cp.score > 0), quarter: V.round % IQ.quarter === 0, spread: Math.max(...Object.values(parts)) - Math.min(...Object.values(parts)), dApproval: c.approval - (prev?.approval ?? c.approval), policyQuarter: quarterMonths.some(k => inv[k].policy), miss: n.pred?.uns && p && n.pred.uns !== dir(r.unsPct - p.unsPct), crossed: V.teams[L.team].crit && parts[V.teams[L.team].crit.chips[0]] < V.teams[L.team].crit.line && !keys.some(k => k < V.round && inv[k].crossed), spare: r?.spareMW || 0, peak: r && BG.peakDemand ? BG.peakDemand(Object.fromEntries((BG.current()?.policies || []).map(k => [k, true])), BG.current()?.fab2) : 0, uns: r?.unsPct, complaints: r?.cp || 0, lowGroup: lowestGroup(c.groups), left: C.roundsOf(V).length - V.round, firstResearch: !!n.research, labPending: (BG.current()?.builds || []).some(b => b.t === "lab") && Object.keys(V.teams[L.team].rs?.prog || {}).length > 0, outflow: !!outflow, nb: outflow?.to || actT(V).find(t => t.id !== L.team)?.id, news: rep?.news.length || 0, offerFail: E.offers.map(o => o.eval?.by[L.team]?.fail.length).find(x => x === 1), dUns: p ? r.unsPct - p.unsPct : 0, co2Growth: p?.co2Prod ? r.co2Prod / p.co2Prod - 1 : 0, tax: pol.taxRes || 0, service: pol.service || 0, dSenior: c.groups.senior - (prev?.groups.senior ?? c.groups.senior), balance: rep ? rep.fiscal[L.team].revTotal - rep.fiscal[L.team].expTotal + rep.fiscal[L.team].exp.capex : 0, rejected: !!n.rejected, neighborWorse: !!n.rejectedOther && p && res.team[n.rejectedOther]?.unsPct > prevRes.team[n.rejectedOther]?.unsPct, ties: V.ties.filter(t => t.st === "built").length, tradeShare: rep ? (rep.fiscal[L.team].rev.trade || 0) / Math.max(1, rep.fiscal[L.team].revTotal) : 0, policyPrevious: !!inv[V.round - 1]?.policy, dRank: (E.previousScore?.by[L.team]?.rank || 0) - E.score.by[L.team].rank, evaluation: !!rep?.review?.[L.team], end: V.phase === "end", last, crit: V.teams[L.team].crit?.chips };
  }
  function withParticle(name, pair) {
    const ch = name.codePointAt(name.length - 1), final = ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0;
    return name + ({ "이가": final ? "이" : "가", "을를": final ? "을" : "를" }[pair] || "");
  }
  const questionText = (key, x = {}) => (QUESTIONS[key] || "").replace(/\{(city|nb)\}([이가을를])?/g, (_, who, particle) => {
    const name = teamName(who === "city" ? L.team : x.nb || L.team);
    return particle ? withParticle(name, "이가".includes(particle) ? "이가" : "을를") : name;
  });
  function causeHTML(V) {
    const E = V.econ, c = E.cities[L.team], prev = E.before?.[L.team], rep = E.report;
    if (!rep || !prev) return "";
    const pop = causeBreakdown(prev.lagL, c.lagL, params("wL"), rep.net[L.team].pop, true);
    const approval = (rep.cities[L.team]?.causes || []).map(x => ({ key: x.key, value: x.delta, label: x.label }));
    const bars = (rows, unit, groups) => rows.slice(0, IQ.quarter).map(x => `<div data-cause="${esc(x.key)}"><span>${esc(x.label || PART_NAMES[x.key] || (groups ? "지연·집단 반응" : "처음 인구 비중과 이웃 도시의 상황"))}: ${esc(signed(x.value, 1))}${unit}</span><meter min="0" max="${esc(Math.max(1, ...rows.map(y => Math.abs(y.value))))}" value="${esc(Math.abs(x.value))}" aria-label="기여 크기"></meter></div>`).join("");
    return `<section id="lg-causes" class="lg-sec lg-cause"><h3>무엇이 결과를 만들었나</h3><p class="lg-why">왜? ${esc(rep.groups[L.team].why.text)}</p><h4>주민 이동 ${esc(signed(rep.net[L.team].pop))}명</h4>${bars(pop, "명", false)}<p class="lg-hint">항목별 점수 변화의 비중으로 나눈 설명용 추정(G). 처음 인구 비중, 이웃 도시의 상황, 자연 증가 ${esc(fmt(rep.net[L.team].growPop))}명도 작용합니다.</p><h4>지지율 ${esc(signed(c.approval - prev.approval, 1))}%p</h4>${bars(approval, "%p", true)}<p class="lg-hint">생활 항목의 변화와 집단별 중요도·비중을 곱한 설명입니다. 이번 달 변화 기여가 큰 원인부터 표시합니다. 정전·병원 정전·민원은 따로 읽습니다(G).</p></section>`;
  }
  function eventQuestionHTML(V) {
    return (V.events || []).filter(ev => ev.round === V.round).map(ev => {
      const E = C.eventDef(R(), ev.id); if (!E || !C.hits(R(), E, L.team)) return "";
      const opt = E.opts?.find(o => o.id === (V.teams[L.team].resp || {})[`${V.round}:${ev.id}`]);
      return `<p>${esc(E.name)} · 예보 ${esc(evSize(E, { id: ev.id, round: ev.round }))} / 확정 ${esc(evSize(E, ev))} / 우리 대응 ${esc(opt?.name || "대응 안 함")}</p>`;
    }).join("");
  }
  function needsReviewLoop(n) { return !n.skipped && !!n.evidence && !!n.pred?.uns; }
  function resultInterviewHTML(V) {
    if (!V.econ || !["review", "end"].includes(V.phase)) return "";
    const { d, n } = monthNote(), x = questionContext(V), months = d.interview.months, asked = Object.values(months).filter(m => m.ask || m.quarterKey).length;
    if (!n.ask && !n.quarterKey && asked < IQ.max && (x.event || x.large || x.crossed || x.miss || V.round % Math.max(1, Math.ceil(C.roundsOf(V).length / IQ.target)) === 0)) {
      const key = chooseQuestion(x); if (key) { n.ask = key; n.nb = key === "lg-r-tie" ? n.rejectedOther : x.nb; } putData(d);
    }
    if (x.crossed && !n.crossed) { n.crossed = true; putData(d); }
    const res = V.results.at(-1)?.team[L.team], prev = V.results.at(-2)?.team[L.team], c = V.econ.cities[L.team];
    const trial = n.trial, baseUns = prev?.unsPct ?? trial?.unsPct;
    const unsChange = baseUns == null ? null : res.unsPct - baseUns, cashChange = c.cash - (V.econ.before?.[L.team]?.cash ?? c.cash);
    const pred = n.pred ? `<section class="lg-pred lg-sec"><h3>${esc(curRound().month || V.round)}월 예측과 결과</h3>${n.evidence ? `<p>근거: ${esc(n.evidence.text)}</p>` : ""}${[["uns", "정전(이번 달)", unsChange, "%p"], ["cash", "현금(월말 잔액)", cashChange, "억"]].map(([k, name, change, unit]) => `<p data-compare="${k}">${name} 예측: ${esc(DIRECTION_NAMES[n.pred[k]] || "건너뜀")} / 실제 결과: ${change == null ? `${fmt(res.unsPct, 2)}%(비교 기준 없음)` : `${esc(signed(change, 2))}${unit}`} ${change == null || !n.pred[k] ? "" : n.pred[k] === direction(change) ? "· 예상과 같음" : "· 예상과 다름"}</p>`).join("")}${needsReviewLoop(n) ? `<label class="lg-radio"><span><input type="checkbox" data-compared ${n.compared ? "checked" : ""}>예측과 실제를 비교했어요</span></label>` : ""}</section>` : "";
    const key = n.ask || n.quarterKey, revisable = /^lg-[rpf]-/.test(key || ""), reflection = revisable || needsReviewLoop(n);
    const controls = reflection ? `<div class="lg-acts">${[["revise", "고치겠다"], ["keep", "유지하겠다"]].map(([k, name]) => `<button class="v2-btn" type="button" data-answer="${k}" aria-pressed="${n.answer === k}">${name}</button>`).join("")}</div>` : "";
    // c/i/d/e/h형 질문에는 선택 버튼을 붙이지 않는다. 고리의 수정은 별도 영역이다.
    const loop = needsReviewLoop(n) && !revisable ? `<section id="lg-loop-review" class="lg-sec"><h3>비교 뒤 유지·수정</h3>${controls}<label class="lg-jq">다음 선택의 이유<textarea data-note="askReason" rows="2" maxlength="1000">${esc(n.askReason || "")}</textarea></label><p id="lg-learning-mission">학습 미션: ${loopComplete(n) ? "달성" : "근거 → 예측 → 비교 → 유지·수정을 마치세요"}</p></section>` : "";
    const ask = n.ask ? `<section class="lg-ask lg-sec" data-question="${esc(n.ask)}"><h3>질문 한 장 <span class="tag-mine">연습용</span></h3><p>${esc(questionText(n.ask, { nb: n.nb }))}</p>${n.ask === "lg-f-event" ? eventQuestionHTML(V) : ""}${revisable ? controls : ""}<label class="lg-jq">이유 한 줄(기기에만)<textarea data-note="${revisable || !needsReviewLoop(n) ? "askReason" : "questionReason"}" rows="2" maxlength="1000">${esc((revisable || !needsReviewLoop(n) ? n.askReason : n.questionReason) || "")}</textarea></label>${needsReviewLoop(n) && revisable ? `<p id="lg-learning-mission">학습 미션: ${loopComplete(n) ? "달성" : "근거 → 예측 → 비교 → 유지·수정을 마치세요"}</p>` : ""}</section>` : "";
    return `${causeHTML(V)}${pred}${loop}${ask}`;
  }

  function quarterHTML(V) {
    if (!V.econ || V.round % IQ.quarter !== 0 || !["review", "end"].includes(V.phase)) return "";
    const { d, n } = monthNote(), x = questionContext(V);
    if (n.ask || x.event || needsReviewLoop(n) || Object.values(d.interview.months).filter(m => m.ask || m.quarterKey).length >= IQ.max && !n.quarterKey) return "";
    if (!n.quarterKey) {
      const eligible = chooseQuestion({ ...x, last: null, allowed: ["lg-c-", "lg-i-"] });
      n.quarterKey = x.evaluation ? "lg-h-approval" : V.round / IQ.quarter % 2 === 0 ? "lg-d-headline" : eligible || "lg-d-headline"; putData(d);
    }
    const c = V.econ.cities[L.team], hist = c.hist, old = hist.at(-IQ.quarter - 1) || V.econ.before?.[L.team];
    return `<label class="lg-jq" id="lg-quarter" data-question="${esc(n.quarterKey)}"><span>분기 질문: ${esc(questionText(n.quarterKey, x))}</span><small>주민 ${esc(signed(c.pop - (old?.pop || c.pop)))}명 · 지지율 ${esc(fmt(c.approval, 1))}% · 현재 ${esc(V.econ.score.by[L.team].rank)}위${x.evaluation ? ` · 주민 평가 ${V.econ.report.review[L.team].pass ? "통과" : "미통과"}` : ""}</small><textarea data-note="quarterAnswer" rows="3" maxlength="1000">${esc(n.quarterAnswer || "")}</textarea></label>${L.role === "solo" ? `<button class="v2-btn" type="button" id="lg-quarter-skip">분기 질문 건너뛰기</button>` : ""}`;
  }
  function debriefHTML(E) {
    const top = E.score?.rank[0], rows = E.score?.rank || [];
    const V = L.role === "host" ? C.publicView(L.S, Date.now()) : L.snap;
    const arrivals = Object.fromEntries(rows.map(r => [r.id, 0]));
    (E.report?.flows?.pop || []).forEach(f => { arrivals[f.to] = (arrivals[f.to] || 0) + f.n; });
    const maxArrival = Math.max(0, ...Object.values(arrivals)), arrivalIds = Object.keys(arrivals).filter(id => arrivals[id] === maxArrival);
    const changedLeader = maxArrival > 0 && top && !arrivalIds.includes(top.id);
    const helped = (V?.results || []).some(res => Object.values(res.team || {}).some(r => r.imp > 0 && r.unsPct === 0));
    const cards = [changedLeader ? "이번 달 주민이 가장 많이 들어온 도시와 순위 1위 도시가 다릅니다. 무엇이 둘을 갈랐을까요?" : null, helped ? "이웃 전기를 받아 정전 없이 운영한 도시가 있습니다. 거래 비용은 누가 졌나요?" : null, "점수 가중치를 탄소 0.30으로 바꾸면 순위가 어떻게 바뀔까요?", "가장 늦게 효과가 나타난 결정은 무엇이었나요?", "이 게임이 현실과 가장 다른 점 하나를 꼽는다면?"];
    return `<section id="lg-debrief" class="lg-sec"><h2>디브리핑</h2><p>종합 1위 ${esc(top?.name || "")} · 이주 속도(수업용) ×${esc(fmt(E.eduSpeed, 2))}(G)</p><div class="lg-debriefcards">${cards.map((q, i) => q ? `<article class="lg-card" data-debrief="${i + 1}"><h3>${i + 1}. ${esc(q)}</h3></article>` : "").join("")}</div><p>${esc((E.report?.news || []).slice(0, IQ.quarter).join(" → "))}</p><section id="lg-wsim"><h3>가중치를 바꾸면?</h3><p class="lg-hint">화면에서만 다시 계산합니다. 원래 점수와 엔진 상태는 유지됩니다. 모두 0이면 원래 점수를 씁니다.</p>${SCORE_KEYS.map(k => [k, SCORE_NAMES[k]]).map(([k, name]) => `<label class="lg-policy"><span>${name} <output data-weight-value="${k}">${esc(fmt(params("wScore")[k], 2))}</output></span><input type="range" data-weight="${k}" min="0" max="1" step="0.05" value="${esc(params("wScore")[k])}"></label>`).join("")}<ol id="lg-wrank">${reweightScore(E.score, params("wScore")).map(r => `<li>${esc(r.name)} ${esc(fmt(r.score, 1))}점</li>`).join("")}</ol></section></section>`;
  }
  function endHTML(V) {
    const { d } = monthNote(), inv = d.interview, end = inv.end || {}, rep = V.econ.report;
    const crit = V.teams[L.team].crit, reasons = [...new Set([rep?.groups[L.team]?.why.text, ...(rep?.flows.pop || []).filter(f => f.from === L.team || f.to === L.team).map(f => `${teamName(f.from)} → ${teamName(f.to)} ${fmt(f.n)}명: ${f.why}`), ...(rep?.news || [])].filter(Boolean))].slice(0, IQ.quarter);
    return `${rankHTML(V.econ, L.role !== "solo")}${L.role === "solo" ? soloReplayHTML(V) : ""}<section id="lg-final-causes" class="lg-sec"><h3>무엇이 이 결과를 만들었나</h3>${reasons.map(x => `<p>${esc(x)}</p>`).join("")}</section>${L.role === "solo" ? debriefHTML(V.econ) : ""}<section id="lg-reflect" class="lg-sec"><h3>끝 성찰</h3><button class="v2-btn" type="button" id="lg-speak">말로 해 보기 · 2분</button><output id="lg-speak-time" aria-live="off">2:00</output><p>선언한 기준: ${esc(crit?.chips.map(k => SCORE_NAMES[k]).join(" · ") || "미선택")} · 지킬 선 ${esc(crit?.line ?? "–")}점</p><p>건너뛴 분기 질문 ${esc(Object.values(inv.months).filter(m => m.quarterSkip).length)}개</p>${END_Q.map((q, i) => `<label class="lg-jq"><span>${esc(L.role === "solo" ? q.replaceAll("우리", "내") : q)}</span><textarea data-end="${i}" rows="3" maxlength="1000">${esc(end[i] || "")}</textarea></label>`).join("")}<fieldset class="lg-pick"><legend>자기 점검 <span class="tag-mine">연습용 평가 기준</span></legend>${(KCP.HABITS || []).map(h => `<label class="lg-radio"><span><input type="checkbox" data-habit="${esc(h.k)}" ${inv.habits?.[h.k] ? "checked" : ""}>${esc(h.n)}</span></label>`).join("")}</fieldset><button class="v2-btn" type="button" id="lg-jcopy">활동지로 복사</button></section>`;
  }
  function worksheet(V) {
    const d = tdata(), inv = d.interview || {}, c = V.econ?.cities[L.team], lines = [`[${R().name} 전력 리그] ${teamName(L.team)}`];
    if (c) lines.push(`최종 지표: 주민 ${fmt(c.pop)}명 · 종사자 ${fmt(c.ind)}명 · 현금 ${fmt(c.cash, 1)}억 · 지지율 ${fmt(c.approval, 1)}%`, ...SCORE_KEYS.map(k => `${SCORE_NAMES[k]} ${fmt(V.econ.score.by[L.team].parts[k], 1)}점`));
    Object.entries(inv.months || {}).forEach(([rd, n]) => { lines.push(`■ ${rd}달`, n.crit ? `기준 ${n.crit.chips.map(k => SCORE_NAMES[k]).join(" · ")} / ${n.crit.line}점 / ${n.crit.choice === "keep" ? "유지" : "바꿈"}\n${n.critReason || ""}` : "", n.decision || "", n.evidence ? `근거: ${n.evidence.text}` : "", n.pred ? `예측: ${JSON.stringify(n.pred)} / 비교 ${n.compared ? "완료" : "미완료"} / 학습 미션 ${loopComplete(n) ? "달성" : "미달성"}` : "", n.ask ? `${questionText(n.ask, { nb: n.nb })}\n${n.answer === "revise" ? "고침" : n.answer === "keep" ? "유지" : "미응답"}: ${n.askReason || ""}` : "", n.quarterKey ? `${questionText(n.quarterKey)}\n${n.quarterAnswer || (n.quarterSkip ? "건너뜀" : "")}` : "", ...JQ.map(q => `${q.q}\n${d.journal?.[rd]?.[q.k] || ""}`)); });
    Object.values(d.docs || {}).forEach(doc => (doc.journal || []).forEach(e => {
      lines.push(`■ 건설 일지 ${e.id}회 · ${e.days}일 · ${e.season || ""}`, `정전 ${fmt(e.m?.uns, 2)}% · CO₂ ${fmt(e.m?.co2)} t · 비용 ${fmt(e.m?.cost, 1)}억`, ...[["why", "무엇을 왜 지었나"], ["surprise", "예상 밖 결과"], ["trade", "얻는 것과 잃는 것"], ["next", "다음에 바꿀 것"], ["q", e.q || "오늘의 질문"]].map(([key, label]) => `${label}\n${e.a?.[key] || ""}`));
    }));
    (KCP.HABITS || []).forEach(h => lines.push(`${inv.habits?.[h.k] ? "✓" : "□"} ${h.n}`));
    END_Q.forEach((q, i) => lines.push(`■ ${q}\n${inv.end?.[i] || ""}`));
    return lines.filter(Boolean).join("\n\n");
  }
  function updateMission() {
    const out = document.getElementById("lg-learning-mission");
    if (out) out.textContent = `학습 미션: ${loopComplete(monthNote().n) ? "달성" : "근거 → 예측 → 비교 → 유지·수정을 마치세요"}`;
  }
  function previousNoteHTML(V) {
    const d = tdata(), old = d.interview?.months?.[V.round - 1], next = d.journal?.[V.round - 1]?.next;
    if (!old && !next) return "";
    return `<section id="lg-previous-note" class="lg-sec"><h3>지난달 답 · 다음에 바꿀 것</h3>${old?.ask || old?.quarterKey ? `<p>${esc(questionText(old.ask || old.quarterKey, { nb: old.nb }))}</p><p>${esc(old.answer === "revise" ? "고치겠다" : old.answer === "keep" ? "유지하겠다" : "한 줄 답")}: ${esc(old.questionReason || old.askReason || old.quarterAnswer || "미응답")}</p>` : ""}<p>다음에 바꿀 것: ${esc(next || "아직 쓰지 않음")}</p></section>`;
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
    if (L?.role === "solo") writeSolo({ v: 1, state: L.S, team: L.team, style: L.style, interview: L.interview, aiRound: L.aiRound || 0, initial: L.initial, previous: L.previous });
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
        L = { role: "solo", room: save.state.room, S: save.state, team: save.team, style: save.style || "balanced", token: save.state.teams[save.team].token, timers: [], snap: null, rev: 0, planT: 0, skew: 0, interview: save.interview || { docs: {}, journal: {} }, aiRound: save.aiRound || 0, initial: save.initial || null, previous: save.previous || null };
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
    if (L.away || L.busy || L.S.phase === "end") return;
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
    if (L.away) return;
    const V = L.snap;
    if (!V) return;
    const { d, n } = monthNote();
    if (!skip && !L.awaitReady && needsLoop(V) && !n.confirmed) { L.awaitReady = true; openPanel("journal"); renderBar(); return; }
    if (V.econ && V.phase === "plan") {
      const crit = criterionDraft(V), el = document.getElementById("lg-crit-line");
      if (el) crit.line = el.valueAsNumber;
      if (crit.chips.length) {
        if (!validCritLine(crit.line)) { BG.toast("지킬 선은 0~100의 정수로 적으세요"); return; }
        if (!crit.choice) { BG.toast("올해 기준을 유지할지 바꿀지 고르세요"); openPanel("journal"); return; }
        if (curRound().month === 1 && crit.choice === "change" && !n.critReason?.trim()) { BG.toast("기준을 바꾸는 이유를 한 줄 적으세요"); openPanel("journal"); return; }
        n.crit = crit; send("crit", crit);
      }
    }
    if (!skip && needsLoop(V) && (!n.evidence || !n.pred?.uns || needsExplanation(V) && !n.decision?.trim())) {
      BG.toast(needsExplanation(V) ? "근거 데이터·정전 방향·기준 한 문장을 먼저 정하세요" : "근거 데이터와 정전 방향을 먼저 정하세요"); L.awaitReady = true; openPanel("journal"); return;
    }
    n.skipped = !!skip; n.buildCost = newBuildCost(V); n.buildBudget = V.teams[L.team].budget;
    const trial = BG.lastTrial?.(), result = trial?.result || trial;
    if (trial && (!trial.round || trial.round === V.round)) {
      const unsPct = result.unsPct ?? (result.tot?.dem > 0 ? 100 * result.unsTotal / result.tot.dem : undefined);
      if (Number.isFinite(unsPct)) n.trial = { unsPct };
    }
    n.confirmed = true; n.big = n.big || largeDecision();
    putData(d); L.awaitReady = false; renderBar();
    if (L.role === "solo") soloNext();
    else { clearTimeout(L.planT); sendPlan(); send("ready", { ready: !V.teams[L.team].ready }); }
  }
  function restartSolo() {
    if (!window.confirm("처음부터 시작하면 이 판의 진행과 일지·답변이 지워집니다. 다시 시작할까요?")) return;
    close(); store.del(K_SOLO); location.hash = "#league";
  }
  function soloSummary(V) {
    const c = V.econ.cities[L.team], r = V.econ.score.by[L.team];
    return { score: r.score, pop: c.pop, cash: c.cash, approval: c.approval, uns: V.results.at(-1)?.team[L.team]?.unsPct };
  }
  function soloReplayHTML(V) {
    const now = soloSummary(V), old = L.previous;
    return `<section id="lg-solo-replay" class="lg-sec"><h3>지난 판과 비교</h3>${old ? [["score", "점수", "점"], ["pop", "주민", "명"], ["cash", "현금", "억"], ["approval", "지지율", "%p"], ["uns", "정전(마지막 달)", "%p"]].map(([key, label, unit]) => `<p>${label} ${fmt(old[key], 1)} → ${fmt(now[key], 1)} · ${signed(now[key] - old[key], 1)}${unit}</p>`).join("") : "<p>첫 판입니다. 같은 조건으로 다시 하면 차이를 비교합니다.</p>"}${L.initial ? '<button class="v2-btn" type="button" id="lg-solo-same">같은 조건으로 다시</button>' : '<p>예전 저장 기록에는 시작 조건이 없습니다. 새 판부터 같은 조건을 저장합니다.</p>'}</section>`;
  }
  function replaySolo() {
    if (L.role !== "solo" || L.snap.phase !== "end" || !L.initial) return;
    const app = L.app, save = { v: 1, state: structuredClone(L.initial), initial: structuredClone(L.initial), previous: soloSummary(L.snap), team: L.team, style: L.style, interview: { docs: {}, journal: {} }, aiRound: 0 };
    close(); writeSolo(save); startSolo(app, save);
  }

  function econClick(e) {
    if (!L.snap?.econ) return false;
    if (e.target.closest("#lg-speak")) {
      const session = L; L.speakUntil = Date.now() + 2 * 60 * 1000;
      if (L.speakTimer) clearInterval(L.speakTimer);
      L.speakTimer = setInterval(() => { if (L !== session) return; const out = document.getElementById("lg-speak-time"); if (out) out.textContent = mmss(L.speakUntil - Date.now()); if (Date.now() >= L.speakUntil) clearInterval(L.speakTimer); }, 1000);
      L.timers.push(L.speakTimer); return true;
    }
    if (e.target.closest("#lg-solo-same")) { replaySolo(); return true; }
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
      n.crit = crit; putData(d); queueCrit(crit);
      if (!validCritLine(crit.line)) { BG.toast("지킬 선은 0~100의 정수로 적으세요"); return true; }
      const panel = document.getElementById("lg-panel");
      panel.querySelectorAll("[data-crit]").forEach(b => b.setAttribute("aria-pressed", String(crit.chips.includes(b.dataset.crit))));
      panel.querySelectorAll("[data-crit-choice]").forEach(b => b.setAttribute("aria-pressed", String(crit.choice === b.dataset.critChoice)));
      if (el) el.parentElement.firstChild.textContent = `${SCORE_NAMES[crit.chips[0]] || "선택 첫 항목"} 지킬 선(점 이상)`;
      if (crit.chips.length && crit.choice) send("crit", crit);
      renderPanel(); return true;
    }
    const evidence = e.target.closest("[data-evidence]");
    if (evidence && V.phase === "plan") {
      const item = evidenceOptions(V).find(x => x.key === evidence.dataset.evidence);
      if (item && Number.isFinite(item.value)) { n.evidence = item; n.confirmed = false; putData(d); renderPanel(); }
      return true;
    }
    const group = e.target.closest("[data-group]");
    if (group) { L.group = L.group === group.dataset.group ? null : group.dataset.group; renderPanel(); return true; }
    const answer = e.target.closest("[data-answer]");
    if (answer) { n.answer = answer.dataset.answer; putData(d); renderPanel(); return true; }
    if (e.target.closest("#lg-ready-confirm")) { readyAction(false); return true; }
    if (e.target.closest("#lg-predict-skip") && L.role === "solo") { readyAction(true); return true; }
    if (e.target.closest("#lg-quarter-skip")) { n.quarterSkip = true; putData(d); BG.toast("분기 질문을 건너뛰었습니다"); return true; }
    return false;
  }
  function econChange(e) {
    if (!L.snap?.econ) return false;
    const pol = e.target.closest("[data-pol]"), line = e.target.closest("#lg-crit-line"), note = e.target.closest("[data-note]"), pred = e.target.closest("[data-pred]"), end = e.target.closest("[data-end]"), weight = e.target.closest("[data-weight]"), habit = e.target.closest("[data-habit]");
    const { d, n } = monthNote();
    if (e.target.matches("[data-compared]")) { n.compared = e.target.checked; putData(d); renderPanel(); return true; }
    if (habit) { d.interview.habits = d.interview.habits || {}; d.interview.habits[habit.dataset.habit] = habit.checked; putData(d); return true; }
    if (pol) {
      const policy = Object.fromEntries([...document.querySelectorAll("#lg-econpol [data-pol]")].map(el => [el.dataset.pol, +el.value]));
      L.pendingPol = policy;
      n.big = true; n.policy = true; n.confirmed = false; putData(d); send("econ", policy); return true;
    }
    if (line) {
      if (e.type !== "input" || L.snap.phase !== "plan") return true;
      const crit = { ...criterionDraft(L.snap), line: line.valueAsNumber };
      n.crit = crit; putData(d); queueCrit(crit); return true;
    }
    if (note) { n[note.dataset.note] = note.value.slice(0, 1000); putData(d); updateMission(); return true; }
    if (pred) { n.pred = n.pred || {}; n.pred[pred.dataset.pred] = pred.value; n.confirmed = false; putData(d); return true; }
    if (end) { d.interview.end = d.interview.end || {}; d.interview.end[end.dataset.end] = end.value.slice(0, 1000); putData(d); return true; }
    if (weight) { updateWeights(document.getElementById("lg-panel"), L.snap.econ); return true; }
    return false;
  }

  /* ================= 로비 ================= */
  function lobby(app, joinArg) {
    lobbyStop?.();
    document.documentElement.classList.add("v2-league-lobby");
    let pre = null;
    if (joinArg) { try { pre = JSON.parse(b64d(joinArg)); } catch (e) { pre = null; } }
    if (pre && pre.n && pre.n.kind === "supabase") store.set(K_NET, { kind: "supabase", url: String(pre.n.url || ""), key: String(pre.n.key || "") });
    const soloSave = store.get(K_SOLO);
    const net = netCfg(), hostSave = store.get(K_HOST), lastTeam = store.get(K_TEAM);
    const reg = R();
    let syncLobby = null;
    const mustCity = id => (reg.must || []).includes(id);
    const cityChecks = solo => reg.teams.map(t => `<label class="lg-pickcity" style="--c:${esc(t.color)}"><input class="lg-chipcheck" type="checkbox" ${solo ? `data-solo-city="${esc(t.id)}"` : `value="${esc(t.id)}"`} checked ${mustCity(t.id) ? "disabled" : ""}><span>${esc(t.name)}${mustCity(t.id) ? ' <small aria-label="필수 도시">🔒</small>' : ""}</span></label>`).join("");
    const choices = (id, label, options) => `<fieldset class="lg-pick lg-choice"><legend><label for="${id}">${label}</label></legend><select class="lg-contract" id="${id}" aria-label="${label}">${options.map(([v, name, selected]) => `<option value="${esc(v)}" ${selected ? "selected" : ""}>${esc(name)}</option>`).join("")}</select><div class="lg-presets" role="group" aria-label="${label}">${options.map(([v, name]) => `<button class="lg-preset" type="button" data-select="${id}" data-value="${esc(v)}" aria-pressed="false">${esc(name)}</button>`).join("")}</div></fieldset>`;
    app.innerHTML = `
      <main class="lg-lobby" data-mode="solo">
        <header class="lg-topline">
          <a class="lg-back" href="#home">← 연습실 홈</a>
          <p class="v2-kicker"><span>GRID TYCOON</span> · 전력 리그</p>
        </header>
        <section class="lg-world" aria-label="리그 지역과 도시 선택">
          <header class="lg-lhead">
          <h1>${esc(reg.name)} 전력 리그</h1>
          <p class="lg-sub">도시 하나씩 맡아 전력망을 짓고 주민·기업을 겨룹니다.</p>
          </header>
          <figure class="lg-worldmap">
            ${reg.board ? '<canvas id="lg-lobby-map" role="img" aria-label="참가 도시 광역 지도. 아래 도시 칩으로도 선택할 수 있습니다."></canvas>' : `<ul class="lg-cities">${reg.teams.map(t => `<li style="--c:${esc(t.color)}">${esc(t.name)}</li>`).join("")}</ul>`}
          </figure>
          <p class="lg-maphelp" id="lg-maphelp">지도에서 내 도시를 누르세요 · 🔒 필수 도시</p>
        </section>
        <section class="lg-setup" aria-label="새 게임 설정">
          <nav class="lg-modes" aria-label="플레이 모드">${[["solo", "혼자 하기"], ["join", "팀으로 참가"], ["host", "진행자(교사)"]].map(([mode, name]) => `<button type="button" data-mode="${mode}" aria-pressed="${mode === "solo"}" aria-controls="${mode === "solo" ? "lg-solo" : `lg-mode-${mode}`}">${name}</button>`).join("")}</nav>
          <div class="lg-cards">
          <article class="lg-card" id="lg-solo" data-panel="solo" data-active="true"><header class="lg-modehead"><h2>혼자 하기</h2><p class="lg-hint">컴퓨터 도시와 겨룹니다. 한 탭에서 끝까지.</p>${soloNotice ? `<p class="lg-hint">${esc(soloNotice)}</p>` : ""}</header>
            <div class="lg-modebody">
            <div class="lg-options">
            <div class="lg-citysettings">
            ${choices("lg-solo-city", "내 도시", reg.teams.map(t => [t.id, t.name]))}
            <fieldset class="lg-pick"><legend>함께할 도시 · 나와 컴퓨터 포함</legend><div class="lg-solo-cities">${cityChecks(true)}</div><p class="lg-hint">🔒 필수 도시 · 내 도시 외에는 컴퓨터가 맡습니다.</p></fieldset>
            </div>
            <div class="lg-gamesettings">
            ${choices("lg-solo-turns", "게임 길이", [12, 24, 36].map(n => [String(n), `${n}달`]))}
            <p class="lg-hint" id="lg-solo-turnmsg"></p>
            ${choices("lg-solo-style", "컴퓨터 성향", [["careful", "신중"], ["balanced", "균형", true], ["bold", "공격"]])}
            </div>
            </div>
            <div class="lg-launch"><button class="v2-btn primary lg-big" type="button" id="lg-solo-start">혼자 시작</button>${soloSave?.state ? `<a class="v2-btn lg-big" id="lg-solo-resume" href="#league/solo">이어서 하기</a><button class="v2-btn" type="button" id="lg-solo-reset">처음부터</button>` : ""}</div>
            </div>
          </article>
          <article class="lg-card" id="lg-mode-join" data-panel="join" data-active="false">
            <header class="lg-modehead"><h2>팀으로 참가</h2><p class="lg-hint">진행자 화면의 방 코드를 넣으세요.</p></header>
            <div class="lg-modebody">
            <label class="lg-field"><span>방 코드</span><input id="lg-code" aria-label="방 코드" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" minlength="4" maxlength="6" value="${esc(pre && validRoom(pre.r) ? pre.r : "")}" placeholder="K7QH2" aria-describedby="lg-code-h"></label>
            <p class="lg-hint" id="lg-code-h">진행자 화면에 보이는 4~6글자</p>
            <button type="button" class="v2-btn primary lg-big" id="lg-join">참가하기</button>
            ${lastTeam && validRoom(lastTeam.room) && lastTeam.team ? `<button type="button" class="v2-btn lg-big" id="lg-rejoin">이어서: ${esc(teamName(lastTeam.team))} 팀 · 방 ${esc(lastTeam.room)}</button>` : ""}
            </div>
          </article>
          <article class="lg-card" id="lg-mode-host" data-panel="host" data-active="false">
            <header class="lg-modehead"><h2>진행자(교사)</h2><p class="lg-hint">방을 만들고 달을 넘깁니다. 프로젝터용 화면.</p></header>
            <div class="lg-modebody">
            <div class="lg-options">
            <fieldset class="lg-pick">
              <legend>참가 도시 <b id="lg-pickn"></b></legend>
              <div class="lg-presets" role="group" aria-label="인원별 추천">${[2, 3, 4, 5, 6].map(n => `<button type="button" class="lg-preset" data-preset="${n}" aria-pressed="${n === 6}">${n}팀</button>`).join("")}</div>
              <div class="lg-pickc">${cityChecks(false)}</div>
              <p class="lg-hint" id="lg-pickmsg">${esc((reg.must || []).map(teamName).join(" · "))}은(는) 꼭 들어가고, 고른 도시끼리 이웃해야 합니다.</p>
            </fieldset>
            <fieldset class="lg-pick">
              <legend>게임 길이</legend>
              <div class="lg-presets" role="group" aria-label="게임 길이">${[[0, "계절 4라운드"], [12, "12달(1년)"], [24, "24달"], [36, "36달"]].map(([n, t]) => `<button type="button" class="lg-preset" data-turns="${n}" aria-pressed="${n === 12}">${t}</button>`).join("")}</div>
              <p class="lg-hint" id="lg-turnmsg">1턴 = 1달. 해마다 1월에 국가 재정지원금, 달마다 세금. 주민·기업은 살기 좋은 도시로 옮겨 갑니다.</p>
            </fieldset>
            </div>
            <div class="lg-launch"><button type="button" class="v2-btn primary lg-big" id="lg-host">새 방 만들기</button>
            ${hostSave && validRoom(hostSave.room) ? `<button type="button" class="v2-btn lg-big" id="lg-rehost">이어서 진행: 방 ${esc(hostSave.room)}</button>` : ""}
            </div>
            </div>
          </article>
          </div>
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
      if (soloSave?.state && !window.confirm("새 판을 시작하면 저장된 진행과 일지·답변이 지워집니다. 시작할까요?")) return;
      close(); pendingSolo = { v: 1, state, initial: structuredClone(state), team: player, style: $("#lg-solo-style").value, interview: { docs: {}, journal: {} } }; writeSolo(pendingSolo);
      location.hash = "#league/solo";
    });
    $("#lg-solo-reset")?.addEventListener("click", () => { if (!window.confirm("저장된 진행과 일지·답변을 지우고 처음부터 시작할까요?")) return; store.del(K_SOLO); lobby(app); });
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
      syncLobby?.();
    };
    boxes.forEach(b => b.addEventListener("change", showPick));
    app.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => { const set = reg.presets[b.dataset.preset] || []; boxes.forEach(x => { x.checked = set.includes(x.value) || x.disabled; }); showPick(); }));
    showPick();
    const rh = $("#lg-rehost");
    if (rh) rh.addEventListener("click", () => { location.hash = "#league/host"; });

    // 같은 계약 요소를 접힌 행의 44px 조작 띠에 둔다. 복제하거나 hidden 처리하지 않는다.
    app.querySelectorAll(".lg-modehead").forEach(head => {
      const panel = head.closest("[data-panel]"), button = document.createElement("button");
      button.type = "button"; button.className = "lg-open"; button.textContent = "열기";
      button.dataset.mode = panel.dataset.panel;
      button.setAttribute("aria-label", `${head.querySelector("h2").textContent} 열기`);
      button.setAttribute("aria-controls", panel.id);
      head.append(button);
    });
    const root = $(".lg-lobby"), cv = $("#lg-lobby-map");
    let mode = pre ? "join" : "solo", raf = 0, intro = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const soloBoxes = [...app.querySelectorAll("[data-solo-city]")];
    const mapIds = () => mode === "host" ? picked() : mode === "solo" ? soloBoxes.filter(b => b.checked).map(b => b.dataset.soloCity) : reg.teams.map(t => t.id);
    const drawLobby = () => {
      if (!cv || !cv.isConnected) return;
      const ids = mapIds(), player = mode === "solo" ? $("#lg-solo-city").value : null;
      const lit = intro && !reduced.matches ? ids.slice(0, Math.ceil((performance.now() - intro) / 90)) : ids;
      renderBoard(cv, { active: ids, teams: {}, ties: [] }, null, false, { player, lit, mode });
      cv.setAttribute("aria-label", `광역 지도 · ${mode === "solo" ? `내 도시 ${teamName(player)} · ` : ""}참가 도시 ${ids.map(teamName).join(" · ")}. 아래 도시 칩으로 선택할 수 있습니다.`);
    };
    const stopIntro = () => { cancelAnimationFrame(raf); raf = 0; intro = null; };
    const animateMap = () => {
      stopIntro();
      if (reduced.matches || !cv) { drawLobby(); return; }
      intro = performance.now();
      const frame = () => {
        if (!cv.isConnected) { stopIntro(); return; }
        drawLobby();
        if (performance.now() - intro < 720) raf = requestAnimationFrame(frame);
        else { stopIntro(); drawLobby(); }
      };
      raf = requestAnimationFrame(frame);
    };
    syncLobby = () => {
      const player = $("#lg-solo-city").value;
      soloBoxes.forEach(b => {
        const own = b.dataset.soloCity === player;
        b.disabled = own || mustCity(b.dataset.soloCity);
        if (b.disabled) b.checked = true;
      });
      app.querySelectorAll("[data-select]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === $("#" + b.dataset.select).value)));
      $("#lg-solo-turnmsg").textContent = `${$("#lg-solo-turns").value}달 동안 진행합니다. 1턴 = 1달, 준비 버튼으로 달을 넘깁니다.`;
      $("#lg-maphelp").textContent = mode === "host" ? "지도에서 참가 도시를 누르세요 · 🔒 필수 도시" : mode === "solo" ? "지도에서 내 도시를 누르세요 · 금색 테두리 = 내 도시 · 🔒 필수 도시" : "진행자가 만든 방에 참가합니다 · 도시 선택은 참가 뒤에";
      drawLobby();
    };
    const setMode = next => {
      if (next !== mode) stopIntro();
      mode = next; root.dataset.mode = mode;
      app.querySelectorAll(".lg-modes [data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
      app.querySelectorAll("[data-panel]").forEach(p => { p.dataset.active = String(p.dataset.panel === mode); });
      app.querySelectorAll(".lg-open").forEach(b => b.setAttribute("aria-expanded", String(b.dataset.mode === mode)));
      syncLobby();
    };
    app.querySelectorAll(".lg-modes [data-mode], .lg-open").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
    // click 이후 펼쳐서 기존 체크박스·버튼의 포인터 조작을 방해하지 않는다.
    $(".lg-cards").addEventListener("click", e => {
      const panel = e.target.closest("[data-panel]");
      if (panel && panel.dataset.panel !== mode) setMode(panel.dataset.panel);
    });
    app.querySelectorAll("[data-select]").forEach(b => b.addEventListener("click", () => {
      const select = $("#" + b.dataset.select);
      select.value = b.dataset.value; select.dispatchEvent(new Event("change", { bubbles: true }));
    }));
    ["#lg-solo-city", "#lg-solo-turns", "#lg-solo-style"].forEach(s => $(s).addEventListener("change", () => { stopIntro(); setMode("solo"); }));
    soloBoxes.forEach(b => b.addEventListener("change", () => { stopIntro(); setMode("solo"); }));
    boxes.forEach(b => b.addEventListener("change", () => { stopIntro(); setMode("host"); }));
    app.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => { setMode("host"); animateMap(); }));
    $("#lg-code").addEventListener("input", e => { e.target.value = e.target.value.toUpperCase(); setMode("join"); });
    cv?.addEventListener("click", e => {
      const id = boardHit(cv, e);
      if (!id || mode === "join") return;
      stopIntro();
      if (mode === "solo") { $("#lg-solo-city").value = id; $("#lg-solo-city").dispatchEvent(new Event("change", { bubbles: true })); }
      else boxes.find(b => b.value === id && !b.disabled)?.click();
    });
    const ro = cv ? new ResizeObserver(drawLobby) : null;
    if (cv) ro.observe(cv);
    const motionChange = () => { stopIntro(); drawLobby(); };
    reduced.addEventListener("change", motionChange);
    lobbyStop = () => { stopIntro(); ro?.disconnect(); reduced.removeEventListener("change", motionChange); document.documentElement.classList.remove("v2-league-lobby"); };
    setMode(mode); animateMap();
    // 공통 라우터가 동기적으로 붙이는 제목 포커스도 첫 페인트 전에 정리한다.
    // 로비는 자동 포커스 없이 시작하고 키보드 탐색의 focus-visible은 유지한다.
    queueMicrotask(() => {
      const heading = $("h1");
      if (heading && root.isConnected) {
        if (document.activeElement === heading) heading.blur();
        heading.removeAttribute("tabindex");
      }
    });
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
        if (!r.ok && m && typeof m.team === "string") L.conn.send("nack", { team: m.team, type: m.type, err: r.err, rid: m.rid, rd: m.rd, ph: m.ph });
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
    if (!V.econ && techData()) {
      let news = $("#lg-tech-host-news");
      if (!news) { news = document.createElement("section"); news.id = "lg-tech-host-news"; news.className = "lg-tech-host-news"; $("#lg-results").before(news); }
      news.innerHTML = techNewsHTML(V);
    }
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
      <div class="lg-chips">${items}</div><div class="lg-tech-icons">${techIconsHTML(v.research || {})}</div>
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
        : !me && X.teams && opts.length ? (() => { const who = actT(X).map(({ id }) => { const o = opts.find(q => q.id === (X.teams[id].resp || {})[round + ":" + E.id]); return o ? `${teamName(id)} ${o.name}` : ""; }).filter(Boolean); return `<small class="lg-evnote">대응: ${esc(who.join(" · ") || "아직 없음")}</small>`; })() : "";
      return `<li class="lg-ev" data-mine="${mine}"><b>${esc(E.name)}</b><span>${esc(E.text || "")}</span>
        ${size ? `<span class="lg-evsize"><i>${known ? "확정" : nx ? "정밀 예보" : E.fc ? "예보" : "크기"}</i> ${esc(size)}</span>` : ""}
        ${E.tip && mine !== false ? `<small class="lg-evnote">${esc(E.tip)}</small>` : ""}${techData()?.eventHints?.[E.id] && mine !== false ? `<small class="lg-tech-event-hint">${esc(techData().eventHints[E.id].text)}</small>` : ""}${choose}${picked}
        <small>${esc(who)}${mine === true ? " · 우리 도시 해당" : mine === false ? " · 우리 도시 해당 없음" : ""} · <abbr class="${E.grade === "P" ? "tag-paper" : E.grade === "G" ? "tag-mine" : "tag-official"}" title="O: 공식 원문 · O*: 공식 통계 검색 요약 · P: 논문·보고서 · G: 게임 가정. 크기와 대응 효과는 G">근거 ${esc(E.grade || "G")}·크기 G</abbr></small></li>`;
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
  function renderBoard(cv, V, res, flash, preview = null) {
    const G = boardInfo(), reg = R(), on = new Set(actT(V).map(t => t.id)), goals = V.goals || reg.goals;
    // 로비에서는 결과·건설 계획 없이 같은 지형과 경계를 그린다. 진행 화면은 원래 경로를 쓴다.
    const lit = new Set(preview?.lit || on), tokens = preview ? getComputedStyle(cv) : null;
    const palette = tokens ? Object.fromEntries(["--ui-panel", "--ui-border", "--ui-text", "--ui-muted", "--ui-gold", "--body"].map(name => [name, tokens.getPropertyValue(name).trim()])) : null;
    const token = name => palette[name];
    const cssW = cv.clientWidth || 600, cssH = preview ? cv.parentElement.clientHeight : Math.round(G.H * cssW / G.W);
    // contain: 같은 배율로 맞추고 남는 공간의 가운데에 지도를 둔다.
    const k = preview ? Math.min(cssW / G.W, cssH / G.H) : cssW / G.W, dpr = Math.min(2, window.devicePixelRatio || 1);
    const kx = k, ox = preview ? (cssW - G.W * k) / 2 : 0, oy = preview ? (cssH - G.H * k) / 2 : 0;
    if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) { cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); cv.style.height = cssH + "px"; }
    const g = cv.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(dpr * kx, 0, 0, dpr * k, dpr * ox, dpr * oy);
    const NB_E = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]], NB_O = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
    const hex = (x, y, rr) => { g.beginPath(); for (let a = 0; a < 6; a++) { const t = Math.PI / 180 * (60 * a - 90); const px = x + rr * Math.cos(t), py = y + rr * Math.sin(t); if (a) g.lineTo(px, py); else g.moveTo(px, py); } g.closePath(); };
    // 강 칸은 땅 위에 물줄기(이웃 강·호수·바다 칸까지 잇는 띠)로 그려 호수(물 면 전체)와 구별한다.
    const WET = ch => ch === "r" || ch === "l" || ch === "~", nbOf = cl => (cl.r & 1 ? NB_O : NB_E).map(([dc, dr]) => { const o = G.at(cl.c + dc, cl.r + dr); return o && o.c === cl.c + dc ? o : null; }).filter(Boolean);
    G.cells.forEach(cl => { if (preview && !cl.team) return; hex(cl.x, cl.y, 1.03); g.fillStyle = cl.ch === "r" ? TER.p : TER[cl.ch] || TER.p; g.fill(); });
    g.lineCap = "round"; g.lineJoin = "round";
    [["rgba(230,244,255,0.9)", 0.95], [TER.r, 0.62]].forEach(([col, w]) => {
      g.strokeStyle = col; g.lineWidth = w;
      G.cells.forEach(cl => { if (cl.ch !== "r" || (preview && !cl.team)) return; const ns = nbOf(cl).filter(o => WET(o.ch)); g.beginPath(); if (!ns.length) g.arc(cl.x, cl.y, w / 2, 0, Math.PI * 2); ns.forEach(o => { g.moveTo(cl.x, cl.y); g.lineTo((cl.x + o.x) / 2, (cl.y + o.y) / 2); }); g.stroke(); });
    });
    G.cells.forEach(cl => {
      if (preview) {
        if (!cl.team) return;
        hex(cl.x, cl.y, 1.03);
        g.fillStyle = lit.has(cl.team) ? teamCol(cl.team) : token("--ui-panel");
        g.globalAlpha = lit.has(cl.team) ? 0.2 : 0.82;
        g.fill(); g.globalAlpha = 1;
      } else if (cl.team && !on.has(cl.team)) { hex(cl.x, cl.y, 1.03); g.fillStyle = "rgba(200,204,196,0.72)"; g.fill(); }
    });
    // 도시 경계(팀 색 굵은 선)
    const B = G.B;
    g.lineCap = "round";
    G.cells.forEach(cl => {
      if (!cl.team) return;
      (cl.r & 1 ? NB_O : NB_E).forEach(([dc, dr]) => {
        const o = G.at(cl.c + dc, cl.r + dr) || null, ot = o && o.c === cl.c + dc ? o.team : null;
        if (ot === cl.team) return;
        const nx = SQ3 * (cl.c + dc + 0.5 * ((cl.r + dr) & 1)) + SQ3 / 2, ny = 1.5 * (cl.r + dr) + 1, mx = (cl.x + nx) / 2, my = (cl.y + ny) / 2, dx = (ny - cl.y) / 2 / SQ3, dy = -(nx - cl.x) / 2 / SQ3;
        let border = on.has(cl.team) ? teamCol(cl.team) : "#9aa096";
        if (preview) border = !lit.has(cl.team) ? token("--ui-border") : cl.team === preview.player ? token("--ui-gold") : teamCol(cl.team);
        g.strokeStyle = border;
        g.lineWidth = preview && cl.team === preview.player ? 0.7 : ot ? 0.32 : 0.42;
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
    reg.ties.filter(D => !preview && on.has(D.a) && on.has(D.b)).forEach(D => {
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
    if (!preview) (B.labels || []).forEach(L0 => { const x = SQ3 * (L0.c + 0.5 * (L0.r & 1)) + SQ3 / 2, y = 1.5 * L0.r + 1; g.font = "600 1.2px sans-serif"; g.fillStyle = "rgba(20,40,60,0.75)"; g.fillText(L0.t, x, y); });
    reg.teams.forEach(t => {
      const c0 = G.cen[t.id]; if (!c0) return;
      const act = on.has(t.id), r0 = res && res.team[t.id], v = V.teams[t.id];
      if (preview) {
        const own = t.id === preview.player, locked = (reg.must || []).includes(t.id);
        // 이름표는 지형의 가로 투영과 무관하게 같은 픽셀 글자 크기로 그린다.
        const size = 12, subSize = 10, x = ox + c0[0] * kx, y = oy + c0[1] * k;
        const name = `${locked ? "🔒 " : ""}${t.name}`, sub = own ? "내 도시" : !act ? "제외" : preview.mode === "solo" ? "컴퓨터" : "참가 도시";
        g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.font = `600 ${size}px ${token("--body")}`;
        const w = Math.max(g.measureText(name).width, sub.length * subSize) + 12;
        g.fillStyle = token("--ui-panel"); g.fillRect(x - w / 2, y - size - 4, w, size + subSize + 12);
        g.fillStyle = own ? token("--ui-gold") : token("--ui-text"); g.fillText(name, x, y);
        g.font = `500 ${subSize}px ${token("--body")}`; g.fillStyle = token("--ui-muted"); g.fillText(sub, x, y + subSize + 3);
        g.restore();
        return;
      }
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
    if (preview) { cv.dataset.preview = "true"; cv.dataset.ox = String(ox); cv.dataset.kx = String(kx); cv.dataset.oy = String(oy); }
  }
  function boardHit(cv, ev) {
    const G = boardInfo(), rect = cv.getBoundingClientRect(), scale = rect.width / cv.clientWidth;
    const k = cv.dataset.preview ? +cv.dataset.k * scale : rect.width / G.W;
    const kx = cv.dataset.preview ? +cv.dataset.kx * scale : k;
    const x = (ev.clientX - rect.left - (cv.dataset.preview ? +cv.dataset.ox * scale : 0)) / kx, y = (ev.clientY - rect.top - (cv.dataset.preview ? +cv.dataset.oy * scale : 0)) / k;
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
      L.conn = NET.open(Object.assign({ room: save.room }, L.net, {
        canSend: (ev, m) => !L?.away || ev !== "req" || ["hello", "claim"].includes(m.type)
      }));
      L.conn.on("snap", onSnap);
      L.conn.on("nack", m => { if (m && m.team === L.team) nack(m); });
      L.conn.onStatus(s => { const el = document.getElementById("lg-conn"); if (el) { el.dataset.s = s; el.textContent = connLabel(s); } if (s === "open" && L.team) send("claim"); });
      // 교실 와이파이에서 요청 하나가 사라져도 5초 안에 복구한다: 계획·정책·기준·준비를 진행자에 반영될 때까지 다시 보낸다.
      // 진행자는 같은 값을 조용히 넘기므로(reduce의 quiet) 중복 전송은 해가 없다. 준비는 토글이 아니라 원하는 값을 보낸다.
      L.timers.push(setInterval(() => {
        if (!L.team) return;
        send("hello");
        const me = L.snap && L.snap.teams[L.team];
        if (!me) return;
        if (me.rev < L.rev) sendPlan();
        if (L.snap.phase === "plan") {
          if (L.techPending) send(L.techPending.type, L.techPending.extra);
          if (L.pendingPol) send("econ", L.pendingPol);
          if (L.pendingCrit && validCritLine(L.pendingCrit.line) && L.pendingCrit.chips.length && L.pendingCrit.choice) send("crit", L.pendingCrit);
        }
        if (readyAllowed(L.snap) && L.wantReady != null && !!me.ready !== L.wantReady) send("ready", { ready: L.wantReady });
      }, 5000));
      L.timers.push(setInterval(tickTimer, 1000));
    }
    L.app = app;
    if (!L.team) seatPicker(app); else mountCity(app);
  }
  function send(type, extra) {
    if (L.away && !["hello", "claim"].includes(type)) return;
    if (type === "crit") {
      if (!extra || !validCritLine(extra.line) || !extra.chips?.length || !extra.choice) return;
      if (extra !== L.pendingCrit) queueCrit(extra);
      extra = L.pendingCrit;
    }
    if (type === "ready") L.wantReady = !!(extra && extra.ready);
    const stamp = L.snap && !["claim", "hello"].includes(type) ? { rd: L.snap.round, ph: L.snap.phase } : {};
    L.conn.send("req", Object.assign({ type, team: L.team, token: L.token }, extra || {}, stamp));
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
      L.regionObserver?.disconnect(); L.away = null; L.home = null;
      L.team = null; L.claiming = false; teamSave();
      if (L.app && L.app.isConnected) { location.hash !== "#league/team" ? (location.hash = "#league/team") : seatPicker(L.app); const e = L.app.querySelector("#lg-err"); if (e) e.textContent = m.err === "taken" ? "다른 기기가 이미 그 팀을 맡았습니다." : "자리가 비워졌습니다. 다시 고르세요."; }
      return;
    }
    if (["research", "license", "joint"].includes(m.type)) {
      L.techPending = null; L.techError = techErrorText(m.err); renderPanel();
      BG.toast(L.techError); return;
    }
    if (m.type === "crit") {
      // 늦게 도착한 이전 요청의 거절이 새 편집값을 지우지 않게 한다.
      if (m.rid != null && m.rid !== L.pendingCrit?.rid) return;
      L.pendingCrit = null;
    }
    if (m.type === "econ") { L.pendingPol = null; renderPanel(); }
    const msg = { stale: "지난 라운드·단계의 요청입니다. 현재 화면에서 다시 확인하세요.", phase: "지금 단계에서는 바꿀 수 없습니다.", built: "이미 연결된 연계선입니다.", noprop: "제안이 없습니다.", notie: "이웃이 아닙니다.", noev: "이번 라운드 우리 도시 사건이 아닙니다.", noopt: "없는 대응입니다." }[m.err] || (String(m.err).startsWith("budget:") ? `${teamName(String(m.err).slice(7))} 예산이 모자랍니다.` : "요청을 처리하지 못했습니다.");
    BG.toast(msg);
  }
  function onSnap(V) {
    if (!V || V.room !== L.room || V.region !== REGION || !V.teams) return;
    return soloMutate(() => {
      const prev = L.snap;
      L.snap = V; L.skew = V.now - Date.now();
      if (!L.team) { if (L.app && L.app.isConnected && L.app.querySelector(".lg-seats")) seatPicker(L.app); return; }
      const me = V.teams[L.team];
      syncTechQueue(V, me);
      const pending = L.pendingCrit, crit = me?.crit;
      if (pending && crit && pending.line === crit.line && pending.choice === crit.choice && pending.chips.length === crit.chips.length && pending.chips.every((k, i) => k === crit.chips[i])) L.pendingCrit = null;
      if (prev && (prev.phase !== V.phase || prev.round !== V.round)) { L.pendingCrit = null; L.pendingPol = null; L.awaitReady = false; L.wantReady = null; }
      if (L.wantReady != null && me && !!me.ready === L.wantReady) L.wantReady = null;
      const pendingPol = L.pendingPol, econPol = me?.econPol;
      if (pendingPol && econPol && ["taxRes", "taxInd", "service", "incentive"].every(k => pendingPol[k] === econPol[k])) L.pendingPol = null;
      if (L.claiming && me.seated) { L.claiming = false; if (L.app && L.app.isConnected) mountCity(L.app); return; }
      if (!L.app || !L.app.isConnected || !document.getElementById("lg-bar")) return;
      if (L.away) {
        if (prev && (prev.phase !== V.phase || prev.round !== V.round)) phaseChanged(V);
        updateTeamAway();
        return;
      }
      // 내 도시를 다른 기기에서 처음 여는 경우: 진행자에게 남은 계획을 가져온다.
      if (me.plan && me.rev > L.rev && L.rev === 0 && isEmptyDoc()) adoptPlan(me);
      const rd = curRound();
      BG.setSeason(rd.season);
      if (V.econ && V.phase === "plan") {
        const { d, n } = monthNote(); n.buildCost = newBuildCost(V); n.buildBudget = me.budget; putData(d);
      }
      // 계절이 같아도 달이 바뀌면 leagueRound()를 다시 읽어 HUD 시간을 갱신한다.
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
    Object.assign(st, { builds: me.plan.builds || [], lines: me.plan.lines || [], policies: me.plan.policies || [], shed: me.plan.shed || "home", fab2: !!me.plan.fab2, rq: (me.plan.rq || []).slice() });
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
    if (L.away) return; // 알림만 갱신하고 돌아갈 서랍은 유지한다.
    if (V.phase === "review" || V.phase === "end") openPanel("result");
    else if (V.phase === "plan" && V.econ && curRound().month === 1) openPanel("journal");
    else if (V.phase === "plan" && evn.length) openPanel("deal");
  }
  function lockMsg() {
    if (L?.away) return "관전 중 · 읽기 전용 — 우리 도시로 돌아가 편집하세요";
    const V = L && L.snap;
    if (!V) return "";
    return V.phase === "lobby" || V.phase === "plan" ? "" : V.phase === "end" ? "리그가 끝났습니다" : "지금은 운영·결과 단계 — 다음 라운드 계획 때 지을 수 있어요";
  }
  function trialConditions(st) {
    if (!C.trialMods) return {};
    const source = L.role === "solo" ? L.S : L.snap;
    // 접속 대기는 최신 편집 계획으로 계산하고, 사건과 실제 크기는 시험 입력에 남기지 않는다.
    const input = structuredClone({ ...source, events: [], teams: { ...source.teams, [L.team]: { ...source.teams[L.team], plan: st } } });
    return C.trialMods(input, R(), L.team);
  }
  function mountCity(app, resume, view) {
    teamSave();
    const reg = R(), t = C.teamDef(reg, L.team), s = tdata();
    const raw = s.docs[t.pack];
    // 건설 화면의 저장 문서 모양({v, map, maps, journal ...})을 이 도시 하나로 쓴다.
    BG.selectPack(t.pack, "league");
    if (!resume) {
      const st = BG.sanitize(raw && raw.maps ? raw.maps[t.pack] : null, 1e9);
      if (techData() && L.snap?.teams[L.team]?.plan) st.rq = (L.snap.teams[L.team].plan.rq || []).slice();
      L.doc = { v: 2, map: t.pack, maps: { [t.pack]: st }, runs: raw && Number.isInteger(raw.runs) ? raw.runs : 0, jAuto: true, journal: raw && Array.isArray(raw.journal) ? raw.journal : [] };
      L.rev = Math.max(L.rev, s.rev || 0);
    }
    replaceTeamMap(app);
    BG.mount(app, {
      packs: [t.pack], league: true, view,
      load: () => L.doc,
      save: doc => { if (L.away) return; const z = tdata(); z.docs[t.pack] = { maps: doc.maps, runs: doc.runs, journal: doc.journal }; z.rev = L.rev; putData(z); },
      // 남은 예산 = 예산 − 철거 손실·사건 대응(fixed) − 이번에 지난 라운드 것을 뜯어 생긴 손실
      budget: () => { const me = L.snap && L.snap.teams[L.team]; return me ? me.budget - (me.fixed || 0) - C.lossOf(me.base, BG.current()) : C.budget({ round: 1, ties: [], region: REGION }, L.team); },
      research: () => { const me = L.snap && L.snap.teams[L.team]; return (me && (me.research || me.rs)) || { prog: {}, stage: {}, adoptR: {} }; },
      salvage: key => { const me = L.snap && L.snap.teams[L.team]; return me && (me.base || []).some(x => x.k === key) ? C.SALV : 1; },
      locked: lockMsg,
      season: () => curRound().season,
      leagueRound: curRound,
      leagueMods: trialConditions,
      onChange: () => {
        if (L.away) return;
        if (L.snap?.econ) { const { d, n } = monthNote(); n.confirmed = false; n.buildCost = newBuildCost(L.snap); n.buildBudget = L.snap.teams[L.team].budget; n.research = (BG.current()?.builds || []).some(b => ["uni", "lab"].includes(b.t) && !(L.snap.teams[L.team].base || []).some(item => item.k === C.itemKey("b", b))); putData(d); }
        L.rev++; const z = tdata(); z.rev = L.rev; putData(z); clearTimeout(L.planT);
        // 혼자 하기는 같은 탭에서 즉시 반영한다. 이탈 때 취소되는 전송 타이머를 기다리지 않는다.
        if (L.role === "solo") sendPlan(); else L.planT = setTimeout(sendPlan, 400); },
      onMount: root => { addBar(root); setupTeamMap(root); window.dispatchEvent(new Event("resize")); }
    });
    if (resume) return;
    send("claim");
    sendPlan();
    if (L.snap?.econ && L.snap.phase === "plan" && curRound().month === 1 && !L.panel) openPanel("journal");
  }
  function sendPlan() {
    if (L?.techPending) return; // 승인 전에 예전 rq로 연구 요청을 덮어쓰지 않는다.
    if (!L || L.away) return;
    const st = L.doc?.maps[L.doc.map];
    if (!st || !L.team) return;
    send("plan", { rev: L.rev, plan: { builds: st.builds, lines: st.lines, policies: st.policies, shed: st.shed, fab2: st.fab2, missions: st.missions, seed: st.seed, season: st.season, rq: st.rq || [] } });
  }
  // U5: 편집 문서는 L.doc에만 보관한다. BG.current는 관전 전용 사본일 수 있다.
  function leaveTeamCity() {
    if (L.away) return;
    const panel = document.getElementById("lg-panel"), root = document.getElementById("bd-root");
    L.home = { panel, scroll: panel?.scrollTop || 0, phase: L.snap?.phase, round: L.snap?.round,
      view: BG.saveView(), group: root?.querySelector('[data-group][aria-expanded="true"]')?.dataset.group,
      layer: root?.querySelector('[data-layer][aria-pressed="true"]')?.dataset.layer,
      drawer: root?.querySelector('#bd-pm')?.getAttribute("aria-expanded") === "true",
      tab: root?.querySelector('[data-tab][aria-pressed="true"]')?.dataset.tab };
    panel?.remove(); // 입력값·선택·스크롤과 리스너까지 그대로 보존한다.
    clearTimeout(L.planT); L.planT = 0;
    L.away = "region";
    mountTeamPeek(L.team); // 실행 중인 시험 운전도 정리하고 읽기 전용 사본으로 전환한다.
  }
  function awayBar(root, peek) {
    document.querySelectorAll("#lg-bar").forEach(el => el.remove());
    const bar = document.createElement("header");
    bar.id = "lg-bar"; bar.className = peek ? "lg-bar lg-awaybar" : "lg-awaybar";
    bar.innerHTML = `<strong>${peek ? `${esc(teamName(L.away))} 관전 중 · 읽기 전용` : "지역 지도"}</strong>
      <div class="lg-awaystatus"><span id="lg-bround"></span><span id="lg-bphase"></span><b class="lg-timer" id="lg-timer"></b></div>
      <div class="lg-awayactions">${peek ? '<button type="button" class="lg-bbtn" id="lg-peek-region">지역 지도로</button>' : ""}
      <button type="button" class="lg-bbtn" id="${peek ? "lg-peek-back" : "lg-region-back"}">우리 도시로</button>
      <button type="button" class="lg-bbtn" id="lg-ready" disabled>준비</button></div>
      <p class="lg-awaylive" id="lg-live" role="status" aria-live="polite"></p>`;
    root.prepend(bar);
    bar.querySelector(peek ? "#lg-peek-back" : "#lg-region-back").onclick = returnTeamCity;
    bar.querySelector("#lg-peek-region")?.addEventListener("click", teamRegion);
    updateAwayStatus();
  }
  function updateAwayStatus() {
    const V = L.snap;
    if (!V) return;
    const round = document.getElementById("lg-bround"), phase = document.getElementById("lg-bphase");
    if (round) round.textContent = turnLabel(curRound(), V.round, C.roundsOf(V).length, true);
    if (phase) phase.textContent = PHASE_NAME[V.phase];
    tickTimer();
  }
  function replaceTeamMap(app) {
    // build.mount는 append 방식이다. 팀이 다시 mount할 때 숨긴 이전 루트도 제거한다.
    // 돌아갈 입력 서랍은 leaveTeamCity가 L.home.panel로 따로 보존한다.
    L.hudObserver?.disconnect(); L.syncMoney = null;
    app.querySelectorAll("#bd-root, #lg-region").forEach(el => el.remove());
  }
  function mountTeamPeek(id) {
    const t = C.teamDef(R(), id);
    BG.selectPack(t.pack, "league");
    const st = BG.sanitize(L.snap?.teams[id]?.plan || {}, 1e9);
    replaceTeamMap(L.app);
    BG.mount(L.app, { packs: [t.pack], league: true,
      load: () => ({ v: 2, map: t.pack, maps: { [t.pack]: st }, runs: 0, jAuto: true, journal: [] }),
      save: () => {}, locked: () => "관전 중 · 읽기 전용", season: () => curRound().season, leagueRound: curRound,
      onMount: root => {
        root.classList.add("lg-peek");
        root.querySelectorAll("#lg-peek").forEach(el => el.remove());
        const peek = document.createElement("section"); peek.id = "lg-peek";
        root.append(peek); awayBar(peek, true);
        // 건설 도구·정책·시험 운전은 관전에서 접근하지 않는다. 지도 확대·드래그는 유지한다.
        root.querySelectorAll("#bd-dock, #bd-drawer").forEach(el => {
          el.inert = true; el.querySelectorAll("button, input, select").forEach(control => { control.disabled = true; });
        });
        window.dispatchEvent(new Event("resize"));
      }
    });
  }
  function teamPeek(id) {
    if (!L.snap?.teams[id]) return;
    if (id === L.team) { returnTeamCity(); return; }
    leaveTeamCity(); L.regionObserver?.disconnect(); L.away = id;
    mountTeamPeek(id);
    document.getElementById("lg-peek-back")?.focus();
  }
  function teamRegion() {
    if (!boardInfo() || !L.snap) return;
    leaveTeamCity(); L.away = "region";
    L.regionObserver?.disconnect();
    document.getElementById("lg-region")?.remove();
    const root = document.getElementById("bd-root");
    root.hidden = true; root.inert = true;
    root.querySelectorAll("#lg-peek, #lg-bar").forEach(el => el.remove());
    const region = document.createElement("main"); region.id = "lg-region"; region.className = "lg-region";
    region.innerHTML = `<div class="lg-regiontools"><button type="button" class="lg-bbtn" data-region-zoom="1" aria-label="지역 지도 확대">＋</button>
      <button type="button" class="lg-bbtn" data-region-zoom="-1" aria-label="지역 지도 축소">−</button><span>확대 후 드래그로 이동 · 아래 도시 버튼으로도 관전</span></div>
      <div class="lg-regionviewport"><div class="lg-regionboard"><canvas id="lg-regionmap" class="lg-mapc" role="img" aria-label="도시별 설비·송전선·거래·이주 지도" aria-describedby="lg-regioncap"></canvas><div class="lg-regionlabels"></div></div></div>
      <p id="lg-regioncap" class="lg-regioncap"></p><nav class="lg-regioncities" aria-label="관전할 도시">${actT(L.snap).map(t => `<button type="button" class="lg-regioncity" data-region-city="${esc(t.id)}" style="--c:${esc(t.color)}"><b>${esc(t.name)}${t.id === L.team ? " · 우리 도시" : ""}</b><span></span></button>`).join("")}</nav>`;
    L.app.append(region); awayBar(region, false);
    region.querySelectorAll("[data-region-city]").forEach(b => b.onclick = () => teamPeek(b.dataset.regionCity));
    const viewport = region.querySelector(".lg-regionviewport"), cv = region.querySelector("canvas");
    L.regionZoom = 1;
    let drag = null;
    region.querySelectorAll("[data-region-zoom]").forEach(b => b.onclick = () => {
      L.regionZoom = Math.max(1, Math.min(3, L.regionZoom + Number(b.dataset.regionZoom) * 0.5));
      updateTeamRegion();
    });
    viewport.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false };
      viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved ||= Math.hypot(dx, dy) > 6;
      viewport.scrollLeft = drag.left - dx; viewport.scrollTop = drag.top - dy;
    });
    viewport.addEventListener("pointerup", e => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved; drag = null;
      viewport.releasePointerCapture(e.pointerId);
      if (!moved) teamPeek(boardHit(cv, e));
    });
    viewport.addEventListener("pointercancel", () => { drag = null; });
    L.regionObserver = new ResizeObserver(() => { if (L?.away === "region") updateTeamRegion(); });
    L.regionObserver.observe(viewport);
    updateTeamRegion(); document.getElementById("lg-region-back").focus();
  }
  function regionSummary(V, id) {
    const v = V.teams[id], r = V.results.at(-1)?.team[id], c = V.econ?.cities[id];
    return `설비 ${fmt(v.plan?.builds?.length || 0)}개 · 정전 ${r ? fmt(r.unsPct, 1) + "%" : "결과 대기"}${c ? ` · 지지율 ${fmt(c.approval, 1)}% · 주민 ${signed(V.econ.report?.cities[id]?.dPop || 0)}명` : ""}`;
  }
  function updateTeamRegion() {
    const region = document.getElementById("lg-region"), V = L.snap, G = boardInfo();
    if (!region || !V) return;
    const viewport = region.querySelector(".lg-regionviewport");
    region.querySelector(".lg-regionboard").style.width = `${Math.min(viewport.clientWidth, viewport.clientHeight * G.W / G.H) * L.regionZoom}px`;
    renderBoard(region.querySelector("canvas"), V, V.results.at(-1), false);
    region.querySelector(".lg-regionlabels").innerHTML = actT(V).map(t => {
      const xy = G.cen[t.id];
      return `<span class="lg-regionlabel" style="left:${esc(xy[0] / G.W * 100)}%;top:${esc(xy[1] / G.H * 100)}%;--c:${esc(t.color)}">${esc(regionSummary(V, t.id))}</span>`;
    }).join("");
    region.querySelectorAll("[data-region-city]").forEach(b => { b.querySelector("span").textContent = regionSummary(V, b.dataset.regionCity); });
    const moves = (V.econ?.report?.flows.pop || []).slice().sort((a, b) => b.n - a.n).slice(0, IQ.quarter);
    region.querySelector("#lg-regioncap").textContent = moves.map(f => `${teamName(f.from)} → ${teamName(f.to)} ${fmt(f.n)}명: ${f.why || ""}`).join(" · ");
  }
  function updateTeamAway() {
    updateAwayStatus();
    if (L.away === "region") { updateTeamRegion(); return; }
    const t = C.teamDef(R(), L.away), st = BG.current();
    if (!t || !st) return;
    BG.selectPack(t.pack, "league");
    Object.assign(st, BG.sanitize(L.snap.teams[L.away]?.plan || {}, 1e9));
    BG.setSeason(curRound().season); BG.refresh();
    document.querySelectorAll(".lg-peek #bd-drawer button, .lg-peek #bd-drawer input").forEach(el => { el.disabled = true; });
  }
  function returnTeamCity() {
    if (!L.away) return;
    const home = L.home;
    L.regionObserver?.disconnect(); L.away = null; L.home = null;
    // mountCity는 저장본으로 덮거나 claim/plan을 보내지 않고 같은 L.doc를 다시 연결한다.
    mountCity(L.app, true, home?.view);
    if (home?.panel) {
      document.getElementById("lg-panel")?.replaceWith(home.panel);
      home.panel.scrollTop = home.scroll;
      if (home.phase !== L.snap?.phase || home.round !== L.snap?.round) { renderPanel(); home.panel.scrollTop = home.scroll; }
    }
    const root = document.getElementById("bd-root");
    if (home?.layer) root.querySelector(`[data-layer="${home.layer}"]`)?.click();
    if (home?.group && root.querySelector(`[data-group="${home.group}"]`)?.getAttribute("aria-expanded") !== "true") root.querySelector(`[data-group="${home.group}"]`)?.click();
    if (home?.drawer) root.querySelector("#bd-pm")?.click();
    if (home?.tab) root.querySelector(`[data-tab="${home.tab}"]`)?.click();
    document.querySelectorAll(".lg-bar [data-panel]").forEach(b => b.setAttribute("aria-expanded", String(b.dataset.panel === L.panel)));
    document.querySelector('[data-panel="region"]')?.focus();
    // 관전 중 취소한 내 계획만 복귀 후 재전송한다. 관전 사본은 절대 보내지 않는다.
    if (L.snap?.teams[L.team]?.rev < L.rev && !lockMsg()) sendPlan();
    L.conn.flush?.();
  }

  function setupTeamMap(root) {
    root.classList.add("lg-team-map");
    root.dataset.lineTool = "false";
    const syncTool = () => { root.dataset.lineTool = String(!!root.querySelector('[data-tool="line"][aria-pressed="true"]')); };
    root.addEventListener("click", () => queueMicrotask(syncTool));
    root.addEventListener("keydown", () => queueMicrotask(syncTool));
    syncTool();
    L.hudObserver?.disconnect();
    const money = root.querySelector('[data-cap="budget"]');
    const syncMoney = () => {
      const value = money?.querySelector("[data-v]"), label = money?.querySelector(".v2-cap-k");
      if (label && label.textContent !== "남은 돈") label.textContent = "남은 돈";
      const text = `${fmt(L.snap?.teams[L.team]?.left, 1)}억`;
      if (value && value.textContent !== text) value.textContent = text;
      if (value) value.dataset.money = "left";
    };
    const cp = root.querySelector('[data-cap="cp"] [data-v]');
    const syncComplaints = () => {
      const value = `${BG.complaints(BG.current(), null).issues}건`;
      if (cp && cp.textContent !== value) cp.textContent = value;
    };
    // HUD 콜백은 돈과 지금 지도의 민원을 함께 맞춘다.
    L.hudObserver?.disconnect();
    L.hudObserver = new MutationObserver(() => { syncMoney(); syncComplaints(); });
    if (money) L.hudObserver.observe(money, { childList: true, characterData: true, subtree: true });
    if (cp) L.hudObserver.observe(cp, { childList: true, characterData: true, subtree: true });
    L.syncMoney = () => { syncMoney(); syncComplaints(); }; L.syncMoney();
    root.querySelectorAll('[data-cap="co2"] .v2-cap-k').forEach(el => { el.textContent = "CO₂(시험 운전)"; });
    root.querySelectorAll('[data-cap="cp"] .v2-cap-k').forEach(el => { el.textContent = "민원(지금 지도 기준)"; });
  }
  function addBar(root) {
    // 새로고침 뒤 도시 지도가 두 번 붙으면 막대·서랍이 겹친다 — 붙이기 전에 예전 것을 지운다.
    for (const id of ["lg-bar", "lg-panel"]) document.getElementById(id)?.remove();
    const bar = document.createElement("div");
    bar.className = "lg-bar";
    bar.dataset.econ = String(!!L.snap?.econ);
    bar.id = "lg-bar";
    bar.style.setProperty("--c", teamCol(L.team));
    bar.innerHTML = `<span class="lg-bteam">${esc(teamName(L.team))}</span>
      <span class="lg-bround" id="lg-bround"></span>
      <span class="lg-bmoney">남은 돈 <b id="lg-left-hud" data-money="left"></b></span>
      <span class="lg-bphase" id="lg-bphase"></span><b class="lg-timer num" id="lg-timer"></b>
      <span class="lg-conn" id="lg-conn" data-s="${esc(L.conn.status())}">${connLabel(L.conn.status())}</span>
      <button type="button" class="lg-bbtn" data-panel="deal">이웃·거래<b class="lg-badge" id="lg-badge" hidden></b></button>
      <button type="button" class="lg-bbtn" data-panel="region">지역 지도</button>
      <button type="button" class="lg-bbtn" data-panel="tech">연구</button>
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
      if (p?.dataset.panel === "region") { teamRegion(); return; }
      if (p) { L.panel === p.dataset.panel ? closePanel() : openPanel(p.dataset.panel); return; }
      if (e.target.closest("#lg-ready")) readyAction(false);
      if (e.target.closest("#lg-solo-restart")) restartSolo();
    });
    panel.addEventListener("click", onPanelClick);
    panel.addEventListener("change", onPanelChange);
    panel.addEventListener("input", e => {
      if (e.target.matches("#lg-crit-line, [data-note], [data-pred], [data-end], [data-weight]")) econChange(e);
      if (e.target.matches("[data-j]")) onPanelChange(e);
      const pol = e.target.closest("[data-pol]");
      if (pol) {
        const output = pol.closest("label").querySelector("output");
        if (output) output.textContent = `${fmt(+pol.value, 1)}${pol.dataset.pol === "incentive" ? "억/달" : "단계"}`;
      }
      const r = e.target.closest("#lg-price");
      if (r) { const o = document.getElementById("lg-price-v"); if (o) o.textContent = (+r.value).toFixed(3); }
    });
    panel.addEventListener("focusout", () => {
      const session = L;
      // 다음 포커스와 change 처리가 끝난 뒤 갱신한다. 다른 입력으로 옮기면 계속 미룬다.
      setTimeout(() => {
        if (L !== session || !panel.isConnected || !session?.panelDirty) return;
        // 서랍 버튼을 누르려고 옮긴 포커스라면 pointerup·click 전에 버튼을 없애지 않는다.
        const active = document.activeElement;
        if (active && panel.contains(active) && active.matches("button")) return;
        renderPanel();
      }, 0);
    });
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
    const me = V.teams[L.team]; set("lg-left-hud", `${fmt(me.left, 1)}억`); L.syncMoney?.();
    const rb = document.getElementById("lg-ready");
    for (const id of ["lg-bar", "lg-panel"]) { const el = document.getElementById(id); if (el) el.dataset.econ = String(!!V.econ); }
    if (rb) rb.style.minHeight = V.econ ? "44px" : "";
    if (rb) { rb.setAttribute("aria-pressed", String(!!me.ready)); rb.textContent = V.econ && V.phase === "plan" && L.awaitReady ? "기준 확인" : L.role === "solo" && V.phase === "review" ? V.round === C.roundsOf(V).length ? "최종 결과" : "다음 달" : me.ready ? "준비 ✓" : "준비"; rb.disabled = !readyAllowed(V); }
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
    if (L.away) return;
    const p = document.getElementById("lg-panel");
    if (!p || !L.panel) return;
    const active = document.activeElement;
    // 포커스를 복원해도 빠른 키 입력·IME 조합·드래그 도중의 요소 교체는 복구할 수 없다.
    if (active && p.contains(active) && active.matches("input, textarea, select, button[data-pol], button[data-crit], button[data-crit-choice]")) {
      L.panelDirty = true;
      return;
    }
    L.panelDirty = false;
    const V = L.snap, reg = R(), tab = L.panel;
    const techScroll = p.querySelector(".lg-tech-scroll")?.scrollLeft || 0;
    const focused = document.activeElement, focusKey = focused && p.contains(focused) ? ["data-note", "data-j", "data-end", "data-pol", "data-ptab", "data-tech-card", "data-tech-action", "data-pclose", "id"].find(k => focused.hasAttribute(k)) : null;
    const focusValue = focusKey ? focused.getAttribute(focusKey) : null, cursor = focusKey && focused.tagName === "TEXTAREA" ? [focused.selectionStart, focused.selectionEnd] : null;
    let body = "";
    if (!V) body = `<p class="lg-hint">진행자 연결을 기다리는 중입니다.</p>`;
    else if (tab === "tech") body = techHTML(V);
    else if (tab === "city" && V.econ) body = cityHTML(V);
    else if (tab === "rank" && V.econ) body = tickerHTML(V) + rankHTML(V.econ, L.role !== "solo");
    else if (tab === "deal") {
      const me = V.teams[L.team], open = V.phase === "lobby" || V.phase === "plan";
      const nbs = reg.ties.filter(D => (D.a === L.team || D.b === L.team) && V.teams[D.a] && V.teams[D.b]);
      const left = me.left;
      const evh = V.round ? evCards(V, V.round, L.team, V.phase === "plan") : "";
      body = `${evh ? `<section class="lg-sec"><h3>이번 라운드 사건</h3>${evh}</section>` : ""}<p class="lg-left">남은 돈 <b class="num" data-money="left" data-bad="${left < 0}">${fmt(left, 1)}억</b> <small>(계획 반영 뒤 쓸 수 있는 돈 · 연계선은 두 도시가 반씩 · 지난 라운드 것을 철거하면 ${Math.round(C.SALV * 100)}%만 회수)</small></p>
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
      if (tab === "journal") body = previousNoteHTML(V) + critHTML(V) + predictionHTML(V) + body.replace('<button type="button" class="v2-btn" id="lg-jcopy">', quarterHTML(V) + '<button type="button" class="v2-btn" id="lg-jcopy">');
    }
    if (tab === "result" && V) body = techResultHTML(V) + body;
    p.classList.toggle("lg-tech-drawer", tab === "tech");
    p.innerHTML = `<div class="lg-ptabs" aria-label="리그 서랍"><strong>${esc({ deal: "이웃·거래", result: "결과", journal: "일지", city: "도시", rank: "순위", tech: "연구" }[tab])}</strong><button class="lg-bbtn" type="button" id="lg-panel-fold" aria-expanded="${!L.panelFolded}">${L.panelFolded ? "펼치기" : "접기"}</button><button type="button" class="lg-px" data-pclose aria-label="닫기">×</button></div><div class="lg-pbody" ${L.panelFolded ? "hidden" : ""}>${body}<p class="lg-hint">${ASSUMPTIONS}</p></div>`;
    const tree = p.querySelector(".lg-tech-scroll"); if (tree) tree.scrollLeft = techScroll;
    restorePanelFocus(p, focusKey, focusValue, cursor);
  }
  function restorePanelFocus(p, key, value, cursor) {
    if (!key) return;
    const target = [...p.querySelectorAll(`[${key}]`)].find(el => el.getAttribute(key) === value);
    if (target) { target.focus({ preventScroll: true }); if (cursor) target.setSelectionRange(...cursor); }
  }
  function onPanelClick(e) {
    if (e.target.closest("#lg-panel-fold")) { L.panelFolded = !L.panelFolded; document.getElementById("lg-panel").dataset.folded = String(L.panelFolded); renderPanel(); return; }
    if (techClick(e)) return;
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
    if (rs) { if (L.snap?.econ) { const { d, n } = monthNote(); n.big = true; n.confirmed = false; putData(d); } send("respond", { ev: rs.dataset.ev, opt: rs.dataset.resp }); rs.closest(".lg-evopts").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === rs))); return; }
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
    plan: fn => { const st = BG.current(); if (!st || !L || !["team", "solo"].includes(L.role) || lockMsg()) return false; fn(st); if (L.snap?.econ) { const { d, n } = monthNote(); n.buildCost = newBuildCost(L.snap); n.buildBudget = L.snap.teams[L.team].budget; n.confirmed = false; putData(d); } L.rev++; sendPlan(); BG.refresh(); return true; }
  };
})();
