/* KCP.econ 불변 조건 시험 + 균형 판단용 시나리오 출력. node test-econ.js */
"use strict";
const path = require("path");
const fs = require("fs");
const ROOT = path.resolve(__dirname, "../..");
global.window = { KCP: {} };
require(path.join(ROOT, "ui/econ-data.js"));
require(path.join(ROOT, "ui/econ.js"));
const KCP = window.KCP, X = KCP.econ, D = KCP.ECON_DATA;
const IDS = ["hwaseong", "pyeongtaek", "anseong", "dangjin", "asan", "cheonan"];

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; if (fails < 40) console.log("FAIL:", msg); } }
const sum = a => a.reduce((s, x) => s + x, 0);

// Math.random 금지: 부르면 바로 실패
const realRandom = Math.random;
Math.random = () => { throw new Error("Math.random called"); };
const src = fs.readFileSync(path.join(ROOT, "ui/econ.js"), "utf8");
ok(!/Math\.random/.test(src), "econ.js에 Math.random 없음");
ok(!/document\.|window\.(?!KCP)/.test(src.replace(/const KCP = window\.KCP/, "")), "econ.js에 DOM 없음");

// 시험용 씨앗 난수
function prng(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 도시 묶음 규모(build-maps goals)로 만든 그럴듯한 입력
const BASE = { hwaseong: { cpd: 3.2, co2: 48 }, pyeongtaek: { cpd: 3, co2: 45 }, anseong: { cpd: 0.4, co2: 6 }, dangjin: { cpd: 1.8, co2: 28 }, asan: { cpd: 1.5, co2: 23 }, cheonan: { cpd: 1.2, co2: 18 } };
function energyOf(id, days, o) {
  o = o || {};
  const b = BASE[id], opex = b.cpd * days * (o.costMul || 1);
  return {
    unsPct: o.uns || 0, hospH: o.hosp || 0, costPerMWh: 0.012 * (o.costMul || 1), co2Local: b.co2 * days * 0.6 * (o.co2Mul || 1),
    co2: b.co2 * days * (o.co2Mul || 1), renPct: o.ren == null ? 15 : o.ren, tradeNet: o.trade || 0, opex,
    capexNew: o.capex || 0, demMWh: opex / 0.012 / (o.costMul || 1), spareMW: o.spare == null ? 1 : o.spare
  };
}

function scanFinite(x, where, depth) {
  if (depth > 12) return;
  if (typeof x === "number") { ok(isFinite(x), `유한값 아님 ${where}`); return; }
  if (x && typeof x === "object") Object.keys(x).forEach(k => scanFinite(x[k], where + "." + k, (depth || 0) + 1));
}
const in100 = v => typeof v === "number" && v >= 0 && v <= 100;

function checkStep(Eprev, res, label) {
  const { E, report: R } = res;
  const pops = IDS.filter(id => E.cities[id]).map(id => E.cities[id].pop), inds = IDS.filter(id => E.cities[id]).map(id => E.cities[id].ind);
  const m = E.t;
  ok(sum(pops) === E.totals.pop, `${label} 인구 합 = 총량 (${sum(pops)} vs ${E.totals.pop})`);
  ok(sum(inds) === E.totals.ind, `${label} 산업 합 = 총량`);
  ok(E.totals.pop === Math.round(E.totals.pop0 * Math.pow(1 + D.params.gpYear.v, m / 12)), `${label} 인구 총량 성장식`);
  ok(E.totals.ind === Math.round(E.totals.ind0 * Math.pow(1 + D.params.giYear.v, m / 12)), `${label} 산업 총량 성장식`);
  ok(pops.every(Number.isInteger) && inds.every(Number.isInteger), `${label} 정수 인구·산업`);
  const ids = E.order;
  ok(sum(ids.map(id => R.net[id].pop)) === 0 && sum(ids.map(id => R.net[id].ind)) === 0, `${label} 이동 합 0`);
  // 쌍 흐름 = 순이동
  ["pop", "ind"].forEach(k => ids.forEach(id => {
    const outF = sum(R.flows[k].filter(f => f.from === id).map(f => f.n)), inF = sum(R.flows[k].filter(f => f.to === id).map(f => f.n));
    ok(inF - outF === R.net[id][k], `${label} ${k} 흐름 표 = 순이동 ${id}`);
    ok(E.cities[id][k] === Eprev.cities[id][k] + R.net[id][k] + R.net[id][k === "pop" ? "growPop" : "growInd"], `${label} ${k} 전+이동+성장=후 ${id}`);
  }));
  ids.forEach(id => {
    const F = R.fiscal[id], c = E.cities[id];
    ok(Math.abs(F.cashBefore + F.revTotal - F.expTotal - F.cashAfter) < 1e-6, `${label} 현금 항등식 ${id}`);
    ok(Math.abs(sum(Object.values(F.rev)) - F.revTotal) < 1e-6 && Math.abs(sum(Object.values(F.exp)) - F.expTotal) < 1e-6, `${label} 내역 합 ${id}`);
    ok(F.cashBefore === Eprev.cities[id].cash && F.cashAfter === c.cash, `${label} 현금 이어짐 ${id}`);
    const Cr = R.cities[id];
    ok(in100(Cr.L) && in100(Cr.A), `${label} L·A 0–100 ${id}`);
    Object.values(Cr.Lparts).concat(Object.values(Cr.Aparts)).forEach(v => ok(in100(v), `${label} 부분 점수 ${id}`));
    Object.values(R.groups[id].sat).forEach(v => ok(in100(v), `${label} 집단 만족 ${id}`));
    ok(in100(R.groups[id].approval), `${label} 지지율 ${id}`);
    ok(c.pop > 0 && c.ind > 0, `${label} 양수 ${id}`);
  });
  R.score.rank.forEach(x => { ok(in100(x.score), `${label} 점수 ${x.id}`); Object.values(x.parts).forEach(v => ok(in100(v), `${label} 점수 부분 ${x.id}`)); });
  scanFinite(E, label + " E", 0); scanFinite(R, label + " report", 0);
}

function run(seed, months, inputsFn, ids, base) {
  let E = X.initCities(ids || IDS, D, { seed, months });
  if (base) E = X.calibrate(E, base, D);
  const reports = [];
  for (let i = 0; i < months; i++) {
    const before = JSON.stringify(E);
    const res = X.monthStep(E, inputsFn(E, i), D);
    ok(JSON.stringify(E) === before, `monthStep이 입력 E를 바꾸지 않음 t=${i}`);
    checkStep(E, res, `[${seed} t${i}]`);
    E = res.E; reports.push(res.report);
  }
  return { E, reports };
}

// 1) 여러 입력 36턴
const varied = (seed) => (E, t) => {
  const r = prng(1000 + t * 7 + seed), o = {};
  E.order.forEach(id => {
    o[id] = {
      energy: energyOf(id, X.daysOf(E.year, E.month), { uns: r() < 0.3 ? r() * 4 : 0, hosp: r() < 0.05 ? 2 : 0, costMul: 0.7 + r() * 0.8, co2Mul: 0.5 + r(), ren: r() * 60, trade: (r() - 0.5) * 10, capex: r() < 0.2 ? r() * 60 : 0 }),
      policy: { taxRes: Math.floor(r() * 5) - 2, taxInd: Math.floor(r() * 5) - 2, service: Math.floor(r() * 5) - 2, incentive: r() < 0.3 ? r() * 8 : 0 }
    };
  });
  return o;
};
const V1 = run("alpha", 36, varied(1));
const shares = id => V1.reports.map(R => R.cities[id].pop / R.totals.pop);
IDS.forEach(id => { const s = shares(id); ok(Math.max(...s) < 0.6 && Math.min(...s) > 0.03, `몫 3–60% ${id} (${Math.min(...s).toFixed(3)}–${Math.max(...s).toFixed(3)})`); });

// 2) 결정성
const V2 = run("alpha", 36, varied(1));
ok(JSON.stringify(V1.E) === JSON.stringify(V2.E) && JSON.stringify(V1.reports) === JSON.stringify(V2.reports), "같은 입력·씨앗 → 같은 결과");
const V3 = run("beta", 36, varied(1));
ok(JSON.stringify(V1.E.intl) !== JSON.stringify(V3.E.intl), "다른 씨앗 → 다른 국제 지수");

// 3) 극단 입력
const extremes = [
  () => ({ energy: { unsPct: 100, hospH: 1e9, costPerMWh: 1e9, co2Local: 1e12, renPct: -5, tradeNet: -1e12, opex: 1e12, capexNew: 1e12 }, policy: { taxRes: 2, taxInd: 2, service: -2, incentive: 1e12 } }),
  () => ({ energy: { unsPct: -50, costPerMWh: 0, co2Local: 0, renPct: 500, tradeNet: 1e12 }, policy: { taxRes: -2, taxInd: -2, service: 2, incentive: -9 } }),
  () => ({ energy: { unsPct: NaN, costPerMWh: Infinity, co2Local: "x", renPct: null, opex: undefined }, policy: { taxRes: 9, taxInd: -9, service: "a" } }),
  () => null,
  () => ({})
];
const ext = run("ext", 36, (E, t) => { const o = {}; E.order.forEach((id, i) => { o[id] = extremes[(i + t) % extremes.length](); }); return o; });
// 한 도시만 완벽, 나머지 정전 100% — 그래도 한 도시가 다 가져가지 않음
IDS.forEach(win => {
  const W = run("win-" + win, 36, (E) => { const o = {}; E.order.forEach(id => { o[id] = id === win ? { energy: { unsPct: 0, costPerMWh: 0.005, renPct: 100, co2Local: 0 }, policy: { taxRes: -2, taxInd: -2, service: 2, incentive: 50 } } : { energy: { unsPct: 100, hospH: 10, costPerMWh: 0.05, co2Local: 1e6 }, policy: { taxRes: 2, taxInd: 2, service: -2 } }; }); return o; });
  const s = W.E.cities[win].pop / W.E.totals.pop;
  ok(s < 0.6, `독식 없음(${win} 몫 ${(s * 100).toFixed(1)}%)`);
  IDS.forEach(id => ok(W.E.cities[id].pop / W.E.totals.pop > 0.03 || id === win, `극단에서도 3% 이상 ${id} (${win} 승)`));
});
// 도시 2곳만 참가
run("two", 24, (E) => ({ pyeongtaek: { energy: { unsPct: 2 } }, dangjin: { energy: { unsPct: 0 } } }), ["pyeongtaek", "dangjin"]);

// 4) yearStart 순수 · 1월 지원금
{
  const E = X.initCities(IDS, D, { seed: "y" }), before = JSON.stringify(E);
  const y = X.yearStart(E, D);
  ok(JSON.stringify(E) === before, "yearStart가 입력을 바꾸지 않음");
  IDS.forEach(id => ok(y.subsidy[id] > 0 && Math.abs(y.E.cities[id].cash - E.cities[id].cash - y.subsidy[id]) < 1e-9, `yearStart 지원금 ${id}`));
  const R0 = V1.reports[0], R1 = V1.reports[1], R12 = V1.reports[12];
  ok(IDS.every(id => R0.fiscal[id].rev.subsidy > 0 && R1.fiscal[id].rev.subsidy === 0 && R12.fiscal[id].rev.subsidy > 0), "지원금은 1월에만");
  // 균형: 재정자립도 낮은 안성의 1인당 지원금 > 화성
  const pc = id => y.subsidy[id] / E.cities[id].pop;
  ok(pc("anseong") > pc("hwaseong"), "균형 몫: 자립도 낮을수록 1인당 더");
}

// 5) 기업 이전 희망
{
  const offs = []; V1.reports.forEach(R => R.offers.forEach(o => { if (o.t === R.t) offs.push(o); }));
  ok(offs.length >= 6 && offs.length <= 12, `36턴 동안 제안 ${offs.length}개`);
  for (let i = 1; i < offs.length; i++) ok(offs[i].t - offs[i - 1].t >= 3 && offs[i].t - offs[i - 1].t <= 6, "제안 간격 3–6턴");
  const R = V1.reports.find(r => r.offers.length), o = R.offers[0];
  ok(o.eval && o.eval.rank.length === 6 && IDS.every(id => typeof o.eval.by[id].ok === "boolean"), "evalOffer 결과");
  // 받아들이기: 총량 보존
  const Ebase = V1.E; Ebase.offers = [Object.assign({}, o, { until: 999 })];
  const acc = X.acceptOffer(Ebase, o.id, "anseong", D);
  ok(acc.ok && sum(IDS.map(id => acc.E.cities[id].ind)) === Ebase.totals.ind && sum(IDS.map(id => acc.E.cities[id].pop)) === Ebase.totals.pop, "acceptOffer 총량 보존");
  ok(acc.E.cities.anseong.ind - Ebase.cities.anseong.ind === o.workers, "acceptOffer 종사자 이동");
  ok(acc.E.offers.length === 0, "acceptOffer 제안 닫힘");
}

// 5b) 기준 맞추기: 시작 상태 그대로면 거의 움직이지 않는다
{
  const sq = (E) => { const o = {}; E.order.forEach(id => { o[id] = { energy: energyOf(id, 30, { uns: 0.5 }) }; }); return o; };
  const E0 = X.initCities(IDS, D, { seed: "q" });
  const Q = run("q", 24, sq, null, sq(E0));
  const maxMove = Math.max(...Q.reports.map(R => Math.max(...IDS.map(id => Math.abs(R.net[id].pop) / R.cities[id].pop))));
  ok(maxMove < 0.0005, `시작 상태 유지 → 이주 거의 없음(최대 ${(maxMove * 100).toFixed(3)}%/달)`);
}

// 6) 도우미
ok(X.seasonOfMonth(12) === "winter" && X.seasonOfMonth(4) === "spring" && X.seasonOfMonth(7) === "summer" && X.seasonOfMonth(10) === "autumn", "seasonOfMonth");
ok(X.monthsInGame(24) === 24 && X.monthsInGame(7) === 12, "monthsInGame");
ok(X.daysOf(2028, 2) === 29 && X.daysOf(2027, 2) === 28, "daysOf");
{ const c = V1.E.cities.pyeongtaek, d = X.demandMul(c); ok(Math.abs(d.res - c.pop / c.pop0) < 1e-3 && Math.abs(d.ind - c.ind / c.ind0) < 1e-3, "demandMul"); }
ok(X.roundSum([0.5, 0.5, -1], 0).reduce((a, b) => a + b, 0) === 0, "roundSum");
// 국제: CBAM 12턴부터, 사건 몇 개
ok(V1.reports[12].intl.cbam === 1 && V1.reports[11].intl.cbam === 0, "CBAM 2028년 1월부터");
ok(V1.reports.some(R => R.intl.started.some(s => s.id !== "cbam")), "무작위 국제 사건 발생");

Math.random = realRandom;
console.log(`\n시험: ${passes} 통과, ${fails} 실패\n`);

/* ---------- 시나리오: 당진 정전 3%, 평택 0%, 나머지 0.5% ---------- */
const statusQuo = (E) => { const o = {}; E.order.forEach(id => { o[id] = { energy: energyOf(id, 30, { uns: 0.5 }) }; }); return o; };
function scenario(title, cfg) {
  const S = run("scn", 36, (E, t) => {
    const o = {};
    E.order.forEach(id => {
      const c = cfg[id] || {};
      o[id] = { energy: energyOf(id, X.daysOf(E.year, E.month), { uns: c.uns == null ? 0.5 : c.uns, ren: c.ren, capex: t % 6 === 2 ? 20 : 0 }), policy: c.policy || {} };
    });
    return o;
  }, null, statusQuo(X.initCities(IDS, D, {})));
  console.log("== " + title + " ==");
  const head = ["턴", ...IDS.map(id => D.start[id].name.padEnd(6))].join(" | ");
  const rows = (lab, f) => { console.log(lab); console.log(head); [0, 5, 11, 17, 23, 29, 35].forEach(t => console.log([String(t + 1).padStart(2), ...IDS.map(id => f(S.reports[t], id))].join(" | "))); };
  rows("인구 변화(시작 대비 %) · 지역 총량 +0.6%/년 포함", (R, id) => ((R.cities[id].pop / D.start[id].pop0 - 1) * 100).toFixed(2).padStart(6));
  rows("산업 종사자 변화(%)", (R, id) => ((R.cities[id].ind / D.start[id].ind0 - 1) * 100).toFixed(2).padStart(6));
  rows("현금(억)", (R, id) => String(Math.round(R.fiscal[id].cashAfter)).padStart(6));
  rows("지지율(%)", (R, id) => R.groups[id].approval.toFixed(1).padStart(6));
  rows("살기 좋음 L / 산업 매력 A", (R, id) => `${Math.round(R.cities[id].L)}/${Math.round(R.cities[id].A)}`.padStart(6));
  const last = S.reports[35];
  console.log("점수 순위:", last.score.rank.map(x => `${x.rank}.${x.name} ${x.score}`).join("  "));
  console.log("1월 지원금(억):", IDS.map(id => `${D.start[id].name} ${Math.round(S.reports[0].fiscal[id].rev.subsidy)}`).join(" · "));
  const F = S.reports[3].fiscal.pyeongtaek;
  console.log("평택 4월 재정 내역:", JSON.stringify({ rev: F.rev, exp: F.exp }));
  console.log("집단(당진 36턴):", JSON.stringify(last.groups.dangjin));
  console.log("뉴스 예시:"); S.reports.slice(0, 14).forEach(R => R.news.forEach(n => console.log("  " + (R.t + 1) + "턴 " + n)));
  console.log("국제 지수 36턴:", JSON.stringify({ lng: last.intl.lng, fx: last.intl.fx, ship: last.intl.ship, semi: last.intl.export.semi, active: last.intl.active.map(a => a.name) }));
  console.log("");
  return S;
}
scenario("당진 정전 3% · 평택 0% · 나머지 0.5% (36턴)", { dangjin: { uns: 3 }, pyeongtaek: { uns: 0 } });
scenario("천안 세금 −2·서비스 +2 · 아산 세금 +2 · 정전 모두 0.5%", { cheonan: { policy: { taxRes: -2, taxInd: -2, service: 2 } }, asan: { policy: { taxRes: 2, taxInd: 2 } } });

process.exit(fails ? 1 : 0);
