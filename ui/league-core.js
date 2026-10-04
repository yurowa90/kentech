/* 멀티플레이 리그의 규칙(화면 없음). 진행자 기기가 이 규칙으로 상태를 정하고 모두에게 알린다.
 * - 상태(state): 방 · 라운드 · 단계 · 팀 자리와 계획 · 연계선 · 라운드 결과
 * - reduce(state, msg): 팀이 보낸 요청(자리 잡기 · 계획 · 판매 단가 · 연계선 · 준비)을 검사해 반영
 * - runRound(state, bg): 팀마다 자기 도시를 따로 돌린 뒤(bg = KCP.buildGame) settle로 도시 사이 거래를 정산
 * 정산은 시간마다: 모자란 도시가 연계선으로 이어진 이웃에게서 남는 재생 전력 → 남는 화력 여유 순으로, 단가가 싼 쪽부터 산다.
 * 팔 쪽 화력은 단가가 연료비보다 비쌀 때만 판다. 연계선 손실 2%. 돈은 도착한 양만큼 낸다.
 */
(function () {
  "use strict";
  const KCP = window.KCP;
  if (!KCP) return;
  const PHASES = ["lobby", "plan", "run", "review", "end"];
  const PRICE = { min: 0.005, max: 0.05, def: 0.015 };
  const TIE_LOSS = 0.02, LOG_MAX = 40, GROW = 0.25;
  // 지난 라운드까지 운영한 설비·선을 철거하면 건설비의 30%만 돌려받는다(게임 가정 G). 이번 라운드에 놓은 것은 되돌리기라 전액.
  const SALV = 0.3;
  const PLAN_MS = 8 * 60 * 1000, REVIEW_MS = 5 * 60 * 1000;

  const regionOf = id => (KCP.LEAGUE_REGIONS || {})[id] || null;
  const teamDef = (R, id) => R.teams.find(t => t.id === id) || null;
  const tieDef = (R, a, b) => R.ties.find(t => (t.a === a && t.b === b) || (t.a === b && t.b === a)) || null;
  const tieId = T => T.a + "~" + T.b;
  const isTeam = (R, id, S) => !!teamDef(R, id) && (!S || Object.hasOwn(S.teams, id));
  const num = (x, lo, hi, d) => (typeof x === "number" && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
  const r2 = x => Math.round(x * 100) / 100;
  const r3 = x => Math.round(x * 1000) / 1000;

  // 참가 도시 고르기: 2~6곳, 꼭 들어갈 도시(R.must, 평택) 포함, 육상·만 횡단 연계선으로 서로 이어져야 한다(해저 연계선 후보는 이웃으로 치지 않음).
  const ALL = R => R.teams.map(t => t.id);
  function validTeams(R, list) {
    const ids = ALL(R).filter(id => (list || []).includes(id));
    if (ids.length < 2) return { ok: false, err: "2곳 이상 고르세요", ids };
    if (ids.length > R.teams.length) return { ok: false, err: "너무 많습니다", ids };
    const miss = (R.must || []).filter(id => !ids.includes(id));
    if (miss.length) return { ok: false, err: `${miss.map(id => teamDef(R, id).name).join(", ")}은(는) 꼭 들어가야 합니다`, ids };
    const seen = new Set([ids[0]]), q = [ids[0]];
    while (q.length) { const u = q.shift(); R.ties.forEach(T => { if (T.kind === "sea") return; const v = T.a === u ? T.b : T.b === u ? T.a : null; if (v && ids.includes(v) && !seen.has(v)) { seen.add(v); q.push(v); } }); }
    if (seen.size !== ids.length) return { ok: false, err: "고른 도시끼리 서로 이웃해야 합니다(육지·만으로 이어지게)", ids };
    return { ok: true, ids };
  }
  // 턴 목록: 달 턴(경제 모드, S.rounds = [{month, year, season, days}]) 또는 지역 기본(계절 4라운드)
  const SEASON_OF_MONTH = m => (m === 12 || m <= 2 ? "winter" : m <= 5 ? "spring" : m <= 8 ? "summer" : "autumn");
  function monthRounds(turns, y0, m0) {
    const out = [];
    for (let k = 0; k < turns; k++) { const mm = ((m0 - 1 + k) % 12) + 1, yy = y0 + Math.floor((m0 - 1 + k) / 12); out.push({ month: mm, year: yy, season: SEASON_OF_MONTH(mm), days: 7, mdays: new Date(Date.UTC(yy, mm, 0)).getUTCDate() }); }
    return out;
  }
  const roundsOf = S => (Array.isArray(S.rounds) && S.rounds.length ? S.rounds : regionOf(S.region).rounds);
  const activeOf = S => (Array.isArray(S.active) && S.active.length ? S.active : Object.keys(S.teams));
  // opt.turns(12·24·36)를 주면 1턴 = 1달(경제 모드). 없으면 지역 기본 라운드.
  function newState(room, regionId, now, list, opt) {
    const R = regionOf(regionId);
    if (!R) throw new Error("region");
    const V = validTeams(R, list || ALL(R));
    if (!V.ok) throw new Error(V.err);
    const teams = {};
    V.ids.forEach(id => { teams[id] = { token: null, online: 0, ready: false, plan: null, rev: 0, price: PRICE.def, hist: [] }; });
    // 지역 CO₂ 목표는 고른 도시의 실제 사용량 몫만큼(6곳 = R.goals.co2)
    const tw = id => (teamDef(R, id).real || { twh: 1 }).twh, share = V.ids.reduce((a, id) => a + tw(id), 0) / ALL(R).reduce((a, id) => a + tw(id), 0);
    const goals = { unsPct: R.goals.unsPct, co2: Math.round(R.goals.co2 * share / 10) * 10 };
    const S = { v: 2, room, region: R.id, created: now || 0, rev: 1, round: 0, phase: "lobby", ends: null, active: V.ids, goals, teams, ties: [], results: [], events: [], log: [] };
    if (opt && [12, 24, 36].includes(opt.turns)) {
      S.rounds = monthRounds(opt.turns, opt.year || 2027, 1);
      // 경제 층(ui/econ.js): 주민·산업·현금·지지율. 시작 현금 = 도시 지도 예산.
      if (KCP.econ && KCP.ECON_DATA) {
        const cash = {}; V.ids.forEach(id => { cash[id] = baseBudget(R, id); });
        S.econ = KCP.econ.initCities(V.ids, KCP.ECON_DATA, { seed: room, months: opt.turns, cash });
        S.econRep = null; S.econCal = false;
      }
    }
    return S;
  }

  function log(S, text, now) { S.log.push({ at: now || 0, t: String(text).slice(0, 120) }); if (S.log.length > LOG_MAX) S.log.splice(0, S.log.length - LOG_MAX); }

  // 팀 예산: 처음 예산에서 라운드마다 25%씩 투자금이 더 들어온다. 연계선 몫은 빠진다.
  function packOf(R, id) { const t = teamDef(R, id); return t && KCP.BUILD_MAPS ? KCP.BUILD_MAPS[t.pack] : null; }
  function baseBudget(R, id) { const P = packOf(R, id); return P ? P.budget || 200 : 200; }
  function tieCost(R, T) { const D = tieDef(R, T.a, T.b); return D ? r2(D.cost * (T.cap === 4 ? 1.6 : 1)) : 0; }
  function tieShare(S, R, id) { return S.ties.filter(T => T.st === "built" && (T.a === id || T.b === id)).reduce((a, T) => a + tieCost(R, T) / 2, 0); }
  function budget(S, id) {
    const R = regionOf(S.region);
    // 경제 모드(달 턴): 쓸 수 있는 돈 = 이번 달 시작 현금 + 지방채 한도 + 이미 확정된 투자(계획 안에 들어 있는 몫) − 이번 달 새 연계선 몫 + 아직 안 받은 이번 달 사건 지원금
    if (S.econ && S.econ.cities[id]) {
      const T = S.teams[id] || {}, unpaid = S.phase === "lobby" || S.phase === "plan" ? bonusOf(S, R, id, S.round) : 0;
      return r2(S.econ.cities[id].cash + S.econ.cities[id].debtCap + (T.committed || 0) + (T.tieAt || 0) - tieShare(S, R, id) + unpaid);
    }
    return r2(baseBudget(R, id) * (1 + GROW * Math.max(0, S.round - 1)) - tieShare(S, R, id) + bonusOf(S, R, id));
  }

  /* ---------- 돈의 흐름: 철거 손실 · 사건 대응비 ---------- */
  // 설비·선의 이름표. 같은 이름표면 같은 물건(지난 라운드부터 있던 것).
  const itemKey = (kind, x) => kind === "b" ? `b:${x.t}:${x.i}` : `l:${x.p.join("-")}`;
  const keysOf = plan => new Set([...((plan && plan.builds) || []).filter(b => b && b.t != null).map(b => itemKey("b", b)), ...((plan && plan.lines) || []).filter(L => L && Array.isArray(L.p)).map(L => itemKey("l", L))]);
  // base = 지난 운영 때 있던 물건 [{k, c(건설비)}]. 지금 계획에서 빠진 것마다 70%를 잃는다.
  function lossOf(base, plan) {
    if (!Array.isArray(base) || !base.length) return 0;
    const ks = keysOf(plan);
    return r2(base.reduce((a, x) => a + (ks.has(x.k) ? 0 : x.c * (1 - SALV)), 0));
  }
  function itemCosts(bg, R, id, plan) {
    return withPack(bg, R, id, () => {
      const st = bg.sanitize(plan || {}, 1e9);
      return [...st.builds.map(b => ({ k: itemKey("b", b), c: r2(bg.capex({ builds: [b], lines: [] })) })), ...st.lines.map(L => ({ k: itemKey("l", L), c: r2(bg.capex({ builds: [], lines: [L] })) }))];
    });
  }
  // 사건 대응: T.resp["라운드:사건"] = 고른 대응 id
  const respOpt = (R, S, id, ev) => { const T = S.teams && S.teams[id], o = T && T.resp && T.resp[ev.round + ":" + ev.id], E = eventDef(R, ev.id); return o && E && Array.isArray(E.opts) ? E.opts.find(x => x.id === o) || null : null; };
  function respCost(S, R, id, round) {
    return r2((S.events || []).filter(ev => round == null || ev.round === round).reduce((a, ev) => { const o = respOpt(R, S, id, ev); return a + (o ? o.cost || 0 : 0); }, 0));
  }
  // 사건 지원금(budgetAdd) — 조건부 유치·보류를 고르면 grant 배수만큼
  function bonusOf(S, R, id, round) {
    return r2((S.events || []).filter(ev => round == null || ev.round === round).reduce((a, ev) => {
      const E = eventDef(R, ev.id);
      if (!E || !E.effect || typeof E.effect.budgetAdd !== "number" || !hits(R, E, id)) return a;
      const o = respOpt(R, S, id, ev);
      return a + E.effect.budgetAdd * (o && typeof o.grant === "number" ? o.grant : 1);
    }, 0));
  }
  // 계획 밖에서 이미 나간 돈: 지난 철거 손실 + 사건 대응비(모든 라운드)
  const fixedOf = (S, R, id) => r2(((S.teams[id] && S.teams[id].sunk) || 0) + ((S.teams[id] && S.teams[id].rfix) || 0) + respCost(S, R, id));

  /* ---------- 연구(진행자 기준): 라운드마다 RS.roundSteps주치 진척, 실증 1라운드, 다음 라운드부터 도입 ---------- */
  // 대학 인력은 지난 라운드부터 있던 대학(base)만 센다(준비 기간). 연구소는 지은 라운드부터 자리·기본 인력.
  function advanceResearch(bg, R, S, id, now) {
    const T = S.teams[id], plan = T.plan || { builds: [] }, RS = bg.RS, TECHS = bg.TECHS;
    const rs = T.rs = T.rs || { prog: {}, stage: {}, adoptR: {} };
    const n = t => (plan.builds || []).filter(b => b.t === t).length;
    const oldUni = (T.base || []).filter(x => x.k.startsWith("b:uni:") && keysOf(plan).has(x.k)).length;
    const staff = n("lab") * RS.labStaff + oldUni * RS.uniStaff, eff = Math.min(staff, n("lab") * RS.labSeats);
    Object.keys(rs.stage).forEach(t => { if (rs.stage[t] === "demo") { rs.stage[t] = "done"; rs.adoptR[t] = S.round + 1; log(S, `${teamDef(R, id).name}: ${TECHS.find(x => x.id === t).name} 도입`, now); } });
    const cur = (plan.rq || []).find(t => !rs.stage[t] && TECHS.some(x => x.id === t));
    if (cur && eff > 0) {
      const X = TECHS.find(x => x.id === cur);
      rs.prog[cur] = Math.min(X.need, (rs.prog[cur] || 0) + RS.roundSteps * eff);
      if (rs.prog[cur] >= X.need) {
        rs.stage[cur] = "demo";
        T.rfix = r2((T.rfix || 0) + X.demo + (cur === "bms" ? n("battery") * RS.retroBat : 0));
        log(S, `${teamDef(R, id).name}: ${X.name} 실증 시작`, now);
      }
    }
    rs.staff = staff; rs.eff = eff;
  }
  const techOf = (S, id) => { const rs = S.teams[id] && S.teams[id].rs; return rs ? Object.keys(rs.adoptR || {}).filter(t => rs.adoptR[t] <= S.round) : []; };
  function spendOf(bg, S, R, id, plan) { return r2(capexOf(bg, R, id, plan) + fixedOf(S, R, id) + lossOf(S.teams[id].base, plan)); }

  const goalsOf = S => S.goals || regionOf(S.region).goals;
  // 예측 기술을 도입한 팀은 이번 라운드 사건의 실제 크기 x를 원래 범위의 절반 폭으로 미리 안다(가운데는 x에서 조금 비켜 둔다).
  function fcxOf(S, id) {
    if (!techOf(S, id).includes("fcst")) return null;
    const R = regionOf(S.region), out = {};
    (S.events || []).filter(ev => ev.round === S.round && typeof ev.x === "number").forEach(ev => {
      const E = eventDef(R, ev.id), fc = (E && E.fc) || 0;
      if (!fc) return;
      const u = (hashStr(S.room + ":" + id + ":" + ev.id) % 1000) / 1000, c = ev.x + (fc / 2) * (u - 0.5);
      out[ev.id] = [r3(Math.max(1 - fc, c - fc / 2)), r3(Math.min(1 + fc, c + fc / 2))];
    });
    return out;
  }
  function groupParts(c) {
    const p = k => KCP.ECON_DATA.params[k].v, clamp = x => Math.max(0, Math.min(100, x));
    return Object.assign({}, c.lagL, { A: c.A, out: clamp(100 * (c.out - p("outMin")) / (p("outMax") - p("outMin"))), taxI: clamp(p("taxBase") - p("taxPoints") * c.policy.taxInd), ren: clamp(100 * c.renS / p("reTarget")), co2: clamp(100 * Math.exp(-(c.co2pc || 0) / p("scoreCo2Ref"))) });
  }
  // 경제 요약(도시마다 주민·산업·현금·지지율·정책·집단 만족 + 국제 지수 + 진행 중 기업 제안 + 시간 기록)
  function econView(S) {
    const E = S.econ;
    if (!E) return null;
    const cities = {};
    E.order.forEach(id => {
      const c = E.cities[id];
      cities[id] = { name: c.name, pop: c.pop, ind: c.ind, pop0: c.pop0, ind0: c.ind0, cash: r2(c.cash), debtCap: c.debtCap, co2pc: c.co2pc, unsS: c.unsS, approval: c.approval, approval0: c.approval0, L: Math.round(c.L), A: Math.round(c.A), policy: S.teams[id].econPol || c.policy, groups: Object.fromEntries(Object.keys(c.groups).map(g => [g, c.groups[g].sat])), groupParts: groupParts(c), shares: Object.fromEntries(Object.keys(c.groups).map(g => [g, c.groups[g].share])), lagL: c.lagL, lagA: c.lagA, hist: (c.hist || []).slice(-36) };
    });
    const report = S.econRep || null;
    return { year: E.year, month: E.month, t: E.t, eduSpeed: KCP.ECON_DATA.params.eduSpeed.v, cities, totals: E.totals, intl: E.intl.cur, intlActive: E.intl.cur?.active || [], offers: E.offers.map(o => Object.assign({}, o, { eval: report && (report.offers || []).find(x => x.id === o.id)?.eval || null })), score: KCP.econ ? KCP.econ.score(E) : null, report, before: S.econBefore || null, previousScore: S.econPreviousScore || null, scoreState: { order: E.order, cities: Object.fromEntries(E.order.map(id => { const c = E.cities[id]; return [id, { name: c.name, pop: c.pop, pop0: c.pop0, ind: c.ind, ind0: c.ind0, cash: c.cash, debtCap: c.debtCap, co2pc: c.co2pc, approval: c.approval, unsS: c.unsS }]; })), totals: E.totals } };
  }
  // 공개 상태: 자리 토큰만 감춘다(누가 자리에 있는지는 보인다).
  function publicView(S, now) {
    const teams = {};
    Object.keys(S.teams).forEach(id => {
      const T = S.teams[id];
      teams[id] = { seated: !!T.token, online: !!T.token && now - T.online < 20000, ready: T.ready, crit: T.crit || null, econPol: T.econPol || null, plan: T.plan, rev: T.rev, price: T.price, budget: budget(S, id), fixed: fixedOf(S, regionOf(S.region), id), base: T.base || [], resp: T.resp || {}, rs: T.rs || null, fcx: fcxOf(S, id), hist: (T.hist || []).slice(-40) };
    });
    // 사건의 실제 크기(x)는 그 라운드 운영이 끝난 뒤에 공개한다 — 계획 때는 예보 범위만.
    const shown = ev => ev.round < S.round || S.phase === "review" || S.phase === "end";
    const events = (S.events || []).map(ev => shown(ev) ? ev : { id: ev.id, round: ev.round });
    // 결과의 경제 보고서는 마지막 것만 싣는다(달 턴이 길어져도 상태가 커지지 않게).
    const results = S.results.map((x, i) => (x.econ && i < S.results.length - 1 ? Object.assign({}, x, { econ: null }) : x));
    return { v: S.v, room: S.room, region: S.region, rounds: S.rounds || null, rev: S.rev, round: S.round, phase: S.phase, ends: S.ends, now, active: activeOf(S), goals: goalsOf(S), teams, ties: S.ties, results, events, econ: econView(S), log: S.log.slice(-12) };
  }

  const canPlan = S => S.phase === "lobby" || S.phase === "plan";
  const err = e => ({ ok: false, err: e });

  // 팀 요청 하나를 반영한다. 반환: {ok, err?, quiet?}  quiet = 공개 상태가 안 바뀜(접속 표시만)
  function reduce(S, m, now, bg) {
    const R = regionOf(S.region);
    if (!m || typeof m !== "object" || !isTeam(R, m.team, S) || typeof m.token !== "string" || m.token.length < 8 || m.token.length > 64) return err("bad");
    const T = S.teams[m.team];
    if (m.type === "claim") {
      if (T.token && T.token !== m.token) return err("taken");
      const fresh = !T.token;
      T.token = m.token; T.online = now;
      if (fresh) { log(S, `${teamDef(R, m.team).name} 팀 입장`, now); S.rev++; }
      return { ok: true, quiet: !fresh };
    }
    if (T.token !== m.token) return err("seat");
    T.online = now;
    if (m.type === "hello") return { ok: true, quiet: true };
    if (m.type === "ready") { T.ready = m.ready === true; S.rev++; return { ok: true }; }
    if (m.type === "price") {
      if (!canPlan(S)) return err("phase");
      T.price = r3(num(m.price, PRICE.min, PRICE.max, PRICE.def)); S.rev++; return { ok: true };
    }
    if (m.type === "plan") {
      if (!canPlan(S)) return err("phase");
      if (!Number.isInteger(m.rev) || m.rev <= T.rev) return { ok: true, quiet: true };
      let plan = m.plan;
      const city = S.econ && S.econ.cities[m.team];
      if (city && city.cash < -city.debtCap) {
        const existing = keysOf(T.plan);
        if ([...keysOf(plan)].some(k => !existing.has(k))) return err("debt:" + m.team);
      }
      if (bg) {
        const over = city && city.cash < -city.debtCap;
        // 한도 초과 때도 기존 설비 유지·철거·정책 변경은 허용한다. 새 자산은 위에서 거부했다.
        const room = over ? capexOf(bg, R, m.team, T.plan || {}) + lossOf(T.base, plan) : budget(S, m.team) - fixedOf(S, R, m.team);
        plan = cleanPlan(bg, R, m.team, plan, room - lossOf(T.base, plan));
        if (capexOf(bg, R, m.team, plan) + lossOf(T.base, plan) > room + 1e-6) return err("budget:" + m.team);
      }
      T.plan = plan; T.rev = m.rev; S.rev++;
      // 진행 기록(교사 화면의 '건설 속도'): 15초 안의 연속 변경은 한 점으로
      if (bg) {
        const pt = { t: now, r: S.round, cap: Math.round(capexOf(bg, R, m.team, plan)), n: plan.builds.length, l: plan.lines.length };
        T.hist = Array.isArray(T.hist) ? T.hist : [];
        const last = T.hist[T.hist.length - 1];
        if (last && now - last.t < 15000 && last.r === pt.r) T.hist[T.hist.length - 1] = pt; else T.hist.push(pt);
        if (T.hist.length > 60) T.hist.splice(0, T.hist.length - 60);
      }
      return { ok: true };
    }
    // D-59: 허용 목록으로 새 객체를 만든다. 이유·일지 등 자유 서술은 복사하지 않는다.
    if (m.type === "crit") {
      if (!S.econ || S.phase !== "plan") return err("phase");
      const keys = Object.keys(KCP.ECON_DATA.params.wScore.v);
      if (!Array.isArray(m.chips) || m.chips.length < 1 || m.chips.length > 2 || new Set(m.chips).size !== m.chips.length || m.chips.some(k => !keys.includes(k)) || typeof m.line !== "number" || !Number.isFinite(m.line) || m.line < 0 || m.line > 100 || !["keep", "change"].includes(m.choice)) return err("crit");
      T.crit = { chips: m.chips.slice(), line: m.line, choice: m.choice };
      S.rev++; return { ok: true };
    }
    if (m.type === "econ") {
      if (!S.econ || !canPlan(S)) return err("phase");
      const st = x => Math.max(-2, Math.min(2, Math.round(num(x, -2, 2, 0))));
      const P0 = T.econPol || {}, P1 = { taxRes: st(m.taxRes), taxInd: st(m.taxInd), service: st(m.service), incentive: r2(num(m.incentive, 0, 20, 0)) };
      if (JSON.stringify(P0) === JSON.stringify(P1)) return { ok: true, quiet: true };
      T.econPol = P1; S.rev++; return { ok: true };
    }
    if (m.type === "respond") {
      if (S.phase !== "plan") return err("phase");
      const ev = (S.events || []).find(x => x.round === S.round && x.id === m.ev), E = ev && eventDef(R, ev.id);
      if (!E || !hits(R, E, m.team)) return err("noev");
      const key = S.round + ":" + E.id, prev = T.resp ? T.resp[key] : undefined;
      if (m.opt !== "none" && !(Array.isArray(E.opts) && E.opts.some(o => o.id === m.opt))) return err("noopt");
      T.resp = T.resp || {};
      if (m.opt === "none") delete T.resp[key]; else T.resp[key] = m.opt;
      if (prev === T.resp[key]) return { ok: true, quiet: true };
      const used = bg && T.plan ? spendOf(bg, S, R, m.team, T.plan) : fixedOf(S, R, m.team);
      const city = S.econ && S.econ.cities[m.team], over = city && city.cash < -city.debtCap;
      const cost = m.opt === "none" ? 0 : E.opts.find(o => o.id === m.opt).cost || 0;
      // ECON-BALANCE v1.3: 한도 초과라도 무비용 대응은 허용하고 유료 대응은 막는다.
      if (over ? cost > 0 : used > budget(S, m.team) + 1e-6) { if (prev) T.resp[key] = prev; else delete T.resp[key]; return err("budget:" + m.team); }
      log(S, `${teamDef(R, m.team).name}: ${E.name} — ${m.opt === "none" ? "대응 안 함" : E.opts.find(o => o.id === m.opt).name}`, now);
      S.rev++; return { ok: true };
    }
    if (m.type === "tie") {
      if (!canPlan(S)) return err("phase");
      const D = tieDef(R, m.team, m.other);
      if (!D || !Object.hasOwn(S.teams, m.other)) return err("notie");
      let X = S.ties.find(x => x.a === D.a && x.b === D.b);
      if (m.op === "propose") {
        const cap = m.cap === 4 ? 4 : 2;
        if (X && X.st === "built") return err("built");
        if (!X) { X = { a: D.a, b: D.b, cap, st: "prop", by: m.team, round: S.round }; S.ties.push(X); }
        else { X.cap = cap; X.by = m.team; }
        log(S, `${teamDef(R, m.team).name} → ${teamDef(R, m.other).name} 연계선 ${cap} MW 제안`, now);
        S.rev++; return { ok: true };
      }
      if (m.op === "accept") {
        if (!X || X.st !== "prop" || X.by === m.team) return err("noprop");
        const half = tieCost(R, X) / 2;
        for (const id of [X.a, X.b]) {
          const city = S.econ && S.econ.cities[id];
          if (city && city.cash < -city.debtCap) return err("debt:" + id);
          const used = bg && S.teams[id].plan ? spendOf(bg, S, R, id, S.teams[id].plan) : fixedOf(S, R, id);
          if (budget(S, id) - half < used - 1e-9) return err("budget:" + id);
        }
        X.st = "built"; X.round = S.round;
        log(S, `${teamDef(R, X.a).name}–${teamDef(R, X.b).name} 연계선 ${X.cap} MW 연결(각 ${r2(half)}억)`, now);
        S.rev++; return { ok: true };
      }
      if (m.op === "cancel") {
        if (!X || X.st !== "prop") return err("noprop");
        S.ties.splice(S.ties.indexOf(X), 1);
        log(S, `${teamDef(R, m.team).name}: ${teamDef(R, m.other).name} 연계선 ${X.by === m.team ? "제안 거둠" : "제안 거절"}`, now);
        S.rev++; return { ok: true };
      }
      return err("op");
    }
    return err("type");
  }

  // 진행자만 하는 일
  function host(S, op, now, arg) {
    const R = regionOf(S.region);
    if (op === "kick" && isTeam(R, arg, S)) { S.teams[arg].token = null; S.teams[arg].ready = false; log(S, `${teamDef(R, arg).name} 자리 비움`, now); S.rev++; return true; }
    if (op === "extend" && S.ends) { S.ends += 60000; S.rev++; return true; }
    if (op === "next") {
      if (S.phase === "lobby" || S.phase === "review") {
        if (S.round >= roundsOf(S).length) { S.phase = "end"; S.ends = null; log(S, "리그 끝", now); S.rev++; return true; }
        S.round++; S.phase = "plan"; S.ends = now + PLAN_MS;
        Object.values(S.teams).forEach(T => { T.ready = false; });
        log(S, `${S.round}라운드 계획 시작`, now);
        drawEvents(S, R).forEach(E => log(S, `사건: ${E.name}`, now));
        S.rev++; return true;
      }
      return false;
    }
    return false;
  }

  /* ---------- 라운드 이벤트(계절 사건) ---------- */
  // R.events: {id, name, seasons, weight, scope: region | team:<id> | kind:coastal|industrial|coal, effect:{...}, text, why, sources}
  // 라운드가 시작될 때 진행자가 1개(40%는 2개)를 뽑아 계획 단계부터 알린다 — 대비할 시간을 준다.
  function hashStr(x) { let h = 2166136261; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function packHas(R, id, what) {
    const P = packOf(R, id);
    if (!P) return false;
    if (what === "coastal") return !!P.fitSea;
    if (what === "industrial") return P.sites.some(s => s.kind === "factory_big");
    if (what === "coal") return P.sites.some(s => s.fuel === "coal");
    return false;
  }
  function hits(R, E, id) {
    const sc = E.scope || "region";
    if (sc === "region") return true;
    if (sc.startsWith("team:")) return sc.slice(5) === id;
    if (sc === "kind:metro_south") return (teamDef(R, id) || {}).prov === "경기";
    if (sc === "kind:chungcheong") return (teamDef(R, id) || {}).prov === "충남";
    if (sc === "kind:inland") return !packHas(R, id, "coastal");
    if (sc.startsWith("kind:")) return packHas(R, id, sc.slice(5));
    return false;
  }
  const MUL = ["demandMul", "solarMul", "windMul", "offshoreMul", "tidalMul", "coalCapMul", "lngCapMul"];
  const eventDef = (R, id) => (R.events || []).find(E => E.id === id) || null;
  function drawEvents(S, R) {
    const rd = roundsOf(S)[S.round - 1], act = activeOf(S);
    const pool = (R.events || []).filter(E => (!S.rounds || !(S.events || []).some(ev => ev.round === S.round - 1 && ev.id === E.id)) && (E.seasons || []).includes(rd.season) && act.some(id => hits(R, E, id)) && !(E.effect && E.effect.tieDown && !S.ties.some(T => T.st === "built")));
    const rnd = rng(hashStr(S.room + ":" + S.round)), out = [];
    const pick = () => { const list = pool.filter(E => !out.includes(E)), w = list.reduce((a, E) => a + (E.weight || 1), 0); let u = rnd() * w; for (const E of list) { u -= E.weight || 1; if (u <= 0) return E; } return list[list.length - 1]; };
    if (S.rounds) {
      if (pool.length && rnd() < KCP.ECON_DATA.params.monthEventP.v) out.push(pick());
    } else {
      if (pool.length) out.push(pick());
      if (pool.length > 1 && rnd() < 0.4) out.push(pick());
    }
    // 예보는 범위(fc)로만 알린다. 실제 크기 x(1 ± fc)는 지금 정해 두고 운영이 끝나야 공개한다(같은 방·라운드면 같은 값).
    S.events = (S.events || []).filter(x => x.round !== S.round).concat(out.map(E => ({ id: E.id, round: S.round, x: r3(1 + (E.fc || 0) * (2 * rnd() - 1)) })));
    return out;
  }
  // 이번 라운드에 팀 id에 걸리는 배수 모음
  function modsFor(S, R, id) {
    const M = {}, tech = techOf(S, id);
    if (tech.length) M.tech = tech;
    // 경제 모드: 주민·산업 규모만큼 수요, 국제 연료 가격만큼 연료비
    if (S.econ && S.econ.cities[id] && KCP.econ) {
      const dm = KCP.econ.demandMul(S.econ.cities[id]), I = S.econ.intl && S.econ.intl.cur;
      if (Math.abs(dm.res - 1) > 1e-3) M.demandRes = dm.res;
      if (Math.abs(dm.ind - 1) > 1e-3) M.demandInd = dm.ind;
      if (I && Math.abs(I.fuelMul - 1) > 1e-3) M.fuelMul = { lng: I.fuelMul, diesel: I.fuelMul, coal: r3(Math.sqrt(I.fuelMul)) };
    }
    (S.events || []).filter(x => x.round === S.round).forEach(ev => {
      const E = eventDef(R, ev.id);
      if (!E || !hits(R, E, id)) return;
      const f = E.effect || {}, o = respOpt(R, S, id, ev), x = typeof ev.x === "number" ? ev.x : 1;
      // 크기 = 1 + (기본 배수 − 1) × 실제 크기 x × 대응 배수(dev, knobs가 있으면 그 손잡이만)
      MUL.forEach(k => {
        if (typeof f[k] !== "number") return;
        const dv = o && typeof o.dev === "number" && (!o.knobs || o.knobs.includes(k)) ? o.dev : 1;
        M[k] = (M[k] == null ? 1 : M[k]) * Math.max(0, 1 + (f[k] - 1) * x * dv);
      });
      if (Array.isArray(f.hours)) M.demandHours = f.hours;
      if (f.carbonTaxOn) M.tax = true;
    });
    return M;
  }
  function tieMods(S, R) {
    let mul = 1; const down = [];
    (S.events || []).filter(x => x.round === S.round).forEach(ev => {
      const E = eventDef(R, ev.id);
      if (!E) return;
      const f = E.effect || {};
      if (typeof f.tieCapMul === "number") mul *= f.tieCapMul;
      if (!f.tieDown) return;
      // 선 양 끝 도시(지정 없으면 사건이 걸린 아무 도시) 중 하나라도 '보강·협의'를 골랐으면 고장 나지 않는다.
      const ends = typeof f.tieDown === "string" ? f.tieDown.split("~") : activeOf(S).filter(id => hits(R, E, id));
      if (ends.some(id => { const o = respOpt(R, S, id, ev); return o && o.cancel; })) return;
      down.push(typeof f.tieDown === "string" ? f.tieDown : "*");
    });
    return { mul, down };
  }

  /* ---------- 도시 하나 돌리기와 정산 ---------- */
  function withPack(bg, R, id, fn) {
    const t = teamDef(R, id);
    bg.selectPack(t.pack, "league");
    return fn();
  }
  function cleanPlan(bg, R, id, plan, cap) {
    return withPack(bg, R, id, () => {
      const st = bg.sanitize(plan, cap);
      return { builds: st.builds, lines: st.lines, policies: st.policies, shed: st.shed, fab2: st.fab2, seed: st.seed, season: st.season, missions: st.missions, rq: st.rq };
    });
  }
  function capexOf(bg, R, id, plan) { return withPack(bg, R, id, () => bg.capex(bg.sanitize(plan, 1e9))); }

  // 팀 도시 하나를 고립 운전한다. 반환: 정산에 쓸 시간별 자료와 자체 지표.
  function simTeam(bg, R, id, plan, rnd, cap, mods) {
    return withPack(bg, R, id, () => {
      const st = bg.sanitize(plan || {}, cap);
      st.season = rnd.season;
      st.seed = rnd.seed;
      if (mods && mods.tax && !st.policies.includes("tax")) st.policies.push("tax");
      const res = bg.simulate(st, rnd.days, { league: true, mods: mods && Object.keys(mods).length ? mods : null });
      const H = res.H, NT = res.NT, uns = new Float32Array(H);
      for (let k = 0; k < H; k++) { let s = 0; for (let ti = 0; ti < NT; ti++) s += res.hrUns[k * NT + ti]; uns[k] = s; }
      // 최대 수요 시각에 계통 접속된 잉여 재생 + 추가 화력 출력에서 미공급 수요를 뺀다.
      // gx는 build.simulate가 연계 정산용으로 내보내는 시간별 여유 능력이다.
      let peak = 0;
      for (let k = 1; k < H; k++) if (res.hrDem[k] > res.hrDem[peak]) peak = k;
      const spareMW = res.gx ? Math.max(0, res.gx.reduce((a, g) => a + g.ren[peak] + g.head[peak], 0) - uns[peak]) : null;
      return {
        spareMW, H, dem: res.hrDem, uns, gx: res.gx || [], hosp: res.hrHosp,
        k: {
          dem: res.tot.dem, uns: res.unsTotal, hospH: res.hospH || 0, capex: res.cost.capex, fuel: res.cost.fuel, policy: res.cost.policy,
          co2: res.co2, sat: Math.min(...res.sat), curt: res.tot.curt, ren: res.tot.ren + res.tot.batOut, by: res.tot.by, cp: res.cp.issues
        }
      };
    });
  }

  // ties: [{id, a, b, cap}] (지어진 것), sims: {id: simTeam 결과}, price: {id: 억/MWh}
  // 시간마다 두 번 산다: ① 모자란 만큼(정전 막기) ② 이웃 단가가 우리 화력 연료비보다 싸면 그 화력을 줄이고 사 온다(대체).
  function settle(ties, sims, price, H, days) {
    const out = {}, flow = {};
    Object.keys(sims).forEach(id => {
      out[id] = { imp: 0, exp: 0, pay: 0, earn: 0, fuelX: 0, co2X: 0, co2In: 0, curtX: 0, sub: 0, saveFuel: 0, saveCo2: 0, del: new Float32Array(H), unlinked: [] };
    });
    const gate = (id, other) => (sims[id] ? sims[id].gx.find(g => g.to.includes(other)) : null);
    const usable = [];
    ties.forEach(T => {
      flow[T.id] = { ab: 0, ba: 0, day: new Array(days).fill(0) };
      const ga = gate(T.a, T.b), gb = gate(T.b, T.a);
      if (!ga && out[T.a]) out[T.a].unlinked.push(T.b);
      if (!gb && out[T.b]) out[T.b].unlinked.push(T.a);
      if (ga && gb) usable.push({ T, ga, gb });
    });
    const left = new Map();
    for (let k = 0; k < H; k++) {
      left.clear();
      const offers = [];
      usable.forEach(U => {
        [U.ga, U.gb].forEach(g => { if (!left.has(g)) left.set(g, { def: g.def[k], ren: g.ren[k], head: g.head[k], disp: g.disp ? g.disp[k] : 0, dmc: g.dmc ? g.dmc[k] : 0, dco2: g.dco2 ? g.dco2[k] : 0 }); });
        U.capLeft = U.T.cap;
        // 팔 쪽 → 살 쪽, 종류(재생·버릴 전력 0 · 화력 여유 1), 단가
        [[U.T.a, U.ga, U.T.b, U.gb, 1], [U.T.b, U.gb, U.T.a, U.ga, -1]].forEach(([s, gs, b, gbuy, dir]) => {
          offers.push({ U, s, gs, b, gbuy, dir, kind: 0, p: price[s] });
          if (price[s] >= gs.mc - 1e-12) offers.push({ U, s, gs, b, gbuy, dir, kind: 1, p: price[s] });
        });
      });
      offers.sort((x, y) => (x.kind - y.kind) || (x.p - y.p));
      for (const mode of ["def", "disp"]) {
        for (const o of offers) {
          const S = left.get(o.gs), B = left.get(o.gbuy);
          if (o.U.capLeft <= 1e-6) continue;
          const need = mode === "def" ? B.def : (o.p < B.dmc - 1e-12 ? B.disp : 0);
          if (need <= 1e-6) continue;
          const have = o.kind === 0 ? S.ren : S.head;
          if (have <= 1e-6) continue;
          const sent = Math.min(have, o.U.capLeft, need / (1 - TIE_LOSS)), got = sent * (1 - TIE_LOSS);
          if (o.kind === 0) S.ren -= sent; else S.head -= sent;
          o.U.capLeft -= sent;
          const so = out[o.s], bo = out[o.b];
          if (mode === "def") { B.def -= got; bo.del[k] += got; }
          else { B.disp -= got; bo.sub += got; bo.saveFuel += got * B.dmc; bo.saveCo2 += got * B.dco2; }
          so.exp += sent; so.earn += got * o.p; bo.imp += got; bo.pay += got * o.p;
          if (o.kind === 1) { so.fuelX += sent * o.gs.mc; so.co2X += sent * o.gs.co2i; bo.co2In += got * o.gs.co2i; }
          else so.curtX += sent;
          const F = flow[o.U.T.id];
          if (o.dir > 0) F.ab += got; else F.ba += got;
          F.day[Math.floor(k / 24)] += o.dir * got;
        }
      }
    }
    Object.values(flow).forEach(F => { F.ab = r2(F.ab); F.ba = r2(F.ba); F.day = F.day.map(r2); });
    return { out, flow };
  }

  // 라운드 하나를 돌려 결과를 state.results에 붙인다.
  function runRound(S, bg) {
    const R = regionOf(S.region), rd = roundsOf(S)[S.round - 1];
    const rnd = { season: rd.season, days: rd.days, seed: 7000 + S.round * 13 };
    const sims = {}, price = {};
    const act = R.teams.filter(t => Object.hasOwn(S.teams, t.id));
    act.forEach(t => {
      const T = S.teams[t.id];
      // 이미 승인된 설비는 운영 적자로 지방채 한도를 넘더라도 사라지지 않는다.
      const cap = S.econ ? Math.max(budget(S, t.id), capexOf(bg, R, t.id, T.plan || {})) : budget(S, t.id);
      sims[t.id] = simTeam(bg, R, t.id, T.plan, rnd, cap, modsFor(S, R, t.id));
      price[t.id] = T.price;
    });
    const H = rnd.days * 24;
    // 이벤트: 연계선 용량 배수, 고장 난 선 하나(지정 없으면 지어진 선 중 하나를 같은 씨앗으로)
    const TM = tieMods(S, R);
    let built = S.ties.filter(T => T.st === "built").map(T => ({ id: tieId(T), a: T.a, b: T.b, cap: T.cap * TM.mul }));
    if (TM.down.length && built.length) {
      const named = TM.down.filter(x => x !== "*");
      const victim = named.find(x => built.some(T => T.id === x || T.id === x.split("~").reverse().join("~"))) || built[hashStr(S.room + S.round) % built.length].id;
      built = built.filter(T => T.id !== victim && T.id !== victim.split("~").reverse().join("~"));
      rnd.tieDown = victim;
    }
    const { out, flow } = settle(built, sims, price, H, rnd.days);
    const team = {};
    let rDem = 0, rUns = 0, rCo2 = 0;
    act.forEach(t => {
      const s = sims[t.id], o = out[t.id], K = s.k;
      let outH = 0, hospH = 0;
      for (let k = 0; k < H; k++) {
        const rem = s.uns[k] - o.del[k];
        if (rem > Math.max(0.005, 0.02 * s.dem[k])) outH++;
        if (s.hosp && s.hosp[k] && rem > 1e-4) hospH++;
      }
      const uns = Math.max(0, K.uns - (o.imp - o.sub));
      const tie = tieShare(S, R, t.id), Tm = S.teams[t.id], loss = r2((Tm.sunk || 0) + lossOf(Tm.base, Tm.plan));
      // 현금 흐름: 이번 라운드 새 투자(누적 투자 − 지난 라운드까지) + 이번 라운드 운영비. 라운드를 더해도 건설비가 두 번 세지지 않는다.
      const rfix = r2(Tm.rfix || 0), stock = r2(K.capex + tie + loss + rfix), resp = respCost(S, R, t.id, S.round);
      const labs = ((Tm.plan && Tm.plan.builds) || []).filter(b => b.t === "lab").length, research = bg.RS ? labs * bg.RS.labOpexR : 0;
      const cost = { capex: r2(K.capex), ties: r2(tie), loss, rfix, stock, inv: r2(stock - (Tm.stock || 0)), fuel: r2(K.fuel + o.fuelX - o.saveFuel), policy: r2(K.policy), resp, research, trade: r2(o.pay - o.earn) };
      cost.opex = r2(cost.fuel + cost.policy + cost.resp + cost.research + cost.trade);
      cost.total = r2(cost.inv + cost.opex);
      const co2Prod = K.co2 + o.co2X - o.saveCo2, co2Cons = co2Prod - o.co2X + o.co2In;
      team[t.id] = {
        spareMW: s.spareMW, dem: r2(K.dem), uns: r2(uns), unsPct: r2(100 * uns / Math.max(1e-9, K.dem)), outH, hospH,
        cost, co2Prod: Math.round(co2Prod), co2Cons: Math.round(co2Cons), imp: r2(o.imp), sub: r2(o.sub), exp: r2(o.exp), earn: r2(o.earn), pay: r2(o.pay),
        sat: K.sat, cp: K.cp, curt: r2(Math.max(0, K.curt - o.curtX)), renPct: Math.round(100 * Math.min(1, K.ren / Math.max(1e-9, K.dem))),
        unlinked: o.unlinked, isolated: { uns: r2(K.uns), co2: Math.round(K.co2) }
      };
      rDem += K.dem; rUns += uns; rCo2 += co2Prod;
    });
    const region = { dem: r2(rDem), uns: r2(rUns), unsPct: r2(100 * rUns / Math.max(1e-9, rDem)), co2: Math.round(rCo2) };
    const G = goalsOf(S);
    region.ok = { uns: region.unsPct <= G.unsPct, co2: region.co2 <= G.co2 };
    const result = { round: S.round, month: rd.month || null, year: rd.year || null, season: rd.season, days: rd.days, seed: rnd.seed, team, region, flow, events: (S.events || []).filter(x => x.round === S.round).map(x => x.id), tieDown: rnd.tieDown || null };
    S.results = S.results.filter(x => x.round !== S.round).concat([result]);
    return result;
  }

  // 운영 단계: 진행자 기기에서 바로 돌리고 결과 단계로.
  function run(S, bg, now) {
    if (S.phase !== "plan") return null;
    S.phase = "run"; S.ends = null;
    const res = runRound(S, bg);
    // 운영한 것은 이제 '지난 라운드 것' — 철거하면 손실. 누적 투자도 확정.
    const R = regionOf(S.region);
    Object.keys(res.team).forEach(id => {
      const T = S.teams[id];
      if (bg.TECHS) {
        const before = T.rfix || 0;
        advanceResearch(bg, R, S, id, now);
        // 이번 라운드에 들어간 실증비는 이번 라운드 새 투자로 센다.
        const add = r2((T.rfix || 0) - before), c = res.team[id].cost;
        if (add) { c.rfix = r2(c.rfix + add); c.stock = r2(c.stock + add); c.inv = r2(c.inv + add); c.total = r2(c.inv + c.opex); }
      }
      T.sunk = r2((T.sunk || 0) + lossOf(T.base, T.plan));
      T.base = T.plan ? itemCosts(bg, R, id, T.plan) : [];
      T.stock = res.team[id].cost.stock;
    });
    if (S.econ && KCP.econ) econMonth(S, R, bg, res);
    S.phase = "review"; S.ends = now + REVIEW_MS;
    log(S, `${S.round}라운드 운영 끝 · 지역 정전 ${res.region.unsPct}% · CO₂ ${res.region.co2} t`, now);
    S.rev++;
    return res;
  }

  /* ---------- 경제 한 달(ui/econ.js) ---------- */
  // 대표 7일 결과를 그 달 일수로 늘려 econ 입력으로 넘긴다. 첫 달에는 '새 건설 없는 시작 지도'로 기준을 잡는다(지도마다 원래 있던 차이로 이주가 생기지 않게).
  function econInput(S, R, id, r, wk, extra) {
    const c = r.cost, served = Math.max(0, r.dem - (r.uns == null ? r.dem * r.unsPct / 100 : r.uns)), plan = S.teams[id].plan || { builds: [] }, n = t => (plan.builds || []).filter(b => b.t === t).length;
    return {
      energy: { unsPct: r.unsPct, hospH: r.hospH * wk, costPerMWh: served > 0 ? (Math.max(0, c.fuel - (r.exportFuel || 0)) + c.policy + r.pay) / served : 0, co2Local: r.co2Prod * wk, co2: r.co2Cons * wk, renPct: r.renPct,
        tradeNet: r2((r.earn - r.pay) * wk), opex: r2(Math.max(0, (c.fuel + c.policy) * wk + (c.resp || 0) + (c.research || 0))), capexNew: Math.max(0, c.inv || 0), demMWh: r.dem * wk, servedMWh: served * wk, buyCost: r.pay * wk, spareMW: r.spareMW,
        bonus: bonusOf(S, R, id, S.round), salvage: Math.max(0, -(c.inv || 0)) },
      policy: S.teams[id].econPol || {},
      assets: Object.assign({ uni: n("uni"), lab: n("lab") }, extra || {})
    };
  }
  function econMonth(S, R, bg, res) {
    const rd = roundsOf(S)[S.round - 1], wk = (rd && rd.mdays ? rd.mdays : 30) / 7, ids = Object.keys(res.team);
    if (S.econ.t >= S.econ.len) return;
    // runRound의 공개 결과에는 판매용 연료와 시간별 거래가 없다.
    // 같은 씨앗·계획·운영 배수로 정산을 재현한다. 계절 모드는 이 경로에 들어오지 않는다.
    const sims = {}, price = {}, rnd = { season: res.season, days: res.days, seed: res.seed };
    ids.forEach(id => {
      const plan = S.teams[id].plan || {};
      sims[id] = simTeam(bg, R, id, plan, rnd, Math.max(budget(S, id), capexOf(bg, R, id, plan)), modsFor(S, R, id));
      price[id] = S.teams[id].price;
    });
    const tm = tieMods(S, R), ties = S.ties.filter(t => t.st === "built" && tieId(t) !== res.tieDown && tieId(t).split("~").reverse().join("~") !== res.tieDown)
      .map(t => ({ id: tieId(t), a: t.a, b: t.b, cap: t.cap * tm.mul }));
    const settled = settle(ties, sims, price, res.days * 24, res.days);
    ids.forEach(id => {
      const s = sims[id], r = res.team[id];
      r.exportFuel = settled.out[id].fuelX;
      let peak = 0;
      for (let k = 1; k < s.H; k++) if (s.dem[k] > s.dem[peak]) peak = k;
      // 해당 시각만 재정산해 판매에 쓴 여유를 뺀다. 미접속 망의 부족은 섞지 않는다.
      const slice = {};
      ids.forEach(cid => { slice[cid] = { gx: sims[cid].gx.map(g => Object.assign({}, g,
        Object.fromEntries(["def", "ren", "head", "disp", "dmc", "dco2"].map(key => [key, [g[key] ? g[key][peak] : 0]])))) }; });
      const atPeak = settle(ties, slice, price, 1, 1).out[id];
      // 추가 화력 출력만 인정하고, 재생 판매도 전부 차감하는 보수적 하한이다.
      r.spareMW = Math.max(0, s.gx.reduce((a, g) => a + Math.max(0, g.head[peak] - g.def[peak]), 0) - atPeak.exp);
    });
    if (!S.econCal) {
      // 기준 = '전기가 정상으로 들어오는 보통 도시'(정전 0, 지역 평균 수준의 값). 게임은 빈 지도에서 시작하지만
      // 실제 도시는 이미 전기를 쓰고 있으므로, 빈 지도의 정전을 '평상시'로 삼지 않는다. 이후 달라진 만큼 사람이 움직인다.
      const base = {};
      ids.forEach(id => {
        const r = res.team[id], dem = Math.max(1e-9, r.dem);
        const P = KCP.ECON_DATA.params;
        base[id] = { energy: { unsPct: 0, hospH: 0, costPerMWh: P.normalCost.v, opex: P.normalCost.v * dem * wk, co2Local: P.normalCo2.v * dem * wk, co2: P.normalCo2.v * dem * wk, renPct: P.normalRen.v, demMWh: dem * wk }, policy: {}, assets: {} };
      });
      S.econ = KCP.econ.calibrate(S.econ, base);
      S.econCal = true;
    }
    const inputs = {};
    ids.forEach(id => { inputs[id] = econInput(S, R, id, res.team[id], wk); });
    // 화면 원인 설명용 직전 값. 학생 자유 서술은 포함하지 않는다.
    S.econPreviousScore = KCP.econ.score(S.econ);
    S.econBefore = Object.fromEntries(ids.map(id => {
      const c = S.econ.cities[id];
      return [id, { pop: c.pop, ind: c.ind, cash: c.cash, approval: c.approval, groups: Object.fromEntries(Object.keys(c.groups).map(g => [g, c.groups[g].sat])), lagL: Object.assign({}, c.lagL), groupParts: groupParts(c) }];
    }));
    const out = KCP.econ.monthStep(S.econ, inputs);
    S.econ = out.E;
    // 투자 기준만 확정한다. 지원금·철거 회수는 monthStep 보고서에서 이미 정산했다.
    ids.forEach(id => {
      const T = S.teams[id];
      T.committed = r2(capexOf(bg, R, id, T.plan || {}) + fixedOf(S, R, id));
      T.tieAt = tieShare(S, R, id);
    });
    const rep = out.report;
    if (!rep) return;
    // 기업 이전 희망: 마지막 달까지 조건(재생 %·정전·구직 인력)을 맞춘 도시 가운데 산업 매력이 가장 큰 곳으로 정한다.
    (rep.offers || []).forEach(o => {
      if (rep.t < o.until - 1 || !o.eval) return;
      const best = o.eval.rank.find(id => o.eval.by[id] && o.eval.by[id].ok);
      if (!best) { rep.news.push(`${o.name}: 조건을 맞춘 도시가 없어 이전 무산`); return; }
      const r = KCP.econ.acceptOffer(S.econ, o.id, best);
      if (r.ok) { S.econ = r.E; rep.news.push(r.news); }
    });
    res.econ = rep;
    S.econRep = rep;
    rep.news.slice(0, 3).forEach(t => log(S, t, 0));
  }

  // 혼자 하기에서도 컴퓨터 요청을 사람과 같은 reduce 경로로 검사한다.
  function computerPlans(S, bg, player, style, repliesOnly) {
    if (S.phase !== "plan" || !KCP.leagueAI || typeof KCP.leagueAI.plan !== "function") return [];
    const R = regionOf(S.region), answers = [];
    activeOf(S).filter(id => id !== player).forEach(id => {
      const T = S.teams[id], result = KCP.leagueAI.plan(S, R, id, bg, style);
      if (!result) return;
      const apply = (type, extra) => { const r = reduce(S, Object.assign({ type, team: id, token: T.token }, extra), 0, bg); answers.push({ id, type, ok: r.ok, err: r.err }); };
      if (!repliesOnly) {
        if (result.plan) apply("plan", { rev: T.rev + 1, plan: result.plan });
        if (result.econPol) apply("econ", result.econPol);
      }
      (result.ties || []).forEach(tie => { if (!repliesOnly || tie.type !== "propose") apply("tie", { op: tie.type, other: tie.other, cap: tie.cap }); });
      apply("ready", { ready: true });
    });
    return answers;
  }

  KCP.leagueCore = {
    econView, computerPlans, eventDef, modsFor, hits, drawEvents, roundsOf, monthRounds, SEASON_OF_MONTH,
    PHASES, PRICE, TIE_LOSS, regionOf, teamDef, tieDef, tieId, validTeams, activeOf, goalsOf, newState, publicView, reduce, host, run, runRound, settle, simTeam,
    budget, tieCost, tieShare, cleanPlan, capexOf,
    SALV, MUL, itemKey, lossOf, itemCosts, respCost, bonusOf, fixedOf, spendOf, techOf, econInput
  };
})();
