/* 독립 목표 검사: docs/ECON-BALANCE.md. 구현의 계산식을 기대값으로 복사하지 않는다. */
"use strict";
const path = require("path");
global.window = { KCP: {} };
Math.random = () => { throw new Error("Math.random 호출 금지"); };
require(path.resolve(__dirname, "../../ui/econ-data.js"));
require(path.resolve(__dirname, "../../ui/econ.js"));
const { econ: X, ECON_DATA: D } = window.KCP;
const IDS = Object.keys(D.start);
const SMALL = IDS.reduce((a, b) => D.start[a].cash0 <= D.start[b].cash0 ? a : b);
// 검사 장치의 단위 근사(M), 게임 계수를 변경하지 않음. 용어 절·review/lib.js 참고.
const FIXTURE = { people: 1e5, mwhPerDay: 25, days: 30, cost: 0.012,
  localCo2PerDay: 2.5, co2PerDay: 4, renew: 15, spare: 100 };
const SEEDS = Array.from({ length: 40 }, (_, i) => `balance-${i}`);
const clone = x => JSON.parse(JSON.stringify(x));
const sum = xs => xs.reduce((s, x) => s + x, 0);
const mean = xs => sum(xs) / xs.length;
const finite = Number.isFinite;
const fmt = x => finite(x) ? x.toFixed(3) : String(x);
let pass = 0, fail = 0;
let section = "";
const counts = {}, failures = [];
function ok(cond, message) {
  const bucket = counts[section]; bucket.total++;
  if (cond) { pass++; bucket.pass++; }
  else { fail++; failures.push(`${section} ${message}`); }
}
function test(message, fn) {
  try { fn(); } catch (e) { ok(false, `${message}: 예외 ${e.message}`); }
}
function block(key, fn) {
  section = key; counts[key] = { pass: 0, total: 0 };
  test("검사 실행", fn);
  console.log(`${key} 통과 ${counts[key].pass}/${counts[key].total}`);
}
function energy(C, e = {}) {
  const demMWh = C.pop / FIXTURE.people * FIXTURE.mwhPerDay * FIXTURE.days;
  const costPerMWh = e.costPerMWh ?? FIXTURE.cost;
  return Object.assign({ unsPct: 0, hospH: 0, costPerMWh,
    co2Local: C.pop / FIXTURE.people * FIXTURE.localCo2PerDay * FIXTURE.days,
    co2: C.pop / FIXTURE.people * FIXTURE.co2PerDay * FIXTURE.days,
    demMWh, opex: demMWh * costPerMWh, renPct: FIXTURE.renew,
    tradeNet: 0, capexNew: 0, spareMW: FIXTURE.spare }, e);
}
function inputs(E, change = () => ({}), m = E.t) {
  return Object.fromEntries(E.order.map(id => {
    const o = change(id, m, E) || {};
    return [id, { energy: energy(E.cities[id], o.energy),
      policy: Object.assign({ taxRes: 0, taxInd: 0, service: 0, incentive: 0 }, o.policy) }];
  }));
}
function initial(seed = SEEDS[0], months = 36, data = D) {
  const E = X.initCities(IDS, data, { seed, months });
  return X.calibrate(E, inputs(E), data);
}
function run(months, change = () => ({}), seed = SEEDS[0], data = D) {
  let E = initial(seed, months, data);
  const start = clone(E), reports = [], states = [];
  for (let m = 0; m < months; m++) {
    const r = X.monthStep(E, inputs(E, change, m), data);
    if (!r || !r.E || !r.report) throw new Error(`monthStep ${m + 1}달 E/report 없음`);
    E = r.E; reports.push(r.report); states.push(E);
  }
  return { start, E, reports, states };
}
const lossPct = (r, id, m = r.states.length - 1) =>
  (r.states[m].cities[id].pop / r.start.cities[id].pop - 1) * 100;
const sharePct = (r, id, m = r.states.length - 1) =>
  ((r.states[m].cities[id].pop / r.states[m].totals.pop) /
    (r.start.cities[id].pop / r.start.totals.pop) - 1) * 100;
