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
  const activeOf = S => (Array.isArray(S.active) && S.active.length ? S.active : Object.keys(S.teams));
  function newState(room, regionId, now, list) {
    const R = regionOf(regionId);
    if (!R) throw new Error("region");
    const V = validTeams(R, list || ALL(R));
    if (!V.ok) throw new Error(V.err);
    const teams = {};
    V.ids.forEach(id => { teams[id] = { token: null, online: 0, ready: false, plan: null, rev: 0, price: PRICE.def, hist: [] }; });
    // 지역 CO₂ 목표는 고른 도시의 실제 사용량 몫만큼(6곳 = R.goals.co2)
    const tw = id => (teamDef(R, id).real || { twh: 1 }).twh, share = V.ids.reduce((a, id) => a + tw(id), 0) / ALL(R).reduce((a, id) => a + tw(id), 0);
    const goals = { unsPct: R.goals.unsPct, co2: Math.round(R.goals.co2 * share / 10) * 10 };
    return { v: 2, room, region: R.id, created: now || 0, rev: 1, round: 0, phase: "lobby", ends: null, active: V.ids, goals, teams, ties: [], results: [], events: [], log: [] };
  }

  function log(S, text, now) { S.log.push({ at: now || 0, t: String(text).slice(0, 120) }); if (S.log.length > LOG_MAX) S.log.splice(0, S.log.length - LOG_MAX); }

  // 팀 예산: 처음 예산에서 라운드마다 25%씩 투자금이 더 들어온다. 연계선 몫은 빠진다.
  function packOf(R, id) { const t = teamDef(R, id); return t && KCP.BUILD_MAPS ? KCP.BUILD_MAPS[t.pack] : null; }
  function baseBudget(R, id) { const P = packOf(R, id); return P ? P.budget || 200 : 200; }
  function tieCost(R, T) { const D = tieDef(R, T.a, T.b); return D ? r2(D.cost * (T.cap === 4 ? 1.6 : 1)) : 0; }
  function tieShare(S, R, id) { return S.ties.filter(T => T.st === "built" && (T.a === id || T.b === id)).reduce((a, T) => a + tieCost(R, T) / 2, 0); }
  function budget(S, id) {
    const R = regionOf(S.region);
    return r2(baseBudget(R, id) * (1 + GROW * Math.max(0, S.round - 1)) - tieShare(S, R, id) + ((S.bonus && S.bonus[id]) || 0));
  }

  const goalsOf = S => S.goals || regionOf(S.region).goals;
  // 공개 상태: 자리 토큰만 감춘다(누가 자리에 있는지는 보인다).
  function publicView(S, now) {
    const teams = {};
    Object.keys(S.teams).forEach(id => {
      const T = S.teams[id];
      teams[id] = { seated: !!T.token, online: !!T.token && now - T.online < 20000, ready: T.ready, plan: T.plan, rev: T.rev, price: T.price, budget: budget(S, id), hist: (T.hist || []).slice(-40) };
    });
    return { v: S.v, room: S.room, region: S.region, rev: S.rev, round: S.round, phase: S.phase, ends: S.ends, now, active: activeOf(S), goals: goalsOf(S), teams, ties: S.ties, results: S.results, events: S.events || [], log: S.log.slice(-12) };
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
      if (bg) plan = cleanPlan(bg, R, m.team, plan, budget(S, m.team));
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
          const used = bg && S.teams[id].plan ? capexOf(bg, R, id, S.teams[id].plan) : 0;
          if (budget(S, id) - half < used - 1e-9) return err("budget:" + id);
        }
        X.st = "built"; X.round = S.round;
        log(S, `${teamDef(R, X.a).name}–${teamDef(R, X.b).name} 연계선 ${X.cap} MW 연결(각 ${r2(half)}억)`, now);
        S.rev++; return { ok: true };
      }
      if (m.op === "cancel") {
        if (!X || X.st !== "prop") return err("noprop");
        S.ties.splice(S.ties.indexOf(X), 1);
        log(S, `${teamDef(R, m.team).name}: ${teamDef(R, m.other).name} 연계선 제안 거둠`, now);
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
        if (S.round >= R.rounds.length) { S.phase = "end"; S.ends = null; log(S, "리그 끝", now); S.rev++; return true; }
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
  const eventDef = (R, id) => (R.events || []).find(E => E.id === id) || null;
  function drawEvents(S, R) {
    const rd = R.rounds[S.round - 1], act = activeOf(S);
    const pool = (R.events || []).filter(E => (E.seasons || []).includes(rd.season) && act.some(id => hits(R, E, id)) && !(E.effect && E.effect.tieDown && !S.ties.some(T => T.st === "built")));
    const rnd = rng(hashStr(S.room + ":" + S.round)), out = [];
    const pick = () => { const list = pool.filter(E => !out.includes(E)), w = list.reduce((a, E) => a + (E.weight || 1), 0); let u = rnd() * w; for (const E of list) { u -= E.weight || 1; if (u <= 0) return E; } return list[list.length - 1]; };
    if (pool.length) out.push(pick());
    if (pool.length > 1 && rnd() < 0.4) out.push(pick());
    S.events = (S.events || []).filter(x => x.round !== S.round).concat(out.map(E => ({ id: E.id, round: S.round })));
    S.bonus = S.bonus || {};
    out.forEach(E => { if (E.effect && E.effect.budgetAdd) act.forEach(id => { if (hits(R, E, id)) S.bonus[id] = (S.bonus[id] || 0) + E.effect.budgetAdd; }); });
    return out;
  }
  // 이번 라운드에 팀 id에 걸리는 배수 모음
  function modsFor(S, R, id) {
    const M = {};
    (S.events || []).filter(x => x.round === S.round).map(x => eventDef(R, x.id)).filter(E => E && hits(R, E, id)).forEach(E => {
      const f = E.effect || {};
      ["demandMul", "solarMul", "windMul", "offshoreMul", "tidalMul", "coalCapMul", "lngCapMul"].forEach(k => { if (typeof f[k] === "number") M[k] = (M[k] == null ? 1 : M[k]) * f[k]; });
      if (Array.isArray(f.hours)) M.demandHours = f.hours;
      if (f.carbonTaxOn) M.tax = true;
    });
    return M;
  }
  function tieMods(S, R) {
    let mul = 1; const down = [];
    (S.events || []).filter(x => x.round === S.round).map(x => eventDef(R, x.id)).filter(Boolean).forEach(E => {
      const f = E.effect || {};
      if (typeof f.tieCapMul === "number") mul *= f.tieCapMul;
      if (f.tieDown) down.push(typeof f.tieDown === "string" ? f.tieDown : "*");
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
      return { builds: st.builds, lines: st.lines, policies: st.policies, shed: st.shed, fab2: st.fab2, seed: st.seed, season: st.season, missions: st.missions };
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
      return {
        H, dem: res.hrDem, uns, gx: res.gx || [], hosp: res.hrHosp,
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
    const R = regionOf(S.region), rd = R.rounds[S.round - 1];
    const rnd = { season: rd.season, days: rd.days, seed: 7000 + S.round * 13 };
    const sims = {}, price = {};
    const act = R.teams.filter(t => Object.hasOwn(S.teams, t.id));
    act.forEach(t => {
      const T = S.teams[t.id];
      sims[t.id] = simTeam(bg, R, t.id, T.plan, rnd, budget(S, t.id), modsFor(S, R, t.id));
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
      const tie = tieShare(S, R, t.id);
      const cost = { capex: r2(K.capex), ties: r2(tie), fuel: r2(K.fuel + o.fuelX - o.saveFuel), policy: r2(K.policy), trade: r2(o.pay - o.earn) };
      cost.total = r2(cost.capex + cost.ties + cost.fuel + cost.policy + cost.trade);
      const co2Prod = K.co2 + o.co2X - o.saveCo2, co2Cons = co2Prod - o.co2X + o.co2In;
      team[t.id] = {
        dem: r2(K.dem), uns: r2(uns), unsPct: r2(100 * uns / Math.max(1e-9, K.dem)), outH, hospH,
        cost, co2Prod: Math.round(co2Prod), co2Cons: Math.round(co2Cons), imp: r2(o.imp), sub: r2(o.sub), exp: r2(o.exp), earn: r2(o.earn), pay: r2(o.pay),
        sat: K.sat, cp: K.cp, curt: r2(Math.max(0, K.curt - o.curtX)), renPct: Math.round(100 * Math.min(1, K.ren / Math.max(1e-9, K.dem))),
        unlinked: o.unlinked, isolated: { uns: r2(K.uns), co2: Math.round(K.co2) }
      };
      rDem += K.dem; rUns += uns; rCo2 += co2Prod;
    });
    const region = { dem: r2(rDem), uns: r2(rUns), unsPct: r2(100 * rUns / Math.max(1e-9, rDem)), co2: Math.round(rCo2) };
    const G = goalsOf(S);
    region.ok = { uns: region.unsPct <= G.unsPct, co2: region.co2 <= G.co2 };
    const result = { round: S.round, season: rd.season, days: rd.days, seed: rnd.seed, team, region, flow, events: (S.events || []).filter(x => x.round === S.round).map(x => x.id), tieDown: rnd.tieDown || null };
    S.results = S.results.filter(x => x.round !== S.round).concat([result]);
    return result;
  }

  // 운영 단계: 진행자 기기에서 바로 돌리고 결과 단계로.
  function run(S, bg, now) {
    if (S.phase !== "plan") return null;
    S.phase = "run"; S.ends = null;
    const res = runRound(S, bg);
    S.phase = "review"; S.ends = now + REVIEW_MS;
    log(S, `${S.round}라운드 운영 끝 · 지역 정전 ${res.region.unsPct}% · CO₂ ${res.region.co2} t`, now);
    S.rev++;
    return res;
  }

  KCP.leagueCore = {
    eventDef, modsFor, hits, drawEvents,
    PHASES, PRICE, TIE_LOSS, regionOf, teamDef, tieDef, tieId, validTeams, activeOf, goalsOf, newState, publicView, reduce, host, run, runRound, settle, simTeam,
    budget, tieCost, tieShare, cleanPlan, capexOf
  };
})();
