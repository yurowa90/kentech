"use strict";
// Standalone, unnumbered measurement. No production writes, network or browser.
// Reproduce: node tests/league/review/D73-measure.js
// Fast integrity checks: node tests/league/review/D73-measure.js --self-test
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const crypto = require("node:crypto"), assert = require("node:assert/strict");
const {spawn, execFileSync} = require("node:child_process");
const ROOT = path.resolve(__dirname, "../../..");
const MODULES = ["build-maps", "tech-data", "build", "econ-data", "econ", "league-data", "league-core", "league-ai"];
const SEEDS = ["alpha", "beta", "gamma", "delta", "epsilon"];
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
const VARIANTS = {
  current: {label: "현재 B80·0.4173·C1·H2"},
  scale: {label: "탄소 눈금만 A0", scale: true},
  national: {label: "국가 계수만 0.4567", national: true},
  grid: {label: "계통 수입만 0", grid: true},
  hvdc: {label: "HVDC만 .012·×1", hvdc: true},
  scale_national: {label: "A0 + 국가 계수 이전", scale: true, national: true}
};
const CARBON = /  const carbonScore = \(C, data\) => \{[\s\S]*?\n  \};/g;
const A0 = '  const carbonScore = (C, data) => c100(100 * (pv(data, "scoreCo2Worst") - fin(C.co2Intensity, fin(C.co2Intensity0, pv(data, "co2IntDef")))) / (pv(data, "scoreCo2Worst") - pv(data, "scoreCo2Best")));';
function sourceFor(name, variant) {
  const v = VARIANTS[variant];
  ok(!!v, `known variant ${variant}`);
  let source = read(`ui/${name}.js`);
  if (name === "econ" && v.scale) source = once(source, CARBON, A0, "A0 carbon function");
  const values = name === "econ-data" ? {
    ...(v.national ? {normalCo2: .4567, co2IntRef: .4567, co2IntDef: .4567, scoreCo2Best: .274} : {}),
    ...(v.grid ? {gridImportShare: 0} : {})
  } : name === "tech-data" && v.hvdc ? {hvdcLoss: .012, hvdcCap: 1} : {};
  for (const [key, value] of Object.entries(values))
    source = once(source, new RegExp(`(${key}: p\\()[0-9.]+`, "g"), `$1${value}`, `${name}/${key}`);
  return source;
}
function context(variant) {
  const ctx = vm.createContext({console, document: {documentElement: {}}, KCP: {route() {}, on() {}, esc: x => x}});
  ctx.window = ctx;
  vm.runInContext('Math.random = () => {throw Error("unseeded random");}', ctx);
  for (const n of MODULES) vm.runInContext(sourceFor(n, variant), ctx, {filename: n});
  return ctx;
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
  const python = process.env.D73_PYTHON || path.join(ROOT, "tests/.venv/bin/python");
  return JSON.parse(execFileSync(python, ["-B", "-c", script, path.join(ROOT, "tests/league/bots36.py")],
    {input: JSON.stringify(raw), encoding: "utf8", maxBuffer: 32 * 1024 * 1024}));
}
function general(seed) {
  const ctx = context("current");
  vm.runInContext(pythonString("tests/league/calib.py", "AUTO"), ctx);
  const js = once(pythonString("tests/league/bots36.py", "JS"), 'newGame("bots-strategy-common")',
    `newGame(${JSON.stringify(seed)})`, "general seed");
  const raw = vm.runInContext(js, ctx)({months: 36, rotations: 9});
  ok(raw.runs.length === 9 && raw.runs.every(r => r.hist.length === 36 && r.rows.length === 6), "general full trajectories");
  const post = pythonPost(raw), rows = raw.runs.flatMap(r => r.rows.map(x => ({
    id: x.id, strategy: x.strategy, score: x.score, parts: x.parts, cash: x.cash, avgUns: x.unsPct
  })));
  const summary = summarize(rows, raw.strategies, raw.ids);
  const debt = raw.runs.flatMap(run => raw.ids.map(id => ({
    id, strategy: run.assignment[id],
    months: run.hist.filter(h => h.fiscal[id].debtOver).map(h => h.month)
  })));
  const baseDebt = debt.filter(r => r.strategy === "base");
  return {...summary, seed, names: raw.names, sourceChecks: post.sourceChecks,
    horizons: post.horizons, debtBreakdown: post.debtBreakdown,
    debt: {rows: debt, overCityMonths: debt.reduce((s, r) => s + r.months.length, 0),
      baseCityMonths: baseDebt.reduce((s, r) => s + r.months.length, 0),
      byCity: Object.fromEntries(raw.ids.map(id => [id, debt.filter(r => r.id === id).reduce((s, r) => s + r.months.length, 0)])),
      baseByCity: Object.fromEntries(baseDebt.map(r => [r.id, r.months]))},
    meanUns: mean(rows.map(r => r.avgUns)),
    activeMeanUns: mean(rows.filter(r => r.strategy !== "nothing").map(r => r.avgUns)),
    nothingLast: rows.filter(r => r.strategy === "nothing").every(r => r.strategyRank === 9),
    renewAboveDiesel: summary.means.renew > summary.means.diesel,
    rawHash: sha(JSON.stringify(raw))};
}
function decomposition(rows, ids, weights, floor) {
  const wsum = Object.values(weights).reduce((a, b) => a + b, 0);
  const geometric = r => Math.exp(Object.keys(weights).reduce((s, k) =>
    s + weights[k] / wsum * Math.log(Math.max(floor, r.parts[k])), 0));
  const capped = r => Math.max(0, Math.min(100, geometric(r) + r.coop));
  for (const r of rows) near(Math.round(capped(r) * 10) / 10, r.score, `reconstruct ${r.id}/${r.strategy}`);
  return Object.fromEntries(ids.map(id => {
    const group = rows.filter(r => r.id === id).slice().sort((a, b) => b.score - a.score);
    const smr = group.find(r => r.strategy === "smr"), other = group.find(r => r.strategy !== "smr");
    const a = geometric(smr), b = geometric(other);
    const log = Object.fromEntries(Object.keys(weights).map(k => [k,
      weights[k] / wsum * Math.log(Math.max(floor, smr.parts[k]) / Math.max(floor, other.parts[k]))]));
    const logSum = Object.values(log).reduce((s, v) => s + v, 0);
    near(logSum, Math.log(a / b), `${id}: log conservation`);
    const gap = smr.score - other.score, geometricGap = a - b, coopDelta = smr.coop - other.coop;
    const clippingDelta = (capped(smr) - (a + smr.coop)) - (capped(other) - (b + other.coop));
    const roundingDelta = gap - (capped(smr) - capped(other));
    near(gap, geometricGap + coopDelta + clippingDelta + roundingDelta, `${id}: displayed score conservation`);
    return [id, {smrRank: smr.strategyRank, alternative: other.strategy,
      literalSecond: group[1].strategy, literalSecondGap: smr.score - group[1].score,
      score: [smr.score, other.score], gap, parts: [smr.parts, other.parts],
      log, logSum, geometricGap, coopDelta, clippingDelta, roundingDelta}];
  }));
}
function technology(variant, seed) {
  const evaluated = {};
  let KCP;
  const shimVM = {...vm, runInContext(source, ctx, ...args) {
    for (const name of MODULES) if (source === read(`ui/${name}.js`)) {
      evaluated[name] = (evaluated[name] || 0) + 1;
      source = sourceFor(name, variant); break;
    }
    const value = vm.runInContext(source, ctx, ...args); KCP = ctx.KCP; return value;
  }};
  const shimFS = {...fs, writeFileSync(file) {ok(file === "/d73-memory.json", "T5 report sink only");}};
  const allowed = {"node:fs": shimFS, "node:path": path, "node:vm": shimVM, "node:crypto": crypto};
  const box = {__dirname, console: {log(...args) {
    if (args[0] === "FAIL:" || String(args[0]).startsWith('{"city":')) console.log(...args);
  }}, process: {env: {TECH_BALANCE_OUT: "/d73-memory.json"}, exitCode: 0},
  require(name) {ok(Object.hasOwn(allowed, name), `T5 dependency ${name}`); return allowed[name];}};
  const source = once(read("tests/league/review/11-tech-balance.js"), 'seed: "tech-strategy-common"',
    `seed: ${JSON.stringify(seed)}`, "T5 seed");
  vm.runInNewContext(source + "\nglobalThis.__report = report;", box, {filename: "11-tech-balance.js"});
  const raw = box.__report;
  ok(MODULES.every(n => evaluated[n] === 1), "T5 each engine source exactly once");
  ok(raw.seed === seed && raw.runs.length === 42 && raw.runs.every(r => r.months.length === 36), "T5 seed and full 42 trajectories");
  ok(box.process.exitCode === (raw.failures.length ? 1 : 0), "T5 source exit agrees with failures");
  return summarizeTechnology(raw, KCP, variant, seed);
}
function summarizeTechnology(raw, KCP, variant, seed) {
  ok(raw.seed === seed && raw.runs.length === 42 && raw.runs.every(r => r.months.length === 36), "T5 complete input for summary");
  const ids = [...new Set(raw.runs.map(r => r.id))], strategies = Object.keys(raw.strategies);
  const rows = raw.runs.map(r => ({
    id: r.id, strategy: r.strategy, score: r.score, parts: r.parts, coop: r.coop,
    avgUns: r.avgUns, account: r.account, budget: r.budget || null, adopted: r.adopted,
    co2Intensity: r.state.cities[r.id].co2Intensity, co2Intensity0: r.state.cities[r.id].co2Intensity0,
    hvdcMonths: r.months.filter(m => m.ties.some(t => t.st === "built" && t.kind === "hvdc")).map(m => m.month),
    overMonths: r.months.filter(m => m.cash < -m.debtCap).map(m => m.month),
    trajectoryHash: sha(JSON.stringify(r.months))
  }));
  const summary = summarize(rows, strategies, ids);
  const weights = clone(KCP.ECON_DATA.params.wScore.v);
  const floor = Math.max(1, Math.min(100, KCP.ECON_DATA.params.scorePartFloor?.v || 1));
  return {...summary, seed, variant, names: Object.fromEntries(ids.map(id => [id, KCP.ECON_DATA.start[id].name])),
    strategyNames: raw.strategies, weights, floor,
    smrFirstCities: raw.smrFirstCities, researchGain: raw.researchGain,
    sourceChecks: {passCount: raw.passes, fail: raw.failures}, rawHash: sha(JSON.stringify(raw)),
    decomposition: decomposition(rows, ids, weights, floor)};
}
function selfTest() {
  const base = context("current"), D = base.KCP.ECON_DATA;
  for (const n of MODULES) ok(sourceFor(n, "current") === read(`ui/${n}.js`), `${n}: current source byte identity`);
  for (const [variant, v] of Object.entries(VARIANTS)) {
    const ctx = context(variant), data = ctx.KCP.ECON_DATA;
    for (const key of Object.keys(D.params)) {
      const expected = v.national && ["normalCo2", "co2IntRef", "co2IntDef"].includes(key) ? .4567 :
        v.national && key === "scoreCo2Best" ? .274 : v.grid && key === "gridImportShare" ? 0 :
        v.hvdc && key === "tech_hvdcLoss" ? .012 : v.hvdc && key === "tech_hvdcCap" ? 1.0 : D.params[key].v;
      ok(JSON.stringify(data.params[key].v) === JSON.stringify(expected), `${variant}/${key}: isolated parameter`);
    }
    const src = sourceFor("econ", variant), carbon = src.match(CARBON) || [A0];
    const fn = vm.runInNewContext(`const c100=x=>Math.max(0,Math.min(100,x)), fin=(x,d=0)=>Number.isFinite(x)?x:d, pv=(d,k)=>d.params[k].v; ${carbon[0]}\ncarbonScore`);
    near(fn({co2Intensity: data.params.scoreCo2Best.v, co2Intensity0: data.params.scoreCo2Best.v}, data),
      v.scale ? 100 : 80, `${variant}: carbon target`);
    near(fn({co2Intensity: 0, co2Intensity0: .7}, data), 100, `${variant}: carbon zero`);
    near(fn({co2Intensity: data.params.scoreCo2Worst.v, co2Intensity0: data.params.scoreCo2Worst.v}, data),
      0, `${variant}: carbon worst`);
    const params = ctx.KCP.TECH_DATA.params;
    // Compare actual evaluated data through the engine's exported effectiveTie.
    const C = ctx.KCP.leagueCore, R = C.regionOf("south");
    const state = C.newState("d73-integrity", R.id, 0, R.teams.map(t => t.id), {turns: 36});
    ok(!!state.econ && Object.keys(state.econ.cities).length === 6, `${variant}: initialized six cities`);
    near(params.hvdcLoss.v, v.hvdc ? .012 : .01, `${variant}: HVDC loss`);
    near(params.hvdcCap.v, v.hvdc ? 1 : 1.5, `${variant}: HVDC capacity`);
    for (const name of MODULES) {
      const changed = sourceFor(name, variant) !== read(`ui/${name}.js`);
      const expected = name === "econ" && !!v.scale || name === "econ-data" && !!(v.national || v.grid) || name === "tech-data" && !!v.hvdc;
      ok(changed === expected, `${variant}: only declared module changed (${name})`);
    }
  }
}
function hashes() {
  const files = execFileSync("rg", ["--files", "ui"], {cwd: ROOT, encoding: "utf8"}).trim().split("\n");
  files.push("tests/league/bots36.py", "tests/league/calib.py", "tests/league/review/11-tech-balance.js", "tests/league/review/D73-measure.js");
  return Object.fromEntries(files.sort().map(f => [f, sha(read(f))]));
}
const loadLog = [], delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function loadSample(label) {
  const raw = execFileSync("uptime", [], {encoding: "utf8"}).trim(), match = raw.match(/load averages?:\s*([0-9.]+)/);
  ok(!!match, "uptime parse");
  const row = {at: new Date().toISOString(), label, oneMinute: +match[1], raw};
  loadLog.push(row); return row.oneMinute;
}
async function runJob(job, tmp) {
  while (loadSample(`before ${job.key}`) > 150) {console.log(`WAIT ${job.key}`); await delay(15000);}
  console.log(`START ${job.key}`);
  const out = path.join(tmp, job.key + ".json");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename, "--worker", JSON.stringify({...job, out})],
      {stdio: ["ignore", "inherit", "inherit"], env: {...process.env, D73_SERIAL_WORKER: "1"}});
    let paused = false;
    const timer = setInterval(() => {
      try {
        const load = loadSample(`during ${job.key}`);
        if (load > 150 && !paused) {child.kill("SIGSTOP"); paused = true; console.log(`PAUSE load=${load}`);}
        if (load <= 150 && paused) {child.kill("SIGCONT"); paused = false; console.log(`RESUME load=${load}`);}
      } catch (error) {child.kill("SIGCONT"); child.kill("SIGTERM"); reject(error);}
    }, 10000);
    const stop = () => {child.kill("SIGCONT"); child.kill("SIGTERM");};
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
  ok(bytes <= 1000000 || file.startsWith(path.join(process.env.HOME, "Projects/kentech-wt/_briefs/lanes/q8/results") + path.sep),
    `JSON >1MB must use designated external results path (${bytes}B)`);
  fs.writeFileSync(file, text); return bytes;
}
async function main() {
  const initialHashes = hashes(), head = execFileSync("git", ["rev-parse", "HEAD"], {cwd: ROOT, encoding: "utf8"}).trim();
  const flag = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
  const resume = flag("--resume"), reference = flag("--baseline-t5");
  const prior = resume ? JSON.parse(fs.readFileSync(path.join(resume, "checkpoint.json"), "utf8")) : null;
  const started = prior ? Date.parse(prior.started) : Date.now();
  if (prior) {
    ok(prior.head === head, "resume HEAD");
    for (const [file, hash] of Object.entries(prior.sourceHashes))
      if (file !== "tests/league/review/D73-measure.js") ok(initialHashes[file] === hash, `resume source ${file}`);
    const original = fs.readFileSync(path.join(resume, "original-measure.js"), "utf8");
    ok(sha(original) === prior.sourceHashes["tests/league/review/D73-measure.js"], "resume saved original runner hash");
    ok(original.split("function decomposition(")[0] === read("tests/league/review/D73-measure.js").split("function decomposition(")[0],
      "resume general computation byte identity");
    ok(Object.keys(prior.jobs).every(k => k === "general-common"), "resume only verified general baseline");
    loadLog.push(...prior.loadLog);
  }
  const tmp = fs.mkdtempSync("/tmp/d73-measure-");
  loadSample("start"); selfTest();
  const output = {head, node: process.version, started: new Date(started).toISOString(), sourceHashes: initialHashes,
    variants: VARIANTS, jobs: prior ? prior.jobs : {}, skipped: [], loadLog, temporaryDirectory: tmp,
    resumedGeneral: prior ? {directory: resume, originalRunnerHash: prior.sourceHashes["tests/league/review/D73-measure.js"]} : null};
  if (reference) {
    const rawText = fs.readFileSync(path.resolve(reference), "utf8"), raw = JSON.parse(rawText);
    const expected = ["tests/league/review/11-tech-balance.js", ...MODULES.map(n => `ui/${n}.js`)];
    ok(expected.every(file => raw.sources[file] === initialHashes[file]), "reference T5 all nine source hashes");
    ok(raw.passes === 22030 && raw.failures.length === 0 && raw.smrFirstCities === 4, "reference T5 reported checks");
    near(raw.researchGain, 1.6333333333333258, "reference T5 research gain");
    // Revalidate all budget prefixes in the completed raw trajectories, not only
    // the recorded pass count. The full original report stays outside the repo.
    for (const run of raw.runs) if (["renew", "ties", "hybrid"].includes(run.strategy)) {
      const smr = raw.runs.find(r => r.id === run.id && r.strategy === "smr");
      for (const month of run.months)
        ok(month.cumulativeMatchedSpend <= smr.months[month.month - 1].cumulativeMatchedSpend + raw.budgetTolerance,
          `reference ${run.id}/${run.strategy}/${month.month}: matched budget`);
    }
    const result = summarizeTechnology(raw, context("current").KCP, "current", "tech-strategy-common");
    output.jobs["tech-current"] = {key: "tech-current", kind: "tech", variant: "current", seed: raw.seed,
      result, seconds: 0, assertions: 0, reused: {path: path.resolve(reference), sha256: sha(rawText),
        reason: "사용자가 전달한 완료 측정: 9개 입력 해시·42개 완주·예산 누계·점수 재구성 대조"}};
  }
  if (prior) output.interruption = {from: prior.loadLog.at(-1).at, to: new Date().toISOString(),
    reason: "입력 해시가 일치하는 완료 T5 원자료를 확인한 뒤 중복 기준 실행 중단. 이 구간의 10초 부하 표본은 중단 프로세스의 메모리에서 회수하지 못함. 경과 시간에는 포함."};
  const jobs = [
    {key: "general-common", kind: "general", seed: "bots-strategy-common"},
    {key: "tech-current", kind: "tech", variant: "current", seed: "tech-strategy-common"},
    ...SEEDS.map(seed => ({key: `general-${seed}`, kind: "general", seed})),
    ...["scale", "national", "grid", "hvdc"].map(variant => ({key: `tech-${variant}`, kind: "tech", variant, seed: "tech-strategy-common"}))
  ];
  // Preserve the five general seeds first; reduce section 2 before section 3.
  const budget = 90 * 60;
  const estimate = kind => Math.max(...Object.values(output.jobs).filter(j => j.kind === kind).map(j => j.seconds), kind === "tech" ? 300 : 120) * 1.15;
  async function execute(job, optional = false) {
    if (output.jobs[job.key]) {console.log(`VERIFIED REUSE ${job.key}`); return;}
    const elapsed = (Date.now() - started) / 1000;
    if (optional && elapsed + estimate(job.kind) > budget - 120) {
      output.skipped.push({...job, reason: `90분 예산: 경과 ${elapsed.toFixed(1)}초 + 예상 ${estimate(job.kind).toFixed(1)}초 + 집계 여유120초`});
      console.log(`SKIP ${job.key}`); return;
    }
    const measured = await runJob(job, tmp);
    output.jobs[job.key] = {...job, ...measured};
    // Checkpoints contain references rather than duplicating the growing results.
    saveJSON(path.join(tmp, "checkpoint.json"), {...output, jobs: Object.fromEntries(Object.entries(output.jobs).map(([key,j]) =>
      [key, {kind:j.kind, seed:j.seed, seconds:j.seconds, path:path.join(tmp,key+".json")}]))});
  }
  for (const job of jobs) await execute(job, job.kind === "tech" && job.variant !== "current");
  // One interaction only: both individual reversions must affect T5 outcomes.
  const base = output.jobs["tech-current"].result;
  const affects = key => output.jobs[key] && output.jobs[key].result.rows.some((r, i) =>
    r.score !== base.rows[i].score || r.parts.co2 !== base.rows[i].parts.co2);
  if (affects("tech-scale") && affects("tech-national"))
    await execute({key: "tech-scale_national", kind: "tech", variant: "scale_national", seed: "tech-strategy-common"}, true);
  else output.interactionReason = "탄소 눈금과 국가 계수 양쪽의 단독 점수 변화가 관측되지 않아 교차를 추가하지 않음.";
  for (const seed of SEEDS) await execute({key: `tech-seed-${seed}`, kind: "tech", variant: "current", seed}, true);
  ok(JSON.stringify(hashes()) === JSON.stringify(initialHashes), "all ui and input files unchanged");
  ok(execFileSync("git", ["rev-parse", "HEAD"], {cwd: ROOT, encoding: "utf8"}).trim() === head, "HEAD unchanged");
  output.assertions = assertions + Object.values(output.jobs).reduce((s, j) => s + j.assertions, 0);
  output.seconds = (Date.now() - started) / 1000;
  output.maxLoad = Math.max(...loadLog.map(r => r.oneMinute));
  output.sourceFailures = Object.values(output.jobs).flatMap(j => j.result.sourceChecks.fail.map(message => ({job: j.key, message})));
  // Observed robustness failures are retained, not relabelled as passing assertions.
  output.sourcePasses = Object.values(output.jobs).reduce((s, j) => s + j.result.sourceChecks.passCount, 0);
  let file = path.join(__dirname, "D73-measure-results.json");
  if (Buffer.byteLength(JSON.stringify(output)) + 512 > 1000000) {
    file = path.join(process.env.HOME, "Projects/kentech-wt/_briefs/lanes/q8/results/D73-measure-results.json");
    fs.mkdirSync(path.dirname(file), {recursive: true});
  }
  output.resultPath = file;
  output.bytes = Buffer.byteLength(JSON.stringify(output)) + 100;
  saveJSON(file, output);
  fs.writeFileSync(path.join(__dirname, "D73-measure-report.md"), report(output));
  console.log(JSON.stringify({file, seconds: output.seconds, maxLoad: output.maxLoad,
    assertions: output.assertions, sourcePasses: output.sourcePasses, sourceFailures: output.sourceFailures, skipped: output.skipped}));
}
const n = (x, digits = 3) => Number.isFinite(x) ? x.toFixed(digits) : "—";
const yn = b => b ? "충족" : "미충족";
function report(out) {
  const g = out.jobs["general-common"].result, t = out.jobs["tech-current"].result;
  const city = id => g.names[id], techs = Object.values(out.jobs).filter(j => j.kind === "tech" && j.seed === "tech-strategy-common");
  const lines = ["# D-73·D-74·D-79 구현 뒤 재측정", "",
    `HEAD \`${out.head}\`, Node ${out.node}. 실행 ${n(out.seconds / 60, 2)}분, 10초 표본 최대 1분 부하 ${n(out.maxLoad, 2)}.`,
    `전체 새 실행: \`node tests/league/review/D73-measure.js\`. 기존 T5 기준 대조 재사용: \`node tests/league/review/D73-measure.js --baseline-t5 /tmp/kcp-tech-balance.json\` (9개 입력 해시 검증 필수). 자체 검사: \`node tests/league/review/D73-measure.js --self-test\`.`,
    `결과: \`${out.resultPath}\`. JSON에는 최종 부분점수·도시별 초과 달·예산 맞춤 이력·원자료 해시를 보존한다. 전체 월 상태 원문은 메모리에서만 사용한다.`, "",
    "## 현재 구현 기록 대조", "",
    "| 항목 | 전달된 기록 | 재측정 |", "|---|---|---|",
    `| 일반 원 검사 통과/실패 | 18326/0 | ${g.sourceChecks.passCount}/${g.sourceChecks.fail.length} |`,
    `| 일반 B16 / 최다 1위 | 충족 / storage 4 | ${yn(g.B16)} / ${Object.entries(g.firstCounts).filter(([,v])=>v).map(([k,v])=>`${k} ${v}`).join("·")} |`,
    `| 재생 / 디젤 평균 | 72.667 / 52.083 | ${n(g.means.renew)} / ${n(g.means.diesel)} |`,
    `| nothing 6도시 9/9위 | 충족 | ${yn(g.nothingLast)} |`,
    `| T5 원 검사 통과/실패 | 22030/0 | ${t.sourceChecks.passCount}/${t.sourceChecks.fail.length} |`,
    `| T5 SMR 1위 / 연구 이득 | 4 / +1.633 | ${t.smrFirstCities} / ${n(t.researchGain)} |`, "",
    ...(out.jobs["tech-current"].reused ? [`T5 기준은 기존 완료 원자료 \`${out.jobs["tech-current"].reused.path}\`를 재집계했다. 원 검사와 엔진 8개 파일의 해시가 현재와 모두 같으며, 42개 36달 궤적·모든 대안의 월 예산 누계·총점 재구성을 다시 검증했다. 해당 22,030건은 기존 실행의 검사 수이며 이번에 새 실행한 수로 표현하지 않는다. 원자료 SHA-256: \`${out.jobs["tech-current"].reused.sha256}\`.`, ""] : []),
    "## T5 단독 되돌림", "",
    "현재 엔진 소스는 그대로 읽고 VM 안에서만 치환했다. A0는 이전 선형 절대 눈금이며 최선 기준 .25038을 유지한다. 국가 계수 되돌림은 normalCo2·co2IntDef·co2IntRef=.4567, scoreCo2Best=.274이고 B80을 유지한다. 계통은 gridImportShare=0, HVDC는 hvdcLoss=.012·hvdcCap=1이다. 나머지 값과 전략·예산 알고리즘은 유지한다.", "",
    "| 시안 | SMR 1위/6 | 연구 이득 | Δ연구 이득 | B16 | HVDC 관측 궤적/42 |",
    "|---|---:|---:|---:|---|---:|",
    ...techs.map(j => {const r=j.result;return `| ${VARIANTS[j.variant].label} | ${r.smrFirstCities} | ${n(r.researchGain)} | ${n(r.researchGain-t.researchGain)} | ${yn(r.B16)} | ${r.rows.filter(x=>x.hvdcMonths.length).length} |`;}),
    "", "연구 이득은 연구 몰빵 평균−연구0 평균이다. SMR≤3은 희망 목표이며 단언으로 강제하지 않는다.", ""];
  for (const job of techs) {
    const r = job.result;
    lines.push(`### ${VARIANTS[job.variant].label}`, "", "각 칸: 총점 / 탄소 부분점수 (현재 대비 Δ총점 / Δ탄소).", "",
      `| 도시 | ${r.strategies.join(" | ")} | 1위 |`, `|---|${r.strategies.map(()=>"---:|").join("")}---|`);
    for (const id of r.ids) lines.push(`| ${city(id)} | ${r.strategies.map(s => {
      const x=r.rows.find(a=>a.id===id&&a.strategy===s),b=t.rows.find(a=>a.id===id&&a.strategy===s);
      return `${n(x.score,1)} / ${n(x.parts.co2,1)} (${n(x.score-b.score,1)} / ${n(x.parts.co2-b.parts.co2,1)})`;
    }).join(" | ")} | ${r.winners[id].join("·")} |`);
    lines.push("", "SMR이 1위이면 비교 상대는 2위, 아니면 최강 비SMR이다. 실제 순위 2위와의 차이도 별도 열에 표시한다. 로그 기여는 점수 단위가 아니다.", "",
      "| 도시 | SMR 순위 | 최강 비SMR | 총점차 | 실제 2위 / 차이 | 탄소 log | 신뢰 log | 재정 log | 지지 log | 인구 log | 산업 log | log합 | 공동보너스차 | 자름차 | 반올림차 |",
      "|---|---:|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const id of r.ids) {
      const d=r.decomposition[id];
      lines.push(`| ${city(id)} | ${d.smrRank} | ${d.alternative} | ${n(d.gap)} | ${d.literalSecond} / ${n(d.literalSecondGap)} | ${["co2","rel","fin","appr","pop","ind"].map(k=>n(d.log[k],6)).join(" | ")} | ${n(d.logSum,6)} | ${n(d.coopDelta)} | ${n(d.clippingDelta,6)} | ${n(d.roundingDelta,6)} |`);
    }
  }
  lines.push("", "부분점수 기여는 `w/Σw × ln(max(1, SMR 부분점수)/max(1, 상대 부분점수))`이다. 현재 Σw=1. 탄소 .275·신뢰 .25·재정 .125·지지 .15·인구 .10·산업 .10. 부분점수 0은 엔진의 로그 계산에서 1로 취급한다. 총점은 기하평균+공동 보너스 뒤 0~100 자름·소수 첫째 자리 반올림이므로, 로그합을 총점차와 직접 더하지 않는다. 각 행에서 로그합 보존 및 총점 재구성을 단언했다.", "",
    "## 일반 9전략 씨앗 5개", "",
    "| 씨앗 | B16 | 재생 | 디젤 | 재생>디젤 | nothing 6도시9위 | 초과 도시·전략·달/1944 | base 초과 도시·달/216 | 평균 정전% | nothing 제외 정전% |",
    "|---|---|---:|---:|---|---|---:|---:|---:|---:|");
  for (const seed of SEEDS) {
    const r=out.jobs[`general-${seed}`].result;
    lines.push(`| ${seed} | ${yn(r.B16)} | ${n(r.means.renew)} | ${n(r.means.diesel)} | ${yn(r.renewAboveDiesel)} | ${yn(r.nothingLast)} | ${r.debt.overCityMonths} | ${r.debt.baseCityMonths} | ${n(r.meanUns)} | ${n(r.activeMeanUns)} |`);
  }
  lines.push("", "정전은 6도시×9전략×36달을 동일 가중 평균한다. 지방채는 원 fiscal.debtOver로 센다. 같은 도시·달이 다른 전략에서 초과하면 별도 표본이다. 이전 화성 0/8/11/3/10달 기록과 비교할 때는 base 열을 구분한다.", "",
    `| 씨앗 | ${g.ids.map(city).join(" | ")} |`, `|---|${g.ids.map(()=>"---|").join("")}`);
  for (const seed of SEEDS) {
    const r=out.jobs[`general-${seed}`].result;
    lines.push(`| ${seed} | ${g.ids.map(id=>`${r.winners[id].join("·")} / 초과 ${r.debt.byCity[id]} / base ${r.debt.baseByCity[id].length}`).join(" | ")} |`);
  }
  lines.push("", "도시별 칸: 1위 전략 / 모든 전략 초과 달 합 / base 초과 달. 실제 초과 월:", "",
    "| 씨앗 | 도시 | 전략 | 초과 월 |", "|---|---|---|---|");
  for (const seed of SEEDS) for (const row of out.jobs[`general-${seed}`].result.debt.rows.filter(r=>r.months.length))
    lines.push(`| ${seed} | ${city(row.id)} | ${row.strategy} | ${row.months.join(", ")} |`);
  lines.push("", "## T5 씨앗 강건성", "", "| 씨앗 | SMR 1위/6 | 연구 이득 | B16 | 도시별 1위(자료 순서) |", "|---|---:|---:|---|---|");
  for (const seed of SEEDS) {
    const r=out.jobs[`tech-seed-${seed}`]?.result;
    lines.push(r ? `| ${seed} | ${r.smrFirstCities} | ${n(r.researchGain)} | ${yn(r.B16)} | ${g.ids.map(id=>`${city(id)} ${r.winners[id].join("·")}`).join("; ")} |` : `| ${seed} | — | — | 미측정 | 시간 예산 |`);
  }
  lines.push("", "## 검증·범위·해석 한계", "",
    `측정 무결성 단언 ${out.assertions} 통과/0 실패. 원 검사 ${out.sourcePasses} 통과/${out.sourceFailures.length} 실패. 원 검사 실패는 아래 그대로 기록하며 측정기 성공과 구분한다.`,
    ...out.sourceFailures.map(r=>`- ${r.job}: ${r.message}`), "",
    "일반 검사는 bots36.py의 전체 JS 및 Python 후처리·추가 단언을 사용했다. T5는 11-tech-balance.js의 전체 전략·사전 예산 맞춤·월 누계 단언을 유지했다. 씨앗은 실제 newGame/report.seed에 주입한다. 매 작업 독립 프로세스이며 무거운 계산은 직렬 한 개이다. 시작 전·작업 중 10초마다 uptime을 읽고 150 초과 시 워커를 멈춘 뒤 부하가 내려가면 재개한다. 최대 부하는 표본 최대이며 순간 피크는 아니다.",
    ...(out.interruption ? ["", `중단·재개: ${out.interruption.from}~${out.interruption.to}. ${out.interruption.reason}`] : []),
    "", "축소·생략:", ...out.skipped.map(j=>`- ${j.key}: ${j.reason}`),
    ...(out.skipped.length ? [] : ["- 없음."]), "",
    "- 일반은 회전마다 이웃 전략도 함께 바뀐다. T5는 초점 도시 외 다섯 도시가 균형 AI이며 대안 예산을 각 시안의 SMR 지출에 다시 맞춘다. 따라서 되돌림은 해당 실험 계약 전체의 효과이며 고정 건설 계획에서의 순수 물리 효과가 아니다.",
    "- 최종 로그 분해는 점수 차이의 회계적 분해이며 정책 인과 기여가 아니다. 총점 0.1점·부분점수 0.1점·정전율 0.01% 반올림을 따른다.",
    "- 다섯 씨앗은 열거한 사례의 강건성 측정이다. 모집단 확률이나 모든 씨앗의 보장을 뜻하지 않는다.",
    "- 근거 값은 제품에서 변경하지 않았다(D-66). VM의 이전 계수는 원인 비교용이며 채택·추천·결정이 아니다.",
    "- ui 전체 및 원 검사·측정기 입력의 해시, HEAD 보존을 확인했다. 브라우저·외부 네트워크·커밋은 사용자 지시로 실행하지 않았다. 별도 전체 회귀 및 운영 검증은 이번 측정 범위가 아니다.", "");
  return lines.join("\n");
}
if (require.main === module) {
  if (process.argv[2] === "--worker") {
    ok(process.env.D73_SERIAL_WORKER === "1", "worker launched by serial scheduler");
    const job = JSON.parse(process.argv[3]), start = Date.now();
    const result = job.kind === "general" ? general(job.seed) : technology(job.variant, job.seed);
    saveJSON(job.out, {result, seconds: (Date.now() - start) / 1000, assertions});
  } else if (process.argv[2] === "--self-test") {
    loadSample("self-test"); selfTest(); console.log(`self-test ${assertions}/0`);
  } else main().catch(error => {console.error(error); process.exitCode = 1;});
}
