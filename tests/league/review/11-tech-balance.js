"use strict";
// 독립 전략 검산: ECON-TECH-SPEC T5. 36달, 4전략×6도시, 같은 방 씨앗.
// 판정 G: 연구 몰빵−연구0 평균 점수는 (0,15], 공통 6도시 지배 전략 없음.
// 연구0도 건설·정책을 운영한다. 기준 AI의 확정 공급 확보를 모든 전략에 재사용한다.
// 각 판의 다른 5도시는 균형 AI. 기대 점수·순위는 구현에서 복사하지 않는다.
// 최초 고정정책0·잔여자금 건설 실험은 평균 연구 이득−2.25점, 작은3도시SMR미착공.
// 수정 근거: T5에는 세율0 고정 제한이 없다. 모든 전략에 같은 AI 재정 대응을 적용하고,
// 특화 해금 설비 착공 전에는 선택 투자를 미뤄 자금을 모은다. 필수 공급은 계속 확보한다.
// 도시 제외·점수 문턱 변경은 하지 않는다. 원 결과는 /tmp/kcp-tech-balance-fixed-policy.*.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ROOT = path.resolve(__dirname, "../../.."), OUT = process.env.TECH_BALANCE_OUT || "/tmp/kcp-tech-balance.json";
const ctx = vm.createContext({ console, document: { documentElement: {} }, KCP: { route() {}, on() {}, esc: x => x } });
ctx.window = ctx;
vm.runInContext('Math.random = () => { throw new Error("unseeded random"); };', ctx);
for (const n of ["build-maps", "tech-data", "build", "econ-data", "econ", "league-data", "league-core", "league-ai"])
  vm.runInContext(fs.readFileSync(path.join(ROOT, `ui/${n}.js`), "utf8"), ctx, { filename: n });