function operating(r, id) {
  return sum(r.reports.slice(0, 12).map(R => {
    const f = R.fiscal?.[id];
    if (![f?.revTotal, f?.expTotal, f?.exp?.capex].every(finite))
      throw new Error(`${id} fiscal 운영 수지 계약 필드 없음`);
    return f.revTotal - (f.expTotal - f.exp.capex);
  }));
}
function param(key, grade, expected) {
  const p = D.params[key];
  ok(!!p && finite(p.v) && p.grade === grade && typeof p.note === "string" && p.note.length > 0 &&
    (expected == null || Math.abs(p.v - expected) < 1e-9),
  `params.${key}=${JSON.stringify(p)} (목표 ${expected ?? "유한값"}, ${grade}, note)`);
}

block("B1", () => {
  param("betaPopReal", "M"); param("betaIndReal", "M");
  param("eduSpeed", "G"); param("startMix", "G");
  // ECON-BALANCE B1(v1.1): startMix 값은 회복·안정 목표로 정한다(0.2 고정 → 0..1 범위). 행동 목표는 아래 단언이 판정.
  ok(D.params.startMix && D.params.startMix.v >= 0 && D.params.startMix.v <= 1, `params.startMix 0..1 (${D.params.startMix && D.params.startMix.v})`);
  const stable = SEEDS.map(seed => run(36, undefined, seed));
  IDS.forEach(id => test(`${id} 40씨앗 반응`, () => {
    for (const [uns, lo, hi, drop] of [[100, -8, -3, 20], [5, -2.5, -0.5, 6]]) {
      const rr = SEEDS.map(seed => run(12, cid => cid === id ? { energy: { unsPct: uns } } : {}, seed));
      const pop = mean(rr.map(r => lossPct(r, id)));
      const appr = mean(rr.map(r => r.E.cities[id].approval - r.start.cities[id].approval));
      ok(finite(pop) && pop >= lo && pop <= hi, `${id} 정전${uns}% 12달 주민 ${fmt(pop)}% (목표 ${hi}%~${lo}%, 40씨앗)`);
      ok(finite(appr) && appr <= -drop, `${id} 정전${uns}% 지지율 ${fmt(appr)}점 (목표 ≤-${drop})`);
    }
    const rec = SEEDS.map(seed => run(24, (cid, m) => cid === id && m < 6 ? { energy: { unsPct: 100 } } : {}, seed));
    const peak = mean(rec.map(r => Math.max(0, ...r.states.map((_, m) => -lossPct(r, id, m)))));
    const end = mean(rec.map(r => Math.max(0, -lossPct(r, id))));
    ok(peak > 0 && finite(end) && end <= peak * 0.6,
      `${id} 6달 정전→18달 회복 최대손실 ${fmt(peak)}%, 마지막 ${fmt(end)}% (목표 ≤${fmt(peak * 0.6)}%)`);
    const drift = Math.max(...Array.from({ length: 36 }, (_, m) => Math.abs(mean(stable.map(r => sharePct(r, id, m))))));
    ok(finite(drift) && drift <= 0.6, `${id} 보통 조건 36달 최대 몫 변화 ${fmt(drift)}% (목표 ≤0.6%, 상대 변화)`);
  }));
  test("배속을 실제 사용", () => {
    if (!["betaPopReal", "betaIndReal", "eduSpeed"].every(k => finite(D.params[k]?.v))) {
      ok(false, "현실 계수×교육용 배속 사용 검증: 계약 필드 없음"); return;
    }
    const off = clone(D); off.params.eduSpeed.v = 0;
    const zeroReal = clone(D); zeroReal.params.betaPopReal.v = 0; zeroReal.params.betaIndReal.v = 0;
    const fast = clone(D); fast.params.eduSpeed.v *= 2;
    const change = id => id === SMALL ? { energy: { unsPct: 100 } } : {};
    const a = run(12, change, SEEDS[0], off), b = run(12, change, SEEDS[0], zeroReal), c = run(12, change, SEEDS[0], fast);
    for (const key of ["pop", "ind"]) {
      const av = a.E.cities[SMALL][key], bv = b.E.cities[SMALL][key], cv = c.E.cities[SMALL][key];
      ok(av === bv && cv < av, `${SMALL} ${key} 배속0=${av}, 현실계수0=${bv}, 배속2배=${cv} (곱 사용)`);
    }
  });
});

