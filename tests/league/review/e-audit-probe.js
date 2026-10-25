'use strict';
// 186e182 설명 재대조용 읽기 전용 조사. 브라우저·네트워크·파일 출력 없음.
// 실행: node tests/league/review/e-audit-probe.js [--detail] [--ref <sha>]
// 기본은 현재 작업 파일을 읽는다(회귀 검사용). --ref를 주면 그 판본을 git show로 읽는다(감사 재현용, 186e182판은 --ref 186e182).
// 회귀 검사 통과와 343행의 수동 의미 대조를 구별한다. VM에서 참조만 노출한다.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const refAt = process.argv.indexOf('--ref'), ref = refAt >= 0 ? process.argv[refAt + 1] : null;
if (refAt >= 0 && !ref) throw new Error('--ref 뒤에 판본을 주세요');
const read = n => ref ? execFileSync('git', ['show', `${ref}:ui/${n}.js`], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, 'ui', n + '.js'), 'utf8');
const names = ['build-maps', 'tech-data', 'build', 'econ-data', 'econ', 'league-data', 'league-core', 'league'];
const sources = Object.fromEntries(names.map(n => [n, read(n)]));
const ctx = vm.createContext({ console, structuredClone, URL, performance,
  document: { documentElement: {}, addEventListener() {} }, addEventListener() {},
  KCP: { route() {}, on() {}, esc: String, leagueNet: {} } });
