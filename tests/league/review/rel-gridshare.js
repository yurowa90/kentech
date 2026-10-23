"use strict";
// Standalone, unnumbered measurement. No production writes, network or browser.
// Reproduce: node tests/league/review/rel-gridshare.js
// Fast integrity checks: node tests/league/review/rel-gridshare.js --self-test
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const crypto = require("node:crypto"), assert = require("node:assert/strict");
const {spawn, execFileSync} = require("node:child_process");
const ROOT = path.resolve(__dirname, "../../..");
const MODULES = ["build-maps", "tech-data", "build", "econ-data", "econ", "league-data", "league-core", "league-ai"];
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const clone = x => JSON.parse(JSON.stringify(x));
let assertions = 0;
function ok(condition, message) { assert.ok(condition, message); assertions++; }
function near(a, b, label, tolerance = 1e-9) {
  ok(Number.isFinite(a) && Math.abs(a - b) < tolerance, `${label}: ${a} vs ${b}`);
}
function once(source, needle, replacement, label) {
  const n = typeof needle === "string" ? source.split(needle).length - 1 : [...source.matchAll(needle)].length;
  ok(n === 1, `${label}: exactly one source site, found ${n}`);
  return source.replace(needle, replacement);
}
function pythonString(file, key) {
  const matches = [...read(file).matchAll(new RegExp(`^${key} = r?"""\\n([\\s\\S]*?)^"""`, "gm"))];
  ok(matches.length === 1, `${file}: ${key} extraction`);
  return matches[0][1];
}
function summarize(rows, strategies, ids) {
  const winners = {}, firstCounts = Object.fromEntries(strategies.map(s => [s, 0]));
  for (const id of ids) {
    const group = rows.filter(r => r.id === id);
    ok(group.length === strategies.length && new Set(group.map(r => r.strategy)).size === strategies.length, `${id}: complete matrix`);
    ok(group.every(r => Number.isFinite(r.score) && Object.values(r.parts).every(Number.isFinite)), `${id}: finite parts`);
    const best = Math.max(...group.map(r => r.score));
    winners[id] = group.filter(r => Math.abs(r.score - best) < 1e-9).map(r => r.strategy);
    winners[id].forEach(s => firstCounts[s]++);
    group.forEach(r => {r.strategyRank = 1 + group.filter(o => o.score > r.score + 1e-9).length;});
  }
  return {rows, strategies, ids, winners, firstCounts,
    B16: Object.values(firstCounts).every(n => n < ids.length),
    means: Object.fromEntries(strategies.map(s => [s, mean(rows.filter(r => r.strategy === s).map(r => r.score))]))};
}
// Execute the original Python postprocessing and assertions too, without calling its
// browser/CLI entry point or writing its large raw JSON. Raw data travels via stdin.
function pythonPost(raw) {
  const script = `
import sys, json, importlib.util
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("bots", sys.argv[1])
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
source = open(sys.argv[1]).read()
start = source.index('    out["url"] =')
end = source.index('    result_dir =', start)
block = "\\n".join(line[4:] for line in source[start:end].splitlines())
out = json.load(sys.stdin)
from types import SimpleNamespace
scope = dict(vars(b), out=out, months=36, rotations=9, args=SimpleNamespace(node=True, url=""))
exec(block, scope)
print(json.dumps(dict(horizons=out["horizons"], debtBreakdown=out["debtBreakdown"],
 sourceChecks=dict(passCount=sum(bool(x[0]) for x in out["checks"]),
 fail=[x[1] for x in out["checks"] if not x[0]])), ensure_ascii=False, allow_nan=False))
`;
  const python = process.env.REL_PYTHON || path.join(ROOT, "tests/.venv/bin/python");
  return JSON.parse(execFileSync(python, ["-B", "-c", script, path.join(ROOT, "tests/league/bots36.py")],
    {input: JSON.stringify(raw), encoding: "utf8", maxBuffer: 32 * 1024 * 1024}));
}
const SHARES = [.5, .4, .3], EPS = 1e-6, HORIZONS = [1, 12, 24, 36];
const GRID_CALL = "if (S.econ) act.forEach(({ id }) => gridSupply(out[id], sims[id]));";
// Observe the original call without changing arithmetic, inputs or public fields.
const GRID_OBSERVER = `if (S.econ) act.forEach(({ id }) => {
      const before = Array.from(out[id].del), fuelBefore = out[id].fuelX;
      const imported = gridSupply(out[id], sims[id]);
      globalThis.__relLast[id] = globalThis.__relObserve(
        sims[id], out[id], before, imported, fuelBefore, rd.mdays / rd.days);
    });`;
