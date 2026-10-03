/* 도시 경제 모형(화면 없음, SPEC v1). 1턴 = 1달.
 * - 주민·산업은 지역 총량 안에서 더 좋은 도시로 옮긴다(로짓 목표 몫 + 관성, 정수 보존).
 * - 재정: 1월 국가 재정지원금 + 달마다 주민·산업 세 − 공공서비스·보조·운영비·이자.
 * - 집단 6개 만족 → 지지율(Democracy), 정책·투자 효과는 λ만큼씩 늦게 닿는다.
 * - 국제 지수(LNG·환율·수출·해운)는 씨앗 고정 무작위 걷기 + 사건. 난수는 씨앗 난수만 쓴다.
 * 모든 함수는 E를 바꾸지 않고 새 E를 돌려준다(진행자 기기가 돌리고 모두에게 알린다).
 */
(function () {
  "use strict";
  const KCP = window.KCP;
  if (!KCP) return;
  const DATA = () => KCP.ECON_DATA;
  const fin = (x, d) => (typeof x === "number" && isFinite(x) ? x : d);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const num = (x, lo, hi, d) => clamp(fin(x, d), lo, hi);
  const c100 = x => clamp(fin(x, 0), 0, 100);
  const r1 = x => Math.round(x * 10) / 10;
  const r3 = x => Math.round(x * 1000) / 1000;
  const sum = a => a.reduce((s, x) => s + x, 0);
  const clone = x => JSON.parse(JSON.stringify(x));
  const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const pv = (data, k) => data.params[k].v;
  // 씨앗 난수(league-core.js와 같은 꼴)
  function hashStr(x) { let h = 2166136261; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rngOf = (E, tag) => rng(hashStr(E.seed + ":" + tag));

  /* ---------- 시간 ---------- */
  const SEASONS = { 12: "winter", 1: "winter", 2: "winter", 3: "spring", 4: "spring", 5: "spring", 6: "summer", 7: "summer", 8: "summer", 9: "autumn", 10: "autumn", 11: "autumn" };
  const seasonOfMonth = m => SEASONS[m] || "spring";
  const monthsInGame = n => ([12, 24, 36].includes(n) ? n : 12);
  const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysOf = (y, m) => [31, leap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] || 30;
  // 대표 7일 결과를 달 전체로 늘리는 배수(정전 %는 그대로)
  const weekMul = (y, m) => daysOf(y, m) / 7;
  const monthLabel = E => `${E.year}년 ${E.month}월`;

  /* ---------- 정수 나누기(보존) ---------- */
  // arr(실수)을 합이 target(정수)인 정수 배열로. 큰 소수 부분부터 1씩(같으면 앞 도시부터).
  function roundSum(arr, target) {
    const base = arr.map(x => Math.floor(fin(x, 0))), frac = arr.map((x, i) => fin(x, 0) - base[i]);
    let k = target - sum(base);
    const ord = arr.map((_, i) => i).sort((a, b) => frac[b] - frac[a] || a - b);
    if (!ord.length) return base;
    for (let j = 0; k > 0; j++, k--) base[ord[j % ord.length]]++;
    for (let j = ord.length - 1; k < 0; j--, k++) base[ord[((j % ord.length) + ord.length) % ord.length]]--;
    return base;
  }
  // 순이동(합 0)을 도시 쌍 흐름으로: 잃은 도시마다 얻은 도시의 남은 몫에 비례해 나눈다(행·열 합 정확).
  function pairFlows(ids, mig) {
    const rem = mig.map(x => Math.max(0, x)), out = [];
    ids.forEach((from, i) => {
      const loss = -Math.min(0, mig[i]);
      if (!loss) return;
      const tot = sum(rem);
      if (!tot) return;
      const part = roundSum(rem.map(r => (loss * r) / tot), loss);
      part.forEach((n, j) => { if (n > 0) { out.push({ from, to: ids[j], n }); rem[j] -= n; } });
    });
    return out.sort((a, b) => b.n - a.n);
  }

  /* ---------- 입력 정리 ---------- */
  const has = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k) && typeof o[k] === "number" && isFinite(o[k]);
  function cleanInput(raw, C, S) {
    const I = raw || {}, e = I.energy || {}, po = I.policy || {}, as = I.assets || {};
    const BIG = 1e7;
    const energy = {
      unsPct: num(e.unsPct, 0, 100, 0), hospH: num(e.hospH, 0, 1e4, 0),
      costPerMWh: has(e, "costPerMWh") ? clamp(e.costPerMWh, 0, 10) : null,
      co2Local: has(e, "co2Local") ? clamp(e.co2Local, 0, BIG) : null,
      co2: has(e, "co2") ? clamp(e.co2, 0, BIG) : null,
      renPct: num(e.renPct, 0, 100, 0), tradeNet: num(e.tradeNet, -BIG, BIG, 0),
      opex: num(e.opex, 0, BIG, 0), capexNew: num(e.capexNew, 0, BIG, 0),
      demMWh: has(e, "demMWh") ? clamp(e.demMWh, 0, BIG) : null,
      co2Int: has(e, "co2Int") ? clamp(e.co2Int, 0, 5) : null,
      spareMW: has(e, "spareMW") ? clamp(e.spareMW, 0, BIG) : null
    };
    const old = C.policy, step = (x, d) => Math.round(num(x, -2, 2, d));
    const policy = { taxRes: step(po.taxRes, old.taxRes), taxInd: step(po.taxInd, old.taxInd), service: step(po.service, old.service), incentive: num(po.incentive, 0, 1e4, old.incentive) };
    const assets = {
      uni: num(as.uni, 0, 20, S.uni || 0), lab: num(as.lab, 0, 20, S.lab || 0),
      port: as.port == null ? !!S.port : !!as.port, site: as.site == null ? !!S.site : !!as.site,
      houseCap: has(as, "houseCap") && as.houseCap > 0 ? as.houseCap : null,
      indCap: has(as, "indCap") && as.indCap > 0 ? as.indCap : null
    };
    return { energy, policy, assets };
  }

  /* ---------- 지역 맥락 ---------- */
  function regionCtx(E, ins, data) {
    const ids = E.order, C = E.cities;
    const costs = ids.map(id => ins[id].energy.costPerMWh).filter(c => c != null && c > 0);
    const popT = sum(ids.map(id => C[id].pop)), indT = sum(ids.map(id => C[id].ind));
    return {
      avgCost: costs.length ? sum(costs) / costs.length : null,
      jobsAvg: popT > 0 ? indT / popT : 0.42,
      popAvg: popT / Math.max(1, ids.length),
      youthAvg: sum(ids.map(id => C[id].pop * C[id].groups.youth.share)) / Math.max(1, popT)
    };
  }
  const ctxOf = (E, ins, data, id, reg) => ({ inp: ins[id], reg: reg || regionCtx(E, ins, data), intl: E.intl.cur, data, start: data.start[id] || {} });
  const mixOf = S => S.mix || { other: 1 };
  function re100Of(S, data) { const m = mixOf(S); return sum(Object.keys(m).map(k => m[k] * ((data.sectors[k] || {}).re100 || 0.1))); }
  const wsum = (parts, w) => { let a = 0, b = 0; Object.keys(w).forEach(k => { if (parts[k] != null) { a += w[k] * parts[k]; b += w[k]; } }); return b > 0 ? c100(a / b) : 50; };
  // 넘침 꼴: 수용의 90%까지 90점 이상, 넘으면 빠르게 감점(SimCity 'R 수요' 포화)
  const crowdScore = over => c100(over <= 0.9 ? 90 + (10 * (0.9 - over)) / 0.9 : 90 - 400 * (over - 0.9));
  function co2IntOf(e, data) {
    if (e.co2Int != null) return e.co2Int;
    if (e.co2 != null && e.demMWh) return clamp(e.co2 / e.demMWh, 0, 5);
    return pv(data, "co2IntDef");
  }

  /* ---------- 살기 좋음 L ---------- */
  function livability(city, ctx) {
    const data = ctx.data || DATA(), P = k => pv(data, k), e = ctx.inp.energy, as = ctx.inp.assets, pol = city.policy, reg = ctx.reg;
    const pop = Math.max(1, city.pop);
    const parts = {
      rel: c100(100 * (1 - e.unsPct / P("unsZeroL")) - (e.hospH > 0 ? P("hospPen") : 0)),
      price: e.costPerMWh == null || !reg.avgCost ? 50 : c100(50 + (50 * (reg.avgCost - e.costPerMWh)) / reg.avgCost),
      air: e.co2Local == null ? 60 : c100(100 * Math.exp(-(e.co2Local / (pop / 1e4)) / P("airRef"))),
      jobs: c100(50 + 50 * Math.tanh(1.5 * ((city.ind / pop) / Math.max(1e-6, reg.jobsAvg) - 1))),
      svc: c100(50 + 15 * pol.service + Math.min(25, P("eduUni") * as.uni + P("eduLab") * as.lab)),
      tax: c100(60 - 15 * pol.taxRes),
      crowd: crowdScore(pop / (as.houseCap || city.pop0 * P("crowdCapMul")))
    };
    const w = P("wL");
    return { score: wsum(parts, w), parts, w };
  }

  /* ---------- 산업 매력 A ---------- */
  function industryAttract(city, ctx) {
    const data = ctx.data || DATA(), P = k => pv(data, k), e = ctx.inp.energy, as = ctx.inp.assets, pol = city.policy, reg = ctx.reg, I = ctx.intl || {}, S = ctx.start;
    const pop = Math.max(1, city.pop), ind = Math.max(1, city.ind), mix = mixOf(S);
    const steelX = (mix.steel || 0) * (S.exportShare || 0);
    const parts = {
      rel: c100(100 * (1 - e.unsPct / P("unsZeroA"))),
      price: e.costPerMWh == null || !reg.avgCost ? 50 : c100(50 + (50 * (reg.avgCost - e.costPerMWh)) / reg.avgCost),
      re: c100((100 * e.renPct) / P("reTarget")),
      labor: c100(50 + 20 * Math.log(pop / Math.max(1, reg.popAvg)) + 200 * (city.groups.youth.share - reg.youthAvg)),
      talent: c100(30 + 20 * as.uni + 15 * as.lab),
      logi: c100(40 + (as.port ? 30 * fin(I.ship, 1) : 0) + (as.site ? 15 : 0)),
      tax: c100(60 - 15 * pol.taxInd),
      inc: c100(100 * (1 - Math.exp(-pol.incentive / (P("incRef") * ind / 1e4)))),
      land: crowdScore(ind / (as.indCap || city.ind0 * P("landCapMul"))),
      carbon: c100(100 * (1 - co2IntOf(e, data) / (2 * P("co2IntRef"))))
    };
    const w0 = P("wA"), w = Object.assign({}, w0);
    w.re = w0.re * (0.5 + re100Of(S, data));
    w.carbon = w0.carbon + (I.cbam ? 0.3 * steelX : 0);
    return { score: wsum(parts, w), parts, w };
  }

  /* ---------- 국제 지수 ---------- */
  function initIntl(data) {
    const b = data.intl.base;
    const I = { walk: clone(b), active: [], cur: null };
    I.cur = intlCur(I, data);
    return I;
  }
  function intlCur(I, data) {
    const ev = I.active.map(a => (data.intl.events.find(x => x.id === a.id) || {}).fx || {});
    const add = k => sum(ev.map(f => fin(f[k], 0)));
    const exp = {};
    Object.keys(I.walk.export).forEach(s => { exp[s] = r3(clamp(I.walk.export[s] + sum(ev.map(f => fin((f.export || {})[s], 0))), 0.3, 3)); });
    const lng = r3(clamp(I.walk.lng + add("lng"), 0.3, 4)), fx = r3(clamp(I.walk.fx + add("fx"), 0.5, 2));
    return {
      lng, fx, ship: r3(clamp(I.walk.ship + add("ship"), 0.2, 2)), export: exp,
      cbam: add("cbam") > 0 ? 1 : 0, capexMul: r3(clamp(1 + add("capex"), 0.5, 3)),
      fuelMul: r3(lng * fx), active: I.active.map(a => ({ id: a.id, name: a.name, until: a.until }))
    };
  }
  function intlStep(E, data) {
    const I = E.intl, D = data.intl, R = rngOf(E, "intl:" + E.t), n = () => R() + R() - 1;
    const rev = (x, m, s, lo, hi) => clamp(x + D.theta * (m - x) + s * n(), lo, hi);
    I.walk.lng = rev(I.walk.lng, D.base.lng, D.sigma.lng, 0.4, 3);
    I.walk.fx = rev(I.walk.fx, D.base.fx, D.sigma.fx, 0.6, 1.6);
    I.walk.ship = rev(I.walk.ship, D.base.ship, D.sigma.ship, 0.4, 1.6);
    Object.keys(I.walk.export).forEach(s => { I.walk.export[s] = rev(I.walk.export[s], fin(D.base.export[s], 1), D.sigma.export, 0.4, 2); });
    I.active = I.active.filter(a => a.until > E.t);
    const started = [];
    const start = ev => {
      if (I.active.some(a => a.id === ev.id)) return;
      const dur = ev.dur[0] + Math.floor(R() * (ev.dur[1] - ev.dur[0] + 1));
      I.active.push({ id: ev.id, name: ev.name, until: E.t + dur });
      started.push({ id: ev.id, name: ev.name, dur, text: ev.text });
    };
    (D.schedule || []).filter(s => s.t === E.t).forEach(s => { const ev = D.events.find(x => x.id === s.id); if (ev) start(ev); });
    const free = D.events.filter(ev => !ev.sched && !I.active.some(a => a.id === ev.id));
    const roll = R(), pick = R();
    if (I.active.filter(a => a.until < E.t + 900).length < D.maxActive && free.length && roll < D.eventP) start(free[Math.floor(pick * free.length)]);
    I.cur = intlCur(I, data);
    return started;
  }

  /* ---------- 시작 ---------- */
  function initCities(ids, data, opts) {
    data = data || DATA(); opts = opts || {};
    const P = k => pv(data, k), list = (ids || Object.keys(data.start)).filter(id => data.start[id]);
    const cities = {};
    list.forEach(id => {
      const S = data.start[id], gs = S.groups || {}, gT = sum(Object.keys(data.groups).map(g => fin(gs[g], 0))) || 1;
      const groups = {};
      Object.keys(data.groups).forEach(g => { groups[g] = { share: fin(gs[g], 0) / gT, sat: P("sat0") }; });
      cities[id] = {
        id, name: S.name || id, pop: Math.round(S.pop0), ind: Math.round(S.ind0), pop0: Math.round(S.pop0), ind0: Math.round(S.ind0),
        cash: fin((opts.cash || {})[id], S.cash0 || 0), cash0: 0, fk: 1, debtCap: 0, revYear: 0, subsidy: 0,
        policy: { taxRes: 0, taxInd: 0, service: 0, incentive: 0 },
        groups, approval: P("sat0"), L: 50, A: 50, L0: 50, A0: 50, lagL: {}, lagA: {}, baseL: {}, baseA: {},
        out: 1, unsS: 0, co2pc: 0, renS: 0, unrest: 0, hist: []
      };
    });
    const pop0 = sum(list.map(id => cities[id].pop)), ind0 = sum(list.map(id => cities[id].ind));
    const E = {
      v: 1, seed: String(opts.seed == null ? "kcp" : opts.seed), t: 0, year: data.startYear || 2027, month: 1,
      len: monthsInGame(opts.months), order: list, cities, totals: { pop0, ind0, pop: pop0, ind: ind0 },
      intl: initIntl(data), offers: [], nextOffer: 0, paidYear: null
    };
    const g = P("offerGap");
    E.nextOffer = g[0] + Math.floor(rngOf(E, "offer:init")() * (g[1] - g[0] + 1));
    list.forEach(id => { const C = cities[id]; C.cash0 = C.cash; C.fk = fiscalK(C, data); });
    setBase(E, opts.base || {}, data);
    return E;
  }

  // 기준 매력: 시작 상태(opts.base 또는 calibrate 입력, 없으면 중립)의 부분 점수.
  // 지금 분포는 이미 시작 조건의 균형이라 보고 anchor만큼 상쇄한다 → 시작 뒤 '달라진 것'이 이동을 만든다.
  function setBase(E, raw, data) {
    const P = k => pv(data, k), ins = {};
    E.order.forEach(id => { ins[id] = cleanInput(raw[id], E.cities[id], data.start[id] || {}); });
    const reg = regionCtx(E, ins, data);
    E.order.forEach(id => {
      const C = E.cities[id], ctx = ctxOf(E, ins, data, id, reg), l = livability(C, ctx), a = industryAttract(C, ctx);
      C.baseL = l.parts; C.lagL = clone(l.parts); C.L = C.L0 = l.score;
      C.baseA = a.parts; C.lagA = clone(a.parts); C.A = C.A0 = a.score;
      C.revYear = 12 * ownRev(C, ins[id], data, 1).sum + subsidyOf(C, data);
      C.debtCap = r1(P("debtCapRatio") * C.revYear);
      // 지연 추적·집단 만족도 시작 상태의 균형값에서 출발(아무것도 안 하면 지지율이 저절로 오르내리지 않게)
      const e = ins[id].energy, co2 = e.co2 != null ? e.co2 : fin(e.co2Local, 0);
      C.unsS = e.unsPct; C.renS = e.renPct; C.co2pc = co2 / Math.max(1, C.pop / 1000);
      C.out = outIdx(C, ins[id], E.intl.cur, data).v;
      const g = groupTargets(C, ins[id], C.out, data);
      Object.keys(C.groups).forEach(k => { C.groups[k].sat = g.tg[k]; });
      C.approval = c100(sum(Object.keys(C.groups).map(k => C.groups[k].share * C.groups[k].sat)));
    });
    return E;
  }
  // 진행자가 시작 지도(새 건설 없음)를 한 번 돌린 결과로 기준을 다시 잡는다. 첫 monthStep 전에.
  function calibrate(E, inputs, data) { data = data || DATA(); return setBase(clone(E), inputs || {}, data); }

  /* ---------- 재정 ---------- */
  function fsrOf(C, data) {
    const S = data.start[C.id] || {}, j = (C.ind / Math.max(1, C.pop)) / Math.max(1e-6, C.ind0 / Math.max(1, C.pop0));
    return clamp(fin(S.fsr0, 0.4) * Math.sqrt(Math.max(0, j)), 0.1, 0.9);
  }
  const fkOf = C => fin(C.fk, 1);
  // 재정 눈금: 시작 때 (주민세 + 산업세 − 공공서비스 + 지원금)/년 = 시작 예산 × fiscalNorm 이 되게 도시마다 한 배수.
  // 구성 비율(세목·균형 몫)은 그대로, 크기만 도시 묶음 예산에 맞춘다(작은 도시도 해마다 비슷한 몫을 새로 투자).
  function fiscalK(C, data) {
    const P = k => pv(data, k), norm = P("fiscalNorm");
    if (!(norm > 0) || !(C.cash > 0)) return 1;
    const c0 = Object.assign({}, C, { fk: 1 });
    const yr = 12 * (C.pop * P("resTax") + C.ind * P("indTax") - C.pop * P("svcCost")) + subsidyOf(c0, data);
    return yr > 0 ? r3(clamp((norm * C.cash) / yr, 0.25, 4)) : 1;
  }
  function subsidyOf(C, data) {
    const P = k => pv(data, k);
    return r3(fkOf(C) * (P("subBase") + P("subPerCap") * C.pop + P("subEq") * C.pop * Math.max(0, P("fsrRef") - fsrOf(C, data))));
  }
  function ownRev(C, inp, data, out) {
    const P = k => pv(data, k), e = inp.energy, pol = C.policy;
    const o = {
      resTax: r3(fkOf(C) * C.pop * P("resTax") * (1 + P("taxStep") * pol.taxRes)),
      indTax: r3(fkOf(C) * C.ind * P("indTax") * out * (1 + P("taxStep") * pol.taxInd)),
      tariff: e.demMWh != null ? r3(e.demMWh * P("tariff")) : 0,
      trade: r3(Math.max(0, e.tradeNet))
    };
    o.sum = o.resTax + o.indTax + o.tariff + o.trade;
    return o;
  }
  // 1월 국가 재정지원금(기본 + 1인당 + 균형). E를 바꾸지 않는다.
  function yearStart(E, data) {
    data = data || DATA();
    const E2 = clone(E), subsidy = {};
    E2.order.forEach(id => { const C = E2.cities[id], s = subsidyOf(C, data); C.cash += s; C.subsidy = s; subsidy[id] = s; });
    E2.paidYear = E2.year;
    return { E: E2, subsidy };
  }
  // 지금 쓸 수 있는 돈(현금 + 남은 지방채 한도)
  const spendable = C => r1(C.cash + C.debtCap);

  /* ---------- 산업 산출 지수 ---------- */
  function outIdx(C, inp, I, data) {
    const P = k => pv(data, k), S = data.start[C.id] || {}, mix = mixOf(S), xs = fin(S.exportShare, 0.4), e = inp.energy;
    const exportEff = xs * (sum(Object.keys(mix).map(s => mix[s] * (fin((I.export || {})[s], 1) - 1))) + P("fxExport") * (fin(I.fx, 1) - 1));
    const logi = inp.assets.port ? P("logiPort") * (fin(I.ship, 1) - 1) : 0;
    const cbam = I.cbam ? P("cbamRate") * (mix.steel || 0) * xs * (co2IntOf(e, data) / P("co2IntRef")) : 0;
    const v = clamp(1 - P("outRel") * e.unsPct + exportEff + logi - cbam, P("outMin"), P("outMax"));
    return { v: r3(v), exportEff: r3(exportEff), logi: r3(logi), cbam: r3(cbam) };
  }

  /* ---------- 이동 ---------- */
  const WHY_L = { rel: "정전이 잦아서", price: "전기요금이 비싸서", air: "공기가 나빠서", jobs: "일자리가 적어서", svc: "공공서비스가 부족해서", tax: "세금이 무거워서", crowd: "집이 비좁아서" };
  const WHY_A = { rel: "전력이 불안해서", price: "전기값이 비싸서", re: "재생에너지가 모자라서", labor: "인력이 부족해서", talent: "인재가 적어서", logi: "물류가 불편해서", tax: "세금이 무거워서", inc: "유치 보조가 적어서", land: "산업 용지가 모자라서", carbon: "전력 탄소가 많아서" };
  // 실효 매력 = 지금 − anchor × 기준(시작 차이 상쇄)
  const effOf = (C, which, w, data) => {
    const lag = which === "L" ? C.lagL : C.lagA, base = which === "L" ? C.baseL : C.baseA, a = pv(data, "anchor");
    return wsum(lag, w) - a * wsum(base, w);
  };
  function move(E, key, eff, beta, kappa, totNew) {
    const ids = E.order, cur = ids.map(id => E.cities[id][key]), T = sum(cur);
    const m = sum(eff) / Math.max(1, eff.length);
    const raw = cur.map((c, i) => (c / T) * Math.exp(clamp((beta * (eff[i] - m)) / 10, -20, 20)));
    const Z = sum(raw) || 1, s = raw.map(x => x / Z);
    const mig = roundSum(cur.map((c, i) => kappa * (s[i] * T - c)), 0);
    const grow = roundSum(cur.map(c => (c / T) * (totNew - T)), totNew - T);
    ids.forEach((id, i) => { E.cities[id][key] = Math.max(1, cur[i] + mig[i] + grow[i]); });
    return { mig, grow, target: s };
  }
  function causeOf(Cf, Ct, which, w, data) {
    const a = pv(data, "anchor"), lagF = which === "L" ? Cf.lagL : Cf.lagA, lagT = which === "L" ? Ct.lagL : Ct.lagA;
    const bF = which === "L" ? Cf.baseL : Cf.baseA, bT = which === "L" ? Ct.baseL : Ct.baseA;
    let best = null, bv = -Infinity;
    Object.keys(w).forEach(k => {
      const d = w[k] * ((lagT[k] - a * bT[k]) - (lagF[k] - a * bF[k]));
      if (d > bv) { bv = d; best = k; }
    });
    return { part: best, why: (which === "L" ? WHY_L : WHY_A)[best] || "" };
  }

  /* ---------- 기업 이전 희망 ---------- */
  function makeOffer(E, data) {
    const R = rngOf(E, "offer:" + E.t), T = data.offers[Math.floor(R() * data.offers.length)];
    const pick = (r, step) => Math.round((r[0] + R() * (r[1] - r[0])) / step) * step;
    return {
      id: "of" + E.t, tpl: T.id, name: T.name, sector: T.sector,
      workers: pick(T.workers, 100), mw: r1(pick(T.mw, 0.1)), rePct: pick(T.re, 5), unsMax: T.uns,
      t: E.t, until: E.t + pv(data, "offerLife")
    };
  }
  // 도시마다 조건을 맞추는지(여유 전력 · 재생 % · 정전 · 구직 인력). 정할 사람은 진행자.
  function evalOffer(offer, E, inputs, data) {
    data = data || DATA();
    const out = {};
    E.order.forEach(id => {
      const C = E.cities[id], inp = cleanInput((inputs || {})[id], C, data.start[id] || {}), e = inp.energy;
      const pool = Math.round(C.pop * (C.groups.worker.share + C.groups.youth.share) * pv(data, "seekRate"));
      const checks = {
        mw: { need: offer.mw, have: e.spareMW, ok: e.spareMW == null ? null : e.spareMW >= offer.mw },
        re: { need: offer.rePct, have: r1(e.renPct), ok: e.renPct >= offer.rePct },
        rel: { need: offer.unsMax, have: r1(e.unsPct), ok: e.unsPct <= offer.unsMax },
        workers: { need: offer.workers, have: pool, ok: pool >= offer.workers }
      };
      const ks = Object.keys(checks), fail = ks.filter(k => checks[k].ok === false);
      out[id] = { ok: !fail.length, unknown: ks.filter(k => checks[k].ok == null), fail, checks, attract: r1(C.A) };
    });
    const rank = E.order.slice().sort((a, b) => (out[b].ok - out[a].ok) || (out[b].attract - out[a].attract) || E.order.indexOf(a) - E.order.indexOf(b));
    rank.forEach((id, i) => { out[id].rank = i + 1; });
    return { by: out, rank };
  }
  // 진행자가 고른 도시로 기업이 옮긴다: 종사자·주민 workers명을 다른 도시에서 산업 비례로 가져온다(총량 보존).
  function acceptOffer(E, offerId, cityId, data) {
    data = data || DATA();
    const E2 = clone(E), of = E2.offers.find(o => o.id === offerId);
    if (!of || !E2.cities[cityId]) return { E: E2, ok: false, moved: 0 };
    const others = E2.order.filter(id => id !== cityId);
    const take = (key) => {
      const have = others.map(id => E2.cities[id][key]), n = Math.min(of.workers, Math.max(0, sum(have) - others.length * 1000));
      const part = roundSum(have.map(h => (n * h) / Math.max(1, sum(have))), n);
      others.forEach((id, i) => { E2.cities[id][key] -= part[i]; });
      E2.cities[cityId][key] += n;
      return n;
    };
    const moved = take("ind"); take("pop");
    E2.offers = E2.offers.filter(o => o.id !== offerId);
    return { E: E2, ok: true, moved, news: `${of.name} → ${E2.cities[cityId].name} 이전 확정(${fmt(moved)}명)` };
  }

  /* ---------- 전력 수요 배수 ---------- */
  function demandMul(city, city0) {
    const p0 = city0 ? city0.pop : city.pop0, i0 = city0 ? city0.ind : city.ind0;
    return { res: r3(clamp(city.pop / Math.max(1, p0), 0.2, 5)), ind: r3(clamp(city.ind / Math.max(1, i0), 0.2, 5)) };
  }

  /* ---------- 집단 만족 ---------- */
  function groupTargets(C, inp, out, data) {
    const P = k => pv(data, k), W = P("groupW"), e = inp.energy;
    const parts = Object.assign({}, C.lagL, {
      A: C.A, out: c100((100 * (out - 0.5)) / 0.7), taxI: c100(60 - 15 * C.policy.taxInd),
      ren: c100((100 * C.renS) / P("reTarget")), co2: c100(100 * Math.exp(-C.co2pc / P("scoreCo2Ref")))
    });
    const tg = {};
    Object.keys(data.groups).forEach(g => {
      let v = wsum(parts, W[g] || {});
      if (g === "senior" && e.hospH > 0) v -= P("seniorHosp");
      if (C.unrest > 0) v -= 3;
      tg[g] = c100(v);
    });
    return { tg, parts };
  }
  const GW = { rel: "정전", price: "전기요금", air: "공기", jobs: "일자리", svc: "공공서비스", tax: "세금", crowd: "집값·혼잡", A: "산업 여건", out: "생산 부진", taxI: "법인 세금", ren: "재생에너지", co2: "탄소 배출" };
  function whyOf(C, parts, data) {
    const W = pv(data, "groupW");
    const g = Object.keys(C.groups).sort((a, b) => C.groups[a].sat - C.groups[b].sat)[0];
    const ks = Object.keys(W[g] || {}).filter(k => parts[k] != null).sort((a, b) => parts[a] - parts[b]);
    return { group: g, part: ks[0] || null, text: `${data.groups[g].name} 불만: ${GW[ks[0]] || "여러 가지"}` };
  }

  /* ---------- 한 달 ---------- */
  // inputs[id] = {energy:{unsPct, hospH, costPerMWh, co2Local, co2?, renPct, tradeNet(벌이−지출), opex(거래 제외), capexNew, demMWh?, co2Int?, spareMW?},
  //               policy:{taxRes, taxInd, service, incentive}, assets:{uni, lab, port, site, houseCap?, indCap?}}
  function monthStep(E0, inputs, data) {
    data = data || DATA();
    const P = k => pv(data, k), E = clone(E0), ids = E.order, C = E.cities, lam = P("lambda");
    inputs = inputs || {};
    const news = [], fiscal = {}, cashBefore = {};
    ids.forEach(id => { cashBefore[id] = C[id].cash; });
    // 1) 1월 재정지원금
    const sub = {};
    if (E.month === 1 && E.paidYear !== E.year) {
      ids.forEach(id => { const s = subsidyOf(C[id], data); sub[id] = s; C[id].subsidy = s; });
      E.paidYear = E.year;
      news.push(`국가 재정지원금: ${ids.map(id => `${C[id].name} ${Math.round(sub[id])}억`).join(" · ")}`);
    }
    // 2) 국제
    const started = intlStep(E, data), I = E.intl.cur;
    started.forEach(s => news.push(`국제: ${s.name}${s.dur < 900 ? `(${s.dur}달)` : ""} — ${s.text}`));
    // 3) 입력 정리 · 정책 반영(시위 중 정책 바꾸기 비용)
    const ins = {}, polCost = {};
    ids.forEach(id => {
      const before = C[id].policy;
      ins[id] = cleanInput(inputs[id], C[id], data.start[id] || {});
      const p = ins[id].policy, steps = Math.abs(p.taxRes - before.taxRes) + Math.abs(p.taxInd - before.taxInd) + Math.abs(p.service - before.service);
      polCost[id] = C[id].unrest > 0 ? steps * P("polChangeCost") : 0;
      C[id].policy = p;
    });
    // 4) 매력(목표 부분 점수 → λ 지연)
    const reg = regionCtx(E, ins, data), Lr = {}, Ar = {};
    ids.forEach(id => {
      const c = C[id], ctx = ctxOf(E, ins, data, id, reg), l = livability(c, ctx), a = industryAttract(c, ctx);
      Object.keys(l.parts).forEach(k => { c.lagL[k] += lam * (l.parts[k] - c.lagL[k]); });
      Object.keys(a.parts).forEach(k => { c.lagA[k] = fin(c.lagA[k], a.parts[k]) + lam * (a.parts[k] - fin(c.lagA[k], a.parts[k])); });
      c.L = wsum(c.lagL, l.w); c.A = wsum(c.lagA, a.w);
      Lr[id] = { now: l, eff: effOf(c, "L", l.w, data) }; Ar[id] = { now: a, eff: effOf(c, "A", a.w, data) };
    });
    // 5) 이동(지역 총량 = 시작 × (1+g)^(달/12), 정수 보존)
    const mo = E.t + 1;
    const popNew = Math.round(E.totals.pop0 * Math.pow(1 + P("gpYear"), mo / 12));
    const indNew = Math.round(E.totals.ind0 * Math.pow(1 + P("giYear"), mo / 12));
    const before = {}; ids.forEach(id => { before[id] = { pop: C[id].pop, ind: C[id].ind }; });
    const mp = move(E, "pop", ids.map(id => Lr[id].eff), P("betaPop"), P("kappaPop"), popNew);
    const mi = move(E, "ind", ids.map(id => Ar[id].eff), P("betaInd"), P("kappaInd"), indNew);
    E.totals.pop = popNew; E.totals.ind = indNew;
    const wL = P("wL");
    const fp = pairFlows(ids, mp.mig).map(f => Object.assign(f, causeOf(C[f.from], C[f.to], "L", wL, data)));
    const fi = pairFlows(ids, mi.mig).map(f => Object.assign(f, causeOf(C[f.from], C[f.to], "A", Ar[f.to].now.w, data)));
    if (fp[0]) news.push(`${C[fp[0].from].name} → ${C[fp[0].to].name} ${fmt(fp[0].n)}명 이주: ${fp[0].why}`);
    if (fi[0]) news.push(`${C[fi[0].from].name} → ${C[fi[0].to].name} 일자리 ${fmt(fi[0].n)}개 이전: ${fi[0].why}`);
    // 6) 재정
    ids.forEach(id => {
      const c = C[id], inp = ins[id], e = inp.energy, o = outIdx(c, inp, I, data);
      c.out = o.v;
      const own = ownRev(c, inp, data, o.v);
      const rev = { subsidy: fin(sub[id], 0), resTax: own.resTax, indTax: own.indTax, tariff: own.tariff, trade: own.trade };
      const exp = {
        capex: r3(e.capexNew), opex: r3(e.opex),
        service: r3(fkOf(c) * c.pop * P("svcCost") * (1 + P("svcStep") * c.policy.service)),
        incentive: r3(c.policy.incentive), interest: r3(Math.max(0, -c.cash) * P("debtRate")),
        trade: r3(Math.max(0, -e.tradeNet)), policy: r3(polCost[id])
      };
      const revT = sum(Object.values(rev)), expT = sum(Object.values(exp));
      c.cash = cashBefore[id] + revT - expT;
      c.revYear = 12 * own.sum + (c.subsidy || subsidyOf(c, data));
      c.debtCap = r1(P("debtCapRatio") * c.revYear);
      const over = c.cash < -c.debtCap;
      if (over && !(cashBefore[id] < -c.debtCap)) news.push(`${c.name} 지방채 한도 넘음 — 새 건설 멈춤`);
      fiscal[id] = { rev, exp, revTotal: r3(revT), expTotal: r3(expT), cashBefore: cashBefore[id], cashAfter: c.cash, debtCap: c.debtCap, debtOver: over, spendable: spendable(c), out: o };
      // 지연 추적(정전·CO₂·재생)
      const co2 = e.co2 != null ? e.co2 : fin(e.co2Local, 0);
      c.unsS += lam * (e.unsPct - c.unsS);
      c.co2pc += lam * (co2 / Math.max(1, c.pop / 1000) - c.co2pc);
      c.renS += lam * (e.renPct - c.renS);
    });
    // 7) 집단 만족 → 지지율
    const groups = {};
    ids.forEach(id => {
      const c = C[id], g = groupTargets(c, ins[id], c.out, data);
      Object.keys(c.groups).forEach(k => { c.groups[k].sat = c100(c.groups[k].sat + lam * (g.tg[k] - c.groups[k].sat)); });
      c.approval = c100(sum(Object.keys(c.groups).map(k => c.groups[k].share * c.groups[k].sat)));
      if (c.unrest > 0) c.unrest--;
      const sats = {}; Object.keys(c.groups).forEach(k => { sats[k] = r1(c.groups[k].sat); });
      groups[id] = { sat: sats, approval: r1(c.approval), why: whyOf(c, g.parts, data) };
    });
    // 8) 기업 이전 희망
    E.offers = E.offers.filter(o => o.until > E.t);
    if (E.t >= E.nextOffer) {
      const of = makeOffer(E, data), g = P("offerGap");
      E.offers.push(of);
      E.nextOffer = E.t + g[0] + Math.floor(rngOf(E, "offer:gap:" + E.t)() * (g[1] - g[0] + 1));
      news.push(`기업 이전 희망: ${of.name} ${fmt(of.workers)}명 · ${of.mw} MW · 재생 ${of.rePct}% 이상`);
    }
    const offers = E.offers.map(o => Object.assign(clone(o), { eval: evalOffer(o, E, inputs, data) }));
    // 9) 주민 평가(12턴마다)
    let review = null;
    if ((E.t + 1) % P("reviewEvery") === 0) {
      review = {};
      ids.forEach(id => {
        const c = C[id], pass = c.approval >= P("approvalMin");
        if (!pass) { c.unrest = P("unrestMonths"); news.push(`평가: ${c.name} 지지율 ${Math.round(c.approval)}% — 시위, 정책 바꾸기 비용↑`); }
        review[id] = { approval: r1(c.approval), pass };
      });
    }
    // 10) 보고
    const cities = {};
    ids.forEach(id => {
      const c = C[id];
      c.hist.push({ t: E.t, pop: c.pop, ind: c.ind, cash: r1(c.cash), appr: r1(c.approval) });
      if (c.hist.length > 48) c.hist.shift();
      cities[id] = {
        L: r1(c.L), A: r1(c.A), Lparts: Lr[id].now.parts, Aparts: Ar[id].now.parts, Leff: r1(Lr[id].eff), Aeff: r1(Ar[id].eff),
        pop: c.pop, ind: c.ind, dPop: c.pop - before[id].pop, dInd: c.ind - before[id].ind,
        out: c.out, demandMul: demandMul(c), cash: r1(c.cash)
      };
    });
    const net = {};
    ids.forEach((id, i) => { net[id] = { pop: mp.mig[i], ind: mi.mig[i], growPop: mp.grow[i], growInd: mi.grow[i] }; });
    const report = {
      t: E.t, year: E.year, month: E.month, season: seasonOfMonth(E.month), days: daysOf(E.year, E.month), weekMul: r3(weekMul(E.year, E.month)),
      flows: { pop: fp, ind: fi }, net, fiscal, groups, cities,
      intl: Object.assign(clone(I), { started }), offers, review, news, totals: clone(E.totals)
    };
    // 다음 달로
    E.t++; E.month++;
    if (E.month > 12) { E.month = 1; E.year++; }
    report.score = score(E, data);
    return { E, report };
  }

  /* ---------- 점수 · 순위 ---------- */
  function score(E, data) {
    data = data || DATA();
    const P = k => pv(data, k), w = P("wScore"), K = P("scoreGrowthK"), T = E.totals;
    const list = E.order.map(id => {
      const c = E.cities[id];
      // 증가율은 지역 총량 증가를 뺀 몫 변화(경쟁)
      const gp = (c.pop / Math.max(1, c.pop0)) / (T.pop / Math.max(1, T.pop0)) - 1;
      const gi = (c.ind / Math.max(1, c.ind0)) / (T.ind / Math.max(1, T.ind0)) - 1;
      const parts = {
        pop: c100(50 + K * gp), ind: c100(50 + K * gi),
        cash: c100(50 + 50 * Math.tanh(fin(c.cash, 0) / (P("scoreCashRef") * Math.max(1, fin(c.cash0, 100))))),
        co2: c100(100 * Math.exp(-fin(c.co2pc, 0) / P("scoreCo2Ref"))),
        appr: c100(c.approval), rel: c100(100 * (1 - fin(c.unsS, 0) / P("unsZeroL")))
      };
      Object.keys(parts).forEach(k => { parts[k] = r1(parts[k]); });
      return { id, name: c.name, score: r1(wsum(parts, w)), parts };
    });
    const rank = list.slice().sort((a, b) => b.score - a.score || E.order.indexOf(a.id) - E.order.indexOf(b.id));
    rank.forEach((x, i) => { x.rank = i + 1; });
    const by = {}; list.forEach(x => { by[x.id] = x; });
    return { rank, by };
  }

  KCP.econ = {
    initCities, calibrate, livability, industryAttract, yearStart, monthStep, demandMul, score,
    evalOffer, acceptOffer, spendable, outIdx, regionCtx, ctxOf, cleanInput,
    seasonOfMonth, monthsInGame, daysOf, weekMul, monthLabel, roundSum, pairFlows, hashStr, rng
  };
})();
