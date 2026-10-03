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
  const isTeam = (R, id) => !!teamDef(R, id);
  const num = (x, lo, hi, d) => (typeof x === "number" && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
  const r2 = x => Math.round(x * 100) / 100;
  const r3 = x => Math.round(x * 1000) / 1000;

  function newState(room, regionId, now) {
    const R = regionOf(regionId);
    if (!R) throw new Error("region");
    const teams = {};
    R.teams.forEach(t => { teams[t.id] = { token: null, online: 0, ready: false, plan: null, rev: 0, price: PRICE.def }; });
    return { v: 1, room, region: R.id, created: now || 0, rev: 1, round: 0, phase: "lobby", ends: null, teams, ties: [], results: [], log: [] };
  }

  function log(S, text, now) { S.log.push({ at: now || 0, t: String(text).slice(0, 120) }); if (S.log.length > LOG_MAX) S.log.splice(0, S.log.length - LOG_MAX); }

  // 팀 예산: 처음 예산에서 라운드마다 25%씩 투자금이 더 들어온다. 연계선 몫은 빠진다.
  function packOf(R, id) { const t = teamDef(R, id); return t && KCP.BUILD_MAPS ? KCP.BUILD_MAPS[t.pack] : null; }
  function baseBudget(R, id) { const P = packOf(R, id); return P ? P.budget || 200 : 200; }
  function tieCost(R, T) { const D = tieDef(R, T.a, T.b); return D ? r2(D.cost * (T.cap === 4 ? 1.6 : 1)) : 0; }
  function tieShare(S, R, id) { return S.ties.filter(T => T.st === "built" && (T.a === id || T.b === id)).reduce((a, T) => a + tieCost(R, T) / 2, 0); }
  function budget(S, id) {
    const R = regionOf(S.region);
    return r2(baseBudget(R, id) * (1 + GROW * Math.max(0, S.round - 1)) - tieShare(S, R, id));
  }

  // 공개 상태: 자리 토큰만 감춘다(누가 자리에 있는지는 보인다).
  function publicView(S, now) {
    const teams = {};
    Object.keys(S.teams).forEach(id => {
      const T = S.teams[id];
      teams[id] = { seated: !!T.token, online: !!T.token && now - T.online < 20000, ready: T.ready, plan: T.plan, rev: T.rev, price: T.price, budget: budget(S, id) };
    });
    return { v: S.v, room: S.room, region: S.region, rev: S.rev, round: S.round, phase: S.phase, ends: S.ends, now, teams, ties: S.ties, results: S.results, log: S.log.slice(-12) };
  }

  const canPlan = S => S.phase === "lobby" || S.phase === "plan";
  const err = e => ({ ok: false, err: e });

  // 팀 요청 하나를 반영한다. 반환: {ok, err?, quiet?}  quiet = 공개 상태가 안 바뀜(접속 표시만)
  function reduce(S, m, now, bg) {
    const R = regionOf(S.region);
    if (!m || typeof m !== "object" || !isTeam(R, m.team) || typeof m.token !== "string" || m.token.length < 8 || m.token.length > 64) return err("bad");
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
      return { ok: true };
    }
    if (m.type === "tie") {
      if (!canPlan(S)) return err("phase");
      const D = tieDef(R, m.team, m.other);
      if (!D) return err("notie");
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
    if (op === "kick" && isTeam(R, arg)) { S.teams[arg].token = null; S.teams[arg].ready = false; log(S, `${teamDef(R, arg).name} 자리 비움`, now); S.rev++; return true; }
    if (op === "extend" && S.ends) { S.ends += 60000; S.rev++; return true; }
    if (op === "next") {
      if (S.phase === "lobby" || S.phase === "review") {
        if (S.round >= R.rounds.length) { S.phase = "end"; S.ends = null; log(S, "리그 끝", now); S.rev++; return true; }
        S.round++; S.phase = "plan"; S.ends = now + PLAN_MS;
        Object.values(S.teams).forEach(T => { T.ready = false; });
        log(S, `${S.round}라운드 계획 시작`, now); S.rev++; return true;
      }
      return false;
    }
    return false;
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
  function simTeam(bg, R, id, plan, rnd, cap) {
    return withPack(bg, R, id, () => {
      const st = bg.sanitize(plan || {}, cap);
      st.season = rnd.season;
      st.seed = rnd.seed;
      const res = bg.simulate(st, rnd.days, { league: true });
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
    R.teams.forEach(t => {
      const T = S.teams[t.id];
      sims[t.id] = simTeam(bg, R, t.id, T.plan, rnd, budget(S, t.id));
      price[t.id] = T.price;
    });
    const H = rnd.days * 24;
    const built = S.ties.filter(T => T.st === "built").map(T => ({ id: tieId(T), a: T.a, b: T.b, cap: T.cap }));
    const { out, flow } = settle(built, sims, price, H, rnd.days);
    const team = {};
    let rDem = 0, rUns = 0, rCo2 = 0;
    R.teams.forEach(t => {
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
    region.ok = { uns: region.unsPct <= R.goals.unsPct, co2: region.co2 <= R.goals.co2 };
    const result = { round: S.round, season: rd.season, days: rd.days, seed: rnd.seed, team, region, flow };
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
    PHASES, PRICE, TIE_LOSS, regionOf, teamDef, tieDef, tieId, newState, publicView, reduce, host, run, runRound, settle, simTeam,
    budget, tieCost, tieShare, cleanPlan, capexOf
  };
})();