function observe(s, o, before, imported, fuelBefore, weekMul) {
  const r = {hours: s.H, beforePositive: 0, afterPositive: 0, exactZero: 0,
    mathematicalZero: 0, filledPositive: 0, rawResidualMWh: 0, demandMWh: 0,
    gridMWh: imported * weekMul, gridCost: (o.fuelX - fuelBefore) * weekMul};
  for (let k = 0; k < s.H; k++) {
    const u = Math.max(0, s.uns[k] - before[k]);
    const a = Math.max(0, s.uns[k] - o.del[k]);
    const ideal = Math.max(0, u - Math.min(u, s.dem[k] * observe.share));
    r.beforePositive += u > EPS;
    r.afterPositive += a > EPS;
    r.exactZero += a === 0;
    r.mathematicalZero += ideal === 0;
    r.filledPositive += u > EPS && a <= EPS;
    r.rawResidualMWh += a * weekMul;
    r.demandMWh += s.dem[k] * weekMul;
  }
  ok(Object.values(r).every(Number.isFinite), "finite hourly observation");
  near(r.gridCost, r.gridMWh * .008 * 1.5, "grid cost monthly units", 1e-7);
  ok(r.afterPositive <= r.beforePositive, "grid cannot add shortage hours");
  return r;
}
function loadModule(ctx, name, share, instrument) {
  let source = read(`ui/${name}.js`);
  if (name === "league-core" && instrument) {
    source = once(source, GRID_CALL, GRID_OBSERVER, "grid observer");
    source = once(source, "const res = runRound(S, bg);",
      "const res = runRound(S, bg); globalThis.__relActual = {...globalThis.__relLast};", "capture before attribution replays");
  }
  vm.runInContext(source, ctx, {filename: name});
  if (name === "econ-data") ctx.KCP.ECON_DATA.params.gridImportShare.v = share;
}
function attach(ctx, share) {
  ctx.__relLast = {};
  ctx.__relObserve = (...args) => { observe.share = share; return observe(...args); };
}
function context(share, instrument = true) {
  const ctx = vm.createContext({console, document: {documentElement: {}}, KCP: {route() {}, on() {}, esc: x => x}});
  ctx.window = ctx; attach(ctx, share);
  vm.runInContext('Math.random = () => {throw Error("unseeded random");}', ctx);
  for (const name of MODULES) loadModule(ctx, name, share, instrument);
  return ctx;
}
function distribution(values) {
  ok(values.length > 0 && values.every(Number.isFinite), "finite nonempty distribution");
  const a = [...values].sort((x, y) => x - y);
  const q = p => { const i = (a.length - 1) * p, lo = Math.floor(i); return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo); };
  const hundred = a.filter(x => x === 100).length, atLeast99 = a.filter(x => x >= 99).length;
  return {n: a.length, min: a[0], q1: q(.25), median: q(.5), q3: q(.75), max: a.at(-1),
    hundred, atLeast99, hundredFraction: hundred / a.length, atLeast99Fraction: atLeast99 / a.length};
}
function sumObservations(rows) {
  ok(rows.length > 0, "nonempty hourly group");
  const r = Object.fromEntries(Object.keys(rows[0]).map(k => [k, rows.reduce((s, x) => s + x[k], 0)]));
  return {...r, remainingFraction: r.afterPositive / r.hours,
    exactZeroFraction: r.exactZero / r.hours, mathematicalZeroFraction: r.mathematicalZero / r.hours,
    filledAmongShortage: r.beforePositive ? r.filledPositive / r.beforePositive : null};
}
function general(share) {
  const ctx = context(share);
  vm.runInContext(pythonString("tests/league/calib.py", "AUTO"), ctx);
  let js = pythonString("tests/league/bots36.py", "JS");
  js = once(js, "run.hist.push({month: m,", "run.hist.push({gridMeasure: clone(globalThis.__relActual), month: m,", "general hourly capture");
  js = once(js, "score: [12,24,36].includes(m)", "score: [1,12,24,36].includes(m)", "month 1 score capture");
  const raw = vm.runInContext(js, ctx)({months: 36, rotations: 9});
  ok(raw.runs.length === 9 && raw.runs.every(r => r.hist.length === 36 && r.rows.length === 6), "general complete trajectories");
  const post = pythonPost(raw), rows = raw.runs.flatMap(run => run.rows.map(r => {
    const monthly = run.hist.map(h => h.gridMeasure[r.id]);
    const hourly = sumObservations(monthly);
    ok(hourly.hours === 36 * 168, `${r.id}/${r.strategy} hours`);
    const final = run.hist.at(-1).cities[r.id];
    near(r.parts.rel, Math.round(Math.max(0, Math.min(100, 100 * (1 - final.unsS / 16))) * 10) / 10,
      `${r.id}/${r.strategy} rel reconstruction`);
    return {id: r.id, strategy: r.strategy, score: r.score, parts: r.parts, avgUns: r.unsPct,
      unsS: final.unsS, hourly,
      overMonths: run.hist.filter(h => h.fiscal[r.id].debtOver).map(h => h.month),
      horizons: Object.fromEntries(HORIZONS.map(m => [m, {rel: run.hist[m - 1].score.by[r.id].parts.rel,
        unsPct: run.hist[m - 1].energy[r.id].unsPct, unsS: run.hist[m - 1].cities[r.id].unsS}]))};
  }));
  const summary = summarize(rows, raw.strategies, raw.ids);
  const hourly = sumObservations(rows.map(r => {
    const {remainingFraction, exactZeroFraction, mathematicalZeroFraction, filledAmongShortage, ...counts} = r.hourly;
    return counts;
  }));
  return {...summary, names: raw.names, seed: "bots-strategy-common", sourceChecks: post.sourceChecks,
    distribution: distribution(rows.map(r => r.parts.rel)),
    byStrategy: Object.fromEntries(raw.strategies.map(s => {
      const group = rows.filter(r => r.strategy === s);
      return [s, {distribution: distribution(group.map(r => r.parts.rel)), meanUns: mean(group.map(r => r.avgUns)),
        meanScore: mean(group.map(r => r.score)), meanGridMWh: mean(group.map(r => r.hourly.gridMWh)),
        meanGridCost: mean(group.map(r => r.hourly.gridCost))}];
    })),
    horizons: Object.fromEntries(HORIZONS.map(m => [m, distribution(rows.map(r => r.horizons[m].rel))])),
    meanUns: mean(rows.map(r => r.avgUns)), hourly,
    meanGridMWh: hourly.gridMWh / rows.length, meanGridCost: hourly.gridCost / rows.length,
    nothingLast: rows.filter(r => r.strategy === "nothing").every(r => r.strategyRank === 9),
    renewAboveDiesel: summary.means.renew > summary.means.diesel,
    debt: {overCityMonths: rows.reduce((s, r) => s + r.overMonths.length, 0),
      cities: raw.ids.filter(id => rows.some(r => r.id === id && r.overMonths.length))},
    rawHash: sha(JSON.stringify(raw))};
}
function technology(share) {
  const evaluated = {};
  let KCP;
  const shimVM = {...vm, runInContext(source, ctx, ...args) {
    for (const name of MODULES) if (source === read(`ui/${name}.js`)) {
      evaluated[name] = (evaluated[name] || 0) + 1;
      // T5 needs only final score/rel; retain engine source byte identity.
      const value = vm.runInContext(source, ctx, ...args);
      if (name === "econ-data") ctx.KCP.ECON_DATA.params.gridImportShare.v = share;
      KCP = ctx.KCP; return value;
    }
    return vm.runInContext(source, ctx, ...args);
  }};
  const shimFS = {...fs, writeFileSync(file) {ok(file === "/rel-memory.json", "T5 report sink only");}};
  const allowed = {"node:fs": shimFS, "node:path": path, "node:vm": shimVM, "node:crypto": crypto};
  const box = {__dirname, console: {log(...args) {
    if (args[0] === "FAIL:" || String(args[0]).startsWith('{"city":')) console.log(...args);
  }}, process: {env: {TECH_BALANCE_OUT: "/rel-memory.json"}, exitCode: 0},
  require(name) {ok(Object.hasOwn(allowed, name), `T5 dependency ${name}`); return allowed[name];}};
  vm.runInNewContext(read("tests/league/review/11-tech-balance.js") + "\nglobalThis.__report = report;", box,
    {filename: "11-tech-balance.js"});
  const raw = box.__report;
  ok(MODULES.every(n => evaluated[n] === 1), "T5 engine sources once");
  ok(raw.seed === "tech-strategy-common" && raw.runs.length === 42 && raw.runs.every(r => r.months.length === 36),
    "T5 full default-seed trajectories");
  ok(box.process.exitCode === (raw.failures.length ? 1 : 0), "T5 source exit agrees");
  const rows = raw.runs.map(r => ({id: r.id, strategy: r.strategy, score: r.score, parts: r.parts,
    unsS: r.state.cities[r.id].unsS, avgUns: r.avgUns, budget: r.budget || null}));
  for (const run of raw.runs) if (["renew", "ties", "hybrid"].includes(run.strategy)) {
    const smr = raw.runs.find(r => r.id === run.id && r.strategy === "smr");
    for (const m of run.months) ok(m.cumulativeMatchedSpend <= smr.months[m.month - 1].cumulativeMatchedSpend + raw.budgetTolerance,
      `T5 ${run.id}/${run.strategy}/${m.month} budget prefix`);
  }
  const ids = [...new Set(rows.map(r => r.id))], summary = summarize(rows, Object.keys(raw.strategies), ids);
  return {...summary, names: Object.fromEntries(ids.map(id => [id, KCP.ECON_DATA.start[id].name])),
    seed: raw.seed, smrFirstCities: raw.smrFirstCities, researchGain: raw.researchGain,
    sourceChecks: {passCount: raw.passes, fail: raw.failures}, rawHash: sha(JSON.stringify(raw))};
}
function selfTest() {
  assert.deepEqual(distribution([0, 98, 99, 100]), {
    n: 4, min: 0, q1: 73.5, median: 98.5, q3: 99.25, max: 100,
    hundred: 1, atLeast99: 2, hundredFraction: .25, atLeast99Fraction: .5
  }); assertions++;
  assert.deepEqual(distribution([100]), {n: 1, min: 100, q1: 100, median: 100, q3: 100, max: 100,
    hundred: 1, atLeast99: 1, hundredFraction: 1, atLeast99Fraction: 1}); assertions++;
  const original = context(.5, false);
  for (const share of SHARES) {
    const a = context(share), b = context(share, false);
    const baseline = original.KCP.ECON_DATA.params;
    for (const [key, p] of Object.entries(a.KCP.ECON_DATA.params)) {
      const expected = key === "gridImportShare" ? share : baseline[key].v;
      ok(JSON.stringify(p.v) === JSON.stringify(expected), `${share}/${key} only selected parameter differs`);
    }
    function first(ctx) {
      const {leagueCore: C, buildGame: B} = ctx.KCP, ids = C.regionOf("south").teams.map(t => t.id);
      const S = C.newState("rel-self-test", "south", 0, ids, {turns: 36});
      C.host(S, "next", 100); S.events = [];
      return {result: C.run(S, B, 150), state: S};
    }
    const x = first(a), y = first(b);
    ok(JSON.stringify(x) === JSON.stringify(y), `${share} observer leaves complete result and state unchanged`);
    ok(Object.keys(a.__relActual).length === 6, `${share} all cities observed`);
    for (const r of Object.values(a.__relActual)) {
      ok(r.hours === 168 && r.gridMWh >= 0, `${share} representative week and monthly amount`);
    }
    // Directly exercise original gridSupply with hand-computed cases.
    const source = read("ui/league-core.js");
    const fn = source.slice(source.indexOf("  function gridSupply("), source.indexOf("\n  // 거래 없는", source.indexOf("  function gridSupply(")));
    vm.runInContext(fn + "\nglobalThis.__grid = gridSupply;", a);
    const o = {del: new Float32Array([0, 2, 4]), fuelX: 1, co2In: 0};
    const s = {H: 3, uns: [0, 8, 5], dem: [10, 10, 10]};
    const amount = a.__grid(o, s);
    near(amount, share * 10 + 1, `${share} shortage after neighbor delivery`);
    near(o.del[1], 2 + share * 10, `${share} per-hour cap`);
    near(o.del[2], 5, `${share} never overfill`);
    near(o.fuelX, 1 + amount * .012, `${share} fuel ledger only`);
  }
}
function hashes() {
  const files = execFileSync("rg", ["--files", "ui"], {cwd: ROOT, encoding: "utf8"}).trim().split("\n");
  files.push("docs/DECISIONS.md", "tests/league/bots36.py", "tests/league/calib.py",
    "tests/league/review/11-tech-balance.js", "tests/league/review/D73-measure.js",
    "tests/league/review/w2-carbon-variants.js", "tests/league/review/rel-gridshare.js");
  return Object.fromEntries(files.sort().map(f => [f, sha(read(f))]));
}
const loadLog = [], delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function loadSample(label) {
  const raw = execFileSync("uptime", [], {encoding: "utf8"}).trim(), match = raw.match(/load averages?:\s*([0-9.]+)/);
  ok(!!match, "uptime parse");
  loadLog.push({at: new Date().toISOString(), label, oneMinute: +match[1], raw});
  return +match[1];
}
async function runJob(job, tmp) {
  while (loadSample(`before ${job.key}`) > 150) {console.log(`WAIT ${job.key}`); await delay(15000);}
  console.log(`START ${job.key}`);
  const out = path.join(tmp, job.key + ".json");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename, "--worker", JSON.stringify({...job, out})],
      {stdio: ["ignore", "inherit", "inherit"], env: {...process.env, REL_SERIAL_WORKER: "1"}});
    let paused = false;
    const stop = () => {child.kill("SIGCONT"); child.kill("SIGTERM");};
    const timer = setInterval(() => {
      try {
        const load = loadSample(`during ${job.key}`);
        if (load > 150 && !paused) {child.kill("SIGSTOP"); paused = true; console.log(`PAUSE load=${load}`);}
        if (load <= 150 && paused) {child.kill("SIGCONT"); paused = false; console.log(`RESUME load=${load}`);}
      } catch (error) {stop(); reject(error);}
    }, 10000);
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    child.on("error", error => {clearInterval(timer); reject(error);});
    child.on("exit", code => {
      clearInterval(timer); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
      code === 0 ? resolve() : reject(Error(`${job.key}: worker exit ${code}`));
    });
  });
  loadSample(`after ${job.key}`);
  const result = JSON.parse(fs.readFileSync(out, "utf8"));
  console.log(`DONE ${job.key} ${result.seconds.toFixed(1)}s source ${result.result.sourceChecks.passCount}/${result.result.sourceChecks.fail.length}`);
  return result;
}
function saveJSON(file, value) {
  const text = JSON.stringify(value) + "\n", bytes = Buffer.byteLength(text);
  if (bytes > 1000000) {
    file = path.join(process.env.HOME, "Projects/kentech-wt/_briefs/lanes/q8/results/rel", path.basename(file));
    fs.mkdirSync(path.dirname(file), {recursive: true});
  }
  fs.writeFileSync(file, text);
  return {file, bytes};
}
async function main() {
  const started = Date.now(), initialHashes = hashes();
  const head = execFileSync("git", ["rev-parse", "HEAD"], {cwd: ROOT, encoding: "utf8"}).trim();
  loadSample("start");
  while (loadSample("self-test gate") > 150) await delay(15000);
  selfTest();
  const tmp = fs.mkdtempSync("/tmp/rel-gridshare-");
  const output = {head, node: process.version, started: new Date(started).toISOString(),
    sourceHashes: initialHashes, jobs: {}, skipped: [], loadLog, temporaryDirectory: tmp};
  const jobs = [...SHARES.map(share => ({key: `general-${share}`, kind: "general", share})),
    ...SHARES.map(share => ({key: `tech-${share}`, kind: "tech", share}))];
  for (const job of jobs) {
    const elapsed = (Date.now() - started) / 1000;
    const estimate = 1.15 * Math.max(1400, ...Object.values(output.jobs).filter(j => j.kind === "tech").map(j => j.seconds));
    if (job.kind === "tech" && elapsed + estimate + 120 > 90 * 60) {
      output.skipped.push({...job, reason: `90분 예산: 경과 ${elapsed.toFixed(1)}초 + T5 예상 ${estimate.toFixed(1)}초 + 집계120초`});
      console.log(`SKIP ${job.key}`); continue;
    }
    output.jobs[job.key] = {...job, ...await runJob(job, tmp)};
    saveJSON(path.join(tmp, "checkpoint.json"), output);
  }
  ok(JSON.stringify(hashes()) === JSON.stringify(initialHashes), "all ui and measured input files unchanged");
  ok(execFileSync("git", ["rev-parse", "HEAD"], {cwd: ROOT, encoding: "utf8"}).trim() === head, "HEAD unchanged");
  output.seconds = (Date.now() - started) / 1000;
  output.maxLoad = Math.max(...loadLog.map(r => r.oneMinute));
  output.assertions = assertions + Object.values(output.jobs).reduce((s, j) => s + j.assertions, 0);
  output.sourcePasses = Object.values(output.jobs).reduce((s, j) => s + j.result.sourceChecks.passCount, 0);
  output.sourceFailures = Object.values(output.jobs).flatMap(j => j.result.sourceChecks.fail.map(message => ({job: j.key, message})));
  const saved = saveJSON(path.join(__dirname, "rel-gridshare-results.json"), output);
  fs.writeFileSync(path.join(__dirname, "REL-gridshare-report.md"), report(output, saved));
  console.log(JSON.stringify({...saved, seconds: output.seconds, maxLoad: output.maxLoad,
    assertions: output.assertions, sourcePasses: output.sourcePasses, sourceFailures: output.sourceFailures, skipped: output.skipped}));
}
const n = (x, digits = 3) => Number.isFinite(x) ? x.toFixed(digits) : "—";
const pct = x => n(x * 100, 2) + "%", yn = b => b ? "충족" : "미충족";
function report(out, saved) {
  const gs = Object.values(out.jobs).filter(j => j.kind === "general");
  const ts = Object.values(out.jobs).filter(j => j.kind === "tech");
  const city = id => gs[0].result.names[id];
  const lines = ["# 신뢰 부분점수와 D-74 계통 수입 상한 측정", "",
    `HEAD \`${out.head}\`, Node ${out.node}. 실행 ${n(out.seconds / 60, 2)}분, 10초 간격 표본 최대 1분 부하 ${n(out.maxLoad, 2)}.`,
    `재현: \`node tests/league/review/rel-gridshare.js\`. 자체 검사: \`node tests/league/review/rel-gridshare.js --self-test\`.`,
    `결과 JSON: \`${saved.file}\` (${saved.bytes} bytes). 측정 과정에서 ui·입력 파일 해시와 HEAD 보존을 확인했다.`, "",
    "## 관측된 해석", "",
    `현재 0.5에서 신뢰 100은 ${gs[0].result.distribution.hundred}/54개다. nothing은 ${gs[0].result.byStrategy.nothing.distribution.hundred}/6개, base와 diesel은 각각 ${gs[0].result.byStrategy.base.distribution.hundred}/6·${gs[0].result.byStrategy.diesel.distribution.hundred}/6개다. 무행동도 계통 덕분에 신뢰 100이라는 가정은 이번 표본에서는 관측되지 않았다.`,
    `세 상한의 신뢰100 개수는 ${gs.map(j=>j.result.distribution.hundred).join(" → ")}이며 평균 정전률은 ${gs.map(j=>n(j.result.meanUns)).join("% → ")}%다. 각 시안에서 계통 보충으로 실질 부족(>1e−6 MWh)이 완전히 해소된 시간은 ${gs.map(j=>j.result.hourly.filledPositive).join(" / ")}시간이다. 기본 봇의 포화를 계통 보충의 효과로 단정할 수 없다.`,
    "이번 일반 봇에서는 nothing을 제외한 여덟 전략이 계통 보충 전부터 실질 부족이 없는 쪽에 있고, nothing은 세 상한 모두 모든 운영 시간에 부족이 남는다. 따라서 상한을 줄여도 신뢰100의 수와 미공급 시간 수는 바뀌지 않고, nothing의 부족량과 수입량·비용이 변한다. 4차 영상의 실제 행동을 재현한 실험은 아니므로 영상 포화의 원인을 이것만으로 확정하지 않는다.", "",
    "## 방법과 분모", "",
    "bots36 원문 전체 JS·Python 후처리 검사를 유지했다. 기본 씨앗 bots-strategy-common, 6도시×9전략×36달이다. T5는 11-tech-balance.js 전체를 VM에서 실행해 사전 예산 맞춤·월 누계 단언을 유지했고 씨앗은 tech-strategy-common이다. VM의 ECON_DATA.params.gridImportShare.v만 0.5/0.4/0.3으로 바꾸었다. G 할증 1.5와 모든 근거 값은 유지했다.",
    "D-74 각주는 본문의 정전 54.6%·36달 평균 5.33%가 시작 수요 프로필 상한을 쓴 원형 측정치라고 구분한다. 이번 결과는 현재 운영 시간별 수요 상한 구현을 새로 실행한 값이며 그 원형 수치를 현재 기준값으로 재사용하지 않았다.",
    "분포는 36달 종료 도시×전략 54개 부분점수이며 사분위는 정렬한 (n−1)p 위치 선형 보간이다. 월별 포화 비율도 각 54개다. 점수는 엔진의 소수 첫째 자리 반올림값이다. 평균 정전률은 1,944개 도시×전략×월의 공개 정전%를 동일 가중 평균한다.",
    "계통 공급은 이웃 거래 imp/pay와 구분해 원 gridSupply 호출의 반환량과 fuelX 증가량을 관측한다. 대표 7일 값을 각 달 mdays/7로 환산해 36달 합산했다. 도시 평균은 도시×전략 54개 궤적 평균이며, 전략별 표는 6도시 평균이다. 비용 단위는 억이다. 시간 비율 분모는 실제 시뮬레이션 대표 주간 326,592 도시·시간(54×36×168)이며 달력 가중이 아니다.", "",
    "## bots36 핵심 결과", "",
    "| 상한 | 신뢰100 /54 | 신뢰≥99 /54 | 평균 정전% | 계통 MWh/도시·36달 | 계통 비용 억/도시·36달 | 보충 후 미공급 시간 |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...gs.map(({share, result:r}) => `| ${share} | ${r.distribution.hundred} (${pct(r.distribution.hundredFraction)}) | ${r.distribution.atLeast99} (${pct(r.distribution.atLeast99Fraction)}) | ${n(r.meanUns)} | ${n(r.meanGridMWh)} | ${n(r.meanGridCost)} | ${pct(r.hourly.remainingFraction)} |`), "",
    "| 상한 | 최소 | Q1 | 중앙 | Q3 | 최대 | 1월100 | 12월100 | 24월100 | 36월100 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...gs.map(({share,result:r}) => `| ${share} | ${["min","q1","median","q3","max"].map(k=>n(r.distribution[k],2)).join(" | ")} | ${HORIZONS.map(m=>`${r.horizons[m].hundred}/54 (${pct(r.horizons[m].hundredFraction)})`).join(" | ")} |`), "",
    "| 상한 | B16 | 재생 총점 | 디젤 총점 | 재생>디젤 | nothing 전 도시9/9 | 지방채 초과 도시·전략·달/1944 | 초과 도시 |",
    "|---|---|---:|---:|---|---|---:|---|",
    ...gs.map(({share,result:r}) => `| ${share} | ${yn(r.B16)} | ${n(r.means.renew)} | ${n(r.means.diesel)} | ${yn(r.renewAboveDiesel)} | ${yn(r.nothingLast)} | ${r.debt.overCityMonths} | ${r.debt.cities.map(city).join("·") || "없음"} |`), "",
    "B16은 공동 1위를 포함해 한 전략이 6도시 전부 1위인지 검사한다. 순위는 공동 순위로 계산하며 nothing 9위에는 단독 최하위를 요구한다. 지방채 초과는 원 fiscal.debtOver이며 같은 도시·달이라도 전략이 다르면 별도 표본이다.", "",
    "## nothing·diesel·base의 100 포화", "",
    "| 상한 | 전략 | 신뢰100 /6 | 신뢰≥99 /6 | 최소/중앙/최대 | 총점 평균 | 평균 정전% | 계통 MWh/도시·36달 | 계통 비용 억 |",
    "|---|---|---:|---:|---|---:|---:|---:|---:|",
    ...gs.flatMap(({share,result:r}) => ["nothing","diesel","base"].map(s => {
      const x=r.byStrategy[s],d=x.distribution;
      return `| ${share} | ${s} | ${d.hundred} | ${d.atLeast99} | ${n(d.min,1)}/${n(d.median,1)}/${n(d.max,1)} | ${n(x.meanScore)} | ${n(x.meanUns)} | ${n(x.meanGridMWh)} | ${n(x.meanGridCost)} |`;
    })), "",
    "| 상한 | 도시 | 전략 | 36월 신뢰 | 총점 | 계통 전 부족 시간 | 계통이 해소한 시간 | 보충 후 미공급 시간 |",
    "|---|---|---|---:|---:|---:|---:|---:|",
    ...gs.flatMap(({share,result:r}) => r.rows.filter(x=>["nothing","diesel","base"].includes(x.strategy)).map(x=>
      `| ${share} | ${city(x.id)} | ${x.strategy} | ${n(x.parts.rel,1)} | ${n(x.score,1)} | ${x.hourly.beforePositive} | ${x.hourly.filledPositive} | ${x.hourly.afterPositive} |`)), "",
    "## 포화의 식과 시간별 잔여 부족", "",
    "`U_t=max(0, 자체 운전 미공급_t−이웃 공급_t)`, `G_t=min(U_t, share×수요_t)`, `잔여_t=max(0,U_t−G_t)`이다. 따라서 U_t≤share×수요_t이면 그 시간의 부족은 계통으로 해소된다. 실제 저장 배열은 Float32라 미세 잔여가 생길 수 있다.",
    "`u_m=round₂(100×월 대표 주간 잔여 총량/수요 총량)`을 경제 모형에 넣고 `s_m=s_(m−1)+0.5×(u_m−s_(m−1))`로 추적한다. 초기 보정 s₀=0이며 최종 `rel=round₁(clamp₀¹⁰⁰(100×(1−s_m/16)))`이다. 양의 s_m도 약 0.008% 이하이면 표시값이 100.0이 될 수 있다. 앞선 달 정전은 반씩 감쇠하므로 마지막 달의 100이 36달 내내 무정전이었다는 뜻은 아니다.",
    "병원 정전도 계통 보충 후 공급량을 병원 부족에서 먼저 빼 판정한다. 병원 감점은 주민 생활여건의 `clamp(100×(1−u/16)−20×min(1,hospH/8))` 등에 들어가며, 최종 점수 parts.rel에는 직접 들어가지 않는다. `gridFill`은 거래 없는 시험에 같은 gridSupply를 적용하고 병원부터 배분한다. 이번 시간 집계는 실제 운영의 이웃 거래 뒤 gridSupply이며 시험 운전 결과를 섞지 않았다.", "",
    "| 상한 | 계통 전 부족 시간 | 보충 후 미공급 >1e-6 MWh | 잔여=0 정확 비율 | Float32 전 수학적 0 비율 | 계통 전 부족 중 해소 비율 |",
    "|---|---:|---:|---:|---:|---:|",
    ...gs.map(({share,result:r})=>`| ${share} | ${r.hourly.beforePositive}/${r.hourly.hours} | ${r.hourly.afterPositive}/${r.hourly.hours} (${pct(r.hourly.remainingFraction)}) | ${pct(r.hourly.exactZeroFraction)} | ${pct(r.hourly.mathematicalZeroFraction)} | ${pct(r.hourly.filledAmongShortage)} |`), "",
    "정확 0은 저장된 Float32 del로 계산한 max(0,uns−del)===0이다. 주 표의 미공급 시간은 1e−6 MWh(1 Wh)를 넘는 잔여로 세고, 수학적 0은 저장 전 min 상한식으로 판정한다. 이는 운영의 정전 시간 판정 임계값 max(0.005 MWh, 시간 수요×2%)와 다르다. 잔여 시간·월 정전%·완화 상태·표시 신뢰의 분모와 반올림을 혼동하지 않는다.", "",
    "## 전체 도시×전략 결과", ""];
  const matrix = (title,r) => {
    lines.push(`### ${title}`, "", "각 칸: 신뢰 부분점수 / 총점.", "",
      `| 도시 | ${r.strategies.join(" | ")} |`, `|---|${r.strategies.map(()=>"---:|").join("")}`);
    for (const id of r.ids) lines.push(`| ${city(id)} | ${r.strategies.map(s=>{
      const x=r.rows.find(x=>x.id===id&&x.strategy===s);return `${n(x.parts.rel,1)} / ${n(x.score,1)}`;
    }).join(" | ")} |`);
    lines.push("");
  };
  for (const j of gs) matrix(`bots36 상한 ${j.share}`,j.result);
  lines.push("## 전략별 분포와 계통 공급", "", "| 상한 | 전략 | 최소 | Q1 | 중앙 | Q3 | 최대 | 100/6 | ≥99/6 | 계통 MWh/도시·36달 | 비용 억 |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for(const j of gs)for(const [s,x] of Object.entries(j.result.byStrategy))lines.push(
    `| ${j.share} | ${s} | ${["min","q1","median","q3","max"].map(k=>n(x.distribution[k],2)).join(" | ")} | ${x.distribution.hundred} | ${x.distribution.atLeast99} | ${n(x.meanGridMWh)} | ${n(x.meanGridCost)} |`);
  lines.push("", "## 지방채 초과 월", "", "| 상한 | 도시 | 전략 | 초과 월 |", "|---|---|---|---|");
  for(const j of gs)for(const r of j.result.rows.filter(r=>r.overMonths.length))lines.push(`| ${j.share} | ${city(r.id)} | ${r.strategy} | ${r.overMonths.join(", ")} |`);
  if(gs.every(j=>!j.result.debt.overCityMonths))lines.push("| 전체 | 없음 | — | — |");
  lines.push("", "## T5 36달", "", "| 상한 | 신뢰100 /42 | SMR 1위 도시/6 | 연구 몰빵−연구0 | B16 |", "|---|---:|---:|---:|---|");
  for(const j of ts)lines.push(`| ${j.share} | ${j.result.rows.filter(r=>r.parts.rel===100).length} | ${j.result.smrFirstCities} | ${n(j.result.researchGain)} | ${yn(j.result.B16)} |`);
  for(const j of ts)matrix(`T5 상한 ${j.share}`,j.result);
  lines.push("## G 손잡이 후보와 예상 방향", "",
    "| 후보 | 예상 방향(채택·추천 아님) |", "|---|---|",
    "| gridImportShare | 낮추면 같은 수요·자체 공급에서 잔여 부족이 늘거나 유지된다. 실제 장기 결과에는 지출·투자·이주 피드백이 함께 들어간다. |",
    "| gridImportMarkup | 높이면 동일 공급량의 계통 비용이 커진다. 당장 신뢰의 물리적 입력은 같고, 이후 재정·투자를 통해 간접 영향이 생길 수 있다. 이번에는 고정했다. |",
    "| scoreUnsZero | 낮추면 같은 양의 정전 완화 상태에서 신뢰 감점이 커진다. 미공급 자체가 0이면 이 값만으로 100 포화를 풀 수 없다. 이번에는 고정했다. |", "",
    "## 검증·축소·미검증", "",
    `측정기 무결성 단언 ${out.assertions} 통과 / 0 실패. 원 검사 ${out.sourcePasses} 통과 / ${out.sourceFailures.length} 실패. 원 검사의 정책 성과 기준 실패를 측정기 성공으로 바꾸지 않고 아래 기록한다.`,
    ...out.sourceFailures.map(x=>`- ${x.job}: ${x.message}`), "",
    "| 실행 | 초 | 원 검사 통과 | 원 검사 실패 |", "|---|---:|---:|---:|",
    ...Object.values(out.jobs).map(j=>`| ${j.key} | ${n(j.seconds,1)} | ${j.result.sourceChecks.passCount} | ${j.result.sourceChecks.fail.length} |`), "",
    ...(out.reportingRevision ? ["보고서의 관측 해석·nothing 범위 설명·T5 요약 열만 실행 뒤 보완했다. 실행본과 최종본의 계산 함수·스케줄러·진입점이 바이트 단위로 같음을 확인했다. JSON sourceHashes는 실제 실행본 해시이며, reportingRevision에는 최종 측정기 해시와 검증 결과를 따로 보존했다.", ""] : []),
    "자체 검사는 사분위·99/100 경계, 모든 params 중 상한만 변경됨, 각 시안 첫 달 전체 상태·결과가 계측 유무에 따라 동일함, 원 gridSupply의 이웃 공급·시간 상한·과잉 공급 방지·비용을 확인한다. 모든 일반 궤적의 완주·시간 수·최종 신뢰 재구성 및 T5 월 누계 예산을 확인했다.",
    "무거운 워커는 직렬 1개. 시작 전·실행 중 10초마다 uptime을 읽으며 1분 부하가 150을 넘으면 대기 또는 SIGSTOP, 내려가면 SIGCONT한다. 최대 부하는 표본 최대이며 순간 피크는 아니다. 90분을 넘길 것으로 예상되는 T5부터 줄인다.", "",
    `1분 부하 150 초과 표본은 ${out.loadLog.filter(r=>r.oneMinute>150).length}개다. ${out.loadLog.some(r=>r.oneMinute>150) ? "고부하 표본의 시각과 작업 위치는 JSON loadLog에 남겼다." : "이번에는 SIGSTOP·SIGCONT의 실제 고부하 중단·재개가 발생하지 않아 이 실경로 검증은 남는다."}`, "",
    "축소 범위:", ...(out.skipped.length ? out.skipped.map(j=>`- ${j.key}: ${j.reason}`) : ["- 없음."]), "",
    "해석 한계·미검증:",
    "- 단일 기본 씨앗 결과이며 다른 씨앗·실제 사용자 여섯 팀 영상의 행동은 재현하지 않았다. bots36 회전에서는 이웃 전략도 함께 바뀐다. nothing은 매달 builds·lines·policies·missions가 빈 계획을 제출하는 bots36 대조군이다. 실제 사용자의 무조작 상태나 시작 설비 유지 행동과 동일하다고 가정하지 않는다.",
    "- T5의 연구0은 연구만 하지 않고 건설·정책 운영을 계속하므로 일반 봇의 nothing과 다르다. T5는 초점 도시 외 다섯 도시가 균형 AI이고 시안마다 SMR 지출에 대안 예산을 다시 맞춘다. 고정 건설 계획에서 상한만 바꾼 순수 물리 효과로 해석하지 않는다.",
    "- 주간→월 환산 비용은 반올림 전 gridSupply 증분이다. 공개 연료비는 먼저 0.01억으로 반올림되므로 원장 행과 미세 차이가 가능하다. 계통 에너지·비용에 이웃 수입 imp/pay를 더하지 않았다.",
    "- 100 포화가 계통 보충과 양립함을 보여 주지만, 보충 이전에 이미 무정전인 시간과 보충으로 해소된 시간을 구분해야 한다. 다른 상한의 장기 차이는 피드백을 포함한다.",
    "- D-66 근거 계수·제품 UI는 변경하지 않았다. 별도 전체 회귀·브라우저·운영 검증은 미실행이며, 브라우저·외부 네트워크·커밋은 사용자 금지에 따라 실행하지 않았다.", "");
  return lines.join("\n");
}
if (require.main === module) {
  if (process.argv[2] === "--worker") {
    ok(process.env.REL_SERIAL_WORKER === "1", "worker requires serial scheduler");
    const job = JSON.parse(process.argv[3]), started = Date.now();
    const result = job.kind === "general" ? general(job.share) : technology(job.share);
    const saved = saveJSON(job.out, {result, seconds: (Date.now() - started) / 1000, assertions});
    ok(saved.file === job.out, "worker summaries fit 1MB; do not silently redirect scheduler input");
  } else if (process.argv[2] === "--self-test") {
    (async () => {
      while (loadSample("self-test") > 150) await delay(15000);
      selfTest(); console.log(`self-test ${assertions}/0`);
    })().catch(e => {console.error(e); process.exitCode = 1;});
  } else main().catch(e => {console.error(e); process.exitCode = 1;});
}