block("B2", () => {
  param("approvalDrop", "G", 10);
  const baseline = run(12);
  IDS.forEach(id => test(`${id} 평가`, () => {
    const bad = run(12, cid => cid === id ? { energy: { unsPct: 5, renPct: 0 },
      policy: { taxRes: 2, taxInd: 2, service: -2 } } : {});
    for (const [label, r, expected] of [["악조건", bad, false], ["보통 조건", baseline, true]]) {
      const c = r.E.cities[id], review = r.reports[11].review?.[id];
      ok(review?.pass === expected, `${id} ${label} 평가 pass=${review?.pass}, 지지율=${fmt(c.approval)} (목표 ${expected})`);
      ok(finite(c.approval0) && Math.abs(c.approval0 - r.start.cities[id].approval) < 1e-6,
        `${id} ${label} approval0=${c.approval0}, 보정 시작=${fmt(r.start.cities[id].approval)}`);
      ok(finite(c.approval0) && typeof review?.pass === "boolean" &&
        review.pass === (c.approval >= c.approval0 - 10), `${id} ${label} 시작 기준 평가 계약`);
    }
  }));
});

block("B3", () => {
  const base = run(12);
  // 세금은 첫 달 주민 수에 대해 발생하므로 첫 달 상태로 나눈다.
  const first = IDS.map(id => base.reports[0].fiscal?.[id]?.rev?.resTax / base.states[0].cities[id].pop);
  const err = (Math.max(...first) - Math.min(...first)) / mean(first);
  ok(first.every(finite) && finite(err) && err <= 0.01,
    `주민 1인당 세금 상대 차이 ${fmt(err * 100)}% (목표 ≤1%), ${JSON.stringify(Object.fromEntries(IDS.map((id, i) => [id, first[i]])))}`);
  IDS.forEach(id => test(`${id} 정책 수지`, () => {
    const low = run(12, cid => cid === id ? { policy: { taxRes: -2, taxInd: -2, service: 2 } } : {});
    const high = run(12, cid => cid === id ? { policy: { taxRes: 2, taxInd: 2, service: -2 } } : {});
    const l = operating(low, id), delta = operating(high, id) - operating(base, id);
    const drop = high.E.cities[id].approval - base.E.cities[id].approval;
    ok(l < 0, `${id} 저세율·서비스+2 연 운영 수지 ${fmt(l)}억 (목표 <0)`);
    ok(delta >= 0.3 * D.start[id].cash0, `${id} 고세율 수지 개선 ${fmt(delta)}억 (목표 ≥${fmt(0.3 * D.start[id].cash0)})`);
    ok(drop <= -8, `${id} 고세율 지지율 차이 ${fmt(drop)}점 (목표 ≤-8)`);
  }));
  const winners = []; let completed = 0;
  IDS.forEach(id => test(`${id} 5×5 정책 격자`, () => {
    const grid = [];
    for (let tax = -2; tax <= 2; tax++) for (let service = -2; service <= 2; service++) {
      const r = run(36, cid => cid === id ? { policy: { taxRes: tax, taxInd: tax, service } } : {});
      const score = X.score(r.E, D)?.by?.[id]?.score;
      if (!finite(score)) throw new Error(`${id} score.by.score 없음`);
      grid.push({ tax, service, score });
    }
    const best = Math.max(...grid.map(x => x.score));
    const target = grid.find(x => x.tax === -2 && x.service === 2);
    if (target.score === best) winners.push(id); // 공동 1위도 지배 전략으로 센다.
    completed++;
    ok(grid.length === 25, `${id} 격자 25칸 실행`);
  }));
  ok(winners.length <= 2 && completed === IDS.length,
    `저세율·서비스+2 36달 1위 ${winners.length}곳 ${winners.join(",")} (목표 ≤2곳, 격자 완료 ${completed}/${IDS.length}, 같은 씨앗·한 도시만 정책 변경)`);
  // 계수 '약 3배', '0.5 수준'은 권고: 정확한 수치 대신 위 행동 목표로 판정한다.
});