const { leagueCore: C, buildGame: B, leagueAI: AI, econ: X, ECON_DATA: D } = ctx.KCP;
const R = C.regionOf("south"), ids = R.teams.map(t => t.id), clone = x => JSON.parse(JSON.stringify(x));
const STRATEGIES = {
  research: ["grid", "fcst", "bms", "vpp", "sic", "tandem", "mass", "nbat", "ccu", "hvdc", "scable", "re100"],
  none: [],
  smr: ["smr", "grid", "fcst", "vpp", "sic", "ccu"],
  hydrogen: ["h2store", "h2mix", "grid", "fcst", "vpp", "bms", "sic", "tandem", "nbat", "mass"]
};
const names = { research: "연구 몰빵", none: "연구 0", smr: "SMR 조기", hydrogen: "수소 장주기" };
const report = { contract: "ECON-TECH-SPEC T5", seed: "tech-strategy-common", months: 36, runs: [], failures: [] };
let passes = 0;
function ok(test, label) { if (test) passes++; else { report.failures.push(label); console.log("FAIL:", label); } }
function select(id) { B.selectPack(C.teamDef(R, id).pack, "league"); }
function affordable(S, id, p) { return C.spendOf(B, S, R, id, p) <= C.budget(S, id); }
function add(S, id, plan, type) {
  const used = new Set(plan.builds.map(b => b.i));
  const anchors = [...new Set(plan.lines.flatMap(l => l.p))];
  if (!anchors.length) anchors.push(B.SITES.find(s => s.dem).tile);
  const tiles = B.TILES.filter(t => !used.has(t.i) && !B.siteRule(type, t));
  tiles.sort((a, b) => Math.min(...anchors.map(i => Math.hypot(a.X - B.TILES[i].X, a.Y - B.TILES[i].Y))) - Math.min(...anchors.map(i => Math.hypot(b.X - B.TILES[i].X, b.Y - B.TILES[i].Y))) || a.i - b.i);
  for (const tile of tiles) {
    const nearest = anchors.slice().sort((a, b) => Math.hypot(tile.X - B.TILES[a].X, tile.Y - B.TILES[a].Y) - Math.hypot(tile.X - B.TILES[b].X, tile.Y - B.TILES[b].Y))[0];
    const route = B.routePath(nearest, tile.i); if (!route) continue;
    const p = clone(plan); p.builds.push({ t: type, i: tile.i });
    for (let i = 0; i < route.length - 1; i += 79) p.lines.push({ p: route.slice(i, i + 80) });
    if (affordable(S, id, p)) return p;
  }
  return plan;
}
function focalPlan(S, id, strategy) {
  const prev = S.teams[id].plan || { builds: [], lines: [] }, rs = C.researchView(S, id);
  // 공통 건설 봇의 신규 연구 인력만 지운 뒤 전략별 인력·연구 순서를 적용한다.
  const target = strategy === "smr" ? "smr" : strategy === "hydrogen" ? "h2store" : null;
  const saving = target && !prev.builds.some(b => b.t === target);
  const style = saving ? { ...AI.STYLES.balanced, invest: 0 } : "balanced";
  const answer = AI.plan(S, R, id, B, style); select(id);
  let p = clone(answer.plan);
  p.builds = p.builds.filter(b => !["lab", "uni"].includes(b.t) || prev.builds.some(x => x.t === b.t && x.i === b.i));
  p.rq = strategy === "none" ? [] : rs.queue.filter(k => rs.stage[k] !== "done");
  if (strategy === "none") return { plan: p, econPol: answer.econPol };
  const pending = p.rq[0], card = saving && rs.adopted.includes(target) ? null :
    pending || STRATEGIES[strategy].find(k => !rs.stage[k] && !rs.adopted.includes(k) && !C.researchError(S, id, [k], B));
  if (!affordable(S, id, p)) p.rq = [];
  // 연구 인력을 계속 늘려 전력 예산을 고갈시키지 않는다: 명세 속도 기준 연구소2·대학1.
  if (card) {
    const q = clone(p); q.rq = [card];
    if (affordable(S, id, q)) {
      p = q;
      for (const [type, goal] of [["lab", 2], ["uni", 1]])
        while (p.builds.filter(b => b.t === type).length < goal) {
          const next = add(S, id, p, type); if (next === p) break; p = next;
        }
    }
  }
  // 새로 짓는 설비만 해금 대안으로 바꾼다. 기존 설비를 무료 업그레이드하지 않는다.
  for (const b of p.builds) {
    if (prev.builds.some(x => x.t === b.t && x.i === b.i)) continue;
    const to = ({ solar: "tandem", roof: "tandem_roof", battery: "nbat" })[b.t];
    if (!to || !B.BLD[to] || !rs.adopted.includes(B.BLD[to].tech)) continue;
    const old = b.t; b.t = to; if (!affordable(S, id, p)) b.t = old;
  }
  if (strategy === "smr" && rs.adopted.includes("smr") && !p.builds.some(b => b.t === "smr")) p = add(S, id, p, "smr");
  if (strategy === "hydrogen" && rs.adopted.includes("h2store") && !p.builds.some(b => b.t === "h2store")) p = add(S, id, p, "h2store");
  if (rs.adopted.includes("vpp")) p.policies = ["dr"];
  return { plan: p, econPol: answer.econPol };
}
const selectedIds = process.env.TECH_BALANCE_CITY ? ids.filter(id => id === process.env.TECH_BALANCE_CITY) : ids;
for (const focal of selectedIds) for (const strategy of Object.keys(STRATEGIES)) {
  const S = C.newState(report.seed, R.id, 0, ids, { turns: 36 });
  ids.forEach(id => { S.teams[id].token = "test-bot"; });
  const run = { id: focal, name: D.start[focal].name, strategy, months: [], rejected: [] }; report.runs.push(run);
  for (let m = 1; m <= 36; m++) {
    C.host(S, "next", m * 100000);
    const proposals = Object.fromEntries(ids.map(id => [id, id === focal ? focalPlan(S, id, strategy) : AI.plan(S, R, id, B, "balanced")]));
    for (const id of ids) {
      const ask = msg => C.reduce(S, { team: id, token: "test-bot", ...msg }, m * 100000 + 1, B);
      const pol = ask({ type: "econ", ...proposals[id].econPol });
      ok(pol.ok, `${focal}/${strategy}/${m}/${id} 정책 ${pol.err || ""}`);
      const res = ask({ type: "plan", rev: S.teams[id].rev + 1, plan: proposals[id].plan });
      ok(res.ok, `${focal}/${strategy}/${m}/${id} 건설 ${res.err || ""}`);
      if (!res.ok) { select(id); run.rejected.push({ month: m, id, response: res, cash: S.econ.cities[id].cash, debtCap: S.econ.cities[id].debtCap, budget: C.budget(S, id), spend: C.spendOf(B, S, R, id, proposals[id].plan), plan: proposals[id].plan }); }
    }
    const result = C.run(S, B, m * 100000 + 20), r = result.team[focal], city = S.econ.cities[focal];
    run.months.push({ month: m, uns: r.unsPct, ren: r.renPct, cash: city.cash, debtCap: city.debtCap,
      adopted: C.researchView(S, focal).adopted, builds: S.teams[focal].plan.builds.map(b => b.t) });
  }
  run.score = X.score(S.econ).by[focal].score;
  run.avgUns = run.months.reduce((sum, m) => sum + m.uns, 0) / run.months.length;
  run.adopted = C.researchView(S, focal).adopted;
  ok(Number.isFinite(run.score), `${focal}/${strategy} 유한 점수`);
  // B18 공통 실용성 기준: 36달 평균 정전 5% 이하여야 전력 운영 전략으로 비교 가능.
  ok(run.avgUns <= 5, `${focal}/${strategy} 평균 정전 ${run.avgUns.toFixed(3)}% >5%`);
  if (strategy === "none") ok(run.adopted.length === 0, `${focal} 연구0 도입0장`);
  if (strategy === "smr") ok(run.months.some(m => m.builds.includes("smr")), `${focal} SMR 전략 실제 착공`);
  if (strategy === "hydrogen") ok(run.months.some(m => m.builds.includes("h2store")), `${focal} 수소 전략 실제 저장 건설`);
  console.log(JSON.stringify({ city: run.name, strategy: names[strategy], score: run.score, avgUns: +run.avgUns.toFixed(3), cards: run.adopted.length }));
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
}
if (selectedIds.length === ids.length) {
  const avg = key => report.runs.filter(r => r.strategy === key).reduce((s, r) => s + r.score, 0) / ids.length;
  report.average = Object.fromEntries(Object.keys(STRATEGIES).map(k => [k, avg(k)]));
  report.researchGain = avg("research") - avg("none");
  ok(report.researchGain > 0 && report.researchGain <= 15, `T5 연구몰빵−연구0 평균 ${report.researchGain}, 계약 (0,15]`);
  report.winners = Object.fromEntries(ids.map(id => {
    const rows = report.runs.filter(r => r.id === id), best = Math.max(...rows.map(r => r.score));
    return [id, rows.filter(r => r.score === best).map(r => r.strategy)];
  }));
  for (const strategy of Object.keys(STRATEGIES)) ok(!ids.every(id => report.winners[id].includes(strategy)), `T5 ${strategy} 6도시 모두 1위 금지(공동1위 포함)`);
  console.log("평균·도시별1위", JSON.stringify({ average: report.average, gain: report.researchGain, winners: report.winners }));
} else console.log("부분 실행: T5 전체 6도시 판정 미실행");
report.passes = passes;
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`T5 전략: ${passes} 통과, ${report.failures.length} 실패; ${OUT}`);
process.exitCode = report.failures.length ? 1 : 0;
