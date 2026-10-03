"use strict";
const { X, D, IDS, run } = require("./lib");
const P = k => D.params[k].v;
// fiscalNorm: per-city multiplier and marginal yearly net tax per resident / per worker (억, x1e4 = per 만명)
const E = X.initCities(IDS, D, {});
console.log("fiscalNorm fk and marginal value per 10k (억/yr):");
IDS.forEach(id => { const c = E.cities[id], fk = c.fk; console.log(" ", id.padEnd(11), "fk", fk, " resident", (12 * 1e4 * fk * (P("resTax") - P("svcCost"))).toFixed(2), " worker", (12 * 1e4 * fk * P("indTax")).toFixed(2), " subsidy", c.subsidy || "-", " cash0", c.cash0); });
const D2 = JSON.parse(JSON.stringify(D)); D2.params.fiscalNorm.v = 0; const E0 = X.initCities(IDS, D2, {});
console.log("fiscalNorm=0 → yearly (tax-svc+subsidy)/cash0:", IDS.map(id => { const c = E0.cities[id]; const yr = 12 * (c.pop * P("resTax") + c.ind * P("indTax") - c.pop * P("svcCost")); return id + " " + ((yr + X.yearStart(E0, D2).subsidy[id]) / c.cash0).toFixed(2); }).join(", "));
// approval under "realistically bad" play
for (const [lbl, f] of [["uns5 tax+2 svc-2 ren0", () => ({ e: { uns: 5, ren: 0 }, p: { taxRes: 2, taxInd: 2, service: -2 } })], ["uns2 hosp tax+2 svc-2", () => ({ e: { uns: 2, hosp: 3, ren: 0 }, p: { taxRes: 2, taxInd: 2, service: -2 } })], ["policy only tax+2 svc-2", () => ({ p: { taxRes: 2, taxInd: 2, service: -2 } })]]) {
  const r = run({ seed: "a", months: 12, f });
  console.log(lbl.padEnd(26), "approval t12:", IDS.map(id => r.reps[11].groups[id].approval).join(" "), "pass:", Object.values(r.reps[11].review).map(v => v.pass).join(","));
}
// why line under neutral: does news blame tiny flows?
const r = run({ seed: "a", months: 3 });
console.log("neutral news:", r.reps.map(x => x.news.filter(n => n.includes("→")).join(" | ")).join(" || "));