block("B4", () => {
  const baseline = run(12);
  IDS.forEach(id => test(`${id} 요금과 거래`, () => {
    const trade = run(12, cid => cid === id ? { energy: { tradeNet: D.start[id].cash0 * 10 } } : {});
    const a = baseline.reports[11].cities?.[id]?.Lparts?.price, b = trade.reports[11].cities?.[id]?.Lparts?.price;
    ok(finite(a) && finite(b) && Math.abs(a - b) < 1e-9, `${id} 거래0 price=${a}, 거래증가 price=${b} (목표 동일)`);
    const prices = [0.3, 0.5].map(mul => {
      // 모든 도시를 포함한 산술 평균이 같은 0.012가 되게 나머지 원가를 조정한다.
      const rest = (IDS.length - mul) / (IDS.length - 1);
      const r = run(12, cid => ({ energy: { costPerMWh: FIXTURE.cost * (cid === id ? mul : rest) } }));
      return r.reports[11].cities?.[id]?.Lparts?.price;
    });
    ok(prices.every(finite) && prices[0] === prices[1], `${id} 원가 평균0.3/0.5 price=${prices.join("/")} (목표 동일)`);
  }));
  test("평균에 원가0 도시도 포함", () => {
    const r = run(12, id => id === SMALL ? { energy: { costPerMWh: 0 } } : {});
    const id = IDS.find(cid => cid !== SMALL), p = r.reports[11].cities?.[id]?.Lparts?.price;
    const b = baseline.reports[11].cities?.[id]?.Lparts?.price;
    ok(finite(p) && finite(b) && p < b, `원가0 도시 포함: 다른 도시 price=${p}, 기준=${b} (평균 하락)`);
  });
  const markup = D.params.tariffMarkup;
  ok(finite(markup?.v) && markup?.grade === "G" && !!markup?.note, `params.tariffMarkup=${JSON.stringify(markup)} (G·note 필요)`);
  IDS.forEach(id => test(`${id} 차익 보고`, () => {
    const R = baseline.reports[0], f = R.fiscal?.[id];
    const dem = energy(baseline.start.cities[id]).demMWh;
    const gross = dem * FIXTURE.cost * (1 + markup?.v);
    const margin = gross - dem * FIXTURE.cost;
    ok(finite(f?.tariffGross) && finite(gross) && Math.abs(f.tariffGross - gross) < 0.01,
      `${id} tariffGross=${f?.tariffGross} (목표 ${fmt(gross)})`);
    ok(finite(f?.rev?.tariff) && finite(margin) && Math.abs(f.rev.tariff - margin) < 0.01,
      `${id} rev.tariff=${f?.rev?.tariff} (차익 목표 ${fmt(margin)})`);
  }));
  test("비싼 전력의 음수 차익", () => {
    // 원가를 10배 올린 한 도시. 평균은 모든 도시의 입력 원가로 직접 구한다.
    const E = initial(), ins = inputs(E, id => id === SMALL ? { energy: { costPerMWh: FIXTURE.cost * 10 } } : {});
    const avg = mean(IDS.map(id => ins[id].energy.costPerMWh));
    const e = ins[SMALL].energy, want = e.demMWh * (avg * (1 + markup?.v) - e.costPerMWh);
    const f = X.monthStep(E, ins, D)?.report?.fiscal?.[SMALL];
    ok(finite(want) && want < 0 && finite(f?.rev?.tariff) && Math.abs(f.rev.tariff - want) < 0.01,
      `${SMALL} 비싼 전력 차익=${f?.rev?.tariff}, 목표=${fmt(want)} (음수 허용)`);
  });
});

