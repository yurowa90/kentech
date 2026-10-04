"use strict";
const { X, D, IDS, sum, run } = require("./lib");
let fail = 0, checks = 0; const bad = (c, m) => { checks++; if (!c) { fail++; if (fail < 30) console.log("FAIL", m); } };
const scan = (x, w, d = 0) => { if (d > 14) return; if (typeof x === "number") bad(isFinite(x), "non-finite " + w); else if (x && typeof x === "object") for (const k in x) scan(x[k], w + "." + k, d + 1); };
function prng(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let subsidyCount = {};
for (let s = 0; s < 40; s++) {
  const R = prng(s + 7), pick = a => a[Math.floor(R() * a.length)];
  const f = () => ({ e: { uns: pick([0, 0, 0.5, 3, 5, 20, 100]), hosp: pick([0, 0, 5]), ren: R() * 100, trade: (R() - 0.5) * pick([0, 10, 1000]), capex: pick([0, 0, 50, 5000]), costMul: pick([0.2, 1, 3]) },
    p: { taxRes: pick([-2, -1, 0, 1, 2, 7, NaN]), taxInd: pick([-2, 0, 2]), service: pick([-2, 0, 2]), incentive: pick([0, 0, 5, 1e9, -3]) } });
  subsidyCount = {};
  const { E, reps } = run({ seed: "inv" + s, months: 36, f, opts: s % 5 === 0 ? { cash: { anseong: -5000 } } : {}, onStep: (Ep, r) => {
    const E2 = r.E, R2 = r.report;
    bad(sum(E2.order.map(id => E2.cities[id].pop)) === E2.totals.pop, `pop sum t${Ep.t}`);
    bad(sum(E2.order.map(id => E2.cities[id].ind)) === E2.totals.ind, `ind sum t${Ep.t}`);
    bad(E2.totals.pop === Math.round(E2.totals.pop0 * Math.pow(1 + D.params.gpYear.v, E2.t / 12)), "pop growth formula");
    E2.order.forEach(id => {
      const c = E2.cities[id], F = R2.fiscal[id];
      bad(Number.isInteger(c.pop) && Number.isInteger(c.ind) && c.pop > 0, "int/pos " + id);
      bad(Ep.cities[id].cash === F.cashBefore && c.cash === F.cashAfter, "cash continuity " + id);
      const lhs = F.cashBefore + sum(Object.values(F.rev)) - sum(Object.values(F.exp));
      bad(Math.abs(lhs - F.cashAfter) < 1e-9, `identity ${id} t${Ep.t} diff ${lhs - F.cashAfter}`);
      if (F.rev.subsidy > 0) subsidyCount[id] = (subsidyCount[id] || 0) + 1;
      bad(R2.groups[id].approval >= 0 && R2.groups[id].approval <= 100, "approval range");
    });
    R2.score.rank.forEach(x => { bad(x.score >= 0 && x.score <= 100, "score range"); Object.values(x.parts).forEach(v => bad(v >= 0 && v <= 100, "part range")); });
    scan(R2, "report"); scan(E2, "E");
  } });
  bad(Object.values(subsidyCount).every(n => n === 3), "subsidy paid exactly 3x in 36 months: " + JSON.stringify(subsidyCount));
  // determinism
  const a = run({ seed: "inv" + s, months: 36, f: (() => { const R = prng(s + 7); return () => ({ e: { uns: R() * 5 } }); })() });
  const b = run({ seed: "inv" + s, months: 36, f: (() => { const R = prng(s + 7); return () => ({ e: { uns: R() * 5 } }); })() });
  bad(JSON.stringify(a.E) === JSON.stringify(b.E) && JSON.stringify(a.reps) === JSON.stringify(b.reps), "determinism");
}
// different seeds give different intl
const r1 = run({ seed: "A", months: 24 }), r2 = run({ seed: "B", months: 24 });
console.log("seed A vs B intl differ:", JSON.stringify(r1.E.intl) !== JSON.stringify(r2.E.intl));
// input objects not mutated / E0 not mutated
const E0 = X.initCities(IDS, D, { seed: "m" }), snap = JSON.stringify(E0); X.monthStep(E0, {}, D); X.yearStart(E0, D);
console.log("E0 immutable:", snap === JSON.stringify(E0));
// yearStart double pay
let E = X.initCities(IDS, D, { seed: "y" }); const c0 = E.cities.anseong.cash;
E = X.yearStart(E, D).E; const c1 = E.cities.anseong.cash; E = X.yearStart(E, D).E;
console.log("yearStart twice in same year: anseong cash", c0, "->", c1.toFixed(2), "->", E.cities.anseong.cash.toFixed(2), E.cities.anseong.cash === c1 ? "(guard ok)" : "(PAID TWICE)");
console.log(`checks ${checks}, fails ${fail}`);