ctx.window = ctx;
const expose = {
  build: `KCP.auditB = { dispOf, weather, renOut0, tips, POLICIES, MISSIONS, RS, TECHS,
    placementAdvice, thermalToolInfo, setState: x => S = x,
    help: () => { openHelp(); return S.help.body.innerHTML; },
    cards: () => { renderDrawer(); return S.root.querySelector('#bd-drawer-body').innerHTML; } };`,
  econ: 'KCP.auditE = { groupTargets, causeOf, pmContext };',
  'league-core': 'KCP.auditC = { econView, modsFor, bonusOf, tieMods, eurekaMet };',
  league: `KCP.auditU = { speedsHTML, buildLeadHTML, techEffectText, techEurekaText,
    eventSourceHTML, evSize, migrationReason, gridReliance, airNoteHTML,
    setState: x => L = x };`
};
for (const n of names) {
  let src = sources[n];
  if (expose[n]) {
    assert.match(src, /\}\)\(\);\s*$/);
    src = src.replace(/\}\)\(\);\s*$/, expose[n] + '\n})();');
  }
  vm.runInContext(src, ctx, { filename: 'ui/' + n + '.js' });
}
const K = ctx.KCP, B = K.buildGame, D = K.ECON_DATA, T = K.TECH_DATA;
const C = K.leagueCore, U = K.auditU, E = K.auditE, A = K.auditB;
const plain = v => JSON.parse(JSON.stringify(v));
let checks = 0;
const eq = (a, b) => { assert.deepEqual(plain(a), plain(b)); checks++; };
const near = (a, b) => { assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`); checks++; };
const has = (s, rx) => { assert.match(s, rx); checks++; };
const loc = (file, needle) => {
  const i = sources[file].split('\n').findIndex(l => l.includes(needle));
  assert.ok(i >= 0, file + ': ' + needle);
  return `ui/${file}.js:${i + 1}`;
};
const ids = Object.keys(D.start), region = C.regionOf('south');
const state = C.newState('AUDIT', 'south', 0, ids, { turns: 12 });
U.setState({ room: 'AUDIT', team: 'pyeongtaek', snap: state });
const fake = (league, mods = {}) => {
  const nodes = new Map();
  const s = { drawerTab: 'policy', doc: { journal: [] }, st: { builds: [], lines: [], policies: [], missions: [], season: 'summer' },
    opts: { league, leagueRound: () => ({ month: 1 }), leagueMods: () => mods },
    help: { body: {}, setTitle() {}, open() {} },
    root: { querySelectorAll: () => [], querySelector: sel => { if (!nodes.has(sel)) nodes.set(sel, { querySelectorAll: () => [], querySelector: () => null }); return nodes.get(sel); } } };
  A.setState(s); return s;
};
const workingHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const uiDirty = !ref && execFileSync('git', ['status', '--porcelain', '--', 'ui/'], { cwd: root, encoding: 'utf8' }).trim() !== '';
const report = { head: ref || workingHead, workingHead, uiDirty,
  hashes: Object.fromEntries(names.map(n => [n, crypto.createHash('sha256').update(sources[n]).digest('hex')])),
  packs: {}, cards: [], events: [], groups: {}, thermal: {}, observations: {} };
for (const id of ['island', ...ids]) for (const league of id === 'island' ? [false] : [false, true]) {
  B.selectPack(id, league ? 'league' : undefined); fake(league);
  const help = A.help(), imp = A.dispOf('import'), diesel = A.dispOf('diesel');
  const tax = A.POLICIES.find(p => p.id === 'tax').eff();
  near(Number(tax.match(/×([\d.]+)/)[1]), +((diesel.fuel + diesel.co2 * B.M.taxPerT) / diesel.fuel).toFixed(4));
  eq(A.POLICIES.find(p => p.id === 'dr').cost, '0.05억/일');
  if (league) {
    fake(true, { drCost: T.params.drCost.v, drEffect: T.params.drEffect.v });
    eq(A.POLICIES.find(p => p.id === 'dr').cost, '0.025억/일');
    has(help, /도시 급전원.*이웃 거래.*자동 계통 수입/);
    has(help, /연결점 직접 수입 없음/);
  } else if (id !== 'island') {
    has(help, /수입 총 .*연결점마다/);
    has(help, /연료 가격·탄소세에 따라 싼 급전원/);
  }
  const fab = B.SITES.filter(s => s.dem?.fab2 != null).map(s => [s.dem.base, s.dem.fab2]);
  if (id !== 'island') {
    has(help, /사흘째부터.*정격 상한/);
    has(help, /CO₂ 총량에는 0, 바이오 배출 0.1/);
    has(help, /0.4173 t\/MWh/);
    const cards = A.cards();
    has(cards, fab.length ? /공장 5 → 10 MW/ : /공장 증설 수요 정의 없음/);
    // 3일째 유량 경계와 강수/월평균 유량 정규화를 실제 날씨에서 확인.
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const wx = A.weather(seed, 'summer'); let sunny = 0;
      for (const day of wx) {
        sunny = day.w === 0 ? sunny + 1 : 0;
        if (sunny === 3) { near(day.flow, .7); found = true; }
        if (day.w === 2) near(day.flow, 1.3);
      }
    }
    eq(found, true);
  }
  report.packs[id + (league ? ':league' : ':free')] = { tax, dr: A.POLICIES.find(p => p.id === 'dr').cost,
    importEach: imp.cap, importTotal: imp.cap * B.SITES.filter(s => s.kind === 'gridpt').length,
    plants: B.SITES.filter(s => s.kind === 'plant').map(s => ({ fuel: s.fuel || 'lng', cap: s.cap })), fab,
    help, specs: Object.fromEntries(Object.entries(B.BLD).map(([k, v]) => [k, v.spec])) };
}
B.selectPack('pyeongtaek', 'league'); fake(true);
report.speeds = K.auditC.econView(state).speeds;
report.speedsHTML = U.speedsHTML(K.auditC.econView(state));
report.leadHTML = U.buildLeadHTML();
report.airHTML = U.airNoteHTML();
for (const card of T.cards) {
  report.cards.push({ id: card.id, raw: card.eff, screen: U.techEffectText(card, { econ: true }),
    why: card.why, need: card.need, demo: card.demo, eureka: U.techEurekaText(card.id, { econ: true }), scale: card.scale });
  eq(card.need, card.numbers.need.v); eq(card.demo, card.numbers.demo.v);
}
// 16개 사건: 관측 why와 게임 effect를 분리하고 실제 대응 배수를 검산.
for (const event of region.events) {
  const s = structuredClone(state); s.round = 1;
  s.events = [{ id: event.id, round: 1, x: 1 }];
  s.ties = [{ a: 'dangjin', b: 'asan', st: 'built', cap: 4, kind: 'line' }];
  const id = ids.find(id => C.hits(region, event, id, s));
  if (!id) throw Error('사건 대상 없음: ' + event.id);
  const source = U.eventSourceHTML(event); has(source, /사건 크기·대응 효과는 게임 가정/);
  eq(source.includes(event.why), true);
  const variants = [];
  for (const opt of [null, ...(event.opts || [])]) {
    s.teams[id].resp = opt ? { ['1:' + event.id]: opt.id } : {};
    const mods = K.auditC.modsFor(s, region, id);
    for (const key of C.MUL.filter(k => event.effect[k] != null)) {
      const dev = opt?.knobs && !opt.knobs.includes(key) ? 1 : (opt?.dev ?? 1);
      near(mods[key], 1 + (event.effect[key] - 1) * dev);
    }
    const bonus = K.auditC.bonusOf(s, region, id, 1);
    near(bonus, (event.effect.budgetAdd || 0) * (opt?.grant ?? 1) + C.grantAmount(s, region, id, 1));
    variants.push({ option: opt?.id || 'none', mods, bonus, down: K.auditC.tieMods(s, region).down });
  }
  report.events.push({ id: event.id, text: event.text, why: event.why, tip: event.tip,
    opts: event.opts, effect: event.effect, asOf: event.asOf, published: event.published, variants });
}
report.international = D.intl.events;
const city = state.econ.cities.pyeongtaek;
const input = K.econ.cleanInput({ energy: { demMWh: 100, servedMWh: 100, unsPct: 0, hospH: 0 }, policy: {} }, city, D.start.pyeongtaek, D);
const groups = E.groupTargets(city, input, 1, D, { pm25: { pyeongtaek: { delta: .01 } }, taxResAvg: 0, taxIndAvg: 0 });
for (const [key, weights] of Object.entries(D.params.groupW.v)) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const [part, w] of Object.entries(weights)) if (part !== 'rel') near(groups.contrib[key][part], groups.parts[part] * w / sum);
  near(groups.tg[key], Math.min(100, Math.max(0, Object.values(groups.contrib[key]).reduce((a, b) => a + b, 0))));
  report.groups[key] = { weights, target: groups.tg[key] };
}
for (const [which, key] of [['L', 'wL'], ['A', 'wA']]) for (const part of Object.keys(D.params[key].v)) {
  const zero = Object.fromEntries(Object.keys(D.params[key].v).map(k => [k, 0]));
  eq(E.causeOf({ ['lag' + which]: zero, ['base' + which]: zero },
    { ['lag' + which]: { ...zero, [part]: 10 }, ['base' + which]: zero }, which, D.params[key].v, D).part, part);
}
const migration = U.migrationReason({ from: 'pyeongtaek', to: 'hwaseong', why: '공기가 나빠서', whyGrade: 'G' });
has(migration, /시작 대비 변화/); report.observations.migration = migration;
const scores = K.econ.score(state.econ);
for (const r of scores.rank) {
  const weights = D.params.wScore.v;
  const geometric = Math.exp(Object.entries(weights).reduce((s, [k, w]) => s + w * Math.log(Math.max(D.params.scorePartFloor.v, r.parts[k])), 0) / Object.values(weights).reduce((a, b) => a + b, 0));
  near(r.score, Math.round(Math.min(100, Math.max(0, geometric + r.coop)) * 10) / 10);
}
// D-82: 31일→28일 월합계는 달라도 하루 평균은 동일.
const result = round => ({ round, days: 7, team: { pyeongtaek: { uns: 0, imp: 0, sub: 0, isolated: { uns: 70 } } } });
const prev = result(1), curr = result(2);
const grid = U.gridReliance({ region: 'south', rounds: [{ days: 7, mdays: 31 }, { days: 7, mdays: 28 }], results: [prev, curr] }, curr, 'pyeongtaek');
near(grid.delta, -30); near(grid.deltaPerDay, 0); report.observations.grid = grid;
const facts = D.thermalFacts;
for (const fuel of ['coal', 'lng', 'smr']) {
  const info = A.thermalToolInfo(fuel);
  const keys = fuel === 'smr' ? ['siting'] : [...(fuel === 'coal' ? ['coalScenario'] : []), 'capex', 'pm', 'siting'];
  for (const key of keys) eq(info.includes(facts[key].text), true);
}
for (const [fuel, key] of [['coal', 'coalBuild'], ['lng', 'lngBuild']]) {
  const f = facts[key], [sy, sm] = f.start.split('-').map(Number), [ey, em] = f.end.split('-').map(Number);
  eq(f.months, (ey - sy) * 12 + em - sm); eq(f.gameTurns, 0);
  has(f.text, new RegExp('약 ' + f.months + '개월'));
  has(facts.capex.text, new RegExp(facts.capex[fuel].toLocaleString('en-US') + '달러'));
  eq(f.realMW, D.params.thermalMW.v[fuel]); eq(facts.capex[fuel], D.params.thermalCapex.v[fuel]);
  near(B.BLD[fuel].mw, f.realMW / region.mwScale);
  near(B.BLD[fuel].cost, f.realMW / region.mwScale * T.params.smrCostBase.v / T.params.smrCapexBase.v * facts.capex[fuel]);
  const ratio = facts.pm[fuel + 'New'] / facts.pm[fuel + 'Reference'];
  near(D.params.pmNewFuelW.v[fuel] / D.params.pmFuelW.v[fuel], ratio);
  has(facts.pm.text, new RegExp('약 ' + Math.round(ratio * 100) + '%'));
  report.thermal[fuel] = { realMW: f.realMW, months: f.months, gameTurns: f.gameTurns,
    mw: B.BLD[fuel].mw, cost: B.BLD[fuel].cost, ratio, weight: D.params.pmNewFuelW.v[fuel] };
}
has(facts.siting.text, new RegExp('지도 ' + (D.params.sitingWeights.v.length - 1) + '칸'));
has(sources.build, /급전 순서: 재생 → 배터리 → 도시 급전원\(.*\) → 이웃 거래/);
has(sources.build, /"급전 순서: 재생 → 배터리 → 연료 가격·탄소세에 따라 싼 급전원부터/);
// D08: 냉각수 거절은 석탄·LNG·SMR 공통, 문구는 해안·하천
has(sources.build, /\["smr", "lng", "coal"\]\.includes\(type\) && T\.t !== "river" && T\.t !== "beach"\) return "냉각수: 해안·하천만"/);
// V60: lng_spike는 LNG 전부, 디젤·석탄은 fuelMul^0.6 — 문장이 세 연료를 모두 말해야 한다
{ const ev = D.intl.events.find(e => e.id === 'lng_spike');
  has(ev.text, /LNG.*가장/); has(ev.text, /디젤/); has(ev.text, /석탄/);
  has(sources['league-core'], /coal: Math\.pow\(I\.fuelMul, 0\.6\)/); }
eq(facts.coalScenario.hypothetical, true); has(facts.coalScenario.text, /2040.*가정/);
const p = { builds: [], lines: [], policies: [], missions: [] };
B.PACKS.audit = { id: 'audit', budget: 1000, rows: ['bbbbbbbbb'], legend: { b: 'beach' }, attachAny: true,
  climate: B.PACKS.pyeongtaek.climate, goals: { costBase: 100, costPerDay: 1, co2Day: 100 },
  groups: [{ id: 'thermal', tools: ['coal', 'lng', 'diesel'] }], sites: [{ kind: 'city', c: 0, r: 0, dem: { base: 1 } }] };
region.teams.push({ id: 'audit', pack: 'audit' }); B.selectPack('audit', 'league');
const st = fake(true); st.st = p;
report.observations.siting = [];
for (const fuel of ['coal', 'lng', 'smr']) for (const distance of [1, 2, 3, 4]) {
  const plan = { ...p, builds: [{ t: fuel, i: distance }] };
  const points = B.complaints(plan, [0]).items.reduce((s, x) => s + x.pts, 0);
  near(points, 10 * ([0, 1, .6, .3][distance] || 0));
  near(B.complaints(plan, [1]).items.reduce((s, x) => s + x.pts, 0), points);
  const advice = A.placementAdvice(fuel, distance);
  has(advice.join(' '), new RegExp('민원 \\+' + (points >= 5 ? 1 : 0) + '건'));
  has(advice.join(' '), /가동과 무관/);
  report.observations.siting.push({ fuel, distance, points, advice });
}
// 실제 연구 상태·건설비·PM과 문구는 기본값에서 일치해도 변형 추종은 별도 문제다.
const before = facts.capex.text, saved = D.params.thermalCapex.v.coal;
D.params.thermalCapex.v.coal = 2000; B.selectPack('audit', 'league');
eq(facts.capex.text, before); near(B.BLD.coal.cost, 1040 / region.mwScale * (7.5 / 4500) * 2000);
report.observations.capexMutation = { textUnchanged: true, changedCost: B.BLD.coal.cost };
D.params.thermalCapex.v.coal = saved;
report.locations = {
  B05: loc('build', '소수력은 평균 출력 계수'), B06: loc('build', '[...plants.map'),
  B09: loc('build', 'LG ? `급전 순서'), B19: loc('build', 'const D = dispOf("diesel"), fuel'),
  B20: loc('build', 'id: "dr", name:'), B26: loc('build', '공장 증설 수요 정의 없음'),
  thermal: loc('econ-data', 'thermalFacts: {'), tool: loc('build', 'function thermalToolInfo'),
  placement: loc('build', 'function placementAdvice'), construction: loc('league', 'function buildLeadHTML')
};
report.checks = checks;
if (process.argv.includes('--detail')) console.log(JSON.stringify(report));
else console.log(JSON.stringify({ head: report.head, workingHead, uiDirty: report.uiDirty, checks, failures: 0, packs: Object.keys(report.packs).length,
  cards: report.cards.length, events: report.events.length, groups: Object.keys(report.groups).length,
  thermal: report.thermal, gridDeltaPerDay: grid.deltaPerDay, capexMutation: report.observations.capexMutation }));