block("B5", () => {
  const E = initial();
  IDS.forEach(id => test(`${id} 재정 점수`, () => {
    const parts = cash => { const e = clone(E); e.cities[id].cash = cash; return X.score(e, D)?.by?.[id]?.parts; };
    const a = parts(E.cities[id].cash0 * 3), b = parts(0), c = parts(-E.cities[id].debtCap * 0.5);
    const keys = Object.keys(a || {}).sort().join(",");
    ok(keys === ["pop", "ind", "fin", "co2", "appr", "rel"].sort().join(","), `${id} parts 키=${keys} (정확히 pop,ind,fin,co2,appr,rel)`);
    ok(a?.fin === 100 && b?.fin === 100, `${id} 현금3배/0 fin=${a?.fin}/${b?.fin} (목표 100/100)`);
    ok(finite(c?.fin) && c.fin <= 60, `${id} 한도50% 부채 fin=${c?.fin} (목표 ≤60)`);
  }));
  const w = D.params.wScore?.v;
  ok(finite(w?.fin) && w.fin > 0 && w.fin < 0.15 && !Object.hasOwn(w || {}, "cash"),
    `점수 가중 ${JSON.stringify(w)} (fin>0,<0.15, cash 제거)`);
});

block("B6", () => {
  const r = run(12);
  IDS.forEach(id => test(`${id} 보통 수지`, () => {
    const value = operating(r, id), ratio = value / D.start[id].cash0;
    ok(finite(ratio) && ratio >= 0.4 && ratio <= 0.8,
      `${id} 연 운영 수지 ${fmt(value)}억 / cash0=${fmt(ratio)} (목표 0.4~0.8)`);
  }));
});

block("B7", () => {
  const baseline = run(24);
  IDS.forEach(id => test(`${id} 거래와 지방채`, () => {
    const r = run(24, (cid, m) => cid === id && m === 1 ? { energy: { tradeNet: D.start[id].cash0 * 100 } } : {});
    for (const m of [1, 2]) {
      const cap = r.states[m].cities[id].debtCap, before = r.states[m - 1].cities[id].debtCap;
      const delta = Math.abs(cap / before - 1);
      const control = baseline.states[m].cities[id].debtCap;
      ok(finite(delta) && delta <= 0.2, `${id} ${m + 1}달 debtCap ${fmt(before)}→${fmt(cap)}, 변화 ${fmt(delta * 100)}% (목표 ≤20%)`);
      ok(finite(cap) && finite(control) && Math.abs(cap - control) <= Math.max(0.1, control * 0.001),
        `${id} 거래 제외 한도=${fmt(cap)}, 무거래=${fmt(control)} (같은 세입)`);
    }
    for (const m of [11, 23]) {
      const rev12 = sum(r.reports.slice(m - 11, m + 1).map(R => {
        const f = R.fiscal?.[id];
        return f?.revTotal - f?.rev?.trade;
      }));
      const want = D.params.debtCapRatio?.v * rev12, cap = r.states[m].cities[id].debtCap;
      ok(finite(want) && finite(cap) && Math.abs(cap - want) <= 0.1,
        `${id} ${m + 1}달 최근12달 거래 제외 한도=${fmt(cap)}, 목표=${fmt(want)}`);
    }
    const first = r.reports[0].fiscal?.[id];
    const annual = (first?.revTotal - first?.rev?.trade - first?.rev?.subsidy) * 12 + first?.rev?.subsidy;
    for (const m of [0, 5]) {
      const cap = r.states[m].cities[id].debtCap, want = D.params.debtCapRatio?.v * annual;
      ok(finite(want) && finite(cap) && Math.abs(cap - want) <= 0.1,
        `${id} ${m + 1}달 첫달 기준 연환산 한도=${fmt(cap)}, 목표=${fmt(want)} (1월 지원금은 1회)`);
    }
  }));
});

