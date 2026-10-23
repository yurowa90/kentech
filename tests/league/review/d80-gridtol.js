"use strict";
// D-80 A-3 measurement only. No UI writes, browser, network or git mutation.
// node tests/league/review/d80-gridtol.js --self-test
// node tests/league/review/d80-gridtol.js --out-dir /absolute/outside/repository/path
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const os = require("node:os"), crypto = require("node:crypto");
const {spawn, execFileSync} = require("node:child_process");
const ROOT = path.resolve(__dirname, "../../..");
const MODULES = ["build-maps", "tech-data", "build", "econ-data", "econ", "league-data", "league-core", "league-ai", "league"];
const DEFAULT_OUT = path.join(os.homedir(), "Projects/kentech-wt/_briefs/lanes/q8/results/d80");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const clone = x => JSON.parse(JSON.stringify(x));
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
const ZERO = .005;
let checks = 0;
function eq(actual, expected, label) { assert.deepEqual(actual, expected, label); checks++; }
function ok(value, label) { assert.ok(value, label); checks++; }
function near(actual, expected, label) {
  ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-8, label);
}
function distribution(values) {
  ok(values.every(Number.isFinite), "distribution accepts finite values only");
  const a = values.slice().sort((x, y) => x - y);
  if (!a.length) return {n: 0};
  const q = p => { const i = (a.length - 1) * p, l = Math.floor(i); return a[l] + (a[Math.ceil(i)] - a[l]) * (i - l); };
  return {n: a.length, min: a[0], q25: q(.25), median: q(.5), q75: q(.75), p90: q(.9), p95: q(.95), max: a.at(-1)};
}
function compareRows(rows) {
  const index = new Map();
  for (const r of rows) {
    const key = JSON.stringify([r.run, r.id, r.month]);
    ok(!index.has(key), `unique city-month ${key}`);
    ok(Number.isFinite(r.mwh) && r.mwh >= 0 && Number.isFinite(r.unsPct), "finite observations");
    index.set(key, r);
  }
  return rows.map(r => {
    const previous = index.get(JSON.stringify([r.run, r.id, r.month - 1]));
    const base = previous?.mwh ?? null, delta = previous ? r.mwh - base : null;
    return {...r, base, delta, ratio: base > 0 ? Math.abs(delta) / base : null,
      baseUnsPct: previous?.unsPct ?? null, deltaUnsPct: previous ? r.unsPct - previous.unsPct : null};
  });
}
function sameRate(rows, absolute, share) {
  const eligible = rows.filter(r => r.delta != null);
  const same = eligible.filter(r => Math.abs(r.delta) <= Math.max(absolute, share * Math.abs(r.base))).length;
  return {n: eligible.length, same, pct: eligible.length ? 100 * same / eligible.length : null};
}
function outageRate(rows, predicate = r => r.unsPct >= ZERO) {
  const eligible = rows.filter(r => r.deltaUnsPct != null && predicate(r));
  const same = eligible.filter(r => Math.abs(r.deltaUnsPct) <= .5).length;
  return {n: eligible.length, same, pct: eligible.length ? 100 * same / eligible.length : null};
}
function summary(rows) {
  const pairs = rows.filter(r => r.delta != null), ratios = pairs.filter(r => r.ratio != null);
  return {rows: rows.length, pairs: pairs.length, firstOrMissing: rows.length - pairs.length,
    zeroMwh: rows.filter(r => r.mwh === 0).length,
    zeroBase: pairs.filter(r => r.base === 0).length,
    zeroToZero: pairs.filter(r => r.base === 0 && r.mwh === 0).length,
    zeroToPositive: pairs.filter(r => r.base === 0 && r.mwh > 0).length,
    mwh: distribution(rows.map(r => r.mwh)), delta: distribution(pairs.map(r => r.delta)),
    absDelta: distribution(pairs.map(r => Math.abs(r.delta))),
    ratioPct: distribution(ratios.map(r => 100 * r.ratio))};
}
function once(source, needle, replacement) {
  eq(source.split(needle).length, 2, `VM hook exactly once: ${needle}`);
  return source.replace(needle, replacement);
}
function context() {
  const storage = new Map(), session = {room: "d80-measure", team: "pyeongtaek"};
  const ctx = vm.createContext({console, performance, structuredClone,
    document: {documentElement: {}, addEventListener() {}}, addEventListener() {},
    localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v)},
    KCP: {route() {}, on() {}, esc: s => String(s), leagueNet: {}}, __session: session});
  ctx.window = ctx;
  vm.runInContext('Math.random = () => { throw Error("unseeded random"); };', ctx);
  for (const n of MODULES) {
    let src = read(`ui/${n}.js`);
    if (n === "league") {
      // Only expose closures and attach an in-memory session; calculation bodies stay byte-identical.
      src = once(src, "let L = null;", "let L = globalThis.__session;");
      ok(/\}\)\(\);\s*$/.test(src), "league IIFE boundary");
      src = src.replace(/\}\)\(\);\s*$/, "KCP.__gridtol = {gridFillMWh, gridReliance, resultPeriod};\n})();");
    }
    vm.runInContext(src, ctx, {filename: `ui/${n}.js`});
  }
  return ctx;
}
function pythonString(file, key) {
  const matches = [...read(file).matchAll(new RegExp(`^${key} = r?"""\\n([\\s\\S]*?)^"""`, "gm"))];
  eq(matches.length, 1, `${file}/${key} extraction`);
  return matches[0][1];
}
function capture(ctx, S, res, run, strategies) {
  const {gridFillMWh, gridReliance, resultPeriod} = ctx.KCP.__gridtol;
  const period = resultPeriod(S, res);
  ok(period.mul > 0 && Number.isFinite(period.mul), "finite month multiplier");
  return Object.keys(res.team).map(id => {
    ctx.__session.room = S.room; ctx.__session.team = id;
    const r = res.team[id], g = gridReliance(S, res, id);
    const expected = Math.max(0, r.isolated.uns - r.uns - r.imp + r.sub) * period.mul;
    near(g.mwh, expected, "public-field independent formula equals actual gridReliance");
    near(gridFillMWh(r) * period.mul, expected, "representative-period grid fill");
    const previous = S.results.find(p => p.round === res.round - 1);
    if (previous) {
      const p = previous.team[id], pm = resultPeriod(S, previous).mul;
      near(g.base.mwh, Math.max(0, p.isolated.uns - p.uns - p.imp + p.sub) * pm, "previous month uses its own days");
      near(g.delta, g.mwh - g.base.mwh, "production delta");
    } else eq(g.delta, null, "no trial: first month has no fabricated baseline");
    return {run, id, strategy: strategies[id], month: res.round, year: res.year,
      calendarMonth: res.month, days: period.days, representativeDays: res.days, mul: period.mul,
      seed: res.seed, events: clone(res.events), mwh: g.mwh, unsPct: r.unsPct,
      productionBase: g.base.mwh, productionDelta: g.delta,
      fields: {uns: r.uns, imp: r.imp, sub: r.sub, isolatedUns: r.isolated.uns}};
  });
}
function progress(message) { process.send?.(message); }
function scenarios() {
  const ctx = context(), K = ctx.KCP, C = K.leagueCore, B = K.buildGame;
  const R = C.regionOf("south"), ids = R.teams.map(t => t.id), rows = [], requests = [];
  const names = Object.fromEntries(R.teams.map(t => [t.id, t.name]));
  for (const [run, months] of [["solo", 12], ["multi", 6]]) {
    const S = C.newState(`d80-${run}`, R.id, 0, ids, {turns: 12, seedMode: "fixed"});
    eq(S.seedKey, "0", "explicit fixed events/economy seed"); eq(S.salt, 0, "fixed weather salt");
    const apply = (id, type, extra = {}) => {
      const answer = C.reduce(S, {team: id, token: `d80-${id}`, type, ...extra}, 0, B);
      requests.push({run, month: S.round, id, type, ok: answer.ok, err: answer.err});
      ok(answer.ok, `${run}/${S.round}/${id}/${type}: ${answer.err}`);
    };
    ids.forEach(id => apply(id, "claim"));
    const computers = (player, repliesOnly) => {
      const answers = C.computerPlans(S, B, player, "balanced", repliesOnly);
      requests.push(...answers.map(a => ({run, month: S.round, ...a})));
      // AI tie proposals can legitimately fail a budget check. Do not hide them.
      answers.filter(a => a.type !== "tie").forEach(a => ok(a.ok, `${run}/${S.round}/${a.id}/${a.type}: ${a.err}`));
    };
    for (let m = 1; m <= months; m++) {
      C.host(S, "next", 0);
      eq(S.round, m, "host advances one month");
      if (run === "solo") {
        // Real solo order: five computers, replies, surrogate student's requests, replies.
        computers("pyeongtaek", false); computers("pyeongtaek", true);
        const id = "pyeongtaek", a = K.leagueAI.plan(S, R, id, B, "balanced");
        apply(id, "plan", {rev: S.teams[id].rev + 1, plan: a.plan});
        if (a.econPol) apply(id, "econ", a.econPol);
        for (const t of a.ties || []) {
          const answer = C.reduce(S, {team: id, token: S.teams[id].token, type: "tie", op: t.type, other: t.other, cap: t.cap, kind: t.kind}, 0, B);
          requests.push({run, month: m, id, type: "tie", ok: answer.ok, err: answer.err});
        }
        computers("pyeongtaek", true); apply(id, "ready", {ready: true});
      } else {
        computers(null, false); computers(null, true);
      }
      const res = C.run(S, B, 0);
      ok(!!res?.team, `${run}/${m} actual result`);
      rows.push(...capture(ctx, S, res, run, Object.fromEntries(ids.map(id => [id, "AI balanced"]))));
      progress({kind: "month", job: "scenarios", run, month: m, total: months});
    }
  }
  eq(rows.length, 108, "solo all six cities x12 plus multi six x6");
  return {rows: compareRows(rows), names, requests,
    rejectedTies: requests.filter(r => r.type === "tie" && !r.ok)};
}
function general(budgetSeconds) {
  const ctx = context(), rows = [], start = Date.now();
  let reduced = false, estimateSeconds = null;
  ctx.__d80month = (S, res, run, horizon) => {
    rows.push(...capture(ctx, S, res, `rotation-${run.rotation}`, run.assignment));
    if (run.rotation === 0 && res.round === 12) {
      estimateSeconds = (Date.now() - start) / 1000 * 27; // 9 rotations x36 / first12; includes setup, conservative.
      if (estimateSeconds > budgetSeconds) reduced = true;
    }
    progress({kind: "month", job: "general", rotation: run.rotation, month: res.round,
      horizon: reduced ? 12 : horizon, estimateSeconds, reduced});
    return reduced ? 12 : horizon;
  };
  vm.runInContext(pythonString("tests/league/calib.py", "AUTO"), ctx);
  const original = pythonString("tests/league/bots36.py", "JS");
  const js = once(original, 'const res = C.run(S, BG, at + 50), rep = res?.econ;',
    'const res = C.run(S, BG, at + 50), rep = res?.econ;\n      months = __d80month(S, res, run, months);');
  const raw = vm.runInContext(js, ctx)({months: 36, rotations: 9});
  const months = reduced ? 12 : 36;
  eq(raw.runs.length, 9, "nine original rotations");
  ok(raw.runs.every(r => r.hist.length === months && r.rows.length === 6), "complete original trajectories");
  eq(rows.length, 9 * 6 * months, "complete observed city-month matrix");
  for (const id of raw.ids) eq(new Set(rows.filter(r => r.id === id).map(r => r.strategy)).size, 9, "all nine strategies per city");
  return {rows: compareRows(rows), names: raw.names, months, reduced, estimateSeconds,
    seed: "bots-strategy-common", sourceChecks: {
      pass: raw.checks.filter(c => c[0]).length, failures: raw.checks.filter(c => !c[0]).map(c => c[1])
    }, raw};
}
function selfTest() {
  const startedChecks = checks;
  // Hand-calculated fixtures catch wrong quantile interpolation, denominators,
  // first-month fabrication, zero division and exclusive tolerance boundaries.
  eq(distribution([0, 10, 20, 30, 40]), {
    n: 5, min: 0, q25: 10, median: 20, q75: 30, p90: 36, p95: 38, max: 40
  }, "linear quantiles at (n-1)*p");
  eq(distribution([]), {n: 0}, "empty distribution is not zero");
  const rows = compareRows([
    {run: "a", id: "p", month: 1, mwh: 0, unsPct: 0},
    {run: "a", id: "p", month: 2, mwh: 0, unsPct: 0},
    {run: "a", id: "p", month: 3, mwh: 1, unsPct: 0},
    {run: "b", id: "p", month: 1, mwh: 100, unsPct: 1},
    {run: "b", id: "p", month: 2, mwh: 105, unsPct: 1.5},
    {run: "b", id: "p", month: 3, mwh: 111, unsPct: 2.0001}
  ]);
  eq(rows.map(r => r.delta), [null, 0, 1, null, 5, 6], "previous same run/city month");
  eq(rows.map(r => r.ratio), [null, null, null, null, .05, 6 / 105], "zero base ratios undefined");
  eq(sameRate(rows, 1, .05), {n: 4, same: 3, pct: 75}, "first months excluded; inclusive max boundary");
  eq(sameRate(rows, .5, .02), {n: 4, same: 1, pct: 25}, "small absolute and relative threshold");
  eq(sameRate([], 1, .05), {n: 0, same: 0, pct: null}, "no observation is not 0%");
  const gap = compareRows([{run: "a", id: "p", month: 1, mwh: 5, unsPct: 0},
    {run: "a", id: "p", month: 3, mwh: 7, unsPct: 0}]);
  eq(gap[1].delta, null, "never bridge missing months");
  eq(outageRate(rows), {n: 2, same: 1, pct: 50}, "inclusive outage .5 pp boundary");
  eq(outageRate(rows.filter(r => r.unsPct < ZERO)), {n: 0, same: 0, pct: null}, "zero-outage rows excluded from outage comparison");
  const ctx = context(), K = ctx.KCP, C = K.leagueCore, R = C.regionOf("south");
  const S = C.newState("d80-self", R.id, 0, R.teams.map(t => t.id), {turns: 12, seedMode: "fixed"});
  const r = {uns: 1, imp: 2, sub: 3, isolated: {uns: 7}, unsPct: 1};
  const first = {round: 1, days: 7, team: {pyeongtaek: r}};
  const next = {round: 2, days: 7, team: {pyeongtaek: r}};
  S.results = [first, next];
  const before = JSON.stringify(S), g = K.__gridtol.gridReliance(S, next, "pyeongtaek");
  near(g.mwh, 28, "February 7 representative MWh becomes 28 monthly MWh");
  near(g.base.mwh, 31, "January baseline 31 rather than February's28");
  near(g.delta, -3, "month lengths change delta");
  eq(JSON.stringify(S), before, "production helper does not mutate state");
  eq(JSON.stringify(K.__gridtol.gridReliance(S, next, "pyeongtaek")), JSON.stringify(g), "repeatable helper");
  eq(K.__gridtol.gridFillMWh({uns: 1, imp: 2, sub: 0, isolated: {uns: 1}}), 0, "negative inferred fill clamped");
  eq(K.__gridtol.gridFillMWh({uns: 1, imp: 2, sub: 0}), null, "missing fields not silently zero");
  eq(K.__gridtol.gridReliance(S, first, "pyeongtaek").delta, null, "first actual result without trial");
  near(sameRate([{base: 100, delta: 5}], 1, .05).pct, 100, "relative boundary equality");
  near(sameRate([{base: 100, delta: 5.00001}], 1, .05).pct, 0, "above relative boundary");
  const filtered = aggregate({rows: []}, {rows: compareRows([
    {run: "filter", id: "p", strategy: "base", month: 1, mwh: 10, unsPct: .004999},
    {run: "filter", id: "p", strategy: "base", month: 2, mwh: 20, unsPct: .005},
    {run: "filter", id: "p", strategy: "base", month: 3, mwh: 25, unsPct: 0}
  ]), raw: {strategies: ["base"]}});
  eq(filtered.summaries.zero.rows, 2, "strict zero-outage boundary");
  eq(filtered.summaries.zero.delta.median, 5, "filter retains immediate prior outage month as baseline");
  eq(filtered.summaries.bothZero.rows, 0, "both-zero sensitivity excludes prior outage");
  const constant = {n: 11, same: 11, pct: 100};
  const candidates = [];
  for (const absolute of [.5, 1, 2, 5]) for (const share of [.02, .05, .1])
    candidates.push({absolute, share, solo: constant, multi: constant, reproduction: constant,
      zero: constant, positiveBase: {n: 0, same: 0, pct: null}});
  ok(recommend({candidates}).includes("max(1 MWh, 기준의 5%)"), "degenerate data still gives a provisional recommendation");
  ok(recommend({candidates}).includes("10~60%를 충족하지 못한다"), "degenerate sample is not presented as successful calibration");
  console.log(`self-test: ${checks - startedChecks} assertions, 0 failures`);
}
function hashes() {
  const files = execFileSync("rg", ["--files", "ui"], {cwd: ROOT, encoding: "utf8"}).trim().split("\n");
  files.push("tests/league/bots36.py", "tests/league/calib.py", "tests/league/review/d80-gridtol.js");
  return Object.fromEntries(files.sort().map(f => [f, sha(read(f))]));
}
const loadLog = [];
function sample(label) {
  const raw = execFileSync("uptime", [], {encoding: "utf8"}).trim();
  const match = raw.match(/load averages?:\s*([0-9.]+)/);
  ok(!!match, "parse one-minute load");
  const oneMinute = Number(match[1]);
  loadLog.push({at: new Date().toISOString(), label, oneMinute}); return oneMinute;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function runJob(job, dir, budgetSeconds) {
  while (sample(`before ${job}`) > 150) { console.log(`WAIT ${job}: load >150`); await delay(15000); }
  const file = path.join(dir, `${job}.json`);
  console.log(`START ${job}`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename, "--worker", job, file, String(budgetSeconds)],
      {stdio: ["ignore", "inherit", "inherit", "ipc"], env: {...process.env, D80_SERIAL_WORKER: "1"}});
    let paused = false;
    const stop = () => {child.kill("SIGCONT"); child.kill("SIGTERM");};
    const timer = setInterval(() => {
      try {
        const load = sample(`during ${job}`);
        if (load > 150 && !paused) { child.kill("SIGSTOP"); paused = true; console.log(`PAUSE load=${load}`); }
        if (load <= 150 && paused) { child.kill("SIGCONT"); paused = false; console.log(`RESUME load=${load}`); }
      } catch (e) {stop(); reject(e);}
    }, 10000);
    child.on("message", m => {
      if (m.month === 1 || m.month % 6 === 0) console.log(JSON.stringify(m));
    });
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    const clean = () => {clearInterval(timer); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);};
    child.on("error", e => {clean(); reject(e);});
    child.on("exit", code => {clean(); code === 0 ? resolve() : reject(Error(`${job} exit ${code}`));});
  });
  sample(`after ${job}`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`DONE ${job}: ${data.seconds.toFixed(1)}s`);
  return data;
}
function aggregate(scenarios, general) {
  const solo = scenarios.rows.filter(r => r.run === "solo" && r.id === "pyeongtaek");
  const multi = scenarios.rows.filter(r => r.run === "multi"), reproduction = [...solo, ...multi];
  const zero = general.rows.filter(r => r.unsPct < ZERO);
  const bothZero = zero.filter(r => r.baseUnsPct != null && r.baseUnsPct < ZERO);
  const positiveBase = zero.filter(r => r.base > 0);
  const candidates = [];
  for (const absolute of [.5, 1, 2, 5]) for (const share of [.02, .05, .1]) {
    const entry = {absolute, share};
    for (const [name, rows] of Object.entries({solo, multi, reproduction, zero, bothZero, positiveBase}))
      entry[name] = sameRate(rows, absolute, share);
    candidates.push(entry);
  }
  return {summaries: Object.fromEntries(Object.entries({solo, multi, reproduction, zero, bothZero, positiveBase})
    .map(([k, rows]) => [k, summary(rows)])), candidates,
    outage: {reproduction: outageRate(reproduction), general: outageRate(general.rows),
      generalEitherEnd: outageRate(general.rows, r => r.unsPct >= ZERO || r.baseUnsPct >= ZERO),
      reproductionAll: outageRate(reproduction, () => true), generalZero: outageRate(zero, () => true)},
    outageLevels: distribution(general.rows.filter(r => r.unsPct >= ZERO).map(r => r.unsPct)),
    sourceStrategy: general.raw.strategies.map(strategy => {
      const rows = general.rows.filter(r => r.strategy === strategy), eligible = rows.filter(r => r.unsPct < ZERO);
      return {strategy, all: rows.length, zeroOutage: eligible.length, zeroMwh: eligible.filter(r => r.mwh === 0).length};
    })};
}
const fmt = (n, digits = 3) => n == null ? "—" : n.toFixed(digits);
const rate = r => r.n ? `${fmt(r.pct, 2)}% (${r.same}/${r.n})` : "해당 표본 없음 (0건)";
function report(out) {
  const a = out.analysis, g = out.general, s = out.scenarios;
  const lines = ["# D-80 A-3 계통 MWh ‘같을 것’ 문턱 측정", "",
    `측정 시작 ${out.startedAt}, 종료 ${out.finishedAt}. Node ${process.version}. 브라우저·외부 네트워크·UI 수정·git 커밋 없음.`, "",
    out.recommendation || recommend(a), "",
    "이번 AI 대체 표본의 한계와 최종 결정 권한을 아래 수치와 함께 읽어야 한다.", "",
    "## 조건과 집계", "",
    "- 현재 엔진을 Node VM에서 실행했다. 화면 등록·저장은 메모리 어댑터이며 실제 gridReliance·resultPeriod·gridFillMWh 본문은 변경하지 않았다.",
    "- 4차 **조건 재현**: south 6도시, 혼자 평택 12달(평택도 AI balanced로 대체, 나머지 5도시도 balanced), 멀티 6도시 6달(전원 balanced). 12달 게임의 앞 6달이다. 녹화의 수동 건설 입력을 복제한 것은 아니다.",
    "- 혼자는 실제 solo 순서(다섯 컴퓨터 계획·응답 → 평택 AI 대체 요청 → 컴퓨터 응답), 멀티는 computerPlans의 6도시 순차 계획·응답을 썼다. 계획·정책·연계선은 실제 reduce로 제출했다.",
    "- 재현 씨앗은 seedMode=fixed, salt=0, seedKey='0'; 날씨 seed=7000+13×월. 고정 씨앗은 달마다 같은 날씨라는 뜻이 아니라 재실행 시 같은 월에 같은 날씨·사건이 나온다는 뜻이다.",
    `- 일반 분포는 bots36.py 원본 JS의 ${g.months}달×9회전×6도시(${g.rows.length} 도시·달), 9전략을 모두 썼다. 기본 newGame('bots-strategy-common')을 그대로 유지(명시 seedMode 없음: 날씨 salt=0, 사건·경제 seed=bots-strategy-common).`,
    "- 일반 JS에는 월 결과를 읽는 관측 훅과 60분 예산 확인만 넣었다. 전략, 사건, 상한, 운영 및 기존 JS 단언은 유지했다. Python 후처리·브라우저 엔트리는 실행하지 않았다.",
    "- mwh=max(0, isolated.uns−uns−imp+sub)×(그 달 일수/대표기간 일수). 지난달 기준에는 지난달의 환산 배수를 별도로 쓴다. 월 길이 효과를 제거하지 않았다.",
    "- Δ는 동일 회전·도시의 바로 지난달 실제 대비다. 첫 달에는 시험 기록을 만들지 않아 기준·Δ 없음으로 제외한다. 현재 달 정전0(unsPct<0.005)로 **필터하기 전에** 지난달을 연결하여 중간 비정전 달을 건너뛰지 않는다.",
    "- 데이터1(재현)의 주 집계는 평택 혼자12 + 멀티36=48 도시·달이다. 혼자의 다른 5도시는 상호작용에 포함하고 전체 월별 표에도 보이지만 주 집계에 중복 가중하지 않는다.",
    "- 데이터2는 일반 분포의 현재 달 정전0 표본. 두 달 모두 정전0, 기준 MWh>0인 민감도 집계도 별도 표시한다.",
    "- |Δ|/base는 base>0일 때만 계산한다. 0→0도 0으로 꾸미지 않고 정의 불가로 센다. 단, ‘같음’ 판정은 0 기준에도 절대 문턱으로 계산한다. 분포 분위수는 정렬 후 (n−1)p 선형 보간이다.",
    `- 일반 36달 추정 ${fmt(g.estimateSeconds, 1)}초. ${g.reduced ? "60분 남은 예산을 넘을 것으로 예측하여 첫 회전 12달에서 전체 9회전을 12달로 줄였다." : "60분 예산 내로 판단해 36달을 유지했다."}`,
    "", "## 주 표본 수와 0 비율", "",
    "| 집계 | 도시·달 | 비교 가능 | 첫 달/기준 없음 | mwh=0 | base=0 (0→0 / 0→양수) |",
    "|---|---:|---:|---:|---:|---:|"];
  for (const [key, title] of [["solo","혼자 평택"],["multi","멀티6팀"],["reproduction","재현 합계"],["zero","일반 현재 정전0"],["bothZero","일반 양월 정전0"],["positiveBase","일반 정전0·base>0"]]) {
    const d = a.summaries[key];
    lines.push(`| ${title} | ${d.rows} | ${d.pairs} | ${d.firstOrMissing} | ${d.zeroMwh} (${fmt(d.rows ? d.zeroMwh / d.rows * 100 : null, 2)}%) | ${d.zeroBase} (${d.zeroToZero} / ${d.zeroToPositive}) |`);
  }
  lines.push("", "## 일반 정전0 분포", "",
    "| 값 | n | 최소 | 25% | 중앙 | 75% | 90% | 95% | 최대 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const [key, title] of [["mwh","mwh (MWh)"],["delta","Δ (MWh, 부호 있음)"],["absDelta","절대 Δ (MWh)"],["ratioPct","절대 Δ/base (%)"]]) {
    const d = a.summaries.zero[key];
    lines.push(`| ${title} | ${d.n} | ${["min","q25","median","q75","p90","p95","max"].map(k => fmt(d[k])).join(" | ")} |`);
  }
  lines.push("", "## 문턱 후보: |Δ| ≤ max(절대, 비율×|base|)", "",
    "10~60%를 적정 구간으로 본다는 것은 교육용 G 판단 기준이다. 포함 경계(≤)와 반올림 전 수치로 판정한다.", "",
    "| 절대 MWh | 비율 | 혼자 평택 | 멀티6팀 | 데이터1 합계 | 데이터2 정전0 | 양월 정전0 | 정전0·base>0 |",
    "|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const c of a.candidates) lines.push(`| ${c.absolute} | ${c.share * 100}% | ${["solo","multi","reproduction","zero","bothZero","positiveBase"].map(k => rate(c[k])).join(" | ")} |`);
  lines.push("", "## 정전 ±0.5%p 비교", "",
    "| 집계 조건 | 정전 ‘같음’ |", "|---|---:|",
    `| 데이터1 현재 달 정전 있음 | ${rate(a.outage.reproduction)} |`,
    `| 일반 전체에서 현재 달 정전 있음 | ${rate(a.outage.general)} |`,
    `| 일반 전체에서 어느 한쪽 달이라도 정전 있음 | ${rate(a.outage.generalEitherEnd)} |`,
    `| 참고: 데이터1 전체 | ${rate(a.outage.reproductionAll)} |`,
    `| 참고: 일반 현재 달 정전0 | ${rate(a.outage.generalZero)} |`,
    "", "정전 있음은 unsPct≥0.005이며 첫 달은 제외한다. 일반 정전0 필터의 여집합을 원자료에서 따로 집계했다. 빈 집계는 0%가 아니다. 다음 전략 구성을 함께 보고 무건설 대조군의 영향을 구분해야 한다.", "",
    "| 전략 | 전체 도시·달 | 현재 정전0 | 그중 mwh=0 |", "|---|---:|---:|---:|");
  for (const r of a.sourceStrategy) lines.push(`| ${r.strategy} | ${r.all} | ${r.zeroOutage} | ${r.zeroMwh} |`);
  lines.push("", `정전 있는 ${a.outageLevels.n}개 도시·달의 정전율 범위는 ${fmt(a.outageLevels.min)}~${fmt(a.outageLevels.max)}%다. 이 비교 역시 변화가 없는 표본이면 문턱의 적정성을 입증하지 못한다.`);
  lines.push("", "## 4차 조건 월별 전체 표", "",
    "혼자의 주 분석 대상은 평택이다. 6도시 전부 아래에 제시한다. 첫 달의 —는 미측정 기준이며 0이 아니다.",
    "비율 열의 —(기준0)는 정의 불가다. 아래 표시만 반올림하며 집계는 원값으로 계산한다.");
  for (const run of ["solo", "multi"]) {
    lines.push("", `### ${run === "solo" ? "혼자 하기12달" : "멀티6팀6달"}`, "",
      "| 달 | 도시 | mwh MWh | 지난달 base MWh | Δ MWh | 절대 Δ/base % | unsPct % |",
      "|---:|---|---:|---:|---:|---:|---:|");
    for (const r of s.rows.filter(r => r.run === run)) lines.push(`| ${r.month} | ${s.names[r.id]} | ${fmt(r.mwh)} | ${fmt(r.base)} | ${fmt(r.delta)} | ${r.base === 0 ? "—(기준0)" : fmt(r.ratio == null ? null : r.ratio * 100)} | ${fmt(r.unsPct, 5)} |`);
  }
  lines.push("", "## C-5와 제안", "",
    "C-5 소거 비율은 생략했다. 측정 소스의 S7은 정전율·isolatedUnsPct 단계와 gridImport 잔차를 쓰며 계통 MWh 단계별 몫을 계산하지 않는다. 결과 Δ를 단계 몫 대신 사용하면 서로 상쇄되는 원인을 놓치므로 tol/10의 소거율로 보고하지 않았다.",
    "", "제안 값과 근거는 문서 첫머리에 제시했다. 모든 Δ가 0인 집합은 문턱을 0으로 낮춰도 포함 경계(≤) 때문에 ‘같음’ 100%다. 0→0을 억지로 ‘다름’으로 만드는 방식으로 G 비율을 맞추지는 않는다.", "",
    "## 검증·소요·산출물", "",
    `- wall time ${fmt(out.seconds, 1)}초; 재현 워커 ${fmt(out.jobs.scenarios, 1)}초, 일반 워커 ${fmt(out.jobs.general, 1)}초.`,
    `- 무거운 워커 최대 동시1개. 시작 전·실행 중10초마다1분 부하 측정, 150 초과 시 SIGSTOP/대기 후 ≤150에서 재개. 관측 최대 ${fmt(out.maxLoad, 2)} (${out.loadLog.length}회 표본); 순간 최고치라는 뜻은 아니다.`,
    `- 원본 bots36 JS 단언: 통과 ${g.sourceChecks.pass}, 실패 ${g.sourceChecks.failures.length}. Python 후처리 단언은 미실행.`,
    `- AI 재현의 거절된 연계선 요청 ${s.rejectedTies.length}건(원 JSON에 요청 기록). 계획·정책·준비 요청 실패는 단언으로 중단한다.`,
    `- 측정 실행 중 UI 및 입력 소스 SHA-256 전후 일치: ${out.sourcesUnchanged}. 각 도시·달의 산식·지난달 환산을 실제 gridReliance와 대조했다.`,
    ...(out.validationNotes || []).map(note => `- ${note}`),
    `- 전체 원자료·소스 해시·부하 로그: \`${out.directory}\` (scenarios.json, general.json, measurement.json).`,
    `- 요청한 기본 보관 경로: \`${DEFAULT_OUT}\`. ${out.directory.startsWith(DEFAULT_OUT + path.sep) ? "지정 경로에 보관했다." : "현재 sandbox의 쓰기 허용 범위 밖이므로 허용된 임시 경로에 보관했다. 지정 위치로의 이동은 미완료다."}`,
    "- 재실행: `node tests/league/review/d80-gridtol.js --self-test`; 측정은 `node tests/league/review/d80-gridtol.js --out-dir <저장소 밖 쓰기 가능한 절대 경로>`.",
    "- 미검증: 첫 달 시험 대비 문턱, 실제 학생의 수동 전략·다른 씨앗, S7 단계별 소거, 브라우저·운영 화면. 이번 요청의 브라우저·외부 네트워크 금지를 지켰다.",
    "", "### 원본 JS 실패 목록", "", ...(g.sourceChecks.failures.length ? g.sourceChecks.failures.map(x => `- ${x}`) : ["없음."]), "");
  return lines.join("\n");
}
function recommend(a) {
  const viable = a.candidates.filter(c => ["solo", "multi", "reproduction", "zero"].every(k => c[k].pct >= 10 && c[k].pct <= 60));
  // Keep the existing provisional pair if it satisfies the requested G criterion.
  const preferred = viable.find(c => c.absolute === 1 && c.share === .05) ||
    viable.sort((x,y) => Math.abs(x.reproduction.pct - 35) + Math.abs(x.zero.pct - 35) -
      Math.abs(y.reproduction.pct - 35) - Math.abs(y.zero.pct - 35) || x.absolute - y.absolute)[0];
  if (!preferred) {
    const provisional = a.candidates.find(c => c.absolute === 1 && c.share === .05);
    return `**G 제안: max(1 MWh, 기준의 5%)를 잠정 유지.** 이 값의 ‘같음’은 혼자 ${rate(provisional.solo)}, 멀티 ${rate(provisional.multi)}, 재현 합계 ${rate(provisional.reproduction)}, 일반 정전0 ${rate(provisional.zero)}다. 검사한 12개 후보 중 모든 집계에서 적정 기준을 만족하는 값은 없었고, 제안 값도 10~60%를 충족하지 못한다. 이는 최적값을 확인한 추천이 아니다. AI 대체·기본 씨앗 표본에서 후보 차이를 식별하지 못했으므로 임의로 상수를 바꾸지 않는 잠정 제안이다. 계통 의존량이 실제로 변하는 학생 조작 표본으로 재측정하기 전에는 ‘같음’ 빈도의 적정성을 주장할 수 없다. **확정 결정은 총괄 몫**이다.`;
  }
  return `**G 제안: max(${preferred.absolute} MWh, 기준의 ${preferred.share * 100}%).** 혼자 ${rate(preferred.solo)}, 멀티 ${rate(preferred.multi)}, 재현 합계 ${rate(preferred.reproduction)}, 일반 정전0 ${rate(preferred.zero)}로 모두10~60% 안이다. 일반 base>0에서는 ${rate(preferred.positiveBase)}다. 기존 임시값이 구간을 만족하면 유지하고, 아니면 재현·일반이35%에 가까운 후보를 택했다. 절대 문턱 차이가 관측에서 식별되는지는 후보 표를 함께 봐야 한다. 단일 씨앗의 AI 대체 표본에 대한 추천이며 **확정 결정은 총괄 몫**이다. C-5의 tol/10은 단계별 측정 후 별도 확정해야 한다.`;
}
async function main() {
  const started = Date.now(), startedAt = new Date().toISOString();
  const args = process.argv.slice(2);
  ok(args.length === 0 || args.length === 2 && args[0] === "--out-dir", "usage: --self-test | --out-dir absolute-directory");
  const base = args[1] || DEFAULT_OUT;
  ok(path.isAbsolute(base), "absolute output directory required");
  fs.mkdirSync(base, {recursive: true});
  const real = fs.realpathSync(base);
  ok(real !== ROOT && !real.startsWith(ROOT + path.sep), "large JSON must stay outside repository");
  const directory = fs.mkdtempSync(path.join(real, "gridtol-"));
  const before = hashes();
  sample("start"); selfTest();
  const scenariosJob = await runJob("scenarios", directory, 3600);
  const generalJob = await runJob("general", directory, Math.max(0, 3600 - (Date.now() - started) / 1000));
  const after = hashes();
  eq(after, before, "all UI and measurement input source hashes unchanged");
  sample("end");
  const out = {startedAt, finishedAt: new Date().toISOString(), seconds: (Date.now() - started) / 1000,
    directory, jobs: {scenarios: scenariosJob.seconds, general: generalJob.seconds},
    scenarios: scenariosJob.result, general: {...generalJob.result, raw: undefined},
    analysis: aggregate(scenariosJob.result, generalJob.result), loadLog,
    maxLoad: Math.max(...loadLog.map(r => r.oneMinute)), sourcesUnchanged: true, sources: before,
    node: process.version, gitHead: execFileSync("git", ["rev-parse", "HEAD"], {cwd: ROOT, encoding: "utf8"}).trim()};
  out.recommendation = recommend(out.analysis);
  fs.writeFileSync(path.join(directory, "measurement.json"), JSON.stringify(out) + "\n");
  fs.writeFileSync(path.join(__dirname, "D80-gridtol-report.md"), report(out));
  console.log(JSON.stringify({directory, seconds: out.seconds, maxLoad: out.maxLoad, recommendation: out.recommendation}));
}
if (require.main === module) {
  if (process.argv[2] === "--self-test") selfTest();
  else if (process.argv[2] === "--worker") {
    eq(process.env.D80_SERIAL_WORKER, "1", "worker must be launched by serial scheduler");
    const started = Date.now(), kind = process.argv[3];
    ok(["scenarios","general"].includes(kind), "known worker");
    const result = kind === "scenarios" ? scenarios() : general(Number(process.argv[5]));
    fs.writeFileSync(process.argv[4], JSON.stringify({seconds: (Date.now() - started) / 1000, checks, result}) + "\n");
  } else main().catch(e => {console.error(e); process.exitCode = 1;});
}
module.exports = {distribution, compareRows, sameRate, outageRate, summary, aggregate, recommend, report};