block("B8", () => {
  // 모든 도시가 충족 가능한 동일 조건의 제안: 도시별 자격 차이로 순위를 가리지 않는다.
  const offer = { id: "fixture", name: "검사용 기업", workers: 1, mw: 1, rePct: 0, unsMax: 100 };
  const won = {};
  SEEDS.forEach(seed => test(`${seed} 동일 입력 승자`, () => {
    const E = initial(seed), ev = X.evalOffer(offer, E, inputs(E), D);
    const id = ev?.rank?.find(cid => ev.by?.[cid]?.ok === true);
    if (!id) throw new Error("evalOffer rank 또는 충족 도시 없음");
    won[id] = (won[id] || 0) + 1;
  }));
  ok(Object.keys(won).length >= 2, `40씨앗 동일 입력 승자 ${JSON.stringify(won)} (목표 ≥2곳)`);
  IDS.forEach(id => test(`${id} MW 누락`, () => {
    const E = initial(), ins = inputs(E); delete ins[id].energy.spareMW;
    const by = X.evalOffer(offer, E, ins, D)?.by?.[id];
    ok(by?.checks?.mw?.ok === false && by?.ok === false,
      `${id} spareMW 누락 mw.ok=${by?.checks?.mw?.ok}, 전체 ok=${by?.ok} (둘 다 false)`);
  }));
  const ranks = SEEDS.map(seed => {
    const change = id => id === SMALL ? { energy: { renPct: 100 }, policy: { incentive: 20, taxInd: -2 } } : {};
    const r = run(12, change, seed);
    return X.evalOffer(offer, r.E, inputs(r.E, change), D)?.rank?.[0];
  });
  ok(ranks.every(id => id === SMALL), `최소 cash0 ${SMALL} 보조20·산업세-2·재생100 1위 ${ranks.filter(id => id === SMALL).length}/40 (목표 40/40)`);
});

block("B10", () => {
  test("yearStart 지급 가드", () => {
    const E = initial(), before = JSON.stringify(E), one = X.yearStart(E, D), two = X.yearStart(one.E, D);
    ok(JSON.stringify(E) === before, "yearStart 입력 불변");
    ok(one.E?.paidYear === E.year, `paidYear=${one.E?.paidYear} (목표 ${E.year})`);
    IDS.forEach(id => {
      ok(one.E.cities[id].cash > E.cities[id].cash, `${id} 첫 yearStart 지급`);
      ok(two.E?.cities?.[id]?.cash === one.E.cities[id].cash,
        `${id} 같은 해 중복 지급 현금 ${fmt(one.E.cities[id].cash)}→${fmt(two.E?.cities?.[id]?.cash)} (목표 동일)`);
    });
  });
  for (const months of [12, 24, 36]) test(`${months}달 길이 제한`, () => {
    const r = run(months), before = JSON.stringify(r.E), next = X.monthStep(r.E, inputs(r.E), D);
    ok(next?.report === null && JSON.stringify(next?.E) === before && JSON.stringify(r.E) === before,
      `${months}달 뒤 monthStep t=${next?.E?.t}, report=${next?.report === null ? "null" : typeof next?.report} (목표 상태 불변·report:null)`);
  });
  param("newsMin", "G"); param("newsFrac", "G");
  test("작은 흐름에 이주·이전 뉴스 없음", () => {
    const r = run(12);
    const rows = r.reports.slice(0, 3);
    const news = rows.flatMap(R => R.news || []).filter(s => /→.*(?:이주|이전)/.test(s));
    const sizes = rows.map(R => Object.fromEntries(["pop", "ind"].map(k => [k, Math.max(0, ...(R.flows?.[k] || []).map(f => f.n))])));
    ok(news.length === 0, `보통 조건 초기3달 작은 흐름 ${JSON.stringify(sizes)}, 뉴스 ${JSON.stringify(news)} (목표 없음)`);
  });
});

failures.forEach(message => console.log(`FAIL ${message}`));
console.log(`pass ${pass} fail ${fail}`);
process.exitCode = fail ? 1 : 0;
